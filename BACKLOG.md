# WCS build backlog (orchestrator notes)

## ROUND 45 — smoothness over speed-to-bell: the gate now drains fully

Product call from the user: prioritise smoothness and performance above all,
even if it means longer waiting. Round 44's 8 s texture time-box was me hedging
against a long wait; that hedge is now explicitly unwanted.

### The measurement that made this safe

The queue DOES converge — but only if something pumps it. Left to its own
background heartbeat it was still draining **154.5 s** into the session, i.e.
through the entire first round and into the second. That is the mid-fight
texture work that costs frames, and it is exactly what the user is asking to be
rid of.

Full drain with the gate pumping hard, FIGHT press to bell:

    desktop        7.8-8.1 s     surfacesDone TRUE at the bell
    4x throttle   41.7 s
    6x throttle   71.8 s

So `WARM_TEX_MS` 8 s -> 45 s. Desktop never reaches the cap (it finishes in ~8);
the cap only stops a genuinely slow device sitting for over a minute, and
anything unfinished resumes on the background heartbeat as before.

Load-immune result: surfaces now report DONE at **t=5.7 s, during the intro**,
against 154.5 s (mid-second-round) before. The texture generator does no work
during the fight.

### A long wait must not read as a hang

Past 10 s the sub-label carries elapsed seconds:
`WARMING SURFACES — 26s (first match takes longest)`. Verified rendering under
throttle rather than assumed — the first screenshot caught an early frame with
the plain label and I nearly shipped the claim untested.

### What I still cannot prove, third round running

A frame-time delta. Frames >33 ms in the first 6 s of fight, 3 runs per arm:

    gate OFF          5, 2, 110
    gate ON, boxed   26, 39,  21
    gate ON, full    21,  1,  19

The 110 in the OFF arm is the whole story: this machine's noise floor is larger
than the effect. I am NOT claiming a frame-time win from these. The defensible
claim is mechanical and load-immune — zero texture work during the fight, zero
to two programs compiling after the bell — plus the reasoning that removing
in-fight work cannot make frames worse. A clean-machine A/B with many more
samples remains owed, now for the third round in a row.


## ROUND 44 — the ready gate: hold the bell until the match is actually warm

The round intro was a FIXED ~2 s banner regardless of outstanding work, and
`_beginFight()` then called `_flushBuild()`, which the file itself describes as
"one long frame under the FIGHT! caption". That long frame is the freeze players
feel right after pressing FIGHT.

`_armReadyGate()` now owns the tail of the intro: it keeps pumping until the
match is genuinely warm, shows a progress bar while it does, and only then rings
the bell.

### Order matters, and the first version had it backwards

v1 waited for the texture queue BEFORE compiling shaders — putting the one item
that actually hitches a fight behind the one item that merely renders at a lower
tier. It hit the 20 s cap at 49% under throttle and never reached the compile.

Correct order, now shipped: **build -> compile -> textures**.
- build steps: hard requirement, the fight cannot legally start without them
- shader programs: hard requirement, this is what stutters an opening exchange
- textures: PROGRESSIVE (an un-upgraded surface renders lower-tier, it does not
  hitch) and close to unbounded, because draining enqueues follow-up work. Time
  boxed at 8 s, then left to the background heartbeat it always used.

Gate duration under 6x CPU throttle went 20 s (capped, unfinished) -> 8.9 s
(completed on the texture time-box).

### Two UI details that were worth the effort

- The progress DENOMINATOR is the peak total ever seen, not the total at arm
  time. Surface jobs enqueue follow-up work, so `remaining` routinely climbs
  above the opening figure; with a fixed denominator the bar sat near 0% and
  then snapped to done. Peak-tracking keeps it monotonic and truthful: "of all
  work discovered so far, this much is finished".
- The bar is created LAZILY, only if the gate is still open after 180 ms, and it
  lands on 100% READY for 260 ms before the bell. Without the lazy create, fast
  machines got a pointless flash of chrome; without the landing beat, the bar
  vanished mid-track (72%) and read as "gave up" rather than "ready".

The compile itself is unconditional — an unthrottled run still compiled 2
programs during the fight when the gate skipped on "nothing queued".

### Measured

- 6x throttle: bar appears, holds 8.9 s, BUILDING -> COMPILING -> WARMING
  SURFACES -> READY, bell after.
- Unthrottled: NO bar, gate closes in 0.2-0.3 s, bell on the frame it always
  rang. The feature costs a fast machine nothing.

### What I could NOT prove, stated plainly

A frame-time win on this machine. Interleaved A/B, 3 runs each, frames >33 ms in
the first 6 s of fight: gate OFF gave 5, 2, 110; gate ON gave 26, 39, 21. The
noise floor here (a 110 in the OFF arm) swamps the effect. Gate ON is more
CONSISTENT, but "more consistent across 3 samples" is not a performance claim.
The defensible results are the mechanical ones above. A clean-machine A/B with
more samples is owed — and is the same debt round 43 recorded.


## ROUND 43 — the worst lap in the game was mine, and round 38 blamed the wrong system

### The mis-attribution

Round 38 reported `replayGore` as the top remaining sim cost (40.0 / 45.7 ms) and
recorded it as `replay.captureFrame()` — "the instant-replay recorder, not gore".
That was read off the lap's NAME. The lap wraps BOTH `gore.update(dt)` and
`replay.captureFrame()`, and captureFrame only writes floats into a preallocated
ring buffer: it cannot cost 45 ms.

Split the lap (`gore` | `replay`) and every bad tick lands on gore:

    {"total":43.9,"gore":43.2,"__gcDropMB":13.7}
    {"total":37.3,"gore":36.8}
    {"total":35.6,"gore":34.2}
    {"total":33.6,"gore":31.8}

`replay` does not appear at all. The 13.7 MB GC drop names the culprit outright.

### It was round 36's fix, half-finished

Round 36 moved the ~1 MB `bone.clone(true)` off the DAMAGE frame — correct — and
parked it in `Gore.update()`, where it is still a 31-43 ms synchronous spike
(measured this round: tail 31.1 ms, earR 38.8 ms). Round 36 even recorded this as
a residual and claimed it was "not in the top-3 worst laps". It was number one.
It stayed hidden because the bundled lap name pointed at the recorder.

Note the cost does NOT track node count — earR is 6 nodes at 38.8 ms while
forearmL is 20 nodes below the timer floor — so "it's only a few nodes" is not a
defence for cloning on a live frame.

### First fix was a dodge, and the measurement said so

Gating `_prepareDetachClones` out of the fight phase cut the spikes 4 -> 1, so I
nearly stopped there. But `preparedLeft` 2 against `detachedProps` 3 meant later
detaches were falling back to the INLINE clone — the spike had simply moved back
onto the damage frame, which is where round 36 started. Same cost, worse place.

The question I had skipped: why does cloning a SIX-NODE subtree cost 38 ms?

### Root cause: THREE deep-copies userData as JSON

`Object3D.copy()` runs `this.userData = JSON.parse(JSON.stringify(userData))`,
and these bones carry the secondary-motion spring chain in userData:

    earR      5 nodes   1.88 MB userData JSON   ->  16.3 ms
    tail     12 nodes   4.48 MB                 ->  39.0 ms
    trunk    12 nodes   3.29 MB                 ->  31.1 ms
    forearmL  4 nodes   249 BYTES               ->   0.1 ms

Cost tracks userData bytes, not node count — which is exactly why round 36
measured a 6-node ear at 38.8 ms next to a 20-node forearm below the timer floor
and recorded the anomaly without explaining it, and why the heap profile saw
megabytes under `copy`.

`cloneDetached()` swaps userData for a frozen empty object across the subtree,
clones, and restores in a `finally` (a throw mid-clone must never leave the live
rig stripped of its springs — that would silently kill all secondary motion). A
detached part is an inert physics prop; nothing on it ever reads userData.

    earR   17.5 ms -> 0.03 ms      tail  39.9 ms -> 0.06 ms
    trunk  28.0 ms -> 0.06 ms      live rig keeps all 8 spring chains

