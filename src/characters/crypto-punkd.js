// CRYPTO PUNK'D — The Glitched Detective.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
//
// VISUAL OVERHAUL — GRAPHICS_CONTRACT.md §0/§4/§9/§12 + docs/parody/crypto-punkd.md.
// The joke is a RESOLUTION MISMATCH: a true 24 mm-lattice voxel head (11 x 17 x 9,
// face-culled + greedy-meshed, one-voxel ink keyline shell on every plane, baked
// per-face brightness bias and 3-level voxel AO in vertex colours, chamfered cubes
// on every silhouette edge and every feature) bolted onto a completely smooth,
// bevelled, tailored 1940s trench-coat gumshoe body. Everything above the collar
// steps in whole voxels; nothing below the collar has a hard corner.
//
// All geometry is procedural (src/render/geometry.js), all surfacing is real PBR
// (src/render/materials.js + textures.js). No assets, no extra deps.
//
// ---------------------------------------------------------------------------
// DECLARED DIVERGENCES from GRAPHICS_CONTRACT.md / docs/parody/crypto-punkd.md.
// The contract's §0 rule is explicit: you may not SILENTLY diverge.
//
//  D1  §9 "real eye geometry (sclera + iris + pupil + specular + lid)" — no
//      sclera and no iris. The eye is the brief's 3-band voxel construct: a
//      `skin-shade` brow band, a proud `voxel-ink` lid, a recessed pupil voxel
//      and a highlight voxel. Lid geometry, pupil, specular and 2 voxels of
//      real depth relief are all present; a white sclera on a 2-voxel eye is
//      what makes a pixel head read as "3D model with a texture". Brief §0.1.
//  D2  §0 criterion 1 "spatially varying roughness" — the head has EXACTLY
//      constant roughness, no roughness map, zero variation. The body spans
//      0.16 (pipe stem) to 1.0 (fedora felt). Round 4 LOWERS the head's
//      constant (skin 0.62 -> 0.42, ink 0.48 -> 0.30, glint 0.22) because
//      "constant roughness" never meant "no specular lobe".
//  D3  §4 flatShading off by default — `flatShading: true` on all head
//      materials. The contract carves this out for parody looks; this is the
//      character that clause was written for.
//  D4  §11 "nothing moves linearly" — everything above the collar SNAPS in
//      whole-voxel, <=2-frame, un-eased steps. `hat`, `coat`, tie, storm flap
//      and collar obey §11 fully.
//  D5  §9 "no gaps" — the 6-voxel wrist dissolve. The wrist joint underneath
//      is fully sleeved and closed; each dissolve cube shares a full 24 mm
//      face with the cuff or with another cube.
//  D6  Brief §7.4 asks for a 3-vx-deep goggle block; ours is 1 vx deep (front
//      face still at the specified x = +0.132). Carving 3 vx would delete the
//      forehead `skin-hilite` voxel and open a crater when the goggles snap
//      down.
//  D7  Brief §2's fin/brim negative-space wedge is geometrically unreachable
//      at a 0.404 m brim tilted 18 deg about a pivot inside the skull, so the
//      brim carries a 48 deg front notch. That is how the wedge actually gets
//      built and it removes the last hard interpenetration on the model.
//  D8  Brief §5's `coat-gabardine` #8E8067 (luma 0.51, hue 40) SHIPPED AS
//      CAMOUFLAGE: measured against a warm-wood arena wall at hue 24 / luma
//      0.340, the coat sampled hue 27 / luma 0.349 — three degrees of hue and
//      nine thousandths of a stop from the background, on the largest mass on
//      the character. The coat is now #46482F: luma 0.274, hue 65,
//      saturation 0.21. It costs the brief's literal three-value ladder
//      (head 0.76 / coat 0.27 / hat+shoes 0.19 instead of 0.77/0.51/0.19) and
//      buys a figure that separates from every warm arena by value AND hue.
//      No shipped AAA fighter shares a hue and a value with its own stage.
//  D9  Brief §5's head hexes are unchanged in HUE and in LUMA but raised in
//      SATURATION (0.22 -> 0.38), and every head material carries a small cool
//      emissive floor. Reason and arithmetic in the palette block below. The
//      parody-safety clearance against the source's alien family is unchanged
//      in kind and still holds on all three measured axes.
// ---------------------------------------------------------------------------
import * as THREE from 'three'
import {
  pbr, surfaceMaps,
  roundedBox, taperedBox, taperedCapsule, sleeve, weld,
  skirt, loft, profileLathe, filletRing, roundedCylinder,
  plate, superellipsoid, superellipsePoints, roundedRectPoints,
  mergeParts, markDynamic, GEO,
} from '../render/index.js'

// The special-move FX props below are transient, unlit `basic()` geometry, but
// they are still on camera during every super — and a raw `BoxGeometry` reads
// as a raw box wherever it appears. `GEO` is the render layer's documented
// drop-in: `new GEO.BoxGeometry(w, h, d)` is chamfered, keeps the six material
// groups a multi-material panel needs, and `GEO.CylinderGeometry` fillets its
// rims. Torus has no GEO entry; `filletRing(radius, tube, radialSeg, tubeSeg)`
// takes the same four arguments and is the bevelled equivalent.

// ---------------------------------------------------------------------------
// palette — brief §5. Every hex sits inside the contract's 30..240 sRGB albedo
// band on all three channels, and every colour derived from a source measurement
// is shifted >= 8/255 in >= 2 channels (brief §9.1).
// Authored value ladder (costume 0): head 0.759 / coat 0.274 / hat+shoes 0.194
// (divergence D8 — brief §5 asks for 0.77 / 0.51 / 0.19 and 0.51 was measured
// as camouflage against a warm arena wall). SIMULATED SHIPPED VALUES, linear
// albedo x the real lighting.js rigs, ACES, sRGB out:
//   sunset-stadium  head 0.722 hue 154 | coat 0.143 | ink 0.111 | wall 0.545
//   meme-plaza      head 0.810 hue 181 | coat 0.237 | ink 0.145 | wall 0.721
//   tower-dusk      head 0.765 hue 166 | coat 0.184 | ink 0.126 | wall 0.632
// i.e. the face lands cool (hue 154-181) in every rig instead of the hue-47
// warm cream that shipped, and the coat separates from the wall by 0.40-0.48
// of luma instead of 0.009.
// One correction to brief §5: its `pipe-briar-dark` #5E3A16 has a blue channel
// of 22, BELOW the contract's 30 floor (the brief asserts the whole table is in
// band; that one entry is not). Shipped as #5E3A1E — blue lifted to the floor,
// luma still 0.25, and still >= 8/255 off the source measurement in >= 2
// channels (brief §9.1) at -10 / -2 / +22.
// ---------------------------------------------------------------------------
// ROUND-4 COLOUR CORRECTION — measured, not guessed.
//
// The round-3 hexes were the brief's verbatim table and they were RIGHT on
// paper and WRONG on screen. The arena keys in `src/render/lighting.js` are
// hard warm suns (`sunset-stadium` 0xffb066, `mountain-dawn` 0xffc07a,
// `tower-dusk` 0xffd9a8): three.js converts a light colour to LINEAR, so
// 0xffb066 delivers an irradiance ratio of (1.00, 0.43, 0.13). Multiply that
// into `skin-base` #A9CBC4 — a hue-168 teal at HSL saturation 0.22 — and the
// blue channel is gone: the face lands at hue ~45, a warm cream, exactly as
// the critic sampled (#e1d092). A 0.22-saturation "cool" is not cool under a
// warm key; it is a neutral, and a neutral takes the key's temperature whole.
//
// Two changes, both measurable:
//   1. HEAD SATURATION UP. The skin ramp keeps the brief's luma ladder exactly
//      (base 0.759 vs 0.77, shade 0.602 vs 0.61, stubble 0.473 vs 0.46, hilite
//      0.879 vs 0.89) and raises HSL saturation 0.22 -> 0.38 at an unchanged
//      hue of ~171. Parody-safety clearance vs the alien family (§9.1) is
//      unchanged in kind and still holds on two independent axes: hue 171 vs
//      the alien ramp's exact 180, saturation 0.38 vs 0.52-0.86, lightness
//      0.694 vs 0.74-0.88 — plus the stubble block and the horizontal mouth
//      bar, neither of which the alien base has.
//   2. A COOL EMISSIVE FLOOR on the head (see `headMat`). Emissive is the only
//      term a warm key cannot tint. That is what actually holds the hue.
//
// The coat moves off the brief's #8E8067 for the same measured reason: the
// critic sampled the shipped coat at #8c501c against an arena wall at
// #944b17 — three degrees of hue and 0.009 of luma apart. Authored luma drops
// 0.51 -> 0.273 and the hue rotates 40 -> 65 (desaturated olive-khaki), which
// separates the largest mass on the character from every warm-wood arena by
// value first and hue second. Declared as divergence D8.
const PAL = [
  { // costume 0 — "gumshoe noir"
    skinBase: 0x93cfc6, skinHilite: 0xc2e9e2, skinShade: 0x6ba79f, stubble: 0x4c8580,
    ink: 0x22262c, mohawk: 0x4b2fe0, mohawkDark: 0x35228e,
    coat: 0x46482f, coatShadow: 0x2e3020, hat: 0x35312a, hatBand: 0x463f34,
    glint: 0xb6e6df, trim: 0x2fdcf0, smoke: 0xb3b6bc, cig: 0xbebab2, ember: 0xd9622f,
    briar: 0x8a5a22, briarDark: 0x5e3a1e, stem: 0x2b2830, gold: 0xc79a2e,
    vrBody: 0x6e747c, vrEdge: 0x4a4f57, screen: 0x4a5bd0,
    shirt: 0x2c2a26, glass: 0x9fe8ff, horn: 0x6b5a44, sole: 0x4a443a,
    // Cool emissive floor (see headMat/finMat). NOT albedo — exempt from the
    // 30..240 band, same clause §5 grants `rim-cyan`.
    headGlow: 0x2f8894, inkGlow: 0x1e2a38, finGlow: 0x2a1268,
    hat3d: false, ghostA: 0xee47de, ghostB: 0x2fdcf0,
  },
  { // costume 1 — "vaporwave" (no fedora: `hat` carries a pixel headband instead)
    skinBase: 0xa8bad6, skinHilite: 0xd4deef, skinShade: 0x7b8dad, stubble: 0x57678a,
    ink: 0x22262c, mohawk: 0x2fbcd4, mohawkDark: 0x1f7f9c,
    // (#271A44 had a green channel of 26, under the contract's 30 floor)
    coat: 0x40316a, coatShadow: 0x2c2148, hat: 0x2a2733, hatBand: 0x3a3644,
    glint: 0xefaee0, trim: 0xefc33d, smoke: 0xd6d8d3, cig: 0xbebab2, ember: 0xd9622f,
    briar: 0x8a5a22, briarDark: 0x5e3a1e, stem: 0x2b2830, gold: 0xefc33d,
    vrBody: 0x9aa096, vrEdge: 0x33619c, screen: 0x9c3838,
    shirt: 0x232130, glass: 0xffd9fb, horn: 0x5a5164, sole: 0x3e3b48,
    headGlow: 0x33507e, inkGlow: 0x1e2a38, finGlow: 0x10525e,
    hat3d: true, ghostA: 0x2fdcf0, ghostB: 0xefc33d,
  },
]

// ---------------------------------------------------------------------------
// THE LATTICE — brief §3.1. One voxel = 24 mm. Everything above the collar snaps
// to it, position AND size, in integer multiples. There are no half voxels.
//
//   d  depth index   0 = the "proud" layer, 1 = L1 (the front-plane map) .. 9 = L9
//   r  row index    16 = chin, 0 = crown, negative = above the crown, 17+ = neck
//   c  column index  0 = character's LEFT edge .. 10 = right edge, 5 = centreline
//
// The three functions return a voxel's MIN CORNER in world metres (bind pose).
// ---------------------------------------------------------------------------
const VX = 0.024
const xMin = (d) => 0.108 - VX * d
const yMin = (r) => 1.442 + (16 - r) * VX
const zMin = (c) => (5 - c) * VX - 0.012

// head bone pivot, world (brief §0). Head-local = world - HEAD_PIVOT.
const HEAD_PIVOT = [0.045, 1.394, 0]

// Build-time lattice assertion (brief §3: "assert it in the builder").
// Round-3: this existed but was never CALLED, so `latticeBad` could not move off
// zero and a half-voxel would have shipped silently. `VoxelSet.set` now runs it
// on every voxel it accepts, and `buildModel` fails loudly on a non-zero count.
let latticeBad = 0
function onLattice(v, origin) {
  const k = (v - origin) / VX
  if (Math.abs(k - Math.round(k)) > 1e-6) latticeBad++
  return v
}
/** Assert one voxel's three min corners land exactly on the 24 mm lattice. */
function assertLattice(d, r, c) {
  if (!Number.isInteger(d) || !Number.isInteger(r) || !Number.isInteger(c)) { latticeBad++; return }
  onLattice(xMin(d), 0.108); onLattice(yMin(r), 1.442); onLattice(zMin(c), -0.012)
}

const srgbToLinear = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4))
const lumaOf = (hex) => (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// ===========================================================================
// VOXEL TOOLKIT — brief §3.10. Two-tier build so the head costs ~9k triangles
// instead of the ~80k a RoundedBoxGeometry-per-voxel build would.
//   Tier A  chamfered cubes (44 tris) for every FEATURE voxel and every voxel
//           that sits on a silhouette EDGE (2+ exposed axes) — i.e. exactly the
//           voxels whose edges are seen edge-on, which is where a bevel earns
//           its triangles.
//   Tier B  greedy-merged coplanar same-colour face runs for everything else.
//           A 5x9 blank forehead is ONE quad, not 45 cubes.
// Hidden faces are culled before either tier runs.
// ===========================================================================

const CHAMFER = 0.0012                 // 5% of VX — brief §3.10.10 ceiling is 1.9 mm
const F_FEATURE = 1                    // force Tier A (relief, props, accessories)
const AO_LEVEL = [1.0, 0.94, 0.86, 0.78]

// dir: n = world normal, s = LATTICE delta toward the neighbour on that side,
// uL/vL = lattice deltas for the face's world (u, v) basis where u x v = n,
// bias = brief §3.10.5 per-face brightness multiplier.
const DIRS = [
  { i: 0, n: [1, 0, 0], s: [-1, 0, 0], uL: [0, -1, 0], vL: [0, 0, -1], bias: 1.00, ax: 'd' },
  { i: 1, n: [-1, 0, 0], s: [1, 0, 0], uL: [0, 0, -1], vL: [0, -1, 0], bias: 0.86, ax: 'd' },
  { i: 2, n: [0, 1, 0], s: [0, -1, 0], uL: [0, 0, -1], vL: [-1, 0, 0], bias: 1.06, ax: 'r' },
  { i: 3, n: [0, -1, 0], s: [0, 1, 0], uL: [-1, 0, 0], vL: [0, 0, -1], bias: 0.78, ax: 'r' },
  { i: 4, n: [0, 0, 1], s: [0, 0, -1], uL: [-1, 0, 0], vL: [0, -1, 0], bias: 0.90, ax: 'c' },
  { i: 5, n: [0, 0, -1], s: [0, 0, 1], uL: [0, -1, 0], vL: [-1, 0, 0], bias: 0.90, ax: 'c' },
]
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

/** A sparse lattice occupancy set. Keys are "d,r,c". */
class VoxelSet {
  constructor(name = '') { this.name = name; this.m = new Map() }
  static k(d, r, c) { return `${d},${r},${c}` }
  set(d, r, c, color, flags = 0) {
    if (color === null) { this.m.delete(VoxelSet.k(d, r, c)); return this }
    assertLattice(d, r, c)
    this.m.set(VoxelSet.k(d, r, c), { d, r, c, color, flags })
    return this
  }
  get(d, r, c) { return this.m.get(VoxelSet.k(d, r, c)) }
  has(d, r, c) { return this.m.has(VoxelSet.k(d, r, c)) }
  del(d, r, c) { this.m.delete(VoxelSet.k(d, r, c)); return this }
  /** inclusive ranges */
  fill(d0, d1, r0, r1, c0, c1, color, flags = 0) {
    for (let d = d0; d <= d1; d++) {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) this.set(d, r, c, color, flags)
      }
    }
    return this
  }
  get size() { return this.m.size }
  values() { return this.m.values() }
}

// --- vertex-colour bake (brief §3.10.5-7) ----------------------------------
// tint = faceBias * AO, compressed on near-black albedo so the ink keyline can
// never leave the contract's 30..240 band, then shipped as the exact LINEAR
// ratio three.js needs (it multiplies vertexColor into albedo in linear space).
const _tintCache = new Map()
// `maxLuma` / `maxLumaHex` answer the round-2 note "the skin is blown out to
// near-white": they are the brightest sRGB luma any baked vertex colour actually
// produces, and which authored hex produced it. §5's rule is that the two
// `skin-hilite` voxels (#D2E7E1, luma 0.89) are the only thing on the head above
// 0.85 — this is the build-time proof of it.
const bakeAudit = { clampLo: 0, clampHi: 0, maxLuma: 0, maxLumaHex: 0, perHex: new Map() }
function tintRGB(hex, bias, ao) {
  const key = `${hex}|${bias}|${ao}`
  const hit = _tintCache.get(key)
  if (hit) return hit
  const ch = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
  const k = clamp01((lumaOf(hex) - 0.25) / 0.35)
  const t = 1 + (bias * ao - 1) * (0.25 + 0.75 * k)
  const out = new Array(3)
  const shipped = new Array(3)
  for (let i = 0; i < 3; i++) {
    let q = ch[i] * t
    if (q < 30) { bakeAudit.clampLo++; q = 30 }
    if (q > 240) { bakeAudit.clampHi++; q = 240 }
    shipped[i] = q
    const base = srgbToLinear(ch[i] / 255)
    out[i] = base > 1e-6 ? srgbToLinear(q / 255) / base : 1
  }
  const lum = (0.2126 * shipped[0] + 0.7152 * shipped[1] + 0.0722 * shipped[2]) / 255
  if (lum > bakeAudit.maxLuma) { bakeAudit.maxLuma = lum; bakeAudit.maxLumaHex = hex }
  if (lum > (bakeAudit.perHex.get(hex) || 0)) bakeAudit.perHex.set(hex, lum)
  _tintCache.set(key, out)
  return out
}

/** Non-indexed geometry accumulator: position + normal + uv + colour. */
class VoxAcc {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = [] }
  v(x, y, z, nx, ny, nz, u, vv, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, vv); this.c.push(col[0], col[1], col[2])
  }
  /** four corner points (already CCW from outside), one normal, per-corner uv + colour */
  quad(pt, n, uv, col) {
    const o = [0, 1, 2, 0, 2, 3]
    for (const i of o) this.v(pt[i][0], pt[i][1], pt[i][2], n[0], n[1], n[2], uv[i][0], uv[i][1], col[i])
  }
  get triangles() { return this.p.length / 9 }
  build(name) {
    if (!this.p.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.computeBoundingSphere(); g.computeBoundingBox()
    g.name = name || 'voxels'
    return g
  }
}

// world axis index carried by each face's (u, v) basis, for lattice-aligned UVs
const UAX = [1, 2, 2, 0, 0, 1]
const VAX = [2, 1, 0, 2, 1, 0]

/** 3-level voxel AO (brief §3.10.6) for the four corners of one face. */
function cornerAO(v, D, occupied) {
  const bd = v.d + D.s[0], br = v.r + D.s[1], bc = v.c + D.s[2]
  const out = new Array(4)
  for (let i = 0; i < 4; i++) {
    const su = CORNERS[i][0], sv = CORNERS[i][1]
    const s1 = occupied(bd + D.uL[0] * su, br + D.uL[1] * su, bc + D.uL[2] * su)
    const s2 = occupied(bd + D.vL[0] * sv, br + D.vL[1] * sv, bc + D.vL[2] * sv)
    const s3 = occupied(bd + D.uL[0] * su + D.vL[0] * sv, br + D.uL[1] * su + D.vL[1] * sv,
      bc + D.uL[2] * su + D.vL[2] * sv)
    out[i] = AO_LEVEL[(s1 && s2) ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0)]
  }
  return out
}

const AXIS_BIAS = [[0.86, 1.00], [0.78, 1.06], [0.90, 0.90]]  // [-,+] per world axis
function normalBias(nx, ny, nz) {
  const w = [Math.abs(nx), Math.abs(ny), Math.abs(nz)]
  const s = [nx, ny, nz]
  let acc = 0, tot = 0
  for (let i = 0; i < 3; i++) { acc += w[i] * AXIS_BIAS[i][s[i] >= 0 ? 1 : 0]; tot += w[i] }
  return tot > 1e-6 ? acc / tot : 1
}

// direction index for (world axis, sign) — the inverse of DIRS
const DIR_OF = [[1, 0], [3, 2], [5, 4]]   // [axis][sign<0 ? 0 : 1]

/**
 * Tier A — a bevelled cube that emits ONLY the faces that are actually seen,
 * with a 1.2 mm chamfer on exactly the edges that are silhouette edges (both
 * adjoining faces exposed) and none anywhere else. A fully exposed voxel costs
 * the same 44 triangles a RoundedBoxGeometry would; the typical head edge voxel
 * costs SIX. Where a face's in-plane neighbour is occupied the quad runs to its
 * full extent, so it meets the neighbouring (Tier A or Tier B) face flush — no
 * chamfer notch, no gap, nothing to see at the tier boundary.
 */
function addBevelCube(acc, v, occupied, O) {
  const h = VX / 2, k = CHAMFER
  const C = [xMin(v.d) + h, yMin(v.r) + h, zMin(v.c) + h]
  const _ao = []
  const aoOf = (D2, s) => {
    if (!_ao[D2.i]) _ao[D2.i] = cornerAO(v, D2, occupied)
    const su = s[UAX[D2.i]], sv = s[VAX[D2.i]]
    for (let q = 0; q < 4; q++) if (CORNERS[q][0] === su && CORNERS[q][1] === sv) return _ao[D2.i][q]
    return 1
  }
  const open = (dl) => !occupied(v.d + dl[0], v.r + dl[1], v.c + dl[2])
  // emit a polygon (3 or 4 world points, already outward-CCW-or-not) with its
  // own flat normal, per-vertex AO taken from the face that owns each vertex
  const poly = (pts, aos, uA, vA) => {
    const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]
    const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]]
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const len = Math.hypot(n[0], n[1], n[2]) || 1
    n = [n[0] / len, n[1] / len, n[2] / len]
    const out = [pts[0][0] - C[0], pts[0][1] - C[1], pts[0][2] - C[2]]
    let order = [0, 1, 2, 0, 2, 3]
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) {
      n = [-n[0], -n[1], -n[2]]; order = [0, 2, 1, 0, 3, 2]
    }
    const bias = normalBias(n[0], n[1], n[2])
    const tri = pts.length === 3 ? order.slice(0, 3) : order
    for (const i of tri) {
      const P = pts[i]
      acc.v(P[0] - O[0], P[1] - O[1], P[2] - O[2], n[0], n[1], n[2],
        P[uA] / VX, P[vA] / VX, tintRGB(v.color, bias, aos[i]))
    }
  }

  for (const D of DIRS) {
    if (!open(D.s)) continue
    const nAx = D.n[0] ? 0 : D.n[1] ? 1 : 2
    const nS = D.n[nAx]
    const uA = UAX[D.i], vA = VAX[D.i]
    const oU = { '-1': open([-D.uL[0], -D.uL[1], -D.uL[2]]), 1: open(D.uL) }
    const oV = { '-1': open([-D.vL[0], -D.vL[1], -D.vL[2]]), 1: open(D.vL) }
    const pt = (an, au, av) => { const w = []; w[nAx] = C[nAx] + an; w[uA] = C[uA] + au; w[vA] = C[vA] + av; return w }
    const signs = (su, sv) => { const s = []; s[nAx] = nS; s[uA] = su; s[vA] = sv; return s }
    const iu = (su) => su * (h - (oU[su] ? k : 0))
    const iv = (sv) => sv * (h - (oV[sv] ? k : 0))
    // the face itself
    const fp = [], fa = []
    for (const [su, sv] of CORNERS) { fp.push(pt(nS * h, iu(su), iv(sv))); fa.push(aoOf(D, signs(su, sv))) }
    poly(fp, fa, uA, vA)
    // bevel strips along the two u edges and the two v edges
    for (const su of [-1, 1]) {
      if (!oU[su]) continue
      const P2 = DIRS[DIR_OF[uA][su > 0 ? 1 : 0]]
      if (P2.i < D.i) continue                                   // emitted by the other face
      const q = [pt(nS * h, iu(su), iv(-1)), pt(nS * h, iu(su), iv(1)),
        pt(nS * (h - k), su * h, iv(1)), pt(nS * (h - k), su * h, iv(-1))]
      poly(q, [aoOf(D, signs(su, -1)), aoOf(D, signs(su, 1)),
        aoOf(P2, signs(su, 1)), aoOf(P2, signs(su, -1))], uA, vA)
    }
    for (const sv of [-1, 1]) {
      if (!oV[sv]) continue
      const P2 = DIRS[DIR_OF[vA][sv > 0 ? 1 : 0]]
      if (P2.i < D.i) continue
      const q = [pt(nS * h, iu(-1), iv(sv)), pt(nS * h, iu(1), iv(sv)),
        pt(nS * (h - k), iu(1), sv * h), pt(nS * (h - k), iu(-1), sv * h)]
      poly(q, [aoOf(D, signs(-1, sv)), aoOf(D, signs(1, sv)),
        aoOf(P2, signs(1, sv)), aoOf(P2, signs(-1, sv))], uA, vA)
    }
    // corner triangles, emitted once by the lowest-index of the three faces
    for (const [su, sv] of CORNERS) {
      if (!oU[su] || !oV[sv]) continue
      const PU = DIRS[DIR_OF[uA][su > 0 ? 1 : 0]], PV = DIRS[DIR_OF[vA][sv > 0 ? 1 : 0]]
      if (PU.i < D.i || PV.i < D.i) continue
      poly([pt(nS * h, iu(su), iv(sv)), pt(nS * (h - k), su * h, iv(sv)), pt(nS * (h - k), iu(su), sv * h)],
        [aoOf(D, signs(su, sv)), aoOf(PU, signs(su, sv)), aoOf(PV, signs(su, sv))], uA, vA)
    }
  }
}

