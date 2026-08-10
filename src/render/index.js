// ---------------------------------------------------------------------------
// src/render/index.js — the render layer's front door. GRAPHICS_CONTRACT.md §8.
//
// Two jobs:
//
//   1. Barrel. Everything downstream imports from `src/render/index.js` and
//      never from an individual module, so the foundation agents can move code
//      between noise/textures/materials without touching 20 call sites:
//
//        import { pbr, SURFACE, upgradeMaterials, surfaceMaps,
//                 applyEnvironment, makeCinematicRig } from '../render/index.js'
//
//   2. `renderScene(game, scene, camera, dt)` — the single render entry point.
//      Every `renderer.render(scene, camera)` in src/ui/**, src/modes/**,
//      src/combat/MatchScreen.js, src/replay/ReplayUI.js and
//      src/ui/MenuBackdrop.js switches to it. It is deliberately defensive: it
//      is called from screens that exist before Game builds the pipeline, from
//      the capture rig, and from the replay UI, and NONE of those may lose a
//      frame because the post stack is not ready.
//
// NAME COLLISIONS: textures.js and materials.js both export `__selfTest`. They
// are re-exported here as `__texturesSelfTest` / `__materialsSelfTest`, and the
// local `__selfTest()` below runs both.
// ---------------------------------------------------------------------------

export * from './noise.js'
export * from './textures.js'
export * from './materials.js'
export * from './env.js'
export * from './lighting.js'
export * from './Pipeline.js'

export { __selfTest as __texturesSelfTest } from './textures.js'
export { __selfTest as __materialsSelfTest } from './materials.js'
export { default as Pipeline } from './Pipeline.js'

import { __selfTest as texturesSelfTest } from './textures.js'
import { __selfTest as materialsSelfTest } from './materials.js'
import { textureCacheStats } from './textures.js'
import { materialCacheStats } from './materials.js'
import { environmentCacheStats } from './env.js'

// ---------------------------------------------------------------------------
// renderScene
// ---------------------------------------------------------------------------

let _pipelineFailed = false
let _warnedNoRenderer = false

/**
 * renderScene(game, scene, camera, dt = 1/60) -> boolean
 *
 * Routes through `game.pipeline` when there is one, falls back to a plain
 * `renderer.render(scene, camera)` when there is not. Returns true if anything
 * was actually drawn.
 *
 * `game` may be:
 *   - a Game instance          (uses game.pipeline, else game.renderer)
 *   - a THREE.WebGLRenderer    (the 5 legacy call sites can pass the renderer
 *                               they already hold and still get the pipeline
 *                               once Game wires one onto it)
 *   - null/undefined           (returns false, draws nothing, warns once)
 *
 * If the pipeline throws — a pass that failed to compile, a disposed target
 * mid-resize — we fall back to a direct render permanently for the rest of the
 * session and warn once. A broken bloom pass must never be a black screen.
 */
export function renderScene(game, scene, camera, dt = 1 / 60) {
  if (!scene || !camera) return false

  const isRenderer = !!(game && game.isWebGLRenderer)
  const pipeline = isRenderer
    ? (game.__wcsPipeline || null)
    : (game && (game.pipeline || game.renderPipeline)) || null
  const renderer = isRenderer
    ? game
    : (game && game.renderer) || (pipeline && pipeline.renderer) || null

  if (!_pipelineFailed && pipeline && pipeline.enabled !== false && typeof pipeline.render === 'function') {
    try {
      pipeline.render(scene, camera, dt)
      return true
    } catch (err) {
      _pipelineFailed = true
      console.warn('[render] pipeline.render() failed — falling back to direct render for this session', err)
    }
  }

  if (renderer && typeof renderer.render === 'function') {
    renderer.render(scene, camera)
    return true
  }

  if (!_warnedNoRenderer) {
    _warnedNoRenderer = true
    console.warn('[render] renderScene() called with no renderer and no pipeline — nothing drawn')
  }
  return false
}

/**
 * Clears the "pipeline is broken" latch. The integrator calls this after
 * `setQuality()` rebuilds the pass stack, so a tier change gets a fresh chance.
 */
export function resetRenderFallback() {
  _pipelineFailed = false
  return true
}

/** True once renderScene has permanently fallen back to direct rendering. */
export function renderFallbackActive() { return _pipelineFailed }

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * renderStats() -> { textures, materials, environments }
 * Everything the perf overlay and the definition-of-done checks need, in one
 * call. Cheap — no GPU queries, just cache bookkeeping.
 */
export function renderStats() {
  return {
    textures: textureCacheStats(),
    materials: materialCacheStats(),
    environments: environmentCacheStats(),
  }
}

/**
 * __selfTest() — runs the textures and materials self-tests together.
 * Node-runnable, no DOM, no renderer:
 *   node -e "import('./src/render/index.js').then(m => console.log(m.__selfTest()))"
 */
export function __selfTest(opts = {}) {
  const textures = texturesSelfTest({ ...opts, quiet: true })
  const materials = materialsSelfTest({ ...opts, quiet: true })
  const out = {
    ok: !!(textures.ok !== false && materials.ok !== false),
    textures,
    materials,
  }
  if (opts.quiet === false) console.log(out)
  return out
}

