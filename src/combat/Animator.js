// ============================================================================
// Animator — v3.6. Procedural keyframe clip player with crossfade, spline
// interpolation, anticipation/overshoot shaping, additive layers with per-bone
// masks, spring-driven secondary motion, foot IK (two-bone AND one-bone) and
// root-motion extraction. CONTRACTS.md §4, GRAPHICS_CONTRACT.md §11.
//
// ---------------------------------------------------------------------------
// WHAT v3.4 ADDED, AND WHY (three measured critic findings, all roster-wide)
// ---------------------------------------------------------------------------
// 1. THE ATTACKER HAD NO BODY. "Arm extended, torso perfectly square to camera,
//    hips at zero rotation, both feet flat and parallel — a puppet arm swing
//    off a static body." The related P0 is that nine of the ten character files
//    carry ZERO eased and ZERO squash keys and lean entirely on the automatic
//    weight profile below, which is gated at SMART_MIN_GAP — and every attack
//    startup/active/recovery beat is a sub-0.12 s segment, so the profile is
//    switched off on exactly the frames that sell weight.
//    Fixing that inside the sampler is not available: shortening the gate would
//    reshape authored attack timing across ten files. So the weight is supplied
//    OVER the clip instead, by the 'torque' additive layer — see attackDrive().
//    Ten files get hips-then-spine-then-shoulder drive, a coil against the
//    direction of travel, an overshoot and a settle, with no file edited and no
//    authored key touched. Per-file wind-up keys are still the better answer
//    where anyone is willing to hand-key them; this is the floor, not the cap.
// 2. THE IDLE WAS A MANNEQUIN. Breathing existed but at 0.020 rad and 5.5 mm —
//    sub-pixel. Amplitudes roughly doubled, and a 'sway' layer added: a real
//    lateral weight transfer with a hip drop, which the foot IK converts into
//    knee bend. Secondary motion also gained an idle-life drive, because every
//    spring drive in the build (here AND in RagdollManager) is proportional to
//    body acceleration and therefore exactly zero in neutral.
// 3. FOUR OF TEN FIGHTERS HAD NO FOOT IK. WALLY, tired-ape, fatty-pingo and
//    cool-pal are built with one leg segment and no shin bone, and the two-bone
//    solver skipped them silently. One-bone chains are now solved too.
//
// ---------------------------------------------------------------------------
// WHAT v3.6 FIXED, AND HOW IT WAS MEASURED
// ---------------------------------------------------------------------------
// A. THE TORQUE LAYER FOUGHT THE CLIP. The sign of the body twist is now the
//    one that maximises the correlation of the LAYER'S OWN drive profile with
//    the clip's authored yaw, saturated so a 2*pi spin cannot outvote the rest
//    of the move. See clipTwistSign. Roster-wide, per-frame agreement on hips
//    yaw against the same clip with the layer off:
//      v3.5 clip mean       1306 pro / 181 anti,  2 moves anti-majority
//      v3.6 saturated corr  1306 pro / 150 anti,  0 moves anti-majority
//    Named cases: wally elephantElbow 16/7 (was 4/20 under v3.4's lead-limb
//    heuristic), wally trunkSlap 12/0, bonko parcelJab 10/0, bonko tailStrike
//    15/4, bonko backpackBash 27/7.
// B. A RELEASING FOOT KEPT ITS STANCE LOCK FOR SEVEN FRAMES. The lock now
//    releases at a rate proportional to how far the ankle has climbed past its
//    hold band, so a swing foot lets go in one or two. See _updateIK.
// C. Two v3.5 fixes are now measured rather than asserted, because the report
//    they answer was taken against v3.4: the foot IK re-plants foot after foot
//    for the whole walk (9 of 10 fighters have a support foot on 60/60 frames;
//    bonko's walk has a genuine 15-frame flight phase), and the sway layer's
//    hip translation reaches the model at dx 0.024 / dy 0.017 / dz 0.060 m,
//    the 60 mm being the lateral transfer on rig-local Z.
//
// ---------------------------------------------------------------------------
// v3.7 — WHAT WAS RE-MEASURED, AND THE ONE THING THAT CHANGED
// ---------------------------------------------------------------------------
// A defect report written against v3.4 kept being re-filed against this file.
// Every claim in it was re-run headless, on the shipped code, this round:
//
//   TORQUE ANTI-PHASE ("the layer fights the clip"). Not reproducible. A/B on
//   hips yaw, layer on vs the same clip with the layer off, agreement counted
//   per frame: wally elephantElbow 19 pro / 7 anti (the report's 4/20 was
//   v3.4's lead-limb heuristic), wally trunkSlap 12/2, bonko parcelJab 11/1,
//   bonko tailStrike 13/2 (the report's 0.000 rad — "lead unresolved" — is
//   gone; the clip-correlation sign resolves it to -1), bonko backpackBash
//   26/5. Roster-wide over all 159 attack clips: 1312 pro / 162 anti, 86 clips
//   correctly get no twist, and ONE move is anti-majority — crypto-punkd
//   glitchDodge at 4/8, a 0-damage dodge whose hips stutter +0.4 / -0.5 / +0.25
//   in 0.15 s, where no single sign can agree with more than half the frames.
//   A coherence gate (|Σ w·auth| / Σ|w·auth| < 0.35 -> no twist) does silence
//   it and takes the roster to zero anti-majority moves, and it was REJECTED:
//   it also silences elephantElbow 19/7, tired-ape lazyBackhand 25/6,
//   fatty-pingo unstablePrototype 43/13 and blackish-bull heavyHook 20/5, i.e.
//   it pays four hero moves for one dodge. Net agreement 1312/162 stands.
//
//   FOOT IK "RELEASES MID-WALK AND NEVER RE-SEATS". Not reproducible. dogey,
//   60 frames of walking at 5.4 m/s: 59 of 60 frames have a support foot, and
//   each chain re-plants 3 times. lockW on chain 1 runs 0 -> 1 over 8 frames,
//   holds 1.00 for 4, releases in 3 (the v3.6 overshoot-scaled release), and
//   the other chain latches while it is letting go, foot after foot, twice per
//   second for the whole cycle.
//
//   SWAY HIP TRANSLATION "DOES NOT REACH THE MODEL". Not reproducible. Over a
//   4 s idle the hips travel dx 0.0240 / dz 0.0600 m on all ten fighters (dy
//   0.011-0.062, clip-dependent), identical in bone-local and world space. The
//   0.0100 m in the report is the v3.4 fore/aft amplitude read on the wrong
//   axis: the 60 mm weight transfer is on rig-local Z, which the gameplay
//   camera looks straight down.
//
//   HIT-STOP FREEZES THE SPRING AT 0.0115 rad. Fixed in v3.5 and now traced.
//   Feeding dt = 0 for the move's own hitStop frames starting on the first
//   active frame: wally elephantElbow freezes at 0.3537 rad (92% of its 0.3859
//   peak) for 6 frames, wally trunkSlap at 0.1573 (90% of peak) for 3, bonko
//   parcelJab at 0.1718 (100% of peak) for 3. THE SPRING SHOULD KEEP FREEZING,
//   and the reason is in _updateLayers: the layer is ADDITIVE over a clip pose
//   that is not advancing, so a spring that kept integrating would be the only
//   thing moving inside a held frame, would slide off the pose it is layered
//   on, and would arrive somewhere the animation never asked for when the
//   freeze lifts. The deliverable is not "the spring keeps running", it is
//   "the held frame is the good one", and T.lead is what buys that.
//
// THE ONE CHANGE: a rig with no knees gets a shallower pelvis sink, because on
// those four fighters the sink cannot become knee bend and only becomes floor
// penetration. See SINK_NO_KNEE.
//
// WHAT THE RE-MEASUREMENT DID FIND, and it is NOT in this file. Splitting the
// foot-penetration number into the solver's own reference point before IK,
// after IK, and the lowest world MESH vertex, over a 4 s idle:
//     wally      1-bone  pre  0.0001  post  0.0003  mesh  0.0000
//     dogey      2-bone  pre -0.0293  post  0.0000  mesh  0.0012
//     peepee     2-bone  pre -0.0658  post  0.0032  mesh -0.0428
//     shibro     2-bone  pre -0.0470  post  0.0000  mesh -0.0176
//     bonko      2-bone  pre -0.0088  post  0.0003  mesh -0.0385
//     punkd      2-bone  pre -0.0546  post  0.0000  mesh -0.0439
//     bull       2-bone  pre -0.0732  post  0.0003  mesh -0.0295
//     tired-ape  1-bone  pre -0.0483  post -0.0499  mesh -0.0455
//     fatty-pingo 1-bone pre -0.0476  post -0.0478  mesh -0.0463
//     cool-pal   1-bone  pre -0.0469  post -0.0472  mesh -0.0580
//   (those are the numbers BEFORE the sink change; the one-bone rows improve
//   to -0.0302 / -0.0312 / -0.0428 at the mesh after it, the rest are
//   unchanged to the last digit.)
//   Two conclusions. (1) On every two-bone rig the solver does its job: it
//   puts its sole reference point within 3 mm of the floor from as much as
//   73 mm of clip penetration. The 18-44 mm that remains is FOOT GEOMETRY
//   rotating below that reference point — the ankle is keyed by the clip and
//   there is no foot-roll solve — so it is a character-file/clip fix, not an
//   animator one. (2) On a one-bone rig the solver recovers 0.8 mm of 48. That
//   is the documented least-squares limit of the aim below, and the honest fix
//   is a pelvis-lift pass or a shin bone in the rig; both are bigger than one
//   round and the pelvis lift fights crouch (IK is enabled in crouch), so it
//   was measured and deliberately not shipped.
//   NOTE also that WALLY — the character the "feet penetrate the floor in 100%
//   of frames, -0.0628 m" defect was filed against — measures 0.0000 here, in
//   idle and mid-walk, at the mesh. Whatever puts his soles through the floor
//   in the live build is downstream of the animator (fighter root y, the
//   presentation lean, or the arena's ground delta), not in this file.
//
// ---------------------------------------------------------------------------
// CLIP FORMAT (unchanged, and the compatibility guarantee that goes with it)
// ---------------------------------------------------------------------------
//   Clip = {
//     duration, loop,
//     ease?            true  -> legacy auto-smooth (see below)
//     interp?          'linear' | 'auto'   per-clip override of the animator default
//     slerp?           true  -> rotations interpolate as quaternions, not Eulers
//     weight?          false -> opt OUT of anticipation/overshoot shaping
//     root?            true  -> hips XZ translation is EXTRACTED as root motion
//     tracks: { boneName: [ { t, rot:[x,y,z], pos?, scl?, ease?, antic?, over?, tension? } ] }
//   }
//
// Rotations/positions are absolute local-space values; untracked bones fall
// back to the rest pose captured at construction.
//
// *** BIT-IDENTICAL PLAYBACK ***
// `new Animator(bones, clips)` with no options is byte-for-byte the v3.2
// player: linear lerp between keys, `ease` resolution order below, Euler
// crossfade over FADE seconds, no layers, no springs, no IK. Ten character
// files author against that and none of them has to change. Everything new is
// behind `opts` (the owner opts in — see Fighter.js, which does) or behind a
// per-clip flag (the clip opts in). `interp:'linear'` on a clip forces the
// legacy path back on even when the owner asked for 'auto'.
//
// Easing — a key may carry ease:'linear'|'smooth'|'in'|'out'|'overshoot'; the
// ease on a key shapes the segment ARRIVING at that key. Resolution order:
//   1. key.ease (always honored, on any clip),
//   2. clip.ease === true → 'smooth' when the gap to the previous key > 0.15s
//      (idle/walk-grade motion), else 'linear' (snappy attack-grade timing),
//   3. otherwise 'linear'.
//
// ---------------------------------------------------------------------------
// WHAT 'auto' INTERPOLATION ADDS (and why it cannot change gameplay)
// ---------------------------------------------------------------------------
// 1. AUTO-CLAMPED, TIME-CORRECT Catmull-Rom through the keys on any segment
//    longer than SMART_MIN_GAP. A cardinal spline passes EXACTLY through every
//    key, so the pose at every keyframe time is unchanged to the last bit —
//    only the in-between shape moves, from a polyline to an arc. Three
//    properties make that safe to drop onto ten files of hand-tuned poses:
//      * tangents are zeroed at a local extremum, so the curve eases into an
//        authored pose instead of sailing past it (Maya's auto-clamped tangent);
//      * a hold (identical consecutive keys) stays dead flat — crypto-punkd's
//        entire snap-and-hold identity depends on this;
//      * tangents are finite differences in value-per-SECOND rescaled to the
//        segment, so uneven key spacing (0, 0.08, 0.34 — every reaction clip
//        here) does not kick on the short leg.
//    Short segments (< 0.12 s: the attack startup/active/recovery beats) stay
//    linear, so snap is preserved. Non-looping clips get flat tangents at their
//    ends: they ease out of rest and settle into their final pose.
// 2. Anticipation / overshoot / settle shaping on NON-LOOPING clips whose key
//    gap exceeds AUTO_EASE_GAP. A pose dips slightly against its direction of
//    travel, overshoots on arrival and settles back. Authorable per key with
//    `antic` / `over`; the automatic default exists so the existing roster gets
//    weight without being rewritten. Both lobes vanish at f=0 and f=1, so, once
//    more, keyframe poses are exact.
// 3. Quaternion slerp for the transition CROSSFADE. Euler-lerping from an idle
//    pose to a launched pose across ±2 rad takes the wrong path and gimbals;
//    slerp does not. Clip playback still interpolates Eulers unless the clip
//    sets `slerp:true`.
//
// Frame data, hitboxes, hurtboxes and move timing are NOT derived from bone
// transforms anywhere in this codebase (MatchScreen uses distance + facing cone
// + height span), so none of the above can move a hitbox.
//
// ---------------------------------------------------------------------------
// LAYERS, SPRINGS, IK — all off unless the owner enables them
// ---------------------------------------------------------------------------
//   layers   additive Euler deltas over the sampled pose, per-bone masked:
//            'breathe' (procedural), 'lookAt' (head/eyes track a world point),
//            'flinch' (impulse-driven, plays OVER whatever the body is doing),
//            'limp'   (procedural damage limp, weight from health),
//            'sway'   (v3.4 — the idle weight shift: a slow lateral hip
//                      transfer with a vertical drop, counter-twisted through
//                      the spine. The IK plant turns the hip drop into KNEE
//                      BEND for free, which is the thing an idle needs and no
//                      character file authors),
//            'torque' (v3.4 — THE ATTACKER'S BODY. A jab is not an arm; it is
//                      hips, then spine, then shoulder. Driven by an
//                      underdamped spring against a three-step target
//                      (coil -> drive -> settle) so anticipation, overshoot
//                      and settle come out of the solver rather than out of
//                      ten character files. See attackDrive()).
//   springs  velocity-driven follow-through for ears/trunks/tails/jowls/
//            bellies/cloth, discovered by NAME so no character file changes.
//   ik       two-bone foot planting against a ground provider.
//
// PERFORMANCE. This runs for two fighters at 60 Hz. Everything below is
// index-addressed over flat Float64Arrays built once at construction; the
// update path allocates NOTHING. Module-scoped scratch objects only.
// ============================================================================
import * as THREE from 'three'

