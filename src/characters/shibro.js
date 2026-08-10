// SHIBRO — Guardian of the Chain.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// Original white mountain guardian dog: a small blunt wedge head sitting inside
// an enormous chest-and-shoulder ruff, small V-shaped ears carried low and flat
// against the skull, a spiked guardian collar, three-plate lamellar pauldrons,
// a waist sash, a geometric gold medallion and a plumed tail carried over the
// back in an OPEN arc. Calm, noble, defensive — parries, counters, precision.
//
// Surfacing goes through src/render (pbr() presets + procedural PBR map sets);
// geometry through the bevelled toolkit in src/render/geometry.js. Nothing here
// is a raw BoxGeometry. No assets, no extra deps.
import * as THREE from 'three'
import {
  makeMaterialFactory, ball, roundedBox, roundedCone, taperedBox, taperedCapsule,
  superellipsoid, loft, roundedRectPoints, plate, lens, splineTube,
  frustum, filletRing, rotated, mergeStatic, isSharedGeometry, profileLathe,
} from '../render/index.js'

// ---------------------------------------------------------------------------
// palette — warm cream coat, cool near-black pigment, cool mid-dark steel.
// Every albedo sits inside the contract's 30..240 sRGB window; nothing is
// #FFFFFF. The coat is the LARGEST area on the model and also the LIGHTEST —
// this fighter is the roster's only high-key character, so his form is carried
// by occlusion and edge light, never by painted shadow.
// ---------------------------------------------------------------------------
// NOTE ON THE NUMBERS. Every coat material below passes `map: null`, which
// strips the procedural albedo field and leaves the normal / roughness / AO
// maps in place. That is deliberate: a fur pattern painted into albedo is
// planar-projected and therefore MIRRORED left-to-right, which fur physically
// cannot be, and it does not move when the light moves. With the albedo map
// gone the base colour is delivered EXACTLY, so these hexes are ~0.88x the
// nominal palette to compensate for the map mean they used to be multiplied by.
// Delivered COAT luminance is Y 0.50 — a warm cream that is measurably DARKER
// than a bright arena floor, which is the only way a white character separates.
const P = {
  COAT_LIGHT: 0xd3ccbb,   // guard-hair tips, crown, muzzle bridge, ear leather
  COAT: 0xc5bca6,         // base coat — the dominant area (Y 0.50)
  COAT_SHADE: 0x9d927d,   // form shadow: peri-orbital halo, brow wedge
  // THE COOL MEMBER, and the only mechanism this character has for separating
  // himself from a warm arena floor. A high-key figure cannot be separated by
  // adding light in the middle — only the edges are available — and a warm or
  // white rim on a warm cream body is invisible. So the up-facing edges (crown
  // lock tips, plume top) carry a hue that is the near-complement of the coat:
  // COAT is 42 deg / Y 0.50, this is 212 deg / Y 0.44. Same value, opposite
  // temperature, so the boundary reads as a COLOUR edge, not a value one.
  // Capped at well under 6 % of coat area — past that it stops being one warm
  // material lit from two sides and becomes a two-tone dye job.
  COAT_SKY: 0xaeb5bd,
  COAT_DEEP: 0x584f42,    // undercoat shell / crevice — 4.9 : 1 under COAT
  BADGER: 0x7d7263,       // ear leather patches — 2.9 : 1 under COAT
  PIGMENT: 0x2e3138,      // nose, lip band, eye rims, lid solids (cool near-black)
  SCLERA: 0xe9e3d6,
  IRIS: 0x4a3220,
  PUPIL: 0x2a2422,
  CONCHA: 0xbba292,       // inner ear bowl — the one warm note on the model
  PAD: 0x4a4247,
  CLAW: 0xc9bfa8,         // horn, not black
  STEEL: 0x8d99ac,
  STEEL_DARK: 0x5a6376,
  STEEL_NIGHT: 0x3c4457,
  COLLAR_LEATHER: 0x4b3b2e,
  SASH: 0x2e58d2,
  SASH_NIGHT: 0xb92e44,   // same relative luminance as SASH on purpose
  GOLD: 0xe5b437,
  BLADE: 0x34d6e6,
  BLADE_CORE: 0xd8fbff,
}

// legacy keys the move scripts still read (community-shield, finisher VFX)
const C = {
  fur: P.COAT, dark: P.PIGMENT, gold: P.GOLD,
  blade: P.BLADE, bladeCore: P.BLADE_CORE,
}

// ---------------------------------------------------------------------------
// materials — one private scope, so Fighter.flash() cannot reach the arena.
// ---------------------------------------------------------------------------
const M = makeMaterialFactory({ scope: 'shibro' })

// Kept for the move scripts, which build short-lived VFX props and dispose them:
// those must never share a cached instance, so this path is always unique.
function lamb(color, opts = {}) {
  const { surface, ...rest } = opts
  return M.pbr(color, surface || 'default', { ...rest, unique: true })
}

// ---------------------------------------------------------------------------
// tiny procedural-model helpers — every one of them bevelled
// ---------------------------------------------------------------------------
function put(m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const r = Math.min(0.014, Math.min(w, h, d) * 0.22)
  return put(new THREE.Mesh(roundedBox(w, h, d, r, 1), material), x, y, z, rx, ry, rz)
}

function sph(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = put(new THREE.Mesh(ball(r, 18), material), x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}



// A rounded-rect loft ring: width across Z (lateral), depth across X (forward),
// with the ring itself shifted forward/back by `xo`.
//
// Shifting the RING rather than the loft's path is deliberate and load-bearing:
// loft() sweeps each section perpendicular to the path, so a path that leans
// forward tilts every ring with it and a 0.40 m-deep section then lands up to
// 0.08 m above the height you asked for. Keeping the path dead vertical and
// offsetting the shape keeps every y landmark in this file exact.
const rr = (lat, depth, r, xo = 0) => {
  const p = roundedRectPoints(lat, depth, r, 3)
  // (the sweep frame's second axis runs -X, so a POSITIVE xo means forward)
  if (xo) for (let i = 1; i < p.length; i += 2) p[i] -= xo
  return p
}
const UPZ = { up: [0, 0, 1] }   // loft frame: shape x -> Z, shape y -> X

// The head is lofted along +X instead, because a dog's head is a WEDGE with a
// median polyline and stacking rounded slabs up the Y axis is exactly how the
// previous build ended up reading as a pile of dinner rolls. With up = [0,0,1]
// and a tangent of +X the sweep frame comes out r = +Z, u = +Y — so a section's
// x is lateral width and its y is height, directly. The path is kept dead
// straight and each ring is slid vertically by `yo` instead, which is what
// keeps every landmark in §3.1 exact instead of approximately right.
const UPX = { up: [0, 0, 1] }
const rrX = (lat, tall, r, yo = 0) => {
  const p = roundedRectPoints(lat, tall, Math.min(r, Math.min(lat, tall) * 0.5 - 1e-4), 3)
  if (yo) for (let i = 1; i < p.length; i += 2) p[i] += yo
  return p
}
// A wedge station: (x, lateral width, top y, bottom y) -> a loft section.
const wedge = (x, lat, top, bot, r = 0.030) =>
  ({ at: [x, 0, 0], shape: rrX(lat, top - bot, r, (top + bot) * 0.5) })

function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}


// point a +Y-axis primitive (cone, capsule, lock wedge) down an arbitrary vector
const _AIM_UP = new THREE.Vector3(0, 1, 0)
const _AIM_D = new THREE.Vector3()
function aim(m, x, y, z) {
  _AIM_D.set(x, y, z)
  if (_AIM_D.lengthSq() < 1e-9) return m
  m.quaternion.setFromUnitVectors(_AIM_UP, _AIM_D.normalize())
  return m
}

// the same for a +Z-facing primitive (plate, lens, eye part). For a horizontal
// target the minimal rotation is about Y, so the part's local +Y stays exactly
// vertical — which is what keeps an eyelid level.
const _AIM_FWD = new THREE.Vector3(0, 0, 1)
function aimZ(m, x, y, z) {
  _AIM_D.set(x, y, z)
  if (_AIM_D.lengthSq() < 1e-9) return m
  m.quaternion.setFromUnitVectors(_AIM_FWD, _AIM_D.normalize())
  return m
}

// a modelled fur lock — a bevelled tapered wedge, never an alpha card.
// `len` 0.028..0.110 m; they are what break the ruff/plume/pantaloon outline.
function lock(material, len, w, px, py, pz, dx, dy, dz, twist = 0) {
  const m = new THREE.Mesh(roundedCone(w, w * 0.16, len, w * 0.3, 6, 1), material)
  aim(m, dx, dy, dz)
  m.rotateY(twist)
  m.position.set(px + dx * len * 0.42, py + dy * len * 0.42, pz + dz * len * 0.42)
  m.scale.set(1, 1, 0.62)   // locks are flat-ish tufts, not spikes
  return m
}

// ---------------------------------------------------------------------------
// ONE-PIECE LIMBS (contract §9: "joints must be visually continuous").
//
// The shipped build made every limb out of three stacked capsules plus a
// separate joint ball, and every one of those primitives ended in its own
// hemispherical cap at its own radius. Where a 0.078 m cap met an 0.088 m ball
// the outline STEPPED, and a step in the outline of a smooth-shaded form is a
// ring seam — the "stack of lozenges" the review measured at the knee and the
// ankle. No amount of overlap removes it: the two surfaces are continuous in
// coverage and discontinuous in tangent.
//
// `limb()` builds the whole bone segment as a SINGLE lathed surface. You give
// it the shaft's radius stations and the joint spheres it has to swallow; it
// takes the union of the two (max radius at each height), simplifies the result
// and revolves it with `creaseAngle: 180`, so there is exactly one surface,
// exactly one normal field and no crease anywhere along the limb.
//
// WHY IT SURVIVES ANIMATION, which is the half of this that geometry alone does
// not buy. Every joint sphere is authored CONCENTRIC WITH THE PIVOT IT COVERS:
//   - the PARENT segment carries a full sphere of radius R centred exactly on
//     the CHILD bone's origin;
//   - the CHILD segment begins with a sphere of radius 0.96·R about that same
//     origin, and only then tapers away down its shaft.
// A sphere has no orientation, so under any rotation of either bone the child's
// cap stays strictly inside the parent's — the joint cannot open at 0 degrees,
// at 90, or at the -1.9..+1.7 rad the move clips actually reach. The seam is
// not hidden, it does not exist.
const _limbCap = (r, yc, y) => (Math.abs(y - yc) >= r ? 0 : Math.sqrt(r * r - (y - yc) * (y - yc)))

function limb(stations, joints = [], opts = {}) {
  const seg = opts.radialSeg ?? 13
  const st = stations.slice().sort((a, b) => b[0] - a[0])   // top -> bottom
  const top = st[0], bot = st[st.length - 1]
  // shaft radius at y: piecewise-linear between stations, hemispherical past
  // either end, so the shaft on its own is exactly a multi-station capsule.
  const shaftR = (y) => {
    if (y >= top[0]) return _limbCap(top[1], top[0], y)
    if (y <= bot[0]) return _limbCap(bot[1], bot[0], y)
    for (let i = 0; i < st.length - 1; i++) {
      if (y <= st[i][0] && y >= st[i + 1][0]) {
        const t = (st[i][0] - y) / (st[i][0] - st[i + 1][0] || 1)
        return st[i][1] + (st[i + 1][1] - st[i][1]) * t
      }
    }
    return 0
  }
  const rAt = (y) => {
    let r = shaftR(y)
    for (const [jy, jr] of joints) r = Math.max(r, _limbCap(jr, jy, y))
    return r
  }
  let yHi = top[0] + top[1], yLo = bot[0] - bot[1]
  for (const [jy, jr] of joints) { yHi = Math.max(yHi, jy + jr); yLo = Math.min(yLo, jy - jr) }
  // Sample fine, then drop any point the profile does not need. The straight
  // run of a shaft collapses to two rings; the spheres keep their curvature.
  const N = opts.steps ?? 56
  const raw = []
  for (let i = 0; i <= N; i++) {
    const y = yLo + ((yHi - yLo) * i) / N
    raw.push([Math.max(0, i === 0 || i === N ? 0 : rAt(y)), y])
  }
  const tol = opts.tol ?? 0.0007
  const pts = [raw[0][0], raw[0][1]]
  let anchor = raw[0]
  for (let i = 1; i < raw.length - 1; i++) {
    const a = anchor, b = raw[i], c = raw[i + 1]
    const dx = c[0] - a[0], dy = c[1] - a[1]
    const L = Math.hypot(dx, dy) || 1e-6
    if (Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / L > tol) {
      pts.push(b[0], b[1]); anchor = b
    }
  }
  pts.push(raw[raw.length - 1][0], raw[raw.length - 1][1])
  return profileLathe(pts, seg, { creaseAngle: 180, ...opts })
}

