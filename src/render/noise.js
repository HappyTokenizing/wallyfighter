// ============================================================================
// WALLY: CRYPTO SMACKDOWN — render layer: seeded, tileable procedural noise
// ----------------------------------------------------------------------------
// GRAPHICS_CONTRACT.md §2. This is the bedrock of the whole surfacing overhaul:
// every height field, every clump mask, every crack network in textures.js is
// built out of these samplers.
//
// Two properties are non-negotiable and everything here is shaped around them:
//
//   1. DETERMINISM. No Math.random(). Two loads of the same arena must produce
//      byte-identical textures or the material cache is worthless and QA
//      screenshots stop being comparable.
//   2. TILEABILITY. Arena floors, fur, cloth and hide all repeat across a
//      surface. A seam is a shipping bug, not a nitpick.
//
// Tiling convention
// -----------------
// Every sampler takes an OPTIONAL period as its 3rd/4th argument:
//
//     noise(x, y, px = 0, py = px)
//
// A period of 0 means "do not wrap". The period is in the SAME units as x/y, so
// if you sample the unit square at frequency 8 you pass period 8 and the integer
// lattice wraps at 8 — giving you a field that is seamless across [0,1)².
// fbm2D takes `period` in base-frequency units and scales it per octave for you,
// which is why lacunarity must stay integral (2 by default) for tileable work.
//
// Speed
// -----
// A 512² field with 5 octaves is 1.3M samples, and a single surface kind builds
// four to six of those. So the samplers use a classic 512-entry permutation
// table (built once per seed, memoised) instead of calling the general-purpose
// hash per lattice corner — roughly 4x faster. The table has an intrinsic period
// of 256; that is harmless for tiling because we wrap the lattice at `p` BEFORE
// the table lookup, so a period of 512 simply repeats the same 256 values twice
// rather than breaking the seam.
// ============================================================================

// ---------------------------------------------------------------------------
// RNG + hashing
// ---------------------------------------------------------------------------

// mulberry32 — same generator ArenaBase uses, duplicated here so the render
// layer has zero dependency on the arena toolkit (which imports THREE and a
// pile of geometry helpers we do not want in a texture worker path).
export function makeRng(seed = 1337) {
  let s = seed >>> 0
  return function rng() {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// General-purpose 2D integer hash -> [0,1). Inputs are floored, so this is a
// lattice hash: feed it cell coordinates, not continuous positions. Used for
// scatter work (voronoi feature points, per-plank tone, per-cell ids) where the
// permutation table's 256-period would cause visible repetition.
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(Math.floor(x) | 0, 0x27d4eb2d) ^
           Math.imul(Math.floor(y) | 0, 0x165667b1) ^
           Math.imul(seed | 0, 0x9e3779b9)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39) >>> 0
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

// Wrap an integer lattice coordinate into [0, p). Negative-safe.
function wrapi(i, p) {
  const m = i % p
  return m < 0 ? m + p : m
}

// ---------------------------------------------------------------------------
// Permutation / value tables, memoised per seed.
// ---------------------------------------------------------------------------
const _tableCache = new Map()

function tables(seed) {
  const key = seed | 0
  let t = _tableCache.get(key)
  if (t) return t
  const rng = makeRng((key * 2654435761) >>> 0 || 1)
  const perm = new Uint8Array(512)
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  // Fisher-Yates with the seeded rng — deterministic shuffle.
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = base[i]; base[i] = base[j]; base[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]
  // Pre-baked lattice values for value noise, in [-1,1].
  const vals = new Float32Array(256)
  for (let i = 0; i < 256; i++) vals[i] = rng() * 2 - 1
  t = { perm, vals }
  _tableCache.set(key, t)
  return t
}

// 8 unit gradients — enough directional variety for stylised surfacing and much
// cheaper than a normalised random vector per corner.
const G = 0.70710678
const GRAD_X = new Float32Array([1, -1, 0, 0, G, -G, G, -G])
const GRAD_Y = new Float32Array([0, 0, 1, -1, G, G, -G, -G])

// ---------------------------------------------------------------------------
// Samplers. All return [-1, 1].
// ---------------------------------------------------------------------------

// Quintic fade — C2 continuous, so derived normal maps have no lattice creases.
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }

export function makeValueNoise2D(seed = 0) {
  const { perm, vals } = tables(seed)
  function noise(x, y, px = 0, py = px) {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const u = fade(xf), v = fade(yf)
    const x0 = (px > 0 ? wrapi(xi, px) : xi) & 255
    const x1 = (px > 0 ? wrapi(xi + 1, px) : xi + 1) & 255
    const y0 = (py > 0 ? wrapi(yi, py) : yi) & 255
    const y1 = (py > 0 ? wrapi(yi + 1, py) : yi + 1) & 255
    const px0 = perm[x0], px1 = perm[x1]
    const a = vals[perm[px0 + y0]]
    const b = vals[perm[px1 + y0]]
    const c = vals[perm[px0 + y1]]
    const d = vals[perm[px1 + y1]]
    const top = a + (b - a) * u
    const bot = c + (d - c) * u
    return top + (bot - top) * v
  }
  noise.seed = seed | 0
  noise.kind = 'value'
  return noise
}

export function makePerlin2D(seed = 0) {
  const { perm } = tables(seed)
  function noise(x, y, px = 0, py = px) {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const u = fade(xf), v = fade(yf)
    const x0 = (px > 0 ? wrapi(xi, px) : xi) & 255
    const x1 = (px > 0 ? wrapi(xi + 1, px) : xi + 1) & 255
    const y0 = (py > 0 ? wrapi(yi, py) : yi) & 255
    const y1 = (py > 0 ? wrapi(yi + 1, py) : yi + 1) & 255
    const px0 = perm[x0], px1 = perm[x1]
    const g00 = perm[px0 + y0] & 7
    const g10 = perm[px1 + y0] & 7
    const g01 = perm[px0 + y1] & 7
    const g11 = perm[px1 + y1] & 7
    const n00 = GRAD_X[g00] * xf + GRAD_Y[g00] * yf
    const n10 = GRAD_X[g10] * (xf - 1) + GRAD_Y[g10] * yf
    const n01 = GRAD_X[g01] * xf + GRAD_Y[g01] * (yf - 1)
    const n11 = GRAD_X[g11] * (xf - 1) + GRAD_Y[g11] * (yf - 1)
    const top = n00 + (n10 - n00) * u
    const bot = n01 + (n11 - n01) * u
    // 2D Perlin peaks at ~0.707 with unit gradients; rescale to fill [-1,1].
    return (top + (bot - top) * v) * 1.4142136
  }
  noise.seed = seed | 0
  noise.kind = 'perlin'
  return noise
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

// Simplex has no directional lattice artefacts, which is what you want for
// organic blotching (hide mottling, rust blooms, marble turbulence).
//
// CAVEAT ON TILING: simplex works on a SKEWED lattice, so wrapping i/j gives a
// rhombic tile, not a square one. `px`/`py` are honoured (the skewed lattice is
// wrapped) but the result is only exactly seamless on the rhombus. For anything
// that must tile on the unit square use value or Perlin noise — which is what
// textures.js does for every height field. Simplex is here for contract
// completeness and for non-tiling decorative work.
export function makeSimplex2D(seed = 0) {
  const { perm } = tables(seed)
  function noise(x, y, px = 0, py = px) {
    const s = (x + y) * F2
    const i = Math.floor(x + s), j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t), y0 = y - (j - t)
    let i1, j1
    if (x0 > y0) { i1 = 1; j1 = 0 } else { i1 = 0; j1 = 1 }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2
    const ii = (px > 0 ? wrapi(i, px) : i) & 255
    const jj = (py > 0 ? wrapi(j, py) : j) & 255
    const ii1 = (px > 0 ? wrapi(i + i1, px) : i + i1) & 255
    const jj1 = (py > 0 ? wrapi(j + j1, py) : j + j1) & 255
    const ii2 = (px > 0 ? wrapi(i + 1, px) : i + 1) & 255
    const jj2 = (py > 0 ? wrapi(j + 1, py) : j + 1) & 255
    const g0 = perm[perm[ii] + jj] & 7
    const g1 = perm[perm[ii1] + jj1] & 7
    const g2 = perm[perm[ii2] + jj2] & 7
    let n0 = 0, n1 = 0, n2 = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * (GRAD_X[g0] * x0 + GRAD_Y[g0] * y0) }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * (GRAD_X[g1] * x1 + GRAD_Y[g1] * y1) }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * (GRAD_X[g2] * x2 + GRAD_Y[g2] * y2) }
    // 95 rather than the textbook 70: with an 8-direction gradient set the
    // theoretical peak is lower, and 70 leaves simplex quietly 30% flatter than
    // value/Perlin — which would silently weaken every surface that mixes them.
    return 95 * (n0 + n1 + n2)
  }
  noise.seed = seed | 0
  noise.kind = 'simplex'
  return noise
}

