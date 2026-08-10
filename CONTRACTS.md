# WALLY: CRYPTO SMACKDOWN — Engine Contracts (v1)

Every module MUST conform to this document. If you deviate, record the deviation in
your report. Plain JavaScript ES modules only (no TypeScript). Allowed dependencies:
`three`, `cannon-es`, browser APIs (Web Audio, SpeechSynthesis, Gamepad, localStorage,
Canvas 2D for procedural textures). **No network fetches, no external asset files —
all geometry/textures/audio are procedural.**

Style target: a polished game that *looks* like a 2002 low-poly console fighter but
*feels* AAA — impeccable responsiveness, chunky comedic animation, exaggerated
squash-and-stretch, huge readable silhouettes, flat bright colors, visible-but-
intentional polygon edges. Comedy is a feature, jank is not.

---

## 1. The `game` context object

`src/core/Game.js` constructs a single `Game` instance and passes **itself** to every
screen and system. Fields you may rely on:

| Field | Type | Purpose |
|---|---|---|
| `game.config` | object | `src/config/GameConfig.js` (title, controls, presets, rules) |
| `game.events` | EventBus | global pub/sub — `on(name, fn)`, `off`, `once`, `emit(name, payload)` |
| `game.save` | SaveManager | `get('dot.path', default)` / `set('dot.path', value)` — localStorage-backed |
| `game.input` | InputManager | see §3 |
| `game.audio` | AudioEngine | see §8 |
| `game.screens` | ScreenManager | `goto(name, params)`, `register(name, screen)` |
| `game.renderer` | THREE.WebGLRenderer | shared renderer; screens render into it |
| `game.ui` | HTMLElement | `#ui-root` overlay div (DOM UI lives here) |
| `game.quality` | object | active quality preset (see GameConfig.quality) |
| `game.frame` | number | fixed-step frame counter (60 Hz) |

The main loop runs a **fixed 60 Hz update** (`dt = 1/60`, accumulator pattern) and
one render per rAF. "Frames" in frame data always mean these 60 Hz ticks.

## 2. Screens

A screen is an object/class instance with optional methods:

```js
{ enter(params), exit(), update(dt), render(renderer) }
```

`src/ui/registerScreens.js` must export `registerScreens(game)` which registers all
screens and **returns the name of the initial screen**. Screen names (register these
exact strings): `'loading'`, `'title'`, `'menu'`, `'select'`, `'vs'`, `'match'`,
`'results'`, `'settings'`, plus later: `'gallery'`, `'movelist'`, `'credits'`,
`'training'`, `'playground'`, `'exhibition'`, `'story'`, `'arcade'`.

The `'match'` screen class lives in **`src/combat/MatchScreen.js`** (owned by the
combat module) and is imported and registered by `registerScreens`. Its params:

```js
screens.goto('match', {
  mode: 'versus'|'training'|'story'|'arcade'|'exhibition',
  p1: { charId: 'wally', control: 'p1'|'p2'|'ai', aiLevel: 1-5, costume: 0|1 },
  p2: { charId: 'dogey', control: 'ai', aiLevel: 2, costume: 0|1 },
  arenaId: 'meme-market',
  rules: { roundsToWin: 2, roundTime: 99 },   // optional, defaults from config
  onEnd: (result) => {},                       // optional; default → goto('results', result)
})
```

Match result payload: `{ winnerSlot: 0|1, p1, p2, arenaId, mode, rounds: [...], finisherUsed: bool }`.

## 3. InputManager

```js
input.isDown(p, action)      // p = 0|1; action = 'left'|'right'|'jump'|'crouch'|
input.pressed(p, action)     //   'light'|'heavy'|'kick'|'grab'|'special'|'super'|'block'
input.axis(p)                // -1..1 horizontal (keyboard + gamepad stick/dpad merged)
input.buffer(p)              // array of { action, frame } presses, newest last, ~90 frames kept
input.menuPressed(name)      // 'up'|'down'|'left'|'right'|'confirm'|'back' — any player/device, edge
input.padConnected(p)        // bool
```

Emits `'input:pause'` on Escape / gamepad Start. Edges are computed once per fixed
frame (`beginFrame()` is called by Game — do not call it yourself).

## 4. CharacterDef (files in `src/characters/<id>.js`)

Each character file exports `<Name>Def`:

```js
export const WallyDef = {
  id: 'wally', name: 'WALLY', title: 'The Tokenization Titan',
  bio: '...', style: '...',
  stats: { power: 8, speed: 5, defense: 7, chaos: 6 },        // 1..10
  height: 2.0, weight: 1.4,          // weight scales ragdoll mass & knockback resistance
  walkSpeed: 4.2, dashSpeed: 9, jumpVel: 8.5,
  buildModel(costume = 0) => ({ group: THREE.Group, bones: { <name>: THREE.Group } }),
  clips: { <clipName>: Clip },
  moves: [ MoveDef, ... ],
  finisher: { id, name, script(fx) },          // fx = SpecialContext, see §6
  voice: { pitch: 0.4, rate: 0.9 },            // for announcer/grunt flavor
}
```

### Rig (bones)

`buildModel` returns named `THREE.Group` pivots (pivot at the joint), meshes as
children. **Required bones**: `hips`, `torso`, `head`, `armL`, `armR`, `legL`,
`legR`. **Optional**: `forearmL`, `forearmR`, `shinL`, `shinR`, and named extras
(e.g. `trunk`, `earL`, `earR`, `tail`) — RagdollManager handles whatever exists.
Hierarchy: `group > hips > torso > (head, armL > forearmL, armR > forearmR)`,
`hips > legL > shinL`, etc. Character faces +X by default; the engine mirrors via
`group.scale.z` or rotation — never bake facing into the model.
Model height ≈ `def.height` meters, feet at y=0 relative to `group`.

### Clip format (procedural keyframe animation)

```js
Clip = {
  duration: 0.4,            // seconds
  loop: true|false,
  tracks: {
    boneName: [ { t: 0, rot: [x,y,z], pos: [x,y,z]? }, ... ]  // t in seconds, euler radians
  }
}
```

The shared Animator (combat module) lerps rotations/positions between keys and
cross-fades between clips (fade ~0.08s). **Standard clip names** every character
must provide: `idle`, `walk`, `jump`, `fall`, `crouch`, `block`, `hitLight`,
`hitHeavy`, `launched`, `knockdown`, `getup`, `entrance`, `win`, `lose`, `taunt` —
plus one clip per move referenced by `MoveDef.clip`.

### MoveDef

```js
MoveDef = {
  id: 'trunk-slap', name: 'Trunk Slap',
  kind: 'light'|'heavy'|'kick'|'grab'|'special'|'super'|'launcher'|'joke',
  input: ['light'] | ['down','heavy'] | ['forward','grab'] | ...,  // buffered sequence/chord
  damage: 8, startup: 5, active: 4, recovery: 10,                  // frames @60
  hitbox: { w: 0.9, h: 0.7, d: 0.8, forward: 1.0, up: 1.2 },       // meters, relative to facing
  knockback: { x: 6, y: 2, spin: 0.5 },
  hitStun: 14, blockStun: 8, hitStop: 4,
  launcher: false, ragdollThreshold: 0,   // 0=never, 1=partial on hit, 2=full ragdoll on hit
  meterGain: 6, meterCost: 0,             // meter is 0..100; supers cost 100
  armor: 0,                                // frames of armor during startup+active
  clip: 'trunkSlap', sfx: 'punch_light',
  script: (fx) => {} | null,               // crazy specials: full control via SpecialContext
}
```

Every fighter: ≥8 basic moves, ≥2 launchers, ≥2 throws (kind 'grab'), 4 specials
(one may be the super), 1 super (meterCost 100), 1 finisher, 1 hidden joke move.

## 5. Combat / MatchController expectations

- Combo chains: light→light→heavy style chains, cancel windows, combo scaling
  (each consecutive hit ×0.9 damage, floor 0.3), combo counter events.
- Input buffering (8-frame buffer), hit stop, hit/block stun, counter hits (+50%
  damage, announcer line), pushback, wall bounce + ground bounce with arena bounds.
- Throws beat block; blocking halves chip to 0 except specials (small chip).
- Finisher: when opponent HP ≤ 15% in the final round, HUD shows `FINISHER!` prompt;
  input `special+heavy` together triggers `def.finisher.script(fx)` → cinematic
  ragdoll sequence → KO.
