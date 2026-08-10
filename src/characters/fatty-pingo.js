// FATTY PINGO — The Frozen Inventor.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// Round arctic seabird gadgeteer: huge white belly, stubby wings, mechanical
// goggles, a springy gadget backpack. His roundness is his POWER — high defense,
// fast recovery, bounces upright, flattens fools. All geometry, animation and
// move scripts are procedural — no assets, no extra deps.
import * as THREE from 'three'
import {
  makeMaterialFactory, disposeMaterialSafely, isSharedMaterial,
  roundedBox, chamferBox, loft, plate, footOutline, splineTube, superellipsoid,
  filletRing, rotated, dedupeGeometry, mergeStatic,
  superellipsePoints, roundedRectPoints,
} from '../render/index.js'

// One private material cache for this module: FATTY PINGO's ~30 parts collapse
// to ~14 materials (they flash together — correct), and no other fighter or
// arena can ever see them. Fighter.js copy-on-writes its own instances out of
// these at construction (`_claimMutableMaterials`), so hit-flash on one penguin
// can never reach the other. See src/render/README.md §5.
const M = makeMaterialFactory({ scope: 'fatty-pingo' })

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
// Ten values, three tiers with a deliberate hole between 0.63 and 0.81 luminance:
// the cream shield separates from everything else by at least a 0.18 step, so the
// face + belly hold together as one bright island inside one dark frame at any
// distance. All inside the contract's 30-240 sRGB dielectric band.
const C = {
  // --- tier A (0.81-0.93) — the inset island ------------------------------
  bellyCream: 0xf4eee2,  // face shield + belly. warm off-white, never #FFFFFF
  knitCream: 0xefe3c8,   // knitwear stripe / shades frame — same value, other material
  bellyShade: 0xd8cebe,  // cream's core shadow
  // --- tier B (0.44-0.63) — the accents -----------------------------------
  beakAmber: 0xf2933a,   // beak + feet. the ONLY saturated warm on the model
  hoodLight: 0x6e86c4,   // flipper inner face, crown up-planes
  knitTeal: 0x2fa79a,    // beanie / scarf / pack — ours, not the source's
  beakDeep: 0xc6641c,    // beak nail, mandible groove, sole, claw nubs
  // --- tier C (0.09-0.28) — the wrapping frame ----------------------------
  hoodMid: 0x33456b,     // THE hood. crown, back, sides, body outline wrap, lids
  hoodDeep: 0x1e2a45,    // tail, AO seams, hidden leg stub, paint-edge shadow
  // The brief asks for #14161C; that measures 20,22,28 sRGB and sits under the
  // contract's 30-240 dielectric floor (GRAPHICS_CONTRACT.md §0). The contract
  // wins. #1E2026 is the darkest legal ink and still reads 0.008 luminance below
  // hoodDeep, so the eyes remain the darkest value on the model and punch even
  // inside the hood's shadow — which is the only property the brief needed.
  eyeInk: 0x1e2026,      // eye domes. darkest LEGAL value on the model
  eyeGlass: 0xffffff,    // catchlights only. <0.2% of screen area
  rimIce: 0xbfe4ff,      // secondary bounce catchlight tint
  steel: 0xb8c2cf,       // wrench + nozzles (the only metal)
  lens: 0x7de8ff,        // shades glass
  ice: 0x9fd8ff,
  iceDeep: 0x1a4d8f,
  // costume 1 — "Midnight Prototype". cream/amber/ink NEVER change: identity.
  hoodMidAlt: 0x3b2a5e,
  hoodDeepAlt: 0x2a1d45,
  hoodLightAlt: 0x7a63b8,
  knitTealAlt: 0xc8524a,
  knitCreamAlt: 0xf0dcc2,
  packAlt: 0x226e63,
}

// ---------------------------------------------------------------------------
// tiny procedural-model helpers (inline — character files are self-contained)
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x) }

/**
 * curve(controlPoints) -> f(x)
 * Non-uniform Catmull-Rom through [[x, y], ...] (ascending x). Every body,
 * head and shield profile in this file is authored as a table of measured
 * control points from the build brief and read back through this — linear
 * interpolation between them would put a visible crease on every ring.
 */
function curve(cps) {
  const n = cps.length
  return (x) => {
    if (x <= cps[0][0]) return cps[0][1]
    if (x >= cps[n - 1][0]) return cps[n - 1][1]
    let i = 0
    while (i < n - 2 && x > cps[i + 1][0]) i++
    const p0 = cps[Math.max(0, i - 1)], p1 = cps[i], p2 = cps[i + 1], p3 = cps[Math.min(n - 1, i + 2)]
    const h = p2[0] - p1[0]
    const t = (x - p1[0]) / h
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 +
           (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2
  }
}

/**
 * paramSurface(fn, cols, rows, opts) -> BufferGeometry
 *
 * The workhorse. `fn(u, v)` returns [x, y, z] for u in [0,1] around the form
 * and v in [0,1] top -> bottom. Normals come from analytic central differences
 * of the same function, so the wrap seam is invisible (no merged-vertex hack,
 * no flat-shading tell) and the poles never spray garbage normals. Every
 * organic form on this fighter — skull, body, cream shields, beanie, lids,
 * flippers — is one of these. Nothing here is a raw primitive.
 *
 * opts: { closed = true (wrap in u), flip, du, dv }
 */
function paramSurface(fn, cols = 32, rows = 20, opts = {}) {
  const du = opts.du ?? 2e-4, dv = opts.dv ?? 2e-4
  const nx = cols + 1, ny = rows + 1
  const pos = new Float32Array(nx * ny * 3)
  const nor = new Float32Array(nx * ny * 3)
  const uvs = new Float32Array(nx * ny * 2)
  const sgn = opts.flip ? -1 : 1
  const at = (u, v) => fn(clamp01(u), clamp01(v))
  for (let j = 0; j < ny; j++) {
    const v = j / rows
    for (let i = 0; i < nx; i++) {
      const u = i / cols
      const p = at(u, v)
      const a = at(u + du, v), b = at(u - du, v)
      const c = at(u, Math.min(1, v + dv)), d = at(u, Math.max(0, v - dv))
      const tu = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
      const tv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]]
      let nxv = tu[1] * tv[2] - tu[2] * tv[1]
      let nyv = tu[2] * tv[0] - tu[0] * tv[2]
      let nzv = tu[0] * tv[1] - tu[1] * tv[0]
      let len = Math.hypot(nxv, nyv, nzv)
      if (!(len > 1e-12)) {
        // Degenerate frame. Borrow a neighbouring sample's normal — first along
        // v (a lathe pole), then along u (a section that tapers to a point, e.g.
        // the collar band's two ends). A ZERO normal here is not cosmetic: the
        // shader does normalize(vec3(0)) and every lit pixel of the mesh becomes
        // NaN, which the bloom downsample then smears across the ENTIRE frame as
        // black. One bad vertex used to black out ~75% of the picture.
        const probes = [
          [u, j === 0 ? dv * 8 : v - dv * 8],
          [i === 0 ? du * 8 : u - du * 8, v],
          [i === 0 ? du * 24 : u - du * 24, j === 0 ? dv * 24 : v - dv * 24],
        ]
        for (const [uu2, vv2] of probes) {
          const a2 = at(uu2 + du, vv2), b2 = at(uu2 - du, vv2)
          const c2 = at(uu2, Math.min(1, vv2 + dv)), d2 = at(uu2, Math.max(0, vv2 - dv))
          const tu2 = [a2[0] - b2[0], a2[1] - b2[1], a2[2] - b2[2]]
          const tv2 = [c2[0] - d2[0], c2[1] - d2[1], c2[2] - d2[2]]
          nxv = tu2[1] * tv2[2] - tu2[2] * tv2[1]
          nyv = tu2[2] * tv2[0] - tu2[0] * tv2[2]
          nzv = tu2[0] * tv2[1] - tu2[1] * tv2[0]
          len = Math.hypot(nxv, nyv, nzv)
          if (len > 1e-12) break
        }
        // Last resort: any unit vector beats a zero one.
        if (!(len > 1e-12)) { nxv = 0; nyv = 1; nzv = 0; len = 1 }
      }
      const k = (j * nx + i) * 3, k2 = (j * nx + i) * 2
      pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2]
      nor[k] = (sgn * nxv) / len; nor[k + 1] = (sgn * nyv) / len; nor[k + 2] = (sgn * nzv) / len
      uvs[k2] = u; uvs[k2 + 1] = 1 - v
    }
  }
  const idx = []
  const same = (i0, i1) => {
    const a = i0 * 3, b = i1 * 3
    return Math.abs(pos[a] - pos[b]) < 1e-7 && Math.abs(pos[a + 1] - pos[b + 1]) < 1e-7 &&
           Math.abs(pos[a + 2] - pos[b + 2]) < 1e-7
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * nx + i, b = j * nx + i + 1, c = (j + 1) * nx + i + 1, d = (j + 1) * nx + i
      if (!same(a, b)) idx.push(a, b, d)          // skip the collapsed pole quad half
      if (!same(c, d)) idx.push(b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setIndex(opts.flip ? idx.slice().reverse() : idx)
  g.userData.bevelled = true      // organic C1 surface: no edge left to chamfer
  g.name = opts.name || 'paramSurface'
  return g
}

/** mesh(geometry, material, x, y, z, rx, ry, rz) — the only mesh constructor here. */
function mesh(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

/** A bevelled slab. Replaces every BoxGeometry that used to be in this file. */
function slab(w, h, d, r, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const rad = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
  return mesh(roundedBox(w, h, d, rad, rad > 0.02 ? 3 : 2), material, x, y, z, rx, ry, rz)
}

/**
 * A sphere with ANALYTIC normals. `superellipsoid(r, r, r, 2, 2, seg)` is
 * exactly |x/r|^2+|y/r|^2+|z/r|^2 = 1 — a true sphere — but the normals come
 * from the implicit gradient rather than from averaged face normals, and the
 * result is a toolkit BufferGeometry rather than a raw SphereGeometry. That is
 * the difference between a specular lobe that slides smoothly across an eye
 * dome and one you can count the facets off. Every round detail on this
 * fighter — eye domes, catchlights, claw nubs, nostril and vent dimples, the
 * wrench pommel, the pack's diagnostic light — goes through here.
 */
const blob = (r, seg = 18) => superellipsoid(r, r, r, 2, 2, seg)

/** A rounded barrel with filleted rims. Replaces every CylinderGeometry. */
function barrel(r, h, rim, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 20) {
  const rr = Math.min(rim, r * 0.49, h * 0.49)
  const half = h / 2
  return mesh(paramSurface((u, v) => {
    const a = u * TAU
    // v: 0 = top cap centre .. 1 = bottom cap centre, with rolled rims
    let y0, rad
    if (v < 0.12) { const t = v / 0.12; y0 = half; rad = (r - rr) * t }
    else if (v < 0.22) { const t = (v - 0.12) / 0.1; y0 = half - rr * (1 - Math.cos(t * Math.PI / 2)); rad = r - rr + rr * Math.sin(t * Math.PI / 2) }
    else if (v < 0.78) { const t = (v - 0.22) / 0.56; y0 = lerp(half - rr, -half + rr, t); rad = r }
    else if (v < 0.88) { const t = (v - 0.78) / 0.1; y0 = -half + rr * Math.cos(t * Math.PI / 2) - rr; rad = r - rr + rr * Math.cos(t * Math.PI / 2) }
    else { const t = (v - 0.88) / 0.12; y0 = -half; rad = (r - rr) * (1 - t) }
    return [Math.cos(a) * rad, y0, Math.sin(a) * rad]
  }, seg, 22, { name: 'barrel' }), material, x, y, z, rx, ry, rz)
}

function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
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

// ---------------------------------------------------------------------------
// THE TWO EGGS
//
// He is not "a penguin who is fat". He is two nested eggs — a huge one standing
// on its blunt end with a slightly smaller one fused on top and NO NECK between
// them — wrapped in a dark hood that comes around the outline on every side so
// the warm cream front is an inset island. 2.50 head-heights (the source vinyl
// figure measures 2.29; ours is deliberately 9% leaner). Crown lands at exactly
// y = 1.600 = CharacterDef.height, on the head bone at y = 1.28.
// ---------------------------------------------------------------------------
//
// MEASURED OFF THE BUILT MESH (exact per-scanline silhouette extents, not
// eyeballed), round 3 final:
//   head-heights            2.58   (r2: 2.90, target 2.50)
//   head width              0.720  (spec 0.720)   body width 0.950
//   visible head/body shelf y = 0.980, a 0.09 m re-entrant step per side
//   hood's share of the outline on BOTH flanks, worst of 24 azimuths: 0.065 m
//     (the critic's threshold was 0.060; the only place the cream reaches a
//      contour at all is the chin/chest centreline in profile, where it is
//      17 mm proud — that contour is the front of the bird, and it is cream on
//      the source too. The FLANKS, which is what the inset-island rule is
//      about, are hood from every azimuth.)
//   foot notch              0.076-0.100 m (spec 0.075)
//   flipper crescent        0.095 m at the top -> 0.15 m at the tip (spec 0.08 -> 0.14)
//   tail breaks the rear outline by 0.127 m
//   beak projects 0.075 m past the face plane; tip at x = 0.450
//   46.2k triangles, 58 draw calls, 18 materials (roster median ~35k / 60)
const HEAD_Y = 1.28                 // head bone, world. The egg centres HERE
const HEAD_A = 0.360                // Z half-width  (HW = 0.720)
const HEAD_B = 0.320                // Y half-height (crown at 1.600)
const HEAD_C = 0.350                // X half-depth
const TORSO_Y = 0.66                // torso bone, world

/** Signed power. The superellipse primitive both eggs are built on. */
const spow = (v, p) => (v < 0 ? -Math.pow(-v, p) : Math.pow(v, p))

// ROUND-3: THE HEAD IS AN EGG, NOT AN ELLIPSOID, and that single change is what
// finally makes the head measure. The vertical profile runs exponent 2.15 above
// the equator (a slightly FULLER, flatter crown than a sphere — the dome that
// catches the broad vinyl smear) and 3.60 below it, so the lower skull stays
// wide all the way down to y = 0.975 instead of tapering away at 1.08. Because
// the visible head/body junction is wherever the two silhouettes cross, holding
// the skull wide low down is the ONLY way to move that junction down while the
// bone stays at y = 1.28 and the crown stays pinned at CharacterDef.height.
// r2 measured 2.9 head-heights (junction at 1.075); this measures 2.56.
//
// The lower exponent is 4.60, not 3.60: measured off the BUILT mesh, 3.60 put
// the crossing at y = 0.984 and 4.60 puts it at 0.975, which is the difference
// between 2.60 and 2.56 head-heights. Everything the change touches is below
// t = -0.6 (world y < 1.09) — i.e. the part of the skull that is inside the
// body or under the shelf. At the eye plane (t = -0.20) the two exponents
// differ by 0.4 mm, so the face, the beak seat, the shield and the beanie brim
// are all bit-identical.
const HEAD_ETOP = 2.15, HEAD_EBOT = 4.60
// Azimuthal exponent. 2.0 is a circle; 2.55 gives a gently flattened face plane
// and temples that turn a little harder into the hood — which is what buys the
// cream shield room to be wide AND stay off the silhouette.
const HEAD_EAZ = 2.55
const HEAD_PZ = 2 / HEAD_EAZ
const eggK = (t) => {
  const a = Math.min(1, Math.abs(t))
  const e = t >= 0 ? HEAD_ETOP : HEAD_EBOT
  return Math.pow(Math.max(0, 1 - Math.pow(a, e)), 1 / e)
}
const headHalfW = (yLocal) => HEAD_A * eggK(yLocal / HEAD_B)

/** Skull point from normalized height t (-1..1) and superellipse coords Xn/Zn. */
function headShape(t, Xn, Zn, k) {
  let x = HEAD_C * k * Xn
  // The occiput is the fullest part of the head — real penguin anatomy (large
  // skull, no neck) and it is what reads as *baby*.
  if (Xn < 0) x *= 1 + 0.034 * smoothstep(-Xn)
  // and the face is a gently convex plane, not a snout. There is NO muzzle mass.
  else if (t < 0) x *= 1 - 0.028 * smoothstep(Xn) * smoothstep(-t * 1.2)
  return [x, HEAD_B * t, HEAD_A * k * Zn]
}
function headPush(p, push) {
  if (!push) return p
  const L = Math.hypot(p[0], p[1], p[2]) || 1
  const s = 1 + push / L
  return [p[0] * s, p[1] * s, p[2] * s]
}

/** Skull point from (azimuth u in 0..1 measured from +X, elevation v 0=crown..1=base). */
function headAt(u, v, push = 0) {
  const t = Math.cos(v * Math.PI)
  const th = u * TAU
  return headPush(headShape(t, spow(Math.cos(th), HEAD_PZ), spow(Math.sin(th), HEAD_PZ),
    eggK(t)), push)
}

/** Skull point from a target (head-local y, head-local z) on the FRONT face. */
function headFaceAt(y, z, push = 0) {
  const t = Math.max(-0.99995, Math.min(0.99995, y / HEAD_B))
  const k = eggK(t) || 1e-4
  const Zn = Math.max(-0.9999, Math.min(0.9999, z / (HEAD_A * k)))
  const Xn = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(Zn), HEAD_EAZ)), 1 / HEAD_EAZ)
  return headPush(headShape(t, Xn, Zn, k), push)
}

// --- the body egg: a forward-biased ovoid whose mass hangs BELOW the rig -----
// Widest at y = 0.32 (20% of height, under the hips bone) — a pendulum bob, not
// a barrel. That is what promises the weeble `getup` before the clip plays.
//
// ROUND-3 RESHAPE, two changes and both are measured fixes:
//   1. The dome is far steeper. Half-width now falls 0.300 -> 0.205 between
//      y = 0.96 and y = 1.00 and dies at 1.040, so the head egg (still 0.276
//      wide at y = 1.00) owns the silhouette down to y ~ 0.985. That drops the
//      visible merge plane 0.09 m and is the whole of the head-size fix. The
//      fast flare immediately below it IS the 0.038 m re-entrant shoulder shelf
//      the rear read was missing.
//   2. The cross-section is a SUPERELLIPSE at exponent 3.2, not a circle. This
//      is the fix for "the cream escapes the silhouette". On a circular section
//      a cream patch 0.23 m wide sits 4 mm off the 3/4 outline no matter what
//      you do — the surface is tangent to the view there. At exponent 3.2 the
//      flanks turn away much harder, so the SAME cream width sits ~50 mm inside
//      the outline at 45 deg. Corner radius of curvature is still 0.23 m: there
//      is no hard edge anywhere, only a broader front and a tighter flank.
const BODY_TOP = 1.040, BODY_BOT = 0.105
const BODY_EAZ = 3.20
const BODY_PZ = 2 / BODY_EAZ
const bodyHalfZ = curve([
  [0.105, 0.000], [0.113, 0.150], [0.126, 0.268], [0.148, 0.362],
  [0.185, 0.428], [0.245, 0.463], [0.320, 0.475], [0.430, 0.472],
  [0.560, 0.459], [0.720, 0.436], [0.850, 0.398], [0.920, 0.352],
  [0.960, 0.300], [0.980, 0.256], [1.000, 0.205], [1.020, 0.148], [1.040, 0.000],
])
const BODY_CX = -0.030
// The belly leads and the chest recedes — this is what carves the chest scoop —
// and the lower front tucks BACK under 0.22 so the feet clear the overhang.
const bodyFwd = (y) => 0.92 + 0.14 * smoothstep((y - 0.10) / 0.16)
                            - 0.12 * smoothstep((y - 0.62) / 0.28)

function bodyShape(y, Xn, Zn, rz) {
  // blended so the forward bias has zero slope at the flanks: a hard switch at
  // Xn = 0 puts a vertical crease down both sides of the body
  const f = 1 + (bodyFwd(y) - 1) * smoothstep(Xn * 1.6)
  return [BODY_CX + rz * 0.995 * f * Xn, y, rz * Zn]
}

/** Body point in WORLD y, azimuth psi (0 = front +X). */
function bodyAt(y, psi) {
  const rz = bodyHalfZ(y)
  return bodyShape(y, spow(Math.cos(psi), BODY_PZ), spow(Math.sin(psi), BODY_PZ), rz)
}

/** Body point from (world y, world z) on the FRONT half, pushed proud. */
function bodyFrontAt(y, z, push = 0) {
  const rz = bodyHalfZ(y) || 1e-4
  const Zn = Math.max(-0.9999, Math.min(0.9999, z / rz))
  const Xn = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(Zn), BODY_EAZ)), 1 / BODY_EAZ)
  const p = bodyShape(y, Xn, Zn, rz)
  if (!push) return p
  const nx = p[0] - BODY_CX, nz = p[2]
  const L = Math.hypot(nx, nz) || 1
  return [p[0] + (nx / L) * push, y, p[2] + (nz / L) * push]
}