const FADE = 0.08
const AUTO_EASE_GAP = 0.15
// Segments shorter than this keep the legacy straight line even in 'auto'.
// 0.12 s = 7 frames: below that a spline is invisible and the snap is the point.
const SMART_MIN_GAP = 0.12
// Default shaping amounts for the automatic weight profile (see shaped()).
const AUTO_ANTIC = 0.09
const AUTO_OVER = 0.13

const EASE = {
  linear: (f) => f,
  smooth: (f) => f * f * (3 - 2 * f),
  in: (f) => f * f,
  out: (f) => 1 - (1 - f) * (1 - f),
  overshoot: (f) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    const g = f - 1
    return 1 + c3 * g * g * g + c1 * g * g
  },
  // --- v3.3 additions. Unknown names previously fell through to linear, so no
  // existing clip can be affected by new entries appearing here.
  smoother: (f) => f * f * f * (f * (f * 6 - 15) + 10),
  // back-in: dips BELOW the start value before travelling (the wind-up)
  anticipate: (f) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * f * f * f - c1 * f * f },
  // damped-spring arrival: overshoots once, rings down, pinned to exactly 1
  settle: (f) => {
    if (f <= 0) return 0
    if (f >= 1) return 1
    const v = 1 - Math.exp(-5.5 * f) * Math.cos(7 * f)
    return v + (1 - v) * f * f * f * f
  },
  elastic: (f) => {
    if (f <= 0) return 0
    if (f >= 1) return 1
    const p = 0.34
    return Math.pow(2, -9 * f) * Math.sin((f - p / 4) * (2 * Math.PI) / p) + 1
  },
  bounce: (f) => {
    const n = 7.5625, d = 2.75
    if (f < 1 / d) return n * f * f
    if (f < 2 / d) { const g = f - 1.5 / d; return n * g * g + 0.75 }
    if (f < 2.5 / d) { const g = f - 2.25 / d; return n * g * g + 0.9375 }
    const g = f - 2.625 / d
    return n * g * g + 0.984375
  },
  hold: (f) => (f >= 1 ? 1 : 0),
}

function lerp(a, b, f) { return a + (b - a) * f }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

/**
 * Anticipation / overshoot shaping.
 *
 * Both lobes are cubic bumps that are exactly zero at f = 0 and f = 1, so the
 * keyframe poses never move:
 *   antic lobe  −antic · 6.75 · f(1−f)³   peaks −antic at f = 0.25
 *   over  lobe  +over  · 6.75 · f³(1−f)   peaks +over  at f = 0.75
 * The first drags the pose BACKWARD out of the previous key (the wind-up); the
 * second carries it PAST the target and lets it fall back in (the settle).
 */
function shaped(f, antic, over) {
  let v = f * f * (3 - 2 * f)
  if (antic > 0) { const g = 1 - f; v -= antic * 6.75 * f * g * g * g }
  if (over > 0) { const g = 1 - f; v += over * 6.75 * f * f * f * g }
  return v
}

/**
 * AUTO-CLAMPED Catmull-Rom (cardinal, tension t) through p1→p2 with neighbours
 * p0, p3. Passes exactly through p1 and p2. Two guards, and they are not
 * optional — plain Catmull-Rom is wrong for hand-keyed game animation:
 *
 *   HOLD GUARD. p1 === p2 means the animator authored a hold. Plain
 *   Catmull-Rom bulges through it because the tangents come from the
 *   NEIGHBOURS, so a deliberate freeze grows a wobble. Every character here
 *   holds poses (crypto-punkd's whole identity is snap-and-hold); a hold stays
 *   dead flat.
 *
 *   EXTREMUM GUARD. If p1 is a local peak — (p1−p0) and (p2−p1) disagree in
 *   sign — its tangent is zeroed, so the curve eases into the pose instead of
 *   sailing past it. This is what Maya calls an auto-clamped tangent, and it is
 *   why a spline can be dropped onto tuned poses without changing any of them:
 *   the curve now never leaves the authored value range. Wind-up and overshoot
 *   come from shaped() instead, where they are bounded and per-key authorable.
 */
function tangentAt(prev, cur, next, h, dtSpan, tension) {
  const d1 = cur - prev, d2 = next - cur
  // Zero covers BOTH guards at once: a local extremum (signs disagree) and a
  // hold (one side is flat) both come out as d1*d2 <= 0.
  if (d1 * d2 <= 0) return 0
  if (!(dtSpan > 1e-6)) return 0
  // Finite-difference slope in value-per-second, rescaled into this segment's
  // 0..1 parameter. Uniform key spacing reduces to plain Catmull-Rom; uneven
  // spacing (0, 0.08, 0.34 — the shape of every reaction clip here) does NOT,
  // and treating it as uniform is what makes a spline kick on the short leg.
  return (1 - tension) * h * (next - prev) / dtSpan
}

function hermite(p1, p2, m1, m2, f) {
  const f2 = f * f
  const f3 = f2 * f
  return (2 * f3 - 3 * f2 + 1) * p1 + (f3 - 2 * f2 + f) * m1 +
         (-2 * f3 + 3 * f2) * p2 + (f3 - f2) * m2
}

/** One component of the spline. Missing neighbour -> flat tangent that end. */
function spline1(p0, p1, p2, p3, hasP, hasQ, h, dt02, dt13, f, tension) {
  if (p1 === p2) return p1
  const m1 = hasP ? tangentAt(p0, p1, p2, h, dt02, tension) : 0
  const m2 = hasQ ? tangentAt(p1, p2, p3, h, dt13, tension) : 0
  return hermite(p1, p2, m1, m2, f)
}

// --------------------------------------------------------------- scratch ---
// Module-scoped. The update path must never allocate.
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _qc = new THREE.Quaternion()
const _ea = new THREE.Euler()
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _box = new THREE.Box3()
const _tq = [0, 0, 0]        // torqueShare() out-param, module-scoped on purpose

// --- foot IK tuning ---------------------------------------------------------
// A foot counts as planted while its ankle sits within this band of the bind
// sole height, and stays planted until it clears the RELEASE band — hysteresis,
// because a bare threshold makes a foot whose swing peaks near the line chatter
// in and out of contact every other frame.
const IK_PLANT_BAND = 0.045
const IK_RELEASE_BAND = 0.075
// SUPPORT RULE (v3.5). A band alone is not enough, because it assumes the clip
// puts a foot AT the bind sole and no clip in the roster does. Measured on a
// walking dogey: the lower ankle bottoms out 0.050 m above bind sole and the
// other at 0.066 m — five millimetres outside the plant band — so after the
// first stride NOTHING ever planted again for the whole cycle (both chains
// planted:0, lockW:0, forever; the filed defect). A walk always has a support
// foot, so when neither chain is in contact the LOWEST one claims support
// anyway, provided it is inside this wider band and is settling rather than
// swinging up. The plant then beds it down onto the floor (see IK_PLANT_RATE).
const IK_SUPPORT_BAND = 0.11
// Metres of ankle rise per frame still counted as "settling". A swing foot
// climbs an order of magnitude faster than this, so it can never claim support.
const IK_SUPPORT_RISE = 0.0015
// A RIG WITH NO KNEES GETS A SHALLOWER PELVIS SINK (v3.7, and it is the one
// behavioural change this round). The sway layer drops the pelvis 8-25 mm so
// the IK plant converts the drop into KNEE BEND — measured over a 4 s idle,
// that is worth 0.38-0.77 rad of leg swing on the six two-bone fighters. The
// four one-bone fighters (WALLY, tired-ape, fatty-pingo, cool-pal) have no
// knee to convert it with and measure 0.04-0.06 rad, so on those rigs every
// millimetre of sink is pure floor penetration for no visible return.
// Measured over a 4 s idle with the sway phase pinned so the two runs are
// comparable, lowest world MESH vertex against the floor:
//   tired-ape  -0.0455 -> -0.0302    fatty-pingo -0.0463 -> -0.0312
//   cool-pal   -0.0580 -> -0.0428    wally        0.0000 ->  0.0000
// and every two-bone fighter is bit-identical across the change, because their
// scale never leaves 1. Zero was also swept and is not better — the last 30 mm
// is the clip's own pose, not the layer, so it does not move — and it throws
// away the vertical component of the weight shift entirely. 0.35 keeps 3-9 mm
// of sink, which still reads, and takes a quarter to a third off the
// penetration. Two-bone rigs are untouched: their scale stays exactly 1.
const SINK_NO_KNEE = 0.35
// The knee never locks dead straight. This matters far more than it looks:
// dr/dβ → 0 at full extension, so a "safe" 15 mm reach clamp costs 21° of knee
// bend on a 0.45 + 0.45 leg and the foot never reaches the floor at all.
// Deriving the reach limit FROM the bend limit keeps the shortfall sub-millimetre.
const IK_MIN_KNEE = 0.06
const IK_MAX_KNEE = 2.7
// How far a planted foot may be bedded DOWN onto the floor, and how fast it
// gets there. v3.4 clamped the TARGET at ankle − 0.035 m every frame, which
// reads like a rate limit and is not one: the ankle height is re-read off the
// clip each frame, so the correction never accumulated and a foot the clip
// parked 0.05 m up stayed 0.035 m up forever. The pull is now cumulative state
// per chain, ramped at a metres-per-second rate and released the same way.
const IK_PLANT_RATE = 2.1        // m/s — 0.035 m per frame at 60 Hz, as before
const IK_MAX_PULL = 0.09         // ceiling, so a badly posed clip is not yanked
// Stance lock: full authority inside HOLD, faded to nothing by MAX_DRAG, then
// the latch is re-seated. Bigger than a stride and the leg would tear.
const IK_LOCK_HOLD = 0.14
const IK_MAX_DRAG = 0.40
// Hard ceiling on a single joint correction. A NaN target or a broken rig can
// then only ever be ugly for one frame, never catastrophic.
const IK_MAX_CORRECT = 0.85
// Same ceiling for a one-bone leg, tighter: with no knee to absorb it, the
// whole correction lands on the hip and reads immediately.
const IK_ONE_BONE_MAX = 0.30

function wrapPi(a) {
  const t = Math.PI * 2
  return ((a + Math.PI) % t + t) % t - Math.PI
}

// Blend two Euler triples the way a quaternion would, writing Euler back out.
// Used for crossfades (large-angle, where Euler lerp gimbals) — never for the
// legacy clip path.
function slerpEuler(ax, ay, az, bx, by, bz, f, out) {
  _ea.set(ax, ay, az); _qa.setFromEuler(_ea)
  _ea.set(bx, by, bz); _qb.setFromEuler(_ea)
  if (_qa.dot(_qb) < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w }
  _qa.slerp(_qb, f)
  _ea.setFromQuaternion(_qa)
  out[0] = _ea.x; out[1] = _ea.y; out[2] = _ea.z
}

// ============================================================================
// TRACK SAMPLING
// ============================================================================

// Which bones in a clip carry scl keys (cached on the clip object).
function clipSclBones(clip) {
  if (!clip || !clip.tracks) return null
  if (clip._sclBones === undefined) {
    let found = null
    for (const [name, track] of Object.entries(clip.tracks)) {
      for (const k of track) {
        if (k.scl) { (found || (found = [])).push(name); break }
      }
    }
    clip._sclBones = found
  }
  return clip._sclBones
}

/**
 * LEGACY sampler — v3.2 verbatim. Do not "improve" this function; it is the
 * bit-identity guarantee. Fills rot/pos/scl arrays, returns a bitmask:
 * 1 = pos was written, 2 = scl was written.
 */
function sampleLegacy(track, t, rest, autoEase, outRot, outPos, outScl) {
  let i = 0
  while (i < track.length - 1 && track[i + 1].t <= t) i++
  const a = track[i]
  const b = track[Math.min(i + 1, track.length - 1)]
  const span = b.t - a.t
  let f = span > 1e-6 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0
  const easeName = b.ease || (autoEase && span > AUTO_EASE_GAP ? 'smooth' : 'linear')
  const easeFn = EASE[easeName]
  if (easeFn && easeName !== 'linear') f = easeFn(f)
  const ar = a.rot || rest.rot
  const br = b.rot || ar
  outRot[0] = lerp(ar[0], br[0], f)
  outRot[1] = lerp(ar[1], br[1], f)
  outRot[2] = lerp(ar[2], br[2], f)
  let flags = 0
  const ap = a.pos
  const bp = b.pos
  if (ap || bp) {
    const p0 = ap || rest.pos
    const p1 = bp || ap || rest.pos
    outPos[0] = lerp(p0[0], p1[0], f)
    outPos[1] = lerp(p0[1], p1[1], f)
    outPos[2] = lerp(p0[2], p1[2], f)
    flags |= 1
  }
  const as = a.scl
  const bs = b.scl
  if (as || bs) {
    const s0 = as || rest.scl
    const s1 = bs || as || rest.scl
    outScl[0] = lerp(s0[0], s1[0], f)
    outScl[1] = lerp(s0[1], s1[1], f)
    outScl[2] = lerp(s0[2], s1[2], f)
    flags |= 2
  }
  return flags
}

