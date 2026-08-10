# DOGEY — parody likeness brief

**Fighter:** `src/characters/dogey.js` · **Source archetype:** the photograph taken **13 February
2010** by Atsuko Sato of her rescue Shiba Inu sitting on a sofa, side-eyeing the camera with
raised inner eyebrows and front paws crossed — which became the **2013 "doge" meme** and the face
of the meme-coin launched in December 2013.
**Owner of this file's implementation:** the DOGEY character agent, exclusively.

Read `GRAPHICS_CONTRACT.md` §0, §3, §4, §9, §11, §12 before you start. This brief is the
research; the contract is the law. Where they disagree, the contract wins. §0.4 of this brief
lists every place they *appear* to disagree and resolves it, so you never have to guess.

---

## 0. Frames, constraints, and contract reconciliation

### 0.1 Hard constraints inherited from the current file (do not break)

- Bone map returned by `buildModel()` must stay **exactly** these 15 names: `hips, torso, head,
  armL, armR, forearmL, forearmR, legL, shinL, legR, shinR, earL, earR, tail, pouch`. Clips and
  move scripts index these by name.
- This brief asks for additional pivots — `jaw`, `browL/R`, `eyeL/R`, four non-exported tail
  links, two ear links per ear, cloth links. **None of them may appear in the returned bone
  map.** Build them as ordinary `Object3D` children and publish handles on
  `model.userData.faceRig = { jaw, browL, browR, eyeL, eyeR }` so the animator can drive them
  without changing the exported contract.
- `HIP_Y = 0.92` — every `hips` position key in `buildClips()` is authored against it. If you
  move it you must re-derive every hips key. **Do not move it.**
- `CharacterDef.height = 1.7`, `weight = 0.9`. Gameplay height stays 1.7 m (skull crown).
  Ear tips poke above it; hurtboxes do not follow them.
- Meshes named `crystalPaw` are toggled by `setCrystalPaws()`. Keep the name, keep two of
  them, keep them `visible = false` at build.
- `buildModel(costume)` must keep answering costume `0` and `1`.
- Faces **+X**. Feet at `y = 0`. `+Z` is the character's left.

### 0.2 The camera this model is designed for

A normal match camera sits within **±25° of the ±Z axis** — i.e. **the player sees Dogey in
near-profile**, never head-on. Every read decision below is designed against that fact, and every
silhouette check must be run at **three azimuths: 0° (pure profile) and ±25°**, not orthographic
front. A doge face built for a head-on camera is a doge face nobody sees.

### 0.3 Coordinate frames — read this before you use a single number

Two frames. Every number in this file is tagged.

- **Model space `M`** — origin between the feet on the floor, `+X` forward, `+Y` up, `+Z`
  character's left. Metres. Used in §2, §4, §7.
- **Head space `Hd`** — origin at the `head` bone pivot, which sits at **`M(0.07, 1.46, 0)`**.
  Axes parallel to model space at zero head rotation. Used throughout §3.

Conversion: `M = Hd + (0.07, 1.46, 0)`. So `Hd(0.05, 0.06, 0.10)` is `M(0.12, 1.52, 0.10)`.
Where a §3 number is quoted in model space for cross-reference it is written `M y = 1.52`.

### 0.4 Where this brief and the contract look like they disagree — resolved

| Contract §9 says | This brief says | Resolution |
|---|---|---|
| "cream/tan Shiba head" | topcoat is orange-red `#C97C34` | Not a conflict, but you must hit a number to prove it: **from the match camera, ≥55% of the head's visible pixel area must be `urajiro-cream` or `urajiro-shade`.** The mask, not the topcoat, is what makes the head read cream/tan. Measure it on a screenshot. |
| "slightly crossed pupils" | old text clamped the iris to a pure side-eye | **The contract wins.** §3.3 now specifies a nasal vergence component on top of the side-eye offset. Both eyes converge ~2.8°. |
| "permanently mid-'wow'" | mouth is closed | Not a conflict. The "mid-wow" attitude is carried by the brow inverted-V, the side-eye, and the 5-second head-yaw beat in §8 — **not** by an open mouth. An open lolling mouth is a *different* dog meme (§3.6). |
| "no gaps" (§9), bevels on every edge (§0.4) | — | Enforced in §11's definition of done. |
| ≤250k tris / <900 draw calls in a match (§0) | old text asked for ~120 individual detail meshes | **The contract wins.** §10 is a hard per-character triangle and draw-call budget with mandatory merge rules. |
| albedo stays in 30–240 sRGB (§0) | old palette had 8 out-of-band channels | Fixed. Every hex in §5 is now in band; all luma figures recomputed. |

---

## 1. The 2-second test

**Rank the cues. Build them in this order. Do not spend detail budget on cue 4 until cues 1–3
survive a screenshot.**

**Cue 1 — the side-eye asymmetry. This is the whole reference.** A Shiba head **yawed 38° out of
the fight toward the camera**, with the pupils left behind — swivelled back toward the opponent so
that a **white crescent of sclera 0.030 m wide (8% of head width) sits on the trailing side of
each eye while only 0.006 m of white shows on the leading side**. A 5:1 asymmetry inside a single
eye. Not "big eyes"; not "expressive"; that ratio. Everything else on the model exists to hold
that up.

The critical insight: in a 2.5D fighter you never see a character head-on, so a head-on doge face
is invisible. Yawing the head toward the camera and leaving the eyes on the opponent gives us the
source photograph's exact geometry — head pointed one way, gaze pointed another — **permanently,
in every frame, for free**, because the fighting-game camera is already off to the side.

**Cue 2 — the raised inner brows.** Two cream lozenges on an inverted-V brow line, included angle
159°, inner ends 0.014 m higher than the outer ends. In the source photo this is the second thing
anyone names ("raised eyebrows" is literally how Know Your Meme describes the shot).

**Cue 3 — the silhouette pair: two erect dark-tipped ear spikes and a tail donut with a hole in
it.** A fox-shaped head plus a wheel of tail, on a short round body. From the profile camera the
38° head yaw is what separates the two ears on screen (§2.3) — without the yaw they superimpose
and you get a mohawk, not a pair.

**Cue 4 — a tiny closed slightly-smiling mouth and a small button nose.** Cheap to build, and it
is what stops the face reading as a generic cartoon dog.

If a player cannot name the meme from a black fill of the head-and-tail alone plus one colour
frame of the face, the rebuild has failed.

---

## 2. Silhouette specification

Head unit **H = 0.40 m** (chin `M y = 1.30` → skull crown `M y = 1.70`). Body 1.70 m = **4.25 H**;
total silhouette including ear tips **1.88 m = 4.70 H**. Dogey is joint-second-shortest of the
roster (Peepee 1.5, Fatty Pingo 1.6, Dogey/Bonko 1.7, Wally 2.0, Bull 2.5) — he must read as
*compact and springy*, not small and weak. Get that by widening, not by heightening.

### 2.1 Vertical stack (model space, sorted)

| Landmark | `M y` | fraction of 1.70 | heads from floor |
|---|---|---|---|
| floor / pad contact | 0.00 | 0.00 | 0.00 |
| top of paw, ankle pivot | 0.11 | 0.065 | 0.28 |
| hock bump (back of shin) | 0.18 | 0.11 | 0.45 |
| knee (`shinL/R` pivot) | 0.49 | 0.29 | 1.23 |
| leg socket (`legL/R` pivot) | 0.88 | 0.52 | 2.20 |
| `hips` bone (`HIP_Y`) | 0.92 | 0.54 | 2.30 |
| hoodie hem (cinched) | 1.02 | 0.60 | 2.55 |
| waist / narrowest torso | 1.04 | 0.61 | 2.60 |
| top of tail curl | 1.28 | 0.75 | 3.20 |
| chin / underjaw | 1.30 | 0.76 | 3.25 |
| shoulder socket (`armL/R`) | 1.38 | 0.81 | 3.45 |
| head pivot (atlas, `head`) | 1.46 | 0.86 | 3.65 |
| eye centreline | 1.52 | 0.89 | 3.80 |
| brow pivot | 1.575 | 0.93 | 3.94 |
| ear pivot | 1.655 | 0.97 | 4.14 |
| skull crown (floor of the ear V) | 1.70 | 1.00 | 4.25 |
| ear tip | 1.88 | 1.11 | 4.70 |

Note the shoulder socket (1.38) sits **above** the chin (1.30). That is deliberate: the head is
carried forward off a high hunched shoulder line — Shiba (well-developed withers, level short
back) *and* rushdown fighter (coiled, leaning in). It buries the neck, which kills the "generic
humanoid animal" read.

### 2.2 Horizontal mass

