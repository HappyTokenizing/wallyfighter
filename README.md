# WALLY: CRYPTO SMACKDOWN

**10 FIGHTERS. 1 RESERVE. TOTAL CHAOS.**

*The tokenization event of the century — settled with fists.*

A deliberately retro, early-2000s low-poly 3D crypto-parody arena brawler.
Three.js + cannon-es + Vite, plain JavaScript ES modules. No backend, no
wallets, no downloads, no third-party assets — every model, texture, animation,
song and sound effect is generated procedurally in code, at runtime, from this
repository alone. It looks like 2002. It is engineered like it shipped yesterday.

> **Disclaimer:** It was not financial advice.

---

## Features

- **Free-roam arena combat** (v2.0) — fighters move anywhere on the arena
  floor, not just a lane. All four walls bounce, knockback is fully 3D, and a
  **soft lock-on** keeps your fighter facing the opponent whenever you attack
  or close in — you steer, the game aims.
- **Tracking third-person camera** (v2.0) — one camera, done right: a smooth
  boom behind your fighter that follows you anywhere in the stadium and
  settles over your shoulder when the fight closes in, keeping both fighters
  composed. Critically-damped springs, wall clamps, occlusion fade — no
  camera settings to fiddle, no way to lose the action.
- **10 playable fighters**, each a fully self-contained parody with its own
  rig, procedural animation set, movelist (8+ basics, launchers, throws,
  4 specials, a meter-burning super), a cinematic finisher and one hidden joke
  move — plus a story-only boss form of The Blackish Bull: **UNCHAINED**.
- **Automatic KO executions** (v2.1) — every round-ending KO plays an
  execution cutscene, no input required: the FINISHER prompt and its button
  chord are gone. What you get is tiered by the killing blow — lights and
  kicks earn quick flourishes, heavies/launchers/grabs get the mid-size
  treatment, and specials/supers unlock the ABSURD pool (the MARKET
  STEAMROLLER, LIQUIDATION TRUCK, ORBITAL CANDLE STRIKE, HAND OF THE MARKET,
  BEAR RAID, ETF VACUUM, FINAL AUDIT, THE RUG and friends — which echo the
  special that landed when they recognize it, and include each fighter's
  signature finisher). Never the same one twice in a row, and **any button
  skips it**.
- **A crowd that actually sounds like a crowd** (v2.0) — layered murmur,
  vowel-shaped cheer swells, claps, stomps and whistles that react to the
  fight, plus occasional rhythmic **name chants** ("WAL-LY! WAL-LY!") when
  someone lands a big combo, wins a round or scores a KO.
- **10 arenas** with procedural skies, instanced low-poly crowds, breakable
  props and stage hazards — from the MEME MARKET to the PERMANENT RESERVE CORE.
- **Pickup items** in every arena — v2.1 retires the random spawn-ins: each
  arena starts its rounds with two authored item spots, and while the floor
  is light the **audience hurls more in from the stands** (telegraphed landing
  ring, every 20–30 s). Breaking props sometimes ejects a glowing **heart
  pickup** (+12 HP, first fighter to reach it). Walk over an item to grab it,
  press **E** (pad **Select**, touch **GRAB/ITEM**) to use it. Never more than
  two on the ground, one in hand; the absurdity scales with the arena tier.
  The CPU grabs and uses them too (level 2+).