// Pull component `c` out of a key's `rot`/`pos`/`scl` array with rest fallback.
function comp(key, field, c, restArr, fallback) {
  const a = key && key[field]
  if (a) return a[c]
  if (fallback) return fallback[c]
  return restArr[c]
}

/**
 * SMART sampler — Catmull-Rom + weight shaping. Same signature and the same
 * return bitmask as sampleLegacy, so the caller does not branch on shape.
 */
function sampleSmart(track, t, rest, clip, outRot, outPos, outScl) {
  const n = track.length
  let i = 0
  while (i < n - 1 && track[i + 1].t <= t) i++
  const a = track[i]
  const b = track[Math.min(i + 1, n - 1)]
  const span = b.t - a.t
  const loop = !!clip.loop
  let raw = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 0

  // 1. explicit per-key ease always wins and short segments stay linear
  const explicit = b.ease
  const spline = !explicit && span >= SMART_MIN_GAP
  let f = raw
  if (explicit) {
    const fn = EASE[explicit]
    if (fn && explicit !== 'linear') f = fn(raw)
  } else if (!spline) {
    // sub-0.12 s beats: legacy behaviour exactly (clip.ease can still smooth)
    if (clip.ease === true && span > AUTO_EASE_GAP) f = EASE.smooth(raw)
  } else {
    // 2. weight profile: wind-up + overshoot + settle. Loops already read
    //    organically through the spline; shaping every cycle of a walk would
    //    make it wobble, so the automatic default is non-looping clips only.
    const antic = Number.isFinite(b.antic) ? b.antic
      : (!loop && clip.weight !== false && span > AUTO_EASE_GAP ? AUTO_ANTIC : 0)
    const over = Number.isFinite(b.over) ? b.over
      : (!loop && clip.weight !== false && span > AUTO_EASE_GAP ? AUTO_OVER : 0)
    f = (antic > 0 || over > 0) ? shaped(raw, antic, over) : raw
  }

  const tension = Number.isFinite(b.tension) ? b.tension : 0
  const ar = a.rot || rest.rot
  const br = b.rot || ar

  // Neighbour keys and their EFFECTIVE times. A looping clip wraps (its first
  // and last keys hold the same pose, so the wrap skips one to avoid a
  // zero-length tangent leg) and carries the duration offset so the tangent
  // scaling stays right across the seam. A non-looping clip simply has no
  // neighbour at its ends, which gives it flat tangents there — the clip eases
  // out of rest and settles into its final pose instead of starting and
  // stopping at full speed.
  const j = Math.min(i + 1, n - 1)
  const dur = clip.duration || track[n - 1].t || 1
  let kp = null, kpT = 0, kq = null, kqT = 0
  if (i > 0) { kp = track[i - 1]; kpT = kp.t }
  else if (loop && n >= 3) { kp = track[n - 2]; kpT = kp.t - dur }
  if (j + 1 <= n - 1) { kq = track[j + 1]; kqT = kq.t }
  else if (loop && n >= 3) { kq = track[1]; kqT = kq.t + dur }
  const dt02 = kp ? (b.t - kpT) : 0
  const dt13 = kq ? (kqT - a.t) : 0

  if (spline) {
    for (let c = 0; c < 3; c++) {
      outRot[c] = spline1(comp(kp, 'rot', c, rest.rot, ar), ar[c], br[c],
        comp(kq, 'rot', c, rest.rot, br), !!kp, !!kq, span, dt02, dt13, f, tension)
    }
  } else if (clip.slerp === true) {
    slerpEuler(ar[0], ar[1], ar[2], br[0], br[1], br[2], f, outRot)
  } else {
    outRot[0] = lerp(ar[0], br[0], f)
    outRot[1] = lerp(ar[1], br[1], f)
    outRot[2] = lerp(ar[2], br[2], f)
  }

  let flags = 0
  if (a.pos || b.pos) {
    const p0 = a.pos || rest.pos
    const p1 = b.pos || a.pos || rest.pos
    if (spline) {
      for (let c = 0; c < 3; c++) {
        outPos[c] = spline1(comp(kp, 'pos', c, rest.pos, p0), p0[c], p1[c],
          comp(kq, 'pos', c, rest.pos, p1), !!kp, !!kq, span, dt02, dt13, f, tension)
      }
    } else {
      outPos[0] = lerp(p0[0], p1[0], f)
      outPos[1] = lerp(p0[1], p1[1], f)
      outPos[2] = lerp(p0[2], p1[2], f)
    }
    flags |= 1
  }
  if (a.scl || b.scl) {
    const s0 = a.scl || rest.scl
    const s1 = b.scl || a.scl || rest.scl
    outScl[0] = lerp(s0[0], s1[0], f)
    outScl[1] = lerp(s0[1], s1[1], f)
    outScl[2] = lerp(s0[2], s1[2], f)
    flags |= 2
  }
  return flags
}

// ============================================================================
// BONE CLASSIFICATION — everything below is discovered by NAME so the whole
// roster benefits without a single character file changing.
// ============================================================================

// The load-bearing skeleton. Never sprung; RagdollManager's CORE_BONES set uses
// the same names and the same intent (src/physics/RagdollManager.js §build).
const CORE_RE = /^(hips|pelvis|spine\d*|chest|torso\d*|neck\d*|head|arm[LR]|forearm[LR]|hand[LR]|thigh[LR]|leg[LR]|shin[LR]|calf[LR]|foot[LR]|toe[LR])$/

// Secondary-motion families. `k` stiffness, `c` damping, `gain` drive scale,
// `twist` Y-axis response, `max` |offset| clamp in radians, `jiggle` positional
// wobble in metres (soft flesh only — cloth and ears rotate, they do not slide).
const SPRING_FAMILY = [
  [/(^|[^a-z])ear/i, { k: 96, c: 11.5, gain: 0.95, twist: 0.55, max: 0.55, jiggle: 0 }],
  [/trunk|snout|proboscis/i, { k: 74, c: 10.0, gain: 0.85, twist: 0.35, max: 0.45, jiggle: 0 }],
  [/tail/i, { k: 62, c: 8.6, gain: 1.05, twist: 0.45, max: 0.60, jiggle: 0 }],
  [/jowl|cheek|wattle|chin|lip|dewlap/i, { k: 132, c: 13.5, gain: 0.55, twist: 0.20, max: 0.30, jiggle: 0.016 }],
  [/belly|gut|paunch|tummy|blubber/i, { k: 112, c: 12.0, gain: 0.50, twist: 0.15, max: 0.22, jiggle: 0.026 }],
  [/cloth|scarf|robe|cape|coat|sash|skirt|apron|hem|flap|shawl|towel|^tie$/i,
    { k: 56, c: 7.6, gain: 1.10, twist: 0.45, max: 0.55, jiggle: 0 }],
  [/hair|mane|fringe|braid|pony|dread|tassel|pom|bead|whisk|antenna|tongue|frill/i,
    { k: 82, c: 9.2, gain: 0.95, twist: 0.50, max: 0.50, jiggle: 0 }],
  [/pouch|satchel|pack|holster|canteen|flask|mug|bottle|purse/i,
    { k: 124, c: 14.0, gain: 0.42, twist: 0.14, max: 0.20, jiggle: 0 }],
]

// Share of the animator's swing authority that a bone handed to another solver
// keeps for the two things that solver demonstrably does not do: impact
// impulses, and idle life. See springImpulse() and _updateSprings().
const SPRING_EXCL_SHARE = 0.45

function springFamily(name) {
  if (CORE_RE.test(name)) return null
  for (let i = 0; i < SPRING_FAMILY.length; i++) {
    if (SPRING_FAMILY[i][0].test(name)) return SPRING_FAMILY[i][1]
  }
  return null
}

// Per-bone weights for the built-in additive layers. Missing = 0 = untouched.
function breatheWeight(n) {
  if (n === 'torso' || /^torso\d|^chest|^spine/.test(n)) return 1
  if (n === 'hips') return 0.22
  if (n === 'head' || /^neck/.test(n)) return 0.30
  if (n === 'armL' || n === 'armR') return 0.55
  if (/belly|gut|paunch|tummy/i.test(n)) return 1.1
  return 0
}
function limpWeight(n) {
  if (n === 'hips') return 1
  if (n === 'torso' || /^torso\d|^chest|^spine/.test(n)) return 0.8
  if (n === 'head' || /^neck/.test(n)) return 0.55
  if (n === 'legL' || n === 'shinL') return 0.7
  if (n === 'legR' || n === 'shinR') return 0.35
  if (n === 'armL' || n === 'armR') return 0.45
  return 0
}
function flinchWeight(n) {
  if (n === 'head') return 1
  if (/^neck/.test(n)) return 0.6
  if (n === 'torso' || /^torso\d|^chest|^spine/.test(n)) return 0.75
  if (n === 'hips') return 0.30
  if (n === 'armL' || n === 'armR') return 0.55
  if (n === 'forearmL' || n === 'forearmR') return 0.35
  if (springFamily(n)) return 0.65
  return 0
}
function lookWeight(n) {
  if (/^eye/i.test(n)) return 1.6      // eyes lead, head follows — always
  if (n === 'head') return 1
  if (/^neck/.test(n)) return 0.45
  if (n === 'torso') return 0.14
  return 0
}

// SWAY (idle weight shift). SIGNED: the pelvis leads, the spine and the head
// counter it, which is what stops a weight shift from reading as the whole
// character being pushed sideways. Magnitude is the mask; sign is the phase.
function swayWeight(n) {
  if (n === 'hips') return 1
  if (n === 'torso' || /^torso\d|^chest|^spine/.test(n)) return -0.52
  if (/^neck/.test(n)) return -0.20
  if (n === 'head') return -0.30
  if (n === 'armL' || n === 'armR') return 0.48
  if (n === 'forearmL' || n === 'forearmR') return 0.26
  if (n === 'legL' || n === 'legR') return 0.34
  if (n === 'shinL' || n === 'shinR') return 0.16
  return 0
}

/**
 * ATTACK TORQUE distribution, written into `out` as [roll x, yaw y, lean z].
 *
 * These are SHARES of one driven angle, not independent channels: hips 0.52 +
 * torso 0.62 means the shoulder line ends up turned by 1.14x the driven angle
 * while the pelvis only turns by half of it, which is the kinetic chain. The
 * head takes a NEGATIVE share so it stays pointed at the opponent while the
 * body rotates under it — the single most legible cue that a punch has a body
 * behind it. Legs take a negative share because the feet are planted (the IK
 * latch makes that literally true) and the hips twist over them.
 */
function torqueShare(n, out) {
  out[0] = 0; out[1] = 0; out[2] = 0
  if (n === 'hips') { out[0] = 0.10; out[1] = 0.52; out[2] = 0.26; return }
  if (n === 'torso' || /^torso\d|^chest|^spine/.test(n)) { out[0] = 0.13; out[1] = 0.62; out[2] = 0.30; return }
  // Head and neck counter hard: hips 0.52 + torso 0.62 turns the shoulder line
  // through 1.14x, and subtracting 0.72 leaves the skull turning through only
  // 0.42x. The eyes stay on the opponent while the chest rotates under them,
  // which is the read that tells you a punch has a body behind it.
  if (/^neck/.test(n)) { out[1] = -0.22; out[2] = 0.10; return }
  if (n === 'head') { out[1] = -0.50; out[2] = 0.13; return }
  if (n === 'armL' || n === 'armR') { out[1] = 0.22; out[2] = 0.10; return }
  if (n === 'forearmL' || n === 'forearmR') { out[1] = 0.10; return }
  if (n === 'legL' || n === 'legR') { out[1] = -0.30; out[2] = 0.06; return }
  if (n === 'shinL' || n === 'shinR') { out[1] = -0.12; return }
  if (springFamily(n)) { out[1] = 0.30; out[2] = 0.18 }
}

// Per-kind torque profile: [anticipation, drive] in radians of DRIVEN ANGLE
// (the shoulder line sees ~1.14x of it, see torqueShare). A light jab barely
// coils; a heavy loads the whole pelvis against the direction of travel first.
const TORQUE_KIND = {
  light: [0.050, 0.140],
  kick: [0.092, 0.235],
  heavy: [0.128, 0.300],
  launcher: [0.120, 0.285],
  special: [0.110, 0.270],
  super: [0.138, 0.325],
  grab: [0.064, 0.155],
  joke: [0.055, 0.135],
}
const TORQUE_DEFAULT = [0.082, 0.208]
// Forward weight transfer, metres of hip travel per radian of driven angle.
const TORQUE_SHIFT = 0.105
// Ring-down damping ratio. Under 1 on purpose: the overshoot IS the deliverable.
// 0.45 gives a ~20% overshoot past the driven pose and settles in three
// oscillations — the classic pose-overshoot-settle of a hand-keyed heavy.
const TORQUE_ZETA = 0.45