- Emitted events (payloads are plain objects):
  `'match:start'`, `'round:start' {round}`, `'round:end' {winnerSlot}`,
  `'match:end' {result}`, `'fighter:hit' {slot, damage, move, counter, combo}`,
  `'fighter:blocked'`, `'fighter:ko' {slot}`, `'finisher:ready' {slot}`,
  `'finisher:start' {slot}`, `'combo' {slot, hits}`, `'meter' {slot, value}`,
  `'health' {slot, value, max}`, `'caption' {text}`, `'announcer' {line}`,
  `'camera:shake' {mag}`, `'slowmo' {scale, seconds}`.
- HUD listens to events; combat never touches DOM directly.

## 6. SpecialContext (`fx`) — API given to move/finisher scripts

```js
fx = {
  self, foe,                      // Fighter instances: .pos (THREE.Vector3), .facing (+1/-1),
                                  // .hp, .meter, .def, .bones, .playClip(name), .setState(s)
  frame(cb), after(nFrames, cb),  // schedule on the fixed clock
  hit({ damage, knockback, hitStun, ragdoll: 0|1|2, pos? }),   // apply a hit to foe
  impulse(target, [x,y,z], spin?),         // shove a fighter or prop handle
  ragdoll(target, impulse?),               // force full ragdoll
  spawnProp(kind, pos, opts?),             // 'coin'|'crate'|'vaultDoor'|'rocket'|'candle'|
                                           // 'chair'|'monitor'|'box'... returns handle
  coins(pos, n), particles(name, pos, opts?), shake(mag), slowmo(scale, seconds),
  caption(text), announcer(line), sfx(name, opts?), zoom(target, seconds),
  arena(),                                 // ArenaInstance
  physics(),                               // PhysicsManager
  end(),                                   // return control to the state machine (MUST call)
}
```

Scripts run on the fixed clock; `fx.end()` (or the move's total frame count elapsing,
whichever the script chooses) returns the fighter to `idle`.

## 7. Physics (`src/physics/`)

```js
new PhysicsManager(game, presetName)   // 'standard'|'silly'|'unhinged'
physics.step(dt)                       // called by MatchController each fixed frame
physics.setPreset(name)
physics.addStaticBox(center, size)     // arena floor/walls/platforms
physics.addProp(mesh, { shape:'box'|'cylinder'|'sphere', mass, breakable, health })
                                       // → handle { mesh, body, break(), remove() }
physics.impulse(handle|body, vec3, point?)
physics.propCount / physics.maxProps   // respects game.quality.propLimit; oldest debris culled
physics.dispose()
```

Collisions above an impact threshold emit `'physics:impact' {a, b, speed, pos}` on
`game.events` (audio/particles listen). Bodies sleep when settled. Velocity clamp
±80 m/s, NaN guards — physics must NEVER explode or hang.

```js
new RagdollManager(physics, game)
ragdolls.build(fighter)                          // pre-builds bodies+constraints from bones
ragdolls.full(fighter, impulse, spin?)           // full ragdoll (launch/KO/throw/finisher)
ragdolls.partial(fighter, region, impulse)       // 'head'|'armL'|'armR'|'legs'|'upper' flinch
ragdolls.update(dt)                              // sync bones<->bodies, blend partials
ragdolls.recover(fighter, ms?)                   // blend back to animation (getup)
ragdolls.isSettled(fighter)                      // true when velocity ~0
ragdolls.state(fighter)                          // 'none'|'partial'|'full'|'recovering'
```

Ragdoll masses scale with `def.weight`. Accessories (ears/trunk/tail extras) get
light spring-follow physics even outside ragdoll (secondary motion — always on).

## 8. Audio (`src/audio/library.js`)

`main.js` does `audio.installLibrary(AudioLibrary)`. Export:

```js
export const AudioLibrary = {
  init(engine),                    // called once after first user gesture
  sfx(engine, name, opts = {}),    // opts: { pitch, vol, pos }
  music(engine, trackId), stopMusic(engine),
  announcer(engine, line),         // original synthesized voice (SpeechSynthesis mangled + fallback)
  crowd(engine, mood),             // 'idle'|'cheer'|'gasp'|'wild'
}
```

Core sfx ids every module may request: `punch_light`, `punch_heavy`, `kick`,
`whoosh`, `block`, `grab`, `throw`, `coin`, `coins_burst`, `boing`, `thud`,
`launch`, `explosion`, `bell`, `break`, `slide`, `menu_move`, `menu_confirm`,
`menu_back`, `ko`, `trumpet` (Wally), `bark` (Dogey), `croak`, `moo`.
Music ids: `title`, `menu`, `select`, `battle_meme_market`, `results`. Unknown ids
must fail silently (console.debug at most).
`engine.channels` gain nodes: `master, music, sfx, announcer, crowd`.

