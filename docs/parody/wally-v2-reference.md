# WALLY — AUTHORITATIVE REFERENCE MODEL (v2)

**This file SUPERSEDES `docs/parody/wally.md` wherever the two conflict.**

The user supplied four studio renders of the actual Wally model (front-three-quarter, front
arms-raised, back, and left profile) and asked for the in-game Wally to look *exactly* like it.
`wally.md` describes a tailored-suit corporate elephant. **That is now wrong.** The reference
model wears **no clothing at all**. Every suit element in the current build — jacket, lapels,
gorge, buttons, pocket square, shirt, tie, cuffs, trouser legs — must be **deleted**, not
restyled.

This is not a small revision. Read the whole file before editing `src/characters/wally.js`.

---

## 0. What the reference actually is

A **designer vinyl art toy** of an elephant, in the KAWS / Medicom lineage: one continuous
soft-edged form, uniform matte light grey, no seams, no surface texture, no clothing, and a
single graphic accent (black sunglasses with a white glyph in each lens).

The whole appeal is **purity of form**. It reads instantly at thumbnail size because the
silhouette is simple and the value is flat. Every previous round of this project added surface
detail; the critic's verdict on the last attempt was *"the overhaul added surface and subtracted
identity."* **The reference is the correction.** Restraint is the brief.

### The five things that make it read

1. **Enormous rounded ears**, wider than the body, the single widest feature of the silhouette.
2. **A trunk that hangs straight down the centre line** and curls forward at the tip.
3. **Black wraparound sunglasses** across the upper face, with a white squiggle glyph per lens.
4. **Uniform matte grey everywhere** — no clothes, no patterning, no texture, one value.
5. **Soft, chunky, seamless limbs** with no anatomy: no knees, no elbows, no muscles, no joints.

---

## 1. Silhouette specification

Fighter height stays **~2.0 m** (do not change the rig scale). Fractions of total height H,
feet at y = 0:

> **v2.1 CORRECTION — the numbers below replaced an earlier table that was WRONG.**
> The first table put the shoulder at 0.72 H and the crotch at 0.34 H. Built faithfully, that
> produces a **slender ~5-head-tall humanoid in an elephant mask** — which is exactly what
> `.shots/mine-wally-front.png` shows. The reference is a **~3.2-head-tall chunky toy**: the head
> is far larger, the legs far shorter, the body far wider for its height. If a build matches the
> table below and still looks lanky, the head is too small — enlarge it before anything else.

| Landmark | y / H | Notes |
|---|---|---|
| Crown of head | 1.00 | top of the cranium dome |
| Ear top | 0.95 | |
| Glasses centreline | 0.78 | across the upper face |
| Trunk base (between tusks) | 0.72 | |
| Ear bottom | 0.66 | big flaps, ~29% of H tall |
| Tusk tips | 0.64 | short and stubby |
| Chin / jaw underside | 0.64 | head occupies the top **36%** of H — this is the big change |
| Shoulder | 0.62 | no articulation, just where the arm starts |
| Widest belly | 0.38 | |
| Trunk tip (curl) | 0.36 | trunk reaches ~belly height |
| Wrist | 0.30 | |
| Crotch | 0.28 | legs are the bottom **28%** only |
| Fingertips | 0.22 | |
| Ankle | 0.05 | |
| Floor | 0.00 | |

**Widths**, as half-extents in metres at H = 2.0:

| Feature | half-width | note |
|---|---|---|
| **Ear span (outer edge)** | **±0.50** | THE WIDEST THING. Nothing may exceed it. |
| Head (cranium, no ears) | ±0.29 | big — it carries the toy proportion |
| Belly at its widest | ±0.31 | a visible bulge, not a straight tube |
| Shoulder | ±0.25 | narrower than the belly, so the torso reads as a pear |
| Leg (each, outer) | ±0.115 | thick stubby columns; inner gap ~0.06 m |
| Arm (upper) | ±0.085 | chunky, not sticks |
| Trunk | ±0.075 at base, ±0.045 at tip | thicker than you think |

