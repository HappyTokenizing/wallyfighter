# PEEPEE — Parody Likeness Brief

**Fighter:** `src/characters/peepee.js` · **Source archetype:** the internet's most famous cartoon
frog (the "feels good man" frog), as laundered into a memecoin mascot.
**Contract authority:** `GRAPHICS_CONTRACT.md` §9. This document is the visual spec; the
CharacterDef API, bone names, hitboxes and move scripts in `CONTRACTS.md §4` are frozen.

**Hard constraints inherited from the existing file — read these before you touch geometry:**

| Constraint | Value | Why it is frozen |
|---|---|---|
| `PeepeeDef.height` | `1.5` | Hurtbox math. Peepee is a **short** fighter — 0.75× the ~2.0 m roster reference. Do not "fix" this; the shortness is a parody asset. |
| Model orientation | faces **+X**, feet at **y = 0** | Every clip and move script assumes it. |
| `HIP` constant | `[0, 0.62, 0]` | Hard-coded as a `pos` track in all 30 clips. The **`hips` bone** may not move. The thigh joints hang 0.060 below it — see the rig-anchor table. |
| Bones that must exist | `hips, torso, head, armL, armR, forearmL, forearmR, legL, legR, shinL, shinR, tie, tongue, eyeL, eyeR` | Clip tracks address these by name. |
| Bind pose | every animated bone starts at rotation `(0,0,0)` | Use the existing `bent()` wrapper to bake base rotations. |
| Costume 1 | swamp tuxedo: monocle, tiny top hat, gold pocket square, gold lapel pin, purple jacket | `buildModel(1)` must keep working. |

### Actual rig anchors in the current file — measured, not guessed

Everything in §2–§4 is expressed in world Y or in bone-local coordinates off these pivots. Read
them out of `src/characters/peepee.js` before you start; do not re-derive them from the tables.

| Bone | Parent | Local offset | **World position** | Notes |
|---|---|---|---|---|
| `hips` | group | — | `(0.000, 0.620, 0)` | **FROZEN.** This is the pelvis bone, *not* the leg joint. |
| `torso` | hips | `(0, 0.04, 0)` | `(0.000, 0.660, 0)` | |
| `head` | torso | `(0.05, 0.52, 0)` | **`(0.050, 1.180, 0)`** | Head-local `x = 0` is world `x = +0.050`. Every head number in §3 is head-local. |
| `legL/R` | hips | `(−0.02, −0.06, ±0.17)` | `(−0.020, 0.560, ±0.170)` | **The thigh joint is at y 0.560, not 0.620.** Getting this wrong makes the leg unreachable — see §4. |
| `armL/R` | torso | `(0.02, 0.40, ±0.32)` | `(0.020, 1.060, ±0.320)` | §4 moves the Z to ±0.240. That is a bone move — read the reach warning. |
| `tie` | torso | `(0.30, 0.44, 0)` | `(0.300, 1.100, 0)` | §7.2 moves it to y 1.040. |
| `eyeL/R` | head | `(0.06, 0.24, ±0.16)` | `(0.110, 1.420, ±0.160)` | §3.2 moves it. **The eye bone origin is the dome centre** — that is what makes rotation swivel the gaze. Keep that property. |
| `tongue` | head | `(0.20, −0.06, 0)` | `(0.250, 1.120, 0)` | Baked tuck via `bent(tongue, 0.85)`. |

Bone *positions* may move (no clip writes a `pos` track for anything except `hips`); bone *names*,
hierarchy and the `hips` position track may not. Moving a pivot that a hitbox reaches from obliges
you to re-verify that move — see the reach warning in §4.

**Two errors in the current build you are here to fix, stated plainly:**
1. `C.lip = 0x2c5a2a` — **the lips are currently dark green.** The single largest likeness failure
   in the model. The source archetype's lips are its second-strongest cue and they are brown/rose.
   Replace with `lipRose #B2695F` (§5).
2. Costume 0 currently dresses him in a **black jacket** (`C.jacket 0x1b1d24`), not a shirt. §7.1
   replaces that jacket entirely with the blue button shirt. Costume 1 keeps the purple jacket, now
   layered *over* the shirt rather than instead of it.

**Dismemberment coupling (`src/combat/Gore.js`) — verified against the file:**
- `ACCESSORY_BONES = ['glasses','goggles','lens','hat','mug','phones','tie','sash','pack','pouch','monocle','coat','robe']`
  and `_firstCandidate()` returns **the first name in that array that exists on the fighter.**
- `tie` is in that list — it can be torn off. Everything tie-related must live *under* `bones.tie`
  and **nothing else may be parented to it**.
- ⚠️ **`'hat'` is ahead of `'tie'` in the array.** If you promote costume 1's top hat to a bone
  named `hat`, the first accessory dismemberment tears **the hat, not the tie** — which silently
  replaces the established gag. Either keep the hat as a plain mesh under `head` (recommended), or
  name its bone something not in the array. Do not name it `hat` by accident.
- `'monocle'` **is** in the array, *after* `'tie'`. Today the monocle is a mesh under the eye bone,
  so it is not detachable; promoting it to a `monocle` bone makes it the *second* accessory to go,
  after the tie. Both options are fine — pick one deliberately.
- `tongue` is in `SECONDARY_BONES = ['earL','earR','tail','trunk','tongue']` — same single-subtree rule.
- `forearmL` / `forearmR` are in `FOREARM_BONES` — the shirt cuff must be parented to `armL/armR`
  (upper arm), never to the forearm, or the sleeve leaves with the hand.
- Never parent anything to `hips`, `torso`, `head`, `legL/R`, `shinL/R` that you would not want
  permanently attached — those never detach.

---

## 1. The 2-second test

Fill the model black, shrink it to 128 px, and the read must be: **a body 5.00 head-units tall whose
widest point is its belly (1.07 × the shoulder span), no neck at all, topped by a head 1.07 × wider
than its own shoulders — and two spherical domes each 0.379 × head width, whose crowns are the
highest points of the entire character, 0.063 m above the top of the skull.** That is the whole gag.
Nobody recognises this frog by its body; they recognise it by the fact that the eyes are not *in*
the head, they are *on* the head — two spheres set on a genuinely flat cranial plate, with 0.055 m
of daylight between them — above a mouth 0.806 × head width curving down beneath them.

In colour the confirmation lands in the next half-second, and it is four values in this order:

| Rank | Element | Hex | L\* | Why it lands |
|---|---|---|---|---|
| 1 | sclera vs pupil | `#ECEEE0` / `#1E2026` | 93 / 12 | The maximum-contrast pair on the model, sitting at the top of the silhouette |
| 2 | skin | `#6DA843` | 63 | Olive, not emerald — reads as an animal, not a toy |
| 3 | shirt | `#4E74B8` | 49 | 14 L\* below the skin, so the torso reads as a dark block under a lighter head |
| 4 | lips + tie | `#B2695F` / `#E8B93A` | 53 / 78 | Rose lips 0.806 × head width; the tie is the only high-chroma element on the character |

Green head, blue shirt, top-mounted eyes, wide sad mouth. If a viewer has to look at the hands,
feet, or tie to get it, the head is wrong — go back to §3.

---

## 2. Silhouette specification

### Unit definition
Define **HU** (head unit) = chin to the flat cranial plane, **excluding** the eye domes = **0.30 m**.
Total standing height = **1.50 m = 5.00 HU exactly**. Measured *including* the eye domes, the head
reads as 0.41 m, i.e. the figure is **3.66 "cartoon heads"** tall — deliberately childlike/gormless.
For roster comparison: Peepee's head unit is 0.20 of his own height; WALLY's should be ~0.135 of
his. Peepee is the big-headed one.

### Vertical stack (world Y, standing idle) — build to these numbers
| Landmark | Y (m) | Fraction of 1.5 m | HU |
|---|---|---|---|
| ground / sole | 0.000 | 0.00 | 0.00 |
| top of foot pad | 0.060 | 0.04 | 0.20 |
| ankle | 0.090 | 0.06 | 0.30 |
| knee (splayed, outboard at \|z\| 0.300) | 0.332 | 0.22 | 1.11 |
| **thigh joint (`legL/R` pivot)** | **0.560** | 0.37 | 1.87 |
| **`hips` bone — FROZEN** | **0.620** | 0.41 | 2.07 |
| `torso` bone | 0.660 | 0.44 | 2.20 |
| widest point of belly | 0.780 | 0.52 | 2.60 |
| shoulder pivot | 1.060 | 0.71 | 3.53 |
| chin (lowest point of jaw) | 1.120 | 0.75 | 3.73 |
| head bone origin (keep) | 1.180 | 0.79 | 3.93 |
| eye equator | 1.365 | 0.91 | 4.55 |
| flat cranial plate (top of skull) | 1.420 | 0.95 | 4.73 |
| **crown of the eye domes = total model height** | **1.4825** | **0.99** | **4.94** |

The single most important line in that table: **the top of the character is the top of its eyes,
not the top of its skull.** The skull is 0.0625 m (21 % of a head unit) *below* the eye crowns.

Note the two hip numbers. `hips` (0.620) is the pelvis bone and is frozen; the **thigh joints hang
0.060 below it at y 0.560, ±0.170**. All leg lengths in §4 are measured from 0.560. Measuring from
0.620 yields a leg that cannot reach the floor — that is exactly the bug this brief previously had.

