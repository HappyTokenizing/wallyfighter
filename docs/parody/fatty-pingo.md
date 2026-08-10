# FATTY PINGO — parody likeness brief

**Fighter:** `src/characters/fatty-pingo.js` · **Source archetype:** the chubby-penguin PFP/vinyl-toy
NFT collection (8,888 hand-drawn penguins → plush + moulded vinyl figures).
**Owner of this file's implementation:** the FATTY PINGO character agent, exclusively.

Read `GRAPHICS_CONTRACT.md` §0, §3, §4, §9, §11, §12 before you start. This brief is the research;
the contract is the law. Where they disagree, the contract wins.

> **The one-line thesis.** Fatty Pingo is not "a penguin who is fat." He is **two nested eggs — a
> huge one standing on its blunt end, with a slightly smaller one fused on top and no neck between
> them** — wrapped in a dark hood that comes *around* the silhouette on every side so the cream
> front is always an inset island that never touches the outline. Everything that is not those two
> eggs is tiny: the beak, the flippers, the feet. Get the two-egg stack and the inset-cream rule
> right and the parody lands from across the room. Get them wrong and you have a generic bird.

---

## Hard constraints inherited from the current file (do not break)

- **Bone map** returned by `buildModel()` must keep, *exactly and by name*: `hips, torso, head,
  armL, armR, legL, legR, tail, goggles, pack`. Every clip in `clips` indexes these ten strings.
  You **may add** bones (`belly`, `browL`, `browR`, `lidL`, `lidR`, `beakLower`, `scarf`, `pom`) —
  additive bones are how DOGEY solved the same problem — but you may not rename, remove or
  re-parent any of the ten.
- **`HIP_Y = 0.52`** (`const HIP = [0, 0.52, 0]`). `torso` sits at `hips + 0.14` → **y = 0.66**.
  `head` sits at `torso + 0.62` → **y = 1.28**. Every `hips` position key in all 33 clips is
  authored against `0.52`, and crouch/knockdown/getup hard-code `0.36 / 0.30 / 0.44 / 0.58`. If you
  move the hips you must re-derive every hips key in every clip. **Don't. Build around y = 1.28.**
- `CharacterDef.height = 1.6`, `weight = 1.3`. **1.60 m is the crown of the skull.** The beanie pom
  and the pack antenna are allowed to poke above it; hurtboxes do not follow them.
- **There are no knee/shin bones and no forearm bones.** `legL/legR` are single rigid segments
  hip→foot, and they swing **±0.5 rad** in `walk`, **±0.8 rad** in `launched`. `armL/armR` are single
  rigid flippers that swing to **z = 2.4 rad** (straight up) in `launched`. Author geometry that
  survives that with no articulation.
- **Gore never detaches `hips/torso/head/armL/armR/legL/legR`** (`src/combat/Gore.js:32`). Because
  Fatty Pingo has no `forearmL/R`, **he never loses a limb**. Do **not** add forearm bones — a
  stubby flipper severed at the midpoint looks like a bug, not a gag. Props on `armL/armR` are safe.
- `buildModel(costume)` must keep answering costume `0` and `1`.
- The **wrench** is a weapon: `bones.armR.userData.wrench`, `visible=false` until `wrenchStrike`
  shows it. Keep that exact path — `wrenchStrikeScript` reads it by name.
- The **`goggles` bone rotates `z = +0.85 rad` in `block`** ("visor down") and up to `+0.6` in
  `hitHeavy`. Whatever you hang on it must hinge cleanly from *above and behind* the eyes and land
  *over* them at 0.85 rad without intersecting the beak.
- **Move reach constants you will invalidate if you change limb or beak lengths.** Re-verify all of
  these in the harness after the rebuild: `wing-slap` `forward 0.9 / up 0.9`; `beak-jab` `forward
  1.0 / up 1.0`; `belly-bounce` `forward 0.8 / up 0.8`; `ice-slide` `forward 0.9 / up 0.4`;
  `wrench-strike` `forward 0.9 / up 1.0`; `rocket-hop` `forward 0.7 / up 1.2`; `snowball-toss`
  `forward 1.4 / up 1.0`.
- Model **faces +X**. Feet at `y = 0`. **`+Z` is the character's left.** The match camera sits
  roughly on the ±Z axis — **the player sees Fatty Pingo in profile.** Every decision below is made
  for the profile read first, the 3/4 read second, and the head-on read never.
- All coordinates in this brief are **metres in model space, measured from the floor between the
  feet**, unless explicitly labelled bone-local.
- Everything currently built with `lamb()` (`MeshLambertMaterial`, `flatShading: true`) must go.
  Per contract §4 the whole model moves to `pbr()` with `SURFACE` presets, `flatShading` off.
  Faceting comes from **bevelled geometry**, not flat normals. `SphereGeometry(r, 10, 8)` is
  currently the entire model — a 10×8 sphere is visibly polygonal at 1 m. Minimum 32×20 on the head
  and body; 24×16 on everything else.

### What the current build gets wrong (fix list, ranked)

1. **The head is far too small.** `sph(0.26, …, 1.0, 0.95, 1.0)` gives a head ~0.49 m tall on a
   1.60 m body = **3.3 head-heights**. The source figure measures **2.29–2.4 head-heights**
   (measured off the official 4.4-inch vinyl figure product photography, §10). This single number
   is the parody. Target **2.5** (our deliberate, legally-useful deviation — see §9).
2. **The cream front runs off the silhouette.** The belly sphere (`sph(0.38, bellyM, 0.13, …)`) is
   just a lighter ball jammed into a darker ball; from ±Z the cream reaches the outline. In the
   source the dark hood **wraps the entire outline** and the cream is an inset island. Highest-value
   fix after the head size.
3. **The beak is a `cone(0.085, 0.26)` — 0.26 m long and 8-sided.** That is a *toucan*. The source
   beak is a tiny rounded wedge projecting ~0.085 m and about as wide as it is long.
4. **The eyes are two spheres with no lid, no brow, no second catchlight** (`sph(0.06, bellyM)` +
   `sph(0.032, black)`). Contract §9 demands real eye geometry with lids and blink.
5. **There is a neck-shaped gap.** Head at y≈1.28 with a 0.26 radius, torso sphere r=0.42 centred at
   0.88 → a visible constriction reads as a neck. Penguins of this collection have **zero** neck.
6. **The feet are `box(0.34, 0.09, 0.2)`** — raw boxes, no toes, no webbing, no claws, no bevel.
7. **Legs are visible cylinders** (`cyl(0.07,0.08,0.26)`). On the source the leg is entirely hidden
   under the belly overhang; only ~0.12 m of foot shows.
8. **Everything is steampunk-brass.** `C.brass 0xc79a3b`, rusty-red pack, brass belly gauge. The
   collection's accessory language is **knitwear, scarves, headphones/earmuffs and chunky white
   oval shades** — moulded-toy plastic, not Victorian metal. Convert, don't delete (see §7).
9. **`C.belly 0xf2f6fa` is a cold near-white.** Vinyl toy cream is warm and off-white; a cold white
   goes grey-blue the instant a cool arena rim hits it.
10. **The tail is a `box(0.3, 0.07, 0.26)` rotated 0.55 rad** — a plank. Make it a bevelled wedge.

---

## 1. The 2-second test