/**
 * WHICH WAY THE BODY TWISTS — the sign that maximises the projection of the
 * torque layer ONTO the clip's own authored yaw.
 *
 * HISTORY, because two wrong answers shipped before this one.
 *
 * v3.4 used clipLeadSide(): it summed limb excursion, decided "armR moved more,
 * therefore right-handed", and multiplied by _armAxis. Measurably wrong — the
 * A/B on wally elephantElbow had the layer ADDING +0.036 rad through the
 * wind-up and SUBTRACTING 0.151 rad at the drive peak, 20 of 24 significant
 * frames FIGHTING the clip. "Which arm swings" simply does not determine "which
 * way the pelvis turns": across the 159 attack clips, 44 have both a resolvable
 * lead limb and an authored body yaw and the two agree on only 14. A coin flip
 * with a bias is the worst possible signal to build a body on.
 *
 * v3.5 read the sign off the clip instead — the mask-weighted TIME AVERAGE of
 * the authored yaw over the whole clip. Better (74.4% of significant frames
 * reinforcing, roster-wide), but still not the right quantity, and it is easy to
 * see why: the layer is not a constant. It holds −antic through the coil and
 * +amp through the drive, so a clip whose coil is long and whose drive is short
 * gets scored on the wrong lobe. The average also throws away the one piece of
 * information that decides the question — WHEN each part of the authored motion
 * happens relative to the beat the layer is playing.
 *
 * v3.6 correlates instead. The layer's contribution to a bone's yaw is
 *
 *     layer(t) = side · maskY(bone) · driveTarget(t)
 *
 * and the authored motion on that bone is auth(t). The single sign that
 * maximises Σ_bones ∫ layer·auth — i.e. the least-squares-optimal one, the
 * literal answer to "reinforce, do not fight" — is
 *
 *     side = sign( Σ_bones maskY(bone) · ∫ auth(t) · driveTarget(t) dt )
 *
 * driveTarget is the SAME three-step profile the spring chases (see
 * attackDrive / _updateLayers), mapped onto the clip through this move's own
 * frame data, so the coil counts as evidence with a NEGATIVE weight. A clip that
 * coils the pelvis one way and drives it the other now scores POSITIVELY on both
 * lobes, which is exactly right and is precisely what the mean could not do.
 *
 * ONE CORRECTION TO THE PURE INNER PRODUCT, AND IT IS LOAD-BEARING. auth(t) is
 * SATURATED at TWIST_SAT before the dot product. A raw inner product is
 * dominated by whichever handful of frames carries the largest excursion, and
 * this roster contains spin attacks whose hips travel a full 2*pi: those frames
 * outvote the entire rest of the clip. Measured — raw correlation fixed
 * fatty-pingo coldWallet (0/17 -> 17/0) and crypto-punkd glitchDodge (8/12 ->
 * 12/8) but BROKE blackish-bull heavyHook (18/5 -> 5/18) for exactly that
 * reason. Saturating turns the score into a time-weighted VOTE over the frames
 * where the body is clearly turning, which is both the quantity the agreement
 * count measures and the honest model of the thing: past ~7 degrees the body is
 * unambiguously turned, and twice as far is not twice as much evidence.
 *
 * Measured over all 159 attack clips, agreement counted per frame on hips yaw
 * against the same clip with the layer off:
 *      v3.4 lead-limb        (roster never measured; wally elephantElbow 4/20)
 *      v3.5 clip mean        1306 pro / 181 anti,  2 anti-majority moves
 *      v3.6 raw correlation  1314 pro / 173 anti,  1 anti-majority move
 *      v3.6 SATURATED        1304 pro / 150 anti,  0 anti-majority moves
 * Not one move in the roster now gets a body that fights it on balance, and
 * the per-move worst case went from 0/17 to 6/6. It needs no convention, no
 * _armAxis and no character file to author anything, and it handles the
 * counter-rotating bones for free because the head/neck shares are NEGATIVE in
 * torqueShare — a clip that turns the skull left is telling us the chest is
 * going right.
 *
 * BELOW THRESHOLD IT RETURNS 0, ON PURPOSE. 85 of the 159 clips author no body
 * yaw at all on any bone the layer writes. Those get the fore/aft lean and the
 * forward weight shift (both sign-free) and NO twist, instead of a
 * likely-wrong one. A missing body turn is invisible; a body turning the wrong
 * way into its own punch is the defect that was filed.
 *
 * The per-clip part (the sampled authored yaw) is cached on the clip; only the
 * dot product against the profile is recomputed, once per move, over 33 samples.
 */
// Authored yaw is clamped to +-TWIST_SAT before it is correlated (see above).
// 0.12 rad is 6.9 deg: comfortably past "the body is visibly turned", well
// under any real drive peak, and it is a plateau in the sweep — 0.08 through
// 0.25 all give 0 anti-majority moves and within 1% of the same net agreement.
const TWIST_SAT = 0.12
// Threshold on the saturated, L1-normalised score: 5% of full saturation, i.e.
// the pelvis holds a clear turn across about a twentieth of the drive profile.
// Swept against the roster: this is the widest threshold that still leaves zero
// anti-majority moves, and it keeps the number of no-twist clips (86) where the
// v3.5 mean had it (85), so the fix costs no coverage.
const MIN_TWIST = 0.006
// Samples across the clip. 32 intervals resolves a 3-frame beat inside the
// longest clip in the roster (Tokenization Tornado, 96 frames) to better than
// one beat, and the whole thing runs once per move.
const TWIST_SAMPLES = 32

/**
 * Mask-weighted authored yaw of `clip`, sampled uniformly over its duration and
 * measured relative to the pose the clip STARTS in. Two curves: `all` is the
 * torqueShare-weighted sum over every bone the layer writes yaw into, `hips` is
 * the pelvis on its own (it gets the casting vote below). Cached on the clip.
 */
function twistProfile(clip) {
  if (!clip || !clip.tracks) return null
  if (clip._twistProf !== undefined) return clip._twistProf
  const N = TWIST_SAMPLES
  const all = new Float64Array(N + 1)
  const hips = new Float64Array(N + 1)
  let any = false
  for (const nm of Object.keys(clip.tracks)) {
    // Secondary-motion bones (ears, tails, cloth) follow the body, they do not
    // decide it — and they are authored in mirrored pairs that would cancel to
    // noise anyway. torqueShare gives them a share; the sign vote does not.
    if (springFamily(nm)) continue
    torqueShare(nm, _tq)
    const my = _tq[1]
    if (my === 0) continue
    const tr = clip.tracks[nm]
    if (!tr || tr.length < 2) continue
    // Resolve every key's yaw once, holding the previous value through keys
    // that carry no rot — exactly what the samplers do.
    const vals = new Float64Array(tr.length)
    let hold = tr[0].rot ? tr[0].rot[1] : 0
    for (let i = 0; i < tr.length; i++) { if (tr[i].rot) hold = tr[i].rot[1]; vals[i] = hold }
    const last = tr[tr.length - 1].t || 0
    const dur = clip.duration > 1e-4 ? clip.duration : last
    if (!(dur > 1e-4)) continue
    const base = vals[0]
    let seg = 0
    for (let s = 0; s <= N; s++) {
      const t = dur * s / N
      while (seg < tr.length - 2 && (tr[seg + 1].t || 0) <= t) seg++
      const ta = tr[seg].t || 0, tb = tr[seg + 1].t || 0
      const sp = tb - ta
      // Past the last key the pose holds, which is what f clamped to 1 gives.
      const f = sp > 1e-6 ? clamp((t - ta) / sp, 0, 1) : (t >= tb ? 1 : 0)
      const v = vals[seg] + (vals[seg + 1] - vals[seg]) * f - base
      all[s] += my * v
      if (nm === 'hips') hips[s] += v
    }
    any = true
  }
  clip._twistProf = any ? { all, hips } : null
  return clip._twistProf
}

/**
 * @param {Object} clip
 * @param {number} uCoil  normalised clip time the coil target ends at
 * @param {number} uDrive normalised clip time the drive target ends at
 * @param {number} antic  coil target, radians (positive magnitude)
 * @param {number} amp    drive target, radians
 */
function clipTwistSign(clip, uCoil, uDrive, antic, amp) {
  const P = twistProfile(clip)
  if (!P) return 0
  const N = TWIST_SAMPLES
  let sAll = 0, sHips = 0, norm = 0
  for (let s = 0; s <= N; s++) {
    const u = s / N
    // The spring's own target, verbatim from _updateLayers.
    const w = u < uCoil ? -antic : (u < uDrive ? amp : amp * 0.16)
    const tw = (s === 0 || s === N) ? 0.5 : 1        // trapezoid end weights
    sAll += tw * w * clamp(P.all[s], -TWIST_SAT, TWIST_SAT)
    sHips += tw * w * clamp(P.hips[s], -TWIST_SAT, TWIST_SAT)
    norm += tw * (w < 0 ? -w : w)
  }
  if (!(norm > 1e-9)) return 0
  sAll /= norm
  // THE PELVIS HAS THE CASTING VOTE. A few clips counter-rotate hips against
  // chest (blackish-bull's horn-jab authors hips +0.15 and torso −0.20), and
  // there the mask-weighted sum lets the bigger chest number overrule the
  // pelvis. No single sign can reinforce both, and the pelvis is the base of
  // the kinetic chain the whole layer is modelling, so it wins outright
  // whenever it has an opinion of its own.
  const hipsVote = sHips * 0.52 / norm
  const decisive = Math.abs(hipsVote) >= MIN_TWIST ? hipsVote : sAll
  return Math.abs(decisive) >= MIN_TWIST ? (decisive > 0 ? 1 : -1) : 0
}

// ============================================================================
// Animator
// ============================================================================

export class Animator {
  /**
   * @param {Object<string,THREE.Object3D>} bones
   * @param {Object} clips
   * @param {Object} [opts]
   *   interp     'legacy' (default, bit-identical) | 'auto'
   *   secondary  false (default) | true — spring follow-through
   *   layers     false (default) | true — breathe / lookAt / flinch / limp
   *   ik         false (default) | true — two-bone foot planting
   */
  constructor(bones, clips, opts = {}) {
    this.bones = {}
    for (const [name, b] of Object.entries(bones || {})) if (b) this.bones[name] = b
    this.clips = clips || {}

    // ---- flat, index-addressed bone table (no Object.entries in update) ----
    const names = Object.keys(this.bones)
    const n = names.length
    this.names = names
    this.list = new Array(n)
    this.rest = {}                       // legacy public shape: name -> {rot,pos,scl}
    this._restR = new Float64Array(n * 3)
    this._restP = new Float64Array(n * 3)
    this._restS = new Float64Array(n * 3)
    this._poseR = new Float64Array(n * 3)
    this._poseP = new Float64Array(n * 3)
    this._poseS = new Float64Array(n * 3)
    this._fadeR = new Float64Array(n * 3)
    this._fadeP = new Float64Array(n * 3)
    this._fadeS = new Float64Array(n * 3)
    this._addR = new Float64Array(n * 3)  // additive layer euler deltas
    this._addP = new Float64Array(n * 3)  // additive layer position deltas
    this._sclFlag = new Uint8Array(n)     // bones this animator may write .scale on
    this._index = new Map()
    for (let i = 0; i < n; i++) {
      const b = this.bones[names[i]]
      this.list[i] = b
      this._index.set(names[i], i)
      const o = i * 3
      this._restR[o] = b.rotation.x; this._restR[o + 1] = b.rotation.y; this._restR[o + 2] = b.rotation.z
      this._restP[o] = b.position.x; this._restP[o + 1] = b.position.y; this._restP[o + 2] = b.position.z
      this._restS[o] = b.scale.x; this._restS[o + 1] = b.scale.y; this._restS[o + 2] = b.scale.z
      this.rest[names[i]] = {
        rot: [this._restR[o], this._restR[o + 1], this._restR[o + 2]],
        pos: [this._restP[o], this._restP[o + 1], this._restP[o + 2]],
        scl: [this._restS[o], this._restS[o + 1], this._restS[o + 2]],
      }
    }

    this.clip = null
    this.clipName = ''
    this.time = 0
    this.speed = 1
    this.fading = false
    this.fadeTime = 0
    this.fadeDur = FADE
    this._sclBones = null                 // legacy public field (Set of names)
    this._trackCache = new Map()          // clip -> Array(n) of track|null
    this._rot = [0, 0, 0]
    this._pos = [0, 0, 0]
    this._scl = [1, 1, 1]

    // ---- opt-in systems ----
    this.interp = opts.interp === 'auto' ? 'auto' : 'legacy'
    this.layersOn = !!opts.layers
    this.secondaryOn = !!opts.secondary
    this.ikOn = !!opts.ik
    this._initLayers(n)
    this._initSprings(n, opts)
    this._initIK(opts)

    // root motion accumulator (clips flagged `root:true`)
    this._rootMotion = { x: 0, y: 0, z: 0 }
    this._rootPrev = { x: 0, y: 0, z: 0, has: false }

    // body motion handed in by the owner (see setBodyMotion)
    this._bodyAX = 0; this._bodyAY = 0; this._bodyAZ = 0
    this._bodyVX = 0; this._bodyVY = 0; this._bodyVZ = 0
    this._yaw = 0
    this._groundDelta = 0
    this._grounded = true
  }

  // ------------------------------------------------------------- accessors

  has(name) { return !!this.clips[name] }

  /** Track array for `clip`, indexed by bone index. Built once per clip. */
  _tracksFor(clip) {
    if (!clip) return null
    let arr = this._trackCache.get(clip)
    if (arr) return arr
    arr = new Array(this.names.length).fill(null)
    const t = clip.tracks || {}
    for (let i = 0; i < this.names.length; i++) {
      const tr = t[this.names[i]]
      if (tr && tr.length) arr[i] = tr
    }
    this._trackCache.set(clip, arr)
    return arr
  }

  play(name, opts = {}) {
    const { restart = false, speed = 1, snap = false, fade } = opts
    if (name === this.clipName && !restart) { this.speed = speed; return }
    // snap: hard-cut, no crossfade. For handoffs where the current bone pose
    // is KNOWN-stale relative to a freshly teleported root (ragdoll recovery
    // across the arena) — crossfading from that snapshot would re-express it
    // flight-distance away for the fade frames (the model-desync tripwire).
    if (snap) {
      this.fading = false
    } else {
      this._snapshot()
      this.fading = true
      this.fadeDur = Number.isFinite(fade) && fade > 0 ? fade : FADE
    }
    this.fadeTime = 0
    this.clipName = name
    this.clip = this.clips[name] || null
    this.time = 0
    this.speed = speed
    this._rootPrev.has = false
    const scl = clipSclBones(this.clip)
    if (scl) {
      if (!this._sclBones) this._sclBones = new Set()
      for (const nm of scl) {
        if (!this.bones[nm]) continue
        this._sclBones.add(nm)
        const i = this._index.get(nm)
        if (i !== undefined) this._sclFlag[i] = 1
      }
    }
  }