// --- ONE cream shield, authored once, in WORLD y -----------------------------
// r2 authored the face shield and the belly shield as two independent tables and
// terminated the face one at the chin, which put a horizontal crease across the
// character's brightest shape. There is now a single half-width function running
// the whole figure from the apex at y = 1.462 to a rounded point at y = 0.175.
// Above the merge plane it is projected onto the head egg, below it onto the
// body egg; the two overlap between 0.965 and 1.000, where the head's chin is in
// front of the chest and hides the join completely. No terminator, no crease.
//
// It closes at BOTH ends, so from every azimuth the cream is an inset ISLAND:
// hood above the apex, hood below the point, hood on both flanks. That closure
// is what the rim light traces, and it is the single most diagnostic cue the
// source has.
const creamRaw = curve([
  [0.175, 0.000], [0.190, 0.078], [0.208, 0.148], [0.250, 0.212],
  [0.320, 0.230], [0.420, 0.232], [0.560, 0.230], [0.700, 0.222],
  [0.820, 0.212], [0.900, 0.200], [0.960, 0.196], [1.000, 0.205],
  [1.060, 0.232], [1.120, 0.248], [1.180, 0.255], [1.230, 0.252],
  [1.290, 0.234], [1.350, 0.199], [1.400, 0.145], [1.440, 0.074], [1.462, 0.000],
])
// Head margin: 0.078 m of hood between the cream and the skull's outline at eye
// height (the frame that comes down BETWEEN the eye and the silhouette, which is
// the collection's face more than the eyes are), relaxing to 0.028 down at the
// junction so the shield's width matches the belly's exactly where they meet.
const headMargin = (y) => lerp(0.028, 0.078, smoothstep((y - HEAD_Y + 0.30) / 0.13))
const shieldW = (y) => {
  const hw = headHalfW(y)
  return Math.max(0.004, Math.min(creamRaw(y + HEAD_Y), hw - headMargin(y + HEAD_Y), hw * 0.86))
}
const bellyCreamW = (y) => Math.min(creamRaw(y), bodyHalfZ(y) * 0.84)

/**
 * shieldPatch(project, wAt, y0, y1, push, cols, rows)
 * The cream shields and their dark paint-edge shadows. `project(y, z, push)`
 * lands a target (y, z) on the parent form; `wAt(y)` is the half-width. Every
 * vertex sits on the real surface, so the cream is a moulded paint layer with a
 * real edge that catches light — not a decal, not a lighter ball jammed in.
 */
function shieldPatch(project, wAt, y0, y1, push, cols = 22, rows = 16) {
  return paramSurface((u, v) => {
    const y = lerp(y0, y1, v)
    const w = wAt(y)
    const t = (u - 0.5) * 2
    return project(y, w * Math.sin((t * Math.PI) / 2), push)
  }, cols, rows, { name: 'shield' })
}

