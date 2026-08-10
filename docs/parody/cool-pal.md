# COOL PAL — parody likeness brief

**Fighter:** `src/characters/cool-pal.js` · **Source archetype:** the "unbothered / lowkey
doesn't care" internet-guy attitude, embodied in the animal the internet actually elected as its
mascot of serenity — the **capybara** (*Hydrochoerus hydrochaeris*).
**Owner of this file's implementation:** the COOL PAL character agent, exclusively.

Read `GRAPHICS_CONTRACT.md` §0, §3, §4, §9, §11, §12 before you start. This brief is the
research; the contract is the law. Where they disagree, the contract wins.

> **The one-line thesis.** Cool Pal is not "a brown animal in casual clothes being chill." He is
> **a semi-aquatic grazing rodent skull carried level at chest height on a barrel** — a
> horizontal brick with the nostrils on *top*, the eyes small and far back, and two coin-sized
> ears at the rear corners. Get the head brick right and the parody lands from across the room.
> Get it wrong and you have a bear.

---

### Hard constraints inherited from the current file (do not break)

- **Bone map** returned by `buildModel()` must keep, *exactly and by name*: `hips, torso, head,
  armL, armR, forearmL, forearmR, legL, legR, earL, earR, phones`. Every clip in `clips`
  indexes these strings. You **may add** new bones (`jaw`, `lidL`, `lidR`, `tail`, `bird`,
  `belly`, `vestHem`) — additive bones are how DOGEY solved the same problem — but you may not
  rename, remove, or re-parent any of the twelve.
- **There are no shin bones.** `legL` / `legR` are single rigid segments from hip to sandal. Do
  not author geometry that needs a knee joint to not break. All knee "bend" must come from
  silhouette shaping and the pant cloth, not articulation.
- `HIP_Y = 0.85` (`const HIP = [0, 0.85, 0]`) and `SIT = [0, 0.34, 0]`. Every `hips` position
  key in `clips` is authored against those two numbers. If you move the hips you must re-derive
  **every** hips key in all 33 clips.