**A giant round head with no neck sitting straight on a giant round belly — two eggs stacked, the
top one about 45% the height of the whole figure — with a dark blue-slate hood that comes down over
the crown, around both sides of the face and all the way round the body's outline, so the warm cream
front reads as a soft inset shield that never once touches the silhouette edge; punched into that
cream, low, at 39% up the head and only 0.41 head-widths apart, two solid-black glossy eye domes
with a single bright catchlight each and no visible white; between and just below them a tiny amber
triangle of a beak that projects barely more than its own width; and at the very bottom, poking out
from under a belly that overhangs them completely, two small amber webbed feet set so close together
that the gap between them is the only vertical negative space in the entire figure.** No hard edge
anywhere — minimum fillet radius 15 mm on the whole body — and a broad soft specular sweep across
the crown that says *moulded vinyl*, not feathers. That is the whole read. Two eggs, an inset cream
shield, one amber triangle, two amber feet. Everything else is decoration.

---

## 2. Silhouette specification

### The black-fill shape

Filled black at 128 px the figure must read as **a wide-based egg with a smaller egg fused on top,
two paddle nubs at the shoulders of the lower egg, one small triangle poking forward at the upper
egg's lower-front quadrant, and two tiny tabs at the base separated by a notch.** Nothing else may
survive at 128 px. If the beanie pom, the pack antenna, the scarf tail and the flippers are all
fighting for the outline at that size, you have failed — rank them: beak > feet-notch > flipper
nubs > pom > scarf > pack.

### Proportion ratios

`H = 1.60 m` (crown to floor). `HH` = head height, `HW` = head width.

| Quantity | Head-heights | Fraction of H | Metres |
|---|---|---|---|
| Total figure | 2.50 | 1.000 | 1.600 |
| Head height `HH` (crown → merge plane) | 1.00 | 0.400 | **0.640** |
| Head width `HW` (Z) | 1.125 × HH | 0.450 | **0.720** |
| Head depth (X) | 1.094 × HH | 0.438 | **0.700** |
| Body height (merge plane → floor) | 1.50 | 0.600 | 0.960 |
| Body max width (Z) | 1.48 | 0.594 | **0.950** |
| Body max depth (X) | 1.56 | 0.625 | **1.000** |
| Height of body's widest point | — | 0.200 | 0.320 |
| Flipper length | 0.56 | 0.225 | 0.360 |
| Foot length | 0.47 | 0.188 | 0.300 |
| Visible leg (belly underside → floor) | 0.19 | 0.075 | 0.120 |
| Foot-centre separation (Z) | 0.36 | 0.144 | 0.230 |
| Beak projection past the head surface | 0.13 | 0.053 | 0.085 |

Head-to-total is **2.5 head-heights**. For calibration: the source vinyl figure measures **2.29**,
a real Adélie penguin is roughly **5.5**, and the current build is **3.3**. 2.5 is deliberately one
notch leaner than the source (§9) while still living in an entirely different universe from a real
bird.

### Where the mass sits

- **Widest point at y = 0.32** — 20% of the way up, *below the hips bone*. The belly is a pendulum
  bob hung under the rig, not a barrel centred on it.
- **Centre of visual mass at y ≈ 0.55**, i.e. 34% of height. He is bottom-heavy to the point of
  being a weeble; the `getup` clip ("rocks on the belly and POPS upright") is the whole character
  and the silhouette has to promise it before the animation delivers it.
- **The head is 40% of the height and ~54% of the frontal area of the body.** It must never read as
  "perched on" the body — the two masses interpenetrate. Their union is a single continuous outline.
- Head/body junction: the head ellipsoid embeds into the body dome. **The visible junction is at
  y ≈ 1.04**, where the body half-width (0.300) is *slightly wider* than the head half-width
  (0.262). That 0.038 m shelf on each side is the tiny "shoulder" pinch you see in the source
  figures. **It is a shelf, not a neck** — there is no vertical section between the two masses.

### What must stay readable at 128 px

At 128 px the whole fighter is ~110 px tall: head 44 px, eyes 6 px, beak 6 px. Therefore:

1. **The beak must break the head's profile by ≥ 0.085 m** (7% of head height ≈ 3 px at 128). It is
   the *only* pointed thing on the model and the only cue that this is a bird. Never shorten it.
2. **The foot notch.** The two feet must be separated by a 0.075 m gap, and the belly must overhang
   them by ≥ 0.20 m on each side so the tabs read as *small* against the mass.
3. **The flipper must clear the body by ≥ 0.08 m in idle** (hold at 20–24° out) or it dissolves into
   the outline and the figure reads as a legless egg.
4. **The hood/cream boundary is not a silhouette feature** — it is the value read. At 128 px, filled
   black, it contributes nothing; in colour it is everything. Both reads must work independently.

### Negative space (this defines the shape)

- **The foot notch.** A 0.075 × 0.12 m vertical slot between the two feet, closed at the top by the
  belly's underside curve. This is the single most diagnostic void in the figure.
- **The flipper crescent.** Between the flipper's inner edge and the body's flank: a crescent
  0.08 m wide at the top, widening to 0.14 m at the flipper tip. It must be a *clean* crescent —
  no webbing, no sleeve, no cloth crossing it.
- **The chest scoop.** In profile, the concave sweep between the beak tip (x = +0.43, y = 1.17) and
  the belly's forward-most point (x = +0.47, y = 0.32). It bottoms out at roughly (x = +0.33,
  y = 0.85). This shallow S is what makes the profile read *penguin* instead of *snowman*.
- **The head/shoulder shelf notch.** Two 0.038 m re-entrant steps at y ≈ 1.04, one per side. Tiny,
  but it is the difference between "two fused eggs" and "one blob".
- **Under the beak.** A 0.03 m shadow gap between the beak's lower mandible and the cream face,
  achieved by projecting the beak forward, not by cutting into the face.

---

## 3. Head construction

This is the section that decides whether the parody works. Build it first, look at it head-on and
in profile, and do not touch the body until it reads.

### Master ellipsoid

- Centred **exactly on the `head` bone at y = 1.28**, local `(0, 0, 0)`. This is critical: `hitHeavy`
  rotates `head` by **0.65 rad (37°)** and `hitLight` by 0.45 rad. If the head pivots about its base
  the skull tears out of the body; if it pivots about its own centre a near-spherical head *swivels
  in its socket* and only the face features move. Free, and it fixes the worst gap in the model.
- Semi-axes: **a(Z, width) = 0.360, b(Y) = 0.320, c(X, depth) = 0.350.** Crown lands at exactly
  y = 1.600. `HH = 0.640`, `HW = 0.720`.
- Build from `SphereGeometry(1, 40, 28)` scaled, **not** from a low-poly sphere. Then shape it:
  - **Crown flattening:** scale Y by 0.965 for all vertices above local y = +0.22. The source crown
    is a slightly flattened dome, not a hemisphere; this is what catches the broad vinyl highlight.
  - **Back-of-head fullness:** for local x < 0, multiply radius by 1.030. The occiput is the fullest
    part of the head — this is real penguin anatomy (large head, no neck) and it reads as *baby*.
  - **Face flattening:** for local x > 0 and local y < 0, multiply radius by 0.965. This produces
    the gently convex face plane that the eyes and beak sit on.
  - **Under-chin continuity:** below local y = −0.26 do **not** close the ellipsoid — let it run into
    the body's dome and boolean/overlap there. There must be zero visible seam at y ≈ 1.04.

### Skull plane angles (measured in the +X profile)

