// Listening, only if the visitor said yes at the opening (after the privacy
// notice laid it out). Speech is transcribed on this device by the browser's
// own recognizer; it never falls back to a cloud recognizer, so a browser
// without on-device support simply doesn't listen. The mic's loudness is
// measured here too, for the panel, and never leaves the device.
//
// The transcript lives in this module's memory only: not in sessionStorage,
// not on the server. A few phrases go out with each room request (see
// room.jsx), and stopping, reloading or closing the tab forgets all of it.
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const OPTIONS = { langs: ["en-US"], processLocally: true };
const KEEP = 200; // phrases held at most
const LEVEL_MS = 200;

// on: listening right now. level: the mic's loudness in dBFS (about -100
// for silence up to 0), or null. heard: every phrase so far, oldest first.
let state = { on: false, level: null, heard: [] };
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const getListening = () => state;

export function onListening(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Whether this browser can transcribe on the device. Needs both the
// availability check and the processLocally property: setting a property a
// browser doesn't know does nothing, and the audio would go to a server.
export const canListen = () =>
  Boolean(Recognition?.available && "processLocally" in Recognition.prototype);

// From the opening's [yes] click: checks on-device support and downloads
// the language pack if needed. Resolves to true if listening can start.
export async function prepareListening() {
  if (!canListen()) return false;
  try {
    const status = await Recognition.available(OPTIONS);
    if (status === "unavailable") return false;
    if (status !== "available") return await Recognition.install(OPTIONS);
    return true;
  } catch {
    return false;
  }
}

let recognition = null;
let mic = null; // the stream the level meter reads
let audio = null;
let timer = null;

export async function startListening() {
  if (state.on || !canListen()) return false;

  recognition = new Recognition();
  recognition.lang = OPTIONS.langs[0];
  recognition.processLocally = true;
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const text = result[0].transcript.trim();
    if (!result.isFinal || !text) return;
    set({ heard: [...state.heard, { text, at: Date.now() }].slice(-KEEP) });
  };
  // It stops by itself after a silence; keep it going while listening is on.
  recognition.onend = () => {
    if (!state.on) return;
    try {
      recognition.start();
    } catch {
      stopListening();
    }
  };
  recognition.onerror = (event) => {
    if (
      event.error === "not-allowed" ||
      event.error === "language-not-supported"
    ) {
      stopListening();
    }
  };

  try {
    recognition.start();
  } catch {
    recognition = null;
    return false;
  }
  set({ on: true });
  startMeter();
  return true;
}

// The level meter: the mic's RMS, in decibels relative to full scale.
async function startMeter() {
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return; // listening still works; the panel just has no level
  }
  if (!state.on) return mic.getTracks().forEach((track) => track.stop());
  audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  audio.createMediaStreamSource(mic).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const measure = () => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(
      samples.reduce((sum, x) => sum + x * x, 0) / samples.length,
    );
    set({ level: Math.max(-100, 20 * Math.log10(rms || 1e-5)) });
  };
  timer = setInterval(measure, LEVEL_MS);
}

// Turns everything off and forgets every word.
export function stopListening() {
  const was = recognition;
  recognition = null;
  set({ on: false, level: null, heard: [] });
  try {
    was?.abort();
  } catch {
    // already stopped
  }
  clearInterval(timer);
  mic?.getTracks().forEach((track) => track.stop());
  audio?.close().catch(() => {});
  mic = audio = null;
}

const words = (text) => text.split(/\s+/).filter(Boolean);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const wordCount = () =>
  state.heard.reduce((sum, { text }) => sum + words(text).length, 0);

// A few random phrases, for the next room's prompt.
export function overheard(count = 2) {
  return state.heard
    .toSorted(() => Math.random() - 0.5)
    .slice(0, count)
    .map(({ text }) => text);
}

// A run of 5 to 14 words from one thing the visitor said, for "what did you
// mean by that?". Null until there's a phrase long enough to quote.
export function snippet() {
  const long = state.heard
    .map(({ text }) => words(text))
    .filter((w) => w.length >= 5);
  if (!long.length) return null;
  const phrase = pick(long);
  const length = Math.min(phrase.length, 5 + Math.floor(Math.random() * 10));
  const start = Math.floor(Math.random() * (phrase.length - length + 1));
  return phrase.slice(start, start + length).join(" ");
}
