# WCS build backlog (orchestrator notes)

## ROUND 22 — boot freezes: a long frame was being read as "the page is idle"

    wall clock to title       67.2 s  ->  43.7 / 43.3 s   (two runs)
    worst single frame        3582 ms ->  350 ms
    frames over 250 ms        15      ->  1
    frames over 100 ms        29      ->  18-20
    total time in >50 ms      35.3 s  ->  11.4 s
    console errors            0       ->  0     (there never were any)

### The bug

`textures.js onTick()` chose its drain budget with
`drainQueue(gap > 120 ? IDLE_BUDGET_MS : TICK_BUDGET_MS * (1 + depth))` — 60 ms
versus 5-20 ms. A tick gap over 120 ms was taken as evidence the page was idle. On a
VISIBLE page mid-intro it means the opposite: the page is already struggling. So the
generator answered slowness by taking 12x longer, which lengthened the next frame, which
re-qualified for the idle budget. Positive feedback, and it compounded into eleven frames
over one second each.

This is the SAME mistake the STARVED_MS branch six lines above had already been fixed for.
That fix's own comment says it: "the tick gap is measured in wall time and does not know why
it was long... a page that is presenting frames must always take the budgeted path below,
however slow the last frame was." The rule was applied to one branch and not to its
neighbour. Fix: `const idle = gap > 120 && !isPresenting()` — the same guard.

### Why it read as "errors in the intro"

There are none, and there never were: every boot profile captured console errors, warnings
and uncaught exceptions and found ZERO both before and after. A 3.5 s frozen frame during a
cinematic looks like a crash, which is what the report was describing.

### It was NOT the phase profiler's fault for missing it

The frame profiler showed `u=0.2, r=1.6, unaccounted=3580`. That is correct and it is the
clue: the generator blocks the main thread from OUTSIDE the game's rAF tick (it drives itself
on a `setTimeout(0)` chain as well as rAF), so no split of the game loop can ever contain it.
`__prof.tex()` now surfaces `textureQueueStats()` for exactly this reason.

### Step granularity is NOT the problem — measured, not assumed

A drain costs `budget + whatever step it last started`, so a single huge step would put a
floor under everything. `drainQueue` now tracks `maxStepMs` / `maxStepKind` / `overrunMs`:
**maxStepMs 43-47.5 ms (`concrete`)**. Nothing is multi-second, so the budget was the right
lever and splitting steps is not needed. `overrunMs` ~6.8 s over a boot is the accumulated
past-deadline time, and it is the honest ceiling on further gains from budget alone.

### Round 22b — the heartbeat was a second engine

`scheduleTick()` armed BOTH rAF and `setTimeout(…, 0)`, and re-armed after every drain. On a
page whose rAF is alive that gives the generator two drivers, and the timer chain runs as fast
as the main thread allows: many drains back to back with the game's rAF starved in between.
One drain is bounded (budget + the one step already started, ~40-45 ms); a RUN of them is not.
Fix: the timer delay is `isPresenting() ? 250 : 0`. It stays a 0 ms heartbeat for the case it
exists for — hidden tab / capture rig, where rAF is frozen and it is the only driver — and
becomes a slow watchdog whenever frames are actually being presented.

    two runs, agreeing tightly:      before      after
    frames over 50 ms                147         107 / 104
    frames over 100 ms               18-20       15 / 16
    total time in >50 ms             11.4 s      8.8 / 8.6 s
    p90                              33.3        25.1 / 25.1
    p99                              91.7        83.3 / 83.3

HONEST CAVEAT: `overrunMs` went the OTHER way, 6762 -> ~7600, reproducibly. Fewer but deeper
drains each overshoot by their in-flight step, so the accumulated past-deadline total rises
while the number of long FRAMES falls. overrunMs measures time past a drain's own deadline,
not jank the player sees; every frame-level metric improved 24-28 %. Recorded rather than
dropped, because it is the one number that argues against the change.

### Round 22c — the intro prewarm was compiling the WRONG program variant

