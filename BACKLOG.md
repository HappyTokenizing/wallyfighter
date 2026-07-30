# WCS build backlog (orchestrator notes)

## v2.0 — 2026-07-30: free-roam brawler conversion
15-agent workflow complete, integration all-green (10-fighter arena sweep, z-variance
2.1-8.3, zero errors). Free-roam XZ combat w/ soft lock-on + cone hits + 4-wall bounces;
single tracking follow-cam (getYaw contract, 3 rad/s cap, classic style removed); 2D
personality AI (45-pairing harness pass); all 10 arenas 4-walled w/ z-placed hazards;
crowd audio rebuilt (vowel-cluster body, murmur <=0.25x cluster, name chants w/ 18s
cooldown via wireCrowdChants); 8-execution KO pool 50/50 vs signature finishers;
story ch.1 tutorial (11 objectives, skippable, one-time); touch controls + landscape
audit + rotate hint; INVISIBLE-BODY ROOT CAUSE FIXED (ragdoll driver watchdog +
idempotent recover — setState-out-of-ragdoll without recover() left bones pinned to
settled bodies); vendor/characters/arenas/audio chunk splitting; muted-boot toast.
Critic rounds 1-3: 7.5 not-wowed with ONE open P1 (tutorial poke dummy aimed legacy
world-X; whiffed off-axis = soft-lock). FIXED inline (atan2 aim, verified dot 1.0 vs
0.39) — final verification critic running. Known P2 residue: character-script cosmetic
particles pinned to z=0 when duels sit off-lane; peepee finisher pins foe to z~0
during the vortex; chant utterances wave-sequential not stacked (platform limit).

## v1.1 — 2026-07-30: third-person / items / gore / versus-CPU
SHIPPED, feel gauntlet 9/10 wowed (3 rounds, 0 open P0/P1). Third-person over-shoulder
camera default (classic toggle in Settings; facing-relative controls in TP), 32 pickup
items across 10 arena tiers (max 2 ground / 1 held, KeyE / pad LB to use, AI uses them),
GoreSystem (blood scaled by damage, splatter decals, dismemberment at 70/50/25% hp,
restore-complete on round reset; settings gore none/cartoon/max honored), local 2P
removed -> VERSUS CPU with difficulty picker, HUD item slots + CPU badges, docs updated.
Known notes: items TIER_BY_ARENA mirrors ArenaOrder by hand; held items persist across
rounds by design; AI item use is probabilistic. Version 1.1.0.

## FINAL VERDICT — 2026-07-30, critic gauntlet complete
All four harsh-critic domains PASSED with 8.5/10, wowed=true, zero open P0/P1:
- VISUAL (3 rounds): "the art direction is genuinely cohesive... I would show to another director."
- FEEL (2 rounds): "~30 min of hostile probing... a ragdoll/physics layer I could not break."
- CONTENT (2 rounds): "the comedy genuinely lands... shareable work."
- DoD (2 rounds): "the full Definition of Done now passes end to end."
Gauntlet fixes landed along the way: edge-camera pull-in + prop sightline fades, replay
occluder rules, announcer ShuffleBag pools (no repeats), menu/results/remap responsive
breakpoints, IP scrub (SAFE-ISH etc.), opaque credits hint bar, boss beat polish.
Remaining (optional next tuning pass, all P2): launcher juggle conversion outside the
corner; instant-replay window trimming (5s fixed pads short KOs); per-move announcer
variety under AI spam; two static strings on the results card; bundle code-splitting
(1.6MB chunk warning). PROJECT COMPLETE at v1.0.0.

## Status 2026-07-29 ~5:45pm EDT
All 10 fighters BUILT + REGISTERED + headless-validated (rigs, clips, supers, grabs,
finishers all pass; UnchainedBull boss form builds). Roster workflow's first run hit the
session usage limit: 9 arena agents, combat-fixes, arena-music, integrator failed; workflow
RESUMED as run wf_a21b629c-021 (task wyc0rx28k) after the 5:40pm reset — char agents cached,
the 12 failed agents re-running. I registered characters/index.js inline myself (integrator
will verify). After this lands: critic round-2 combat fixes below, then Phase 4.

## Critic round-1 verdict: 5.5/10 (full report in session log)
DONE (workflow wcs-critic-fixes-r1, all 4 verified): dogey hip convention (P0, node-sampled),
select-screen layout collapse <=1100px + Firefox slider track, heading shadow unification
(--wcs-extrude var), Wally/Dogey portrait identity, HUD center-text priority queue + meter
notches + heal-flash bug + dead display clock, camera directional kick + scaled punch-in +
round-1 entrance dolly.

