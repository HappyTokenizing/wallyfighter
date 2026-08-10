// ---------------------------------------------------------------------------
// src/render/textures.js — procedural PBR map generation + global cache.
//
// GRAPHICS_CONTRACT.md §3. This is the file that decides whether the game reads
// as 2002 or as 2026: a MeshStandardMaterial with no maps is still a flat blob,
// just a more expensive one.
//
// THE THREE-BAND RULE
// -------------------
// Every surface kind here is built from three frequency bands, because a single
// octave of noise reads as plastic wrap no matter how it is tuned:
//
//   band 1 — FORM      large-scale value/patina/dirt/drape. What you see at 3 m.
//   band 2 — DETAIL    planks, weave, clumps, pores, scales, panel lines. At 1 m.
//   band 3 — MICRO     grain, fibre, speckle, pits. At 30 cm and in the specular.
//
// ...plus a FOURTH, SHARED band that every kind gets for free: a single
// high-frequency detail field, generated once at 256 px, tiled 1:1 and blended
// into every normal map by partial derivatives at derivation time. See
// `microGrads` / `MICRO_AMP`. It is what makes a frame read as "rendered"
// rather than "modelled" at close range, it costs two array reads per texel,
// and it is the only place a single-normal-slot material model can accept a
// detail normal at all. Per-kind `micro` scales it; `micro: 0` opts out (the
// mirror kinds — a chrome ball with crawling micro-relief is brushed nickel).
//
// DIRECTIONAL SURFACES get two more things. `nrmAniso: [gx, gy]` weights the
// two Sobel axes apart so the specular lobe smears along the grain — faked GGX
// anisotropy that works on a plain MeshStandardMaterial (fur, horn). `aniso:
// [strength, rotation]` is the real thing, surfaced on the map set as
// `.anisotropy` for materials.js to hand to MeshPhysicalMaterial; it costs no
// memory and is ignored harmlessly until that wiring lands.
//
// PIPELINE PER KIND
// -----------------
// 1. A Float32 HEIGHT field (h, [0,1]) and an INDEPENDENT roughness mask (m,
//    [0,1]) and an albedo modulation field (a, rgb) are filled by the kind's
//    build().
// 2. normal  <- Sobel over h, wrapped (tileable), tangent-space +Y = +v.
// 3. rough   <- h *and* m. Roughness that is just the height map is the single
//    most common giveaway of procedural material work: real surfaces have
//    wetness/wear/dirt that does not correlate with relief. That is what m is.
// 4. AO      <- multi-tap horizon sweep over h at half resolution.
// 5. albedo  <- the kind's own hue/value variation, never a flat fill.
//
// ALBEDO IS A MODULATION MAP, NOT AN ABSOLUTE COLOUR
// --------------------------------------------------
// materials.js does `pbr(color, preset)` — the colour comes from the caller and
// the map multiplies it. So every `map` here is authored around a mean of ~0.85
// with hue and value variation on top. If these were absolute colours every
// arena palette in the game would be overwritten the moment a preset was
// applied. Kinds whose identity IS the pattern (screen-crt, circuit, denim)
// push much harder, and that is deliberate.
//
// EVERY KIND NEEDS A SPECULAR EVENT
// ---------------------------------
// Three bands of relief are necessary and not sufficient. A surface also has to
// have somewhere on it that is measurably GLOSSIER than the rest, or the GGX
// lobe is the same width over the whole object and the light has nothing to
// catch. `mapResponse().lobe` measures exactly that: peak specular density at
// the map's 5th-percentile roughness, normalised so r = 0.25 scores 1.0. Under
// ~0.03 there is no highlight anywhere, only a wash.
//
// The round-7 pass authored one into every character surface, because the whole
// cast was sitting at 0.01-0.07 — fur read as felt, skin as vinyl, cloth as
// printed canvas, and WALLY's hide could not describe the dome of his own
// skull. The physical hook per kind is named in its comment (a guard hair's
// keratin crown, sebum on skin, a ply crown on a face thread, an elephant's rub
// polish, an abraded wale, a burnished pebble). The pattern is always the same:
// gate the gloss on a NARROW high-percentile mask (a `smoothstep` over the top
// ~10% of an existing band, not a linear term), so the highlight is a small
// travelling event rather than a satin sheet over the whole surface.
//
// `rough.base` is NOT the knob for this — materials.js sizes its roughness
// multiplier off it (see kindRoughness) and moving it silently re-renders every
// preset that consumes the kind. The knobs are the mask formula, `maskWeight`,
// `spread` and `min`.
//
// WHAT A MAP SET COSTS  (round 9 — read the PER-MAP RESOLUTION block below)
// -------------------------------------------------------------------------
// A 512 field ships THREE textures, not four:
//
//   normalMap     512  RGBA8   1.333 MiB   full resolution, always
//   map           256  RGBA8   0.333 MiB   half — it is a modulation map
//   roughnessMap  256  RG8     0.167 MiB   G = roughness, R = AO
//   aoMap         ==== the same object ====
//
// 1.833 MiB, down from 3.417. `wear` and `tint` siblings share the normalMap
// outright, so the second dressing of a kind costs 0.5 MiB, not 1.833.
//
// ROUND 11 takes one more halving on the kinds that measurably cannot show it
// (`albStep` / `rghStep`, see the sheet above the KIND table). On those the
// secondary maps drop to 128 and the set is 1.542 MiB — `default`, the kind
// 1455 materials land on, is one of them. And read the SESSION_SCENES block:
// the number that governs a resident cap is not the session total, it is the
// PEAK SINGLE SCENE, which nothing measured until this round.
//
// SHARING AND DISPOSAL
// --------------------
// Everything is cached and SHARED. Two fighters asking for `fur-short` get the
// same GPU texture object, and `set.aoMap === set.roughnessMap` by design —
// any dispose walk that iterates map slots must tolerate seeing one texture
// twice (they are all tagged `__shared` and skipped anyway). That collides head-on with the blanket dispose walks
// in MatchScreen/Fighter/ArenaBase, so every texture we hand out is tagged
// `userData.__shared = true` and `texture.name` is its cache key — dispose paths
// must skip those. Never mutate a returned texture (`repeat`, `offset`,
// `colorSpace`): pass `opts.repeat` instead, it is part of the cache key.
//
// NO DOM REQUIRED
// ---------------
// surfaceMaps() is built entirely from typed arrays + DataTexture, so it runs in
// node harnesses with no canvas at all (see __selfTest at the bottom). Only the
// ctx2d entry points — procTexture/decalTexture — need a canvas, and they return
// null (warning once) rather than throwing when there is none.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import {
  hash2, makeValueNoise2D, makePerlin2D, makeSimplex2D,
  fbm2D, ridged2D, makeWorley2D, domainWarp2D,
} from './noise.js'

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// Contract §3: default 512, 256 on low, 1024 for hero surfaces only.
let DEFAULT_SIZE = 512
let DEFAULT_ANISO = 8

// RESIDENT texture ceiling on `high`, counted as uploaded GPU bytes including
// the 1.333x mip tail. HARD, not soft: past it the LRU disposes the coldest
// surfaces (see the residency block) instead of degrading new ones.
//
// WHY 96 AND NOT 80. 80 was never sized against this content — it predates the
// arena set and the self-test that "confirmed" it swept each kind ONCE. Replaying
// every real call site (SESSION_DEMAND), the six-arena / four-fighter working set
// is 84.2 MB after the round-10 scale-ladder collapse and 140.2 MB before it, and
// the worst SINGLE scene (calm-before-liquidation + two fighters) is 75.3 MB. A
// budget under the worst single scene is not a budget, it is a guarantee of
// thrash: the LRU would evict surfaces the current frame is still drawing and
// re-upload them next frame, forever. 96 MB clears the worst scene by 1.28x and
// the whole-session set by 1.14x.
//
// AND WHAT 96 MB ACTUALLY COSTS. It is the whole procedural texture set for the
// game — every arena and every fighter — and it is capped, so it does not grow
// with session length. On the 2 GB card that is this build's floor that is 4.7%
// of VRAM; on an 8 GB card, 1.2%. For scale, the game's own 1920x1080 HDR render
// targets (colour + depth + the bloom chain) run ~50 MB on their own, and the
// triangle/draw-call budget (defect 7, 623k-912k against a 250k cap) is a far
// larger claim on the same GPU than any of this. Raising the number was the LAST
// thing done here, after a measured 40% cut, not instead of it.
//
// ROUND 11 — THIS NUMBER IS NOW A FLOOR, NOT A WISH, AND HERE IS WHY.
//
// GameConfig's `high` tier calls setTextureQuality({ textureSize: 512,
// textureBudgetMB: 80 }), so in the shipped build the 96 above was overwritten
// by 80 before the first arena — which is exactly the `budgetMB: 80` the live
// textureCacheStats() reported. And 80 is below the PER-SCENE working set:
// measured per arena (see SESSION_SCENES / workingSets) one scene is 73-91 MB,
// so an 80 MB resident cap forces the LRU to evict textures the current scene
// is still drawing.
//
// AND THAT SAVES NO VRAM AT ALL. three r166 re-uploads a disposed texture from
// `texture.image.data` the next time it is drawn, so evicting a surface the
// frame still needs frees it for less than a frame and then pays for it again.
// Peak VRAM is the working set either way; the only thing a cap below the
// working set buys is permanent upload churn that nothing in the stats reports.
// So the module now refuses a cap below the working set (see effectiveBudget)
// and says so once, loudly, with both numbers.
//
// `BUDGET_BYTES` is what the integrator ASKED for. `effectiveBudget()` is what
// is enforced. `high` is the only shipped tier the floor moves: low (256 px,
// 24 MB) and medium (256 px, 48 MB) both sit above their own 512->256 scaled
// floor, and ultra already asks for 128.
let BUDGET_BYTES = 96 * 1024 * 1024

// Headroom over the peak working set. 1.10 is one middling surface set: enough
// that arriving at a new scene evicts the PREVIOUS scene's cold surfaces rather
// than the ones being drawn, and not so much that the cap stops being a cap.
const BUDGET_HEADROOM = 1.10

let _budgetFloorWarned = false
let _budgetCache = { req: -1, size: -1, eff: 0, floor: 0 }

/**
 * The resident cap actually enforced: the integrator's number, or the peak
 * per-scene working set plus headroom, whichever is larger. Memoised on
 * (requested budget, field size) — both change at most once per quality change.
 */
let _budgetResolving = false
function effectiveBudget() {
  if (_budgetCache.req === BUDGET_BYTES && _budgetCache.size === DEFAULT_SIZE) return _budgetCache.eff
  // RE-ENTRANCY. The floor is computed with projectSession(), which reports
  // `budgetMB` and therefore calls back in here. Without this guard the first
  // call recurses until the stack dies. While resolving, the requested number is
  // the honest answer — the projections that run inside the floor computation
  // are about BYTES, not about whether they fit.
  if (_budgetResolving) return BUDGET_BYTES
  _budgetResolving = true
  let floor = 0
  // peakWorkingSetBytes walks SESSION_SCENES analytically; if that table is ever
  // emptied or throws, fall back to the integrator's number rather than guess.
  // Rounded UP to a whole MiB so the reported number is readable and stable.
  try { floor = Math.ceil(peakWorkingSetBytes(DEFAULT_SIZE) * BUDGET_HEADROOM / 1048576) * 1048576 } catch (e) { floor = 0 }
  _budgetResolving = false
  const eff = floor > BUDGET_BYTES ? floor : BUDGET_BYTES
  _budgetCache = { req: BUDGET_BYTES, size: DEFAULT_SIZE, eff, floor }
  if (eff > BUDGET_BYTES && !_budgetFloorWarned) {
    _budgetFloorWarned = true
    console.info(`[textures] resident cap raised ${(BUDGET_BYTES / 1048576).toFixed(0)} -> ` +
      `${(eff / 1048576).toFixed(0)} MB: the peak single-scene working set at ${DEFAULT_SIZE}px is ` +
      `${(floor / BUDGET_HEADROOM / 1048576).toFixed(1)} MB, and a cap below it evicts surfaces the ` +
      'current frame still draws (three re-uploads them, so it frees no VRAM and only costs uploads). ' +
      'See textureCacheStats().budgetRequestedMB / .budgetFloorMB and workingSets().')
  }
  return eff
}

// ---------------------------------------------------------------------------
// PER-MAP RESOLUTION + CHANNEL PACKING  (round-9 defect 8)
//
// THE MEASUREMENT THAT FORCED THIS. A live five-arena session reported 585
// textures / 134.59 MB against the 80 MB budget, with the engine printing
// "texture budget 80 MB exceeded — new surfaces degrade to 256px" after the
// THIRD arena. That is the worst failure mode available: invisible, progressive
// and order-dependent, so the arena you happen to load last renders at half the
// resolution of the one you loaded first, for reasons no pixel critic could ever
// diagnose. The self-test never predicted it because it swept 43 kinds ONCE
// (81.63 MB) while a real session builds 102 FIELDS — 2.4 opts-variants per
// kind — off the same table.
//
// Three things were being paid for and not used:
//
//  1. FOUR MAPS AT ONE RESOLUTION. A 512 field shipped 3.417 MiB: albedo 1.333,
//     normal 1.333, roughness 0.667, AO 0.083. Only the NORMAL needs 512 — it
//     is the only map whose high-frequency content the eye resolves directly
//     (it steers the specular lobe per texel). Albedo here is a MODULATION map
//     authored around a mean of 0.85 (see the header) and roughness is a broad
//     perceptual property gated on smoothstep masks many texels wide. Both go
//     to size/2 with no visible change. Kinds whose IDENTITY is the albedo
//     pattern (scanlines, circuit traces, a pixel grid, denim twill) declare
//     `albRes: 1` and keep full resolution.
//
//  2. THE ROUGHNESS MAP'S RED CHANNEL WAS A LITERAL DUPLICATE OF ITS GREEN.
//     RG8 exists because three reads roughness from `.g` and a RedFormat
//     texture samples as (r,0,0,1) — see roughnessBytes. R was filled with the
//     same byte "so the map is also usable in any slot that reads .r". three
//     reads AO from exactly that slot. So AO now LIVES in R: one RG8 texture is
//     both `roughnessMap` and `aoMap`, the separate R8 AO texture is gone, and
//     `Texture.channel` defaults to 0 in r166 (verified in the bundle:
//     `aoMapUv: getChannel(material.aoMap.channel)`), so both slots read `uv`
//     and one shared object cannot disagree with itself about UV sets.
//
//  3. NEAR-DUPLICATE FIELDS. `scale` and `wear` went into the field key raw, and
//     the tree asks for 66 distinct scales and 32 distinct wears — scale 1.5 and
//     scale 1.6 are two 3.4 MiB fields for a 6% difference in feature size that
//     nobody has ever seen. Both are now quantised (see fieldKey).
//
// Net at 512: 3.417 MiB -> 1.833 MiB per field, a 46% cut, before the field-key
// collapse. Nothing about the generated CONTENT changes: every derivation still
// runs at full resolution over the full field (so roughness mean normalisation
// and the AO horizon sweep are bit-identical), and only the final byte array is
// box-filtered down on the way to the GPU.
// ---------------------------------------------------------------------------

// Albedo / roughness+AO resolution as a fraction of the field size. Exposed on
// setTextureQuality so a low tier can push them further without touching the
// normal map, which is the one that must not move.
let ALB_RES = 0.5
let RGH_RES = 0.5
const MIN_MAP_PX = 64

// Per-map pixel sizes for a field of `size`. `def` may pin either back to 1.
//
// `nearest: true` pins the albedo automatically. A kind that asked for
// NearestFilter is telling you its pattern has HARD cell edges (pixel-grid is a
// 24x24 voxel lattice); box-filtering that to half size softens the edges and
// then nearest MAGNIFICATION snaps them back to a staircase in the wrong place,
// which is worse than either. The three other albedo-identity kinds
// (screen-crt scanlines, circuit traces, neon strips) declare `albRes: 1`
// on the kind itself.
//
// ROUND 11 — `albStep` / `rghStep`, THE MEASURED HALF-STEP.
//
// Round 10 tried ALB_RES/RGH_RES 0.5 -> 0.25 GLOBALLY and correctly rejected it:
// metal-brushed's paintRatio collapses 3.27 -> 0.48, wood-rough 2.73 -> 0.59,
// suit-wool's roughness spread loses 45%. But that verdict is per-kind, and it
// was applied to the whole table. Re-run as a per-kind A/B (see the ROUND-11
// block above the KIND table for the full sheet) nine kinds lose nothing
// measurable, because their albedo simply has no content above the quarter-res
// Nyquist — `default` retains 93% of its albedo spread and 83% of its paintRatio
// (1.79 -> 1.48, still far above the 1.2 "these edges are relief" threshold),
// marble 96%/1.65, concrete 94%/2.26, the three furs 93-97%/1.33.
//
// `albStep`/`rghStep` is an EXTRA factor on top of the global fraction rather
// than a pinned absolute (which is what `albRes`/`rghRes` are), so a low-VRAM
// tier that sets ALB_RES 0.25 still pushes these kinds one step further, and the
// A/B knob (setTextureQuality({ albRes: 1 })) still restores everything.
// A/B switch for the half-step, the same way `scaleLadder` is the A/B switch for
// the octave ladder: setTextureQuality({ kindSteps: false }) restores round 10.
let KIND_STEPS = true

function mapSizes(def, size, squeeze = 1) {
  const aStep = (KIND_STEPS && def && def.albStep) || 1
  const rStep = (KIND_STEPS && def && def.rghStep) || 1
  const aR = (def && def.albRes !== undefined ? def.albRes
    : (def && def.nearest) ? 1 : ALB_RES * aStep) * squeeze
  const rR = (def && def.rghRes !== undefined ? def.rghRes : RGH_RES * rStep) * squeeze
  const step = (frac) => {
    if (!(frac > 0) || frac >= 1) return size
    return Math.max(MIN_MAP_PX, 1 << Math.round(Math.log2(size * frac)))
  }
  return { albSize: step(aR), rghSize: step(rR) }
}

// Box-downsample an interleaved byte array by an integer factor. Exact 2x2 (or
// 4x4) mean, so the downsampled map keeps the source map's mean — which matters
// for roughness, where materials.js divides by the declared mean (kindRoughness)
// and a drifted map silently re-renders every preset that uses the kind.
// `only` restricts the write to a single interleaved channel — used to fill the
// roughness byte of the shared RG map without disturbing the AO byte beside it.
function boxDown(src, srcSize, dst, dstSize, ch, only) {
  const k0 = only === undefined ? 0 : only
  const k1 = only === undefined ? ch : only + 1
  if (srcSize === dstSize) {
    if (only === undefined) { dst.set(src); return dst }
    for (let i = only; i < dst.length; i += ch) dst[i] = src[i]
    return dst
  }
  const f = srcSize / dstSize
  const inv = 1 / (f * f)
  for (let y = 0; y < dstSize; y++) {
    const sy0 = y * f
    for (let x = 0; x < dstSize; x++) {
      const sx0 = x * f
      const o = (y * dstSize + x) * ch
      for (let k = k0; k < k1; k++) {
        let s = 0
        for (let j = 0; j < f; j++) {
          const row = (sy0 + j) * srcSize
          for (let i = 0; i < f; i++) s += src[(row + sx0 + i) * ch + k]
        }
        dst[o + k] = Math.round(s * inv)
      }
    }
  }
  return dst
}

// Single-channel R8 source -> the R byte of an interleaved RG8 destination.
// Only used for the AO byte, and only when the AO field and the roughness map
// disagree about resolution (a kind that pinned `rghRes: 1`, or a 64px floor).
function upscale1Into(dstRG, dstSize, src, srcSize) {
  const s = srcSize / dstSize
  for (let y = 0; y < dstSize; y++) {
    const sy = (y + 0.5) * s - 0.5
    const fy = sy - Math.floor(sy)
    const y0 = ((Math.floor(sy) % srcSize) + srcSize) % srcSize
    const y1 = (y0 + 1) % srcSize
    const r0 = y0 * srcSize, r1 = y1 * srcSize
    for (let x = 0; x < dstSize; x++) {
      const sx = (x + 0.5) * s - 0.5
      const fx = sx - Math.floor(sx)
      const x0 = ((Math.floor(sx) % srcSize) + srcSize) % srcSize
      const x1 = (x0 + 1) % srcSize
      const a = src[r0 + x0] + (src[r0 + x1] - src[r0 + x0]) * fx
      const b = src[r1 + x0] + (src[r1 + x1] - src[r1 + x0]) * fx
      dstRG[(y * dstSize + x) * 2] = a + (b - a) * fy + 0.5
    }
  }
}

function boxDown1Into(dstRG, dstSize, src, srcSize) {
  const f = srcSize / dstSize
  const inv = 1 / (f * f)
  for (let y = 0; y < dstSize; y++) {
    const sy0 = y * f
    for (let x = 0; x < dstSize; x++) {
      const sx0 = x * f
      let s = 0
      for (let j = 0; j < f; j++) {
        const row = (sy0 + j) * srcSize
        for (let i = 0; i < f; i++) s += src[row + sx0 + i]
      }
      dstRG[(y * dstSize + x) * 2] = Math.round(s * inv)
    }
  }
}

// Integrator hook (GameConfig quality tiers). Not in the contract; documented in
// the report. Changing size/aniso does NOT invalidate live textures — it only
// affects subsequent generations, so call it before a scene builds.
export function setTextureQuality(q = {}) {
  if (Number.isFinite(q.size)) DEFAULT_SIZE = clampSize(q.size)
  if (Number.isFinite(q.anisotropy)) DEFAULT_ANISO = Math.max(1, Math.min(16, q.anisotropy | 0))
  if (Number.isFinite(q.budgetMB)) BUDGET_BYTES = Math.max(8, q.budgetMB) * 1024 * 1024
  // Secondary-map resolution, as a fraction of the field size. `1` restores the
  // pre-round-9 behaviour (every map at full size); `0.25` is the knob a genuine
  // low-VRAM tier should reach for BEFORE dropping the normal map, because the
  // normal is the only map whose resolution the eye reads directly.
  if (Number.isFinite(q.albRes)) ALB_RES = Math.max(0.125, Math.min(1, q.albRes))
  if (Number.isFinite(q.rghRes)) RGH_RES = Math.max(0.125, Math.min(1, q.rghRes))
  // Steps per octave on the field's `scale` ladder (round 10). `6` restores the
  // pre-round-10 behaviour — one field per 12% of scale, no repeat compensation
  // benefit — and is the A/B switch for judging the ladder. Lower = fewer, larger
  // fields and more repeat compensation.
  if (Number.isFinite(q.scaleLadder)) SCALE_LADDER_COARSE = Math.max(0.25, Math.min(12, q.scaleLadder))
  // `async: false` restores the old blocking behaviour (headless harnesses,
  // photo mode, anything that reads texels back immediately).
  if (q.async !== undefined) ASYNC = !!q.async
  // `kindSteps: false` restores round-10 behaviour (no per-kind albStep/rghStep).
  if (q.kindSteps !== undefined) KIND_STEPS = !!q.kindSteps
  // `albStep`/`rghStep` (the per-kind half-step) and the scale ladder both feed
  // the projection the budget floor is computed from, so any of these changing
  // invalidates the memo.
  _budgetCache = { req: -1, size: -1, eff: 0, floor: 0 }
  _peakBySize.clear()
  return {
    size: DEFAULT_SIZE, anisotropy: DEFAULT_ANISO,
    // What is ENFORCED. `budgetRequestedMB` is what you passed; they differ only
    // when the request was below the peak working set — see effectiveBudget.
    budgetMB: effectiveBudget() / 1048576,
    budgetRequestedMB: BUDGET_BYTES / 1048576,
    async: ASYNC,
    albRes: ALB_RES, rghRes: RGH_RES, scaleLadder: SCALE_LADDER_COARSE,
    kindSteps: KIND_STEPS,
  }
}

function clampSize(n) {
  const v = Math.max(64, Math.min(1024, Math.round(n)))
  // Snap to a power of two — mip chains and RepeatWrapping both want it.
  return 1 << Math.round(Math.log2(v))
}

// ---------------------------------------------------------------------------
// Small math
// ---------------------------------------------------------------------------

// NaN-safe on purpose. A plain `v < 0 ? 0 : v > 1 ? 1 : v` passes NaN straight
// through, and because these fields are reduced (means, Sobel neighbourhoods,
// AO horizon sweeps) a single poisoned texel propagates across a whole map.
// Anything non-finite lands on 0.5 — neutral, and visibly nothing.
function clamp01(v) { return v > 0 ? (v > 1 ? 1 : v) : (v === v ? 0 : 0.5) }
function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
function mix(a, b, t) { return a + (b - a) * t }
function frac(x) { return x - Math.floor(x) }

// ---------------------------------------------------------------------------
// Canvas acquisition (ctx2d paths only)
// ---------------------------------------------------------------------------

let _canvasWarned = false

function makeCanvas(w, h) {
  // OffscreenCanvas first: no layout, no document, works in workers. Some
  // implementations ship OffscreenCanvas without a 2d context (old WebViews),
  // hence the getContext probe rather than a bare feature test.
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h)
      if (c.getContext('2d')) return c
    } catch (e) { /* fall through to DOM */ }
  }
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    return c
  }
  if (!_canvasWarned) {
    _canvasWarned = true
    console.warn('[textures] no canvas available — ctx2d textures disabled (surfaceMaps still works)')
  }
  return null
}

export function hasCanvas() {
  return (typeof OffscreenCanvas !== 'undefined') ||
    (typeof document !== 'undefined' && !!document.createElement)
}

// ---------------------------------------------------------------------------
// Cache
//
// Two levels on purpose:
//   _fieldCache — the expensive part (the noise fields + derived byte arrays),
//                 keyed by kind/size/seed/scale/wear/tint.
//   _texCache   — THREE.Texture objects, keyed by field key + repeat + aniso.
// Asking for the same fur at a different `repeat` therefore costs one upload,
// not a full regeneration.
// ---------------------------------------------------------------------------

const _fieldCache = new Map()
const _texCache = new Map()
const _surfCache = new Map()
let _gpuBytes = 0
// High-water mark and degrade bookkeeping. The old code warned ONCE, ever, into
// the console and kept no record — so a session that quietly halved every
// surface after the third arena looked identical to a healthy one from
// textureCacheStats(). `peakBytes` survives disposeTextureCache() on purpose:
// it is the number that answers "did this session ever go over".
let _peakBytes = 0
let _degradedCount = 0

// ---------------------------------------------------------------------------
// GPU RESIDENCY, LRU  (round 10)
//
// Nothing in the tree has ever called disposeTextureCache() — grep it: the only
// mentions outside this file are two comments. So the cache is append-only for
// the life of the tab, every arena you visit stays uploaded forever, and the
// budget was enforced by permanently HALVING the resolution of everything
// generated after the ceiling. That is the wrong currency. Pressure should cost
// a re-upload, not a permanent loss of texels.
//
// `_gpuBytes` is now RESIDENT bytes and is hard-capped: when a new field would
// push it over, the least-recently-REQUESTED base textures are disposed until it
// fits. `_liveBytes` is everything the cache holds whether resident or not, and
// it is what the (now last-resort) degrade stages watch.
//
// WHY DISPOSING A TEXTURE THAT MIGHT STILL BE IN USE IS SAFE HERE. three r166
// deallocates on the 'dispose' event and removes the texture's WebGLProperties
// entry; the next setTexture2D() therefore sees `__version === undefined`,
// falls into uploadTexture() and re-uploads from `texture.image.data`. That
// data is a Uint8Array owned by `_fieldCache` and is not freed here, so the
// round trip is lossless — it costs one upload, not a black surface. This is
// also why eviction buys real VRAM without costing any JS heap: the CPU-side
// arrays were always resident anyway.
//
// AND WHAT IT MEANS FOR THE NUMBER. Because three re-uploads silently, evicting
// a texture that is STILL BEING RENDERED frees nothing for longer than a frame,
// and this module never learns about it. So `mb` is honestly "bytes we last
// handed out and have not disposed" — a lower bound on VRAM if old materials are
// still on screen, and exact once they are not. `cachedMB` is reported beside it
// as the upper bound. Do not read one without the other.
//
// A repeat clone shares its base's `source`, and three only deletes the GL
// texture when the last user of that source disposes (usedTimes hits 0), so a
// base is always evicted together with its clones.
//
// Residency metadata lives in a WeakMap and NOT on `texture.userData`, because
// `Texture.copy()` (which `clone()` calls, and repeatVariant calls clone) deep
// copies userData through JSON.stringify — a base holding a reference to its
// clones there is a circular structure and throws on the first repeat variant.
let _liveBytes = 0
let _lruClock = 0
let _evictions = 0
let _evictedBytes = 0
/** texture -> { bytes, resident, touch, clones, base } */
const _res = new WeakMap()

function texBytes(tex) {
  const img = tex.image
  if (!img || !img.width) return 0
  const bpp = tex.format === THREE.RedFormat ? 1 : tex.format === THREE.RGFormat ? 2 : 4
  const base = img.width * img.height * bpp
  return Math.round(tex.generateMipmaps ? base * 4 / 3 : base)
}

function trackTexture(key, tex) {
  tex.name = key
  tex.userData.__shared = true   // HAZARD 1: dispose walks must skip these
  const bytes = texBytes(tex)
  _res.set(tex, { bytes, resident: true, touch: ++_lruClock, clones: null, base: null })
  _texCache.set(key, tex)
  _gpuBytes += bytes
  _liveBytes += bytes
  if (_gpuBytes > _peakBytes) _peakBytes = _gpuBytes
  return tex
}

/** Mark a cached texture as wanted again; re-admit it if it was evicted. */
function touchTexture(tex) {
  if (!tex) return tex
  const own = _res.get(tex)
  const base = (own && own.base) || tex
  const r = _res.get(base)
  if (!r) return tex
  r.touch = ++_lruClock
  if (r.resident === false) {
    r.resident = true
    _gpuBytes += r.bytes
    // Force the upload rather than trusting three to notice: after dispose()
    // the per-texture properties were removed, but a clone that was never
    // rendered may still carry a current __version.
    base.needsUpdate = true
    if (r.clones) for (const c of r.clones) c.needsUpdate = true
    if (_gpuBytes > _peakBytes) _peakBytes = _gpuBytes
  }
  return tex
}

function touchSet(set) {
  if (!set) return set
  touchTexture(set.map); touchTexture(set.normalMap); touchTexture(set.roughnessMap)
  return set
}

function evictResident(base) {
  const r = _res.get(base)
  if (!r || r.resident === false) return 0
  r.resident = false
  _gpuBytes -= r.bytes
  _evictedBytes += r.bytes
  _evictions++
  if (r.clones) for (const c of r.clones) c.dispose()
  base.dispose()
  return r.bytes
}

// Evict coldest-first until resident bytes fit `target`. The newest quarter of
// the resident set is never touched: those are the surfaces of the scene being
// built right now, and evicting them would thrash the very upload we just paid
// for. Called after a set is assembled, so the set that triggered the pass is
// itself in the protected tail.
function evictToBudget(target) {
  if (_gpuBytes <= target) return 0
  const cand = []
  for (const tex of _texCache.values()) {
    const r = _res.get(tex)
    if (!r || r.base || !r.resident || !(r.bytes > 0)) continue
    cand.push(tex)
  }
  cand.sort((a, b) => _res.get(a).touch - _res.get(b).touch)
  const stop = cand.length - Math.ceil(cand.length * 0.25)
  let freed = 0
  for (let i = 0; i < stop && _gpuBytes > target; i++) freed += evictResident(cand[i])
  return freed
}

export function disposeTextureCache() {
  // Drop pending generation first — finishing a job whose textures have just
  // been disposed is pure waste, and its `needsUpdate` would resurrect them.
  for (const e of _jobQueue) { e.job = null; e.texes.length = 0 }
  _jobQueue.length = 0
  for (const tex of _texCache.values()) tex.dispose()
  _texCache.clear()
  _fieldCache.clear()
  _surfCache.clear()
  _normCache.clear()
  _gpuBytes = 0
  _liveBytes = 0
  _degradedCount = 0
  _evictions = 0
  _evictedBytes = 0
  // `_peakBytes` deliberately survives: it is a SESSION high-water mark, and
  // resetting it here would hide exactly the failure this round was called to
  // find (a five-arena session that went over once, silently, in arena three).
  // `_microCache` is deliberately NOT cleared. It holds at most two entries
  // (256 and 128), it is CPU-side Float32 only (~0.75 MB, no GPU bytes, outside
  // the budget), it is fully deterministic, and every surface rebuilt after
  // this call needs it again immediately — dropping it would buy nothing and
  // cost a 35 ms field rebuild on the first surface of the next scene.
}

export function textureCacheStats() {
  return {
    count: _texCache.size,
    bytes: _gpuBytes,
    mb: +(_gpuBytes / 1048576).toFixed(2),
    surfaces: _surfCache.size,
    fields: _fieldCache.size,
    // ENFORCED resident cap. Round 11: this is max(what the integrator asked
    // for, peak single-scene working set * 1.10). When the two differ, the
    // integrator's number was below the working set and enforcing it would have
    // evicted surfaces the live frame still draws — see effectiveBudget.
    budgetMB: effectiveBudget() / 1048576,
    budgetRequestedMB: BUDGET_BYTES / 1048576,
    budgetFloorMB: +(_budgetCache.floor / 1048576).toFixed(2),
    // The number the cap has to clear: the heaviest arena + ArenaBase + the two
    // heaviest fighters, projected at the current field size. Analytic.
    peakSceneMB: +(peakWorkingSetBytes(DEFAULT_SIZE) / 1048576).toFixed(2),
    // Everything below is round-9. `degraded` > 0 means at least one surface in
    // this session shipped at half its intended resolution; `peakMB` is the
    // session high-water mark and does NOT reset on disposeTextureCache().
    peakMB: +(_peakBytes / 1048576).toFixed(2),
    degraded: _degradedCount,
    headroomMB: +((effectiveBudget() - _gpuBytes) / 1048576).toFixed(2),
    mapRes: { alb: ALB_RES, rgh: RGH_RES },
    // Round 10. `mb` above is RESIDENT bytes and is hard-capped at budgetMB by
    // the LRU. `cachedMB` is every texture the cache holds, resident or evicted
    // — the upper bound on VRAM if every material that ever asked is still being
    // rendered. Read them as a pair; see the residency block for why the true
    // number lives between them.
    cachedMB: +(_liveBytes / 1048576).toFixed(2),
    evictions: _evictions,
    evictedMB: +(_evictedBytes / 1048576).toFixed(2),
    scaleLadder: { fine: SCALE_LADDER_FINE, coarse: SCALE_LADDER_COARSE },
  }
}

