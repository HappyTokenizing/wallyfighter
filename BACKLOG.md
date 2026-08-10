# WCS build backlog (orchestrator notes)

## v3.2 — 2026-08-09: menus + intro brought up a generation. Build GREEN, harness PASS.

ROOT CAUSE of "the menus look much worse than the game": the menus never adopted the render layer.
`MenuBackdrop.js` (209 lines) and `IntroCinematic.js` (1148 lines) imported `renderScene()` and
NOTHING else — no `applyEnvironment`, no `makeCinematicRig`, no `surfaceMaps`, no `pbr()`, no
geometry toolkit. Hand-rolled lights and flat materials. That is why the podium rendered pure black
(podMat 0x2a2f4a is mid-navy — nothing lit it and there was no environment to reflect), the statue
was a flat blob, the floor was a wireframe grid in a void and the coin had no metal response.

DONE
- MenuBackdrop rebuilt as a lit vault interior: IBL + cinematic rig, real surfaces, bevelled
  geometry, emissive vault door, bullion, rope stanchions, reflective tiled floor, atmosphere.
  The black podium is gone.
- IntroCinematic given the same treatment across its shots; timing/subtitles/skip unchanged.
- Select / Gallery / VS / Results now render real lit 3D character bakes instead of 96x96 doodles.
  The verifier called this "the unambiguous win of this wave".
- Orchestrator fixes on top:
  * `WALLY_AT` moved from x -2.55 to x +2.35. He was projecting to NDC x -0.36 — dead behind the
    menu button list, so the hero of the title screen was invisible on every menu screen.
  * Vault seam emissive 2.35 -> 1.45. It was the brightest thing in frame by a wide margin and
    pulled the eye off the character; the backdrop was out-acting the hero.
  * `TRIM` in wally.js 0.25 -> 0.62. Per-mood exposure has landed, so the old global compensation
    was now doing harm — it made Wally a featureless cream blank in the dark menu vault. This is
    the exit the file's own comment always described; 0.62 not 1.0 because the moods still run a
    little hot on the subject.

PARITY (measured by the verifier at 1600x900, tier high): menus now sit in the same band as
gameplay and are CLEANER on dark pixels — menu pctBelow8 0.17-1.63% vs gameplay 4.98-17.68%, menu
pctPureBlack 0 everywhere, menu medians 76-90 inside the interior-vault band. Menu clipped white
1.06-1.48% is over the 0.8% limit but below g-match-core's 13.02%.

STILL OPEN
- g-match-core clips 13.02% white — the worst frame in the game now. Fix next.
- Menu clipped white 1.06-1.48% vs the 0.8% limit; the vault seam is the first thing to drop.
- Brass floor inlay throws high-frequency specular aliasing across the lower frame.
- The light shaft reads as a hard-edged white wedge upper-left.
- Latent, flagged by the intro agent and NOT fixed (wrong owner): `cachedGeometry()` in geometry.js
  tags shared entries with `userData.geoKey` but not `userData.__shared`, while
  `ArenaBase.disposeNode()` only skips geometries tagged `__shared` — so any dispose walk over a
  toolkit geometry frees a buffer the cache will hand out again. One-line fix in `cachedGeometry()`.
- `env.js applyMoodGrade()` is dead code across the tree and its comment falsely claims it is the
  wiring; Pipeline-side consumption was fixed instead.

## v3.1 — 2026-08-09: Wally reference rebuild + pacing. Build GREEN, harness PASS.

PACING (done, measured with `node src/combat/harness.js --duration --hp X --dmg Y`):
- `GameConfig.balance` 2.8/0.5 -> **1.5/0.85**. Round median 3:16 -> **1:00**; best-of-3 at ~2.5
  rounds = a **~3:00 match**, down from ~8:00. Sweep for the record: 2.8/0.5 -> 3:16,
  1.6/0.85 -> 1:10, 1.5/0.85 -> 1:00, 1.3/1.0 -> 0:50, 1.1/1.1 -> 0:32.