## 9. Arenas (`src/arenas/`)

```js
export const MemeMarket = {
  id: 'meme-market', name: 'MEME MARKET',
  music: 'battle_meme_market',
  build(ctx)   // ctx = { scene, physics, quality, events, audio }
    => ArenaInstance
}
ArenaInstance = {
  group,                              // added to scene by builder
  bounds: { minX: -9, maxX: 9, wallBounce: 0.55 },
  floorY: 0,
  spawnPoints: [ -3, 3 ],             // x positions
  update(dt), dispose(),
  onRagdollLaunch?(fighter),          // hook for arena reactions (crowd, props)
}
```

Arena visuals: skybox via procedural canvas gradient/vertex-colored dome, instanced
low-poly crowd with 2-3 keyframe bounce loop, breakable props registered through
`physics.addProp`, hazards emit events. Respect `quality.crowd` / `quality.propLimit`.

`src/arenas/index.js` and `src/characters/index.js` are OWNED BY THE ORCHESTRATOR —
never edit them; they import your default exports by the names above.

## 10. Camera (`src/camera/CameraController.js`)

```js
new CameraController(camera, game)
cam.setFighters(f1, f2); cam.setBounds(arenaBounds)
cam.update(dt)            // framing: midpoint + distance from separation, smooth, clamped
cam.shake(mag)            // trauma-based, decays
cam.punchIn(seconds)      // hit-stop micro zoom
cam.koCinematic(target)   // slow orbit zoom on KO/finisher, tracks ragdoll flight
cam.setMode('match'|'cinematic'|'replay'|'free')
```

Listens to `'camera:shake'` and `'slowmo'` events. Never loses both fighters.

## 11. Coordinate & gameplay conventions

- Fight axis = **X** (2.5D: movement locked to X, depth Z used only by physics fx).
- Floor at y=0. Gravity -22 m/s² (snappier than realistic; presets scale bounce).
- Facing: `fighter.facing` is +1 (facing +X) or -1; `input` 'forward' resolves via facing.
- Units: meters; fighters ~1.6–2.6 m tall. Camera FOV 45.
- All timing in fixed frames @60. `hitStop` freezes both fighters + zoom-punch.

## 13. Third-person camera (v1.1)

The DEFAULT match camera is now an over-the-shoulder three-quarter view behind
Player 1's fighter: camera sits behind-and-above P1 offset along the fight axis
(opposite P1's facing) plus a lateral Z+ offset (~25-35 degrees off-axis so the
lane AND the -Z arena backdrop both read), looking past P1's shoulder at the
opponent. `cam.setStyle('thirdperson'|'classic')` switches; the active style
comes from `save.get('settings.camera', 'thirdperson')` and a Settings row.
Classic = the old side view (kept fully working). In third-person style:
- Framing keeps BOTH fighters composed (P1 lower-third foreground, foe centered).
- Facing swaps (P1 crosses the foe) rotate the rig 180° with a smooth ~0.5s
  swing, never a snap; all comfort caps/NaN guards still apply.
- KO cinematics / replay / playground keep their existing behaviors.
- INPUT in third-person: left/right become facing-relative — "right"/D means
  TOWARD the opponent, "left"/A means AWAY (retreat), regardless of world X.
  Classic style keeps absolute world-X mapping. Fighter.js resolves this.

## 14. Item system (v1.1) — `src/items/`

```js
new ItemSystem({ game, scene, physics, arena, arenaId, fighters, events, fx? })
items.update(dt)            // spawn cadence, despawns, held-item logic
items.tryPickup(fighter)    // walk-over is automatic; this is the manual hook
items.use(fighter)          // consume held item, run its effect
items.held(slot)            // -> itemDef | null
items.dispose()
```
Rules: max 2 items on the ground at once, max 1 held per fighter, new spawn every
12-18s at a random clear floor spot (telegraphed drop-in), ground items despawn
after ~15s (blink warning first). Fighters AUTO-PICKUP by walking over an item
(if hands empty); the 'item' action button USES the held item. Items are visible
low-poly props with a slow bob+spin and a ground ring.
Absurdity scales with arena tier = index in ArenaOrder (meme-market mild office
junk -> permanent-reserve-core reality-breaking). Every effect is scripted
(damage/launch/trap/comedy) through physics/props/particles/captions.
Events: 'item:spawned' {kind,pos}, 'item:pickup' {slot,kind}, 'item:used'
{slot,kind}, 'item:despawn' {kind}. HUD shows the held item per player.
InputManager action 'item' exists (P1 KeyE, pad LB); AI may pick up and use
items at aiLevel >= 2 (simple heuristics).