**Proportion sanity check — do this before building.** With H = 2.0 m: the head block (crown 1.00
to chin 0.64) is **0.72 m tall**, the torso (0.64 to 0.28) is **0.72 m**, and the legs (0.28 to 0)
are **0.56 m**. Head : torso : legs = **1.29 : 1.29 : 1**. If your legs are longer than your head
is tall, it is wrong.

**The 128 px black-fill test.** Filled solid black at 128 px the shape must read as: a round head
flanked by two big round ears, a vertical line (the trunk) down the centre of a pear body, on two
stubby legs. If the ears do not clear the shoulders by a visible margin, the read fails. The ear
overhang beyond the shoulder is **0.20 m per side** — that is ~13 px at 128, unmistakable.

**Negative space that defines the shape:** the gap between ear and shoulder on each side, the gap
between the two legs, and the gap between each arm and the belly. Keep all three open.

---

## 2. Head

- **Cranium**: a slightly egg-shaped dome, taller than wide, widest at glasses height and
  narrowing gently toward the crown. Half-extents ±0.25 X, ±0.25 Z, and 0.30 tall from glasses
  line to crown. Perfectly smooth — no brow ridge, no cheekbones, no temple flats.
- **Face plane**: gently convex, no flat facets. The face does not protrude; the trunk does all
  the projecting.
- **Ears** — the signature. Each is a large **rounded-teardrop flap**: broad and round at the
  top, narrowing slightly to a rounded bottom, 0.52 m tall and 0.34 m wide, and **thick**
  (0.055 m) with a fully rounded rim — it is a soft slab, not a plane. Attached at the side of
  the cranium between y/H 0.78 and 0.94, angled **outward ~35° and back ~15°**, with a very
  slight forward cup. From behind, the ears read as two big rounded paddles flanking the skull.
  There is **no inner-ear detail, no pink inner surface, no vein structure** — same grey, both sides.
- **Trunk**: starts between the eyes at the glasses' lower edge, hangs **straight down the
  centre line**, tapering from ±0.075 at the base to ±0.035 at the tip, then **curls forward and
  up** through about 160° in the last 0.22 m, ending in a small rounded nostril pad. Three or
  four **shallow incised horizontal rings** on the upper third only — these are the only surface
  marks on the entire model. They are geometry (a shallow groove), not a painted line.
- **Tusks**: short, stubby, cream. Emerge either side of the trunk base at y/H 0.78, project
  forward-down-outward, curving gently up at the tip. Length 0.14 m, base radius 0.032 tapering
  to a rounded point. They read as small friendly nubs, not weapons.
- **No eyes are visible.** The sunglasses cover them completely. Do not model eyeballs behind the
  lenses — the reference has none, and a catchlight behind a black lens would break the graphic.
- **No mouth.** The reference has none.

---

## 3. Sunglasses — the graphic accent

- **Wraparound** style. A single continuous black form spanning the face, ~0.42 m wide overall,
  with two lens panels separated by a narrow bridge over the trunk root.
- Each lens is a **rounded rectangle**, wider than tall (0.155 × 0.095), with generously rounded
  corners, tilted very slightly (outer edge ~4° higher than inner).
- The frame has visible **thickness** — a chunky top rim (0.022) that reads as a solid bar across
  the brow, thinner at the bottom.
- **Temple arms** hook back along the side of the head and are visible from behind as two thin
  black lines crossing the upper ear roots. Build them; the back view shows them clearly.
- **THE LENS GLYPH.** In each lens, a **bold white rounded squiggle**: a stepped zigzag of three
  connected strokes — short horizontal, then a diagonal, then short horizontal — reading as a
  stylised market-chart tick / lightning mark. Rounded caps and joins, stroke weight ~0.014, sized
  to fill roughly 55% of the lens width and 60% of its height, centred. **Mirror it between the
  two lenses** so the pair is symmetrical about the trunk.
  This glyph is the character's logo — it must be crisp at gameplay distance. Build it as
  geometry or as a high-contrast emissive-free white decal on the lens face; do not let bloom
  smear it.

