# CRYPTO PUNK'D — parody-likeness build brief

**Fighter:** `src/characters/crypto-punkd.js` · `CryptoPunkdDef` · `id: 'crypto-punkd'`
**Source archetype:** the 24×24 pixel-avatar NFT collection (10,000 algorithmically-composited
8-bit portrait heads), crossed with a 1940s film-noir gumshoe.
**Contract authority:** `GRAPHICS_CONTRACT.md` §9 (parody mandate), §3/§4 (textures & materials),
§0 (five AAA criteria), `CONTRACTS.md` §4 (rig/def API — frozen).
**Author:** character-art-direction pass. **Every pixel coordinate in §3 was measured off the
actual 2400×2400 source composite image, decoded pixel-by-pixel** (see §10). Build to the
numbers. Where this brief gives a ratio, it is load-bearing.

### Axis convention (get this right first)

The rig faces **+X**. In this file `box(w, h, d)` means **w → X (forward/depth), h → Y (up),
d → Z (lateral width)**. Ears/eyes are separated along **Z**. Feet at `y = 0`.
`def.height = 1.85` — **do not change it**; hitboxes and move-script `forward`/`up` constants
are calibrated to it.

### The lattice (memorise this number)

**`VX = 0.024` m.** One voxel = 24 mm. Every voxel on the head and every accessory that grows
out of the head snaps to this lattice — position *and* size are integer multiples of `VX`. There
are no half-voxels anywhere above the collar. (24 mm on a 24×24 grid is a coincidence, but it is
a useful mnemonic: *one millimetre per grid unit*.)

### Coordinate conventions (read this before you build anything above the collar)

Two conventions are in play in this document and mixing them up will produce a head that is
half a voxel wrong everywhere. They are:

1. **Every explicit `(x, y, z)` triple given for a voxel or a voxel block is that voxel's
   MINIMUM CORNER on all three axes.** A voxel written at `(0.180, 1.442, −0.108)` occupies
   `x ∈ [0.180, 0.204]`, `y ∈ [1.442, 1.466]`, `z ∈ [−0.108, −0.084]`. A 3×3×3 block written at
   the same point occupies `[0.180, 0.252] × [1.442, 1.514] × [−0.108, −0.036]`.
2. **The `x = …` values in §3.4, §3.6, §3.9 and §7.4 that describe a plane are FRONT-FACE
   positions**, not min corners, because that is how "proud" and "recessed" are naturally
   expressed. They are always written as "front face at `x = …`". The head's front plane's
   front face is at `x = +0.108`; one voxel proud is `+0.132`; one voxel recessed is `+0.084`.

The three lattices, in bind pose, in world metres:

```
x (forward/depth) min corners: −0.108 + 0.024·k,  k = 0…8      (head is 9 vx deep)
y (up)            min corners:  1.442 + 0.024·k,  k = 0…16     (head is 17 vx tall)
z (lateral)       min corners: −0.132 + 0.024·k,  k = 0…10     (head is 11 vx wide)
```

Anything that does not land on one of those three sets is a bug. **Assert it in the builder**
(`console.assert(Math.abs(v / VX - Math.round(v / VX)) < 1e-6)`) — it costs nothing and it will
catch the half-voxel errors that make a voxel model look decimated instead of authored.

### Bone pivots (bind pose, world metres)

`buildModel` must place these; §3's y-values are **world bind-pose** values, so head-local
coordinates are `world − headPivot`.

| Bone | World pivot | Note |
|---|---|---|
| `hips` | `[0, 0.860, 0]` | **frozen** |
| `torso` | `[0, 0.940, 0]` | hips + 0.080 |
| `armL` / `armR` | `[0, 1.360, ±0.230]` | torso pivot + 0.420 in Y; `+z` = character's left |
| `head` | `[+0.045, 1.394, 0]` | mid-neck, 2 vx below the chin; the `+0.045` is §4.5's chin-forward carry |
| `hat` | head-local `[−0.060, +0.432, 0]` | crown-rear pivot; see §7.2 for the tilt |
| `coat` | `[0, 1.010, 0]` | belt line |

### Rig is frozen

`buildModel(costume)` must keep returning exactly these bone names in this hierarchy — 31 clips
and 10 move scripts key off them:

```
group > hips > { legL > shinL, legR > shinR, torso }
torso > { coat, head > hat, armL > forearmL, armR > forearmR > lens }
```

Also frozen, because scripts read them directly:

| userData | Owner | Read by |
|---|---|---|
| `forearmL/R.userData.handMesh` | each forearm | `handPunchScript` (Detached-Hand Punch) |
| `lens.userData.glassMat`, `.glassBaseHex` | `lens` | `lensStrikeScript` |
| `head.userData.faceTex` | `head` | currently unused externally — **may be repurposed**, see §8 |

`hips` base local position stays `[0, 0.86, 0]`; clip hip keys are absolute and are rescaled by
`HIP_SCALE`. **No new bones.** Nothing may be parented directly to `group` — `Gore._detach()`
clones a bone's entire subtree, and that is the only mechanism by which props survive
dismemberment (§7).

---

## 0.1 Declared divergences from `GRAPHICS_CONTRACT.md`

The contract's §0 rule is explicit: *"you may not silently diverge."* This character diverges in
five places. **Every one of these must be restated verbatim in the agent's report.** They are
sanctioned; hiding them is not.

| # | Contract clause | What we do instead | Why it is the right call here |
|---|---|---|---|
| **D1** | §9: *"real eye geometry (sclera + iris + pupil + specular highlight + lid geometry)"* | **No sclera and no iris.** The eye is a 3-band voxel construct: `skin-shade` brow band, a proud `voxel-ink` lid, a recessed ink pupil voxel + a `eye-glint` highlight voxel (§3.4). Lid geometry ✓, pupil ✓, specular highlight ✓, sclera ✗, iris ✗. | The source archetype's eye is a 2×2 cell with no sclera at all. Adding a white sclera to a 2-voxel eye is the single fastest way to make this read as "3D character with a pixel texture" instead of "pixel character". The contract's intent — *the eye must be geometry, not a painted quad* — is fully met: our eye has 2 voxels of real depth relief and casts a real shadow. |
| **D2** | §0, criterion 1: *"spatially varying roughness"* on every surface | **The head has exactly constant roughness** (0.62 skin / 0.48 ink / 0.34 fin), no roughness map, no variation. The rest of the model spans 0.16 (pipe stem) to 0.86 (fedora felt), with the coat alone swinging 0.62–0.80. | See §6. Varying roughness is what tells a viewer "this is a physical material". The head must read as a *picture*. The delta between head and body is the surfacing expression of the gag. |
| **D3** | §4: `flatShading` *"off by default"*, faceting from bevelled geometry | **`flatShading: true` on all head materials.** | The contract itself carves this out: *"flat shading stays available because some parody looks depend on it."* This is the character that clause was written for. |
| **D4** | §11: *"Nothing moves linearly"*, anticipation/overshoot/settle | **Everything above the collar snaps**: whole-voxel translations, ≤ 2 frames, no easing, no interpolation, zero secondary motion (§8.3). The `hat`, `coat`, tie and storm flap obey §11 fully. | The comedy is the contrast. A pixel face that eases is the single most immersion-breaking thing available. The contract's motion bar is met by everything that is not the head. |
| **D5** | §9: *"No gaps: joints must be visually continuous"* | The **wrist dissolve** (§4.3) puts loose voxels around the wrist. | The wrist joint itself stays fully sleeved and continuous underneath — the dissolve voxels sit *on top of* a closed joint, each sharing at least one full face with the cuff or with another dissolve voxel (§4.3). There is no actual hole. |

Nothing else in this brief may diverge. If the build forces a sixth divergence, it goes in the
report, not into the file quietly.

---

## 1. The 2-second test

**A hard-edged, hard-cornered pale-teal rectangle of a head — visibly built out of chunky
cubes, ringed on every silhouette edge by a one-voxel dark keyline, with two 2×2-cube eyes, a
three-cube mouth bar and a violet cube mohawk spiking straight up off the front of the
crown — sitting on top of a completely smooth, tailored, mid-value khaki trench coat with a
belted waist and an A-line hem.** That is the whole joke and the whole read: *the head is 8-bit
and the body is not.* The single strongest cue is not the mohawk or the pipe — it is the
**resolution mismatch at the collar**: a stepped, aliased, staircase-edged cube head emerging
from a soft, draped, bevelled gabardine collar. If a viewer's eye lands on that seam, they name
the reference instantly, because "a pixel-art avatar head on a real body" is the entire visual
grammar of the source archetype.

Colour half of the read: **one large pale cool-teal mass (the head) against one large warm
mid-khaki mass (the coat), separated by a near-black keyline and a near-black hat.** The head
is the lightest thing on the model and the only cool thing on the model. Warm body / cool head
is the contrast that survives being 40 px tall in the corner of a busy arena.

Second beat, half a second later: the **staircase**. Every profile on the head — the crown, the
mohawk fin, the pipe, the goggle strap — steps in 24 mm increments and never curves. Everything
below the collar curves and never steps. Do not let a single bevel radius on the head exceed
8% of `VX`, and do not let a single hard corner survive below the collar.

**And the frame the test is actually run on.** The source archetype is always a straight-on
portrait — the dead-flat frontal *is* half of what makes a pixel avatar read as a pixel avatar,
and a head that is permanently yawed and tipped never gives a viewer that frame. So the
round-start and `victory` poses hold the head at **exactly zero yaw, pitch and roll for ≥ 0.6 s**
(§4.5), with the fedora's 18° tilt supplying all the character. That is the frame a screenshot
lands on, and it is where the 2-second test is won or lost.

---

## 2. Silhouette specification

Filled black, the figure must read as: **rectangle + fin, on a triangle.**

### Vertical landmark table (feet at `y = 0`, metres)

| Landmark | y | as fraction of 1.85 H |
|---|---|---|
| Sole (shoe bottom) | 0.000 | 0.000 |
| Shoe top / ankle | 0.090 | 0.049 |
| Knee — **coat hem line, all round** | 0.420 | 0.227 |
| Coat hem, lowest point (the two front-panel corners, cut 0.020 longer) | 0.400 | 0.216 |
| Hip pivot (`hips` bone) | **0.860** | 0.465 |
| Back-vent top (button) | 0.900 | 0.486 |
| Belt centreline (`coat` bone pivot) | 1.010 | 0.546 |
| Lowest coat button (of 6 visible) | 1.020 | 0.551 |
| Storm-flap bottom edge | 1.220 | 0.659 |
| Shoulder line (deltoid top, `armL/R` pivot y) — storm-flap top | 1.360 | 0.735 |
| **Neck base (bottom of the neck voxels)** | **1.370** | 0.741 |
| `head` bone pivot | 1.394 | 0.754 |
| **Chin — bottom of the voxel skull** | **1.442** | 0.780 |
| Collar top (popped) — sits 0.028 **above** the chin, framing it | 1.470 | 0.795 |
| Mouth bar (row r13) | 1.514–1.538 | — |
| Nose (row r10) | 1.586–1.610 | — |
| **Eye band (rows r6–r7)** | **1.658–1.706** | 0.896–0.922 |
| **Crown — top of the voxel skull** | **1.850** | 1.000 |
| Fedora crown-base ring (untilted construction plane) | 1.826 | — |
| Fedora crown top (untilted; the 18° tilt is applied to the whole `hat` group afterwards) | 1.941 | 1.049 |
| Mohawk fin tip | **1.994** | 1.078 |
| Smoke puff, top of cluster | 1.826 (floating, forward at x ≈ +0.22) | — |

The fedora rows are **untilted construction heights**. §7.2 rotates the entire `hat` group about
its pivot; the tilted silhouette extremes are a consequence of that rotation and are not authored
numbers. Do not hand-place the brim to hit a target y.

**Hurtbox note:** `def.height = 1.85` is the skull crown, not the fin tip. The mohawk fin
(1.850 → 1.994) and the fedora are **cosmetic and must sit outside the head hurtbox** — a fin
that can be hit is a bug, and `CONTRACTS.md §4` hurtbox sizes may not change.

### Proportions

- **Head height (chin → crown, hat excluded): 0.408 m = 17 × VX.**
  `1.85 / 0.408 = ` **4.53 head-heights.** Deliberately squat — a 7-head hero proportion makes
  the pixel head look like a bug rather than a joke. Compare `tired-ape` at 5.0.
- **Head width: 0.264 m = 11 × VX.** Aspect **11 : 17 = 0.647** — the head is **1.55× taller
  than it is wide**. This is measured directly off the source and it is the single most
  commonly-botched thing about pixel-avatar parodies: they build a *cube*. It is not a cube.
  It is a **tall slab with a flat top**.
- **Head depth: 0.216 m = 9 × VX.** Shallower than it is wide (9 vs 11) so the front plane
  dominates from every angle short of full profile. Depth : width = 0.818.
- **Shoulder span (deltoid outer, coat on): 0.520 m = 1.97 × head width.** "Two heads across
  the shoulders." With epaulettes the shoulder *cap* reaches 0.545 m.
- **Waist (belted): 0.360 m.** Taper ratio waist/shoulder = **0.69** — lean, not heroic. He's a
  detective, not a bruiser.
- **Coat hem span: 0.640 m** at `y = 0.42`, i.e. the coat flares to **1.23× the shoulder span**.
  This trapezoid is the whole lower silhouette.
- **Stance width: 0.420 m** between the outer edges of the shoes (0.227 H).

### Where the mass sits