Closing the instrumentation gap above (cause counters + light census on the worst frames)
paid immediately. Every large compile event sat within ~3 ms of a worst frame:
`t=20101 n=23 -> 225 ms`, `t=30083 n=11 -> 175 ms`, `t=13765 n=10 -> 142 ms`,
`t=5523 n=29 -> 142 ms`. Shot boundaries were recompiling, despite a prewarm existing.

A WRONG TURN WORTH RECORDING. The light watchdog reported `2p -> 1p -> 2p -> 3p` during the
intro and it looked like round 20 recurring. It is not: EACH INTRO SHOT BUILDS ITS OWN
`THREE.Scene` (IntroCinematic ~line 1861), so the watchdog was seeing the active scene change,
not lights added to one scene. Acting on the first reading would have meant refactoring ten
light sites in the cinematic for no gain, and risking the intro's look.

THE REAL CAUSE: `shot:compile` called bare `renderer.compileAsync(rec.scene, camera)`.
Pipeline.warm()'s header documents exactly why that is wrong — the program key folds in the
BOUND RENDER TARGET, and a bare compile runs against the canvas while the composer draws into
a linear half-float target, so it builds the sRGB+ACES variant of every material and the first
real frame of the shot throws it away and recompiles. MatchScreen:967 states the rule:
"Pipeline.warm() is the only correct way to compile in this build." The intro never followed
it. The prewarm was doing FULL work and producing programs nothing would ever use — which is
why hitches survived even though a prewarm was running.

Fix: route it through `pipeline.warm(rec.scene, camera, { async: true })`, falling back to the
old path only if there is no pipeline.

    two runs:                   before      after
    frames over 100 ms          15-16       9 / 9
    frames over 50 ms           104-107     92 / 87
    total time in >50 ms        8.6-8.8 s   7.1 / 6.8 s
    p99                         83.3        74.9 / 75.0
    bulk compile events         14          9 / 9
    worst frame                 358 ms      333 / 342 ms

### CUMULATIVE boot result this session

    worst single frame     3582 ms -> 333 ms
    frames over 250 ms     15      -> 1
    frames over 100 ms     29      -> 9
    frames over 50 ms      152     -> 87
    total time in >50 ms   35.3 s  -> 6.8 s
    p99                    100 ms  -> 75 ms
    wall clock to title    67.2 s  -> 42.9 s
    console errors         0       -> 0   (there never were any)

### Still open
- One ~333-342 ms frame survives, `unaccounted`, no compile and no texture step big enough to
  explain it (max step ~40 ms). Not yet identified.
- 9 bulk compile events remain. The two at t~350 and t~580 are boot; the rest are shots whose
  warm has not finished before the cut. Prewarming further ahead is the obvious next lever.
- 43 s to title is the cinematic's own runtime, not loading (handoff at ~5.3 s). Art call.
- 43 s to the title is dominated by the INTRO CINEMATIC's own runtime, not loading — the
  loading screen hands off at ~5.5 s (was ~8 s). Shortening that is an art-direction call,
  not a perf one.

## ROUND 20 — FIXED. One point light was recompiling the entire arena mid-fight.

    programs compiled after the bell:   before  59 / 58 / 55 / 57
                                        after    5 / 4            (-92 %)
    bulk recompiles (>=10 programs) after t=1.6 s, over an 85 s fight:  before 1, after 0

### The cause

three folds the PER-TYPE LIGHT COUNTS into the program cache key. `ItemSystem`'s heart pickup
carried its own `PointLight` as a child of the pickup group, added to the scene on spawn. The
first heart of a match therefore took the scene from 14 point lights to 15 — and gave EVERY
lit material a new key. 44 programs rebuilt in a single frame, `unaccounted` 598 ms, worst
frame 641-791 ms.

### Why it took three rounds, and what actually found it

The symptom pointed everywhere except the cause:
- It fired at a different time every run (t = 19.7 s, 23.1 s, 23.4 s, 24.8 s, 40.2 s) because
  it waits on a RANDOM ITEM DROP. That looked exactly like an async texture queue draining.
- The recompiled materials were named `metal:4c5764#upgrade`, `wood-rough:...#upgrade#own`,
  which reads as "these were just upgraded". They were not: `#upgrade` is assigned at BUILD
  time by the copy-on-write split in materials.js:2524. The name was a red herring.
