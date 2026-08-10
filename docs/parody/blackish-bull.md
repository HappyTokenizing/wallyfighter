# BLACKISH BULL — parody-likeness build brief

**Fighter:** `src/characters/blackish-bull.js` · `BlackishBullDef` + `BlackishBullUnchainedDef` · `id: 'blackish-bull'` / `'blackish-bull-unchained'`
**Source archetype:** the Wall-Street-style *charging bull monument* — a bronze market-optimism statue — reimagined as a corporate enforcer and final boss.
**Contract authority:** `GRAPHICS_CONTRACT.md` §9 (parody mandate), §3/§4 (surfaces & materials), §0 (the five AAA tells), `CONTRACTS.md` §4 (rig — do not change).
**Author:** character-art-direction research pass. Every number below is derived from photographic observation of the source monument, from cited live-cattle anatomy, or from the existing rig's frozen dimensions — see §10. **Build to the numbers, not the adjectives.**

---

### Axis convention (get this right first)

The rig faces **+X**. In this file `box(w,h,d)` means **w → X (forward/depth), h → Y (up), d → Z (lateral width)**. Ears and horns sit at `z = ±…`. Feet at `y = 0`. Every metre value in this brief is in this space, expressed in the **group-local** frame (feet at 0) unless the text says "head-local".

### Height note — read this before you convert anything

`def.height = 2.50` (base) and `2.90` (UNCHAINED, via `group.scale = 1.15`). **This is not the ~2.0 m roster baseline.** The bull is the tallest fighter in the game by 25% over WALLY (2.00) and by 47% over PEEPEE (1.50). That scale gap *is* part of the boss read and must not be compressed. All "fraction of H" values below use **H = 2.50 m**. If you see a ratio quoted against 2.0 m anywhere, it is wrong — reconvert.

### Rig is frozen

`buildModel(costume)` must keep returning exactly these bone names, in this hierarchy:

```
group > hips > { tail, legL, legR, torso }
legL/legR > shinL/shinR
torso > { head > { earL, earR }, armL > forearmL, armR > forearmR }
```

- **`hips` base local position stays `[0, 1.15, 0]`.** Every clip keys hip position *absolutely*; move it and 31 clips break.
- No bone may be renamed, removed, or re-parented.
- You **may** add purely additive accessory pivots that no clip keys, provided their names come from `Gore.js`'s `ACCESSORY_BONES` list: `glasses`, `goggles`, `lens`, `hat`, `mug`, `phones`, `tie`, `sash`, `pack`, `pouch`, `monocle`, `coat`, `robe`. This brief uses **`glasses`** (visor) and **`tie`** (nose-ring leash/necktie) and **`coat`** (jacket). Nothing else.
- `SECONDARY_BONES` = `earL, earR, tail, trunk, tongue` — our `earL/earR/tail` are already in it, so they are dismemberment targets. Design them so a torn-off ear and a torn-off tail both look like sculpted bronze fragments (§7).
- Never parent a mesh directly to `group`. `Gore._detach()` clones a **bone's whole subtree** and hides the original; anything on `group` is invisible to it and will float.
- These four `userData` keys are read by move scripts and must survive: `visorMat`, `markMats`, `baseScale`, `unchained`. `glowMarks()` writes `.emissive` on every material in `markMats` and restores from `mat.userData.baseEm` — keep that convention.
- `makeBearMask()` (joke move) attaches at head-local `(0.30, 0.16, 0)`. After the head rebuild, **re-verify that offset** and update it in `bearCostumeScript` if the frontal plate moved.
- `def.height`, `weight`, `walkSpeed`, `dashSpeed`, `jumpVel`, all `hitbox`/`knockback` blocks: unchanged. If a proportion change moves a fist, update the reach constants in `shoulderChargeScript` / `bullRushScript` / `grappleTossScript` and verify in the harness.

---

## 1. The 2-second test

**A bronze monument that got off its plinth and stood up.** The read is a single, unmistakable skyline: **the top of the character is not its head.** A colossal muscular neck-crest hump rises to the highest point of the body; the skull hangs *below and in front of* it, thrust forward and angled 34° down, so the character permanently looks like it is about to run through a wall — and out of the top-rear corners of that lowered skull, two thick horns sweep **out, then forward, then up**, ending in points that finish **0.30 m ahead of the nose** and span **1.15 m tip to tip, 2.7× the width of the head**. Behind all of it, a whip-lash tail arcs up over the rump and hooks forward, drawing an open loop of empty sky above the back. Head down, horns forward, hump up, tail arced: four peaks, one animal, no ambiguity.

The colour half of the read is the *statue* half, and it is a two-value trick with a hard edge. The body is a **dark green-black bronze patina** — near the bottom of the value range, low chroma, unmistakably a corroded metal rather than a black animal. Against it, in a small number of places, sits **burnished warm bronze at near-mirror roughness**: the nose pad, the horns, the forehead crown, both shoulder tops, the knuckles and the hoof crowns. Those are the places tourists rub a public bronze until it gleams, and that specific, illogical distribution of polish — bright where hands reach, black everywhere else — is the single most identifiable property of a real market-bull monument. It says *statue* faster than any silhouette can. Get that mask right and the parody lands even from behind.

Then, half a beat later: the enforcer confirmations. A **ring through the nose**, hanging from the septum with a visible bolt, with a **necktie on the end of the chain** — the joke in one object. A **glowing wraparound visor** where the eyes should be. **Shackle bands on both wrists and both ankles.** And, threading the whole body, **molten seams** — the boss form burning through from inside. If a viewer needs the necktie to name the reference, the head and the patina have failed.

---

## 2. Silhouette specification