- `rules.roundTime` 300 -> **150**. Slowest round in the sweep was 1:36, so the cap has headroom.
- The harness's own pass window was 3:00-4:00 and is now **0:45-1:20** with a match estimate
  printed. Do NOT "fix" a 1:00 median back to 3:00 — that was the v2.1 contract and it produced
  8-minute matches.

EARLY CAMPAIGN (done): easing had to come from HP and round count, NOT AI level — `tuningFor()`
in src/ai/Brain.js clamps with `Math.max(1, ...)`, so there is no level 0.
- `STORY_AI_CURVE` holds level 1 through chapter 3 (was 2).
- `STORY_HP_CURVE` starts **0.7x** (was 1.0x), same 1.9x peak at ch.10.
- New `STORY_ROUNDS_CURVE` makes **chapters 1-3 a single round**; best-of-3 from ch.4.
- Simulated ch.1 (lvl 1, 0.7x HP, one round): **~0:50**.

WALLY (much closer, not signed off). The user supplied four studio renders; the spec is
`docs/parody/wally-v2-reference.md` — a matte vinyl art-toy elephant with **no clothing at all**.
All 171 suit references are gone. Two workflows, six critic rounds, scores 6/6/5 then 6/6.
- The first spec I wrote was WRONG and produced a lanky ~5-head humanoid (see
  `.shots/mine-wally-front.png`). Section 1 now carries a "v2.1 CORRECTION": head is the top 36%
  of H, legs the bottom 28%, belly wider than the shoulder, ratio 1.29:1.29:1. Measured after the
  fix: head 0.356 H, torso 0.348 H, legs 0.296 H — head taller than legs, the hard-fail test passes.
- Trunk fixed by hand afterwards: `TRUNK_SEG` 0.405 -> 0.245 (arc 1.05 -> 0.73 m, tip was hanging
  below the belly and reading as rope), `TRUNK_R_KEYS` re-keyed thicker to §1's ±0.075 base /
  ±0.045 tip, `TRUNK_RINGS` re-spaced inside the shortened segment 1 so no groove straddles the
  trunk1/trunk2 bone boundary. Current state: `.shots/trunk-fix-front.png`.
- SILHOUETTE NOW PASSES. Rendered a true black-fill front view myself after the trunk fix
  (`.shots/sil-front.png`): round dome head, two big ear paddles with DEEP notches either side,
  clear inter-leg gap, stubby feet. The critic's "reads mushroom, not elephant" was measured on an
  earlier build and no longer holds. The trunk does not break the front outline, which is
  geometrically unavoidable when it hangs in front of the body — not a defect.
- STILL OPEN on Wally: the glasses read mid-charcoal rather than near-black. NOT an albedo bug —
  `shadesLit` is `trim(0x191919, 0.25)` ~= #080808. The lens is glossy and picks up environment
  reflection, so the fix is envMapIntensity/roughness on the lens, not the colour. Also: shadow
  acne at the ear/cranium junction, tusks lack ivory contrast, tail shaft is a rigid off-centre rod.
- THE TRIM HACK IS TECHNICAL DEBT. `const TRIM = 0.25` in wally.js is a 0.25 linear-radiance
  compensation for stage over-exposure, applied to the body albedo. It is a global constant fighting
  a per-arena problem: correct in a blown-out arena, too dark in a dim one. The file's own comment
  has the exit: once per-mood exposure lands everywhere, set `TRIM = 1` and it is back on §5's
  #c9c8c6 with no other edit.

EXPOSURE (much improved this pass — MOOD_EXPOSURE is now consumed by Pipeline; `stats().mood`
reports the per-arena factor and `stats().histogram` gives p1/median/p99/clipped/below8):
  liquidity-swamp med 128 white 0.2% | frozen-token-lab med 143 white 1.2% |
  settlement-express med 112 white 0.7% | institutional-capital-tower med 74 white 1.0% |
  lost-block-museum med 98 white 1.6% | mountain-node-village med 80 | bull-market med 51 |
  meme-market med 35 (a night scene — a low median is correct there) |
  calm-before-liquidation med 63, 8.8% below luma 8 — still the darkest and the one to fix next.
