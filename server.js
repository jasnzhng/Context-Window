// Serves the React app and asks Claude for each room. The API key stays here,
// never in the browser. Run with: npm start
import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { PLANS } from "./src/plans.js";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env
const app = express();

// On Render there are two proxies between the visitor and this server, and
// each adds an address to X-Forwarded-For. Trusting that many hops makes req.ip
// the visitor's address, so the limits below are per visitor. With too few,
// req.ip is one of Render's internal 10.x addresses and every visitor shares a
// bucket; with too many, it is whatever the visitor typed into the header, and
// the limits can be dodged. After changing this, open /api/whoami from a known
// address to check. TRUST_PROXY overrides the count without a code change.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 2));

// Every room costs a Claude call, so cap how fast one visitor can spend them.
// 40 rooms in 10 minutes is far more than anyone reads; a script hits it fast.
const roomLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const SYSTEM = `You are the narrator of a house the visitor is walking through, one room
at a time. Write in second person, present tense, with total confidence,
as if you have always known this house and this visitor. Be concrete:
name specific objects, colors, materials and people. Never say you are an
AI. Never mention memory, context, or uncertainty. Never ask questions.
Return only JSON that matches the schema you are given.`;

// Placeholders only: an example filename here would show up in every room.
// The layouts come from src/plans.js, so a new plan shows up here on its own.
const SCHEMA = `Respond with JSON only, in this shape:
{"narration": "<2 to 4 sentences, at most 70 words>", "layout": "<one layout name from the list below>", "objects": [{"name": "<filename>", "note": "<what the visitor finds when they open it, 1 to 2 sentences>"}]}
Include 3 to 4 objects. Each name is a lowercase filename using only a-z, 0-9 and underscores, ending in .png, .jpg, .gif, .txt, .mp3 or .pdf.
For layout, pick the one closest to where this room is:
${Object.entries(PLANS)
  .map(([name, { hint }]) => `- ${name}: ${hint}`)
  .join("\n")}`;

// 0 in the first room, then climbing toward 1 forever: half the house is gone
// after halfLife rooms, three quarters after twice that, and so on. The
// browser gets it with each room and decays the room to match.
const progress = (room) => 1 - 0.5 ** ((room - 1) / config.halfLife);

// How much of room 1 can still reach this room's prompt. Rooms 1 and 2 see it
// whole; from room 3 on, blur() keeps only 1 - p of the previous narration's
// words, and the losses compound. With halfLife 4: 100%, 100%, 71%, 42%, 21%,
// 9%, 3%... This is the context bar, and it sets the drift.
function context(room) {
  let left = 1;
  for (let k = 3; k <= room; k++) left *= 1 - progress(k);
  return left;
}

// How far the next room may wander from the last, bolder as context runs out.
// Room 2 follows on, 3 slips, 4 barely connects, 5+ anywhere.
function drift(c) {
  if (c > 0.9) return "The next room follows naturally from the previous one.";
  if (c > 0.5) {
    return "The next room mostly follows from the previous one, but something impossible has crept in.";
  }
  if (c > 0.3) {
    return "The next room barely connects to the previous one: keep one detail and let everything else turn into somewhere else.";
  }
  return "The next room has nothing to do with the previous one. Invent a completely different place: another planet, another century, the inside of something, the bottom of the sea, anywhere. The only link is one stray word.";
}

// Blanks out a share p of the words, so the narrator has to fill the gaps.
function blur(text, p) {
  return text
    .split(" ")
    .map((word) => (Math.random() < p ? "..." : word))
    .join(" ")
    .replace(/(\.\.\.)( \.\.\.)+/g, "...");
}