function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}

  const alt = costume === 1
  // Every region gets a real SURFACE preset — normal, spatially varying
  // roughness and AO, all procedural. `roughness` here is three.js semantics: a
  // MULTIPLIER on the preset's physically-authored value, so the number in the
  // comment is what the shader actually resolves to (materials.js:applySurface).
  //
  // ROUND-2 NOTE — where the albedo maps went. The critic's read of the cream
  // ("milky mottled speckle... porridge at 30 cm, dirt at 3 m") is exactly what
  // an albedo map does to a moulded vinyl toy, and §10 of the brief measured the
  // real figure as having "no micro-texture whatsoever". So every TOY-VINYL
  // region now passes `map: null`: the albedo stays the authored hex, flat and
  // clean, while the normal / roughness / AO maps stay wired and do all the
  // surface work. Knit, rubber and metal keep their albedo — those are the three
  // regions that are supposed to look like material, not like paint.
  const hoodM = M.pbr(alt ? C.hoodMidAlt : C.hoodMid, 'plastic', {
    map: null, roughness: 0.69, normalScale: 0.22, clearcoat: 0.35,
    clearcoatRoughness: 0.28, envMapIntensity: 1.0, mapOpts: { scale: 5 },
  })  // -> 0.38 effective: the broad soft vinyl smear across the crown
  // hoodDeep shares the hood's coat and env so the two darks read as ONE dark
  // wrapping the whole silhouette — the payoff the inset-cream rule is built on.
  const hoodDeepM = M.pbr(alt ? C.hoodDeepAlt : C.hoodDeep, 'plastic', {
    map: null, roughness: 0.80, normalScale: 0.22, clearcoat: 0.35,
    clearcoatRoughness: 0.28, envMapIntensity: 1.0, mapOpts: { scale: 5 },
  })  // -> 0.44
  const hoodLightM = M.pbr(alt ? C.hoodLightAlt : C.hoodLight, 'plastic', {
    map: null, roughness: 0.73, normalScale: 0.2, clearcoat: 0.35,
    clearcoatRoughness: 0.28, envMapIntensity: 1.0, mapOpts: { scale: 6 },
  })  // -> 0.40
  // envMapIntensity clamped to 0.70: a bright arena must not blow the cream to
  // paper-white and destroy the 0.18 luminance step down to bellyShade.
  // ROUND-3: SHEEN IS GONE FROM THE CREAM. `sheen` on a MeshPhysicalMaterial is
  // a fabric lobe — a bright grazing-angle retroreflection with a fibre-like
  // falloff — and on 45% of the front-facing area it is exactly what made the
  // belly read as canvas/burlap at 30 cm. What the cream needs instead is a
  // BROAD SOFT SPECULAR: roughness 0.46 under a light clearcoat, which is a
  // moulded-vinyl satin and the one thing r2's cream had none of.
  const creamM = M.pbr(C.bellyCream, 'plastic', {
    map: null, roughness: 0.84, normalScale: 0.11, clearcoat: 0.25,
    clearcoatRoughness: 0.32, envMapIntensity: 0.72, mapOpts: { scale: 4 },
  })  // -> 0.46
  const shadeM = M.pbr(C.bellyShade, 'plastic', {
    map: null, roughness: 0.91, normalScale: 0.10, clearcoat: 0.22,
    clearcoatRoughness: 0.34, envMapIntensity: 0.6, mapOpts: { scale: 5 },
  })  // -> 0.50
  // The ONLY saturated warm on the model. ROUND-3: roughness lifted 0.155 ->
  // 0.30 and the coat dropped 0.60 -> 0.35. At 0.155 under a 0.60 coat the beak
  // returned a CLIPPED WHITE HOLE at 0.09 m across instead of a specular lobe,
  // which is most of why a stranger read the beak as tape rather than as horn.
  const amberM = M.pbr(C.beakAmber, 'plastic-gloss', {
    map: null, roughness: 1.94, clearcoat: 0.35, clearcoatRoughness: 0.22,
    envMapIntensity: 1.0, mapOpts: { scale: 8 },
  })  // -> 0.30
  const amberDeepM = M.pbr(C.beakDeep, 'plastic-gloss', {
    map: null, roughness: 2.2, clearcoat: 0.30, clearcoatRoughness: 0.28,
    envMapIntensity: 0.85, mapOpts: { scale: 8 },
  })  // -> 0.34
  // clearcoatRoughness is clamped at 0.09: the half-float precision floor the
  // Filament reference gives is 0.089, below which the coat lobe aliases.
  const eyeM = M.pbr(C.eyeInk, 'plastic-gloss', {
    noMaps: true, roughness: 0.30, clearcoat: 1.0, clearcoatRoughness: 0.09,
    envMapIntensity: 1.6,
  })  // -> 0.047
  const glassM = M.pbr(C.eyeGlass, 'plastic-gloss', {
    noMaps: true, roughness: 0.26, clearcoat: 1.0, clearcoatRoughness: 0.09,
    envMapIntensity: 2.0, emissive: 0x2b2b2b,
  })
  // the dim secondary catchlight at 4-5 o'clock: what separates a glossy vinyl
  // eye from a flat black sticker, and the cheapest AAA cue on the whole model
  const bounceM = M.pbr(C.rimIce, 'plastic-gloss', {
    noMaps: true, roughness: 0.12, envMapIntensity: 1.4,
    transparent: true, opacity: 0.45,
  })
  // The under-eye bounce line. bellyShade, not bellyCream, at 35% — r2 ran a
  // full-strength crescent 0.4 x the eye disc wide and it read as the eye dome
  // chipping off. It is now a 2.6 mm arc across the bottom 36 deg only.
  const arcM = M.pbr(C.bellyShade, 'plastic-gloss', {
    noMaps: true, roughness: 0.9, envMapIntensity: 1.0, side: THREE.DoubleSide,
    transparent: true, opacity: 0.35, depthWrite: false,
  })
  // Knit is the ONE region that must not look moulded — that contrast is what
  // proves everything else is vinyl.
  const knitM = M.pbr(alt ? C.knitTealAlt : C.knitTeal, 'knit', {
    roughness: 1.04, normalScale: 1.0, sheen: 0.35, sheenRoughness: 0.6,
    mapOpts: { scale: 14 },
  })
  const knitCreamM = M.pbr(alt ? C.knitCreamAlt : C.knitCream, 'knit', {
    roughness: 1.04, sheen: 0.35, sheenRoughness: 0.6, mapOpts: { scale: 14 },
  })
  const frameM = M.pbr(C.knitCream, 'plastic-gloss', {
    map: null, roughness: 1.16, clearcoat: 0.8, clearcoatRoughness: 0.10,
    envMapIntensity: 1.3, mapOpts: { scale: 10 },
  })  // -> 0.18. It sits on a cream forehead, so it has to separate by SPECULAR.
  const lensM = M.pbr(C.lens, 'glass', {
    transmission: 0.55, thickness: 0.020, ior: 1.5, roughness: 2.1,
    envMapIntensity: 1.35, emissive: 0x0d2b33,
  })
  // plastic-matte, not a woven rubber field: in the 3/4 shot the woven surface
  // made the pack read as a market crate parked behind him.
  const packM = M.pbr(alt ? C.packAlt : C.knitTeal, 'plastic', {
    roughness: 1.13, clearcoat: 0.15, clearcoatRoughness: 0.42,
    normalScale: 0.30, envMapIntensity: 0.85, mapOpts: { scale: 5, wear: 0.35 },
  })  // -> 0.62
  const metalM = M.pbr(C.steel, 'metal', { roughness: 1.3, mapOpts: { scale: 6, wear: 0.5 } })

  // --- hips — low centre of gravity, physically unbailoutable ---------------
  // The hips carry NO geometry: the whole body egg hangs off `torso`/`belly` so
  // bellyExchange can spin the hips group without smearing anything.
  const hips = pivot(group, 0, 0.52, 0)
  bones.hips = hips

  // tail — a stubby bevelled wedge, 28 deg down-back. Breaks the egg's rear
  // outline and gives the spring solver something to wag. (Extra bone, kept.)
  // ROUND-3: rooted 0.04 m further back and lengthened 0.162 -> 0.185, because
  // at the old root the wedge cleared the rear outline by only 0.067 m and was
  // invisible in every lineup shot. It now projects 0.14 m past the body's
  // rearmost point, which is the fourth of the four diagnostic voids the rear
  // silhouette needs (shelf notch / flipper crescent / foot notch / tail).
  const tail = pivot(hips, -0.44, -0.26, 0)
  bones.tail = tail
  const tailW = bent(tail, 0.49)
  tailW.add(mesh(loft([
    { y: 0.000, shape: roundedRectPoints(0.062, 0.220, 0.027, 3) },
    { y: 0.080, shape: roundedRectPoints(0.058, 0.198, 0.025, 3) },
    { y: 0.148, shape: roundedRectPoints(0.047, 0.162, 0.021, 3) },
    { y: 0.185, shape: roundedRectPoints(0.028, 0.118, 0.013, 3) },
  ], { subdivide: 2, ringPoints: 24 }), hoodDeepM, 0, 0, 0, 0, 0, Math.PI / 2))

  // --- legs — invisible stubs, tiny amber webbed feet ------------------------
  // The leg is entirely inside the belly overhang; only ~0.12 m of foot shows.
  // Foot centres 0.230 m apart against a 0.950 m body: comically narrow, which
  // is the point. Toe-out 9 deg.
  const footTop = rotated(rotated(plate(footOutline(0.300, 0.155, 3, { toeDepth: 0.92 }),
    0.055, 0.014, { crown: 0.014, faceSeg: 3, rimSeg: 3, taper: 0.16 }),
  -Math.PI / 2, 0, 0), 0, -Math.PI / 2, 0)
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0.02, -0.14, 0.115 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    const foot = new THREE.Group()
    // y solved, not guessed: the sole plate's outer fillet reaches 0.0371 below
    // the foot group's origin (0.012 half-thickness + the 0.005 rim roll, under
    // the 0.055-thick top plate's own 0.0245 drop). At the old -0.3525 the sole
    // sank 9.6 mm THROUGH the floor plane and the character read as standing in
    // the ground. -0.3429 puts the lowest vertex at y = +0.0000.
    // ROUND-3: pushed 0.065 m FORWARD. The belly's underside now turns under at
    // y = 0.105 and its lower front is tucked back to a 0.92 forward factor, so
    // the toe tips clear the overhang by ~0.05 m and the two amber tabs — and
    // the 0.075 m notch between them — actually register from the front. In r2
    // the belly's front reached x = 0.37 at foot height and swallowed them whole.
    foot.position.set(0.155, -0.3429, 0)
    foot.rotation.y = -0.157 * side
    leg.add(foot)
    // Hidden leg stub, hoodDeep so an exposed `launched` frame reads as shadow
    // rather than as a chicken leg. It now leans FORWARD from the hip socket to
    // the ankle under the new foot position, and the last 0.05 m doubles as the
    // ambient-occlusion core under the belly overhang: the feet sit in shadow,
    // which is what makes the amber read as a lit accent instead of a sticker.
    leg.add(mesh(splineTube([
      [-0.020, -0.040, 0], [0.040, -0.160, 0], [0.115, -0.268, 0], [0.150, -0.312, 0],
    ], 0.079, 14, (t) => 0.079 * (1 - 0.18 * t * t), { radialSeg: 12, roundStart: true, roundEnd: true }),
    hoodDeepM))
    foot.add(mesh(footTop, amberM))
    // sole + web grooves + claw nubs: beakDeep, real penguin anatomy (three
    // large webbed toes plus a vestigial hallux at the heel)
    foot.add(mesh(rotated(rotated(plate(footOutline(0.286, 0.146, 3, { toeDepth: 0.92 }),
      0.012, 0.005, { rimSeg: 2 }), -Math.PI / 2, 0, 0), 0, -Math.PI / 2, 0),
    amberDeepM, 0, -0.0245, 0))
    // ROUND-2: the web grooves were 0.010-tall slabs sitting PROUD of the top
    // surface, which at gameplay distance read as dark speckles ("mould"). They
    // are now sunk 0.004 m INTO the crown of the foot and stop 0.030 m short of
    // the toe tips, so the web reads as web and the toes stay one form.
    for (const g of [1, -1]) {
      foot.add(mesh(splineTube([
        [0.042, 0.0242, 0.0265 * g], [0.090, 0.0262, 0.0290 * g], [0.118, 0.0250, 0.0300 * g],
      ], 0.0055, 8, null, { radialSeg: 6, roundEnd: true }), amberDeepM))
    }
    // three blunt forward-pointing claws (real penguin anatomy; the source's
    // feet are two featureless rounded tabs — deviation §9.8)
    for (const t of [-1, 0, 1]) {
      foot.add(mesh(superellipsoid(0.021, 0.0085, 0.0115, 2.2, 2.2, 14), amberDeepM,
        0.1435, 0.0125, t * 0.0455, 0, 0, -0.16))
    }
    // vestigial hallux at the heel, visible only from behind
    foot.add(mesh(superellipsoid(0.019, 0.010, 0.013, 2.3, 2.3, 12), amberDeepM,
      -0.110, 0.011, -0.020 * side))
    mergeStatic(foot)   // 8 static meshes -> 2 draw calls, per foot
  }

  // --- torso — the belly of the exchange ------------------------------------
  const torso = pivot(hips, 0, 0.14, 0)
  bones.torso = torso

  // `belly` (extra bone) drives the non-uniform jiggle scale on the lower body.
  // Parked at the body's visual centre of mass so a scale reads as a wobble and
  // not as a growth spurt. Underdamped by design: the belly should still be
  // moving when the recovery frames end.
  const BELLY_Y = 0.56
  const belly = pivot(torso, 0, BELLY_Y - TORSO_Y, 0)
  bones.belly = belly
  const bodyOff = -BELLY_Y      // geometry is authored in WORLD y

  // THE BIG EGG. Widest at y = 0.32 — a pendulum bob hung under the rig. The
  // back is a single unbroken convex arc from occiput to tail root: no shoulder
  // blade, no spine groove, no waist, ever.
  belly.add(mesh(paramSurface((u, v) => {
    const y = lerp(BODY_TOP, BODY_BOT, 0.5 - 0.5 * Math.cos(v * Math.PI))
    return bodyAt(y, u * TAU)
  }, 40, 28, { name: 'bodyEgg' }), hoodM, 0, bodyOff, 0))

  // THE INSET CREAM ISLAND. Real geometry sitting 6 mm proud of the shell with a
  // 4 mm hoodDeep paint-edge shadow under its rim, so the paint edge catches
  // light the way moulded vinyl paint does — not a lighter ball jammed in.
  //
  // It closes at BOTH ends now (a rounded point at y = 0.175, an apex on the
  // head at y = 1.462) and its widest half-width is 0.232 against a body
  // half-width of 0.475. Against r2's 0.290 on a CIRCULAR section that is the
  // whole "dipped half in paint" fix: measured off the built mesh, the hood now
  // owns ~50 mm of the outline on the near flank at a 45-degree azimuth where
  // r2 owned 0 mm, and ~62 mm at 20 degrees where r2 owned 0 mm on one side.
  const creamPush = (y) => 0.006 + 0.004 * smoothstep((y - 0.86) / 0.20)
  belly.add(mesh(shieldPatch((y, z, p) => bodyFrontAt(y, z, p),
    (y) => bellyCreamW(y) * 1.04 + 0.0065, 1.004, 0.171,
    0.0035, 26, 20), hoodDeepM, 0, bodyOff, 0))
  belly.add(mesh(shieldPatch((y, z) => bodyFrontAt(y, z, creamPush(y)),
    bellyCreamW, 1.000, 0.175, 0, 26, 20), creamM, 0, bodyOff, 0))
  // A soft bellyShade core shadow INSIDE the island's lower point, following the
  // island's own boundary rather than cutting a horizontal band across it. r2's
  // version was a straight-edged strip at y = 0.13-0.215 and it read as a hem
  // seam on a knitted sweater; this one is the same ogive shape 4% smaller, so
  // its edge is parallel to the cream's edge everywhere and reads as turn-under.
  belly.add(mesh(shieldPatch((y, z) => bodyFrontAt(y, z, creamPush(y) - 0.0012),
    (y) => bellyCreamW(y) * 0.90, 0.268, 0.178, 0, 20, 8), shadeM, 0, bodyOff, 0))

  // The vinyl parting-line seam: 1.3 mm, on the REAR centreline only, and now
  // sunk 0.4 mm rather than standing 4 mm proud — r2's version was a raised
  // ridge that caught a bright specular and read as a scratch.
  {
    const seam = []
    for (let i = 0; i <= 14; i++) {
      const y = lerp(0.98, 0.20, i / 14)
      const p = bodyAt(y, Math.PI)
      seam.push([p[0] + 0.0004, y + bodyOff, 0])
    }
    belly.add(mesh(splineTube(seam, 0.0013, 26, null, { radialSeg: 5 }), hoodDeepM))
  }
  // `belly` carries no child bones, so its five shells (egg, paint-edge shadow,
  // cream island, core shadow, parting seam) never move relative to each other:
  // 5 draw calls collapse to 4. mergeStatic bakes into the bone's local frame,
  // so the jiggle scale still lands on all of it.
  mergeStatic(belly)

  // --- knit scarf (extra bone `scarf`) --------------------------------------
  // ROUND-3 REBUILD. r2 shipped this as a matte near-black rubber tube that went
  // all the way round, plus two vertical shoulder straps — the three of them
  // together read as a BONDAGE HARNESS, they were the second-darkest value on
  // the model so they stole the eye from the eyeInk domes, and the closed ring
  // cut straight across the cream shield that must stay unbroken and across the
  // flipper crescent that must stay clean.
  //
  // It is now an OPEN teal knit band wrapped round the BACK ONLY: 151 degrees of
  // arc from psi 104.4 to 255.6, tapering to nothing at both ends. That arc is
  // chosen by two hard constraints and nothing else. It stops 64 degrees short
  // of the cream island's edge (which is at psi 40 at this height), so the one
  // unbroken bright shape stays unbroken; and it never reaches the flanks at
  // psi 90 / 270 where the flipper roots break the surface, so it cannot pass
  // through a flipper root the way r2's closed ring did. Its right-hand end dies
  // at (-0.161, 0.950, -0.307), which is exactly where the trailing end is
  // rooted, so the two read as one garment. 16 ribs and a real knit map make it
  // the one region on this fighter that does NOT look moulded — and that
  // contrast is what proves everything else is vinyl.
  // COLLAR HEIGHT, and it is a silhouette decision, not a wardrobe one. Measured
  // off the built mesh: at y = 0.950 the band's own tube topped out at 0.996 and
  // reached 0.338 m of half-width, which is WIDER than the skull (0.275) at the
  // shelf and wider than the body (0.256) below it — so the scarf filled the
  // head/shoulder notch completely and the front read went back to one
  // continuous lump, which is exactly the rear-silhouette failure the round-3
  // review opened with. Dropped to 0.905 the tube tops out at 0.951, the notch
  // at y = 0.975 is bare, and the two-egg fusion reads from every azimuth.
  // It cannot foul the flipper roots at that height either: the band's ends die
  // at psi 104.4 / 255.6 deg, which is x = -0.180, and the flipper root section
  // ends at x = -0.130 — 0.050 m of clearance, with the tube tapered to nothing
  // over the last 21 deg of arc on top of that.
  const COLLAR_Y = 0.905
  // section frame on the body's actual surface: outward normal + meridian
  // tangent, so a 0.044 tube hugs a steeply sloping dome instead of floating off
  // it above and cutting into it below (r2's tube was horizontal and did both).
  const collarFrame = (psi) => {
    const s = bodyAt(COLLAR_Y, psi)
    const a = bodyAt(COLLAR_Y - 0.012, psi), b = bodyAt(COLLAR_Y + 0.012, psi)
    let T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const tl = Math.hypot(T[0], T[1], T[2]) || 1
    T = [T[0] / tl, T[1] / tl, T[2] / tl]
    let N = [s[0] - BODY_CX, 0, s[2]]
    const nl = Math.hypot(N[0], N[2]) || 1
    N = [N[0] / nl, 0, N[2] / nl]
    const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]
    N = [N[0] - d * T[0], N[1] - d * T[1], N[2] - d * T[2]]
    const l2 = Math.hypot(N[0], N[1], N[2]) || 1
    return [s, [N[0] / l2, N[1] / l2, N[2] / l2], T]
  }
  const collarBand = (out, u0, u1) => paramSurface((u, v) => {
    const uu = lerp(u0, u1, u)
    const psi = lerp(Math.PI * 0.58, Math.PI * 1.42, uu)
    const [s, N, T] = collarFrame(psi)
    // ends taper to a point: a scarf wrapped round the back, not a cut pipe
    const k = Math.sin(Math.min(1, Math.min(uu, 1 - uu) / 0.14) * Math.PI / 2)
    const tube = (0.042 + 0.0058 * Math.cos(16 * psi)) * k
    const b = v * TAU
    const rr = 0.004 + out + tube * Math.cos(b), tt = tube * Math.sin(b)
    return [s[0] + N[0] * rr + T[0] * tt, s[1] + N[1] * rr + T[1] * tt,
      s[2] + N[2] * rr + T[2] * tt]
    // flip: the section walks CCW while u runs around the body, so tu x tv
    // points INTO the tube.
  }, Math.max(8, Math.round((u1 - u0) * 52)), 12, { name: 'collar', flip: true })
  const softGoods = new THREE.Group()
  torso.add(softGoods)
  softGoods.add(mesh(collarBand(0, 0, 1), knitM, 0, -TORSO_Y, 0))
  // two knitCream end-stripes, 0.030 m wide, 1.6 mm proud — the same trick as
  // the hood/cream paint edge: same surface, offset, so they cannot gap
  softGoods.add(mesh(collarBand(0.0016, 0.175, 0.235), knitCreamM, 0, -TORSO_Y, 0))
  softGoods.add(mesh(collarBand(0.0016, 0.765, 0.825), knitCreamM, 0, -TORSO_Y, 0))

  // one trailing end, routed BEHIND the flipper root so it never crosses the
  // flipper crescent (the crescent must stay a clean negative shape)
  // rooted 0.040 m lower with the band, so the trailing end still leaves the
  // garment at the band's own right-hand end (-0.161, 0.885, -0.307) instead of
  // sprouting out of the bare body above it
  const scarf = pivot(torso, -0.170, 0.885 - TORSO_Y, -0.300)
  bones.scarf = scarf
  const scarfSwing = bent(scarf, -0.16, 0.22, 0)
  scarfSwing.add(mesh(loft([
    { y: -0.320, shape: roundedRectPoints(0.030, 0.110, 0.013, 3) },
    { y: -0.230, shape: roundedRectPoints(0.030, 0.126, 0.014, 3), offset: [0.018, 0.012] },
    { y: -0.120, shape: roundedRectPoints(0.031, 0.130, 0.014, 3), offset: [0.012, -0.010] },
    { y: -0.020, shape: roundedRectPoints(0.032, 0.128, 0.014, 3) },
    { y: 0.040, shape: roundedRectPoints(0.034, 0.120, 0.014, 3) },
  ], { subdivide: 2, ringPoints: 22 }), knitM))
  for (let i = 0; i < 7; i++) {
    scarfSwing.add(mesh(splineTube([
      [0.008 * i, -0.322, -0.050 + i * 0.0167],
      [0.010 + 0.008 * i, -0.352, -0.052 + i * 0.0167],
      [0.006 + 0.008 * i, -0.366, -0.054 + i * 0.0167],
    ], 0.0075, 6, null, { radialSeg: 5, roundEnd: true }), knitCreamM))
  }
  // 8 meshes (tail + 7 fringe tabs) -> 2. The fringe is the whole reason the
  // scarf reads as knitted rather than moulded, and it was costing 7 draw calls.
  mergeStatic(scarfSwing)

  // --- wings — flippers out for balance, in for VIOLENCE ---------------------
  // There are no shoulders and no elbows: the roots are surface attachments and
  // ALL bend is silhouette-shaped. Length 0.360 (0.225 H) — real penguin
  // flippers run ~37% of body length, so this is a deliberate 40% shortening.
  // That shortening IS the cartoon. Held 22 deg out so the crescent between the
  // flipper and the flank never closes; if it closes he reads as a legless egg.
  //
  // ROUND-2 REBUILD. r1 hung a straight loft off a root at z = +-0.374, which is
  // 0.027 m OUTSIDE the body surface at that height — hence the black void at
  // the root the critic saw — and then splayed it with a rigid rotation. A
  // straight flipper cannot hold a crescent against this body: the belly flares
  // outward below the root faster than any single rotation can outrun, so the
  // negative shape pinched shut at mid-length exactly where the spec wants it
  // widest. The pale `plate` on the inner face read as a rolled newspaper from
  // the match camera, the cream tip cap read as a bandage, and the 0.098 m
  // `filletRing` "AO seam" read as a black wire carry-handle.
  //
  // The flipper is now ONE swept paddle on a CURVED centreline: it leaves the
  // body at ~58 deg (over the shoulder bulge) and settles to ~23 deg at the tip,
  // which holds a clean crescent of 0.056 -> 0.091 m of background between the
  // paddle and the flank down the whole length. Root sits 0.017 m INSIDE the
  // surface and the section collapses into the body, so there is no seam to see.
  // ROUND-3: the centreline leaves the flank harder and reaches 0.335 m out (was
  // 0.232), and the section is 17% thicker at every station. r2's paddle held a
  // 0.026-0.050 m crescent that closed to nothing from the rear, so the figure
  // read as a legless egg from the gameplay-distance lineup; this one holds
  // 0.080 m at the top of the crescent widening to 0.15 m at the tip, and the
  // tip clears the body's widest point by 0.16 m so it breaks the rear outline.
  const flipY = curve([[0, 0.012], [0.20, -0.038], [0.45, -0.135], [0.70, -0.248], [1, -0.362]])
  const flipZ = curve([[0, -0.020], [0.12, 0.080], [0.30, 0.192], [0.55, 0.262], [0.78, 0.294], [1, 0.312]])
  const flipX = curve([[0, 0.014], [0.50, -0.004], [1, -0.028]])
  const flipC = curve([[0, 0.206], [0.35, 0.190], [0.70, 0.164], [1, 0.138]])   // chord (X)
  const flipT = curve([[0, 0.105], [0.35, 0.085], [0.70, 0.062], [1, 0.042]])   // thickness
  const sp = (v, p) => (v < 0 ? -Math.pow(-v, p) : Math.pow(v, p))
  /**
   * The paddle surface. `side` mirrors in Z. `e` offsets the section outward, so
   * the inner-face and trailing-edge colour blocks are the SAME surface 1.5 mm
   * proud — moulded paint, not stuck-on plates that can gap.
   * u traces the section: 0 = leading edge (+X), 0.25 = outer face,
   * 0.5 = trailing edge (-X), 0.75 = inner face (body side).
   */
  const flipper = (side, e = 0, u0 = 0, u1 = 1, v0 = 0, v1 = 1, cols = 30, rows = 24) =>
    paramSurface((uu, vv) => {
      const u = lerp(u0, u1, uu), v = lerp(v0, v1, vv)
      let t = v, k = 1, adv = 0
      if (v < 0.05) { const q = v / 0.05; t = 0; k = Math.sin(q * Math.PI / 2); adv = -0.030 * Math.cos(q * Math.PI / 2) }
      else if (v > 0.94) { const q = (v - 0.94) / 0.06; t = 1; k = Math.cos(q * Math.PI / 2); adv = 0.030 * Math.sin(q * Math.PI / 2) }
      else t = (v - 0.05) / 0.89
      // Everything below is built for the LEFT flipper and mirrored in z on the
      // way out (with paramSurface's `flip`, which reverses the winding and the
      // normals). Mirroring the maths instead would flip the handedness of the
      // section frame and put the hoodLight inner face on the outside.
      const P = [flipX(t), flipY(t), flipZ(t)]
      const d = 0.004
      const t0 = Math.max(0, t - d), t1 = Math.min(1, t + d)
      const T = [flipX(t1) - flipX(t0), flipY(t1) - flipY(t0), flipZ(t1) - flipZ(t0)]
      const tl = Math.hypot(T[0], T[1], T[2]) || 1
      T[0] /= tl; T[1] /= tl; T[2] /= tl
      // chord axis: +X projected perpendicular to the tangent
      const dp = T[0]
      const R = [1 - dp * T[0], -dp * T[1], -dp * T[2]]
      const rl = Math.hypot(R[0], R[1], R[2]) || 1
      R[0] /= rl; R[1] /= rl; R[2] /= rl
      const N = [T[1] * R[2] - T[2] * R[1], T[2] * R[0] - T[0] * R[2], T[0] * R[1] - T[1] * R[0]]
      const a = u * TAU
      const cx = sp(Math.cos(a), 0.69), cy = sp(Math.sin(a), 0.69)
      // 8 deg leading-edge-down twist so a rim light rakes the length, and a
      // 6 deg concave sweep in the trailing edge: with no elbow, ALL the bend
      // has to be silhouette-shaped or the paddle reads as rigid plastic.
      const tw = -0.14 * t
      const cxr = cx * Math.cos(tw) - cy * Math.sin(tw)
      const cyr = cx * Math.sin(tw) + cy * Math.cos(tw)
      const chord = flipC(t) * 0.5 * k
      const thick = flipT(t) * 0.5 * k * (0.62 + 0.38 * (1 + cxr) * 0.5)
      const cc = chord * cxr - 0.020 * t * (1 - cxr) * 0.5   // trailing-edge concavity
      const off = e * k
      const px = P[0] + T[0] * adv + R[0] * (cc + off * cxr) + N[0] * (thick + off * cyr)
      const py = P[1] + T[1] * adv + R[1] * (cc + off * cxr) + N[1] * (thick + off * cyr)
      const pz = P[2] + T[2] * adv + R[2] * (cc + off * cxr) + N[2] * (thick + off * cyr)
      return [px, py, pz * side]
    }, cols, rows, { name: 'flipper', flip: side < 0 })
  for (const side of [1, -1]) {
    // z = +-0.300: the body's half-width at y = 0.905 is 0.363, so the root is
    // 0.063 m inside the surface. There are no shoulders on this character —
    // the flipper roots are surface attachments, and they have to be UNDER the
    // surface or the attachment is a hole.
    //
    // ROOT HEIGHT IS A HEAD-SIZE DECISION. The root section is 0.105 m thick and
    // its normal is (0, 0.66, 0.74), so a root at y = 0.930 put the top of the
    // paddle at y = 0.992 — ABOVE the head/body crossing at 0.975 — and measured
    // off the built mesh the flipper, not the body, was what cropped the skull:
    // the visible head bottom landed at 0.99 (2.62 head-heights) instead of at
    // the crossing (2.56). That is the brief's own warning that "the flippers
    // currently sprout from the head's shelf". At 0.905 the paddle tops out at
    // 0.967, the shelf notch belongs to the two eggs again, and the flipper
    // roots sit below it where the brief puts them. It also clears the collar,
    // whose arc dies at x = -0.180 while the root section ends at x = -0.130.
    const arm = pivot(torso, -0.030, 0.905 - TORSO_Y, 0.300 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    arm.add(mesh(flipper(side), hoodM))
    // ROUND-3: the hoodLight inner face is now a NARROW sliver (u 0.66-0.86,
    // was 0.585-0.915) and it stops short of the tip. Periwinkle at 0.53
    // luminance is a Tier-B value on a Tier-C part: the more of it there is, the
    // more the flipper dissolves into a pale arena instead of reading as part of
    // the dark frame that wraps the silhouette. The outer face and the leading
    // edge are hoodMid, full stop.
    arm.add(mesh(flipper(side, 0.0015, 0.660, 0.860, 0.14, 0.88, 10, 14), hoodLightM))
    // cream on the TRAILING EDGE and the last 0.06 m only, per spec — not a cap
    arm.add(mesh(flipper(side, 0.0018, 0.462, 0.538, 0.42, 0.965, 7, 12), creamM))
    // the 0.015 m hoodDeep AO seam at the root: a SEAM, not a hoop
    arm.add(mesh(flipper(side, 0.0022, 0, 1, 0.075, 0.115, 26, 4), hoodDeepM))
  }

  // BIG WRENCH — hidden in the right flipper until Wrench Strike needs it.
  // The only metal on the model; that contrast is worth keeping. Every edge
  // bevelled at 6 mm and re-materialled to brushed steel.
  {
    const wrench = new THREE.Group()
    // re-seated on the new curved flipper: the centreline at t = 0.92 sits at
    // arm-local (-0.024, -0.317, -0.228) for armR, so the handle now reads as
    // HELD at the paddle's tip instead of floating 0.23 m inboard of it (the
    // flipper used to hang straight down the flank; it no longer does).
    wrench.position.set(-0.012, -0.320, -0.278)
    wrench.rotation.set(0, 0, 0.35)
    wrench.add(slab(0.058, 0.46, 0.058, 0.014, metalM, 0, -0.09, 0))
    wrench.add(slab(0.150, 0.090, 0.066, 0.012, metalM, -0.030, 0.185, 0))
    wrench.add(slab(0.150, 0.090, 0.066, 0.012, metalM, 0.072, 0.272, 0, 0, 0, 0.5))
    wrench.add(mesh(blob(0.038, 16), metalM, 0, -0.300, 0))
    wrench.add(mesh(filletRing(0.036, 0.008, 6, 16), amberDeepM, 0, -0.250, 0))
    // 5 -> 2. The noMerge flag has to be re-stamped on the MERGED meshes:
    // mergeParts reads it per-mesh, so a flag left only on the group would let a
    // scene-wide auto-merge pass swallow a body that toggles `visible` every
    // Wrench Strike and bake it permanently into the arena.
    mergeStatic(wrench)
    wrench.traverse((o) => { if (o.isMesh) o.userData.noMerge = true })
    wrench.visible = false
    wrench.userData.noMerge = true
    bones.armR.add(wrench)
    bones.armR.userData.wrench = wrench
  }

  // --- head ------------------------------------------------------------------
  // The head is 40% of total height and pivots about its OWN CENTRE, so
  // hitHeavy's 0.65 rad swivels the skull in its socket instead of tearing it
  // out of the body. There is no neck and no vertical section between the two
  // masses — the visible junction is a shelf at y ~ 0.985 with the body flaring
  // 0.05 m wider than the skull immediately below it. That flare is the
  // re-entrant shoulder step; it is what makes the two-egg fusion legible from
  // behind, where r2 read as an undifferentiated urn.
  const head = pivot(torso, 0.02, HEAD_Y - TORSO_Y, 0)
  bones.head = head
  // Everything that is rigidly part of the skull goes in `headSkin` — skull,
  // the two shield shells, the moulding details, the beanie and its two bands.
  // It gets merged at the end of this block. `head` itself keeps only the parts
  // that ANIMATE independently (eyes, lids, brows, beak, beakLower, goggles,
  // pom), which is exactly what mergeStatic must never swallow.
  const headSkin = new THREE.Group()
  headSkin.name = 'headSkin'
  head.add(headSkin)
  headSkin.add(mesh(paramSurface((u, v) => headAt(u, v), 44, 30, { name: 'skull' }), hoodM))
  // THE INVERTED U. Apex on the centreline at y = 1.462, widest 0.510 m across
  // at y = 1.18, temple low point y = 1.13 — so the hood comes DOWN between each
  // eye and the outline, and that frame is the collection's face more than the
  // eyes are. It runs on past the merge plane to y = 0.965, where the skull is
  // 0.162 m wide against a 0.293 m body and is therefore completely buried: r2's
  // horizontal crease at the chin is gone because there is no longer a chin
  // terminator, only an overlap with the belly island whose width matches the
  // shield's to the millimetre at every height in the overlap.
  headSkin.add(mesh(shieldPatch((y, z, p) => headFaceAt(y, z, p),
    (y) => shieldW(y) * 1.04 + 0.0055, 0.188, -0.311, 0.0032, 24, 20), hoodDeepM))
  headSkin.add(mesh(shieldPatch((y, z) => headFaceAt(y, z, 0.0080),
    shieldW, 0.182, -0.315, 0, 24, 20), creamM))
  // the 0.006 crown parting-line pinhole and the two moulding-vent dimples at
  // the ear position. Nobody names them; everyone feels them.
  headSkin.add(mesh(blob(0.0055, 8), hoodDeepM, ...headAt(0.5, 0.02, -0.002)))
  for (const side of [1, -1]) {
    const p = headFaceAt(-0.050, 0.238 * side, -0.003)
    headSkin.add(mesh(blob(0.0058, 8), hoodDeepM, p[0], p[1], p[2]))
  }
  {
    const seam = []
    for (let i = 0; i <= 10; i++) seam.push(headAt(0.5, 0.16 + (i / 10) * 0.62, 0.0012))
    headSkin.add(mesh(splineTube(seam, 0.0014, 20, null, { radialSeg: 5 }), hoodDeepM))
  }

  // --- eyes ------------------------------------------------------------------
  // Centres at y = 1.215 — BELOW the head's vertical midline. Every degree they
  // drift upward the character ages five years. Solid-black glossy domes, no
  // visible sclera in neutral (a white eyeball with a small pupil is a
  // completely different character from a completely different collection).
  //
  // ROUND-2 REBUILD. r1 buried the eye: the dome was a 0.056 sphere whose centre
  // sat 0.043 BEHIND the face surface, so once the cream shield was pushed 0.0085
  // proud the visible black disc measured 0.075 m — 72% of spec — and the
  // catchlight, at head-local x 0.3128 against a shield at 0.3184, was *inside
  // the face*. From any distance the character read as blind.
  //
  // The eye is now a flattened dome (0.032 deep x 0.104 across) whose centre sits
  // EXACTLY ON the raw skull surface. Half of it is inside the head, so there is
  // no seam; the other half stands 0.0235 m proud of the cream, which is what
  // catches the rim light and stops it reading as a painted dot. Because the face
  // is convex the disc opens out to ~0.108 at the silhouette — 15% of head width,
  // ~6 px at 128, exactly the source figure's 0.128 HW measurement.
  // The dome stays a SPHERE — a flattened one cannot carry a lid, because the
  // lid bone has to be the rotation node and three.js composes T*R*S, so a
  // non-uniform scale above the rotation is impossible without a second bone.
  // A concentric spherical lid shell sits 0.0017 outside the eye at every angle
  // and vanishes behind the equator at rest, which is exactly what is wanted.
  const EYE_R = 0.056
  const EYE_SINK = 0.0208       // centre BEHIND the raw skull surface. Solved:
  //   visible disc = 2*sqrt(R^2 - sink^2) = 0.1040 m = 0.145 x HW, the source
  //   figure's measured 0.128 HW plus our deliberate margin, and the dome then
  //   stands 0.0267 m proud of the cream shield (which itself sits 0.0085
  //   proud). r1 sank the same sphere 0.0429 and the disc measured 0.075 with
  //   the catchlight INSIDE the face — that is why the character read as blind.
  const EYE_SPLAY = 0.35        // rad: the eye faces 20 deg outboard, so the
  //                               PROFILE camera (the match camera) gets a
  //                               near-frontal read on the near eye.
  const eyeBall = superellipsoid(EYE_R, EYE_R, EYE_R, 2, 2, 26)
  // Lid shells stay spherical (uniform radius): a non-uniform scale would have
  // to sit above the rotation node to stay aligned, and the bone must be the
  // rotation node. At rest the whole cap is inside the skull.
  const lidCap = paramSurface((u, v) => {
    const th = v * 1.606, a = u * TAU        // cap to 92 deg from the pole
    const s = Math.sin(th)
    return [0.0575 * s * Math.cos(a), 0.0575 * Math.cos(th), 0.0575 * s * Math.sin(a)]
  }, 22, 8, { name: 'lidCap' })
  // THE BOUNCE LINE. r2 shipped a 0.104 x 0.016 m cream lozenge floating under
  // each eye — 0.4 x the eye disc, 40x the specified width — and it was the
  // first thing the eye found on the face: it read as the black dome CHIPPING
  // OFF, which a stranger calls a bug before they call it a character.
  //
  // It is now a 2.6 mm arc lying ON the dome (radius EYE_R + 0.9 mm), spanning
  // polar 61.3-63.9 deg from the eye axis — inside the visible rim at 68.2 deg —
  // and only +-17.8 deg of azimuth around straight down, so it can never
  // separate into a visible dash. bellyShade at 35%, not bellyCream at 100%.
  const bounceArc = paramSurface((u, v) => {
    const phi = lerp(-0.311, 0.311, u)
    const th = lerp(1.070, 1.116, v)
    const r = EYE_R + 0.0009
    const s = Math.sin(th) * r
    return [Math.cos(th) * r, -s * Math.cos(phi), s * Math.sin(phi)]
  }, 16, 2, { name: 'bounceArc' })
  for (const side of [1, -1]) {
    // anchored ON the measured skull surface, not guessed: y = 1.215 world
    // (0.065 BELOW the head's midline — every degree upward ages him five years)
    // and z = +-0.148 (0.41 x HW apart).
    const p0 = headFaceAt(-0.065, 0.148 * side, 0)
    const L = Math.hypot(p0[0], p0[1], p0[2]) || 1
    const p = [p0[0] * (1 - EYE_SINK / L), p0[1] * (1 - EYE_SINK / L), p0[2] * (1 - EYE_SINK / L)]
    const eye = pivot(head, p[0], p[1], p[2])
    eye.rotation.y = -EYE_SPLAY * side
    eye.add(mesh(eyeBall, eyeM))
    // Primary catchlight at 10-11 o'clock (mirrored) and the dim rimIce bounce
    // at 4-5. Both are seated ON the dome's outer surface, solved from the
    // ellipsoid, so they can never sink into the face again. The second, dimmer
    // highlight is what separates a glossy vinyl eye from a flat black sticker
    // and it is the cheapest AAA cue on the whole model.
    eye.add(mesh(blob(0.0115, 14), glassM, 0.0458, 0.026, -0.019 * side))
    eye.add(mesh(blob(0.0050, 10), bounceM, 0.0503, -0.020, 0.017 * side))
    eye.add(mesh(bounceArc, arcM))
    // lid shells: outer surface is hoodMid, so a blink reads as the HOOD
    // sweeping down. Base 1.606 rad parks the cap edge exactly tangent to the
    // top of the disc = 0% coverage; drive lidL/lidR z NEGATIVE to close
    // (-1.57 ~ 50%, -3.14 = shut).
    const lid = pivot(eye, 0, 0, 0)
    bones[side === 1 ? 'lidL' : 'lidR'] = lid
    bent(lid, 1.606).add(mesh(lidCap, hoodM))
    // lower lid, static at 8% — this is where the hurt-pose "><" comes from
    bent(eye, 1.786).add(mesh(lidCap, hoodM))
  }

  // --- brows (our own invention: the source has none) ------------------------
  // Rounded wedges parked INSIDE the hood's front edge, invisible at neutral,
  // so the default read stays "friendly toy" and you still get a fighting-game
  // face when you slide them down and out for angry / hurt.
  const browWedge = roundedBox(0.026, 0.028, 0.115, 0.009, 3)
  for (const side of [1, -1]) {
    const p = headFaceAt(0.115, 0.150 * side, -0.014)
    const brow = pivot(head, p[0], p[1], p[2])
    bones[side === 1 ? 'browL' : 'browR'] = brow
    brow.add(mesh(browWedge, hoodDeepM))
  }

  // --- beak ------------------------------------------------------------------
  // 0.085 m of projection on a 1.60 m fighter is 5.3% — very nearly
  // anatomically correct. It only LOOKS comically tiny because the head is
  // 2.7x oversized. That is the joke; never enlarge it to "make it read".
  // There is no muzzle plane: this is a stuck-on wedge with no snout behind it.
  //
  // ROUND-2 REBUILD. r1 shipped the beak as FOUR separate lofts — an upper
  // wedge, a nail chevron floating on the culmen, a razor groove sliver and a
  // lower wedge — each with its own cross-section table. Between them the cream
  // showed through and a stranger read "moustache plus goatee", not "beak".
  //
  // There is now ONE swept form. Both mandibles are generated by the SAME
  // section function (`beakSection`) walking the SAME width / culmen / gonys
  // curves, so at rest their outer surfaces are continuous to the millimetre and
  // the only thing between them is a single 0.004 m groove. The nail is not a
  // separate part either: it is the same surface offset 0.0016 m outward over
  // the forward 26% of the culmen, i.e. moulded paint, exactly like the hood
  // boundary. Base plants at head-local x = 0.286 (0.045 INSIDE the face plane
  // at 0.331, so there is no seam at any head rotation) and the tip lands at
  // head-local 0.414 = world x 0.434 — 0.083 m clear of the face, the number the
  // silhouette spec calls element #1.
  //
  // ROUND-3, and the diagnosis was specific: at 30 cm r2's beak read as a
  // taped-on bowtie. Three causes, all fixed here.
  //   (a) The 0.004 m mandible groove was an OPEN GAP with nothing behind it, so
  //       the cream face shield showed straight through it. That is the
  //       "cream-and-brown crossed lozenge" — it was the face, seen through the
  //       mouth. The groove is now 0.0018 m and is FILLED by a third swept form
  //       in beakDeep, recessed 0.0018 m, so the split reads as one dark line
  //       that is darker than the beak, never lighter.
  //   (b) The nail was a u-limited patch on the culmen, which projects as a
  //       chevron — a dark V slashed across the bill. It now wraps the whole
  //       section over the forward 22% of the upper mandible: a black-tipped
  //       bill, which is real gentoo anatomy.
  //   (c) roughness 0.155 under a 0.60 clearcoat gave a clipped white hole
  //       instead of a lobe (see amberM: now 0.30 / 0.35).
  const BEAK_X0 = 0.286, BEAK_LEN = 0.138, BEAK_SFACE = 0.348
  const beakWide = curve([[0, 1], [0.30, 0.83], [0.60, 0.596], [0.85, 0.33], [1, 0.096]])
  const beakTop = curve([[0, -0.0736], [0.35, -0.0862], [0.70, -0.1010], [1, -0.1150]])
  const beakBot = curve([[0, -0.1470], [0.35, -0.1400], [0.70, -0.1310], [1, -0.1210]])

  /** Arc-length walk of a rounded rectangle, CCW from (+hz, 0). Exact flats,
   *  exact quarter-arcs, C1 everywhere — the section that makes a beak read as
   *  a moulded wedge instead of a cone. `e` offsets the whole ring outward. */
  const rrEdge = (u, hz, hy, r, e = 0) => {
    const HZ = hz + e, HY = hy + e
    const rr = Math.max(1e-5, Math.min(r + e, HZ - 1e-5, HY - 1e-5))
    const a = HZ - rr, b = HY - rr, q = 0.5 * Math.PI * rr
    const P = 4 * (a + b + q)
    let s = (u - Math.floor(u)) * P
    if (s < b) return [HZ, s]
    s -= b
    if (s < q) { const t = s / rr; return [a + rr * Math.cos(t), b + rr * Math.sin(t)] }
    s -= q
    if (s < 2 * a) return [a - s, HY]
    s -= 2 * a
    if (s < q) { const t = s / rr; return [-a - rr * Math.sin(t), b + rr * Math.cos(t)] }
    s -= q
    if (s < 2 * b) return [-HZ, b - s]
    s -= 2 * b
    if (s < q) { const t = s / rr; return [-a - rr * Math.cos(t), -b - rr * Math.sin(t)] }
    s -= q
    if (s < 2 * a) return [-a + s, -HY]
    s -= 2 * a
    if (s < q) { const t = s / rr; return [a + rr * Math.sin(t), -b - rr * Math.cos(t)] }
    return [HZ, -b + (s - q)]
  }

  /** One mandible's cross-section at travel `s` (0 = embedded base, 1 = tip).
   *  `part`: 1 = upper, 0 = lower, 2 = the dark groove filler that spans the
   *  split so the cream face can never show through the mouth. */
  const beakSection = (part, s, u, e = 0) => {
    const f = clamp01((s - BEAK_SFACE) / (1 - BEAK_SFACE))
    const W = 0.052 * beakWide(f)
    const yT = beakTop(f), yB = beakBot(f)
    const ySplit = yB + 0.4 * (yT - yB)               // 40% up from the gonys
    const lo = part === 1 ? ySplit + 0.0009 : part === 2 ? ySplit - 0.0075 : yB
    const hi = part === 1 ? yT : part === 2 ? ySplit + 0.0075 : ySplit - 0.0009
    const halfH = Math.max(0.0012, (hi - lo) / 2)
    const r = Math.min(0.018 * beakWide(f), W * 0.46, halfH * 0.92)
    const [z, dy] = rrEdge(u, W, halfH, r, e)
    // head-on, the split line drops 6 deg at the outer ends: a shallow frown on
    // a beak reads as neutral-friendly. A smile curve reads as a duck.
    return [BEAK_X0 + s * BEAK_LEN, (hi + lo) / 2 + dy - Math.abs(z) * 0.090, z]
  }

  /** The swept mandible, with a collapsed base (buried) and a rounded 0.010 tip.
   *  Nothing on this model may end in a point or in an open ring. */
  const mandible = (part, e = 0, u0 = 0, u1 = 1, v0 = 0, v1 = 1, cols = 26, rows = 20) =>
    paramSurface((uu, vv) => {
      const u = lerp(u0, u1, uu), v = lerp(v0, v1, vv)
      let s, k = 1, dx = 0
      if (v < 0.06) { const t = v / 0.06; s = 0; k = Math.sin(t * Math.PI / 2); dx = -0.014 * Math.cos(t * Math.PI / 2) }
      else if (v > 0.90) { const t = (v - 0.90) / 0.10; s = 1; k = Math.cos(t * Math.PI / 2); dx = 0.006 * Math.sin(t * Math.PI / 2) }
      else s = (v - 0.06) / 0.84
      const p = beakSection(part, s, u, e)
      const c = beakSection(part, s, 0.25, 0)      // section centre reference
      const cy = beakSection(part, s, 0.75, 0)[1]
      const mid = (c[1] + cy) / 2
      return [p[0] + dx, mid + (p[1] - mid) * k, p[2] * k]
      // `flip`: rrEdge walks the section CCW in the (z, y) plane while v runs
      // along +x, so tu x tv points INWARD. Without this the beak is built
      // inside-out: back-face culling drops the near surface and the cream
      // shield wins the depth test, which is why the r2 draft rendered the beak
      // as a 6 mm orange line with two floating nostril dots instead of a wedge.
    }, cols, rows, { name: part === 1 ? 'beakUpper' : part === 2 ? 'beakGroove' : 'beakLower', flip: true })

  const beak = pivot(head, 0, 0, 0)
  beak.add(mesh(mandible(1), amberM))
  // THE NAIL: the SAME surface, 1.4 mm proud, wrapping the whole section over
  // the forward 22% of the upper mandible. A black-tipped bill (real gentoo
  // anatomy, and not the source's — its beak is a closed featureless solid).
  beak.add(mesh(mandible(1, 0.0014, 0, 1, 0.780, 1.0, 22, 6), amberDeepM))
  // THE GROOVE FILLER. Recessed 1.8 mm and 0.015 m tall, so it is a dark line
  // sunk between the mandibles rather than a hole you can see the face through.
  beak.add(mesh(mandible(2, -0.0018, 0, 1, 0.10, 0.94, 20, 12), amberDeepM))
  // two 0.006 nostril dimples at 30% along the culmen, sunk INTO the surface
  for (const side of [1, -1]) {
    const p = beakSection(1, BEAK_SFACE + 0.30 * (1 - BEAK_SFACE), 0.25, -0.0018)
    beak.add(mesh(blob(0.0034, 8), amberDeepM, p[0], p[1], 0.020 * side))
  }
  mergeStatic(beak)   // nail + groove + nostrils share amberDeep: 5 -> 2
  // The mandible split IS the mouth, and it opens: the cheapest anger cue there
  // is. The hinge sits on the split line at the face plane, so at -0.22 rad the
  // tip drops 0.023 m and the groove opens into a wedge instead of shearing.
  const beakLower = pivot(head, 0.300, -0.1176, 0)
  bones.beakLower = beakLower
  beakLower.add(mesh(mandible(0), amberM, -0.300, 0.1176, 0))

  // --- CHUNKY OVAL SHADES on the `goggles` bone (extra bone, kept) ----------
  // The dual read that saves the character: the collection's most-recognised
  // face accessory is a pair of thick pale oval sunglasses, and an inventor
  // pushes his goggles up on his forehead. Same object.
  //
  // The pivot is SOLVED, not guessed. `block` keys goggles z = +0.85 rad, and
  // +Z is counter-clockwise in the XY plane for a +X-facing model (the same
  // sign that makes hitHeavy's head z = +0.65 snap the face UP and back). The
  // unique circle through rest (0.345, 1.400) and blocked (0.355, 1.215) that
  // subtends +0.850 rad puts the hinge at world (0.5543, 1.3185). At 0.85 the
  // lens front lands at x = 0.365, clearing the beak base (0.349) by 0.016.
  // The old build parked them at head+0.28 where +0.85 flung them backwards
  // over the crown — "visor down" was doing the opposite of its comment.
  // ROUND-2 RE-SOLVE. The eye dome now stands 0.0267 m proud of the cream, so
  // r1's blocked lens centre of x = 0.355 would have landed INSIDE it. New pair:
  // rest lens centres (0.325, 1.402) — 0.131 m above the eye centres and 0.080 m
  // above the top of the eye dome, so front / 3-4 / head-on all show two
  // completely unoccluded black domes — and blocked centres (0.381, 1.212),
  // 0.015 m clear of the eye's front face. The hinge is the unique circle centre
  // through those two points subtending +0.850 rad: midpoint (0.353, 1.307),
  // chord 0.19809, d = chord / (2 tan(0.425)) = 0.21845 along the chord normal
  // (0.95917, 0.28271) -> world (0.562521, 1.368751). Verified CCW.
  // At 0.85 rad the bridge lands at (0.3697, 1.2420) and the beak's culmen at
  // that x is 1.198 — 0.044 m of clearance, and the two lens frames sit outboard
  // of the beak in Z entirely (inner edge z = 0.058 vs the beak's 0.052).
  const goggles = pivot(head, 0.542521, 0.088751, 0)
  bones.goggles = goggles
  const shades = pivot(goggles, -0.237521, 0.033249, 0)
  // base tilt: at rest the lens plane lies along the 62-deg forehead; at 0.85
  // it lands 13 deg off vertical, matching the face plane's own 12-deg lean
  const shadeRig = bent(shades, -0.62)
  // ROUND-2: back to the brief's own dimensions — lens 0.115 (Z) x 0.088 (Y) in
  // an 0.018 frame. r1 ran them at 0.178 x 0.132 each and spaced them 0.280
  // apart, which turned two oval shades into one continuous cream band across
  // the forehead and cost the skull another 0.06 m of visible height.
  // ROUND-3: r2's shades read as a HAIRBOW. Three causes, all addressed:
  //   (a) a knitCream frame sitting on a bellyCream forehead has no albedo
  //       separation at all, so only the mint lens registered and the pair read
  //       as two ovals tied on. The frame keeps knitCream (a value match is the
  //       point — it is the SAME palette tier) but now separates by SPECULAR
  //       (roughness 0.18 / clearcoat 0.8, see frameM) AND by a 3 mm hoodDeep
  //       gasket bead running round the outside of each frame, which draws a
  //       real dark outline against the cream at any lighting angle.
  //   (b) the lens had no depth: transmission with thickness 0.05 on an 0.018 m
  //       plate never showed an internal reflection. Thickness now matches the
  //       geometry (0.020) and the lens plate is thicker at 0.022.
  //   (c) the temple arms + a separate elastic-band block poked out over the
  //       skull's edge as two small horns. The band is gone; the arms are 26%
  //       shorter and pulled inboard to z = 0.176, which parks their outermost
  //       vertex ~0.09 m inside the head silhouette at rest.
  const lensPlate = rotated(plate(superellipsePoints(0.117, 0.089, 2.4, 20), 0.022, 0.008,
    { crown: 0.007, faceSeg: 3, rimSeg: 2 }), 0, -Math.PI / 2, 0)
  const framePlate = rotated(plate(superellipsePoints(0.152, 0.124, 2.4, 22), 0.026, 0.010,
    { crown: 0.007, faceSeg: 3, rimSeg: 3 }), 0, -Math.PI / 2, 0)
  const gasketPlate = rotated(plate(superellipsePoints(0.161, 0.133, 2.4, 22), 0.023, 0.009,
    { crown: 0.005, faceSeg: 2, rimSeg: 3 }), 0, -Math.PI / 2, 0)
  for (const side of [1, -1]) {
    shadeRig.add(mesh(gasketPlate, hoodDeepM, -0.004, 0, 0.134 * side))
    shadeRig.add(mesh(framePlate, frameM, -0.002, 0, 0.134 * side))
    shadeRig.add(mesh(lensPlate, lensM, 0.008, 0, 0.134 * side))
    // temple arms sweeping back at 12 deg, terminating in a hoodDeep tip
    shadeRig.add(slab(0.096, 0.024, 0.019, 0.008, frameM, -0.058, -0.008, 0.176 * side, 0, 0.21 * side, 0))
    shadeRig.add(slab(0.038, 0.020, 0.016, 0.007, hoodDeepM, -0.106, -0.006, 0.166 * side, 0, 0.40 * side, 0))
  }
  // Bridge — ARCHED, and arched for a measured reason. The brief's rest-pose
  // bridge (local y = 0.010, 0.038 tall) measured 1.2024-1.2463 world once the
  // `block` pose swung the rig to +0.85 rad, and the upper mandible's culmen
  // tops out at 1.2086 — a 6 mm interpenetration every time he guarded. The
  // brief's instruction for exactly this case is "move the hinge up, not the
  // beak"; raising the hinge enough would have pulled the lenses off the eye
  // centres, so the lift is applied to the bridge alone (local y 0.010 -> 0.034,
  // height 0.038 -> 0.030), which clears the culmen by 13 mm at 0.85 rad and
  // simply sits a little higher on the forehead at rest. The two 0.012 shoulder
  // pads carry the arch across to each frame so it reads as one moulded part.
  shadeRig.add(slab(0.026, 0.028, 0.058, 0.011, frameM, -0.004, 0.032, 0))
  for (const side of [1, -1]) {
    shadeRig.add(slab(0.024, 0.032, 0.044, 0.010, frameM, -0.003, 0.020, 0.056 * side, 0.34 * side, 0, 0))
  }
  // 11 rigid parts -> 3 (frame+arms+bridge, the two lenses, the elastic band).
  // The lens material is the only `transmission` on the fighter, so keeping it
  // to exactly one draw call matters more here than anywhere else.
  mergeStatic(shadeRig)

  // --- KNIT BEANIE + POM (extra bone `pom`, child of `head`) ----------------
  // 12 vertical ribs is the geometry that makes it read as KNIT and not as a
  // helmet at 3 m. Child of `head`, never of `goggles` — it must ride the
  // 0.65 rad skull rotation.
  // ROUND-2: the beanie is now a SKULLCAP, not a bathing cap. r1's brim sat at
  // world y 1.395-1.470 and the scarf collar topped out at 1.07, so only 0.35 m
  // of the 0.64 m skull was visible and the figure measured ~4.5 VISIBLE
  // head-heights against a 2.5 target — worse than the low-poly baseline. The
  // skull geometry was never the problem; the props were hiding it. The brim now
  // sits at y = 1.502 on the centreline and 1.462 at the temples, so 0.54 m of
  // the 0.64 m skull is bare and the head reads at its true 40% of total height.
  const brimY = (th) => 0.222 - 0.040 * Math.abs(Math.sin(th))
  const BRIM_ROLL = 0.017
  const headAtYAz = (y, th, push) => {
    const t = Math.max(-0.9995, Math.min(0.9995, y / HEAD_B))
    return headPush(headShape(t, spow(Math.cos(th), HEAD_PZ), spow(Math.sin(th), HEAD_PZ),
      eggK(t)), push)
  }
  const beanie = (v0, v1, extra) => paramSurface((u, v) => {
    const th = u * TAU
    const vv = lerp(v0, v1, v)
    const bY = brimY(th)
    const rib = 0.009 * (0.5 + 0.5 * Math.cos(12 * th)) * smoothstep(vv * 2.6)
    // the cap stands 0.024 off the skull at the crown and closes to 0.010 at the
    // brim: knit has loft, and without it a cap this shallow reads as a saucer
    // laid on the head rather than as something pulled down over it
    const loft0 = 0.010 + 0.010 * Math.pow(1 - Math.min(1, vv / 0.78), 1.6)
    if (vv <= 0.78) {
      return headAtYAz(lerp(0.3186, bY, vv / 0.78), th, loft0 + rib + extra)
    }
    // THE ROLLED HEM. r1's brim was a flat disc with a paper-thin backfacing
    // edge that caught no light and read as a shower cap. This is a real 0.034 m
    // turn-up: the surface swings out, DOWN and back inside the cap, so the
    // outer edge is a filleted roll that takes a highlight like the rest of the
    // model and there is no open boundary anywhere on the beanie. Rolling
    // downward (not up) is what keeps the hem inside the skull's silhouette —
    // an upward roll at this height overhangs the head and reads as a saucer.
    const a = ((vv - 0.78) / 0.22) * 3.90
    const base = headAtYAz(bY, th, 0.010 + rib + extra)
    const rl = Math.hypot(base[0], base[2]) || 1
    const out = (BRIM_ROLL * 0.60 + rib * 0.4) * Math.sin(a)
    return [base[0] * (1 + out / rl), base[1] - BRIM_ROLL * (1 - Math.cos(a)),
      base[2] * (1 + out / rl)]
  }, 40, Math.max(4, Math.round((v1 - v0) * 28)), { name: 'beanie' })
  headSkin.add(mesh(beanie(0, 1, 0), knitM))
  headSkin.add(mesh(beanie(0.50, 0.575, 0.0016), knitCreamM))
  headSkin.add(mesh(beanie(0.645, 0.715, 0.0016), knitCreamM))
  // 10 rigid skull shells -> 5 draw calls (one per material). The head is the
  // single most-drawn object on the fighter and it never deformed internally.
  mergeStatic(headSkin)
  const pom = pivot(head, -0.050, 0.385, 0)
  bones.pom = pom
  pom.add(mesh(paramSurface((u, v) => {
    const th = u * TAU, ph = (0.5 - v) * Math.PI
    const n = Math.sin(th * 7 + v * 11) * Math.cos(ph * 9 + th * 3)
    const r = 0.075 + 0.0092 * n
    return [r * Math.cos(ph) * Math.cos(th), r * Math.sin(ph), r * Math.cos(ph) * Math.sin(th)]
  }, 26, 18, { name: 'pom' }), knitCreamM))

  // --- GADGET BACKPACK — springy extra bone, full of bad ideas ---------------
  // Same silhouette as before; every edge now carries a 0.035 m fillet so it
  // reads as moulded toy luggage instead of a crate. The brass belly gauge that
  // used to punch a hole in the cream shield has moved to the lid, where it
  // cannot break the one unbroken bright shape on the model.
  // SHOULDER STRAPS: DELETED. r2 ran two near-black tubes up over the shoulders
  // and across the chest; together with the closed collar they read as a
  // bondage harness, they were the second-darkest value on the model so they
  // stole the eye from the eyeInk domes, one of them produced the bright
  // vertical "scratch" streak on the upper-left flank, and the left one passed
  // straight through the flipper root with no contact shadow. The pack is seated
  // ON the body's back arc and needs no visible suspension to read as worn.
  mergeStatic(softGoods)

  const pack = pivot(torso, -0.36, 0.26, 0)
  bones.pack = pack
  // ROUND-3 REBUILD. r2's shell swept BOTH faces along the body's back arc and
  // rounded its top and bottom off with a |y|^7 falloff, so at gameplay distance
  // it read as a soft sagging green grocery bag with a rolled newspaper beside
  // it — and it was the most prominent element on the character in the rear
  // lineup shot. It is now exactly what the brief asks for: one filleted slab,
  // 0.23 (X) x 0.44 (Y) x 0.42 (Z) with a 0.035 m radius on every edge, built
  // from the toolkit's `roundedBox`, straight-sided in silhouette.
  //
  // Seating is handled by TILTING the whole slab 17.2 deg instead of bending it.
  // Over y = 0.52 -> 0.94 the body's back arc runs x = -0.492 -> -0.363, which
  // is a 0.310 slope: a plane at that slope, pushed 0.012 m in, is inside the
  // body at every height and flush at both ends. So it is seated, its outline is
  // a clean slab, and there is no boolean edge cutting into the flank.
  const packRig = new THREE.Group()
  packRig.position.set(-0.170, -0.190, 0)
  packRig.rotation.z = -0.3005
  pack.add(packRig)
  packRig.add(slab(0.230, 0.440, 0.420, 0.035, packM, 0, 0, 0))
  // knitCream lid + beakAmber buckles, per the brief's own materials list
  packRig.add(slab(0.246, 0.074, 0.436, 0.030, knitCreamM, -0.004, 0.186, 0))
  for (const side of [1, -1]) {
    packRig.add(slab(0.052, 0.058, 0.032, 0.011, amberM, -0.104, 0.112, 0.150 * side))
    // canisters half-sunk INTO the shell rather than hanging off the flank, in
    // knitCream with beakAmber caps and brushed-metal nozzles
    packRig.add(barrel(0.068, 0.340, 0.024, knitCreamM, -0.150, -0.020, 0.135 * side, 0, 0, 0, 18))
    packRig.add(barrel(0.056, 0.026, 0.011, amberM, -0.150, 0.166, 0.135 * side, 0, 0, 0, 16))
    packRig.add(barrel(0.042, 0.060, 0.014, metalM, -0.150, -0.212, 0.135 * side, 0, 0, 0, 14))
  }
  // the gauge, moved off the chest and onto the lid where it cannot punch a hole
  // in the one unbroken bright shape on the model
  packRig.add(barrel(0.048, 0.018, 0.007, frameM, -0.046, 0.230, 0.112, 0, 0, 0, 18))
  packRig.add(barrel(0.034, 0.011, 0.004, lensM, -0.046, 0.241, 0.112, 0, 0, 0, 16))
  packRig.add(slab(0.048, 0.170, 0.048, 0.013, metalM, -0.060, 0.040, 0.238, 0, 0, 0.45))
  // The ONLY sanctioned bloom source on this fighter. Nothing else on this model
  // emits: grep this file for `emissive` and you get this line, the eye
  // catchlight's 0x2b2b2b lift and the lens's 0x0d2b33 teal — no magenta.
  const blinkM = M.emissive(0xff4d5e, 1.35, 'neon-panel')
  packRig.add(mesh(blob(0.026, 16), blinkM, -0.030, 0.230, -0.146))
  packRig.add(mesh(splineTube([[-0.130, 0.210, -0.120], [-0.140, 0.380, -0.126], [-0.132, 0.540, -0.120]],
    0.011, 12, null, { radialSeg: 6, roundEnd: true }), metalM))
  packRig.add(mesh(blob(0.028, 14), amberM, -0.132, 0.552, -0.120))
  // 16 rigid parts -> 7 (shell, lid+canisters, gauge bezel, gauge glass,
  // buckles+caps+antenna tip, nozzles+antenna+strut, diagnostic light). The
  // pack bone swings as one body, so nothing inside it ever moved separately.
  mergeStatic(pack)

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })
  // Identical geometry (mirrored props, repeated nubs) collapses to one buffer.
  dedupeGeometry(group)

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.52,0]
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.52, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.0, [0.02, 0, 0.015], [0, 0.505, 0]), K(2.0, Z, HIP)],
      torso: [K(0, [0, 0, 0.02]), K(1.0, [0.02, 0, -0.03]), K(2.0, [0, 0, 0.02])],
      head: [K(0, [0, 0, -0.02]), K(0.7, [0, 0.08, 0.02]), K(1.4, [0, -0.06, 0.03]), K(2.0, [0, 0, -0.02])],
      armL: [K(0, [0, 0, 0.14]), K(1.0, [0.06, 0, 0.24]), K(2.0, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(1.0, [-0.06, 0, 0.26]), K(2.0, [0, 0, 0.16])],
      tail: [K(0, Z), K(0.5, [0.25, 0, 0]), K(1.0, Z), K(1.5, [-0.25, 0, 0]), K(2.0, Z)],
      goggles: [K(0, Z), K(1.0, [0, 0, 0.06]), K(2.0, Z)],
      pack: [K(0, Z), K(1.0, [0, 0, -0.05]), K(2.0, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // THE WADDLE — side-to-side roll, wings out, pure momentum
  walk: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0.2, 0, -0.02], [0, 0.53, 0]), K(0.125, [0, 0, -0.02], [0, 0.5, 0]), K(0.25, [-0.2, 0, -0.02], [0, 0.53, 0]), K(0.375, [0, 0, -0.02], [0, 0.5, 0]), K(0.5, [0.2, 0, -0.02], [0, 0.53, 0])],
      legL: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, -0.5]), K(0.5, [0, 0, 0.5])],
      legR: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, -0.5])],
      torso: [K(0, [-0.14, 0, -0.05]), K(0.25, [0.14, 0, -0.05]), K(0.5, [-0.14, 0, -0.05])],
      head: [K(0, [0.1, 0, 0.04]), K(0.25, [-0.1, 0, 0.04]), K(0.5, [0.1, 0, 0.04])],
      armL: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.3]), K(0.5, [0, 0, 0.55])],
      armR: [K(0, [0, 0, 0.3]), K(0.25, [0, 0, 0.55]), K(0.5, [0, 0, 0.3])],
      tail: [K(0, [0.4, 0, 0]), K(0.25, [-0.4, 0, 0]), K(0.5, [0.4, 0, 0])],
      goggles: [K(0, [0.06, 0, 0]), K(0.25, [-0.06, 0, 0]), K(0.5, [0.06, 0, 0])],
      pack: [K(0, [-0.08, 0, 0.04]), K(0.25, [0.08, 0, 0.04]), K(0.5, [-0.08, 0, 0.04])],
    },
  },

  jump: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.08], [0, 0.56, 0]), K(0.45, [0, 0, 0.08], [0, 0.56, 0])],
      legL: [K(0, Z), K(0.1, [0, 0, 0.7]), K(0.45, [0, 0, 0.6])],
      legR: [K(0, Z), K(0.1, [0, 0, 0.5]), K(0.45, [0, 0, 0.4])],
      armL: [K(0, [0, 0, 0.14]), K(0.1, [-0.3, 0, 1.4]), K(0.45, [-0.3, 0, 1.3])],
      armR: [K(0, [0, 0, 0.16]), K(0.1, [0.3, 0, 1.4]), K(0.45, [0.3, 0, 1.3])],
      torso: [K(0, Z), K(0.1, [0, 0, 0.1])],
      head: [K(0, Z), K(0.1, [0, 0, -0.12])],
      tail: [K(0, Z), K(0.1, [0, 0, -0.3])],
      goggles: [K(0, Z), K(0.1, [0, 0, -0.15])],
      pack: [K(0, Z), K(0.1, [0, 0, 0.12])],
    },
  },

  // frantic little flipper flaps — aerodynamically hopeless, spiritually aloft
  fall: {
    duration: 0.35, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.1], HIP)],
      torso: [K(0, [0, 0, 0.14])],
      head: [K(0, [0, 0, -0.08])],
      armL: [K(0, [0, 0, 1.9]), K(0.17, [0, 0, 0.9]), K(0.35, [0, 0, 1.9])],
      armR: [K(0, [0, 0, 0.9]), K(0.17, [0, 0, 1.9]), K(0.35, [0, 0, 0.9])],
      legL: [K(0, [-0.2, 0, 0.3]), K(0.17, [-0.2, 0, 0.1]), K(0.35, [-0.2, 0, 0.3])],
      legR: [K(0, [0.2, 0, 0.1]), K(0.17, [0.2, 0, 0.3]), K(0.35, [0.2, 0, 0.1])],
      tail: [K(0, [0, 0, 0.4]), K(0.17, [0, 0, 0.2]), K(0.35, [0, 0, 0.4])],
      goggles: [K(0, [0, 0, 0.2])],
      pack: [K(0, [0, 0, -0.15])],
    },
  },

  crouch: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.36, 0]), K(0.3, [0, 0, -0.08], [0, 0.35, 0]), K(0.6, [0, 0, -0.08], [0, 0.36, 0])],
      legL: [K(0, [-0.35, 0, 0.5])], legR: [K(0, [0.35, 0, 0.5])],
      torso: [K(0, [0, 0, -0.18])],
      head: [K(0, [0, 0, 0.14])],
      armL: [K(0, [0.25, 0, 0.4])], armR: [K(0, [-0.25, 0, 0.4])],
      tail: [K(0, [0, 0, 0.3])],
      goggles: [K(0, [0, 0, 0.1])],
      pack: [K(0, [0, 0, 0.1])],
    },
  },

  // wings crossed, goggles snapped DOWN over the eyes — safety first
  block: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.03, 0.49, 0])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0.02, 0, 0.12]), K(0.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.16])],
      goggles: [K(0, [0, 0, 0.85])], // visor down
      armL: [K(0, [0.5, 0, 1.1])], armR: [K(0, [-0.5, 0, 1.15])],
      legL: [K(0, [-0.12, 0, 0.08])], legR: [K(0, [0.12, 0, 0.08])],
      tail: [K(0, [0, 0, 0.2])],
      pack: [K(0, [0, 0, 0.08])],
    },
  },

  hitLight: {
    duration: 0.24, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.12], [-0.06, 0.5, 0]), K(0.24, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.08, 0.3]), K(0.24, Z)],
      head: [K(0, Z), K(0.05, [0, 0.1, 0.45]), K(0.24, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.05, [0.3, 0, -0.5]), K(0.24, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.05, [-0.3, 0, -0.4]), K(0.24, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.06, [0, 0, 0.35]), K(0.24, Z)],
      pack: [K(0, Z), K(0.06, [0, 0, -0.3]), K(0.24, Z)],
      tail: [K(0, Z), K(0.06, [0, 0, -0.3]), K(0.24, Z)],
    },
  },

  // belly absorbs most of it — he wobbles like a bath toy but does NOT go down
  hitHeavy: {
    duration: 0.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.28], [-0.16, 0.47, 0]), K(0.2, [0, 0, -0.14], [0.05, 0.53, 0]), K(0.3, [0, 0, 0.08], [-0.02, 0.51, 0]), K(0.4, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.12, 0.5]), K(0.2, [0, 0.08, -0.25]), K(0.4, Z)],
      head: [K(0, Z), K(0.06, [0, 0.12, 0.65]), K(0.2, [0, -0.08, -0.2]), K(0.4, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.06, [0.5, 0, -1.1]), K(0.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.06, [-0.5, 0, -1.0]), K(0.4, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.07, [0, 0, 0.4]), K(0.4, Z)],
      goggles: [K(0, Z), K(0.07, [0, 0, 0.6]), K(0.25, [0, 0, -0.2]), K(0.4, Z)],
      pack: [K(0, Z), K(0.07, [0, 0, -0.45]), K(0.25, [0, 0, 0.2]), K(0.4, Z)],
      tail: [K(0, Z), K(0.07, [0, 0, -0.5]), K(0.4, Z)],
    },
  },

  launched: {
    duration: 0.45, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.35], HIP)],
      torso: [K(0, [0, 0, 0.55]), K(0.22, [0, 0, 0.45]), K(0.45, [0, 0, 0.55])],
      head: [K(0, [0, 0, 0.45])],
      armL: [K(0, [-0.4, 0, 2.1]), K(0.22, [-0.2, 0, 2.4]), K(0.45, [-0.4, 0, 2.1])],
      armR: [K(0, [0.2, 0, 2.4]), K(0.22, [0.4, 0, 2.1]), K(0.45, [0.2, 0, 2.4])],
      legL: [K(0, [0, 0, 0.8]), K(0.22, [0, 0, 0.6]), K(0.45, [0, 0, 0.8])],
      legR: [K(0, [0, 0, 0.5]), K(0.22, [0, 0, 0.7]), K(0.45, [0, 0, 0.5])],
      goggles: [K(0, [0, 0, -0.35])],
      pack: [K(0, [0, 0, 0.3])],
      tail: [K(0, [0, 0, 0.5])],
    },
  },

  // on his back like an upended kettle — feet paddling, fully operational
  knockdown: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.3, 0]), K(0.4, [0, 0, 1.4], [0, 0.315, 0]), K(0.8, [0, 0, 1.4], [0, 0.3, 0])],
      legL: [K(0, [0, 0, 0.3]), K(0.2, [0, 0, 0.6]), K(0.4, [0, 0, 0.3]), K(0.6, [0, 0, 0.6]), K(0.8, [0, 0, 0.3])],
      legR: [K(0, [0, 0, 0.6]), K(0.2, [0, 0, 0.3]), K(0.4, [0, 0, 0.6]), K(0.6, [0, 0, 0.3]), K(0.8, [0, 0, 0.6])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.3])],
      armL: [K(0, [0.9, 0, 0.3])], armR: [K(0, [-0.9, 0, 0.3])],
      goggles: [K(0, [0, 0, -0.4])],
      pack: [K(0, [0, 0, 0.2])],
      tail: [K(0, [0.4, 0, 0])],
    },
  },

  // the signature: rocks on the belly and POPS upright — a weeble, not a victim
  getup: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.3, 0]), K(0.14, [0, 0, 1.1], [0.04, 0.34, 0]), K(0.26, [0, 0, 0.3], [0, 0.44, 0]), K(0.36, [0, 0, -0.12], [0, 0.58, 0]), K(0.5, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.26, [0, 0, 0.6]), K(0.5, Z)],
      legR: [K(0, [0, 0, 0.6]), K(0.26, [0, 0, 0.3]), K(0.5, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.26, [0, 0, -0.3]), K(0.36, [0, 0, 0.12]), K(0.5, Z)],
      head: [K(0, [0, 0, -0.3]), K(0.36, [0, 0, 0.15]), K(0.5, Z)],
      armL: [K(0, [0.9, 0, 0.3]), K(0.26, [0.2, 0, 1.3]), K(0.5, [0, 0, 0.14])],
      armR: [K(0, [-0.9, 0, 0.3]), K(0.26, [-0.2, 0, 1.3]), K(0.5, [0, 0, 0.16])],
      goggles: [K(0, [0, 0, -0.4]), K(0.36, [0, 0, 0.3]), K(0.5, Z)],
      pack: [K(0, [0, 0, 0.2]), K(0.36, [0, 0, -0.2]), K(0.5, Z)],
      tail: [K(0, [0.4, 0, 0]), K(0.5, Z)],
    },
  },

  // waddles in, taps the belly gauge, snaps the goggles up: ready to invent
  entrance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, [0.18, 0, 0], [0, 0.53, 0]), K(0.25, [-0.18, 0, 0], [0, 0.5, 0]), K(0.5, [0.18, 0, 0], [0, 0.53, 0]), K(0.75, [-0.18, 0, 0], [0, 0.5, 0]), K(1.0, Z, HIP), K(2.4, Z, HIP)],
      legL: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, -0.5]), K(0.5, [0, 0, 0.5]), K(0.75, [0, 0, -0.5]), K(1.0, Z), K(2.4, Z)],
      legR: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, -0.5]), K(0.75, [0, 0, 0.5]), K(1.0, Z), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.55]), K(1.0, [0, 0, 0.14]), K(1.2, [0.35, 0, 0.9]), K(1.45, [0.35, 0, 0.75]), K(1.6, [0.35, 0, 0.9]), K(1.8, [0, 0, 0.14]), K(2.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.3]), K(1.0, [0, 0, 0.16]), K(1.8, [0, 0, 0.16]), K(1.95, [0, 0, 2.6]), K(2.15, [0, 0, 2.4]), K(2.4, [0, 0, 0.16])],
      head: [K(0, [0.1, 0, 0.04]), K(1.0, Z), K(1.2, [0, 0, 0.25]), K(1.8, [0, 0, 0.2]), K(1.95, [0, 0, -0.15]), K(2.2, [0, 0.1, 0]), K(2.4, Z)],
      goggles: [K(0, [0, 0, 0.85]), K(1.8, [0, 0, 0.85]), K(2.0, [0, 0, -0.15]), K(2.1, [0, 0, 0.08]), K(2.4, Z)], // goggles UP
      torso: [K(0, [-0.14, 0, -0.05]), K(1.0, Z), K(1.2, [0, 0, 0.12]), K(1.8, [0, 0, 0.1]), K(2.0, [0, 0, -0.08]), K(2.4, Z)],
      pack: [K(0, [-0.08, 0, 0.04]), K(1.0, Z), K(2.0, [0, 0, -0.15]), K(2.15, [0, 0, 0.1]), K(2.4, Z)],
      tail: [K(0, [0.4, 0, 0]), K(0.25, [-0.4, 0, 0]), K(0.5, [0.4, 0, 0]), K(0.75, [-0.4, 0, 0]), K(1.0, Z), K(2.4, Z)],
    },
  },

  // happy little hop-flaps — the roundest possible celebration
  win: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, Z, [0, 0.42, 0]), K(0.5, Z, [0, 0.72, 0]), K(0.7, Z, [0, 0.5, 0]), K(0.9, Z, [0, 0.42, 0]), K(1.1, Z, [0, 0.72, 0]), K(1.3, Z, [0, 0.5, 0]), K(1.6, Z, HIP), K(2.4, Z, HIP)],
      armL: [K(0, [0, 0, 0.14]), K(0.3, [0, 0, 0.5]), K(0.5, [-0.5, 0, 2.6]), K(0.7, [0, 0, 0.5]), K(0.9, [0, 0, 0.5]), K(1.1, [-0.5, 0, 2.6]), K(1.3, [0, 0, 0.5]), K(1.6, [0, 0, 0.14]), K(2.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.3, [0, 0, 0.5]), K(0.5, [0.5, 0, 2.6]), K(0.7, [0, 0, 0.5]), K(0.9, [0, 0, 0.5]), K(1.1, [0.5, 0, 2.6]), K(1.3, [0, 0, 0.5]), K(1.6, [0, 0, 0.16]), K(2.4, [0, 0, 0.16])],
      head: [K(0, Z), K(0.5, [0, 0, -0.25]), K(1.1, [0, 0, -0.25]), K(1.6, Z), K(1.9, [0, 0.3, 0]), K(2.1, [0, -0.3, 0]), K(2.4, Z)],
      torso: [K(0, Z), K(0.5, [0, 0, -0.12]), K(1.1, [0, 0, -0.12]), K(1.6, Z), K(2.4, Z)],
      legL: [K(0, Z), K(0.5, [0, 0, 0.5]), K(1.1, [0, 0, 0.5]), K(1.6, Z), K(2.4, Z)],
      legR: [K(0, Z), K(0.5, [0, 0, 0.5]), K(1.1, [0, 0, 0.5]), K(1.6, Z), K(2.4, Z)],
      goggles: [K(0, Z), K(0.5, [0, 0, -0.3]), K(1.1, [0, 0, -0.3]), K(1.6, Z), K(2.4, Z)],
      pack: [K(0, Z), K(0.5, [0, 0, 0.25]), K(1.1, [0, 0, 0.25]), K(1.6, Z), K(2.4, Z)],
      tail: [K(0, Z), K(0.3, [0.5, 0, 0]), K(0.7, [-0.5, 0, 0]), K(1.1, [0.5, 0, 0]), K(1.6, Z), K(2.4, Z)],
    },
  },

  // sits down with dignity, checks the pack — the prototype needed one more pass
  lose: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.15], [0, 0.34, 0]), K(1.0, [0, 0, 0.15], [0, 0.33, 0]), K(2.0, [0, 0, 0.15], [0, 0.34, 0])],
      legL: [K(0, [-0.2, 0, -0.9])], legR: [K(0, [0.2, 0, -0.9])],
      torso: [K(0, [0, 0, -0.3]), K(1.0, [0, 0, -0.34]), K(2.0, [0, 0, -0.3])],
      head: [K(0, [0, 0, -0.4]), K(0.8, [0, 0.3, -0.35]), K(1.4, [0, -0.2, -0.4]), K(2.0, [0, 0, -0.4])],
      armL: [K(0, [0, 0, 0.3])],
      armR: [K(0, [0, 0, 0.3]), K(0.8, [-0.6, 0, 0.8]), K(1.4, [-0.6, 0, 0.7]), K(2.0, [0, 0, 0.3])],
      goggles: [K(0, [0, 0, 0.6])], // slid down over the eyes, hiding the sniffle
      pack: [K(0, [0, 0, 0.15])],
      tail: [K(0, [0, 0, -0.2])],
    },
  },

  // pats the mighty belly twice: THIS is the engine of the operation
  taunt: {
    duration: 1.2, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, [0, 0, -0.06], [0, 0.54, 0]), K(0.9, [0, 0, -0.06], [0, 0.54, 0]), K(1.2, Z, HIP)],
      torso: [K(0, Z), K(0.3, [0, 0, -0.15]), K(0.9, [0, 0, -0.15]), K(1.2, Z)],
      head: [K(0, Z), K(0.3, [0, 0, -0.2]), K(0.6, [0, 0.2, -0.15]), K(0.9, [0, -0.2, -0.15]), K(1.2, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.35, [0.5, 0, 0.7]), K(0.45, [0.5, 0, 0.5]), K(0.55, [0.5, 0, 0.7]), K(0.65, [0.5, 0, 0.5]), K(0.8, [0.5, 0, 0.7]), K(1.2, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.35, [-0.5, 0, 0.7]), K(0.5, [-0.5, 0, 0.5]), K(0.65, [-0.5, 0, 0.7]), K(0.8, [-0.5, 0, 0.5]), K(1.2, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.3, [0, 0, -0.2]), K(0.9, [0, 0, -0.2]), K(1.2, Z)],
      pack: [K(0, Z), K(0.35, [0, 0, 0.12]), K(0.55, [0, 0, -0.08]), K(0.75, [0, 0, 0.12]), K(1.2, Z)],
      tail: [K(0, Z), K(0.4, [0.4, 0, 0]), K(0.7, [-0.4, 0, 0]), K(1.2, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  wingSlap: {
    duration: 0.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.16]), K(0.08, [0.4, -0.5, -0.6]), K(0.14, [-0.3, 0.6, 1.5]), K(0.22, [-0.2, 0.4, 1.2]), K(0.3, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.08, [0, -0.3, 0]), K(0.14, [0, 0.35, -0.1]), K(0.3, Z)],
      hips: [K(0, Z, HIP), K(0.14, [0, 0.25, 0], [0.04, 0.51, 0]), K(0.3, Z, HIP)],
      head: [K(0, Z), K(0.14, [0, -0.15, -0.1]), K(0.3, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.14, [0.2, 0, 0.5]), K(0.3, [0, 0, 0.14])],
      goggles: [K(0, Z), K(0.16, [0, 0, 0.2]), K(0.3, Z)],
      pack: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.3, Z)],
    },
  },

  beakJab: {
    duration: 0.25, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.07, [0, 0, -0.05], [0.09, 0.5, 0]), K(0.13, [0, 0, -0.02], [0.11, 0.5, 0]), K(0.25, Z, HIP)],
      torso: [K(0, Z), K(0.07, [0, 0, -0.35]), K(0.25, Z)],
      head: [K(0, Z), K(0.07, [0, 0, -0.35]), K(0.11, [0, 0, -0.15]), K(0.15, [0, 0, -0.35]), K(0.25, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.07, [0.3, 0, -0.5]), K(0.25, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.07, [-0.3, 0, -0.5]), K(0.25, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.09, [0, 0, -0.2]), K(0.25, Z)],
      tail: [K(0, Z), K(0.09, [0, 0, 0.3]), K(0.25, Z)],
    },
  },

  // rear back, then the belly arrives like a margin call
  bellyBounce: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.2], [-0.12, 0.5, 0]), K(0.17, [0, 0, -0.15], [0.22, 0.48, 0]), K(0.28, [0, 0, 0.05], [0.08, 0.53, 0]), K(0.45, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, 0.4]), K(0.17, [0, 0, -0.3]), K(0.28, [0, 0, 0.1]), K(0.45, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.4]), K(0.17, [0, 0, -0.1]), K(0.45, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.1, [0.3, 0, -0.8]), K(0.17, [0.5, 0, 1.2]), K(0.45, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.1, [-0.3, 0, -0.8]), K(0.17, [-0.5, 0, 1.2]), K(0.45, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.17, [0, 0, -0.3]), K(0.45, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, 0.3]), K(0.45, Z)],
      goggles: [K(0, Z), K(0.18, [0, 0, 0.4]), K(0.45, Z)],
      pack: [K(0, Z), K(0.1, [0, 0, 0.2]), K(0.18, [0, 0, -0.35]), K(0.45, Z)],
      tail: [K(0, Z), K(0.17, [0, 0, 0.5]), K(0.45, Z)],
    },
  },

  // drops onto the belly and toboggans in — feet-first finish
  iceSlide: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, 0.45], [0.05, 0.3, 0]), K(0.34, [0, 0, 0.45], [0.05, 0.28, 0]), K(0.42, [0, 0, 0.1], [0, 0.44, 0]), K(0.5, Z, HIP)],
      legL: [K(0, Z), K(0.08, [-0.15, 0, -0.9]), K(0.34, [-0.15, 0, -0.9]), K(0.5, Z)],
      legR: [K(0, Z), K(0.08, [0.15, 0, -0.9]), K(0.34, [0.15, 0, -0.9]), K(0.5, Z)],
      torso: [K(0, Z), K(0.08, [0, 0, 0.3]), K(0.34, [0, 0, 0.3]), K(0.5, Z)],
      head: [K(0, Z), K(0.08, [0, 0, -0.4]), K(0.34, [0, 0, -0.4]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.08, [0.4, 0, 1.6]), K(0.34, [0.4, 0, 1.6]), K(0.5, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.08, [-0.4, 0, 1.6]), K(0.34, [-0.4, 0, 1.6]), K(0.5, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.08, [0, 0, 0.85]), K(0.42, [0, 0, 0.85]), K(0.5, Z)],
      pack: [K(0, Z), K(0.08, [0, 0, -0.25]), K(0.34, [0, 0, -0.25]), K(0.5, Z)],
      tail: [K(0, Z), K(0.08, [0, 0, 0.5]), K(0.34, [0, 0, 0.5]), K(0.5, Z)],
    },
  },

  // brace, vent the tanks, ride the recoil half a step
  backpackBurst: {
    duration: 0.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.12], [-0.05, 0.48, 0]), K(0.14, [0, 0, 0.05], [0.12, 0.52, 0]), K(0.4, Z, HIP)],
      torso: [K(0, Z), K(0.08, [0, 0, -0.35]), K(0.14, [0, 0, 0.15]), K(0.4, Z)],
      head: [K(0, Z), K(0.08, [0, 0, -0.2]), K(0.14, [0, 0, 0.25]), K(0.4, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.08, [0.4, 0, 1.0]), K(0.14, [0.3, 0, -0.6]), K(0.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.08, [-0.4, 0, 1.0]), K(0.14, [-0.3, 0, -0.6]), K(0.4, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.08, [-0.2, 0, 0.4]), K(0.4, Z)],
      legR: [K(0, Z), K(0.08, [0.2, 0, 0.4]), K(0.4, Z)],
      goggles: [K(0, Z), K(0.14, [0, 0, -0.3]), K(0.4, Z)],
      pack: [K(0, Z), K(0.1, [0, 0, 0.35]), K(0.16, [0, 0, -0.5]), K(0.26, [0, 0, 0.2]), K(0.4, Z)],
      tail: [K(0, Z), K(0.14, [0, 0, -0.4]), K(0.4, Z)],
    },
  },

  // golf-swing uppercut with a wrench the size of policy failure
  wrenchStrike: {
    duration: 0.5, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.16]), K(0.14, [0.2, 0, -1.4]), K(0.19, [0, 0, -1.6]), K(0.26, [-0.2, 0, 2.3]), K(0.36, [-0.2, 0, 2.1]), K(0.5, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.14, [0, -0.45, 0.1]), K(0.26, [0, 0.5, -0.25]), K(0.5, Z)],
      hips: [K(0, Z, HIP), K(0.14, [0, -0.3, 0], [0, 0.45, 0]), K(0.26, [0, 0.35, 0.05], [0.08, 0.58, 0]), K(0.38, Z, [0.03, 0.53, 0]), K(0.5, Z, HIP)],
      head: [K(0, Z), K(0.14, [0, -0.3, 0.1]), K(0.26, [0, 0.2, -0.3]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.14, [0.3, 0, 0.6]), K(0.26, [0.3, 0, -0.9]), K(0.5, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.26, [0, 0, -0.5]), K(0.5, Z)],
      legR: [K(0, Z), K(0.14, [0, 0, 0.3]), K(0.5, Z)],
      goggles: [K(0, Z), K(0.27, [0, 0, -0.35]), K(0.5, Z)],
      pack: [K(0, Z), K(0.27, [0, 0, 0.3]), K(0.5, Z)],
      tail: [K(0, Z), K(0.27, [0, 0, 0.4]), K(0.5, Z)],
    },
  },

  // scoop, pack it square (efficiency), deliver
  snowballToss: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.1], [0, 0.4, 0]), K(0.24, [0, 0, 0.05], [0.04, 0.54, 0]), K(0.5, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.24, [0, -0.3, 0.15]), K(0.32, [0, 0.35, -0.15]), K(0.5, Z)],
      armR: [K(0, [0, 0, 0.16]), K(0.1, [0, 0, -0.7]), K(0.2, [0.2, 0, -0.9]), K(0.3, [-0.2, 0, 1.9]), K(0.4, [-0.1, 0, 1.5]), K(0.5, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.1, [0, 0, -0.5]), K(0.3, [0.3, 0, 0.7]), K(0.5, [0, 0, 0.14])],
      head: [K(0, Z), K(0.1, [0, 0, 0.2]), K(0.3, [0, 0, -0.25]), K(0.5, Z)],
      legL: [K(0, Z), K(0.1, [-0.3, 0, 0.5]), K(0.3, Z)],
      legR: [K(0, Z), K(0.1, [0.3, 0, 0.5]), K(0.3, Z)],
      goggles: [K(0, Z), K(0.32, [0, 0, -0.25]), K(0.5, Z)],
      pack: [K(0, Z), K(0.32, [0, 0, 0.2]), K(0.5, Z)],
    },
  },

  // squat, ignite, rise like a small orange-footed rocket, wing-hammer on top
  rocketHop: {
    duration: 0.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.1], [0, 0.36, 0]), K(0.18, [0, 0, 0.15], [0, 0.6, 0]), K(0.3, [0, 0, 0.1], [0, 0.58, 0]), K(0.45, Z, [0, 0.54, 0]), K(0.6, Z, HIP)],
      legL: [K(0, Z), K(0.08, [-0.35, 0, 0.5]), K(0.18, [0, 0, 0.8]), K(0.45, [0, 0, 0.3]), K(0.6, Z)],
      legR: [K(0, Z), K(0.08, [0.35, 0, 0.5]), K(0.18, [0, 0, 0.6]), K(0.45, [0, 0, 0.2]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.08, [0.25, 0, 0.4]), K(0.18, [-0.4, 0, 2.5]), K(0.26, [-0.3, 0, 1.0]), K(0.6, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.08, [-0.25, 0, 0.4]), K(0.18, [0.4, 0, 2.5]), K(0.26, [0.3, 0, 1.0]), K(0.6, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.08, [0, 0, -0.2]), K(0.18, [0, 0, 0.15]), K(0.26, [0, 0, -0.25]), K(0.6, Z)],
      head: [K(0, Z), K(0.18, [0, 0, -0.2]), K(0.26, [0, 0, 0.2]), K(0.6, Z)],
      goggles: [K(0, Z), K(0.18, [0, 0, -0.3]), K(0.6, Z)],
      pack: [K(0, Z), K(0.12, [0, 0, 0.4]), K(0.2, [0, 0, -0.3]), K(0.32, [0, 0, 0.15]), K(0.6, Z)],
      tail: [K(0, Z), K(0.18, [0, 0, 0.5]), K(0.6, Z)],
    },
  },

  // turns his back on them (rude), shivers up a chill, pack-checks them away
  coldShoulder: {
    duration: 0.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 1.6, 0], [0, 0.5, 0]), K(0.24, [0, 3.14, 0], [0, 0.52, 0]), K(0.52, [0, 3.14, 0], [0, 0.52, 0]), K(0.6, [0, 3.14, 0], [-0.16, 0.52, 0]), K(0.72, [0, 4.7, 0], [0, 0.52, 0]), K(0.9, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.24, [0, 0, 0.08]), K(0.34, [0.1, 0, 0.1]), K(0.42, [-0.1, 0, 0.1]), K(0.5, [0.1, 0, 0.1]), K(0.6, [0, 0, -0.3]), K(0.9, Z)],
      head: [K(0, Z), K(0.24, [0, 0.4, -0.1]), K(0.52, [0, 0.4, -0.1]), K(0.6, [0, 0, 0.2]), K(0.9, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.24, [0.6, 0, 0.9]), K(0.52, [0.6, 0, 0.9]), K(0.9, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.24, [-0.6, 0, 0.9]), K(0.52, [-0.6, 0, 0.9]), K(0.9, [0, 0, 0.16])],
      pack: [K(0, Z), K(0.34, [0, 0, 0.15]), K(0.42, [0, 0, -0.15]), K(0.5, [0, 0, 0.15]), K(0.62, [0, 0, -0.4]), K(0.9, Z)],
      goggles: [K(0, Z), K(0.34, [0, 0, 0.15]), K(0.42, [0, 0, -0.1]), K(0.5, [0, 0, 0.15]), K(0.9, Z)],
      tail: [K(0, Z), K(0.34, [0.3, 0, 0]), K(0.42, [-0.3, 0, 0]), K(0.5, [0.3, 0, 0]), K(0.9, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // hoists them, leaps, and delivers the belly like a court summons
  piledriver: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, -0.15], [0.06, 0.42, 0]), K(0.3, [0, 0, 0.3], [0, 0.95, 0]), K(0.44, [0, 0, 1.2], [0, 1.0, 0]), K(0.56, [0, 0, 1.5], [0.1, 0.34, 0]), K(0.68, [0, 0, 0.8], [0, 0.48, 0]), K(0.82, [0, 0, 0.1], [0, 0.54, 0]), K(1.0, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, -0.4]), K(0.3, [0, 0, 0.2]), K(0.44, [0, 0, 0.4]), K(0.56, [0, 0, 0.3]), K(1.0, Z)],
      head: [K(0, Z), K(0.14, [0, 0, -0.3]), K(0.44, [0, 0, 0.3]), K(0.56, [0, 0, -0.4]), K(1.0, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.14, [0.3, 0, 1.5]), K(0.3, [0.4, 0, 2.3]), K(0.56, [0.6, 0, 0.6]), K(1.0, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.14, [-0.3, 0, 1.5]), K(0.3, [-0.4, 0, 2.3]), K(0.56, [-0.6, 0, 0.6]), K(1.0, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.3, [0, 0, 0.7]), K(0.56, [0, 0, 0.9]), K(0.82, Z)],
      legR: [K(0, Z), K(0.3, [0, 0, 0.5]), K(0.56, [0, 0, 0.7]), K(0.82, Z)],
      goggles: [K(0, Z), K(0.44, [0, 0, -0.4]), K(0.6, [0, 0, 0.3]), K(1.0, Z)],
      pack: [K(0, Z), K(0.44, [0, 0, 0.35]), K(0.6, [0, 0, -0.3]), K(1.0, Z)],
      tail: [K(0, Z), K(0.44, [0, 0, 0.5]), K(1.0, Z)],
    },
  },

  // double wing-push: the vault door swings shut
  coldStorage: {
    duration: 0.77, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, -0.1], [-0.06, 0.48, 0]), K(0.22, [0, 0, 0.06], [0.1, 0.52, 0]), K(0.5, [0, 0, 0.04], [0.06, 0.52, 0]), K(0.77, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.22, [0, 0, 0.1]), K(0.77, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.22, [0, 0, 0.1]), K(0.77, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.12, [0.5, 0, -0.6]), K(0.22, [0.35, 0, 1.5]), K(0.5, [0.35, 0, 1.45]), K(0.77, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.12, [-0.5, 0, -0.6]), K(0.22, [-0.35, 0, 1.5]), K(0.5, [-0.35, 0, 1.45]), K(0.77, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.14, [0, 0, 0.85]), K(0.6, [0, 0, 0.85]), K(0.77, Z)],
      pack: [K(0, Z), K(0.22, [0, 0, -0.2]), K(0.77, Z)],
      legL: [K(0, Z), K(0.12, [-0.15, 0, 0.2]), K(0.77, Z)],
      legR: [K(0, Z), K(0.12, [0.15, 0, 0.2]), K(0.77, Z)],
    },
  },

  // tuck into the roundest object in finance and ROLL — hips spin like a wheel
  bellyExchange: {
    duration: 3.1, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.6], [0, 0.42, 0]), K(0.5, [0, 0, -7], [0, 0.44, 0]), K(1.0, [0, 0, -14], [0, 0.44, 0]), K(1.5, [0, 0, -21], [0, 0.44, 0]), K(2.0, [0, 0, -28], [0, 0.44, 0]), K(2.5, [0, 0, -34.5], [0, 0.44, 0]), K(2.75, [0, 0, -37.1], [0, 0.5, 0]), K(3.1, [0, 0, -37.7], HIP)],
      torso: [K(0, Z), K(0.2, [0, 0, -0.85]), K(2.6, [0, 0, -0.85]), K(3.1, Z)],
      head: [K(0, Z), K(0.2, [0, 0, -0.8]), K(2.6, [0, 0, -0.8]), K(3.1, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.2, [0.9, 0, 1.1]), K(2.6, [0.9, 0, 1.1]), K(3.1, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [-0.9, 0, 1.1]), K(2.6, [-0.9, 0, 1.1]), K(3.1, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.2, [-0.2, 0, 1.0]), K(2.6, [-0.2, 0, 1.0]), K(3.1, Z)],
      legR: [K(0, Z), K(0.2, [0.2, 0, 1.0]), K(2.6, [0.2, 0, 1.0]), K(3.1, Z)],
      goggles: [K(0, Z), K(0.2, [0, 0, 0.85]), K(2.75, [0, 0, 0.85]), K(3.1, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, 0.3]), K(2.6, [0, 0, 0.3]), K(3.1, Z)],
      tail: [K(0, Z), K(0.2, [0, 0, 0.6]), K(2.6, [0, 0, 0.6]), K(3.1, Z)],
    },
  },

  // reach into the pack, deploy machine, crank it twice, step back. pray.
  prototype: {
    duration: 1.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, -0.5, 0], [0, 0.5, 0]), K(0.45, [0, 0.2, -0.15], [0.08, 0.42, 0]), K(0.75, [0, 0.2, -0.1], [0.08, 0.44, 0]), K(1.05, [0, 0, 0], [-0.12, 0.5, 0]), K(1.5, Z, HIP)],
      torso: [K(0, Z), K(0.2, [0, -0.4, 0.1]), K(0.45, [0, 0.2, -0.45]), K(0.75, [0, 0.2, -0.4]), K(1.05, [0, 0, 0.15]), K(1.5, Z)],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [-0.9, 0, 0.9]), K(0.45, [0, 0, -1.0]), K(0.55, [0, 0, -0.6]), K(0.65, [0, 0, -1.0]), K(0.75, [0, 0, -0.6]), K(1.05, [0, 0, 0.6]), K(1.5, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.45, [0.3, 0, -0.7]), K(0.75, [0.3, 0, -0.7]), K(1.05, [0.3, 0, 0.8]), K(1.5, [0, 0, 0.14])],
      head: [K(0, Z), K(0.2, [0, -0.4, 0]), K(0.45, [0, 0, -0.35]), K(0.75, [0, 0, -0.35]), K(1.05, [0, 0, 0.1]), K(1.2, [0.15, 0, 0]), K(1.35, [-0.15, 0, 0]), K(1.5, Z)],
      goggles: [K(0, Z), K(0.4, [0, 0, 0.85]), K(1.0, [0, 0, 0.85]), K(1.15, Z), K(1.5, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, 0.4]), K(0.35, [0, 0, -0.2]), K(1.5, Z)],
      legL: [K(0, Z), K(0.45, [-0.3, 0, 0.4]), K(1.05, Z)],
      legR: [K(0, Z), K(0.45, [0.3, 0, 0.4]), K(1.05, Z)],
      tail: [K(0, Z), K(0.45, [0, 0, 0.4]), K(1.05, Z)],
    },
  },

  // points a flipper at the sky and lets logistics handle the rest
  airdrop: {
    duration: 1.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.05], [0, 0.5, 0]), K(1.4, [0, 0, -0.05], [0, 0.5, 0]), K(1.6, Z, HIP)],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [0, 0, 2.9]), K(1.1, [0, 0, 2.9]), K(1.3, [0, 0, 0.8]), K(1.6, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.2, [0.4, 0, 0.5]), K(1.1, [0.4, 0, 0.5]), K(1.6, [0, 0, 0.14])],
      head: [K(0, Z), K(0.2, [0, 0, 0.5]), K(0.8, [0, 0.2, 0.5]), K(1.1, [0, -0.2, 0.5]), K(1.3, [0, 0, -0.1]), K(1.6, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.15]), K(1.1, [0, 0, 0.15]), K(1.6, Z)],
      goggles: [K(0, Z), K(0.25, [0, 0, -0.4]), K(1.2, [0, 0, -0.4]), K(1.6, Z)],
      pack: [K(0, Z), K(0.3, [0, 0, 0.15]), K(0.5, [0, 0, -0.1]), K(0.7, [0, 0, 0.15]), K(1.6, Z)],
      tail: [K(0, Z), K(0.4, [0.3, 0, 0]), K(0.8, [-0.3, 0, 0]), K(1.2, [0.3, 0, 0]), K(1.6, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // rummage... produce tiny frozen USB... stare... stare more... shrug... poke
  coldWallet: {
    duration: 1.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0.6, 0], [0, 0.5, 0]), K(0.4, [0, 0, 0], HIP), K(1.4, Z, HIP)],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [-1.2, 0, 0.8]), K(0.4, [0, 0, 1.2]), K(0.85, [0, 0, 1.2]), K(1.0, [0.4, 0, 0.9]), K(1.1, [0, 0, 1.4]), K(1.25, [0, 0, 1.1]), K(1.4, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.4, [0.2, 0, 0.4]), K(1.0, [0.6, 0, 0.9]), K(1.15, [0.2, 0, 0.4]), K(1.4, [0, 0, 0.14])],
      head: [K(0, Z), K(0.2, [0, 0.5, 0]), K(0.4, [0, 0, 0.45]), K(0.7, [0.1, 0, 0.45]), K(0.85, [-0.1, 0, 0.45]), K(1.0, [0, 0.3, 0.1]), K(1.15, [0, 0, 0.2]), K(1.4, Z)],
      torso: [K(0, Z), K(0.2, [0, 0.3, 0]), K(0.4, [0, 0, 0.1]), K(1.0, [0, 0, 0.15]), K(1.4, Z)],
      goggles: [K(0, Z), K(0.45, [0, 0, 0.3]), K(0.95, [0, 0, 0.3]), K(1.4, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, 0.3]), K(0.35, [0, 0, -0.15]), K(1.4, Z)],
      tail: [K(0, Z), K(1.0, [0.3, 0, 0]), K(1.15, [-0.3, 0, 0]), K(1.4, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // finisher: grand frost conductor — wings spread, channel, point, DECREE
  frozenAssets: {
    duration: 2.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.1], [0, 0.46, 0]), K(0.4, [0, 0, 0.1], [0, 0.58, 0]), K(1.6, [0, 0, 0.1], [0, 0.56, 0]), K(1.9, [0, 0, -0.05], [0, 0.5, 0]), K(2.4, Z, HIP), K(2.9, Z, HIP)],
      armL: [K(0, [0, 0, 0.14]), K(0.3, [-0.9, 0, 2.4]), K(1.5, [-0.9, 0, 2.4]), K(1.9, [0.4, 0, 0.9]), K(2.3, [0.4, 0, 0.9]), K(2.9, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.3, [0.9, 0, 2.4]), K(1.5, [0.9, 0, 2.4]), K(1.9, [-0.3, 0, 1.6]), K(2.3, [-0.3, 0, 1.6]), K(2.9, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.3, [0, 0, 0.2]), K(1.5, [0, 0, 0.2]), K(1.9, [0, 0, -0.25]), K(2.4, Z), K(2.9, Z)],
      head: [K(0, Z), K(0.3, [0, 0, 0.35]), K(1.5, [0, 0, 0.35]), K(1.9, [0, 0, -0.3]), K(2.4, Z), K(2.9, Z)],
      goggles: [K(0, Z), K(0.25, [0, 0, 0.85]), K(2.2, [0, 0, 0.85]), K(2.5, [0, 0, -0.15]), K(2.7, Z), K(2.9, Z)],
      pack: [K(0, Z), K(0.35, [0, 0, 0.3]), K(0.55, [0, 0, -0.2]), K(0.75, [0, 0, 0.3]), K(0.95, [0, 0, -0.2]), K(1.15, [0, 0, 0.3]), K(1.5, Z), K(2.9, Z)],
      tail: [K(0, Z), K(0.4, [0.4, 0, 0]), K(0.8, [-0.4, 0, 0]), K(1.2, [0.4, 0, 0]), K(1.6, Z), K(2.9, Z)],
      legL: [K(0, Z), K(0.3, [-0.15, 0, 0.15]), K(1.9, Z)],
      legR: [K(0, Z), K(0.3, [0.15, 0, 0.15]), K(1.9, Z)],
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