// per-bone static container. Everything that never moves relative to ONE bone
// goes in here and is merged into a single buffer per material at the end of
// the build. Merging never crosses a bone — a buffer spanning torso and head
// would tear visibly the moment Gore._detach() clones the head.
function statics(bone) {
  const g = new THREE.Group()
  g.name = 'static'
  bone.add(g)
  return g
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, 1.90 m tall.
// Landmarks (world/model space, feet at y=0): crown of head fur 1.900, skull
// dome 1.820, eye line 1.710, ruff crest 1.700, nose 1.630, head pivot 1.620,
// chin 1.535, collar band 1.420-1.510, waist 1.100, hips 1.000, hock 0.150.
// Head width 0.325 against a ruff width of 0.600 — the 1 : 1.85 ratio is the
// whole silhouette; do not shrink the ruff.
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}
  const night = costume === 1
  const containers = []

  // --- materials ------------------------------------------------------------
  // Fur is *sheened*, not shiny: the forward-scattering lobe shows only at
  // grazing angles. aoIntensity is above the preset default because on a white
  // animal occlusion IS the shading.
  // Texture sets are the real cost here (one 512 map set is ~2.7 MB of an 80 MB
  // global budget), so the coat asks the GPU for exactly FOUR fields: fur-long
  // at two densities and fur-short at two. Everything else shares a kind with
  // another region — the paw pads deliberately ride the collar strap's leather.
  // ALBEDO CARRIES NOTHING. `map: null` strips the procedural colour field and
  // keeps the normal + roughness + AO maps, so every clump on this animal is a
  // real relief that flips its shadow side when the key moves. It also kills
  // the mirrored-UV tell: a planar-projected fur albedo is symmetric about the
  // median plane, and real fur never is.
  //
  // `mapOpts.repeat` is the texel-density knob and it is FREE (textures.js
  // clones the base upload with a new repeat), so the whole coat asks for
  // exactly TWO generated fields — fur-long @2.6 and fur-short @1.6 — and every
  // region then picks its own world-constant clump size off them. Delivered
  // clump period on the ruff is ~0.02 m, against modelled locks at 0.05–0.11 m
  // and roughness breakup below that: three separate frequency bands, which is
  // what stops every zoom level looking identical.
  //
  // SHEEN IS THIS CHARACTER'S INSURANCE POLICY AND IT IS TUNED, NOT DEFAULTED.
  // Fur is not shiny, it is *sheened*: the forward-scattering lobe from stray
  // fibres appears only at grazing angles, which is exactly where a light
  // animal needs a highlight and exactly where a diffuse-only white coat has
  // nothing. sheenRoughness 0.55 (not 0.78) is what makes the lobe a readable
  // band rather than a smear across the whole form; sheenTint 0.45 lands the
  // halo at ~#EFEBE0 off a warm cream albedo — warm on the key side, which is
  // the half of "warm halo / cool rim" that lives in a material and therefore
  // survives every arena. envMapIntensity is up from 0.5 to 0.7 so the bevels
  // actually catch the sky term: a chamfer that reflects nothing renders as a
  // hard polygon boundary and the triangles spent on it are wasted.
  const FURL = {
    map: null, sheen: 0.42, sheenRoughness: 0.55, sheenTint: 0.45,
    aoIntensity: 1.4, envMapIntensity: 0.7,
  }
  const FURS = { map: null, sheenTint: 0.45, aoIntensity: 1.3, envMapIntensity: 0.66 }
  const maneM = M.pbr(P.COAT, 'fur-long', {
    ...FURL, mapOpts: { scale: 2.6, repeat: [4.2, 4.2] }, normalScale: 1.75, name: 'shibro/ruff',
  })
  const bodyM = M.pbr(P.COAT, 'fur-long', {
    ...FURL, mapOpts: { scale: 2.6, repeat: [3.4, 3.4] }, normalScale: 1.35, name: 'shibro/bodyCoat',
  })
  // Plume / pantaloons / forearm feathering: the LONG, soft, layered coat. A
  // lower roughness multiplier and a wider sheen than the body make the layering
  // in the silhouette read as a material change and not only as geometry.
  const plumeM = M.pbr(P.COAT, 'fur-long', {
    ...FURL, mapOpts: { scale: 2.6, repeat: [5.0, 5.0] }, normalScale: 1.55,
    roughness: 0.9, sheen: 0.48, sheenRoughness: 0.52, name: 'shibro/longCoat',
  })
  // The cool up-facing tips. Same preset and same maps as the rest of the coat
  // (so it costs no extra texture field), a colder albedo and a wider, brighter
  // sheen — these are the pixels that sit against the sky in every frame and
  // they are the only place the silhouette gets a hue boundary instead of a
  // value one. Used on the crown lock breakers and the plume's upper edge ONLY.
  const skyM = M.pbr(P.COAT_SKY, 'fur-long', {
    ...FURL, mapOpts: { scale: 2.6, repeat: [5.0, 5.0] }, normalScale: 1.5,
    sheen: 0.58, sheenRoughness: 0.46, envMapIntensity: 0.8, name: 'shibro/skyTip',
  })
  const shortM = M.pbr(P.COAT, 'fur', {
    ...FURS, mapOpts: { scale: 1.6, repeat: [4.4, 4.4] }, sheen: 0.34, normalScale: 1.2, name: 'shibro/shortCoat',
  })
  const headM = M.pbr(P.COAT, 'fur', {
    ...FURS, mapOpts: { scale: 1.6, repeat: [7.5, 7.5] }, sheen: 0.32, normalScale: 1.0, name: 'shibro/headCoat',
  })
  const faceM = M.pbr(P.COAT_LIGHT, 'fur', {
    ...FURS, mapOpts: { scale: 1.6, repeat: [11, 11] }, roughness: 0.93, sheen: 0.30,
    normalScale: 0.75, name: 'shibro/muzzle',
  })
  const shadeM = M.pbr(P.COAT_SHADE, 'fur', {
    ...FURS, mapOpts: { scale: 1.6, repeat: [11, 11] }, sheen: 0.26, normalScale: 0.8, name: 'shibro/coatShade',
  })
  const underM = M.pbr(P.COAT_DEEP, 'fur-dark', { noMaps: true, roughness: 0.96, sheen: 0, name: 'shibro/undercoat' })
  const badgerM = M.pbr(P.BADGER, 'fur', {
    ...FURS, mapOpts: { scale: 1.6, repeat: [11, 11] }, sheen: 0.22, normalScale: 0.9, name: 'shibro/badgerPatch',
  })
  // Nose leather: the only WET thing on the exterior. `map: null` is what stops
  // the leather field's warm albedo turning a cool near-black planum into brown
  // wood grain; the pebbling survives entirely in the normal map, at a repeat
  // that puts the grain well under a millimetre on a 0.08 m object.
  const noseM = M.pbr(P.PIGMENT, 'leather', {
    // Deliberately the SAME (kind, scale, wear) as the collar strap below, so
    // the two leather regions share one generated field — surfaceMaps() caches
    // on kind|size|seed|scale|wear|tint and `repeat` is not part of the key, so
    // the nose gets its own texel density for free and the character pays for
    // one leather map set instead of two. At repeat 9 on an 0.08 m object the
    // strap's crack-and-wear relief lands well under a millimetre and reads as
    // the planum's pebbling, which is what it is supposed to be anyway.
    map: null, mapOpts: { scale: 1.6, repeat: [9, 9], wear: 0.7 }, roughness: 0.5,
    clearcoat: 0.6, clearcoatRoughness: 0.07, envMapIntensity: 1.25, name: 'shibro/noseLeather',
  })
  const pigM = M.pbr(P.PIGMENT, 'skin', { map: null, roughness: 0.65, name: 'shibro/pigment' })
  const pupilM = M.pbr(P.PUPIL, 'plastic-gloss', { map: null, roughness: 0.5, name: 'shibro/pupil' })
  const scleraM = M.pbr(P.SCLERA, 'skin', { map: null, roughness: 0.5, name: 'shibro/eyeWhite' })
  const irisM = M.pbr(P.IRIS, 'skin', { map: null, roughness: 0.42, clearcoat: 0.6, name: 'shibro/iris' })
  const corneaM = M.pbr(0xeef0f2, 'glass', {
    transmission: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8,
    transparent: true, opacity: 0.24, depthWrite: false, name: 'shibro/cornea',
  })
  // the one crisp specular dot per eye — unlit so it survives any arena light
  const glintM = M.emissive(0xf4f6f8, 1.8, 'plastic-gloss', { noMaps: true, color: 0xdfe4e8, name: 'shibro/catchlight' })
  const conchaM = M.pbr(P.CONCHA, 'skin', { map: null, roughness: 0.82, name: 'shibro/concha' })
  const clawM = M.pbr(P.CLAW, 'horn', { name: 'shibro/claw' })
  // Pads get a genuinely different response from everything else on the model:
  // rubber, no fur normal, high roughness, visible pebbling. A blind viewer has
  // to be able to name this surface separately from the coat.
  const padM = M.pbr(P.PAD, 'rubber', { mapOpts: { scale: 2.2, repeat: [6, 6] }, roughness: 0.9, name: 'shibro/pawPad' })
  const steelM = M.pbr(night ? P.STEEL_NIGHT : P.STEEL, 'metal', {
    mapOpts: { scale: 1.1, wear: 0.45 }, envMapIntensity: 1.35, name: 'shibro/plate',
  })
  const steelDarkM = M.pbr(night ? 0x2c3340 : P.STEEL_DARK, 'metal-painted', { mapOpts: { wear: 0.6 }, name: 'shibro/underPlate' })
  // Collar strap: real cracked leather with a stitch relief and its own
  // roughness band — the third distinct material language on the body proper.
  const leatherM = M.pbr(P.COLLAR_LEATHER, 'leather', {
    map: null, mapOpts: { scale: 1.6, repeat: [5, 5], wear: 0.7 }, roughness: 1.05, name: 'shibro/strap',
  })
  const sashM = M.pbr(night ? P.SASH_NIGHT : P.SASH, 'cloth', {
    mapOpts: { scale: 3.0, repeat: [4, 4] }, sheen: 0.26, name: 'shibro/sash',
  })
  const goldM = M.pbr(P.GOLD, 'gold', { envMapIntensity: 1.4, name: 'shibro/gold' })
  // The ONE unique material on the model: medalControl() writes its emissive.
  // Without unique:true every gold surface in the scene would glow when he stakes.
  const medalM = M.pbr(P.GOLD, 'gold', { envMapIntensity: 1.4, emissive: 0x2a1d00, unique: true, name: 'shibro/medallion' })

  // --- hips -----------------------------------------------------------------
  // One lofted lower body: croup -> hip -> waist -> lower rib, so the waist V
  // that makes the ruff read is a real taper and not two spheres meeting.
  const hips = pivot(group, 0, 1.0, 0)
  bones.hips = hips
  const hipS = statics(hips); containers.push(hipS)
  hipS.add(new THREE.Mesh(loft([
    { at: [0, -0.085, 0], shape: rr(0.310, 0.275, 0.070, 0.005) },
    { at: [0, -0.010, 0], shape: rr(0.400, 0.340, 0.090, 0.000) },
    { at: [0, 0.060, 0], shape: rr(0.372, 0.320, 0.085, 0.005) },
    { at: [0, 0.105, 0], shape: rr(0.330, 0.300, 0.080, 0.010) },
    { at: [0, 0.165, 0], shape: rr(0.358, 0.328, 0.085, 0.010) },
  ], { subdivide: 1, ...UPZ }), shortM))
  // croup, falling to the tail root
  hipS.add(sph(0.115, shortM, -0.185, 0.115, 0, 1.05, 0.95, 1.12))

  // waist sash band — parented to `hips`, NOT to `sash`, so the belt survives
  // the 70 % accessory pop and only the hanging tail of it is torn away.
  const band = new THREE.Mesh(loft([
    { at: [0, 0.068, 0], shape: rr(0.348, 0.318, 0.080, 0.005) },
    { at: [0, 0.110, 0], shape: rr(0.360, 0.330, 0.082, 0.010) },
    { at: [0, 0.152, 0], shape: rr(0.348, 0.318, 0.080, 0.005) },
  ], { subdivide: 1, ...UPZ }), sashM)
  band.userData.prop = true
  hipS.add(band)
  // knot, on the character's left
  hipS.add(put(new THREE.Mesh(superellipsoid(0.046, 0.050, 0.056, 2.6, 2.6, 14), sashM), 0.100, 0.110, 0.212))
  hipS.add(put(new THREE.Mesh(superellipsoid(0.020, 0.030, 0.052, 2.4, 2.4, 12), sashM), 0.118, 0.088, 0.196, 0, 0, 0.5))
  hipS.add(put(new THREE.Mesh(superellipsoid(0.018, 0.028, 0.048, 2.4, 2.4, 12), sashM), 0.112, 0.132, 0.204, 0, 0, -0.4))

  // --- hanging sash panel (accessory bone: pops at 70 % damage) --------------
  // Its root cap sits ON the bone pivot and is closed, so the frozen detached
  // clone can never show a hole or a gap back to where the bone was.
  const sash = pivot(hips, -0.06, 0.04, 0.24)
  bones.sash = sash
  const sashS = statics(sash); containers.push(sashS)
  sashS.add(new THREE.Mesh(loft([
    { at: [0.000, 0.010, 0.000], shape: rr(0.150, 0.030, 0.014) },
    { at: [0.040, -0.110, -0.010], shape: rr(0.180, 0.026, 0.012) },
    { at: [0.080, -0.250, -0.030], shape: rr(0.172, 0.024, 0.011) },
    { at: [0.096, -0.390, -0.052], shape: rr(0.158, 0.022, 0.010), twist: 0.10 },
    { at: [0.100, -0.446, -0.062], shape: rr(0.150, 0.022, 0.010), twist: 0.12 },
  ], { subdivide: 1, ...UPZ }), sashM))
  // gold hem band + five tassels — the cheapest secondary motion on the model
  sashS.add(put(new THREE.Mesh(loft([
    { at: [0.098, -0.412, -0.057], shape: rr(0.156, 0.026, 0.010) },
    { at: [0.100, -0.480, -0.069], shape: rr(0.148, 0.024, 0.010) },
  ], { subdivide: 1, ...UPZ }), goldM)))
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * 0.032
    sashS.add(aim(put(new THREE.Mesh(roundedCone(0.008, 0.003, 0.045, 0.002, 6, 1), sashM),
      0.100, -0.502, -0.070 + z * 0.05), 0.04, -1, z * 0.35))
  }
  sashS.traverse((o) => { if (o.isMesh) o.userData.prop = true })

  // --- plumed tail (secondary bone: tears at 50 % damage) -------------------
  // Carried up and over the back in an OPEN scimitar arc. The void between the
  // plume and the mane below it must never close — that gap is what makes the
  // tail read as carried rather than glued, and it is the anti-collision cue
  // against the roster's other dog, whose tail is a closed ring.
  const tail = pivot(hips, -0.26, 0.1, 0)
  bones.tail = tail
  const tailS = statics(tail); containers.push(tailS)
  // The tip stops at M x -0.198 and the plume thins to 0.036 m there, which is
  // what keeps the void open: underside 1.820 against a mane crest of 1.720 is
  // 0.100 m of daylight, above the 0.090 hard floor. The previous arc carried
  // the tip forward to M x -0.11 at full thickness, straight through the back
  // of the skull, and the "open scimitar" became a lump fused to the shoulder.
  // MEASURE THE VOID AGAINST THE MANE AND THE CROWN, NOT AGAINST THE RIBCAGE.
  // Against the ribcage the clearance is a comfortable 0.25 m and tells you
  // nothing; the things the arc actually passes over are the mane's rear locks
  // (M y ~1.52) and the back of the head fur (M y ~1.85). Measured on the
  // previous arc: 0.041 m at the mane and 0.051 m at the crown — i.e. pinched
  // shut at BOTH ends, which turns an open scimitar into a closed ring with a
  // hole in it. That is the other dog's tail, and it is the one silhouette this
  // fighter is not allowed to have. This arc bulges 0.06 m further aft through
  // the middle and stops its tip 0.058 m further back, which opens both pinches
  // past the 0.09 m hard floor.
  const tailPts = [
    [0, 0, 0], [-0.115, 0.205, 0.022], [-0.185, 0.440, 0.050],
    [-0.160, 0.640, 0.070], [-0.098, 0.732, 0.080], [-0.030, 0.740, 0.086],
  ]
  const plumeR = (t) => (t < 0.45
    ? 0.062 + (0.086 - 0.062) * (t / 0.45)
    : 0.086 + (0.036 - 0.086) * ((t - 0.45) / 0.55))
  tailS.add(new THREE.Mesh(splineTube(tailPts, 0.07, 26, plumeR,
    { radialSeg: 12, roundStart: true, roundEnd: true }), plumeM))
  // the undercoat shell, showing through wherever the locks part
  tailS.add(new THREE.Mesh(splineTube(tailPts, 0.05, 18, (t) => plumeR(t) * 0.7,
    { radialSeg: 8, roundStart: true, roundEnd: true }), underM))
  // 7 locks on the OUTER edge of the arc only. "Outer" is computed against the
  // body's centre of mass rather than assumed to be "downward": on the far side
  // of the arc, down points straight at the mane, and locks aimed that way close
  // the plume void and re-create exactly the fused lump this build exists to
  // remove. The upper/inner edge stays smooth, which is also what real carried
  // tails do.
  const BODY_C = [0.26, 0.34]     // tail-local coords of the body's mass centre
  for (let i = 0; i < 7; i++) {
    const u = (0.08 + 0.72 * (i / 6)) * (tailPts.length - 1)
    const k = Math.min(tailPts.length - 2, Math.floor(u))
    const f = u - k
    const a = tailPts[k], b = tailPts[k + 1]
    const px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f, pz = a[2] + (b[2] - a[2]) * f
    let dx = -(b[1] - a[1]), dy = (b[0] - a[0])     // normal of the arc...
    if (dx * (px - BODY_C[0]) + dy * (py - BODY_C[1]) < 0) { dx = -dx; dy = -dy }   // ...forced OUTWARD
    const n = Math.hypot(dx, dy) || 1
    // Past the arc's shoulder the outward normal is pointing up-and-back, i.e.
    // these three locks are the plume's SKY-FACING edge — the top silhouette of
    // the tail against whatever is behind him. They get the cool tip colour.
    const lm = i >= 4 ? skyM : plumeM
    tailS.add(lock(lm, 0.050 + 0.040 * ((i * 5) % 7) / 6, 0.026,
      px + (dx / n) * 0.052, py + (dy / n) * 0.052, pz - 0.02,
      dx / n, dy / n, -0.25 + 0.1 * ((i * 3) % 5) / 4, i * 0.7))
  }

  // --- legs ------------------------------------------------------------------
  // Long thigh, short shin, a very high hock: canine skeleton overruling human
  // proportion, which reads instantly as "dog" and costs nothing in animation.
  // Below the pantaloon hem the leg is SHORT-coated and clean — two calm
  // columns against the chaos above, and the gap between them is a hard
  // silhouette constraint (>= 0.16 m of background at knee height).
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.02, 0.17 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    const legS = statics(leg); containers.push(legS)
    // ONE swept thigh: hip ball -> femoral shaft -> the KNEE ball, all a single
    // lathed surface. The knee sphere lives on the THIGH (the parent) and is
    // concentric with the shin's pivot at -0.520, which is what makes the joint
    // angle-proof; the shin then starts 4 % smaller inside it. Short coat, like
    // the hips directly above it — the long coat on this leg is the pantaloon,
    // and it is a separate layer, not a separate cylinder.
    legS.add(new THREE.Mesh(limb(
      [[0, 0.1170], [-0.150, 0.1045], [-0.260, 0.0925], [-0.360, 0.0838], [-0.462, 0.0782]],
      [[0, 0.118], [-0.520, 0.0898]], { radialSeg: 14 }), shortM))
    // pantaloons — the biggest silhouette event below the waist
    legS.add(new THREE.Mesh(loft([
      { at: [0, -0.090, 0], shape: rr(0.212, 0.228, 0.068, -0.012) },
      { at: [0, -0.150, 0], shape: rr(0.244, 0.292, 0.082, -0.048) },
      { at: [0, -0.205, 0], shape: rr(0.250, 0.316, 0.085, -0.062) },
      { at: [0, -0.290, 0], shape: rr(0.230, 0.268, 0.076, -0.056) },
      { at: [0, -0.348, 0], shape: rr(0.196, 0.210, 0.060, -0.046) },
    ], { subdivide: 1, ...UPZ }), plumeM))
    for (let i = 0; i < 6; i++) {
      const a = -0.35 + (i / 5) * 2.6 + (side < 0 ? 0.2 : 0)
      legS.add(lock(plumeM, 0.040 + 0.035 * ((i * 3) % 5) / 4, 0.024,
        -0.046 - Math.cos(a) * 0.075, -0.344, Math.sin(a) * 0.085,
        -Math.cos(a) * 0.30, -0.94, Math.sin(a) * 0.30, i * 0.9))
    }

    const shin = pivot(leg, 0, -0.52, 0)
    bones[side === 1 ? 'shinL' : 'shinR'] = shin
    const shinS = statics(shin); containers.push(shinS)
    // ONE swept shin: patellar cap (0.0862 = 0.96 x the thigh's knee sphere, so
    // it can never emerge through it at any flexion) -> tibia -> the hock swell
    // at -0.345 -> into the paw. The shipped build spent three primitives here
    // and paid for it with a ring at the knee AND a ring at the ankle.
    shinS.add(new THREE.Mesh(limb(
      [[0, 0.0853], [-0.130, 0.0725], [-0.215, 0.0640], [-0.285, 0.0605],
        [-0.345, 0.0648], [-0.395, 0.0560]],
      [[0, 0.0862]], { radialSeg: 13 }), shortM))
    // paw: rounded, close-cupped, arched toes
    shinS.add(put(new THREE.Mesh(roundedBox(0.235, 0.072, 0.150, 0.032, 2), shortM), 0.040, -0.424, 0))
    for (let j = 0; j < 4; j++) {
      const tz = (j - 1.5) * 0.038
      shinS.add(put(new THREE.Mesh(superellipsoid(0.038, 0.026, 0.020, 2.6, 2.6, 8), shortM), 0.138, -0.428, tz))
      shinS.add(aim(put(new THREE.Mesh(roundedCone(0.010, 0.002, 0.028, 0.002, 6, 1), clawM),
        0.176, -0.437, tz), 0.92, -0.39, tz * 1.2))
    }
    // rear double dewclaws — the guardian-breed marker essentially nobody models
    for (const [len, dy] of [[0.035, -0.336], [0.028, -0.360]]) {
      shinS.add(aim(put(new THREE.Mesh(roundedCone(0.008, 0.002, len, 0.002, 6, 1), clawM),
        -0.012, dy, -0.052 * side), -0.42, -0.72, -0.55 * side))
    }
  }

  // --- torso -----------------------------------------------------------------
  const torso = pivot(hips, 0, 0.12, 0)
  bones.torso = torso
  const torsoS = statics(torso); containers.push(torsoS)

  // ribcage: one loft, waist -> chest -> shoulder girdle. Oval in section,
  // deeper than wide, bottoming out 0.040 m BELOW the elbow. The waist is the
  // most defined in the roster and the long coat is not allowed to fill it —
  // a mass that explodes at the shoulders and pinches at the waist is what
  // makes the ruff read as a ruff.
  torsoS.add(new THREE.Mesh(loft([
    { at: [0, -0.055, 0], shape: rr(0.352, 0.322, 0.084, 0.005) },
    { at: [0, -0.020, 0], shape: rr(0.330, 0.300, 0.080, 0.008) },
    { at: [0, 0.110, 0], shape: rr(0.400, 0.350, 0.100, 0.010) },
    { at: [0, 0.180, 0], shape: rr(0.440, 0.400, 0.110, 0.012) },
    { at: [0, 0.300, 0], shape: rr(0.480, 0.420, 0.120, 0.012) },
    { at: [0, 0.420, 0], shape: rr(0.440, 0.400, 0.115, 0.008) },
    { at: [0, 0.500, 0], shape: rr(0.340, 0.330, 0.100, 0.000) },
    { at: [0, 0.520, 0], shape: rr(0.250, 0.250, 0.090, -0.012) },
  ], { subdivide: 1, ...UPZ }), bodyM))

  // the neck core. There is no VISIBLE neck — the mane fills the throat — but
  // there is emphatically a neck, and without it the mane has nothing to sit on
  // and the collar has nothing to wrap. 0.300 m across is the number the whole
  // ruff closes on: 0.300 + 2 x 0.150 of coat = the 0.600 m ruff.
  torsoS.add(new THREE.Mesh(loft([
    { at: [0, 0.255, 0], shape: rr(0.300, 0.320, 0.090, 0.090) },
    { at: [0, 0.360, 0], shape: rr(0.285, 0.300, 0.085, 0.070) },
    { at: [0, 0.460, 0], shape: rr(0.262, 0.280, 0.080, 0.048) },
    { at: [0, 0.534, 0], shape: rr(0.224, 0.244, 0.070, 0.045) },   // sleeved into the cranium: no gap
  ], { subdivide: 2, ...UPZ }), bodyM))

  // deltoids — they bridge the 0.100 m of empty space between the ribcage
  // surface and the frozen arm pivots, so there is no visible ball joint
  for (const side of [1, -1]) {
    torsoS.add(put(new THREE.Mesh(superellipsoid(0.095, 0.100, 0.096, 3, 3, 13), bodyM), 0.02, 0.400, 0.340 * side))
    // armpit cavity, in COAT_DEEP: the second of the two places this character
    // carries its own dark rather than hoping the arena's AO will show up
    torsoS.add(put(new THREE.Mesh(superellipsoid(0.080, 0.072, 0.050, 3, 3, 9), underM), 0.02, 0.292, 0.262 * side))
  }

  // --- the mane: two shells --------------------------------------------------
  // Inner dead-matte undercoat in COAT_DEEP, outer glossy guard-hair shell in
  // COAT. Wherever the outer locks part, the dark undercoat shows through as a
  // slot — that dark-between-the-locks IS the visual signature of a double coat.
  //
  // THE ONE RATIO THAT DEFINES THIS CHARACTER: head 0.325 : ruff 0.600 = 1:1.85,
  // measured in the band M y 1.620-1.700 (torso-local 0.500-0.580) and NOWHERE
  // else. The previous build put its 0.600 at M y 1.500 and had collapsed to
  // 0.372 by the measurement band, which is a 1:1.14 taper — a fat dog, not a
  // mane. So the crest band below is 0.575-0.600 wide and the shell then
  // COLLAPSES to 0.330 in the 0.020 m above it. That collapse is a step, not a
  // slope, and it is the single most identifiable shape on the model.
  //
  // The waist at torso y 0.345 is the collar compression (§7.1): the coat is
  // squeezed to 0.412 under a 0.476 m band, so the strap looks buried in fur
  // instead of resting on it.
  const MANE = [
    [0.105, 0.430, 0.430, 0.020],
    [0.200, 0.510, 0.480, 0.030],
    [0.275, 0.520, 0.480, 0.010],
    [0.345, 0.412, 0.400, -0.010],   // collar compression
    [0.420, 0.505, 0.430, -0.030],   // jaw notch: front face back at x 0.185
    [0.500, 0.575, 0.420, -0.048],   // ruff crest band begins  (M y 1.620)
    [0.552, 0.600, 0.400, -0.062],   // WIDEST                  (M y 1.672)
    [0.580, 0.560, 0.360, -0.075],   // crest top               (M y 1.700)
    [0.600, 0.330, 0.270, -0.082],   // the collapse            (M y 1.720)
  ]
  torsoS.add(new THREE.Mesh(loft(
    MANE.map(([y, w, d, xo]) => ({ at: [0, y, 0], shape: rr(w - 0.048, d - 0.044, 0.100, xo) })),
    { subdivide: 1, ...UPZ }), underM))
  torsoS.add(new THREE.Mesh(loft(
    MANE.map(([y, w, d, xo]) => ({ at: [0, y, 0], shape: rr(w, d, 0.115, xo) })),
    { subdivide: 1, ...UPZ }), maneM))
  // 11 modelled lock breakers on the mane outline — a smooth ruff is a beanbag.
  // Each is 0.05-0.11 m proud, at irregular spacing, and they are the ONLY
  // silhouette frequency between the mass and the normal map's 0.02 m clumps.
  const maneRing = (h) => {
    let i = 0
    while (i < MANE.length - 2 && MANE[i + 1][0] < h) i++
    const [y0, w0, d0, x0] = MANE[i], [y1, w1, d1, x1] = MANE[i + 1]
    const t = Math.max(0, Math.min(1, (h - y0) / (y1 - y0)))
    return [(w0 + (w1 - w0) * t) * 0.5, (d0 + (d1 - d0) * t) * 0.5, x0 + (x1 - x0) * t]
  }
  //
  // THE LOCK BAND STOPS AT torso y 0.530 (M y 1.650) AND THAT CEILING IS THE
  // POINT. Above it lies the head collapse — the outline has to fall from
  // 0.600 m to 0.325 m in 0.085 m of vertical travel — and a single 0.11 m lock
  // rooted at y 0.570 puts 0.30 m of half-width right in the middle of that
  // band, which turns the step back into a slope and takes the whole silhouette
  // with it. Measured on the previous build: half-width 0.286 at M y 1.725
  // against a 0.165 loft. One lock. Cap the band and the step comes back.
  for (let i = 0; i < 11; i++) {
    const h = 0.170 + 0.360 * (((i * 5) % 11) / 10)
    let a = i * (Math.PI * 2 / 11) + 0.34
    // The jaw notch is the only concavity on the upper body and it IS this
    // character's neck. The collar's spikes may cross it; the fur may not — so
    // any lock that would grow forward across the notch is sent aft.
    if (h > 0.330 && h < 0.520 && Math.cos(a) > 0.10) a += Math.PI
    const [rz, rx, cx] = maneRing(h)
    const droop = h > 0.470 ? -0.72 : 0.16
    // Locks that grow straight aft are trimmed: they are the far wall of the
    // plume void (§2.4.3) and a 0.11 m lock there costs the whole clearance.
    const aft = Math.max(0, -Math.cos(a))
    torsoS.add(lock(maneM, (0.052 + 0.058 * (((i * 7) % 11) / 10)) * (1 - 0.42 * aft), 0.030,
      cx + Math.cos(a) * rx * 0.94, h, Math.sin(a) * rz * 0.94,
      Math.cos(a) * 0.92, droop, Math.sin(a) * 0.92, i * 0.8))
  }
  // Locks overhanging the collar's top edge, compressed beneath it. They are
  // deliberately absent from the front 55 deg: a lock pointing straight forward
  // there lands inside the jaw notch, and the notch is the only concavity this
  // silhouette has.
  for (let i = 0; i < 8; i++) {
    const a = (i < 4 ? 1 : -1) * (0.48 + 0.98 * ((i % 4) / 3))
    torsoS.add(lock(maneM, 0.040 + 0.022 * ((i * 3) % 5) / 4, 0.024,
      0.010 + Math.cos(a) * 0.205, 0.402, Math.sin(a) * 0.228,
      Math.cos(a) * 0.42, -0.90, Math.sin(a) * 0.42, i * 1.2))
  }

  // chest apron — the front face of the mane, reaching M x +0.300, with a jagged
  // hem of locks hanging over the sash line. It is deliberately kept BELOW the
  // collar: the concavity between the apron's top and the chin is the jaw notch,
  // and the jaw notch is the only thing separating head from torso at 128 px.
  torsoS.add(put(new THREE.Mesh(superellipsoid(0.115, 0.100, 0.230, 2.8, 2.6, 15), maneM), 0.185, 0.205, 0))
  torsoS.add(put(new THREE.Mesh(superellipsoid(0.086, 0.070, 0.180, 2.8, 2.6, 11), underM), 0.170, 0.190, 0))
  for (let i = 0; i < 9; i++) {
    const a = (-1.05 + 2.1 * (i / 8))
    torsoS.add(lock(maneM, 0.048 + 0.045 * (((i * 3) % 7) / 6), 0.028,
      0.168 + Math.cos(a) * 0.090, 0.118, Math.sin(a) * 0.212,
      Math.cos(a) * 0.24, -0.95, Math.sin(a) * 0.24, i * 1.1))
  }

  // --- guardian collar -------------------------------------------------------
  // A livestock-guardian dog's anti-predator collar: a padded leather belt with
  // outward-facing spikes over the throat. Sized to the NECK, not the ribcage.
  // Structurally it IS this character's neck — the dark band that separates the
  // head from the body at 128 px, which no amount of white coat can do.
  // Three things it has to do, all of them value work: sit at the THROAT
  // (M y 1.420-1.510, inside the jaw notch), cut a HARD DARK horizontal against
  // a cream coat, and point its spikes UP and OUT. A cream band with downward
  // cones on the sternum reads as a row of teeth on the chest, which is what
  // the previous build shipped.
  // xs flattens the band in X so it sits against the chest AND so the band's
  // front lands at M x 0.223 — 0.110 m behind the chin at M x 0.333. That gap is
  // the jaw notch (§2.5), the only concavity on the upper body, and it is the
  // one thing that separates head from torso at 128 px on an animal with no
  // visible neck. The collar sits inside it; the fur is not allowed to.
  const CB = { x: 0.052, y: 0.345, r: 0.238, xs: 0.72 }   // torso-local; M y 1.465
  const collar = new THREE.Group()
  collar.name = 'collar'
  const cBand = put(new THREE.Mesh(frustum(CB.r, CB.r * 0.985, 0.090, 20, 0.009), leatherM), CB.x, CB.y, 0)
  cBand.scale.x = CB.xs
  collar.add(cBand)
  // padding roll, inner/lower edge only: the detail that reads protective
  // rather than aggressive, and it closes the seam into the fur
  const cPad = put(new THREE.Mesh(filletRing(CB.r * 0.97, 0.015, 5, 18), leatherM), CB.x, CB.y - 0.044, 0)
  cPad.scale.x = CB.xs
  collar.add(cPad)
  // brushed-steel outer plate over the front 200 deg of the arc
  for (let i = 0; i < 9; i++) {
    const a = (-1.74 + 3.48 * (i / 8))
    collar.add(put(new THREE.Mesh(roundedBox(0.024, 0.062, 0.076, 0.006, 1), steelM),
      CB.x + Math.cos(a) * CB.r * CB.xs, CB.y, Math.sin(a) * CB.r, 0, -a, 0))
  }
  // 12 spikes, canted +8 deg UP and radially outward, over the front/side 260 deg.
  // None at the back of the neck, where the mane is thickest.
  for (let i = 0; i < 12; i++) {
    const a = (-2.27 + 4.54 * (i / 11))
    const px = CB.x + Math.cos(a) * CB.r * CB.xs * 1.02
    const pz = Math.sin(a) * CB.r * 1.02
    const dir = [Math.cos(a) * 0.99, 0.141, Math.sin(a) * 0.99]
    collar.add(aim(put(new THREE.Mesh(roundedCone(0.016, 0.006, 0.040, 0.004, 6, 1), steelDarkM),
      px, CB.y + 0.004, pz), ...dir))
    collar.add(aim(put(new THREE.Mesh(roundedCone(0.007, 0.0015, 0.020, 0.002, 6, 1), steelM),
      px + dir[0] * 0.036, CB.y + 0.004 + dir[1] * 0.036, pz + dir[2] * 0.036), ...dir))
  }
  // buckle on the character's LEFT, with a trailing strap tail
  collar.add(put(new THREE.Mesh(roundedBox(0.018, 0.046, 0.052, 0.005, 2), goldM),
    CB.x + 0.032, CB.y, CB.r * 0.94, 0, -1.35, 0))
  collar.add(put(new THREE.Mesh(roundedBox(0.010, 0.034, 0.072, 0.004, 1), leatherM),
    CB.x - 0.030, CB.y - 0.012, CB.r * 0.90, 0.25, -1.35, 0))
  collar.traverse((o) => { if (o.isMesh) o.userData.prop = true })
  torsoS.add(collar)

  // --- pauldrons: three plates per side, cascading outward and downward ------
  // The only straight lines on the upper body, and the widest thing on the
  // figure (0.930 m) — wider than the 0.870 m of shoulder flesh beneath them,
  // or they would simply be inside the dog.
  //
  // THE SIGN OF THE CANT IS LOAD-BEARING. rotation.x = +tilt * side drops the
  // OUTER edge of the plate; the opposite sign lifts it, and three plates
  // cantilevered up-and-out read as a ski rack bolted to a dog. Each plate's
  // inner edge is clamped to z >= 0.215 so nothing ever crosses the median
  // plane, and each sits on a COLLAR_LEATHER backing strip that is visible in
  // the 0.008 m gap between consecutive plates — the cheapest "this is real
  // armour" cue there is.
  // The centre z values are pre-compensated for the cant: rotating a plate of
  // half-depth d/2 about its own centre pulls its outer edge in by
  // (d/2)(1 - cos tilt), so a plate parked at the brief's nominal centre lands
  // its outer edge short and the span measures 0.87 m — narrower than the
  // 0.870 m of shoulder flesh underneath, i.e. the armour is inside the dog.
  // Solving pz = zOuter - (d/2)cos(tilt) puts the outer edges back on
  // 0.385 / 0.440 / 0.465 and the span on the 0.930 m it is supposed to be.
  const PLATE = [
    [0.300, 0.030, 0.170, 0.502, 0.303, 0.28, steelM],
    [0.280, 0.028, 0.160, 0.446, 0.368, 0.454, steelM],
    [0.240, 0.026, 0.150, 0.384, 0.403, 0.593, steelDarkM],
  ]
  for (const side of [1, -1]) {
    const cant = side === 1 ? 1 : 1.06          // nothing here is symmetric to the mm
    // the yoke: a painted-steel band arching over the deltoid that the plates
    // hang from, sunk 0.012 m into the coat so the armour is strapped, not glued
    torsoS.add(put(new THREE.Mesh(roundedBox(0.230, 0.040, 0.240, 0.014, 1), steelDarkM),
      0.020, 0.512, 0.300 * side, 0.20 * side))
    torsoS.add(put(new THREE.Mesh(roundedBox(0.196, 0.026, 0.070, 0.010, 1), leatherM),
      0.020, 0.486, 0.212 * side, 0.10 * side))
    for (const [w, h, d, py, pz, tilt, pm] of PLATE) {
      const rot = tilt * cant * side
      // leather backing, 0.014 m proud behind the plate: it is what shows in the
      // gap between plates and what the plate visibly rests on
      torsoS.add(put(new THREE.Mesh(roundedBox(w * 0.92, 0.014, d * 1.04, 0.006, 1), leatherM),
        0.020, py + 0.020, pz * side, rot))
      torsoS.add(put(new THREE.Mesh(roundedBox(w, h, d, 0.008, 1), pm), 0.020, py, pz * side, rot))
      // rolled top edge — a straight bright chamfer line along the plate's length
      torsoS.add(put(new THREE.Mesh(taperedCapsule(0.011, 0.011, w * 0.86, 3, 8), steelM),
        0.020, py + h * 0.5 + 0.002, (pz - d * 0.42) * side, rot, 0, Math.PI / 2))
      for (const rx of [0.088, 0.044]) {   // two gold rivets on the forward third
        torsoS.add(put(new THREE.Mesh(roundedBox(0.020, 0.012, 0.020, 0.004, 1), goldM),
          rx, py + h * 0.5 + 0.006, (pz - 0.03) * side, rot))
      }
    }
    // chest strap X — short, matte and low, purely so the GOLD medallion has a
    // dark to sit on (gold is only 1.3 : 1 against the coat and vanishes on it).
    // It stops well below the collar: a strap that climbs to the throat reads as
    // a plate punched through the ribcage.
    // It has to be LONGER than the medallion is wide or it is not a strap, it
    // is a shim: at 0.260 m the arms reached z 0.109 against a 0.106 m seal and
    // the gold ended up framed by cream coat on every side, which is the one
    // thing the value ladder forbids (COAT : GOLD is 1.31 : 1 — gold does not
    // separate from this coat by value and vanishes on it).
    torsoS.add(put(new THREE.Mesh(roundedBox(0.018, 0.380, 0.055, 0.007, 1), steelDarkM),
      0.238, 0.318, 0, 0.58 * side))
  }

  // --- validator medallion ---------------------------------------------------
  // A geometric seal of our own invention: nested chevrons in a recessed hex
  // core. No wordmark, no ticker, no animal, no letterform of any kind.
  const medal = new THREE.Group()
  medal.name = 'medallion'
  // A STEEL_DARK backing plate, 0.020 m wider than the seal all round. GOLD is
  // only 1.31 : 1 against this coat, so a gold disc laid straight onto cream
  // fur has no edge at all — it has to sit on a dark. This is the cheapest
  // possible way to guarantee it, and it also stops the bezel's rim reading as
  // a scalloped cut-out where it clips into the chest apron.
  medal.add(put(new THREE.Mesh(frustum(0.126, 0.126, 0.014, 6, 0.004), steelDarkM), 0.302, 0.300, -0.015, 0, 0, -Math.PI / 2))
  medal.add(put(new THREE.Mesh(frustum(0.106, 0.106, 0.012, 6, 0.004), goldM), 0.314, 0.300, -0.015, 0, 0, -Math.PI / 2))
  medal.add(put(new THREE.Mesh(frustum(0.099, 0.099, 0.030, 6, 0.005), medalM), 0.332, 0.300, -0.015, 0, 0, -Math.PI / 2))
  medal.add(put(new THREE.Mesh(frustum(0.064, 0.064, 0.014, 6, 0.003), steelDarkM), 0.344, 0.300, -0.015, 0, 0, -Math.PI / 2))
  for (let i = 0; i < 3; i++) {                       // three nested chevrons
    const s = 0.024 + i * 0.015
    for (const sg of [1, -1]) {
      medal.add(put(new THREE.Mesh(roundedBox(0.008, 0.010, s * 1.5, 0.003, 1), goldM),
        0.352, 0.300 + s * 0.55, -0.015 + 0, 0.62 * sg))
    }
  }
  for (const sg of [1, -1]) {                         // two links up to the strap
    medal.add(put(new THREE.Mesh(roundedBox(0.012, 0.092, 0.012, 0.004, 1), goldM),
      0.292, 0.356, 0.044 * sg - 0.015, 0.30 * sg, 0, -0.42))
  }
  medal.traverse((o) => { if (o.isMesh) o.userData.prop = true })
  // pulled back until its front face is only 0.011 m proud of the chest apron's
  // apex: parked at the brief's M x 0.36 it sits exactly as far forward as the
  // nose and turns the whole profile front edge into one dead-straight line,
  // which erases the jaw notch from the only camera the game has.
  medal.position.set(-0.045, -0.020, 0)
  torsoS.add(medal)
  torso.userData.medalMat = medalM

  // --- arms ------------------------------------------------------------------
  // Arm : height = 0.379, i.e. human-normal, and that is a characterisation:
  // he is a person in a dog's body, standing up straight. The hands are hands
  // SHAPED like paws — he has to punch, grab and hold a blade with them.
  for (const side of [1, -1]) {
    const arm = pivot(torso, 0.02, 0.42, 0.34 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    const armS = statics(arm); containers.push(armS)
    // ONE swept upper arm: shoulder ball -> humerus -> the ELBOW ball, which is
    // concentric with the forearm's pivot at -0.320 and therefore cannot open.
    armS.add(new THREE.Mesh(limb(
      [[0, 0.0970], [-0.130, 0.0855], [-0.210, 0.0805], [-0.278, 0.0778]],
      [[0, 0.098], [-0.320, 0.0836]], { radialSeg: 14 }), bodyM))

    const fore = pivot(arm, 0, -0.32, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    const foreS = statics(fore); containers.push(foreS)
    // ONE swept forearm: olecranon cap (0.0803 = 0.96 x the humerus's elbow
    // sphere) -> radius/ulna -> a carpal swell that runs 0.045 m INSIDE the
    // paw-hand block. The shipped forearm capsule bottomed out at -0.267 while
    // the hand block starts at -0.275: an 8 mm hole at the wrist in bind pose.
    foreS.add(new THREE.Mesh(limb(
      [[0, 0.0795], [-0.100, 0.0730], [-0.170, 0.0665], [-0.235, 0.0618], [-0.272, 0.0588]],
      [[0, 0.0803]], { radialSeg: 13 }), bodyM))
    // feathering on the CAUDAL edge only. Clean leading edge, ragged trailing
    // edge — that asymmetry is what sells motion in every punch.
    for (let i = 0; i < 5; i++) {
      foreS.add(lock(plumeM, 0.042 + 0.020 * ((i * 3) % 5) / 4, 0.020,
        -0.058, -0.040 - i * 0.042, 0, -0.86, -0.42, 0.10 * (i % 2 ? 1 : -1), i * 1.3))
    }
    // paw-hand
    foreS.add(put(new THREE.Mesh(roundedBox(0.090, 0.062, 0.110, 0.020, 2), bodyM), 0.012, -0.306, 0))
    for (const k of [-1, 0, 1]) {
      const sp = k * 0.30
      foreS.add(aim(put(new THREE.Mesh(taperedCapsule(0.017, 0.021, 0.028, 2, 8), bodyM),
        0.026 + Math.abs(k) * 0.004, -0.352, k * 0.031), 0.30, -0.94, sp * 0.34))
      foreS.add(aim(put(new THREE.Mesh(roundedCone(0.009, 0.002, 0.022, 0.002, 6, 1), clawM),
        0.042, -0.396, k * 0.036), 0.34, -0.92, sp * 0.36))
      // knuckle fur: on a white hand the knuckles are invisible without it
      foreS.add(lock(bodyM, 0.022, 0.014, 0.040, -0.322, k * 0.033, 0.42, -0.30, sp * 0.5, 0))
    }
    // the opposed carpal digit — the front dewclaw. It is the thumb, and it is
    // what makes the hand legible as a dog's while still gripping.
    foreS.add(aim(put(new THREE.Mesh(taperedCapsule(0.015, 0.017, 0.020, 2, 8), bodyM),
      -0.006, -0.318, -0.052 * side), -0.52, -0.78, -0.35 * side))
    foreS.add(aim(put(new THREE.Mesh(roundedCone(0.008, 0.002, 0.018, 0.002, 6, 1), clawM),
      -0.026, -0.348, -0.066 * side), -0.55, -0.76, -0.35 * side))
    foreS.add(put(new THREE.Mesh(roundedBox(0.014, 0.056, 0.082, 0.006, 1), padM), 0.056, -0.316, 0))

    // right forearm carries the (hidden) energy blade for slashes/super
    if (side === -1) {
      const blade = new THREE.Group()
      blade.name = 'energyBlade'
      blade.userData.noMerge = true
      const bladeM = M.emissive(P.BLADE, 2.4, 'neon-panel', { transparent: true, opacity: 0.82, depthWrite: false })
      const coreM = M.emissive(P.BLADE_CORE, 3.0, 'neon-panel', { transparent: true, opacity: 0.92, depthWrite: false })
      // These three are the only meshes on the model that escape the per-bone
      // merge (the group is toggled at runtime), so they ask for `unique`
      // geometry — Fighter.dispose() frees a mesh's geometry unless it is
      // tagged shared, and the render layer's cache does not carry that tag.
      const prof = (s) => loft([
        { at: [0.02, -0.02, 0], shape: rr(0.100 * s, 0.020 * s, 0.008 * s) },
        { at: [0.02, -0.12, 0], shape: rr(0.130 * s, 0.028 * s, 0.010 * s) },
        { at: [0.02, -0.60, 0], shape: rr(0.118 * s, 0.022 * s, 0.009 * s) },
        { at: [0.02, -0.78, 0], shape: rr(0.090 * s, 0.016 * s, 0.007 * s) },
        { at: [0.02, -0.95, 0], shape: rr(0.016 * s, 0.006 * s, 0.002 * s) },
      ], { subdivide: 2, unique: true, ...UPZ })
      blade.add(new THREE.Mesh(prof(1), bladeM))
      blade.add(put(new THREE.Mesh(prof(0.6), coreM), 0.004, 0, 0))
      // the emergence flare — a cone of light where the blade leaves the fur,
      // so it never looks like a sword clipping through an arm
      blade.add(put(new THREE.Mesh(roundedCone(0.030, 0.098, 0.100, 0.008, 12, 1, { unique: true }), bladeM), 0.02, -0.06, 0))
      blade.rotation.x = 0.105
      blade.visible = false
      fore.add(blade)
      fore.userData.blade = blade
      fore.userData.bladeMats = [bladeM, coreM]
    }
  }

  // --- head ------------------------------------------------------------------
  // A wedge, not two spheres: a filleted box cranium with flat cheek planes and
  // a slightly rounded crown, a 27-degree stop, and a blunt muzzle that tapers
  // to 0.79 and never to a point. On an all-white head the nose and the eyes
  // are the ONLY high-contrast events, so both are built as real geometry.
  const head = pivot(torso, 0.05, 0.5, 0)
  bones.head = head
  const headS = statics(head); containers.push(headS)
  headS.rotation.z = 0.035          // +2 degrees nose-up: vigilant, not submissive

  // CRANIUM — one unbroken loft along the median polyline of §3.1: backskull
  // +6.8 deg (level), frontal ramp -35.6 deg, and a hard lateral pinch through
  // the orbital region. That pinch is the whole trick: it drops the skull from
  // 0.215 m wide at the zygomatic to 0.086 m at the nasal root, which is what
  // LEAVES ROOM FOR THE EYES. The previous build filled that volume with a
  // rounded box and an "infraorbital mass" that between them buried the entire
  // eye assembly 0.032 m inside the cheek — a face with no findable eyes.
  headS.add(new THREE.Mesh(loft([
    wedge(-0.135, 0.190, 0.140, -0.020, 0.042),
    wedge(-0.100, 0.212, 0.188, -0.032, 0.046),
    wedge(-0.045, 0.215, 0.200, -0.036, 0.046),
    wedge(0.000, 0.206, 0.188, -0.036, 0.044),
    wedge(0.038, 0.178, 0.166, -0.026, 0.040),
    wedge(0.068, 0.126, 0.144, -0.006, 0.032),
    wedge(0.092, 0.086, 0.120, 0.014, 0.024),
    wedge(0.112, 0.072, 0.100, 0.032, 0.020),
  ], { subdivide: 1, ...UPX }), headM))
  // JAW + CHEEK — the lower half of the head, topping out at Hd y +0.070, i.e.
  // 0.020 m BELOW the eye centre line, so it can never eat the eye. Flat lateral
  // planes (both breed standards say so explicitly) with the chin receding
  // 0.070 m behind the nose.
  headS.add(new THREE.Mesh(loft([
    wedge(-0.078, 0.206, 0.066, -0.070, 0.038),
    wedge(-0.010, 0.215, 0.070, -0.085, 0.040),
    wedge(0.055, 0.198, 0.070, -0.083, 0.036),
    wedge(0.120, 0.168, 0.062, -0.080, 0.032),
    wedge(0.185, 0.146, 0.050, -0.074, 0.028),
    wedge(0.248, 0.126, 0.030, -0.064, 0.024),
  ], { subdivide: 1, ...UPX }), headM))
  // MUZZLE — the four readable planes (bridge, two sides, underside). The top
  // is STRAIGHT at -8.7 deg and meets the frontal ramp at a 27 deg break: that
  // break is the stop, and in profile at 128 px it is the one clear step that
  // says "dog head" instead of "loaf". Taper 0.118/0.150 = 0.79 — a collie
  // below 0.70, a boxer above 0.90.
  headS.add(new THREE.Mesh(loft([
    // the rear section is only 0.120 m wide on purpose: it has to sleeve into
    // the cranium without reaching z +-0.0705, where the eyes are
    wedge(0.100, 0.120, 0.098, -0.068, 0.028),
    wedge(0.118, 0.142, 0.076, -0.072, 0.026),
    wedge(0.135, 0.150, 0.0605, -0.0745, 0.026),
    wedge(0.180, 0.142, 0.0565, -0.0720, 0.024),
    wedge(0.225, 0.134, 0.0505, -0.0675, 0.023),
    wedge(0.270, 0.126, 0.0435, -0.0620, 0.022),
    wedge(0.298, 0.118, 0.0405, -0.0560, 0.022),
  ], { subdivide: 1, ...UPX }), faceM))
  // crown coat: the top 21 % of the head's height is HAIR, not skull — that is
  // what lets a small skull sit inside a big cloud
  headS.add(put(new THREE.Mesh(superellipsoid(0.130, 0.076, 0.112, 3.2, 2.8, 14), maneM), -0.040, 0.204, 0))
  headS.add(put(new THREE.Mesh(superellipsoid(0.086, 0.100, 0.116, 3, 2.8, 14), maneM), -0.118, 0.112, 0))
  // Crown lock breakers, in the COOL tip colour: this is the highest point on
  // the model, it is the edge that sits against the sky in every single frame,
  // and it is the one place a cool albedo buys hue separation for free.
  for (let i = 0; i < 4; i++) {   // crown lock breakers: the crown outline is irregular
    const a = -0.6 + 1.8 * (i / 3)
    headS.add(lock(skyM, 0.042 + 0.020 * (i % 3) / 2, 0.024,
      -0.030 - Math.cos(a) * 0.104, 0.244, Math.sin(a) * 0.078,
      -Math.cos(a) * 0.78, 0.60, Math.sin(a) * 0.55, i * 1.4))
  }
  // cheek / jaw ruff: 0.055 m of coat at the ear line takes the 0.215 m skull
  // out to the 0.325 m head width the 1 : 1.85 ratio depends on
  for (const side of [1, -1]) {
    // 0.055 m of coat at the ear line takes the 0.215 m skull out to 0.324 m.
    // It is centred WELL BACK (Hd x -0.032) so its forward edge dies at x +0.056
    // and never reaches the eye at x +0.089.
    headS.add(put(new THREE.Mesh(superellipsoid(0.088, 0.098, 0.052, 2.8, 2.6, 16), maneM), -0.032, 0.050, 0.110 * side))
    // SUPRAORBITAL RIDGE — front face at Hd x +0.109, standing 0.012 m proud of
    // the corneal apex, top edge running back and UP. Two separate ridges with a
    // 0.060 m strip of forehead between them: a dog, not an ape.
    headS.add(put(new THREE.Mesh(roundedBox(0.100, 0.030, 0.068, 0.011, 2), headM),
      0.066, 0.132, 0.064 * side, 0, 0, -0.38))
    // the permitted tonal aid: a soft COAT_SHADE wedge on the ridge, -8 deg
    headS.add(put(new THREE.Mesh(superellipsoid(0.030, 0.006, 0.032, 3.2, 3, 12), shadeM),
      0.076, 0.150, 0.062 * side, 0, 0, -0.30))
    // INFRAORBITAL / cheek pad — front face 0.008 m proud of the apex, sitting
    // BELOW the eye. Together with the ridge above it this is what casts the
    // shadow that makes an eye read on a white head.
    headS.add(put(new THREE.Mesh(superellipsoid(0.034, 0.030, 0.036, 2.6, 2.6, 14), headM),
      0.070, 0.040, 0.068 * side))
    // zygomatic arch: a 0.009 m proud ridge, one of only four things describing
    // the head's volume under raking light
    headS.add(new THREE.Mesh(splineTube([
      [0.070, 0.062, 0.1150 * side], [0.010, 0.074, 0.1165 * side], [-0.055, 0.090, 0.1145 * side],
    ], 0.0075, 10, null, { radialSeg: 6, roundStart: true, roundEnd: true }), headM))
    // the fur seam line from the outer eye corner to the ear base — a real,
    // nameable, breed-specific feature that almost nobody models
    headS.add(new THREE.Mesh(splineTube([
      [0.082, 0.078, 0.086 * side], [0.030, 0.084, 0.112 * side],
      [-0.008, 0.090, 0.130 * side], [-0.040, 0.094, 0.140 * side],
    ], 0.0034, 10, null, { radialSeg: 5, roundStart: true, roundEnd: true }), headM))
  }
  // THE UNDER-JAW SHADOW LINE, MODELLED. On a white animal this line is doing
  // the job an albedo change does on every other fighter, and a screen-space AO
  // pass that may be switched off at `low` cannot be trusted with it. So it is
  // COAT_DEEP geometry standing 0.026 m below the jaw: a hard dark horizontal
  // under the chin, from every azimuth, under any arena light.
  headS.add(put(new THREE.Mesh(superellipsoid(0.100, 0.020, 0.070, 3.2, 2.8, 14), underM), 0.052, -0.090, 0))
  // the median furrow: 0.010 m wide, 0.004 m deep, P1 -> P3. It is what makes
  // the frontal read as bone rather than as a lid.
  headS.add(new THREE.Mesh(splineTube([
    [-0.100, 0.186, 0], [-0.045, 0.194, 0], [0.020, 0.172, 0], [0.078, 0.130, 0],
  ], 0.0055, 12, null, { radialSeg: 5, roundStart: true, roundEnd: true }), shadeM))

  // nose: 0.005 m^2 of black doing an outsized amount of work. The front plane
  // is tilted back 22 degrees so it faces down-forward and goes near-black
  // under an overhead key while the top cap catches sky — a 10 : 1 range
  // inside one 0.08 m object.
  // It is a DOME, not a recessed plate: the muzzle loft stops at Hd x +0.298 and
  // the leather stands 0.024 m proud of it, so from any azimuth the nose is a
  // rounded black mass catching one broad soft highlight across the top plane.
  // A flat rectangle sunk into a pale box reads as a mail slot.
  headS.add(new THREE.Mesh(loft([
    { at: [0, -0.034, 0], shape: rr(0.048, 0.022, 0.010, 0.286) },
    { at: [0, -0.014, 0], shape: rr(0.072, 0.036, 0.014, 0.296) },
    { at: [0, 0.008, 0], shape: rr(0.082, 0.044, 0.016, 0.301) },
    { at: [0, 0.028, 0], shape: rr(0.074, 0.038, 0.014, 0.300) },
    { at: [0, 0.042, 0], shape: rr(0.048, 0.024, 0.010, 0.293) },
  ], { subdivide: 2, ...UPZ }), noseM))
  // philtrum: splits the upper lip into two lobes that catch the rim separately
  headS.add(new THREE.Mesh(splineTube([
    [0.300, -0.040, 0], [0.302, -0.026, 0], [0.300, -0.014, 0],
  ], 0.0045, 6, null, { radialSeg: 5, roundStart: true, roundEnd: true }), pigM))
  for (const side of [1, -1]) {
    // nostrils: comma slits opening laterally and backward at 35 deg, recessed,
    // with a tiny wet glint inside — worth more than any amount of muzzle detail
    headS.add(put(new THREE.Mesh(lens(0.013, 0.005, 0.006, { seg: 10, faceSeg: 1, rimSeg: 1 }), pupilM),
      0.309, 0.004, 0.024 * side, 0, 0.61 * side, 0.35 * side))
    headS.add(put(new THREE.Mesh(lens(0.0022, 0.0022, 0.0012, { seg: 6, faceSeg: 1, rimSeg: 1 }), glintM),
      0.3145, 0.009, 0.021 * side, 0, 0.61 * side, 0.35 * side))
    // lip seam — the second-longest dark event on the head after the eye rims
    headS.add(new THREE.Mesh(splineTube([
      [0.300, -0.050, 0.006 * side], [0.276, -0.052, 0.030 * side],
      [0.240, -0.050, 0.048 * side], [0.205, -0.044, 0.058 * side],
    ], 0.005, 10, null, { radialSeg: 5, roundStart: true, roundEnd: true }), pigM))
    // Whiskers. The previous pass shipped them as constant-radius tubes with
    // hard square ends, starting ON the fur surface — which is why they read as
    // pen strokes drawn on the lens rather than as hair growing out of a face.
    // Three fixes, all free: they TAPER 2.2 : 1 to a rounded point, they are
    // rooted 0.009 m INSIDE the muzzle with a swelling at the root so what you
    // see at the surface is a modelled follicle bump, and both sides carry the
    // one PIGMENT value. Sub-pixel in gameplay; they exist for the KO close-up.
    const wR = (t) => (t < 0.18 ? 0.0026 - 0.0009 * (t / 0.18) : 0.0017 - 0.0011 * ((t - 0.18) / 0.82))
    for (let i = 0; i < 3; i++) {
      const wy = -0.004 - i * 0.014
      headS.add(new THREE.Mesh(splineTube([
        [0.232, wy - 0.002, 0.049 * side], [0.248, wy + 0.004, 0.070 * side],
        [0.268, wy + 0.009, 0.092 * side], [0.286, wy + 0.011, 0.114 * side],
      ], 0.0024, 6, wR, { radialSeg: 4, roundStart: true, roundEnd: true }), pigM))
    }
  }

  // eyes — full construction: sclera ball, dark aperture almond with a modelled
  // rim, iris, pupil, a corneal cap and one crisp specular dot. The gaze axes
  // are splayed 18 degrees and the lids cover only the TOP 28 %: a steady,
  // fully open, unbothered stare. If the lids droop he becomes a different
  // character entirely.
  for (const side of [1, -1]) {
    const ex = 0.056, ey = 0.090, ez = 0.0625 * side
    const dx = 0.951, dz = 0.309 * side
    const at = (r, ox = 0, oy = 0) => [ex + dx * r - dz * ox, ey + oy, ez + dz * r + dx * ox]
    const eye = (geo, m, r, ox = 0, oy = 0, roll = 0) => {
      const p = at(r, ox, oy)
      const mm = aimZ(new THREE.Mesh(geo, m), dx, 0, dz)
      mm.rotateZ(roll)
      mm.position.set(p[0], p[1], p[2])
      return mm
    }
    // EVERY RADIUS BELOW IS MEASURED FROM THE BALL CENTRE AND EVERY ONE OF THEM
    // IS >= THE BALL RADIUS. The previous build parked the dark aperture at
    // r 0.0330 and the lids at r 0.0300 — i.e. entirely INSIDE a 0.040 m sclera
    // sphere — so the only geometry that ever rendered was the white ball, and
    // the head shipped with two pale nubs where its eyes should be.
    headS.add(put(new THREE.Mesh(ball(0.040, 13), scleraM), ex, ey, ez))
    // the dark aperture: a PIGMENT almond standing 0.0035 m proud of the ball.
    // Against COAT this is a 16 : 1 step and the single highest-contrast edge
    // on the entire model.
    // radii, front-most surface in brackets, all measured from the ball centre:
    headS.add(eye(lens(0.034, 0.017, 0.009, { seg: 14, faceSeg: 2, rimSeg: 1, crown: 0.003 }), pigM, 0.0395, 0, 0, 0.122 * side))      // 0.047
    headS.add(eye(lens(0.013, 0.013, 0.004, { seg: 12, faceSeg: 1, rimSeg: 1, crown: 0.002 }), irisM, 0.0470))                          // 0.051
    headS.add(eye(lens(0.0055, 0.0055, 0.003, { seg: 10, faceSeg: 1, rimSeg: 1, crown: 0.001 }), pupilM, 0.0505))                       // 0.053
    // the pale sliver at the lower-outer canthus — a crescent, never a ring
    headS.add(eye(lens(0.009, 0.0045, 0.003, { seg: 8, faceSeg: 1, rimSeg: 1 }), scleraM, 0.0455, 0.020 * side, -0.010))
    headS.add(eye(lens(0.021, 0.021, 0.010, { seg: 12, faceSeg: 2, rimSeg: 1, crown: 0.005 }), corneaM, 0.0490))                        // 0.059
    // ONE crisp specular dot per eye, upper-nasal quadrant, 0.004 m across, and
    // it is unlit so no arena can take it away
    headS.add(eye(lens(0.0021, 0.0021, 0.0012, { seg: 8, faceSeg: 1, rimSeg: 1 }), glintM, 0.0615, -0.008 * side, 0.009))
    // lid solids, PIGMENT, standing proud of the cornea: these ARE the 0.006 m
    // black rim both breed standards call for, built as geometry, not a texture
    // ring. Upper lid covers the top 24 % — steady and fully open, not sleepy.
    headS.add(eye(lens(0.036, 0.014, 0.012, { seg: 14, faceSeg: 1, rimSeg: 1, crown: 0.006 }), pigM, 0.0500, 0, 0.0230, 0.122 * side))
    headS.add(eye(lens(0.034, 0.010, 0.011, { seg: 14, faceSeg: 1, rimSeg: 1, crown: 0.005 }), pigM, 0.0500, 0, -0.0225, 0.122 * side))
    for (const cn of [1, -1]) {   // the two canthi, closing the rim into a ring
      headS.add(eye(lens(0.008, 0.016, 0.010, { seg: 8, faceSeg: 1, rimSeg: 1, crown: 0.005 }), pigM,
        0.0480, 0.031 * side * cn, 0.003 * cn))
    }
    // the peri-orbital halo of shorter, darker fur — 0.5-0.7 stops under the
    // forehead. Without it the eyes read as two beads glued to a snowball.
    // filletRing lies in the XZ plane with its axis on +Y, so it takes aim(),
    // NOT aimZ(): mis-oriented it stands a 0.061 m disc edge-on across the eye
    // and occludes the entire assembly, which is what the last build shipped.
    headS.add(aim(put(new THREE.Mesh(filletRing(0.048, 0.011, 4, 14), shadeM),
      ex + dx * 0.020, ey, ez + dz * 0.020), dx, 0, dz))
  }

  // --- ears: the anti-collision cue -----------------------------------------
  // Small V-shaped leathers with rounded tips, set at eye level and WELL BACK,
  // carried low, flat and close. They project at most 0.012 m beyond the coat
  // they lie on, so they contribute nothing to the outer silhouette — fill the
  // head black and you should not be able to find them. Erect ear spikes belong
  // to the roster's other dog; two fighters with the same ear is a roster
  // failure. These are also the primary expression organ (see the clips).
  const EAR = [
    [-0.050, 0.004], [-0.032, -0.030], [-0.018, -0.062], [-0.006, -0.092],
    [0.006, -0.114], [0.020, -0.125], [0.034, -0.112], [0.042, -0.086],
    [0.048, -0.052], [0.052, -0.014], [0.048, 0.008], [0.012, 0.016], [-0.026, 0.012],
  ]
  const earOutline = EAR.flat()
  const earPatch = EAR.flatMap(([x, y]) => [x * 0.92 + 0.001, y * 0.92 - 0.004])
  for (const side of [1, -1]) {
    const ear = pivot(head, -0.020, 0.097, 0.096 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    const earS = statics(ear); containers.push(earS)
    earS.rotation.set(0.05 * side, 0.22 * side, 0)
    // The coat surface under the ear base is at z +-0.146 and the head's widest
    // point is +-0.162. The leather's mid-plane therefore sits at +-0.152 with
    // its outer face at +-0.159 — PROUD of the coat, INSIDE the silhouette.
    // The previous build put the mid-plane at +-0.138, i.e. under the fur, and
    // the ear simply did not exist in any frame.
    earS.add(put(new THREE.Mesh(plate(earOutline, 0.014, 0.005, { crown: 0.005, faceSeg: 2, rimSeg: 2, taper: 0.3 }), faceM),
      0, 0, 0.048 * side))
    // THE BADGER PATCH IS WHAT MAKES THE EAR EXIST. 92 % of the outer leather,
    // a 2.9 : 1 value step under COAT — the ear contributes nothing to the black
    // silhouette and everything to the normal render, which is exactly the test
    // in §2.4.8. Strictly symmetric: no individual animal's markings anywhere.
    // The ear's outer face must stay INSIDE the head's widest point (z 0.1625,
    // the cheek ruff just below it) — measured 0.170 on the previous build,
    // which puts an ear tip into the black-fill silhouette and re-creates the
    // erect-ear collision the drop ears exist to avoid. Pulled 0.008 m inboard.
    earS.add(put(new THREE.Mesh(plate(earPatch, 0.008, 0.003, { crown: 0.005, faceSeg: 2, rimSeg: 1 }), badgerM),
      0, 0, 0.0585 * side))
    // the 0.010 m rim step where the leather's rear edge lifts off the skull —
    // a thin cast shadow wedge, and the whole reason the ear looks attached
    // rather than printed on
    earS.add(put(new THREE.Mesh(taperedCapsule(0.0065, 0.0045, 0.088, 3, 8), badgerM),
      -0.046, -0.048, 0.054 * side, 0, 0, 0.30))
    earS.add(put(new THREE.Mesh(superellipsoid(0.022, 0.030, 0.010, 2.4, 2.4, 10), conchaM), 0.004, -0.044, 0.036 * side))
    for (let i = 0; i < 4; i++) {                    // fringe that welds the ear into the ruff
      earS.add(lock(faceM, 0.028 + 0.014 * (i % 3) / 2, 0.016,
        -0.036 + i * 0.026, 0.010, 0.040 * side, -0.30 + i * 0.2, 0.86, 0.24 * side, i * 1.1))
    }
  }

  // --- finish ---------------------------------------------------------------
  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })
  const PROP_MATS = new Set([sashM, goldM, medalM, steelM, steelDarkM, leatherM])
  // Merge by material WITHIN a bone, never across one. A merged buffer that
  // spanned two bones would tear the moment Gore._detach() clones a subtree.
  for (const c of containers) {
    mergeStatic(c, { inPlace: true })
    c.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      if (PROP_MATS.has(o.material)) o.userData.prop = true
    })
  }

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,1.0,0]
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 1.0, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.2, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.1, [0, 0.015, 0], [0, 0.985, 0]), K(2.2, Z, HIP)],
      torso: [K(0, [0, 0, 0.03]), K(1.1, [0.01, -0.015, -0.01]), K(2.2, [0, 0, 0.03])],
      head: [K(0, Z), K(0.7, [0, 0.06, -0.02]), K(1.5, [0, -0.05, 0.02]), K(2.2, Z)],
      earL: [K(0, Z), K(0.7, [0.05, 0.09, 0]), K(1.5, [-0.04, -0.06, 0]), K(2.2, Z)],
      earR: [K(0, Z), K(0.7, [-0.05, -0.09, 0]), K(1.5, [0.04, 0.06, 0]), K(2.2, Z)],
      armL: [K(0, [0, 0, 0.28]), K(1.1, [0.04, 0, 0.34]), K(2.2, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(1.1, [-0.04, 0, 0.48]), K(2.2, [0, 0, 0.42])],
      forearmL: [K(0, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.75]), K(1.1, [0, 0, 0.8]), K(2.2, [0, 0, 0.75])],
      tail: [K(0, Z), K(1.1, [0.22, 0, 0]), K(2.2, Z)],
      sash: [K(0, Z), K(1.1, [0.12, 0, 0.05]), K(2.2, Z)],
      legL: [K(0, [0, 0, 0.06])], legR: [K(0, [0, 0, -0.05])],
    },
  },

  walk: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0.04, -0.02], [0, 0.99, 0]), K(0.15, [0, 0, -0.02], [0, 0.955, 0]), K(0.3, [0, -0.04, -0.02], [0, 0.995, 0]), K(0.45, [0, 0, -0.02], [0, 0.955, 0]), K(0.6, [0, 0.04, -0.02], [0, 0.99, 0])],
      legL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, -0.5]), K(0.6, [0, 0, 0.5])],
      legR: [K(0, [0, 0, -0.5]), K(0.3, [0, 0, 0.5]), K(0.6, [0, 0, -0.5])],
      shinL: [K(0, [0, 0, -0.2]), K(0.15, [0, 0, -0.55]), K(0.3, [0, 0, -0.1]), K(0.6, [0, 0, -0.2])],
      shinR: [K(0, [0, 0, -0.1]), K(0.45, [0, 0, -0.55]), K(0.6, [0, 0, -0.1])],
      torso: [K(0, [0, -0.05, -0.04]), K(0.3, [0, 0.05, -0.04]), K(0.6, [0, -0.05, -0.04])],
      head: [K(0, [0, 0.05, 0.02]), K(0.3, [0, -0.05, 0.02]), K(0.6, [0, 0.05, 0.02])],
      armL: [K(0, [0, 0, -0.3]), K(0.3, [0, 0, 0.55]), K(0.6, [0, 0, -0.3])],
      armR: [K(0, [0, 0, 0.55]), K(0.3, [0, 0, -0.3]), K(0.6, [0, 0, 0.55])],
      forearmL: [K(0, [0, 0, 0.4])], forearmR: [K(0, [0, 0, 0.5])],
      earL: [K(0, Z), K(0.15, [0.12, 0.08, 0]), K(0.3, Z), K(0.45, [0.12, 0.08, 0]), K(0.6, Z)],
      earR: [K(0, Z), K(0.15, [-0.12, -0.08, 0]), K(0.3, Z), K(0.45, [-0.12, -0.08, 0]), K(0.6, Z)],
      tail: [K(0, [0.3, 0, 0]), K(0.3, [-0.3, 0, 0]), K(0.6, [0.3, 0, 0])],
      sash: [K(0, [0.2, 0, 0]), K(0.3, [-0.2, 0, 0]), K(0.6, [0.2, 0, 0])],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, 0.05], [0, 1.03, 0]), K(0.5, [0, 0, 0.05], [0, 1.03, 0])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.8]), K(0.5, [0, 0, 0.7])],
      legR: [K(0, Z), K(0.12, [0, 0, 0.5]), K(0.5, [0, 0, 0.4])],
      shinL: [K(0, Z), K(0.12, [0, 0, -0.9]), K(0.5, [0, 0, -0.8])],
      shinR: [K(0, Z), K(0.12, [0, 0, -0.6]), K(0.5, [0, 0, -0.5])],
      armL: [K(0, Z), K(0.12, [-0.4, 0, 1.1]), K(0.5, [-0.4, 0, 1.0])],
      armR: [K(0, Z), K(0.12, [0.4, 0, 1.1]), K(0.5, [0.4, 0, 1.0])],
      torso: [K(0, Z), K(0.12, [0, 0, 0.1])],
      head: [K(0, Z), K(0.12, [0, 0, -0.08])],
      earL: [K(0, Z), K(0.12, [-0.25, 0.08, 0])],
      earR: [K(0, Z), K(0.12, [0.25, -0.08, 0])],
      tail: [K(0, Z), K(0.12, [-0.4, 0, 0])],
      sash: [K(0, Z), K(0.12, [-0.5, 0, 0])],
    },
  },

  fall: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.07], HIP)],
      torso: [K(0, [0, 0, 0.12])],
      head: [K(0, [0, 0, -0.05])],
      armL: [K(0, [-0.3, 0, 2.0]), K(0.25, [-0.5, 0, 2.4]), K(0.5, [-0.3, 0, 2.0])],
      armR: [K(0, [0.5, 0, 2.4]), K(0.25, [0.3, 0, 2.0]), K(0.5, [0.5, 0, 2.4])],
      legL: [K(0, [-0.25, 0, 0.35]), K(0.25, [-0.25, 0, 0.1]), K(0.5, [-0.25, 0, 0.35])],
      legR: [K(0, [0.25, 0, 0.1]), K(0.25, [0.25, 0, 0.35]), K(0.5, [0.25, 0, 0.1])],
      shinL: [K(0, [0, 0, -0.4])], shinR: [K(0, [0, 0, -0.3])],
      earL: [K(0, [-0.35, 0.1, 0])], earR: [K(0, [0.35, -0.1, 0])],
      tail: [K(0, [-0.5, 0, 0])],
      sash: [K(0, [-0.7, 0, 0])],
    },
  },

  crouch: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.66, 0]), K(0.3, [0, 0, -0.08], [0, 0.645, 0]), K(0.6, [0, 0, -0.08], [0, 0.66, 0])],
      legL: [K(0, [-0.45, 0, 0.85])], legR: [K(0, [0.45, 0, 0.85])],
      shinL: [K(0, [0, 0, -1.1])], shinR: [K(0, [0, 0, -1.1])],
      torso: [K(0, [0, 0, -0.2])],
      head: [K(0, [0, 0, 0.15])],
      armL: [K(0, [0.25, 0, 0.5])], armR: [K(0, [-0.25, 0, 0.55])],
      forearmL: [K(0, [0, 0, 0.95])], forearmR: [K(0, [0, 0, 1.0])],
      earL: [K(0, [0, 0.15, 0])], earR: [K(0, [0, -0.15, 0])],
      tail: [K(0, [0.3, 0, 0])],
      sash: [K(0, [0.4, 0, 0])],
    },
  },

  block: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.03, 0.97, 0])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0.02, 0, 0.12]), K(0.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.16])],
      armL: [K(0, [0.3, 0, 0.85])], armR: [K(0, [-0.3, 0, 0.95])],
      forearmL: [K(0, [0, 0, 1.6])], forearmR: [K(0, [0, 0, 1.75])],
      earL: [K(0, [0, -0.35, 0])], earR: [K(0, [0, 0.35, 0])],
      legL: [K(0, [-0.12, 0, 0.12])], legR: [K(0, [0.12, 0, 0.12])],
      shinL: [K(0, [0, 0, -0.15])], shinR: [K(0, [0, 0, -0.15])],
      tail: [K(0, [0.2, 0, 0])],
      sash: [K(0, [0.1, 0, 0])],
    },
  },

  hitLight: {
    duration: 0.28, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.09], [-0.06, 0.98, 0]), K(0.28, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.08, 0.3]), K(0.28, Z)],
      head: [K(0, Z), K(0.05, [0, 0.1, 0.45]), K(0.28, Z)],
      armL: [K(0, Z), K(0.05, [0.3, 0, -0.5]), K(0.28, Z)],
      armR: [K(0, Z), K(0.05, [-0.3, 0, -0.4]), K(0.28, Z)],
      earL: [K(0, Z), K(0.06, [0.3, 0.35, 0]), K(0.28, Z)],
      earR: [K(0, Z), K(0.06, [-0.3, -0.35, 0]), K(0.28, Z)],
      tail: [K(0, Z), K(0.06, [0.4, 0, 0]), K(0.28, Z)],
      sash: [K(0, Z), K(0.06, [0.5, 0, 0]), K(0.28, Z)],
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.2], [-0.18, 0.94, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.12, 0.5]), K(0.42, Z)],
      head: [K(0, Z), K(0.06, [0, 0.12, 0.65]), K(0.42, Z)],
      armL: [K(0, Z), K(0.06, [0.5, 0, -1.1]), K(0.42, Z)],
      armR: [K(0, Z), K(0.06, [-0.5, 0, -1.0]), K(0.42, Z)],
      legL: [K(0, Z), K(0.07, [0, 0, 0.45]), K(0.42, Z)],
      earL: [K(0, Z), K(0.07, [0.5, 0.5, 0]), K(0.42, Z)],
      earR: [K(0, Z), K(0.07, [-0.5, -0.5, 0]), K(0.42, Z)],
      tail: [K(0, Z), K(0.07, [0.6, 0, 0]), K(0.42, Z)],
      sash: [K(0, Z), K(0.07, [0.7, 0, 0]), K(0.42, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.28], HIP)],
      torso: [K(0, [0, 0, 0.6]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, 0.6])],
      head: [K(0, [0, 0, 0.45])],
      armL: [K(0, [-0.4, 0, 2.2]), K(0.25, [-0.2, 0, 2.4]), K(0.5, [-0.4, 0, 2.2])],
      armR: [K(0, [0.2, 0, 2.4]), K(0.25, [0.4, 0, 2.2]), K(0.5, [0.2, 0, 2.4])],
      legL: [K(0, [0, 0, 0.85]), K(0.25, [0, 0, 0.65]), K(0.5, [0, 0, 0.85])],
      legR: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.75]), K(0.5, [0, 0, 0.55])],
      shinL: [K(0, [0, 0, -0.7])], shinR: [K(0, [0, 0, -0.5])],
      earL: [K(0, [-0.5, 0.25, 0])], earR: [K(0, [0.5, -0.25, 0])],
      tail: [K(0, [-0.8, 0, 0])],
      sash: [K(0, [-1.0, 0, 0])],
    },
  },

  knockdown: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.45, [0, 0, 1.35], [0, 0.335, 0]), K(0.9, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])], legR: [K(0, [0, 0, 0.5])],
      shinL: [K(0, [0, 0, -0.3])], shinR: [K(0, [0, 0, -0.4])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.2])],
      armL: [K(0, [1.0, 0, 0.3])], armR: [K(0, [-1.0, 0, 0.3])],
      earL: [K(0, [0.5, 0, 0])], earR: [K(0, [-0.5, 0, 0])],
      tail: [K(0, [0.4, 0, 0])],
      sash: [K(0, [0.6, 0, 0])],
    },
  },

  getup: {
    duration: 0.7, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.25, [0, 0, 0.5], [0, 0.55, 0]), K(0.5, [0, 0, 0.05], [0, 0.8, 0]), K(0.7, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.35, [0, 0, 0.6]), K(0.7, Z)],
      legR: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, 0.25]), K(0.7, Z)],
      shinL: [K(0, [0, 0, -0.3]), K(0.35, [0, 0, -0.8]), K(0.7, Z)],
      shinR: [K(0, [0, 0, -0.4]), K(0.35, [0, 0, -0.5]), K(0.7, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, -0.3]), K(0.7, Z)],
      head: [K(0, [0, 0, -0.2]), K(0.5, [0, 0, 0.1]), K(0.7, Z)],
      armL: [K(0, [1.0, 0, 0.3]), K(0.35, [0.3, 0, -0.4]), K(0.7, [0, 0, 0.28])],
      armR: [K(0, [-1.0, 0, 0.3]), K(0.35, [-0.3, 0, -0.4]), K(0.7, [0, 0, 0.42])],
      earL: [K(0, [0.5, 0, 0]), K(0.5, [0.15, 0.2, 0]), K(0.6, [-0.1, -0.15, 0]), K(0.7, Z)],
      earR: [K(0, [-0.5, 0, 0]), K(0.5, [-0.15, -0.2, 0]), K(0.6, [0.1, 0.15, 0]), K(0.7, Z)],
      tail: [K(0, [0.4, 0, 0]), K(0.6, [-0.2, 0, 0]), K(0.7, Z)],
      sash: [K(0, [0.6, 0, 0]), K(0.7, Z)],
    },
  },

  // steps forward, bows once with a paw over the medallion, ears snap up
  entrance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.5, Z, [0, 0.97, 0]), K(0.7, Z, HIP), K(1.0, Z, HIP), K(1.3, [0, 0, -0.06], [0, 0.96, 0]), K(1.8, [0, 0, -0.06], [0, 0.96, 0]), K(2.1, Z, HIP), K(2.4, Z, HIP)],
      legL: [K(0, Z), K(0.5, [0, 0, 0.8]), K(0.7, Z), K(2.4, [0, 0, 0.06])],
      legR: [K(0, Z), K(0.7, [0, 0, 0.8]), K(0.9, Z), K(2.4, [0, 0, -0.05])],
      torso: [K(0, Z), K(1.0, Z), K(1.3, [0, 0, -0.55]), K(1.8, [0, 0, -0.55]), K(2.1, [0, 0, 0.08]), K(2.4, [0, 0, 0.03])],
      head: [K(0, Z), K(1.3, [0, 0, -0.35]), K(1.8, [0, 0, -0.35]), K(2.05, [0, 0, 0.2]), K(2.4, Z)],
      armR: [K(0, Z), K(1.2, [0, 0, 0.4]), K(1.35, [0.55, 0, 1.15]), K(1.8, [0.55, 0, 1.15]), K(2.1, [0, 0, 0.42]), K(2.4, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.5]), K(1.35, [0, 0, 1.9]), K(1.8, [0, 0, 1.9]), K(2.1, [0, 0, 0.75]), K(2.4, [0, 0, 0.75])],
      armL: [K(0, Z), K(1.3, [0, 0, -0.35]), K(1.8, [0, 0, -0.35]), K(2.1, [0, 0, 0.28]), K(2.4, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5])],
      earL: [K(0, [0.4, 0, 0]), K(1.3, [0.4, 0, 0]), K(1.9, [0.4, 0, 0]), K(2.05, [-0.12, -0.1, 0]), K(2.15, Z), K(2.4, Z)],
      earR: [K(0, [-0.4, 0, 0]), K(1.3, [-0.4, 0, 0]), K(1.9, [-0.4, 0, 0]), K(2.05, [0.12, 0.1, 0]), K(2.15, Z), K(2.4, Z)],
      tail: [K(0, Z), K(1.3, [0.2, 0, 0]), K(2.1, Z), K(2.4, Z)],
      sash: [K(0, Z), K(1.3, [-0.3, 0, 0]), K(2.1, Z), K(2.4, Z)],
    },
  },

  // sits tall, one paw raised in blessing, slow proud tail wag — no gloating
  win: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.74, 0]), K(1.2, Z, [0, 0.755, 0]), K(2.4, Z, [0, 0.74, 0])],
      legL: [K(0, [-0.6, 0, 0.9])], legR: [K(0, [0.6, 0, 0.9])],
      shinL: [K(0, [0, 0, -1.2])], shinR: [K(0, [0, 0, -1.2])],
      torso: [K(0, [0, 0, 0.12]), K(1.2, [0, 0, 0.16]), K(2.4, [0, 0, 0.12])],
      head: [K(0, [0, 0, 0.1]), K(0.8, [0, 0.15, 0.12]), K(1.6, [0, -0.15, 0.12]), K(2.4, [0, 0, 0.1])],
      armR: [K(0, [0, 0, 0.4]), K(0.4, [0.3, 0, 2.2]), K(2.0, [0.3, 0, 2.25]), K(2.4, [0, 0, 0.4])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.4, [0, 0, -0.3]), K(2.0, [0, 0, -0.3]), K(2.4, [0, 0, 0.5])],
      armL: [K(0, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.4])],
      earL: [K(0, Z), K(0.6, [0.08, 0.1, 0]), K(1.2, Z), K(1.8, [-0.06, -0.08, 0]), K(2.4, Z)],
      earR: [K(0, Z), K(0.6, [-0.08, -0.1, 0]), K(1.2, Z), K(1.8, [0.06, 0.08, 0]), K(2.4, Z)],
      tail: [K(0, [0.5, 0, 0]), K(0.6, [-0.5, 0, 0]), K(1.2, [0.5, 0, 0]), K(1.8, [-0.5, 0, 0]), K(2.4, [0.5, 0, 0])],
      sash: [K(0, [0.3, 0, 0]), K(1.2, [-0.2, 0, 0]), K(2.4, [0.3, 0, 0])],
    },
  },

  lose: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.86, 0]), K(1.0, Z, [0, 0.845, 0]), K(2.0, Z, [0, 0.86, 0])],
      torso: [K(0, [0, 0, -0.45]), K(1.0, [0, 0, -0.5]), K(2.0, [0, 0, -0.45])],
      head: [K(0, [0, 0, -0.5]), K(1.0, [0, 0.08, -0.54]), K(2.0, [0, 0, -0.5])],
      armL: [K(0, [0, 0, 0.25])], armR: [K(0, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.15])], forearmR: [K(0, [0, 0, 0.15])],
      earL: [K(0, [0.65, 0, 0])], earR: [K(0, [-0.65, 0, 0])],
      legL: [K(0, [-0.1, 0, 0.2])], legR: [K(0, [0.1, 0, 0.2])],
      shinL: [K(0, [0, 0, -0.3])], shinR: [K(0, [0, 0, -0.3])],
      tail: [K(0, [0.8, 0, 0])],
      sash: [K(0, [0.3, 0, 0])],
    },
  },

  // beckons once with a paw, then a single slow judging head-shake
  taunt: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.42]), K(0.2, [0, 0, 1.3]), K(0.85, [0, 0, 1.3]), K(1.3, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.25, [0, 0, 0.4]), K(0.4, [0, 0, 1.1]), K(0.55, [0, 0, 0.4]), K(0.7, [0, 0, 1.1]), K(1.3, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28])],
      head: [K(0, Z), K(0.85, [0, 0.22, 0]), K(1.0, [0, -0.22, 0]), K(1.15, [0, 0.12, 0]), K(1.3, Z)],
      torso: [K(0, Z), K(0.2, [0, 0.12, 0.05]), K(0.85, [0, 0.12, 0.05]), K(1.3, Z)],
      earL: [K(0, Z), K(0.3, [0.1, 0.14, 0]), K(0.6, Z), K(1.3, Z)],
      earR: [K(0, Z), K(0.3, [-0.1, -0.14, 0]), K(0.6, Z), K(1.3, Z)],
      tail: [K(0, Z), K(0.4, [0.4, 0, 0]), K(0.8, [-0.4, 0, 0]), K(1.3, Z)],
      hips: [K(0, Z, HIP)],
    },
  },

  // ----------------------------------------------------------- move clips --
  pawStrike: {
    duration: 0.27, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.28]), K(0.05, [0, 0, -0.5]), K(0.09, [0, 0, 1.5]), K(0.18, [0, 0, 1.3]), K(0.27, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.05, [0, 0, 0.9]), K(0.09, [0, 0, 0.1]), K(0.27, [0, 0, 0.5])],
      torso: [K(0, Z), K(0.05, [0, -0.2, 0]), K(0.09, [0, 0.3, -0.08]), K(0.27, Z)],
      hips: [K(0, Z, HIP), K(0.09, [0, 0.18, 0], [0.04, 0.99, 0]), K(0.27, Z, HIP)],
      head: [K(0, Z), K(0.09, [0, -0.1, -0.05]), K(0.27, Z)],
      earL: [K(0, Z), K(0.09, [0.12, 0.15, 0]), K(0.27, Z)],
      earR: [K(0, Z), K(0.09, [-0.12, -0.15, 0]), K(0.27, Z)],
      armR: [K(0, [0, 0, 0.42])],
    },
  },

  lowSweep: {
    duration: 0.43, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.1], [0, 0.62, 0]), K(0.16, [0, -0.7, -0.1], [0.06, 0.6, 0]), K(0.3, [0, -0.2, -0.05], [0, 0.72, 0]), K(0.43, Z, HIP)],
      legR: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.16, [0, 0, 1.3]), K(0.26, [0, 0, 1.1]), K(0.43, Z)],
      shinR: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.16, [0, 0, -0.05]), K(0.43, Z)],
      legL: [K(0, Z), K(0.1, [-0.5, 0, 0.9]), K(0.3, [-0.3, 0, 0.5]), K(0.43, Z)],
      shinL: [K(0, Z), K(0.1, [0, 0, -1.2]), K(0.3, [0, 0, -0.6]), K(0.43, Z)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.35]), K(0.16, [0, -0.4, -0.25]), K(0.43, Z)],
      head: [K(0, Z), K(0.16, [0, 0.2, 0.1]), K(0.43, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0.4, 0, 0.7]), K(0.43, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(0.16, [-0.4, 0, 1.0]), K(0.43, [0, 0, 0.42])],
      earL: [K(0, Z), K(0.16, [0.2, 0.25, 0]), K(0.43, Z)],
      earR: [K(0, Z), K(0.16, [-0.2, -0.25, 0]), K(0.43, Z)],
      tail: [K(0, Z), K(0.16, [0.5, 0, 0]), K(0.43, Z)],
    },
  },

  shoulderCheck: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0.3, 0], [-0.08, 0.96, 0]), K(0.19, [0, -0.35, 0], [0.16, 0.97, 0]), K(0.35, [0, -0.2, 0], [0.06, 0.99, 0]), K(0.5, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0.45, 0.1]), K(0.19, [0, -0.6, -0.3]), K(0.35, [0, -0.35, -0.2]), K(0.5, Z)],
      head: [K(0, Z), K(0.12, [0, 0.3, 0]), K(0.19, [0, -0.25, -0.15]), K(0.5, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.12, [0, 0, -0.8]), K(0.19, [0, 0, 0.5]), K(0.5, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.12, [0, 0, 1.3]), K(0.19, [0, 0, 0.9]), K(0.5, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.19, [0.3, 0, -0.9]), K(0.5, [0, 0, 0.28])],
      legL: [K(0, Z), K(0.19, [0, 0, 0.5]), K(0.5, Z)],
      legR: [K(0, Z), K(0.19, [0, 0, -0.3]), K(0.5, Z)],
      earL: [K(0, Z), K(0.19, [0, -0.35, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.19, [0, 0.35, 0]), K(0.5, Z)],
      sash: [K(0, Z), K(0.19, [-0.5, 0, 0]), K(0.5, Z)],
    },
  },

  bladeSlash: {
    duration: 0.4, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.42]), K(0.07, [0.5, 0, 2.4]), K(0.12, [-0.2, 0, 0.6]), K(0.2, [-0.1, 0, 0.4]), K(0.4, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.07, [0, 0, 0.3]), K(0.12, [0, 0, 0.05]), K(0.4, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.12, [0.3, 0, -0.7]), K(0.4, [0, 0, 0.28])],
      torso: [K(0, Z), K(0.07, [0, 0.4, 0.1]), K(0.12, [0, -0.45, -0.15]), K(0.4, Z)],
      hips: [K(0, Z, HIP), K(0.12, [0, -0.3, 0], [0.06, 0.98, 0]), K(0.4, Z, HIP)],
      head: [K(0, Z), K(0.12, [0, -0.2, -0.05]), K(0.4, Z)],
      earL: [K(0, Z), K(0.12, [0.15, 0.2, 0]), K(0.4, Z)],
      earR: [K(0, Z), K(0.12, [-0.15, -0.2, 0]), K(0.4, Z)],
      sash: [K(0, Z), K(0.12, [-0.4, 0, 0]), K(0.4, Z)],
    },
  },

  counterStance: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.07, [0, 0.25, -0.04], [-0.05, 0.95, 0]), K(0.34, [0, 0.25, -0.04], [-0.05, 0.95, 0]), K(0.5, Z, HIP)],
      torso: [K(0, Z), K(0.07, [0, 0.3, 0.1]), K(0.34, [0, 0.3, 0.12]), K(0.5, Z)],
      head: [K(0, Z), K(0.07, [0, -0.25, -0.1]), K(0.34, [0, -0.25, -0.1]), K(0.5, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.07, [-0.3, 0, 1.2]), K(0.34, [-0.3, 0, 1.25]), K(0.5, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.07, [0, 0, 1.7]), K(0.34, [0, 0, 1.7]), K(0.5, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.07, [0.35, 0, 0.5]), K(0.34, [0.35, 0, 0.5]), K(0.5, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.07, [0, 0, 1.1]), K(0.34, [0, 0, 1.1]), K(0.5, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.07, [-0.15, 0, 0.2]), K(0.34, [-0.15, 0, 0.2]), K(0.5, Z)],
      legR: [K(0, Z), K(0.07, [0.15, 0, 0.1]), K(0.34, [0.15, 0, 0.1]), K(0.5, Z)],
      earL: [K(0, Z), K(0.07, [-0.15, 0.1, 0]), K(0.34, [-0.15, 0.1, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.07, [0.15, -0.1, 0]), K(0.34, [0.15, -0.1, 0]), K(0.5, Z)],
      tail: [K(0, Z), K(0.07, [-0.3, 0, 0]), K(0.34, [-0.3, 0, 0]), K(0.5, Z)],
    },
  },

  shieldPulse: {
    duration: 0.43, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, Z, [0, 0.9, 0]), K(0.15, [0, 0, 0.05], [0, 1.05, 0]), K(0.3, Z, [0, 0.99, 0]), K(0.43, Z, HIP)],
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0.6, 0, 1.3]), K(0.15, [1.3, 0, 0.9]), K(0.43, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(0.1, [-0.6, 0, 1.3]), K(0.15, [-1.3, 0, 0.9]), K(0.43, [0, 0, 0.42])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, 1.4]), K(0.15, [0, 0, 0.1]), K(0.43, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.1, [0, 0, 1.4]), K(0.15, [0, 0, 0.1]), K(0.43, [0, 0, 0.75])],
      torso: [K(0, Z), K(0.1, [0, 0, -0.15]), K(0.15, [0, 0, 0.2]), K(0.43, Z)],
      head: [K(0, Z), K(0.15, [0, 0, 0.15]), K(0.43, Z)],
      legL: [K(0, Z), K(0.1, [-0.3, 0, 0.5]), K(0.15, Z), K(0.43, Z)],
      legR: [K(0, Z), K(0.1, [0.3, 0, 0.5]), K(0.15, Z), K(0.43, Z)],
      earL: [K(0, Z), K(0.15, [-0.3, 0.2, 0]), K(0.43, Z)],
      earR: [K(0, Z), K(0.15, [0.3, -0.2, 0]), K(0.43, Z)],
      sash: [K(0, Z), K(0.15, [-0.6, 0, 0]), K(0.43, Z)],
    },
  },

  chainDash: {
    duration: 0.53, loop: false,
    tracks: {
      torso: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.35, [0, 0, -0.5]), K(0.45, [0, 0, -0.1]), K(0.53, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.4]), K(0.35, [0, 0, -0.4]), K(0.53, Z)],
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.08], [-0.04, 0.92, 0]), K(0.35, [0, 0, -0.08], [0.05, 0.92, 0]), K(0.53, Z, HIP)],
      legL: [K(0, Z), K(0.1, [0, 0, 0.65]), K(0.2, [0, 0, -0.65]), K(0.3, [0, 0, 0.65]), K(0.4, [0, 0, 0.3]), K(0.53, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, -0.65]), K(0.2, [0, 0, 0.65]), K(0.3, [0, 0, -0.65]), K(0.4, [0, 0, -0.2]), K(0.53, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.1, [0, 0, -0.9]), K(0.35, [0, 0, -0.9]), K(0.42, [0, 0, 1.4]), K(0.53, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.1, [0, 0, 1.2]), K(0.42, [0, 0, 0.2]), K(0.53, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0.2, 0, -0.8]), K(0.42, [0.3, 0, -1.0]), K(0.53, [0, 0, 0.28])],
      earL: [K(0, Z), K(0.1, [0, -0.4, 0]), K(0.35, [0, -0.4, 0]), K(0.53, Z)],
      earR: [K(0, Z), K(0.1, [0, 0.4, 0]), K(0.35, [0, 0.4, 0]), K(0.53, Z)],
      sash: [K(0, Z), K(0.1, [-0.8, 0, 0]), K(0.35, [-0.8, 0, 0]), K(0.53, Z)],
      tail: [K(0, Z), K(0.1, [-0.5, 0, 0]), K(0.35, [-0.5, 0, 0]), K(0.53, Z)],
    },
  },

  risingChain: {
    duration: 0.47, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.14], [0, 0.68, 0]), K(0.18, [0, 0, 0.1], [0.08, 1.12, 0]), K(0.32, Z, [0.03, 1.02, 0]), K(0.47, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.45]), K(0.18, [0, 0, 0.35]), K(0.47, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.4]), K(0.18, [0, 0, 0.5]), K(0.47, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.1, [0, 0, -0.7]), K(0.18, [0, 0, 2.6]), K(0.3, [0, 0, 2.4]), K(0.47, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.1, [0, 0, 1.2]), K(0.18, [0, 0, 0.1]), K(0.47, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.18, [0.3, 0, -1.0]), K(0.47, [0, 0, 0.28])],
      legL: [K(0, Z), K(0.18, [0, 0, -0.5]), K(0.47, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, 0.3]), K(0.18, [0, 0, 0.6]), K(0.47, Z)],
      shinR: [K(0, Z), K(0.18, [0, 0, -0.7]), K(0.47, Z)],
      earL: [K(0, Z), K(0.18, [-0.4, 0.25, 0]), K(0.47, Z)],
      earR: [K(0, Z), K(0.18, [0.4, -0.25, 0]), K(0.47, Z)],
      sash: [K(0, Z), K(0.18, [0.6, 0, 0]), K(0.47, Z)],
    },
  },

  honorThrow: {
    duration: 0.85, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, Z, [0.05, 0.95, 0]), K(0.3, [0, 0, -0.15], [0, 0.88, 0]), K(0.38, [0, 0, 0.25], [-0.05, 1.02, 0]), K(0.55, Z, HIP), K(0.85, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.25]), K(0.3, [0, 0, -0.45]), K(0.38, [0, 0, 0.55]), K(0.55, [0, 0, 0.1]), K(0.85, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.38, [0, 0, 0.4]), K(0.85, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.12, [0.5, 0, 1.3]), K(0.3, [0.4, 0, 2.0]), K(0.38, [-0.3, 0, -0.6]), K(0.55, [0, 0, 0.1]), K(0.85, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(0.12, [-0.5, 0, 1.3]), K(0.3, [-0.4, 0, 2.0]), K(0.38, [0.3, 0, -0.6]), K(0.55, [0, 0, 0.1]), K(0.85, [0, 0, 0.42])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.12, [0, 0, 0.9]), K(0.38, [0, 0, 0.1]), K(0.85, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.12, [0, 0, 0.9]), K(0.38, [0, 0, 0.1]), K(0.85, [0, 0, 0.75])],
      legL: [K(0, Z), K(0.3, [-0.3, 0, 0.4]), K(0.38, Z), K(0.85, Z)],
      legR: [K(0, Z), K(0.3, [0.3, 0, 0.4]), K(0.38, Z), K(0.85, Z)],
      earL: [K(0, Z), K(0.38, [-0.3, 0.2, 0]), K(0.6, Z), K(0.85, Z)],
      earR: [K(0, Z), K(0.38, [0.3, -0.2, 0]), K(0.6, Z), K(0.85, Z)],
      sash: [K(0, Z), K(0.38, [0.7, 0, 0]), K(0.6, Z), K(0.85, Z)],
      tail: [K(0, Z), K(0.38, [0.5, 0, 0]), K(0.6, Z), K(0.85, Z)],
    },
  },

  packDiscipline: {
    duration: 0.73, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.15, [0, 0, -0.1], [0.06, 0.8, 0]), K(0.34, [0, 0, -0.2], [0.1, 0.72, 0]), K(0.42, [0, 0, -0.3], [0.12, 0.66, 0]), K(0.58, Z, [0, 0.9, 0]), K(0.73, Z, HIP)],
      torso: [K(0, Z), K(0.15, [0, 0, -0.35]), K(0.34, [0, 0, -0.5]), K(0.42, [0, 0, -0.7]), K(0.58, [0, 0, -0.1]), K(0.73, Z)],
      head: [K(0, Z), K(0.15, [0, 0, -0.3]), K(0.42, [0, 0, -0.4]), K(0.73, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.15, [0.4, 0, 1.2]), K(0.34, [0.4, 0, 1.2]), K(0.73, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(0.15, [-0.3, 0, 1.0]), K(0.34, [0, 0, 2.4]), K(0.42, [0, 0, -0.4]), K(0.58, [0, 0, 0.3]), K(0.73, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.34, [0, 0, 0.2]), K(0.42, [0, 0, 0.05]), K(0.73, [0, 0, 0.75])],
      legL: [K(0, Z), K(0.15, [-0.5, 0, 0.8]), K(0.58, [-0.2, 0, 0.3]), K(0.73, Z)],
      legR: [K(0, Z), K(0.15, [0.5, 0, 0.8]), K(0.58, [0.2, 0, 0.3]), K(0.73, Z)],
      shinL: [K(0, Z), K(0.15, [0, 0, -1.0]), K(0.58, [0, 0, -0.4]), K(0.73, Z)],
      shinR: [K(0, Z), K(0.15, [0, 0, -1.0]), K(0.58, [0, 0, -0.4]), K(0.73, Z)],
      earL: [K(0, Z), K(0.42, [0.3, 0.3, 0]), K(0.6, Z), K(0.73, Z)],
      earR: [K(0, Z), K(0.42, [-0.3, -0.3, 0]), K(0.6, Z), K(0.73, Z)],
      tail: [K(0, Z), K(0.42, [0.6, 0, 0]), K(0.73, Z)],
    },
  },

  proofOfPaw: {
    duration: 0.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0.2, -0.06], [-0.06, 0.9, 0]), K(0.55, [0, 0.2, -0.06], [-0.06, 0.9, 0]), K(0.68, [0, -0.2, 0.05], [0.1, 1.0, 0]), K(0.9, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, 0.35, 0.08]), K(0.55, [0, 0.35, 0.1]), K(0.68, [0, -0.5, -0.2]), K(0.9, Z)],
      head: [K(0, Z), K(0.05, [0, -0.3, -0.08]), K(0.55, [0, -0.3, -0.08]), K(0.68, [0, 0.2, -0.1]), K(0.9, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.05, [-0.2, 0, 1.9]), K(0.55, [-0.2, 0, 1.95]), K(0.68, [0, 0, -0.3]), K(0.9, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.05, [0, 0, 0.3]), K(0.55, [0, 0, 0.3]), K(0.68, [0, 0, 0.1]), K(0.9, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.05, [0.4, 0, 0.6]), K(0.55, [0.4, 0, 0.6]), K(0.68, [0, 0, 1.6]), K(0.9, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.05, [0, 0, 1.2]), K(0.55, [0, 0, 1.2]), K(0.68, [0, 0, 0.1]), K(0.9, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.05, [-0.2, 0, 0.3]), K(0.55, [-0.2, 0, 0.3]), K(0.9, Z)],
      legR: [K(0, Z), K(0.05, [0.2, 0, 0.05]), K(0.55, [0.2, 0, 0.05]), K(0.9, Z)],
      earL: [K(0, Z), K(0.05, [-0.2, 0.12, 0]), K(0.55, [-0.2, 0.12, 0]), K(0.9, Z)],
      earR: [K(0, Z), K(0.05, [0.2, -0.12, 0]), K(0.55, [0.2, -0.12, 0]), K(0.9, Z)],
      tail: [K(0, Z), K(0.05, [-0.35, 0, 0]), K(0.55, [-0.35, 0, 0]), K(0.9, Z)],
      sash: [K(0, Z), K(0.05, [0.2, 0, 0]), K(0.68, [-0.5, 0, 0]), K(0.9, Z)],
    },
  },

  communityShield: {
    duration: 0.8, loop: false,
    tracks: {
      head: [K(0, Z), K(0.1, [0, 0, 0.35]), K(0.24, [0, 0, 0.35]), K(0.34, [0, 0, -0.15]), K(0.8, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.1, [0, 0, 2.3]), K(0.24, [0, 0, 2.3]), K(0.34, [-0.6, 0, 1.4]), K(0.6, [-0.6, 0, 1.4]), K(0.8, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.1, [0, 0, 1.6]), K(0.24, [0, 0, 1.6]), K(0.34, [0, 0, 0.2]), K(0.8, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.34, [0.6, 0, 1.4]), K(0.6, [0.6, 0, 1.4]), K(0.8, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.34, [0, 0, 0.2]), K(0.6, [0, 0, 0.2]), K(0.8, [0, 0, 0.5])],
      torso: [K(0, Z), K(0.1, [0, 0, 0.2]), K(0.34, [0, 0, -0.3]), K(0.6, [0, 0, -0.3]), K(0.8, Z)],
      hips: [K(0, Z, HIP), K(0.34, [0, 0, -0.05], [0.04, 0.96, 0]), K(0.6, [0, 0, -0.05], [0.04, 0.96, 0]), K(0.8, Z, HIP)],
      legL: [K(0, Z), K(0.34, [0, 0, 0.4]), K(0.8, Z)],
      legR: [K(0, Z), K(0.34, [0, 0, -0.2]), K(0.8, Z)],
      earL: [K(0, Z), K(0.1, [0.25, 0.3, 0]), K(0.24, [0.25, 0.3, 0]), K(0.34, Z), K(0.8, Z)],
      earR: [K(0, Z), K(0.1, [-0.25, -0.3, 0]), K(0.24, [-0.25, -0.3, 0]), K(0.34, Z), K(0.8, Z)],
      tail: [K(0, Z), K(0.34, [0.4, 0, 0]), K(0.6, [-0.3, 0, 0]), K(0.8, Z)],
    },
  },

  stakingStance: {
    duration: 2.35, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, Z, [0, 0.62, 0]), K(1.1, [0, 0, 0.02], [0, 0.605, 0]), K(2.0, Z, [0, 0.62, 0]), K(2.35, Z, HIP)],
      legL: [K(0, Z), K(0.2, [-0.7, 0, 1.0]), K(2.0, [-0.7, 0, 1.0]), K(2.35, Z)],
      legR: [K(0, Z), K(0.2, [0.7, 0, 1.0]), K(2.0, [0.7, 0, 1.0]), K(2.35, Z)],
      shinL: [K(0, Z), K(0.2, [0, 0, -1.35]), K(2.0, [0, 0, -1.35]), K(2.35, Z)],
      shinR: [K(0, Z), K(0.2, [0, 0, -1.35]), K(2.0, [0, 0, -1.35]), K(2.35, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.06]), K(1.1, [0, 0, 0.1]), K(2.0, [0, 0, 0.06]), K(2.35, Z)],
      head: [K(0, Z), K(0.2, [0, 0, -0.25]), K(1.1, [0, 0, -0.3]), K(2.0, [0, 0, -0.25]), K(2.35, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.2, [0.5, 0, 1.1]), K(2.0, [0.5, 0, 1.1]), K(2.35, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(0.2, [-0.5, 0, 1.1]), K(2.0, [-0.5, 0, 1.1]), K(2.35, [0, 0, 0.42])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 1.25]), K(2.0, [0, 0, 1.25]), K(2.35, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.2, [0, 0, 1.25]), K(2.0, [0, 0, 1.25]), K(2.35, [0, 0, 0.75])],
      earL: [K(0, Z), K(0.2, [0.06, 0.08, 0]), K(1.1, [0.1, 0.12, 0]), K(2.0, [0.06, 0.08, 0]), K(2.35, Z)],
      earR: [K(0, Z), K(0.2, [-0.06, -0.08, 0]), K(1.1, [-0.1, -0.12, 0]), K(2.0, [-0.06, -0.08, 0]), K(2.35, Z)],
      tail: [K(0, Z), K(0.2, [0.5, 0, 0]), K(2.0, [0.5, 0, 0]), K(2.35, Z)],
      sash: [K(0, Z), K(0.2, [0.4, 0, 0]), K(2.0, [0.4, 0, 0]), K(2.35, Z)],
    },
  },

  chainSplitter: {
    duration: 1.25, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, 0.1], [-0.06, 1.06, 0]), K(0.23, [0, 0, -0.25], [0.12, 0.78, 0]), K(0.5, [0, 0, -0.25], [0.12, 0.78, 0]), K(0.9, [0, 0, -0.1], [0.06, 0.9, 0]), K(1.25, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, 0.4]), K(0.23, [0, 0, -0.6]), K(0.5, [0, 0, -0.6]), K(0.9, [0, 0, -0.2]), K(1.25, Z)],
      head: [K(0, Z), K(0.14, [0, 0, 0.35]), K(0.23, [0, 0, -0.35]), K(0.5, [0, 0, -0.35]), K(1.25, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.14, [0, 0, 2.9]), K(0.23, [0, 0, -0.5]), K(0.5, [0, 0, -0.5]), K(0.9, [0, 0, 0.2]), K(1.25, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.14, [0, 0, 0.2]), K(0.23, [0, 0, 0.05]), K(0.5, [0, 0, 0.05]), K(1.25, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.14, [0.4, 0, 2.7]), K(0.23, [0.3, 0, -0.4]), K(0.5, [0.3, 0, -0.4]), K(1.25, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.14, [0, 0, 0.3]), K(0.23, [0, 0, 0.1]), K(1.25, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.23, [-0.5, 0, 0.8]), K(0.5, [-0.5, 0, 0.8]), K(1.25, Z)],
      legR: [K(0, Z), K(0.23, [0.5, 0, 0.8]), K(0.5, [0.5, 0, 0.8]), K(1.25, Z)],
      shinL: [K(0, Z), K(0.23, [0, 0, -1.0]), K(0.5, [0, 0, -1.0]), K(1.25, Z)],
      shinR: [K(0, Z), K(0.23, [0, 0, -1.0]), K(0.5, [0, 0, -1.0]), K(1.25, Z)],
      earL: [K(0, Z), K(0.14, [-0.35, 0.2, 0]), K(0.25, [0.3, 0.3, 0]), K(0.6, Z), K(1.25, Z)],
      earR: [K(0, Z), K(0.14, [0.35, -0.2, 0]), K(0.25, [-0.3, -0.3, 0]), K(0.6, Z), K(1.25, Z)],
      tail: [K(0, Z), K(0.14, [-0.5, 0, 0]), K(0.25, [0.5, 0, 0]), K(0.7, Z), K(1.25, Z)],
      sash: [K(0, Z), K(0.14, [-0.7, 0, 0]), K(0.25, [0.7, 0, 0]), K(0.7, Z), K(1.25, Z)],
    },
  },

  goodValidator: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.25, [0, 0, -0.08], [0, 0.94, 0]), K(0.7, [0, 0, -0.08], [0, 0.94, 0]), K(1.0, Z, HIP)],
      torso: [K(0, Z), K(0.25, [0, 0, -0.8]), K(0.7, [0, 0, -0.8]), K(1.0, Z)],
      head: [K(0, Z), K(0.25, [0, 0, -0.45]), K(0.7, [0, 0, -0.45]), K(1.0, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.25, [0, 0, -0.5]), K(0.7, [0, 0, -0.5]), K(1.0, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.42]), K(0.25, [0.4, 0, 1.0]), K(0.7, [0.4, 0, 1.0]), K(1.0, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.25, [0, 0, 1.5]), K(0.7, [0, 0, 1.5]), K(1.0, [0, 0, 0.75])],
      legL: [K(0, Z), K(0.25, [0, 0, 0.12]), K(1.0, Z)],
      legR: [K(0, Z), K(0.25, [0, 0, -0.1]), K(1.0, Z)],
      earL: [K(0, Z), K(0.25, [0.35, 0, 0]), K(0.7, [0.35, 0, 0]), K(0.85, [-0.1, -0.1, 0]), K(1.0, Z)],
      earR: [K(0, Z), K(0.25, [-0.35, 0, 0]), K(0.7, [-0.35, 0, 0]), K(0.85, [0.1, 0.1, 0]), K(1.0, Z)],
      tail: [K(0, Z), K(0.25, [0.3, 0, 0]), K(0.8, [-0.4, 0, 0]), K(1.0, Z)],
      sash: [K(0, Z), K(0.25, [-0.4, 0, 0]), K(1.0, Z)],
    },
  },

  // finisher: draw, wait, one perfect vertical slash, slow sheath, turn away
  slashedValidator: {
    duration: 2.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, [0, 0.2, -0.05], [-0.05, 0.95, 0]), K(0.85, [0, 0.2, -0.05], [-0.05, 0.95, 0]), K(0.95, [0, -0.2, -0.2], [0.15, 0.8, 0]), K(1.5, [0, -0.2, -0.2], [0.15, 0.8, 0]), K(1.9, Z, HIP), K(2.5, Z, HIP)],
      torso: [K(0, Z), K(0.3, [0, 0.3, 0.3]), K(0.85, [0, 0.3, 0.35]), K(0.95, [0, -0.4, -0.55]), K(1.5, [0, -0.4, -0.55]), K(1.9, [0, 0, 0.05]), K(2.5, Z)],
      head: [K(0, Z), K(0.3, [0, -0.2, 0.1]), K(0.85, [0, -0.2, 0.1]), K(0.95, [0, 0.1, -0.3]), K(1.5, [0, 0.1, -0.3]), K(1.9, [0, 0, -0.1]), K(2.3, [0, 0.3, 0]), K(2.5, Z)],
      armR: [K(0, [0, 0, 0.42]), K(0.3, [0, 0, 2.95]), K(0.85, [0, 0, 3.0]), K(0.95, [0, 0, -0.6]), K(1.5, [0, 0, -0.6]), K(1.9, [0, 0, 0.9]), K(2.2, [0, 0, 0.42]), K(2.5, [0, 0, 0.42])],
      forearmR: [K(0, [0, 0, 0.75]), K(0.3, [0, 0, 0.15]), K(0.95, [0, 0, 0.05]), K(1.5, [0, 0, 0.05]), K(1.9, [0, 0, 1.3]), K(2.2, [0, 0, 0.75]), K(2.5, [0, 0, 0.75])],
      armL: [K(0, [0, 0, 0.28]), K(0.3, [0.5, 0, 0.8]), K(0.95, [0.4, 0, -0.8]), K(1.5, [0.4, 0, -0.8]), K(1.9, [0, 0, 0.28]), K(2.5, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 1.0]), K(0.95, [0, 0, 0.2]), K(1.9, [0, 0, 0.5]), K(2.5, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.95, [-0.4, 0, 0.7]), K(1.5, [-0.4, 0, 0.7]), K(1.9, Z), K(2.5, [0, 0, 0.06])],
      legR: [K(0, Z), K(0.95, [0.4, 0, 0.7]), K(1.5, [0.4, 0, 0.7]), K(1.9, Z), K(2.5, [0, 0, -0.05])],
      shinL: [K(0, Z), K(0.95, [0, 0, -0.9]), K(1.5, [0, 0, -0.9]), K(1.9, Z)],
      shinR: [K(0, Z), K(0.95, [0, 0, -0.9]), K(1.5, [0, 0, -0.9]), K(1.9, Z)],
      earL: [K(0, Z), K(0.3, [-0.25, 0.15, 0]), K(0.85, [-0.25, 0.15, 0]), K(0.98, [0.35, 0.3, 0]), K(1.5, Z), K(2.5, Z)],
      earR: [K(0, Z), K(0.3, [0.25, -0.15, 0]), K(0.85, [0.25, -0.15, 0]), K(0.98, [-0.35, -0.3, 0]), K(1.5, Z), K(2.5, Z)],
      tail: [K(0, Z), K(0.95, [0.6, 0, 0]), K(1.5, Z), K(2.5, Z)],
      sash: [K(0, Z), K(0.3, [-0.4, 0, 0]), K(0.98, [0.7, 0, 0]), K(1.5, Z), K(2.5, Z)],
    },
  },
}

