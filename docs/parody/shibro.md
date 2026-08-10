# SHIBRO — parody-likeness build brief

**Fighter:** `src/characters/shibro.js` · `ShibroDef` · `id: 'shibro'` · `name: 'SHIBRO'` · `title: 'Guardian of the Chain'`
**Source archetype:** the earnest "protect the network" dog-coin mascot — the stoic-protector counterpart
to the joke dog coins — rendered as a **large white mountain guardian dog** (Great Pyrenees / Kuvasz /
white Akita territory).
**Contract authority:** `GRAPHICS_CONTRACT.md` §9 (parody mandate), §0 (style guardrails, albedo range,
budget), §3 (`surfaceMaps`), §4 (`pbr` presets), `CONTRACTS.md` §4 (rig — frozen).
**Author:** character-art-direction research pass, July 2026. Revised after a hostile geometry +
engine-API audit, July 2026 (see §0.6). Every number below comes from a measured photograph, a
published breed standard, a value read out of the engine source, or a computed value. See §10.
**Build to the numbers, not the adjectives.**

> **The one-line summary of this whole document:** Shibro is the only fighter in the roster whose
> **largest area is also the lightest value on the model**. Every technique that works for the other
> nine — dark mass, light accent, bright rim — inverts here. If you build him the way you built the
> others, he will be a white blob with eyes. §5 and §6 are not optional colour flavour; they are the
> character.

---

## 0. Frames, constraints, and contract reconciliation

### 0.1 Axis convention — get this right before you type a number

The rig **faces +X**. In `shibro.js` and in this file, `box(w, h, d)` means
**w → X (forward/depth), h → Y (up), d → Z (lateral)**. `+Z` is the character's **left**.
Feet at `y = 0`. All values are metres.

Three frames are used below; every number is tagged.

| Frame | Origin | Used in |
|---|---|---|
| **Model space `M`** | between the feet on the floor | §2, §4, §7 |
| **Head space `Hd`** | the `head` bone pivot, at `M(0.05, 1.620, 0)` | §3 |
| **Hip space** | the `hips` bone pivot, at `M(0, 1.000, 0)` | cross-checks only |

Conversion: `M = Hd + (0.05, 1.620, 0)`. So `Hd(0.28, 0.010, 0)` is `M(0.33, 1.630, 0)`.

### 0.2 Hard constraints inherited from the current file — do not break these

- **`def.height = 1.90`, `def.weight = 1.15`.** Gameplay height stays 1.90 m. Hurtboxes do not
  follow the tail plume or the collar spikes.
- **`hips` base local position stays `M(0, 1.000, 0)`.** Every `hips` key in `clips` is an
  **absolute** position (`HIP = [0, 1.0, 0]`). Move it and you re-author 31 clips.
- **The bind-pose bone pivots that already exist in the file, read out of `shibro.js:98–209`.**
  Every §2–§4 number below is derived from these; do not invent your own and do not trust a
  number in this brief that contradicts this table.

| Bone | Parent | Local offset | World `M` |
|---|---|---|---|
| `hips` | `group` | (0, 1.000, 0) | **(0, 1.000, 0)** |
| `torso` | `hips` | (0, 0.120, 0) | **(0, 1.120, 0)** |
| `head` | `torso` | (0.050, 0.500, 0) | **(0.050, 1.620, 0)** |
| `earL` / `earR` | `head` | (−0.030, 0.270, ±0.130) | (0.020, 1.890, ±0.130) → **respecify, §3.8** |
| `armL` / `armR` | `torso` | (0.020, 0.420, ±0.340) | **(0.020, 1.540, ±0.340)** |
| `forearmL` / `forearmR` | `arm` | (0, −0.320, 0) | **(0.020, 1.220, ±0.340)** |
| `legL` / `legR` | `hips` | (0, −0.020, ±0.170) | **(0, 0.980, ±0.170)** |
| `shinL` / `shinR` | `leg` | (0, −0.520, 0) | **(0, 0.460, ±0.170)** |
| `tail` | `hips` | (−0.260, 0.100, 0) | **(−0.260, 1.100, 0)** |
| `sash` | `hips` | (−0.060, 0.040, 0.240) | **(−0.060, 1.040, +0.240)** |

  Consequences the old draft of this brief got wrong and you must not repeat:
  **(a)** the femur is **0.520 m** (`legL` 0.980 → `shinL` 0.460), not 0.543;
  **(b)** the `sash` bone sits at `M(−0.06, 1.040, +0.24)`, which is *not* where the visible knot
  is (§7.4) — the hanging panel's root cap must still be **at the bone pivot** so the detached
  clone does not pop;
  **(c)** the `earL`/`earR` pivots in the current file are at `Hd y +0.270`, i.e. **on top of the
  skull**, because the current model has erect cone ears. §3.8 moves them to `Hd(−0.020, +0.097,
  ±0.096)`. **This is a bone *rest position* change, not a rename** — permitted, because no clip
  keys an ear *position*, only rotations (`shibro.js:222–786`). Verify that with a grep before you
  move them.
- **The 31 clips already key `earL`/`earR` as mirrored Euler triples on X and Y only**
  (e.g. `earL: [0.05, 0.09, 0]` / `earR: [-0.05, -0.09, 0]`, `shibro.js:234–235`). With the ears
  re-set as **drop** ears (§3.8) those two axes now mean *swing fore/aft* (X) and *swing
  in/out against the skull* (Y) — which is exactly right, and the existing keys will read as
  believable ear flap with no re-authoring. **The "ear lift" poses in §8.1 are therefore a
  Y-axis rotation, not a Z-axis one.** If you build the ear's local axes any other way, all 31
  clips will flap the ears sideways through the skull.
- **The exported bone map must stay exactly these 15 names, in this hierarchy.** 31 clips and
  14 move scripts index them by name:

```
group > hips > { sash, tail, legL > shinL, legR > shinR, torso }
torso > { head > { earL, earR }, armL > forearmL, armR > forearmR }
```

- **No meshes parented directly to `group`.** Everything hangs off a bone — see §0.3.
- `torso.userData.medalMat` must remain a live material reference; `medalControl()` calls
  `mat.emissive.setHex()` on it (`shibro.js:819`). If you swap the medallion to a `pbr()` cached
  material, **pass `unique: true` for that one material** or every gold object in the scene glows
  when Shibro stakes.
- `bones.forearmR.userData.blade` must remain a `THREE.Group` with `.visible = false` at build, and
  `bones.forearmR.userData.bladeMats` an array of the emissive materials. `bladeControl()`
  (`shibro.js:810`) and `chainSplitterScript` depend on both.
- `buildModel(costume)` must keep answering costume `0` (day) and `1` (night).
- `makeVillageDog()` shares `C.fur` / `C.dark`. If you rename palette keys, update it — it is the
  entire visual payload of `community-shield`.

### 0.3 Dismemberment is a build constraint, not a gameplay detail

`Gore._detach()` (`src/combat/Gore.js:257`) **clones a bone's whole subtree**, freezes it, and hides
the original. Read the bone lists it draws from — they decide where your props go:

```js
ACCESSORY_BONES = [... 'sash' ...]              // pops at 70 % damage
SECONDARY_BONES = ['earL','earR','tail', ...]   // tears at 50 % damage
FOREARM_BONES   = ['forearmR','forearmL']       // at 25 %
```

Consequences you must design for:

1. **`sash` is Shibro's accessory bone.** It is the first thing that flies off. Anything you want to
   survive the whole match must not live under it, and the sash itself must be worth losing —
   §7.4 makes it a real hanging panel, not a stripe.
2. **`earL`, `earR` and `tail` are tearable.** Each must be a **self-contained, closed subtree**:
   a torn-off ear that is a flat card with no back face will show a hole the moment it tumbles.
   Ear leather gets a real back surface; the plume gets a closed cap at its root.
3. **The energy blade lives under `forearmR`.** If that forearm is torn off, the blade goes with it
   and `bladeControl()` silently no-ops (it is wrapped in `try/catch`). That is acceptable and
   arguably funny — but do **not** move the blade to `torso` to "fix" it, because `chainSplitter`
   positions it from the forearm.
4. Mark every prop mesh `userData.prop = true` so damage-tint and material-upgrade passes can
   include or skip them deliberately.
5. **Merge static geometry per bone, never across bones.** A merged buffer spanning `torso` and
   `head` tears visibly on a head detach.

### 0.4 The camera this model is designed for

`MatchScreen.js:165–167`: `PerspectiveCamera(45°, …)` at `M(0, 2.7, 11.5)` looking at `M(0, 1.4, 0)`.

- The camera sits **6.4° above** the fighter's chest line and looks down the **±Z axis** — the player
  sees Shibro in **near-profile**, essentially never head-on.
- Visible vertical extent at that distance is `2 · 11.6 · tan 22.5° = 9.61 m`. A 1.90 m fighter is
  therefore **~214 px tall at 1080p, ~142 px at 720p**. The contract's 128 px silhouette test is not
  a hypothetical — **it is approximately how big this character actually is on a 720p screen.**
- **Every read decision in §2 and §3 is designed for profile and ±25°, and must be verified at three
  azimuths (0°, ±25°), not at orthographic front.**
- The default match rig is a **warm key + cool sky fill + warm ground bounce**:
  `HemisphereLight(sky #cfe0ff, ground #54381e, 0.85)` and `DirectionalLight(#fff2d0, 1.6)` from
  `M(6, 12, 7)`. This is, by luck, exactly the light that makes a white double coat read (§5.4).
  Build against it; do not assume a neutral studio.

### 0.5 Where this brief and the contract look like they disagree — resolved

| Contract §9 says | This brief says | Resolution |
|---|---|---|
| "**tall pointed ears**" appears in the *current file's header comment* (`shibro.js:3`) | §3.7 specifies **drop V-ears carried flat and low** | The file comment loses. Contract §9's actual row for SHIBRO says only "white mountain dog… blocky muzzle", and §9's mandate is *don't collide with the other fighters*. **DOGEY already owns erect triangular ear spikes** (`dogey.md` §2: "two erect dark-tipped ear spikes"). Two dog fighters with the same ear silhouette is a roster failure. Drop ears are also what all three cited source breeds (Pyrenees, Kuvasz) actually have. **Drop ears win.** |
| "Fur must read as **long and layered, not painted**" | §6 asks for exactly two extra shells, not a groom | Not a conflict, but it is a number: **the layering must be visible in geometry at the ruff, plume and pantaloons** (§6.3), everywhere else it is normal-mapped. Alpha fur cards are **banned** — they fringe against rim light and this character is defined by his rim. |
| §0 albedo range 30–240 sRGB | a *white* character | Resolved in §5: the base coat albedo tops out at **`#EFE7D4` (239, 231, 212)**, comfortably inside 240 and *below* fresh snow (~236 sRGB, §10). **Nothing on this model is `#FFFFFF`.** White is achieved by light, not by albedo. |
| ≤250k tris / <900 draw calls per match (§0) | ~30 modelled fur locks, 12 collar spikes, 2 coat shells | §6.5 is a hard budget with mandatory instancing and merge rules. |
| "Bevels: every hard edge chamfered, nothing is a raw `BoxGeometry`" | the current file is **100 % raw `BoxGeometry`/`SphereGeometry(10,8)`/`ConeGeometry(…,4)`** | The contract wins, entirely. Every helper in `shibro.js:35–61` gets replaced with a bevelled equivalent. On a white character an unbevelled edge is *invisible* — there is no albedo change to hide it, so the chamfer highlight is the **only** thing that describes the form. Chamfer width **0.008 m** on armour and props, **0.014 m** on body forms.

### 0.6 Engine-API facts that override any pseudo-code you may have seen

Read out of `src/render/materials.js` and `src/render/textures.js`, not remembered.
**Four of these silently do nothing if you get them wrong, which is the worst failure mode there is.**

1. **You cannot choose a texture kind and a preset independently.** `pbr(color, preset, ov)` builds
   its maps from `SURFACE[preset].maps` (`materials.js:705–715`). `ov.maps` is swallowed by
   `META_KEYS` (`materials.js:718–722`) and **never read**. So "kind `fur-long` + preset `fur`"
   is not a thing — preset `fur` always gives you the `fur-short` map set. §6.1 is therefore
   written as **one preset per region**; the kind column is informational.
2. **`overrides.roughness` is a MULTIPLIER on the roughness map, not an absolute.**
   Every preset used here ships a roughness map, and `applySurface()` then sets
   `material.roughness = ov.roughness ?? 1` (`materials.js:750–756`) because the map carries the
   absolute value. Passing `roughness: 0.28` for the nose does **not** give 0.28 — it gives
   `0.28 × leatherMap` ≈ 0.17. §6.1 lists (map base × multiplier) for every surface. The only way
   to set an absolute roughness is `noMaps: true`.
3. **`sheenColor` is not a caller knob.** `applySurface()` computes
   `sheenColor = color.lerp(white, 1 − sheenTint)` (`materials.js:771–777`). The knob is the
   **scalar `sheenTint` ∈ [0,1]**: 0 = white sheen, 1 = sheen the colour of the albedo. Because
   `COAT` is already warm cream, `sheenTint 0.45` lands the sheen at ≈`#EFEBE0`, which is the warm
   halo §5.5 wants. **`#FFF0D2` exactly is unreachable, and you must not chase it by mutating a
   cached material.**
4. **AO strength is not a `surfaceMaps` option.** `surfaceMaps(kind, opts)` accepts only
   `{ scale, seed, tint, wear, tileable, size, repeat, hero }` (`textures.js:666`); AO radius and
   strength are baked per kind (`fur-long`: radius 5, strength 1.05). The caller-side knob is
   **`aoIntensity` on `pbr()`** (`materials.js:758–761`), plus your own baked vertex-colour cavity
   term. §6.2 is written against `aoIntensity`.
5. **`mapOpts.tint` hue-shifts, it does not darken** — `applyTint()` normalises against the
   brightest channel (`textures.js:646–652`). You darken the undercoat with the material *colour*,
   never with a tint.
6. Every map set also ships an **albedo map that multiplies the base colour** (`fur-long`'s runs
   ≈0.55–1.15, mean ≈0.90). The delivered luminance of `COAT` is therefore ≈0.90 × the §5.3 figure.
   That is *desired* — it is the built-in undercoat darkening — but it means **§5's numbers are
   ratios, not absolutes.** Do not compensate by brightening the albedo; you will hit the 240 ceiling.
7. `pbr()` already clamps every albedo channel into **30–240 sRGB** (`guardAlbedo`). §5.2's palette
   is verified inside that window by computation, so the clamp should be a no-op. If it ever fires,
   you have drifted off-palette.

---

## 1. The 2-second test

**A huge cream-white dog whose head is a small, calm, blunt wedge sitting on top of an enormous cloud
of coat — a chest-and-shoulder ruff nearly twice the width of the head — with two small V-shaped ears
lying flat and low against the skull, a black-rimmed almond eye and a big black nose punched into all
that white, an iron-spiked guardian collar cutting a hard dark band across the base of the ruff, and a
plumed tail swept up over the back in an open scimitar arc. He is standing still, square, chest out,
looking straight at you.** That is the read.

Four things in that sentence are load-bearing and are the ones a build gets wrong:

1. **The head is SMALL and the ruff is HUGE.** This is the whole gag of the guardian-breed silhouette:
   a 0.325 m-wide head emerging from a 0.60 m-wide mane (§2). The ratio is **1 : 1.85**. Build the
   head at "hero" scale and you get a husky mascot; build the ruff timidly and you get a labrador.
   The step from head-width to ruff-width, seen in profile as a **concave notch under the jaw and a
   convex explosion behind it**, is the single most identifiable shape on this character.
2. **The ears are DOWN.** Small, V-shaped, rounded tips, **set at eye level, carried low, flat and
   close to the head** — the Great Pyrenees standard's exact language, and the Kuvasz's too.
   They contribute **almost nothing to the outer silhouette**; they read as a *dark badger-grey patch*
   on the side of a white skull (§3.7, §5). This is the primary anti-collision cue against **DOGEY**,
   whose entire silhouette hinges on two erect ear spikes. If Shibro's ears stick up, the roster
   has two of the same dog.
3. **He is not white. He is warm cream, and he is DARKER than the bright things around him.**
   Measured off a Pyrenean Mountain Dog photographed against fresh snow: coat `Y = 0.739`,
   snow `Y = 0.943` — **the dog is 1.28 : 1 darker than the snow** (§10). Measured against a studio
   white backdrop: coat `Y = 0.532`, backdrop `Y = 0.582` — **essentially zero value separation; the
   animal reads only by hue temperature and by occlusion shadow.** A build that makes him bright
   white will vanish in `frozenTokenLab` and `mountainNodeVillage` and look like a paper cut-out
   everywhere else.
4. **The default expression is level, open, and completely unbothered.** Eyes wide open (upper lid
   covering only the **top 28 %**, §3.3), brow level, mouth corners **dead flat at 0° to −2°**.
   Not sleepy (that is TIRED APE), not smug (that is DOGEY), not serene-stoned (that is COOL PAL).
   **Stoic = level.** Every degree of curve you put in the mouth costs you the character.

The **second beat**, half a second later, is the **posture**: square stance, weight back, chest lifted,
head carried *over* the shoulders rather than in front of them, both paws low and open. Every other
fighter in the roster leans in. Shibro is the only one standing still — and that stillness, against
nine characters who fidget, is a read all by itself.

Everything else — the pauldrons, the sash, the medallion, the energy blade — is **confirmation, not
identification**. If a viewer needs the armour to know what this is, the coat and the head have failed.

**But be clear about what "the read" means here, because it is two reads, not one.** The coat and the
head identify the *animal*. What identifies the *parody* is the **pairing**: a mountain-guardian dog
silhouette carrying **worn, strapped, functional armour at the shoulders and throat** and nothing
else — no hat, no shirt, no props in the hands. A bare dog reads as a breed portrait; a dog in a
costume reads as a mascot; a dog wearing a **spiked working collar and three scuffed shoulder plates**
reads as *the earnest one who guards the thing*, which is the joke. That is why §7.1 and §7.2 are
non-cuttable even though §1 calls them "confirmation": they carry the second read, and the second
read is the reason this character exists. **Cut every other prop before you cut those two.**

**Anti-read checklist.** If any of these is true, you have built the wrong dog:

| Symptom | You have built | Fix |
|---|---|---|
| Ears erect / triangular / poking above the skull | a Shiba, a husky, or DOGEY | §3.7 |
| Head reads as big and round on a normal neck | a golden retriever | §2, ruff to 0.60 m |
| Tail curls into a closed ring on the back | DOGEY's tail donut | §4.6, open arc, ≥0.09 m clearance |
| Muzzle long and tapering to a point | a collie | §3.5, taper 0.79, blunt front plane |
| Coat pure white / `#FFFFFF` anywhere | a ghost | §5 |
| Whole figure reads as one smooth ovoid | a plush toy | §2 negative space, §6.3 lock geometry |

---

## 2. Silhouette specification

Total silhouette height **H = 1.90 m** (crown of the head fur; the tail plume deliberately stops
below it). Head height `H_h` — **skull crown fur → underside of the lower jaw, ruff excluded** —
is **0.365 m**. The figure is therefore **5.20 head-heights**.

That is deliberately between TIRED APE (5.0, squat) and a 7.5-head hero. Shibro must read as
*tall and noble* next to the ape and *massive* next to DOGEY (4.70 heads at 1.70 m), but he is a
draught animal, not a fashion model. **Do not go past 5.4.**

### 2.1 Vertical landmark table (feet at `M y = 0`) — AUTHORITATIVE

Every number in §3 derives from this table via `Hd y = M y − 1.620` (§0.1).
**If any number elsewhere in this file disagrees with this table, this table wins.**

| Landmark | `M y` | `Hd y` | fraction of H | head-heights from floor |
|---|---|---|---|---|
| **Crown of head fur (silhouette top)** | **1.900** | **+0.280** | 1.000 | 5.20 |
| Tail plume apex (must stay below the crown) | 1.845 | — | 0.971 | 5.05 |
| **Skull dome surface, bone (under 0.080 m of guard hair)** | **1.820** | **+0.200** | 0.958 | 4.99 |
| Occiput crest, bone | 1.812 | +0.192 | 0.954 | 4.96 |
| Brow / supraorbital ridge, top edge (its rear-high end, where it merges into the frontal) | 1.765 | +0.145 | 0.929 | 4.83 |
| Ear base, top edge of the set | 1.725 | +0.105 | 0.908 | 4.73 |
| **Eye aperture centre line** | **1.710** | **+0.090** | 0.900 | 4.68 |
| **Ruff crest** (mane rising behind the ears) | **1.700** | — | 0.895 | 4.66 |
| Stop (the forehead→bridge plane break) | 1.682 | +0.062 | 0.885 | 4.61 |
| **Nose leather centre** | **1.630** | **+0.010** | 0.858 | 4.47 |
| `head` bone pivot | 1.620 | 0.000 | 0.853 | 4.44 |
| Ear leather tip (hanging, idle) | 1.600 | −0.020 | 0.842 | 4.38 |
| **Mouth line** (lip seam, aperture centre) | **1.572** | **−0.048** | 0.827 | 4.31 |
| **Chin / underside of the lower jaw** | **1.535** | **−0.085** | 0.808 | 4.20 |
| Wolf-collar band, top edge | 1.510 | — | 0.795 | 4.14 |
| Pauldron plate 1, centre (upper edge 1.637) | 1.622 | — | 0.854 | 4.44 |
| Pauldron plate 3, centre (**widest point of the figure**, `z ±0.465`) | 1.504 | — | 0.792 | 4.12 |
| `armL`/`armR` pivot | 1.540 | — | 0.811 | 4.22 |
| Wolf-collar band, lower edge | 1.420 | — | 0.747 | 3.89 |
| Ruff outer apex (frontmost point of the chest mane) | 1.440 | — | 0.758 | 3.94 |
| Chest widest | 1.380 | — | 0.726 | 3.78 |
| Medallion centre | 1.420 | — | 0.747 | 3.89 |
| `forearm` pivot (elbow) | 1.220 | — | 0.642 | 3.34 |
| Waist / sash band | 1.100 | — | 0.579 | 3.01 |
| `hips` pivot | 1.000 | — | 0.526 | 2.74 |
| Wrist (arms hanging straight — reference pose only) | 0.950 | — | 0.500 | 2.60 |
| **Paw-hand fingertips (arms hanging straight)** | **0.820** | — | 0.432 | 2.25 |
| Pantaloon (thigh feathering) hem | 0.640 | — | 0.337 | 1.75 |
| Sash panel hem, gold tip | 0.560 | — | 0.295 | 1.53 |
| Knee | 0.460 | — | 0.242 | 1.26 |
| **Hock** (the ankle joint — carried high, §4.4) | **0.150** | — | 0.079 | 0.41 |
| Rear double dewclaws | 0.110 | — | 0.058 | 0.30 |
| Sole | 0.000 | — | 0.000 | 0.00 |

