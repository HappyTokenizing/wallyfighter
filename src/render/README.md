# `src/render/` — how to ask for a material

Everything here is procedural. **No image assets, ever. No new npm deps.**
Import from the barrel, never from an individual module:

```js
import { pbr, emissive, upgradeMaterials, makeMaterialFactory,
         surfaceMaps, applyEnvironment, makeCinematicRig,
         renderScene } from '../render/index.js'
```

---

## 1. The 30-second version

| you are | do this |
|---|---|
| a **character** agent | `const M = makeMaterialFactory({ scope: 'wally' })`, replace your `lamb()` body with `M.pbr(...)` |
| an **arena** agent | build as you do today, then `upgradeMaterials(this.root, { hints: {...} })` once at the end of `build()` |
| adding a **glowing** thing | `emissive(0x00ffcc, 2)` — never `color: 0xffffff` + `emissiveIntensity` |
| adding **one prop** | `pbr(0x8899aa, 'metal')` |
| mutating a material at runtime | **`{ unique: true }`**, or use a scoped factory. See §5. |

---

## 2. `pbr(color, preset, overrides)`

Returns a cached `MeshStandardMaterial` / `MeshPhysicalMaterial` with an albedo,
normal, roughness and AO map already wired and colour-spaced correctly.

```js
pbr(0x3a3f47, 'suit')                                  // cached, shared
pbr(0x3a3f47, 'suit', { unique: true })                // yours alone
pbr(0xd8d8d8, 'concrete', { mapOpts: { scale: 4, repeat: [6, 6], wear: 0.4 } })
```

`overrides` accepts **any** material property (`transparent`, `opacity`, `side`,
`depthWrite`, `flatShading`, `vertexColors`, `map`, `name`, …) plus:

| key | meaning |
|---|---|
| `unique: true` | skip the cache — mandatory if you will mutate it |
| `mapOpts` | `{ scale, seed, tint, wear, tileable, size, repeat, hero }` → `surfaceMaps()` |
| `noMaps: true` | parameters only, no textures (far LOD, menus, silhouettes) |
| `physical: true` | force `MeshPhysicalMaterial` |
| `emissive`, `emissiveIntensity` | glow (prefer `emissive()`) |
| `guardAlbedo: false` | opt out of the 30–240 sRGB albedo clamp |

**Roughness is a multiplier, not an absolute.** The roughness map already carries
the physically correct value for its kind (concrete 0.86, gold 0.18, chrome 0.06).
`overrides.roughness` multiplies it — three.js semantics. `0.6` = "40 % shinier
than real concrete", not "roughness 0.6".

---

## 3. Presets

`default` · `fur` `fur-dark` `fur-long` `fur-coarse` · `skin` `skin-wet`
`skin-reptile` `hide` · `feather` `scales` · `cloth` `knit` `suit` `denim`
`leather` · `rubber` `plastic` `plastic-gloss` · `metal` `metal-rough`
`metal-painted` `gold` `chrome` · `glass` `ice` `water` · `bone` `horn` ·
`wood` `wood-rough` `concrete` `asphalt` `stone` `marble` · `sand` `snow` `mud`
`foliage` · `neon-panel` `screen` `emissive` `circuit` `pixel-grid` · `paper`
`decal`

Names ending `-flat` are the auto-selected non-`MeshPhysicalMaterial` fallbacks
for the `low` tier — do not ask for them by hand;
`setMaterialQuality({ physical: false })` picks them for you.
`surfacePresets()` for the live list; `SURFACE.fur` to read the numbers.

---

## 4. The hint table (`DEFAULT_HINTS`)

`upgradeMaterials()` picks a preset per mesh, in this order:

1. `mesh.userData.surface = 'gold'` — explicit, always wins
2. `material.name`
3. `mesh.name`
4. ancestor **group** names, nearest first, 6 levels up (arenas name the group:
   `goldBar`, `ropeBridge`, `vaultDoor`)
5. your `opts.byColor(color, mesh, mat)` classifier
6. `opts.default` (`'default'`)

Matching is case-insensitive substring, **longest key wins** (`eyeWhite` beats
`eye`). ~230 defaults ship: `fur/pelt/mane/tail/ear`→fur, `trunk/jowl/hump`→hide,
`tusk/horn/claw/beak/hoof`→horn, `lapel/blazer/cuff`→suit, `coin/bullion/medal`→gold,
`neon/sign/glow`→neon-panel, `ticker/monitor/billboard`→screen, `leaf/vine/moss`→foliage…

Extend per call — **do not edit the table** for one arena:

```js
upgradeMaterials(this.root, {
  hints: { tickerFace: 'screen', wetStone: 'marble', '/^crate[0-9]+/': 'wood' },
})
console.log(presetForMesh(someMesh))   // dry-run the table before committing
```

---

## 5. The one bug that will bite you

`Fighter.js:96-103` collects **every** material in a fighter with an `.emissive`
and `flash()` sets them all white for 2 frames. `Gore.js`, the camera-occluder
fade, `settlementExpress`, `frozenTokenLab`, `permanentReserveCore` and
`ReplayManager` all drive `material.opacity` on a **single** mesh. Three character
files call `material.color.setHex()` on a single prop.

> **If a shared cached material lands on any of those meshes, punching one
> fighter flashes the whole arena white.**

Rules:

- Anything you will mutate: `{ unique: true }`, or a **scoped factory**.
- `isSharedMaterial(mat)` is the assert. Never mutate one that returns `true`.
- `upgradeMaterials()` is already safe — it preserves the scene's existing
  sharing topology exactly and never touches the global cache. Two meshes that
  shared before still share; two that didn't, still don't.
- Never mutate a texture from `surfaceMaps()` (`repeat`, `offset`, `colorSpace`) —
  it is shared with every other caller. Pass `mapOpts.repeat` instead.
- Dispose walks: use `disposeMaterialSafely(mat)`. A bare `mat.dispose()` plus a
  loop over map slots will tear shared textures out from under other arenas.
  `isSharedTexture(tex)` / `isSharedMaterial(mat)` are the guards.

---

## 6. Worked example — converting a character's `lamb()`

Before (`wally.js:28`, and eight other files):

```js
function lamb(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts })
}
// ...
const markM = lamb(C.gold); markM.emissive = new THREE.Color(0x333333)
```

After:

```js
import { makeMaterialFactory } from '../render/index.js'
const M = makeMaterialFactory({ scope: 'wally' })   // private cache, per module

function lamb(color, opts = {}) {
  const { surface, ...rest } = opts
  return M.pbr(color, surface || 'default', rest)   // flatShading now OFF
}
// ...
const markM = lamb(C.gold, { surface: 'gold', emissive: 0x333333 })
const hideM = lamb(C.grey, { surface: 'hide' })
const suitM = lamb(C.charcoal, { surface: 'suit' })
const tuskM = lamb(C.ivory, { surface: 'horn' })
```

Why a scoped factory and not bare `pbr()`: WALLY's 40 grey parts collapse to
**one** material (they flash together — correct), and no other fighter or arena
can see it. Call `M.dispose()` from your teardown if you have one.

`dogey.js:9` defines `makeMat(color)` with **no** opts parameter — add one.
`crypto-punkd.js:853`'s `basic()` → `MeshBasicMaterial`; leave unlit ones alone.

**`flatShading` is now off by default.** Faceting comes from bevelled geometry
(contract §0.4). Pass `{ flatShading: true }` only where the parody depends on it.

---

## 7. Perf rules (60 fps @ 1080p on `high` is a hard constraint)

- **≤ ~20 distinct texture kinds in a match scene.** One 512 map set is ~3.6 MB
  of GPU memory; the budget is 80 MB and `textures.js` silently degrades to
  256 px past it. Reuse kinds across props — that is what the shared cache is for.
- `mapOpts.scale` / `repeat` are **free** (same field, one extra upload).
  `mapOpts.seed` is **not** — it regenerates the whole field. Use seeds sparingly.
- `MeshPhysicalMaterial` (sheen / clearcoat) costs real fragment time. `transmission`
  (glass, ice) costs a **whole extra scene render per material** — one or two per
  arena, maximum. `setMaterialQuality({ physical: false, transmission: false })`
  is the `low`/`medium` escape hatch.
- Metals need an environment or they render **black**. `applyEnvironment(scene,
  mood, renderer)` before you upgrade anything metal.
- `hero: true` (1024 px) is for portraits and photo mode only.

---

## 8. Rendering

Every `renderer.render(scene, camera)` call site becomes:

```js
import { renderScene } from '../render/index.js'
renderScene(game, scene, camera, dt)     // routes through game.pipeline if present
```

Safe before the pipeline exists, safe if a post pass fails to compile (it falls
back to a direct render permanently and warns once — `resetRenderFallback()`
after a `setQuality()` rebuild). Accepts a bare `WebGLRenderer` as the first
argument too.

`renderStats()` → `{ textures, materials, environments }` for the perf overlay.
`__selfTest()` runs the whole layer headless in node — no DOM, no GL context.