Total silhouette height **2.50 m**. Head height (poll top → bottom of chin, measured along the head's own axis, horns excluded) **0.50 m** → the figure is **5.0 head-heights**. That is deliberately squat and heavy: an 8-head hero proportion turns the boss into a lanky minotaur and destroys the read. Head width across the cheeks **0.42 m** (`0.84 × head height`, `0.168 H`).

### Vertical landmark table (group-local, feet at y = 0)

| y (m) | y / H | Landmark |
|---|---|---|
| 0.00 | 0.000 | Ground / hoof sole |
| 0.03 | 0.012 | Heel-bulb bottom |
| 0.18 | 0.072 | Hoof crown / coronary band |
| 0.26 | 0.104 | Fetlock centre |
| 0.30 | 0.120 | Dewclaw nubs (rear of pastern) |
| 0.48 | 0.192 | Hock — **bone `shinL/shinR` origin** |
| 0.84 | 0.336 | Bottom of the hanging fist |
| 1.06 | 0.424 | Fist centre |
| 1.10 | 0.440 | Stifle — **bone `legL/legR` origin** |
| **1.15** | 0.460 | **`hips` origin — FROZEN** |
| 1.30 | 0.520 | **`torso` origin** |
| 1.34 | 0.536 | Lowest point of the barrel (belly) |
| 1.46 | 0.584 | **`forearmL/forearmR` origin** |
| 1.52 | 0.608 | Sacral crest (rump high point) |
| 1.66 | 0.664 | Bottom of the jaw / chin |
| 1.72 | 0.688 | **Nose pad centre** (x = +0.62) |
| 1.78 | 0.712 | Mouth line |
| 1.86 | 0.744 | Brisket point (x = +0.44) |
| **1.92** | 0.768 | **`armL/armR` origins (shoulder pivots)** |
| 2.00 | 0.800 | **Eye centres** (x = +0.44, z = ±0.185) |
| 2.06 | 0.824 | Deltoid crown |
| **2.12** | 0.848 | **`head` origin — the poll/atlas joint** |
| 2.20 | 0.880 | Poll (top of skull) |
| 2.26 | 0.904 | **Horn tips** (x = +0.92, z = ±0.575) |
| 2.40 | 0.960 | **Morrillo crown** (x = −0.02) — highest *body* point |
| 2.48 | 0.992 | **Tail apex** (x = −0.50) — highest point overall |

**The two rows that carry the whole design are `2.20` and `2.40`.** The top of the skull is **0.20 m below** the crest of the neck hump. That single relationship is "head lowered". Break it and you have a generic buff minotaur.

### Horizontal / mass table

| Measure | Value | / H | Notes |
|---|---|---|---|
| Shoulder width (deltoid outer to outer) | 1.28 m | 0.512 | The widest mass on the model |
| **Horn span (tip to tip)** | **1.15 m** | **0.460** | 0.90 × shoulder width; 2.74 × head width |
| Hip width | 1.02 m | 0.408 | 0.80 × shoulder — heavy, not human-narrow |
| Chest depth (sternum front → spine back) | 0.86 m | 0.344 | The deepest cross-section on the model |
| Flank depth (at the waist) | 0.60 m | 0.240 | A 30% taper from the chest |
| Neck width at the torso | 0.52 m | 0.208 | Tapering 35% to 0.34 m at the poll |
| Neck length (poll joint → withers) | 0.44 m | 0.176 | **0.88 head-heights — bovine necks are short** |
| Stance width (foot centre to foot centre) | 0.60 m | 0.240 | 0.47 × shoulder width |
| Head width (cheeks) | 0.42 m | 0.168 | |
| Head width (outer orbital rims) | 0.46 m | 0.184 | |
| Skull length (poll → nose tip) | 0.72 m | 0.288 | 1.44 × head height |
| Nose-pad forward reach past the chest front | 0.18 m | 0.072 | The muzzle *overhangs* the brisket |

### Where the mass sits

Three-quarters of the visual weight lives **above y = 1.30 and forward of x = 0**. Read from the side, the model is a wedge: thin and vertical at the legs, ballooning forward and upward through the chest and shoulders, cresting at the morrillo, then pouring down and forward into the skull. The hindquarters are heavy but *behind* the centre of mass, which is what makes the pose read as loaded and about to launch rather than standing.

The barrel is **deep, not wide**. Chest depth 0.86 against a torso lateral width of ~0.78 at the ribs — the cross-section is an upright oval, taller-and-deeper than it is broad. This is the difference between "bull" and "gorilla".

### Negative space — the shapes that actually define him

These are not decoration. At 128 px the eye reads holes before it reads forms. Four holes must survive:

1. **The throat wedge.** Because the skull hangs forward and down while the brisket stays back, there is an open triangular void under the neck — **0.30 m tall × 0.34 m deep**, bounded above by the underside of the jaw and the dewlap, behind by the chest front, and in front by the leash chain. *If the chin sinks into the chest and this void closes, the character reads as a generic hunched brute.* Guard it: minimum clearance from the chin's lowest point to the brisket's highest point is **0.22 m in every idle, walk, block and crouch pose.**
2. **The tail loop.** The crescent of empty sky enclosed between the tail's rising arc and the back line — roughly **0.55 m long × 0.22 m tall** above the rump. This is the shape that makes the *profile* read as the monument rather than as a cow.
3. **The horn Vs.** Two open triangles, one either side of the frontal plate, bounded by the horn's inner curve, the top of the skull, and the ear. Each is ~0.20 m across at the mouth. The horns must never lie flat against the skull.
4. **The leg inverted-V.** 0.34 m wide at the crotch, narrowing to 0.24 m between the hooves. Feet must never touch.

Secondary but valuable: the **0.10 m minimum gap between each hanging fist and the thigh** — arms welded to the body kill the read of a bipedal enforcer.

### What must survive at 128 px

In priority order. If you have to sacrifice, sacrifice from the bottom.

1. **The horn crossbar** — a wide, forward-canted bar at the top of the shape, clearly separated from the neck (which is only 0.34 m wide at that height, so the horns project 0.40 m clear on each side).
2. **The head below the shoulder line, pushed forward.** Not level. Not up.
3. **The morrillo hump** as the highest point of the body mass, sitting *behind* the head.
4. **The tail arc** and its loop.
5. **The shoulder block** — a wide, flat-topped rectangle 1.28 m across.
6. **The hoof wedges** — blunt, splayed, obviously not feet.
7. The dewlap keel breaking the throat line.

Everything else — the nose ring, the eyes, the visor chart line, the plaque, the shackle links, the molten seams — is a **1 m read**, and the growth rings, tool marks, casting seams and chips are a **30 cm read**. Do not spend silhouette budget on them.

---

## 3. Head construction

This is the most important section in the brief. The current head is a `0.52 × 0.44 × 0.46` box with a `0.36` muzzle box bolted to the front, two 0.06 nostril cubes, a visor bar, and **no eyes at all**. All of it goes.

Work in **head-local space**: origin at the `head` bone (the poll/atlas joint, world y 2.12), +X forward, +Y up, +Z lateral. Then wrap the entire skull assembly in a single `bent(head, rz, rx, ry)` static group so that the animated bone's bind pose is `(0,0,0)` and the skull hangs correctly. **Bind bend: `bent(head, +0.59, 0, 0)`** — i.e. the skull's long axis (poll → nose) points **34° below horizontal**. All clips key rotations relative to that, so nothing breaks.

### 3.1 The two planes

A bovine skull is not a box, it is **two planes meeting at a break**. Cattle skulls are pyramidal, shorter and broader than a horse's, with the frontal bone forming roughly **half the skull's total length** and carrying the horn cores at its caudo-lateral corners (see §10, veterinary osteology). Build exactly that:

**Plane A — the frontal plate (the shield).**
- A quadrangular slab: **0.34 m wide × 0.30 m long (front-to-back) × 0.09 m thick.**
- Occupies **0.42 of skull length**, from the poll forward.
- Slightly convex: crown the centre by **0.018 m**, falling away to the four corners.
- Its plane normal, in head-local space, tilts **35° above the head's forward axis**. Combined with the 34° bind bend, that means the plate faces **forward and very slightly up in world space** — it becomes the character's front-facing shield, and it is the plate an opponent hits.
- Bevel all four edges at **0.012 m**, three chamfer segments. Nothing on this head may read as a raw `BoxGeometry`.
- Between the horn bases sits a **raised intercornual ridge** — a 0.26 m wide × 0.05 m proud transverse swell, the highest bone landmark on the skull. Real cattle have a central intercornual protuberance here; ours is exaggerated 40% because it is what the polished rub mask keys off (§6).

**Plane B — the facial wedge (nasal + muzzle).**
- Tapers from **0.34 m wide at the eye line to 0.24 m at the nose pad**; **0.42 m long** (0.58 of skull length); **0.26 m deep at the eye line falling to 0.20 m at the nose**.
- Its dorsal line makes a **13° downward break with Plane A**. That break — the "stop" — sits directly between the eyes at 0.30 of skull length from the poll. **Do not build the profile as one straight line.** The break is the difference between a bull and a deer.
- Cross-section: a rounded-off trapezoid, wider at the top than the bottom, with the nasal bones forming a **shallow dorsal ridge 0.008 m proud** running the wedge's full length — the source anatomy describes bovine nasals as straight lengthwise but strongly curved side-to-side, so the top of the wedge is a gentle barrel, not a flat.
- Bevel 0.010 m.

Build both from `BoxGeometry` with `bevelSegments: 3`, or from a lathed/extruded profile — either is fine, but the **13° break must be a hard-ish crease with a 0.008 m fillet**, not a smooth blend.

### 3.2 Muzzle, nose pad, nostrils

- **Nose pad** (the planum nasolabiale): a forward-and-slightly-down-facing rounded pad, **0.22 m wide × 0.16 m tall**, bulging **0.05 m proud** of the wedge's front face. Section is a flattened dome — think a cushion, not a ball. This pad is one of the three rub-polished zones (§6) and it is the brightest single element on the head.
- **Nostrils**: two comma/kidney openings, each **0.075 m long × 0.045 m wide**, canted **35° from vertical** — the fat end of the comma inboard and high, the tail outboard and low.
  - Centres at **z = ±0.062 m** → inter-nostril gap **0.048 m**.
  - Each is a real **0.030 m deep cavity**, not a decal. That pair of black holes is what makes the muzzle read as a face at 1 m. Interior material near-black, roughness 0.30 (see §6).
  - Angry pose: nostril openings scale to **1.35×**, and the whole pad widens to **1.12× in Z**. The flare is a named property of the source monument ("its nostrils flare") — it must be an animatable state, not a fixed shape.
- **Philtrum**: a groove **0.014 m wide × 0.010 m deep** running from the nostril gap straight down to the upper lip.
- **Chin / mandible depth**: from the mouth line to the bottom of the jaw is **0.14 m**. The jaw is deep and square, and the masseter (cheek) mass swells **0.05 m proud** at z = ±0.19, y = −0.06 head-local. That cheek mass is the jiggle target in §8.

### 3.3 Mouth

- Closed mouth width **0.20 m** = **0.48 × head width**, corners at z = ±0.10.
- **Corner direction: down-turned 8°.** Not a frown, a set line.
- Visible slot is 0.20 m; a **6 mm crease continues 0.09 m back on each side** to a point below the eye. Bovine mouths are long; showing only the front third is the stylisation.
- Lower lip projects **0.03 m** proud of the upper. Upper lip overhangs it by 0.008 m at the centre, creating a shadow line.
- Openable to **0.14 m** at the chin for bellow/KO. Build a real jaw: a separate mandible solid under a 0.010 m gum shell, hinged at z = ±0.17, x = −0.10 head-local. It does **not** need a bone — animate it via the `head` mesh subtree with a small pivot group, since no clip keys it.
- **Teeth**: cattle have no upper incisors. Build **6 lower incisors only** (0.022 m wide each, `bone` preset) and a **dental pad** where the uppers would be — a smooth ridge in `skin` roughness 0.55. This is a genuine, cheap, high-specificity bovine cue that almost nobody gets right.
- **Tongue**: a 0.10 m tapered slab, only visible in taunt and KO, `skin-wet` roughness 0.24.

### 3.4 Eyes — build these properly, there are currently none

Bovine eyes sit **laterally and high**, at the caudo-lateral corner of the frontal plate, ringed by a bony orbit that stands proud of the skull.

| Property | Value | Ratio |
|---|---|---|
| Eyeball diameter | **0.072 m** | **0.171 × head width** |
| Eye centre height | y = +0.36 head-local | **0.72 of head height** from the chin |
| Eye centre, fore-aft | 0.30 of skull length back from the nose-end of Plane A | sits exactly at the 13° break |
| Eye centre, lateral | **z = ±0.185 m** | inter-ocular **0.37 m = 0.88 × head width** |
| Orbital rim outer diameter | **0.115 m** | **0.27 × head width**, 1.60 × eyeball |
| Orbital rim proud of skull | **0.022 m** | |
| Optical axis divergence | **38° off midline** | anatomically it would be ~58°; see deviation note |
| Iris diameter | **0.045 m** | 0.62 × eyeball |
| Pupil | **0.030 m × 0.010 m horizontal slit** | 3:1, rounded ends |

**The orbital rim is what reads, not the eye.** At 128 px the eyeball is 3 px. The proud bony ring around it — catching a rim light on its upper-outer arc — is 5 px and holds the read. Build the rim as a **torus segment, 250° of arc, open at the medial-lower corner**, with a 0.006 m fillet where it meets the frontal plate.

**Deliberate cheat on the axis.** Real cattle eyes point almost laterally (near-360° vision). At 58° divergence, our game camera never sees both eyes and the character cannot look at its opponent. We rotate them inward to **38°**, a 20° cheat. This is also a §9 deviation. Do not go below 32° — at that point he reads as a predator, and the whole prey-animal-turned-predator joke evaporates.

**Layer stack per eye** (outside → inside):
1. **Cornea**: sphere cap, radius 0.038, 130° of arc, `glass` preset, roughness 0.04, clearcoat 1.0, transmission 0, `envMapIntensity 1.6`. One crisp specular dot.
2. **Iris**: a disc at 0.008 m inset, `emissive(BULL_EYE_IRIS, 1.1)` — *faint*. This is a heat glow from behind, not a headlight. Radial fibre striation in the normal map, 40 spokes.
3. **Pupil**: the horizontal slit, `BULL_EYE_PUPIL`, flat.
4. **Sclera**: the remaining eyeball, `BULL_EYE_SCLERA`.
5. **Lids**: two 0.008 m thick shells sharing the eyeball's curvature, sliding on it. Rolled 0.004 m lid margin. Upper lid carries **7 tapered lash slivers** (0.012 m, 25° from the margin) — a real and very visible bovine trait, and it costs nothing at 30 cm.

**Lid coverage by state** — these are the numbers, use them:

| State | Upper lid covers | Lower lid covers | Sclera crescent |
|---|---|---|---|
| Idle | **32%** | 15% | 0.006 m, inner corner only |
| Angry / armor | **12%** | 8% | **0.016 m, all round** |
| Hurt | 68% | 22% | 0.010 m |
| KO | **90%** (a slit — never fully closed) | 30% | 0 |
| Taunt | 20% | 12% | 0.012 m |

Visible white sclera all round is a genuine bovine stress/aggression signal. Use it as the anger tell.

### 3.5 Brow — there isn't one, and that's the point

Cattle have no mobile human brow. **Do not build eyebrow ridges that slant.** Emotion comes from three mechanisms:

1. **The frontal furrow pair.** Two vertical grooves between the eyes, **0.18 m long × 0.008 m deep × 0.012 m wide**, converging downward at 14° so they nearly meet above the stop. In anger they deepen to **0.016 m** and the convergence tightens to 8°. Drive this with a blendshape or a bone-free vertex morph — or, cheapest, two thin recessed slabs that slide 0.006 m deeper.
2. **The orbital rim tilt.** The *medial* (inner) end of each orbital rim drops **0.020 m** in anger, rotating the ring 9°. This is the closest thing a bull has to a scowl, and it works.
3. **The supraorbital groove.** A shallow 0.006 m channel running from above each eye back toward the horn base — a real skull feature (supraorbital foramen and its groove). It catches shadow and does most of the "heavy brow" work for free.

### 3.6 Ears

Currently 0.11 m squashed spheres. They must become **paddles**.

- **Length 0.20 m, width 0.11 m at the widest point (0.55 aspect), tapering to a rounded point.** Widest point at 40% of length from the base.
- Thickness **0.018 m at the base → 0.008 m at the tip**, with a 0.006 m rolled edge all round.
- **Concha hollowed 0.020 m deep**, an oval cup occupying the basal 60%, with a fringe of 9 short hair slivers (0.014 m) at the cup's rim. On a bronze statue these read as cast tufts — keep them.
- **Set: below and behind the horns.** Base at head-local **y = +0.15, z = ±0.20, x = −0.06** (i.e. 0.06 m behind the poll joint).
- **Bind orientation: 78° lateral, 12° down, 20° caudal (back).** Horizontal-ish paddles sticking out sideways, not vertical rabbit ears.
- Bones `earL`/`earR` already exist and are `SECONDARY_BONES` — they are dismemberment targets and spring-follow targets. Model the base so a torn stump looks like a snapped bronze casting (a bright fracture face, §7).
- **Pinning is the anger tell**: in angry/armor states, rotate **46° caudally and 20° down** and *freeze the spring* (set the spring target and raise damping to 0.9). Pinned ears on a bull is a real, instantly-read aggression signal and it costs two numbers.

### 3.7 Horns — the single most important geometry on the model

Current: one cylinder plus one 5-sided cone per side. That is not a horn. Rebuild.

**Placement.** Bases at the **caudo-lateral corners of the frontal plate**, head-local **z = ±0.16, y = +0.24, x = −0.04**. They emerge from the top-rear corners of the shield, not from the sides of the head.

**Gauge.** Base diameter **0.085 m**, tapering to a **0.010 m tip**. In taurine breeding vocabulary this is **cornigordo** (thick-based) with an **astifino** (fine, sharp) tip, and a wide, well-separated **veleto**-leaning span. It must never be **gacho** (drooping). Those are real typology terms from Spanish fighting-bull breeding (§10) and they are the fastest way to describe what we want.

**Cross-section is not circular.** An oval at **1.25:1**, long axis vertical at the base, rotating smoothly to **horizontal at the tip**. That 90° twist along the length is what makes a horn look grown rather than turned.

**The curve — three segments, total arc length 0.62 m per horn:**

| Segment | Length | Direction change | Notes |
|---|---|---|---|
| 1 — base (*mazorca*) | 0.20 m | grows **82° lateral, 8° up, 0° forward** | almost straight out sideways |
| 2 — mid (*pala*) | 0.24 m | swings **55° toward +X** and lifts **30°** | this is the sweep |
| 3 — tip (*pitón*) | 0.18 m | continues forward, lifts to **45° above horizontal**, converges **inward 12°** | tips point slightly at each other — goring geometry |

**Resulting endpoints (world, bind pose): tips at `x = +0.92, y = 2.26, z = ±0.575`.** That is **0.30 m forward of the nose pad** and **0.06 m above the poll**, span **1.15 m**.

That forward reach is the geometric reason the horns clear the body outline in *every* camera angle except dead-on rear. It is not optional.

**Construction.** Best: a `TubeGeometry` on a 4-point Catmull-Rom curve (poll corner → seg-1 end → seg-2 end → tip), **radial segments 10**, **tubular segments 24**, with a custom radius function applying the taper and the section-oval twist. Acceptable fallback: three tapered `CylinderGeometry` segments blended by a sphere at each joint — but then you owe a **0.006 m fillet ring at each joint** so no seam shows. `GRAPHICS_CONTRACT.md` §0.4 forbids interpenetrating primitive seams.

**Micro-detail that sells it:** **7 growth rings** on the basal 0.20 m — shallow toroidal ridges **0.003 m proud**, spacing decreasing from 0.032 m near the skull to 0.018 m toward the pala. Real horn has annual growth rings and this reads at 30 cm. Below them, a **0.010 m fillet collar** where horn meets skull, with the hide visibly rolling up onto the horn base by 0.015 m — a horn that just pokes out of a hole reads as glued on.

**Tip colour**: the last 0.06 m goes to `BULL_HORN_TIP` (near-black). Real horn tips darken, and a dark point on a polished bronze horn is what makes the point *look sharp* at distance.

### 3.8 Nose ring

Real bull rings are **8–13 cm in diameter**, made from aluminium, stainless or copper as **a pair of hinged semicircles held shut by a small brass bolt**, and are set through the **nasal septum** (§10). Build exactly that, scaled to the boss.

- **Torus: major radius 0.055 m (110 mm diameter — top of the real range), minor radius 0.011 m.** 20 tubular × 10 radial segments.
- Pierces the septum at the **midline**, **0.020 m above the bottom edge of the nose pad**. Hangs in the **XY plane** (facing sideways), so from the game's 3/4 camera you see the ring as a full circle. This matters — a ring seen edge-on is invisible.
- **The bolt is the detail that makes it read as cattle hardware and not jewellery.** At the ring's 6-o'clock position: a **0.016 m boss** with a visible **hex-head bolt, 0.012 m across flats**, plus a faint **hinge line** at 12 o'clock (a 0.002 m groove).
- Material is a **different alloy from the body** (§5/§6). If the ring is the same bronze as the nose, it disappears.
- **The nose ring is NOT a Gore accessory.** It stays on. Losing it kills the parody. Put it on a small unnamed pivot under the skull's `bent` group with its own **2-DOF spring swing** (pitch about Z, roll about X), damping 0.18, max ±22°. It must swing on every head move. That swing is the best cheap "this thing is heavy and alive" cue on the model.

### 3.9 Neck, morrillo, dewlap

These are **torso** meshes, not head meshes, and they are the reason the head reads as lowered.

- **Neck**: a truncated cone from the torso to the poll joint. **0.52 m wide × 0.58 m deep at the base → 0.34 m wide × 0.40 m deep at the poll.** Length 0.44 m along its axis, which leaves the torso at **40° forward-and-down** from vertical. Add **4 transverse skin folds** on the ventral side, 0.02 m proud, spaced 0.09 m — a thick-necked bull has rolls.
- **Morrillo (the crest hump)** — the muscle mass over the neck and shoulders that dilates when the animal is excited, and the single most characteristic feature of a fighting bull's outline (§10). Ours:
  - A domed mass sitting on top of the neck-shoulder junction, **0.54 m wide × 0.46 m long (X) × 0.28 m tall**, crown at world **y = 2.40, x = −0.02**.
  - Cross-section is a **skewed dome** — steeper on the front (falling 0.28 m over 0.16 m toward the poll) and shallower on the back (falling 0.28 m over 0.30 m toward the withers). The steep front face is what makes the head look like it has been driven down beneath it.
  - Give it a **shallow dorsal midline groove, 0.012 m deep**, splitting it into left and right lobes. Every heavy neck has one and it catches the rim light.
  - **Angry state: scale the crown up 8% in Y** (dilation is a documented behaviour). A boss whose neck swells when he powers up is a free, anatomically-correct AAA touch.
- **Dewlap** — fighting bulls carry a small-to-medium dewlap; ours is medium and it is the throat-line breaker.
  - A pendulous keel running from **0.10 m behind the chin to the brisket**, total length **0.52 m**, hanging **0.16 m below the neck line at its deepest** (mid-throat).
  - Section: a vertical blade, **0.08 m thick at the throat widening to 0.14 m at the brisket**, with a 0.012 m rolled bottom edge.
  - **3 major transverse folds**, ridges 0.03 m proud, spaced 0.11 m.
  - Spring secondary (§8) — the slowest-settling thing on the model.

---

## 4. Body & limb proportions

### 4.1 Torso

- **`torso` bone origin stays at hips-local `(0, 0.15, 0)` → world y 1.30.**
- Chest: an upright oval prism, **0.86 m deep (X) × 0.78 m wide (Z)** at the deepest, centred at world y ≈ 1.80. Deep, not wide — see §2.
- The **brisket** (the forward point of the chest below the neck) projects **0.10 m past the shoulder front**, at world y 1.86, x +0.44. It is a distinct forward-pointing keel with a 0.03 m ridge down its centre, and it is the anchor the throat wedge is measured against.
- Taper to the flank: **0.60 m deep × 0.66 m wide** at the waist (y ≈ 1.55) — a **30% depth taper**. Then flare back out into the pelvis.
- **Belly**: the lowest point of the barrel at y = 1.34, with a shallow sag. Not a gut — this is a working animal — but a 0.04 m soft-body jiggle target.
- **Topline**: not straight. From tail to poll: sacral crest at **y 1.52** → a shallow loin dip to **1.48** → a rise across the ribs → the **morrillo crown at 2.40** → a steep drop forward to the poll at 2.12. Build this as a real spline, not a flat plane.
- **Pelvis / rump**: two rounded gluteal masses either side of a **0.05 m deep central groove**, hip width 1.02 m. The tail root emerges high, between them.

### 4.2 Shoulders and arms

| Element | Value | Ratio |
|---|---|---|
| Shoulder pivot height | y = 1.92 | 0.768 H |
| Shoulder width (outer to outer) | 1.28 m | 0.512 H |
| Deltoid ball radius | 0.24 m | |
| Upper arm length (shoulder → elbow) | **0.46 m** | 0.184 H |
| Forearm length (elbow → wrist) | **0.42 m** | 0.168 H |
| Fist mass (X × Y × Z) | 0.30 × 0.26 × 0.32 | |
| Total arm reach (pivot → fist bottom) | **1.08 m** | **0.432 H** |

- `armL/armR` origins stay at torso-local `(0.02, 0.62, ±0.60)`. `forearmL/R` move from −0.46 to **−0.46** (unchanged) — the length change is in the mesh, not the pivot. **Do not move these pivots**; the move scripts' reach constants are tuned to them.
- **Shoulders roll forward 12°** and **elbows sit out 14°** — you cannot hang arms flat against a 0.86 m deep chest. Fists end slightly ahead of the hips.
- Upper arm: a tapered cylinder 0.19 → 0.16 radius, with a **modelled triceps mass** swelling to 0.21 on the caudal side at 60% of length. Sleeve the shoulder joint with the deltoid ball so no gap can open (§0.4).
- Forearm: 0.16 → 0.13, oval section 1.3:1 (deeper in X).

### 4.3 Hands — they are hooves

**The boss does not have fists. He has cloven hooves that close into fists.** This is the best single idea available for this character's hands and it must be built.

- Core mass: a **bevelled box 0.30 (X) × 0.26 (Y) × 0.32 (Z)**, bevel **0.05 m**, 4 segments — heavy, rounded, no readable knuckles.
- The **striking face is split by a vertical cleft, 0.024 m wide × 0.10 m deep**, running the full height of the front face.
- Flanking the cleft: **two claw plates**, each **0.14 (X) × 0.20 (Y) × 0.13 (Z)**, in hoof-keratin surfacing (§6), projecting 0.03 m proud. These are the contact surfaces and they take the impact scuffing.
- **Asymmetry**: the outer claw is **8% larger** than the inner. Real cattle claws are unequal; the asymmetry reads as organic.
- On the ulnar (little-finger) side, **two dewclaw nubs** — rounded cones 0.05 m long — set 0.10 m back from the striking face. Small, weird, and instantly bovine.
- Wrist: sleeve the forearm/fist junction with a **0.05 m collar** so `Gore._detachForearm` leaves a clean bronze stump.

### 4.4 Legs and hooves

| Element | Value |
|---|---|
| Thigh length (hip → stifle... i.e. `legL` mesh) | 0.62 m, radius 0.24 → 0.20 |
| Quadriceps bulge | swells to 0.28 radius at 0.18 m below the hip |
| Cannon / shin length | 0.42 m, radius 0.17 → 0.13, **oval section 1.4:1 (deeper in X)** |
| Fetlock bulge | sphere r 0.10 at y 0.26 |
| Hoof | 0.34 (X) × 0.18 (Y) × 0.30 (Z) |
| Stance width | 0.60 m (foot centres at z = ±0.30) |
| Toe-out | 12° |

**Hoof construction** — currently a box plus a "split ridge" bar. Replace:

- The hoof is **two claws**, split by a **0.028 m wide × 0.10 m deep cleft** running the full length of the front and continuing 0.06 m up the dorsal face. Inner and outer claw differ by **8%** in size.
- **Toe wall angle 48° from horizontal at the front** (real bovine hoof angle sits in the 45–52° band). Get this wrong and the foot reads as a boot.
- **Heel bulbs**: two soft rounded pads at the rear, radius 0.09 m, in a distinctly softer/darker material (§6). They are the only compliant-looking thing on a bronze character and the contrast sells the weight.
- **Coronary band**: a **0.012 m raised ring** where hoof meets leg, with the hide/patina visibly overhanging it by **0.02 m**. This is the equivalent of the horn's fillet collar — it stops the hoof reading as a shoe.
- **Dewclaws**: two 0.05 m nubs on the rear of the pastern at y = 0.30, z = ±0.06.
- Sole: **concave**, 0.015 m dished. It shows on jump/fall/knockdown frames.

### 4.5 Posture

The pose is the second half of the parody, after the head.

- **Pelvis tips forward 8°.** **Torso leans forward 14° from vertical.** Together, the centre of mass sits **0.06 m ahead of the foot midpoint** — permanently about to fall forward, permanently loaded.
- The **neck leaves the torso at 40° forward-and-down**; the **head bind bend adds 34°**. Net: the muzzle finishes **0.62 m forward of the chest centre** and **0.28 m below the shoulder pivot**.
- **Head carriage: the poll is 0.20 m below the morrillo crown.** In every idle, walk, block and crouch frame. The head only comes up in **taunt** and in the **win** clip — and it comes back down at the end of both, which is the joke.
- Arms hang with a 14° elbow flare, forearms slightly ahead of the hip line, fists at y 1.06.
- Feet: **flat, planted, 12° toe-out, 0.60 m apart.** Never a narrow stance, never a heel lift. He does not have a light foot.
- **Weight distribution is 58% rear / 42% front** in idle — visible in the hip position, not in the feet. The statue's coil comes from loaded haunches.

---

## 5. Colour script

The current palette is wrong in one specific, load-bearing way: `hide: 0x33363d` is a **blue-grey**. Blue-grey reads as *painted metal*, not as *aged bronze*, and it does not separate from the game's dark arenas. **The base hide must be green-black.** That single hue shift does more for the parody than any geometry change below the neck.

All albedo values obey `GRAPHICS_CONTRACT.md` §0 (**sRGB 30–240, never pure 0 or 255**). **Emissive colours are exempt** — they are radiance, not albedo, and are listed separately.

### Albedo

| Name | Hex | sRGB | Rel. luminance | Use |
|---|---|---|---|---|
| `BULL_HORN_TIP` | `#221F17` | 34,31,23 | **~1.4% — darkest on the model** | Last 0.06 m of each horn; hoof cleft interior; nostril cavities |
| `BULL_PATINA_DEEP` | `#1E2621` | 30,38,33 | ~1.8% | Deepest crevices: under the barrel, inside dewlap folds, neck fold roots, behind the elbows, the orbital rim's inner shadow |
| `BULL_PATINA_BASE` | `#2E3A31` | 46,58,49 | ~3.8% | **The hide. ~60% of the model's surface.** Dark green-black bronze patina, hue ≈ 145°, chroma deliberately low |
| `BULL_PATINA_MID` | `#4A5A46` | 74,90,70 | ~9.5% | Broad convex flanks, shoulder sides, rump, thigh outers — where the patina lifts toward the light |
| `BULL_TIE_OXBLOOD` | `#77202B` | 119,32,43 | ~4.4% | The necktie blade. The only saturated red on the model |
| `BULL_VERDIGRIS` | `#4E7A5C` | 78,122,92 | ~16% | Chalky green corrosion streaks, gravity-aligned, running down from every crevice |
| `BULL_SHACKLE` | `#4A4238` | 74,66,56 | ~6% | Wrist/ankle shackle bands and their links — a rusted iron, distinctly **warm-neutral, not green**, so the restraints separate from the hide |
| `BULL_RING_ALLOY` | `#8A7048` | 138,112,72 | ~17% | Nose ring, leash chain, plaque field, jacket buckles — a **different, duller alloy** from the body bronze |
| `BULL_BRONZE_RUB` | `#B08542` | 176,133,66 | ~26% | **The burnished bronze.** Nose pad, horn upper surfaces + bases, frontal-plate crown, both deltoid crowns, knuckle claw plates, hoof crowns |
| `BULL_BRONZE_HOT` | `#E8B463` | 232,180,99 | **~48% — lightest on the model** | Extreme crowns only: the top ~15% of each rubbed area, plus every **fresh fracture face** (torn shackle links, ear/tail stumps, chips) |
| `BULL_CRACK_HALO` | `#8C3A16` | 140,58,22 | ~7% | A 0.03 m band of heat-glazed metal around every molten seam — the albedo that fakes subsurface heat |
| `BULL_EYE_SCLERA` | `#C6BCA8` | 198,188,168 | ~48% | Warm bone-white, never pure |
| `BULL_EYE_IRIS` | `#E8952B` | 232,149,43 | ~34% | Molten amber |
| `BULL_EYE_PUPIL` | `#1E1A14` | 30,26,20 | ~1.1% | Horizontal slit |
| `BULL_VISOR_GLASS` | `#C9E9F2` | 201,233,242 | ~76% (glass, not opaque) | Visor lens face, base costume |
| `BULL_PLINTH_STONE` | `#6E6A63` | 110,106,99 | ~14% | Granite plinth fragments fused to the rear hooves |

### Emissive (exempt from the 30–240 albedo rule)

| Name | Hex | Intensity | Use |
|---|---|---|---|
| `BULL_MOLTEN` | `#FF5A1E` | `emissive(..., 2.4, 'neon-panel')` | The seam network. Base emissive for every material in `markMats` |
| `BULL_MOLTEN_CORE` | `#FFD48A` | 3.6 | ~5% of crack area — the hottest thread down the centre of the widest seams |
| `BULL_VISOR_EM` | `#2FA8C8` | 1.8 | Visor lens, **base costume** — cold cyan |
| `BULL_VISOR_EM_UN` | `#FF6A3A` | 2.6 | Visor lens, **UNCHAINED** — molten |
| `BULL_IRIS_EM` | `#E8952B` | 1.1 | Iris. Faint. A heat glow from behind, not a headlight |

### Rim light

| Name | Hex | Notes |
|---|---|---|
| `BULL_RIM` | `#8FD8FF` | **Cold cyan-white.** |

The rim colour is a considered choice, not a default. The body is green-black; the hero emissive is orange. A green rim vanishes into the hide; a warm rim vanishes into the cracks. A **cold cyan-white** rim is the only family that separates from both, and it holds against every arena in `GRAPHICS_CONTRACT.md` §10 — it cuts through `sunset-stadium`'s orange, reads as a cold edge against `reserve-core`'s emissive vault glyph, and is the correct temperature for `subway-tunnel` and `arctic-day`. Rim intensity 1.4, wrap 0.25, exponent 3.2, applied hardest along the **morrillo crown, the horn upper curves, the shoulder tops and the tail arc** — i.e. exactly the silhouette elements from §2.

### Value structure — this is what makes him read against a busy arena

The model is deliberately **compressed into the bottom third of the value range**, with a small number of bright accents. Lightest albedo (`BULL_BRONZE_HOT`, ~48%) to darkest (`BULL_HORN_TIP`, ~1.4%) is a **34:1 luminance ratio**, but **86% of the surface area sits below 10% luminance**. The consequence: in any arena, the Blackish Bull is a **dark hole with bright edges**. He is not competing with the background on colour — he is competing on *contrast placement*. The bright bronze rubs are all on the silhouette-defining features (horns, nose, shoulders, knuckles, hoof crowns), so the eye is dragged straight to the read cues.

Ordering, darkest → lightest:
`HORN_TIP` < `PATINA_DEEP` < `EYE_PUPIL` < `PATINA_BASE` < `TIE_OXBLOOD` < `SHACKLE` < `CRACK_HALO` < `PATINA_MID` < `PLINTH_STONE` < `VERDIGRIS` < `RING_ALLOY` < `BRONZE_RUB` < `EYE_IRIS` < `BRONZE_HOT` ≈ `EYE_SCLERA` < `VISOR_GLASS`.

### Costume variants (`buildModel(costume)` must keep working)

- **Costume 0 — "PATINA"** (default): the palette above. Cyan visor. Shackles closed and intact, their chains disappearing into the jacket. Dark trim. **The nose ring is present** — the current code only builds it in costume 1, which is a bug against the parody mandate. Fix it.
- **Costume 1 — "BULL MARKET"** (gilded): `BULL_BRONZE_RUB` → real `gold` preset; **verdigris removed entirely** (freshly restored monument); trim gold; visor emissive shifts to amber `#E8B45A`; nose ring and leash chain in gold. Same geometry, different surfacing. The joke is that somebody has had him polished.
- **UNCHAINED** (`opts.unchained`): jacket off; all four shackle chains **snapped** with bright `BULL_BRONZE_HOT` fracture faces; seam network expanded to the full torso; visor emissive → `BULL_VISOR_EM_UN`; `group.scale = 1.15` (already implemented — keep `baseScale` in `userData`, `maxLeverageScript` reads it).

---

## 6. Surfacing

Presets from `GRAPHICS_CONTRACT.md` §3 (`surfaceMaps(kind, opts)`) and §4 (`pbr(color, preset, overrides)`). Note that `src/render/materials.js` and `src/render/textures.js` are **foundation-agent deliverables that do not exist yet** — the current file uses `MeshLambertMaterial` via a local `lamb()` helper. Do not ship flat Lambert. Either wait for the foundation modules or write against the contract's signatures and stub them.

### The central surfacing idea

**Everything on this character is one material — bronze — differentiated only by roughness and by where hands have touched it.** Do not solve this with 15 hand-authored albedo textures. Solve it with **one curvature mask**, generated by the contract's `curvatureFromHeight()` from the body height map, driving:

- **Roughness**: convex crowns → **0.14**; flat mid-surfaces → 0.52; concave crevices → **0.84**.
- **Albedo blend**: convex crowns → `BULL_BRONZE_RUB`; mid → `BULL_PATINA_MID`; crevices → `BULL_PATINA_DEEP`.
- **Verdigris mask**: a second, gravity-directional streak layer applied *only* below crevice pixels, fading over 0.20–0.40 m.

That is the entire look of a rubbed public bronze, and it is physically why the real thing looks the way it does: hands reach the crowns, weather sits in the hollows. **Do not hand-paint the rub mask.** Hand-painting produces a distribution that reads as "camouflage"; curvature produces one that reads as "thirty years of tourists".

### Region table

| Region | `surfaceMaps` kind | `pbr` preset | Behaviour |
|---|---|---|---|
| Hide (all body, neck, limbs) | `metal-rusted`, scale 0.7, `wear: 0.55` + `triplanarDetailNormal(2.4)` | `metal-rough` | metalness **0.85**, roughness **0.52 with ±0.26 spatial variance** driven by the curvature mask. `normalScale 1.15`. `envMapIntensity 1.3` |
| Rubbed / burnished zones | `metal-polished`, scale 1.0 | `metal` | metalness **1.0**, roughness **0.14**, `envMapIntensity 1.5`. Near-mirror. **The contrast against the 0.84-rough crevices is the whole surfacing design** |
| Verdigris streaks | `concrete`, scale 0.5, `tint: BULL_VERDIGRIS` | `stone` | metalness **0.35**, roughness **0.88** — the **roughest thing on the model**. Verdigris is a powder sitting *on* metal, not a metal |
| Horns | `horn`, scale 1.2 (growth rings) | `metal` | roughness **0.22 on the outer curve, 0.55 in the ring grooves**. metalness 1.0. Tip section drops to roughness 0.34 with `BULL_HORN_TIP` albedo |
| Hoof wall + claw plates | `metal-rough`, scale 0.9, `wear: 0.8` | `metal-rough` | roughness 0.62. Crown of each claw gets the rub treatment (0.16) — hooves polish against the floor |
| Heel bulbs | `rubber` | `rubber` | roughness **0.92**, metalness 0.0 — **the softest, deadest surface on the model.** The one non-metal read, and it sells the weight of every landing |
| Molten seams | — | `emissive(BULL_MOLTEN, 2.4, 'neon-panel')` | Plus the `BULL_CRACK_HALO` albedo band at roughness **0.35** around each seam — heat-glazed metal. This "warm albedo ring around the emissive" trick is the standard technique for faking subsurface heat (§10) and it is what stops the cracks reading as glowing stickers |
| Jacket | `leather`, scale 1.1, `wear: 0.6` | `leather` | roughness **0.62**, with a **0.30-roughness wear patch** on each shoulder crown and along the front edges |
| Visor frame | `metal-brushed` | `metal` | roughness 0.28, metalness 1.0 |
| Visor lens | — | `glass` | roughness **0.05**, transmission 0.0, clearcoat 1.0, **`iridescence: 0.35`, `iridescenceIOR: 1.8`** — a thin-film oil-slick shift as the camera moves. This is the highest-value-per-line AAA tell available on this character |
| Nose ring, leash chain, buckles, plaque field | `metal-brushed`, `tint: BULL_RING_ALLOY` | `metal` | roughness **0.30**, metalness 1.0. **Must read as a different alloy from the hide** — duller, warmer, less green |
| Shackle bands + links | `metal-rusted`, scale 1.4, `wear: 0.9` | `metal-rough` | roughness **0.74**, metalness 0.80. Rusted and neglected |
| Fresh fracture faces (broken links, chips, gore stumps) | `metal-polished` | `metal` | roughness **0.09**, `BULL_BRONZE_HOT`. **The shiniest thing on the model** — fresh metal has no patina, and that is the whole visual logic of "unchained" |
| Necktie blade | `cloth-weave`, scale 1.4 | `cloth` | roughness **0.84**, `sheen 0.30`. The only woven surface — it must look absurdly soft next to a tonne of bronze |
| Sclera | `skin-smooth` | `skin` | roughness 0.32 |
| Cornea | — | `glass` | roughness **0.04**, clearcoat 1.0, `envMapIntensity 1.6`. One crisp specular dot per eye |
| Iris | — | `emissive(BULL_EYE_IRIS, 1.1)` | Radial fibre normal, 40 spokes |
| Nostril + mouth interiors | `skin-smooth` | `skin` | roughness 0.30, albedo `BULL_HORN_TIP`. Near-black cavities — the only true holes on the model |
| Teeth / dental pad | `bone` | `bone` | roughness 0.30, clearcoat 0.12 |
| Tongue | `skin-smooth` | `skin-wet` | roughness **0.24** |
| Plinth fragments | `granite`, scale 0.8 | `stone` | roughness 0.86, metalness 0.0 |

### How the surface must behave under light

- **`envMapIntensity` is this character's superpower — use it.** He is metal. He should *reflect the arena*. Body 1.3, polished zones 1.5, visor 1.6. In `bullMarketColosseum` (`sunset-stadium`), the low sun must draw a **hot moving streak along the top of the morrillo and up the outer curve of each horn** as he turns. In `permanentReserveCore`, the emissive vault glyph must appear as a coloured smear across his shoulder. If his reflections are static, he is not metal.
- **Roughness variation is mandatory.** A flat 0.52 across the body is the #1 tell of hobby work. Drive it from the curvature mask, not from noise.
- **Fresnel edge lift.** Use the contract's `gradientRamp` LUT to lift the grazing edge by **0.18**. A dark bronze only reads as volumetric when its silhouette edge catches. Without this, at 128 px he is a black blob.
- **Never wet.** Not in `liquiditySwamp`, not after a slide, not ever. Water on bronze reads as plastic, and a wet boss reads as a *state* rather than a design. The only sub-0.30-roughness surfaces on the whole model are the cornea, the tongue, the visor lens, the polished rubs and fresh fractures.
- **No anisotropy.** Cast bronze isn't brushed. The one exception is the brushed-alloy ring/chain/plaque family, which may take a mild anisotropic hint if the material factory supports it.
- **Bloom discipline** (§0.3 — bloom only blooms real emitters). On this character exactly four things bloom: molten seams, visor lens, iris, and the impact sparks. The polished bronze must **not** be pushed into bloom — it is a bright specular, not a light source. If the shoulders are blooming, `envMapIntensity` is too high.

### Micro-detail that sells it (30 cm read)

1. **Sculptor's tool marks.** Broad, shallow facet planes across every large mass — **0.06–0.12 m across, 0.004 m deep**, following the muscle flow, not aligned to a grid. Put these in the **normal map via `triplanarDetailNormal`**, never in geometry. This is the single detail that says "this is a modelled bronze" rather than "this is a shiny robot", and it is nearly free.
2. **Casting seams.** Monumental bronzes are cast in sections and welded. Run a **0.006 m proud seam line** down the outside of each thigh, up the back of each upper arm, and along the ventral midline of the barrel, with **3 irregular chase/weld blobs** (0.02 m) where the seam was dressed back by hand.
3. **Horn growth rings** — 7 per horn, spec'd in §3.7.
4. **Nostril cavities** — 0.030 m deep, spec'd in §3.2. The only true black holes on the model.
5. **Verdigris runs** — **14 gravity-aligned streaks**, 0.01–0.03 m wide, each starting under a crevice and fading over 0.20–0.40 m. Baked into the limb's own texture (so they rotate with the limb — correct, that is how a statue's streaks work).
6. **Chip damage, asymmetric.** Exactly **3** places where the patina has been knocked off, exposing raw bright bronze at roughness 0.09: one on the **left** horn's mid-curve (0.04 m), one on the **right** hip crest (0.05 m), one on the **left** side of the muzzle (0.03 m). Never mirror them.
7. **Coronary-band hair overhang** — 0.02 m of hide rolling over each hoof, and the matching 0.015 m roll at each horn base. Both stop the hard parts reading as glued-on props.
8. **Pigeon streaks.** Two pale 0.01 m streaks on the rump. This is the comedy detail, it costs one texture, and nothing else in the game says "public monument" so fast. Recommended, not mandatory.