/**
 * meshVoxels(set, opts) -> { geoms: Map<colourHex, BufferGeometry>, tris, faces }
 *
 * opts.occlude  extra VoxelSets used ONLY for face culling (a prop culls against
 *               the skull it is welded to, so no interior faces are ever paid for)
 * opts.origin   world-space origin subtracted from every vertex (the bone pivot)
 */
function meshVoxels(vs, opts = {}) {
  const sets = [vs, ...(opts.occlude || [])]
  const occupied = (d, r, c) => {
    for (const s of sets) if (s.has(d, r, c)) return true
    return false
  }
  const O = opts.origin || [0, 0, 0]
  const accs = new Map()
  const accFor = (hex) => { let a = accs.get(hex); if (!a) { a = new VoxAcc(); accs.set(hex, a) } return a }

  const tierA = []
  const planes = new Map()      // "dir|plane" -> Map("a,b" -> cell)
  const allFaces = new Set()    // "dir|plane|a,b" for BOTH tiers — used to close seams
  let faces = 0
  // NO FLOATING VOXELS (round-3). Every voxel above the collar must share a full
  // 24 x 24 mm face with a neighbour — in its own set or in one of its
  // occluders. A cube touching only along an edge or a corner reads as a
  // z-fight or a build bug, and `Gore._detach()` has no surface to cut.
  // (The smoke cluster is exempt and opts out: its DETACHMENT is brief §2's
  // silhouette event and the whole gag, so it is meshed with assertWelded off.)
  let orphans = 0
  if (opts.assertWelded) {
    for (const v of vs.values()) {
      let touch = 0
      for (const D of DIRS) if (occupied(v.d + D.s[0], v.r + D.s[1], v.c + D.s[2])) touch++
      if (!touch) orphans++
    }
    if (orphans) console.warn(`[crypto-punkd] ${orphans} orphaned voxel(s) in set '${vs.name}'`)
  }
  const inPlane = (D, v) => (D.ax === 'd' ? [v.r, v.c] : D.ax === 'r' ? [v.d, v.c] : [v.d, v.r])

  for (const v of vs.values()) {
    const exposed = DIRS.filter((D) => !occupied(v.d + D.s[0], v.r + D.s[1], v.c + D.s[2]))
    if (!exposed.length) continue                       // fully enclosed — free
    faces += exposed.length
    const axes = new Set(exposed.map((D) => D.ax))
    const isA = (v.flags & F_FEATURE) !== 0 || axes.size >= 2
    for (const D of exposed) {
      const pi = D.ax === 'd' ? v.d : D.ax === 'r' ? v.r : v.c
      const [a, b] = inPlane(D, v)
      allFaces.add(`${D.i}|${pi}|${a},${b}`)
      if (isA) continue
      const kk = `${D.i}|${pi}`
      let pl = planes.get(kk)
      if (!pl) { pl = new Map(); planes.set(kk, pl) }
      pl.set(`${a},${b}`, { v, D, pi, a, b })
    }
    if (isA) tierA.push(v)
  }

  for (const v of tierA) addBevelCube(accFor(v.color), v, occupied, O)

  // --- Tier B: greedy merge coplanar, same-colour, uniform-AO runs ----------
  for (const [kk, pl] of planes) {
    const cut = kk.indexOf('|')
    const di = +kk.slice(0, cut), pi = +kk.slice(cut + 1)
    const D = DIRS[di]
    const info = new Map()
    for (const cell of pl.values()) {
      const ao = cornerAO(cell.v, D, occupied)
      info.set(`${cell.a},${cell.b}`, {
        cell, ao, uni: ao[0] === ao[1] && ao[1] === ao[2] && ao[2] === ao[3],
      })
    }
    const order = [...pl.values()].sort((p, q) => (p.a - q.a) || (p.b - q.b))
    const done = new Set()
    for (const start of order) {
      const k0 = `${start.a},${start.b}`
      if (done.has(k0)) continue
      const it = info.get(k0)
      const col = start.v.color
      const ok = (a, b) => {
        const nk = `${a},${b}`
        if (done.has(nk)) return false
        const ni = info.get(nk)
        return !!ni && ni.uni && it.uni && ni.cell.v.color === col && ni.ao[0] === it.ao[0]
      }
      let a1 = start.a, b1 = start.b
      if (it.uni) {
        while (ok(start.a, b1 + 1)) b1++
        let grow = true
        while (grow) {
          for (let b = start.b; b <= b1; b++) if (!ok(a1 + 1, b)) { grow = false; break }
          if (grow) a1++
        }
      }
      for (let a = start.a; a <= a1; a++) for (let b = start.b; b <= b1; b++) done.add(`${a},${b}`)
      emitRun(accFor(col), D, pi, start.a, a1, start.b, b1, col, it.ao, allFaces, O)
    }
  }

  const geoms = new Map()
  let tris = 0
  for (const [hex, a] of accs) { tris += a.triangles; const g = a.build(); if (g) geoms.set(hex, g) }
  return { geoms, tris, faces, orphans }
}

/** Emit one merged (or single-cell) face run as a quad. */
function emitRun(acc, D, pi, a0, a1, b0, b1, colorHex, ao, allFaces, O) {
  // colour-boundary groove (brief §3.10.9): the darker run is inset 0.3 mm, which
  // gives every colour transition a hairline AO line for free.
  const groove = 0.0003 * clamp01((0.60 - lumaOf(colorHex)) / 0.45)
  // Tier A already runs its quads to full extent wherever the in-plane neighbour
  // is occupied, so a merged run never needs to grow to meet one. Kept at 0 and
  // named, because the seam between the two tiers is exactly where a voxel model
  // usually shows a hairline crack.
  const G = 0
  const gA0 = allFaces.has(`${D.i}|${pi}|${a0 - 1},${b0}`) ? G : 0
  const gA1 = allFaces.has(`${D.i}|${pi}|${a1 + 1},${b0}`) ? G : 0
  const gB0 = allFaces.has(`${D.i}|${pi}|${a0},${b0 - 1}`) ? G : 0
  const gB1 = allFaces.has(`${D.i}|${pi}|${a0},${b1 + 1}`) ? G : 0

  let xLo, xHi, yLo, yHi, zLo, zHi
  if (D.ax === 'd') {                       // plane = depth layer; a = row, b = col
    const x = D.i === 0 ? xMin(pi) + VX : xMin(pi)
    xLo = xHi = x - D.n[0] * groove
    yLo = yMin(a1) - gA1; yHi = yMin(a0) + VX + gA0
    zLo = zMin(b1) - gB1; zHi = zMin(b0) + VX + gB0
  } else if (D.ax === 'r') {                // plane = row; a = depth, b = col
    const y = D.i === 2 ? yMin(pi) + VX : yMin(pi)
    yLo = yHi = y - D.n[1] * groove
    xLo = xMin(a1) - gA1; xHi = xMin(a0) + VX + gA0
    zLo = zMin(b1) - gB1; zHi = zMin(b0) + VX + gB0
  } else {                                  // plane = column; a = depth, b = row
    const z = D.i === 4 ? zMin(pi) + VX : zMin(pi)
    zLo = zHi = z - D.n[2] * groove
    xLo = xMin(a1) - gA1; xHi = xMin(a0) + VX + gA0
    yLo = yMin(b1) - gB1; yHi = yMin(b0) + VX + gB0
  }
  const lo = [xLo, yLo, zLo], hi = [xHi, yHi, zHi]
  const uA = UAX[D.i], vA = VAX[D.i]
  const pt = [], uv = [], col = []
  for (let i = 0; i < 4; i++) {
    const su = CORNERS[i][0] > 0, sv = CORNERS[i][1] > 0
    const w = [lo[0], lo[1], lo[2]]
    w[uA] = su ? hi[uA] : lo[uA]
    w[vA] = sv ? hi[vA] : lo[vA]
    pt.push([w[0] - O[0], w[1] - O[1], w[2] - O[2]])
    uv.push([w[uA] / VX, w[vA] / VX])
    col.push(tintRGB(colorHex, D.bias, ao[i]))
  }
  acc.quad(pt, D.n, uv, col)
}

// ===========================================================================
// HEAD — brief §3. An 11 wide x 17 tall front-plane grid extruded 9 voxels deep.
// r0 = crown, r16 = chin, c5 = centreline. Build this literally.
// ===========================================================================
//        c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10
const FACE_MAP = [
  '..#######..', // r0  crown cap, 7 wide
  '.#SSSSSSS#.', // r1  9 wide
  '#SSHSSSSSS#', // r2  11 wide from here down; H,H = the highlight DIAGONAL
  '#SHSSSSSSS#', // r3
  '#SSSSSSSSS#', // r4
  '#SsssssssS#', // r5  brow shadow band
  '#SEESSSEES#', // r6  eye row A — proud ink lid
  '#SEESSSEES#', // r7  eye row B — recessed pupil + glint
  '#SSSSSSSSS#', // r8
  '#SSSSSSSSS#', // r9
  '#SSS#s#SSS#', // r10 nostrils at c4/c6, proud bridge at c5
  '#BBBBBBBBB#', // r11 stubble starts (dithered)
  '#BBBBBBBBB#', // r12
  '#BBB###BBB#', // r13 mouth bar, 3 wide, c4-c6
  '#BBBBBBBBB#', // r14
  '#BBBBBBBBB#', // r15
  '.##BBBBB##.', // r16 chin taper
]
const GLYPH = { '#': 'ink', S: 'skinBase', s: 'skinShade', H: 'skinHilite', B: 'stubble' }

/**
 * The static skull: L1's map, the seven solid inner layers with their ink outer
 * ring, the back plane with its scalp block, the eight deleted volume corners,
 * the wrapped stubble, the ear + earring and the neck.
 */
function buildSkull(p, costume) {
  const S = new VoxelSet('skull')
  const rows = FACE_MAP.map((s) => s.split(''))
  const mask = (r, c) => r >= 0 && r <= 16 && c >= 0 && c <= 10 && rows[r][c] !== '.'
  // Costume 0's pushed-up goggles cover r1-r3, so the two skin-hilite voxels drop
  // one row to r3 c3 / r4 c2 — same diagonal, still visible (brief §7.4).
  if (costume === 0) {
    rows[2][3] = 'S'; rows[3][2] = 'S'; rows[3][3] = 'H'; rows[4][2] = 'H'
  }
  const C = (g) => p[GLYPH[g]]

  // --- L1 (d = 1): the front-plane map -------------------------------------
  for (let r = 0; r <= 16; r++) {
    for (let c = 0; c <= 10; c++) {
      const g = rows[r][c]
      if (g === '.') continue
      if (g === 'E') { if (r === 6) S.set(1, r, c, p.skinShade); continue }  // r7 = open socket
      if (r === 13 && c >= 4 && c <= 6) continue                             // recessed mouth
      S.set(1, r, c, C(g))
    }
  }
  // 1-voxel-period dither on the stubble boundary row (brief §6).
  // ROUND-3 FIX: this used to alternate `skinBase` (luma 0.77) into the stubble
  // row (0.46). A near-white checkerboard sitting under the nose and above the
  // dark mouth bar reads as TEETH — the head came back as a grinning skull. The
  // dither is now `skinShade` (0.61), an intermediate step between the skin
  // field above and the stubble field below, so it can never out-value the skin
  // it is supposed to be dissolving into.
  for (let c = 2; c <= 8; c += 2) S.set(1, 11, c, p.skinShade)
  // proud nose bridge (brief §3.6): total nose relief is 24 mm, never a wedge.
  S.set(0, 10, 5, p.skinShade, F_FEATURE)

  // --- L2..L8: solid skin, ink outer ring ----------------------------------
  //
  // ROUND-4 P0 — WHY THE HEAD READ AS AN OPEN CARDBOARD BOX.
  //
  // `ring()` is a test on the (r, c) grid, and the old loop applied it to every
  // depth layer. Columns c0 and c10 are ring cells at every row, so the rule
  // painted `voxel-ink` into c0 and c10 for ALL SEVEN interior layers — i.e.
  // the head's entire 9 x 17 LEFT and RIGHT PLANES were solid near-black, not
  // a one-voxel keyline. Measured on the shipped render: front plane luma 0.81,
  // side plane 0.26, a 0.32 multiplier where §3.10.5 specifies 0.90 for +/-Z.
  // The bias table was innocent; the ALBEDO was black. From any angle off dead
  // centre the head read as a box with one printed face.
  //
  // §2 asks for "a one-voxel-thick shell of `voxel-ink` on the head's OUTER
  // SILHOUETTE" — a keyline, not a filled plane. So the interior layers now
  // take ink only on the crown row and the chin row (the two rows that ARE the
  // silhouette from the side), and their side columns are `skin-base`. The
  // resulting side plane is a 7 x 15 field of skin framed by a genuine 1-voxel
  // ink border: L1 in front, L9 behind, the crown band above, the chin band
  // below. The front silhouette keyline is untouched — that lives in L1's own
  // c0/c10, straight out of the §3.2 map.
  const ring = (r, c) => !mask(r - 1, c) || !mask(r + 1, c) || !mask(r, c - 1) || !mask(r, c + 1)
  const capRow = (r, c) => !mask(r - 1, c) || !mask(r + 1, c)
  for (let d = 2; d <= 8; d++) {
    for (let r = 0; r <= 16; r++) {
      for (let c = 0; c <= 10; c++) {
        if (!mask(r, c)) continue
        S.set(d, r, c, capRow(r, c) ? p.ink : p.skinBase)
      }
    }
  }
  // --- L9: back plane, skin-shade + a rear scalp block ---------------------
  for (let r = 0; r <= 16; r++) {
    for (let c = 0; c <= 10; c++) {
      if (!mask(r, c)) continue
      S.set(9, r, c, ring(r, c) ? p.ink : p.skinShade)
    }
  }
  S.fill(9, 9, 0, 4, 4, 6, p.ink)
  // --- stubble wrap (brief §3.9) -------------------------------------------
  // Facial hair that stops dead at the silhouette edge looks painted on. With
  // the side planes now skin rather than a black slab, the wrap can go where
  // the brief actually asks for it: 2 voxels onto both side planes and 1 onto
  // the back. It never touches L1 (d = 1), which is the front silhouette
  // keyline, so the §2 keyline is still intact everywhere.
  for (let r = 11; r <= 16; r++) {
    for (const c of [0, 10]) {
      if (!mask(r, c) || capRow(r, c)) continue      // never eat the ink border
      for (const d of [2, 3]) S.set(d, r, c, p.stubble)
    }
    for (let c = 1; c <= 9; c++) if (mask(r, c) && !ring(r, c)) S.set(9, r, c, p.stubble)
  }
  // --- the eight deleted volume corners (brief §3.9) -----------------------
  for (const d of [1, 9]) for (const r of [2, 15]) for (const c of [0, 10]) S.del(d, r, c)

  // --- THE SOCKET FIX (round-3 P0) -----------------------------------------
  // The pupil, glint and mouth-bar voxels are pose-toggled clusters that live
  // at d = 2 (recessed one voxel, brief §3.4/§3.7). The skull's own L2 fill was
  // ALSO writing `skinBase` into those same eight lattice cells, so the pose
  // cube's front quad and the skull's front quad were coplanar at x = +0.084
  // and z-fought: what shipped was a vacant grey-green socket with a dark smear
  // in it and no pupil, no glint, and a mouth that flickered. Carve the cells
  // out of the skull and let the pose clusters own them. When a pose hides them
  // (KO, blink) L3 is exposed underneath, so the socket deepens to 2 vx — there
  // is never a hole.
  for (const c of [2, 3, 7, 8]) S.del(2, 7, c)      // pupil + glint row
  for (let c = 4; c <= 6; c++) S.del(2, 13, c)      // mouth bar
  // Same rule for the goggle window (costume 0): the emissive band lives at
  // d = 1 so it is recessed inside the bezel, so L1 gives up those 7 cells.
  if (costume === 0) for (let c = 2; c <= 8; c++) S.del(1, 2, c)

  // --- ear + earring: the one permitted silhouette asymmetry (brief §3.8) --
  S.set(3, 7, -1, p.skinBase, F_FEATURE); S.set(4, 7, -1, p.skinBase, F_FEATURE)
  S.set(3, 8, -1, p.skinBase, F_FEATURE); S.set(4, 8, -1, p.skinBase, F_FEATURE)
  S.set(2, 9, -1, p.ink, F_FEATURE)
  S.set(3, 9, -1, p.gold, F_FEATURE)      // ONE cube. Never a torus.
  S.set(4, 9, -1, p.ink, F_FEATURE)

  // --- neck: 3 skin voxels wide, ink flanks, 3 rows (0.072 m) -------------
  for (let r = 17; r <= 19; r++) {
    S.fill(3, 7, r, r, 4, 6, p.skinBase)
    S.fill(3, 7, r, r, 3, 3, p.ink); S.fill(3, 7, r, r, 7, 7, p.ink)
  }
  return S
}

/** Mohawk fin — brief §7.1. A stepped blade, welded to the crown. Never slopes. */
function buildMohawk(p, costume) {
  const M = new VoxelSet('fin')
  const tall = costume === 1 ? 8 : 6                     // no fedora in costume 1
  // leading-edge staircase: 1,2,3,4,5,5(,5,5) voxels of depth, top row first
  for (let i = 0; i < tall; i++) {
    const r = -tall + i                                   // r = -tall .. -1
    const depth = Math.min(5, i + 1)
    for (let d = 0; d < depth; d++) {
      for (let c = 4; c <= 6; c++) {
        const dark = d === 4 || r === -1
        M.set(d, r, c, dark ? p.mohawkDark : p.mohawk, F_FEATURE)
      }
    }
  }
  return M
}

/**
 * Costume 0: VR goggles worn PUSHED UP on the forehead, rows r1-r3, 9 vx wide.
 * Costume 1: anaglyph 3D glasses worn ON the eyes, 11 vx wide, rows r5-r7.
 * Nine and eleven — odd, so they centre on c5 (brief §7.4).
 */
function buildGoggles(p, costume) {
  const G = new VoxelSet('goggles')
  if (costume === 0) {
    // ROUND-3 FIX. This used to occupy d = -1 AND d = 0, i.e. TWO voxels proud
    // (front face x = +0.156). It read as an oversized smooth grey slab that
    // overhung the head. Brief §7.4 asks for a front face at x = +0.132, which
    // is d = 0 and d = 0 only: exactly ONE voxel proud, 9 vx (Z) x 3 vx (Y),
    // rows r1-r3, columns c1-c9. Depth is 1 vx rather than the brief's 3
    // because d = 1 and d = 2 are occupied by the skull's own front plane and
    // L2 — carving them out would delete the r3 c3 `skin-hilite` voxel and open
    // a 3-voxel crater in the forehead every time the goggles snap down.
    // Declared as divergence D6.
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 9; c++) {
        if (r === 2 && c >= 2 && c <= 8) continue      // the window opening
        const edge = r === 1 || r === 3 || c === 1 || c === 9
        G.set(0, r, c, edge ? p.vrEdge : p.vrBody, F_FEATURE)
      }
    }
    // 7 vx x 1 vx window, RECESSED one voxel inside the bezel opening so the
    // emissive band sits in a real 24 mm socket and throws a hard top shadow
    // instead of reading as paint on a flat face.
    for (let c = 2; c <= 8; c++) G.set(1, 2, c, p.screen, F_FEATURE)
    // strap: 1 vx, row r2, wrapping both side planes and the back
    for (let d = 1; d <= 9; d++) { G.set(d, 2, -1, p.ink, F_FEATURE); G.set(d, 2, 11, p.ink, F_FEATURE) }
    for (let c = 0; c <= 10; c++) G.set(10, 2, c, p.ink, F_FEATURE)
  } else {
    for (let r = 5; r <= 7; r++) {
      for (let c = 0; c <= 10; c++) G.set(0, r, c, p.vrBody, F_FEATURE)
    }
    for (let r = 6; r <= 7; r++) {
      for (let c = 2; c <= 4; c++) G.set(-1, r, c, p.vrEdge, F_FEATURE)   // blue, char's left
      for (let c = 6; c <= 8; c++) G.set(-1, r, c, p.screen, F_FEATURE)   // red
    }
    for (let d = 1; d <= 9; d++) { G.set(d, 6, -1, p.vrBody, F_FEATURE); G.set(d, 6, 11, p.vrBody, F_FEATURE) }
  }
  return G
}

/** Pipe (costume 0) / cigarette (costume 1) — brief §7.3. */
function buildPipe(p, costume) {
  const P = new VoxelSet('pipe')
  if (costume === 0) {
    // THE STEM MUST READ AS A STEM. Shipped in `pipe-briar-dark` it was the
    // same brown as the bowl, so bowl + stem merged into one featureless block
    // hanging off the jaw — at 3 m the critic read it as a chin wound. It is
    // now vulcanite (`pipe-stem`, roughness 0.16, the glossiest surface above
    // the collar): a dark, specular, 1-voxel diagonal staircase running from
    // the mouth bar's c6 edge out to the bowl, exactly as the source draws it.
    // Three voxels long including the weld cell added at build time, so the
    // mouth and the bowl are visibly one object.
    P.set(-1, 13, 7, p.stem, F_FEATURE)                   // stem A, one vx proud
    P.set(-2, 14, 8, p.stem, F_FEATURE)                   // stem B, one row lower
    for (let d = -5; d <= -3; d++) {                      // 3x3x3 briar bowl
      for (let r = 14; r <= 16; r++) {
        for (let c = 7; c <= 9; c++) {
          const shade = c === 9 || r === 16
          P.set(d, r, c, shade ? p.briarDark : p.briar, F_FEATURE)
        }
      }
    }
    P.del(-4, 14, 8)                                      // the bore: recess 1 vx
    P.set(-4, 15, 8, p.ink, F_FEATURE)                    // and recolour what it exposes
  } else {
    for (let d = -1; d >= -5; d--) P.set(d, 13, 7, p.cig, F_FEATURE)
    P.set(-6, 13, 7, p.ember, F_FEATURE)
  }
  return P
}