### Horizontal masses
| Measure | Value | Ratio |
|---|---|---|
| Head width (widest, at the cheeks) | 0.620 | 2.07 : 1 against skull height — flat and broad |
| Cranial **plate** width (the flat top) | 0.460 | Derived: 0.620 − 2 × the 0.080 crown bevel. Eyes overhang it. |
| Shoulder span (deltoid to deltoid) | 0.580 | **0.94 × head width — the head is wider than the shoulders** |
| Belly at its widest | 0.620 | 1.07 × shoulder span — inverted taper, pear body |
| Chest depth (front to back) | 0.420 | |
| Skull-box depth (face plane to occiput) | 0.440 | 0.71 × head width. Head-local +0.200 to −0.240. |
| Overall head depth (eye-dome front to occiput) | 0.558 | 0.90 × head width. The eyes are the frontmost thing on the character. |
| Foot length (total, heel to toe tip) | 0.300 | 1.00 HU, 0.20 of body height. 0.230 forward of the ankle, 0.070 behind it. |
| Heel-centre stance width | 0.400 | 1.33 HU, 0.69 × shoulder span. Ankles at \|z\| 0.200. |

### Where the mass sits
Two mass centres, stacked, with almost nothing between them: **the head-and-eye cluster** (chin
1.120 to crown 1.4825 = 0.3625 = the top 24 %
of the height, and the widest single element) and **the belly** (centred at y ≈ 0.78, the widest
body element). The waist and shoulders are the *narrow* part. Limbs are thin, short sticks that
carry almost no silhouette weight — they are the connective tissue between the two blobs, and they
must never be thick enough to fuse the two blobs into one bean shape.

### Negative space (this is what actually defines the read at 128 px)
1. **The V-notch between the eye domes.** Measured in front elevation: **0.055 m of daylight at the
   eye equator** (that is the dome-to-dome gap), and the notch floor is the flat cranial plate, so
   it cuts **0.0625 m** down from the eye crowns into the skull outline. If you close this notch the
   character dies — it becomes a generic round-headed cartoon animal. Protect it in every pose,
   including KO, and including under costume 1's hat (§7.4).
2. **The under-eye shelf.** A horizontal band of skull between the bottom of the eye domes
   (head-local y +0.0675) and the top of the mouth line (head-local y +0.070 at the centre) —
   **0.0475 m tall measured on the cheek at \|z\| 0.200**, where the mouth has dropped away from the
   eye. Keeps the eyes and the mouth from merging into one blob.
3. **The mouth corner pockets.** The down-turned mouth ends at \|z\| 0.250, i.e. **0.060 m short of
   the cheek edge** (\|z\| 0.310) on each side, leaving a wedge of skull outboard of the corner. This
   is what makes the mouth read as *curving down* rather than as a straight slot across the head.
4. **The shirt-hem gap.** The shirt does not reach the hip. There is a 0.06 m band of bare green
   belly between the shirt hem and the trouserless hip. Under-lit, this is a bright cream sliver
   that separates the dark shirt mass from the legs.
5. **The splayed-thigh triangle.** Frog knees sit *outboard* of the hips, so the gap between the
   legs is a wide inverted-V, 0.24 m across at the knee, not a narrow slot.
6. **The tie standing off the belly.** The tie hangs from a 0.18 rad forward drape and must have
   0.02–0.04 m of air behind its lower half.

### 128 px readability checklist
At 128 px tall framing, the figure occupies ~85 px, i.e. **56.7 px per metre**. Therefore: HU ≈ 17 px,
each eye dome ≈ 13.3 px, mouth ≈ 28 px wide, iris ≈ 3.5 px, pupil ≈ 2.2 px, the V-notch ≈ 3.1 px of
daylight, the under-eye shelf ≈ 2.7 px. Consequences you must design for:
- **The pupil must be a solid dark blob**, not an outlined iris ring — at 2.2 px an annulus turns to
  grey mush. Keep the iris a thin gold rim around a dominant dark pupil.
- The V-notch and the under-eye shelf are both ~3 px. They are the *thinnest* things that still have
  to survive. Everything below 2 px is 1 m detail, not silhouette detail.
- The tympanum, nares, glandular fold, buttons and stitching are all sub-2 px. They are 1 m detail,
  not silhouette detail. Do not let them steal geometry budget from the eye/mouth read.
- Everything on the checklist above must survive at 85 px total height. Test it. Render, downscale
  to 128, threshold to black, look at it.

---

## 3. Head construction — the whole job

Head-local coordinates below use the **existing head bone origin, which is at world
`(+0.050, 1.180, 0)`** — note the X offset, it is easy to drop and it shifts the whole face 50 mm.
`+X` is forward (the face), `+Z` is the character's left. Values in metres. "Chin" = the lowest jaw
point at world y = 1.120, i.e. head-local y = −0.060.

Quick self-check before you build anything: head-local `x` and `y` must satisfy
`world = (0.050 + x, 1.180 + y, z)`. The face plane at head-local +0.200 is world +0.250; the
cranial plate at head-local +0.240 is world 1.420; the eye crowns at head-local +0.3025 are world
1.4825. If your numbers do not land on those three, stop and re-derive.

### 3.1 The cranial mass

**One rounded box. No snout block, no muzzle block.** The source archetype is anthropoid-faced, not
snouted (§10 ref 3); a second forward block is the fastest way to turn this into a generic cartoon
animal. Sphere-based heads are why the current model reads generic — a sphere has no flat plate for
the eyes and no cheek slab for the mouth to wrap.

```
skull box:  depth(X) 0.440  ·  height(Y) 0.300  ·  width(Z) 0.620
head-local centre: (−0.020, +0.090, 0)
```
Which fixes every face landmark, because they are all derived from the box faces:

| Box feature | Head-local | World | Cross-check |
|---|---|---|---|
| front face (the face plane) | x = **+0.200** | x = +0.250 | eyes and mouth both live on this plane |
| occiput (rear face) | x = **−0.240** | x = −0.190 | |
| top face (the cranial plate) | y = **+0.240** | y = **1.420** | §2 stack |
| bottom face (the jawline) | y = **−0.060** | y = **1.120** | = chin height, §2 stack |
| cheek faces | \|z\| = **0.310** | | head width 0.620 ✓ |

Skull height 0.300 = 1.00 HU ✓. W : H = 0.620 : 0.300 = **2.07 : 1** ✓.

Bevels — deliberately non-uniform, this is where the character lives:
- **Top edges (crown roll-off): 0.080** radius. Very soft, almost hemispherical roll. This radius is
  load-bearing: it is what *derives* the flat cranial plate as 0.620 − 2(0.080) = **0.460 wide** and
  0.440 − 2(0.080) = **0.280 deep**, which is the number §2 quotes. Change the bevel and you must
  change the plate width with it.
- **Vertical corner edges (front face → cheek): 0.045.** Flat front face therefore runs to \|z\| 0.265.
- **Jawline (the bottom edge, front to occiput): 0.020.** Crisp. This is the *one hard edge on the
  face* and it is what gives the head a "plate" quality rather than a ball.
- **Occiput (rear): 0.055**, then blended straight into the shoulders — there is no neck.

**Skull plane angles** (measured off horizontal / vertical as noted):
- **Cranial plate:** the top face is genuinely **flat, 0° from horizontal**, across the full
  0.460 × 0.280 plate. Only outboard of that does the 0.080 bevel roll it off. This flat plate is
  what the eye domes break through and it is non-negotiable — curvature here is the single most
  common way to lose the likeness. It is also the only part of the skull visible in the V-notch.
- **Front face crown:** the face plane is **not dead flat in plan** — crown it on a **1.75 m radius**
  about the centreline, so the surface sits at x = +0.200 at z = 0 and has fallen back to
  **x = +0.182 at \|z\| = 0.250** (sagitta 0.018). That 0.018 is what lets the mouth corners *wrap*
  instead of stopping dead on a flat wall. Do not exceed 0.030 of sagitta or the face domes out and
  the eyes lose their plinth.
- **Cheek planes:** the side faces are near-vertical (**4° outward flare** top to bottom) from the
  eye line down to the jaw, giving a slab-sided head.
- **Sub-mouth taper:** below the mouth line (y < +0.030) the box narrows in plan from 0.620 to
  **0.260 at the chin** (§3.4) and the front face recedes — see the jaw plane angle in §3.4.
- **Jaw underplane:** rises **9°** from the chin back toward the throat.
- **Occipital plane:** the back of the skull falls away at **22° from vertical** into the shoulders.

**Muzzle projection: there is none, and that is the specification.** The frontmost point of the
entire head is **the eye domes**, at head-local x = +0.3175. The frontmost point of the mouth is the
lower lip at x = **+0.234**. The eyes therefore overhang the mouth by **0.0835 m = 0.19 × skull
depth**, and the chin sits behind the lower lip (§3.4).

> **Hard ceiling:** no part of the mouth, lip, or jaw may reach further forward than **x = +0.260**,
> i.e. the eye domes must lead the mouth by at least **0.055**. The moment the mouth leads the eyes
> in profile you have built a generic cartoon animal snout and the parody is gone. This is the
> single cheapest thing to get wrong and the easiest to check: render a pure side profile and look
> at which feature is furthest right.

Overall head depth including the eye bulge = 0.3175 + 0.240 = **0.558 = 0.90 × head width.**
Skull-box depth alone = 0.440 = 0.71 × head width.