With the root cause gone the fight-phase gate was deleted: the pool stays warm
(preparedLeft back to 5) and costs nothing. Live profile after: WORST SIM STEPS
is EMPTY — no sim step exceeded 20 ms for the whole fight. A detach landing on an empty slot falls back to
the inline clone — one spike on that hit instead of one guaranteed spike per
replenishment, and the fallback is the pre-round-36 path, already proven
equivalent in round 36's node-by-node check.

Gore spikes in the worst-step list: 4 -> 1, and the survivor is an intro-phase
build. `preparedLeft` 5 -> 2 confirms the pool stops replenishing under fight.

### Honest caveat on this session's absolutes

This run's frame numbers (gap p99 92.6 ms, 29 frames >100) are far worse than the
clean runs of rounds 36-38 (p99 17-25 ms) because the machine was carrying
several browsers. Per my own discipline: counts are load-immune, absolutes are
not. The reliable signals here are the LAP ATTRIBUTION and the spike COUNT, not
the millisecond totals. A clean-machine re-measure is still owed.


## ROUND 42 — the lens glyph was the wrong glyph

Reference art supplied for the sunglasses. The shipped glyph was a MARKET TICK:
flat-diagonal-flat, i.e. horizontal bars at both ends with one diagonal between
them. The reference is the inverse — a LIGHTNING ZIGZAG: both end strokes are
steep diagonals, joined by a shorter middle run that kicks back the other way.

    was   GLYPH = [[-0.0430,-0.0255], [-0.0145,-0.0255], [0.0145,0.0255], [0.0430,0.0255]]
    now   GLYPH = [[-0.0400, 0.0300], [-0.0130,-0.0080], [0.0100,0.0080], [0.0400,-0.0300]]

Stroke 0.016 -> 0.019, matching the reference's chunkier mark.

### The second error, which the first render exposed