// ---------------------------------------------------------------------------
// SESSION_DEMAND — WHAT THE GAME ACTUALLY ASKS FOR  (round 10, defect 8)
//
// THE REASON THIS TABLE EXISTS. The self-test swept the kind table ONCE, got
// 81.63 MB, and called it a session; the live build measured 134.59 MB and was
// silently halving surfaces from the third arena on. Round 9 replaced that with
// a SYNTHETIC session — 2.12 dressings of every kind, uniformly — which reported
// 72.92 MB. That is still a made-up number: it under-predicted the real 134.59
// by 1.85x, because real demand is not uniform. Nobody asks for two dressings of
// `horn`; the tree asks for TWELVE of `cloth-weave`, all at 512.
//
// So the table below is not a model. It is the deduplicated set of
// (kind, scale, wear, seed, tint) tuples reached by every `surface:` /
// preset-name call site in src/arenas + src/characters, resolved through
// materials.js SURFACE, for a six-arena / four-fighter session:
//
//     ArenaBase, settlement-express, institutional-capital-tower,
//     permanent-reserve-core, mountain-node-village, frozen-token-lab,
//     WALLY, bonko, tired-ape, cool-pal
//
// 40 kinds, 140 distinct dressings. Replayed through surfaceMaps() at 512 px it
// reproduced the live session to within 4% BEFORE the round-10 changes
// (139.33 MB measured here against 134.59 MB measured in the browser, 132 fields
// against 102 — this over-counts slightly because the extraction is static and
// cannot know which branches an arena takes). That is what "predictive" means
// here: it is the same shape as the live number and it moves with it.
//
// MAINTENANCE, HONESTLY. This is a snapshot of the arena files as of round 10 and
// it will drift as they are edited. It drifts SAFELY — it can only ever be a
// stale estimate, never a wrong runtime behaviour, because nothing but the
// self-test and projectSession read it. Re-derive it by walking the arena and
// character sources for surface-preset literals and their neighbouring
// `mapOpts`. If you need the exact live number, read textureCacheStats() in the
// browser; this is the number you can get in node in 20 seconds.
//
// Entries are `scale` alone, or [scale, wear], or [scale, wear, seed], or
// [scale, wear, seed, tint].
export const SESSION_DEMAND = {
  "asphalt": [1.7, [1.7, 0.7]],
  "bone": [1, 0.35],
  "chrome": [[1, 0.1], 1, [1.1, 0.2]],
  "circuit": [[1.2, 0.25], [1.25, 0.3], 1],
  "cloth-knit": [1, [2.9, 0.12]],
  "cloth-weave": [
    [1.6, 0.5], [1.8, 0.55], [1.3, 0.75], [1.5, 0.6], [1.1, 0.15], [1.35, 0.6], [1.5, 0.62], 1,
    1.2, 6.4, 5.2, 4.4,
  ],
  "concrete": [1, [1.6, 0.5], [1.1, 0.15], [1.7, 0.7], [1.4, 0.4], [0.9, 0.1], [1.1, 0.2]],
  "default": [1, [1.3, 0.75], [1.7, 0.7]],
  "denim": [1, [1.5, 0.62]],
  "feather": [1],
  "fur-coarse": [1, [1.5, 0, 71], 1.4, 1.05, [1.15, 0.3], 0.95],
  "fur-long": [1.8, 2.2],
  "fur-short": [1, [1.5, 0, 71]],
  "glass": [[1.2, 0.25], [1.1, 0.15], [1, 0.1], 1, [0.8, 0.7]],
  "gold": [[1.8, 0.55], [1.1, 0.15], [1, 0.1], [1.25, 0.3], 1, [1.1, 0.2], [1.1, 0.14]],
  "granite": [[1.6, 0.5], [1.8, 0.55], 1, 1.5, [1.5, 0.6], [1.1, 0.15], [2.6, 0.28]],
  "horn": [1],
  "ice": [[1.2, 0.25], 1],
  "leather": [1, [1.5, 0.62], [0.8, 0.7]],
  "marble": [[1.8, 0.55], 1, 1.1, [1.1, 0.15], [1.35, 0.6], [1, 0.1], 1.4, [1.5, 0.05]],
  "metal-brushed": [[1.2, 0.25], 1, [1.7, 0.7], 1.25, [1.25, 0.3]],
  "metal-painted": [[1.2, 0.25], [1.35, 0.6], [1.25, 0.3], 1, [1.5, 0.62], [1.1, 0.14]],
  "metal-rusted": [1.35, [1.7, 0.7], 1],
  "mud": [[1.3, 0.75], 1],
  "neon-panel": [[1.6, 0.5], [1.35, 0.6], 1],
  "paper": [1, 3.2, 0.4],
  "plastic-gloss": [1],
  "plastic-matte": [1],
  "rubber": [1],
  "sand": [1, [1.8, 0.55]],
  "screen-crt": [[1.6, 0.5], [1.2, 0.25], [1, 0.1], 1],
  "skin-amphibian": [1],
  "skin-elephant": [1],
  "skin-reptile": [1],
  "skin-smooth": [1, [0.45, 0.3], 0.42, 0.8, 0.7, 0.5, 0.35],
  "snow": [[1.2, 0.25], [1.5, 0.6], 1],
  "suit-wool": [1],
  "water": [[1.3, 0.75], 1, 0.4],
  "wood-plank": [1.6, [1.6, 0.5], 1, [1.35, 0.6], [1, 0.1], [1.5, 0.62]],
  "wood-rough": [1.3, [1.3, 0.75], [1.5, 0.6], [1.35, 0.6], [1.7, 0.7], 1],
}

const DEMAND_KINDS = Object.keys(SESSION_DEMAND).length