### 3.2 The eyes — the load-bearing feature

```
eye dome:      sphere r = 0.1175, scale (1.00, 1.00, 0.96)
centre:        head-local ( +0.200 , +0.185 (= chin + 0.245) , ±0.145 )
               → world ( +0.250 , 1.365 , ±0.145 )
centre-to-centre separation: 0.290
```

**Read this before you place anything: the dome centre sits ON the face plane (x = +0.200), not
inside the skull.** Each eye is therefore a hemisphere bulging forward out of the face, whose top
also rises through the cranial plate. That one placement decision buys both signature reads at once:

- **Front elevation:** the full great circle is visible — a clean **0.235 m circle**, not a
  truncated cap. Bury the dome centre even 0.05 behind the face and the visible circle collapses to
  0.151 and the character dies.
- **Side elevation:** the dome bulges **0.1175 forward** of the face and its crown clears the skull
  top by **0.0625**, so the eye is the highest *and* frontmost feature. That is the silhouette.

Derived ratios — quote these back to yourself while modelling:
| Ratio | Value |
|---|---|
| eye **diameter ÷ head width** | 0.235 / 0.620 = **0.379** |
| combined eye span (outer edge to outer edge) ÷ head width | 0.525 / 0.620 = **0.847** |
| inner gap between domes | 0.290 − 0.235 = 0.055 = **0.089 × head width** |
| eye centre height above the chin ÷ skull height | 0.245 / 0.300 = **0.817** — the eyes sit in the top fifth |
| dome crown above the cranial plate | 0.240 → 0.3025 = 0.0625 = **0.208 × skull height** |
| dome outer edge (\|z\| 0.2625) past the cranial plate edge (\|z\| 0.230) | **0.0325 per side** |
| dome outer edge vs the cheek face (\|z\| 0.310) | inboard by 0.0475 — the eyes never break the head's side outline |

**The collar fillet — sweep it along the real intersection curve. Do not use a flat torus.**
The dome does not meet one surface. Sitting on the front-top corner of the skull, it crosses three:
the crowned face plane (below y = +0.240), the 0.080 front-top fillet, and — on its rear arc — the
cranial plate itself (the plate's front edge is at x = +0.120, and the dome's section at the plate
height has radius `sqrt(0.1175² − 0.055²) = 0.1039`, spanning x 0.096 → 0.304). The intersection is
a **closed 3D curve, not a planar circle**, and it lives roughly in y 0.068 → 0.240.

```
sample the dome ∩ skull curve at 48 points
collar = TubeGeometry(new THREE.CatmullRomCurve3(pts, /* closed */ true), 48, 0.020, 10, true)
```
Shade it as skin. Free arc above the collar ≈ **124°** of the dome — that is the part standing clear
of the skull, and it is the part the rim light must catch (§5).

A planar `TorusGeometry` laid across this curve floats off the surface by up to **0.030** on the
upper arc — a ring of skin hanging in mid-air above the head. That is precisely the
ugly-from-primitives failure the contract bans, and it is visible at 512 px.

> **General rule, so you can re-derive any collar if you change a number:** for a sphere of radius
> `r` whose centre lies a distance `d` from a locally planar surface, the intersection circle has
> radius `sqrt(r² − d²)` and the free arc begins at `acos(d / r)`. Remember the face plane is
> crowned on a 1.75 m radius (§3.1), so at \|z\| 0.145 it sits 0.006 behind the centreline —
> sample the actual surface, not the idealised plane, or a 0.006 seam opens outboard.

> **All shell radii below are per-eye, derived from that eye's dome radius — do not hard-code them
> and do not mirror the left eye onto the right.** §3.2's asymmetry makes the right dome 0.1255.
> So: upper lid `r_dome + 0.007` (L 0.1245 / **R 0.1325**), lower lid same clearance, nictitating
> `r_dome + 0.003` (L 0.1205 / **R 0.1285**), cornea `r_dome + 0.001`. Hard-coding 0.1245 puts the
> right eye's lid *inside* its own sclera and it will z-fight on screen.
> Also note the dome is scaled (1.00, 1.00, 0.96), so every shell must carry the same Z scale or the
> clearance closes to 0.002 at the outboard edge.

**Upper lid — heavy and droopy.** A spherical shell at r = `r_dome + 0.007` subtending
**0° to 72° from the dome's top pole**, so it occludes the **top 40 %** of the visible eye height.
Orient it:
- pitched **forward 12°** (the lid leans out over the pupil, casting a bar of shadow)
- **rolled so the lateral edge sits 0.016 lower than the medial edge → an 8° outward droop.**
  Lateral-low = tired/sad. This one number is the difference between "sleepy meme frog" and
  "startled cartoon animal."
- lid rim thickness **0.012** with a **0.004 bevel** on the leading edge. That bevel is the brow —
  it catches the key light as a bright arc and is the only "eyebrow" this character has.

**Lower lid:** a thin 0.006 shell subtending 0°–14° from the bottom pole. Barely there, but it
stops the sclera from meeting the skin at a hard tangent line.

**Nictitating membrane** (real amphibian anatomy, and a free AAA detail): a third shell at
r = `r_dome + 0.003`, `transmission ≈ 0.70`, roughness 0.06, milky tint `#DDE4D6` at
`attenuationDistance 0.02`. Animates **bottom → top**,
2 frames, distinct from the lid blink. Use it on hit reactions and the taunt.

**Iris and pupil.**
```
sclera:   the dome itself,  #ECEEE0
iris:     annulus, outer Ø 0.062 (= 0.264 × eye Ø), inner Ø 0.038,  #C89230 gold-amber
pupil:    HORIZONTAL oval, 0.038 wide × 0.026 tall (= 0.162 × eye Ø wide),  #1E2026
```
Real frogs have gold/brown irises and **horizontal almond pupils** — this gives us the "tiny dot"
meme read *and* an anatomical alibi. Pupil placement: forward on the dome (world +X) and set
**0.014 below the dome equator** so the gaze reads as directed slightly downward. Add a single
specular highlight ellipse at the 10-o'clock position, 0.016 × 0.011, on the left eye and the
11-o'clock on the right — the tiny asymmetry is intentional (see §10, drawingforall).

**Deliberate asymmetry — this is the detail that carries the reference, so make it measurable.**
The source's charm is the wonky hand-drawn quality; a perfectly mirrored face reads as corporate
mascot, and a mascot is not a parody of *this* archetype. Four numbers, all on the character's
**right** side:

| Quantity | Left | Right | Delta |
|---|---|---|---|
| dome radius | 0.1175 | **0.1255** | +6.8 % |
| dome centre Y | +0.185 | **+0.178** | 0.007 lower |
| pupil yaw off straight-ahead | +2° inboard | **−4° outboard** | 6° of divergent gaze |
| resting `lidCover` (§8) | pose value | pose value **+0.05** | heavier right lid |

**Acceptance test:** at **512 px** the two eyes must be visibly non-identical to someone who is not
looking for it. At 128 px it must *not* read as a defect — check both. If you can only see it in a
wireframe, you have under-committed; if it reads as damage, you have over-committed. The right dome
growing means its collar curve and its `sqrt(r² − d²)` intersection must be recomputed, not mirrored.

### 3.3 The mouth — width, curve, and lips

Build as a swept tube along a Catmull-Rom curve, **9 control points**, not a box.

```
total mouth width (corner to corner):   0.500  =  0.806 × head width
centre point:   head-local ( +0.200, +0.070 (= chin+0.130) , 0      )
corner points:  head-local ( +0.182, +0.030 (= chin+0.090) , ±0.250 )
```
Both points sit **on the crowned face plane** of §3.1 — that is why the corner X is +0.182 and not
+0.200: the face has fallen back 0.018 by \|z\| 0.250. Read the corner X off the crown radius, do not
hand-pick it, or the tube will float off the face.

- **Corner drop = 0.040 below the centre**, over a 0.250 half-width → the corners sit **9.1° down**
  from the centre. Down-turned. Every rest pose holds this.
- The corners end at \|z\| 0.250, **0.060 inboard of the cheek edge** and **0.015 inboard of where
  the 0.045 vertical corner bevel begins** (\|z\| 0.265) — so the mouth dies into flat face, never
  onto the bevel. Landing the corner on the bevel produces a visible kink.
- The mouth line stays **0.0475 below the bottom of the eye domes** at \|z\| 0.200 (§2 negative
  space #2) and **0.084 behind them in X**. It never leads the eyes in profile (§3.1 hard ceiling).
- The curve is **not** a simple arc: it runs nearly flat across the middle 0.20 m, then accelerates
  downward in the outer 0.15 m each side. That "flat then droop" profile is the signature.

**Lips.** Thick, rolled, and the character's second-strongest cue after the eyes.
- upper lip tube radius **0.016**
- lower lip tube radius **0.020** (**1.25× thicker** — the pout lives in the lower lip)
- both lips **project 0.014 proud of the surrounding skin**, so they cast their own shadow
- colour `#B2695F` dusty brick-rose with a lighter roll `#CE8C80` on the top 30° of each tube
- the lips extend **0.030 past each mouth corner** and taper to nothing — a little flick that
  reinforces the down-turn

**Mouth slot.** Cut a real recess **0.012 deep** between the lips so there is a genuine AO line and
the mouth doesn't read as painted-on. Behind it, an **oral cavity shell** (`#3A1E22`, roughness
0.35, wet) so an open mouth is not hollow. The `tongue` bone lives in here.