Three masses, top-heavy on purpose:
1. **Head + hat + fin block** — 0.55 m tall, 0.40 m wide (brim). ~29% of total height. The
   heaviest single shape in the silhouette.
2. **Coat trapezoid** — from shoulders (0.52) to hem (0.64), 0.94 m tall. The base of the
   composition.
3. **A near-empty middle.** The arms hang inside the coat's outline for most poses. The
   silhouette between shoulder and hem is almost featureless. That emptiness is what lets the
   head block read.

### Negative space (this is what defines the shape)

- **The gaps in the pipe smoke column.** Bowl → trail voxel → trail voxel → puff, with a
  **3-voxel (0.072 m) empty gap between every element and the next**, four elements, three gaps,
  all on the lattice (§7.3 gives the exact coordinates). 0.072 m is 5 px at a 128 px render — the
  smallest gap that survives the silhouette test, which is why it is 3 vx and not the source's
  1 px. A detached column of cubes hovering forward of the head is a silhouette event nothing
  else in the roster has. **Do not connect it, and do not shrink the gaps.**
- **The wedge between the tilted hat brim and the mohawk fin.** The fedora is worn pushed back
  **18°**; the fin rises in front of it. Between the fin's rear edge and the brim's front edge
  there is a triangular void ~0.06 m wide at its mouth. If the hat sits flat, that void closes
  and you lose both the fin *and* the gumshoe tilt.
- **The open-coat V.** The trench is worn open above the belt: a V of dark shirt/tie from the
  collar notch (1.44) down to the belt (1.01), 0.10 m wide at the top, 0.22 m at the bottom.
- **Two hem triangles.** The coat is open below the belt too; the front panels swing out,
  leaving a triangular void either side of the shins, 0.10 m wide × 0.30 m tall.
- **The staircase itself.** Every step on the head profile is a 24 mm notch of background.

### What must survive at 128 px

At 128 px for 1.85 m, **1 px ≈ 14.5 mm** and one voxel is **1.66 px**. Individual voxels will
*not* resolve. Plan for that:

| Must read at 128 px | Must not be relied on |
|---|---|
| The head **rectangle** with its flat top and hard corners | Individual face voxels |
| The **1-voxel ink keyline** around the whole head silhouette (≈1.7 px of near-black — this is what separates head from arena) | The eye/nose/mouth voxel shapes |
| The **mohawk fin** as a distinct 3-vx × 6-vx spike above the crown | The stubble block |
| The **hat brim ellipse**, tilted | The goggle strap detail |
| The **coat A-line trapezoid** and the belt pinch | Buttons, epaulettes, stitching |
| The **detached smoke cluster** | The smoke's internal shape |
| The **staircase quality** of every head-adjacent edge (aliased, not smooth) | — |

**The keyline is non-negotiable.** The source is a 24×24 image whose every form is enclosed by
a 1-px black outline. Reproducing that as a **one-voxel-thick shell of `voxel-ink` on the head's
outer silhouette (crown row, both side columns, chin row, and the outer ring of the side and
back planes)** is the cheapest and most effective single thing in this brief. It gives the head
a permanent dark edge in every arena, at every distance, under every light.

---

## 3. Head construction

**This is the section that decides whether the parody lands.** Build exactly this.

### 3.1 The grid

The head is a 3D extrusion of an **11 wide × 17 tall** front-plane grid, **9 voxels deep**.
Rows are numbered `r0` (crown) → `r16` (chin). Columns are numbered `c0` (character's left
edge) → `c10` (right edge); **`c5` is the centreline**.

Metre conversion, always — **note the two functions return different things**, per the
conventions block at the top of this file:

```
y(row r)    = 1.442 + (16 - r) * 0.024   // MIN CORNER (bottom edge) of row r
z(col c)    = (5 - c) * 0.024 - 0.012    // MIN CORNER of column c;  +z = character's left
zc(col c)   = (5 - c) * 0.024            // CENTRE of column c (c5 centre = 0, on the centreline)
xFront      = +0.108                      // FRONT FACE of the front plane = 4.5 * VX from centre
```

Sanity checks you can run in your head: `y(r16) = 1.442` (chin), `y(r0) = 1.826` and its top edge
`1.850` (crown). `zc(c0) = +0.120`, so c0 spans `+0.108…+0.132` and the head's half-width is
`0.132` ✓. `zc(c10) = −0.120` ✓.

### 3.2 The front-plane map — build this literally

Legend: `#` = `voxel-ink` (silhouette shell / features) · `S` = `skin-base` ·
`s` = `skin-shade` · `H` = `skin-hilite` · `E` = eye cell (see 3.4) · `B` = `stubble` ·
`·` = empty (no voxel).

```
      c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10
 r0   ·  ·  #  #  #  #  #  #  #  ·  ·     crown cap — 7 wide
 r1   ·  #  S  S  S  S  S  S  S  #  ·     9 wide
 r2   #  S  S  H  S  S  S  S  S  S  #     11 wide from here down
 r3   #  S  H  S  S  S  S  S  S  S  #     H,H = the 2-voxel highlight DIAGONAL
 r4   #  S  S  S  S  S  S  S  S  S  #     (a light response, not a feature — see below)
 r5   #  S  s  s  s  s  s  s  s  S  #     brow shadow band (full width)
 r6   #  S  E  E  S  S  S  E  E  S  #     eye row A — lid
 r7   #  S  E  E  S  S  S  E  E  S  #     eye row B — pupil + glint
 r8   #  S  S  S  S  S  S  S  S  S  #
 r9   #  S  S  S  S  S  S  S  S  S  #
 r10  #  S  S  S  #  s  #  S  S  S  #     nostrils: ink at c4 and c6
 r11  #  B  B  B  B  B  B  B  B  B  #     stubble starts
 r12  #  B  B  B  B  B  B  B  B  B  #
 r13  #  B  B  B  #  #  #  B  B  B  #     mouth bar — 3 wide, c4–c6
 r14  #  B  B  B  B  B  B  B  B  B  #     expression voxel lives at c3/c7
 r15  #  B  B  B  B  B  B  B  B  B  #
 r16  ·  #  #  B  B  B  B  B  #  #  ·     chin taper — 7 of stubble
```

The highlight is a **diagonal pair** — `r2 c3` and `r3 c2`, stepping down-and-outward toward the
character's left. That diagonal is the source's own construction (its two highlight pixels are
diagonally offset, not stacked) and it costs the same two voxels as a vertical pair while reading
as a light direction rather than a smudge. Key light comes from the character's left; the
highlight, the eye glints (§3.4) and the nose bridge all agree with it.
(In costume 0 the pushed-up goggles occupy r1–r3, so the pair shifts down one row to `r3 c3` and
`r4 c2` — see §7.4. Costume 1 has no goggles and uses the r2/r3 positions above.)

Below `r16`: **neck**, 3 voxels wide (`c4`–`c6`), 3 rows deep (`y = 1.370 … 1.442`), skin, with
a `voxel-ink` column on each flanking side. Neck length is therefore **0.072 m, chin to neck
base**. The popped collar top is at `y = 1.470`, i.e. **0.028 m above the chin** — the collar
does not meet the neck at its top, it overlaps and frames the jaw. The neck is never visible in
the neutral pose; it exists so head yaw does not open a hole.

### 3.3 Measured ratios — do not "improve" these

All measured off the source composite (§10). Head width `W = 0.264`, head height `Hh = 0.408`.

| Feature | Value | As a ratio |
|---|---|---|
| Eye cell width | 2 vx = 0.048 m | **0.182 W** |
| Eye cell height | 2 vx = 0.048 m | 0.118 Hh |
| Inter-eye gap | 3 vx = 0.072 m | 0.273 W |
| Eye-pair total span (outer to outer) | 7 vx = 0.168 m | **0.636 W** |
| Cheek margin, eye outer edge → head interior edge | 1 vx = 0.024 m | 0.091 W |
| Eye-band centre height above chin | 0.240 m | **0.588 Hh** (i.e. **41% down from crown**) |
| Nose width (outer nostril to outer nostril) | 3 vx = 0.072 m | 0.273 W |
| Nose height | 1 vx | 0.059 Hh |
| Nose centre above chin | 0.156 m | 0.382 Hh |
| Mouth width | 3 vx = 0.072 m | **0.273 W** |
| Mouth height | 1 vx | 0.059 Hh |
| Mouth centre above chin | 0.084 m | 0.206 Hh |
| Eye-centre → nose-centre | 0.084 m | 3.5 vx |
| Nose-centre → mouth-centre | 0.072 m | 3.0 vx |
| Crown → eye centre | 0.168 m | 0.412 Hh |
| Skull interior width | 9 vx | 0.818 W |
| Keyline shell thickness | 1 vx everywhere | — |

**Read those numbers again.** The eyes are *small* (0.182 W each) and sit *high* (41% down from
the crown, versus ~50% on a real human head). The mouth is *tiny* (0.273 W) and sits *very low*
(0.206 Hh above the chin). The entire feature cluster occupies rows r5–r14 — the middle 59% of
the head — with a **completely blank 5-row forehead above and a 2-row chin below**. That blank
forehead is the source's signature and the thing every bad parody fills with detail. **Leave it
empty.** Two highlight voxels are the maximum permitted decoration above r5.

### 3.4 Eye construction — the most important 96 mm on the model

The source eye is a **2×2 cell, two tones, one dark pixel**. Ours is a deliberate structural
deviation (see §9) — a **3-band eye** that gives us real geometry and a blink:

```
                 <- character's left (+z)          character's right (-z) ->
 r5   s  s   |   s  s     brow-shadow band, skin-shade, 2 vx wide per eye, FLUSH (front face x = +0.108)
 r6   #  #   |   #  #     upper lid: voxel-ink, 2 vx wide, PROUD 1 vx (front face x = +0.132)
 r7   G  P   |   G  P     glint (G = eye-glint) then pupil (P = voxel-ink), 1 vx each,
                          RECESSED 1 vx (front face x = +0.084)
      c2 c3      c7 c8    column assignment, explicitly:
                          left  eye: glint c2, pupil c3
                          right eye: glint c7, pupil c8
```

- **Recess the pupil row by exactly one voxel.** This is the whole trick. A pixel face painted
  on a flat plane reads as a texture; a pixel face with a **1-voxel-deep socket** casts a hard
  24 mm shadow under the ink lid and reads as *carved*. Under the cinematic key light that
  shadow is what makes a cube head look like a head.
- **The lid row is proud by one voxel**, so it also catches a rim-light sliver on its top
  chamfer. Lid proud + pupil recessed = a 2-voxel step per eye, the strongest local contrast on
  the character.
- **Glint voxel:** in the source the second eye pixel is a lighter *skin* tint, not white. Ours is
  `eye-glint` (`#79DCEF`) at **emissive 0.35** — just enough to survive an arena's shadow side
  without blooming (`Pipeline` bloom threshold is set high; 0.35 will not trigger it, which is
  correct).
- **The glint is on the SAME side of both eyes — the character's left (`c2` and `c7`), never
  mirrored.** This is a correction, and it matters: a glint that mirrors outward on each eye is
  optically impossible (one key light produces one highlight side) and the brain reads the result
  as wall-eyed. The source puts both eyes' light pixel on the same side for exactly this reason.
  Feature *placement* is mirror-symmetric about `c5` (§9.2.1); the 1-voxel shading highlight is
  not a feature, it is a light response, and it obeys the key. If an arena flips its key to the
  character's right, the character agent does **not** rebuild the head — the glint stays put; it
  is 24 mm and nobody is checking.
- **Blink** = translate the ink lid row down 1 vx (`y -= 0.024`) so it covers the pupil row, and
  hide the glint. Two-frame snap, no interpolation. Voxels do not tween.

### 3.5 Brow behaviour

There is no brow *geometry* — there is a **brow band**: row r5, full interior width (9 vx), in
`skin-shade`, flush with the front plane. It exists only to darken the eye band and give the
face a horizontal division. **Anger** is expressed by replacing r5's `c2..c3` and `c7..c8` with
`voxel-ink` and dropping those four voxels **1 vx toward the eye on the inner end only** — a
stepped, angled brow made of 2 voxels per side. That is the entire brow rig. It reads at 3 m
and it is four cubes.

### 3.6 Nose

Not a projection. **Two ink voxels at r10 `c4` and `c6`, separated by one `skin-shade` voxel at
`c5`.** The `c5` voxel is **proud by 1 vx** (x = +0.132) — the bridge — and the two ink voxels
sit flush. That's it. The source's human base is two *adjacent* solid pixels; ours is split
(a deliberate deviation, borrowed from the source's ape base which uses separated nostrils, and
symmetrised). Total nose relief: 24 mm. Never model a wedge, never model nostrils as holes.

### 3.7 Mouth

**Three `voxel-ink` voxels at r13, `c4`–`c6`, recessed 1 vx.** The recess gives it a hard
top-lit shadow so it does not read as a painted stripe.

The **expression system is one extra voxel**, exactly as in the source:

| Pose | Extra voxel | Effect |
|---|---|---|
| Neutral | none | flat 3-vx bar |
| **Smirk** | `voxel-ink` at **r12, c3** (one row up, one col out) | corners up |
| **Frown / hurt** | `voxel-ink` at **r14, c3** (one row down, one col out) | corners down |
| **Snarl / heavy attack** | widen bar to `c3`–`c7` (5 vx) at r13 **plus** r12 `c3` and r12 `c7` | open shout |
| **KO** | 5-vx bar at r13 `c3`–`c7`, **plus** r14 `c3` and r14 `c7` | slack jaw |

