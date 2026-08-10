# BONKO — parody-likeness build brief

**Fighter:** `src/characters/bonko.js` · `BonkoDef` · `id: 'bonko'`
**Source archetype:** the hyper-fast dog-coin of a high-throughput chain — speed, near-zero fees,
relentless energy — rebuilt as an **Australian Cattle Dog / blue heeler bike courier**.
**Contract authority:** `GRAPHICS_CONTRACT.md` §9 (parody mandate), §3 (`surfaceMaps`), §4 (`pbr`/`SURFACE`),
`CONTRACTS.md` §4 (rig — frozen).
**Author:** character-art-direction pass, research-backed (July 2026). Every number below derives
from a cited breed standard, a coat-genetics source, a garment-construction source, or from the
existing code — see §10. **Build to the numbers, not to the adjectives.**

> **The one-line thesis.** The blue heeler's identity is *not a colour, it is a texture*: a dog that
> is genetically **white** with black hairs "closely interspersed through a predominantly white coat"
> (Wikipedia/ACDCA, §10). Everyone who builds this character wrong builds a solid grey dog. The whole
> job is (a) prick ears + forward-thrust head, (b) a **dense speckle that resolves to one flat blue-grey
> at 3 m and into individual specks at 30 cm**, (c) a hard-edged solid **mask over one eye**, and
> (d) a courier strap that visibly compresses the coat it crosses.

### Axis convention (get this right first)
The rig faces **+X**. In this file and in the existing code, `box(w, h, d)` means
**w → X (forward/depth), h → Y (up), d → Z (lateral width)**. Ears sit at `z = ±…`. Feet at `y = 0`.
All metre values are in this space.

### Height — read this before you scale anything
`BonkoDef.height = 1.7`. **This is a gameplay constant and must not change** (hurtbox/hitbox sizing
and every move's `hitbox.forward`/`hitbox.up` key off it). BONKO is deliberately the **shortest and
lightest fighter in the game** (`weight: 0.95`, `walkSpeed: 6.4`, `dashSpeed: 13.5` — the fastest of
both). Every fraction below is stated against **H = 1.700 m**, and where it matters it is also given
in pixels at the 128 px silhouette test (**1 px = 0.01328 m**).

### What actually exists in the file (counted, not remembered)
Do not trust round numbers you have seen in other briefs. As of this pass `src/characters/bonko.js`
is **1,746 lines** and contains:

| Thing | Count | Names |
|---|---|---|
| Bones returned by `buildModel()` | **15** | see the hierarchy below |
| Clips in `clips` | **31** | `idle walk jump fall crouch block hitLight hitHeavy launched knockdown getup entrance win lose taunt parcelJab dashPunch tailStrike slidingKick backpackBash sprintTackle wallJump rapidPaw deliveryToss signatureSlam sameBlock finality gasFree infiniteTps lostPackage expressLiquidation` |
| Entries in `BonkoDef.moves` | **16** | `parcel-jab dash-punch tail-strike sliding-kick backpack-bash sprint-tackle wall-jump rapid-paw-combo delivery-toss signature-required spam-mint same-block-delivery gas-free-combo infinite-tps finality-express lost-package` |
| Moves carrying a `script` | **12** | `dashPunch slidingKick sprintTackle wallJump rapidPaw deliveryToss sameBlock gasFree infiniteTps finality lostPackage spamMint` |
| Finisher | **1** | `BonkoDef.finisher`, clip `expressLiquidation` |

**16 moves + 1 finisher, 31 clips, 12 scripts.** Every "run the harness over all N moves" instruction
in this file means **16 + the finisher**. Note `spam-mint` has a script but no clip of its own and
`expressLiquidation` is a clip with no `moves` entry — both are correct, do not "fix" either.

### Rig is frozen
`buildModel(costume)` must keep returning exactly these 15 bones, in this hierarchy — all 31 clips
and all 12 move scripts key off them:

```
group > hips > { tail, legL > shinL, legR > shinR, torso }
torso > { pack, armL > forearmL, armR > forearmR, head > { earL, earR } }
```

Bind-pose local offsets that **must not change** (clip keys are absolute for `hips`):

| bone | parent | local offset | world y (bind) |
|---|---|---|---|
| `hips` | `group` | `[0, 0.78, 0]` | 0.780 |
| `torso` | `hips` | `[0, 0.10, 0]` | 0.880 |
| `head` | `torso` | `[0.10, 0.52, 0]` *(x was 0.04 — see §4.6)* | 1.400 |
| `earL` / `earR` | `head` | `[-0.052, 0.130, ±0.078]` *(was `[-0.03, 0.20, ±0.10]` — see §3.8)* | 1.530 |
| `armL` / `armR` | `torso` | `[0.02, 0.38, ±0.155]` *(z was ±0.28 — see §4.2)* | 1.260 |
| `forearmL` / `forearmR` | `armL/R` | `[0, -0.23, 0]` | 1.030 |
| `legL` / `legR` | `hips` | `[0, -0.02, ±0.13]` | 0.760 |
| `shinL` / `shinR` | `legL/R` | `[0, -0.36, 0]` | 0.400 |
| `pack` | `torso` | `[-0.26, 0.34, 0]` | 1.220 |
| `tail` | `hips` | `[-0.22, 0.08, 0]` | 0.860 |

**Three** offsets move. All three are justified below and all three are gated in §11:

| offset | current (verified in the file) | new | why |
|---|---|---|---|
| `head` | `[0.04, 0.52, 0]` | `[0.10, 0.52, 0]` | forward head carriage (§4.6) |
| `armL/R` | `[0.02, 0.38, ±0.28]` | `[0.02, 0.38, ±0.155]` | the current shoulder span of 0.56 m on a 1.70 m body is 0.33 H — wider than a heavyweight's; it is the single worst proportion in the file (§4.2) |
| `earL/R` | `[-0.03, 0.20, ±0.10]` | `[-0.052, 0.130, ±0.078]` | the ears currently sprout at world y **1.600**, leaving only 0.100 m of ear below the 1.700 silhouette top; dropping the base to 1.530 buys a **0.182 m** ear, which is what makes the prick-ear read survive 128 px (§3.8) |

None of the three changes a hitbox `forward`/`up`; no hitbox has a lateral term; and all `earL`/`earR`
clip tracks in the file are **rotation** tracks, so moving the ear *pivot* cannot desync a clip.
The move scripts are therefore unaffected — **but run the harness anyway (§11.7)**.

**No new bones. No meshes parented directly to `group`.** Everything hangs off a bone, because
`Gore._detach()` clones a bone's whole subtree and hides the original — that is how props survive
dismemberment (§7.9).

---

## 1. The 2-second test

**A lean dog head thrust forward and low — carried at shoulder height, muzzle leading the chest by a
full hand — with two hard-edged upright triangular ears spread wide off the top of the skull, whose
whole body is a dense blue-grey *speckle* (not a colour: a texture, white ground with black hairs
through it) broken by exactly four clean solid shapes: a near-black mask covering one eye and nothing
around the other, a cream blaze running throat-to-chest, russet-tan points on the forelegs and jaws,
and one bright white tail-tip whipping through an arc that never stops — wearing a short-brimmed
cycling cap notched to let the ears through and a dark courier satchel whose diagonal strap visibly
crushes a groove across the cream chest.** That is the read.

Four things in that sentence are load-bearing and are the ones builds get wrong:

1. **The coat is speckled, not grey.** The Australian Cattle Dog Club of America defines the blue
   colour as *"a more or less even intermingling of black and white hairs in the outer coat giving
   the impression of bluish colour"*, and the breed is genetically extreme-white — the dogs are
   **born white** and the colour develops in the white areas over the first weeks (§10 refs 2, 3, 6).
   If your body albedo is one flat hex, you have built a generic grey dog and thrown away the entire
   identity. §6.2 gives the algorithm; §5 gives the exact coverage fraction the mip average must hit.
2. **The mask is on ONE eye.** A patch over one eye is a *half* (single) mask, a patch over both is a
   *full* (double) mask, and neither is a fault — both are breed-standard (§10 ref 4). We build the
   **half mask**, on the dog's left (`+Z`) side. It is the single most memorable thing in the design:
   it makes the face asymmetric, it survives to 64 px as a dark blob offset from centre, and it is
   documented breed reality rather than an invention. The unmasked eye must be genuinely clear —
   speckled cheek right up to the eye rim. Do not "balance" it.
3. **The ears are PRICK and set WIDE, not tall and close.** The standard: *"moderate size… broad at
   the base, muscular, pricked and moderately pointed"*, *"set wide apart on the skull, inclining
   outwards"*, leather *"thick in texture"* (§10 ref 1). Two errors kill this: a needle-sharp tip
   (that is a shepherd/shiba), and ears set close on the crown (that is a corgi). Ours are broad-based
   isoceles wedges, tips blunted to a 0.010 m radius, canted 18.5° outward, with a **V of clean
   background between them that the cap must not fill**.
4. **The posture is forward, not upright.** The ACDCA working standard calls it *"an upright breed
   with the head carried at shoulder level while working"*, and the working technique is to nip low
   and **duck to miss the kick** (§10 ref 8). That gives us a permanently coiled, forward-pitched
   stance: chin **below** the withers, brisket forward, rear foot on the ball, stifles at 128°.
   He is never standing; he is between two sprints.

Everything else — the cap, the satchel, the hi-vis strip, the parcel — is confirmation, not
identification. **If a viewer needs the satchel to know this is a heeler, the coat and the head have
failed.** Conversely, if a viewer needs the coat to know he is a courier, the strap has failed: the
strap is the only prop that is allowed to be a *silhouette-and-value* event rather than a detail.

Second beat, half a second later: the **tail**. It is a bright white tip on a dark brush, and it is
the only thing on the model that is *always* moving — **all 31 clips animate `tail`**, 29 of them via
the shared `wag()` helper and two by hand (`lose`, a slow sad sweep, and `tailStrike`, a whip). At any
distance where the speckle has resolved into flat grey, that white dot tracing a 0.6-rad arc is what
says "hyper". Do not let it dampen, do not let it rest against the thigh, do not lose the white tip.

---

## 2. Silhouette specification

Total silhouette height **1.700 m** (ear tips). Head height `H_h` — skull crown (1.560) to the
lowest point of the underjaw (1.245), measured in **world Y**, **ears and cap excluded** — is
**0.315 m**. The figure is therefore **1.700 / 0.315 = 5.40 head-heights**.

That is deliberate. He is not a hero-proportioned 7-head sprinter and he is not the ape's squat
5.0. 5.4 is the ratio that keeps a big enough head to carry the mask and the ears at 128 px while
still reading as *lean*.

**Where the 0.315 comes from — read this, because the naive build gets it wrong.** The cranium +
muzzle block, crown fur included, is only **0.195 m deep** (0.65 × its 0.300 m length — correct
mesocephalic, §3.0). The
remaining **0.120 m** of world-Y extent (plus 0.012 of crown fur) is the **mandible**, which on this
character is deliberately deep: measured perpendicular to the muzzle axis it is **0.135 m deep at the
jaw angle** (§3.5). Two consequences you must build to:

- The head's *anatomical* profile stays a proper dog: long skull, shallow braincase, distinct muzzle.
  The extra mass hangs **under** it, behind the lip line, where it cannot corrupt the 57 : 43
  skull-to-muzzle read (§3.0) that is the anti-Shiba check.
- The lowest point of the head silhouette is therefore **not the front chin** — it is the **ventral
  border of the mandible at the jaw angle**, at head-local x ≈ **+0.010**. Every "chin" number in
  this file means that landmark. The front chin point sits higher, at world **1.365**.

Head width across the flared ear tips is **0.290 m = 0.171 H**; skull width across the zygomatic
arches (`W_s`, the master unit for §3) is **0.205 m**. The ear span therefore exceeds the skull width
by **0.085 m**, which is what makes the ears — not the skull — the widest thing above the shoulders.

### 2.1 Vertical landmark table (feet at y = 0) — AUTHORITATIVE

Every number in §3 derives from this table via `head`-local y = world y − 1.400 (§3.0).
**If any number anywhere else in this file disagrees with this table, this table wins.**
Rows are grouped **head landmarks first, then body** — they are *not* in descending y, so do not read
the ordering as a vertical sequence. The head group ends at the underjaw low point (1.245); the body
group restarts at the withers (1.322).

| Landmark | world y (m) | `head`-local y | fraction of H (1.700) | head-heights from floor |
|---|---|---|---|---|
| **Ear tip** (silhouette top) | **1.700** | +0.300 | 1.000 | 5.40 |
| Cap crown (highest point of the cap) | 1.594 | +0.194 | 0.938 | 5.06 |
| **Skull crown** (fur, cap removed) | **1.560** | +0.160 | 0.918 | 4.95 |
| Ear base, rear margin (leather meets skull) | 1.530 | +0.130 | 0.900 | 4.86 |
| Occiput (rearmost/highest point of the cranium) | 1.548 | +0.148 | 0.911 | 4.91 |
| Brow ridge (supraorbital) top edge | 1.518 | +0.118 | 0.893 | 4.82 |
| Stop notch (deepest point of the bridge break) | 1.474 | +0.074 | 0.867 | 4.68 |
| **Eye aperture centre line** | **1.468** | **+0.068** | 0.864 | 4.66 |
| Nose leather centre | 1.429 | +0.029 | 0.841 | 4.54 |
| Zygomatic arch — head at its widest | 1.408 | +0.008 | 0.828 | 4.47 |
| **`head` bone pivot** | **1.400** | **0.000** | 0.824 | 4.44 |
| Mouth commissure (lip corner) | 1.383 | −0.017 | 0.814 | 4.39 |
| Lip line at the muzzle front / **chin point** (front of the mandible) | 1.365 | −0.035 | 0.803 | 4.33 |
| **Underjaw low point** — ventral mandible at the jaw angle (x ≈ +0.010); **bottom of the head silhouette**, and the landmark every "chin" number in this file refers to | **1.245** | **−0.155** | 0.732 | 3.95 |
| Withers (top of the shoulder blade) | 1.322 | — | 0.778 | 4.20 |
| **Shoulder pivot** (`armL/armR`) | **1.260** | — | 0.741 | 4.00 |
| Satchel bone (`pack`) | 1.220 | — | 0.718 | 3.87 |
| Throat base / manubrium | 1.196 | — | 0.704 | 3.80 |
| Chest apex (forward-most point of the brisket) | 1.150 | — | 0.676 | 3.65 |
| **Elbow** (`forearmL/R`) | **1.030** | — | 0.606 | 3.27 |
| Brisket bottom (deepest point of the chest) | 0.985 | — | 0.579 | 3.13 |
| Waist / tuck-up (narrowest point of the underline) | 0.905 | — | 0.532 | 2.87 |
| Croup top | 0.858 | — | 0.505 | 2.72 |
| **Tail set** (`tail` bone) | **0.860** | — | 0.506 | 2.73 |
| Wrist / paw heel (arms relaxed) | 0.830 | — | 0.488 | 2.64 |
| **Hip pivot** (`hips`) | **0.780** | — | 0.459 | 2.48 |
| Hip joint (`legL/legR`) | 0.760 | — | 0.447 | 2.41 |
| Paw tips (arms relaxed at the side) | 0.745 | — | 0.438 | 2.37 |
| **Stifle / knee** (`shinL/shinR`) | **0.400** | — | 0.235 | 1.27 |
| Hock | 0.185 | — | 0.109 | 0.59 |
| Ball of the foot (top of the forefoot sole stack) | 0.030 | — | 0.018 | 0.10 |
| Ground | 0.000 | — | 0.000 | 0.00 |

> **Rig-consistency gate — these are a closed chain.** Shoulder 1.260 − upper arm 0.230 = elbow
> 1.030. Elbow − forearm 0.200 = wrist 0.830. Wrist − paw 0.085 = paw tips 0.745. Hip 0.760 − femur
> 0.360 = stifle 0.400. Stifle − tibia 0.215 = hock 0.185. Hock − metatarsus 0.155 = ball 0.030, and
> the **0.030 m forefoot sole stack** fills 0.030 → ground. Change one and you recompute all of them,
> then re-verify the 12 move scripts' reach against the harness (`GRAPHICS_CONTRACT.md` §9, last
> bullet).

### 2.2 Horizontal / depth landmarks

| Measure | value (m) | as fraction of H | note |
|---|---|---|---|
| Head width, ear tips (outer edge to outer edge) | 0.290 | 0.171 | the widest thing above the shoulders |
| Head width, ear bases (outer edge to outer edge) | 0.242 | 0.142 | base centres ±0.078, base width 0.086 → 0.078 + 0.043 = 0.121 per side. "Set wide apart" (§10 ref 1) |
| `W_s` — skull width at the zygomatic arches | **0.205** | 0.121 | **master unit for all of §3** |
| Shoulder width, outside deltoid to outside deltoid | 0.396 | 0.233 | lean; see §4.2 |
| Chest width (Z) at the widest | 0.320 | 0.188 | "deep… moderately broad" |
| Chest depth (X, brisket front to rib rear) | 0.400 | 0.235 | deep chest is the engine |
| Waist width (Z) at the tuck-up | 0.235 | 0.138 | **0.73 × chest width** |
| Hip width (Z) across the croup | 0.290 | 0.171 | |
| Stance: foot centres | ±0.135 | — | sole width (Z) 0.082 → **outer stance 0.352** (0.207 H) |
| Total body length, chest apex (x +0.200) to buttock (x −0.360) | 0.560 | — | the standard is *"length of the body… greater than the height at the withers, as 10 is to 9"* (§10 ref 1, verbatim). **0.560 × 9/10 = 0.504 m** is therefore the quadruped-read withers height this torso block must check against. It is a *proportion check on the torso*, not the biped's 1.700 m stature — do not confuse the two. |
| Nose tip, world x | +0.305 | — | leads the chest apex (+0.200) by **0.105 m** |

### 2.3 Where the mass sits

- **Above the waist (y > 0.905) : below = 46 : 54.** Leg-heavy. This is the inverse of every heavy
  fighter in the roster and it is what makes him read as fast standing still. Do not let the satchel
  or the chest push the top half past 50%.