---

## 7. Signature props & wardrobe

Every prop hangs off a **bone**, never off `group` — `Gore._detach()` clones a bone's subtree, and anything on `group` will float in the air when the body is torn apart. Props that Gore may pop must use a name from `ACCESSORY_BONES`. Props on non-detachable bones must be modelled so a **stump** still looks right.

### 7.1 The nose ring — bone: none (fixed under the skull)

Spec'd fully in §3.8. **Not detachable.** Own 2-DOF spring, damping 0.18, max ±22°. The single highest-value prop on the model per polygon spent.

### 7.2 The leash-necktie — bone: `tie`, child of `head`

The joke in one object: the thing on the end of a bull's nose-ring lead is a corporate necktie.

- **Chain**: **9 real toroid links**, major radius 0.035, minor radius 0.011, alternating 90° in plane, hanging from the ring's bottom arc. Total drop 0.42 m. `BULL_RING_ALLOY`.
- **Knot**: a proper four-in-hand knot solid at the chain's bottom — a bevelled wedge **0.09 (X) × 0.10 (Y) × 0.07 (Z)** with a visible dimple and a 0.012 m fold rolling over the top. `BULL_TIE_OXBLOOD`.
- **Blade**: a tapered trapezoid **0.22 m long, 0.05 m wide at the knot → 0.09 m at the tip**, thickness 0.014 m, with a **pointed 45° tip** and a **0.008 m rolled edge** all round. Slight twist along its length (6°) so it never reads as a flat card.
- **Critical**: the entire assembly hangs off the head, not the chest. Do **not** try to run the chain from the nose to the sternum — that crosses a bone boundary and will tear open on every head turn.
- Spring: 3 sub-segments, stiffness 30, damping 0.22, max swing 35°. It must swing across the chest on every dash and **lag behind on every stop**.
- Gore: pops at the 70% accessory threshold. Losing the tie is a good beat — he gets *more* animal as he takes damage.

