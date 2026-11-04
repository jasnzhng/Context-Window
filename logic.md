# How Context Window works

Context Window is a React app with a small Express server. The visitor answers
one question, then walks through an endless house that Claude writes and draws
one room at a time. Each room is written from only the room before it and the
object the visitor clicked, so by room 3 the narrator no longer knows the
visitor's answer. There is no last room; the house just keeps forgetting.

## Tech stack

| Piece | Tool | Why |
| --- | --- | --- |
| Pages and UI | React 19, function components | Same as eecs485 p3 |
| Page URLs | React Router (`react-router-dom`) | Each room has its own URL, and the back button works |
| Bundling | webpack + Babel | Compiles `src/*.jsx` into one `public/bundle.js`, like p3 |
| Server | Express 5 (Node) | Serves the app and keeps the API key out of the browser |
| Model | Anthropic SDK, `claude-haiku-5-5` | One call per room; the model is set in `config.json` |
| State | `sessionStorage` in the browser | Remembers the answer and the rooms already seen in this tab |
| Code style | ESLint + Prettier | Same rules as p3 |

## Files

```
config.json          the question, the decay half-life, the model
server.js            Express: serves public/, and POST /api/rooms calls Claude
webpack.config.js    src/main.jsx -> public/bundle.js
public/
  index.html         empty shell: <div id="mountme"> + bundle.js
  style.css          the terminal look
  bundle.js          built by webpack (not committed)
src/
  main.jsx           mounts React and defines the routes
  opening.jsx        "/"        the question and the answer box
  room.jsx           "/room/:n" fetches, decays and draws one room
  typewriter.jsx     types text out at 20 ms per character
  decay.js           filename decay, drawing erosion, fading answer, random exit
  visit.js           reads and writes the visit in sessionStorage
```

## How the pieces fit together

```
  BROWSER  (React, public/bundle.js)                SERVER  (server.js)           CLAUDE
 ┌──────────────────────────────────────┐
 │ "/"  Opening                         │
 │   visitor types an answer            │
 │   saveVisit({ answer, rooms: [] })   │──┐
 └──────────────────────────────────────┘  │
                                           ▼
                              ┌────────────────────────┐
                              │ sessionStorage "visit" │
                              │  answer                │
                              │  rooms[0..]            │
                              └────────────────────────┘
                                   ▲            │
                                   │ save       │ load
 ┌─────────────────────────────────┴────────────▼────────┐
 │ "/room/:n"  Room                                      │
 │                                                       │
 │  room n already saved? ── yes ──> draw it (no call)   │
 │        │ no                                           │
 │        ▼                                              │
 │  POST /api/rooms                                      │   ┌──────────────────────┐
 │  { room, answer, narration, clicked } ────────────────┼──>│ userMessage()        │
 │                                                       │   │  builds the prompt   │   ┌──────────┐
 │                                                       │   │  (the forgetting)    │──>│ messages │
 │                                                       │   │                      │   │ .create  │
 │                                                       │   │ parse + check JSON,  │<──│          │
 │  { narration, objects } <─────────────────────────────┼───│  retry once          │   └──────────┘
 │        │                                              │   └──────────────────────┘
 │        ▼                                              │
 │  makeRoom()  (decay.js)                               │
 │   decay the filenames, pick one exit, crack the walls │
 │        │                                              │
 │        ▼                                              │
 │  save it, then draw: typewriter narration,            │
 │  ASCII room with objects, status line, footer         │
 │                                                       │
 │  exit object ──> "/room/n+1"   (forever)              │
 │  dead end    ──> prints its note in the status line   │
 └───────────────────────────────────────────────────────┘
```

The server writes nothing to disk. A walk through the house lives only in the
visitor's browser tab, and each room is generated exactly once. Going back or
reloading draws the saved room instead of calling Claude again.

## A walk through the house

1. **Opening (`/`).** The page types out the question from `config.json`. On
   submit, `opening.jsx` saves `{ answer, rooms: [] }` and goes to `/room/1`.
2. **Entering a room (`/room/:n`).** `main.jsx` checks that rooms 1 to n−1
   exist, otherwise it sends the visitor back to `/`. It renders `<Room key={n}>`;
   the key gives every room a fresh component, so the typewriter restarts.
3. **Asking for the room.** If room n isn't saved yet, `room.jsx` posts the
   previous room's narration and the decayed name of its exit to `/api/rooms`.
   The page shows `drawing room-NN` with animated dots while it waits.
4. **Writing the room.** `server.js` builds the prompt (see the next section)
   and calls Claude. The reply is JSON (narration and 3 to 4 objects) followed
   by an ASCII drawing in `<art></art>` tags, outside the JSON so its
   backslashes need no escaping. The drawing is cleaned up (tabs, box-drawing
   characters, indentation, 60 columns max) and must contain each marker `{0}`
   to `{n}` exactly once. A bad reply is retried once; a second bad drawing
   falls back to the hand-drawn frame in `server.js`.