// ---------------------------------------------------------------------------
// script helpers (inline — character files are self-contained)
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

// energy blade show/hide with a guaranteed restore. Returns a hide() that is
// safe to call repeatedly (used both on schedule and as failsafe).
function bladeControl(fx) {
  const blade = fx.self?.bones?.forearmR?.userData?.blade || null
  return {
    show() { try { if (blade) blade.visible = true } catch { /* mesh gone */ } },
    hide() { try { if (blade) blade.visible = false } catch { /* mesh gone */ } },
  }
}

// medallion glow with restore
function medalControl(fx) {
  const mat = fx.self?.bones?.torso?.userData?.medalMat || null
  return {
    glow(hex = 0xaa7700) { try { mat?.emissive?.setHex(hex) } catch { /* material */ } },
    restore() { try { mat?.emissive?.setHex(0x2a1d00) } catch { /* material */ } },
  }
}

// a small village dog (for Community Shield) — shares the two materials it is
// handed. Same breed language as the fighter in miniature: heavy ruff, drop
// ears, plumed tail carried up, so the wall reads as HIS community.
function makeVillageDog(furM, darkM) {
  const dog = new THREE.Group()
  const parts = []
  parts.push(put(new THREE.Mesh(superellipsoid(0.24, 0.15, 0.12, 3, 2.8, 16), furM), 0, 0.42, 0))
  parts.push(put(new THREE.Mesh(superellipsoid(0.14, 0.17, 0.17, 2.8, 2.6, 16), furM), 0.20, 0.50, 0))  // ruff
  parts.push(put(new THREE.Mesh(roundedBox(0.20, 0.17, 0.16, 0.045, 2), furM), 0.32, 0.60, 0))
  parts.push(put(new THREE.Mesh(taperedBox(0.10, 0.12, 0.08, 0.095, 0.13, 0.02), furM), 0.44, 0.575, 0, 0, 0, -Math.PI / 2))
  parts.push(put(new THREE.Mesh(superellipsoid(0.022, 0.026, 0.032, 2.6, 2.6, 12), darkM), 0.512, 0.588, 0))
  for (const sz of [1, -1]) {
    parts.push(put(new THREE.Mesh(plate([-0.03, 0.02, 0.03, 0.02, 0.035, -0.03, 0.012, -0.062, -0.022, -0.04],
      0.014, 0.005, { crown: 0.004, rimSeg: 1 }), furM), 0.28, 0.63, 0.078 * sz, 0.1 * sz, 0.25 * sz, 0))
    parts.push(put(new THREE.Mesh(lens(0.016, 0.011, 0.008, { seg: 8, faceSeg: 1, rimSeg: 1 }), darkM), 0.40, 0.635, 0.052 * sz, 0, 1.25 * sz, 0))
  }
  parts.push(new THREE.Mesh(splineTube([[-0.22, 0.46, 0], [-0.30, 0.60, 0.02], [-0.26, 0.72, 0.03], [-0.16, 0.75, 0.04]],
    0.05, 12, (t) => 0.05 - 0.02 * t * t, { radialSeg: 8, roundStart: true, roundEnd: true }), furM))
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      parts.push(put(new THREE.Mesh(taperedCapsule(0.036, 0.046, 0.20, 2, 8), furM), 0.15 * sx, 0.17, 0.075 * sz))
      parts.push(put(new THREE.Mesh(roundedBox(0.10, 0.045, 0.075, 0.018, 1), furM), 0.15 * sx + 0.015, 0.028, 0.075 * sz))
    }
  }
  dog.add(...parts)
  dog.traverse((o) => { if (o.isMesh) o.castShadow = true })
  mergeStatic(dog, { inPlace: true })
  dog.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return dog
}

