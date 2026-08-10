// PEEPEE — The Swamp Speculator.
// Fully self-contained CharacterDef per CONTRACTS.md §4 (rig, clips, moves).
//
// VISUAL BUILD: docs/parody/peepee.md + GRAPHICS_CONTRACT.md §0/§4/§9/§12.
// A squat bullfrog-family amphibian, 5.00 head-units tall, whose two hemispherical
// eye domes sit ON a genuinely flat cranial plate and are the highest AND frontmost
// features on the model. Cheap ill-fitting collared blue shirt, absurd gold tie.
//
// Surfacing: every region asks src/render for a real PBR preset (`skin-wet`,
// `skin`, `denim`, `metal-painted`, `gold`, `suit`, `plastic`, `plastic-gloss`,
// `leather`, `glass`) so the normal / roughness / AO maps from textures.js do
// the micro-detail work.
//
// ROUND 3 — the four things a hostile review found, and where each is fixed:
//   1. "no pupil renders in either eye" (FATAL). Three stacked gloss layers
//      veiled it. Fixed in makeMaterials()/buildEye(): the cornea shell is
//      deleted, the pupil moved to a preset with no clearcoat at all, the
//      sclera's clearcoat and envMapIntensity cut. Darkest albedo on the model
//      is now sRGB 32 and it is the pupil; lightest is 237 and it is the sclera.
//   2. "no form-describing specular lobe anywhere; the mandated clearcoat 0.60
//      is invisible on the skull." resolvePreset() walks to a `*-flat` fallback
//      on non-physical tiers and applySurface() then drops any clearcoat
//      override. mk() in makeMaterials() re-asserts the physical block, so the
//      wet lobe is now tier-independent — verified at physical:false.
//   3. "one directional streak texture reused across skin, shirt and tie."
//      True: `cloth` and `silk` both map to `cloth-weave`. Three genuinely
//      different map kinds now — skin-amphibian / skin-smooth / denim /
//      metal-painted / gold.
//   4. "six joints are naked spheres with hard silhouette steps." Every joint
//      mass is now within 7-11 % of the limbs it connects (see the block above
//      buildLeg) and ovoid rather than spherical.
// Albedo is authored as VERTEX COLOUR (dorsal mottle, fingered ventral
// transition, lit up-planes, lip roll, cloth seam AO) rather than painted into a
// texture — see paintSkin(). That keeps the §5 colour script landing on its exact
// L* values and keeps the whole body on ONE material / a handful of draw calls.
import * as THREE from 'three'
import { makeMaterialFactory, pbr } from '../render/index.js'
import {
  roundedBox, skirt, sleeve, superellipsoid, loft, profileLathe,
  splineTube, ball, filletRing, lens, roundedCylinder, roundedCone,
  superellipsePoints, plate,
} from '../render/geometry.js'

// dev escape hatch: PEEPEE_NOMERGE=1 keeps every part a separate named mesh so
// a bounds/triangle audit can name what it is looking at.
const DEBUG_NO_MERGE = typeof process !== 'undefined' && process.env && process.env.PEEPEE_NOMERGE === '1'

// ---------------------------------------------------------------------------
// palette — docs/parody/peepee.md §5. Every value inside the contract's
// 30..240 sRGB albedo window; sclera is the lightest, pupil the darkest, and
// that maximum-contrast pair sits at the top of the silhouette on purpose.
// ---------------------------------------------------------------------------
const C = {
  dorsal: 0x6da843,      // L*63 olive — the character's mid-tone
  dorsalLit: 0x8fc65a,   // L*74 up-facing planes
  mottle: 0x456f2c,      // L*42 dorsal spots
  crevice: 0x27401d,     // L*24 AO tint
  ventral: 0xdce3ae,     // L*88 belly / throat / palms
  lipRose: 0xb2695f,     // L*53 dusty brick-rose
  lipRoll: 0xce8c80,     // top 30° of each lip tube
  // ROUND 3: the lid used to be C.dorsal, so it merged with the skull and the
  // eye read as "green beret over a white chin-strap" — the inverse of the
  // source, whose read is a big WHITE oval with a thin lid line. A half-step
  // darker AND warmer separates the lid from the cranial plate behind it.
  lid: 0x5f8a3e,
  sclera: 0xeceee0,      // L*93 LIGHTEST
  pupil: 0x1e2026,       // L*12 DARKEST
  iris: 0xc89230,        // gold-amber annulus
  shirtBlue: 0x4e74b8,   // L*49 — 14 L* under the skin
  shirtShadow: 0x33507e,
  shirtButton: 0xe4e7de,
  tieGold: 0xe8b93a,     // the ONLY high-chroma element
  tieGoldDark: 0xa87e1c,
  oral: 0x3a1e22,
  tongue: 0xd97a82,
  tympanum: 0x5c8c3c,
  jacketAlt: 0x46266b,   // costume 1 purple
  hatBand: 0x2a2a30,
  slime: 0x7fd45a,
  // ROUND 3: the finger/toe discs were painted at full C.ventral (L*88) and
  // came second only to the sclera, so at 1 m the eye went to the HANDS — §1
  // forbids that explicitly. Discs now sit a full 12 L* under the ventral cream
  // and 5 under the belly, so they read as pale skin, not as lamps.
  disc: 0xb8c48a,
  hemShadow: 0x2b4570,   // the shirt hem's underside + its cast band on the belly
  // aliases kept for the move scripts further down this file
  frog: 0x6da843,
  eyeWhite: 0xeceee0,
}

// ---------------------------------------------------------------------------
// scene-graph helpers
// ---------------------------------------------------------------------------
function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.userData.isBone = true // mergeStatic() must never bake across one of these
  parent.add(g)
  return g
}

// static wrapper: bakes a base rotation between an animated bone and its meshes,
// so every animated bone starts at rotation (0,0,0) = bind pose.
function bent(parent, rz = 0, rx = 0, ry = 0) {
  const g = new THREE.Group()
  g.rotation.set(rx, ry, rz)
  parent.add(g)
  return g
}

function put(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  parent.add(m)
  return m
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
// a cheap domed disc — iris, pupil, button, nare inset, tympanum, webbing
const disc = (rx, ry, th, crown = 0, seg = 12) =>
  lens(rx, ry, th, { crown, seg, faceSeg: 1, rimSeg: 1, e: 2.4, unique: true })
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t) }
// loft() cross-sections are (a, b) -> (world z, world x). Offsetting a section
// with `at:[x,y,z]` tilts the swept FRAME and rolls the ring ~90deg, so every
// loft here keeps a dead-vertical path and bakes the offset into the ring.
const shiftRing = (pts, dx = 0, dz = 0) => {
  const o = pts.slice()
  for (let i = 0; i < o.length; i += 2) { o[i] += dz; o[i + 1] += dx }
  return o
}

// ---------------------------------------------------------------------------
// vertex-colour painting — this is where the albedo lives (see file header)
//
// One deterministic value-noise field drives BOTH the dorsal mottle and the
// fingered dorsal/ventral transition, so the two agree; matching the macro
// albedo to the surface is the cheapest way to stop a stylised skin reading as
// plastic. Every geometry that reaches a material gets a `color` attribute, so
// mergeStatic() can bucket them without an attribute mismatch.
// ---------------------------------------------------------------------------
function h1(n) { const s = Math.sin(n) * 43758.5453123; return s - Math.floor(s) }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  const n = (i, j, k) => h1(i * 157.31 + j * 311.7 + k * 74.77 + 13.1)
  const L = (a, b, t) => a + (b - a) * t
  const c00 = L(n(xi, yi, zi), n(xi + 1, yi, zi), u)
  const c10 = L(n(xi, yi + 1, zi), n(xi + 1, yi + 1, zi), u)
  const c01 = L(n(xi, yi, zi + 1), n(xi + 1, yi, zi + 1), u)
  const c11 = L(n(xi, yi + 1, zi + 1), n(xi + 1, yi + 1, zi + 1), u)
  return L(L(c00, c10, v), L(c01, c11, v), w)
}
function fbm(x, y, z, oct = 3) {
  let a = 0.5, f = 1, s = 0, tot = 0
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); tot += a; a *= 0.5; f *= 2.1 }
  return s / tot
}

const _c = new THREE.Color()
function lin(hex) { _c.setHex(hex); return [_c.r, _c.g, _c.b] }
// GRAPHICS_CONTRACT §0 style guardrail: albedo never below 30 or above 240
// sRGB. Vertex colour bypasses pbr()'s guardAlbedo(), so clamp it here.
const ALB_LO = 0.01298, ALB_HI = 0.87137
const gA = (v) => (v < ALB_LO ? ALB_LO : v > ALB_HI ? ALB_HI : v)

/**
 * paintSkin(geo, origin, opts) — writes a `color` attribute.
 *   origin  [x,y,z] the mesh's position inside the fighter, so the noise field
 *           is continuous across parts instead of restarting per mesh.
 *   opts.vent(x,y,z,nx,ny,nz) -> signed ventral bias (>0 = cream side)
 *   opts.mottle / opts.lit / opts.crev  strengths (0 disables)
 */
function paintSkin(geo, origin = [0, 0, 0], opts = {}) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal')
  if (!pos) return geo
  const n = pos.count
  const col = new Float32Array(n * 3)
  const DOR = lin(opts.base ?? C.dorsal), LIT = lin(C.dorsalLit)
  const MOT = lin(C.mottle), VEN = lin(opts.ventral ?? C.ventral), CRV = lin(C.crevice)
  const vent = opts.vent || null
  const mottleK = opts.mottle ?? 1, litK = opts.lit ?? 1, crevK = opts.crev ?? 1
  const [ox, oy, oz] = origin
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i) + oz
    const nx = nrm ? nrm.getX(i) : 0, ny = nrm ? nrm.getY(i) : 1, nz = nrm ? nrm.getZ(i) : 0
    let r = DOR[0], g = DOR[1], b = DOR[2]
    // 1. lit up-facing planes (cranial plate, shoulders, thigh tops)
    if (litK > 0 && ny > 0.30) {
      const t = smooth(0.30, 0.95, ny) * 0.42 * litK
      r += (LIT[0] - r) * t; g += (LIT[1] - g) * t; b += (LIT[2] - b) * t
    }
    // 2. dorsal mottle — 30-70 mm blobs, ~18 % coverage, soft edges. TWO bands:
    //    the 59 mm macro blobs §6 asks for, plus a 26 mm speckle at a third of
    //    the strength. Round 3's "at 30 cm the skin has nothing on it but streak
    //    noise" was partly the aliasing fixed at the loft, partly this: one
    //    single-frequency band gives a viewer nothing to focus on up close.
    if (mottleK > 0) {
      const m = fbm(x * 17 + 3.1, y * 17 - 1.7, z * 17 + 5.3, 3)
      let t = smooth(0.535, 0.645, m) * 0.92 * mottleK
      const m2 = fbm(x * 38 - 6.2, y * 38 + 2.9, z * 38 - 1.4, 2)
      t += smooth(0.575, 0.700, m2) * 0.30 * mottleK * (1 - t)
      if (t > 0) { r += (MOT[0] - r) * t; g += (MOT[1] - g) * t; b += (MOT[2] - b) * t }
    }
    // 3. crevice darkening on down-facing micro-planes (armpits, digit splits)
    if (crevK > 0 && ny < -0.55) {
      const t = smooth(-0.55, -1.0, ny) * 0.30 * crevK
      r += (CRV[0] - r) * t; g += (CRV[1] - g) * t; b += (CRV[2] - b) * t
    }
    // 4. ventral cream, with 4-8 irregular tongues per side fingering upward
    if (vent) {
      const fing = (fbm(x * 8.5 - 2.2, y * 5.5 + 7.4, z * 8.5 - 4.8, 2) - 0.5) * 0.62
      const t = smooth(0.0, 0.34, vent(x, y, z, nx, ny, nz) + fing)
      if (t > 0) { r += (VEN[0] - r) * t; g += (VEN[1] - g) * t; b += (VEN[2] - b) * t }
    }
    // 5. fine albedo grain so nothing is a single unbroken value
    const grain = 0.955 + fbm(x * 90, y * 90, z * 90, 2) * 0.09
    col[i * 3] = gA(r * grain); col[i * 3 + 1] = gA(g * grain); col[i * 3 + 2] = gA(b * grain)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.userData.bevelled = true // authored by this toolkit: autoBevelScene() must not re-tessellate it
  return geo
}

/** Flat vertex colour — keeps every geometry attribute-compatible for merging. */
function tint(geo, hex, opts = {}) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal')
  if (!pos) return geo
  const n = pos.count, col = new Float32Array(n * 3)
  const A = lin(hex), B = opts.roll !== undefined ? lin(opts.roll) : null
  const shade = opts.shade !== undefined ? lin(opts.shade) : null
  for (let i = 0; i < n; i++) {
    let r = A[0], g = A[1], b = A[2]
    const ny = nrm ? nrm.getY(i) : 1
    if (B && ny > 0.42) { const t = smooth(0.42, 0.95, ny) * 0.9; r += (B[0] - r) * t; g += (B[1] - g) * t; b += (B[2] - b) * t }
    if (shade && ny < -0.30) { const t = smooth(-0.30, -0.95, ny) * 0.55; r += (shade[0] - r) * t; g += (shade[1] - g) * t; b += (shade[2] - b) * t }
    if (opts.grain !== 0) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const gr = 0.965 + fbm(x * 70, y * 70, z * 70, 2) * 0.07
      r *= gr; g *= gr; b *= gr
    }
    // §6: faint radial veining on the sclera, albedo only, ~4 % contrast. Any
    // stronger and the eye reads as bloodshot rather than as a wet membrane.
    if (opts.veins) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const v = Math.abs(fbm(x * 46, y * 46, z * 46, 2) - 0.5) * 2
      const t = (1 - smooth(0.18, 0.62, v)) * 0.045 * smooth(0.0, 0.35, Math.hypot(y, z))
      r *= 1 - t * 0.15; g *= 1 - t * 0.72; b *= 1 - t * 0.66
    }
    col[i * 3] = gA(r); col[i * 3 + 1] = gA(g); col[i * 3 + 2] = gA(b)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.userData.bevelled = true
  return geo
}