5. **Decaying it.** `makeRoom()` turns the reply into what the visitor sees:
   decayed names, one random exit, the drawing worn down, and filenames
   written over the markers. That result is saved, so
   the room never changes after it first appears.
6. **Clicking.** The exit is a React Router `<Link>` to the next room. Dead
   ends are `<button>`s that print `name: note` in the status line. Both look
   the same, so the visitor can't tell which one is the door.
7. **No end.** Every exit leads to `/room/n+1`. Decay keeps climbing toward
   1 but never reaches it, so the house can be walked forever. Going back to
   `/` and answering again starts a new visit.

## What the model sees

This is the whole mechanic. It lives in `userMessage()` in `server.js`. The
system prompt is the same for every room and never mentions memory, so the
model makes things up with confidence instead of hedging.

| Room | The prompt contains |
| --- | --- |
| 1 | The question and the visitor's answer |
| 2 | Room 1's narration, the clicked object, and the visitor's answer |
| 3 and up | The previous room's narration and the clicked object only |

The browser sends the answer with every request, but from room 3 on the
server leaves it out. The model may still repeat it for a while in its own
narration, but only until the telephone game wears it away.

The "clicked object" is the name the visitor saw, already decayed. Room 5
might be told the visitor opened `coffee~1.bin` and has to invent what that is.

## Decay

Decay grows with every room and never stops: `p = 1 - 0.5 ^ ((room - 1) / halfLife)`.
With `halfLife: 4` in `config.json`, the narrator has lost half of the house
by room 5, three quarters by room 9, and 90% by about room 14. `p` gets
close to 1 but never reaches it.

| Progress p | Filename becomes | Example from `coffeemug.png` |
| --- | --- | --- |
| under 0.15 | unchanged | `coffeemug.png` |
| 0.15 to 0.35 | copy suffix | `coffeemug(2).png` |
| 0.35 to 0.55 | `_final`, png and jpg swap | `coffeemug_final.jpg` |
| 0.55 to 0.75 | random capitals, `_FINAL_v2` | `cOffeem_FINAL_v2.jpg` |
| 0.75 to 0.9 | 8.3-style short name, `.bin` | `coffee~1.bin` |
| 0.9 and up | `untitled` | `untitled(2)` |

Names are capped at 20 characters, and two objects that decay to the same
name get numbered. Beyond the names, the visitor can watch the decay in three
places:

- **The drawing erodes.** Up to 70% of its strokes crumble into dust (`. : ' ~`)
  or vanish, lines slip sideways, and the CSS (`--decay` on `<main>`) fades
  the art toward the background and splits its colors. Past p = 0.6 it
  flickers. The filenames keep their bright accent color, so the objects
  outlast the room around them.
- **A context meter.** `context [#########...........] 47%` above the narration.
- **The visitor's answer.** `you said: "my gr__d__th_r's"`. Each room blanks a share
  of the letters the last room still had, so a lost letter never comes back.

## The ASCII room

Claude draws every room, up to 60 columns wide, and marks each object with
`{0}`, `{1}`, and so on. `makeRoom()` erodes the drawing (markers are left
whole), then writes each decayed filename over the drawing starting at its
marker, pushing a label right if it would cover the one before it. It saves
the finished lines plus a `slots` list of `{ row, col, index }`. `room.jsx`
cuts each line around its slots and renders those spans as the clickable
objects.

## Running it

| Command | What it does |
| --- | --- |
| `npm start` | Builds `bundle.js` for production, then serves http://localhost:8000 |
| `npm run dev` | Rebuilds `bundle.js` on every save; run `node --env-file=.env server.js` alongside it |
| `npm run lint` / `npm run format` | ESLint and Prettier |

The server reads `ANTHROPIC_API_KEY` from `.env`, which git ignores. In
`npm run dev`, React's StrictMode runs effects twice, so each new room is
requested twice; `npm start` requests each room once.

## Decisions worth knowing

- **The key stays on the server.** The browser never talks to Claude directly,
  so the key can't leak through `bundle.js`.
- **Rooms are generated live, one at a time.** That's what lets the visitor's
  real answer shape the house. The cost is a short wait on entering each new room.
- **Each room is decayed once and saved.** That's why plain `Math.random()` is
  enough: there's no rebuild that would need to reproduce the same decay.
- **Babel follows webpack's mode.** Without `development: argv.mode !== "production"`
  in `webpack.config.js`, the production build crashes with
  `jsxDEV is not a function`.
- **The ending is gone.** The old `/end` page ("Hello! How can I help you
  today?") was removed when the house became endless.
- **Dead ends are left over from the pre-generated version.** With live
  generation, every object could lead forward, and the visitor's real click
  would shape the next room.