## 15. Gore system (v1.1) — `src/combat/Gore.js`

```js
new GoreSystem(match)        // match = MatchScreen (scene/physics/particles/fighters)
gore.onDamage(fighter, { attacker, damage, pos, dir })   // called on every hit
gore.onKO(fighter)           // extra burst
gore.onRoundReset()          // restores ALL parts + clears decals
gore.update(dt)              // decal fade, dripping
gore.dispose()
```
Progressive damage (per fighter, by hp fraction): <=70% accessories pop off
(glasses/hat/tie... become physics props), <=50% an ear/tail/secondary part
tears off with a blood burst, <=25% a forearm/hand detaches (bone meshes hidden,
replaced by a stump cap; detached parts are physics props that bleed briefly).
Blood: chunky low-poly red particle bursts scaled with damage, floor splatter
decals (pooled flat quads, fade after ~10s), KO fountain. Parts NEVER detach
from the hips/torso/head (fighters stay functional); Animator/ragdoll must stay
stable with hidden bones; EVERYTHING restores on round reset.
Honors `settings.gore`: 'none' = sparks only, zero blood/parts; 'cartoon'
(DEFAULT) = full blood + dismemberment as above; 'max' = more of everything +
lingering decals + fountains. Quality caps pool sizes.

## 16. Local versus removal (v1.1)

Local 2-player is REMOVED: the menu's "Local Versus" becomes "VERSUS CPU"
(select -> vs AI, aiLevel selectable 1-5 on the select screen), P2 keyboard
bindings stay in the engine (training dummy/debug) but the Settings remap UI
shows P1 only, HUD says "CPU" instead of "PLAYER 2" for AI slots, and docs drop
all local-2P claims.

## 17. Free-roam combat (v2.0)

Fighters move FREELY on the arena floor (XZ plane), not just the X lane:
- `fighter.pos` uses x AND z; arena bounds become `{minX,maxX,minZ,maxZ,wallBounce}`
  (default minZ -5.5, maxZ 5.5 when an arena doesn't specify; walls on all 4 sides).
- Controls are CAMERA-RELATIVE: actions left/right = strafe, NEW actions fwd/back =
  depth movement (W/S keyboard, stick Y on pad). jump = Space / pad A(0),
  crouch = KeyC, block = ShiftLeft / pad LB(4). Full new default map in GameConfig.
- SOFT LOCK-ON: the fighter auto-faces the opponent (smooth yaw) whenever attacking
  or within ~6m; `fighter.facing` becomes a yaw angle (radians) with `facingSign`
  kept for legacy move-input resolution ('forward' token = toward foe).
- Hit detection: distance + facing-cone (~70°) + height overlap replaces X-AABBs.
  Knockback/ragdoll impulses use the 3D attacker->victim direction. Wall bounces
  work on all four walls. Move scripts keep working: fx.hit directions are resolved
  along the attacker's facing.
- AI navigates in 2D (approach vectors, personality strafing/circling, item routes).
- Items spawn at XZ spots; hazards gain z placement. Everything clamps to bounds.

## 18. Tracking third-person camera (v2.0 — replaces §13 styles)

ONE camera style: fixed-offset TRACKING third person on the player character
(slot 0, or the tracked fighter in AI matches): boom behind the character at
~(dist 5.2-8 frustum-fit, height 2.4, pitch ~-12°), yaw softly following the
character's movement/facing with lock-on bias (in combat range the camera settles
so the camera looks over the player's shoulder AT the opponent — both composed,
player lower-third). Player can free-roam the whole stadium and the camera follows
smoothly (critically-damped springs, wall/floor clamps, occlusion fade on props,
all comfort caps). The 'classic' style and the settings CAMERA row are REMOVED
(single, flawless path). KO cinematic/replay/playground behaviors preserved.

## 19. Crowd audio rework (v2.0)