// recolor / rescale a spawned prop's meshes (visual only; physics unchanged)
function styleProp(p, hex, scale) {
  try {
    p?.mesh?.traverse?.((o) => {
      if (o.isMesh && o.material?.color) o.material.color.setHex(hex)
    })
    if (scale) p?.mesh?.scale?.set(scale[0], scale[1], scale[2])
  } catch { /* cosmetic only */ }
}

// icy emissive tint on a fighter; returns a restore fn (idempotent, guarded)
function freezeTint(fighter) {
  const touched = []
  try {
    // Fighter._claimMutableMaterials() copy-on-writes every entry in `mats` into
    // a private instance, so this is a local mutation. The guard is the assert
    // (README §5): if one ever arrives still shared, tinting it would freeze
    // every mesh in the arena that happens to share the cache entry, so skip it.
    for (const m of fighter?.mats || []) {
      if (!m?.emissive || isSharedMaterial(m)) continue
      touched.push(m)
      m.emissive.setHex(C.iceDeep)
    }
  } catch { /* cosmetic only */ }
  let restored = false
  return () => {
    if (restored) return
    restored = true
    try { for (const m of touched) m.emissive.setHex(0x000000) } catch { /* cosmetic only */ }
  }
}

// translucent ice block parented to the fighter's hips (rides along with them);
// returns a remove fn (idempotent, guarded). No physics — pure staging.
function makeIceShell(fighter, h = 1.5) {
  try {
    const hips = fighter?.bones?.hips
    if (!hips) return () => {}
    // Widened from the old 1.05 x 0.95 box: Fatty Pingo's own body is 1.000 (X)
    // by 0.950 (Z) at the belly's widest, so the legacy shell clipped his flanks
    // when he was the one getting vaulted. 1.18 x 1.08 clears every fighter on
    // the roster with a visible rime margin.
    //
    // ONE transmissive material, alive only for the ~2 s of the vault (perf
    // rules: transmission costs a whole extra scene render, budget 1-2). It is
    // `unique` because this shell is disposed on thaw — a shared cached material
    // must never be handed to a dispose path (README §5, Fighter.js dispose).
    const shellM = M.pbr(C.ice, 'ice', {
      unique: true, roughness: 1.1, transmission: 0.62, thickness: 0.55,
      opacity: 0.92, envMapIntensity: 1.25, mapOpts: { scale: 3 },
    })
    // A chamfered block, not a raw box: the bevels are what catch the rim light
    // and read as a cut ice cube instead of a grey rectangle.
    //
    // `h` is the FIGHTER's height, not the block's. The old shell was exactly h
    // tall and centred 0.28 above the hips, which floated it 0.05 m off the
    // floor AND left the top 0.05 m of a 1.60 m fighter sticking out through the
    // lid. 0.16 m of headroom, floor-anchored off the foe's own hip height,
    // encases whoever is actually in it.
    const hipY = Number.isFinite(hips.position?.y) ? hips.position.y : 0.52
    const H = h + 0.16
    const shell = new THREE.Mesh(chamferBox(1.18, H, 1.08, 0.085), shellM)
    shell.position.set(0.04, H / 2 - hipY, 0)
    shell.castShadow = true
    // Frosty crack lines — cheap alpha-blend slivers, never a second
    // transmissive material. They tilt about X so they stay flat against the
    // block's own face; tilting them about Z (as the old build did) swung their
    // ends straight out through the +X face and 0.13 m into open air.
    const crackM = M.pbr(0xd8f2ff, 'plastic-gloss', {
      unique: true, noMaps: true, roughness: 0.5, transparent: true,
      opacity: 0.7, depthWrite: false,
    })
    shell.add(slab(0.02, H * 0.46, 0.03, 0.006, crackM, 0.583, 0.10, 0.10, 0.38, 0, 0))
    shell.add(slab(0.02, H * 0.32, 0.03, 0.006, crackM, 0.583, -0.22, -0.16, -0.48, 0, 0))
    shell.add(slab(0.02, H * 0.26, 0.03, 0.006, crackM, -0.583, 0.04, -0.08, 0.52, 0, 0))
    hips.add(shell)
    let removed = false
    return () => {
      if (removed) return
      removed = true
      try {
        hips.remove(shell)
        shell.geometry.dispose()
        shell.children.forEach((c) => { c.geometry?.dispose?.() })
        disposeMaterialSafely(shellM)
        disposeMaterialSafely(crackM)
      } catch { /* cosmetic only */ }
    }
  } catch { return () => {} }
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function bellyBounceScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(4, () => { try { fx.self.squash?.(0.3) } catch { /* squash optional */ } })
  fx.after(9, () => {
    fx.impulse(fx.self, [F * 3.5, 0, 0])
    fx.sfx('boing')
    if (inRange(fx, 1.8)) {
      fx.shake(0.6)
      try { fx.self.squash?.(0.5) } catch { /* squash optional */ }
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: 12 })
      fx.hit({ damage: 12, knockback: { x: 12, y: 3, spin: 0.6 }, hitStun: 20 })
      fx.impulse(fx.self, [-F * 2.5, 1.2, 0]) // bounces off his own impact
      fx.caption('BOUNCED OFF THE BALANCE SHEET')
    }
  })
  fx.after(27, end)
}

function iceSlideScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('slide')
  let landed = false
  const tryHit = () => {
    if (landed || !inRange(fx, 1.5)) return
    landed = true
    fx.sfx('kick')
    fx.shake(0.35)
    fx.particles('impact', v3(fx.foe.pos.x, 0.5, 0), { n: 8 })
    fx.hit({ damage: 8, knockback: { x: 8, y: 2.5, spin: 1 }, hitStun: 18 })
  }
  for (let i = 0; i < 5; i++) {
    fx.after(7 + i * 3, () => {
      fx.impulse(fx.self, [F * 4, 0, 0])
      fx.particles('smoke', v3(fx.self.pos.x - F * 0.3, 0.12, 0), { n: 2 })
      tryHit()
    })
  }
  fx.after(24, tryHit)
  fx.after(30, end)
}

function backpackBurstScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(8, () => {
    fx.sfx('explosion', { pitch: 1.6, vol: 0.6 })
    fx.shake(0.4)
    fx.particles('smoke', v3(fx.self.pos.x - F * 0.5, 1.0, 0), { n: 10 })
    fx.particles('sparks', v3(fx.self.pos.x - F * 0.4, 1.1, 0), { n: 6 })
    fx.impulse(fx.self, [F * 5, 0.5, 0])
    if (inRange(fx, 1.9)) {
      fx.hit({ damage: 7, knockback: { x: 13, y: 2, spin: 0.8 }, hitStun: 18 })
      fx.caption('GAS FEES')
    }
  })
  fx.after(24, end)
}