---

## 4. Body and limbs

Everything here is **soft, chunky and jointless**. No anatomy at all.

- **Torso**: a smooth pear. Narrow-ish at the shoulders (±0.26), swelling to the belly (±0.30 at
  y/H 0.44), tucking back in toward the crotch. Continuous with the head — there is a suggestion
  of a neck but no separation.
- **Arms**: simple tapered tubes from the shoulder, ±0.075 at the top to ±0.058 at the wrist.
  **No elbow.** They hang almost straight with a very slight outward bow, and read as one
  continuous sweep from shoulder to hand.
- **Hands**: soft mittens. A rounded palm mass with **four short stubby finger bumps plus a
  thumb**, each finger a rounded nub about 0.05 long — visible as separated digits in the
  arms-raised view but never articulated.
- **Legs**: thick, near-straight tapered columns, ±0.20 outer at the top narrowing slightly to
  the ankle. **No knee.** A clear gap between them.
- **Feet**: simple rounded pads, slightly wider than the ankle, with a single shallow **toe line**
  incised across the front. No individual toes.
- **Tail**: thin, hangs down the back centre from y/H 0.46, length 0.22, ending in a small
  rounded tuft slightly fatter than the tail itself.

---

## 5. Colour and surface — READ THIS TWICE

The single biggest change from the current build. The reference is **matte flocked vinyl**, not
PBR hide.

| Region | Hex | Role |
|---|---|---|
| Body / head / ears / trunk / limbs | `#c9c8c6` | one flat value over the ENTIRE body |
| Ambient-occluded crevices | `#a8a7a5` | under ears, between legs, under belly, ear roots |
| Grazing-angle sheen | `#dedcd9` | very subtle, edges only |
| Tusks | `#efe9da` | soft ivory, same matte finish |
| Glasses frame + lenses | `#191919` | the only near-black on the model |
| Lens glyph | `#ffffff` | pure white, matte |

**Material behaviour — this is the part previous rounds got wrong:**

- **Roughness ~0.85–0.92, metalness 0.** Flocked vinyl is almost purely diffuse.
- **No albedo texture. No normal map. No cracked hide. No pores. No wrinkles.** The body is a
  single flat colour. Any surface texture at all is a regression against the reference.
  The only permitted relief is *geometric*: the trunk rings and the toe line.
- What sells it instead is **form shading**: a very soft, wide terminator, gentle ambient
  occlusion in the crevices, and a faint grazing-angle sheen. Think Astro Bot's matte plastic or
  Sackboy's felt — the surface reads premium because the *form* is immaculate and the light wraps,
  not because there is detail on it.
- A **whisper of subsurface warmth** at thin edges (ear rims, finger nubs, trunk tip) sells the
  soft vinyl. Keep it subtle.
- The **glasses are the only glossy thing**: roughness ~0.25, with a soft specular streak along
  the top rim. That single highlight is the entire specular story of the character and it is what
  makes the grey read as matte by contrast. Do not add competing highlights.
- **Geometry must be smooth-shaded with no visible faceting.** The critic could "count the tris
  off the shading" on the last build. Raise segment counts on the head, ears, belly and limbs
  until the silhouette curve is clean at a 3 m portrait, and use smoothNormals. Bevels are not
  needed as a separate treatment here — everything is already round.

---

## 6. Costume variants

`buildModel(costume)` must keep working. Costume 0 is the reference exactly. For costume 1, change
**only** the lens tint and the glyph colour (the existing green-visor variant is fine) — do not
reintroduce clothing on any variant.

---

## 7. What must NOT change