### 3.4 Chin, jaw, throat

**Chin — small and receding, and "receding" means it sits BEHIND the lower lip.** The previous
version of this brief said the chin projects forward of the lip; that is a contradiction and it
would have built the wrong character. The chin is a corner, not a mass:

```
lower-lip frontmost point:  head-local ( +0.234, +0.050 )
chin point (front-bottom):  head-local ( +0.186, −0.060 )   → world ( +0.236, 1.120 )
chin width:                 0.260  = 0.42 × head width
```
- Jaw plane runs lip → chin over a 0.110 drop and a **0.048 recession**, i.e. it slopes
  **23.6° from vertical**. Round it to 24°.
- **The chin front is 0.048 behind the lower-lip front.** Express it as a ratio if you rescale:
  chin recession ÷ skull depth = 0.048 / 0.440 = **0.11**.
- Any chin that reaches forward of the lower lip destroys the likeness on the spot. Check it in the
  same side-profile render you use for the §3.1 ceiling.

**Throat sac.** Single median sac (§10 ref 8), ellipsoid, blended into the jaw underplane with a
0.040 fillet.
```
rest:      r 0.130, scale (0.90, 0.55, 1.00)  → half-extents (0.117, 0.0715, 0.130)
centre:    head-local ( +0.150, −0.100, 0 )   → world ( +0.200, 1.080, 0 )
```
At rest it is a **slack pad that fills the 0.060 chin-to-shoulder gap** and merges into the chest —
it must never read as a separate ball sitting under the jaw. 3 shallow slack folds running fore-aft
when deflated; these flatten as it inflates (drive `normalScale` 1.4 → 0.4 with inflation).

- **Inflation is 1.40× linear (≈ 2.7× volume), not 2.0× linear.** At 2.0× the sac's lower half ends
  up inside the ribcage and its front punches through the shirt collar. Scale about the **upper
  attachment at head-local (+0.150, −0.030, 0)** so the growth goes forward-and-down, not spherically.
- **Clearance rule:** at every frame of the taunt the inflated surface must sit **≥ 0.020 proud of
  the shirt collar and the chest front**. Step the taunt clip and check — this is the one piece of
  secondary motion that can penetrate wardrobe.
- No neck. The occiput meets the shoulder mass directly, with only **0.060 m** between the chin
  (world 1.120) and the shoulder line (world 1.060).

### 3.5 Amphibian head detail (real anatomy — this is the surfacing alibi)
- **Tympanum** (external eardrum — "the circular patch of skin directly behind the eye"):
  a disc r = **0.055** (= 0.47 × eye diameter), inset **0.006**, with a raised rim torus
  (r 0.058, tube 0.008). Centre: **0.150 behind the eye centre in −X, 0.060 below it in Y** →
  head-local **(+0.050, +0.125, ±0.305)**, lying on the cheek face (\|z\| 0.310 at the jaw, flared 4°
  so it is ≈ 0.305 at this height). Clearances to verify: 0.050 clear of the 0.045 vertical corner
  bevel that starts at x = +0.155, 0.060 clear of the cranial plate, 0.130 clear of the jawline.
  Give it its own material: smoother (roughness 0.25), a half-step darker
  and warmer than the surrounding skin, with faint concentric rings in the normal map.
  *Anatomically the male bullfrog tympanum is larger than the eye — ours can't be, because our eyes
  are cartoon-huge; 0.47× is the compromise that still reads "big drum."*
- **Glandular fold:** the bullfrog has **no dorsolateral ridge**, but it does have a short glandular
  fold that starts at the eye, curves over the top of the tympanum, and ends in front of the
  foreleg. Build it as a swept bead, tube r = **0.007**, both sides. Free silhouette interest on the
  side profile and a genuine "someone looked at a frog" detail.
- **External nares:** two bumps, r **0.009**, with a 0.005 dark inset. Real frogs carry them at the
  snout tip; **we have no snout**, so they go at the equivalent place on our geometry — the face
  plane, high and close to the centreline, in the gap between the two eye domes:
  head-local **(+0.200, +0.115, ±0.035)** = chin + 0.175. Verify the clearances, they are tight:
  the dome cross-section at that height has radius 0.0944 and the nare sits 0.110 from the eye
  centre, so it clears the dome by 0.016; and it clears the top of the upper lip tube (y +0.086) by
  0.029. Placing them any further forward or higher buries them inside an eye.
- **No teeth visible in any rest pose.** (Frogs do have maxillary and vomerine teeth; the moment you
  show them the character stops being pathetic and starts being a monster.)

### 3.6 Head geometry budget
~9,000 triangles total: cranial mass 2.2k, eye domes + collars 2.0k, lids + nictitating 1.5k,
lips + oral cavity 1.8k, tympanum/fold/nares/throat 1.5k. Nothing on this head may be a raw
`BoxGeometry`.

---

## 4. Body & limb proportions

### Posture — the spine is the personality
- **Hips tilted 8° posterior** (tucked pelvis, the "standing badly" tell).
- **Thoracic curve 14° forward** — the upper back rounds over.
- **Shoulders rolled forward 12°** and sloping **down 26°** from the base of the skull.
- **Head carried 0.070 m forward of the shoulder line** and **tipped down 6°**. Forward head carriage
  over rolled shoulders is what makes a silhouette read as defeated. It is doing more work than any
  facial expression.
- Weight sits **55 / 45 on the back foot** in idle.

### Torso
- Shoulder span 0.58, belly 0.62 → **inverted taper, ratio 0.94 : 1.00.** The body gets *wider*
  going down. Never build a V-taper on this character.
- Chest depth 0.42 at the shoulder, 0.48 at the belly.
- Cross-section: a superellipse (n ≈ 2.6), not a circle — flatter at the front, rounder at the back.
- Bevel everything at 0.030–0.040. No hard edges anywhere on the torso.

### Arms
| Segment | Length | Notes |
|---|---|---|
| upper arm (`armL/R`) | 0.210 | Ø 0.100 at the deltoid, 0.082 at the elbow |
| forearm (`forearmL/R`) | 0.190 | Ø 0.078 → 0.066 |
| hand + fingers | 0.100 | |
| **total shoulder → fingertip** | **0.500** | = 0.33 of body height = 1.67 HU |

**Shoulder pivot moves too, and this is the part that is easy to miss.** A 0.580 deltoid-to-deltoid
span with a 0.100 Ø deltoid means the `armL/R` pivot sits at **\|z\| = 0.240**. The current file has
it at **\|z\| = 0.320**. So each shoulder comes *inboard by 0.080* at the same time as each arm gets
*longer by 0.080*. That inboard move is what makes the head (0.620) wider than the shoulders (0.580)
— today the shoulders are the wider pair, and the parody read is inverted.

Hanging at 14° abduction from a shoulder at (y 1.060, \|z\| 0.240), fingertips land at
**y ≈ 0.575, \|z\| ≈ 0.361** — just above mid-thigh. Arms are conspicuously short and thin; they
carry no silhouette weight.

**The forearms touch the belly, and that is correct.** With a 0.620 belly and a 0.580 shoulder span
the forearm overlaps the flank by ≈ 0.034 at the widest point (y 0.780). Do not "fix" this by
abducting the arms until they float clear — on a pear body a free-hanging arm reads as an unfinished
T-pose. Model it as **contact**: a 0.015-radius fillet where the forearm meets the belly, a shallow
longitudinal groove in the flank for it to sit in, and no visible intersection line. Contract §4
bans interpenetrating primitive *seams*, not contact.

> ⚠️ **Reach check — two changes, not one.** The current build's arm totals ≈ 0.42 m (upper 0.20 +
> forearm 0.20 + hand ≈ 0.02 of pad). This spec is **+0.08 m long and −0.08 m inboard**, so the
> resting fingertip moves in *both* axes and the reach delta is not simply +0.08. Per
> `GRAPHICS_CONTRACT.md §9`, if a proportion change moves a hand you must update the move script
> reach constants to match. Audit the `forward` values on `tongue-jab` (1.3), `tie-whip` (1.0),
> `eye-poke-feint` (1.0) and `tongue-grab` (1.3) against the new fingertip and tongue-tip positions,
> and re-check `tie-whip` against the tie bone's new height (§7.2 moves it from y 1.100 to 1.040).
> Verify with the existing harness. Do not ship without this check.

Also note the current hands have **3 finger pads**, not 4 — see below.

### Hands — four fingers, this matters
Real frog **forelimbs have 4 digits**; hindlimbs have 5. Build the hands with **exactly four
fingers and no thumb** — it is a genuine anatomical read and it distinguishes us from the source's
generic 4-finger cartoon hand for a *reason*.
- Palm pad: rounded slab 0.075 × 0.026 × 0.070, bevel 0.012.
- Fingers: 3 segments, total length 0.062, shaft Ø 0.020, splayed at −22°, −7°, +7°, +22°.
- **Bulbous adhesive toe/finger discs** at each tip: Ø 0.030 = **1.5 × the shaft** diameter,
  flattened to 0.60 in the palm-normal axis. These are the single best "amphibian" cue on the hand.
- Shallow **interdigital webbing** between fingers 2-3-4 only, reaching **35 %** of finger length.
  (Forelimb webbing is a stylisation, not anatomy — keep it shallow so it reads as a hint.)
- Palm-side skin is ventral cream; dorsal side is mottled green.