Getting the zigzag right was not enough: it came out FALLING to the right where
the reference RISES, and the two lenses were mirror images of each other. The
file mirrored the glyph deliberately ("MIRRORED between the lenses (§3), so the
pair is symmetrical about the trunk") — but the reference repeats the IDENTICAL
glyph on both lenses, same lean, no mirroring. So:

    was   const z = side * (LENS_ZC - 0.003 + n[0])
    now   const z = side * (LENS_ZC - 0.003) + n[0]

`side` now places the glyph on its lens without flipping the glyph's own
direction. `wrapAt` takes |z| internally, so the shell projection is unaffected.

Clip budget still honoured: |z| 0.040 + cap 0.0095 = 0.0495 against the 0.051 the
panel's flat-topped run allows; |y| 0.030 + cap = 0.0395 against its 0.0565
half-height. Verified in render — both glyphs sit wholly inside their panels.

Model unchanged otherwise: 23 meshes / 37744 tris, height 2.000, span z 1.055,
and costume 1 (the green BULL MARKET variant) still builds.

### Not changed, and worth a decision

The reference lenses are D-shaped — a flat brow with a semicircular BOTTOM edge —
while the game's are a wraparound visor with a much straighter lower edge. That
is a silhouette change to the shell, not the "pattern", so it was left alone
rather than folded into a glyph fix. Flagged to the user.


## ROUND 41 — Wally's proportions: fuller body, real arms

The brief: body slightly bigger, arms more normal, and he must read as WALLY.

### What the renders showed against the reference sheet

Captured front/side/back/three-quarter through the documented `?cap=1` driver
(`__viewport` / `__fight` / `__poseCam`) with the framebuffer read back over CDP.
Against the four supplied studio renders the shipped model was: a TAPERED SLAB
torso the head dominated, and arms like pipe cleaners ending in nub hands. The
reference is a rounded egg with thick soft arms roughly two-thirds the leg's
heft and proper mitten hands.

### Changed

- PEAR table: belly ±0.310 -> ±0.336 (+8.4% width, +9.5% depth), shoulder
  ±0.250 -> ±0.274, easing to 1.0 at the crotch tip and into the neck rows so
  the head join and the glasses wrap are untouched.
- Upper arm 0.085 -> 0.102 (its wall still lands exactly on the new shoulder),
  forearm 0.080 -> 0.096, hand +18%.
- Outward drift raised (upper 0.030 -> 0.058, forearm 0.148 -> 0.170) — see below.

Envelope is UNCHANGED: height 2.000, span z 1.055, depth x 0.810, 23 meshes /
37744 tris, all 17 bones. The ears and trunk still set the bounds, so nothing
that keys off them moved, and every hitbox in the file is an authored constant.

### Two mistakes the tooling caught, not my eye

1. FIRST PASS SWALLOWED THE ARMS. I widened the body and, thinking "arms hang
   closer in the reference", REDUCED the outward bow. At ±0.274 against a
   ±0.336 belly the whole upper limb sat inside the body silhouette and only the
   hand cleared it. The bow has to grow WITH the torso, not shrink.
2. THE SLOT. `wally-front.mjs` prints the model's own front fill, and the file
   documents arm/belly daylight opening at y/H 0.36 (world 0.72). After the
   first pass it opened only at 0.54 — I had closed a documented feature without
   noticing, because the render still "looked fine". Tapering the HIP band
   (0.610-0.720) while keeping the belly full took it back to 0.58.

Residual, stated honestly: 0.58 is not 0.72. Daylight requires the arm's INNER
edge to clear the body's outer edge, and on a belly this much fuller that would
need a scarecrow swing. The reference itself shows the arms touching the body
through the belly band and separating at the hip, which is what ships.

3. CONCENTRICITY. Raising the upper tube's end drift to 0.058 left the forearm
   pivot at 0.030 — the file explicitly keeps those equal so the two surfaces
   are concentric at the join and no forearm rotation can step the outline. I
   broke that invariant and only found it re-reading the comment I had edited
   around. Pivot re-matched.

### Rig note

`__poseCam` sets `cam.enabled = false` and `cam.frozen = true`, but
MatchScreen:1358 calls `this.cam.update(dt)` unconditionally and honours
neither, so the camera snaps back to the wide arena shot and every "portrait"
comes out as a gameplay frame. The capture rig neutralises `cam.update` from the
page. Worth fixing in MatchScreen so the documented driver API actually works.


## ROUND 40 — results screen, HUD meters, and the portrait lockout

### The results menu was a dead end after EVERY match

`.wcs-screen` is `overflow: hidden`, so an off-screen row is not "scroll to reach it",
it is unreachable. Measured 812x375: the winner stack ends ~y159 and 55px rows pushed
'Main Menu' (plus 'Character Select' on six-row results) past the bottom edge. Two-column
grid in the landscape block; now 0 buttons off-screen, rows 55px.

### Portrait was a full product lockout, not just a gate

Round 37 recorded `.wcs-rotate` as "the deliberate portrait gate" and moved on. It IS
deliberate — but `grep -rn 'wcs-rotate|this.rotate' src/` returns only the construction,
the append, and two CSS rules. No listener, no `orientationchange` handler, no
`screen.orientation` code anywhere. On a rotation-locked phone the gate can never be
satisfied and it is `inset:0; z-index:1300; pointer-events:auto` with zero tappable
pixels — the whole product, unreachable, with no way out. It now carries a 44px
PLAY ANYWAY escape (`.wcs-rotate.dismissed { display:none !important }` — it has to beat
the `@media (orientation: portrait)` rule). Landscape stays the recommendation.

### HUD meters: two wrong fixes before the right one, both caught by measuring

`.hud-meters` is bottom-anchored into both thumb zones and `.wcs-touch` (z-index 10)
paints over `.wcs-hud` (no z-index at all), so the local player's SPECIAL readout sat
under the movement thumb.

1. Lifted them to the top -> straight into the pause chip (right:10px, y66-116).
2. Inset symmetrically 25vw -> P2 box x430-609 against BLOCK's left edge at x606. A 3px
   clip, invisible to inspection, obvious to a rectangle-intersection test.
3. Measured the real geometry instead of guessing a third time: stick base x20-118,
   cluster x606-802. `left:25vw; right:28vw` ends the band at x585, clear by 21px.

Asymmetric on purpose — the button cluster is wider than the stick.

### A test-design note worth keeping

The meter check first asserted "meters above the stick band", where the band was the
stick's 72vh CAPTURE rectangle reaching up to y105. That failed the layout for
overlapping an invisible rectangle. What occludes a readout is the VISIBLE control, so
the assertion now intersects the meter boxes against `.wcs-touch-btn` /
`.wcs-touch-stickbase` / `.wcs-touch-nub` and names what it hit. The first version was
the test being wrong, not the layout.

Same class of error as round 39's: a check that measured `.hud-meters` on the results
screen, where it does not exist, reported `missing` and silently asserted NOTHING while
counting as a pass. Every skipped assertion now has to say so.

### Verified

results 0 off-screen / 55px rows; meters clear of all 7 visible controls; portrait gate
shows, its escape is 174x50, a tap dismisses it and the page underneath becomes reachable;
escape audit ALL PASS; desktop keyboard 7/7.


## ROUND 39 — the fix that shipped dead, and two things I waved away too early

The two audit verifiers that died in round 38 were re-run (workflow resume, cached
agents replayed). They found a blocker IN ROUND 37'S OWN FIX.

### Costume B: I added the control, never tapped it, and shipped it dead

`.sel-costume` is a child of `.sel-panel`, which is `pointer-events: none` (ui.css:706,
deliberately — the panels must never swallow taps aimed at the roster grid). So the
`onclick` added in round 37 could never fire. Verified live by the verifier and then by
me: computed `pointer-events: none`, `elementFromPoint` at the control's centre returned
`.wcs-screen wcs-select`, and a dispatched click left `costumes` at `[0,0]`. The label
read 'TAP TO SWAP' the whole time — the screen actively instructed an impossible action,
which is WORSE than the original silent unreachability.

Fix is one line, outside any media query so it tracks the class rather than the pointer
type: `.sel-costume.tappable { pointer-events: auto; }`. Do NOT remove the `none` from
`.sel-panel` — that rule is load-bearing for the grid behind it.

THE LESSON: I verified the BACK buttons by tapping them and confirming the destination,
then added the costume control and verified only that the screen still escaped. Adding a
control and confirming the control WORKS are different claims. `costumecheck.mjs` now
asserts the state change: tap -> `costumes [0,0] -> [1,0]`, gallery `costume 0 -> 1`.

### Menu fold: I called this a false positive. It was half right.

Round 37 recorded the offscreen menu rows as "a false positive from my own tooling"
because `.menu-list` has `overflow-y: auto`. The scrolling part is true — it is not a
dead end. But ten rows at the 44px floor need 440px of column and a landscape phone has
~323px of list: measured 812x375, `scrollHeight 577` vs `clientHeight 323`, FIVE rows
below the fold including Settings, the only route to remapping and Replay Intro. Half the
hub invisible on the app's own target orientation is a real defect; "it scrolls" is not
an answer to "you cannot see it exists".

Two columns under `@media (pointer: coarse) and (max-height: 480px)`. The
`::before`/`::after` auto-margin struts must be disabled or they consume a whole column.
Now: `column wrap`, 0 rows below the fold, `scrollH 323 == clientH 323` (no scrolling
needed at all), rows still 53px.

### Also

MenuScreen's `onBack` (-> title) ran through `menuPressed('back')`, keyboard/gamepad only;
it gets the shared back button. Not a dead end — every row is tappable — but the exit was
unreachable.

### Verified

costume/gallery/menu checks ALL PASS; escape audit ALL PASS (menu now escapes to title);
desktop keyboard 7/7. Desktop layout confirmed untouched: without `pointer: coarse` the
menu still renders single-column at the original row positions.

### Note on measuring touch in the Browser pane

The pane does NOT emulate `pointer: coarse` at 812px wide, so coarse-only rules silently
do not apply there and tap targets measure at their desktop sizes. Every touch claim in
rounds 37-39 comes from the CDP rigs with `Emulation.setTouchEmulationEnabled`; the pane
is only good for looking at the desktop path.


## ROUND 38 — closing round 37's open list (training/playground/story on a phone)

### The audit finished: 43 confirmed. Two verifiers died mid-run.

`verify:menu-title-loading` and `verify:results-gallery` failed with "computer went
to sleep mid-response", so those two groups' findings are UNVERIFIED — not refuted, not
confirmed. Treat MenuScreen / TitleScreen / LoadingScreen / ResultsScreen as un-audited.

One verifier independently reproduced the `.sel-diff` z-index blocker by rebuilding the
phase-2 DOM against a byte-copy of ui.css, then re-probed against the fixed stylesheet and
found all five boxes returning `.diff-box` — an independent confirmation that the z-index
was the whole cause, not a partial fix.

### The measurement trap that nearly ended this round early

The first layout pass audited the training and playground PICKERS and reported them clean.
The panels round 37 flagged do not exist on the picker — they mount when the SESSION
starts. Auditing only the entry screen would have declared them fixed without ever
rendering them. The rig now calls `_startMatch()` / `_start()` before auditing.

Second trap, same shape: after collapsing the panels behind a chip, "clean" is not proof —
hiding everything reads identically. `sheetcheck.mjs` therefore asserts POSITIVELY: the
chip exists at >=44px, a real tap OPENS the sheet, the panels are then visible with >=44px
rows, the container fits the viewport AND scrolls, and a second tap closes it.

### What was actually wrong on a phone

Measured at 812x375: the stick capture zone is `left:0 bottom:0 42vw x 72vh` = x0-341,
y105-375, which CONTAINS `.tp-moves` (left:10 top:120 w238) outright — so it could never be
scrolled, the stick ate the drag. `.tp-fdata` starts at `calc(120px + 218px)` = 338px on a
375px screen. `.pg-legend` is right:10 top:64 with ~19px rows, directly under the button
cluster. And `TouchControls._onScreen` did `this._show(name === 'match' || name ===
'playground')` — but playground OPENS on its picker, so the cluster buried the picker while
its own hint read "TAP THE ARROWS". Training already avoided this by waiting for
`match:start`; playground now emits `playground:start` and gets the same treatment.

Both mode overlays now collapse behind one 44px chip (TOOLS / TOYBOX) in the top strip —
the only band owned by neither the stick nor the buttons.

### Two bugs I introduced and caught by measuring

- The training sheet used content-box, so 78px of padding was ADDED to its `inset:0`
  height: 396px on a 375px viewport. `.pg-legend` already had `box-sizing:border-box`,
  which is exactly why the playground sheet fit and this one did not.
- `.tp-overlay` is z-index 5 and `.wcs-touch` is 10, so the open sheet sat UNDER the stick
  capture zone (`touch-action:none`) and could not be scrolled — reintroducing the very
  defect the sheet exists to fix. Now z-index 41, like the playground sheet.

### Structural fix for the tap-through class

`ScreenManager`'s 8-frame grace existed to stop "the keypress that triggered this
transition" activating something on the new screen — but it guarded `update()` only, and
DOM handlers bypass the loop entirely. That is the hole every tap-through went through.
`goto()` now also freezes pointer input (`.wcs-input-grace`) for the same window, cleared
in `update()` with a 250ms timer fallback.

### Verified after all of it

escape audit ALL PASS; phase 2 reachable + BACK + difficulty tap starts the fight; sheet
checks ALL PASS (both sheets z-index 41, fit 375px, scrollH 1307/842 > clientH, rows
>=44px, toggle both ways); desktop keyboard 7/7 with no touch chrome on desktop.

### Still open

- MenuScreen / TitleScreen / LoadingScreen / ResultsScreen were never verified (above).
- Credits fast-forward (`isDown` crouch/light) is still keyboard-only; minor.
- `.tp-inputs` input-history strip is hidden on touch rather than relocated.


## ROUND 37 — the phone could not leave the character select, and that was the small half

Reported: on a phone you cannot get out of the character list. The cause generalises.
`InputManager` only ever raises `_menuEdge.back` from a keyboard code or a GAMEPAD
(`this.edge[p].heavy && this.pads[p] >= 0`), so `menuPressed('back')` is unreachable on a
touch device and EVERY screen whose only exit ran through it was a one-way door.

### Method

Tap-only reachability rig (`/private/tmp/mobileescape.mjs`): emulated iPhone LANDSCAPE
812x375 with touch emulation on so `@media (pointer: coarse)` actually applies, driven by
`Input.dispatchTouchEvent` at real coordinates. Setup by `goto()` is instrumentation; the
ESCAPE is tap-only — no key events, no `element.click()`. When the back-looking controls
fail it brute-forces EVERY tappable element, so a failure means "no escape exists", not
"I didn't find one". A multi-agent audit ran in parallel; every finding was adversarially
re-verified before being acted on. 37 confirmed.

### Two rig bugs worth remembering (both produced confident, wrong readings)

- First run tested PORTRAIT, where `.wcs-rotate` covers everything by design, and
  concluded the title screen ignored taps. Orientation is part of the test setup.
- The rig accepted ANY screen change as "escaped". The back button was landing on the
  menu and then tap-throughing into Story Mode, and the rig called it a PASS. Assert the
  DESTINATION, not that something happened.

### Blockers found

- `.sel-diff` declared `z-index: 3; /* over the grid */` while `.sel-grid` is 4, so during
  Versus CPU's difficulty step all five boxes were hit-tested UNDER the grid:
  `elementFromPoint` returned `.sel-grid` for every one. No forward, no back — the FIRST
  main-menu item softlocked a phone until reload. The comment had contradicted the value
  all along, and keyboard/gamepad never noticed because they do not hit-test.
- Costume B (select) and the costume preview (gallery) were unreachable: `_toggleCostume()`
  had exactly one caller, a `heavy` press, and there is no heavy button outside a match.
- Dead ends with no tap exit: select, settings, gallery, movelist, credits, plus the
  training / playground / story / arcade pickers. Credits had ZERO tappable elements.

### Tap-through: one gesture, two screens

Title, Loading and Vs advanced on `pointerdown`, swapping the screen BETWEEN finger-down
and finger-up — so the browser delivered the click to whatever had just appeared under the
thumb. One tap on the title launched Training. All three now use `click`.

I then made the same mistake in reverse: the new BACK button used `pointerdown`, the menu
mounted mid-gesture, and because `.menu-list` starts at 5vh under `@media (max-height:520px)`
every BACK tap launched Story Mode. Caught only by the destination assertion above.

### Fixed

One shared `uiKit.addBackButton()` (touch-only, 44px, safe-area aware, above every screen's
stacking context) covers all the dead ends; `.sel-diff` z-index 3 -> 6; three screens moved
to `click`; coarse-pointer floor 40 -> 44 and extended to the screens it never named
(story rows, training/playground pickers and arrows, replay controls whose only CLOSE was
~28px); settings steppers given a real box (as centred flex items they stayed ~15px tall no
matter the horizontal padding); volume sliders, save card, pause chip raised; tutorial SKIP
moved off the pause chip it was eating; `.mv-legend` and the VS glyph un-overlapped;
keyboard-only copy branched on touch ([K] SWAP, K KICK, gamepad note, PRESS ANY BUTTON,
PRESS A KEY / ESC CANCELS); the remap key-capture trap given a tap escape.

### NOT defects (recorded so they are not re-investigated)

- The four "offscreen" main-menu rows are inside `.menu-list { overflow-y: auto }` and
  scroll into view. My own rig reported these as offscreen — a false positive.
- Portrait being blocked is the deliberate `.wcs-rotate` gate.
- Two desktop ESC failures in one run did NOT reproduce across three later runs on
  identical code: flaky timing under browser contention, not a regression.

### Still open

- TrainingMode layout: frame-data panel pinned at `top: 338px` falls off a 390px screen,
  and the move-list panel sits inside the touch stick's capture zone so it cannot be
  scrolled. Needs a real layout pass, not a floor bump.
- Training/playground legend rows (~19px) sit under the touch button cluster.
- `MenuList` rows are tagged only `.wcs-btn`, so the 44px floor reaches them only via the
  screen-specific selectors listed in the coarse block.
- `ScreenManager`'s 8-frame input grace guards `update()` only, so a DOM tap can still
  reach a just-mounted screen — the structural fix for the tap-through class.


## ROUND 36 — the detach clone is off the damage frame (round 35's fix, implemented)

### Should it have been implemented? A second, independent line of evidence said yes.

Round 35 named `Gore._detach() -> bone.clone(true)` from the heap profile alone. Before
touching it I checked whether the FRAME profiler agreed, and it does — the two call paths
into `onDamage` are exactly the two laps that owned the worst sim steps:

- `applyScriptHit` (MatchScreen:2842) -> `_goreHit` -> `onDamage` -> `_detach`  == the `fx` lap (43.7 / 25.4 / 23.5 ms)
- `_resolveOtgHit` (MatchScreen:2314) -> `_goreHit` -> `onDamage` -> `_detach`  == the `scans` lap (37.1 / 51.3 ms)

Top allocator and worst lap are the same code reached two different ways. That is what
turned "plausible" into "do it".

### What shipped (src/combat/Gore.js)

- `_firstCandidate()` now draws from a per-category queue shuffled ONCE per round instead
  of picking at random on the damage frame. Same distribution (a detached bone is
  invisible, so the old random pick was already without-replacement) — but it means we
  know WHICH bone is next before the hit lands.
- `_prepareDetachClones(dt)` builds that next clone ahead of time, one per 0.25 s, from
  `update()`. Three groups x two fighters = at most ~6 live; measured 5 prepared and warm
  well before the bell.
- `_detach()` takes the prepared clone and calls `syncPose()` on it instead of cloning.
- `syncPose()` copies local transforms + material refs onto the existing structure,
  allocation-free, and returns false on ANY structural disagreement so a drifted rig falls
  back to the old inline clone rather than rendering a mismatched part.

Trap avoided: the first version consumed the queue head with `shift()`. Ragdoll and replay
also hide bones through the same `visibilityLedger`, so a temporarily-hidden bone would
have been dropped from the round's candidates for good. It scans instead of consuming.

### Measured

| | before | after |
|---|---|---|
| total sampled allocation, 35 s | 13.8 MB | 3.5 MB |
| `clone->copy` under `_detach` | 10.67 MB (77% of all allocation) | absent from the profile |
| sim update p90 / p99 | 4.9-7.0 / 8.1-15.1 ms | 1.7 / 2.8 ms |
| sim update median | 2.2-2.3 ms | 0.9 ms |
| worst per-detach cost on the damage frame | 12.5 ms (earR), 38.6 ms (earL) | below the 0.1 ms timer floor |

The per-detach A/B is the confounder-free number: same bones, same instant, best-of-5,
both arms interleaved. It matters because the heap run happened to see only ONE detach, so
fight variance explains part of the 13.8 -> 3.5 MB on its own — the A/B does not depend on
how violent the fight was. Note the cost is NOT proportional to node count (a 20-node
forearm clones below the timer floor while a 5-node ear costs 12.5 ms), so per-detach
saving ranges from ~0 to ~39 ms depending on which bone comes up.

### Correctness: proved, not eyeballed

`toDataURL` readback of two forced detaches shows a valid part in the scene and no
corruption (8 nodes / 3 meshes / 0 missing geometry, in-scene and visible). But "looks
fine" is a weak claim, and the pose question was the real risk — a pooled clone froze its
children at build time, and the trunk curls and the ears flap. So both arms were built from
the same live bone at the same instant and compared node-by-node: type, name, local
position/quaternion/scale, visibility, geometry identity, material identity.

    trunk 12n / forearmR 4n / mug 7n / earR 6n / forearmR 13n  -> ALL 5 IDENTICAL

### Newly exposed, NOT newly created

`replayGore` is now the worst lap (40.0 / 45.7 ms). It is a mislabelled lap: it wraps
`this.replay?.captureFrame(this.phase)` (MatchScreen:1528), the instant-replay recorder,
not gore. It was always there, ranked below the clone spikes. It is the next target.

### Residuals

- Replenishment after a detach still builds a clone on some mid-fight frame. Strictly
  better than before (it no longer stacks with hit VFX, particle burst, prop spawn, audio
  and camera shake on one frame) but it is not free. Not in the top-3 worst laps.
- Up to ~6 prepared clones are retained for the match. Steady retention, not churn.
- Single runs. `>50 ms` frames went 1 -> 3 between runs and gap p99 17.6 -> 24.8; those are
  `replayGore`, not gore, and the runs are noisy at that tail.

## ROUND 35 — the allocator is NAMED: Gore._detach() deep-clones a bone subtree

### Heap sampling profile, live fight, 35 s, desktop (allocation sites are shared code)

    TOTAL SAMPLED 13.8 MB
    10.67 MB  copy   (three.js)      <- 77 % of ALL allocation
     0.48 MB  n      index:1085
     0.19 MB  Os     (three.js)
     ...everything else under 0.2 MB

One function is 77 % of the allocation in a fight. Walking the call tree for the callers
rather than the flat aggregate names it exactly:

    onDamage -> _popAccessory -> _detach -> clone -> copy -> clone -> copy -> ...   5.53 MB
                                _detach -> clone -> copy -> clone -> copy -> ...   5.14 MB

`Gore._detach()` (src/combat/Gore.js:545) calls `bone.clone(true)` — a RECURSIVE deep clone of
the bone's whole subtree. The clone/copy ladder in the stack is three.js recursing through it.

### The shape is worse than "allocates a lot"

`_onDamage` guards each threshold with `rec.fired.has(t.key)`, so `_detach` fires at most about
SIX times a round. 10.67 MB across that is roughly **1-1.7 MB per call** — a synchronous
multi-megabyte deep clone, executed at a damage threshold, i.e. at the exact dramatic beat
where a hitch is most visible. It is therefore BOTH:
  - the source of the GC pauses proven in round 34 (12.9 MB freed in one mid-fight tick), and
  - a synchronous spike of its own at the moment of the hit.

That also explains why the "worst subsystem" kept rotating across five runs: the collector runs
shortly after these bursts and lands in whatever block is executing.

### The fix

Pre-build the clones. There are only ~3 detachable candidates per fighter (ACCESSORY_BONES,
SECONDARY_BONES, forearm) and each fires once per round, so ~6 clones per match. Build them
during the round intro — where MatchScreen already runs budgeted build steps — and have
`_detach` take a prepared clone instead of calling `bone.clone(true)` on the damage frame.

Cautions for whoever does it: the clone is re-parented into a `wrap` Group and handed to
physics as a `gorePart` prop, its transform is reset to identity, and `opts.thumbsUp` adds a
mesh to it — so the pooled copy must be reset, not reused dirty. `lighting.js:4209` and
`characters/tired-ape.js:294` both have comments that depend on `_detach` cloning a subtree;
read those before changing the shape.

### Cross-platform
Gore is shared code. Desktop pays the same 1-1.7 MB clone; at 120 fps against an 8.3 ms vsync
floor it is absorbed, on a phone it is not.


## ROUND 34 — the phone sim spike is TWO causes, and one of them is GC

### Why the "worst subsystem" kept moving

Five runs, five different top offenders: fighters 48.4, scans 37.1/51.3, state 44.3, fx 43.7,
arena 21. A single slow function does not behave like that. A 44 ms state-machine tick for TWO
fighters is not plausible as work either. The signature fits a PAUSE being attributed to
whichever block it happened to interrupt.

Tested by sampling `performance.memory.usedJSHeapSize` across each tick
(`--enable-precise-memory-info`) and recording a fall as `__gcDropMB`:

    {total 46.1, fx      43.7, physics  2.1}                      <- real work, NO gc
    {total 31.6, physics 12.1, arena   10.0, __gcDropMB 12.9}     <- GC, 12.9 MB freed
    {total 27.3, fx      25.4, physics  0.9}                      <- real work, NO gc

### So: two causes, and they need different fixes

1. **GC pauses.** Confirmed — one tick freed 12.9 MB mid-fight. That is allocation churn in the
   hot path, and it explains the rotating attribution: the collector lands wherever it lands.
   FIX: pool the per-frame allocations. Cheap to find with a heap sampling profile; the
   `fighterSplit` and sim laps are already in place to confirm the pauses stop.
2. **`fx` — the scripted specials/finishers loop — is REAL work**, 23.5-43.7 ms per tick and now
   the top offender in 4 of 5 runs, with no heap drop on those ticks. This is the most
   consistent genuine cost in the sim.
   FIX: look at what a special's `step()` does per tick; 25-44 ms for scripted fx on two
   fighters is far past what a phone can absorb inside a 16.7 ms budget.

### Both are cross-platform

`fx`, the scans and the fighter state machine are shared code — desktop runs them identically.
The 4x throttle does not create the cost, it makes a ~12 ms desktop spike legible at ~50 ms.
That is precisely why desktop-only profiling missed all of this: against an 8.3 ms vsync floor
at 120 fps, a 12 ms scripted-fx tick vanishes into the noise.

### Instrumentation now in place (all `?prof=1` only)
`__prof.simWorst` records, for any sim tick over 20 ms: the per-subsystem split, the
`fighterSplit` sub-split, and `__gcDropMB` when the heap fell across the tick.


## ROUND 33 — narrowing the phone sim spike. `scans` is the repeat offender.

### Two runs, and what is consistent between them

    run A  {total 51.3, fighters 48.4, physics  2.5}
           {total 39.0, scans    37.1}
           {total 35.9, physics  14.8, arena 11.7, fighters 7.7}

    run B  {total 54.5, scans    51.3, physics 1.8}
           {total 36.8, physics  14.7, arena 12.8, fighters 7.3,
                        fighterSplit {animator 4.3, animDrive 1.6}}
           {total 28.7, fx       26.5}

`scans` is the top spike in BOTH runs (37.1 then 51.3 ms). The `fighters: 48.4` from run A did
NOT reproduce — run B's fighter split shows the animator at 4.3 ms — so that one is either rare
or was a one-off. `fx` (scripted specials/finishers) appeared in run B at 26.5 ms and is a new
candidate. Run B was taken at load average 7.85, so its absolutes are inflated; the RANKING is
what carries.

### Instrumentation added this round (all `?prof=1` only, one dead branch otherwise)

- `Fighter.update()` split: state / animDrive / animator / rootMotion / presentation / integrity,
  accumulated into `__prof._fLap` and folded into the `simWorst` record as `fighterSplit`,
  cleared each tick so every record is one tick and not a running total.
- The `scans` block split into `scanHits` / `scanGrabs` / `pushApart` / `items`.

### NOT MEASURED YET — and deliberately so

The scans split is built and shipped but UNREAD: machine load hit 9.47 immediately after the
build, and a reading there would be contaminated the way several readings were earlier today.
Take it on an idle machine (`pgrep -f remote-debugging-port` == 0 and load under ~3):

    node /private/tmp/mobilefight.mjs 9845 permanent-reserve-core 4

and read `simWorst[].scanHits / scanGrabs / pushApart / items`.

### The hypothesis the split will confirm or kill

Two fighters cannot cost 37-51 ms to scan in steady state. Most likely one of the four is doing
work proportional to something unbounded — every prop, every debris body, every item — rather
than to the two fighters, or is building per-move hitbox data on first use. `_pushApart` and
`_updateItems` are the ones that plausibly touch collections that grow during a match.


## ROUND 32 — phone sim spikes located: it is `f.update()` and the hit scans, NOT physics

### How it was narrowed

After round 31 fixed the texture-band freeze, the worst phone frames became update-dominated.
Two measurements narrowed it without guessing:

1. STEPS PER FRAME — `{0: 1175, 1: 2483, 2: 107, 4: 1}`, and the worst frame was `u=60.2` with
   `steps=1`. So it is ONE expensive tick against a 4.7 ms median (a 13x outlier), NOT the
   accumulator catching up. That killed the pacing theory, which would have had a much cheaper
   fix (cap steps on touch) and would have been the wrong one.
2. SIM SUB-PHASE SPLIT — `?prof=1` now records the per-subsystem breakdown of any tick over
   20 ms into `__prof.simWorst` (AI / fighters / ribbons / scans / fx / physics / ragdolls /
   arena / props / particles / gore+replay).

### The answer

    {total 51.3,  fighters 48.4,  physics  2.5}
    {total 39.0,  scans    37.1,  physics  0.5, ragdolls 0.7}
    {total 35.9,  physics  14.8,  arena   11.7, fighters 7.7}

`f.update()` at 48.4 ms and the hit/grab scans at 37.1 ms. PHYSICS AND RAGDOLLS ARE NOT THE
CAUSE — which is what I expected going in, and was wrong about. Two fighters cannot cost 48 ms
to update or 37 ms to scan in steady state, so these are near-certainly LAZY CONSTRUCTION on
first use of a move (hitbox data, an animation clip, a spring chain) rather than per-frame cost.

### Next step

Sub-instrument `Fighter.update()` and `_scanHits`/`_scanGrabs` the same way, on the same
emulated phone, and find what is built on demand. The fix will be to build it at match load —
the same shape as every other first-use problem this session (shader variants, the intro
prewarm, the heart light). Desktop hides all of it: 48 ms at 4x throttle is ~12 ms unthrottled,
which never crosses a threshold worth noticing.

### Measurement note
`__prof.simWorst` keeps the 40 worst ticks over 20 ms, prof-only, one dead branch otherwise.


## ROUND 31 — PHONE FREEZES: fixed the non-preemptible build step. 4 -> 0 frames over 100 ms.

### The gap in every previous measurement

Every fight profile this session was DESKTOP, `high` tier, unthrottled. Mobile takes the `low`
tier (no composer at all) on far slower silicon, so none of the "120 fps, zero frames over
100 ms" desktop results said anything about a phone. User reported occasional in-fight freezes
on phones; profiling one is what found it.

### Measured on an emulated phone (390x844 @3x, touch, iOS UA, 4x CPU throttle, `low` tier)

    BEFORE                                    AFTER (two runs)
    frames >100 ms      4                     0 / 0
    frames >50 ms      13                     3 / 2
    frames >33 ms      94                    54 / 44
    p99                41 ms                 33.5 / 33.7 ms
    worst frame       133 ms                 91 / 75 ms
    render max        127 ms                 22.7 ms
    drain overrun    4628 ms                 2175 / 2179 ms
    errors              0                     0

### The cause: one build step is not preemptible, and it was a fixed size

`drainQueue()` checks its deadline BETWEEN steps, so a tick always costs
`budget + whatever step it had already started`. No budget value can slice below one step —
which makes the STEP SIZE, not the budget, the floor on how long one frame can block.

`BAND_ROWS` (rows of height field per build step) was a hard-coded 32 on every device:

    desktop, high tier              maxStepMs  54
    emulated phone, low tier, 4x    maxStepMs 157

and real budget phones run slower than 4x, so 200-400 ms is realistic. Desktop never showed it
because the identical band is three times cheaper there.

### The fix

`BAND_ROWS` is now a `setTextureQuality({ bandRows })` knob, defaulting to **8 on touch and on
the `low` tier**, 32 elsewhere. Identical work, identical image — the generation is simply cut
into four times as many interruptible pieces. Keyed off `isTouch` and not only the tier name,
because a phone can be set to `high` by hand and the CPU is still a phone CPU.

### What this does NOT fix, stated plainly

- The three first-use shader compiles (86-127 ms with `dProgs 1`) are a separate cause needing
  pre-warming. They did not appear in the after-runs, but that is luck, not a fix.
- `maxStepMs` is still ~145-157: some build steps are NOT band-limited (the upscale/halve
  steps around textures.js:2148, 2157, 2196, 2226, 2260). Those did not land during the fight
  sample, but they are the next non-preemptible unit if one does.

### NEXT LEAD — on phones the bottleneck is now the SIM, not rendering

After the fix the worst frames are update-dominated: `u=59.3`, `47.3`, `33.4` ms of physics,
AI and animation in a single frame at 4x throttle. The `low` tier reduces VISUAL load
(crowd 24, propLimit 12, no shadows) but does not reduce simulation cost at all. That is the
next lever for phones, and it is a different subsystem from anything chased this session.


## ROUND 30 — OPEN RISK: an intermittent loading-screen stall that should be impossible

### What was seen

Two `bootprof` runs sat on the loading screen for 62 s and never reached the title.
`marks ['loading@2']` — the screen never handed off. A third run on the same build was
healthy (loading 474 ms, intro 6910 ms, title 44.5 s).

### Why it should be impossible

`LoadingScreen` has a hard ceiling: `MAX_MS = 9000`. Past 9 s of wall clock it forces
`warmDone = true`, logs "prewarm ceiling hit ... entering anyway", and calls `_finish()`.
`elapsed` is `performance.now() - startedAt`, i.e. real time. So the screen cannot remain
past ~9 s WHILE ITS render() IS BEING CALLED. A 62 s stall therefore means the screen's
render() was not running — and Game.tick wraps `screens.render()` in try/catch that logs,
and the profile captured ZERO console errors.

### What it is not

- Not `?prof=1`: a probe with the profiler armed booted healthily (loading +4 s, intro +8 s).
- Not the profiler's own cost: same probe, plain `/`, identical timing.
- Not the synthetic resize (that was a separate, real `fightprof` bug, already fixed).
- Not concurrent browsers: every stalled run had `pgrep -f remote-debugging-port` == 0.

### The only correlation found

Stalled runs were at load average ~5.0; the healthy run at 2.45. Four direct probes
(`stallprobe` x2, `vischeck`, `shotarena`) all booted cleanly. `bootprof` stalled 2 of 3.

### Status: UNRESOLVED, and potentially user-facing

A game that sometimes never leaves the loading screen is the most serious open item in the
project — far more than any frame spike. It has been masquerading as harness flakiness all
session (the "never reached a fighting phase" aborts). It is NOT yet proven to be a harness
artifact: the four clean probes poll every 4 s while `bootprof` polls every 500 ms, so the
polling rate remains a candidate alongside machine load.

NEXT STEP, and do this before any more perf work: instrument `LoadingScreen.render()` with a
frame counter and a last-tick timestamp exposed on the screen object, then run boot 10x under
load. If render() stops being called, find what stops calling it. If it keeps being called and
the ceiling still does not fire, the bug is in the ceiling condition itself.


## ROUND 29 — THE ARENA BAND GATE IS NOISE-DOMINATED AS SAMPLED. Read before trusting it.

### The measurement that invalidates the others

`mountain-node-village`, same build, three samples minutes apart:

    median 143   below8 8.355 %   FAIL
    median 127   below8 2.637 %   FAIL
    median 103   below8 0.163 %   PASS

Median swings 103-143. below8 swings 0.163 % to 8.355 % — a FIFTY-FOLD range. `bull-market`
swung 69-95 across four samples on the same build. The dominant variable is WHERE THE CAMERA
IS, not what the build does.

`frameReport` was designed to be read at a canonical camera over many samples. `histprobe`
reads it at whatever camera a live AI fight happens to be at. A single sample is therefore not
a verdict, and neither is a single sweep of ten arenas.

### Consequences, including for this session's own work

- A "10 arenas pass" claim made earlier today was WRONG — it carried nine arenas forward from
  round 17 without re-measuring. The corrected sweep read 6 pass / 4 fail, and THAT number is
  not trustworthy either, for the reason above.
- Round 17 moved `mountain-dawn` from 86-148 to 62-124 on a SINGLE sample of 92. The arena now
  samples 103-143, i.e. mostly inside the band that was removed. That change was unjustified
  by its own evidence and probably made things worse.
- A below8 of 8.355 % looked like the copy-on-write fix (round 27) darkening contact shadows
  by restoring the occluder injection. It is not: the same build samples 0.163 % one run later.
  That fix is exonerated — and the near-miss is the point, because chasing it would have meant
  retuning AO against noise.
- Today's `sunset-stadium` move rests on a SCREENSHOT plus four samples. The image is still the
  strongest evidence and the change stands, but the numeric half carries the same caveat.

### What the gate needs before it can be used again

Sample at a CANONICAL CAMERA (fixed position/orientation per arena), or average N samples per
arena and compare distributions rather than single reads. Until then:
- do not add, move or widen a band on a single sample;
- do not read a one-run FAIL as a regression;
- do not read a one-run PASS as a fix.

The four current failures (meme-market p99 171, liquidity-swamp median 89, mountain-node-village
median 143, permanent-reserve-core median 34 + p99 185) are RECORDED, NOT ACTED ON. Two of them
are the same `p99 >= 190` specular-hierarchy check on the two darkest arenas, which the report
itself labels "a lighting finding, not a grade one" — that one is at least a consistent signal
and is the better lead.


## ROUND 28 — the last failing arena band, closed on a SCREENSHOT

`bull-market-colosseum` had been failing since round 17: median 58-75 against a
`sunset-stadium` band of 100-158. Round 17 deliberately refused to widen it, on the grounds
that "picking the threshold because it is the file you happen to have open is metric-gaming",
and required a screenshot before anyone touched the number. This closes it that way.

### The frame

A low sun rakes across the floor from one side casting long shadows; warm amber columns
against a pink-lavender sky; the S.P.Q.HODL sign lit; BOTH fighters legible (white Wally
downed left, the ape standing right) and the whole crowd readable in the stands; graded detail
in the shadowed floor rather than crush. It is a deliberate sunset that puts most of the frame
in warm shadow, which is what a low sun does.

    four runs: median 69 / 70 / 75 / 95   below8 0.7-3.9 %   clipped 0.000 %   pureBlack 0.000 %

Nothing crushed, nothing blown — a correctly exposed dark scene failing a band copied from
noon. Identical diagnosis to `mountain-dawn`.

### The change

`sunset-stadium` moves from the daylight group to dusk: **60-126, below8 8**. Floor set at 60
rather than copying tower-dusk's 62 because the median swings 69-95 on camera position alone;
a tight band would be flaky, and 60 still leaves a genuinely broken rig failing. Verified:
median 95, below8 0.738, ok TRUE.

ALL TEN ARENAS NOW PASS THEIR BANDS.

### Method note — CDP cannot screenshot this canvas

`Page.captureScreenshot` returns EMPTY for the game's WebGL canvas, which has no preserved
drawing buffer. Use the project's own rig: load `?cap=1` (which sets preserveDrawingBuffer),
then read `renderer.domElement.toDataURL('image/png')` over CDP. IMAGE ONLY — `?cap=1` inflates
frame timings and must never source a perf number (round 13).


## ROUND 27 — copy-on-write was silently dropping the shader injection

### The bug (a VISUAL one; the perf half did not pan out)

`_splitMaterial()` clones a shared material so a caller can mutate it — the copy-on-write
behind hit flash, damage tint and the camera's occluder fade. But `onBeforeCompile` and
`customProgramCacheKey` are assigned as OWN properties (lighting.js injects the analytic
occluder and fresnel rim through them; also ArenaBase, Gore, Particles,
institutionalCapitalTower), and three's `Material.copy()` does not carry own function
properties. VERIFIED EMPIRICALLY against the project's own three build:

    original onBeforeCompile own prop : true
    CLONE    onBeforeCompile own prop : false          <- hook lost
    original cacheKey                 : wcsOcc1
    CLONE    cacheKey                 : onBeforeCompile( /* shaderobject, renderer */ ) {}

So every claimed copy rendered WITHOUT its occluder/rim injection — and copy-on-write fires
precisely on the mesh being flashed, tinted or faded, i.e. the one the player is looking at.
The clone also falls back to three's default cache key (which stringifies the PROTOTYPE
onBeforeCompile), so it is a different program.