// ---------------------------------------------------------------------------
// materials — a per-BUILD scoped factory.
//
// Not a module-level one: Fighter.flash() mutates .emissive on every material a
// fighter owns, so a mirror match sharing one cache would flash BOTH peepees.
// Scoped + per-call = each fighter owns ~14 mutable materials, textures stay in
// the global cache (they are shared and free), and Fighter's dispose walk can
// free them safely (README §5).
//
// `map: null` everywhere is deliberate: albedo is authored per-vertex above, so
// the presets contribute normal + roughness + AO only. That is where the detail
// belongs (contract §0.1) and it keeps §5's colour script exact.
// ---------------------------------------------------------------------------
function makeMaterials() {
  const M = makeMaterialFactory({ scope: 'peepee' })
  const base = { vertexColors: true, map: null, guardAlbedo: false }
  // ROUND 3 — WHY THE MANDATED CLEARCOAT WAS INVISIBLE ON THE SKULL.
  // resolvePreset() (materials.js:850) walks a preset's `fallback` chain
  // whenever the quality tier has `physical` off, so `skin-wet` silently
  // becomes `skin-wet-flat` — and applySurface() then guards every physical
  // parameter behind `if (def.clearcoat !== undefined)`. The flat fallback
  // declares none, so OUR clearcoat override was dropped on the floor and the
  // §6 "thin wet film over a matte substrate" double-specular never rendered:
  // the head came out as one Lambert value, which is exactly what the critic
  // measured. Passing `clearcoat` in overrides still forces a
  // MeshPhysicalMaterial (materials.js:1077), so the ONLY thing missing is the
  // assignment. These are scope-private per-build materials, so re-asserting
  // the physical block here is safe (README §5) and it makes the wet lobe
  // tier-independent.
  const mk = (preset, ov = {}) => {
    const m = M.pbr(0xffffff, preset, { ...base, ...ov })
    if (m.isMeshPhysicalMaterial) {
      if (ov.clearcoat !== undefined) {
        m.clearcoat = ov.clearcoat
        m.clearcoatRoughness = ov.clearcoatRoughness ?? 0.15
      }
      if (ov.sheen !== undefined) {
        m.sheen = ov.sheen
        m.sheenRoughness = ov.sheenRoughness ?? 0.5
        m.sheenColor.copy(m.color).lerp(new THREE.Color(1, 1, 1), 0.7)
      }
      if (ov.ior !== undefined) m.ior = ov.ior
    }
    return m
  }
  return {
    factory: M,
    // amphibian skin: matte porous substrate + a clearcoat mucous film. The
    // double specular is what the eye reads as "amphibian".
    // ROUND 2 note: the critic's "one substrate, four albedos" read came from
    // every skin region sharing one map SCALE. The four skin materials below now
    // sit two octaves apart (3.2 dorsal pore field / 1.1 thin translucent
    // ventral / 8 taut drum / smooth) and their clearcoat lobes differ, so a
    // 30 cm zoom shows four surfaces, not four paints.
    // --- 1. AMPHIBIAN SKIN: kind `skin-amphibian`, a coarse worley pore field.
    // Matte porous substrate (roughness ~0.38 spatially varying) under the §6
    // mucous clearcoat at 0.60/0.12. That double lobe is the read.
    skin: mk('skin-wet', { name: 'peepee/skin', mapOpts: { scale: 3.2, wear: 0.2, repeat: [2.4, 2.4] }, roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.12, ior: 1.4 }),
    // --- 2. VENTRAL / SAC / LIP / DRUM / ORAL / WEB: kind `skin-smooth`, a
    // DIFFERENT field entirely — fine and non-directional against the dorsum's
    // coarse cells. Wetter (mucous pools in the low spots, §6.2), much smoother.
    // These six differ only by `mapOpts.repeat`, never by `mapOpts.scale`:
    // repeat is per-part texel density and costs one upload, scale regenerates
    // the whole noise field (README §7). Round 3 authored six scales here and
    // spent 44 MB of an 80 MB scene budget on ONE fighter; one field driven at
    // six densities looks the same on screen and costs 23.5 MB. The tympanum's
    // 7.5x density against the lip's 3.4x and the sac's 1.05x is exactly the
    // "taut drum vs slack throat" separation §3.5 asks for.
    ventral: mk('skin', { name: 'peepee/ventral', mapOpts: { repeat: [1.5, 1.5] }, clearcoat: 0.85, clearcoatRoughness: 0.10, roughness: 0.62 }),
    // thinnest, most translucent skin on the body — its own scale again
    sac: mk('skin', { name: 'peepee/sac', mapOpts: { repeat: [1.05, 1.05] }, clearcoat: 0.9, clearcoatRoughness: 0.08, roughness: 0.5 }),
    // the tympanum is a TAUT DRUM: same kind as the ventral but eight times the
    // frequency and half the roughness, so it separates from the cheek it sits
    // on by specular response and not merely by tint (§3.5).
    tympanum: mk('skin', { name: 'peepee/tympanum', mapOpts: { repeat: [7.5, 7.5] }, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.09 }),
    lip: mk('skin', { name: 'peepee/lip', mapOpts: { repeat: [3.4, 3.4] }, roughness: 0.42, clearcoat: 0.85, clearcoatRoughness: 0.07 }),
    // --- THE EYE STACK -------------------------------------------------------
    // ROUND 3 FATAL: the pupil geometry existed and composited INVISIBLE. Three
    // gloss layers stacked over it — eyeInk at clearcoat 0.85 / roughness 0.14,
    // a full-cap cornea shell at clearcoat 1.0 / roughness 0.05 / opacity 0.14,
    // and a sclera at clearcoat 0.5 / roughness 0.10 — in a blown-out arena.
    // The measured darkest pixel inside the right eye was sRGB 185 against a
    // specified 30. Specular veiling, not geometry. So:
    //   * the cornea shell is DELETED outright (see buildEye). The §6 wet lobe
    //     now comes from the sclera's own modest clearcoat plus ONE small
    //     authored catchlight patch, which is cheaper and cannot veil anything.
    //   * the pupil moves to `plastic` — a preset with NO clearcoat at all, so
    //     ov.clearcoat is never asserted and applySurface leaves it at 0 — at
    //     roughness 0.62 and envMapIntensity 0.22. It holds its albedo.
    //   * the sclera drops from clearcoat 0.50/rough 0.10 to 0.28/0.30 with
    //     envMapIntensity 0.5, so it stops clipping to 255 over its upper-left
    //     quadrant and the sphere's form survives.
    sclera: mk('skin', { name: 'peepee/sclera', noMaps: true, roughness: 0.3, clearcoat: 0.28, clearcoatRoughness: 0.16, envMapIntensity: 0.5 }),
    pupil: mk('plastic', { name: 'peepee/pupil', noMaps: true, roughness: 0.62, envMapIntensity: 0.22 }),
    iris: mk('plastic', { name: 'peepee/iris', noMaps: true, roughness: 0.4, envMapIntensity: 0.6 }),
    // the ONE deliberate specular on the eye: small, hard, off-centre, and the
    // only thing in the stack allowed to be bright.
    spec: mk('plastic-gloss', { name: 'peepee/catchlight', noMaps: true, roughness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.04, envMapIntensity: 1.3 }),
    nictitating: mk('skin', { name: 'peepee/nictitating', noMaps: true, transparent: true, opacity: 0.34, depthWrite: false, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.06 }),
    oral: mk('skin', { name: 'peepee/oral', mapOpts: { repeat: [2.2, 2.2] }, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    // toe webbing — §6.4's backlit membrane. ROUND 3: at opacity 0.72 it read
    // as a stroked dashed outline between the toes rather than as a membrane,
    // so it is now essentially OPAQUE (0.95) and simply thin and pale.
    web: mk('skin', { name: 'peepee/web', mapOpts: { repeat: [1.4, 1.4] }, transparent: true, opacity: 0.95, roughness: 0.6, clearcoat: 0.8, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    // --- 3. THE SHIRT: kind `denim`. ROUND 3 — the shirt was `cloth`, whose
    // kind is `cloth-weave`, and so was the tie (`silk` ALSO maps to
    // cloth-weave). One streak field under three tints is why blind material
    // identification failed. A chambray work shirt is a genuinely different
    // weave: tighter, twill-diagonal, matte, no gloss anywhere, and it is also
    // a further step away from the source's plain jersey tee (§9.5).
    // DoubleSide: the collar gape and the strain slot show the inside.
    cloth: mk('denim', { name: 'peepee/shirt', mapOpts: { repeat: [3.2, 3.2] }, sheen: 0.16, sheenRoughness: 0.85, side: THREE.DoubleSide }),
    button: mk('plastic-gloss', { name: 'peepee/button', noMaps: true, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.12 }),
    // --- 4. THE TIE: kind `metal-painted`. ROUND 3 — it was `silk`, i.e.
    // cloth-weave, i.e. the SAME map field as the shirt with a gold tint on it,
    // which is precisely why the critic could name two materials and not three.
    // metal-painted is a lacquered-flake field: no weave streak, a rolled-plate
    // roughness break, and a clearcoat lobe. Half-metal (0.45) so it is cheap
    // lamé rather than bullion, and dielectric enough that it never renders
    // black when an arena forgets its environment map. 0.38 authored x 0.85 =
    // roughness 0.32, exactly §6.
    gold: mk('metal-painted', { name: 'peepee/tie', mapOpts: { repeat: [2.2, 2.2] }, metalness: 0.45, roughness: 0.85, clearcoat: 0.3, clearcoatRoughness: 0.14, envMapIntensity: 1.35, emissive: 0x241a06 }),
    // real metal, for the ONE-CENTIMETRE trim only (glint, monocle rim, pin) —
    // a third distinct field again, and the only true metal on the character.
    metal: mk('gold', { name: 'peepee/goldTrim', mapOpts: { repeat: [4, 4] }, roughness: 2.6, emissive: 0x1a1304 }),
    suit: mk('suit', { name: 'peepee/suit', mapOpts: { repeat: [3, 3] }, side: THREE.DoubleSide }),
    leather: mk('leather', { name: 'peepee/band', mapOpts: { repeat: [4, 4] } }),
    glass: mk('glass', { name: 'peepee/lens', transmission: 0.92, thickness: 0.02, roughness: 0.6 }),
  }
}
// ---------------------------------------------------------------------------
// THE SKULL — docs/parody/peepee.md §3.1.
//
// One rounded mass, no snout block, built as a lofted stack of rings so the
// bevels can be non-uniform where the character actually lives: 0.080 crown
// roll (which is what DERIVES the 0.460-wide flat cranial plate), 0.045 vertical
// corners, a crisp 0.020 jawline, and a face plane crowned on a 1.75 m radius so
// the mouth corners wrap instead of dying on a flat wall.
//
// Head-local: world = (0.050 + x, 1.180 + y, z).
//   front face +0.200 · occiput -0.240 · plate +0.240 (world 1.420) · chin -0.060
// ---------------------------------------------------------------------------
const SAG_R = 1.75
const sag = (z) => SAG_R - Math.sqrt(Math.max(0, SAG_R * SAG_R - z * z))
// The crown roll-off completes at y = 0.226, NOT at the plate height 0.240, so
// the top 0.014 of the skull is a dead-vertical band closed by a dead-flat cap.
// That is what makes the cranial plate genuinely 0° from horizontal across the
// full 0.460 x 0.280 (§3.1) instead of doming over into a gecko occiput — the
// single most common way to lose this likeness.
const PLATE_Y = 0.226
function topInset(y) {
  if (y <= 0.146) return 0
  const t = Math.min(1, (y - 0.146) / (PLATE_Y - 0.146))
  return 0.080 * (1 - Math.sqrt(Math.max(0, 1 - t * t)))
}
function jawInset(y) {
  if (y >= -0.040) return 0
  const t = Math.min(1, (-0.040 - y) / 0.020)
  return 0.020 * (1 - Math.sqrt(Math.max(0, 1 - t * t)))
}
// Sub-mouth taper -> 0.260 at the chin. It starts 0.020 lower than round 1
// (y 0.010 rather than 0.030) and ramps over 0.078 instead of 0.090, so it
// still lands on the specified 0.260 chin width at y -0.068 while leaving real
// cheek under the mouth corners at |z| 0.250 — the mouth had to drop 0.016 to
// open the under-eye shelf, and on the old curve its corners flew off the jaw.
// ROUND 3: "the mouth runs the full head width — negative space #3 does not
// exist." True, and the cause was here rather than in the mouth curve. The
// taper began at y +0.010 and ran over 0.078, so by the corner height the cheek
// had already narrowed to |z| 0.286 against a corner at 0.250 — a 0.036 pocket
// where §2 asks for 0.060. The ramp now starts BELOW the corner (y -0.010) and
// runs over 0.062, so the cheek is still full width at the mouth corner and
// still lands on the specified 0.260 chin width at y -0.072.
function skullHalfW(y) {
  if (y >= -0.010) return 0.310
  const t = clamp01((-0.010 - y) / 0.062)
  return 0.310 - 0.178 * (t * t * (3 - 2 * t))
}
const skullFrontX = (y) => (y >= 0.030 ? 0.200 : 0.200 - (0.030 - y) * 0.1556) - topInset(y)
const skullBackX = (y) => -0.240 + topInset(y) + Math.max(0, -y) * 0.6
const faceX = (y, z) => skullFrontX(y) - sag(z)

/** One cross-section of the skull, in loft space: point pairs (z, x). */
function skullRing(y, shrink = 1) {
  const ji = jawInset(y)
  const hw = Math.max(0.02, (skullHalfW(y) - ji) * shrink)
  const fx = skullFrontX(y) - ji * 0.35
  const bx = skullBackX(y) + ji * 0.5
  const rf = Math.min(0.045, hw * 0.45, (fx - bx) * 0.3)
  const rr = Math.min(0.055, hw * 0.45, (fx - bx) * 0.3)
  const NF = 8, NC = 5, NS = 6, NB = 5
  const half = []
  const front = (z) => fx - sag(z)
  for (let j = 0; j <= NF; j++) { const z = (hw - rf) * (j / NF); half.push(z, front(z)) }
  const cz = hw - rf, cx = front(cz) - rf
  for (let k = 1; k <= NC; k++) { const a = (k / NC) * Math.PI * 0.5; half.push(cz + rf * Math.sin(a), cx + rf * Math.cos(a)) }
  for (let m = 1; m <= NS; m++) half.push(hw, cx + (bx + rr - cx) * (m / NS))
  for (let k = 1; k <= NC; k++) { const a = (k / NC) * Math.PI * 0.5; half.push((hw - rr) + rr * Math.cos(a), (bx + rr) - rr * Math.sin(a)) }
  for (let m = 1; m <= NB; m++) half.push((hw - rr) * (1 - m / NB), bx)
  const pts = half.slice()
  for (let i = half.length / 2 - 2; i >= 1; i--) pts.push(-half[i * 2], half[i * 2 + 1])
  return pts
}

const HEAD_Y = [-0.068, -0.060, -0.050, -0.034, -0.012, 0.014, 0.040, 0.075,
  0.115, 0.150, 0.180, 0.205, 0.219, 0.226, 0.233, 0.240]

/** Signed "am I outside the skull" field — drives the eye-collar sweep. */
function skullOutside(p) {
  return Math.max(p[0] - faceX(p[1], p[2]), p[1] - 0.240, Math.abs(p[2]) - skullHalfW(p[1]))
}

/**
 * The eye/skull intersection is a CLOSED 3D CURVE, not a planar circle: the dome
 * sits on the front-top corner and crosses the crowned face plane, the crown
 * fillet AND the cranial plate. A flat torus laid across it floats up to 0.030
 * off the surface — a ring of skin hanging in mid-air. So sweep the real curve.
 */
function collarCurve(ex, ey, ez, r, zs, n = 40) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2
    const ct = Math.cos(th), st = Math.sin(th)
    const P = (a) => [ex + r * Math.cos(a), ey + r * Math.sin(a) * ct, ez + r * Math.sin(a) * st * zs]
    let lo = 0.02, hi = Math.PI * 0.98
    for (let k = 0; k < 22; k++) { const m = (lo + hi) * 0.5; if (skullOutside(P(m)) > 0) lo = m; else hi = m }
    pts.push(P((lo + hi) * 0.5))
  }
  return pts
}

/** A spherical shell segment: lids, nictitating membrane, cornea. Axis = +Y. */
function shellLathe(rOut, rIn, a0, a1, seg = 18, prof = 4) {
  const pts = []
  for (let i = 0; i <= prof; i++) { const a = a0 + (a1 - a0) * (i / prof); pts.push(Math.sin(a) * rOut, Math.cos(a) * rOut) }
  for (let i = prof; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / prof); pts.push(Math.sin(a) * rIn, Math.cos(a) * rIn) }
  if (a0 > 1e-4) pts.push(Math.sin(a0) * rOut, Math.cos(a0) * rOut)
  return profileLathe(pts, seg, { creaseAngle: 30, unique: true })
}

/**
 * eyePatch(R, hz, hy, dr, opts) — an elliptical patch CONFORMED to the eye
 * ellipsoid, facing +X. This is the fix for round 1's single worst artefact:
 * the iris and pupil were extruded `lens()` discs, so they stood proud of the
 * sclera as faceted cones with a visible apex. A patch has zero silhouette of
 * its own — it is the sclera surface, repainted.
 *
 *   R    the dome radius for THIS eye (never the other one's — §3.2)
 *   hz   tangential half-width  (world +Z on the dome)
 *   hy   tangential half-height (world +Y on the dome)
 *   dr   radial standoff above the sclera (layering, not thickness)
 *   opts.inner  0..1 -> an ANNULUS (the iris rim around the pupil)
 *
 * The 0.96 Z squash of the dome is baked in here, so the patch tracks the
 * ellipsoid instead of floating off it at the outboard edge.
 */
function eyePatch(R, hz, hy, dr, opts = {}) {
  const seg = opts.seg ?? 30
  const rings = opts.rings ?? (opts.inner ? 2 : 4)
  const r0 = opts.inner ?? 0
  const RR = R + dr
  const P = [], N = [], U = [], IDX = []
  const push = (p, q) => {
    let dx = R, dy = hy * q, dz = hz * p
    const l = Math.hypot(dx, dy, dz)
    dx /= l; dy /= l; dz /= l
    P.push(RR * dx, RR * dy, RR * dz * 0.96)
    N.push(dx, dy, dz * 1.0417)
    U.push(0.5 + p * 0.5, 0.5 + q * 0.5)
  }
  let base = 0
  if (r0 <= 1e-6) { push(0, 0); base = 1 }
  const rowStart = []
  for (let i = 0; i <= rings; i++) {
    const rad = r0 + (1 - r0) * ((i + (r0 > 0 ? 0 : 1)) / (rings + (r0 > 0 ? 0 : 1)))
    rowStart.push(P.length / 3)
    for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; push(Math.cos(a) * rad, Math.sin(a) * rad) }
  }
  if (base === 1) {
    const r = rowStart[0]
    for (let j = 0; j < seg; j++) IDX.push(0, r + j, r + (j + 1) % seg)
  }
  for (let i = 0; i < rowStart.length - 1; i++) {
    const a = rowStart[i], b = rowStart[i + 1]
    for (let j = 0; j < seg; j++) {
      const k = (j + 1) % seg
      IDX.push(a + j, b + j, b + k, a + j, b + k, a + k)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.setIndex(IDX)
  g.computeBoundingSphere(); g.computeBoundingBox()
  return g
}

/**
 * lidShell(rIn, rOut, a0, a1, bevel, seg) — a lid with a real rolled leading
 * edge. shellLathe() ended in a razor-cut annulus; §3.2 wants a 0.012 rim with
 * a 0.004 bevel on the leading edge, because that bevel is the character's only
 * eyebrow and it is what the rim light catches as a bright arc.
 */
function lidShell(rIn, rOut, a0, a1, bevel = 0.004, seg = 22) {
  const pts = []
  const prof = 6
  for (let i = 0; i <= prof; i++) { const a = a0 + (a1 - a0) * (i / prof); pts.push(Math.sin(a) * rOut, Math.cos(a) * rOut) }
  // roll the leading edge over instead of cutting it square
  const bs = bevel / rOut
  for (let i = 1; i <= 3; i++) {
    const t = i / 3, a = a1 + bs * Math.sin(t * Math.PI * 0.5)
    const r = rOut - (rOut - rIn) * (1 - Math.cos(t * Math.PI * 0.5))
    pts.push(Math.sin(a) * r, Math.cos(a) * r)
  }
  for (let i = prof; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / prof); pts.push(Math.sin(a) * rIn, Math.cos(a) * rIn) }
  if (a0 > 1e-4) pts.push(Math.sin(a0) * rOut, Math.cos(a0) * rOut)
  return profileLathe(pts, seg, { creaseAngle: 34, unique: true })
}

// ---------------------------------------------------------------------------
// THE EYES — §3.2. The load-bearing feature.
//
// The dome CENTRE sits ON the face plane (head-local x +0.200), not inside the
// skull, so the front elevation shows the full great circle and the side
// elevation has the dome leading the mouth by 0.0835. Radii/lids are derived
// per-eye (the right dome is 6.8 % larger) — never mirrored, or the right lid
// z-fights inside its own sclera.
// ---------------------------------------------------------------------------
function buildEye(eye, side, MAT, costume) {
  const r = side === 1 ? 0.1175 : 0.1255
  const zs = 0.96

  // 34 segments, not 30: this is the hero surface and its terminator has to be
  // a clean curve at KO-cam distance.
  const dome = put(eye, tint(ball(r, 32, { unique: true }), C.sclera, { grain: 0, veins: true }), MAT.sclera)
  dome.scale.z = zs
  dome.name = 'sclera'

  // gaze: pupils sit 0.014 below the equator (gaze reads slightly downward) and
  // the two eyes DIVERGE by 6° — left +2° inboard, right -4° outboard (§3.2).
  // Round 1 had both signs positive, i.e. a parallel gaze, and the authored
  // wonk that keeps this off "corporate mascot" simply did not exist.
  const gaze = new THREE.Group()
  gaze.rotation.set(0, side === 1 ? 0.0349 : -0.0698, -Math.asin(0.014 / r))
  eye.add(gaze)

  // --- THE MAXIMUM-CONTRAST PAIR (§5 rank 1) --------------------------------
  // sclera L*93 against pupil L*12, sitting at the top of the silhouette. All
  // three layers are CONFORMED patches (eyePatch), not extruded discs: they add
  // no silhouette, they cannot show an apex, and they cannot cone.
  //   iris   annulus outer Ø 0.062 / inner Ø 0.038  #C89230  — a THIN gold rim
  //   pupil  HORIZONTAL oval      0.038 x 0.026     #1E2026  — the dominant mass
  //
  // ROUND 3: three separate materials now, and they are chosen for their
  // SPECULAR behaviour rather than their tint. The iris is a matte annulus, the
  // pupil is the flattest, deadest surface on the whole model (`plastic`, no
  // clearcoat, envMapIntensity 0.22) so nothing can lift it off L*12, and the
  // catchlight is the only bright thing in the stack. The full-cap cornea shell
  // that used to veil all of it is gone.
  put(gaze, tint(eyePatch(r, 0.031, 0.031, 0.0009, { inner: 0.613, seg: 36 }), C.iris,
    { grain: 0 }), MAT.iris).name = 'iris'
  // The pupil is grown from 0.038 x 0.026 to 0.044 x 0.030 (0.187 x eye Ø). §2's
  // own 128 px arithmetic puts the spec'd pupil at 2.2 px, which is under the
  // threshold where a dark blob survives a downscale against a L*93 field; this
  // lands it at 2.6 px and keeps the iris a thin gold rim around it.
  put(gaze, tint(eyePatch(r, 0.022, 0.015, 0.0019, { seg: 32 }), C.pupil,
    { grain: 0 }), MAT.pupil).name = 'pupil'
  // the catchlight: 10 o'clock on the left eye, 11 on the right. Small, hard,
  // OFF-CENTRE and clear of the pupil — the thing that reads as a wet glass
  // bead, and now the ONLY specular allowed near the contrast pair.
  // Euler 'XYZ' composes as Rx*Ry*Rz, so rotation.z lifts the patch off the
  // forward axis by 0.62 rad and rotation.x then swings it round the clock
  // face: the viewer's right is +Z, so -60° is 10 o'clock and -30° is 11.
  const hi = new THREE.Group()
  hi.rotation.set(side === 1 ? -1.047 : -0.524, 0, 0.62)
  gaze.add(hi)
  put(hi, tint(eyePatch(r, 0.0082, 0.0056, 0.0028, { seg: 22 }), 0xe4e6d6, { grain: 0 }),
    MAT.spec, 0, 0, 0, 0.5).name = 'catchlight'

  // lids live on their own child group so a clip's eye-bone roll and the pose
  // stack's lidCover compose instead of fighting (§8).
  // §3.2 asymmetry: the RIGHT lid is heavier — +0.05 lidCover, expressed as
  // +6° of roll and 6° more subtended arc. Visible at 512 px, invisible at 128.
  const lid = new THREE.Group()
  lid.rotation.set(0.1396 * side, 0, -0.2094 + (side === -1 ? -0.050 : 0))
  eye.add(lid)
  lid.name = side === 1 ? 'lidL' : 'lidR'
  // --- ROUND 3: TWO SEPARATE LIKENESS FAILURES, BOTH IN THIS ONE SHELL ------
  // (a) It subtended 72° from the pole, which covers (1-cos72)/2 = 34.5 % of the
  //     visible eye height before the 12° forward pitch, ~45 % after. The source
  //     read is a LARGE WHITE OVAL with a thin lid line above it; at 45 % cover
  //     in C.dorsal green ours inverted to "green beret over a white
  //     chin-strap". The arc drops to 52° (57° on the heavier right lid) =
  //     19.2 % / 23.4 % before pitch, under the 25 % ceiling.
  // (b) Its outer radius was r+0.0185, so its widest ring stood
  //     (0.1175+0.0185)·sin72° = 0.1294 against a 0.1175 dome — the lid was
  //     0.012 WIDER than the eye it sat on, on both sides. The two medial edges
  //     therefore met over the bridge and closed §2's V-notch into one green
  //     band at 128 px, which is the single failure that turns this character
  //     into a generic round-headed cartoon animal. At r+0.0105 and 52° the
  //     widest ring is 0.1008 — comfortably INSIDE the dome silhouette, so the
  //     medial edge cannot reach the centreline and the notch survives.
  //     Measured on the built mesh: 0.0567 of dome-to-dome daylight at the
  //     equator and 0.0924 above the cranial plate (5.2 px at 128 px framing,
  //     against the 3 px the notch has to clear).
  //     46 deg, not 52: (1-cos46)/2 = 15.3 % of geometric cover, and the 12 deg
  //     forward pitch adds ~9 points of PROJECTED cover on top of it. Measured
  //     at the centre column of the built mesh the left lid now occludes 23.9 %
  //     of the visible eye height and the heavier right lid 28.2 % — the 4.3
  //     point spread IS §3.2's "+0.05 lidCover on the right".
  const a1 = side === 1 ? 0.8029 : 0.8465
  const up = tint(lidShell(r + 0.0055, r + 0.0105, 0, a1, 0.004, 26), C.lid, { roll: C.dorsalLit })
  const upm = put(lid, up, MAT.skin)
  upm.name = 'upperLid'
  upm.scale.z = zs
  // the brow: the 0.004 bevel on the lid's leading edge is this character's only
  // eyebrow, so give it a bead that the §5 rim actually has something to catch.
  const brow = tint(filletRing((r + 0.0080) * Math.sin(a1), 0.0062, 6, 24, { unique: true }),
    C.lid, { roll: C.dorsalLit, shade: C.crevice })
  const bm = put(lid, brow, MAT.skin, 0, (r + 0.0080) * Math.cos(a1), 0)
  bm.name = 'browBead'
  bm.scale.z = zs
  const lo = tint(lidShell(r + 0.0050, r + 0.0100, 2.967, Math.PI, 0.003, 24), C.lid, { shade: C.crevice })
  const lom = put(eye, lo, MAT.skin)
  lom.name = 'lowerLid'
  lom.scale.z = zs
  // nictitating membrane — real amphibian anatomy, and a free AAA detail
  const nic = put(eye, tint(shellLathe(r + 0.0038, r + 0.0026, 2.72, Math.PI, 18, 3), 0xdde4d6, { grain: 0 }), MAT.nictitating)
  nic.name = 'nictitating'
  nic.scale.z = zs

  if (costume === 1 && side === -1) {
    const ring = filletRing(0.098, 0.011, 10, 36, { unique: true })
    put(eye, tint(ring, C.tieGold), MAT.metal, 0.108, 0, 0, 0, 0, -Math.PI / 2).name = 'monocleRim'
    put(eye, tint(disc(0.096, 0.096, 0.004, 0, 22), 0xdfe8ee), MAT.glass,
      0.108, 0, 0, 0, Math.PI / 2, 0).name = 'monocleLens'
    const chain = splineTube([[0.104, -0.084, -0.006], [0.086, -0.152, -0.030],
      [0.046, -0.212, -0.052], [0.006, -0.256, -0.062]], 0.006, 16, null,
    { radialSeg: 6, roundEnd: true, roundStart: true, unique: true })
    put(eye, tint(chain, C.tieGoldDark), MAT.metal).name = 'monocleChain'
  }
}
// ---------------------------------------------------------------------------
// HEAD ASSEMBLY — skull, mouth, amphibian detail, throat sac, tongue.
// ---------------------------------------------------------------------------
const HEAD_ORG = [0.05, 1.18, 0]
// mouth centreline, head-local. See the note in buildHead().
const MOUTH_Y = 0.030
// cream ventral wraps the chin and throat and dies out before the mouth line
const headVent = (x, y, z, nx, ny) => (1.158 - y) * 3.4 + (-ny) * 0.34 - 0.16

function buildHead(head, MAT, costume) {
  // --- cranial mass: ONE lofted rounded box, no snout block ------------------
  // 56 ring points, not 44: same aliasing argument as the torso. The §6 mottle
  // is a 59 mm feature authored as vertex colour, so the HORIZONTAL sample
  // spacing round the skull is what decides whether it resolves — 30 mm now.
  // subdivide stays at 1; the vertical spacing was already 10 mm.
  const skull = loft(HEAD_Y.map((y) => ({ y, shape: skullRing(y, y < -0.062 ? 0.58 : 1) })),
    { subdivide: 1, unique: true })
  paintSkin(skull, HEAD_ORG, { vent: headVent })
  put(head, skull, MAT.skin).name = 'skull'

  // --- the mouth: a swept tube on a 9-point curve, not a box ----------------
  // flat across the middle 0.20 m then accelerating down in the outer 0.15 —
  // that "flat then droop" profile is the signature. Corners die into flat face
  // 0.015 inboard of where the 0.045 vertical bevel starts, never onto it.
  // ROUND 2 fixes, in the order the critic found them:
  //  - the mouth line drops from head-local y 0.070 to MOUTH_Y 0.050. At 0.070
  //    the upper lip tube crowned at y 0.104 and the eye domes bottom out at
  //    0.0675, so the lips were TANGENT to the domes — no under-eye shelf, and
  //    a genuine interpenetration at |z| 0.145. This is a knowing deviation
  //    from §3.3's stated centre height; §2's negative space #2 wins, because
  //    the shelf is what stops the eyes and mouth merging into one blob.
  //  - the corners stop at |z| 0.250 and the lips flick to 0.280 tapering to
  //    nothing, so the mouth dies 0.030 inboard of the cheek edge (0.310)
  //    instead of overhanging the silhouette on blunt round caps.
  //  - corner drop goes 0.040 -> 0.046 (10.4° instead of 9.1°) to buy back
  //    another 5 mm of shelf outboard.
  //
  // ROUND 3 — "the lips are two detached floating tubes; the near-end cap hangs
  // in open air past the cheek silhouette; there is visible background between
  // the two tubes." All of that traces to ONE number: the tube centreline was
  // laid at `faceX + 0.014`, i.e. the whole tube, all 0.0135 of radius of it,
  // stood clear of the skin. Two hot dogs held in front of a face.
  //   * the centreline is now BURIED: upper centre at faceX - 0.002 with radius
  //     0.016 (projects 0.014 proud, §3.3, with 0.018 of the tube inside the
  //     skull), lower at faceX - 0.006 with radius 0.020 (same 0.014 proud,
  //     0.026 buried). Half of every tube is inside solid geometry, so no cap
  //     can hang in air and no background can show between them.
  //   * the ends stop at |z| 0.258, only 0.008 past the corner, and taper to
  //     nothing — §3.3's 0.030 flick was overhanging the cheek outline.
  //   * corner drop 0.042 -> 0.036 so the corner lands at head-local y -0.002,
  //     where skullHalfW() is still the full 0.310 and negative space #3 is a
  //     real 0.060 pocket of cheek outboard of the corner.
  //   * a lip BED sweeps the same curve at radius 0.030, centred 0.028 behind
  //     the face, so it crowns 0.002 proud: an 0.008 fillet of skin that the
  //     lips die into instead of an intersection edge.
  const MZ = [-0.253, -0.248, -0.204, -0.150, -0.080, 0, 0.080, 0.150, 0.204, 0.248, 0.253]
  const drop = (z) => { const a = Math.abs(z); return a <= 0.25 ? 0.036 * Math.pow(a / 0.25, 2.4) : 0.036 + (a - 0.25) * 0.30 }
  // sample the REAL crowned face surface per control point, never the idealised
  // plane — the crown falls 0.018 back by |z| 0.250 and a flat path floats off.
  const lipPath = (dy, bury) => MZ.map((z) => {
    const y = MOUTH_Y - drop(z) + dy
    return [faceX(y, z) - bury, y, z]
  })
  const taper = (t) => 1 - smooth(0.80, 1, Math.abs(t * 2 - 1)) * 0.985
  const tubeOpts = { radialSeg: 10, roundEnd: true, roundStart: true, unique: true }
  // the fillet bed first, so the lips sit IN something
  const bed = splineTube(lipPath(-0.002, 0.028), 0.030, 30, (t) => 0.030 * (1 - smooth(0.80, 1, Math.abs(t * 2 - 1)) * 0.85),
    { radialSeg: 10, roundEnd: true, roundStart: true, unique: true })
  paintSkin(bed, HEAD_ORG, { vent: headVent, lit: 0.6 })
  put(head, bed, MAT.skin).name = 'lipBed'
  // lower lip is 1.25x the upper — the pout lives in the lower lip
  put(head, tint(splineTube(lipPath(0.012, 0.002), 0.016, 34, (t) => 0.016 * taper(t), tubeOpts),
    C.lipRose, { roll: C.lipRoll, shade: C.crevice }), MAT.lip).name = 'upperLip'
  put(head, tint(splineTube(lipPath(-0.018, 0.006), 0.020, 34, (t) => 0.020 * taper(t), tubeOpts),
    C.lipRose, { roll: C.lipRoll, shade: C.crevice }), MAT.lip).name = 'lowerLip'
  // A REAL 0.012 recess between the lips, cut 0.014 behind the face surface so
  // there is a genuine AO line and the two tubes cannot fuse into one sausage.
  put(head, tint(splineTube(lipPath(-0.003, 0.014), 0.011, 30,
    (t) => 0.011 * taper(t), { radialSeg: 8, roundEnd: true, roundStart: true, unique: true }),
  C.oral), MAT.oral).name = 'mouthSlot'
  // the mouth-corner pockets (§2 negative space #3): a half-buried crevice bead
  // outboard of each corner, so the corner reads as a pocket in the cheek and
  // the mouth curves DOWN rather than running straight across the head
  for (const s of [1, -1]) {
    const cy = MOUTH_Y - drop(0.250) - 0.004
    put(head, tint(ball(0.011, 12, { unique: true }), C.crevice),
      MAT.skin, faceX(cy, 0.252 * s) - 0.006, cy, 0.252 * s).name = 'mouthCorner'
  }
  // oral cavity so an open mouth is not hollow; the tongue tucks in HERE at
  // bind pose (see buildTongue — round 1 parked the tip outside it)
  put(head, tint(superellipsoid(0.070, 0.045, 0.19, 3, 3.2, 16, { unique: true }), C.oral),
    MAT.oral, 0.14, MOUTH_Y - 0.005, 0).name = 'oralCavity'

  // --- amphibian detail: the surfacing alibi (§3.5) --------------------------
  // ROUND 2: every one of these was BURIED. The tympanum disc sat at |z| 0.300
  // inside a cheek wall standing at 0.310, and the fold bead ran at 0.238-0.310
  // through solid skull — so the "surfacing alibi" was invisible and the cheek
  // read as a bare green wall. We cannot boolean a socket, so the drum now
  // stands 0.004 PROUD inside a raised rim that casts the inset AO ring, and
  // the fold is sampled against skullHalfW() so it actually lies on the surface.
  for (const s of [1, -1]) {
    // TYMPANUM — ROUND 3: it read as a hairline engraved decal on flat green.
    // §3.5 asks for a 0.006 INSET disc inside a raised rim, with its own
    // smoother material. We cannot boolean a socket out of the loft, so the
    // socket is built: a shallow crater wall (rim torus, outer) whose bore
    // stands 0.010 proud of the cheek, with the drum membrane recessed 0.006
    // INSIDE that bore. The eye reads the rim's shadow line as an inset, and
    // the membrane now has its own taut, low-roughness lobe against the cheek.
    const tz = 0.3055 * s
    put(head, tint(filletRing(0.0585, 0.0092, 7, 24, { unique: true }), C.dorsal,
      { roll: C.dorsalLit, shade: C.crevice }),
    MAT.skin, 0.05, 0.125, tz + 0.0055 * s, Math.PI / 2, 0, 0).name = 'tympanumRim'
    put(head, tint(disc(0.0525, 0.0525, 0.009, 0.0025, 24), C.tympanum, { grain: 0 }),
      MAT.tympanum, 0.05, 0.125, tz + 0.0005 * s, 0, 0, 0).name = 'tympanum'
    // a second, tighter ring inside the bore: the drum's own annulus, and the
    // thing that gives the disc a concentric read at the 30 cm distance
    put(head, tint(filletRing(0.0372, 0.0036, 5, 20, { unique: true }), C.tympanum, { shade: C.crevice }),
      MAT.tympanum, 0.05, 0.125, tz + 0.0042 * s, Math.PI / 2, 0, 0).name = 'tympanumAnnulus'
    // GLANDULAR FOLD — ROUND 3: "a single thin bead that starts above the
    // tympanum and stops dead in mid-cheek with a blunt round cap — an
    // unresolved dangling noodle." It now tapers to ZERO at both ends (radiusFn
    // sin-profile) and its forward end lands at the foreleg as §3.5 specifies.
    put(head, tint(splineTube([[0.168, 0.188, 0.288 * s], [0.108, 0.196, 0.300 * s],
      [0.030, 0.186, 0.3065 * s], [-0.036, 0.148, 0.3115 * s], [-0.104, 0.076, 0.3095 * s],
      [-0.162, 0.006, 0.286 * s], [-0.196, -0.040, 0.252 * s]],
    0.0075, 22, (t) => 0.0075 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.55),
    { radialSeg: 7, roundEnd: true, roundStart: true, unique: true }),
    C.dorsalLit, { shade: C.crevice }), MAT.skin).name = 'glandularFold'
    // external nares — no snout, so they go high on the face plane between the domes
    put(head, tint(ball(0.009, 12, { unique: true }), C.dorsal), MAT.skin, 0.202, 0.115, 0.035 * s).name = 'nare'
    put(head, tint(disc(0.0038, 0.0038, 0.003, 0, 8), C.crevice), MAT.oral,
      0.211, 0.115, 0.035 * s, 0, Math.PI / 2, 0).name = 'nareInset'
  }

  // --- throat sac -----------------------------------------------------------
  // Round 1 built this as a free-floating superellipsoid with a hard unfilleted
  // rim, a visible gap to the jaw and its own cast shadow on the chest — "a
  // flying saucer under the jaw", exactly what §3.4 forbids. It is now a LOFT
  // whose top ring starts INSIDE the skull (head-local y -0.028, i.e. above the
  // jaw underplane at -0.060) and whose lowest rings run back to head-local
  // x -0.03 = world 0.020, which is inside the chest mass at that height. So it
  // has no free rim at either end: it is continuous with the jaw above and with
  // the chest behind, and it fills the whole 0.060 chin-to-shoulder gap.
  //
  // ROUND 3 — "a separate cream egg glued to the chest with a hard closed
  // outline, three stray dark dots on its front that read as nostrils, and
  // visible background in the gap to the jaw underplane." Three fixes:
  //   (a) TWO extra rings at the top (y -0.006 and -0.034) that sit fully
  //       INSIDE the skull loft — verified against skullHalfW() and
  //       skullFrontX() at those heights — so the sac grows out of the jaw
  //       through §3.4's 0.040 fillet rather than being parked under it.
  //   (b) the albedo is a GRADIENT, not a flat cream. The top third stays
  //       dorsal green so it matches the jaw it emerges from; the cream only
  //       arrives on the slack underbelly. The sac therefore has no independent
  //       silhouette at rest, which is the actual §3.4 requirement.
  //   (c) the three slack folds were C.crevice tubes — dark beads with round
  //       caps sitting on a pale field, i.e. nostrils. They are now RELIEF only:
  //       painted with the sac's own gradient and tapered to zero at both ends,
  //       so they read as creases under raking light and vanish head-on.
  const SAC = [ // [head-local y, widthZ, depthX, centre x]
    [-0.006, 0.150, 0.210, 0.010],
    [-0.034, 0.212, 0.262, 0.046],
    [-0.062, 0.244, 0.272, 0.072],
    [-0.094, 0.258, 0.254, 0.098],
    [-0.122, 0.236, 0.222, 0.114],
    [-0.146, 0.170, 0.158, 0.124],
    [-0.164, 0.062, 0.060, 0.130],
  ]
  // world-Y gradient: green at the jaw line (1.174), full cream by 1.085
  const sacVent = (x, y) => smooth(1.168, 1.086, y) * 1.5 - 0.22
  const sac = loft(SAC.map(([y, w, d, cx]) => ({ y, shape: shiftRing(superellipsePoints(w, d, 2.5, 28), cx) })),
    { subdivide: 2, unique: true })
  paintSkin(sac, HEAD_ORG, { vent: sacVent, mottle: 0.25, lit: 0.35 })
  put(head, sac, MAT.sac).name = 'throatSac'
  for (let i = -1; i <= 1; i++) {
    const z = i * 0.064
    const fold = splineTube([[0.026, -0.074, z * 0.86], [0.104, -0.118, z * 1.04],
      [0.176, -0.132, z * 0.94], [0.230, -0.104, z * 0.66]],
    0.0062, 14, (t) => 0.0062 * Math.pow(Math.sin(Math.PI * t), 0.7),
    { radialSeg: 6, roundEnd: true, roundStart: true, unique: true })
    paintSkin(fold, HEAD_ORG, { vent: sacVent, mottle: 0, lit: 0.9, crev: 0 })
    put(head, fold, MAT.sac).name = 'sacFold'
  }

  if (costume === 1) {
    // "market maker" top hat — a plain mesh under `head`, deliberately NOT a bone
    // named `hat`: 'hat' precedes 'tie' in Gore's ACCESSORY_BONES and would
    // silently steal the established torn-tie gag.
    const hat = new THREE.Group()
    hat.position.set(-0.06, 0.24, 0)
    hat.rotation.set(0.0873, 0, -0.1396) // never square on the plate
    head.add(hat)
    put(hat, tint(roundedCylinder(0.115, 0.012, 0.005, 30, 1, { unique: true }), 0x14141a, { grain: 0 }), MAT.suit, 0, 0.008, 0).name = 'hatBrim'
    put(hat, tint(roundedCone(0.076, 0.079, 0.11, 0.009, 26, 2, { unique: true }), 0x17171e, { grain: 0 }), MAT.suit, 0, 0.069, 0).name = 'hatCrown'
    put(hat, tint(roundedCylinder(0.081, 0.026, 0.004, 26, 1, { unique: true }), C.hatBand, { grain: 0 }), MAT.leather, 0, 0.034, 0).name = 'hatBand'
  }
}