- **Head + ears = 0.455 m of 1.700 (27% of height) but only ~22% of perceived visual mass**, because
  the head is *narrow* (0.205 W_s against a 0.396 shoulder span) and thrust forward where perspective
  shrinks it. The mass anchor of this character is the **thigh + croup block**, not the head.
- **The widest point of the whole figure is the shoulders (0.396 m) at 0.741 H**, but the *most
  isolated* width is the ear span (0.290 m) at the tip line, **world y 1.700 = 1.000 H**, sitting
  against clean background on both sides and against nothing else at all. The eye lands on the ears
  first, then slides down the forward diagonal of the neck into the chest. Protect that diagonal.
- The design is a **wedge**: tail root (0.860, x **−0.22** — the `tail` bind offset, do not draw it
  further back than the bone) → withers (1.322, x −0.05) → ear tips (1.700, x −0.02), with the muzzle
  spearing out at x +0.305. Filled black, he is an arrowhead pointing forward-up. Nothing may soften
  that.

### 2.4 Must survive filled-black at 128 px

At 128 px for a 1.700 m figure, **1 px = 0.01328 m**. Every claim is given in metres *and* pixels so
you can measure it in a screenshot instead of arguing about it.

1. **The two ear triangles — cue #1.** Each ear: base **0.086 m (6.5 px)** wide, **0.182 m (13.7 px)**
   along its axis, base centres at z ±0.078, tip centres at z ±0.135, **outer edges 0.290 m (21.8 px)
   apart**. The V of clean background between them is bounded by the ears' *inner* edges and floored
   by the crown fur, so its measurements are:

   | V measurement | value | px at 128 |
   |---|---|---|
   | Width at the ear-tip line (y 1.700), inner edge to inner edge | **0.250 m** | **18.8 px** |
   | Width at the ear-base line (y 1.530) | **0.074 m** | **5.6 px** |
   | Depth from the tip line down to the crown fur at the midline (1.700 − 1.560) | **0.140 m** | **10.5 px** |

   That is a **0.250 × 0.140 m** wedge of background — not a slot, a *chasm*. If the cap, the crown
   fur or a lazy skull sphere fills it, the character becomes a bear. This is the single most
   important negative space on the model, and it is why §7.2's cap is notched rather than domed.
2. **The forward wedge.** Nose tip at x +0.305 vs chest apex x +0.200 → **0.105 m (7.9 px)** of muzzle
   projecting clear of the body in profile, and the chin (1.245) sitting **0.077 m (5.8 px) below**
   the withers (1.322). Both must be visible in a black fill from a ¾ view.
3. **The satchel bulge.** The torso's rear surface at the bag's centre height (y 1.160) sits at
   x −0.172; the bag's rear face sits at x −0.308. The pack therefore breaks the rear silhouette by
   **0.136 m (10.2 px)**, low on the left, with a hard flat top edge (the flap) — an unmistakably *manufactured*
   straight line against an all-organic body. Manufactured straight lines on an animal silhouette are
   the cheapest, strongest "this creature has a job" cue there is.
4. **The tuck-up notch.** Underline rises **0.080 m (6.0 px)** from the brisket bottom (0.985) to the
   waist (0.905), and the waist is **0.73×** the chest width. In a black fill this is a concave bite
   out of the belly line. **Be honest: at 128 px this is a 3–6 px concavity and it is fragile.** It
   is backed up by a value cue (the cream underside, §5) — build both.
5. **The leg zigzag.** Hip (x 0) → stifle (x +0.055) → hock (x −0.015) → ball (x +0.070). The two
   resulting background voids are **0.070 × 0.130 m (5.3 × 9.8 px)** in front of the tibia and
   **0.055 × 0.120 m (4.1 × 9.0 px)** behind the thigh. A straight cylinder leg (what is in the file
   today) loses both and is the second-worst thing in the current model.
6. **The tail.** 0.420 m (**31.6 px**) long, sweeping ±0.6 rad. At 128 px what actually reads is not
   the tail shape but the **moving white tip** (§5) — a 0.035 m (2.6 px) bright dot on an arc. That
   is a *motion* cue, and it is the only one on the list that does not exist in a still frame.
7. **The cap brim.** Projects **0.052 m (3.9 px)** forward of the brow at a −18° droop. Marginal at
   128 px, decisive at 256. It changes the head profile from "dog" to "dog wearing something", which
   is the whole courier read.
8. **NOT on this list:** the speckle, the hi-vis strip, the buckles, the label, the claws, the tan
   points. All of those are 1 m and 30 cm cues. Do not thicken any of them to force a 128 px read —
   a fat hi-vis stripe reads as a racing stripe, a coarse speckle reads as mud.

### 2.5 Negative space (this is what actually defines the shape)

- **The ear V** — see 2.4.1. Non-negotiable.
- **The jaw–chest wedge.** Because the head is thrust forward and carried low, there is a triangular
  void with vertices at the underjaw low point (**1.245, x +0.110**), the chest apex (**1.150,
  x +0.200**) and the front of the shoulder (**1.260, x +0.020**). Bounding box **0.180 m (X) ×
  0.110 m (Y) = 13.6 × 8.3 px**; largest inscribed circle Ø **0.033 m (2.5 px)**. Be honest about
  that second number — it is a thin wedge, not a window, and **it must never close.** This is the
  constraint that limits how far the head can be pushed
  forward and down: push further and the jaw fuses to the chest and the neck disappears. It is also
  the reason the neck ruff must stay short (§4.6) — a full ruff fills this void and turns him into
  the mountain dog, which is a different fighter in this roster.
- **The tuck-up sweep.** Between the elbow (1.030) and the stifle (0.400) the underline must be a
  single continuous concave curve, **never a straight line and never convex**. Depth at its deepest:
  0.043 m (3.2 px) inside the line joining brisket bottom to the front of the thigh.
- **Arm-to-ribcage gap** never closes below **0.055 m (4.1 px)** in idle. Arms hang clear, elbows out
  a little — he is a boxer at rest, not a dog standing.
- **The two leg voids** — see 2.4.5.
- **Between the legs at hock height: 0.222 m (16.7 px)** — leg centres ±0.132 at that height, gaskin
  Ø 0.042 at the hock, so the inner edges land at ±0.111. Do not close it.
- **Tail-to-thigh clearance ≥ 0.050 m (3.8 px) at every wag extreme.** If the tail brushes the thigh
  at the end of the arc, the white tip disappears into the body at exactly the moment the eye is
  tracking it. Clamp the wag amplitude before you clamp the clearance.
- **The stabiliser-strap loop.** The secondary strap (§7.1) leaves a **0.020 m (1.5 px)** slot of
  background at the armpit. Tiny, but it is what proves the strap is a separate object and not a
  painted line.

---

## 3. Head construction (the most important section)

### 3.0 The head frame — read this before touching a number

All coordinates in §3 are **`head`-bone-local**. The `head` pivot sits at world **(0.10, 1.400, 0)**
in the bind pose (§header). Therefore:

```
head-local y = world y − 1.400
head-local x = world x − 0.100        (x is FORWARD)
underjaw low point = −0.155     skull crown = +0.160     H_h = 0.315
```

**Head-local axes are world-aligned** — the frame is translated to the `head` pivot, *not* rotated
into the muzzle's axis. So every y below already contains the head's forward pitch. The one number
that governs all of them:

> **Master pitch: the skull's top plane runs 16° nose-down through head-local (−0.095, +0.148).**
> Everything dorsal derives from it: the plane is at **+0.108** at the brow (x +0.046) and **+0.099**
> at the stop (x +0.077); and — because the standard requires the muzzle to be **parallel** — a
> bridge plane **0.025 m below it**, running at the same 16° out to the nose. Change the 16° and you
> recompute §3.2, §3.3, §3.5 and §3.6 in that order.

Two master units, used everywhere below:

- **`W_s` = 0.205 m** — skull width at the zygomatic arches, ears excluded. The unit for everything
  horizontal on the face.
- **`H_h` = 0.315 m** — head height in world Y, skull crown (+0.160) to underjaw low point (−0.155).
  The unit for everything vertical. It is **not** the anatomical crown-to-jaw depth (0.195) — see the
  depth budget below.

**Head length budget (X), and the ratio that makes it a cattle dog and not a shiba or a wolf:**

| Segment | head-local x range | length (m) | share |
|---|---|---|---|
| Occiput → stop | −0.095 → +0.077 | **0.172** | **57%** |
| Stop → nose leather tip | +0.077 → +0.205 | **0.128** | **43%** |
| Total head length | −0.095 → +0.205 | 0.300 | 100% |

57 : 43 cranium-to-muzzle is the mesocephalic ratio (skull length 15.0 ± 3.0 cm, facial length
6.46 ± 1.55 cm → 43% — §10 ref 7). Push the muzzle past 47% and he reads as a collie/wolf; pull it
under 38% and he reads as a shiba, which is a **different fighter in this roster** (`dogey.js`).
This ratio is the primary defence against BONKO and DOGEY looking like the same dog.

Total head length 0.300 m against `W_s` 0.205 m gives a **cranial index of 0.68** — long-ish and
narrow, which is the athletic read.

**The depth budget — do not skip this, it is where every dog head goes wrong.**

| Band | head-local y range | depth (m) | share of `H_h` |
|---|---|---|---|
| Cranium + muzzle block (skull top plane → muzzle ventral / lip line) | +0.148 → −0.035 | **0.183** | 58% |
| Crown fur over the occiput | +0.148 → +0.160 | **0.012** | 4% |
| **Mandible** (lip line → underjaw low point at the jaw angle) | −0.035 → −0.155 | **0.120** | 38% |
| **Total `H_h`** | +0.160 → −0.155 | **0.315** | 100% |

So the head's world-Y extent (0.315) is **1.05 × its X extent (0.300)** — but the *anatomical* block
is only **0.195 deep** (0.183 + 0.012) against 0.300 long = **0.65**, which is textbook mesocephalic.
The remaining 38% is a deliberately deep, stylized mandible. It hangs **below and behind the lip
line**, so it adds jaw authority and a heavy lower-face shadow without touching the 57 : 43 profile
that keeps him out of `dogey.js` territory. Build the jaw depth; do **not** get it by inflating the
braincase or lengthening the muzzle — both of those break the read.

### 3.1 Cranium

- **Form.** Start from a bevelled ellipsoid, `0.190 (X) × 0.165 (Y) × 0.186 (Z)`, centred at
  head-local `(−0.010, +0.078, 0)`. That puts its top at **+0.1605** — the skull crown (+0.160) —
  its rear at x −0.105 (the occiput fillet, §below) and its front at +0.085. Its own maximum width is
  0.186; the full `W_s` of 0.205 arrives only once the masseter lens is blended on (§below). Then
  flatten: the standard says the skull is *"broad, slightly curved between the ears, flattening to a
  slight but definite stop"* (§10 ref 1). Concretely:
  - The **top plane of the skull** (from the occiput at x −0.095 to the brow at x +0.046) is a
    single near-flat plane tilted **16° nose-down** (§3.0 master pitch), with a lateral crown radius
    of **0.150 m** — i.e. only slightly domed side to side. A hemispherical crown is the #1 head
    error, and a plane shallower than ~12° is the #2: it flattens the forward-hunting read and it
    forces the muzzle up, because the muzzle must stay parallel to it (§3.2).
  - Behind x −0.060 the plane rolls over into the occiput with a **0.030 m fillet**. The occipital
    crest is a modelled ridge **0.008 m proud** running laterally between the ear bases — it catches
    the rim light and it separates the skull from the neck at distance.
- **Cheek / zygomatic.** *"Cheeks muscular, neither coarse nor prominent."* The widest point of the
  head (`W_s` = 0.205) sits at **head-local (+0.020, +0.008)**, i.e. below and slightly forward of
  the eye. From there the skull tapers to **0.148 m** wide at the occiput and to **0.098 m** at the
  muzzle base. Build the masseter as a separate lens per side, `0.075 (X) × 0.060 (Y) × 0.010 (Z)`,
  blended in: cranium 0.186 + 2 × 0.010 = **0.206 ≈ `W_s`**. A thicker lens overshoots `W_s` and
  gives him hamster cheeks — the standard is explicit that cheeks are *"neither coarse nor
  prominent"*. It must still be readable as a bulge when the jaw clenches (§8.1).
- **Temporal hollow.** A shallow concavity, **0.010 m deep**, between the zygomatic arch and the
  sagittal line, centred at `(−0.010, +0.075, ±0.062)`. This is where the mask's rear extension
  lands (§3.9) and it is the only concave form on the upper skull. Skip it and the head reads as
  inflated.

### 3.2 Stop and bridge — the cattle-dog signature

*"A slight but definite stop"*, and *"skull and muzzle on parallel planes"* (§10 ref 1). Those two
clauses together are a precise geometric instruction and almost nobody builds them:

- The **muzzle bridge** (dorsum) is a plane **parallel to the top plane of the skull** — both at 16°
  nose-down. Not converging (that is a collie), not diverging (that is a boxer). **Parallel.**
- The bridge plane is offset **0.025 m** *below* the skull plane, measured vertically
  (0.024 m perpendicular).
- The transition between them happens over **0.030 m** of X, giving a local ramp of
  `atan(0.025 / 0.030) = 40°`. That is the "slight but definite" stop: a real, shadow-catching
  break, but nowhere near the 80–90° step of a brachycephalic breed.
- **Closing the chain:** skull plane at the stop (x +0.077) = +0.099; minus 0.025 → stop notch bottom
  **+0.074** (world 1.474, §2.1 ✓). Carry the bridge forward at 16° for the muzzle's 0.128 m and it
  arrives at **+0.037** at the nose tip (x +0.205) — which is what fixes the nose leather's height in
  §3.6 and the lip line's in §3.7. Do not set those by eye.
- The stop notch bottoms out at head-local `(+0.077, +0.074)` and is **0.052 m (0.25 W_s)** wide,
  flanked by the two brow ridges.
- Build it as a **bevelled wedge boolean**, not as a sphere intersection: the two parallel planes
  must remain genuinely flat for 0.06 m either side of the break, because it is the *flatness* that
  makes the parallelism read.

### 3.3 Brow ridge and the tan pips

- **Supraorbital ridge**: a shallow horn, cross-section **0.014 (X) × 0.010 (Y)**, arcing from just
  above the eye's medial corner at `(+0.078, +0.106, ±0.026)` outward and back to
  `(+0.010, +0.118, ±0.082)`. Its highest point is the **outer** end, top edge at head-local y
  **+0.118** (world 1.518, §2.1) — i.e. **0.050 m above the eye centre (+0.068)** = **0.159 H_h**.
  Along its whole run it projects **0.010–0.014 m** proud of the skull's top plane, which at those
  two x values is +0.097 and +0.118 respectively. The ridge rising *outward* rather than inward is
  what gives a cattle dog its wide, level, sceptical brow instead of a terrier's peaked one.
- Under the ridge, a **supraorbital sulcus 0.006 m deep** so the ridge casts a line onto the lid even
  in flat light. This is what gives a dog its "intelligent" brow without any texture work.
- **Tan pips (eyebrow dots).** Two, one directly over each eye centre, at `(+0.045, +0.098, ±0.052)`,
  ellipse **0.030 (X) × 0.019 (Y)**, in `TAN_POINT`. They sit **directly on the corrugator ridge**,
  so when the brow raises 0.012 m the pip translates with it — a **0.9 px** move at 128 px, which is
  nothing, but a very legible move at 1 m. They are an *expression amplifier*, not decoration.
  Permitted by the standard: *"black, blue or tan markings on the head"* (§10 ref 1).
  **Keep them small.** Oversized pips read as a rottweiler/dobermann, which is a different animal.
- On the masked side, the pip is **absorbed into the mask** — it disappears. That asymmetry is free
  and it makes the brow motion read differently on the two sides, which is very good for the angry
  pose (§8.1).

### 3.4 Eyes

*"Oval shape and medium size, neither prominent nor sunken… dark brown… expressing alertness and
intelligence"*, and — the useful bit — *"a warning or suspicious glint"* toward strangers (§10 refs
1, 5). We build alert, not big-and-cute. The cuteness in this roster belongs to `dogey.js`.

| Parameter | value | as a ratio |
|---|---|---|
| Eye aperture width (corner to corner) | **0.070 m** | **0.341 × W_s** |
| Eye aperture height (max) | **0.044 m** | 1.59 : 1 oval |
| Aperture centre, head-local | `(+0.045, +0.068, ±0.066)` | medial corner lands at x **+0.080**, i.e. **0.003 behind the stop (+0.077)** — that is the rule; an eye sitting forward of the stop is an eye on the muzzle, and it is the fastest way to turn a dog into a lizard |
| Aperture corners, head-local | medial `(+0.080, +0.063, ±0.052)`, lateral `(+0.010, +0.073, ±0.080)` | the +8° cant, expressed |
| Eye centre line, world y | 1.468 | **0.708 × H_h above the underjaw low point**; 0.292 H_h below the crown |
| Interocular distance (centre to centre) | **0.132 m** | **0.644 × W_s** |
| Eyeball radius | **0.036 m** | globe Ø 0.072 = 1.03 × aperture width |
| Iris disc diameter | **0.031 m** | 0.43 × globe Ø |
| Pupil diameter, neutral | **0.013 m** | 0.42 × iris; 0.008 angry, 0.018 hurt/KO |
| Long-axis cant (outer corner up) | **+8°** | |
| Optical-axis divergence from straight ahead | **14° each** | forward-set predator eye with a dog's slight lateral bias |
| Globe protrusion past the orbital rim | **0.006 m** | "neither prominent nor sunken" |

**Lids — geometry, never a painted quad (`GRAPHICS_CONTRACT.md` §9).**
- Upper lid: a solid shell of thickness **0.006 m** sweeping on the globe, its free margin a
  0.004 m rounded roll. At idle it covers the **top 20% of the iris** — enough to sit on the iris
  (alert, engaged) but nowhere near the ape's half-lidded 40%+.
- Lower lid: thinner (0.004 m), tangent to the bottom of the iris. **No scleral show below the iris**
  at idle — visible sclera under the iris reads as fear or whale-eye and destroys the alertness.