### Legs and feet
The whole leg is solved from three fixed points. Solve it in this order or you will build a leg
that cannot reach the floor — which is exactly what the previous numbers in this brief did.

```
thigh joint  L = ( y 0.560 , |z| 0.170 )    // the legL/R pivot — NOT the hips bone at 0.620
knee         K = ( y 0.332 , |z| 0.300 )    // outboard: 0.130 lateral of the thigh joint
ankle        A = ( y 0.090 , |z| 0.200 )    // heel centres 0.400 apart
```

| Segment | Length | Derivation | Notes |
|---|---|---|---|
| thigh (`legL/R`) | **0.262** | `hypot(0.560−0.332, 0.130)` | Haunch mass: ellipsoid 0.150 × 0.170 × 0.140 at the joint |
| shin (`shinL/R`) | **0.262** | `hypot(0.332−0.090, 0.100)` | Tapers Ø 0.100 → 0.072 at the ankle |
| foot | 0.300 total | 0.230 forward of the ankle, 0.070 behind | 1.00 HU |

The two segments come out equal at 0.262 — that is not a coincidence, it is the knee height that
makes them equal, and it is why K sits at y 0.332. Straight-leg reach from L to A is
`hypot(0.470, 0.030) = 0.471` against a 0.524 two-segment chain, so the knee carries a permanent
**bend of 26°** at idle. Good: a frog should never stand with a locked leg.

- **Frog haunch:** the knee sits **outboard and high** — 0.130 lateral of the thigh joint and 0.228
  below it, so the thigh runs down-and-out at `atan(0.130/0.228)` = **29.7° from vertical**. Round
  to 30°. In crouch the knee must rise *above* the `hips` line (y 0.620) and break the outer
  silhouette. That knee-above-hip crouch is a frog cue worth as much as the feet.
- **Feet:** 5 toes (real hindlimb count), **webbing to 85 % of toe length**, foot pad 0.030 thick,
  toe splay ±30°, foot toed out **22°**. Total foot width at the toes 0.200. The current build has
  **3 toes** — that is one of the fixes.
- **Stance:** heel centres **0.400 apart** (0.69 × shoulder span). The ankles sit 0.030 *outboard*
  of the thigh joints, so the overall leg line splays out at 3.7° (`atan(0.030/0.470)`).

---

## 5. Colour script

### Core palette — 10 values
| # | Name | Hex | Approx L\* | Use |
|---|---|---|---|---|
| 1 | `frogDorsal` | `#6DA843` | 63 | Base skin — back, head top, outer limbs. The character's mid-tone. |
| 2 | `frogDorsalLit` | `#8FC65A` | 74 | Albedo variation on up-facing planes: cranial plate, shoulders, thigh tops. Never a flat wash — blend at 25–40 % via the height map. |
| 3 | `frogMottle` | `#456F2C` | 42 | Irregular dorsal spots (real bullfrog dorsum is "greenish with dark spots"). Blob scale 30–70 mm, 18 % coverage, edges soft. |
| 4 | `frogCrevice` | `#27401D` | 24 | Deepest skin tint: mouth slot, armpits, digit splits, under the jaw, behind the glandular fold. AO tint, not a paint colour. |
| 5 | `frogVentral` | `#DCE3AE` | 88 | Belly, throat, chin, palms, inner thighs. **Second-lightest value on the model.** ("Pale ventrally and greenish with dark spots dorsally.") |
| 6 | `lipRose` | `#B2695F` | 53 | The lip tubes. Dusty brick-rose — desaturated, never candy pink. |
| 7 | `sclera` | `#ECEEE0` | 93 | **Lightest value on the model.** sRGB (236,238,224) — under the contract's 240 ceiling. The previous `#F2F4E6` was (242,244,230) and broke it. Off-white, never 255. |
| 8 | `pupil` | `#1E2026` | 12 | **Darkest value on the model.** sRGB (30,32,38) — sits exactly on the contract's 30-sRGB floor (`GRAPHICS_CONTRACT.md` §0 style guardrails: albedo never below 30 or above 240). The previous `#16181C` was (22,24,28) and violated it. Do not darken it back; the pupil gets its depth from the cornea shell and AO, not from crushed albedo. |
| 9 | `shirtBlue` | `#4E74B8` | 49 | The cheap button shirt. Mid-dark, slightly dusty. |
| 10 | `tieGold` | `#E8B93A` | 78 | The one high-chroma accent on the character. Nothing else may be this saturated. |

### Derived / secondary
`lipRoll #CE8C80` (top 30° of each lip tube) · `iris #C89230` · `shirtShadow #33507E` (seams,
under-collar, cuff AO) · `shirtButton #E4E7DE` · `tieGoldDark #A87E1C` (knot, tip shadow) ·
`oralCavity #3A1E22` · `tongue #D97A82` · `tympanum #5C8C3C` (a half-step darker/warmer than
dorsal) · costume-1 `jacketAlt #46266B`.

### Value relationships — how it survives a busy arena
1. **The maximum-contrast pair on the entire model (`sclera` L\*93 vs `pupil` L\*12) sits at the top
   of the silhouette.** That is deliberate: the viewer's eye is dragged to the exact feature that
   carries the parody. Nothing else on the character may approach that contrast range.
2. **The shirt (L\*49) sits 14 L\* below the body green (L\*63).** The torso therefore reads as a
   dark block with a lighter green head floating above it — that value break at the chin line *is*
   the "head on top of shirt" read, and it survives desaturation, silhouette threshold, and
   colour-blind viewing.
3. **The ventral cream (L\*88) is the second-lightest value and it is all on undersides** — throat,
   belly, palms, inner thighs. Bounce light from the arena floor drives it. In the swamp arena the
   green bounce will pull it olive; that is correct and desirable.
4. **Chroma budget:** gold tie is the only high-chroma element. Skin chroma is moderate, shirt is
   dusty. This keeps the character from competing with arena neon (`meme-plaza`,
   `liquidation-storm`) while remaining unmistakably a green frog.

### Rim light
- **Primary rim: `#8FE3FF`** (cold cyan, intensity 1.6–2.2). Cyan against olive-green gives both a
  hue and a temperature break, and it reads as wet — it doubles as the water-sheen cue.
- **Mandatory override in `liquiditySwamp` (`overcast-swamp` mood): `#FF7FB0`** hot rose. In a green
  arena a cyan rim on a green fighter merges. Magenta is green's complement; it is the only thing
  that will hold the edge there. Also use the rose rim in `mountainNodeVillage`.
- The rim must catch: the cranial plate edge, both eye-dome crowns, the brow bevel, the top of the
  lip tubes, the shoulder roll, the glandular fold bead, and the tie edge. Model with that in mind —
  those are the surfaces that need clean, continuous, slightly-sharp bevels.

---

## 6. Surfacing

All presets/kinds below are from `GRAPHICS_CONTRACT.md` §3 (`surfaceMaps(kind, opts)`) and §4
(`pbr(color, preset, overrides)` / `SURFACE`).

| Region | `pbr()` preset | `surfaceMaps()` kind | Key overrides |
|---|---|---|---|
| Dorsal skin, head, outer limbs | `skin-wet` | `skin-amphibian` `{ scale: 3.2, wear: 0.2 }` | `clearcoat 0.60, clearcoatRoughness 0.12, roughness 0.28–0.55 spatially varying` |
| Ventral belly / throat / palms | `skin-wet` | `skin-amphibian` `{ scale: 1.6, tint: frogVentral }` | `transmission 0.08, thickness 0.045, attenuationColor #C8D48A, roughness 0.22` |
| Throat sac | `skin-wet` | `skin-amphibian` `{ scale: 1.1 }` | `transmission 0.14, thickness 0.030` — thinnest, most translucent skin on the body |
| Lips | `skin-wet` | `skin-smooth` `{ scale: 2.4 }` | `roughness 0.18, clearcoat 0.85` — glossier than skin; lips read wet |
| Sclera | `skin-wet` | `skin-smooth` `{ scale: 6 }` | `roughness 0.10`, faint radial vein albedo at 4 % contrast |
| Cornea shell (over iris/pupil) | `glass` | — | `transmission 0.95, ior 1.34, roughness 0.03, thickness 0.006` (1.34 = aqueous humour) |
| Nictitating membrane | `glass` | — | `transmission 0.70, roughness 0.06, milky tint` |
| Tympanum disc | `skin-wet` (tinted `tympanum #5C8C3C`) | `skin-amphibian` `{ scale: 8 }` | `roughness 0.25` — smoother/tauter than surrounding skin, drum-like |
| Shirt | `cloth` | `cloth-weave` `{ scale: 5.5 }` | `sheen 0.35, sheenRoughness 0.60, roughness 0.78` |
| Tie | `gold` | `cloth-weave` `{ scale: 9 }` | `roughness 0.32, metalness 0.55, clearcoat 0.25` — cheap lamé, not bullion |
| Buttons | `plastic-gloss` | — | `roughness 0.15` |
| Oral cavity / tongue | `skin-wet` | `skin-smooth` | `roughness 0.14, transmission 0.05` |
| Monocle / top hat (costume 1) | `gold` / `suit` | `gold` / `suit-wool` | as-is |

