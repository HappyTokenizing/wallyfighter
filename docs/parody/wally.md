# WALLY — parody-likeness build brief

**Fighter:** `src/characters/wally.js` · `WallyDef` · `id: 'wally'`
**Source archetype:** the world's largest asset manager, personified — the giant-institution CEO
crossed with an elephant mascot, dressed in the visual language of finance (bespoke charcoal,
pinstripes, boardroom brass, the charging-bull swagger).
**Contract authority:** `GRAPHICS_CONTRACT.md` §9 (parody mandate), §3/§4 (surfaces & materials),
§0 (albedo range, tri/draw budget), `CONTRACTS.md` §4 (rig — do not change).
**Author:** character-art-direction research pass, July 2026. Every number below is derived from a
cited anatomy source, a cited tailoring source, or from arithmetic on the existing rig. Build to the
numbers, not to the adjectives.

### Axis convention (get this right first)
The rig faces **+X**. In this file and in the existing code, `box(w,h,d)` means
**w → X (forward/depth), h → Y (up), d → Z (lateral width)**. Ears sit at `z = ±…`.
Feet at `y = 0`. `def.height = 2.0`. All metre values below are in this space.

### Rig is frozen — and so are the bind-pose pivots
`buildModel(costume)` must keep returning exactly these bone names, in this hierarchy:

```
group > hips > { tail, legL, legR, torso }
torso > { head, armL > forearmL, armR > forearmR }
head  > { earL, earR, trunk > trunk2 > trunk3 }
```

15 bones. 31 clips and 19 move scripts key off them. **This brief additionally freezes every bind-pose
pivot offset**, because the move scripts' reach constants were tuned against them and re-tuning 19
scripts is not in scope for a visual overhaul:

| Bone | local offset (parent-relative) | world y in bind |
|---|---|---|
| `hips` | `(0, 0.92, 0)` on `group` | **0.920** |
| `torso` | `(0, 0.10, 0)` on `hips` | **1.020** |
| `head` | `(0.06, 0.62, 0)` on `torso` | **1.640** (x = +0.06) |
| `armL/R` | `(0.02, 0.42, ±0.46)` on `torso` | **1.440** |
| `forearmL/R` | `(0, −0.34, 0)` on arm | **1.100** |
| `legL/R` | `(0, −0.02, ±0.20)` on `hips` | **0.900** |
| `trunk` | `(0.28, −0.04, 0)` on `head` | **1.600** (x = +0.34) |
| `earL/R` | `(−0.04, 0.14, ±0.26)` on `head` | **1.780** (z = ±0.26) |
| `tail` | `(−0.30, 0.06, 0)` on `hips` | **0.980** |

Rebuild the *geometry* around these pivots. Do not move them. Nothing may be parented directly to
`group` — `Gore._detach()` clones a bone's whole subtree and hides the original, and that is the only
mechanism by which props survive dismemberment (§7).

The `bent()` static-wrapper trick stays: every animated bone starts at rotation `(0,0,0)` in bind, and
any baked rotation lives in a non-animated `Group` between the bone and its meshes. All the new
curvature in this brief (trunk arc, tusk sweep, ear cant, lapel roll) is baked that way.

**If two numbers in this file disagree, the §2 landmark table and §3.0 win.**

---

## 1. The 2-second test

**A grey elephant head the size of a filing cabinet, worn on top of a charcoal double-breasted suit —
two enormous pale-backed fan ears flared out past the shoulder line, a heavy segmented trunk hanging
straight down the centre of the chest and crossing the buttoned jacket front, two short blunt cream
tusks bracketing it, and one unbroken black wraparound lens band across the brow with a green
rising-chart tick burning inside it. Calm. Vertical. Enormous. Wearing more suit than any animal
should be able to afford.** That is the read.

Four things in that sentence are load-bearing and are the ones builds get wrong:

1. **The trunk hangs DOWN and crosses the jacket.** It is the vertical spine of the whole silhouette
   — a 0.86 m column dropping from the face to below the sternum, dead centre, overlapping the
   buttoned front of the coat. The current build curls it forward into a snout-stub; that reads as a
   tapir. The trunk must be the longest single unbroken shape on the figure, and it must break the
   jacket's front panel line. If the trunk does not overlap the suit, the two halves of the joke are
   not touching each other.
2. **The ears are the widest thing on the character — wider than the padded shoulders.** Ear tip to
   ear tip is **1.28 m (0.64 H)**; the suit's shoulder span is **1.10 m (0.55 H)**. That 0.09 m
   overhang per side is what makes the head read as a head and not as a lump on a torso, because this
   animal has **no visible neck** (§2 negative space). Elephants that read as elephants at distance
   read on ear span. Get the ears too small and you have built a hippo in a suit.
3. **The suit is TAILORED, not draped.** Real peak lapels with a roll, a real 6×2 button stance with
   worked holes, a real barchetta breast pocket with a two-point silk square, a real cutaway shirt
   collar and a real Windsor knot — all at **elephant scale**, so a lapel is 0.26 m wide and reads at
   128 px as a genuine shape and not as a painted V. A hoodie-with-a-collar-decal fails the brief.
   The gag only lands if the tailoring is *good* and the body inside it is *wrong*.
4. **The colour read is a two-value read: cool grey hide against near-black charcoal wool, 7.8:1.**
   (§5.) Nothing else on the model may compete with that step at large area. The gold, the oxblood
   tie, the amber pocket square and the green lens glint are all small-area accents that punch out of
   it — they are the *confirmation*, not the *identification*.

Second beat, half a second later: the **stillness**. Every other fighter in the roster is doing
something. Wally is standing with his weight evenly on two column legs, shoulders level, head carried
0.06 m forward of the shoulder line, trunk swinging through a slow lazy figure-eight and ears fanning
at 0.55 Hz. He is not braced. He is not crouched. He is waiting for the market to come to him. That
posture is half the character.

**The single most common failure mode**, from the current build: a grey rounded blob with a stub
trunk, two disc ears stuck on flat, and no suit at all below the head — i.e. a generic low-poly
elephant. If a viewer cannot see *tailoring* in the silhouette (lapel notch, shoulder line, skirt
vent, cuff break), the parody has not been built, only the animal.

---

## 2. Silhouette specification

Total silhouette height **2.00 m**. Head height (dome crown → underside of the jaw, trunk and ears
excluded) **0.500 m** → the figure is exactly **4.0 head-heights**. That is deliberately squat and
head-dominant: a 7-head hero proportion turns this into a man in an elephant mask. Head width across
the cranium, ears excluded, **W_s = 0.440 m** — the head is **1.14× taller than it is wide**, which is
the opposite of the ape's proportion and is itself an identification cue. Elephant skulls read *tall*.

### Vertical landmark table (feet at y = 0) — AUTHORITATIVE

Every number in §3 derives from this table via `head`-local y = world y − 1.640 (§3.0). If a number
elsewhere in this file disagrees with this table, **this table wins**.

| Landmark | world y (m) | `head`-local y | fraction of H (2.00) | head-heights from floor |
|---|---|---|---|---|
| **Dome crown (silhouette top)** | **2.000** | +0.360 | 1.000 | 4.00 |
| Ear rolled-border crest (highest ear point) | 1.975 | +0.335 | 0.988 | 3.95 |
| Twin-dome saddle (midline groove floor) | 1.940 | +0.300 | 0.970 | 3.88 |
| Ear bone pivot | 1.780 | +0.140 | 0.890 | 3.56 |
| Brow shelf top edge / shade top bar | 1.760 | +0.120 | 0.880 | 3.52 |
| Shade lens band centre | 1.712 | +0.072 | 0.856 | 3.42 |
| **Eye aperture centre line** | **1.700** | **+0.060** | 0.850 | 3.40 |
| Temporal fossa centre | 1.706 | +0.066 | 0.853 | 3.41 |
| Zygomatic / cheek widest | 1.595 | −0.045 | 0.798 | 3.19 |
| Jowl lower edge (buccal mass bottom) | 1.454 | −0.186 | 0.727 | 2.91 |
| `head` bone pivot | 1.640 | 0.000 | 0.820 | 3.28 |
| **Trunk root (`trunk` pivot)** | **1.600** | −0.040 | 0.800 | 3.20 |
| Acromion — top of the padded shoulder | 1.575 | — | 0.788 | 3.15 |
| Tusk emergence (alveolus lip) | 1.530 | −0.110 | 0.765 | 3.06 |
| Mouth aperture line | 1.520 | −0.120 | 0.760 | 3.04 |
| **Chin / underside of the lower jaw** | **1.500** | −0.140 | 0.750 | 3.00 |
| Gorge notch (collar↔lapel seam) | 1.500 | — | 0.750 | 3.00 |
| Shirt collar point tips | 1.470 | — | 0.735 | 2.94 |
| Tie knot centre | 1.452 | — | 0.726 | 2.90 |
| Lapel peak-point tips | 1.462 | — | 0.731 | 2.92 |
| `armL/R` bone pivot | 1.440 | — | 0.720 | 2.88 |
| Top (decorative) button row | 1.420 | — | 0.710 | 2.84 |
| Pocket-square upper point | 1.425 | — | 0.713 | 2.85 |
| Breast-pocket welt (barchetta) | 1.380 | — | 0.690 | 2.76 |
| Ear lower-lobe tip | 1.355 | — | 0.678 | 2.71 |
| Tusk tip | 1.360 | −0.280 | 0.680 | 2.72 |
| Tusk axis lowest point | 1.336 | −0.304 | 0.668 | 2.67 |
| Chest apex (deepest coat front, x = **+0.392**) | 1.320 | — | 0.660 | 2.64 |
| Middle button row / lapel break (roll-line end) | 1.280 | — | 0.640 | 2.56 |
| **Bottom (fastening) button row / waist** | **1.140** | — | 0.570 | 2.28 |
| Vent top | 1.160 | — | 0.580 | 2.32 |
| `forearmL/R` bone pivot | 1.100 | — | 0.550 | 2.20 |
| **Trunk tip (idle hang)** | **0.962** | — | 0.481 | 1.92 |
| `hips` bone pivot | 0.920 | — | 0.460 | 1.84 |
| `legL/R` bone pivot | 0.900 | — | 0.450 | 1.80 |
| Jacket skirt hem | 0.880 | — | 0.440 | 1.76 |
| Knuckle (arms hanging, idle) | 0.640 | — | 0.320 | 1.28 |
| Knee | 0.520 | — | 0.260 | 1.04 |
| Trouser cuff hem | 0.210 | — | 0.105 | 0.42 |
| Top of the foot-pad swell | 0.140 | — | 0.070 | 0.28 |
| Toenail top edge | 0.075 | — | 0.038 | 0.15 |
| Sole | 0.000 | — | 0.000 | 0.00 |

> **Rig-consistency gate (a closed chain — change one, recompute all four).**
> Shoulder pivot 1.440 − upper arm 0.340 = forearm pivot 1.100 ✓ (matches the frozen `forearm` offset
> of −0.34). Forearm pivot 1.100 − forearm 0.300 − hand 0.160 = knuckle 0.640. Hip 0.920 − femur
> 0.400·cos 5° = knee 0.522 → **0.520**. Knee − tibia 0.360·cos 3° = ankle 0.161 → foot-pad top
> **0.140** after the pad's 0.021 of compression in bind. If you move any of these, re-verify the reach
> constants in all 19 move scripts against the existing harness (`GRAPHICS_CONTRACT.md` §9).

### Lateral (Z) landmark table

| Landmark | half-width (±z) | full span | fraction of H |
|---|---|---|---|
| **Ear rim, outermost (bind, half-flared)** | **±0.636** | **1.272** | **0.636** |
| Padded shoulder, outer face of the sleeve head | ±0.550 | 1.100 | 0.550 |
| Belly at its widest (y = 1.10) | ±0.480 | 0.960 | 0.480 |
| Coat FRONT face, chest (y = 1.32), depth in X | +0.392 | — | — |
| Trunk FRONT face at the same height, depth in X | +0.515 | — | — |
| Coat across the chest (y = 1.32) | ±0.460 | 0.920 | 0.460 |
| Hip / skirt of the coat (y = 0.90) | ±0.440 | 0.880 | 0.440 |
| Foot, outer edge | ±0.390 | 0.780 | 0.390 |
| Ear bone pivot | ±0.260 | 0.520 | 0.260 |
| Stance track (foot centres) | ±0.240 | 0.480 | 0.240 |
| **Zygomatic / jowl, widest** | **±0.245** | **0.490** | **0.245** |
| Cranium (W_s), temporal line y 1.706 | ±0.220 | 0.440 | 0.220 |
| Leg column, mid-shin | ±0.150 | 0.300 | 0.150 |
| Trunk, at the root | ±0.120 | 0.240 | 0.120 |
| Trunk, at the tip | ±0.050 | 0.100 | 0.100 |

**The single most important line in this table: the ears (1.272) are wider than the shoulders (1.100)
by 0.086 m per side.** That overhang is the elephant read. It is only 5.5 px at 128 px — so it is a
*minimum*, not a target. If the suit's shoulder padding grows during the build, the ears grow with it.

### Where the mass sits
- **Head block (crown 2.000 → ear-lobe tip 1.355) = 0.645 m = 32% of the height, and roughly 40% of
  the perceived visual mass** once the ear span is counted. This is a top-heavy design and it must
  stay that way. The suit must not out-mass the head.
- **Above-waist (y > 1.140) vs below ≈ 58 : 42 by projected silhouette area**, despite the waist
  sitting at 0.57 H — because the upper body is 0.92–1.27 m wide and the legs together only occupy
  0.78 m. Heavy chest, columnar base, low centre of gravity.
- The figure is a **column with a lintel on top**: from the front it reads as a wide flat-topped T
  (the ear bar) sitting on a barrel, sitting on two posts. Do not let the arms fill the gap between
  the barrel and the posts.
- **Depth (X) matters more here than on any other fighter.** From the side he is 0.91 m deep at the
  chest (coat front x = +0.392, coat back x = −0.50) against a 2.00 m height — he is *thick*. The
  trunk's axis runs x +0.34 → +0.478 and its forward wall x +0.44 → +0.53, i.e. 0.08–0.19 m proud of
  the coat front, so in profile it reads as a separate vertical column against the background rather
  than as a stripe drawn on the coat. **Protect that: this is the character's second-biggest
  silhouette asset after the ear bar, and it is the one the side-on game camera actually renders.**

### Must survive filled-black at 128 px

At 128 px for a 2.00 m figure the scale is **1 px = 0.015625 m** — a clean 64 px per metre. Every
claim below is given in both metres and pixels so it can be checked in a screenshot rather than argued
about.

1. **The ear bar.** Both ears must read as one wide horizontal event across the top of the figure:
   each ear projects **0.416 m (26.6 px) clear of the cranium wall** and **0.086 m (5.5 px) clear of
   the shoulder**. Between y = 1.575 (shoulder top) and y = 1.975 (ear crest) the ear is isolated
   against background from z = ±0.22 out to ±0.636 — a **0.416 × 0.400 m (26.6 × 25.6 px) clear
   rectangle of ear on each side.** That block is the biggest single silhouette asset the character
   has. *The ear is not a disc:* its trailing edge is fluted and torn (§3.7), which at 128 px is
   sub-pixel but which at 1 m is what stops it reading as a cartoon circle.