- `CharacterDef.height = 1.8`, `weight = 1.25`. **1.80 m is the skull crown.** Ear tips and the
  headphone band are allowed to poke above it; hurtboxes do not follow them. (The roster brief
  says "~2.0 m fighter"; that is the roster's tall end — Wally. Cool Pal is 1.8. Use 1.8.)
- `buildModel(costume)` must keep answering costume `0` and `1`.
- The `phones` bone is a **weapon**. `headphone-swing` (`forward+light`, launcher, `hitbox
  {w:1.0, h:1.5, d:0.9, forward:0.9, up:1.2}`) swings it. The headphones must be a rigid,
  chunky, swingable mass with real thickness — not a decorative decal.
- **Move reach constants you will invalidate if you change limb lengths.** Re-verify all of
  these against the harness after the rebuild: `lazy-palm` `forward 1.0 / up 1.1`; `slow-kick`
  `forward 1.0 / up 0.9`; `shoulder-lean` `forward 0.8 / up 1.0`; `headphone-swing`
  `forward 0.9 / up 1.2`; `do-not-disturb` `forward 0.9 / up 1.1`.
- Model **faces +X**. Feet at `y = 0`. **`+Z` is the character's left.** The match camera sits
  roughly on the ±Z axis — **the player sees Cool Pal in profile.** Every decision below is
  made for the profile read first, the 3/4 read second, and the head-on read never.
- All coordinates in this brief are **metres in model space, measured from the floor between
  the feet** (so `y = 1.675` means 1.675 m above the floor), unless a coordinate is explicitly
  labelled bone-local.
- Everything currently built with `lamb()` (`MeshLambertMaterial`, `flatShading: true`) must go.
  Per contract §4 the whole model moves to `pbr()` with `SURFACE` presets and `flatShading` off
  by default. Faceting now comes from **bevelled geometry**, not flat normals.

### What the current build gets wrong (fix list, ranked)

1. **The nose is on the front of the face** (`box(0.10, 0.08, 0.15, noseM, 0.475, 0.13, 0)`).
   Capybara nostrils are **dorsal — on the top plane of the snout**. This single error is why
   the current model reads as a generic bear/dog loaf. It is the highest-value fix on the file.
2. **The skull is a squashed sphere with a box glued to it** (`sph(0.27, …, 1.25, 0.9, 0.95)` +
   `box(0.30, 0.24, 0.28, …)`). Capybara skulls are *rectangular*, and the braincase-to-rostrum
   transition in *H. hydrochaeris* is **straight** — one continuous near-flat top plane from the
   ears to the nose. Right now there is a visible step and a spherical crown.
3. **The ears are boxes at `y = +0.32` above the head bone, only `0.02` forward** — i.e. on top,
   like a bear's. Capybara pinnae sit at the **rear-top corners of the skull**, behind the eyes,
   and they are **discs, not blocks**.
4. **The eyes are slits at `x = 0.275`** — too far forward and too low. They belong high, and
   far enough back that in profile the eye is on the braincase, not the muzzle.
5. **No morrillo.** The bare oval scent-gland dome on top of the male's snout is free
   public-domain anatomy that instantly reads "capybara" to anyone who knows the animal, and
   reads as "a weird cool nose bump" to everyone else. Add it.
6. **The tail is entirely absent.** Correct anatomy is *vestigial*, not *nonexistent* — a
   deliberate 0.05 m nub is funnier and more accurate than nothing.
7. **Two toes per foot** (`box(0.05,…, 0.19,-0.77, ±0.055)` × 2). Capybaras have **four toes
   front, three behind**. Free specificity.
8. **Shoulder sockets at `z = ±0.42`** on a 0.83 m torso — the arms are pinned outboard of the
   widest point of the body, so the belly stops being the widest mass and he reads as a gorilla.
   Move them to `±0.30`. Note this does **not** open a pocket-triangle void; the old draft
   claimed it would, and §2 shows the arithmetic proving it cannot.
9. **`furM` is one flat colour over the whole body.** Capybara pelage is *sparse and coarse
   enough that the skin shows through it*, with dark markings on face, outer limbs and rump.
   This is a texture opportunity the current file spends nothing on.
10. **There is no yuzu.** The one accessory that names the reference is absent from both the
    current file and the previous draft of this brief. See §7.0 — build it first, not last.
11. **The headphones sit on the ears.** Over-ear cups on rear-set capybara pinnae erase the two
    ear nubs that §2 requires to survive the 128 px silhouette. They move to the shoulders (§7.4),
    which also frees the crown for item 10 and better matches the existing `headphone-swing`
    hitbox height.
12. **The nose has no rhinarium.** There is no dark hairless nose pad anywhere in the current
    file or the old draft, so the blunt front plane terminates in the same value as the rest of
    the head. §3.2a adds it, and it is the second-largest dark shape on the model.

---

## 1. The 2-second test

**A brown brick of a head, carried dead level at chest height, with a perfectly straight top
line running from two coin-sized ears at the back corners all the way to a blunt vertical nose
plane — no snout taper, no muzzle dip, no visible neck — punctuated by one bare dark oval bump
on top of the snout and two nostril slits *on the top surface*, under two small half-shut eyes
set high and far back; all of it sitting on a barrel that is widest at the belly, on legs that
are 40% of the body height, with both paws sunk into the pockets of loose canvas trousers and
the weight dumped onto one hip.** That is the whole read. It is a *rodent* read, not a bear or
dog read, and the thing that makes it a rodent read is **flat-topped horizontality**: the eye
travels in a straight line from ear to nose tip without ever going up over a forehead or down
into a muzzle.

**And on top of that ruler-flat head, one whole yuzu, balanced, unheld, unacknowledged.** This is
the single detail that carries the reference and it is specified in §7.0. The capybara-serenity
meme is not "a capybara"; it is *the capybara in the winter bath with a citrus fruit sitting on
its head and its eyes half shut*. Species is the vehicle; the fruit-on-the-flat-head is the
punchline, and it is also the **proof of the geometry** — only a head with a genuinely flat top
plane can hold a sphere. If the head brick is wrong the fruit rolls off, and the viewer can see
that it would. Build the fruit and the brick as one idea.

The secondary read, one beat later, is the attitude: **shoulders dropped, one hip loaded, head
tilted 7° toward the camera, eyes 52% covered by the upper lid, a drink parked in a belt holster
he never has to hold, headphones slung round the shoulders rather than worn, and a small bird
standing on his shoulder that he has not noticed and will not acknowledge.** He is the only
fighter in the roster whose idle looks like he is waiting for a bus.

If a player black-fills the model and cannot say "that's the chill capybara" from the flat-top
head brick, the yuzu sitting on it and the two rear ear nubs, the rebuild has failed. Do not
spend detail budget anywhere else until the head brick is right.

> **Note on what does *not* carry at 128 px.** The hands-in-pockets read does not survive black
> fill in the profile camera — see §2's negative-space section, where the arm kinematics are
> solved and the honest answer is written down. Do not budget silhouette work against it.

---

## 2. Silhouette specification

**Head unit `H = 0.36 m`** — jaw underside `y = 1.44` to skull crown `y = 1.80`.
Total fighter height `1.80 m = 5.0 H` exactly. Use `H` as your working unit.

The critical proportion is *not* the head height. It is the **head length**:

> **Head length `L = 0.54 m = 1.50 H = 0.30 × total height.`**
> The head is half again as long as it is tall. Nothing else in the roster is shaped like this.
> A real capybara's skull is ~226 mm on a 1200 mm head-body length (~19%); ours is 30% of
> standing height, deliberately cartooned up (see §9).

Longitudinal split of `L`, taken from published capybara skull morphometrics (facial part
137.90 mm : cranial part 87.76 mm → **61.1% : 38.9%**):

| segment | fraction of `L` | metres | model x-range |
|---|---|---|---|
| braincase (rear plate → brow break) | 38.9% | 0.210 | `x = −0.16 … +0.05` |
| rostrum / muzzle block (brow break → nose plane) | 61.1% | 0.330 | `x = +0.05 … +0.38` |

**Keep the 61/39 split.** It is the anatomy, it is free, and it is what makes the head read as a
grazing rodent instead of a carnivore.

### Vertical stack (metres, and as fractions of the 1.80 m height)

| y | fraction | landmark |
|---|---|---|
| 0.000 | 0.000 | floor, sole underside |
| 0.018 | 0.010 | sandal outsole top (outsole 0.018 thick) |
| 0.040 | 0.022 | sandal footbed top — **the sole of the foot rests here** (footbed 0.022 thick) |
| 0.100 | 0.056 | ankle (bottom of `legL/legR` visual) |
| 0.300 | 0.167 | rolled trouser cuff — bare furry ankle below it |
| 0.420 | 0.233 | visual knee line (no bone — cloth break only) |
| 0.720 | 0.400 | hip crease / crotch. **Leg length = 40.0% of height.** |
| 0.799 | 0.444 | pocket-mouth **lower** corner |
| 0.850 | 0.472 | `hips` bone (locked, `HIP_Y`) |
| 0.865 | 0.481 | drink-holster socket |
| 0.878 | 0.488 | **pocket-mouth centre — the wrist crosses the welt here** (see §4, §7.2) |
| 0.940 | 0.522 | belly underside (lowest bare-fur point; cardigan must stop above this) |
| 0.957 | 0.532 | pocket-mouth **upper** corner |
| 0.970 | 0.539 | `torso` bone / knit hem |
| 1.060 | 0.589 | **belly widest, 0.76 m across — the widest point on the model** |
| 1.103 | 0.613 | elbow centres, `z = ±0.377` — **tangent to the belly surface** (§4) |
| 1.240 | 0.689 | chest widest, 0.66 m across |
| 1.300 | 0.722 | slung headphone cup centres, `x = +0.224, z = ±0.269` (§7.4) |
| 1.350 | 0.750 | shoulder ball centres, `z = ±0.30` |
| 1.400 | 0.778 | top of shoulder mass — **there is no neck; the head sits on this**; slung headphone band apex rests here at `x = −0.170` |
| 1.440 | 0.800 | `head` bone / jaw underside (chin) |
| 1.475 | 0.819 | bird's head, when the bird stands on the shoulder (feet at 1.400) |
| 1.505 | 0.836 | mouth line |
| 1.675 | 0.931 | **eye centres** (0.653 H above the chin) |
| 1.735 | 0.964 | muzzle top plane at the nose end |
| 1.772 | 0.984 | snout top plane under the morrillo (`x = +0.15`) |
| 1.788 | 0.993 | skull top plane at the brow break (`x = +0.05`) |
| 1.800 | 1.000 | **skull crown, at the rear of the braincase — gameplay height** |
| 1.845 | 1.025 | ear tips (allowed above; hurtbox ignores) |
| 1.870 | 1.039 | bird's head, on the crown perch (feet at 1.795, `x = −0.10`) |
| 1.873 | 1.041 | **top of the yuzu** (centre `x = +0.04, y = 1.828`, Ø 0.090) — allowed above |

**The crown is at the rear.** `y = 1.800` is the *rearmost* point of the braincase top plane; the
plane then falls forward at −3.3° to the brow break at `y = 1.788` and at −9.1° from there to the
nose end at `y = 1.735`. Nothing on the head is higher than 1.800 except the ear tips, the bird
and the yuzu, all of which the hurtbox ignores. `CharacterDef.height = 1.8` is therefore exact.

Leg length at **40% of height** is the second-strongest cue after the head. A human is 47–50%.
Do not let it drift above 42% — the moment the legs get long he stops reading as a stumpy
semi-aquatic barrel and starts reading as a bear.

### Horizontal mass (profile — this is the camera you actually have)

Depth is what the player sees, so author the profile first.

- **Belly bulges forward and down.** Front-most torso point is `x = +0.32` at `y = 1.02` — below
  and *in front of* the chest (`x = +0.26` at `y = 1.24`). The profile of the torso is a
  forward-tipped egg, fat end low. Rear of torso `x = −0.26`.
- **Chest depth 0.50 m, belly depth 0.58 m.** Belly wins in both axes.
- **Head projects forward past the chest by 0.12 m.** Nose plane at `x = +0.38`, chest front at
  `x = +0.26`. This is non-negotiable — see the negative-space wedge below.
- **Rump is nearly vertical** and slightly overhangs: rear of hips `x = −0.28` at `y = 0.88`,
  tucking to `x = −0.20` at the crotch. Capybaras have a squared-off back end.
- Front-to-back, nose plane to rump plane: **0.66 m = 1.22 L**. Including the tail nub (rear face
  at `x = −0.305`) it is **0.685 m**. Including the forward-tilted tumbler rim (`x = +0.412`, §7.1)
  the model's total X extent is **0.717 m**; size the hurtbox depth against 0.66, not 0.717 —
  the drink is decoration and must not be hittable.

### Horizontal mass (front — matters for the 3/4 and for hitbox sanity)

- Belly 0.76 (`z = ±0.38`) · chest 0.66 (`z = ±0.33`) · shoulders 0.64 (`z = ±0.32`, sockets at
  `±0.30`) · hips 0.62 · head 0.34 · muzzle 0.28 · stance 0.44 measured at the sandals.
- **The belly is wider than the shoulders.** That inversion is the barrel, and it is the reason
  the sockets come in from the current `z = ±0.42` to `±0.30`: at `±0.42` the arms hang *outboard
  of everything*, the belly stops being the widest mass, and he reads as a gorilla. Moving them
  to `±0.30` restores the inversion.
- **What moving the sockets does *not* buy you is a proud elbow.** The old draft of this brief
  claimed the inboard sockets would open a pocket-triangle void. They do not — with a 0.500 m
  two-segment arm and a 0.76 m belly the elbow cannot clear the barrel in any view. The
  kinematics are solved in the negative-space section below; read it before you pose the arms.

### The 128 px black-fill read

At 128 px the 1.80 m figure occupies ~110 px, so **1 px ≈ 16 mm**. Anything thinner than 32 mm
is gone. What must survive:

1. **The straight top line of the head**, 0.54 m long → 34 px of unbroken horizontal edge,
   interrupted only by the morrillo bump (0.022 m proud → ~1.5 px — sub-threshold on its own,
   so *exaggerate the morrillo to 0.034 m proud*, giving 2 px; it reads as a deliberate lump on
   an otherwise ruler-straight line, which is the whole joke).
2. **The two ear nubs.** Anatomically correct pinnae would be ~3 px. **Oversize the ears ~40%
   over anatomical** to `0.075 m tall × 0.062 wide`, breaking the crown line by `0.045 m` → each
   ear is a ~5 × 4 px bump clearing the crown by 3 px. Two bumps at the *rear* corners with a
   long flat run in front of them is the signature; ears in the middle of the skull is a bear.
3. **The blunt vertical nose plane.** 0.235 m of near-vertical front face → 14 px of hard
   vertical edge terminating the head. No taper, no point, no ball. If the muzzle tapers to a
   snout you have built a rat.
4. **The yuzu.** A 0.090 m sphere sitting on the flat top plane → a **5.5 px ball** parked on a
   34 px straight line, clearing the crown by 0.073 m (4.5 px). At 128 px this is the loudest
   event on the model after the head brick itself, and it is the one that names the reference.
   See §7.0. It replaces the pocket triangles as read #4.
5. **The belly-forward barrel**, reading as a wider mass low and forward.
6. **The drink in the hip holster** — a 0.088 m tumbler, tilted forward 14°, whose rim reaches
   `x = +0.412` against a belly front of `x = +0.320`. It stands **0.092 m (5.6 px) proud of the
   torso outline** and is 0.20 m (12 px) tall. *Untilted and set back at `x = +0.28` — as the old
   draft specified — the tumbler cleared the belly by 0.004 m, i.e. a quarter of a pixel, and
   broke nothing.* The forward tilt is what makes this read, and it also puts the citrus wheel
   (the only saturated warm on the model) on the silhouette edge.
7. **The two rear ear nubs must not be occluded by the headphones.** A 0.200 m over-ear cup
   centred on an ear at `x = −0.120` swallows read #2 completely. This is why the headphones are
   slung around the shoulders and not worn on the head — see §7.4.

**Not on this list, deliberately:** the pocket triangles, the hooked thumb, the morrillo's
specular pip, the nostrils, the whiskers, the tail nub and the bird. Each of those is a 1 m or
30 cm detail. Every one is worth building; none of them is worth a silhouette compromise.

### Negative space (this defines the shape more than the mass does)

- **The throat wedge — the most important void on the model.** Because the head is carried level
  and thrust forward with no neck, there is a triangular gap between the muzzle underside
  (`x=+0.36, y=1.50`), the chin (`x=+0.14, y=1.44`) and the chest front (`x=+0.26, y=1.31`).
  **Minimum clear height 0.10 m in every frame of every clip.** If this wedge closes, the head
  merges into the body and the brick disappears. Check it in `napTime`, `sitDodge`, `crouch`,
  `knockdown` and `hitHeavy` specifically.
- **The arms: there is no pocket-triangle void, and you must stop trying to build one.**
  Solve it before you pose anything. Shoulder ball `(0, 1.350, ±0.300)`; upper arm 0.260 +
  forearm 0.240 = **0.500 m of maximum reach to the wrist**. The trouser surface at the hip is
  at `x = +0.128` when `z = ±0.290`. For the wrist to sit on that surface it must be
  `|Δ| = 0.472 m` from the shoulder ball, which is inside reach and puts the **elbow flexed 38°**
  — *not* the 24° an earlier draft claimed. Two consequences, both non-negotiable:
  1. **The old pocket position was unreachable.** A pocket mouth at `(+0.140, 0.780, ±0.190)` is
     `0.597 m` from the shoulder ball against 0.500 m of arm. The paws could not have got into
     the pockets at all. The pocket moves to `(+0.128, 0.878, ±0.290)` (§7.2).
  2. **The elbow cannot stand proud of the belly.** With the wrist fixed on the hip, the elbow is
     confined to a circle of radius `0.260·sin 18.4° = 0.082 m` about the shoulder–wrist axis.
     Swung fully outboard it lands at `(+0.067, 1.103, ±0.377)`. The belly half-width at
     `y = 1.103` is `0.3765`. **The elbow is tangent to the belly, ±0.010 m.** No socket position,
     no flex angle and no belly width in this brief produces the 0.09 m clearance the old draft
     demanded. In the profile camera the arms are *entirely inside* the torso outline.

  So build what is actually there: **a tangent corner, not a void.** The elbow interrupts the
  belly's smooth curve with a hard corner (chamfer it at 0.018, tighter than the 0.035 used
  elsewhere, so the corner survives). Separate arm from belly with **material and light, not
  negative space** — you have four tools and you should use all four:
  - the `faceDark` **outer-forelimb stripe** (real capybara marking, already in the §5 palette,
    0.23 luma against a 0.65 belly — a 0.42 value break down the arm's outboard edge);
  - the **cyan rim** (§5) catching the elbow corner, which is the outermost point on that side;
  - the cardigan sleeve's **rolled cuff standing 0.020 proud** and a **0.015-proud sleeve seam**
    at the shoulder, giving two hard cross-arm edges;
  - a **contact-AO band** 0.030 wide, darkened 18%, where the forearm lies against the belly
    (contract §0.1 requires occlusion in crevices; this is the crevice).

  Verify by screenshot, not by intention: in the 3/4 render the arm must separate from the belly.
  In the profile render it will not, and that is correct.
- **The pocket read is a 1 m read.** At arm's length the two welts, the wrist entering the cloth
  and the hooked thumb all read clearly. At 128 px they are 1–2 px and they are gone. The pose at
  silhouette scale is carried instead by **the absence of dangling arms** — an unbroken barrel
  outline with nothing hanging off it — plus the dropped shoulder line (0.020 drop, −5° roll) and
  the loaded-hip contrapposto. A fighter with no visible arms in his idle silhouette is itself a
  strong and unusual read in this roster; lean on it rather than fighting it.
- **The ear slot.** A 0.02 m gap between the inner ear edge and the crown. Too fine at 128 px,
  so do not rely on it — the ears must clear the *crown line*, which is what actually reads.
- **The leg slot.** 0.14 m wide × 0.30 m tall from the crotch down, widening to 0.20 m below the
  trouser cuff where the ankles are thin. Do not let the baggy trousers close it.
- **Under the belly.** The belly's lowest point (`y = 0.94`) sits 0.22 m above the crotch, so
  there is a shallow arch between the belly underside and the thighs. Keep it — it stops the
  torso and legs reading as one lump.

---

## 3. Head construction

This is 60% of the character. Build it as a **bevelled rectangular prism system**, not as
spheres. Every box below gets a **0.035 m chamfer** on all edges unless stated otherwise
(contract §0.4: nothing reads as a raw `BoxGeometry`). Use a rounded-box generator or a
`BoxGeometry` + explicit bevel ring; do not fake it with a scaled sphere.

`head` bone origin: `x = +0.06, y = 1.44` (world), i.e. roughly where it is today
(`torso`-local `(0.08, 0.44, 0)`). Keep it there so the existing head keys still read sanely.

### 3.1 Skull planes and volumes

Two blocks, fused, sharing one near-continuous top plane. *H. hydrochaeris* has a **straight**
braincase-to-rostrum transition (its sister species *H. isthmius* has the ventrally-inclined
snout — do not build that one).

**Block A — braincase.** `x ∈ [−0.16, +0.05]` (0.210 long), `z = ±0.170` (0.340 wide),
`y ∈ [1.52, 1.788]` (0.268 tall at the brow break). Top plane runs from **`y = 1.800` at the rear
plate to `y = 1.788` at the brow break — a −3.3° slope. Essentially flat.** `y = 1.800` is
`CharacterDef.height`; nothing on the skull is above it. Side planes are vertical, splayed out
only 2° toward the top (the zygomatic arches are wide and the skull is cheeky). Rear plate is a
single vertical face at `x = −0.16`, chamfered 0.05 into the crown; it is where the head meets
the shoulder mass and must be sleeved by the shoulder fur (§4) so no gap opens on head turns.

**Block B — rostrum / muzzle.** `x ∈ [+0.05, +0.38]` (0.330 long). Cross-section tapers gently:
- at `x = +0.05`: width 0.300, height 0.250 (`y ∈ [1.538, 1.788]`)
- at `x = +0.38`: width 0.262, height 0.235 (`y ∈ [1.500, 1.735]`)
That is a **−13% width taper over the whole muzzle** and a **−6% height taper**. Almost none.
Muzzles that taper more than 15% in width stop reading as capybara — you are at 13%, so do not
add any more.
- **Top plane of B:** `y = 1.788 → 1.735` over 0.330 → **−9.1°**. Combined with block A's −3.3°,
  the total break at the brow is **5.8°**. That is the entire "forehead". There is no stop, no
  dome, no brow shelf.
- **The top plane is a load-bearing surface.** The yuzu (§7.0) sits in a 0.006 seat dimple on
  block A at `x = +0.04`, where the plane is at `y = 1.789`. Build block A's top as a genuinely
  planar face — if you crown it, dome it, or let a bevel eat into the middle of it, the fruit
  will float or intersect and the single most important accessory on the model will look broken.
- **Bottom plane of B (the upper-lip plane):** `y = 1.538 → 1.500` → −6.6°, nearly parallel to
  the top. **Parallel top and bottom planes = brick.**
- **Front plane:** a single flat face at `x = +0.38`, 0.235 tall × 0.262 wide, **tilted back 8°
  from vertical** (top edge 0.033 forward of the bottom edge). Chamfer the front plane's four
  edges at 0.045 — a *larger* bevel than the rest, so the nose end reads soft-but-square rather
  than sharp. This face is the terminal punctuation of the whole silhouette; get it flat.

**Cheek mass.** A soft lateral pad from `x = −0.06 … +0.14`, `y = 1.50 … 1.66`, standing 0.018
proud of the side plane, blending out over 0.06. Capybara cheeks are heavy (all those
ever-growing cheek teeth). It gives the profile a slight fullness under the eye without
turning the skull into an oval.

**Jaw.** Add a `jaw` bone at `x = +0.10, y = 1.52` (bone-local zero = closed). It drives only
block B's bottom plate plus the lower lip and the two lower incisors. Max open **14°** — this
is a grazing herbivore, not a screamer. Used in `yawnPush`, `taunt`, `hitHeavy`, `knockdown`.

### 3.2 The rhinarium and the nostrils — build these before anything else

Two separate things, and the old draft only had one of them.

**(a) The rhinarium.** A capybara's muzzle terminates in a broad, dark, hairless nose pad that
wraps the front-top corner of the snout. The old draft specified the front plane as bare
geometry and gave the nose no colour token at all, which threw away the one dark mass at the
front end of the silhouette. Build it:

- A single hairless shell wrapping the **front-top corner** of block B: it covers the front plane
  from its top edge down **0.105** (45% of the 0.235 face height), and continues back along the
  top plane to `x = +0.255` (0.125 m aft of the nose plane).
- Width **0.238** at the front, leaving a 0.012 fur margin on each side; it narrows to 0.190
  where it ends on the top plane. Its rear boundary is a **soft 0.020 dithered edge**, not a
  drawn line — hair thins into skin, it does not stop.
- Stands **0.006 proud** of the surrounding fur with a 0.008 fillet at the boundary.
- Colour `rhinarium` (§5, luma 0.20). Against `furBase` at 0.43 this is a **0.23 value drop**,
  which is what makes the blunt front plane terminate as a *dark* full stop rather than a
  same-value edge. It is the second-largest dark shape on the model after `faceDark`.
- Surfacing `skin-elephant` / `hide`, roughness 0.52, bump strength 0.5 — the crackled, faintly
  damp micro-texture of a mammalian nose. **Not** the waxy morrillo treatment: the rhinarium is
  matte-damp, the morrillo is semi-gloss. Those two surfaces sit 0.10 m apart on the same top
  plane and the contrast between them is a genuine 30 cm reward.

**(b) The nostril slits. Dorsal. On the top plane. Not on the front face.** Every source is
unanimous: eyes, ears and nostrils sit high on the head so the animal can stay submerged. This is
the anatomical fact that makes the parody legible and it is the thing the current file gets
exactly backwards.

- Two slits centred at `x = +0.325`, `z = ±0.055`, on the muzzle **top** plane at `y = 1.744`
  (block B's top plane runs 1.788 → 1.735 over `x = +0.05 … +0.38`; at `x = +0.325` that is
  `1.788 − (0.275/0.330)·0.053 = 1.744`). They sit **inside the rhinarium**, 0.070 m forward of
  its rear boundary.
- Each slit: **0.048 long × 0.019 wide**, a rounded-end capsule, splayed **18° outward** from
  the midline (front ends further apart than rear ends).
- Recessed **0.014** into the surface.
- Interior colour `mouthDark` (§5) at roughness 0.9; no specular sparkle inside the slit.
- **Flare on breathing/anger:** slit width scales 1.00 → 1.14, rhinarium scales 1.00 → 1.05.
  Drive it from the additive breathing layer at 0.28 Hz in idle, 0.9 Hz after a heavy hit.
- Viewed in profile (the actual camera) the nostril *slits* are **invisible** — you see only the
  rhinarium's 0.006 rise as a bump on the top line, and its dark mass capping the nose end. That
  is correct and desirable. The slits pay off on every 3/4 frame, on the taunt, and on the KO
  camera looking down.

### 3.3 The morrillo — the signature gland

The male capybara's scent gland: a **bare, dark, oval, hairless dome on top of the rostrum**.
Free, public-domain, unmistakable to anyone who has ever looked at a capybara, and reads as a
cool weird nose-lump to anyone who hasn't.

- Centre `x = +0.15`, on the muzzle top plane at `y = 1.772` (`1.788 − (0.10/0.330)·0.053`),
  `z = 0` (dead centre). It sits **0.105 m forward of the yuzu's seat** (§7.0) and 0.105 m aft of
  the rhinarium's rear edge, so the top plane reads front-to-back as: dark matte nose · flat fur ·
  dark waxy gland · flat fur · yellow fruit. Four events on a ruler-straight line. Do not crowd
  them.
- **0.115 long × 0.078 wide × 0.034 proud** (anatomical proud height would be ~0.020; we push to
  0.034 so it survives the 128 px silhouette test as a 2 px lump on the flat top line).
- Cross-section is a squashed half-ellipsoid with a **0.012 fillet** where it meets the snout —
  it grows out of the skin, it is not glued on.
- **Completely hairless**, colour `morrillo` (§5), and it is the only place on the animal with a
  *waxy* surface: roughness 0.34, a faint clearcoat at 0.15, no fur normal. Under a rim light it
  produces a single small specular pip on the top line of the head — a free, permanent read.
- Sexual dimorphism note: it is a male trait. Keep it on both costumes.

### 3.4 Eyes

Capybara eyes are **small, dark, round, set high and far back, and set laterally** — the orbit
is circular and sits well behind the muzzle. The unbothered read comes from the **lid**, not
from the eye size.

- **Eyeball diameter `D = 0.088 m` = 0.259 × head width (0.34).** (Anatomically correct would be
  ~0.18 × head width; we are 44% oversized. Cartoon choice — see §9.)
- Centre: `x = +0.02`, `y = 1.675`, `z = ±0.115`.
  - `y = 1.675` is **0.653 H above the chin** and only **0.115 below the skull top plane** (which
    at `x = +0.02` is `y = 1.790`) — the eye sits in the **top 35%** of the head's 0.36 m height.
    That is the "high on the head" cue.
  - `x = +0.02` puts the eye **0.36 m back from the nose plane = 67% of head length aft**. In
    profile the eye is on the **braincase**, never on the muzzle. If your eye is on the muzzle
    you have built a dog.
  - `z = ±0.115` → interocular 0.230 m = **0.68 × head width**. Wide, lateral set.
- **Protrusion — three nested radii, in this order.** The old draft asked for a lid of radius
  0.048 that also bulged 0.014 proud of the skull; that is geometrically impossible (a 0.048
  cap centred at `z = 0.115` reaches only `z = 0.163`, inside the 0.170 half-width). Build three
  distinct shells instead:
  1. **Eyeball**, radius 0.044, centre `z = ±0.115` → outer pole `z = ±0.159`, i.e. 0.011 *inside*
     the skull side plane.
  2. **Moving lid caps**, radius 0.048 about the eye centre → `z = ±0.163`, riding just clear of
     the ball. These are the `lidL`/`lidR` geometry and they rotate.
  3. **Orbital fur mound**, a *fixed* dome of radius **0.069** about the same centre → outer
     surface `z = ±0.184`, i.e. **0.014 proud of the skull side plane**. It is annular: it stands
     full height at its outer ring and falls back to `z = ±0.163` at the aperture rim, so the
     moving lids slide inside it without ever poking through. Blend it into the side plane over
     0.045.

  The mound, not the eyeball, is what catches the rim light and gives the head a readable eye in
  pure profile. Check the three radii against each other in your build — 0.044 < 0.048 < 0.069,
  concentric, no interpenetration.
- **Geometry (contract §9 demands real eye geometry, not painted quads):**
  - sclera sphere `D = 0.088`, colour `sclera` — a warm dark grey, **not white**. Capybaras
    show essentially no white. A white sclera on this character reads as cartoon-startled, which
    is the opposite of the brief.
  - iris disc `0.062 D` (0.70 of the eyeball) — nearly fills the visible ball, colour `iris`
    (§5; the old draft referenced this token without ever defining it).
  - pupil `0.030 D` (0.34), colour `pupil`, the darkest value on the model.
  - **Materials — do not use the `glass` preset on the ball.** `glass` carries transmission, and
    a transmissive sclera renders the arena *through* the fighter's head. Sclera, iris and pupil
    all take `pbr(colour, 'plastic-gloss', { roughness: 0.18 })`.
  - a **corneal bulge**: a cap of radius `0.052` over the front 40° of the ball, built as its own
    mesh with `pbr('#FFFFFF', 'glass', { transmission: 0.0, clearcoat: 1.0, clearcoatRoughness:
    0.04, roughness: 0.06, opacity: 1 })` — the glass *response* without the see-through. One
    0.007 specular pip, offset up-and-camera-ward, drawn as geometry so it tracks the light
    instead of being painted on.
- **Lids — the entire personality lives here.** Add `lidL` / `lidR` bones. The upper lid is a
  fur-covered spherical cap of radius `0.048` rotating about the eye centre (shell 2 above).
  - **Idle: the upper lid covers the top 52% of the eyeball; the lower lid covers the bottom
    14%. Visible aperture = 34% of `D` = 0.030 m tall.** That is the half-shut read.
  - The upper lid edge is **not horizontal**. It runs down-and-forward at **9°** (outer/rear
    corner higher than the inner/front corner). An upward-slanting lid reads sly; downward-
    forward reads bored. We want bored.
  - Lid **thickness 0.009** with a rolled edge, and a 0.004 darker lash-line strip along the
    margin so the aperture has a hard bottom edge and does not smear at distance.
  - Lower lid is a fixed fleshy shelf with a 0.010 fur-free rim, colour 12% darker than the fur.
- **Blink:** 0.10 s close, 0.06 s hold, 0.16 s open — noticeably **slower than the roster
  standard**, and he blinks once every 6.5 s ±2.0 s, roughly half the rate of every other
  fighter. Slow, infrequent blinking is 30% of the "unbothered" performance and costs nothing.
- **Gaze:** the eyes track the opponent with a **0.22 s lag** and a **±14° limit**, beyond which
  the head follows. He never snaps his gaze. Ever.

### 3.5 Brows

Capybaras have **no brow ridge**. Do not build one. Instead:

- A soft **fur mound** above each eye: `0.095 long × 0.052 wide`, raised **0.008**, centred at
  `x = +0.035, y = 1.716, z = ±0.113`. It exists only to catch a sliver of key light and give
  the lid an upper boundary.
- **Total brow travel is ±0.012 m.** This is the least expressive brow in the roster and that is
  the point — his face barely moves while the rest of the cast is mugging. When the brow *does*
  move (one frame in `calmCounter`, one in the finisher), it lands enormously.
- Direction convention: **down-and-forward 0.012 = focused/annoyed**; **up-and-back 0.008 =
  mild acknowledgement**. There is no "surprised" pose. He is never surprised.

### 3.6 Ears

Small, round, dark, thin, and **set at the rear-top corners of the skull, behind the eyes**.

- Base centre `x = −0.120, y = 1.775, z = ±0.125`.
  `x = −0.120` is **93% of the way aft along the head** — right at the back. In profile the ear
  sits *behind* the eye by 0.14 m, which is 26% of head length. If your ears are above the eyes,
  move them back.
- Shape: a **disc**, not a cone and not a box. `0.075 tall × 0.062 wide × 0.020 thick`, top edge
  a full semicircle, slight taper to the base. Slice the disc's plane so the outer face is
  **cupped forward 22°** and **splayed outward 26°** from vertical.
- Interior: a shallow concha bowl 0.010 deep, hairless, colour `faceDark`, roughness 0.55 — a
  small dark negative shape that sells thickness at mid distance.
- Rim: 0.006 of dense short fur wrapping the edge, breaking the outline so it never reads as a
  cut-out card.
- Colour: `faceDark` fading to `furBase` over the bottom 0.02 — capybara ears are the darkest
  fur on the animal, matching the black-on-face markings.
- **Oversized 40% over anatomical.** Anatomical would be ~0.054 tall. Non-negotiable: at 128 px,
  anatomical ears vanish and the head reads as a featureless brick.
- `earL` / `earR` are existing bones with spring-follow. Spring: 4.2 Hz, damping 0.32, **max lag
  14°**. They flick — one ear, alone, once, at a random 4–9 s interval in idle. Never both.

### 3.7 Mouth, lips and incisors

The rodent mouth is **short, low, and set well back under the front of the muzzle** — not at the
front of the face. This is the second-most-missed capybara cue after the nostrils.

- **Mouth line** runs from `x = +0.355` (the front, at the philtrum) back to a corner at
  `x = +0.245`, `y = 1.505`, `z = ±0.080`.
  - **Mouth width across = 0.160 m = 0.47 × head width.** Narrow. A wide mouth reads as a frog
    (that's PEEPEE's job) or a bear.
  - The corner is **0.135 m back from the nose plane** — a quarter of the head length.
  - **Corners angle up 6°** in idle. Six degrees. Not a grin — a *default*. The capybara's
    famous serene expression is a resting mouth shape, not a smile, and the moment you push past
    ~10° he reads as smug instead of unbothered.
- **Cleft upper lip** (all rodents have one; capybaras' is pronounced). A vertical philtrum
  groove on the midline: 0.028 deep, 0.014 wide, running from `y = 1.522` down to the lip edge
  at `y = 1.494`, with a 0.006 fillet. It splits the upper lip into two pads that each bulge
  0.009. In profile this shows as a tiny notch on the underside of the nose end — cheap, and it
  is the difference between "rodent" and "generic mammal".
- **Incisors.** Two upper, two lower, chisel-shaped, orange-fronted.
  - Upper pair: each `0.034 wide × 0.030 tall × 0.011 thick`, flat-fronted, at `z = ±0.019`,
    top hidden behind the lip, **projecting only 0.008 below the lip edge in idle**.
  - Lower pair: longer and slightly sinuous per the anatomy — `0.034 × 0.038`, hidden in idle.
  - Fully revealed only in `yawnPush`, `taunt`, `hitHeavy` and `knockdown`, via the `jaw` bone.
  - **Build them two-tone, and get the reason right.** The old draft called this "iron-pigmented
    orange enamel". That explanation was overturned in 2024: the iron-rich enamel is *white*, and
    the orange-brown comes from a **thin surface layer of aromatic amino acids and inorganic
    minerals** sitting on top of it (ACS / Northwestern, April 2024). This is not pedantry — it
    dictates the model. The orange is a **coating 0.0006 m thick on the labial (front) face
    only**; the lingual face, the cutting edge and any chip are **white enamel underneath**.
    So: front face `incisor` (`#E8C87A`, luma 0.79); back face and the self-sharpening chisel
    bevel `incisorCore` (`#DED3BE`, luma 0.82); a 0.002 wear notch on the left upper incisor
    exposing the pale core, because he is an adult animal who chews.
  - The orange front is a **warm accent nobody else in the roster has**, and the pale core edge
    behind it is a free second value. It lands hardest in the yawn, which is the character's
    whole thesis as a move.
- **Mouth interior**: a shallow closed shell, colour `mouthDark`, with a 0.055-wide tongue slab.
  Never open more than 14°.
- **Whiskers:** 5 per side, 0.10–0.16 long, emerging at `x = +0.30 … +0.34`, `y = 1.545`,
  splaying 25–55° down and out. Build as 3-segment tapered tubes (radius 0.0022 → 0.0004), not
  alpha cards — alpha cards will strobe under the SMAA pass. Add a 0.6 Hz spring drift.

### 3.8 Head carriage

- **Pitch: the `head` bone rotation is `0.0°`. Do not add a downward pitch.** The old draft asked
  for −4° "so he looks down his nose", but the skull already has that built in: block A's top
  plane is −3.3° and block B's is −9.1° *in model space*. Adding another −4° would put the muzzle
  top at −13° in world, which is not "level" — it is a head hanging forward, and it contradicts
  §1's "carried dead level". The constraint to hold is on the **world-space** angle:
  **the braincase top plane must stay within −3° and −6° of horizontal in every idle frame, and
  never positive.** With a 0° bone pitch it sits at −3.3° with the 7° roll costing under a
  degree of apparent slope. That is the whole "looks down his nose" read, free.
  Never pitch the head up; positive pitch reads as alert or eager.
  It also matters mechanically: the yuzu (§7.0) sits on that plane, and it must not look like it
  is about to roll off. At −3.3° it reads as parked. Past about −8° it reads as falling.
- **Yaw toward the camera: 18°.** Enough that the player sees the flat top plane *and* the
  square nose end and the near ear rather than a pure profile — a pure profile hides the
  nostrils, the morrillo and the near eye's aperture. Less than DOGEY's 38° because Cool Pal's
  read is the *side* view of the brick; we only need enough yaw to catch the top plane.
- **Roll: 7° toward the camera.** The tilt. This is the entire "chill" body-language cue that
  survives at silhouette scale and it costs one number.
- **No neck.** The head base plugs directly into the shoulder mass. Sleeve the joint: a fur
  collar ring of radius 0.19 attached to `torso` that overlaps the skull rear plate by 0.05 in
  every direction, so no gap opens at head yaw ±35° or pitch ±25° (contract §9: "no gaps").
- The head is the **last thing to start moving and the first thing to stop** in every clip. Give
  it 3 frames of lag on entry and 0 frames of overshoot on settle.

---

## 4. Body and limb proportions

### Torso

- Barrel. Widest at the **belly** (`0.76 m` at `y = 1.06`), not the chest (`0.66` at `y = 1.24`).
  Build it as a rounded-box / superellipsoid with exponent ~2.6 (fuller than a sphere, softer
  than a box), *not* a scaled `SphereGeometry`.
- Profile: forward-tipped egg, front-most point `x = +0.32` at `y = 1.02`. The belly leads.
- **Rear is squared off.** Rump plane near-vertical from `y = 1.20` down to `y = 0.88`.
- **Chest/belly separation:** the lighter `furBelly` field starts at `y = 1.30` on the front
  centreline, widens to cover the whole ventral surface by `y = 1.05`, and wraps to `z = ±0.26`.
  The boundary is **soft and noisy** (0.05 m of dithered transition), never a hard line — real
  pelage grades.
- **Belly jiggle:** add a `belly` bone at `x = +0.12, y = 1.04`, driven by the contract §11
  spring solver. Amplitude 0.030 m vertical, 0.018 lateral, natural frequency 2.4 Hz, damping
  0.22. It is the character's most-used piece of secondary motion. Triggers on landing, on
  `shoulder-lean`, on every hit taken, and at 6% amplitude on the idle breathing cycle.
- **No visible waist.** The knit hem at `y = 0.97` is the only interruption between chest and
  hip. Capybaras have no waist and neither does he.

### Shoulders and arms

- Shoulder ball centres `x = 0.000`, `y = 1.350`, `z = ±0.300` (the old draft never gave the
  shoulder's `x` at all — it is 0, on the torso's mid-depth). **Inboard of the belly** (which
  reaches `±0.38`), so the belly stays the widest mass. That is the *only* thing moving them in
  from `±0.42` buys; see §2 for why it does not buy an elbow void.
- **Shoulder line drops 0.020 on the loaded side** and the whole line is rotated −5° about `x`.
  Dropped shoulders are half the posture.
- Segment lengths: **upper arm 0.260, forearm 0.240, paw 0.130. Total 0.630 m.** With the arm
  hanging straight the fingertip reaches `y = 0.720` — exactly the hip crease, and the *wrist*
  hangs at `y = 0.850`. Short arms. Arm length / height = **0.35** (human ≈ 0.44). Keep this
  ratio; it is the third-strongest proportion cue after the head brick and the 40% legs.
- Upper arm diameter 0.190 → 0.155; forearm 0.150 → 0.132. Thick, unmuscled, no visible
  definition. He is soft.
- **Idle pose (hands in pockets) — solved, not estimated.** Reach budget is 0.500 m to the wrist;
  every number below is derived from it in §2's negative-space section. Author the pose to these
  joint positions and then check them, rather than dialling angles by eye:

  | joint | world position | note |
  |---|---|---|
  | shoulder ball | `(0.000, 1.350, ±0.300)` | fixed |
  | elbow | `(+0.067, 1.103, ±0.377)` | **tangent to the belly, ±0.010** |
  | wrist | `(+0.128, 0.878, ±0.290)` | at the pocket-mouth centre |
  | paw tip | inside the pouch, ≈ `(+0.150, 0.775, ±0.278)` | 0.105 of the 0.130 paw is in |

  Derived angles, for reference only — the positions are the spec: shoulder rotated forward 12°,
  down 8° and **abducted 15°**; **elbow flexed 38°** (*not* the 24° of the old draft, which was
  paired with an unreachable pocket). Shoulder–wrist distance 0.472 m of a 0.500 m budget, so
  there is 0.028 m of headroom for the contrapposto and the breathing layer — do not spend it.
- **The paw goes properly in.** The wrist crosses the welt at `y = 0.878`; **0.105 m of the
  0.130 m paw is inside the pouch**, leaving the 0.025 wrist and the hooked thumb outside. The
  old draft's "sinks 0.060 in" left 54% of the hand hanging out of the pocket, which reads as
  *resting a hand on his trousers*, not as hands in pockets. The pouch is 0.140 deep (§7.2), so
  0.105 clears with 0.035 to spare at full extension.
- **Paw construction — four digits.** Capybaras have four toes on the front feet. Build:
  a palm block `0.150 × 0.100 × 0.130` (bevel 0.022), four blunt digits of diameter 0.045 and
  length 0.055/0.062/0.058/0.046 (index→outer), splayed 6° apart, each capped with a **hoof-like
  keratin nail** — a flattened wedge `0.028 × 0.020 × 0.010`, `horn` material, colour `nail`.
  No claws, no pads-and-toe-beans cuteness; capybara nails are blunt and hoof-like. Add a single
  thick fleshy palm pad, colour `faceDark`, roughness 0.62.
- Wrist: sleeve with a 0.02 fur cuff overlapping both sides so the `forearm` joint never gaps.

### Legs and feet

- Hip sockets at `hips`-local `(0, −0.02, ±0.17)` (world `y = 0.83`, `z = ±0.17`) — **leave them
  where they are**, the clips are authored against this.
- Single-segment leg (no shin bone). Visual masses along it: thigh 0.380 diameter at the top →
  0.300 at the knee line (`y = 0.42`); calf 0.260 → 0.210; bare ankle 0.190 → 0.165.
- **Hind legs are slightly longer than the forelegs** in the real animal; anthropomorphised,
  this shows as the *arms* being short (0.35 of height) rather than the legs being long. Keep
  legs at 40% and let the short arms carry the ratio.
- **Stance width 0.44 m at the sandals** (`z = ±0.22`), feet splayed **11° outward**. Wide,
  planted, lazy.
- **Weight on one hip:** pelvis rolled **7°** so the loaded hip is 0.035 higher; loaded leg
  vertical, unloaded leg with the sandal 0.06 forward and the toe 0.015 off the floor. Shoulder
  line counter-rotates −5°. Spine curve: a shallow C, apex forward at `y = 1.10`, total lateral
  offset 0.045. This is contrapposto and it is the second-strongest attitude cue after the head
  tilt.
- **Feet — three toes.** Three broad blunt toes, each `0.075 long × 0.062 wide`, splayed 14°
  apart, capped with the same hoof-like `horn` nails (`0.034 × 0.026 × 0.012`). Slight webbing:
  a 0.012-thick membrane filling the inner 45% of each inter-toe gap, `skin-elephant` surfacing.
  Foot footprint `0.340 long × 0.220 wide`, heel `x = −0.10`, toe tips `x = +0.24`.
- Foot must read from directly below in `slow-kick` (the launcher) — the three-toed star is a
  genuinely funny beat on a hit-stop freeze frame.

### Tail

- **Vestigial, present, deliberate.** A rounded nub at `x = −0.280, y = 0.950`, `0.050 long ×
  0.062 diameter`, same fur as the rump, slightly darker at the tip.
- Add a `tail` bone with a very stiff spring (7 Hz, damping 0.55, max 8° lag) so it gives one
  tiny twitch on landings. The joke is that it moves *at all*.

---

## 5. Colour script

Thirteen organic values. Capybara pelage is **reddish-brown above, yellowish-brown below, with
black on the face, outer limbs and rump**, and — critically — **the skin shows through the sparse
coat**.

> **Contract compliance.** GRAPHICS_CONTRACT §0 requires every albedo channel to sit in
> **30–240 sRGB, never pure 0 or 255**. The old palette broke this in four places — `pupil`
> `#100B07` (all three channels under 30), `morrillo` `#2A2019` (B = 25), `citrus` `#F2A33C`
> (R = 242) and `phoneAccent` costume 1 `#3CA8FF` (B = 255). All four are re-tuned below. Do not
> "restore" the old crushed blacks: after the ACES/AgX pass in the pipeline they clip to the same
> value as legal darks anyway, and they wreck the GTAO response.

| name | hex | sRGB luma | region / purpose |
|---|---|---|---|
| `pupil` | `#231F1E` | 0.12 | **darkest value on the model.** Pupil only. |
| `morrillo` | `#34281E` | 0.16 | the bare snout gland. Waxy, semi-gloss. |
| `iris` | `#3C2C20` | 0.18 | iris disc. Barely separable from the pupil at 1 m — capybara irises are dark brown and that is correct. (The old draft used this token in §3.4 but never defined it.) |
| `rhinarium` | `#3F3029` | 0.20 | the hairless nose pad wrapping the front-top of the muzzle (§3.2a). Matte-damp, never waxy. |
| `faceDark` | `#4A382A` | 0.23 | black-on-face markings: ear exterior + concha, muzzle sides, lip margin, outer forelimb stripe, rump smudge, palm pad. |
| `furShadow` | `#5A4330` | 0.28 | shadow tint in the coat's crevices and under the belly; AO multiply target. Warm, never neutral grey. |
| `skinUnder` | `#6E5142` | 0.34 | **the grey-brown skin seen between the hairs.** Applied as an 18%-coverage mottle under the whole coat. This is what makes the fur read *sparse* instead of plush, and it is the single most capybara-specific surfacing decision on the model. |
| `sclera` | `#6B5B4A` | 0.36 | the eye's white-that-isn't. Warm dark grey. Never `#FFF`. |
| `furBase` | `#8B6A45` | 0.43 | reddish-brown dorsal coat. The dominant colour. |
| `furWarm` | `#A8814F` | 0.52 | sun-hit upper planes: skull top, shoulders, rump crest, forearm tops. |
| `furBelly` | `#C4A277` | 0.65 | yellowish-brown ventral: chest, belly, inner limbs, throat, chin. **Lightest fur value.** |
| `incisor` | `#E8C87A` | 0.79 | the orange incisor *front face only* — a 0.0006 surface coating (§3.7). Only 0.008 m of it shows in idle; it is a reward for the yawn. |
| `incisorCore` | `#DED3BE` | 0.83 | **lightest value on the model.** The white enamel under the orange coating: lingual faces, chisel bevels, the wear notch. Total visible area in idle ≈ 0. |

Supporting / wardrobe / props. **These now carry lumas too** — the old draft gave the fur a value
ladder and left fourteen wardrobe colours with none, which is how a `canvas` at 0.46 ended up sat
against a `furBase` at 0.43 with nothing separating them.

| name | hex (costume 0) | luma | hex (costume 1) | luma | use |
|---|---|---|---|---|---|
| `knit` | `#C98A2E` (ochre) | 0.57 | `#3E9E86` (teal) | 0.53 | open-front knit cardigan body |
| `knitRib` | `#9E6A1E` | 0.44 | `#2C7A67` | 0.41 | ribbed hem, collar roll, cuffs |
| `canvas` | `#5E6A40` (olive) | 0.39 | `#4E6472` (slate) | 0.38 | loose trousers |
| `canvasCuff` | `#48522F` | 0.30 | `#3E4F5B` | 0.30 | rolled cuff + pocket welt |
| `leatherTan` | `#8A6F4D` | 0.45 | `#8A6F4D` | 0.45 | sandal straps and footbed |
| `soleRubber` | `#3A342C` | 0.21 | `#3A342C` | 0.21 | sandal outsole |
| `phoneShell` | `#2A2E38` | 0.18 | `#2A2E38` | 0.18 | headphone shell (keep existing) |
| `phoneAccent` | `#E0703A` | 0.52 | `#3CA0F0` | 0.57 | ear-cup ring (keep the costume split; costume 1 re-tuned off `#3CA8FF`, which had B = 255) |
| `drinkGlass` | `#DCE8EA` | — | `#DCE8EA` | — | tumbler. **Transmission 0.9 — this is a tint, not an albedo, and it has no fixed rendered value.** Do not count it in the ladder. |
| `citrus` | `#EFA23C` | 0.67 | `#EFA23C` | 0.67 | citrus wheel on the tumbler rim (re-tuned off `#F2A33C`, R = 242) |
| `yuzu` | `#E4BE4E` | 0.75 | `#A9C64F` (lime) | 0.72 | **the whole fruit on the crown (§7.0).** Same value both costumes, hue only. |
| `birdSlate` | `#4B5560` | 0.33 | `#4B5560` | 0.33 | shoulder bird's back and wings |
| `birdCream` | `#BFAC84` | 0.68 | `#B4B8A6` | 0.71 | shoulder bird's head and breast — **re-tuned down from `#E8D9B4` (0.85)**, see rule 3 |
| `mouthDark` | `#5C3A38` | 0.26 | `#5C3A38` | 0.26 | mouth interior, nostril-slit interior |
| `nail` | `#7A6A55` | 0.42 | `#7A6A55` | 0.42 | hoof-like toe/finger nails (`horn`) |

**Value ladder (memorise this, darkest → lightest):**
`pupil 0.12 < morrillo 0.16 < iris 0.18 < rhinarium 0.20 < faceDark 0.23 < furShadow 0.28 <
skinUnder 0.34 < sclera 0.36 < furBase 0.43 < furWarm 0.52 < furBelly 0.65 < incisor 0.79 <
incisorCore 0.83`.

Four rules that keep him readable against a busy arena:

1. **His coat lives in a narrow band, 0.23 – 0.65** (`faceDark` → `furBelly`). He is the roster's
   most *even-valued* fighter. He does not fight the background with contrast; he separates by
   **shape and rim**. Do not "fix" this by punching up the contrast — the flat mid-value body is
   what makes the two dark ear nubs, the flat top line and the yuzu read.
2. **Exactly what breaks the band, with area budgets.** The old draft claimed "only four things"
   and then shipped nine. Here is the honest accounting; keep each within budget and add nothing.

   | | elements | luma | budget (share of the fighter's screen area) |
   |---|---|---|---|
   | **below** | `pupil`, `morrillo`, `iris`, `rhinarium` | 0.12–0.20 | ≤ 4% |
   | **above** | `citrus`, `yuzu`, `incisor`, `incisorCore` | 0.67–0.83 | ≤ 3% (the yuzu is ~2% of it) |
   | **hardware, outside the organic ladder on purpose** | `phoneShell` 0.18, `soleRubber` 0.21, `phoneAccent` 0.52–0.57 | — | ≤ 6% |

   The two dark hardware values are not an accident: `soleRubber` at the feet and `phoneShell` at
   the shoulders **bracket the figure top and bottom** with the same value, which reads as
   deliberate composition rather than as two unrelated dark blobs. Keep them within 0.03 of each
   other.
3. **Nothing on the model out-values the head.** `birdCream` was `#E8D9B4` at **0.85 luma** —
   brighter than the incisors, on a 0.13 m object parked next to the one shape that has to read
   first. It is re-tuned to 0.68, which still gives 0.25 of separation from the coat and lets you
   find the bird instantly at 1 m without it stealing the 128 px silhouette. The **yuzu at 0.75
   is the single brightest large element and that is intentional** — it is the read.
4. **The wardrobe separates by chroma, not by value or hue.** The old draft claimed the ochre
   knit sat "0.09 luma above `furWarm` and 22° away in hue". Both numbers were wrong: `#C98A2E`
   is **0.05 luma** above `furWarm` and **≈2° away in hue** — practically the same colour. What
   actually separates them is **saturation: 0.77 vs 0.53, a 45% relative jump.** That is the
   mechanism, so state it and protect it. If you desaturate the knit "to make it blend", the
   cardigan disappears entirely. Same story on the trousers: `canvas` was `#6E7A4E` at 0.46 luma
   against the bare `furBase` ankle at 0.43 — a 0.03 break, invisible, and the rolled-cuff line in
   §2's vertical stack would have vanished. It is darkened here to **`#5E6A40`, luma 0.39**, giving
   a 0.04 drop below the ankle fur *and* a 0.09 drop below `furBelly`. Verify the cuff line in a
   render before you sign it off.

**Rim light:** `#7FD8FF` (cool cyan-blue), intensity **0.45**, positioned per contract §6 behind
and camera-side. Against a body that is entirely warm browns in the 15–35° hue range, a cyan rim
is the maximum-separation choice and it will cut him out of *every* arena in the roster,
including `overcast-swamp` and `mountain-dawn` where warm rims would die. Secondary warm bounce
`#FFB56B` at 0.20 from below, carrying the arena floor colour up into the belly and the muzzle
underside — this is what stops the barrel from going flat.

**Damage tint:** desaturate toward `#6E5F52` rather than toward grey; `desaturate(fighter)` in
the current file already exists for the round-end vignette — keep its contract, retarget the
destination colour.

---

## 6. Surfacing

Every material comes from `pbr(color, preset, overrides)` per contract §4. Maps come from
`surfaceMaps(kind, opts)` per §3. Shared kinds get shared GPU textures — do not request a
bespoke variant where a `tint`/`scale` override will do.

| region | `surfaceMaps` kind | `SURFACE` preset | roughness | notes |
|---|---|---|---|---|
| body coat (dorsal, limbs) | `fur-coarse` | `fur` | 0.86 ± 0.07 | primary. `scale: 3.4`, `seed` per-fighter. |
| ventral / belly / throat | `fur-coarse` | `fur` | 0.90 | same maps, `tint: furBelly`, `scale: 2.6` (hair is longer and laxer underneath). |
| face + ear exterior | `fur-short` | `fur-dark` | 0.82 | shorter, denser, darker. |
| ear concha, palm pad, lip margin, webbing | `skin-elephant` | `hide` | 0.58 | fine crepe wrinkle, no hair. |
| **morrillo** | `leather` at `scale: 0.6` | `rubber` | **0.34**, clearcoat 0.15 | the only glossy organic surface. |
| rhinarium (nose pad) | `skin-elephant` | `hide` | 0.52 | slightly damp — bump strength 0.5. Matte-damp, **not** the morrillo's semi-gloss; the two sit 0.10 m apart and the contrast is the point. |
| eyeball (sclera/iris/pupil) | none | **`plastic-gloss`** | 0.18 | **not `glass`** — that preset carries transmission and would render the arena through his head. |
| corneal cap only | none | `glass` with `{ transmission: 0.0, clearcoat: 1.0 }` | 0.06 | the glass *response*, not the see-through. |
| incisors — orange front face | `bone` | `bone` | 0.22 | high spec; `incisor` albedo. |
| incisors — core, bevels, wear notch | `bone` | `bone` | 0.28 | `incisorCore` albedo (§3.7). |
| nails (4 front, 3 hind) | `horn` | `horn` | 0.38 | anisotropic ridging along the growth axis. |
| knit cardigan | `cloth-knit` | `cloth` | 0.92, sheen 0.35 | sheen colour `#E8D8B8`. Real chunky knit. |
| trousers | `cloth-weave` | `cloth` | 0.88 | `scale: 5.0`, visible weave at 30 cm. |
| sandal straps / footbed | `leather` | `leather` | 0.62 | `wear: 0.55` — these are old sandals. |
| sandal sole | `rubber` | `rubber` | 0.80 | tread pattern in the normal map only. |
| headphone shell | `plastic-matte` | `plastic` | 0.55 | plus a `metal-brushed` slider band. |
| ear cushions | `leather` | `leather` | 0.70 | protein-leather micro-pebble, `scale: 12`. |
| tumbler | `glass` | `glass` | 0.05, transmission 0.9 | thin-walled, IOR 1.5. |
| citrus wheel | `paper` at `scale: 8` | `default` | 0.45, transmission 0.25 | radial segment normal; light must pass through it. |
| yuzu skin (§7.0) | `leather` at `scale: 14`, `tint: yuzu` | `default` | 0.58, clearcoat 0.20 | citrus peel is a pitted, waxy dielectric. The `leather` generator's pebble at a small scale *is* peel; do not request a bespoke kind for it. |

> **Do not call `surfaceMaps('foliage')`.** `foliage` exists in the `SURFACE` **preset** list
> (contract §4) but **not** in the `surfaceMaps` **kind** list (contract §3). Contract §3 says an
> unknown kind falls back and `console.warn`s once — and contract §12.2 requires **zero console
> warnings attributable to your change**, so a single `foliage` map request fails your definition
> of done. The same trap applies to any kind not literally in the §3 list. Where this brief wants
> foliage-like surfacing (the grass blade, the citrus wheel, the yuzu) it names a legal kind and
> pairs it with the `foliage`/`default` *preset*. Grep your final file for `surfaceMaps(` and
> check every string against contract §3 before you ship.

### How the coat must behave under light

The capybara coat is the whole surfacing brief and it is **not fur as most games do fur**:

- **Coarse fur ranges 30–120 mm in length** and the animal has **no underhair** — there is
  essentially no distinction between guard hair and overhair. Consequence: the coat is **sparse,
  bristly, and directional**, and the **brown-grey skin is visible through it**. It reads closer
  to a stiff brush or a boar bristle than to a plush toy. Every other furred fighter in the
  roster (DOGEY, SHIBRO, TIRED APE) is soft; Cool Pal must be the *rough* one.
- **Anisotropic streak normal.** Build `fur-coarse` at `scale: 3.4` with strong directional
  streaking — individual bristle grooves 0.030–0.120 m long *in world scale* (map that to your
  UV density; do not let them become 5 mm noise). Flow direction: **head → tail** along the
  dorsal midline, **fanning down and back** over the flanks, **swirling into a cowlick on the
  rump** at `x = −0.22, y = 1.12` (real capybaras have a pronounced rump whorl), and **radiating
  forward-down** on the muzzle from a point at the brow break.
- **Sparse-coat albedo.** Multiply an 18%-coverage `skinUnder` mottle under the whole coat,
  worley-driven at `cells: 22`, so the base colour breaks up into visible skin patches. Push
  coverage to **32% on the outer forelimbs, the rump and the crown** — the places where real
  capybaras go visibly bald. This one texture decision does more for the read than any geometry
  you can add after the head is right.
- **Roughness variation is the tell.** The coat is not uniform. Bristle *tips* are waxier than
  the shafts: run roughness from **0.78 at the tips to 0.94 in the troughs**, derived from
  `roughnessFromHeight(height, size, { base: 0.86, contrast: 0.5, invert: true })`. Under a
  raking key this produces a broken, gritty highlight along the top planes — exactly the look of
  a bristly semi-aquatic coat and completely unlike a soft velvet sheen.
- **Sheen, low and warm.** `sheen: 0.18`, `sheenRoughness: 0.75`, sheen colour `#C9A87A`. Enough
  for a whisper of backlit fringe on the rim-lit edge; not enough to look like velour.
- **Fresnel.** `envMapIntensity: 0.85` on all coat regions. Keep it under 1.0 — a capybara does
  not glow with reflected sky, it eats light.
- **Wetness variant (required).** He is semi-aquatic and there is a hot-spring gag in his kit.
  Author a `wetness` uniform 0..1 that: **drops the coat's roughness from 0.86 to 0.34** (wet is
  *smoother*, not rougher — the old draft said "raises the roughness floor to 0.34", which reads
  as an increase and would build a wet capybara that is more matte than a dry one), darkens
  albedo by 22%, collapses the fur normal strength to 0.35 (wet bristles clump into spikes),
  and adds 8 drip-clump vertex offsets along the belly and jaw. Used by `napTime`, the
  `zeroStress` special, and the `forcedVacation` finisher. This is a genuine differentiator —
  nobody else in the roster gets wet.

### Micro-detail that sells it

1. **Bristle silhouette breakers.** ~40 individual tapered bristle clumps (real geometry, 6
   tris each, 0.05–0.11 long) scattered along the **rump crest, the shoulder ridge, the top of
   the skull and the elbows** — the outline edges the camera sees. They break the too-clean
   bevel edges and they are the difference between "modelled fur" and "a brown surface".
   Budget: 240 tris total. Do not scatter them where they will not appear in silhouette.
2. **Chewed/worn knit.** The cardigan hem has 3 pulled loops and one 0.04 snag on the left front
   panel. He has owned this for years.
3. **A single blade of grass at the corner of the mouth**, 0.11 long × 0.008 wide, tapering to a
   point, built as 3 quads with a 4° twist per segment. `surfaceMaps('paper', { scale: 3 })` with
   the `foliage` **preset** — see the warning above about `surfaceMaps('foliage')`. Child of
   `head`, spring-driven at 3 Hz. Present in *every* clip. Free characterisation, and it pays off
   the `touchGrass` special.
4. **Sandal footbed wear:** a darkened, polished oval under each of the three toes and the heel,
   roughness dropping to 0.35 in the wear patches.
5. **Contact AO.** Where the headphone cushions meet the **chest** fur and the band meets the
   shoulder ruff (§7.4), compress the fur normal and darken 15% over a 0.03 band — the cans must
   look like they are *pressing in*, not floating. Same treatment where the drink holster strap
   crosses the belly, and — the one that matters most — in the **0.030 band where the forearm
   lies against the belly** (§2): that crevice is the only thing separating arm from barrel in
   the 3/4 view, so do not let it come out flat.
6. **The morrillo's specular pip** — one 0.006 highlight on the top line of the head under the
   rim. Verify it is present in a rim-lit screenshot; if it is not, the gland is too rough.

---

## 7. Signature props and wardrobe

Attachment doctrine, applied to all of these: **a prop is a child of the bone whose motion it
must inherit, added inside `buildModel()`, named `prop_*`, and never parented to a mesh.**
The Gore system severs at bones — a prop parented to `forearmR` leaves with that arm, which is
correct. A prop parented to a *mesh* will orphan and float. Do not do it.

### 7.0 The yuzu on his head — build this first

**This is the detail that carries the reference, and the old draft did not have it.** It had a
citrus *wheel* garnishing a cocktail, which reads as "animal with a drink". The image the whole
world actually knows is different and much more specific: **a capybara up to its chin in a winter
bath, eyes half shut, with a whole yellow citrus fruit sitting on its head.** That is the picture
in the viewer's memory, and the fruit — not the species, not the barrel, not the drink — is what
retrieves it. Reference works describe it in exactly those terms: the animals nose the floating
fruit and end up wearing one, "likely by accident, though it looks intentional", which is also
the funniest possible characterisation of this fighter.

It is additionally the **structural proof of §3.1**. A sphere resting on a plane is a visual
assertion that the plane is flat. If the skull is domed, spherical, or crowned in the middle, the
fruit sits wrong and the viewer can see that it would roll. Head brick and fruit are one idea:
build them together, and if the fruit looks unstable, the head is wrong — not the fruit.

- **`prop_yuzu`, child of `head`.** Whole fruit, **Ø 0.090** (a real yuzu is 55–75 mm; cartooned
  up ~30% so it survives 128 px). Squash 4% vertically. Icosphere, ~320 tris.
- **Seat:** a **0.006-deep elliptical dimple** pressed into the fur of block A's top plane,
  centred `x = +0.040, z = 0`, where the plane sits at `y = 1.789`. Fruit centre
  **`(+0.040, 1.828, 0)`**; top of fruit `y = 1.873`, which clears the local plane by 0.084 and
  the model's 1.800 crown by **0.073 (4.5 px at 128 px)**. The dimple is not optional — without it
  the fruit reads as glued on rather than nested in the coat.
- **Position rationale.** `x = +0.040` puts it just aft of the brow break (`+0.05`), on the −3.3°
  braincase plane rather than the −9.1° muzzle plane, so it looks parked rather than rolling. It
  is **0.105 m aft of the morrillo** and **0.140 m forward of the bird's crown perch**, and it is
  0.115 m clear of the ear bases. Nothing else may enter `x ∈ [−0.005, +0.085]` on the crown.
- **Surfacing:** `surfaceMaps('leather', { scale: 14, tint: yuzu })` with the `default` preset,
  roughness 0.58, clearcoat 0.20 — citrus peel is a pitted, faintly waxy dielectric, and the
  `leather` generator's micro-pebble at a small scale *is* peel. Do not request a bespoke kind.
  Add a **0.010-wide × 0.004-deep stellate stem scar** on top and a shallow blossom dimple
  opposite. All other pitting is normal-map only.
- **Colour** `yuzu` (§5): `#E4BE4E` at 0.75 luma on costume 0, `#A9C64F` lime at 0.72 on costume 1.
  Same value, different hue — the silhouette read must not change between costumes. At 0.75
  against a 0.43 coat this is the **brightest large element on the model**, sitting on the one
  shape that has to read first. That is deliberate and it is why `birdCream` was pulled down to
  0.68 in §5: nothing is allowed to out-value the fruit.
- **Motion: it never falls off. Ever. In any clip.** Add a `yuzu` bone (additive bones are
  permitted) on a very stiff spring — **9.0 Hz, damping 0.60, max lateral lag 0.008 m** — so it
  shivers a few millimetres on impacts and resettles. It stays on through `hitHeavy`,
  `knockdown`, `sitDodge`, the KO and the finisher. You will be tempted to write a beat where it
  finally rolls off for a laugh. Do not. The joke is that nothing disturbs him, and the fruit is
  the instrument that proves it — the same contract as the bird that never reacts and the drink
  that never spills. Three props, one rule.
- **Gore:** parented to `head`, so it rides a severed head. Null-guard the despawn.
- **Occlusion check:** at the idle 18° yaw and 7° roll the fruit stays clear of the near eye (eye
  centre `y = 1.675`; fruit underside `y = 1.783`). Verify it does not clip the ears at head
  pitch ±25°.
- Parody safety for this prop is covered in **§9.4** — the practice, not any park's trade dress.

### 7.1 The drink — in a hip holster, not in a hand

**Decision: the beverage does not live in a paw.** Both paws are in pockets in the idle, both
paws are needed for the move list, and a held object on the far-side arm is invisible in the
profile camera. Instead:

- A **canvas belt holster**, child of `hips`, socket at **`x = +0.300, y = 0.865, z = 0.000`** —
  dead front-centre on the belt. Three reasons this beats the old draft's
  `(+0.200, 0.860, +0.020)`: at `x = +0.200` the tumbler cleared the belly's forward-most point
  (`x = +0.320`) by **0.004 m**, so its claim to "deliberately break the torso outline" was worth
  a quarter of a pixel; `z = +0.020` is not "front of hip", it is the midline, and it collides
  with nothing but also reads as nothing; and a midline mount means **no side-swap on facing
  flip**, which a worn item must never do. At `x = +0.300` the holster's rear face sits at
  `+0.250`, flush against the hip surface, and it clears both thighs (thigh front `x = +0.190`)
  by 0.060.
- Holster body: a rounded canvas cylinder `0.100 diameter × 0.150 tall` (spanning `y = 0.790 …
  0.940`), `cloth-weave`, `canvasCuff` colour, with a 0.018 strap running back to a simple loop.
- **The tumbler**: `0.088 diameter × 0.200 tall`, thin-walled `glass`, **seated at a 14° forward
  tilt** in the holster. That tilt is what makes it a silhouette element: the rim reaches
  `x = +0.412` against a belly front of `x = +0.320`, so the drink stands **0.092 m (5.6 px at
  128 px) proud of the torso outline**. Interior liquid: a separate capped cylinder at 72% fill
  (0.144 m of liquid, 0.056 m of freeboard), colour `citrus` at 0.35 transmission, with a **level
  plane that tilts opposite to the body's lean and never spills**. The non-spill is the
  character's best running gag — spec it as a hard constraint in the physics: liquid tilt =
  `−0.6 × body lean`, clamped to ±22°. Check the static case: at the 14° seat tilt the surface
  rises `0.088 × tan 14° = 0.022` across the glass, i.e. 0.011 above centre, against 0.056 of
  freeboard. It cannot spill at rest, and the clamp holds it in motion.
- **A citrus wheel on the rim**: `0.070 diameter × 0.008 thick`, 8 radial segments, notched for
  the rim. `citrus` colour, 0.25 transmission so it glows when backlit. Because the tumbler tilts
  forward, the wheel sits **on the outermost point of the model at hip height** — the arena-facing
  accent lands exactly on the silhouette edge, which is the whole reason for the tilt.
- A bent straw, `0.006 radius`, 0.16 long, bending 38° at 0.11 up.
- **Reparenting for the taunt / `napTime` / `stillCool`:** the tumbler sits in a group
  `prop_drink`. Clips that need him to raise it call a reparent from the `hips` holster socket
  to a paw socket on `forearmR`, **preserving world transform on the swap** and restoring the
  original parent on clip exit. Reset it in the clip's exit handler *and* in the fighter's
  round-reset path — a drink stuck to a hand across a round transition is a visible bug.

### 7.2 Pockets — the pose depends on them being real

- Two **slash pockets** in the trouser fronts, mouth centred **`x = +0.128, y = 0.878, z = ±0.290`**,
  opening 0.170 long, angled 22° from vertical — so the mouth runs from an upper corner at
  `(+0.096, 0.957)` down-and-forward to a lower corner at `(+0.160, 0.799)`.
  **This position is not a style choice; it is the only one that works.** The old draft's
  `(+0.140, 0.780, ±0.190)` sits **0.597 m** from the shoulder ball against **0.500 m** of arm —
  the paws could never have reached the pockets, and every "hands in pockets" pose in the brief
  was unbuildable. The new mouth is 0.472 m from the shoulder ball (§4). It also lies **on the
  trouser surface**: at `z = ±0.290` the hip's front surface is at `x = +0.128`, whereas the old
  `x = +0.140` at `z = ±0.190` was 0.05 m *inside* the cloth.
  The upper welt corner at `y = 0.957` clears the knit hem at `y = 0.970` by 0.013 — tight by
  design, so the open cardigan frames the pocket rather than covering it. If you move the hem,
  re-check this gap.
- **Raised welt** 0.018 proud, 0.022 wide, `canvasCuff` colour, with visible topstitching (a
  0.003 groove in the normal map, 9 stitches per 0.1 m).
- **A real interior pouch**, 0.140 deep, modelled as a closed shell, angled 18° down-and-inboard
  from the mouth so it follows the paw rather than fighting it. The paw must be able to enter and
  exit through the mouth without popping through the trouser wall — build the pouch large enough
  (0.16 × 0.14 × 0.11 interior) that the 0.13 paw clears it at any pose in the clip set. In idle,
  0.105 of the paw is inside (§4) and 0.035 of pouch depth is still free. Test against `walk`,
  `crouch`, `getup` and `taunt`.
- **Never parent the paw to the pocket.** It must be free, or every clip breaks. The
  hands-in-pockets read is achieved by *posing* the arm bones, not by constraining them.
- One thumb (the near-side one, camera-facing) stays **hooked outside the welt**, so at 128 px
  there is a visible 0.03 nub on the pocket edge. Small, and it is what makes the pose read as
  deliberate rather than as arms clipping into trousers.

### 7.3 The knit cardigan

Keep the existing panel structure (back panel + two open front panels + shoulder yoke + hem) but
rebuild it as real knitwear:

- **Chunky rib**: 5 mm ribs in the geometry (not just the normal map) on the hem, cuffs and the
  shawl collar roll. `cloth-knit`, sheen 0.35.
- **Rolled shawl collar** of radius 0.032 running from `y = 1.30` up around the shoulder line at
  `y = 1.40` — this also does double duty as the neck sleeve that hides the head/torso joint.
- **Three chunky buttons**, 0.030 diameter, 0.010 thick, 4-hole, `plastic-matte`, in `knitRib`
  colour, at `y = 1.28 / 1.14 / 1.00` — **all three undone**. The cardigan hangs open. A closed
  cardigan hides the belly and the belly is a silhouette requirement.
- **Hem cloth simulation**: add a `vestHem` bone chain (2 links) with the §11 spring solver;
  amplitude 0.04, natural frequency 3.1 Hz, damping 0.30. It must swing on `shoulderLean` and
  settle late.
- **The cardigan must not extend below `y = 0.94`** — the belly's lowest point must be bare fur
  so the barrel reads.

### 7.4 Headphones (existing `phones` bone — this is a weapon)

> **They are worn slung around the shoulders, not on the head. This is a change from the old
> draft and it is forced.** §2 requires the two rear ear nubs to survive the 128 px black fill —
> they are read #2, and without them the head is a featureless brick. The ears are 0.075 tall,
> based at `x = −0.120, y = 1.775, z = ±0.125`. A 0.200 m over-ear cup centred on that ear
> **completely swallows them**, along with the crown line they are supposed to break. You cannot
> have both. Slinging the cans resolves it, and it pays three further dividends: it frees the
> crown for the yuzu (§7.0), "headphones round the neck, never actually listening" is a sharper
> characterisation than "wearing headphones", and it moves the weapon mass to roughly `y = 1.30`,
> which **agrees far better with the existing `headphone-swing` hitbox `up: 1.2`** than a
> head-mounted `y = 1.79` ever did.
>
> **Cost, and you must pay it:** any clip that keys the `phones` bone is authored against the
> old head-mounted rest transform and must be re-derived. Audit `clips` for `phones` keys before
> you start, and list the re-derived clips in your report alongside the five move reach constants.

- Over-ear, **cup outer diameter 0.190**, depth 0.072, with a 0.020 chamfer on the outer rim.
  `plastic-matte` shell, `metal-brushed` slider arms (0.014 × 0.006 section) with 4 visible
  detent notches per side, `leather` memory-foam cushions of section radius 0.028.
- **Cup placement (idle):** centres at **`x = +0.224, y = 1.300, z = ±0.269`**, disc plane normal
  `(0.60, 0, ±0.80)` — i.e. the cushions lie flat against the upper chest, facing inboard-and-
  rearward, outer faces looking outward-and-forward. Each cup spans `y = 1.205 … 1.395` and
  reaches `x = +0.300` at its forward edge. That is 0.045 proud of the chest front (`+0.255`) but
  still **0.020 behind the belly's forward-most point (`+0.320`)** — the belly must keep leading.
  If a cup ever out-reaches the belly in profile, pull it back; the forward-tipped-egg read
  outranks the headphones.
- **Layering against the cardigan (§7.3):** the cups sit **on top of** the knit, outboard of the
  shawl collar roll (radius 0.032, running `y = 1.30 → 1.40` near the front opening). The band
  crosses the collar roll where it passes over the shoulder — sink it 0.008 into the knit there
  and add the AO band, so the collar reads as compressed under it rather than intersecting it.
- **Band:** 0.100 wide × 0.026 thick, running from the cup yokes at `(+0.200, 1.390, ±0.280)`
  up over the shoulder mass to an apex at **`(−0.170, 1.400, 0.000)`** — in the hollow directly
  behind the skull's rear plate (`x = −0.16`), resting on the shoulder top. Nothing on the
  headphones goes above `y = 1.400`.
- **Compression contact:** the cushions press the chest fur in by 0.012 with a 0.030 darkened AO
  band, and the band flattens the shoulder ruff by 0.010 along its bearing arc (see §6.5). They
  must look like they have weight sitting on him, not like a decal floating on the ruff.
- **Anticipation on `headphone-swing`:** the band lifts 0.060 clear of the shoulder over the
  first 4 frames before the swing starts. That lift is the tell that a 0.19 m plastic mass is
  about to arrive, and it costs one keyframe.
- A **coiled cable**, 0.008 radius, 12 coils, running from the left cup down to a pocket. Spring
  chain, 5 links, 2.2 Hz. It must whip on `headphone-swing` and it must not tangle in the
  hurtbox — clamp its excursion to 0.35 m from the cup.
- Because `headphone-swing` swings them: the band must be a **closed rigid loop** with real
  thickness so that when the `phones` bone rotates 140° in 9 frames the object reads as a solid
  mass with weight, not a hoop of paper. Add a motion-trail-friendly flat face on the cup's
  outer plane for the VFX smear to key off.
- Costume split on the cup accent ring is already in the file (`cup0` / `cup1`) — preserve it.

### 7.5 The shoulder bird

Capybaras are famously used as perches by birds that pick ticks and flies off them (yellow-headed
caracaras, cattle tyrants, wattled jacanas are all documented doing exactly this). This is the
single funniest available accessory and it is *observed natural behaviour*, not anyone's IP —
but see §9.5 on how to build it safely.

- `prop_bird`, child of `torso`, standing at **`x = −0.120, y = 1.395, z = +0.240`** (feet sunk
  0.005 into the shoulder ruff, whose top is at `y = 1.400`). The old draft's
  `(−0.160, 1.340, −0.100)` was wrong three ways: `y = 1.340` is 0.060 *inside* the shoulder mass,
  so the bird's legs were buried; `z = −0.100` is not a shoulder at all — the shoulder caps are at
  `z = ±0.30`, and `−0.100` is essentially on the spine; and it described `z = −0.100` as "the far
  shoulder" while simultaneously demanding the bird always be camera-side, which is a
  contradiction.
- **Camera-side, via a signed constant, not a reparent.** Store the side as
  `prop_bird.userData.side = ±1` and drive `position.z = 0.240 * side`, flipping `side` in the
  same place the fighter's facing flips. Mirror the model-space `z` only — do not negate the
  bird's own rotation or it will end up standing backwards.
- **Our own invented species**, not a portrait of a real one: `birdSlate` back and wings,
  `birdCream` head and breast, a straight 0.030 dark bill, 0.130 total length, 0.075 tall
  standing. Two-tone, no field marks, no species-accurate plumage pattern.
- **A 2-link spring chain** (legs + body) that **counter-rotates against the torso** so the bird
  stays level no matter what Cool Pal does. Counter-gain 0.85, clamp ±35°. It never falls off.
  It never reacts. It is as unbothered as he is.
- Occasionally (every 8–14 s) it hops: shoulder → skull crown → shoulder, a 0.4 s arc. On the
  crown it perches at **`x = −0.100, y = 1.795, z = 0`** — on the braincase top plane, *between
  the two ears* (bases at `x = −0.120`) and **0.140 m aft of the yuzu** (§7.0, seated at
  `x = +0.040`). Head top reaches `y = 1.870`. Check this clearance in the build: bird, yuzu and
  ears now all live on a 0.21 m plate and the perch beat must not knock the fruit off. If they
  collide, move the bird aft, never the yuzu forward.
- **Dismemberment:** parented to `torso`, so it rides the torso. If the torso is destroyed, the
  bird gets a 0.3 s flap-away animation and despawns rather than ragdolling — a ragdolling bird
  is a bug report waiting to happen. Guard the despawn with a null check.
- Toggle: `prop_bird.visible` must be settable, and it must default **on**.

### 7.6 Sandals

Keep them; rebuild for three toes. Footbed `0.340 × 0.220 × 0.022` with a contoured arch and a
raised toe ridge; two crossed straps of `leatherTan` 0.038 wide with a visible buckle
(`metal-brushed`, 0.022) on the outer side; `soleRubber` outsole 0.018 thick with a 0.004 tread
normal. The three toes and their `horn` nails protrude past the footbed by 0.020.

### 7.7 Costume 1 delta

Costume 1 is the **teal** variant: teal knit, slate trousers, blue headphone accent (already in
the file). Add: the citrus wheel becomes a **thin lime-green** wedge, and the bird's cream goes
to a pale blue-grey. Nothing structural changes between costumes — same geometry, same bones.

---

## 8. Expression and motion notes

### Face poses

All five are combinations of four parameters: `lidCoverage` (fraction of eyeball the upper lid
covers), `browOffset` (metres, + = up/back), `mouthCorner` (degrees, + = up), `jawOpen`
(degrees). Author them as named blend targets.

| pose | lidCoverage | browOffset | mouthCorner | jawOpen | extras |
|---|---|---|---|---|---|
| **idle** | **0.52** | 0.000 | **+6°** | 0° | grass blade drifts; blink every 6.5 s ±2.0 |
| **angry** | **0.34** | −0.012 | −4° | 0° | *the eyes open when he's angry* — the inverse of the roster convention, and the whole joke. Nostril pad flares 14%. Ears rotate back 12°. |
| **hurt** | 0.62 | −0.006 | −9° | 8° | eyes shift 0.008 forward in the socket; upper incisors fully visible; one ear folds 30° |
| **KO** | **0.88** | +0.004 | +2° | 6° | head rolls 32°, both ears drop 25°, one lower incisor showing, the drink is *still upright in the holster*, **the yuzu is still on his head**, the bird is still standing on his shoulder |
| **taunt** | **0.96** | +0.008 | **+14°** | 0° | **eyes fully closed.** The maximum-unbothered pose. Chin lifts 8°, one slow single-ear flick, drink raised. |

Rules:
- `lidCoverage` never goes below 0.30 and never sits below 0.45 for more than 20 frames. He is
  never wide-eyed.
- The **angry pose opening the eyes** is the character's best face gag. It should land on
  `calmCounter` (the counter-hit) and on the finisher's first beat, and nowhere else.
- Corner angle never exceeds +14°. Past that he reads smug.

### Secondary motion (contract §11 spring solver)

| driver | freq | damping | amplitude | trigger |
|---|---|---|---|---|
| `earL`/`earR` | 4.2 Hz | 0.32 | max 14° lag | always; plus a solo random flick every 4–9 s |
| `belly` | 2.4 Hz | 0.22 | 0.030 vert / 0.018 lat | landings, `shoulderLean`, all hits, 6% on idle breath |
| `vestHem` (2 links) | 3.1 Hz | 0.30 | 0.040 | all locomotion, settles ~8 frames late |
| headphone cable (5 links) | 2.2 Hz | 0.26 | clamp 0.35 m | `phoneSwing`, jumps, knockdown |
| `yuzu` | 9.0 Hz | 0.60 | max 0.008 m lateral | always. Shivers on impact, resettles, **never falls** (§7.0) |
| `tail` | 7.0 Hz | 0.55 | max 8° | landings only. One twitch. |
| grass blade | 3.0 Hz | 0.40 | 12° | always |
| `prop_bird` | counter-gain 0.85, clamp ±35° | — | — | always; never falls |
| drink liquid | tilt = −0.6 × lean, clamp ±22° | — | — | always; never spills |
| whiskers | 0.6 Hz drift | 0.5 | 6° | always |

### Posture-driven personality in motion

The rule that unifies everything: **60% of the roster's amplitude, 140% of the roster's
duration.**

- **Anticipation is long, action is short, follow-through is minimal.** Every attack has a
  conspicuously slow wind-up (matching his 8–14 frame startups) and then arrives instantly. He
  does not follow through because he stops the moment the job is done. This is the physical
  expression of "counter specialist" and it should be legible without the frame data.
- **He returns to the exact same rest pose every time**, within 0.005 m. Other fighters settle
  into a variant; he snaps back to his one pose. It reads as unshakeable.
- **The head is the last thing to move and the first thing to stop.** 3 frames of lag on entry,
  0 frames of overshoot on settle. Everything else — belly, hem, ears, cable — overshoots and
  settles late. The contrast between a still head and a wobbling body is the comedy.
- **He never leaves the ground willingly.** `jump` should have a visible reluctance frame: 4
  frames of crouch, and the arms stay in the pockets through the entire ascent. The paws only
  come out for the attack that needs them, and they go straight back in on recovery — spec the
  return-to-pocket as part of every attack's recovery, not as an idle transition.
- **Walk:** 0.9 Hz cycle, 0.045 m vertical bob, hips lead by 4 frames, shoulders counter-rotate
  8°, the head stays dead level (a locked head over a bobbing body is the single funniest walk
  in the roster). The loaded-hip contrapposto resolves and re-forms each step.
- **`sitDodge`** (`SIT = [0, 0.34, 0]`): he simply sits down. On the way down the belly
  compresses 0.05 and the hem flares; on the way up he takes 6 frames longer than he needs to.
- **`napTime` / `stillCool`:** trigger `wetness` toward 0.6 and let the coat clump. If the arena
  supports it, this is where the hot-spring reference reads.

---

## 9. Parody safety (mandatory)

### Do not copy, reproduce, or reference

1. **The "Chill Guy" character by Phillip Banks.** The source drawing, posted to X on
   **4 October 2023** by **@PhillipBankss** (pseudonym "philb", a North Carolina artist) and viral
   from **30 August 2024**, is a **brown anthropomorphic dog with human proportions** in a **grey
   crew-neck sweater, blue jeans and dirty red low-top canvas sneakers**, hands in both pockets,
   **smirking at the viewer**.

   **Status as of this brief — and it has moved since the last draft:**
   - **21 November 2024:** Banks announced he had registered copyright in the artwork and issued
     cease-and-desist notices against "unauthorized merchandise and shitcoins", stating he does
     not and will never endorse crypto projects involving his work. The $CHILLGUY token had run
     to roughly **$580 M** market cap and fell to about **$220 M** on the news.
   - **2025:** Banks began **exploiting the character commercially himself** — authorised plush
     toys including a Youtooz collaboration, and an official pop-up retail event at Hong Kong's
     Festival Walk, **11 April – 5 May 2025**.

   The 2025 development *raises* our risk, and the old draft — which stopped at November 2024 —
   understated it. Two consequences. First, an active, enforcing rights-holder with a live
   licensing programme is far more likely to notice and act than a lapsed one. Second, and more
   specifically: **there is now official Chill Guy merchandise in soft-toy form.** A rounded,
   stylised, three-dimensional brown animal in casual knitwear is no longer only adjacent to a 2D
   drawing — it is adjacent to *product he sells*. Every deviation below is therefore load-bearing
   and none of them is negotiable for art-direction reasons.

   Hard prohibitions:
   - **No dog.** Cool Pal is a capybara — a rodent, a different order, a completely different
     skull. If any reviewer can call the head "a dog", the geometry has failed both the parody
     test and the safety test.
   - **No grey crew-neck sweater.** We use an **open-front ochre (or teal) chunky knit
     cardigan** with a rolled shawl collar and three undone buttons. Different garment,
     different colour family, different construction.
   - **No blue jeans.** We use **loose olive (or slate) canvas trousers with a rolled cuff**.
     Do not build a `denim` material for the trousers even though the preset exists.
   - **No red sneakers, and specifically no low-top canvas sneaker silhouette in any colour.**
     We use **worn tan leather sandals with a buckle**, over three visible hoofed toes. The toes
     being *outside* the footwear is itself a structural departure — the source's feet are fully
     enclosed.
   - **No human proportions.** The source is a dog head on a normally-proportioned human body.
     Ours is not: legs at **40% of standing height** (human 47–50%), arms at **0.35 of height**
     (human ≈0.44), belly wider than shoulders, head at **30% of standing height**. Nothing about
     this figure's mass distribution is human. Treat the proportion sheet in §2 as part of the
     legal defence, not just the art direction.
   - **No smirk-to-camera in the idle.** See item 2.
2. **Do not build the source pose.** The specific composition is: front-3/4 to camera, **both**
   hands in pockets, arms nearly straight, weight even, smirking directly at the viewer. Our
   idle is a **profile fighting stance** with the head yawed 18° and rolled 7°, weight loaded on
   one hip, the drink in a hip holster, and the eyes on the *opponent*, not the camera. The
   both-hands-in-pockets-facing-camera arrangement may appear **only as a ≤14-frame beat inside
   `taunt`**, never as the idle, the select-screen pose, the victory pose, or a UI portrait.
3. **No wordmarks, tickers, or captions.** No "chill", "chill guy", "chillguy", "$CHILL",
   "just a chill guy", or any variation, in geometry, `decalTexture()` payloads, texture keys,
   mesh names, `userData`, or comments that could end up in a shipped bundle. No coin roundel
   with any letterform on it. If a token disc is ever wanted, it is **blank with a milled edge**.
   The in-game captions his moves already print (`SIT. RELAX.`, `WISH YOU WERE HERE`) are our
   own writing and are fine — do not add source-adjacent ones.
4. **No specific real capybara.** Do not name, model, or reference any individual internet-famous
   capybara, any zoo's named animal, or any zoo's marks. In particular, the capybara-in-a-
   hot-spring image is strongly associated with **Izu Shaboten Zoo**, which originated the
   practice by accident in 1982 — **do not use that park's name, logo, signage, or the
   distinctive dress of its baths.** The gag we may use is the underlying cultural practice:
   **yuzu-yu**, the winter-solstice citrus bath, which predates all of this by centuries and is
   now run at 20+ Japanese parks. Keep the tub unbranded, plain wood, and generic.

   **This explicitly covers the yuzu on his head (§7.0), which is now a first-class element of
   the design, so be precise about why it is safe.** What we are depicting is an **animal
   behaviour** — capybaras nose floating fruit in bathing pools and end up wearing one — occurring
   at more than twenty separate Japanese parks every winter, arising from a **centuries-old
   public custom** (yuzu-yu) that has nothing to do with any company. Photographs *of* that
   behaviour are individually copyrighted; the behaviour is not, and neither is the fruit. So:
   - Build the fruit **from the numbers in §7.0**, not by matching any photograph's angle,
     lighting, crop or composition.
   - **One fruit, on the crown, plain.** No bath scene composed to match a known image, no steam
     framing lifted from a specific shot, no other capybaras in frame.
   - **No park name, logo, signage, tub styling, fencing or uniform** anywhere near it, in
     geometry, textures, mesh names or `userData`.
   - **No Japanese-language text** on or around the prop or the hot-spring arena dressing. Text
     is where trade dress hides.
   - The fruit is a **generic citrus**: a yellow ball with a stem scar. Do not model a
     cultivar-accurate yuzu with its distinctive knobbly rind pattern traced from reference.
5. **Do not portrait a real bird species.** The capybara-as-bird-perch is documented natural
   mutualism (yellow-headed caracara, cattle tyrant and wattled jacana are all recorded picking
   ticks and flies off capybaras) — the *behaviour* is free. But do not build a field-guide-
   accurate rendition of a specific species with its diagnostic markings, and do not compose the
   shot to match any particular viral wildlife photograph. Build **our own two-tone slate-and-
   cream invented bird** with no field marks.
6. **No sunglasses.** A brown animal in casual knitwear wearing dark shades is a different
   studio's mascot territory and it also fights the half-lidded eyes, which are the read. Cool
   Pal's eyes are always visible.
7. **No 1:1 tracing of photographic reference.** Everything here is specified in numbers for
   exactly this reason. Build to the numbers.

### Deliberate deviations — state these in your report; they are the defence

- **Species substitution.** The archetype is an attitude; we express it through a *capybara*.
  Rodent skull, dorsal nostrils, morrillo, vestigial tail, hoof-like nails, four-front/three-hind
  toes. None of that exists in the source. It is a different animal doing a different pose in a
  different medium in a different genre.
- **He is a fighting-game character with a 30-move kit**, animated, in a 3D arena, in profile.
  The source is a single static front-facing 2D illustration. Transformative on medium, purpose,
  framing and function.
- **Proportions are pushed well off species-correct**, and the specific pushes are documented:
  head length is **30% of standing height** where a real capybara's skull is ~19% of head-body
  length; **ears oversized ~40%** over anatomical (0.075 vs ~0.054) so they survive the 128 px
  silhouette test; **eyes oversized ~44%** (0.26 of head width vs ~0.18 anatomical) with a
  cartoon corneal bulge; the **morrillo is 70% taller than anatomical** (0.034 vs ~0.020) for
  the same silhouette reason; legs at **40% of height** where an anthropomorphised biped would
  be 47–50%. These are staging decisions, not measurements taken off any protected work.
- **The recognisable capybara cues we use are all public-domain species characteristics**, each
  independently documented in reference works: blunt/truncated rectangular rostrum; dorsally
  placed nostrils, small high orbits and small caudally-set pinnae as semi-aquatic adaptations;
  the straight braincase-to-rostrum transition specific to *H. hydrochaeris*; the 61:39
  facial-to-cranial length ratio from published skull morphometrics; barrel body; vestigial
  tail; four front / three hind slightly webbed toes with hoof-like nails; coarse 30–120 mm hair
  with no underhair, through which the skin is visible; reddish-brown above / yellowish-brown
  below with black on face, outer limbs and rump; the male morrillo. **Anyone may model a
  capybara.**
- **Our own colourway throughout.** Ochre/olive/tan (costume 0) and teal/slate/tan (costume 1).
  Neither costume contains the source's grey, blue, or red.
- **The unbothered expression is generated mechanically, not traced.** It is a single
  `lidCoverage` scalar driven by a composure value, animating continuously through 0.30–0.96
  across the move set. It is a *range the rig produces*, not a fixed copied face.
- **The pose is a fighting stance, not a standing portrait.** Contrapposto with a loaded hip,
  18° head yaw, 7° roll, dropped shoulders, one thumb hooked out, a drink in a *holster* rather
  than a hand. Every one of those choices is a deliberate departure from the source pose and
  each was made for a stated in-engine reason (profile camera, occlusion, move availability).
- **Four additive props the source has none of**, each doing real work: the crown yuzu (§7.0),
  the holstered tumbler with the citrus wheel (§7.1), the slung headphones (§7.4) and the
  shoulder bird (§7.5). The source character carries nothing at all. Prop load is one of the
  clearest distinguishing marks available and we are using all of it.

### Verification — run this, do not assert it

Each row is a thing you can look at in a screenshot. "It's different enough" is not a defence;
a filled checklist is.

| # | check | how you verify it | pass condition |
|---|---|---|---|
| 1 | not a dog | show a profile render to someone who has not read this brief and ask what animal it is | nobody says "dog" |
| 2 | garment | inspect the cardigan mesh | open front, shawl collar, 3 undone buttons, ochre/teal — **not** a closed grey crew-neck |
| 3 | trousers | inspect the material call | `cloth-weave`, `canvas` olive/slate — **no `denim` kind requested anywhere in the file** (grep it) |
| 4 | footwear | inspect the foot | sandals, buckle, **three bare hoofed toes protruding 0.020 past the footbed** |
| 5 | proportions | measure the built model | legs 40 ±1% of height, arms 0.35 ±0.01, head length 0.30 ±0.01 |
| 6 | pose | play `idle` and the select-screen pose | profile stance, eyes on the opponent; both-hands-square-to-camera appears **only** inside `taunt`, ≤14 frames |
| 7 | expression | play `idle` | no smirk to camera; mouth corners +6°, never above +14° |
| 8 | wordmarks | `grep -riE 'chill\|\$chill\|lowkey' src/characters/cool-pal.js` | zero hits, including comments and `userData` |
| 9 | colourways | sample both costumes | no grey, no blue denim, no red anywhere on the wardrobe |
| 10 | bird | inspect `prop_bird` | two-tone slate/cream, no field marks, no species-accurate pattern |
| 11 | yuzu | inspect `prop_yuzu` and any hot-spring dressing | plain citrus, no park marks, no Japanese text, no composed photo-match |
| 12 | report | your written report | lists which of these deviations you actually implemented, per contract §12.6 |

---

## 10. Reference notes

What I actually looked at, and what I took from each.

- **San Diego Zoo Wildlife Alliance Library, capybara characteristics factsheet**
  (`ielc.libguides.com/sdzg/factsheets/capybaras/characteristics`) — head/body **1070–1340 mm**,
  hindfoot **220–250 mm**; "barrel-shaped body and heavy, blunt muzzle"; **front legs shorter
  than rear legs**; nails "strong, hoof like"; **four toes front, three behind**, slightly
  webbed, star-shaped print; "eyes and small ears set high on head"; pelage "long, coarse and
  sparse", reddish-brown above / yellow-brown undercarriage with **"some black on the face,
  outer limbs and rump"**; males have "a large visible scent gland (**morrillo**) on top of
  snout". → drove §2 (leg ratio), §3.6, §3.3, §4 (toe counts, hoof nails), §5 (`faceDark`
  placement map).
- **Wikipedia, "Capybara"** — 106–134 cm long, **50–62 cm at the withers**, 35–66 kg; "heavy,
  barrel-shaped body and a broad head"; **"coarse fur ranges in length from 30 to 120 mm"** and
  **"lacks underhair, and there is no real distinction between guard hair and overhair"**;
  "blunt muzzles, with nostrils"; "slightly webbed feet and **vestigial tails**"; hind legs
  slightly longer than forelegs; sweat glands in hairy skin (unusual for a rodent); "buddha-like"
  reputation for **unflappability**. → this is the source of the §6 coat brief (the 30–120 mm
  bristle length is authored directly into the normal map spec), §4 tail nub, and §1's framing.
- **Animal Diversity Web, *Hydrochoerus hydrochaeris*** — "barrel-shaped, sturdy, and tailless";
  eyes/ears/nostrils **"on top of the head"**; **morillo** described as "a bare lump on the
  snout that secretes white liquid"; fur "coarse and thin", skin visible; partially webbed feet.
  → drove §3.2 (dorsal nostrils as a hard requirement) and §3.3 (bare, hairless, secreting →
  the waxy/semi-gloss surfacing call).
- **Animal Diversity Web, Hydrochoerinae** — "**coarse and sparse, consisting mostly of
  bristle-like hairs; the brown or gray skin can be seen through the hairs**"; "lacks down
  hair"; adult males have "a large oval gland on rostrum, which is quite visible". → this
  sentence *is* §6's `skinUnder` 18%-coverage mottle. It is the surfacing decision that
  differentiates Cool Pal from every other furred fighter.
- **"Skull of Capybara (*Hydrochoerus hydrochaeris*) — Morphometric Parameters", Acta Scientiae
  Veterinariae** (seer.ufrgs.br, 8 skulls, 35 parameters) — **facial part length 137.90 mm mean,
  cranium part length 87.76 mm mean** (→ **61.1% : 38.9%**, and a total skull ≈ 225.7 mm);
  skull index 57.86, cranial index 50.49, facial index 49.22, nasal index 26.73. → this is the
  numerical basis for the §2 longitudinal split and the §3.1 block lengths. The nasal index of
  26.73 (narrow nasals relative to length) is why the muzzle tapers only 13% in width instead of
  flaring.
  **Caveat you must carry into the build:** these are *CT/caliper landmarks*, not surface
  landmarks. "Facial part length" is measured from the **cribriform plate of the ethmoid** to the
  rostral edge of the incisive bone — the cribriform plate sits well inside the skull, under the
  braincase, not at the visible brow break. So the 61.1 : 38.9 split is **not** a measurement of
  where the forehead break appears on the outside of a live animal; it is an internal division we
  have chosen to stage as an external one, which lengthens the visible muzzle. That is a
  deliberate cartooning decision and it belongs in the §9 deviations list, not in a claim of
  anatomical accuracy. Keep the ratio — it works — but do not defend it as literal.
- **Pereira et al., "Anatomy of the skull in the capybara using radiography and 3D computed
  tomography", *Anatomia, Histologia, Embryologia* 2020** (via abstract + ResearchGate summary)
  — "more robust and **rectangular** skull, elongated face caudally, thinned in the nasal region
  and **slightly convex in the parietal region**"; "the **orbit had a circular shape**";
  well-developed infraorbital foramen; large diastema, no canines; strong allometry in rostrum
  vs cranial vault length. → drove §3.1 (rectangular blocks, the 5.8° brow break) and §3.4
  (circular orbit → a round eye, not an almond).
- **Corrected citation.** The interspecific finding — that **the two capybara species differ in
  the braincase-to-rostrum angle, *H. hydrochaeris* having a straight transition while
  *H. isthmius*'s snout is inclined ventrally** — is **not** from the Pereira 2020 CT paper, which
  the old draft credited. It is from the 3D geometric-morphometrics growth study of
  *Hydrochoerus* spp. (171 *H. hydrochaeris* + 44 *H. isthmius* specimens, newborn to adult),
  *Mammalian Biology* 2016. That is the source for §3.1's instruction to build the
  straight-transition species.
- **A-Z Animals, "Capybara Teeth"** + supporting dental coverage — **cleft upper lip**;
  massive chisel-like incisors; orange/yellow front enamel; broad rostrum and truncated snout.
  → drove §3.7 (philtrum groove, incisor dimensions, the `incisor #E8C87A` front colour and the
  payoff for the yawn).
- **ACS / Northwestern, "Iron-rich enamel protects, but doesn't color, rodents' orange-brown
  incisors" (April 2024)**, plus the *Chemistry World* write-up — **corrects the old draft.**
  Polishing away the coloured surface layer on rodent incisors reveals that the iron-rich enamel
  beneath is **white**; the orange-brown comes from a **thin surface layer of aromatic amino acids
  and inorganic minerals** sitting on top of it. The iron is structural (hardness, acid
  resistance), not chromatic. → this is why §3.7 now specifies a **two-tone tooth**: a 0.0006
  orange coating on the labial face only, over a pale `incisorCore` that shows at the chisel
  bevel, the lingual face and the wear notch. "Iron-pigmented orange enamel" is the wrong model
  and it would have produced a solid-orange tooth with no edge value.
- **Dimensions.com, capybara** — 51–61 cm height, 107–135 cm body length, 35–66 kg. Confirms the
  height:length ≈ **1 : 2.2** ratio of the quadruped, which is what I carried into the
  anthropomorphised barrel: belly wider than shoulders, legs at 40%.
- **Know Your Meme, "Just a Chill Guy / My New Character"; Wikipedia, "Chill Guy"** — the source
  character is a **brown anthropomorphic dog with human proportions** in "**a grey crew-neck
  sweater, blue jeans and dirty red Converse shoes**", "hands in his pockets", **smirking** at the
  viewer; posted to X by **@PhillipBankss** (philb, North Carolina) on **4 October 2023**, caption
  "my new character. his whole deal is he's a chill guy that lowkey doesn't give a f***"; went
  viral **30 August 2024** via a TikTok slideshow. → this is the exact trade dress enumerated and
  prohibited in §9.1, and the exact pose prohibited in §9.2. Note the two details the old draft
  softened: the sneakers are a specific **low-top canvas** silhouette, and the body is **human-
  proportioned**, which is why §9.1 now prohibits both explicitly.
- **CoinDesk (21 Nov 2024), "Chillguy Creator Threatens Legal Action…"; Know Your Meme news; DL
  News; Crypto Times; Asia IP; Wikipedia** — on **21 November 2024** Banks stated he had
  copyrighted the character and would issue **DMCA takedowns / cease-and-desists on for-profit
  uses, specifically naming merchandise and shitcoins**, adding that he does not and never will
  endorse crypto projects using his work. $CHILLGUY had reached about **$580 M** market cap and
  fell to roughly **$220 M**. Banks was subsequently doxed and locked his account. → this is why
  §9 is written as hard prohibitions rather than guidance, and why the species swap to a capybara
  is a structural requirement of the design rather than a flavour choice.
- **Post-2024 developments the previous draft of this brief did not have** (Wikipedia, "Chill
  Guy", licensing section) — during **2025** Banks moved from pure enforcement to **authorised
  commercial exploitation**: licensed plush toys including a **Youtooz** collaboration, and an
  official pop-up at **Hong Kong's Festival Walk, 11 April – 5 May 2025**. → this materially
  raises our exposure and is now stated in §9.1. An active licensing programme means an attentive
  rights-holder, and licensed *plush* means the source character now exists as a rounded 3D
  object — the exact form factor a stylised fighting-game model occupies. Re-check this section
  before ship; it has moved once and may move again.
- **Tokyo Weekender, "Capybara Onsen Baths"; Japan House (Univ. of Illinois), "Touji and
  Capybaras"; Izu Shaboten Zoo's own English page; MATCHA** — the tradition began **by accident
  in 1982** at Izu Shaboten Zoo when a keeper noticed capybaras soaking in hot cleaning water;
  the baths run **mid-November to early April**; **yuzu citrus** is added around the winter
  solstice / New Year, mirroring the human **yuzu-yu** custom believed to ward off colds; the
  practice is now at **20+ parks**. → drove the `citrus` accent in §5, the citrus wheel in §7.1,
  the `wetness` surfacing variant in §6, and — importantly — the §9.4 distinction between the
  *park's* trade dress (prohibited) and the *cultural practice* (free).
- **Feeding-association literature on capybara/bird mutualism** (ResearchGate: "Feeding
  associations between capybaras and birds in the Lami Biological Reserve"; "Feeding
  associations between Capybaras and jacanas"; Springer, *Ornithology Research* 2023) — birds
  use capybaras (1) as a **perch to hunt from**, (2) as a **beater** that flushes arthropods,
  and (3) forage **directly in the skin for ectoparasites**; documented species include the
  **yellow-headed caracara, cattle tyrant and wattled jacana**; feeding bouts *on* capybaras are
  significantly longer than off. → drove §7.5, including the "it never leaves and never reacts"
  behaviour spec, and §9.5's instruction to invent our own species rather than portrait a real
  one.
- **Existing `src/characters/cool-pal.js`** (read in full: palette `C`, `buildModel`, all 33
  clips, all 9 move scripts, the `forcedVacation` finisher, `CoolPalDef`) — captured the bone
  map (**12 names, no shin bones**), `HIP_Y = 0.85`, `SIT = [0, 0.34, 0]`, `height 1.8`,
  `weight 1.25`, the costume-0/1 branches, the `phones`-as-weapon requirement, the decor-mesh
  helpers, `desaturate()`/`restoreColors()`, and the five move `forward`/`up` reach constants
  that must be re-verified after any limb change. Also produced the nine-item fix list at the
  top of this brief — of which **the front-mounted nose (`x = 0.475`) is the single most
  damaging error**, because it converts a capybara into a generic bear at every viewing distance.

---

### Definition of done for this character (restating contract §12 in local terms)

0. **Reachability, before anything else.** Print the built shoulder-ball → wrist distance in both
   idle poses. It must be **≤ 0.500 m** (§2, §4). If it is not, the paws are not in the pockets no
   matter what the render looks like, and everything downstream is decoration on a broken pose.
1. **Black-fill at 128 px:** the flat top line, the yuzu sitting on it, the two rear ear nubs, the
   vertical nose plane and the belly-forward barrel are all readable. **The pocket triangles are
   not on this list and must not be traded for** — see §2.
2. **Profile screenshot from the match camera:** the eye sits on the braincase (never on the
   muzzle), the morrillo shows one specular pip on the top line, the rhinarium reads as a dark cap
   terminating the nose, the throat wedge is ≥ 0.10 m clear, and the tilted drink breaks the hip
   silhouette by ≥ 0.09 m.
3. **3/4 screenshot:** the two dorsal nostril slits are visible on the *top* of the snout, the
   cleft upper lip notch reads, the elbow corner separates from the belly by value and rim (not by
   a void), and the skin-through-fur mottle is visible at 30 cm.
4. **Yawn frame (`yawnPush`):** all four orange incisors visible, jaw ≤ 14°, and `incisor` is
   the brightest value in frame.
5. **No gaps** at the neck (skull rear plate vs shoulder collar), wrists, ankles, ear bases or
   headphone cushions in any frame of `logOff`, `touchGrass` or `vacation` (the three longest
   clips), at head yaw ±35° and pitch ±25°.
6. **Prop integrity:** the drink returns to its holster on every clip exit and across round
   reset; the bird never falls off, never ragdolls, and despawns cleanly on torso destruction;
   the **yuzu is present in every frame of every clip including `knockdown`, the KO and the
   finisher**; the headphone cable never exceeds 0.35 m from its cup.
7. **Palette compliance:** every albedo hex in the file has all three channels in **30–240**
   (contract §0). Grep the palette object and check it — four of the old values failed.
8. **No unknown texture kinds:** grep every `surfaceMaps(` call and confirm each string appears
   literally in contract §3's kind list. One unknown kind is one `console.warn`, and `window.__errs`
   must be empty (contract §12.2). `foliage` is a *preset*, not a kind.
9. `npm run build` clean, `window.__errs` empty, frame time within 15% on `high`.
10. Your report lists **which §9 deviations you actually implemented** (use the §9 verification
    table), confirms the five move reach constants were re-verified against the harness, **and
    lists every clip whose `phones` keys you re-derived** after the headphones moved to the
    shoulders (§7.4).