### How the surface must behave under light
The whole amphibian read is **a thin wet film over a matte, porous substrate.** Two layers, and you
need both:
1. **Base layer:** genuinely matte and slightly scattering. Roughness varies 0.28–0.55 across the
   body — mottled patches are *rougher* (0.50+) than the smooth interstitial skin (0.30). Drive the
   variation from the same noise that drives the mottle albedo so the two agree; matching
   roughness-to-albedo is the single cheapest thing that makes a stylised surface read as real.
2. **Wet layer:** a **clearcoat at 0.60** with `clearcoatRoughness 0.12` over the entire skin. This
   is the mucous film. Its effect is a tight, bright, *second* specular that sits on top of the
   broad diffuse one — that double-highlight is what your eye identifies as "amphibian" without
   being able to say why. Push it to `clearcoat 0.85` on the belly, throat and lips (mucous pools in
   the low spots), and drop to 0.35 on the shoulder and thigh warts (raised, drier).
3. **Fresnel:** with clearcoat on, the grazing-angle response is already correct. Do **not** add a
   separate fresnel rim shader — you will double it and get a plastic toy. The rim light in §5 does
   the separation job.
4. **Subsurface:** the belly, throat sac, webbing and finger discs use `transmission` + `thickness`
   as tabled. On the **webbing between the toes**, push `transmission` to **0.35** — backlit webbing
   glowing red-green with visible vessel branching is a hero moment; frame it in the KO cam.

### Micro-detail that sells it (30 cm read)
- **Pore field:** worley cells at **~1.8 mm**, depth 0.12 mm, denser on the dorsum (≈ 240 /cm²) and
  sparser on the belly (≈ 90 /cm²). This is the primary normal-map layer everywhere.
- **Warty tubercles:** raised bumps **4–9 mm**, only on the **shoulders, upper back and thigh tops**
  — never the face. 40–60 per shoulder. They break up the rim light into a beaded line.
- **Dorsal mottle:** irregular dark blobs 30–70 mm, ~18 % coverage, soft edges, avoiding the face
  centreline and the lips. Real bullfrog dorsum pattern.
- **Dorsal/ventral transition:** not a hard line. A 40 mm gradient band along the flank, with the
  cream fingering *upward* into the green in 4–8 irregular tongues per side.
- **Belly veins:** faint branching network, **albedo only, 3 % contrast**, no normal. Visible only
  under strong backlight. Do not overdo this — at 5 % it reads as a disease.
- **Skin thinness:** real frog skin is 0.1–1 mm; keep every skin shell thin and every fold soft. No
  leathery creasing anywhere.
- **Shirt:** visible weave at 5.5× scale, plus real **stitching along the placket, collar and hem**
  (0.8 mm relief), 5 buttons, and **fabric strain radiating from the two lowest buttons** — spoke
  wrinkles 60–90 mm long, this is what says "shirt is too small."
- **Tie:** a fabric weave *inside* the gold. Cheap lamé, not a metal ingot. Slight fold along the
  blade's long axis and a soft crease under the knot.

---

## 7. Signature props & wardrobe