The crowd must sound like a CROWD, not static: layered vocal-ish synthesis —
low murmur bed (band-passed noise is ok ONLY as a sub-layer), cheer swells built
from detuned oscillator "aah/ooh" vowel clusters (formant-shaped), clap/stomp
rhythm bursts, whistles. Moods idle/cheer/gasp/wild crossfade. NAME CHANTS:
occasionally (cooldown >=18s, on combos>=6/KOs/round wins) the crowd chants the
relevant fighter's display name in support — rhythmic two-beat chant via
SpeechSynthesis (2-3 stacked low-volume utterances, syllable-split like
"WAL-LY! WAL-LY!") through the crowd channel, melodic synth chant fallback when
speechSynthesis is unavailable. Names come from the Characters registry via the
'match:start' payload. Never painful, never louder than the master compressor.

## 20. Tutorial + mobile (v2.0)

- Story CHAPTER 1 opens as a guided TUTORIAL (rules.tutorial=true): sequential
  objective cards (move, jump, block, light combo, heavy, kick, grab, special,
  super w/ granted meter, item pickup+use, finisher w/ granted setup) with key
  glyphs matching the player's device (keyboard vs touch), opponent docile until
  the final live fight; skippable anytime; completing it = chapter 1 win path
  continues as normal. `src/modes/Tutorial.js` exports TutorialDirector(match,
  game) driven by MatchScreen when rules.tutorial.
- MOBILE: touch devices get an auto-shown virtual control overlay (left stick +
  right button cluster: JUMP/LIGHT/HEAVY/KICK primary + BLOCK hold, SPECIAL,
  SUPER, GRAB, ITEM secondary) feeding InputManager as player 0; Game defaults
  quality 'low' + pixelRatio cap 1.5 on touch devices (already wired in core);
  UI must remain usable at 390x844 portrait-ish and 844x390 landscape (landscape
  is the target; portrait shows a rotate hint).

## 21. KO executions (v2.0) — `src/combat/Executions.js`

A shared pool of over-the-top generic KO EXECUTIONS for variety on top of each
fighter's signature finisher: exports `ExecutionPool.pick(excludeId)` ->
`{ id, name, script(fx) }`. On a finisher trigger the engine picks 50/50 between
the fighter's own finisher and a pool execution (never the same pool id twice in
a row; match stores lastExecutionId). Pool (8): MARKET STEAMROLLER (gold-bar
steamroller flattens them into a coin), LIQUIDATION TRUCK (truck sweeps them
off), ORBITAL CANDLE STRIKE (sky-beam of green candles), HAND OF THE MARKET
(giant hand descends and flicks them into orbit), BEAR RAID (bear stampede),
ETF VACUUM (giant vacuum sucks them in, ejects labeled cubes), FINAL AUDIT
(paper avalanche + giant DENIED stamp), THE RUG (literal giant rug yanked from
under them). Each: 3-6s, arena-agnostic, prop/particle/caption/announcer beats,
restore-safe, gore-aware (blood only when gore != none).

## 22. Presentation (v2.1)

- Title screen footer: "© 2009 SATOSHI NAKAMOTO · NO REFUNDS · NOT FINANCIAL ADVICE"
  (Satoshi replaces the 2002 studio line on the HOMESCREEN only; credits keep the
  studio gag).
- "Replay Intro" LEAVES the main menu; Settings gains a REPLAY INTRO row.
- The intro cinematic plays a dedicated HYPE track (music id 'intro_hype' — driving,
  rising energy) and the announcer CALLS EACH FIGHTER'S NAME on their shot.

## 23. Auto KO executions (v2.1 — supersedes the §21 finisher-input flow)

EVERY round-ending KO automatically plays an execution cutscene — no button input.
Tier by the killing blow's move kind:
- light/kick → BASIC pool (quick 2-3s flourishes, >=4 distinct),
- heavy/launcher/grab/throw → HEAVY pool (3-4s, >=4 distinct),
- special/super → ABSURD pool (the 8 existing + new; 4-6s; scripts receive
  fx.context = { killingMoveId, killingKind, attackerCharId } and the absurd ones
  should ECHO/AMPLIFY the special that landed when recognizable).
The ATTACKER's owner-signature finisher joins the absurd pool for their KOs.
No same-execution twice in a row per tier. SKIPPABLE with ANY button/tap → clean
flush straight to round end (all execution scripts must tolerate mid-flush).
The old FINISHER! prompt/chord UI is removed.

## 24. Balance & difficulty (v2.1)

