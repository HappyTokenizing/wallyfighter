# TIRED APE — parody-likeness build brief

**Fighter:** `src/characters/tired-ape.js` · `TiredApeDef` · `id: 'tired-ape'`
**Source archetype:** the bored-ape PFP NFT collection (10,000 generative cartoon ape avatars).
**Contract authority:** `GRAPHICS_CONTRACT.md` §9 (parody mandate), §3/§4 (surfaces & materials), `CONTRACTS.md` §4 (rig — do not change).
**Author:** character-art-direction pass, research-backed. Every number below is derived from measurements
taken off source imagery or from cited anatomy sources — see §10. Build to the numbers, not the adjectives.

**Rev 2 (July 2026) — hostile-critic pass.** Source metadata and imagery re-fetched and re-measured;
three factual claims about the source corrected (§1), the head's vertical coordinate system rebuilt
so §2 and §3 agree (§3.0 is now the authority), four geometrically impossible constructions replaced
(muzzle primitive, lip band, tooth arcade, ear orientation), all §5 luminance values recomputed and
three contract-violating albedos fixed, the legal section brought up to the April 2026 settlement,
and a budget (§6.5) and acceptance checklist (§11) added. **If two numbers in this file disagree,
the §2 landmark table and §3.0 win.**

### Axis convention (get this right first)
The rig faces **+X**. In this file and in the existing code, `box(w,h,d)` means
**w → X (forward/depth), h → Y (up), d → Z (lateral width)**. Ears sit at `z = ±…`.
Feet at `y = 0`. `def.height = 1.90` (this fighter is *slouched* — his erect-spine
equivalent would be ≈2.06 m, which is the joke). All metre values below are in this space.

### Rig is frozen
`buildModel(costume)` must keep returning exactly these bone names, in this hierarchy
(31 clips and 19 move scripts key off them):

```
group > hips > { robe, legL, legR, torso }
torso > { head > { earL, earR }, armL > forearmL > mug, armR > forearmR }
```

`hips` base local position stays `[0, 0.85, 0]` — clip keys are **absolute** hip positions.
No new bones. No meshes parented directly to `group`. Everything hangs off a bone, because
`Gore._detach()` clones a bone's whole subtree and hides the original — that is how props
survive dismemberment (§7).

---

## 1. The 2-second test

**A brown ape head turned into a three-quarter view, whose whole lower face is one continuous pale
sand-tan skin mask — two heavy half-shut eyes sitting inside pale rounded-rectangle eye patches at
the top of it, two big dark kidney-shaped nostrils in the middle of it, and a thin wide closed lip
line right at the very bottom edge of a long hanging muzzle — flanked by two big pale-centred round
ears set out sideways like satellite dishes, wearing a slouchy ribbed knit beanie cocked back off
the brow with a cigarette hanging out of one corner of the mouth.** That is the read.

Three things in that sentence are load-bearing and are the ones builds usually get wrong:

1. **The mask is ONE shape, not three patches.** It runs from the brow pads, across the bridge, over
   both nostrils and all the way down over the whole muzzle to the chin, with a waist at the
   cheek line. §3.9 gives its outline as a polygon. Against `APE_FUR` it is a 4.9:1 value step
   (§5), which is what makes it survive to 64 px. This is the single most identifiable thing about
   the source.
2. **The default mouth is CLOSED and shows no teeth.** The source's two most common mouths (`Bored`
   215/900, `Bored Unshaven` 127/900) are a thin, wide, closed lipped line with a fat lower lip
   roll, sitting at 0.09 × head-height above the chin. **Teeth are a pose, never the base mesh**
   (§3.6, §8.1). A permanently grinning ape reads as `Grin` — a different, much rarer trait — and
   loses the boredom that is the entire joke.
3. **The framing is three-quarter, not head-on.** Every token in the collection is drawn as the same
   ¾ turn (head rotated ≈25–30° off axis toward the viewer's left, chin slightly down, one ear
   presenting more of its face than the other). Verified on tokens #102 and #314. This is our
   **portrait/select pose**, and it is why the character's asymmetry (§9 D9) is an *amplification*
   of the source's composition, not a deviation from it.

Everything else — the gold hoop, the boat-neck stripes, the chain, the robe, the coffee mug — is
confirmation, not identification. If a viewer has to see the beanie to name the reference, the head
geometry has failed.

Second beat, half a second later: the **posture**. Long arms hanging past the knees, knuckles low,
shoulders rolled forward, head sunk and carried in front of the shoulder line. Bored, heavy, and
absolutely not going to hurry. (The source's own neck is long and thin; we shorten it deliberately —
see §2 and §9 D3 — but the **neck lens** negative space must survive the shortening.)

---

## 2. Silhouette specification

Total silhouette height **1.90 m**, head height (skull crown → bottom of chin, beanie excluded)
**0.38 m** → the figure is **5.0 head-heights**. This is deliberately squat: a 7.5-head hero
proportion destroys the read. Head width **across the ears is 0.45 m** — i.e. the head is
**1.18× wider than it is tall**, and **0.237 H** wide overall.

### Vertical landmark table (feet at y = 0) — AUTHORITATIVE

Every number in §3 derives from this table via `head`-local y = world y − 1.500 (§3.0).
If a number elsewhere in this file disagrees with this table, this table wins.

| Landmark | world y (m) | `head`-local y | above chin | fraction of H (1.90) | head-heights from floor |
|---|---|---|---|---|---|
| Beanie crown (silhouette top) | 1.900 | +0.400 | 0.480 | 1.000 | 5.00 |
| Beanie cuff front edge | 1.746 | +0.246 | 0.326 | 0.919 | 4.59 |
| Skull crown (fur) | 1.800 | +0.300 | 0.380 | 0.947 | 4.74 |
| Brow ridge top edge | 1.732 | +0.232 | 0.312 | 0.912 | 4.56 |
| Brow ridge underside (overhang lip) | 1.684 | +0.184 | 0.264 | 0.886 | 4.43 |
| **Eye aperture centre line** | **1.663** | **+0.163** | **0.243** | 0.875 | 4.38 |
| **Ear centre** (same line as the eye) | **1.663** | **+0.163** | **0.243** | 0.875 | 4.38 |
| Nostril centre line | 1.614 | +0.114 | 0.194 | 0.849 | 4.25 |
| Muzzle widest point | 1.546 | +0.046 | 0.126 | 0.814 | 4.07 |
| Upper-lip band top edge | 1.492 | −0.008 | 0.072 | 0.785 | 3.93 |
| **Mouth line** (aperture centre) | **1.454** | **−0.046** | **0.034** | 0.765 | 3.83 |
| **Chin** / bottom of lower-lip roll | **1.420** | **−0.080** | **0.000** | 0.747 | 3.74 |
| Acromion (shoulder top) | 1.320 | — | — | 0.695 | 3.47 |
| Chest apex | 1.200 | — | — | 0.632 | 3.16 |
| Waist / robe sash | 1.020 | — | — | 0.537 | 2.68 |
| Hip pivot (`hips` bone) | 0.850 | — | — | 0.447 | 2.24 |
| Robe hem | 0.620 | — | — | 0.326 | 1.63 |
| Knee | 0.446 | — | — | 0.235 | 1.17 |
| Knuckle (arms hanging, idle) | 0.320 | — | — | 0.168 | 0.84 |
| Ankle | 0.099 | — | — | 0.052 | 0.26 |