FIX: carry both hooks onto the clone in `_splitMaterial()`.

### The perf claim was NOT proven — say so

Post-bell compiles were 4-5 before and 5 after. The named `screen:767676#own` did drop out of
the list, but the count held because the other compiles are first-use of whatever enters view
as the fight develops (`cloth:e8e8f0`, three unnamed) — different materials every run, not one
culprit. The fix is justified by correctness alone. Do not cite it as a frame-time win.

### Harness bug #4 — a synthetic resize DURING loading stalls the boot

`fightprof` dispatched `resize` right after readiness, i.e. while LoadingScreen was still up,
forcing `renderer.setSize()` plus a pipeline target rebuild mid-load. That was the remaining
difference from `bootprof` (which never resizes and never stalls) and the cause of the
intermittent "loading screen never handed off". Resize AFTER the handoff. This is a
measurement artifact, not a game defect — a player never fires a resize during load.

Running tally of instrumentation bugs this session: profiler off-by-one, concurrent-browser
contention, readiness-too-early, resize-during-load. The probes have needed more debugging
than the game.


## ROUND 26 — fight rig fixed, and the best in-fight numbers of the project

### The rig bug: a device-metrics override applied BEFORE navigation stalls the boot

`fightprof` called `Emulation.setDeviceMetricsOverride(1920x1080)` before `Page.navigate`.
That is the only difference from `bootprof`, which never stalls. Removing it — same script,
one line — took the run from "loading screen never handed off after 60 s" to reaching the
bell at 13.1 s. The override is the cause.

