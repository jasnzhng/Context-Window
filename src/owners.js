// Whose things are near the visitor. Devices are named after their owners
// ("Jason's AirPods Pro", "iPhone de Marie"), and the browser hands those
// names over: the Bluetooth device the visitor picked at the opening, and
// the labels of every camera, microphone and speaker once a permission is
// granted (an iPhone shows up as a camera through Continuity Camera).
//
// The opening asks for both, once, at the start (see lookAround). After
// that, devicechange tells us when something connects mid-visit.

// What a device can be called, after the owner's name or before it.
const DEVICE =
  "iPhone|iPad|iPod|AirPods|AirTag|Apple Watch|Watch|MacBook|iMac|Mac mini|Mac|Galaxy|Pixel|Buds|Beats|Headphones|Phone|Laptop|PC";
const NAME = "([\\p{L}][\\p{L}.\\-]{0,24})";
// "Jason's AirPods", "Jason’s 2nd iPhone"
const MINE = new RegExp(
  `${NAME}['’‘]s\\s+(?:[\\p{L}\\d]+\\s+)?(${DEVICE})\\b`,
  "iu",
);
// "AirPods Pro de Jason", "iPhone von Jason"
const THEIRS = new RegExp(
  `(${DEVICE})(?:\\s+[\\p{L}\\d]+)?\\s+(?:de|von|di|van|da)\\s+${NAME}`,
  "iu",
);
const PLURAL = /^(airpods|buds|beats|headphones)$/i;

// { name, device, plural } from one device label, or null if it has no owner.
export function owner(label) {
  if (!label) return null;
  let name, device;
  const mine = label.match(MINE);
  const theirs = label.match(THEIRS);
  if (mine) [, name, device] = mine;
  else if (theirs) [, device, name] = theirs;
  else return null;
  return {
    name: name.toLowerCase(),
    device: device.toLowerCase(),
    plural: PLURAL.test(device),
  };
}

// Every owner the browser will tell us about right now, one entry per name.
// `nearby` is the Bluetooth device's name, saved in the visit at the opening.
export async function owners(nearby) {
  const labels = [nearby];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    labels.push(...devices.map((d) => d.label));
  } catch {
    // no mediaDevices on an insecure origin
  }
  const found = new Map();
  for (const label of labels) {
    const who = owner(label);
    if (who && !found.has(who.name)) found.set(who.name, who);
  }
  return [...found.values()];
}

// Calls `listener` whenever a camera, microphone or speaker comes or goes.
export function onDevices(listener) {
  const media = navigator.mediaDevices;
  media?.addEventListener("devicechange", listener);
  return () => media?.removeEventListener("devicechange", listener);
}

// Asked once, at the opening, inside the click on [yes]. Web Bluetooth's
// picker only opens straight from a click, so it goes first (Chrome and
// Edge; other browsers don't have it). Then the microphone, which turns off
// again at once: nothing is recorded, but with the permission granted every
// browser hands over its device labels. Resolves to the picked device's
// name, or null.
export async function lookAround() {
  const picked = navigator.bluetooth
    ?.requestDevice({ acceptAllDevices: true })
    .then((device) => device.name ?? null)
    .catch(() => null);
  const name = (await picked) ?? null;
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach((track) => track.stop());
  } catch {
    // said no; whatever labels the camera unlocked will have to do
  }
  return name;
}