### 7.3 The visor — bone: `glasses`, child of `head`

- A **wraparound band**: a torus segment, major radius **0.26 m, arc 130°**, cross-section **0.13 m tall × 0.05 m deep**, spanning **0.44 m** across the frontal plate at the eye line.
- Two layers: an outer **frame shell** 0.012 m thick (`metal-brushed`) with a 0.006 m rolled top and bottom lip, and an **inset lens** recessed 0.006 m (`glass` + emissive).
- **The lens carries a rising-chart line**: an 11-segment jagged emissive polyline running left to right and climbing, sitting **0.002 m proud** of the lens, at `emissive(BULL_VISOR_EM, 1.4)`. A **chart, never a logo, never lettering** (§9).
- The visor **fully covers the eyes** in base costume — corporate anonymity is the design. **But build the complete eye geometry underneath anyway**, because:
  - UNCHAINED removes the visor entirely and the eyes carry the face.
  - Damage cracks it progressively (§8), and at 10% HP it **shatters, revealing the molten eyes**. This is the character's best single visual beat and it is worth the extra geometry.
- Gore: `glasses` is an accessory bone — it pops at 70% damage, revealing the eyes early. **Sanction this.** It is a feature.
- `group.userData.visorMat` must point at the **lens** material (the script `visorGlint`/`glowMarks` writes `.emissive` on it and restores from `userData.baseEm`).