> **Rig-consistency gate — recomputed against the real bone offsets (§0.2), because the previous
> draft of this table did not close.** The leg chain does **not** start at `hips`: the `legL`/`legR`
> pivots are at `M(0, 0.980, ±0.170)`. So `leg` 0.980 − femur **0.520** = `shin` 0.460 (exact, both
> segments are straight in the bind pose); 0.460 − tibia 0.311 = hock 0.149 ≈ **0.150**;
> − pastern/paw 0.150 = sole 0.000. Arm: `arm` pivot 1.540 − humerus 0.320 = elbow 1.220;
> − forearm 0.270 = wrist 0.950; − hand 0.130 = fingertip 0.820. These are a closed chain. **If you change one,
> recompute the rest and then re-verify the `forward`/`up` constants in all 14 move scripts and the
> 12 `hitbox` blocks against the existing harness** (`GRAPHICS_CONTRACT.md` §9, last bullet).
> `shoulder-check` (`hitbox.up 1.1`) and `low-sweep` (`hitbox.up 0.3`) are the two most sensitive.

### 2.2 Lateral dimensions (Z)

| Measurement | metres | fraction of H | px at 128 | at `M y` |
|---|---|---|---|---|
| Head at its widest (cheek + jaw fur, at the ear line) | 0.325 | 0.171 | 21.9 | 1.725 |
| Skull across the zygomatic arches, fur excluded — `W_s` | **0.215** | 0.113 | 14.5 | 1.710 |
| **Ruff at its widest (over the neck / withers)** | **0.600** | 0.316 | 40.4 | 1.620–1.700 |
| Coat over the ruff's chest apron | 0.560 | 0.295 | 37.7 | 1.440 |
| Shoulder **flesh** span — deltoid + upper-arm, coat excluded | 0.870 | 0.458 | 58.6 | 1.520 |
| Pauldron span, outer edge to outer edge (**widest thing on the figure**) | **0.930** | 0.489 | 62.7 | 1.504 |
| Chest below the ruff | 0.520 | 0.274 | 35.0 | 1.300 |
| Waist | 0.440 | 0.232 | 29.6 | 1.100 |
| Hips including pantaloons | 0.560 | 0.295 | 37.7 | 1.010 |
| Stance, outer edge of paw to outer edge of paw | 0.520 | 0.274 | 35.0 | 0.000 |
| Tail plume at its thickest | 0.170 | 0.089 | 11.5 | 1.700 |

**The single ratio that defines this character: head width 0.325 : ruff width 0.600 = 1 : 1.85.**
Verify it in a screenshot, **measured at the ruff crest band (`M y` 1.620–1.700), not at the
shoulders.** If it drops below 1 : 1.6, the ruff is too small and the read is gone.

> **Why the shoulders are 0.870 and not 0.600 — read this before you "fix" it.**
> The previous draft called 0.780 the widest thing on the figure and gave the deltoid a radius of
> 0.115 at an arm pivot of `M z ±0.340`. That is **0.910 m of flesh**, wider than the armour that
> was supposed to cover it, and the mane at 0.600 would not even have reached the arm pivots. The
> arm pivots are frozen at `±0.340` (§0.2) and the upper-arm cylinder is r 0.090, so the outer
> surface of the arm is at `±0.430` **no matter what you do**. Therefore:
> **the shoulder block really is ≈0.87 m wide, and the pauldrons must be wider than that or they
> are inside the dog.** 0.930 it is. The ruff's 0.600 is a *neck* measurement, one band higher.
> The character is a narrow head on a wide neck-mane on a very wide armoured shoulder — three
> steps, not two, and the three-step stack is better than the two-step one was.

### 2.3 Where the mass sits

- **The head + collar + ruff block (`M y` 1.420 → 1.900) is 0.480 m = 25 % of the height, but
  carries ≈ 40 % of the perceived visual mass.** This is a front-heavy, top-heavy design. The
  pauldrons live *inside* that block and reinforce it.
- **Above-waist : below-waist perceived mass ≈ 58 : 42.** Heavy chest, honest legs. Unlike TIRED
  APE, the legs are *not* stumpy — Shibro stands tall and the leg is a clean column, because the
  contrast between a chaotic fur-storm above and two clean columns below is what makes the ruff read.
- **Vertically the figure is a triangle standing on its point** — narrow at the paws (0.520),
  barely widening through the hips (0.560), holding through the chest (0.520), then flaring hard:
  0.600 at the ruff crest, 0.870 of flesh at the shoulder, **0.930 across the pauldrons**, and then
  collapsing to a 0.325 head. The two headline events, both measurable in a black fill:
  - **The armour flare:** 0.600 → 0.930 over the 0.116 m from `M y` 1.620 down to 1.504. That is
    **+0.330 m of width in 0.116 m of height** (22.2 px in 7.8 px). Nothing else in the roster
    steps that hard.
  - **The head collapse:** 0.600 → 0.325 over the 0.085 m from `M y` 1.640 (mane widest) up to
    1.725 (the ear line). **−0.275 m of width in 0.085 m of height** (18.5 px in 5.7 px).
  Both are *steps*, not tapers. If either one takes more than 0.12 m of vertical travel it has
  become a slope and the silhouette has gone soft.
- **There is no visible neck, and that is on purpose.** In full coat these breeds have none — the
  mane fills the throat completely (verified on all four reference photographs, §10). The job a
  neck would normally do — separating the head from the body at distance — is done instead by the
  **wolf collar** (§7.1). That is why the collar is structural and not an accessory.

### 2.4 Must survive filled-black at 128 px

At 128 px for a 1.90 m figure the scale is **1 px = 0.01484 m**. Every claim is given in both
metres and pixels so you can measure it in a screenshot instead of arguing about it.

1. **The ruff explosion.** From the profile camera, the outline must step outward by
   **≥ 0.13 m (8.8 px) in under 0.10 m (6.7 px) of vertical travel** at the jaw-to-chest transition.
   The design delivers **0.1375 m per side in 0.025 m of travel** (head half-width `0.1625` at
   `M y 1.725` → mane half-width `0.300` at `M y 1.700`), so this is a check on your build, not a
   stretch goal. A gradual bulge reads as "fat dog"; a step reads as "mane".
2. **The ruff's outline is jagged, not smooth.** At least **9 discrete lock silhouette breakers**
   must be visible on the ruff outline from any azimuth, each **0.05–0.11 m (3.4–7.4 px)** proud of
   the mean outline, at irregular spacing. A smooth ruff outline is a beanbag.
3. **The plumed tail arc.** Apex at `M y 1.845` (**3.7 px below the crown**), plume thickness
   0.170 m (**11.5 px**), and the **enclosed-looking area between the plume and the back must stay
   OPEN** — minimum clearance **0.11 m (7.4 px)**, never below 0.09 m (6.1 px). This is the
   anti-DOGEY rule: DOGEY's tail is a closed donut with a hole (`dogey.md` §2); **Shibro's is an
   open scimitar. If the void ever closes, you have built DOGEY's tail.**
4. **The head wedge.** In profile, the nose's front face (`Hd x +0.318`) sits **0.209 m (14.1 px)
   forward** of the brow ridge's front face (`Hd x +0.109`, §3.2). The muzzle's top plane runs
   **−8.7°** nose-down and the frontal ramp above the stop runs **−35.6°** nose-down, so the plane
   break at the stop is **27°**, blended over a 0.035 m radius (§3.1, §3.4). A dog head at 128 px is a *long wedge
   with one clear step near the front*, not two spheres.
5. **The pauldron shelf.** Three hard, straight, man-made horizontals cascading down the outside of
   each shoulder at `M y 1.622 / 1.566 / 1.504`, **0.300 / 0.280 / 0.240 m long in profile**
   (20.2 / 18.9 / 16.2 px) with a **0.008 m** chamfer catching light on every top edge. These are
   the only straight lines on the upper body, and their job is to prove he is *wearing* something.
   From the profile camera they overlap into one shelf with two visible steps — that is the target.
6. **The collar band.** A **0.090 m (6.1 px)** tall dark band at `M y 1.420–1.510`, with
   **12 spikes each 0.055 m (3.7 px)** long. At 128 px the spikes read as a serrated edge on the
   band, not as individual spikes — that is fine and intended. **Do not lengthen them to force a
   128 px read**; long spikes read as a punk collar, which is a completely different character.
7. **Two clean leg columns and the gap between them.** Between the pantaloon hems (`M y 0.640`) and
   the floor the legs must be visibly *separate*: minimum background gap between the inner leg
   outlines **0.16 m (10.8 px)** at knee height. The pantaloons may not close it.
8. **The ear does NOT appear in silhouette, and that is a positive requirement.** The ear leather
   projects at most **0.012 m (0.8 px)** beyond the **coat surface it lies on** (`z ±0.146` →
   outer face `±0.158`), and stays **inside** the head's widest point (`±0.1625`). From the profile
   camera it is a *shape on the head*, carried by the badger-grey albedo (§5) and by a modelled
   **0.010 m rim step** where the leather's edge lifts off the skull. **Test: fill the head black.
   You should not be able to tell where the ears are. Now render normally. You should immediately
   be able to tell where the ears are.** If the black fill shows ear spikes, delete them.

### 2.5 Negative space — this is what actually defines the shape

- **The jaw notch.** The only concavity on the upper body: bounded above by the underside of the
  lower jaw (`M y 1.535`), in front by the throat ruff, behind by the rising mane. It is
  **0.115 m (7.7 px) deep** measured back from the chin, and the wolf collar sits inside it.
  **This notch is the character's neck.** If the ruff fills it, the head fuses to the body and
  the silhouette dies. Guard it: the collar's spikes may cross it, the fur may not.
- **The plume void.** Between the underside of the tail plume and the top of the croup/back.
  Minimum dimension **0.11 m (7.4 px)**, and it must remain **open at one end** (§2.4.3). This is
  the only large void on the figure and it is what makes the tail read as *carried*, not *glued*.
- **The ear lift.** A **0.010 m** wedge of shadow where the ear leather's rear edge lifts off the
  skull. Sub-pixel at 128 px; it is a 2 m cue, and it is what stops the ear looking painted on.
- **Arm-to-ruff gap.** In the idle guard the arms hang clear of the body: the gap between the
  forearm's inner outline and the coated ribcage never closes below **0.075 m (5.1 px)**, measured
  at the elbow and wrist stations (`M y 1.220` and `M y 0.950`). The numbers that deliver it:
  elbows held 0.045 m out (§4.5) puts the forearm axis at `z ±0.385`, inner surface `±0.309`;
  the coated torso at `M y 1.220` is `±0.222` → **gap 0.087** ✓. **This only works because the
  elbows are out.** With the arms hanging straight at `z ±0.340` the inner surface is `±0.264` and
  the gap collapses to 0.042 — a fail. The ruff will also try to eat this: trim the ruff's lower
  lateral edge at `M y < 1.30`, never the arms.
- **The stance gap.** Between the legs at knee height, **0.16 m (10.8 px)** minimum (§2.4.7).
- **Under-jaw shadow line.** The lower lip and the jaw fur overhang the throat by **0.028 m**,
  cutting a hard dark line under the chin. On a white character this line is doing the job that an
  albedo change does on every other fighter. **It must be modelled, not shaded.**
- **Between the pauldron and the ruff crest** there is a slot of background on each side, visible
  from ±25°. Concretely: at `M y 1.620` the mane's outer surface is at `z ±0.305` and plate 1 runs
  from `z ±0.215` to `±0.385`, so the plate stands **0.080 m clear** of the mane; above the plate's
  top edge (`M y 1.637`) and below the ruff crest (`M y 1.700`) there is **0.063 m** of vertical
  clearance. **The slot is 0.080 × 0.063 m (5.4 × 4.2 px).** Do not let the mane grow through the
  armour and close it — trim the mane's outer shell, never the plate.

---

## 3. Head construction (the most important section)

### 3.0 The head frame — read this before you touch a number

All coordinates in §3 are **`head`-bone-local (`Hd`)**. The `head` pivot sits at `M(0.05, 1.620, 0)`
in the bind pose, so:

```
Hd y = M y − 1.620            Hd x = M x − 0.05            Hd z = M z
chin = −0.085     fur crown = +0.280     H_h = 0.365
```

