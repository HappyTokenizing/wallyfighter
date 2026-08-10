# WCS — AAA GRAPHICS CONTRACT (v3.0 "Bull Market" visual overhaul)

**Status:** authoritative. Every graphics agent codes against this file. If you need
to change an exported signature here, you must say so in your report — you may not
silently diverge. Anything not specified here is your call.

---

## 0. Prime directive & art direction

We are taking WCS from *"deliberately 2002 low-poly"* to **AAA stylized** — the bar is
**Street Fighter 6 / Tekken 8 / Overwatch 2 / Fortnite / Astro Bot / Sackboy**, not
photoreal Unreal 5 archviz. The goal is a frame that, placed blind next to a shipped
AAA fighting game screenshot, a hostile art director cannot immediately pick out as
the amateur one.

Keep: the comedy, the parody identity, the readability of a fighting game, 60 fps.
Kill: flat Lambert shading, untextured surfaces, gaps between body parts, banded
gradient skies, blob shadows, sterile lighting, mushy silhouettes.

The five things that separate a AAA frame from a hobby frame — every agent is
judged against these:

1. **Surface response.** Nothing is a flat colour. Every surface has albedo
   variation, a normal/bump response, spatially varying roughness, and ambient
   occlusion in its crevices. Metal reflects the environment. Skin/fur scatters.
2. **Lighting design.** Key/fill/rim is *composed*, not defaulted. Rim light
   separates the fighters from the background in every arena. Bounce light carries
   the floor colour up into the characters. Shadows are soft, contact-tight, and
   never acne-y or peter-panning.
3. **Post & tone.** Filmic tonemapping, bloom that only blooms real emitters,
   grounded ambient occlusion, subtle depth of field, a deliberate colour grade,
   vignette, film grain, and sharpening. No raw sRGB clamp.
4. **Silhouette & detail hierarchy.** Big read at 3 m, medium read at 1 m, micro
   detail at 30 cm. Bevels/chamfers on every hard edge (nothing reads as a raw
   `BoxGeometry`). No interpenetrating primitive seams.
5. **Motion.** Weight, anticipation, overshoot, settle, secondary motion,
   follow-through, and impact frames. Nothing moves linearly.

### Style guardrails
- Stylized-PBR: exaggerated forms, believable materials. Roughness values live in
  plausible physical ranges; albedo stays in 30–240 sRGB (never pure 0 or 255).
- Chunky, confident shapes. We are not adding polygon soup — we are adding
  **bevels, thickness, texture and light**.
- Colour: each arena has a documented 3-colour key/fill/rim scheme and a hero
  accent. Fighters must stay readable against their arena (rim light is the tool).
- Performance budget: 60 fps at 1080p on `high`, on an M-series laptop. Draw calls
  under ~900 in a match. Do not exceed ~250k triangles in a match scene.

---

## 1. Module map & file ownership

New render layer (`src/render/`), all ES modules, all `import * as THREE from 'three'`:

| File | Owner | Exports |
|---|---|---|
| `src/render/noise.js` | foundation | seeded noise/fbm/worley/voronoi on typed arrays |
| `src/render/textures.js` | foundation | procedural PBR map generation + cache |
| `src/render/materials.js` | foundation | `pbr()` factory, `SURFACE` presets, `upgradeMaterials()` |
| `src/render/env.js` | foundation | PMREM environment per mood |
| `src/render/lighting.js` | foundation | `makeCinematicRig()` + shadow tuning |
| `src/render/Pipeline.js` | foundation | `RenderPipeline` (EffectComposer stack) |
| `src/render/index.js` | foundation | barrel re-export |

Existing files, one owner each — **never edit a file you do not own**:

- `src/characters/<id>.js` — that fighter's agent, exclusively.
- `src/arenas/<id>.js` — that arena's agent, exclusively.
- `src/arenas/ArenaBase.js` — the arena-toolkit agent, exclusively.
- `src/combat/Animator.js`, `src/combat/Particles.js`, `src/combat/Gore.js`,
  `src/camera/CameraController.js`, `src/physics/*` — one agent each.
- `src/core/Game.js`, `src/config/GameConfig.js`, all `render(renderer)` call
  sites — the **integrator** only.