2. **The trunk column.** From the trunk root (1.600) to the tip (0.962) the trunk covers **0.638 m
   (40.8 px) of vertical run**, tapering **0.240 → 0.100 m (15.4 → 6.4 px)** in width. It must stay
   proud of the coat front in profile by **≥ 0.090 m (5.8 px)** along its whole length, and its
   lateral edges must stay clear of both tusks. If the trunk is shorter than 0.55 m of vertical drop
   it stops reading as a trunk and starts reading as a snout.

   > **ROUND-4 REVISION, and the reason.** This clause used to ask for 0.045 m (2.9 px) and the build
   > delivered 0.051–0.073 m. Both numbers were wrong, because both were derived from the *lateral*
   > table — the belly at ±0.480 and the chest at ±0.460 keep the coat's front panel far wider than
   > the trunk, so no amount of trunk makes the trunk break the **front** outline, and the clause
   > quietly settled for a depth clearance small enough to be a value event instead. The game camera
   > is side-on. In the view that actually ships, 3 px of bulge on the front edge of a 0.9 m slab is
   > not an event: a hostile reviewer scored the trunk as a stripe painted on the coat, and was right.
   >
   > **The 128 px silhouette test wins over the landmark it contradicts.** The coat's front panel is
   > pulled back 0.030 m across its full width (COAT_RINGS keep their rear face exactly where it was,
   > so the character's back line and the 0.94 m chest depth budget are unchanged — he is 0.91 m deep
   > now, and the 0.03 came off the front, where the tailoring is flat anyway) and the trunk's bind
   > curvature swings 0.100 rad further forward (`TRUNK_BAKE` +0.400/+0.200/+0.040; clips are
   > re-baked automatically, so no frame's world pose moved). Measured on the built mesh, the trunk's
   > forward wall now stands **0.080–0.190 m (5.1–12.1 px)** clear of everything else on the torso,
   > with the long straight run from 0.93 to 1.27 — 21 px of vertical travel — at 7.1–12.1 px.
   >
   > What it costs: the idle tip lands at world y **0.962** instead of 0.950 (0.8 px high — the
   > distal segment hangs 2.3° off plumb, still inside §3.6's 3° test) and the chest apex moves from
   > x +0.44 to **+0.392**. Both tables above now say so. Everything that lives on the coat front —
   > lapels, roll, under-lapel, pick stitching, chalk stripes, all six buttons, tie bar, tie, shirt,
   > collar, pocket square, breast welt, boutonnière, jigger, hip pockets, hem facing, chain — moved
   > back by the same 0.030 m, so nothing floats.
3. **The tusk pair.** Each tusk is **0.34 m (21.8 px) of arc**, base diameter **0.075 m (4.8 px)**.
   The tusk tips must clear the trunk's lateral profile by **≥ 0.065 m (4.2 px) on each side** —
   otherwise the three shapes merge into one lump and the tusks are gone. Tusk tips at
   **z = ±0.175, y = 1.348, x = +0.475** — i.e. they end *forward of* and *below* the trunk's root, and
   *outboard of* the trunk's wall.
4. **The lapel/shoulder line.** The jacket must break the body's outline: (a) the shoulder pad's outer
   corner is a **hard 0.045 m (2.9 px) step** proud of the arm below it; (b) the **gorge notch** cuts a
   V of **0.055 m (3.5 px) depth** into the coat's upper edge at y = 1.500; (c) the **skirt hem at
   y = 0.880 is a hard horizontal terminus, 0.880 m (56.3 px) wide.** That hem is the single clearest
   "this animal is wearing clothes" cue at 128 px, and it costs nothing. Do not let a fur/hide skirt
   soften it.
5. **The trouser break and the foot.** The trouser cuff terminates at **0.210 m (13.4 px)**, and below
   it **0.210 m (13.4 px) of bare grey foot** with a **0.780 m (49.9 px)** combined footprint. The foot
   must be visibly *wider than the leg* — pad width 0.300 m vs shin 0.300 m at the same z... it is not,
   so widen the pad: **pad 0.330 m across (21.1 px) against a 0.300 m shin**, a 0.015 m step per side.
   A column that runs straight into the floor with no foot reads as furniture.
6. **The shade band.** 0.460 m × 0.100 m (29.4 × 6.4 px) horizontal black bar across the brow. At
   128 px this is a *value* event, not a silhouette event (it does not break the outline) — it is
   listed here so nobody thickens it into a helmet trying to force a silhouette read. Its job starts
   at 1 m.
7. **The cheek and jowl (ROUND-4, new).** The band between the shade band's lower edge (1.664) and
   the gorge (1.500) used to contain nothing but trunk root and tusk: the head's only mass out there
   was the same ±0.205 wall the cranium already was, so the tusks were laid against a flat plane and
   the face had no cheeks. There is now a real zygomatic/buccal swell per side reaching **z ±0.245
   at y 1.595** and a jowl hanging under it to **y 1.454**, with a modelled buccal crease between
   them. **This deliberately costs 0.025 m per side against §3.0's cranium.** §3.0 measures W_s at
   the *temporal* line (y 1.706) and that is untouched at ±0.220, so the head is still 1.14× taller
   than its cranium is wide — but the head now widens below the eyes and narrows again into the jaw,
   which is what an elephant skull does and what gives each tusk a lit form to be bracketed by.
   Three shapes with two slots of background (negative space B) instead of one lump.

### Negative space (this is what actually defines the shape)

This character **has no neck.** Asian elephants carry the head directly on the shoulders and the
highest point of the body is the head, not the withers. So the head/body separation that a neck-lens
would normally provide has to come from somewhere else, and it comes from these four voids:

- **A — the two shoulder-to-ear wedges.** Bounded by the outboard face of the shoulder pad
  (z = ±0.550, rolling over from y = 1.575), the underside of the ear's lower-rear lobe, and
  background. In the front view this is a modest notch; in the ¾ and profile views — i.e. the views
  the game actually renders — it is a large open wedge, because the ear's lobe sits at **x ≈ −0.22**
  while the shoulder's mass runs from x = −0.25 to +0.30. **Minimum 0.070 m (4.5 px) of background
  must remain visible in this wedge in the ¾ idle pose.** Do not fill it with a collar, a shoulder
  cape, a fur ruff, or an ear that has been rotated flat back against the body. This is the void
  that stops Wally becoming a monolith.
- **B — the two trunk-to-tusk slots.** Between the trunk's lateral wall (±0.120 at the root, less
  below) and the inner face of each tusk (z = ±0.175 at the tip, ±0.115 at the alveolus). The slot is
  **0.055–0.065 m (3.5–4.2 px)** and it opens downward as the tusks curve away. Three long vertical
  shapes with two slots of background between them is a far better silhouette than one lump, and it
  is the specific arrangement that says *elephant* rather than *large grey animal*.
- **C — the arm-to-barrel gap.** Never closes below **0.075 m (4.8 px)** at y = 1.20 in the idle pose.
  The arms hang *away* from the body. This is the only thing separating the sleeve (charcoal) from the
  coat body (charcoal) — they are the same value, so the gap must do all the work.
- **D — the leg gap.** **0.160 m (10.2 px)** of clear background between the two leg columns at knee
  height (y = 0.520), widening to 0.180 m at the cuff. The jacket skirt stops at 0.880 and must never
  bridge it. This is why the coat has a **short skirt** (0.260 m from waist to hem) rather than a
  frock coat.
- **E — the buttonhole through the lapel.** The working boutonnière on the left lapel is a genuine
  0.028 m slot with air behind it. It is 1.8 px and invisible at 128 px; it is here because at 30 cm
  it is one of the three details that make the tailoring read as *real* tailoring (§6 micro-detail).

**Negative space that must NOT appear:** any gap at a joint. The contract forbids it and this
character is the worst offender in the current build (`sph` hand floating below a `cyl` forearm).
Every joint gets sleeved: shoulder inside the jacket's sleeve head, elbow inside the sleeve, wrist
inside a **French cuff**, knee inside the trouser leg, ankle inside the trouser break, trunk segments
inside overlapping ring collars (§3.6), ear root buried 0.035 m inside the skull surface.

---

## 3. Head construction (the most important section)

### 3.0 The head frame — read this before touching a number

All coordinates in §3 are **`head`-bone-local** unless the world value is given. The `head` pivot sits
at world **(+0.06, 1.640, 0)**. Therefore:

```
head-local x = world x − 0.060      (x is FORWARD)
head-local y = world y − 1.640
head-local z = world z             (the head pivot is on the centreline)
crown = +0.360     chin = −0.140     H_h = 0.500
```

Two master units, used everywhere below:
- **W_s = 0.440 m** — cranium width, ears excluded. Master unit for everything horizontal.
- **H_h = 0.500 m** — head height, dome crown → jaw underside, ears and trunk excluded. Master unit
  for everything vertical.

**The one ratio to internalise:** on an ape head the eye aperture is ~0.34 × W_s. On this head it is
**0.141 × W_s**. Elephant eyes are tiny relative to an enormous skull — a real elephant's eye is about
3.8 cm across on a head over a metre tall, i.e. under 1% of head area. We exaggerate that by ×1.6 for
readability and it is *still* the smallest eye on the roster. **If Wally ends up with big expressive
eyes, the head has failed**, because the skull is large for a reason that has nothing to do with the
brain: elephant skulls are inflated by honeycombed air sinuses that reduce weight while keeping the
surface area needed to anchor the trunk and tusk musculature. The head is a *structure*, not a face.

### 3.1 The midline profile — build this curve first

Everything else hangs off the sagittal (z = 0) silhouette. Head-local, x forward, y up. The front
half, crown → trunk root:

| # | x | y | what happens here |
|---|---|---|---|
| F0 | −0.010 | **+0.360** | dome crown, the silhouette apex |
| F1 | +0.075 | +0.330 | forward face of the domes begins |
| F2 | +0.130 | +0.270 | dome front, maximum forward bulge of the forehead |
| F3 | +0.152 | +0.200 | dome falls away |
| F4 | **+0.148** | +0.140 | **the profile goes BACKWARD 0.004 m — a concave step** |
| F5 | +0.156 | +0.100 | brow-shelf front face (the shades' top bar sits here) |
| F6 | +0.170 | +0.060 | eye line / lens band |
| F7 | +0.198 | +0.010 | face plane falling to the trunk root |
| F8 | +0.240 | −0.040 | trunk root front lip — the trunk takes over from here |

And the back half, crown → jaw:

| # | x | y | |
|---|---|---|---|
| B1 | −0.120 | +0.320 | |
| B2 | −0.196 | +0.220 | |
| B3 | **−0.219** | +0.100 | occiput, the rearmost point of the head |
| B4 | −0.200 | ±0.000 | |
| B5 | −0.160 | −0.100 | |
| B6 | −0.120 | −0.140 | jaw underside / chin |

**F3→F4→F5 is the whole game.** That 0.004 m concavity between the forehead dome and the brow shelf
is the *supraorbital notch*, and it is the only thing that makes the profile read as elephant rather
than as a grey egg. It is 0.26 px at 128 px — invisible — but it produces a **hard terminator line
across the forehead under a key light from above**, and that dark line is what the eye picks up. Build
the geometry, not the shadow.

### 3.2 Cranium and the twin dome

- **Base primitive:** `IcosahedronGeometry(0.220, 3)` (or a 28×20 sphere), scaled
  **(0.86 X, 1.11 Y, 1.00 Z)**, centred at **(−0.030, +0.115, 0)**.
  Resulting half-extents: **X ±0.189** (front +0.159, back −0.219 = B3 ✓), **Y ±0.244** (top +0.359 ≈
  crown ✓, bottom −0.129), **Z ±0.220 → width 0.440 = W_s ✓**.
- The ellipsoid centre sits at y = +0.115, i.e. **0.055 above the eye line** — the widest part of the
  skull is just above the eyes, at the zygomatic/temporal junction, and it narrows both upward toward
  the domes and downward toward the jaw. Do not centre it on the eye line (that is the ape rule) and
  do not centre it high (that reads as a bulbous cartoon head).
- **The twin dome.** Asian elephants carry two hemispherical frontal bulges where African elephants
  have a single rounded forehead. We take the Asian dome because it gives the head a memorable,
  non-generic top and it gives the sunglasses a shelf to sit under.
  - Two spheres **r 0.135**, scaled **(0.92, 0.85, 0.90)**, centred at **(−0.010, +0.245, ±0.082)**.
    Each dome's apex reaches **+0.360** ✓ and each is 0.248 m wide, so the pair spans z ±0.206 —
    just inside W_s, leaving 0.014 m of skull outboard of each dome. That margin must survive.
  - **Midline sagittal groove** between them: **0.055 m wide × 0.028 m deep**, running from the crown
    (+0.360) down the forehead **0.260 m** to the brow shelf (+0.100), floor filleted at **r 0.020**.
    Cross-section is a rounded V, not a slot. This groove is the single detail that says "twin dome"
    and it reads as a hard dark vertical line down the centre of the face under any overhead key.
  - The groove **does not continue over the crown to the back of the skull** — it stops at +0.355.
    A groove that runs all the way over reads as a helmet seam.
- The skull narrows upward outside the domes: at y = +0.280 the width outboard of the domes has closed
  to **0.412 m (0.94 × W_s)**; at +0.340 to **0.300 m**.
- **No sagittal crest, no occipital flare.** Those read as gorilla and as bull respectively; both are
  taken by other fighters on this roster.
- Bevel every silhouette edge at **0.010 m, 2 segments**.

### 3.3 Brow shelf, temporal fossa and brow behaviour

- **Brow shelf (supraorbital torus):** a continuous bevelled bar crossing the midline. Front face at
  **x = +0.156**, top edge **y = +0.120**, underside lip **y = +0.088**, span **Z 0.400** (0.91 × W_s),
  depth 0.062 in X. Rotate **−5° about Z** so it overhangs. Chamfer **0.012, 3 segments**. Its rear
  face (x = +0.094) is buried 0.065 m inside the cranium — that overlap welds it seamlessly.
- Two overhang numbers, do not conflate them:
  - the shelf's **front face (+0.156)** sits **0.002 m behind the eyeball's forward pole (+0.158)** —
    i.e. the eye is essentially flush with the brow, not recessed like an ape's;
  - the shelf's **underside lip (+0.088)** sits **0.028 m above the eye centre (+0.060)**, and it is
    where the **sunglasses' top bar physically rests** (§7.1). The shades are not floating — they sit
    on a modelled ledge.
- **Temporal fossa.** A concave depression behind and slightly above each eye, **0.090 m across ×
  0.026 m deep**, centred at **(+0.075, +0.066, ±0.190)**, its floor filleted at r 0.030. In a real
  elephant this hollow deepens with age and contains the temporal gland, which sits just behind the
  eye. Build the hollow; it is a superb light-catcher and it makes the head look boned rather than
  inflated.
- **Temporal gland orifice.** Inside each fossa, a **0.014 m tall × 0.004 m wide vertical slit,
  0.004 m deep**, at (+0.070, +0.058, ±0.192). Two black ticks either side of the head. Cheap, real,
  and it gives §8 a hook: on the KO and on `bull-market-mode` it weeps a dark streak down the cheek
  (musth), which no other fighter can do.
- **Brow behaviour.** Elephants have no eyebrow hair — the brow is a **mobile supraorbital skin fold**
  that lifts and bunches. Build a **brow pad** over each eye: a soft ridge **0.075 m wide × 0.022 m
  tall × 0.014 m proud**, driven by a vertex morph (no new bones):
  - `browLift` +0.014 m, bunching into **3 transverse creases 0.004 m deep** — used for the
    "interested / calculating" beat and for `hitLight`.
  - `browDrop` −0.010 m with a **12° inward cant** on the medial ends — the anger pose. This is the
    only anger the face has, because the eyes are behind lenses and the mouth is tiny (§8.1).

### 3.4 Eyes

Numbers, in order of importance:

| Property | Value | As a ratio |
|---|---|---|
| Aperture width (visible slot between the lids) | **0.062 m** | **0.141 × W_s** |
| Aperture height, idle | **0.026 m** | 0.42 × aperture width |
| Eyeball sphere radius | **0.030 m** | 0.068 × W_s |
| Eye centre, lateral | **z = ±0.155** | **±0.352 × W_s** (pair span 0.70 × W_s) |
| Eye centre, vertical | **y = +0.060** (world 1.700) | 0.400 × H_h above the chin |
| Eye centre, forward | **x = +0.128** (front pole +0.158) | — |
| Upper-lid coverage, idle | **44%** of the eyeball's visible height | — |
| Canthal tilt | outer corner **0.005 m lower** than inner | −4.6° |
| Iris radius | 0.0125 m | 0.40 × aperture width |
| Pupil radius | 0.0055 m | round, not slit |

- **Lateral placement is a species cue.** At ±0.352 × W_s the eyes sit on the *sides* of the head, not
  on its front — an elephant's eye placement gives it a very wide field of view and means that in a ¾
  camera you see one eye almost in profile. **The far eye must remain visible in the ¾ portrait pose**;
  if it disappears behind the trunk root, the eyes have been set too far forward.
- **Build real eye geometry** per contract §9: eyeball r 0.030 (`SCLERA`), iris disc r 0.0125 inset
  0.002 into the front, pupil r 0.0055, and a separate **cornea** sphere **r 0.0315** with the `glass`
  preset over the iris so it carries one crisp specular dot. That dot is the only bright pixel behind
  the lenses and it is what makes the eyes readable *through* the shades at 1 m.
- **Lids are geometry.** Upper and lower lids are lens-shaped shells swept at radius **0.0335** about
  the eyeball centre, **0.005 m thick** so the lid edge takes a lit rim. `openRad = 0` fully open;
  idle sits at **−0.36 rad (44% closed)**; `hitReact` snaps to **−0.06**; KO closes to **−0.92**.
- **Lid shape.** The upper lid edge is a shallow arc with a **0.004 m dip at the outer third** — a
  faint weary droop, far less than the ape's. The lower lid is nearly straight and carries a
  **0.006 m tall fleshy roll** below it (elephants have a heavy lower lid pad).
- **Eyelashes — a top-three read cue, and the reason the sunglasses are funny.** Real elephant lashes
  reach ~12 cm, which relative to the eye is enormous.
  - **Upper lid: 9 lashes per eye.** Length **0.055 m** (0.89 × the aperture width — they are *longer
    than the eye is wide*), root thickness **0.0035 m** tapering to **0.0012 m**, splayed in a fan
    from **−22° to +26°** about the lid normal, each with **0.012 m of upward camber**.
  - **Lower lid: 5 lashes, 0.024 m long.**
  - **Modelled tapered prisms, instanced — never alpha cards.** Alpha cards fringe against the rim
    light and will look like a mistake at 128 px.
  - **The upper lashes MUST protrude below the bottom edge of the lens band** (lens lower edge at
    y = +0.024; the lashes sweep down and out past it by **0.018 m**). Two little fans of lash sticking
    out from under a pair of black wraparound shades is the character's best single gag, and it is
    twenty instanced prisms.
- **Nictitating membrane.** Elephants have a third eyelid and no tear ducts (a harderian gland keeps
  the eye wet instead). Build it: a thin lens-shaped shell **0.004 m thick**, sweeping from the
  **medial canthus** across the eye, 0.70 opacity, roughness 0.18. Used for the slow blink (§8.2) and
  held half-across on the KO. Nobody else on the roster has one.
- **No sclera show at the corners.** Elephant eyes are almost all iris — the visible white is a thin
  crescent at most. Keep `SCLERA` visible over **less than 18%** of the aperture area.

### 3.5 Mouth, lower lip, and the one construction rule people get wrong

**The trunk's ventral wall IS the upper lip.** There is no separate muzzle under the trunk. The most
common elephant-modelling failure is building a snout and then parenting a trunk to it — the result
always reads as a tapir or an anteater. The proximal 0.20 m of the trunk's underside must be
**continuous, unbroken surface** with the upper margin of the mouth. Model them as one lofted shell
and split the mesh only where the `trunk` bone needs to skin.

- **Mouth line** at **y = −0.120 (world 1.520)**, front plane **x = +0.215**, **width 0.160 m =
  0.364 × W_s**. Small. It is a fraction of the face and it sits almost at the chin (0.020 above it).
- **Corners turn up 4°.** Elephants have a faintly upcurved mouth line; Wally's default is
  calm-neutral with exactly that 4° and no more. A wider smile reads as a cartoon and destroys the
  "unbothered institution" beat.
- **Lower lip — build this, it is always omitted.** A long, pointed, prehensile flap projecting
  **0.070 m forward and 0.045 m down** from the mouth line, tapering to a **0.012 m rounded point**,
  with a shallow central groove 0.004 m deep along its top surface. Its underside overhangs the throat
  by 0.024 m, cutting a hard dark line under the jaw — that line is the head/body separator at
  distance, because there is no neck to do the job.
- **Mouth interior:** a wedge cavity 0.055 m deep, `MOUTH`. **No visible teeth ever** — elephant
  molars sit far back and never show. Any tooth geometry in the mouth is wrong.
- **Tongue:** a fat rounded slab **0.090 X × 0.030 Y × 0.060 Z**, `TONGUE`, visible only in `ko` and
  the `advice` joke taunt.
- **Chin:** there is no chin. The jaw underside runs back from the lower lip in an unbroken convex
  curve to B6. Do not model a jawline; elephants do not have one and a jawline is what makes this
  head read as a human in a mask.

### 3.6 The trunk

The longest single shape on the character and the load-bearing read cue. A real trunk contains on the
order of **150,000 muscle fascicles and no bone**, arranged as superficial longitudinal layers over
transverse and radiating internal fibres. That is why it can be simultaneously a crane, a hose and a
finger — and why it must never be modelled as a smooth cone.

**Geometry**

| Property | Value |
|---|---|
| Root (the frozen `trunk` pivot) | head-local **(+0.280, −0.040, 0)** = world (+0.34, 1.600, 0) |
| Total axis arc length | **0.860 m** (= 0.43 H) |
| Segment split (`trunk` / `trunk2` / `trunk3`) | **0.330 / 0.290 / 0.240** |
| Diameter at root | **0.240 m** |
| Diameter at the `trunk2` pivot | **0.190 m** |
| Diameter at the `trunk3` pivot | **0.140 m** |
| Diameter at the tip | **0.100 m** |
| Overall taper | **58%** |
| Tip position, idle | world **(+0.355, 0.950, 0)** |

- **The cross-section is not a circle.** Build it as a rounded triangle with a flat top:
  **Z : X = 1.00 : 0.86** at the root, closing to **1.00 : 0.95** at the tip. The **dorsal surface is a
  broad flattened plane**, not a cylinder crown, and the **ventral surface carries a prehensile
  groove** — a longitudinal channel **0.030 m wide × 0.008 m deep** running the distal **0.55 m**. A
  circular-section trunk reads as plumbing.
- A **dorsal midline ridge 0.018 m wide** runs the whole length, standing 0.003 m proud. The rings
  break over it — they must not run dead straight around the section.

**Baked bind curvature (and the clip fix-up you must do)**

The bind curve lives in the `bent()` static wrappers so the animated bones stay at zero. **New bakes:**

| Wrapper | new rz | old rz (current code) | Δ to add to every clip key on that bone |
|---|---|---|---|
| `trunk` (s1) | **+0.40** | +0.85 | **+0.45** |
| `trunk2` (s2) | **−0.20** | −0.55 | **−0.35** |
| `trunk3` (s3) | **−0.16** | −0.70 | **−0.54** |

Net bind shape: the trunk leaves the face **23° forward of vertical**, straightens through the middle,
and the distal 0.22 m hangs within **2.3° of plumb**. That is a shallow **S** — heavy at the top,
vertical at the bottom. A hard forward hook reads as a proboscis-monkey nose; a dead-straight tube
reads as a hose.

> **ROUND-4: s1 went 0.30 → 0.40 and s2 −0.22 → −0.20.** See §2 item 2 for the whole argument. Short
> version: at 17° the trunk's forward wall cleared the coat by 3–5 px at 128 and therefore read as a
> value patch rather than as one of §2's three vertical shapes. At 23° — with the coat's front panel
> also receding 0.030 m — it clears by 5–12 px and breaks the outline in the side-on view the game
> actually renders. The Δ column above is the number the code's automatic re-bake applies, so no
> clip was re-authored and no frame's world pose changed.

> **This is a breaking change to the visual result of every clip that keys `trunk*`.** The clips store
> rotations *relative to bind*, so re-baking the wrapper re-poses them all. The fix is mechanical:
> **add the Δ in the table above to every `trunk` / `trunk2` / `trunk3` key in `clips`** and the world
> pose of every frame is preserved bit-for-bit. Worked example — `block` currently keys
> `trunk: [0,0,1.8]` against a 0.85 bake (world 2.65); with a 0.30 bake the key must become **2.35**.
> Do this pass mechanically across all 31 clips, then eyeball `idle`, `block`, `trunkSlap`, `tornado`
> and `advice`, which are the five that use the trunk hardest.

**Rings — the detail that makes or breaks it**

Measured counts (Kaufmann & Brecht 2024, §10): adult **Asian** trunks carry ≈**126 major dorsal
wrinkles**, adult **African** ≈**83**; there are significantly more dorsal (mean 77) than ventral
(mean 47); and **spacing tightens toward the tip** — measured wrinkle wavelength in one calf fell from
**5.98 ± 1.43 mm** mid-trunk to **3.29 ± 0.88 mm** distally, with both species converging to ≈**3 mm**
near the tip. Skin at a wrinkle **crest** is ≈1.3 mm thick against ≈0.6 mm in the **trough**.

Scaled and budgeted for us:

- **18 modelled major dorsal/lateral rings** (instanced tapered torus bands), proud **0.006 m at the
  root falling linearly to 0.0025 m at the tip**. A further **44 rings live in the normal map only**.
  Apparent total ≈62 — deliberately below the real 83–126, because more than that aliases at our
  scale.
- **Spacing tightens distally in a geometric progression, ratio 0.935 per ring.** First gap (root)
  **0.082 m**; eighteenth gap (tip) **0.026 m**. Check: 0.082 × (1 − 0.935¹⁸)/(1 − 0.935) = **0.879 m**
  against the 0.860 m arc — within 2%, so trim the last gap. **Evenly spaced rings are the failure
  mode.** The tightening is the single detail that makes this read as a trunk.
- **Ventral rings are fewer and shallower**: **11 modelled**, proud 0.0030 → 0.0015, **offset by half a
  gap** from the dorsal ones so they do not form continuous hoops.
- **Ring profile is asymmetric**: soft crest (fillet r 0.008), sharper trough on the **distal** side
  (fillet r 0.003), because the skin folds toward the tip when the trunk shortens.
- Each segment's collar **overlaps its parent by 0.022 m** so the three bones never open a gap under
  animation. Sleeve, do not butt.

**The tip**

**One dorsal finger and a ventral pad** — the Asian-elephant arrangement (African elephants have two
opposed finger-like processes; Asian have one dorsal finger over a ventral cartilage stump). We take
the single finger deliberately: it reads cleaner at 128 px, and one opposable finger can hold his tie,
a pen or a coin, which is worth more to the character than anatomical purity. It is also a §9
deviation.

- **Dorsal finger:** a tapered blunt cone, **0.048 m long × 0.030 m base × 0.014 m tip**, projecting
  forward-down at **32°** from the trunk axis, root filleted 0.006.
- **Ventral pad:** a cushion **0.045 m across × 0.020 m deep**, face slightly concave (sagitta 0.005),
  with **4 transverse grip creases** 0.003 m deep.
- **Nostrils: two real holes.** Each **0.024 m across**, centres **0.032 m apart**, on the terminal
  face at the finger's base, angled **18° downward**, with **0.020 m of modelled dark interior** and a
  wet specular glint 0.004 m inside. Painted dots make the tip look like a bung.
- **7 sensory bristles** around the tip rim: 0.030 m long, 0.0018 m thick, `BRISTLE`. Instanced.

### 3.7 Ears — the silhouette

**Species decision: African-type ear on an Asian-type head.** African ears are enormous quadrate fans
(up to 2.0 × 1.5 m on a 3.0–3.4 m-tall bull) that carry the whole animal's silhouette at distance;
Asian ears are small, rounded and barely pass the neck. **We need the African ear** — it is the only
version that survives a 128 px silhouette test. We keep the Asian head and back (§3.2, §4.1). The
hybrid is intentional and is listed as deviation **D2** in §9.

**Construction: build the ear as a flat plate in its own frame, then place the frame.**

1. **Plate frame.** In the `earL` static wrapper, map the plate's local axes so that:
   - **+u** (root → free rim) points along world **(−0.52, −0.30, +0.80)** for the left ear
     (mirror z for the right). Unit length ✓.
   - **+v** (up the ear) points along **(+0.55, +0.83, −0.09)** normalised.
   - **+w** = u × v is the plate normal — the ear faces outward, forward and slightly down. This is a
     **half-flare**: 34° off the sagittal plane. Elephants only hold their ears fully perpendicular in
     a threat display, which is exactly what §8.1's `angry` pose does (opens to **62°**, ear span
     **1.52 m**).
2. **Rim polygon**, in plate-local **(u, v)** metres, u = 0 on the root line, v = 0 at the pivot level.
   Loft a plate through this closed loop:

   | pt | u | v | note |
   |---|---|---|---|
   | A | 0.00 | +0.24 | root top; the rolled border starts here |
   | B | 0.16 | **+0.29** | roll crest — the highest point of the ear (world **1.975**) |
   | C | 0.31 | +0.25 | roll ends |
   | D | 0.43 | +0.13 | upper outer corner, fillet r 0.060 |
   | E | **0.47** | −0.04 | **outer widest** → world z **±0.636** |
   | F | 0.44 | −0.20 | |
   | G | 0.36 | −0.31 | |
   | H | 0.22 | **−0.37** | **lower-lobe tip**, pointed, fillet r 0.020 (world **1.355**) |
   | I | 0.08 | −0.33 | |
   | J | 0.00 | −0.22 | root bottom |

   The root line **A→J (u = 0) is buried 0.035 m inside the skull surface** — that overlap is what
   makes the ear weld to the head instead of gapping. Where the rim meets the skull at the ear's
   front-lower quadrant, model a **concave valley 0.020 m deep** rather than leaving a crease.
3. **Thickness taper.** Real pinnae are **1–2 mm thick in the middle and thinner at the tip**. Ours:
   **0.030 m at the root line, 0.012 m at mid-plate, 0.006 m at the rim.** The rim must be thin. A
   uniformly thick ear reads as plywood and kills the whole silhouette.
4. **Rolled dorsal border.** Between A and C the top edge **rolls over laterally** — a swept torus of
   **0.045 m diameter along 0.340 m of arc**, rolling toward the outside of the head. Both African and
   Asian ears carry this fold. It gives the ear a hemmed top edge and it is the difference between
   "ear" and "sheet".
5. **Fluted trailing edge.** Between D and I the free rim is **not** a smooth arc: **5 lobes, each
   spanning ≈0.090 m of rim with a 0.025 m inward sagitta.** Plus **two tears** — a V-notch **0.045 m
   deep at 62% along the arc** and a smaller **0.022 m notch at 31%**. Torn ears are how field
   researchers identify individual elephants; they are the cheapest possible "this is a specific
   animal, not a mascot" cue, and they break the cartoon-circle read at 1 m.
6. **Vascular relief on the back face.** The ear's posterior surface carries a raised vascular tree —
   this is real (the pinna is a radiator, 1–2 mm thick and packed with capillaries). Build it as
   **modelled relief, 5 generations**: a trunk vessel **0.018 m wide** leaving the root, each
   generation **60% of its parent's width**, branching at **38°**, standing **0.004 m proud** at the
   root falling to 0.0008 m at the fifth generation. Under a rim light this is the single most
   expensive-looking detail on the character.
7. **Concha (front) face** is smooth, pale, and **flushed pink** toward the root (`EAR_FLUSH`), with
   **depigmented freckling** (`EAR_FRECKLE`) scattered over the proximal third — real elephants
   develop depigmentation patches on the ears, trunk and neck.

**Silhouette accounting.** Pivot (world −0.04+0.06, 1.780, ±0.26) → outer rim centre lands at
world **(−0.224, 1.640, ±0.636)** ✓ matches §2. Ear plate: 0.47 m along u × 0.66 m along v
→ **1.16 : 1** height-to-chord, against a real African bush ear's 1.33 : 1. We are 13% squarer on
purpose (deviation D2).

### 3.8 Tusks

Tusks are modified second incisors of solid dentine; **at least a third of the tusk's length contains
the pulp cavity**; in cross-section they show the "engine turning" **Schreger chevron** pattern, whose
included angle is **> 115°** in elephant ivory (< 90° in mammoth). They grow ~17 cm/year and the
enamel cap wears off early, leaving bare dentine that stains and cracks.

**Wally's tusks are short and blunt** — an executive's tusks, worn down and capped. This is a
deliberate deviation (§9 D3) and it is also the better design: long sabre tusks would compete with the
trunk for the same silhouette space and lose.

- **Root (alveolus)** at world **(+0.250, 1.530, ±0.115)**, through a raised **alveolar collar** —
  a 0.012 m proud lip of hide, 0.090 m outer diameter, around each tusk. Without the collar the tusk
  looks like a dowel pushed through a wall.
- **Axis: a cubic Bézier** (world coordinates, ± on z mirrored):
  `P0 (0.250, 1.530, ±0.115)` → `P1 (0.372, 1.418, ±0.148)` → `P2 (0.470, 1.330, ±0.178)` →
  `P3 (0.520, 1.360, ±0.192)`.
  Arc ≈ **0.345 m**. The axis dips to its **lowest point y ≈ 1.336 at t ≈ 0.85** and then **turns back
  up** — forward, down, out, then up. That final up-turn is the elephant tusk gesture; without it you
  have a boar.
- **Section: an oval, 1.14 : 1 (deeper in X than wide in Z).** Base **0.075 × 0.066 m**, tapering to a
  **blunt rounded tip 0.030 m across**. Not a point: blunt because it is worn, because a needle tip
  vanishes at 128 px, and because §9.
- **Wear facet:** a flat plane on the underside of the distal 0.11 m, **12° to the axis, 0.028 m
  wide**, with a polished (roughness 0.22) finish against the tusk's 0.30 base.
- **Cementum collar:** a **0.020 m band** of darker, rougher material (`IVORY_STAIN`) where the tusk
  exits the alveolus.
- **Root cracks:** 3–5 longitudinal hairline cracks in the proximal 0.09 m, 0.0008 m wide, normal-map
  only.
- **Schreger pattern:** a faint chevron normal at an **included angle of 118°**, pitch 0.006 m,
  strength 0.15. Invisible past 1 m and correct at 30 cm.
- **Gore payoff:** when a tusk is broken by `Gore`, the exposed cross-section shows a **concentric
  Schreger disc decal with a dark pulp cavity occupying the central 34% of the diameter** (at least a
  third of a real tusk is pulp). One `decalTexture()` call, and it is the best dismemberment detail on
  the roster.
- **Slot check:** tusk tip at z ±0.192; the trunk's half-width at y = 1.360 is 0.103; tusk radius
  0.018 → clear background slot **0.071 m (4.5 px)** ✓ §2 negative space B.

### 3.9 Head carriage and baked angles

- The `head` pivot's frozen **+0.06 X offset** means the head is carried **0.060 m forward of the
  torso axis**. Keep it. That forward carriage plus the absent neck is the "big animal, small
  patience" posture.
- Bake a **−4° pitch** (chin down) into the head geometry, so he is permanently looking slightly
  *over the top* of his own sunglasses. Zero yaw, zero roll in bind.
- The cranium's mass centre sits at local **x = −0.030**, i.e. *behind* the pivot, while the trunk and
  tusks hang forward of it. That is intentional: it makes the head-bob in `idle` and the head-snap in
  `hitHeavy` feel weighted rather than floaty.

### 3.10 The front-view mask — the identity outline, as a polygon

Filled black in a front orthographic view, the head + ears must produce this outline. World
coordinates (z, y), right half only; mirror for the left. **If a build's outline does not match this
within ±0.02 m, the head is wrong regardless of how good the detail is.**

| pt | z | y | |
|---|---|---|---|
| M0 | 0.000 | **2.000** | crown apex, with a **0.012 m dip at z = 0** from the sagittal groove |
| M1 | 0.100 | 1.988 | dome shoulder |
| M2 | 0.190 | 1.950 | |
| M3 | 0.300 | 1.972 | **ear roll crest rises above the skull line again** |
| M4 | 0.470 | 1.940 | |
| M5 | 0.600 | 1.830 | |
| M6 | **0.636** | 1.640 | **ear outer widest** |
| M7 | 0.590 | 1.480 | |
| M8 | 0.470 | 1.390 | |
| M9 | 0.330 | **1.355** | ear lower-lobe tip |
| M10 | 0.245 | 1.400 | ear inner-lower edge climbing back to the head |
| M11 | 0.220 | 1.520 | cheek / zygomatic |
| M12 | 0.192 | 1.360 | **tusk tip breaks back out of the outline** |
| M13 | 0.115 | 1.530 | tusk root |
| M14 | 0.120 | 1.600 | trunk root wall |
| M15 | 0.050 | 0.950 | trunk tip — the long vertical run down the centre |

Three events in that list are the whole identity: **M3–M6 (the ear bar rising above and outboard of
the skull)**, **M9–M12 (the notch between ear lobe and tusk)**, and **M14–M15 (the trunk's 0.65 m
vertical drop)**. Everything else can move.

---

## 4. Body & limb proportions

### 4.1 Torso — a barrel, not a wedge

Human/heroic torsos taper from a wide chest to a narrow waist. **An elephant does not taper.** The
ribcage runs into the belly with almost no waist, and that is what makes the suit funny.

| Property | Value | Note |
|---|---|---|
| Chest width (across the coat, y = 1.32) | **0.920 m** | ±0.460 |
| Belly width (widest, y = 1.10) | **0.960 m** | ±0.480 — **the belly is wider than the chest** |
| Hip width (y = 0.90) | 0.880 m | ±0.440 |
| Waist suppression | **6%** | a human suit is 16–20%. The tailor gave up. |
| Chest depth (coat front +0.44 → coat back −0.50) | **0.940 m** | he is as deep as he is wide |
| Torso vertical run (hip pivot 0.920 → acromion 1.575) | 0.655 m | 0.33 H |

- **Base build:** an ellipsoid r 0.50 scaled **(0.94 X, 1.00 Y, 0.92 Z)** centred at world
  **(−0.030, 1.290, 0)** for the ribcage, plus a second ellipsoid r 0.44 scaled
  **(0.90, 0.78, 0.98)** centred at **(+0.020, 1.100, 0)** for the belly, blended (not booleaned) so
  the transition is a **soft 0.09 m radius roll** rather than a seam. The belly ellipsoid's forward
  pole reaches x = +0.416; the coat's front face sits 0.024 outside it at +0.440.
- **Spine profile — Asian, i.e. convex.** African elephants have a concave "saddle" back; Asian
  elephants have a **convex or level** back and their highest body point is the head. We take the
  Asian back, because a convex dorsal line inside a jacket reads as a big man's rolled shoulders and
  a concave saddle would fight the coat. Bake this dorsal polyline (world, z = 0, x back-positive is
  negative here):

  | landmark | x | y |
  |---|---|---|
  | withers (base of the skull) | −0.300 | 1.560 |
  | **dorsal apex** | −0.400 | **1.600** |
  | mid-back | −0.470 | 1.540 |
  | lumbar | −0.490 | 1.420 |
  | sacrum | −0.440 | 1.280 |

  The **0.040 m hump between the withers and the dorsal apex** is the read. It is subtle and it is
  what makes the back look like an animal's rather than a mannequin's under tailoring.
- **Shoulder carriage:** acromion at **y = 1.575**, level (no drop), retracted **0.050 m** behind the
  chest plane. Shoulders are **square and still** — this character does not slouch, hunch, or lean.
  Every other heavyweight archetype does. Wally's stillness is his personality.

### 4.2 Arms

| Segment | Length | Diameter (prox → dist) |
|---|---|---|
| Upper arm (`armL/R` 1.440 → `forearm` 1.100) | **0.340 m** (frozen) | 0.290 → 0.240 |
| Forearm (1.100 → wrist 0.800) | **0.300 m** | 0.240 → 0.190 |
| Hand (wrist 0.800 → knuckle 0.640) | **0.160 m** | 0.200 wide |
| **Shoulder → knuckle** | **0.800 m** | knuckle at **y = 0.640** |

- **Knuckle 0.640 vs knee 0.520: the hands hang 0.120 m ABOVE the knee.** This is the deliberate
  opposite of the ape fighter, whose knuckles hang *below* the knee. Elephant forelimbs are pillars,
  not levers. Do not lengthen the arms to "look powerful" — short arms on a huge body is the read.
- **Arm : height ratio 0.400.** Arm : leg (hip→sole 0.920) ratio **0.87**.
- **Very little taper:** 0.290 → 0.190 over 0.640 m is a **34% taper** across the whole limb, against
  a human's ~55%. Columnar.
- **The elbow is a real joint**, not a bend in a tube: a 0.020 m proud olecranon bump on the posterior
  face, and the sleeve above it takes **3 accordion creases** (§7.3).
- **Arm-to-body gap never closes below 0.075 m** in idle (§2 negative space C).

### 4.3 Hands — built like feet, because they are

An elephant's forelimb ends in a foot. A fighting game needs a hand. The resolution: **a hand that is
visibly a modified foot** — a thick pad palm, three blunt fingers and a short opposed stub, each
capped with a **nail plate identical in material and shape to the toenails**. This ties the hand to the
foot, keeps the character non-human, and reads as a fist at 128 px.

- **Palm:** a rounded pad **0.200 Z × 0.160 X × 0.110 Y**, its palmar face **concave (sagitta 0.014)**
  and carrying **4 deep flexion creases** 0.006 m deep. Surfaced as `leather`, not hide.
- **Three fingers**, each **0.100 m long × 0.062 m diameter**, splayed at **−16° / 0° / +16°**, two
  phalanx segments each with a 0.008 m crease at the joint.
- **One opposed stub thumb**, 0.062 m long × 0.056 m diameter, set at **48°** to the finger plane and
  **0.030 m proximal** of the finger roots.
- **Nail plates:** one per digit, **0.038 m wide × 0.026 m tall × 0.012 m thick**, `NAIL`, a shallow
  domed rectangle with a 0.004 m fillet, set into the dorsal face of the distal segment and standing
  **0.006 m proud**. Instanced with the toenails (§4.5) — same mesh, different scale.
- **The wrist is sleeved by the French cuff** (§7.4). There is no visible wrist joint. Ever.
  **ROUND-4:** `sleeve()` is an *open, single-sided* tube, so "sleeved" is only true if something
  fills its mouth. It did not: the cuff's free rim ran at r 0.100 with a wrist column of r 0.079
  under it, leaving a 0.021 m annulus you could see the arena through. The cuff now tapers **towards
  the hand** (0.0920 at the free edge, 0.1000 where it goes under the wool — which is the direction
  a real French cuff tapers), carries a rolled hem on that free edge so it terminates in a lit
  fillet instead of a zero-thickness cut, and the carpus underneath is the bottom of a one-piece
  lathed forearm carrying 0.088 m of radius right at the rim. 0.004 m of air, and no line of sight.

### 4.4 Legs

| Segment | Length | Diameter (prox → dist) |
|---|---|---|
| Femur (hip 0.920 → knee 0.520) | **0.400 m** | 0.360 → 0.320 |
| Tibia (knee 0.520 → ankle 0.161) | **0.360 m** | 0.320 → 0.300 |
| Foot (ankle → sole) | 0.161 m | pad 0.330 Z × 0.360 X |

- **Total taper across the leg: 0.360 → 0.300 = 17%.** A human leg tapers about 45%. **This 17% is the
  number that makes the leg read as an elephant's column.** If the implementer's leg looks like a
  boot, the taper is too high.
- The **knee is barely articulated in silhouette** — a 0.014 m forward bulge, no patella point. In
  bind the leg carries a **5° femoral** and **3° tibial** cant (§2 rig gate).
- **Stance:** foot centres at **z = ±0.240** (track 0.480 m = 0.24 H), feet **toed out 12°**. A wider
  stance reads as a sumo pose and this character is not braced; a narrower one collapses §2's
  negative space D.
- Trousers cover the leg down to **y = 0.210** (§7.5). Below that is bare hide and the foot.

### 4.5 Feet — the elephant tell below the trouser break

Asian elephants have **five nail-like structures on each forefoot and four on each hind foot**;
African bush elephants have four and three. A bipedal fighter's weight-bearing feet are hind feet, so:
**four nails per foot.** (The current build has three. Change it.)

- **Pad:** an oval cushion **0.360 m fore-aft (X) × 0.330 m across (Z) × 0.140 m tall**, sole flat
  with a **0.022 m chamfer** all round. The pad is **0.030 m wider than the shin per side** — that
  0.015 m step is what makes the leg terminate in a foot instead of running into the floor (§2 item 5).
- **Fibroelastic cushion behaviour.** An elephant's foot contains a fatty fibroelastic pad plus a
  cartilaginous prepollex/prehallux "sixth toe" that lets the foot **spread on contact**, increasing
  the ground contact area. Build the squash: on any planted frame, scale the pad **+6% in X and Z and
  −12% in Y**, easing in over 3 frames and out over 6. This is a two-line change and it will make him
  feel like he weighs two tonnes.
- **Four toenails per foot**, splayed across the **front 140° arc** of the pad at **−33° / −11° /
  +11° / +33°** from the foot's forward axis. Each: **0.075 m wide × 0.055 m tall × 0.020 m thick**,
  a domed rectangle with a **0.006 m fillet**, top edge at **y = 0.075**, protruding **0.018 m** from
  the pad wall, each tilted **8° outward**. Instanced with the finger nails.
- **Sole:** deeply cracked, with a **radial-then-concentric** channel pattern (a real elephant sole is
  a fingerprint). Surfaced `mud` over `leather`, roughness 0.92.
- **Dust line:** hide dust (`HIDE_DUST`) accumulates in the crevices from the sole up to **y = 0.310**,
  fading to zero over the last 0.08 m. He walked here.

### 4.6 Tail

The `tail` bone is at hips + (−0.30, 0.06, 0) → world (−0.30, 0.980, 0). Frozen.

- **Length 0.420 m**, diameter **0.055 → 0.030 m**, hanging with a slight rearward bow (baked 0.14 rad).
- **Terminal tuft: 11 modelled bristles**, each **0.110 m long × 0.006 m thick**, `BRISTLE`
  (a near-black warm grey), splayed in a **flat fan** — real elephant tail bristles are coarse, flat
  and splay in one plane, not a brush. Instanced.
- **The tail must exit the jacket.** It leaves through the **centre-back seam between the two vents**
  (§7.2), which is why the vent arrangement is double and not single. Model a **0.070 m tail port**
  with a finished edge so it reads as a tailoring decision rather than a hole.
- The tail is spring-follow secondary motion (already implemented) — keep it, but retune: damping
  **0.18**, and the bristle tuft lags the tail tip by a further **3 frames**.

### 4.7 Posture in one sentence

**Weight even on two columns, feet toed out 12°, shoulders square and level, spine convex, head
carried 0.06 m forward on no neck, trunk hanging plumb down the centre of a buttoned coat, hands at
mid-thigh and open.** Nothing is braced, cocked, or coiled. Everyone else in the roster is *ready*.
Wally is *present*. That difference is the character.

---

## 5. Colour script

Named constants to replace the current `C = {...}` block. Chosen so that (a) every channel of every
**albedo** sits inside the contract's **30–240 sRGB** range (`GRAPHICS_CONTRACT.md` §0 — assert it,
it is one line); (b) the two largest areas hold a **7.78 : 1** luminance step so the character reads
at 128 px; and (c) nothing is sampled from any real brand's palette (§9).