- **Sclera slivers** at the inner and outer corners only: **0.005 m** wide at the outer, **0.004 m**
  at the inner. That sliver is the entire budget for eye darts (§8.1); it is what lets the eye look
  sideways without moving the head.
- Inner corner: a **modelled caruncle**, a 0.006 m pink-grey bead at `(+0.082, +0.061, ±0.048)`.
  Tiny, but it is the difference between an eye and a marble.
- **Third eyelid / haw**: do not build. It only reads as an error.
- Eye rims: a **0.003 m** band of `NOSE_BLACK` all the way round both apertures, on **both** sides
  (the clear-faced side keeps its dark rims — that is anatomically true and it stops the unmasked
  eye from vanishing into the pale cheek).

**Specular.** One crisp cornea highlight per eye, from the key. On the masked side, add a second,
dimmer bounce dot at the 7-o'clock position so the eye does not disappear into the black patch —
this is the only place in the model where you may cheat a highlight. §6 gives the material.

### 3.5 Muzzle

*"Medium length, deep, powerful… broad and well filled in under the eyes."* That last clause is the
one that gets ignored; a muzzle that pinches in below the eye is the classic amateur dog head.

- Length **0.128 m** (43% of head length, §3.0), from the stop at x +0.077 to the leather tip at
  x +0.205.
- Cross-section is a **rounded rectangle**, not a cone: width **0.098 m at the base**, tapering only
  to **0.070 m at the nose** — a taper of just **29%** over its length. Depth (Y): **0.096 m at the
  base**, **0.072 m at the nose**.
- **Which pins the ventral (lip) line, so build it from these, not by eye.** Bridge +0.074 at the
  base → ventral **−0.022** at x +0.077. Bridge +0.037 at the tip → ventral **−0.035** at x +0.205
  (world 1.365, the chin point). The upper-lip line therefore runs **downward toward the front at
  5.8°** — the opposite of what most builders assume, and it is a direct consequence of the muzzle
  being deeper at the base than at the tip.
- **The fill-in.** At the base, the muzzle's top corners must meet the skull at the eye's lower rim
  with a **convex** fillet of radius 0.014 m. If there is a concave pinch there, add mass until there
  is not.
- Bridge: the flat parallel plane from §3.2, with a barely-there central ridge **0.003 m** proud
  running from stop to nose — enough to split the highlight, not enough to read as a keel.
- **Whisker beds**: four rows of 5 follicle dimples each side, dimple Ø 0.004 m, depth 0.0015 m,
  on the muzzle's lateral face between x +0.110 and +0.175. Do not model whiskers as geometry — they
  fringe horribly against a rim light. Dimples plus a normal-map response only.