---

## 2. `src/render/noise.js`

```js
export function hash2(x, y, seed = 0)                    // -> [0,1)
export function makeValueNoise2D(seed)                   // -> (x, y) => [-1,1]
export function makePerlin2D(seed)                       // -> (x, y) => [-1,1]
export function makeSimplex2D(seed)                      // -> (x, y) => [-1,1]
export function fbm2D(noiseFn, x, y, opts)               // { octaves=5, lacunarity=2, gain=0.5 }
export function ridged2D(noiseFn, x, y, opts)
export function makeWorley2D(seed, opts)                 // { cells=8, tileable=true } -> (x,y) => {f1,f2,id}
export function makeVoronoiCells(seed, count, w, h)      // -> [{x,y,id}] for scatter work
export function domainWarp2D(noiseFn, x, y, amount)      // -> [wx, wy]
```
All must be **tileable** when `opts.tileable !== false` (wrap the lattice) — arena
floors and fur tile. All deterministic from `seed`. No `Math.random()` anywhere in
the render layer.

---

## 3. `src/render/textures.js`

### Core
```js
// Cached canvas → texture. `key` must be unique per distinct output.
export function procTexture(key, size, drawFn, opts)
// opts: { srgb=false, repeat=[1,1], nearest=false, aniso=8, mips=true }

// Height (Float32Array, size*size, [0,1]) → derived maps.
export function normalFromHeight(height, size, strength = 1, opts)
export function roughnessFromHeight(height, size, opts)  // { base, contrast, invert }
export function aoFromHeight(height, size, opts)         // { radius=4, strength=1 }
export function curvatureFromHeight(height, size)

export function disposeTextureCache()
export function textureCacheStats()                      // { count, bytes }
```

### Surface generators
```js
// The one call everyone uses. Returns a *shared, cached* map set.
export function surfaceMaps(kind, opts = {}) // -> { map?, normalMap, roughnessMap, aoMap?, bumpMap? }
```

`kind` must support **at least**:

`fur-short`, `fur-long`, `fur-coarse`, `skin-smooth`, `skin-amphibian`, `skin-reptile`,
`skin-elephant`, `feather`, `scales`, `cloth-weave`, `cloth-knit`, `denim`, `suit-wool`,
`leather`, `rubber`, `plastic-matte`, `plastic-gloss`, `metal-brushed`, `metal-polished`,
`metal-painted`, `metal-rusted`, `gold`, `chrome`, `concrete`, `asphalt`, `marble`,
`granite`, `wood-plank`, `wood-rough`, `ice`, `snow`, `sand`, `mud`, `water`, `glass`,
`neon-panel`, `circuit`, `screen-crt`, `pixel-grid`, `paper`, `bone`, `horn`.

`opts` may carry `{ scale, seed, tint, wear, tileable, size }`. Unknown kinds must
fall back to a neutral micro-detail set and `console.warn` once — never throw.

**Budget:** default map size 512 (256 on `low`, 1024 for hero surfaces only). The
cache must be shared globally: two fighters asking for `fur-short` get the *same*
GPU texture. Total texture memory must stay under ~80 MB on `high`.

### Detail / utility
```js
export function triplanarDetailNormal(scale)   // shared micro-normal for "everything"
export function decalTexture(key, size, drawFn) // sRGB alpha decal (logos, stencils, tattoos)
export function gradientRamp(stops, size = 64)  // 1D LUT (sRGB) for toon/fresnel ramps
```

---

## 4. `src/render/materials.js`