// ---------------------------------------------------------------------------
// geometry.js — the procedural geometry toolkit (GRAPHICS_CONTRACT §0.4).
// Appended by the geometry agent; nothing above this line was touched.
//
//   import { roundedBox, capsule, superellipsoid, loft, splineTube, plate,
//            taperedBox, mergeParts, assemble } from '../render/index.js'
//
// 49 exports, no name collisions with noise/textures/materials/env/lighting/
// Pipeline except `__selfTest`, which the local declaration above already
// shadows — geometry's is re-exported below as `__geometrySelfTest`, matching
// the `__texturesSelfTest` / `__materialsSelfTest` convention.
// ---------------------------------------------------------------------------

export * from './geometry.js'
export { __selfTest as __geometrySelfTest } from './geometry.js'

// ---------------------------------------------------------------------------
// geometry.js §13 — THE ADOPTION API (round 2 P0).
//
// Round 1 shipped the toolkit and nobody imported it, so §0.4 sat at 0 %. The
// exports below exist so that adopting it is a sed and a one-liner, not a
// rewrite. They are already covered by the `export *` above; they are listed
// again explicitly because this is the list every arena and fighter agent
// needs, and a barrel you cannot grep is a barrel nobody uses.
//
//   // 1. the sed — `new THREE.XGeometry(` -> `new GEO.XGeometry(`
//   import { GEO } from '../render/index.js'
//   new GEO.BoxGeometry(1.2, 0.8, 0.6)     // chamfered, 108 tris, 6 mat groups
//   new GEO.PlaneGeometry(4, 4)            // passthrough — the sed is safe
//
//   // 2. or retrofit a whole subtree you already built
//   import { bevelize, dedupeGeometry, mergeStatic, adoptionReport } from '../render/index.js'
//   bevelize(this.group)          // raw Box/Cylinder/Sphere/Cone -> bevelled
//   dedupeGeometry(this.group)    // identical buffers -> one
//   mergeStatic(this.dressing)    // { before: 180, after: 6 } draw calls
//
// `setGeometryQuality('low'|'medium'|'high')` retunes both paths for the tier.
// ---------------------------------------------------------------------------

export {
  GEO, BoxGeometry, RoundedBoxGeometry, SphereGeometry, CylinderGeometry,
  ConeGeometry, CapsuleGeometry,
  bevelize, bevelizeMesh, upgradeGeometry, dedupeGeometry, mergeStatic,
  adoptionReport, isRawGeometry, autoRadius,
  setGeometryQuality, geometryQuality,
} from './geometry.js'

// ---------------------------------------------------------------------------
// geometry.js §16 — AUTO-MERGE, the draw-call half of the round-3 P0.
//
// Both automatic paths install themselves when this barrel is first imported,
// so nothing below needs calling to get the win. They are listed because a
// perf overlay wants the counters and an arena agent who finds a prop frozen
// wants the escape hatch:
//
//   markDynamic(this.geyser)        // never absorb this prop (or its subtree)
//   autoMergeStats()                // { buckets, absorbed, callsSaved, reverts }
//   revertAutoMerge(scene)          // undo everything and stop
//   globalThis.WCS_AUTOMERGE = false  |  ?merge=0  |  uninstallAutoMerge()
//
// MEASURED (node, `__autoMergeBaseline()`, real arena modules, 'high'), all
// ten arenas, adoption and draw calls in the SAME run and no edit to any arena:
//
//   arena                        §0.4 adoption   visible draw calls
//   bull-market-colosseum         0% ->  99.1%    300 -> 171   (-129)
//   calm-before-liquidation       0% -> 100.0%    283 -> 141   (-142)
//   frozen-token-lab              0% ->  97.4%    259 -> 164   (-95)
//   institutional-capital-tower   0% -> 100.0%    585 -> 368   (-217)
//   liquidity-swamp               0% -> 100.0%    334 -> 174   (-160)
//   lost-block-museum             0% -> 100.0%    334 -> 186   (-148)
//   meme-market                   0% ->  99.4%    372 -> 286   (-86)
//   mountain-node-village         0% ->  99.0%    381 -> 188   (-193)
//   permanent-reserve-core        0% ->  97.7%    273 -> 174   (-99)
//   settlement-express            0% -> 100.0%    325 -> 136   (-189)
//
// All ten fighters reach 100 % on the same sweep. The residue on the four
// arenas below 100 % is open-ended cylinders (curved wall shells), which have
// no rim to fillet and are deliberately exempt.
//
// Worst single frame during the whole conversion: 3.1-3.7 ms (budgeted).
// Steady state afterwards: 0.21 ms per render on a 409-mesh scene, including
// three's own updateMatrixWorld.
// ---------------------------------------------------------------------------

export {
  autoMergeTick, autoMergeStats, installAutoMerge, uninstallAutoMerge,
  revertAutoMerge, markDynamic, isDynamic,
  autoBevelScene, installAutoBevel, uninstallAutoBevel, autoBevelStats, adopt,
  sole, footOutline,
} from './geometry.js'

export { __adoptionBaseline, __autoMergeBaseline } from './geometry.js'