/** Voxel smoke — parented to `head`, so it survives decapitation. Brief §7.3. */
function buildSmoke(p, costume) {
  const K = new VoxelSet('smoke')
  if (costume === 0) {
    K.set(-5, 10, 9, p.smoke, F_FEATURE)                  // trail A
    K.set(-5, 6, 9, p.smoke, F_FEATURE)                   // trail B
    for (let d = -6; d <= -4; d++) {                      // 3 x 2 x 2 puff = 12 voxels
      for (let r = 1; r <= 2; r++) for (let c = 8; c <= 9; c++) K.set(d, r, c, p.smoke, F_FEATURE)
    }
  } else {
    for (let r = 10; r >= 5; r--) K.set(-6, r, 7, p.smoke, F_FEATURE)
  }
  return K
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y = 0, 1.85 m tall.
// Above the collar: 24 mm voxel lattice, flat-shaded, constant roughness.
// Below the collar: smooth, bevelled, tailored, spatially-varying roughness.
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const cos = costume === 1 ? 1 : 0
  const p = PAL[cos]
  const group = new THREE.Group()
  const bones = {}
  latticeBad = 0

  // =========================================================================
  // SURFACING — brief §6. Real pbr() presets everywhere; not one region is left
  // on 'default'. The head deliberately withholds spatially varying roughness
  // (divergence D2) — it is a picture, not a physical material.
  // =========================================================================
  const gridMaps = surfaceMaps('pixel-grid', { nearest: true, scale: 1 })

  // Head: `plastic`, NORMAL MAP ONLY. Binding pixel-grid's roughnessMap would
  // silently reintroduce the spatial variation the design forbids, so we ask for
  // noMaps (which also makes `roughness` an absolute, not a multiplier) and hand
  // the normal map back in explicitly.
  //
  // THE COOL FLOOR. `emissive` is the one term a warm directional key cannot
  // rotate: it is added after the light loop, so a teal emissive survives an
  // 0xffb066 sun where a teal albedo does not. The head — and only the head —
  // therefore carries a small self-lit floor in its own hue. That is also the
  // correct art argument: divergence D2 already says the head is a PICTURE, not
  // a physical material, and a picture keeps its palette under any light.
  // Sized to 0.55 (skin) so it holds the hue without flattening form; the key
  // still supplies ~70% of the face's energy and the specular lobe below is
  // what describes the relief. Well under the Pipeline's bloom threshold.
  //
  // ROUGHNESS DOWN, ACROSS THE BOARD (critic: "no specular lobe on the head at
  // all"). D2 forbids roughness VARIATION on the head, not specular. Skin
  // 0.62 -> 0.42, ink 0.48 -> 0.30, so the proud lids, the proud nose bridge,
  // the crown's top chamfers and the keyline all catch a highlight sliver.
  // envMapIntensity drops 0.55 -> 0.38 because the environment is the other
  // warm term and it was the second half of the hue error.
  const headMat = (hex, roughness, extra = {}) => pbr(hex, 'plastic', {
    noMaps: true,
    normalMap: gridMaps.normalMap,
    roughness,
    metalness: 0,
    envMapIntensity: 0.38,
    emissive: p.headGlow,
    emissiveIntensity: 0.55,
    flatShading: true,
    vertexColors: true,
    name: `punkd-head-${hex.toString(16)}`,
    ...extra,
  })
  const finMat = (hex) => pbr(hex, 'plastic-gloss', {
    noMaps: true, normalMap: gridMaps.normalMap, roughness: 0.26, metalness: 0,
    envMapIntensity: 0.45, flatShading: true, vertexColors: true, clearcoat: 0.25,
    emissive: p.finGlow, emissiveIntensity: 0.45,
    name: `punkd-fin-${hex.toString(16)}`,
  })
  // Smoke, the goggle screen and the eye glints are driven at runtime -> unique.
  // The detached smoke column is §2's silhouette event and nothing else in the
  // roster has one, so it has to actually READ. At 0.74 opacity over a busy
  // arena the four elements dissolved; 0.88 keeps them crisp translucent cubes
  // with visible edges, which is the joke (his smoke is 8-bit too). Merged into
  // closed hulls with interior faces culled, `depthWrite: true`, no billboards.
  const smokeMat = pbr(p.smoke, 'plastic', {
    unique: true, noMaps: true, roughness: 1.0, flatShading: true, vertexColors: true,
    transparent: true, opacity: 0.88, depthWrite: true, side: THREE.FrontSide,
    emissive: 0x424c56, emissiveIntensity: 0.28, name: 'punkd-smoke',
  })
  // The goggle window used to be the loudest, most saturated element on the
  // model, sitting across the 5-row blank forehead §3.3 orders left empty, in
  // the SAME cyan as the eye glints — three stacked cyan bars and the head read
  // as a robot. It is now a deep indigo at 0.42 emissive: a different hue from
  // the eyes, well below the face in value, and it no longer wins the frame.
  const screenMat = pbr(p.screen, 'screen', {
    unique: true, noMaps: true, roughness: 0.25, flatShading: true, vertexColors: true,
    emissive: p.screen, emissiveIntensity: 0.42, envMapIntensity: 0.25, name: 'punkd-vr-screen',
  })
  // The glint is a CATCHLIGHT, not an LED. §3.4's own source note is that the
  // second eye pixel is "a lighter SKIN tint, not white" — it shipped as a full
  // 24 mm face of saturated cyan and read as a pilot light. Now a pale mint two
  // steps above `skin-hilite` in the same hue family, so the eye reads as a
  // highlight on skin. Emissive stays at §3.4's 0.35.
  const glintMat = pbr(p.glint, 'plastic', {
    unique: true, noMaps: true, roughness: 0.22, flatShading: true, vertexColors: true,
    emissive: p.glint, emissiveIntensity: 0.35, envMapIntensity: 0.38, name: 'punkd-glint',
  })
  const matForVoxelColor = (hex) => {
    if (hex === p.smoke) return smokeMat
    if (hex === p.screen) return screenMat
    if (hex === p.glint) return glintMat
    // THE KEYLINE. Measured brown (#754d21, hue 30) on the round-3 shots — the
    // same warm family and nearly the same luma as the arena wall, on the one
    // element §2 calls non-negotiable. Cause: `voxel-ink` is 0.15 luma, so
    // almost none of its screen value comes from its own albedo — it comes from
    // the warm key and the warm environment, and both of those are orange. The
    // ink now takes its own cool near-black emissive floor and drops its
    // environment response to 0.20, which pins the keyline at a near-neutral
    // luma ~0.24 against a 0.34 wall in every warm arena.
    if (hex === p.ink) {
      return headMat(hex, 0.30, {
        envMapIntensity: 0.20, emissive: p.inkGlow, emissiveIntensity: 0.60,
      })
    }
    if (hex === p.mohawk || hex === p.mohawkDark) return finMat(hex)
    if (hex === p.stubble) return headMat(hex, 0.42)
    // The single most common attribute in the source archetype (24.6%) is one
    // cube 24 mm on a side. A metal with a broad lobe at that size is invisible,
    // so the earring runs a tight lobe and a strong environment: it is meant to
    // FLASH as the head turns, which is how a 24 mm stud reads at 3 m.
    if (hex === p.gold) return pbr(hex, 'gold', {
      noMaps: true, roughness: 0.18, metalness: 1.0, flatShading: true, vertexColors: true,
      envMapIntensity: 1.6, emissive: 0x2a1e06, emissiveIntensity: 0.5, name: 'punkd-earring',
    })
    if (hex === p.briar || hex === p.briarDark) return pbr(hex, 'wood-rough', {
      mapOpts: { scale: 30, repeat: [2, 2] }, roughness: 0.95, flatShading: true,
      vertexColors: true, envMapIntensity: 0.7, name: `punkd-briar-${hex.toString(16)}`,
    })
    // Vulcanite pipe stem — §6's 0.16 roughness and the glossiest thing above
    // the collar. It exists so the two stem voxels read as a STEM joining the
    // mouth bar to the bowl, instead of the bowl reading as a detached lump on
    // the jaw.
    if (hex === p.stem) return pbr(hex, 'plastic-gloss', {
      noMaps: true, roughness: 0.16, flatShading: true, vertexColors: true,
      envMapIntensity: 0.5, name: 'punkd-pipe-stem',
    })
    if (hex === p.vrBody || hex === p.vrEdge) return headMat(hex, 0.40)
    if (hex === p.cig || hex === p.ember) return headMat(hex, 0.55)
    return headMat(hex, 0.42)             // skin family: constant scalar, no map (D2)
  }

  // Body — everything below the collar responds fully to the environment and
  // carries real spatially varying roughness (0.16 pipe stem .. 0.86 hat felt).
  // GABARDINE, NOT WICKER. The round-3 coat ran `cloth-weave` at scale 6 over a
  // repeat of 3.5 x 4.5 on a 0.9 m panel — a ~10 mm cell, which is basketry at
  // 3 m and hessian at 30 cm, and it was the ONLY nameable fabric on the whole
  // model because the sleeves, skirt, trousers and hat all shared it. The cell
  // is now ~2.5 mm (scale 20 at repeat 7 x 9): at that pitch a 2x2 twill stops
  // being visible basketry and becomes the faint directional lustre that is
  // gabardine's actual defining optical property. Three fabrics are now
  // nameable blind: this twill, the trousers' coarser worsted (different scale
  // AND a different repeat), and the waxed leather on belt/cuffs/boots.
  // Sheen drops 0.18 -> 0.11: a fresnel sheen on a near-silhouette normal is
  // the most likely source of the single-pixel white fizz the critic found
  // along the coat's left edge and the fedora brim.
  const coatM = pbr(p.coat, 'suit', {
    mapOpts: { scale: 20, repeat: [7, 9], wear: 0.25 },
    roughness: 1.0, sheen: 0.11, sheenRoughness: 0.60, envMapIntensity: 1.1, name: 'punkd-gabardine',
  })
  // The coat's roughness SWING (brief §6): 0.80 on dry unworn panels, 0.62 where
  // the cloth is rubbed — shoulder tops, elbows, the belt line, the storm flap.
  // One material cannot vary spatially without a mask, so the worn regions get
  // their own instance and a visibly tighter specular lobe. This is what lets a
  // highlight actually travel across the gabardine instead of returning one flat
  // frontal wash from every panel.
  const coatWornM = pbr(p.coat, 'suit', {
    mapOpts: { scale: 20, repeat: [7, 9], wear: 0.55 },
    roughness: 0.82, sheen: 0.16, sheenRoughness: 0.42, envMapIntensity: 1.25,
    name: 'punkd-gabardine-worn',
  })
  const liningM = pbr(p.coatShadow, 'cloth', {
    mapOpts: { scale: 16, repeat: [4, 4] }, roughness: 0.85, sheen: 0.20,
    side: THREE.DoubleSide, envMapIntensity: 1.0, name: 'punkd-lining',
  })
  const feltM = pbr(p.hat, 'cloth', {
    mapOpts: { scale: 3, repeat: [2.4, 2.4], wear: 0.3 },
    roughness: 1.0, sheen: 0.30, sheenRoughness: 0.70, envMapIntensity: 1.1, name: 'punkd-felt',
  })
  // The brim is a 4 mm shell whose notch (see the fedora block) leaves two open
  // cut edges — DoubleSide so you never see through them at a grazing angle.
  const brimM = pbr(p.hat, 'cloth', {
    mapOpts: { scale: 3, repeat: [2.4, 2.4], wear: 0.3 },
    roughness: 1.0, sheen: 0.30, sheenRoughness: 0.70, envMapIntensity: 1.1,
    side: THREE.DoubleSide, name: 'punkd-felt-brim',
  })
  const bandM = pbr(p.hatBand, 'cloth', {
    mapOpts: { scale: 20, repeat: [8, 1.2] }, roughness: 0.9, envMapIntensity: 1.0, name: 'punkd-grosgrain',
  })
  // WAXED LEATHER — the third nameable material. It used to run a roughness
  // MULTIPLIER of 1.12, i.e. rougher than the leather map's own authored value,
  // which is why belt, cuff straps and boot uppers read as the same dull cloth
  // as everything else. 0.62 on the strapping and 0.44 on the boot upper give a
  // real, tight, waxed lobe, and the toe cap (0.30) is the polished one.
  const beltM = pbr(p.hat, 'leather', {
    mapOpts: { scale: 14, repeat: [5, 1.2], wear: 0.45 }, roughness: 0.62, envMapIntensity: 1.15,
    name: 'punkd-belt',
  })
  const shoeM = pbr(p.hat, 'leather', {
    mapOpts: { scale: 14, repeat: [4, 2.4], wear: 0.45 }, roughness: 0.44, envMapIntensity: 1.35,
    name: 'punkd-shoe',
  })
  const capM = pbr(p.hat, 'leather', {
    mapOpts: { scale: 14, repeat: [4, 2.4], wear: 0.20 }, roughness: 0.30, envMapIntensity: 1.5,
    name: 'punkd-toecap',
  })
  // The sole shipped as an ALIASED BLACK QUAD — `hat-felt` (luma 0.19) lit only
  // from below reads as a hole punched in the floor and breaches the contract's
  // 30-sRGB albedo floor once shading lands. It gets its own lighter rubber
  // (luma 0.27) and a real chamfered perimeter so it catches a rim.
  const soleM = pbr(p.sole, 'rubber', {
    mapOpts: { scale: 10, repeat: [4, 2] }, roughness: 0.8, envMapIntensity: 0.9,
    name: 'punkd-sole',
  })
  const gloveM = pbr(p.hat, 'leather', {
    mapOpts: { scale: 14, repeat: [6, 6], wear: 0.5 }, roughness: 0.70, envMapIntensity: 1.0,
    name: 'punkd-glove',
  })
  const shirtM = pbr(p.shirt, 'cloth', {
    mapOpts: { scale: 24, repeat: [3, 4] }, roughness: 0.95, envMapIntensity: 0.9, name: 'punkd-shirt',
  })
  const tieM = pbr(p.coatShadow, 'cloth', {
    mapOpts: { scale: 24, repeat: [1.5, 6] }, roughness: 0.95, envMapIntensity: 0.95, name: 'punkd-tie',
  })
  // Trousers move from `coat-shadow` (luma 0.34) to `hat-felt` (0.19). §5's
  // three-value ladder is head 0.77 / coat 0.51 / hat + shoes + trousers 0.19,
  // and with the legs sitting at 0.34 the bottom of the figure was a fourth
  // value that muddied the read at 160x90. Squint test: three greys, stacked.
  // A DIFFERENT weave from the coat, deliberately: coarser worsted, half the
  // cell density, no sheen. Two cloths at the same cell pitch are one cloth.
  const trouserM = pbr(p.hat, 'suit', {
    mapOpts: { scale: 11, repeat: [3, 4.5] }, roughness: 0.92, sheen: 0.06, envMapIntensity: 1.0,
    name: 'punkd-trouser',
  })
  // Buttons are HORN (§6) — a lower-roughness top so each one catches a real
  // highlight, plus a darker leather rim ring at each button (see the button
  // loop) so they stop reading as flat decals sharing the coat's response.
  const hornM = pbr(p.horn, 'horn', { mapOpts: { scale: 40, repeat: [1, 1] }, roughness: 0.34, envMapIntensity: 1.2, name: 'punkd-button' })
  const steelM = pbr(0x9aa0a8, 'metal', { mapOpts: { scale: 18, repeat: [2, 2] }, roughness: 0.7, name: 'punkd-hardware' })
  const goldM = pbr(p.gold, 'gold', { mapOpts: { scale: 22, repeat: [2, 2] }, roughness: 0.75, name: 'punkd-buckle' })
  // THE FOUR MINT SLIVERS — deleted. `trim-cyan` was running as 4 mm x 380 mm
  // unshaded strips down both lapels, a 4 mm strip across the under-collar and
  // one at the cuff. At 4 mm they are sub-pixel in width at fighting-game
  // distance, so they rendered as perfectly straight, hard-edged, falloff-free
  // saturated lines with no thickness — indistinguishable from a z-fight or a
  // stray emissive strip, and the first thing a stranger's eye landed on. A
  // glitch artefact in a beauty shot is the fastest "amateur" signal there is.
  // `trim-cyan` now survives on ONE object: the magnifying lens's inner bead,
  // which is a 2.5 mm torus on a prop, reads as a coated optic, and is nowhere
  // near a silhouette. Everything that used to be piping is coat lining.
  const pipingM = pbr(p.trim, 'plastic-gloss', {
    noMaps: true, roughness: 0.35, emissive: p.trim, emissiveIntensity: 0.08, name: 'punkd-piping',
  })
  const glassM = pbr(p.glass, 'glass', {
    unique: true, noMaps: true, roughness: 0.04, ior: 1.5, thickness: 0.004,
    transparent: true, opacity: 0.5, name: 'punkd-lens-glass',
  })

  // small local helpers ----------------------------------------------------
  const pivot = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g
  }
  const bent = (parent, rz = 0, rx = 0, ry = 0) => {
    const g = new THREE.Group(); g.rotation.set(rx, ry, rz); parent.add(g); return g
  }
  const put = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz)
    parent.add(m); return m
  }
  /** Mesh a VoxelSet into one object with one merged geometry per colour. */
  let headTris = 0, headFaces = 0, headCalls = 0
  const voxObject = (vs, name, opts = {}) => {
    const g = new THREE.Group()
    g.name = name
    const { geoms, tris, faces } = meshVoxels(vs, { origin: HEAD_PIVOT, ...opts })
    headTris += tris; headFaces += faces
    for (const [hex, geo] of geoms) {
      const m = new THREE.Mesh(geo, matForVoxelColor(hex))
      m.name = `${name}-${hex.toString(16)}`
      m.userData.surface = 'plastic'
      g.add(m); headCalls++
    }
    return g
  }
  /** A one-off relief cluster used by the face-pose table. */
  const poseVox = (cells, hex, name) => {
    const vs = new VoxelSet(name)
    for (const [d, r, c] of cells) vs.set(d, r, c, hex, F_FEATURE)
    const o = voxObject(vs, name)
    return o
  }

  // Local vertex warp — the cached geometries are SHARED, so clone first.
  const warp = (geo, fn) => {
    const g = geo.clone()
    const pos = g.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); fn(v)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }
  // rrp(widthZ, depthX, radius) — loft() reads roundedRectPoints(w, h) as w->Z, h->X.
  const rrp = (wz, dx, r, seg = 3) => roundedRectPoints(wz, dx, r, seg)

  /**
   * A LOOSE voxel — one that lives off the head lattice (the wrist dissolve,
   * the escaped voxel on the lens ring) but must wear a head material.
   *
   * Every head material carries `vertexColors: true`, because the lattice bake
   * ships its face bias and AO in the colour attribute. A geometry with no
   * `color` attribute under such a material gets the WebGL attribute default,
   * (0, 0, 0), and the mesh renders BLACK. So these cubes get their own colour
   * attribute, baked with the same per-face brightness bias as the lattice
   * (AO = 1.0: nothing is adjacent to them) — which is also what makes them
   * read as having come off the head rather than as stray boxes.
   * roundedBox() hands back a CACHED buffer, so clone before writing to it.
   */
  const looseVoxel = (hex) => {
    const g = roundedBox(VX, VX, VX, CHAMFER, 1).clone()
    const nor = g.attributes.normal
    const col = new Float32Array(nor.count * 3)
    for (let i = 0; i < nor.count; i++) {
      const t = tintRGB(hex, normalBias(nor.getX(i), nor.getY(i), nor.getZ(i)), 1.0)
      col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2]
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.name = `loose-voxel-${hex.toString(16)}`
    return g
  }

  // =========================================================================
  // HIPS + LEGS — trousers, 1940s cap-toe oxfords, 5 degrees of toe spring.
  // =========================================================================
  const hips = pivot(group, 0, 0.86, 0)
  bones.hips = hips
  put(hips, loft([
    { y: -0.10, shape: rrp(0.330, 0.240, 0.055) },
    { y: -0.02, shape: rrp(0.380, 0.270, 0.060) },
    { y: 0.06, shape: rrp(0.372, 0.262, 0.060) },
    { y: 0.12, shape: rrp(0.360, 0.250, 0.055) },
  ], { subdivide: 3 }), trouserM, 0, 0, 0)

  for (const side of [1, -1]) {
    const leg = pivot(hips, 0.05 * side, -0.02, 0.150 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    // hip joint sleeved into the pelvis so the socket never opens
    put(leg, sleeve(0.108, 0.092, 0.10, { radialSeg: 18 }), trouserM, 0, -0.02, 0, Math.PI, 0, 0)
    put(leg, taperedCapsule(0.090, 0.072, 0.30, 4, 18), trouserM, 0, -0.22, 0)
    const shin = pivot(leg, 0, -0.42, 0)
    bones[side === 1 ? 'shinL' : 'shinR'] = shin
    put(shin, weld(0.072, 0.068, 0.03, { bulge: 0.16, radialSeg: 18 }), trouserM, 0, 0.005, 0)
    put(shin, taperedCapsule(0.066, 0.052, 0.21, 4, 16), trouserM, 0, -0.16, 0)
    // trouser break over the shoe
    put(shin, skirt(0.056, 0.070, 0.070, { radialSeg: 18, curve: 0.7 }), trouserM, 0, -0.255, 0)
    // --- shoe: cap-toe oxford, sole 24 mm, 5 deg toe spring ----------------
    const foot = bent(shin, 0, 0, 0.30 * side)
    foot.position.set(0, -0.42, 0)
    foot.rotation.set(0, 0.30 * side, 0)
    put(foot, taperedBox(0.185, 0.112, 0.150, 0.098, 0.085, 0.028, { rim: 0.020, cornerSeg: 3 }),
      shoeM, 0.010, 0.043, 0)
    put(foot, taperedBox(0.120, 0.104, 0.070, 0.070, 0.055, 0.026, { rim: 0.022, cornerSeg: 3 }),
      capM, 0.118, 0.030, 0, 0, 0, -0.087)                        // cap toe + toe spring
    // SOLE — its own lighter rubber (luma 0.27, not the 0.19 hat felt) and a
    // 5 mm chamfer on the whole perimeter, so the bottom edge catches a rim
    // from the floor bounce instead of dying as a pure-black aliased quad with
    // a hole-in-the-floor read.
    put(foot, roundedBox(0.290, 0.024, 0.120, 0.005, 2), soleM, 0.030, 0.012, 0)
    put(foot, roundedBox(0.086, 0.030, 0.104, 0.005, 2), soleM, -0.075, 0.015, 0)  // heel block
    // WELT — a real 5 mm leather rand standing proud of both sole and upper, so
    // there is a modelled break line between them rather than one dark mass.
    put(foot, roundedBox(0.296, 0.007, 0.126, 0.003, 2), beltM, 0.030, 0.026, 0)
    // toe-cap seam at 62% of the length — real geometry, not a texture
    put(foot, roundedBox(0.006, 0.030, 0.108, 0.002, 1), beltM, 0.057, 0.040, 0)
    // laces
    for (let i = 0; i < 3; i++) put(foot, roundedBox(0.008, 0.007, 0.062, 0.003, 1), beltM, -0.010 - i * 0.024, 0.078 - i * 0.004, 0)
  }

  // =========================================================================
  // TORSO — one continuous lofted shell: pelvis -> waist pinch -> chest ->
  // rolled shoulder. Rounded-rect cross-section, 0.05 m corner radius.
  // =========================================================================
  const torso = pivot(hips, 0, 0.08, 0)
  bones.torso = torso
  const T = (world) => world - 0.940                                // torso-local Y
  put(torso, loft([
    { y: T(0.900), shape: rrp(0.376, 0.268, 0.058) },
    { y: T(1.010), shape: rrp(0.360, 0.250, 0.055) },               // belt line, waist 0.69 taper
    { y: T(1.110), shape: rrp(0.400, 0.272, 0.058) },
    { y: T(1.220), shape: rrp(0.440, 0.300, 0.062) },               // chest
    { y: T(1.320), shape: rrp(0.474, 0.292, 0.070) },
    { y: T(1.372), shape: rrp(0.430, 0.250, 0.075) },               // rolled shoulder
    { y: T(1.412), shape: rrp(0.260, 0.180, 0.070) },
    { y: T(1.446), shape: rrp(0.176, 0.150, 0.062) },               // collar stand
  ], { subdivide: 3, caps: true }), coatM, -0.008, 0, 0)

  // shirt + tie showing through the open coat V
  put(torso, loft([
    { y: T(1.020), shape: rrp(0.230, 0.150, 0.050) },
    { y: T(1.240), shape: rrp(0.270, 0.180, 0.055) },
    { y: T(1.400), shape: rrp(0.210, 0.150, 0.050) },
  ], { subdivide: 2 }), shirtM, 0.020, 0, 0)
  put(torso, taperedBox(0.024, 0.070, 0.020, 0.044, 0.300, 0.010, { rim: 0.008 }),
    tieM, 0.150, T(1.240), 0, 0, 0, -0.05)
  put(torso, roundedBox(0.026, 0.046, 0.052, 0.012, 2), tieM, 0.152, T(1.408), 0)   // knot

  // --- lapels: two plates swung open, lining + one piping line -------------
  const lapelOutline = superellipsePoints(0.100, 0.400, 3.4, 14)
  for (const side of [1, -1]) {
    const lp = bent(torso, -0.30 * side, 0, 0)
    lp.position.set(0.108, T(1.230), 0.070 * side)
    lp.rotation.set(0, 0, 0.16)
    const pl = put(lp, plate(lapelOutline, 0.014, 0.005, { crown: 0.006, faceSeg: 2 }), coatM, 0, 0, 0, 0, Math.PI / 2, 0)
    pl.rotation.set(0, Math.PI / 2, 0)
    put(lp, plate(superellipsePoints(0.088, 0.380, 3.4, 12), 0.004, 0.0015), liningM, -0.010, 0, 0, 0, Math.PI / 2, 0)
    // (the 4 mm cyan lapel piping that used to live here is gone — see pipingM)
  }
  // =========================================================================
  // THE POPPED COLLAR — brief §1's SINGLE STRONGEST CUE, rebuilt from scratch.
  //
  // §1: "the strongest cue is not the mohawk or the pipe — it is the RESOLUTION
  // MISMATCH AT THE COLLAR: a stepped, aliased, staircase-edged cube head
  // emerging from a soft, draped, bevelled gabardine collar."
  //
  // What shipped was a pair of 76 mm wings at z = +/-0.078 and x = -0.010 —
  // i.e. INSIDE the skull's own footprint (the head spans z +/-0.132 and
  // x +/-0.108) and behind it from every camera angle short of full profile.
  // The head simply sat on a shoulder mass and the cue the whole brief was
  // built around was invisible in all three shots.
  //
  // Rebuilt to actually frame the jaw:
  //   - both wings moved OUTBOARD to z = +/-0.150, clear of the skull's 0.132
  //     half-width, so an 18 mm strip of coat runs up either side of the chin;
  //   - top edge at world y = 1.489 (chin 1.442 + 0.047), so the collar
  //     OVERLAPS and frames the jaw exactly as §4.1 requires, instead of
  //     butting against the neck;
  //   - a back stand behind the head at x = -0.130, which is what makes a
  //     popped collar read as popped from the front;
  //   - a 4 mm rolled top edge (§6 micro-detail e) in lining, so the thing the
  //     eye lands on where the aliased voxel chin meets the collar is a soft
  //     BEVELLED roll — the resolution mismatch, staged.
  // =========================================================================
  const collar = bent(torso, 0, 0, 0)
  collar.position.set(0.010, T(1.408), 0)
  for (const side of [1, -1]) {
    const wing = pivot(collar, -0.030, 0.028, 0.150 * side)
    wing.rotation.set(0.20 * side, 0, 0.16)
    put(wing, taperedBox(0.150, 0.015, 0.122, 0.012, 0.105, 0.006, { rim: 0.005 }), coatM, 0, 0, 0)
    // lining on the inboard face — a popped collar shows its underside, and
    // this is the darker value that separates the collar from the head above it
    put(wing, taperedBox(0.140, 0.005, 0.114, 0.004, 0.098, 0.002), liningM, 0, 0, -0.010 * side)
    // 4 mm collar roll along the top edge — the soft bevelled edge that the
    // aliased chin sits against
    put(wing, taperedCapsule(0.005, 0.004, 0.120, 3, 10), liningM, 0.006, 0.052, 0, 0, 0, Math.PI / 2)
    // topstitched collar seam, 3 mm so it never fizzes at a silhouette
    put(wing, roundedBox(0.132, 0.003, 0.003, 0.001, 1), coatWornM, 0, -0.040, -0.009 * side)
  }
  // back stand — leaning back off the shoulder line, wider than the head
  put(collar, taperedBox(0.032, 0.260, 0.028, 0.216, 0.112, 0.012, { rim: 0.010 }),
    coatM, -0.130, 0.032, 0, 0, 0, 0.18)
  put(collar, taperedBox(0.008, 0.240, 0.008, 0.200, 0.104, 0.004, { rim: 0.003 }),
    liningM, -0.112, 0.032, 0, 0, 0, 0.18)
  put(collar, taperedCapsule(0.005, 0.004, 0.210, 3, 10), liningM, -0.140, 0.086, 0, Math.PI / 2, 0, 0)
  // throat-latch tab, hanging open on the left lapel
  put(collar, roundedBox(0.008, 0.070, 0.030, 0.003, 1), beltM, 0.062, -0.010, 0.086, 0, 0, 0.25)
  put(collar, filletRing(0.012, 0.004, 6, 12), steelM, 0.064, -0.048, 0.090, Math.PI / 2, 0, 0)

  // --- storm flap (character's right only), epaulettes, back yoke ----------
  // All three are WORN panels: they carry `coatWornM` (roughness 0.74, sheen
  // 0.26) against the shell's 0.95, so the shoulder line and the flap edge pick
  // up a highlight the flat panels do not. That is the coat's roughness swing.
  // STORM FLAP — it read as a decal: a rectangle flush on the chest with a
  // hairline outline, no thickness and no cast shadow. Now 18 mm thick, stood
  // 14 mm off the chest on a recessed lining backing panel, and free at the
  // bottom edge — so there is a real dark gap under its lower edge for the key
  // to throw a shadow into, which is the whole reason a gun flap reads.
  // The chest shell's front face at this height sits at x = +0.142. The flap's
  // BACK face is at +0.150 — a real 8 mm air gap, not a decal flush on the
  // panel — and the dark lining strip below it fills the shadow the free bottom
  // edge throws into that gap.
  put(torso, plate(superellipsePoints(0.180, 0.140, 4.0, 14), 0.016, 0.006, { crown: 0.004 }),
    coatWornM, 0.158, T(1.294), -0.090, 0, Math.PI / 2, 0)
  put(torso, roundedBox(0.014, 0.012, 0.176, 0.004, 2), liningM, 0.147, T(1.294) - 0.072, -0.090)
  // 3 mm double-needle topstitch on three sides — real relief, not albedo, and
  // never sub-millimetre: a 1.5 mm strip is under a pixel wide at match
  // distance and fizzes into the single-white-dot artefact on the silhouette.
  for (const [dy, dz, h, w] of [[0.070, 0, 0.003, 0.176], [-0.070, 0, 0.003, 0.176],
    [0, 0.088, 0.140, 0.003], [0, -0.088, 0.140, 0.003]]) {
    put(torso, roundedBox(0.005, h + 0.003, w + 0.003, 0.0015, 1), coatWornM,
      0.167, T(1.294) + dy, -0.090 + dz)
  }
  for (const side of [1, -1]) {
    // epaulette: a real strap with a rolled edge and its own topstitch line,
    // standing 10 mm off the shoulder, buttoned inboard.
    put(torso, taperedBox(0.042, 0.112, 0.038, 0.102, 0.010, 0.004, { rim: 0.003 }),
      coatWornM, 0.010, T(1.374), 0.180 * side, 0, 0, 0)
    put(torso, roundedBox(0.090, 0.003, 0.004, 0.0012, 1), coatWornM, 0.010, T(1.381), 0.166 * side)
    put(torso, roundedBox(0.090, 0.003, 0.004, 0.0012, 1), coatWornM, 0.010, T(1.381), 0.194 * side)
    put(torso, roundedCylinder(0.006, 0.004, 0.0015, 12, 2), hornM, 0.010, T(1.383), 0.132 * side)
  }
  // back yoke / storm cape: a panel with a free, thickened bottom hem so it
  // terminates on a real edge instead of fading into the shell.
  put(torso, plate(superellipsePoints(0.460, 0.180, 4.0, 16), 0.007, 0.003), coatWornM,
    -0.142, T(1.270), 0, 0, Math.PI / 2, 0)
  put(torso, roundedBox(0.010, 0.006, 0.436, 0.0025, 1), coatWornM, -0.146, T(1.182), 0)
  // Double-breasted: 6 horn buttons, 2 columns of 3. They used to be featureless
  // domes sharing the coat's albedo AND its roughness, i.e. decals. Each one now
  // sits in a darker leather rim ring and carries a low-roughness horn top, so
  // it catches its own highlight and reads as a separate object at 30 cm.
  for (const yy of [1.02, 1.16, 1.30]) {
    for (const side of [1, -1]) {
      put(torso, filletRing(0.011, 0.0035, 6, 14), beltM, 0.144, T(yy), 0.050 * side, 0, 0, Math.PI / 2)
      put(torso, roundedCylinder(0.009, 0.006, 0.0025, 14, 2), hornM, 0.147, T(yy), 0.050 * side, 0, 0, Math.PI / 2)
      // real buttonhole: a 12 mm slit cut into the button stand
      put(torso, roundedBox(0.004, 0.013, 0.005, 0.0015, 1), liningM, 0.150, T(yy), 0.084 * side)
    }
  }
  // Slanted welt pockets, 22 deg off horizontal, 0.150 m opening. Built as THREE
  // pieces so they catch light: a recessed lining slot, a 6 mm welt lip standing
  // proud below it, and a topstitch bead above. The previous build was one flat
  // 6 mm plank per side with no lip and no recess — detail painted into albedo,
  // which is exactly what the checklist forbids.
  for (const side of [1, -1]) {
    const pk = pivot(torso, 0.118, T(1.000), 0.116 * side)
    pk.rotation.set(0.38 * side, 0, 0)
    put(pk, roundedBox(0.010, 0.016, 0.150, 0.003, 1), liningM, 0, 0, 0)           // the slot
    put(pk, roundedBox(0.016, 0.014, 0.152, 0.005, 2), coatM, 0.006, -0.012, 0)    // welt lip
    put(pk, roundedBox(0.005, 0.003, 0.150, 0.0012, 1), coatWornM, 0.012, 0.010, 0) // topstitch
  }
  // belt — tied in a knot on the character's left, buckle hanging unused
  put(torso, loft([
    { y: T(0.982), shape: rrp(0.372, 0.262, 0.056) },
    { y: T(1.038), shape: rrp(0.372, 0.262, 0.056) },
  ], { subdivide: 1 }), beltM, -0.008, 0, 0)
  put(torso, roundedBox(0.030, 0.062, 0.048, 0.010, 2), beltM, 0.128, T(1.010), 0.096)     // the knot
  put(torso, taperedBox(0.014, 0.036, 0.010, 0.028, 0.160, 0.006, { rim: 0.004 }),
    beltM, 0.124, T(0.930), 0.120, 0, 0, 0.10)                                             // tail
  put(torso, filletRing(0.014, 0.004, 6, 14), steelM, 0.118, T(1.010), 0.030, 0, 0, Math.PI / 2)
  put(torso, filletRing(0.014, 0.004, 6, 14), steelM, 0.118, T(1.010), -0.030, 0, 0, Math.PI / 2)
  put(torso, roundedBox(0.010, 0.046, 0.032, 0.004, 2), goldM, 0.126, T(1.010), -0.076)    // unused buckle

  // =========================================================================
  // COAT HEM — bone `coat` (spring-follow). A-line trapezoid, 0.640 m at the
  // hem, an inverted box pleat vent below the belt, lining on the inside.
  // =========================================================================
  const coat = pivot(torso, -0.008, T(1.010), 0)
  bones.coat = coat
  const coatW = bent(coat, 0.02)
  const hemSecs = [
    { y: 0.010, shape: rrp(0.372, 0.262, 0.056) },
    { y: -0.140, shape: rrp(0.430, 0.300, 0.062) },
    { y: -0.330, shape: rrp(0.530, 0.360, 0.075) },
    { y: -0.590, shape: rrp(0.640, 0.412, 0.090) },
  ]
  // ===== NEGATIVE SPACE: THE OPEN COAT =====================================
  // §2 lists FOUR negative-space cues as "what defines the shape". Two of them
  // did not exist: the trench shipped as a CLOSED CYLINDER with a lit flat
  // underside quad at the hem, front panels fully shut, no shin ever visible.
  //
  // `openFront` cuts them both out of the lofted shell. It rides the hem's
  // bottom rings UP wherever a vertex is forward of the belt line and near the
  // centreline, which — because the loft already runs `caps: false` — turns the
  // front of the skirt into a real opening you see the shins through, not a
  // painted seam. Falloff is smooth in Z so the cut reads as two panels swung
  // open rather than as a rectangular bite:
  //   - full 0.300 m of lift on the centreline (the open-coat V),
  //   - fading to zero by |z| = 0.235 (the two hem triangles either side of the
  //     shins, ~0.10 m wide x 0.30 m tall, exactly §2's numbers),
  //   - nothing at all behind x = 0, so the back vent and the A-line trapezoid
  //     that carry the whole lower silhouette are untouched.
  const openFront = (v) => {
    if (v.y > -0.150 || v.x <= 0.02) return
    const zFall = clamp01((0.235 - Math.abs(v.z)) / 0.150)
    const xFall = clamp01((v.x - 0.02) / 0.110)
    const depth = clamp01((-0.150 - v.y) / 0.440)
    v.y += 0.300 * zFall * zFall * xFall * depth
  }
  put(coatW, warp(loft(hemSecs, { subdivide: 3, caps: false }), openFront), coatM, 0, 0, 0)
  // The lining shell used to be the same loft translated UP 4 mm. On an A-line
  // skirt that is a 4 mm offset along Y, not along the surface normal, so on the
  // steep panels the two shells sat well under a millimetre apart and z-fought —
  // which is the most likely source of the bright single-pixel dots the critic
  // found running along the coat's left edge and the left leg. The lining is now
  // a genuine INSET: every section scaled to 0.972 (a real 5-9 mm normal gap all
  // the way round) and lifted 2 mm, so the two surfaces can never trade depth.
  put(coatW, warp(loft(hemSecs.map((s) => ({
    y: s.y + 0.002,
    shape: s.shape.map((q) => q * 0.972),          // flat [x, y, x, y, ...] ring
  })), { subdivide: 3, caps: false }), openFront), liningM, 0, 0, 0)
  // Hem lip. This used to be a CIRCULAR skirt of radius 0.334 hung on an
  // ELLIPTICAL hem (0.640 Z x 0.412 X): it stood 0.128 m proud of the coat front
  // and back, which is the "dead-straight conical lip that reads as a lampshade"
  // and it is where the model's x-extent came from. Squashed to 0.644 in X so it
  // follows the A-line exactly and reads as a turned hem.
  // The hem lip follows the same cut — it is the turned edge of the panels that
  // just swung open, so it has to open with them. (It is also what used to give
  // the hem its LIT FLAT UNDERSIDE: a closed ring seen from below.)
  put(coatW, warp(warp(skirt(0.318, 0.328, 0.026, { radialSeg: 30, curve: 0.4 }),
    (v) => { v.x *= 0.644 }), (v) => { v.y -= 0.588; openFront(v); v.y += 0.588 }),
  liningM, 0, -0.588, 0)
  // Back vent: an inverted box pleat that HUGS the coat's back surface. It used
  // to be a 0.130-deep slab centred 0.190 behind the coat bone, i.e. a plank
  // hanging 45 mm clear of the shell in mid-air with an unattached hard end.
  // Now it is a 22 mm ridge, tilted 0.127 rad to follow the A-line's back rake,
  // so it starts inside the belt loft and ends inside the hem.
  put(coatW, taperedBox(0.078, 0.022, 0.078, 0.022, 0.470, 0.010, { rim: 0.008 }),
    coatM, -0.170, -0.300, 0, 0, 0, -0.127)
  put(coatW, roundedCylinder(0.008, 0.005, 0.002, 12, 2), hornM, -0.146, -0.072, 0, 0, 0, Math.PI / 2)
  // The two front panels are cut 20 mm longer — the lowest points of the hem.
  // Moved OUTBOARD from z = +-0.150 to +-0.238: at z = +-0.150 these corner
  // pieces occupied exactly the same 0.085..0.215 z-band as the shin capsule
  // and the coat visibly clipped through the leg.
  for (const side of [1, -1]) {
    put(coatW, taperedBox(0.062, 0.090, 0.056, 0.106, 0.030, 0.012, { rim: 0.008 }),
      coatM, 0.170, -0.602, 0.250 * side)
  }

  // =========================================================================
  // ARMS — raglan shoulder, sleeved joints, gloved four-finger mitt hands.
  // Reach is preserved EXACTLY: shoulder -> hand centre = 0.360 + 0.420 = 0.780 m,
  // the same as the pre-overhaul rig, so no hitbox `forward` constant moves.
  // =========================================================================
  for (const side of [1, -1]) {
    const arm = pivot(torso, 0, 0.420 + (side === -1 ? 0.020 : 0), 0.230 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    // Deltoid + raglan seam. The shoulder is a rounded cap, not a pad.
    // JOINT FIX: the cap used to be a lone superellipsoid that the upper-arm
    // capsule simply drove through, leaving a visible value seam where the two
    // surfaces crossed. The cap now wears the worn-panel material (so the
    // shoulder top is the brightest specular event on the coat), an inboard
    // sleeve closes it into the torso shell, and a `weld` barrel bridges cap to
    // upper arm so the deltoid-to-bicep transition is one continuous form.
    // ROUND-4: THREE VISIBLE INTERSECTIONS PER ARM, all fixed by one rule.
    // The deltoid ellipsoid wore `coatWornM` while the sleeve and the upper arm
    // wore `coatM` — two different roughness/sheen responses meeting along an
    // intersection curve, which is exactly what draws a lens-shaped seam across
    // a shoulder. A surface intersection you cannot see is not a defect; one
    // with a value break on it is. The whole shoulder assembly — cap, inboard
    // sleeve, raglan sleeve and the weld barrel down to the bicep — is now ONE
    // material, so cap, deltoid and bicep read as a single continuous form and
    // only the raglan seam ridge (which is supposed to be visible) breaks it.
    put(arm, superellipsoid(0.084, 0.092, 0.088, 2.9, 2.9, 24), coatM, 0, -0.010, 0.008 * side)
    put(arm, sleeve(0.088, 0.076, 0.10, { radialSeg: 20, bulge: 0.05 }), coatM, 0, -0.020, 0, Math.PI, 0, 0)
    put(arm, sleeve(0.090, 0.078, 0.070, { radialSeg: 20, bulge: 0.10 }), coatM,
      0, 0.004, -0.026 * side, 0, 0, 1.30 * side)
    put(arm, weld(0.084, 0.074, 0.048, { bulge: 0.16, radialSeg: 20 }), coatM, 0, -0.076, 0)
    put(arm, roundedBox(0.005, 0.170, 0.150, 0.002, 1), coatWornM, 0.058, -0.010, 0.020 * side, 0, 0, 0.55 * side)
    put(arm, taperedCapsule(0.072, 0.058, 0.24, 4, 18), coatM, 0, -0.190, 0)
    const fore = pivot(arm, 0, -0.360, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    put(fore, weld(0.058, 0.056, 0.03, { bulge: 0.18, radialSeg: 18 }), coatM, 0, 0.005, 0)
    put(fore, taperedCapsule(0.056, 0.046, 0.22, 4, 16), coatM, 0, -0.150, 0)
    // cuff strap: sleeves the forearm->hand joint with 15 mm of overlap each side
    put(fore, sleeve(0.050, 0.052, 0.048, { radialSeg: 18, bulge: 0.08 }), beltM, 0, -0.320, 0)
    put(fore, filletRing(0.050, 0.005, 6, 18), beltM, 0, -0.296, 0)
    put(fore, roundedBox(0.012, 0.018, 0.012, 0.003, 1), steelM, 0.050, -0.300, 0)
    // (the cyan cuff tab that used to sit here is gone — see pipingM. It was the
    // fifth of the six mint slivers a stranger's eye found before the face.)
    // --- the wrist dissolve (divergence D5) ------------------------------
    // Six 24 mm cubes on the resolution seam. Deterministic (no Math.random),
    // parented to the FOREARM so a detaching hand leaves the pixels behind, and
    // each shares a full 24x24 face with the cuff or with another cube. The
    // joint underneath stays fully closed: hide these and the arm still reads.
    const DISSOLVE = [
      [0.036, -0.318, 0.024, 0], [0.036, -0.342, 0.024, 1],
      [-0.036, -0.330, -0.018, 1], [-0.036, -0.354, -0.018, 0],
      [0.012, -0.354, -0.042, 0], [0.012, -0.354, -0.018, 1],
    ]
    for (const [dx, dy, dz, dark] of DISSOLVE) {
      const hex = dark ? p.ink : p.skinShade
      put(fore, looseVoxel(hex), matForVoxelColor(hex), dx, dy, dz)
    }
    // --- gloved hand: rounded palm + fused four-finger mitt + opposed thumb --
    const hand = new THREE.Mesh(roundedBox(0.090, 0.055, 0.100, 0.018, 2), gloveM)
    hand.position.set(0.004, -0.420, 0)
    hand.name = 'hand'
    fore.add(hand)
    const mitt = put(hand, roundedBox(0.082, 0.075, 0.096, 0.020, 2), gloveM, 0.004, -0.058, 0)
    for (let k = 0; k < 3; k++) {                                   // one groove per knuckle
      put(mitt, roundedBox(0.086, 0.004, 0.004, 0.0015, 1), beltM, 0, 0.008, -0.036 + k * 0.024)
    }
    put(hand, taperedCapsule(0.014, 0.011, 0.036, 3, 12), gloveM, 0.020, -0.030, 0.052 * side,
      0, 0, -0.70 * side)
    put(hand, roundedBox(0.070, 0.006, 0.084, 0.002, 1), beltM, 0.004, -0.026, 0)  // glove seam
    fore.userData.handMesh = hand                     // Detached-Hand Punch borrows this
  }

  // =========================================================================
  // MAGNIFYING LENS — bone `lens` on forearmR. Knurled brushed-metal ring,
  // 3-facet grip, real glass, and one escaped voxel welded to the ring at 12.
  // =========================================================================
  const lens = pivot(bones.forearmR, 0.050, -0.460, 0)
  bones.lens = lens
  const lensW = bent(lens, -0.5)
  put(lensW, taperedCapsule(0.013, 0.011, 0.086, 3, 12), beltM, 0, 0.062, 0)
  for (let f = 0; f < 3; f++) {                                     // 3-facet grip
    put(lensW, roundedBox(0.010, 0.040, 0.018, 0.001, 1), beltM,
      Math.cos(f * 2.094) * 0.011, 0.062, Math.sin(f * 2.094) * 0.011, 0, -f * 2.094, 0)
  }
  put(lensW, filletRing(0.014, 0.008, 6, 14), steelM, 0, 0.118, 0)
  const ring = put(lensW, filletRing(0.058, 0.007, 8, 30), steelM, 0, 0.190, 0)
  ring.rotation.x = Math.PI / 2
  for (let k = 0; k < 16; k++) {                                    // 16 knurls, 2 mm deep
    const a = (k / 16) * Math.PI * 2
    put(lensW, roundedBox(0.005, 0.005, 0.014, 0.0012, 1), steelM,
      Math.sin(a) * 0.064, 0.190 + Math.cos(a) * 0.064, 0, a, Math.PI / 2, 0)
  }
  put(lensW, filletRing(0.050, 0.0025, 6, 26), pipingM, 0, 0.190, 0).rotation.x = Math.PI / 2
  const glassMesh = put(lensW, roundedCylinder(0.050, 0.004, 0.0015, 30, 2), glassM, 0, 0.190, 0)
  glassMesh.rotation.x = Math.PI / 2
  glassMesh.castShadow = false
  // the escaped voxel — same 1.2 mm chamfer as every head voxel, welded flush
  put(lensW, looseVoxel(p.ink), matForVoxelColor(p.ink), 0, 0.190 + 0.065 + VX / 2, 0)
  lens.userData.glassMat = glassM
  lens.userData.glassBaseHex = glassM.color.getHex()

  // =========================================================================
  // HEAD — the voxel block. Everything here snaps to the 24 mm lattice.
  // =========================================================================
  const head = pivot(torso, 0.045, 0.454, 0)
  bones.head = head

  const skull = buildSkull(p, cos)
  const fin = buildMohawk(p, cos)
  const goggles = buildGoggles(p, cos)
  const pipe = buildPipe(p, cos)
  const smokeSet = buildSmoke(p, cos)
  if (cos === 0) pipe.set(0, 13, 7, p.stem, F_FEATURE)        // weld the stem to the mouth bar

  const skullG = voxObject(skull, 'skull', { occlude: [fin, pipe, goggles], assertWelded: true })
  head.add(skullG)
  head.add(voxObject(fin, 'fin', { occlude: [skull], assertWelded: true }))
  const gogglesG = voxObject(goggles, 'goggles', { occlude: [skull], assertWelded: true })
  head.add(gogglesG)
  head.add(voxObject(pipe, 'pipe', { occlude: [skull], assertWelded: true }))
  const smokeG = voxObject(smokeSet, 'smoke')
  smokeG.traverse((o) => { if (o.isMesh) o.castShadow = false })
  head.add(smokeG)

  // --- face poses: voxel geometry driven by a table, never a painted quad ---
  const F = {}
  const mk = (name, cells, hex) => { const o = poseVox(cells, hex, name); head.add(o); F[name] = o; return o }
  mk('lids', [[0, 6, 2], [0, 6, 3], [0, 6, 7], [0, 6, 8]], p.ink)
  mk('pupils', [[2, 7, 3], [2, 7, 8]], p.ink)
  mk('glints', [[2, 7, 2], [2, 7, 7]], p.glint)
  mk('mouth3', [[2, 13, 4], [2, 13, 5], [2, 13, 6]], p.ink)
  mk('mouth5', [[0, 13, 3], [0, 13, 4], [0, 13, 5], [0, 13, 6], [0, 13, 7]], p.ink)
  mk('smirk', [[0, 12, 3]], p.ink)
  mk('frown', [[0, 14, 3]], p.ink)
  mk('shout', [[0, 12, 3], [0, 12, 7]], p.ink)
  mk('slack', [[0, 14, 3], [0, 14, 7]], p.ink)
  mk('browAngry', [[0, 5, 2], [0, 6, 3], [0, 5, 8], [0, 6, 7]], p.ink)
  mk('browBlock', [[0, 5, 2], [0, 5, 8]], p.ink)
  mk('koEyes', [[0, 6, 2], [0, 7, 3], [0, 6, 8], [0, 7, 7]], p.ink)
  mk('hurtEyes', [[2, 7, 3], [2, 7, 8]], p.skinHilite)
  mk('finShine', [[0, cos === 1 ? -8 : -6, 5]], p.skinHilite)

  // Every pose is a set of whole-voxel visibility toggles plus integer lattice
  // translations (brief §8.1). Nothing interpolates; a pixel face that eases is
  // the single most immersion-breaking thing available here.
  const POSES = {
    idle: ['lids', 'pupils', 'glints', 'mouth3'],
    attack: ['lids:drop', 'pupils', 'mouth5', 'shout', 'browAngry'],
    hurt: ['hurtEyes', 'mouth3', 'frown'],
    ko: ['koEyes', 'mouth5', 'slack'],
    taunt: ['lids', 'pupils', 'glints', 'mouth3', 'smirk'],
    block: ['lids:drop', 'pupils', 'mouth3', 'browBlock'],
    victory: ['lids', 'pupils', 'glints', 'mouth3', 'smirk', 'finShine'],
    blink: ['lids:drop', 'mouth3'],
  }
  let facePose = 'idle'
  const setFace = (name) => {
    const want = POSES[name] || POSES.idle
    facePose = POSES[name] ? name : 'idle'
    for (const k of Object.keys(F)) { F[k].visible = false; F[k].position.y = 0 }
    for (const entry of want) {
      const drop = entry.endsWith(':drop')
      const k = drop ? entry.slice(0, -5) : entry
      if (!F[k]) continue
      F[k].visible = true
      if (drop) F[k].position.y = -VX                 // one whole voxel, no easing
    }
    if (glintMat) glintMat.emissiveIntensity = name === 'victory' ? 0.6 : name === 'ko' ? 0 : 0.35
    if (screenMat) screenMat.emissiveIntensity = name === 'ko' ? 0 : 0.9
  }
  setFace('idle')

  // --- glitch, reimplemented as GEOMETRY (brief §8.2) ----------------------
  const ghostSet = new VoxelSet('ghost')
  for (const cell of [[0, 6, 2], [0, 6, 3], [0, 6, 7], [0, 6, 8], [2, 7, 2], [2, 7, 3], [2, 7, 7],
    [2, 7, 8], [0, 10, 5], [2, 13, 4], [2, 13, 5], [2, 13, 6]]) {
    // Neutral bake key only — the shipped colour is `ghostA`/`ghostB` on the
    // unlit material below; this hex just drives the face-bias vertex tint.
    // Deliberately NOT #F0F0F0: that is a source-measured hex and brief §9.1
    // bans it appearing anywhere on the model, key or albedo.
    ghostSet.set(cell[0], cell[1], cell[2], 0xb4b8b6, F_FEATURE)
  }
  const ghostGeo = [...meshVoxels(ghostSet, { origin: HEAD_PIVOT }).geoms.values()][0]
  const ghosts = [p.ghostA, p.ghostB].map((hex) => {
    const m = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0.5, depthWrite: false, vertexColors: true,
    }))
    m.visible = false; m.castShadow = false; m.name = 'glitch-ghost'
    head.add(m)
    return m
  })
  const scanline = new THREE.Mesh(
    roundedBox(0.230, VX, 0.290, 0.001, 1),
    new THREE.MeshBasicMaterial({ color: p.trim, transparent: true, opacity: 0.35, depthWrite: false }))
  scanline.visible = false; scanline.castShadow = false; scanline.name = 'crt-tear'
  scanline.position.set(-0.045, 0.2, 0)
  head.add(scanline)

  // =========================================================================
  // FEDORA — bone `hat` (spring-follow). Built FLAT on the crown-base plane,
  // then the whole group is rotated once: 18 deg back, 6 deg yaw (brief §7.2).
  // =========================================================================
  const hat = pivot(head, -0.060, 0.432, 0)
  bones.hat = hat
  // 18 deg back (lifts the brim front, exposes the forehead) + 6 deg yaw. The
  // yaw is trimmed to 3.4 deg in costume 0 because the brim's mohawk notch is
  // cut symmetrically about the hat's own +X and a 6 deg yaw walked one cut
  // edge into the fin.
  const hatW = bent(hat, 0.314, 0, cos === 0 ? 0.060 : 0.105)
  if (cos === 0) {
    // ROUND-3 REBUILD. What shipped was a bowler: a 0.276 x 0.230 rounded rect
    // at a 0.085 corner radius is an ELLIPSE, so the crown lofted into a smooth
    // mushroom dome, the brim was a circular ring (0.404 in Z, 0.360 in X — the
    // brief's two numbers swapped), and the crown sat at CX = +0.015, i.e.
    // straight through the mohawk fin's 0.012..0.132 footprint. Three fixes:
    //
    //   1. Corner radius down to 0.048 and a taller taper, so the crown reads
    //      as a blocked felt crown with corners, not a dome.
    //   2. Crown pulled back to CX = -0.045 so the fin's front four voxel
    //      columns and its whole tip stand PROUD of the crown instead of being
    //      swallowed by it, and the crown top (y 1.952) sits 42 mm below the
    //      fin tip (1.994).
    //   3. The brim carries a 2 x 0.33 rad notch at the front centre. §2's
    //      negative-space wedge between the fin's rear edge and the brim's
    //      front edge is geometrically UNREACHABLE at this brim size: a 0.404 m
    //      brim rotated 18 deg about a pivot inside the skull always sweeps
    //      through the fin's root, at any tilt short of 49 deg. The notch is
    //      how the wedge actually gets built, it removes the last hard
    //      interpenetration on the model, and a fedora slotted for a mohawk is
    //      a legible gag rather than a bug. Declared as divergence D7.
    // ROUND-4: crown pulled back another 17 mm (-0.045 -> -0.062). At -0.045 the
    // crown's front face landed at x = +0.055, which swallowed the fin's rear
    // two voxel columns and left "about two voxels of fin clearing the hat".
    // At -0.062 the crown front is at +0.038, so FOUR of the fin's five depth
    // columns and its whole 0.144 m height stand proud in front of the crown —
    // the fin spikes off the FRONT of the hat, which is the silhouette §2 asks
    // for, and the brim notch below opens the negative-space wedge behind it.
    const CX = -0.062                                    // crown centre in hatW-local X
    const crown = loft([
      { at: [0, 0.000, 0], shape: rrp(0.268, 0.200, 0.048) },
      { at: [0, 0.040, 0], shape: rrp(0.264, 0.198, 0.050) },
      { at: [0, 0.082, 0], shape: rrp(0.250, 0.188, 0.052) },
      { at: [0, 0.115, 0], shape: rrp(0.214, 0.160, 0.050) },
    ], { subdivide: 3, caps: true })
    // teardrop: a centre crease running front->back, 0.030 m deep at the front
    // tapering to 0.008 at the rear, plus two side pinches 0.035 m in from the
    // front at 0.022 deep. MODELLED, per brief §7.2 — never a texture.
    put(hatW, warp(crown, (v) => {
      const t = clamp01((v.x + 0.100) / 0.200)                     // 0 rear .. 1 front
      if (v.y > 0.058) {
        const depth = 0.008 + 0.022 * t
        const g = Math.exp(-((v.z / 0.038) ** 2))
        v.y -= depth * g * clamp01((v.y - 0.058) / 0.050)
      }
      const pinch = Math.exp(-(((v.x - 0.065) / 0.030) ** 2)) * clamp01((v.y - 0.050) / 0.055)
      v.z -= Math.sign(v.z) * 0.022 * pinch
    }), feltM, CX, 0, 0)
    // grosgrain band: a conformal loft, not a circle scaled to fit — 5 mm proud
    // of the crown all round, 0.028 tall, with the flat bow on the character's
    // LEFT (+z). No cyan piping on the hat: §5 caps `trim-cyan` at 2% of the
    // model's surface and the under-collar and cuff tab already spend it.
    put(hatW, loft([
      { at: [0, 0.004, 0], shape: rrp(0.278, 0.210, 0.050) },
      { at: [0, 0.032, 0], shape: rrp(0.276, 0.209, 0.050) },
    ], { subdivide: 1, caps: false }), bandM, CX, 0, 0)
    put(hatW, roundedBox(0.006, 0.026, 0.048, 0.002, 1), bandM, CX - 0.030, 0.018, 0.140)   // bow wings
    put(hatW, roundedBox(0.006, 0.018, 0.020, 0.002, 1), bandM, CX - 0.030, 0.018, 0.112)   // bow knot
    // snap brim: front third down 14 deg, rear third up 9 deg, 4 mm thick with a
    // rolled outer edge, elliptical 0.404 (X) x 0.360 (Z) = 1.53 x head width.
    const snap = (v) => {
      v.z *= 0.891
      const rr = Math.hypot(v.x, v.z)
      const w = rr > 1e-4 ? v.x / rr : 0
      v.y += (rr - 0.132) * (w > 0 ? -0.249 * w : -0.158 * w)
    }
    const NOTCH = 0.42
    // 5.6 mm through the brim with a 2.4 mm rolled edge (was 4 mm / 1.2 mm).
    // A 1.2 mm rolled edge is sub-pixel at match distance, and a sub-pixel edge
    // under a fresnel sheen is where the single-white-dot fizz along the brim
    // silhouette came from. Thicken it and the specular has somewhere to sit.
    const brimProfile = [0.090, -0.0028, 0.186, -0.0028, 0.1985, -0.0024,
      0.2020, 0, 0.1985, 0.0024, 0.186, 0.0028, 0.090, 0.0028]
    put(hatW, warp(profileLathe(brimProfile, 44, {
      phase: NOTCH, thetaLength: Math.PI * 2 - 2 * NOTCH, creaseAngle: 40, unique: true,
    }), snap), brimM, CX, 0.004, 0)
  } else {
    // costume 1: no fedora, but `hat` must still drive visible geometry — a pixel
    // headband, one voxel proud on all four sides of row r1 (brief §7.2).
    const band = new VoxelSet('headband')
    for (let d = 0; d <= 10; d++) {
      for (let c = -1; c <= 11; c++) {
        if (d === 0 || d === 10 || c === -1 || c === 11) band.set(d, 1, c, p.ink, F_FEATURE)
      }
    }
    const bandG = new THREE.Group()
    const meshed = meshVoxels(band, { origin: [HEAD_PIVOT[0] - 0.060, HEAD_PIVOT[1] + 0.432, 0] })
    headTris += meshed.tris; headFaces += meshed.faces
    for (const [hex, geo] of meshed.geoms) { bandG.add(new THREE.Mesh(geo, matForVoxelColor(hex))); headCalls++ }
    // The band goes on `hat` UNTILTED, not on `hatW`. It is a voxel object and
    // it must stay lattice-aligned with the skull; rotating it 18 deg both broke
    // the lattice read and swung its front-centre cells up into the 8-vx fin
    // (72 vertices of hard interpenetration). The `hat` spring-follow still
    // drives it, which is the whole point of §7.2's costume-1 clause.
    hat.add(bandG)
  }

  // =========================================================================
  // runtime: 8 Hz lattice-quantised smoke drift + the geometry glitch burst.
  // Deterministic PRNG — GRAPHICS_CONTRACT §2 forbids Math.random() here.
  // =========================================================================
  let seed = 0x9e3779b9 >>> 0
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  let lastTick = -1e9, burst = 0, blinkAt = 3200
  const driver = (now) => {
    if (now - lastTick < 110) return
    lastTick = now
    const t = now / 1000
    smokeG.position.set(0, Math.round(Math.sin(t * 0.45)) * VX, Math.round(Math.sin(t * 0.7) * 1.5) * VX)
    if (burst > 0) {
      burst--
      const oz = (1 + ((rnd() * 2) | 0)) * VX, oy = (1 + ((rnd() * 2) | 0)) * VX
      ghosts[0].position.set(0, oy, oz); ghosts[1].position.set(0, -oy, -oz)
      scanline.position.y = 0.10 + Math.round(rnd() * 16) * VX
      if (burst === 0) { ghosts[0].visible = ghosts[1].visible = scanline.visible = false }
    } else if (rnd() < 0.09) {
      burst = 2 + ((rnd() * 3) | 0)
      ghosts[0].visible = ghosts[1].visible = scanline.visible = true
    } else if (facePose === 'idle' && now > blinkAt) {
      blinkAt = now + 3200 + rnd() * 900
      F.lids.position.y = -VX
      setTimeout(() => { try { if (facePose === 'idle') F.lids.position.y = 0 } catch { /* gone */ } }, 90)
    }
  }
  skullG.children[0].onBeforeRender = () => {
    try { driver(typeof performance !== 'undefined' ? performance.now() : Date.now()) } catch { /* never crash a frame */ }
  }

  head.userData.setFace = setFace
  head.userData.faceTex = null            // legacy key, kept null-safe (brief §8.1)
  head.userData.goggles = gogglesG
  // Snap down 5 rows (r1 -> r6, i.e. onto the eye band) in two frames, no easing.
  // It also steps 2 vx FORWARD: the goggle's faces were culled against the skull
  // in the bind pose, so sliding it down into the forehead's occupied cells
  // would z-fight the skull's own L1 at c4-c6. Two voxels proud clears it and
  // reads correctly — goggles pulled down sit ON the face, not in it.
  head.userData.snapGoggles = (down) => {
    gogglesG.position.set(down ? 2 * VX : 0, down ? -5 * VX : 0, 0)
  }

  // =========================================================================
  // DRAW-CALL PASS. The render layer's auto-merger deliberately refuses
  // fighters (geometry.js `_mergeEligible` bails on any material Fighter.js
  // has renamed `<name>#fighter`), so a rigged character has to collapse its
  // own static clusters. This merges, PER BONE, every mesh that shares a
  // material and never moves relative to that bone — 16 knurls, 11 coat
  // panels, 8 buttons, 6 dissolve cubes each become one buffer.
  //
  // Everything the runtime moves, hides or reads back is marked dynamic first
  // and is skipped entirely: the skull (it carries the onBeforeRender driver),
  // the goggle group (snaps down 5 vx), the smoke (8 Hz lattice drift), every
  // face-pose cluster, both glitch ghosts, the CRT tear, both hand meshes
  // (`handMesh`, hidden by the Detached-Hand Punch) and the lens glass
  // (`lensStrikeScript` tints `glassMat`). Child bones are excluded by the
  // filter, so no bone's triangles are ever baked into its parent.
  // =========================================================================
  for (const o of [skullG, gogglesG, smokeG, ...Object.values(F), ...ghosts, scanline, glassMesh]) markDynamic(o)
  markDynamic(bones.forearmL.userData.handMesh)
  markDynamic(bones.forearmR.userData.handMesh)
  const BONE_NODES = new Set(Object.values(bones))
  // geometry.js `normaliseForMerge` keeps position/normal/uv/index and DROPS
  // every other attribute, so a merged voxel buffer would come out with no
  // `color` — and a vertexColors material over a missing colour attribute
  // reads (0, 0, 0) and paints the mesh black. Everything carrying the lattice
  // bake therefore stays unmerged; it is 13 meshes and the bake is the whole
  // shading system on this character.
  const ownedDirectlyBy = (b) => (mesh) => {
    if (mesh.material && mesh.material.vertexColors) return false
    for (let q = mesh.parent; q; q = q.parent) {
      if (q === b) return true
      if (BONE_NODES.has(q)) return false
    }
    return false
  }
  let callsBefore = 0, callsAfter = 0
  group.traverse((o) => { if (o.isMesh) callsBefore++ })
  for (const b of Object.values(bones)) mergeParts(b, { inPlace: true, filter: ownedDirectlyBy(b) })
  group.traverse((o) => { if (o.isMesh) callsAfter++ })

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  smokeG.traverse((o) => { if (o.isMesh) o.castShadow = false })

  if (latticeBad) console.warn(`[crypto-punkd] ${latticeBad} off-lattice voxel coordinates`)

  // Rim-light INTENT (brief §5). The character does not own the rig — arenas do
  // — so the requirement is published here where a lighting pass can read it.
  // Without a cool rim from behind-and-above, the mid-khaki coat has no edge
  // against a pale arena floor and the crown voxels' top chamfers never light,
  // which is what makes the staircase read.
  group.userData.rimLight = {
    color: 0x7fe8ff, intensity: 0.85, offCameraAxisDeg: 35, elevationDeg: 30,
    warmFallback: 0xffc98a, note: 'flip to warmFallback on arctic-day / any cool-key arena',
  }
  group.userData.stats = {
    headTris, headFaces, headCalls, clampLo: bakeAudit.clampLo, clampHi: bakeAudit.clampHi,
    bakeMaxLuma: +bakeAudit.maxLuma.toFixed(3),
    bakeMaxLumaHex: `#${bakeAudit.maxLumaHex.toString(16).padStart(6, '0')}`,
    bakeTopLuma: [...bakeAudit.perHex].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([h, l]) => `#${h.toString(16).padStart(6, '0')}:${l.toFixed(3)}`),
    latticeBad,
    drawCallsBefore: callsBefore, drawCalls: callsAfter,
  }
  return { group, bones }
}


// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0].
// Clips are AUTHORED against a 0.98 hip height for comfortable numbers; a
// normalization pass below rescales every hips pos key to the actual 0.86 rig.
// hips position keys are ABSOLUTE local values (Animator sets, not adds).
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.98, 0]
const HIP_SCALE = 0.86 / 0.98

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.0, [0, 0.03, 0.01], [0, 0.955, 0]), K(2.0, Z, HIP)],
      torso: [K(0, [0, 0, 0.03]), K(1.0, [0.02, -0.04, 0.01]), K(2.0, [0, 0, 0.03])],
      // detective scan: head snaps left, holds, snaps right — digital, no ease feel
      head: [K(0, [0, 0.22, 0]), K(0.85, [0, 0.22, 0]), K(0.95, [0, -0.24, 0.02]), K(1.85, [0, -0.24, 0.02]), K(2.0, [0, 0.22, 0])],
      hat: [K(0, Z), K(1.0, [0.03, 0, -0.04]), K(2.0, Z)],
      coat: [K(0, Z), K(1.0, [0, 0, 0.05]), K(2.0, Z)],
      armL: [K(0, [0, 0, 0.08]), K(1.0, [0.05, 0, 0.13]), K(2.0, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(1.0, [-0.04, 0, 0.4]), K(2.0, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.25])],
      // lens hand half-raised, ready to inspect
      forearmR: [K(0, [0, 0, 1.15]), K(1.0, [0, 0, 1.25]), K(2.0, [0, 0, 1.15])],
      lens: [K(0, Z), K(1.0, [0, 0.1, 0.08]), K(2.0, Z)],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
      shinL: [K(0, Z)], shinR: [K(0, Z)],
    },
  },

  walk: {
    duration: 0.55, loop: true,
    tracks: {
      hips: [K(0, [0, 0.05, -0.02], [0, 0.96, 0]), K(0.1375, [0, 0, -0.02], [0, 0.925, 0]), K(0.275, [0, -0.05, -0.02], [0, 0.965, 0]), K(0.4125, [0, 0, -0.02], [0, 0.925, 0]), K(0.55, [0, 0.05, -0.02], [0, 0.96, 0])],
      legL: [K(0, [0, 0, 0.55]), K(0.275, [0, 0, -0.5]), K(0.55, [0, 0, 0.55])],
      legR: [K(0, [0, 0, -0.5]), K(0.275, [0, 0, 0.55]), K(0.55, [0, 0, -0.5])],
      shinL: [K(0, [0, 0, -0.25]), K(0.275, [0, 0, -0.6]), K(0.55, [0, 0, -0.25])],
      shinR: [K(0, [0, 0, -0.6]), K(0.275, [0, 0, -0.25]), K(0.55, [0, 0, -0.6])],
      torso: [K(0, [0, -0.05, -0.07]), K(0.275, [0, 0.05, -0.07]), K(0.55, [0, -0.05, -0.07])],
      head: [K(0, [0, 0.05, 0.04]), K(0.275, [0, -0.05, 0.04]), K(0.55, [0, 0.05, 0.04])],
      armL: [K(0, [0, 0, -0.4]), K(0.275, [0, 0, 0.45]), K(0.55, [0, 0, -0.4])],
      armR: [K(0, [0, 0, 0.5]), K(0.275, [0, 0, 0.05]), K(0.55, [0, 0, 0.5])],
      forearmL: [K(0, [0, 0, 0.3])],
      forearmR: [K(0, [0, 0, 1.0])],
      coat: [K(0, [0, 0, 0.14]), K(0.275, [0, 0, -0.1]), K(0.55, [0, 0, 0.14])],
      hat: [K(0, Z), K(0.1375, [0.05, 0, 0.05]), K(0.275, Z), K(0.4125, [0.05, 0, 0.05]), K(0.55, Z)],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, 0.08], [0, 1.02, 0]), K(0.5, [0, 0, 0.08], [0, 1.02, 0])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.9]), K(0.5, [0, 0, 0.8])],
      legR: [K(0, Z), K(0.12, [0, 0, 0.5]), K(0.5, [0, 0, 0.4])],
      shinL: [K(0, Z), K(0.12, [0, 0, -0.9]), K(0.5, [0, 0, -0.8])],
      shinR: [K(0, Z), K(0.12, [0, 0, -0.5]), K(0.5, [0, 0, -0.4])],
      armL: [K(0, Z), K(0.12, [-0.4, 0, 1.4]), K(0.5, [-0.4, 0, 1.3])],
      armR: [K(0, Z), K(0.12, [0.4, 0, 1.2]), K(0.5, [0.4, 0, 1.1])],
      torso: [K(0, Z), K(0.12, [0, 0, 0.14])],
      head: [K(0, Z), K(0.12, [0, 0, -0.12])],
      coat: [K(0, Z), K(0.12, [0, 0, -0.5]), K(0.5, [0, 0, -0.4])],
      hat: [K(0, Z), K(0.12, [-0.12, 0, -0.1])],
    },
  },

  fall: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.1], HIP)],
      torso: [K(0, [0, 0, 0.16])],
      head: [K(0, [0, 0, -0.08])],
      armL: [K(0, [-0.3, 0, 2.3]), K(0.25, [-0.5, 0, 2.6]), K(0.5, [-0.3, 0, 2.3])],
      armR: [K(0, [0.5, 0, 2.6]), K(0.25, [0.3, 0, 2.3]), K(0.5, [0.5, 0, 2.6])],
      legL: [K(0, [-0.25, 0, 0.4]), K(0.25, [-0.25, 0, 0.15]), K(0.5, [-0.25, 0, 0.4])],
      legR: [K(0, [0.25, 0, 0.15]), K(0.25, [0.25, 0, 0.4]), K(0.5, [0.25, 0, 0.15])],
      shinL: [K(0, [0, 0, -0.4])], shinR: [K(0, [0, 0, -0.3])],
      coat: [K(0, [0, 0, -0.7]), K(0.25, [0, 0, -0.55]), K(0.5, [0, 0, -0.7])],
      hat: [K(0, [0.15, 0, 0.12])],
    },
  },

  crouch: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.62, 0]), K(0.3, [0, 0, -0.08], [0, 0.605, 0]), K(0.6, [0, 0, -0.08], [0, 0.62, 0])],
      legL: [K(0, [-0.4, 0, 0.95])], legR: [K(0, [0.4, 0, 0.95])],
      shinL: [K(0, [0, 0, -1.3])], shinR: [K(0, [0, 0, -1.3])],
      torso: [K(0, [0, 0, -0.22])],
      head: [K(0, [0, 0.1, 0.2])],
      armL: [K(0, [0.3, 0, 0.5])], armR: [K(0, [-0.3, 0, 0.6])],
      forearmL: [K(0, [0, 0, 1.0])], forearmR: [K(0, [0, 0, 1.2])],
      coat: [K(0, [0, 0, 0.4])],
      hat: [K(0, [0, 0, 0.08])],
    },
  },

  block: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.04, 0.94, 0])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0.02, 0, 0.12]), K(0.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.15])],
      // forearms crossed, lens up like a riot shield
      armL: [K(0, [0.35, 0, 0.85])], armR: [K(0, [-0.35, 0, 1.0])],
      forearmL: [K(0, [0, 0, 1.7])], forearmR: [K(0, [0, 0, 1.9])],
      lens: [K(0, [0, 0, 0.4])],
      legL: [K(0, [-0.12, 0, 0.12])], legR: [K(0, [0.12, 0, 0.12])],
      shinL: [K(0, [0, 0, -0.15])], shinR: [K(0, [0, 0, -0.15])],
      coat: [K(0, [0, 0, 0.1])],
      hat: [K(0, [0, 0, 0.06])],
    },
  },

  hitLight: {
    duration: 0.26, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.1], [-0.07, 0.95, 0]), K(0.26, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.12, 0.3]), K(0.26, Z)],
      head: [K(0, Z), K(0.05, [0, 0.14, 0.45]), K(0.26, Z)],
      armL: [K(0, Z), K(0.05, [0.3, 0, -0.5]), K(0.26, Z)],
      armR: [K(0, Z), K(0.05, [-0.3, 0, -0.4]), K(0.26, Z)],
      hat: [K(0, Z), K(0.06, [0.3, 0, 0.25]), K(0.26, Z)],
      coat: [K(0, Z), K(0.06, [0, 0, -0.3]), K(0.26, Z)],
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.24], [-0.2, 0.9, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.18, 0.55]), K(0.42, Z)],
      head: [K(0, Z), K(0.06, [0, 0.2, 0.7]), K(0.42, Z)],
      armL: [K(0, Z), K(0.06, [0.55, 0, -1.1]), K(0.42, Z)],
      armR: [K(0, Z), K(0.06, [-0.55, 0, -1.0]), K(0.42, Z)],
      legL: [K(0, Z), K(0.07, [0, 0, 0.45]), K(0.42, Z)],
      shinL: [K(0, Z), K(0.07, [0, 0, -0.3]), K(0.42, Z)],
      hat: [K(0, Z), K(0.07, [0.55, 0, 0.5]), K(0.42, Z)],
      coat: [K(0, Z), K(0.07, [0, 0, -0.6]), K(0.42, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.35], HIP)],
      torso: [K(0, [0, 0, 0.6]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, 0.6])],
      head: [K(0, [0, 0, 0.5])],
      armL: [K(0, [-0.4, 0, 2.4]), K(0.25, [-0.2, 0, 2.6]), K(0.5, [-0.4, 0, 2.4])],
      armR: [K(0, [0.2, 0, 2.6]), K(0.25, [0.4, 0, 2.4]), K(0.5, [0.2, 0, 2.6])],
      legL: [K(0, [0, 0, 0.9]), K(0.25, [0, 0, 0.7]), K(0.5, [0, 0, 0.9])],
      legR: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.75]), K(0.5, [0, 0, 0.55])],
      shinL: [K(0, [0, 0, -0.7])], shinR: [K(0, [0, 0, -0.5])],
      coat: [K(0, [0, 0, -1.0])],
      hat: [K(0, [-0.5, 0, -0.4])],
    },
  },

  knockdown: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.45, [0, 0, 1.35], [0, 0.335, 0]), K(0.9, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])], legR: [K(0, [0, 0, 0.5])],
      shinL: [K(0, [0, 0, -0.3])], shinR: [K(0, [0, 0, -0.4])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.25])],
      armL: [K(0, [1.0, 0, 0.3])], armR: [K(0, [-1.0, 0, 0.3])],
      coat: [K(0, [0, 0, -0.4])],
      hat: [K(0, [0.4, 0, 0.5])],
    },
  },

  getup: {
    duration: 0.7, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.25, [0, 0, 0.5], [0, 0.5, 0]), K(0.5, [0, 0, 0.08], [0, 0.78, 0]), K(0.7, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.35, [0, 0, 0.7]), K(0.7, Z)],
      legR: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, 0.3]), K(0.7, Z)],
      shinL: [K(0, [0, 0, -0.3]), K(0.35, [0, 0, -0.8]), K(0.7, Z)],
      shinR: [K(0, [0, 0, -0.4]), K(0.35, [0, 0, -0.5]), K(0.7, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, -0.3]), K(0.7, Z)],
      head: [K(0, [0, 0, -0.25]), K(0.5, [0, 0, 0.1]), K(0.7, Z)],
      armL: [K(0, [1.0, 0, 0.3]), K(0.35, [0.3, 0, -0.5]), K(0.7, Z)],
      armR: [K(0, [-1.0, 0, 0.3]), K(0.35, [-0.3, 0, -0.5]), K(0.7, [0, 0, 0.35])],
      // straightens the hat on the way up. priorities.
      hat: [K(0, [0.4, 0, 0.5]), K(0.5, [0.2, 0, 0.3]), K(0.6, [-0.08, 0, -0.08]), K(0.7, Z)],
      coat: [K(0, [0, 0, -0.4]), K(0.55, [0, 0, 0.2]), K(0.7, Z)],
    },
  },

  // materializes mid-scene-load: glitch twitches, inspects the player through
  // the lens, tips the hat
  entrance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.98, 0]), K(0.1, [0, 0.5, 0], [0, 0.9, 0]), K(0.16, [0, -0.4, 0], [0, 1.04, 0]), K(0.22, [0, 0.2, 0], [0, 0.94, 0]), K(0.3, Z, HIP), K(2.4, Z, HIP)],
      torso: [K(0, [0, 0, 0.3]), K(0.3, Z), K(0.6, [0, 0.15, -0.05]), K(1.6, [0, 0.15, -0.05]), K(1.9, Z), K(2.4, Z)],
      // The stare and the hat tip both finish by 1.80 so the clip ENDS on a
      // 0.60 s dead-frontal hold — head yaw = pitch = roll = 0, both arms down,
      // the lens clear of the face. That is the round-start frame the 2-second
      // test is run on (brief §1 / §4.5).
      head: [K(0, [0, 0.6, 0]), K(0.14, [0, -0.5, 0]), K(0.3, Z), K(0.5, [0, 0.12, 0.12]), K(1.3, [0, 0.12, 0.12]), K(1.55, [0, 0, -0.1]), K(1.8, Z), K(2.4, Z)],
      // lens up to the eye, long suspicious stare
      armR: [K(0, Z), K(0.5, [0, 0, 1.9]), K(1.3, [0, 0, 1.9]), K(1.6, [0, 0, 0.5]), K(1.8, [0, 0, 0.35]), K(2.4, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.0]), K(0.5, [0, 0, 2.1]), K(1.3, [0, 0, 2.1]), K(1.6, [0, 0, 1.2]), K(1.8, [0, 0, 1.15]), K(2.4, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.5, [0, 0, -0.6]), K(1.3, [0, 0, -0.6]), K(1.6, Z), K(2.4, Z)],
      // hat tip with the left hand
      armL: [K(0, Z), K(1.35, [0, 0, 0.1]), K(1.5, [-0.3, 0, 2.3]), K(1.68, [-0.3, 0, 2.3]), K(1.8, [0, 0, 0.08]), K(2.4, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(1.5, [0, 0, 0.9]), K(1.68, [0, 0, 0.9]), K(1.8, [0, 0, 0.25]), K(2.4, [0, 0, 0.25])],
      hat: [K(0, Z), K(1.5, [0, 0, 0.35]), K(1.68, [0, 0, 0.35]), K(1.8, Z), K(2.4, Z)],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
      coat: [K(0, [0, 0, -0.6]), K(0.3, [0, 0, 0.15]), K(0.6, Z), K(2.4, Z)],
    },
  },

  // case closed: lens raised to the sky, hat spin-tap, coat billowing
  win: {
    duration: 2.4, loop: true,
    tracks: {
      // THE DEAD-FRONTAL HOLD (brief §1 / §4.5). The source archetype is always
      // a straight-on portrait, and the 2-second test is run on that frame. The
      // first 0.75 s of `win` therefore holds head yaw = pitch = roll = 0 with
      // BOTH arms down and the lens clear of the face — a full 0.75 s window,
      // comfortably over the 0.6 s minimum, with the fedora's 18 deg supplying
      // all the character. Only after 0.75 s does the lens go up.
      hips: [K(0, Z, HIP), K(0.75, Z, HIP), K(1.1, Z, [0, 1.02, 0]), K(1.6, [0, 0.3, 0], [0, 0.98, 0]), K(2.0, [0, -0.3, 0], [0, 1.0, 0]), K(2.4, Z, HIP)],
      armR: [K(0, [0, 0, 0.35]), K(0.75, [0, 0, 0.35]), K(1.05, [0, 0, 2.9]), K(2.05, [0, 0, 2.9]), K(2.4, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.75, [0, 0, 1.15]), K(1.05, [0, 0, 0.2]), K(2.05, [0, 0, 0.2]), K(2.4, [0, 0, 1.15])],
      lens: [K(0, Z), K(1.05, [0, 0.4, 0]), K(1.5, [0, -0.4, 0]), K(1.9, [0, 0.4, 0]), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.08]), K(1.1, [0, 0, 0.08]), K(1.35, [-0.3, 0, 2.2]), K(1.7, [-0.3, 0, 2.2]), K(1.95, [0, 0, 0.08]), K(2.4, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(1.1, [0, 0, 0.25]), K(1.35, [0, 0, 1.0]), K(1.7, [0, 0, 1.0]), K(1.95, [0, 0, 0.25])],
      hat: [K(0, Z), K(0.9, Z), K(1.2, [0, 0, 0.45]), K(1.45, [0, 0.6, 0.45]), K(1.7, Z), K(2.4, Z)],
      head: [K(0, Z), K(0.75, Z), K(1.05, [0, 0, 0.3]), K(2.05, [0, 0, 0.28]), K(2.4, Z)],
      torso: [K(0, Z), K(0.75, Z), K(1.05, [0, 0, 0.12]), K(2.05, [0, 0, 0.1]), K(2.4, Z)],
      coat: [K(0, Z), K(0.8, Z), K(1.1, [0, 0, -0.35]), K(1.6, [0, 0, -0.2]), K(2.0, [0, 0, -0.35]), K(2.4, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  lose: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.8, 0]), K(1.0, [0, 0.06, 0], [0, 0.785, 0]), K(2.0, Z, [0, 0.8, 0])],
      torso: [K(0, [0, 0, -0.45]), K(1.0, [0, 0, -0.5]), K(2.0, [0, 0, -0.45])],
      // head twitches — corrupted save file
      head: [K(0, [0, 0, -0.5]), K(0.9, [0, 0, -0.52]), K(0.96, [0, 0.4, -0.4]), K(1.02, [0, -0.3, -0.55]), K(1.1, [0, 0, -0.5]), K(2.0, [0, 0, -0.5])],
      armL: [K(0, [0, 0, 0.3])], armR: [K(0, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.1])], forearmR: [K(0, [0, 0, 0.15])],
      legL: [K(0, [-0.3, 0, 0.9])], legR: [K(0, [0.3, 0, 0.9])],
      shinL: [K(0, [0, 0, -1.2])], shinR: [K(0, [0, 0, -1.2])],
      hat: [K(0, [0.55, 0, 0.5]), K(1.0, [0.6, 0, 0.55]), K(2.0, [0.55, 0, 0.5])],
      coat: [K(0, [0, 0, 0.5])],
    },
  },

  // polishes the lens on the coat, checks it, unimpressed
  taunt: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 0.9]), K(0.9, [0, 0, 0.9]), K(1.05, [0, 0, 1.9]), K(1.3, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 1.5]), K(0.35, [0, 0, 1.3]), K(0.5, [0, 0, 1.5]), K(0.65, [0, 0, 1.3]), K(0.9, [0, 0, 1.5]), K(1.05, [0, 0, 2.1]), K(1.3, [0, 0, 1.15])],
      lens: [K(0, Z), K(1.05, [0, 0, -0.5]), K(1.3, Z)],
      torso: [K(0, Z), K(0.2, [0, -0.15, -0.1]), K(0.9, [0, -0.15, -0.1]), K(1.05, [0, 0.1, 0.05]), K(1.3, Z)],
      head: [K(0, Z), K(0.2, [0, -0.2, 0.25]), K(0.9, [0, -0.2, 0.25]), K(1.05, [0, 0.15, 0.1]), K(1.15, [0, -0.15, 0.1]), K(1.3, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.2, 0, 0.4]), K(1.3, [0, 0, 0.08])],
      hat: [K(0, Z), K(1.05, [0, 0, 0.15]), K(1.3, Z)],
      hips: [K(0, Z, HIP)],
      coat: [K(0, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  blockJab: {
    duration: 0.3, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.07, [0, 0, -0.3]), K(0.12, [0, 0, -1.5]), K(0.3, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.07, [0, 0, 1.2]), K(0.12, [0, 0, 0.05]), K(0.3, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.07, [0, 0.25, 0]), K(0.12, [0, -0.35, 0]), K(0.3, Z)],
      hips: [K(0, Z, HIP), K(0.12, [0, -0.2, 0], [0.05, 0.97, 0]), K(0.3, Z, HIP)],
      head: [K(0, Z), K(0.12, [0, 0.1, -0.05]), K(0.3, Z)],
      armR: [K(0, [0, 0, 0.35])], forearmR: [K(0, [0, 0, 1.15])],
      coat: [K(0, Z), K(0.12, [0, 0, -0.15]), K(0.3, Z)],
    },
  },

  pixelKick: {
    duration: 0.35, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.08, [0, 0, -0.5]), K(0.14, [0, 0, 1.7]), K(0.24, [0, 0, 1.4]), K(0.35, Z)],
      shinR: [K(0, Z), K(0.08, [0, 0, -1.4]), K(0.14, [0, 0, -0.1]), K(0.35, Z)],
      hips: [K(0, Z, HIP), K(0.14, [0, 0, 0.12], [0.04, 1.0, 0]), K(0.35, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, 0.2]), K(0.35, Z)],
      head: [K(0, Z), K(0.14, [0, 0, -0.15]), K(0.35, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.14, [0.3, 0, 0.7]), K(0.35, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.14, [-0.3, 0, 0.7]), K(0.35, [0, 0, 0.35])],
      legL: [K(0, Z), K(0.14, [0, 0, -0.15]), K(0.35, Z)],
      coat: [K(0, Z), K(0.14, [0, 0, -0.5]), K(0.35, Z)],
      hat: [K(0, Z), K(0.16, [0.15, 0, 0.12]), K(0.35, Z)],
    },
  },

  lensStrike: {
    duration: 0.55, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.12, [0, 0, 2.6]), K(0.17, [0, 0, 2.6]), K(0.2, [0, 0, -0.9]), K(0.34, [0, 0, -0.7]), K(0.55, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.12, [0, 0, 0.6]), K(0.2, [0, 0, 0.1]), K(0.55, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.12, [0, 0, -0.4]), K(0.2, [0, 0, 0.3]), K(0.55, Z)],
      torso: [K(0, Z), K(0.12, [0, -0.5, -0.1]), K(0.2, [0, 0.5, 0.15]), K(0.38, [0, 0.4, 0.1]), K(0.55, Z)],
      hips: [K(0, Z, HIP), K(0.12, [0, -0.3, 0], HIP), K(0.2, [0, 0.35, 0], [0.12, 0.94, 0]), K(0.55, Z, HIP)],
      head: [K(0, Z), K(0.12, [0, -0.3, 0]), K(0.2, [0, 0.25, -0.1]), K(0.55, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.12, [0, 0, 0.6]), K(0.2, [0.3, 0, -0.8]), K(0.55, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.55, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, 0.25]), K(0.55, Z)],
      coat: [K(0, Z), K(0.2, [0, 0, -0.35]), K(0.55, Z)],
      hat: [K(0, Z), K(0.22, [0.2, 0, 0.2]), K(0.55, Z)],
    },
  },

  coatSpin: {
    duration: 0.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.09, [0, -0.6, 0], [0, 0.9, 0]), K(0.2, [0, 1.8, 0], [0, 1.0, 0]), K(0.32, [0, 4.2, 0], [0, 0.96, 0]), K(0.42, [0, 6.28, 0], [0, 1.0, 0]), K(0.52, [0, 6.28, 0], [0, 0.95, 0]), K(0.6, [0, 6.28, 0], HIP)],
      // coat flares out hard during the spin
      coat: [K(0, Z), K(0.15, [0.5, 0, -0.9]), K(0.35, [-0.5, 0, -0.9]), K(0.48, [0, 0, -0.3]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.15, [1.3, 0, 0.4]), K(0.42, [1.3, 0, 0.4]), K(0.6, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.15, [-1.3, 0, 0.4]), K(0.42, [-1.3, 0, 0.4]), K(0.6, [0, 0, 0.35])],
      torso: [K(0, Z), K(0.15, [0, 0, -0.12]), K(0.42, [0, 0, -0.12]), K(0.6, Z)],
      head: [K(0, Z), K(0.09, [0, -0.4, 0]), K(0.32, [0, 0.4, 0]), K(0.6, Z)],
      legL: [K(0, Z), K(0.3, [0, 0, 0.2]), K(0.6, Z)],
      legR: [K(0, Z), K(0.3, [0, 0, -0.2]), K(0.6, Z)],
      hat: [K(0, Z), K(0.2, [0, 0, -0.25]), K(0.42, [0, 0, -0.25]), K(0.6, Z)],
    },
  },

  glitchDodge: {
    duration: 0.35, loop: false,
    tracks: {
      // digital stutter: pose snaps with zero easing frames between extremes
      hips: [K(0, Z, HIP), K(0.05, [0, 0.4, 0.15], [0, 0.9, 0]), K(0.1, [0, -0.5, -0.1], [0, 1.03, 0]), K(0.15, [0, 0.25, 0], [0, 0.94, 0]), K(0.24, Z, HIP), K(0.35, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, 0.4, -0.2]), K(0.1, [0, -0.4, 0.2]), K(0.18, Z), K(0.35, Z)],
      head: [K(0, Z), K(0.05, [0, -0.6, 0]), K(0.1, [0, 0.6, 0]), K(0.18, Z), K(0.35, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.05, [0.8, 0, 0.9]), K(0.1, [-0.5, 0, -0.4]), K(0.2, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.05, [-0.8, 0, 0.9]), K(0.1, [0.5, 0, -0.4]), K(0.2, [0, 0, 0.35])],
      hat: [K(0, Z), K(0.08, [0.4, 0, -0.4]), K(0.16, [-0.3, 0, 0.3]), K(0.28, Z)],
      coat: [K(0, Z), K(0.08, [0, 0, -0.8]), K(0.2, [0, 0, 0.3]), K(0.35, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  handPunch: {
    duration: 0.6, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.08, [0, 0, -0.4]), K(0.13, [0, 0, -1.55]), K(0.4, [0, 0, -1.55]), K(0.5, [0, 0, -1.2]), K(0.6, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.08, [0, 0, 0.8]), K(0.13, [0, 0, 0.05]), K(0.4, [0, 0, 0.05]), K(0.6, [0, 0, 1.15])],
      torso: [K(0, Z), K(0.08, [0, 0.3, 0]), K(0.13, [0, -0.45, 0]), K(0.4, [0, -0.45, 0]), K(0.6, Z)],
      hips: [K(0, Z, HIP), K(0.13, [0, -0.25, 0], [0.08, 0.96, 0]), K(0.4, [0, -0.25, 0], [0.08, 0.96, 0]), K(0.6, Z, HIP)],
      head: [K(0, Z), K(0.13, [0, 0.2, -0.08]), K(0.4, [0, 0.2, -0.08]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.13, [0.3, 0, 0.6]), K(0.6, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.13, [0, 0, -0.25]), K(0.6, Z)],
      legR: [K(0, Z), K(0.13, [0, 0, 0.2]), K(0.6, Z)],
      coat: [K(0, Z), K(0.13, [0, 0, -0.3]), K(0.6, Z)],
      hat: [K(0, Z), K(0.15, [0.15, 0, 0.15]), K(0.6, Z)],
    },
  },

  cloneFeint: {
    duration: 0.7, loop: false,
    tracks: {
      // snaps a finger, leans back smugly while the clone does the work
      armL: [K(0, [0, 0, 0.08]), K(0.1, [0, 0, 1.6]), K(0.16, [0, 0, 1.5]), K(0.5, [0, 0, 1.5]), K(0.7, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.1, [0, 0, 1.3]), K(0.16, [0, 0, 0.9]), K(0.5, [0, 0, 0.9]), K(0.7, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.16, [0, 0, -0.2]), K(0.5, [0, 0, -0.2]), K(0.7, Z)],
      hips: [K(0, Z, HIP), K(0.16, Z, [-0.08, 0.97, 0]), K(0.5, Z, [-0.08, 0.97, 0]), K(0.7, Z, HIP)],
      head: [K(0, Z), K(0.16, [0, 0.1, 0.1]), K(0.5, [0, 0.1, 0.1]), K(0.7, Z)],
      armR: [K(0, [0, 0, 0.35]), K(0.16, [0, 0, 0.6]), K(0.7, [0, 0, 0.35])],
      coat: [K(0, Z), K(0.16, [0, 0, 0.2]), K(0.7, Z)],
      hat: [K(0, Z), K(0.2, [0, 0, -0.1]), K(0.7, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  pixelVolley: {
    duration: 0.8, loop: false,
    tracks: {
      // underhand cube flicks, alternating hands like dealing cards
      armR: [K(0, [0, 0, 0.35]), K(0.15, [0, 0, 1.2]), K(0.22, [0, 0, -1.0]), K(0.35, [0, 0, 1.2]), K(0.42, [0, 0, -1.0]), K(0.6, [0, 0, 0.35]), K(0.8, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.15, [0, 0, 1.6]), K(0.22, [0, 0, 0.2]), K(0.35, [0, 0, 1.6]), K(0.42, [0, 0, 0.2]), K(0.8, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.25, [0, 0, 1.2]), K(0.32, [0, 0, -1.0]), K(0.45, [0, 0, 1.2]), K(0.52, [0, 0, -1.0]), K(0.7, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.25, [0, 0, 1.6]), K(0.32, [0, 0, 0.2]), K(0.45, [0, 0, 1.6]), K(0.52, [0, 0, 0.2]), K(0.8, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.2, [0, -0.15, 0.05]), K(0.5, [0, 0.15, 0.05]), K(0.8, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [0, 0.94, 0]), K(0.6, Z, [0, 0.94, 0]), K(0.8, Z, HIP)],
      legL: [K(0, Z), K(0.2, [-0.15, 0, 0.2]), K(0.6, [-0.15, 0, 0.2]), K(0.8, Z)],
      legR: [K(0, Z), K(0.2, [0.15, 0, 0.2]), K(0.6, [0.15, 0, 0.2]), K(0.8, Z)],
      shinL: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.6, [0, 0, -0.3]), K(0.8, Z)],
      shinR: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.6, [0, 0, -0.3]), K(0.8, Z)],
      head: [K(0, Z), K(0.3, [0, 0, 0.1]), K(0.8, Z)],
      coat: [K(0, Z)], hat: [K(0, Z)],
    },
  },

  chainCustody: {
    duration: 0.9, loop: false,
    tracks: {
      // lunge, cuff both wrists, overhead slam
      armL: [K(0, [0, 0, 0.08]), K(0.12, [0, 0, -1.3]), K(0.3, [0, 0, -1.3]), K(0.45, [0, 0, 2.7]), K(0.58, [0, 0, -0.9]), K(0.9, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.12, [0, 0, -1.3]), K(0.3, [0, 0, -1.3]), K(0.45, [0, 0, 2.7]), K(0.58, [0, 0, -0.9]), K(0.9, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.12, [0, 0, 0.2]), K(0.45, [0, 0, 0.3]), K(0.9, [0, 0, 0.25])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.12, [0, 0, 0.2]), K(0.45, [0, 0, 0.3]), K(0.9, [0, 0, 1.15])],
      hips: [K(0, Z, HIP), K(0.12, Z, [0.12, 0.94, 0]), K(0.45, [0, 0, 0.15], [0, 1.03, 0]), K(0.58, [0, 0, -0.15], [0.1, 0.88, 0]), K(0.75, Z, HIP), K(0.9, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.45, [0, 0, 0.3]), K(0.58, [0, 0, -0.45]), K(0.75, Z), K(0.9, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.45, [0, 0, 0.25]), K(0.58, [0, 0, -0.3]), K(0.9, Z)],
      legL: [K(0, Z), K(0.12, [0, 0, 0.4]), K(0.58, [-0.2, 0, 0.3]), K(0.9, Z)],
      legR: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.58, [0.2, 0, 0.3]), K(0.9, Z)],
      coat: [K(0, Z), K(0.45, [0, 0, -0.4]), K(0.58, [0, 0, 0.3]), K(0.9, Z)],
      hat: [K(0, Z), K(0.6, [0.3, 0, 0.3]), K(0.9, Z)],
    },
  },

  evidenceBag: {
    duration: 1.0, loop: false,
    tracks: {
      // bag the head, one full spin, toss over the shoulder
      armR: [K(0, [0, 0, 0.35]), K(0.12, [0, 0, -2.0]), K(0.22, [0, 0, -1.4]), K(0.65, [0, 0, -1.4]), K(0.78, [0, 0, 2.4]), K(1.0, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.12, [0, 0, 0.3]), K(0.65, [0, 0, 0.4]), K(0.78, [0, 0, 0.2]), K(1.0, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.22, [0.8, 0, 0.5]), K(0.65, [0.8, 0, 0.5]), K(1.0, [0, 0, 0.08])],
      hips: [K(0, Z, HIP), K(0.25, [0, 1.8, 0], [0, 0.95, 0]), K(0.42, [0, 4.2, 0], [0, 1.0, 0]), K(0.58, [0, 6.28, 0], [0, 0.95, 0]), K(0.78, [0, 6.28, 0], [-0.06, 1.02, 0]), K(1.0, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.25]), K(0.58, [0, 0, -0.15]), K(0.78, [0, 0.5, 0.3]), K(1.0, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.78, [0, 0.3, 0.2]), K(1.0, Z)],
      coat: [K(0, Z), K(0.3, [0.4, 0, -0.7]), K(0.5, [-0.4, 0, -0.7]), K(0.7, [0, 0, -0.3]), K(1.0, Z)],
      legL: [K(0, Z), K(0.42, [0, 0, 0.15]), K(1.0, Z)],
      legR: [K(0, Z), K(0.42, [0, 0, -0.15]), K(1.0, Z)],
      hat: [K(0, Z), K(0.42, [0, 0, -0.2]), K(0.8, [0.2, 0, 0.2]), K(1.0, Z)],
    },
  },

  rightClickSave: {
    duration: 1.2, loop: false,
    tracks: {
      // conjures a context menu with two crisp air-clicks
      armR: [K(0, [0, 0, 0.35]), K(0.15, [0, 0, 1.5]), K(1.0, [0, 0, 1.5]), K(1.2, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.15, [0, 0, 0.9]), K(0.24, [0, 0, 1.15]), K(0.3, [0, 0, 0.9]), K(0.38, [0, 0, 1.15]), K(1.0, [0, 0, 0.95]), K(1.2, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.15, [0, 0, 0.3]), K(1.0, [0, 0, 0.3]), K(1.2, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.4, 0, 0.9]), K(1.0, [0.4, 0, 0.9]), K(1.2, [0, 0, 0.08])],
      torso: [K(0, Z), K(0.15, [0, 0.12, -0.08]), K(1.0, [0, 0.12, -0.08]), K(1.2, Z)],
      head: [K(0, Z), K(0.15, [0, 0.15, 0.05]), K(0.5, [0, -0.2, 0.05]), K(0.8, [0, 0.15, 0.05]), K(1.2, Z)],
      hips: [K(0, Z, HIP), K(0.15, Z, [-0.04, 0.97, 0]), K(1.0, Z, [-0.04, 0.97, 0]), K(1.2, Z, HIP)],
      coat: [K(0, Z), K(0.2, [0, 0, 0.1]), K(1.2, Z)],
      hat: [K(0, Z)], legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  missingMetadata: {
    duration: 1.1, loop: false,
    tracks: {
      // slow menacing lens sweep across the foe, then a dismissive delete-swipe
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 1.8]), K(0.4, [0.35, 0, 1.8]), K(0.6, [-0.35, 0, 1.8]), K(0.75, [0, 0, 1.8]), K(0.9, [0, 0, -0.8]), K(1.1, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 1.7]), K(0.75, [0, 0, 1.7]), K(0.9, [0, 0, 0.2]), K(1.1, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.2, [0, 0, -0.5]), K(0.75, [0, 0, -0.5]), K(1.1, Z)],
      head: [K(0, Z), K(0.2, [0, 0.12, 0.08]), K(0.4, [0, -0.1, 0.08]), K(0.6, [0, 0.12, 0.08]), K(0.9, [0, 0, -0.1]), K(1.1, Z)],
      torso: [K(0, Z), K(0.2, [0, 0.1, -0.05]), K(0.75, [0, 0.1, -0.05]), K(0.9, [0, -0.2, 0.05]), K(1.1, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.2, 0, 0.5]), K(1.1, [0, 0, 0.08])],
      hips: [K(0, Z, HIP), K(0.2, Z, [-0.03, 0.97, 0]), K(0.85, Z, [-0.03, 0.97, 0]), K(1.1, Z, HIP)],
      coat: [K(0, Z)], hat: [K(0, Z)], legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  floorPrice: {
    duration: 1.6, loop: false,
    tracks: {
      // points at the sky like calling down judgment, then crosses arms
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 3.0]), K(0.6, [0, 0, 3.0]), K(0.8, [-0.4, 0, 0.9]), K(1.4, [-0.4, 0, 0.9]), K(1.6, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.1]), K(0.6, [0, 0, 0.1]), K(0.8, [0, 0, 1.6]), K(1.4, [0, 0, 1.6]), K(1.6, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.8, [0.4, 0, 0.9]), K(1.4, [0.4, 0, 0.9]), K(1.6, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.8, [0, 0, 1.7]), K(1.4, [0, 0, 1.7]), K(1.6, [0, 0, 0.25])],
      head: [K(0, Z), K(0.2, [0, 0, 0.45]), K(0.6, [0, 0, 0.45]), K(0.8, [0, 0, -0.1]), K(1.4, [0, 0, -0.1]), K(1.6, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.2]), K(0.6, [0, 0, 0.2]), K(0.8, [0, 0, -0.08]), K(1.6, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [-0.05, 1.0, 0]), K(0.6, Z, [-0.05, 1.0, 0]), K(0.8, Z, HIP)],
      coat: [K(0, Z), K(0.2, [0, 0, -0.2]), K(0.8, Z)],
      hat: [K(0, Z), K(0.25, [-0.2, 0, -0.15]), K(0.7, [-0.2, 0, -0.15]), K(0.9, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  blockchainDetective: {
    duration: 1.7, loop: false,
    tracks: {
      // long lens-beam aim... then a two-handed downward verdict
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, -1.5]), K(1.0, [0, 0, -1.5]), K(1.15, [0, 0, 2.6]), K(1.3, [0, 0, -0.6]), K(1.7, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.1]), K(1.0, [0, 0, 0.1]), K(1.15, [0, 0, 0.3]), K(1.7, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.2, [0, 0, 1.1]), K(1.0, [0, 0, 1.1]), K(1.7, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.5, 0, 0.6]), K(1.0, [0.5, 0, 0.6]), K(1.15, [0, 0, 2.6]), K(1.3, [0, 0, -0.6]), K(1.7, [0, 0, 0.08])],
      torso: [K(0, Z), K(0.2, [0, -0.25, 0]), K(1.0, [0, -0.25, 0]), K(1.15, [0, 0, 0.25]), K(1.3, [0, 0, -0.4]), K(1.7, Z)],
      hips: [K(0, Z, HIP), K(0.2, [0, -0.15, 0], [0.04, 0.96, 0]), K(1.0, [0, -0.15, 0], [0.04, 0.96, 0]), K(1.3, [0, 0, -0.1], [0.08, 0.9, 0]), K(1.7, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, -0.15, 0.1]), K(1.0, [0, -0.15, 0.1]), K(1.3, [0, 0, -0.25]), K(1.7, Z)],
      legL: [K(0, Z), K(1.3, [-0.15, 0, 0.25]), K(1.7, Z)],
      legR: [K(0, Z), K(1.3, [0.15, 0, 0.25]), K(1.7, Z)],
      coat: [K(0, Z), K(1.15, [0, 0, -0.5]), K(1.3, [0, 0, 0.3]), K(1.7, Z)],
      hat: [K(0, Z), K(1.32, [0.35, 0, 0.3]), K(1.7, Z)],
    },
  },

  notYourKeys: {
    duration: 1.4, loop: false,
    tracks: {
      // hoists an enormous key overhead... which snaps. long silence follows.
      armL: [K(0, [0, 0, 0.08]), K(0.2, [-0.2, 0, 2.9]), K(0.45, [-0.2, 0, 2.9]), K(0.55, [-0.2, 0, 2.7]), K(1.0, [-0.2, 0, 2.7]), K(1.2, [0, 0, 0.3]), K(1.4, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0.2, 0, 2.9]), K(0.45, [0.2, 0, 2.9]), K(0.55, [0.2, 0, 2.7]), K(1.0, [0.2, 0, 2.7]), K(1.2, [0, 0, 0.5]), K(1.4, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.2, [0, 0, 0.2]), K(1.4, [0, 0, 0.25])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.2]), K(1.2, [0, 0, 0.8]), K(1.4, [0, 0, 1.15])],
      head: [K(0, Z), K(0.2, [0, 0, 0.4]), K(0.45, [0, 0, 0.4]), K(0.6, [0, 0, 0.5]), K(0.75, [0, 0.5, 0.2]), K(1.0, [0, 0.5, 0.2]), K(1.2, [0, 0, -0.3]), K(1.4, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.15]), K(0.6, [0, 0, 0.18]), K(1.2, [0, 0, -0.15]), K(1.4, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [0, 1.0, 0]), K(0.6, Z, [0, 1.0, 0]), K(1.2, Z, [0, 0.95, 0]), K(1.4, Z, HIP)],
      coat: [K(0, Z), K(0.2, [0, 0, -0.2]), K(0.7, Z)],
      hat: [K(0, Z), K(0.62, [0.2, 0, 0.25]), K(1.1, [0.2, 0, 0.25]), K(1.4, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // finisher: point, drag gesture, dust off the hands
  punkd: {
    duration: 2.5, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, -1.5]), K(0.5, [0, 0, -1.5]), K(0.7, [0, 0, -1.2]), K(1.2, [0, 0, -1.7]), K(1.7, [0, 0, -1.2]), K(2.0, [0, 0, 0.9]), K(2.15, [0, 0, 0.6]), K(2.3, [0, 0, 0.9]), K(2.5, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.1]), K(1.7, [0, 0, 0.1]), K(2.0, [0, 0, 1.3]), K(2.5, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.7, [0.3, 0, 0.5]), K(1.7, [0.3, 0, 0.5]), K(2.0, [0, 0, 0.9]), K(2.15, [0, 0, 0.6]), K(2.3, [0, 0, 0.9]), K(2.5, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(2.0, [0, 0, 1.3]), K(2.5, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.2, [0, -0.4, 0]), K(0.7, [0, -0.4, 0]), K(1.2, [0, -0.55, 0]), K(1.7, [0, -0.4, 0]), K(2.0, [0, 0, 0.1]), K(2.5, Z)],
      hips: [K(0, Z, HIP), K(0.2, [0, -0.25, 0], [0.05, 0.96, 0]), K(1.7, [0, -0.25, 0], [0.05, 0.96, 0]), K(2.0, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, -0.25, 0]), K(1.7, [0, -0.25, 0]), K(2.0, [0, 0, 0.1]), K(2.2, [0, 0.3, 0]), K(2.35, [0, -0.3, 0]), K(2.5, Z)],
      coat: [K(0, Z), K(0.25, [0, 0, -0.3]), K(1.8, [0, 0, -0.2]), K(2.5, Z)],
      hat: [K(0, Z), K(1.9, [0, 0, -0.1]), K(2.5, Z)],
      legL: [K(0, Z), K(0.2, [0, 0, 0.2]), K(1.9, [0, 0, 0.2]), K(2.5, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, -0.2]), K(1.9, [0, 0, -0.2]), K(2.5, Z)],
    },
  },
}