| Plane | From horizontal | From vertical | Runs between |
|---|---|---|---|
| Crown | 0–14° | — | x = −0.10 → +0.12 at the top |
| Forehead | **62°** | 28° | y = 1.50 → 1.34 |
| Face (eye plane) | **78°** (leans back 12° at the top) | 12° | y = 1.34 → 1.10 |
| Under-face → chest | **34°** falling away | — | y = 1.10 → 0.96 |
| Occiput | near-vertical, then rolls back at **48°** into the spine | — | y = 1.45 → 1.05 |

**There is no muzzle plane.** This is the single anatomical fact that separates this character from
every dog, bear and ape on the roster: the beak is a *stuck-on wedge with no snout mass behind it*.
If you find yourself modelling a snout that tapers out of the skull, delete it and start again.

### Eyes

- **Eye disc diameter `D` = 0.145 × HW = 0.104 m.** Modelled as a sphere of radius 0.056 whose
  visible cap is 0.104 across, set so the dome stands **0.012 m proud** of the face surface. The
  proudness is not cosmetic: on a vinyl toy the eye is a separately-moulded dome, and the 0.012 m
  step is what catches a rim light and stops the eye reading as a painted dot.
- **Placement:** centres at **y = 1.215** (= 0.39 × HH above the head's merge plane at y = 0.96,
  i.e. *below* the head's vertical midline at 1.28 by 0.065 m) and **z = ±0.148** (separation
  0.295 m = **0.41 × HW**). Local surface x at that point ≈ 0.311; eye front face lands at
  x ≈ 0.323 head-local.
  > Eyes **below** the head's midline is the whole infantile read. Every degree you drift them
  > upward the character ages five years. Do not "centre" them.
- **Iris/pupil:** the entire visible disc is `eyeInk` — **there is no visible sclera in neutral.**
  Do not model white eyeballs with a small pupil; that is a completely different character (and a
  different source). Model a full-dark dome with a razor-thin (0.002 m) cream ring at the very
  bottom edge only, which reads as reflected bounce, not as an eye white.
- **Catchlights — two, and both matter.**
  - Primary: a specular dome at **0.22 × D** (0.023 m), positioned at 10–11 o'clock on the left eye
    and 1–2 o'clock on the right (mirrored) — offset up by 0.25 D and toward the centreline by
    0.18 D. Pure `eyeGlass`.
  - Secondary bounce: **0.10 × D** (0.010 m), at 4–5 o'clock (mirrored), tinted `rimIce` at 45%
    opacity. This second dim highlight is what separates "glossy vinyl eye" from "flat black
    sticker" and it is the cheapest AAA cue on the whole model.
- **Lid geometry** (contract §9 requires blink). Two spherical-cap shells, radius 0.060 (eye radius
  + 0.004), on new bones `lidL` / `lidR` pivoting about the eye centre on Z. Outer surface is
  `hoodMid` — the lid is an extension of the hood, so a blink reads as the hood sweeping down. Lid
  coverage from the top: **neutral 0%, relaxed 12%, smug 45%, mid-blink 70%, closed 100%.** Blink
  duration 5 frames, close in 2, hold 1, open in 2 — snap-close, ease-open.
- **Lower lid:** a second cap covering the bottom **8%** at neutral, rising to 55% for the squint/
  hurt poses. This is where "><" comes from; do not do it with the upper lid alone.

### Brows

The source has **no brows at all** — this is a deliberate design choice that makes the character
permanently non-threatening, and it is also the reason the current model has no expressive range.
Solution, and it is our own invention (see §9):

- Two bones `browL` / `browR` carrying a rounded wedge **0.16 × HW long (0.115 m) × 0.028 m thick ×
  0.024 m deep**, coloured `hoodDeep`, with a 0.008 m fillet on every edge.
- **Hidden at neutral**: parked at y = 1.34, tucked *inside* the hood's front edge so they are
  invisible. They slide down/forward along the face surface into view for the angry and hurt poses.
- Angry: inner ends drop to y = 1.268 and rotate **−22°** (inner-down). Hurt: both ends rise, rotate
  **+16°** (inner-up), and the brow shortens 15% by scale.
- Because they live *inside* the hood at rest, the character's default read stays "friendly toy" and
  you still get a fighting-game face when you need one.

### Ears

None — it's a bird. But add the two **vinyl-toy detail dimples** that the real figures have at the
ear position: 0.010 m diameter, 0.004 m deep hemispherical dimples at **z = ±0.238 (0.33 × HW),
y = 1.230**, in `hoodMid`. They are moulding vents on the real toy. Nobody will name them; everyone
will feel them.

### Beak

Real Adélie bill length is ~35 mm on a 460–610 mm bird — about **6.5% of body length**. Ours at
0.085 m projection on a 1.60 m fighter is **5.3%**. So the beak is very nearly anatomically correct
in absolute terms; it only *looks* comically tiny because the head is 2.7× oversized. That is the
joke, and it is why you must not enlarge it to "make it read".

- **Width** (Z) = 0.145 × HW = **0.104 m**. **Height** (Y, upper tip to lower tip) = 0.115 × HH =
  **0.074 m**. **Projection** past the face surface = **0.085 m** (≈ 0.82 × its own width).
- **Position:** centreline z = 0, vertical centre **y = 1.170** — that is **0.045 m below the eye
  centres**, so the beak's top ridge (y ≈ 1.207) sits level with the **bottom quarter of the eyes**.
  The base plants at head-local x ≈ 0.329; the tip lands at world x ≈ **0.434**.
- **Form:** a rounded triangular wedge, *not* a cone. Build it as a 6-segment lofted profile:
  base cross-section = rounded rectangle 0.104 (Z) × 0.050 (Y) with 0.018 corner radius; at 60%
  along, 0.062 × 0.036; at the tip, a 0.010 m sphere. Chamfer every edge at 0.008 m. **Nothing on
  this model may end in a point** — tip radius 0.010 minimum.
- **Angles:** the upper (culmen) surface slopes **18° down-forward**; the lower surface slopes
  **30° up-forward**; the resulting tip sits **24° below the eye line**.
- **Mandible split:** `beakLower` bone. A 0.004 m groove at **40% of the beak's height from the
  bottom**; the lower mandible is 0.006 m narrower than the upper so it reads as a separate part in
  silhouette. `beakLower` opens on Z to **−0.22 rad** max for shouts/taunt/KO — an open beak is the
  cheapest anger cue you have and the current model cannot do it at all.
- **Two details the source does not have** (deliberate, see §9): a slightly darker `beakDeep` nail
  covering the forward 22% of the upper mandible, and a pair of 0.006 m nostril dimples at 30% along
  the culmen, z = ±0.020. Both are real penguin anatomy and both are ours.

### Mouth

There is no mouth. The mandible split *is* the mouth. Corner direction: the split's line, seen
head-on, curves **downward at the outer ends by 6°** — a shallow frown geometrically, which reads
as neutral-friendly on a beak. Do not build a smile curve; on a beak it reads as a duck.

### The hood boundary (the most important paint line on the model)

Modelled as real geometry — a 0.006 m proud shell over the ellipsoid, not a texture — so the paint
edge catches light like moulded vinyl paint does.

- The cream face shield is an inverted-U. Its **top apex** sits at **y = 1.460** (0.22 × HH below
  the crown) on the centreline.