// The forgetting lives here. Room 1 sees the answer, room 2 sees room 1 and the
// answer, and room 3 on sees only a worn copy of the previous room and what
// was clicked, plus how far it may wander.
// What the visitor said out loud, if they let the house listen (listen.js):
// a few phrases transcribed on their device, and their answer to "what did
// you mean by that?". Both are capped here, whatever the browser sends.
const said = (text, max) =>
  String(text ?? "")
    .replace(/["\n]/g, " ")
    .trim()
    .slice(0, max);

function heard(overheard, meant) {
  const phrases = (Array.isArray(overheard) ? overheard : [])
    .slice(0, 3)
    .map((phrase) => said(phrase, 150))
    .filter(Boolean);
  let text = "";
  if (phrases.length) {
    text += `\nThe visitor said these out loud while walking through the house: ${phrases.map((p) => `"${p}"`).join(", ")}. Let one of them surface in this room, changed, without saying that they said it.`;
  }
  const snippet = said(meant?.snippet, 150);
  const reply = said(meant?.answer, 300);
  if (snippet && reply) {
    text += `\nThe visitor was asked what they meant when they said "${snippet}", and answered: "${reply}". Build this room around that answer.`;
  }
  return text;
}

function userMessage({
  room,
  answer,
  importance,
  narration,
  clicked,
  clickedNote,
  where,
  carrying,
  overheard,
  meant,
}) {
  // Real things from outside the house, both optional. The browser has
  // already blurred `where` to match how much this room remembers.
  const outside =
    (where
      ? `\nWhere the visitor's body really is right now: ${where}. Let this real place bleed into the room without explaining it.`
      : "") +
    (carrying
      ? `\nThe visitor brought this in from outside the house: "${String(carrying).slice(0, 300)}". Make it one of this room's objects.`
      : "") +
    heard(overheard, meant);
  if (room === 1) {
    return `The visitor was asked: "${config.question}" and answered: "${answer}". It matters to them ${importance} out of 10.${outside}\nDescribe the first room.\n\n${SCHEMA}`;
  }
  const p = progress(room);
  const previous = room === 2 ? narration : blur(narration, p);
  const original =
    room === 2 ? `\nThe visitor originally answered: "${answer}"` : "";
  return `Previous room: ${previous}\nThe visitor went further through: ${clicked} (${clickedNote})${original}${outside}\n${drift(context(room))}\nDescribe the next room.\n\n${SCHEMA}`;
}

function parseReply(text) {
  const room = JSON.parse(
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  );
  assert(typeof room.narration === "string");
  assert(room.objects.length >= 3 && room.objects.length <= 4);
  for (const { name } of room.objects) {
    assert(/^[a-z0-9_]+\.(png|jpg|gif|txt|mp3|pdf)$/.test(name));
  }
  // A place the plans don't cover is drawn as nowhere.
  const layout = Object.hasOwn(PLANS, room.layout) ? room.layout : "void";
  return { narration: room.narration, layout, objects: room.objects };
}

// Room 1 can come with one webcam frame (base64 JPEG from snapFrame()). It
// becomes an image block before the text, so the first room is furnished from
// where the visitor really is. It's never stored or logged, and only room 1
// ever sees it: from room 2 on, the house has only its own words to go on.
const PHOTO_NOTE = `The image is where the visitor is right now. Build the first room out of it: its light, its colors and at least two things you can actually see in it become the room and its objects. Describe them as parts of the house, never as a photo. Never mention a camera, a picture or the visitor's face.`;
const MAX_PHOTO = 1_500_000; // base64 characters, about 1.1 MB of JPEG

function content(body) {
  const text = userMessage(body);
  const { room, photo } = body;
  const usable =
    room === 1 &&
    typeof photo === "string" &&
    photo.length <= MAX_PHOTO &&
    /^[A-Za-z0-9+/]+=*$/.test(photo);
  if (!usable) return text;
  return [
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: photo },
    },
    { type: "text", text: `${PHOTO_NOTE}\n\n${text}` },
  ];
}

// The default 100 kB body limit is too small for room 1's photo.
app.post(
  "/api/rooms",
  roomLimit,
  express.json({ limit: "2mb" }),
  async (req, res) => {
    const user = content(req.body);

    // Retries a bad response once, then gives up.
    for (let attempt = 1; ; attempt++) {
      // No temperature: the default of 1.0 is the point.
      const message = await client.messages.create({
        model: config.model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      });
      const text =
        message.content.find((block) => block.type === "text")?.text ?? "";
      try {
        const room = parseReply(text);
        // Only the room number and layout: the narration can repeat what
        // the visitor said or where they are, and this site keeps none of it.
        console.log(`room ${req.body.room} (${room.layout})`);
        return res.json({
          ...room,
          decay: progress(req.body.room),
          context: context(req.body.room),
        });
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
  },
);

// The visitor's address as the server sees it, for the panel on every page.
app.get("/api/whoami", (req, res) => {
  res.json({
    ip: req.ip?.replace(/^::ffff:/, ""),
    language: req.headers["accept-language"],
  });
});

// Turns the browser's exact coordinates into a street address, once per
// visit, with OpenStreetMap's Nominatim (which asks for at most one request
// a second and a User-Agent that names the app). Nothing is stored.
const placeLimit = rateLimit({ windowMs: 60 * 1000, limit: 10 });
app.get("/api/place", placeLimit, async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).end();
  }
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "context-window-netart/1.0" },
  });
  if (!response.ok) return res.status(502).end();
  const { address, display_name: display } = await response.json();
  if (!address) return res.status(404).end();
  res.json({ ...address, display });
});

// ---- The class API ----------------------------------------------------------
// A text-only Claude proxy for classmates whose sites are plain HTML/JS and
// can't hold a key. Everyone shares one token (CLASS_TOKEN in .env), so the
// real limits live here: the model is fixed, only text goes in, and output,
// input, per-visitor rate and total daily calls are all capped. The spend limit
// on the Console workspace is the final backstop. Sized from the room route:
// its prompt is about 2.5k characters and its reply a few hundred tokens, so
// these caps leave roughly 5x that on the way in and 2x on the way out.
const CLASS_MODEL = "claude-haiku-5-5";
const CLASS_DEFAULT_TOKENS = 512;
const CLASS_MAX_TOKENS = 1024;
const CLASS_MAX_MESSAGES = 20;
const CLASS_MAX_CHARS = 12_000; // system prompt and every message together
const CLASS_DAILY_CALLS = 1500; // across the whole class, resets at 00:00 UTC