- **Head width at the cheeks: 0.36 m = 0.90 H.** Nearly as wide as it is tall. A narrow head
  reads as a fox; a domed one reads as a Corgi.
- **Head length occiput→nose tip: 0.44 m = 1.10 H.** (AKC: muzzle is 40% of *this* measurement —
  see §3.2. The old version of this brief mislabelled 0.44 as "occiput→stop"; it is not.)
- **Shoulder span 0.46 m** (1.15 H) measured across both sleeved upper arms. **Ribcage under the
  hoodie is only 0.30 m wide** — the arms make up the rest. **Pelvis 0.30 m.** **Waist 0.26 m.**
  Torso wedge, stated as an area ratio you can actually check: waist cross-section /
  ribcage cross-section = **0.66**.
- **Fight-stance fore-aft stagger 0.34 m** (lead paw `M x = +0.17`, rear paw `M x = −0.17`),
  lateral separation 0.22 m (`M z = ±0.11`), toes rotated out 9°.
- Head width (0.36) is 78% of shoulder span (0.46) in *plan*. But see §2.3: on screen the head is
  the widest thing on the model. Do not let the plan ratio drop below 0.70.

### 2.3 What the profile camera actually sees (do the projection, don't guess)

With the head yawed 38° toward the camera, screen-space footprints at a pure-profile camera:

- **Head screen width** = `0.44·cos38° + 0.36·sin38°` = **0.57 m**, against a 0.46 m shoulder
  span. **From the match camera the head is the widest object on the model.** That is the mascot
  read and it is correct — do not "fix" it.
- **Ear apex separation on screen** = `0.324 · sin38°` = **0.20 m.** This is the entire reason the
  two-spike read survives a profile camera. At a 128 px full-body render (1.88 m → 68 px/m) that
  is **13.6 px of separation between two 16 px spikes**. Remove the yaw and it collapses to ~0 px
  and you have a mohawk.
- **Sclera crescent on screen**: the face is seen 52° off its own normal, so the 0.030 m crescent
  projects to **0.019 m**, ≈ 4.7% of head height. At a 1080p match framing (fighter ≈ 520 px
  tall, head ≈ 122 px) that is **≈ 5.7 px**. That is the number to hit. Do not measure the
  crescent on a 128 px silhouette — it is sub-pixel there by construction.

### 2.4 The 128 px black-fill read

Run at azimuth 0° and ±25°. In priority order:

1. **Two ear triangles.** Base chord 0.115 m, height 0.24 m, apexes 0.324 m apart in world,
   0.20 m on screen. Separate spikes with sky between them — never a merged mass.
2. **The tail donut.** A closed ring on the back with a real hole. Ring major radius 0.12 m, tube
   diameter 0.10 m at the base tapering to 0.06 m → **enclosed void ≈ 0.14 × 0.16 m**, which is
   **9.5 px at 128** — comfortably above the ~6 px that silhouette antialiasing eats. Shiba
   fanciers describe the ideal full curl (*maki-o*) as showing a gap "big enough to fit an egg".
   Build the egg.
3. **The muzzle wedge.** 0.14 m of muzzle beyond the stop, on a 0.44 m head; on screen the head's
   forward half projects 0.24 m past the cheek mass = 16 px. It must step out of the cheek with a
   shadow notch under it.
4. **The hunched shoulder-over-forward-head profile** — an S from crown to tail.

### 2.5 Negative space (this defines the shape more than the mass does)

- **The tail hole.** The only fully enclosed void on the model, and the character's signature
  negative shape. The tail spring solver must never let the enclosed void's minor dimension drop
  below **0.11 m** (§4).
- **The ear notch:** the V of sky between the ears. Inner ear-base edges at `M z = ±0.0425`
  (0.085 m gap), floor of the V at `M y = 1.70`. Nothing may enter it — including the costume-1
  beanie and its pompom (§7.4).
- **The under-chin gap:** **0.04 m** of sky between the underjaw (`M y = 1.30`, at `M x = 0.17`)
  and the top of the chest ruff, when the head is level. Enforced by a hard rule: **forward of
  `M x = +0.05` the ruff surface may not rise above `M y = 1.26`.** Behind `M x = 0.00` it may
  rise to `M y = 1.42`. This gap is what makes the head read as a carried object rather than a
  lump on a body.
- **The guard void:** in idle guard the triangle bounded by the near forearm, the chest front and
  the chin must measure **≥0.06 m across at its narrowest** and must be open to the profile
  camera. Note this void is created along **X** (arms held forward), not along Z — at a profile
  camera a lateral armpit gap is invisible, and a 0.30 m ribcage inside a 0.46 m shoulder span has
  no room for one anyway.
- **The crotch-to-floor triangle:** the 0.34 m fore-aft stagger against a crotch at `M y ≈ 0.80`
  gives a tall triangle of sky, readable in profile. Breeches fur flares *rearward* from the thigh
  (§4) precisely so it does not close it.

---

## 3. Head construction

60% of the work. Build as a bevelled sub-assembly parented to the `head` bone, with its own
internal pivots for brows, lids, jaw and eye-swivel (published on `userData.faceRig`, §0.1).
**All coordinates in §3 are head space `Hd` unless written `M`.**

### 3.1 Skull volume and planes

Base form: a **rounded wedge**, not a sphere.

- **Cranium build box:** `0.30 (X) × 0.34 (Y) × 0.36 (Z)`, centred `Hd(−0.02, +0.055, 0)`,
  bevel radius **0.048 m, 6 bevel segments** (not 16 — see §10; at 122 px of on-screen head,
  segments beyond 6 cost ~7,700 triangles for zero visible gain). This spans `x −0.17 → +0.13`,
  `y −0.115 → +0.225`, `z ±0.18`. The coat shell carries the last 0.015 m up to the crown at
  `Hd y = +0.24` (`M y = 1.70`).
- **Occiput:** `Hd x = −0.17`, and a bump of radius 0.05 centred `Hd(−0.17, +0.14, 0)`. It gives
  the ear bases something to sit in front of.
- **Nose tip:** `Hd x = +0.27`. Total head length **0.44 m**.
- **Top skull plane:** flat, not domed, tilting **down toward the nose by 8°**. AKC: "Forehead is
  broad and flat with a slight furrow." The flat top is what makes the ears read as planted on a
  table rather than sprouting from a ball.
- **Cheek bulges:** each cheek is a spherical surface of radius **0.19 m** tangent to `z = ±0.18`
  at `Hd(−0.03, −0.02)` — i.e. sphere centre `Hd(−0.03, −0.02, ∓0.01)`. **The widest point of the
  whole head is at `Hd y = −0.02` (`M y = 1.44`), which is *below* the eye centreline.**
  Cheek-widest-below-eye is the fox/Shiba signature.
- **Stop:** the forehead plane descends at 8°, then drops **0.028 m over a 0.05 m run — a 29°
  ramp — to meet the level muzzle top plane at `Hd x = +0.13`.** Shallower than 18° reads
  Collie/Borzoi; steeper than 45° reads Pug/Bulldog. (The previous version of this brief had this
  comparison backwards.)
- **Plan (top-view) half-width table.** The blunt triangle, as numbers. Loft through these:

  | `Hd x` | half-width `z` | station |
  |---|---|---|
  | −0.17 | 0.150 | occiput |
  | −0.03 | 0.180 | cheek, widest |
  | +0.07 | 0.160 | eye station |
  | +0.13 | 0.075 | stop / muzzle root |
  | +0.27 | 0.048 | nose |

  Included taper from the cheek to the nose ≈ **48°**.
- **Median furrow:** 0.001 m deep, running up the forehead from the stop. AKC calls for it; it
  catches a specular line and gives the forehead form for one triangle's worth of cost.

### 3.2 Muzzle