FIX FOR THE RIG: apply the override AFTER the game has booted, not before navigating, if a
1080p measurement is wanted. Numbers below were taken at the window's natural size and are
therefore NOT comparable with the earlier forced-1080p figures.

### Clean 40 s fight, single browser, pre-check 0 chrome

    gap    med 8.3   p90 16.4   p99 17.6     <- median ON the 8.3 ms vsync floor
    update med 0.5   p90 1.0    p99 1.8
    render med 3.1   p90 3.8    p99 5.0
    frames over 100 ms: 0     over 50 ms: 1     over 33 ms: 6
    worst: 51, 43, 42, 36, 34, 34, 33, 33 ms
    steps5 0   lightChanges 1   errors 0

ZERO frames over 100 ms in a 40 s fight, and the single worst frame is 51 ms carrying
`dProgs 1` — a first-use shader compile. This is the closest the game has been to flawless.

### What remains

Four first-use compiles per fight (t = 17.0 / 21.4 / 43.4 / 52.8 s), costing 33-51 ms each.
Three are unnamed (pass materials); the fourth is `screen:767676#own` — an arena display panel
taking a copy-on-write private material at runtime, which gives it a new program key and a
compile on first draw. Pre-splitting those at build is the next lever.

Also still true: `unacc` max is 28.5 ms and `tex.overrunMs` 3019 over the run, so the surface
drain is no longer producing anything a player would see.