```js
export const SURFACE = { /* preset name -> { roughness, metalness, envMapIntensity,
                            normalScale, clearcoat?, sheen?, sheenRoughness?,
                            iridescence?, transmission?, maps: <textures kind> } */ }

// Primary factory. Cached by (color, preset, JSON of overrides).
export function pbr(color, preset = 'default', overrides = {}) // -> MeshStandardMaterial | MeshPhysicalMaterial

// Emissive helper — the ONLY sanctioned way to make something bloom.
export function emissive(color, intensity = 2, preset = 'neon-panel', overrides = {})

// Walk a subtree and upgrade legacy materials in place.
// - MeshLambertMaterial -> MeshStandardMaterial with a preset inferred from
//   opts.hints (by mesh name / material colour), defaulting to 'default'.
// - MeshBasicMaterial is left alone UNLESS opts.upgradeBasic === true.
// - Preserves: color, transparent, opacity, side, flatShading, depthWrite,
//   vertexColors, map, emissive, name, userData.
// - Idempotent: safe to call twice on the same subtree.
export function upgradeMaterials(root, opts = {})
// opts: { hints: { <regex source or mesh-name substring>: <preset name> },
//         default: 'default', upgradeBasic: false, flatShading: undefined,
//         castShadow: true, receiveShadow: true, envMapIntensity: 1 }

export function setEnvironment(tex)      // stored + applied to every material the factory makes
export function disposeMaterialCache()
export function materialCacheStats()
```

**Rules**
- `pbr()` MUST cache. A 10-fighter roster asking for the same grey 40 times gets
  one material. Cache key includes the map set.
- Never mutate a cached material outside the factory. Callers that need a unique
  instance (flash, damage tint, dismemberment fade) pass `overrides.unique = true`.
- `flatShading` must stay available — some parody looks depend on it — but it is
  **off by default** now. Faceting comes from bevelled geometry, not flat normals.
- Every material gets `envMapIntensity` and participates in IBL.

### Presets that must exist
`default`, `fur`, `fur-dark`, `skin`, `skin-wet`, `hide`, `feather`, `cloth`, `suit`,
`denim`, `leather`, `rubber`, `plastic`, `plastic-gloss`, `metal`, `metal-rough`,
`gold`, `chrome`, `glass`, `ice`, `bone`, `horn`, `wood`, `concrete`, `stone`,
`marble`, `sand`, `snow`, `mud`, `water`, `neon-panel`, `screen`, `emissive`,
`decal`, `foliage`, `paper`.

---

## 5. `src/render/env.js`

```js
export const MOODS = { /* moodName -> { sky, horizon, ground, sun, sunSize,
                                        sunIntensity, ambient, clouds, contrast } */ }
export function buildEnvironment(renderer, mood = 'studio', opts = {}) // -> THREE.Texture (PMREM)
export function applyEnvironment(scene, mood, renderer, opts = {})     // sets scene.environment + returns handle
export function disposeEnvironments()
```

Environments are generated procedurally (gradient sky + sun disc + horizon bounce +
cloud bands drawn to a cube render target, then PMREM-prefiltered). Cache by mood.

Required moods, one per arena mood: `studio`, `sunset-stadium`, `noon-stadium`,
`night-neon`, `overcast-swamp`, `arctic-day`, `interior-vault`, `museum-gallery`,
`subway-tunnel`, `tower-dusk`, `reserve-core`, `meme-plaza`, `mountain-dawn`,
`liquidation-storm`.

---

## 6. `src/render/lighting.js`

```js
export function makeCinematicRig(scene, quality, opts = {}) -> {
  group,                 // add to scene
  key, fill, rim, hemi,  // THREE lights
  sun,                   // alias of key — BACKWARDS COMPAT with makeLightRig
  bounce,                // optional hemisphere/area bounce
  setFocus(vec3),        // move the shadow frustum + rim target to the action
  update(dt, focusVec3), // per-frame; tightens shadow camera, animates flicker
  setIntensity(scale),   // global dimmer, for KO slow-mo / cinematics
  dispose(),
}
```

`opts` extends `makeLightRig`'s existing options and adds:
`{ rimColor, rimIntensity, rimPos, bounceColor, bounceIntensity, mood,
   shadowSoftness, contactShadows, volumetric, flicker }`

**Shadow requirements** (this is where the current build loses hardest):
- `THREE.VSMShadowMap` or `PCFSoftShadowMap` — never plain `PCFShadowMap`.
- The shadow camera must be **tightly fitted to the action** (via `setFocus`), not a
  fixed ±16 box. A 2048 map over a 12 m frustum is worth more than 4096 over 40 m.
- `shadow.bias` / `normalBias` tuned so there is neither acne nor peter-panning.
- A **contact-shadow / AO-disc** under each fighter so nobody floats.