/** The tongue: a tapered 5-section tube with a visible medial groove. */
function buildTongue(tongue, MAT) {
  // The bake is 0.85 rad and every clip applies a NEGATIVE delta to reach the
  // extended pose, so the rest orientation is fixed at 48.7° up-forward — there
  // is no bake that hides the tongue at rest AND throws it forward on the jab.
  // What IS free is where the tube sits along that axis: run it from -0.28 to
  // +0.09 so at rest the fat base is buried under the jaw and only a 0.06 tip
  // shows over the upper lip, while the extended pose still reads as a 0.370
  // tongue leaving the mouth. (Shipped build: -0.02..0.37, i.e. a 0.24 stick
  // hanging in front of a face that used to project 0.165 further forward.)
  const tw = bent(tongue, 0.85)
  // ROUND 2: the tip used to surface at head-local (0.247, -0.028) — OUTSIDE
  // the jaw, below the lower lip, punching through the throat sac. Solve it as
  // two constraints on the SAME control polyline, because the clips give the
  // extended pose by cancelling the bake (rot z -0.85) and translating the bone
  // to head-local (0.55, 0.02):
  //   rest      H(x,y) = (0.200 + x*cos0.85 - y*sin0.85, -0.060 + x*sin0.85 + y*cos0.85)
  //   extended  E(x,y) = (0.550 + x, 0.020 + y)
  // Curling the polyline upward (y 0.028 -> 0.090 over its length) puts the
  // REST tip at head-local (0.165, 0.037) — inside the oral-cavity shell, which
  // spans x 0.070..0.210 and y 0.000..0.090 — while the EXTENDED tip still
  // lands at (0.60, 0.11), a 0.36 m tongue leaving the mouth and rising. The
  // rest of the polyline at rest lies inside the skull, the sac and the chest.
  const path = [[-0.31, 0.028, 0], [-0.22, 0.04, 0], [-0.13, 0.052, 0], [-0.04, 0.07, 0], [0.05, 0.09, 0]]
  const geo = splineTube(path, 0.0275, 26, (t) => 0.0275 - 0.0125 * t,
    { radialSeg: 9, aspect: 1.4, roundEnd: true, roundStart: true, unique: true })
  put(tw, tint(geo, C.tongue, { shade: 0xa8555e }), MAT.oral).name = 'tongue'
  const groove = splineTube(path.map((p) => [p[0], p[1] + 0.016, p[2]]), 0.005, 18,
    (t) => 0.005 - 0.002 * t, { radialSeg: 5, roundEnd: true, roundStart: true, unique: true })
  put(tw, tint(groove, 0x9c4d56), MAT.oral).name = 'tongueGroove'
}
// ---------------------------------------------------------------------------
// BODY — §4. Inverted taper: shoulder span 0.580, belly 0.620. The body gets
// WIDER going down and the head (0.620) is wider than the shoulders. One lofted
// mass from crotch to occiput so there is no chest/belly seam to hide.
// ---------------------------------------------------------------------------
const TORSO_ORG = [0, 0.66, 0]
const TORSO_SEC = [ // [local y, widthZ, depthX, centre x]
  [-0.140, 0.430, 0.360, 0.006],
  [-0.040, 0.540, 0.430, 0.008],
  [0.040, 0.596, 0.466, 0.010],
  [0.120, 0.620, 0.485, 0.012], // widest belly, world y 0.780
  [0.210, 0.598, 0.466, 0.004],
  [0.300, 0.566, 0.445, -0.012],
  [0.380, 0.522, 0.424, -0.032], // shoulder line, world y 1.040
  [0.430, 0.440, 0.390, -0.044], // rolled forward: the head rides 0.06 proud
  [0.470, 0.330, 0.310, -0.052], // no neck — this meets the occiput directly
]
// ROUND 3 — "the ventral cream #DCE3AE is missing from the ENTIRE body; belly,
// lower torso and inner thighs are all dorsal green; the only cream on the model
// is the throat egg and the finger tips." Correct, and the culprit is the term
// that used to close this expression: `- smooth(0.78, 0.66, y) * 1.3`. It
// subtracted 1.3 from the ventral bias everywhere below world y 0.78, i.e.
// across the whole exposed belly, and everything ABOVE 0.78 is under the shirt.
// Net effect: the second-lightest value in §5's colour script rendered on
// exactly zero visible pixels of the torso.
//
// Now the cream is driven by the surface normal alone, as §5 intends: the FRONT
// and UNDERSIDE of the pear go cream, the flanks stay dorsal, and paintSkin's
// noise fingers the boundary upward in 4-8 irregular tongues per side over
// ~40 mm. The 0.060 band between the shirt hem (0.680) and the hip therefore
// reads as a bright cream sliver against the dark denim above it — §2's
// negative space #4 — while the flanks keep the green that makes it a break.
const torsoVent = (x, y, z, nx, ny) => nx * 1.15 + (-ny) * 0.50 - 0.42
const limbVent = (x, y, z, nx, ny) => (-ny) * 0.75 - 0.40
// inner thigh: §5 lists it with the belly and the palms. `side` is the leg's
// sign, so -nz*side is the INBOARD-facing normal.
const thighVent = (side) => (x, y, z, nx, ny, nz) => (-ny) * 0.55 + (-nz * side) * 0.85 - 0.42

/** Warty tubercles — §6: 4-9 mm raised bumps, shoulders / upper back / thigh
 *  tops ONLY, never the face. They bead the rim light instead of leaving it a
 *  clean unbroken line. Round 1 put all 16 on the torso, i.e. under the shirt. */
function tubercles(parent, MAT, n, seed, org, place) {
  for (let i = 0; i < n; i++) {
    const b = h1(i * 3.1 + seed), c = h1(i * 7.3 + seed)
    const p = place(i / n, b, c)
    if (!p) continue
    const g = ball(0.0022 + b * 0.0025, 6, { unique: true }) // Ø 4.4-9.4 mm
    paintSkin(g, [p[0] + org[0], p[1] + org[1], p[2] + org[2]], { lit: 1.9, mottle: 0.35, crev: 0 })
    put(parent, g, MAT.skin, p[0], p[1], p[2]).name = 'tubercle'
  }
}

function buildBody(hips, torso, MAT) {
  const pel = superellipsoid(0.2, 0.135, 0.215, 2.8, 2.6, 26, { unique: true })
  paintSkin(pel, [-0.015, 0.585, 0], { vent: (x, y, z, nx, ny) => nx * 0.85 + (-ny) * 0.9 - 0.52 })
  put(hips, pel, MAT.skin, -0.015, -0.035, 0).name = 'pelvis'

  // ROUND 3 — "zero dorsal mottle at the 30 cm read." The mottle field itself
  // was correct (fbm at 17 cycles/m = 59 mm blobs, §6's 30-70 mm) but it is
  // authored as VERTEX colour, and this loft carried 34 ring points over a
  // ~1.75 m circumference: 51 mm between samples against a 59 mm feature. The
  // pattern was aliased out of existence before it reached a pixel. 54 points
  // and subdivide 2 puts the sample spacing at 32 mm x 21 mm, which resolves it.
  const body = loft(TORSO_SEC.map(([y, w, d, cx]) => ({ y, shape: shiftRing(superellipsePoints(w, d, 2.6, 54), cx) })),
    { subdivide: 2, unique: true })
  paintSkin(body, TORSO_ORG, { vent: torsoVent })
  put(torso, body, MAT.skin).name = 'torso'

  // Upper back / nape — the only torso skin the shirt yoke (top 0.418) leaves
  // bare, and the surface the rim light rakes hardest in the KO cam.
  tubercles(torso, MAT, 20, 4.4, TORSO_ORG, (t, b, c) => {
    const y = 0.424 + b * 0.052
    const k = (0.470 - y) / 0.050
    const w = 0.5 * (0.330 + 0.110 * k), d = 0.5 * (0.310 + 0.080 * k)
    const ph = 0.15 + c * 1.15 // 0 = spine; never wraps onto the chest
    const s = t < 0.5 ? 1 : -1
    return [-Math.cos(ph) * d * 0.96 - 0.048, y, Math.sin(ph) * w * 0.96 * s]
  })
}

// ---------------------------------------------------------------------------
// LEGS — frog haunch: the knee sits OUTBOARD (0.130 lateral) and high, so the
// thigh runs down-and-out at 30°, the gap between the legs is a wide inverted-V
// and a crouch pushes the knees above the hip line.
//   thigh joint (0.560, |z|0.170) -> knee (0.332, |z|0.300) -> ankle (0.090, |z|0.200)
//   both segments come out at 0.262: the knee carries a permanent 26° bend.
// ---------------------------------------------------------------------------
// ROUND 2 — the joints. Round 1 used taperedCapsule() for both segments, whose
// spherical end caps are the SAME radius as the jointBall they meet: two equal
// spheres 0.050 apart intersect in a visible circle, so every knee and ankle
// showed a cap emerging through a cap with a seam ridge and a diameter step.
// The segments are now FLAT-ENDED roundedCone()s that stop 0.030 short of the
// pivot, and the jointBall is grown until the flat end's corner
// (hypot(0.030, r_end)) fits inside it. Nothing pokes out at any rotation,
// because the ball is on the parent bone and a sphere has no orientation.
//
// ROUND 3 — that fix traded one artefact for a worse one. Growing the joint ball
// until it swallowed a flat cap made every joint WIDER than both limbs it
// connects: knee 0.062 against a 0.050 thigh end and a 0.038 shin top, i.e. a
// 24 % and a 63 % silhouette step, on six joints. "The single most recognisable
// hobbyist-strung-primitives signature in the image", and it is the correct
// diagnosis. The rule this pass is **radius continuity across the joint**:
//
//   thigh knee-end 0.054 · knee 0.058 · shin knee-end 0.054   (7 % swell)
//   shin ankle-end 0.040 · ankle 0.0445 · instep 0.042        (11 %)
//   upper arm 0.052 · deltoid 0.056                           (8 %)
//   upper arm elbow-end 0.042 · elbow 0.045 · forearm 0.042   (7 %)
//   forearm wrist-end 0.036 · wrist 0.0385                    (7 %)
//
// A 7-11 % swell is an anatomical joint; 24-63 % is a bead on a string. CLEAR
// drops to 0.014 so the segment ends sit deep inside their joint mass, and the
// joints are ovoid superellipsoids rather than spheres — a knee is taller than
// it is wide, and a sphere has a circular silhouette that reads as hardware.
const CLEAR = 0.014
/** Ovoid joint mass. Ry > Rx = Rz reads as anatomy; a sphere reads as a bearing. */
function jointMass(r, ky = 1.12, seg = 18) {
  return superellipsoid(r, r * ky, r * 0.96, 2.35, 2.35, seg, { unique: true })
}
function buildLeg(leg, shin, side, MAT) {
  const th = bent(leg, 0, -0.5192 * side, 0)
  // Frog haunch (§4): 0.150 x 0.170 x 0.140. Round 1 built it at the right size
  // but tucked it inside the pelvis, so the legs read as bare sticks pinned to
  // a cream belly. It now sits 0.022 outboard and the pelvis narrowed to
  // |z| 0.215, so the haunch breaks the outer silhouette by 0.052 and there is
  // a real mass transition from the pear body into the thigh.
  // ROUND 3 — "the thigh interpenetrates the belly: the belly ellipsoid ends in
  // a scalloped edge and the thigh tube passes straight through it, leaving a
  // visible dark intersection seam" (a contract §4 violation). The haunch was
  // too small and sat too far outboard to bridge the pelvis, so the thigh met
  // the pelvis surface directly. It grows to 0.086 x 0.098 x 0.084 and comes
  // 0.006 inboard, giving 0.098 of overlap into the pelvis ellipsoid (which
  // reaches |z| 0.215) — the thigh now emerges from the haunch, and the haunch
  // from the pelvis, with a swept fillet closing the last seam.
  const haunch = superellipsoid(0.086, 0.098, 0.084, 2.4, 2.4, 20, { unique: true })
  paintSkin(haunch, [-0.015, 0.548, 0.186 * side], { vent: thighVent(side), lit: 1.6 })
  put(leg, haunch, MAT.skin, 0.005, -0.012, 0.016 * side).name = 'haunch'
  // hip fillet — the swept bead that welds the haunch into the pelvis so no
  // intersection line survives on the outer silhouette
  const hipF = splineTube([[0.058, 0.044, -0.052 * side], [0.030, 0.062, -0.030 * side],
    [-0.014, 0.066, 0.004 * side], [-0.058, 0.048, 0.030 * side], [-0.078, 0.010, 0.038 * side]],
  0.020, 22, (t) => 0.020 * Math.pow(Math.sin(Math.PI * (0.10 + 0.80 * t)), 0.5),
  { radialSeg: 8, roundEnd: true, roundStart: true, unique: true })
  paintSkin(hipF, [-0.02, 0.56, 0.17 * side], { vent: thighVent(side), lit: 1.4 })
  put(leg, hipF, MAT.skin).name = 'hipFillet'
  tubercles(leg, MAT, 10, 2.7 + side, [-0.02, 0.56, 0.17 * side], (t, b, c) => {
    const a = -0.35 + c * 2.0, e = 0.35 + b * 0.5
    return [0.005 + Math.cos(a) * 0.070 * (1 - e * 0.3), -0.012 + 0.086 * (1 - e * 0.55),
      0.022 * side + Math.sin(a) * 0.072 * (1 - e * 0.3)]
  })

  // thigh: hip -> knee is 0.262. Flat ends, 0.020 in at the hip and CLEAR at
  // the knee, both swallowed by their joint masses.
  // 22 radial segments, generous 0.020 end rims: at 18/0.012 the limb silhouette
  // was a raw cylinder tangent with nothing on it to catch a key light, which is
  // exactly what "the limb silhouettes catch nothing" means. A fat rim gives the
  // segment a rolled edge that carries a specular band down its length.
  const thigh = roundedCone(0.054, 0.066, 0.262 - 0.018 - CLEAR, 0.020, 22, 3, { unique: true })
  paintSkin(thigh, [-0.02, 0.446, 0.235 * side], { vent: thighVent(side) })
  put(th, thigh, MAT.skin, 0, -0.126, 0).name = 'thigh'

  // knee on the PARENT bone (contract §9), 0.058 against a 0.054 thigh end and a
  // 0.054 shin top: a 7 % anatomical swell, not a 24 % bead.
  const kb = jointMass(0.058, 1.14, 18)
  paintSkin(kb, [-0.02, 0.332, 0.3 * side], { vent: thighVent(side), lit: 1.3 })
  put(leg, kb, MAT.skin, 0, -0.228, 0.13 * side).name = 'knee'

  const sh = bent(shin, 0, 0.3916 * side, 0)
  const calf = roundedCone(0.040, 0.054, 0.262 - 2 * CLEAR, 0.017, 22, 3, { unique: true })
  paintSkin(calf, [-0.02, 0.21, 0.25 * side], { vent: thighVent(side) })
  put(sh, calf, MAT.skin, 0, -0.131, 0).name = 'shin'
  const ab = jointMass(0.0445, 1.0, 18)
  paintSkin(ab, [-0.02, 0.09, 0.2 * side], { vent: limbVent })
  put(shin, ab, MAT.skin, 0, -0.242, -0.1 * side).name = 'ankle'

  buildFoot(shin, side, MAT)
}