## ROUND 25 — CORRECTION: the "254 ms compile" is ~50-62 ms. It was contention.

### The correction

Rounds 23-24 reported the worst in-fight hitch as a 254 ms shader compile inside render
submit. Measured on a clean machine — `pgrep -f remote-debugging-port` returning 0, single
browser — the same compiles cost **49-62 ms**, and the worst frame of the run is **70 ms**:

    gap=70  r=68.4  dProgs=0
    gap=58  r=62.1  dProgs=1
    gap=54  r=49.4  dProgs=1
    gap=52  r=48.9  dProgs=1
    gap med 15.7   p90 22.6   p99 29.5   (no >100 ms frame at all)

The 254 ms figure was inflated by GPU contention from concurrent test browsers — the same
contamination behind the phantom freeze and the 361 s boot. The headline defect was roughly a
quarter the size it was reported as. Quote no spike number taken without the pre-check.

### What the compiles actually are — measured, not inferred

`?prof=1` now records the pipeline globals on BOTH sides of every compile, not just bulk ones.
Result for all five post-bell compiles: **`changed: NOTHING`**. No shadow-map, tone-mapping,
colour-space, clipping, composer, renderScale, AO/TAA, fog, environment or override-material
flip. So these are genuine FIRST-USE compiles, not global re-keys — which rules out the whole
class round 20 was about.