`makeLightRig` in `ArenaBase.js` must keep working (existing arenas call it), and
should become a thin wrapper over `makeCinematicRig`.

---

## 7. `src/render/Pipeline.js`

```js
export class RenderPipeline {
  constructor(renderer, quality, opts = {})
  setSize(w, h)
  setQuality(quality)              // rebuilds passes for the tier
  render(scene, camera, dt)        // THE render entry point for every screen
  // --- live knobs ---
  set exposure(v)                  // 0.6 .. 1.6
  setBloom({ strength, radius, threshold })
  setDoF({ focus, aperture, maxblur, enabled })
  autoFocus(target)                // world-space Object3D or Vector3
  setGrade({ lift, gamma, gain, saturation, temperature, contrast })
  setVignette(amount)
  setGrain(amount)
  setChromatic(amount)
  setMotionBlur(amount)
  impact(strength = 1)             // one-frame punch: flash + CA + shake-safe bloom kick
  flash(color, strength, frames)
  dispose()
}
```

### Pass order (high tier)
1. `RenderPass`
2. Depth/normal prepass (as needed by AO)
3. **GTAO** (`GTAOPass`) — grounded ambient occlusion, denoised
4. **Bloom** (`UnrealBloomPass`) — threshold high enough that only emissives bloom
5. **DoF** (`BokehPass`) — subtle, focus tracked to the fighters' midpoint
6. **Motion blur** — cheap velocity-free variant (`AfterimagePass` at low damp, or a
   custom camera-velocity shader). Must be *subtle*: this is a fighting game.
7. **Colour grade + tonemap** — custom `ShaderPass`: exposure → AgX/ACES filmic →
   lift/gamma/gain → saturation → temperature → contrast S-curve
8. **Chromatic aberration + vignette + film grain + sharpen** (single combined pass)
9. **SMAA** (`SMAAPass`)
10. `OutputPass`

### Tier matrix
| tier | passes |
|---|---|
| `low` | direct render, ACES tonemap on the renderer, no composer |
| `medium` | Render → Bloom → Grade/vignette/grain → SMAA → Output |
| `high` | full stack above, GTAO half-res, DoF on |
| `ultra` | full stack, GTAO full-res, TAA-ish jitter accumulation when idle |

`renderer.toneMapping = THREE.ACESFilmicToneMapping` (or AgX in the grade pass — pick
one, do not double-tonemap), `renderer.toneMappingExposure` driven by `exposure`.

**Hard requirement:** at `low` the pipeline must be a pass-through so mobile stays
at 60 fps, and the whole thing must degrade gracefully if a pass fails to compile
(try/catch around pass construction, fall back to the tier below, `console.warn`).

---

## 8. Integration surface (integrator agent only)

- `Game` constructs `this.pipeline = new RenderPipeline(renderer, quality)` and
  exposes it. `setQuality()` forwards. `resize` forwards to `setSize`.
- A new helper `src/render/index.js` exports
  `renderScene(game, scene, camera, dt)` — every `render(renderer)` call site in
  `src/ui/**`, `src/modes/**`, `src/combat/MatchScreen.js`, `src/replay/ReplayUI.js`,
  `src/ui/MenuBackdrop.js` switches from `renderer.render(scene, camera)` to it.
- `GameConfig.quality` gains per-tier render knobs:
  ```js
  { pixelRatio, shadows, shadowSize, shadowType, crowd, maxDebris, particleScale,
    propLimit, reflections, post: { ao, bloom, dof, motionBlur, aa, grain },
    textureSize, anisotropy, envResolution }
  ```
  plus a new `ultra` tier. Existing keys keep their meaning.
- `MatchScreen` calls `pipeline.autoFocus(midpointOfFighters)` and
  `pipeline.impact()` on heavy hits — the camera-shake path stays where it is.

---

## 9. Parody-likeness briefs (character agents)

The mandate: **each fighter must be instantly recognisable as a parody of its
source**, while remaining legally distinct (no source names, logos, or 1:1 trade
dress — recognisable *archetype and silhouette*, changed proportions, our own
colourways and marks). Judge yourself by: *"would someone who knows crypto culture
name the reference within 2 seconds of seeing the silhouette?"*