// §4: 5 toes (real hindlimb count) at ±38° splay, webbing to 85 % of toe
// length, foot pad 0.030 thick, total toe width 0.204, foot toed out 22°.
// Round 1 shipped a scalloped slipper pad — no separated toes, no webbing, and
// therefore no way to stage §6's backlit-webbing KO moment.
const TOE_A = [-0.663, -0.332, 0, 0.332, 0.663]
const TOE_L = [0.14, 0.155, 0.165, 0.155, 0.14]
function buildFoot(shin, side, MAT) {
  const foot = new THREE.Group()
  foot.position.set(0, -0.242, -0.1 * side)   // the ankle
  foot.rotation.y = -0.384 * side             // toed out 22°
  shin.add(foot)
  const ORG = [-0.02, 0.09, 0.2 * side]
  const soleVent = (x, y, z, nx, ny) => (-ny) * 1.15 - 0.22

  // instep: bridges the ankle mass (bottom y -0.0445) into the pad top
  const ins = roundedCone(0.046, 0.042, 0.048, 0.014, 18, 3, { unique: true })
  paintSkin(ins, [ORG[0] + 0.01, ORG[1] - 0.04, ORG[2]], { vent: soleVent })
  put(foot, ins, MAT.skin, 0.01, -0.038, 0).name = 'instep'

  // ROUND 3 — "the feet are flat fans of thin toe sticks with no foot pad
  // volume (0.030 specified)". The pad was a 0.030 slab, but a slab is not a
  // volume: it had no dorsal swell, so the toes appeared to sprout from a card.
  // It is now a lofted mass 0.052 deep at the ball of the foot that the toes
  // grow OUT of, with the specified 0.030 sole thickness preserved underneath.
  // [fore-aft station, widthZ, heightY, |centre y|]. loft() sweeps +Y and its
  // ring pairs read as (z, x), so the fore-aft axis is authored as the sweep and
  // rotateZ(-90°) maps it onto +X: world y comes out as -(ring x), which is why
  // the centre column is positive here.
  const PAD = [
    [-0.072, 0.084, 0.036, 0.074],
    [-0.030, 0.106, 0.050, 0.068],
    [0.014, 0.122, 0.056, 0.066],
    [0.052, 0.126, 0.052, 0.068],
    [0.082, 0.110, 0.038, 0.074],
  ]
  const pad = loft(PAD.map(([x, w, h, cy]) => ({ y: x, shape: shiftRing(superellipsePoints(w, h, 2.8, 22), cy) })),
    { subdivide: 2, unique: true })
  pad.rotateZ(-Math.PI / 2)   // the loft sweeps +Y; the foot runs +X
  paintSkin(pad, [ORG[0] + 0.005, ORG[1] - 0.070, ORG[2]], { vent: soleVent, mottle: 0.6, lit: 0.8 })
  put(foot, pad, MAT.skin).name = 'footPad'

  const bx = 0.052, by = -0.072
  const tipOf = (i, k = 1) => [bx + Math.cos(TOE_A[i]) * TOE_L[i] * k, by + 0.004 * k, Math.sin(TOE_A[i]) * TOE_L[i] * k]
  for (let i = 0; i < 5; i++) {
    const t1 = tipOf(i)
    const toe = splineTube([[bx - 0.02, by, Math.sin(TOE_A[i]) * 0.012],
      [(bx + t1[0]) * 0.5, by + 0.003, t1[2] * 0.5], t1], 0.015, 9,
    (t) => 0.015 - 0.005 * t, { radialSeg: 7, roundEnd: true, roundStart: true, unique: true })
    paintSkin(toe, [ORG[0] + bx, ORG[1] + by, ORG[2]], { vent: soleVent, mottle: 0.6 })
    put(foot, toe, MAT.skin).name = 'toe'
    // adhesive toe disc. ROUND 3: these were painted at full C.ventral and came
    // out as near-white pills — the second brightest thing on the model after
    // the sclera, which sends the eye to the FEET at 1 m (§1 forbids it). They
    // are now C.disc, 12 L* under the cream, with the mottle left on.
    const d = superellipsoid(0.0155, 0.0095, 0.0155, 2.2, 2.2, 10, { unique: true })
    paintSkin(d, [ORG[0] + t1[0], ORG[1] + t1[1], ORG[2] + t1[2]],
      { vent: () => 1, ventral: C.disc, mottle: 0.4, lit: 0.6 })
    put(foot, d, MAT.ventral, t1[0], t1[1], t1[2]).name = 'toeDisc'
    if (i === 4) break
    // ROUND 3 — the webbing was a 0.005 plate at opacity 0.72 that rendered as a
    // white dashed edge and aliased badly. It is now a real membrane: 0.009
    // thick with a 0.004 rolled rim, essentially opaque, reaching 85 % of toe
    // length and slung 0.008 BELOW the toe axis so it forms a catenary between
    // the digits instead of a flat card in their plane.
    const a = tipOf(i, 0.85), b = tipOf(i + 1, 0.85)
    const web = plate([bx - 0.034, 0, a[0], -a[2], b[0], -b[2]], 0.009, 0.004, { rimSeg: 2, crown: 0.006, unique: true })
    web.rotateX(-Math.PI / 2)
    paintSkin(web, [ORG[0], ORG[1] + by, ORG[2]], { vent: () => 1, ventral: C.disc, mottle: 0.3, lit: 0.5 })
    put(foot, web, MAT.web, 0, by - 0.008, 0).name = 'webbing'
  }
}

// ---------------------------------------------------------------------------
// ARMS — §4. Conspicuously short and thin; they carry no silhouette weight.
// Shoulder pivot comes INBOARD to |z| 0.240 (so the head out-widens the
// shoulders) while the arm gets longer: 0.210 + 0.190 + 0.100 = 0.500.
// ---------------------------------------------------------------------------
function buildArm(arm, fore, side, MAT) {
  // Same flat-end / swallowing-joint construction as the legs — the arms had
  // the identical equal-radius cap-through-cap defect, it was just less visible
  // under the sleeves.
  const CA = 0.014
  const ab = bent(arm, 0, -0.2443 * side, 0) // 14° abduction
  const sb = jointMass(0.056, 1.06, 18)
  paintSkin(sb, [0.02, 1.06, 0.24 * side], { vent: limbVent, lit: 1.5 })
  put(arm, sb, MAT.skin).name = 'deltoid'
  // §6: 40-60 warty tubercles per shoulder. The deltoid is the one piece of
  // dorsal skin the shirt yoke leaves fully exposed and the surface §5's rim
  // rakes hardest, so this is where the beading has to happen. 18 per side of
  // real geometry on the OUTER cap only (the inner face is under the sleeve).
  tubercles(arm, MAT, 14, 8.1 + side, [0.02, 1.06, 0.24 * side], (t, b, c) => {
    const a = -0.5 + c * 2.2, e = 0.30 + b * 0.55
    const rr = 0.056 * (1 - e * 0.22)
    return [Math.cos(a) * rr * 0.92, 0.058 * (1 - e * 0.8), Math.sin(a) * rr * side]
  })
  const ua = roundedCone(0.042, 0.052, 0.21 - 0.012 - CA, 0.016, 20, 3, { unique: true })
  paintSkin(ua, [0.02, 0.955, 0.265 * side], { vent: limbVent })
  put(ab, ua, MAT.skin, 0, -0.0995, 0).name = 'upperArm'
  const eb = jointMass(0.045, 1.1, 18)
  paintSkin(eb, [0.02, 0.856, 0.291 * side], { vent: limbVent })
  put(arm, eb, MAT.skin, 0, -0.2037, 0.0508 * side).name = 'elbow'

  const fb = bent(fore, 0, -0.1 * side, 0)
  const fa = roundedCone(0.036, 0.042, 0.19 - 2 * CA, 0.014, 20, 3, { unique: true })
  paintSkin(fa, [0.02, 0.761, 0.301 * side], { vent: limbVent })
  put(fb, fa, MAT.skin, 0, -0.095, 0).name = 'forearm'
  const wb = jointMass(0.0385, 1.0, 16)
  paintSkin(wb, [0.02, 0.666, 0.311 * side], { vent: limbVent })
  put(fore, wb, MAT.skin, 0, -0.19, 0.019 * side).name = 'wrist'

  // hand: FOUR digits and no thumb — real frog forelimb count, and our own
  // deviation from the source's generic cartoon hand.
  const hand = new THREE.Group()
  hand.position.set(0.014, -0.206, 0.021 * side)
  fore.add(hand)
  // The dorsal-to-ventral transition runs ACROSS the hand rather than stopping
  // at the wrist: round 1 cut a hard albedo line where the green forearm met a
  // fully cream hand. -ny*1.3 - 0.55 keeps the back of the hand mottled green
  // and the palm cream, with paintSkin's fingering noise blurring the boundary.
  const handVent = (x, y, z, nx, ny) => (-ny) * 1.3 - 0.55
  const palm = roundedBox(0.075, 0.026, 0.07, 0.012, 2, { unique: true })
  paintSkin(palm, [0.034, 0.66, 0.33 * side], { vent: handVent })
  put(hand, palm, MAT.skin, 0, 0, 0, 0, 0, -0.22).name = 'palm'
  const SPLAY = [-0.384, -0.122, 0.122, 0.384]
  for (let i = 0; i < 4; i++) {
    const a = SPLAY[i] * side
    const f = splineTube([[0.030, 0.004, 0], [0.058, -0.004, 0], [0.082, -0.014, 0]], 0.010, 9,
      (t) => 0.010 - 0.0015 * t, { radialSeg: 7, roundEnd: true, roundStart: true, unique: true })
    paintSkin(f, [0.09, 0.65, 0.33 * side], { vent: handVent })
    put(hand, f, MAT.skin, 0, 0, 0, 0, a, -0.28).name = 'finger'
    // Bulbous adhesive discs — Ø 0.034 against a Ø 0.020 shaft (1.7x),
    // flattened to 0.60 in the palm-normal axis. §4 calls these the single best
    // amphibian cue on the hand and round 1 left them reading as bare nubs.
    // ROUND 3: same "near-white pill" failure as the toe discs — they were the
    // brightest thing after the sclera and stole the 1 m read from the head.
    const pad = superellipsoid(0.017, 0.010, 0.017, 2.2, 2.2, 10, { unique: true })
    paintSkin(pad, [0.12, 0.64, 0.33 * side], { vent: () => 1, ventral: C.disc, mottle: 0.4, lit: 0.6 })
    const dx = Math.cos(a) * 0.087, dz = -Math.sin(a) * 0.087
    put(hand, pad, MAT.ventral, dx * 0.955, -0.018, dz * 0.955, 0, 0, -0.28).name = 'fingerDisc'
    // a crevice bead in the digit split — the AO line that separates the digits
    if (i < 3) {
      const mid = (SPLAY[i] + SPLAY[i + 1]) * 0.5 * side
      put(hand, tint(ball(0.006, 8, { unique: true }), C.crevice), MAT.skin,
        Math.cos(mid) * 0.030, 0.004, -Math.sin(mid) * 0.030, 0, 0, -0.28).name = 'digitSplit'
    }
    // shallow interdigital webbing, gaps 2-3 and 3-4 only, to 35 % of length
    if (i === 1 || i === 2) {
      const mid = (SPLAY[i] + SPLAY[i + 1]) * 0.5 * side
      const web = disc(0.019, 0.010, 0.006, 0.002, 12)
      paintSkin(web, [0.06, 0.65, 0.33 * side], { vent: () => 1, ventral: C.disc, mottle: 0.3 })
      put(hand, web, MAT.web, Math.cos(mid) * 0.044, -0.003, -Math.sin(mid) * 0.044,
        Math.PI / 2, mid, -0.28).name = 'webbing'
    }
  }
}
// ---------------------------------------------------------------------------
// WARDROBE — §7.1. A COLLARED, BUTTONED, SHORT-SLEEVED shirt in a dustier blue,
// worn badly. Deliberately NOT the source's plain blue crew-neck t-shirt (§9.5).
//
// shellRing() makes an open C-section with real cloth thickness, so the placket
// has two genuine free edges and the strain gap at the belly is geometry, not a
// texture. The ring is a superellipse to match the torso's own 2.6 section.
// ---------------------------------------------------------------------------
function shellRing(w, d, e, gap, thick, seg = 26) {
  const n = 2 / e
  const p = (th, ww, dd) => {
    const c = Math.cos(th), s = Math.sin(th)
    return [Math.sign(c) * Math.pow(Math.abs(c), n) * ww * 0.5,
      Math.sign(s) * Math.pow(Math.abs(s), n) * dd * 0.5]
  }
  const t0 = Math.PI / 2 + gap, t1 = Math.PI / 2 + Math.PI * 2 - gap
  const out = [], inn = []
  for (let i = 0; i <= seg; i++) {
    const th = t0 + (t1 - t0) * (i / seg)
    out.push(p(th, w, d)); inn.push(p(th, w - 2 * thick, d - 2 * thick))
  }
  const pts = []
  for (const q of out) pts.push(q[0], q[1])
  for (let i = inn.length - 1; i >= 0; i--) pts.push(inn[i][0], inn[i][1])
  return pts
}

// [local y, widthZ, depthX, front gap (rad), centre x]
const SHIRT_SEC = [
  // ROUND 3 — "the shirt/skin boundary is a razor-straight paint line with no
  // hem geometry, so the garment reads as a texture on the body rather than as
  // cloth." These two extra rings ARE the hem: the cloth flares 0.014 wider than
  // the ring above it and then turns under, so the garment ends in a rolled edge
  // that stands 0.007 clear of the belly, carries its own specular line along
  // the roll and drops a real shadow onto the cream skin below.
  [0.002, 0.596, 0.466, 0.012, 0.008],
  [0.012, 0.618, 0.486, 0.012, 0.008], // the roll's widest point
  [0.020, 0.600, 0.470, 0.010, 0.008], // hem at world 0.680: 0.060 of bare belly below it
  [0.120, 0.652, 0.512, 0.020, 0.012], // widest belly — the strain gap opens here
  [0.220, 0.626, 0.488, 0.005, 0.004],
  [0.320, 0.596, 0.466, 0.004, -0.012],
  [0.380, 0.600, 0.452, 0.004, -0.032], // yoke flares to cover the deltoids
  [0.418, 0.500, 0.412, 0.022, -0.046], // top button undone, collar gaping 0.027
]
const JACKET_SEC = [
  [0.040, 0.640, 0.500, 0.30, 0.008],
  [0.140, 0.690, 0.542, 0.34, 0.012],
  [0.260, 0.664, 0.518, 0.30, 0.002],
  [0.360, 0.634, 0.494, 0.26, -0.020],
  [0.420, 0.606, 0.464, 0.22, -0.046],
]

function shellLoft(sec, thick, e = 2.6) {
  return loft(sec.map(([y, w, d, gap, cx]) => ({ y, shape: shiftRing(shellRing(w, d, e, gap, thick), cx) })),
    { subdivide: 1, unique: true })
}

function buildShirt(torso, armL, armR, MAT) {
  const body = shellLoft(SHIRT_SEC, 0.01)
  tint(body, C.shirtBlue, { shade: C.shirtShadow })
  put(torso, body, MAT.cloth).name = 'shirt'
  // the hem's UNDERSIDE: a short skirt hanging inside the roll in the shadow
  // blue, so the edge has a visible dark lip and the eye reads thickness. This
  // is what stops the shirt/skin boundary reading as a painted line.
  const hemU = skirt(0.298, 0.286, 0.026, { radialSeg: 30, lengthSeg: 2, curve: 0.4, unique: true })
  tint(hemU, C.hemShadow, { shade: C.crevice, grain: 0 })
  const hm = put(torso, hemU, MAT.cloth, 0.008, 0.014, 0)
  hm.scale.set(0.79, 1, 1) // the torso section is 0.470 deep against 0.600 wide
  hm.name = 'shirtHemUnder'

  // placket: two strips with real free edges; they part at the belly so cream
  // skin shows through — "the shirt is one size too small" as geometry
  // §7.1's fit gag as real geometry: the two placket strips are pulled toward
  // each other everywhere EXCEPT at the widest belly (torso-local 0.120, world
  // 0.780), where a 0.012 slot opens between their inner edges and the cream
  // ventral skin shows through it. Round 1 parked both strips outboard of the
  // shirt's own free edge, so the placket read as a smooth uninterrupted band.
  //
  // ROUND 3 — "no placket and zero buttons; it is a single smooth ellipsoid."
  // Both existed, and both were too shy to survive: the strips stood 0.0095
  // proud in the SAME blue as the shirt with no edge shadow, and the buttons
  // were Ø 0.018 sitting 0.009 off a surface with nothing to separate them from.
  // §7.1's numbers are now met and then given contrast to live in: the placket
  // is the specified 0.028 wide and 0.018 deep so it stands 0.016 proud, and
  // each strip carries a `shirtShadow` piping bead down its outboard edge —
  // the AO line that makes a placket read as an applied band rather than as a
  // slightly bulgy patch of the same cloth.
  const PLACKET = [
    [0.020, 0.244, 0.015], [0.120, 0.269, 0.020], [0.220, 0.249, 0.015],
    [0.320, 0.222, 0.014], [0.400, 0.177, 0.020],
  ]
  for (const s of [1, -1]) {
    const strip = loft(PLACKET.map(([y, fx, off]) => ({
      y, shape: shiftRing(superellipsePoints(0.028, 0.018, 3, 16), fx + 0.007, off * s),
    })), { subdivide: 1, unique: true })
    tint(strip, C.shirtBlue, { shade: C.shirtShadow })
    put(torso, strip, MAT.cloth).name = 'placket'
    // outboard piping / stitch groove — 2 mm of relief in the shadow blue
    const pipe = splineTube(PLACKET.map(([y, fx, off]) => [fx + 0.006, y, off * s + 0.015 * s]),
      0.0032, 18, null, { radialSeg: 5, roundEnd: true, roundStart: true, unique: true })
    tint(pipe, C.hemShadow, { grain: 0 })
    put(torso, pipe, MAT.cloth).name = 'placketStitch'
  }
  // 5 buttons at Ø 0.020, sitting ON the +z placket so the two lowest visibly
  // bridge the strain slot, plus spoke wrinkles radiating from them.
  const BY = [0.050, 0.130, 0.210, 0.290, 0.366]
  const BX = [0.262, 0.278, 0.262, 0.241, 0.212]
  const BZ = [0.014, 0.018, 0.014, 0.013, 0.018]
  for (let i = 0; i < 5; i++) {
    put(torso, tint(disc(0.010, 0.010, 0.0075, 0.006, 14), C.shirtButton, { grain: 0 }),
      MAT.button, BX[i] + 0.017, BY[i], BZ[i], 0, Math.PI / 2, 0).name = 'button'
    // the rim of a real shirt button: a dished face inside a raised edge, so it
    // has two highlights instead of one and cannot read as a painted dot
    put(torso, tint(filletRing(0.0092, 0.0022, 5, 14, { unique: true }), C.shirtButton, { shade: C.shirtShadow, grain: 0 }),
      MAT.button, BX[i] + 0.018, BY[i], BZ[i], 0, 0, Math.PI / 2).name = 'buttonRim'
    // the crossed thread — 1.2 mm of relief, the thing that says "sewn on"
    put(torso, tint(disc(0.0058, 0.0017, 0.0024, 0, 6), C.shirtShadow, { grain: 0 }),
      MAT.button, BX[i] + 0.022, BY[i], BZ[i], 0.7, Math.PI / 2, 0).name = 'buttonThread'
    if (i > 1) continue // §7.1: strain at the TWO LOWEST buttons only
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * 0.62 + (i === 0 ? 0.12 : -0.12)
      const L = 0.062 + (k % 2) * 0.026 // 62-88 mm
      const w = splineTube([[BX[i] - 0.002, BY[i], BZ[i] + 0.012],
        [BX[i] - 0.028, BY[i] + Math.sin(a) * L * 0.5, BZ[i] + 0.012 + Math.cos(a) * L * 0.55],
        [BX[i] - 0.072, BY[i] + Math.sin(a) * L, BZ[i] + 0.012 + Math.cos(a) * L]],
      0.004, 8, (t) => 0.004 * (0.35 + 0.65 * Math.sin(t * Math.PI)),
      { radialSeg: 4, roundEnd: true, roundStart: true, unique: true })
      tint(w, C.shirtShadow)
      put(torso, w, MAT.cloth).name = 'strainWrinkle'
    }
  }
  // --- collar (§7.1) --------------------------------------------------------
  // Round 1's collar was two 0.008 plates lying flat on the chest: no
  // silhouette, no cast shadow, read as a decal. Each point is now a 0.014-thick
  // plate with a tapered free edge, LIFTED off the chest so it breaks the
  // outline, and the two are deliberately not the same: the +z point sits 12°
  // flatter and 0.006 lower than the -z one. The asymmetry is the joke.
  //
  // ROUND 3 — "two zero-thickness triangles lying flat on the shirt surface, one
  // with a white dashed stitch outline that terminates in mid-air. No thickness,
  // no standoff, no gape, no undone top button." The plate was 0.014 thick on
  // paper but `taper: 0.45` pulled its free edge to a knife, and it was laid
  // tangent to the chest so nothing separated it. Each point is now a 0.010
  // slab with a 0.004 rolled rim and NO taper — §7.1's "shell thickness of at
  // least 0.004 so the edge catches light" — 0.070 long, spread 0.100 apart,
  // lifted 0.016 off the chest so daylight shows under the point, and given a
  // shadow-blue underside. The asymmetry §7.1 asks for is explicit: the +z
  // point lies 14° flatter and 0.007 lower than the -z one.
  for (const s of [1, -1]) {
    const pt = plate([0, 0, 0.070, -0.028, 0.050, 0.038], 0.010, 0.004,
      { rimSeg: 2, crown: 0.004, unique: true })
    tint(pt, C.shirtBlue, { shade: C.hemShadow })
    put(torso, pt, MAT.cloth, 0.232, 0.360 + (s === 1 ? -0.007 : 0), 0.106 * s,
      s === 1 ? 0.06 : -0.18, -Math.PI / 2 * s, s === 1 ? -0.50 : -0.74).name = 'collarPoint'
  }
  // the stand, gaping 0.030 open at the front because the top button is undone.
  // A stand is a BAND with two faces, so it gets its own dark inner lining ring
  // — that dark crescent inside the gape is what says "unbuttoned collar" at
  // 3 m, and there was nothing there before.
  put(torso, tint(shellLoft([[0.374, 0.520, 0.432, 0.024, -0.04], [0.402, 0.498, 0.416, 0.034, -0.048],
    [0.428, 0.474, 0.400, 0.046, -0.056]], 0.014),
  C.shirtBlue, { shade: C.shirtShadow }), MAT.cloth).name = 'collarBand'
  put(torso, tint(shellLoft([[0.376, 0.492, 0.408, 0.060, -0.040], [0.404, 0.470, 0.392, 0.076, -0.048],
    [0.426, 0.448, 0.378, 0.094, -0.056]], 0.008),
  C.hemShadow, { shade: C.crevice, grain: 0 }), MAT.cloth).name = 'collarLining'

  // sleeves end mid-bicep. Cuffs parent to armL/armR (UPPER arm), never to the
  // forearm — the forearms detach in Gore and the sleeve must not leave with the
  // hand. 0.030 of overlap so no gap opens at extreme rotations.
  for (const [arm, s] of [[armL, 1], [armR, -1]]) {
    // the sleeve rides the SAME 14° abduction bake as the arm itself
    // (buildArm's `bent(arm, 0, -0.2443*side, 0)`). Round 1 rotated it about Z
    // while the arm abducts about X, so the cuff sat crooked on the bicep.
    const ab = bent(arm, 0, -0.2443 * s, 0)
    const sl = skirt(0.058, 0.071, 0.112, { radialSeg: 22, lengthSeg: 4, curve: 0.65, unique: true })
    tint(sl, C.shirtBlue, { shade: C.shirtShadow })
    put(ab, sl, MAT.cloth, 0, 0.03, 0).name = 'sleeve'
    // loose flared cuff hem: 0.006 of standoff from the arm and a real rolled
    // free edge, so the sleeve ends in a silhouette instead of a cut cone
    const cf = sleeve(0.077, 0.081, 0.018, { radialSeg: 22, lengthSeg: 3, bulge: 0.04, flare: 0.14, unique: true })
    tint(cf, C.shirtBlue, { shade: C.shirtShadow })
    put(ab, cf, MAT.cloth, 0, -0.094, 0).name = 'sleeveCuff'
  }
}