One of them is named: **`screen:767676#own`** at t=21482. That is an arena display panel whose
material took a copy-on-write PRIVATE copy at runtime (`#own`), giving it a new program key.
Not a post pass. The remaining four are unnamed, so still likely pass materials.

NEXT LEVER: pre-split the materials that copy-on-write mid-fight, so the private copy (and its
compile) happens at build time. Same family as rounds 19/20, now with a named instance to
start from.

### THE MEASUREMENT RIG IS NOW THE BOTTLENECK, AND IT HAS ITS OWN BUG COUNT

Three instrumentation bugs in one session, each of which produced confident wrong data:
1. profiler off-by-one — every hitch filed under the following frame's causes;
2. concurrent browsers — phantom freeze, 361 s boot, 254 ms compile;
3. `fightprof` readiness — treated "`__prof.split` exists" (true from the Game constructor) as
   "the game is ready", so `goto('match')` fired while LoadingScreen was still up and got
   overridden. That is the "never reached a fighting phase" abort; earlier runs worked on luck.

Fixing (3) by waiting for the loading screen to hand off then hit a NEW abort — "loading screen
never handed off" after 60 s — even though `bootprof` sees that handoff at 5.5 s on the same
build. The difference is that `fightprof` forces a 1920x1080 device-metrics override before
navigating and `bootprof` does not. Unresolved; the fight rig needs that isolated before it can
be trusted again.