| Fighter | Source archetype | Non-negotiable read cues |
|---|---|---|
| **WALLY** (`wally.js`) | The world's largest asset manager as a suit-wearing elephant | Elephant silhouette that reads at 3 m: heavy trunk with articulated rings, broad flap ears, tusks. Tailored double-breasted charcoal suit with real lapels/buttons/pocket square stretched over bulk. Black wraparound shades with a rising-chart glint. Corporate, calm, enormous. Grey hide with cracked-leather micro-detail. |
| **DOGEY** (`dogey.js`) | The 2013 Shiba Inu "doge" meme | The *exact* doge read: cream/tan Shiba head, dark-tipped erect triangular ears, white muzzle mask, tiny black nose, and the signature **side-eye** with raised inner brows and slightly crossed pupils. Fluffy curled-over tail. Slightly stumpy, round-bodied, permanently mid-"wow". |
| **SHIBRO** (`shibro.js`) | The other, more earnest dog coin — a white mountain guardian dog | Massive white/cream double-coated mountain dog: broad chest ruff, plumed tail, dark serious eyes, black nose, blocky muzzle. Noble, heroic stance, a stoic protector. Fur must read as long and layered, not painted. |
| **BONKO** (`bonko.js`) | The hyper-fast dog-coin courier of a high-TPS chain | Lean cattle-dog/blue-heeler: mottled blue-grey merle coat, prick ears, athletic build, courier satchel and cap, motion-ready crouch. Speed lines and a tail that never stops. |
| **PEEPEE** (`peepee.js`) | The internet's most famous frog | The specific frog face: broad flat head, huge round bulging eyes with heavy droopy lids, wide down-turned mouth with pronounced reddish lips, small chin. Green amphibian skin — wet, slightly translucent, with pores and mottling. Cheap ill-fitting blue shirt and a loose tie. Slouched, gormless posture. |
| **TIRED APE** (`tired-ape.js`) | The bored-ape PFP collection | Straight-on PFP energy: broad flat-faced ape head, wide lipped grimace-mouth, half-lidded dead-eyed stare, coarse fur. Loaded with the collection's trait language — knit cap or captain's hat, cigarette hanging, gold hoop, boat-neck striped shirt / bathrobe, heavy gold chain. Slumped shoulders, coffee mug welded to one hand. |
| **FATTY PINGO** (`fatty-pingo.js`) | The chubby-penguin NFT collection | Perfectly round pear body, matte pastel-cream belly against a soft dark-blue back, tiny stubby wings, tiny orange feet and a small triangular beak, and huge friendly round eyes. Toy-like: soft-edged, almost vinyl-figure surfacing. A knitted hat/scarf accessory. Everything rounded — zero hard corners. |
| **CRYPTO PUNK'D** (`crypto-punkd.js`) | The 24×24 pixel-avatar collection | Deliberately **voxel** head — a true chunky pixel grid, flat frontal read, on a real 3D body. Pale/teal-tinted skin, wild mohawk, VR/pixel shades, a pixel pipe with a voxel smoke puff, stubble blocks. The joke is that only the head is 8-bit; the trenchcoat gumshoe body is smooth and modern. |
| **COOL PAL** (`cool-pal.js`) | The unbothered "just a chill guy" meme, as a capybara | Capybara proportions: blunt rectangular muzzle, tiny round ears set far back, small half-closed eyes, coarse wiry brown fur, barrel body, stumpy legs. Total serenity. A beverage. Optional tiny bird or citrus slice riding on top. Slouched, hands-in-pockets nonchalance. |
| **BLACKISH BULL** (`blackish-bull.js`) | The Wall Street charging bull as a corporate enforcer | Massive charging-bull mass: deep chest, low heavy head, wide forward-curved horns, ring in the nose, thick neck hump, hooves. Dark bronze/obsidian hide with a patinated-metal quality (it's a *statue* come to life). Corporate visor and a tie that reads as a leash. UNCHAINED boss form: molten cracks, broken chains, emissive rim. |

Every fighter also needs, at AAA level:
- **Face**: real eye geometry (sclera + iris + pupil + specular highlight + lid
  geometry), blink, brow shapes, a mouth that can move. Not painted-on quads.
- **Bevels**: every hard edge chamfered. Nothing is a raw `BoxGeometry` anymore.
- **No gaps**: joints must be visually continuous — overlap or sleeve every joint.
- **Detail hierarchy**: stitching, seam lines, buttons, fur clumps, worn edges.
- **Silhouette test**: filled black at 128 px, the fighter is still identifiable.
- Costume variants must keep working (`buildModel(costume)`).
- The bone names, rig hierarchy, hitbox heights, hurtbox sizes, move scripts and
  `CharacterDef` API in `CONTRACTS.md §4` **must not change**. This is a visual
  overhaul, not a gameplay one. If a proportion change moves a hand, update the
  move script's reach constants to match — verify with the existing harness.

---

## 10. Arena briefs

Every arena must deliver: a composed 3-light scheme with fighter rim separation, a
mood env map, PBR floor with real material response, depth (fore/mid/background
layers), atmospheric perspective (fog/haze tuned to the mood), a sky that is not a
2-stop banded gradient, crowd that reads as a crowd, and at least one *hero* lighting
moment (god rays, neon spill, fire flicker, screen glow, caustics).

| Arena | Mood | Hero lighting moment |
|---|---|---|
| `memeMarket` | `meme-plaza` | Neon sign spill on wet plaza stone |
| `bullMarketColosseum` | `sunset-stadium` | Low sun god-rays through the arch tiers |
| `liquiditySwamp` | `overcast-swamp` | Volumetric mist + bioluminescent pool caustics |
| `frozenTokenLab` | `arctic-day` | Sub-surface ice glow + cold specular |
| `mountainNodeVillage` | `mountain-dawn` | Warm dawn rim over cold blue shadow |
| `lostBlockMuseum` | `museum-gallery` | Pinpoint gallery spots + marble bounce |
| `settlementExpress` | `subway-tunnel` | Strobing tunnel lights + sparks |
| `institutionalCapitalTower` | `tower-dusk` | Floor-to-ceiling glass with city bokeh |
| `calmBeforeLiquidation` | `liquidation-storm` | Lightning flashes driving the key light |
| `permanentReserveCore` | `reserve-core` | Emissive vault glyph as the dominant source |

---

## 11. Animation, VFX, camera, physics bar

- **Animator**: Catmull-Rom / Hermite interpolation option, additive layers
  (breathing, damage-limp, look-at), per-bone masks, root motion hooks, an IK pass
  for foot planting, and secondary motion (ears/tails/cloth/belly jiggle) driven by
  a spring solver. Existing clip format must keep playing bit-identically unless a
  clip opts in.
- **VFX**: impact language with a shared vocabulary — hit sparks, impact rings,
  radial smears, dust puffs with proper turbulence, debris with real physics,
  screen-space impact frames. Soft particles (depth-faded), additive vs alpha
  separated, all instanced/pooled. No white cubes, ever.
- **Camera**: shot composition. Framing that keeps both fighters in the golden
  region, dynamic FOV on approach, hit-stop punch-ins, KO cinematics with real
  camera language (dolly, whip pan, crash zoom), and depth-of-field that follows.
- **Physics**: ragdolls with real joint limits and no jitter, cloth/rope on capes
  and ties, soft-body-ish belly/jowl jiggle, correct restitution per material,
  debris that settles rather than vibrates.

---

## 12. Definition of done (per agent)

You are done when **all** of these hold:

1. `npm run build` succeeds with zero errors.
2. The game runs with **zero console errors/warnings** attributable to your change
   (`window.__errs` empty; see `DRIVER.md`).
3. You have taken **your own screenshots** of your work in the live game and looked
   at them. Not "it should look like X" — you looked.
4. Frame time did not regress more than 15% on `high` for your area.
5. A hostile critic, shown your frame blind next to a real AAA screenshot, does not
   immediately identify yours as the amateur one.
6. You wrote what you changed and what you'd do next in your report.

**Verification technique**: see `DRIVER.md` — the browser tab may be `hidden`, so use
manual time-stepping via `window.__step(frames)` and screenshot between bursts.