// ---------------------------------------------------------------------------
// THE TIE — §7.2. Absurdly long is correct; the whole energy is "wearing
// business clothes badly". Everything here parents to `bones.tie` and ONLY to
// `bones.tie`: GoreSystem reparents that subtree to a physics prop in one call.
// ---------------------------------------------------------------------------
function buildTie(tie, MAT) {
  const tw = bent(tie, 0.18) // 0.180 rad forward drape, air behind the lower half

  // --- knot -----------------------------------------------------------------
  // Round 1 was a roundedBox with a grid texture on it. A four-in-hand knot is
  // a wedge: pinched where it meets the collar, widest two thirds down, with a
  // hard crease under it where the blade escapes. 0.090 x 0.110 x 0.130 (§7.2),
  // rotated 7° off-axis, and dropped to tie-local y -0.098 (world 0.942) so its
  // crown clears the throat sac's lowest surface by 0.023 — round 1's knot top
  // intersected the sac.
  const knotG = new THREE.Group()
  knotG.position.set(0, -0.104, 0)
  knotG.rotation.z = 0.122
  tw.add(knotG)
  const knot = loft([
    [0.055, 0.076, 0.052, -0.004], [0.020, 0.106, 0.076, 0.0],
    [-0.015, 0.126, 0.09, 0.004], [-0.042, 0.13, 0.086, 0.006],
    [-0.055, 0.112, 0.062, 0.006],
  ].map(([y, w, d, cx]) => ({ y, shape: shiftRing(superellipsePoints(w, d, 2.4, 20), cx) })),
  { subdivide: 1, unique: true })
  tint(knot, C.tieGold, { roll: 0xf3d071, shade: C.tieGoldDark })
  put(knotG, knot, MAT.gold).name = 'tieKnot'
  // the crease under the knot
  put(knotG, tint(splineTube([[0.030, -0.050, -0.056], [0.044, -0.058, 0], [0.030, -0.050, 0.056]],
    0.006, 14, null, { radialSeg: 6, roundEnd: true, roundStart: true, unique: true }),
  C.tieGoldDark), MAT.gold).name = 'tieCrease'

  // --- blade ----------------------------------------------------------------
  // ROUND 3 — "far too long and too flat, and it is the loudest element on the
  // character at gameplay distance. It hangs from the collar to below knee
  // height, splits the silhouette in half, hides the splayed-thigh triangle, and
  // its edge is a hard aliased razor line with no thickness or bevel."
  // Correct on every count, and it is a real conflict with §7.2's stated tip at
  // world y 0.350 — §1's detail hierarchy wins, because a tie that out-shouts
  // the head has broken the 2-second test no matter how funny it is. Changes:
  //   * the tip comes up from world y 0.350 to 0.639 — it now ends ON the bare
  //     cream belly band, 0.041 below the shirt hem, and the inverted-V of the
  //     splayed thighs is open again below it.
  //   * max width 0.140 -> 0.114, so it stops bisecting the torso.
  //   * the section is deeper (0.030 -> 0.038 at the widest) and carries a real
  //     ROLLED EDGE — a bead swept down each long edge — instead of dying at an
  //     ellipse tangent. That bead is a §5 rim-light surface; the razor edge was
  //     not one.
  //   * the albedo base drops from #E8B93A to #D5A62F with the bright gold kept
  //     as an up-facing roll only, so the blade holds a value gradient instead
  //     of being one flat high-chroma slab.
  const BLADE = [
    [-0.159, 0.062, 0.028], [-0.212, 0.086, 0.033], [-0.268, 0.106, 0.037],
    [-0.318, 0.114, 0.038], [-0.362, 0.100, 0.033], [-0.390, 0.062, 0.022], [-0.401, 0.012, 0.007],
  ]
  const bladeX = (y) => 0.006 - y * 0.022
  const blade = loft(BLADE.map(([y, w, d]) => ({ y, shape: shiftRing(superellipsePoints(w, d, 2.5, 22), bladeX(y)) })),
    { subdivide: 2, unique: true })
  tint(blade, 0xd5a62f, { roll: C.tieGold, shade: C.tieGoldDark })
  put(tw, blade, MAT.gold).name = 'tieBlade'
  // the two rolled edges — the silhouette of a tie is its edge, and an edge with
  // a 0.004 roll on it catches the cyan rim as a continuous line where a tangent
  // catches nothing.
  for (const s of [1, -1]) {
    put(tw, tint(splineTube(BLADE.slice(0, 6).map(([y, w, d]) => [bladeX(y), y, (w * 0.5 - 0.004) * s]),
      0.0044, 20, (t) => 0.0044 * (0.55 + 0.45 * Math.sin(t * Math.PI)),
      { radialSeg: 6, roundEnd: true, roundStart: true, unique: true }),
    C.tieGold, { shade: C.tieGoldDark }), MAT.gold).name = 'tieEdgeRoll'
  }
  // §6: a slight fold along the blade's long axis, so the sheen runs as an
  // elongated lobe down the tie instead of sitting as one dead patch
  put(tw, tint(splineTube(BLADE.slice(0, 6).map(([y, , d]) => [bladeX(y) + d * 0.5 - 0.002, y, 0]),
    0.005, 20, (t) => 0.005 * (0.4 + 0.6 * Math.sin(t * Math.PI)),
    { radialSeg: 6, roundEnd: true, roundStart: true, unique: true }),
  0xefcb63), MAT.gold).name = 'tieFold'

  // Generic currency glint, built as a REAL glyph that catches the key light —
  // round 1's flat dark square read as a piece of tape stuck to the tie. A
  // generic `$` is fine; a real ticker, wordmark or token logo is not (§9.6).
  const gy = -0.288, gx = bladeX(gy) + 0.019
  const S = [[0.016, 0.030], [-0.004, 0.036], [-0.017, 0.020], [0.002, 0.005],
    [0.017, -0.011], [0.006, -0.030], [-0.015, -0.026]]
  put(tw, tint(splineTube(S.map(([z, y]) => [gx + Math.abs(z) * 0.12, gy + y, z]), 0.0048, 26,
    null, { radialSeg: 6, roundEnd: true, roundStart: true, unique: true }), C.tieGold,
  { grain: 0 }), MAT.metal).name = 'tieGlint'
  put(tw, tint(splineTube([[gx, gy + 0.046, 0.001], [gx + 0.002, gy, 0.001], [gx, gy - 0.044, 0.001]],
    0.0044, 12, null, { radialSeg: 6, roundEnd: true, roundStart: true, unique: true }), C.tieGold,
  { grain: 0 }), MAT.metal).name = 'tieGlintBar'
}

function buildJacket(torso, armL, armR, MAT) {
  const body = shellLoft(JACKET_SEC, 0.014)
  tint(body, C.jacketAlt, { shade: 0x2c1745 })
  put(torso, body, MAT.suit).name = 'jacket'
  for (const s of [1, -1]) {
    const lap = plate([0, 0, 0.075, 0.03, 0.058, 0.2, 0, 0.235], 0.012, 0.004, { unique: true })
    tint(lap, C.jacketAlt, { shade: 0x2c1745 })
    put(torso, lap, MAT.suit, 0.268, 0.18, 0.106 * s, 0.2 * s, -1.32 * s, 0).name = 'lapel'
    put(torso, tint(disc(0.01, 0.01, 0.006, 0.004, 10), C.tieGoldDark, { grain: 0 }),
      MAT.metal, 0.272, 0.24 - 0.06 * s, 0.118 * s, 0, Math.PI / 2, 0).name = 'jacketButton'
  }
  // gold pocket square, 3 points, on the left chest
  for (let i = 0; i < 3; i++) {
    const p = plate([0, 0, 0.03, 0.006, 0.016, 0.036], 0.006, 0.002, { unique: true })
    tint(p, C.tieGold, { shade: C.tieGoldDark })
    put(torso, p, MAT.gold, 0.252, 0.29 + i * 0.004, 0.146 + (i - 1) * 0.014,
      1.5, -0.3 + (i - 1) * 0.35, 0).name = 'pocketSquare'
  }
  put(torso, tint(ball(0.016, 10, { unique: true }), C.tieGold, { grain: 0 }), MAT.metal,
    0.228, 0.35, -0.13).name = 'lapelPin'
  for (const [arm, s] of [[armL, 1], [armR, -1]]) {
    const sl = skirt(0.078, 0.09, 0.152, { radialSeg: 20, lengthSeg: 4, curve: 0.6, unique: true })
    tint(sl, C.jacketAlt, { shade: 0x2c1745 })
    put(bent(arm, 0, -0.2443 * s, 0), sl, MAT.suit, 0, 0.034, 0).name = 'jacketSleeve'
  }
}
// __PARTS5__

// ---------------------------------------------------------------------------
// model — faces +X, feet at y = 0, 1.500 m tall = 5.00 head-units.
//
// Bone NAMES and HIERARCHY are frozen (CONTRACTS.md §4); only bone POSITIONS
// move, which no clip writes a pos track for except `hips`. Moved this pass:
//   armL/R  |z| 0.320 -> 0.240   (shoulders come inboard so the head out-widens them)
//   forearm  y -0.200 -> -0.2037, |z| 0 -> 0.0508  (14° abduction, longer upper arm)
//   shin     y -0.280 -> -0.228, |z| 0 -> 0.130    (frog knee sits OUTBOARD and high)
//   tie     (0.300,0.440) -> (0.240,0.380): the knot now hangs from the collar
//           gap at world (0.240,1.040) and rests ON the shirt instead of
//           floating 0.12 in front of a torso that is no longer a big sphere.
//   eyeL/R  (0.06,0.24,±0.16) -> (0.200,0.185/0.178,±0.145): the dome centre now
//           sits ON the face plane, which is the entire silhouette gag.
// ---------------------------------------------------------------------------
function notPastBone(mesh, root) {
  let p = mesh.parent
  while (p && p !== root) { if (p.userData.isBone) return false; p = p.parent }
  return !!p
}

/**
 * collapse(root) — bake every mesh under `root` that does not sit past another
 * bone into one mesh per material, in `root`'s frame.
 *
 * Why not geometry.js's mergeStatic(): its normaliseForMerge() rebuilds each
 * geometry with position/normal/uv only and DROPS the `color` attribute, which
 * is where this character's entire albedo lives. So the bake is local, ~30
 * lines, and preserves colour. Animation is untouched — nothing is ever baked
 * across a bone boundary.
 */
function collapse(root) {
  const buckets = new Map()
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  root.traverse((o) => { if (o.isMesh && notPastBone(o, root)) (buckets.get(o.material) || buckets.set(o.material, []).get(o.material)).push(o) })
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue
    const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3()
    const P = [], N = [], U = [], CO = [], IDX = []
    let base = 0, cast = false
    for (const mesh of list) {
      const g = mesh.geometry
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
      const uv = g.getAttribute('uv'), col = g.getAttribute('color')
      if (!pos || !nor || !uv || !col) { base = -1; break }
      m4.copy(inv).multiply(mesh.matrixWorld)
      nm.getNormalMatrix(m4)
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m4); P.push(v.x, v.y, v.z)
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z)
        U.push(uv.getX(i), uv.getY(i))
        CO.push(col.getX(i), col.getY(i), col.getZ(i))
      }
      const idx = g.getIndex()
      if (idx) for (let i = 0; i < idx.count; i++) IDX.push(idx.getX(i) + base)
      else for (let i = 0; i < pos.count; i++) IDX.push(i + base)
      base += pos.count
      cast = cast || mesh.castShadow
    }
    if (base < 0) continue
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3))
    g.setIndex(IDX)
    g.computeBoundingSphere(); g.computeBoundingBox()
    g.userData.bevelled = true
    const out = new THREE.Mesh(g, mat)
    out.name = `${root.name || 'part'}:${mat.name || 'mat'}`
    out.castShadow = cast
    out.receiveShadow = true
    for (const mesh of list) mesh.parent.remove(mesh)
    root.add(out)
  }
}