### 7.4 The jacket — bone: `coat`, child of `torso`

Keep the sleeveless combat jacket, upgrade it from boxes to a garment.

- **Leather, not cloth** (§6). A leather jacket over bronze reads better and takes the rim light differently from the body.
- **Open front**, so the molten chest seams show through the gap. Gap width 0.16 m at the sternum, widening to 0.24 m at the hem.
- **Rolled hem 0.014 m** all round; the hem must **not** be a cut plane.
- **Collar**: stands **0.10 m proud at the back**, folds down at the front over the trapezius. It must clear the morrillo — the hump goes *over* the collar, not under it.
- **5 modelled buckles** down the left side, each 0.05 × 0.03 m in `BULL_RING_ALLOY`, with a real tongue and a real strap tail.
- **Skirt panels**: 2 front + 1 back, each a **3-segment spring chain**, stiffness 22, damping 0.26, with a +X wind bias during dashes so they flare on the charge and settle after.
- Sleeve the shoulder opening with a 0.03 m rolled cuff so no gap can open at the deltoid.
- Gore: `coat` pops at 70%. **This is a story beat** — losing the jacket mid-match starts turning the base form into the unchained form. Design the bare torso to look finished, because it will be seen.

### 7.5 The shackles — bones: `forearmL/R` and `shinL/R` (non-detachable)