## Round 2 — combat-owned files (BLOCKED until wcs-roster-arenas workflow completes)
1. Props.js spawn() drops opts.color/size/scale — finisher props (green candle, whitepaper,
   token machine) spawn as generic cubes; forward opts into builders.
2. Particles.js missing 'dust'/'explosion'/'spark' ids (~12 call sites fall through to white
   cubes): add dust (brown smoke), explosion (two-stage orange/red + expanding ring),
   alias spark->sparks.
3. Hit-stop/slow-mo frame counters decrement per RENDER frame in MatchScreen.update —
   halves the feel on 120/144Hz monitors. Move onto the fixed 60Hz clock.
4. Fighter.flash default 0x881111 invisible on dark fur — default white 0xffffff 2 frames;
   scale cam.punchIn amount/duration with hit-stop frames at the call site; call cam.kick()
   from _resolveHit with real hit vector (camera API added in round 1).
5. Animator: per-key ease tags (default smoothstep for gaps > 0.15s) + optional scale
   tracks (smear/squash support). Then wally.js: overshoot+settle keys on elephantElbow /
   marketStomp / tuskyUppercut recoveries; stretch key on trunkSlap strike; vary win loop
   (B-cycle); animate forearms in idle.
6. Meme Market polish: vary sign construction (neon/plywood/flag/broken), darken/cool the
   plaza floor 15% (value collision with Dogey), align painted sun with light rig azimuth,
   crowd knock-over direction should follow hit direction.

## Phase 6 sweep results (2026-07-29 evening)
Verified live via stepped driving (see DRIVER.md): loading/title/menu/gallery/movelist/
settings(5 sliders+remap)/credits/story/training/playground/arcade all enter cleanly, zero
console errors; full AI match in frozen-token-lab to results with organic AI finisher;
match card renders; clip viewer mounts, scrubs, angle-cycles over calm-before-liquidation.
FIXED INLINE: (1) screen-transition input bleed — ScreenManager 8-frame grace window
(also explains the earlier "phantom navigation"); (2) ResultsScreen import.meta.glob path
'../replay/' -> '../../replay/' (WATCH REPLAY button never showed).
IN FLIGHT (wcs-dod-fixes workflow): bespoke portraits for the 8 newer fighters; replay
camera must track fighters' midpoint (was orbiting arena origin); MatchScreen result
stats (maxCombo/damageDealt -> match card UNAUDITED fix); intro shot visibility audit.
NEXT: final harsh-critic gauntlet (serialized browser use, DRIVER.md technique), DoD
checklist pass, performance-preset check, then ship.

## Phase 4 (after roster lands): story mode + modes workflow
- Story: 10 rounds, wally protagonist, arena/opponent table per brief, boss round 9
  (BlackishBullDef) + round 10 (BlackishBullUnchainedDef: own health bar, new music
  'battle_reserve_core', new camera intro, arena-wide hazards, final choice + ending
  cinematic). Persistent progress via save.
- Arcade ladder (random ladder, any fighter), Training (movelist, infinite health, hitbox
  display, input history, reset), Ragdoll Playground (prop spawn, gravity/knockback/slowmo
  toggles, explosions, presets), AI Exhibition (both AI), Character Gallery, Move List
  screen, Credits, Replay Intro.
- Personality AI per fighter (archetypes per brief; no input reading; difficulty scales
  spacing/timing/blocking/punish/meter/environment awareness).
- Opening cinematic 30-45s: in-engine, skippable, replayable, subtitled (brief has the
  10 shots). Menu backdrop: Wally in the Permanent Reserve.

## Phase 5: viral features
- Instant replay (last 5s ring buffer of fighter/prop transforms, slow-mo, multiple angles,
  skippable), clip mode (replay viewer + WebM export via MediaRecorder canvas.captureStream
  where supported, else instructions), meme captions already partial, announcer lines
  expansion, alt costume polish, shareable KO presentation.
- Settings: controls remap UI, physics preset already in settings.

## Phase 6: DoD sweep + final critic gauntlet
- Full Definition of Done checklist from the brief; harsh critic per screen/fighter/arena
  until 8+ scores; performance presets verification; README/controls/ASSET_LICENSES.md.

## Known environment quirks
- Browser-pane tab shares the USER's live session — verification must be passive
  (screenshots only) whenever the user is active; background tabs freeze rAF (game loop
  stops), so drive-testing needs the fronted tab.
- launch.json must use node + absolute vite.js path (npm --prefix and sh -c cd both fail
  from the pane's spawn cwd).