- Bone names, rig hierarchy, bind pose convention, and the `CharacterDef` API (`CONTRACTS.md` §4).
- Hitbox/hurtbox sizes and every move script's timing and damage.
- If a proportion change moves a hand enough to alter a move's reach, adjust that move's reach
  constant and say so — do not change its frame data.

---

## 8. Parody safety

The reference is a designer-toy elephant with sunglasses. Keep it a **generic** art-toy elephant:
our own grey, our own chart-tick glyph, our own proportions. Do not add any real brand's name,
logo, colourway or signature mark, and do not reproduce the distinctive crossed-out-eyes motif
associated with a specific living artist's work. The sunglasses glyph must stay a market-chart
tick — that is our joke and it is what ties the toy to the crypto premise.

---

## 9. Acceptance test

1. **128 px black fill** — round head, two big ears clearing the shoulders, centre trunk line,
   two stubby legs. Nameable as an elephant in under two seconds.
2. **No clothing anywhere**, on any costume variant.
3. **One flat body value** — sampling the lit side of the belly, the shoulder and the thigh must
   give the same albedo within a couple of counts. No texture.
4. **Exactly one specular highlight** on the character: the top rim of the glasses.
5. **No visible faceting** on the head, ears, belly or limbs at a 3 m portrait.
6. **The white lens glyph is crisp and symmetrical** at gameplay distance.
7. Ears are the widest feature from the front, by a visible margin.

---

## 10. Build notes — deviations forced during implementation

Recorded by the agent that built `src/characters/wally.js` against this file.
Everything not listed here matches §1–§6 as written.

1. **Bone lateral stations moved.** §7 forbids changing bone names, hierarchy
   and bind convention; it does not fix their positions, and the old build's
   were authored around padded suit shoulders. `armL/R` z ±0.46 → ±0.285 →
   **±0.195** (round 3, see note 5), `legL/R` ±0.20 → ±0.118, `earL/R` ±0.26 →
   ±0.124, `tail` x −0.30 → −0.225 → **−0.250** (round 4), `trunk` to head-local
   (0.155, 0.110) → **(0.185, 0.110)** (round 4, see note 14).
   **Every ARM and LEG X (forward) station is unchanged** — arm 0.020, forearm
   (0, −0.34, 0), head, torso, hips — so no move's reach moved and no reach
   constant needed adjusting. The two X stations that did move are the tail
   (backwards, away from every hitbox) and the trunk root; the trunk moved
   *forward* 0.030, which if anything lengthens its visual reach, and every
   hitbox in this file is an authored constant rather than something derived
   from a bone, so nothing changed numerically. No hitbox, no frame datum and no
   damage number was touched.
2. **The trunk's bind curvature and its re-bake pass are deleted.** All three
   trunk bones now bind dead plumb (§2: "hangs straight down the centre line").
   The old build kept an S-curve in three static wrapper groups plus a loop that
   re-based every clip key whenever those wrappers changed; with the wrappers
   gone the loop had nothing to do. Consequence: clip trunk keys are now read as
   authored and every trunk animation sways around vertical instead of around
   a forward hook. Cosmetic only — no clip timing changed.
3. **Glyph white cannot be `#ffffff` on the wire.** `materials.js` guardAlbedo
   clamps every non-emissive albedo to the contract's 30–240 sRGB window, so
   `#ffffff` would silently become `#f0f0f0` anyway. *Round 4 supersedes the
   rest of this note: the glyph is now authored as §5's `#ffffff` put through
   `GLYPH_TRIM = 0.32`, which lands under both the clamp and the bloom knee —
   see note 17.* Likewise the glasses'
   `#191919` renders as `#1e1e1e` (the 30 sRGB floor), and the zero-floor repair
   gives the frame and lens a `#161616` emissive — far below any bloom
   threshold, and the codebase's standing policy for near-blacks.