- **Underjaw** — *"strong, deep, well developed"*, and on this character deliberately deeper than the
  breed (§3.0's depth budget, §9 D3). Its ventral border runs from the **chin point**
  `(+0.190, −0.035)` back and **down** to the **jaw-angle low point** `(+0.010, −0.155)` — a
  **33.7°** down-and-back slope in head-local terms, which against the head's 16° pitch is **17.7°**
  of genuine deepening along the muzzle axis. The band spans **−0.035 → −0.155 = 0.120 m** of
  head-local Y (§3.0's depth budget). Measured *perpendicular to the muzzle axis*, the jaw is
  **0.000 m deep at the chin point, 0.085 m at the muzzle base (x +0.077), 0.135 m at the jaw angle
  (x +0.010)**, then it blends into the throat behind x 0.000. A jaw that *tapers* toward the back is
  the second classic dog-head error; this one thickens, and that thickening is 38% of the whole head
  silhouette.

### 3.6 Nose

- **Planum** (the leather): **0.048 m wide (0.234 W_s) × 0.032 m tall**, projecting **0.013 m**
  forward of the muzzle's front plane and rising **0.008 m** above the bridge line — the leather is
  a *cap* on the end of the muzzle, not a ball stuck to it. The bridge arrives at head-local
  **+0.037** (§3.2), so the planum's top edge is **+0.045** and its centre **+0.029**, world
  **1.429** — which is the §2.1 row. Do not place it by eye; it is the end of a chain that starts at
  the 16° skull plane.
- Its **top surface is a distinct plane at 32° below horizontal**; its front surface is near-vertical.
  The edge between them is a **0.004 m bevel**. That hard little bevel is what makes a nose read as
  leather rather than as a sphere.
- **Nostrils**: comma-shaped slits, aperture length **0.016 m**, opening **laterally** (the comma's
  tail sweeps outward and back), with a **0.006 m wide alar groove** running down-and-back from each
  to the lip. Real depth: **0.008 m**, dark inside, with one small wet glint (§6).
- **Philtrum**: a vertical groove **0.004 m wide × 0.006 m deep × 0.022 m long** from the base of the
  leather down to the notch in the upper lip.
- Colour is **`NOSE_BLACK` regardless of coat colour** (breed standard: black nose on blue *and* red
  dogs). Do not tint it to the coat.

### 3.7 Mouth

- **Lip line** runs from the notch under the nose at `(+0.196, −0.034, 0)` back and *very slightly
  up* to the commissure at `(+0.045, −0.017, ±0.052)` — up, not down, because the muzzle is deeper at
  its base than at its tip (§3.5). Total corner-to-corner width across the muzzle:
  **0.104 m (0.507 W_s)**. Arc length from midline to corner: **0.115 m**.
- The commissure sits at world y **1.383**, i.e. **0.438 H_h above the underjaw low point** and
  **directly below the eye centre** (both at x +0.045) — not out at the cheek, and not forward under
  the nose.
- **Corner direction: +6° UP at idle.** This is a hard requirement and it is the opposite of
  `tired-ape.js`. A down-turned mouth on this character reads as a guard dog; up-turned reads as a
  dog that is *enjoying* the fight, which is the joke.
- Build the lip as a **modelled groove 0.004 m deep** with a **0.006 m dark band** (`NOSE_BLACK`)
  along it. The upper lip carries a small **flew fold that hangs 0.005 m below the lower lip line at
  the commissure only** — cattle dogs are tight-lipped ("free from throatiness"), so the flew must be
  minimal. **No jowls, anywhere.** (See §8.2: do not jiggle them either.)
- **Default state: open, panting.** Jaw drop **0.038 m** at the front. Inside: a `NOSE_BLACK` mouth
  bag, an upper and lower gum ridge in a desaturated pink, and **four canines only** — upper pair
  0.014 m long, lower pair 0.011 m, `BONE` white. **Do not build a full tooth rack.** A dog showing
  a complete set of incisors reads as a skull.
- **The tongue is the asymmetry payoff.** It hangs out of the **left** commissure (the masked side),
  same side as the mask, so all the facial asymmetry stacks on one side and reads as one decision.
  Slab **0.030 (Z) × 0.062 (X, hanging) × 0.012 (thick)**, angled **−38°** from horizontal, with a
  shallow central groove 0.002 m deep and a rounded tip radius 0.012 m. It is a secondary-motion
  object (§8.2).

### 3.8 Ears

The single highest-value 30 minutes of work on this model. Standard: *"moderate size, preferably
small rather than large, broad at the base, muscular, pricked and moderately pointed… set wide apart
on the skull, inclining outwards… thick in texture… fairly well furnished with hair"* (§10 ref 1).

| Parameter | value | ratio |
|---|---|---|
| Base width (Z) | **0.086 m** | **0.42 × W_s** |
| Base depth (X) | 0.062 m | |
| Tip width (Z), before blunting | **0.020 m** | trapezoid top |
| Length along the ear's own axis | **0.182 m** | **0.578 × H_h** |
| Leather thickness | **0.012 m** | a real solid — never a plane |
| Tip radius (blunting) | **0.010 m** | "moderately pointed", NOT needle |
| Base centre, head-local | `(−0.052, +0.130, ±0.078)` | world y **1.530** |
| Tip centre, head-local | `(−0.020, +0.300, ±0.135)` | world y **1.700** — the silhouette top |
| Tip span, outer edge to outer edge | **0.290 m** | 1.41 × W_s |
| Outward cant (rotation about X) | **18.5°** | "inclining outwards" |
| Forward pitch (rotation about Z) | **10°** | |
| Concha turned outward (rotation about Y) | **26°** | |

**These five numbers are one closed system — check them, do not retype them.** Rise
`0.182 · cos10° · cos18.5° = 0.170` → base 1.530 + 0.170 = **tip 1.700** ✓. Lateral
`0.182 · cos10° · sin18.5° = 0.057` → base z 0.078 + 0.057 = **tip centre 0.135** ✓, and with the
0.010 tip half-width that is the **0.290 outer span** ✓. Forward `0.182 · sin10° = 0.032` → tip x
−0.052 + 0.032 = **−0.020** ✓ (§2.3's wedge apex). If you change the cant, the ear no longer reaches
1.700 and the character is no longer 1.700 m tall in silhouette.

Construction, in order:
1. **The solid.** An extruded isoceles trapezoid — base 0.086, top 0.020, height 0.182 — swept along
   a **slight forward-convex arc (sagitta 0.008 m)**. It is not flat and it is not a cone. Bevel
   every edge at 0.004 m.
2. **The concha.** Scoop the front face to a **0.012 m deep** dish, with a raised **antihelix ridge
   0.005 m proud** running up the outer margin from the base to two-thirds height. The dish is
   `CREAM`/`CREAM_SHADE`; the back is speckled coat over a solid `MASK_BLACK` on the outer third
   (a dark ear back is breed-typical and it makes the ear read as a hard shape against the sky).
3. **The furnish.** *"Fairly well furnished with hair"* — a fringe of **0.018 m** hair tufts along
   the front-lower margin only, modelled as 5–7 bevelled wedges per ear. **Geometry, not alpha
   cards** (contract §9 detail rules; alpha cards fringe against the rim light).
4. **The base collar.** Where the leather meets the skull, a **0.010 m** raised muscular collar all
   the way round — no gap, no seam (contract: "no gaps… overlap or sleeve every joint"). This collar
   is also what sells the ear as *muscular* and steerable.
5. **Bake the cant, pitch and concha rotations into a `bent()` wrapper**, exactly as the current file
   does for the tail, so the `earL` and `earR` **bones** stay at rotation `(0,0,0)`. Every
   `earL`/`earR` track in all 31 clips is a rotation track applied to the bone, so any rotation you
   bake into the bone itself is added to every clip.

**Two failure modes to check for explicitly:** (a) a tip sharper than 0.010 m radius → shepherd;
(b) base centres closer than z ±0.070 → corgi. Both are instant loss of the read. And note the ear
bases are moving from the file's current `[-0.03, 0.20, ±0.10]` (world y 1.600) — see the header
table; a 0.100 m ear cannot carry this silhouette.

### 3.9 The mask — the identity shape, given as a polygon

The half mask goes on the **dog's left, `+Z`**. Definition from the literature: *pigmentation
surrounding the eye and extending laterally over the temporal region* (§10 ref 4).

Given as a closed outline on the head surface, in head-local `(x, y)`, spanning `z ≈ +0.030…+0.103`
(project it onto the skull surface; do not build it as a floating decal plane — it is an albedo zone
in the coat map, §6.3). **Every vertex below sits on or under the skull/bridge surface derived in
§3.0 — that surface height is given in the third column so you can check the projection instead of
trusting it:**

| vertex `(x, y)` | what it is | surface y at that x |
|---|---|---|
| `(+0.104, +0.040)` | front-lower — on the cheek, just behind the muzzle's lateral wall | bridge +0.066 |
| `(+0.112, +0.062)` | front-upper — a point aimed at the stop (+0.077, +0.074) | bridge +0.064 |
| `(+0.086, +0.092)` | over the medial brow, engulfing that side's tan pip | plane +0.096 |
| `(+0.030, +0.104)` | crossing the temple, top edge 0.008 under the crown line | plane +0.112 |
| `(−0.036, +0.104)` | sweeping back toward the ear base | plane +0.131 |
| `(−0.058, +0.076)` | reaching the ear-base collar (merges with the dark ear back) | plane +0.137 |
| `(−0.040, +0.028)` | dropping down the rear cheek | — (lateral wall) |
| `(+0.010, +0.004)` | the lower margin, riding the zygomatic arch | — (lateral wall) |
| `(+0.072, +0.018)` | under the eye | — (lateral wall) |
| *close* | | |

**Engulfment check, which is the only thing that matters here.** The eye aperture spans
x +0.010…+0.080 and y +0.046…+0.090 (§3.4). The mask's boundary clears it by **0.011 m at the top**
(x +0.045: mask +0.1008 vs lid top +0.090) and **0.034 m at the bottom** (mask +0.0119 vs lid bottom
+0.046). If either clearance goes negative the eye breaks the mask edge and the whole shape reads as
a smudge.

Rules that make it read:
- **Hard edge, no gradient.** Real masks are a pigment boundary. A soft-edged mask reads as dirt.
  Permit at most **0.006 m** of ragged hair-tip break-up along the boundary — and that break-up must
  be *hair-shaped* (small triangular incursions), not blurred.
- **It engulfs the eye completely**, including the rims and the brow pip, reaching **0.064 m below**
  the aperture centre (lowest vertex +0.004) and **0.036 m above** it (highest vertex +0.104).
- **The other side is genuinely clear** — speckled cheek right up to the eye rim, tan pip intact.
- Against `COAT_BLUE` (Y 0.242) the mask (`MASK_BLACK`, Y 0.019) is a **12.7 : 1** step. That is the
  strongest local contrast on the head and it is why the face survives to 64 px.
- **The Bentley mark.** *"Virtually all Australian Cattle Dogs have a white marking on the forehead
  of varying shape and size"* (§10 ref 2). Ours: a `CREAM` blaze on the midline at
  `(+0.040, +0.104, 0)` — 0.005 under the crown line at that x — **0.020 (Z) × 0.046 (X)**, a
  soft-cornered lozenge. Its 0.020 width keeps it clear of the mask's medial edge (z +0.030) by
  0.020 m. It sits **between** the
  mask and the clear side and it is what stops the forehead reading as an unresolved smear. Small,
  bright, dead centre — a free composition anchor.

### 3.10 Head carriage & angles — bake these into the bind pose

| Axis | value | why |
|---|---|---|
| Skull top plane (and, parallel to it, the muzzle bridge) | **16° nose-down** | alert-forward, muzzle hunting (§3.0 master pitch) |
| Neck axis from horizontal | **38°** (idle), **12°** (sprint) | "head carried at shoulder level while working" (§10 ref 8) |
| Nose tip forward of the shoulder-pivot line | **+0.185 m in X** (0.305 vs 0.120) | the forward-thrust read (§2.4.2) |
| Eye line forward of the shoulder-pivot line | **+0.025 m in X** (0.145 vs 0.120) | the head is thrust, not just the muzzle |
| Underjaw low point relative to the withers | **−0.077 m** (1.245 vs 1.322) | head *below* shoulder top |
| Head roll (idle) | **0°** | the 22° cock is a *pose*, not the bind (§8.1) |
| Head yaw (idle) | **0°** | asymmetry comes from the mask, not from a crooked bind pose |

The bind pose must be symmetric in *rotation* and asymmetric only in *marking and props*. If you
bake a head tilt into the bind, every one of the 31 clips inherits it and the taunt stops reading.

---

## 4. Body & limb proportions

### 4.1 Torso

The chest is the engine; the waist is the proof. Standard: *"chest deep, muscular and moderately
broad"*, *"ribs well sprung… not barrel ribbed"*, *"topline level"*, *"loins broad, strong and
muscular… flanks deep"* (§10 ref 1).

| Measure | value (m) | note |
|---|---|---|
| Withers, world y | 1.322 | top of the scapula |
| Chest width (Z), widest | 0.320 | at the 5th-rib line, world y ≈ 1.080 |
| Chest depth (X), brisket front to rib rear | 0.400 | |
| Brisket bottom, world y | 0.985 | **0.045 m below the elbow** — a deep chest drops past the elbow |
| Waist width (Z) | 0.235 | **0.73 × chest width** |
| Waist depth (X) | 0.290 | |
| Rib-cage cross-section | ellipse **1.25 : 1** (depth 0.400 : width 0.320) | "well sprung, not barrel" — 1.00 is barrel, 1.6 is a slab. This is the quotient of the two rows above it; do not state a ratio that its own numerators contradict. |
| Croup slope | **26°** from horizontal | "croup rather long and sloping" |
| Topline, withers → croup top | 1.322 → 0.858 | *level in the quadruped read*; as a biped it becomes the back's forward pitch |
| Torso forward lean (idle) | **14°** | |

Build the ribcage as **one bevelled ellipsoid** `0.400 (X) × 0.340 (Y) × 0.320 (Z)` centred at
`(0.010, 1.090, 0)` in world — which puts its front tangent at x **+0.210** and its rear at
**−0.190**, so the chest apex (+0.200) and the rib rear (−0.200) both land on it once the coat is
on. (Centre it at 0.03, as an earlier pass of this brief did, and the rear surface retreats to
−0.170 and the satchel in §7.1 no longer touches the back.) Then subtract the tuck-up with a second, smaller ellipsoid so the
underline is a genuine continuous curve rather than two spheres. **Do not build the torso as the
current file does** — a 0.30-radius sphere plus a cream sphere poking out of it — the intersection
seam is visible from every angle and it violates the no-gaps rule.

**Trapezius / neck root.** From the withers the trapezius slopes forward-down at **34°** into the
neck. The neck itself is a **frustum, 0.150 m diameter at the skull base → 0.185 m at the shoulders**,
with a modelled **crest** along the top (0.010 m proud). It is thick — *"extremely strong, muscular
and of medium length"* — but it must remain **free from throatiness**: the underside of the neck is
a taut straight line from the chin to the manubrium, with no dewlap and no hanging fold. That taut
underline is what preserves the jaw–chest wedge (§2.5).

**Shoulder blade.** Model the scapular spine as a **0.010 m ridge** running from the withers
down-forward at 52° to the point of shoulder at `(0.06, 1.230, ±0.130)`. It is the landmark that
makes the shoulder read as a shoulder when the arm lifts, and it is what the satchel strap crosses.

### 4.2 Arms

The current file sets the shoulder pivots at `z = ±0.28` — a **0.56 m** shoulder span on a 1.70 m
figure (0.33 H). That is heavyweight geometry on the lightest fighter in the roster and it is the
worst single proportion in the file. Corrected:

| Measure | value | ratio |
|---|---|---|
| Shoulder pivot (`armL/R`) | `[0.02, 0.38, ±0.155]` on `torso` | world (0.12, 1.260, ±0.155) |
| Shoulder width, outside deltoid to outside deltoid | **0.396 m** | **0.233 H** |
| Upper arm length (shoulder → elbow) | **0.230 m** | 0.135 H |
| Forearm length (elbow → wrist) | **0.200 m** | 0.118 H |
| Paw length (wrist → toe tips) | **0.085 m** | |
| Total arm, shoulder → paw tip | **0.515 m** | **0.303 H** |
| Upper-arm : forearm | **1.15 : 1** | slightly upper-arm dominant — punchy, not gangly |
| Arm : leg (shoulder→paw vs hip→ground) | **0.515 : 0.760 = 0.68** | the ape is >1.0; BONKO is a runner |
| Deltoid diameter | 0.088 → 0.066 at the elbow | |
| Forearm diameter | 0.062 → 0.052 at the wrist | with a slight ulnar flare at the elbow |
| Idle elbow flare from the ribcage | **0.055 m** minimum | §2.5 |

The **forelegs carry the tan** — *"tan midway up the legs and extending up the front to breast and
throat"* (§10 ref 1). So: the upper arm is speckled coat; from **mid-forearm down** (world y < 0.930)
the front and inner surfaces are `TAN_POINT`, wrapping onto the paw. The boundary is a **hard,
slightly ragged line**, not a fade.

### 4.3 Paws / hands

A fighting-game character needs a fist. A dog needs a paw. Build the reconciliation:

- **Metacarpal block**: `0.072 (X) × 0.062 (Y) × 0.058 (Z)`, bevel 0.008, so the closed paw is a
  slightly wedge-shaped mitten with a flat striking front.
- **Three digit grooves** on the front face, each 0.004 m deep, 0.006 m wide, splitting the front
  into 4 toes. Four toes, not five — it is a dog.
- **Dewclaw thumb**: a separate 0.026 m pad on the medial side at the wrist, with a small blunt claw.
  It is what stops the paw reading as an oven mitt.
- **Pads**: one metacarpal pad `0.036 × 0.030` plus four digital pads Ø 0.017, all in `NOSE_BLACK`,
  material `rubber` (§6). Only visible in open-hand poses and on the KO/ragdoll — but build them,
  they are 300 triangles and they are the first thing anyone looks for in a screenshot.
- **Claws**: 0.014 m, blunt, `horn` material, protruding only when the paw is open.
- **Wrist**: sleeve the joint with a 0.014 m overlap of forearm fur over the paw. No gap.

### 4.4 Legs, feet, stance — the digitigrade zigzag

This is the second-biggest geometry upgrade after the head. The current file builds a straight
cylinder with a shoe box on the end; a dog's hindleg zigzags, and the zigzag is a silhouette event
(§2.4.5). The rig gives us only `leg` → `shin`, so the tibia **and** the metatarsus are baked into
the `shin` subtree as a rigid bent form. That is fine: dogs do not flex the hock independently of the
stifle by much, and the existing `crouch` clip's `shin = −1.5 rad` still reads correctly.

| Segment | from → to (world y) | length | X displacement |
|---|---|---|---|
| Femur | hip 0.760 → stifle 0.400 | 0.360 | stifle **+0.055 forward** of the hip |
| Tibia (in `shin`) | stifle 0.400 → hock 0.185 | 0.215 | hock **0.070 back** of the stifle (x −0.015) |
| Metatarsus (in `shin`) | hock 0.185 → ball 0.030 | 0.155 | ball **+0.085 forward** of the hock |
| Sole | ball 0.030 → ground 0 | 0.030 | |

- **Thigh**: *"long, broad and well developed"*. Diameter **0.115 m at the top → 0.078 m at the
  stifle**, with a modelled quadriceps bulge on the front and a **breeching** — the standard notes
  longer hair forming *"a mild form of breeching"* on the back of the thighs (§10 ref 1). Build the
  breeching as a **0.022 m** fur skirt on the caudal thigh: it softens the rear silhouette and it is
  a real breed trait.
- **Second thigh / gaskin**: **0.086 m → 0.042 m at the hock**. *"Hocks strong and well let down"* —
  the hock sits at **0.109 H**, low. A high hock reads as a cat.
- **Stifle angle at idle: 128°** (never straight). Hock angle: **142°**.
- **Feet**: digitigrade inside a courier sneaker. Sneaker sole **0.185 (X) × 0.082 (Z)**, stack
  height **0.018 m at the rear cuff rising to 0.030 m under the ball** — the 0.030 is not a taste
  call, it is the number that fills hock 0.185 − metatarsus 0.155 = ball 0.030 down to the ground
  (§2.1 gate). **12° toe spring**. The heel of the shoe
  is *empty* — the dog's heel is the hock, 0.185 m up — so the shoe's rear is a **short cuff, not a
  heel counter**. Getting this wrong (a full human shoe) is what makes anthro dogs look like people
  in costume.
- **Stance**: foot centres at `z = ±0.135` → **outer stance 0.352 m** (0.207 H) with the 0.082 sole;
  **lead foot 0.075 m forward, rear foot 0.075 m back**,
  rear heel/cuff lifted **0.020 m** so he is on the ball of the rear foot. Toes of the lead foot
  turned out 8°.

### 4.5 Tail

`tail` bone at world `(−0.22, 0.860, 0)`. *"Set on moderately low, following the contours of the
sloping croup… approximately to the hock… carrying a good brush"*, and in motion *"may be raised, but
no part… should pass a vertical line drawn through the root"* (§10 ref 1).

- **Length 0.420 m.** Hanging from the root at 0.860 it reaches world y ≈ **0.440** — which is *not*
  the biped's hock (0.185), and no amount of croup slope or natural curve will get it there. **The
  standard's "approximately to the hock" is a quadruped measurement and it does not transfer to a
  biped; do not try to satisfy it literally.** Check it in the quadruped read instead: at a
  quadruped-read withers height of 0.504 m (§2.2) a cattle dog's tail root sits ≈ 0.45 above ground
  and its hock ≈ 0.14, i.e. root-to-hock ≈ **0.31 m**. Our 0.420 is **1.35 × that** — deliberately
  long, because the white tip is the character's motion read (§1) and a longer arc carries further.
  Log it as a knowing deviation (§9 D3), not as an error. Build it in **3 visual segments** with a
  slight S so it does not read as a stick.
- **Cross-section is a teardrop, deeper below**: 0.048 m thick at the root → 0.026 m at the tip on
  the *top* surface, but the **underside carries 0.030 m of extra hair** (the brush). The tail's
  silhouette is therefore asymmetric, heavier below — that is what "a good brush" looks like and it
  is a strong, cheap read.
- **Solid dark patch at the root** (0.070 m long) — a documented breed marking (*"black markings on
  the head… and tail are completely normal"*, §10 ref 2), and it anchors the tail visually to the
  croup.
- **White tip.** *"Ringed tails (colloquially 'racoon tails') or other white on the tail are seen in
  both red speckle and blue dogs. This is a breed characteristic."* (§10 ref 2.) Ours: the terminal
  **0.035 m** is `CREAM`, preceded by a **0.014 m** ring of `MASK_BLACK`. Bright dot, dark collar,
  dark tail — maximum legibility on a fast-moving object. **This is the motion read of the whole
  character** (§1, §2.4.6).
- Carriage: **+18° above the croup line at idle**, swinging to +55° on wins and −15° on `lose`/`hurt`.
  Never past vertical.

### 4.6 Posture in one sentence

**Weight on the balls of both feet with the rear heel lifted, hips tipped 6° forward, torso pitched
14°, the neck running forward-down at 38° so the chin sits 0.077 m below the withers with the muzzle
spearing 0.105 m past the chest, stifles bent to 128°, elbows out, paws loosely closed at hip height,
ears up and forward, tail up and never still.** He is a sprinter in the set position who has been
told to wait, and he is not enjoying the waiting.

Two posture rules that override anything else:
1. **Head forward beats head high.** If the two fight, sacrifice height. That is why `head.x` moves
   from 0.04 to 0.10.
2. **The neck ruff stays short.** ACD is a smooth double coat (2.5–4 cm body hair — §10 ref 1), not a
   ruffed mountain dog. A ruff fills the jaw–chest wedge (§2.5) and hands the silhouette to
   `shibro.js`.

---

## 5. Colour script

Named constants to replace the `C = {…}` block. Every value obeys `GRAPHICS_CONTRACT.md` §0:
**every channel of every albedo is ≥ 30 and ≤ 240 sRGB** — assert it, it is one line and it is how
you find out that someone dropped a `0x000000` into the eye.

"Rel. luminance" is CIE **Y** from linearised sRGB (`0.2126 R + 0.7152 G + 0.0722 B`). These are
computed, not guessed; the whole speckle system in §6 depends on them being right.

### 5.1 Core palette

| Name | Hex | Y | Use |
|---|---|---|---|
| `COAT_GROUND` | `#C9CFD6` | **0.616** | The **white ground hair** of the coat. Cool near-white. Only ever appears as speckle in the coat map — **never as a flat area larger than 0.05 m**. |
| `COAT_SPECK` | `#2E3540` | **0.035** | The **dark hair** intermingled through the ground. The other half of the mottle. |
| `COAT_BLUE` | `#7E8894` | **0.242** | The **resolved body colour** = the mip average of ground + speckle at 64.4% dark coverage. Also the flat base colour under the map, and the `low`-tier fallback. **Derived, not chosen — see 5.3.** |
| `MASK_BLACK` | `#23262C` | **0.019** | Solid, unspeckled zones: the eye mask, the outer ear backs, the tail-root patch, the tail ring. The darkest coat value. |
| `CREAM` | `#EDE3D0` | **0.775** | Throat/chest blaze, muzzle underside, inner ear, Bentley mark, tail tip, sock tops. **The lightest large area — the identity's counterweight.** |
| `CREAM_SHADE` | `#B9AC94` | **0.420** | Cream in occlusion: under the jaw, inside the ear dish, under the strap, the roots of the chest blaze. |
| `TAN_POINT` | `#C89760` | **0.353** | Tan points: forelegs front/inner from mid-forearm down, jaws and cheeks, inner thighs, front of stifles, hock-to-toe outer, brow pips. **Hue 32°, HSL saturation 0.49** — deliberately held under 0.55 so it passes the anti-brand-colour assertion in §9.2 outright rather than "narrowly". An earlier pass used `#D2924F` (sat 0.59), which *failed* that assertion. |
| `TAN_DEEP` | `#8E5A2C` | **0.133** | Tan in shadow, tan-zone hair roots, **and the ticking colour on tan areas** (§6.3 — tan zones tick tan, not black). |
| `SATCHEL_DARK` | `#3D4149` | **0.053** | Courier satchel body and flap, cap brim, webbing. |
| `HI_VIS` | `#D9E64B` | **0.718** | Reflective piping, ankle band, flap edge strip, strap keeper. **The only high-chroma bright on the model.** |

### 5.2 Supporting values

| Name | Hex | Y | Use |
|---|---|---|---|
| `NOSE_BLACK` | `#24242A` | 0.018 | Nose leather, lip line, eye rims, paw pads. Darkest albedo on the model — still ≥30 per channel (36, 36, 42). |
| `SIGNAL_RED` | `#E2553F` | 0.230 | **Cap centre panel only.** Small area, pure chroma cue at the top of the figure. |
| `SCLERA` | `#E4DFD2` | 0.739 | Eye white — never `#FFFFFF`. |
| `IRIS_BROWN` | `#4A2E20` | 0.035 | Iris. *"Dark brown"* (§10 ref 1). Blue channel is **32**, not the 24 an earlier pass used — 24 breaks the contract's ≥30 floor (`GRAPHICS_CONTRACT.md` §0) and the assert in §11.6 would have caught it. |
| `PUPIL` | `#221F22` | 0.014 | Pupil. Channels 34/31/34 — the tightest pass in the palette. |
| `TOOTH` | `#EFE9DB` | 0.817 | The four canines. Lightest thing on the model. |
| `TONGUE` | `#D4707F` | 0.271 | Tongue and inner gums. Desaturated — a hot pink tongue reads as a toy. |
| `METAL` | `#B8BCC2` | 0.500 | Buckles, D-rings, cam locks. `metalness 1.0`. |
| `RIM_REQUEST` | `#FFB25E` | — | **Not an albedo and not ours to set.** See 5.5. |
| `LED_CYAN` | `#5FE8FF` | — | Costume 1 only. **Emissive only** — the 30–240 rule does not apply. |

### 5.3 The derived value — how `COAT_BLUE` is computed

This is the arithmetic that makes the coat work, and it is not optional.

```
Y(COAT_GROUND) = 0.616      Y(COAT_SPECK) = 0.035
target body value           Y_target = 0.242
dark coverage fraction  d = (Y_ground − Y_target) / (Y_ground − Y_speck)
                          = (0.616 − 0.242) / (0.616 − 0.035)
                          = 0.374 / 0.581
                          = 0.644
```

**So the body coat map must be 64.4% `COAT_SPECK` by area and 35.6% `COAT_GROUND`.** Then its
top mip averages to `COAT_BLUE`, and the character does not change value as the camera dollies out.
`COAT_BLUE` is the *consequence* of that coverage, not an independent choice.

If you change any of the three hexes, **recompute `d`**. If you change `d`, recompute `COAT_BLUE`.
§11.3 is the test.

### 5.4 The value ladder

| # | Constant | Y | Area |
|---|---|---|---|
| 1 | `TOOTH` | 0.817 | tiny, pose-only |
| 2 | **`CREAM`** | **0.775** | **large — chest blaze, throat, tail tip** |
| 3 | `SCLERA` | 0.739 | tiny |
| 4 | `HI_VIS` | 0.718 | small, high chroma |
| 5 | `COAT_GROUND` | 0.616 | **never a flat area** — speckle only |
| 6 | `METAL` | 0.500 | tiny |
| 7 | `CREAM_SHADE` | 0.420 | medium (occluded cream) |
| 8 | `TAN_POINT` | 0.353 | medium — legs, jaws |
| 9 | `TONGUE` | 0.271 | small, pose-driven |
| 10 | **`COAT_BLUE`** | **0.242** | **largest area on the model** |
| 11 | `SIGNAL_RED` | 0.230 | tiny (cap panel) |
| 12 | `TAN_DEEP` | 0.133 | crevices, tan roots |
| 13 | `SATCHEL_DARK` | 0.053 | medium — the diagonal band |
| 14 | `COAT_SPECK` | 0.035 | speckle only |
| 15 | `IRIS_BROWN` | 0.035 | tiny |
| 16 | **`MASK_BLACK`** | **0.019** | **small but it is read cue #2** |
| 17 | `NOSE_BLACK` | 0.018 | small |
| 18 | `PUPIL` | 0.014 | tiny |

### 5.5 Value relationships (the part that matters)

- **`CREAM` (0.775) vs `COAT_BLUE` (0.242) = 3.2 : 1.** The two largest areas. That step is what
  carries the body at 128 px — the pale chest/throat/underside against the mid-grey back.
- **`MASK_BLACK` (0.019) vs `COAT_BLUE` (0.242) = 12.7 : 1.** The strongest local step on the model,
  and it is on the face, which is where you want it.
- **`SATCHEL_DARK` (0.053) vs `COAT_BLUE` (0.242) = 4.6 : 1**, and **vs `CREAM` = 14.6 : 1.** The
  strap crosses the cream chest, so the diagonal reads at maximum contrast exactly where it matters.
  **This is why the strap is a value event at 128 px even though it is only 0.055 m (4.1 px) wide.**
- **`HI_VIS` (0.718) vs `SATCHEL_DARK` (0.053) = 13.5 : 1.** The piping punches out of the bag. It is
  a 1 m cue, not a 128 px one — a 0.012 m strip is 0.9 px.
- **`TAN_POINT` (0.353) vs `COAT_BLUE` (0.242) = 1.46 : 1 only.** Deliberate and correct: the tan
  points are a **hue** cue, not a value cue. They separate on chroma against a low-chroma body and
  they must NOT compete with the cream for the value read. **Acceptance test: desaturate a 128 px
  render — the tan legs should nearly vanish into the body while the cream chest, the black mask, the
  dark satchel band and the white tail tip all survive.** If the tan is still shouting in greyscale,
  it is too light and it is stealing the chest's job.
- **The whole coat is low-chroma cool** (`COAT_BLUE` hue 213°, HSL saturation 9%). Every accent on
  the model is warm (`TAN_POINT` 32°, `SIGNAL_RED` 8°, `HI_VIS` 65°). One cool mass, warm punctuation.
- **Full range:** `PUPIL` 0.014 → `TOOTH` 0.817 = **58 : 1**.

### 5.6 Rim separation — what this agent may and may not do

**We do not own the light rig.** `src/render/lighting.js` is the foundation agent's and
`src/arenas/<id>.js` is each arena agent's (`GRAPHICS_CONTRACT.md` §1: *never edit a file you do not
own*). So:

- **Do (in `bonko.js`, ours):** tint the coat's `sheen` with `COAT_GROUND` and give the coat, the
  cream and the ear leather a **fresnel grazing lift** via the contract's `gradientRamp()` LUT. That
  is a material-side rim response and it works under *any* arena light. Build it — do not skip it
  because one test arena's rim happens to look fine.
- **Request (report it, do not implement it):** `rimColor #FFB25E` at `rimIntensity 1.5`, ≈120° off
  the key in azimuth and 30° above. Rationale to pass on: BONKO is a **low-chroma cool blue-grey**
  mass (hue 213°, sat 10%). A cool rim disappears into him. A **warm amber** rim is complementary,
  it separates him in the cold arenas (`frozenTokenLab`, `settlementExpress`, `calmBeforeLiquidation`)
  where he would otherwise merge, and it ties visually to the tan points so it reads as *his* light
  rather than as a stuck-on outline. In the warm arenas (`bullMarketColosseum`, `memeMarket`) he is
  the coolest thing in frame and separates on hue regardless.
- **The amber-rim / anti-amber-brand tension, addressed rather than ignored.** §9.4 removes
  amber/orange from the *model*. Requesting a warm amber **rim light** is not a re-introduction of it:
  a rim is a property of the arena's light rig, it lands on every fighter in that arena, it is not an
  albedo, and it never appears as a shape or a mark. But keep the boundary sharp — **no amber may
  reach any albedo, decal, emissive or costume value on this character**, and if an arena agent ever
  proposes an amber *key* (which would tint his whole body toward the brand colour rather than
  outlining it), refuse it and ask for the rim only. `RIM_REQUEST` is deliberately listed in §5.2 as
  "not an albedo and not ours to set" so this stays visible to whoever reads the palette.
- Wherever the rim lands it must catch: **both ear rims** (the top cue — protect these above all),
  the crown, the muzzle bridge, the deltoid tops, the satchel flap's top edge, the hi-vis piping
  (which will over-blow — fine, it is the accent), the breeching, and the **tail tip**.

### 5.7 Costume 1 — "NIGHT SHIFT" (must keep working: `buildModel(1)`)

| Constant | costume 0 | costume 1 | note |
|---|---|---|---|
| `COAT_GROUND` | `#C9CFD6` (Y 0.616) | `#AFB9CB` (Y **0.481**) | colder, darker ground |
| `COAT_SPECK` | `#2E3540` (Y 0.035) | `#22283A` (Y **0.022**) | |
| `COAT_BLUE` (derived) | `#7E8894` (Y 0.242) | `#69738A` (Y **0.171**) | recompute `d` per §5.3: `(0.481 − 0.171) / (0.481 − 0.022) = 0.310 / 0.459 = ` **0.675**. (An earlier pass of this brief printed 0.612 for this; it does not close — run the division.) |
| `CREAM` | `#EDE3D0` | `#D6DCE8` | cream goes cold blue-white |
| `TAN_POINT` | `#C89760` | `#A98A5E` | tan desaturates under sodium/night grade |
| `SATCHEL_DARK` | `#3D4149` | `#282C36` | |
| `HI_VIS` | `#D9E64B` | `#E2EE57` + `emissive(0x3A3608, 0.9)` | the hi-vis actually glows on the night shift. **Not `#E8F55C`** — its green channel is 245, over the contract's 240 albedo ceiling; `#E2EE57` is 226/238/87 and passes. |
| `SIGNAL_RED` | `#E2553F` | `#C0403A` | |
| new | — | `LED_CYAN` `#5FE8FF`, `emissive(…, 2.4)` | a single blinker LED on the cap's rear tab, **the only bloom source on the model** |

The night-shift joke is that the hi-vis is doing the work: at night the *bright* shapes are the
piping, the ankle band and one blinking LED, and the dog is a dark speckled ghost around them.

---

## 6. Surfacing

Kinds are from `src/render/textures.js` (`surfaceMaps(kind, opts)`; `surfaceKinds()` returns **42**
kinds, and `KINDS` also holds a 43rd entry, `default`, which is the unknown-kind fallback); presets
are from `src/render/materials.js` (`SURFACE`, used via `pbr(color, preset, overrides)`), both as
specified in `GRAPHICS_CONTRACT.md` §3–§4.

**Every kind and every preset named in §6.1 was checked against those two files during this pass and
all of them exist.** Two worth flagging because they are easy to get wrong: `fur-coarse` is a valid
name in **both** (`KINDS['fur-coarse']` and `SURFACE['fur-coarse']`), and `skin-reptile` exists as a
`KINDS` entry *and* as a `SURFACE` preset — but §6.1 deliberately pairs the `skin-reptile` **map**
with the `skin-wet` **preset** for the nose, because the reptile preset's roughness is far too high
for a wet nasal planum. Do not "tidy" that mismatch away.

### 6.1 Region → surface table

| Region | `surfaceMaps` kind | `pbr` preset | Behaviour / overrides |
|---|---|---|---|
| Body, neck, shoulders, thighs, crown | **`fur-short`**, `scale 2.2`, `seed 71` | `fur` | The ACD is a *smooth* double coat, body hair **2.5–4 cm** (§10 ref 1). `fur-short` is the only correct kind — `fur-long` is `shibro.js`, `fur-coarse` is `tired-ape.js`. roughness 0.86 ± 0.14 spatial; `sheen 0.5`, `sheenRoughness 0.68`, sheen tint `COAT_GROUND`; `normalScale 1.05`. |
| Breeching (caudal thigh), underside of tail, neck crest | `fur-coarse`, `scale 1.5` | `fur-coarse` | The one place the hair is longer. roughness 0.90, `normalScale 1.25`. |
| Mask patch, outer ear backs, tail-root patch | `fur-short`, `scale 3.0`, `tint: MASK_BLACK` | `fur-dark` | roughness 0.93, sheen 0.25 — the mask must go **matte and dead** so it reads as a hole, not as a shiny black plastic patch. |
| Muzzle, cheeks, chin | `fur-short`, `scale 3.6` | `fur` | Hair is shortest here; finer scale = finer grain. Whisker-bed dimples ride in the normal map. |
| Cream blaze, throat, underside, inner ear, socks | `fur-short`, `scale 2.6`, `tint: CREAM` | `fur` | `sheen 0.62` — the pale hair catches the most rim. This is the second-brightest thing on the model and it should feel *soft*. |
| Nose leather | **`skin-reptile`**, `scale 0.35` | `skin-wet` | The dog's nasal planum is a polygonal cobblestone; `skin-reptile` at a very small scale is exactly that pattern. roughness **0.34**, `clearcoat 0.40`, `clearcoatRoughness 0.25`. **The single best 30 cm detail on the model.** |
| Nostril interiors, mouth bag | `skin-smooth` | `skin-wet` | roughness 0.20. One tiny wet glint per nostril. |
| Tongue | `skin-smooth`, `scale 1.4` | `skin-wet` | roughness **0.16**, `clearcoat 0.5`. Wettest surface on the model. |
| Gums | `skin-smooth` | `skin` | roughness 0.42. |
| Canines | `bone` | `bone` | roughness 0.26, `clearcoat 0.15`, warm gradient toward the gum. |
| Sclera | `skin-smooth` | `skin` | roughness 0.28. |
| Cornea (separate shell over the iris) | — | `glass` | roughness 0.04, `clearcoat 1.0`, `transmission 0`, `envMapIntensity 1.7`. One crisp specular dot per eye (§3.4). |
| Eye rims, lip line | `leather`, `scale 2.4` | `leather` | roughness 0.62. |
| Paw pads | **`rubber`**, `scale 1.2` | `rubber` | roughness 0.72 with **±0.12 variance** — pads are pebbled and unevenly worn. |
| Claws | `horn` | `horn` | roughness 0.34, with a translucent-looking gradient toward the tip (fake it in albedo; no real SSS budget). |
| Satchel body & flap | `cloth-weave`, `scale 1.5`, `wear 0.55` | `cloth` | Waxed cordura: roughness **0.74**, `clearcoat 0.16`, `clearcoatRoughness 0.6`. Waxed canvas is the only *slightly* shiny cloth on the model. |
| Satchel base panel & corner caps | `leather`, `scale 1.0`, `wear 0.8` | `leather` | roughness 0.66. Scuffed — this bag has been dropped. |
| Webbing (main strap, stabiliser, keepers) | `cloth-weave`, `scale 0.55` | `cloth` | Tight flat weave. roughness 0.80, `sheen 0.22`, `normalScale 1.4` so the weave's diagonal rib reads at 1 m. |
| Buckles, D-rings, cam locks, eyelets | `metal-brushed` | `metal` | metalness 1.0, roughness **0.30**, `envMapIntensity 1.3`. |
| Hi-vis piping / ankle band | `plastic-gloss` | `plastic-gloss` | roughness **0.22**, plus the retroreflective trick in 6.4. |
| Cap panels | `cloth-weave`, `scale 2.4` | `cloth` | roughness 0.86, `sheen 0.28`. |
| Cap brim | `cloth-weave` over a stiffener | `cloth` | Same map, but `normalScale 0.6` — a stiffened brim has *less* surface break-up than the crown. That difference is what makes it read as stiffened. |
| Sneaker upper | `cloth-weave`, `scale 3.0` | `cloth` | Engineered knit; roughness 0.82. |
| Sneaker sole & toe cap | `rubber`, `scale 0.9` | `rubber` | roughness 0.68, with a modelled tread (6.5). |
| Parcel (prop) | `paper`, `scale 1.2`, `wear 0.4` | `paper` | roughness 0.84. Tape band gets `plastic-gloss`, roughness 0.28. |
| Shipping label / numeral decal | `decalTexture()` over `paper` | `paper` | See §7.7. |
| Wristband | `rubber` | `rubber` | roughness 0.70. |
| Costume-1 LED | — | `emissive` | `emissive(LED_CYAN, 2.4)`. |

### 6.2 How to render a dense speckled coat without it turning into visual noise

This is the hardest problem in the character and the one the brief was commissioned to answer.
The rule set is four parts; all four are required.

**(a) Three frequencies, three different channels. Never mix them.**

| Band | Feature size | Lives in | Never in |
|---|---|---|---|
| **Macro** — zones | ≥ 0.10 m | albedo only, hand-placed, no noise | — |
| **Meso** — the speckle | **0.010 – 0.030 m** | **albedo only** | the normal map, the roughness map |
| **Micro** — hair grain | < 0.003 m | **normal + roughness only** | the albedo |

Why this is the whole answer:
- Put the speckle in the **normal map** and every speck becomes a lit/unlit pair that swaps as the
  character turns. 200 of those swapping at 60 fps *is* visual noise, and no amount of art direction
  fixes it. Speckle is a **pigment**, not a relief. It has no height.
- Put the hair grain in the **albedo** and the body's average colour drifts as mips kick in, so the
  character changes value while the camera dollies. Grain is a **relief**, not a pigment.
- Keep them separated and the coat resolves *smoothly*: at 3 m the albedo mip has already averaged
  the speckle to `COAT_BLUE` while the normal map still gives you the fur's light response; at 30 cm
  the specks resolve individually over a grain that was always there.

**(b) Blue-noise placement, not white noise.** White noise thresholded to 64% coverage clumps into
blotches and leaves holes — that is what reads as *mud*, and it is the difference between a dog and a
dirty dog. Blue-noise / Poisson-disk points maintain a minimum separation, giving *"an even,
isotropic, yet unstructured distribution"* (§10 ref 10). We already have the generator:
`makeWorley2D(seed, …)` in `src/render/noise.js` places one jittered feature point per cell, which
**is** a Poisson-ish point set. Take `f1 < r` to get evenly spaced blobs. Do **not** build the
speckle from `hash2()` thresholded — that is white noise and it will clump.

**(c) Two discrete size bands, not a continuum.** The source measurements are unusually precise here.
ACDCA (§10 ref 2) defines:
- **Speckle** — *"small, irregular groups of white hair clustered together… as a general guide these
  clusters are up to about one inch"* → **≤ 25 mm**.
- **Mottle** — *"irregular areas of white hair slightly larger than speckle… approximately one inch
  to 1¼ inch"* → **25–32 mm**.

So build exactly two bands and composite them; a continuous size distribution reads as noise, two
discrete bands read as a *pattern*.

| Band | blob diameter | worley cells per metre | role |
|---|---|---|---|
| **A — tick** | **0.010 – 0.016 m** | ~78 | legs, muzzle, cheeks, forearms |
| **B — mottle** | **0.022 – 0.030 m** | ~34 | body, back, flanks, shoulders, thighs |

Blob shape: not circles. Take the worley `f1` field and threshold it **after** a light
`domainWarp2D(…, amount 0.35)` — that yields the *"small, irregular groups"* language exactly, and
irregular edges alias far less than circles at 2 px.

**(d) Region-varying density, with genuine rest areas.** Ticking is *"heaviest on the legs and the
muzzle"* and roan is *"more even over the whole body"* (§10 ref 9); ticking appears only on the
white-spotted areas and never on solid patches (§10 refs 2, 9). That gives a physically-justified
density map that also happens to be good art direction:

| Zone | dark coverage | band | tick colour |
|---|---|---|---|
| Back, flanks, croup, shoulders | **64.4%** | B dominant, A at 25% weight | `COAT_SPECK` |
| Neck, upper arm, thigh | 58% | B + A equal | `COAT_SPECK` |
| Forearm, gaskin, below the elbow/stifle | **44%** | **A only** | `TAN_DEEP` on tan zones, `COAT_SPECK` elsewhere |
| Muzzle, cheeks | **30%**, band A at ½ scale | A only | `COAT_SPECK` |
| **Mask, ear backs, tail root, tail ring** | **0% — solid** | — | — |
| **Chest blaze, throat, underside, inner thigh, Bentley mark, tail tip** | **0% — clean** | — | — |

Those last two rows are the point. **Roughly 34% of the model's surface carries no speckle at all.**
That is the stylized-asset "70/30" discipline — large clean rest areas against dense focal detail —
and it is the reason the character reads as *patterned* rather than *noisy* (§10 ref 11).

**(e) Verify the mip, do not eyeball it.** Render the body albedo, box-filter it down to 8×8, and
check the mean lands within **ΔY 0.010** of `COAT_BLUE` (0.242). If it does not, the body will shift
value as the camera pulls out and no one will be able to tell you why the character "looks different
in wide shots". §11.3.

**(f) Contrast clamp.** At 128 px a 0.026 m mottle is **2.0 px** — squarely in the aliasing danger
zone. Clamp the speckle so that no single blob is more than **1.6 stops** from the local mean after
the band composite, and let `roughnessFromHeight`'s mask weight stay low (0.5) on the coat so the
roughness map does not re-introduce the pattern the albedo just averaged away.

**(g) One prohibition.** **No modelled speck geometry, ever.** Not tufts coloured differently, not
alpha cards, not vertex colours on a subdivided mesh. The speckle is texture. The only fur geometry
on this model is the ear furnish, the breeching skirt, the tail brush and the neck crest — four
places, all silhouette work (6.5).

### 6.3 The coat zone map

The coat needs a **zone id** channel driving which of the §6.2(d) rows applies. Cheapest workable
implementation given the codebase: build the coat albedo with `procTexture(key, size, drawFn)` per
body region — one texture per zone group rather than one atlas — and let each region's mesh take the
map it needs. Six zone textures cover the whole model:

1. `coat-body` — 64.4%, band B+A
2. `coat-limb` — 58%, band B+A
3. `coat-lower` — 44%, band A, tan-tick variant
4. `coat-face` — 30%, band A half-scale, **plus the mask polygon (§3.9) painted as a solid**, plus the
   Bentley lozenge
5. `coat-cream` — solid `CREAM` with a `CREAM_SHADE` gradient at the roots, zero speckle
6. `coat-solid` — flat `MASK_BLACK` for ear backs and the tail root/ring

The mask **must be painted into `coat-face` as a hard-edged solid region**, not built as a separate
mesh shell. A shell means a visible seam edge, a depth-fight risk, and a mask that slides when the
face deforms.

### 6.4 How it behaves under light

- **The coat is sheened, not shiny.** `sheen 0.5` with `sheenTint = COAT_GROUND`. Because the ground
  hair is a near-white and the sheen lobe is broad and grazing-only, the coat's rim response is
  *pale* — which is exactly what a white-ground coat does in life. Anything facing the camera stays
  matte. If the chest is glinting, sheen is too high.
- **Roughness variation is mandatory.** Flat 0.86 across the body is the #1 tell of hobby work.
  Drive it from the fur height field: clump tips −0.10 (glossier), roots +0.06. Keep the variation
  **spatially uncorrelated with the speckle** — if the roughness happens to follow the specks, you
  have just put the speckle back into the specular and undone §6.2(a).
- **The mask is the matte anchor.** roughness 0.93, sheen 0.25 — noticeably deader than the
  surrounding coat. Two surfaces at the same albedo but different roughness still separate under
  light; here you have both, so the mask is bulletproof.
- **Wetness is local and small**: nose leather, nostril interiors, tongue, gums, cornea. Nowhere
  else. A wet coat reads as "just fell in the swamp" — a state, not a design.
- **Fresnel lift.** Give the coat, the cream and the ear leather a `gradientRamp()` grazing lift so
  each form's silhouette edge is ~0.14 brighter than its centre. On the ears this is doing double
  duty: it is what stops a thin, edge-on leather from vanishing when the head turns.
- **Retroreflective hi-vis — the courier trick.** Real hi-vis piping is retroreflective: the lobe
  peaks **back toward the light**, which the current standards model by *reflecting the view vector
  about the surface normal before evaluating a normal microfacet BSDF* (§10 ref 12). We cannot add a
  BRDF, so approximate it in-material: `plastic-gloss` at roughness 0.22, plus an **`emissive` term
  scaled by `saturate(dot(N, V))`** so the strip blazes when it faces the camera and goes dull when
  it turns away. Modest intensity (0.35) in costume 0; in costume 1 raise it to 0.9 and let it bloom.
  Done right, this is the detail that makes people say "that's a real courier".

### 6.5 Micro-detail that sells it (30 cm read)

1. **The nose cobblestone** (`skin-reptile` @ 0.35). Nothing else on the model gets this much return
   per byte.
2. **Whisker-bed dimples** — 20 per side, Ø 0.004 m, normal-map only. Never model whiskers.
3. **Strap compression, modelled.** Where the main strap crosses the chest and back, cut a **0.008 m
   deep, 0.055 m wide groove** into the coat surface, and let the fur **puff 0.006 m proud along both
   edges** of it. Straps do not float; they crush. This is the single most convincing "this is worn,
   not glued on" detail available and it costs ~400 triangles. See §7.1.
4. **Four pieces of real fur geometry, and only four**: ear furnish (5–7 wedges/ear), thigh breeching
   skirt (0.022 m), tail brush underside (0.030 m), neck crest (0.010 m). All bevelled wedges. No
   alpha cards anywhere.
5. **Sneaker tread** — 9 modelled lugs per sole, 0.005 m proud, with the forefoot lugs worn flatter
   than the rear (he pushes off the ball).
6. **Bag wear** — corners rubbed to `leather` at 0.8 wear, one strap keeper twisted 15° out of
   alignment, the flap's left cam-lock done up one notch tighter than the right.
7. **Claw scuffs** on the sneaker toe boxes, because the claws come through.
8. **Fur direction.** The coat's anisotropic grain must actually flow: down the back, radiating from
   a whorl at the point of shoulder, forward and down on the muzzle, and *up* under the jaw. The
   `fur-short` kind's `c.A()` strand field carries direction — align the UVs so it points the right
   way, region by region. A coat whose grain runs the same way everywhere reads as carpet.

### 6.6 Budget

`GRAPHICS_CONTRACT.md` §0 caps a match at **~250k triangles / ~900 draw calls**, shared between two
fighters, the arena and VFX. BONKO's allocation:

- **≤ 26,000 triangles** for the whole model including props and costume 0. He is the lightest
  fighter; he should also be the cheapest. (The ape is budgeted 32k.)
- **≤ 34 draw calls** in the bind pose. Merge by material aggressively — the six coat zone textures
  are the main pressure, so keep all `fur-short` regions sharing one preset instance per tint.
- Texture: six coat zones at 512, everything else at 256. `surfaceMaps` caches per
  `(kind, size, opts)` so the shared `fur-short` field set is generated once for the whole roster.
- The four fur-geometry features together: **≤ 1,400 triangles**. If the ear furnish is eating more
  than 500, it is too dense.

---

## 7. Signature props & wardrobe

Five props carry the courier parody. Three of them (satchel, cap, ankle band) are load-bearing; two
(parcel, whistle) are flavour. **Nothing is branded** — see §9.

### 7.1 The crossbody courier satchel — the most important prop

Parent: **`pack`** bone (exists, on `torso` at `[-0.26, 0.34, 0]`, world `(-0.26, 1.220, 0)`).
It rides **low on the left rear**, i.e. offset to `+Z`, which is the same side as the mask and the
tongue — all the asymmetry stacks (§1).

**Bag body.** A rounded box, `w 0.130 (X, thin front-to-back) × h 0.260 (Y) × d 0.300 (Z)`, bevel
**0.014 m**, centred at `pack`-local **`(+0.017, -0.060, +0.055)`** → world **`(-0.243, 1.160,
+0.055)`**. It is *flat*, hugging the back — a deep box reads as a rucksack.

**Why +0.017 and not the −0.045 an earlier pass specified.** The ribcage ellipsoid (§4.1) is centred
at world x 0.010 with an X half-axis of 0.200; at the bag's centre height (y 1.160) that half-axis
scales to 0.182, so **the back surface is at x −0.172**. The bag's inner face must sit at −0.178 to
give the mandated 0.006 m overlap, and with a 0.130 depth that puts the centre at −0.243, i.e.
`pack`-local +0.017. At −0.045 the bag hangs **0.050 m clear of his back** — a floating rucksack.
Recompute this the moment you touch the torso.

**The contact face is not a cylinder.** The back's local radius of curvature at the bag's centre
height is ≈ **0.12 m** (ellipse `b²/a` = 0.146² / 0.182). A fixed 0.34 m concave face — as an earlier
pass specified — gaps by roughly 0.02 m at the bag's Z edges. Build the inner shell by **offsetting
the torso surface outward 0.006 m** and using that as the bag's back, or if you must use a fixed
radius, use **0.140 m**. Then it actually wraps the ribcage.

**Flap.** A separate shell over the top and down the outer face: `0.146 × 0.010 × 0.312`, wrapping
with a 0.016 m radius at the top edge, hanging **0.150 m** down the outer face, with **corners cut at
28°** so the hem is a hexagonal sweep rather than a rectangle. The flap's **top edge is the hard
straight line** that reads at 128 px (§2.4.3) — keep it dead straight and keep it horizontal.

**Main strap — construction, and how it deforms the chest.**
- Parent the strap to **`torso`, not to `pack`.** If it lives on `pack` it swings off the shoulder
  the first time the bag bounces. The strap is a constraint on the bag, not a child of it.
- Webbing: **0.055 m wide × 0.010 m thick**, built as a **swept ribbon along a 7-point spline**, not
  as boxes. **Both endpoints must land on the bag** — an earlier pass put them at world x +0.02 and
  −0.11, which are 0.20 m and 0.07 m in front of the bag's front face and therefore attached to
  nothing. The bag occupies x −0.308…−0.178, y 1.030…1.290, z −0.095…+0.205, so the spline is:

  | # | world `(x, y, z)` | what it is |
  |---|---|---|
  | 1 | `(-0.185, 1.288, +0.150)` | upper D-ring, bag top-front corner |
  | 2 | `(-0.020, 1.335, -0.110)` | over the **right** trapezius (opposite the bag), 0.013 above the withers |
  | 3 | `(+0.110, 1.270, -0.130)` | front of the right shoulder |
  | 4 | `(+0.185, 1.115, -0.010)` | sternum crossing, on the chest surface |
  | 5 | `(+0.120, 1.045, +0.115)` | lower left ribs |
  | 6 | `(-0.020, 1.020, +0.150)` | left flank |
  | 7 | `(-0.185, 1.040, +0.150)` | lower D-ring, bag bottom-front corner |

  The ribbon twists ~35° total along its run; bake the twist into the sweep frames.
- **The compression.** Along the strap's whole path, the coat beneath is cut **0.008 m deep** and the
  fur **puffs 0.006 m proud on both edges** (§6.5.3). At the shoulder crest — where the load actually
  bears, bridging the gap between the first rib and the acromion (§10 ref 13) — deepen the groove to
  **0.012 m** and widen the puff to 0.010 m. Add **four tension folds** in the cream chest fur
  radiating from the sternum crossing at roughly 20°, 55°, −25°, −60°, each 0.030–0.055 m long and
  0.004 m deep. That is what a loaded strap does to a chest, and it is what tells the eye the bag
  has weight.
- **Shoulder pad**: 0.170 m long × 0.078 m wide × 0.012 m thick, slightly cupped, over the right
  trapezius. It is also the anti-clipping insurance when `armR` lifts.

**Stabiliser strap.** The detail that says *this person actually rides*: a second, thinner webbing
(**0.032 m** wide) from a keeper on the main strap at the sternum crossing, running under the left
armpit to a D-ring on the bag's lower front. It leaves the **0.020 m background slot at the armpit**
listed in §2.5. Real messenger bags use exactly this to stop the bag swinging forward (§10 ref 14).

**Hardware.** One **cam-lock buckle** on the main strap at the right pectoral (a 0.048 × 0.030 ×
0.014 m machined block with a modelled lever), two **D-rings** (Ø 0.030, tube 0.005) at the bag, two
**flap cam locks** (0.026 × 0.020) on 0.028 m webbing tails, one **keeper** on the stabiliser. All
`metal-brushed`. **Real toroids and real levers** — normal-mapped hardware reads as stickers.

**Hi-vis.** A **0.014 m** `HI_VIS` piping strip inset **0.004 m** along the flap's full hem, plus a
0.012 m strip down each side of the shoulder pad.

**Contents bulge.** The bag is not empty: give the flap **two soft bulges** (a 0.09 m box corner and a
0.06 m cylinder end) pushing through it, so the flap's surface is not a plane.

### 7.2 Cycling cap

Parent: **`head`**. The classic three-panel cap: *"two side panels and one panel that runs from the
front of your head to the back"* (§10 ref 15).

- **The critical construction note:** the cap is **NOT a dome**. It is a **saddle with two ear
  notches**. The ears at `(−0.052, +0.130, ±0.078)` must pass through it. Cut two notches, each
  **0.098 m wide × 0.060 m deep**, centred on the ear bases, with a **0.008 m rolled hem** around
  each notch. The cap's rear panel then dips *behind* the ears and sits on the occiput. Get this
  wrong and the cap either floats or eats the ear V (§2.4.1), and either way the read dies.
- **Panels**: centre panel in `SIGNAL_RED`, running head-local x +0.075 → −0.090, width 0.072;
  two side panels in `CREAM`. Seam allowances modelled as **0.004 m raised welts** — three-panel caps
  have visible seams and the seams are half of what makes it read as a cycling cap and not a beanie.
- **Vent eyelets**: 4, Ø 0.009 m, **actual holes** (0.006 m deep, dark inside), two per side panel.
- **Brim**: chord **0.115 m**, forward projection **0.052 m**, thickness **0.014 m** with a rolled
  0.005 m edge, drooping **−18°** from the cap's front line, and **laterally curved (sagitta 0.010)**.
  Underside in `SATCHEL_DARK`. Short, per the rule that a cycling brim must be short enough to see up
  the road under (§10 ref 15).
- **Flip-up state**: the brim rotates **+112°** about its hinge line to sit vertical against the
  crown. **Build this as a driven state** — it is the win/taunt pose (§8.1) and it is the single most
  culturally specific cycling gesture available.
- **Rear tab**: a 0.030 × 0.018 m fabric tab at the back, `HI_VIS`. In costume 1 it carries the LED.
- Cap crown sits **0.034 m** above the skull crown; the cap must not exceed world y **1.594** or it
  starts competing with the ear tips for the top of the silhouette.
- **The cap eats part of the ear V, and you must budget for it.** The V's floor is the crown fur at
  1.560 (§2.4.1); the cap raises that floor to **1.594**, cutting the V's depth from 0.140 m
  (10.5 px) to **0.106 m (8.0 px)**. That is still comfortably above the ≥ 10 px acceptance number in
  §11.1 *only because* §11.1 measures depth to the highest occluder — so **measure the V with the cap
  on**, never with it hidden. If the cap's centre panel is domed rather than saddled it will take
  another 0.02 m and the check fails. Between the ear bases the cap's centre panel must be
  **flat-to-slightly-concave in Z**, following the crown, and its 0.072 m width must stay inside the
  0.074 m gap between the ears' inner base edges (z ±0.037) — a 1 mm margin per side. Build the notch
  hems first and fit the panel to them, not the other way round.

### 7.3 Ankle band

Parent: **`shinR`** only — one leg, the chain side, exactly as real riders wear it. A `HI_VIS`
strap **0.028 m wide × 0.006 m thick** wrapped round the metatarsus at world y ≈ 0.115, with a
**0.036 m velcro tail** sticking out at 22°. Tiny; enormously specific. Because it is on `shinR` it
travels with a severed leg (§7.9), which is funnier than it has any right to be.

### 7.4 Courier sneakers

Parent: `shinL` / `shinR`. Spec in §4.4 (digitigrade cuff, no heel counter, 12° toe spring, 9 lugs).
Upper in `CREAM` with a `SATCHEL_DARK` toe cap and heel cuff; a single **`HI_VIS` lace** and one
0.012 m reflective heel tab. **Two eyelet rows of 4**, modelled as 0.006 m holes with metal grommets.
Sole edge in `SATCHEL_DARK` with a **0.010 m `HI_VIS` stripe** along the midsole — the stripe is what
makes the feet legible when they are moving fast, which is most of the time.

### 7.5 Wristband

Parent: `forearmL` and `forearmR`. A `rubber` band 0.048 m tall, 0.006 m thick, `SATCHEL_DARK` with a
0.008 m `HI_VIS` edge. Sits at the wrist, sleeving the forearm→paw joint (kills any gap there).

### 7.6 Whistle + carabiner

Parent: `torso`, hanging from the main strap's cam-lock. A 0.042 m `metal-polished` whistle and a
0.032 m carabiner. They are **spring-follow secondary motion** (§8.2) and they are the only things on
the model that jingle. Keep them small — they are a 30 cm detail.

### 7.7 The parcel (prop, pose-driven)

Used by `parcelJab`, `deliveryToss`, `signatureSlam`, `lostPackage`, `expressLiquidation`.
Parent: **`forearmL`** (there is no hand bone; offset it to the paw at `[0, -0.20, 0]`, local).
A `paper` cube **0.155 m** with 0.010 m bevels, one `plastic-gloss` tape band across it, and a
**`decalTexture()` shipping label**: a barcode block, three ruled lines of illegible glyphs, and a
**3-digit numeral — `404`**. Numerals only. No words, no wordmark, no company mark (§9). The same
`404` appears once on the satchel flap at 0.055 m tall.

**When not in use it lives inside the bag** — do not leave it welded to the paw. Toggle visibility
from the move script's start frame.

### 7.8 What NOT to build

- **No hammer, mallet or bat**, in any pose or move. See §9.
- **No goggles or sunglasses.** They kill the eyes, and the eyes are half the face read.
- **No collar, bandana or scarf.** All three fill the jaw–chest wedge (§2.5) and hand the silhouette
  to `shibro.js`.
- **No cape, no jacket.** He is a lean shape; cloth volume is the enemy.
- **No visible phone or screen.** It dates the design and it adds a second emitter competing with the
  costume-1 LED.

### 7.9 Attachment rules (all props)

1. Every prop is parented to a **bone**, never to `group`, never to another prop's mesh.
   `Gore._detach()` clones a bone's whole subtree — that is the only mechanism by which props survive
   dismemberment.
2. Props that must travel with a severed part go **under that part's bone**: ankle band → `shinR`,
   wristbands → `forearmL/R`, cap → `head`, whistle → `torso`, satchel → `pack`.
3. **The strap is the exception and it needs explicit handling.** It is on `torso` while the bag is on
   `pack`. If `torso` is detached, the strap goes with it and the bag stays — which looks wrong for
   about four frames and then everything is off-screen. Accept it; the alternative (strap on `pack`)
   looks wrong for the entire match.
4. Every prop sleeves its joint: no prop may create a visible gap between two body parts, and no body
   part may poke through a prop at any pose in the 31 clips. **Check `crouch`, `slidingKick`,
   `wallJump` and `launched` specifically** — those are the four extreme poses in the file.
5. No prop may be the topmost point of the silhouette (that is the ears) or the forward-most point
   (that is the nose). The cap comes closest; §7.2 caps it at world y 1.594.

---

## 8. Expression & motion notes

### 8.1 Face poses

Drive these from a small `head`-local face controller (blend targets or a handful of nested groups).
**The bone list stays frozen** — no new bones. Numbers are deltas from the bind pose.

| Pose | Eyes | Brow / pips | Ears | Mouth / tongue | Extra |
|---|---|---|---|---|---|
| **idle** | aperture 100%, upper lid on the top **20%** of the iris; pupil 0.013; slow blink every 3.2 s ± 0.8 (blink duration 90 ms) | neutral; pips at rest | up and forward, **independent micro-swivel** ±10° every 0.6–1.4 s, never in sync | open **0.038 m**, corners **+6°**, tongue out left at −38°, panting bob 0.006 m at 3.4 Hz | eye darts: ±0.004 m in the corner slivers, every 1.8 s |
| **angry** | aperture **82%**, upper lid **down 0.006** and *straightened* (the lid line goes from curve to a hard diagonal); pupil constricts to **0.008** | inner brow **down 0.010**, outer up 0.004; the clear-side pip drops visibly, the masked side's does not — **asymmetric anger, free** | rotate **back 42°** and down 12°, flattening toward the skull; leather turns edge-on | commissure **−0.012**, lip curl exposing both upper canines, **3 nasal wrinkle ridges** 0.004 m deep across the bridge; tongue **retracted** | masseter bulge +0.006; hackles: crest fur lifts 0.008 along the neck |
| **hurt** | aperture **48%**, squeezed from *both* lids (not just the upper), pupil dilates to **0.018** | both brows **up 0.012** at the inner corner — the "worried" shape | **pinned back and down 58°**, tips almost touching the neck | jaw open 0.052 in a yelp, corners pulled back 0.014, tongue flicks out then in | head recoils 0.02 with a 2-frame overshoot |
| **KO** | eyes **roll up**: iris slides 0.014 up behind the upper lid, leaving sclera and the bottom third of the iris. Lids at 62% | brows slack, both up 0.006 | **splayed sideways 70°**, one 8° lower than the other | jaw slack **0.055**, tongue fully out at **−88°**, extended 0.084 | one ear twitches once, 400 ms after everything else stops. Comic timing. |
| **taunt** | aperture 108% (wide), pupil 0.015, both eyes look **at the opponent** | outer brows up 0.008, cheeky | **one ear up, one dropped forward 34°** | corners **+14°**, tongue fully out, jaw open 0.046 | **head cock: roll 22°, yaw 8°** — the dog head-tilt; brim flipped up (§7.2) |
| **win** | as taunt but aperture 100% | pips up | both ears forward 12° | corners +12°, panting fast | tail at +55°, brim up |
| **lose** | aperture 55%, gaze down 12° | inner brows up 0.010 | dropped 40°, not pinned | mouth closed, corners −8° | ears and tail are the whole pose |

**The two mandatory ones.** If you build only two face poses, build **angry** (the flattened ears and
the straightened lid line — this is what a fighting-game character needs on every hit frame) and
**taunt** (the head cock — this is the single most recognisable dog gesture in existence and it is
where the character's personality lives).

### 8.2 Secondary motion

Everything below is a **spring solver** (contract §11: "secondary motion (ears/tails/cloth/belly
jiggle) driven by a spring solver"). Values are natural frequency / damping ratio / clamp.

| Element | f₀ | ζ | max deflection | note |
|---|---|---|---|---|
| **Ears** (`earL`, `earR`) | **9.0 Hz** | **0.35** | **14°** | The leather is *"thick in texture"* (§10 ref 1) — **stiff, low-amplitude, high-frequency**. Ears **lag**, they do not flop. A floppy ear is a spaniel and it destroys the prick-ear read. Run the two ears at **different phase offsets and ±8% frequency** so they never sync. |
| **Tail** (`tail`) | driven, not free: `wag()` at **5.0 Hz**, amp 0.6 rad | — | — | Plus a **60 ms lag on the distal third** and a **0.030 m trailing overshoot on the brush** so the tail is a whip, not a plank. Existing `wag()` already generates the metronome; add the lag as a second layer. |
| **Satchel** (`pack`) | **6.0 Hz** | **0.50** | **0.090 m** of travel | **Constrained, not a free pendulum.** It swings on an arc about the strap's contact point on the *opposite* shoulder — i.e. its pivot is up and across, not directly above. Add **40 ms extra lag on the flap corner** so the flap flicks after the bag has already stopped. |
| **Flap hem + strap tails** | 11 Hz | 0.30 | 18° | Light cloth, fast, snappy. |
| **Whistle + carabiner** | 13 Hz | 0.22 | 0.035 m | The jingle. Pure garnish; the cheapest life on the model. |
| **Tongue** | 8 Hz | 0.40 | 26° | Swings on head accel. On heavy hits it should slap sideways and stay there for ~6 frames. |
| **Breeching + tail brush fur** | 7 Hz | 0.45 | 0.014 m | Only the four fur-geometry features; the coat itself is rigid. |

**Explicitly do NOT jiggle:** lips, jowls, cheeks, belly. Cattle dogs are tight-lipped and *"free
from throatiness"* (§10 ref 1); wobbling flesh is `wally.js` and `blackish-bull.js` language. BONKO is
taut. **The contrast between his rigid body and his violently mobile ears/tail/bag is the joke.**

### 8.3 Posture-driven personality

- **He never settles.** The `idle` clip must never reach a static frame. Layer on top of the existing
  keys: a **weight shift every 1.2 s** (hips translate ±0.012 m in Z with the lead foot pressure
  swapping), a **front-paw pat** every 2.4 s (0.02 m, one paw, alternating), and the panting bob.
  If you can freeze a frame of idle and it looks like a statue, the pose has failed.
- **Head carriage leads everything.** On every direction change the head turns **3 frames before**
  the shoulders and the shoulders **2 frames before** the hips. That ordering is what reads as
  "reacts faster than you".
- **Anticipation is inverted for the dashes.** Because he is the speed character, his dash startup
  should be **shorter in time but larger in amplitude** than any other fighter: a 2-frame crouch to
  0.055 m before an explosive launch, rather than a 5-frame wind-up. Fast characters look fast by
  *compressing* anticipation, not by removing it.
- **Impact recovery is springy, not heavy.** On `hitLight` he should be back in the idle envelope
  within 6 frames with a single 0.4-amplitude overshoot. He bounces.
- **Landings are on the balls of the feet**, hock absorbing 0.06 m, hips dropping 0.045 m, with the
  ears overshooting downward and snapping back up 3 frames later. **The ear snap is the landing's
  punctuation** — it is the reason a fast character's landings read at all.
- **Between rounds / entrance**: he arrives already moving, does a full 360° spin chasing his own
  tail (2 frames of it, mid-entrance, at speed), and lands facing the camera. `entrance` already
  exists — this is a note for whoever rewrites it.
- **The tail is a mood meter and nothing else.** Amplitude, not presence: 0.6 rad idle, 0.75 win,
  0.35 block, 0.20 lose, 0.10 KO (it does not fully stop — that is the character's one running gag
  and it is stated in `BonkoDef.bio`). **Never freeze it to zero, in any clip, including KO.**

---

## 9. Parody safety — MANDATORY

The mandate (`GRAPHICS_CONTRACT.md` §9): *recognisable archetype and silhouette, changed proportions,
our own colourways and marks.*

**BONKO's situation is structurally safer than most of this roster, and it is worth understanding
why, because it tells you which deviations to protect.** The source archetype is a dog-themed meme
coin on a high-throughput chain. Its actual mascot is a **Shiba Inu**, drawn by a community member,
and the project uses *"its own proprietary logo instead of the original meme"* (§10 ref 16). We are
not building that dog. We are building an **Australian Cattle Dog**, which is:

- a **different breed** with a completely different head, coat and ear geometry;
- **not** the Shiba silhouette that `dogey.js` already occupies in this roster;
- justified by an **independent gag** (courier / same-block delivery) that comes from the chain's
  throughput claim, not from the coin's artwork.

That breed swap is the load-bearing legal fact of this character. **Do not erode it.** Every step
toward a Shiba — a curled tail, a fox muzzle, a cream/tan solid coat, a rounder skull — moves us
toward the source's actual mark *and* collides with another fighter in our own roster.

### Never copy — hard prohibitions

1. **No source name, ticker, or variant** — not the coin name, not a `$`-prefixed ticker, not the
   chain's name or abbreviation, in geometry, textures, decals, mesh names, material names, code
   comments, `userData`, UI strings, or filenames.
2. **No source logo or wordmark**, including the pixel-art dog head the project uses as its mark,
   and including any stylised dog-head roundel that could be mistaken for it.
3. **No chain trade dress.** Specifically: **no purple→green (or purple→teal) diagonal gradient**, no
   three-parallel-bar chevron mark, and no purple-and-green colourway anywhere on the model or in the
   costume variants. This is why §5 has no purple and no chain-brand green.
4. **The source's brand colour is amber/orange. Ours is not.** The file today uses `0xff8c1a` in
   **two** palette slots — `packOrange` (the satchel and the whole chest harness) and `sole` (the
   shoe midsoles) — plus a third hard-coded `lamb(0xff8c1a)` as the body colour of the
   `makeTrain()` freight engine used by the finisher. **Remove all three;** the train is the most
   visible of them because it fills the frame during `expressLiquidation`. Our accents are a near-black
   satchel, chartreuse hi-vis and a small signal-red cap panel (§5). This is a deliberate,
   documented colour move and it should stay documented.
5. **No hammer, mallet, bat or club**, as a prop, a move, a VFX shape, or a move name. Two separate
   reasons, both verified in §10 ref 16: the meme the source coin is named after is *"dogs… hit on
   the head with hammers"*, **and the source's own logo depicts its Shiba holding a large bat.** A
   swung club on our dog would therefore reproduce both the naming joke and the mark's single most
   distinctive element. It also has nothing to do with a courier. Off-limits — and note that a
   *rolled parcel tube*, a *baguette*, a *pipe* or any other bat-shaped swung object is the same
   thing wearing a hat. If a move needs a swing, it swings the **satchel** (`backpack-bash`, which
   already exists) or a **paw**.
6. **No real courier or logistics company trade dress.** No brown-and-gold, no purple-and-orange, no
   yellow-and-red, no white-and-orange delivery livery; no arrow-in-the-negative-space wordmark, no
   shield, no eagle, no globe-and-parallels mark. The satchel is unbranded except for our own
   **numeral** `404` (a number is not a mark).
7. **No real cycling, bag or footwear brand marks** on the cap, satchel, sneakers or wristbands.
   Swooshes, stripe counts that match a known shoe (keep it to a single lace and one heel tab),
   chevrons, wing marks — none of it.
8. **No 1:1 breed-standard proportions.** Our ears, eyes and skull are deliberately oversized
   relative to the Australian Cattle Dog standard, and the animal is bipedal. Nobody owns a dog
   breed, but "our numbers are provably not the standard's numbers" costs nothing to be able to say.
9. **No breed-club illustration traced, sampled or reproduced.** The breed standards cited in §10 are
   text; the illustrated standards are copyrighted drawings. **Read the text, do not copy the art.**
   No colour was pixel-sampled from any breed photograph for §5 — every hex there was constructed
   from the luminance arithmetic in §5.3.
10. **No source-community meme layered on top.** No sunglasses-and-rocket, no spacesuit, no
    laser eyes as a permanent feature. Those are specific viral variants of the source's own artwork
    (§10 ref 16). A speed-line or after-image VFX on a super is generic fighting-game language and is
    fine; a rocket is not.
11. **No real-world blockchain performance figures** as on-model text. `BonkoDef.bio` already jokes
    about "400,000 TPS"; that lives in copy, not on a decal, and it should not become a texture.

### Deliberate deviations that keep us distinct (build these on purpose)

| # | Deviation | Why it protects us | Why it doesn't hurt the read |
|---|---|---|---|
| **D1** | **Different breed entirely.** The source's mascot is a Shiba Inu; we are an Australian Cattle Dog — different skull ratio (57:43 vs a Shiba's much shorter muzzle), different ears, and a speckled roan coat the source's dog does not have. | This is the primary distinction. It is a species-level visual change, not a tweak. | The parody is of the *chain's speed*, not of the mascot's face. The courier gag does the identifying. |
| **D2** | **Bipedal full-body fighter** with legs, a stance, 31 clips and 16 moves. The source has a static 2D avatar and no canonical body. | Everything in §4 is our invention. | The head and coat carry the read. |
| **D3** | **Proportions shifted well past the breed standard**: ears at 0.578 H_h (the standard says *"preferably small rather than large"*), eyes at 0.341 W_s, skull 5.4-heads-to-body on a biped. No dimension matches a published standard. | Nothing is a 1:1 recreation of any protected design. | Every exaggeration runs *toward* the read (bigger ears = stronger prick-ear cue). |
| **D4** | **Our own colourway** (§5), constructed arithmetically from a target luminance rather than sampled. Amber/orange — the source's brand colour — is deliberately removed. | No sampled source colour; no brand colour. | The value structure (dark mask, cream chest, mid speckle) is what identifies, and it is preserved. |
| **D5** | **Half mask on one eye.** Documented breed reality, but it is *our* compositional choice which eye and what outline (§3.9 gives it as our own polygon). | An original asymmetric design, not a copy of anything. | It is the single most memorable thing about him. |
| **D6** | **The courier prop set is entirely ours** — crossbody satchel with a modelled stabiliser strap, notched three-panel cycling cap with a flip-up brim, single hi-vis ankle band, `404` parcel. **None of these has any relationship to the source's artwork.** | Three of his most prominent props are pure invention. | They read as "delivery guy", which is the joke about the chain's throughput. |
| **D7** | **Real eye geometry** — globe, iris, cornea shell, caruncle, lid solids with thickness. | Original 3D construction; the source is flat 2D. | Improves the alert expression rather than diluting it. |
| **D8** | **Stylized-PBR volumetric rendering** with a composed 3-light rig, sheen, fresnel and a physically-motivated speckle system. The source is a flat pixel/vector mark with no shading. **Do not add an outline pass.** | The rendering difference is a large part of what makes ours transformative. | — |
| **D9** | **Our own name, title, bio, moveset, voice and every UI string.** "BONKO / The Fastest Block Alive" is ours; so are all 16 move names and the finisher. | No source naming anywhere in the shipped product. | — |
| **D10** | **Costume 1 ("NIGHT SHIFT") and the finisher are wholly non-source content** — a night-courier colourway with emissive hi-vis and a blinker LED, and a freight-train finisher. | Nothing to map onto the source at all. | — |

### Build-time compliance check (run these, do not assert them)

1. Runnable, not a placeholder. From the repo root:

   ```sh
   grep -rniE 'bonk[^o]|\bbonk$|\$bonk|solana|\bsol\b|shiba|inu|doge|hammer|mallet|\bbat\b|club' \
     src/characters/bonko.js
   ```

   → **zero hits**, including in comments, mesh names, material names, `userData` and UI copy. Note
   the `[^o]` — our own name `BONKO` must not trip it, but a bare `BONK` anywhere must. Run the same
   grep over any texture-generating code you add. (`bat` is in the list because the source's own mark
   is a Shiba **holding a bat**, §10 ref 16 — it is not a hypothetical.)
2. **No hex in §5 is amber/orange.** Assert: for every palette entry, **not** (`hue ∈ [20°, 45°]`
   **and** `saturation > 0.55` **and** `Y > 0.30`). The current `0xff8c1a` fails this — that is the
   point. `TAN_POINT` (`#C89760`, hue 32°, HSL sat **0.49**, Y 0.353) **passes** — that is why the
   hex is 0.49-saturated and not the 0.59 of the `#D2924F` an earlier pass proposed, which would have
   failed the assertion it was written next to. Keep it as a **fur-textured tan point on a limb**
   anyway, never as a prop, panel or plastic surface: passing an assert is not the same as being
   safe, and a saturated tan *object* is the thing that starts looking like a brand colour.
3. **No purple and no chain-green anywhere.** Assert no palette hue in `[255°, 300°]` and none in
   `[130°, 165°]` at saturation > 0.4, in either costume.
4. The only decals on the model are our own: the `404` numeral (×2) and the abstract barcode/glyph
   block on the parcel label. **No decal contains a word.**
5. Every mesh, material and bone name is generic: `'satchel'`, `'flap'`, `'strap'`, `'cap'`,
   `'brim'`, `'earL'`, `'maskZone'`, `'hiVis'`. No source vocabulary ships in UI copy.
6. Head length ratio measured on the built mesh is **57:43 ± 2%** (this is simultaneously the
   anti-Shiba check and the anti-`dogey.js` check — run it as a real assertion, §11.2).

**If in doubt on any prop:** if it carries a name, a logo, or a colourway that belongs to a specific
company, coin or chain, do not build it. Everything else in the vocabulary — cattle dogs, speckled
coats, messenger bags, cycling caps, hi-vis, parcels, barcodes — is generic real-world subject matter
that no source invented, and is safe as *archetype*.

---

## 10. Reference notes — what I actually looked at

Everything below was fetched and read during this pass (July 2026). Where a source is quoted, the
quotation is short and attributed, and the extracted *measurements* — not the prose — are what drive
the build. No breed-club illustration was copied, and no colour was pixel-sampled (§9.9).

### Breed standard & conformation

1. **Australian Cattle Dog Club of America — Breed Standard**
   `https://www.acdca.org/breed-standard/` (cross-checked against the AKC PDF at
   `https://images.akc.org/pdf/breeds/standards/AustralianCattleDog.pdf`, the UKC standard, and the
   ACDCA Illustrated Standard page `https://www.acdca.org/illustrated-standard/`).
   **Extracted and used directly:**
   - Size 46–51 cm (dogs) / 43–48 cm (bitches) at the withers → not used literally (we are bipedal)
     but it fixes the *build class*: medium, compact, athletic.
   - **Body length : height = 10 : 9** → §2.2 (body length 0.560 → quadruped-read withers height 0.504 = 0.560 × 9/10).
   - *"Skull broad, slightly curved between the ears, flattening to a slight but definite stop"* and
     ***"skull and muzzle on parallel planes"*** → §3.1, §3.2. The parallel-planes clause is the
     single most useful sentence in the standard and it is the thing builds always miss.
   - *"Muzzle medium length, deep, powerful… broad, well filled in under the eyes"* → §3.5.
   - Eyes *"oval shape and medium size, neither prominent nor sunken… dark brown"* → §3.4 (0.341 W_s,
     1.59:1 oval, 0.006 m protrusion, `IRIS_BROWN`).
   - Ears *"moderate size, preferably small rather than large, broad at the base, muscular, pricked
     and moderately pointed"*, *"set wide apart on the skull, inclining outwards"*, *"thick in
     texture"*, *"fairly well furnished with hair"*, *"neither spoon nor bat eared"* → the whole of
     §3.8, including the 18.5° outward cant, the 0.012 m leather thickness and the 0.010 m tip blunting.
   - Neck *"extremely strong, muscular… free from throatiness"* → §4.1 (taut throat line, no dewlap,
     which is what preserves the jaw–chest wedge).
   - *"Chest deep, muscular and moderately broad"*, *"ribs well sprung… not barrel ribbed"*,
     *"croup rather long and sloping"*, *"hocks strong and well let down"* → §4.1, §4.4
     (1.30:1 rib ellipse, 26° croup, hock at 0.109 H).
   - Tail *"set on moderately low, following the contours of the sloping croup"*, *"approximately to
     the hock"*, *"carrying a good brush"*, and in motion *"no part… should pass a vertical line
     drawn through the root"* → §4.5.
   - Coat *"smooth, a double coat with a short dense undercoat"*, body hair **2.5–4 cm (1–1½ in)**,
     longer under the body forming *"a mild form of breeching"* near the thighs → §6.1 (`fur-short`,
     not `fur-long`/`fur-coarse`) and §4.4 (the 0.022 m breeching skirt).
   - Colour: blue *"blue, blue-mottled or blue speckled"*; permissible *"black, blue or tan markings
     on the head"*; tan *"midway up the legs and extending up the front to breast and throat, with
     tan on jaws"*, and on the hindquarters *"inside of hindlegs and inside of thighs, showing down
     the front of the stifles and broadening out to the outside of the hindlegs from hock to toes"* →
     this is the exact tan-point map in §5.1 and §4.2. It is far more specific than anyone builds
     from memory.

2. **ACDCA — Coat Color & Patterns** `https://www.acdca.org/coat-color/`
   The most valuable single source for this character. **Extracted:**
   - *"The 'blue' colour is produced by a more or less even intermingling of black and white hairs in
     the outer coat giving the impression of bluish colour."* → the entire premise of §6.2.
   - **Speckle** = *"small, irregular groups of white hair clustered together and distributed more or
     less evenly throughout the coat… these clusters are up to about one inch"* → **≤ 25 mm**,
     band A in §6.2(c).
   - **Mottle** = *"irregular areas of white hair slightly larger than speckle… approximately one
     inch to 1¼ inch"* → **25–32 mm**, band B.
   - *"Black markings on the head (often presenting as masking or eye patches) and tail are completely
     normal and commonly found"* → the mask (§3.9) and the tail-root patch (§4.5).
   - *"Virtually all Australian Cattle Dogs… have a white marking on the forehead… called a 'Bentley'
     mark"* → §3.9.
   - *"Ringed tails (colloquially called 'racoon tails') or other white on the tail are seen in both
     red speckle and blue dogs. This is a breed characteristic."* → the white tail tip, which became
     the character's primary motion read (§1, §4.5).
   - Undercoat *"may be black and or tan"* → the `TAN_DEEP` root darkening in §5.1.
   - Puppies born white or nearly so, colour developing in the white areas → confirms the
     white-ground model.

3. **Wikipedia — Australian Cattle Dog** `https://en.wikipedia.org/wiki/Australian_Cattle_Dog`
   Confirmed the 10:9 ratio and the size range independently, and supplied the phrasing that fixed
   the coat model: the coloured hairs are *"closely interspersed through a predominantly white
   coat"*, dogs are *"born white (except for any solid-coloured body or face markings)"* with
   red/black hairs showing from ~4 weeks. Also *"an alert, athletic dog capable of endurance and
   quick bursts of speed"* → the posture brief in §4.6.

4. **Facial masking terminology** (search results across a veterinary/genetics figure set and breed
   references). **Extracted:** one eye patch = *half* or *single* mask; two = *full* or *double* mask;
   no patch = *plain-faced*; masks are *pigmentation surrounding the eye and extending laterally over
   the temporal region*; **all three are acceptable under the standard.** → the decision to build a
   half mask (§1.2, §3.9) and the instruction that the mask's rear extension lands in the temporal
   hollow.

5. **Breed temperament/expression references** (Wag!, Tin Roof ACD, Britannica). Supplied the
   *"warning or suspicious glint"* language behind the alert-lid spec in §3.4 (upper lid on the top
   20% of the iris, not the ape's 40%+).

### Coat genetics — why it is not merle, and how the pattern is distributed

6. **ACDCA coat page + Coats and Colors + CombiBreed (T-locus / roan)**
   `https://coatsandcolors.com/ticking-spots-and-roan/`, `https://www.combibreed.com/subject/roan-ticked-dog/`
   **Extracted, and it corrects the roster brief's wording:** the ACD's pattern is governed by the
   **ticking / roaning (T) locus — the usherin gene `USH2A` — not the merle (M) locus.** The dog is
   genetically black-and-tan under extreme white spotting, so the roaning is black on the body and
   tan on the points. *"This pattern of white and coloured hairs is sometimes mistakenly described as
   merle."* → §6.2, and it is why the tan zones tick **tan** rather than black (§6.2(d)).
   `GRAPHICS_CONTRACT.md` §9 calls it "merle"; that is a colloquialism. **Build roan/ticking.**

7. **Dog Coat Colour Genetics — ticking** `https://www.doggenetics.co.uk/ticking.html`
   **Extracted:** ticking is *"flecks or spots of colour on white areas"* and appears **only** on
   white-spotted areas — never on solid patches. *"Generally, ticking is heaviest on the legs and the
   muzzle. If a dog has only a small amount of ticking, it will appear in these areas before appearing
   anywhere else."* Roan by contrast is *"more even over the whole body"*. Ticking colour matches what
   that area would be without white — so a black-and-tan dog ticks black on the body and **tan on the
   legs, chest and muzzle**. → the entire region-density table in §6.2(d), including the 44% / 30%
   values on the lower limbs and muzzle and the tan-tick variant.
   Also: *"dogs with ticking or roan are generally born white; the ticking/roaning develops as the dog
   grows"*, and ACDs specifically are *"born white due to extreme white spotting with roaning"*.

### Anatomy & proportion

8. **Cephalic index / mesocephalic skull data** (Wikipedia *Cephalic index in cats and dogs*;
   PMC8749540 on mesocephalic head shape). **Extracted:** mesocephalic skull length ≈ **15.00 ± 2.96
   cm** with facial length ≈ **6.46 ± 1.55 cm** → **muzzle = 43% of head length**, cranium 57%.
   This is the source of §3.0's 57:43 budget, which is simultaneously the anti-wolf and anti-Shiba
   check (§9.6, §11.2).

9. **ACDCA Working Standard + breed working-behaviour references**
   `https://www.acdca.org/working-standard/` and breed guides.
   **Extracted, and it decided the posture:** the ACD is *"an upright breed with the head carried at
   shoulder level while working"* — **not** the crouching, head-below-shoulders eye-stalk of a border
   collie (which I checked separately, and rejected: *"the head may be held lower than the body or
   almost on the ground… crouching almost to the ground in the front end"* — that is a different
   breed's working style and it would have been wrong here). The heeling technique is to *"time the
   grip to occur on the foot of the weight bearing leg, and to duck to miss the ensuing kick"*, and
   the breed *"continuously heels low and avoids being kicked"*. → §4.6: chin **0.077 m below the
   withers** but the head carried *forward*, not dropped; stifles at 128°; rear heel lifted.

### Rendering technique — how to make a dense speckle read

10. **Blue noise / Poisson-disk sampling** — demofox.org *"What the heck is blue noise?"* and
    *"Mitchell's Best Candidate"*, plus Poisson-disk sampling write-ups.
    **Extracted:** *"White noise sample points can clump together and leave empty space"* whereas
    blue-noise points *"maintain a minimum distance from other points"*, giving *"an even, isotropic,
    yet unstructured distribution"*. → §6.2(b): build the speckle from `makeWorley2D` (jittered
    one-point-per-cell ≈ Poisson), **never** from thresholded `hash2`. This is the difference between
    "speckled dog" and "muddy dog" and it is a two-line change.

11. **Stylized-asset detail budgeting** (80 Level / stylized game-art pipeline write-ups) and
    aliasing fundamentals (gamedev.net *Geometry aliasing*).
    **Extracted:** the **70/30 rule** — ~70% of an asset's surface should be large clean forms and
    rest areas, with ~30% dense focal detail, because *over-detailing creates visual noise that breaks
    readability in motion*; and the Nyquist framing that high-frequency detail below ~2 px produces
    *"pools of noise in textures"* and artificial motion, with **low-pass filtering before sampling**
    as the correct fix. → §6.2(d)'s mandatory 0%-speckle rest areas (~34% of the model), §6.2(f)'s
    1.6-stop contrast clamp, and §6.2(a)'s rule that the speckle lives in albedo only so that
    mip-mapping *is* the low-pass filter. Also the flat-black silhouette validation practice → §2.4.

12. **The Minimal Retroreflective Microfacet Model** (arXiv 2606.08739).
    **Extracted:** retroreflection is modelled by *"replacing the view direction with its reflection
    about the surface normal before evaluating the standard model"* — the lobe peaks back toward the
    light rather than in the mirror direction; no new parameters; adopted in OpenPBR/MaterialX.
    We cannot swap a BRDF in Three.js, so §6.4 approximates it with a view-facing emissive term on the
    hi-vis strips. Also read the practical hi-vis background (glass-bead vs prismatic cube-corner
    optics) at `https://www.hivissupply.com/hi-vis-blog/high-visibility-prismatic-tape-vs-glass-bead/`
    — prismatic returns a brighter, tighter lobe, which is what the sharp on/off falloff in §6.4
    is imitating.

### Courier / cycling wardrobe

13. **Backpack & strap ergonomics** (REI *Backpacks: Fit & Adjusting*; Backpackies *Anatomy of a
    Backpack*; ScienceDirect *Chest Strap* overview).
    **Extracted:** the strap *"bridges the anatomical gap between the first rib and the acromion
    process of the scapula"* to carry load — that is precisely where §7.1 deepens the coat groove to
    0.012 m. Wider straps lower interface pressure (8 cm straps measured lowest), which justifies the
    0.055 m webbing plus a 0.078 m shoulder pad rather than a thin strap. A sternum/stabiliser strap
    that is over-tightened *"can distort the overall fit of the harness"* — hence the deliberate
    asymmetric cam-lock (one notch tighter, §6.5.6).

14. **Messenger-bag construction** (Portland Leather sizing guide; Szoneier manufacturing guide;
    Troop London and AET Tactical crossbody-vs-messenger explainers).
    **Extracted:** a messenger bag is *"a flat, single-strap crossbody bag with a front flap"*;
    the defining components are the crossbody strap (adjustable, 45–60 in / ~1.14–1.52 m including
    hardware), the **stabiliser strap** that *"clips around your waist or torso to prevent bouncing"*
    during riding, the front flap secured by buckles/cam locks, and a main compartment. A medium bag
    is ~13 × 10 × 4 in (0.33 × 0.25 × 0.10 m). → §7.1's 0.300 × 0.260 × 0.130 m body (a medium bag,
    scaled to a 1.70 m figure), the flat-not-deep proportion, and the stabiliser strap, which is the
    detail that separates "courier" from "person with a bag".

15. **Cycling-cap construction** (Walz Caps fit/materials guides; BIKEPACKING.com *Make Your Own
    Cycling Cap*; Velominati *Proper Cycling Caps*; Outdoor Cap *Anatomy of a Cap*).
    **Extracted:** the classic cap is **three-panel** — *"two side panels and one panel that runs from
    the front of your head to the back"* — in cotton, with embroidered vent eyelets, and a **short**
    brim with a plastic/Pellon stiffener covered in fabric; the brim must be short *"because when the
    head is tipped down while riding, you need to be able to see up the road"*. Flipping the brim up
    is standard practice. → §7.2's three panels with visible welts, four eyelets, 0.052 m brim
    projection, the stiffener-driven `normalScale 0.6` on the brim vs 1.0 on the crown, and the
    flip-up state as the taunt pose.

### Source / parody context

16. **The coin's own mascot and mark** (Decrypt *What is BONK?*; Blockchain Council; the community
    account of the logo's origin; IQ.wiki). **Extracted, and it is what §9 turns on:** the mascot is a
    **Shiba Inu**; the project *"uses its own proprietary logo instead of the original meme"*, drawn
    by a community pixel artist; the name references the meme of dogs *"hit on the head with
    hammers"*; and the viral community variants are the dog in sunglasses, spacesuits and on rockets.
    → §9.1–2 (no name/logo), §9.5 (no hammer), §9.10 (no meme variants), and D1 — **the breed swap
    from Shiba to cattle dog is the character's primary legal and compositional distinction**, and
    also the thing that keeps him from colliding with `dogey.js`.

### Codebase

17. `src/characters/bonko.js` (1,746 lines) — read `buildModel()`, the palette block, all 31 clips'
    track names, and `BonkoDef` including all 16 moves and the `expressLiquidation` finisher. Bone
    hierarchy, bind offsets, `wag()`, the `bent()` base-rotation trick and the `pack`/`tail` extra
    bones are all reproduced in this brief's header. **Counts were re-derived from the file during
    this pass, not remembered: 15 bones, 31 clips, 16 `moves` entries, 12 of which carry a non-null
    `script` (`parcel-jab`, `tail-strike`, `backpack-bash` and `signature-required` are
    `script: null`), 1 finisher, 1,746 lines.** Earlier drafts of this brief quoted "33 clips" and
    "19 moves" in several places; both were wrong and both are corrected throughout.
    One further correction: the ears' bind offset in the file is **`[-0.03, 0.20, ±0.10]`**, not the
    `[-0.052, 0.130, ±0.078]` an earlier draft listed as frozen — see the header table, where it is
    now listed as the third *changed* offset with its justification.
18. `GRAPHICS_CONTRACT.md` §0 (albedo 30–240, triangle/draw budgets), §3 (`surfaceMaps`), §4 (`pbr`,
    `SURFACE`, the required preset list), §9 (the parody mandate and the per-fighter cue table),
    §11 (spring-driven secondary motion), §12 (definition of done).
19. `src/render/textures.js` — the 43 `KINDS` entries, i.e. the 42 kinds `surfaceKinds()` returns
    plus `default` (`fur-short`, `fur-long`, `fur-coarse`,
    `skin-smooth`, `skin-amphibian`, `skin-reptile`, `skin-elephant`, `feather`, `scales`,
    `cloth-weave`, `cloth-knit`, `denim`, `suit-wool`, `leather`, `rubber`, `plastic-matte`,
    `plastic-gloss`, `metal-brushed`, `metal-polished`, `metal-painted`, `metal-rusted`, `gold`,
    `chrome`, `concrete`, `asphalt`, `marble`, `granite`, `wood-plank`, `wood-rough`, `ice`, `snow`,
    `sand`, `mud`, `water`, `glass`, `neon-panel`, `circuit`, `screen-crt`, `pixel-grid`, `paper`,
    `bone`, `horn`), plus `surfaceMaps` opts (`scale, seed, tint, wear, size, repeat, hero`),
    `procTexture`, `decalTexture`, `gradientRamp`, `triplanarDetailNormal`, and the `fur-short`
    generator's clump/strand/undercoat fields that §6.4's roughness variation hooks into.
20. `src/render/noise.js` — `makeWorley2D`, `makeVoronoiCells`, `domainWarp2D`, `fbm2D`, `hash2`:
    the tools §6.2 specifies for the speckle.
21. `src/render/materials.js` — `SURFACE` preset table (`fur`, `fur-dark`, `fur-coarse`, `skin`,
    `skin-wet`, `leather`, `rubber`, `cloth`, `plastic-gloss`, `metal-*`, `glass`, `horn`, `bone`,
    `paper`, `neon-panel`), the 30–240 albedo guard, and the `pbr()` caching contract.
22. `docs/parody/tired-ape.md` — read in full for format, depth and the landmark-table convention.
    This brief follows its structure deliberately so the two are cross-readable.

### What is still unverified

- **No live pixel measurement of a reference photograph was made** (unlike the ape brief, which
  measured token PNGs). All facial numbers here are constructed from the breed standard's *verbal*
  proportions plus the mesocephalic skull statistics in ref 8. They are self-consistent and they hit
  the ratios the standard describes, but if someone later measures 20 ACD head photographs and finds
  the eye sits at 0.68 H_h rather than 0.708, take the measurement over this file.
- **The 64.4% speckle coverage is derived from a chosen target value, not measured off a dog.** It is
  right for *our* value ladder (§5.5). If it looks too dark in-engine, change `Y_target` and
  **recompute both `d` and `COAT_BLUE`** — do not adjust one without the other (§5.3).
- The retroreflective approximation in §6.4 is an art-directed cheat, not the MRM model. If the
  foundation agent ever exposes a custom BRDF hook, this is the first thing that should use it.
- **The head's depth budget (§3.0) is the weakest structural call in this brief and you should know
  why.** A 5.40-head figure needs `H_h` = 0.315 m; a *real* cattle dog head 0.300 m long is only
  ≈ 0.195 m deep. The gap is closed here by a deliberately deep mandible (0.120 m of the 0.315). That
  is a defensible stylization — fighting-game anthro heads are routinely deepened this way, and it
  buys jaw authority and a strong lower-face shadow — but it is **the one number in this file chosen
  for silhouette rather than derived from a source.** Build it, screenshot it in profile at 256 px,
  and if it reads as a bull terrier rather than a cattle dog, the correct fix is to raise the
  underjaw low point toward **1.290** and restate the figure as **6.3 head-heights**, recomputing the
  last column of §2.1 and the four `H_h`-relative ratios in §3.3, §3.4, §3.7 and §3.8. Do **not**
  fix it by lengthening the muzzle — that breaks the 57 : 43 anti-Shiba check, which is load-bearing
  for both the read and §9.
- Corrections applied in this review pass, listed so nobody "restores" them: clip/move counts
  (33/19 → **31/16**), the ears' true bind offset, the ear cant (16° → **18.5°**, which is what
  actually lands the tip at 1.700), the skull-plane pitch (7° → **16°**, which is what the landmark
  table implies) and every muzzle/nose/lip Y that hangs off it, the ear-V dimensions, the 10 : 9
  body-length arithmetic, the rib-cage ratio, the outer stance, `IRIS_BROWN`'s out-of-gamut blue
  channel, `TAN_POINT`'s hex (it failed §9.2's own assertion), costume 1's derived `d` and its
  over-bright hi-vis, and the satchel's position, contact radius and strap endpoints (which were
  attached to empty space).