The old blown-highlight failures are gone (frozen-token-lab was 12.18% clipped, now 1.2%).
CAUTION: the 118-158 median band came from lost-block-museum, a bright gallery. Do not apply it to
a night market or a storm — that is the same mistake as one global grade.

## v3.0 IN PROGRESS — 2026-08-01: AAA graphics overhaul. NOT FINISHED.
Paused on a weekly usage limit (resets Aug 6). Build is GREEN, game runs, zero console
errors across all 10 arenas. Read `GRAPHICS_CONTRACT.md` first, then `src/render/README.md`,
then `DRIVER.md` (the `?cap=1` capture rig). Per-fighter briefs are in `docs/parody/*.md`.

LANDED
- `src/render/`: noise, textures (42 procedural PBR surface kinds), materials (pbr() factory +
  copy-on-write cache), env (PMREM IBL, per-arena moods), lighting (makeCinematicRig:
  key/fill/camera-relative rim/bounce, texel-snapped shadow fit, contact discs), Pipeline
  (GTAO/bloom/bokeh/HDR-probe/combined-grade/SMAA), geometry (roundedBox, capsule,
  superellipsoid, loft, splineTube, bevelize, dedupeGeometry, mergeStatic).
- Wired into Game + GameConfig (new `ultra` tier) + ArenaBase + every render() call site.
- All 10 fighters and 8 of 10 arenas rebuilt against the render layer.
- Perf is NOT the problem: 8.2 ms/frame at 1080p pr=2 on `high` (~122 fps), worst arena 9.2 ms.
- Fixed and regression-tested: cross-arena env/prop leaks, restart geometry leak (flat over 12
  restarts), temporal ghosting on hard cuts, floating fighters at `low`, fighting-game camera
  framing (side-on, both fighters, neither occluding).

CRITIC STATE — nobody is "wowed" yet. Six loop rounds.
- Render critics: 3 -> 4/10. Engineering critics: 6 -> 7/10.
- Characters after 3 rounds: likeness avg 2.5 -> 3.7, quality flat ~2.8, 0/10 wowed.
- Arenas after 1 round: 3-4/10, 0/10 wowed.
- The recurring verdicts: no specular lobe that describes form; detail painted into albedo
  instead of normal/roughness; no crevice darkening where geometry meets geometry; crowds read
  as bowling pins; hero lighting moments faked with additive cards instead of real light.
- Best single insight, on Wally: "the overhaul added surface and subtracted identity — a net
  regression on the only axis that matters." Silhouette and value hierarchy come FIRST.

OPEN P0 — BLACK SLABS. Intended-emissive screen/signboard panels are rendering as opaque
near-black geometry. ROOT CAUSE FOUND, one fix should clear it everywhere.

Symptom: a black rectangle floating in bull-market-colosseum (`.shots/state-bull.png`); in
frozen-token-lab the equivalent panel is huge and near the camera, so it eats the left ~75% of
frame (`.shots/fix-frozen.png`) and reads as a broken renderer.

Ruled out, all verified live: NOT post (identical with `pipeline.enabled = false`), NOT the
clear colour (forcing `clearColor` magenta AND `scene.background = null` leaves it black), NOT
scissor/viewport (gl VIEWPORT and SCISSOR_BOX both 0,0,1600,900), NOT the static merge
(disabling `mergeStatic(this._dressing)` did not remove it — that experiment was reverted).

Actual cause: traversing the live scene, the offending meshes carry materials named
`concrete:1e1e1e#upgrade` and `metal-rough:2c211e#upgrade` — `MeshStandardMaterial`,
`emissive: 000000`, `emissiveMap: null`, radius 3-23 m. `#1e1e1e` is RGB 30,30,30, i.e. exactly
the albedo floor `guardAlbedo()` clamps to. So a panel the arena authored as pure black — because
it was meant to carry an emissive CRT/sign texture — was resolved by the material upgrade to the
`concrete` preset with no emissive, giving an unlit black slab.
Fix: the hint/inference table must route screen and signboard meshes to the `screen` /
`neon-panel` / `emissive` presets and preserve their emissive map, instead of falling through to
`concrete` on a dark albedo. Then re-check every arena for `#1e1e1e` materials.
Compounding: `mergeStatic` welds these panels into 20 m+ buckets, so the camera-occluder fade can
no longer fade one individually — fix the material first, then re-evaluate the merge granularity.