"Y" is CIE relative luminance from linearised sRGB (0.2126 R + 0.7152 G + 0.0722 B). These were
computed, not estimated.

| Name | Hex | Y | sRGB | Use |
|---|---|---|---|---|
| `HIDE` | `#8A8F9C` | 0.2745 | 138,143,156 | **Base hide.** Head, trunk, ears (back), limbs, hands, feet. The dominant *animal* area. Cool neutral grey with a faint blue lean. |
| `HIDE_DEEP` | `#4E545F` | 0.0879 | 78,84,95 | **Crevice / AO tint.** Skin-channel floors, under-jaw, ear root valley, trunk ring troughs, between the toes, armpit. 3.12 : 1 under `HIDE`. |
| `HIDE_LIGHT` | `#ADB2BE` | 0.4444 | 173,178,190 | Rim-facing lift: dome crowns, ear roll, trunk ring crests, shoulder tops, tusk collars, knuckles. |
| `HIDE_DUST` | `#B3A992` | 0.4003 | 179,169,146 | **Dried dust in the crevices** — lower legs, feet, ear backs, the top of the trunk. Warm ochre grey. The only warm note on the animal. |
| `EAR_FLUSH` | `#B4818A` | 0.2724 | 180,129,138 | Inner ear concha, the flush at the ear root, the inside of the mouth margin. |
| `EAR_FRECKLE` | `#CBA0A0` | 0.4038 | 203,160,160 | Depigmentation freckling on the ear fronts, trunk dorsum and around the eyes. |
| `IVORY` | `#E6DAB9` | 0.7047 | 230,218,185 | **Tusks.** 2.57 : 1 above `HIDE` — a clear, warm step out of the grey. |
| `IVORY_STAIN` | `#B6A47C` | 0.3795 | 182,164,124 | Cementum collar, root cracks, the aged half of the wear facet. |
| `NAIL` | `#DCD2B9` | 0.6481 | 220,210,185 | Toenails and finger nail plates. Slightly cooler and lower-chroma than `IVORY` so they do not compete with the tusks. |
| **`SUIT`** | **`#2F3541`** | **0.0353** | 47,53,65 | **Charcoal worsted.** Jacket, trousers, waistcoat. **The largest single area on the model.** |
| `SUIT_DEEP` | `#1F232C` | 0.0168 | 31,35,44 | Coat interior, under-lapel, vent shadow, jetted pocket mouths, crease valleys. |
| `CHALK` | `#98A1B4` | 0.3546 | 152,161,180 | **The chalk stripe.** 10.05 : 1 above `SUIT`. Deliberately grey-blue, never white. |
| `SHIRT` | `#E8EBEF` | 0.8280 | 232,235,239 | Shirt body, collar, French cuffs. **Lightest value on the model** — 23.5 : 1 above `SUIT`. |
| `TIE` | `#7E2B38` | 0.0645 | 126,43,56 | Oxblood tie. Dark, low-key, high-chroma. |
| `TIE_LIGHT` | `#A34554` | 0.1268 | 163,69,84 | Tie repp-rib highlight and the knot's lit facets. |
| `SQUARE` | `#DDB44E` | 0.4856 | 221,180,78 | **Amber silk pocket square.** 13.76 : 1 above `SUIT`. The single warmest, highest-chroma large-ish accent. |
| `GOLD` | `#D8A83E` | 0.4295 | 216,168,62 | Cufflinks, tie bar, jacket buttons, the tusk band. `metalness 1.0`. |
| `SHADE_LENS` | `#1E2026` | 0.0145 | 30,32,38 | **Lens.** Darkest albedo on the model and still inside the 30-floor. 18.9 : 1 under `HIDE`. |
| `SHADE_FRAME` | `#2B2F38` | 0.0283 | 43,47,56 | Shade top bar, bridge, temple arms. Very slightly lighter than the lens so the frame separates. |
| `GLINT` | `#5FE8A6` | 0.6290 | 95,232,166 | The rising-chart tick inside each lens. **Emissive**, `emissive(GLINT, 1.8)` — the only bloom source on the character. |
| `MOUTH` | `#4B3238` | 0.0406 | 75,50,56 | Mouth interior. |
| `TONGUE` | `#A9707A` | 0.2143 | 169,112,122 | Tongue (KO / taunt only). |
| `SCLERA` | `#E6E2D6` | 0.7607 | 230,226,214 | Eye white — never `#FFFFFF`. Visible over <18% of the aperture. |
| `IRIS` | `#4A3A2A` | 0.0465 | 74,58,42 | Warm dark amber-brown. |
| `PUPIL` | `#221F1E` | 0.0141 | 34,31,30 | Pupil. |
| `BRISTLE` | `#33302E` | 0.0301 | 51,48,46 | Tail tuft, trunk-tip sensory bristles, eyelashes. |
| `RIM_WARM` | `#FFCFA0` | — | 255,207,160 | **Not an albedo** — a requested light colour (see below). The 30–240 rule does not apply. |
| `RIM_STEEL` | `#9FB0C8` | 0.4259 | 159,176,200 | Material-side sheen tint on the **wool only**. |