4. **§5's grazing sheen is gated on the material tier.** It is delivered as a
   `sheenColor` lobe, which forces a `MeshPhysicalMaterial`; on `low`/`medium`
   (`setMaterialQuality({ physical: false })`) the body falls back to a plain
   matte Standard material. Same flat albedo, slightly harder terminator.
   §5's crevice value `#a8a7a5` is a lighting/AO target and is deliberately NOT
   a second body albedo — painting it would fail §9.3. Round 3 pulled the lobe
   from `sheen 0.22 / sheenRoughness 0.92` to `0.08 / 0.80` and
   `envMapIntensity 0.50 → 0.30`: at the old settings it was wide enough to
   behave as a flat brightener over the whole hemisphere and was helping erase
   the terminator §5 says is the thing that sells the toy.
5. **§1's arm/belly gap is open at hip height, not at the widest belly.** With
   belly ±0.30, an arm of radius 0.075 and an absolute ear ceiling of ±0.46,
   there is no lateral station that both clears the belly at y 0.88 and stays
   inside the ears. Round 3's compromise: the arm bone is at ±0.195 so the
   shoulder wall lands on §1's ±0.26 (0.270) and the ears clear it by 0.188 m =
   12 px at 128; the forearm bows out 0.058 and the hip flank is tucked, so the
   slot is genuinely open — real background pixels in the model's own 128 px
   front fill — from y/H 0.36 down to the fingertips, 2–3 px per side. The upper
   arm merges into the flank above that, which is what the reference toy does.
   Widest point of the whole limb is the hand at 0.314; the ears clear that by
   0.144 m.
6. **Trunk tip.** §1 puts it at y/H 0.42 = 0.840. The curl's AXIS low point is
   0.844 and the nostril pad finishes at 0.900; the lowest point of the SURFACE
   is 0.803, i.e. the tube's own radius below the landmark.
7. **Ear frame and outline.** §2's "outward ~35° and back ~15°" is implemented
   as a width axis U = (−0.250, 0.060, ±0.966). The up-component is deliberately
   small: at the 0.19 it was first authored with, the height axis V picked up
   enough lateral component to cancel the outline's own curve and the head +
   ears filled a 128 px black test as one rectangle. The outline is
   `eggPoints(0.340, 0.510, 2.05, 0.55)` and the plate centre rides 0.1715 out
   along U: ear top/bottom land at world 1.90 / 1.42 against §1's 1.92 / 1.40,
   and the tip at ±0.458 against §1's ±0.46. The shortened, harder-tapered lower
   lobe is what buys §9.1 its shoulder cusp — see note 9.

8. **THE BODY ALBEDO IS EXPOSURE-TRIMMED — read this note before "fixing" the
   grey back to `#c9c8c6`.** §5's `#c9c8c6` and `#efe9da` are authored in
   `wally.js` as `BODY_REF` / `IVORY_REF` and scaled by one linear factor
   `TRIM = 0.25` before they reach the material, giving `#6b6a69` and `#807d74`
   on the wire. This is NOT a restyle. Shot against the match rig at §5's
   values, every body sample came back clipped — front belly/shoulder/thigh at
   255,255,255 with 60–77% of each patch on the ceiling, the least-clipped view
   still 250,243,238 — so the character rendered as a pure-white cutout with no
   terminator, no ear-root AO and no crevice darkening at all. The cause is the
   stage's key/fill exposure, which is outside a character file; a character
   file's only lever is its albedo. **When the stage exposure is brought down,
   set `TRIM = 1` and the file is back on §5 exactly, with no other edit
   anywhere.** The trim is applied in LINEAR light, so the body/tusk
   relationship and the single-flat-value property §9.3 tests both survive it.
   The near-black frame is not trimmed. *Round 4: the glyph and the tusks now
   carry their own extra linear pulls on top of `TRIM` — see note 17 — because
   the rendered relationships, not the authored ones, were what failed.*