OPEN P1
- `scene.background` leaked reserve-core navy (#181c38) into frozen-token-lab in one observed
  session, even though the A->B->A leak harness passes. Intermittent; re-check.
- Triangle budget blown in all 10 arenas (390k-640k vs the 250k cap); draw calls 892-1250 vs
  the ~900 budget. Frame time is fine, so this is budget compliance, not framerate.
- Blood decals still read as hard-edged quads; the VFX/gore rework did not get a critic pass.
- 2 arenas (permanent-reserve-core, calm-before-liquidation) never got their agent round —
  reserve-core nonetheless looks the best of the ten, so treat those two as untouched-but-fine.
- Character round 4 should be silhouette-first, not more surface detail.

INFRA NOTES FOR THE NEXT ORCHESTRATOR
- The 180 s no-progress watchdog kills agents that emit one huge Write. Require
  skeleton-then-successive-Edits, and wrap every `await agent()` in a retry helper.
- Auto-bevel/auto-merge monkey-patched `THREE.Scene.prototype.updateMatrixWorld` and baked
  paused fighters into static buckets. Both are now opt-in (`WCS_AUTOBEVEL`/`WCS_AUTOMERGE`).
- Verify captures are not broken BEFORE trusting critic scores — several rounds were scored
  against frames containing a full-screen artifact (camera inside meme-market's coin; the
  occluder fade explicitly skipped boxes the camera was inside — fixed in CameraController).

## v2.1.1 — 2026-07-30: mobile polish. Verifier ALL-PASS.
Silent-intro root cause: AudioEngine dropped pre-gesture music requests AND async
resume() left init unfinished until a 2nd gesture — fixed in core (_finishInit on the
resume promise + replay _lastMusicReq). Radio now governs ALL music contexts w/ ~1-bar
live switch + unknown-id title fallback (40/40 router units). Touch: zero keyboard
glyphs anywhere (uiKit hintHTML helper), BLOCK primary hold-button replaces the
left-half zone, JUMP small + gated by jumpEnabled, SPEC text gold. Knockdown recovery
median 7.27s -> 1.55s (settle detector was riding the force-settle timeout due to
solver angular jitter — velocity-only settle + constant cuts); OTG hits open at 90
frames down (prone hurtbox 0-1.0m, first hit forces getup + 45f invuln, otg:true on
fighter:hit). Minor unverified note: touch overlay may report visible on results when
jumped to via screens.goto internals (not a real user path).

## v2.1 — 2026-07-30: spectacle + economy update. FINAL AUDIT 9/10, ZERO P0/P1.
Auto KO executions on every round end, tiered by killing blow (basic 5 / heavy 5 /
absurd 8 + attacker-signature; special-echo openers; any-button skip); economy retuned
via duration harness (balance 2.8/0.5 -> 3:30 median rounds, 5:00 cap, M:SS HUD);
story/arcade curves aiLevel 1->4 + hpMult 1.0->1.9 (bulk not skill); items reworked to
authored per-arena placements + audience throws (no random pop-ins) + 30% heart drops
from broken props (fly 5-9m, first-walker +12, AI contests); radio stations
(default/hiphop/edm/lofi/rockmetal, 3 tracks each, live switch); intro hype track +
per-shot announcer names; Satoshi 2009 title footer; Replay Intro -> Settings;
crowd no-vanish fix (InstancedMesh frustum culling root cause) + team-color shirts +
occlusion hysteresis; full-fight MediaRecorder download (results + viewer); cameraLock
+ jumpEnabled toggles; simplified 4-button touch. Engineer-critic verdict: heap fully
reclaimed over 6 matches, listener counts exactly stable, median frame 1.4ms/p99 4.9ms,
zero console errors. Two P2s fixed post-audit (harness mss formatter, §23 wording).
NOTE: workflow infra flaked twice this session (API disconnects + 180s-silence watchdog
killing long harness runs) — future agents: keep shell commands chatty and chunked.

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