function disposeGroup(g) {
  try {
    g.parent?.remove(g)
    g.traverse((o) => {
      if (o.isMesh) {
        // NEVER dispose a geometry that came out of the render layer's cache —
        // every other caller that asked for the same primitive is using it.
        if (!isSharedGeometry(o.geometry)) o.geometry?.dispose?.()
        const list = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of list) m?.dispose?.()
      }
    })
  } catch { /* already gone */ }
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function bladeSlashScript(fx) {
  const end = onceEnd(fx)
  const blade = bladeControl(fx)
  fx.sfx('whoosh', { pitch: 1.5 })
  fx.after(5, () => blade.show())
  fx.after(8, () => {
    if (inRange(fx, 2.3)) {
      fx.sfx('kick')
      fx.shake(0.3)
      fx.particles('sparks', v3(fx.foe.pos.x, 1.2, 0), { n: 10, dirX: fx.self.facing })
      fx.hit({ damage: 9, knockback: { x: 8, y: 2.5, spin: 0.8 }, hitStun: 18 })
    }
  })
  fx.after(14, () => blade.hide())
  fx.after(22, () => blade.hide()) // failsafe restore
  fx.after(24, end)
}

function counterStanceScript(fx) {
  const end = onceEnd(fx)
  const hp0 = fx.self.hp
  let triggered = false
  fx.sfx('block', { pitch: 1.3 })
  fx.frame((age) => {
    if (triggered || age > 18) return
    if (fx.self.hp < hp0 && fx.self.state === 'attack') {
      triggered = true
      // read the attack, return it with 2x pushback
      fx.sfx('punch_heavy')
      fx.shake(0.6)
      fx.slowmo(0.4, 0.3)
      fx.caption('READ LIKE A LEDGER')
      fx.particles('sparks', v3(fx.self.pos.x + fx.self.facing * 0.8, 1.3, 0), { n: 12, dirX: fx.self.facing })
      fx.hit({ damage: 8, knockback: { x: 13, y: 3.5, spin: 1.2 }, hitStun: 26, ragdoll: 1 })
    }
  })
  fx.after(30, end)
}