The boss-form vocabulary, and the thing that ties the two `CharacterDef`s together as one character.

- **Wrist bands**: torus, major radius **0.14 m**, minor radius **0.030 m**, `BULL_SHACKLE`, roughness 0.74. Set 0.06 m above the fist.
- **Ankle bands**: major radius **0.16 m**, minor 0.030, set 0.10 m above the fetlock.
- **BASE form**: bands closed and **intact**, each carrying a short chain of 3 links (major r 0.045) that runs up and **disappears into the jacket**. Reads as "restrained".
- **UNCHAINED**: same bands, chains **snapped after 2 links**, and the terminal link is a **torn C-shape with a bright, un-patinated fracture face** in `BULL_BRONZE_HOT` at roughness 0.09. **The break must be the shiniest thing on the model** — fresh metal has no patina, and that single material contrast is what makes "he broke out" legible without a caption.
- They sit on non-detachable bones on purpose: after `_detachForearm`, the wrist shackle goes with the forearm and the stump is clean, which reads correctly.

### 7.6 The plinth fragments — bone: `shinL/shinR` (non-detachable)

Three chunks of granite **still fused into the bronze** on the outer edge of each rear hoof, 0.06–0.10 m, irregular, `granite` maps / `stone` preset, `BULL_PLINTH_STONE`. Six primitives total. They say *he tore himself off his pedestal* with no dialogue, no VFX and no cost. Build them.

### 7.7 The dedication plaque — bone: `torso` (non-detachable)

Bolted to the **left** shoulder (asymmetry). **0.16 × 0.09 m**, 0.010 m thick, bevelled edge 0.004 m, four corner bolts.

- Recessed field in `BULL_RING_ALLOY` at roughness 0.62; **raised letters 0.003 m proud** with their tops rubbed to `BULL_BRONZE_RUB` at roughness 0.16. That polished-letters-on-a-dull-field contrast is exactly how a real plaque ages, and it is the most "monument" thing on the model.
- **Text must be our own invention** (§9). Recommended: **`ERECTED BY PERSONS UNKNOWN`** or **`NO REFUNDS`**. Two words to five, all caps, no date, no city, no artist name, no foundry name.

### 7.8 Molten seam network — meshes on `torso`, `armL/R`, `forearmL/R`, materials pushed to `markMats`

Replace the current "glowing candlestick" bars with a **crack network**, but keep the `markMats` array contract intact — `glowMarks(fx, hex)` iterates it and `armorStanceScript` / `godCandleScript` / `finalPumpScript` all depend on it.

- **Base emissive for every seam material: `BULL_MOLTEN` (`#FF5A1E`).** Set `mat.userData.baseEm` accordingly so `glowMarks(fx, null)` restores correctly.
- Existing scripts tint the seams **green** (`0x2fd070`, `0x36e07a`, `0x1a8f4c`) during power moves. Keep that — it now *means* something: the boss runs orange-hot, and **turns green when the chart does**. That is a better joke than a permanently green chest.
- Geometry: **irregular branching seams**, width 0.010–0.028 m, inset 0.014 m into the surface so the crack has *depth*. 9 primary seams on the torso (base form: 4, visible through the open jacket), 2 per upper arm, 1 per forearm.
- Each seam carries the `BULL_CRACK_HALO` albedo band (§6) — the heat-glazed metal ring is what makes it read as *hot metal* rather than as a neon strip.
- UNCHAINED: the network expands across the full torso, both thighs and the neck — roughly **3× the seam length** of the base form.
- **A slow breathing pulse**: emissive intensity oscillates ±12% at **0.35 Hz**, offset per seam by a per-seam random phase so they never pulse in unison. Cheap, and it is the difference between "a boss" and "a prop".

---

## 8. Expression & motion notes

### Face poses

The face has: a visor (opaque in base form), full eyes underneath, a hinged jaw, a scaleable nose pad, pinnable ears, and the frontal-furrow system.

| Pose | Eyes | Nose / jaw | Ears | Furrows / other |
|---|---|---|---|---|
| **Idle** | lids 32% / 15%; sclera crescent 0.006 at the inner corner | pad 1.00; jaw closed with a 0.004 m gap | 78° lateral, drifting ±4° on the breath | furrows 0.008; visor emissive breathes ±8% at 0.4 Hz; head oscillates 0.02 m at 0.45 Hz |
| **Angry / armor** | lids **12% / 8%**; sclera crescent **0.016 all round** | pad **1.12× in Z**, nostril openings **1.35×**; jaw drops 0.05, lower lip tenses back 0.02 | **pinned: 46° caudal, 20° down, spring damping → 0.9** | furrows **0.016**, convergence 8°; inner orbital rims drop 0.020; **morrillo crown +8% Y**; seams to 1.8×; 3 breath-plume puffs per nostril |
| **Hurt** | lids 68% / 22% | jaw opens 0.09; the near nostril compresses 12% | flick out-and-forward 30° over 3 frames, then droop | head rotates 14° away from the hit; one verdigris/dust puff off the impact point; **visor gains a crack** |
| **KO** | lids **90% / 30% — a slit, never fully closed** | jaw hangs 0.14 open; tongue visible | fully limp, 40° down, spring resistance to zero | **seams fade to 0.15× over 22 frames** and the halo albedo cools `#8C3A16` → `#3A2A20`; visor flickers 3 frames then goes to emissive 0 |
| **Taunt** | lids 20% / 12% | jaw opens 0.12 for the bellow, tongue out | one ear flicks forward, the other stays back | **head lifts 22°** — the only time it comes up; pad 1.06; seams pulse **2.2×** on a 3-frame attack / 14-frame decay; **head drops back at the end — the drop is the punchline** |

**Progressive visor damage** is worth wiring properly: 1 crack decal at 66% HP, 3 at 33%, **shatter at 10%** — the shatter spawns 6 glass shards as debris and permanently reveals the eyes for the rest of the round. It is the cheapest boss-phase-change signal available.

### Secondary motion

Spring-solver driven, per `GRAPHICS_CONTRACT.md` §11.

| Element | Segments | Stiffness | Damping | Max deflection | Notes |
|---|---|---|---|---|---|
| **Tail** | 3 | 26 | 0.20 | 40° | **The headline secondary.** Whips on every direction change, lags a dash start by 4 frames, overshoots 22°, settles in 30 frames. Gravity-biased. Budget for it |
| **Ears** ×2 | 2 each | 34 | 0.30 | 28° | Plus an **independent flick** every 3.5–6 s (randomised per ear), 14° over 5 frames. **Frozen** when pinned |
| **Dewlap** | 1 | 18 | **0.34** | 22° | The **slowest, heaviest** secondary on the model. It must still be moving **8 frames after the body stops** |
| **Nose ring** | — | — | 0.18 | ±22° | Own 2-DOF swing |
| **Leash + tie** | 3 | 30 | 0.22 | 35° | Swings across the chest on dashes |
| **Jacket skirt** ×3 | 3 each | 22 | 0.26 | 30° | +X wind bias during dashes |
| **Shackle chains** ×4 | 2 each | 40 | 0.18 | 45° | Stiff and rattly — they should sound and look like iron, not rope |
| **Cheek / masseter** | soft-body | — | — | 0.03 m | 12 Hz jiggle decaying over 6 frames, triggered on every hard landing and every hit |
| **Belly** | soft-body | — | — | 0.04 m | Same trigger, 9 Hz, 8-frame decay |

### Posture-driven personality in motion

This is what makes him feel like a boss rather than a big fighter.

