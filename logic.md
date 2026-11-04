# How Context Window works

Context Window is a React app with a small Express server. The visitor answers
one question, then walks through an endless house that Claude writes one room
at a time. Every object in a room can be opened, and any of them can lead
further. Each room is written from only a worn copy of the room before it and
the object the visitor went through, so by room 3 the narrator no longer knows
the visitor's answer, and by room 5 it has wandered somewhere else entirely.
There is no last room; the house just keeps forgetting.

## Tech stack

| Piece        | Tool                              | Why                                                                   |
| ------------ | --------------------------------- | --------------------------------------------------------------------- |
| Pages and UI | React 19, function components     | Same as eecs485 p3                                                    |
| Page URLs    | React Router (`react-router-dom`) | Each room has its own URL, and the back button works                  |
| Bundling     | webpack + Babel                   | Compiles `src/*.jsx` into one `public/bundle.js`, like p3             |
| Server       | Express 5 (Node)                  | Serves the app and keeps the API key out of the browser               |
| Model        | Anthropic SDK, `claude-haiku-5-5` | One call per room, about 5 seconds; the model is set in `config.json` |
| State        | `sessionStorage` in the browser   | Remembers the answer and the rooms already seen in this tab           |
| Code style   | ESLint + Prettier                 | Same rules as p3                                                      |

## Files

```
config.json          the question, the decay half-life, the model
server.js            Express: serves public/, and POST /api/rooms calls Claude
webpack.config.js    src/main.jsx -> public/bundle.js
public/
  index.html         empty shell: <div id="mountme"> + bundle.js
  style.css          the terminal look, and the CSS side of decay
  bundle.js          built by webpack (not committed)
src/
  main.jsx           mounts React and defines the routes
  opening.jsx        "/"        the question, how important (1-10), "can we get a peek?"
  room.jsx           "/room/:n" fetches, decays and draws one room
  checkin.jsx        the webcam window and its yes/no questions between rooms
  camera.js          starts and stops the webcam; keeps the stream; snaps room 1's photo
  typewriter.jsx     types text out at 20 ms per character
  plans.js           the 10 ASCII floor plans (shared with server.js)
  decay.js           filename decay, plan erosion and mirroring, the fading answer
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
                              │  rooms[0..]  (each has │
                              │   `chosen`: the object │
                              │   it was left through) │
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
 │  { room, answer, narration,                           │   │ userMessage()        │
 │    clicked, clickedNote } ────────────────────────────┼──>│  blur + drift        │   ┌──────────┐
 │                                                       │   │  (the forgetting)    │──>│ messages │
 │                                                       │   │                      │   │ .create  │
 │                                                       │   │ parse + check JSON,  │<──│          │
 │  { narration, layout, objects, decay } <──────────────┼───│  retry once          │   └──────────┘
 │        │                                              │   └──────────────────────┘
 │        ▼                                              │
 │  makeRoom()  (decay.js)                               │
 │   decay the names, erode + maybe mirror the plan,     │
 │   deal names onto it, damage the answer               │
 │        │                                              │
 │        ▼                                              │
 │  save it, then draw: meter, typewriter narration,     │
 │  floor plan with objects, description, footer         │
 │                                                       │
 │  click object ──> its description + [go further]      │
 │  go further   ──> chosen = it, "/room/n+1"  (forever) │
 └───────────────────────────────────────────────────────┘
```

The server writes nothing to disk. A walk through the house lives only in the
visitor's browser tab. Going back or reloading draws the saved room instead of
calling Claude again.

## A walk through the house

1. **Opening (`/`).** The page types out the question from `config.json`,
   then "how important is it to you (1-10)?", then "can we get a peek? it'll
   help us find it faster" with `[yes]` / `[no]`, then where they are, then
   whether the house can look around for their things. Each question appears
   once the last is answered, like a terminal session. Every permission the
   visit uses is asked for here: the webcam (left on, see The camera),
   location, and Bluetooth plus the microphone (see Outside the house).
   `opening.jsx` saves `{ answer, importance, peek, where, nearby, rooms: [] }`
   and goes to `/room/1`.
2. **Entering a room (`/room/:n`).** `main.jsx` checks that rooms 1 to n−1
   exist and that the visitor chose an object in room n−1, otherwise it sends
   them back to `/`. It renders `<Room key={n}>`; the key gives every room a
   fresh component, so the typewriter restarts.
3. **Asking for the room.** If room n isn't saved yet, `room.jsx` posts the
   previous room's narration and the name and description of the object the
   visitor went through. The page shows `loading room-NN` with animated dots.