function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}
  // per-BUILD factory: two peepees in a mirror match must not share materials,
  // or Fighter.flash() on one would flash the other (see makeMaterials()).
  const MAT = makeMaterials()

  const hips = pivot(group, 0, 0.62, 0) // FROZEN — every clip writes this pos track
  bones.hips = hips
  const torso = pivot(hips, 0, 0.04, 0)
  bones.torso = torso
  buildBody(hips, torso, MAT)

  for (const side of [1, -1]) {
    const leg = pivot(hips, -0.02, -0.06, 0.17 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    const shin = pivot(leg, 0, -0.228, 0.13 * side)
    bones[side === 1 ? 'shinL' : 'shinR'] = shin
    buildLeg(leg, shin, side, MAT)
  }

  for (const side of [1, -1]) {
    const arm = pivot(torso, 0.02, 0.4, 0.24 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    const fore = pivot(arm, 0, -0.2037, 0.0508 * side)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    buildArm(arm, fore, side, MAT)
  }

  buildShirt(torso, bones.armL, bones.armR, MAT)
  if (costume === 1) buildJacket(torso, bones.armL, bones.armR, MAT)

  // OVERSIZED gold tie — an ACCESSORY_BONE in Gore.js, so this subtree stays
  // clean: every tie mesh parents to `tie` and nothing else parents under it.
  const tie = pivot(torso, 0.24, 0.38, 0)
  bones.tie = tie
  buildTie(tie, MAT)

  const head = pivot(torso, 0.05, 0.52, 0)
  bones.head = head
  buildHead(head, MAT, costume)

  const tongue = pivot(head, 0.2, -0.06, 0)
  bones.tongue = tongue
  buildTongue(tongue, MAT)

  for (const side of [1, -1]) {
    // §3.2 asymmetry: the right dome is 6.8 % larger and sits 0.007 lower.
    const ey = side === 1 ? 0.185 : 0.178
    const r = side === 1 ? 0.1175 : 0.1255
    const eye = pivot(head, 0.2, ey, 0.145 * side)
    bones[side === 1 ? 'eyeL' : 'eyeR'] = eye
    buildEye(eye, side, MAT, costume)
    // The collar fillet belongs to the SKULL, not the eye — the gaze swivels,
    // the ring of skin does not. Swept along the real intersection curve.
    // §2 negative space #1: 0.055 m of daylight between the domes, cutting
    // 0.0625 down to the FLAT plate. Round 1 swept the collar at a constant
    // 0.020, so the two medial arcs met over the bridge and walled the V-notch
    // shut — the exact failure that turns this into a generic round-headed
    // cartoon animal at 128 px. The tube now tapers to 0.006 on the medial arc
    // (theta 3pi/2 for the left eye, pi/2 for the right) and holds full section
    // on the lateral arc, where §5's rim light has to catch it.
    const medial = (t) => -Math.sin(t * Math.PI * 2) * side
    const col = splineTube(collarCurve(0.2, ey, 0.145 * side, r, 0.96, 40), 0.02, 36,
      (t) => 0.02 * (0.3 + 0.35 * (1 - medial(t))),
      { radialSeg: 8, closed: true, unique: true })
    paintSkin(col, HEAD_ORG, { vent: headVent, lit: 1.4 })
    put(head, col, MAT.skin).name = 'eyeCollar'
  }

  // Draw-call hygiene. Collapse the meshes under each bone into one mesh per
  // material; the filter guarantees nothing is ever baked across a bone
  // boundary, so animation is bit-identical. lidL/lidR keep their identity so
  // the §8 face-pose stack has something to drive.
  for (const [k, b] of Object.entries(bones)) b.name = k
  group.updateMatrixWorld(true)
  const roots = Object.values(bones)
  group.traverse((o) => {
    if (o.isGroup && (o.name === 'lidL' || o.name === 'lidR')) { o.userData.isBone = true; roots.push(o) }
  })
  if (!DEBUG_NO_MERGE) for (const r of roots) collapse(r)

  group.traverse((o) => {
    if (!o.isMesh) return
    const m = o.material
    o.castShadow = !(m && m.transparent && (m.opacity ?? 1) < 0.65)
    o.receiveShadow = true
  })
  // This file has done its own per-region art direction; Fighter's bulk
  // upgradeMaterials() floor must not second-guess it (src/render/README §4).
  group.userData.skipMaterialUpgrade = true
  group.userData.materialFactory = MAT.factory

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.62,0]
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.62, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.0, loop: true,
    tracks: {
      // throat-bob breathing + shifty trader eyes
      hips: [K(0, Z, HIP), K(1.0, [0, 0, 0.02], [0, 0.595, 0]), K(2.0, Z, HIP)],
      torso: [K(0, [0, 0, 0.03]), K(0.5, [0, 0, -0.02]), K(1.0, [0.02, 0, 0.04]), K(2.0, [0, 0, 0.03])],
      head: [K(0, [0, 0, -0.03]), K(1.0, [0, 0.06, 0.04]), K(2.0, [0, 0, -0.03])],
      eyeL: [K(0, Z), K(0.5, [0, 0.5, 0]), K(0.8, [0, 0.5, 0]), K(1.0, [0, -0.45, 0]), K(1.5, [0, -0.45, 0]), K(1.8, Z), K(2.0, Z)],
      eyeR: [K(0, Z), K(0.55, [0, 0.5, 0]), K(0.85, [0, 0.5, 0]), K(1.05, [0, -0.45, 0]), K(1.55, [0, -0.45, 0]), K(1.85, Z), K(2.0, Z)],
      tie: [K(0, Z), K(1.0, [0, 0, 0.08]), K(2.0, Z)],
      armL: [K(0, [0, 0, 0.12]), K(1.0, [0.05, 0, 0.18]), K(2.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(1.0, [-0.05, 0, 0.2]), K(2.0, [0, 0, 0.14])],
      forearmL: [K(0, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 0.35])],
      legL: [K(0, [0, 0, 0.15])], legR: [K(0, [0, 0, 0.15])],
      shinL: [K(0, [0, 0, -0.15])], shinR: [K(0, [0, 0, -0.15])],
      tongue: [K(0, Z)],
    },
  },

  walk: {
    duration: 0.5, loop: true,
    tracks: {
      // quick springy hop-steps, tie flopping
      hips: [K(0, [0, 0, 0.04], [0, 0.58, 0]), K(0.125, [0, 0, 0], [0, 0.68, 0]), K(0.25, [0, 0, 0.04], [0, 0.58, 0]), K(0.375, [0, 0, 0], [0, 0.68, 0]), K(0.5, [0, 0, 0.04], [0, 0.58, 0])],
      legL: [K(0, [0, 0, 0.7]), K(0.25, [0, 0, -0.6]), K(0.5, [0, 0, 0.7])],
      legR: [K(0, [0, 0, -0.6]), K(0.25, [0, 0, 0.7]), K(0.5, [0, 0, -0.6])],
      shinL: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, -0.1]), K(0.5, [0, 0, -0.5])],
      shinR: [K(0, [0, 0, -0.1]), K(0.25, [0, 0, -0.5]), K(0.5, [0, 0, -0.1])],
      torso: [K(0, [0, 0.05, -0.06]), K(0.25, [0, -0.05, -0.06]), K(0.5, [0, 0.05, -0.06])],
      head: [K(0, [0, -0.05, 0.06]), K(0.25, [0, 0.05, 0.06]), K(0.5, [0, -0.05, 0.06])],
      armL: [K(0, [0, 0, -0.35]), K(0.25, [0, 0, 0.45]), K(0.5, [0, 0, -0.35])],
      armR: [K(0, [0, 0, 0.45]), K(0.25, [0, 0, -0.35]), K(0.5, [0, 0, 0.45])],
      forearmL: [K(0, [0, 0, 0.4])], forearmR: [K(0, [0, 0, 0.4])],
      tie: [K(0, [0, 0, 0.25]), K(0.125, [0, 0, -0.15]), K(0.25, [0, 0, 0.25]), K(0.375, [0, 0, -0.15]), K(0.5, [0, 0, 0.25])],
      eyeL: [K(0, Z)], eyeR: [K(0, Z)],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      // deep frog squat then full leg extension — this is his natural habitat
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.1], [0, 0.66, 0]), K(0.5, [0, 0, 0.1], [0, 0.66, 0])],
      legL: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.5, [0, 0, -0.4])],
      legR: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.5, [0, 0, -0.4])],
      shinL: [K(0, [0, 0, -0.15]), K(0.1, [0, 0, 0.6]), K(0.5, [0, 0, 0.5])],
      shinR: [K(0, [0, 0, -0.15]), K(0.1, [0, 0, 0.6]), K(0.5, [0, 0, 0.5])],
      armL: [K(0, Z), K(0.1, [-0.4, 0, 1.6]), K(0.5, [-0.4, 0, 1.4])],
      armR: [K(0, Z), K(0.1, [0.4, 0, 1.6]), K(0.5, [0.4, 0, 1.4])],
      torso: [K(0, Z), K(0.1, [0, 0, 0.15])],
      head: [K(0, Z), K(0.1, [0, 0, -0.12])],
      tie: [K(0, Z), K(0.1, [0, 0, -0.7]), K(0.5, [0, 0, -0.5])],
      eyeL: [K(0, Z), K(0.1, [-0.2, 0, 0])], eyeR: [K(0, Z), K(0.1, [-0.2, 0, 0])],
    },
  },

  fall: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.06], HIP)],
      torso: [K(0, [0, 0, 0.12])],
      head: [K(0, [0, 0, -0.08])],
      armL: [K(0, [-0.4, 0, 2.3]), K(0.25, [-0.6, 0, 2.6]), K(0.5, [-0.4, 0, 2.3])],
      armR: [K(0, [0.6, 0, 2.6]), K(0.25, [0.4, 0, 2.3]), K(0.5, [0.6, 0, 2.6])],
      legL: [K(0, [-0.3, 0, 0.5]), K(0.25, [-0.3, 0, 0.3]), K(0.5, [-0.3, 0, 0.5])],
      legR: [K(0, [0.3, 0, 0.3]), K(0.25, [0.3, 0, 0.5]), K(0.5, [0.3, 0, 0.3])],
      shinL: [K(0, [0, 0, -0.4])], shinR: [K(0, [0, 0, -0.4])],
      tie: [K(0, [0, 0, -1.1]), K(0.25, [0, 0, -0.9]), K(0.5, [0, 0, -1.1])],
      eyeL: [K(0, [0.15, 0, 0])], eyeR: [K(0, [0.15, 0, 0])],
    },
  },

  crouch: {
    duration: 0.8, loop: true,
    tracks: {
      // frogs were BORN to crouch — full squat, knuckles down
      hips: [K(0, [0, 0, 0.06], [0, 0.36, 0]), K(0.4, [0, 0, 0.06], [0, 0.345, 0]), K(0.8, [0, 0, 0.06], [0, 0.36, 0])],
      legL: [K(0, [-0.35, 0, -0.85])], legR: [K(0, [0.35, 0, -0.85])],
      shinL: [K(0, [0, 0, 0.95])], shinR: [K(0, [0, 0, 0.95])],
      torso: [K(0, [0, 0, -0.12])],
      head: [K(0, [0, 0, 0.14])],
      armL: [K(0, [0.25, 0, -0.5])], armR: [K(0, [-0.25, 0, -0.5])],
      forearmL: [K(0, [0, 0, 0.25])], forearmR: [K(0, [0, 0, 0.25])],
      eyeL: [K(0, Z), K(0.4, [0, 0.4, 0]), K(0.8, Z)],
      eyeR: [K(0, Z), K(0.4, [0, -0.4, 0]), K(0.8, Z)],
      tie: [K(0, [0, 0, 0.35])],
    },
  },

  block: {
    duration: 0.6, loop: true,
    tracks: {
      // puffs up and hides behind sticky pads
      hips: [K(0, Z, [-0.03, 0.58, 0])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, 0.13]), K(0.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.18])],
      armL: [K(0, [0.3, 0, 0.95])], armR: [K(0, [-0.3, 0, 1.0])],
      forearmL: [K(0, [0, 0, 1.7])], forearmR: [K(0, [0, 0, 1.8])],
      legL: [K(0, [-0.12, 0, 0.05])], legR: [K(0, [0.12, 0, 0.05])],
      eyeL: [K(0, [0.35, 0, 0])], eyeR: [K(0, [0.35, 0, 0])], // lids down, braced
      tie: [K(0, [0, 0, 0.2])],
    },
  },

  hitLight: {
    duration: 0.28, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.12], [-0.06, 0.6, 0]), K(0.28, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.1, 0.3]), K(0.28, Z)],
      head: [K(0, Z), K(0.05, [0, 0.12, 0.45]), K(0.28, Z)],
      armL: [K(0, Z), K(0.05, [0.35, 0, -0.5]), K(0.28, Z)],
      armR: [K(0, Z), K(0.05, [-0.35, 0, -0.45]), K(0.28, Z)],
      eyeL: [K(0, Z), K(0.06, [0, 0, 0.6]), K(0.28, Z)],
      eyeR: [K(0, Z), K(0.06, [0, 0, -0.6]), K(0.28, Z)],
      tie: [K(0, Z), K(0.06, [0, 0, -0.6]), K(0.28, Z)],
      tongue: [K(0, Z), K(0.07, [0, 0, -0.5], [0.12, 0, 0]), K(0.28, Z)], // bleh
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.25], [-0.16, 0.56, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.15, 0.5]), K(0.42, Z)],
      head: [K(0, Z), K(0.06, [0, 0.15, 0.7]), K(0.42, Z)],
      armL: [K(0, Z), K(0.06, [0.55, 0, -1.1]), K(0.42, Z)],
      armR: [K(0, Z), K(0.06, [-0.55, 0, -1.0]), K(0.42, Z)],
      legL: [K(0, Z), K(0.07, [0, 0, 0.5]), K(0.42, Z)],
      eyeL: [K(0, Z), K(0.07, [0, 0.7, 0.3]), K(0.42, Z)],
      eyeR: [K(0, Z), K(0.07, [0, -0.7, -0.3]), K(0.42, Z)],
      tie: [K(0, Z), K(0.07, [0, 0, -1.3]), K(0.2, [0, 0, -0.6]), K(0.42, Z)],
      tongue: [K(0, Z), K(0.08, [0, 0.3, -0.8], [0.3, 0, 0]), K(0.42, Z)], // full bleh
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
      legL: [K(0, [0, 0, 1.0]), K(0.25, [0, 0, 0.8]), K(0.5, [0, 0, 1.0])],
      legR: [K(0, [0, 0, 0.7]), K(0.25, [0, 0, 0.9]), K(0.5, [0, 0, 0.7])],
      shinL: [K(0, [0, 0, -0.8])], shinR: [K(0, [0, 0, -0.8])],
      tie: [K(0, [0, 0, -1.5])],
      eyeL: [K(0, [0, 0, 0.9])], eyeR: [K(0, [0, 0, -0.9])], // swirly-eyed
      tongue: [K(0, [0, 0.2, -0.9], [0.35, 0, 0])],
    },
  },

  knockdown: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.28, 0]), K(0.45, [0, 0, 1.4], [0, 0.29, 0]), K(0.9, [0, 0, 1.4], [0, 0.28, 0])],
      legL: [K(0, [0, 0, 0.4])], legR: [K(0, [0, 0, 0.6])],
      shinL: [K(0, [0, 0, -0.3])], shinR: [K(0, [0, 0, -0.5])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.3])],
      armL: [K(0, [1.1, 0, 0.3])], armR: [K(0, [-1.1, 0, 0.3])],
      tie: [K(0, [0, 0, -1.6])], // tie flopped over his face
      eyeL: [K(0, [0.5, 0, 0])], eyeR: [K(0, [0.5, 0, 0])],
      tongue: [K(0, [0, 0, -0.6], [0.28, 0, 0])],
    },
  },

  getup: {
    duration: 0.7, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.28, 0]), K(0.25, [0, 0, 0.5], [0, 0.42, 0]), K(0.5, [0, 0, 0.08], [0, 0.56, 0]), K(0.7, Z, HIP)],
      legL: [K(0, [0, 0, 0.4]), K(0.35, [0, 0, -0.6]), K(0.7, Z)],
      legR: [K(0, [0, 0, 0.6]), K(0.35, [0, 0, -0.6]), K(0.7, Z)],
      shinL: [K(0, [0, 0, -0.3]), K(0.35, [0, 0, 0.7]), K(0.7, [0, 0, -0.15])],
      shinR: [K(0, [0, 0, -0.5]), K(0.35, [0, 0, 0.7]), K(0.7, [0, 0, -0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, -0.3]), K(0.7, Z)],
      head: [K(0, [0, 0, -0.3]), K(0.5, [0, 0, 0.1]), K(0.7, Z)],
      armL: [K(0, [1.1, 0, 0.3]), K(0.35, [0.3, 0, -0.5]), K(0.7, Z)],
      armR: [K(0, [-1.1, 0, 0.3]), K(0.35, [-0.3, 0, -0.5]), K(0.7, Z)],
      // flips the tie back over his shoulder with great dignity
      tie: [K(0, [0, 0, -1.6]), K(0.45, [0, 0, -1.6]), K(0.58, [0, 0, 1.2]), K(0.7, Z)],
      eyeL: [K(0, [0.5, 0, 0]), K(0.55, Z), K(0.7, Z)],
      eyeR: [K(0, [0.5, 0, 0]), K(0.55, Z), K(0.7, Z)],
      tongue: [K(0, [0, 0, -0.6], [0.28, 0, 0]), K(0.3, Z, [0, 0, 0])],
    },
  },

  // three big hops in, straightens the giant tie, checks an imaginary chart
  entrance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.4, 0]), K(0.2, Z, [0, 0.75, 0]), K(0.4, Z, [0, 0.45, 0]), K(0.6, Z, [0, 0.78, 0]), K(0.8, Z, [0, 0.42, 0]), K(1.0, Z, [0, 0.7, 0]), K(1.15, Z, HIP), K(2.4, Z, HIP)],
      legL: [K(0, [0, 0, -0.7]), K(0.2, [0, 0, 0.4]), K(0.4, [0, 0, -0.7]), K(0.6, [0, 0, 0.4]), K(0.8, [0, 0, -0.7]), K(1.0, [0, 0, 0.3]), K(1.15, Z), K(2.4, Z)],
      legR: [K(0, [0, 0, -0.7]), K(0.2, [0, 0, 0.4]), K(0.4, [0, 0, -0.7]), K(0.6, [0, 0, 0.4]), K(0.8, [0, 0, -0.7]), K(1.0, [0, 0, 0.3]), K(1.15, Z), K(2.4, Z)],
      shinL: [K(0, [0, 0, 0.9]), K(0.2, [0, 0, -0.3]), K(0.4, [0, 0, 0.9]), K(0.6, [0, 0, -0.3]), K(0.8, [0, 0, 0.9]), K(1.15, [0, 0, -0.15]), K(2.4, [0, 0, -0.15])],
      shinR: [K(0, [0, 0, 0.9]), K(0.2, [0, 0, -0.3]), K(0.4, [0, 0, 0.9]), K(0.6, [0, 0, -0.3]), K(0.8, [0, 0, 0.9]), K(1.15, [0, 0, -0.15]), K(2.4, [0, 0, -0.15])],
      // straighten the tie... it immediately flops back
      armL: [K(0, [0, 0, 0.12]), K(1.3, [0.15, 0, 0.9]), K(1.7, [0.15, 0, 0.9]), K(1.9, [0, 0, 0.12]), K(2.4, [0, 0, 0.12])],
      forearmL: [K(0, [0, 0, 0.35]), K(1.3, [0, 0, 1.5]), K(1.7, [0, 0, 1.5]), K(1.9, [0, 0, 0.35]), K(2.4, [0, 0, 0.35])],
      tie: [K(0, [0, 0, -0.9]), K(1.15, [0, 0, 0.3]), K(1.45, [0, 0.15, -0.35]), K(1.7, [0, -0.1, 0.25]), K(1.85, [0, 0, -0.15]), K(2.0, [0, 0, 0.1]), K(2.4, Z)],
      // then holds up a palm and studies it like a phone with charts on it
      armR: [K(0, [0, 0, 0.14]), K(1.9, [0, 0, 0.14]), K(2.05, [-0.3, 0, 1.3]), K(2.4, [-0.3, 0, 1.3])],
      forearmR: [K(0, [0, 0, 0.35]), K(2.05, [0, 0, 1.9]), K(2.4, [0, 0, 1.9])],
      head: [K(0, [0, 0, 0.1]), K(1.15, Z), K(1.5, [0, 0, 0.2]), K(2.05, [0, 0.2, 0.25]), K(2.4, [0, 0.2, 0.25])],
      eyeL: [K(0, Z), K(2.05, [0.3, 0.3, 0]), K(2.4, [0.3, 0.3, 0])],
      eyeR: [K(0, Z), K(2.05, [0.3, 0.3, 0]), K(2.4, [0.3, 0.3, 0])],
      torso: [K(0, [0, 0, 0.1]), K(1.15, Z), K(2.4, Z)],
    },
  },

  // belly-drum victory bounce, tie helicoptering
  win: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.56, 0]), K(0.25, Z, [0, 0.72, 0]), K(0.5, Z, [0, 0.56, 0]), K(0.75, Z, [0, 0.72, 0]), K(1.0, Z, [0, 0.56, 0]), K(1.25, Z, [0, 0.72, 0]), K(1.5, Z, [0, 0.56, 0]), K(2.0, Z, [0, 0.56, 0])],
      torso: [K(0, [0, 0, 0.12]), K(1.5, [0, 0, 0.12]), K(1.75, [0, 0.3, 0.1]), K(2.0, [0, 0, 0.12])],
      armL: [K(0, [0.3, 0, 0.7]), K(0.25, [0.3, 0, -0.2]), K(0.5, [0.3, 0, 0.7]), K(0.75, [0.3, 0, -0.2]), K(1.0, [0.3, 0, 0.7]), K(1.25, [0.3, 0, -0.2]), K(1.5, [0.3, 0, 0.7]), K(2.0, [0.3, 0, 0.7])],
      armR: [K(0, [-0.3, 0, -0.2]), K(0.25, [-0.3, 0, 0.7]), K(0.5, [-0.3, 0, -0.2]), K(0.75, [-0.3, 0, 0.7]), K(1.0, [-0.3, 0, -0.2]), K(1.25, [-0.3, 0, 0.7]), K(1.5, [-0.3, 0, -0.2]), K(2.0, [-0.3, 0, -0.2])],
      forearmL: [K(0, [0, 0, 1.1])], forearmR: [K(0, [0, 0, 1.1])],
      head: [K(0, [0, 0, 0.15]), K(0.5, [0, 0.2, 0.15]), K(1.0, [0, -0.2, 0.15]), K(1.5, [0, 0, 0.15]), K(2.0, [0, 0, 0.15])],
      tie: [K(0, [0, 0, -0.4]), K(0.25, [0, 0.5, -1.2]), K(0.5, [0, -0.5, -0.4]), K(0.75, [0, 0.5, -1.2]), K(1.0, [0, -0.5, -0.4]), K(1.25, [0, 0.5, -1.2]), K(1.5, [0, 0, -0.4]), K(2.0, [0, 0, -0.4])],
      eyeL: [K(0, Z), K(1.75, [0, 0.4, 0]), K(2.0, Z)],
      eyeR: [K(0, Z), K(1.75, [0, -0.4, 0]), K(2.0, Z)],
      tongue: [K(0, Z), K(1.6, [0, 0, -0.7], [0.3, 0, 0]), K(1.9, Z, [0, 0, 0]), K(2.0, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  lose: {
    duration: 2.0, loop: true,
    tracks: {
      // deflated puddle of a frog, checking the chart one last time
      hips: [K(0, [0, 0, 0.15], [0, 0.4, 0]), K(1.0, [0, 0, 0.15], [0, 0.39, 0]), K(2.0, [0, 0, 0.15], [0, 0.4, 0])],
      legL: [K(0, [-0.35, 0, -0.8])], legR: [K(0, [0.35, 0, -0.8])],
      shinL: [K(0, [0, 0, 0.9])], shinR: [K(0, [0, 0, 0.9])],
      torso: [K(0, [0, 0, -0.35]), K(1.0, [0, 0, -0.4]), K(2.0, [0, 0, -0.35])],
      head: [K(0, [0, 0, -0.45]), K(1.2, [0, 0.15, -0.5]), K(2.0, [0, 0, -0.45])],
      armL: [K(0, [0, 0, 0.35])],
      armR: [K(0, [-0.2, 0, 1.1]), K(1.2, [-0.2, 0, 1.15]), K(2.0, [-0.2, 0, 1.1])],
      forearmR: [K(0, [0, 0, 1.7])],
      tie: [K(0, [0, 0, 0.55])], // tie flopped over the head like a tiny blanket
      eyeL: [K(0, [0.55, 0.2, 0])], eyeR: [K(0, [0.55, -0.2, 0])],
      tongue: [K(0, [0, 0, -0.5], [0.2, 0, 0])],
    },
  },

  taunt: {
    duration: 1.4, loop: false,
    tracks: {
      // flips the tie like a feather boa, slow sarcastic clap
      tie: [K(0, Z), K(0.2, [0, 0.3, 1.3]), K(0.5, [0, -0.2, -0.6]), K(0.8, [0, 0.2, 0.4]), K(1.1, [0, 0, -0.2]), K(1.4, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.3, [0.4, 0, 1.0]), K(0.5, [0.4, 0, 0.7]), K(0.7, [0.4, 0, 1.0]), K(0.9, [0.4, 0, 0.7]), K(1.1, [0.4, 0, 1.0]), K(1.4, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.3, [-0.4, 0, 1.0]), K(0.5, [-0.4, 0, 0.7]), K(0.7, [-0.4, 0, 1.0]), K(0.9, [-0.4, 0, 0.7]), K(1.1, [-0.4, 0, 1.0]), K(1.4, [0, 0, 0.14])],
      forearmL: [K(0, [0, 0, 0.35]), K(0.3, [0, 0, 1.2]), K(1.4, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 0.35]), K(0.3, [0, 0, 1.2]), K(1.4, [0, 0, 0.35])],
      head: [K(0, Z), K(0.3, [0, 0, 0.25]), K(0.6, [0, 0.3, 0.2]), K(0.9, [0, -0.3, 0.2]), K(1.2, Z), K(1.4, Z)],
      eyeL: [K(0, Z), K(0.3, [0.4, 0, 0]), K(1.2, [0.4, 0, 0]), K(1.4, Z)], // unimpressed lids
      eyeR: [K(0, Z), K(0.3, [0.4, 0, 0]), K(1.2, [0.4, 0, 0]), K(1.4, Z)],
      tongue: [K(0, Z), K(0.5, [0, 0, -0.6], [0.25, 0, 0]), K(0.9, [0, 0, -0.6], [0.25, 0, 0]), K(1.2, Z, [0, 0, 0]), K(1.4, Z)],
      torso: [K(0, Z), K(0.3, [0, 0, 0.1]), K(1.4, Z)],
      hips: [K(0, Z, HIP)],
    },
  },

  // ----------------------------------------------------------- move clips --
  tongueJab: {
    duration: 0.3, loop: false,
    tracks: {
      head: [K(0, Z), K(0.06, [0, 0, -0.2]), K(0.12, [0, 0, 0.3]), K(0.3, Z)],
      tongue: [K(0, Z), K(0.06, [0, 0, 0.2], [-0.05, 0, 0]), K(0.12, [0, 0, -0.85], [0.55, 0.02, 0]), K(0.2, [0, 0, -0.85], [0.45, 0.02, 0]), K(0.3, Z, [0, 0, 0])],
      torso: [K(0, Z), K(0.12, [0, 0, 0.12]), K(0.3, Z)],
      hips: [K(0, Z, HIP), K(0.12, Z, [0.04, 0.63, 0]), K(0.3, Z, HIP)],
      eyeL: [K(0, Z), K(0.12, [-0.25, 0, 0]), K(0.3, Z)],
      eyeR: [K(0, Z), K(0.12, [-0.25, 0, 0]), K(0.3, Z)],
      armL: [K(0, [0, 0, 0.12])], armR: [K(0, [0, 0, 0.14])],
      tie: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.3, Z)],
    },
  },

  tieWhip: {
    duration: 0.35, loop: false,
    tracks: {
      // grabs the giant tie and cracks it like a whip
      armR: [K(0, Z), K(0.08, [-0.2, 0, 1.6]), K(0.16, [0.3, 0, 0.2]), K(0.35, [0, 0, 0.14])],
      forearmR: [K(0, [0, 0, 0.35]), K(0.08, [0, 0, 1.0]), K(0.16, [0, 0, -0.2]), K(0.35, [0, 0, 0.35])],
      tie: [K(0, Z), K(0.08, [0, 0, 1.5]), K(0.16, [0, 0, -1.9]), K(0.24, [0, 0, -1.4]), K(0.35, Z)],
      torso: [K(0, Z), K(0.08, [0, -0.3, 0]), K(0.16, [0, 0.4, -0.1]), K(0.35, Z)],
      hips: [K(0, Z, HIP), K(0.16, [0, 0.2, 0], [0.05, 0.6, 0]), K(0.35, Z, HIP)],
      head: [K(0, Z), K(0.16, [0, 0.15, -0.1]), K(0.35, Z)],
      eyeL: [K(0, Z), K(0.16, [-0.2, 0, 0]), K(0.35, Z)],
      eyeR: [K(0, Z), K(0.16, [-0.2, 0, 0]), K(0.35, Z)],
    },
  },

  eyePoke: {
    duration: 0.6, loop: false,
    tracks: {
      // big obvious wind-up... nothing... THEN the poke
      armL: [K(0, [0, 0, 0.12]), K(0.1, [0.2, 0, 1.9]), K(0.18, [0.1, 0, 1.4]), K(0.26, [0.1, 0, 1.5]), K(0.3, [0, 0, -0.3]), K(0.36, [0, 0, 1.2]), K(0.6, [0, 0, 0.12])],
      forearmL: [K(0, [0, 0, 0.35]), K(0.1, [0, 0, 0.1]), K(0.3, [0, 0, 0.4]), K(0.36, [0, 0, -0.1]), K(0.6, [0, 0, 0.35])],
      torso: [K(0, Z), K(0.1, [0, -0.35, 0]), K(0.26, [0, -0.3, 0]), K(0.36, [0, 0.4, -0.1]), K(0.6, Z)],
      head: [K(0, Z), K(0.1, [0, 0.2, 0.1]), K(0.26, [0, 0.25, 0.1]), K(0.36, [0, -0.1, -0.05]), K(0.6, Z)],
      // the eyes sell the fake: look one way, strike the other
      eyeL: [K(0, Z), K(0.1, [0, 0.6, 0]), K(0.28, [0, 0.6, 0]), K(0.36, [0, -0.5, 0]), K(0.6, Z)],
      eyeR: [K(0, Z), K(0.1, [0, 0.6, 0]), K(0.28, [0, 0.6, 0]), K(0.36, [0, -0.5, 0]), K(0.6, Z)],
      hips: [K(0, Z, HIP), K(0.3, Z, [-0.03, 0.6, 0]), K(0.36, Z, [0.06, 0.62, 0]), K(0.6, Z, HIP)],
      tie: [K(0, Z), K(0.36, [0, 0, -0.5]), K(0.6, Z)],
    },
  },

  bellyFlop: {
    duration: 0.75, loop: false,
    tracks: {
      // squat, launch, full horizontal spread-eagle flop
      hips: [K(0, Z, HIP), K(0.08, [0, 0, 0.1], [0, 0.44, 0]), K(0.2, [0, 0, 0.9], [0.1, 0.85, 0]), K(0.34, [0, 0, 1.5], [0.16, 0.6, 0]), K(0.44, [0, 0, 1.5], [0.1, 0.42, 0]), K(0.56, [0, 0, 0.5], [0, 0.5, 0]), K(0.75, Z, HIP)],
      legL: [K(0, Z), K(0.08, [0, 0, -0.6]), K(0.2, [0, 0, 0.6]), K(0.44, [0, 0, 0.4]), K(0.75, Z)],
      legR: [K(0, Z), K(0.08, [0, 0, -0.6]), K(0.2, [0, 0, 0.6]), K(0.44, [0, 0, 0.4]), K(0.75, Z)],
      shinL: [K(0, [0, 0, -0.15]), K(0.08, [0, 0, 0.7]), K(0.2, [0, 0, -0.5]), K(0.75, [0, 0, -0.15])],
      shinR: [K(0, [0, 0, -0.15]), K(0.08, [0, 0, 0.7]), K(0.2, [0, 0, -0.5]), K(0.75, [0, 0, -0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.2, [-1.2, 0, 1.4]), K(0.44, [-1.3, 0, 1.5]), K(0.75, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.2, [1.2, 0, 1.4]), K(0.44, [1.3, 0, 1.5]), K(0.75, [0, 0, 0.14])],
      torso: [K(0, Z), K(0.2, [0, 0, 0.2]), K(0.44, [0, 0, 0.1]), K(0.75, Z)],
      head: [K(0, Z), K(0.2, [0, 0, 0.35]), K(0.44, [0, 0, 0.4]), K(0.75, Z)],
      tie: [K(0, Z), K(0.2, [0, 0, -1.7]), K(0.44, [0, 0, -1.7]), K(0.6, [0, 0, 0.4]), K(0.75, Z)],
      eyeL: [K(0, Z), K(0.34, [0, 0, 0.5]), K(0.75, Z)],
      eyeR: [K(0, Z), K(0.34, [0, 0, -0.5]), K(0.75, Z)],
    },
  },

  frogKick: {
    duration: 0.4, loop: false,
    tracks: {
      // spring-loaded double-foot kick, shin stretching elastically
      hips: [K(0, Z, HIP), K(0.08, [0, 0, 0.15], [-0.06, 0.5, 0]), K(0.16, [0, 0, -0.35], [0.12, 0.72, 0]), K(0.28, [0, 0, -0.1], [0.04, 0.62, 0]), K(0.4, Z, HIP)],
      legL: [K(0, Z), K(0.08, [0, 0, -0.8]), K(0.16, [0, 0, 1.5]), K(0.28, [0, 0, 0.8]), K(0.4, Z)],
      shinL: [K(0, [0, 0, -0.15]), K(0.08, [0, 0, 1.0]), K(0.16, [0, 0, 0.1], [0, -0.22, 0]), K(0.28, [0, 0, 0.2], [0, 0, 0]), K(0.4, [0, 0, -0.15])],
      legR: [K(0, Z), K(0.08, [0, 0, -0.5]), K(0.16, [0, 0, 0.3]), K(0.4, Z)],
      torso: [K(0, Z), K(0.08, [0, 0, 0.25]), K(0.16, [0, 0, -0.4]), K(0.4, Z)],
      head: [K(0, Z), K(0.16, [0, 0, 0.3]), K(0.4, Z)],
      armL: [K(0, Z), K(0.16, [0.3, 0, -1.0]), K(0.4, [0, 0, 0.12])],
      armR: [K(0, Z), K(0.16, [-0.3, 0, -1.0]), K(0.4, [0, 0, 0.14])],
      tie: [K(0, Z), K(0.16, [0, 0, -1.2]), K(0.4, Z)],
      eyeL: [K(0, Z), K(0.16, [-0.3, 0, 0]), K(0.4, Z)],
      eyeR: [K(0, Z), K(0.16, [-0.3, 0, 0]), K(0.4, Z)],
    },
  },

  slimeSlide: {
    duration: 0.55, loop: false,
    tracks: {
      // low grease-slide, one leg out like a hockey stop
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.5], [0.05, 0.34, 0]), K(0.35, [0, 0, 0.55], [0.1, 0.3, 0]), K(0.45, [0, 0, 0.2], [0, 0.48, 0]), K(0.55, Z, HIP)],
      legL: [K(0, Z), K(0.1, [0, 0, 1.3]), K(0.35, [0, 0, 1.35]), K(0.55, Z)],
      shinL: [K(0, [0, 0, -0.15]), K(0.1, [0, 0, 0.1], [0, -0.18, 0]), K(0.35, [0, 0, 0.1], [0, -0.18, 0]), K(0.55, [0, 0, -0.15], [0, 0, 0])],
      legR: [K(0, Z), K(0.1, [-0.4, 0, -0.9]), K(0.35, [-0.4, 0, -0.9]), K(0.55, Z)],
      shinR: [K(0, [0, 0, -0.15]), K(0.1, [0, 0, 1.1]), K(0.35, [0, 0, 1.1]), K(0.55, [0, 0, -0.15])],
      torso: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.35, [0, 0, -0.3]), K(0.55, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.25]), K(0.35, [0, 0, 0.25]), K(0.55, Z)],
      armL: [K(0, Z), K(0.1, [0.4, 0, -0.9]), K(0.35, [0.4, 0, -0.9]), K(0.55, [0, 0, 0.12])],
      armR: [K(0, Z), K(0.1, [-0.5, 0, 0.8]), K(0.35, [-0.5, 0, 0.8]), K(0.55, [0, 0, 0.14])],
      tie: [K(0, Z), K(0.1, [0, 0, -1.4]), K(0.35, [0, 0, -1.4]), K(0.55, Z)],
      eyeL: [K(0, Z), K(0.2, [0, 0.3, 0]), K(0.55, Z)],
      eyeR: [K(0, Z), K(0.2, [0, 0.3, 0]), K(0.55, Z)],
    },
  },

  inflate: {
    duration: 0.6, loop: false,
    tracks: {
      // sucks in a huge breath and becomes a balloon with limbs
      hips: [K(0, Z, HIP), K(0.1, Z, [0, 0.66, 0]), K(0.45, [0, 0, 0.05], [0, 0.68, 0]), K(0.52, Z, [0, 0.58, 0]), K(0.6, Z, HIP)],
      torso: [K(0, [0, 0, 0.05]), K(0.1, [0, 0, 0.35]), K(0.45, [0, 0, 0.4]), K(0.52, [0, 0, 0.1]), K(0.6, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.45]), K(0.45, [0, 0, -0.5]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.1, [0.9, 0, 0.7]), K(0.45, [1.0, 0, 0.75]), K(0.6, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.1, [-0.9, 0, 0.7]), K(0.45, [-1.0, 0, 0.75]), K(0.6, [0, 0, 0.14])],
      forearmL: [K(0, [0, 0, 0.35]), K(0.1, [0, 0, 0.1]), K(0.6, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 0.35]), K(0.1, [0, 0, 0.1]), K(0.6, [0, 0, 0.35])],
      legL: [K(0, Z), K(0.1, [0.4, 0, 0.2]), K(0.45, [0.4, 0, 0.2]), K(0.6, Z)],
      legR: [K(0, Z), K(0.1, [-0.4, 0, 0.2]), K(0.45, [-0.4, 0, 0.2]), K(0.6, Z)],
      tie: [K(0, Z), K(0.1, [0, 0, -0.9]), K(0.45, [0, 0, -1.0]), K(0.6, Z)], // tie shoved aside by the belly
      eyeL: [K(0, Z), K(0.1, [0.4, 0, 0]), K(0.45, [0.45, 0, 0]), K(0.6, Z)],
      eyeR: [K(0, Z), K(0.1, [0.4, 0, 0]), K(0.45, [0.45, 0, 0]), K(0.6, Z)],
    },
  },

  hopHop: {
    duration: 0.7, loop: false,
    tracks: {
      // back-hop, forward pounce — pure frog evasion
      hips: [K(0, Z, HIP), K(0.06, Z, [0, 0.46, 0]), K(0.16, [0, 0, -0.3], [-0.1, 0.85, 0]), K(0.26, Z, [-0.05, 0.5, 0]), K(0.36, [0, 0, 0.4], [0.1, 0.88, 0]), K(0.5, [0, 0, 0.1], [0.05, 0.56, 0]), K(0.7, Z, HIP)],
      legL: [K(0, Z), K(0.06, [0, 0, -0.7]), K(0.16, [0, 0, 0.5]), K(0.26, [0, 0, -0.7]), K(0.36, [0, 0, 0.6]), K(0.5, [0, 0, -0.2]), K(0.7, Z)],
      legR: [K(0, Z), K(0.06, [0, 0, -0.7]), K(0.16, [0, 0, 0.5]), K(0.26, [0, 0, -0.7]), K(0.36, [0, 0, 0.6]), K(0.5, [0, 0, -0.2]), K(0.7, Z)],
      shinL: [K(0, [0, 0, -0.15]), K(0.06, [0, 0, 0.8]), K(0.16, [0, 0, -0.5]), K(0.26, [0, 0, 0.8]), K(0.36, [0, 0, -0.5]), K(0.7, [0, 0, -0.15])],
      shinR: [K(0, [0, 0, -0.15]), K(0.06, [0, 0, 0.8]), K(0.16, [0, 0, -0.5]), K(0.26, [0, 0, 0.8]), K(0.36, [0, 0, -0.5]), K(0.7, [0, 0, -0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.16, [-0.3, 0, 1.2]), K(0.36, [0.3, 0, -0.8]), K(0.7, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.16, [0.3, 0, 1.2]), K(0.36, [-0.3, 0, -0.8]), K(0.7, [0, 0, 0.14])],
      torso: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.36, [0, 0, 0.3]), K(0.7, Z)],
      head: [K(0, Z), K(0.16, [0, 0, 0.15]), K(0.36, [0, 0, -0.1]), K(0.7, Z)],
      tie: [K(0, Z), K(0.16, [0, 0, 1.0]), K(0.36, [0, 0, -1.5]), K(0.55, [0, 0, -0.4]), K(0.7, Z)],
      eyeL: [K(0, Z), K(0.16, [0, 0.5, 0]), K(0.36, [0, -0.3, 0]), K(0.7, Z)],
      eyeR: [K(0, Z), K(0.16, [0, 0.5, 0]), K(0.36, [0, -0.3, 0]), K(0.7, Z)],
    },
  },

  tongueGrab: {
    duration: 0.9, loop: false,
    tracks: {
      // tongue lassos out, reels in, then a full-body yank-and-toss
      tongue: [K(0, Z), K(0.1, [0, 0, -0.9], [0.55, 0.05, 0]), K(0.4, [0, 0, -0.9], [0.5, 0.05, 0]), K(0.55, [0, 0, -0.3], [0.15, 0, 0]), K(0.7, Z, [0, 0, 0]), K(0.9, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.3]), K(0.4, [0, 0, 0.25]), K(0.55, [0, 0, -0.5]), K(0.7, [0, 0, -0.2]), K(0.9, Z)],
      torso: [K(0, Z), K(0.1, [0, 0, 0.15]), K(0.55, [0, 0, -0.45]), K(0.62, [0, 0.5, -0.3]), K(0.9, Z)],
      hips: [K(0, Z, HIP), K(0.1, Z, [0.05, 0.63, 0]), K(0.55, [0, 0.3, 0], [-0.08, 0.56, 0]), K(0.62, [0, 0.9, 0], [0, 0.6, 0]), K(0.9, Z, HIP)],
      armL: [K(0, [0, 0, 0.12]), K(0.4, [0.8, 0, 0.4]), K(0.62, [0.4, 0, -1.2]), K(0.9, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.4, [-0.8, 0, 0.4]), K(0.62, [-0.4, 0, -1.2]), K(0.9, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.55, [0, 0, -0.4]), K(0.9, Z)],
      legR: [K(0, Z), K(0.55, [0, 0, 0.3]), K(0.9, Z)],
      eyeL: [K(0, Z), K(0.1, [-0.3, 0, 0]), K(0.55, [0, 0, 0.3]), K(0.9, Z)],
      eyeR: [K(0, Z), K(0.1, [-0.3, 0, 0]), K(0.55, [0, 0, -0.3]), K(0.9, Z)],
      tie: [K(0, Z), K(0.55, [0, 0, -0.8]), K(0.7, [0, 0, 0.4]), K(0.9, Z)],
    },
  },

  stickyWrap: {
    duration: 1.0, loop: false,
    tracks: {
      // tongue wraps them like a gift, full spin cycle, spat out
      tongue: [K(0, Z), K(0.1, [0, 0, -0.9], [0.55, 0.05, 0]), K(0.65, [0, 0, -0.9], [0.5, 0.05, 0]), K(0.78, [0, 0, -0.4], [0.2, 0, 0]), K(1.0, Z, [0, 0, 0])],
      hips: [K(0, Z, HIP), K(0.15, [0, 1.4, 0], [0, 0.58, 0]), K(0.3, [0, 3.4, 0], [0, 0.64, 0]), K(0.45, [0, 5.2, 0], [0, 0.58, 0]), K(0.6, [0, 6.28, 0], [0, 0.64, 0]), K(0.72, [0, 6.9, 0], HIP), K(1.0, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.15, [0, 0, -0.15]), K(0.6, [0, 0, -0.15]), K(0.72, [0, 0.4, 0.25]), K(1.0, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.25]), K(0.6, [0, 0, 0.2]), K(0.72, [0, 0, -0.4]), K(1.0, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.2, [1.1, 0, 0.4]), K(0.6, [1.1, 0, 0.4]), K(1.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.2, [-1.1, 0, 0.4]), K(0.6, [-1.1, 0, 0.4]), K(1.0, [0, 0, 0.14])],
      tie: [K(0, Z), K(0.3, [0, 0.6, -1.3]), K(0.6, [0, -0.6, -1.3]), K(0.8, [0, 0, 0.3]), K(1.0, Z)],
      eyeL: [K(0, Z), K(0.3, [0, 0.6, 0]), K(0.6, [0, -0.6, 0]), K(1.0, Z)],
      eyeR: [K(0, Z), K(0.3, [0, 0.6, 0]), K(0.6, [0, -0.6, 0]), K(1.0, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  pumpDump: {
    duration: 2.0, loop: false,
    tracks: {
      // gulp... gulp... gulp... (the scale-up happens in the script)
      torso: [K(0, Z), K(0.2, [0, 0, 0.2]), K(0.5, [0, 0, 0.35]), K(0.9, [0, 0, 0.45]), K(1.1, [0, 0, 0.5]), K(1.25, [0, 0, 1.2]), K(1.5, [0, 0, 0.3]), K(2.0, Z)],
      head: [K(0, Z), K(0.2, [0, 0, -0.5]), K(0.9, [0, 0, -0.6]), K(1.25, [0, 0, 0.5]), K(1.5, [0, 0, -0.1]), K(2.0, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.3, [1.1, 0, 0.9]), K(1.1, [1.2, 0, 0.95]), K(1.25, [-0.5, 0, 2.2]), K(1.6, [0.3, 0, 0.5]), K(2.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.3, [-1.1, 0, 0.9]), K(1.1, [-1.2, 0, 0.95]), K(1.25, [0.5, 0, 2.2]), K(1.6, [-0.3, 0, 0.5]), K(2.0, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.3, [0.5, 0, 0.3]), K(1.1, [0.5, 0, 0.3]), K(1.25, [0, 0, 0.8]), K(1.6, Z), K(2.0, Z)],
      legR: [K(0, Z), K(0.3, [-0.5, 0, 0.3]), K(1.1, [-0.5, 0, 0.3]), K(1.25, [0, 0, 0.8]), K(1.6, Z), K(2.0, Z)],
      hips: [K(0, Z, HIP), K(0.5, [0, 0, 0.05], [0, 0.66, 0]), K(1.1, [0, 0, 0.1], [0, 0.7, 0]), K(1.25, [0, 0, 0.3], [0, 0.6, 0]), K(1.6, Z, [0, 0.58, 0]), K(2.0, Z, HIP)],
      tie: [K(0, Z), K(0.5, [0, 0, -0.8]), K(1.1, [0, 0, -1.1]), K(1.25, [0, 0, -1.8]), K(1.6, [0, 0, 0.3]), K(2.0, Z)],
      eyeL: [K(0, Z), K(0.9, [0.45, 0, 0]), K(1.2, [0, 0, 0.4]), K(1.6, Z), K(2.0, Z)],
      eyeR: [K(0, Z), K(0.9, [0.45, 0, 0]), K(1.2, [0, 0, -0.4]), K(1.6, Z), K(2.0, Z)],
    },
  },

  liqLeak: {
    duration: 0.9, loop: false,
    tracks: {
      // stomps a foot and wobbles as the floor turns to grease
      legR: [K(0, Z), K(0.1, [0, 0, 1.2]), K(0.18, [0, 0, -0.1]), K(0.9, Z)],
      hips: [K(0, Z, HIP), K(0.18, Z, [0, 0.56, 0]), K(0.35, [0.15, 0, 0], [-0.04, 0.6, 0]), K(0.55, [-0.15, 0, 0], [0.04, 0.6, 0]), K(0.75, [0.1, 0, 0], [0, 0.6, 0]), K(0.9, Z, HIP)],
      torso: [K(0, Z), K(0.18, [0, 0, -0.2]), K(0.35, [0, 0.2, 0.1]), K(0.55, [0, -0.2, 0.1]), K(0.9, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.35, [0.5, 0, 1.4]), K(0.55, [-0.3, 0, 1.0]), K(0.75, [0.4, 0, 1.3]), K(0.9, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.35, [-0.3, 0, 1.0]), K(0.55, [0.5, 0, 1.4]), K(0.75, [-0.4, 0, 1.3]), K(0.9, [0, 0, 0.14])],
      head: [K(0, Z), K(0.18, [0, 0, 0.2]), K(0.45, [0, 0.3, 0]), K(0.7, [0, -0.3, 0]), K(0.9, Z)],
      tie: [K(0, Z), K(0.35, [0, 0.4, -0.8]), K(0.55, [0, -0.4, -0.8]), K(0.9, Z)],
      eyeL: [K(0, Z), K(0.35, [0, 0.5, 0]), K(0.55, [0, -0.5, 0]), K(0.9, Z)],
      eyeR: [K(0, Z), K(0.35, [0, -0.5, 0]), K(0.55, [0, 0.5, 0]), K(0.9, Z)],
    },
  },

  exitLiq: {
    duration: 0.8, loop: false,
    tracks: {
      // sneakily slides the chest out, whistles, looks elsewhere
      hips: [K(0, Z, HIP), K(0.15, [0, 0, 0.2], [0.05, 0.44, 0]), K(0.4, [0, 0, 0.2], [0.08, 0.44, 0]), K(0.55, Z, [0, 0.58, 0]), K(0.8, Z, HIP)],
      torso: [K(0, Z), K(0.15, [0, 0, -0.4]), K(0.4, [0, 0, -0.4]), K(0.55, [0, 0.5, 0.1]), K(0.8, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.15, [0.2, 0, -0.9]), K(0.4, [0.2, 0, -1.0]), K(0.55, [0.3, 0, 0.4]), K(0.8, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.15, [-0.2, 0, -0.9]), K(0.4, [-0.2, 0, -1.0]), K(0.55, [-0.6, 0, 0.9]), K(0.8, [0, 0, 0.14])],
      head: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.4, [0, 0, 0.3]), K(0.55, [0, 0.7, 0]), K(0.8, [0, 0.4, 0])],
      // eyes point ANYWHERE but the trap
      eyeL: [K(0, Z), K(0.55, [0, 0.8, 0]), K(0.7, [-0.3, 0.8, 0]), K(0.8, [0, 0.6, 0])],
      eyeR: [K(0, Z), K(0.55, [0, 0.8, 0]), K(0.7, [-0.3, 0.8, 0]), K(0.8, [0, 0.6, 0])],
      tongue: [K(0, Z), K(0.55, [0, 0, -0.4], [0.15, 0, 0]), K(0.8, Z, [0, 0, 0])], // innocent whistle
      legL: [K(0, Z), K(0.15, [-0.4, 0, -0.7]), K(0.4, [-0.4, 0, -0.7]), K(0.55, Z)],
      shinL: [K(0, [0, 0, -0.15]), K(0.15, [0, 0, 0.8]), K(0.4, [0, 0, 0.8]), K(0.55, [0, 0, -0.15])],
      tie: [K(0, Z), K(0.15, [0, 0, 0.5]), K(0.55, [0, 0, -0.2]), K(0.8, Z)],
    },
  },

  frogMarketClip: {
    duration: 2.2, loop: false,
    tracks: {
      // conducts the swarm like a floor trader calling orders
      armL: [K(0, [0, 0, 0.12]), K(0.2, [0, 0, 2.4]), K(0.5, [0.4, 0, 2.2]), K(0.8, [-0.4, 0, 2.5]), K(1.1, [0.4, 0, 2.2]), K(1.4, [-0.4, 0, 2.5]), K(1.7, [0, 0, 2.3]), K(2.2, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, 1.2]), K(0.6, [-0.5, 0, 1.5]), K(1.0, [0.5, 0, 1.0]), K(1.4, [-0.5, 0, 1.5]), K(1.7, [0, 0, 1.2]), K(2.2, [0, 0, 0.14])],
      forearmL: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, -0.3]), K(2.2, [0, 0, 0.35])],
      head: [K(0, Z), K(0.2, [0, 0, 0.3]), K(0.6, [0, 0.3, 0.2]), K(1.0, [0, -0.3, 0.2]), K(1.4, [0, 0.3, 0.2]), K(1.75, [0, 0, 0.5]), K(2.0, [0, 0, -0.2]), K(2.2, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.15]), K(1.7, [0, 0, 0.15]), K(1.85, [0, 0, -0.3]), K(2.2, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [0, 0.66, 0]), K(0.5, Z, [0, 0.6, 0]), K(0.8, Z, [0, 0.66, 0]), K(1.1, Z, [0, 0.6, 0]), K(1.4, Z, [0, 0.66, 0]), K(1.7, Z, HIP), K(2.2, Z, HIP)],
      tie: [K(0, Z), K(0.35, [0, 0.4, -0.9]), K(0.8, [0, -0.4, -0.6]), K(1.2, [0, 0.4, -0.9]), K(1.7, Z), K(2.2, Z)],
      eyeL: [K(0, Z), K(0.6, [0, 0.4, 0]), K(1.0, [0, -0.4, 0]), K(1.75, [-0.3, 0, 0]), K(2.0, [0.5, 0, 0]), K(2.2, Z)],
      eyeR: [K(0, Z), K(0.6, [0, -0.4, 0]), K(1.0, [0, 0.4, 0]), K(1.75, [-0.3, 0, 0]), K(2.0, [0.5, 0, 0]), K(2.2, Z)],
      tongue: [K(0, Z), K(0.25, [0, 0, -0.6], [0.2, 0, 0]), K(0.45, Z, [0, 0, 0]), K(1.75, Z), K(1.9, [0, 0, -0.6], [0.2, 0, 0]), K(2.1, Z, [0, 0, 0]), K(2.2, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  ribbit: {
    duration: 0.9, loop: false,
    tracks: {
      // steps up to the mic. inhales. delivers guidance.
      hips: [K(0, Z, HIP), K(0.15, Z, [0.05, 0.64, 0]), K(0.7, Z, [0.05, 0.64, 0]), K(0.9, Z, HIP)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.4]), K(0.38, [0, 0, 0.55]), K(0.45, [0, 0, -0.25]), K(0.65, [0, 0, -0.2]), K(0.9, Z)],
      head: [K(0, Z), K(0.2, [0, 0, -0.5]), K(0.38, [0, 0, -0.65]), K(0.45, [0, 0, 0.4]), K(0.65, [0, 0, 0.35]), K(0.9, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.2, [0.3, 0, 0.6]), K(0.65, [0.3, 0, 0.6]), K(0.9, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.2, [-0.3, 0, 0.6]), K(0.65, [-0.3, 0, 0.6]), K(0.9, [0, 0, 0.14])],
      forearmL: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 1.1]), K(0.9, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 1.1]), K(0.9, [0, 0, 0.35])],
      eyeL: [K(0, Z), K(0.2, [0.4, 0, 0]), K(0.45, [-0.4, 0, 0]), K(0.9, Z)],
      eyeR: [K(0, Z), K(0.2, [0.4, 0, 0]), K(0.45, [-0.4, 0, 0]), K(0.9, Z)],
      tie: [K(0, Z), K(0.45, [0, 0, -0.7]), K(0.6, [0, 0, 0.2]), K(0.9, Z)],
      tongue: [K(0, Z), K(0.42, [0, 0, -0.5], [0.2, 0, 0]), K(0.55, Z, [0, 0, 0]), K(0.9, Z)],
    },
  },

  // finisher: grips an invisible drain plug, heaves, then presents the vortex
  drainPool: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, 0.3], [0.1, 0.4, 0]), K(0.35, [0, 0, 0.35], [0.12, 0.38, 0]), K(0.5, [0, 0, -0.4], [-0.15, 0.72, 0]), K(0.75, [0, 0, -0.2], [-0.1, 0.62, 0]), K(1.0, Z, HIP), K(2.4, Z, HIP)],
      torso: [K(0, Z), K(0.2, [0, 0, -0.6]), K(0.35, [0, 0, -0.7]), K(0.5, [0, 0, 0.5]), K(0.75, [0, 0, 0.3]), K(1.0, Z), K(1.6, [0, 0.3, 0]), K(2.0, [0, -0.3, 0]), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.2, [0.2, 0, -0.9]), K(0.5, [-0.3, 0, 2.4]), K(0.75, [-0.3, 0, 2.3]), K(1.0, [0.3, 0, 1.2]), K(1.6, [0.4, 0, 1.4]), K(2.0, [0.4, 0, 1.4]), K(2.4, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.14]), K(0.2, [-0.2, 0, -0.9]), K(0.5, [0.3, 0, 2.4]), K(0.75, [0.3, 0, 2.3]), K(1.0, [-0.3, 0, 0.4]), K(1.6, [-0.4, 0, 0.5]), K(2.0, [-0.4, 0, 0.5]), K(2.4, [0, 0, 0.14])],
      forearmL: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 0.9]), K(0.5, [0, 0, 0.1]), K(1.0, [0, 0, 0.6]), K(2.4, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 0.9]), K(0.5, [0, 0, 0.1]), K(1.0, [0, 0, 0.6]), K(2.4, [0, 0, 0.35])],
      head: [K(0, Z), K(0.2, [0, 0, 0.4]), K(0.5, [0, 0, -0.5]), K(1.0, [0, 0, 0.1]), K(1.6, [0, 0.4, 0.1]), K(2.0, [0, -0.4, 0.1]), K(2.2, [0, 0, -0.3]), K(2.4, Z)],
      legL: [K(0, Z), K(0.2, [-0.35, 0, -0.8]), K(0.5, [0, 0, 0.3]), K(1.0, Z), K(2.4, Z)],
      legR: [K(0, Z), K(0.2, [0.35, 0, -0.8]), K(0.5, [0, 0, 0.3]), K(1.0, Z), K(2.4, Z)],
      shinL: [K(0, [0, 0, -0.15]), K(0.2, [0, 0, 0.9]), K(0.5, [0, 0, -0.15]), K(2.4, [0, 0, -0.15])],
      shinR: [K(0, [0, 0, -0.15]), K(0.2, [0, 0, 0.9]), K(0.5, [0, 0, -0.15]), K(2.4, [0, 0, -0.15])],
      tie: [K(0, Z), K(0.5, [0, 0, -1.6]), K(0.75, [0, 0, -1.2]), K(1.0, [0, 0, -0.3]), K(1.6, [0, 0.4, -0.6]), K(2.0, [0, -0.4, -0.6]), K(2.4, Z)],
      eyeL: [K(0, Z), K(0.35, [-0.3, 0, 0]), K(1.2, [0, 0.4, 0]), K(1.8, [0, -0.4, 0]), K(2.2, [0.4, 0, 0]), K(2.4, Z)],
      eyeR: [K(0, Z), K(0.35, [-0.3, 0, 0]), K(1.2, [0, 0.4, 0]), K(1.8, [0, -0.4, 0]), K(2.2, [0.4, 0, 0]), K(2.4, Z)],
      tongue: [K(0, Z), K(1.1, [0, 0, -0.7], [0.3, 0, 0]), K(1.4, Z, [0, 0, 0]), K(2.4, Z)],
    },
  },
}