- Its **widest point** is **0.86 × HW = 0.620 m**, at y ≈ 1.20 — leaving a **0.050 m hood margin on
  each side** of the head's silhouette.
- Its lower edge does not close: it runs down past the merge plane and becomes the belly cream.
- The hood's **temple low point** is at y = 1.130, z = ±0.245 — just below eye level. The hood
  therefore comes *down between the eye and the outline*, framing each eye from outside. That frame
  is the collection's face, more than the eyes themselves.
- **Absolute rule:** viewed from ANY angle, the cream never reaches the silhouette edge of the head.
  If it does, the hood margin is too thin.

---

## 4. Body & limb proportions

### Torso / belly

- **There are no shoulders.** The `armL/armR` roots are surface attachments, not a shoulder girdle.
  Root them at **y = 0.950, z = ±0.400, x = −0.020**, which is on the body's surface at that height.
  (The current file roots them at `torso + 0.44` = y 1.10, `z = ±0.34` — too high and too narrow;
  the flippers currently sprout from the head's shelf.)
- Body form: a single **forward-biased ovoid** — centre `(x = −0.030, y = 0.560, z = 0)`, semi-axes
  `a(Z) = 0.475, b(Y) = 0.560, c(X) = 0.500`, then reshaped:
  - **Belly droop:** below y = 0.56 multiply the Z and X radii by `1 + 0.12·(1 − (y−0.10)/0.46)`,
    pushing the widest point down to **y = 0.320** and giving the overhang.
  - **Forward bias:** for x > 0, multiply radius by 1.06 below y = 0.70 and by 0.94 above it. The
    belly leads; the chest recedes. This is what carves the chest scoop.
  - **Back:** a single unbroken convex arc from the occiput to the tail root. **Never** put a
    shoulder blade, a spine groove or a waist in it.
- **Taper:** from the widest (half-width 0.475 at y = 0.32) the body narrows to half-width **0.300
  at y = 1.04** (the shelf) and to **0.330 at y = 0.10** (the underside, just before it turns under).
  Taper ratio widest:shoulder = **1.58 : 1**.
- **Underside:** the belly turns under at y = 0.10 into a shallow dome whose lowest point is
  **y = 0.075** at x = +0.05. The feet emerge from beneath it. The gap between the belly's underside
  and the floor is only 0.075 m — that is the "he's basically sitting on the ground" read.

### Flippers

- **Length 0.360 m** (0.225 H). Real penguin flippers run ~37% of body length; the source's are
  ~22%. **The 40% shortening is the cartoon move — commit to it.**
- Section: a flattened paddle. **Root 0.190 (Y) × 0.085 (X); mid 0.165 × 0.060; tip 0.130 × 0.035.**
  Tip is a half-cylinder cap of radius 0.065, never a point.
- Twist: **8° leading-edge-down** along the length, so a rim light rakes across it.
- Idle carriage: held **20–24° out** from the body flank (the current `idle` keys `armL z = 0.14 →
  0.24` are already in that range — good, keep them). Tip reaches y ≈ 0.62.
- **Colour split:** outer face and leading edge `hoodMid`; inner face `hoodLight` (a 20% lighter
  hood, not cream — cream-on-cream kills the read against the belly); trailing edge and the last
  0.06 m of the underside `bellyCream`. A 0.015 m `hoodDeep` AO seam at the root.
- Because there are no elbows, **all bend is silhouette-shaped**: put a 6° concave sweep into the
  trailing edge so the flipper never reads as a straight paddle.

### Legs & feet

- **The leg is invisible.** Model a 0.075 m-radius stub from the hip socket down to the ankle at
  y = 0.105, entirely inside the belly overhang, in `hoodDeep` so that if a `launched` pose exposes
  it, it reads as shadow rather than as a chicken leg.
- **Foot:** length **0.300 m** (0.240 forward of the ankle, 0.060 behind), width **0.155 m**,
  thickness **0.055 m** at the ankle tapering to **0.028 m** at the toe edge. Top surface convex,
  sole flat with a 0.012 m fillet all round.
- **Three forward toes plus a vestigial hallux** (real penguin anatomy: three large webbed toes and
  a tiny fourth at the back). Toes separated by two webbing grooves 0.006 m wide and 0.010 m deep
  that **stop 0.030 m short of the toe tips**, so the web reads as web and not as three separate
  toes. Each toe ends in a blunt 0.020 m claw nub in `beakDeep`. Hallux: a 0.025 m nub at the heel,
  visible only from behind.
- **Stance:** foot centres at **z = ±0.115** (0.230 m apart), inner edges **0.075 m** apart. Toe-out
  **9°**. Against a 0.950 m body this is comically narrow — that is the point.
- Feet are `beakAmber` on top, `beakDeep` on the sole and in the web grooves.

### Tail

- Keep the `tail` bone (it already carries spring-follow secondary motion in every clip).
- A bevelled wedge: **0.160 m long, 0.220 m wide at the root tapering to 0.130 at the tip, 0.060 m
  thick**, rooted at `(x = −0.44, y = 0.260)` and angled **28° down-back**. All edges filleted
  0.015. `hoodDeep`, 8% darker than the back.
- Grounding note: gentoo penguins have the longest tail of any penguin and use it as a prop. Ours is
  short and stubby — it exists to break the egg's rear outline and to give the spring solver
  something to wag, not to be a real tail.

### Posture

- **Spine:** a single continuous C, leaning back **4°** overall. There is no thoracic/lumbar break.
- **Shoulder height:** the flipper roots sit at 59% of total height. Both at the same height in
  idle — no dropped shoulder, no contrapposto. He is symmetrical and planted; the *belly* does the
  acting, not the shoulders.
- **Head carriage:** crown 0.020 m *forward* of the hip axis; beak tip at x = +0.434; belly
  forward-most at x = +0.470. The belly therefore leads the beak by **0.036 m** — just enough that
  the profile reads as two stacked forward bumps with the chest scoop between them.
- **Weight:** dead centre between the feet in idle, and the whole figure sits so that a vertical
  dropped from the crown lands **0.020 m in front of the toe tips**. He is permanently on the edge
  of toppling forward and never does. That is the joke of `getup`.
- **Waddle (`walk`, already keyed at `hips` rx ±0.2):** the roll is the character. Support the
  existing keys by making the belly's mass visually *lag* the hip roll — see §8.

---

## 5. Colour script

Ten values. All inside the contract's 30–240 sRGB dielectric range (§0), which the Filament
reference gives as the strict 50–240 / tolerant 30–240 band for base colour.

| Name | Hex | Rel. luminance | Used for |
|---|---|---|---|
| `bellyCream` | **`#F4EEE2`** | 0.93 | The face shield + belly + flipper trailing edge. **Lightest value on the model.** Warm off-white, never `#FFFFFF`. |
| `knitCream` | **`#EFE3C8`** | 0.89 | Beanie/scarf stripe, shades frame. Reads as a *different material* at the same value. |
| `bellyShade` | **`#D8CEBE`** | 0.81 | Cream's core shadow: under the beak, under the flipper root, the belly's lower turn-under. Painted into the AO map, not a separate material. |
| `hoodLight` | **`#6E86C4`** | 0.53 | Flipper inner face, crown up-facing planes, bounce tint on the back's top. |
| `beakAmber` | **`#F2933A`** | 0.63 | Beak, feet. **The only saturated warm on the model** — it is the accent and it is why the eye lands on the face and the feet. |
| `knitTeal` | **`#2FA79A`** | 0.57 | Beanie/scarf body, pack body. Our colour, not the source's (§9). |
| `beakDeep` | **`#C6641C`** | 0.44 | Beak nail, mandible groove, foot sole, web grooves, claw nubs. |
| `hoodMid` | **`#33456B`** | 0.28 | **The hood.** Back, crown, head sides, body outline wrap, lids, brow-adjacent. The dominant dark. |
| `hoodDeep` | **`#1E2A45`** | 0.17 | Tail, under-flipper AO, hidden leg stub, the 0.015 m seam lines, the hood/cream paint-edge shadow. |
| `eyeInk` | **`#14161C`** | 0.09 | Eye domes. **Darkest value on the model** — darker than the hood, so the eyes punch even in the deepest shadow. |
| `eyeGlass` | **`#FFFFFF`** | 1.00 | Catchlights only. The only pure white anywhere. Total coverage under 0.2% of screen area. |
| `rimIce` | **`#BFE4FF`** | — | **Rim light colour** (`makeCinematicRig` `opts.rimColor`). See below. |
| `warmKick` | **`#FFB877`** | — | Secondary low-front fill, 0.35 intensity. |

### Value relationships (this is how he reads against a busy arena)

Deliberately **three tiers with a hole in the middle**:

- **Tier A — 0.81 to 0.93.** `bellyCream`, `knitCream`, `bellyShade`. ~45% of front-facing area.
- **Tier B — 0.44 to 0.63.** `beakAmber`, `knitTeal`, `hoodLight`, `beakDeep`. ~15%.
- **Tier C — 0.09 to 0.28.** `hoodMid`, `hoodDeep`, `eyeInk`. ~40%.

**Nothing lives between 0.63 and 0.81.** That gap is intentional: the cream shield separates from
every other part of the character by at least a 0.18 luminance step, so the face and belly hold
together as one bright island at any distance, and the hood holds as one dark frame. Against a busy
arena you are relying on a large, simple light shape inside a large, simple dark shape — the same
trick the source's flat 2D art uses.

### Rim & separation strategy

- The rim light **only lands on Tier C**, which is exactly the silhouette-wrapping hood. Set
  `rimColor = #BFE4FF`, `rimIntensity ≈ 1.6`. Because the hood wraps the entire outline (§3), the
  rim traces the *whole* character outline, not just the back. This is the payoff of the inset-cream
  rule and it is why that rule is non-negotiable.
- **The cream cannot rely on rim** — it is already bright. It separates by *value contrast with its
  own dark frame*, which travels with the character into every arena. Clamp the belly's
  `envMapIntensity` to **0.70** so a bright arena does not blow the cream to paper-white and destroy
  the 0.18 step to `bellyShade`.
- In `arctic-day` / `snow` arenas the cream will fight the background. Mitigation: raise
  `hoodDeep`'s coverage — widen the hood margin from 0.050 to 0.070 m on the head — via an arena
  hint if the pipeline allows, otherwise just author the wider margin and accept it everywhere.
- `warmKick #FFB877` at 0.35 from low-front stops the cream from turning grey-blue under the ice rim
  and gives the belly its underside warmth. Without it the vinyl reads as painted plaster.

---

## 6. Surfacing

The target is **moulded vinyl** — specifically a 4.4-inch premium moulded figure — with a whisper of
bird underneath. Not feathers. Not fur. Not plastic-toy-shiny either: the source figures are
*satin*, with broad soft highlights.

| Region | `SURFACE` preset (§4) | `surfaceMaps` kind (§3) | Key overrides |
|---|---|---|---|
| Hood / back / head | `plastic` | `feather`, `{ scale: 6, wear: 0.15 }` | `roughness 0.38`, `normalScale 0.25`, `clearcoat 0.35`, `clearcoatRoughness 0.28`, `envMapIntensity 1.0` |
| Cream face + belly | `plastic` | `plastic-matte`, `{ scale: 4 }` | `roughness 0.46`, `clearcoat 0.25`, `clearcoatRoughness 0.32`, `sheen 0.15`, `sheenColor #FFD9B0`, `envMapIntensity 0.70` |
| Beak + feet | `plastic-gloss` | `plastic-gloss`, `{ scale: 8 }` | `roughness 0.30`, `clearcoat 0.60`, `clearcoatRoughness 0.15`, `transmission 0.06`, `thickness 0.03`, `attenuationColor #FFB870` |
| Eye domes | `plastic-gloss` | — | `roughness 0.05`, `clearcoat 1.0`, `clearcoatRoughness 0.03`, `envMapIntensity 1.6` |
| Lids / brows | `plastic` | `plastic-matte` | matches hood exactly — same cached material |
| Beanie / scarf | `cloth` | `cloth-knit`, `{ scale: 14 }` | `roughness 0.85`, `normalScale 1.0`, `sheen 0.35`, `sheenRoughness 0.6`, `clearcoat 0` |
| Shades frame | `plastic-gloss` | `plastic-gloss` | `roughness 0.18`, `clearcoat 0.8` |
| Shades lens | `glass` | `glass` | `transmission 0.55`, `roughness 0.10`, `ior 1.5`, tint `#7DE8FF` at 30% |
| Pack shell | `rubber` | `plastic-matte`, `{ wear: 0.35 }` | `roughness 0.62`, `clearcoat 0.15` |
| Wrench | `metal` | `metal-brushed`, `{ wear: 0.5 }` | `metalness 1.0`, `roughness 0.34` |

### How the surface must behave under light

1. **The vinyl tell is a broad, soft, low-contrast specular sweep across the crown** — a smear
   roughly 0.30 m long, not a tight dot. That comes from `roughness ≈ 0.38` under a `clearcoat` of
   only 0.35: enough coat to give a second, wider specular lobe, not enough to look automotive. The
   Filament reference notes clearcoat assumes an IOR-1.5 polyurethane layer with 4% Fresnel; that
   4% is exactly the faint "waxy sheen" you want, and it is why the coat strength stays low.
   Clamp clearcoat roughness to ≥ 0.089 (half-float precision floor).
2. **Roughness must vary spatially.** Author a roughness map with: crown and upper back **0.34**
   (buffed by handling), belly and lower flanks **0.50** (a moulded toy is duller where it is
   deepest in the mould), crevices (flipper root, under-belly, between toes) **0.58**, and a
   **0.30 band 0.008 m wide right along the hood/cream paint edge** — paint sits slightly proud and
   slightly glossier than the substrate. That last one is the single most convincing "this is a
   painted toy" cue on the model. Flat roughness = dead plastic.
3. **Thin-edge subsurface.** Real PVC/vinyl transmits light at thin sections. Give the flipper's
   outer 0.06 m, the beak, the webbing between the toes and the tail's tip a
   `MeshPhysicalMaterial` with `transmission 0.06–0.10`, `thickness 0.02–0.04`,
   `attenuationColor #FFB870`. Under a backlight those four places should glow faintly amber. This
   costs almost nothing and it is the difference between "vinyl" and "painted wood".
4. **Fresnel.** `envMapIntensity 1.0` on the hood and the grazing-angle response of the clearcoat
   give you a soft edge brightening on the round forms. Do **not** add a fake fresnel rim shader —
   the round geometry plus the clearcoat already does it, and doubling up reads as a cheap outline.
5. **Sheen** on the knitwear only (`sheen 0.35`, `sheenRoughness 0.6`). Knit is the one region on
   the model that must NOT look moulded — it is the contrast that proves everything else is vinyl.
6. **No wetness anywhere.** He is an arctic inventor, not a swimming bird. `skin-wet` is wrong.

### Micro-detail that sells it

- **A parting-line seam.** A 0.0015 m-wide, 0.0008 m-deep groove running the vertical centreline of
  the *back* of the head and body, and a matching horizontal one around the crown at y = 1.52.
  Present on the real figures. It is invisible at 3 m and unmistakable at 30 cm.
- **A crown vent pinhole**, 0.006 m diameter, at `(x = −0.02, z = 0, y = 1.598)`. This is on the
  actual toy and it is the most "I have held this object" detail available.
- **The ear dimples** (§3).
- **AO in exactly four places:** flipper root crescent, under the belly overhang, between the toes,
  and along the hood/cream boundary. Radius 4, strength 1.0 via `aoFromHeight`.
- **Zero pores, zero fur, zero feather barbs at the surface.** The `feather` normal map is running
  at `normalScale 0.25` — it exists to break up the specular, not to be seen. If you can see
  individual feathers, halve it again.
- **Every silhouette transition filleted at 8–12 mm; nothing on the body under a 15 mm radius.**
  "Total absence of hard edges" is a literal spec, not a mood.

---

## 7. Signature props & wardrobe

The collection's accessory vocabulary — from its own trait taxonomy (background / body / face /
head / skin) — is **knitted beanies, scarves, earmuffs & headphones, chunky oval sunglasses, hoodies
and shirts, and the occasional absurd hat**. The current build's Victorian brass goggles and rusty
inventor pack are the wrong dialect. Convert them; do not delete the character.