- **Breed-correct muzzle = 40% of total head length** (AKC, verbatim: *"Muzzle length is 40% of
  the total head length from occiput to nose tip"*) = 0.176 m on our 0.44 m head. **We shorten it
  20% to 0.140 m = 32% of head length** (see §9, deliberate deviations). Stop at `Hd x = +0.13`,
  nose tip at `Hd x = +0.27`.
- Cross-section at the stop `0.15 wide × 0.13 tall`; at the nose `0.095 × 0.075`. Taper gradual
  and **straight-bridged** — never dished, never Roman.
- The muzzle top plane runs level (0°) while the skull top runs at −8°; the 29° ramp between them
  *is* the stop.
- **Jaw:** a separate low-poly jaw shell on a `jaw` pivot at the temporomandibular position
  **`Hd(−0.06, −0.06, 0)`** — behind and below the eye, *not* out at the front of the face (the
  old spec's `x = +0.06` hinged the mouth like a beak). Chin at `Hd(+0.10, −0.16)` is 0.189 m from
  the pivot, so 22° of drop swings the chin 0.072 m. Range 0° (closed) → 22° (bark/hurt).
  Neutral is **closed**.
- **Lip line:** the lower edge of the upper muzzle, running from the nose corner back and slightly
  up. Chamfer 0.008 m, darkened (`nose-black`). The mouth is a *seam*, not a painted stripe.

### 3.3 Eyes — the money shot, and the one place the old numbers were physically impossible

Real geometry per contract §9: sclera + iris + pupil + specular + lid geometry. No painted quads.
Two `eye` pivots rotate the eyeballs independently of the head.

**Read this first.** A full 38° gaze counter-rotation is geometrically impossible with a dog-sized
eye. On a 0.052 m eyeball, 38° of yaw slides the iris centre `0.052·sin38° = 0.034 m` across an
aperture whose half-width is only 0.040 m — the iris would be swallowed by the lid corner. The old
spec asked for 38° of counter-rotation, a 0.021 m offset, *and* ≥0.006 m of sclera on both sides;
those three numbers cannot coexist. **The head yaws 38°; the eyes counter-rotate 10.5°, clamped
hard at 13°.** The residual 27.5° of gaze error is invisible at match distance, and the resulting
crescent is bigger than the old spec's anyway.

- **Eyeball sphere radius 0.052 m** (diameter 0.104 = **0.29 × head width**), centres at
  **`Hd(+0.050, +0.060, ±0.100)` = `M(0.120, 1.520, ±0.100)`**. Optical axes splay **12° outward**
  from `+X` at neutral.
  *Containment check (required):* with a 12° splay the corneal pole lands at `Hd(0.101, 0.060,
  ±0.111)`; the plan table above gives a half-width of 0.116 there. **The skull surface must stay
  ≥0.004 m outboard of the eyeball everywhere.** Verify it before you move on.
- **Deep-set orbit.** AKC: eyes are *"somewhat triangular in shape, deep set, and upward slanting
  toward the outside base of the ear."* The orbital rim stands **0.010 m proud** of the eyeball's
  outer surface on the upper-outer quadrant, so the eye sits in its own AO pocket. This, not the
  eye size, is what makes the eye look set into a skull.
- **Visible aperture:** **0.080 m long × 0.054 m tall** along the canthal axis. That is
  **0.222 × head width**, 0.135 × head height, aspect 1.48:1. Shape: triangular-leaning-almond,
  blunter at the inner canthus.
- **Canthi:** inner at `Hd z = ±0.062` (**0.124 m apart**), outer at `Hd z = ±0.142`
  (**0.284 m apart**). Eye separation / eye length = 1.55.
- **Oblique set:** the outer canthus sits **0.0105 m higher** than the inner over the 0.080 m span
  = a **7.5° upward slant**. This is the geometric root of the "skeptical" read.
- **Iris diameter 0.044 m** = 55% of aperture length. Colour a warm dark brown, **not** black — it
  must read as a lighter ring around the pupil under key light or the eye dies.
  **Pupil diameter 0.023 m** = 52% of iris.
- **THE SIDE-EYE — exact numbers.** Mechanical maximum iris-centre travel before the iris meets
  the lid corner: `0.040 − 0.022 = 0.018 m`. Neutral target: **0.012 m of travel (67% of maximum)
  toward the leading, opponent-facing edge of the aperture**, composed of:
  - **0.0095 m** from gaze-lock counter-rotation (eye yaw 10.5°), and
  - **0.0025 m** from **nasal vergence** — each eye toed in ~2.8°, which is the contract's
    mandated "slightly crossed pupils". On the near eye the two components add; on the far eye
    they partly cancel, and that mismatch *is* the derp.

  Resulting sclera: **leading side 0.006 m, trailing side 0.030 m.** Symmetric-gaze reference
  (angry pose, §8): 0.018 m each side. Clamp total eye yaw to **±13°** in the solver so the
  leading crescent never closes — an eye with white on only one side reads as *rolled back*, not
  *sideways*.
- **Lids:** real geometry, a 0.005 m thick shell following the eyeball with 0.001 m clearance.
  Neutral: **upper lid covers the top 26% of aperture height (0.014 m)**, lower lid the bottom 8%
  (0.0043 m). The upper lid's lowest point is **displaced 25% toward the outer canthus** — the
  "half-interested" tilt. Blink: closed over 4 frames, hold 2, open over 5 (unequal, contract §11).
- **Corneal specular — no transmission.** Build the cornea as a **0.0035 m proud spherical cap
  over the outer 0.028 m** of the eyeball, on the *same* mesh and material as the sclera, with
  `plastic-gloss` + `clearcoat 1.0, clearcoatRoughness 0.04`. **Do not use a separate transmissive
  glass dome.** `MeshPhysicalMaterial.transmission` forces a full-screen transmission render
  target; four instances (2 fighters × 2 eyes) is not in the frame budget, and at ~6 px of eye the
  refraction is invisible while the clearcoat specular is the entire effect. One key catchlight at
  10 o'clock, one dim fill at 4 o'clock, both from real lights.
- **Eye rim:** a 0.004 m band of `nose-black` skin around the aperture (breed standard: black
  eyelid rims). This is what stops a cream face from swallowing the eye.

### 3.4 Brows

Two mechanisms, both required.

1. **Geometry.** A brow ridge as a `0.075 (Z) × 0.020 (Y) × 0.030 (X)` rounded slab per side on a
   `brow` pivot at **`Hd(0.030, +0.115, ±0.100)` = `M(0.10, 1.575, ±0.100)`**, 0.055 m above the
   eye centreline. Neutral: the **inner end raised 0.014 m above the outer end** over the 0.075 m
   span — a **10.5° inner-up tilt** — so the pair forms an **inverted V of included angle 159°**
   (`180° − 2 × 10.5°`) across the forehead.
   This is the *levator anguli oculi medialis* at work: Kaminski et al., PNAS 2019, showed dogs
   evolved this muscle (near-absent in wolves) specifically to raise the **inner** eyebrow, and
   that raise is what humans read as concern. The meme face is a permanent AU101 — which is why
   the **inner** end is the end that travels.
2. **Marking — the pips.** The AKC standard, verbatim: *"White spots above the eyes permitted on
   all colors but not required."* **Note the correction:** the *tan oval spots over the eyes* are a
   black-and-tan tan-point requirement, not a red-Shiba marking. Our dog is red, so the pips must
   be built at **`urajiro-cream` value, not tan.**
   Build them as rounded lozenges **0.052 m long × 0.026 m tall**, long axis following the brow's
   10.5° tilt, inner end at `Hd z = ±0.062` (directly above the inner canthus), outer end at
   `Hd z = ±0.114`. **Inset geometry with a 0.003 m step**, not a texture decal, so they catch a
   rim highlight and survive at distance. At 3 m these pips *are* the raised-eyebrow read — the
   brow slab itself is sub-pixel by then. They are also the legal hedge (§9).

**Brow drive range:** inner end **+0.020 m up** (max concern/taunt) to **−0.016 m down** (angry —
the inverted V flattens to a level bar and then inverts to a 17° outer-up scowl). The whole
personality of this character lives on **36 mm of brow travel**.

### 3.5 Ears

- **Erect triangular, oversized ~25% over breed-correct** for silhouette (breed-correct on this
  0.40 m head would be ~0.19 m tall). Base chord **0.115 m**, height **0.24 m** (0.60 H),
  thickness **0.030 m at the base tapering to 0.012 m at the tip**. Tip fillet **0.005 m** — it
  must be under half the local thickness, so the old 0.008 m figure was unbuildable at a 0.012 m
  tip. 0.005 m is enough to stop the tip aliasing into a shimmering needle.
- **Set:** `earL/earR` pivots at **`M(−0.03, 1.655, ±0.100)` = `Hd(−0.10, +0.195, ±0.100)`** —
  high and lateral on the flat top plane, just forward of the occiput bump.
- **Angles:** inclined **forward 12°** about Z, splayed **outward 15°** about X. Do not exceed
  18° outward or he reads as a Corgi.
- **Resulting tip positions** (derive these, don't eyeball them):
  `y = 1.655 + 0.24·cos12°·cos15° = 1.88`; `z = ±(0.100 + 0.24·sin15°) = ±0.162`, so
  **apexes 0.324 m apart**; `x = −0.03 − 0.24·sin12° = −0.08`.
- **Shape:** outer edge straight; **inner edge concave** (bow it inward 0.010 m at mid-height);
  leading edge rolls forward. An ear is a cone segment, not a flat card. Build as a 2-loop lofted
  triangle with a 0.006 m rolled rim on the leading edge.
- **Colour zoning:** outer surface is `fur-topcoat` at the base, shading to `fur-sesame` over the
  **top 38%**. The dark ear tip is non-negotiable. Inner surface is `urajiro-cream` with **3–5
  geometry tufts** of cream ear-fur, each 0.012 m thick and 0.03–0.05 m long, angled up and inward
  (merged into one mesh per ear, §10).
- **Both ears erect.** The current build has one floppy ear as a gag; kill it. Matched erect
  triangles are the source read and one droop halves the recognition value. Sanctioned asymmetry:
  a **2–4° difference in splay** and a permanent **5° extra forward lean on the camera-side ear**
  — alive, not broken.

### 3.6 Nose and mouth

- **Nose leather:** `0.055 wide × 0.042 tall × 0.032 deep` = **0.153 × head width**. Small. It must
  read as a *button* against the pale muzzle mask; past 0.19 × head width the face reads as a
  bear. Form: a rounded wedge with a flat-ish front plane tilted back 15°, two crescent nostril
  slits 0.014 m long with a 0.004 m bevel canted 30° from vertical, and a **0.010 m wide philtrum
  groove** from between the nostrils down to the lip line. Stands 0.006 m proud of the muzzle with
  a hard chamfered edge so it takes its own specular.
- **Mouth: closed, slightly smiling.** Total seam width **0.13 m** (0.065 per side from the
  philtrum) = **0.36 × head width** — small relative to the head. The seam runs back from the
  philtrum, dips 0.004 m at mid-run, then the **corners rise 0.014 m over the last 0.020 m**. That
  final upturn is the entire "closed slightly-smiling mouth" cue — measure it, don't eyeball it.
- Corner direction **up and slightly back**, terminating at `Hd(−0.02, −0.135, ±0.052)`
  (`M(0.05, 1.325, ±0.052)`), tucked under the cheek fluff so it ends in shadow rather than running
  off the face.
- Behind the seam: a real oral cavity shell (`mouth-interior`), a tongue, and a *suggestion* of
  teeth — 4 upper incisors and 2 canines only, 0.010 m each, no full dentition. Never visible in
  idle; needed for bark, taunt, hurt and KO.
- **No lolling tongue in idle.** The current model's dropped jaw + lolling tongue is a *different*
  dog meme. This dog's mouth is shut. Tongue appears only in bark/taunt/hurt/KO.

### 3.7 Head carriage — the yaw that makes it work

- **Idle head yaw: 38° toward the camera** (rotate `head` about Y so the muzzle points 38° off the
  `+X` fight axis, toward whichever ±Z the camera is on). Plus **roll 7°** toward the same side —
  the source photo's cocked head — and **pitch down 5°**, which is what puts the chin (1.30) below
  the shoulder socket (1.38).
- Eyes counter-rotate 10.5° (clamped ±13°) per §3.3. **They do not reach the opponent and must
  not try to.**
- Under any camera side-flip, yaw and roll flip with it. Implement as a **look-at additive layer**
  with the clamp baked in, not as baked keys, so it survives every clip.
- During attacks the yaw releases to **10–15°** (he commits, briefly) and **snaps back to 38° over
  5 frames in the recovery, with 12% overshoot**. That snap-back is the joke: he keeps checking
  the camera.

---

## 4. Body and limb proportions

All model space `M`.

### Torso

Three lofted volumes, not one box. Every one of these was re-derived so the head does not
intersect the chest — the old spec's 0.42 m-deep chest put the chin *inside* the ribcage.

- **Withers / shoulder mass:** `0.34 wide × 0.28 deep × 0.20 tall`, centred `M(−0.06, 1.30, 0)`.
  Spans `x −0.20 → +0.08`, `y 1.20 → 1.40`.
- **Ribcage (under the hoodie):** `0.30 wide × 0.34 deep × 0.26 tall`, centred `M(−0.02, 1.19, 0)`.
  Spans `x −0.19 → +0.15`, `y 1.06 → 1.32`. Deep chest, moderately sprung ribs; deeper than it is
  wide, which is the Shiba read and is invisible from the profile camera unless you get it right.
- **Waist:** `0.26 wide × 0.26 deep` at `y = 1.04`. Waist/ribcage cross-sectional area = **0.66**.
- **Pelvis:** `0.30 wide × 0.26 deep` at `y = 0.92`.
- **Tuck-up:** the underline rises **0.05 m** from the sternum (`y = 1.06` at `x = +0.10`) to the
  groin (`y = 1.11` at `x = −0.06`). He is round, not fat; the tuck-up is what keeps him athletic.
  The hoodie hem must cinch rather than hide it.
- **Head clearance check (required):** chin at `M(0.17, 1.30)` vs the withers front face at
  `x = +0.08` — **0.09 m of clearance**. Verify after any torso change.
- **Spine curve:** shallow C. `hips` 0.92 → lumbar apex pushed back to `x = −0.06` at `y = 1.06`
  → withers pushed forward to `x = −0.02` at `y = 1.32` → the neck runs **forward and slightly up**
  to the head pivot at `M(0.07, 1.46)`, and the head then **pitches 5° down** so the chin lands
  below the shoulder sockets. Net: shoulders high, muzzle low and forward, butt tucked.
- **Neck:** thick and short — axis from `M(−0.05, 1.36)` to the head pivot, length 0.156 m,
  diameter 0.19 m, sleeved by the chest ruff so no seam is ever visible. A visible thin neck is an
  instant amateur tell.

### Arms

- Upper arm 0.28 m, forearm 0.26 m, paw 0.13 m (rigid to `forearmL/R` — there is no paw bone).
  **Total 0.67 m = 1.68 H = 0.39 of body height.** Short relative to a human (≈0.44): deliberate
  stumpiness.
- **Shoulder sockets `M(0, 1.38, ±0.16)`.** Sleeved upper-arm outer diameter 0.14 m → outer extent
  `z = ±0.23` → **shoulder span 0.46 m**. (The old spec put the sockets at `±0.23`, which is the
  *outer surface*, and would have hung the arms outside the silhouette.)
- **Relaxed hang:** fingertip at `y = 0.71` (mid-thigh). If you change arm lengths, update the
  `forward` constants on `paw-jab` (0.9), `bag-slap` (1.0), `rapid-scratch` (0.9) and `hodl-grab`
  (0.85) in `DOGEY_MOVES` and re-verify reach with the harness.
- **Idle guard** (this is a fighter, not a mascot standing still): elbows tucked at
  `M(+0.10, 1.10, ±0.185)` — they may come within 0.02 m of the hoodie, that is what elbows do —
  and forearms angled up-and-forward to paws at **`M(+0.30, 1.30)` (lead)** and
  **`M(+0.22, 1.20)` (rear)**. The **camera-side arm sits 0.06 m lower and 0.05 m further back**
  so it does not occlude the far arm or the chest. The checkable requirement is the guard void in
  §2.5: ≥0.06 m across, open to the profile camera.
- **Paw construction:** not a fist, not a hand. A **rounded mitten**: a `0.13 × 0.10 × 0.09`
  rounded volume with **three fused finger lobes** (each 0.032 m wide, separated by 0.006 m
  creases — `3×0.032 + 2×0.006 = 0.108`, so build the mitten 0.108 m wide across the lobes and
  taper to 0.10 at the wrist), front lobe 0.008 m proud, plus a **dewclaw nub** on the inner side
  at 0.03 m. Underside: **four toe pads** (ellipsoids `0.026 × 0.020 × 0.010`, arranged on a
  0.09 m arc with the two outer pads set 0.012 m proximal — four 0.030 m pads will not fit across
  a 0.10 m sole in a straight row) and one **metacarpal pad** (`0.055 × 0.045 × 0.012`), all
  `rubber`, 0.004 m proud. Small blunt **claws**: 0.018 m long, `horn`, protruding 0.006 m past
  the fur.
- Hoodie cuff overlaps the wrist by 0.04 m — no gap, ever (contract §9).

### Legs

- **Bone lengths:** thigh 0.42, shin 0.39, ankle→floor 0.11. Unfolded total **0.92 m = 0.54 of
  body height** — legs are exactly half the character, short-legged for a fighter and correct for
  a round dog.
- **Leg sockets `M(0, 0.88, ±0.12)`** — 0.04 m below `HIP_Y`, which is why the socket height (0.88)
  and `HIP_Y` (0.92) are different numbers. Do not conflate them.
- **Fight-stance joint angles, derived so the numbers close:** thigh 20° from vertical → knee at
  `y = 0.88 − 0.42·cos20° = 0.49`; shin 12° → ankle at `0.49 − 0.39·cos12° = 0.104 ≈ 0.11`.
  **Included knee flex 32°** (the old brief's "14°" is inconsistent with a knee at 0.49 and cannot
  be built).
- **Digitigrade-lite:** hock/ankle at `y = 0.11` with a **28° rearward hock angle**, paw planted
  flat. Full digitigrade breaks the existing clips; straight plantigrade looks human. The
  compromise is a visible **hock bump on the back of the shin at `y = 0.18`** plus **breeches fur**
  flaring 0.05 m **rearward** from the back of the thigh — sells the hind-leg read without moving a
  joint, and does not close the crotch triangle.
- **Feet:** `0.20 long × 0.11 wide`. AKC: *"catlike with well-arched toes fitting tightly
  together. Pads are thick."* Four distinct rounded toes with 0.008 m creases, pads as above, toes
  rotated out 9°.
- **Stance — changed, and it needs verification.** The readable spread at a profile camera is
  **fore-aft**, not lateral. Lead foot `M(+0.17, 0, ±0.11)`, rear foot `M(−0.17, 0, ∓0.11)`:
  **0.34 m of stagger along X, 0.22 m of lateral separation.** Weight 55% on the back foot.
  ⚠️ This moves feet relative to the current build. **Re-verify every clip's foot keys and the IK
  foot-planting pass with the harness before you ship**, and do not touch `HIP_Y` to compensate.

### Tail

- `tail` bone at `M(−0.14, 1.02, 0)`. **Full curl (*maki-o*)** over the back.
- **Ring geometry (all four numbers must agree — the old spec's "outer 0.34, tube 0.10, hole 0.09"
  did not):** ring centre `M(−0.19, 1.11, 0)`, **major radius 0.12 m**, **tube diameter 0.10 m at
  the base tapering to 0.06 m at the tip**, arc **330°**.
  - Outer diameter `= 2(0.12) + 0.10 = 0.34 m` ✔
  - Enclosed void `= 2(0.12) − 0.10 = 0.14 m` at the thick side, 0.18 m at the thin side —
    an oval roughly **0.14 × 0.16 m** ✔ (9.5 px at 128 — this is the egg)
  - Top of the curl `= 1.11 + 0.12 + 0.05 = 1.28` ✔ (matches §2.1)
- **Ring plane:** sagittal (normal along Z), canted **12° toward the camera side**. Rationale,
  corrected: from a profile camera the sagittal ring already reads face-on — the hole is *never*
  edge-on. The cant exists so the hole survives when the camera swings to ±25° and when the body
  turns on a side-switch. **Do not exceed 20°**; beyond that `cos θ` foreshortening starts eating
  the void.
- Build as a **5-segment spring chain** (`tail` + 4 non-exported children) lofted along the arc,
  with **8–12 geometry fur clumps 0.03–0.06 m long** along the outer edge so the silhouette is
  ragged, not a smooth donut (merged into one mesh, §10). Tail hair is longer than body hair.
- **Underside cream** (`urajiro-cream`) per the standard; topside `fur-topcoat` darkening to
  `fur-sesame` on the outer curve; tip cream.
- **The spring solver must preserve the hole:** clamp the arc to 300°–350° **and** clamp so the
  enclosed void's minor dimension never drops below **0.11 m**. Arc angle alone is not sufficient —
  a lateral squash can close the hole at a legal arc angle.

---

## 5. Colour script

Every hex is inside the contract's **30–240 sRGB per channel** band (the previous palette had
eight out-of-band channels: `#54300F`, `#F2E3C0`, `#23191A`, `#181012`, `#191F44`, `#0E7F86`,
`#08565E`, `#7DF2FF`). Luma is `0.2126R + 0.7152G + 0.0722B` on gamma-encoded values — every
figure below was recomputed; the old table's numbers were wrong by up to 0.09.

| Name | Hex | luma | Use |
|---|---|---|---|
| `fur-topcoat` | `#C97C34` | 0.53 | Dominant red-Shiba topcoat: back, head, outer limbs, outer ears, tail top. Warm orange-red, **not** brown, **not** gold. |
| `fur-highlight` | `#E9A757` | 0.69 | Guard-hair tips catching key light — shoulder caps, brow ridge, muzzle bridge, top of the tail curl, ear leading edges. Never more than ~15% of fur area. |
| `fur-sesame` | `#7A4418` | 0.30 | Sesame black-tipping: spine, shoulder blades, **top 38% of the ears**, outer tail curve, a soft saddle across the withers. Blend, don't hard-edge — red urajiro boundaries are slightly blurred. |
| `fur-shadow` | `#593620` | 0.24 | Crevice/AO tint only: under the jaw, inside the ear cone, armpits, groin, under the tail curl, between toes. Multiply target for AO, never a large flat area. |
| `urajiro-cream` | `#EEDFBD` | 0.88 | **The mask.** Sides of the muzzle, cheeks, underjaw, upper throat, chest bib, inner legs, belly, inner ears, **brow pips**, underside of the tail, paw fronts. Lightest value on the model, and deliberately the value that frames the eyes. |
| `urajiro-shade` | `#D2BC93` | 0.74 | The same cream turned away from key — stops the mask blowing out to a flat white blob and gives the muzzle its own form. |
| `eye-sclera` | `#E2D6C4` | 0.84 | Warm off-white, **0.04 luma below `urajiro-cream`** so the side-eye crescent reads as an eye and not as a hole punched in the mask. |
| `eye-iris` | `#452A1F` | 0.18 | Dark brown (AKC: "Iris is dark brown"). Pupil `#241E22` (0.12). The iris/pupil delta is small but must exist. |
| `nose-black` | `#2A2022` | 0.13 | Nose leather, eye rims, lip line, claws. Paw pads slightly warmer: `#3A2622` (0.16). **Darkest surface on the body**, and the reason a 0.055 m nose reads from across the arena. |
| `garment-indigo` | `#283060` fold `#1E2447` | 0.20 / 0.15 | Hoodie, costume 0. **Change from the current orange.** An orange hoodie on an orange dog destroys the read — the cream mask must be the only bright thing above the waist. |
| `garment-teal` | `#1E4348` fold `#1E3034` | 0.23 / 0.17 | Hoodie, costume 1. Deliberately kept in the same value band as indigo so costume 1 keeps the same three-value structure. |
| `pouch-plum` | `#55399F` strap `#3F2F8E` | 0.28 / 0.22 | Crossbody pouch. Keeps the existing purple identity; the only saturated cool accent, and darker than `fur-sesame` so it never competes with the face. |
| `token-gold` | `#C99A3A` | 0.62 | The blank token disc, `gold` preset. 0.05 m. Deliberately dulled from a bright gold so it stays below `fur-highlight` — a highlight accent, not a logo. |
| `crystal-ice` | `#7CE8F0` albedo, emissive `#1B6F80` | — | Diamond-paws special only. Emissive is exempt from the albedo band. |
| `rim-cyan` | `#9CD6FF` | — | **Light colour, not albedo.** Cool desaturated sky-cyan at 0.6–0.9 intensity from behind-and-above; against warm arenas (`sunset-stadium`, `meme-plaza`, `bull-market`) it separates the orange fur. Against cold arenas (`arctic-day`, `frozen`) push warm to `#F0D2A0`. The character agent sets `rimColor` intent in its report; arena agents own the rig. |

**Value ladder (memorise; light → dark):**
`urajiro-cream` 0.88 → `eye-sclera` 0.84 → `urajiro-shade` 0.74 → `fur-highlight` 0.69 →
`token-gold` 0.62 → `fur-topcoat` 0.53 → `fur-sesame` 0.30 → `pouch-plum` 0.28 →
`fur-shadow` 0.24 → `garment-teal` 0.23 → `pouch-strap` 0.22 → `garment-indigo` 0.20 →
`eye-iris` 0.18 → `garment-teal-fold` 0.17 → `paw-pad` 0.16 → `garment-indigo-fold` 0.15 →
`nose-black` 0.13 → `pupil` 0.12.

- **The face carries the highest contrast on the model:** cream 0.88 against nose and eye-rim 0.13
  — a **0.75 luma spread inside a 0.36 m span**. Nothing else on the body may approach it. That is
  why the eye goes to the face first, from any distance.
- **Three-value read at 3 m, in this order:** mask = light accent, body = mid, hoodie = dark
  anchor.
- **Contract check:** measure it. From the match camera, **≥55% of the head's visible pixel area
  must be `urajiro-cream` or `urajiro-shade`** — that is what satisfies the contract's
  "cream/tan Shiba head" while the topcoat stays a breed-correct red.

---

## 6. Surfacing

Presets from contract §4; texture kinds from §3.

| Region | `pbr()` preset | `surfaceMaps()` kind | Notes |
|---|---|---|---|
| Body/head topcoat | `fur` | `fur-short`, `scale ≈ 3.0` | Roughness 0.78 base, ±0.10 spatial. Normal strength 0.8. AKC: outer coat *"stiff and straight"* — the normal map must read as short straight directional hair, not fluff. |
| Chest ruff, cheek fluff, breeches, tail | `fur` | `fur-long`, `scale ≈ 1.6` | Same albedo, roughness 0.84, plus real geometry tufts. Longer noise period so it reads as clumps at 1 m. |
| Ear tips, sesame saddle | `fur-dark` | `fur-short` | Same maps, darker albedo. **Not** a separate material with a different roughness — one coat, two tints. |
| Nose leather | `rubber` | `leather`, `scale ≈ 26` | Roughness 0.42 with a wet 0.22 patch on the upper third. Cobbled granulation is what sells "real nose". Clearcoat 0.15. |
| Eyeball (sclera + iris + pupil + corneal cap, one mesh) | `plastic-gloss` | none | Roughness 0.18, **clearcoat 1.0, clearcoatRoughness 0.04**. No transmission (§3.3). |
| Eye rims, lip line, claws | `hide` / `horn` | `skin-smooth` / `horn` | Claws roughness 0.35, faint tip translucency. |
| Paw pads | `rubber` | `rubber`, `scale ≈ 18` | Roughness 0.62, slightly domed normals per pad. |
| Teeth, tongue | `skin-wet` | `skin-smooth` | Tongue roughness 0.24, subtle warm scatter tint. |
| Hoodie | `cloth` | `cloth-knit`, `scale ≈ 5` | Roughness 0.88, sheen 0.35, sheen colour `#8FA0D8`. Cuff/hem ribbing as **geometry** (12 ribs, 0.004 m relief). Seams: 0.003 m raised piping with a stitch normal. |
| Drawstrings | `cloth` | `cloth-weave`, `scale ≈ 40` | Twisted-cord normal. Real tubes, 0.012 m diameter, with aglets. |
| Pouch + strap | `leather` | `leather`, `scale ≈ 12` | Roughness 0.55, wear 0.4 on the flap edge and strap shoulder; edge-worn lighter corners. |
| Token disc | `gold` | `gold` | Metalness 1.0, roughness 0.22, envMapIntensity 1.4. Blank face, milled edge (24 knurls, modelled into the disc mesh). |
| Beanie (costume 1) | `cloth` | `cloth-knit`, `scale ≈ 3` | Chunky knit — 6 cable columns as geometry. |
| Crystal paws | `ice` | `ice` | Transmission 0.6, iridescence 0.3, emissive `#1B6F80` at 1.6. **The only sanctioned transmission and the only sanctioned bloom source on this character**, and only while `setCrystalPaws(true)` and quality ≥ `high`. At `medium` and below, fall back to `plastic-gloss` + emissive. |

**How the surface must behave under light**

- **Fresnel sheen on the fur is mandatory.** Stiff guard hairs light up at grazing angles. Set
  `sheen ≈ 0.5`, `sheenRoughness ≈ 0.6`, sheen colour `#F0D2A0` on the topcoat. In practice the rim
  light then produces a **warm halo of hair** around the silhouette — the single biggest "this is
  fur, not plastic" cue, and it is also what separates him from a warm arena.
- **Roughness varies spatially, never constant.** Guard-hair ridges ~0.72, undercoat valleys
  ~0.90, driven from the same height field as the normal (`roughnessFromHeight`).
- **The cream mask is rougher than the topcoat** (0.86 vs 0.78) — undercoat-heavy areas are softer
  and matter. That tiny delta is what stops the mask reading as paint.
- **Wetness is limited to three places:** the nose leather's upper third, the corneal caps, and the
  lower lip line. Nothing else on this character is wet. (Contrast PEEPEE, who is wet everywhere.)
- **Micro-detail that sells it:** (a) geometry fur clumps on ruff/tail/breeches/ear-interiors,
  merged per §10, each a 3-triangle tapered wedge catching rim light individually; (b) the
  cream/red transition drawn as a **noisy blurred boundary ~0.02 m wide**, never a clean line,
  sampled from `fbm2D` — red urajiro edges are slightly blurred in life; (c) whiskers: 6 per side,
  0.06–0.10 m, 0.002 m thick, from four whisker-pad dimples 0.006 m deep, all 12 merged into one
  36-triangle mesh; (d) the 0.001 m median forehead furrow (§3.1).

---

## 7. Signature props and wardrobe

Every prop is a child of a **named bone**, with `userData.propOf = '<boneName>'` so `Gore.js`
dismemberment takes the prop with the limb rather than leaving it floating.

1. **The hoodie (costume 0 indigo / costume 1 teal).** Owns the body silhouette above the waist.
   A soft shell offset **0.03 m** from the torso volumes (so the hoodie's chest half-width is
   `0.15 + 0.03 = 0.18` — this is the number the guard void in §2.5 is measured against), with a
   **cinched ribbed hem** at `M y = 1.02` (0.05 m tall, drawn in to 0.30 m diameter), **raglan
   sleeve seams** as 0.003 m piping shoulder-to-armpit, a **kangaroo pocket** (0.20 × 0.13,
   0.025 m proud, opening slits at both ends with a 0.006 m lip), and a **hood bunched behind the
   neck** — a torus-ish roll 0.24 wide × 0.11 tall at `M(−0.16, 1.34)` which must **not** rise
   above `M y = 1.42` or it fights the head. Cuffs ribbed, overlapping the wrist 0.04 m. Two
   drawstrings, real tubes with aglets, hanging 0.11 m and 0.14 m (unequal), 2-bone spring each.
   *Rig:* body shell → `torso`; sleeves → `armL/armR` with the elbow section skinned to
   `forearmL/R`; cuffs → `forearmL/R`; drawstrings → `torso`.
2. **Crossbody pouch** — mesh parented to the **`pouch` bone**, whose pivot stays at
   `torso`-relative `(0.10, 0.04, 0.20)` so the engine's existing extras spring-follow sway still
   reads. `0.17 × 0.15 × 0.10` rounded box, buckled flap, **blank gold token disc as the closure
   button** (0.05 m, milled edge, no letter, no denomination, no symbol — §9). Strap 0.05 m wide
   running shoulder-R to hip-L at 35° from vertical, with a visible slide-buckle and 0.02 m of
   spare tail.
3. **Chest ruff** — wardrobe even though it is fur: a collar of long cream fur bursting out of the
   hoodie neckline, 0.06 m proud, 12–16 geometry clumps merged into one mesh on `torso`. It hides
   the neck seam and is the second-brightest mass on the model. **Hard constraint (§2.5): forward
   of `M x = +0.05` it may not rise above `M y = 1.26`; behind `M x = 0.00` it may rise to
   `M y = 1.42`.** That is what preserves the under-chin gap.
4. **Beanie (costume 1 only).** Parented to `head`. **Rolled brim at `M y = 1.56`, crown top at
   `M y = 1.68` — it must not reach the ear-notch floor at `M y = 1.70`.** (The old spec put the
   crown at 1.72 and a 0.05 m pompom on top of that, which filled the single most important
   negative space on the model.) Rolled brim 0.045 m, **two cut-outs the ears pass through at
   `M z = ±0.10`** so the ears stay erect. **The pompom moves to the back of the crown at
   `M(−0.12, 1.60)`** on a 2-bone spring, and must never enter the volume above `M y = 1.68`
   between `M z = ±0.10`.
5. **Crystal paws** (`crystalPaw`-named meshes, on `forearmL/R`). Rebuild as a faceted
   **icosahedral cluster** — 5 interpenetrating elongated crystals, 0.16–0.24 m long, radiating
   forward from the paw — rather than the current cube. `visible = false` at build;
   `setCrystalPaws()` keeps working unchanged; skip their skinning/frustum cost while hidden.
6. **Nothing else.** No cap, no chain, no sunglasses. Dogey's parody value is his *face*; every
   prop above the shoulders competes with the read.

**Dismemberment rules:** the head must survive detachment as a self-contained assembly (skull,
jaw, ears, eyes, brows, ruff collar) with a capped, geometry-filled neck stump. Ears and tail
detach as their own pieces. The pouch detaches from the torso and ragdolls on its strap.

---

## 8. Expression and motion notes

**Face poses** (deltas from the §3 neutral):

| Pose | Brow inner | Lids | Eye / gaze | Mouth | Ears |
|---|---|---|---|---|---|
| **Idle** | 0.000 (the 10.5° inverted V) | upper 26% | side-eye: 0.012 m travel → 0.030 trailing / 0.006 leading sclera | closed, corners +0.014 | erect, 12° forward |
| **Taunt** | **+0.020** (max) | upper 14% (wide) | head yaw to 55°, eye yaw stays clamped at 13° → trailing crescent widens to 0.034 | corners +0.022, mouth cracks 0.008 to show a sliver of teeth | flick back 25° then snap up, 15% overshoot |
| **Angry / attack** | **−0.016** (V flattens, then inverts to 17° outer-up) | upper 40%, lower 16% — a narrowed slot | eye yaw → 0, sclera 0.018 each side, pupils dilate to 0.030 | jaw drops 22°, tongue and canines visible, lip line pulls back 0.012 | pin back 55°, flat to the skull |
| **Hurt** | **+0.018** (peak concern) | upper 5% — eyes flare, full sclera ring | pupils shrink to 0.016, gaze snaps off-axis (eye yaw to the ±13° clamp) | jaw 18°, tongue out and slack | one ear pinned, one flopped forward — the only sanctioned ear asymmetry |
| **KO** | +0.014, held | upper lid 88% closed, unequal L/R by 8% | irises roll up behind the lids | jaw 12°, tongue lolling 0.05 m to one side | both fully flat and back |
| **Blink** | — | 0 → 100% over 4f, hold 2f, open over 5f | — | — | — |

Blink cadence: every 2.4–4.0 s, randomised, plus a mandatory double-blink on every whiff recovery.

**Secondary motion** — spring solver per contract §11. Numbers, not adjectives:

| Chain | Joints | Natural freq | Damping ratio | Amplitude |
|---|---|---|---|---|
| Ear (each) | 2 | **9.0 Hz** | **0.45** | ≤8° on locomotion, ≤40° on impact; **leads** head rotation by ~1.5 frames, settles with one 18% overshoot |
| Tail | 5 | **3.2 Hz** at base → **1.6 Hz** at tip | **0.30** | Constant wag ±14° about Y at 2.2 Hz that **never stops, even in hurt and block**; doubles in rate on hit-confirm and on any coin/win event. Clamped per §4 so the hole survives |
| Chest ruff, breeches | 1 each | 5.0 Hz | 0.60 | ≤0.02 m travel, purely for weight |
| Hoodie hem | 2 | 6.5 Hz | 0.35 | Lifts on jump-rise, slaps down on landing |
| Drawstrings | 2 each | 8.0 Hz | 0.25 | — |
| Pouch | pendulum on strap | 1.8 Hz | 0.50 | Plus a 0.015 m secondary bounce |
| Cheek fluff | 1 | 14 Hz | 0.55 | ≤0.008 m, impacts only — this is what makes a hit *land* |

**Posture-driven personality:** he leans **in**, always. Idle sits at a forward CoM with the chest
0.04 m ahead of the hips and the back paw loaded. Walk is quick and light (breed standard: "light,
quick and energetic") — **stride 0.34 m at 2.6 steps/s, vertical bob 0.025 m**, with the head yaw
*holding steady on the camera while the body turns underneath it*. Never a heavy footfall; every
landing has a 2-frame absorb and a spring back up. Idle micro-loop: weight shifts foot to foot on a
1.9 s cycle, ears tick, tail wags, and every **~5 s the head yaws 6° further toward camera and the
brows go up 0.004 m** — the "you seeing this?" beat.

---

## 9. Parody safety (mandatory)

**Do not copy, reproduce, or reference:**

1. **The 13 Feb 2010 photograph itself.** A specific copyrighted work by **Atsuko Sato**. Do not
   use it, or any crop, trace, or filtered derivative, as a texture, decal, `decalTexture()`
   payload, UI portrait, loading screen, or arena poster. Do not reconstruct its framing or pose as
   a static in-game tableau. (An NFT of that image sold for ~$4 M to PleasrDAO in 2021; ownership
   is actively asserted.)
2. **The dog's name** (Kabosu) and the memorial statue in Japan. No name-drops in geometry,
   texture, material names, mesh names, or `userData`.
3. **The coin's marks.** dogecoin.com/trademarks claims the **name**, the **logo**, *and* the
   **slogans** ("wow much coin", "Do Only Good Everyday") on behalf of the Dogecoin Foundation. So:
   **no** "DOGE"/"Dogecoin"/"doge" wordmark anywhere on the model, **no** `Ð` glyph, **no**
   capital-D-over-a-coin device, **no** beige-Shiba-head-in-profile-on-a-brown-circle emblem, and
   **no** slogan text. The token disc is **blank with a milled edge**. If a face design is wanted
   later, use an abstract non-letterform mark that is ours (a paw notch, a 4-point star).
4. **The meme's caption grammar.** No "so/such/many/much/very + wrong noun" strings baked into
   geometry, textures, material names, or `DOGEY_MOVES` move names.
5. **Comic Sans.** Do not ship or reference the Microsoft font file, and do not render
   rainbow-Comic-Sans caption text as part of the *character's* geometry or textures. In-game
   captions are the UI layer's problem and the UI must use our own hand-drawn wonky sans.
6. **The coin's colourway.** Gold-and-brown coin livery is the coin's trade dress. Our accent
   colours are indigo/teal/plum and the only gold is a 0.05 m blank disc in a deliberately dulled
   `#C99A3A`.
7. **The composition.** Do not model a **sitting dog with crossed front paws viewed head-on** as
   the idle, the select-screen pose, or the victory pose. That composition *is* the photograph.
8. **The shipped id `dogey`** is a phonetic near-neighbour, not a wordmark. Do not render the
   string "DOGEY" in a Comic-Sans-alike, do not colour it rainbow, and do not place it on or beside
   a coin device. It is the *combination* that would create a trade-dress association.

**Deliberate deviations that keep us legally distinct while staying recognisable.** These are the
defence — state each one, with its number, in your report:

| # | Deviation | The measurement |
|---|---|---|
| D1 | Different medium, pose, and genre | A **bipedal, clothed, 1.70 m fighter**. The source is a quadruped dog sitting on a sofa. Transformative on its face. |
| D2 | Head enlarged off any real proportion | Body is **4.25 heads** tall against the ~7.5-head human canon — the head is **76% oversized** relative to a humanoid of this height, and Dogey is the most head-heavy fighter on the roster. |
| D3 | Muzzle shortened off breed-correct | AKC gives muzzle = **40%** of head length. Ours is **32%** — a deliberate **−20%** cartoon cut (0.176 → 0.140 m). |
| D4 | Ears oversized off breed-correct | **0.24 m against a breed-correct ~0.19 m** on this head — **+25%**. |
| D5 | Eyes enlarged and showing sclera | Aperture **0.222 × head width** against a real Shiba's ~0.15, and a **visible white crescent**, which a real Shiba effectively never shows. Cartoon choices, not measurements off a photograph. |
| D6 | The recognisable cues we *do* use are public-domain **breed** characteristics, not photographic ones | Erect triangular ears, urajiro cream masking, the *maki-o* curled tail, dark-tipped sesame guard hairs, obliquely-set eyes, cheek breadth — anyone may draw a Shiba Inu. The **brow pips** are the AKC standard's *"white spots above the eyes permitted on all colors but not required"*, which is why we carry the raised-eyebrow read on a **breed marking** rather than tracing an expression off a photo. |
| D7 | The side-eye is generated mechanically, not copied | It falls out of a **head-yaw + clamped look-at rig that exists for fighting-game camera reasons**, and it animates through many values in play (§8). It is a pose the rig produces, not a frame we traced. |
| D8 | Our own colourway and wardrobe | Indigo hoodie, plum crossbody pouch, cream/red-sesame fur in **our** hex values (§5). Nothing on him is coin livery. |
| D9 | The crossed-paws gesture is a beat, not a pose | It appears only as a **~12-frame beat inside the taunt**, read as a boxer's crossed guard dropping — never static, never head-on. |
| D10 | No coin, no letter, no glyph | The only disc on the model is **0.05 m, blank, milled**, in a gold deliberately dulled away from coin gold. |

---

## 10. Performance budget (contract §0 is a hard limit, not a suggestion)

The contract allows **≤250k triangles and <900 draw calls in a whole match scene** — two fighters,
an arena, crowd, VFX. The previous version of this brief asked for roughly 120 individually-placed
detail meshes and a 16-segment bevel on the skull, which would have blown the draw-call budget on
one character.

**Dogey's allocation:**

| | `high` | `medium` | `low` |
|---|---|---|---|
| Triangles | **≤ 24,000** | ≤ 12,000 | ≤ 6,000 |
| Draw calls | **≤ 40** | ≤ 28 | ≤ 16 |
| Head sub-assembly | ≤ 9,000 tris | ≤ 4,500 | ≤ 2,200 |

**Mandatory merge rules — one mesh per (bone × material), not one mesh per detail:**

- All fur clumps sharing a material merge into **one** `BufferGeometry` per bone:
  ruff → `torso`, breeches → `legL`/`legR`, tail clumps → `tail`, ear tufts → `earL`/`earR`.
  Never one mesh per clump.
- Whiskers: **one** merged mesh, 12 tapered 3-triangle wedges = 36 tris.
- Token knurls: modelled into the disc's edge ring and merged into the disc mesh, ≤ 260 tris total.
- Toe pads, claws, hoodie ribs, cable columns: merged into their parent's mesh.
- **Bevel segments: 4 for props, 6 for the skull and jaw. Never 16.** A rounded box at 6 segments
  is ~1,300 tris; at 16 it is ~9,000 for zero visible difference at a 122 px on-screen head.
- One material instance per §5 palette entry, via `pbr()`'s cache. Do not pass `overrides.unique`
  except on the damage-flash path.
- No `transmission` anywhere except the crystal paws, gated on `visible === true` **and**
  quality ≥ `high` (§6).

Measure with `renderer.info.render.calls` and `.triangles` on a frame with two Dogeys on screen,
and put both numbers in your report.

---

## 11. Reference notes

What was actually checked, and what each source drove. Facts below were verified; three claims in
the previous version of this brief were wrong and are corrected inline.

- **Know Your Meme, "Doge"** — **13 Feb 2010**, photographer **Atsuko Sato**, a kindergarten
  teacher; a **rescue-adopted Shiba Inu**; the shot is described as *"sitting on a couch while
  glaring sideways at the camera with raised eyebrows"*; posted to Sato's personal blog, spread via
  Reddit from 28 Oct 2010, and The Verge identified the dog in Dec 2013. The Comic Sans +
  broken-English convention consolidated on Tumblr/Reddit 2012–13. → §1 cue 1 and cue 2.
- **Washington Post / Spokesman-Review obituary, 24 May 2024** — the best physical description of
  the photograph found anywhere: the dog is *sitting on a sofa with paws crossed daintily in front
  of her, giving a skeptical side-eye to the camera*; "fluffy-faced"; died aged 18; Sato had
  rescued her in 2008 from a puppy mill. → §1, §3.7, §9.7, §9 D9.
- **Wikipedia, "Doge (meme)"** — Sato retains copyright of the photograph; PleasrDAO paid ~$4 M for
  the NFT in 2021; the coin launched Dec 2013. → §9.1.
- **dogecoin.com/trademarks** (checked directly) — the Dogecoin Foundation claims the **name**, the
  **logo**, and **slogans** including "wow much coin" and "Do Only Good Everyday". → §9.3, §9.4.
- **AKC Shiba Inu standard** (verbatim) — *"Muzzle length is 40% of the total head length from
  occiput to nose tip"*; *"Forehead is broad and flat with a slight furrow"*; *"Eyes are somewhat
  triangular in shape, deep set, and upward slanting toward the outside base of the ear. Iris is
  dark brown"*; *"Ears are triangular in shape, firmly pricked and small, but in proportion to head
  and body size"*; *"Stop is moderate"*; *"Double coated with the outer coat being stiff and
  straight and the undercoat soft and thick"*; *"Feet are catlike with well-arched toes fitting
  tightly together. Pads are thick"*; *"White spots above the eyes permitted on all colors but not
  required"*; males 14½–16½ in at withers, females 13½–15½ in; height:length **10:11**.
  → §3.1, §3.2, §3.3, §3.4, §3.5, §4.
  - **Correction 1.** The previous brief read "0.44 m" as *occiput→stop*. The standard's 40% is
    measured **occiput→nose tip**, so 0.44 m is the *whole head* and the muzzle is 0.176 m
    breed-correct. Every head coordinate in §3 was re-derived from that.
  - **Correction 2.** The previous brief called the brow pips "*mayuge*, an optional but common
    Shiba face marking" and coloured them cream by analogy with the AKC's black-and-tan tan points.
    The AKC's actual permission for **all** colours is for **white spots above the eyes**; the
    **oval tan spots over the eyes** are specifically a black-and-tan tan-point requirement. Our
    dog is red, so the pips are built at `urajiro-cream` value — which is both correct and the
    stronger legal position (§9 D6).
  - **Correction 3.** The previous brief said a sharper stop "reads as a Collie" and a softer one
    "reads as a Pug". That is inverted — Collies have almost no stop, Pugs have an extreme one.
    §3.1 now states the ramp angle and the correct failure directions.
- **The Kennel Club (UK) Japanese Shiba Inu standard** — *"head appears as a blunt triangle when
  viewed from above"*, *"broad flat skull, cheeks well developed"*, eyes *"relatively small,
  almond, obliquely set, well apart and dark brown"*, ears *"small, triangular, pricked and
  inclining slightly forward"*, tail *"set high, thick, carried curled or curved as a sickle"*,
  size 39.5 cm dogs / 36.5 cm bitches. (The KC's "almond" and the AKC's "triangular" describe the
  same eye from different angles — build triangular-leaning-almond.) → §3.1, §3.3, §3.5.
- **FCI / Nippo standard summary** — height:length 10:11; muzzle ≈ 40% of head length; chest depth
  ≈ half of withers height; *"high forehead, cheeks and stop defined with slight median furrow"*;
  *"straight muzzle bridge"*; **black eyelid rims**; urajiro on *"side of the muzzle and the
  cheeks, on the underjaw and upperthroat, on the chest, the abdomen and the lower part of the
  legs"*; tail when extended almost reaches the hock. → §3.1, §3.3, §5 urajiro placement map.
- **Nihon Ken blog, "Tails"** — ***maki-o*** (full curl, tip crosses below the backline) vs
  ***sashi-o*** (sickle); the ideal *maki-o* shows daylight through the curl, "a space at least the
  size of a ping-pong ball" / "big enough to fit an egg". → the tail-hole spec in §2.4 and §4,
  which is the character's key negative shape. **Correction 4:** the previous brief's tail numbers
  (outer 0.34, tube 0.10, hole 0.09) are arithmetically impossible — `0.34 − 2(0.10) = 0.14`.
  §4 now states major radius, tube diameter and enclosed void, and they agree.
- **Shiba coat-genetics sources** — the red gene *"always lightens towards the belly"*; red urajiro
  edges are *"slightly blurred"*, not sharp; red sesame = red base with smooth black tips covering
  under half the outer coat; outer coat stiff and straight, undercoat plush. → §5 gradient logic
  and §6's noisy-boundary rule.
- **Kaminski, Waller, Diogo, Hartstone-Rose & Burrows, "Evolution of facial muscle anatomy in
  dogs", PNAS 116(29), 2019** — the *levator anguli oculi medialis* is uniformly present in dogs,
  near-absent in wolves, and exists to raise the **inner** eyebrow; dogs produce the movement more
  often and more intensely than wolves; it increases paedomorphism and reads to humans as concern.
  → the anatomical justification for the inverted-V brow in §3.4, and the reason the **inner** end
  is the end that travels.
- **Existing `src/characters/dogey.js`** (read in full: `buildDogeyModel`, palette `C`,
  `DOGEY_MOVES`, `DogeyDef`) — source of the bone map, `HIP_Y = 0.92`, `height 1.7`, the costume
  branches, `crystalPaw` naming, and the move `forward` reach constants that must be re-verified if
  arm lengths change. Three things in the current build actively fight the parody and are corrected
  above: **one floppy ear** (§3.5), **an open lolling-tongue mouth** (§3.6), and an **orange hoodie
  on orange fur** (§5).

---

## 12. Definition of done for this character (contract §12 in local terms)

1. **Black-fill at 128 px, at azimuth 0° and ±25°**: two separate ear spikes with sky between
   them, the tail hole open, the muzzle wedge stepping out of the cheek. Measure the ear-apex
   separation on the render — it must be ≥12 px.
2. **Head screenshot from the actual match camera**: the trailing sclera crescent measures
   **≥5 px** at a 1080p framing, the leading crescent is present but thin, the cream mask is
   **≥55% of the head's visible pixel area**, and the nose is the darkest point on the face.
3. **Clearance checks pass**: eyeball ≥0.004 m inside the skull surface (§3.3); chin 0.09 m clear
   of the withers (§4); under-chin gap 0.04 m (§2.5); beanie and pompom entirely below
   `M y = 1.68` between `M z = ±0.10` (§7.4).
4. **No gaps** at neck, wrists, ankles or ear bases in any frame of `hodlForever` (the longest
   clip).
5. **Budget met**: `renderer.info.render` reports ≤24,000 triangles and ≤40 draw calls for one
   Dogey at `high`. Both numbers go in the report.
6. **Stance re-verified**: every clip's foot keys and the IK foot-planting pass still work with the
   0.34 m fore-aft stagger, and `HIP_Y` is untouched.
7. `npm run build` clean, `window.__errs` empty, frame time within 15%.
8. Report lists, by number, the **§9 D1–D10 deviations** you actually implemented.