9. **§9.1's "centre trunk line" cannot exist in a solid front fill.** §1 puts
   the trunk tip at y/H 0.42 and the crotch at 0.34, so the whole trunk sits
   inside the belly's outline and contributes nothing to a filled silhouette.
   The other three cues are there, and were verified by rasterising the model
   itself at 128 px rather than by eye: crown dome y/H 1.00→0.96, ear paddles
   flaring to 58 px, a one-row 50→34 px cusp at y/H 0.71 where the ears clear
   the shoulders (12 px per side), a pear widening 34→38 px into the belly at
   y/H 0.44, open arm/belly slots at y/H 0.36→0.29, and two legs with a 4–6 px
   gap from y/H 0.30 down. The trunk stays a *shading* cue, which is how it read
   in round 2's greyscale downscale.

10. **The waist is welded by a shared profile with a tangent handover.**
    *Superseded in round 4.* Round 3 asserted the two lofts were "near-parallel"
    at the handover; they were not — they crossed at 28° and printed a hard
    crease across the whole body at y ≈ 1.055, front and back. There is now ONE
    `PEAR` table in `wally.js`, and each loft samples it through a closure factor
    that is 1 with **zero slope** at the handover station `PEAR_Y0 = 1.060`:
    `hip = pear·(1 − 12·max(0, y−Y0)²)`, `torso = pear·(1 − 12·max(0, Y0−y)²)·0.9985`.
    The two surfaces therefore meet with the same radius *and* the same radial
    derivative; measured, the exterior half-width deviates from the pure pear by
    at most 0.2 mm anywhere in the handover band and the crossing angle is 4.5°.
    Both lofts still close as long interior domes (hip at 1.34, torso at 0.77)
    deep inside the other solid, so the union stays a closed solid for any torso
    rotation and round 2's lower-back gash cannot return. Torso ring DEPTHS stay
    shy of the widths, which is what lifts the trunk clear of the chest contour
    in profile.

11. **The glasses use three material settings, not one.** §5 asks for
    "roughness ~0.25" on the glasses and §9.4 for exactly one specular
    highlight; with one material those conflict. Only the top rim is glossy
    (roughness 0.12, clearcoat 0.70, envMapIntensity 1.20 — round 3 ran it at
    0.085/0.90/2.60 and it came back a chrome tube mirroring the arena's teal
    key, so round 4 halved the env drive and slimmed the rim from 0.036 to
    0.030 deep). The bottom rim, bridge and temple arms are the SAME near-black
    at roughness 0.62. **The lenses are now 0.78 / envMapIntensity 0.04**:
    round 3's 0.46/0.38 still put broad blown reflections on both lens faces
    (4% and 16% of the sampled patches at 255) and rendered the lens as mid-teal
    rather than §5's `#191919`, which is what failed §9.4. At 0.78 the lens
    reflects nothing and the top rim is the entire specular story.

12. **The temple arms cross the ear root and are visible from behind.**
    *Round 3's deviation is withdrawn — it was not forced.* The ear's thickness
    axis W is (∓0.968, 0, −0.250), so the signed distance from the plate's
    mid-plane to a point on the temple arc rises from −0.020 at 104° (buried in
    the slab, which is where round 3 stopped) to +0.054 at 120°. The arc now
    runs 52°→120° with its radial standoff ramping 0.006 → 0.020, so the last
    16° pass through the ear root and emerge 26 mm behind the plate's rear face,
    at plate coordinates (u −0.041, v +0.118) — comfortably inside an outline
    that is ±0.170 by ±0.255. It is one continuous tube whose end happens to sit
    behind the flap, exactly as a real temple arm passes over an ear: no skewer,
    no far-side stub. Bedded into the cranium for the first two thirds, so there
    is no daylight under it in the front, side or three-quarter views either.

13. **The cranium is now one curve, shared with the glasses.** `HEAD_PROFILE`
    in `wally.js` is both the lathe profile and the wrap surface the sunglasses
    ride on (`x = sqrt((craniumR(y) + 0.008)^2 - z^2)`). Above the glasses line
    it is `r = 0.250 * sqrt(1 - t^2.3)`, which never has a flat top — round 2's
    profile held 0.249→0.234 over the first 40% of the rise and read as a
    rounded rectangular slab. The widest station is world 1.710 against §1's
    glasses centreline at 1.720; the 10 mm is what keeps the lens band on the
    fullest part of the curve.