### Costume 0 — "Cold Storage"

**1. Knit beanie** — `head` child, new bone `pom`.
- A ribbed dome cap sitting on the crown: inner radius matched to the head ellipsoid + 0.008 m,
  covering from y = 1.600 down to a brim at **y = 1.415** on the centreline and **y = 1.335** at the
  sides (the brim dips lower at the temples). Thickness 0.022 m with a rolled brim of radius 0.030.
- **12 vertical ribs**, each a 0.012 m half-round proud of the surface, running crown to brim. This
  is the geometry that makes it read as *knit* and not as *helmet* at 3 m.
- Colours: `knitTeal` body, two `knitCream` bands 0.030 m wide at the brim.
- **Pom:** a 0.075 m fuzzy sphere on bone `pom` at `(x = −0.03, y = 1.665, z = 0)`, built as an
  icosphere with 0.010 m radial noise displacement, `cloth-knit` maps at `scale 22`. Spring-follow
  secondary motion, damping 0.72, stiffness 14 — it must overshoot on every `hitHeavy`.
- **Rig:** child of `head`. It survives the 0.65 rad head rotation because it rotates with the
  skull. It must never be a child of `goggles`.

**2. Chunky oval shades — on the `goggles` bone.**
This is the dual-read that saves the character: the collection's most-recognised face accessory is a
pair of thick white oval sunglasses, and an inventor pushes his goggles up on his forehead. Same
object.
- Two oval lenses, **0.115 m (Z) × 0.088 m (Y) × 0.020 m thick**, in a `knitCream` frame 0.018 m
  wide with a 0.008 m fillet on every edge. Lenses `#7DE8FF` glass (see §6), 0.55 transmission —
  keeps the existing `C.lens` cyan and keeps them readable as *lenses* rather than black holes.