**Every multi-voxel mouth state is an odd width centred on `c5`** (3 or 5 vx). Never build an
even-width bar: an even bar cannot centre on an 11-column grid, so it lands half a voxel off the
centreline and reads as a mistake rather than as a mouth. The only deliberately one-sided mouth
voxels are the single smirk and frown voxels — those are one voxel each, they are the source's
own construction, and one voxel of asymmetry reads as expression where two read as damage.

This is measured behaviour: in the source the "Smile" trait is literally one black pixel added
above-left of the 3-pixel mouth bar, and "Frown" is one black pixel added below-left. Use it.
It is free, it is authentic, and it is the only mouth animation a voxel head is allowed.

### 3.8 Ear and earring (the one permitted asymmetry below the forehead)

- **Ear:** a **1 vx (Z) × 2 vx (Y) × 2 vx (X)** bump proud of the head's **+Z (character's left)
  side plane**, occupying rows **r7–r8** at `z ∈ [+0.132, +0.156]` and `x ∈ [+0.012, +0.060]`.
  It is `skin-base`, closed with a `voxel-ink` voxel directly **below** it (r9 at the same z and
  x extent, minus the earring cell) — the source closes the ear bump with black at the row
  beneath. Total lateral extension: 24 mm. **On one side only.**
- **Earring:** exactly **one `gold-stud` voxel at `r9`, at the SAME lateral extent as the ear**
  (`z ∈ [+0.132, +0.156]`), `x ∈ [+0.036, +0.060]`, with `voxel-ink` voxels flanking it fore
  (`x ∈ [+0.012, +0.036]`) and aft (`x ∈ [+0.060, +0.084]`).
  **It must share a full face with the ear voxel above it.** The earlier draft of this brief put
  the earring one voxel *further out* in Z, which touches the ear along an edge only — a cube
  hanging off a corner. Built from bevelled primitives that reads as a floating bug, and it
  breaks under `Gore._detach()` because there is no shared surface. Same z as the ear, one row
  down. That is also exactly what the source does (earring pixel at the ear's own column, one
  row below the ear's closing black pixel).
  At 2,459 of 10,000 (24.6%) the earring is the source's most common attribute of any kind — it
  is *the* cheap recognition cue. Do not make it a torus. It is a cube.
- The opposite side of the head is flat. This is the only silhouette asymmetry on the head and
  it is worth keeping: it reads as "generated", which is the point.

### 3.9 Depth construction — the other 8 voxel layers

There are **9 layers**, indexed `L1` (front) … `L9` (back). Layer `Ln` occupies
`x ∈ [0.108 − 0.024·n, 0.132 − 0.024·n]`, i.e.:

| Layer | `x` min corner | front face |
|---|---|---|
| L1 (the §3.2 map) | +0.084 | **+0.108** |
| L2 … L8 | +0.060, +0.036, +0.012, −0.012, −0.036, −0.060, −0.084 | +0.084 … −0.060 |
| L9 (back plane) | −0.108 | −0.084 (its **back** face is −0.108) |

L1 carries the map in §3.2. The rest:

- **L2 – L8** (seven layers): solid `skin-base`, **except** the outer ring of every layer, which
  is `voxel-ink` at the top row, the bottom row and both side columns. Result: from any angle you
  see a dark keyline around the head's profile. This is the 2D outline made volumetric.
- **L9, the back plane:** `skin-shade`, with a **3 vx (Z) × 5 vx (Y) block of `voxel-ink`** at
  the crown-rear (`c4`–`c6`, `r0`–`r4`) — read as the back of the scalp. It stops the back of the
  head reading as a blank pale slab when the camera swings.
- **The 8 volume corners are omitted.** Be precise about which voxels those are: rows `r0` and
  `r1` are already narrower than the full grid (7 and 9 wide) and `r16` is 9 wide, so the
  *nominal* corners of an 11 × 17 × 9 box do not exist as voxels in the first place. The eight
  that **do** exist and must be deleted are the corners of the *realised* volume:

  ```
  (r2, c0, L1) (r2, c10, L1) (r15, c0, L1) (r15, c10, L1)
  (r2, c0, L9) (r2, c10, L9) (r15, c0, L9) (r15, c10, L9)
  ```

  One voxel each, eight total. At distance that reads as the source's clipped-corner head
  outline; up close it is what kills the "raw `BoxGeometry`" tell called out in
  `GRAPHICS_CONTRACT.md` §0.4. Do not delete more — deleting the `r3`/`r14` corners as well
  starts to round the head and the 8-bit read softens.
- **Side-plane stubble:** the stubble band (r11–r16) wraps 2 voxels onto both side planes and
  1 voxel onto the back. Facial hair that stops at the silhouette edge looks painted.

### 3.10 How to actually build it from primitives

1. Author the head as **data, not calls**: a `Uint8Array` or an array of strings exactly like
   §3.2, one array per depth layer, plus a colour-index lookup. This is a 24×24-grid character;
   the code should look like one. It also makes costume variants and the trait swaps in §7 a
   matter of swapping arrays.
2. **Do not build one `RoundedBoxGeometry` per voxel.** Run the arithmetic before you write the
   loop: the 11 × 17 × 9 volume is 1,683 voxels; deleting the fully-enclosed interior
   (9 × 15 × 7 = 945) leaves a **738-voxel shell**. `RoundedBoxGeometry(w, h, d, 1, r)` is
   ≈ 108 triangles. 738 × 108 = **≈ 80,000 triangles for the head alone** — a third of the
   contract's entire 250k match budget, for one body part on one of two fighters. That is the
   single easiest way to fail `GRAPHICS_CONTRACT.md` §0's performance guardrail on this
   character. Build it in two tiers instead:

   **Tier A — chamfered cubes**, for voxels whose edges are actually seen edge-on:
   every voxel that lies on an *edge or corner* of the shell (4 × 11 + 4 × 17 + 4 × 9 − 16 ≈ 132
   voxels), plus every **feature** voxel (the proud lids, recessed pupils and mouth, glints,
   nostrils and bridge, ear, earring, stubble-boundary dither row, mohawk, goggles, pipe, smoke)
   — call it **≈ 180 voxels**. Use a hand-built **bevelled cube**: 6 face quads + 12 edge quads
   + 8 corner tris = **44 triangles**, chamfer 1.2 mm. Not `RoundedBoxGeometry` — its extra
   segmentation buys nothing at a 1.2 mm radius and costs 2.5×.

   **Tier B — greedy-merged flat runs**, for everything else: coplanar, same-colour, non-feature
   face runs (the forehead, the cheeks, the flat side and back planes, the stubble field) merge
   into single quads. A 5-row × 9-column blank forehead is **one quad**, not 45 cubes.

   Combined budget: **≤ 9,000 triangles for the entire head assembly** (skull + fin + goggles +
   pipe + smoke). Measure it and put the number in your report. If you are over 12k, you built
   Tier B as cubes.

3. **Cull hidden faces, not just buried voxels.** Deleting fully-enclosed voxels removes ~56% of
   the volume but zero visible faces; the win that matters is per-face. The realised exterior of
   an 11 × 17 × 9 box is `2·(11·17) + 2·(11·9) + 2·(17·9)` = **878 faces**, plus roughly 40 more
   from the feature relief (proud lids, recessed sockets, ear, corner deletions). Budget:
   **≤ 950 visible voxel faces.** Any face with an occupied same-colour neighbour on the other
   side is discarded before merging.

4. **Merge one geometry per colour, and count the draw calls honestly.** The *skull* uses seven
   colours — `skin-base`, `skin-hilite`, `skin-shade`, `stubble`, `voxel-ink`, `eye-glint`,
   `gold-stud` — so **≤ 7 draw calls for the skull**. The props add their own:
   `mohawk-violet` + `mohawk-violet-dark` (2), `vr-body` + `vr-edge` + screen (3),
   `pipe-briar` + `pipe-briar-dark` + `pipe-stem` (3), `smoke-grey` (1). **≤ 16 draw calls for
   the whole head assembly**, and the prop merges must stay separate objects anyway so §7.7's
   dismemberment and the §7.4 goggle snap can move them independently. Do **not** use
   `InstancedMesh` — it makes per-region material swaps and `Gore` subtree cloning painful.

5. **Bake a per-face brightness bias into vertex colours** before merging. This is the classic
   voxel-render trick and it is what stops a cube head reading as a grey blob under flat ambient:

   | Face normal | Multiplier |
   |---|---|
   | +Y (up) | 1.06 |
   | +X (front) | 1.00 |
   | ±Z (sides) | 0.90 |
   | −X (back) | 0.86 |
   | −Y (down) | 0.78 |

6. **Bake voxel AO into the same vertex colours.** Three levels, per the standard voxel-AO
   approach: for each face vertex, count occupied neighbours among the 3 voxels touching that
   corner (side, side, diagonal). 0 neighbours → ×1.00; 1 → ×0.94; 2 → ×0.86; 3 → ×0.78. This
   single pass is what gives concave steps (the eye sockets, the mouth recess, the stubble/skin
   boundary, the mohawk root) their contact darkening. It is worth more than any texture.

7. **The vertex-colour tint must be clamped, and on dark voxels it must be compressed.** Set
   `vertexColors: true`; three.js multiplies vertex colour into albedo, so the face bias (5) and
   the AO (6) multiply together into the *shipped albedo*, and
   `GRAPHICS_CONTRACT.md` §0's guardrail — albedo stays in **30–240 sRGB, never pure 0 or 255** —
   applies to the product, not to the authored hex. Worst case is 0.78 × 0.78 = **0.608**, and
   `voxel-ink` `#22262C` (34, 38, 44) × 0.608 = (21, 23, 27) — well under the floor. So:

   ```
   tint  = faceBias * ao                       // 0.608 … 1.06
   // compress the range on near-black albedo: below luma 0.25 there is no
   // perceptual room to darken, and darkening is what breaks the floor.
   k     = clamp((luma(base) - 0.25) / 0.35, 0, 1)      // 0 at luma<=0.25, 1 at luma>=0.60
   tint' = 1 + (tint - 1) * (0.25 + 0.75 * k)
   out   = clampChannels(base * tint', 30/255, 240/255)
   ```

   For `voxel-ink` (luma 0.15, k = 0) the multiplier range collapses to 0.902 … 1.015 — the ink
   still gets a readable face bias but never leaves the band. For `skin-base` (luma 0.77, k = 1)
   the full 0.608 … 1.06 range applies, and `#A9CBC4` × 0.608 = (103, 123, 119), comfortably
   inside. **Run the clamp at bake time and assert no channel of any baked vertex colour falls
   outside 30–240.** This is a build-time check, not a hope.
8. **`flatShading: true` on the head materials only.** `GRAPHICS_CONTRACT.md` §4 says flat
   shading stays available because "some parody looks depend on it" — **this is the character
   that clause was written for** (declared as **D3** in §0.1). Never blend normals across a
   voxel boundary.
9. **Colour-boundary groove:** where two different colours meet on a coplanar face run, inset
   the darker run by **0.3 mm** in the face normal. It costs nothing and gives every colour
   transition a hairline AO line, which is what makes a voxel model look *authored* rather than
   *decimated*. Note this interacts with Tier B (item 2): a greedy-merged run stops at a colour
   boundary anyway, so the groove is free — it is a 0.3 mm offset applied to the merged run's
   plane, not extra geometry.
10. **Chamfer discipline:** 5% of `VX` (**1.2 mm**) is the target, 8% (1.9 mm) is the absolute
    ceiling. At 10%+ the head turns into a pile of dice and the 8-bit read dies. Test it: render
    at 512 px and confirm the crown corners still read as right angles. Tier B's merged flat runs
    get chamfered **only on their outer boundary** — chamfering every internal voxel line inside
    a merged run would defeat the merge.
11. **Texture and UVs.** The only map permitted on head skin is a **normal/bump** map from
    `surfaceMaps('pixel-grid', { nearest: true })`. **Do not bind its `roughnessMap`** — head
    roughness is a scalar and must not vary (§6, divergence **D2**); binding the map silently
    reintroduces exactly the spatial variation the design forbids.
    UVs: each Tier-A bevelled cube face and each Tier-B merged run gets UV `0…1` **per voxel
    cell** — for a merged run that means `repeat = (runWidthInVoxels, runHeightInVoxels)`, so one
    texture cell lands on one voxel everywhere on the model. That is what "lattice-aligned"
    means; verify it by checking that the grid line spacing is identical on the forehead (a big
    merged run) and on the crown (individual cubes). Never a noise texture at an arbitrary
    scale — a continuous noise field across a voxel model immediately reads as "3D model
    pretending to be voxels".

---

## 4. Body & limb proportions

Everything below the collar is **smooth, bevelled, tailored, and has no hard corners
whatsoever.** That contrast is 50% of the gag.

### 4.1 Skeleton lengths (metres)

| Segment | Length | Notes |
|---|---|---|
| Sole → ankle | 0.090 | shoe stack: 0.024 sole + 0.066 upper |
| Shin (`shinL/R` pivot → ankle) | 0.330 | |
| Thigh (`legL/R` pivot → knee) | 0.440 | |
| Hip pivot height | 0.860 | **frozen** |
| Hip → shoulder (`torso` chain) | 0.500 | `torso` pivot = hips **+ 0.080** → `y = 0.940`; `armL/R` pivot = torso **+ 0.420** → `y = 1.360`. Both offsets are relative to the bone above, not to `hips`. |
| Upper arm (`armL/R` → elbow) | 0.320 | |
| Forearm (`forearmL/R` → wrist) | 0.280 | |
| Hand length | 0.150 | |
| **Total arm reach from shoulder** | **0.750** | fingertip hangs at y = 0.610 |
| Neck (chin `1.442` → neck base `1.370`) | 0.072 | 3 voxels. **Not** "collar top → chin": the popped collar top is at `1.470`, which is 0.028 *above* the chin. The collar overlaps and frames the jaw; it does not butt against the neck. |

Arm/leg ratio: arm 0.750, leg 0.860 → **0.87**. Slightly long-armed for a human, which reads as
"trench coat sleeves" and helps the Detached-Hand Punch sell.

**Reach warning:** the current build puts the hand mesh at `forearm.y = -0.38`; this brief puts
it at `-0.42` (forearm 0.280 + hand half 0.075 + wrist 0.065). That moves the fist forward
~0.04 m. Per `GRAPHICS_CONTRACT.md` §9, **re-verify `block-jab`, `detached-hand-punch` and
`magnifying-glass-strike` hitbox `forward` values against the harness** and adjust if the visual
contact point drifts. Do not change `damage`/frame data.

### 4.2 Torso and shoulders

- **Shoulder span (bone pivots): `z = ±0.230`** → 0.460 between pivots; deltoid mass takes the
  outer silhouette to **0.520**, coat shoulder + epaulette to **0.545**.
  (Current build has `armL/R` at `z = ±0.30` — that is 0.60 across, too wide; it makes him read
  as a slab. Bring it in.)
- **Chest:** 0.300 deep (X) × 0.440 wide (Z) at `y = 1.22`.
- **Waist:** 0.250 deep × 0.360 wide at the belt (`y = 1.01`). Taper 0.69.
- **Hips:** 0.270 deep × 0.380 wide.
- **Torso cross-section is a rounded rectangle with a 0.05 m corner radius**, never a box and
  never a cylinder. Chest tapers into the waist over 5 loft rings, not 1.

### 4.3 Hands

Smooth **gloved** hands, not voxel. Construction: a rounded palm block
0.090 (X) × 0.055 (Y) × 0.100 (Z) with a 0.018 corner radius, plus a **single fused
four-finger mitt** (0.075 long, one groove per knuckle, 0.004 m deep) and a **separate opposed
thumb** (0.055 long, 0.028 diameter, set 40° off the palm plane at the base of the index side).
Four-finger mitts are the fighting-game standard; individual fingers cost triangles and read as
noise at 3 m.

**At the wrist**, and only there, a **6-voxel dissolve**: six 24 mm cubes of `voxel-ink` and
`skin-shade` in the 0.05 m band between cuff and glove, at seeded (deterministic — no
`Math.random()`, per contract §2) lattice positions. This is the "resolution seam" motif repeated
at the point where `handPunchScript` detaches the hand, so a detaching hand leaves a stepped
pixel edge behind rather than a clean cut. Parent these to the **forearm**, not the hand mesh,
so they stay behind when the hand flies.

**Two hard rules, because this is divergence D5 and the contract's "no gaps" clause is not
optional:**

- **The wrist joint underneath stays fully closed.** The leather cuff strap sleeves the
  forearm→hand joint with 0.015 m of overlap on each side. The dissolve voxels sit *on* a
  continuous joint; they are never the thing spanning it. Hide the voxels and the arm must still
  look correct.
- **No voxel floats.** Each of the six shares **at least one full 24 × 24 mm face** with either
  the cuff surface or another dissolve voxel. "None touching" — the earlier draft's phrasing —
  produces six cubes hovering in mid-air around a wrist, which reads as a physics bug, not as a
  stylistic choice, and it is the one place on the model where a reviewer would say "unfinished".
  A connected stepped chain of six reads as a resolution seam; a scatter of six reads as broken.

### 4.4 Legs and feet

- Thigh: 0.180 wide tapering to 0.140 at the knee; trousers, not skin (current build shows a
  bare-shin box — remove it).
- Shin: 0.130 tapering to 0.100.
- **Shoe:** a 1940s cap-toe oxford. 0.280 long (X) × 0.110 tall × 0.115 wide. Heel block 0.030
  tall at the rear third. Toe cap seam at 62% of the length. Slight upward toe spring (5°).
  Sole 0.024 thick — one voxel, as a nod, but smooth-edged.
- **Stance:** feet 0.420 apart outer-to-outer, **front foot yawed 20° open, rear foot 40°**,
  rear foot 0.10 m behind the front. Weight distribution 60% rear.

### 4.5 Posture — the gumshoe

This is a *watcher*, not a brawler. Bind pose:

- **Pelvis tilted back 3°** (hands-in-pocket slouch), hips yawed **6° open** toward camera.
- **Spine: a shallow single C**, not an S. Chest sunk 0.02 m, upper back rounded.
- **Shoulders rolled forward 8°**, and **the lens shoulder (right) carried 0.020 m higher** than
  the other — the permanent lean of a man holding something up to look through.
- **Head carried 0.045 m forward of the shoulder line** (`head` bone pivot offset `x = +0.045`)
  and **tipped down 5°**. Chin-forward, eyes-up. This is the noir read; get it wrong and he
  looks like a robot standing at attention.
- **Idle head yaw is a snap, not a sway** — the existing `idle` clip already does this (0.22 rad
  hold → 0.24 rad snap the other way). Keep it. Rigid pixel heads must move in discrete steps;
  it is characterisation, not a limitation.
- **The dead-on frontal hold — do not skip this.** The source archetype is *always* a straight-on
  head-and-shoulders portrait; the flat frontal is half of what makes a pixel avatar read as a
  pixel avatar, and a head that is permanently yawed 6° and pitched 5° never gives the viewer
  that frame. So: the **round-start pose and the `victory` pose put the head at exactly
  `yaw = 0, pitch = 0, roll = 0`** relative to the camera axis, held for **≥ 0.6 s**, with the
  fedora tilt supplying all the character. Between those, the idle's snap-scan may run to
  ±0.24 rad. The 5° down-tip from the line above applies to the *scan* poses, not to the frontal
  hold. One clean frontal frame per round is what a screenshot lands on and it is where the
  2-second test is actually won.

---

## 5. Colour script

Costume 0 ("gumshoe noir").

**Luma column definition:** `luma = (0.2126·R + 0.7152·G + 0.0722·B) / 255` on the **sRGB
(gamma-encoded) byte values** — i.e. perceived value as it appears on screen, not linear
radiance. Every number below is computed, not estimated; recompute any hex you change.

**Albedo band:** `GRAPHICS_CONTRACT.md` §0 requires albedo in **30–240 sRGB, never pure 0 or
255**. Every hex in this table is inside that band on all three channels, and §3.10.7's clamp
keeps it there *after* the vertex-colour bake. **Light colours and emissive colours are not
albedo and are exempt** — `rim-cyan` and the emissive drives below may sit outside the band.

| Name | Hex | R,G,B | luma | Use |
|---|---|---|---|---|
| `skin-base` | `#A9CBC4` | 169,203,196 | **0.77** | Head base voxels. Pale cool teal-grey. **The lightest large mass on the model** and the only cool mass. Every arena in the roster is warm-dominant or neutral; this is the value that pulls the eye to the face from 3 m. |
| `skin-hilite` | `#D2E7E1` | 210,231,225 | **0.89** | Exactly **two voxels**, diagonal at r2 c3 and r3 c2. Lightest value on the model. Do not add a third. |
| `skin-shade` | `#7CA39C` | 124,163,156 | 0.61 | Brow band (r5), nose bridge, back plane, side-plane secondary. The source uses exactly one shade tint per skin type — so do we. |
| `stubble` | `#5B7D78` | 91,125,120 | 0.46 | Shadow-beard block (r11–r16 + side wrap). 40% darker than base, matching the source's shadow-beard-to-skin relationship (its beard tint is ~30% darker; ours is pushed further because our base is lighter). |
| `voxel-ink` | `#22262C` | 34,38,44 | **0.15** | Keyline shell, upper lids, pupils, nostrils, mouth bar, brow-anger voxels, wrist dissolve. **Darkest albedo on the model.** Not black, and it *cannot* be: with a 30/255 floor on every channel the darkest legal luma is 0.118, so **stop chasing 0.09 — it is outside the contract.** 0.15 against a 0.89 highlight is a 6:1 value ratio and is plenty. |
| `mohawk-violet` | `#7B3CD4` | 123,60,212 | 0.33 | Mohawk fin body. Keeps continuity with the file's existing `accent: 0x8b5cf6` identity while being a colourway the source's mohawk traits never use (they are brown / dark-brown / red). |
| `mohawk-violet-dark` | `#4E2489` | 78,36,137 | 0.20 | Fin's rear column and root voxels — a 2-tone fin, per source hair construction. (Raised from `#4A1E86`, whose green channel sat exactly on the 30 floor and clipped after the AO bake.) |
| `coat-gabardine` | `#8E8067` | 142,128,103 | **0.51** | The trench. Warm desaturated stone-khaki. **This is a deliberate change from the current charcoal `0x23262f`.** A dark coat under a dark hat under a dark arena is a mud silhouette; the mid-value warm khaki gives the three-value read and it is the correct 1940s gabardine colour. |
| `coat-shadow` | `#5F5545` | 95,85,69 | 0.34 | Coat interior, under-collar, hem underside, storm-flap shadow, belt loops. |
| `hat-felt` | `#35312A` | 53,49,42 | 0.19 | Fedora, shoes, belt, gloves, tie. The dark anchor. **Must sit measurably above `voxel-ink`** so the head keyline still wins on the silhouette — it now does, by 0.04. (The previous `#2B2721` computed to luma 0.155, *identical* to the old ink hex; the brief asserted a 0.02 gap that did not exist. Squint at those two and the hat and the keyline merge into one dark mass.) |
| `hat-band` | `#463F34` | 70,63,52 | 0.25 | Grosgrain band only. 0.06 above `hat-felt` — enough to separate the band without breaking the hat's single-mass read. |
| `eye-glint` | `#79DCEF` | 121,220,239 | 0.79 | 2 voxels, `emissive` 0.35. The only emissive on the head. |
| `trim-cyan` | `#2FDCF0` | 47,220,240 | 0.72 | Identity accent. Used **sparingly**: coat under-collar piping, sole edge, cuff tab, lens ring inner. Total coverage < 2% of surface area. A keyline accent, not a paint job. Where it drives an `emissive` rather than an albedo (the VR screen), the emissive value may be the fuller `#2EE6FF`. |
| `smoke-grey` | `#B3B6BC` | 179,182,188 | 0.71 | Voxel smoke puff. Cool-tinted grey. |
| `pipe-briar` | `#8A5A22` | 138,90,34 | 0.38 | Pipe bowl. |
| `pipe-briar-dark` | `#5E3A16` | 94,58,22 | 0.25 | Bowl shadow side and bore surround. |
| `pipe-stem` | `#2B2830` | 43,40,48 | 0.16 | Vulcanite stem. Sits 0.01 above `voxel-ink` so the stem never out-darks the keyline. (Replaces `#1C1A1D`, which had all three channels **below** the contract's 30 floor.) |
| `gold-stud` | `#C79A2E` | 199,154,46 | 0.61 | Earring voxel, lens ring, coat buckle tongue. `gold` preset. **Deliberately a deep gold, not a bright one:** a 0.76-luma gold (the old `#E6C24A`) against 0.77 skin has *no* value contrast and the earring — the single most recognisable accessory in the whole archetype — disappears. At 0.61 it separates by 0.16 in value and by a full hue rotation, on top of the ink voxels flanking it. |
| `vr-body` / `vr-edge` | `#ADB2B8` / `#868C93` | 173,178,184 / 134,140,147 | 0.70 / 0.55 | Pushed-up goggles. |
| **`rim-cyan`** | **`#7FE8FF`** | — | *light, exempt* | **Rim-light intent.** Cool sky-cyan, 0.7–1.0 intensity, from behind-and-above at ~35° off the camera axis. Against `sunset-stadium`, `meme-plaza`, `tower-dusk` and `bull-market` this cyan edge cuts the khaki coat out of the background and lights the top chamfer of every crown voxel — which is what makes the staircase read. Against `arctic-day`, flip to warm `#FFC98A`. The character agent declares the intent in its report; arena agents own the rig. |

Costume 1 ("vaporwave"), same structure, these substitutions — **all re-checked against the
30–240 band**:

| Name | Costume 0 | Costume 1 | luma |
|---|---|---|---|
| `coat-gabardine` | `#8E8067` | `#6A46A8` | 0.33 |
| `coat-shadow` | `#5F5545` | `#3E2568` | 0.19 |
| `hat-felt` | `#35312A` | `#2A2733` | 0.16 — **the hat itself is gone (§7.2), but this colour is still needed**: it is also the shoes, belt, gloves and tie. "→ *no hat*" was ambiguous; only the fedora is removed. |
| `trim-cyan` | `#2FDCF0` | `#EFC33D` gold | 0.76 |
| `mohawk-violet` | `#7B3CD4` | `#2FDCF0` cyan | 0.72 |
| `mohawk-violet-dark` | `#4E2489` | `#1F8FA0` | 0.46 |
| `skin-base` | `#A9CBC4` | `#B8C4D6` cool grey-lilac | 0.76 |
| `eye-glint` | `#79DCEF` | `#EE6BD8` | 0.56 |

Costume 1's three-value read is head 0.76 / coat 0.33 / dark accents 0.16 — the same ladder,
shifted. (The earlier `#2E1750` coat-shadow had a green channel of 23, under the floor.)

### Value relationships — memorise

Lightest → darkest: `skin-hilite` 0.89 > `eye-glint` 0.79 > `skin-base` 0.77 >
`trim-cyan` 0.72 > `smoke-grey` 0.71 > `vr-body` 0.70 > `skin-shade` 0.61 = `gold-stud` 0.61 >
`vr-edge` 0.55 > `coat-gabardine` 0.51 > `stubble` 0.46 > `pipe-briar` 0.38 >
`coat-shadow` 0.34 > `mohawk-violet` 0.33 > `hat-band` 0.25 = `pipe-briar-dark` 0.25 >
`mohawk-violet-dark` 0.20 > `hat-felt` 0.19 > `pipe-stem` 0.16 > `voxel-ink` 0.15.

- **The head owns the extremes.** 0.89 and 0.15 both live on the head, 0.30 m apart — a
  **0.74 luma spread inside one 0.264 × 0.408 rectangle**, which is why the eye goes there first.
  Below the collar, **no two masses each covering >2% of the model's surface may differ by more
  than 0.35 luma** (coat 0.51 vs hat/shoes 0.19 = 0.32 ✓). Accents under 2% coverage —
  `trim-cyan`, `gold-stud` — are exempt; that exemption is what lets a 0.72 cyan piping line sit
  on a 0.51 coat without breaking the rule.
- **Three-value silhouette:** light head (0.77) / mid coat (0.51) / dark hat + shoes (0.19).
  Squint test at 128 px: you must see three distinct greys stacked vertically, with **≥ 0.15
  luma between each pair** — 0.77 / 0.51 / 0.19 gives 0.26 and 0.32 ✓.
- **The violet fin is the only saturated hue on the head above 0.05 of head surface area.** It is
  the accent that makes the head block "a punk head" rather than "a grey box". `eye-glint` and
  `gold-stud` are saturated but are 2 and 1 voxels respectively. **Do not add a second
  large-coverage saturated hue to the head.**

---

## 6. Surfacing

Presets from `GRAPHICS_CONTRACT.md` §4; texture kinds from §3.

> **Build note:** `src/render/materials.js` and `src/render/textures.js` do not exist in the
> tree yet (`src/render/` currently holds only `noise.js`, `env.js`, `lighting.js`,
> `Pipeline.js`). Import them defensively — try/catch or a feature check — and fall back to
> locally-constructed `MeshStandardMaterial` with the same roughness/metalness/flatShading
> values listed below. Do **not** ship a hard import that breaks the build.

| Region | `pbr()` preset | `surfaceMaps()` kind | Behaviour |
|---|---|---|---|
| Head voxels — skin | `plastic` | `pixel-grid` **normal map only — `roughnessMap` must NOT be bound** | Roughness **scalar 0.62, no map, no spatial variation** (divergence **D2**, §0.1). This is the one surface in the game that must *not* have varying roughness — varying roughness reads as a physical material, and the head is not one, it is a picture. Binding `surfaceMaps('pixel-grid')`'s roughness output would silently undo the entire decision, so destructure the map set and pass `{ normalMap }` explicitly. `metalness 0`. `flatShading: true`. `envMapIntensity 0.55`. |
| Head voxels — ink keyline | `plastic` | `pixel-grid` normal only | Roughness **scalar 0.48** — very slightly glossier than the skin so the keyline picks up a thin specular sliver on its chamfer under the rim light. This is what makes the outline *sparkle* at the silhouette instead of dying. |
| Mohawk fin | `plastic-gloss` | `pixel-grid` normal only | Roughness **scalar 0.34**, `clearcoat 0.25`. Glossier than the head — hair gel, and it separates the fin from the skull under any light. |
| Stubble block | `plastic` | `pixel-grid` normal only + a 1-vx-period dither | Roughness **scalar 0.72**. The only permitted micro-detail: a **checkerboard dither at exactly one voxel period** on the stubble/skin boundary row (r10→r11), alternating `stubble` and `skin-base`. This is authentic 8-bit shading language and it costs 9 voxels. |
| Trench coat | `suit` | `cloth-weave`, `scale ≈ 6` | Cotton gabardine: a **tight 2×2 twill with a visible diagonal**. Roughness **0.72**, sheen **0.18**, sheen colour `#C9BFA6`, sheen roughness 0.55. Gabardine's defining optical property is a faint directional lustre along the twill diagonal — that is what stops it reading as felt. Normal strength 0.7. |
| Coat lining / under-collar | `cloth` | `cloth-weave`, `scale ≈ 14` | Roughness 0.60, slightly sheenier (0.28) — lining silk. Visible when the collar is popped and when `coatSpin` flares the hem. |
| Fedora | `cloth` | `cloth-weave`, `scale ≈ 3` | Fur-felt: roughness **0.86**, sheen **0.30**, sheen colour `#6B6152`. Felt has a *nap* — the top of the crown and the brim's upper surface should be measurably lighter at grazing angles than the sides. This is the one place a fresnel sheen does real work on this character. |
| Hat band | `cloth` | `cloth-weave`, `scale ≈ 20` | Grosgrain rib — visible horizontal ribbing, 2 mm period, as normal detail. Roughness 0.66. |
| Belt, gloves, shoes | `leather` | `leather`, `scale ≈ 12`, `wear 0.45` | Roughness 0.42 on the shoe cap (polished), 0.62 on the shaft and gloves. Edge wear at the toe cap, heel corner, belt fold and glove knuckles — lighter, more scattered. |
| Shirt / tie | `cloth` | `cloth-weave`, `scale ≈ 24` | Roughness 0.78. Tie gets a 3.5° bias-weave direction. |
| Buckles, buttons, earring, lens ring | `gold` / `metal-brushed` | `gold` / `metal-brushed` | Buttons are **horn**, not metal: `horn` preset, roughness 0.35, faint translucency. Only the belt buckle, the D-rings and the earring are metal. |
| Pipe bowl | `wood-rough` | `wood-rough`, `scale ≈ 30` | Briar grain running with the bowl axis. Roughness 0.55, with a 0.28 patch on the rim (handled wood polishes). |
| Pipe stem | `plastic-gloss` | none | Vulcanite: roughness 0.16, `pipe-stem` `#2B2830`. |
| Smoke voxels | `plastic-matte`, `unique: true` | none | `transparent: true, opacity 0.62, side: FrontSide, castShadow: false`, roughness 1.0, `emissive` `#3A4448` at 0.15 so the puff still reads in an arena's shadow side. Flat-shaded cubes. **Keep `depthWrite: true` and cull the cluster's interior faces before merging.** The earlier `depthWrite: false` spec turns a 12-voxel cluster into a soup of self-overlapping translucent quads — you see its own far faces through its near faces at 0.62 and the crisp cube edges that are the entire joke dissolve. Merge the puff into one closed hull, then it is a solid translucent *object*, not a fog of quads. **No soft particles, no billboards** — the whole point is that his smoke is also 8-bit. |
| VR goggle body | `plastic` | `pixel-grid` normal only | Roughness 0.55. `vr-body` `#ADB2B8` face, `vr-edge` `#868C93` edge. |
| VR lens window | `screen` | `screen-crt` | `emissive` `#2EE6FF` at 0.9. The **only** part of the model that is allowed to bloom. **7 vx × 1 vx** (`c2`–`c8`, the goggle's middle row) — matching §7.4. |
| Magnifying lens glass | `glass` | none | Keep existing: transmission 0.9, IOR 1.5, roughness 0.04. `lensStrikeScript` tints `glassMat` — keep `unique: true` so the cache is not poisoned. |

### How the surface must behave under light

- **The head must not respond to the environment.** `envMapIntensity 0.55` on every head
  material, versus 1.0 on the body. A voxel head that mirrors the arena's colour loses its
  palette and stops reading as a sprite. This is the most important surfacing decision here.
- **The body must respond fully.** `envMapIntensity 1.0–1.2` on the coat and hat. The coat
  should visibly pick up the floor bounce (`bounceColor` from the arena rig) along its hem and
  the underside of the brim.
- **Roughness variation is inverted from every other fighter.** Normally: vary roughness
  spatially to sell a real material. Here: **head = constant roughness, body = strongly varying
  roughness.** The delta between the two is the surfacing expression of the whole joke. Coat
  roughness should swing 0.62 (worn elbows, shoulder tops, belt-line) to 0.80 (dry, unworn
  panels); the head swings **exactly zero**. This is divergence **D2** and it must be in the
  report — the contract's criterion 1 asks for spatially varying roughness on every surface, and
  this character deliberately withholds it on the head. Full body range across the model:
  **0.16 (pipe stem) → 0.86 (fedora felt)**, so the model as a whole clears the contract's bar
  comfortably; it is only the 0.264 × 0.408 head rectangle that is flat.
- **Sheen does the separation work on the coat.** With `sheen 0.18` the gabardine gets a pale
  fresnel edge that reads as the coat's silhouette from behind — necessary because the coat is
  the mid value and would otherwise vanish into a mid-value arena.
- **Wetness: none.** He is dry. The only specular events are the head's ink chamfers, the shoe
  caps, the buckle, the lens, the VR window and the pipe rim. That restraint is what keeps the
  head reading as flat art.
- **Micro-detail that sells it (body):** (a) real **stitching geometry** — 1.5 mm raised
  double-needle topstitch, 4 mm pitch, on the storm flap, epaulettes, belt, collar seam, hem and
  pocket welts; (b) **real buttonholes** — 12 mm slits with a bar tack, cut through the button
  stand; (c) a **broken-in crease** in the fedora crown, modelled not textured; (d) the belt
  **tied, not buckled**, with the tail tucked back under itself (the film-noir tell — the buckle
  hangs unused); (e) 4 mm of **collar roll** where the popped collar folds, with the lining
  visible on the underside.
- **Micro-detail that sells it (head):** (a) the **1-voxel-period dither** at the stubble line;
  (b) the **0.3 mm colour-boundary groove**; (c) the **omitted corner voxels**; (d) the
  **2 highlight voxels** in the upper-left forehead — the whole head's shading system is 4
  ideas, executed exactly. Adding a fifth ruins it.

---

## 7. Signature props & wardrobe

Every prop must hang off an existing bone (§0 rig freeze), because `Gore._detach()` clones a
bone subtree. Anything parented to `group` will be orphaned by dismemberment and will float.

### 7.1 Mohawk fin — bone: `head` (rigid)

- **3 vx wide (Z) × 6 vx tall (Y) × 5 vx deep (X)**, i.e. 0.072 × 0.144 × 0.120 m.
  3 wide is odd, so it centres on `c5` and occupies `c4`–`c6` (`z ∈ [−0.036, +0.036]`). Never
  build it 2 or 4 wide — an even fin cannot centre on an 11-column grid.
- Rooted on the **front half of the crown**: it occupies `x ∈ [+0.012, +0.132]` (min corner
  `+0.012`, front face `+0.132`). Since the head's front plane's front face is `+0.108`, the fin
  **overhangs the forehead by exactly 1 voxel**. (The earlier draft said "rear face at
  `x = 0.00`, front face at `+0.120`" — that is 5 vx of span starting off-lattice, and it
  overhangs by half a voxel, not one. Half-voxel props are the tell that a voxel model was
  eyeballed.)
- Vertically: `y ∈ [1.850, 1.994]`, sitting directly on the crown's top face. Its bottom row
  shares a full face with the crown row `r0` voxels at `c4`–`c6` — it is welded on, not floating.
- Profile, viewed from the side, is a **stepped blade** — build these 6 rows (top → bottom),
  each row an X-extent in voxels measured from the front:
  `r'0: 1 vx · r'1: 2 vx · r'2: 3 vx · r'3: 4 vx · r'4: 5 vx · r'5: 5 vx`.
  A staircase leading edge, a vertical trailing edge. It must **step**, never slope.
- Colour: `mohawk-violet`, with the **rearmost voxel column** and the **bottom row** in
  `mohawk-violet-dark` — 2-tone, exactly as the source's hair traits are.
- Top voxel of the fin sits at `y = 1.994`. It is the highest point on the character.
- **Zero secondary motion.** The fin does not wobble, ever. See §8.

### 7.2 Fedora — bone: `hat` (spring-follow, exists)

Smooth, not voxel. This is the joke's other half.

- **Crown height 0.115 m** (= 4.5 in at scale), **brim width 0.070 m** all round, brim
  outer dimension **0.404 × 0.360 m** — brim/head-width ratio **1.53**, which matches the
  source's Fedora trait exactly (17 px brim on an 11 px head = 1.55).
- **Teardrop crown:** a centre crease running front→back, 0.030 m deep at the front tapering to
  0.008 m at the rear, plus **two side pinches** 0.035 m in from the front, each 0.022 m deep.
  Build the crown as a lofted 12-sided profile and displace the crease/pinch vertices — do not
  fake it with a texture.
- **Snap brim:** front third snapped **down 14°**, rear third snapped **up 9°**. Brim thickness
  4 mm with a 3 mm rolled edge and a 2 mm bound edge stitch.
- **Hat band:** 0.028 m tall grosgrain at the crown base, `hat-band` `#463F34`. Flat bow on the
  character's left: **0.048 wide × 0.026 tall × 0.006 thick**, two wings, centred 0.070 m from
  the crown's centre line. One `trim-cyan` piping line, 2 mm, along the band's top edge.
- **The tilt is a transform on the whole `hat` group, not per-part authoring.** Pivot at
  head-local `[−0.060, +0.432, 0]` (the crown-rear); the crown-base ring is built flat and
  centred on that plane; then set `hat.rotation.z = +0.314` (18°, which lifts the **front** of
  the brim, given `+X` forward and `+Y` up) and `hat.rotation.y = 0.105` (6° yaw). Build flat,
  rotate once. Do not hand-place the brim to hit a target height.
  This is the load-bearing pose choice: it exposes the forehead so the mohawk fin rises in front
  of the brim, it opens the negative-space wedge from §2, and "hat on the back of the head" is
  the gumshoe posture. Verify after rotation that the brim's front edge clears the fin's rear
  face by ≥ 0.030 m — if it does not, raise the pivot, do not shrink the fin.
- **Costume 1: no fedora, but the `hat` bone must still drive visible geometry.** Do **not** move
  the mohawk onto `hat` — §8.3 makes the fin's perfect rigidity a stated art pillar and the
  `hat` bone is a spring-follow, so parenting the fin to it would give the fin exactly the lag
  §8.3 forbids. Instead: the fin stays on `head` and grows to **8 vx tall** (`y ∈ [1.850,
  2.042]`), and `hat` carries a **pixel headband** — 11 vx (Z) × 1 vx (Y) × 9 vx (X) of
  `voxel-ink` wrapping rows `r1` at the head's full extent, one voxel proud on all four sides.
  The clips that key `hat` then still animate something, the spring-follow reads on the band
  (which is *cloth*, so lag is correct there), and the fin stays rigid.

### 7.3 Pipe + floating voxel smoke — bone: `head`

**The single best gag on this character. Build it exactly.**

All coordinates below are **min corners** (see the conventions block). Every one lands on the
lattice; every element touches the next or clears it by exactly 3 vx. Check the arithmetic once
and then build it — the earlier draft of this section did not close: its stem's front face was at
`x = 0.180` and its bowl started at `x = 0.192`, leaving the pipe **snapped in half by a 12 mm
gap**, and its two stated smoke gaps (0.096 and 0.072) did not agree with either its own
coordinates or with §2's 0.16.

- **Stem:** 2 voxels, stepping down-and-forward from the mouth's outer corner (r13, `c6`):
  - stem A at `(x +0.132, y 1.514, z −0.060)` → occupies `c7`, one voxel proud of the face.
  - stem B at `(x +0.156, y 1.490, z −0.084)` → occupies `c8`, one row lower (r14).
  `pipe-briar-dark`. A **1-voxel diagonal staircase**, matching the source, which draws the pipe
  stem as a 1-px diagonal from the mouth corner. Stem B's front face is at `x = +0.180`.
- **Bowl:** a **3 × 3 × 3 voxel block** (0.072 m cube) at `(x +0.180, y 1.442, z −0.108)`,
  so it spans `[0.180, 0.252] × [1.442, 1.514] × [−0.108, −0.036]` — its **back face is
  `x = +0.180`, sharing a full face with stem B.** `pipe-briar`, with the shadow side
  (`−Z` column and `−Y` row) in `pipe-briar-dark`.
  **The bore** is the top-centre voxel `(x +0.204, y 1.490, z −0.084)` **recessed by 1 vx**
  (its top face drops to `y = 1.490`) and coloured `voxel-ink`. You cannot "replace a face's
  voxel" — you recess a voxel and recolour it, which also gives the bore a real 24 mm shadow.
  Bowl top face: `y = 1.514`.
- **Smoke:** parented to `head`, so it survives decapitation and travels with the head.
  All four smoke voxels/blocks share the same `x` and `z` footprint:
  `x ∈ [+0.216, +0.288]` for the puff, `x = +0.216` (1 vx) for the trail; `z` starts at `−0.108`.
  - **Trail A:** one voxel at `(x +0.216, y 1.586, z −0.108)`.
  - **Trail B:** one voxel at `(x +0.216, y 1.682, z −0.108)`.
  - **Puff:** a **3 (X) × 2 (Y) × 2 (Z) block** = 12 voxels, 0.072 × 0.048 × 0.048, at
    `(x +0.216, y 1.778, z −0.108)`. Top of the puff: `y = 1.826`.
  - **The gaps are all identical: 3 vx = 0.072 m.** Bowl top 1.514 → Trail A bottom 1.586.
    Trail A top 1.610 → Trail B bottom 1.682. Trail B top 1.706 → puff bottom 1.778. Three gaps,
    one number, nothing touches. That detachment is the silhouette event from §2, and 0.072 m is
    5 px at a 128 px render — the smallest gap that survives the silhouette test.
  - The **structure** is a direct measurement of the source's Pipe trait, which renders smoke as
    two isolated single pixels and a 3 × 2 cloud floating clear of the bowl. The source's gaps
    are 1 px each; ours are 3 vx because a 1-vx gap (1.66 px at 128) closes up at fighting-game
    distance and the whole point of the smoke is that it is *detached*.
  - **Drift:** on `onBeforeRender` (same defensive try/catch pattern as the existing `makeFace`),
    translate the puff by a lattice-quantised sine: `z += round(sin(t*0.7)*1.5) * VX` and
    `y += round(sin(t*0.45)*1.0) * VX`, updated at **8 Hz maximum**. It must move in **whole
    voxel jumps at a low frame rate.** Smooth continuous drift kills it.
- Costume 1: replace with a **cigarette** — a 5 vx (X) × 1 vx × 1 vx bar in `#BEBAB2` at r13
  running forward from the mouth's outer corner (`c7`), i.e. `(x +0.132, y 1.514, z −0.060)`
  spanning to `x = +0.252`; **one ember voxel** in `#D9622F` at the tip; and a **1-vx-wide
  vertical smoke column, 6 voxels tall**, in `#D6D8D3`, rising from `y = 1.586` at
  `(x +0.252, z −0.060)` with a 3 vx gap below it, same rule as the pipe. All three hexes are
  inside the 30–240 band.

### 7.4 VR goggles, worn pushed up — bone: `head`

- **9 vx wide (Z) × 3 vx tall (Y) × 3 vx deep (X)** = 0.216 × 0.072 × 0.072 m, occupying
  `c1`–`c9`. **Nine, not eight.** An 8-wide block cannot centre on an 11-column grid — it lands
  half a voxel off `c5` and every symmetry claim in §9.2.1 breaks with it. On this head every
  centred prop is an odd voxel count: fin 3, mouth 3 or 5, nose 3, goggles 9, screen 7.
- Worn **on the forehead**, rows **r1–r3**, front face at `x = +0.132` (one voxel proud). This
  leaves the eyes visible — the eyes are the read, and goggles-over-eyes would cost more than
  they earn in the neutral pose.
  **r1–r3, not r2–r4**, so the goggles clear the brow band at r5 and leave `r4` of blank
  forehead below them. This also resolves a collision the earlier draft had with itself: it put
  the goggles across r2–r4 while §3.3 and §6 both insist the forehead's two `skin-hilite` voxels
  (r2 c3 / r3 c2) are load-bearing shading. With the goggles at r1–r3 the r3 c2 hilite is still
  covered, so **in costume 0 the hilite pair moves down one row to `r3 c3` and `r4 c2`** — same
  diagonal, same two voxels, visible under the goggle's lower edge. Costume 1 (no goggles) keeps
  the r2 c3 / r3 c2 pair. This is the only costume-dependent change to the face grid.
- Body `vr-body` `#ADB2B8`, edge ring `vr-edge` `#868C93`, a **7 vx × 1 vx `screen` window**
  (`c2`–`c8`) in the middle row, emissive `#2EE6FF` at 0.9.
- **Strap:** 1 vx tall, wrapping both side planes and the back plane, `voxel-ink`, in row `r2`.
- **They snap down.** On `taunt` and on the level-3 super, translate the goggle group down
  **5 voxels (0.120 m)** in **two frames, no easing**, so its 3 rows land on r6–r8 and cover the
  eye band. While down, hide the eye voxels and drive the `screen` window's emissive with the
  existing glitch logic. Snap back up on recovery. This is the character's best single piece of
  motion payoff. (5 voxels, not 4 — r1→r6 is five rows. The 4-voxel figure in the earlier draft
  came from the r2 start position and would leave the goggles covering r5–r7, i.e. the brow band
  and the lids but not the pupils.)
- Costume 1: replace with **anaglyph 3D glasses** worn *on* the eyes — an **11 vx × 3 vx** frame
  in `#E4E6E0` spanning the head's full width `c0`–`c10` (eleven, odd, symmetric — the source's
  10-px frame is asymmetric and we are not), with a **3 vx × 2 vx blue lens `#3E86E0`** at
  `c2`–`c4` and a **3 vx × 2 vx red lens `#E04040`** at `c6`–`c8`, `c5` the bridge, blue on the
  character's left. All three hexes are shifted from the source's (§9.2.5) and all sit inside the
  30–240 albedo band, which the source's own `#F0F0F0` / `#328DFD` / `#FD3232` do not.

### 7.5 Trench coat — bones: `torso` (upper) + `coat` (hem, spring-follow, exists)

Split at the belt line, exactly as the current build does. Upper shell on `torso`; the hem
skirt on `coat` so the existing spring-follow secondary motion keeps working.

Construction details, all real 1940s trench features — each is one or two extra primitives and
together they are what makes the body read as *tailored* against the head:

| Feature | Spec |
|---|---|
| **Silhouette** | Knee-length: hem at `y = 0.42`, i.e. **0.227 H**. A-line, 0.640 m across the hem. |
| **Double-breasted front** | **6 visible horn buttons in 2 columns of 3**, columns 0.100 m apart, buttons at `y = 1.02 / 1.16 / 1.30`, 18 mm diameter, 5 mm thick, `horn` preset. (The military original is a 10-button 5×2; six reads better at this scale and is a deliberate deviation — see §9.) |
| **Storm / gun flap** | On the **character's right** shoulder only. A separate panel **0.180 wide × 0.140 tall**, top edge at the shoulder seam `y = 1.360`, bottom edge at `y = 1.220` — which is the landmark row in §2. (The earlier 0.220 height put the flap's top at 1.440, floating 0.08 m above the shoulder line and through the collar.) Stands 8 mm off the chest, topstitched on three sides, free at the bottom edge so it can flutter. |
| **Epaulettes** | Both shoulders. 0.110 long × 0.040 wide, 6 mm thick, buttoned at the inboard end with a 12 mm horn button. |
| **Belt** | 0.055 m wide, `leather`, **tied in a knot on the character's left, not buckled**, with a 0.16 m tail hanging. The buckle hangs loose and unused on the belt's free run. Two **D-rings** on the belt, 28 mm, `metal-brushed`. |
| **Cuff straps** | 0.030 m wide leather straps around both cuffs with a 16 mm buckle. |
| **Raglan sleeves** | The shoulder seam runs **diagonally from the neck to the underarm**, not over the shoulder point. This is the trench's defining construction and it visibly rounds the shoulder — model the seam as a 2 mm topstitched ridge along that diagonal. |
| **Back yoke / storm cape** | A single panel across the upper back, **0.460 wide × 0.180 tall × 4 mm thick**, top edge at the shoulder seam `y = 1.360`, hem at `y = 1.180`, free at the bottom. Give it its own 2-bone-free flutter via the `coat` spring where possible. |
| **Collar** | Convertible notch collar, **worn popped**: 0.075 m tall, standing at 70° from the shoulder plane, with a **throat-latch tab and buckle** hanging open on the left lapel. Popped collar top at `y = 1.470`, framing the chin. `coat-shadow` lining visible on the inside face plus one `trim-cyan` piping line. |
| **Back vent** | Inverted box pleat from `y = 0.900` (button at the top) down to the hem at `y = 0.420`, **0.070 m deep, 0.480 m long**. It opens on `coatSpin` and on turns. A vent that starts at 1.18 — as the earlier draft had it — starts *above the belt* at 1.010, which no coat does: the belt would run straight across an open pleat and the `coat` spring bone (pivot 1.010) would tear it. Vent below the belt, always. |
| **Pockets** | Two slanted welt pockets, 0.150 m opening, entering at 22° from horizontal, at `y = 1.00`. Real 6 mm welts. |

### 7.6 Magnifying lens — bone: `lens` (exists, keep)

Keep the current construction and both `userData` keys. Upgrade only:

- **Ring:** bevelled `metal-brushed` torus, **outer diameter 0.130 m, tube diameter 0.014 m**,
  24 knurls on the outer edge, each 2 mm deep × 5 mm wide.
- **Handle:** 0.110 m long × 0.024 m across, 3-facet grip (three flats at 120°, each 0.040 long),
  1 mm fillets between facets.
- **Glass:** `transmission 0.9`, IOR 1.5, roughness 0.04, 2 mm thick, inset 3 mm inside the ring.
- **The escaped voxel:** a **single `voxel-ink` cube, 1 vx (24 mm), welded flush to the top of
  the ring**, sharing a full face with the torus tangent plane at 12 o'clock. Chamfer 1.2 mm, the
  same as every head voxel — that is what makes it read as having come *off the head* rather than
  as a stray box. It is a good 30 cm-read joke and it visually links the lens to the head.

### 7.7 Dismemberment behaviour

- Head detaches at the neck → a 3 vx × 3 vx `voxel-ink` cross-section on the stump face. Not a
  gore surface; a **flat pixel cap**. The joke survives the violence.
- Hand detaches (`handPunchScript`) → the 6 wrist dissolve voxels stay on the forearm; the hand
  flies clean.
- Fedora is on `hat`, mohawk/goggles/pipe/smoke are on `head` — a decapitation therefore takes
  the whole assembly with it, which is correct and funny.

---

## 8. Expression & motion notes

### 8.1 Face poses

**Delete `makeFace()`.** The current animated canvas texture on a `MeshBasicMaterial` plane
violates the contract's "real geometry, not painted-on quads" rule *and* it flattens the head.
Replace it with **voxel geometry driven by a small pose table** — every pose below is a set of
voxel visibility toggles and integer lattice translations. Nothing interpolates.

`head.userData.faceTex` may be repurposed as `head.userData.setFace(poseName)`; if any external
code still reads `faceTex`, leave a null-safe stub.

| Pose | Eyes | Brow (r5) | Mouth (r13) | Extra |
|---|---|---|---|---|
| **idle** | lid up, pupil + glint on | plain `skin-shade` band | 3 vx bar | blink every 3.2–4.1 s: lid drops 1 vx for 2 frames |
| **angry / attack** | lid drops 1 vx (half-lidded), glint off | 4 ink voxels, inner ends dropped 1 vx | 5 vx bar, corners at r12 `c3`/`c7` | fin's top voxel flicks 1 vx forward for 3 frames on impact |
| **hurt** | pupil replaced by a **1 vx `skin-hilite`** (blown-out), lid off | plain | 3 vx bar + r14 `c3` (frown voxel) | 2-frame RGB split, see 8.2 |
| **KO** | both eyes → **4 voxels in an X**: ink at the cell's two diagonals only | off | 5 vx bar at r13 `c3`–`c7`, plus r14 `c3` and r14 `c7` (matches §3.7) | glint off, VR window emissive → 0, smoke puff freezes and falls as debris |
| **taunt** | one eye's lid down (a wink), other normal | plain | smirk: 3 vx bar + r12 `c3` | VR goggles snap down over the eyes, screen flashes 3× |
| **block** | both lids down 1 vx | 2 ink voxels, outer ends only | 3 vx bar | — |
| **victory** | glint emissive → 0.6 | plain | smirk | fin gets a single 1-vx "shine" voxel in `skin-hilite` at its tip for 6 frames |

**Rule: every face change is a whole-voxel snap, executed in ≤ 2 frames, with no easing.** The
Animator's Catmull-Rom path must be bypassed for face poses. A pixel face that eases is the
single most immersion-breaking thing you can do here.

### 8.2 Glitch — keep the identity, move it into geometry

The current file's RGB-split glitch is good character and must survive the rewrite. Reimplement
it as geometry:

- Maintain **two ghost copies of the face-voxel subgroup only** (eyes + nose + mouth, ~14
  voxels), one tinted `#EE47DE`, one `#2FDCF0`, both `MeshBasicMaterial`-adjacent (unlit),
  `depthWrite: false`, `opacity 0.5`, normally hidden. (Both hexes inside 30–240; the ghosts are
  additive-looking but they are albedo on an unlit material, so the band applies.)
- On a glitch burst (random ~9% per 110 ms, matching the current cadence, plus forced on
  `glitchDodge`, `cloneFeint`, `rightClickSave` and every hurt): show both ghosts offset
  **±1 or ±2 whole voxels** along Z and Y for **2–4 frames**, and simultaneously translate 3–5
  randomly-chosen skull voxels by 1 vx along Z. Snap back.
- Add **one horizontal scanline band**: a single-row slab of `trim-cyan` at 0.35 opacity that
  jumps to a random row for 2 frames. This is the CRT tear, and it is much cheaper as geometry
  than as a texture.

### 8.3 Secondary motion — the inversion

**This character's secondary-motion signature is that the head has none.** Write this into the
report; it is a deliberate art decision, not an omission.

| Element | Behaviour |
|---|---|
| **Head, mohawk, goggles, stubble, pipe bowl** | **Perfectly rigid.** Zero jiggle, zero lag, zero deformation, zero squash. The head is a sprite bolted to a skeleton. |
| **Fedora** (`hat` bone) | Spring-follow, damping 0.72, stiffness 90. It lags the head's snap-turns by ~3 frames and settles with one visible overshoot — the *only* thing above the collar that moves organically, which reads as "the hat is real and the head is not". |
| **Coat hem** (`coat` bone) | Spring-follow + cloth solver. Big amplitude: ±0.35 rad on dashes, ±0.9 rad on `coatSpin`. The hem should be the loudest motion on the character. |
| **Storm flap, back yoke, belt tail, collar** | Light cloth, 2–3 frames of lag, low amplitude. |
| **Smoke puff** | 8 Hz lattice-quantised drift (§7.3). On a heavy hit, the 12-voxel puff scatters into **12 loose voxels** — one per voxel, each on the lattice — and reforms over 0.8 s. |
| **Tie** | Swings freely; on `hitHeavy` it flips up over the shoulder and settles. |

The comedy is the contrast: **cloth flows, the head does not.** On every hard stop — dash
cancel, block, hit-stop — the coat, hat and tie keep travelling for 3 frames while the head is
already frozen in its final pose. Frame-step it and look at it.

### 8.4 Posture-driven personality

He is a **watcher who fights reluctantly**. Idle: weight back, one hand holding the lens
half-raised, head snap-scanning left → hold → right → hold. Walk: he leads with the head, not
the chest — the head reaches its new yaw one frame *before* the torso rotates, which reads as
"he saw it first". Dash: the coat opens fully and he goes into it shoulder-first, head still
level (a rigid head that stays level while the body pitches is instantly readable and very
"detective"). Taunt: goggles snap down, one hand goes into a pocket. KO: he falls **stiff**, the
head landing with a single hard bounce and no roll — the rest of him ragdolls normally. That
one contrast at KO is worth more than any extra VFX.

---

## 9. Parody safety

**Mandatory. Read before building.**

### 9.1 Do not copy

- ❌ **No source names, anywhere** — not in `name`, `title`, `bio`, `style`, move names, texture
  keys, mesh names, code comments, or variable names. No "CryptoPunk", "Punks", "Larva", "Yuga",
  "Meebit", or any studio or collection name. The current file is clean; keep it clean.
- ❌ **No logos or wordmarks.** Nothing on the coat, hat band, lens or buttons. No "Ξ" glyph, no
  chain logo, no contract address, no token ticker.
- ❌ **Never reproduce any individual source artwork.** Do not build our head from the exact
  bitmap of any specific numbered avatar; do not stack the exact trait combination of a
  famous/expensive one; do not render a flat 24×24 image of our character anywhere in the game
  (menus, portraits, the results screen, the loading screen, a background texture).
- ❌ **No source-measured hex appears anywhere on the model, verbatim or near-verbatim.**
  This is stricter than the earlier draft, which banned the skin hexes but then went on to
  specify the smoke, briar, cigarette, VR and 3D-glasses colours as *"lifted directly from the
  source"* — a contradiction a hostile reviewer would find in thirty seconds, and one that made
  the whole section read as decorative.
  **The rule, concretely:** every colour derived from a source measurement is shifted by
  **≥ 8/255 in at least two channels** before it ships. Applied:

  | Source-measured | Source hex | Ours | Δ channels |
  |---|---|---|---|
  | Pipe smoke | `#B9B9B9` | `#B3B6BC` | −6 / −3 / +3 → shifted, and re-hued cool |
  | Briar bowl / dark | `#855114` / `#683C08` | `#8A5A22` / `#5E3A16` | +5/+9/+14, −10/−2/+14 |
  | Cigarette / its smoke / ember | `#C6C6C6` / `#DDDDDD` / `#E25B26` | `#BEBAB2` / `#D6D8D3` / `#D9622F` | all ≥8 in ≥2 |
  | VR frame / edge | `#B4B4B4` / `#8D8D8D` | `#ADB2B8` / `#868C93` | −7/−2/+4, −7/−1/+6 |
  | 3D glasses white / blue / red | `#F0F0F0` / `#328DFD` / `#FD3232` | `#E4E6E0` / `#3E86E0` / `#E04040` | all ≥8 in ≥2 |
  | Earring gold | `#FFD926` | `#C79A2E` | −56 / −63 / +8 |

  Two of these shifts are forced anyway: `#F0F0F0`, `#328DFD`, `#FD3232` and `#FFD926` all breach
  `GRAPHICS_CONTRACT.md`'s 30–240 albedo band, so they could never have shipped as written.
- ❌ **The skin hexes specifically.** Never `#C8FBFB` / `#9BE0E0` / `#75BDBD` (alien),
  `#856F56` / `#6A563F` / `#A98C6B` (ape), `#7DA269` / `#5E7253` (zombie), `#DBB180` /
  `#AE8B61` / `#713F1D` (the human tones).
  **And be honest about the near-miss:** a pale cool-teal head is close to the *alien* read, and
  aliens are 9 of 10,000 — the most identity-loaded archetype in the collection. Our `#A9CBC4`
  clears it on measurable grounds and the numbers should be in the report:
  **hue 168° vs the alien family's exact 180°; HSL saturation 0.22 vs 0.52–0.86; lightness 0.73
  vs 0.74–0.88.** The alien family is a *saturated* cyan; ours is a desaturated grey-green that
  is closer to weathered concrete than to it. Two structural safeguards reinforce it, and both
  must actually be built: (a) our head always carries the **stubble block** (r11–r16), which the
  alien base has no equivalent of; (b) our mouth is a **horizontal 3-voxel bar**, where the
  alien base's defining mouth is a **vertical 3-pixel** one. Stubble + horizontal mouth is not
  an alien, at any distance.
- ❌ **Do not reproduce the source's exact base-face bitmap.** The changes in 9.2 are what make
  our grid ours.
- ❌ **No claim of provenance.** No "1 of 10,000" text, no rarity ranking, no fake token ID
  displayed in-game. (The existing `bio`'s "10,000-piece collection" line is generic satirical
  commentary about NFT culture, not a reference to a named product — it is defensible, but if a
  reviewer wants it softened, change it to "a ten-thousand-strong pixel diaspora". Flag it in
  your report; do not silently change it.)
- ❌ **No 1:1 accessory geometry.** Where §7 cites a measured source dimension, that dimension
  is a *ratio reference*; the built object must carry at least one of the deviations in 9.2.

### 9.2 The deliberate deviations that keep this distinct

These are not optional. Each is a structural change from the source, and together they are the
argument that this is a parody of a *style*, not a copy of a *work*.

1. **The face is symmetrised.** The source's base face is asymmetric: features are offset one
   pixel toward one side, the eye pair is flush against one interior edge with two pixels of
   cheek on the other, the neck is offset three pixels from the head's centre, and there is one
   ear. (All four verified directly against the source's published base-face grid: the eye pair
   sits at cols 9–10 / 14–15 on a head spanning cols 6–16, i.e. two pixels of cheek on one side
   and zero on the other; the neck sits at cols 7–9 under a head centred on col 11.)
   Our grid is **mirror-symmetric about `c5` in the neutral pose** for every feature — including
   the neck, which we centre on `c4`–`c6`. Exactly three things sit outside that symmetry and
   this is the complete list: the **ear + earring** (one side, §3.8); the **`skin-hilite`
   diagonal and the eye glints**, which are light responses rather than features and follow the
   key (§3.4); and the **single smirk/frown voxel** (§3.7). Different construction, different
   read from every angle.
2. **The eye is three bands, not two.** Source: a 2×2 cell (2 shadow pixels over 1 dark + 1
   light). Ours: a **brow band + a proud ink lid + a recessed pupil-and-glint row**, occupying
   three rows with **two voxels of depth relief**. The source eye is flat and 2 px tall; ours is
   carved and 3 rows tall with a cyan emissive glint the source has no equivalent for.
3. **The nose is split.** Source human base: two adjacent solid pixels. Ours: **two ink voxels
   with a proud bridge voxel between them**.
4. **The head is volumetric with its own back and side design language.** The source is a flat
   image with no defined volume. Ours is a 11 × 17 × 9 lattice with an ink shell on every plane,
   eight deleted corner voxels, and a rear scalp block. That is original 3D authorship.
5. **Our own palette, with zero retained source hexes.** Teal-grey skin, violet 2-tone mohawk
   (the source's mohawk traits are brown, dark-brown and red — never violet), cyan glint, khaki
   gabardine coat. **Every** colour on the model is either originated here or shifted ≥8/255 in
   ≥2 channels off a source measurement, per the table in §9.1. The earlier draft kept three
   source hexes verbatim on a "generic greys and browns" argument; that argument is probably
   fine and we are not relying on it, because shifting them costs nothing and half of them
   breached the contract's albedo band anyway.
6. **A body exists.** The source archetype has no body below the shoulder line — the canvas ends.
   Our entire figure from `y = 0` to `y = 1.44` is original design in a different genre
   (1940s outerwear), which is also the parody's comedic argument.
7. **Trait counts and combinations are ours.** He wears mohawk + pushed-up goggles + pipe +
   stubble + earring + fedora **simultaneously** — a six-attribute stack, and the goggles are
   worn *pushed up on the forehead*, a wearing position the source has no concept of (its layers
   composite at fixed positions and its VR trait always covers the eyes).
   **The verified numbers, which is what this argument should rest on:** the collection's
   attribute-count distribution is 0→8 punks, 1→333, 2→3,560, 3→4,501, 4→1,420, 5→166, 6→11,
   7→1. So **80.61% carry two or three attributes**, and **11 punks in 10,000 (0.11%) carry six**
   — our density sits in the top tenth of a percent of the distribution.
   **What this brief must NOT claim** — and the earlier draft did — is that the combination is
   *impossible* in the source system, on the strength of an asserted fedora/mohawk mutual
   exclusion. That exclusion could not be verified against any primary source, six-attribute
   punks demonstrably exist, and a parody-safety argument that rests on an unverifiable premise
   is worse than no argument. The defensible statement is the narrow one: **this particular
   six-attribute stack, in this wearing configuration, does not occur in the collection** (Fedora
   appears on 186 punks; only 11 punks carry six attributes of any kind). State it that way.
8. **Six buttons, not ten.** The trench is a 3×2 double-breasted, not the military 5×2.
9. **Resolution mismatch is the joke, and the joke is ours.** "8-bit head, smooth noir body" is
   an original comedic juxtaposition, not a feature of the source.

### 9.3 Positive framing for the report

State in your agent report: *the recognisable elements are the **archetype** (a chunky low-res
pixel-avatar head with stacked joke accessories) and the **medium** (voxel construction at a
visible lattice), not any specific artwork, name, mark, or palette.* That is the sentence that
has to be true when you are done.

---

## 10. Reference notes

### 10.1 Primary source analysis — pixel-level, done for this brief

The source collection's full 2400 × 2400 composite sprite sheet was downloaded from
`github.com/larvalabs/cryptopunks` (`punks.png`, 848 KB, 100 × 100 grid of 24 × 24 tiles) and
decoded **pixel by pixel with PIL**, cross-referenced against the trait index CSV at
`github.com/cryptopunksnotdead/punks.attributes` (`original/cryptopunks.csv`, 10,000 rows:
`id, type, gender, skin tone, count, accessories`). Nine individual tiles were dumped to ASCII
with their exact per-tile palettes. What that produced:

| Extracted | Value |
|---|---|
| Head outline extent | cols 6–16, rows 5–21 → **11 × 17 px** on a 24 × 24 canvas |
| Head interior | cols 7–15 → **9 px** |
| Crown taper | row 5 = 7 px, row 6 = 9 px, rows 7+ = 11 px |
| Eye cells | rows 11–12, cols 9–10 and 14–15 → **2 × 2 px each, 3 px apart** |
| Eye internal structure | row 11 = 2 px of a darker skin tint; row 12 = 1 px black + 1 px lighter tint. **Not** white-with-pupil. |
| Nose | row 15, cols 12–13 → **2 px, one row** |
| Mouth | row 18, cols 11–13 → **3 px, one row** |
| "Smile" trait | **one** black pixel added at row 17, col 10 |
| "Frown" trait | **one** black pixel added at row 19, col 10 |
| Ear | 1 px bump at col 5, rows 12–13, closed with black at row 14 |
| Earring | **one** `#FFD926` pixel at row 14, col 5, flanked by black |
| Neck | cols 7–9 (3 px), rows 21–23, offset left of head centre |
| Shoulder line | row 21, cols 10–14 |
| Feature-cluster asymmetry | eye pair centred on col 12 vs head centre col 11; right eye flush against the interior edge |
| Highlight pixels | **two, diagonal**: (row 7, col 9) and (row 8, col 8) — *not* a vertical pair. Our r2 c3 / r3 c2 is the same diagonal. |
| Mouth vs head centre | mouth cols 11–13 is centred on col 12, one column right of head centre col 11 — part of the same feature-cluster offset |

Per-trait pixel construction extracted from specific tiles (ids from the CSV):

- **#476** (Muttonchops / Nerd Glasses / Pipe / Mohawk) — the mohawk fin: hair at rows 1–6,
  cols 11–12, widening to cols 9–12 at rows 4–5, 2-tone `#A66E2C` / `#85561E`, rising **5 px
  above the crown**. The pipe: 1-px diagonal stem from row 19 col 14 → row 21 col 16, bowl at
  cols 18–22 rows 19–23 in `#855114`/`#683C08`. **The smoke: isolated single pixels at
  (17,20) and (15,20), then a 3 × 2 puff at rows 12–13, cols 19–21, all `#B9B9B9`, floating
  clear of the bowl.** This is the source of §7.3 verbatim.
- **#32** (Frown / VR) — VR goggle block: rows 10–14, cols 7–17, frame `#B4B4B4`, edge `#8D8D8D`,
  a solid black lens window 7 px × 2 px at cols 9–15 rows 11–12, overhanging the head outline
  by 1 px on one side. Skin `#DBB180` with highlight `#E7CBA9`.
- **#67** (Half Shaved / Purple Lipstick / 3D Glasses) — anaglyph glasses: white `#F0F0F0` frame
  rows 11–14 cols 7–16, blue lens `#328DFD` 3 × 2 at cols 9–11, red lens `#FD3232` 3 × 2 at
  cols 13–15.
- **#52** (Shadow Beard / Earring / Nerd Glasses / Knitted Cap) — shadow beard: skin `#713F1D`
  replaced by `#4F2C14` (≈30% darker) across rows 15–20, with `#281B09` at the mouth.
- **#50** (Spots / Fedora) — **the Fedora trait**: crown rows 3–6 (5 → 7 → 7 → 9 px wide), black
  band row 7 (11 px), brim rows 8–9 (15 px then **17 px**). Brim/head-width = **17/11 = 1.55**.
- **#35** (Cigarette / Peak Spike / …) — cigarette: 5 px `#C6C6C6` bar at row 18 cols 14–18,
  ember `#E25B26` at col 19, and a **1 px wide, 6 px tall `#DDDDDD` smoke column**.
- **#20** (Crazy Hair) — chaotic `#E22626` mass spilling outside the head outline on both sides.
- **#4** (Big Shades / Wild Hair / Earring / Goat) — earring at row 14 col 5, `#FFD926`.
- **#372** (Ape / Cap Forward) and **#117** (Zombie / Messy Hair) — skin families: ape base
  `#856F56`, shade `#6A563F`, light `#A98C6B`, dark `#352410`; zombie base `#7DA269`, shade
  `#5E7253`, eye `#FF0000`. Ape base uses **separated nostrils** — the precedent for §3.6.
- **#1** (Smile / Mohawk) and **#518** (Earring / VR / Mohawk) — confirmed the mohawk and
  earring pixel positions are identical across tiles, i.e. traits are composited from fixed
  layers, not redrawn.

Human skin families confirmed across tiles: Light `#DBB180` / `#E7CBA9`, Medium `#AE8B61` /
`#B69F82` / `#86581E`, Dark `#713F1D` / `#562600` / `#855114`. **Alien confirmed** as a
three-step ramp `#C8FBFB` / `#9BE0E0` / `#75BDBD`, all at **exactly hue 180°** — the number that
§9.1's clearance argument for our `#A9CBC4` (hue 168°, saturation 0.22) rests on.

**Independent re-verification of this brief's own numbers.** The base-face grid above was
re-checked line by line against the published `human-male.txt` and `ape-male.txt` 24 × 24 ASCII
grids. Everything in the table holds. Two numbers elsewhere in the earlier draft did **not**, and
are corrected in place:

| Claim in the earlier draft | Verified value |
|---|---|
| "79.61% of outputs carry only 2–3 accessories" | **80.61%** — 3,560 + 4,501 of 10,000. Full distribution: 0→8, 1→333, 2→3,560, 3→4,501, 4→1,420, 5→166, 6→11, 7→1. |
| "a fedora and a mohawk cannot co-occur" / "our stack is impossible in the source system" | **Unverified and probably overstated.** 11 punks carry six attributes and one carries seven, so six-attribute stacks are not impossible — merely 0.11% of output. Fedora count is **186** (confirmed). §9.2.7 now makes the narrow, checkable claim instead. |

Also confirmed at source: Earring **2,459** (24.59%) is the single most common attribute of any
kind in the collection — which is the entire justification for §3.8 spending three voxels on it.

### 10.2 Structural / historical sources

- **`github.com/cryptopunksnotdead/punks.design`** — `original/human-male.txt`,
  `alien-male.txt`, `ape-male.txt`, `zombie-male.txt`: the four base faces as **ASCII grids with
  an explicit `size: 24x24` header**. Confirmed the outline/skin/shadow/eye symbol structure and
  the exact row/column extents independently of the bitmap decode. The alien base's
  **vertical 3-px mouth** and the ape base's **black brow ridge across row 9** came from here.
- **`github.com/cryptopunksnotdead/awesome-cryptopunks-bubble`** — trait frequency table.
  Extracted: Earring 2,459 (24.59%) — by far the most common accessory, hence §3.8's insistence
  on it; Cigarette 961 (9.61%); Big Shades 535; Shadow Beard 526; Bandana 481; Eye Patch 461;
  Wild Hair 447; Mohawk 441 / Mohawk Thin 441 / Mohawk Dark 429; Knitted Cap 419; Crazy Hair
  414; Small Shades 378; **VR 332; Pipe 317; 3D Glasses 286**; Hoodie 259; Beanie 44. Also:
  five archetypes — Male 6,039 / Female 3,840 / Zombie 88 / Ape 24 / Alien 9; ~100 layered
  building blocks; **80.61% of outputs carry only 2–3 accessories** (the basis for deviation
  9.2.7 — note this is 80.61, not the 79.61 an earlier draft carried). Also confirmed the
  design's origin as a layered Photoshop file that became a code-based layer compositor.
- **`gentlemansgazette.com/trench-coat-guide`** — trench construction: double-breasted, the
  military 10-button front, gun/storm flap (one side, weather + recoil), epaulettes (used to
  secure gas masks, gloves, whistles — not just rank), **belt with D-rings** and leather-covered
  buckles, cuff straps, pleated-wedge back vent with button closure, hooked throat latch under
  the collar, 100% cotton **gabardine** in khaki/camel/stone. Confirmed the coat's film-noir
  detective association.
- **`gentlemansgazette.com/fedora-hat-guide`** + Village Hat Shop "Anatomy of a Hat" (via
  search) — fedora dimensions: **crown 4–5.5 in, typical 4.5 in (11 cm)**; **brim 2.5–3.5 in
  classic**; centre crease front-to-back with **two front pinch dents** forming the teardrop;
  **snap brim** = down at the front, up at the back. All of §7.2's numbers are scaled from these.
- **`en.wikipedia.org/wiki/Raglan_sleeve`** (via search) — raglan seam runs neck-to-underarm;
  the reason the trench's shoulder reads rounded rather than square.

### 10.3 Voxel-rendering technique sources

- **spotvox (`github.com/tommyettinger/spotvox`)** — outline modes for voxel renders
  (`none / partial / light / heavy / block / wire`), with the explicit guidance to use the
  **heavy/black-exterior-edge modes for important, moving characters** and the light modes for
  background objects. This is the direct justification for §2's mandatory 1-voxel ink keyline
  shell: an outline is not decoration on a voxel character, it is the readability mechanism.
- **Voxel-style ambient occlusion devlog (yunasawa.itch.io, "Devlog #1.4")** — per-vertex voxel
  AO computed from the up-to-8 voxels adjacent to each face's corners, quantised to **three
  darkening levels** (with a special intermediate case), packed into a vertex attribute. §3.10.5
  is this technique with concrete multipliers.
- **Per-face shading multipliers** — the standard voxel practice of multiplying each of a
  voxel's face colours by different constants (e.g. 1.0 / 0.9 / 0.8) to imply a light direction
  independent of the actual lighting; found in voxel-renderer discussion via search. §3.10.4
  extends this to six directions.
- **Codrops, "Turning 3D Models to Voxel Art with Three.js" (2023)** — practical three.js voxel
  build: `RoundedBoxGeometry` with a `boxRoundness` parameter rather than plain cubes;
  voxels sized to exactly match the grid pitch with **no gaps**; one merged/instanced draw call;
  surface-only voxel retention (interior culling). §3.10 follows this with **two** important
  divergences. First, we cap roundness at 5–8% — the article's own renders show that generous
  roundness "softens the pixelated appearance", which is precisely what we must not do.
  Second, and more consequentially, **we do not use `RoundedBoxGeometry` per voxel**: the article
  builds decorative statics where 100+ triangles per voxel is affordable; a 738-voxel shell at
  that cost is ~80k triangles, a third of this game's entire match budget for one head. §3.10.2's
  two-tier build (44-triangle bevelled cubes only where edges are seen; greedy-merged flat runs
  everywhere else) is the fighting-game version of the same idea.
- **three.js voxel-geometry manual** — the interior-face-culling requirement (a naively merged
  voxel volume wastes every hidden face) and the warning that per-face colour changes force
  extra triangles. Hence §3.10's "one merged geometry per colour, ≤ 900 visible faces".

### 10.4 Things deliberately not adopted

- The source's **3/4 feature offset and single-sided ear placement** — breaks in 3D (§9.2.1).
- The source's **flat 2-px eye** — no depth, no blink, no glint (§9.2.2).
- **Alien/ape/zombie skin hexes** — protected identity of specific archetypes (§9.1).
- **`InstancedMesh`** for the head, despite it being the standard voxel optimisation — it makes
  per-region material swaps and `Gore` subtree cloning painful. Merged-per-colour is the right
  trade at ≤950 visible faces / ≤9k triangles (§3.10.2–4).
- A **canvas-texture face** (the current implementation) — a `MeshBasicMaterial` quad cannot
  participate in the lighting rig, cannot cast the socket shadow that §3.4 depends on, and is
  explicitly ruled out by `GRAPHICS_CONTRACT.md` §9's "not painted-on quads".