14. **The trunk root moved 0.030 forward, and it flares.** §2 says the trunk
    "starts between the eyes at the glasses' lower edge". Rounds 2 and 3 could
    not deliver that: with the axis at world x 0.215 against a cranium whose
    front wall is at 0.310, a tube of §2's ±0.075 only breaks the face at world
    1.45 — mid-cheek, 0.22 m below the glasses. That left a large empty grey
    field between the lenses and the trunk, and it is the reason round 3's
    tusks read as eyes: they were the only marks in it. The axis is now
    world 0.245 and the radius law opens with a flare — 0.058 at the top ring
    (narrow enough to stay inside the face, so no cap is ever visible),
    trumpeting to 0.090 over 90 mm, then settling onto §2's ±0.075 at s ≈ 0.35
    and §1's ±0.055 mid-trunk. Measured on the built mesh the trunk breaks the
    face at world **1.720** and is unoccluded from **1.673** — the lenses'
    bottom edge — at a visible half-width of ±0.070. Everything above that is
    behind the lens panels and the bridge.
    Consequence for §2's "±0.075 at the base": the root is 20% fatter than that
    for its first 0.2 m. It is a root, not the trunk proper, and a root the same
    diameter as the trunk is exactly what made round 3's join read as a ledge.

15. **The muzzle mass is deleted.** Round 3 carried a superellipsoid on the face
    "flush with the cranium"; flush is the failure mode — it poked through over
    a lens-shaped patch and rendered as the soft blobby ghost the critic logged
    at (825,555). Everywhere else it sat 5–46 mm inside the head and did no
    work. §2's "the face does not protrude; the trunk does all the projecting"
    is now literally true.

16. **Tusk tips land at y/H 0.728, not §1's 0.71.** §2's direction (forward-down-
    outward at ~28°/22° with a terminal up-curve), §2's length (0.14) and §2's
    root station (y/H 0.78) over-determine the tip: 0.14 m leaving world 1.560
    at 28° off vertical drops 0.12, not 0.14. The direction is what carries the
    likeness — round 3's tusks were on spec for the tip station and read as eyes
    — so the direction wins and the tips finish 36 mm high, ~2 px at 128.
    Roots are bedded in the trunk's own flank at z ±0.058 against a trunk that
    is ±0.086 there, and inside the cranium as well, so a trunk swing cannot
    expose them.

17. **The glyph white is trimmed too, at 0.32.** Note 3 said the glyph was
    deliberately left untrimmed to stay the brightest thing on the character.
    That is what blew it out: §5 puts the glyph 1.27× the body, and untrimmed
    against a 0.25-trimmed body it ran at 2.2×, straight through the stage's
    bloom knee — round 3 measured ~1650 px clipped to 255,255,255 with a halo
    bleeding into the lens, against §3's "do not let bloom smear it". At 0.32
    it is still 1.4× the body and ~7× the lens, and it is under the knee. The
    tusks take a further 0.85 for the same reason (§5's 1.18 body:tusk ratio
    rendered at 1.8 because the old tusks were the most-lit thing on the model).
    **When the stage exposure comes down and `TRIM` goes to 1, set `TUSK_TRIM`
    and `GLYPH_TRIM` to 1 as well and the file is back on §5 exactly.**

18. **Head width between the ear roots reads narrow from behind and that is
    occlusion, not geometry.** `HEAD_PROFILE`'s widest station is §1's 0.250
    exactly. The ears are angled back 14.5°, so from directly behind they cover
    the cranium's outer flanks and only ±0.21–0.23 of it is measurable. Widening
    the cranium to make the *measurement* hit 0.25 would put the actual head
    over §1. Left alone.
