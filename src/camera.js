// The webcam, kept on for the whole visit once the visitor lets us peek.
// One frame goes to Claude, once, as room 1 starts loading (see snapFrame);
// nothing else is recorded or sent. A stream can't be saved in
// sessionStorage, so it lives here, in memory, for as long as the tab does.
// main.jsx restarts it after a reload.
let stream = null;

// Resolves to the stream, or null if the visitor (or the browser) says no.
export async function startCamera() {
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    stream = null;
  }
  return stream;
}

export function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

// The longest side of the snapshot. Claude doesn't need more to see a room,
// and a small JPEG keeps the request small and the room fast.
const SNAP_SIZE = 768;

// Takes one picture from the webcam and returns it as base64 JPEG (no
// "data:" prefix), or null if there's no camera. The picture is never
// stored; the caller sends it and lets it go.
export async function snapFrame() {
  const live = await startCamera();
  if (!live) return null;
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = live;
    await video.play();
    // play() can resolve before a real frame is decoded; wait for one.
    if (video.requestVideoFrameCallback) {
      await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
    }

    const scale = Math.min(
      1,
      SNAP_SIZE / Math.max(video.videoWidth, video.videoHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    video.srcObject = null; // detach; the stream itself stays on

    return canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
  } catch {
    return null;
  }
}