### The value ladder (top to bottom)

| # | Constant | Y | Area on the model |
|---|---|---|---|
| 1 | `SHIRT` | 0.828 | medium — collar + cuffs + a triangle of front |
| 2 | `SCLERA` | 0.761 | tiny |
| 3 | **`IVORY`** | **0.705** | **small but silhouette-critical** |
| 4 | `NAIL` | 0.648 | small ×16 |
| 5 | `GLINT` | 0.629 | tiny, emissive |
| 6 | `SQUARE` | 0.486 | small |
| 7 | `HIDE_LIGHT` | 0.444 | edges only |
| 8 | `GOLD` | 0.430 | small, metal |
| 9 | `EAR_FRECKLE` | 0.404 | scattered |
| 10 | `HIDE_DUST` | 0.400 | crevices, lower legs |
| 11 | `IVORY_STAIN` | 0.380 | thin bands |
| 12 | `CHALK` | 0.355 | thin lines over a large area |
| 13 | **`HIDE`** | **0.275** | **largest *animal* area** |
| 14 | `EAR_FLUSH` | 0.272 | ear fronts |
| 15 | `TONGUE` | 0.214 | pose-only |
| 16 | `TIE_LIGHT` | 0.127 | thin |
| 17 | `HIDE_DEEP` | 0.088 | crevices |
| 18 | `TIE` | 0.065 | small |
| 19 | `IRIS` | 0.047 | tiny |
| 20 | `MOUTH` | 0.041 | pose-only |
| 21 | **`SUIT`** | **0.035** | **largest area on the model, full stop** |
| 22 | `BRISTLE` | 0.030 | tiny |
| 23 | `SHADE_FRAME` | 0.028 | thin |
| 24 | `SUIT_DEEP` | 0.017 | crevices |
| 25 | `SHADE_LENS` | 0.015 | small, but the face's whole read |
| 26 | `PUPIL` | 0.014 | tiny |

### Value relationships (the part that matters)

- **The two largest areas are `HIDE` (0.275) and `SUIT` (0.035) → 7.78 : 1.** That one step is the
  character at 128 px: a mid-grey animal wearing a near-black suit. **Nothing else may compete with it
  at large area.** In particular the trousers and the coat are the *same* value — the leg reads
  because of the bare hide *below* the cuff, not because of a trouser/coat contrast.
- **Full range:** `SHIRT` (0.828) → `SHADE_LENS` (0.015) = **57 : 1**. That is a wide but controlled
  range; the two extremes are 0.4 m apart on the figure (collar and lenses), which is exactly where
  you want the eye to land.
- **`SHADE_LENS` (0.015) against `HIDE` (0.275) = 18.9 : 1.** The lens band is the darkest thing on
  the head by a wide margin, so at any distance the face reads as *grey mass with one black bar*.
  That is the intended 1 m read and it is why the lenses must be a **single continuous band**, not two
  separate discs (§7.1).
- **`IVORY` (0.705) against `HIDE` (0.275) = 2.57 : 1.** Enough to separate, not enough to shout.
  Tusks that read as white-hot at distance pull focus off the trunk. Do not lighten them.
- **`SHIRT` (0.828) against `SUIT` (0.035) = 23.5 : 1 — the highest local contrast on the model, and
  it sits at the throat**, 0.06 m under the chin. That is the second read anchor after the lens band,
  and it is what drags the eye up to the head. Keep the visible shirt triangle **small** (0.13 m wide
  at the collar, closing to zero at the top button) so it is a spark, not a field.
- **`CHALK` (0.355) against `SUIT` (0.035) = 10.05 : 1 per stripe, but the stripe is only a 10% duty
  cycle** (§7.2), so the *integrated* value of striped wool is Y ≈ 0.067 — i.e. the striped coat is
  about 1.9× lighter than plain `SUIT`. **Budget for that**: if you use `SUIT` for the trousers and
  striped wool for the jacket, the jacket will read lighter than the trousers. Either stripe both or
  stripe neither. **Recommendation: stripe both, and let the mips dissolve the stripe at distance.**