// normalization pass: rescale authored hips heights to the real rig (fresh
// arrays — the authored literals above are never mutated twice)
for (const clip of Object.values(clips)) {
  const track = clip.tracks?.hips
  if (!track) continue
  for (const k of track) {
    if (k.pos) k.pos = [k.pos[0], k.pos[1] * HIP_SCALE, k.pos[2]]
  }
}

// ---------------------------------------------------------------------------
// script helpers
// ---------------------------------------------------------------------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)

function inRange(fx, r) {
  if (!fx.foe || !fx.self) return false
  return Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) <= r && Math.abs(fx.foe.pos.y - fx.self.pos.y) < 1.8
}

// end() guard so parallel timelines can never call fx.end() twice
function onceEnd(fx) {
  let done = false
  return () => { if (!done) { done = true; fx.end() } }
}

function clampToArena(fx, x) {
  let minX = -8.5, maxX = 8.5
  try {
    const b = fx.arena()?.bounds
    if (b) { minX = b.minX + 0.8; maxX = b.maxX - 0.8 }
  } catch { /* arena optional */ }
  return Math.max(minX, Math.min(maxX, x))
}

// somewhere to park script-owned effect meshes: arena group, else scene root
function stage(fx) {
  try { const g = fx.arena()?.group; if (g) return g } catch { /* arena optional */ }
  try { if (fx.self?.root?.parent) return fx.self.root.parent } catch { /* no scene */ }
  return null
}