- Bridge: 0.035 m wide, arched up 0.010 m. Temple arms 0.150 m long sweeping back at 12° and
  terminating in a 0.030 m elastic band segment in `hoodDeep`.
- **Rest pose (goggles rot = 0):** parked on the forehead, lens centres at **y = 1.395**, so they
  sit above the eyes and below the beanie brim, tilted back 28°.
- **`block` pose (goggles z = +0.85 rad):** the hinge is at `(x = 0.06, y = 1.44)` — set the pivot
  there so at 0.85 rad the lens centres land at y ≈ 1.215, i.e. **exactly over the eyes**, with the
  lens front at x = 0.345 clearing the beak's base (0.329) by 0.016 m. Verify this in the harness;
  if it clips the beak, move the hinge up 0.01, not the beak.
- **Rig:** child of `goggles` only. Nothing else may parent to `goggles`.

**3. Knit scarf** — `torso` child, new bone `scarf`.
- A tube collar around the head/body shelf: torus-ish, outer radius **0.345**, tube radius 0.055,
  centred at y = 1.010, in `knitTeal` with `knitCream` end-stripes. Ribbed the same way as the
  beanie (16 ribs).
- One trailing end: 0.320 m long, 0.130 m wide, 0.030 m thick, hanging over the **right** flank
  (z = −0.30) with 3 segments on the `scarf` bone for cloth simulation. Fringe: 7 tabs, 0.045 m.
- **The scarf must not cross the flipper crescent** (§2). Route the trailing end *behind* the
  flipper root, hanging down the back-right.

**4. Gadget pack** — keep the `pack` bone and its spring motion; restyle it.
- Silhouette stays: a rounded slab **0.24 (X) × 0.50 (Y) × 0.42 (Z)** on the back at
  `(x = −0.36, y = 0.92)` — but every edge gets a **0.035 m fillet** so it reads as moulded toy
  luggage, not a crate. `knitTeal` shell, `knitCream` lid, `beakAmber` buckles.