Source ratios this table reproduces exactly (token #314, §10): eye line **0.64 × H_h** above the chin
(0.36 down from the crown), nostril line **0.51 × H_h**, mouth line **0.09 × H_h** (0.91 down from
the crown — the mouth is *nearly at the chin*).

Note the two numbers that carry the whole gag: **chin at 1.420 vs acromion at 1.320** — only
**0.100 m of neck is visible**, the head is sunk into the shoulders. And **knuckles at 0.320 vs knee
at 0.446** — the hands hang **0.126 m below the knee**.

> **Rig-consistency gate.** Acromion 1.320 + shoulder→knuckle 1.00 (§4.2) = knuckle 0.320. Hip 0.850
> − femur 0.410·cos10° = knee 0.446. Knee − tibia 0.350·cos8° = ankle 0.099. These four numbers are
> a closed chain: if you change one, recompute the others *and* re-verify the reach constants in the
> 19 move scripts against the existing harness (`GRAPHICS_CONTRACT.md` §9, last bullet).

### Where the mass sits
- **Head + beanie = 0.480 m of the 1.90 m (25% of height), but ~34% of the perceived visual mass.**
  This is a head-forward design. Do not let the torso out-mass it.
- **Above-waist mass : below-waist mass ≈ 62 : 38.** Heavy top, short legs, low centre of gravity.
- **The widest point of the *head* is the ears at 0.450 m, sitting at 0.875 H.** The shoulders at
  0.660 m are the widest thing on the figure in absolute terms, but they sit 0.36 H lower and read
  as a base. From the front the figure is a **T on a stump**: the eye reads ear-span first because
  it is isolated against background on both sides, then drops to the shoulder line.

### Must survive filled-black at 128 px

At 128 px for a 1.90 m figure the scale is **1 px = 0.01484 m**. Every claim below is stated in
both metres and pixels at that scale so you can check it in a screenshot instead of arguing about it.

1. **The muzzle step.** The skull-to-muzzle transition must break the head profile — from the side
   the muzzle's front plane sits **0.160 m (10.8 px) forward of the brow-ridge front face**
   (x = +0.100 → +0.260, §3.5), producing a distinct step-then-ramp in the silhouette. If the head
   reads as one ovoid, it is wrong.
2. **Ear satellites.** Both ears must read as separate circular lobes. Ear diameter **0.152 m
   (10.2 px)** = 0.40 × H_h = 0.67 × W_s, and each ear projects **0.111 m (7.5 px) clear of the
   skull silhouette**, which is 73% of its own diameter. *The notch is not a gap:* the ear disc's
   inner edge is buried 0.035 m inside the skull surface, so what must read is a **modelled concave
   valley 0.018 m deep** where the rim meets the skull at the ear's front-lower quadrant. A gap
   there would violate the contract's no-gaps rule.
3. **The beanie step.** The rolled cuff of the knit cap makes a 0.035 m (2.4 px) ledge across the
   crown at a **17° cant** — the silhouette top is not level.
4. **Long arms.** The arm line must cross the robe hem (y = 0.620) and reach **0.126 m (8.5 px)
   past the knee** (knuckle 0.320 vs knee 0.446).
5. **The cigarette.** The only thin element permitted to break silhouette: 0.115 m long × 0.010 m
   diameter = **7.8 px × 0.7 px** at this scale, angled **−22° from horizontal** out of the mouth
   corner. **Be honest about this: at 128 px it is a sub-pixel-wide streak that only survives with
   AA, and it is not part of the 128 px read.** It is a 1 m read cue. Keep it, but do not thicken
   it to force a 128 px read — a fat cigarette reads as a cigar, which is a different (and much
   rarer) source trait.

### Negative space (this is what actually defines the shape)
- **The neck lens.** Neck width **0.124 m** = 0.54 × W_s (source: 90 px neck / 165 px cranium =
  0.545). With the chin at 1.420 and the acromion at 1.320, the visible neck band is 0.100 m tall.
  Inside that band, **at least 0.050 m (3.4 px) of background must be visible on each side of the
  neck** at its narrowest point, between the jaw underside and the rising trapezius. If the neck
  fills that gap the head fuses to the body and the whole silhouette dies. This is the constraint
  that limits how far the head can be sunk — do not sink it further to "sell the slouch".
- **Two shoulder triangles.** Between the underside of each ear, the outside of the neck, and the top
  of the trapezius (32° slope, §4.1) there is a triangular void ≈**0.16 m base × 0.10 m tall**.
  Do not let the fur ruff or the robe collar fill it.
- **The hoop void.** The gold hoop earring's inner diameter is **0.048 m = 3.2 px** and must stay
  open. It reads as a hole, and a hole is a memorable silhouette event. Its plane must face the
  camera (§7.3) — a laterally-facing hoop is an invisible edge-on line.
- **Arm-to-ribcage gap** never closes below **0.060 m (4.0 px)** in the idle pose. Arms hang *away*
  from the body.
- **Under-muzzle shadow gap.** The lower-lip roll overhangs the throat by 0.030 m, cutting a hard
  dark line under the chin. That line is what separates head from neck at distance.
- **Between the legs**, the stance leaves a **0.28 m (18.9 px)** gap at knee height. Do not close it
  with the robe — §7.5's front split exists for this.

---

## 3. Head construction (the most important section)

### 3.0 The head frame — read this before touching a number

All coordinates are **`head`-bone-local**. The `head` bone pivot sits at **world (0, 1.500, 0)** in
the bind pose. Therefore:

```
head-local y  =  world y − 1.500
head-local y  =  (height above chin) − 0.080
chin  = −0.080     fur crown = +0.300     H_h = 0.380
```

`x` is **forward** (the rig faces +X), `z` is **lateral**, `y` is up — see the axis convention at the
top of this file. Reference measurements were taken off two source tokens at 631×631 px and converted
at **1 px = 0.001382 m** (see §10).

Two master units, used everywhere below:
- **W_s = 0.228 m** — skull width, ears excluded. Master unit for everything horizontal on the face.
- **H_h = 0.380 m** — head height, fur crown → chin, beanie excluded. Master unit for everything
  vertical.

### 3.1 Cranium
- Base primitive: `IcosahedronGeometry(0.114, 3)` (or a 24×18 sphere), scaled
  **(0.95 X, 1.20 Y, 1.00 Z)**, centred at **(−0.012, +0.163, 0)**.
  Resulting half-extents: **X ±0.108** (front face x = +0.096, back x = −0.120),
  **Y ±0.137** (crown +0.300, base +0.026), **Z ±0.114** → skull width **0.228 m = W_s** ✓,
  skull height **0.274 m = 0.72 × H_h**.
- The ellipsoid centre is **on the eye line (+0.163)** on purpose: the widest point of the cranium is
  at eye level, not at the temples. Do not raise it — that is what makes the head read as
  bottom-heavy and slabby rather than as a dome.
- **The frontal plane is FLAT, not spherical.** Flatten the forward face: push every vertex with
  `x > +0.040 && y > +0.190` back onto the plane through **(+0.096, +0.232, 0)** with normal
  **(0.94, 0.34, 0)** — i.e. the forehead is a plane raked **20° back from vertical**
  (atan(0.34/0.94) = 19.9°). This is the "broad flat face plane" cue. A round forehead makes it a
  monkey, not *this* ape.
- The skull **narrows upward**: at y = +0.242 the width is **0.185 m (81% of W_s)**; at the crown
  it has closed to nothing.
- Sagittal crest: none. A crest reads gorilla. There is **0.068 m of fur forehead** between the
  brow-ridge top plane (+0.232) and the crown apex (+0.300) — that is where the beanie cuff lands
  (§7.1) and it must not be squeezed to zero.
- Bevel every silhouette edge at **0.008 m**, 2 segments.

### 3.2 Brow ridge
- A continuous shelf spanning both orbits and crossing the midline (a **supraorbital torus**, which in
  *Pan* is one unbroken projecting bar with a shallow **supratoral sulcus** groove behind it —
  build that groove, it catches key light and is 60% of the "heavy" read).
- Geometry: bevelled box **0.070 X × 0.048 Y × 0.212 Z**, **front face at x = +0.100**, **top edge at
  y = +0.232**, **underside lip at y = +0.184**, rotated **−7° about Z** so it overhangs the eyes.
  Chamfer 0.010, 3 segments. Its back face (x = +0.030) is buried 0.066 m inside the cranium's front
  face (+0.096) — that overlap is deliberate, it welds without a seam.
- Span check: 0.212 Z inside a 0.228 W_s skull leaves 0.008 m of fur outboard of each brow end.
- Supratoral sulcus: a **0.012 m deep × 0.020 m tall** channel immediately behind the torus top edge
  (spanning y = +0.232 → +0.252 at x ≈ +0.070), running the full 0.212 m span.
- The torus is **thicker laterally than medially**: 0.052 Y at the outer trigones, 0.040 Y at glabella.
- **Two separate overhang numbers, do not conflate them:**
  - the brow's front face (+0.100) is **0.014 m forward of the eyeball's forward pole** (+0.086);
  - the brow's *underside lip* is **0.026 m forward of the upper-lid edge** (x ≈ +0.074).
  The second one is what puts the eyes in permanent shadow and creates the "dead-eyed" read without
  any painted darkness.

### 3.3 Eyes
Numbers, in order of importance:

| Property | Value | As ratio |
|---|---|---|
| Sclera aperture width (visible white slot) | 0.078 m | **0.34 × W_s** |
| Aperture height, idle | 0.026 m | **0.33 × aperture width** |
| Full eye almond (lid to lid, open) | 0.110 m × 0.068 m | 0.48 × W_s wide |
| Eyeball sphere radius | 0.036 m | 0.158 × W_s |
| Eye centre, lateral | z = ±0.070 m | ±0.31 × W_s |
| Eye centre, vertical | y = **+0.163** (0.243 above chin) | **0.64 × H_h** |
| Eye centre, forward | x = **+0.050** | eyeball pole reaches +0.086 |
| Aperture outer corner, lateral | z = ±0.109 m | ±0.48 × W_s |
| Inner-corner separation | 0.062 m (corners at z = ±0.031) | 0.27 × W_s ≈ one aperture width |
| Upper lid coverage, idle | **62% of the eyeball's visible height** | — |

Consistency check you can run in the console: eye centre ±0.070 ± aperture half-width 0.039 gives
inner corners at ±0.031 (separation 0.062 ✓) and outer corners at ±0.109, which is **inside** the
skull half-width 0.114 by 0.005 m. The periocular mask below must therefore reach ±0.112, not
±0.098 — otherwise the outer eye corner falls outside its own mask.

- **Build real eye geometry.** Eyeball sphere r 0.036 (`skin-smooth`, `APE_SCLERA`), iris disc
  r 0.0155 inset at the front, pupil r 0.0068. A separate **cornea** sphere r 0.038 with the `glass`
  preset (roughness 0.04, clearcoat 1.0, transmission 0) sits over the iris so it catches a real
  specular dot. That dot is the only bright pixel in the eye socket and it is what makes the
  half-lidded stare read as *tired* rather than *blind*.
- **Lids are geometry, not texture.** Upper and lower lids are lens-shaped shells swept at radius
  0.040 about the eyeball centre, **0.006 m thick** so the lid edge has a lit rim. Upper lid pivots
  about the eyeball centre; `openRad = 0` at fully open, idle sits at **−0.55 rad** (62% closed),
  `hitReact` snaps to **−0.10 rad**, KO to **−1.15 rad** (shut).
- **Lid shape:** the upper lid edge is not an arc — it is a shallow **S**. It runs nearly horizontal
  across the inner two-thirds, then **dips 0.008 m at the outer third** before meeting the outer
  corner. That droop at the outer corner is the entire "can't be bothered" expression.
- **Outer corner sits 0.006 m LOWER than the inner corner** (−4.5° canthal tilt). Downturned, not
  upturned. Upturned reads cute; this character is not cute.
- **Pupil offset.** Both pupils sit **0.010 m off-centre to the same side** in idle (a sidelong
  glance, not a stare). Drive this from a look-at additive so it can be zeroed for attacks.
- **The periocular patches.** In the source these are the most graphic single element after the
  nostrils: two **pale rounded rectangles**, one per eye, joined across the bridge into the larger
  mask (§3.9). Each patch is **0.098 m wide × 0.077 m tall** with a **0.020 m corner radius**,
  centred on the eye at (x on the face surface, y = +0.163, z = ±0.063), so the pair spans
  **z = ±0.112 = 0.98 × W_s** and runs right out to the fur boundary. They must be a **modelled
  shallow relief, 0.004 m proud of the fur boundary**, not a colour swap on a flat surface, so they
  self-shade — a painted patch is the single fastest way to make this head look like a decal.

### 3.4 Nose / nostrils
The nostrils are a **top-three read cue** and they are always drawn far too small. They are enormous.

- **Nostril pair total span: 0.177 m = 0.78 × W_s.** Each nostril aperture is **0.072 m wide ×
  0.030 m tall** — a wide, slightly kidney-shaped horizontal oval, tilted **12° outward-downward**.
- Nostril centres at **z = ±0.0525** (so 2 × (0.0525 + 0.036) = 0.177 ✓), **y = +0.114**
  (0.194 above chin = 0.51 × H_h), aperture plane at **x = +0.256**.
- They sit on a **nasal pad**: ellipsoid r 0.055 scaled **(0.55 X, 0.75 Y, 1.85 Z)** → half-extents
  0.030 X × 0.041 Y × 0.102 Z, centred at **(+0.236, +0.114, 0)**. Its Z half-extent (0.102) must
  exceed the nostrils' outer edge (0.0885) — otherwise the apertures hang off the side of the pad,
  which is the single ugliest failure mode available here.
- The pad's front pole reaches **x = +0.266**, i.e. it swells only **0.006 m proud** of the muzzle
  front plane (+0.260). **This is a swell, not a nose.** Ape nostrils lie essentially flush in the
  muzzle plane; anything that reads as a nose-*tip* is wrong.
- The apertures are **sunk 0.012 m** into the pad (floor at x = +0.254), with a rolled rim 0.008 m
  thick around each. Aperture interior is `APE_NOSTRIL` (§5) — the darkest material on the head —
  at roughness 0.22, slightly wet at the rim (§6).
- There is a narrow **nasal bridge ridge** running up from between the nostrils (y = +0.140) to the
  glabella (y = +0.196): 0.028 m wide, 0.010 m proud at its base, tapering to nothing at the brow.

### 3.5 Muzzle
- **Projection: 0.160 m forward of the brow-ridge front face** — brow front x = +0.100, muzzle front
  plane **x = +0.260**. That is **0.42 × H_h** and it is the single biggest 3D deviation from the
  flat source — necessary, because a 3D character with no muzzle projection reads as a mask, not a
  head. This is *prognathism*, the defining chimp cranial trait.
- **Base primitive: a ROUNDED BOX, not an ellipsoid.**
  **0.185 X × 0.253 Y × 0.214 Z, corner radius 0.055 (4 radial segments), centred at
  (+0.168, +0.046, 0).** Spans x +0.076 → +0.260, y −0.081 → +0.173, z ±0.107.
  - *Why not a sphere:* the mouth sits at y = −0.046 and must be 0.190 m wide (§3.6). An ellipsoid
    of this height is only **0.147 m** wide at that height — the mouth would be wider than the
    muzzle carrying it. The rounded box holds **0.206 m** of width at y = −0.046, which fits the
    mouth with 0.008 m of lip band outboard of each corner. Build the sphere version and you will
    spend a day wondering why the mouth won't fit; this is that day, pre-spent.
  - It also matches the source better: the muzzle is a **long rounded-rectangle lozenge that keeps
    its width almost to the chin**, not a taper. Do not taper it to a snout.
- Widest muzzle width **0.214 m = 0.94 × W_s**, held from y = +0.118 down to y = −0.026.
- The muzzle's back face (x = +0.076) is buried 0.020 m inside the cranium's front face (+0.096) —
  they overlap on purpose.
- Junction fillet: a torus (**major 0.100, minor 0.020**) in the YZ plane at **(+0.090, +0.075, 0)**,
  tilted **−10° about Z** so its top edge tucks under the brow, welded into both surfaces.
  **No visible primitive intersection line** is permitted (`GRAPHICS_CONTRACT.md` §0.4).
- **Philtrum crease:** a single strong vertical groove, 0.008 m wide × 0.006 m deep, running from the
  underside of the nasal pad (**y = +0.073**) down to the upper-lip band top (**y = −0.008**).
  Slightly off-vertical (3°). This one groove does more for the "coarse cartoon ape" read than any
  texture.
- Cheek pouches: two soft bulges, sphere r 0.052 scaled (0.7, 0.9, 0.6) → half-extents
  0.036 × 0.047 × 0.031, centred at **(+0.150, +0.020, ±0.090)**. Their outer edge reaches
  z = ±0.121, i.e. **0.014 m proud of the muzzle's side**, which is the jowl mass that jiggles (§8.2).

### 3.6 Mouth
- **The mouth sits LOW** — mouth line at **y = −0.046**, which is **0.034 m above the chin
  = 0.09 × H_h** (source: 0.91 of head height down from the crown). Almost at the bottom edge of the
  muzzle mass. Placing it mid-muzzle is the most common way to lose this character.
- **The base mesh mouth is CLOSED.** Aperture **0.190 m wide (0.83 × W_s) × 0.014 m tall** at rest —
  a near-line. Corners **down 6°**. This is the source's `Bored` / `Bored Unshaven` mouth, which is
  34% of the collection between them. Teeth are not visible in the base mesh.
- Grimace pose: aperture **0.190 × 0.048 m**, corners **up 12°**, full tooth rack revealed. This is a
  *pose*, driven by the jaw hinge and the face controller — never bake it in.
- **Lip band — build it as TWO swept bands, not one torus.** A torus cannot produce a 0.190 m
  aperture inside a 0.206 m muzzle: its outer diameter would be 0.238 m and burst the silhouette.
  Instead:
  - Shared **commissure points** (mouth corners) at **(+0.256, −0.046, ±0.095)**.
  - **Upper band:** sweeps from corner to corner over a shallow cupid's-bow crest peaking at
    y = −0.020 on the midline; cross-section half-height **0.010 m**, standing **0.010 m proud** of
    the muzzle surface; top edge at y = −0.008.
  - **Lower band:** the same sweep, dropping to y = −0.072 on the midline; cross-section half-height
    **0.014 m** = **1.4 ×** the upper, standing **0.014 m proud**. Its lower edge *is* the chin
    (y = −0.080) and it **overhangs the throat by 0.030 m** (§2 negative space). The fat lower lip
    overhanging the chin is a source signature — if the two bands are the same thickness you have
    lost it.
  - Both bands taper to zero thickness at the commissures (lips are thin at the corners), which is
    what lets a 0.190 m aperture live inside a 0.206 m muzzle at all.
  - Colour `APE_LIP`, which is **darker** than `APE_MASK` — see §5's light/dark/light sandwich.
- **Teeth are real geometry, and the dental arcade is an ELLIPSE in plan, not a circle.**
  A circular arc of radius 0.082 cannot hold a 0.1835 m row — the chord exceeds the diameter. Use:
  - **Upper row: 10 teeth**, bevelled boxes **0.017 Z × 0.024 Y × 0.012 X**, 0.0015 m gaps
    (row span 0.1835 m), placed on an ellipse with **semi-axis Z 0.088, semi-axis X 0.030**, centred
    at (+0.212, −0.030, 0). Half-perimeter 0.197 m > 0.1835 ✓; outermost tooth centre lands at
    z ≈ ±0.085, inside the 0.095 commissure ✓.
  - **Lower row: 10 teeth**, **0.016 Z × 0.020 Y × 0.012 X** (row span 0.1735 m), ellipse
    **semi-axis Z 0.082, semi-axis X 0.028**, set back 0.006 in X. Slightly narrower than the
    uppers, which is correct.
  - Both rows are `bone` preset, colour `APE_TOOTH` (never pure white), with a subtle warm gradient
    darkening toward the gumline. The division grooves must be **modelled, not painted** — they
    catch the rim light and that is what makes the grimace read at 3 m.
  - **Budget:** instance the 20 teeth (`InstancedMesh`, one per row) — see §6.5.
- **Mouth interior:** a closed dark shell (`APE_MOUTH`, roughness 0.55) behind the teeth so you never
  see through the head. A tongue capsule (r 0.022, length 0.075, `skin-smooth`, roughness 0.30,
  slightly wet) parented so it can loll in the KO pose.
- **Jaw is a real hinge, and the hinge is at the condyle, not in the chin.** Hinge axis is parallel
  to Z, passing through **(−0.020, +0.120, 0)** — just forward of and below the ear, where the
  mandibular condyle actually sits. (A pivot down in the muzzle mass swings the chin backwards into
  the throat.) The lower lip band, lower teeth, tongue, chin and the lower half of the jowl bulges
  parent to it. Max open **28°**, which drops the chin ≈0.14 m along its 0.32 m radius.
  (The jaw is *not* a rig bone — it is a `head`-local group driven by the face controller,
  so the frozen bone list stays frozen.)

### 3.7 Ears

**Get the orientation right first — this is where the 0.45 m head width comes from.** The ear disc
lies in the **YZ plane, normal along ±X**: it *presents its face to the camera* and extends sideways
by its own radius. (Build it in the XY plane and it turns edge-on; the head then measures 0.31 m
across instead of 0.45 m and the whole silhouette spec in §2 collapses.)

- **Diameter 0.152 m** (0.67 × W_s, 0.40 × H_h), outer radius 0.076. **Thickness 0.022 m.**
- **Ear pivot (`earL` / `earR` bones)** at head-local **(−0.030, +0.163, ±0.110)** — on the skull
  surface, on the eye line. Rotating this bone must swing the ear, so the pivot belongs at the
  attachment, not at the disc centre.
- **Ear disc centre** at ear-local **(0, +0.006, ±0.039)** → head-local z = **±0.149**.
- **Width arithmetic (verify this in the console):**
  `0.149 + 0.076·cos22° + 0.011·sin22° = 0.149 + 0.0705 + 0.0041 = 0.2236` → head width across ears
  **0.447 ≈ 0.450 m** ✓, and each ear clears the skull silhouette (0.114) by **0.110 m** ✓ §2.
- **Set at eye level**: ear centre y = +0.169, eye centre y = +0.163 — within 0.006 m. Ears set high
  read as a bear; set low read as a dog.
- **Plane rotation**: `rotation.y = ±22°` (front edge swung forward), `rotation.x = +8°`
  (top tips forward). The ears are flared satellites, clearly presenting their inner face.
- Construction:
  (a) **helix rim** = torus, **major 0.060, minor 0.016** (outer 0.076 ✓), `fur-short`;
  (b) **ear plate** = disc r 0.058, 0.020 thick, bevel 0.006 — it overlaps the rim's inner radius
      (0.044) by 0.014 so there is no gap;
  (c) **concha** = ellipsoid r 0.058 scaled **(0.32 X, 0.98 Y, 0.90 Z)** → **0.114 m tall ×
      0.104 m wide**, inset 0.009 along −X, in `APE_MASK`. That is **0.75 × the ear diameter** —
      corrected upward from an earlier 0.62; measured off tokens #102 and #314 the pale inner ear is
      enormous and nearly fills the rim. It is offset **forward 0.010 (+X) and down 0.008 (−Y)** from
      the ear centre. That off-centre pale ellipse inside a furred rim is exactly the source's ear,
      and it is the **third-largest pale shape on the character** after the face mask and chest ruff.
- A small antitragal notch at the lower-front of the rim (0.012 m bite) so the ear is not a
  perfect circle at 128 px.
- **Ear/beanie interpenetration:** the beanie cuff (§7.1) reaches z = ±0.162 and y ≈ +0.225…+0.285;
  the ear top reaches y = +0.245. They overlap. Trim the ear tops under the cuff (or boolean the
  cuff) — an unresolved intersection line here is exactly the seam the contract forbids.

### 3.8 Head carriage & angles (bake these into the base mesh)
- `head` bone sits **0.10 m forward** of the shoulder line — head carried ahead of the body.
- **Chin down 6°** (`rotation.z = −0.105` — Z is the pitch axis when the rig faces +X) baked into the
  mesh offset, **skull tipped back 4°** relative to the neck. Net effect: he looks *down his nose*
  at everything.
- The face plane, as a whole, rakes **20° back from vertical** at the forehead and **8° forward**
  at the muzzle — a shallow concave "dish" from brow to lip. This is the ape facial profile.
- **Portrait / select-screen pose is a three-quarter turn**: `head.rotation.y = 27°` toward the
  camera's left, plus the baked 6° chin-down. This is the source's own framing (§1.3) and it is
  free recognisability. It does **not** change the bind pose or any clip.

### 3.9 The mask outline — the identity shape, given as a polygon

§1 says the mask is one continuous shape. Here is its boundary, as a closed loop on the face surface,
mirrored about z = 0. Model it as a **0.004 m proud relief** with a soft 0.006 m bevel at the
boundary, so the fur/skin transition self-shades instead of reading as a paint edge.

| Point | y | z (half-width) | What it is |
|---|---|---|---|
| A | +0.205 | 0.000 | glabella notch — the mask dips on the midline between the two brow pads |
| B | +0.212 | ±0.055 | top of each brow pad (the mask's high points are *paired*, giving a shallow M) |
| C | +0.198 | ±0.098 | outer brow corner |
| D | +0.163 | ±0.112 | **widest point, on the eye line** — 0.98 × W_s, reaches the fur boundary |
| E | +0.120 | ±0.086 | **the waist** — the mask pinches in at the cheek line before flaring again |
| F | +0.046 | ±0.104 | muzzle widest |
| G | −0.046 | ±0.100 | mouth corner height |
| H | −0.080 | 0.000 | chin |

The **waist at E** is what makes it one shape rather than two — without it you get a pair of goggles
sitting on a separate muzzle patch, which is the most common way builds lose the source. The mask
covers **just over half** of the head's frontal area (ears excluded).

Everything inside this loop is `APE_MASK` skin: brow pads, periocular patches, bridge, nasal pad,
whole muzzle, chin. Everything outside is `APE_FUR`. The concha (§3.7c) and the chest ruff (§4.1)
are the only `APE_MASK` areas off the face.

---

## 4. Body & limb proportions

### 4.1 Torso
- **Shoulder width (acromion to acromion): 0.66 m = 0.347 H = 1.74 head-heights.**
- **Hip width: 0.44 m.** Torso taper ratio **0.67** — a real V, but softened, because:
- **Belly depth (0.48 m) is greater than chest depth (0.44 m).** The deepest point of the torso in
  profile is at the navel, not the pecs. He is strong and he is also completely unmaintained.
- **Baked slouch, non-negotiable** (the existing model already does this and it is correct):
  pelvis tipped back 8°, lumbar arch 10°, thoracic spine rolled **forward 22°**, shoulders rolled
  forward 14° and dropped so the acromion sits **0.100 m** below the chin (1.320 vs 1.420).
  That 0.100 m is a floor, not a target: §2's neck lens needs ≥0.050 m of background either side of
  the neck inside that band. The source's ape actually has a **long, thin, conspicuous neck** — we
  are deliberately compressing it for the slouch gag (§9 D3), and the negative space is the only
  thing keeping the compression readable.
- **Chest ruff:** a coarse fur mass on the sternum, 0.20 m wide × 0.26 m tall, standing 0.03 m proud,
  in the pale mask colour (apes have sparse pale chest skin) — visible through the open robe and
  under the boat-neck. It is the second-largest pale shape on the character after the face.
- Trapezius: heavy, running from the base of the skull out to the deltoid at a **32°** slope.
  This slope plus the sunk head is the "slumped" read.

### 4.2 Arms — the ape proportion

Two different numbers get confused here constantly. Keep them apart:

- **Intermembral index** (the anatomy figure) = (humerus + radius) ÷ (femur + tibia) × 100.
  **Ours is (0.42 + 0.40) ÷ (0.41 + 0.35) × 100 = 108.** That is squarely inside the chimpanzee
  range (~106–109 typical, 100.1–113.7 observed). We are **not** pushing past the natural envelope;
  the anatomy is honest.
- **The read metric** = shoulder→knuckle ÷ hip→sole = 1.00 ÷ 0.85 = **1.18**. That number is bigger
  than the IMI because it *includes the hand* (long fingers, §4.3) and measures the leg to the sole
  rather than the ankle. The exaggeration lives in the hand and the short shank, not in the arm bones.

| Segment | Length | Ratio |
|---|---|---|
| Upper arm (shoulder → elbow) | 0.42 m | 0.221 H |
| Forearm (elbow → wrist) | 0.40 m | 0.211 H |
| Hand (wrist → knuckle) | 0.18 m | 0.095 H |
| **Total shoulder → knuckle** | **1.00 m** | **0.526 H** |
| Femur (hip → knee) | 0.41 m | 0.216 H |
| Tibia (knee → ankle) | 0.35 m | 0.184 H |
| Ankle → sole | 0.10 m | 0.053 H |
| **Leg, hip → sole** (10° resting knee bend) | **0.851 m** | 0.448 H |
| **Intermembral index** | **108** | chimp range |
| **Shoulder→knuckle ÷ hip→sole** | **1.18** | the read metric |

- **Deltoid diameter 0.19 m**, tapering to **0.13 m** at the wrist. The upper arm is barely thicker
  than the forearm — apes carry mass distally. Do not build a bodybuilder taper.
- The arms hang **0.06 m clear of the ribcage** and the elbows sit **0.04 m behind** the torso's
  lateral midline — arms are set on the *back* of the shoulder, which is what makes the chest read
  as broad and the pose as knuckle-ready.
- Forearm hair: the coarse fur runs **downward past the wrist**, overhanging the back of the hand by
  0.025 m. Long forearm fur is a strong ape cue and it is free silhouette.

### 4.3 Hands
- **Four fingers**, three segments each, bevelled capsules, **total length 0.115 m**, base diameter
  0.030 m. Fingers are long relative to the palm (finger : palm length = **1.15 : 1**).
- **Thumb is short and set low and far back** — length **0.055 m** (0.48 × finger length), rooted at
  the base of the palm, opposed only ~35°. Chimps have long robust fingers and a **relatively small
  thumb**; getting this wrong makes the hand read human.
- **Palm 0.095 Z × 0.105 X**, with a thick dark leathery pad; back of the hand is furred.
- **Knuckle pads flattened** into 0.020 m callus discs on the middle phalanges. He walks on these,
  and even standing they should read as weight-bearing surfaces.
- Skin on palm/fingers is the **darker** hide tone, not the pale face mask — value contrast between
  hand and face keeps the punch readable against the head during animation.

### 4.4 Legs, feet, stance
- Short and slightly bowed: **femur 0.41 m, tibia 0.35 m, resting knee bend 10°** (hip 0.850 −
  0.41·cos10° = knee **0.446**; knee − 0.35·cos8° = ankle **0.099**), **knees splayed out 7°**,
  feet slightly inward of the knee line. These are the §2 table's numbers — do not drift from them.
- **Stance width: heel centres 0.52 m apart** (1.37 head-heights), **toe-out 16°**.
- Foot is a real ape foot: **the big toe diverges 32°** from the other four, giving a wide, grippy,
  hand-like plan shape. Foot length 0.26 m.
- **Costume 0 keeps the bunny slippers** (they are load-bearing comedy and they exist in the current
  build) — but the slipper must be **cut so the divergent big-toe bulge shows through the side**.
  A slipper that hides the ape foot wastes the joke twice.

### 4.5 Posture in one sentence
Weight 55/45 on the back foot, pelvis tucked, spine a lazy C, shoulders forward of the hips,
head forward of the shoulders, arms hanging dead, one hand welded to a mug — a man who has been
standing in this exact spot since 2021 and would like everyone to know it.

---

## 5. Colour script

Named constants, to replace the `C = {...}` block. Values chosen to (a) stay inside the contract's
**30–240 sRGB albedo range** (`GRAPHICS_CONTRACT.md` §0 style guardrails — every channel of every
albedo below is ≥30 and ≤240; verify with a one-line assert, it is cheap), (b) shift **deliberately
warm and darker** off the source's neutral browns so we are not reusing sampled source colour (§9 D4),
and (c) hold a **4.9:1** value ratio between the two largest areas so the character reads at 128 px.

"Rel. luminance" is CIE **Y** computed from linearised sRGB (0.2126 R + 0.7152 G + 0.0722 B). These
have been recomputed — an earlier revision of this table was wrong by up to 45% on some rows, which
is how a palette ends up with a beanie that vanishes in greyscale.

| Name | Hex | Rel. luminance Y | Use |
|---|---|---|---|
| `APE_FUR` | `#7A5537` | 0.111 | **Base coat.** Head, torso, limbs. Warm mid-brown. The dominant area. |
| `APE_FUR_SHADOW` | `#452C1B` | 0.032 | **Darkest large value.** Underarm, under-jaw, groin, crevice AO tint, fur-root darkening. |
| `APE_FUR_TIP` | `#AE7F52` | 0.247 | Fur-tip / clump-edge highlight; also the rim-facing albedo lift on the arms and crown. |
| `APE_MASK` | `#D9BE96` | 0.539 | **Lightest large area.** The face/muzzle/concha/chest skin mask. The identity shape. |
| `APE_MASK_SHADE` | `#A07C55` | 0.225 | Under-brow, philtrum, lip crease, nostril rim, muzzle underside AO. |
| `APE_LIP` | `#C68B78` | 0.318 | Lip band only. Pinker and *lower value* than the mask so the mouth separates from the muzzle. |
| `APE_MOUTH` | `#4A2626` | 0.030 | Mouth interior / gums. |
| `APE_NOSTRIL` | `#2B2320` | 0.018 | Nostril aperture interior. Darkest **albedo** on the model, still ≥30 per channel. |
| `APE_TOOTH` | `#EDE7D8` | 0.802 | Teeth. Lightest thing on the model. |
| `APE_SCLERA` | `#E8E2D2` | 0.764 | Eye white — never `#FFFFFF`. |
| `APE_IRIS` | `#3B2F22` | 0.031 | Iris. |
| `APE_PUPIL` | `#221E1E` | 0.014 | Pupil. **Not** `#14100C` — that breaks the 30-sRGB floor on every channel. |
| `KNIT_RUST` | `#D2662F` | 0.235 | Knit beanie. High chroma, and lifted from an earlier `#C0592C` (Y 0.188) so it clears `APE_FUR` by 2.1:1 in **value**, not only in hue. |
| `TEE_LIGHT` / `TEE_DARK` | `#E6E1D2` / `#2E3F63` | 0.756 / 0.051 | Boat-neck striped shirt. Highest *local* contrast on the model (14.8:1). |
| `ROBE` / `ROBE_TRIM` | `#5E3A8F` / `#8E68C4` | 0.075 / 0.197 | Bathrobe (costume 0). Costume 1 swaps to `#2F6F4F` / `#6FBF95` as today. |
| `GOLD` | `#E0A93B` | 0.445 | Hoop earring, chain, any grill. `metalness 1.0`. |
| `EMBER` | `#FF6A28` | — | Cigarette coal. **Emissive only, never an albedo** — the 30–240 range does not apply. `emissive(EMBER, 2.2)`, the sole bloom source on the character. |
| `RIM_REQUEST` | `#6FC9E0` | — | Not albedo, not ours to set — see "Rim separation" below. |

### The value ladder (this is the hierarchy, top to bottom)

| # | Constant | Y | Area on model |
|---|---|---|---|
| 1 | `APE_TOOTH` | 0.802 | tiny, pose-only — the grimace punch |
| 2 | `APE_SCLERA` | 0.764 | tiny |
| 3 | `TEE_LIGHT` | 0.756 | medium (chest) |
| 4 | **`APE_MASK`** | **0.539** | **large — the identity shape** |
| 5 | `GOLD` | 0.445 | small, high-chroma accent |
| 6 | `APE_LIP` | 0.318 | small |
| 7 | `APE_FUR_TIP` | 0.247 | edges only |
| 8 | `KNIT_RUST` | 0.235 | medium, at the top of the figure |
| 9 | `APE_MASK_SHADE` | 0.225 | crevices in the mask |
| 10 | `ROBE_TRIM` | 0.197 | thin bands |
| 11 | **`APE_FUR`** | **0.111** | **largest area on the model** |
| 12 | `ROBE` | 0.075 | large (costume 0) |
| 13 | `TEE_DARK` | 0.051 | medium (stripes) |
| 14 | `APE_FUR_SHADOW` | 0.032 | crevices |
| 15 | `APE_IRIS` | 0.031 | tiny |
| 16 | `APE_MOUTH` | 0.030 | pose-only |
| 17 | `APE_NOSTRIL` | 0.018 | tiny, but two of the top-three read cues |
| 18 | `APE_PUPIL` | 0.014 | tiny |

### Value relationships (the part that matters)
- **The two largest areas are `APE_FUR` (0.111) and `APE_MASK` (0.539) → 4.9:1.** That single step is
  what carries the character at 128 px. Nothing else in the palette may be allowed to compete with
  it at large area.
- **Full range:** `APE_FUR_SHADOW` (0.032) → `APE_MASK` (0.539) = **17:1**.
- **`APE_TOOTH` (0.802) is lighter than `APE_MASK` (0.539).** The grimace must punch out of the muzzle.
- **`APE_LIP` (0.318) is darker than `APE_MASK` (0.539)** and lighter than `APE_MOUTH` (0.030).
  The lip band is a *dark* frame around a *light* tooth block inside a *light* muzzle — a
  light/dark/light sandwich. That triple is highly readable and it is why the mouth survives at 1 m.
- **The beanie is a chroma cue with a value backstop.** `KNIT_RUST` (0.235) clears `APE_FUR` (0.111)
  by 2.1:1 and sits well under `APE_MASK` (0.539), so it is the eye's entry point at the top of the
  figure without stealing the face. **Acceptance test: desaturate a 128 px render — the beanie must
  still separate from the head.** If it does not, the hex has drifted back toward the old value.
- **`TEE_LIGHT`/`TEE_DARK` carry the highest local contrast** and sit at the chest — the second
  read anchor. Keep the stripes wide (§7.4) so they do not moiré at distance.

### Rim separation — what this agent may and may not do

**We do not own the light rig.** `src/render/lighting.js` belongs to the foundation agent and
`src/arenas/<id>.js` to each arena agent (`GRAPHICS_CONTRACT.md` §1: *never edit a file you do not
own*), and §10 makes each arena responsible for its own documented key/fill/rim scheme. So:

- **Do (in `tired-ape.js`, ours):** tint the fur `sheen` with `APE_FUR_TIP` (§6) and give the fur and
  the face mask a **fresnel grazing lift** via the contract's `gradientRamp()` LUT. That is a
  material-side rim response and it works under *any* arena light. This is the character's actual
  insurance policy against a bad arena — build it, do not skip it because the arena rim looks fine
  in one test scene.
- **Request (report it, do not implement it):** `rimColor #6FC9E0` at `rimIntensity 1.4`, ≈130° off
  the key in azimuth and 25° above. Rationale worth passing on: the character is a large warm
  low-chroma brown mass (`APE_FUR` hue ≈28°); a **cool cyan** rim is complementary and separates in
  every warm arena, and in `arctic-day` / `frozen` it still separates because the fur is the warmest
  thing in frame. **A warm rim on brown fur disappears** — that is the note to give the arena agents,
  per the contract's "if you need a change outside your file, say so in your report".
- Wherever the rim lands, it should catch: crown fur, the ear rims, the deltoid tops, the brow-ridge
  lateral trigones, the lower-lip roll, the knuckles, and the gold chain (which will over-blow, and
  that is fine — it is the accent).

---

## 6. Surfacing

Presets are from `GRAPHICS_CONTRACT.md` §3 (`surfaceMaps(kind)`) and §4 (`pbr(color, preset)`).

| Region | `surfaceMaps` kind | `pbr` preset | Behaviour |
|---|---|---|---|
| Body / limb / crown fur | `fur-coarse`, scale 1.4 | `fur` | roughness 0.86 base with **±0.14 spatial variance** from the roughness map; `sheen 0.28`, `sheenRoughness 0.6`, sheen tint `APE_FUR_TIP`. `normalScale 1.25`. |
| Under-jaw, armpit, groin fur | `fur-coarse`, scale 1.0, `tint: APE_FUR_SHADOW` | `fur-dark` | roughness 0.92, no sheen — dead matte so the crevices sink. |
| Face mask, muzzle, concha, chest skin | `skin-elephant`, **scale 0.45** (fine wrinkle, not elephant-scale) | `skin` | roughness 0.62 ±0.10; the wrinkle normal must be **directional** — radial around the nostrils, vertical on the philtrum, horizontal across the brow. |
| Lip band | `skin-smooth` | `skin-wet` | roughness **0.30**, `clearcoat 0.20`. The lips are the wettest thing on the face. |
| Nostril interior, mouth interior | `skin-smooth` | `skin-wet` | roughness 0.22. A tiny wet glint inside each nostril sells the whole head. |
| Teeth | `bone` | `bone` | roughness 0.28, `clearcoat 0.15`, warm gradient toward the gumline. |
| Sclera | `skin-smooth` | `skin` | roughness 0.30. |
| Cornea | — | `glass` | roughness 0.04, `clearcoat 1.0`, transmission 0, `envMapIntensity 1.6`. One crisp specular dot per eye. |
| Palms, knuckle pads, finger skin | `leather`, scale 0.8, `wear: 0.7` | `leather` | roughness 0.70, cracked micro-normal. |
| Knit beanie | `cloth-knit`, scale 2.2 | `cloth` | roughness 0.90, `sheen 0.40`, **`normalScale 1.7`** — the rib must read at 1 m. |
| Striped tee | `cloth-weave`, scale 1.6 | `cloth` | roughness 0.82, `sheen 0.30`. Stripes are **geometry-free** (albedo) but the weave normal is shared. |
| Bathrobe | `cloth-weave`, scale 3.0 + terry bump | `cloth` | roughness **0.95**, sheen 0.15. The robe is the deadest surface on the model — it makes the gold sing. |
| Gold hoop / chain / grill | `gold` | `gold` | metalness 1.0, roughness **0.18**, `envMapIntensity 1.4`. |
| Mug (ceramic) | `plastic-gloss` | `plastic-gloss` | roughness 0.12, `clearcoat 0.6`. Chipped rim: a 0.6-roughness patch. |
| Coffee surface | `water` | `water` | roughness 0.06, dark `#3E2517`, `envMapIntensity 1.2`. |
| Cigarette paper | `paper` | `paper` | roughness 0.80. Filter section `#C8843C`, roughness 0.85. |
| Cigarette coal | — | `emissive` | `emissive(EMBER, 2.2)` — the sole bloom source on the model. Ash tip `#6E6862`, roughness 0.95. |
| Slippers | `fur-long`, scale 1.8 | `fur` | roughness 0.88, sheen 0.35. |

### How it should behave under light
- **Fur is not shiny, it is *sheened*.** The forward-scattering lobe should only appear at grazing
  angles — the crown, the shoulder tops, the outside of the forearms. Anything facing the camera
  stays matte. If the chest is glinting, `sheen` is too high.
- **Roughness variation is mandatory**, not optional. Flat 0.86 across the whole body is the #1 tell
  of hobby work. Drive it from the fur height map: fur-clump tips **−0.10 rougher→glossier**,
  roots **+0.06**. That alone reads as "real fur" at 3 m.
- **The face mask must feel like hide, not paint.** It gets a fresnel-driven grazing lift
  (the contract's `gradientRamp` LUT) so the muzzle's silhouette edge is 0.15 brighter than its
  centre. This is what makes a big flat pale shape look volumetric instead of decal-like.
- **Wetness is local and small**: lips, inner nostrils, cornea, tongue, and the coffee surface.
  Nowhere else. Wet fur reads as "just fought in a swamp", which is a state, not a design.
- **Gold must actually reflect the environment.** `envMapIntensity 1.4` and roughness 0.18 means the
  chain picks up the arena's hero light. In `night-neon` and `meme-plaza` this is the character's
  best moment — do not flatten it with a high roughness "safe" value.

### Micro-detail that sells it (30 cm read)
1. **Stubble.** The "unshaven" muzzle is ~200 short dark dashes (0.006 m long) in the albedo of the
   muzzle map, oriented **radially downward** from the nostrils, sparing the lip band. Matched by a
   0.3-strength bump so they catch raking light. This is a source trait (`Bored Unshaven`, the
   2nd-most-common mouth in the collection) and it costs one texture.
2. **Fur clump silhouette breakers.** 14 modelled tufts (bevelled wedges, 0.02–0.05 m) along the
   cheek line, the forearm underside, the chest ruff edge and the crown front. **Geometry, not
   alpha planes** — alpha cards fringe against the rim light.
3. **Knit rib.** The beanie's rib must be modelled at the cuff (12 raised ribs, 0.006 m proud) and
   normal-mapped over the crown. Half-modelled/half-mapped is the correct budget split.
4. **Chain links are real toroids.** 24 of them. A normal-mapped chain reads as tape.
5. **Wear:** robe cuffs frayed (0.008 m irregular edge loop), slipper fluff matted flat on one side,
   mug rim chipped in two places, cigarette paper creased where it's been in the mouth.
6. **Ash.** A 0.004 m grey cone on the cigarette tip that lengthens over the round and drops on heavy hits.

### 6.5 Budget — the constraint this brief would otherwise blow

`GRAPHICS_CONTRACT.md` §0 caps a match scene at **~250k triangles and ~900 draw calls**. Two fighters
plus an arena plus VFX share that. This character's budget:

- **≤ 32,000 triangles** for the whole model including props and costume 0. (Two fighters = 64k,
  leaving ~185k for arena, crowd, debris and particles.)
- **≤ 40 draw calls** in the bind pose.

Counted naively, this brief asks for 20 teeth + 24 chain links + 12 beanie ribs + 14 fur tufts +
2 eyes × 5 parts + props ≈ **80+ separate meshes**. That is a draw-call failure on its own, before
the arena draws anything. **Mandatory mitigations:**

1. **`InstancedMesh` for repeated identical geometry**: upper teeth (10), lower teeth (10), chain
   links (24), beanie ribs (12), fur tufts (14). Five instanced meshes, five draw calls, instead of
   seventy.
2. **Merge by material within a bone.** All `APE_FUR` static geometry under `torso` is one merged
   buffer; likewise under each limb. Merging must happen *per bone*, never across bones — `Gore._detach()`
   clones a bone's subtree, and a buffer spanning two bones would tear on dismemberment (§7.8).
3. **`pbr()` caches by (color, preset, overrides)** — do not pass `unique: true` anywhere in the
   bind pose. Reserve it for the damage-tint and dismemberment-fade paths, which are per-instance
   by necessity.
4. **Segment counts**: the cranium at subdivision 3 is ~1,280 tris; that is the single most expensive
   primitive here and it is worth it. The chain links get 8×6 torus segments, not 16×12 — at
   0.022 m radius nobody will ever count them.
5. If the tri count comes in over 32k, the first things to cut are chain-link segments, robe skirt
   segments and fur tufts — **never** the ear discs, the mask relief, the nostril apertures or the
   lip bands. Those four are the read.

Report actual measured tri/draw counts in your writeup. "It looked fine" is not a measurement.

---

## 7. Signature props & wardrobe

Every prop is a child of an existing bone. `Gore._detach()` clones a bone's entire subtree, so
anything under `head` flies off with the head, anything under `forearmL` flies off with the hand.
Nothing may be parented to `group` or positioned by per-frame JS, because a detached clone is frozen
and would visibly desync. Mark each prop mesh `userData.prop = true` so material upgrades and
damage-tint passes can skip or include them deliberately.

### 7.1 Knit beanie — parent: `head`
The single strongest trait cue (**Beanie is the most common hat in the collection**, ~49 in a 900-token
sample; ~5.4% of all apes, ~7.5% of hatted apes).
- Crown: hemisphere r 0.135, scaled (1.0, 0.72, 1.0) → 0.097 m tall × 0.270 m wide, base sitting at
  head-local **y = +0.300** (the fur crown) so its apex reaches **y = +0.400 = world 1.900** ✓ §2.
  It is **0.042 m wider than the skull** (0.270 vs W_s 0.228) because a knit cap is loose, and it is
  squashed and **slumped backward** — the apex is offset **−0.030 X** (toward the back of the head),
  so it reads as slouchy, not fitted.
- Cuff: a torus, major 0.132, minor 0.030 (outer half-width 0.162), centred at **y ≈ +0.255**, with
  **12 modelled ribs** (instanced, §6.5), canted **17°** so it sits higher on one side than the other.
  **The cuff's front edge is at y = +0.246 head-local — 0.014 m above the brow-ridge top (+0.232),
  clear of it.** A beanie pulled down to the eyebrows kills the brow read, and the brow read is 60%
  of the "heavy" (§3.2). Note the cuff overlaps the ear tops (§3.7) — resolve that intersection.
- **A fur tuft escapes at the front-top**, 0.05 m of spiky crown fur poking out over the cuff at
  x = +0.03. Without the tuft it reads as a swim cap.
- No pom. A pom pushes it toward the penguin fighter's wardrobe.
- Costume 1 swaps the beanie for a **peaked captain's cap**: soft crown (ellipsoid, 1.35 × wider than
  tall, slumped forward), a 0.030 m band, a **0.075 m stiff visor** raked down 18°, and a
  **generic gold anchor-less rope braid** across the band. See §9 — no naval insignia, no crest.

### 7.2 Cigarette — parent: `head` (specifically the jaw group, so it moves with the mouth)
- Cylinder **0.115 m long × 0.010 m diameter**, `paper`; a 0.028 m filter section in `#C8843C`;
  an ember disc + `emissive(EMBER, 2.2)` cone at the tip; a lengthening ash cone.
- Rooted at the **mouth commissure** (§3.6): head-local **(+0.256, −0.046, −0.095)**; angled
  **−22° in the vertical plane and −14° in plan** so it points out and down and away from the
  camera-facing side of the ¾ portrait pose (§3.8).
- It is gripped by the lip band — model a 0.004 m lip pinch around it so it isn't floating.
- A thin smoke ribbon (`Particles` `smoke` emitter, 4 particles/s, 0.02 m radius) attaches at the tip.
- **On hitHeavy and KO the cigarette detaches** into a physics prop (`fx.spawnProp`) and the ember
  scatters. Re-attach on round reset.

### 7.3 Gold hoop earring — parent: `earL`
- Torus, **outer diameter 0.062 m, inner 0.048 m, tube radius 0.007 m**, in the **YZ plane —
  the same plane as the ear disc (normal along ±X), so the ring faces the camera and its hole
  reads.** (An XY-plane hoop is edge-on from the front: a 0.014 m line, not a void, and §2's
  "3 px of background through a ring" becomes impossible.)
- Hangs from the **lower-front of the ear rim** at ear-local **(+0.012, −0.052, 0)** → head-local
  **y ≈ +0.117**, i.e. **0.5 × ear diameter below the ear centre**, which is where it sits on
  token #314.
- It must **swing**: a one-bone spring driven by `earL`'s motion, ±18°, damping 0.25, 6 Hz.
- Only **one** ear gets it. Symmetry is the enemy of a memorable silhouette.
- Its inner void must stay open — see §2 negative space.

### 7.4 Boat-neck striped shirt — parent: `torso`
- **Boat neck**: a wide shallow neckline, **0.28 m across, only 0.05 m below the clavicle line**,
  which exposes the pale chest ruff and both collarbone slopes. The wide neckline is the shape cue;
  the stripes are the colour cue.
- **Stripes: 11 dark bands, 0.042 m tall, with 0.058 m light gaps**, horizontal, wrapping the torso
  (and continuing at the same pitch on the short sleeves, offset by half a period so the seam reads).
  *(The real naval marinière spec is 21 white stripes at 20 mm and 20–21 blue at 10 mm — we are
  deliberately using a much coarser, differently-proportioned band count; see §9.)*
- Stripes must **follow the body's curvature** — bend them 0.02 m downward at the flanks and over
  the belly. Straight horizontal bands on a curved torso read as decal.
- Sleeve hem at mid-bicep, 0.008 m rolled cuff.

### 7.5 Bathrobe — parent: `hips` (shell) + `robe` bone (hem)
Keep the existing two-part construction, upgrade it:
- Shell on `torso`: worn **open**, lapels rolled 0.035 m thick, a sash knot at the waist with two
  0.18 m tails that hang free.
- Hem on the `robe` bone (already exists as a spring-follow extra): the hem is a **12-segment skirt**,
  hem line at y = 0.62, with a 0.030 m contrast trim band and a **front split** so the legs read.
- Terry texture, matted at the elbows and the seat.
- Costume 1: money-green as today (`#2F6F4F` / `#6FBF95`).

### 7.6 Heavy gold chain — parent: `torso`
- **24 real toroidal links**, tube radius 0.008, link outer radius 0.022, alternating 90° —
  a flat-lying "cuban" style so it catches light as a continuous ribbon rather than as beads.
- Pinned at the trapezius (y ≈ 1.30) and hanging to **y = 1.14**, i.e. **0.16 m below the pin and
  0.06 m below the chest apex (1.20)** — the loop rests *on* the pectoral shelf, which is what makes
  it swing rather than slap. Total link run ≈ 0.42 m.
- Simulate as a **6-point rope** (contract §11 gives us cloth/rope) with the ends pinned at the
  trapezius. It must swing a full beat behind the torso — that lag is the money shot on the taunt.
- **Note:** a gold chain is *not* one of the source collection's traits (a 900-token trait census
  turned up `Bone Necklace`, `Bandolier` and `Hip Hop`, but no gold chain). It is our own addition
  from general crypto-bro culture — which makes it both funny and legally useful. See §9.

### 7.7 Coffee mug — parent: `mug` bone (already exists, under `forearmL`)
- Ceramic cylinder r 0.043, height 0.085, wall 0.006, with a **real toroidal handle** (major 0.030,
  minor 0.008) and a chipped rim.
- Coffee: a disc at 78% fill with a `water` surface and a **tilt-follow spring** so it sloshes and
  can spill on heavy hits. Never let it clip the rim.
- The existing `MEH` decal stays (our own mark, `decalTexture`), 0.05 m tall, on the outward face.
- **The mug never leaves the hand except on `coffeeSplash`, `mugUppercut` and forearm dismemberment.**
  It is a silhouette element as much as a prop.

### 7.8 Attachment rules (all props)
1. Parent to a bone, never to `group`.
2. No per-frame positioning from JS for the *rest* pose — springs may add on top, but the rest
   transform must be correct in the bind pose or detached clones will pop.
3. Give every prop group a `name` (`'beanie'`, `'cig'`, `'hoop'`, `'chain'`, `'mug'`) so
   `upgradeMaterials(root, { hints })` can target it by name and so future gore/VFX can find it.
4. Props must be inside the fighter's bounding volume in the bind pose so the shadow frustum fit
   (`setFocus`) doesn't have to grow for them — except the cigarette, which is allowed to poke out.

---

## 8. Expression & motion notes

### 8.1 Face poses (drive from a small `head`-local face controller; the bone list stays frozen)

| Pose | Lids | Brow | Mouth | Extra |
|---|---|---|---|---|
| **idle** | 62% closed, outer corners drooped | level, heavy, 0° | **closed** lipped line 0.190 × 0.014, corners **down 6°**, jaw 3° slack, **no teeth** | pupils offset 0.010 sidelong; blink every 4.5–7 s, **0.22 s** blink (slow — he is tired), 1-in-5 blinks are a double |
| **angry / attack windup** | 40% closed | inner ends **down 9°**, outer up 4° | **grimace**: corners **up 12°**, aperture **0.190 × 0.048**, **full tooth rack showing**, lip band pulled taut and thin | jowls pull back 0.012; nostrils flare 0.006 |
| **hurt** | snap open to 15% closed in 2 frames | inner ends **up 14°** | jaw drops **22°**, lips purse into an O, tongue visible | 3-frame overshoot then settle; cigarette droops |
| **KO** | fully shut (−1.15 rad), or the X-crease variant | inner up 18°, slack | jaw hangs **28°**, tongue lolls to one side, lower lip everted | cigarette detaches as a prop; beanie slides 0.03 m forward |
| **taunt** | **asymmetric**: one lid 20% closed, the other 85% | one brow up 11° | one corner up 16°, the other flat — a lopsided sneer | cigarette rolls to the other corner; one slow full blink; mug tips 25° and he doesn't drink |
| **win** | 50% closed | level | corners up 8°, mouth closed | one slow nod; a single sip; the chain settles last |

Rule: **the expression change must be visible in the silhouette of the muzzle**, not only in the
albedo. Grimace widens the muzzle's outline by 0.015 m per side. If you can't see the pose change
in a black fill, it isn't a pose.

### 8.2 Secondary motion
- **`earL` / `earR`**: spring-follow, **0.12 s lag**, 9 Hz, damping 0.30, clamp ±22°. The ears are
  large and light — they should arrive noticeably after the head. This is free character.
- **Gold hoop**: nested spring on `earL`, 6 Hz, ±18°.
- **Jowls / lower lip**: the cheek bulges and the lower-lip roll jiggle at **8 Hz, damping 0.35**,
  amplitude 0.012 m, driven by head angular acceleration. On heavy hits let them reach 0.025 m —
  a fat lower lip flapping on impact is a gift.
- **Belly**: soft-body jiggle at 5 Hz, damping 0.40, amplitude 0.020 m, driven by hip vertical velocity.
- **`robe` bone**: cloth chain, 4 Hz, damping 0.22, with a hem-drag term so it trails on dashes.
- **Chain**: 6-point rope, lags the torso by ~0.10 s. On the `robeSpin` launcher it should whip a
  full circle behind him.
- **Coffee**: tilt spring in the mug, 7 Hz, damping 0.45; it must still be sloshing 0.4 s after he stops.
- **Fur clump tufts** on the forearms and crown: 12 Hz micro-spring, ±4°, amplitude 0.006. Barely
  visible individually; collectively it is the difference between a model and a creature.

### 8.3 Posture-driven personality
He **never leads with the head.** Every action starts at the hip, travels out through the shoulder,
and the head arrives last and reluctantly. Concretely:
- **Anticipation is long and low**: 3–5 extra frames of hip counter-rotation before any arm moves.
- **Overshoot is large, settle is slow**: 18% overshoot, then a 0.35 s settle with two visible
  decaying bounces in the jowls, belly and robe hem. Nothing on this character stops on the frame it
  arrives.
- **He does not straighten up.** Not for the win pose, not for the finisher, not on getup.
  The thoracic 22° forward roll is baked; if an animation needs him upright, it is the wrong animation.
- **Walk**: knuckle-forward weight. Shoulders lead by 0.06 m, arms swing with almost no elbow bend
  (they're too long to need it), and there is a 0.04 m vertical drop on each foot plant — he lands,
  he doesn't step.
- **Idle breathing**: 0.10 Hz, 0.018 m chest rise, with a **sigh every 9 s** (0.030 m rise, then a
  1.2 s fall, shoulders dropping 0.015 m below their start). The sigh is the character.

---

## 9. Parody safety — MANDATORY

The mandate (`GRAPHICS_CONTRACT.md` §9) is *recognisable archetype and silhouette, changed
proportions, our own colourways and marks*.

**Current status of the leading case (checked July 2026 — an earlier revision of this brief stopped
at July 2025 and drew a softer conclusion than the record now supports):**

- The rights-holder sued a derivative-ape artist and his collaborator in June 2022 and won summary
  judgment on trademark infringement, false designation of origin and cybersquatting, with a total
  judgment around **$9 M** including fees.
- On **23 July 2025** the Ninth Circuit **vacated** the summary judgment and the damages award and
  remanded for trial, holding the rights-holder had not proved likelihood of consumer confusion as a
  matter of law. In the same opinion it held that **NFTs are "goods" under the Lanham Act** — i.e.
  they are squarely trademarkable.
- **Critically, the Ninth Circuit *affirmed* the rejection of the defendants' First Amendment /
  *Rogers* and nominative fair use defences.** Calling something art, commentary or parody did not
  get them out.
- The parties **settled in April 2026**: permanent injunction, and transfer of the smart contracts,
  domains and remaining tokens to the rights-holder.

**What that means for us, stated plainly:** "it's a parody" is **not** a defence you can lean on
against this rights-holder in this circuit. The only thing that actually protects this fighter is the
concrete list of deviations below — that our marks, names, trade dress, colourways, proportions,
medium and props are demonstrably ours, so no consumer could think this is a licensed ape. Treat the
deviation table as a build spec with acceptance criteria, not as a rationalisation written after the
fact. The one piece of good news in the record is unchanged: **that case turned on marks and source
confusion, not on the drawing of an ape.** Nobody owns "cartoon ape with a big muzzle".

### Never copy — hard prohibitions
1. **No source name or any variant of it**, in geometry, textures, decals, mesh names, material
   names, code comments, UI strings, or filenames. Not the collection name, not its acronym,
   not the club/yacht wording, not the coin ticker.
2. **No source logo or wordmark.** In particular the ape-skull mark and any monogram lettering.
   Nothing that reads as a brand crest on the beanie, tee, robe, chain pendant, or mug.
3. **No source-branded garments.** The collection contains hat and shirt traits whose *names and
   artwork are the mark itself* (a branded cap in two colours, a flipped-brim branded cap, branded
   tees in black and red, a branded logo tank). **These are the trade dress. Do not build any of
   them, in any colourway.** Our hat is a generic knit beanie; our tee is a generic boat-neck stripe.
4. **No 1:1 recreation of any individual token's trait stack.** Do not build "the one with the gold
   fur", "the one with the crown", or any ape that a collector could identify as *their* ape.
   Individual high-profile tokens are identifiable specific works.
5. **No reuse of sampled source colour.** Pixel-sampling of two source tokens returned fur
   `#898889` / `#605F60` and face skin `#E3C8A1` / `#B18E5D`. **Those exact values must not appear
   in our palette.** Ours (§5) are shifted +18° warm in hue and −8% in value on the mask.
6. **No reproduction of the source's rendering style.** The source is flat 2D vector: uniform
   heavy black outline, cel fills, no shading, no light. We are stylized-PBR volumetric with a
   composed 3-light rig. **Do not add an outline pass to this character.** The rendering difference
   is itself a large part of what makes ours transformative — do not throw it away for "accuracy".
7. **No source backgrounds.** The collection's eight flat background colours (and the flat
   square-with-rounded-corners PFP crop) must never appear as this fighter's portrait/select
   background. Use the arena or our own portrait treatment.
8. **No use of the collection's trait vocabulary as user-facing strings.** Internally you may
   reason about "beanie"; do not ship UI copy that reads like a trait list from the source.
9. **Signature "special" traits stay off the base model.** Laser/beam eyes are broad crypto-Twitter
   culture and are fine **as a super-move VFX**, but they must not be a permanent facial feature,
   and must not use the source's specific beam colour/shape. Metallic-gold fur, and the
   zombie/robot/psychedelic fur types, are off-limits entirely — they are strongly associated with
   named individual tokens.

### Deliberate deviations that keep us distinct (build these in on purpose)
| # | Deviation | Why it protects us | Why it doesn't hurt the read |
|---|---|---|---|
| D1 | **Full-body 3D fighter with legs, feet, stance and animation.** The source is a static 2D head-and-shoulders portrait — it has no body below the chest and no canonical proportions. | Everything from §4 is our own invention. | The head still carries the read (§1). |
| D2 | **Muzzle projects 0.16 m in Z-depth; brow is a real 3D torus with a supratoral sulcus.** | Volumetric anatomy the flat source does not specify. | Increases the ape read. |
| D3 | **Proportions shifted ≥15%**: our ears are larger relative to the skull (0.67 × W_s), the cranium smaller, the muzzle longer, the neck longer and thinner, the mouth set lower. | No dimension is a 1:1 match. | These are all exaggerations *in the direction of* the read. |
| D4 | **Our own colourway** (§5) — warmer, darker, higher chroma; rust beanie, purple/green robe, cyan rim. | No sampled colour reused. | Value structure is preserved, which is what identifies. |
| D5 | **Our own prop set**: bathrobe, heavy gold chain, chipped `MEH` coffee mug, bunny slippers. **The chain and the mug and the slippers are not source traits at all** (confirmed by a 900-token trait census — the source's neckwear traits are a bone necklace, a bandolier and a hip-hop outfit; there is no gold chain, no mug and no slippers anywhere in the collection). | Three of the character's most prominent props are entirely ours. | They read as "exhausted crypto guy", which is the joke. |
| D6 | **Real eye geometry with sclera, iris, cornea, specular dot and lid solids.** The source's eyes are flat vector shapes with no highlight. | Original 3D construction. | The half-lidded droop is preserved and *improved*. |
| D7 | **Boat-neck stripe uses 11 coarse bands**, not the naval spec's 21 fine ones, and not the source's shirt artwork. | Distinct from both the source trait art and the real-world garment. | Coarse bands read better at 128 px anyway. |
| D8 | **Our own name, bio, moveset, voice and every UI string.** "TIRED APE / The Unimpressed Investor" is ours. | No source naming anywhere. | — |
| D9 | **Asymmetry pushed well past the source** — one earring, canted beanie, lopsided sneer, cigarette in one corner, mug in one hand, chain hanging off-centre. *(Correction: the source is **not** "rigidly symmetrical and head-on" — every token is drawn in the same ¾ turn with a fixed asymmetric light. Verified on #102 and #314. Our asymmetry is a large amplification of that, not an invention.)* | Composition and the specific asymmetries are ours; none of them appear together on any token. | Asymmetry makes the silhouette *more* memorable, and the ¾ read is source-accurate (§1.3). |
| D10 | **Costume 1 and the finisher are entirely non-source content** — captain's cap without insignia, money-green robe, `portfolio-rebalance`. | Nothing to map onto a trait. | — |

### Build-time compliance check (run these, don't assert them)
1. `grep -riE '<source collection name>|<acronym>|yacht|club|apecoin' src/characters/tired-ape.js` →
   **zero hits**, including in comments, mesh names, material names and `userData`.
2. Every `name` on a mesh, material or bone is generic (`'beanie'`, `'cig'`, `'hoop'`, `'chain'`,
   `'mug'`, `'maskRelief'`). No trait-vocabulary strings ship in UI copy (§9.8).
3. No hex in the palette (§5) equals any of `#898889`, `#605F60`, `#E3C8A1`, `#B18E5D` — the four
   values sampled off the source. Assert it in a test if you want to be sure it stays true.
4. No decal texture on the model except our own `MEH` mug mark.
5. The portrait/select background is arena or our own treatment — never a flat colour field in a
   rounded square (§9.7).

If in doubt on any prop: **if the trait's name or artwork contains the source's brand, do not build
it.** Everything else in the collection's vocabulary — knit caps, captain's hats, cigarettes, hoop
earrings, striped shirts, unshaven muzzles, half-lidded eyes — is generic real-world subject matter
that the source itself did not invent, and is safe as *archetype*.

---

## 10. Reference notes — what I actually looked at

### Primary source imagery (measured, not remembered)
I loaded the collection's on-chain metadata directory and two token images through public IPFS
gateways and took pixel measurements off them in a canvas.

**Re-verification (July 2026):** the metadata for tokens #1, #102 and #314 was re-fetched from the
same IPFS directory and the trait stacks below are **exact matches** — this brief's primary
references are sound. Re-reading the two images also produced three corrections that are now folded
into §1, §3.6, §3.7 and §9 D9: the collection's framing is a **three-quarter turn, not head-on**;
the canonical `Bored` mouth is **closed with no teeth**; and the pale concha fills **~0.75** of the
ear disc, not 0.62.

1. **Token #102** — traits `Fur: Gray, Eyes: Bored, Mouth: Bored, Clothes: Biker Vest, Hat: Irish Boho`.
   Image 631×631. This is the **canonical base face** (the two most common eye and mouth traits).
   Extracted by colour-histogram + per-row extent scan:
   - Dominant colours and their bounding boxes: fur `#898889` (31,490 px), fur shadow `#605F60`,
     face/muzzle skin `#E3C8A1` (28,905 px), skin shade `#B18E5D`, teeth/eye white `#FFFFFF`
     (only 176 px — the "Bored" eye aperture is *tiny*).
   - Row-extent scan gave: ear span y ≈ 205–315 px; total head width including ears ≈ 335 px at
     eye level; cranium width without ears ≈ 165–175 px; muzzle widest ≈ 163 px at y ≈ 385.
   - **The face mask (eyes + bridge + nostrils + whole muzzle) is one continuous light shape** —
     this is what §1 is built on.
2. **Token #314** — traits `Hat: Beanie, Eyes: Bored, Mouth: Bored Unshaven Cigarette,
   Earring: Gold Hoop, Fur: Golden Brown, Clothes: Caveman Pelt`. Image 631×631.
   Rendered with a 20-px measurement grid overlay and read off directly. This is the **trait-loaded
   exemplar** and the source of nearly every number in §3 and §7:
   - Head height crown→chin ≈ 275 px; head width across ears ≈ 325 px; cranium ≈ 165 px;
     ear diameter ≈ 105–110 px; neck ≈ 90 px.
   - Eye aperture ≈ 60 × 20 px, centred at ≈0.36 of head height down from the crown.
   - **Nostrils ≈ 52 × 22 px each, pair span ≈ 128 px = 0.78 × cranium width.** Far bigger than
     anyone builds them from memory.
   - Mouth line at ≈0.91 of head height down from the crown — **the mouth is nearly at the chin**.
   - Beanie: rolled ribbed cuff crossing the crown at ≈17°, set back off the brow, fur tuft escaping
     at the front-top. Gold hoop: ring ≈55 px outer, ≈6 px tube, hanging below the front of one ear
     (≈0.5 × ear diameter). Cigarette: thin white stick from the mouth corner at ≈−20°.
     Stubble: dense short dashes over the whole muzzle, sparing the lip band.
3. **Token #1** — `Mouth: Grin, Eyes: Blue Beams, Fur: Robot, Clothes: Vietnam Jacket`.
   Used only to read the **grimace/tooth construction**: the grin aperture spans nearly the full
   muzzle width, corners curve up, and both an upper and a lower row of squared, individually
   divided teeth are drawn — this is where §3.6's 10+10 tooth rack comes from.

### Trait census (my own, over a 900-token sample)
I fetched tokens 1–900 of the collection's metadata and tabulated every trait value.
This is the authority for §7's "what the trait language actually is" and for §9's "what is
*not* a trait". Selected results:
- **Mouth** (n=900): `Bored` 215, `Bored Unshaven` 127, `Bored Cigarette` 74, `Grin` 69,
  `Dumbfounded` 39, `Bored Unshaven Cigarette` 35, then Phoneme variants, `Rage`, `Jovial`,
  `Bored Pipe` 13, `Bored Cigar` 10, `Bored Party Horn` 10, `Grin Gold Grill` 13,
  down to `Bored Unshaven Pizza` 1.
- **Eyes**: `Bored` 156, `Bloodshot` 75, `Sleepy` 68, `Closed` 57, `3d` 54, `Coins` 54,
  `Wide Eyed` 51, `Sunglasses` 40 … `Blue Beams` 7, `Laser Eyes` 6.
- **Fur**: `Dark Brown` 124, `Black` 109, `Brown` 107, `Tan` 70, `Golden Brown` 66, `Cream` 62,
  `Pink` 46, `Gray` 44 … `Solid Gold` 8, `Trippy` 5.
- **Hat**: `Beanie` 49 (most common), `Seaman's Hat` 42, `Sea Captain's Hat` 34, `Fez` 32,
  `Fisherman's Hat` 30, then two branded-cap variants and a branded flipped-brim, `Party Hat 2` 17,
  `Party Hat 1` 4, `King's Crown` 5.
- **Clothes**: `Navy Striped Tee` 42 and `Striped Tee` 27 (**striped tees are collectively the most
  common garment**), `Bone Tee` 31, `Sailor Shirt` 20, `Bone Necklace` 24, `Bandolier` 13,
  `Hip Hop` 9, `Kings Robe` 4 — **and no gold chain of any kind**, which is why §7.6 is flagged as ours.
- **Earring**: `Silver Hoop` 84, `Silver Stud` 74, `Gold Stud` 50, `Gold Hoop` 39, `Cross` 23,
  `Diamond Stud` 18 — i.e. **~2/3 of apes have no earring at all**, so the hoop is a
  distinguishing choice rather than a default.
- Corroborating collection-wide counts from a public rarity tool: `Bored` mouth 2,272,
  `Bored Unshaven` 1,551, `Bored Cigarette` 710; `Bored` eyes 1,714, `Bloodshot` 846, `Closed` 710;
  `Brown` fur 1,370, `Dark Brown` 1,352, `Black` 1,229; earring `None` 7,023; hat `None` 2,256,
  **`Beanie` 578 (confirmed the most common hat collection-wide), then `Seaman's Hat`, then `Fez`**,
  with `Fisherman's Hat` 345, `Sea Captain's Hat` 304, `Party Hat 1` 120 further down;
  clothes `None` 1,886, `Sailor Shirt` 284, `Hawaiian` 283. Eyes `Blue Beams` is 49 collection-wide
  (the 900-sample's 7 is high by sampling noise; treat the sample's rare-trait counts as indicative
  only). 7,744 apes have a hat, so `Beanie` is 7.5% of hatted apes.
  (bayc.coolrarity.com; nftexp.io hat-property listing)
- Design-intent corroboration: the collection's lead designer is credited with establishing
  "the grinning mouth, the popping eyes, and the beanie" as the defining characteristics, and the
  collection is built from 172 distinct trait assets across 7 categories. The founders described
  the design brief as "what kind of people do we imagine would go into this dive bar".
  (en.wikipedia.org/wiki/Bored_Ape; decrypt.co profile of the artist)

### Real ape / chimp anatomy
- **Brow ridge**: chimpanzees have a prominent **supraorbital torus** — a *continuous* projecting bar
  above the orbits and nose, divisible into lateral supraorbital trigones, medial superciliary arches
  and a midline glabellar prominence, with a **supratoral sulcus** behind it that in *Pan* is deep
  enough to rest a pen in. (CARTA, *Morphology of the Brow Ridge*, carta.anthropogeny.org)
  → §3.2's one-piece torus + modelled sulcus.
- **Prognathism / muzzle**: the chimp facial plane is strongly projecting where the human one is
  near-vertical; projection is associated with the large canine roots and heavy chewing musculature,
  and with a shelf-like supraorbital torus. (scitable/Nature, *Primate Cranial Diversity*;
  Cobb 2008, *J. Anat.*) → §3.5's 0.16 m projection and the concave brow-to-lip dish.
- **Limb proportions**: chimpanzee **intermembral index ≈ 106–109** (range observed 100.1–113.7),
  vs ~70 in humans, ~120 in lowland gorillas, ~140 in orangutans. IMI = (humerus+radius)/(femur+tibia)
  × 100. Chimps also have **long robust fingers and a relatively small thumb**.
  (en.wikipedia.org/wiki/Intermembral_index; efossils.org *Limb proportions*)
  → §4.2's arm:leg 1.18 (a stylized push past the natural range) and §4.3's 0.48 thumb ratio.
- **Real-world garment spec** (used only so we can deliberately deviate): the naval marinière is
  specified as **21 white stripes 20 mm wide and 20–21 blue stripes 10 mm wide** on the body,
  15 white on the sleeves. (dalmardmarine.com; en.wikipedia.org/wiki/Marinière)
  → §7.4 uses 11 coarse bands instead — see §9 D7.

### Legal / trademark context (re-checked July 2026)
- The rights-holder sued a derivative-ape artist and his collaborator in June 2022 and won summary
  judgment on infringement, false designation of origin and cybersquatting; total judgment ≈**$9 M**
  with fees. The Ninth Circuit **vacated** that judgment and the injunction on **23 July 2025**
  (No. 24-879) for failure to prove likelihood of confusion as a matter of law, while holding that
  **NFTs are goods under the Lanham Act** and **affirming the rejection of the defendants'
  First Amendment / *Rogers* and nominative fair use defences**. The parties **settled in
  April 2026** — permanent injunction plus transfer of contracts, domains and remaining tokens to the
  rights-holder. Separately, mirrored collections were removed from a major marketplace in
  December 2021.
  (law.justia.com/cases/federal/appellate-courts/ca9/24-879/; blockchain.bakermckenzie.com 2025-08-04;
  coindesk.com 2026-04-08) → §9's framing: our risk is *marks and source confusion*, not ape
  morphology — but note that the "it's parody/art" defence **failed** on appeal, so §9's deviation
  table is the protection, not the parody framing.

### Codebase
- `GRAPHICS_CONTRACT.md` §0 (five AAA criteria), §3 (`surfaceMaps` kinds), §4 (`SURFACE` presets and
  `pbr()` rules), §9 (the parody mandate row for this fighter), §12 (definition of done).
- `CONTRACTS.md` §4 — `CharacterDef` shape, required bones, `group > hips > torso > …` hierarchy,
  faces +X, feet at y=0, model height ≈ `def.height`.
- `src/characters/tired-ape.js` — current `buildModel` (lines 107–242), the `C` palette (lines 13–33),
  31 clips, 19 moves, `finisher: portfolio-rebalance`, `TiredApeDef` at line 1289 (`height: 1.9`,
  `weight: 1.5`). Bone-usage count confirms all 13 bones are keyed by clips: `hips`/`torso`/`head`/
  `armL`/`armR`/`forearmL`/`forearmR`/`legL`/`legR` in 31 clips each, `robe` in 29, `mug` in 24,
  `earL`/`earR` in 9.
- `src/combat/Gore.js` — `_detach()` clones a bone's subtree and hides the original, and the clone
  **shares geometry and materials**; this is why §7.8's attachment rules exist.
- `src/render/` does not exist yet at time of writing — this brief is written against the API the
  graphics contract promises (`pbr()`, `SURFACE`, `surfaceMaps()`, `emissive()`, `decalTexture()`,
  `gradientRamp()`). If a preset name here is missing when you build, fall back per §3's rule
  (neutral micro-detail + one `console.warn`) rather than hand-rolling a material.

---

## 11. Acceptance checklist — measure these, don't eyeball them

Run every one of these before you call the model done. Each is a number you can print or a screenshot
you can measure, not a judgement call.

**Geometry (log these from the built model):**
1. `bbox.max.y − bbox.min.y` = **1.900 ± 0.005**, feet at y = 0.
2. Head width across the ears = **0.450 ± 0.008**; skull width without ears = **0.228 ± 0.004**.
3. Fur crown y = **1.800**, chin y = **1.420** → H_h = **0.380**; head-heights = **5.0**.
4. Eye centre y = ear centre y = **1.663 ± 0.004** (they are on the same line — this is the check
   that catches a broken vertical ladder faster than anything else).
5. Mouth line y = **1.454**; mouth aperture width = **0.190 ± 0.006** and it fits inside the muzzle's
   **0.206** at that height with lip band outboard on both sides.
6. Muzzle front plane x = **+0.260**, brow front x = **+0.100** → projection **0.160**.
7. Knuckle y = **0.320**, knee y = **0.446** → hands **0.126 below the knee**.
8. Intermembral index = **108**.

**Silhouette:** render filled-black at 128 px, front and ¾. The five §2 items must all be present
except the cigarette, which is explicitly exempt. Then desaturate a lit 128 px render: the beanie
must still separate from the fur (§5).

**No-gaps / no-seams sweep:** orbit the head at 30 cm. Every primitive junction listed in §3 —
muzzle/cranium (fillet torus), brow/cranium, cheek pouches, ear rim/plate/skull, beanie cuff/ear tops
— must be welded or overlapped with no visible intersection line.

**Contract compliance:**
- Every albedo hex in the shipped `C = {...}` has all three channels in **[30, 240]**. Assert it.
- Model triangles ≤ **32,000**, bind-pose draw calls ≤ **40** (§6.5). Print both.
- Bone names and hierarchy byte-identical to the frozen list at the top of this file; `hips` local
  position still `[0, 0.85, 0]`; all 31 clips still play.
- `window.__errs` empty; `npm run build` clean.
- Nothing written outside `src/characters/tired-ape.js`. Anything you need from the render, lighting
  or arena layers goes in your **report**, not into their files (§5 "Rim separation").

**Parody safety:** the five checks in §9's compliance block, all passing.

---

## 12. What is still unverified (belongs to §10's research pass)

- A published breakdown of the official 3D avatar conversions (polygonalmind.com blog) would not
  load over TLS; none of §3's numbers depend on it.
- Per-token rarity tooling is behind interactive UIs; the 900-token census in §10 is a sample and its
  percentages should be read as ±1.5% against the full 10,000. Its **rare**-trait counts (anything
  under ~15 in the sample) are noise — the collection-wide figures cited alongside them are the
  authority.
- The §10 pixel measurements come from **two** tokens. Head-height and mouth-height ratios were
  cross-checked and hold; the **muzzle width : cranium width** ratio (0.94) is the least corroborated
  number in §3 and is the one most likely to need a nudge once you have looked at your own
  screenshots. If the muzzle reads too heavy, take it to 0.88 × W_s before touching anything else —
  do **not** fix a heavy muzzle by narrowing the mask (§3.9) or raising the mouth (§3.6), which are
  the two changes that would actually destroy the likeness.