function addFxMesh(fx, mesh) {
  const s = stage(fx)
  if (!s) return false
  try { s.add(mesh); return true } catch { return false }
}

function dropMesh(mesh) {
  try { mesh?.parent?.remove(mesh) } catch { /* already gone */ }
}

function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts })
}

// pixel-font canvas label texture; returns null when canvas is unavailable
function labelTex(lines, opts = {}) {
  try {
    const w = opts.w || 256, h = opts.h || 128
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    if (!x) return null
    x.fillStyle = opts.bg || '#f2f0e6'
    x.fillRect(0, 0, w, h)
    if (opts.border) {
      x.strokeStyle = opts.border
      x.lineWidth = 8
      x.strokeRect(4, 4, w - 8, h - 8)
    }
    x.fillStyle = opts.fg || '#14161a'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    const size = opts.size || 30
    x.font = `bold ${size}px monospace`
    lines.forEach((ln, i) => x.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (size + 8)))
    const t = new THREE.CanvasTexture(c)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
    return t
  } catch { return null }
}

// flat panel with a text label on both faces (plain color if canvas missing)
function labelPanel(w, h, lines, opts = {}) {
  const tex = labelTex(lines, opts)
  const face = tex
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 })
    : basic(opts.fallback ?? 0xf2f0e6, { transparent: !!opts.transparent, opacity: opts.opacity ?? 1 })
  const side = basic(opts.sideColor ?? 0xd9d6c6)
  const mesh = new THREE.Mesh(new GEO.BoxGeometry(w, h, opts.depth ?? 0.12),
    [side, side, side, side, face, face.clone ? face.clone() : face])
  return mesh
}