### 7.1 The cheap blue button shirt — carries half the parody
- **Short-sleeved button-down**, ill-fitting. Hem stops **0.060 above the hip**, leaving the bare
  cream belly sliver (§2 negative space #4).
- **Collar:** two points, 0.070 long, spread 0.100 apart, **top button undone** and the collar
  gaping open by 0.030. One point sits **flatter than the other** — asymmetry is the joke.
- **Placket:** 0.028 wide, running the full front, **5 buttons** at Ø 0.018.
- **The fit gag:** the shirt is **one size too small for the belly**. The two lowest buttons strain,
  with a 0.012 gap opening between placket edges at the widest belly point and cream skin visible
  through it. Build this as real geometry, not a texture.
- **Sleeves:** end mid-bicep at 0.110 down the upper arm, cuff hem loose (0.006 standoff from the
  arm), slightly flared.
- **Rig:** shirt panels parent to `torso`. **Sleeve cuffs parent to `armL` / `armR` (upper arm),
  never `forearmL/R`** — the forearms detach. The cuff must **overlap the arm mesh by 0.030** so
  no gap opens at extreme rotations (contract §9: "no gaps").
- Costume 1 keeps the purple jacket (`jacketAlt #46266B`) layered *over* this shirt.

### 7.2 The loose gold tie — existing bone, existing gag
The oversized gold tie is Peepee's established silhouette prop and it is in Gore's
`ACCESSORY_BONES`, so it must survive being torn off.
- **Bone position:** move `bones.tie` from its current world `(0.300, 1.100, 0)` to
  **`(0.300, 1.040, 0)`** — local `(0.30, 0.38, 0)` off `torso` — so the knot hangs from the collar
  gap rather than from the throat. Rotation-only clips are unaffected; the `tie-whip` reach is not
  (see §4).
- **Knot** centred **0.050 below the bone**, i.e. world y **0.990**, and rotated **7° off-axis**.
  Loose, never neat. Knot dimensions 0.090 × 0.110 × 0.130.
- **Blade** widens from 0.070 at the knot to 0.130 at the widest, then tapers to a point
  **0.640 below the knot** → tip at world y **0.350**. It hangs past the shirt hem (y 0.680), past
  the bare-belly band, and ends 0.270 below the `hips` line, over the crotch. Absurdly long is
  correct; the source archetype's whole energy is "wearing business clothes badly." Check the tip
  against the thighs in the `hopHop` and `frogKick` crouch frames — at knee-above-hip the tip will
  try to intersect a thigh; the 2-segment spring chain must be tuned so it swings clear, not
  through.
- Base drape: **0.180 rad forward**, with 0.02–0.04 m of air behind the lower half.
- Keep the generic **`$` glint** slab already in the build. A generic currency glyph is fine; a
  specific token logo is not (§9).
- **Rig rules:** every tie mesh parents to `bones.tie` and *only* to `bones.tie`. Nothing else may
  be parented under it. The bone must remain a single clean subtree so `GoreSystem` can reparent it
  to a physics prop in one call. Give the tie a 2-segment spring chain (§8) that reads as cloth.

### 7.3 The tongue
Already an extra bone. Keep it tucked in the oral cavity at bind pose via the existing
`bent(tongue, 0.85)` bake. Upgrade the geometry: a tapered 5-segment tube, base Ø 0.055 → tip
Ø 0.030, total 0.300 at rest and extensible via bone chain / scale to **1.10 m** for
`tongue-grab`. Wet surfacing, `#D97A82`, and a visible medial groove. In `SECONDARY_BONES` — same
single-subtree rule as the tie.

### 7.4 Costume 1 (swamp tuxedo) — keep, upgrade

`buildModel(1)` is frozen in behaviour, not in geometry. Five pieces, all currently raw boxes,
cylinders and a 6-segment torus. Rebuild each with proper bevels and materials — and with numbers,
because "absurdly small top hat" is not a specification:

| Piece | Geometry | Placement | Material |
|---|---|---|---|
| **Top hat** | crown Ø **0.150**, height **0.110**; brim Ø **0.230**, thickness **0.012**, brim edge bevel 0.005; hatband **0.026** tall | head-local **(−0.060, +0.240, 0)** sitting on the cranial plate, tilted **8° about Z** and **5° about X** so it is never square | crown/brim `suit` + `suit-wool`; band `#1A1A1E` |
| **Monocle** | torus major **0.098**, tube **0.011**, 16×48 segments; glass disc r 0.098, thickness 0.004 | parented to **`eyeR`**, offset **+0.108 along the dome's forward axis** so it rims the front of the dome | `gold` rim, `glass` lens (`transmission 0.92, ior 1.5`) |
| **Monocle chain** | 14 links, Ø **0.006**, total drop **0.180**, 2-segment spring chain | from the monocle's lower rim to the shirt placket at world (0.230, 0.930, −0.060) | `gold`, `roughness 0.32` |
| **Pocket square** | 3 points, visible **0.070 × 0.055**, protruding **0.030** | jacket left chest, world ≈ (0.235, 0.965, +0.150) | `tieGold #E8B93A`, `cloth-weave` |
| **Lapel pin** | sphere r **0.016** | right lapel, world ≈ (0.225, 1.010, −0.130) | `gold` |
| **Purple jacket** | lapel width **0.075**, 2 buttons Ø **0.020**, hem at world y **0.700**, sleeve ends **0.150** down the upper arm | layered *over* the shirt of §7.1, not instead of it | `jacketAlt #46266B`, `suit` + `suit-wool` |

Three rules that are not negotiable:

1. **The hat must not close the V-notch.** Crown Ø 0.150 = 0.24 × head width, and it sits at
   head-local x −0.060 — *behind* the eye domes (x +0.200). In front elevation the domes must still
   break the outline on both sides of it. Widen the crown past ~0.200 and the head reads as one
   round blob again.
2. **The hat is allowed to be the tallest thing on the model in this costume only.** Its crown tops
   out at world **1.530**, above the eye crowns at 1.4825 and above the nominal 1.500. That is fine:
   `PeepeeDef.height = 1.5` is hurtbox math and accessories do not feed it. Do **not** shrink the
   eyes or lower the plate to "make room".
3. **Do not name the hat's node `hat`.** See the Gore ordering trap at the top of this document —
   `'hat'` precedes `'tie'` in `ACCESSORY_BONES`, so a bone by that name gets torn off first and
   quietly replaces the established tie gag. Keep the hat as a plain mesh under `head`.

The monocle parenting to `eyeR` (as it currently does) so it swivels with the eye is a good gag —
keep it. Note that §3.2 makes the right dome the *larger* one (r 0.1255), so the monocle's 0.098
major radius must be checked against **that** dome, not the left. `'monocle'` is in
`ACCESSORY_BONES` after `'tie'`, so promoting it to its own bone makes it the second accessory to
detach; either choice is fine, but pick one deliberately and keep the subtree clean.

### 7.5 Explicitly NOT included
No hat with a slogan, no armband, no flag, no badge, no numeric or lettered insignia of any kind.
See §9.

---

## 8. Expression & motion

### Face poses — parameterise these, don't hand-place them
Define three face drivers and author every pose as a triple:
`lidCover` (0–1, fraction of eye height occluded), `lidTilt` (deg; +ve = lateral edge lower =
sad/tired, −ve = medial edge lower = angry), `mouthCorner` (deg from horizontal; −ve = down).

**How to actually wire these, because the rig has nowhere to put them.** The frozen bone list has
`eyeL/eyeR` and no lid bone and no mouth bone. The existing 30 clips already drive `eyeL/eyeR`, and
they use all three rotation axes with these de-facto meanings (read them out of the clip tracks
before you touch anything):

| Axis | Existing clip usage | Example |
|---|---|---|
| `rotation.y` | gaze yaw — the shifty-trader idle | `idle`: `eyeR` y ±0.5 over a 2 s cycle |
| `rotation.x` | lid roll / brace | `block`: `eyeL/R` x 0.35, "lids down, braced" |
| `rotation.z` | comedy roll | `ko`: `eyeL` z +0.9, `eyeR` z −0.9, swirly-eyed |

So: **do not add bones, and do not repurpose those axes.** Implement the three drivers as
**non-bone child groups** that the clip system never addresses —

- `lidL/lidR` groups parented *under* `eyeL/eyeR`, carrying the lid shells; `lidCover` and `lidTilt`
  drive their local rotation, composed **additively on top of** whatever the clip has done to the
  parent eye bone. Because they are children, `rotation.x` bracing from a clip and `lidCover` from a
  pose stack rather than fight.
- a `mouthRig` group under `head` carrying the lip tubes, with `mouthCorner` driving a per-control-
  point offset on the Catmull-Rom curve of §3.3 (rebuild the tube geometry only when the value
  actually changes — do not rebuild per frame).
- the iris/pupil/highlight sit under `eyeL/eyeR` directly, so gaze stays a bone rotation and the lid
  does not drag the pupil with it.

Register none of these in `bones`. `bones` is the clip-addressable namespace and `CONTRACTS.md §4`
freezes it; adding a key there changes the rig, adding a child group does not.

| Pose | `lidCover` | `lidTilt` | `mouthCorner` | Extras |
|---|---|---|---|---|
| **idle** | 0.40 | **+8°** | **−9°** | pupils drift to the corners on a 2 s cycle (shifty trader eyes — already in the idle clip); throat sac bobs 0.012 at 0.45 Hz |
| **angry** | 0.55 | **−14°** | −16° | lower lip pushes forward 0.020; brow bevel catches a hard highlight; throat sac holds 15 % inflated |
| **hurt** | **0.00** | 0 | mouth opens to a rounded rect 0.28 × 0.14 | **lids snap fully open** — the whole eye is a circle, pupils shrink 30 %, nictitating membrane flicks. The pure-round eye is the shock read and it is only ever used here. |
| **KO** | 0.70 | +12° | −22° | pupils roll up until only the bottom sliver shows; `tongue` bone to 0.85 rad, lolling; throat sac fully deflated with all 3 slack folds visible |
| **taunt** | 0.50 | +6° | **+12° — the only time the corners go UP** | throat sac inflates to **1.40× linear** (≈ 2.7× volume, §3.4) over 8 frames, holds 6, snaps back with a 3-frame overshoot; smug half-lid |
| **win** | 0.45 | +4° | +6° | one lid 0.10 lower than the other (a lopsided smug) |

Blink: 3 frames, both lids, with the **right eye starting 1 frame late** (asymmetry again). Add a
separate nictitating "wet blink" at ~0.15 Hz that plays independently.

### Secondary motion (spring solver, per `GRAPHICS_CONTRACT.md §11`)
| Element | k | damping | Limits |
|---|---|---|---|
| Throat sac | 90 | 0.72 | ±0.030 vertical; the fastest, tightest jiggle on the body |
| Belly | 60 | 0.60 | ±0.035; overshoots 0.030 for 5 frames on landing |
| `tie` (2-segment chain) | 45 | 0.55 | ±22° swing, ±14° twist |
| Shirt hem (2-segment strip) | 70 | 0.65 | ±0.020 |
| Toe webbing | 110 | 0.80 | ±10° — flutters on jumps and kicks |
| **Eye domes** | — | — | **RIGID. Do not jiggle the eyes.** They are bone and cornea. Jiggling them makes the character read as a toy and destroys the "these are real bulging eyes" illusion. |

### Posture-driven personality in motion
Everything **lags and overshoots**. This character is heavier than he looks and less coordinated
than he thinks.
- Head lags the torso by **3 frames** on every direction change, then overshoots 4° and settles.
- Walk: hips lead, shoulders trail; the head bobs on the *off*-beat, not the beat.
- Landing from a jump: hips absorb 0.060, belly and throat overshoot for 5 frames, the tie snaps
  forward and slaps back.
- Hops (`hopHop`, `frogKick`): the knees must rise **above the hip line** and break the outer
  silhouette — the frog crouch is a signature pose, give it a full anticipation frame.
- Idle: the eyes are the only fast-moving thing on an otherwise almost-static body. That contrast —
  dead body, darting eyes — is the character.
- Never move him confidently. Every commitment has a tiny hesitation frame in front of it.

---

## 9. Parody safety — MANDATORY

The source character is **actively and successfully litigated**, on a documented record:

| Date | Action | Outcome |
|---|---|---|
| Aug 2017 | *The Adventures of Pepe and Pede* children's book | Settled out of court; book withdrawn, profits donated |
| 2018 | DMCA campaign against The Daily Stormer | Images removed |
| **16 May 2019** | *Furie v. Infowars, LLC*, No. CV 18-1830-MWF (C.D. Cal.) | Court **denied** the defendants' summary-judgment motion on fair use and set the case for trial |
| Jun 2019 | Same case, settled pre-trial | **US$15,000** (more than the defendant's ~$14,000 in profit), destruction of remaining stock, permanent undertaking never to use the character again |

The specific holding matters more than the money: in denying summary judgment the court **rejected
the argument that the "meme-ification" of the character had destroyed or diminished the creator's
copyright interest in it**, and found live factual disputes over whether the altered appearance was
transformative. So: "it's a meme, memes are free" is not an untested theory — it is a defence that
has been argued in federal court and lost, and *changing the drawing* was itself not enough. Our
protection has to come from being a different design, not from being a joke about theirs.

Additionally, the character was appropriated from 2015 onward as a symbol by extremist movements.
Our design must be legible as *a generic crypto-degen bullfrog* and must never carry that freight.

### Do NOT, under any circumstance
1. **Do not use the source character's name**, in any file, string, comment, texture, caption, voice
   line, achievement, or asset key. Our fighter is **PEEPEE, "The Swamp Speculator."**
2. **Do not use any catchphrase associated with the source character**, including the four-word one.
   No variation, no near-miss, no translation.
3. **Do not reproduce the source's line art** — no flat black outline, no traced face, no
   silhouette lifted from a known crop.
4. **Do not reproduce the recognised named expression variants** ("sad", "smug", "angry" crops) as
   1:1 face poses. Our expression set in §8 is parameterised from our own geometry.
5. **Do not use the plain blue crew-neck t-shirt** — that specific garment is the source's trade
   dress. Ours is a **collared, buttoned, short-sleeved shirt** in a different, dustier blue, worn
   badly, plus a tie the source never has.
6. **Do not use the memecoin's logo, wordmark, ticker, colourway, or any token symbol** anywhere:
   not on the tie, not as a decal, not in a particle, not in an arena sign tied to this fighter.
   `decalTexture()` output for this character may not spell any real ticker. The generic `$` glint
   is fine.
7. **Do not include any political iconography whatsoever** — no armbands, flags, slogan hats,
   numeric codes, hand signs, uniforms, insignia, or colour combinations that function as such.
   This is a hard line and it applies to costume variants, victory poses, taunt captions and
   particle shapes.
8. **Do not import or trace any reference image.** Contract rule: all geometry is procedural. This
   also happens to be our best legal position — nothing derives from a fixed copy of the work.
9. **Do not reference the source's supporting cast, comic, or documentary** in bios, captions, or
   arena set dressing.

### Deliberate deviations that keep us distinct while staying recognisable
These are not optional flourishes; they are the design's legal spine. Every one is specified with a
number above so it is verifiable.

| Deviation | Source | Ours | Where specified |
|---|---|---|---|
| **Real amphibian anatomy the source does not have** — tympanum discs, glandular fold, external nares on the face plane, nictitating membrane, 4-digit forelimb / 5-digit webbed hindlimb, inflatable throat sac | flat cartoon, no anatomy at all | full anatomical read | §3.5, §4 |
| **Head proportion** | roundish head, roughly as wide as it is tall | **W : H = 2.07 : 1** — a flat broad plate | §2, §3.1 |
| **Eye placement** | eyes set into the head | eyes are **hemispheres seated on the face plane at the front-top corner**, bulging 0.1175 forward, overhanging the cranial plate by 0.0325/side, crowns 20.8 % of a skull-height above the skull, and the frontmost feature on the whole character by 0.0835 | §3.1, §3.2 |
| **Pupil form** | round dot | **horizontal almond pupil** with a gold-amber iris annulus (real frog) | §3.2 |
| **Lip colour** | reddish/brown | **dusty brick-rose `#B2695F`** with a `#CE8C80` roll — desaturated and modelled as thick tubes with the lower 1.25× the upper | §3.3, §5 |
| **Body colour** | flat bright green | **olive-green with dorsal mottling** (18 % coverage, 30–70 mm blobs) and a pale-cream ventral with a fingered transition band | §5, §6 |
| **Wardrobe** | plain blue t-shirt | **collared button-down in a dustier blue, one size too small, top button undone, straining lowest buttons, untucked hem** + an oversized loose gold tie | §7.1, §7.2 |
| **Chin/jaw** | undefined | **24° receding jaw plane**, chin front sitting 0.048 *behind* the lower lip (0.11 × skull depth) | §3.4 |
| **Build** | slim cartoon | **squat 5.00 HU pear**, head wider than shoulders (0.94 : 1), inverted torso taper | §2, §4 |
| **Species register** | generic cartoon frog | reads as a specific **bullfrog-family** animal | throughout |
| **Face asymmetry** | hand-drawn wobble | *specified, measurable* asymmetry (right dome +6.8 % radius and 0.007 lower, 6° of divergent gaze, right `lidCover` +0.05; collar points differ; blink offset 1 frame) — our own authored quirk, not a copy of theirs | §3.2, §7.1, §8 |

### Review gate
Before merging: render the fighter at 128 px, at 512 px, and in the KO close-up. Ask "does this look
like a *specific drawing someone owns*, or like *our frog*?" If any single frame could be mistaken
for a trace of the source, change a number in the table above and re-render. Recognisable archetype:
yes. Recognisable artwork: no.

---

## 10. Reference notes

**What I looked at, and what I took from each.**

1. **[Pepe the Frog — Wikipedia](https://en.wikipedia.org/wiki/Pepe_the_Frog)** — established the
   baseline design description ("green anthropomorphic frog with a humanoid body usually wearing a
   blue t-shirt", brown lips, heavy-lidded eyes), the origin — **posted to Myspace in 2005, printed
   *Boy's Club* edition 2006** (say 2005 for the character, 2006 for the comic book; the brief
   previously blurred these) — the named expression variants (Sad Frog, Smug Frog, Angry Pepe, Feels
   Frog, "You will never…", Groyper), and the creator's copyright enforcement.
   *Used for:* the base colour/wardrobe read, the eyes-then-lips cue priority, and the whole of §9.
2. **[Matt Furie / Boy's Club search results](https://boysclub.fandom.com/wiki/Matt_Furie)** —
   confirmed the character as "a green, big-lipped frog" whose appeal is "simple, expressive facial
   contortions adaptable to emotions ranging from smugness and sadness to irony and despair."
   *Used for:* prioritising the lips as the #2 cue after the eyes, and for parameterising the face
   as three drivers (§8) rather than authoring fixed expressions.
3. **[Feels Good Man / Art of the Title](https://www.artofthetitle.com/title/feels-good-man/)** —
   Furie draws "frogs with prominent, anthropoid faces." *Used for:* the decision to keep the muzzle
   projection at **zero** — anthropoid, not snouted. This is why §3.1 builds a single skull box with
   no muzzle block, and why the eyes are specified as the frontmost feature rather than the mouth.
4. **[How to Draw Sad Frog — drawingforall.net](https://www.drawingforall.net/how-to-draw-sad-frog/)**
   — the construction sequence: the head begins as "a large overall shape that closely resembles the
   cap of a mushroom"; eyes are ovals that are deliberately **"not perfectly identical"**; eyelids
   are "lowered slightly to convey a tired look"; pupils sit **"slightly lower than the center of
   the eyes so the gaze appears directed downward"**; the mouth starts from "a smooth, gently curved
   central line." *Used for:* §3.1 (the mushroom-cap read → flat cranial plate + overhanging domes),
   §3.2 (40 % lid cover, 8° lateral droop, pupil set 0.014 below the equator, and the mandated
   asymmetry), §3.3 (flat-centre-then-droop mouth curve).
5. **[Bullfrog external anatomy — biologycorner.com](https://www.biologycorner.com/worksheets/bullfrog/bullfrog-external.html)**
   — nostrils "at the tip of the snout"; eyes "bulging" with a **non-movable upper lid, non-movable
   lower lid, and a transparent nictitating membrane**; "behind each eye locate the circular eardrum,
   or tympanum; outer ears are not present"; frogs have **no neck and no tail**; hindlimb has **five
   webbed toes**; forelimb has **four digits**; skin is "smooth, moist in the living animal, and
   thin"; colour is **"pale ventrally and greenish with dark spots dorsally."**
   *Used for:* §3.4 (no neck, 0.060 throat), §3.5 (nares at the snout tip, tympanum, membrane),
   §4 (4 fingers / 5 webbed toes), §5 (dorsal-mottled vs pale-ventral value split), §6.
6. **[A Frog's Tympanum — Naturally Curious](https://naturallycuriouswithmaryholland.wordpress.com/2013/08/15/a-frogs-tympanum/)**
   — the tympanum is "the circular patch of skin directly behind its eye"; in Green Frog / American
   Bullfrog / Mink Frog, **males have a tympanum larger than the eye**, females equal or smaller.
   *Used for:* §3.5 tympanum placement (0.150 behind, 0.060 below the eye centre) and the explicit
   note that we scale it to 0.47 × our cartoon eye rather than >1.0.
7. **American bullfrog head anatomy (search consensus incl. NHPBS NatureWorks, PA Herps, A-Z
   Animals)** — brown/gold irises with **horizontal, almond-shaped pupils**; the bullfrog has
   **no dorsolateral ridges**, but does have "a short glandular fold [that] starts at the eye and
   curves around the top of the tympanum and ends in front of the forelegs."
   *Used for:* §3.2 (horizontal pupil, gold-amber iris) and §3.5 (the glandular fold bead — a
   detail that reads as researched rather than invented).
8. **[Vocal sac — Wikipedia](https://en.wikipedia.org/wiki/Vocal_sac)** and
   **[Science News for Explores — frog vocal sacs](https://www.snexplores.org/article/frogs-calls-vocal-sacs)**
   — the vocal sac is an outpocketing of the buccal floor; "looks like a bubble or balloon,
   spherical, extends out from the front of the frog's body just below the head"; it "inflates like
   a balloon when the frog croaks"; types include single median throat sac (ours), paired throat
   sacs, and paired lateral sacs. *Used for:* §3.4 (single median sac, 1.40× linear inflation), §8 (throat
   sac as the primary secondary-motion element and the taunt/ribbit gag).
9. **Frog skin, mucous glands and colouration (search consensus incl. animalcorner.org, byjus,
   geeksforgeeks)** — skin is thin (≈ 0.1–1 mm), kept moist by mucous glands, semi-permeable and
   used for respiration; dorsal "olive green with dark irregular spots", ventral "pale yellow".
   *Used for:* §6 (the two-layer matte-substrate + clearcoat-mucous model, thin shells, no leathery
   creasing) and the §5 palette.
10. **PBR skin/wet-surface technique (Maxon Redshift Skin docs, PBR frog-skin texture map sets)** —
    skin shaders model the epidermis's "waterproof oily property" as a Primary Reflection with an
    optional Secondary Reflection clear-coat layer; higher specular intensity is preferable for
    oily/wet skin; frog-skin PBR sets ship Albedo/AO/Normal/Height/Roughness/Metalness/Opacity/
    Specular. *Used for:* §6's specific numbers — `clearcoat 0.60 / clearcoatRoughness 0.12` as the
    mucous layer, roughness driven from the same noise as the mottle albedo, and the explicit
    warning not to stack a separate fresnel term on top of clearcoat.
11. **[Infowars settlement coverage (Forbes / Hollywood Reporter / WilmerHale)](https://www.wilmerhale.com/en/insights/news/20190610-pepe-the-frogs-creator-obtains-monetary-settlement-from-infowars)**
    — the 2018 suit, the US$15,000 settlement plus destruction of infringing posters, and the court's
    rejection of the defendant's fair-use summary-judgment motion. Corroborated against the
    **[US Copyright Office fair-use index summary of *Furie v. Infowars, LLC*, No. CV 18-1830-MWF
    (JPRx) (C.D. Cal. 16 May 2019)](https://www.copyright.gov/fair-use/summaries/furie-infowars-cdcal2019.pdf)**
    and the [court's order](https://www.courthousenews.com/wp-content/uploads/2019/05/PepeInfowarssj-ORDER.pdf),
    which is the source for the "meme-ification does not diminish the copyright interest" holding
    quoted in §9. *Used for:* the framing and the severity of §9 — this is not a hypothetical IP risk.

**Gaps I could not close:** no source gives canonical proportional measurements of the source
character (it is a hand-drawn comic with variable proportions and no model sheet). Every ratio in
§2–§4 is therefore **authored by me** from the qualitative descriptions above plus real bullfrog
anatomy — which is exactly what §9 wants: our own numbers, the source's archetype.
