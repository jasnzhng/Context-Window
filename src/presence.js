// Watches the webcam for faces, on this device, about 15 times a second.
// MediaPipe's face landmarker loads from a CDN the first time the camera
// comes on; the picture itself never leaves the browser.
//
// From the landmarks it knows how many faces there are, whether the visitor
// is looking at the screen (head not turned away, eyes not shut), and every
// time they blink. If nobody is in front of the camera for FORGET_MS, the
// house turns the camera off and forgets what the visitor looks like for the
// rest of the visit. room.jsx reacts to shorter absences and to a second face;
// uninterested.jsx to looking away; glitch.js and the panel to blinks.
import { getStream, onCamera, stopCamera } from "./camera.js";
import { loadVisit, saveVisit } from "./visit.js";

const MEDIAPIPE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
// A blink lasts 100 to 300 ms, so the camera has to be read often enough to
// land inside one. The rest of the state is published less often (PUBLISH_MS),
// which is all the face brackets and the panel need.
const EVERY_MS = 66;
const PUBLISH_MS = 400;
export const AWAY_MS = 10 * 1000;
const FORGET_MS = 60 * 1000;

// Eyes count as shut above CLOSED and open again below OPEN; the gap keeps
// one blink from counting twice. These are MediaPipe's eyeBlink blendshapes.
const CLOSED = 0.5;
const OPEN = 0.3;
// Not looking for this long, and the house notices (uninterested.jsx).
// Looking back is noticed at once.
const LOOK_AWAY_MS = 1500;
// Where the nose sits between the edges of the face, side to side (0.5 is
// straight on, so this is the closest it may get to either edge) and top to
// bottom. Past these, the head is turned away.
const YAW = 0.22;
const PITCH = [0.25, 0.82];

// faces: how many are in view, or null when the camera is off.
// awaySince: when the last face left (null while someone is there).
// boxes: each face as fractions of the frame, and aspect: the frame's width
// over height, so the check-in window can put brackets on the faces.
// looking: false once the visitor has been gone, turned away or had their
// eyes shut for LOOK_AWAY_MS (null when the camera is off).
let state = {
  faces: null,
  awaySince: null,
  boxes: [],
  aspect: 4 / 3,
  ready: false,
  looking: null,
};
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const getPresence = () => state;

export function onPresence(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Every blink this visit: how many, and when (the last minute's worth, for
// the rate). A store of its own, because it changes at a different pace.
let blinks = { count: 0, last: null, recent: [] };
const blinkListeners = new Set();

export const getBlinks = () => blinks;

export function onBlink(listener) {
  blinkListeners.add(listener);
  return () => blinkListeners.delete(listener);
}

function blinked(now) {
  blinks = {
    count: blinks.count + 1,
    last: now,
    recent: [...blinks.recent.filter((t) => now - t < 60 * 1000), now],
  };
  blinkListeners.forEach((listener) => listener());
}

let landmarker = null; // a promise, so the model loads only once
function loadLandmarker() {
  landmarker ??= import(
    /* webpackIgnore: true */ `${MEDIAPIPE}/vision_bundle.mjs`
  )
    .then(async ({ FaceLandmarker, FilesetResolver }) => {
      const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
      return FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 4,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
      });
    })
    .catch((error) => {
      console.log("face landmarker failed to load", error);
      landmarker = null;
      return null;
    });
  return landmarker;
}

// A face's box, from the extremes of its landmarks (already fractions).
function box(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Whether a face is pointed at the screen: the nose tip (1) stays near the
// middle between the sides of the face (234, 454) and between the forehead
// (10) and the chin (152).
function facing(points) {
  const [nose, left, right, top, chin] = [1, 234, 454, 10, 152].map(
    (i) => points[i],
  );
  const yaw = (nose.x - left.x) / (right.x - left.x);
  const pitch = (nose.y - top.y) / (chin.y - top.y);
  const side = Math.min(yaw, 1 - yaw); // works whichever side is "left"
  return side > YAW && pitch > PITCH[0] && pitch < PITCH[1];
}

// How shut the visitor's eyes are, 0 to 1, from the blendshapes.
function shut(shapes) {
  const score = (name) =>
    shapes?.categories.find((c) => c.categoryName === name)?.score ?? 0;
  return (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2;
}

let timer = null;

// Starts watching whenever the camera is on, and stops when it goes off.
// Called once, from main.jsx.
export function startPresence() {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;

  async function follow() {
    clearTimeout(timer);
    const stream = getStream();
    if (!stream) {
      video.srcObject = null;
      return set({ faces: null, awaySince: null, boxes: [], looking: null });
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const faces = await loadLandmarker();
    if (!faces || getStream() !== stream) return;
    set({ ready: true, awaySince: Date.now(), looking: true });
    watch(faces, stream);
  }

  function watch(faces, stream) {
    let closed = false; // the visitor's eyes, right now
    let notLookingSince = null;
    let published = 0;

    function tick() {
      if (getStream() !== stream) return;
      // A hidden tab has its own way of noticing (see away.js); save the CPU.
      if (!document.hidden && video.readyState >= 2) {
        const result = faces.detectForVideo(video, performance.now());
        const now = Date.now();
        const points = result.faceLandmarks;
        // The first face is the visitor; the blendshapes come in the same order.
        const eyes = points.length ? shut(result.faceBlendshapes[0]) : 0;

        if (!closed && eyes > CLOSED) {
          closed = true;
          blinked(now);
        } else if (closed && eyes < OPEN) {
          closed = false;
        }

        // Looking means a face, turned this way, eyes open. A blink is too
        // short to count as looking away; LOOK_AWAY_MS takes care of that.
        const lookingNow = points.length > 0 && facing(points[0]) && !closed;
        notLookingSince = lookingNow ? null : (notLookingSince ?? now);
        const looking =
          !notLookingSince || now - notLookingSince < LOOK_AWAY_MS;

        const awaySince = points.length ? null : (state.awaySince ?? now);
        const changed =
          points.length !== state.faces || looking !== state.looking;
        if (changed || now - published >= PUBLISH_MS) {
          published = now;
          set({
            faces: points.length,
            awaySince,
            boxes: points.map(box),
            aspect: video.videoWidth / video.videoHeight,
            looking,
          });
        }

        if (awaySince && now - awaySince > FORGET_MS) return forgetFace();
      }
      timer = setTimeout(tick, EVERY_MS);
    }
    tick();
  }

  onCamera(follow);
  follow();
}

// Gone too long: the camera goes off and stays off for this visit.
function forgetFace() {
  const visit = loadVisit();
  if (visit) {
    visit.peek = false;
    visit.forgotFace = true;
    saveVisit(visit);
  }
  stopCamera();
}