// cheap transparent block-humanoid ghost (for clones and right-click copies)
function ghostDummy(height, colorHex, opacity) {
  const g = new THREE.Group()
  const mat = basic(colorHex, { transparent: true, opacity, depthWrite: false })
  const s = height / 1.85
  const add = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new GEO.BoxGeometry(w * s, h * s, d * s), mat)
    m.position.set(x * s, y * s, z * s)
    g.add(m)
  }
  add(0.34, 0.2, 0.42, 0, 0.86, 0)           // pelvis
  add(0.5, 0.54, 0.42, -0.02, 1.21, 0)       // torso
  add(0.42, 0.42, 0.42, 0, 1.64, 0)          // cube head
  add(0.16, 0.76, 0.18, 0, 0.42, 0.13)       // legs
  add(0.16, 0.76, 0.18, 0, 0.42, -0.13)
  add(0.14, 0.7, 0.16, 0, 1.12, 0.3)         // arms
  add(0.14, 0.7, 0.16, 0, 1.12, -0.3)
  return { g, mat }
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------

// Magnifying-Glass Strike — heavy bonk with a lens flash on impact
function lensStrikeScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('whoosh')
  const lens = fx.self.bones?.lens
  const glass = lens?.userData?.glassMat || null
  const baseHex = lens?.userData?.glassBaseHex ?? 0x9fe8ff
  const restore = () => {
    if (!glass) return
    try { glass.color.setHex(baseHex); glass.opacity = 0.45 } catch { /* material */ }
  }
  fx.after(11, () => {
    try { if (glass) { glass.color.setHex(0xffffff); glass.opacity = 0.95 } } catch { /* material */ }
    fx.particles('sparks', v3(fx.self.pos.x + fx.self.facing * 1.0, 1.4, 0), { n: 12 })
    fx.sfx('menu_confirm', { pitch: 2.0 })
    if (inRange(fx, 1.9)) {
      fx.sfx('punch_heavy')
      fx.shake(0.45)
      fx.particles('impact', v3(fx.foe.pos.x, 1.4, 0), { n: 12 })
      fx.hit({ damage: 13, knockback: { x: 8.5, y: 3, spin: 0.8 }, hitStun: 20, ragdoll: 1 })
      fx.caption('OBJECTION SUSTAINED')
    }
  })
  fx.after(20, restore)
  fx.after(45, restore) // failsafe: never leave the lens blown out
  fx.after(32, end)
}

// Glitch Dodge — 1m displacement with RGB-split afterimages + brief invuln
function glitchDodgeScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('menu_back', { pitch: 2.2 })
  const ghosts = []
  const cleanup = () => { for (const m of ghosts) dropMesh(m.g); ghosts.length = 0 }
  fx.after(2, () => {
    const F = fx.self.facing
    const x0 = fx.self.pos.x, y0 = fx.self.pos.y
    // RGB-split afterimages left at the vacated position
    for (const [hex, dz] of [[0xff3df0, 0.06], [0x2ee6ff, -0.06]]) {
      const d = ghostDummy(1.85, hex, 0.4)
      d.g.position.set(x0, y0, dz)
      d.g.rotation.y = F === 1 ? 0 : Math.PI
      if (addFxMesh(fx, d.g)) ghosts.push(d)
    }
    // the teleport itself — 1m away from trouble, clamped in-bounds
    try { fx.self.pos.x = clampToArena(fx, x0 - F * 1.0) } catch { /* stay put */ }
    try { fx.self.invuln = Math.max(fx.self.invuln || 0, 10) } catch { /* engine-owned */ }
    fx.particles('smoke', v3(x0, 1.0, 0), { n: 6 })
    fx.sfx('menu_back', { pitch: 1.4 })
  })
  for (let i = 1; i <= 5; i++) {
    fx.after(2 + i * 2, () => {
      for (const d of ghosts) { try { d.mat.opacity = Math.max(0, 0.4 - i * 0.09) } catch { /* mat */ } }
    })
  }
  fx.after(14, cleanup)
  fx.after(40, cleanup) // failsafe
  fx.after(21, end)
}

// Detached-Hand Punch — the hand leaves, launches somebody, and comes home
function handPunchScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const handMesh = fx.self.bones?.forearmR?.userData?.handMesh || null
  const restore = () => { try { if (handMesh) handMesh.visible = true } catch { /* mesh */ } }
  let fist = null
  let landed = false
  fx.sfx('whoosh')
  fx.after(8, () => {
    try { if (handMesh) handMesh.visible = false } catch { /* mesh */ }
    fist = new THREE.Group()
    const fm = basic(0x59637d)
    fist.add(new THREE.Mesh(new GEO.BoxGeometry(0.26, 0.22, 0.22), fm))
    const cuff = new THREE.Mesh(new GEO.BoxGeometry(0.08, 0.26, 0.26), basic(0x2ee6ff))
    cuff.position.x = -0.16
    fist.add(cuff)
    fist.position.set(fx.self.pos.x + F * 0.6, fx.self.pos.y + 1.25, 0)
    if (!addFxMesh(fx, fist)) fist = null
    fx.sfx('launch', { pitch: 1.5 })
  })
  fx.frame((age) => {
    try {
      if (!fist) return
      if (age >= 8 && age < 19) {
        fist.position.x += F * 0.25 // out: 2.5m over 10 frames
        fist.rotation.x += 0.5
        if (!landed && Math.abs(fist.position.x - fx.foe.pos.x) < 0.7 && Math.abs(fx.foe.pos.y - fx.self.pos.y) < 1.8) {
          landed = true
          fx.sfx('punch_heavy')
          fx.shake(0.5)
          fx.particles('impact', v3(fx.foe.pos.x, 1.4, 0), { n: 12 })
          fx.hit({ damage: 9, knockback: { x: 2.5, y: 9.5, spin: 1.2 }, hitStun: 26, ragdoll: 1 })
        }
      } else if (age >= 19 && age < 30) {
        fist.position.x -= F * 0.25 // the return trip
        fist.rotation.x -= 0.5
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(30, () => { dropMesh(fist); fist = null; restore(); fx.sfx('menu_confirm', { pitch: 1.6 }) })
  fx.after(60, () => { dropMesh(fist); restore() }) // failsafe
  fx.after(36, end)
}

// Clone Feint — a transparent duplicate lunges; the original never moved
function cloneFeintScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let clone = null
  fx.sfx('menu_back', { pitch: 1.8 })
  fx.after(6, () => {
    const d = ghostDummy(1.85, 0x8b5cf6, 0.45)
    d.g.position.set(fx.self.pos.x, fx.self.pos.y, 0)
    d.g.rotation.y = F === 1 ? 0 : Math.PI
    if (addFxMesh(fx, d.g)) clone = d
    fx.particles('smoke', v3(fx.self.pos.x, 1.0, 0), { n: 4 })
  })
  fx.frame((age) => {
    try {
      if (!clone) return
      if (age >= 6 && age < 20) {
        clone.g.position.x += F * 0.13 // lunge ~1.8m
        clone.g.rotation.z = -F * 0.25
      } else if (age >= 20) {
        clone.mat.opacity = Math.max(0, clone.mat.opacity - 0.06)
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(16, () => {
    if (inRange(fx, 2.4)) {
      fx.sfx('punch_light', { pitch: 1.4 })
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 6 })
      fx.hit({ damage: 4, knockback: { x: 3.5, y: 1 }, hitStun: 16 })
      fx.caption('FEINT.EXE')
    }
  })
  fx.after(32, () => { if (clone) { dropMesh(clone.g); clone = null } })
  fx.after(70, () => { if (clone) dropMesh(clone.g) }) // failsafe
  fx.after(42, end)
}

// Pixel Projectile — a volley of small kinematic cyan cubes
function pixelVolleyScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const cubes = []
  const cleanup = () => { for (const c of cubes) dropMesh(c.m); cubes.length = 0 }
  for (let i = 0; i < 4; i++) {
    fx.after(12 + i * 6, () => {
      const m = new THREE.Mesh(new GEO.BoxGeometry(0.22, 0.22, 0.22),
        basic(i % 2 ? 0x2ee6ff : 0x8b5cf6))
      m.position.set(fx.self.pos.x + F * 0.7, fx.self.pos.y + 1.15 + (i % 2) * 0.25, 0)
      if (addFxMesh(fx, m)) cubes.push({ m, live: true })
      fx.sfx('menu_confirm', { pitch: 1.4 + i * 0.15 })
    })
  }
  fx.frame(() => {
    try {
      for (const c of cubes) {
        if (!c.live) continue
        c.m.position.x += F * 0.24
        c.m.rotation.x += 0.4
        c.m.rotation.y += 0.3
        const dx = Math.abs(c.m.position.x - fx.foe.pos.x)
        if (dx < 0.55 && Math.abs(fx.foe.pos.y + 1.1 - c.m.position.y) < 1.4) {
          c.live = false
          dropMesh(c.m)
          fx.sfx('punch_light', { pitch: 1.7 })
          fx.particles('sparks', v3(fx.foe.pos.x, 1.2, 0), { n: 5 })
          fx.hit({ damage: 3, knockback: { x: 2, y: 0.8 }, hitStun: 10 })
        } else if (Math.abs(c.m.position.x - fx.self.pos.x) > 7.5) {
          c.live = false
          dropMesh(c.m)
        }
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(52, cleanup)
  fx.after(90, cleanup) // failsafe
  fx.after(48, end)
}

// SPECIAL 1: Right-Click Save — three bootleg copies of the FOE attack the original
function gasFeeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(9, () => {
    // hands you an invoice for looking at him. network congestion surcharge included.
    fx.sfx('menu_confirm', { pitch: 0.8 })
    const bill = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.8, 1.4, 0), { size: [0.05, 0.5, 0.38], mass: 0.2 })
    if (bill) { try { fx.impulse(bill, [F * 9, 3, 0.5], 4) } catch { /* prop gone */ } }
    if (inRange(fx, 3.0)) {
      fx.sfx('punch_heavy')
      fx.shake(0.45)
      fx.hit({ damage: 12, knockback: { x: 11, y: 4.5, spin: 1.5 }, hitStun: 26, ragdoll: 1 })
      fx.coins(v3(fx.foe.pos.x, 1.4, 0), 6)
      fx.caption('GAS FEE: YOUR FACE')
    } else {
      fx.caption('TRANSACTION PENDING...')
    }
  })
  fx.after(38, end)
}

function rightClickSaveScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('RIGHT CLICK... SAVE AS...')
  fx.sfx('menu_confirm', { pitch: 1.2 })
  fx.after(4, () => fx.sfx('menu_confirm', { pitch: 1.5 })) // the double click
  const copies = []
  const cleanup = () => { for (const c of copies) dropMesh(c.g); copies.length = 0 }
  fx.after(10, () => {
    const h = Math.max(1.2, fx.foe?.def?.height || 1.8) * 0.92
    const spots = [
      [fx.foe.pos.x - F * 1.5, 0, 0.25],
      [fx.foe.pos.x + F * 1.5, 0, -0.25],
      [fx.foe.pos.x - F * 1.1, 0, 0.9],
    ]
    for (let i = 0; i < 3; i++) {
      const d = ghostDummy(h, i === 1 ? 0x8b5cf6 : 0x9fb6c9, 0.42)
      d.g.position.set(clampToArena(fx, spots[i][0]), 0, spots[i][2])
      d.g.rotation.y = fx.foe.pos.x >= d.g.position.x ? 0 : Math.PI
      d.home = d.g.position.x
      if (addFxMesh(fx, d.g)) copies.push(d)
    }
    fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 8 })
    fx.sfx('menu_back', { pitch: 2.0 })
  })
  // each copy lunges in sequence — low-res on low-res violence
  const lunge = (idx, atFrame, dmg) => {
    fx.after(atFrame, () => {
      const c = copies[idx]
      if (!c) return
      try { c.g.position.x = fx.foe.pos.x + (c.home < fx.foe.pos.x ? -0.55 : 0.55) } catch { /* gone */ }
      fx.sfx('punch_light', { pitch: 0.9 + idx * 0.25 })
      fx.shake(0.3)
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 8 })
      fx.hit({ damage: dmg, knockback: { x: idx === 2 ? 6 : 1.5, y: idx === 2 ? 3 : 0.8, spin: 0.5 }, hitStun: 18, ragdoll: idx === 2 ? 1 : 0 })
    })
    fx.after(atFrame + 6, () => {
      const c = copies[idx]
      if (!c) return
      try { c.g.position.x = c.home } catch { /* gone */ }
    })
  }
  lunge(0, 22, 6)
  lunge(1, 34, 6)
  lunge(2, 46, 7)
  fx.after(52, () => { fx.caption('RIGHT-CLICK SAVED'); fx.announcer('SAVED WITHOUT PERMISSION') })
  for (let i = 0; i < 5; i++) {
    fx.after(56 + i * 3, () => {
      for (const c of copies) { try { c.mat.opacity = Math.max(0, c.mat.opacity - 0.09) } catch { /* mat */ } }
    })
  }
  fx.after(70, cleanup)
  fx.after(110, cleanup) // failsafe
  fx.after(72, end)
}

// SPECIAL 2: Missing Metadata — the foe's limbs 404 for a couple of seconds
function missingMetadataScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('menu_back', { pitch: 1.6 })
  const hidden = []
  const restore = () => {
    for (const b of hidden) { try { b.visible = true } catch { /* bone */ } }
    hidden.length = 0
  }
  fx.after(14, () => {
    if (!inRange(fx, 3.4)) {
      fx.caption('TARGET OUT OF SCOPE')
      fx.after(20, end)
      return
    }
    try {
      const parts = ['armL', 'armR', 'legL', 'legR'].filter((n) => fx.foe.bones?.[n])
      // shuffle, take 2-3
      for (let i = parts.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        ;[parts[i], parts[j]] = [parts[j], parts[i]]
      }
      const take = parts.slice(0, 2 + (Math.random() < 0.5 ? 1 : 0))
      for (const n of take) {
        const b = fx.foe.bones[n]
        if (b && b.visible !== false) { b.visible = false; hidden.push(b) }
      }
    } catch { /* foe rig is foe's problem */ }
    fx.sfx('break', { pitch: 1.8 })
    fx.shake(0.35)
    fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 10 })
    fx.caption('ERROR 404: LIMBS NOT FOUND')
    fx.announcer('METADATA MISSING')
    // damage over time while the foe wobbles around incomplete
    for (let i = 0; i < 3; i++) {
      fx.after(18 + i * 30, () => {
        if (hidden.length === 0) return
        fx.sfx('menu_back', { pitch: 0.8 + Math.random() * 1.2 })
        fx.particles('sparks', v3(fx.foe.pos.x, 1.1, 0), { n: 4 })
        fx.hit({ damage: 3, knockback: { x: 0.6, y: 0.3 }, hitStun: 8 })
        try { fx.impulse(fx.foe, [(Math.random() - 0.5) * 2, 0.5, 0]) } catch { /* engine */ }
      })
    }
    fx.after(150, restore) // ~2.5s outage
  })
  fx.after(220, restore) // failsafe: limbs ALWAYS come back
  fx.after(66, end)
}

