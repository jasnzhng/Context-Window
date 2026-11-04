// The webcam, kept on for the whole visit once the visitor lets us peek.
// Nothing records or sends the picture; the light being on is the point.
// A stream can't be saved in sessionStorage, so it lives here, in memory,
// for as long as the tab does. main.jsx restarts it after a reload.
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
