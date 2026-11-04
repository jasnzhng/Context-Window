// A readout, on every page, of what this site can see about the visitor
// without asking, plus whatever they've since agreed to. The house forgets
// the visitor; the browser never does, so nothing here decays.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { getStream, onCamera } from "./camera.js";
import { getBlinks, getPresence, onBlink, onPresence } from "./presence.js";
import { getListening, onListening, wordCount } from "./listen.js";

// The mic's loudness as a number and a bar: -60 dB and below is empty, 0 dB
// (as loud as the mic goes) is full.
function micLine({ on, level }) {
  if (!on) return null;
  if (level === null) return "listening, no level";
  const cells = Math.round(Math.min(1, Math.max(0, (level + 60) / 60)) * 12);
  return `${Math.round(level)} dB ${"█".repeat(cells)}${"░".repeat(12 - cells)}`;
}
import { absence } from "./away.js";
import { loadVisit } from "./visit.js";

// Facts that don't change during a visit: looked up once, shared by every
// page. Each resolves on its own, so a slow one doesn't hold up the rest.
const once = {
  ip: fetch("/api/whoami")
    .then((response) => response.json())
    .catch(() => ({})),
  agent: highEntropy(),
  gpu: Promise.resolve(gpu()),
  storage: navigator.storage?.estimate?.().catch(() => null),
};

async function highEntropy() {
  try {
    return await navigator.userAgentData.getHighEntropyValues([
      "platformVersion",
      "architecture",
      "bitness",
      "model",
      "fullVersionList",
    ]);
  } catch {
    return null; // Firefox and Safari don't have userAgentData
  }
}

function gpu() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  } catch {
    return null;
  }
}

// The OS, from the client hints where the browser has them (they carry the
// real macOS version; the user agent string has said 10.15.7 for years).
function os(hints) {
  const ua = navigator.userAgent;
  const platform = navigator.userAgentData?.platform;
  if (hints?.platformVersion && platform) {
    const major = Number(hints.platformVersion.split(".")[0]);
    if (platform === "Windows")
      return major >= 13 ? "Windows 11" : "Windows 10";
    const arch = hints.architecture
      ? ` (${hints.architecture}${hints.bitness ? `-${hints.bitness}` : ""})`
      : "";
    return `${platform} ${hints.platformVersion}${arch}`;
  }
  const version = (re) => ua.match(re)?.[1].replaceAll("_", ".");
  if (/iPhone|iPad/.test(ua)) return `iOS ${version(/OS ([\d_]+)/)}`;
  if (/Android/.test(ua)) return `Android ${version(/Android ([\d.]+)/)}`;
  if (/Mac OS X/.test(ua)) return `macOS ${version(/Mac OS X ([\d_.]+)/)}`;
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return navigator.platform || "unknown";
}