// Set CLASS_ANTHROPIC_API_KEY to bill a separate workspace key; otherwise the
// site's own key pays.
const classClient = process.env.CLASS_ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.CLASS_ANTHROPIC_API_KEY })
  : client;

// The token travels in a header and there are no cookies, so any origin may
// call this: student pages on localhost, file:// and github.io all have
// different origins. Browsers send an OPTIONS preflight first because of the
// Authorization header, so that is answered here before the token is checked.
function classCors(req, res, next) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

// Compared as hashes so the check takes the same time wherever the guess
// first goes wrong. If CLASS_TOKEN is unset the route is off, not open.
const digest = (text) => createHash("sha256").update(text).digest();
function classAuth(req, res, next) {
  const expected = process.env.CLASS_TOKEN;
  if (!expected)
    return res.status(503).json({ error: "The class API is off." });
  const given = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
  if (!timingSafeEqual(digest(given), digest(expected))) {
    return res.status(401).json({ error: "Wrong or missing token." });
  }
  next();
}

// Per visitor, and counted before the token check so guessing it is slow too.
const classLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many requests. Wait a few minutes." },
});

// The same for everyone. In memory, so a restart resets it; that is fine
// because the Console spend limit is what really stops the money. The check
// runs before the request is read; the handler adds to the count only once a
// request is valid, so a student's typos don't use up the class's calls.
let today = { date: "", calls: 0 };
function classDaily(req, res, next) {
  const date = new Date().toISOString().slice(0, 10);
  if (today.date !== date) today = { date, calls: 0 };
  if (today.calls >= CLASS_DAILY_CALLS) {
    return res
      .status(429)
      .json({ error: "Too many requests today. Try tomorrow." });
  }
  next();
}

// Builds the request from an allowlist of fields. Anything else the browser
// sends (model, tools, images, stream...) is never looked at, so it can't
// reach the API.
function classRequest(body) {
  const { messages, system, max_tokens: maxTokens, temperature } = body ?? {};
  const fail = (error) =>
    Object.assign(new Error(error), { status: 400, expose: true });

  if (!Array.isArray(messages) || !messages.length) {
    throw fail("messages must be a non-empty array.");
  }
  if (messages.length > CLASS_MAX_MESSAGES) {
    throw fail(`At most ${CLASS_MAX_MESSAGES} messages.`);
  }
  for (const m of messages) {
    const ok =
      (m?.role === "user" || m?.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim();
    if (!ok) {
      throw fail(
        "Each message needs a role (user or assistant) and text content.",
      );
    }
  }
  if (messages.at(-1).role !== "user") {
    throw fail("The last message must be from the user.");
  }
  if (system !== undefined && typeof system !== "string") {
    throw fail("system must be a string.");
  }
  const chars =
    (system?.length ?? 0) + messages.reduce((n, m) => n + m.content.length, 0);
  if (chars > CLASS_MAX_CHARS) {
    throw fail(
      `Too long: ${chars} characters, the limit is ${CLASS_MAX_CHARS}.`,
    );
  }

  const request = {
    model: CLASS_MODEL,
    max_tokens: Math.min(
      Number.isInteger(maxTokens) && maxTokens > 0
        ? maxTokens
        : CLASS_DEFAULT_TOKENS,
      CLASS_MAX_TOKENS,
    ),
    messages: messages.map(({ role, content }) => ({ role, content })),
  };
  if (system) request.system = system;
  if (typeof temperature === "number" && temperature >= 0 && temperature <= 1) {
    request.temperature = temperature;
  }
  return request;
}

app.options("/api/digital355", classCors);
app.post(
  "/api/digital355",
  classCors,
  classLimit,
  classAuth,
  classDaily,
  express.json({ limit: "64kb" }),
  async (req, res) => {
    const request = classRequest(req.body);
    today.calls++;
    const message = await classClient.messages.create(request);
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    // Only a count: what students ask is theirs, and this site keeps none of it.
    console.log(`class call ${today.calls}/${CLASS_DAILY_CALLS}`);
    res.json({ text, stop_reason: message.stop_reason });
  },
  // Answers in JSON, with the CORS headers set above, instead of Express's
  // HTML error page, which a student's fetch() can't make sense of.
  (error, req, res, next) => {
    if (res.headersSent) return next(error);
    // `expose` marks errors that are the student's to read: ours below and
    // the body parser's (bad JSON, body too large). Anything else, such as
    // an upstream billing or key error, is logged here and hidden from them.
    if (error.expose) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("class call failed:", error.status, error.message);
    res.status(502).json({ error: "The model call failed. Try again." });
  },
);

app.use(express.static("public"));

// Every other URL (/room/3) is the React app; React Router picks the page.
app.get("/{*path}", (req, res) =>
  res.sendFile("index.html", { root: "public" }),
);

// Hosts choose the port and pass it in PORT; locally it is 8000.
const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`http://localhost:${port}`));