- Two canisters (keep them — they carry `backpackBurst`'s nozzle VFX): cylinders r 0.075, h 0.38,
  now in `knitCream` with `beakAmber` caps, and the nozzles in `metal-brushed`.
- The blinky diagnostics light stays (`emissive('#FF4D5E', 2.0, 'neon-panel')` per §4 — that is the
  **only** sanctioned bloom source on this fighter). Antenna stays.
- Drop the brass belly gauge from the chest. It punches a hole in the cream shield, which is the one
  thing that must stay unbroken. If you want the gauge, move it onto the **pack lid**.

**5. Wrench** — keep exactly as-is structurally (`bones.armR.userData.wrench`, `visible = false`),
but bevel it (0.006 m on every box edge) and re-material to `metal-brushed`. It is the only metal on
the model and that contrast is worth keeping.

### Costume 1 — "Midnight Prototype"

Keep the existing costume-1 hook. Swap: `hoodMid → #3B2A5E`, `hoodDeep → #2A1D45`,
`hoodLight → #7A63B8`, `knitTeal → #C8524A` (the red scarf/beanie the current costume 1 already
implies), `knitCream → #F0DCC2`, pack shell `#226E63`. **`bellyCream`, `beakAmber`, `beakDeep` and
`eyeInk` never change between costumes** — they are the identity.

### Rig & survival rules

- Every prop is a child of exactly one bone: beanie + pom → `head`; shades → `goggles`; scarf →
  `torso` (+ `scarf`); pack → `pack`; wrench → `armR`.
- Tag each prop root `userData.prop = '<name>'` and `userData.styleTarget = true` so `styleProp()`
  (already in this file) can recolour it for `frozenAssets` / `coldStorage`.
- **Dismemberment:** Fatty Pingo has no detachable bones (§ constraints), so no prop can be orphaned
  by Gore. Do not add `forearmL/R` to "make the flippers detachable".
- **Ice shell:** `makeIceShell(fighter, 1.5)` wraps the fighter to 1.5 m. With a 0.95 m-wide body the
  default shell will clip the flanks — widen the shell or accept the intersection, but *look* at it.
- Nothing may be parented to `hips` except the existing structure — `bellyExchangeScript` spins the
  whole hips group and anything attached will smear.

---

## 8. Expression & motion notes

### Face poses (build all six as named lid/brow/beak states)

| Pose | Upper lid | Lower lid | Brow | `beakLower` | Extra |
|---|---|---|---|---|---|
| **idle** | 0% | 8% | hidden in hood | 0 | slow 4.5 s blink cycle; a double-blink every third cycle |
| **angry** | 34% | 20% | visible, **−22° inner-down**, y 1.268 | −0.10 rad | eyes scale 1.06 on Y; catchlight shrinks to 0.16 D |
| **hurt** | 62% | 55% | visible, **+16° inner-up**, shortened 15% | −0.22 rad | this is the "><" — both lids, not one |
| **KO** | 88% | 30% | **+16°**, dropped 0.02 | −0.22 rad, held | head rolls back 22°, beak points up, pom hangs |
| **taunt** | 100% (closed, arced) | — | hidden | −0.16 rad | the friendly closed-eye pose — see §9 for what NOT to do with it |
| **win** | 20% | 30% | hidden | −0.08 rad | lower-lid-up "genuine smile" squint; hold the catchlight full size |

Blink: close 2 frames, hold 1, open 2. Never linear — ease-out on close, ease-in-out on open.

### Secondary motion

Contract §11 gives you a spring solver. Use it on five things, in priority order:

1. **Belly jiggle.** New bone `belly`, child of `torso`, driving a **non-uniform scale** on the lower
   body: `(1 + 0.06·s)` on Z and X, `(1 − 0.04·s)` on Y, where `s` is the spring state. Stiffness
   18, damping 0.55 — deliberately underdamped so it wobbles **3–4 times** after a `hitHeavy`. The
   belly is the character's personality; it should still be moving when the recovery frames end.
2. **Waddle lag.** In `walk` the `hips` already roll ±0.2 rad. Drive `belly` from the *derivative* of
   that roll with a 3-frame delay so the mass swings a beat behind the skeleton. This one change
   turns the existing waddle from "rotating a model" into "carrying weight".
3. **Pom.** Stiffness 14, damping 0.72, gravity-biased. It must overshoot visibly on every impact
   and settle over ~0.6 s.
4. **Scarf tail.** 3-segment chain, stiffness 22, damping 0.80, with a wind-ish idle drift of
   ±3° at 0.4 Hz so it is never dead.
5. **Flipper follow-through.** No bones to add — apply a 2-frame rotational lag and a **12%
   overshoot** on `armL/armR` in the animator's additive layer. Stubby limbs need exaggerated
   overshoot or they read as rigid plastic.

The `tail`, `goggles` and `pack` bones already have follow-through keyed into every clip. Preserve
those amplitudes; they are tuned.

### Posture-driven personality

- **He does not brace.** Where other fighters widen their stance, Fatty Pingo keeps the feet at
  0.230 m apart and absorbs everything with the belly. `belly-bounce` has `armor: 4` — the animation
  must show the armour: the belly compresses 12% and rebounds 6% past neutral before settling.
- **Head rotation budget: ±0.65 rad Z, ±0.30 rad Y, ±0.20 rad X.** Beyond that a neckless head reads
  as detached even with the centre-pivot fix. `hitHeavy` sits right at the ceiling — do not exceed it
  in any new pose.
- **He never looks up at an opponent.** The head is too big to crane. Convey "looking up" by leaning
  the entire `torso` back and letting the `hips` shift 0.04 m forward.
- **Turnarounds are a whole-body pivot**, feet stepping, because the head cannot swivel independently
  past 0.30 rad of yaw.
- **`getup` is the signature.** Rocks on the belly and pops upright — the read is *weeble*, and the
  silhouette (widest at 20% of height, mass below the hips) must promise that before the clip plays.
  If the model does not look like it would self-right when tipped, the proportions are wrong.
- **Idle breathing:** ±1.5% uniform scale on `belly` at 0.25 Hz, plus the existing 2 s idle sway.
  Nothing on this character is ever perfectly still, but nothing is ever fast either.

---

## 9. Parody safety

**Mandatory. Read before you type a single hex value.**

### Do NOT copy

- **No source names, anywhere** — not in geometry, not in a `decalTexture` key, not in a material
  name, not in a code comment, not in the `bio`. That includes the collection's brand name, its
  token ticker, its virtual-world name, its community slogans, and the shortened nickname of its
  characters. Our fighter is **FATTY PINGO** and the word "pudgy" does not appear in this codebase.
- **No wordmark or logo.** No bubble-letter outlined display type. No penguin-head icon-mark. No
  igloo glyph. No "™" badge, no hexagonal NFT-verification badge, no QR code, no "adoption
  certificate" prop.
- **No named trait items reproduced.** The collection's individually-famous accessories (its
  fruit-print formalwear, its specific Viking helmet, its specific fish-shaped headwear, its
  specific fish-head figure colourway, and the specific ultra-rare skin colourways attached to
  named high-value tokens) are the closest thing that collection has to protectable trade dress.
  Beanies, scarves, sunglasses and headphones are **generic categories** and are fine. A specific
  named item in its specific colours is not.
- **No 1:1 proportions.** Do not build 2.29 head-heights, do not build a 1.09 head width:height
  ratio, do not build 0.41 body-to-head width.
- **Not the exact 2D face.** The source's flat art has a signature combination: two closed
  upward-arc "^ ^" eyes **plus** two pink oval blush ovals **plus** a small rounded-diamond beak, all
  on a flat cream field. Do not ship that combination as a default or idle face. Our taunt pose uses
  closed arcs — fine — but **never with blush ovals**, and never as the resting expression.
- **No pink blush ovals at all.** They are the single most reproduced element of the source's face
  and they are not needed for the read.
- **Not the source's colourway.** Its penguins live in periwinkle/soft-blue with pure white bellies,
  yellow-lemon beaks and pastel-pink secondary. Ours is a colder blue-slate, a warm cream, an amber
  beak, and teal knitwear.

### The specific deliberate deviations (these are the legal distance; keep every one)

1. **2.50 head-heights, not 2.29.** ~9% leaner. Reads identically at a glance; measures differently.
2. **Head width:height 1.125, not 1.09.** Our skull is proportionally wider and flatter on the
   crown.
3. **Warm cream `#F4EEE2`, not pure white**, and a **blue-slate `#33456B` hood, not periwinkle**.
   The hue relationship (cool dark / warm light) is inverted from the source's (cool dark / neutral
   light).
4. **Amber `#F2933A` beak and feet, not lemon-yellow.** ~25° hue rotation toward red.
5. **A real beak, not a paint shape.** Ours has a mandible split that opens, a darker nail on the
   forward 22% of the culmen, and two nostril dimples. The source's beak is a closed, featureless
   solid. All three additions are real penguin anatomy and none are the source's.
6. **Visible eye lids and hidden retractable brows.** The source's face has neither. Our lid shells
   and `browL/browR` wedges are our own construction and give a range of expression the source
   character does not have.
7. **A real stubby tail wedge.** The source's figures have essentially no tail. Ours is 0.16 m.
8. **Three webbed toes plus a vestigial hallux, with claw nubs.** The source's feet are two
   featureless rounded tabs.
