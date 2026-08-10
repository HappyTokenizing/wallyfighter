# Driving & capturing the game (for verification / critic agents)

## The problem
The Browser-pane tab often reports `visibilityState: hidden` (display asleep or
tab backgrounded), which freezes `requestAnimationFrame` — the game loop stops.
Worse, when the tab was never laid out, `innerWidth/innerHeight` are `0`, so the
canvas is `0x0` and every capture comes back blank.

## The fix: capture mode
Load the game with **`?cap=1`**:

```
http://localhost:5173/?cap=1
```

That installs a capture rig (`Game._installCaptureRig`) and turns on
`preserveDrawingBuffer` so the framebuffer can be read back. It exposes:

| call | what it does |
|---|---|
| `__viewport(w=1600, h=900, pixelRatio=1)` | pins a deterministic canvas size (auto-called if the window is 0-sized) |
| `__step(frames)` | advances `frames` fixed 1/60 steps, then draws once. Returns the screen name |
| `__draw()` | draws without advancing time (re-arms the framebuffer) |
| `__shot(name)` | writes the current framebuffer to `.shots/<name>.png`, returns `{ok, bytes, path}` |
| `__shotAfter(name, frames)` | `__step` then `__shot` |
| `__fight({p1, p2, arena, aiLevel, roundTime, roundsToWin})` | jumps straight into a match |
| `__poseCam({slot, view, dist, height, lookAt, fov})` | parks the camera on a fighter for a portrait. `view`: `front`\|`three-quarter`\|`side`\|`back`. Facing is derived from the opponent's position, so `front` really is the face |
| `__freeze(on)` | freezes the fighters so a pose holds across captures |
| `__key(code, ms)` | synthetic keydown/keyup for menu driving |
| `__errs` | array of every error/rejection/`console.error` since load |

## The screenshot sink
`tools/shot-sink.js` is a dev-only Vite middleware:

- `POST /__shot?name=foo` with PNG bytes → writes `.shots/foo.png`
- `GET  /__shots` → JSON listing
- `POST /__shots/clear` → empties the directory

**This is why it exists:** agents cannot hand images to each other, but they *can*
`Read()` a PNG file. So one harvester agent captures N shots in a single browser
session, and N critic agents review them in parallel by reading the files. Never
pull image bytes back through `javascript_tool` — only ever the small JSON result.

## Canonical capture session

```js
(async () => {
  window.__viewport(1600, 900, 1);
  window.__fight({ p1: 'wally', p2: 'tired-ape', arena: 'meme-market' });
  window.__step(240);                                  // let the round start
  await window.__shot('match-meme-market');            // gameplay framing
  window.__poseCam({ slot: 0, view: 'front', dist: 3.6, height: 1.25, lookAt: 1.1 });
  await window.__shot('wally-front');
  window.__poseCam({ slot: 0, view: 'three-quarter', dist: 3.6 });
  await window.__shot('wally-34');
  return JSON.stringify({ errs: window.__errs.slice(0, 5) });
})()
```

IDs: fighters are `wally bonko dogey shibro peepee cool-pal tired-ape blackish-bull
crypto-punkd fatty-pingo`; arenas are `meme-market bull-market-colosseum
liquidity-swamp frozen-token-lab mountain-node-village lost-block-museum
settlement-express institutional-capital-tower calm-before-liquidation
permanent-reserve-core`.

## Rules
- Check `__errs` and `read_console_messages` after every burst.
- The intro cinematic and some DOM animations run on **wall-clock** time, not
  stepped time — judge those with real-time waits + screenshots.
- **NEVER drive the pane while a human is using it** (check for organic input
  first: the screen changing on its own between your calls = hands off).
- Only ONE agent may drive the browser at a time. Parallel agents review `.shots/`
  files; they do not open the browser.