`x` is **forward**, `y` is up, `z` is lateral (`+z` = character's left).

**Four master units. Every number below is expressed in one of them.**

| Unit | Value | What it measures |
|---|---|---|
| `W_s` | **0.215 m** | skull width across the zygomatic arches, **fur excluded**. Master unit for everything horizontal. |
| `H_h` | **0.365 m** | crown fur → jaw underside. Master unit for everything vertical. |
| `L_sk` | **0.260 m** | backskull length: occiput plane `Hd x −0.130` → stop `Hd x +0.130`. |
| `L_mz` | **0.188 m** | muzzle length: stop `Hd x +0.130` → nose leather front `Hd x +0.318`. |

**Total head length (nose front → occiput plane) = 0.448 m.**
`head length : W_s = 0.448 : 0.215 = 2.08 : 1`, which reproduces the Kuvasz standard's
"width is half the head length" almost exactly (§10).

**`L_mz : L_sk = 0.188 : 0.260 = 0.72 : 1`.** This sits deliberately **between** the Great Pyrenees
standard (muzzle ≈ equal to the backskull, i.e. **1.00 : 1**) and the Akita standard
(nose-to-stop : stop-to-occiput = **2 : 3 = 0.67 : 1**). It is not a copy of either — see §9 D2.
Practically: at 0.72 the muzzle is short enough to read *blocky and powerful* at 128 px, and long
enough that nobody mistakes him for a Shiba (**DOGEY's muzzle is short and pointed**).

### 3.1 Cranium

- Base primitive: a **bevelled box, not a sphere.** `0.248 (x) × 0.190 (y) × 0.215 (z)` with a
  **0.045 m corner fillet**, centred at `Hd(−0.006, +0.105, 0)` — so it spans
  `x −0.130 → +0.118`, `y +0.010 → +0.200`, `z ±0.1075`. A sphere reads as a bear cub; the breed
  standards call the head **"wedge shaped with a slightly rounded crown"** (Pyrenees) and
  **"elongated but not pointed"** (Kuvasz). A filleted box gives flat cheek planes and a rounded
  crown from one primitive. Note the box **top face is the skull dome at `Hd y +0.200`** — every
  number below is consistent with that, which the previous draft's `+0.128` centre was not.

- **The median skull profile, as an explicit polyline.** An implementer will otherwise average two
  contradictory sentences into a dome. All points are `Hd (x, y)` on the median plane, bone
  surface, fur excluded:

| # | Landmark | `Hd x` | `Hd y` | segment to next |
|---|---|---|---|---|
| P0 | Occiput plane, where the skull enters the mane | −0.130 | +0.150 | +66.8° up |
| P1 | **Occiput crest apex** | −0.112 | +0.192 | **+6.8°** — level backskull |
| P2 | **Skull dome high point** | −0.045 | +0.200 | **−35.6°** — the frontal ramp |
| P3 | Stop, blend tangent (rear) | +0.106 | +0.092 | blend arc |
| P4 | **Stop landmark** (defines `L_sk`/`L_mz`) | **+0.130** | **+0.062** | blend arc |
| P5 | Stop, blend tangent (front) | +0.158 | +0.059 | **−8.7°** — the bridge |
| P6 | Nose top plane, rear edge | +0.276 | +0.041 | 0° — the cap |
| P7 | Nose top plane, front edge (**frontmost point of the head**) | +0.318 | +0.041 | −68° — the front face, tilted back 22° from vertical |
| P8 | Nose front face, lower edge | +0.293 | −0.021 | — |

  **The three angles that matter: backskull +6.8° (level), frontal ramp −35.6°, muzzle bridge
  −8.7°. The stop is therefore a `35.6 − 8.7 =` 26.9° plane break — call it 27°** (§3.4), blended
  over a **0.035 m radius**. There is no "flat skull top plane running to the stop" — that sentence, in
  the previous draft, was geometrically impossible against this table and would have produced
  either a bulldog forehead or a flat-topped brick.
- **A shallow median furrow** runs from P1 to P3: 0.010 m wide, **0.004 m deep**, fading out
  0.030 m before the occiput. It is what makes the frontal read as bone rather than as a lid.
  (Akita standard: "a shallow furrow extends well up forehead".)
- **Cheeks are FLAT.** Both cited standards say so explicitly. The lateral skull planes are
  planar from `Hd y +0.055` to `+0.155` (the box's fillet eats 0.045 above and below), with only
  the zygomatic arch breaking them — a **0.009 m proud ridge**, i.e. crest at **`z ±0.1165`**,
  running from `Hd(+0.070, +0.062, ±0.1165)` back to `Hd(−0.055, +0.090, ±0.1145)`. (The previous
  draft put the crest at `±0.104`, which is *inside* the skull box and would have been invisible.)
  Under raking light this ridge is one of only four things describing the head's volume (§6.2).
- **Occiput crest**: a modest 0.016 m bump peaking at `Hd(−0.112, +0.192, 0)`, spanning `z ±0.030`.
  It is buried under long guard hair and reads only as a slight peak in the crown fur. Do not make
  it a spike — that is a hound.
- **Fur shell over the cranium**: guard hair adds **0.080 m** over the crown and occiput
  (`Hd y +0.200 → +0.280` = the silhouette top at `M y 1.900`), tapering to **0.012 m** on the
  forehead ramp and **0.006 m** on the muzzle (§3.9). **That 0.080 m of crown coat is deliberate
  and it is load-bearing**: it means the top 21 % of the head's height is *hair, not skull*, which
  is what lets a small skull sit inside a big cloud (§1.1) without making the cranium ugly. The
  crown fur outline is **irregular** — 5 lock breakers, 0.020–0.038 m proud, along the crown's
  profile.

### 3.2 Brow ridge, and the seam line that nobody builds

- **Supraorbital ridge**: a bevelled wedge over each eye. Front face at **`Hd x = +0.109`**,
  standing **0.012 m proud** of the corneal apex (`Hd x +0.0969`, §3.3). Its **top edge runs
  back and up**, from `Hd(+0.109, +0.108, ±0.098)` over the eye to `Hd(+0.030, +0.145, ±0.070)`
  where it merges into the frontal ramp — so it stands **0.018 m proud of the median frontal at
  the eye, tapering to 0 by `Hd x +0.030`.** It dies out laterally at `z = ±0.098` and medially
  at `z = ±0.030`, leaving a **0.060 m wide strip** of forehead on the median plane between the
  two ridges, following the ramp. That strip is what makes the brow read as two separate ridges
  rather than one shelf — this is a dog, not an ape (**TIRED APE has a continuous torus brow**;
  do not build one here). **The strip is a strip, not a trench: it is never more than 0.018 m
  below the ridge tops.** If you find yourself carving a canyon down the middle of the forehead,
  your ridge is too tall.
- **Brow behaviour is the whole expression.** There is no dark brow marking on a white dog and no
  eyebrow hair to speak of, so the brow reads **only** as a self-shadowing form. Give it a real
  `browL`/`browR` face-rig pivot (see §0.2 — **not** an exported bone; publish it on
  `model.userData.faceRig`). Rotation range: inner end **−10° (angry) → +16° (worried/hurt)**;
  outer end **−4° → +7°**. Idle is **flat 0°**, and flat 0° on both is the stoic read.
- **A very slight tonal aid is permitted and encouraged**: a `COAT_SHADE` wedge
  `0.058 (x) × 0.016 (y)` sitting on the ridge above each eye, rotated **−8°**, at **35 % opacity
  blend into the coat albedo**. This is the current file's "noble brows" idea and it is correct —
  but the current version is a hard-edged `furShade` box at full strength, which reads as a
  painted eyebrow. Soften it or it looks like a cartoon.
- **The fur seam line — build this, it is free character.** The Great Pyrenees standard describes
  *"a characteristic meeting of the hair of the upper and lower face which forms a line from the
  outer corner of the eye to the base of the ear."* This is a real, nameable, breed-specific
  feature and almost nobody models it. Build it as:
  - a **0.006 m raised ridge** running from `Hd(+0.078, +0.086, ±0.092)` (outer eye corner, on the
    coat surface) back to `Hd(−0.040, +0.098, ±0.138)` (ear base, front edge — note the `z` grows
    because the cheek coat thickens from 0.012 m at the eye to 0.055 m at the ear line, §3.9);
  - **above** the line the guard hair lies **down-and-back** (normal-map flow direction −12°);
    **below** it the cheek hair sweeps **up-and-back** (+24°);
  - the two flows meeting produce a thin self-shadowed crease that survives to about 2 m.
  It costs one flow-direction change in the head's normal map and one thin extruded strip.

### 3.3 Eyes

The eyes are the most important 0.0026 m² on this character, because on an all-white head they and
the nose are **the only high-contrast events** (§3.11).

| Property | Value | As a ratio |
|---|---|---|
| Aperture width | **0.066 m** | **0.307 × `W_s`** |
| Aperture height (idle, lids open) | **0.032 m** | 0.088 × `H_h`; aspect **2.06 : 1** |
| Aperture centre (on the coat surface) | `Hd(+0.089, +0.090, ±0.0705)` | — |
| **Eyeball centre** | `Hd(+0.056, +0.090, ±0.0625)` | — |
| Interpupillary distance (ball centre to ball centre) | **0.125 m** | **0.581 × `W_s`** |
| Eye centre line above the chin | 0.175 m | **0.48 × `H_h`** (just below mid-head) |
| **Eyeball radius** | **0.040 m** | aperture shows **82.5 %** of the ball's width |
| Corneal apex (cap radius 0.043 from the ball centre) | `Hd(+0.0969, +0.090, ±0.0758)` | gaze axes splayed **18°** off the median plane |
| Iris diameter | **0.026 m** | **0.325 × ball diameter**; **0.81 × aperture height** |
| Pupil diameter | 0.011 m | 0.42 × iris |
| Upper lid coverage, idle | **top 28 %** of the visible ball height | see below |
| Lower lid | straight and taut, 0° | — |
| Obliquity | outer canthus **+7°** above the inner | — |
| Pigment rim band | **0.006 m**, widening to **0.009 m** on the upper lid | — |

> **The previous draft of this table was geometrically impossible and produced an ugly eye.** It
> paired a **0.066 m aperture with a 0.030 m-radius (0.060 m-wide) ball** — an aperture wider than
> the eyeball, which cannot be modelled: you would see past the sclera into the socket at both
> canthi. The corrected ball is **r 0.040**, which closes three things at once: the aperture shows
> 82.5 % of the ball (a wide, steady, fully-open dog eye), the ball's lateral edge sits at
> `z ±0.1025` — **0.005 m inside the skull's `±0.1075`**, so it fits — and its medial edge at
> `±0.0225` leaves a **0.045 m** bridge of bone between the sockets. Check all three before you
> touch anything else in this section.

Notes that decide whether this works:

- **Almond, set slightly obliquely, rich dark brown** — the wording is identical in the Pyrenees and
  Kuvasz standards. **7°** of obliquity is the number: enough to read as almond, far short of the
  Akita's hard slant, and far short of DOGEY's meme side-eye.
- **28 % lid coverage, not 60 %.** Shibro's calm comes from a *steady, fully open* gaze under a
  *level* brow. TIRED APE is 62 % closed; COOL PAL is half-closed. If Shibro's lids droop he
  becomes another chill guy and the whole "vigilant guardian" premise dies.
- **The black eye rims are not decoration, they are the eye.** Both standards specify
  *close-fitting black-rimmed eyelids*. On a `COAT` (`Y 0.649`) head, a `PIGMENT` (`Y 0.031`) rim is
  a **21 : 1** step (§5) — it is the single highest-contrast edge on the model. Build it as real
  geometry: a **0.006 m** band of dark lid extruded 0.003 m proud, following the aperture all the
  way round, **not** a texture ring.
- Around each eye, a **0.030 m halo of `COAT_SHADE`-tinted, shorter, finer fur** (the pigmented
  peri-orbital skin showing through). Measured on reference: the fur immediately around the eye is
  0.5–0.7 stops darker than the forehead. This halo is what stops the eyes looking like two beads
  glued to a snowball.
- **Full eye construction is mandatory** (`GRAPHICS_CONTRACT.md` §9): sclera sphere + iris disc +
  pupil + a separate corneal cap (`glass` preset, roughness 0.04) + geometric upper and lower lid
  solids. **One crisp specular dot per eye**, positioned up-and-toward the key (upper-nasal
  quadrant), diameter ≈ 0.004 m.
- **Sclera is barely visible and must not be white.** `SCLERA #E9E3D6`. Visible sclera at idle:
  a **0.004 m** crescent at the lower-outer corner only (this is what the reference photograph
  shows — a pale sliver at the outer canthus, not a ring). Sclera flashes wide only in `hurt`.
- **Orbital depth:** the eye sits *in* a socket, and the socket is built from **two separate
  forms**, which the previous draft conflated. **(a)** The supraorbital ridge's front face at
  `Hd x +0.109` — **0.012 m proud** of the corneal apex (`+0.0969`), directly above the eye.
  **(b)** The infraorbital / cheek mass immediately *below* the eye, front face at
  `Hd x +0.105` — **0.008 m proud** of the apex. Neither of these is the **zygomatic arch**, which
  is a *lateral* ridge at `z ±0.1165` (§3.1) and contributes nothing to orbital depth. Under the
  match rig's overhead key (a) and (b) together produce a
  genuine cast shadow across the upper third of each eye — **which is the entire reason the eyes
  read at all on a white head.** If your eyes look flat, the socket is too shallow, not the iris
  too light.

### 3.4 The stop

- **The stop is a 27° plane break** (`35.6 − 8.7`, §3.1), not a step and not a smooth blend.
  The frontal ramp (**−35.6°** nose-down) meets the muzzle bridge plane (**−8.7°** nose-down);
  the stop landmark on the surface is `Hd(+0.130, +0.062, 0)`, between blend tangents at
  `Hd(+0.106, +0.092)` and `Hd(+0.158, +0.059)`.
- **Blend radius 0.035 m** across the break — a rounded transition, not a chamfer and not a crease.
  In the Pyrenees standard the stop is barely apparent; in the Akita it is "well defined, but not
  too abrupt"; the Kuvasz says it is "defined, never abrupt, raising the forehead gently above the
  plane of the muzzle" — which is exactly what 27° over a 0.035 blend does. **27° is our number**
  and it is a deliberate deviation from all three (§9 D2).
- The break must be **visible in profile at 128 px** as a soft inflection, `≈2 px`. Test by
  rendering the head profile at 128 px and looking for the change of slope. If the profile is one
  arc, tighten the blend to 0.025 m before you touch the angles — the angles are load-bearing
  against §3.1's polyline and changing them un-closes the whole head.
- Laterally the stop dies out by `z = ±0.070`; outside that the brow ridges take over.

### 3.5 Muzzle

- **Cross-section: rounded rectangle, wider than deep at the base, near-square at the front.**

| Station | width (z) | depth (y, bridge → jaw underside) | W : D |
|---|---|---|---|
| Base (`Hd x +0.135`) | **0.150** | **0.135** | 1.11 |
| Mid (`Hd x +0.225`) | 0.134 | 0.118 | 1.14 |
| Front (`Hd x +0.310`) | **0.118** | **0.098** | 1.20 |

- **Taper = 0.118 / 0.150 = 0.79.** Both standards say the muzzle "tapers gradually, but never to a
  point" / "not pointed". 0.79 over 0.188 m is that. **Below 0.70 you have built a collie; above
  0.90 you have built a boxer.**
- Corner fillet radius **0.022 m** — big enough to kill the box, small enough to keep four readable
  planes (top, two sides, underside). **Those four planes are the muzzle**; a tube has none.
- **Top plane (the bridge) is STRAIGHT**, dropping **−8.7°** from the stop blend to the nose's top
  plane (§3.1 P5 → P6). Kuvasz: "top straight, not pointed". No dish, no roman curve. (The
  previous draft said −13.0°, which does not connect `Hd(+0.158, +0.059)` to `Hd(+0.276, +0.041)`
  and would have driven the nose 0.007 m below the muzzle's front station.)
- The bridge carries a **0.008 m wide, 0.003 m deep** median groove from the stop forward to the
  nose top plane, and the short muzzle fur flows **radially outward and forward** from the bridge
  centreline (§6.4).
- **Underside**: the lower jaw's front is at `Hd x +0.248`, i.e. **0.070 m behind the nose front**
  (`+0.318`). Dogs' chins recede. At that station the muzzle underside is at `Hd y −0.066`
  (bridge `−0.049` minus depth `0.117`), and the plane runs back and down at **+4.2°** to the jaw
  underside at `Hd(−0.010, −0.085, 0)`. Check that closure: `(0.085 − 0.066) / 0.258 = tan 4.2°`.
- **The muzzle is the lightest-fur region on the head** — short, fine, dense hair over the nasal
  bone with almost no lock structure. Measured on reference, the muzzle bridge is the **highest
  luminance patch of the whole animal** (`Y 0.762` under diffuse daylight). Build it as
  `COAT_LIGHT`, not `COAT` (§5).

### 3.6 Nose

The nose is 0.005 m² of black on a 1.9 m white animal and it does an outsized amount of work.

- **Leather block**: `0.082 (z) × 0.062 (y) × 0.042 (x)`, a bevelled wedge with a **0.010 m** fillet,
  centred at `Hd(+0.297, +0.010, 0)` → spans `x +0.276 → +0.318`, `y −0.021 → +0.041`, `z ±0.041`.
  **Its frontmost point is the top-front edge at `Hd x = +0.318`, and that is the frontmost point
  of the whole character.**
- **Front plane tilted back 22° from vertical**, so the bottom-front edge sits at
  `Hd x +0.318 − 0.062·tan 22° = +0.293`. This matters: it means the front plane faces
  *down-forward*, so under the match rig's overhead key it goes **near-black** while the top plane
  goes **cool mid-grey**. Measured on reference: nose front `#313339` (`Y 0.033`), nose top plane
  `#9A9EA6` (`Y 0.341`) — a **10 : 1 range inside one 0.08 m object**. Reproduce that range or the
  nose reads as a flat black sticker.
- **Top plane** ("the cap") spans `Hd x +0.276 → +0.318`; the two 0.010 m fillets leave a
  **flat cap 0.022 m deep**, near-horizontal at `Hd y +0.041`. It is the part that catches sky.
  `PIGMENT` albedo, but let the hemisphere fill do the lifting — **do not paint it grey.**
- **Nostrils**: comma-shaped slits, **0.026 m** long, 0.010 m at the fat (rostral) end tapering to
  0.003 m, opening **laterally and backward** at 35° off the median plane, so each slit spans
  `0.026 · sin 35° = 0.015 m` of `z`. Slit centres at `z = ±0.024`, so the slits run
  `z ±0.0165 → ±0.0315` and their **medial edges are 0.033 m apart** (the previous draft said
  0.016, which is the *centre-to-medial-edge* distance and would have pushed the two nostrils into
  each other across the philtrum). Lateral edges at `±0.0315` sit 0.010 m inside the leather's
  `±0.041`. Recessed **0.008 m**. A tiny wet glint inside each one is worth more than any amount
  of muzzle detail.
- **Philtrum**: a groove **0.007 m** wide, **0.005 m** deep, running 0.048 m from the nose's lower
  edge down to the lip seam. It splits the upper lip into two lobes — build the lobes as separate
  soft masses, they catch the rim.
- **Roughness 0.28 with a clearcoat of 0.30** on the leather, and a **pebbled micro-normal**
  (`leather`, scale 0.35, §6). A dog's nose is the only *wet* thing on the exterior of this
  character. **One crisp specular highlight, off-centre, on the upper-left of the leather.**
- **Do not make the nose bigger to help the read.** `0.082 / 0.215 = 0.38 × W_s`, and
  `nose width : interpupillary = 0.082 : 0.125 = 0.66`, which is within 8 % of the measured
  reference (0.71, §10). A bigger nose reads as a plush toy.

### 3.7 Mouth, lips and jaw

- **Lip seam** at `Hd y = −0.048`, running from the front of the muzzle (`Hd x +0.300`, on the
  median) back to the commissure at `Hd(+0.205, −0.042, ±0.058)`. **Seam length 0.111 m per side**
  — that is the 3-D distance `√(0.095² + 0.006² + 0.058²)`, not the 0.095 m of `x` travel the
  previous draft quoted. Build 0.111 m of pigment band or the corner will fall short of the
  commissure.
- **Mouth width across the corners = 0.116 m = 0.54 × `W_s`.**
- **Corner direction: 0° to −2°. LEVEL.** Not up (that is a grin — DOGEY), not down (that is a
  grimace — TIRED APE, PEEPEE). Shibro's mouth is a straight dark line, and its straightness is
  the character. The single most common failure mode on this fighter is a build that curves the
  mouth "to give him personality" and produces a golden retriever.
- **Black pigment band along the entire seam**, 0.010 m tall, `PIGMENT`. Both standards specify
  black lips. This line is the second-longest dark event on the head after the eye rims, and in
  profile at 128 px it is what tells you the head has a front.
- **Flews**: the upper lip overhangs the lower by **0.012 m**, with a **0.008 m scallop** at the
  commissure. Tight, not houndy — the Kuvasz standard says "lips black and tight". Jowl mass per
  side ≈ 0.024 m thick; it jiggles (§8.2), but only just.
- **Jaw opening**: the `jaw` pivot (face-rig, not an exported bone) at `Hd(−0.020, −0.030, 0)`.
  Range **0° → 34°**. At full open the mouth interior shows: `TONGUE`, a dark palate, and
  **8 upper + 8 lower** simplified teeth with **two 0.020 m canines** per jaw that are the only
  individually-modelled ones. Teeth are **`BONE` white — the only near-`COAT_LIGHT` value inside a
  dark hole**, which is what makes the bark read.
- **The mouth is CLOSED by default.** Open only in `treasuryBark`, `hurt`, `KO`, `taunt`.

### 3.8 Ears — the anti-collision cue

**Read §1.2 again before you build these.** Getting the ears wrong is the only mistake on this
character that cannot be rescued by good surfacing.

- **Form**: a **V-shaped leather with a slightly rounded tip** (both standards). Rounded isoceles
  triangle: **base chord 0.102 m**, **length 0.125 m** measured along the leather's curved long
  axis from the base's midpoint to the tip, **tip fillet radius 0.016 m**, thickness **0.014 m at
  the base → 0.008 m at the tip**. Front edge slightly **convex**, rear edge slightly **concave**
  — that asymmetry is what makes it read as an ear rather than a triangle.
- **Set: at eye level, and set back.** Base arc **on the coat surface** (not on the skull — the
  cheek coat is 0.055 m thick here, §3.9) from `Hd(+0.030, +0.105, ±0.142)` to
  `Hd(−0.070, +0.088, ±0.150)`; base midpoint `Hd(−0.020, +0.0965, ±0.146)`. The chord of that arc
  is **0.102 m**, which is where the base measurement above comes from — the previous draft said
  0.088 and did not match its own endpoints. Top of the set at `Hd y +0.105`, i.e. **0.015 m above
  the eye centre line**: "set on at eye level" (Pyrenees) and "between the level of the eye and the
  top of the head, well set back" (Kuvasz), both satisfied — and note the base's `x` range runs from
  `+0.030` **back** to `−0.070`, i.e. the ear is set *behind* the eye, which is the Kuvasz's
  "well set back" and which the previous draft's "at eye level, and wide" quietly dropped.
- **Carriage: low, flat, close.** The leather's plane normal points **outward and 12° down-forward**.
  The tip hangs to `Hd(−0.005, −0.020, ±0.156)` — **0.022 m above the mouth corner**
  (commissure `Hd y −0.042`), level with the rear third of the lower lip. The straight-line chord
  from base midpoint to tip is 0.118 m; the leather is 0.125 m because it bows over the cheek.
- **Projection beyond the local coat outline ≤ 0.012 m (0.8 px at 128).** Concretely: the coat
  surface under the ear base is at `z ±0.146`; the leather's mid-plane lies on it and its outer
  face reaches **`z ±0.158`** at mid-length — **0.0045 m inside the head's widest point
  (`±0.1625`, the cheek ruff just below and behind the ear, §2.2).** The ear is a *surface
  feature*, not a silhouette feature. See the two-part test in §2.4.8.
- **Sanity check against the Kuvasz standard**: "when pulled forward the tip of the ear should
  cover the eye". Measured from the base midpoint `Hd(−0.020, +0.0965, ±0.146)`: the **outer
  canthus** `Hd(+0.078, +0.086, ±0.092)` is **0.112 m** away and the **aperture centre**
  `Hd(+0.089, +0.090, ±0.0705)` is **0.133 m** away. A 0.125 m leather therefore covers the outer
  canthus by 0.013 m and stops 0.008 m short of the pupil — **it covers the outer half of the eye,
  not the whole eye.** That is the honest number; do not lengthen the leather to 0.135 m to "pass"
  the standard, because 0.135 hangs the tip level with the mouth corner and starts eating the jaw
  notch (§2.5). 0.125 is the right compromise and D3 already declares the ear as ours.
- **No gaps** (contract §9): the ear's **front edge and upper base are sleeved into the cheek and
  crown fur** with a modelled root fold, 0.010 m of overlap. Only the **lower 60 %** of the rear
  edge lifts free, by **0.010 m**, cutting a thin shadow wedge. That wedge is the whole reason the
  ear looks attached rather than printed.
- **Concha**: a shallow bowl on the inner face, **0.048 m** across, **0.022 m** deep, opening
  forward-down. It is the **only** place a warm pinkish tone appears on the model
  (`#C9A39B` at 45 % blend into `COAT_SHADE` — a hint, not the current file's flat pink cone).
  From the match camera the concha is barely visible; build it anyway, it shows in the KO
  close-up and when a torn ear tumbles.
- **The badger patch is what makes the ear exist.** `BADGER #8E8272` covering **85 %** of the outer
  leather face, feathered into the coat over a 0.018 m gradient, with a slightly darker core at
  the ear's upper third. Against `COAT` this is a **2.8 : 1** value step (§5) — enough to be
  unmistakable, not so much that he grows spots. Both standards permit markings of
  *grey / badger / reddish-brown / tan* **on the ears and head**, so this is breed-honest.
- **Alert pose (`earL`/`earR` are real bones; use them):** the base rotates **+22° up, +10°
  forward**, the tip lifts **0.035 m**, and a small triangular void opens behind the base.
  **The ear never becomes erect. Clamp the bone at +26°.** Hard-clamp it in code if the animator's
  spring can overshoot past it.
- **Ear fur**: short and fine on the leather (standard), with a **fringe of 4–6 longer locks
  (0.028–0.042 m)** at the base where it meets the ruff. That fringe is what visually welds the ear
  into the coat.

### 3.9 Head fur zoning — where short becomes long

Both standards say it explicitly: *the hair on the face and ears is shorter and of finer texture*.
That is a **geometric** boundary, not a texture one, and it is the reason the head reads as a
distinct small wedge inside a large cloud.

| Zone | Shell offset over the form | Preset (§6.1) | `mapOpts.scale` | Flow direction |
|---|---|---|---|---|
| Muzzle, nose bridge, chin | **0.006 m** | `fur` | 0.7 | radial outward from the bridge centreline |
| Forehead, brow, around the eyes | **0.012 m** | `fur` | 0.9 | back and slightly out, −12° |
| Ear leather (outer face) | **0.005 m** | `fur` | 0.6 | down the leather, along its long axis |
| Cheek, forward of the ear (at the eye) | **0.012 m** | `fur` | 0.9 | up and back, +24° |
| **Cheek / jaw ruff at the ear line** | **0.055 m** | `fur-long` | 1.4 | **up and back, +24°** |
| Crown and occiput | **0.080 m** | `fur-long` | 1.6 | back, −8° |
| Behind the ear → ruff crest | **0.095 m** | `fur-long` | 2.2 | back and down |

**Two closures this table has to satisfy, and the previous draft failed both:**

1. **Head width.** `W_s` 0.215 + 2 × 0.055 = **0.325 m** = §2.2's "head at its widest". The old
   0.026 m cheek shell gave 0.267 and silently broke the headline 1 : 1.85 ratio. The 0.055 is at
   the **ear line** (`M y 1.725`, `Hd x −0.02`); forward of the ear, at the eye, the cheek coat
   thins to 0.012. That forward taper is what keeps the muzzle-and-eye region crisp.
2. **Silhouette top.** Skull dome bone `Hd +0.200` + 0.080 crown coat = `Hd +0.280` = `M y 1.900`
   = H. The old 0.035 m crown shell left the figure 0.045 m short of its own stated height.

**The step from 0.012 to 0.055 happens across the seam line of §3.2.** Build the step; do not
smooth it. Verified on all four reference photographs: the transition from the smooth muzzle to the
exploding cheek fur is abrupt and it happens on that exact line. **That step is a 0.043 m cliff and
it is the single cheapest piece of character on the head.**

### 3.10 Head carriage — bake these into the bind pose

- **Median axis pitched +2.0° nose-up.** Chin up, not down. This is the difference between
  *vigilant* and *submissive*, and it costs nothing.
- **Head centred over the shoulders, not in front of them.** `head` pivot `M x = +0.05` against an
  `arm` pivot at `M x = +0.02` — the head leads the shoulder by only 0.03 m. (TIRED APE leads by
  0.06 m and slouches; Shibro does not.)
- **Zero yaw, zero roll in the bind pose.** Shibro's asymmetry (§8.3) is applied per-pose by the
  animator, not baked. He is the one fighter whose neutral is genuinely square, and that squareness
  is characterisation.
- **The head does not lead any action** (§8.3) — but it also never sinks. There is no hunch here.

### 3.11 The dark-accent cluster — the identity shape, given as a budget

TIRED APE's identity shape is a big pale mask. **Shibro has no mask.** His identity shape is the
*absence* of one: a nearly featureless white field interrupted by a very small number of very dark
events. So the spec is a budget, not an outline:

| Accent | Area (m²) | Where |
|---|---|---|
| Nose leather (front + top + nostrils) | 0.0051 | front-lower third |
| Two eye apertures + rims | 0.0052 | mid-height, `z ±0.0625` |
| Lip seam band (both sides) | 0.0022 | front-lower third |
| Two ear badger patches | 0.0110 | lateral, mid-height |
| **Total** | **0.0235** | — |

Derivations, so you can check them rather than trust them: nose front face `0.082 × 0.062 = 0.0051`;
eye aperture ellipse `π/4 × 0.066 × 0.032 = 0.00166` plus a 0.006 m rim around a ≈0.16 m perimeter
`= 0.00096`, so `0.0026` each, `0.0052` the pair; lip band `0.010 × 0.111 × 2 = 0.0022`; ear patch
`½ × 0.102 × 0.125 × 0.85 = 0.0054` each, `0.0108` the pair.

- **Total dark-accent area = 8–14 % of the head's projected area**, depending on azimuth.
  Worked through: **in profile** you see one ear patch (0.0054), one foreshortened eye (≈0.0016),
  the nose's lateral face (`0.042 × 0.062 = 0.0026`) and one lip band (0.0011) = **0.0107** against
  a head profile area of ≈0.0896 m² → **≈12 %**. **Head-on** you see the nose front (0.0051), both
  eyes (0.0052) and a foreshortened lip band (≈0.0015) and almost no ear = **0.0118** against
  ≈0.0925 m² → **≈13 %**. **If it exceeds 20 % you have started building markings and
  he is turning into a different breed. If it drops below 6 % the face has disappeared.**
- **All of the non-ear accents sit inside the front-lower third of the head** — a box from
  `Hd x +0.150` forward and `Hd y +0.110` down. Above and behind that box the head is *empty*.
  That emptiness is the design; resist the urge to fill it.
- **Every accent must be at full contrast with a crisp edge.** No soft-edged near-black. A blurry
  nose on a white dog is a smudge.
- Corollary for the KO/portrait close-up: because the accents are so few, **each one must survive
  extreme close-up as real geometry** — modelled rims, recessed nostrils, a modelled lip band.

---

## 4. Body & limb proportions

### 4.1 Torso

- **Ribcage core**: a bevelled ovoid, `0.400 (x) × 0.480 (y) × 0.480 (z)`, centred at
  `M(0.010, 1.420, 0)`, fillet 0.060 → it spans `M y 1.180 → 1.660`. **Oval in section, deeper
  than wide** — both standards say the ribs are *"well sprung, oval in shape"* and of depth to
  reach the elbows. Our elbow is at `M y 1.220`; the chest's lowest point is **`M y 1.180`**.
  **The chest bottoms out 0.040 m below the elbow.** Check it — it is the fastest sanity test on
  the whole torso. (The previous draft centred the ovoid at 1.380, which bottoms out at 1.140 and
  contradicted its own 1.180 claim by 0.040 m.)
- **Torso taper (core widths, coat excluded). Monotone by construction — read down the width
  column and confirm it only ever narrows toward the waist:**

| Station | `M y` | width (z) | depth (x) |
|---|---|---|---|
| **Shoulder girdle — widest core** | **1.420** | **0.480** | 0.420 |
| Chest, upper rib | 1.340 | 0.460 | 0.410 |
| Chest, mid rib (the "chest below the ruff" of §2.2) | 1.300 | **0.440** | 0.400 |
| Lower rib | 1.230 | 0.400 | 0.350 |
| **Waist (narrowest)** | **1.100** | **0.330** | 0.300 |
| Hip / pelvis | 1.010 | 0.400 | 0.340 |

  **Waist : shoulder girdle = 0.330 : 0.480 = 0.69; waist : mid-rib chest = 0.330 : 0.440 = 0.75.**
  Quote the second one when you are talking about the visible V. That V is what makes the ruff read —
  a mass that explodes at the shoulders and pinches at the waist. TIRED APE has no waist; Shibro
  has the most defined one in the roster. **Do not let the coat fill it**: the long body coat stops
  at `M y 1.230` and the waist is covered in **short** coat only (§6.1), so the taper survives.
- **Backline is LEVEL.** Both standards. From the ruff crest (`M y 1.700`) the back runs level to
  the croup at `M y 1.310`, then the croup falls **−12°** to the tail root at `M(−0.26, 1.100, 0)`
  ("croup slightly sloping" — Kuvasz). No arch, no roach, no sway.
- **Thoracic forward roll: 6° only.** (Compare: TIRED APE 22°.) Chest lifted, sternum forward.
  This is a fighter who has never slouched in his life.
- **Trapezius / shoulder slope: 26°** from the base of the skull down to the acromion — shallow,
  because the mane fills it. The *visible* slope after the ruff is applied is **≈14°**, which is
  what gives the "no neck, all shoulder" read.
- **Chest ruff (`creamM` "chest fluff" in the current file) is the front face of the mane**, not a
  patch: a bevelled mass from `M y 1.230` to `M y 1.520`, projecting to `M x = +0.300` at its apex
  (`M y 1.440`) — **0.100 m in front of the chest core.** Its lower edge is a **jagged hem of 7–9
  locks**, 0.045–0.090 m long, hanging over the sash line.

### 4.2 Shoulders, mane and the widest point

- **`armL`/`armR` pivots stay at `M(0.02, 1.540, ±0.34)`** — shoulder-joint span **0.680 m**.
  Do not move them; `shoulder-check`, `honor-throw` and `chain-splitter` are keyed to them.
- **Everything else in this subsection is dictated by that frozen ±0.340.** The ribcage is only
  0.480 wide (`±0.240`), so there is **0.100 m of empty space between the ribcage surface and each
  arm pivot** that some form has to fill, and the upper-arm cylinder (r 0.090, §4.3) puts flesh out
  at `±0.430` whatever you do. Build to that reality:
  - **Deltoid / shoulder mass**: a bevelled ovoid `0.190 (x) × 0.200 (y) × 0.190 (z)` centred at
    `M(0.02, 1.520, ±0.340)` → it spans `z ±0.245 → ±0.435`, meeting the ribcage's `±0.240` on the
    inside and the arm cylinder's `±0.430` on the outside. Blend into both with a **0.040 m
    fillet** — **no gap, no visible ball joint** (contract §9).
  - **Shoulder flesh span = 0.870 m** (§2.2). This is not negotiable and it is not the ruff.
  - The previous draft's "bevelled sphere r 0.115 at each pivot" gives `±0.455` = **0.910 m**, which
    is wider than the armour that is supposed to cover it. It was wrong; this is the fix.
- **The neck column — the form the entire mane and the entire collar are built on, and which the
  previous draft never specified at all.** §2.3 says there is no *visible* neck; there is
  emphatically a neck *core*, and if you do not build it the mane has nothing to sit on and the
  collar has nothing to wrap.
  - Axis from `M(0.090, 1.380, 0)` up and slightly forward-leaning-back to `M(0.045, 1.580, 0)` —
    **12.7° off vertical**, carrying the head over the shoulders rather than in front of them
    (§3.10).
  - Section: **`0.320 (x) × 0.300 (z)` at the base, tapering to `0.280 × 0.260` at the skull base.**
    Bevelled, fillet 0.050, sleeved into the ribcage's upper front and into the cranium's
    `Hd y +0.010` underside with **no gap** (contract §9).
  - **`0.300` is the number the whole ruff closes on**: `0.300 + 2 × 0.150` of coat = **0.600 m**,
    §2.2's ruff width, exactly. If your neck core drifts, so does the headline ratio.
- **The mane is the widest soft thing on the *neck*: 0.600 m across at `M y 1.620–1.700`** — over
  the throat and withers, one band **above** the shoulder block, not over it. Build it as
  **two shells** (§6.3): an inner "undercoat" shell offset 0.020 m from the torso in `COAT_DEEP`,
  and an outer "guard hair" shell offset **0.075–0.135 m**, in `COAT`/`COAT_LIGHT`, whose outline
  is broken by **11 modelled locks**.
- **Mane extent**: from the ruff crest (`M y 1.700`, behind and above the ears) forward over the
  shoulders, down the chest to `M y 1.230`, and **around the throat** — it wraps a full 360° of the
  neck, which is why there is no neck (§2.3). *"Mane on neck and shoulders, more pronounced in
  males"* (Pyrenees) / *"neck mane extends to the chest"* (Kuvasz).
- **Mane density gradient:** thickest at the shoulders (0.135 m of coat), thinning to 0.075 m at the
  throat, and **stopping abruptly at `M y 1.230`** where the body coat takes over at 0.045 m. That
  abrupt stop is the second-biggest silhouette event after the head/ruff step.
- **Pauldrons sit ON TOP of the shoulder mass and OUTSIDE the mane** (§7.2), reaching
  `M z ±0.465` — the **0.930 m** widest measurement on the figure, and the only thing on the model
  wider than the 0.870 m of shoulder flesh beneath it. Their straps sink into the fur with a
  modelled compression dimple 0.012 m deep, so the armour looks *strapped over* a coat rather than
  floating on it. **If your pauldron span is under 0.880 the plates are buried inside the dog.**

### 4.3 Arms and paw-hands

| Segment | Length | Notes |
|---|---|---|
| Humerus (`armL/R` → `forearmL/R`) | **0.320** | upper-arm cylinder r 0.090 → 0.078, sleeved into the deltoid |
| Forearm (`forearm` → wrist) | **0.270** | r 0.076 → 0.062; **feathering on the caudal edge** |
| Paw-hand (wrist → fingertip) | **0.130** | see below |
| **Total shoulder → fingertip** | **0.720** | **0.379 × H** |

- **Arm : height = 0.379.** Human-normal. This is deliberate and it is a *characterisation*: TIRED
  APE's arms hang past his knees, Shibro's fingertips (`M y 0.820`) stop **0.360 m above the knee**
  (`M y 0.460`). **He is a person in a dog's body, standing up straight.** Do not "make him more
  animal" by lengthening the arms — that turns him into a second ape.
- **Elbow carriage:** elbows held **0.045 m out** from the ribcage in idle, forearms angled forward
  4°. Open, ready, not tucked.
- **Paw-hand construction** — the character has to punch, grab and hold a blade, so this is a
  *hand shaped like a paw*, not a paw:
  - **Metacarpal pad block**: bevelled `0.090 (x) × 0.062 (y) × 0.110 (z)`, fillet 0.020, palm side
    faced in `PAD`.
  - **Three digits**, each 2 segments (`0.034 + 0.026`), splayed **±16°** and **±32°** from the
    hand axis, with a **0.014 m** toe pad on each pad-side tip and a **0.020 m `CLAW`** at the end.
  - **One opposed carpal digit** (the front dewclaw, standard: *single dewclaw on each foreleg*) at
    the medial wrist, `0.030 m` long, angled 40° back — **it is the thumb.** This is the detail
    that makes the hand legible as a dog's while still gripping.
  - **Knuckle fur**: a 0.020 m tuft over each proximal joint. On a white hand, the knuckles are
    invisible without them.
- **Forearm feathering**: a fringe on the **caudal (rear) edge** only, **0.055 m** deep, 5 modelled
  locks, running from the elbow to 0.050 m short of the wrist. (Kuvasz standard: *back of the
  forelegs feathered 2–3 inches* = 0.051–0.076 m — we are at the lower end because a fighter's arm
  needs to read clean in motion.) **The front edge of the forearm stays smooth.** That asymmetry —
  clean leading edge, ragged trailing edge — is what sells motion in every punch.

### 4.4 Legs, feet, stance

| Segment | Length | `M y` range | `M z` |
|---|---|---|---|
| (`hips` pivot to `legL/R` pivot) | 0.020 down, 0.170 out | 1.000 → 0.980 | 0 → ±0.170 |
| Femur (`legL/R` → `shinL/R`) | **0.520** | 0.980 → 0.460 | ±0.170 |
| Tibia (`shin` → hock) | **0.311** | 0.460 → 0.150 | ±0.170 → ±0.178 |
| Pastern + paw | **0.150** | 0.150 → 0.000 | ±0.178 → ±0.185 |

- **Femur : tibia = 0.520 : 0.311 = 1.67 : 1, and the hock sits at 0.079 H — very high.** (The
  previous draft said 0.543 and 1.75 : 1, running the femur from the `hips` pivot. It does not:
  `legL` is a separate bone at `M(0, 0.980, ±0.170)` and `shinL` is 0.520 below it,
  `shibro.js:117–125`. Use 0.520 or your knee will be 0.023 m off and every `lowSweep` and
  `knockdown` frame will show it.) This is the one place
  where canine skeleton is allowed to overrule human proportion, because a high hock reads
  instantly as *dog* and it costs nothing in animation (`legL/shinL` bend the same way either way).
  The visual result is a long powerful thigh, a short shin and a tall foot.
- **Thigh mass**: bevelled ovoid `0.230 (x) × 0.400 (y) × 0.220 (z)`, plus **pantaloons**.
- **Pantaloons** — the pear-shaped fur skirt on the back of the thigh. From `M y 0.860` down to a
  hem at `M y 0.640`, projecting **0.110 m** behind the thigh at its deepest. (Kuvasz: *thighs
  4–6 inches* = 0.102–0.152 m; Pyrenees: *"feathering… along the back of the thighs, giving a
  pantaloon effect"*.) **Hem is jagged: 6 locks, 0.040–0.075 m.** This is the biggest silhouette
  event below the waist and it is what stops the legs reading as two dowels.
- **Below the pantaloon hem the leg is SHORT-coated and clean.** The standards say the hair on the
  feet is short. That clean lower leg, against the chaos above, is a deliberate value rest.
- **Paw**: *"rounded, close-cupped, well-padded, with arched toes"* (Pyrenees). Four toes,
  0.070 m long each, arched 20°, a large metatarsal pad, `CLAW` nails. Paw footprint
  **0.260 (x) × 0.150 (z)**, so the paw runs `z ±0.185 ∓ 0.075` = **`±0.110 → ±0.260`**.
- **The knee-height gap is a hard constraint and the leg has to be built for it.** §2.4.7 and §11.7
  require **≥ 0.16 m of background between the inner leg outlines at knee height**. At `M y 0.460`
  the leg's axis is at `z ±0.176`, so **the shin's radius there must be ≤ 0.085 m** — giving inner
  outlines at `±0.091` and a gap of **0.182 m**. Build the shin as a taper `0.085 → 0.062` from
  knee to hock. A 0.100 m shin, which is what the current file has (`cyl(0.1, 0.085, 0.4)`,
  `shibro.js:124`), closes the gap to 0.152 and **fails the acceptance test**. Slim the shin; do
  not widen the stance, because the stance is fixed by §2.2.
- **Rear double dewclaws — build them.** *Double dewclaws on each rear leg* is the Great Pyrenees'
  single most distinctive anatomical marker and essentially nobody models it. Two claws on the
  **medial** face of each rear pastern at `M y 0.110`, lengths **0.035 m** and **0.028 m**, splayed
  20° apart, angled down-and-back at 35°. Six extra primitives on the whole model; a genuine
  connoisseur cue; and it gives the lower leg a silhouette event where otherwise there is none.
- **Stance**: paw centres at **`M z = ±0.185`** with a 0.150 m paw width, so the outer edges land at
  `±0.260` → **stance width 0.520 = 0.274 H** ✓. (The previous draft said centres `±0.200` *and*
  outer edges `±0.260`, which needs a 0.120 m-wide paw and contradicts its own 0.150 m footprint.)
  **Fore-aft stagger 0.240 m** (lead paw `M x +0.12`, rear `M x −0.12`), toes turned out **8°**.
- **Weight distribution 55 : 45 onto the REAR foot.** Shibro is a counter-fighter — his stats are
  `defense 9, chaos 3` and half his moveset is parries. He never leans in. Every other fighter's
  idle has forward weight; his has back weight, and that alone reads as *waiting*.

### 4.5 Posture in one sentence

**Square, tall, weight back, chest lifted, shoulders down and level, head carried over the shoulders
with the chin 2° up, both paws low and open — a big animal that has decided not to move yet.**

Concretely, and these are the numbers an animator should not violate:

- Spine: **6°** thoracic forward roll, **0°** lumbar. No hunch, ever.
- Shoulders: **level to within 1°** in idle, and **down** (depressed 0.015 m from neutral).
  Raised shoulders read as tension; Shibro has none.
- Head: **+2° pitch, 0° yaw, 0° roll** in idle.
- Hips: **0° tilt**, 55 : 45 rearward.
- Arms: hanging with the elbows **0.045 m clear** of the ribs; forearms open, paws at
  `M y ≈ 1.05`, palms slightly inward. **He is not in a boxing guard.** The current idle clip's
  `armR: [0, 0, 0.42]` / `forearmR: [0, 0, 0.75]` already reads as an open, low, ready-hands pose —
  keep it.

### 4.6 The tail

- Root: `tail` bone at `M(−0.260, 1.100, 0)` (unchanged from the current file).
- **Carried up and over the back in an OPEN arc.** Five links; the bind pose runs:
  `M(−0.260, 1.100, 0)` → `(−0.380, 1.310, +0.020)` → `(−0.430, 1.560, +0.045)` →
  `(−0.360, 1.760, +0.065)` → **apex `(−0.230, 1.845, +0.075)`** → tip `(−0.105, 1.812, +0.080)`.
- **The tip stops at `M x −0.105` — it never crosses the spine to the front, and it never curls
  back down to touch the croup.** Minimum clearance between the plume's underside and the coat
  beneath it: **0.11 m**, hard floor **0.09 m** (§2.4.3). This is the anti-DOGEY constraint; write
  the clamp into the spring solver, do not trust the animation.
- **Where the clearance is actually tightest, and why the previous arc failed.** The old bind pose
  ended at `M x −0.020` with the plume tip at `y 1.780`. At that station the thing underneath is
  not the back — it is the **mane**, whose crest is at `M y 1.700`. Tip underside
  `1.780 − 0.045 = 1.735` minus mane crest `1.700` = **0.035 m of clearance, below the 0.09 hard
  floor, in the bind pose, before any animation ran.** The corrected tip at `M x −0.105`,
  `y 1.812` gives underside `1.767` over a mane rear surface of ≈`1.660` = **0.107 m** ✓.
  **Measure the clearance against the mane, not against the ribcage.** Everyone who gets this
  wrong measures it against the ribcage, where it is a comfortable 0.25 m and tells you nothing.
- **Offset to one side.** The whole arc sits at `M z ≈ +0.05 → +0.075`, i.e. lying over the
  **left** side of the back. Real carried tails lie to one side, and the asymmetry is worth a lot
  from the profile camera.
- **Plume**: core bone radius 0.035, coat radius **0.065 at the root → 0.085 at the mid →
  0.045 at the tip** (thickest at 60 % of its length, not at the root). **Fringe of 7 modelled
  locks, 0.050–0.090 m, hanging off the lower/outer edge only** — the upper edge stays smoother.
  (Kuvasz: *tail 4–6 inches* of coat.)
- **A parting runs the length of the plume's underside** where the hair falls both ways. One
  0.008 m groove; it is what makes the plume read as hair rather than as a sausage.
- **Both standards describe the low carriage too** — the Pyrenees standard says the tailbones are
  long enough to reach the hock and the tail is carried low in repose, and may be carried over the
  back — the standard's own phrase for that is **"making the wheel"**, not "shepherd's crook",
  which the previous draft had wrong. **We bake the aroused pose**, because a hanging
  tail is invisible behind the pantaloons at 128 px. The `tail` bone's rest-carriage variant
  (dropped to `M y 0.55`) is worth having for `lose` and `KO` — a dropped tail is the most legible
  "beaten" signal in the animal kingdom (§8.1).

---

## 5. Colour script

### 5.1 The rule this whole section exists to enforce

**White fur is never pure white, and its shape is carried almost entirely by occlusion and by edge
light — not by albedo.** Three measured facts, all from §10:

1. Against **fresh snow**, a white mountain dog's lit coat measured `Y 0.739` versus the snow's
   `Y 0.943` — **the dog is 1.28 : 1 darker than snow.**
2. Against a **studio white backdrop**, the coat measured `Y 0.532` versus the backdrop's `Y 0.582`
   — **1.09 : 1. Essentially zero value separation.** In that photograph the animal is legible only
   because (a) the coat is warm (`H 52°, S 16 %`) against a cool-neutral backdrop (`H 250°, S 3 %`),
   and (b) the belly and inter-leg occlusion shadows cut it out of the field.
3. The **internal** range of the coat is enormous and it is all shadow: lit `Y 0.53` → soft form
   shadow `Y 0.29` → deep crevice `Y 0.13`. **4 : 1 inside one material.** And the crevices do not
   go grey — they **gain chroma** (`S 16 % → 24 % → 39 %`) and swing hue toward whatever is bouncing.

Therefore, three build rules, in priority order:

- **R1 — Albedo carries no shadow.** The coat albedo is one warm cream family. **Do not paint
  shading into it.** The engine's `HemisphereLight(#cfe0ff / #54381e)` + warm key (§0.4) already
  produces the cool-shadow / warm-bounce split by itself; painted shadow on top of it double-darkens
  and looks like dirt.
- **R2 — Occlusion carries the form.** A high-strength, **hue-shifted** AO term (`aoFromHeight`,
  `strength 1.25`, tinted toward `COAT_DEEP`) plus a vertex-colour cavity darkening is doing
  the job that an albedo mask does on every other fighter. **If you had to choose one thing to
  spend quality on for this character, it is AO.** Its absence is what makes white characters read
  as, in the words of the rim-light reference, the *"plaster effect"*.
- **R3 — The edges carry the separation.** Warm sheen halo on the key side, cool rim on the fill
  side (§5.5). A light character on a light background cannot be separated by adding more light in
  the middle; only the edges are available.

### 5.2 Palette — named constants to replace the `C = {…}` block

Every albedo below is inside the contract's **30–240 sRGB per channel** (§0 style guardrails) —
verified by assert, not by eye. `Y` is CIE relative luminance from linearised sRGB
(`0.2126 R + 0.7152 G + 0.0722 B`).

| Name | Hex | Y | H / S | Purpose |
|---|---|---|---|---|
| `COAT_LIGHT` | `#EFE7D4` | **0.803** | 42° / 11 % | **Lightest albedo on the model.** Guard-hair tips, crown, muzzle bridge, shoulder tops, the outer 15 % of every lock. Below fresh snow (~236 sRGB) on purpose. |
| `COAT` | `#DCD2BB` | **0.649** | 42° / 15 % | **Base coat. The dominant area on the model** — and, uniquely in this roster, also the *lightest large area*. |
| `COAT_SHADE` | `#AFA28B` | 0.368 | 38° / 21 % | Form-shadow coat: under the jaw, inside the mane, behind the pantaloons, the peri-orbital halo. |
| `COAT_DEEP` | `#6F6555` | 0.133 | 37° / 23 % | **Crevice / AO tint / undercoat shell.** Note the raised saturation — measured crevices gain chroma, they do not go grey. |
| `COAT_SKY` | `#C3CAD2` | 0.585 | 212° / 7 % | The **cool** member. Used *only* as a sheen tint and fresnel top colour on up-facing surfaces (crown, shoulder tops, plume top). **May be used as an albedo on at most 6 % of the coat area** — see §5.4. |
| `BADGER` | `#8E8272` | 0.229 | 34° / 20 % | Ear leather patches, and a faint 0.4-opacity saddle wash over the croup. The only large non-white albedo. |
| `PIGMENT` | `#2E3138` | 0.031 | 222° / 18 % | Nose leather, lip band, eye rims, eyelid solids. **Cool near-black, not neutral black** — measured nose front `#313339`. |
| `SCLERA` | `#E9E3D6` | 0.771 | 41° / 8 % | Eye white. **Never `#FFFFFF`.** |
| `IRIS` | `#4A3220` | 0.038 | 26° / 57 % | *"Rich dark brown"* per both standards. Measured `#463021` — a **saturated warm** brown, not black. |
| `PUPIL` | `#2A2422` | 0.019 | — | Darkest albedo on the model, still ≥30 per channel. |
| `TONGUE` | `#B4636B` | 0.197 | 354° / 45 % | Tongue and inner mouth. Pose-only. |
| `PAD` | `#4A4247` | 0.058 | — | Paw pads, palm side of the hands. |
| `CLAW` | `#C9BFA8` | 0.525 | 42° / 16 % | Nails and dewclaws. **Horn, not black** — Pyrenees nails are pale. |
| `STEEL` | `#8D99AC` | 0.314 | 217° / 18 % | Pauldron plates, collar band. Deliberately **cool and mid-dark** — see §5.3. |
| `STEEL_DARK` | `#5A6376` | 0.124 | 221° / 24 % | Under-plates, straps, collar spike shafts, chest-strap X. |
| `STEEL_NIGHT` | `#3C4457` | 0.058 | 222° / 31 % | Costume 1 armour. |
| `COLLAR_LEATHER` | `#4B3B2E` | 0.048 | 27° / 39 % | Wolf-collar strap. |
| `SASH` | `#2E58D2` | 0.122 | 225° / 78 % | Waist sash, costume 0. |
| `SASH_NIGHT` | `#B92E44` | 0.127 | 351° / 75 % | Waist sash, costume 1. Same `Y` as `SASH` on purpose — the costume swap must not change the value composition. |
| `GOLD` | `#E5B437` | 0.496 | 43° / 76 % | Medallion, rivets, sash hem tip. `metalness 1.0`. |
| `BLADE` / `BLADE_CORE` | `#34D6E6` / `#D8FBFF` | — | **Emissive only, never albedo** — the 30–240 rule does not apply. The sole bloom source on the character. |
| ~~`SHEEN_TINT`~~ **`sheenTint: 0.45`** | *(scalar, not a colour)* | — | **Not a palette entry and not a colour you may set.** `applySurface()` derives the sheen colour as `albedo.lerp(white, 1 − sheenTint)` (§0.6.3), so on `COAT #DCD2BB` a `sheenTint` of **0.45** yields a sheen of ≈`#EFEBE0` — the warm halo §6.2 wants. Delete any `SHEEN_TINT` hex from the palette block; a constant nobody can apply is worse than no constant. |
| `RIM_REQUEST` | `#5F7BD1` | — | Not albedo, not ours to set — see §5.5. |

### 5.3 The value ladder

| # | Constant | Y | Area on model |
|---|---|---|---|
| 1 | `COAT_LIGHT` | 0.803 | **large — tips, crown, muzzle, shoulder tops** |
| 2 | `SCLERA` | 0.771 | tiny |
| 3 | **`COAT`** | **0.649** | **largest area on the model** |
| 4 | `COAT_SKY` | 0.585 | edges and sheen only |
| 5 | `CLAW` | 0.525 | tiny |
| 6 | `GOLD` | 0.496 | small, very high chroma |
| 7 | `COAT_SHADE` | 0.368 | medium |
| 8 | `STEEL` | 0.314 | medium (pauldrons, collar) |
| 9 | `BADGER` | 0.229 | small (ears) + a wash |
| 10 | `TONGUE` | 0.197 | pose-only |
| 11 | `COAT_DEEP` | 0.133 | crevices |
| 12 | `SASH_NIGHT` | 0.127 | medium (costume 1) |
| 13 | `STEEL_DARK` | 0.124 | thin bands |
| 14 | `SASH` | 0.122 | medium (costume 0) |
| 15 | `PAD` | 0.058 | small |
| 16 | `STEEL_NIGHT` | 0.058 | medium (costume 1) |
| 17 | `COLLAR_LEATHER` | 0.048 | thin band |
| 18 | `IRIS` | 0.038 | tiny |
| 19 | `PIGMENT` | 0.031 | **tiny, and it is the entire face** |
| 20 | `PUPIL` | 0.019 | tiny |

**Read that ladder again: positions 1 and 3 are the two biggest areas, and they are at the top.**
Shibro is the roster's only *high-key* character. Every other fighter is a dark mass with light
accents; he is a light mass with dark accents. That inversion is the design.

### 5.4 Value relationships — the part that matters

- **The `COAT_SKY` cap, promised in §5.2 and stated here: `COAT_SKY` may be used as an *albedo* on
  at most 6 % of the coat's surface area** — realistically the crown's top locks, the shoulder-top
  locks and the plume's upper edge, and nothing else. Everywhere else it is a *fresnel target*
  (§5.5.2), not a paint. Above 6 % the coat stops reading as one warm material lit from two sides
  and starts reading as a two-tone dye job, which is a completely different (and much cheaper-looking)
  animal.
- **`COAT_LIGHT` : `COAT` = 1.24 : 1.** Small on purpose. The tip-vs-body difference must read as
  *sheen and occlusion*, not as two-tone paint. If you push this past 1.5 : 1 he looks bleached.
- **`COAT` : `COAT_DEEP` = 4.86 : 1**, and **`COAT_LIGHT` : `COAT_DEEP` = 6.0 : 1.** This is the
  character's real dynamic range and it reproduces the measured coat range (4 : 1 lit-to-crevice,
  §5.1.3) with a little extra headroom for stylisation. **This ratio lives in the AO map and in the
  undercoat shell, not in a hand-painted albedo.**
- **`COAT` : `PIGMENT` = 21.2 : 1**, `COAT_LIGHT` : `PIGMENT` = **26 : 1**. The nose, lip band and
  eye rims are the highest-contrast events on any fighter in the roster. That is correct and it is
  why §3.11 caps their *area* so tightly — 26 : 1 over 14 % of the head is a face; over 30 % it is
  a panda.
- **`COAT` : `STEEL` = 2.07 : 1.** This number is load-bearing and it is the reason the armour is
  cool mid-dark rather than bright silver. **A bright-silver pauldron on a cream coat separates by
  only ~1.2 : 1 and disappears.** If you brighten `STEEL`, you lose the armour.
- **`COAT` : `GOLD` = 1.31 : 1 — gold does NOT separate from the coat by value.** So:
  **never put gold directly against the coat.** Every gold element must sit on or immediately
  beside a dark: the medallion on the `STEEL_DARK` chest strap, the rivets on the `STEEL`
  pauldrons, the sash tip on `SASH`. Its 76 % chroma plus `envMapIntensity` does the rest.
- **`COAT` : `SASH` = 5.31 : 1 and `SASH` is 78 % saturated.** The sash is the second-strongest
  read on the body and the only large chromatic event. It also happens to be the bone that flies
  off at 70 % damage (§0.3) — losing it is a visible, readable loss.
- **The costume swap preserves the value composition**: `SASH` `Y 0.122` → `SASH_NIGHT` `Y 0.127`;
  `STEEL` `Y 0.314` → `STEEL_NIGHT` `Y 0.058` (darker, deliberately — costume 1 is a night
  silhouette and the armour is meant to recede).
- **Acceptance test: desaturate a 128 px render.** The nose, both eyes, both ear patches, the
  collar band, the pauldrons and the sash must all still be individually identifiable. If the
  pauldrons vanish, `STEEL` has drifted light. If the ears vanish, `BADGER` has drifted light.

### 5.5 Separation — what this agent may and may not do

**We do not own the light rig.** `src/render/lighting.js` belongs to the foundation agent and
`src/arenas/<id>.js` to each arena agent (`GRAPHICS_CONTRACT.md` §1: *never edit a file you do not
own*). So:

**Do — in `shibro.js`, which is ours:**

1. **Warm sheen halo.** `pbr(COAT, 'fur-long', { sheen: 0.42, sheenRoughness: 0.55, sheenTint: 0.45 })`.
   **Three scalars — there is no `sheenColor` argument** (§0.6.3); the engine derives the halo's
   colour from the albedo, which on a warm cream is exactly the warm halo we want (≈`#EFEBE0`).
   This is the *"tiny stray fibers that catch the light when lit from behind, giving a halo effect"*
   from the rim-light reference, and it works under **any** arena light because it is a material
   response, not a light. **This is the character's insurance policy. Build it first.**
   Note the `fur-long` preset already defaults to `sheen 0.7 / sheenRoughness 0.6 / sheenTint 0.45`;
   we override the strength down to 0.42 because §6.2 wants the lobe grazing-only.
2. **Fresnel grazing lift** via the contract's `gradientRamp()` LUT on the coat, `power 3.2`,
   lifting the grazing band by **+0.14** toward `COAT_LIGHT` on the top half of the body and
   toward `COAT_SKY` on up-facing surfaces. The LUT is what makes a big pale mass read as
   volumetric instead of as a decal.
3. **Carry your own darks.** The collar band, the `STEEL_DARK` chest strap, the sash, the pads and
   the pigment cluster are all deliberately placed **at the boundaries where the silhouette needs
   help**: the collar at the head/body junction, the strap at the chest, the sash at the waist,
   the pads at the hands. A white character that packs its own dark bands at its joints will read
   against any background. **This is the most important sentence in §5 after R1–R3.**
4. **Hue-shifted AO** (R2). You cannot ask `surfaceMaps()` for a stronger AO — its radius and
   strength are baked per kind (§0.6.4). The two knobs you *do* have, and must use both:
   **(a)** `pbr(..., { aoIntensity: 1.25 })` — one notch above `fur-long`'s preset default of 1.10;
   **(b)** a **baked vertex-colour cavity term** on the mane, plume and pantaloon meshes,
   multiplying toward `COAT_DEEP` in the crevices between locks. (b) is the one that survives `low`
   quality with screen-space AO switched off, and it is the difference between a dog and a
   silhouette-shaped hole in the screen.

**Request — report it, do not implement it:**

- **`rimColor #5F7BD1`, `rimIntensity 1.1`, ≈150° off the key in azimuth, only 10–14° above the
  horizon.** Rationale worth passing on to the arena agents: Shibro is a large, **light, warm,
  low-chroma** mass (`COAT` hue 42°, `Y 0.649`). A *bright* rim on a light body adds nothing —
  there is nowhere above `Y 0.649` for it to go before it clips. What separates him is a
  **strongly hued, moderately bright, low-elevation** rim whose *hue* is complementary
  (225° vs 42° — near-exact complements) so the edge reads as a colour boundary rather than a
  value one. **A warm or white rim on this character is invisible. Say so explicitly in your report.**
- Secondary request: **a darker ambient floor under the character in bright arenas.**
  `frozenTokenLab` (`arctic-day`) and `mountainNodeVillage` (`mountain-dawn`) are the two arenas
  where Shibro is at genuine risk of vanishing. Both need a contact-shadow / darker ground-bounce
  term beneath him. `mountainNodeVillage`'s stated hero moment — *"warm dawn rim over cold blue
  shadow"* — is, by coincidence, the single best lighting this character will ever get. Ask that
  arena to use him for its lighting checks.
- Wherever the rim lands it should catch: the crown lock tips, the ruff's outer lock breakers, the
  pauldron top chamfers, the collar spikes, the plume's upper edge, the pantaloon hem, the knuckle
  tufts and the ear rim step. **The gold will over-blow. That is fine — it is the accent.**

---

## 6. Surfacing

Kinds are from `src/render/textures.js` (42 available; `KINDS` at line 821). Presets from
`src/render/materials.js` (`SURFACE`, line 213).

### 6.1 Region → material call

**Read §0.6 first.** Three things about this table are not negotiable and were wrong in the
previous draft:

- **The preset picks the texture kind.** You do not get to combine them. The "kind" column below is
  *derived from* the preset (`SURFACE[preset].maps`), shown only so you can see what you are getting.
- **`roughness` is a multiplier on the map, not a value.** The "target ≈" column is what you will
  actually measure; the multiplier column is what you pass. **Most of them are 1.00, because the
  map bases were chosen well** — if you find yourself passing anything far from 1.00, you have
  probably picked the wrong preset.
- **`scale`, `tint` and `wear` go inside `mapOpts`,** not at the top level.

| Region | `pbr()` call | kind you get | map rough base × mult | target ≈ |
|---|---|---|---|---|
| **Mane / ruff / chest apron** | `pbr(COAT, 'fur-long', { mapOpts:{ scale:2.2 }, sheen:0.42, sheenRoughness:0.55, sheenTint:0.45, normalScale:1.55, aoIntensity:1.25, envMapIntensity:0.75 })` | `fur-long` | 0.84 × **1.00** | **0.84** |
| **Tail plume, pantaloons, forearm feathering** | as above, `mapOpts:{ scale:1.9 }`, `normalScale:1.45` | `fur-long` | 0.84 × 1.00 | 0.84 |
| **Body coat (torso, upper arms, thighs)** | as above, `mapOpts:{ scale:1.4 }`, `normalScale:1.30` | `fur-long` | 0.84 × 1.00 | 0.84 |
| **Lower legs, waist, paws** | `pbr(COAT, 'fur', { mapOpts:{ scale:1.0 }, sheen:0.34, sheenTint:0.45, normalScale:1.15 })` | `fur-short` | 0.80 × 1.00 | 0.80 |
| **Head: forehead, cheek, crown** | `pbr(COAT, 'fur', { mapOpts:{ scale:0.9 }, sheen:0.34, sheenTint:0.45 })` | `fur-short` | 0.80 × 1.00 | 0.80 |
| **Muzzle, nose bridge, chin, ear leather** | `pbr(COAT_LIGHT, 'fur', { mapOpts:{ scale:0.6 }, roughness:0.93, sheen:0.30, sheenTint:0.45 })` | `fur-short` | 0.80 × **0.93** | **0.74** — the finest, tightest hair on the animal |
| **Undercoat shell (inside mane and plume)** | `pbr(COAT_DEEP, 'fur-dark', { noMaps:true, roughness:0.94, sheen:0 })` | *(none — untextured)* | absolute | **0.94, dead matte.** `noMaps` is the *only* way to exceed a map's base (§0.6.2), it costs nothing because the shell shows only through 0.02 m slots, and it saves a map set. |
| **Nose leather** | `pbr(PIGMENT, 'leather', { mapOpts:{ scale:0.35, wear:0.15 }, roughness:0.45, clearcoat:0.45, clearcoatRoughness:0.10 })` | `leather` | 0.62 × **0.45** | **0.28** |
| **Lip band, eye rims, eyelid solids** | `pbr(PIGMENT, 'skin', { roughness:0.65 })` | `skin-smooth` | 0.52 × 0.65 | 0.34 |
| **Sclera** | `pbr(SCLERA, 'skin', { roughness:0.58 })` | `skin-smooth` | 0.52 × 0.58 | 0.30 |
| **Cornea** | `pbr(0xffffff, 'glass', { transmission:0, clearcoat:1.0, envMapIntensity:1.6, guardAlbedo:false })` | `glass` | 0.05 × 1.00 | **0.05**. One specular dot per eye. |
| **Tongue / inner mouth** | `pbr(TONGUE, 'skin-wet', { roughness:0.55 })` | `skin-amphibian` | ≈0.36 × 0.55 | 0.20 |
| **Teeth** | `pbr(0xE8E2D2, 'bone', { roughness:0.54, clearcoat:0.12 })` | `bone` | 0.52 × 0.54 | 0.28 |
| **Claws, dewclaws** | `pbr(CLAW, 'horn', {})` | `horn` | 0.34 × 1.00 | **0.34.** `CLAW` is *pale* — do not blacken them. |
| **Paw pads, palms** | `pbr(PAD, 'rubber', { roughness:0.80 })` | `rubber` | 0.90 × 0.80 | 0.72 |
| **Pauldron plates, collar band** | `pbr(STEEL, 'metal', { mapOpts:{ scale:1.1, wear:0.45 }, envMapIntensity:1.2 })` | `metal-brushed` | 0.32 × 1.00 | **0.32**, metalness 1.0, brush direction along the plate's long axis |
| **Under-plates, chest strap, collar spikes** | `pbr(STEEL_DARK, 'metal-painted', { mapOpts:{ wear:0.6 } })` | `metal-painted` | 0.42 × 1.00 | 0.42, **metalness 0** — it is paint. Chipped edges reveal `metal-brushed`. |
| **Collar strap** | `pbr(COLLAR_LEATHER, 'leather', { mapOpts:{ scale:0.9, wear:0.75 } })` | `leather` | 0.62 × 1.00 | 0.62, cracked, visible stitch relief |
| **Sash (band + hanging panel)** | `pbr(SASH, 'cloth', { mapOpts:{ scale:1.4 }, sheen:0.30 })` | `cloth-weave` | 0.82 × 1.00 | 0.82. Weave must read at 1 m. |
| **Medallion, rivets, sash hem tip** | `pbr(GOLD, 'gold', { envMapIntensity:1.4, unique:true /* medallion only */ })` | `gold` | 0.18 × 1.00 | **0.18**, metalness 1.0 |
| **Energy blade** | `emissive(BLADE, 2.4)` / core `emissive(BLADE_CORE, 3.0)` | — | — | the sole bloom source on the model |

### 6.1b The nine texture requests, counted

`surfaceMaps()` caches on `kind|size|seed|scale|wear|tint` (`textures.js:540`), so the distinct
map sets this character asks the GPU for are exactly:
`fur-long`@2.2, `fur-long`@1.9, `fur-long`@1.4, `fur-short`@1.0, `fur-short`@0.9, `fur-short`@0.6,
`leather`@0.35/wear .15, `leather`@0.9/wear .75, `metal-brushed`@1.1/wear .45 — **nine**, plus the
shared defaults for `metal-painted`, `cloth-weave`, `gold`, `skin-smooth`, `bone`, `horn`, `rubber`,
`glass`, `skin-amphibian`, which every other fighter is already paying for. Report the
`textureCacheStats()` delta.


### 6.2 How it must behave under light

- **Fur is not shiny; it is *sheened*.** The forward-scattering lobe appears **only at grazing
  angles** — the crown, the outside of the ruff, the shoulder tops, the plume's upper edge, the
  outer forearm. Anything facing the camera stays matte. **If the chest is glinting, `sheen` is
  too high.** The reference literature is explicit that the Disney BRDF *over-estimates* forward
  sheen; err low and let the halo appear only at the edge.
- **Roughness variation is mandatory.** `fur-long` in `textures.js` already ships a roughness
  contrast of 0.20 with a 0.55 mask weight and an undercoat darkening term
  (`textures.js:881–908` — *"Two clump scales = a layered coat… One scale reads as a wig"*).
  Use it. A flat roughness across a white coat is the single fastest way to make this character
  look like a bar of soap.
- **AO is not a nice-to-have on this model, it is the shading** (§5.1 R2). **You cannot call
  `aoFromHeight()` yourself** — `surfaceMaps()` bakes AO per kind and exposes no radius or strength
  option (§0.6.4); `fur-long` ships `{ radius: 5, strength: 1.05 }`. What you do instead:
  pass **`aoIntensity: 1.25`** to `pbr()` (one notch above the `fur-long` preset's 1.10), and
  additionally bake a **vertex-colour cavity term** into the mane, plume and
  pantaloon meshes so that the crevices between locks darken toward `COAT_DEEP` *before* any
  screen-space AO runs. At `low` quality with SSAO off, this baked term is the only thing keeping
  him from being a silhouette-shaped hole in the screen.
- **The two-layer coat must be visible where it parts.** Wherever the outer shell's locks separate
  — the mane's outer edge, the plume's fringe, the pantaloon hem, the ruff's chest hem — the
  `COAT_DEEP` undercoat shell shows through as a dark slot. **That dark-between-the-locks is the
  entire visual signature of a double coat.** Guard-hair references describe the topcoat as
  *stiffer, harder, glossier, coarser and longer* over a dense woolly undercoat; you are building
  exactly that with two shells and two roughness values.
- **Wetness is local and tiny**: the nose planum, the inside of the nostrils, the cornea, the
  tongue. **Nowhere else.** A wet white coat reads as a dog that fell in a pond.
- **Metal must actually reflect.** `envMapIntensity 1.2–1.4` on the pauldrons and collar. In
  `subway-tunnel`, `tower-dusk` and `reserve-core` this is where the character comes alive; do not
  flatten it with a "safe" high roughness.
- **Never let anything on this model clip to 1.0 in the base pass.** With a `Y 0.649` base coat and
  a `Y 0.803` tip colour, a strong key plus bloom will blow the crown out instantly. Keep the coat's
  `envMapIntensity ≤ 0.8` and let the sheen, not the diffuse, provide the highlight.

### 6.3 Micro-detail that sells it (the 30 cm read)

1. **Modelled lock geometry — 33 pieces, and they are the character.** Bevelled tapered wedges,
   not alpha cards (**alpha cards are banned**, §0.5 — they fringe against exactly the rim light
   this character depends on). Distribution: **11** on the mane outline, **7** on the plume's lower
   edge, **6** on the pantaloon hem, **5** on the forearm feathering, **4** on the crown profile.
   Lengths 0.028–0.110 m. Instanced (§6.5).
2. **The undercoat shell.** Two extra shells only — one inside the mane, one inside the plume —
   offset 0.020 m, `COAT_DEEP`, roughness 0.94. Never a full-body shell; you cannot afford it and
   it would show nowhere else.
3. **The §3.2 fur seam line**, from the outer eye corner to the ear base, with opposed flow
   directions either side. Cheapest character-specific detail in this document.
4. **Whisker dots.** 4 rows × 5 punctate `PIGMENT` dots per side on the muzzle's lateral plane,
   diameter 0.004 m, with a 0.3-strength bump so they catch raking light. Plus **3 modelled
   whiskers per side** (0.055 m, tapered, radius 0.0012) — sub-pixel in gameplay, but they are in
   every close-up and every KO frame.
5. **Partings.** The plume's underside groove (§4.6), a parting down the centre of the chest ruff
   where the hair falls both ways, and a parting down the median furrow of the skull. Three
   grooves; they are what turns three fur masses into hair.
6. **Wear on the metal.** The pauldrons are working armour: 4–6 dents 0.006 m deep, chipped paint
   at the plate edges revealing brushed steel, scuffing concentrated on the leading (forward) edge
   because `shoulder-check` is a real move.
7. **The collar's stitching**: 22 visible stitches along the leather strap's top and bottom edges,
   0.004 m, modelled as relief in the normal map, not geometry.
8. **Rear double dewclaws** (§4.4). Nobody builds them; anyone who knows the breed will notice.
9. **Snow / dust catch.** Optional, arena-driven: `surfaceMaps('snow')` exists in `textures.js`
   (line 1843). A 0.15-opacity `snow` overlay on the up-facing coat surfaces in `frozenTokenLab`
   and `mountainNodeVillage` costs one extra map and is the best 30 cm detail available for a
   mountain dog. **Only if the budget in §6.5 clears.**

### 6.4 Fur flow map — the directions, in one place

An implementer will otherwise guess these, and a wrong flow direction is visible from 3 m.

| Region | Flow |
|---|---|
| Muzzle bridge | radially outward and **forward** from the median groove |
| Muzzle sides | down and forward, −20° |
| Forehead | back and slightly out, **−12°** |
| Cheek (below the §3.2 seam) | **up and back, +24°** |
| Crown / occiput | back, −8° |
| Ear leather, outer face | down the leather's long axis |
| Mane, throat | **down and forward**, fanning — the throat hair points at the viewer |
| Mane, shoulder | down and out, 30° off vertical, fanning laterally |
| Chest ruff | down, splitting left/right at the median parting |
| Torso, flank | back and down, −25° |
| Forearm | down, with the caudal fringe swept back 15° |
| Thigh / pantaloon | down and back, −35° |
| Plume | out along the tail's axis, fanning ±40° at the tip, parted underneath |

### 6.5 Budget — the constraint this brief would otherwise blow

`GRAPHICS_CONTRACT.md` §0 caps a match at **~250k triangles and ~900 draw calls** shared between
two fighters, an arena and VFX.

**This character's budget: ≤ 32,000 triangles, ≤ 40 draw calls in the bind pose.**

Counted naively this brief asks for 33 locks + 12 collar spikes + 16 teeth + 2 eyes × 5 parts +
8 claws + 6 whiskers + 2 shells + armour + props ≈ **95 separate meshes**. That is a draw-call
failure before the arena renders a single pixel. **Mandatory mitigations:**

1. **`InstancedMesh` for repeats**: fur locks (33 → 1, with per-instance scale and rotation),
   collar spikes (12 → 1), teeth (16 → 1), claws + dewclaws (14 → 1), whiskers (6 → 1),
   pauldron rivets (8 → 1). **Six instanced meshes replace 89 draws.**
2. **Merge by material *within a bone*** — never across bones (§0.3.5). All `COAT` static geometry
   under `torso` is one buffer; likewise under each limb and under `head`.
3. **`pbr()` caches by (colour, preset, overrides).** Do **not** pass `unique: true` in the bind
   pose — with one exception: `torso.userData.medalMat` **must** be unique (§0.2), or every gold
   surface in the scene flashes when `staking-stance` fires.
4. **Segment counts**: the cranium is a filleted box at subdivision 2 (~900 tris) — cheap, and the
   flat cheek planes are free. The mane's outer shell is the expensive item (~5,600 tris); it is
   worth every triangle. Collar spikes get 6-sided cones, not 12.
5. **If you come in over 32k, cut in this order:** snow overlay → whiskers → plume lock count
   (7 → 5) → pantaloon lock count (6 → 4) → collar stitch relief. **Never cut**: the mane's outer
   shell, the undercoat shell, the ear badger patches, the eye rims, the nose apertures, the
   collar band. Those six *are* the character.
6. **Texture memory**: every kind used here is shared globally (`textures.js:40` — *"two fighters
   asking for `fur-short` get the same GPU texture"*). Shibro requests **9 distinct
   (kind, scale, tint) combinations**. Use `textureCacheStats()` and report the delta.

**Report measured triangle and draw-call counts in your writeup. "It looked fine" is not a
measurement.**

---

## 7. Signature props & wardrobe

Every prop is a child of an existing bone (§0.3). `Gore._detach()` clones a bone's whole subtree, so
anything under `head` flies off with the head and anything under `sash` flies off at 70 % damage.
**Nothing may be parented to `group` or positioned by per-frame JS**, because a detached clone is
frozen and would visibly desync. Mark every prop mesh `userData.prop = true`.

### 7.1 Wolf collar (`carlanca`) — parent: `torso` — **NEW, and the most important addition**

This is the one genuinely new prop this brief adds, and it earns its place three times over:
structurally (§2.3 — it *is* the neck), art-directionally (§5.5.3 — it is the dark band at the
head/body boundary), and thematically (a guardian dog's anti-wolf collar, on a character whose
entire premise is "protect the network").

Real-world basis (§10): livestock-guardian dogs in Spain, Italy and Turkey wear a spiked
anti-wolf collar — Spanish *carlanca*, Italian *roccale*, Latin *mellum* — *"a strong leather belt
around the neck, equipped with nails"*, with *"soft leather padding sewn in to prevent the iron
from harming the dog's neck"*, and outward-facing spikes protecting the throat and carotids.
Documented since Roman agricultural writing. **It is public-domain historical equipment, not
anyone's trade dress** (§9).

- **Band**: a torus-section belt around the **neck column** (§4.2), not around the chest. The neck
  core is 0.300 m across; the mane compresses to ≈0.040 m per side beneath the strap; so the band's
  **major radius is 0.190 m** (`0.150 + 0.040`), band height **0.090 m** (`M y 1.420 → 1.510`),
  thickness 0.030 m, centred on the neck axis at `M(0.075, 1.465, 0)`. Not a perfect circle —
  flattened 12 % in x so it sits against the chest. **A collar sized to the ribcage instead of the
  neck (the ribcage is 0.47 m across at this height) will not close, and is the most likely way to
  get this prop wrong.** `COLLAR_LEATHER` strap with a `STEEL` outer plate covering the
  front 200° of the arc, `metal-brushed`.
- **Spikes**: **12**, outward-facing, evenly spaced over the front and side 260° (**none at the
  back of the neck** — that is where the mane is thickest and a spike there would look glued on).
  Each a 6-sided cone, base radius **0.016 m**, length **0.055 m**, splayed radially with a **+8°
  upward** cant. `STEEL_DARK` shafts, `STEEL` tips with a bright chamfer.
- **Buckle**: on the character's left, `GOLD`, 0.045 × 0.038, with a 0.012 m tongue and two spare
  holes punched in the trailing strap. The strap's tail hangs 0.070 m free and gets a 6 Hz
  secondary-motion spring.
- **Padding**: a visible `COLLAR_LEATHER` roll, 0.014 m proud, on the *inner* edge only — visible
  from below and in KO frames. This is the detail that says "someone made this for a dog he cared
  about" and it is the reason the prop reads as protective rather than aggressive.
- **How the fur meets it**: the mane's locks **overhang the collar's top edge by 0.030 m** and are
  *compressed* beneath it — a 0.012 m compression dimple all round. The collar must look buried in
  fur, not resting on it. **Do not let the fur cross the band's face.**
- **Constraint**: the spikes must not intrude into the **jaw notch** negative space (§2.5) by more
  than 0.030 m, and must never occlude the mouth line from the profile camera.

### 7.2 Pauldrons — parent: `torso`

Currently three stacked `BoxGeometry` per side (`shibro.js:137–142`). Rebuild as real lamellar.

- **Three plates per side**, cascading outward and downward, each a bevelled shell (chamfer 0.008)
  with a rolled top edge:

| Plate | Size (x × y × z) | Centre (`M`) | `z` span | Cant |
|---|---|---|---|---|
| 1 (top) | 0.300 × 0.030 × 0.170 | (0.02, 1.622, ±0.300) | ±0.215 → ±0.385 | 16° |
| 2 | 0.280 × 0.028 × 0.160 | (0.02, 1.566, ±0.360) | ±0.280 → ±0.440 | 26° |
| 3 (bottom) | 0.240 × 0.026 × 0.150 | (0.02, 1.504, ±0.390) | ±0.315 → ±0.465 | 34° |

- Plates 1–2 in `STEEL`, plate 3 in `STEEL_DARK` (a value gradient down the cascade so the shoulder
  reads as *rolling over*). Outer edge of plate 3 at **`M z ±0.465` → the 0.930 m widest span**.
- **The span is set by what is underneath, not by taste.** The shoulder flesh reaches `z ±0.435`
  (§4.2) and the upper-arm cylinder `±0.430` (§4.3). Plate 3 clears the arm by **0.035 m**, which
  is enough to look strapped-on and not enough to look like a shelf. The previous draft's
  `±0.390 / 0.780 m` put all three plates *inside* the dog's own shoulder — the armour would have
  been invisible from the profile camera, which is the only camera there is.
- **Consecutive plates overlap by 0.105 m in `z` and are separated by 0.028 m in `y`**, so they
  cascade rather than butt. Measured normal to the plates, the visible **gap is 0.008 m**, showing
  `COLLAR_LEATHER` backing. Gaps between armour plates are the cheapest possible "this is real
  armour" cue.
- Plate 1's top face at `M y 1.637` and its inner edge at `z ±0.215` are what create §2.5's
  **0.080 × 0.063 m background slot** against the ruff crest. Check that slot at ±25°; it is the
  thing that stops the armour reading as a fur pattern.
- **Two `GOLD` rivets per plate**, 0.014 m domed, on the plate's forward third.
- **Chest strap X**: two `STEEL_DARK` straps, 0.055 m wide, crossing at `M(0.29, 1.470, 0)` at
  ±30°, running from each pauldron's plate 2 down under the opposite armpit. These carry the
  medallion and they are the dark that makes `GOLD` work (§5.4).
- **`armor: 15` on `shoulder-check` and `armor: 18` on `counter-stance`** are gameplay facts. The
  pauldrons are the visual promise of that armour — they must look like they can eat a hit.

### 7.3 Validator medallion — parent: `torso`

- Hexagonal `GOLD` seal, across-flats **0.220 m**, thickness 0.032, with a **0.006 m stepped
  bezel** and a **recessed dark hex core** (`STEEL_NIGHT`) carrying a **simple geometric glyph of
  our own invention** — three nested chevrons, or a hex-in-hex. **No logo, no wordmark, no ticker,
  no letterform of any kind** (§9).
- Hangs at `M(0.36, 1.420, 0)` from the chest strap on two 0.012 m `GOLD` links.
- **Keep `torso.userData.medalMat` alive and `unique: true`** (§0.2, §6.5.3). `medalControl()` sets
  `emissive` between `0x2a1d00` (rest) and `0xaa7700` (staking). Consider a third state for the
  finisher.
- 5 Hz pendulum spring, damping 0.35, clamp ±22°. It must still be swinging 0.5 s after he stops.

### 7.4 Waist sash — parent: `hips` (band) + **`sash` bone** (hanging panel)

**`sash` is Shibro's `ACCESSORY_BONES` entry — it pops off at 70 % damage** (§0.3). It therefore
has to be worth losing.

- **The `sash` bone's rest position is `M(−0.060, 1.040, +0.240)`** (`hips` + `(−0.06, 0.04, 0.24)`,
  `shibro.js:105`). The previous draft never said this, and it matters: **the visible knot is not at
  the bone.**
- **Band** — parent `hips`, *not* `sash`: wrapped around the waist at `M y 1.070–1.150`, `SASH`,
  with a visible **knot** on the character's left at `M(0.10, 1.110, +0.22)` — 0.075 m of bunched
  cloth with real folds. Because it hangs off `hips`, the knot **survives** the 70 % pop and the
  panel does not, which is exactly the read you want: the belt stays, the tail of it is torn away.
- **Hanging panel** — parent `sash`: 0.180 m wide × **0.510 m long**, hem at `M y 0.560`.
  **Its root cap must sit at the bone pivot `M(−0.060, 1.040, +0.240)`, closed** (§0.3.2), and the
  panel then sweeps forward and inboard to pass under the knot. Do **not** model it as starting at
  the knot with a 0.17 m gap back to its own bone — the detached clone is frozen at the bone and
  the gap will be visible for the rest of the match. **Three cloth links** so it can trail. Give it a 6° twist along its length and a
  slight taper (0.180 → 0.150) so it never looks like a flat plank.
- **Hem**: a `GOLD` tip band 0.070 m tall, plus **five 0.045 m tassels**. The tassels are the
  cheapest secondary motion on the model and they read at 128 px as a fringe.
- **The panel hangs over the pantaloons and must not fuse with them.** Minimum clearance 0.025 m
  in the idle pose; the cloth solver must collide against a capsule at the thigh.
- Costume 1: `SASH_NIGHT`, identical geometry, identical `Y` (§5.4).

### 7.5 Energy blade — parent: `forearmR` (existing `userData.blade`)

- Keep the group, keep `visible = false` at build, keep `userData.bladeMats`.
- Rebuild the geometry: a **tapered double-edged blade** with a real fuller — length **0.950 m**,
  width 0.130 at the ricasso tapering to a 0.180 m point, thickness 0.028 at the spine → 0.006 at
  the edge. Inner core (`BLADE_CORE`) at 0.60 scale, offset 0.004 forward so the edge glows hotter.
- **It emerges from the forearm, not from a hand.** Origin at the wrist's caudal face, aligned with
  the forearm's axis, +6° outward. Add a **0.100 m emergence flare** — a cone of light where the
  blade leaves the fur — so it never looks like a sword clipping through an arm.
- **It is hidden by default and that is a feature.** Shibro's silhouette must read with no weapon
  at all; the blade is a 4-frame event in `bladeSlash`, `chainSplitter` and `slashedValidator`.
- If `forearmR` is torn off, the blade goes with it and `bladeControl()` no-ops safely (§0.3.3).
  **Do not "fix" this by reparenting.**

### 7.6 Attachment rules — all props

1. **Every prop is a child of exactly one bone.** No prop spans two bones. No prop is parented to
   `group`.
2. **Every prop has a sleeve.** Where a prop meets fur, the fur overlaps the prop by ≥0.012 m and
   the prop's underside is inset ≥0.006 m into the body — the contract's no-gaps rule. Check it in
   the extreme poses: `lowSweep` (hips rotated), `risingChain` (torso arched back), `launched`
   (everything at once).
3. **Every prop has a compression dimple** where a strap crosses fur (collar, pauldron straps, sash
   band). 0.012 m. Straps that do not compress the coat look like stickers.
4. **Nothing on this model is symmetric to the millimetre.** The collar buckle is on the left, the
   sash knot on the left, the tail plume lies to the left, the medallion hangs 0.015 m off centre.
   The pauldrons are the *only* mirrored pair, and even they get a 2° cant difference.
5. **Costume 1 changes materials only** — never geometry, never bone positions.

### 7.7 Explicitly NOT built

- **No cape, no cloak, no banner.** Contract §11 already gives cloth to other characters, and a
  cape would occlude the mane, which is the entire silhouette.
- **No helmet, no visor.** BLACKISH BULL owns the corporate visor; Shibro's face must be readable.
- **No hat.** TIRED APE owns headwear.
- **No shield object.** `shield-pulse` and `community-shield` are VFX and a wall of village dogs.
  A physical shield would double the widest-point measurement and ruin §2.2.
- **No chain, no leash, no collar tag with writing on it.** BLACKISH BULL owns the leash-as-tie
  gag, and any tag with a legible mark is a §9 hazard.

---

## 8. Expression & motion notes

### 8.1 Face poses

Drive from a small `head`-local face controller published on `model.userData.faceRig =
{ jaw, browL, browR, eyeL, eyeR, lidUL, lidUR, lidLL, lidLR, lipL, lipR }`.
**None of these may appear in the exported bone map** (§0.2).

| Pose | Lids | Brow | Mouth | Ears (`earL`/`earR`) | Extra |
|---|---|---|---|---|---|
| **idle** | upper lid covers **top 28 %**; lower lid straight | **level, 0°, both** | **closed, corners 0°**, jaw 0° | base neutral, tip hanging to `Hd y −0.020` | blink every **5–8 s**, **0.16 s** blink (crisp, not tired); pupils steady on the opponent, no drift |
| **alert / attack windup** | lids open to **18 %** — the eye *widens*, it does not narrow | inner ends **−7°**, outer **−3°** | closed, corners still **0°**; a 0.006 m jaw clench | **base +22° up, +10° forward, tips lift 0.035 m** — the single most legible pose change on the model | nostrils flare 0.004; the ruff's outer locks bristle outward 0.010 m |
| **angry / heavy commit** | **12 % coverage**, hard stare | inner **−10°**, outer **−4°** | corners pull **back 0.010 m** (not down) into a tight line; **no teeth** | ears **rotate back and flatten** to −14° — pinned, not lifted. Ears back = commitment | one visible swallow before the move; 0.008 m brow furrow between the ridges |
| **bark** (`treasury-bark`) | 15 % | inner −6° | **jaw 34° open**, corners drawn back 0.016 m, **full tooth rack + tongue visible** | ears **forward +22°** | this is the only time the mouth is wide; make it count. Jowls flap 0.020 m on the recoil |
| **hurt** | snap open to **6 %** in 2 frames | inner **+16°**, outer +7° | jaw drops **20°**, lips slack, tongue tip visible | ears snap **back and down −20°** in 2 frames, then spring | 3-frame overshoot then settle; **sclera crescent widens to 0.010 m** — this is the only pose where the whites really show |
| **KO** | fully shut (−1.15 rad) | inner +18°, slack | jaw hangs **26°**, tongue lolls | ears fully down, tips 0.020 m *forward* of rest | **the tail drops from the over-back arc to `M y 0.55`** — a dropped tail is the most legible defeat signal there is. Give it 0.6 s to fall. |
| **taunt** | **asymmetric**: one lid 20 %, the other 40 % | one brow **+9°**, the other 0° | closed, corners 0°; one 0.010 m lip twitch | **one ear up +18°, one down −6°** — the classic quizzical head | plus a **7° head tilt** (roll). One slow blink. He does not smile. |
| **win** | 22 % | level | closed, corners **+2° maximum** | both ears up +14°, relaxed | one slow nod; the medallion settles last; the plume gives a single 0.05 m wag and stops |
| **lose** | 45 %, gaze down 12° | inner +12° | closed, 0° | flat back, −16° | tail drops to `M y 0.70`; shoulders drop 0.020 m; **he still does not slouch the spine** |

**Two rules that outrank the table:**

- **The mouth corner never exceeds +2° or −3°.** Every temptation to give Shibro an expression via
  the mouth must be redirected to the **ears and the brow**. That is how real dogs express, and it
  is what makes him feel like an animal rather than a person in a dog suit.
- **The expression must be visible in the ears at 128 px.** Ear base rotation of 22° moves the tip
  0.035 m = **2.4 px**, and the badger patch moves with it, which is a *value* event, not just a
  shape event — it is visible. **If you cannot see the pose change in the ears, it is not a pose.**

### 8.2 Secondary motion

Everything here rides the animator's spring solver (`GRAPHICS_CONTRACT.md` §11).

| Element | Freq | Damping | Amplitude / clamp | Notes |
|---|---|---|---|---|
| `earL` / `earR` | **7 Hz** | 0.34 | clamp **±26°**, lag **0.10 s** | **Hard-clamp at +26° so the spring can never overshoot into "erect"** (§3.8). Drop ears are heavier than prick ears — a slightly lower frequency than DOGEY's. |
| `tail` (5 links) | 4.5 Hz | 0.26 | ±32° per link, **hard clearance clamp ≥0.09 m from the back** | The clearance clamp is a §2.4.3 requirement, not a preference. |
| Plume lock fringe | 9 Hz | 0.30 | 0.010 m | Rides the tail links. |
| Mane outer locks | **6 Hz** | 0.28 | 0.014 m, up to **0.030 m on heavy hits** | Driven by torso angular acceleration. **This is the money shot** — a big ruff that lags the shoulders is the difference between a model and an animal. |
| Chest-ruff hem | 6.5 Hz | 0.30 | 0.012 m | Driven by hip vertical velocity. |
| Pantaloon hem | 5.5 Hz | 0.32 | 0.016 m | Trails on dashes. |
| Forearm feathering | 10 Hz | 0.28 | 0.008 m | Only visible in punches — which is exactly when it matters. |
| `sash` panel (3 cloth links) | 4 Hz | 0.22 | hem drag on dashes | Collides against a thigh capsule (§7.4). |
| Sash tassels | 8 Hz | 0.35 | 0.020 m | Five independent, slightly detuned. |
| Medallion | 5 Hz | 0.35 | ±22° | Settles last, always. |
| Collar strap tail | 6 Hz | 0.40 | ±14° | Tiny; sells the collar as real leather. |
| Jowls | 8 Hz | 0.38 | 0.010 m, **0.020 m** on heavy hits | Tight flews (§3.7) — a *little* jiggle, not TIRED APE's flapping lip. |

**Settle ordering is characterisation.** After any motion the parts must come to rest in this
order: body → armour → coat → tail → medallion. The medallion is **always** the last thing moving,
and there must be **≥0.5 s** where Shibro himself is completely still and only the medallion is
swinging. That half-second of stillness with one small pendulum is the entire personality.

### 8.3 Posture-driven personality

Shibro is the roster's **stillness** character. His stats are `power 6, speed 6, defense 9,
chaos 3` and his style line is *"Let them swing."* Everything below serves that.

- **He initiates from the feet, not from the head.** Weight shifts to the front foot **3 frames**
  before any arm moves; the head arrives **last** and barely moves at all. (Compare TIRED APE, who
  initiates at the hip and drags the head reluctantly; Shibro's head is simply *already where it
  needs to be*.)
- **Minimal anticipation, maximal follow-through.** Windups are **2 frames shorter** than the
  roster average and recoveries **3 frames longer**. He does not telegraph and he does not snatch
  his hand back. Combined with `armor: 15/18` on his two committal moves, this reads as
  *unbothered*.
- **Overshoot is small: 8 %** (roster average ~18 %), **but the settle is long: 0.55 s** with
  the coat and medallion still moving after the body has stopped. Rigid body, soft edges.
- **He returns to the exact same idle pose every time.** No drift, no re-settle into a different
  stance. Nine other fighters fidget; his neutral is a fixed point, and the contrast reads as
  discipline.
- **Idle breathing**: **0.13 Hz**, 0.022 m chest rise, mostly in the ruff rather than the ribcage.
  **No sigh** — sighing is TIRED APE's beat. Instead: **every ~11 s, a single slow ear-swivel**
  (one ear rotates 14° toward an off-screen sound over 0.5 s and returns). That is the "guardian"
  tell and it is worth more than any amount of chest animation.
- **Walk**: level head carriage, **almost no vertical bob (0.018 m)** — big dogs float. The ruff
  and plume do all the visible movement. Foot plants are **soft**, 0.02 m of ankle compression, no
  slam. Kuvasz standard: *movement "easy, free and elastic"*.
- **Dash / `chain-dash`**: shoulder leads by 0.08 m, head stays level, the plume and sash trail
  hard. He looks like weather arriving.
- **Blocking / `counter-stance`**: he **does not flinch**. The block pose lowers the head 3° and
  turns the pauldron into the hit; the ears go **back**, not down. Ears back on a big dog is
  unmistakably "I am about to do something about this".
- **`good-validator` (the joke move)**: the one place the discipline breaks. A single full-body
  shake — the wet-dog shake, 4 rotations alternating hips-then-shoulders over 0.7 s, the whole coat
  and both ears flailing at 3× normal amplitude — then he immediately returns to the exact neutral
  pose as if nothing happened. **That contrast is the joke.** Build the shake to be genuinely
  excessive; it is the only time this character is allowed to be silly, and the coat you have
  built is the reason it will be funny.

---

## 9. Parody safety — MANDATORY

The mandate (`GRAPHICS_CONTRACT.md` §9) is *recognisable archetype and silhouette, changed
proportions, our own colourways and marks*.

### 9.0 What the actual exposure is here

Shibro is, on the face of it, the **lowest-risk fighter in the roster** — nobody owns "large white
dog", the two breeds this brief draws on are centuries old and unownable, and the character carries
no PFP-collection trait vocabulary. But there are **four specific hazards**, and three of them are
easy to walk into by accident:

1. **The source project's marks.** The archetype is a real, named, traded dog-coin project with a
   name, a ticker, a wordmark, a mascot artwork and — critically — **a signature brand colour**.
   Names, tickers and logos are trademarks; the mascot artwork is a copyrighted work. **None of
   them may appear anywhere.** The relevant lesson from the roster's other briefs (see
   `tired-ape.md` §9) is that in the leading NFT/crypto trademark case the defendants' *First
   Amendment / parody / nominative fair use* defences were **rejected on appeal even though the
   summary judgment against them was vacated** — "it's a parody" is not a shield against a mark
   claim. What protects us is that our marks are demonstrably our own.
2. **A specific real dog.** Dog-coin mascots are usually derived from a photograph of one
   identifiable animal, taken by an identifiable photographer who owns the copyright.
   **Do not reproduce any individual dog's markings, patch shapes, or the composition of any
   mascot photograph.** Our dog has *no* asymmetric coat markings at all (§9 D5), which makes this
   automatically true.
3. **Breed standard text.** The AKC and national-club breed standards are **copyrighted documents**.
   This brief quotes fragments under 15 words with attribution (§10). **Do not paste standard text
   into source comments, mesh names, `bio` strings or UI copy.** Paraphrase or write your own.
4. **Reference photographs.** The four photographs measured in §10 are Wikimedia Commons images
   under their own licences. They were used to **take measurements and sample colours**.
   **They must not be traced, embedded, converted into textures, or shipped in any form.** Every
   texture on this character is generated procedurally by `textures.js` — which the contract
   requires anyway ("no imported assets, ever").

### 9.1 Never copy — hard prohibitions

1. **No source project name, ticker, symbol, acronym or any variant**, in geometry, textures,
   decals, mesh names, material names, code comments, UI strings, `bio`/`title`/`style` text, move
   names, captions, announcer lines, or filenames. Not spelled out, not abbreviated, not
   leet-spelled, not embedded in a texture at any resolution.
2. **No source logo or mascot artwork.** In particular: no circular coin-face medallion bearing a
   dog's head. **The medallion (§7.3) carries a geometric glyph only — no animal, no letterform,
   no numeral.** A gold coin with a dog on it is the single most likely accidental infringement on
   this character, and it is the kind of thing that gets built without anyone deciding to.
3. **No signature brand colourway.** Do not adopt the source project's brand colour as the sash,
   the armour, the VFX or the character-select accent. Our chromatic accents are `SASH #2E58D2`
   (blue) and `SASH_NIGHT #B92E44` (red), chosen for value parity (§5.4), not for resemblance.
4. **No individual dog's markings.** No asymmetric face patch, no coloured eye patch, no named
   dog's specific badger pattern. Our `BADGER` markings are **strictly symmetric and confined to
   the ear leather** (§3.8) plus a faint even croup wash.
5. **No 1:1 recreation of any breed standard's proportions.** Every ratio in §3 is deliberately
   off-standard — see D2 below. A model built exactly to one club's standard is a *reproduction of
   that club's illustrated standard*, which is a copyrighted illustration.
6. **No real-world kennel-club, breed-club or registry marks**, no pedigree text, no rosette, no
   show ribbon, no tattoo, no ear tag, no microchip decal.
7. **No collar tag with legible text or a mark.** The collar is spiked and blank (§7.1).
8. **No reproduction of the source's rendering style.** Dog-coin mascots are typically flat 2D
   illustration or a cropped photograph. We are stylized volumetric PBR with a composed light rig
   and a modelled double coat. **Do not add an outline pass, do not build a flat frontal
   "coin portrait" pose, and do not use a flat circular background in the character-select
   portrait.** The rendering difference is a large part of what makes this transformative.
9. **No real-person or real-project reference in voice lines, captions or the announcer.**
   `treasury-bark`, `good-validator`, `chain-splitter` and `slashed-validator` all stay at the level
   of generic crypto-culture vocabulary, which is not owned by anyone.

### 9.2 Deliberate deviations — build these on purpose

| # | Deviation | Why it protects us | Why it does not hurt the read |
|---|---|---|---|
| **D1** | **Bipedal 3D fighter with arms, hands, a stance and 31 animation clips.** The source is a quadruped mascot in a static 2D image. | Everything in §4 is our own invention; there is no source geometry below the chest and no canonical proportions to copy. | The head, coat and tail carry the read (§1). |
| **D2** | **Proportions off every cited standard by ≥10 %.** Muzzle : backskull **0.72 : 1** — the Pyrenees standard is 1.00, the Akita 0.67 ("nose to stop is to stop to occiput as 2 is to 3"), the Kuvasz gives only "length in proportion to the length of the head". Stop **27°** over a 0.035 m blend — the Pyrenees stop is barely apparent, the Akita's is "well defined, but not too abrupt", the Kuvasz's "defined, never abrupt"; 27° is between the last two and matches none. Eyes **0.307 × `W_s`**, roughly **2.4× life size**, on a ball of r 0.040 that is itself oversize. Skull dome **0.110 m above the eye line** where the reference photograph gives 0.061 — an **80 % stylised over-dome**, and the reason the crown carries 0.080 m of coat. Head **2.08 : 1** length : width. | No dimension matches any published standard, so nothing is a reproduction of a standard or its illustrations. | Every deviation is an *exaggeration in the direction of* the read: blockier muzzle, readable stop, readable eyes. |
| **D3** | **Ears are ours: a compromise carriage.** Drop V-ears at the Pyrenees set, but with a **+22° alert lift** and a **`BADGER` patch covering 85 %** of the leather — neither the flat-carried Pyrenees ear nor the erect Akita ear. | A hybrid that matches no breed's standard. | Drop ears are the anti-DOGEY cue and the primary expression organ (§8.1). |
| **D4** | **Our own colourway** (§5). Warm-cream `COAT #DCD2BB` with a cool `COAT_SKY` and cool `PIGMENT`; blue/red sash; cool mid-dark steel; gold accents. | No sampled source colour is reused; the four photographic samples in §10 (`#C5C2A5`, `#CCC1B8`, `#E6DED6`, `#A18C7B`) **do not appear in the palette** — assert it. | Value structure, not hue, is what identifies a white dog. |
| **D5** | **Zero asymmetric coat markings.** Symmetric ear patches and an even wash, nothing else. | Makes it impossible to match any individual real dog or mascot photograph. | Markings were never part of the read; the ruff and the ears are. |
| **D6** | **The wolf collar** (§7.1) — public-domain historical livestock-guardian equipment, not a source prop at all. | One of the character's three strongest props is entirely outside the source's vocabulary. | It reinforces "guardian", which is the archetype. |
| **D7** | **Pauldrons, chest-strap X, waist sash, hex medallion, energy blade.** None of these is a source element; all are the game's own "armoured defender" language. | Four of the five props are ours outright. | They read as "stoic protector", which is the joke. |
| **D8** | **Rear double dewclaws, the eye-corner-to-ear-base fur seam, the two-shell undercoat.** | Anatomical detail nobody's mascot has, because mascots are flat drawings. | Increases the "real guardian breed" read. |
| **D9** | **Real eye geometry** — sclera, iris, cornea, specular dot, four lid solids, a modelled black rim. The source's eyes are flat shapes or photographic. | Original 3D construction. | It is *why* the eyes read (§3.3). |
| **D10** | **Our own name, title, bio, stats, moveset, voice, captions and every UI string.** "SHIBRO / Guardian of the Chain" is ours; so are all 14 move names. | No source naming anywhere in the shipped product. | — |

### 9.3 Build-time compliance check — run these, do not assert them

```bash
# 1. No breed names, real dog names, or dog-coin project naming anywhere in the fighter file.
#
#    NOTE: the previous draft of this brief shipped a pattern containing bare `shib`, which
#    matches this fighter's OWN id (`id: 'shibro'`, `name: 'SHIBRO'`) on every run. A check that
#    can never pass is a check nobody runs. The pattern below excludes the character's own
#    identifier and is the one to actually use.
grep -rniE 'inu|floki|akita|pyren|kuvasz|kabosu|maremma|anatolian|doge' \
  src/characters/shibro.js
# → must be ZERO hits, including comments, mesh names, material names and userData.

# 2. The source project's own name/ticker. Fill these in from the roster doc at review time and
#    do NOT commit them into this file — writing the mark down here is itself the hazard §9.0.1
#    is about. Run it, record "zero", delete the line.
#    grep -rniE '<project>|<ticker>' src/characters/shibro.js src/data/ src/ui/

# 3. `shib` as a standalone substring, allowing only this fighter's own id:
grep -rniE 'shib' src/characters/shibro.js | grep -viE "shibro" 
# → must be ZERO hits.
```

2. **Every mesh, material and bone `name` is generic**: `'collar'`, `'spike'`, `'pauldron'`,
   `'medallion'`, `'sash'`, `'plume'`, `'ruff'`, `'lock'`, `'badgerPatch'`. Nothing breed-specific,
   nothing project-specific.
3. **No `decalTexture()` on this character at all**, except the medallion's geometric glyph — and
   that glyph must contain **no letterform, numeral or animal shape**. Assert the decal count is
   ≤1.
4. **Palette assert**: no hex in §5.2 equals any of `#C5C2A5`, `#CCC1B8`, `#E6DED6`, `#A18C7B`,
   `#CBC1B8` (the coat values sampled off the reference photographs, §10). Also assert every
   albedo channel is within `[30, 240]`.
5. **No photographic asset ships.** `grep -r 'shibro' assets/ public/` → zero. All textures come
   from `surfaceMaps()`.
6. **The character-select portrait** uses the arena or the game's own treatment — **never** a flat
   circular or rounded-square colour field behind a frontal head (§9.1.8).
7. **Announcer / caption audit**: `treasury-bark`, `chain-splitter`, `slashed-validator`,
   `good-validator` and `community-shield` strings contain no project name, ticker or real-person
   reference.

**If in doubt on any prop: if the thing's name or artwork contains the source project's brand, do
not build it.** Everything else here — mountain dogs, double coats, plumed tails, spiked guardian
collars, pauldrons, sashes, medallions — is generic real-world subject matter that no crypto
project invented, and is safe as **archetype**.

---

## 10. Reference notes — what I actually looked at

Nothing in this brief was written from memory. Below is what I fetched, what I measured, and the
specific numbers each source produced.

### 10.1 Primary photographic references — measured, not remembered

Four Wikimedia Commons photographs of Pyrenean Mountain Dogs were downloaded, overlaid with a
pixel-coordinate grid, and sampled with a 14–18 px averaging kernel. **They were used for
measurement and colour sampling only** (§9.0.4).

**A. `BIR Grupp 2- PYRENÉERHUND, Vi'Skaly's Harlem Shake (23607403953).jpg`** — 960 × 640, a show
dog in **full profile against a white studio backdrop**. The single most useful image in this
brief, because it is the white-on-white problem in its purest form.
- Nose tip at (152, 110); eye at (228, 97); skull crown ≈ (250, 72); topline over the back
  ≈ y 195; front paw sole ≈ y 605; rear buttock ≈ x 790.
- **Height at withers ≈ 405 px; point-of-shoulder to buttock ≈ 510 px → length : height ≈ 1.26 : 1**
  ("somewhat rectangular, slightly longer than tall" — confirmed).
- **The ruff dominates the front third**: the coat mass runs x 230 → 400 while the head is only
  x 152 → ~300. This is where §2's **1 : 1.85 head-to-ruff ratio** comes from.
- **The drop ear is invisible in silhouette.** It reads only as a slightly warmer, slightly darker
  patch on the side of the skull (sampled `#A19B84`, `Y 0.327` vs the muzzle side's `#BAB7A4`,
  `Y 0.470`). §2.4.8 and §3.8 are built on this observation.
- **Colour samples** (sRGB, with CIE `Y`):

| Region | Hex | H / S / V | `Y` |
|---|---|---|---|
| Backdrop "white" | `#C9C8CE` | 250° / 2.9 % / 81 % | **0.582** |
| Coat, top of back (lit) | `#C5C2A5` | 54° / 16.2 % / 77 % | **0.532** |
| Coat, ruff front (lit) | `#C6C1A2` | 52° / 18.2 % / 78 % | 0.528 |
| Coat, side (form shadow) | `#C7C0A6` | 47° / 16.6 % / 78 % | 0.526 |
| Coat, belly (occluded) | `#A18F7F` | 28° / 21.1 % / 63 % | 0.288 |
| Deep inter-leg crevice | `#805E4E` | 19° / 39.1 % / 50 % | **0.131** |
| Muzzle side | `#BAB7A4` | 52° / 11.8 % / 73 % | 0.470 |
| Black nose | `#8A888A` | — / 1.4 % / 54 % | **0.248** |

  Three conclusions that shaped §5: **(i)** the dog is only **1.09 : 1** darker than a white
  backdrop — value separation is essentially nil, and the read is carried by hue (coat 52° warm
  vs backdrop 250° cool) and by occlusion; **(ii)** the coat's internal range is **4.06 : 1**
  (0.532 → 0.131) and the crevices **gain saturation** (16 % → 39 %) rather than going grey;
  **(iii)** a *black* nose photographs at `Y 0.248` under studio fill — **only 2.1 : 1 below the
  lit coat.** A pure-black nose albedo is wrong; §5.2's `PIGMENT` plus a bright top plane is right.

**B. `Great Pyrenees portrait.jpg`** — 960 × 1448, near-frontal head, soft outdoor daylight.
The source of almost every head ratio in §3.
- Left eye aperture x 272 → 348 (**76 px**), y 505 → 545 (**40 px**) → **aspect 1.9 : 1**.
  Right eye 85 × 40 px. Interpupillary (centre to centre) ≈ **372 px**.
- Nose leather x 340 → 605 (**265 px**) × y 745 → 840 (**95 px**).
  → **nose width : interpupillary = 265 : 372 = 0.71.** §3.6 builds to 0.66 (a deliberate 8 %
  reduction, D2).
- **Eye aperture width : interpupillary = 80 : 372 = 0.215.** In metres at our scale that is a
  **0.027 m** aperture — 1.8 px at 128. §3.3 upscales it **2.4×** to 0.066 m purely for
  readability, and that is one of the brief's largest deliberate deviations.
- Eye line (y 542) → nose centre (y 795) = **253 px = 0.68 × interpupillary**.
- Nose bottom (840) → lip line (910) = **70 px = 0.26 × nose width**.
- **Every eye sits in a halo of visibly darker, shorter fur** (sampled `#969892` around the eye vs
  `#B5B6AD` on the lit forehead). §3.3's peri-orbital halo is copied from this.
- The iris sampled **`#463021` — H 24°, S 53 %, `Y 0.035`**. Warm, saturated, *not* black. This is
  why `IRIS #4A3220` is what it is.
- Nose leather internal range in one object: top plane `#43494E` (`Y 0.065`, **cool**, H 207°) vs
  front plane `#191717` (`Y 0.009`). §3.6's 22° back-tilt exists to reproduce this.
- Skylit crown `#AEB3B1` (H 156°, S **2.8 %**) vs warm lit forehead `#B5B6AD` (H 67°) — the
  **sky-facing planes go cool and desaturated while the key-facing planes stay warm.** This is the
  observation behind `COAT_SKY` and §5.1 R1.

**C. `Male pyrenean mountain dog.jpg`** — 960 × 640, near-frontal head **against fresh snow**.
The decisive image for §1.3 and §5.1.

| Region | Hex | `Y` |
|---|---|---|
| Snow background | `#F5F9FD` | **0.943** |
| Skylit crown fur | `#E6DED6` | **0.739** |
| Muzzle bridge (brightest part of the animal) | `#E2E2E4` | **0.762** |
| Ruff, mid-lit | `#CCC1B8` | 0.544 |
| Ruff, inside shadow | `#A18C7B` (S **23.6 %**) | 0.278 |
| Deep chest crevice | `#9E8478` (S **24.1 %**) | 0.251 |
| Nose top plane | `#9A9EA6` (H 220°, **cool**) | 0.341 |
| Nose front plane | `#313339` | **0.033** |
| Ear region | `#978073` | 0.233 |

  - **Coat : snow = 0.739 : 0.943 = 1 : 1.28. The white dog is measurably darker than white.**
  - **The nose's internal range is 10 : 1** inside an 0.08 m object.
  - **The muzzle bridge is the highest-luminance region of the whole animal** — short fine hair on
    a forward-facing plane. §3.5 and §5.2 assign it `COAT_LIGHT` because of this.
  - **The ears are essentially undetectable** except as a warmer, darker lump — direct evidence for
    §2.4.8 and for putting `BADGER` on the leather.

**D. `Head of Great Pyrenees.jpg`** — 670 × 587, a dark side-lit head. Low quality, used only to
confirm ear geometry: the V-leather runs x 355 → 450, y 170 → 300, i.e. it hangs from **eye level**
(eye at y 165) down about **130 px**, lying flat on the side of the skull, with a base width of
**95 px** → **base : length = 0.73**, which is where §3.8's `0.102 : 0.125` comes from.
Our eye-to-jaw distance is `+0.090 − (−0.085) =` **0.175 m**, so §3.8's 0.125 m leather is
**0.71 × eye-to-jaw**, not the 0.79 the previous draft asserted (0.79 would give 0.138 m and would
hang the ear tip through the lip line).

### 10.2 Breed standards

- **Great Pyrenees, AKC official standard** (fetched via a club mirror; the AKC PDF itself returns
  binary): head *"wedge shaped with a slightly rounded crown"*; **muzzle approximately equal in
  length to the backskull**; skull width ≈ skull length; **cheeks flat**; eyes *"medium sized,
  almond shaped, set slightly obliquely, rich dark brown"* with **close-fitting black rims**;
  ears *small to medium, V-shaped with rounded tips, **set on at eye level**, carried low, flat and
  close to the head*; **black nose and lips**; *"a characteristic meeting of the hair of the upper
  and lower face which forms a line from the outer corner of the eye to the base of the ear"*
  (→ §3.2's seam line); backline level; ribs well-sprung and oval, reaching the elbows;
  **tailbones long enough to reach the hock**, well-plumed, carried low in repose and *"may be
  carried over the back"* when aroused — the standard's term for that carriage is
  **"making the wheel"** (→ §4.6; the previous draft misquoted this as "shepherd's crook"); **single dewclaw per foreleg, double dewclaws per
  rear leg** (→ §4.4); coat *"long, flat, thick outer coat of coarse hair, straight or slightly
  undulating"* over a *"dense, fine, woolly undercoat"*, with a **mane on the neck and shoulders,
  more pronounced in males**, feathering on the forelegs and a **pantaloon effect on the thighs**;
  **hair on the face and ears shorter and of finer texture** (→ §3.9); dogs 27–32 in / ~100 lb.
  https://impyrial.com/akc-breed-standard/ · https://images.akc.org/pdf/breeds/standards/GreatPyrenees.pdf
- **Kuvasz, AKC official standard** (re-fetched and re-checked in this revision): **head length
  measured nose to occiput is slightly less than half the height at withers; width is half the
  length of the head** (→ §3.0's 2.08 : 1); skull *"elongated but not pointed"*; **the stop is
  "defined, never abrupt, raising the forehead gently above the plane of the muzzle"** (→ §3.4's
  27°); muzzle top *"straight, not pointed"*, underjaw well developed; eyes almond, set well apart,
  somewhat slanted, dark brown, lids tight; **ears V-shaped with a slightly rounded tip, rather
  thick, "well set back between the level of the eye and the top of the head"; "when pulled forward
  the tip of the ear should cover the eye"** (→ §3.8, where the 0.125 m leather is checked against
  a 0.117 m base-to-eye distance and covers it by 0.008 m); lips black, upper lip tight over the
  upper jaw with **no excess flews**, lower lip not pendulous (→ §3.7's tight flews); nose large and black, lips black and tight; neck mane
  extends to the chest; **head, muzzle, ears and paws carry short smooth hair; back of the forelegs
  feathered 2–3 in; tail and back of the thighs 4–6 in** (→ §4.3, §4.4, §4.6); coat *"quite wavy to
  straight"*; skin heavily pigmented, slate-grey or black preferred; movement *"easy, free and
  elastic"*. https://www.telaquirekuvasz.com/kuvasz-akc-breed-standard · https://www.ukcdogs.com/kuvasz
- **Akita, AKC standard / World Union of Akita Clubs judging notes**: head a **"blunt triangle"**;
  **nose-to-stop : stop-to-occiput = 2 : 3**; stop *"well defined, but not too abrupt"*; eyes
  *dark brown, small, deep-set and triangular*; ears **small, thick, triangular, slightly rounded
  at the tips, strongly erect and carried forward**; forehead broad with a **distinct furrow**
  (→ §3.1's median furrow); muzzle *"moderately long and strong with a broad base, tapering but not
  pointed"*, ideally circular in frontal section. Used **as a contrast case**: the Akita's erect
  ear and hard eye slant are exactly what §3.8 and §3.3 deviate away from, because DOGEY already
  owns that silhouette. https://www.wuac.info/akita/judging/head.shtml · https://www.akitaclub.org/akc-akita-standard/

### 10.3 Coat structure

- **Guard hair vs undercoat**: guard hairs are *"stiffer, harder, glossier, smoother, coarser,
  longer and/or thicker in diameter"* than the undercoat; **each guard hair is surrounded by six to
  twelve downy secondary hairs** from the same follicle; nordic breeds' guard hair is stiffer and
  longer; the topcoat is effectively permanent while the undercoat sheds. This is the direct source
  for §6.1's **two-shell, two-roughness** construction: glossy coarse outer shell (`fur-long`,
  roughness 0.84, sheen 0.42) over a dead-matte dense inner shell (`fur-short` tinted `COAT_DEEP`,
  roughness 0.94, sheen 0). https://nationalpurebreddogday.com/guard-hair/
- **Follicle structure**: a central primary follicle with lateral follicles producing **5–25
  secondary hairs each**; fine dog hair ≈ **75 µm**, coarse hair **>200 µm**. Confirms the
  ~1 : 10 guard-to-under ratio the shells imply. (petplace.com structure-of-the-skin-and-hair-coat;
  labogen.com "Double Coat".)

### 10.4 Rendering white fur — the part I was asked to research specifically

- **The "plaster effect."** Backlit fur and cloth that lack subtle scattering *"look harsh and
  rigid"* where they should look soft; the fix is to light *"surfaces perpendicular to the viewing
  direction"*, approximating how *"tiny stray fibers catch the light when lit from behind, giving a
  'halo' effect"*, and to **modulate that highlight by a softened version of the standard lighting
  equation** so surfaces facing fully away stay dark. The same article uses a **normal-map alpha
  channel as a per-region rim mask**, which is exactly how §6.2 should restrict the sheen halo to
  the coat and keep it off the metal.
  https://www.gamedeveloper.com/programming/character-rim-lighting
- **Ambient discipline for light characters.** Ambient applied as a flat brightness lift *flattens
  silhouette contrast*; it should be used **as a tint, not as a brightness elevator**, because when
  ambient fill climbs, *edge contrast falls against similarly valued backgrounds and interior
  shading starts doing the job the silhouette used to do* — which is precisely Shibro's failure
  mode in `arctic-day` and `mountain-dawn`. Direct source for §5.5's arena request.
  https://gamineai.com/blog/lighting-2d-action-game-silhouettes-rim-ambient-shader-basics-2026
- **Warm/cool shading.** Gooch shading formalises warm-for-lit / cool-for-unlit so that shading
  occupies only the midtones and edges stay legible — the classic solution for exactly this problem
  (a light object that must not be shaded into mud). Also the standard art-direction rule that hue
  should shift *with* value: warm light → cool shadows. Both are the theory behind §5.1 R1 and
  `COAT_SKY`. https://en.wikipedia.org/wiki/Gooch_shading
- **Albedo ceilings.** Fresh snow is the brightest common natural material at roughly **0.8–0.9
  linear ≈ 236 sRGB**; white paint cannot exceed it; the practical dielectric albedo window is
  **~30–240 sRGB** (Lagarde gives 50–240; the Substrate PBR guide 30–240 — and the project contract
  uses 30–240). `COAT_LIGHT #EFE7D4` = (239, 231, 212) sits just inside the ceiling and just below
  snow, which is the physically correct place for a white animal.
  https://www.racoon-artworks.de/blog_PBRfromrulestomeasurements.php ·
  https://digitalcolony3d.wordpress.com/2019/07/25/albedo-chart/
- **Sheen BRDF.** Fabric/fur sheen arises from **fibre multiple scattering**, and the widely-used
  **Disney BRDF over-estimates forward-scattered sheen** relative to ground truth; garments show
  strong forward and backward scattering at grazing angles from flyaway fibres. Hence §6.2's
  instruction to keep `sheen` modest and grazing-only.
  https://dev.epicgames.com/documentation/en-us/unreal-engine/subsurface-profile-shading-model-in-unreal-engine
- **Fur technique, and why we are not using cards.** The standard real-time options are shells+fins
  and alpha hair cards; individual strand geometry *"requires millions of pieces and causes serious
  aliasing"*. Neither shells nor cards is available to us — the contract forbids imported assets and
  alpha cards fringe against the rim light this character depends on — so §6.3 spends the budget on
  **33 modelled bevelled lock wedges plus two shells**, which is the low-poly equivalent of a
  shells-and-fins outline.
  https://sketchfab.com/blogs/community/tutorial-real-time-fur-hair/ ·
  https://developer.download.nvidia.com/SDK/10.5/direct3d/Source/Fur/doc/FurShellsAndFins.pdf

### 10.5 The wolf collar

*Wolf collar* (Spanish **carlanca**, Italian **roccale** / **vreccale**, Latin **mellum** /
**millus**): a livestock-guardian dog's anti-predator collar — *"a strong leather belt around the
neck, equipped with nails"*, often steel, with **outward-facing spikes** protecting the throat and
carotid arteries, and *"soft leather padding sewn in to prevent the iron from harming the dog's
neck"*. Documented from Roman agricultural writing (Varro's *melium*) onward, still in common use
in Spain and Turkey. Spike length varies by regional style; no canonical dimensions exist, which is
convenient — §7.1's numbers are ours. https://en.wikipedia.org/wiki/Wolf_collar

### 10.6 Codebase

| Fact | Where |
|---|---|
| Frozen bone map, `HIP = [0, 1.0, 0]`, clip keys absolute | `src/characters/shibro.js:98–209`, `222–786` |
| `bladeControl()` reads `bones.forearmR.userData.blade` | `shibro.js:810–816` |
| `medalControl()` mutates `bones.torso.userData.medalMat.emissive` | `shibro.js:818–826` |
| `makeVillageDog()` shares `C.fur` / `C.dark` | `shibro.js:828–842` |
| `def.height 1.9`, `weight 1.15`, `stats { power 6, speed 6, defense 9, chaos 3 }` | `shibro.js:1240–1245` |
| `armor: 15` (shoulder-check), `armor: 18` (counter-stance) | `shibro.js:1283`, `1307` |
| `ACCESSORY_BONES` contains `'sash'`; `SECONDARY_BONES` contains `'earL','earR','tail'` | `src/combat/Gore.js:29–30` |
| `_detach()` clones a bone's whole subtree and freezes it | `Gore.js:257–290` |
| Match camera `PerspectiveCamera(45°)` at `(0, 2.7, 11.5)` → 1.90 m ≈ **142 px at 720p** | `src/combat/MatchScreen.js:165–167` |
| Default rig: `HemisphereLight(#cfe0ff, #54381e, 0.85)` + `DirectionalLight(#fff2d0, 1.6)` from `(6,12,7)` | `MatchScreen.js:170–173` |
| `fur-long` ships two clump scales + an undercoat darkening term | `src/render/textures.js:881–908` |
| 42 `surfaceMaps` kinds incl. `fur-long`, `fur-short`, `leather`, `horn`, `bone`, `snow`, `metal-brushed` | `textures.js:821–2230` |
| DOGEY owns erect ear spikes and a closed tail donut | `docs/parody/dogey.md` §2 |

### 10.7 What is still unverified

Stated plainly, so the next pass knows where to look:

1. **No source-project imagery was measured**, because naming or fetching the project's mascot art
   would be the exact §9 hazard this brief exists to avoid. The archetype was reconstructed from
   the contract's §9 row plus real breed anatomy. **If a future pass wants to verify the parody
   read, do it by showing the finished silhouette to someone who knows crypto culture — not by
   fetching the mascot.**
2. **The 2.4× eye upscale (§10.1 B) is an art call, not a measurement.** It is the number most
   likely to need adjusting after the first 128 px screenshot. If the face reads doll-like, come
   down to 2.0×; if the eyes disappear, go to 2.7× — but do not go past 0.35 × `W_s`.
3. **The 33-lock count in §6.3 has not been triangle-budgeted against a real build.** §6.5 gives
   the cut order.
4. **No `Y` measurements were taken from the game itself.** All the photographic values in §10.1
   are camera-processed sRGB from unknown pipelines, so treat them as *ratios*, which are robust,
   not as absolutes, which are not. And remember §0.6.6: the fur albedo map multiplies the base
   colour by ≈0.90 on average, so the rendered `COAT` will not measure `Y 0.649`.
5. **The skull is deliberately over-domed by ≈80 %** against reference photo A (dome 0.110 m above
   the eye line where the photograph gives 0.061 m). This is what buys the 5.20-head proportion
   with a `head` bone frozen at `M y 1.620`; the alternative was raising the head pivot and
   re-deriving the torso. **It is the number most likely to look wrong in the first screenshot.**
   If the head reads bulbous, take the dome down to `Hd +0.180` and raise the crown coat to
   0.100 m — the silhouette top stays at `M y 1.900` and nothing else in this brief moves.
6. **The 0.930 m pauldron span has not been checked against `shoulder-check`'s hitbox.** It is
   0.150 m wider than the previous draft assumed and the plates now lead the arm. Re-verify
   `shoulder-check` (`hitbox.up 1.1`) and `honor-throw` reach against the existing harness, and
   check the two-fighter idle spacing in `MatchScreen` — two Shibros standing 0.93 m wide each may
   need the arena's start separation looked at.
7. **The corrected stop (27°, was 17°) moves this head toward the Akita and away from the
   Pyrenees.** That is defensible against §9 D2 and it is what the coordinates demand, but it is a
   judgement call. If a reviewer says "too much stop", the fix is to raise the frontal ramp's
   entry, not to flatten the bridge — the bridge is pinned by the nose.

---

## 11. Acceptance checklist — measure these, don't eyeball them

Take the screenshots. Measure them. Report the numbers.

**Silhouette (fill black, 128 px, at azimuths 0° and ±25°)**

1. Total height **1.90 m ± 0.01**; head height **0.365 ± 0.01**; ratio **5.20 ± 0.15 head-heights**.
2. **Head width : ruff width = 1 : 1.85 ± 0.15**, measured `0.325` at `M y 1.725` against `0.600`
   at the ruff crest band `M y 1.620–1.700`. Fails below 1 : 1.6. **Do not measure the ruff at the
   shoulders** — the shoulders are 0.870 m of flesh and 0.930 m of armour and will give you a false
   pass of 1 : 2.9.
3. **No ear appears in the black fill.** Ear projection beyond the local coat surface **≤ 0.012 m**,
   and the ear's outer face **≤ 0.1625** in `z` (i.e. inside the head's widest point).
4. **≥ 9 discrete lock breakers** visible on the ruff outline, each 0.05–0.11 m proud.
5. The **tail-to-back void is open** and never narrower than **0.09 m** in any frame of any clip —
   including `launched`, `knockdown` and the finisher. **Measure it against the mane's rear surface,
   not the ribcage** (§4.6): the mane is what the plume tip actually passes over, and it is where
   the previous bind pose failed at 0.035 m. Instrument it; do not eyeball it.
6. Ruff step: outline moves **≥ 0.14 m outward within 0.10 m of vertical travel** at the jaw.
7. Stance gap at knee height **≥ 0.16 m**; arm-to-ribcage gap **≥ 0.075 m** in idle.
8. **Three** straight pauldron horizontals (`M y 1.622 / 1.566 / 1.504`, profile lengths
   0.300 / 0.280 / 0.240 m) and one dark collar band are individually visible at 128 px, and the
   pauldron span measures **0.930 ± 0.02 m** — wider than the 0.870 m of shoulder flesh under it.
8b. **The `0.080 × 0.063 m` background slot** between plate 1 and the ruff crest is open at 0° and
   at both ±25° azimuths (§2.5).

**Head**

9. `L_mz : L_sk = 0.72 : 1 ± 0.03`. Head length : `W_s` = **2.08 : 1 ± 0.08**.
10. Eye aperture **0.066 × 0.032 m** (**0.307 × `W_s`**, aspect 2.06 : 1); interpupillary
    **0.125 m**; obliquity **+7°**; **eyeball radius 0.040 m** — assert `2r > aperture width`,
    because the previous draft shipped a ball narrower than its own aperture.
13b. Stop plane break measures **27° ± 3** between a **−35.6°** frontal ramp and a **−8.7°** bridge.
13c. Skull dome bone at `M y 1.820` with **0.080 m** of crown coat on top of it summing to
    `M y 1.900 ± 0.005`. If the crown coat is thinner, the character is short.
11. Upper lid coverage at idle is **28 % ± 4**. If it is over 40 % you have built a tired character.
12. **Mouth corners between −3° and +2° in every pose except `bark`.**
13. Stop reads as a visible inflection in a **128 px profile** render.
14. **Dark-accent area is 8–14 % of the projected head area.** Measure it: render the head on a
    flat background, threshold at `Y < 0.12`, count pixels.
15. Nose front plane and nose top plane differ by **≥ 6 : 1** in the rendered frame.

**Colour and light**

16. Every albedo channel in `[30, 240]`. No `#FFFFFF` anywhere. Assert both.
17. None of `#C5C2A5`, `#CCC1B8`, `#E6DED6`, `#A18C7B`, `#CBC1B8` appears in the palette.
18. **Desaturate a 128 px render**: nose, both eyes, both ear patches, collar band, pauldrons and
    sash are each still individually identifiable.
19. **Render him in `frozenTokenLab` and in `mountainNodeVillage`.** He must not lose his outline
    against the bright ground or sky in either. If he does, that is your §5.5 arena request —
    report it, do not fix it in someone else's file.
20. **Render him in `reserveCore` and `settlementExpress`** (dark arenas) and confirm nothing on
    the coat clips to 1.0 with bloom on.
21. The mane's outer locks and the medallion are **still moving 0.5 s after the body has stopped**,
    and the medallion is the last thing to settle.

**Engine API — cheap asserts that catch the four silent failures of §0.6**

21b. **Log every material you build**: `mat.roughness`, `mat.sheen`, `mat.sheenColor.getHexString()`,
    `mat.aoMapIntensity`, and `mat.userData.__wcsPreset`. Compare against §6.1's "target ≈" column.
    A roughness of 0.24 where you asked for 0.28 means you passed an absolute where a multiplier
    was expected (§0.6.2).
21c. **Assert the texture kind you got**, not the one you asked for: `mat.normalMap.userData` /
    `textureCacheStats()` before and after. If you passed `maps:` in the overrides expecting it to
    do something, it did nothing (§0.6.1) and you are looking at `fur-short` on the mane.
21d. **Assert `mat.isMeshPhysicalMaterial === true` on every fur material.** If `QUALITY.physical`
    is off, `resolvePreset()` silently walks `fur-long → fur-flat` and **you lose the sheen halo
    that §5.5 calls this character's insurance policy.** Confirm the `low`-tier fallback still
    reads, because on this character it is the one that will not.
21e. **Assert no material other than the medallion's was built with `unique: true`** (§6.5.3), and
    that `torso.userData.medalMat` *was*.

**Contract**

22. `npm run build` clean; `window.__errs` empty (see `DRIVER.md`).
23. **Measured triangle count ≤ 32,000; draw calls ≤ 40** in the bind pose. Report both.
24. Frame time on `high` within 15 % of the pre-change baseline for a Shibro-vs-Shibro match.
25. Exported bone map is **exactly** the 15 frozen names in the frozen hierarchy (§0.2).
26. `buildModel(0)` and `buildModel(1)` both build; costume 1 differs in **materials only**.
27. All 31 clips play without a visible gap, interpenetration or floating prop. Spot-check
    `lowSweep`, `risingChain`, `launched`, `knockdown` and `slashedValidator` specifically.
28. Tear an ear, tear the tail, pop the sash and tear a forearm in `max` gore mode. **Every
    detached piece is closed geometry with no visible hole**, and `bladeControl()` still no-ops
    safely after the right forearm is gone.
29. §9.3's greps all return zero.
30. You have taken **your own screenshots in the live game and looked at them** — including one at
    128 px, filled black. Not "it should look like X". You looked.