4. **Writing the room.** `server.js` builds the prompt (see the next section)
   and calls Claude. The reply is JSON: the narration, 3 to 4 objects (a
   filename and a description each), and a `layout` naming one of the floor
   plans. An unknown layout becomes `void`. A bad reply is retried once. The
   server adds `decay` for this room and sends it all back.
5. **Decaying it.** `makeRoom()` turns the reply into what the visitor sees
   (see Decay and The floor plans). That result is saved, so the room never
   changes after it first appears.
6. **Opening objects.** Every object is a button. Clicking one lights it up and
   shows its description with a `[go further]` button underneath.
7. **Going further.** `[go further]` saves the object as the room's `chosen`
   and goes to `/room/n+1`, which is written from that object. Going back and
   choosing a different object abandons the old path: every room after this
   one is dropped and the house branches. Choosing the same object again keeps
   the room that's already there. Before a new room is generated, the house
   sometimes stops to check in first (see The camera).
8. **No end.** Decay climbs toward 1 but never reaches it, so the house can be
   walked forever. Going back to `/` and answering again starts a new visit.

## What the model sees

This is the whole mechanic. It lives in `userMessage()` in `server.js`. The
system prompt is the same for every room and never mentions memory, so the
model makes things up with confidence instead of hedging.

| Room     | The prompt contains                                                               |
| -------- | --------------------------------------------------------------------------------- |
| 1        | The question, the answer, how much it matters (1-10), and the webcam photo if any |
| 2        | Room 1's narration, the chosen object, and the visitor's answer                   |
| 3 and up | A blurred copy of the previous narration, the chosen object, and how far to drift |