9. **Knitwear is teal `#2FA79A`, and the character carries a hard-tech backpack and a wrench.** The
   inventor loadout is entirely ours and has no counterpart in the source.
10. **The vinyl-toy manufacturing detail** — parting-line seam, crown vent pinhole, ear dimples — is
    a *category* cue (all vinyl toys have them), not this collection's cue.

**Recognition rests on the archetype** — huge round neckless head, inset cream shield, tiny amber
beak, tiny feet, total absence of hard edges — **which is the visual language of chubby cartoon
penguins generally**, and on none of the source's specific marks. That is the whole strategy.

---

## 10. Reference notes

### What I actually looked at

**Official product photography of the licensed 4.4-inch vinyl figure** (four large product images
pulled from the Tenacious Toys product page, viewed at 1200 × 1200). This is the primary source for
every proportion number in §2–§4. Front-on and 3/4 views of the same figure.
- <https://tenacioustoys.com/products/pudgy-penguins-fish-head-figurine> — product spec: **Size 4.4
  inches, Material: Vinyl**, described as "premium molded figurines". Also names the 5-inch
  figure line.
- Measurements taken off the clean front-on shot (1200 px tall, figure 657 px from crown to sole):
  total **2.29 head-heights**; head **312 px wide × 287 px tall (ratio 1.09)**; body max width
  **402 px = 1.29 head-widths**, occurring at **81% down** from the crown; eye discs **40 px wide =
  0.128 head-width**, centres **129 px apart = 0.41 head-width**, at **39% up the head**; beak
  **45 px = 0.144 head-width** wide, its top edge level with the lower third of the eyes; feet
  **70 px each = 0.22 head-width**, total foot span **0.42 of body width**; flipper protrusion
  **62 px = 0.20 head-width** beyond the body.
- Surfacing observed in those shots: a **broad soft specular smear across the crown** (not a tight
  dot); a **crown vent pinhole**; **two pinhole dimples at the ear position**; thin edges (flipper
  tips, foot edges) visibly brighter than the surrounding form; **no micro-texture whatsoever**; a
  clean hard paint edge between the coloured cap and the cream face; the coloured cap **wrapping the
  head's sides so the cream never reaches the silhouette**.

**Official brand site**, viewed live — hero carousels showing the vinyl keychain figures front-on,
the 2D mascot art on packaging, and the comic-cover character art.
- <https://pudgypenguins.com/> — confirms the flat-art read: hooded cap over crown and back, inset
  white face/belly shield, tiny orange beak, closed-arc eyes with pink blush on the packaging
  mascot, tiny stubby flippers, two small yellow-orange feet. Also the accessory language in-market:
  clip-on earmuff plush, scarves, hoodies.

**Collection composition and trait taxonomy** — for §7's accessory vocabulary and §9's list of
named items to avoid.
- <https://www.coingecko.com/learn/what-are-pudgy-penguins-nfts> — 8,888 tokens, **4–5 traits each
  drawn from ~150 hand-drawn elements**; 97.2% carry five traits.
- <https://www.gate.com/learn/articles/all-you-need-to-know-about-pudgy-penguins/1756> and
  <https://nftevening.com/what-is-pudgy-penguins/> — trait categories are **background, body, face,
  head, skin**; body = shirts/hoodies/kimonos/medals; face = winking/blushing/eyepatches/glasses;
  head = beanies/crowns/Viking helmets. Named rare items (a fruit-print suit, specific rare skins,
  token #6873's black skin) noted specifically **so we avoid them**.
- <https://en.wikipedia.org/wiki/Pudgy_Penguins> — 8,888 NFTs, August 2021, freelance artist,
  Walmart toy line. Confirms the toy line is a real licensed product, which is why the vinyl figure
  is the right primary reference rather than the 2D art alone.
- <https://avark.agency/learn/article/march-of-the-pudgy-penguins/> and the design-history piece via
  <https://www.yahoo.com/entertainment/articles/secret-history-pudgy-penguins-concept-164312952.html>
  — the artist's own framing: line work "bold enough to define their 'huggable' silhouette but smooth
  enough to maintain their friendly demeanor"; **"A sharp, jagged line would completely break the
  character's personality."** That sentence is the justification for the 15 mm minimum fillet rule
  in §6.

### Real penguin anatomy (grounding, and the source of every "deliberate deviation")

- <https://seaworld.org/animals/all-about/penguin/physical-characteristics/> — **fusiform** body,
  proportionally **large head, short neck, elongated torso**; **short, stiff, wedge-shaped tail**;
  wings are **paddle-like flippers with elbow and wrist almost fused** (→ our no-elbow flipper);
  legs **short, strong, positioned far back on the body**, which is *why* the upright stance and the
  waddle exist; feet **fully webbed with visible claws**; **countershaded** dark dorsal / white
  ventral; bill **shorter and stouter in krill-eaters**; ~**100 feathers per square inch**, short,
  broad, closely spaced (→ our `feather` normal map at `scale 6`, not a long-fibre map).
- Adélie measurements (<https://www.theanimalfacts.com/birds/adelie-penguin/>,
  <https://allisonhorst.github.io/palmerpenguins/reference/penguins.html>) — body **46–61 cm**,
  flipper **190–211 mm** (≈ **37% of body length**), bill **33–36 mm** (≈ **6.5% of body length**),
  **blue-black back, completely white chest and belly**. Used to derive: our beak at 5.3% of height
  is near-anatomical, while our flipper at 22.5% is a deliberate 40% shortening — that shortening
  *is* the cartoon.
- <https://fossilpenguins.wordpress.com/2010/08/23/on-the-feet-on-penguins/> and
  <https://www.birdfact.com/articles/do-penguins-have-knees> — **three large webbed toes plus a tiny
  fourth (hallux) at the back**; blunt, heavy, non-retractable claws for grip on ice; the
  **tarsometatarsus is much shorter and wider** than in other birds, which is the anatomical reason
  the leg is invisible and the waddle is the gait. Source of §4's foot spec.
- <https://www.nzbirdsonline.org.nz/species/gentoo-penguin> — **black-tipped orange bill**, bright
  orange feet, **the most prominent tail of any penguin**. Source of the beak-nail detail and the
  decision to give ours a real (if stubby) tail.

### Surfacing references

- <https://google.github.io/filament/Filament.md.html> — clearcoat assumes a **polyurethane coating
  at IOR 1.5 → 4% Fresnel reflectance**; clearcoat roughness uses the same `perceptualRoughness²`
  remap and must be **clamped to ≥ 0.089** for half-float safety; **base colour for dielectrics
  should sit in 50–240 sRGB (tolerant 30–240)**; sheen defaults to 0.04 and for ordinary fabrics you
  keep chromaticity in base colour and apply default/luminance-matched sheen; cloth "subsurface" is
  a **wrapped-diffuse cheat with w = 0.5**, not real SSS. All of §6's numbers derive from this page
  plus the observed figure photography.
- <https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_clearcoat/README.md>
  — clearcoat is a transparent layer adding a **second specular reflection** with its own roughness
  and normal; low coat roughness = polished, which is why our satin toy runs coat roughness at 0.28
  rather than 0.0.

### The two things I would tell you if you only read one line of this section

The figure is **2.3 head-heights with the eyes below the head's midline**, and **the dark hood wraps
the entire silhouette so the cream is always an inset island**. Everything else in this brief is
downstream of those two facts.