  // Force clip time to fit `seconds` total (used to sync attack clips to frame data).
  playFitted(name, seconds) {
    const clip = this.clips[name]
    let speed = 1
    if (clip && clip.duration > 0 && seconds > 0) {
      speed = clip.duration / seconds
      speed = Math.min(4, Math.max(0.2, speed))
    }
    this.play(name, { restart: true, speed })
  }

  done() {
    if (!this.clip) return true
    return !this.clip.loop && this.time >= (this.clip.duration || 0)
  }

  /** Snapshot the CURRENT bone pose into the crossfade buffers. No allocation. */
  _snapshot() {
    const list = this.list
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      const o = i * 3
      this._fadeR[o] = b.rotation.x; this._fadeR[o + 1] = b.rotation.y; this._fadeR[o + 2] = b.rotation.z
      this._fadeP[o] = b.position.x; this._fadeP[o + 1] = b.position.y; this._fadeP[o + 2] = b.position.z
      this._fadeS[o] = b.scale.x; this._fadeS[o + 1] = b.scale.y; this._fadeS[o + 2] = b.scale.z
    }
  }

  _clipTime() {
    const clip = this.clip
    const d = clip.duration || 1
    if (clip.loop) return ((this.time % d) + d) % d
    return Math.min(this.time, d)
  }

  // ==========================================================================
  // ADDITIVE LAYERS
  //
  // A layer contributes an EULER DELTA (and, for breathing, a small position
  // delta) that is added on top of whatever the clip sampled, scaled by a
  // per-bone mask. That is the whole point: a flinch plays OVER a walk, a jab,
  // a block or a taunt without anyone authoring flinch-while-jabbing.
  // ==========================================================================

  _initLayers(n) {
    // Pelvis-sink authority. 1 on every rig with a knee; _initIK drops it to
    // SINK_NO_KNEE on a rig built entirely from one-bone legs. Set here so it
    // exists even when _initIK bails out early (no hips, no anchor, no chains).
    this._sinkScale = 1
    this._maskB = new Float32Array(n)
    this._maskL = new Float32Array(n)
    this._maskF = new Float32Array(n)
    this._maskK = new Float32Array(n)
    this._maskS = new Float32Array(n)
    this._maskTx = new Float32Array(n)
    this._maskTy = new Float32Array(n)
    this._maskTz = new Float32Array(n)
    let anyLook = false
    for (let i = 0; i < n; i++) {
      const nm = this.names[i]
      this._maskB[i] = breatheWeight(nm)
      this._maskL[i] = limpWeight(nm)
      this._maskF[i] = flinchWeight(nm)
      this._maskK[i] = lookWeight(nm)
      this._maskS[i] = swayWeight(nm)
      torqueShare(nm, _tq)
      this._maskTx[i] = _tq[0]; this._maskTy[i] = _tq[1]; this._maskTz[i] = _tq[2]
      if (this._maskK[i] > 0) anyLook = true
    }
    this._hasLook = anyLook
    this._iHips = this._index.has('hips') ? this._index.get('hips') : -1
    // Which way is "the character's left" in RIG-LOCAL Z? Read off the bind
    // pose rather than assumed, so a character file that mirrors its arms does
    // not get its punch counter-rotated. armL at +z (WALLY, and every file in
    // the roster today) -> +1.
    this._armAxis = 1
    const aL = this.bones.armL, aR = this.bones.armR
    if (aL && aR) {
      const dz = aL.position.z - aR.position.z
      const dx = aL.position.x - aR.position.x
      if (Math.abs(dz) > Math.abs(dx) && Math.abs(dz) > 1e-4) this._armAxis = dz >= 0 ? 1 : -1
    }
    this.layer = {
      breathe: { w: 0, target: 0, phase: Math.random() * Math.PI * 2, rate: 0.62, amp: 1 },
      lookAt: { w: 0, target: 0, yaw: 0, pitch: 0, curYaw: 0, curPitch: 0, velY: 0, velP: 0 },
      flinch: { w: 1, target: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      limp: { w: 0, target: 0, phase: 0, side: 1 },
      // Idle weight shift. Phase randomised so two fighters never breathe or
      // shift in lockstep — nothing reads as fake faster than a synchronised pair.
      sway: { w: 0, target: 0, phase: Math.random() * Math.PI * 2, rate: Math.PI * 2 / 3.4, amp: 1 },
      // Attack torque. `live` is the only thing the update path branches on.
      torque: {
        w: 1, target: 1, live: false, t: 0, dur: 0, startup: 0, active: 0,
        antic: 0, amp: 0, side: 0, ang: 0, vel: 0, k: 400, c: 24, lead: 0,
      },
    }
  }

  /** Ramp a layer's weight. `snap` sets it immediately (round resets). */
  setLayerWeight(name, w, snap = false) {
    const L = this.layer && this.layer[name]
    if (!L) return
    const v = clamp(Number.isFinite(w) ? w : 0, 0, 1)
    L.target = v
    if (snap) L.w = v
  }

  /**
   * Point the head (and eyes, and a little torso) at something.
   * `yaw`/`pitch` are RELATIVE TO THE FIGHTER'S FACING, in radians — the owner
   * knows both positions and its own yaw, so the animator never touches a world
   * matrix for this. Pass weight 0 (or setLayerWeight('lookAt', 0)) to release.
   */
  setLookAt(yaw, pitch, weight = 1) {
    const L = this.layer.lookAt
    L.yaw = clamp(Number.isFinite(yaw) ? yaw : 0, -0.85, 0.85)
    L.pitch = clamp(Number.isFinite(pitch) ? pitch : 0, -0.45, 0.5)
    L.target = clamp(weight, 0, 1)
  }

  /**
   * Impact flinch. (fx, fz) is the direction the FORCE travels expressed in the
   * fighter's own frame (+x = the way the fighter is facing), so a punch taken
   * to the face is (-1, 0). `power` ~0.15 light, ~0.45 heavy.
   * Adds straight into the flinch spring's velocity, so repeated hits stack and
   * the layer keeps playing over whatever the body is doing.
   */
  flinch(fx, fz, power = 0.3) {
    const L = this.layer.flinch
    const p = clamp(power, 0, 1.2) * 26
    L.vz += -fx * p
    L.vy += -fz * p * 0.8
    L.vx += fz * p * 0.5
    // and kick the secondary motion — a hit should whip the ears and the tail
    this.springImpulse(fx, 0.35, fz, power)
  }

  /**
   * ATTACK TORQUE — put a body behind the arm.
   *
   * Call once when a move starts, with the move's own frame data in SECONDS.
   * The layer then runs itself: it coils the pelvis AGAINST the direction of
   * travel through startup, drives through the active window, overshoots, and
   * rings down through recovery. None of that is authored anywhere; it falls
   * out of an underdamped spring chasing a three-step target, which is also
   * why an interrupted move (cancel, counter-hit, ragdoll) simply relaxes
   * instead of snapping.
   *
   * `side`: an EXPLICIT twist sign, +1 or -1, in rig-local yaw. Omit it (the
   * normal case — no character file authors one) and the sign is read off the
   * clip's own authored hip/spine yaw by clipTwistSign(). 0 = square: fore/aft
   * lean and forward weight shift only, no twist. See clipTwistSign for why the
   * old "which arm swings" heuristic was replaced.
   *
   * Nothing here can move a hitbox: MatchScreen resolves hits from fighter
   * distance/facing/height, never from a bone transform.
   */
  attackDrive(startup, active, recovery, kind, side, scale = 1) {
    const T = this.layer && this.layer.torque
    if (!T) return
    const s = Math.max(0, Number.isFinite(startup) ? startup : 0)
    const a = Math.max(0.016, Number.isFinite(active) ? active : 0.05)
    const r = Math.max(0, Number.isFinite(recovery) ? recovery : 0.1)
    const dur = s + a + r
    const prof = TORQUE_KIND[kind] || TORQUE_DEFAULT
    const k = clamp(Number.isFinite(scale) ? scale : 1, 0, 2)
    T.t = 0
    T.startup = s
    T.active = a
    T.dur = dur
    T.antic = prof[0] * k
    T.amp = prof[1] * k
    T.live = true
    // Tune the spring TO THE BEAT, not to the move. A 6-frame jab and a
    // 40-frame super cannot share a stiffness, and tuning off the TOTAL
    // duration is the trap: with a 0.4 s move the solver is still climbing
    // when the 5-frame active window closes and the drive tops out at half
    // amplitude. Size it so the rise to first peak, t_p = pi/(w*sqrt(1-z^2)),
    // lands ON the shorter of the two beats it has to hit.
    const beat = clamp(Math.min(s > 0.02 ? s : a, a), 0.045, 0.17)
    const w = Math.PI / (beat * Math.sqrt(1 - TORQUE_ZETA * TORQUE_ZETA))
    T.k = w * w
    T.c = 2 * TORQUE_ZETA * w
    // ---- LAND THE PEAK ON THE CONTACT FRAME ------------------------------
    // v3.5. The drive target used to flip at the startup/active boundary, and
    // the spring needs a full `beat` to reach its first peak — so peak torque
    // arrived one beat AFTER the active window opened. Contact is on the first
    // active frame, and hit-stop freezes the whole fighter there for 3-8
    // frames. Measured on wally elephantElbow: T.ang sat at 0.0115 rad — the
    // zero crossing, mid-uncoil — for the seven frames either side of contact.
    // The most-looked-at frame in the game got a square torso, and hit-stop
    // then held that square torso on screen.
    //
    // Freezing is NOT the bug and free-running the spring through hit-stop is
    // NOT the fix (see the comment in _updateLayers): the right answer is to
    // fix WHICH pose gets frozen. The drive now begins `beat` seconds early, so
    // the first peak lands on the startup->active boundary and hit-stop freezes
    // the body at full torque. The coil keeps at least 45% of startup, so the
    // anticipation beat survives on every move in the roster.
    T.lead = Math.min(beat, s * 0.55)

    // ---- SIGN, LAST, BECAUSE IT NEEDS THE BEAT ---------------------------
    // An explicit `side` is a LEAD-LIMB statement in the caller's own terms, so
    // it still goes through _armAxis (a character file that mirrors its arms
    // means the opposite thing by "left-led"). A sign read off the clip is
    // already in rig-local yaw and must NOT be flipped again.
    if (Number.isFinite(side) && side !== 0) {
      T.side = (side > 0 ? 1 : -1) * this._armAxis
    } else if (!this.clip) {
      T.side = 0
    } else {
      // Map the move's beats onto CLIP-NORMALISED time. playFitted has already
      // set this.speed so the clip covers the move, except where the 0.2..4
      // clamp bites — using the realised play speed keeps the correlation
      // aligned with the frames that will actually be shown.
      const cd = this.clip.duration > 1e-4 ? this.clip.duration : dur
      const sp = this.speed > 1e-3 ? this.speed : 1
      const eff = cd / sp                        // move-seconds the clip spans
      const inv = eff > 1e-4 ? 1 / eff : 0
      T.side = clipTwistSign(this.clip,
        clamp((s - T.lead) * inv, 0, 1), clamp((s + a) * inv, 0, 1), T.antic, T.amp)
    }
  }

  /** Let the torque relax to neutral early (move cancelled, hit, ragdoll). */
  releaseAttack() {
    const T = this.layer && this.layer.torque
    if (!T || !T.live) return
    T.t = Math.max(T.t, T.dur)
  }

  /** Kill the torque outright (round reset / teleport). */
  clearAttack() {
    const T = this.layer && this.layer.torque
    if (!T) return
    T.live = false; T.t = 0; T.ang = 0; T.vel = 0; T.side = 0
  }

  /** Health-driven damage limp. 0 = fine, 1 = about to fall over. */
  setLimp(amount, side = 1) {
    const L = this.layer.limp
    L.target = clamp(Number.isFinite(amount) ? amount : 0, 0, 1)
    L.side = side >= 0 ? 1 : -1
  }

  /**
   * Body motion for the spring drive. `vx/vy/vz` world velocity, `yaw` the
   * fighter's facing. Acceleration is differenced internally, so the owner does
   * not have to keep last-frame state.
   */
  setBodyMotion(vx, vy, vz, yaw, dt) {
    const d = dt > 1e-4 ? dt : 1 / 60
    const ax = (vx - this._bodyVX) / d
    const ay = (vy - this._bodyVY) / d
    const az = (vz - this._bodyVZ) / d
    // A teleport (round reset, ragdoll recovery) must not become an impulse.
    const big = ax * ax + ay * ay + az * az > 4e4
    this._bodyAX = big ? 0 : clamp(ax, -70, 70)
    this._bodyAY = big ? 0 : clamp(ay, -70, 70)
    this._bodyAZ = big ? 0 : clamp(az, -70, 70)
    this._bodyVX = vx; this._bodyVY = vy; this._bodyVZ = vz
    this._yaw = Number.isFinite(yaw) ? yaw : 0
  }

  /** Ground plane offset relative to the fighter root (0 on a flat arena). */
  setGroundDelta(dy, grounded = true) {
    this._groundDelta = Number.isFinite(dy) ? clamp(dy, -3, 3) : 0
    this._grounded = !!grounded
  }

  _updateLayers(dt) {
    const rate = Math.min(1, dt * 9)
    const B = this.layer.breathe, K = this.layer.lookAt, F = this.layer.flinch, M = this.layer.limp
    const S = this.layer.sway, T = this.layer.torque
    B.w += (B.target - B.w) * rate
    K.w += (K.target - K.w) * rate
    M.w += (M.target - M.w) * rate
    F.w += (F.target - F.w) * rate
    S.w += (S.target - S.w) * Math.min(1, dt * 4.5)   // slower: a stance change
    T.w += (T.target - T.w) * rate

    // ---- breathing: a slow chest swell with a touch of shoulder and head ----
    B.phase += dt * B.rate * Math.PI * 2
    if (B.phase > Math.PI * 4) B.phase -= Math.PI * 4
    const br = Math.sin(B.phase)
    const brOut = Math.sin(B.phase * 2) * 0.25   // sharper exhale than inhale
    const bw = B.w * B.amp

    // ---- look-at: critically damped so the head never snaps ----
    const kk = 120, kc = 20
    K.velY += (-kk * (K.curYaw - K.yaw) - kc * K.velY) * dt
    K.velP += (-kk * (K.curPitch - K.pitch) - kc * K.velP) * dt
    K.curYaw = clamp(K.curYaw + K.velY * dt, -1.0, 1.0)
    K.curPitch = clamp(K.curPitch + K.velP * dt, -0.6, 0.6)

    // ---- flinch: 3-axis damped spring driven purely by impulses ----
    const fk = 165, fc = 17.5
    F.vx += (-fk * F.x - fc * F.vx) * dt
    F.vy += (-fk * F.y - fc * F.vy) * dt
    F.vz += (-fk * F.z - fc * F.vz) * dt
    F.x = clamp(F.x + F.vx * dt, -0.65, 0.65)
    F.y = clamp(F.y + F.vy * dt, -0.65, 0.65)
    F.z = clamp(F.z + F.vz * dt, -0.8, 0.8)
    const fLive = F.w > 1e-3 && (Math.abs(F.x) + Math.abs(F.y) + Math.abs(F.z) > 1e-4 ||
      Math.abs(F.vx) + Math.abs(F.vy) + Math.abs(F.vz) > 1e-3)

    // ---- limp: a lopsided hitch, phase-locked to the locomotion cycle ----
    M.phase += dt * (1.4 + this._locoRate * 0.9)
    if (M.phase > Math.PI * 2) M.phase -= Math.PI * 2
    const hitch = Math.sin(M.phase)
    const hitch2 = Math.max(0, Math.sin(M.phase * 2))
    const mw = M.w

    // ---- sway: the idle weight shift ------------------------------------
    // One slow lateral transfer, plus its second harmonic for the little
    // settle at each end of the shift. The hips DROP as the weight arrives,
    // and the foot IK turns that drop into knee bend, which is the whole
    // reason a fighting-game idle reads as coiled rather than as a mannequin.
    S.phase += dt * S.rate
    if (S.phase > Math.PI * 2) S.phase -= Math.PI * 2
    const sw = Math.sin(S.phase)
    const sw2 = Math.sin(S.phase * 2)
    const swAbs = Math.abs(sw)
    const sww = S.w * S.amp

    // ---- attack torque: coil -> drive -> overshoot -> settle -------------
    // WHY THIS DOES NOT RUN ON ITS OWN CLOCK THROUGH HIT-STOP. The owner
    // freezes a fighter by handing us dt = 0, and everything else about that
    // fighter — clip time, springs, IK, the opponent — freezes with it. A
    // torso that kept rotating inside a frozen frame would be the only thing
    // moving, would slide out from under a clip pose that is NOT advancing
    // (the layer is additive over the sampled pose), and would land somewhere
    // the animation never asked for when the freeze lifts. Hit-stop is a held
    // frame; the deliverable is that the HELD FRAME IS THE GOOD ONE, which is
    // what T.lead buys (see attackDrive). dt = 0 falls through the sub-step
    // loop below with zero iterations, so the spring holds exactly.
    if (T.live) {
      T.t += dt
      let tgt
      // T.lead pulls the drive forward so the spring's first peak lands ON the
      // startup->active boundary, i.e. on the contact frame, instead of a full
      // beat after it.
      if (T.t < T.startup - T.lead) tgt = -T.antic
      else if (T.t < T.startup + T.active) tgt = T.amp
      else if (T.t < T.dur) tgt = T.amp * 0.16
      else {
        tgt = 0
        if (Math.abs(T.ang) < 4e-4 && Math.abs(T.vel) < 4e-3) { T.live = false; T.ang = 0; T.vel = 0 }
      }
      // Fixed 1/480 s sub-steps. k runs past 6000 on a 3-frame active window
      // (w ~ 78 rad/s) and a symplectic Euler step needs h*w well under 2; at
      // 1/480 the worst case is 0.16. Eight sub-steps per frame for two
      // fighters is nothing, and a spring that rings itself apart on a hitstop
      // is worse than no spring.
      let rem = Math.min(dt, 0.05)
      const H = 1 / 480
      while (rem > 1e-6) {
        const h = rem > H ? H : rem
        rem -= h
        T.vel += (-T.k * (T.ang - tgt) - T.c * T.vel) * h
        T.ang += T.vel * h
      }
      T.ang = clamp(T.ang, -1.1, 1.1)
      if (!Number.isFinite(T.ang + T.vel)) { T.ang = 0; T.vel = 0; T.live = false }
    }
    const tq = T.live ? T.ang * T.w : 0
    const tqLive = Math.abs(tq) > 2e-4
    const tqYaw = tq * T.side

    const add = this._addR
    const addP = this._addP
    add.fill(0)
    addP.fill(0)
    if (bw < 1e-4 && K.w < 1e-4 && mw < 1e-4 && sww < 1e-4 && !fLive && !tqLive) return

    const hipsI = this._iHips
    for (let i = 0; i < this.list.length; i++) {
      const o = i * 3
      let rx = 0, ry = 0, rz = 0, px = 0, py = 0, pz = 0
      if (bw > 1e-4) {
        const m = this._maskB[i]
        if (m > 0) {
          // v3.4: the old amplitudes (0.020 rad of chest, 5.5 mm of lift) were
          // sub-pixel at gameplay framing — a critic measured the idle as "a
          // T-pose that was nudged". Roughly doubled, plus a rib twist, which
          // is what makes a breath read as a volume changing rather than a
          // rotation happening.
          rz += br * 0.040 * m * bw
          rx += brOut * 0.013 * m * bw
          ry += br * 0.007 * m * bw
          py += br * 0.011 * m * bw
        }
      }
      if (sww > 1e-4) {
        const m = this._maskS[i]
        if (m !== 0) {
          const ma = m < 0 ? -m : m
          rx += sw * 0.058 * m * sww                       // roll onto the loaded leg
          ry += (sw * 0.034 + sw2 * 0.012) * m * sww       // pelvis twist, spine counters
          rz += -(0.010 + swAbs * 0.020) * ma * sww        // stay coiled forward
        }
      }
      if (tqLive) {
        const my = this._maskTy[i]
        if (my !== 0) ry += tqYaw * my
        const mz = this._maskTz[i]
        // The drive leans FORWARD (negative z, same convention as the limp's
        // hunch); the coil is a negative angle, so it leans BACK for free.
        if (mz !== 0) rz += -tq * mz
        const mx = this._maskTx[i]
        if (mx !== 0) rx += tqYaw * mx
      }
      if (K.w > 1e-4) {
        const m = this._maskK[i]
        if (m > 0) { ry += K.curYaw * m * K.w; rz += K.curPitch * m * K.w }
      }
      if (fLive) {
        const m = this._maskF[i] * F.w
        if (m > 0) { rx += F.x * m; ry += F.y * m; rz += F.z * m }
      }
      if (mw > 1e-4) {
        const m = this._maskL[i]
        if (m > 0) {
          const s = M.side
          rz += (-0.10 - hitch2 * 0.06) * m * mw       // hunch forward
          rx += hitch * 0.05 * s * m * mw              // list to the hurt side
          ry += hitch * 0.03 * s * m * mw
          py += -0.035 * m * mw - hitch2 * 0.02 * m * mw
        }
      }
      // ---- hips translation: where a weight shift actually lives ----------
      // Rotation alone reads as a wobble. The pelvis has to TRAVEL over the
      // supporting foot and DROP as the weight arrives; the IK latch pins the
      // feet through both, so the legs take up the difference as knee bend.
      if (i === hipsI) {
        if (sww > 1e-4) {
          // *** THE LATERAL TRANSFER IS ON THE CAMERA'S DEPTH AXIS. ***
          // v3.5, and it is the answer to "the sway hip translation does not
          // reach the model". It does reach it: over a 4 s idle the hips travel
          // dz 0.0600 m, exactly the authored ±0.030, with dx 0.0100 and dy
          // 0.0166 of additive on top of the clip's own bob. The problem is
          // which axis that 60 mm is on. The character's left/right is RIG-
          // LOCAL Z (see _armAxis: armL sits at +z on every file in the
          // roster), fighters face each other along world X, and the match
          // camera sits off in Z looking at them side-on — so the entire weight
          // transfer is straight toward and away from the lens and reads as
          // almost nothing. Anyone measuring "lateral" on x finds 10 mm and
          // concludes the layer is broken.
          // The lateral stays: it is anatomically what a weight shift is, it
          // parallaxes correctly on the orbit/replay cameras, and the IK plant
          // turns it into knee bend (measured on dogey: 0.40 rad of knee swing
          // per idle cycle with the plant on, 0.005 with it off). What was
          // undersized is the FORE/AFT drift, the one translation channel the
          // gameplay camera sees head-on, so that goes 0.010 -> 0.024 m.
          //
          // THE SINK STAYS WHERE IT WAS, and that is a measurement, not
          // timidity. Deepening it to 0.030 m read well on the six two-bone
          // fighters (knee swing 0.40 -> 0.59 rad) and cost the four one-bone
          // fighters 2 cm of extra foot penetration — a rigid leg has no joint
          // to absorb a pelvis drop with, so every millimetre of extra sink
          // goes straight through the floor (tired-ape -0.041 -> -0.062 m).
          // The sink is capped by the worst rig in the roster, not the best.
          pz += sw * 0.030 * sww                           // lateral transfer (depth)
          py += -(0.008 + swAbs * 0.017) * sww * this._sinkScale   // sink into the stance
          px += sw2 * 0.012 * sww                          // fore/aft drift
        }
        if (tqLive) {
          px += tq * TORQUE_SHIFT                          // weight onto the lead foot
          py += -(tq < 0 ? -tq : tq) * 0.035
          pz += tqYaw * 0.020
        }
      }
      add[o] = rx; add[o + 1] = ry; add[o + 2] = rz
      addP[o] = px; addP[o + 1] = py; addP[o + 2] = pz
    }
  }

  // ==========================================================================
  // SECONDARY MOTION — spring follow-through on ears, trunks, tails, jowls,
  // bellies and cloth. Bones are found BY NAME (SPRING_FAMILY above), so the
  // whole roster gets it without a single character file being edited.
  //
  // OWNERSHIP. src/physics/RagdollManager.js already runs an always-on
  // accessory-sway spring over every NON-CORE bone in the rig, layered on the
  // animator's output. Two solvers on the same axes would double the amplitude,
  // so `setSecondaryExcluded(names)` lets the owner hand those bones over.
  // Fighter.js does exactly that when a spring-capable ragdoll manager is
  // present, and keeps the channels that manager never writes (Y twist and the
  // positional jiggle on soft flesh) for itself.
  //
  // STABILITY. The integrator sub-steps at 1/120 s, the drive is clamped, the
  // offset is clamped per family, and a teleport-sized acceleration is dropped
  // on the floor. Springs that explode on a hitstop are worse than no springs.
  // ==========================================================================

  _initSprings(n, opts) {
    this._locoRate = 0
    this._springPhase = Math.random() * Math.PI * 2
    this._springExcl = null
    this._sIdx = []
    this._sCfg = []
    this._sParent = []
    this._sState = null
    this._sPrev = null
    this._sHasPrev = null
    this._discoverSprings()
    if (opts && opts.secondaryExclude) this.setSecondaryExcluded(opts.secondaryExclude)
  }

  _discoverSprings() {
    const idx = [], cfg = [], par = []
    for (let i = 0; i < this.names.length; i++) {
      const nm = this.names[i]
      const fam = springFamily(nm)
      if (!fam) continue
      idx.push(i); cfg.push(fam); par.push(this.list[i].parent || null)
    }
    this._sIdx = idx
    this._sCfg = cfg
    this._sParent = par
    // [offX,offY,offZ, velX,velY,velZ, jigY, jigVelY] per spring
    this._sState = new Float64Array(idx.length * 8)
    this._sPrev = new Float64Array(idx.length * 3)
    this._sHasPrev = new Uint8Array(idx.length)
    this._sSwing = new Uint8Array(idx.length).fill(1)
  }

  /**
   * Bone names whose X/Z SWING is driven by somebody else (the ragdoll
   * manager). Those bones keep their Y twist and positional jiggle here — the
   * channels no other system writes — and lose the duplicated swing.
   */
  setSecondaryExcluded(names) {
    const set = names instanceof Set ? names : new Set(names || [])
    this._springExcl = set
    for (let s = 0; s < this._sIdx.length; s++) {
      this._sSwing[s] = set.has(this.names[this._sIdx[s]]) ? 0 : 1
    }
  }

  /** Whip every spring — call on impact. (fx,fy,fz) in the fighter's frame. */
  springImpulse(fx, fy, fz, power = 0.5) {
    const st = this._sState
    if (!st) return
    const p = clamp(power, 0, 1.5) * 9
    for (let s = 0; s < this._sIdx.length; s++) {
      const cfg = this._sCfg[s]
      const o = s * 8
      const g = cfg.gain * p
      // An EXCLUDED bone still gets a fraction of the whip. RagdollManager's
      // accessory sway is driven purely by parent world ACCELERATION and it
      // has no impulse entry point, so on a hit taken standing still it
      // contributes nothing at all — handing it the swing must not mean the
      // ears stop reacting to being punched.
      const gi = this._sSwing[s] ? g : g * SPRING_EXCL_SHARE
      if (gi !== 0) {
        st[o + 5] += -fx * gi         // velZ: fore/aft force swings in Z
        st[o + 3] += fz * gi          // velX: lateral force swings in X
      }
      st[o + 4] += -fz * g * cfg.twist
      if (cfg.jiggle > 0) st[o + 7] += -fy * g * 0.02
    }
  }

  /** Kill all spring state — teleports, round resets, ragdoll handover. */
  resetSecondary() {
    if (this._sState) this._sState.fill(0)
    if (this._sHasPrev) this._sHasPrev.fill(0)
    const F = this.layer?.flinch
    if (F) { F.x = F.y = F.z = F.vx = F.vy = F.vz = 0 }
    const K = this.layer?.lookAt
    if (K) { K.curYaw = K.curPitch = K.velY = K.velP = 0 }
    this.clearAttack()
    this._bodyVX = this._bodyVY = this._bodyVZ = 0
    this._bodyAX = this._bodyAY = this._bodyAZ = 0
    // A teleport invalidates every world-space foot latch, and the weight has
    // to ramp back in from zero or the first frame yanks the legs somewhere.
    this._ikW = 0
    if (this._ik) {
      for (const ch of this._ik.chains) {
        ch.planted = false; ch.lockW = 0; ch.pull = 0; ch.hasLift = false; ch.contact = false
      }
    }
  }

  _updateSprings(dt) {
    const idx = this._sIdx
    if (!idx.length) return
    const st = this._sState
    // Body acceleration into the fighter's own frame (yaw 0 faces +X).
    const c = Math.cos(-this._yaw), s0 = Math.sin(-this._yaw)
    const laX = this._bodyAX * c - this._bodyAZ * s0
    const laZ = this._bodyAX * s0 + this._bodyAZ * c
    const laY = this._bodyAY

    // ---- IDLE LIFE -------------------------------------------------------
    // Every drive term below is proportional to body acceleration, so a
    // fighter standing in neutral has perfectly dead ears — measured, and
    // called out: "no ear and trunk secondary motion" in the idle. This is the
    // wind: two slow, incommensurate sines with a per-bone phase offset, faded
    // out the moment the body actually accelerates so it never fights or
    // doubles the real drive (or RagdollManager's, which is also acceleration-
    // only and therefore also silent here).
    this._springPhase += dt
    if (this._springPhase > 1e4) this._springPhase = 0
    const accMag = Math.abs(laX) + Math.abs(laY) + Math.abs(laZ)
    const life = clamp(1 - accMag / 5.5, 0, 1) * clamp(1 - this._locoRate * 0.5, 0.15, 1)
    const lp = this._springPhase

    // Fixed-step integration: stable no matter what dt the sim hands us.
    let remain = Math.min(dt, 0.05)
    const H = 1 / 120

    for (let s = 0; s < idx.length; s++) {
      const i = idx[s]
      const cfg = this._sCfg[s]
      const o = s * 8
      const po = s * 3
      const parent = this._sParent[s]

      // Parent angular velocity — the "the head whipped, the ear did not" term.
      let pvx = 0, pvy = 0, pvz = 0
      if (parent && parent.rotation) {
        const rx = parent.rotation.x, ry = parent.rotation.y, rz = parent.rotation.z
        if (this._sHasPrev[s]) {
          const inv = 1 / Math.max(1e-4, dt)
          pvx = clamp((rx - this._sPrev[po]) * inv, -30, 30)
          pvy = clamp((ry - this._sPrev[po + 1]) * inv, -30, 30)
          pvz = clamp((rz - this._sPrev[po + 2]) * inv, -30, 30)
        } else this._sHasPrev[s] = 1
        this._sPrev[po] = rx; this._sPrev[po + 1] = ry; this._sPrev[po + 2] = rz
      }

      const swing = this._sSwing[s]
      // Drive: linear acceleration swings a hanging chain, parent rotation drags it.
      let dX = swing ? (laZ * cfg.gain * 0.055 - pvx * cfg.gain * 0.10) : 0
      let dZ = swing ? (-laX * cfg.gain * 0.055 - pvz * cfg.gain * 0.10) : 0
      let dY = -pvy * cfg.gain * cfg.twist * 0.22
      const dJ = cfg.jiggle > 0 ? (-laY * cfg.gain * 0.010) : 0
      if (life > 1e-3) {
        // Per-bone phase offset (the index, times an irrational-ish step) so no
        // two ears, and no two fighters, ever flutter in unison.
        const ph = lp + s * 1.317
        const lg = cfg.gain * life * (swing ? 1 : SPRING_EXCL_SHARE)
        dX += Math.sin(ph * 3.6) * 0.030 * lg + Math.sin(ph * 1.31 + 1.7) * 0.020 * lg
        dZ += Math.sin(ph * 2.9 + 2.4) * 0.026 * lg + Math.sin(ph * 0.97) * 0.017 * lg
        dY += Math.sin(ph * 2.1 + 0.6) * 0.022 * lg * cfg.twist
      }

      let ox = st[o], oy = st[o + 1], oz = st[o + 2]
      let vx = st[o + 3], vy = st[o + 4], vz = st[o + 5]
      let jy = st[o + 6], jv = st[o + 7]
      remain = Math.min(dt, 0.05)
      while (remain > 1e-6) {
        const h = remain > H ? H : remain
        remain -= h
        vx += (-cfg.k * ox - cfg.c * vx + dX * cfg.k) * h
        vy += (-cfg.k * oy - cfg.c * vy + dY * cfg.k) * h
        vz += (-cfg.k * oz - cfg.c * vz + dZ * cfg.k) * h
        ox += vx * h; oy += vy * h; oz += vz * h
        if (cfg.jiggle > 0) {
          jv += (-cfg.k * 0.55 * jy - cfg.c * 0.8 * jv + dJ * cfg.k * 0.55) * h
          jy += jv * h
        }
      }
      const m = cfg.max
      if (ox > m) { ox = m; if (vx > 0) vx = 0 } else if (ox < -m) { ox = -m; if (vx < 0) vx = 0 }
      if (oy > m) { oy = m; if (vy > 0) vy = 0 } else if (oy < -m) { oy = -m; if (vy < 0) vy = 0 }
      if (oz > m) { oz = m; if (vz > 0) vz = 0 } else if (oz < -m) { oz = -m; if (vz < 0) vz = 0 }
      const jm = cfg.jiggle
      if (jy > jm) { jy = jm; jv = 0 } else if (jy < -jm) { jy = -jm; jv = 0 }
      // NaN firewall: one bad frame must never poison the rig forever.
      if (!Number.isFinite(ox + oy + oz + vx + vy + vz + jy + jv)) {
        ox = oy = oz = vx = vy = vz = jy = jv = 0
      }
      st[o] = ox; st[o + 1] = oy; st[o + 2] = oz
      st[o + 3] = vx; st[o + 4] = vy; st[o + 5] = vz
      st[o + 6] = jy; st[o + 7] = jv

      const b = this.list[i]
      b.rotation.set(b.rotation.x + ox, b.rotation.y + oy, b.rotation.z + oz)
      if (jm > 0) b.position.y += jy
    }
  }

  // ==========================================================================
  // FOOT IK — exact planar two-bone solve, plus a stance lock.
  //
  // Every character in the roster keys shins on Z ONLY, so the knee's hinge is
  // local Z and the bend plane is the leg's own XY plane. That makes this an
  // EXACT solve rather than an iterative one: express the target in the leg's
  // parent space, undo the leg's own X/Y euler (THREE 'XYZ' composes as
  // Rx·Ry·Rz, so Rz acts first, in the leg's own frame), and the remaining
  // problem is planar trigonometry.
  //
  // Two jobs:
  //   * PLANT     — the animated ankle is pulled to the ground plane whenever
  //                 the clip puts it at or below the bind-pose sole height, so
  //                 feet stop floating and stop sinking.
  //   * ANTI-SKATE— while planted the ankle's WORLD position is latched, so the
  //                 body travels over a foot that stays where it was put. The
  //                 latch is soft: its authority falls off with the error and
  //                 releases entirely past MAX_DRAG, so a mismatched stride
  //                 degrades to the raw clip instead of tearing the leg off.
  //
  // Weight ramps over ~0.12 s and is forced to zero in the air, in knockdown,
  // in ragdoll and while launched — nothing pops.
  // ==========================================================================

  _initIK(opts) {
    this._ik = null
    this._ikW = 0
    this._ikTarget = 0
    const hips = this.bones.hips
    if (!hips) return
    // The anchor is the first ancestor above the rig — the character's model
    // group. All IK maths happens in ANCHOR SPACE, which makes it immune to
    // where the fighter is standing and which way it is facing.
    let anchor = hips.parent
    const boneSet = new Set(this.list)
    while (anchor && boneSet.has(anchor)) anchor = anchor.parent
    if (!anchor) return

    // MEASURED AT CONSTRUCTION, ON PURPOSE. The Animator is built immediately
    // after buildModel(), so the rig is still in its BIND POSE here — this is
    // the only moment the sole height can be read without stomping a playing
    // clip. Nothing is in the scene yet either, but every measurement below is
    // taken in ANCHOR SPACE (anchor.matrixWorld is inverted out), which makes
    // it independent of where the fighter later stands and which way it faces.
    const chains = []
    try { anchor.updateWorldMatrix(true, true) } catch { return }
    _m1.copy(anchor.matrixWorld).invert()
    for (const side of ['L', 'R']) {
      const leg = this.bones['leg' + side]
      let shin = this.bones['shin' + side]
      if (!leg) continue
      if (shin && shin.parent !== leg) shin = null
      // ONE-BONE LEGS ARE NOT AN EDGE CASE. Four of the ten fighters — WALLY,
      // tired-ape, fatty-pingo and cool-pal — are built with a single leg
      // segment and no shin bone at all, and the two-bone solver simply
      // skipped them: no plant, no anti-skate, feet through the floor, for the
      // character who appears in 100% of frames including every menu. A rigid
      // leg can still be aimed, which fixes both defects a critic can see.
      const tip = shin || leg
      const l1 = shin ? shin.position.length() : 0
      if (shin && !(l1 > 0.02)) { shin = null }
      let l2 = shin ? l1 : 0.4
      try {
        _box.makeEmpty()
        _box.setFromObject(tip)
        if (!_box.isEmpty()) {
          // Legs are near-vertical in bind pose, so the world drop from the
          // joint to the lowest vertex under it IS the segment + foot length.
          tip.getWorldPosition(_v1)
          const drop = _v1.y - _box.min.y
          if (drop > 0.03 && drop < 4) l2 = drop
        }
      } catch { /* stub rigs have no meshes — the fallback length is a fine guess */ }
      if (!(l2 > 0.03)) continue
      // Path from the anchor's child down to the tip: the only nodes whose
      // world matrices the solve needs, refreshed by hand every frame so we
      // never traverse the character's several hundred meshes.
      const path = []
      for (let node = tip; node && node !== anchor; node = node.parent) path.unshift(node)
      _v1.set(0, -l2, 0).applyMatrix4(tip.matrixWorld).applyMatrix4(_m1)
      chains.push({
        leg, shin, tip, l1, l2, path,
        sign: shin && shin.rotation.z >= 0 ? 1 : -1,
        bindSole: _v1.y,
        planted: false, lockX: 0, lockY: 0, lockZ: 0, lockW: 0,
        // v3.5 per-chain solve state, all scalars, all written in place.
        ax: 0, ay: 0, az: 0, sole: _v1.y,
        lift: 0, rise: 0, hasLift: false, contact: false,
        holdBand: IK_RELEASE_BAND, pull: 0,
      })
    }
    if (!chains.length) return
    this._ik = { anchor, chains }
    // No knee anywhere in the rig -> the sway sink has nothing to bend and
    // goes straight through the floor. See SINK_NO_KNEE.
    if (chains.every((c) => !c.shin)) this._sinkScale = SINK_NO_KNEE
  }

  setIKEnabled(on) { this.ikOn = !!on }

  /** Refresh world matrices for the anchor and one leg chain only. */
  _refreshChain(anchor, path) {
    let parent = anchor
    for (let i = 0; i < path.length; i++) {
      const node = path[i]
      if (node.matrixAutoUpdate) node.updateMatrix()
      node.matrixWorld.multiplyMatrices(parent.matrixWorld, node.matrix)
      parent = node
    }
  }

  _updateIK(dt) {
    const ik = this._ik
    if (!ik) return
    // Ramp: grounded and enabled pulls to 1, everything else to 0.
    const want = (this.ikOn && this._grounded) ? 1 : 0
    this._ikTarget = want
    this._ikW += (want - this._ikW) * Math.min(1, dt * 8.5)
    if (this._ikW < 0.005) {
      this._ikW = 0
      for (const ch of ik.chains) { ch.planted = false; ch.lockW = 0; ch.pull = 0; ch.hasLift = false }
      return
    }
    // Ancestors of the anchor only — the rig itself is refreshed per chain.
    try { ik.anchor.updateWorldMatrix(true, false) } catch { return }
    _m1.copy(ik.anchor.matrixWorld).invert()

    const groundY = this._groundDelta      // anchor-space ground offset
    const chains = ik.chains

    // --- pass 1: measure every ankle BEFORE anything is decided -----------
    // Contact is a decision about the whole stance, not about one leg: which
    // foot is carrying the body can only be answered by comparing them. v3.4
    // decided per chain inside a single loop, which is why a clip that never
    // quite reaches the band left BOTH feet swinging in mid-air forever.
    let low = null, lowLift = Infinity, anyContact = false
    for (let i = 0; i < chains.length; i++) {
      const ch = chains[i]
      this._refreshChain(ik.anchor, ch.path)
      _v1.set(0, -ch.l2, 0).applyMatrix4(ch.tip.matrixWorld).applyMatrix4(_m1)
      ch.ax = _v1.x; ch.ay = _v1.y; ch.az = _v1.z
      ch.sole = ch.bindSole + groundY
      const lift = _v1.y - ch.sole
      ch.rise = ch.hasLift ? lift - ch.lift : 0
      ch.hasLift = true
      ch.lift = lift
      // Hysteresis: a planted foot holds to the band it latched at, so a stance
      // phase that rides 0.05 m up is not thrown away six frames later.
      ch.contact = ch.planted ? lift <= ch.holdBand : lift <= IK_PLANT_BAND
      if (ch.contact) anyContact = true
      if (lift < lowLift) { lowLift = lift; low = ch }
    }
    // Nobody in contact: the lowest settling foot is the support foot.
    if (!anyContact && low && lowLift <= IK_SUPPORT_BAND && low.rise <= IK_SUPPORT_RISE) {
      low.contact = true
    }

    // --- pass 2: latch, bed down, solve -----------------------------------
    const step = IK_PLANT_RATE * dt
    for (let i = 0; i < chains.length; i++) {
      const ch = chains[i]
      const leg = ch.leg, shin = ch.shin
      const ax = ch.ax, ay = ch.ay, az = ch.az
      const sole = ch.sole
      const stance = ch.contact

      // --- stance detection + world-space latch -------------------------
      if (stance) {
        // world position of the current ankle (anchor space -> world)
        _v2.set(ax, ay, az).applyMatrix4(ik.anchor.matrixWorld)
        if (!ch.planted) {
          ch.planted = true
          // Release band is relative to where contact was actually MADE, not to
          // the bind sole: a clip whose stance phase sits 0.05 m up still gets
          // its full 0.045 m of hysteresis instead of none.
          ch.holdBand = Math.max(IK_RELEASE_BAND, ch.lift + IK_PLANT_BAND)
          // Full world point, y included: _updatePresentation leans the holder
          // on Z while walking, and a rolled frame mixes y into x when the
          // latch is transformed back, so a y=0 shortcut would drift the lock.
          ch.lockX = _v2.x; ch.lockY = _v2.y; ch.lockZ = _v2.z; ch.lockW = 0
        }
        ch.lockW = Math.min(1, ch.lockW + dt * 7)
        ch.pull = Math.min(IK_MAX_PULL, ch.pull + step)
      } else {
        if (ch.planted) {
          // RELEASE FASTER THE HIGHER THE FOOT IS. A flat 9/s rate takes seven
          // frames to let go, and the measured dogey walk lifts a releasing
          // ankle to 0.30 m inside four of them — so for three frames the
          // solver was still dragging a swing foot toward a world point it left
          // a stride ago, at up to 0.55 authority (trace frames 19-22, lift
          // 0.249 -> 0.315, lockW 0.55 -> 0.10). Scaling the rate by the
          // overshoot past the hold band collapses that to one or two frames
          // while leaving a foot that only just cleared the band on the
          // original gentle fade, which is the case the hysteresis exists for.
          ch.lockW -= dt * (9 + 90 * Math.max(0, ch.lift - ch.holdBand))
          if (ch.lockW <= 0) { ch.lockW = 0; ch.planted = false }
        }
        // Let the bed-down go the same way it came, or the foot snaps back up
        // to the clip pose on the frame the plant releases.
        ch.pull = ch.pull > step ? ch.pull - step : 0
      }

      // --- target ankle in anchor space ---------------------------------
      // STILL CONSERVATIVE, just no longer self-defeating. The roster's clips
      // were hand-keyed against a flat floor with the bind pose as the contact
      // reference, and several of them bob the hips ABOVE bind height mid-cycle
      // where no leg length can reach the floor. The solver therefore never
      // imposes an absolute sole height: it refuses penetration outright, and
      // it beds a contacting foot down at IK_PLANT_RATE up to IK_MAX_PULL,
      // never past the sole. Author intent survives; the feet reach the ground.
      let tx = ax, ty = ay, tz = az
      if (ay < sole) ty = sole
      else if (ch.pull > 0) ty = Math.max(sole, ay - ch.pull)
      if (ch.planted && ch.lockW > 0) {
        // latched world XZ back into anchor space
        _v3.set(ch.lockX, ch.lockY, ch.lockZ).applyMatrix4(_m1)
        const dx = _v3.x - ax, dz = _v3.z - az
        const err = Math.hypot(dx, dz)
        // soft authority: full inside HOLD, faded out by MAX_DRAG, then re-latch
        let a = ch.lockW
        if (err > IK_LOCK_HOLD) a *= Math.max(0, 1 - (err - IK_LOCK_HOLD) / (IK_MAX_DRAG - IK_LOCK_HOLD))
        if (err > IK_MAX_DRAG) {
          _v2.set(ax, ay, az).applyMatrix4(ik.anchor.matrixWorld)
          ch.lockX = _v2.x; ch.lockY = _v2.y; ch.lockZ = _v2.z
          a = 0
        }
        tx = ax + dx * a
        tz = az + dz * a
      }

      const w = this._ikW
      if (Math.abs(tx - ax) + Math.abs(ty - ay) + Math.abs(tz - az) < 1e-4) continue

      // --- exact planar two-bone solve -----------------------------------
      // Target into the leg's PARENT space, then into the leg's own frame with
      // its X/Y euler undone (Rz acts first under THREE's 'XYZ' order).
      _v2.set(tx, ty, tz).applyMatrix4(ik.anchor.matrixWorld)
      if (leg.parent) {
        _m2.copy(leg.parent.matrixWorld).invert()
        _v2.applyMatrix4(_m2)
      }
      _v2.sub(leg.position)
      _ea.set(leg.rotation.x, leg.rotation.y, 0, 'XYZ')
      _qa.setFromEuler(_ea).invert()
      _v2.applyQuaternion(_qa)

      // --- one-bone leg: aim, do not fold -------------------------------
      // A rigid leg has no knee to trade reach against, so the only free
      // variable is the hip swing. Aiming the segment at the target still
      // does both jobs the solver exists for: the foot stops passing through
      // the floor (the leg swings out, which is what a real leg does), and a
      // planted foot trails behind the travelling body instead of skating
      // with it. The correction is capped tighter than the two-bone one
      // because there is no second joint to absorb a bad target.
      // MEASURED, NOT FIXED, AND DELIBERATELY LEFT ALONE (v3.5). This aim is
      // the least-squares POSITION solve: it drops the tip on the nearest point
      // of the circle of radius l2, and that circle passes UNDER the target
      // whenever the target is nearer than the leg is long. That is why the
      // four one-bone fighters sit 41-47 mm below the sole in idle — the same
      // family as the filed "wally feet penetrate the floor" defect, though the
      // ankle-point number here is not the mesh-vertex number in that report,
      // and it is present with the plant logic of both v3.4 and v3.5 (-0.0413
      // vs -0.0412 on tired-ape), so this solver did not cause it.
      // Both obvious remedies were built and measured, and both are worse:
      //   * matching the target HEIGHT exactly (cos th = -ty/l2) removes the
      //     penetration (cool-pal -0.0475 -> -0.0025) but is singular at full
      //     extension — the same dr/db singularity IK_MIN_KNEE dodges on the
      //     two-bone path — and a 30 mm pelvis drop then splayed a rigid leg
      //     through 0.61 rad. Geometrically correct for a compass leg, absurd
      //     on screen.
      //   * capping that solution's authority at 0.10 rad made the penetration
      //     WORSE than the plain aim (-0.0634 on tired-ape), because a partial
      //     angle satisfies neither objective and feeds back through the latch.
      // The honest fix is at the rig: a one-bone leg whose bind sole is not the
      // contact reference cannot be solved from inside the animator. Leaving
      // the least-squares aim, which is at least stable and monotone.
      if (!shin) {
        const th = Math.atan2(_v2.y, _v2.x) + Math.PI / 2
        if (!Number.isFinite(th)) continue
        const d1 = clamp(wrapPi(th - leg.rotation.z), -IK_ONE_BONE_MAX, IK_ONE_BONE_MAX)
        leg.rotation.z += d1 * w
        continue
      }

      const L1 = ch.l1, L2 = ch.l2
      const two = 2 * L1 * L2
      const sq = L1 * L1 + L2 * L2
      const cosHi = Math.cos(IK_MIN_KNEE)
      const cosLo = Math.cos(IK_MAX_KNEE)
      let r = Math.hypot(_v2.x, _v2.y)
      r = clamp(r, Math.sqrt(Math.max(1e-6, sq + two * cosLo)), Math.sqrt(sq + two * cosHi))
      const cosB = clamp((r * r - sq) / two, cosLo, cosHi)
      // The knee keeps whichever side the ANIMATION is bending it. Locking the
      // side to the bind pose flips the joint inside out halfway through a walk.
      const cz = shin.rotation.z
      const sgn = Math.abs(cz) > 0.02 ? (cz >= 0 ? 1 : -1) : ch.sign
      const beta = Math.acos(cosB) * sgn
      const vxk = L2 * Math.sin(beta)
      const vyk = -(L1 + L2 * cosB)
      const theta = Math.atan2(_v2.y, _v2.x) - Math.atan2(vyk, vxk)
      if (!Number.isFinite(theta) || !Number.isFinite(beta)) continue

      // Blend against the animated pose. Clamp the correction so a bad target
      // can never fold a leg through the body.
      const dLeg = clamp(wrapPi(theta - leg.rotation.z), -IK_MAX_CORRECT, IK_MAX_CORRECT)
      const dShin = clamp(wrapPi(beta - shin.rotation.z), -IK_MAX_CORRECT, IK_MAX_CORRECT)
      leg.rotation.z += dLeg * w
      shin.rotation.z += dShin * w
    }
  }

  // ==========================================================================
  // ROOT MOTION
  //
  // A clip flagged `root:true` has its hips XZ translation treated as travel
  // rather than as a pose: the delta is accumulated here and the hips are
  // written back at their rest XZ. The owner drains it with consumeRootMotion()
  // and moves the fighter body by it. Y is left alone — vertical hip travel is
  // squash and stance, not locomotion.
  // ==========================================================================

  /** Drain the accumulated root delta into `out` (a {x,y,z}), returns `out`. */
  consumeRootMotion(out) {
    const r = this._rootMotion
    if (out) { out.x = r.x; out.y = r.y; out.z = r.z }
    r.x = 0; r.y = 0; r.z = 0
    return out
  }

  /** Locomotion speed sync — the cheapest, most effective anti-skate there is.
   *  `speed` m/s, `stride` metres covered by one full cycle of the clip. */
  setLocomotion(speed, stride) {
    const sp = Number.isFinite(speed) ? Math.abs(speed) : 0
    this._locoRate = sp
    if (!(stride > 0.05)) return 1
    const d = this.clip?.duration
    if (!(d > 0)) return 1
    return clamp((sp * d) / stride, 0.35, 2.2)
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  update(dt) {
    if (!(dt > 0)) dt = 0
    this.time += dt * this.speed
    let alpha = 1
    if (this.fading) {
      this.fadeTime += dt
      if (this.fadeTime >= this.fadeDur) this.fading = false
      else alpha = this.fadeDur > 0 ? Math.min(1, this.fadeTime / this.fadeDur) : 1
    }
    const clip = this.clip
    const t = clip ? this._clipTime() : 0
    const autoEase = !!clip?.ease
    const tracks = clip ? this._tracksFor(clip) : null
    const smart = this.interp === 'auto' && clip && clip.interp !== 'linear'
    const slerpFade = smart

    // --- layers first: they only need scalars, and the pose write below
    //     folds them in so every bone is written exactly once.
    if (this.layersOn) this._updateLayers(dt)

    const rootClip = !!(clip && clip.root)
    const list = this.list
    const rot = this._rot, pos = this._pos, scl = this._scl
    const addR = this.layersOn ? this._addR : null
    const addP = this.layersOn ? this._addP : null

    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      const o = i * 3
      let rx = this._restR[o], ry = this._restR[o + 1], rz = this._restR[o + 2]
      let px = this._restP[o], py = this._restP[o + 1], pz = this._restP[o + 2]
      const writeScl = this._sclFlag[i] === 1
      let sx = this._restS[o], sy = this._restS[o + 1], sz = this._restS[o + 2]
      const track = tracks ? tracks[i] : null
      if (track) {
        const rest = this.rest[this.names[i]]
        const flags = smart
          ? sampleSmart(track, t, rest, clip, rot, pos, scl)
          : sampleLegacy(track, t, rest, autoEase, rot, pos, scl)
        rx = rot[0]; ry = rot[1]; rz = rot[2]
        if (flags & 1) { px = pos[0]; py = pos[1]; pz = pos[2] }
        if (flags & 2) { sx = scl[0]; sy = scl[1]; sz = scl[2] }
      }

      // --- root motion extraction (hips only) ---
      if (rootClip && b === this.bones.hips) {
        const rp = this._rootPrev
        if (rp.has) {
          this._rootMotion.x += px - rp.x
          this._rootMotion.z += pz - rp.z
        }
        rp.x = px; rp.y = py; rp.z = pz; rp.has = true
        px = this._restP[o]
        pz = this._restP[o + 2]
      }

      // --- crossfade from the pose captured at the switch ---
      if (alpha < 1) {
        if (slerpFade) {
          slerpEuler(this._fadeR[o], this._fadeR[o + 1], this._fadeR[o + 2], rx, ry, rz, alpha, rot)
          rx = rot[0]; ry = rot[1]; rz = rot[2]
        } else {
          rx = lerp(this._fadeR[o], rx, alpha)
          ry = lerp(this._fadeR[o + 1], ry, alpha)
          rz = lerp(this._fadeR[o + 2], rz, alpha)
        }
        px = lerp(this._fadeP[o], px, alpha)
        py = lerp(this._fadeP[o + 1], py, alpha)
        pz = lerp(this._fadeP[o + 2], pz, alpha)
        if (writeScl) {
          sx = lerp(this._fadeS[o], sx, alpha)
          sy = lerp(this._fadeS[o + 1], sy, alpha)
          sz = lerp(this._fadeS[o + 2], sz, alpha)
        }
      }

      // --- additive layers ---
      if (addR) {
        rx += addR[o]; ry += addR[o + 1]; rz += addR[o + 2]
        // v3.4: all three position channels. The sway and torque layers travel
        // the pelvis laterally and forward, not just vertically; before this,
        // x and z were allocated but never read.
        px += addP[o]; py += addP[o + 1]; pz += addP[o + 2]
      }

      b.rotation.set(rx, ry, rz)
      b.position.set(px, py, pz)
      if (writeScl) b.scale.set(sx, sy, sz)
    }

    // Springs and IK read the pose that was just written, and add to it.
    if (this.secondaryOn) this._updateSprings(dt)
    if (this.ikOn || this._ikW > 0) this._updateIK(dt)
  }
}