---

## 11. Acceptance checklist — measure these, do not eyeball them

Run every one of these before you write your report. Numbers, not impressions.

1. **Silhouette at 128 px.** Render the model filled black at 128 px tall, from front, ¾ and profile.
   Confirm: two separated ear triangles with a V between them measuring **≥ 18 px at the tip line,
   ≥ 5 px at the ear-base line, and ≥ 8 px deep measured with the cap ON** (10.5 px bare, 8.0 px
   capped — §2.4.1, §7.2); muzzle projecting ≥ 7 px past
   the chest in profile; the satchel breaking the rear line by ≥ 10 px with a straight top edge; a
   visible concave bite in the underline. **Show a stranger the 128 px front view and ask what animal
   it is. If they do not say "dog", stop and fix the ears.**
2. **Head ratio assertion.** Measure the built mesh: (occiput x → stop x) : (stop x → nose tip x) =
   **57 : 43 ± 2%**. This is the anti-Shiba / anti-`dogey.js` check and it is worth a real assert.
3. **Mip average.** Box-filter the body coat albedo to 8×8; mean relative luminance must be within
   **ΔY 0.010** of `COAT_BLUE` (0.242). Repeat for costume 1 against its own derived value.
4. **Speckle is not in the normal map.** Sample the coat normal map along a line crossing several
   specks; the normal must not correlate with the albedo. Correlation coefficient **< 0.15**.
   If it is higher, the coat will shimmer when he dashes, which is most of the match.
