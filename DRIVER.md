# Headless-ish browser driving (for verification agents)

The Browser-pane tab may report `visibilityState: hidden` (display asleep), which
freezes `requestAnimationFrame` — the game loop stops, but screenshots still work
via the compositor. Drive the game with MANUAL TIME-STEPPING via javascript_tool:

```js
// install once per page load
window.__errs = [];
addEventListener('error', e => window.__errs.push(String(e.message).slice(0,150)));
window.__step = (frames) => {
  const g = window.__game;
  for (let i = 0; i < frames; i++) {
    g.frame++;
    g.input.beginFrame();
    try { g.screens.update(1/60) } catch (e) { window.__errs.push('update:'+String(e?.message).slice(0,140)) }
  }
  try { g.screens.render(g.renderer) } catch (e) { window.__errs.push('render:'+String(e?.message).slice(0,140)) }
  return g.screens.name;
};
```

- Synthetic input: dispatch `new KeyboardEvent('keydown'/{keyup}', {code, key, bubbles:true})`
  on window between `__step` calls (InputManager reads `e.code`; some screens read `e.key`).
- Jump anywhere: `window.__game.screens.goto('match', {mode:'exhibition', p1:{charId:'wally',control:'ai',aiLevel:3}, p2:{charId:'bonko',control:'ai',aiLevel:3}, arenaId:'bull-market-colosseum', rules:{roundsToWin:1, roundTime:45}})`
  then `__step(1800)` chunks until `screens.name === 'results'`.
- Screenshot after each burst renders the current state.
- CAVEAT: the intro cinematic and some DOM animations run on WALL-CLOCK time, not
  stepped time — judge those with real-time waits + screenshots instead.
- Check `window.__errs` and read_console_messages after every burst.
- NEVER do this while a human is using the pane (check for organic input first:
  screen changing on its own between your calls = hands off).