- **He does not bob.** The idle is a **weight shift, not a bounce**: 0.03 m lateral hip sway at **0.35 Hz** (the slowest idle in the roster), while **the head stays dead still**. Heavy heads are stable. That contrast — a moving body under a motionless skull — is the single strongest "this thing is enormous" cue available, and it costs one keyframe decision.
- **Every step lands.** 4-frame anticipation crouch, 2-frame contact, 3-frame settle, with a 0.02 m camera shake and a dust ring on contact. No frame of locomotion is linear (§0.5).
- **He turns body-first, head-last.** The head lags the torso by **5 frames** on every turn. Predators lead with the head; heavy prey animals swing the mass and the head follows. This one lag value does more for "weight" than any amount of squash.
- **He blocks with the horns.** On `block`, the head drops a further 12° and the horns come *up* into the guard, so the horn crossbar is between him and the opponent. It is anatomically correct, it looks right, and it makes the block pose unique in the roster.
- **He never retreats facing away.** Back-walk keeps the head forward and low, shuffling.
- **On the charge** (`shoulderCharge`, `bullRush`): the head drops another 8°, the horns lead, the tail flattens back into the wind, the jacket skirt flares, and the seams flash to 1.6× on frame 3. **Bipedal, always** — a shoulder charge, never a four-legged gallop (§9).
- **Recovery frames are slow and heavy.** A boss's punishment window is a *design* feature; let the settle read.

---

## 9. Parody safety — MANDATORY

The mandate (`GRAPHICS_CONTRACT.md` §9) is *recognisable archetype and silhouette, changed proportions, our own colourways and marks*. For this fighter the exposure profile is **different from every other character in the roster**, and you need to understand why before you build.

**The source is a copyrighted sculpture by a named artist with a documented enforcement history.** Unlike the meme- and NFT-derived fighters, whose exposure is mostly trademark, this one is **copyright in a specific three-dimensional artistic work**:

- The United States has **no freedom of panorama for sculpture**. 17 U.S.C. §120(a) exempts *architectural* works only; monuments and statues in public spaces are expressly not covered. Wikimedia Commons enforces this against the source work directly — its category page carries a standing notice that photographs of the sculpture are not free works (§10). If a *photograph* is restricted, a 3D reconstruction is far more so.
- The sculptor retained copyright and litigated over it: a 2006 action involving a retailer and a bank over commercial use of the work, and a 2017–2023 dispute over an adjacent installation in which he argued the work's meaning and integrity had been altered. The copyright claims in that later case were dismissed in April 2023 and the matter settled — but the point is the posture, not the outcome. **This rights-holder sues.**
- He died in February 2021, so copyright in the work will persist for decades.

**What is *not* protected**: "a bull as the symbol of a rising market." That is an unprotectable idea with centuries of use, and there are many unrelated charging-bull monuments in the world. **Our fighter must live entirely in that idea and never touch the specific expression.**

### Never build — hard prohibitions

1. **No name, anywhere.** Not the sculpture's title, not its nickname, not the street, not the plaza, not the district, not the sculptor's name, not the foundry's name, not the adjacent statue's name — in geometry, textures, decals, mesh names, material names, variable names, code comments, filenames, UI strings, captions, announcer lines, move names, or the bio. The existing `bio`, `style`, move names (`Market Correction`, `Full Port`, `Maximum Leverage`, `Infinite Conviction`, `God Candle`, `Reserve Collapse`, `The Final Pump`, `Bear Costume`) are already clean generic finance-culture — **keep them clean**.
2. **Never build the quadruped.** This is our strongest single protection and it is free, because the rig is already bipedal. The protected work is a **four-legged animal in one specific pose**. Our fighter is a **standing biped with arms, hands, a jacket and a fighting stance**. Do not add a quadruped idle, a four-legged charge, a quadruped victory pose, an all-fours ground move, or a quadruped silhouette in any UI art or portrait. `shoulderCharge` and `bullRush` are **bipedal shoulder charges**. This is not negotiable and it is not a small thing — the four-legged charging composition *is* the protected expression.
3. **Do not reproduce the pose.** No head-lowered-with-weight-back-on-the-haunches-and-one-foreleg-planted composition, in any clip, in any camera framing, in any promotional still. Our "head lowered" read comes from a **bipedal neck carriage with the morrillo above the poll** (§2, §4.5), which is a structurally different thing and reads as different.
4. **Do not measure anything off the sculpture.** Every horn angle, segment length, span, curvature, muscle mass and proportion in §3 and §4 was derived from **live-cattle anatomy and Spanish fighting-bull horn typology** and then exaggerated for the game — not traced from the monument. Keep it that way. If a future agent wants to "check the horn against a photo", the answer is no.
5. **No plinth, no pedestal, no plaque text that exists.** The shoulder plaque (§7.7) must carry **our own invented text**, and it must not include a date, a city, a dedication formula that appears on the real work, a sculptor's name, or a foundry mark. `ERECTED BY PERSONS UNKNOWN` / `NO REFUNDS`. Do not place the fighter on a plinth in any arena, portrait, select screen or victory shot, and **do not build a miniature statue of him as an arena prop** — that is the closest thing to a replica we could possibly ship.
6. **Do not stage the confrontation.** No small opposing figure placed in front of him in a defiant pose, in any arena, intro, cutscene or promotional frame. That specific composition is itself the subject of a litigated dispute and there is no upside in touching it.
7. **Do not sample the source's colour.** The real work is a **warm brown-gold bronze with bright golden polished rubs**. Ours is a **green-black patina** (§5) — a completely different chemical family (potassium-sulfide black and cupric-nitrate verdigris rather than a warm ferric-nitrate brown). This is both a legal deviation and, independently, the better game read. Do not "warm it up toward the reference".
8. **No photographic reference textures — ever.** The project's no-imported-assets rule already guarantees every map is procedural. That rule is doing double duty here: it means no photograph of the source can enter the build even by accident. Do not add a texture-from-image path for this character.
9. **No trade-dress lettering on the visor.** The visor lens carries a **jagged rising chart line** and nothing else. No ticker symbols that exist, no exchange initials, no index names, no wordmarks, no monograms.

### Deliberate deviations that keep us distinct — build these in on purpose

| # | Deviation | Why it protects us | Why it doesn't hurt the read |
|---|---|---|---|
| **D1** | **Bipedal humanoid**: arms, hooved fists, a jacket, a stance, 31 clips, 19 move scripts. The source is a four-legged animal with none of that. | The single largest structural difference. Everything in §4 is our own invention. | The head, the horns, the hump, the tail and the patina carry the entire read (§1) — none of them need four legs. |
| **D2** | **Proportions derived from live cattle, then exaggerated.** 5.0 head-heights; horn span 0.46 H and 2.74 × head width; neck 0.88 head-heights; chest depth 0.344 H. | No dimension, angle or ratio is a match to the sculpture, because none was taken from it. | Every exaggeration runs *toward* the bull read, not away from it. |
| **D3** | **Horn typology stated explicitly**: cornigordo base + astifino tip + veleto span, on a **published three-segment piecewise curve** (§3.7) with a 1.25:1 oval section twisting 90° along its length. | An original, documented construction from breeding vocabulary, not a traced profile. | It is *more* bull-like than a generic sweep. |
| **D4** | **Green-black patina + verdigris + cyan rim + molten orange.** | Entirely different colour chemistry from the source's warm brown-gold. | The two-value polished/patinated *structure* is what identifies a rubbed public bronze — and structure, not hue, is what the eye reads. |
| **D5** | **Boss-form language**: molten seams, emissive network, cracked-then-shattering visor, cyan→orange colour shift, 1.15× scale form, broken restraints. | None of it exists in the source. All of it is standard AAA boss vocabulary (§10). | It is the "final boss" half of the brief, which the source has nothing to do with. |
| **D6** | **The nose ring.** The source has none. Ours is real cattle husbandry hardware — hinged semicircles, brass bolt, 110 mm — which is generic, functional and unprotectable. | A prominent, load-bearing facial feature that is entirely ours. | It makes him read *more* like a controlled, ringed animal, which is the corporate-enforcer joke. |
| **D7** | **Five original props**: visor, leash-necktie, shackles, plinth fragments, shoulder plaque. Four of the five are among his most prominent features. | The props that carry the parody are all our own designs. | They read as "corporate enforcer bull", which is the character. |
| **D8** | **The tail spec is ours**: 3 segments, 62° root rise, 8° left bias, a coarse switch brush, a 40° spring with 22° overshoot — arcing off a **biped's pelvis**, which is a different body entirely. | Our own numbers, our own construction, our own anatomy. | The raised-lash arc is a genuine live-bull behaviour and an unprotectable natural form. |
| **D9** | **A real face.** Sclera, horizontal-slit pupils, lid solids with five specified coverage states, lashes, six lower incisors and a dental pad, a hinged jaw, pinnable ears, a frontal-furrow expression system. The source is a static bronze with none of this. | Original character animation design. | It is the only way a fighting-game boss can emote at all. |
| **D10** | **The eye-axis cheat**: 38° divergence instead of the anatomical ~58°. | A deliberate, documented departure from *both* the real animal and any sculpture. | Lets him look at his opponent, which the read requires. |
| **D11** | **Our own name, title, bio, stats, voice, moveset and every UI string.** "THE BLACKISH BULL / Lord of the Final Pump" is ours and already clean. | No source naming anywhere in the build. | — |

**The rule of thumb for this character**: if a decision would be *more accurate to the monument*, that is a reason to reject it, not to adopt it. Accuracy to **live bull anatomy** is always safe and always improves the read. Accuracy to **the sculpture** is the thing we are avoiding. When in doubt, ask "am I copying an animal or a statue?" — copy the animal, and let the *surfacing* do the statue.

---

## 10. Reference notes — what I actually looked at

### The source monument

- **Wikipedia, "Charging Bull"** (`https://en.wikipedia.org/wiki/Charging_Bull`) — extracted: bronze, **7,100 lb / 3,200 kg**, cited as **11 ft (3.4 m) tall × 16 ft (4.9 m) long** (length/height ratio **1.45**); cast at a New York art foundry with a collaborator enlarging the model; the work "leans back on its haunches" with the **head lowered as if preparing to charge**, "wickedly long, sharp horns", the **muscular body twisted to one side**, and the **tail curved upward like a lash**; and — the detail I built §6 around — **the nose, horns and testicles have been rubbed to a bright gleam** by visitors, with the rubbed areas noticeably lighter than the rest.
- **I looked at the actual photographs**, not just the text. Via the browser: the article's lead three-quarter-front image, plus Commons files `Bowling Green NYC Feb 2020 13`, `Bowling Green td (2018-12-13) 06 (cropped)` (rear three-quarter), and a four-up contact sheet of `Wall Street bull (15467605171)`, `Bull from behind (46709018762)`, `Bull Wall Street (6173547669)` and `IMAG7199 (34138459952)`. What I extracted from *looking* rather than reading:
  - **The polish follows curvature, not zones.** The bright bronze sits on the convex crowns — forehead, the top of the shoulder mass, the bridge of the nose, the upper curve of each horn, the crown of each hoof — while every hollow and every downward-facing plane stays dark brown-black. This is a **curvature mask**, which is why §6 specifies generating it from `curvatureFromHeight()` rather than hand-painting it. This one observation is the most valuable thing in the whole research pass.
  - **The neck-shoulder mass is the highest point of the animal; the skull hangs below and in front of it.** Confirmed from three angles. §2's 0.20 m poll-below-morrillo relationship comes from here.
  - **The horns emerge from the top-rear corners of the skull, sweep out laterally first, then forward and up**, ending in points that finish well ahead of the muzzle, with the tips converging slightly. Span reads roughly equal to the shoulder mass.
  - **The tail rises steeply off a high root, arcs forward over the rump, and hooks** — enclosing a large open crescent of negative space above the back. From the rear view it is clearly biased to one side. §2's "tail loop" and §4's tail spec come from here.
  - **The hooves are blunt, rounded, heavily simplified wedges** with a visible cleft — not detailed anatomical claws.
  - **Scale check against pedestrians**: in the crowd photographs the animal's back sits around adult chest/shoulder height and the tail apex around adult head height. **That does not agree with the widely-repeated "11 feet tall".** The cited figure is probably a promotional or overall-with-base measurement. **Every ratio in this brief was derived from photographic observation, not from the cited dimension** — do not reconvert §2 against 3.4 m.