// ---------------------------------------------------------------------------
// script helpers
// ---------------------------------------------------------------------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)

function inRange(fx, r) {
  if (!fx.foe || !fx.self) return false
  return Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) <= r && Math.abs(fx.foe.pos.y - fx.self.pos.y) < 1.8
}

// planar XZ distance, no height check — for scripts where the foe is deliberately lifted high
function nearX(fx, r) {
  if (!fx.foe || !fx.self) return false
  return Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) <= r
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

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function bellyFlopScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('croak', { pitch: 1.3 })
  fx.after(4, () => {
    fx.impulse(fx.self, [F * 3.5, 7.5, 0])
    fx.particles('dust', v3(fx.self.pos.x, 0.1, 0), { n: 4 })
  })
  fx.after(14, () => {
    fx.sfx('whoosh', { pitch: 0.7 })
    fx.impulse(fx.self, [F * 1.5, -15, 0]) // gravity is a suggestion; the flop is a promise
  })
  const tryLand = () => {
    if (landed) return
    if (fx.self.pos.y > 0.9) return
    landed = true
    fx.sfx('thud')
    fx.shake(0.7)
    fx.particles('impact', v3(fx.self.pos.x, 0.3, 0), { n: 10 })
    fx.particles('dust', v3(fx.self.pos.x, 0.15, 0), { n: 8 })
    if (inRange(fx, 1.8)) {
      fx.hit({ damage: 12, knockback: { x: 4, y: 8, spin: 1 }, hitStun: 24, ragdoll: 1 })
      fx.caption('BELLY FLOP DEPLOYED')
    }
  }
  for (const t of [18, 21, 24, 28]) fx.after(t, tryLand)
  fx.after(45, end)
}

function eyePokeFeintScript(fx) {
  const end = onceEnd(fx)
  fx.after(6, () => fx.sfx('whoosh', { pitch: 1.6 })) // the fake
  fx.after(9, () => { if (inRange(fx, 2.2)) fx.caption('FAKE BREAKOUT...') })
  fx.after(19, () => { // the real poke, from the other side
    if (!inRange(fx, 1.8)) return
    fx.sfx('punch_light', { pitch: 1.7 })
    fx.sfx('croak', { pitch: 1.9 })
    fx.particles('impact', v3(fx.foe.pos.x, 1.1, 0), { n: 6 })
    fx.hit({ damage: 7, knockback: { x: 5.5, y: 2, spin: 0.4 }, hitStun: 18 })
    fx.caption('YOU BOUGHT THE FAKEOUT')
  })
  fx.after(36, end)
}

function hopHopScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('croak', { pitch: 1.8 })
  fx.after(3, () => {
    fx.impulse(fx.self, [-F * 6.5, 5.5, 0]) // hop OUT of the trade
    fx.particles('dust', v3(fx.self.pos.x, 0.1, 0), { n: 4 })
  })
  fx.after(17, () => {
    fx.sfx('croak', { pitch: 2.1 })
    fx.impulse(fx.self, [F * 9, 6, 0]) // hop BACK into the trade
    fx.particles('dust', v3(fx.self.pos.x, 0.1, 0), { n: 4 })
  })
  fx.after(31, () => {
    if (inRange(fx, 1.7)) {
      fx.sfx('kick')
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: 5 })
      fx.hit({ damage: 6, knockback: { x: 7, y: 3, spin: 0.6 }, hitStun: 16 })
    }
  })
  fx.after(42, end)
}