- Round 19 concluded texture upgrades were attaching maps and re-keying materials, and wrote
  that into this file. It was wrong.

Two measurements killed it and neither was a timing:
1. Material count and MAPPED-texture count sampled across the jump: `mats` 306 -> 306,
   `mapped` 217 -> 217, `progs` 101 -> 144. Nothing was created; everything was re-keyed.
   That excluded the whole texture-upgrade theory in one run.
2. A light census on any frame compiling >=10 programs: `4d/14p/1s/2sh` -> `4d/15p/1s/2sh`.
   One extra point light. That was the entire bug.

A fix built on the round-19 theory (pump surfaces past the bell + a rolling re-warm) was
implemented, A/B'd over 4 interleaved passes, showed 59/55 vs 58/57 — NO EFFECT — and was
reverted. `_surfacesDone` is already true at the bell, so the block never even ran.

### The fix (`src/items/ItemSystem.js`)

The heart light is now owned by ItemSystem for its whole lifetime, created in the constructor
(before MatchScreen queues its chunked warm, so the warm compiles the final light count once)
and parked at intensity 0. Spawn and pickup only move it and change intensity.

TWO TRAPS, BOTH DELIBERATE:
- `light.visible = false` does NOT work. three skips invisible objects when collecting lights,
  so hiding it drops the count and re-keys everything — the exact bug, reintroduced.
- The heart's end-of-life BLINK must drive intensity, not visibility, for the same reason.

### The rule this generalises to

ANY light added to or removed from a live scene recompiles every lit material. Pool them:
allocate at build time, drive with intensity. This applies to every VFX light in the codebase
(impact flashes, muzzle glows, finisher lights) — `?prof=1` + `__prof.globalFlips` now reports
a light census on every bulk recompile, so a regression is one run away from being visible.

### Audit: are there OTHER unpooled lights? Measured, not grepped. Answer: no.

`?prof=1` now runs a light-count watchdog (`__prof.lightChanges`) — a full census every 30
frames, recording any change with timestamp, screen and round phase. Over a 150 s fight:

    LIGHT-COUNT CHANGES: 0
    census constant at 4d/15p/1s/2sh from build onward
    every bulk recompile at t <= 2710 ms, i.e. build and intro, none after the bell