- **Multiple secondary write-ups** (`bronzesgallery.com`, `remosince1988.com`, `elementfcu.org`, `atlasobscura.com`, `storyhunt.io`) — consistent on: nostrils flared, muscles tense, "bulging muscles", head lowered, and the rubbing tradition specifically targeting **nose, horns and testicles**. Multiple sources independently confirm the rubbed spots, which is why §6 treats the polished-crown mask as the primary identifying property.

### Live bull anatomy

- **Servitoro bullfighting anatomy blog** (`blog.servitoro.com/en/anatomy-bull/`, listed) and **`madridbullfighting.com/blog/spanish-fighting-bull/`** — the **morrillo** is the massive hump of muscle behind the neck, it must be pronounced, **it dilates when the animal is excited**, and it is what gives the fighting bull its characteristic outline; the **dewlap is small to medium**; adult males run **500–700 kg** and stand **130–150 cm at the withers**; short thick neck, broad powerful chest, strong hindquarters; horns often **lyre-shaped**. §3.9's "+8% morrillo scale in the angry pose" is directly from the dilation note.
- **Spanish horn typology** (`hierroydivisa.wordpress.com/encornaduras/`, `clubtaurinomurcia.es`, `contextoganadero.com`, via search) — horn parts are **mazorca/cepa** (base), **pala** (mid) and **punta/pitón** (tip); **astifino** = thin from the base with a very fine sharp tip; **cornigordo/astigordo** = thick, voluminous base reducing gradually through the pala; **veleto** = high, widely separated horns with attenuated curvature; **gacho/cornigacho** = low and drooping; **cornalón** = very large. §3.7's three-segment naming and the "cornigordo base, astifino tip, veleto span, never gacho" instruction come from here.
- **Bovine skull osteology** (`anatomylearner.com/cow-skull-anatomy/`) — the skull is **pyramidal, shorter and broader than a horse's**; the **cranium is quadrangular**; the **frontal bone forms about one-half of the entire skull length** and carries the **cornual processes** at the junction of its parietal and lateral borders; there is a **large central intercornual protuberance** marking the highest point; the **nasal bones are straight lengthwise but strongly curved side-to-side** with a pointed caudal end. §3.1's two-plane construction (frontal plate = 0.42 of skull length, facial wedge = 0.58), the intercornual ridge, the horn-base placement at the plate's caudo-lateral corners, and the barrelled nasal dorsum are all from this.
- **Bovine hoof anatomy** (`anatomylearner.com/cow-hoof-anatomy/`, `ahdb.org.uk`, `merckvetmanual.com`, via search) — **two weight-bearing claws plus two non-weight-bearing dewclaws higher on the leg**; segments are **periople, coronary, wall, sole and bulbar**; the **coronary band** is the hairline where the hoof meets the skin and the wall grows from it; the **heel bulb is soft, rubbery horn**; the sole is **concave**. §4.4's cleft, dewclaw nubs, coronary band with hide overhang, rubber heel bulbs and dished sole all come from this. The rubbery heel bulb is why §6 gives them `rubber` at roughness 0.92 — the only compliant material on a metal character.
- **Nose rings** (`handwiki.org/wiki/Biology:Nose_ring_(animal)`, plus veterinary suppliers) — **8–13 cm diameter** depending on bull size; **aluminium, stainless steel or copper**; constructed as **a pair of hinged semicircles held closed by a small brass bolt**; set through the **nasal septum**, usually at 9–12 months. §3.8's 110 mm ring, the hinge line at 12 o'clock and the hex bolt at 6 o'clock are straight from this. The bolt is the detail that reads as husbandry hardware rather than jewellery.

### Bronze surfacing

- **Patina chemistry** (Getty Iris blog "Bronze Patinas, Noble and Vile"; `bollingeratelier.com/patina-library/`; `claytlennoxart.com`; `rgsbronze.com`) — **liver of sulfur (potassium sulfide)** produces deep black / grey-black; **ferric nitrate over a liver-of-sulfur base** produces warm chocolate brown; **cupric nitrate** produces the verdigris family, from soft olive through vivid blue-green; ancient and outdoor bronzes carry red-browns, browns, greens, blues and blacks simultaneously. §5's palette is built as a **black-plus-verdigris** chemistry — deliberately the *opposite* branch from the source's warm brown, which is both the legal deviation (D4) and the better read against our arenas.

### Boss-form visual language

- **Lava/molten creature material breakdown** (`depthsoferendorn.com` production post; corroborated by 80.lv's lava-shader material articles) — the working technique for a molten-interior character: **plated areas textured as obsidian with glasslike properties plus an emissive map; unplated areas given a lava material for igneous veins; orange tones added *around* the emissive map to create the illusion of subsurface heat; veins hand-placed for flow; a panning texture for movement; emissive intensity animated so the creature gradually dims and brightens; and a rim light highlighting edges and sharp angles.** Every one of those is in this brief: §6's `BULL_CRACK_HALO` band is the "orange around the emissive" trick, §7.8's 0.35 Hz phase-offset pulse is the "gradually dim and brighten", and §5's cyan rim is the edge highlight.
- **General boss-design writing** (`gamedesignskills.com/game-design/game-boss-design/`, `whatculture.com` transformation survey) — the recurring escalation vocabulary is **scale multiplication, modular armour plates, emissive paint layers, shader-driven damage states, colour-scheme shift, and breaking restraints to signal true power**. §7.5's intact-then-snapped shackles and §5's cyan→molten visor shift are built directly on that vocabulary, and the existing `group.scale = 1.15` UNCHAINED form already implements the scale beat.

### Parody-safety research

- **Wikimedia Commons, `Category:Charging Bull`** — I loaded this page and read the standing legal banner it carries: **17 U.S.C. §120(a) does not extend freedom of panorama to non-architectural artistic works in public spaces**, so photographs of monuments and statues are not free works. This is the clearest available statement that the source is a live, enforced copyright and not public domain, and it is why §9 is written the way it is.
- **Enforcement history** (WIPO Magazine "Raging Bull and Fearless Girl – moral rights in copyright"; NYU JIPEL; `csmonitor.com`; `pnlawyers.com`; `nbcnews.com`) — a **2006** copyright action involving a retailer and a bank over commercial use; an **October 2017** action over an adjacent installation arguing infringement and distortion of the work's message; **copyright claims dismissed April 2023**, one claim surviving, then a settlement. The sculptor died in **February 2021**, so the copyright term runs for decades yet.
- **Conclusion drawn**: our exposure is about **the sculpture's specific three-dimensional expression**, above all its **four-legged charging composition**. The countermeasure is structural, not cosmetic — we are shipping a **biped**, with anatomy taken from live cattle and surfacing taken from patina chemistry. That is why D1 is the top row of the deviations table and why prohibition #2 is written as absolutely as it is.

### Existing code, read in full

`src/characters/blackish-bull.js` (1,698 lines) — `buildBullModel()`, the palette block, all 31 clips, all 19 move scripts, both `CharacterDef`s; plus `src/combat/Gore.js` (`ACCESSORY_BONES` / `SECONDARY_BONES` / `FOREARM_BONES` and the 0.70/0.50/0.25 damage thresholds) and `GRAPHICS_CONTRACT.md` §0/§3/§4/§9/§10/§11/§12.

**Specific defects found in the current model, all addressed above:**

| Current | Problem | Fixed in |
|---|---|---|
| `hide: 0x33363d` | Blue-grey. Reads as painted metal, not aged bronze. Does not separate from dark arenas. | §5 |
| Head is a `0.52×0.44×0.46` box + a `0.36` muzzle box | No skull planes, no 13° stop, no cheek mass, no jaw. | §3.1–3.3 |
| **No eyes exist at all** — only a visor bar | Violates §9's "real eye geometry" requirement outright. | §3.4 |
| Ears are `sph(0.11, …, 0.5, 0.75, 1.1)` | Blobs. Invisible at any distance, and they cannot pin. | §3.6 |
| Horns are `cyl` + a 5-sided `cone`, 2 segments | No curve, no taper law, no section twist, no rings, no fillet collar. Currently the weakest geometry on the highest-value feature. | §3.7 |
| Tail hangs **down** (`bent(tail, 2.3)`, cylinder at −0.21) | Throws away the single most distinctive silhouette element available. | §2, §4, §8 |
| Nose ring only in `costume === 1` | A primary read cue is missing from the default costume. | §3.8, §5 |
| No morrillo, no dewlap, no brisket | Without the hump the head cannot read as lowered; without the dewlap the throat line is a straight cut. | §3.9, §4.1 |
| Hooves are `box(0.32,0.18,0.26)` + a `box(0.1,0.1,0.24)` "split ridge" | Reads as a boot with a bar on it. No cleft, no claws, no coronary band, no heel bulbs. | §4.4 |
| Fists are `sph(0.24)` + a knuckle plate box | Generic. Misses the free, character-defining cloven-hoof-fist idea. | §4.3 |
| Chest markings are green candlestick bars | Green-on-green-black has no contrast, and it wastes the boss's molten-seam vocabulary. | §5, §7.8 |
| `lamb()` → `MeshLambertMaterial` with `flatShading: true` throughout | Explicitly killed by §0. No PBR, no maps, no roughness variation, no IBL. | §6 |
| Raw `BoxGeometry` everywhere, no bevels | §0.4: nothing may read as a raw box. | throughout |

**Things that must not change and that I have preserved**: `hips` at `[0, 1.15, 0]`; bone names and hierarchy; `userData.visorMat` / `markMats` / `baseScale` / `unchained`; `mat.userData.baseEm` restore convention in `glowMarks()`; both `CharacterDef` stat/hitbox blocks; `def.height` 2.50 / 2.90. **One item to verify after the rebuild**: `bearCostumeScript` attaches `makeBearMask()` at head-local `(0.30, 0.16, 0)` — re-check that offset against the new frontal plate and update it if the mask floats or intersects.