function shieldPulseScript(fx) {
  const end = onceEnd(fx)
  fx.after(8, () => {
    fx.sfx('block', { pitch: 0.8 })
    fx.shake(0.35)
    // radial low-poly shock ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      fx.particles('impact', v3(fx.self.pos.x + Math.cos(a) * 1.1, 0.9 + Math.sin(a) * 0.5, 0), { n: 3 })
    }
    if (inRange(fx, 2.6)) {
      fx.hit({ damage: 4, knockback: { x: 9.5, y: 2 }, hitStun: 16 })
      fx.caption('PERSONAL SPACE, SER')
    }
  })
  fx.after(26, end)
}

function chainDashScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('slide')
  const tryHit = (r) => {
    if (landed || !inRange(fx, r)) return
    landed = true
    fx.sfx('punch_heavy')
    fx.shake(0.45)
    fx.particles('impact', v3(fx.foe.pos.x, 1.1, 0), { n: 10, dirX: F })
    fx.hit({ damage: 11, knockback: { x: 10, y: 3.5, spin: 1 }, hitStun: 24, ragdoll: 1 })
  }
  for (let i = 0; i < 3; i++) {
    fx.after(8 + i * 4, () => {
      fx.impulse(fx.self, [F * 4.2, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.4, 0.15, 0), { n: 3 })
      tryHit(1.6)
    })
  }
  fx.after(20, () => tryHit(1.9))
  fx.after(32, end)
}

function risingChainScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('whoosh', { pitch: 0.9 })
  // chain-link props arc upward with the strike
  for (let i = 0; i < 5; i++) {
    fx.after(6 + i * 2, () => {
      const p = fx.spawnProp('coin', v3(clampToArena(fx, fx.self.pos.x + F * (0.7 + i * 0.22)), 0.6 + i * 0.4, (i % 2 ? 0.35 : -0.35)))
      if (p) { try { fx.impulse(p, [F * 2, 7 + i * 1.4, (i % 2 ? 1 : -1)], 2) } catch { /* prop gone */ } }
      if (i % 2 === 0) fx.sfx('coin', { pitch: 1.1 + i * 0.1 })
    })
  }
  fx.after(8, () => {
    if (inRange(fx, 1.9)) {
      fx.sfx('launch')
      fx.shake(0.5)
      fx.particles('sparks', v3(fx.foe.pos.x, 1.4, 0), { n: 10 })
      fx.hit({ damage: 9, knockback: { x: 2, y: 10, spin: 1.4 }, hitStun: 26, ragdoll: 1 })
      fx.caption('LINK BY LINK')
    }
  })
  fx.after(28, end)
}

function treasuryBarkScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(9, () => {
    // one governance-approved bark, ratified by the community treasury
    fx.sfx('bark', { pitch: 0.85 })
    fx.shake(0.45)
    fx.particles('dust', v3(fx.self.pos.x + F * 1.1, 1.2, 0), { n: 10 })
    if (inRange(fx, 3.0)) {
      fx.sfx('punch_heavy')
      fx.hit({ damage: 12, knockback: { x: 11, y: 4.5, spin: 1.5 }, hitStun: 26, ragdoll: 1 })
      fx.coins(v3(fx.foe.pos.x, 1.3, 0), 5)
      fx.caption('PROPOSAL PASSED')
    } else {
      fx.caption('QUORUM NOT REACHED')
    }
  })
  fx.after(38, end)
}