function wrenchStrikeScript(fx) {
  const end = onceEnd(fx)
  const wrench = fx.self.bones?.armR?.userData?.wrench
  const showWrench = (v) => { try { if (wrench) wrench.visible = v } catch { /* cosmetic */ } }
  showWrench(true)
  fx.sfx('whoosh', { pitch: 0.8 })
  fx.after(12, () => {
    if (inRange(fx, 1.9)) {
      fx.sfx('punch_heavy')
      fx.shake(0.5)
      fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 10 })
      fx.particles('sparks', v3(fx.foe.pos.x, 1.1, 0), { n: 8 })
      fx.hit({ damage: 10, knockback: { x: 2, y: 10, spin: 1.4 }, hitStun: 26, ragdoll: 1 })
      fx.caption('PERCUSSIVE MAINTENANCE')
    }
  })
  fx.after(26, () => showWrench(false)) // holstered before recovery ends
  fx.after(30, () => { showWrench(false); end() }) // failsafe + end
}

function snowballScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let ball = null
  fx.after(8, () => {
    ball = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.5, 1.1, 0), { mass: 0.5 })
    styleProp(ball, 0xf2f7ff, [0.5, 0.5, 0.5]) // he packs them square. efficiency.
  })
  fx.after(12, () => {
    fx.sfx('whoosh', { pitch: 1.4 })
    if (ball) { try { fx.impulse(ball, [F * 11, 3.5, 0], 4) } catch { /* prop gone */ } }
  })
  fx.after(19, () => {
    // the hit lands when the snowball reaches them (short-range projectile)
    if (Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) < 4.2) {
      fx.sfx('thud', { pitch: 1.5 })
      fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 6 })
      fx.hit({ damage: 6, knockback: { x: 6, y: 2, spin: 0.5 }, hitStun: 16, pos: v3(fx.foe.pos.x, 1.1, 0) })
    }
  })
  fx.after(30, end)
}

function rocketHopScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(6, () => {
    fx.sfx('launch', { pitch: 1.4 })
    fx.impulse(fx.self, [F * 3, 8.5, 0])
    fx.particles('smoke', v3(fx.self.pos.x, 0.3, 0), { n: 8 })
    fx.particles('sparks', v3(fx.self.pos.x, 0.25, 0), { n: 6 })
  })
  fx.after(11, () => fx.particles('smoke', v3(fx.self.pos.x, Math.max(0.2, fx.self.pos.y), 0), { n: 4 }))
  fx.after(15, () => {
    fx.particles('smoke', v3(fx.self.pos.x, Math.max(0.2, fx.self.pos.y), 0), { n: 4 })
    if (inRange(fx, 1.8)) {
      fx.sfx('punch_heavy', { pitch: 1.1 })
      fx.shake(0.45)
      fx.hit({ damage: 11, knockback: { x: 3, y: 11, spin: 1.5 }, hitStun: 26, ragdoll: 1 })
      fx.caption('VERTICAL INTEGRATION')
    }
  })
  fx.after(36, end)
}

// SPECIAL 1 — Cold Storage: vault the foe in ice, walk away smug
function frozenAssetsScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(10, () => {
    // slaps you with a fish that has been in cold storage since 2019
    fx.sfx('slide', { pitch: 1.3 })
    fx.particles('spark', v3(fx.self.pos.x + F * 1.0, 1.2, 0), { n: 8 })
    if (inRange(fx, 2.9)) {
      fx.sfx('thud')
      fx.shake(0.5)
      // long hitStun: assets are FROZEN
      fx.hit({ damage: 12, knockback: { x: 8, y: 3, spin: 1.0 }, hitStun: 36, ragdoll: 1 })
      fx.caption('ASSETS FROZEN')
    } else {
      fx.caption('FISH DEEMED ILLIQUID')
    }
  })
  fx.after(38, end)
}

function coldStorageScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('whoosh', { pitch: 1.7 })
  if (!inRange(fx, 3.2)) {
    fx.caption('CUSTODY DECLINED')
    fx.after(36, end)
    return
  }
  fx.caption('COLD STORAGE!')
  fx.announcer('ASSETS FROZEN')
  fx.sfx('block', { pitch: 1.5 })
  fx.shake(0.4)
  fx.particles('sparks', v3(fx.foe.pos.x, 1.0, 0), { n: 12 })
  fx.hit({ damage: 6, knockback: { x: 0, y: 0 }, hitStun: 128 }) // ~2s in the vault
  const unfreeze = freezeTint(fx.foe)
  const removeIce = makeIceShell(fx.foe)
  let thawed = false
  const thaw = () => {
    if (thawed) return
    thawed = true
    try { removeIce() } catch { /* cosmetic */ }
    try { unfreeze() } catch { /* cosmetic */ }
  }
  fx.after(118, () => { // the vault cracks open — shatter payoff
    fx.sfx('break')
    fx.shake(0.8)
    fx.slowmo(0.4, 0.35)
    fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 22 })
    fx.hit({ damage: 10, knockback: { x: 9, y: 5, spin: 1.5 }, hitStun: 30, ragdoll: 1 })
    fx.caption('EARLY WITHDRAWAL PENALTY')
    thaw()
  })
  fx.after(134, thaw) // failsafe: the ice ALWAYS melts, the tint ALWAYS restores
  fx.after(46, end) // Pingo is free while the foe stays vaulted — smack the block
}

// SPECIAL 2 (SUPER) — Belly of the Exchange: 3-pass pinball of pure liquidity
function bellyExchangeScript(fx) {
  const end = onceEnd(fx)
  fx.caption('BELLY OF THE EXCHANGE!')
  fx.announcer('THE BELLY OF THE EXCHANGE')
  fx.sfx('boing')
  fx.zoom(fx.self, 0.6)
  fx.slowmo(0.55, 0.5)
  fx.shake(0.4)
  let dir = fx.self.facing
  let passes = 0
  let cooldown = 0
  let rolling = false
  let bounds = { min: -8.2, max: 8.2 }
  try {
    const b = fx.arena()?.bounds
    if (b) bounds = { min: b.minX + 0.9, max: b.maxX - 0.9 }
  } catch { /* arena optional */ }
  fx.after(12, () => { rolling = true; fx.sfx('slide') })
  fx.frame((age) => {
    if (!rolling || passes >= 3) return
    if (age % 2 === 0) {
      fx.impulse(fx.self, [dir * 3.2, 0, 0])
      if (age % 6 === 0) fx.particles('smoke', v3(fx.self.pos.x - dir * 0.5, 0.3, 0), { n: 3 })
    }
    if (cooldown > 0) cooldown--
    // run the foe over — once per pass
    if (cooldown === 0 && inRange(fx, 1.3)) {
      passes++
      cooldown = 26
      const last = passes >= 3
      fx.sfx(last ? 'explosion' : 'punch_heavy', { pitch: 1 - passes * 0.08 })
      fx.shake(last ? 1 : 0.6)
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: last ? 24 : 10 })
      if (last) {
        fx.slowmo(0.3, 0.6)
        fx.hit({ damage: 14, knockback: { x: 13, y: 7, spin: 3 }, hitStun: 40, ragdoll: 2 })
        fx.coins(v3(fx.foe.pos.x, 1.2, 0), 16)
        fx.caption('MARKET FLATTENED')
        rolling = false
      } else {
        fx.hit({ damage: 8, knockback: { x: 4, y: 5, spin: 1.5 }, hitStun: 30, ragdoll: 1 })
      }
    }
    // wall bounce — the exchange has no exit
    if (fx.self.pos.x <= bounds.min && dir < 0) {
      dir = 1
      fx.sfx('boing')
      fx.shake(0.5)
      fx.particles('impact', v3(bounds.min, 0.8, 0), { n: 6 })
    } else if (fx.self.pos.x >= bounds.max && dir > 0) {
      dir = -1
      fx.sfx('boing')
      fx.shake(0.5)
      fx.particles('impact', v3(bounds.max, 0.8, 0), { n: 6 })
    }
  })
  fx.after(160, () => { rolling = false })
  fx.after(186, end)
}