function browser(hints) {
  const brands = (hints?.fullVersionList ?? []).filter(
    ({ brand }) => !/Not.?A.?Brand|Chromium/.test(brand),
  );
  if (brands.length) return `${brands[0].brand} ${brands[0].version}`;
  const ua = navigator.userAgent;
  for (const [name, re] of [
    ["Edge", /Edg\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ]) {
    const match = ua.match(re);
    if (match) return `${name} ${match[1]}`;
  }
  return ua;
}

// Answers that can change while the visitor watches: battery and
// permissions. (Device names aren't listed: whoareyou.jsx asks about them.) Read again every few seconds.
async function changing() {
  const facts = {};
  try {
    const b = await navigator.getBattery();
    facts.battery = `${Math.round(b.level * 100)}%${b.charging ? ", charging" : ""}`;
  } catch {
    // Chromium only
  }
  const asked = {};
  for (const name of ["camera", "microphone", "geolocation", "notifications"]) {
    try {
      asked[name] = (await navigator.permissions.query({ name })).state;
    } catch {
      // Firefox doesn't know some of these names
    }
  }
  facts.permissions = Object.entries(asked)
    .map(([name, state]) => `${name} ${state}`)
    .join(", ");
  return facts;
}

const duration = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

function faceLine(presence, stream, visit) {
  if (visit?.forgotFace) return "forgotten";
  if (!stream) return "camera off";
  if (!presence.ready || presence.faces === null) return "looking...";
  if (presence.faces > 1) return `${presence.faces} faces. who is that?`;
  if (presence.faces === 1) {
    return presence.looking ? "you, watching" : "you, looking away";
  }
  return `gone ${duration(Date.now() - presence.awaySince)}`;
}

// How many times, how often in the last minute, and how long since the last.
function blinkLine(blinks, presence, now) {
  if (!presence.ready || presence.faces === null) return null;
  if (!blinks.count) return "not yet";
  const rate = blinks.recent.filter((t) => now - t < 60 * 1000).length;
  const since = ((now - blinks.last) / 1000).toFixed(1);
  return `${blinks.count} · ${rate}/min · last ${since}s ago`;
}

export default function Exposed() {
  const [known, setKnown] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [cursor, setCursor] = useState(null);
  const stream = useSyncExternalStore(onCamera, getStream);
  const presence = useSyncExternalStore(onPresence, getPresence);
  const blinks = useSyncExternalStore(onBlink, getBlinks);
  const listening = useSyncExternalStore(onListening, getListening);
  useLocation(); // re-render on every page, to re-read the visit
  const visit = loadVisit();

  useEffect(() => {
    let live = true;
    const learn = (facts) => live && setKnown((k) => ({ ...k, ...facts }));
    once.ip.then((r) => learn({ ip: r.ip, accept: r.language }));
    once.agent.then((hints) =>
      learn({ os: os(hints), browser: browser(hints), model: hints?.model }),
    );
    once.gpu.then((gpu) => learn({ gpu }));
    once.storage?.then((s) =>
      learn({ quota: s && `${(s.quota / 1e9).toFixed(0)} GB` }),
    );

    const refresh = () => changing().then(learn);
    refresh();
    const slow = setInterval(refresh, 5000);
    const fast = setInterval(() => setNow(Date.now()), 1000);
    const move = (e) => setCursor(`${e.clientX}, ${e.clientY}`);
    window.addEventListener("pointermove", move);
    return () => {
      live = false;
      clearInterval(slow);
      clearInterval(fast);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const net = navigator.connection;
  const away = absence.totalMs + (absence.since ? now - absence.since : 0);
  const where = visit?.where;

  const rows = [
    ["ip", known.ip],
    ["os", known.os],
    ["device", known.model],
    ["browser", known.browser],
    ["gpu", known.gpu],
    [
      "screen",
      `${screen.width}×${screen.height} @${devicePixelRatio}x, ${screen.colorDepth}-bit`,
    ],
    ["window", `${innerWidth}×${innerHeight}`],
    ["cpu", `${navigator.hardwareConcurrency} cores`],
    ["memory", navigator.deviceMemory && `≥${navigator.deviceMemory} GB`],
    ["disk quota", known.quota],
    ["battery", known.battery],
    [
      "network",
      net && `${net.effectiveType}, ${net.downlink} Mbps, ${net.rtt} ms`,
    ],
    ["time", `${new Date(now).toLocaleTimeString()} (${tz})`],
    ["languages", navigator.languages.join(", ")],
    [
      "prefers",
      `${matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"} mode${
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? ", less motion"
          : ""
      }`,
    ],
    [
      "touch",
      navigator.maxTouchPoints ? `${navigator.maxTouchPoints} points` : "none",
    ],
    ["cursor", cursor],
    ["this tab", `${history.length} pages deep`],
    ["came from", document.referrer || null],
    ["permissions", known.permissions],
    [
      "location",
      where &&
        `${where.lat.toFixed(5)}, ${where.lon.toFixed(5)} ±${where.accuracy}m`,
    ],
    ["address", where?.place?.display],
    ["face", faceLine(presence, stream, visit)],
    ["blinks", stream && blinkLine(blinks, presence, now)],
    ["mic", micLine(listening)],
    [
      "heard",
      listening.on && `${wordCount()} words, ${listening.heard.length} phrases`,
    ],
    [
      "left us",
      absence.leaves ? `${absence.leaves}× for ${duration(away)}` : null,
    ],
    ["holding", visit?.carrying && `"${visit.carrying}"`],
    [
      "name",
      visit?.name
        ? `${visit.name} (you said so)`
        : visit?.notName && `not ${visit.notName}?`,
    ],
  ].filter(([, value]) => value);

  return (
    <aside className="exposed" aria-label="what this site can see">
      <p className="prompt">~ $ whoami --all</p>
      <dl>
        {rows.map(([label, value], i) => (
          <div key={label} style={{ "--i": i }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