function proofOfPawScript(fx) {
  const end = onceEnd(fx)
  const medal = medalControl(fx)
  const hp0 = fx.self.hp
  let triggered = false
  medal.glow(0xcc8800)
  fx.sfx('bell', { pitch: 1.4, vol: 0.5 })
  fx.caption('PROOF OF PAW STANCE')
  fx.frame((age) => {
    if (triggered || age > 30) return
    if (fx.self.hp < hp0 && fx.self.state === 'attack') {
      triggered = true
      // the validator validates: hit returned with DOUBLE knockback
      fx.slowmo(0.3, 0.5)
      fx.shake(0.9)
      fx.zoom(fx.self, 0.5)
      fx.sfx('punch_heavy', { pitch: 0.8 })
      fx.caption('PROOF OF PAW')
      fx.announcer('PROOF OF PAW')
      fx.particles('sparks', v3(fx.self.pos.x + fx.self.facing * 0.9, 1.3, 0), { n: 18, dirX: fx.self.facing })
      fx.coins(v3(fx.self.pos.x + fx.self.facing * 1.2, 1.5, 0), 8)
      fx.hit({ damage: 14, knockback: { x: 16, y: 7, spin: 2.5 }, hitStun: 40, ragdoll: 2 })
    }
  })
  fx.after(33, () => {
    medal.restore()
    if (!triggered) fx.caption('BLOCK NOT CHALLENGED')
  })
  fx.after(50, () => medal.restore()) // failsafe restore
  fx.after(50, end)
}

function communityShieldScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('COMMUNITY SHIELD')
  fx.announcer('THE COMMUNITY HAS ASSEMBLED')
  fx.sfx('bark', { pitch: 1.3 })
  // the wall of 5 village dogs
  let wall = null
  let furM = null, darkM = null
  const cleanup = () => {
    if (wall) { disposeGroup(wall); wall = null }
    try { furM?.dispose?.(); darkM?.dispose?.() } catch { /* gone */ }
    furM = darkM = null
  }
  fx.after(6, () => {
    try {
      const g = fx.arena()?.group
      if (g) {
        furM = lamb(C.fur, { surface: 'fur' })
        darkM = lamb(C.dark, { surface: 'skin' })
        wall = new THREE.Group()
        const wx = clampToArena(fx, fx.self.pos.x + F * 1.9)
        for (let i = 0; i < 5; i++) {
          const dog = makeVillageDog(furM, darkM)
          dog.position.set(wx + (Math.abs(i - 2)) * 0.12 * -F, -0.75, (i - 2) * 0.5)
          dog.rotation.y = F === 1 ? 0 : Math.PI
          dog.userData.rise = i
          wall.add(dog)
        }
        g.add(wall)
      }
    } catch { /* arena optional — the shove still works */ }
    // dogs pop out of the ground one by one
    for (let i = 0; i < 5; i++) {
      fx.after(1 + i * 2, () => {
        try {
          if (wall) for (const d of wall.children) if (d.userData.rise === i) d.position.y = 0
        } catch { /* gone */ }
        fx.particles('dust', v3(fx.self.pos.x + F * 1.9, 0.2, (i - 2) * 0.5), { n: 3 })
        fx.sfx('boing', { pitch: 1.2 + i * 0.12, vol: 0.4 })
      })
    }
  })
  // THE SHOVE — five good boys, one direction
  fx.after(18, () => {
    fx.sfx('thud')
    fx.sfx('bark', { pitch: 0.9 })
    fx.shake(0.7)
    try { if (wall) wall.position.x += F * 0.45 } catch { /* gone */ }
    fx.particles('impact', v3(fx.self.pos.x + F * 2.3, 1.0, 0), { n: 12, dirX: F })
    if (inRange(fx, 3.4)) {
      fx.hit({ damage: 8, knockback: { x: 14, y: 3, spin: 0.8 }, hitStun: 26, ragdoll: 1 })
      fx.caption('SHOVED BY THE COMMUNITY')
    }
  })
  // dogs sink home
  fx.after(38, () => {
    try { if (wall) for (const d of wall.children) d.position.y = -0.75 } catch { /* gone */ }
  })
  fx.after(44, cleanup)
  fx.after(70, cleanup) // failsafe cleanup
  fx.after(48, end)
}