- GameConfig.balance = { maxHpScale, damageScale } applied globally by combat
  (target: a typical evenly-matched round runs 3-4 minutes; tune scales to hit it,
  start near 1.6 / 0.85).
- rules.roundTime = 300 (5:00 hard cap; HUD shows M:SS).
- Story/Arcade escalation: opponent aiLevel curve stays EASY early and caps at 4
  (rounds 1-2: lvl 1; 3-4: lvl 2; 5-6: lvl 3; 7-8: lvl 3; 9-10: lvl 4) while
  opponent HP multiplier climbs 1.0 → ~1.9 (rules.p2HpMult, supported by combat) —
  late-game difficulty comes from BULK, not superhuman skill.

## 25. Item delivery rework (v2.1 — supersedes §14 random spawns)

NO random spawn-ins. Two delivery paths:
1) AUTHORED PLACEMENTS: each arena has 2 fixed item spots (per-arena coordinates
   authored in the items module) populated at round start from that arena's tier
   roster.
2) AUDIENCE THROWS: every 20-30s while ground items < 2, an item is HURLED from
   the crowd — arc from a stand-side origin with a landing-spot telegraph ring +
   whoosh; a crowd instance near the origin does a little wind-up bounce.
HEART DROPS: when a breakable prop BREAKS, 30% chance (>=12s cooldown, max 1 live)
a glowing heart pickup ejects with a BIG impulse (lands far from the break); the
FIRST fighter (either) to walk over it heals +12. Hearts pulse and never despawn
before 20s. Item caps unchanged (2 ground / 1 held).

## 26. Radio stations (v2.1)

settings.radio: 'default' | 'hiphop' | 'edm' | 'lofi' | 'rockmetal'. GTA-style
Settings row. 'default' = the shipped per-arena themes. Each other station: >=3
procedural tracks in genre (hiphop: boom-bap drums + bass + sample-ish stabs;
edm: four-on-floor + supersaw builds/drops; lofi: dusty chill keys + vinyl
crackle + laid-back drums; rockmetal: distorted power-chord riffs + driving
double-kick). v2.1.1: the station governs ALL music — menus, title, intro,
results AND matches ('default' = per-context themes). Changing the station swaps
the currently playing track within ~1 bar on any screen; switching back to
'default' restores the context-appropriate theme.

## 27. Camera & crowd rendering (v2.1)

- settings.cameraLock (default true): false = pure follow camera, no lock-on
  framing bias (Settings toggle "OPPONENT CAMERA LOCK").
- settings.jumpEnabled (default true): false = jump input ignored, jump hidden
  from touch overlay + tutorial (Settings toggle).
- CROWD MUST NEVER VANISH: fix the disappearing-crowd bug (InstancedMesh frustum
  culling with stale bounds — set frustumCulled=false or maintain correct bounding
  spheres). Crowds fade ONLY when genuinely between camera and a fighter.
- Occlusion: ANY tagged occluder between the camera and either fighter fades
  reliably (continuously sampled while moving/through objects), restores cleanly.
- Crowd colors: mixed palette as today, PLUS ~12% of instances per fighter wear
  that fighter's primary color (MatchScreen passes ctx.fighterColors = [hexP1,
  hexP2] into arena build; buildCrowd tints).

## 28. Fight download (v2.1)

Full-match recording via MediaRecorder(canvas.captureStream) — feature-detected,
starts at match:start, stops at match:end, sane bitrate (~2.5Mbps), keeps the
LAST fight only (revoke old URLs). Exposed as game.fightRecording { available,
blob, download(filename) }. Replay viewer AND results screen gain a
DOWNLOAD FIGHT button (hidden when unsupported/empty).

## 12. Ownership map (phase 1)

| Module | Owner agent | Files |
|---|---|---|
| Core spine | orchestrator | `src/core/*`, `src/config/*`, `src/main.js`, index registries |
| Physics | physics agent | `src/physics/**` |
| Combat | combat agent | `src/combat/**` |
| Wally | wally agent | `src/characters/wally.js` (self-contained) |
| Dogey | dogey agent | `src/characters/dogey.js` (self-contained) |
| Arena | arena agent | `src/arenas/ArenaBase.js`, `src/arenas/memeMarket.js` |
| UI | ui agent | `src/ui/**` |
| Audio | audio agent | `src/audio/**` |
| Camera | camera agent | `src/camera/**` |

Character files must be fully self-contained (their own helper functions inline) —
no shared character utility file in phase 1.