// SPECIAL 3 — Unstable Prototype: deploys a machine. Rolls the dice. Literally.
function prototypeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const mx = clampToArena(fx, fx.self.pos.x + F * 1.6)
  fx.caption('UNSTABLE PROTOTYPE')
  fx.sfx('menu_confirm')
  const roll = Math.floor(Math.random() * 4)
  let machine = null
  fx.after(12, () => {
    machine = fx.spawnProp('crate', v3(mx, 0.5, 0))
    styleProp(machine, 0x2e6f6a)
    fx.particles('smoke', v3(mx, 0.6, 0), { n: 6 })
    fx.sfx('thud')
  })
  fx.after(36, () => {
    switch (roll) {
      case 0: { // FREEZE BEAM
        fx.caption('OUTCOME: FREEZE BEAM')
        fx.sfx('whoosh', { pitch: 1.7 })
        for (let i = 0; i < 6; i++) {
          fx.particles('sparks', v3(clampToArena(fx, mx + F * (0.6 + i * 0.7)), 1.0, 0), { n: 4 })
        }
        if (Math.abs(fx.foe.pos.x - mx) < 5.5) {
          const unfreeze = freezeTint(fx.foe)
          fx.hit({ damage: 8, knockback: { x: 2, y: 0 }, hitStun: 70 })
          fx.caption('FLASH FROZEN')
          fx.after(72, unfreeze) // failsafe: always restores
        }
        break
      }
      case 1: { // MINI ROCKET
        fx.caption('OUTCOME: MINI ROCKET')
        const r = fx.spawnProp('rocket', v3(mx, 1.2, 0))
        if (r) { try { fx.impulse(r, [F * 12, 6, 0], 2) } catch { /* prop gone */ } }
        fx.sfx('launch')
        fx.after(14, () => {
          if (Math.abs(fx.foe.pos.x - mx) < 8) {
            fx.sfx('explosion')
            fx.shake(0.9)
            fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 20 })
            fx.hit({ damage: 14, knockback: { x: 11, y: 6, spin: 2 }, hitStun: 32, ragdoll: 1 })
          } else {
            fx.caption('ROCKET MISSED. FILING A BUG.')
          }
        })
        break
      }
      case 2: { // GIANT SPRING LAUNCHER
        fx.caption('OUTCOME: GIANT SPRING')
        fx.sfx('boing')
        const spring = fx.spawnProp('box', v3(clampToArena(fx, fx.foe.pos.x), 0.3, 0.7))
        styleProp(spring, 0xd8dee8, [0.8, 0.5, 0.8])
        if (spring) { try { fx.impulse(spring, [0, 6, 0]) } catch { /* prop gone */ } }
        if (Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) < 7) {
          fx.shake(0.6)
          fx.hit({ damage: 10, knockback: { x: 2, y: 14, spin: 2.5 }, hitStun: 40, ragdoll: 1 })
          fx.caption('TO THE MOON. LITERALLY.')
        }
        break
      }
      default: { // COMEDIC EXPLOSION — launches BOTH fighters
        fx.caption('OUTCOME: CATASTROPHIC SUCCESS')
        fx.sfx('explosion')
        fx.shake(1.2)
        fx.slowmo(0.35, 0.6)
        fx.particles('impact', v3(mx, 1.0, 0), { n: 30 })
        fx.coins(v3(mx, 1.2, 0), 10)
        if (machine) { try { machine.break?.() } catch { /* already broken */ } }
        if (Math.abs(fx.foe.pos.x - mx) < 6) {
          fx.hit({ damage: 10, knockback: { x: 12, y: 8, spin: 2.5 }, hitStun: 36, ragdoll: 2 })
        }
        try { fx.ragdoll(fx.self, [-F * 9, 8, 0]) } catch { /* ragdoll optional */ }
        fx.announcer('IT WORKED. TECHNICALLY.')
        break
      }
    }
  })
  fx.after(72, () => {
    if (machine && roll !== 3) { try { fx.impulse(machine, [-F * 3, 5, 1], 2) } catch { /* prop gone */ } }
  })
  fx.after(90, end)
}

// SPECIAL 4 — Penguin Airdrop: 5 drones, oversized coins, zero liability
function airdropScript(fx) {
  const end = onceEnd(fx)
  const tx = clampToArena(fx, fx.foe.pos.x)
  fx.caption('PENGUIN AIRDROP INBOUND')
  fx.announcer('AIRDROP CONFIRMED')
  fx.sfx('menu_confirm')
  let hits = 0
  for (let i = 0; i < 5; i++) {
    fx.after(16 + i * 12, () => {
      const dx = clampToArena(fx, tx + (i - 2) * 0.7)
      // tiny penguin drone (the parachute is implied and underfunded)
      const drone = fx.spawnProp('box', v3(dx, 5.6, (i % 2 ? 0.4 : -0.4)))
      styleProp(drone, 0x252c3a, [0.45, 0.5, 0.45])
      fx.sfx('whoosh', { pitch: 1.5 + i * 0.08 })
      // ...dropping an oversized coin directly on the target zone
      const coin = fx.spawnProp('coin', v3(dx, 4.6, 0))
      if (coin) {
        try { coin.mesh?.scale?.setScalar?.(2.3); fx.impulse(coin, [0, -6, 0]) } catch { /* prop gone */ }
      }
      fx.after(16, () => { // the coin arrives
        fx.particles('coins', v3(dx, 0.6, 0), { n: 5 })
        fx.sfx('coin', { pitch: 0.7 + i * 0.1 })
        if (Math.abs(fx.foe.pos.x - dx) < 1.2) {
          hits++
          const last = i === 4
          fx.shake(last ? 0.8 : 0.4)
          fx.hit(last || hits >= 3
            ? { damage: 6, knockback: { x: 4, y: 6, spin: 1.5 }, hitStun: 28, ragdoll: 1 }
            : { damage: 4, knockback: { x: 2, y: 3, spin: 0.6 }, hitStun: 20 })
          fx.caption(last ? 'FULLY VESTED' : 'AIRDROP RECEIVED')
        }
      })
    })
  }
  fx.after(96, end)
}

// JOKE — Cold Wallet: a comically tiny frozen USB stick. He forgot the passphrase.
function coldWalletScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('COLD WALLET.')
  fx.sfx('menu_move')
  let usb = null
  fx.after(20, () => {
    usb = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.55, 1.05, 0.15), { mass: 0.2 })
    styleProp(usb, C.ice, [0.16, 0.1, 0.3]) // tiny. frozen. worth 9 figures. allegedly.
    fx.sfx('coin', { pitch: 2 })
  })
  fx.after(46, () => fx.caption('...THE SEED PHRASE IS INSIDE THE ICE'))
  fx.after(64, () => {
    if (inRange(fx, 1.6)) {
      fx.sfx('punch_light', { pitch: 1.9 })
      fx.shake(0.5)
      fx.slowmo(0.35, 0.5)
      fx.hit({ damage: 1, knockback: { x: 3, y: 4, spin: 2.5 }, hitStun: 26, ragdoll: 1 })
      fx.caption('SLIPPED ON THE ICE! 1 DAMAGE!')
      fx.announcer('NOT YOUR KEYS')
    } else {
      fx.caption('SHRUG.')
    }
    if (usb) { try { fx.impulse(usb, [F * 3, 4, 1], 3) } catch { /* prop gone */ } }
  })
  fx.after(84, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const FattyPingoDef = {
  id: 'fatty-pingo',
  name: 'FATTY PINGO',
  title: 'The Frozen Inventor',
  bio: 'Carved the first hardware wallet out of an actual glacier and has been "one prototype away" from fixing finance ever since. The belly is not a weakness — it is a load-bearing innovation: shock absorber, battering ram, and cold-storage facility in one. He has never once stayed knocked down.',
  style: 'Round powerhouse gadgeteer. Nearly impossible to knock over, back up faster than any fighter alive, and every pocket of the backpack is a lawsuit waiting to happen. Traps with ice, closes with the belly.',
  stats: { power: 6, speed: 5, defense: 8, chaos: 7 },
  height: 1.6,
  weight: 1.3,
  walkSpeed: 4.4,
  dashSpeed: 9.5,
  jumpVel: 8.0,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'wing-slap', name: 'Wing Slap', kind: 'light',
      input: ['light'],
      damage: 6, startup: 5, active: 4, recovery: 9,
      hitbox: { w: 1.1, h: 0.7, d: 0.9, forward: 0.9, up: 0.9 },
      knockback: { x: 5, y: 1.5, spin: 0.4 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'wingSlap', sfx: 'punch_light', script: null,
    },
    {
      id: 'beak-jab', name: 'Beak Jab', kind: 'light',
      input: ['forward', 'light'],
      damage: 5, startup: 4, active: 3, recovery: 8,
      hitbox: { w: 0.9, h: 0.6, d: 0.8, forward: 1.0, up: 1.0 },
      knockback: { x: 3.5, y: 1, spin: 0.2 },
      hitStun: 12, blockStun: 7, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'beakJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'belly-bounce', name: 'Belly Bounce', kind: 'heavy',
      input: ['heavy'],
      damage: 12, startup: 9, active: 5, recovery: 13,
      hitbox: { w: 1.2, h: 1.0, d: 1.0, forward: 0.8, up: 0.8 },
      knockback: { x: 12, y: 3, spin: 0.6 },
      hitStun: 20, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 4, // the belly absorbs monetary policy
      clip: 'bellyBounce', sfx: 'boing',
      script: bellyBounceScript,
    },
    {
      id: 'ice-slide', name: 'Ice Slide', kind: 'kick',
      input: ['kick'],
      damage: 8, startup: 7, active: 10, recovery: 13,
      hitbox: { w: 1.1, h: 0.7, d: 0.9, forward: 0.9, up: 0.4 },
      knockback: { x: 8, y: 2.5, spin: 1 },
      hitStun: 18, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'iceSlide', sfx: 'slide',
      script: iceSlideScript,
    },
    {
      id: 'backpack-burst', name: 'Backpack Burst', kind: 'heavy',
      input: ['back', 'heavy'],
      damage: 7, startup: 8, active: 4, recovery: 12,
      hitbox: { w: 1.1, h: 1.1, d: 1.0, forward: 0.8, up: 0.9 },
      knockback: { x: 13, y: 2, spin: 0.8 },
      hitStun: 18, blockStun: 14, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'backpackBurst', sfx: 'explosion',
      script: backpackBurstScript,
    },
    {
      id: 'wrench-strike', name: 'Wrench Strike', kind: 'launcher',
      input: ['forward', 'heavy'],
      damage: 10, startup: 11, active: 4, recovery: 15,
      hitbox: { w: 1.0, h: 1.5, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 2, y: 10, spin: 1.4 },
      hitStun: 26, blockStun: 12, hitStop: 6,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'wrenchStrike', sfx: 'punch_heavy',
      script: wrenchStrikeScript,
    },
    {
      id: 'snowball-toss', name: 'Snowball Toss', kind: 'light',
      input: ['down', 'light'],
      damage: 6, startup: 10, active: 6, recovery: 14,
      hitbox: { w: 1.0, h: 0.8, d: 0.8, forward: 1.4, up: 1.0 },
      knockback: { x: 6, y: 2, spin: 0.5 },
      hitStun: 16, blockStun: 9, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'snowballToss', sfx: 'whoosh',
      script: snowballScript,
    },
    {
      id: 'rocket-hop', name: 'Rocket Hop', kind: 'launcher',
      input: ['down', 'kick'],
      damage: 11, startup: 10, active: 8, recovery: 18,
      hitbox: { w: 1.0, h: 1.4, d: 0.9, forward: 0.7, up: 1.2 },
      knockback: { x: 3, y: 11, spin: 1.5 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'rocketHop', sfx: 'launch',
      script: rocketHopScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'cold-shoulder', name: 'Cold Shoulder', kind: 'grab',
      input: ['grab'],
      damage: 11, startup: 8, active: 4, recovery: 42,
      hitbox: { w: 0.9, h: 1.0, d: 0.9, forward: 0.9, up: 0.8 },
      // brief freeze-up, then a full-body pack-check across the arena
      knockback: { x: 11, y: 2.5, spin: 1 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'coldShoulder', sfx: 'grab', script: null,
    },
    {
      id: 'penguin-piledriver', name: 'Penguin Piledriver', kind: 'grab',
      input: ['down', 'grab'],
      damage: 14, startup: 9, active: 3, recovery: 48,
      hitbox: { w: 0.9, h: 1.0, d: 0.9, forward: 0.9, up: 0.8 },
      // hoist, flip, belly-first delivery — signed, sealed, flattened
      knockback: { x: 2, y: 7, spin: 2.5 },
      hitStun: 34, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'piledriver', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'frozen-assets', name: 'Frozen Assets', kind: 'special',
      input: ['special'],
      damage: 12, startup: 10, active: 4, recovery: 25,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 1.3, up: 1.1 },
      knockback: { x: 8, y: 3, spin: 1.0 },
      hitStun: 36, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'coldStorage', sfx: 'slide',
      script: frozenAssetsScript,
    },
    {
      id: 'cold-storage', name: 'Cold Storage', kind: 'special',
      input: ['down', 'special'],
      damage: 16, startup: 10, active: 8, recovery: 28,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 0.9 },
      knockback: { x: 9, y: 5, spin: 1.5 },
      hitStun: 40, blockStun: 14, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'coldStorage', sfx: 'block',
      script: coldStorageScript,
    },
    {
      id: 'unstable-prototype', name: 'Unstable Prototype', kind: 'special',
      input: ['forward', 'special'],
      damage: 14, startup: 12, active: 60, recovery: 18,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.2, up: 1.0 },
      knockback: { x: 11, y: 6, spin: 2 },
      hitStun: 32, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'prototype', sfx: 'menu_confirm',
      script: prototypeScript,
    },
    {
      id: 'penguin-airdrop', name: 'Penguin Airdrop', kind: 'special',
      input: ['back', 'special'],
      damage: 15, startup: 12, active: 66, recovery: 18,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 4, y: 6, spin: 1.5 },
      hitStun: 28, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'airdrop', sfx: 'menu_confirm',
      script: airdropScript,
    },
    {
      id: 'belly-of-the-exchange', name: 'Belly of the Exchange', kind: 'super',
      input: ['super'],
      damage: 30, startup: 12, active: 150, recovery: 26,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 0.8, up: 0.8 },
      knockback: { x: 13, y: 7, spin: 3 },
      hitStun: 40, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100,
      armor: 20, // a rolling penguin cannot be margin-called
      clip: 'bellyExchange', sfx: 'boing',
      script: bellyExchangeScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'cold-wallet', name: 'Cold Wallet', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 30, active: 6, recovery: 48,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 0.9 },
      knockback: { x: 3, y: 4, spin: 2.5 },
      hitStun: 26, blockStun: 8, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'coldWallet', sfx: 'menu_move',
      script: coldWalletScript,
    },
  ],

  finisher: {
    id: 'frozen-assets',
    name: 'Frozen Assets',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      fx.slowmo(0.45, 1.2)
      fx.zoom(fx.foe, 0.8)
      fx.caption('FROZEN ASSETS')
      fx.announcer('FROZEN ASSETS')
      fx.sfx('bell')
      fx.shake(0.4)
      fx.self.playClip?.('frozenAssets')

      // deep-freeze the foe SOLID
      const unfreeze = freezeTint(fx.foe)
      const removeIce = makeIceShell(fx.foe, 1.6)
      let thawed = false
      const thaw = () => {
        if (thawed) return
        thawed = true
        try { removeIce() } catch { /* cosmetic */ }
        try { unfreeze() } catch { /* cosmetic */ }
      }
      fx.hit({ damage: 4, knockback: { x: 0, y: 0 }, hitStun: 180 })
      fx.particles('sparks', v3(fx.foe.pos.x, 1.0, 0), { n: 16 })
      fx.sfx('block', { pitch: 1.6 })

      // obstacles downrange — the pinball table assembles itself
      const x0 = fx.foe.pos.x
      const obstacles = []
      fx.after(14, () => {
        const kinds = ['crate', 'chair', 'monitor']
        for (let i = 0; i < 3; i++) {
          const o = fx.spawnProp(kinds[i], v3(clampToArena(fx, x0 + F * (2.2 + i * 1.8)), 0.6, (i - 1) * 0.35))
          if (o) obstacles.push(o)
        }
      })

      // THE SLIDE — ice block scrapes across the whole arena
      fx.after(22, () => fx.sfx('slide'))
      for (let i = 0; i < 8; i++) {
        fx.after(24 + i * 3, () => {
          fx.impulse(fx.foe, [F * 4.5, 0, 0])
          fx.particles('smoke', v3(fx.foe.pos.x, 0.15, 0), { n: 2 })
        })
      }
      // pinball impacts through each obstacle
      for (let i = 0; i < 3; i++) {
        fx.after(32 + i * 8, () => {
          const o = obstacles[i]
          if (o) { try { fx.impulse(o, [F * 7, 7, (i - 1) * 3], 3) } catch { /* prop gone */ } }
          fx.sfx('break')
          fx.shake(0.7)
          fx.particles('impact', v3(fx.foe.pos.x + F * 0.6, 0.9, 0), { n: 10 })
        })
      }
      // wall — DING — reverse
      fx.after(58, () => {
        fx.sfx('boing')
        fx.shake(1)
        fx.particles('sparks', v3(fx.foe.pos.x, 0.9, 0), { n: 12 })
        fx.caption('INSUFFICIENT WALL')
      })
      for (let i = 0; i < 7; i++) {
        fx.after(60 + i * 3, () => {
          fx.impulse(fx.foe, [-F * 4.5, 0, 0])
          fx.particles('smoke', v3(fx.foe.pos.x, 0.15, 0), { n: 2 })
        })
      }
      fx.after(74, () => { // back through the wreckage
        fx.sfx('thud')
        fx.shake(0.7)
        for (const o of obstacles) {
          try { fx.impulse(o, [-F * 5, 5, (Math.random() - 0.5) * 4], 2) } catch { /* prop gone */ }
        }
      })
      fx.after(88, () => { // other wall — DING
        fx.sfx('boing')
        fx.shake(0.9)
        fx.particles('sparks', v3(fx.foe.pos.x, 0.9, 0), { n: 10 })
      })

      // SHATTER — into blocky, harmless, fully-audited ice pieces
      const pieces = []
      fx.after(102, () => {
        thaw()
        fx.sfx('break')
        fx.shake(1.2)
        fx.slowmo(0.3, 0.8)
        fx.zoom(fx.foe, 0.9)
        fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 30 })
        fx.caption('POSITION SHATTERED')
        for (let i = 0; i < 6; i++) {
          const p = fx.spawnProp('box', v3(clampToArena(fx, fx.foe.pos.x + (Math.random() - 0.5) * 1.2), 0.8 + (i % 3) * 0.4, (Math.random() - 0.5) * 0.8), { mass: 0.4 })
          styleProp(p, C.ice, [0.4, 0.4, 0.4])
          if (p) {
            pieces.push(p)
            try { fx.impulse(p, [(Math.random() - 0.5) * 8, 5 + Math.random() * 4, (Math.random() - 0.5) * 5], 3) } catch { /* prop gone */ }
          }
        }
      })

      // ...and the pieces comically REASSEMBLE. Accounting demands it.
      fx.after(132, () => {
        fx.caption('REASSEMBLING ASSETS...')
        fx.sfx('coin', { pitch: 1.6 })
        for (let i = 0; i < pieces.length; i++) {
          fx.after(2 + i * 2, () => {
            const p = pieces[i]
            fx.particles('smoke', v3(fx.foe.pos.x, 0.8, 0), { n: 2 })
            if (p) { try { p.remove?.() } catch { /* already gone */ } }
          })
        }
      })

      // the KO — reassembled, re-audited, ragdolled
      fx.after(152, () => {
        fx.sfx('ko')
        fx.shake(1)
        fx.slowmo(0.35, 0.7)
        fx.hit({ damage: 20, knockback: { x: 12, y: 8, spin: 3 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 11, 9, 0])
        fx.coins(v3(fx.foe.pos.x, 1.4, 0), 20)
        fx.announcer('ASSETS PERMANENTLY FROZEN')
      })

      fx.after(176, thaw) // ultimate failsafe: tint + shell can never leak
      fx.after(178, end)
    },
  },

  voice: { pitch: 1.3, rate: 1.05 },
}