// SPECIAL 3 (SUPER): Floor Price — a giant price tag falls from the sky
function floorPriceScript(fx) {
  const end = onceEnd(fx)
  fx.caption('CHECKING THE FLOOR...')
  fx.announcer('FLOOR PRICE')
  fx.sfx('bell')
  fx.slowmo(0.5, 0.5)
  fx.zoom(fx.foe, 0.6)
  let tag = null
  let crushed = false
  const cleanup = () => { dropMesh(tag); tag = null }
  fx.after(10, () => {
    tag = new THREE.Group()
    const panel = labelPanel(2.7, 1.7, ['FLOOR:', '0.0001'],
      { w: 256, h: 160, size: 44, bg: '#f6f2e2', fg: '#14161a', border: '#8b5cf6', depth: 0.2, sideColor: 0xd9d6c6 })
    tag.add(panel)
    const ring = new THREE.Mesh(filletRing(0.22, 0.06, 6, 12), basic(0xd7b45a))
    ring.rotation.x = Math.PI / 2          // filletRing lies in XZ; face it at camera
    ring.position.set(-1.5, 0.95, 0)
    tag.add(ring)
    const rope = new THREE.Mesh(new GEO.BoxGeometry(0.06, 1.4, 0.06), basic(0xd7b45a))
    rope.position.set(-1.5, 1.9, 0)
    rope.rotation.z = 0.2
    tag.add(rope)
    tag.position.set(clampToArena(fx, fx.foe.pos.x), 8.5, 0)
    if (!addFxMesh(fx, tag)) tag = null
    fx.sfx('whoosh', { pitch: 0.7 })
  })
  fx.frame((age) => {
    try {
      if (!tag) return
      if (age > 10 && age <= 30) {
        // homing drift while it looms overhead
        tag.position.x += Math.max(-0.12, Math.min(0.12, clampToArena(fx, fx.foe.pos.x) - tag.position.x))
        tag.rotation.z = Math.sin(age * 0.3) * 0.08
      } else if (age > 30 && age <= 37) {
        tag.position.y = Math.max(1.0, tag.position.y - 1.25) // THE DROP
      } else if (crushed && age > 37 && age <= 86) {
        tag.position.y = 1.0 + Math.abs(Math.sin(age * 0.5)) * 0.05 // pinning bounce
      } else if (age > 86 && age <= 96) {
        tag.position.y += 0.35 // pops back off
        tag.rotation.z += 0.06
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(36, () => {
    const tx = tag ? tag.position.x : fx.foe.pos.x
    fx.sfx('thud')
    fx.sfx('explosion')
    fx.shake(1.3)
    fx.slowmo(0.3, 0.7)
    fx.particles('impact', v3(tx, 1.0, 0), { n: 24 })
    fx.particles('smoke', v3(tx, 0.4, 0), { n: 12 })
    if (Math.abs(tx - fx.foe.pos.x) < 1.9 && fx.foe.pos.y < 2.2) {
      crushed = true
      fx.hit({ damage: 30, knockback: { x: 0.5, y: -3, spin: 0.4 }, hitStun: 70, ragdoll: 2 })
      fx.caption('FLOOR: 0.0001 — NON-NEGOTIABLE')
    } else {
      // near miss still hurts the portfolio
      fx.hit({ damage: 10, knockback: { x: 7, y: 3, spin: 1 }, hitStun: 24, ragdoll: 1 })
      fx.caption('MARKET CORRECTION')
    }
    fx.coins(v3(tx, 1.6, 0), 10)
  })
  fx.after(60, () => { if (crushed) { fx.sfx('menu_back', { pitch: 0.6 }); fx.shake(0.3) } })
  fx.after(98, cleanup)
  fx.after(140, cleanup) // failsafe
  fx.after(96, end)
}

// SPECIAL 4: Blockchain Detective — scan, publish the receipts, slam with them
function blockchainDetectiveScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('RUNNING TRACE...')
  fx.sfx('menu_move')
  let beam = null
  let scroll = null
  let scrollFace = null
  const cleanup = () => { dropMesh(beam); beam = null; dropMesh(scroll); scroll = null }
  fx.after(8, () => {
    beam = new THREE.Mesh(new GEO.BoxGeometry(1, 0.14, 0.14),
      basic(0x2ee6ff, { transparent: true, opacity: 0.55, depthWrite: false }))
    if (!addFxMesh(fx, beam)) beam = null
    fx.sfx('menu_back', { pitch: 2.4 })
  })
  fx.frame((age) => {
    try {
      if (!beam) return
      const x0 = fx.self.pos.x + F * 0.6
      const x1 = fx.foe.pos.x
      beam.position.set((x0 + x1) / 2, 1.45, 0)
      beam.scale.x = Math.max(0.3, Math.abs(x1 - x0))
      beam.material.opacity = 0.3 + Math.abs(Math.sin(age * 0.8)) * 0.35
    } catch { /* never crash the clock */ }
  })
  fx.after(14, () => {
    if (!inRange(fx, 4.6)) {
      fx.caption('NO TRANSACTIONS FOUND')
      cleanup()
      fx.after(24, end)
      return
    }
    fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 85 })
    fx.sfx('menu_confirm', { pitch: 0.8 })
    // the receipts materialize
    fx.after(4, () => {
      scroll = new THREE.Group()
      const body = labelPanel(1.9, 2.5, ['TRANSACTION', 'HISTORY', '----------', 'BOUGHT TOP x47', 'SOLD BOTTOM x83', 'MINT: RUGGED', 'GAS: $12,403'],
        { w: 256, h: 320, size: 24, bg: '#efe9d2', fg: '#2a1e45', border: '#2ee6ff', depth: 0.08, transparent: true, opacity: 0.55, sideColor: 0xd9d6c6 })
      scrollFace = body
      scroll.add(body)
      const roller = new THREE.Mesh(new GEO.CylinderGeometry(0.12, 0.12, 2.2, 8), basic(0xd7b45a))
      roller.rotation.x = Math.PI / 2
      roller.position.y = 1.32
      scroll.add(roller)
      scroll.position.set(clampToArena(fx, fx.foe.pos.x), 1.35, 0.35)
      scroll.scale.y = 0.05
      if (!addFxMesh(fx, scroll)) scroll = null
      fx.sfx('slide')
    })
    // unroll
    for (let i = 1; i <= 10; i++) {
      fx.after(4 + i * 2, () => { try { if (scroll) scroll.scale.y = Math.min(1, 0.05 + i * 0.1) } catch { /* gone */ } })
    }
    fx.after(28, () => { fx.caption('BOUGHT TOP x47'); fx.sfx('menu_back', { pitch: 0.7 }) })
    fx.after(40, () => { fx.caption('SOLD BOTTOM x83'); fx.sfx('menu_back', { pitch: 0.55 }); fx.announcer('THE RECEIPTS') })
    // SOLIDIFY
    fx.after(50, () => {
      try {
        const mats = Array.isArray(scrollFace?.material) ? scrollFace.material : [scrollFace?.material]
        for (const m of mats) { if (m) { m.opacity = 1; m.transparent = false } }
      } catch { /* material */ }
      fx.sfx('thud')
      fx.shake(0.4)
      fx.particles('sparks', v3(fx.foe.pos.x, 1.6, 0), { n: 8 })
      fx.caption('HISTORY IS IMMUTABLE')
    })
    // SLAM — the ledger comes down on their head
    fx.after(58, () => {
      fx.sfx('punch_heavy')
      fx.sfx('break')
      fx.shake(1)
      fx.slowmo(0.35, 0.5)
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 18 })
      fx.hit({ damage: 16, knockback: { x: 6.5, y: 5, spin: 2 }, hitStun: 30, ragdoll: 2 })
      fx.coins(v3(fx.foe.pos.x, 1.4, 0), 8)
    })
    for (let i = 1; i <= 6; i++) {
      fx.after(58 + i, () => { try { if (scroll) { scroll.rotation.z += F * 0.22; scroll.position.y -= 0.08 } } catch { /* gone */ } })
    }
    fx.after(78, cleanup)
  })
  fx.after(150, cleanup) // failsafe
  fx.after(102, end)
}

// JOKE: Not Your Keys — the comically large key immediately snaps
function notYourKeysScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('NOT YOUR KEYS...')
  fx.sfx('menu_confirm')
  let key = null
  const halves = []
  const cleanup = () => { dropMesh(key); key = null; for (const h of halves) dropMesh(h.m); halves.length = 0 }
  fx.after(10, () => {
    key = new THREE.Group()
    const gold = basic(0xd7b45a)
    const shaft = new THREE.Mesh(new GEO.BoxGeometry(1.5, 0.14, 0.14), gold)
    key.add(shaft)
    const bow = new THREE.Mesh(filletRing(0.3, 0.09, 6, 10), gold)
    bow.rotation.x = Math.PI / 2           // filletRing lies in XZ; face it at camera
    bow.position.x = -0.85
    key.add(bow)
    for (let i = 0; i < 2; i++) {
      const tooth = new THREE.Mesh(new GEO.BoxGeometry(0.14, 0.3, 0.14), gold)
      tooth.position.set(0.55 + i * 0.22, -0.2, 0)
      key.add(tooth)
    }
    key.position.set(fx.self.pos.x + F * 0.1, fx.self.pos.y + 2.5, 0)
    key.rotation.z = 0.25
    if (!addFxMesh(fx, key)) key = null
    fx.sfx('coin', { pitch: 0.6 })
  })
  // SNAP.
  fx.after(28, () => {
    if (key) {
      const kx = key.position.x, ky = key.position.y
      dropMesh(key)
      key = null
      const gold = basic(0xd7b45a)
      for (const dir of [-1, 1]) {
        const m = new THREE.Mesh(new GEO.BoxGeometry(0.7, 0.14, 0.14), gold)
        m.position.set(kx + dir * 0.35, ky, 0)
        if (addFxMesh(fx, m)) halves.push({ m, vx: dir * 0.05, vy: 0.12, vr: dir * 0.2 })
      }
    }
    fx.sfx('break')
    fx.shake(0.25)
    fx.particles('sparks', v3(fx.self.pos.x, 2.4, 0), { n: 6 })
    fx.caption('...NOT YOUR COINS')
  })
  fx.frame(() => {
    try {
      for (const h of halves) {
        h.vy -= 0.012
        h.m.position.x += h.vx
        h.m.position.y = Math.max(0.08, h.m.position.y + h.vy)
        h.m.rotation.z += h.vr
      }
    } catch { /* never crash the clock */ }
  })
  // both fighters stare at the wreckage
  fx.after(36, () => { fx.zoom(fx.self, 0.6); fx.sfx('menu_back', { pitch: 0.5 }); fx.caption('...') })
  fx.after(54, () => {
    if (inRange(fx, 6)) {
      fx.hit({ damage: 1, knockback: { x: 1, y: 0.5 }, hitStun: 10 })
      fx.caption('SECONDHAND EMBARRASSMENT: 1 DMG')
      fx.sfx('menu_back', { pitch: 0.6 })
    }
  })
  fx.after(70, cleanup)
  fx.after(120, cleanup) // failsafe
  fx.after(84, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const CryptoPunkdDef = {
  id: 'crypto-punkd',
  name: "CRYPTO PUNK'D",
  title: 'The Glitched Detective',
  bio: 'A block-built gumshoe who right-click-saved himself out of a 10,000-piece collection and has been on the run from provenance ever since. Solves every crime on-chain. Commits roughly half of them. His body is non-fungible; his limbs disagree.',
  style: 'Technical trickster. Teleports, clones and detachable body pieces reward players who treat the fight like a corrupted save file. Fragile up close — keep the foe confused, indexed and pinned under paperwork.',
  stats: { power: 6, speed: 7, defense: 5, chaos: 8 },
  height: 1.85,
  weight: 1.0,
  walkSpeed: 4.6,
  dashSpeed: 9.5,
  jumpVel: 8.8,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'block-jab', name: 'Block Jab', kind: 'light',
      input: ['light'],
      damage: 5, startup: 4, active: 3, recovery: 11,
      hitbox: { w: 1.0, h: 0.7, d: 0.9, forward: 1.0, up: 1.35 },
      knockback: { x: 4.5, y: 1, spin: 0.3 },
      hitStun: 13, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'blockJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'pixel-kick', name: 'Pixel Kick', kind: 'kick',
      input: ['kick'],
      damage: 8, startup: 7, active: 4, recovery: 11,
      hitbox: { w: 1.1, h: 1.0, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 9.5, y: 2, spin: 0.4 },
      hitStun: 17, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'pixelKick', sfx: 'kick', script: null,
    },
    {
      id: 'magnifying-glass-strike', name: 'Magnifying-Glass Strike', kind: 'heavy',
      input: ['heavy'],
      damage: 13, startup: 10, active: 4, recovery: 19,
      hitbox: { w: 1.0, h: 0.9, d: 0.9, forward: 1.0, up: 1.3 },
      knockback: { x: 8.5, y: 3, spin: 0.8 },
      hitStun: 20, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'lensStrike', sfx: 'punch_heavy',
      script: lensStrikeScript,
    },
    {
      id: 'coat-spin', name: 'Coat Spin', kind: 'heavy',
      input: ['down', 'heavy'],
      damage: 10, startup: 9, active: 6, recovery: 21,
      hitbox: { w: 1.4, h: 1.2, d: 1.6, forward: 0.6, up: 1.0 },
      knockback: { x: 3, y: 9, spin: 1.4 },
      hitStun: 25, blockStun: 12, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'coatSpin', sfx: 'whoosh', script: null,
    },
    {
      id: 'glitch-dodge', name: 'Glitch Dodge', kind: 'kick',
      input: ['back', 'kick'],
      damage: 0, startup: 3, active: 6, recovery: 12,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'glitchDodge', sfx: 'menu_back',
      script: glitchDodgeScript,
    },
    {
      id: 'detached-hand-punch', name: 'Detached-Hand Punch', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 9, startup: 8, active: 12, recovery: 16,
      hitbox: { w: 0.8, h: 1.0, d: 0.8, forward: 2.0, up: 1.25 },
      knockback: { x: 2.5, y: 9.5, spin: 1.2 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'handPunch', sfx: 'whoosh',
      script: handPunchScript,
    },
    {
      id: 'clone-feint', name: 'Clone Feint', kind: 'heavy',
      input: ['forward', 'heavy'],
      damage: 4, startup: 10, active: 6, recovery: 26,
      hitbox: { w: 1.0, h: 1.2, d: 0.9, forward: 1.6, up: 1.0 },
      knockback: { x: 3.5, y: 1, spin: 0.4 },
      hitStun: 16, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'cloneFeint', sfx: 'menu_back',
      script: cloneFeintScript,
    },
    {
      id: 'pixel-projectile', name: 'Pixel Projectile', kind: 'kick',
      input: ['down', 'kick'],
      damage: 12, startup: 12, active: 20, recovery: 16,
      hitbox: { w: 0.6, h: 0.6, d: 0.6, forward: 2.5, up: 1.2 },
      knockback: { x: 2, y: 0.8, spin: 0.2 },
      hitStun: 10, blockStun: 6, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'pixelVolley', sfx: 'menu_confirm',
      script: pixelVolleyScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'chain-of-custody', name: 'Chain of Custody', kind: 'grab',
      input: ['grab'],
      damage: 12, startup: 8, active: 4, recovery: 42,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.1 },
      // cuffed, hoisted, slammed straight down
      knockback: { x: 4, y: 7, spin: 1.5 },
      hitStun: 32, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'chainCustody', sfx: 'grab', script: null,
    },
    {
      id: 'evidence-bag', name: 'Evidence Bag', kind: 'grab',
      input: ['down', 'grab'],
      damage: 10, startup: 10, active: 4, recovery: 46,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.2 },
      // head bagged, one full spin, tossed over the shoulder
      knockback: { x: 9, y: 6, spin: 3 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'evidenceBag', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'gas-fee', name: 'Gas Fee', kind: 'special',
      input: ['special'],
      damage: 12, startup: 9, active: 4, recovery: 25,
      hitbox: { w: 1.0, h: 1.1, d: 0.9, forward: 1.5, up: 1.2 },
      knockback: { x: 11, y: 4.5, spin: 1.5 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'rightClickSave', sfx: 'menu_confirm',
      script: gasFeeScript,
    },
    {
      id: 'right-click-save', name: 'Right-Click Save', kind: 'special',
      input: ['down', 'special'],
      damage: 19, startup: 10, active: 40, recovery: 22,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 1.2, up: 1.0 },
      knockback: { x: 6, y: 3, spin: 0.5 },
      hitStun: 18, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'rightClickSave', sfx: 'menu_confirm',
      script: rightClickSaveScript,
    },
    {
      id: 'missing-metadata', name: 'Missing Metadata', kind: 'special',
      input: ['forward', 'special'],
      damage: 9, startup: 12, active: 30, recovery: 24,
      hitbox: { w: 1.0, h: 1.4, d: 1.0, forward: 1.4, up: 1.0 },
      knockback: { x: 0.6, y: 0.3, spin: 0 },
      hitStun: 8, blockStun: 6, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'missingMetadata', sfx: 'menu_back',
      script: missingMetadataScript,
    },
    {
      id: 'blockchain-detective', name: 'Blockchain Detective', kind: 'special',
      input: ['back', 'special'],
      damage: 18, startup: 12, active: 60, recovery: 30,
      hitbox: { w: 1.2, h: 1.6, d: 1.0, forward: 1.5, up: 1.0 },
      knockback: { x: 6.5, y: 5, spin: 2 },
      hitStun: 30, blockStun: 14, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'blockchainDetective', sfx: 'menu_move',
      script: blockchainDetectiveScript,
    },
    {
      id: 'floor-price', name: 'Floor Price', kind: 'super',
      input: ['super'],
      damage: 30, startup: 14, active: 50, recovery: 32,
      hitbox: { w: 2.0, h: 2.0, d: 1.4, forward: 0.8, up: 1.2 },
      knockback: { x: 0.5, y: -3, spin: 0.4 },
      hitStun: 70, blockStun: 18, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 8,
      clip: 'floorPrice', sfx: 'bell',
      script: floorPriceScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'not-your-keys', name: 'Not Your Keys', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 16, active: 6, recovery: 62,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.2 },
      knockback: { x: 1, y: 0.5, spin: 0.2 },
      hitStun: 10, blockStun: 4, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'notYourKeys', sfx: 'menu_confirm',
      script: notYourKeysScript,
    },
  ],

  finisher: {
    id: 'permanently-punkd',
    name: "Permanently Punk'd",
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const foeX0 = () => (fx.foe ? fx.foe.pos.x : fx.self.pos.x + F * 2)
      fx.slowmo(0.45, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption("PERMANENTLY PUNK'D")
      fx.announcer('CASE CLOSED')
      fx.sfx('menu_back', { pitch: 0.5 })
      fx.shake(0.4)
      try { fx.self.playClip?.('punkd') } catch { /* clip optional */ }

      // everything the script must clean up, tracked for the failsafe
      const cubes = []          // pixel cluster {m, ox, oy, oz}
      const frames = []         // browser windows {g, broken}
      let bin = null
      let foeModel = null       // the hidden foe model group
      const cluster = { x: 0, y: 1.0, phase: 0 }
      const restoreFoe = () => { try { if (foeModel) { foeModel.visible = true; foeModel = null } } catch { /* mesh */ } }
      const cleanupMeshes = () => {
        for (const c of cubes) dropMesh(c.m)
        cubes.length = 0
        for (const f of frames) dropMesh(f.g)
        frames.length = 0
        dropMesh(bin)
        bin = null
      }

      // layout, clamped to the arena
      const startX = foeX0()
      const dragEnd = clampToArena(fx, startX + F * 7.4)
      const frameXs = [0.3, 0.55, 0.8].map((t) => clampToArena(fx, startX + F * 7.4 * t))
      const binX = dragEnd

      // freeze the foe in place
      fx.after(8, () => {
        fx.sfx('grab')
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 140 })
      })

      // browser-window frames + recycle bin materialize downrange
      fx.after(12, () => {
        for (const fxx of frameXs) {
          const g = new THREE.Group()
          const gray = basic(0xb8bcc8)
          const top = new THREE.Mesh(new GEO.BoxGeometry(0.14, 0.3, 2.0), basic(0x2050c8))
          top.position.y = 2.15
          g.add(top)
          const xBtn = new THREE.Mesh(new GEO.BoxGeometry(0.16, 0.2, 0.2), basic(0xd23c3c))
          xBtn.position.set(0.01, 2.15, 0.82)
          g.add(xBtn)
          for (const zz of [-0.95, 0.95]) {
            const side = new THREE.Mesh(new GEO.BoxGeometry(0.14, 2.1, 0.14), gray)
            side.position.set(0, 1.0, zz)
            g.add(side)
          }
          const bottom = new THREE.Mesh(new GEO.BoxGeometry(0.14, 0.14, 2.0), gray)
          bottom.position.y = 0.07
          g.add(bottom)
          g.position.x = fxx
          if (addFxMesh(fx, g)) frames.push({ g, broken: false })
        }
        bin = new THREE.Group()
        const binM = basic(0x3b6ea5)
        const body = new THREE.Mesh(new GEO.CylinderGeometry(0.85, 0.65, 1.7, 10), binM)
        body.position.y = 0.85
        bin.add(body)
        const rim = new THREE.Mesh(filletRing(0.85, 0.09, 6, 12), basic(0x2a5178))
        // no rotation: filletRing already lies in XZ, a ring around a +Y limb
        rim.position.y = 1.7
        bin.add(rim)
        // chunky recycle arrows
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2
          const arrow = new THREE.Mesh(new GEO.BoxGeometry(0.3, 0.12, 0.1), basic(0x2ee6ff))
          arrow.position.set(Math.cos(a) * 0.72, 0.95, Math.sin(a) * 0.72)
          arrow.rotation.y = -a + 0.7
          bin.add(arrow)
        }
        bin.position.x = binX
        if (!addFxMesh(fx, bin)) bin = null
        fx.sfx('thud')
      })

      // PIXELATION — foe model swaps for a low-res cube cluster
      fx.after(18, () => {
        fx.sfx('break')
        fx.sfx('menu_back', { pitch: 2.2 })
        fx.shake(0.6)
        cluster.x = foeX0()
        fx.particles('smoke', v3(cluster.x, 1.0, 0), { n: 12 })
        try {
          const hips = fx.foe.bones?.hips
          if (hips?.parent) { foeModel = hips.parent; foeModel.visible = false }
        } catch { /* foe stays visible; cubes still fly */ }
        const cols = [0x9fb6c9, 0x2ee6ff, 0x8b5cf6, 0x59637d, 0xd7b45a]
        for (let i = 0; i < 11; i++) {
          const s = 0.2 + Math.random() * 0.16
          const m = new THREE.Mesh(new GEO.BoxGeometry(s, s, s), basic(cols[i % cols.length]))
          const ox = (Math.random() - 0.5) * 0.7
          const oy = (Math.random() * 1.5) - 0.6
          const oz = (Math.random() - 0.5) * 0.5
          m.position.set(cluster.x + ox, 1.0 + oy, oz)
          if (addFxMesh(fx, m)) cubes.push({ m, ox, oy, oz })
        }
        fx.caption('RESOLUTION: 24x24')
      })

      // the drag: cluster hauled through all three browser windows into the bin
      fx.frame((age) => {
        try {
          if (age >= 24 && age < 66) {
            const t = (age - 24) / 42
            cluster.x = startX + (dragEnd - startX) * t
            cluster.y = 1.0 + Math.sin(age * 0.6) * 0.15
            for (const f of frames) {
              if (!f.broken && Math.abs(cluster.x - f.g.position.x) < 0.35) {
                f.broken = true
                fx.sfx('break')
                fx.shake(0.5)
                fx.particles('impact', v3(f.g.position.x, 1.4, 0), { n: 10 })
              }
              if (f.broken) {
                f.g.rotation.x += 0.12
                f.g.position.y -= 0.1
              }
            }
          } else if (age >= 66 && age < 76) {
            cluster.y = Math.max(0.9, cluster.y - 0.25) // dunked into the bin
            cluster.x = dragEnd
          } else if (age >= 76 && age < 112 && bin) {
            // the bin chews. violently.
            bin.position.x = binX + (Math.random() - 0.5) * 0.16
            bin.rotation.z = (Math.random() - 0.5) * 0.14
            cluster.y = 0.6
          } else if (age >= 112 && age < 122) {
            // SPIT: cluster rockets back toward the foe's actual position
            const t = (age - 112) / 10
            cluster.x = dragEnd + (foeX0() - dragEnd) * t
            cluster.y = 0.8 + Math.sin(t * Math.PI) * 2.2
            if (bin) { bin.rotation.z = -F * 0.5 * t; bin.position.x = binX }
          }
          for (const c of cubes) {
            c.m.position.set(cluster.x + c.ox, Math.max(0.12, cluster.y + c.oy), c.oz)
            c.m.rotation.x += 0.2
            c.m.rotation.y += 0.15
          }
        } catch { /* never crash the clock */ }
      })

      fx.after(66, () => { fx.sfx('thud'); fx.shake(0.5); fx.caption('MOVING TO RECYCLE BIN...') })
      for (let i = 0; i < 5; i++) {
        fx.after(78 + i * 7, () => { fx.sfx('menu_back', { pitch: 0.6 + i * 0.3 }); fx.shake(0.25) })
      }
      fx.after(104, () => fx.caption('EMPTYING RECYCLE BIN...'))

      // THE VIOLENT EJECTION = the KO ragdoll
      fx.after(112, () => {
        fx.sfx('explosion')
        fx.shake(1.3)
        fx.slowmo(0.3, 0.9)
        fx.zoom(fx.foe, 1.0)
        fx.particles('explosion', v3(binX, 1.5, 0), { n: 30 })
      })
      fx.after(122, () => {
        for (const c of cubes) dropMesh(c.m)
        cubes.length = 0
        restoreFoe()
        fx.particles('smoke', v3(foeX0(), 1.2, 0), { n: 10 })
        fx.hit({ damage: 25, knockback: { x: 14, y: 8, spin: 3 }, hitStun: 60, ragdoll: 2 })
        try { fx.ragdoll(fx.foe, [-F * 13, 9, 0]) } catch { /* engine handles KO */ }
        fx.sfx('ko')
        fx.coins(v3(foeX0(), 1.6, 0), 16)
        fx.caption('FILE DELETED PERMANENTLY')
        fx.announcer("PERMANENTLY PUNK'D")
      })

      fx.after(136, () => { cleanupMeshes() })
      fx.after(150, end)
      // failsafes: the foe model ALWAYS comes back, meshes never linger
      fx.after(170, () => { restoreFoe(); cleanupMeshes() })
    },
  },

  voice: { pitch: 0.9, rate: 1.0 },
}