// ---------------------------------------------------------------------------
// Fractal combinators
// ---------------------------------------------------------------------------

// opts: { octaves=5, lacunarity=2, gain=0.5, frequency=1, period=0, periodY }
// `period` is in base-frequency units and is scaled per octave, so a tileable
// call looks like: fbm2D(n, x * 8, y * 8, { period: 8 }).
export function fbm2D(noiseFn, x, y, opts = {}) {
  const octaves = opts.octaves ?? 5
  const lac = opts.lacunarity ?? 2
  const gain = opts.gain ?? 0.5
  const px0 = opts.period ?? 0
  const py0 = opts.periodY ?? px0
  let f = opts.frequency ?? 1
  let amp = 1, sum = 0, norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * noiseFn(x * f, y * f, px0 > 0 ? px0 * f : 0, py0 > 0 ? py0 * f : 0)
    norm += amp
    amp *= gain
    f *= lac
  }
  return norm > 0 ? sum / norm : 0
}

// Ridged multifractal — the go-to for cracks, veins, wood grain and mountain
// silhouettes. Returns [-1,1] like every other sampler here so it composes with
// fbm2D; map with `v * 0.5 + 0.5` when you want a crack mask.
// opts adds { sharpness=1, offset=1 } on top of fbm2D's.
export function ridged2D(noiseFn, x, y, opts = {}) {
  const octaves = opts.octaves ?? 5
  const lac = opts.lacunarity ?? 2
  const gain = opts.gain ?? 0.5
  const sharp = opts.sharpness ?? 1
  const px0 = opts.period ?? 0
  const py0 = opts.periodY ?? px0
  let f = opts.frequency ?? 1
  let amp = 1, sum = 0, norm = 0, prev = 1
  for (let o = 0; o < octaves; o++) {
    let n = noiseFn(x * f, y * f, px0 > 0 ? px0 * f : 0, py0 > 0 ? py0 * f : 0)
    // The clamp is not cosmetic. Perlin's 1.4142 rescale overshoots |1| on a
    // handful of lattice points, so `1 - abs(n)` goes very slightly negative,
    // and Math.pow(negative, non-integer) is NaN. One NaN texel then poisons the
    // whole octave chain through `prev`, and downstream in textures.js a single
    // NaN in a height field drags the roughness map's mean to NaN — which wrote
    // an ALL-ZERO roughness map and rendered skin as a perfect mirror. Measured:
    // exactly 1 bad texel in 16384 was enough.
    n = 1 - Math.abs(n)
    if (n < 0) n = 0
    if (sharp !== 1) n = Math.pow(n, sharp)
    // Weighting each octave by the previous one is what makes ridges connect
    // into continuous lines instead of a field of disconnected creases.
    n *= prev
    prev = Math.min(1, Math.max(0, n * 2))
    sum += amp * n
    norm += amp
    amp *= gain
    f *= lac
  }
  return norm > 0 ? (sum / norm) * 2 - 1 : -1
}

// ---------------------------------------------------------------------------
// Cellular
// ---------------------------------------------------------------------------