- **Blood and progressive dismemberment** — fighters visibly fall apart as
  they get beat up: accessories pop off, then an ear or tail tears away, then
  a forearm — with chunky low-poly blood, floor splatter and KO fountains.
  Everything reattaches between rounds, and the **NO GORE** setting swaps all
  of it for harmless sparks (see the [Settings guide](#settings-guide)).
- **Story Mode** — a ten-chapter campaign as Wally, from meme-market brawler to
  CFO of Violence, ending in a boss transformation, a FINAL CHOICE and
  **two endings** (plus scrolling credits). **Chapter 1 doubles as a guided
  tutorial** (v2.0): objective cards walk you through movement, blocking,
  combos, items, meter and your first finisher — skippable anytime, and the
  key glyphs match your device (keyboard or touch). Progress is saved.
- **Mobile support** (v2.0, simplified in v2.1) — touch devices get an
  auto-shown virtual overlay with a stick and just **four buttons** (ATTACK,
  HEAVY, SPECIAL with a long-press SUPER, contextual GRAB/ITEM) plus a
  hold-to-block zone, tap-driven menus, a performance-first default quality
  preset, and a UI tuned for landscape phones. Rotate hint in portrait. See
  [Mobile](#mobile).
- **5:00 rounds, rebalanced** (v2.1) — bigger health pools and slightly
  softer damage tune a typical even round to 3–4 minutes under a hard 5:00
  cap (the HUD counts down M:SS). Story/Arcade difficulty now escalates
  through opponent **bulk** (HP multipliers) rather than superhuman AI — the
  CPU level curve stays gentle and tops out at 4.
- **Radio stations** (v2.1) — a GTA-style RADIO STATION setting for match
  music: DEFAULT (the per-arena themes), HIP HOP, EDM, LO-FI or ROCK METAL,
  each with a rotation of procedural tracks in genre. Switches apply live,
  even mid-match; menus keep their own themes.
- **Full-fight download** (v2.1) — the whole match is recorded (browser
  support permitting) and both the results screen and the replay viewer offer
  a **DOWNLOAD FIGHT** WebM export. Keeps the latest fight only.
- **Arcade Ladder** — pick anyone, climb a randomized 7-rung ladder with
  escalating AI, keep your streak alive on the continue screen.
- **Versus CPU** — pick your fighter, pick your opponent, set the CPU
  difficulty (1–5) and settle it. The machine swings back.
- **Training Room** — inert dummy, infinite health, auto-full meter,
  hit/hurtbox display, live input history, frame-data readout, movelist panel,
  one-key reset.
- **Ragdoll Playground** — launch puppets, rain props, build prop towers,
  detonate explosions at the cursor, drag the gravity slider, cycle physics
  presets, toggle slow-mo. Physics crimes, no witnesses.
- **AI Exhibition** — both corners are bots; let the market trade blows.
- **Instant replay + clip export** — relive the KO in slow-mo orbit and export
  a WebM clip straight from the game (browser support permitting — see
  [Troubleshooting](#troubleshooting)).
- **Full ragdoll physics** — cannon-es ragdolls with partial flinches, full
  launches, wall/ground bounces and comedy knockback.
- **Physics presets** — Standard, Silly, and **Unhinged** (2.6× knockback,
  do not operate heavy machinery).
- **Performance presets** — Low / Medium / High quality scaling (60 fps target).
- **Personality AI** (levels 0–5) — every fighter fights like themselves,
  now navigating in 2D: approach vectors, strafing, circling, item routes.
- **Gamepad support** — plug in and go, standard mapping.
- **Procedural everything** — geometry, textures, keyframe animation, a full
  synthesized soundtrack (title/menu/select/results plus a unique battle theme
  per arena), sound effects, crowd, and an over-dramatic announcer.
- **36-second in-engine intro cinematic** on first boot — now scored with a
  dedicated hype track while the announcer calls each fighter's name (v2.1).
  Skippable, and rewatchable from **Settings → REPLAY INTRO**. Plus a
  character gallery, movelist browser and credits.

## Quickstart

```
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
```

Open the dev URL, press any button, lose money responsibly.

## Deploying to Vercel

The repo is deploy-ready — no environment variables, no backend, no external
services. Push it to GitHub and import the repo at
[vercel.com/new](https://vercel.com/new); `vercel.json` already pins everything:

| Setting | Value |
|---|---|
| Framework preset | Vite (auto-detected) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Node version | 18+ |

Hashed asset bundles under `/assets/` are served `immutable` for a year while
`index.html` is revalidated every request, so a redeploy takes effect instantly
without stale chunks.

Or from the CLI:

```bash
npx vercel --prod
```

**Notes for the deployed build**

- `dist/` is gitignored on purpose. Vercel builds from source.
- The `?cap=1` visual-QA rig and the `/__shot` screenshot sink are **dev-only**
  (the Vite plugin is `apply: 'serve'`), so neither ships in the bundle.
- Everything is generated at runtime — geometry, textures, animation, music,
  SFX. There are no binary assets, so the whole game is ~1 MB gzipped of JS.
- First load generates procedural textures on the main thread; the loading
  screen covers it. Subsequent arena entries are time-sliced.
- WebGL2 required. Quality auto-selects `low` on touch devices; users can
  override in Settings.

## Controls (summary)

| Action       | Keyboard   | Gamepad | Touch (v2.1 simplified) |
|--------------|------------|---------|-------|
| Move         | W / A / S / D | Left stick / D-pad | Left virtual stick |
| Jump         | Space      | A / Cross | Small JUMP button (only while Jumping is ON) |
| Light attack | J          | X / Square | ATTACK |
| Heavy attack | K          | Y / Triangle | HEAVY |
| Kick         | L          | B / Circle | — (no touch button; light chains cover it) |
| Grab / throw | U          | LT      | GRAB/ITEM (contextual) |
| Special      | I          | RB      | SPECIAL (tap or hold) |
| Super        | O          | RT      | SPECIAL **long-press** (~0.6 s, meter full) |
| Block (hold) | Left Shift | LB      | Hold the upper-left screen zone |
| Crouch       | C          | —       | Flick the stick straight down (a crouch tap) |
| Use item     | E          | Select/Back | GRAB/ITEM (shows the item's icon) |
| Pause        | Esc        | Start   | ⏸ chip |

**Free-roam movement:** WASD (or the stick) moves your fighter anywhere on
the arena floor, **relative to the camera** — W is deeper into the arena,
S is toward the camera, A/D strafe. A **soft lock-on** auto-faces the
opponent whenever you attack or get within combat range, so movelist inputs
that say "forward" always mean **toward the opponent**. Dash with a quick
double-tap of any movement direction. **KO executions are automatic** as of
v2.1 — there is no finisher chord or prompt; land the round-ending blow and
the cutscene plays itself (any button skips it). Every fighter hides a joke
move behind **Crouch, Crouch, Light**. Full tables, menu navigation,
per-mode keys, touch details and the complete combo grammar live in
[`CONTROLS.md`](CONTROLS.md).

## Mobile

- On any touch device the game auto-shows a translucent **virtual control
  overlay** during fights. v2.1 cut it down to a stick and **four buttons**:
  **ATTACK** (light), **HEAVY**, **SPECIAL** (long-press ~0.6 s with a full
  meter to fire your **SUPER** — a gold ring fills while you hold) and a
  contextual **GRAB/ITEM** button that shows your held item's icon and uses
  it, or grabs when your hands are empty. **BLOCK** is a hold-anywhere zone
  on the upper-left half of the screen (it outlines itself once, on your
  first match), a small **JUMP** button appears only while the Jumping
  setting is ON, and a pause chip rounds it out. Menus never show the
  overlay — they are ordinary tap targets.
- **Touch limitation (documented, deliberate):** there is no KICK button on
  touch — light-attack chains cover its role, and the few move-list inputs
  that require Kick are keyboard/gamepad-only. The hidden joke move still
  works: flick the stick **straight down twice**, then tap **ATTACK**.
- **Landscape is the supported orientation** (the UI is tuned down to
  844×390); portrait shows a big ROTATE DEVICE screen.
- Touch devices default to the **Low** quality preset with a capped render
  resolution for a stable frame rate — raise it in Settings if your device
  keeps up; your choice persists.
- Desktop testing: set `localStorage` key `wcs-touch` to `1` to force the
  overlay on any machine (or `0` to suppress it on a touch laptop).

## Modes guide

| Mode | What it is |
|------|-----------|
| **Story Mode** | 10 chapters as Wally, one per arena in narrative order. **Chapter 1 opens as a guided tutorial** — sequential objectives for movement, jumping, blocking, combos, heavy/kick/grab, specials, super (meter granted), items and your first KO (setup granted — the execution plays itself), with your device's actual keys shown, a docile opponent until the final live fight, and a skip available the whole time. Completing it counts as the chapter 1 win. v2.1 difficulty climbs through opponent **bulk**: the CPU level curve stays gentle (capped at 4) while late-chapter HP multipliers grow toward ~1.9×. Chapter 10 is the UNCHAINED boss fight, then the FINAL CHOICE (Seize or Stabilize) and its ending. Progress persists. |
| **Arcade Ladder** | Any fighter, 7 randomized opponents across shuffled arenas, AI escalating rung by rung. Lose and the continue screen judges you. |
| **Versus CPU** | Pick your fighter, then choose your CPU opponent, then set its difficulty (1–5, default 3 — from PAPER HANDS to MARKET MAKER). Costume swap on Heavy, random arena, best of 3. |
| **Training** | Pick yourself and a dummy, then abuse the toggles: F1 infinite HP, F2 full meter, F4 hitboxes, F5 input history, F6 frame data, F7 movelist, R reset. |
| **Ragdoll Playground** | One or two puppets, a random arena, and a legend panel full of buttons that should not exist. Click to drop props at the cursor. |
| **AI Exhibition** | Pick both corners; both are level-3 bots. Attach popcorn. |
| **Gallery / Move List / Credits** | Admire the portfolio, read the whitepaper, see who rugged this together. |

(The intro cinematic replay moved out of this menu in v2.1 — it lives in
**Settings → REPLAY INTRO** now.)

## Settings guide

Open **Settings** ("TOKENOMICS & TUNING") from the main menu:

- **Graphics quality** — Low / Medium / High. Scales render resolution
  (pixel ratio), shadows and shadow-map size, crowd size, debris and particle
  counts, prop limits, and reflections. Applies live and persists. Touch
  devices default to Low.
- **Physics preset** — Standard / Silly / Unhinged. Scales knockback, bounce,
  spin and debris. Applies to the next match (and can be cycled live in the
  Ragdoll Playground with **B**).
- **Damage style** — No Gore / Cartoon Damage (default) / Maximum Chaos.
  Damage *visual* style only, never the numbers. **Cartoon Damage** is the
  full treatment: blood bursts, floor splatter and progressive dismemberment
  as health drops. **Maximum Chaos** adds more of everything, lingering
  decals and KO fountains. **No Gore** replaces all of it with harmless
  sparks — zero blood, zero detached parts — for sensitive players.
- **Radio station** (v2.1) — DEFAULT / HIP HOP / EDM / LO-FI / ROCK METAL.
  Governs **match** music only (menus keep their themes): DEFAULT plays the
  shipped per-arena battle tracks, every other station rotates through at
  least three procedural tracks in its genre, a fresh one per match. Applies
  live, even mid-match.
- **Opponent camera lock** (v2.1) — ON (default) keeps the tracking camera's
  over-the-shoulder lock-on framing bias toward the opponent; OFF makes it a
  pure follow camera. Applies live.
- **Jumping** (v2.1) — OFF ignores all jump input, hides the touch overlay's
  JUMP button and drops the jump step from the tutorial. For people who
  believe fighting games happen on the ground. Applies live.
- **Replay intro** (v2.1) — the 36-second opening cinematic, moved here from
  the main menu.
- **Volumes** — five live sliders: Master, Music, SFX, Announcer, Crowd.
- **Controls** — full keyboard remapping for Player 1 (including the **Item**
  action): select an action and press the new key (Esc cancels, RESET
  restores defaults). Changes apply instantly and are stored in the save file;
  overrides saved under `controls.p1` are honored on boot — and the touch
  overlay honors them too. (Legacy `controls.p2` data from v1.0 is preserved
  but no longer editable in the UI — see [`CONTROLS.md`](CONTROLS.md).)

(v2.0 note: the v1.1 **Camera** setting is gone — the tracking third-person
camera is now the one and only match camera, so there is nothing to toggle.)

Everything persists in `localStorage` under the key `wally-crypto-smackdown`.

## Tech architecture

Plain ES modules, no framework, no TypeScript, no asset pipeline. The engine
contract every module conforms to is in [`CONTRACTS.md`](CONTRACTS.md).

```
src/
  main.js               boot: build Game, install audio library, start the loop
  config/GameConfig.js  title, rules, control bindings, physics/quality presets
  core/                 Game (fixed 60 Hz update + rAF render, accumulator loop),
                        EventBus, SaveManager (localStorage), InputManager
                        (keyboard + gamepad, per-frame edges, combo buffer),
                        AudioEngine (Web Audio channel graph), ScreenManager
  ui/                   registerScreens (all screens + CRT chrome), uiKit,
                        Hud (event-driven match HUD, pause menu, center-text
                        arbitration), TouchControls (virtual mobile overlay
                        feeding InputManager), MenuBackdrop, ui.css, screens/
                        (loading, title, menu, select, vs, results, settings,
                        gallery, movelist, credits)
  combat/               MatchScreen (round/match flow, hit resolution, combos,
                        meter, throws, finishers), Fighter (state machine,
                        free-roam XZ movement, soft lock-on, move execution),
                        Animator (procedural clip crossfader), Human/AIControl,
                        SpecialContext (scripted specials/finishers API),
                        Executions (shared KO-execution pool), Particles,
                        Props, FallbackDef, Gore (blood, splatter decals,
                        progressive dismemberment)
  items/                ItemSystem — arena pickups: tiered spawn tables, drop-in
                        telegraphs, auto-pickup, scripted use effects
  characters/           10 self-contained fighter defs + orchestrator-owned index
  arenas/               ArenaBase helpers + 10 arenas + orchestrator-owned index
  physics/              PhysicsManager (cannon-es world, presets, props, NaN
                        guards), RagdollManager (build/full/partial/recover)
  ai/                   Brain, per-fighter personalities, harness (levels 0-5)
  audio/                library (installable AudioLibrary), synth, music
                        (procedural tracks), sfx, voice (announcer), crowd
                        (layered vocal synthesis + name chants)
  camera/               CameraController (tracking third-person boom, framing,
                        shake, punch-in, KO cinematics, replay orbit)
  modes/                StoryMode, ArcadeMode, TrainingMode, RagdollPlayground,
                        IntroCinematic, Tutorial (chapter-1 director)
```

Conventions: fighters roam the arena floor on the XZ plane inside 4-wall
bounds, floor at y=0, gravity −22 m/s², all gameplay timing in fixed frames
@60 Hz. Screens are `{ enter, exit, update, render }` objects registered on a
shared `ScreenManager`; systems communicate over a global `EventBus` (the HUD
never touches combat, combat never touches the DOM).

## Performance notes

- Target is a locked **60 fps**. The simulation runs on a fixed 60 Hz clock
  with an accumulator (and a spiral-of-death guard), so game speed never
  depends on display refresh — a 144 Hz monitor renders more, simulates the same.
- Press **F3** for the built-in FPS / active-screen / quality overlay.
- If it stutters, drop the quality preset. **Low** disables shadows and
  reflections, halves resolution scaling, and cuts crowd (24 heads), debris,
  particles and prop limits. **High** is 2× pixel ratio, 2048 shadow maps,
  120-head crowds and full debris — tuned for a mid-range GPU.
- Touch devices boot on **Low** with a capped device pixel ratio; the setting
  is yours to raise and it persists.
- Physics bodies sleep when settled, debris is culled oldest-first past the
  quality preset's prop limit, and velocities are clamped so the world can
  never explode. (The Unhinged preset merely makes it *look* like it did.)

## Troubleshooting

- **No sound?** Browsers block audio until the first user gesture. The
  AudioContext unlocks on your first click, tap or key press — press a button
  on the title screen and the music starts. If the announcer is silent, your
  browser may have no SpeechSynthesis voices; his lines (and the crowd's name
  chants) fall back to pure synth.
- **Gamepad not responding?** The Gamepad API only reports pads after
  interaction — press any button on the pad once it's plugged in. The first
  pad to connect drives Player 1. Standard mapping is assumed (Xbox/PS
  layouts).
- **No touch controls on a touch laptop?** The overlay only shows during
  fights, never in menus. To force it on or off, set the `wcs-touch`
  localStorage key (`1` = always available, `0` = never).
- **Clip export gives no file?** WebM export needs `MediaRecorder` +
  `canvas.captureStream` support (Chrome, Edge and Firefox: yes; Safari:
  spotty). Where recording isn't supported the game tells you instead of
  silently failing.
- **No DOWNLOAD FIGHT button?** Same story: the full-match recording (v2.1)
  is feature-detected, so on browsers without `MediaRecorder` support the
  button simply doesn't appear. Only the **latest** fight is kept — download
  it before the next match overwrites it.
- **Game frozen in a background tab?** Browsers throttle `requestAnimationFrame`
  in hidden tabs; the fixed-step loop pauses with it and resumes cleanly.
- **Want a full reset?** Clear the `wally-crypto-smackdown` key from
  localStorage — settings, story progress, arcade streaks and the intro-seen
  flag all live there. (This is also the only "wallet" the game has.)

## License

The project's own source code — all of it, including every procedural asset
generator — is released under the **MIT License** (see `package.json`).
Dependencies: [three](https://github.com/mrdoob/three.js) (MIT),
[cannon-es](https://github.com/pmndrs/cannon-es) (MIT), and
[Vite](https://vitejs.dev) (MIT, dev-only). No third-party art, audio, or font
assets are bundled — the full truthful manifest and the audit behind that claim
are in [`ASSET_LICENSES.md`](ASSET_LICENSES.md).

---

*TOTALLY REAL GAME STUDIOS © 2002. All rights reserved, none exercised.
Any resemblance to actual financial instruments, living or delisted, is
parody. It was not financial advice.*