It also shows the fix behaving exactly as intended: the count steps 14p -> 15p during the
DEFERRED BUILD (ItemSystem's constructor), and the 46-program compile at t=2588 is the warm
paying for that count once, before the bell.

Caveat on coverage: one AI-vs-AI match on one arena. Finishers, KO cinematics and the other
nine arenas were not all exercised, and any of them could still add a light at runtime. The
watchdog is cheap and permanent, so the honest statement is "nothing violated it in this
scenario", not "no violations exist". Re-run it when touching VFX.

### STILL OPEN — P1: a ~520 ms stall with dProgs 0

Same run, t=37069: `gap 523.4, dProgs 0`. Not a shader compile, so it is GC or the driver.
The counters now separate the two cleanly. Next target. Note the machine was at load average
4-8 throughout; re-measure idle before chasing it.

## ROUND 19 — PARTLY WRONG. Read round 20 first; the mechanism below is not the cause.

> Round 19 correctly established that the stall is a shader RECOMPILE of already-warmed
> materials. Its explanation of WHY — texture upgrades attaching maps and re-keying
> materials — is WRONG and was disproved in round 20 by measurement: across the jump the
> material count and the mapped-texture count are both FLAT. The real cause is a point light
> entering the scene. Kept in full because the reasoning chain is instructive and because the
> evidence in it is still good; only the conclusion is bad.

## ROUND 19 — the ~500 ms stall is NAMED. Diagnosis complete, fix NOT applied.

Round 18 left "one ~500 ms stall per run, and it is NOT our JS" with three candidate causes
and the instrumentation to tell them apart. Ran it. The answer is unambiguous, and it is not
what "pre-warm the VFX materials" would have fixed.

### The evidence

Worst frame of the run: `gap 641.6, u 1.2, r 42.2, unaccounted 598.2, dProgs 4, dTex 0`.
Every other worst frame: `dProgs 0, dTex 0`. So: SHADER COMPILE/LINK. Not GC, not texture upload.

Then `?prof=1` was extended to record WHICH materials compile (three sets
`WebGLProgram.name = material type`), and the timeline settles it:

    t=   927   52 programs   denim:ffffff, crowdAccent, paper:ffffff, metal:4c5764#upgrade ...
    t=  1458   23 programs   wallyBody, wallyFrameRim, wallyFrame, wallyGlyph, coat, mask ...
    t= 10476   45 programs   denim:ffffff, crowdAccent, paper:ffffff, metal:4c5764#upgrade,
                             wallyBody, wallyFrameRim ...          <-- THE SAME MATERIALS
    t= 10516    1 frame      gap 751 ms

THE MATERIALS AT t=10476 ARE THE ONES ALREADY COMPILED AT t=927 AND t=1458. The dedup key in
the profiler is the PROGRAM CACHE KEY, not the name, so these are genuinely new program keys
for materials that already had one. The chunked warm in `_warmStep()` does its job and then
the result is thrown away.

### The mechanism

Read the names: `metal:4c5764#upgrade`, `concrete:2c333d#upgrade`, `wood-rough:6e4a26#upgrade#own`.
These are materials being UPGRADED from placeholder to generated surfaces. Under the
copy-on-write material design an upgrade yields a new material variant, hence a new program
key, hence a recompile the next time it draws. `dTex 0` fits: no new texture OBJECTS are
created, so the texture counter never moves — which is exactly why this was invisible until
programs were counted separately.

Why it lands mid-fight: `_pumpSurfaces()` runs ONLY while `phase === 'intro'`
(MatchScreen.js:1344). After the bell, textures.js keeps generating on its own schedule with
no warm following it, so the upgrade batch recompiles whenever those materials next render.
The existing mitigation at MatchScreen.js:821 re-queues a chunked warm, but only when the
surface queue FULLY drains — if it drains after FIGHT!, nothing re-warms.

### Fix direction (NOT applied — see why)

The upgrade path must not hand the fight a new program key without a chunked warm behind it.
Options, cheapest first:
1. Keep pumping surfaces after the bell at a small budget and re-queue `_queueWarmChunks()`
   after each batch that upgraded anything, not only at full drain. The chunked warm is
   already budgeted and adaptive, so it cannot produce a 751 ms frame.
2. Make the upgrade preserve the program key where possible (allocate the map slots on the
   placeholder so gaining real content does not add defines).
3. Force all surface generation to complete before FIGHT!, as `_flushBuild()` already does
   for build steps. Simplest, but moves cost into the intro and may lengthen it.

NOT APPLIED THIS ROUND, DELIBERATELY. This is a subtle, heavily-commented system (warm(),
the chunker, copy-on-write materials) and the correct fix depends on the upgrade path in
textures.js/materials.js. The machine is at load average 8 with the user's browser at ~54 %
CPU; perf runs are currently freezing outright (one probe sat in `phase: intro` for 33 s with
zero scene change). A change to the warm path that cannot be A/B'd is exactly the kind that
regresses silently — and this round already caught one wrong conclusion of mine by measuring.
Do it when the machine is idle, and A/B it interleaved.

### Method note
`window.__prof.newProgs` now records `{t, gap, names[]}` for every frame that compiled a
program. That list is what turned "something outside our JS costs 500 ms" into a named cause
in one run. It is NOT cleared by `reset()`, on purpose: seeing the build-time compiles next
to the mid-fight ones is what exposed the duplication.

## ROUND 18 — frame pacing located and fixed, by instrumenting instead of guessing

The P1 from round 17. Round 17 said "instrument first, do NOT start by guessing", and that
is what found it — the cause was in neither of the two files previously suspected.

### The measurement that made everything else readable: THE PANEL IS 120 Hz

Vsync floor, measured with an EMPTY rAF loop: **8.3 ms (120.5 Hz)**. Without this number the
in-game figures are uninterpretable. Our own CPU work in a live fight is ~4 ms
(update ~1 + render submit ~3-4); the remaining ~8-10 ms of a median frame is vsync wait,
which is idle, not cost. `unaccounted` sitting at ~8-10 ms is HEALTHY. Measure the floor
before ever calling a frame slow.

### The actual defect: the fixed-step accumulator amplified every stall

Profiling a live fight (`screen: match, phase: fight` asserted) showed every one of the 12
worst frames running the full `steps: 5` catch-up budget, several spending 100-148 ms inside
update — 5 sim steps at ~29 ms each. One stalled frame became a RUN of stalled frames:
stall -> 5 catch-up steps -> another long frame -> 5 more. The `steps === 5` guard only fired
after paying for all five.

FIX (`Game.js`, one line): `if (gap > 100) acc = Math.min(acc, STEP)` — past ~100 ms, drop the
missed time instead of simulating it. Simulating 83 ms of catch-up serves nobody: the fight
lurches forward and then stalls again.

INTERLEAVED A/B (A B, back to back, same session — order chosen so thermal drift cannot
masquerade as an effect):

    A clamp OFF   median 25.0   p90 33.3   p99 67.2   steps5 3   2nd/3rd worst 108.7 / 87.6
    B clamp ON    median 17.6   p90 25.9   p99 41.5   steps5 1   2nd/3rd worst  85.9 / 73.7

Better on every metric, median included. NOTE FOR WHOEVER READS THIS NEXT: my first instinct
was that the clamp "cannot affect the median because it only fires above 100 ms", and that
was WRONG — preventing the cascade shortens the frames AFTER the stall too. The effect
propagates. Do not re-derive that from the code; it was measured.

Tail across three earlier runs, before -> after: ranks 2-12 went from 162-470 ms to 41-65 ms,
and update max from 49.6 ms to 4.6 ms.

### STILL OPEN — P1: one ~500 ms stall per run, and it is NOT our JS

Every run retains a single 498-657 ms frame with `u` under 1 ms and `r` around 12-39 ms, i.e.
~460-644 ms UNACCOUNTED. That is GC, a synchronous driver texture upload, or a shader
compile/link — three causes with three different fixes. `?prof=1` now records `dProgs` and
`dTex` per frame precisely to tell them apart:
    dProgs jumped -> shader compile/link on first use of a material  -> pre-warm it
    dTex   jumped -> texture upload the driver did synchronously     -> upload earlier/smaller
    neither       -> GC                                              -> fix allocation churn
That measurement did not complete this round (see the load caveat below). It is the next
thing to do, and the tool for it is already in the build.

### LOAD CAVEAT — READ BEFORE TRUSTING ANY ABSOLUTE NUMBER HERE

These runs were taken on a machine at load average 6.5-8.5, with the user's own browser at
~54 % CPU, WindowServer at ~49 %, and iCloud (`bird`, `cloudd`, `fileproviderd`) syncing.
Consequences:
- The A/B above is still sound: A and B ran back to back under the same conditions, which is
  exactly what interleaving protects against.
- The ABSOLUTE millisecond figures are indicative, not lab-grade. Median in a live fight
  measured 12.4, 15.6, 15.8, 16.4 and 17.6 ms across runs — a real spread driven by load.
- Under that load the game needed >20 s just to clear the LOADING screen (39 frames in 20 s),
  which is what made two A/B passes and one diagnostic come back empty. If a run returns
  nothing, check `uptime` before suspecting the code.
Re-measure absolutes on an idle machine before quoting them anywhere that matters.

### Method addition
`?prof=1` now records a per-frame phase split: `window.__prof.split(n)` returns update /
render-submit / unaccounted quantiles plus the 12 worst frames, and carries `screen`, round
`phase` and `steps5` WITH the numbers so a sample taken on the wrong screen cannot pass
unnoticed. `window.__prof.reset()` clears both the ring and the worst list — clearing only
`ph` leaves stale arena-entry frames in `worst`, which then read as if they happened in-fight.


## ROUND 17 — 1080p budget MET on throughput. Round 13's ladder is now moot.

Measured under round 13's own admissibility protocol (below), 2026-08-13. Both free wins
it handed out are now applied, and the ladder it specified was never needed — not one rung.

    postPixels 2073600  canvasPixels 2073600  postSize [1920,1080]  css [1920,1080]
    composer true  tier high  renderScale 1  pixelRatio 1  dpr 1  canvasMSAA false
    n 600   median 10.1 ms   p90 24.0 ms   p99 156.2 ms   (99 fps)

PASS on the stated criterion (median <= 16.67 ms at postPixels 2073600), with 40 % headroom.
GRAPHICS_CONTRACT.md line 47 was FALSE when written and is now TRUE; it has been updated to
quote the measurement rather than assert the claim.

### OPEN P1 — FRAME PACING. The tail is bad and the median hides it.

p90 24.0 ms against a 10.1 ms median is a bimodal distribution: ~10 % of frames cost more than
twice the median, and a **156 ms** frame landed inside steady state (last 600 frames, 20 s past
the arena mark — this is not arena build). Throughput is solved; smoothness is not, and the
user has asked twice for the game to "run much smoother". Do not close this with a median.

Do NOT start by guessing. Instrument first — the last two perf rounds were both spent on the
wrong lever because the symptom was assumed rather than located:
1. Log a per-frame breakdown for any frame over 2x median (CPU update vs render submit vs
   composer), and dump the 20 worst frames with their phase split.
2. Prime suspects, in the order they are cheap to falsify: (a) time-sliced texture generation
   in `src/render/textures.js` — `flushTextureQueue()` is exactly the kind of synchronous drain
   that produces a single 156 ms frame, and it has form: it caused the 1547 ms intro hitch;
   (b) shader compile / program link on first use of a VFX material (`progs` was 159 at match
   start); (c) GC from per-frame allocation in the animation or particle path.
3. Only after the split is known, fix the phase that owns it.

### Mood histograms after the two AO/band fixes (all measured this build)

    arena                    mood               median  below8  clip  pureBlack  frameReport
    calm-before-liquidation  liquidation-storm      88   5.002  .001      0      PASS  (was 8.919 FAIL)
    mountain-node-village    mountain-dawn          92   0.033     0      0      PASS  (band retuned)
    settlement-express       subway-tunnel          89   3.038     0      0      PASS
    permanent-reserve-core   reserve-core           46   5.165     0      0      PASS
    meme-market              meme-plaza             41   6.304     0      0      PASS
    bull-market-colosseum    sunset-stadium         58   3.016     0      0      FAIL

### OPEN P1 — bull-market-colosseum median 58 against a 100-158 band

PRE-EXISTING, not caused by this round (`sunset-stadium` was not touched). Note the shape:
below8 3.016 and pureBlack 0, i.e. nothing is crushed — the scene is simply far dimmer than a
band that groups it with daylight moods. That is the SAME diagnosis that was correct for
mountain-dawn, which is exactly why the band must not just be widened to make it green.
Someone has to look at the arena and decide which is wrong:
- If the sunset rig is genuinely underlit, fix the rig; a stadium at sunset should not read at
  the same median as a night market (meme-plaza measures 41).
- If 58 is the right answer for this art direction, move `sunset-stadium` out of the daylight
  group in MOOD_FRAME_TARGETS and say so in the comment, as was done for mountain-dawn.
Do not touch the number in MOOD_FRAME_TARGETS without a screenshot justifying the choice.
Widening a band because it is the file you happen to have open is metric-gaming — cf. the
round-9 pipeline that added a 4-count black floor so pctPureBlack read 0.000 while the black
holes were still there at RGB(4,4,4).

### MEASUREMENT METHOD — one arena per browser session. This bit twice.

`screens.goto('match', ...)` does NOT reliably rebuild when a match is already running: after
~45 s a KO ends the round and the goto lands on a results screen instead, so the pipeline keeps
the PREVIOUS arena's mood and you silently measure the previous arena again. Two runs produced
byte-identical duplicate rows this way before it was caught (`mountain-node-village` reporting
mood `liquidation-storm`). Guard on `pipeline._mood` matching the arena's declared mood before
sampling, and prefer one arena per browser launch. Also: `screens.current.arena.id` reads null —
do not use it as a readiness signal. And give every CDP call a timeout; a script without one
hung for nine minutes instead of failing in twenty seconds.

### Also open, found in the same run
- One `404 (Not Found)` on the preview build. Harmless-looking, but a shipped 404 is a shipped
  bug — find it and either add the asset or stop requesting it.

## ROUND 13 — the disputed 1080p number, settled on paper. Do not re-litigate.

Two verifiers reported the same scene (`permanent-reserve-core`, tier `high`, "1920x1080 pr2")
as **10.68 ms / 94 fps** and **37.6 ms / 22-27 fps**. Both cannot be right. The reconciliation
below is derived from the code, not measured — I could not drive a browser. The Verify agent
confirms it with the protocol at the bottom.

### What `high` actually costs at 1080p (read the two lines that decide it)

- `Game.js:36` — `renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.pixelRatio))`.
  This sizes the **canvas drawbuffer only**.
- `Pipeline.js:_postPixelRatio()` — the composer runs at `min(renderer.getPixelRatio(), renderScale)`,
  and round 12 set `TIERS.high.renderScale = 1.0`.

`min(2, 1.0) === min(1, 1.0) === 1.0`. So at a 1920x1080 CSS viewport, **`high` renders the scene,
GTAO, bloom, bokeh, SMAA and the grade at 1920x1080 whether the canvas is pr1 or pr2.** Post cost is
identical in both measurements. The 3840x2160 drawbuffer the second verifier confirmed from
`renderer.domElement.width/height` is real, but only **one pass ever touches it**: the final
`OutputPass` blit (8.3 Mpx, plus an MSAA resolve, because `Game.js:32` asks for `antialias: true`).

So the mental model that makes 37.6 ms plausible — "pr2 means 4x the work" — is **wrong**. pr2 costs
one extra fullscreen blit + resolve, order 1-3 ms on an M-series laptop, not 27 ms. **The disagreement
is not caused by pixelRatio.** It has to be rig or environment. Ranked candidates, all checkable:

1. **The 10.68 ms run was probably not at 3840x2160 at all.** `window.__viewport()` defaults to
   `(1600, 900, 1)` = 1.44 Mpx canvas. Round 12's own note records 1600x900/pr1 at 5.3-7.4 ms
   across arenas, so 10.68 ms for the heaviest arena fits that configuration far better than it
   fits a 4K present path.
2. **The 37.6 ms run was inflated by the capture rig.** `__viewport` only exists under `?cap=1`,
   which constructs the renderer with `preserveDrawingBuffer: true` — a per-frame full-drawbuffer
   copy (8.3 Mpx at pr2) and a known ANGLE/Metal fast-path killer. `__step()`/`__draw()` are also
   synchronous and unpaced, so CPU frame N+1 never overlaps GPU frame N the way rAF lets it;
   a serialized loop reads 1.5-2x high on its own.
3. **A second live WebGL context.** Documented in this project as a 2.4 s -> 27.8 s inflater.
   `ReplayUI.js:230` builds a *second* renderer and a second `RenderPipeline`; a leftover clip
   viewer, or a second tab of the game, is enough.
4. **A degraded composer.** If a structural pass fails, `_degrade()` falls back to a direct
   `renderer.render()` — which DOES run at the full 3840x2160 canvas, multisampled. That is a
   genuine 4x fill jump and would explain 37.6 ms honestly. `stats().composer === false` is the tell.

### Decision (GameConfig, mine)

**`high.pixelRatio` 2 -> 1, `medium.pixelRatio` 1.5 -> 1. `ultra` stays at 2.**

This is not a quality cut and it is not a guess — it is the one lever that is provably free:
- The post chain is unchanged. `_postPixelRatio()` returns 1.0 for `high` either way; the proof is
  the `min()` above, not a measurement.
- The image is unchanged. The composer output is 1080p in both cases; pr2 upsampled it in a
  fragment shader, pr1 lets the window compositor do the same upscale for free. The HUD is DOM +
  2D canvases, so it is unaffected either way.
- What is saved: the present path drops from 8.3 Mpx to 2.07 Mpx, and the multisampled resolve of
  the default framebuffer drops with it. ~230 MB/frame of memory traffic at pr2 on a 4K present.
- It also makes the *failure* path survivable: if the composer ever degrades to a direct render,
  the fallback now rasterises 2.07 Mpx instead of 8.3.
- `ultra` keeps 2 because its `renderScale` is 1.5 and `min(devicePixelRatio, 1.5)` needs a 2x
  canvas. Ultra remains the tier that supersamples.

**COUPLING — the one way to break this.** `pixelRatio` is now the ceiling on `renderScale`. If a
later round restores `TIERS.high.renderScale` to 1.25/1.5, `high.pixelRatio` must go back up to at
least that value in the same commit or the supersample silently does not happen.

**Corollary for whoever owns Pipeline.js.** Round 12 paid for the pr2 present path by cutting
`renderScale` 1.25 -> 1.0, i.e. it degraded the resolution of every pass in the chain to pay for the
cost of the *last* one. With the present path now 4x cheaper there may be room to restore
`renderScale` 1.25 and get `high`'s supersampling back. Measure before doing it, and raise
`high.pixelRatio` to 1.25+ in the same change or it will do nothing.

### Two free wins that are NOT in my files — hand these to their owners

- **`src/core/Game.js:32` — `antialias: true` on the WebGLRenderer is wasted whenever the composer
  is live.** The only geometry ever drawn to the default framebuffer is OutputPass's fullscreen
  quad; MSAA cannot antialias a quad's interior, and SMAA already ran inside the chain. It buys
  nothing and costs a 4x-sample store plus a resolve every frame. Suggest
  `antialias: qualityName === 'low'` (the `low` tier is the only direct-to-canvas path).
- **`src/core/Game.js:34` — `preserveDrawingBuffer: this.captureMode`** is correct as written, but
  it means **every `?cap=1` measurement is inflated** and must never be quoted as a perf number.
  The `?prof=1` path does not set it. Perf claims come from `?prof=1` only.

### Verification protocol — quote these fields or the number is not admissible

Real Chrome (`--remote-debugging-port`), **no `?cap=1`**, one tab, no other live WebGL context.
Load `?prof=1`, start a match in `permanent-reserve-core`, let it run 20 s past the ARENA mark
(the published `ARENA {...}` title covers the first 120 frames and is contaminated by arena build —
that is defect 8, not steady state), then take the median of `window.__prof.f.slice(-600)`.

Record with the number, every time: `window.__game.pipeline.stats()` (main.js publishes `__game`
unconditionally, so this works without `?cap=1`) -> `composer`, `pixelRatio`, `canvasPixels`,
`postPixels`, `postSize`, `renderScale`, `tier`; plus the CSS viewport and the
display's `devicePixelRatio` and refresh rate. **rAF is vsync-capped**: a 16.7 ms median on a 60 Hz
panel means "at or above 60", and 94 fps is only measurable on a 120 Hz panel at all — which is
itself a plausible part of the original disagreement.

PASS = steady-state median <= 16.67 ms at `postPixels` 2073600.

### If it still misses 16.67 ms, apply this ladder in order and stop at the first pass

Each step is a GameConfig-only change; record the measured ms after each so the next person sees
the cost of each rung. Do NOT reach for exposure, and do NOT cut `renderScale` first — that is the
lever round 12 already spent.
1. `high.post.dof: false`. BokehPass renders the scene depth AGAIN (an extra full geometry
   submission at dofScale 0.75) on top of a full-res bokeh pass. It is the most expensive single
   pass in the tier and the least visible in a fighting-game read.
2. `high.shadowSize` 2048 -> 1536. Shadow cost is resolution-bound and independent of the viewport;
   defect 2 wants shadow *shape*, which is a filter/bias question, not a resolution question.
3. `high.crowd` 120 -> 96 and `high.propLimit` 40 -> 32.
4. Only then: talk to Pipeline's owner about `aoScale` or `renderScale`.
If none of that reaches 16.67 ms, the honest move is to change what the tier CLAIMS —
GRAPHICS_CONTRACT.md line 47 ("60 fps at 1080p on `high`, on an M-series laptop") is the sentence
to edit, and it is not owned by the config agent. Say which of the two you did.

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