- **Desaturation test (run it, don't assert it).** Render at 128 px, desaturate: the outline must
  still show hide-vs-suit, the lens band must still be the darkest thing on the head, and the shirt
  triangle must still be the brightest thing on the torso. If any of those fail, a hex has drifted.

### Rim separation — what this agent may and may not do

**We do not own the light rig.** `src/render/lighting.js` belongs to the foundation agent and
`src/arenas/<id>.js` to each arena agent (`GRAPHICS_CONTRACT.md` §1: never edit a file you do not
own). So:

- **Do (in `wally.js`, ours):** give the hide a **fresnel grazing lift** via `gradientRamp()` so the
  silhouette edge of the trunk, ears and limbs is **0.18 brighter than their centres**, and give the
  wool a **`sheen 0.20` tinted `RIM_STEEL`** so the coat's edges pick up a cool steel line under any
  light. **These two are different on purpose:** hide gets a warm scattering lift, wool gets a cool
  specular one, and the difference between them is what stops the animal and the suit merging into one
  charcoal blob in a dark arena. This is the character's insurance policy against a bad arena. Build
  it. Do not skip it because the rim looks fine in one test scene.
- **Request (report it, do not implement it):** `rimColor` **`#FFCFA0`** at `rimIntensity` **1.6**,
  ≈145° off the key in azimuth and 22° above the horizon. Rationale to pass on to the arena agents:
  Wally is a **low-chroma cool-grey mass over a near-black suit** (hue ≈ 220°, and the suit at
  Y 0.035 is the darkest large area of any fighter in the roster). He separates by **value**, not by
  hue, so the rim must be **high-value and warm**; a cool rim on cool grey vanishes, and a dim rim on
  a Y-0.035 coat is worse than no rim. In `tower-dusk` and `sunset-stadium`, where the background is
  already warm, ask instead for a **secondary cool kicker** at `#9FC8FF` / 0.7 on the opposite side —
  Wally is one of the few fighters dark enough to carry two rims without blowing out.
- Wherever the rim lands it should catch: the **ear rims** (thin, translucent, best surface on the
  model for it), the **dome crowns**, the **trunk ring crests**, the **shoulder line of the coat**,
  the **lapel roll**, the **tusk tops**, and the **gold**. The gold will over-blow. That is fine — it
  is the accent.

---

## 6. Surfacing

Kinds are from `surfaceMaps(kind, opts)` in `src/render/textures.js` (the 42 registered kinds are
listed in `KINDS`, line 821). Presets are from `pbr(color, preset)` / `SURFACE` in
`src/render/materials.js`. **Everything below uses a registered kind — nothing here needs a new one.**

| Region | `surfaceMaps` kind | opts | `pbr` preset | Behaviour |
|---|---|---|---|---|
| Body, limbs, head, trunk dorsum | **`skin-elephant`** | `scale 1.0, wear 0.6, tint HIDE_DEEP` | `skin` | roughness **0.80 ± 0.12** spatial. `normalScale 1.35`. No sheen. |
| Face, ear fronts, trunk distal third | **`skin-elephant`** | `scale 0.6, wear 0.35` | `skin` | finer channel lattice — the face's cracks must be visibly smaller than the flank's. roughness 0.74 ± 0.10. |
| Ear rim (outer 0.10 m) + concha | **`skin-smooth`** | `scale 0.5` | `skin-sss` | roughness 0.66, **transmission-driven thickness ramp** — see below. |
| Palms, sole, knuckle pads | **`leather`** | `scale 0.9, wear 0.8` | `leather` | roughness 0.88, deep cracked normal. |
| Sole underside | **`mud`** over `leather` | `scale 1.6` | `leather` | roughness **0.92**, dust-packed. |
| Tusks | **`bone`** | `scale 0.5` | `bone` | roughness **0.30**, `clearcoat 0.20`, warm translucency at the distal 0.05 m. Schreger normal at 118°. |
| Nails (toes + fingers) | **`bone`** | `scale 0.8, wear 0.5` | `bone` | roughness 0.44, a polished 0.26 wear facet on each leading edge. |
| **Jacket, trousers, waistcoat** | **`suit-wool`** | `scale 1.2` | `cloth` | roughness **0.72 ± 0.08**, `sheen 0.20` tinted `RIM_STEEL`, `sheenRoughness 0.45`, `normalScale 1.1`. |
| Coat interior / under-lapel | `suit-wool` | `scale 1.2, tint SUIT_DEEP` | `cloth` | roughness 0.80, no sheen. |
| Shirt | **`cloth-weave`** | `scale 0.8` | `cloth` | roughness **0.62**, sheen 0.14. Crisper than the jacket — poplin, not wool. |
| Tie | `cloth-weave` | `scale 0.6` | `cloth` | roughness **0.42**, `sheen 0.50` — silk repp. Second-shiniest cloth on the model. |
| Pocket square | `cloth-weave` | `scale 0.45` | `cloth` | roughness **0.34**, `sheen 0.62` — **the shiniest cloth on the model**, deliberately, because it is the smallest. |
| Buttons | **`horn`** | `scale 1.4` | `plastic-gloss` | roughness 0.26, `clearcoat 0.4`. Real horn buttons, mottled, not plastic discs. |
| Cufflinks, tie bar, tusk band, jacket hardware | **`gold`** | — | `gold` | metalness **1.0**, roughness **0.16**, `envMapIntensity 1.4`. |
| Shade frame + temples | **`metal-painted`** | `scale 1.0, wear 0.25` | `metal-painted` | roughness 0.34, a few micro-scratches on the temple tops. |
| Shade lens | — | — | `glass` | roughness **0.06**, `clearcoat 1.0`, **`transmission 0.12`** so the eyes are dimly visible behind them, `envMapIntensity 1.5`. |
| Sclera | `skin-smooth` | — | `skin` | roughness 0.28. |
| Cornea | — | — | `glass` | roughness 0.04, `clearcoat 1.0`, transmission 0. One crisp dot per eye. |
| Nictitating membrane | `skin-smooth` | — | `skin-wet` | roughness 0.18, opacity 0.70. |
| Mouth interior, lower-lip inner face, nostril interiors | `skin-smooth` | — | `skin-wet` | roughness **0.22**. |
| Eyelashes, tail bristles, trunk-tip bristles | **`fur-coarse`** | `scale 2.2` | `fur` | roughness 0.86, sheen 0.30. |
| Dust deposits | **`sand`** | `scale 2.0` | `plastic-matte` | roughness **0.96** — the deadest surface on the model. |

### The hide — how to make `skin-elephant` actually look like elephant

This is the surface everyone gets wrong, and there is a specific, measured structure behind it. African
elephant skin cracks are **not** dried-mud polygons. They are **fractures of a hyperkeratinised
stratum corneum** — a brittle outer layer that in an elephant can exceed **300–400 µm** thick (about
50× a human's) — that split **in the troughs of a quasi-regular lattice of millimetric dermal
papillae**. The channels are **~100 µm wide**, and they hold **5–10× more water** than a flat surface
would, which is why elephants look permanently damp-and-dusty. Newborn elephants have the papillae but
no channels — the cracks develop.

What that means for the map:

1. **Two scales, not one.** A **lattice of raised papillae** at a pitch of **0.012 m** (our scale) as
   the low-frequency bump, and the **crack channels** as a separate high-frequency layer that runs
   **along the troughs between papillae**, never across their crowns. If your cracks cut over the
   bumps, it reads as cracked paint.
2. **Channel geometry:** width **0.0015 m**, depth **0.0025 m** (deeper than wide — they are fractures,
   not grooves). Junctions are predominantly **Y-shaped at ≈120°**; **T-junctions are rare** and
   90°/135°/135° triples show up in simulation. Do not generate a Voronoi cell pattern with clean
   3-way 120° vertices everywhere — real fracture networks are messier, with dead-end cracks that stop
   mid-trough. Aim for **~25% dead-end terminations**.
3. **Anisotropy.** The lattice is broadly isotropic on the flanks but **stretches 1.4 : 1 along the
   limb axis** on the legs and **along the trunk axis** on the trunk, because that skin is loaded in
   one direction. Feed the kind a per-region `scale` pair or stretch the UVs — either is fine.
4. **Density gradient.** Densest and deepest on the **back, forehead and trunk dorsum** (where real
   skin is thickest — up to 25–30 mm on the back and head); shallowest on the **ear fronts, around the
   mouth, and the inner ear**, which are thin and nearly smooth. Drive it with a mask, not a uniform
   tile.
5. **Cavity-driven dust.** `HIDE_DUST` must be composited **only where the channel cavity map is
   dark**, so the dust sits *in* the cracks and the crests stay clean grey. This is the single
   highest-value line of shader work on the character: it is exactly what real elephant skin does with
   mud, it makes the crack network legible at 1 m without any extra geometry, and it costs one mask
   multiply. **Do not paint a uniform dust overlay.**

### Ear translucency — the hero surface

Elephant pinnae are **1–2 mm thick in the middle and thinner at the tip**, packed with capillaries.
Ours taper 0.030 → 0.006 m (§3.7). Build a **thickness map** from that taper and drive
subsurface/transmission from it so that when a light is behind the ear:

- the outer **0.10 m of rim glows** `EAR_FLUSH` shifted warm, at up to **0.55 transmission**;
- the **vascular tree relief silhouettes as darker lines** inside the glow (it is denser tissue);
- the **rolled dorsal border stays opaque** (it is 0.045 m of folded skin) — that opaque hem framing a
  glowing membrane is the shot.

This is the one moment where Wally can be genuinely beautiful and it costs one extra map. In
`sunset-stadium`, `mountain-dawn` and `tower-dusk` it will do more for the character than any other
single decision in this brief.

### How the wool must behave under light

Worsted suiting is not matte and it is not shiny — it has a **directional sheen that only appears at
grazing angles**, because the weave is a fine twill of long combed fibres.

- **Twill direction is a tell.** Set the weave normal's diagonal at **63° from horizontal**, running
  **up to the right** on the wearer's right panel. A 45° diagonal reads as denim; a horizontal rib
  reads as corduroy. 63° is what makes it read as suiting.
- Roughness **0.72 base with ±0.08 spatial variance**. Flat 0.72 everywhere is the #1 hobby tell.
  Drive the variance from the weave height map: **crease crests −0.06 (glossier), valleys +0.05**.
- **`sheen 0.20` in `RIM_STEEL`, `sheenRoughness 0.45`.** The sheen lobe must only fire on the
  shoulder tops, the lapel roll, the sleeve crowns, the crease crests and the skirt hem. If the flat
  of the chest is glinting, sheen is too high.
- **The pinstripe is a mip-managed feature.** Stripe width **0.005 m** in a **0.050 m repeat** — a 10%
  duty cycle, which is the real chalk-stripe proportion (2–4 yarns in every ~40). At 128 px that repeat
  is **3.2 px** and it *will* moiré. **Do not fatten it.** A fat stripe reads as a rugby shirt. Instead:
  author the stripe in the albedo with proper mips and let it dissolve to flat `SUIT` by mip 3, so the
  stripe is a **30 cm and 1 m detail only**. Set `aniso 8` and verify at 128, 256 and 512 px.
- **Wool creases with a soft crest and a broad valley** — never a V-groove. Model every crease with
  an **asymmetric profile: 0.008 m crest radius over a 0.018 m valley radius.** That asymmetry is
  literally what separates wool from leather or plastic in a render.
- **Unsupported wool hangs in a catenary.** Between two supported points (shoulder → button, button →
  hem) the panel sags **4–6% of the span**. Bake that sag into the coat's front panels; a coat that
  follows the body surface exactly reads as body paint.

### Micro-detail that sells it (the 30 cm read)

1. **The skin channels with dust in them.** Item 5 above. Everything else on this list is decoration
   next to it.
2. **Pick stitching.** A hand-picked edge **0.006 m in from the lapel edge, collar edge and pocket
   welts**, at **12 stitches per 0.10 m**, as a 0.0012 m bump. This is the detail that says *bespoke*
   rather than *costume*, and it is one texture channel.
3. **The working boutonnière.** A real **0.028 m buttonhole slot with air behind it** on the left
   lapel, with a **keeper loop** on the underside. It appears in §2's negative space list for a reason.
4. **Kissing sleeve buttons.** 4 per cuff, **overlapping by 0.20 of their diameter**, on functional
   (surgeon's) cuffs — and leave **the bottom one undone** on both sleeves. That is the oldest
   "this is real bespoke" signal in menswear and it is four vertices of rotation.
5. **The jigger.** The internal anchor button that holds the under-panel of a double-breasted coat.
   Visible for exactly one frame when the coat flies open in `hitHeavy` and on the KO. Build it.
6. **Trunk-ring crest wear.** The crests of the proximal rings are **rubbed smoother** (roughness
   −0.10) than the troughs, because that is the part of the trunk that touches things.
7. **Tusk wear facet + root cracks + the Schreger disc on a break** (§3.8).
8. **Eyelash catchlight.** The lashes are the only thin geometry near the lens; give them a
   **sheen 0.30** so they take a bright edge against the black lens. That contrast is the gag.
9. **Ear tears and the vascular tree** (§3.7). Two ears, two different tear patterns — never mirror
   them.
10. **A single loose thread** at the vent's bar-tack, 0.018 m long. One quad. Nobody will consciously
    see it and everybody will feel it.

### 6.5 Budget — the constraint this brief would otherwise blow

Contract §0 caps a match scene at **~250k triangles / ~900 draw calls**, shared by two fighters, an
arena and VFX.

- **≤ 34,000 triangles** for the whole model including props and costume 0.
- **≤ 42 draw calls** in the bind pose.

Counted naively this brief asks for 18 dorsal trunk rings + 11 ventral + 16 nails + 14 eyelashes +
11 tail bristles + 7 trunk bristles + 6 front buttons + 8 sleeve buttons + 5 ear flute lobes + props
≈ **100+ meshes**. That is a draw-call failure before the arena draws anything. **Mandatory
mitigations:**

1. **`InstancedMesh` for every repeated element**: trunk rings (29, two instance sets), nails (16),
   eyelashes (28 across both eyes), tail bristles (11), trunk bristles (7), buttons (14). **Six
   instanced meshes, six draw calls, instead of 105.**
2. **Merge by material *within a bone*.** All `HIDE` static geometry under `torso` is one merged
   buffer; likewise per limb. **Never merge across bones** — `Gore._detach()` clones a bone's subtree,
   and a buffer spanning two bones will tear on dismemberment.
3. **`pbr()` caches by (color, preset, overrides).** Do not pass `unique: true` anywhere in the bind
   pose; reserve it for the damage-tint and dismemberment-fade paths.
4. **Segment counts:** the cranium at icosahedron subdivision 3 is ~1,280 tris and is worth it. The
   trunk is a **swept tube at 14 radial segments × 30 rings ≈ 840 tris** and is worth it. The ear
   plate is ~600 tris each. Tusks 12 radial × 10 length = 240 each. Buttons get 10 radial segments,
   not 24.
5. **If you come in over 34k, cut in this order:** tail bristles → trunk bristles → button facets →
   ear flute segments → vascular tree generations 4 and 5. **Never cut** the ear plate area, the trunk
   ring count, the tusk arc, the nostril apertures, the eyelashes, or the lapel geometry. Those six
   are the read.

Report **measured** tri and draw counts in your writeup. "It looked fine" is not a measurement.

---

## 7. Signature props & wardrobe

Every prop is a child of an existing bone. `Gore._detach()` clones a bone's entire subtree, so anything
under `head` flies off with the head and anything under `forearmL` flies off with that hand. **Nothing
may be parented to `group`, and nothing may be positioned by per-frame JS**, because a detached clone
is frozen and would visibly desync. Mark every prop mesh `userData.prop = true`.

### 7.1 The shades — parent: `head`

The single strongest read cue on the head after the trunk, and the character's whole face.

- **One continuous lens band, not two lenses.** A wrapped shield: **0.460 m wide (z ±0.230) ×
  0.100 m tall × 0.030 m deep**, curved around the face on a **0.280 m radius** so its ends sweep back
  to **(x = +0.100, z = ±0.205)**. Two separate discs read as spectacles and destroy the "corporate
  enforcer" beat; the band is what makes the head read as one black bar at 1 m (§5).
- **Vertical placement:** lens spans world **1.664 → 1.760**, centre **1.712**. Its top edge rests
  *physically* on the brow shelf's underside lip (head-local +0.088 = world 1.728) — the shelf is
  modelled for exactly this. There is **0.008 m of visible gap** between the lens's lower edge and
  the cheek, and the eyelashes sweep down through it (§3.4).
- **Frame:** a **0.024 m tall top bar** (`SHADE_FRAME`) along the band's upper edge, a **0.050 × 0.030
  bridge** crossing the face at x = +0.245 above the trunk root, and **two temple arms 0.230 m long ×
  0.026 m square**, chamfered 0.004, running back and 6° up to pass **over** the ear roots (never
  through them). The temples must be visible in the ¾ view — a frameless lens looks unfinished at
  30 cm.
- **The rising-chart glint.** Three ticks, each higher than the last with a dip at the second (the
  shape of every crypto chart anyone has ever screenshotted), **connected by a 0.0025 m line** so it
  reads as a chart and not as three scratches. Bar section 0.018 × 0.006 m. Geometry sits on the
  **inner** face of the lens so the glass covers it and it reads as a reflection rather than a sticker.
  `emissive(GLINT, 1.8)` — **the only bloom source on the character**. Both lenses carry it, mirrored.
- **Knock-off rig.** The whole assembly is a `Group` named `shades` under `head`, with
  `userData.prop = true` and `userData.knockOff = true`, so §8.1's KO can detach it, give it an
  impulse and let it tumble. **The eyes underneath must be finished geometry** — this is the only
  moment in a match anyone sees Wally's actual face and it has to pay off.
- Costume 1 swaps the lens material to the translucent green visor already in the code (keep
  `opacity 0.85`) and lifts `GLINT` to 2.2.

### 7.2 The jacket — parent: `torso` (body) + `hips` (skirt)

A **6×2 double-breasted coat with peak lapels**, in charcoal chalk-striped worsted. Double-breasted
is the correct choice and not an arbitrary one: it is the configuration that *wants* a wide chest,
its two columns of buttons give the front panel a graphic structure that survives to 128 px, and it
"usually has peak lapels", which point up and out and therefore amplify the shoulder line.

**Panels and closure**

| Property | Value |
|---|---|
| Wrap overlap past the centreline | **0.220 m** (left over right, men's convention) |
| Button columns | **z = ±0.175** |
| Button rows | **y = 1.420 / 1.280 / 1.140** |
| Fastening buttons | the **lower two of the wrap-side column** pass through worked holes |
| Button diameter / thickness | **0.048 / 0.012 m**, `horn` |
| Jigger (internal anchor button) | at **(x +0.30, y 1.240, z −0.165)** on the under-panel |
| Waist suppression | **6%** (a human coat is 16–20%) |
| Quarters | **closed** — DB coats do not cut away |
| Front-panel catenary sag | **5% of span** between shoulder and top button, and again between button and hem |

**Lapels — the geometry that must be right**

| Property | Value | Derivation |
|---|---|---|
| **Lapel width (widest, ⟂ to the roll line)** | **0.260 m** | 0.283 × the coat's 0.920 m chest width — matches a 4½–5″ lapel on a 42″ chest, and DB coats want the wider end of the 3.5–4.5″ peak range |
| Gorge notch position | **y = 1.500, z = ±0.115** | 0.075 m below the acromion |
| Gorge cut depth | **0.055 m** | §2 item 4b |
| **Peak point tips** | **y = 1.462, z = ±0.255** | |
| Peak rise angle from the notch | **58° above horizontal** | peak lapels point *up and out*; a shallow peak reads as a failed notch |
| Peak point length | **0.110 m**, tapering to a **0.014 m rounded tip** | |
| Lapel belly (convex edge curve) | **sagitta 0.016 m over the 0.340 m edge run** | a straight lapel edge reads as machine-made |
| **Roll line** | from the gorge (1.500) down to the **break at 1.280** | |
| **Roll radius / stand-off** | the lapel **rolls on a 0.032 m radius** and stands **0.022 m off the chest** at the break | a lapel creased flat is the difference between tailoring and cosplay |
| Lapel widest point | at **58% down the roll line** | i.e. at y ≈ 1.372 |
| Boutonnière | **0.028 m worked slot** on the wrap-side lapel at (y 1.418), with a keeper loop behind | §6 micro-detail 3 |
| Pick stitching | **0.006 m in from the edge, 12 stitches / 0.10 m** | |

**Shoulder**

- Padded and **extended 0.045 m beyond the arm** on each side → outer face at **z = ±0.550**.
- **Roped sleevehead (`spalla con rollino`)**: a **0.014 m ridge** standing proud along the armhole
  seam. This is the detail that makes the shoulder read as *built* rather than *inflated*.
- **Pagoda cant:** the shoulder line **dips 0.010 m at mid-span then rises 0.014 m at the sleevehead**
  — a shallow saddle, not a straight bar. A dead-flat shoulder reads as a coat hanger.
- Collar: **stand 0.045 m, fall 0.055 m**, undercollar in `SUIT_DEEP` (melton) with a visible 0.003 m
  roll where it turns.

**Pockets**

- **Breast pocket: barchetta** — welt **0.160 m long with a 0.014 m upward sagitta**, tilted 6°, at
  **y = 1.380** on the wearer's left chest. Curved, boat-shaped. A straight welt is fine on a cheap
  coat and wrong on this one.
- **Hip pockets: jetted, no flaps** — DB coats are shown jetted. Two, **0.180 m long**, at
  **y = 1.020**, raked **8°**. Mouths in `SUIT_DEEP`.
- **No ticket pocket.** It reads as countryside; this coat is a boardroom coat.

**Skirt, vents and the tail port**

- Skirt runs **waist 1.140 → hem 0.880** = **0.260 m**. Short, so it never bridges the leg gap (§2 D).
- **Double vents, 0.280 m long** (hem 0.880 → 1.160), at **z = ±0.230** on the back, each with a
  **bar-tack** at its top and a **0.018 m loose thread** at one of them (§6 micro-detail 10).
- **Tail port:** a finished **0.070 m** opening in the centre-back seam between the vents, at
  **y = 0.980**, through which the tail exits. Model a bound edge. This is why the vents are double.
- In idle the vents hang **closed** (0 gap); they flare to **0.060 m** in `walk`, `dash` and every
  attack recovery.

**The stripe**

- **Chalk stripe: 0.005 m wide on a 0.050 m repeat** (10% duty — real chalk stripes are 2–4 yarns in
  every ~40), `CHALK` on `SUIT`, **vertical in garment space**.
- **The stripes must curve with the body.** On a barrel torso the stripes converge toward the
  silhouette edges. This is free if the stripe lives in the albedo on a properly unwrapped UV, and it
  is catastrophically wrong if the stripe is modelled as geometry or projected planar. **Use the UV.**
- **The stripes must break at every seam** — panel seams, the lapel roll, the pocket welts, the sleeve
  head. A stripe that runs continuously across a seam is the single clearest sign the suit is painted
  on. Offset the stripe phase by **0.012 m across the centre-front seam**, and mismatch it deliberately
  at the sleeve head (real tailors match the body and give up on the sleeve).
- Mip-managed — see §6.

**The strain — how the wool creases over an animal**

The joke is a *good* suit on a *wrong* body, so the fit failures must be the ones a tailor would
diagnose, not random wrinkles. **X-shaped drag lines radiating from the buttoning point mean the coat
is too tight through the body** — and this coat is too tight through the body, because the body is a
two-tonne elephant.

- **Two X-drag creases per side** radiating from the **top fastening button (y 1.280)** at **±34° from
  horizontal**, each **0.220 m long**, **0.006 m proud**, with the asymmetric wool profile from §6
  (0.008 crest / 0.018 valley). They must be **shallowest at the button and deepest at 60% of their
  length**, then fade — that is how a drag line actually behaves.
- **Three horizontal ripple creases across the upper back** between the shoulder blades
  (y = 1.36 / 1.42 / 1.48), each 0.32 m long × 0.005 m proud — the coat is short of room across the
  back.
- **A single collar gap:** the coat's collar stands **0.008 m away** from the hide at the centre back.
  A real tailor would fix this; nobody can fix it here.
- **What must NOT happen:** the button must not visibly gape, and the lapels must not splay. The
  coat is *straining*, not *failing*. If it looks like it is about to burst, the character becomes a
  slob and the whole "calm institution" read is gone.

### 7.3 Sleeves — parent: `armL/R` (upper) + `forearmL/R` (lower)

- Sleeve is **one continuous shell** across the elbow, split only where skinning demands. It
  **sleeves the shoulder and the elbow** so no joint can gap (contract §9).
- Sleeve diameter **0.300 m at the head → 0.210 m at the cuff**, i.e. it hangs **0.010–0.020 m off the
  arm** for its whole length. Wool does not shrink-wrap.
- **Three accordion creases at the elbow** on the posterior face, 0.006 m proud, spacing 0.028 m,
  deepening by 60% in any clip where the elbow is flexed past 40°.
- **Two catenary folds along the underside of the upper arm**, sagging 5% of the span.
- **Functional cuff: 4 kissing buttons**, overlapping by **0.20 of their 0.030 m diameter**, at
  y = 0.830 → 0.890 on the outer sleeve seam, with **the bottom button undone** on both sleeves and
  the cuff opened **4°** at that corner. Instanced with the front buttons.
- Sleeve hem at **y = 0.820**, showing **0.020 m of shirt cuff** below it (§7.4). That 0.020 m of
  `SHIRT` (Y 0.828) against `SUIT` (Y 0.035) is a **23.5 : 1** bright tick at each wrist, and at 128 px
  it is the only thing that separates the hand from the sleeve. **Do not let the sleeve cover it.**

### 7.4 Shirt, collar and cuffs — parent: `torso` (body) + `forearmL/R` (cuffs)

Only three parts of the shirt are ever visible; build only those.

- **Collar: an extreme cutaway.** Point-to-point **0.200 m**, spread angle **112°**, collar band
  **0.050 m** tall, points **0.075 m** long with a 0.006 m tip radius. Spread collars run 3½–8½″ between
  points against a point collar's 2½–4″; a cutaway is the widest of them and it is the power-collar,
  which is the whole reason to pick it. It also *frames the trunk*: the trunk drops between the two
  points and the collar's V aims the eye up at the head.
- **The visible shirt triangle** is **0.130 m wide at the collar closing to zero at the top button** —
  small on purpose (§5). Under a double-breasted coat you barely see any shirt, and that is correct.
- **French (double) cuffs**, showing **0.020 m below the jacket sleeve**, **0.055 m tall**, folded back
  with a visible **0.004 m fold roll**, closed with **gold cufflinks: 0.022 m discs, 0.006 m thick**,
  bevelled, one per wrist, oriented so the face is visible in the idle hand position.
- **No waistcoat.** A double-breasted coat is worn without one, and the space is better spent on the
  shirt triangle and the tie.

### 7.5 Tie and tie bar — parent: `torso`

- **Knot: a full Windsor** — the symmetric, wide, triangular knot. It is the knot that matches a
  cutaway collar (knot bulk should fill the collar's spread) and it is the knot the archetype wears.
  **0.100 m wide × 0.085 m tall × 0.055 m deep**, centre at **y = 1.452**, its top tucked under the
  collar band.
- **The dimple is mandatory.** A **0.014 m deep crease** running down from the centre of the knot's
  base, formed by **two folds meeting at 22°**. A dimple-less tie knot reads as a plastic clip-on and
  is the most common failure in game tailoring.
- **Blade: 0.115 m wide**, running from the knot to **y = 1.100** (the waistband — the correct
  length), with a **90° point** (two 45° edges) and a **0.006 m fold roll** along each edge where the
  blade's facing turns.
- **Deliberate proportion break:** the convention is tie width ≈ lapel width. Our lapel is 0.260 m; a
  0.260 m tie would read as a bib. **We use 0.44 × the lapel width** and accept the mismatch. Note it
  so nobody "fixes" it.
- **Repp rib:** a diagonal rib at **0.006 m pitch, 45°, running down-to-the-left** — the mirror of the
  classic British regimental direction, as a small deliberate deviation (§9 D7).
- **Tie bar:** gold, **0.075 m long × 0.008 m**, horizontal at **y = 1.300**, clipped across the blade
  and the shirt placket. It sits **just above the top fastening button** and it is the one thing
  keeping the tie from swinging into the trunk's path.
- **Behaviour:** the blade below the tie bar is a **2-segment spring chain** (no new bones — drive it
  from `torso` with a follow constraint baked into the clip data, or model it stiff). It must **never**
  intersect the trunk: the trunk hangs at x ≈ +0.34–0.36 and the tie at x ≈ +0.44–0.46, so there is
  **0.085 m of clearance**. Protect it.

### 7.6 Pocket square — parent: `torso`

- **Two-point fold** in amber silk (`SQUARE`). Two points is the right choice over a puff or a
  presidential flat: a flat fold is a horizontal line that disappears against the welt, a puff is a
  blob, and two asymmetric points are a **graphic, readable shape at 1 m**.
- Points at **y = 1.425 and 1.412** — showing **0.045 m and 0.032 m above the welt**, offset **0.022 m**
  laterally so they do not overlap.
- **Rigid geometry.** The square does not animate. It is the one piece of cloth on the model that
  should look pressed and still while everything else moves.
- Silk surfacing: roughness 0.34, `sheen 0.62` — the shiniest cloth on the character. At 0.045 m tall
  it is small enough that a hot specular will not unbalance anything and will read as expensive.

### 7.7 Trousers — parent: `hips` (rise) + `legL/R`

- Waistband at **y = 1.140**, hidden under the coat. High rise — correct for the period and it keeps
  the trouser from cutting the leg at an awkward height.
- **Two forward pleats per side**, **0.030 m deep**, opening toward the centre front. Pleats are right
  for a large body: they give the wool somewhere to go when the leg lifts, and every leg-raise clip in
  this character's set will look better for them.
- **A sharp pressed crease down the centre of each leg**, **0.004 m proud**, running the full length
  and passing **through the pleat** at the top. That crease is a vertical line down a 0.32 m column and
  it does more for the leg's read than anything else available.
- **Hem at y = 0.210** with a **0.045 m turn-up (cuff)** — a turned-up cuff gives the trouser weight
  and a hard horizontal terminus.
- **One soft break** over the instep: a single horizontal fold **0.020 m deep at y = 0.245**. One
  break, not two. Two breaks reads as ill-fitting; zero reads as too short.
- Below **y = 0.210** it is bare hide and foot (§4.5). **That 0.210 m of exposed elephant foot is
  doing more parody work than the entire trouser above it.** Never cover it.

### 7.8 Tusk band — parent: `head`

A **gold band, 0.022 m wide × 0.006 m proud**, at **40% along the arc of one tusk only** (never both —
asymmetry is memorable). Bevelled, `gold`, with a **0.003 m step** where it meets the ivory so it
reads as a fitted cap and not a painted ring. It is the character's wedding ring, his signet, and his
only piece of visible personal wealth that isn't the suit.

### 7.9 Costume 1 — the chain

Costume 1 already exists in code (green visor + gold chain + pendant). Rebuild, don't delete:

- **Chain: 24 real toroid links** (r 0.026, tube 0.008, 8×6 segments), **instanced**, hanging in a
  **catenary** across the coat front from **(y 1.420, z ±0.240)** down to **(y 1.290, z 0)**. The
  current 10-sphere ring is a placeholder. **A normal-mapped chain reads as tape; spheres read as
  beads.** Links, or nothing.
- **Pendant:** a bevelled ingot **0.060 X × 0.140 Y × 0.050 Z** at (x 0.470, y 1.300, z 0), `gold`,
  with a **debossed abstract glyph of our own design, 0.003 m deep**. See §9 before choosing the
  glyph — it may **not** be a two-word capitalised wordmark, and if a letterform is used it must not
  be set in a face resembling any real financial wordmark.
- Visor lens keeps `opacity 0.85`; `GLINT` lifts to 2.2.

### 7.10 Attachment rules (all props)

1. **Parent to a bone, never to `group`, never to a mesh.** `Gore._detach()` clones a bone's subtree.
2. **One `Group` per prop**, named, with `userData.prop = true`. The knock-off-able ones
   (`shades`) also carry `userData.knockOff = true`.
3. **Props are merged per bone by material** — never across bones (§6.5).
4. **Every joint is sleeved by a garment**: shoulder and elbow by the sleeve, wrist by the French
   cuff, waist by the coat skirt, knee and ankle by the trouser, trunk segments by their own ring
   collars, ear root by 0.035 m of burial. There is no joint on this character that is not covered.
5. **The coat may not be a rigid shell parented to `torso` alone.** Its skirt must hang off `hips` so
   that hip rotation moves it, or the character will look like he is wearing a barrel. Split the coat
   at **y = 1.140** (the waist) and parent the two halves accordingly, with a **0.040 m overlap** at
   the split so no gap can open.

---

## 8. Expression & motion notes

### 8.0 The problem this section has to solve

**Wally's face is hidden.** The eyes are behind a black band, the mouth is 0.160 m wide and sits under
a trunk, and there are no eyebrows. A conventional facial-expression pass will produce nothing legible.

So the expression budget goes, in strict priority order, to:

1. **The ears** — position, spread angle, and lag. This is where 60% of Wally's emotion lives, and it
   is anatomically correct: ear posture is the primary emotional signal a real elephant broadcasts.
2. **The trunk** — carriage, curl, and tension. 25%.
3. **The brow pads** (§3.3) and **the lashes**, both visible around the shades. 10%.
4. **The mouth and lower lip**. 5%, and only in KO and taunt.

Drive all of it from the existing 15 bones plus vertex morphs. **No new bones.**

### 8.1 Face and head poses

| Pose | Ears (spread from sagittal) | Trunk | Brow / lashes | Mouth | Shades |
|---|---|---|---|---|---|
| **idle** | **34°** (bind half-flare), fanning ±6° at **0.55 Hz** | plumb, slow figure-eight ±0.09 m at 0.28 Hz | neutral; lashes visible below the lens | closed, 4° upturn | on |
| **alert / block** | **42°**, both swung **forward 8°** | curled up in front of the face (existing `block` clip, re-baked per §3.6) | `browLift` +0.008 | closed | on |
| **angry / armored** | **62°, forward and flat** — ear span opens to **1.52 m** | curled **under and back**, tip tucked toward the chest | `browDrop` −0.010, medial ends canted 12° in | corners drop to 0°, lower lip tightens 0.012 | on, `GLINT` → 2.6 |
| **hurt (`hitLight`)** | **20°**, clamped **back** against the head, one ear 6° more than the other | slack, whipping on its spring chain | `browLift` +0.014, 3 creases | opens 0.020 | on, one temple knocked 5° askew |
| **hurt (`hitHeavy`)** | **12°**, fully clamped, both flat back | thrown, full spring travel | `browLift` +0.014 | opens 0.045, tongue not visible | **coat flies open, jigger visible for 1 frame** |
| **KO** | **8°**, dead, hanging with gravity only | limp, coiling on the floor over 0.6 s | lids at **−0.92 rad**, **nictitating membrane half across** | open 0.055, tongue out | **shades detach and tumble** |
| **taunt / `advice`** | **48°**, one ear 10° ahead of the other | **raised to 45° above horizontal, tip flared 1.25×** — the trumpet | `browLift` +0.010 | open 0.035 | on |
| **win** | 40°, settling from 52° over 0.8 s | slow lift to horizontal, then a single dismissive flick | neutral | 4° upturn held | on, `GLINT` pulses 1.8 → 2.4 → 1.8 over 1.2 s |

**Three of those are load-bearing:**

- **`angry` is an ear pose, not a face pose.** A real elephant threatening you spreads its ears wide
  and forward and raises its head. That is the entire display. Opening the ear span from 1.27 m to
  **1.52 m** in 4 frames is the most dramatic silhouette change any fighter in this roster can make,
  it costs two bone rotations, and it happens to be scientifically correct. **Use it for `armor`
  frames** (`herd-charge` has `armor: 6`, `permanent-reserve` has `armor: 10`) so the player can *see*
  armour rather than reading it off a frame-data table.
- **`hurt` is the inverse.** Ears clamped back and flat is the universal mammal submission/pain
  signal, and at 12–20° the character's silhouette **shrinks by 0.30 m of width**. Hurt Wally is
  visibly smaller than angry Wally. That is free readability.
- **The KO must knock the shades off.** It is the only time the audience sees his eyes: tiny,
  amber-brown, half-lidded, with absurd 0.055 m lashes and a third eyelid drifting across. Build the
  eyes properly (§3.4) for this one moment.

### 8.2 Blink and idle life

- **Blink is slow.** **0.28 s** full cycle (close 0.10, hold 0.04, open 0.14), every **4–6 s**,
  randomised, **the two eyes offset by 2 frames** (never synchronous — synchronous blinks read as
  robotic).
- **Nictitating membrane sweep**: once every third blink, the membrane sweeps from the medial canthus
  across and back over **0.18 s**, *after* the lid reopens. It is 70% opaque, so it reads as a faint
  pale wash across the eye. This is a real elephant feature (elephants have a third eyelid and no tear
  ducts) and it will make an observant player look twice.
- **Ear fan: 0.55 Hz, ±6°, the two ears 0.35 of a cycle out of phase.** Never in sync. The existing
  `idle` clip already phase-offsets `earL` and `earR` — keep that, retune the amplitude.
- **Trunk figure-eight**: tip traces ±0.09 m laterally and ±0.05 m fore-aft at **0.28 Hz**, driven
  down the 3-bone chain with each segment lagging its parent by **2 frames**.
- **Tail flick:** every 3.2 s, a single 0.16 rad flick with a 3-frame bristle lag.
- **Breathing:** the torso ellipsoid scales **+1.8% in X and Z** over a 3.4 s cycle. On a body this
  large, breathing is worth more than any other idle motion — and the **coat must not scale with it**;
  the coat sits still and the body moves inside it, which is what makes the wool look like wool.

### 8.3 Secondary motion

| Element | Model | Parameters |
|---|---|---|
| Ears | 1-bone spring per ear, driven by `head` angular velocity | lag **5 frames**, settle **0.22 s**, damping 0.24, overshoot 18% |
| Trunk | 3-bone spring chain | per-segment lag **2 frames** cumulative, damping **0.18**, stiffness falling 1.0 / 0.7 / 0.45 root→tip |
| Tail | 1-bone spring (already implemented) | damping **0.18**; bristle tuft lags a further **3 frames** |
| Coat skirt | 4-point cloth proxy on `hips` | flares to **0.060 m** vent gap on dash/attack recovery, settles 0.30 s |
| Tie blade | 2-segment chain below the tie bar | damping 0.30 — stiffer than everything else; silk over a tie bar barely moves |
| Eyelashes | rigid, parented to the lid | they move with the lid only. Do **not** simulate them. |
| Pocket square | **rigid** | deliberately. It is the one still thing. |

**Follow-through ordering on any big hit:** head → ears (5 f) → trunk seg 1 (2 f) → seg 2 (4 f) →
seg 3 (6 f) → tail (4 f) → coat skirt (6 f) → tie (8 f). Eight elements arriving on eight different
frames is what makes a 2-tonne character feel like 2 tonnes.

### 8.4 Weight and posture in motion

- **Foot-plant squash** (§4.5): pad +6% X/Z, −12% Y, in over 3 frames, out over 6. Every planted
  frame, in every clip. This is the highest-value two lines in the whole animation pass.
- **Wally does not anticipate quickly.** Every attack's startup should read as *mass being committed*:
  the hips lead by **3 frames**, the shoulders follow, the trunk arrives last. On recovery the order
  reverses.
- **He never leans.** No forward-lean idle, no fighting crouch beyond the existing `crouch` clip.
  Shoulders stay level and square through everything except `herdCharge`. The stillness is the joke:
  the market comes to him.
- **`herd-charge` is the one exception** — head drops **14°**, ears go to the **62° threat spread**,
  and the trunk curls **under** (protecting it, which is what a charging elephant actually does).
  That silhouette change, plus the armour, plus the ear span opening past 1.5 m, should be readable
  from the other side of the arena.
- **Impact frames:** on any connecting heavy, hold a **2-frame pose with the ears at maximum spread
  and the trunk fully extended** — the widest, most spread-out silhouette Wally has. Contrast that
  against the clamped-ear hurt pose and the two states are instantly distinguishable at a glance.

---

## 9. Parody safety — MANDATORY

The mandate (`GRAPHICS_CONTRACT.md` §9) is *recognisable archetype and silhouette, changed
proportions, our own colourways and marks*.

**The good news, stated first, because it changes how cautious you need to be.** Unlike the ape
fighter — whose source is a single rights-holder with an aggressive litigation record over a specific
copyrighted artwork — **Wally's source is an *archetype*, and every component of that archetype is
already in wide, unowned circulation:**

- **"Elephant" and "financial stability" is a crowded, generic pairing.** At least three unrelated
  financial companies use an elephant as their primary brand animal — a Canadian insurer that adopted
  it in 1992 for "wisdom acquired through experience… strength and stability", a US motor insurer
  whose entire name is the animal, and an emerging-markets microinsurer that uses a friendly
  forward-facing elephant mascot. When three unrelated firms in the same sector use the same animal
  for the same reason, **nobody owns the association.**
- **The world's largest asset manager does not use an elephant at all.** Its identity is a black
  wordmark on white. So our elephant cannot be confused with its mark, because it has no animal mark
  to be confused with.
- **"Big animal in a suit" is centuries old** and is not anyone's trade dress.

**What is actually risky here is not the elephant. It is (a) the firm's name and wordmark, (b) the
likeness of a specific living executive, and (c) a handful of protected third-party works that sit
adjacent to the "Wall Street" visual language.** Those are the three things the list below protects
against, and the deviation table is a build spec with acceptance criteria, not a rationalisation.

### Never copy — hard prohibitions

1. **No source name, initials, or ticker**, in geometry, textures, decals, mesh names, material names,
   code comments, UI strings, filenames, or the announcer's voice lines. Not the firm's name, not its
   two-syllable compound, not its stock ticker, not the brand names of its ETF or index-fund families,
   not its AI/analytics platform's name.
2. **No wordmark resembling the source's.** Specifically: **do not build a two-word compound
   lettermark set in a heavy grotesque with initial capitals and the rest lowercase, in pure black on
   white.** That description *is* the mark. If a letterform appears anywhere on Wally (the costume-1
   pendant is the only candidate — §7.9), it must be a **single character or an abstract glyph**, in a
   face that is not a heavy neo-grotesque, and never in flat black on flat white.
3. **No caricature of a specific living executive.** The archetype is "giant-institution CEO", not
   any named person. **Do not** give Wally a recognisable individual's rimless glasses, hairline,
   jaw, build, or verbal tics. He is an elephant in wraparound shades; keep him one. Nothing in the
   bio, the win quotes, or the announcer lines may reference a real person's biography.
4. **No replica of the Wall Street charging-bull sculpture.** It is a specific copyrighted artwork by
   a named sculptor with a documented history of enforcement. Wally may not carry, ride, stand on, or
   have a scale model of it, and no arena prop authored for this character may be one. (`BLACKISH
   BULL` is our own bull character and is that agent's problem, under its own brief.)
5. **No other financial-elephant trade dress.** In particular, do **not** produce: a **flat
   single-colour side-profile elephant silhouette paired with a bold lowercase wordmark**; a **grey→
   pinkish-red gradient elephant**; or a **forward-facing smiling cartoon elephant mascot with a
   "connect to happiness"-style friendly-blob treatment**. Those are three separate real companies'
   logos. Wally is a volumetric ¾-turned PBR character in a suit; stay there.
6. **No political-party elephant.** No stars, no star field, no red/white/blue on the character or in
   his portrait treatment, no draped flag, no "G.O.P."-adjacent iconography. This is a *financial*
   elephant and the resemblance would be both legally and tonally wrong.
7. **No eyewear trade dress.** The shades are a generic wraparound shield. **No brand medallion on
   the temple, no distinctive hinge shape, no signature temple-tip flare** copied from any real
   eyewear house. Frame section is a plain 0.026 m square with a 0.004 chamfer, and it stays that way.
8. **No real financial marks anywhere in the character's world.** No real index names, no real
   exchange logos, no real ticker strings on the lens chart, no recognisable fund prospectus, no real
   currency symbols rendered as a brand. The lens glint is an **abstract three-tick rising line with a
   dip**, which is a genre cliché owned by nobody.
9. **No sampled brand colour.** The suit is `#2F3541`, a blue-leaning charcoal — deliberately *not*
   pure black `#000000` (which is the source firm's entire palette) and not a corporate navy. The
   accents are **oxblood and amber**, chosen precisely because they are not the blue/black/grey that
   every real asset manager uses.
10. **No "Wally is the source firm" text anywhere.** The bio (`WallyDef.bio`) is already ours and is
    about tokenising his own face; keep that register. Comedy about the *category* is safe; a joke
    that only works if the player substitutes a real company name is not.

### Deliberate deviations — build these in on purpose

| # | Deviation | Why it protects us | Why it doesn't hurt the read |
|---|---|---|---|
| **D1** | **He is an elephant.** The source has no animal, no mascot, no character, and no visual identity beyond a wordmark. | There is no source artwork to be substantially similar to. | The elephant *is* the joke — the biggest, heaviest, longest-memoried thing in the room. |
| **D2** | **Deliberate species hybrid**: African-type ears (§3.7) on an Asian-type twin-domed head (§3.2) with an Asian convex back (§4.1) and an Asian single-fingered trunk tip (§3.6). | Matches no real species 1:1, so it matches no wildlife photograph or existing character design 1:1 either. | Every choice was made *for* readability — the big ears carry the silhouette, the twin dome carries the profile. |
| **D3** | **Short blunt tusks** (0.345 m arc, 0.030 m blunt tip) instead of long curved sabres. | Distinct from every stock elephant design and every heraldic elephant. | Long tusks would fight the trunk for the same silhouette space and lose. |
| **D4** | **4.0 head-heights, bipedal, arms 0.400 × height, 17% leg taper.** No real elephant has these proportions; no human does either. | Every proportion in §2 and §4 is our invention. | The proportions were derived *from* the 128 px read, not from an animal. |
| **D5** | **Our colourway**: cool blue-grey hide, blue-leaning charcoal, chalk-grey stripe, oxblood, amber, and a green emissive glint. | No black-and-white corporate palette; no grey/pink gradient; no red-white-blue. | The 7.78 : 1 hide-to-suit value step does the identifying, and value survives any hue shift. |
| **D6** | **Double-breasted 6×2 with peak lapels, cutaway collar, full Windsor, two-point amber square, gold tie bar, French cuffs.** This is a *specific* wardrobe of our own composition, not a generic "business suit". | The combination is authored, documented and ours. | It reads as *more* institutional, not less. |
| **D7** | **Small, deliberate breaks with tailoring convention**: tie at 0.44 × lapel width instead of matching it; repp rib running the mirror of the British direction; the bottom cuff button undone on *both* sleeves; a tail port in the centre-back seam. | These are authored quirks, not copied ones. | Nobody but a tailor notices, and the tailor smiles. |
| **D8** | **The strain is designed** (§7.2): two X-drag lines from the buttoning point, three back ripples, one collar gap — the specific diagnostic failures of a coat that is too tight through the body. | Original character design work; it is the *joke*, and jokes about fit are not anyone's IP. | It is the single clearest signal that this is a parody of tailoring, not an attempt at it. |
| **D9** | **Real anatomy nobody else uses**: the nictitating membrane, the temporal gland orifices, the fluted and *torn* ear rims, the vascular tree, the papillae-lattice crack network, the foot-pad spread, the distally-tightening trunk rings. | All of it derived from cited scientific literature, none from any commercial design. | Each one increases the elephant read. |
| **D10** | **Our own name, title, bio, moveset, finisher, voice, costume 1 and portrait treatment.** "WALLY / The Tokenization Titan" is ours; `tokenize-everything` is ours. | No source naming anywhere in the shipped build. | — |

### Build-time compliance check (run these, do not assert them)

1. `grep -riE '<source firm name>|<its ticker>|<its fund-family brand>|<its AI platform name>' src/characters/wally.js`
   → **zero hits**, including in comments, mesh names, material names, `userData` and clip names.
   Run the same grep over `src/ui/`, the announcer string table and the character-select copy.
2. `grep -riE 'charging bull|di modica|bowling green' src/characters/wally.js` → zero hits, and no
   bull-statue geometry in this file.
3. Every mesh/material/bone `name` is generic and functional: `'lapel'`, `'shades'`, `'tuskBand'`,
   `'trunkRing'`, `'pocketSquare'`, `'earPlate'`. No brand vocabulary ships in UI copy.
4. **No hex in the palette (§5) is `#000000`, `#FFFFFF`, or any pure-black/pure-white pair.** Assert
   the 30–240 range on every albedo — that assert incidentally enforces this one.
5. No `decalTexture()` on this character except (a) the tusk Schreger cross-section and (b) the
   costume-1 pendant glyph. Both are our own drawings. **No text decals at all.**
6. The portrait/select background is the arena or our own treatment — never a flat white field with a
   black lettermark.
7. Search the finished model for any recognisable human facial feature. If a reviewer can name a real
   person from the face, remove the feature. He is an elephant.

**If in doubt on any prop: if it carries a name, a logo, or a real institution's trade dress, do not
build it.** Everything else in this brief's vocabulary — elephants, tusks, wraparound sunglasses,
double-breasted suits, peak lapels, chalk stripes, Windsor knots, pocket squares, cufflinks, gold
tie bars — is generic real-world subject matter that the source did not invent and does not own.

---

## 10. Reference notes — what I actually looked at

Everything below was fetched and read during this pass (July 2026). The extracted number is given next
to each source so the implementing agent can see exactly which claim rests on which reference, and can
re-check any of them without repeating the search.

### Elephant anatomy — general

1. **Wikipedia, "Elephant."** <https://en.wikipedia.org/wiki/Elephant>
   Extracted and used in §3.6, §3.8, §4.5, §6:
   - Trunk contains **up to 150,000 separate muscle fascicles**, no bone, little fat, organised into
     superficial (dorsal/ventral/lateral) and internal (transverse/radiating) groups → §3.6's
     "never a smooth cone" rule and the non-circular cross-section.
   - **African trunk tips have two finger-like extensions; Asian have one** → §3.6's tip decision.
   - Tusks are **modified second incisors** of dentine showing **"engine turning" diamond
     cross-hatching**; **at least one-third of the tusk contains the pulp**; growth ≈17 cm/yr; the
     conical enamel cap wears away → §3.8 and the Gore cross-section decal.
   - **Skin ≈2.5 cm thick on the back and parts of the head**, much thinner at the mouth, anus and
     inner ear; **skin cracks reduce dehydration and aid thermoregulation**; sweat glands exist only
     between the toes → §6's density-gradient mask.
   - Skull contains **honeycombed air sinuses** that cut weight while keeping strength → §3.0's "the
     head is a structure, not a face".
   - **Pinnae are 1–2 mm thick in the middle, thinner at the tip**, full of capillaries → §3.7's
     thickness taper and §6's ear-translucency spec.
   - Elephants are **dichromats**, **lack tear ducts** (harderian gland instead) and have a
     **nictitating membrane** → §3.4 and §8.2.
   - **African backs are concave; Asian backs are convex or level.** Foot cushion pads plus an extra
     sesamoid "sixth toe" distribute weight → §4.1, §4.5.
   - African elephants have 21 rib pairs, Asian 19–20; skeleton 326–351 bones.

2. **Wikipedia, "African bush elephant."** <https://en.wikipedia.org/wiki/African_bush_elephant>
   - Bulls **3.04–3.36 m at the shoulder** (record 3.96 m), cows 2.47–2.73 m.
   - **Ears up to 2 m × 1.5 m, triangular** → the 1.33 : 1 real-ear ratio that §3.7 deliberately
     squares to 1.16 : 1.
   - Back **concave in profile**; trunk ends in **two finger-like tips**; tusks curve and grow for
     life (bull tusks average 109 kg at age 60; longest recorded 3.51 m / 117 kg).
   - Grey, sparse hair, **cracks that retain water**.

3. **Wikipedia, "Asian elephant."** <https://en.wikipedia.org/wiki/Asian_elephant>
   - Bulls **≈2.75 m at the shoulder**, cows ≈2.40 m; body length 5.5–6.5 m.
   - **Forehead carries two hemispherical bulges, unlike the flat front of African elephants** →
     §3.2's twin dome, the single most useful sentence in the whole research pass.
   - **Back convex or level, and the highest point of the body is the head** → §2's crown-is-the-apex
     landmark and §4.1's dorsal polyline.
   - **Ears small with the dorsal borders folded laterally** → §3.7's rolled dorsal border.
   - **Depigmentation on the trunk, ears or neck** → `EAR_FRECKLE` in §5 and §3.7 item 7.
   - **Epidermis averages 18 mm, dorsal skin reaches 30 mm.**
   - **One fingerlike trunk tip**; **five nails on each forefoot, four on each hind foot.**

4. **Comparative summaries (ear size/shape, back profile, head shape, tusks).** Search-result
   synthesis across IFAW, Britannica, WCS and A-Z Animals.
   <https://www.ifaw.org/journal/difference-african-asian-elephants> ·
   <https://www.britannica.com/story/whats-the-difference-between-asian-and-african-elephants> ·
   <https://www.wcs.org/get-involved/updates/how-to-tell-an-african-elephant-from-an-asian-elephant>
   - African ears **span up to ~6 ft and are shaped roughly like the African continent**; Asian ears
     are smaller, rounded, and **rarely extend past the neck**. Ear size tracks heat load.
   - African foreheads are **fuller and more rounded**; Asian heads are **twin-domed with a central
     indentation**.
   - Both African sexes grow tusks; among Asian elephants only some males do.

### The skin — the surfacing section rests almost entirely on this

5. **Martins, Milinkovitch et al., "Locally-curved geometry generates bending cracks in the African
   elephant skin," *Nature Communications* 9, 3865 (2018).**
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC6168576/> ·
   <https://www.nature.com/articles/s41467-018-06257-3> · summary:
   <https://phys.org/news/2018-10-african-elephant-skin-cool.html>
   Extracted and used in §6:
   - The channels are **fractures of a brittle, desquamation-deficient hyperkeratinised stratum
     corneum**, formed by bending stress **in the troughs of a quasi-regular lattice of millimetric
     dermal elevations (papillae)** — *not* dried-mud polygons. Newborns have the papillae but no
     channels.
   - **Stratum corneum can easily exceed 300–400 µm** (≈50× human).
   - Channels are **~100 µm wide**, **interconnected**, and propagate **along the troughs**, confined
     between papillae.
   - Junction topology: **triple ~120° (Y) junctions predominate; T-junctions are rare**; simulation
     also produced 90°–135°–135° triples.
   - The network lets the skin **retain 5–10× more water** than a flat surface → §6's cavity-driven
     dust/mud compositing rule, which is the highest-value shader note in this brief.

### The trunk — ring spacing

6. **Kaufmann, Brecht et al., "Elephants develop wrinkles through both form and function,"
   *Royal Society Open Science* 11:240851 (Oct 2024).**
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC11461087/> ·
   <https://royalsocietypublishing.org/doi/10.1098/rsos.240851> · summary:
   <https://www.smithsonianmag.com/smart-news/how-an-elephants-wrinkles-reveal-whether-it-is-right-or-left-trunked-180985247/>
   Extracted and used in §3.6:
   - Adult **Asian ≈126 ± 25 major dorsal wrinkles (155 total)**; adult **African ≈83 ± 13 major
     (109 total)**.
   - **Significantly more dorsal (mean 77) than ventral (mean 47)** → our 18 dorsal vs 11 ventral
     modelled rings.
   - **Spacing decreases distally**: African calf mid-trunk wavelength **5.98 ± 1.43 mm** vs distal
     **3.29 ± 0.88 mm**; Asian **3.64 ± 0.86** vs **2.68 ± 0.56**; both converge to **≈3 mm** near
     the tip → the **0.935 geometric progression** in §3.6, which is the single most important number
     in that subsection.
   - Skin **≈1.3 mm thick at wrinkle crests vs ≈0.6 mm in troughs** (thinner dermis) → the asymmetric
     ring profile.
   - Asian trunks show a **wrinkle-dense "wrapping zone" in the distal third**; ~10% more wrinkles on
     an individual's preferred wrapping side (trunk "handedness") → §3.6's left/right asymmetry option.
   - African calf trunk length 63 cm; Asian 36 cm (at the ages sampled).
   - **African tip: dorsal + ventral finger. Asian tip: one dorsal finger + a ventral cartilage
     stump.** The ventral finger develops first (≈E120–130).

### Tusks, feet, eyes

7. **Schreger lines / ivory identification.** CITES *Identification Guide for Ivory and Ivory
   Substitutes* <https://cites.org/sites/default/files/eng/resources/pub/E-Ivory-guide.pdf> ·
   Wikipedia "Schreger line" <https://en.wikipedia.org/wiki/Schreger_line> ·
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC5268646/>
   - The chevron/"engine turning" pattern's **average angle > 115° indicates elephant ivory; < 90°
     indicates mammoth/mastodon**, with an overlap band between → §3.8's **118°** normal-map angle.
   - **Outer** Schreger lines sit near the cementum; **inner** lines near the pulp cavity.
   - The section must be cut square to the tusk axis or the angles distort — relevant to the Gore
     cross-section decal.

8. **Elephant foot structure.** Weissengruber et al. (structure of the cushions in African elephant
   feet) <https://pubmed.ncbi.nlm.nih.gov/17118065/> plus toe-count summaries.
   - **Asian: 5 front / 4 hind nails. African bush: 4 front / 3 hind** → §4.5's four nails per foot.
   - A **fibroelastic digital cushion** plus a cartilaginous **prepollex (manus) / prehallux (pes)**
     "sixth toe" lets the foot **expand on contact**, spreading the load and preventing sinking →
     §4.5's +6%/−12% plant squash.
   - Nails are **hardened dermal growths, not attached 1:1 to the skeletal digits** — which is why
     giving Wally four nails on a foot with a different internal structure is anatomically defensible.

9. **Elephant eyes and temporal glands.** SeaWorld senses page
   <https://seaworld.org/animals/all-about/elephants/senses/> plus secondary summaries.
   - Eye diameter **≈3.8 cm (some sources to 5 cm)** — **under 1% of head size** → §3.4's 0.141 × W_s
     aperture and the §3.0 warning about big expressive eyes.
   - **Eyelashes reach ~5 inches (≈12.7 cm)** → §3.4's 0.055 m lashes (0.89 × aperture width).
   - Eyes are **set on the sides of the head** for a wide field of view → §3.4's ±0.352 × W_s lateral
     placement and the "far eye must stay visible in ¾" rule.
   - **Temporal glands sit just behind the eye** in both species → §3.3's fossa and orifice.

### Tailoring

10. **Wikipedia, "Double-breasted."** <https://en.wikipedia.org/wiki/Double-breasted>
    - Button stance notation: **first number = total front buttons, second = fastening buttons below
      the lapels** (6×2, 6×1, 4×1 "Kent", etc.) → §7.2's 6×2.
    - Defining feature is **wide overlapping front flaps with two symmetrical columns**; fastens
      **left over right**.
    - **Usually peak lapels.** Usually **jetted pockets**. An internal **jigger / anchor button**
      parallel-fastens the overlapped layers from inside → §7.2 and §6 micro-detail 5.
    - Six buttons can overwhelm a short torso — which is why our button rows are spread over
      0.280 m of a very tall front.

11. **Gentleman's Gazette, "The Anatomy of a Suit Jacket."**
    <https://www.gentlemansgazette.com/the-anatomy-suit-jacket/>
    - **Lapel widths 2½–4+ in**; standard notch ≈3½ in; **peak lapels typically 4+ in** → our
      0.260 m (≈0.283 × chest width) for a double-breasted coat on a very large chest.
    - **Gorge** = collar/lapel meeting point; proper placement aligns with the shoulder line.
    - **Lapel belly** = the convex curve on the outer lapel edge → §7.2's 0.016 m sagitta.
    - **Lapel roll** = the fold at the lower lapel creating a hollow beneath, prized in bespoke →
      §7.2's 0.032 m roll radius and 0.022 m stand-off, which is the most important tailoring number
      in this brief.
    - **Roped shoulder / `spalla con rollino`** = sleevehead attached higher than the shoulder,
      making a ridge; **pagoda / `spalla insellata`** = slightly concave, saddle-roof sweep →
      §7.2's 0.014 m rope and 0.010/0.014 m pagoda cant.
    - **Barchetta** = curved boat-shaped Neapolitan breast pocket → §7.2.
    - **Kissing buttons**, **surgeon's cuffs**, **Milanese buttonhole**, quarters open vs closed,
      waist suppression, drape cut, double vents preferred → §7.2, §7.3, §6 micro-detail.
    - Full canvas covers both front panels **and the lapels**, which is what allows a lapel to roll
      rather than crease.

12. **Suits Expert, "Suit Lapels Guide."** <https://www.suitsexpert.com/blog/suit-lapels-guide/>
    - Peak lapels **3.5–4.5 in**; slim ≈2.5 in on a ≤38 in chest, wider 3.5 in+ over a 40 in chest —
      i.e. **lapel width scales with the wearer**, which is the licence for a 0.260 m lapel on a
      0.920 m chest.
    - The lapel's **widest point should sit around the midpoint between the shoulder seam and the
      start of the lapel** → §7.2's "widest at 58% down the roll line".
    - **Tie width should roughly match lapel width** — the convention §7.5 deliberately breaks, and
      says so.

13. **Shoulder construction.** Michael Andrews <https://www.michaelandrews.com/shoulder-styles-guide/>
    and De Oost <https://www.deoost.com/three-roll-two-jacket-unlined-neapolitan-inspired>
    - Roping detail, `spalla camicia` shirring, and the pagoda's *concave then rising* line
      ("architectural rather than merely padded") → §7.2's shoulder spec.

14. **Suit-fit diagnostics — the X-pull.** Sartoro <https://sartoro.co/blogs/sartorial/how-should-a-suit-jacket-fit> ·
    Suits Expert <https://www.suitsexpert.com/blog/suit-fit/> · Hockerty
    <https://www.hockerty.com/en-us/blog/how-should-a-suit-fit>
    - **An X-shaped pattern of wrinkles radiating from the buttoning point means the jacket is too
      tight through the body**, and it cannot be fixed by alteration — it is a structural failure.
      → §7.2's designed strain, which is the mechanically correct way to draw "this suit does not fit
      this animal".

15. **Stripe geometry.** Bond Suits <https://www.bondsuits.com/a-guide-to-bonds-pinstripes-and-chalk-stripes/>
    plus Husbands Paris and general guides.
    - Pinstripe = "the width of a pin scratch", often woven separately on a dobby loom; measured
      examples include **six pinstripes per inch (≈4.2 mm repeat)** and **half-inch spacing
      (≈12.7 mm repeat)**.
    - **Chalk stripes are woven into the warp, two to five yarns wide, roughly two to four yarns of
      every forty** → a **5–12.5% duty cycle**, which is exactly §7.2's 0.005 m stripe on a 0.050 m
      repeat (10%).
    - Pinstripes appear almost exclusively on smooth worsted, because only a tight worsted renders
      them cleanly → §6's `suit-wool` choice and the 63° twill.

16. **Pocket-square folds.** Wikipedia, "Pocket square" <https://en.wikipedia.org/wiki/Pocket_square>
    - Named folds: presidential/flat, puff, reverse puff/crown, winged puff, **one-, two-, three- and
      four-point**, Cagney, Astaire, TV fold, straight and diagonal shell. The **two-point fold** is
      "folded off-centre so two points do not overlap" → §7.6.

17. **Shirt collars.** Wikipedia, "Dress shirt" <https://en.wikipedia.org/wiki/Dress_shirt>
    - **Spread/cutaway collars measure 3½–8½ in (89–216 mm) between the points**; **point collars
      2½–4 in (64–102 mm)**; the widest spreads are called cutaway or Windsor collars, and the style
      is the more formal city look → §7.4's 0.200 m point-to-point at a 112° spread.
    - Cuff types: barrel, **double/French** (folded back, cufflinks), single, Milanese → §7.4.

18. **Tie knots.** Wikipedia, "Necktie" <https://en.wikipedia.org/wiki/Necktie>
    - The four canonical knots in ascending bulk: **four-in-hand, Pratt/Shelby, half-Windsor,
      Windsor**; the mathematical treatment selected 13 knots as "aesthetic" on **symmetry and
      balance**; **the dimple** is called out as a defining feature → §7.5's full Windsor + mandatory
      dimple.

### Legal / brand context

19. **The source firm's identity.** 1000logos <https://1000logos.net/blackrock-logo/> ·
    Logos-World <https://logos-world.net/blackrock-logo/> · Decker Design
    <https://deckerdesign.com/work/blackrock-brand-update/>
    - The mark is a **wordmark with initial capitals and the rest lowercase, in a heavy grotesque,
      in black on white** (with a white-on-dark-blue variant); the identity has since evolved toward
      a broader palette and illustration. **There is no animal, no crest and no mascot.**
      → §9.2 (the exact description of what not to build) and §9's opening argument that the elephant
      itself carries no confusion risk.

20. **Elephants in financial branding — the crowded field.** Logos-World "Most Famous Logos with an
    Elephant" <https://logos-world.net/most-famous-logos-with-an-elephant/> · iA Financial brand page
    <https://ia.ca/about-us/brand-image> · Admiral Group <https://en.wikipedia.org/wiki/Admiral_Group>
    - A Canadian insurer **adopted the elephant in 1992** for "wisdom acquired through experience,
      listening, a sense of responsibility and family, strength and stability".
    - A US motor insurer under a UK group uses an elephant **in hazy grey-to-pinkish-red gradients
      behind a bold yellow lowercase wordmark**.
    - An emerging-markets microinsurer uses a **friendly forward-facing elephant mascot**.
    - Conclusion used in §9: the elephant/finance association is **generic and multiply-owned**,
      which is protective — but the three specific executions above are **not** generic and must be
      avoided by name of treatment (§9.5).

### Codebase

21. `GRAPHICS_CONTRACT.md` §0 (albedo 30–240, 250k tri / 900 draw budget, the five AAA criteria),
    §3 (`surfaceMaps` kinds and opts, `decalTexture`, `gradientRamp`, `triplanarDetailNormal`),
    §4 (`pbr()`, `SURFACE`), §9 (the WALLY row's non-negotiable cues, the no-gaps and bevel rules,
    the frozen-rig rule), §10 (arena moods this character must survive).
22. `src/render/textures.js` — the `KINDS` registry at line 821; confirmed the presence of every kind
    §6 asks for: `skin-elephant` (1040), `skin-smooth` (945), `suit-wool` (1263), `cloth-weave` (1149),
    `leather` (1297), `bone` (2165), `horn` (2200), `gold` (1539), `metal-painted` (1467),
    `glass` (1962), `mud` (1901), `sand` (1870), `fur-coarse` (910), `plastic-matte` (1357),
    `plastic-gloss` (1382). **No new kind is required by this brief.**
23. `src/characters/wally.js` — `buildModel()` (lines 71–199), the `C` palette (11–22), the
    `bent()`/`pivot()` helpers (52–66), all 31 clips, the 19 move scripts, `WallyDef` (1026+),
    and the `tokenize-everything` finisher. Bone pivots in §0's frozen table were read directly out of
    `buildModel()`. The trunk-bake deltas in §3.6 were computed against the current
    `bent(trunk, 0.85)` / `bent(trunk2, −0.55)` / `bent(trunk3, −0.7)`.
24. `docs/parody/tired-ape.md` — used to calibrate format, depth and the rigour bar. Where this brief
    and that one disagree on a *general* rule (eye size as a fraction of head width, neck-lens
    negative space, arm length vs knee), the disagreement is deliberate and is called out in place;
    Wally is built as the deliberate inverse of the ape on all three.

### What is still unverified

- **No pixel measurements were taken off any source imagery**, because unlike the ape fighter there
  *is* no canonical source artwork to measure — the archetype is a company, not a picture. Every
  proportion in §2–§4 is derived from real elephant anatomy plus the 128 px readability arithmetic,
  not copied from a reference image. That is a feature (§9 D4), but it means **§2's landmark table has
  never been eyeballed in-engine.** Render the black-fill silhouette first, before building any
  detail, and adjust the table *once*, then rebuild to it.
- The **ear-to-shoulder wedge (§2 negative space A)** is the one number I am least confident in,
  because it depends on the final shoulder padding, which depends on the coat's canvas thickness.
  Measure it in the ¾ idle pose and report the actual value.
- The **chalk-stripe mip behaviour** (§6) needs an actual multi-resolution test. If the stripe still
  moirés at 256 px with `aniso 8`, drop the duty cycle to 8% rather than widening the repeat.

---

## 11. Acceptance checklist — measure these, do not eyeball them

Run in this order. Each one is a number you can print, not a judgement.

**Silhouette (do this first, before any detail)**

1. Render filled-black at **128 px** for a 2.00 m figure (1 px = 0.015625 m). Confirm:
   ear span **1.272 m (81.4 px)** > shoulder span **1.100 m (70.4 px)**; overhang **≥ 0.086 m
   (5.5 px) per side**.
2. Trunk vertical run **0.650 m (41.6 px)**, width **0.240 → 0.100 m (15.4 → 6.4 px)**, and it stays
   **≥ 0.045 m proud of the coat front in profile** along its whole length.
3. Tusk tips clear the trunk's lateral wall by **≥ 0.065 m (4.2 px) per side**.
4. Jacket hem is a hard horizontal terminus at **y = 0.880**, width **0.880 m (56.3 px)**, and
   **0.210 m (13.4 px) of bare foot** is visible below the trouser cuff.
5. Leg gap at knee height **≥ 0.160 m (10.2 px)**; arm-to-body gap **≥ 0.075 m (4.8 px)**; ear-to-
   shoulder wedge **≥ 0.070 m (4.5 px)** in the ¾ idle pose.
6. Overlay the render against §3.10's front-view polygon. **Every point within ±0.02 m.**
7. Ask three people who have not read this brief what animal it is and what it is wearing. Two
   correct answers out of three within two seconds, or the silhouette is not done.

**Proportion**

8. Figure = **4.00 head-heights** (crown 2.000, chin 1.500). Head **1.14× taller than wide**.
9. Eye aperture width / W_s = **0.141 ± 0.005**. If it is above 0.20 the head has drifted human.
10. Leg taper **17% ± 3%** end to end. Arm : height **0.400**. Knuckle **0.120 m above** the knee.
11. Waist suppression **6% ± 1%**. Belly wider than chest.

**Colour and value**

12. Assert every albedo channel is **≥ 30 and ≤ 240**. One line, run it in a test.
13. Compute Y for `HIDE` and `SUIT`; ratio must be **7.78 : 1 ± 0.3**.
14. Desaturate a 128 px render: hide still separates from suit, the lens band is still the darkest
    thing on the head, the shirt triangle is still the brightest thing on the torso.
15. No hex equals `#000000` or `#FFFFFF`. No pure black/white pair anywhere.

**Surface**

16. `surfaceKinds()` contains every kind §6 names. Zero `console.warn` fallbacks at load.
17. Screenshot the flank at 30 cm: crack channels run **along the papillae troughs**, junctions are
    predominantly **Y at ~120°**, **~25% dead ends**, and **dust appears only in the channel floors.**
18. Roughness variance on the wool is **non-zero** (±0.08). Screenshot the roughness buffer and check.
19. Backlight one ear: the outer 0.10 m of rim glows, the vascular tree silhouettes darker inside the
    glow, and the rolled border stays opaque.
20. Render the coat at 128 / 256 / 512 px: the chalk stripe must **dissolve cleanly**, with no moiré
    at any of the three.

**Rig, budget and safety**

21. Every bone name and pivot offset matches §0's frozen table exactly. Diff it.
22. Apply the §3.6 trunk-bake deltas to all 31 clips, then play `idle`, `block`, `trunkSlap`,
    `tornado` and `advice` and confirm the world-space trunk pose is unchanged from the current build.
23. Measure and report **triangle count (≤ 34,000)** and **draw calls in bind (≤ 42)**.
24. Confirm **six** `InstancedMesh` groups exist (rings, nails, lashes, tail bristles, trunk
    bristles, buttons).
25. Walk every joint in every clip at 200% zoom: **zero visible gaps**. Sleeve, cuff, collar, ring
    collar, ear-root burial.
26. Dismember each limb and the head via `Gore`: props travel with the correct bone, the tusk break
    shows the Schreger disc with a 34% pulp cavity, nothing is left floating.
27. Run all seven greps and searches in §9's compliance list. **Zero hits.**
28. Verify `buildModel(0)` and `buildModel(1)` both build, and that costume 1's chain is 24 instanced
    toroids in a catenary, not spheres.