5. **Greyscale test.** Desaturate a 128 px render. Surviving: the cream chest, the black mask, the
   dark satchel diagonal, the white tail tip. Nearly vanishing: the tan points, the hi-vis, the
   `SIGNAL_RED` cap panel. If the tan legs are shouting, `TAN_POINT` is too light (§5.5).
6. **Albedo range assert.** Every channel of every albedo constant in §5.1–5.2 is ≥ 30 and ≤ 240
   sRGB. One line, run it in a test.
7. **Reach regression.** With `arm.z` at ±0.155, `head.x` at 0.10 and `ear` at `[-0.052, 0.130,
   ±0.078]` (all three changes, header table), run the existing harness over
   all 16 moves plus the finisher and confirm no hitbox `forward`/`up` needs changing. Screenshot
   `parcelJab`, `rapidPaw`, `sprintTackle` and `deliveryToss` connecting at the same ranges as before.
8. **Pose clipping sweep.** Step every one of the 31 clips and check no prop intersects a body part
   and no joint shows a gap. Pay specific attention to `crouch`, `slidingKick`, `wallJump`,
   `launched` and `expressLiquidation`.
9. **Both costumes build.** `buildModel(0)` and `buildModel(1)` both return the same 15 bones, both
   pass checks 1–6, and costume 1's LED is the only bloom source on the model.
10. **Budget.** ≤ 26,000 triangles and ≤ 34 draw calls in the bind pose. Frame time on `high` within
    15% of the pre-change baseline (`GRAPHICS_CONTRACT.md` §12.4).
11. **Compliance greps.** All six checks in §9's build-time list return clean.
12. **Zero console errors** (`window.__errs` empty — see `DRIVER.md`), and you have **looked at your
    own screenshots in the live game**, per `GRAPHICS_CONTRACT.md` §12.3.

