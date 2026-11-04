// Watches the webcam for faces, on this device, a few times a second.
// MediaPipe's face detector loads from a CDN the first time the camera comes
// on; the picture itself never leaves the browser.
//
// If nobody is in front of the camera for FORGET_MS, the house turns the
// camera off and forgets what the visitor looks like for the rest of the
// visit. room.jsx reacts to shorter absences and to a second face.
import { getStream, onCamera, stopCamera } from "./camera.js";
import { loadVisit, saveVisit } from "./visit.js";

const MEDIAPIPE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const EVERY_MS = 400;
export const AWAY_MS = 10 * 1000;
const FORGET_MS = 60 * 1000;

// faces: how many are in view, or null when the camera is off.
// awaySince: when the last face left (null while someone is there).
// boxes: each face as fractions of the frame, and aspect: the frame's width
// over height, so the check-in window can put brackets on the faces.
let state = {
  faces: null,
  awaySince: null,
  boxes: [],
  aspect: 4 / 3,
  ready: false,
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

let detector = null; // a promise, so the model loads only once
function loadDetector() {
  detector ??= import(
    /* webpackIgnore: true */ `${MEDIAPIPE}/vision_bundle.mjs`
  )
    .then(async ({ FaceDetector, FilesetResolver }) => {
      const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
      return FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
    })
    .catch((error) => {
      console.log("face detector failed to load", error);
      detector = null;
      return null;
    });
  return detector;
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
      return set({ faces: null, awaySince: null, boxes: [] });
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const faces = await loadDetector();
    if (!faces || getStream() !== stream) return;
    set({ ready: true, awaySince: Date.now() });
    tick(faces, stream);
  }

  function tick(faces, stream) {
    if (getStream() !== stream) return;
    // A hidden tab has its own way of noticing (see away.js); save the CPU.
    if (!document.hidden && video.readyState >= 2) {
      const { detections } = faces.detectForVideo(video, performance.now());
      const now = Date.now();
      const boxes = detections.map(({ boundingBox: b }) => ({
        x: b.originX / video.videoWidth,
        y: b.originY / video.videoHeight,
        w: b.width / video.videoWidth,
        h: b.height / video.videoHeight,
      }));
      const awaySince = boxes.length ? null : (state.awaySince ?? now);
      const aspect = video.videoWidth / video.videoHeight;
      set({ faces: boxes.length, awaySince, boxes, aspect });

      if (awaySince && now - awaySince > FORGET_MS) return forgetFace();
    }
    timer = setTimeout(() => tick(faces, stream), EVERY_MS);
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