// opts: { cells=8, tileable=true, jitter=1, metric='euclidean'|'manhattan'|'chebyshev' }
//
// Input coordinates are in the UNIT SQUARE and scaled by `cells` internally, so
// worley(0.5, 0.5) is the middle of the tile regardless of cell count.
//
// PERFORMANCE NOTE: the returned sampler reuses ONE result object across calls.
// At 512² that saves a quarter of a million allocations per field. Read f1/f2/id
// immediately; never retain the object.
export function makeWorley2D(seed = 0, opts = {}) {
  const cells = Math.max(1, Math.round(opts.cells ?? 8))
  const tileable = opts.tileable !== false
  const jitter = opts.jitter ?? 1
  const metric = opts.metric || 'euclidean'
  const half = (1 - jitter) * 0.5

  // Tileable worley has a FINITE feature-point set, so bake it once instead of
  // hashing 9 neighbours per pixel. This is the single biggest win in the
  // texture generator's inner loops.
  let fx = null, fy = null
  if (tileable) {
    fx = new Float32Array(cells * cells)
    fy = new Float32Array(cells * cells)
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const k = j * cells + i
        fx[k] = i + half + hash2(i, j, seed) * jitter
        fy[k] = j + half + hash2(i, j, seed + 8191) * jitter
      }
    }
  }

  const out = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 }

  function dist(dx, dy) {
    if (metric === 'manhattan') return Math.abs(dx) + Math.abs(dy)
    if (metric === 'chebyshev') return Math.max(Math.abs(dx), Math.abs(dy))
    return Math.sqrt(dx * dx + dy * dy)
  }

  function sample(x, y) {
    const sx = x * cells, sy = y * cells
    const ci = Math.floor(sx), cj = Math.floor(sy)
    let f1 = 1e9, f2 = 1e9, id = 0, bx = 0, by = 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const gi = ci + di, gj = cj + dj
        let ptx, pty, cellId
        if (tileable) {
          const wi = wrapi(gi, cells), wj = wrapi(gj, cells)
          const k = wj * cells + wi
          // Offset the baked point back out to the unwrapped neighbour so the
          // distance is measured across the seam, not through it.
          ptx = fx[k] + (gi - wi)
          pty = fy[k] + (gj - wj)
          cellId = k
        } else {
          ptx = gi + half + hash2(gi, gj, seed) * jitter
          pty = gj + half + hash2(gi, gj, seed + 8191) * jitter
          cellId = (Math.imul(gi, 73856093) ^ Math.imul(gj, 19349663)) >>> 0
        }
        const d = dist(sx - ptx, sy - pty)
        if (d < f1) { f2 = f1; f1 = d; id = cellId; bx = ptx; by = pty }
        else if (d < f2) { f2 = d }
      }
    }
    // Normalise out of cell units so callers get scale-independent numbers.
    out.f1 = f1 / cells
    out.f2 = f2 / cells
    out.id = id
    out.cx = bx / cells
    out.cy = by / cells
    return out
  }

  sample.cells = cells
  sample.tileable = tileable
  sample.seed = seed | 0
  return sample
}

// Stratified scatter — `count` points spread over a w x h rectangle with one
// point per jittered grid cell. Deterministic, no clumping, no rejection loop.
// Used for pebbles, rivets, crowd dressing and decal placement.
export function makeVoronoiCells(seed = 0, count = 16, w = 1, h = 1) {
  const n = Math.max(1, Math.round(count))
  const aspect = h > 0 ? w / h : 1
  let cols = Math.max(1, Math.round(Math.sqrt(n * aspect)))
  let rows = Math.max(1, Math.ceil(n / cols))
  while (cols * rows < n) cols++
  const cw = w / cols, ch = h / rows
  const pts = []
  for (let j = 0; j < rows && pts.length < n; j++) {
    for (let i = 0; i < cols && pts.length < n; i++) {
      pts.push({
        x: (i + 0.15 + hash2(i, j, seed) * 0.7) * cw,
        y: (j + 0.15 + hash2(i, j, seed + 4093) * 0.7) * ch,
        id: pts.length,
      })
    }
  }
  return pts
}

// ---------------------------------------------------------------------------
// Domain warping
// ---------------------------------------------------------------------------

// Push the sample point around with two decorrelated fbm channels. This is the
// difference between "noise" and "something that looks grown": fur clumps that
// curve, marble veins that fold, rust that creeps.
//
// Tileability survives warping as long as the warp field itself tiles with the
// same period — f(x + P) = n(x + P + w(x)) = n(x + w(x)) because w is periodic.
// opts: { frequency=1, octaves=3, gain=0.5, period=0 }
export function domainWarp2D(noiseFn, x, y, amount = 1, opts = {}) {
  const o = { octaves: opts.octaves ?? 3, gain: opts.gain ?? 0.5, frequency: opts.frequency ?? 1, period: opts.period ?? 0 }
  // The magic offsets are the standard iq decorrelation constants; any fixed
  // non-integer pair works because the lattice wrap is applied after the shift.
  const wx = fbm2D(noiseFn, x, y, o)
  const wy = fbm2D(noiseFn, x + 5.2, y + 1.3, o)
  return [x + amount * wx, y + amount * wy]
}