// SUPER — inflate into a giant sphere, rise, deflate-SLAM
function pumpAndDumpScript(fx) {
  const end = onceEnd(fx)
  const hips = fx.self.bones?.hips || null
  const base = hips ? hips.scale.clone() : null
  let restored = false
  const restore = () => { // idempotent failsafe: scale ALWAYS comes back
    if (restored) return
    restored = true
    try { if (hips && base) hips.scale.copy(base) } catch { /* bone gone */ }
  }
  fx.caption('PUMP AND DUMP')
  fx.announcer('PUMP AND DUMP')
  fx.sfx('croak', { pitch: 0.7 })
  fx.shake(0.3)
  fx.zoom(fx.self, 0.6)
  // THE PUMP: inflate + rise
  for (let i = 0; i < 10; i++) {
    fx.after(6 + i * 3, () => {
      try { if (hips && base) hips.scale.setScalar(base.x * (1 + (i + 1) * 0.14)) } catch { /* bone gone */ }
      fx.impulse(fx.self, [0, 5.5, 0])
      if (i % 3 === 0) fx.sfx('boing', { pitch: 0.8 + i * 0.07 })
      fx.particles('dust', v3(fx.self.pos.x, fx.self.pos.y + 0.6, 0), { n: 2 })
    })
  }
  fx.after(22, () => fx.caption('MARKET CAP: INFLATING'))
  // drift over the foe like a smug green zeppelin
  for (let i = 0; i < 6; i++) {
    fx.after(38 + i * 4, () => {
      try {
        const dx = clampToArena(fx, fx.foe.pos.x) - fx.self.pos.x
        fx.impulse(fx.self, [Math.max(-6, Math.min(6, dx * 2.2)), 3.2, 0])
      } catch { /* foe gone */ }
    })
  }
  // THE DUMP
  fx.after(64, () => {
    fx.sfx('whoosh', { pitch: 0.5 })
    fx.caption('AND... DUMP.')
    fx.impulse(fx.self, [0, -28, 0])
  })
  fx.after(74, () => {
    fx.shake(1.4)
    fx.slowmo(0.3, 0.7)
    fx.sfx('explosion')
    fx.sfx('croak', { pitch: 0.5 })
    fx.particles('explosion', v3(fx.self.pos.x, 0.6, 0), { n: 30 })
    fx.particles('dust', v3(fx.self.pos.x, 0.2, 0), { n: 16 })
    fx.coins(v3(fx.self.pos.x, 1.2, 0), 20)
    if (nearX(fx, 3.6)) {
      fx.hit({ damage: 30, knockback: { x: 7, y: 12, spin: 3 }, hitStun: 50, ragdoll: 2 })
      fx.caption('DUMPED ON FROM ABOVE')
    } else {
      fx.caption('SOLD INTO ZERO VOLUME')
    }
  })
  // deflate with dignity (there is no dignity)
  for (let i = 0; i < 6; i++) {
    fx.after(80 + i * 3, () => {
      try { if (hips && base && !restored) hips.scale.setScalar(Math.max(base.x, base.x * (2.4 - (i + 1) * 0.24))) } catch { /* bone gone */ }
    })
  }
  fx.after(86, () => fx.sfx('croak', { pitch: 1.4 }))
  fx.after(100, restore) // exact restore at the end of the deflate
  fx.after(150, restore) // belt-and-suspenders failsafe (idempotent)
  fx.after(114, end)
}

// floor turns slimy — BOTH fighters lose traction for ~3 seconds
function copeCroakScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(9, () => {
    // one enormous, deeply felt croak. the market hears it. the market flinches.
    fx.sfx('croak', { pitch: 0.7 })
    fx.shake(0.5)
    fx.particles('dust', v3(fx.self.pos.x + F * 1.0, 1.1, 0), { n: 12 })
    if (inRange(fx, 3.0)) {
      fx.sfx('thud')
      fx.hit({ damage: 12, knockback: { x: 11, y: 5, spin: 1.6 }, hitStun: 26, ragdoll: 1 })
      fx.caption('COPE DELIVERED')
    } else {
      fx.caption('CROAKED INTO THE VOID')
    }
  })
  fx.after(38, end)
}

function liquidityLeakScript(fx) {
  const end = onceEnd(fx)
  fx.caption('LIQUIDITY LEAK')
  fx.announcer('THE POOL HAS A LEAK')
  fx.sfx('croak', { pitch: 1.1 })
  fx.after(8, () => {
    fx.sfx('slide')
    fx.particles('dust', v3(fx.self.pos.x, 0.12, 0), { n: 10 })
  })
  fx.after(10, () => {
    if (inRange(fx, 2.2)) {
      fx.sfx('punch_light', { pitch: 1.4 })
      fx.hit({ damage: 4, knockback: { x: 3, y: 1 }, hitStun: 14 })
    }
  })
  // ~3s of uncontrollable sliding; timers survive end() by design
  for (let i = 0; i < 30; i++) {
    fx.after(14 + i * 6, () => {
      try {
        const b = fx.arena()?.bounds
        const minX = (b?.minX ?? -9) + 1, maxX = (b?.maxX ?? 9) - 1
        for (const f of [fx.self, fx.foe]) {
          if (!f) continue
          const sign = f === fx.self ? 1 : -1
          let push = Math.sin(i * 1.7) * sign * 3.2 + Math.sin(i * 0.9 + sign) * 1.6
          if (f.pos.x < minX) push = Math.abs(push) // slime respects arena bounds
          if (f.pos.x > maxX) push = -Math.abs(push)
          fx.impulse(f, [push, 0, 0])
        }
      } catch { /* fighter gone */ }
      if (i % 5 === 0) fx.sfx('slide', { pitch: 0.9 + (i % 3) * 0.15 })
      if (i % 4 === 0) fx.particles('dust', v3(fx.foe?.pos?.x ?? 0, 0.1, 0), { n: 2 })
    })
  }
  fx.after(110, () => fx.caption('NO TRACTION. NO LIQUIDITY. NO REFUNDS.'))
  fx.after(54, end)
}

// fake treasure chest — proximity trapdoor launch
function exitLiquidityScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const chestX = clampToArena(fx, fx.self.pos.x + F * 3.2)
  let chest = null
  let sprung = false
  fx.caption('EXIT LIQUIDITY')
  fx.sfx('croak', { pitch: 1.0 })
  fx.after(8, () => {
    chest = fx.spawnProp('crate', v3(chestX, 0.4, 0), { mass: 60, breakable: true, health: 999 })
    fx.coins(v3(chestX, 1.0, 0), 4)
    fx.sfx('coin', { pitch: 0.8 })
    fx.caption('FREE AIRDROP (100% REAL)')
  })
  // armed proximity trap — checks every 5 frames for ~5 seconds
  for (let i = 0; i < 60; i++) {
    fx.after(30 + i * 5, () => {
      if (sprung || !fx.foe) return
      try {
        if (Math.abs(fx.foe.pos.x - chestX) < 1.25 && fx.foe.pos.y < 1.2) {
          sprung = true
          fx.sfx('boing')
          fx.sfx('launch')
          fx.shake(0.8)
          fx.slowmo(0.5, 0.4)
          fx.particles('impact', v3(chestX, 0.6, 0), { n: 16 })
          fx.coins(v3(chestX, 1.4, 0), 10)
          fx.hit({ damage: 15, knockback: { x: 2, y: 13, spin: 2.5 }, hitStun: 34, ragdoll: 1 })
          fx.caption('YOU WERE THE EXIT LIQUIDITY')
          fx.announcer('EXIT LIQUIDITY')
          if (chest) { try { fx.impulse(chest, [0, 9, 0], 2) } catch { /* prop gone */ } }
        }
      } catch { /* foe gone */ }
    })
  }
  fx.after(340, () => { // unclaimed airdrop quietly rugs itself
    if (!sprung && chest) { try { chest.remove?.() } catch { /* prop gone */ } }
  })
  fx.after(46, end)
}

// dozens of tiny pooled frogs swarm, lift the foe, then fat-finger the sell
function frogMarketScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('FROG MARKET')
  fx.announcer('COORDINATED BUYING PRESSURE')
  fx.sfx('croak', { pitch: 1.4 })
  fx.sfx('croak', { pitch: 0.9 })

  // pooled swarm: one shared geometry set, cleaned up in a guarded failsafe
  const scene = fx.self.root?.parent || null
  const swarm = new THREE.Group()
  const frogs = []
  // 18 tiny frogs: bevelled bodies, real amphibian/plastic presets, and UNIQUE
  // materials because cleanup() below disposes them (README §5 — never dispose
  // a shared cached material).
  const bodyGeo = superellipsoid(0.1, 0.065, 0.08, 2.6, 2.6, 12, { unique: true })
  const eyeGeo = ball(0.028, 8, { unique: true })
  eyeGeo.userData.bevelled = true
  const frogMat = pbr(C.dorsal, 'skin-wet', { unique: true, noMaps: true, roughness: 1, clearcoat: 0.5 })
  const eyeMat = pbr(C.sclera, 'plastic-gloss', { unique: true, noMaps: true })
  try {
    if (scene) {
      for (let i = 0; i < 18; i++) {
        const f = new THREE.Group()
        const body = new THREE.Mesh(bodyGeo, frogMat)
        body.position.y = 0.07
        body.castShadow = true
        const eL = new THREE.Mesh(eyeGeo, eyeMat)
        eL.position.set(0.07, 0.15, 0.05)
        const eR = new THREE.Mesh(eyeGeo, eyeMat)
        eR.position.set(0.07, 0.15, -0.05)
        f.add(body, eL, eR)
        const side = i % 2 === 0 ? 1 : -1
        f.position.set(
          clampToArena(fx, fx.self.pos.x - F * (0.4 + Math.random() * 1.4)),
          0,
          side * (0.3 + Math.random() * 0.9))
        f.userData.seed = Math.random() * Math.PI * 2
        swarm.add(f)
        frogs.push(f)
      }
      scene.add(swarm)
    }
  } catch { /* scene unavailable — script still lands the hit */ }

  let cleaned = false
  const cleanup = () => { // idempotent — swarm ALWAYS leaves the scene
    if (cleaned) return
    cleaned = true
    try {
      if (scene) scene.remove(swarm)
      bodyGeo.dispose(); eyeGeo.dispose(); frogMat.dispose(); eyeMat.dispose()
    } catch { /* already gone */ }
  }

  // pin the foe while the frogs organize
  fx.after(10, () => { if (nearX(fx, 7)) fx.hit({ damage: 3, knockback: { x: 0, y: 0 }, hitStun: 105 }) })

  // per-frame swarm choreography (fx.frame stops at end(); cleanup runs first)
  fx.frame((age) => {
    try {
      if (!scene || !fx.foe) return
      const fp = fx.foe.pos
      for (const fr of frogs) {
        const s = fr.userData.seed
        if (age < 46) { // hop toward the foe
          fr.position.x += (fp.x - fr.position.x) * 0.06
          fr.position.z += (0 - fr.position.z) * 0.03 + Math.sin(age * 0.3 + s) * 0.01
          fr.position.y = Math.abs(Math.sin(age * 0.25 + s)) * 0.28
          fr.rotation.y = Math.sin(age * 0.2 + s) * 0.6
        } else if (age < 98) { // pile underneath and heave upward
          const a = s + age * 0.06
          fr.position.x += (fp.x + Math.cos(a) * 0.45 - fr.position.x) * 0.25
          fr.position.z += (Math.sin(a) * 0.35 - fr.position.z) * 0.25
          fr.position.y = Math.max(0, fp.y - 0.3 + Math.sin(age * 0.5 + s) * 0.08)
        } else { // scatter in shame
          fr.position.x += Math.cos(s) * 0.18
          fr.position.z += Math.sin(s) * 0.14
          fr.position.y = Math.max(0, fr.position.y - 0.06)
          fr.rotation.y += 0.3
        }
      }
    } catch { /* visual only — never break the move */ }
  })

  // the lift: many tiny frogs, one big holder
  for (let i = 0; i < 12; i++) {
    fx.after(48 + i * 4, () => {
      if (!nearX(fx, 7)) return
      fx.impulse(fx.foe, [0, 6.2, 0])
      if (i % 3 === 0) fx.sfx('croak', { pitch: 1.2 + (i % 4) * 0.25 })
    })
  }
  fx.after(60, () => fx.caption('FROGS ACCUMULATING'))

  // the accidental hurl — someone pressed the wrong button
  fx.after(100, () => {
    fx.sfx('croak', { pitch: 0.6 })
    fx.sfx('launch')
    fx.shake(0.9)
    fx.slowmo(0.4, 0.5)
    if (nearX(fx, 7)) {
      fx.hit({ damage: 14, knockback: { x: -11, y: 7, spin: 3 }, hitStun: 40, ragdoll: 2 })
    }
    fx.caption('SELL SELL SE— WRONG BUTTON')
  })
  fx.after(128, cleanup)
  fx.after(200, cleanup) // failsafe (idempotent) — timers survive end()
  fx.after(132, end)
}

function ribbitReportScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(6, () => {
    // a tiny podium appears. this is now an earnings call.
    const podium = fx.spawnProp('crate', v3(clampToArena(fx, fx.self.pos.x + F * 0.9), 0.4, 0.7), { mass: 10 })
    if (podium) { try { fx.impulse(podium, [0, 0.5, 0]) } catch { /* prop gone */ } }
    fx.sfx('thud')
  })
  fx.after(16, () => {
    fx.sfx('croak', { pitch: 0.5 })
    fx.zoom(fx.self, 0.5)
    fx.caption('"RIBBIT." — Q3 GUIDANCE')
  })
  fx.after(26, () => {
    if (!inRange(fx, 2.5)) { fx.caption('THE MARKET SHRUGS'); return }
    fx.sfx('punch_light', { pitch: 1.9 })
    fx.slowmo(0.3, 0.5)
    fx.shake(0.8)
    fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 8 })
    fx.hit({ damage: 1, knockback: { x: 15, y: 7, spin: 3.5 }, hitStun: 30, ragdoll: 2 })
    fx.caption('1 DAMAGE. INFINITE CONFUSION.')
    fx.announcer('EXTREMELY BULLISH')
  })
  fx.after(54, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const PeepeeDef = {
  id: 'peepee',
  name: 'PEEPEE',
  title: 'The Swamp Speculator',
  bio: 'Emerged from the liquidity pool in 2019 wearing a tie he found in a drained swamp. Peepee trades exclusively on vibes, croaks, and charts he cannot read. His portfolio is 40% slime, 60% conviction, and somehow up on the year.',
  style: 'Unpredictable trick fighter. Fast, floaty, and fundamentally dishonest — slime slides, chart fakeouts, elastic tongue range, and one catastrophic balloon maneuver. If you can predict him, he cannot predict himself either.',
  stats: { power: 4, speed: 7, defense: 4, chaos: 9 },
  height: 1.5,
  weight: 0.85,
  walkSpeed: 5.2,
  dashSpeed: 10.5,
  jumpVel: 9.5,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'tongue-jab', name: 'Tongue Jab', kind: 'light',
      input: ['light'],
      damage: 5, startup: 5, active: 5, recovery: 8,
      // long, thin, disrespectful
      hitbox: { w: 1.7, h: 0.4, d: 0.6, forward: 1.3, up: 1.1 },
      knockback: { x: 4.5, y: 1, spin: 0.3 },
      hitStun: 13, blockStun: 7, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'tongueJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'tie-whip', name: 'Tie Whip', kind: 'light',
      input: ['forward', 'light'],
      damage: 7, startup: 6, active: 4, recovery: 11,
      hitbox: { w: 1.3, h: 0.9, d: 0.9, forward: 1.0, up: 1.0 },
      knockback: { x: 7, y: 2, spin: 0.8 },
      hitStun: 16, blockStun: 9, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'tieWhip', sfx: 'whoosh', script: null,
    },
    {
      id: 'eye-poke-feint', name: 'Eye Poke Feint', kind: 'light',
      input: ['back', 'light'],
      damage: 7, startup: 18, active: 4, recovery: 14,
      hitbox: { w: 1.0, h: 0.7, d: 0.8, forward: 1.0, up: 1.2 },
      knockback: { x: 5.5, y: 2, spin: 0.4 },
      hitStun: 18, blockStun: 8, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'eyePoke', sfx: 'whoosh',
      script: eyePokeFeintScript,
    },
    {
      id: 'belly-flop', name: 'Belly Flop', kind: 'heavy',
      input: ['heavy'],
      damage: 12, startup: 12, active: 6, recovery: 27,
      hitbox: { w: 1.4, h: 0.9, d: 1.2, forward: 0.9, up: 0.6 },
      knockback: { x: 4, y: 8, spin: 1 },
      hitStun: 24, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'bellyFlop', sfx: 'thud',
      script: bellyFlopScript,
    },
    {
      id: 'frog-kick', name: 'Frog Kick', kind: 'launcher',
      input: ['kick'],
      damage: 8, startup: 7, active: 5, recovery: 12,
      hitbox: { w: 1.0, h: 1.4, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 2.5, y: 9.5, spin: 1.2 },
      hitStun: 25, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'frogKick', sfx: 'kick', script: null,
    },
    {
      id: 'slime-slide', name: 'Slime Slide', kind: 'kick',
      input: ['down', 'kick'],
      damage: 8, startup: 9, active: 8, recovery: 16,
      // grease-level hitbox: hits at the ankles, pops them up
      hitbox: { w: 1.8, h: 0.5, d: 0.9, forward: 1.2, up: 0.3 },
      knockback: { x: 3, y: 8.5, spin: 1.5 },
      hitStun: 24, blockStun: 11, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'slimeSlide', sfx: 'slide', script: null,
    },
    {
      id: 'inflating-block', name: 'Inflating Block', kind: 'heavy',
      input: ['down', 'block'],
      damage: 6, startup: 5, active: 14, recovery: 17,
      hitbox: { w: 1.1, h: 1.3, d: 1.1, forward: 0.6, up: 0.9 },
      knockback: { x: 8, y: 2.5, spin: 0.4 },
      hitStun: 16, blockStun: 10, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0,
      armor: 19, // fully inflated: hits bounce off the balloon
      clip: 'inflate', sfx: 'boing', script: null,
    },
    {
      id: 'hop-hop', name: 'Hop Hop', kind: 'kick',
      input: ['back', 'kick'],
      damage: 6, startup: 10, active: 6, recovery: 26,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.8, up: 0.9 },
      knockback: { x: 7, y: 3, spin: 0.6 },
      hitStun: 16, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'hopHop', sfx: 'croak',
      script: hopHopScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'tongue-grab', name: 'Tongue Grab', kind: 'grab',
      input: ['grab'],
      damage: 11, startup: 7, active: 4, recovery: 43,
      // the tongue does the reaching so Peepee doesn't have to
      hitbox: { w: 1.5, h: 1.0, d: 0.9, forward: 1.3, up: 1.0 },
      knockback: { x: 10, y: 5, spin: 2 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'tongueGrab', sfx: 'grab', script: null,
    },
    {
      id: 'sticky-wrap', name: 'Sticky Wrap', kind: 'grab',
      input: ['down', 'grab'],
      damage: 13, startup: 9, active: 3, recovery: 48,
      hitbox: { w: 1.2, h: 1.1, d: 0.9, forward: 1.0, up: 1.0 },
      // full spin cycle, then spat out with tremendous disrespect
      knockback: { x: 8, y: 7, spin: 3.5 },
      hitStun: 34, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'stickyWrap', sfx: 'grab', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'cope-croak', name: 'Cope Croak', kind: 'special',
      input: ['special'],
      damage: 12, startup: 9, active: 4, recovery: 25,
      hitbox: { w: 1.4, h: 1.2, d: 1.0, forward: 1.3, up: 1.1 },
      knockback: { x: 11, y: 5, spin: 1.6 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'liqLeak', sfx: 'croak',
      script: copeCroakScript,
    },
    {
      id: 'liquidity-leak', name: 'Liquidity Leak', kind: 'special',
      input: ['down', 'special'],
      damage: 4, startup: 8, active: 6, recovery: 40,
      hitbox: { w: 1.6, h: 0.6, d: 1.2, forward: 1.0, up: 0.4 },
      knockback: { x: 3, y: 1, spin: 0.3 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'liqLeak', sfx: 'slide',
      script: liquidityLeakScript,
    },
    {
      id: 'exit-liquidity', name: 'Exit Liquidity', kind: 'special',
      input: ['back', 'special'],
      damage: 15, startup: 10, active: 4, recovery: 32,
      hitbox: { w: 1.0, h: 0.8, d: 0.9, forward: 1.0, up: 0.6 },
      knockback: { x: 2, y: 13, spin: 2.5 },
      hitStun: 34, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'exitLiq', sfx: 'coin',
      script: exitLiquidityScript,
    },
    {
      id: 'frog-market', name: 'Frog Market', kind: 'special',
      input: ['forward', 'special'],
      damage: 17, startup: 12, active: 90, recovery: 30,
      hitbox: { w: 1.4, h: 1.4, d: 1.2, forward: 1.0, up: 1.0 },
      knockback: { x: 11, y: 7, spin: 3 },
      hitStun: 40, blockStun: 14, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'frogMarketClip', sfx: 'croak',
      script: frogMarketScript,
    },
    {
      id: 'pump-and-dump', name: 'Pump and Dump', kind: 'super',
      input: ['super'],
      damage: 30, startup: 14, active: 70, recovery: 30,
      hitbox: { w: 2.6, h: 1.4, d: 1.8, forward: 0.6, up: 0.6 },
      knockback: { x: 7, y: 12, spin: 3 },
      hitStun: 50, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100,
      armor: 12, // mid-inflation he simply absorbs the news
      clip: 'pumpDump', sfx: 'boing',
      script: pumpAndDumpScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'ribbit-report', name: 'Ribbit Report', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 16, active: 4, recovery: 34,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 15, y: 7, spin: 3.5 },
      hitStun: 30, blockStun: 8, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'ribbit', sfx: 'croak',
      script: ribbitReportScript,
    },
  ],

  finisher: {
    id: 'fully-drained-pool',
    name: 'Fully Drained Pool',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const drainX = clampToArena(fx, fx.self.pos.x + F * 3.2)
      fx.slowmo(0.45, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption('FULLY DRAINED POOL')
      fx.announcer('FULLY DRAINED POOL')
      fx.sfx('croak', { pitch: 0.6 })
      fx.shake(0.4)
      fx.self.playClip?.('drainPool')

      // yank the giant plug out of the arena floor
      let plug = null
      fx.after(12, () => {
        plug = fx.spawnProp('crate', v3(drainX, 0.5, 0), { mass: 2 })
        fx.sfx('thud')
      })
      fx.after(20, () => {
        fx.sfx('boing')
        fx.shake(0.7)
        fx.particles('dust', v3(drainX, 0.4, 0), { n: 14 })
        if (plug) { try { fx.impulse(plug, [-F * 7, 11, 1.5], 3) } catch { /* prop gone */ } }
        fx.caption('PLUG: PULLED')
      })

      // hold the foe for the vortex
      fx.after(18, () => fx.hit({ damage: 3, knockback: { x: 0, y: 0 }, hitStun: 100 }))

      // loose props get sucked toward the drain too
      const junk = []
      fx.after(24, () => {
        const kinds = ['chair', 'monitor', 'coin', 'box']
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7
          const p = fx.spawnProp(kinds[i],
            v3(clampToArena(fx, drainX + Math.cos(a) * 2.4), 0.6, Math.sin(a) * 1.4))
          if (p) junk.push(p)
        }
      })
      for (let i = 0; i < 10; i++) {
        fx.after(30 + i * 6, () => {
          for (const p of junk) {
            try {
              const px = p.mesh?.position
              if (!px) continue
              fx.impulse(p, [(drainX - px.x) * 1.6, 1.5, (0 - px.z) * 1.6], 1.5)
            } catch { /* prop gone */ }
          }
          fx.sfx('slide', { pitch: 0.8 + i * 0.07 })
          if (i % 2) fx.particles('dust', v3(drainX, 0.2, 0), { n: 3 })
        })
      }

      // THE VORTEX — foe spirals toward the drain in shrinking circles
      const spiral = { a: 0 }
      fx.frame((age) => {
        if (age < 26 || age > 92) return
        try {
          const t = (age - 26) / 66
          spiral.a += 0.22 + t * 0.2
          const r = 2.6 * (1 - t) + 0.25
          fx.foe.pos.x = clampToArena(fx, drainX + Math.cos(spiral.a) * r)
          fx.foe.pos.z = Math.sin(spiral.a) * r * 0.55
          fx.foe.pos.y = Math.max(0.15, 1.1 * (1 - t) + 0.15)
          fx.foe.vel?.set?.(0, 0, 0)
        } catch { /* foe unavailable — eruption still fires */ }
      })
      fx.after(40, () => fx.sfx('whoosh', { pitch: 0.7 }))
      fx.after(56, () => { fx.shake(0.6); fx.caption('TVL: EVAPORATING') })
      fx.after(76, () => fx.sfx('whoosh', { pitch: 1.1 }))

      // the drain clogs (restore the fight axis before launch)
      fx.after(93, () => {
        try { fx.foe.pos.z = 0; fx.foe.pos.x = clampToArena(fx, drainX) } catch { /* foe gone */ }
        fx.sfx('thud')
        fx.shake(0.5)
        fx.caption('...CLOG DETECTED...')
      })

      // fired back out like a clogged pipe. plumbing wins again.
      fx.after(104, () => {
        fx.sfx('explosion')
        fx.shake(1.5)
        fx.slowmo(0.3, 0.9)
        fx.zoom(fx.foe, 1.0)
        fx.particles('explosion', v3(drainX, 0.6, 0), { n: 36 })
        fx.coins(v3(drainX, 1.5, 0), 22)
        fx.hit({ damage: 28, knockback: { x: -4, y: 15, spin: 4 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [-F * 9, 16, 0])
        for (const p of junk) {
          try { fx.impulse(p, [(Math.random() - 0.5) * 10, 10 + Math.random() * 5, (Math.random() - 0.5) * 6], 3) } catch { /* prop gone */ }
        }
        fx.caption('POOL: FULLY DRAINED')
        fx.announcer('LIQUIDITY ZERO')
      })
      fx.after(122, () => fx.sfx('croak', { pitch: 1.5 }))
      fx.after(142, end)
    },
  },

  voice: { pitch: 1.6, rate: 1.1 },
}