/** SESSION_DEMAND flattened into surfaceMaps() opts, in table order. */
export function sessionAsks() {
  const out = []
  for (const kind of Object.keys(SESSION_DEMAND)) {
    for (const v of SESSION_DEMAND[kind]) {
      const a = Array.isArray(v) ? v : [v]
      const o = { scale: a[0] }
      if (a[1]) o.wear = a[1]
      if (a[2]) o.seed = a[2]
      if (a[3]) o.tint = a[3]
      out.push({ kind, opts: o })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// SESSION_SCENES — WHAT ONE SCENE HOLDS AT ONCE  (round 11, defect 8)
//
// SESSION_DEMAND is a CUMULATIVE table: every dressing the six-arena walk ever
// asks for, in one flat list. That is the right number for "how much distinct
// content exists" and the WRONG number for a budget, because since round 10 the
// budget is a RESIDENT cap enforced by an LRU. What a resident cap has to clear
// is not the session total, it is the largest WORKING SET — one arena, plus the
// shared ArenaBase furniture, plus the two fighters standing in it. Nothing has
// ever measured that, and the round-10 note's "worst single scene 75.25 MB" was
// an estimate off an ungrouped table.
//
// Measured here, per scene, at 512 px AFTER the round-11 half-step:
//
//   calm-before-liquidation      90.84 MB     lost-block-museum        80.14 MB
//   bull-market-colosseum        87.66 MB     frozen-token-lab         76.06 MB
//   institutional-capital-tower  80.29 MB     settlement-express       75.53 MB
//   liquidity-swamp              79.26 MB     meme-market              75.00 MB
//   permanent-reserve-core       74.71 MB     mountain-node-village    73.39 MB
//
// EVERY ARENA IS AT OR ABOVE THE 80 MB THAT GameConfig's `high` TIER PASSES IN,
// or within 7% of it. That is the live defect behind "585 textures /
// 134.59 MB": the LRU is being asked to fit a 74-93 MB working set into an 80 MB
// cap, so it must evict surfaces the CURRENT scene is still drawing. Because
// three re-uploads from `texture.image.data` on the next draw call, that never
// errors and never shows a black surface — it just re-uploads, forever, and
// nothing in the stats says so. See the BUDGET FLOOR block by setTextureQuality.
//
// HOW THIS TABLE WAS DERIVED, AND HOW ACCURATE IT IS. A static walk of every
// src/arenas and src/characters file: each quoted string that names a
// materials.js SURFACE preset, resolved to (kind + the preset's own mapOpts),
// with an explicit `mapOpts: { scale, wear, seed }` in the same statement
// overriding. Cross-checked against the hand-extracted SESSION_DEMAND over the
// SAME ten files: this walk reports 86.5 MB / 114 fields / 64 normals where the
// hand table reports 83.29 / 110 / 61 — a 3.9% over-count, which is the right
// direction for a budget and the same order of error SESSION_DEMAND itself has
// against the browser (4%). It over-counts because a static scan cannot know
// which branches an arena takes and counts preset names that appear in lookup
// tables; it never under-counts a preset that is actually reachable.
//
// Format per scene: `kind s s s, kind s s s` where a dressing is
// `scale`, `scale/wear`, or `scale/wear~seed`. Regenerate with the walk above.
// ---------------------------------------------------------------------------
export const SESSION_SCENES = {
  'ArenaBase':
    'asphalt 1.7/0.7, chrome 1/0.1, circuit 1.2/0.25 1.25/0.3, cloth-weave 1.6/0.5 1.8/0.55 ' +
    '1.3/0.75 1.5/0.6 1.1/0.15 1.35/0.6, concrete 1 1.6/0.5 1.2/0.25 1.1/0.15 1.35/0.6 ' +
    '1.7/0.7 1.25/0.3, default 1 1.3/0.75~733 1.7/0.7~733, denim 1, glass 1.2/0.25 1.1/0.15 ' +
    '1/0.1, gold 1.8/0.55 1.1/0.15 1/0.1 1.25/0.3, granite 1.6/0.5 1.8/0.55 1.5/0.6 1.1/0.15, ' +
    'ice 1.2/0.25, marble 1.8/0.55 1.1/0.15 1.35/0.6 1/0.1, metal-brushed 1.2/0.25 1.35/0.6 ' +
    '1.7/0.7 1.25/0.3, metal-painted 1.2/0.25 1.35/0.6 1.25/0.3, metal-rusted 1.35/0.6 ' +
    '1.7/0.7, mud 1.3/0.75, neon-panel 1.6/0.5 1.35/0.6, sand 1.8/0.55, screen-crt 1.6/0.5 ' +
    '1.2/0.25 1/0.1, snow 1.2/0.25 1.5/0.6, water 1.3/0.75, wood-plank 1 1.6/0.5 1.3/0.75 ' +
    '1.35/0.6 1/0.1, wood-rough 1.3/0.75 1.5/0.6 1.35/0.6 1.7/0.7 1',
  'bullMarketColosseum':
    'cloth-knit 1, cloth-weave 1 3 3.4, concrete 2/0.9 1, default 1, denim 1, gold 1 1.3/0.35 ' +
    '1.8/0.6 2.6/0.3 3/0.5, granite 1.6/0.6 2.2/0.8 1 1.6/0.7 2 4 1.7/0.6 1.7/0.7 2.4/0.85 ' +
    '3.2/0.9 1.5/0.7, horn 2.2, leather 2.6, marble 1 1.4 1.8 2.2, metal-brushed 3/0.5, ' +
    'metal-rusted 3 2.4/0.7 3/0.85 1, neon-panel 1, paper 1, plastic-gloss 1 1.2, sand ' +
    '1.8/0.5 2.2 2.6/0.7 4 1, screen-crt 1, wood-plank 0.9, wood-rough 1.6/0.8 1',
  'calmBeforeLiquidation':
    'asphalt 1, cloth-weave 5/0.5 4/0.4 1 5/0.6, default 1 2.4/0.5~733 2.9/0.62~733 ' +
    '2.2/0.55~733 3.4~733 3~733 4~733 2.2~733 3.6~733, fur-coarse 4.6, fur-short 4.2 1.7/0.6, ' +
    'granite 1 1.9/0.45 1.7/0.6 1.2/0.8, marble 1.9/0.45 1.4/0.3, metal-brushed 1/0.6, ' +
    'metal-painted 1/0.6 1/0.7 1.7/0.6, metal-rusted 1 1/0.6 1/0.8 1/0.95 1.7/0.6, mud ' +
    '2.4/0.5 1.6/0.7 1.1/0.85 3/0.9, paper 3/0.5 6 1.7/0.6, plastic-gloss 1, sand 1 2.4/0.5 ' +
    '2.6, scales 6 1.7/0.6, screen-crt 1, skin-smooth 7, snow 1.1 1 3.4/0.8, water 1, ' +
    'wood-plank 1 2.2/0.55 1.5/0.6 1.5/0.75 1.7/0.6, wood-rough 2.2/0.55 2/0.7 3.2/0.85 1',
  'frozenTokenLab':
    'circuit 1, cloth-knit 1, concrete 1, default 1, feather 1, glass 1, ice 1, marble 1, ' +
    'metal-brushed 1, metal-painted 1, metal-rusted 1, neon-panel 1, plastic-gloss 1, ' +
    'plastic-matte 1, rubber 1, snow 1, water 1, wood-rough 1',
  'institutionalCapitalTower':
    'chrome 1 1.1/0.2, cloth-weave 1, concrete 1 1.4/0.4 0.9/0.1 1.1/0.2, default 1 2.2~733, ' +
    'denim 1, glass 1, gold 1 1.1/0.2 1.1/0.14, granite 1 2.6/0.28, leather 1, marble 1.4 1 ' +
    '1.5/0.05, metal-painted 1 1.1/0.14, mud 1, neon-panel 1 1.1/0.14, paper 1 3.2, ' +
    'plastic-gloss 1, plastic-matte 1, rubber 1, screen-crt 1, suit-wool 1, wood-plank 1, ' +
    'wood-rough 1',
  'liquiditySwamp':
    'cloth-weave 1, concrete 1, default 1 2.2~733, gold 1 1.3/0.75, granite 1, metal-painted ' +
    '1 1.3/0.75, metal-rusted 1 1.3/0.75, mud 1, neon-panel 1, paper 1, plastic-matte 1, ' +
    'screen-crt 1 1.3/0.75, skin-amphibian 1, water 1, wood-plank 1, wood-rough 1',
  'lostBlockMuseum':
    'cloth-weave 1, concrete 1 1.7/0.3 1.4/0.4, denim 1, gold 1 0.6/0.15 0.7/0.35 1.1/0.18, ' +
    'granite 1 0.5/0.6, marble 1 2.2/0.34 1.1/0.18, metal-brushed 1 1.1/0.18, metal-painted ' +
    '1, neon-panel 1, pixel-grid 1.1/0.18, plastic-gloss 1, screen-crt 1 1.1/0.18, wood-plank ' +
    '1 1.6/0.45',
  'memeMarket':
    'asphalt 1, cloth-weave 1, concrete 1, default 1, gold 1, granite 1, metal-brushed 1, ' +
    'metal-painted 1, metal-rusted 1, neon-panel 1, paper 1, plastic-gloss 1, plastic-matte ' +
    '1, screen-crt 1, water 1, wood-plank 1, wood-rough 1',
  'mountainNodeVillage':
    'bone 1, cloth-weave 1, concrete 1, default 1, fur-coarse 1, gold 1, granite 1, ' +
    'metal-rusted 1, plastic-gloss 1, snow 1, wood-plank 1, wood-rough 1',
  'permanentReserveCore':
    'concrete 1, default 1, gold 1, metal-brushed 1, metal-painted 1, metal-rusted 1, ' +
    'neon-panel 1, paper 1, plastic-gloss 1, plastic-matte 1, screen-crt 1, suit-wool 1, ' +
    'wood-rough 1',
  'settlementExpress':
    'cloth-weave 1.5/0.62, concrete 1, default 2.2~733 1, denim 1, gold 1, granite 1, leather ' +
    '1 1.5/0.62, marble 1, metal-brushed 1, metal-painted 1 1.5/0.62, metal-rusted 1, sand 1, ' +
    'wood-plank 1, wood-rough 1',
  'blackish-bull':
    'bone 1, cloth-weave 1.4, concrete 0.5/0.7 0.5, default 1, glass 1, gold 1.6 1.9 1.3, ' +
    'granite 0.8, horn 0.9, leather 1.1/0.6 1.1/0.9, metal-brushed 1.1 0.9 1.3 1.5, ' +
    'metal-rusted 0.7/0.55 0.9/0.4 1.4/0.9 1.4 1, neon-panel 1, plastic-gloss 1, rubber 1.3, ' +
    'skin-amphibian 1.5, skin-smooth 1',
  'bonko':
    'bone 1, cloth-weave 1, default 1, fur-coarse 1 1.5~71, fur-short 1, glass 1, horn 1, ' +
    'leather 1, metal-brushed 1, metal-painted 1, metal-rusted 1, paper 1, plastic-gloss 1, ' +
    'rubber 1, scales 1, skin-amphibian 1, skin-reptile 1, skin-smooth 1, wood-rough 1',
  'cool-pal':
    'bone 1, cloth-knit 1, cloth-weave 1, concrete 1, default 1 2.2~733, feather 1, ' +
    'fur-coarse 1, glass 1, horn 1, leather 1, metal-brushed 1, plastic-gloss 1, ' +
    'plastic-matte 1, rubber 1, skin-elephant 1, wood-plank 1',
  'crypto-punkd':
    'cloth-weave 16 3/0.3 20 24, default 1, glass 1, gold 1 22, horn 40, leather 14/0.45 ' +
    '14/0.2 14/0.5, metal-brushed 18, pixel-grid 1, plastic-gloss 1, plastic-matte 1, rubber ' +
    '10, screen-crt 1, suit-wool 20/0.25 20/0.55 11, wood-rough 30',
  'dogey':
    'bone 1, cloth-knit 1, cloth-weave 1 22 2.2 3, default 1, fur-long 2.2, fur-short 2.8, ' +
    'gold 1, horn 14, ice 1, leather 12/0.4, plastic-gloss 1, rubber 26 18, skin-amphibian ' +
    '14, skin-elephant 24, skin-smooth 2.2',
  'fatty-pingo':
    'cloth-knit 14, glass 1, ice 3, metal-brushed 6/0.5, neon-panel 1, plastic-gloss 8 1 10, ' +
    'plastic-matte 5 6 4 5/0.35',
  'peepee':
    'denim 1, glass 1, gold 1, leather 1, metal-painted 1, plastic-gloss 1, plastic-matte 1, ' +
    'skin-amphibian 3.2/0.2 1, skin-smooth 1, suit-wool 1',
  'shibro':
    'cloth-weave 3, default 1, fur-coarse 1.6, fur-long 2.6, fur-short 1.6 1, glass 1, gold ' +
    '1, granite 1, horn 1, leather 1 1.6/0.7, metal-brushed 1.1/0.45 1, metal-painted 1/0.6, ' +
    'neon-panel 1, plastic-gloss 1, rubber 2.2, skin-smooth 1',
  'tired-ape':
    'bone 0.35, cloth-knit 2.9/0.12, cloth-weave 1.2 6.4 5.2 4.4 1, default 1, fur-coarse 1 ' +
    '1.4 1.05 1.15 0.95, fur-long 1.8 2.2, fur-short 1, glass 1, gold 1, leather 0.8/0.7 1, ' +
    'metal-brushed 1, metal-painted 1, metal-rusted 1, paper 0.4 1, plastic-gloss 1 0.4, ' +
    'skin-smooth 0.45/0.3 0.42 0.8 0.7 0.5 0.35 1, suit-wool 1, water 0.4, wood-plank 1',
  'wally':
    'plastic-matte 1',
}

// The scenes that are ARENAS (each is one working set together with ArenaBase
// and two fighters) and the scenes that are FIGHTERS. `ArenaBase` is in neither
// — it is in every working set.
export const ARENA_SCENES = [
  'bullMarketColosseum', 'calmBeforeLiquidation', 'frozenTokenLab', 'institutionalCapitalTower',
  'liquiditySwamp', 'lostBlockMuseum', 'memeMarket', 'mountainNodeVillage',
  'permanentReserveCore', 'settlementExpress',
]
export const FIGHTER_SCENES = [
  'blackish-bull', 'bonko', 'cool-pal', 'crypto-punkd', 'dogey',
  'fatty-pingo', 'peepee', 'shibro', 'tired-ape', 'wally',
]

/** One SESSION_SCENES string -> surfaceMaps() asks. */
function parseScene(str) {
  const out = []
  for (const grp of String(str).split(',')) {
    const parts = grp.trim().split(/\s+/)
    const kind = parts.shift()
    if (!kind) continue
    for (const t of parts) {
      const [sw, seed] = t.split('~')
      const [scale, wear] = sw.split('/')
      const o = { scale: +scale || 1 }
      if (wear) o.wear = +wear
      if (seed) o.seed = +seed
      out.push({ kind, opts: o })
    }
  }
  return out
}

/** Deduplicated asks for a set of scene names (always includes ArenaBase). */
export function sceneAsks(names, withBase = true) {
  const list = withBase ? ['ArenaBase', ...names] : names.slice()
  const seen = new Set()
  const out = []
  for (const n of list) {
    const s = SESSION_SCENES[n]
    if (!s) continue
    for (const a of parseScene(s)) {
      const k = `${a.kind}|${a.opts.scale}|${a.opts.wear || 0}|${a.opts.seed || 0}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(a)
    }
  }
  return out
}

/**
 * workingSets({ size, fighters }) -> the number a RESIDENT cap has to clear.
 *
 * One entry per arena: ArenaBase + that arena + the two heaviest fighters, which
 * is the worst pairing the player can produce there. Analytic (projectSession),
 * so it costs microseconds and can be called from setTextureQuality.
 */
export function workingSets(opts = {}) {
  const size = clampSize(opts.size || DEFAULT_SIZE)
  const fighters = opts.fighters || heaviestFighters(size)
  const rows = ARENA_SCENES.map((arena) => {
    const p = projectSession({ size, demand: sceneAsks([arena, ...fighters]) })
    return { scene: arena, mb: p.sessionMB, bytes: p.sessionBytes, fields: p.fields, normalMaps: p.normalMaps }
  }).sort((a, b) => b.bytes - a.bytes)
  const whole = projectSession({ size, demand: sceneAsks([...ARENA_SCENES, ...FIGHTER_SCENES]) })
  return {
    size,
    fighters,
    rows,
    peakScene: rows[0].scene,
    peakBytes: rows[0].bytes,
    peakMB: rows[0].mb,
    wholeTreeMB: whole.sessionMB,
    budgetMB: effectiveBudget() / 1048576,
    fitsBudget: rows[0].bytes <= effectiveBudget(),
  }
}

/** The two fighters whose surface sets cost the most on top of ArenaBase. */
function heaviestFighters(size) {
  return FIGHTER_SCENES
    .map((f) => ({ f, b: projectSession({ size, demand: sceneAsks([f]) }).sessionBytes }))
    .sort((a, b) => b.b - a.b).slice(0, 2).map((x) => x.f)
}

// Memoised peak working set per field size — the floor under the resident cap.
const _peakBySize = new Map()
function peakWorkingSetBytes(size) {
  const k = clampSize(size)
  if (!_peakBySize.has(k)) {
    let b = 0
    try { b = workingSets({ size: k }).peakBytes } catch (e) { b = 0 }
    _peakBySize.set(k, b)
  }
  return _peakBySize.get(k)
}

/**
 * projectSession({ size, demand, kinds, variants, normalsPerKind }) -> projected
 * bytes, WITHOUT generating anything. The cheap analytic twin of __selfTest's
 * `session` block; use it to size a budget or to sanity-check a quality tier in
 * a unit test that cannot afford 20 seconds of noise generation.
 *
 * By default it counts SESSION_DEMAND exactly: it runs every dressing through
 * the same fieldKey/normalKey quantisation the cache uses, so it sees the same
 * field collapse the scale ladder produces at runtime and reports the same
 * bytes. Pass `variants`/`normalsPerKind` to fall back to the old two-multiplier
 * estimate for a hypothetical content set that does not exist yet.
 *
 *     bytes = SUM over normal keys of nrm  +  SUM over field keys of (alb + rgh)
 *
 * `sweepMB` is still one field per kind — the number the old self-test reported
 * and the number that fooled everybody. It is kept so the gap stays visible.
 */
export const SESSION_VARIANTS = 2.75          // measured: 110 fields / 40 kinds
export const SESSION_NORMALS_PER_KIND = 1.53  // measured:  61 normals / 40 kinds

export function projectSession(opts = {}) {
  const size = clampSize(opts.size || DEFAULT_SIZE)
  const kinds = opts.kinds || ['default', ...surfaceKinds()]
  const mip = 4 / 3
  // Per-kind map geometry, shared by both paths.
  const geom = new Map()
  let sweep = 0
  const rows = []
  for (const k of kinds) {
    const def = KINDS[k] || KINDS.default
    let n = size
    const resHint = def.res
    if (resHint && resHint !== 1) n = clampSize(Math.max(128, size * resHint))
    const { albSize, rghSize } = mapSizes(def, n)
    const g = {
      px: n,
      nrmB: Math.round(n * n * 4 * mip),                                        // RGBA8
      albB: def.albedo === false ? 0 : Math.round(albSize * albSize * 4 * mip),
      rghB: Math.round(rghSize * rghSize * 2 * mip),                            // RG8: R = AO, G = rough
    }
    geom.set(k, g)
    sweep += g.nrmB + g.albB + g.rghB
    rows.push({ kind: k, px: n, albPx: albSize, rghPx: rghSize, bytes: g.nrmB + g.albB + g.rghB })
  }

  // ---- the exact path: count SESSION_DEMAND through the real cache keys ----
  let session = 0, fields = 0, normalMaps = 0
  const useModel = opts.variants !== undefined || opts.normalsPerKind !== undefined
  const variants = opts.variants ?? SESSION_VARIANTS
  const normals = opts.normalsPerKind ?? SESSION_NORMALS_PER_KIND
  if (useModel) {
    for (const k of kinds) {
      const g = geom.get(k)
      session += normals * g.nrmB + variants * (g.albB + g.rghB)
    }
    fields = Math.round(variants * kinds.length)
    normalMaps = Math.round(normals * kinds.length)
  } else {
    const demand = opts.demand || sessionAsks()
    const fk = new Set(), nk = new Set()
    for (const { kind, opts: o } of demand) {
      const g = geom.get(kind)
      if (!g) continue
      const f = fieldKey(kind, g.px, o)
      const n = normalKey(kind, g.px, o)
      if (!nk.has(n)) { nk.add(n); session += g.nrmB }
      if (!fk.has(f)) { fk.add(f); session += g.albB + g.rghB }
    }
    fields = fk.size
    normalMaps = nk.size
  }
  session = Math.round(session)
  return {
    size,
    kinds: kinds.length,
    model: useModel ? 'multiplier' : 'SESSION_DEMAND',
    variants: useModel ? variants : +(fields / DEMAND_KINDS).toFixed(2),
    normalsPerKind: useModel ? normals : +(normalMaps / DEMAND_KINDS).toFixed(2),
    fields,
    normalMaps,
    sweepBytes: sweep,
    sweepMB: +(sweep / 1048576).toFixed(2),
    sessionBytes: session,
    sessionMB: +(session / 1048576).toFixed(2),
    budgetMB: effectiveBudget() / 1048576,
    fitsBudget: session <= effectiveBudget(),
    rows,
  }
}

// True when a texture came out of this module — the sanctioned test for every
// dispose path in the codebase.
export function isSharedTexture(tex) {
  return !!(tex && tex.userData && tex.userData.__shared)
}

// ---------------------------------------------------------------------------
// Texture construction helpers
// ---------------------------------------------------------------------------

function applyCommon(tex, opts = {}) {
  const rep = opts.repeat
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  if (rep) tex.repeat.set(rep[0], rep[1])
  tex.generateMipmaps = opts.mips !== false
  if (opts.nearest) {
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = tex.generateMipmaps ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter
  } else {
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = tex.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  }
  tex.anisotropy = opts.aniso ?? DEFAULT_ANISO
  tex.needsUpdate = true
  return tex
}

function dataTexture(bytes, size, format, srgb, opts) {
  const tex = new THREE.DataTexture(bytes, size, size, format, THREE.UnsignedByteType)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  // DataTexture is flipY:false, which is what every field in this file assumes:
  // row 0 is v=0. Mixing in a CanvasTexture (flipY:true) inside one map set
  // would vertically mirror the albedo against the normal — do not do it.
  return applyCommon(tex, opts)
}

// ---------------------------------------------------------------------------
// §3 Core — cached canvas -> texture
// ---------------------------------------------------------------------------

// opts: { srgb=false, repeat=[1,1], nearest=false, aniso=8, mips=true }
export function procTexture(key, size, drawFn, opts = {}) {
  const ck = `proc:${key}|${size}|${opts.srgb ? 1 : 0}|${opts.repeat || ''}|${opts.nearest ? 1 : 0}|${opts.aniso ?? DEFAULT_ANISO}|${opts.mips === false ? 0 : 1}`
  const hit = _texCache.get(ck)
  if (hit) return hit
  const n = clampSize(size || DEFAULT_SIZE)
  const canvas = makeCanvas(n, n)
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  drawFn(ctx, n, n)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  applyCommon(tex, opts)
  return trackTexture(ck, tex)
}

// ---------------------------------------------------------------------------
// §3 Core — height -> derived maps
//
// All four wrap their sampling, so a tileable height field yields tileable
// derivatives. `height` is Float32Array(size*size) in [0,1], row-major, row 0
// at v=0.
// ---------------------------------------------------------------------------

// Sobel gradient gain. Chosen so a feature ~8 texels wide with 0.3 height
// amplitude lands around 35 degrees of tilt at strength 1 — visible relief that
// does not shimmer. Per-kind `normal` values in KINDS scale from here, and
// materials.js scales again via normalScale.
const NORMAL_GAIN = 8

// ---------------------------------------------------------------------------
// THE SHARED MICRO-DETAIL BAND  (contract §3 "triplanarDetailNormal", §0.4)
//
// A high-frequency detail normal tiled hard over EVERYTHING is the cheapest
// single thing that makes a whole frame read as "rendered" rather than
// "modelled" — it is the reason a AAA surface still has specular structure at
// 30 cm when its authored bands have run out. Three.js `MeshStandardMaterial`
// has exactly one normal-map slot, so a second detail sampler is not available
// to us at the material level; the shipped `triplanarDetailNormal()` was
// therefore a genuine no-op — nothing in the tree ever called it, and nothing
// could have consumed it without a shader patch.
//
// So the band is BAKED, by partial-derivative blending, into every kind's
// normal map at derivation time:
//
//     n = normalize( (dh/du + micro.du,  dh/dv + micro.dv,  1) )
//
// which is the mathematically correct way to compose two height fields (adding
// slopes, not averaging unit vectors — the latter flattens both).
//
// TILING RATE. The field is generated at `MICRO_PX` and indexed with a plain
// `x % ms`, so a 512 map tiles it exactly 2x and a 256 map 1x. The stride is
// therefore ALWAYS one texel: no point-sample aliasing, and the wrap is exact
// at x = size because size is a power of two >= ms. That is also what keeps the
// composite normal map tileable, which every arena floor depends on.
//
// AMPLITUDE, AND WHAT IT ACTUALLY BUYS. The gradients are RMS-normalised per
// axis, so `MICRO_AMP` is the tangent of the tilt the band adds ON A FLAT
// SURFACE: 0.085 ~ 4.9 degrees at `micro: 1`. That figure is NOT what it
// contributes on top of a kind that already has relief, because slopes compose
// and mean tilt does not add. Measured (mapResponse mean tilt, 512 px, this
// band forced to zero vs. shipping):
//
//     default 8.66 -> 10.54   plastic-gloss 4.15 -> 5.17   concrete 13.28 -> 14.51
//     skin-smooth 13.99 -> 15.59   skin-elephant 22.04 -> 23.45   marble 8.71 -> 9.30
//
// i.e. +0.6 to +1.9 degrees of mean tilt, biggest where the kind's own detail
// is weakest, which is exactly the intended shape: it is a FLOOR on surface
// response, not a headline band. It was 0.062 and contributed +0.3 to +1.0 —
// real, but under-tuned for a band whose whole job is to stop smooth kinds
// reading as mathematical planes. The cost of going further is `paintRatio`:
// the band is uncorrelated with every kind's albedo, so it dilutes the
// painted-detail ratio (concrete 2.96 -> 2.84 at this amplitude), and past ~0.12
// it starts to mask the very thing that metric is watching for.
//
// Per-kind `micro` scales it; `micro: 0` opts out entirely and is what the
// mirror kinds use — a chrome ball with 5 degrees of crawling micro-relief
// looks like brushed nickel.
// ---------------------------------------------------------------------------

const MICRO_PX = 256
const MICRO_AMP = 0.085
const _microCache = new Map()

// Three bands inside the micro band itself, because a single octave of grain
// tiled 2x reads as a repeating stipple:
//   b1 f=11  soft cast/settle blotch      b2 f=37  fine crazing net (ridged)
//   b3 f=64  grain at the Nyquist floor   b4       per-texel tooth, 0.08
function microBuild(c) {
  const { N, h, vn, pn, sn } = c
  const f1 = c.fr(11), f2 = c.fr(37), f3 = c.fr(64)
  for (let y = c.y0; y < c.y1; y++) {
    const v = y / N
    for (let x = 0; x < N; x++) {
      const u = x / N, i = y * N + x
      const b1 = c.W(pn, u, v, f1, 0.35, 3) * 0.5 + 0.5
      const b2 = c.R(sn, u, v, f2, 3, 1.35) * 0.5 + 0.5
      const b3 = c.F(vn, u, v, f3, 2) * 0.5 + 0.5
      h[i] = clamp01(0.5 + (b1 - 0.5) * 0.20 + (b2 - 0.5) * 0.30
        + (b3 - 0.5) * 0.36 + (c.sp(x, y) - 0.5) * 0.08)
    }
  }
}

// Sobel slopes of the micro field, RMS-normalised to 1 per axis. Cached per
// resolution; at most two entries exist in a session (256 for the 512/256 kinds
// and 128 for `horn`), and each costs ~35 ms once.
function microGrads(size) {
  const ms = Math.min(MICRO_PX, size)
  const hit = _microCache.get(ms)
  if (hit) return hit
  const c = makeCtx('micro', ms, 90210, {})
  microBuild(c)
  const h = c.h
  const gx = new Float32Array(ms * ms), gy = new Float32Array(ms * ms)
  let sx = 0, sy = 0
  for (let y = 0; y < ms; y++) {
    const ym = ((y - 1 + ms) % ms) * ms, y0 = y * ms, yp = ((y + 1) % ms) * ms
    for (let x = 0; x < ms; x++) {
      const xm = (x - 1 + ms) % ms, xp = (x + 1) % ms
      const h00 = h[ym + xm], h10 = h[ym + x], h20 = h[ym + xp]
      const h01 = h[y0 + xm], h21 = h[y0 + xp]
      const h02 = h[yp + xm], h12 = h[yp + x], h22 = h[yp + xp]
      const a = (h20 + 2 * h21 + h22) - (h00 + 2 * h01 + h02)
      const b = (h02 + 2 * h12 + h22) - (h00 + 2 * h10 + h20)
      const i = y0 + x
      gx[i] = a; gy[i] = b
      sx += a * a; sy += b * b
    }
  }
  const n = ms * ms
  const kx = 1 / Math.sqrt(Math.max(1e-9, sx / n))
  const ky = 1 / Math.sqrt(Math.max(1e-9, sy / n))
  for (let i = 0; i < n; i++) { gx[i] *= kx; gy[i] *= ky }
  const e = { ms, gx, gy, h }
  _microCache.set(ms, e)
  return e
}

function normalBytes(height, size, strength, opts = {}) {
  const out = new Uint8Array(size * size * 4)
  normalRange(out, height, size, strength, opts, 0, size)
  return out
}

// Row-range worker so a 512px derivation can be split across frames. Identical
// output to a single-pass run — every read wraps, so bands are independent.
//
// opts: { flipY, micro (a microGrads entry), microAmp, aniso: [gx, gy] }
//
// `aniso` is the FAKED ANISOTROPY channel (contract §3.4). `MeshStandardMaterial`
// has no GGX anisotropy term and `MeshPhysicalMaterial.anisotropy` costs a
// physical material on every fur/cloth mesh in the game, so directional
// materials get their stretched highlight the way they did before anisotropic
// BRDFs existed: by weighting the two Sobel axes apart. `[1.35, 0.55]` keeps the
// across-grain slope and flattens the along-grain one, so the specular lobe
// smears along the grain — which is what a brushed/combed surface does.
function normalRange(out, height, size, strength, opts, yStart, yEnd) {
  // Resolution-independent: doubling the map halves the per-texel slope, so
  // scale it back up or a 1024 map would silently read flatter than a 512.
  const k = strength * NORMAL_GAIN * (size / 512)
  const flipY = opts.flipY === true ? -1 : 1
  const an = opts.aniso
  const ax = an ? an[0] : 1, ay = an ? an[1] : 1
  const mg = opts.micro || null
  const ms = mg ? mg.ms : 1
  const mgx = mg ? mg.gx : null, mgy = mg ? mg.gy : null
  const mAmp = mg ? (opts.microAmp ?? MICRO_AMP) : 0
  for (let y = yStart; y < yEnd; y++) {
    const ym = ((y - 1 + size) % size) * size
    const y0 = y * size
    const yp = ((y + 1) % size) * size
    const mrow = mg ? (y % ms) * ms : 0
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size
      const xp = (x + 1) % size
      const h00 = height[ym + xm], h10 = height[ym + x], h20 = height[ym + xp]
      const h01 = height[y0 + xm], h21 = height[y0 + xp]
      const h02 = height[yp + xm], h12 = height[yp + x], h22 = height[yp + xp]
      const gx = (h20 + 2 * h21 + h22) - (h00 + 2 * h01 + h02)
      const gy = (h02 + 2 * h12 + h22) - (h00 + 2 * h10 + h20)
      // Tangent-space OpenGL convention: +X right (+u), +Y up (+v), +Z out.
      // DataTexture is flipY:false so increasing row index IS increasing v,
      // which is why gy is used directly and not negated twice.
      let nx = -gx * 0.125 * k * ax
      let ny = -gy * 0.125 * k * ay * flipY
      if (mg) {
        const mi = mrow + (x % ms)
        nx -= mgx[mi] * mAmp * ax
        ny -= mgy[mi] * mAmp * ay * flipY
      }
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const o = (y0 + x) * 4
      // +0.5 to ROUND. Assigning a float to a Uint8Array truncates, and the Z
      // channel lives at the very top of the range (a flat texel encodes 254.99),
      // so truncation threw away a full quantisation step on almost every texel
      // and biased every normal toward -X/-Y. Free to fix, visible in a grazing
      // specular.
      out[o] = (nx * inv * 0.5 + 0.5) * 255 + 0.5
      out[o + 1] = (ny * inv * 0.5 + 0.5) * 255 + 0.5
      out[o + 2] = (inv * 0.5 + 0.5) * 255 + 0.5
      out[o + 3] = 255
    }
  }
}

export function normalFromHeight(height, size, strength = 1, opts = {}) {
  return dataTexture(normalBytes(height, size, strength, opts), size, THREE.RGBAFormat, false, opts)
}

// opts: { base=0.6, contrast=0.35, invert=false, mask, maskWeight=0.4 }
// `mask` is the whole point — see the header note. Without it you get roughness
// that is a carbon copy of the normal map, which is the look of a 2010 asset.
//
// THE MASK BLENDS, IT DOES NOT ADD. Every kind's build() authors c.m as an
// ABSOLUTE roughness (rubber ~0.9 "very rough", chrome ~0.18 "very smooth"), so
// folding it in as `base + (mask - 0.5) * w` double-counted and drove the result
// straight through the clamp: measured before this change, rubber/asphalt/sand/
// paper were 97-100% pinned at 255 and water/chrome/glass were pinned at the
// floor — i.e. a CONSTANT roughness map, which is exactly the flat-surface
// failure the three-band rule exists to prevent. Blending toward the mask keeps
// each kind's authored level AND its variation, and roughness stays decorrelated
// from height because the mask is an independent field.
function roughnessBytes(height, size, opts = {}) {
  const base = opts.base ?? 0.6
  const contrast = opts.contrast ?? 0.35
  const sign = opts.invert ? -1 : 1
  const mask = opts.mask || null
  const mw = clamp01(opts.maskWeight ?? 0.4)
  const lo = opts.min ?? 0.045
  const hi = opts.max ?? 1
  let mean = 0, n = 0
  // NaN-hardened: one bad texel used to drag the mean to NaN and blank the whole
  // map. Skipping non-finite samples means a stray NaN costs one texel, not the
  // material.
  for (let i = 0; i < height.length; i++) {
    const v = height[i]
    if (v === v) { mean += v; n++ }
  }
  mean = n > 0 ? mean / n : 0.5
  // RG8, not R8. three's roughnessmap_fragment reads `texelRoughness.g` (and
  // metalnessMap reads .b, aoMap reads .r) — a single-channel RedFormat texture
  // samples as (r,0,0,1) in WebGL2, so roughness would come back ZERO and every
  // surface in the game would be a mirror. The value is written to both R and G
  // so the map is also usable in any slot that reads .r.
  const out = new Uint8Array(size * size * 2)

  // SPREAD — variance expansion about the field's own mean.
  //
  // Measured on the shipped build, the roughness maps had a standard deviation
  // of 0.006-0.06 (rubber 0.006, elephant hide 0.009, paper 0.012, asphalt and
  // sand 0.017). At that spread a roughness map is a constant: the specular
  // lobe is the same width everywhere, which is precisely the "no spatially
  // varying roughness" tell. It happens because the height term contributes
  // almost nothing (h - mean is small) and the mask is only blended in at
  // ~0.4 weight, so the result is dragged most of the way back to `base`.
  //
  // Rather than re-author 43 mask formulas, expand the finished distribution
  // about its own mean by `spread` and clamp. `spread` is per kind because a
  // mirror (chrome, water) genuinely IS near-uniform and must stay that way.
  const spread = opts.spread ?? 1

  // MEAN NORMALISATION — why `base` is now a promise and not a suggestion.
  //
  // `base` is a kind's authored ABSOLUTE roughness (gold 0.18, concrete 0.86).
  // It used to be only the starting point: the height term shifted it and the
  // mask then dragged it `maskWeight` of the way toward an independently
  // authored field, so the realised mean drifted a long way from the declared
  // one. Measured on the shipped build: gold declared 0.18, realised 0.289;
  // marble declared 0.18, realised 0.310; metal-polished 0.12 -> 0.182.
  //
  // That drift is the whole round-2 P0. materials.js sizes its roughness
  // multiplier off `set.roughness` (= this `base`), so a preset asking for
  // gold at 0.24 silently rendered at 0.29 — and on a metal, where IBL is the
  // only light, roughness 0.29 vs 0.13 is a ~20x difference in specular peak.
  // No hotspot, no lobe, a 0.06 luminance spread across a hero gold coin.
  //
  // So: build the distribution, then translate it so its mean IS `base`, and
  // scale its variance by `spread` about that mean. Shape and decorrelation are
  // untouched — only the level is pinned. Two correction passes recover the
  // mean lost to the [lo, hi] clamp, which matters for the near-mirror kinds
  // whose distribution sits on top of the floor.
  const len = height.length
  const raw = new Float32Array(len)
  let rsum = 0
  for (let i = 0; i < len; i++) {
    const hv = height[i]
    let r = base + sign * ((hv === hv ? hv : mean) - mean) * contrast
    if (mask) {
      const mv = mask[i]
      if (mv === mv) r = r + (mv - r) * mw
    }
    if (r !== r) r = base
    raw[i] = r
    rsum += r
  }
  const rmean = rsum / len

  // The clamp-recovery passes are only needed when the distribution actually
  // touches [lo, hi] — i.e. the near-mirror and near-matte kinds. Checking the
  // extremes first keeps the common case at one pass over the field, which is
  // what stops this normalisation showing up in the generation budget.
  let rlo = Infinity, rhi = -Infinity
  for (let i = 0; i < len; i++) {
    const r = base + (raw[i] - rmean) * spread
    if (r < rlo) rlo = r
    if (r > rhi) rhi = r
  }
  let off = 0
  if (rlo < lo || rhi > hi) {
    for (let pass = 0; pass < 2; pass++) {
      let s = 0
      for (let i = 0; i < len; i++) {
        const r = base + off + (raw[i] - rmean) * spread
        s += r < lo ? lo : r > hi ? hi : r
      }
      off += base - s / len
    }
  }

  for (let i = 0, o = 0; i < len; i++, o += 2) {
    let r = base + off + (raw[i] - rmean) * spread
    if (r < lo) r = lo; else if (r > hi) r = hi
    const b = Math.round(255 * r)
    out[o] = b
    out[o + 1] = b
  }
  return out
}

export function roughnessFromHeight(height, size, opts = {}) {
  return dataTexture(roughnessBytes(height, size, opts), size, THREE.RGFormat, false, opts)
}

// Horizon-sweep AO. For each texel we march 8 directions, track the steepest
// slope encountered (the horizon), and convert that to a cosine-weighted
// occlusion. Cheaper than a real hemisphere integral and, at this scale, honest
// enough — it darkens crevices and leaves plateaus open, which is all a crevice
// AO map is for.
const AO_DIRS = 8
function aoBytes(height, size, opts = {}) {
  const out = new Uint8Array(size * size)
  aoRange(out, height, size, opts, 0, size)
  return out
}

function aoRange(out, height, size, opts, yStart, yEnd) {
  const radius = Math.max(1, Math.round(opts.radius ?? 4))
  const strength = opts.strength ?? 1
  const relief = opts.relief ?? 1.8   // height units per `radius` texels of run
  const dx = new Int32Array(AO_DIRS), dy = new Int32Array(AO_DIRS)
  for (let d = 0; d < AO_DIRS; d++) {
    const a = (d / AO_DIRS) * Math.PI * 2
    dx[d] = Math.round(Math.cos(a) * 2)
    dy[d] = Math.round(Math.sin(a) * 2)
  }
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const h0 = height[i]
      let occ = 0
      for (let d = 0; d < AO_DIRS; d++) {
        let maxSlope = 0
        for (let s = 1; s <= radius; s++) {
          const sx = (x + dx[d] * s % size + size * 4) % size
          const sy = (y + dy[d] * s % size + size * 4) % size
          const dh = height[sy * size + sx] - h0
          if (dh > 0) {
            const slope = (dh * relief * radius) / s
            if (slope > maxSlope) maxSlope = slope
          }
        }
        occ += maxSlope / Math.sqrt(1 + maxSlope * maxSlope)
      }
      occ /= AO_DIRS
      out[i] = Math.round(255 * clamp01(1 - occ * strength))
    }
  }
}

export function aoFromHeight(height, size, opts = {}) {
  return dataTexture(aoBytes(height, size, opts), size, THREE.RedFormat, false, opts)
}

// Laplacian curvature, remapped to [0,1] with 0.5 = flat. Returned as a
// Float32Array rather than a texture: nothing in three consumes a curvature
// slot — it exists to drive edge wear and cavity dirt inside this file and in
// any caller building its own masks. (Documented deviation: the contract does
// not say what this returns.)
export function curvatureFromHeight(height, size) {
  const out = new Float32Array(size * size)
  let peak = 1e-6
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size
    const y0 = y * size
    const yp = ((y + 1) % size) * size
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size
      const xp = (x + 1) % size
      const c = height[y0 + x]
      const lap = height[y0 + xm] + height[y0 + xp] + height[ym + x] + height[yp + x] - 4 * c
      out[y0 + x] = lap
      const a = Math.abs(lap)
      if (a > peak) peak = a
    }
  }
  // Normalise against the field's own peak so a flat kind (chrome) still yields
  // a usable wear mask instead of a uniform 0.5.
  const inv = 0.5 / peak
  for (let i = 0; i < out.length; i++) out[i] = clamp01(0.5 + out[i] * inv)
  return out
}

// Box-halve a height field. AO is low-frequency; generating it at half res is a
// 4x saving on the most expensive derivation with no visible cost.
function halve(src, size) {
  const n = size >> 1
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    const s0 = (y * 2) * size, s1 = (y * 2 + 1) * size
    for (let x = 0; x < n; x++) {
      const x0 = x * 2, x1 = x * 2 + 1
      out[y * n + x] = (src[s0 + x0] + src[s0 + x1] + src[s1 + x0] + src[s1 + x1]) * 0.25
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Generation context
//
// Every kind's build(c) gets this. The helpers exist so a kind reads as three
// legible bands rather than forty lines of fbm plumbing — and so that every
// frequency goes through fr(), which rounds to an integer and thereby keeps the
// lattice period (and the tile) intact.
// ---------------------------------------------------------------------------

function makeCtx(kind, size, seed, opts) {
  const N = size
  const scale = opts.scale ?? 1
  const vn = makeValueNoise2D(seed)
  const pn = makePerlin2D(seed + 1013)
  // `sn` is the "organic blotch" channel — a SECOND, decorrelated Perlin, not
  // simplex. noise.js is explicit that simplex wraps on a rhombus, not on the
  // unit square, so every field that used it came back with a measurable seam
  // (water scored 4.5x the interior gradient, glass 2.2x). The reason to reach
  // for simplex is to dodge axis-aligned lattice artefacts, and the heavy domain
  // warping in W() already does that — so the tileable choice costs nothing.
  const sn = makePerlin2D(seed + 2027)

  // Nyquist cap. A micro band authored at frequency 200 on a 256 map is 1.3
  // texels per cycle: the Sobel gradient cancels against itself, so the detail
  // costs full generation time and then contributes NOTHING to the normal map —
  // measured mean tilt on concrete was 2 degrees before this cap. Four texels
  // per cycle is the tightest a band can be and still survive derivation and
  // mip-mapping.
  const fcap = Math.max(4, N >> 2)

  // Integer frequency, scaled by opts.scale. Non-integer frequencies break
  // tiling, so this is the ONLY way a kind should produce one.
  const fr = (f) => Math.min(fcap, Math.max(1, Math.round(f * scale)))
  // Even variant, for patterns whose parity must wrap (weave over/under,
  // staggered feather rows, brick courses).
  const fe = (f) => Math.min(fcap - (fcap & 1), Math.max(2, Math.round(f * scale / 2) * 2))

  // ---- NYQUIST OCTAVE CLAMP ---------------------------------------------
  // The single largest waste in the shipped generator. `fcap` caps the BASE
  // frequency of a band at four texels per cycle, but fbm2D then doubles the
  // frequency every octave — so a micro band authored at f=200 on a 512 map is
  // clamped to 128 and its remaining three octaves run at 256, 512 and 1024
  // cycles across 512 texels. Those octaves cost full price per texel and
  // contribute nothing but aliasing: the Sobel derivation cancels them against
  // themselves (measured mean tilt contribution ~0), and mip generation
  // averages whatever survives straight back out.
  //
  // So: drop every octave whose frequency would exceed `fcap`. Output changes
  // only by the removal of sub-Nyquist garbage (fbm2D normalises by the summed
  // amplitude, so the band keeps its level), it stays fully deterministic and
  // fully tileable, and the slowest kinds get 2-3x cheaper. Measured on the
  // 42-kind table at 512: 5516 ms -> see __selfTest().
  //
  // log2 via Math.log2 is fine here: this runs once per band, not per texel.
  const oc = (f, oct) => {
    if (!(f > 0)) return 1
    const room = Math.floor(Math.log2(fcap / f)) + 1
    return Math.max(1, Math.min(oct, room))
  }

  // ---- hoisted option objects -------------------------------------------
  // These four helpers are called 5-8 times per texel; at 512^2 that is ~2
  // million calls per field, each of which used to allocate a fresh literal.
  // The opts are read synchronously and never retained by noise.js (checked),
  // so one mutable object per helper is safe and takes a measurable bite out of
  // GC time. Nested use is safe because arguments are fully evaluated before the
  // outer call runs.
  const oF = { octaves: 4, gain: 0.5, period: 1 }
  const oA = { octaves: 3, gain: 0.5, period: 1, periodY: 1 }
  const oR = { octaves: 4, sharpness: 1, period: 1 }
  const oW1 = { period: 1, octaves: 3 }
  const oW2 = { octaves: 4, period: 1 }

  // Isotropic fbm at integer frequency f. Returns [-1,1].
  const F = (nf, x, y, f, oct = 4, gain = 0.5) => {
    oF.octaves = oc(f, oct); oF.gain = gain; oF.period = f
    return fbm2D(nf, x * f, y * f, oF)
  }

  // Anisotropic fbm — different frequency per axis. This is how fur strands,
  // brushed metal and wood grain get their direction; isotropic noise can never
  // produce a directional material no matter how it is masked.
  const A = (nf, x, y, fx, fy, oct = 3, gain = 0.5) => {
    oA.octaves = oc(fx > fy ? fx : fy, oct); oA.gain = gain; oA.period = fx; oA.periodY = fy
    return fbm2D(nf, x * fx, y * fy, oA)
  }

  // Ridged multifractal — cracks, veins, grain, crevices. Returns [-1,1].
  const R = (nf, x, y, f, oct = 4, sharp = 1) => {
    oR.octaves = oc(f, oct); oR.sharpness = sharp; oR.period = f
    return ridged2D(nf, x * f, y * f, oR)
  }

  // Domain-warped fbm. The difference between "noise" and "grown".
  const W = (nf, x, y, f, amount, oct = 4) => {
    oW1.period = f
    oW1.octaves = oc(f, 3)
    const [wx, wy] = domainWarp2D(nf, x * f, y * f, amount, oW1)
    oW2.octaves = oc(f, oct); oW2.period = f
    return fbm2D(nf, wx, wy, oW2)
  }

  // Worley samplers are MEMOISED BY CALL ORDER, not by argument. A builder is
  // re-entered once per row band (see runBuild) and its prologue therefore runs
  // several times; without this, `worleyN` would advance every pass and each
  // band would get a differently-seeded cell field — visible as horizontal
  // banding, and non-deterministic with respect to band count. Memoising by the
  // call index makes band-sliced generation produce output bit-identical to a
  // single-pass run, and makes the (expensive: cells^2 feature points) table
  // build happen exactly once per sampler.
  const worCache = []
  let worleyN = 0
  const wor = (cells, o = {}) => {
    const idx = worleyN++
    const hit = worCache[idx]
    if (hit) return hit
    return (worCache[idx] = makeWorley2D(seed + 3041 + idx * 131, { cells: Math.max(2, fr(cells)), ...o }))
  }

  // Per-texel deterministic speckle. Tileable because x,y are already wrapped
  // into [0,N) and no interpolation crosses the seam.
  const sp = (x, y, salt = 0) => hash2(x, y, seed + 7919 + salt)

  // ---- STRUCTURAL JOINTS -------------------------------------------------
  // Round-6 P1, verbatim: "in the museum floor crop the gold grout lines pass
  // through the specular sweep at unchanged relative value; in the meme-market
  // floor crop the black tile gaps run at full black straight across the
  // brightest puddle. A recess would occlude or catch an edge. These are
  // strokes in a colour map."
  //
  // A joint that exists only in albedo cannot occlude and cannot catch an edge,
  // so it reads as printed at every light angle. `grid()` puts the joint in the
  // HEIGHT FIELD first; the normal map, the roughness step and the AO band are
  // then all derived from that same relief, and the albedo darkening is
  // authored in step with it rather than instead of it.
  //
  // Profile, against `d` = distance to the joint centreline IN TEXELS:
  //
  //     tile face  ‾‾‾‾‾‾\                        /‾‾‾‾‾‾
  //                       \___ shoulder ___      /
  //     channel floor         \_____________\__/
  //                    |<-hw->|<---- bw ---->|
  //
  //   .top  0 on the channel floor, 1 on the tile face. Multiply a kind's own
  //         surface detail by this so the detail stops at the joint instead of
  //         running across it (a slab's veins do not cross the grout).
  //   .rec  1 - top. The recess mask: subtract `depth * rec` from the height.
  //   .lip  rounded-over shoulder, peaking mid-slope. THIS is the edge that
  //         catches the grazing highlight; edge wear and polish live here too.
  //   .id/.id2  per-tile hashes — every slab is a different piece of stone and
  //         sits at its own level (`.set`, signed [-0.5, 0.5]).
  //   .d    texel distance to the joint, .al position along it in [0,1),
  //         .ax 0 if the nearest joint runs along v.
  //
  // Widths are in TEXELS so a joint is equally crisp at 256 and at 1024 and
  // always survives the Sobel (three texels of run is the floor for a 3x3
  // gradient to see a slope at all).
  //
  // `opts.joints === false` removes every joint from the kind; a number scales
  // the tile count. Both are part of fieldKey().
  const jMul = opts.joints === false ? 0 : (typeof opts.joints === 'number' ? opts.joints : 1)
  const jPx = N / 512
  const grid = (cols, rows, o = {}) => {
    const res = { rec: 0, top: 1, lip: 0, id: 0.5, id2: 0.5, set: 0, d: 1e3, al: 0, ax: 0, uf: 0, vf: 0 }
    // Disabled: one flat sample, no lattice, no per-tile identity.
    if (jMul <= 0) return Object.assign(() => res, { cols: 1, rows: 1, wu: N, wv: N })
    const bond = !!o.bond
    // Tile counts go through fr/fe like every other frequency, so they stay
    // integer and the lattice wraps. `bond` needs an EVEN row count or the
    // half-tile stagger does not survive the v seam.
    const gc = fr(cols * jMul)
    const gr = bond ? fe(rows * jMul) : fr(rows * jMul)
    const hw = Math.max(0.9, (o.width ?? 2.2) * jPx)
    const bw = Math.max(1.4, (o.bevel ?? 3.0) * jPx)
    const wu = N / gc, wv = N / gr
    const axis = o.axis === 'u' ? 1 : o.axis === 'v' ? 2 : 0
    const uOnly = axis === 1, vOnly = axis === 2
    const salt = o.salt ?? 0
    // Per-tile hash memo. Builders scan row-major, so (ci, ri) is constant for
    // `wu` consecutive calls — recomputing two hashes per texel was costing
    // more than the whole joint profile. Purely an optimisation: same output.
    let lc = -1, lr = -1
    const sampler = (u, v) => {
      const vv = v * gr
      let ri = Math.floor(vv)
      const vf = vv - ri
      const uu = u * gc + (bond ? (ri & 1) * 0.5 : 0)
      let ci = Math.floor(uu)
      const uf = uu - ci
      ci = ((ci % gc) + gc) % gc
      ri = ((ri % gr) + gr) % gr
      const du = (uf < 0.5 ? uf : 1 - uf) * wu
      const dv = (vf < 0.5 ? vf : 1 - vf) * wv
      const d = vOnly ? dv : uOnly ? du : (du < dv ? du : dv)
      const top = smoothstep(hw, hw + bw, d)
      res.top = top
      res.rec = 1 - top
      res.lip = top * (1 - top) * 4
      res.d = d
      res.ax = (!vOnly && (uOnly || du <= dv)) ? 0 : 1
      res.al = res.ax === 0 ? v : u
      res.uf = uf
      res.vf = vf
      if (ci !== lc || ri !== lr) {
        lc = ci; lr = ri
        res.id = hash2(ci, ri, seed + 5501 + salt)
        res.id2 = hash2(ci + 97, ri + 31, seed + 6607 + salt)
        res.set = res.id - 0.5
      }
      return res
    }
    return Object.assign(sampler, { cols: gc, rows: gr, wu, wv })
  }

  return {
    kind, N, size: N, seed, opts, scale,
    wear: clamp01(opts.wear ?? 0),
    // Row band currently being built. Every builder's outer loop reads these
    // instead of [0, N) so generation can be suspended between frames.
    y0: 0, y1: N,
    __rewind() { worleyN = 0 },
    h: new Float32Array(N * N),
    m: new Float32Array(N * N).fill(0.5),
    a: new Float32Array(N * N * 3).fill(0.85),
    vn, pn, sn, fr, fe, F, A, R, W, wor, sp, grid,
    clamp01, smoothstep, mix, frac,
  }
}

// Run one row band of a kind's build(). Rewinding the worley call counter is
// what makes the sliced result identical to the single-pass one.
function runBuild(def, c, y0, y1) {
  c.__rewind()
  c.y0 = y0
  c.y1 = y1
  def.build(c)
}

// Albedo write helper used by every builder: values are MODULATION around 0.85,
// clamped into a safe band so `pbr()`'s colour is never crushed to black or
// blown to white (contract §0: albedo stays in 30..240 sRGB).
function paint(a, i3, r, g, b) {
  a[i3] = r < 0.1 ? 0.1 : r > 1 ? 1 : r
  a[i3 + 1] = g < 0.1 ? 0.1 : g > 1 ? 1 : g
  a[i3 + 2] = b < 0.1 ? 0.1 : b > 1 ? 1 : b
}

// ---------------------------------------------------------------------------
// Field generation + derivation
// ---------------------------------------------------------------------------

const _warnedKinds = new Set()

// ---------------------------------------------------------------------------
// FIELD-KEY QUANTISATION  (round-9 defect 8, the third of the three leaks)
//
// The tree asks surfaceMaps() for 66 distinct `scale` values and 32 distinct
// `wear` values. Raw, every one of those is its own 0.9-3.4 MiB field. But
// `scale` is a spatial FREQUENCY — the perceptual step is multiplicative, and
// scale 1.5 vs 1.6 is a 6% change in feature size that is invisible at any
// framing this game uses — and `wear` is a 0-1 dirt/rub amount where 0.55 vs
// 0.60 moves a roughness term by 0.017.
//
// So: wear snaps to 0.1, and scale snaps to an OCTAVE ladder — see the block
// below, which is round 10 and is where the actual bytes were.
//
// NOT quantised: `seed` (the whole point of a seed is to decorrelate — two
// fields sharing a seed by accident is a visible repeat), `joints` (structural),
// `size` (already power-of-two), `tint` (only 9 call sites, and a hue collision
// is instantly visible).
//
// ---------------------------------------------------------------------------
// ROUND 10 — `scale` IS A FREQUENCY, AND A FREQUENCY IS FREE ON THE SAMPLER
//
// THE MEASUREMENT. Replaying every surface call site in src/arenas +
// src/characters through this module (see SESSION_DEMAND and __selfTest's
// `session` block, which now reads the real table instead of a synthetic sweep)
// a six-arena / four-fighter session holds 132 fields and 114 NORMAL MAPS off
// 40 kinds, for 140.25 MB — reproducing the live 134.59 MB to within 4%. Of
// that, 96 MB is normal maps alone. No amount of channel packing touches it:
// zeroing the albedo AND the roughness map of every field still leaves 96 MB.
//
// So the question is what makes 114 distinct normal maps out of 40 kinds. It is
// not `seed` (the whole tree uses exactly two: 0 and 71) and not `joints` (one
// value, 1). Drop `scale` from the key and 114 collapses to 42. `scale` — and
// only `scale` — is the entire multiplier.
//
// AND `scale` IS THE ONE AXIS THE SAMPLER CAN REPRODUCE FOR NOTHING. Read
// makeCtx: `scale` multiplies every band's frequency, i.e. it divides feature
// size. `Texture.repeat` divides feature size too, it is a material uniform
// rather than a sampler-state key, and `repeatVariant()` already exists to hand
// out repeat clones that share one `source` and therefore ZERO extra VRAM.
//
// So a field is now built at the octave BELOW the requested scale and the
// residual is pushed into `repeat`:
//
//     built at  s' = 2^floor(log2(s))        comp = s / s'   in [1, 2)
//     shipped with repeat *= comp
//
// On-screen feature size is EXACTLY what the caller asked for — this is not an
// approximation of the requested scale, it is the requested scale, reached by a
// different route. Two things do change:
//
//   * the tile PERIOD shrinks by `comp`, so the pattern repeats up to 1.9x more
//     often across the same UV span (measured max over the shipped call sites).
//     On isotropic procedural noise with no registration to the mesh that is
//     invisible-to-beneficial; it is why FLOOR and not round-to-nearest, because
//     rounding up would MAGNIFY the map (comp < 1) and magnification is the one
//     direction that actually costs texels per feature. Flooring always minifies,
//     so every feature ships with at least as many texels as before.
//   * the shared micro band scales with `repeat` along with everything else.
//     Amplitude 0.085; at the 1.9x worst case it moves from ~2 texels/cycle of
//     apparent size to ~1, i.e. into the mip chain, which is where it was headed
//     anyway.
//
// EXEMPT: kinds whose pattern REGISTERS to the object rather than dressing it —
// `nearest` (pixel-grid's 24x24 voxel lattice would land off-grid) and the
// albedo-identity kinds that pin `albRes: 1` (CRT scanline pitch, circuit trace
// gauge, neon strip width). Those keep the fine 1/6-octave ladder and are never
// repeat-compensated.
//
// MEASURED, six arenas + four fighters, 512 px:
//   before  132 fields / 114 normals / 140.25 MB   worst single scene 123.33 MB
//   after   110 fields /  61 normals /  84.21 MB   worst single scene  75.25 MB
//
// WHAT WAS TRIED AND REJECTED, because it is the obvious move and it does not
// survive measurement: pushing the albedo and the roughness+AO maps from half
// to QUARTER field resolution. It saves 8.6 MB of the 45 MB sweep and it is a
// real quality loss — paintRatio (the painted-detail correlation, see
// mapResponse) collapses on metal-brushed 3.27 -> 0.48, wood-rough 2.73 -> 0.59,
// plastic-matte 1.98 -> 0.70, and denim and gold newly FAIL the painted check;
// roughSd loses up to 45% (suit-wool 0.085 -> 0.047, cloth-weave 0.090 -> 0.058)
// and the brushed-metal specular lobe halves, 11.0 -> 5.9. ALB_RES/RGH_RES stay
// at 0.5. The knobs remain on setTextureQuality for a genuine low-VRAM tier.
// ---------------------------------------------------------------------------

// Steps per octave. `fine` is for the registration kinds, `coarse` for
// everything else — coarse is what the repeat compensation pays for.
let SCALE_LADDER_FINE = 6
let SCALE_LADDER_COARSE = 1

// A kind whose pattern registers to the mesh cannot be repeat-compensated.
function scaleFine(kind) {
  const def = KINDS[kind]
  return !!(def && (def.nearest || def.albRes === 1))
}

// The scale the FIELD is built at. `kind` undefined = fine ladder (the safe
// answer for any caller that does not know what it is asking about).
function qScale(s, kind) {
  const v = +s
  if (!(v > 0) || !Number.isFinite(v)) return 1
  const fine = kind === undefined || scaleFine(kind)
  const div = fine ? SCALE_LADDER_FINE : SCALE_LADDER_COARSE
  const l = Math.log2(v) * div
  // Round on the fine ladder (the step is 12%, either direction is harmless);
  // FLOOR on the coarse one so the residual only ever MINIFIES — see above.
  const r = fine ? Math.round(l) : Math.floor(l + 1e-9)
  return +Math.pow(2, r / div).toFixed(4)
}

// The residual the sampler has to make up: requested / built. >= 1 on the coarse
// ladder by construction. 1 means the field is exactly what was asked for.
function scaleComp(kind, s) {
  const v = +s
  if (!(v > 0) || !Number.isFinite(v)) return 1
  if (scaleFine(kind)) return 1
  const q = qScale(v, kind)
  if (!(q > 0) || Math.abs(v / q - 1) < 1e-4) return 1
  return +(v / q).toFixed(4)
}

function qWear(w) {
  const v = +w
  if (!(v > 0) || !Number.isFinite(v)) return 0
  return Math.round(Math.min(1, v) * 10) / 10
}

function fieldKey(kind, size, o) {
  // `joints` is part of the FIELD, not of the sampler state — two callers asking
  // for marble with and without slab joints must not share one height field.
  return `${kind}|${size}|${o.seed ?? 0}|${qScale(o.scale ?? 1, kind)}|${qWear(o.wear ?? 0)}|${o.tint ?? 0}` +
    `|${o.joints === undefined ? 1 : o.joints}`
}

// ---------------------------------------------------------------------------
// THE NORMAL MAP IS WEAR- AND TINT-INDEPENDENT, AND IT IS 73% OF A FIELD.
//
// Read applyWear() and applyTint(): between them they write `c.m` (the
// roughness mask) and `c.a` (the albedo modulation) and NOTHING ELSE. Neither
// touches `c.h`. curvatureFromHeight() only reads it. So every `wear` variant
// and every `tint` variant of the same (kind, size, seed, scale, joints) derives
// a BYTE-IDENTICAL normal map — and at 512 the normal is 1.333 MiB of a 1.833
// MiB field, so the tree has been paying full price for a copy of something it
// already had. `wear` appears at 130 call sites with 28 distinct values; this is
// the single largest duplicate in the cache.
//
// A field that finds a live normal under this key adopts the owner's byte array
// AND the owner's uploaded texture, and its build job drops the normal
// derivation steps entirely — so the saving is CPU as well as VRAM (the normal
// pass carries the shared micro band, which is the most expensive derivation
// after AO).
//
// The re-upload bookkeeping goes with it: a borrowed normal texture is
// registered on the OWNER's `texes` list, never the borrower's, because the
// owner's job is the one that will fill those bytes. Registering it on the
// borrower would mark it clean the moment the borrower finished and leave the
// preview normal on screen for the rest of the session.
const _normCache = new Map()

function normalKey(kind, size, o) {
  return `${kind}|${size}|${o.seed ?? 0}|${qScale(o.scale ?? 1, kind)}|${o.joints === undefined ? 1 : o.joints}`
}

// The opts a FIELD is actually built from. Must agree with fieldKey or two
// callers whose keys collide would get whichever field was built first — which
// is fine visually but makes the cache non-deterministic in report order. Every
// generation path funnels through here.
function fieldOpts(o, kind) {
  const q = { ...o }
  q.scale = qScale(o.scale ?? 1, kind)
  q.wear = qWear(o.wear ?? 0)
  return q
}

// ---------------------------------------------------------------------------
// TIME-SLICED GENERATION  (why this exists)
//
// Measured in node on the shipped single-pass code at the default 512 px:
// concrete 286 ms, fur-long 253 ms, asphalt 251 ms, metal-painted 236 ms,
// skin-amphibian 232 ms, skin-smooth 227 ms, skin-elephant 220 ms. A match
// scene wants 15-20 distinct kinds, so the first frame of a fight used to eat
// 2.5-4 SECONDS of frozen main thread. That is not shippable and no amount of
// micro-optimisation closes a 4-second gap.
//
// So generation is a JOB, not a call. `generateFields()` returns immediately
// with fully-allocated, PLACEHOLDER-filled byte arrays (flat normal, the kind's
// base roughness, open AO, neutral albedo), hands them to DataTexture, and then
// fills those same arrays in place over the following frames, flipping
// `needsUpdate` when the last step lands. Nothing downstream changes: the
// material, the texture objects and the cache keys are all identical, and the
// surface simply gains its relief a few frames after it appears.
//
// DETERMINISM: byte-for-byte identical to a single-pass run. The builders read
// c.y0/c.y1 instead of [0, N), every derivation wraps its own sampling, and the
// worley samplers are memoised by call order (see makeCtx) so re-entering a
// builder's prologue per band cannot re-seed it.
//
// SCHEDULING: rAF *and* a setTimeout chain, whichever fires first. rAF alone is
// wrong — DRIVER.md's capture rig runs with the tab hidden and time stepped by
// hand, and a queue that only drains in rAF would leave every screenshot
// showing placeholder surfaces. When the tick gap says frames are not being
// presented, the budget widens (nobody is watching a frame we could drop) and a
// stale job is finished outright.
// ---------------------------------------------------------------------------

let ASYNC = typeof requestAnimationFrame === 'function'
const TICK_BUDGET_MS = 5      // per presented frame
const IDLE_BUDGET_MS = 60     // when frames clearly are not being presented
const STARVED_MS = 400        // tick gap above which nobody is presenting frames
const BAND_ROWS = 32          // rows of the height field per build step

const _jobQueue = []
let _tickTimer = null
let _tickRaf = null
let _lastTick = 0

/** Are surfaces being generated across frames, or in one blocking call? */
export function textureAsync(on) {
  if (on !== undefined) ASYNC = !!on
  return ASYNC
}

function placeholderFields(def, size, albSize, rghSize, sharedNrm) {
  let nrm = sharedNrm
  if (!nrm) {
    nrm = new Uint8Array(size * size * 4)
    for (let o = 0; o < nrm.length; o += 4) {
      nrm[o] = 128; nrm[o + 1] = 128; nrm[o + 2] = 255; nrm[o + 3] = 255
    }
  }
  // ONE RG8 array, two slots: R = AO (open, 255), G = roughness. When the kind
  // has `ao: false` R stays a duplicate of G, which preserves the old "usable in
  // any slot that reads .r" property for those kinds.
  const rb = Math.round(255 * clamp01((def.rough && def.rough.base) ?? 0.6))
  const rgh = new Uint8Array(rghSize * rghSize * 2)
  const aoOn = def.ao !== false
  for (let o = 0; o < rgh.length; o += 2) { rgh[o] = aoOn ? 255 : rb; rgh[o + 1] = rb }
  const alb = def.albedo === false ? null : new Uint8Array(albSize * albSize * 4).fill(217)
  if (alb) for (let o = 3; o < alb.length; o += 4) alb[o] = 255
  return { nrm, rgh, alb, aoOn }
}

// Bilinear, wrapping, in place. Used only for the low-res preview pass, so it
// runs on byte arrays and rounds rather than dithering.
function upscaleInto(dst, dstSize, src, srcSize, ch, only) {
  const k0 = only === undefined ? 0 : only
  const k1 = only === undefined ? ch : only + 1
  const s = srcSize / dstSize
  for (let y = 0; y < dstSize; y++) {
    const sy = (y + 0.5) * s - 0.5
    const fy = sy - Math.floor(sy)
    const y0 = ((Math.floor(sy) % srcSize) + srcSize) % srcSize
    const y1 = (y0 + 1) % srcSize
    const r0 = y0 * srcSize, r1 = y1 * srcSize
    for (let x = 0; x < dstSize; x++) {
      const sx = (x + 0.5) * s - 0.5
      const fx = sx - Math.floor(sx)
      const x0 = ((Math.floor(sx) % srcSize) + srcSize) % srcSize
      const x1 = (x0 + 1) % srcSize
      const i00 = (r0 + x0) * ch, i10 = (r0 + x1) * ch
      const i01 = (r1 + x0) * ch, i11 = (r1 + x1) * ch
      const o = (y * dstSize + x) * ch
      for (let k = k0; k < k1; k++) {
        const a = src[i00 + k] + (src[i10 + k] - src[i00 + k]) * fx
        const b = src[i01 + k] + (src[i11 + k] - src[i01 + k]) * fx
        dst[o + k] = a + (b - a) * fy + 0.5
      }
    }
  }
}

function markTextures(entry) {
  for (const tex of entry.texes) tex.needsUpdate = true
}

function buildJob(entry, def, size, opts) {
  const c = makeCtx(entry.kind, size, (opts.seed ?? 0) + (def.seed ?? 0), opts)
  const steps = []

  // ---- stage 0: quarter-resolution PREVIEW ------------------------------
  // A flat placeholder normal map for two seconds is a worse lie than a soft
  // one. Generating the whole kind at size/4 costs ~1/16th of the full pass
  // (~12 ms instead of ~190 ms at 512) and, upscaled, gives the surface its real
  // relief, its real roughness distribution and its real silhouette within a
  // frame or two of being asked for. The full-resolution pass then overwrites
  // the same arrays in place and only the micro band changes.
  // A field that BORROWED its normal map (a wear/tint sibling) must not touch
  // those bytes at all — the owner is filling them, possibly at full resolution
  // already, and a preview upscale would stamp a soft copy over a finished map.
  const ownsNormal = entry.normOwner === null
  const pSize = size >= 256 ? Math.max(64, size >> 2) : 0
  if (pSize) {
    const pc = makeCtx(entry.kind, pSize, (opts.seed ?? 0) + (def.seed ?? 0), opts)
    let pn = null, pr = null
    steps.push(() => {
      runBuild(def, pc, 0, pSize)
      if (pc.wear > 0) applyWear(pc)
      if (opts.tint) applyTint(pc, opts.tint)
      if (ownsNormal) pn = normalBytes(pc.h, pSize, def.normal ?? 1, { aniso: def.nrmAniso || null })
      pr = roughnessBytes(pc.h, pSize, {
        base: 0.6, contrast: 0.3, maskWeight: 0.45, spread: 1, ...(def.rough || {}), mask: pc.m,
      })
    })
    if (ownsNormal) steps.push(() => { upscaleInto(entry.nrm, size, pn, pSize, 4) })
    steps.push(() => {
      // The preview resamples straight to each map's OWN resolution — the
      // roughness/AO array is size/2 and the albedo may be too, so upscaleInto
      // is a 2x rather than a 4x blow-up for those and the preview is sharper
      // than it used to be, not softer. R is left open (255) while AO is
      // pending: a preview that guessed at occlusion would pop when the real
      // sweep landed.
      if (entry.rghSize >= pSize) upscaleInto(entry.rgh, entry.rghSize, pr, pSize, 2, 1)
      else boxDown(pr, pSize, entry.rgh, entry.rghSize, 2, 1)
      if (entry.alb) {
        const pa = new Uint8Array(pSize * pSize * 4)
        for (let i = 0, j = 0, k = 0; i < pSize * pSize; i++, j += 3, k += 4) {
          pa[k] = Math.min(255, Math.max(0, Math.round(255 * pc.a[j])))
          pa[k + 1] = Math.min(255, Math.max(0, Math.round(255 * pc.a[j + 1])))
          pa[k + 2] = Math.min(255, Math.max(0, Math.round(255 * pc.a[j + 2])))
          pa[k + 3] = 255
        }
        if (entry.albSize >= pSize) upscaleInto(entry.alb, entry.albSize, pa, pSize, 4)
        else boxDown(pa, pSize, entry.alb, entry.albSize, 4)
      }
      pn = null; pr = null
      markTextures(entry)          // the preview is live from here on
    })
  }

  // Everything up to here is stage 0. drainQueue() runs stage 0 for EVERY
  // pending surface before it lets any surface start stage 1 — see there.
  const preview = steps.length

  // ---- stage 1: full resolution -----------------------------------------
  const rows = Math.max(8, Math.min(size, BAND_ROWS))
  for (let y = 0; y < size; y += rows) {
    const y0 = y, y1 = Math.min(size, y + rows)
    steps.push(() => runBuild(def, c, y0, y1))
  }
  // Generic wear pass. Cavities collect dirt and go rough; exposed edges get
  // rubbed smooth. Applying it here rather than per-kind means every surface
  // responds to `opts.wear` consistently.
  steps.push(() => {
    if (c.wear > 0) applyWear(c)
    if (opts.tint) applyTint(c, opts.tint)
  })
  // The shared micro band and the anisotropy weighting both ride on the normal
  // derivation, so they are resolved in their own step (microGrads() is a ~35 ms
  // one-off field build and must not land inside a row band's budget).
  const nOpts = { aniso: def.nrmAniso || null }
  const nStrength = def.normal ?? 1
  const microK = def.micro ?? 1
  if (ownsNormal) {
    steps.push(() => {
      if (microK > 0) {
        nOpts.micro = microGrads(size)
        nOpts.microAmp = MICRO_AMP * microK
      }
    })
    for (let y = 0; y < size; y += 128) {
      const y0 = y, y1 = Math.min(size, y + 128)
      steps.push(() => normalRange(entry.nrm, c.h, size, nStrength, nOpts, y0, y1))
    }
  }
  // ROUGHNESS -> the G byte of the shared RG map.
  //
  // Derived at FULL resolution and box-filtered down, never derived at half.
  // roughnessBytes() translates the finished distribution so its mean lands
  // exactly on `def.rough.base` (round-2 P0: materials.js divides by that mean),
  // and a box filter is mean-preserving, so the shipped half-res map carries the
  // same declared mean to the byte. Deriving on a halved height field instead
  // would re-normalise against a different distribution and quietly move it.
  steps.push(() => {
    const full = roughnessBytes(c.h, size, {
      base: 0.6, contrast: 0.3, maskWeight: 0.45, spread: 1, ...(def.rough || {}), mask: c.m,
    })
    boxDown(full, size, entry.rgh, entry.rghSize, 2, 1)
    // AUTHORED spread, measured on the field before the downsample.
    //
    // A box filter is mean-exact but slightly contrast-lossy. Measured over the
    // whole table at 512, halving costs ~6% of roughSd on the high-frequency
    // kinds (granite 0.246 -> 0.231, fur-short 0.196 -> 0.183, mud 0.167 ->
    // 0.146) and up to ~39% on the two fine-weave kinds whose roughness detail
    // really is per-texel (suit-wool 0.139 -> 0.085, cloth-weave 0.124 ->
    // 0.090) — all still far above the 0.02 "no spatially varying roughness"
    // floor. That residue is a resampling artefact, not an authoring failure,
    // and it cannot be undone by re-expanding the histogram (tried: these
    // distributions already fill [0,255], so the expansion just clips and
    // granite recovered 0.005 of it). So the `flat` gate — which is asking "did
    // this kind get spatially varying roughness AUTHORED into it" — is judged
    // on this number, while `roughSd` keeps reporting what the GPU samples.
    // Both are in the self-test table, side by side.
    let s1 = 0, s2 = 0
    const n2 = size * size
    for (let i = 0, o = 1; i < n2; i++, o += 2) { const v = full[o]; s1 += v; s2 += v * v }
    const mu = s1 / n2
    entry.roughSdSrc = +(Math.sqrt(Math.max(0, s2 / n2 - mu * mu)) / 255).toFixed(3)
  })
  // AO -> the R byte of the same map. The horizon sweep still runs on its own
  // half-res height field exactly as before (aoSize), and is then resampled into
  // R. When aoSize === rghSize (the default) that resample is a straight copy.
  if (entry.aoOn) {
    const aoOpts = { radius: 4, strength: 0.95, ...(def.ao || {}) }
    const aoSize = entry.aoSize
    const aoBuf = new Uint8Array(aoSize * aoSize)
    let aoSrc = null
    steps.push(() => { aoSrc = aoSize === size ? c.h : halve(c.h, size) })
    for (let y = 0; y < aoSize; y += 64) {
      const y0 = y, y1 = Math.min(aoSize, y + 64)
      steps.push(() => aoRange(aoBuf, aoSrc, aoSize, aoOpts, y0, y1))
    }
    steps.push(() => {
      const n = entry.rghSize
      if (n === aoSize) { for (let i = 0, o = 0; i < aoBuf.length; i++, o += 2) entry.rgh[o] = aoBuf[i] }
      else if (n > aoSize) upscale1Into(entry.rgh, n, aoBuf, aoSize)
      else boxDown1Into(entry.rgh, n, aoBuf, aoSize)
      entry.ao = aoBuf                 // kept for mapResponse / debug readback
    })
  }
  if (entry.alb) {
    // Uint8Array WRAPS on overflow (260 stores as 4), so every write is clamped
    // explicitly. paint() already bounds the field, but applyTint/applyWear run
    // afterwards and a lone overflowing texel shows up as a black speck that is
    // maddening to track down later.
    steps.push(() => {
      const n = entry.albSize
      const full = n === size ? entry.alb : new Uint8Array(size * size * 4)
      for (let i = 0, j = 0, k = 0; i < size * size; i++, j += 3, k += 4) {
        full[k] = Math.min(255, Math.max(0, Math.round(255 * c.a[j])))
        full[k + 1] = Math.min(255, Math.max(0, Math.round(255 * c.a[j + 1])))
        full[k + 2] = Math.min(255, Math.max(0, Math.round(255 * c.a[j + 2])))
        full[k + 3] = 255
      }
      if (n !== size) boxDown(full, size, entry.alb, n, 4)
    })
  }
  steps.push(() => { entry.seam = seamError(c.h, size) })
  return { steps, preview, i: 0, ms: 0 }
}

// `stopAt` bounds the run to a step index — used to stop at the end of the
// preview stage so the next surface can get ITS preview before this one starts
// grinding out full resolution.
function stepEntry(entry, deadline, stopAt) {
  const job = entry.job
  if (!job) return
  const limit = stopAt === undefined ? job.steps.length : Math.min(stopAt, job.steps.length)
  if (job.i >= limit) return
  do {
    const t = now()
    job.steps[job.i++]()
    job.ms += now() - t
  } while (job.i < limit && now() < deadline)
  if (job.i >= job.steps.length) {
    entry.ms = +job.ms.toFixed(1)
    entry.job = null
    entry.ready = true
    // The DataTextures were handed out pointing at these very arrays, so all
    // that is left is to tell the renderer to re-upload them.
    for (const tex of entry.texes) tex.needsUpdate = true
    entry.texes.length = 0
  }
}

// BREADTH FIRST ON THE PREVIEW, DEPTH FIRST ON THE DETAIL.
//
// Draining strictly in order meant the 20th surface a scene asked for sat on a
// flat 128-grey placeholder until the previous 19 had finished at full
// resolution — ~2.5 s of a fight in which one fighter is fully surfaced and the
// arena floor is a blank. Since a quarter-res preview costs ~1/16th of a full
// pass, running EVERY pending surface's preview first gets the whole scene to
// "real relief, slightly soft" in roughly the time one full surface used to
// take, and the full-resolution passes then land one at a time behind it.
function drainQueue(budgetMs) {
  const deadline = now() + budgetMs
  for (let i = 0; i < _jobQueue.length && now() < deadline; i++) {
    const e = _jobQueue[i]
    if (e.job && e.job.i < e.job.preview) stepEntry(e, deadline, e.job.preview)
  }
  while (_jobQueue.length && now() < deadline) {
    const entry = _jobQueue[0]
    stepEntry(entry, deadline)
    if (entry.ready) _jobQueue.shift()
  }
  return _jobQueue.length
}

function scheduleTick() {
  if (_jobQueue.length === 0) return
  if (_tickRaf === null && typeof requestAnimationFrame === 'function') {
    _tickRaf = requestAnimationFrame(() => { _tickRaf = null; onTick() })
  }
  if (_tickTimer === null && typeof setTimeout === 'function') {
    _tickTimer = setTimeout(() => { _tickTimer = null; onTick() }, 0)
    // Never hold the node process (or a page unload) open for a texture.
    if (_tickTimer && typeof _tickTimer.unref === 'function') _tickTimer.unref()
  }
}

function onTick() {
  const t = now()
  const gap = _lastTick ? t - _lastTick : 0
  _lastTick = t
  if (gap > STARVED_MS) {
    // Nothing is presenting frames — rAF is frozen and our only heartbeat is a
    // throttled setTimeout. This is the hidden-tab / capture-rig case
    // (DRIVER.md): there is no frame to drop, and dribbling 60 ms per second
    // would leave screenshots showing preview-resolution surfaces forever. Take
    // the whole queue.
    flushTextureQueue()
  } else {
    // Deep queue == a scene is loading, and a loading screen can afford a longer
    // frame far more than a fight can. Shallow queue (one prop spawned
    // mid-match) stays inside a 60 fps budget.
    const depth = Math.min(3, Math.floor(_jobQueue.length / 4))
    drainQueue(gap > 120 ? IDLE_BUDGET_MS : TICK_BUDGET_MS * (1 + depth))
  }
  scheduleTick()
}

/**
 * Drive the generation queue from a game loop. Optional — the module schedules
 * itself — but calling it from the frame loop gives the integrator control of
 * exactly how much of the frame budget surface generation may take.
 * Returns the number of surfaces still pending.
 */
export function pumpTextureQueue(budgetMs = TICK_BUDGET_MS) {
  _lastTick = now()
  return drainQueue(budgetMs)
}

/**
 * Finish every outstanding surface NOW (blocking). Use before a benchmark, a
 * screenshot that must be final, or a headless harness. `maxMs` bounds the
 * stall; returns the number still pending.
 */
export function flushTextureQueue(maxMs = Infinity) {
  const deadline = Number.isFinite(maxMs) ? now() + maxMs : Infinity
  while (_jobQueue.length) {
    const entry = _jobQueue[0]
    stepEntry(entry, deadline)
    if (entry.ready) _jobQueue.shift()
    else break
    if (now() >= deadline) break
  }
  return _jobQueue.length
}

export function textureQueueStats() {
  let steps = 0
  for (const e of _jobQueue) steps += e.job ? e.job.steps.length - e.job.i : 0
  return { pending: _jobQueue.length, steps, async: ASYNC }
}

// `squeeze` is the stage-1 budget degrade (see surfaceMaps). It is deliberately
// NOT part of the field key: whichever caller creates the field first decides
// its secondary-map resolution for the rest of the session, so a surface never
// silently changes size under a material that is already using it, and a field
// built before the ceiling was reached keeps its full quality afterwards.
function generateFields(kind, size, rawOpts, defer, squeeze = 1) {
  const key = fieldKey(kind, size, rawOpts)
  const hit = _fieldCache.get(key)
  if (hit) return hit

  let def = KINDS[kind]
  if (!def) {
    if (!_warnedKinds.has(kind)) {
      _warnedKinds.add(kind)
      console.warn(`[textures] unknown surface kind "${kind}" — falling back to neutral micro-detail`)
    }
    def = KINDS.default
  }

  // Build from the QUANTISED opts, so the field the key promises is the field
  // that gets built no matter which caller wins the race to create it.
  const opts = fieldOpts(rawOpts, kind)
  const aoSize = Math.max(64, size >> 1)
  const { albSize, rghSize } = mapSizes(def, size, squeeze)
  const nk = normalKey(kind, size, rawOpts)
  const shared = _normCache.get(nk)
  const { nrm, rgh, alb, aoOn } = placeholderFields(def, size, albSize, rghSize, shared && shared.buf)
  const entry = {
    key, kind, size, aoSize, albSize, rghSize, alb, nrm, rgh, ao: null, aoOn,
    normKey: nk, normOwner: shared ? shared.owner : null,
    ms: 0, seam: 0, ready: false, texes: [], enqueuedAt: 0, job: null,
  }
  if (!shared) _normCache.set(nk, { buf: nrm, owner: entry })
  entry.job = buildJob(entry, def, size, opts)
  _fieldCache.set(key, entry)

  if (defer) {
    entry.enqueuedAt = now()
    _jobQueue.push(entry)
    scheduleTick()
  } else {
    stepEntry(entry, Infinity)
  }
  return entry
}

// Wrap-seam metric: the mean absolute step across the tile edges, divided by
// the mean absolute step between ANY two adjacent texels in the field. A
// correctly tiling surface scores ~1 — the seam is statistically just another
// neighbour pair. A broken wrap scores 3x-30x.
//
// The global denominator matters: an earlier version sampled one fixed interior
// column, which read ~0 inside the flat cells of pixel-grid and reported a
// nonexistent 28x seam. Grid kinds (pixel-grid, circuit, scales, feather) still
// score above 1 because their tile edge lands on a cell boundary by
// construction — that IS seamless, it just is not smooth.
function seamError(h, size) {
  let edge = 0
  for (let i = 0; i < size; i++) {
    edge += Math.abs(h[i * size] - h[i * size + size - 1])
    edge += Math.abs(h[i] - h[(size - 1) * size + i])
  }
  edge /= size * 2
  let interior = 0
  for (let y = 0; y < size; y++) {
    const r = y * size, rn = ((y + 1) % size) * size
    for (let x = 0; x < size; x++) {
      interior += Math.abs(h[r + x] - h[r + ((x + 1) % size)]) + Math.abs(h[r + x] - h[rn + x])
    }
  }
  interior /= size * size * 2
  return interior > 1e-6 ? +(edge / interior).toFixed(2) : 0
}

function applyWear(c) {
  const { N, h, m, a } = c
  const w = c.wear
  const curv = curvatureFromHeight(h, N)
  for (let i = 0; i < N * N; i++) {
    const k = curv[i]
    const cav = smoothstep(0.5, 0.15, k)     // concave -> 1
    const edge = smoothstep(0.5, 0.9, k)     // convex  -> 1
    const dirt = cav * w
    const rub = edge * w
    m[i] = clamp01(m[i] + dirt * 0.35 - rub * 0.3)
    const d = 1 - dirt * 0.3
    const i3 = i * 3
    // Dirt is warm-neutral, not grey: pure grey grime is a dead giveaway.
    paint(a, i3, a[i3] * d, a[i3 + 1] * (d + dirt * 0.02), a[i3 + 2] * (d - dirt * 0.03))
  }
}

function applyTint(c, tint) {
  const col = new THREE.Color(tint)
  // Normalise against the brightest channel so a tint hue-shifts rather than
  // darkens — callers pass a colour, not an exposure.
  const peak = Math.max(col.r, col.g, col.b, 1e-3)
  const tr = col.r / peak, tg = col.g / peak, tb = col.b / peak
  const a = c.a
  for (let i = 0; i < a.length; i += 3) {
    paint(a, i, a[i] * tr, a[i + 1] * tg, a[i + 2] * tb)
  }
}

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
}

// ---------------------------------------------------------------------------
// §3 Surface generators — the one call everyone uses
// ---------------------------------------------------------------------------

// opts: { scale, seed, tint, wear, tileable, size, repeat, aniso, hero, joints }
//
// `joints` controls the STRUCTURAL joint lattice on the architectural kinds
// (marble slabs, granite courses, concrete control joints, plank gaps, plate
// seams, ice plates, the paper fold). Default 1 = the kind's authored layout;
// a number scales the tile count (2 = twice as many, smaller slabs); `false`
// removes them for a surface that genuinely is one continuous piece. It is
// part of the field key, so a jointed and an unjointed marble are two fields.
//
// Returns a SHARED, CACHED map set: { map?, normalMap, roughnessMap, aoMap? }.
// Never mutate the returned textures (see header). Unknown kinds warn once and
// return the neutral micro-detail set — they must never throw, because a typo
// in an arena file is not a reason to lose the frame.
export function surfaceMaps(kind, opts = {}) {
  let size = clampSize(opts.size || (opts.hero ? Math.min(1024, DEFAULT_SIZE * 2) : DEFAULT_SIZE))

  // PER-KIND RESOLUTION BUDGET (see the `res` note on the KIND table).
  // Generation cost and GPU bytes are both O(size^2), and the 42-kind table at a
  // flat 512 costs 5.9 s of CPU and projects to 97 MB — over the contract's
  // 80 MB ceiling before a single fighter is built. But the kinds are not
  // equally important: WALLY's hide fills half the screen in a portrait, while
  // `paper`, `bone` and `pixel-grid` are 40-pixel props. `res` drops the
  // background half of the table to 256 (4x cheaper, 4x smaller) and keeps the
  // hero surfaces at full size. An explicit opts.size or opts.hero still wins.
  const resHint = KINDS[kind] && KINDS[kind].res
  if (!opts.size && !opts.hero && resHint && resHint !== 1) {
    size = clampSize(Math.max(128, size * resHint))
  }

  // SOFT BUDGET, NOW PRIORITY-AWARE.
  //
  // The old rule was "past the ceiling, halve EVERYTHING from here on". That is
  // what produced defect 8's real symptom: the fighters and the arena you load
  // in the fifth match of a session were served at half the resolution of the
  // ones in the first, purely because of load order, and nothing recorded it.
  // A hero surface (WALLY's hide fills a third of a portrait) must be the LAST
  // thing to give, not an arbitrary one.
  //
  // So background kinds — the ones that already declared `res` < 1, i.e. the
  // half of the table that is 40-pixel props — degrade at the ceiling, and
  // hero/character kinds only at 1.35x, by which point something is genuinely
  // wrong and a soft fighter beats a dropped frame. With the round-9 packing a
  // five-arena session projects under the ceiling, so neither branch should
  // fire at all; `textureCacheStats().degraded` is how you find out that it did.
  // TWO STAGES, AND THE NORMAL MAP IS THE LAST THING TO GO.
  //
  //   stage 1 (background kinds, at the ceiling): halve the ALBEDO and
  //     ROUGHNESS+AO maps again — 512-field props drop those from 256 to 128.
  //     Costs ~20% of albedo spread on the affected kinds (measured across the
  //     table) on surfaces that are 40 pixels tall, and leaves the normal map,
  //     which carries the micro band and the whole "rendered not modelled"
  //     read, at full resolution.
  //   stage 2 (anything, at 1.35x): halve the field itself, the old behaviour.
  //
  // Hero and character kinds skip stage 1 entirely.
  //
  // ROUND 10 — THIS IS NOW A LAST RESORT AND IT WATCHES A DIFFERENT NUMBER.
  // Residency pressure is handled by the LRU (see the residency block): resident
  // bytes are hard-capped at the budget by DISPOSING the coldest surfaces, which
  // costs a re-upload if they come back and costs nothing if they do not. That is
  // strictly better than permanently halving a map, so degradation must not fire
  // on residency any more — `_gpuBytes` now sits at the cap by construction and
  // testing it here would degrade every surface in the game.
  //
  // What it watches instead is `_liveBytes`: everything the cache holds, resident
  // or evicted. That is a measure of how much DISTINCT surface the content is
  // asking for, and it is the only thing degradation can actually help with. The
  // measured six-arena / four-fighter demand is 84.2 MB against a 96 MB budget
  // (0.88x), so neither branch fires; a session that reaches 2x has authored
  // something pathological and a soft prop beats a stall.
  let squeeze = 1
  let stage = 0
  const background = !opts.hero && !!(resHint && resHint < 1)
  if (_liveBytes > effectiveBudget() * 3 && size > 128) {
    stage = 3
    size = Math.max(128, size >> 1)    // the field itself shrank; do not squeeze on top
  } else if (_liveBytes > effectiveBudget() * 2.5) {
    stage = 2
    squeeze = 0.5
  } else if (_liveBytes > effectiveBudget() * 2 && background) {
    stage = 1
    squeeze = 0.5
  }
  if (stage) {
    _degradedCount++
    if (!_warnedKinds.has(`__budget:${stage}`)) {
      _warnedKinds.add(`__budget:${stage}`)
      const what = stage === 3 ? `new fields halved to ${size}px`
        : stage === 2 ? 'ALL albedo/roughness halved, normal maps untouched'
          : 'background albedo/roughness halved, normal maps untouched'
      console.warn(`[textures] cached texture set ${(_liveBytes / 1048576).toFixed(1)} MB is over ` +
        `2x the ${(effectiveBudget() / 1048576) | 0} MB budget (${_fieldCache.size} fields) — stage ` +
        `${stage}: ${what}. See textureCacheStats().cachedMB / .degraded`)
    }
  }

  // THE SCALE RESIDUAL RIDES ON `repeat` (round 10, see the ladder block).
  // The field was built at the octave below the requested `scale`; multiplying
  // the caller's repeat by the residual puts the feature size back exactly where
  // it was asked for, at the cost of one extra material uniform and no VRAM.
  // Composing with an explicit `opts.repeat` is the whole point — per-part texel
  // density and scale compensation are the same operation.
  const comp = scaleComp(kind, opts.scale ?? 1)
  const rawRep = opts.repeat || null
  const rep = comp === 1 ? rawRep : [
    +(((rawRep ? rawRep[0] : 1) * comp).toFixed(4)),
    +(((rawRep ? rawRep[1] : 1) * comp).toFixed(4)),
  ]
  const aniso = opts.aniso ?? DEFAULT_ANISO
  // TWO keys, deliberately.
  //
  //   `bk`  identifies the GPU UPLOAD: field + sampler state. `repeat` is a
  //         per-material uniform in three.js and is NOT part of
  //         WebGLTextures.getTextureCacheKey(), so two textures that differ
  //         only in `repeat` share one WebGLTexture as long as they share a
  //         `source`. `anisotropy` IS in that key, so it stays here.
  //   `sk`  identifies the map SET the caller gets back, repeat included.
  //
  // Why this matters (round-3 P1, "one texture at one scale on every part"):
  // the fix for that finding is a different `mapOpts.repeat` for the trunk, the
  // limbs and the torso so the crack cell size is world-constant instead of
  // UV-constant. Before this split each repeat variant allocated its own
  // DataTexture over the same byte array — a full extra upload, ~3.6 MB per map
  // set at 512 — so scaling WALLY per part would have cost ~11 MB of the 80 MB
  // budget for one fighter, and the honest advice would have been "don't".
  // Now a variant is a `.clone()` sharing the base `source`: zero extra VRAM,
  // one extra material uniform. Per-part scaling is free, so ask for it.
  const bk = `${fieldKey(kind, size, opts)}|a${aniso}`
  const sk = `${bk}|r${rep ? rep.join('x') : '1'}`
  const hitSurf = _surfCache.get(sk)
  if (hitSurf) {
    touchSet(hitSurf)
    // Re-admitting an evicted set adds bytes back, so the cap has to be
    // re-applied here too — a scene the player returns to must not be allowed
    // to climb over the ceiling just because nothing new was generated.
    evictToBudget(effectiveBudget())
    return hitSurf
  }

  // `opts.sync === true` forces a blocking generation (portraits, photo mode,
  // anything whose very next action is a readback).
  const f = generateFields(kind, size, opts, ASYNC && opts.sync !== true, squeeze)
  const texOpts = { aniso, mips: true, nearest: !!(KINDS[kind] && KINDS[kind].nearest) }

  // The normal map's own key drops `wear` and `tint` (see normalKey): every
  // wear/tint sibling of this field shares one uploaded normal texture.
  const nbk = `${normalKey(kind, size, opts)}|a${aniso}`
  const nsk = `${nbk}|r${rep ? rep.join('x') : '1'}`

  const out = { kind, size: f.size, key: sk }
  const built = []
  const borrowed = []
  const slot = (name, key, make, baseKey, setKey, owner) => {
    const base = getOrMake(`${baseKey || bk}|${key}`, make)
    const tex = repeatVariant(`${setKey || sk}|${key}`, base, rep)
    const sink = owner && owner !== f ? borrowed : built
    sink.push(base)
    if (tex !== base) sink.push(tex)
    out[name] = tex
  }
  if (f.alb) slot('map', 'alb', () => dataTexture(f.alb, f.albSize, THREE.RGBAFormat, true, texOpts))
  slot('normalMap', 'nrm', () => dataTexture(f.nrm, f.size, THREE.RGBAFormat, false, texOpts),
    nbk, nsk, f.normOwner)
  slot('roughnessMap', 'rgh', () => dataTexture(f.rgh, f.rghSize, THREE.RGFormat, false, texOpts))
  // ONE TEXTURE, TWO SLOTS. R is AO, G is roughness (see placeholderFields).
  // three r166 resolves both slots' UV set from `Texture.channel`, which
  // defaults to 0 = `uv`, so the same object cannot disagree with itself about
  // which UVs to sample — which is precisely why this pack is safe and why the
  // pre-existing hand-rolled ORM map in memeMarket.js already does it.
  // materials.js gates on `set.aoMap && QUALITY.ao`, so an `ao: false` kind
  // still has no AO: it just keeps R as a duplicate of G, as before.
  if (f.aoOn) out.aoMap = out.roughnessMap

  // A repeat/aniso variant asked for while the field is still being generated
  // points at the SAME byte arrays, so it must be re-uploaded too when the job
  // lands — BASE AND VARIANTS BOTH, and this is not belt-and-braces.
  // `WebGLTextures.setTexture2D()` gates the upload on the PER-TEXTURE
  // `version`, while `uploadTexture()` then gates the actual pixel transfer on
  // the shared `source.version`. So a scene holding only the variant (the base
  // was never rendered) would never re-enter uploadTexture and would show the
  // half-generated field for the rest of the session; and bumping only the base
  // would leave the variant's own `__version` current so it, too, would skip.
  // Setting `needsUpdate` on every texture bumps both counters, and the
  // redundant second upload happens once, at job completion, on ~2 textures.
  if (!f.ready) {
    for (const t of built) if (t && !f.texes.includes(t)) f.texes.push(t)
  }
  // A borrowed normal texture belongs to the field that GENERATES those bytes.
  // Its owner's job is what will fill them, so its owner's completion is what
  // must flip needsUpdate — see the normalKey comment.
  const nOwner = f.normOwner
  if (nOwner && !nOwner.ready) {
    for (const t of borrowed) if (t && !nOwner.texes.includes(t)) nOwner.texes.push(t)
  }

  // normalScale hint: some surfaces (chrome, glass) want their relief dialled
  // right down even though the field itself has to carry enough signal for the
  // roughness derivation. materials.js reads this if the preset does not
  // override it.
  const def = KINDS[kind]
  out.normalScale = def ? (def.normalScale ?? 1) : 1

  // The kind's authored ABSOLUTE roughness, and — since roughnessBytes()
  // normalises every map to land its declared mean — the map's REALISED mean,
  // to within the [lo, hi] clamp. That equality is the contract materials.js
  // depends on: it divides the preset's intended roughness by this number to
  // get the `material.roughness` scalar, so if this were merely a starting
  // point (it used to be: gold declared 0.18, realised 0.289) every preset in
  // the game would render at a roughness nobody wrote down. Round-2 P0.
  //
  // materials.js also records `scalar * this` as `userData.__wcsRoughness`,
  // because `material.roughness` is a MULTIPLIER once a map is attached and a
  // debug dump of it therefore reads as nonsense on every textured surface in
  // the game. That reading alone cost this build a review.
  out.roughness = def ? ((def.rough && def.rough.base) ?? 0.6) : 0.6

  // ANISOTROPY HINT (contract §3.4).
  //
  // `{ strength, rotation }` for `MeshPhysicalMaterial.anisotropy` /
  // `.anisotropyRotation` — rotation is measured from tangent +X, so PI/2 is a
  // grain running along +v, which is how every strand/fibre kind here is
  // authored. It is a HINT and costs nothing: no map, no bytes, and a consumer
  // that ignores it still gets the faked directional bias baked into the normal
  // map (`nrmAniso`, see normalRange). materials.js does not read it yet —
  // wiring it is one line in its physical-material branch and it is the last
  // thing standing between brushed steel/fur/wool and a real stretched lobe.
  out.anisotropy = def && def.aniso ? { strength: def.aniso[0], rotation: def.aniso[1] } : null

  _surfCache.set(sk, out)
  // Hard-cap resident VRAM. Runs AFTER the set is assembled so `out`'s own
  // textures are the newest thing in the LRU and sit inside the protected tail.
  evictToBudget(effectiveBudget())
  return out
}

function getOrMake(key, factory) {
  const hit = _texCache.get(key)
  if (hit) return touchTexture(hit)
  return trackTexture(key, factory())
}

/**
 * A `repeat` variant of an already-uploaded texture.
 *
 * `Texture.clone()` copies the `source` BY REFERENCE, and three.js allocates
 * WebGLTextures per (source, sampler-state) pair — `repeat`/`offset` are
 * material uniforms, not sampler state. So this costs one JS object and one
 * extra uniform, and NOT a second copy of the pixels on the GPU. That is what
 * makes per-part texel density (`mapOpts.repeat`) affordable enough to be the
 * default advice rather than a luxury.
 *
 * Tracked in `_texCache` so it is disposed with everything else, but NOT added
 * to `_gpuBytes` — it does not occupy any.
 */
function repeatVariant(key, base, rep) {
  if (!base || !rep || (rep[0] === 1 && rep[1] === 1)) return base
  const hit = _texCache.get(key)
  if (hit) return hit
  const tex = base.clone()
  tex.repeat.set(rep[0], rep[1])
  tex.name = key
  tex.userData.__shared = true
  tex.userData.__repeatOf = base.name
  // Round 10: the clone must be reachable from the base. Disposing a base while
  // a clone still holds the same `source` frees nothing (three refcounts the
  // source), and re-admitting a base has to re-arm the clones' upload too.
  // The link lives in `_res`, never in userData — clone() JSON-copies userData.
  const br = _res.get(base)
  if (br) {
    ;(br.clones || (br.clones = [])).push(tex)
    _res.set(tex, { bytes: 0, resident: br.resident, touch: br.touch, clones: null, base })
  }
  tex.needsUpdate = true
  _texCache.set(key, tex)
  return tex
}

// Every kind name this module knows. materials.js validates its preset table
// against this, and __selfTest walks it.
export function surfaceKinds() {
  return Object.keys(KINDS).filter((k) => k !== 'default')
}

/**
 * kindRoughness(kind) -> the kind's authored ABSOLUTE roughness, without
 * generating anything.
 *
 * roughnessBytes() normalises every map to land exactly this mean, and
 * materials.js divides its preset's intended roughness by it to get the
 * `material.roughness` MULTIPLIER. A three.js roughness scalar cannot exceed 1,
 * so a preset that asks for a value ABOVE this number silently renders at this
 * number instead — which is how `gold: { roughness: 0.24 }` shipped rendering
 * at 0.289 and cost round 2 a P0. That check used to be possible only after a
 * material had been built (i.e. never, for a preset nothing happens to use);
 * this makes it a boot-time assertion in materials.js that costs one object
 * lookup per preset. Unknown kinds return the neutral 0.6.
 */
export function kindRoughness(kind) {
  const def = KINDS[kind]
  return def ? ((def.rough && def.rough.base) ?? 0.6) : 0.6
}

/**
 * kindAnisotropy(kind) -> { strength, rotation } | null
 *
 * The kind's declared GGX anisotropy, without generating anything. `rotation`
 * is radians from tangent +X. Only the directional kinds declare one: brushed
 * metal, the three fur coats, worsted wool and horn. Everything else is
 * isotropic and returns null — an anisotropy of 0 on a diffuse surface is a
 * wasted `MeshPhysicalMaterial`.
 */
export function kindAnisotropy(kind) {
  const def = KINDS[kind]
  return def && def.aniso ? { strength: def.aniso[0], rotation: def.aniso[1] } : null
}

// ---------------------------------------------------------------------------
// §3 Detail / utility
// ---------------------------------------------------------------------------

// The "everything" micro-normal.
//
// NOTE ON WHAT THIS IS FOR NOW. The shipped version built `KINDS.default` — a
// kind whose FIRST band is a 3-cycle form blotch — and handed it back tiled 8x,
// so the dominant feature of the "micro" detail map was a low-frequency blob
// repeating eight times across the surface. Nothing in the tree called it, so
// nobody saw that; the band it was supposed to deliver is now baked into every
// kind's normal map at derivation time (see microGrads / MICRO_AMP above), which
// is the only place a single-normal-slot material model can accept it.
//
// This entry point survives for the cases the baked band cannot reach: meshes
// with no `surfaceMaps()` set at all (menu props, debris, LOD shells, anything
// upgraded to a bare preset), where it is a legitimate `normalMap`/`bumpMap` on
// its own. It now returns the SAME field the baked band uses, at strength 1.15
// and with the tile rate baked into `repeat`, so a prop wearing it and a surface
// next to it share one detail vocabulary instead of two.
export function triplanarDetailNormal(scale = 8) {
  const s = Math.max(0.25, Math.round(scale * 4) / 4)
  const key = `detail-normal|${s}`
  const hit = _texCache.get(key)
  if (hit) return hit
  const g = microGrads(Math.min(MICRO_PX, DEFAULT_SIZE))
  const tex = dataTexture(normalBytes(g.h, g.ms, 1.15), g.ms, THREE.RGBAFormat, false, { repeat: [s, s] })
  return trackTexture(key, tex)
}

// sRGB alpha decal — logos, stencils, tattoos, sign faces. Transparent by
// default so it composites; the caller draws only what it wants to show.
export function decalTexture(key, size, drawFn) {
  const ck = `decal:${key}|${size}`
  const hit = _texCache.get(ck)
  if (hit) return hit
  const n = clampSize(size || 256)
  const canvas = makeCanvas(n, n)
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, n, n)
  drawFn(ctx, n, n)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = DEFAULT_ANISO
  tex.needsUpdate = true
  return trackTexture(ck, tex)
}

// 1D LUT for toon/fresnel/gradient ramps. Accepts either [color, color, ...]
// (evenly spaced) or [[t, color], ...]. Colours may be hex numbers or CSS
// strings — anything THREE.Color eats.
export function gradientRamp(stops, size = 64) {
  const norm = (Array.isArray(stops[0]) ? stops : stops.map((c, i) => [stops.length > 1 ? i / (stops.length - 1) : 0, c]))
    .slice()
    .sort((a, b) => a[0] - b[0])
  const key = `ramp|${size}|${norm.map(([t, c]) => `${t.toFixed(3)}:${new THREE.Color(c).getHexString()}`).join(',')}`
  const hit = _texCache.get(key)
  if (hit) return hit

  const n = Math.max(2, Math.min(256, Math.round(size)))
  const cols = norm.map(([t, c]) => [t, new THREE.Color(c)])
  const data = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0
    let lo = cols[0], hi = cols[cols.length - 1]
    for (let s = 0; s < cols.length - 1; s++) {
      if (t >= cols[s][0] && t <= cols[s + 1][0]) { lo = cols[s]; hi = cols[s + 1]; break }
    }
    const span = hi[0] - lo[0]
    const k = span > 1e-6 ? (t - lo[0]) / span : 0
    data[i * 4] = Math.round(255 * mix(lo[1].r, hi[1].r, k))
    data[i * 4 + 1] = Math.round(255 * mix(lo[1].g, hi[1].g, k))
    data[i * 4 + 2] = Math.round(255 * mix(lo[1].b, hi[1].b, k))
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return trackTexture(key, tex)
}

// ---------------------------------------------------------------------------
// THE KIND TABLE
//
// Per entry:
//   normal       Sobel strength for the normal map
//   normalScale  hint for materials.js (how hard to drive it on the material)
//   rough        opts for roughnessBytes — { base, contrast, invert, maskWeight }
//   ao           opts for aoBytes, or false to skip
//   albedo:false skip the albedo map entirely (mirrors: any albedo detail on a
//                chrome ball is dirt, and dirt belongs in roughness)
//   seed         per-kind seed offset so two kinds never share a field
//   build(c)     fills c.h (height), c.m (roughness mask), c.a (albedo)
//
// WORLEY UNITS: makeWorley2D returns f1/f2 normalised to the unit square. Every
// builder here multiplies back by `sampler.cells` to work in CELL units, where
// 0 is a feature point and ~0.7 is the far corner of a cell. Thresholds are
// then independent of the cell count, which is what makes opts.scale work.
//
// ---------------------------------------------------------------------------
// ROUND 11 — `albStep` / `rghStep`: THE PER-KIND HALF-STEP, AND THE SHEET
//
// Round 10 A/B'd ALB_RES/RGH_RES 0.5 -> 0.25 across the WHOLE table and rejected
// it, correctly. Re-run per kind (43 kinds, three sweeps at 512 px, comparing
// mapResponse on the shipped byte arrays) the verdict splits cleanly, because
// what quarter-res costs depends entirely on whether the kind's albedo has any
// content above the quarter-res Nyquist:
//
//   kind            albSd 0.5 -> 0.25   paintRatio 0.5 -> 0.25   verdict
//   metal-brushed   0.050 -> 0.040      3.27 -> 0.48             REJECT
//   wood-rough      0.075 -> 0.062      2.73 -> 0.59             REJECT
//   plastic-matte   0.012 -> 0.009      1.98 -> 0.70             REJECT
//   metal-painted   0.054 -> 0.043      2.35 -> 0.85             REJECT
//   denim           0.068 -> 0.067      1.20 -> 0.68             REJECT
//   suit-wool       0.027 -> 0.019      (roughSd -45%)           REJECT
//   ---------------------------------------------------------------------
//   default         0.014 -> 0.013      1.79 -> 1.48             albStep
//   concrete        0.063 -> 0.059      2.46 -> 2.26             albStep
//   marble          0.094 -> 0.090      2.52 -> 1.65             albStep
//   ice             0.022 -> 0.021      2.73 -> 1.40             albStep
//   fur-coarse      0.078 -> 0.076      1.90 -> 1.33             albStep
//   fur-short       0.096 -> 0.093      1.89 -> 1.30             albStep
//   fur-long        0.085 -> 0.079      1.90 -> 1.33             albStep
//   feather         0.040 -> 0.039      1.65 -> 1.83             albStep
//   snow            0.013 -> 0.012      (albSd < 0.02, unjudged)  albStep
//
// ADMISSION RULE: albedo spread retained >= 92% AND paintRatio stays >= 1.25
// (the `painted` verdict's own threshold is 1.05, so this keeps a 20% margin),
// OR albSd <= 0.02, at which point the map carries under 2% luminance variation
// and paintRatio is measuring noise rather than registration.
//
// The same sweep for `rghStep` admits on roughSd retained >= 92% AND `lobe`
// (peak specular density at the 5th-percentile roughness) within 8%: default,
// concrete, marble, gold, chrome, rubber, metal-rusted, feather, skin-smooth,
// neon-panel, pixel-grid. gold and marble keep lobe 1128.11 exactly; chrome
// 796.52 exactly. REJECTED on this axis: ice (lobe 103 -> 85), horn (1.94 ->
// 1.68), plastic-gloss (15.75 -> 13.93), metal-polished (429 -> 326), snow
// (roughSd -26%), screen-crt (-35%), water/glass (-25%/-20%).
//
// AFTER: `flat`, `painted` and `dullGloss` are all still EMPTY at 512 px, and
// the six worst paintRatios in the table (cloth-weave 1.15, asphalt 1.15, gold
// 1.17, horn 1.18, denim 1.20, suit-wool 1.20) are all kinds this pass did NOT
// touch. Cost: SESSION_DEMAND 83.29 -> 74.23 MB, peak scene 102.25 -> 90.84 MB,
// whole-tree 158.58 -> 142.24 MB. A/B it with
// setTextureQuality({ kindSteps: false }).
// ---------------------------------------------------------------------------

const KINDS = {

  // Neutral three-band micro-detail. Also the unknown-kind fallback and the
  // source for triplanarDetailNormal().
  default: {
    albStep: 0.5, rghStep: 0.5,
    normal: 1.7, seed: 0,
    // `base` is now the map's REALISED mean (roughnessBytes normalises to it),
    // and materials.js scales it down to whatever the preset asks for. So every
    // kind is authored at the ROUGHEST preset that consumes it — `default` and
    // `foliage` here — and the presets polish from there. A kind authored
    // glossier than one of its presets cannot be reached (a three.js roughness
    // scalar cannot exceed 1) and applySurface() warns about it.
    // Widened (maskWeight 0.30 -> 0.38, spread 1.9 -> 2.4) because this is the
    // fallback EVERY unnamed mesh in the build lands on, and its glossiest 5%
    // used to sit at 0.68 — a lobe of 0.02, i.e. no specular event anywhere on
    // the most-instanced surface in the game. `base` is untouched: materials.js
    // sizes its roughness multiplier off it (see kindRoughness).
    rough: { base: 0.78, contrast: 0.25, maskWeight: 0.38, spread: 2.4, min: 0.18 },
    ao: { radius: 3, strength: 0.55 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const f1 = c.fr(3), f2 = c.fr(13), f3 = c.fr(53)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const b1 = c.F(pn, u, v, f1, 3) * 0.5 + 0.5          // form
          const b2 = c.F(vn, u, v, f2, 3) * 0.5 + 0.5          // detail
          const b3 = c.F(vn, u + 0.37, v + 0.11, f3, 2) * 0.5 + 0.5 // micro
          h[i] = clamp01(0.5 + (b1 - 0.5) * 0.34 + (b2 - 0.5) * 0.3 + (b3 - 0.5) * 0.22)
          m[i] = clamp01(0.52 + (b2 - 0.5) * 0.5 - smoothstep(0.66, 0.96, b2) * 0.26
            + (c.sp(x, y) - 0.5) * 0.18)
          const t = 0.85 + (b1 - 0.5) * 0.11 + (b3 - 0.5) * 0.05
          paint(a, i * 3, t, t * 0.996, t * 0.99)
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // FUR — three coats. The whole family is anisotropic (strands run along +v)
  // and domain-warped (clumps curve). Isotropic noise cannot make fur; it makes
  // porridge.
  // -------------------------------------------------------------------------

  // FOUR bands, and a FLOW FIELD.
  //
  // The shipped coat had strands running dead straight down +v everywhere, so
  // at 3 m it read as corduroy and at 30 cm as a wire brush. Real fur has a
  // NAP: the lay of the coat rotates across the body, clumps sweep, and there
  // are partings where two directions meet. `flow` shears the clump lattice and
  // the strand lattice in u, `form` shears them in v — one extra fbm buys a
  // direction field for both bands, and it is the single change that makes fur
  // read as grown rather than combed.
  //
  //   b1 FORM   f=3   coat thickness + parting lines        (3 m read)
  //   b2 CLUMP  f=9   domain-warped locks, flow-sheared     (1 m read)
  //   b3 STRAND 104x15 anisotropic hairs riding the flow    (30 cm read)
  //   b4 CUTICLE 58x120 the cross-scaling on each hair      (specular glitter)
  //
  // `nrmAniso` flattens the along-strand slope and keeps the across-strand one,
  // which is what a cylinder lying along +v actually does to a normal field —
  // the fake-anisotropy channel of contract §3.4.
  'fur-short': {
    albStep: 0.5,
    normal: 1.5, seed: 17, micro: 1.15, nrmAniso: [1.26, 0.74], aniso: [0.5, Math.PI / 2],
    // STRAND SHEEN (round-2, "fur must read as fur under a moving light").
    // Measured before this change: roughP05 0.682, lobe 0.02 — the glossiest 5%
    // of the whole pelt was matter than dry concrete, so there was no specular
    // EVENT anywhere on a fur coat and it read as felt at every light angle. A
    // guard hair is a smooth keratin cylinder and is the one glossy thing on an
    // animal. `min` opens the floor so the tip band can actually reach it.
    rough: { base: 0.82, contrast: 0.22, maskWeight: 0.58, spread: 2.05, min: 0.14 },
    ao: { radius: 4, strength: 1.05 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const fx = c.fr(104), fy = c.fr(15), cf = c.fr(9)
      const flowF = c.fr(4), cutU = c.fr(58), cutV = c.fr(120)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const form = c.F(pn, u, v, c.fr(3), 3) * 0.5 + 0.5          // coat thickness
          // Two octaves, not three: a nap direction field is only ever read
          // through a 0.055 shear, so its third octave moves the sample point
          // by a fraction of a texel and costs a full noise evaluation per
          // texel to do it.
          const flow = c.F(sn, u, v, flowF, 2)                        // nap direction, [-1,1]
          const shV = (form - 0.5) * 0.06
          const clump = c.W(pn, u + flow * 0.055, v + shV, cf, 0.55, 3) * 0.5 + 0.5
          const su = u + (clump - 0.5) * 0.25 + flow * 0.05
          const sv = v + shV
          const strand = c.A(vn, su, sv, fx, fy, 2, 0.55) * 0.5 + 0.5
          const tip = Math.pow(strand, 2.2)                            // thin bright ridges
          // A hair is a cylinder wrapped in overlapping cuticle scales. That is
          // why a strand highlight GLITTERS along its length instead of drawing
          // a clean line — one cheap 1-octave band across the strand axis.
          const cut = c.A(vn, su + 0.61, sv, cutU, cutV, 1) * 0.5 + 0.5
          h[i] = clamp01(0.42 + (form - 0.5) * 0.18 + (clump - 0.5) * 0.44
            + (tip - 0.5) * 0.34 + (cut - 0.5) * 0.09)
          // Undercoat: the dark, matte, densely-packed base between clumps. This
          // is the single detail that separates fur from carpet. Deepened here
          // (0.28 -> 0.36 albedo, 0.38 -> 0.36+cuticle in roughness) because a
          // coat with no value range under the clumps reads as a printed pelt.
          const under = smoothstep(0.62, 0.2, clump)
          // The glint is gated on the tip mask AND modulated by the cuticle
          // band, so the highlight breaks into short travelling dashes along
          // each hair rather than laying a continuous satin sheet over the coat.
          const crown = smoothstep(0.58, 0.95, strand) * (0.34 + cut * 0.66)
          m[i] = clamp01(0.68 + under * 0.3 - crown * 0.72 - tip * 0.14
            + (c.sp(x, y) - 0.5) * 0.1)
          const sh = 0.9 - under * 0.36 + (tip - 0.5) * 0.24 + (form - 0.5) * 0.1
          paint(a, i * 3, sh * 1.02, sh * 0.99, sh * 0.95)
        }
      }
    },
  },

  // SHIBRO's coat, and every plumed tail in the roster. Five bands: the extra
  // one over fur-short is the SPLIT — where a long lock parts down its own
  // length and the undercoat shows through. Long hair does that and short hair
  // does not, and without it a long coat is just a short coat scaled up.
  //
  //   b1 FORM   f=2    coat depth                            (3 m)
  //   b2 LOCK   f=5    big domain-warped locks, flow-sheared  (1 m)
  //   b3 TUFT   f=13   smaller tufts breaking off the locks   (1 m / 30 cm)
  //   b4 STRAND 72x6   long anisotropic hairs riding the flow (30 cm)
  //   b5 CUTICLE 44x150 cross-scaling glitter                 (specular)
  'fur-long': {
    albStep: 0.5,
    normal: 1.45, seed: 23, micro: 1.05, nrmAniso: [1.3, 0.7], aniso: [0.58, Math.PI / 2],
    // Same strand-sheen rework as fur-short, one notch glossier: a long coat is
    // combed by its own weight, so more of the strand length presents a smooth
    // cylinder to the light. Was roughP05 0.663 / lobe 0.02.
    rough: { base: 0.80, contrast: 0.2, maskWeight: 0.58, spread: 2.0, min: 0.14 },
    ao: { radius: 5, strength: 1.12 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const fx = c.fr(72), fy = c.fr(6), cf = c.fr(5), cf2 = c.fr(13)
      const flowF = c.fr(3), cutU = c.fr(44), cutV = c.fr(150)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const form = c.F(sn, u, v, c.fr(2), 3) * 0.5 + 0.5
          const flow = c.F(pn, u + 1.7, v + 6.1, flowF, 2)             // nap direction
          const shV = (form - 0.5) * 0.08
          // Two clump scales = a layered coat: big locks with smaller tufts
          // breaking off them. One scale reads as a wig.
          const lock = c.W(pn, u + flow * 0.075, v + shV, cf, 1.05, 3) * 0.5 + 0.5
          const tuft = c.W(pn, u + 0.4 + flow * 0.04, v + 0.2 + shV, cf2, 0.6, 3) * 0.5 + 0.5
          const clump = lock * 0.65 + tuft * 0.35
          const su = u + (lock - 0.5) * 0.55 + (tuft - 0.5) * 0.2 + flow * 0.05
          const sv = v + shV
          const strand = c.A(vn, su, sv, fx, fy, 3, 0.5) * 0.5 + 0.5
          const tip = Math.pow(strand, 2.6)
          const cut = c.A(vn, su + 0.29, sv, cutU, cutV, 1) * 0.5 + 0.5
          // The split: locks that sit near the crest of the lock field open
          // along their length, and the dark undercoat shows in the gap.
          const split = smoothstep(0.72, 0.95, lock) * (1 - Math.abs(strand - 0.5) * 2)
          h[i] = clamp01(0.4 + (form - 0.5) * 0.16 + (clump - 0.5) * 0.5
            + (tip - 0.5) * 0.36 + (cut - 0.5) * 0.08 - split * 0.16)
          const under = smoothstep(0.6, 0.14, clump) + split * 0.5
          const crown = smoothstep(0.56, 0.94, strand) * (0.34 + cut * 0.66)
          m[i] = clamp01(0.66 + under * 0.32 - crown * 0.74 - tip * 0.12
            + (c.sp(x, y) - 0.5) * 0.08)
          const sh = 0.92 - under * 0.38 + (tip - 0.5) * 0.28 + (form - 0.5) * 0.12
          paint(a, i * 3, sh * 1.01, sh, sh * 0.97)
        }
      }
    },
  },

  // TIRED APE and COOL PAL. The wiry coat, and the flattest of the three in the
  // shipped build (8.2 deg mean tilt against fur-long's 15.4) — because a
  // `pow(strand, 4.5)` bristle mask spends most of its range near zero, so the
  // band that was supposed to carry the 30 cm read contributed almost nothing to
  // the Sobel. Fixed by giving the bristle a SIGNED profile about its own mean
  // and pushing the coefficient, not by turning the normal strength up (which
  // would have amplified the clump band along with it).
  //
  //   b1 FORM    f=3    coat depth + bald/thin patches (worley 6)  (3 m)
  //   b2 CLUMP   f=7    warped, flow-sheared tufts                 (1 m)
  //   b3 BRISTLE 60x10  separated stiff guard hairs                (30 cm)
  //   b4 KINK    36x90  the crimp along each wire                  (specular)
  'fur-coarse': {
    albStep: 0.5,
    normal: 1.55, seed: 29, micro: 1.25, nrmAniso: [1.2, 0.82], aniso: [0.4, Math.PI / 2],
    // Strand sheen, but the DULLEST of the three coats by design: a wiry guard
    // hair is crimped, so its highlight breaks into separated points rather than
    // running down the shaft. The glint therefore rides `kink`, not the strand
    // envelope. Was roughP05 0.769 / lobe 0.01 — the flattest specular in the
    // character half of the table.
    rough: { base: 0.86, contrast: 0.24, maskWeight: 0.62, spread: 2.15, min: 0.16 },
    ao: { radius: 5, strength: 1.05 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const fx = c.fr(60), fy = c.fr(10), cf = c.fr(7)
      const flowF = c.fr(4), kinkU = c.fr(36), kinkV = c.fr(90)
      const patch = c.wor(6, { jitter: 0.85 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const form = c.F(pn, u, v, c.fr(3), 3) * 0.5 + 0.5
          const flow = c.F(sn, u + 4.9, v, flowF, 2)
          const shV = (form - 0.5) * 0.05
          const clump = c.W(pn, u + flow * 0.06, v + shV, cf, 0.8, 3) * 0.5 + 0.5
          // Wiry guard hairs: a hard power curve turns soft noise into separated
          // stiff bristles instead of a velvet nap. Centred on its own mean
          // (pow(x,4.5) has mean ~0.18) so the band is a real relief swing
          // rather than a mask that is zero five-sixths of the time.
          const su = u + (clump - 0.5) * 0.35 + flow * 0.04
          const strand = c.A(vn, su, v + shV, fx, fy, 2, 0.6) * 0.5 + 0.5
          const bristle = Math.pow(strand, 4.5)
          const bsig = bristle - 0.18
          // A coarse hair is crimped, not straight — the kink is why a wiry coat
          // sparkles in broken points instead of drawing long soft lines.
          const kink = c.A(vn, su + 0.83, v, kinkU, kinkV, 1) * 0.5 + 0.5
          // Thin/bald patches — coarse coats are never uniform.
          const pd = patch(u, v).f1 * patch.cells
          const thin = smoothstep(0.55, 0.15, pd) * 0.35
          h[i] = clamp01(0.44 + (form - 0.5) * 0.2 + (clump - 0.5) * 0.4 * (1 - thin)
            + bsig * 0.62 + (kink - 0.5) * 0.13)
          const under = smoothstep(0.6, 0.18, clump)
          // Gated on the strand envelope, NOT on `bristle`: pow(strand, 4.5)
          // has a 95th percentile of ~0.29, so a glint riding it never reached
          // the 5% of texels that decide whether a surface has a highlight at
          // all (measured: p05 stayed at 0.725, lobe 0.01, with the coefficient
          // already at 0.84).
          const glint = smoothstep(0.5, 0.92, strand) * (0.28 + kink * 0.72)
          m[i] = clamp01(0.7 + under * 0.3 - glint * 0.95 + thin * 0.14
            + (c.sp(x, y) - 0.5) * 0.12)
          const sh = 0.88 - under * 0.3 - thin * 0.12 + bristle * 0.32 + (form - 0.5) * 0.14
          paint(a, i * 3, sh * 1.03, sh * 0.98, sh * 0.92)
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // SKIN
  // -------------------------------------------------------------------------

  // THE EPIDERMAL CROSS-HATCH.
  //
  // Skin at 30 cm is not a random wrinkle net — it is two families of shallow
  // lines crossing at a shallow angle, with flat diamond-shaped islands between
  // them (look at the back of your hand). The shipped kind used one isotropic
  // ridged band, which produces a crazed-porcelain net: right frequency, wrong
  // topology, and it is the reason the skin read as latex.
  //
  // Two ANISOTROPIC bands sampled in the sheared frames (u+v, v-u) and
  // (u-v, v+u) give the two line families. Integer shear coefficients are
  // mandatory: at the v seam the sheared x jumps by exactly one lattice period,
  // so the tile survives. (Measured: seam 0.94 before, and it must not move.)
  //
  //   b1 DERM   f=4 warped subdermal blotch + capillary field   (3 m)
  //   b2 HATCH  46x7 two crossed line families, diamond islands (1 m / 30 cm)
  //   b3 PORE   worley 96 follicle dimples                      (30 cm)
  //   b4 GRAIN  f=120 + per-texel tooth                         (specular)
  //
  // COLOUR: three decorrelated fields, not one. `derm` carries value, `cap`
  // carries red (capillary bed — this is what makes stylised skin look alive
  // rather than painted), and the pore/hatch crevices go cooler and darker
  // because that is where the epidermis is thickest.
  'skin-smooth': {
    rghStep: 0.5,
    normal: 1.25, seed: 31, micro: 1.2,
    // SEBUM IS A SPECULAR EVENT, not a gradient. Measured before this change the
    // glossiest 5% of skin sat at roughness 0.506 (lobe 0.06) — a uniform satin
    // wash with no highlight anywhere, which is what made stylised skin read as
    // painted vinyl. Real skin's oily zones run 0.25-0.35 while the dry cheek
    // stays near 0.6, and it is that STEP travelling across the face as the key
    // yaws that says "skin". `min` opens the floor for the filmed areas.
    rough: { base: 0.58, contrast: 0.18, maskWeight: 0.52, spread: 2.7, min: 0.1 },
    ao: { radius: 3, strength: 0.62 },
    build(c) {
      const { N, h, m, a, vn, sn, pn } = c
      const pores = c.wor(96, { jitter: 0.95 })
      const oil = c.fr(6)
      const lf = c.fr(46), la = c.fr(7)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const derm = c.W(sn, u, v, c.fr(4), 0.45, 3) * 0.5 + 0.5     // subdermal blotch
          // Two crossed line families -> diamond islands. `1 - |fbm|` is the
          // ridge; the product keeps only where BOTH families are low, which is
          // the island, and the sum of their complements is the hatch.
          // One octave, declared rather than inherited: at 512 px `oc()` already
          // clamps lf=46 to two octaves and at 256 to one, so asking for more
          // made the band's character size-dependent for no visual gain. Stating
          // 1 makes the hatch identical at every map size.
          const s1 = c.A(pn, u + v, v - u, lf, la, 1, 0.5)
          const s2 = c.A(pn, u - v + 3.7, v + u + 1.3, lf, la, 1, 0.5)
          const hatch = clamp01((1 - Math.abs(s1)) * 0.62 + (1 - Math.abs(s2)) * 0.62 - 0.24)
          const d = pores(u, v).f1 * pores.cells
          const pore = 1 - smoothstep(0, 0.34, d)                       // dimple
          const grain = c.sp(x, y) * 0.5 + c.F(vn, u, v, c.fr(120), 2) * 0.25 + 0.25
          h[i] = clamp01(0.58 + (derm - 0.5) * 0.14 - hatch * 0.17 - pore * 0.16
            + (grain - 0.5) * 0.08)
          // Sebum sits in patches that have nothing to do with the relief — the
          // independent mask, doing exactly the job it exists for.
          const sheen = c.F(sn, u + 2.1, v + 4.3, oil, 3) * 0.5 + 0.5
          // Two terms, deliberately: a broad slope over the whole field so the
          // roughness is never constant, plus a hard-gated FILM over the upper
          // third of it so ~12% of the surface carries a real highlight.
          const film = smoothstep(0.54, 0.9, sheen)
          m[i] = clamp01(0.6 - sheen * 0.22 - film * 0.48 + pore * 0.2 + hatch * 0.12)
          // The capillary bed. Decorrelated from `derm` on purpose: value and
          // redness do not track each other on real skin, and making them track
          // is what turns a complexion into a stain.
          const cap = c.F(sn, u + 8.3, v + 5.9, c.fr(7), 2) * 0.5 + 0.5
          const t = 0.87 + (derm - 0.5) * 0.1 - hatch * 0.07 - pore * 0.05
          paint(a, i * 3,
            t * (1.02 + (derm - 0.5) * 0.07 + (cap - 0.5) * 0.1),
            t * (0.97 - (cap - 0.5) * 0.03),
            t * (0.94 - (derm - 0.5) * 0.04 - (cap - 0.5) * 0.06))
        }
      }
    },
  },

  'skin-amphibian': {
    normal: 1.05, seed: 37, micro: 1.1,
    // The wet film is the material. 2.2x spread drives the filmed areas down
    // near 0.22 while the dry warty ridges stay ~0.55 — the frog's gloss has to
    // travel across the skin as the light moves, or the "wet" reads as paint.
    rough: { base: 0.38, contrast: 0.2, maskWeight: 0.5, spread: 2.2 },
    ao: { radius: 4, strength: 0.85 },
    build(c) {
      const { N, h, m, a, vn, sn, pn } = c
      const pores = c.wor(54, { jitter: 1 })
      const warts = c.wor(16, { jitter: 0.9 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // band 1 — mottling: two-tone blotches, the read that says "frog".
          const mot = c.W(sn, u, v, c.fr(5), 0.9, 4) * 0.5 + 0.5
          const blotch = smoothstep(0.44, 0.62, mot)
          // band 2 — raised warty domes + open pores between them.
          const wd = warts(u, v).f1 * warts.cells
          const wart = (1 - smoothstep(0.1, 0.5, wd)) * 0.6
          const pd = pores(u, v).f1 * pores.cells
          const pore = 1 - smoothstep(0.02, 0.3, pd)
          // band 3 — RETICULATION. The polygonal ridge net between the glands.
          // This is the specific thing that says "amphibian" rather than
          // "bumpy": frog skin is tiled by shallow raised ridges enclosing the
          // wart fields, and it is the read a reference photo gives you in the
          // first half second. Worley f2-f1 on the wart lattice is exactly that
          // net, free — the sampler is already evaluated.
          const wg = warts(u, v)
          const ret = 1 - smoothstep(0, 0.16, (wg.f2 - wg.f1) * warts.cells)
          // band 4 — micro bumps.
          const micro = c.F(vn, u, v, c.fr(140), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + wart * 0.26 - pore * 0.2 + ret * 0.09
            + (mot - 0.5) * 0.1 + (micro - 0.5) * 0.1)
          // Wet: very low roughness everywhere, with a slick film pooling in the
          // low areas and drying slightly on the wart crowns. The ridge net is
          // the driest part of the skin — the film runs off it — so it is the
          // one place a frog shows a broad rather than a mirror lobe.
          const film = c.F(pn, u + 5.5, v + 1.7, c.fr(8), 3) * 0.5 + 0.5
          m[i] = clamp01(0.3 - film * 0.24 + wart * 0.22 + pore * 0.12 + ret * 0.16)
          const g = 0.86 + (mot - 0.5) * 0.12 - pore * 0.07 + ret * 0.04
          paint(a, i * 3, g * (0.86 - blotch * 0.08), g * (1.02 + blotch * 0.03), g * (0.8 - blotch * 0.06))
        }
      }
    },
  },

  'skin-reptile': {
    normal: 1.2, seed: 41,
    rough: { base: 0.55, contrast: 0.3, maskWeight: 0.48, spread: 1.9, min: 0.15 },
    ao: { radius: 4, strength: 1.05 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const scutes = c.wor(34, { jitter: 0.9 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const band = c.F(sn, u, v, c.fr(3), 3) * 0.5 + 0.5           // body banding
          const s = scutes(u, v)
          const d = s.f1 * scutes.cells
          const gap = smoothstep(0, 0.09, (s.f2 - s.f1) * scutes.cells) // 0 in the seam
          const dome = (1 - smoothstep(0.15, 0.62, d)) * gap
          const grain = c.F(vn, u, v, c.fr(110), 2) * 0.5 + 0.5
          // Per-scute variation must be RELIEF and WEAR, not just colour. Each
          // scute previously differed only in albedo (`cell`), so a reptile read
          // as a photograph of scales printed on a smooth surface: the tonal
          // mosaic held identical values as the light moved. Real scutes sit at
          // slightly different heights and polish at different rates.
          const cell = hash2(s.id % 4096, (s.id / 4096) | 0, c.seed)
          h[i] = clamp01(0.44 + dome * 0.34 + (band - 0.5) * 0.1 + (grain - 0.5) * 0.08
            - (1 - gap) * 0.12 + (cell - 0.5) * 0.13 * gap)
          // Keratin crowns polish with use; the seams stay matte and dusty.
          m[i] = clamp01(0.6 - dome * 0.32 + (1 - gap) * 0.25 + (cell - 0.5) * 0.22
            + (c.sp(x, y) - 0.5) * 0.1)
          const t = 0.86 + (cell - 0.5) * 0.12 + (band - 0.5) * 0.08 - (1 - gap) * 0.14
          paint(a, i * 3, t * 0.97, t * 1.01, t * 0.9)
        }
      }
    },
  },

  // WALLY's hide. The brief calls for cracked-leather micro-detail, so the
  // crack network is the hero: two worley scales, wide primary fissures with a
  // finer secondary net inside the plates, plus dust caught in the cracks.
  //
  // ROUND-3 P0 — "the lobe vanishes on the hide, and the cracks are pure albedo".
  // Two separate causes, both fixed here:
  //
  //  1. `base` was 0.82 against a hard ceiling of 1.0. roughnessBytes() expands
  //     variance about the mean and then clamps, so 0.82 + spread 3.6 threw most
  //     of the upper half of the distribution into the clamp and pulled the
  //     realised spread back down: measured sd 0.033 over a 0.31 range with p05
  //     at 0.78, i.e. 95% of the belly sat inside a 0.22-wide band at the matte
  //     end. A constant roughness at 0.82 is a GGX lobe so wide it is diffuse —
  //     there is no highlight to move when the key light yaws, which is exactly
  //     what the critic could not find. Now 0.70 with room on both sides.
  //  2. The mask was 0.62 + dust*0.3 - bump*0.15 — a 0.3-wide authored range
  //     dominated by DUST, which lives in the cracks and so tracks the albedo.
  //     Now the mask is authored across ~0.42..0.95 and driven by `crack`
  //     directly: raised plates polish (elephants rub on things), fissure walls
  //     stay dry and rough. That is a real roughness EDGE at every crack, so the
  //     crack reads as surface from the specular channel even before the normal
  //     map is considered — and it survives the material's roughness multiplier,
  //     which scales mean and spread together.
  //
  // The albedo swing on the crack lines is halved to compensate (0.22 -> 0.11):
  // the detail moves from colour into normal + roughness rather than being
  // duplicated in all three, which is what made the cracks read as jet-black
  // painted lines identical on the lit and the shadowed side of the belly.
  'skin-elephant': {
    // `micro: 1.3` — the hero surface of the roster's hero character, and the
    // one the camera gets closest to. It carries the shared band harder than
    // anything else in the table.
    normal: 1.45, seed: 43, micro: 1.3,
    // ROUND-7 P0, verbatim: "his lit skull spans median 219 to p98 238 — 19
    // counts of tonal range across an entire sphere, where a key-lit sphere
    // should span 60-140". Half of that is exposure and belongs to wally.js, but
    // the other half is here: `min: 0.3` was a FLOOR sitting above the whole
    // distribution (measured p05 0.529, lobe 0.05), so the hide could not
    // produce a highlight at any light angle and nothing described the dome of
    // the skull or the curve of the belly. The floor drops to 0.2 and the plate
    // crowns get a burnish field of their own — see `rub` below.
    rough: { base: 0.70, contrast: 0.3, maskWeight: 0.7, spread: 2.2, min: 0.2, max: 0.97 },
    ao: { radius: 6, strength: 1.15 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const big = c.wor(13, { jitter: 0.95 })
      const fine = c.wor(38, { jitter: 0.95 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // Warping the sample point is what stops the cracks reading as a
          // voronoi diagram — real hide cracks wander.
          const w1 = c.F(sn, u, v, c.fr(6), 3)
          const wx = u + w1 * 0.02
          const wy = v + c.F(sn, u + 3.1, v + 1.9, c.fr(6), 3) * 0.02
          const b = big(wx, wy), f = fine(wx, wy)
          const c1 = smoothstep(0, 0.11, (b.f2 - b.f1) * big.cells)
          const c2 = smoothstep(0, 0.16, (f.f2 - f.f1) * fine.cells)
          const crack = 1 - c1 * (0.55 + c2 * 0.45)
          const bump = c.F(pn, u, v, c.fr(9), 3) * 0.5 + 0.5           // coarse lumps
          const grain = c.F(vn, u, v, c.fr(90), 2) * 0.5 + 0.5         // pebbled micro
          h[i] = clamp01(0.6 + (bump - 0.5) * 0.24 + (grain - 0.5) * 0.12 - crack * 0.42)
          // Dust settles in the fissures: lighter albedo, much higher roughness.
          const dust = crack * (0.6 + c.F(vn, u + 7.7, v, c.fr(11), 2) * 0.4)
          // Plate crowns are rubbed smooth (0.42-0.55); fissure walls are dry
          // and dusty (0.88-0.95). The `grain` term keeps the plates from being
          // a flat gloss patch — micro-pebbling breaks the highlight up.
          // RUB POLISH. An elephant leans on things, and the plate crowns it
          // leans on burnish to a near-satin while the rest of the hide stays
          // chalky. It is a LARGE-scale field with no relation to the crack
          // lattice, which is the whole point — it puts a broad specular event
          // on the dome of the skull and the swell of the belly instead of only
          // at the fissures. `w1` is the warp field already evaluated above, so
          // this band is free: no extra noise call in the inner loop.
          const rub = smoothstep(-0.05, 0.6, w1) * (1 - crack)
          m[i] = clamp01(0.52 + crack * 0.42 + dust * 0.08 - rub * 0.44
            - (bump - 0.5) * 0.16 + (grain - 0.5) * 0.14)
          const t = 0.84 - crack * 0.11 + dust * 0.08 + (bump - 0.5) * 0.08
          paint(a, i * 3, t * 1.0, t * 0.99, t * 0.985)
        }
      }
    },
  },

  // FATTY PINGO's plumage. Lowest paintRatio in the table at 0.85 — the top 2%
  // of albedo-gradient texels sat on surface FLATTER than the map's own mean,
  // which is the textbook painted-detail signature: the barb pattern was drawn
  // in colour at ±0.10 and modelled in relief at only ±0.16 of a band that is
  // itself gated to zero near the rachis. So the barbs are moved into surface
  // (relief 0.16 -> 0.27, and they now cut a real roughness edge) and pulled
  // back out of colour (0.10 -> 0.055). Same read, but it moves under a light.
  //
  //   b1 STACK  7x6 rows  overlap step + vane dome + row offset   (3 m)
  //   b2 RACHIS per column  quill dome with its own centre groove (1 m)
  //   b3 BARB   f=110 V-angled barbs off the quill, separated     (30 cm)
  //   b4 DOWN   f=190 afterfeather fluff + preen grain            (specular)
  'feather': {
    albStep: 0.5, rghStep: 0.5,
    normal: 1.3, res: 0.5, seed: 47, micro: 1.1,
    rough: { base: 0.6, contrast: 0.28, maskWeight: 0.5, spread: 2.0, min: 0.14 },
    ao: { radius: 5, strength: 1.05 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const rows = c.fe(7), cols = c.fe(6)
      const barbF = c.fr(110), downF = c.fr(190)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const rv = v * rows
          const ri = Math.floor(rv), rf = rv - ri
          // Alternate rows are offset half a feather, the way real coverts lie.
          const cu = u * cols + (ri & 1) * 0.5
          const ci = Math.floor(cu), cf = cu - ci
          // band 1 — each row overlaps the one below: a step that AO reads as a
          // shadow line, which is what makes plumage look layered.
          const overlap = smoothstep(0.0, 0.22, rf) * (1 - smoothstep(0.82, 1.0, rf))
          const vane = Math.sin(Math.PI * clamp01(rf * 1.08)) * 0.9 + 0.1
          // band 2 — rachis down the middle of every feather.
          const off = cf - 0.5
          const quill = Math.exp(-(off * off) / 0.0042)
          // band 3 — barbs, angled off the quill on both sides.
          const barb = Math.sin((rf * 0.55 + Math.abs(off) * 0.9) * Math.PI * barbF) * 0.5 + 0.5
          const barbA = barb * (1 - quill) * (0.5 + 0.5 * vane)
          // Per-feather variation, in relief and gloss as well as tone. Plumage
          // is not a printed pattern: individual coverts sit at different depths
          // in the stack and preen to different sheens. `tone` alone was albedo,
          // and albedo alone does not move under a key light.
          const tone = hash2(ci, ri, c.seed) * 0.5 + 0.5
          // The rachis is a hollow keratin tube with a groove down its dorsal
          // face — the reason a real quill shows TWO highlights, not one. Six
          // characters of arithmetic, and it is the difference between a shaft
          // and a painted stripe.
          const groove = quill * Math.exp(-(off * off) / 0.00035)
          // Afterfeather down: the loose, unzipped barbules under every covert.
          // The plumage's only true micro band; without it the vane is smooth
          // between barbs, which no feather is.
          const down = c.F(vn, u * 1.0, v, downF, 1) * 0.5 + 0.5
          h[i] = clamp01(0.4 + overlap * 0.2 + vane * 0.16 + quill * 0.22
            + (barbA - 0.5) * 0.27 - groove * 0.13
            + (down - 0.5) * 0.09 * (1 - quill)
            + (tone - 0.5) * 0.12
            - smoothstep(0.09, 0.0, Math.min(cf, 1 - cf)) * 0.3)
          // The frayed edge of a vane is measurably rougher than its preened
          // centre, and the rachis is the glossiest thing on a bird. Both were
          // present as albedo and barely present in the specular, which is the
          // reason plumage read as a printed pattern. The barb term is now the
          // strongest roughness edge on the map (0.14 -> 0.3), so even where the
          // relief mips away the barbs still cut the specular lobe.
          m[i] = clamp01(0.66 - quill * 0.4 + groove * 0.2 - barbA * 0.3 + (1 - vane) * 0.3
            + (down - 0.5) * 0.14 + (tone - 0.5) * 0.34 + (c.sp(x, y) - 0.5) * 0.1)
          const t = 0.84 + (tone - 0.5) * 0.1 + quill * 0.08 + (barbA - 0.5) * 0.055
            - (1 - vane) * 0.1
          paint(a, i * 3, t * 1.0, t * 0.99, t * 0.96)
        }
      }
    },
  },

  'scales': {
    normal: 1.25, res: 0.5, seed: 53,
    // Keratin scale crowns polish; the seams between them stay matte. A 1.8x
    // spread is what turns that into a visible specular event travelling across
    // the scale field as the light moves, instead of a uniform satin sheet.
    rough: { base: 0.34, contrast: 0.3, maskWeight: 0.4, spread: 2.4 },
    ao: { radius: 5, strength: 1.15 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const rows = c.fe(14), cols = c.fe(11)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const rv = v * rows
          const ri = Math.floor(rv), rf = rv - ri
          const cu = u * cols + (ri & 1) * 0.5
          const ci = Math.floor(cu), cf = cu - ci
          const dx = (cf - 0.5) * 2, dy = (rf - 0.5) * 2
          const d = Math.sqrt(dx * dx * 0.82 + dy * dy)
          const dome = 1 - smoothstep(0.28, 1.0, d)
          // Concentric growth ridges on each plate — band 3, and the reason a
          // scale reads as keratin rather than a bevelled tile.
          const ridge = Math.sin(d * Math.PI * c.fr(5)) * 0.5 + 0.5
          const form = c.F(sn, u, v, c.fr(3), 3) * 0.5 + 0.5
          const seam = smoothstep(1.0, 0.86, d)
          h[i] = clamp01(0.4 + dome * 0.34 + (1 - rf) * 0.05 + (ridge - 0.5) * 0.05 * dome
            + (form - 0.5) * 0.08 - (1 - seam) * 0.1)
          const wearShine = hash2(ci, ri, c.seed + 5) * 0.5 + 0.5
          m[i] = clamp01(0.5 - dome * 0.3 * wearShine + (1 - seam) * 0.28 + (c.sp(x, y) - 0.5) * 0.08)
          const t = 0.85 + (wearShine - 0.5) * 0.14 + dome * 0.06 - (1 - seam) * 0.12
          paint(a, i * 3, t * 0.98, t * 1.0, t * 0.97)
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // CLOTH — the over/under of a real weave, not a noise field with a grid on it.
  // -------------------------------------------------------------------------

  // THREAD-LEVEL ANISOTROPY: the PLY TWIST.
  //
  // A woven thread is not a smooth tube — it is two or three plies spiralled
  // around each other, and the spiral is why cloth has a fine diagonal
  // corrugation running along every thread and why its highlight breaks into
  // short slanted dashes instead of a continuous line. That corrugation is the
  // entire visual difference between "woven" and "printed grid", and the
  // shipped kind did not have it: it had a sine cross-section and an isotropic
  // fibre band, i.e. a lattice of smooth tubes.
  //
  // The twist phase is `along-thread * K + across-thread`, with K an INTEGER
  // number of turns per thread cell, so the ridge wraps at the tile edge. Warp
  // and weft twist about their own axes, which is what makes the two thread
  // families catch a moving light at different times — the anisotropy.
  //
  //   b1 DRAPE  f=4     the cloth's own sag and gather              (3 m)
  //   b2 WEAVE  56x56   over/under, per-thread slub along its length (1 m)
  //   b3 TWIST  3/cell  ply spiral on every thread, warp and weft   (30 cm)
  //   b4 FIBRE  128x70  the fuzz halo lifting off the weave         (specular)
  'cloth-weave': {
    normal: 0.95, seed: 59, micro: 1.1, aniso: [0.2, 0],
    // Woven cotton is matte, but it is not UNIFORMLY matte: measured before this
    // change the glossiest 5% of the cloth sat at 0.741 (lobe 0.01), so the
    // weave existed in relief and in colour and was completely absent from the
    // specular. A ply crown on a face thread is the one place the fibre lies
    // parallel and flat, and it is what makes cloth twinkle along the thread
    // direction as the key sweeps.
    rough: { base: 0.84, contrast: 0.2, maskWeight: 0.44, spread: 1.95, min: 0.2 },
    ao: { radius: 4, strength: 1.0 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const th = c.fe(56)   // threads across the tile; must be even so the
      const PLY = 3         // over/under parity wraps at the seam
      const TAU = Math.PI * 2
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const tx = u * th, ty = v * th
          const ix = Math.floor(tx), iy = Math.floor(ty)
          const fx = tx - ix, fy = ty - iy
          // Slub: real yarn varies in thickness ALONG ITS LENGTH. The shipped
          // version hashed the thread index only, so every warp thread was a
          // constant width down the whole tile — a per-thread gauge, not a slub,
          // and the flattest thing on the map.
          const slubW = 0.86 + hash2(ix, iy >> 1, c.seed) * 0.28
          const slubF = 0.86 + hash2(iy, ix >> 1, c.seed + 3) * 0.28
          const warp = Math.sin(fx * Math.PI) * slubW
          const weft = Math.sin(fy * Math.PI) * slubF
          const over = ((ix + iy) & 1) === 0
          const top = over ? warp : weft
          const bot = over ? weft : warp
          // Ply spiral. Along +v for a warp thread, along +u for a weft one.
          const twW = Math.sin((ty * PLY + fx) * TAU)
          const twF = Math.sin((tx * PLY + fy) * TAU)
          const twist = (over ? twW : twF) * 0.5 + 0.5
          const drape = c.F(sn, u, v, c.fr(4), 3) * 0.5 + 0.5          // band 1
          const fibre = c.A(vn, u, v, c.fr(200), c.fr(70), 2) * 0.5 + 0.5 // band 4
          h[i] = clamp01(0.32 + top * 0.4 + bot * 0.16 + (twist - 0.5) * 0.13 * top
            + (drape - 0.5) * 0.12 + (fibre - 0.5) * 0.08)
          // The ply crowns take the light and the valleys between them hold the
          // fuzz — a real roughness edge at every turn of the spiral, which is
          // what makes the highlight dash rather than smear.
          const crown = smoothstep(0.5, 0.95, top) * smoothstep(0.45, 0.95, twist)
          m[i] = clamp01(0.84 - top * 0.1 + (1 - top) * 0.12 - crown * 0.38
            + (fibre - 0.5) * 0.2)
          const t = 0.84 + top * 0.1 - (1 - top) * 0.06 + (twist - 0.5) * 0.045 * top
            + (drape - 0.5) * 0.09 + (fibre - 0.5) * 0.06
          paint(a, i * 3, t, t * 0.995, t * 0.985)
        }
      }
    },
  },

  'cloth-knit': {
    normal: 1.0, seed: 61,
    // A knit stays the mattest cloth in the table — the halo of loose fibre is
    // its identity — but "matte" is not "constant": the shipped map's glossiest
    // 5% was 0.77 (lobe 0.01), so the loops existed only in relief. The yarn
    // crown on a front loop is the one flat-lying fibre in the stitch.
    rough: { base: 0.85, contrast: 0.2, maskWeight: 0.46, spread: 1.95, min: 0.22 },
    ao: { radius: 5, strength: 1.1 },
    build(c) {
      const { N, h, m, a, vn, sn } = c
      const cols = c.fe(18), rows = c.fe(22)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const cu = u * cols, rv = v * rows
          const ci = Math.floor(cu), ri = Math.floor(rv)
          const cf = cu - ci, rf = rv - ri
          // A knit stitch is two arms of a V meeting at the bottom. Distance to
          // that V, domed, is the whole cell.
          const armL = Math.abs((cf * 2 - 0.5) - rf)
          const armR = Math.abs((1.5 - cf * 2) - rf)
          const arm = Math.min(armL, armR)
          const loop = 1 - smoothstep(0.05, 0.42, arm)
          // The next row's loops pass behind this one — the interlock.
          const behind = 1 - smoothstep(0.1, 0.5, Math.abs(rf - 0.5))
          const yarn = c.A(vn, u, v, c.fr(90), c.fr(150), 2) * 0.5 + 0.5   // twist
          const drape = c.F(sn, u, v, c.fr(3), 3) * 0.5 + 0.5
          const fuzz = c.sp(x, y)
          h[i] = clamp01(0.3 + loop * 0.42 + behind * 0.12 + (yarn - 0.5) * 0.14
            + (drape - 0.5) * 0.1 + (fuzz - 0.5) * 0.06)
          // Wool halo: high roughness everywhere, highest in the gaps where the
          // loose fibre bridges the stitches.
          const crown = smoothstep(0.55, 0.95, loop) * smoothstep(0.45, 0.9, yarn)
          m[i] = clamp01(0.86 - loop * 0.08 + (1 - loop) * 0.14 - crown * 0.34
            + (fuzz - 0.5) * 0.16)
          const t = 0.84 + loop * 0.1 - (1 - loop) * 0.1 + (drape - 0.5) * 0.08 + (yarn - 0.5) * 0.05
          paint(a, i * 3, t, t * 0.997, t * 0.99)
        }
      }
    },
  },

  // 3/1 right-hand twill. Four bands; the new one is the SLUB, which for denim
  // is not a nicety — slubby ring-spun yarn is the entire difference between
  // selvedge denim and a printed blue grid, and the shipped kind had a constant
  // thread gauge. Note the seam metric legitimately reads ~2.9 here: at 512 the
  // tile is exactly 64 threads of 8 texels, so the wrap pair lands ON a thread
  // boundary — the field's largest step by construction — while the interior
  // mean is dominated by mid-thread texels. It is a cell-aligned tile, not a
  // broken one (see the seamError note).
  //
  //   b1 DRAPE f=4      sag, gather, knee/seat wear field          (3 m)
  //   b2 WALE  th/4     the diagonal twill float, 3-over-1         (1 m)
  //   b3 WARP  64x64    thread cross-section + slub along length   (30 cm)
  //   b4 FIBRE 128x90   cotton hairiness on the abraded crowns     (specular)
  'denim': {
    // The wale runs at 45 deg, so denim IS a directional surface — declared for
    // the day materials.js wires MeshPhysicalMaterial.anisotropy. The faked
    // channel (`nrmAniso`) cannot express a 45 deg grain (it weights the two
    // Sobel axes, which are u and v), so denim relies on the twill float itself
    // for its directional relief, which it already carries at 0.2 of height.
    normal: 1.15, seed: 67, micro: 1.1, aniso: [0.32, Math.PI / 4],
    // Abraded wale crowns polish. Was roughP05 0.722 / lobe 0.01 — indigo twill
    // with no specular event at all, which is why it read as printed canvas.
    rough: { base: 0.82, contrast: 0.22, maskWeight: 0.48, spread: 2.0, min: 0.2 },
    ao: { radius: 4, strength: 1.0 },
    build(c) {
      const { N, h, m, a, vn, sn } = c
      const th = c.fe(64)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const tx = u * th, ty = v * th
          const ix = Math.floor(tx), iy = Math.floor(ty)
          const fx = tx - ix
          // Ring-spun slub: the yarn is thick here and thin there along its own
          // length. Hashed on (thread index, position along thread) so it is a
          // slub and not a gauge, and so it wraps with the thread lattice.
          const slub = 0.82 + hash2(ix, iy >> 1, c.seed + 11) * 0.36
          // 3/1 twill: the float steps one thread per row, which is what makes
          // the diagonal wale. Parity must wrap, hence the even thread count.
          const step = ((ix - iy) % 4 + 4) % 4
          const face = step < 3 ? 1 : 0
          const warp = Math.sin(fx * Math.PI) * slub
          const wale = Math.sin(((tx - ty) / 4) * Math.PI * 2) * 0.5 + 0.5
          const drape = c.F(sn, u, v, c.fr(4), 3) * 0.5 + 0.5
          const fibre = c.A(vn, u, v, c.fr(220), c.fr(90), 2) * 0.5 + 0.5
          // The 3/1 float (`face`) is a THREAD LYING ON TOP of three others: it
          // is 8 sRGB steps of indigo AND a physical step of relief. It used to
          // carry almost all of its signal in albedo (0.08 of height against a
          // 0.3 albedo swing), so the twill wale was a printed pattern that did
          // not move under light. 0.2 puts the float where it belongs.
          //
          // The float MUST stay a hard binary step, and this was tested the
          // other way: shaping it by the thread cross-section (a smooth
          // `face * (0.45 + 0.55|warp|)`) raised the map's mean tilt to 27 deg
          // but LOWERED paintRatio 1.28 -> 1.14, because the albedo's indigo /
          // undyed flip is itself binary and the relief edge has to land on the
          // same texel as the colour edge, not merely somewhere nearby. A
          // higher average tilt with the detail in the wrong place is worse
          // than a lower one with it in the right place — which is precisely
          // what paintRatio exists to catch.
          h[i] = clamp01(0.36 + warp * 0.24 + wale * 0.18 + face * 0.2
            + (drape - 0.5) * 0.1 + (fibre - 0.5) * 0.08)
          // Abrasion: the wale crowns rub pale. Independent of relief on purpose
          // — it follows a large wear field, the way real fading does.
          const fade = smoothstep(0.35, 0.85, c.F(sn, u + 9.1, v + 2.3, c.fr(3), 3) * 0.5 + 0.5)
          // Exposed undyed weft is raw cotton — measurably rougher than the
          // indigo-sized warp float, so the weave shows in the specular too.
          // Where a wale crown sits on the 3/1 float AND the fade field has
          // worked it, the cotton is burnished flat and shines. That is the
          // whitening on the thigh of a worn pair of jeans, in the specular
          // channel rather than only in the albedo where it used to live alone.
          const polish = smoothstep(0.6, 0.98, wale) * face * (0.35 + fade * 0.65)
          m[i] = clamp01(0.84 + fade * 0.1 - wale * 0.08 + (1 - face) * 0.14
            - polish * 0.5 + (fibre - 0.5) * 0.18)
          // Indigo warp on the face, undyed weft showing through underneath —
          // the reason denim is blue on one side and white on the other.
          const dye = face ? 1 : 0.35
          const t = 0.7 + wale * 0.14 + fade * 0.22 + (fibre - 0.5) * 0.07
          paint(a, i * 3, t * (0.72 + (1 - dye) * 0.3 + fade * 0.12),
            t * (0.82 + (1 - dye) * 0.2 + fade * 0.08),
            t * (1.0 - fade * 0.05))
        }
      }
    },
  },

  // WALLY's suit. Worsted wool: a very fine weave, a faint herringbone, and
  // pale flecks of undyed fibre. The flecks are what stop a dark suit from
  // reading as a black plastic shell.
  // WALLY's suit (and every lapel in the roster). Worsted wool: a very fine
  // weave, a herringbone chevron, a raised nap, and pale flecks of undyed
  // fibre. The flecks are what stop a dark suit from reading as a black plastic
  // shell — but in the shipped kind they were +0.30 of ALBEDO against +0.06 of
  // relief, which is a printed dot, and it showed up as the table's third-worst
  // paintRatio. A fleck is a fibre END standing proud of the weave: it is now
  // 0.15 of relief, a roughness island (loose fibre is much rougher than the
  // sized worsted around it) and only +0.18 of colour.
  //
  // TILEABILITY. Two real seam bugs went with it. The herringbone phase was
  // `(tx ± ty)/3` over a 110-thread tile — 110/3 is not an integer, so the
  // chevron did not close at either edge. And the fleck gate hashed `x>>3`,
  // TEXEL coordinates, so the fleck size changed with map resolution and the
  // block lattice did not divide the tile. Both are now expressed as integer
  // cycle counts over [0,1), which wraps at any size. Measured seam 1.89 -> see
  // __selfTest.
  //
  //   b1 DRAPE  f=3     sag, gather, the weight of the cloth      (3 m)
  //   b2 CHEVRON th/3   herringbone, direction flipping per band  (1 m)
  //   b3 WEAVE  108x108 over/under + ply twist on every thread    (30 cm)
  //   b4 NAP+FLECK f=200 / worley 60  raised fibre and slub ends  (specular)
  'suit-wool': {
    // `nrmAniso` is the FAKED half of the anisotropy pair (contract 3.4).
    // `aniso` alone is a hint nothing in the tree consumes yet, so worsted was
    // shipping with no directional bias at all: the warp runs along +v here, so
    // flattening the along-warp Sobel axis is what smears the highlight down the
    // thread the way a worsted lapel actually behaves. Mild (1.14/0.88) because
    // the herringbone flips the chevron per band and a hard bias would fight it.
    normal: 0.9, seed: 71, micro: 1.1, nrmAniso: [1.14, 0.88], aniso: [0.22, 0],
    // Worsted wool has a real sheen — it is the difference between a suit and a
    // felt costume — and the shipped kind's glossiest 5% was 0.58 (lobe 0.03).
    rough: { base: 0.72, contrast: 0.22, maskWeight: 0.5, spread: 2.55, min: 0.16 },
    ao: { radius: 3, strength: 0.85 },
    build(c) {
      const { N, h, m, a, vn, sn } = c
      const th = c.fe(108)
      const hbc = Math.max(2, Math.round(th / 3))   // integer chevron cycles per tile
      const bands = c.fe(12)                        // even: the flip parity wraps
      const fgrid = 64                              // fleck gate cells across the tile
      const TAU = Math.PI * 2
      const flecks = c.wor(60, { jitter: 1 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const tx = u * th, ty = v * th
          const ix = Math.floor(tx), iy = Math.floor(ty)
          const fx = tx - ix, fy = ty - iy
          const over = ((ix + iy) & 1) === 0
          const warp = Math.sin(fx * Math.PI)
          const weft = Math.sin(fy * Math.PI)
          const top = over ? warp : weft
          // Herringbone: the twill direction flips every few threads. Phase in
          // whole cycles over [0,1) so it closes on both seams.
          const bandI = Math.floor(u * bands)
          const dir = (bandI & 1) ? 1 : -1
          const hb = Math.sin((u + dir * v) * hbc * TAU) * 0.5 + 0.5
          // Ply spiral on each thread — the same yarn-level anisotropy as
          // cloth-weave, at a finer gauge because worsted is a tight two-ply.
          const twist = (over ? Math.sin((ty * 2 + fx) * TAU) : Math.sin((tx * 2 + fy) * TAU)) * 0.5 + 0.5
          const drape = c.F(sn, u, v, c.fr(3), 3) * 0.5 + 0.5
          // The nap: fibre ends lifting off the weave surface. Wool has one and
          // worsted-look plastic does not.
          const nap = c.F(vn, u + 1.3, v + 7.1, c.fr(200), 1) * 0.5 + 0.5
          const fd = flecks(u, v).f1 * flecks.cells
          const gate = hash2((u * fgrid) | 0, (v * fgrid) | 0, c.seed) > 0.72 ? 1 : 0
          const fleck = (1 - smoothstep(0.02, 0.16, fd)) * gate
          h[i] = clamp01(0.44 + top * 0.24 + hb * 0.1 + (twist - 0.5) * 0.07 * top
            + (drape - 0.5) * 0.1 + (nap - 0.5) * 0.07 + fleck * 0.15)
          // The worsted sheen: a ply crown, on a face thread, on the raised
          // limb of the chevron. Three gates, so the highlight is a fine
          // travelling herringbone glitter rather than a satin sheet.
          const crown = smoothstep(0.5, 0.95, top) * smoothstep(0.4, 0.92, twist) * (0.4 + hb * 0.6)
          m[i] = clamp01(0.82 - top * 0.08 + (1 - top) * 0.1 - crown * 0.3
            + fleck * 0.16 + (nap - 0.5) * 0.14 + (c.sp(x, y) - 0.5) * 0.12)
          const t = 0.82 + top * 0.08 + hb * 0.05 + (drape - 0.5) * 0.07
            + (nap - 0.5) * 0.04 + fleck * 0.18
          paint(a, i * 3, t * 1.0, t * 1.0, t * 1.01)
        }
      }
    },
  },

  // Full-grain leather. Four bands, and the new one is the FLEX CREASE — the
  // fine directional crazing that runs across the pebble grain wherever a hide
  // has been bent. Every real leather surface in a fighting game (a satchel
  // strap, a glove, a boat shoe) is bent leather, and the shipped kind was
  // unflexed: pebbles and pores only, which reads as moulded PVC.
  //
  //   b1 SWELL  f=4     the hide's own thickness variation         (3 m)
  //   b2 PEBBLE worley30 raised grain islands, domain-warped       (1 m)
  //   b3 FLEX   60x9    directional crease crazing across the grain (30 cm)
  //   b4 PORE   worley120 hair follicles, and their roughness step (specular)
  'leather': {
    normal: 1.25, seed: 73, micro: 1.15,
    // Handled leather burnishes to a near-satin on the pebble crowns. Was
    // roughP05 0.478 / lobe 0.07: a broad wash, no glint, which is exactly how
    // moulded PVC behaves and exactly how full-grain leather does not.
    rough: { base: 0.6, contrast: 0.24, maskWeight: 0.56, spread: 2.15, min: 0.12 },
    ao: { radius: 5, strength: 1.1 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const grain = c.wor(30, { jitter: 0.95 })
      const pores = c.wor(120, { jitter: 1 })
      const flexU = c.fr(60), flexV = c.fr(9)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const wx = u + c.F(sn, u, v, c.fr(7), 3) * 0.018
          const wy = v + c.F(sn, u + 4.4, v + 8.2, c.fr(7), 3) * 0.018
          const g = grain(wx, wy)
          // Pebble grain: raised islands separated by soft creases.
          const crease = smoothstep(0, 0.13, (g.f2 - g.f1) * grain.cells)
          const pebble = crease * (1 - smoothstep(0.25, 0.75, g.f1 * grain.cells) * 0.35)
          const swell = c.F(pn, u, v, c.fr(4), 3) * 0.5 + 0.5           // band 1
          const pd = pores(u, v).f1 * pores.cells
          const pore = (1 - smoothstep(0.0, 0.28, pd)) * 0.5            // band 4
          // Flex crazing: anisotropic, ridged, and gated by a large-scale bend
          // field so it concentrates where the hide actually folds instead of
          // covering the whole panel like a scratch overlay.
          const bend = smoothstep(0.42, 0.78, c.F(pn, u + 2.6, v + 9.4, c.fr(3), 2) * 0.5 + 0.5)
          const flex = (1 - Math.abs(c.A(vn, u, v, flexU, flexV, 1, 0.55))) * bend
          h[i] = clamp01(0.46 + pebble * 0.26 + (swell - 0.5) * 0.16 - pore * 0.12
            - flex * 0.13)
          // Handled leather burnishes on the crowns and stays matte in the
          // creases; the burnish follows its own large-scale field. Flex lines
          // are the shiniest thing on worn leather — the fibre there is
          // compressed and polished by every fold.
          const hand = c.F(pn, u + 6.1, v + 3.3, c.fr(3), 3) * 0.5 + 0.5
          const burnish = smoothstep(0.5, 0.92, hand) * pebble
          m[i] = clamp01(0.7 - pebble * 0.2 * hand - burnish * 0.5 + (1 - crease) * 0.26
            + pore * 0.1 - flex * 0.22)
          const t = 0.84 + pebble * 0.09 - (1 - crease) * 0.16 + (swell - 0.5) * 0.1
            + hand * 0.06 - flex * 0.05
          paint(a, i * 3, t * 1.02, t * 0.97, t * 0.93)
        }
      }
    },
  },

  'rubber': {
    rghStep: 0.5,
    normal: 3, res: 0.5, seed: 79,
    rough: { base: 0.84, contrast: 0.14, maskWeight: 0.42, spread: 2.4, min: 0.2 },
    ao: { radius: 3, strength: 0.7 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const pit = c.wor(150, { jitter: 1 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const mould = c.F(pn, u, v, c.fr(5), 3) * 0.5 + 0.5           // band 1
          const stipple = c.F(vn, u, v, c.fr(40), 3) * 0.5 + 0.5        // band 2
          const pd = pit(u, v).f1 * pit.cells
          const pore = (1 - smoothstep(0, 0.25, pd)) * 0.6              // band 3
          const dust = c.F(vn, u + 1.7, v + 9.4, c.fr(9), 3) * 0.5 + 0.5
          h[i] = clamp01(0.52 + (mould - 0.5) * 0.14 + (stipple - 0.5) * 0.18 - pore * 0.1)
          // Vulcanised rubber blooms — a faint chalky film that varies
          // independently of the mould texture.
          // SCUFF POLISH. A sole, a tyre shoulder or a grip that has been used
          // burnishes where it rubs, and that is the only specular event rubber
          // owns. Without it the map's authored range was 0.80-1.04 — entirely
          // at the matte end, so `spread: 5` merely pinned it against the clamp
          // (measured roughSd 0.035, lobe 0.01) instead of producing variation.
          const scuff = smoothstep(0.56, 0.92, c.F(pn, u + 5.3, v + 2.9, c.fr(6), 2) * 0.5 + 0.5)
          m[i] = clamp01(0.9 + dust * 0.1 - scuff * 0.52 - (stipple - 0.5) * 0.12)
          const t = 0.82 + dust * 0.07 + (stipple - 0.5) * 0.06 - pore * 0.05
          paint(a, i * 3, t, t * 1.0, t * 1.005)
        }
      }
    },
  },

  'plastic-matte': {
    normal: 1.7, res: 0.5, seed: 83,
    rough: { base: 0.66, contrast: 0.16, maskWeight: 0.4, spread: 1.9, min: 0.18 },
    ao: { radius: 2, strength: 0.45 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // Injection-mould texture: a fine even stipple (band 2) on top of the
          // slow flow-front waviness of the tool (band 1), plus resin speckle.
          const flow = c.A(pn, u, v, c.fr(3), c.fr(6), 3) * 0.5 + 0.5
          const stipple = c.F(vn, u, v, c.fr(64), 2) * 0.5 + 0.5
          const speck = c.sp(x, y)
          h[i] = clamp01(0.5 + (flow - 0.5) * 0.1 + (stipple - 0.5) * 0.22 + (speck - 0.5) * 0.06)
          const smudge = c.F(vn, u + 3.3, v + 7.1, c.fr(7), 3) * 0.5 + 0.5
          m[i] = clamp01(0.6 + (stipple - 0.5) * 0.3 + (smudge - 0.5) * 0.24)
          const t = 0.87 + (flow - 0.5) * 0.05 + (stipple - 0.5) * 0.05
          paint(a, i * 3, t, t, t * 1.002)
        }
      }
    },
  },

  'plastic-gloss': {
    normal: 2.4, normalScale: 0.6, res: 0.5, seed: 89, micro: 0.5,
    rough: { base: 0.16, contrast: 0.12, maskWeight: 0.32, spread: 1.45 },
    ao: { radius: 2, strength: 0.35 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // Orange peel — the low-amplitude ripple every real gloss shell has.
          // Without it a glossy surface reflects like a mathematical plane and
          // instantly reads as CG.
          const peel = c.F(pn, u, v, c.fr(22), 3) * 0.5 + 0.5
          const swell = c.F(pn, u + 2.2, v, c.fr(4), 2) * 0.5 + 0.5
          const micro = c.F(vn, u, v, c.fr(140), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + (swell - 0.5) * 0.1 + (peel - 0.5) * 0.12 + (micro - 0.5) * 0.05)
          // Fingerprints and dust: the entire visual interest of a gloss surface
          // lives in the roughness map, not the normal map.
          const prints = smoothstep(0.55, 0.9, c.F(vn, u + 8.8, v + 5.5, c.fr(9), 3) * 0.5 + 0.5)
          m[i] = clamp01(0.35 + prints * 0.45 + (micro - 0.5) * 0.12)
          const t = 0.9 + (swell - 0.5) * 0.04 - prints * 0.03
          paint(a, i * 3, t, t, t)
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // METAL — anisotropy is the whole game. Brushed metal is directional scratch
  // depth; polished metal is a swirl; both live almost entirely in roughness.
  // -------------------------------------------------------------------------

  'metal-brushed': {
    // `micro: 0.5` — the shared isotropic band fights the grain here, so it is
    // halved: enough to keep the sheet from being a mathematical plane, not
    // enough to blur the brush direction. `aniso` rotation 0 = grain along +u,
    // which is the majority-panel direction (`turn` flips alternate sheets).
    normal: 2.4, normalScale: 0.8, res: 0.5, seed: 97, micro: 0.5, aniso: [0.72, 0],
    rough: { base: 0.3, contrast: 0.3, maskWeight: 0.55, spread: 1.35 },
    ao: { radius: 4, strength: 0.6 },
    // PANEL SEAMS, AND THE GRAIN TURNS AT THEM. Brushed steel arrives as sheets
    // and the sheets are butted: a 0.12-deep seam over a 1.4+1.8 texel shoulder
    // (~26 deg at `normal: 2.4` on a 256 map). Alternate panels are brushed
    // ACROSS instead of along — the anisotropic highlight therefore jumps 90
    // degrees at the seam, which is the single most recognisable thing about a
    // real lift lobby and costs nothing (the scratch band is sampled once, with
    // its coordinates swapped).
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const fine = c.fr(420), long = c.fr(3)
      const sheetG = c.grid(2, 3, { width: 1.4, bevel: 1.8 })
      const DEPTH = 0.12, SET = 0.02
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = sheetG(u, v)
          const turn = g.id > 0.5
          const su = turn ? v : u, sv = turn ? u : v
          // band 1 — the sheet's own gentle undulation and rolling bands.
          const sheet = c.A(pn, su, sv, c.fr(2), c.fr(5), 3) * 0.5 + 0.5
          // band 2 — brush passes: broad bands of differing grit.
          const pass = c.A(pn, su, sv, long, c.fr(24), 2) * 0.5 + 0.5
          // band 3 — the individual scratch lines, extremely anisotropic.
          const scratch = c.A(vn, su, sv, fine, c.fr(2), 2, 0.6) * 0.5 + 0.5
          // A handful of deeper gouges so the grain is not perfectly regular.
          const gouge = smoothstep(0.93, 1.0, c.A(vn, su + 3.1, sv, c.fr(160), c.fr(2), 1)) * 0.5 + 0.5
          const face = 0.5 + (sheet - 0.5) * 0.1 + (pass - 0.5) * 0.06
            + (scratch - 0.5) * 0.2 - (gouge - 0.5) * 0.18 + g.set * SET
          h[i] = clamp01(mix(0.5 - DEPTH, face, g.top))
          const brush = 0.45 + (scratch - 0.5) * 0.55 + (pass - 0.5) * 0.3 + (gouge - 0.5) * 0.3
          // The seam is a shadow gap full of polish residue: matte, and the
          // arris either side of it is burnished bright by every passing sleeve.
          m[i] = clamp01(mix(0.78, brush - g.lip * 0.16, g.top))
          const t = (0.88 + (scratch - 0.5) * 0.07 + (sheet - 0.5) * 0.04) * mix(0.74, 1, g.top)
          paint(a, i * 3, t, t * 1.0, t * 1.01)
        }
      }
    },
  },

  'metal-polished': {
    normal: 0.22, normalScale: 0.5, albedo: false, res: 0.5, seed: 101, micro: 0,
    rough: { base: 0.08, contrast: 0.1, maskWeight: 0.3, spread: 1.5 },
    ao: false,
    build(c) {
      const { N, h, m, vn, pn, sn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const plate = c.F(pn, u, v, c.fr(3), 2) * 0.5 + 0.5
          // Swirl marks from the polishing wheel: warped noise, faint but the
          // only thing that keeps a reflection from being mirror-perfect.
          const swirl = c.W(sn, u, v, c.fr(30), 0.5, 3) * 0.5 + 0.5
          const micro = c.F(vn, u, v, c.fr(200), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + (plate - 0.5) * 0.08 + (swirl - 0.5) * 0.06 + (micro - 0.5) * 0.04)
          const dust = smoothstep(0.6, 0.95, c.F(vn, u + 4.2, v + 1.1, c.fr(11), 3) * 0.5 + 0.5)
          m[i] = clamp01(0.3 + dust * 0.4 + (swirl - 0.5) * 0.18)
        }
      }
    },
  },

  'metal-painted': {
    normal: 1.7, res: 0.5, seed: 103,
    rough: { base: 0.4, contrast: 0.26, maskWeight: 0.55, spread: 1.3 },
    ao: { radius: 5, strength: 0.95 },
    // PLATE SEAMS AND BOLT HEADS. Painted steel is plate, and plate is bolted:
    // a 0.13-deep seam over a 1.8+2.4 texel shoulder (~28 deg at
    // `normal: 1.7`), with domed 0.1-high bolt heads marching along it at a
    // tileable interval. The paint chips are now WEIGHTED TO THE SEAM SHOULDER
    // and to the bolts, which is both where paint actually fails and the fix
    // for the chip mask being the map's strongest albedo edge while sitting on
    // flat surface.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const chips = c.wor(22, { jitter: 0.95 })
      const plate = c.grid(2, 2, { width: 1.8, bevel: 2.4 })
      const bolts = c.fe(18)
      const DEPTH = 0.13, SET = 0.016, BR = 3.4 * (N / 512)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = plate(u, v)
          // Bolt heads: centred on the seam, spaced `bolts` to the tile so the
          // run wraps. `al` is the coordinate ALONG the seam, `d` the texel
          // distance across it.
          let bolt = 0
          if (g.d < BR) {
            const ap = g.al * bolts
            const dAl = Math.abs(ap - Math.floor(ap) - 0.5) * (N / bolts)
            const br2 = (g.d * g.d + dAl * dAl) / (BR * BR)
            if (br2 < 1) bolt = Math.sqrt(1 - br2)
          }
          const panel = c.A(pn, u, v, c.fr(3), c.fr(4), 3) * 0.5 + 0.5
          const peel = c.F(pn, u, v, c.fr(26), 3) * 0.5 + 0.5           // orange peel
          // Chipped paint: a warped worley island network thresholded hard, so
          // the chips have ragged edges instead of circular ones.
          const wx = u + c.F(sn, u, v, c.fr(9), 3) * 0.03
          const wy = v + c.F(sn, u + 5.1, v + 2.7, c.fr(9), 3) * 0.03
          const cd = chips(wx, wy).f1 * chips.cells
          const chip = smoothstep(0.42, 0.2, cd) * smoothstep(0.4, 0.62,
            c.F(vn, u + 7.3, v + 3.9, c.fr(14), 3) * 0.5 + 0.5)
            * clamp01(0.35 + g.lip * 1.3 + bolt * 1.1)
          const micro = c.F(vn, u, v, c.fr(150), 2) * 0.5 + 0.5
          const face = 0.55 + (panel - 0.5) * 0.1 + (peel - 0.5) * 0.14
            - chip * 0.2 + (micro - 0.5) * 0.06 + g.set * SET + bolt * 0.1
          h[i] = clamp01(mix(0.55 - DEPTH + bolt * 0.1, face, clamp01(g.top + bolt)))
          // Exposed primer/metal in the chips is rougher and duller; the paint
          // film itself is semi-gloss with a dirt film on top.
          const grime = c.F(vn, u + 2.4, v + 8.8, c.fr(6), 3) * 0.5 + 0.5
          const film = 0.4 + chip * 0.4 + grime * 0.22 + (peel - 0.5) * 0.16
          m[i] = clamp01(mix(0.86, film, clamp01(g.top + bolt * 0.8)))
          const t = (0.88 - chip * 0.24 - grime * 0.08 + (panel - 0.5) * 0.06)
            * (1 + g.set * 0.05) * mix(0.7, 1, clamp01(g.top + bolt * 0.8))
          paint(a, i * 3, t, t * (1 - chip * 0.02), t * (1 - chip * 0.05))
        }
      }
    },
  },

  'metal-rusted': {
    rghStep: 0.5,
    normal: 2.2, res: 0.5, seed: 107,
    rough: { base: 0.7, contrast: 0.3, maskWeight: 0.55, spread: 1.4 },
    ao: { radius: 6, strength: 1.2 },
    // LAP JOINTS, AND THE RUST STARTS IN THEM. Corroded steel is sheet, and
    // water sits in the lap: a 0.15-deep seam over a 2.2+2.8 texel shoulder
    // (~30 deg at `normal: 2.2`) with the bloom threshold biased so the rust
    // creeps OUT of the joint rather than floating in the middle of a plate.
    // The seam is the darkest, wettest, roughest line on the surface AND the
    // deepest — the previous version had blooms with no cause.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const pits = c.wor(70, { jitter: 1 })
      const lap = c.grid(2, 3, { width: 2.2, bevel: 2.8 })
      const DEPTH = 0.15, SET = 0.03
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = lap(u, v)
          // band 1 — rust blooms. Warped so they creep rather than blob.
          const bloom = c.W(sn, u + g.id * 1.3, v + g.id2 * 2.7, c.fr(4), 1.1, 4) * 0.5 + 0.5
          const rust = smoothstep(0.42, 0.66, bloom + g.rec * 0.22 + g.lip * 0.12)
          // band 2 — streaks running down from the blooms (gravity, water).
          const streak = c.A(pn, u, v, c.fr(40), c.fr(3), 3) * 0.5 + 0.5
          const wash = rust * smoothstep(0.35, 0.8, streak) * 0.6
          // band 3 — pitting, only inside the rust.
          const pd = pits(u, v).f1 * pits.cells
          const pit = (1 - smoothstep(0.05, 0.4, pd)) * rust
          const flake = c.F(vn, u, v, c.fr(90), 2) * 0.5 + 0.5
          const face = 0.55 + rust * 0.14 - pit * 0.3 + (flake - 0.5) * 0.14 * (0.3 + rust)
            + (streak - 0.5) * 0.06 + g.set * SET
          h[i] = clamp01(mix(0.55 - DEPTH + (flake - 0.5) * 0.05, face, g.top))
          const steel = 0.32 + rust * 0.5 + wash * 0.2 + pit * 0.15 + (flake - 0.5) * 0.14
          m[i] = clamp01(mix(0.95, steel, g.top))
          // Iron oxide: orange-brown in the blooms, dark umber in the pits, with
          // the bare metal showing cool where the rust has not reached.
          const rr = 1 + rust * 0.28 - pit * 0.2
          const gg = 1 - rust * 0.16 - pit * 0.22
          const bb = 1 - rust * 0.5 - pit * 0.3
          const t = (0.84 - pit * 0.16 + (flake - 0.5) * 0.06 - wash * 0.06)
            * (1 + g.set * 0.06) * mix(0.72, 1, g.top)
          paint(a, i * 3, t * rr, t * gg, t * bb)
        }
      }
    },
  },

  // Gold is polished metal plus a hammered planish and tarnish in the crevices.
  // Perfectly clean gold reads as yellow plastic under bloom.
  'gold': {
    rghStep: 0.5,
    normal: 1.8, normalScale: 0.7, seed: 109, micro: 0.45,
    // MINTED GOLD, NOT BRASS. 0.12 mean with a 1.9x spread means the planished
    // facets sit near 0.05 (a genuine mirror event under a sun disc) and the
    // tarnished crevices near 0.24. The shipped map realised 0.289 everywhere,
    // and a metal at 0.29 has a GGX peak ~20x lower than at 0.12 — which is why
    // the hero coin measured a 0.06 luminance spread with no highlight in it.
    // Metals have no diffuse term, so roughness IS the entire read.
    rough: { base: 0.12, contrast: 0.16, maskWeight: 0.4, spread: 1.9 },
    ao: { radius: 3, strength: 0.5 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const dimples = c.wor(18, { jitter: 0.9 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const form = c.F(pn, u, v, c.fr(3), 2) * 0.5 + 0.5
          const dd = dimples(u, v).f1 * dimples.cells
          const planish = (1 - smoothstep(0.1, 0.62, dd)) * 0.5        // hammer facets
          const swirl = c.W(sn, u, v, c.fr(50), 0.4, 2) * 0.5 + 0.5
          const micro = c.F(vn, u, v, c.fr(180), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + (form - 0.5) * 0.08 + planish * 0.16
            + (swirl - 0.5) * 0.06 + (micro - 0.5) * 0.05)
          const tarnish = smoothstep(0.5, 0.85, 1 - planish)
          m[i] = clamp01(0.32 + tarnish * 0.22 + (swirl - 0.5) * 0.2 - planish * 0.12)
          const t = 0.9 + planish * 0.08 - tarnish * 0.06
          paint(a, i * 3, t * 1.02, t * 0.985, t * 0.93)
        }
      }
    },
  },

  'chrome': {
    rghStep: 0.5,
    normal: 0.14, normalScale: 0.35, albedo: false, res: 0.5, seed: 113, micro: 0,
    rough: { base: 0.055, contrast: 0.06, maskWeight: 0.24, max: 0.5, spread: 1.4 },
    ao: false,
    build(c) {
      const { N, h, m, vn, sn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const wave = c.F(sn, u, v, c.fr(3), 2) * 0.5 + 0.5
          const swirl = c.W(sn, u, v, c.fr(60), 0.35, 2) * 0.5 + 0.5
          const micro = c.F(vn, u, v, c.fr(240), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + (wave - 0.5) * 0.05 + (swirl - 0.5) * 0.03 + (micro - 0.5) * 0.02)
          // Smudges and the odd fine scratch — the only thing separating chrome
          // from a debug mirror shader.
          const smudge = smoothstep(0.62, 0.95, c.F(vn, u + 6.6, v + 2.2, c.fr(13), 3) * 0.5 + 0.5)
          const scratch = smoothstep(0.9, 1.0, c.A(vn, u, v, c.fr(300), c.fr(3), 1) * 0.5 + 0.5)
          m[i] = clamp01(0.18 + smudge * 0.5 + scratch * 0.45)
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // STONE & GROUND
  // -------------------------------------------------------------------------

  'concrete': {
    albStep: 0.5, rghStep: 0.5,
    normal: 1.9, seed: 127,
    rough: { base: 0.8, contrast: 0.2, maskWeight: 0.5, spread: 1.7 },
    ao: { radius: 6, strength: 1.05 },
    // SAW-CUT CONTROL JOINTS ARE REAL. A poured floor is divided into bays by
    // narrow, deep saw cuts — not by a dark line. Channel amplitude 0.24 of the
    // [0,1] field over a 1.8+2.2 texel shoulder: at `normal: 1.9` on a 512 map
    // that is ~38 deg on the cut wall, so one wall of the cut goes black while
    // the other takes the key. Each bay is floated separately (its own tone and
    // level, ±0.018) and the arris is worn smoother than the bay face.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const agg = c.wor(46, { jitter: 1 })
      const holes = c.wor(26, { jitter: 1 })
      const bay = c.grid(2, 2, { width: 1.8, bevel: 2.2 })
      const DEPTH = 0.24, SET = 0.018
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = bay(u, v)
          // band 1 — pour patches and water staining, the thing that makes a
          // concrete floor look poured rather than tiled.
          const patch = c.W(sn, u + g.id * 2.1, v + g.id2 * 3.3, c.fr(3), 0.8, 4) * 0.5 + 0.5
          const stain = smoothstep(0.4, 0.72, c.W(sn, u + 3.7, v + 6.1, c.fr(5), 0.6, 3) * 0.5 + 0.5)
          // band 2 — aggregate just under the surface + air voids.
          const ad = agg(u, v).f1 * agg.cells
          const stone = (1 - smoothstep(0.18, 0.55, ad)) * 0.35
          const hd = holes(u, v).f1 * holes.cells
          const bubble = (1 - smoothstep(0.0, 0.12, hd)) *
            (hash2((u * holes.cells) | 0, (v * holes.cells) | 0, c.seed) > 0.55 ? 1 : 0)
          // band 3 — sand grain.
          const grain = c.F(vn, u, v, c.fr(160), 2) * 0.5 + 0.5
          const face = 0.6 + (patch - 0.5) * 0.14 + stone * 0.1 - bubble * 0.34
            + (grain - 0.5) * 0.12 + g.set * SET
          // The kerf: sawn, so it is smoother than the floated face, and it
          // collects the grit that never gets swept out of a joint.
          const kerf = 0.6 - DEPTH + (grain - 0.5) * 0.05
          h[i] = clamp01(mix(kerf, face, g.top))
          const flr = 0.84 - stain * 0.24 + bubble * 0.1 + (grain - 0.5) * 0.16
          m[i] = clamp01(mix(0.72, flr - g.lip * 0.08, g.top))
          const t = (0.86 + (patch - 0.5) * 0.12 - stain * 0.14 - bubble * 0.18
            + (grain - 0.5) * 0.07) * (1 + g.set * 0.05) * mix(0.72, 1, g.top)
          paint(a, i * 3, t * 1.0, t * 0.995, t * 0.985)
        }
      }
    },
  },

  'asphalt': {
    normal: 1.4, res: 0.5, seed: 131,
    rough: { base: 0.85, contrast: 0.22, maskWeight: 0.5, spread: 1.9 },
    ao: { radius: 6, strength: 1.15 },
    // PAVING JOINT. Two lanes of mat laid side by side leave a longitudinal
    // joint that is then crack-sealed: a 0.16-deep trough (over a 2.6+3.6 texel
    // shoulder, ~24 deg at `normal: 1.4`) filled with tar that is far SMOOTHER
    // than the surrounding aggregate. Relief and roughness both step at the
    // same line, so the joint darkens in shade and gleams under a low sun
    // instead of holding one value through the sweep.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const chips = c.wor(58, { jitter: 1 })
      const lane = c.grid(2, 1, { axis: 'u', width: 2.6, bevel: 3.6 })
      const DEPTH = 0.16
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = lane(u, v)
          const wear = c.F(sn, u, v, c.fr(3), 3) * 0.5 + 0.5
          const s = chips(u, v)
          const cd = s.f1 * chips.cells
          // Aggregate chips standing proud of the binder — high contrast, hard
          // edges. Asphalt is chips first, noise second.
          const chip = 1 - smoothstep(0.16, 0.46, cd)
          const chipTone = hash2(s.id % 4096, (s.id / 4096) | 0, c.seed)
          const crack = smoothstep(0.72, 0.95, c.R(pn, u, v, c.fr(7), 4, 1.4) * 0.5 + 0.5)
          const grit = c.F(vn, u, v, c.fr(190), 2) * 0.5 + 0.5
          const mat = 0.5 + chip * 0.3 * (0.6 + chipTone * 0.4) + (wear - 0.5) * 0.12
            - crack * 0.3 + (grit - 0.5) * 0.14
          // Sealant meniscus: poured hot, so it wets up the trough walls and
          // dries slightly domed in the middle.
          const seal = 0.5 - DEPTH + g.rec * 0.05 + (grit - 0.5) * 0.03
          h[i] = clamp01(mix(seal, mat, g.top))
          // Oil and rubber deposits — low roughness patches that ignore relief.
          const oil = smoothstep(0.62, 0.9, c.W(sn, u + 8.1, v + 4.4, c.fr(4), 0.7, 3) * 0.5 + 0.5)
          const road = 0.92 - oil * 0.45 - chip * 0.1 * chipTone + (grit - 0.5) * 0.12
          m[i] = clamp01(mix(0.36, road, g.top))
          const t = (0.8 + chip * 0.12 * chipTone + (wear - 0.5) * 0.1 - crack * 0.1 - oil * 0.14)
            * mix(0.7, 1, g.top)
          paint(a, i * 3, t * 1.0, t * 0.995, t * 0.99)
        }
      }
    },
  },

  'marble': {
    albStep: 0.5, rghStep: 0.5,
    normal: 2.2, normalScale: 0.6, seed: 137, micro: 0.5,
    // A polished marble floor is a near-mirror: the lobby floor in r1-match-tower
    // measured a 0.009 luminance spread between p95 and p99.5, i.e. no specular
    // event at all on a surface whose entire job is to reflect the city glass.
    // 0.14 mean with a 1.7x spread puts the polished field near 0.09 and the
    // softer vein mineral near 0.24 — the vein/body roughness step is what makes
    // marble read as stone rather than as printed paper.
    rough: { base: 0.14, contrast: 0.14, maskWeight: 0.45, spread: 1.7 },
    ao: { radius: 4, strength: 0.75 },
    // SLAB JOINTS ARE REAL (round-6 P1). A marble floor is not one continuous
    // swirl: it is cut slabs bedded in grout. Height amplitude of the grout
    // channel is 0.12 of the [0,1] field over a 2.4+3.4 texel shoulder, which
    // at `normal: 2.2` derives to ~34 deg of tilt on the slab edge — so the
    // joint occludes on one side and catches the key on the other instead of
    // reading the same in shadow and in a specular hotspot. Each slab is also
    // its OWN cut of stone (the vein field is offset per tile), sits 0.026
    // proud or low of its neighbour, and the grout itself is matte mortar at
    // 0.9 against a 0.14 polish — a roughness step the sweep cannot ignore.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const f = c.fr(4)
      const slab = c.grid(3, 3, { width: 2.4, bevel: 3.4 })
      const DEPTH = 0.12, SET = 0.026
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = slab(u, v)
          // Per-slab domain offset: veins that run unbroken across a grout line
          // are the tell that the "tiles" are painted on one sheet.
          const ou = u + g.id * 3.7, ov = v + g.id2 * 2.9
          // band 1 — the turbulent body of the stone.
          const body = c.W(sn, ou, ov, f, 1.3, 4) * 0.5 + 0.5
          // band 2 — veins: ridged noise on the SAME warped field, so the veins
          // follow the body's folds instead of crossing them.
          const [wx, wy] = domainWarp2D(sn, ou * f, ov * f, 1.3, { period: f, octaves: 3 })
          const vein = Math.pow(clamp01(1 - Math.abs(fbm2D(pn, wx, wy, { octaves: 4, period: f }))), 9)
          const vein2 = Math.pow(clamp01(1 - Math.abs(fbm2D(pn, wx * 2 + 1.7, wy * 2, { octaves: 3, period: f * 2 }))), 14)
          // band 3 — crystalline sparkle in the polish.
          const cryst = c.F(vn, u, v, c.fr(220), 2) * 0.5 + 0.5
          const vn2 = clamp01(vein * 0.8 + vein2 * 0.5)
          const face = 0.55 + (body - 0.5) * 0.08 - vn2 * 0.1 + (cryst - 0.5) * 0.05 + g.set * SET
          // Mortar bed: its own coarse grain, well below the slab faces.
          const bed = 0.55 - DEPTH + (cryst - 0.5) * 0.03
          h[i] = clamp01(mix(bed, face, g.top))
          // Veins are softer mineral: they polish differently. That difference
          // is the entire reason marble reads as stone and not printed paper.
          const pol = 0.34 + vn2 * 0.3 + (body - 0.5) * 0.14 + (cryst - 0.5) * 0.1
          // The shoulder is walked-on and slightly dulled; the grout is mortar.
          m[i] = clamp01(mix(0.9, pol + g.lip * 0.1, g.top))
          const t = (0.92 - vn2 * 0.22 + (body - 0.5) * 0.1) * (1 + g.set * 0.07)
          const gt = mix(0.66, 1, g.top)
          paint(a, i * 3, t * gt * (1.0 + vn2 * 0.02), t * gt * (1.0 - vn2 * 0.01), t * gt * (1.0 - vn2 * 0.03))
        }
      }
    },
  },

  'granite': {
    normal: 1.8, res: 0.5, seed: 139,
    // Dressed masonry, not a polished counter-top: `stone` is the only preset
    // that consumes this kind and it asks for 0.62. The mineral-species term in
    // the mask still swings ±0.15 around it, which is granite's whole read.
    rough: { base: 0.6, contrast: 0.2, maskWeight: 0.55, spread: 1.7 },
    ao: { radius: 5, strength: 0.95 },
    // DRESSED MASONRY, SO THE MORTAR IS A REAL RECESS. Running-bond courses,
    // mortar channel 0.17 deep in the [0,1] field over a 3.0+3.6 texel
    // shoulder; at `normal: 1.8` on a 256 map that derives to ~30 deg on the
    // block arris. Blocks sit ±0.017 out of plane, and each block gets its own
    // crystal draw (the worley field is offset per block) so the speckle does
    // not run continuously across a joint — the previous version's paintRatio
    // of 1.10 was the lowest of any environment kind, i.e. its colour detail
    // sat on flat surface.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      // 70 cells on a 256 map is 3.6 texels per crystal: the species colour
      // changes every four texels, so no relief authored at that border can
      // survive the Sobel and the mineral map degenerates into a print. 40
      // cells is 6.4 texels — coarse enough for the intercrystalline groove
      // below to actually be a groove.
      const crystals = c.wor(40, { jitter: 1 })
      const course = c.grid(4, 6, { bond: true, width: 3.0, bevel: 3.6 })
      const DEPTH = 0.17, SET = 0.034
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = course(u, v)
          const bu = u + g.id * 2.3, bv = v + g.id2 * 1.7
          const body = c.F(sn, bu, bv, c.fr(4), 3) * 0.5 + 0.5
          const s = crystals(bu, bv)
          // Three mineral species per the classic quartz/feldspar/mica split —
          // one speckle noise gives grey static, three give granite.
          const species = hash2(s.id % 4096, (s.id / 4096) | 0, c.seed + 11)
          const cd = s.f1 * crystals.cells
          const face = 1 - smoothstep(0.35, 0.7, cd)
          // Intercrystalline groove. The species COLOUR changes at the cell
          // border, so unless the surface changes there too the mineral map is
          // a print — that is exactly what dragged this kind's paintRatio to
          // 1.10. f2-f1 is the distance to the border, not to the cell centre.
          const rim = 1 - smoothstep(0, 0.2, (s.f2 - s.f1) * crystals.cells)
          // Mica is a SPECIES, not a sprinkle. The old version drew it from a
          // 190-cell worley — 1.3 texels per cell on a 256 map, i.e. past
          // Nyquist — so it was a single-texel colour dot with no relief and no
          // roughness footprint the shader could resolve. Now it is the third
          // mineral of the crystal field itself: a whole 6-texel platelet that
          // stands proud, reflects like a mirror and reads dark. Same three-way
          // split, one fewer worley table, and the colour finally coincides with
          // a surface event.
          // ROUND-7: the platelet PROFILE was still wrong, and it is why this
          // kind sat at paintRatio 0.96 — the lowest in the table and under 1,
          // meaning its strongest colour edges landed on surface FLATTER than
          // the map's mean. `smoothstep(0.72, 0.4, cd)` peaks at the cell CENTRE
          // and decays to zero at the border, so the relief was a soft dome
          // while the colour was a hard per-cell step: at the border the albedo
          // fell 20% across one texel with no relief under it at all. A mica
          // platelet is a flat plate with a sharp edge. Flat-topped out to
          // cd 0.46, then a two-texel cliff — colour and relief now share the
          // same edge (see the albedo blend below, which is gated by this same
          // mask instead of by `species`).
          const mica = species > 0.75 ? (1 - smoothstep(0.46, 0.66, cd)) : 0
          const grain = c.F(vn, u, v, c.fr(200), 2) * 0.5 + 0.5
          // Mica platelets stand PROUD of a dressed face and are near-mirror —
          // as a colour-only dot they were the strongest albedo edge on the map
          // sitting on dead-flat surface.
          const blk = 0.55 + (body - 0.5) * 0.08 + face * 0.1 + (grain - 0.5) * 0.1
            - rim * 0.1 + mica * 0.17 + g.set * SET
          // Struck mortar: coarser sand grain than the stone, sitting well back.
          const mort = 0.55 - DEPTH + (grain - 0.5) * 0.05
          h[i] = clamp01(mix(mort, blk, g.top))
          const stone = 0.42 + (species < 0.4 ? 0.16 : species < 0.75 ? 0 : -0.14)
            - mica * 0.35 + (grain - 0.5) * 0.16
          m[i] = clamp01(mix(0.94, stone + g.lip * 0.08, g.top))
          let r = 1, gg = 1, b = 1
          if (species < 0.4) { r = 1.02; gg = 0.99; b = 0.95 }        // feldspar, warm
          else if (species < 0.75) { r = 0.96; gg = 0.98; b = 1.02 }  // quartz, cool
          else {                                                       // mica, dark
            // Gated by the platelet mask, not by the species alone, so the dark
            // colour stops exactly where the plate's edge is. Off the plate the
            // cell reads as the groundmass it is bedded in.
            r = mix(0.96, 0.8, mica); gg = mix(0.98, 0.8, mica); b = mix(1.02, 0.84, mica)
          }
          const t = (0.86 + (body - 0.5) * 0.1 + face * 0.05 + (grain - 0.5) * 0.08 + mica * 0.1)
            * (1 + g.set * 0.06)
          // Lime mortar is lighter and flatter than the stone it beds.
          const mt = mix(0.9, 1, g.top)
          paint(a, i * 3, t * mt * mix(1, r, g.top), t * mt * mix(1, gg, g.top), t * mt * mix(1, b, g.top))
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // WOOD — planks first, grain second. A grain map with no plank layout reads
  // as wood-effect vinyl.
  // -------------------------------------------------------------------------

  'wood-plank': {
    normal: 1.5, seed: 149,
    rough: { base: 0.62, contrast: 0.26, maskWeight: 0.55, spread: 1.8 },
    ao: { radius: 7, strength: 1.25 },
    // FINITE BOARDS, CHAMFERED EDGES, BUTT JOINTS. The old layout had one
    // continuous strip per row with a hard 0.5 cliff at the long edge and no
    // cross-cut at all, so every "plank" ran the whole width of the surface and
    // the gap was a vertical wall the Sobel turned into a one-texel spike
    // rather than a readable arris. Now the gap is a 0.2-deep channel with a
    // 2.0+2.8 texel chamfer either side (~30 deg at `normal: 1.5` on 512), the
    // rows are broken by staggered butt joints, and each board is crowned by
    // 0.03 so the key light runs a soft length-wise highlight down it and dies
    // at the joint.
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const rows = c.fe(5)
      const ringF = c.fr(26)
      const board = c.grid(3, 5, { bond: true, width: 2.0, bevel: 2.8 })
      const DEPTH = 0.2, SET = 0.03
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = board(u, v)
          const pv = v * rows
          const pi = Math.floor(pv), pf = pv - pi
          // band 1 — per-board identity: each board is a different cut of a
          // different tree, so tone, pith position and knots all vary by board.
          // Keyed on the BUTT-JOINT lattice, not on the row, so two boards end
          // to end are two different pieces of timber.
          const tone = g.id
          const pith = 0.5 + (g.id2 - 0.5) * 0.9
          // A knot per board, which bends the rings around it.
          const ku = hash2(pi, 7, c.seed)
          const kv = 0.25 + hash2(pi, 8, c.seed) * 0.5
          const du = Math.abs(frac(u - ku + 0.5) - 0.5)
          const dv = (pf - kv) / rows
          const knot = Math.exp(-(du * du + dv * dv) / 0.0012)
          // band 2 — growth rings, warped along the length of the board.
          const wob = c.A(pn, u, v, c.fr(6), c.fr(2), 3) * 0.05
          const ringCoord = (pf - pith) + wob + knot * 0.45
          const ring = Math.pow(Math.abs(Math.sin(ringCoord * Math.PI * ringF)), 0.55)
          // band 3 — open pores along the grain direction.
          const pore = c.A(vn, u, v, c.fr(300), c.fr(9), 2) * 0.5 + 0.5
          // Crown: a laid board is never dead flat across its width.
          const crown = (1 - 4 * (pf - 0.5) * (pf - 0.5)) * 0.03
          const face = 0.6 + (tone - 0.5) * 0.06 - ring * 0.16 - knot * 0.16
            + (pore - 0.5) * 0.1 + crown + g.set * SET
          // The gap itself: subfloor grime, matte and full of dust.
          const slot = 0.6 - DEPTH + (pore - 0.5) * 0.03
          h[i] = clamp01(mix(slot, face, g.top))
          // Latewood (the dark rings) is denser and takes a different sheen from
          // earlywood; varnish pools in the pores. The chamfer is walked bare.
          const brd = 0.62 + ring * 0.22 - knot * 0.18 + (pore - 0.5) * 0.24
          m[i] = clamp01(mix(0.95, brd + g.lip * 0.14, g.top))
          const t = (0.86 + (tone - 0.5) * 0.14 - ring * 0.2 - knot * 0.22) * mix(0.62, 1, g.top)
          paint(a, i * 3, t * 1.04, t * 0.96, t * 0.86)
        }
      }
    },
  },

  'wood-rough': {
    normal: 1.3, res: 0.5, seed: 151,
    rough: { base: 0.8, contrast: 0.22, maskWeight: 0.5, spread: 2.0, min: 0.24 },
    ao: { radius: 6, strength: 1.2 },
    // SAWN BOARDS WITH REAL GAPS. Crate slats and dock decking are individual
    // pieces of timber that do not lie flush: a 0.18-deep gap over a 2.4+3.2
    // texel shoulder (~22 deg at `normal: 1.3`), plus a ±0.055 per-board level
    // step, which is the single loudest cue that this is boards and not a
    // wood-effect wrap. Each board also carries its own grain draw.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const ringF = c.fr(20)
      const slat = c.grid(1, 4, { axis: 'v', width: 2.4, bevel: 3.2 })
      const DEPTH = 0.18, SET = 0.11
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = slat(u, v)
          const weather = c.W(sn, u, v + g.id * 1.9, c.fr(3), 0.7, 3) * 0.5 + 0.5   // band 1: greying
          const wob = c.A(pn, u, v, c.fr(5), c.fr(2), 3) * 0.09
          const ring = Math.pow(Math.abs(Math.sin((v + wob + g.id2) * Math.PI * ringF)), 0.45)
          // Raised grain: on weathered timber the soft earlywood erodes and the
          // hard latewood stands proud. That inversion is the look.
          const splinter = c.A(vn, u, v, c.fr(420), c.fr(14), 2) * 0.5 + 0.5
          // Circular-saw ripple across the board.
          const saw = c.A(vn, u, v, c.fr(3), c.fr(64), 2) * 0.5 + 0.5
          const face = 0.5 + ring * 0.24 + (splinter - 0.5) * 0.2 + (saw - 0.5) * 0.1
            + (weather - 0.5) * 0.12 + g.set * SET
          const gapf = 0.5 - DEPTH + (splinter - 0.5) * 0.04
          h[i] = clamp01(mix(gapf, face, g.top))
          const brd = 0.86 + (weather - 0.5) * 0.2 - ring * 0.08 + (splinter - 0.5) * 0.16
          m[i] = clamp01(mix(0.97, brd, g.top))
          const t = (0.84 - ring * 0.14 + (weather - 0.5) * 0.16 + (splinter - 0.5) * 0.08)
            * (1 + g.set * 0.08) * mix(0.6, 1, g.top)
          // Weathered timber loses its warmth: silvered where exposed, brown in
          // the shelter of the grain.
          const grey = weather
          paint(a, i * 3, t * (1.02 - grey * 0.06), t * (0.96 + grey * 0.02), t * (0.88 + grey * 0.1))
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // ELEMENTS
  // -------------------------------------------------------------------------

  'ice': {
    albStep: 0.5,
    normal: 1.7, normalScale: 0.8, seed: 157, micro: 0.3,
    rough: { base: 0.14, contrast: 0.18, maskWeight: 0.55 },
    ao: { radius: 5, strength: 0.7 },
    // PLATE CRACKS ARE GEOMETRY. A frozen sheet breaks into plates and refreezes
    // along the break: a 0.11-deep channel over a 1.4+2.6 texel shoulder (~26
    // deg at `normal: 1.7`), with the refrozen line frosted (rough) against a
    // 0.14 wet polish. Under the arena's cold key the crack now darkens on one
    // side and takes a hard specular on the other instead of holding one value.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const bubbles = c.wor(44, { jitter: 1 })
      const plate = c.grid(3, 3, { bond: true, width: 1.4, bevel: 2.6 })
      const DEPTH = 0.11, SET = 0.02
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = plate(u, v)
          // band 1 — internal fracture planes, read through the surface.
          const frac1 = c.R(pn, u + g.id * 2.1, v + g.id2 * 1.3, c.fr(5), 4, 1.3) * 0.5 + 0.5
          // band 2 — surface melt undulation + trapped bubbles.
          const melt = c.W(sn, u, v, c.fr(9), 0.6, 3) * 0.5 + 0.5
          const bd = bubbles(u, v).f1 * bubbles.cells
          const bub = (1 - smoothstep(0.02, 0.22, bd)) *
            (hash2((u * bubbles.cells) | 0, (v * bubbles.cells) | 0, c.seed) > 0.45 ? 1 : 0)
          // band 3 — micro crazing.
          const craze = c.F(vn, u, v, c.fr(170), 2) * 0.5 + 0.5
          const face = 0.55 + frac1 * 0.12 + (melt - 0.5) * 0.16 - bub * 0.14
            + (craze - 0.5) * 0.06 + g.set * SET
          h[i] = clamp01(mix(0.55 - DEPTH + (craze - 0.5) * 0.03, face, g.top))
          // Frost patches: opaque, rough, and completely independent of the
          // relief — the contrast between wet-clear and frosted is the material.
          const frost = smoothstep(0.5, 0.78, c.W(sn, u + 4.9, v + 7.2, c.fr(6), 0.9, 3) * 0.5 + 0.5)
          const clear = 0.16 + frost * 0.55 + bub * 0.12 + (craze - 0.5) * 0.1
          m[i] = clamp01(mix(0.66, clear, g.top))
          const t = (0.9 + frost * 0.08 + bub * 0.06 - frac1 * 0.06) * mix(0.94, 1, g.top)
          paint(a, i * 3, t * (0.94 + frost * 0.04), t * 0.99, t * 1.03)
        }
      }
    },
  },

  'snow': {
    albStep: 0.5,
    normal: 2, res: 0.5, seed: 163,
    rough: { base: 0.7, contrast: 0.16, maskWeight: 0.6, spread: 1.5 },
    ao: { radius: 5, strength: 0.7 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const drift = c.A(sn, u, v, c.fr(3), c.fr(5), 3) * 0.5 + 0.5   // band 1
          const dune = c.F(pn, u, v, c.fr(14), 3) * 0.5 + 0.5            // band 2
          const grain = c.F(vn, u, v, c.fr(150), 2) * 0.5 + 0.5          // band 3
          const crust = smoothstep(0.55, 0.85, c.R(pn, u, v, c.fr(11), 3, 1.5) * 0.5 + 0.5)
          const facet = c.sp(x >> 1, y >> 1, 5) > 0.9955 ? 1 : 0
          h[i] = clamp01(0.55 + (drift - 0.5) * 0.24 + (dune - 0.5) * 0.16
            + (grain - 0.5) * 0.1 - crust * 0.08 + facet * 0.05)
          // Sparkle: individual ice facets catching the sun. Near-mirror, and —
          // this is the round-6 fix — an actual FACET, not a bright dot. The
          // old glint was a single texel of albedo and roughness on dead-flat
          // ground, which is why snow's paintRatio was 0.94, the lowest in the
          // table: its strongest colour detail had no surface under it. A 2x2
          // block (sampled on x>>1, y>>1) survives the Sobel and the first mip,
          // and it now lifts the height field by 0.05 as a tilted crystal.
          const glint = facet
          m[i] = clamp01(0.74 + crust * 0.14 - glint * 0.72 + (grain - 0.5) * 0.12)
          const t = 0.94 + (drift - 0.5) * 0.06 + glint * 0.06 - crust * 0.03
          paint(a, i * 3, t * 0.99, t * 0.995, t * 1.01)
        }
      }
    },
  },

  'sand': {
    normal: 2, res: 0.5, seed: 167,
    rough: { base: 0.83, contrast: 0.18, maskWeight: 0.5, spread: 2.2, min: 0.2 },
    ao: { radius: 4, strength: 0.8 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const pebbles = c.wor(36, { jitter: 1 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const dune = c.A(sn, u, v, c.fr(2), c.fr(4), 3) * 0.5 + 0.5    // band 1
          // band 2 — wind ripples: strongly anisotropic, wandering with the
          // dune field so they do not read as corduroy.
          const drift = c.F(sn, u + 2.5, v, c.fr(4), 2) * 0.06
          const ripple = Math.pow(Math.abs(Math.sin((v + drift) * Math.PI * c.fe(34))), 0.7)
          const pd = pebbles(u, v).f1 * pebbles.cells
          const peb = (1 - smoothstep(0.04, 0.2, pd)) *
            (hash2((u * pebbles.cells) | 0, (v * pebbles.cells) | 0, c.seed) > 0.6 ? 1 : 0)
          const grain = c.F(vn, u, v, c.fr(230), 2) * 0.5 + 0.5          // band 3
          h[i] = clamp01(0.5 + (dune - 0.5) * 0.2 + ripple * 0.16 + peb * 0.12 + (grain - 0.5) * 0.14)
          // Damp patches read darker and glossier — the classic tide line.
          const damp = smoothstep(0.6, 0.85, c.W(sn, u + 7.7, v + 1.1, c.fr(3), 0.8, 3) * 0.5 + 0.5)
          m[i] = clamp01(0.9 - damp * 0.45 + (grain - 0.5) * 0.14 - peb * 0.1)
          const t = 0.88 - damp * 0.18 + ripple * 0.06 + (grain - 0.5) * 0.09 + peb * 0.05
          paint(a, i * 3, t * 1.04, t * 0.98, t * 0.86)
        }
      }
    },
  },

  'mud': {
    normal: 1.35, res: 0.5, seed: 173,
    rough: { base: 0.74, contrast: 0.26, maskWeight: 0.65, spread: 1.5 },
    ao: { radius: 6, strength: 1.2 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const plates = c.wor(11, { jitter: 0.95 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const wx = u + c.F(sn, u, v, c.fr(6), 3) * 0.025
          const wy = v + c.F(sn, u + 2.2, v + 5.5, c.fr(6), 3) * 0.025
          const p = plates(wx, wy)
          // Dried mud curls: the plate edges lift, so the crack is deep AND the
          // rim is raised. Only doing the crack gives you cracked paint.
          const seam = (p.f2 - p.f1) * plates.cells
          const crack = 1 - smoothstep(0, 0.09, seam)
          const curl = smoothstep(0.06, 0.24, seam) * (1 - smoothstep(0.24, 0.5, seam))
          const lump = c.F(pn, u, v, c.fr(16), 3) * 0.5 + 0.5
          const grit = c.F(vn, u, v, c.fr(140), 2) * 0.5 + 0.5
          h[i] = clamp01(0.58 - crack * 0.42 + curl * 0.14 + (lump - 0.5) * 0.16 + (grit - 0.5) * 0.1)
          // Standing water in the cracks and hollows: the wettest thing in the
          // game, and it must not correlate with the lump noise.
          const wet = clamp01(crack * 0.8 + smoothstep(0.55, 0.85,
            c.W(sn, u + 9.9, v + 3.3, c.fr(4), 0.9, 3) * 0.5 + 0.5))
          m[i] = clamp01(0.82 - wet * 0.62 + (grit - 0.5) * 0.14)
          const t = 0.82 - wet * 0.22 + (lump - 0.5) * 0.1 + curl * 0.08
          paint(a, i * 3, t * 1.02, t * 0.93, t * 0.82)
        }
      }
    },
  },

  'water': {
    normal: 0.55, normalScale: 0.7, albedo: false, res: 0.5, seed: 179, micro: 0,
    rough: { base: 0.08, contrast: 0.1, maskWeight: 0.35, max: 0.6 },
    ao: false,
    build(c) {
      const { N, h, m, vn, pn, sn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // Two crossed wave trains at different angles and scales: a single
          // train reads as a washboard, which is the classic bad-water tell.
          const swellA = c.A(sn, u, v, c.fr(3), c.fr(7), 3) * 0.5 + 0.5
          const swellB = c.A(sn, u + 3.1, v + 1.4, c.fr(8), c.fr(2), 3) * 0.5 + 0.5
          const chop = c.W(pn, u, v, c.fr(22), 0.5, 3) * 0.5 + 0.5
          const ripple = c.F(vn, u, v, c.fr(90), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + (swellA - 0.5) * 0.26 + (swellB - 0.5) * 0.2
            + (chop - 0.5) * 0.14 + (ripple - 0.5) * 0.08)
          // Foam and surface scum break up the specular — without them water is
          // a mirror and reads as chrome.
          const foam = smoothstep(0.68, 0.92, chop * 0.6 + swellA * 0.4)
          m[i] = clamp01(0.1 + foam * 0.6 + (ripple - 0.5) * 0.08)
        }
      }
    },
  },

  'glass': {
    normal: 0.16, normalScale: 0.4, albedo: false, res: 0.5, seed: 181, micro: 0,
    rough: { base: 0.05, contrast: 0.06, maskWeight: 0.3, max: 0.55 },
    ao: false,
    build(c) {
      const { N, h, m, vn, pn, sn } = c
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // Float glass is never flat: the ribbon leaves a slow waviness that
          // you read in the reflected straight lines.
          const ribbon = c.A(sn, u, v, c.fr(2), c.fr(4), 2) * 0.5 + 0.5
          const wave = c.F(pn, u, v, c.fr(7), 2) * 0.5 + 0.5
          const micro = c.F(vn, u, v, c.fr(200), 2) * 0.5 + 0.5
          h[i] = clamp01(0.5 + (ribbon - 0.5) * 0.06 + (wave - 0.5) * 0.03 + (micro - 0.5) * 0.02)
          const grime = smoothstep(0.55, 0.9, c.W(sn, u + 5.2, v + 6.6, c.fr(5), 0.8, 3) * 0.5 + 0.5)
          const dust = c.sp(x, y, 9) > 0.985 ? 1 : 0
          m[i] = clamp01(0.12 + grime * 0.5 + dust * 0.5)
        }
      }
    },
  },

  // -------------------------------------------------------------------------
  // TECH & MISC
  //
  // These four are the kinds whose identity IS the pattern, so their albedo is
  // allowed far more contrast than the modulation rule elsewhere in this file.
  // `neon-panel`'s map doubles as an emissive mask: bright inside the tube,
  // near-black on the housing, which is exactly what emissive() wants so that
  // bloom picks out the tube and not the panel around it.
  // -------------------------------------------------------------------------

  'neon-panel': {
    // albRes 1: the panel's identity is the emissive strip layout, and a strip
    // is a thin high-contrast band — exactly the content a half-res albedo
    // turns into a smear. Costs 0.25 MiB.
    rghStep: 0.5,
    normal: 0.9, res: 0.5, seed: 191, micro: 0.5, albRes: 1,
    rough: { base: 0.3, contrast: 0.24, maskWeight: 0.4 },
    ao: { radius: 4, strength: 0.85 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const tubes = c.fe(6)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const tv = v * tubes
          const ti = Math.floor(tv), tf = tv - ti
          // Tube cross-section: a raised half-round with a bright core and a
          // dimmer falloff at the glass edge.
          const d = Math.abs(tf - 0.5) * 2
          const tube = 1 - smoothstep(0.42, 0.72, d)
          const core = 1 - smoothstep(0.0, 0.4, d)
          // Mounting rail + housing texture between the tubes.
          const rail = smoothstep(0.78, 0.95, d)
          const panel = c.A(pn, u, v, c.fr(3), c.fr(9), 3) * 0.5 + 0.5
          const micro = c.F(vn, u, v, c.fr(120), 2) * 0.5 + 0.5
          // Flicker/ageing along the tube: real neon is never uniform.
          const age = c.A(vn, u, v, c.fr(9), c.fr(2), 3) * 0.5 + 0.5
          h[i] = clamp01(0.45 + tube * 0.3 - rail * 0.16 + (panel - 0.5) * 0.1 + (micro - 0.5) * 0.06)
          m[i] = clamp01(0.3 - tube * 0.2 + rail * 0.45 + (micro - 0.5) * 0.14)
          const t = 0.16 + tube * 0.5 + core * 0.36 * (0.7 + age * 0.4) + (panel - 0.5) * 0.06
          paint(a, i * 3, t * 1.0, t * 0.99, t * 1.0)
        }
      }
    },
  },

  'circuit': {
    // albRes 1: traces are one- and two-texel lines. Half-res albedo breaks the
    // continuity of a trace, which is the one thing a circuit board must have.
    normal: 1.0, res: 0.5, seed: 193, albRes: 1,
    rough: { base: 0.56, contrast: 0.28, maskWeight: 0.55, spread: 1.4 },
    ao: { radius: 4, strength: 0.95 },
    build(c) {
      const { N, h, m, a, vn, pn } = c
      const g = c.fe(20)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const gx = u * g, gy = v * g
          const ix = Math.floor(gx), iy = Math.floor(gy)
          const fx = gx - ix, fy = gy - iy
          // Each cell picks a routing case from its own hash: through-route,
          // corner, pad or blank. Hashing the cell (rather than noising the
          // pixel) is what gives traces their manufactured, right-angle read.
          const r = hash2(ix, iy, c.seed)
          const wid = 0.13
          let trace = 0
          if (r < 0.3) trace = 1 - smoothstep(wid, wid + 0.05, Math.abs(fy - 0.5))
          else if (r < 0.58) trace = 1 - smoothstep(wid, wid + 0.05, Math.abs(fx - 0.5))
          else if (r < 0.78) {
            // Corner: two half-traces meeting at the cell centre.
            const arm1 = (fx >= 0.5 ? 1 : 0) * (1 - smoothstep(wid, wid + 0.05, Math.abs(fy - 0.5)))
            const arm2 = (fy >= 0.5 ? 1 : 0) * (1 - smoothstep(wid, wid + 0.05, Math.abs(fx - 0.5)))
            trace = Math.max(arm1, arm2)
          }
          const pd = Math.sqrt((fx - 0.5) * (fx - 0.5) + (fy - 0.5) * (fy - 0.5))
          const pad = r > 0.86 ? 1 - smoothstep(0.2, 0.28, pd) : 0
          const hole = r > 0.86 ? 1 - smoothstep(0.06, 0.1, pd) : 0
          const solder = c.F(pn, u, v, c.fr(6), 3) * 0.5 + 0.5           // band 1
          const weave = c.A(vn, u, v, c.fr(150), c.fr(150), 2) * 0.5 + 0.5 // band 3: FR4 weave
          const metal = clamp01(trace + pad)
          h[i] = clamp01(0.5 + metal * 0.18 - hole * 0.4 + (solder - 0.5) * 0.08 + (weave - 0.5) * 0.1)
          // Tinned copper is glossy; the solder mask is matte. That split is the
          // entire material.
          m[i] = clamp01(0.78 - metal * 0.5 + hole * 0.2 + (weave - 0.5) * 0.16)
          const t = 0.55 + metal * 0.45 - hole * 0.35 + (solder - 0.5) * 0.08
          paint(a, i * 3, t * (0.72 + metal * 0.35), t * (0.95 + metal * 0.1), t * (0.8 + metal * 0.05))
        }
      }
    },
  },

  'screen-crt': {
    // albRes 1: scanlines are a 1-texel-period 1D pattern. Box-filtering them to
    // half resolution does not soften them, it ALIASES them into a beat pattern.
    normal: 0.6, nearest: false, res: 0.5, seed: 197, micro: 0.4, albRes: 1,
    rough: { base: 0.24, contrast: 0.2, maskWeight: 0.35 },
    ao: false,
    build(c) {
      const { N, h, m, a, vn } = c
      const triads = c.fe(48), lines = c.fe(72)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // Aperture grille: three phosphor stripes per triad, a scanline gap
          // every row, and a phosphor grain on top. Doing only scanlines is the
          // cheap version and it looks like a filter, not a tube.
          const tu = u * triads
          const sub = Math.floor(frac(tu) * 3)
          const stripe = Math.abs(frac(tu) * 3 - sub - 0.5) * 2
          const phos = 1 - smoothstep(0.55, 1.0, stripe)
          const scan = Math.pow(Math.abs(Math.sin(v * Math.PI * lines)), 0.5)
          const grain = c.F(vn, u, v, c.fr(180), 2) * 0.5 + 0.5
          const glassCurve = 1 - smoothstep(0.3, 0.72, Math.hypot(u - 0.5, v - 0.5))
          h[i] = clamp01(0.5 + phos * 0.14 - (1 - scan) * 0.1 + (grain - 0.5) * 0.05)
          m[i] = clamp01(0.26 + (1 - phos) * 0.24 + (grain - 0.5) * 0.14)
          const lit = phos * scan * (0.7 + grain * 0.5) * (0.75 + glassCurve * 0.35)
          const t = 0.2 + lit * 0.85
          paint(a, i * 3,
            t * (sub === 0 ? 1.25 : 0.55),
            t * (sub === 1 ? 1.25 : 0.55),
            t * (sub === 2 ? 1.25 : 0.55))
        }
      }
    },
  },

  // CRYPTO PUNK'D's native surface. Nearest filtering on purpose: this is the
  // one kind in the file allowed to alias, because the pixel grid IS the joke.
  'pixel-grid': {
    rghStep: 0.5,
    normal: 0.7, nearest: true, res: 0.5, seed: 199, micro: 0,
    rough: { base: 0.6, contrast: 0.25, maskWeight: 0.3, spread: 1.4 },
    ao: { radius: 4, strength: 0.85 },
    // THE GUTTER WAS SUB-TEXEL. 24 cells on a 256 map is 10.7 texels per cell,
    // and the old profile ran smoothstep(0.03, 0.1) in CELL fractions — a
    // transition 0.3 to 1.1 texels wide, i.e. narrower than the Sobel kernel.
    // The result was a hard aliasing step, not a moulded edge. The gutter is
    // now specified in texels (1.6 half-width, 2.2 chamfer) against a 0.34
    // cell height, which derives to ~22 deg at `normal: 0.7` and gives every
    // voxel a lit face and a shaded face — the whole point of a voxel head.
    build(c) {
      const { N, h, m, a, vn } = c
      const cell = c.grid(24, 24, { width: 1.6, bevel: 2.2 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = cell(u, v)
          const val = g.id
          const face = g.top
          const grain = c.F(vn, u, v, c.fr(160), 2) * 0.5 + 0.5
          h[i] = clamp01(0.4 + face * 0.34 + (val - 0.5) * 0.1 * face + (grain - 0.5) * 0.06)
          m[i] = clamp01(0.6 + (1 - face) * 0.24 + (val - 0.5) * 0.22)
          const t = 0.8 + (val - 0.5) * 0.22 - (1 - face) * 0.2
          paint(a, i * 3, t, t * 0.995, t * 0.99)
        }
      }
    },
  },

  'paper': {
    normal: 1.8, res: 0.5, seed: 211,
    rough: { base: 0.83, contrast: 0.16, maskWeight: 0.42, spread: 2.4, min: 0.24 },
    ao: { radius: 4, strength: 0.7 },
    // FOLD CREASE. A sheet of paper in this game is a document, and a document
    // has been folded: a 0.09-deep valley over a 2.0+3.0 texel shoulder with a
    // burnished, glossier shoulder either side (~24 deg at `normal: 1.8`). It
    // is the one structural feature paper has, and it is what makes a page read
    // as a physical object rather than a printed quad.
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const fold = c.grid(1, 2, { axis: 'v', width: 2.0, bevel: 3.0 })
      const DEPTH = 0.09
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const g = fold(u, v)
          const cockle = c.F(sn, u, v, c.fr(4), 3) * 0.5 + 0.5           // band 1: sheet warp
          // Pulp fibres lying in two dominant directions — a felted mat, not
          // isotropic noise.
          const fibA = c.A(vn, u, v, c.fr(260), c.fr(30), 2) * 0.5 + 0.5
          const fibB = c.A(vn, u + 1.9, v + 4.1, c.fr(28), c.fr(240), 2) * 0.5 + 0.5
          const speck = c.sp(x, y, 3)
          // A shive (dark wood fleck) is a HARD albedo edge, and it used to be
          // ONLY an albedo edge — a drawn dot on a flat sheet, which under a
          // moving key light does not move at all. Contract §0.1. It is a lump
          // of unbleached lignin sitting proud of the felt, so it gets relief
          // and its own (glossier, resinous) roughness as well as its colour.
          const shive = speck > 0.995 ? 1 : 0
          h[i] = clamp01(0.52 + (cockle - 0.5) * 0.16 + (fibA - 0.5) * 0.14
            + (fibB - 0.5) * 0.14 + (speck - 0.5) * 0.06 + shive * 0.22
            - g.rec * DEPTH + g.lip * DEPTH * 0.35)
          // The crease is burnished by the fold: crushed fibre reflects.
          m[i] = clamp01(0.88 + (fibA - 0.5) * 0.16 - (cockle - 0.5) * 0.1 - shive * 0.4
            - g.lip * 0.18 - g.rec * 0.1)
          const t = 0.9 + (cockle - 0.5) * 0.06 + (fibA - 0.5) * 0.05 - shive * 0.2
            - g.rec * 0.05
          paint(a, i * 3, t * 1.01, t, t * 0.97)
        }
      }
    },
  },

  'bone': {
    normal: 1.7, res: 0.5, seed: 223,
    rough: { base: 0.5, contrast: 0.24, maskWeight: 0.56, spread: 2.0, min: 0.14 },
    ao: { radius: 4, strength: 0.9 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const pores = c.wor(70, { jitter: 1 })
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          const form = c.W(sn, u, v, c.fr(4), 0.7, 3) * 0.5 + 0.5        // band 1
          // Osteon striations run along the bone's long axis.
          const striae = c.A(pn, u, v, c.fr(14), c.fr(90), 3) * 0.5 + 0.5
          const pd = pores(u, v).f1 * pores.cells
          const pore = (1 - smoothstep(0.0, 0.2, pd)) *
            (hash2((u * pores.cells) | 0, (v * pores.cells) | 0, c.seed) > 0.4 ? 1 : 0)
          const crack = smoothstep(0.8, 0.97, c.R(pn, u + 2.2, v, c.fr(9), 3, 1.8) * 0.5 + 0.5)
          const grain = c.F(vn, u, v, c.fr(200), 2) * 0.5 + 0.5
          h[i] = clamp01(0.58 + (form - 0.5) * 0.12 + (striae - 0.5) * 0.12
            - pore * 0.26 - crack * 0.24 + (grain - 0.5) * 0.06)
          // Age staining collects in the pores and cracks; the polished shafts
          // stay smooth and slightly waxy.
          const stain = clamp01(pore * 0.7 + crack * 0.8 +
            smoothstep(0.55, 0.85, c.F(sn, u + 6.3, v + 2.9, c.fr(5), 3) * 0.5 + 0.5) * 0.5)
          m[i] = clamp01(0.38 + stain * 0.52 + (grain - 0.5) * 0.12)
          const t = 0.92 - stain * 0.22 + (form - 0.5) * 0.08
          paint(a, i * 3, t * 1.02, t * 0.99, t * 0.9)
        }
      }
    },
  },

  // BLACKISH BULL's horns. Keratin laid down in growth bands, with a fibrous
  // grain running along the horn and a polish that varies band to band.
  'horn': {
    // Keratin bundles run the length of a horn, so its highlight is a stretched
    // band, not a spot — the ivory-contrast note in the Wally brief is partly
    // this. `nrmAniso` biases the derived normal across the fibre; `aniso` is
    // the real GGX term for when materials.js wires it.
    normal: 1.85, res: 0.5, seed: 227, micro: 1.1,
    nrmAniso: [1.22, 0.8], aniso: [0.34, Math.PI / 2],
    rough: { base: 0.32, contrast: 0.26, maskWeight: 0.5, spread: 1.45 },
    ao: { radius: 4, strength: 0.85 },
    build(c) {
      const { N, h, m, a, vn, pn, sn } = c
      const rings = c.fe(16)
      for (let y = c.y0; y < c.y1; y++) {
        const v = y / N
        for (let x = 0; x < N; x++) {
          const u = x / N, i = y * N + x
          // band 1 — growth bands across the horn, irregularly spaced.
          const jitterB = c.F(sn, u, v, c.fr(3), 3) * 0.04
          const ringPos = (v + jitterB) * rings
          const ri = Math.floor(ringPos), rf = ringPos - ri
          const band = Math.pow(Math.abs(Math.sin(rf * Math.PI)), 0.7)
          const bandTone = hash2(ri, 0, c.seed)
          // band 2 — fibrous keratin bundles running the length of the horn.
          const fibre = c.A(vn, u, v, c.fr(70), c.fr(6), 3) * 0.5 + 0.5
          // band 3 — scuffs and micro pitting on the outer surface.
          const scuff = c.A(vn, u + 3.3, v, c.fr(200), c.fr(20), 2) * 0.5 + 0.5
          h[i] = clamp01(0.52 + band * 0.16 + (fibre - 0.5) * 0.18 + (scuff - 0.5) * 0.1
            + (bandTone - 0.5) * 0.04)
          m[i] = clamp01(0.4 - band * 0.16 + (bandTone - 0.5) * 0.28 + (scuff - 0.5) * 0.2)
          const t = 0.86 + band * 0.08 + (bandTone - 0.5) * 0.16 + (fibre - 0.5) * 0.07
          paint(a, i * 3, t * 1.01, t * 0.98, t * 0.94)
        }
      }
    },
  },
}

// ---------------------------------------------------------------------------
// Self-test
//
// Runs headlessly (node, no canvas, no GL) because every surface map is built
// from typed arrays. Generates every kind and reports per-kind wall time, byte
// count and seam error, plus a sharing check that the cache really does hand
// two callers the same texture object.
//
//   node -e "import('./src/render/textures.js').then(m=>console.log(m.__selfTest({size:128})))"
//
// `seam` is the wrap discontinuity relative to the field's own interior
// gradient: under ~1.5 is invisible, double digits means a broken tile.
// ---------------------------------------------------------------------------
/**
 * mapResponse(entry) -> { tilt, tiltP95, rough, roughSd, roughRange, albSd }
 *
 * THE AMATEUR-TELL METRIC. A critic's exact words about the shipped build were:
 * "the plank gaps are hard black lines painted into the albedo and hard-edged
 * green circles painted in for moss — they do not move under light because they
 * are colour, not surface." That failure is measurable without a renderer:
 *
 *   tilt      mean normal deviation from flat, in DEGREES, decoded from the
 *             normal map bytes exactly as the shader does. Under a moving key
 *             light a surface only "moves" if its normals do. Below ~3 deg the
 *             surface is a decal; 8-20 deg is a material.
 *   roughSd   standard deviation of the roughness map. Below ~0.02 the specular
 *             lobe is the same width over the whole surface — the "no spatially
 *             varying roughness" tell. Mirrors (chrome, water, glass) are the
 *             legitimate exception and are allowed to sit low.
 *   albSd     standard deviation of albedo luminance. Not a target in itself,
 *             but albSd high with tilt low is precisely the painted-detail
 *             failure, so the two are always reported together.
 */
function mapResponse(entry) {
  const n = entry.nrm
  const px = entry.size * entry.size
  let tsum = 0
  const tilts = new Float32Array(px)
  // Tilt from X/Y, NOT from Z. Z lives at the very top of the byte range — a
  // 5-degree tilt still encodes as 254 — so reading acos(nz) reports 0 for
  // every surface below ~7 degrees and makes a perfectly good normal map look
  // dead. X and Y sit around 128 and carry the full 8 bits of signal.
  for (let i = 0, o = 0; i < px; i++, o += 4) {
    const nx = (n[o] / 255) * 2 - 1
    const ny = (n[o + 1] / 255) * 2 - 1
    const t = Math.atan(Math.sqrt(nx * nx + ny * ny)) * 57.29577951308232
    tilts[i] = t
    tsum += t
  }
  const sorted = tilts.slice().sort()
  // ROUGHNESS IS MEASURED ON THE SHIPPED MAP, at whatever resolution it ships
  // at (round 9 packs it into a half-res RG map alongside AO). Measuring the
  // pre-downsample array instead would report a spread the GPU never sees, and
  // the whole point of roughSd/lobe is to describe what the shader samples.
  const rg = entry.rgh
  const rN = entry.rghSize || entry.size
  const rpx = rN * rN
  let rs = 0, rmin = 1, rmax = 0
  for (let i = 0, o = 1; i < rpx; i++, o += 2) {
    const v = rg[o] / 255
    rs += v
    if (v < rmin) rmin = v
    if (v > rmax) rmax = v
  }
  const rmean = rs / rpx
  let rv = 0
  for (let i = 0, o = 1; i < rpx; i++, o += 2) { const d = rg[o] / 255 - rmean; rv += d * d }

  const meanTilt = tsum / px

  // SPECULAR HEADROOM. The glossiest 5% of the surface is what produces a
  // highlight; the mean does not. GGX peak specular density is 1/(pi*alpha^2)
  // with alpha = r^2, so it goes as r^-4 and a 2x change in roughness is a 16x
  // change in peak brightness. `lobe` is that peak, normalised so r = 0.25
  // scores 1.0 — read it as "how many times brighter than a satin surface can
  // this kind's brightest texel get". Under 1 there is no specular EVENT
  // anywhere on the surface, only a broad wash, which is what the round-2
  // critique measured on the gold coin (0.06 luminance spread) and the polished
  // lobby floor (0.009 between p95 and p99.5).
  const rs2 = new Float32Array(rpx)
  for (let i = 0, o = 1; i < rpx; i++, o += 2) rs2[i] = rg[o] / 255
  const rsorted = rs2.slice().sort()
  const rP05 = rsorted[Math.floor(rpx * 0.05)]
  const lobe = Math.pow(0.25 / Math.max(0.02, rP05), 4)

  let albSd = 0
  let edgeTilt = 0, edgeRoughSd = 0, paintRatio = 1
  if (entry.alb) {
    const a = entry.alb
    const N = entry.albSize || entry.size
    const px = N * N          // shadows the normal-map count on purpose
    const lum = new Float32Array(px)
    let ls = 0
    for (let i = 0, o = 0; i < px; i++, o += 4) {
      const l = (a[o] * 0.299 + a[o + 1] * 0.587 + a[o + 2] * 0.114) / 255
      lum[i] = l
      ls += l
    }
    const lm = ls / px
    let lv = 0
    for (let i = 0; i < px; i++) { const d = lum[i] - lm; lv += d * d }
    albSd = Math.sqrt(lv / px)

    // ---------------------------------------------------------------------
    // PAINTED-DETAIL DETECTOR (contract §0.1, round-2 P1).
    //
    // "Painting detail into albedo instead of normal/roughness is the single
    // most reliable amateur tell in the business." The old `albSd vs mean tilt`
    // pair could not catch it: a kind can have a strong average normal AND a
    // hard albedo edge sitting on a dead-flat patch, and the averages hide it.
    // The measurement that actually answers the question is a CORRELATION —
    // find the texels where the albedo changes fastest, and ask whether the
    // surface does anything there.
    //
    // `paintRatio` = mean normal tilt at the top 2% of albedo-gradient texels,
    // over the map's own mean tilt. Above ~1.2 the albedo edges ARE relief
    // edges (a groove, a plank gap, a scute rim) and they will move under a
    // rotating key light. At or below 1.0 the strongest colour detail lands on
    // flat surface — a drawn line, not a groove. `edgeRoughSd` is the escape
    // hatch: detail may legitimately live in roughness instead of normal
    // (polished granite, an oil stain), so a kind passes on either channel.
    // ---------------------------------------------------------------------
    const grad = new Float32Array(px)
    for (let y = 0; y < N; y++) {
      const yr = y * N, yp = ((y + 1) % N) * N, ym = ((y - 1 + N) % N) * N
      for (let x = 0; x < N; x++) {
        const xp = (x + 1) % N, xm = (x - 1 + N) % N
        const gx = lum[yr + xp] - lum[yr + xm]
        const gy = lum[yp + x] - lum[ym + x]
        grad[yr + x] = gx * gx + gy * gy
      }
    }
    const gsorted = grad.slice().sort()
    const cut = gsorted[Math.floor(px * 0.98)]
    // The albedo grid may be coarser than the normal grid and finer than the
    // roughness grid, so the correlation samples both by nearest neighbour in
    // NORMALISED uv rather than by raw index. Getting this wrong would not
    // throw — it would silently correlate the top-left quadrant of the normal
    // map against the whole albedo, and paintRatio would become noise.
    const tScale = entry.size / N
    const rScale = rN / N
    let n = 0, ts = 0, rs = 0, rss = 0
    for (let i = 0; i < px; i++) {
      if (grad[i] < cut) continue
      const ax = i % N, ay = (i / N) | 0
      n++
      ts += tilts[(((ay * tScale) | 0) * entry.size) + ((ax * tScale) | 0)]
      const r = rs2[(((ay * rScale) | 0) * rN) + ((ax * rScale) | 0)]
      rs += r; rss += r * r
    }
    if (n > 0) {
      edgeTilt = ts / n
      const em = rs / n
      edgeRoughSd = Math.sqrt(Math.max(0, rss / n - em * em))
      paintRatio = edgeTilt / Math.max(1e-6, meanTilt)
    }
  }

  return {
    tilt: +meanTilt.toFixed(2),
    tiltP95: +sorted[Math.floor(px * 0.95)].toFixed(2),
    rough: +rmean.toFixed(3),
    roughSd: +Math.sqrt(rv / rpx).toFixed(3),
    // Spread of the roughness field BEFORE the half-res downsample — see the
    // note in buildJob. This is the number the `flat` verdict is judged on.
    roughSdSrc: entry.roughSdSrc ?? +Math.sqrt(rv / rpx).toFixed(3),
    roughRange: +(rmax - rmin).toFixed(3),
    roughP05: +rP05.toFixed(3),
    lobe: +lobe.toFixed(2),
    albSd: +albSd.toFixed(3),
    edgeTilt: +edgeTilt.toFixed(2),
    edgeRoughSd: +edgeRoughSd.toFixed(3),
    paintRatio: +paintRatio.toFixed(2),
  }
}

// Kinds allowed to be near-flat and near-uniform: a mirror IS uniform, and
// giving chrome a 12-degree normal field would be a worse lie than a flat one.
// Also exempt from the "painted detail" check: the emissive/signage kinds whose
// entire identity IS an albedo pattern (a CRT's scanlines are light, not relief).
const MIRROR_KINDS = new Set([
  'chrome', 'metal-polished', 'glass', 'water', 'ice',
  'pixel-grid', 'screen-crt', 'neon-panel',
])

export function __selfTest(opts = {}) {
  const size = clampSize(opts.size || 128)
  // `default` is deliberately excluded from surfaceKinds() (it is the fallback,
  // not a menu option) but it is the single most-used kind in the build — every
  // unnamed mesh lands on it — so it is always measured.
  const kinds = opts.kinds || ['default', ...surfaceKinds()]
  const rows = []
  let worstSeam = 0, worstSeamKind = ''

  // Drive through DEFAULT_SIZE rather than opts.size so the per-kind `res`
  // budget is exercised exactly as it is in the game. Restored on the way out.
  const prevSize = DEFAULT_SIZE
  const prevAsync = ASYNC
  DEFAULT_SIZE = size
  ASYNC = false                    // blocking: we are measuring the work, not hiding it
  const t0 = now()

  for (const kind of kinds) {
    const before = _gpuBytes
    const t = now()
    const maps = surfaceMaps(kind, { seed: 1 })
    const ms = now() - t
    const field = _fieldCache.get(fieldKey(kind, maps.size, { seed: 1 }))
    const seam = field ? field.seam : -1
    if (seam > worstSeam) { worstSeam = seam; worstSeamKind = kind }
    rows.push({
      kind,
      px: maps.size,
      ms: +ms.toFixed(1),
      bytes: _gpuBytes - before,
      seam,
      ...(field ? mapResponse(field) : {}),
      maps: ['map', 'normalMap', 'roughnessMap', 'aoMap'].filter((k) => !!maps[k]),
    })
  }

  // Sharing check — the contract's "two fighters asking for fur-short get the
  // same GPU texture". If this ever goes false the material cache is worthless.
  const s1 = surfaceMaps(kinds[0], { seed: 1 })
  const s2 = surfaceMaps(kinds[0], { seed: 1 })
  const shared = s1 === s2 && s1.normalMap === s2.normalMap

  const totalMs = +(now() - t0).toFixed(1)
  const stats = textureCacheStats()
  const sweepMB = stats.mb

  // -------------------------------------------------------------------------
  // THE SESSION PROJECTION — the half of this test that did not exist, and
  // whose absence is defect 8.
  //
  // The sweep above builds each kind ONCE and reported 81.63 MB while the live
  // build measured 134.59 MB and was silently halving surfaces from the third
  // arena on. The sweep was not wrong, it was answering a different question: a
  // real session asks for the same kind at several `wear`/`scale` dressings, so
  // it holds ~2.4 FIELDS PER KIND (102 fields off 43 kinds, measured). A budget
  // sized off the sweep under-counts by that factor, which is exactly how an
  // "under budget" self-test coexisted with a degrading session.
  //
  // So the test now replays a five-arena session against the same table and
  // reports what the cache actually holds at the end of it. Calibration: run
  // with the pre-round-9 packing this simulation lands ~150 MB uncapped and
  // ~135 MB with the soft degrade active, against the live session's 134.59 —
  // it predicts the number it failed to predict before.
  // -------------------------------------------------------------------------
  let session = null
  if (opts.session !== false) {
    const asks = opts.demand || sessionAsks()
    disposeTextureCache()
    let warned = 0
    const realWarn = console.warn
    console.warn = (...a) => { if (String(a[0]).startsWith('[textures]')) warned++; realWarn(...a) }
    try {
      for (const { kind, opts: o } of asks) surfaceMaps(kind, o)
    } finally { console.warn = realWarn }
    const s = textureCacheStats()
    const proj = projectSession({ size })
    const kindCount = new Set(asks.map((a) => a.kind)).size
    session = {
      source: opts.demand ? 'caller' : 'SESSION_DEMAND (6 arenas + 4 fighters, real call sites)',
      asks: asks.length,
      kinds: kindCount,
      fields: s.fields,
      normalMaps: _normCache.size,
      textures: s.count,
      mb: s.mb,
      cachedMB: s.cachedMB,
      budgetMB: s.budgetMB,
      degraded: s.degraded,
      evictions: s.evictions,
      warnLines: warned,
      fieldsPerKind: +(s.fields / kindCount).toFixed(2),
      // The analytic twin must agree with what actually got built, or one of the
      // two is lying. Anything over a percent or so means projectSession and the
      // cache disagree about a key.
      projectedMB: proj.sessionMB,
      projectionError: `${(100 * (proj.sessionMB - s.cachedMB) / Math.max(1, s.cachedMB)).toFixed(1)}%`,
      verdict: s.degraded === 0 && warned === 0 && s.cachedMB <= s.budgetMB
        ? `PASS — ${s.cachedMB} MB cached / ${s.mb} MB resident / ${s.budgetMB} MB budget, ` +
          'nothing degraded, nothing evicted, no warnings'
        : `FAIL — ${s.cachedMB} MB cached / ${s.budgetMB} MB budget, ${s.degraded} degraded, ` +
          `${s.evictions} evictions, ${warned} warning lines`,
    }
  }

  // -------------------------------------------------------------------------
  // THE WORKING SET — the number a RESIDENT cap has to clear (round 11).
  //
  // `session` above is CUMULATIVE: every dressing a six-arena walk ever asks
  // for. Since round 10 the cap is enforced by an LRU, so the cumulative total
  // is allowed to exceed it — walking away from an arena is exactly when
  // eviction is supposed to happen. What must NEVER exceed the cap is one
  // scene: ArenaBase + one arena + two fighters. Nothing measured that until
  // this block, which is why an 80 MB tier budget looked survivable.
  // -------------------------------------------------------------------------
  const ws = workingSets({ size })
  const scenes = {
    fighters: ws.fighters,
    peakScene: ws.peakScene,
    peakMB: ws.peakMB,
    budgetMB: ws.budgetMB,
    budgetRequestedMB: BUDGET_BYTES / 1048576,
    wholeTreeMB: ws.wholeTreeMB,
    rows: ws.rows,
    // A scene that does not fit means the LRU evicts textures the live frame is
    // still drawing — which frees no VRAM (three re-uploads them) and only costs
    // uploads. See effectiveBudget.
    overRequested: ws.rows.filter((r) => r.bytes > BUDGET_BYTES).map((r) => `${r.scene}:${r.mb}`),
    // WHAT THIS DOES AND DOES NOT PREDICT. `session` replays SESSION_DEMAND
    // through the real cache, so its bytes ARE the shipped bytes for that set of
    // asks — projectionError is the check on that and it reads 0.0%. `scenes` is
    // analytic on top of a STATIC scan of the arena/character sources
    // (SESSION_SCENES), so it is an UPPER BOUND: it cannot know which branches an
    // arena takes and it counts preset names that appear in lookup tables. It
    // over-counts by 3.9% against the hand-extracted table on a common file set,
    // and SESSION_DEMAND itself sits within 4% of the browser. Neither number is
    // a substitute for reading textureCacheStats() in a live session — they are
    // the numbers you can get in node in 20 seconds, and they move with it.
    predicts: 'session = measured through the real cache; scenes = analytic upper bound off a static scan',
    verdict: ws.fitsBudget
      ? `PASS — peak scene ${ws.peakScene} ${ws.peakMB} MB under the ${ws.budgetMB} MB enforced cap`
      : `FAIL — peak scene ${ws.peakScene} ${ws.peakMB} MB over the ${ws.budgetMB} MB enforced cap`,
  }

  DEFAULT_SIZE = prevSize
  ASYNC = prevAsync

  // The surface-response verdicts are only meaningful at shipping resolution:
  // a 128px map carries roughly 60% of the 512px micro band, so `tilt` and
  // `paintRatio` both read low and a fast smoke test would accuse half the
  // table of being flat. Run __selfTest({ size: 512 }) to judge; the small run
  // is for "does it boot and how long does it take".
  const judge = size >= 384

  // Every kind that would not move under a rotating key light, or whose
  // specular lobe is a constant. Mirrors are exempt (see MIRROR_KINDS).
  // Judged on `roughSdSrc` — the spread of the roughness FIELD, before the
  // half-res pack. `roughSd` (what the GPU actually samples) is reported
  // alongside it in every row; the box filter costs ~6% of it on most kinds and
  // up to ~39% on the fine-weave two, which is a resampling artefact rather
  // than an authoring one. See the note in buildJob.
  const flat = !judge ? [] : rows
    .filter((r) => !MIRROR_KINDS.has(r.kind) && (r.tilt < 3 || r.roughSdSrc < 0.02))
    .map((r) => `${r.kind}:tilt${r.tilt}deg/sdSrc${r.roughSdSrc}/sdShipped${r.roughSd}`)
  // Detail painted into colour instead of surface. Two independent failures:
  //   * albSd high with a dead-flat map  — the whole kind is a picture
  //   * paintRatio <= 1 with real albedo edges — the kind has relief, but not
  //     WHERE the colour detail is, so that detail is drawn on. A kind escapes
  //     if the edges instead carry a roughness step (edgeRoughSd >= 0.03).
  const painted = !judge ? [] : rows
    .filter((r) => !MIRROR_KINDS.has(r.kind) && r.albSd > 0.02 &&
      (r.tilt < 5 || (r.paintRatio <= 1.05 && r.edgeRoughSd < 0.03)))
    .map((r) => `${r.kind}:alb${r.albSd}/tilt${r.tilt}/ratio${r.paintRatio}/eRSd${r.edgeRoughSd}`)
  // Surfaces with no specular event available anywhere on them. Matte kinds are
  // supposed to be here (concrete does not glint); this list is for judging the
  // kinds whose job IS to catch a light — see `lobe` in mapResponse.
  // `skin-amphibian` is deliberately absent: PEEPEE's wetness is a clearcoat
  // lobe (SURFACE['skin-wet'].clearcoatRoughness = 0.14), and the base layer of
  // wet skin really is ~0.38. Judging it on the base roughness would push frog
  // skin to a polish it should not have.
  const GLOSS_KINDS = ['gold', 'chrome', 'metal-polished', 'metal-brushed', 'marble',
    'plastic-gloss', 'ice', 'water', 'glass', 'horn', 'scales']
  const dullGloss = rows
    .filter((r) => GLOSS_KINDS.includes(r.kind) && r.lobe < 1)
    .map((r) => `${r.kind}:lobe${r.lobe}@p05rough${r.roughP05}`)

  return {
    size,
    // Normal tilt is measured on the generated map, and a smaller map carries
    // less of the micro band, so `tilt` at the default 128 reads roughly 60% of
    // its value at the shipping 512. Judge `flat`/`painted` from a
    // __selfTest({ size: 512 }) run; the 128 run is the fast smoke test.
    note: judge
      ? 'shipping resolution — flat/painted/dullGloss verdicts are valid'
      : `tilt/roughSd/paintRatio measured at ${size}px understate the shipping 512px maps; ` +
        'flat/painted verdicts suppressed — rerun __selfTest({ size: 512 }) to judge surface response',
    judged: judge,
    count: rows.length,
    totalMs,
    totalBytes: stats.bytes,
    totalMB: stats.mb,
    // `totalMB` is ONE field per kind. `session` is the number that matters —
    // read that one before you size a budget off this test.
    sweepMB,
    session,
    // Round 11: the per-scene working set. Read `scenes.peakMB` before
    // `session.cachedMB` — the cap is a RESIDENT cap and only the peak scene has
    // to fit inside it.
    scenes,
    shared,
    worstSeam,
    worstSeamKind,
    flat,
    painted,
    dullGloss,
    paintedWorst: rows.slice().filter((r) => r.albSd > 0.02)
      .sort((a, b) => a.paintRatio - b.paintRatio).slice(0, 6)
      .map((r) => `${r.kind}:${r.paintRatio}`),
    slowest: rows.slice().sort((a, b) => b.ms - a.ms).slice(0, 6).map((r) => `${r.kind}:${r.ms}ms@${r.px}`),
    weakestNormals: rows.slice().sort((a, b) => a.tilt - b.tilt).slice(0, 6).map((r) => `${r.kind}:${r.tilt}deg`),
    flattestRoughness: rows.slice().sort((a, b) => a.roughSd - b.roughSd).slice(0, 6).map((r) => `${r.kind}:${r.roughSd}`),
    rows,
  }
}