**Blur.** From room 3 on, each word of the previous narration is replaced with
`...` with probability `p` (the room's decay), so by room 5 about half of it is
gone and the model has to fill the gaps.

**Context.** Blur losses compound: room 4 sees a blurred copy of a room that
was itself written from a blurred copy. `context(room)` is the share of room
1 that can still reach the prompt: 1 for rooms 1 and 2, then multiplied by
`1 - p` for each room from 3 on. With `halfLife: 4` that's 100%, 100%, 71%,
42%, 21%, 9%, 3%, and it is what the context bar shows.

**Drift.** `drift(context)` adds one instruction on how far the room may
wander, so the bar and the narration always agree:

| Context (room)     | The next room…                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- |
| over 90% (room 2)  | follows naturally from the previous one                                                      |
| 50 to 90% (room 3) | mostly follows, but something impossible has crept in                                        |
| 30 to 50% (room 4) | barely connects: keep one detail, change everything else                                     |
| 30% and under (5+) | has nothing to do with it: another planet, century, the sea floor; one stray word links them |

In practice a kitchen becomes a pantry, then a harbor, then a moon of rust
colored salt by room 5.

The chosen object is passed as the name the visitor saw, already decayed, plus
its description. Room 7 might be told the visitor went through `portra~1.bin`
and has to invent what that is.

## Decay

The server computes decay for each room and sends it with the room:
`p = 1 - 0.5 ^ ((room - 1) / halfLife)`. With `halfLife: 4` in `config.json`,
half the house is gone by room 5, three quarters by room 9, and 90% by about
room 14. `p` gets close to 1 but never reaches it. It drives the blur above
and everything below. It's deliberately slower than `context`: the narration
loses its thread by room 6, while the filenames and floor plan keep wearing
down for many rooms after that.

| Progress p   | Filename becomes             | Example from `coffeemug.png` |
| ------------ | ---------------------------- | ---------------------------- |
| under 0.15   | unchanged                    | `coffeemug.png`              |
| 0.15 to 0.35 | copy suffix                  | `coffeemug(2).png`           |
| 0.35 to 0.55 | `_final`, png and jpg swap   | `coffeemug_final.jpg`        |
| 0.55 to 0.75 | random capitals, `_FINAL_v2` | `cOffeem_FINAL_v2.jpg`       |
| 0.75 to 0.9  | 8.3-style short name, `.bin` | `coffee~1.bin`               |
| 0.9 and up   | `untitled`                   | `untitled(2)`                |

Names are capped at 20 characters, and two objects that decay to the same
name get numbered. Beyond the names, the visitor can watch the decay in three
places:

- **The floor plan erodes.** Up to 70% of its strokes crumble into dust
  (`. : ' , ~`) or vanish, and lines slip sideways. The CSS (`--decay` on
  `<main>`) fades the plan toward the background and splits its colors, and
  past p = 0.6 it flickers. The filenames keep their bright accent color, so
  the objects outlast the room around them.
- **A context meter.** `context ████▓▒░............. 21%` above the
  narration. It shows `context` (see What the model sees), not `p`.
- **The visitor's answer.** `you said: "pysg~dmthe?'?s>bumbr~llpa"`. Each room
  damages a share of what the last room still had: a letter becomes a
  lookalike (`e→3`, `o→0`) or a random letter, a symbol replaces it, it drops
  out, or a symbol creeps in beside it. Nothing is ever repaired.

## The floor plans

`src/plans.js` holds 10 hand-drawn ASCII plans: kitchen, bedroom, hallway,
study, attic, garden, cave, shore, sky and void. Each has a one-line `hint`,
and `server.js` lists every name and hint in the prompt so Claude can pick the
closest one. Adding a plan to `plans.js` is all it takes to add a layout.

Each plan marks four places for objects with `{0}` to `{3}`, with about 20
blank characters after each for the filename. `makeRoom()` varies a plan
three ways, so the same layout rarely looks the same twice:

- **Shuffle.** Objects are dealt onto the markers in random order. A room with
  3 objects leaves a random marker blank.
- **Mirror.** Half the time the plan is flipped left to right, swapping `/`
  and `\`, `(` and `)`, and so on. Braces swap too, so `{0}` still reads
  `{0}`. On a mirrored plan, filenames end at their marker instead of starting
  there, because the blank space is now on the left.
- **Erode.** See Decay above. Markers are left whole.

Then each filename is written over the plan, pushed right if it would cover
the one before it on the same line. The room saves the finished lines plus a
`slots` list of `{ row, col, index }`; `room.jsx` cuts each line around its
slots and renders those spans as the object buttons.

## The camera

If the visitor says yes to "can we get a peek?", `camera.js` asks for the
webcam and keeps the stream open for the whole visit. `presence.js` looks
for faces in it, on the device (see Outside the house), and one frame goes
to Claude for room 1 (see The peek). Nothing else records or sends the
picture.

**The peek.** Just before room 1 is requested, `snapFrame()` takes one
picture (a JPEG, longest side 768 px) and `room.jsx` sends it with that
request as `photo`. `server.js` puts it in front of the prompt as an image
block and tells Claude to build the first room from it (its light, its
colors, two things it can see) without ever mentioning a photo or camera.
So the visitor's real surroundings are the first room, and then they
decay out of the house like everything else: room 2 only gets room 1's
words. The picture is never saved, logged or sent again; a reload of room 1
before it arrives takes a new one. The server ignores `photo` on any other
room, and anything that isn't base64 or is over about 1.1 MB. The JSON body
limit is 2 MB for this.
The stream lives in a module variable, because `sessionStorage` can't hold
one. After a reload, `main.jsx` turns it back on if the visit says `peek`.
Saying no on a new visit turns off a camera left on by an earlier one.

**Check-ins.** When `[go further]` is about to generate a new room, the house
may pause first. It never happens two rooms in a row or after room 1. After
that the chance starts at 30% and climbs by 20% for every room without a
check-in (30%, 50%, 70%, 90%, then certain), and resets after each one. So
there's one at least every five rooms, and usually every two or three. `CheckIn` shows a `cam0 ● REC` window with the visitor's own
feed, mirrored and greyscale, and asks one of the questions in `QUESTIONS`
("are you still looking?", "have you found it yet?", "is that you?", and
others). `nextQuestion()` deals them from a shuffled deck saved in the visit,
so none repeats until all of them have been asked. Either `[yes]` or `[no]` goes on to the next room. Without a camera
the window shows `no signal`. The room of the last check-in is saved as
`lastCheckIn` in the visit.

## Running it

| Command                           | What it does                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `npm start`                       | Builds `bundle.js` for production, then serves http://localhost:8000                  |
| `npm run dev`                     | Rebuilds `bundle.js` on every save; run `node --env-file=.env server.js` alongside it |
| `npm run lint` / `npm run format` | ESLint and Prettier                                                                   |

The server reads `ANTHROPIC_API_KEY` from `.env`, which git ignores. In
`npm run dev`, React's StrictMode runs effects twice, so each new room is
requested twice; `npm start` requests each room once.

## Decisions worth knowing

- **The key stays on the server.** The browser never talks to Claude directly,
  so the key can't leak through `bundle.js`.
- **Rooms are generated live, one at a time.** That's what lets the visitor's
  real answer and real choices shape the house. The cost is a wait of about 5
  seconds on entering each new room.
- **Claude picks a plan instead of drawing one.** An earlier version had
  Claude draw every room in ASCII, which took 13 to 22 seconds a room. Naming
  a layout costs a few words, keeps the picture matching the narration, and
  the shuffle, mirror and erosion keep it varied.
- **The server owns the decay curve.** `progress()` and `context()` live
  only in `server.js` and arrive with each room as `decay` and `context`, so
  the browser never needs `halfLife`.
- **Each room is decayed once and saved.** That's why plain `Math.random()` is
  enough: there's no rebuild that would need to reproduce the same decay.
- **Imports of `.js` files need the extension.** `package.json` sets
  `"type": "module"`, so webpack resolves `./plans.js` but not `./plans`.
- **Babel follows webpack's mode.** Without `development: argv.mode !== "production"`
  in `webpack.config.js`, the production build crashes with
  `jsxDEV is not a function`.
- **There is no ending.** The old `/end` page ("Hello! How can I help you
  today?") was removed when the house became endless.

## Outside the house

Several things reach past the page. None of them decay in the panel: the house
forgets the visitor, the browser doesn't.

- **Location** (`location.js`). A fourth opening question asks for an exact
  fix (`enableHighAccuracy`). `GET /api/place` turns it into an address with
  OpenStreetMap's Nominatim, once per visit. Each room is told
  `placeAt(where, previous room's context)`: building and street address,
  then the street, the city, the state, the country, a hemisphere, and
  "Earth, probably". The meter shows it as `you are:`.
- **The panel** (`exposed.jsx`, on every page). IP (`GET /api/whoami`), OS and
  browser from client hints, GPU, screen, cores, memory, battery, network,
  time zone, languages, permission states, cursor, location, face, blinks
  (count, per minute, seconds since the last), how often the visitor left the
  tab, what they showed from the clipboard, and their name once they've
  answered to it. Device names aren't listed; the house asks about them.
- **Names** (`owners.js`, `whoareyou.jsx`). A fifth opening question, "Is
  anything of yours nearby? Let us look around.", asks for the rest up front.
  `[yes]` opens the Web Bluetooth picker first (it only opens straight from
  a click; Chrome and Edge only), saving the picked device's name as
  `nearby`, then asks for the microphone and turns it off at once: nothing
  is recorded, but every browser then shows its device labels. In the
  house, `owner()` looks for an owner in `nearby` and every camera,
  microphone and speaker label ("Jason's AirPods Pro", "Jason's iPhone
  Camera" through Continuity Camera, "iPhone de Marie"), and the page
  becomes "is your name jason?" in giant text. Yes: "we thought so." No:
  "then whose iphone is this?". Once per name per tab, saved as `name` or
  `notName`; checked on each room, when the camera comes on and on
  `devicechange`, so AirPods connecting mid-visit get asked about too.
- **Presence** (`presence.js`). MediaPipe's face landmarker runs on the
  webcam about 15 times a second, loaded from jsDelivr when the camera first
  comes on. It has to be that fast to land inside a blink; the face count and
  brackets are only published every 400 ms (or at once when they change).
  Two faces: "who is that with you?", once. Looking away is the overlay's
  job (see Not looking).
  Away 60 s: the camera turns off and the house forgets their face for the
  rest of the visit. The check-in window brackets every face it finds.
- **Blinks.** The eyes count as shut when MediaPipe's `eyeBlinkLeft`/`Right`
  blendshapes average over 0.5, and open again under 0.3. Each blink,
  `glitch.js` swaps about 4% of the page's visible characters (at least 6)
  for random ones for 420 ms, long enough to still be there when the eyes
  open. React owns that text, so a character is only put back if its node
  still holds the swapped text; if React rewrote it meanwhile (the
  typewriter does every 20 ms), React's text wins. Off for
  `prefers-reduced-motion`; the panel still counts.
- **Not looking** (`uninterested.jsx`). No face, the head turned away (the
  nose tip too far from the middle of the face, side to side or up and
  down), or eyes shut, for 1.5 s: the whole page becomes giant text, "are you
  not interested?", over everything including a check-in. It goes the moment
  they look back. It's a fixed overlay, not the Fullscreen API, which only
  opens on a click or key press. The thresholds (`YAW`, `PITCH`,
  `LOOK_AWAY_MS`) are at the top of `presence.js`.
- **Clipboard.** The first check-in asks "what are you holding?"; whatever
  they paste in becomes an object in the next room. After that, every
  `[go further]` leaves a worn copy of the chosen object on the clipboard,
  and anything copied off the page comes out damaged by `forget()`.
- **The tab** (`away.js`). While the tab is hidden, its title cycles through
  lines like "are you still looking?" and the favicon is a blinking eye.
  Coming back, it says "you came back".