function stakingStanceScript(fx) {
  const end = onceEnd(fx)
  const medal = medalControl(fx)
  let stacks = 0
  let interrupted = false
  let lastHp = fx.self.hp
  const applyStacks = (n) => {
    const mult = 1 + 0.15 * n
    try { fx.self.damageMult = mult; fx.self.knockbackMult = mult } catch { /* fields */ }
  }
  const clearStacks = () => { stacks = 0; applyStacks(0); medal.restore() }
  fx.caption('STAKING...')
  fx.sfx('bell', { pitch: 1.1, vol: 0.5 })
  medal.glow(0x664400)
  fx.frame(() => {
    if (interrupted) return
    // any damage or state break slashes the stake
    if (fx.self.hp < lastHp || fx.self.state !== 'attack') {
      interrupted = true
      if (stacks > 0) fx.caption('STAKE SLASHED!')
      clearStacks()
      end()
      return
    }
    lastHp = fx.self.hp
  })
  // every 30 uninterrupted frames = one stack (+15% dmg/kb, max 3)
  for (let i = 1; i <= 3; i++) {
    fx.after(30 * i, () => {
      if (interrupted || stacks >= 3) return
      stacks = i
      applyStacks(stacks)
      medal.glow([0x664400, 0x996600, 0xcc8800, 0xffaa00][stacks])
      fx.caption(`STAKED ×${stacks} (+${stacks * 15}%)`)
      fx.sfx('coin', { pitch: 1 + stacks * 0.25 })
      fx.particles('stars', v3(fx.self.pos.x, 1.6, 0), { n: 4 + stacks * 3 })
      fx.coins(v3(fx.self.pos.x, 1.8, 0), 3 + stacks * 2)
    })
  }
  fx.after(120, () => {
    if (!interrupted && stacks > 0) fx.announcer('YIELD ACHIEVED')
    medal.restore()
    end()
  })
  // the buff eventually expires (and this is also the failsafe restore)
  fx.after(540, () => { try { fx.self.damageMult = 1; fx.self.knockbackMult = 1 } catch { /* fields */ } medal.restore() })
}

function chainSplitterScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const blade = bladeControl(fx)
  const x0 = fx.self.pos.x
  fx.zoom(fx.self, 0.6)
  fx.slowmo(0.45, 0.7)
  fx.caption('CHAIN SPLITTER')
  fx.announcer('CHAIN SPLITTER')
  fx.sfx('bell')
  fx.shake(0.3)
  fx.after(4, () => blade.show())

  // floor cracks (two jagged slabs that shear apart) — pure visuals, guarded
  let cracks = null
  let crackM = null
  const cleanup = () => {
    if (cracks) { disposeGroup(cracks); cracks = null }
    try { crackM?.dispose?.() } catch { /* gone */ }
    crackM = null
  }

  // THE SLASH — frame 14 (matches startup)
  fx.after(14, () => {
    fx.sfx('break')
    fx.shake(1.1)
    fx.slowmo(0.3, 0.6)
    fx.particles('sparks', v3(x0 + F * 1.2, 0.4, 0), { n: 20, dirX: F })
    for (let i = 0; i < 6; i++) {
      fx.particles('impact', v3(clampToArena(fx, x0 + F * (1 + i * 1.2)), 0.25, 0), { n: 6 })
    }
    try {
      const g = fx.arena()?.group
      if (g) {
        crackM = lamb(0x14151a, { surface: 'stone' })
        cracks = new THREE.Group()
        const cx = clampToArena(fx, x0 + F * 3)
        for (const side of [1, -1]) {
          const slab = box(6.5, 0.1, 0.5, crackM, cx, 0.03, side * 0.28, 0, side * 0.06, 0)
          slab.userData.side = side
          cracks.add(slab)
        }
        g.add(cracks)
      }
    } catch { /* arena optional */ }
    // the ground shears apart over the next frames
    for (let i = 1; i <= 8; i++) {
      fx.after(i * 2, () => {
        try {
          if (cracks) for (const s of cracks.children) s.position.z = s.userData.side * (0.28 + i * 0.05)
        } catch { /* gone */ }
      })
    }
  })

  // BOTH-side launch — foe full ragdoll, self a small dignified hop
  fx.after(18, () => {
    fx.sfx('explosion')
    fx.sfx('launch')
    fx.shake(1.2)
    fx.hit({ damage: 30, knockback: { x: 12, y: 9, spin: 2 }, hitStun: 40, ragdoll: 2 })
    fx.impulse(fx.self, [-F * 1.5, 4.5, 0])
    fx.coins(v3(clampToArena(fx, x0 + F * 2), 1.2, 0), 14)
    fx.caption('THE CHAIN HAS FORKED')
  })

  fx.after(26, () => blade.hide())
  fx.after(60, () => blade.hide()) // failsafe restore
  fx.after(66, cleanup)
  fx.after(110, cleanup) // failsafe cleanup
  fx.after(74, end)
}

function goodValidatorScript(fx) {
  const end = onceEnd(fx)
  fx.caption('GOOD VALIDATOR.')
  fx.sfx('bell', { pitch: 1.6, vol: 0.4 })
  // the solemn bow lands... then respect rains from above
  fx.after(18, () => {
    fx.sfx('coins_burst')
    fx.coins(v3(fx.foe.pos.x, 2.4, 0), 18)
    fx.particles('confetti', v3(fx.foe.pos.x, 2.2, 0), { n: 16 })
    for (let i = 0; i < 3; i++) {
      const p = fx.spawnProp('coin', v3(clampToArena(fx, fx.foe.pos.x + (i - 1) * 0.5), 2.6 + i * 0.3, (i - 1) * 0.3))
      if (p) { try { fx.impulse(p, [0, -2, 0], 3) } catch { /* prop gone */ } }
    }
  })
  fx.after(22, () => {
    if (inRange(fx, 3.2)) {
      fx.slowmo(0.4, 0.4)
      fx.shake(0.4)
      fx.sfx('thud', { pitch: 1.3 })
      fx.hit({ damage: 1, knockback: { x: 2, y: 5, spin: 0.8 }, hitStun: 30 })
      fx.caption('FLOORED BY RESPECT. 1 DAMAGE.')
      fx.announcer('SUCH HONOR')
    } else {
      fx.caption('RESPECT... UNRECEIVED')
    }
  })
  fx.after(58, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const ShibroDef = {
  id: 'shibro',
  name: 'SHIBRO',
  title: 'Guardian of the Chain',
  bio: 'A white mountain dog who took an oath to protect the network and, worse, the community. Shibro has never sold, never panicked, and never once replied to a DM that starts with "ser". He does not attack first. He finalizes.',
  style: 'Defensive precision. Parries, counters, armored advances and a stance that turns patience into damage. Let them swing. The chain remembers everything.',
  stats: { power: 6, speed: 6, defense: 9, chaos: 3 },
  height: 1.9,
  weight: 1.15,
  walkSpeed: 4.4,
  dashSpeed: 9.2,
  jumpVel: 8.4,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'paw-strike', name: 'Paw Strike', kind: 'light',
      input: ['light'],
      damage: 6, startup: 5, active: 3, recovery: 8,
      hitbox: { w: 1.0, h: 0.7, d: 0.9, forward: 1.0, up: 1.3 },
      knockback: { x: 4.5, y: 1, spin: 0.3 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'pawStrike', sfx: 'punch_light', script: null,
    },
    {
      id: 'low-sweep', name: 'Low Sweep', kind: 'kick',
      input: ['down', 'kick'],
      damage: 7, startup: 8, active: 4, recovery: 14,
      hitbox: { w: 1.7, h: 0.6, d: 1.2, forward: 0.9, up: 0.3 },
      knockback: { x: 2.5, y: 4.5, spin: 1.6 },
      hitStun: 24, blockStun: 10, hitStop: 4,
      launcher: true, ragdollThreshold: 1, // clean trip → legs out, brief float, floor
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'lowSweep', sfx: 'whoosh', script: null,
    },
    {
      id: 'shoulder-check', name: 'Shoulder Check', kind: 'heavy',
      input: ['heavy'],
      damage: 12, startup: 10, active: 5, recovery: 15,
      hitbox: { w: 1.0, h: 1.1, d: 0.9, forward: 0.9, up: 1.1 },
      knockback: { x: 9, y: 2, spin: 0.6 },
      hitStun: 20, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 15, // the pauldrons are not decorative
      clip: 'shoulderCheck', sfx: 'punch_heavy', script: null,
    },
    {
      id: 'energy-blade-slash', name: 'Energy Blade Slash', kind: 'kick',
      input: ['kick'],
      damage: 9, startup: 7, active: 4, recovery: 13,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 1.1, up: 1.2 },
      knockback: { x: 8, y: 2.5, spin: 0.8 },
      hitStun: 18, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'bladeSlash', sfx: 'whoosh',
      script: bladeSlashScript,
    },
    {
      id: 'counter-stance', name: 'Counter Stance', kind: 'heavy',
      input: ['back', 'heavy'],
      damage: 8, startup: 4, active: 14, recovery: 12,
      hitbox: { w: 0.9, h: 1.2, d: 0.9, forward: 0.8, up: 1.1 },
      knockback: { x: 13, y: 3.5, spin: 1.2 },
      hitStun: 26, blockStun: 8, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 6, meterCost: 0,
      armor: 18, // the parry window: eat the hit, return it doubled
      clip: 'counterStance', sfx: 'block',
      script: counterStanceScript,
    },
    {
      id: 'shield-pulse', name: 'Shield Pulse', kind: 'light',
      input: ['back', 'light'],
      damage: 4, startup: 8, active: 4, recovery: 14,
      hitbox: { w: 2.4, h: 1.6, d: 1.6, forward: 0.4, up: 1.0 },
      knockback: { x: 9.5, y: 2, spin: 0.4 },
      hitStun: 16, blockStun: 10, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'shieldPulse', sfx: 'block',
      script: shieldPulseScript,
    },
    {
      id: 'chain-dash', name: 'Chain Dash', kind: 'heavy',
      input: ['forward', 'heavy'],
      damage: 11, startup: 8, active: 10, recovery: 14,
      hitbox: { w: 1.1, h: 1.3, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 10, y: 3.5, spin: 1 },
      hitStun: 24, blockStun: 13, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 4, // committed forward step
      clip: 'chainDash', sfx: 'slide',
      script: chainDashScript,
    },
    {
      id: 'rising-chain-attack', name: 'Rising Chain Attack', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 9, startup: 7, active: 5, recovery: 16,
      hitbox: { w: 0.9, h: 1.6, d: 0.9, forward: 0.8, up: 1.3 },
      knockback: { x: 2, y: 10, spin: 1.4 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'risingChain', sfx: 'launch',
      script: risingChainScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'honor-throw', name: 'Honor Throw', kind: 'grab',
      input: ['grab'],
      damage: 12, startup: 7, active: 4, recovery: 40,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 0.9, up: 1.1 },
      // a clean, textbook shoulder throw — respectful, devastating
      knockback: { x: 8, y: 6, spin: 2 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'honorThrow', sfx: 'throw', script: null,
    },
    {
      id: 'pack-discipline', name: 'Pack Discipline', kind: 'grab',
      input: ['down', 'grab'],
      damage: 10, startup: 9, active: 3, recovery: 32,
      hitbox: { w: 1.0, h: 0.9, d: 0.9, forward: 0.9, up: 0.8 },
      // pin them down, one corrective paw slam, spike into the floor
      knockback: { x: 3, y: 7, spin: 2.5 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'packDiscipline', sfx: 'grab', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'treasury-bark', name: 'Treasury Bark', kind: 'special',
      input: ['special'],
      damage: 12, startup: 9, active: 4, recovery: 25,
      hitbox: { w: 1.4, h: 1.2, d: 1.0, forward: 1.3, up: 1.1 },
      knockback: { x: 11, y: 4.5, spin: 1.5 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'proofOfPaw', sfx: 'bark',
      script: treasuryBarkScript,
    },
    {
      id: 'proof-of-paw', name: 'Proof of Paw', kind: 'special',
      input: ['down', 'special'],
      damage: 14, startup: 3, active: 30, recovery: 20,
      hitbox: { w: 0.9, h: 1.3, d: 0.9, forward: 0.8, up: 1.1 },
      knockback: { x: 16, y: 7, spin: 2.5 },
      hitStun: 40, blockStun: 8, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 25,
      armor: 33, // the whole stance is the armor — get hit, hit back doubled
      clip: 'proofOfPaw', sfx: 'bell',
      script: proofOfPawScript,
    },
    {
      id: 'community-shield', name: 'Community Shield', kind: 'special',
      input: ['back', 'special'],
      damage: 8, startup: 12, active: 6, recovery: 30,
      hitbox: { w: 1.4, h: 1.6, d: 2.4, forward: 1.9, up: 1.0 },
      knockback: { x: 14, y: 3, spin: 0.8 },
      hitStun: 26, blockStun: 14, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'communityShield', sfx: 'bark',
      script: communityShieldScript,
    },
    {
      id: 'staking-stance', name: 'Staking Stance', kind: 'special',
      input: ['forward', 'special'],
      damage: 0, startup: 6, active: 120, recovery: 14,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 20, armor: 0,
      clip: 'stakingStance', sfx: 'bell',
      script: stakingStanceScript,
    },
    {
      id: 'chain-splitter', name: 'Chain Splitter', kind: 'super',
      input: ['super'],
      damage: 30, startup: 14, active: 30, recovery: 30,
      hitbox: { w: 6, h: 1.4, d: 1.4, forward: 3, up: 0.7 },
      knockback: { x: 12, y: 9, spin: 2 },
      hitStun: 40, blockStun: 16, hitStop: 8,
      launcher: true, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 12,
      clip: 'chainSplitter', sfx: 'bell',
      script: chainSplitterScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'good-validator', name: 'Good Validator', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 16, active: 4, recovery: 40,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.2 },
      knockback: { x: 2, y: 5, spin: 0.8 },
      hitStun: 30, blockStun: 8, hitStop: 6,
      launcher: false, ragdollThreshold: 0,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'goodValidator', sfx: 'bell',
      script: goodValidatorScript,
    },
  ],

  finisher: {
    id: 'slashed-validator',
    name: 'Slashed Validator',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const blade = bladeControl(fx)
      fx.slowmo(0.45, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption('SLASHED VALIDATOR')
      fx.announcer('SLASHED VALIDATOR')
      fx.sfx('bell')
      fx.shake(0.4)
      fx.self.playClip?.('slashedValidator')
      fx.after(4, () => blade.show())

      // hold the foe in place for the ritual
      fx.after(8, () => {
        fx.sfx('grab')
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 200 })
      })

      // the giant chain ring descends and spins around the foe — guarded visuals
      let rig = null // { group, ring, node, ringM, nodeM }
      let ringSpin = 0
      let rollVel = 0
      let cut = false
      const cleanup = () => {
        if (rig) { disposeGroup(rig.group); try { rig.ringM?.dispose?.(); rig.nodeM?.dispose?.() } catch { /* gone */ } rig = null }
      }
      fx.after(14, () => {
        try {
          const g = fx.arena()?.group
          if (g) {
            const ringM = lamb(0x9aa4b4, { surface: 'metal' })
            const nodeM = lamb(C.gold, { surface: 'gold' })
            nodeM.emissive = new THREE.Color(0x332200)
            const group = new THREE.Group()
            // filletRing lies in the XZ plane; this VFX wants it standing up in
            // XY, and rotated() returns a private copy so the shared cache is
            // never mutated and disposeGroup() can free it safely.
            const ring = new THREE.Mesh(rotated(filletRing(1.5, 0.16, 6, 14), Math.PI / 2, 0, 0), ringM)
            // chunky chain studs around the ring
            for (let i = 0; i < 7; i++) {
              const a = (i / 7) * Math.PI * 2
              ring.add(box(0.22, 0.22, 0.3, ringM, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0))
            }
            const node = box(0.4, 0.4, 0.4, nodeM, 0, -1.5, 0)
            ring.add(node)
            group.add(ring)
            group.position.set(clampToArena(fx, fx.foe.pos.x), 5.2, 0)
            group.traverse((o) => { if (o.isMesh) o.castShadow = true })
            g.add(group)
            rig = { group, ring, node, ringM, nodeM }
          }
        } catch { /* arena optional — sequence still works */ }
        fx.sfx('whoosh', { pitch: 0.7 })
      })
      // per-frame ring motion: descend, spin, then roll away downhill
      fx.frame(() => {
        if (!rig) return
        try {
          ringSpin += cut ? -rollVel / 1.5 : 0.05
          rig.ring.rotation.z = ringSpin
          if (!cut && rig.group.position.y > 1.55) rig.group.position.y -= 0.24
          if (cut) {
            rollVel = Math.min(0.22, rollVel + 0.008)
            rig.group.position.x += F * rollVel
            // the foe goes with it
            if (fx.foe && Math.abs(fx.foe.pos.x - rig.group.position.x) < 2.2) {
              fx.impulse(fx.foe, [F * 1.6, 0.4, 0])
            }
          }
        } catch { /* gone */ }
      })
      fx.after(26, () => {
        fx.sfx('thud')
        fx.shake(0.5)
        fx.caption('VALIDATOR CONTAINED')
        fx.particles('dust', v3(fx.foe.pos.x, 0.3, 0), { n: 8 })
      })

      // THE CUT — one clean slash through the support node
      fx.after(54, () => {
        cut = true
        fx.sfx('break')
        fx.shake(1)
        fx.slowmo(0.3, 0.6)
        fx.zoom(fx.foe, 0.8)
        fx.caption('NODE SEVERED')
        try {
          if (rig) {
            rig.node.visible = false
            const shard = fx.spawnProp('coin', v3(rig.group.position.x, 0.4, 0))
            if (shard) fx.impulse(shard, [-F * 4, 5, 1], 4)
            fx.particles('sparks', v3(rig.group.position.x, 0.4, 0), { n: 16, dirX: -F })
          }
        } catch { /* gone */ }
        fx.ragdoll(fx.foe, [F * 4, 2, 0])
      })
      fx.after(58, () => blade.hide())

      // rolling away — bumps and dust
      for (let i = 0; i < 5; i++) {
        fx.after(64 + i * 8, () => {
          fx.sfx('thud', { pitch: 1 + i * 0.1, vol: 0.5 })
          fx.shake(0.3)
          try { if (rig) fx.particles('dust', v3(rig.group.position.x, 0.2, 0), { n: 4 }) } catch { /* gone */ }
        })
      }

      // ...and the ring HURLS them back across the arena
      fx.after(104, () => {
        fx.sfx('launch')
        fx.sfx('explosion')
        fx.shake(1.3)
        fx.slowmo(0.3, 0.8)
        fx.hit({ damage: 26, knockback: { x: -14, y: 8, spin: 3 }, hitStun: 60, ragdoll: 2 })
        fx.coins(v3(clampToArena(fx, fx.self.pos.x + F * 3), 1.5, 0), 20)
        fx.caption('CONSENSUS: REJECTED')
        fx.announcer('FINALITY ACHIEVED')
        try { if (rig) { fx.particles('explosion', v3(rig.group.position.x, 1.2, 0), { n: 24 }) } } catch { /* gone */ }
      })
      fx.after(112, cleanup)
      fx.after(150, cleanup) // failsafe cleanup
      fx.after(150, () => blade.hide()) // failsafe restore
      fx.after(145, end)
    },
  },

  voice: { pitch: 0.7, rate: 0.85 },
}