RULE: the probes deserve the same scrutiny as the game. When a measurement says something
impossible, suspect the instrument FIRST.


## ROUND 24 — two spike fixes attempted, both MEASURED, both REVERTED. Read before retrying.

Target was the rare in-fight spikes left after round 23 (a 254 ms render submit carrying
`dProgs 1`, plus a few unaccounted frames of 120-210 ms). Nothing shipped. Recorded so the
next attempt does not repeat either of these.

### 1. In-drain texture upload — NO EFFECT, reverted

Theory: a 236 ms render submit with `dProgs 0, dTex 0` had to be a texture RE-upload (same
texture object, new data, so the count never moves). Gave textures.js a
`setTextureUploader(renderer)` and called `initTexture()` on each field as it finished, to move
the upload into the budgeted drain.
Measured: `render.max` unchanged at 254 ms; `tex.overrunMs` 2587 vs 2604/2658 before — nothing
moved into the drain, so uploads were never the cost. The corrected attribution then showed the
same frame carrying `dProgs 1`: a compile all along.

### 2. Pipeline.warmPasses() — HUNG THE GAME, reverted

The post chain is genuinely un-warmed: pass materials live on the pass objects, not in any
scene, so neither `Pipeline.warm()` nor MatchScreen's chunked warm can reach them, and the
unnamed programs compiling after the bell are almost certainly theirs. So warming them is
still the right idea. The implementation was not: collecting every pass material onto a
temporary quad scene and calling `r.compile()` from inside `_buildChain()` left the game
stuck on the loading screen — frames frozen, zero errors.

**`npm run build` PASSED and `harness --level 3` PASSED.** The harness is headless and never
constructs a RenderPipeline, so it structurally cannot catch a hang in the render path. Only
booting a real browser found it. Any future change to Pipeline construction needs a browser
boot check, not just the harness.

If retrying: warm the passes somewhere other than chain construction (the chain is not fully
wired yet at that point), and verify with a browser boot before anything else.

### 3. The "intermittent freeze" was a MEASUREMENT ARTIFACT

While verifying the revert, a poll script reported the game frozen in the intro (frame counter
static for 30 s) — and it reproduced at `6c63d9c`, i.e. before any of the day's changes, which
is what made it look like a real pre-existing bug worth chasing.

It is not. An independent probe that counts rAF callbacks directly:

    +12s rafPerSec 129 visible gameFrame 370 screen intro
    +15s rafPerSec  93 visible gameFrame 533
    +18s rafPerSec 129 visible gameFrame 714
    +24s rafPerSec  95 visible gameFrame 968

The game runs normally. The frozen readings came from runs with several Chrome instances alive
at once. LESSON, and it is the second instrumentation bug of the day: when a measurement says
something impossible, suspect the instrument first — especially after already finding one.

### Boot-time variance was MY OWN TEST HARNESS, and the rule already existed

Same build measured 43.0 / 42.9 / 43.7 s, then 54.4 / 61.6 s, then 361 s with the title never
reached. That last one is 8x and is not explainable by load. It is explained by overlap: a
three-run background job was still going while a foreground probe held its own browser open.
Two Chrome instances with live WebGL contexts starve each other.

Every impossible reading of the day traces to exactly that — the "frozen game", the 361 s boot,
the hung `bootcheck` polls. Confirmed by a single run with nothing else alive:

    pre-check: 0 chrome, load 2.57
    loading @ 507 ms   intro @ 5505 ms   title @ 42937 ms   errors 0

i.e. 43.1 s, matching the clean runs to within noise. No regression ever existed.

THE RULE WAS ALREADY WRITTEN DOWN, in round 13's admissibility protocol: "Real Chrome, no
?cap=1, ONE TAB, no other live WebGL context." It was broken by running measurements
concurrently to save wall-clock time. Never run two browser probes at once; check
`pgrep -f remote-debugging-port` returns 0 before starting one.

WHAT THIS DOES NOT INVALIDATE: every A/B conclusion this session, because those were COUNTS
(programs after the bell, bulk recompiles, light-count changes) taken back-to-back under
identical conditions — which is exactly why count-based criteria were chosen while the machine
was loaded. And the in-fight 8.4 ms median, taken single-browser on a quiet machine.


## ROUND 23 — in-fight: 120 fps steady state, and the last big hitch is ONE shader

### The good result

A live fight at 1080p, 40 s, 2400 frames, `permanent-reserve-core`:

    gap med 8.4 ms against an 8.3 ms VSYNC FLOOR   -> vsync-locked at 120 fps
    update med 0.6   render med 3.0   steps5 0   errors 0

That is against a 12.4-17.6 ms median earlier in the session. The two textures.js
fixes made for the BOOT path (idle-budget guard, heartbeat watchdog) were costing
in-match frames too. A second run measured a 16.6 ms median, so the game sits on the
120/60 fps boundary and which side it lands on depends on machine load.

### PROFILER BUG FOUND AND FIXED — it had been misfiling every hitch

`gap` is measured at the TOP of the tick, so it is the duration of the frame that just
ENDED, while u / r / dProgs / dTex describe the frame being recorded. They were stored
together, so every expensive frame was paired with the NEXT frame's causes. That is why
boot frames of 142-225 ms reported `dProgs 0` with a compile event 3 ms away, and why a
233 ms frame reported `r=3.8` in a run whose `render.max` was 164.9 ms. Fixed: the gap is
attached to the previous record and a frame only enters `worst` once the next tick reports
its duration. Every "unaccounted, no cause" reading before this commit is suspect.

### What it revealed: the worst in-fight frame is a SINGLE shader compile

    gap=258  u=1.4  r=254.3  unacc=3    dProgs=1  dTex=0
    gap=67   u=1.9  r=61.7   unacc=3    dProgs=1  dTex=0
One program compiling and linking costs 254 ms inside render submit. Five programs
compile after the bell in a 40 s fight. Their `WebGLProgram.name` is '?', i.e. they are
ShaderMaterial-based (no shaderName) — post/VFX shaders, not the arena or fighter
materials, which the chunked match warm already covers.

NEXT STEP: find what creates a ShaderMaterial after the bell and warm it at match build.
MatchScreen's `_warmStep()` walks `scene.traverse`, so it cannot see a pipeline pass that
is constructed lazily or a VFX material built on first use.

### A HYPOTHESIS THAT WAS TESTED AND WAS WRONG — do not retry it

Reasoning that a 236 ms render submit with `dProgs 0, dTex 0` had to be a texture RE-upload
(same texture object, new data, so the count never moves), I gave textures.js a
`setTextureUploader(renderer)` and called `initTexture()` on each field as it finished, to
move the upload into the budgeted drain. Measured: `render.max` unchanged at 254 ms,
`tex.overrunMs` 2587 vs 2604/2658 before — i.e. nothing moved into the drain, so uploads
were never the cost. REVERTED. The corrected attribution then showed the same frame
carrying `dProgs 1`: it was a compile all along.

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
