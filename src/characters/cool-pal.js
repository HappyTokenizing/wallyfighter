// COOL PAL — The Unbothered One.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
//
// A capybara: a semi-aquatic grazing-rodent skull carried dead level at chest
// height on a barrel. Flat-topped head brick, dorsal nostrils, morrillo gland,
// two coin ears at the rear corners, a whole citrus fruit parked on the crown,
// a drink he never has to hold and a bird he has never acknowledged.
//
// GRAPHICS_CONTRACT v3.0: every surface goes through pbr() with a real SURFACE
// preset, every hard edge is bevelled geometry (no raw BoxGeometry / SphereGeometry
// / CylinderGeometry anywhere), every joint is sleeved, and the face is built from
// real sclera + iris + pupil + a specular pip + lid shells + brow mounds.
// All geometry, animation and move scripts are procedural — no assets, no deps.
import * as THREE from 'three'
import { makeMaterialFactory } from '../render/index.js'
import {
  roundedBox, taperedBox, taperedCapsule, roundedCylinder, roundedCone,
  jointBall, sleeve, skirt, filletRing, superellipsoid, capsuloid, loft, mergeParts,
  plate, lens, splineTube, profileLathe, superellipsePoints, roundedRectPoints, circlePoints,
  isSharedGeometry,
} from '../render/geometry.js'

// ---------------------------------------------------------------------------
// palette — GRAPHICS_CONTRACT §0: every channel stays inside 30..240 sRGB.
// The organic value ladder, darkest -> lightest:
//   pupil .12 < morrillo .16 < iris .18 < rhinarium .20 < faceDark .23 <
//   furShadow .28 < skinUnder .34 < sclera .36 < furBase .43 < furWarm .52 <
//   furBelly .65 < incisor .79 < incisorCore .83
// The coat deliberately lives in a narrow 0.23-0.65 band: he separates from an
// arena by SHAPE and RIM, not by contrast.
// ---------------------------------------------------------------------------
const C = {
  pupil: 0x231f1e,
  morrillo: 0x34281e,
  iris: 0x3c2c20,
  rhinarium: 0x3f3029,
  nostrilDark: 0x2e2521,
  faceDark: 0x4a382a,
  furShadow: 0x5a4330,
  skinUnder: 0x6e5142,
  sclera: 0x6b5b4a,
  furBase: 0x8b6a45,
  furWarm: 0xa8814f,
  furBelly: 0xc4a277,
  incisor: 0xe8c87a,
  incisorCore: 0xded3be,
  // wardrobe + props (costume 0 / costume 1)
  knit0: 0xc98a2e, knitRib0: 0x9e6a1e,
  knit1: 0x3e9e86, knitRib1: 0x2c7a67,
  canvas0: 0x5e6a40, canvasCuff0: 0x48522f,
  canvas1: 0x4e6472, canvasCuff1: 0x3e4f5b,
  leatherTan: 0x8a6f4d,
  soleRubber: 0x3a342c,
  phoneShell: 0x2a2e38,
  // Ear-cup accent ring. Desaturated ~35% off the brief's #E0703A / #3CA0F0:
  // at full chroma the two 0.086 m rings were the most saturated thing on the
  // model and out-shouted the yuzu, which the colour script forbids — nothing
  // may out-value or out-chroma the fruit. Luma is unchanged (0.52 / 0.57).
  phoneAccent0: 0xbd7a4f, phoneAccent1: 0x5e93b4,
  metalTrim: 0x9aa3ad,
  drinkGlass: 0xdce8ea,
  citrus: 0xefa23c,
  yuzu0: 0xe4be4e, yuzu1: 0xa9c64f,
  birdSlate: 0x4b5560,
  birdCream0: 0xbfac84, birdCream1: 0xb4b8a6,
  mouthDark: 0x5c3a38,
  nail: 0x7a6a55,
  // arena vignette dressing (move-script decor, not part of the fighter)
  grass: 0x3fae4e,
  grassDark: 0x2f8f3e,
  white: 0xe8eaee,
  red: 0xdc4048,
}

// ---------------------------------------------------------------------------
// tiny procedural-model helpers (inline — character files are self-contained)
// Everything routes through src/render/: pbr() for materials, the bevel toolkit
// for geometry. Nothing here builds a raw built-in primitive any more.
// ---------------------------------------------------------------------------

/** one-off material for a disposable decor prop (move scripts dispose these). */
const decorFactory = makeMaterialFactory({ scope: 'cool-pal/decor', share: false })
function decorMat(color, surface = 'default', opts = {}) {
  return decorFactory.pbr(color, surface, { ...opts, unique: true })
}

function mesh(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

// bevelled stand-ins for the three primitives this file used to reach for.
// `box` keeps its old signature so the decor builders below read unchanged.
function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const r = Math.min(0.035, Math.min(w, h, d) * 0.28)
  return mesh(roundedBox(w, h, d, r, 2), material, x, y, z, rx, ry, rz)
}

/**
 * orb(r, seg) — a sphere with ANALYTIC normals. `ball()` hands back a real
 * THREE.SphereGeometry, which still trips adoptionReport()'s raw-primitive
 * check and whose averaged pole normals throw black specks; superellipsoid at
 * e = 2 is the same shape with the implicit gradient as its normal field.
 */
function orb(r, seg = 20) { return superellipsoid(r, r, r, 2, 2, seg) }

function sph(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = mesh(orb(r, 18), material, x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}

function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const rim = Math.min(0.02, Math.min(rTop, rBottom, h * 0.5) * 0.3)
  return mesh(roundedCone(rBottom, rTop, h, rim, 18, 2), material, x, y, z, rx, ry, rz)
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

/** a static, non-bone posing group — keeps the 12-bone hierarchy untouched. */
function poseGroup(parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.set(rx, ry, rz)
  parent.add(g)
  return g
}

const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// hips, rump, trousers, the tail nub and the belt holster.
// Bone origin is world (0, 0.85, 0) — HIP_Y, locked: every hips key in all 33
// clips is authored against it. Local y = world y - 0.85.
// ---------------------------------------------------------------------------
function buildHips(hips, S) {
  // The seat: one lofted canvas shell from the crotch to the knit hem. Squared
  // off at the back — capybaras have a blunt rear end — and no waist at all.
  const seat = loft([
    // The seat stops at world y = 0.735 — the crotch — so the leg slot below it
    // belongs to the two trouser legs alone. Round 1 carried it down to 0.695
    // and then filled 0.64-0.74 with a belly ring, which closed the top third
    // of the slot and turned the silhouette below the belt into a skirt.
    { y: -0.115, shape: superellipsePoints(0.40, 0.36, 2.7, 22), offset: [0.02, 0] },
    { y: -0.050, shape: superellipsePoints(0.58, 0.50, 2.8, 22), offset: [0.01, 0] },
    { y: 0.030, shape: superellipsePoints(0.62, 0.54, 2.9, 22), offset: [0.01, 0] },
    { y: 0.120, shape: superellipsePoints(0.60, 0.52, 2.8, 22), offset: [0.01, 0] },
  ], { subdivide: 2, up: [0, 0, 1] })
  hips.add(mesh(seat, S.canvas))

  // rolled waistband + a hint of belt, sitting under the open cardigan
  hips.add(mesh(roundedCylinder(0.315, 0.055, 0.022, 20, 2), S.canvasCuff, 0.01, 0.115, 0))
  hips.add(mesh(filletRing(0.305, 0.016, 8, 26), S.canvasCuff, 0.01, 0.095, 0))

  // Closes the gap between waistband and thigh. Round 1 built this in furBelly
  // and it swept across both trouser fronts as a pale tan crescent that read as
  // a banana pasted on the legs — a colour zone with no business being there.
  // It is canvas now: its job is to close a seam, not to be seen.
  hips.add(mesh(sleeve(0.285, 0.235, 0.075, { bulge: 0.04, radialSeg: 20 }), S.canvas,
    0.02, -0.070, 0, Math.PI, 0, 0))

  // --- vestigial tail. Present, deliberate, 5 cm. The joke is that it exists.
  const tail = mesh(taperedCapsule(0.031, 0.022, 0.016, 3, 12), S.furShadow,
    -0.272, 0.105, 0, 0, 0, Math.PI / 2)
  hips.add(tail)
  hips.add(mesh(filletRing(0.030, 0.010, 6, 16), S.fur, -0.252, 0.105, 0, 0, 0, Math.PI / 2))

  buildHolster(hips, S)
}

// The drink lives in a belt holster on the midline, never in a paw: both paws
// are in pockets in the idle and a held object on the far arm is invisible in
// the profile camera. Tilted 14° forward so the rim reaches x=+0.412 against a
// belly front of +0.320 — 0.092 m proud of the torso outline.
function buildHolster(hips, S) {
  // ON THE LOADED HIP, NOT THE MIDLINE. Round 1 put the socket at z = 0 and the
  // tumbler landed dead centre in front of the crotch, reading as a lit candle
  // on a plinth. Moved out to z = +0.165 it sits on the hip, the rim breaks the
  // TORSO OUTLINE at the side where a silhouette element can actually do work,
  // and the citrus wheel — the model's only saturated warm below the head —
  // lands on the outline edge instead of in the middle of a brown mass.
  const g = poseGroup(hips, 0.288, 0.015, 0.165)
  g.name = 'prop_drink'
  g.userData.noMerge = true
  // canvas pouch + a strap running back to a loop
  g.add(mesh(roundedCylinder(0.050, 0.150, 0.012, 18, 2), S.canvasCuff, 0, 0, 0))
  g.add(mesh(filletRing(0.052, 0.009, 6, 20), S.canvasCuff, 0, 0.070, 0))
  g.add(mesh(roundedBox(0.075, 0.026, 0.018, 0.008, 2), S.canvasCuff, -0.048, 0.040, 0))

  const t = poseGroup(g, 0.012, 0.045, 0, 0, 0, -14 * DEG)
  // thin-walled tumbler. 'glass' preset with transmission forced to 0: real
  // transmission costs a whole extra scene render per material and there are
  // two fighters on screen. Honest alpha gets the read for free.
  t.add(mesh(roundedCylinder(0.044, 0.200, 0.006, 18, 2), S.glass, 0, 0, 0))
  // 72% fill. It tilts with the glass and it never spills — one of his three
  // props that prove nothing disturbs him (the others: the fruit and the bird).
  t.add(mesh(roundedCylinder(0.038, 0.144, 0.004, 16, 1), S.liquid, 0, -0.026, 0))
  // citrus wheel notched onto the rim — the only saturated warm on the model,
  // and the forward tilt puts it exactly on the silhouette edge.
  t.add(mesh(plate(circlePoints(0.035, 14), 0.008, 0.0035, { crown: 0.001, rimSeg: 1 }), S.citrus,
    0.030, 0.098, 0, 0, 0, 20 * DEG))
  // bent straw
  t.add(mesh(splineTube([[0, -0.05, 0.012], [0.004, 0.03, 0.012], [0.012, 0.088, 0.012],
    [0.046, 0.116, 0.016]], 0.006, 10, null, { radialSeg: 6, roundEnd: true }), S.phoneAccent))
}

// ---------------------------------------------------------------------------
// legs — single rigid segment, hip to sandal. There are no shin bones, so all
// knee "bend" comes from silhouette shaping and the trouser cloth.
// Bone origin world (0, 0.83, ±0.17). Leg length = 40% of standing height.
// ---------------------------------------------------------------------------
function buildLeg(leg, S, side) {
  // THE LEG SLOT. Round 1 built the trouser as a circular cone of top radius
  // 0.192 on hip sockets at z = ±0.170, so the two legs INTERPENETRATED across
  // the midline and the silhouette below the belt was a solid skirt from crotch
  // to mid-calf. The leg is now an elliptical loft: still deep fore-and-aft
  // (0.30 -> 0.22 in X, so it keeps its mass in the profile camera, which is
  // the camera the player actually has) but narrow laterally, opening a
  // 0.14 m x 0.30 m slot from the crotch that widens below the cuff.
  const trouser = loft([
    { y: 0.060, shape: superellipsePoints(0.280, 0.320, 2.6, 20), offset: [0.010, 0] },
    { y: -0.030, shape: superellipsePoints(0.236, 0.310, 2.7, 20), offset: [0.012, 0] },
    { y: -0.130, shape: superellipsePoints(0.198, 0.300, 2.7, 20), offset: [0.010, 0] },
    { y: -0.300, shape: superellipsePoints(0.186, 0.272, 2.7, 20), offset: [0.006, 0] },
    { y: -0.440, shape: superellipsePoints(0.184, 0.248, 2.7, 20), offset: [0.004, 0] },
    { y: -0.520, shape: superellipsePoints(0.190, 0.236, 2.7, 20), offset: [0.004, 0] },
  ], { subdivide: 2, up: [0, 0, 1] })
  leg.add(mesh(trouser, S.canvas))
  // rolled cuff at world y = 0.300 — a hard cross-leg line, 0.04 luma below the
  // bare ankle fur so it actually reads.
  leg.add(mesh(roundedCylinder(0.104, 0.052, 0.020, 18, 2), S.canvasCuff, 0.005, -0.530, 0))
  leg.add(mesh(filletRing(0.102, 0.018, 8, 24), S.canvasCuff, 0.005, -0.548, 0))

  // bare furry ankle below the cuff, sleeved up INTO the trouser so no gap can
  // ever open at the hem (contract §9).
  leg.add(mesh(roundedCone(0.0825, 0.096, 0.32, 0.016, 18, 2), S.furLimb, 0.004, -0.650, 0))
  leg.add(mesh(sleeve(0.100, 0.114, 0.07, { bulge: 0.05, radialSeg: 18 }), S.furLimb,
    0.004, -0.560, 0))
  // Outer-limb dark stripe — real capybara marking, and a 0.20 value break down
  // the outboard edge of the leg.
  // ROUND 4 — THIS WAS THE "dark cylinder interpenetrating the ankle fur". It
  // was a 0.052 x 0.036 superellipsoid SLAB centred at z = 0.082 on an ankle
  // whose surface radius at that height is 0.0897: half of it was inside the
  // leg and its outboard 0.010 stood clear of the fur as a separate object with
  // its own closed outline. It is a lens now — feathered to zero thickness at
  // the rim, rim 0.0002 inside the surface, apex 0.0028 proud — so it is a
  // MARKING on the limb rather than a lump beside it.
  leg.add(mesh(lens(0.028, 0.100, 0.005, { crown: 0.006, seg: 20, faceSeg: 2, rimSeg: 1 }),
    S.faceDark, 0.004, -0.640, 0.0825 * side))

  buildFoot(leg, S, side)
}

function buildFoot(leg, S, side) {
  // 11° outward splay, wide and planted
  const f = poseGroup(leg, 0.000, -0.800, 0, 0, -11 * DEG * side, 0)

  // footbed: contoured, with a raised toe ridge. plate() gives a real rolled rim.
  f.add(mesh(plate(roundedRectPoints(0.340, 0.220, 0.055, 3), 0.022, 0.009, { crown: 0.005, faceSeg: 2, rimSeg: 2 }),
    S.leather, 0.070, 0.000, 0, -Math.PI / 2, 0, 0))
  f.add(mesh(plate(roundedRectPoints(0.352, 0.232, 0.058, 3), 0.018, 0.007, { crown: 0.002, faceSeg: 1, rimSeg: 1 }),
    S.sole, 0.070, -0.021, 0, -Math.PI / 2, 0, 0))
  // polished wear ovals under heel and toes — roughness break, not a colour one
  f.add(mesh(plate(circlePoints(0.032, 10), 0.004, 0.0015, { rimSeg: 1 }), S.leather, -0.060, 0.012, 0, -Math.PI / 2, 0, 0))
  f.add(mesh(roundedBox(0.055, 0.012, 0.180, 0.006, 2), S.leather, 0.150, 0.014, 0))

  // two crossed straps with a buckle on the outer side
  for (const s of [1, -1]) {
    f.add(mesh(splineTube([[0.055 * s + 0.075, 0.006, -0.104], [0.028 * s + 0.075, 0.052, -0.055],
      [-0.028 * s + 0.075, 0.056, 0.055], [-0.055 * s + 0.075, 0.006, 0.104]],
    0.010, 10, null, { radialSeg: 5, aspect: 2.6 }), S.leather))
  }
  f.add(mesh(roundedBox(0.024, 0.020, 0.009, 0.004, 2), S.metal, 0.075, 0.030, 0.106 * side))

  // THREE broad blunt toes with hoof-like keratin nails, protruding 0.020 past
  // the footbed. Toes outside the footwear is a structural departure from the
  // source archetype's fully enclosed shoe, and it reads on the launcher's
  // hit-stop freeze frame from directly below.
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 14 * DEG
    const t = poseGroup(f, 0.185, 0.014, (i - 1) * 0.058, 0, a, 0)
    t.add(mesh(taperedCapsule(0.031, 0.024, 0.030, 3, 10), S.fur, 0.032, 0, 0, 0, 0, -Math.PI / 2))
    t.add(mesh(lens(0.016, 0.012, 0.011, { crown: 0.005, seg: 10, faceSeg: 1, rimSeg: 1 }), S.nail, 0.076, 0.004, 0, 0, Math.PI / 2, 0))
    // slight webbing filling the inner half of each inter-toe gap
    if (i < 2) t.add(mesh(plate(roundedRectPoints(0.048, 0.030, 0.010, 2), 0.010, 0.004, { rimSeg: 1 }), S.hide,
      0.014, -0.004, 0.029, -Math.PI / 2, 0, 0))
  }
}

// ---------------------------------------------------------------------------
// torso — a barrel that is WIDEST AT THE BELLY (0.76 m at y=1.06), not at the
// chest (0.66 at 1.24). That inversion is the whole read, and it is why the
// shoulder sockets come inboard to z=±0.30: at ±0.42 the arms hang outboard of
// everything, the belly stops being the widest mass and he reads as a gorilla.
// In profile the torso is a forward-tipped egg, fat end low: front-most point
// x=+0.32 at y=1.02, below and in front of the chest front (+0.26 at y=1.24).
// Bone origin world (0, 0.97, 0). Local y = world y - 0.97.
// ---------------------------------------------------------------------------
function buildTorso(torso, S) {
  // The belly is pushed to 0.775 across and the chest pulled to 0.63: round 1
  // measured 0.763 at the belly against 0.782 at the shoulder line, i.e. the
  // shoulders WERE the widest mass and the barrel read collapsed into a
  // gorilla. The inversion is the whole silhouette, so it is now enforced by
  // measurement (see the harness numbers in the report), not by intent.
  const barrel = loft([
    { y: -0.130, shape: superellipsePoints(0.56, 0.46, 2.7, 26), offset: [0.020, 0] },
    { y: -0.010, shape: superellipsePoints(0.745, 0.56, 2.8, 26), offset: [0.030, 0] },
    { y: 0.090, shape: superellipsePoints(0.775, 0.565, 2.8, 26), offset: [0.035, 0] },
    { y: 0.270, shape: superellipsePoints(0.630, 0.495, 2.7, 26), offset: [0.012, 0] },
    { y: 0.380, shape: superellipsePoints(0.600, 0.465, 2.6, 26), offset: [0.000, 0] },
    { y: 0.430, shape: superellipsePoints(0.530, 0.400, 2.5, 26), offset: [-0.010, 0] },
    { y: 0.455, shape: superellipsePoints(0.38, 0.270, 2.4, 26), offset: [-0.020, 0] },
  ], { subdivide: 2, up: [0, 0, 1], unique: true })
  // THE VENTRAL FIELD IS CARRIED ON THE BARREL ITSELF. Round 1 built it as two
  // proud meshes — a superellipse plate on the chest and a superellipsoid at
  // the throat — and head-on they read as a bread roll and a seashell glued to
  // his sternum, each with a hard rim and a texture phase that did not continue
  // the barrel's. AAA never lets a colour zone be a separate mesh. It is now a
  // vertex-colour blend on the barrel's own vertices with a 0.05 m noisy
  // transition, so the pelage grades and there is no line anywhere.
  gradeVentral(barrel)
  const barrelMesh = mesh(barrel, S.furGraded)
  // mergeParts()/autoMerge bake through `bakedCopy`, which carries position,
  // normal and uv only — a merge would silently drop the ventral colour
  // attribute and leave the whole barrel flat furBelly. It is the only mesh on
  // its material, so exempting it costs no draw call.
  barrelMesh.userData.noMerge = true
  torso.add(barrelMesh)

  // NO NECK. The head plugs straight into the shoulder mass; this plug is the
  // sleeve that keeps the joint closed at head yaw ±35° / pitch ±25°. Round 1
  // let daylight open between the skull's near edge and the shoulder in the
  // head-on view, so the plug is 0.03 larger in every direction and the ruff
  // ring below it now oversails the skull rear plate by 0.05.
  torso.add(mesh(superellipsoid(0.185, 0.150, 0.215, 2.7, 2.7, 18), S.fur, -0.095, 0.500, 0))
  torso.add(mesh(skirt(0.170, 0.255, 0.135, { curve: 0.65, radialSeg: 22 }), S.fur, -0.030, 0.470, 0))
  torso.add(mesh(filletRing(0.190, 0.036, 8, 26), S.fur, -0.050, 0.472, 0))

  // sun-hit upper planes: shoulder crest and rump crest carry the warmer value
  for (const side of [1, -1]) {
    torso.add(mesh(superellipsoid(0.135, 0.045, 0.095, 2.3, 2.3, 14), S.furWarm, 0.010, 0.425, 0.200 * side))
  }
  torso.add(mesh(superellipsoid(0.105, 0.038, 0.150, 2.3, 2.3, 14), S.furWarm, -0.190, 0.300, 0))
  // contact-AO band where the forearm lies against the belly — contract §0.1
  // wants occlusion in crevices, and in the 3/4 view this crevice is the only
  // thing separating the arm from the barrel.
  for (const side of [1, -1]) {
    torso.add(mesh(superellipsoid(0.055, 0.150, 0.022, 2.4, 2.4, 12), S.furShadow,
      0.055, 0.075, 0.318 * side, 0, 0, 0.06))
  }
  // rump whorl / bald patch: real capybaras go visibly bald here, and the
  // skin-through-the-coat mottle is the single most capybara-specific surfacing
  // call on the model.
  torso.add(mesh(superellipsoid(0.062, 0.090, 0.050, 2.2, 2.2, 12), S.skinUnder, -0.232, 0.150, 0.075))
  torso.add(mesh(superellipsoid(0.055, 0.070, 0.045, 2.2, 2.2, 12), S.skinUnder, -0.235, 0.075, -0.110))

  // contact-AO band where the slung headphone cushions press into the chest fur
  for (const side of [1, -1]) {
    torso.add(mesh(superellipsoid(0.075, 0.085, 0.020, 2.4, 2.4, 12), S.furShadow,
      0.215, 0.330, 0.250 * side, 0, 0, 0.35))
  }

  bristleClumps(torso, S, [
    [-0.150, 0.330, 0.000, 0.11], [-0.075, 0.400, 0.095, 0.09], [-0.075, 0.400, -0.095, 0.09],
    [-0.215, 0.240, 0.130, 0.10], [-0.215, 0.240, -0.130, 0.10], [-0.250, 0.120, 0.000, 0.09],
    [0.060, 0.440, 0.180, 0.08], [0.060, 0.440, -0.180, 0.08],
  ])

  buildCardigan(torso, S)
  buildPockets(torso, S)
  buildBird(torso, S)
}

// ---------------------------------------------------------------------------
// gradeVentral(geometry) — the ventral pelage, painted into the BARREL's own
// vertices instead of pasted on as a proud plate.
//
// `S.furGraded` has furBelly (#C4A277, luma .65) as its albedo; this attribute
// multiplies the dorsal vertices back down to furBase (#8B6A45, luma .43) in
// LINEAR space, across a soft boundary that is dithered by a position hash so
// the transition is ~0.05 m of noise and never a drawn line. Real pelage
// grades; §4 of the brief is explicit that this boundary must never be hard.
//
// Geometry must be built with `{ unique: true }` — the shared cache hands the
// same BufferGeometry to every instance and this mutates it.
// ---------------------------------------------------------------------------
const DORSAL_MUL = [0.4676, 0.3992, 0.3220]   // linear furBase / furBelly

function gradeVentral(geo) {
  const pos = geo.getAttribute('position')
  const n = pos.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    // hash dither: a deterministic ±0.028 m wobble on the boundary
    const hs = Math.sin(x * 91.7 + y * 57.3 + z * 113.1) * 43758.5453
    const jit = ((hs - Math.floor(hs)) - 0.5) * 0.056
    // ventral coordinate: forward, low and inboard is belly
    const d = (x - 0.020) * 0.85 + (0.300 - y) * 0.65 - (Math.abs(z) - 0.190) * 0.75 + jit
    const t = d <= -0.055 ? 0 : d >= 0.075 ? 1 : (() => { const s = (d + 0.055) / 0.130; return s * s * (3 - 2 * s) })()
    for (let c = 0; c < 3; c++) col[i * 3 + c] = DORSAL_MUL[c] + (1 - DORSAL_MUL[c]) * t
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

// ~6-tri tapered bristle clumps on the outline edges the camera sees. They
// break the too-clean bevel edges and are the difference between "modelled
// fur" and "a brown surface".
function bristleClumps(parent, S, spec) {
  // Round 1 built these as 0.008 -> 0.002 m tapers: sub-pixel at match distance
  // on every one of them, and along the head crest and shoulder ridge they
  // aliased into a saturated dotted fringe that read as a compositing halo
  // rather than as fur. They are now 0.017 -> 0.006 m — a real clump, two per
  // site instead of three — and they carry furBase, not the bright furWarm, so
  // a clump can never be the brightest thing on a silhouette edge.
  for (const [x, y, z, len] of spec) {
    for (let i = 0; i < 2; i++) {
      const a = (i - 0.5) * 0.5
      parent.add(mesh(taperedCapsule(0.017, 0.006, len * 0.62, 1, 6), S.fur,
        x + i * 0.018, y + len * 0.34, z + (i - 0.5) * 0.026, a * 0.6, 0, -0.3 + a))
    }
  }
}

// The cardigan: OPEN-FRONT chunky knit with a rolled shawl collar and three
// undone buttons. Not a closed crew-neck sweater, and never grey. It must not
// extend below y=0.94 — the belly's lowest point stays bare fur so the barrel
// reads in silhouette.
function buildCardigan(torso, S) {
  // back panel, standing proud of the coat by a real knit thickness
  torso.add(mesh(plate(superellipsePoints(0.52, 0.44, 2.6, 18), 0.045, 0.016,
    { crown: 0.045, faceSeg: 2, taper: 0.35, rimSeg: 2 }), S.knit, -0.200, 0.215, 0, 0, -Math.PI / 2, 0))
  torso.add(mesh(plate(superellipsePoints(0.50, 0.075, 2.6, 14), 0.045, 0.016,
    { crown: 0.030, faceSeg: 1, rimSeg: 1 }), S.knitRib, -0.208, 0.010, 0, 0, -Math.PI / 2, 0))

  // THE FRONT PANELS WERE INSIDE THE BELLY. The group sat at torso-local
  // x = 0.150 while the barrel's own surface at z = 0.230 is at x = 0.2506, and
  // the panel was then pushed a further 0.055 along a yaw of -0.72 rad whose
  // +Z maps to (-0.659, 0, +0.752) — i.e. deeper IN and backwards. The result
  // survived only as two narrow ochre strips at the extreme flanks and the
  // "casual guy in clothes" half of the parody was simply missing from the
  // frame. Both errors are fixed here: the yaw is re-derived so the panel's
  // outward normal is the belly's own surface normal at the mounting point,
  // and the panel is seated ON that surface and pushed 0.055 proud of it.
  //
  // Geometry check, torso-local, at the mounting height y = 0.205: the barrel
  // half-width is 0.347 and its depth half is 0.263 about an x offset of
  // 0.0222. The panel's inboard edge lands at (x 0.301, z 0.176) against a
  // belly surface of x 0.2705 there — so the knit edge stands 0.030 proud and
  // CROSSES THE BELLY SILHOUETTE, which is the whole point of building it. Its
  // forward-most point is 0.31, still inside the belly's own 0.3175 maximum at
  // y = 1.06, so the forward-tipped egg keeps leading in profile.
  for (const side of [1, -1]) {
    const ry = side === 1 ? 0.78 : Math.PI - 0.78
    const p = poseGroup(torso, 0.170, 0.205, 0.228 * side, 0, ry, 0)
    p.add(mesh(plate(superellipsePoints(0.26, 0.42, 2.5, 18), 0.042, 0.015,
      { crown: 0.036, faceSeg: 3, taper: 0.35, rimSeg: 2 }), S.knit, 0, 0, 0.055))
    // chunky 5 mm rib in the GEOMETRY, not just the normal map
    for (let i = 0; i < 5; i++) {
      p.add(mesh(roundedBox(0.026, 0.40, 0.010, 0.004, 1), S.knitRib,
        -0.10 + i * 0.05, 0.005, 0.079))
    }
    p.add(mesh(plate(superellipsePoints(0.255, 0.070, 2.6, 12), 0.046, 0.016,
      { crown: 0.028, faceSeg: 1, rimSeg: 1 }), S.knitRib, 0, -0.200, 0.056))
    // three chunky 4-hole buttons, ALL UNDONE — a closed cardigan hides the belly
    if (side === 1) {
      for (const by of [0.31, 0.17, 0.03]) {
        p.add(mesh(roundedCylinder(0.015, 0.010, 0.004, 10, 1), S.knitRib, 0.085, by, 0.084, Math.PI / 2, 0, 0))
      }
      // he has owned this for years: three pulled loops and one snag
      p.add(mesh(filletRing(0.012, 0.004, 5, 10), S.knitRib, 0.02, -0.16, 0.086, 0, 0, 0.4))
      p.add(mesh(filletRing(0.010, 0.0035, 5, 10), S.knitRib, -0.05, -0.19, 0.086, 0.3, 0, 0))
      p.add(mesh(taperedCapsule(0.005, 0.001, 0.035, 1, 5), S.knitRib, 0.06, -0.10, 0.088, 0, 0, 0.9))
    }
  }

  // rolled shawl collar — also the sleeve that hides the head/torso joint
  torso.add(mesh(splineTube([
    [0.190, 0.250, 0.215], [0.120, 0.375, 0.235], [-0.020, 0.435, 0.215],
    [-0.150, 0.430, 0.000],
    [-0.020, 0.435, -0.215], [0.120, 0.375, -0.235], [0.190, 0.250, -0.215],
  ], 0.032, 22, null, { radialSeg: 7, roundEnd: true, roundStart: true }), S.knitRib))

  // shoulder yoke + rolled sleeve cuffs, giving two hard cross-arm edges so the
  // arm separates from the belly by material and light, not by negative space
  // the yoke stays INBOARD of the belly's ±0.38: the belly must remain the
  // widest mass on the model from every angle, or the barrel read collapses.
  for (const side of [1, -1]) {
    torso.add(mesh(skirt(0.092, 0.115, 0.110, { curve: 0.5, radialSeg: 16 }), S.knit,
      0.010, 0.412, 0.238 * side, 0.18 * side, 0, 0))
    torso.add(mesh(filletRing(0.113, 0.012, 7, 20), S.knitRib, 0.010, 0.308, 0.238 * side, 0.18 * side, 0, 0))
  }
}

// Slash pockets. The pose depends on them being real: with a 0.500 m arm the
// wrist can only reach (+0.118, 0.872, ±0.292) — 0.498 m from the shoulder ball
// — so that is where the mouth goes. Nothing is parented to the pocket; the
// hands-in-pockets read is achieved by POSING the arm bones.
function buildPockets(torso, S) {
  for (const side of [1, -1]) {
    const g = poseGroup(torso, 0.118, -0.098, 0.292 * side, 0, 0, 22 * DEG)
    // Raised welt, 0.018 proud and 0.062 across the limb rather than 0.030:
    // round 1's welt was thin enough to disappear entirely, so nothing on the
    // model said "pocket" and the paws read as resting on his trousers.
    g.add(mesh(roundedBox(0.022, 0.180, 0.062, 0.009, 2), S.canvasCuff, 0.014, 0, 0))
    for (let i = 0; i < 7; i++) {
      g.add(mesh(orb(0.0045, 8), S.canvasCuff, 0.026, -0.076 + i * 0.025, 0.020))
    }
    // The pocket MOUTH: a canvas lip that oversails the wrist where it enters,
    // so the cloth visibly swallows the paw instead of the paw hovering next to
    // a seam. This is what carries the hands-in-pockets read at 1 m.
    g.add(mesh(plate(superellipsePoints(0.100, 0.170, 2.4, 16), 0.028, 0.011,
      { crown: 0.018, faceSeg: 2, taper: 0.5, rimSeg: 2 }), S.canvas,
    0.008, -0.014, 0.008 * side, 0, Math.PI / 2, 0))
    // a real interior pouch, 0.140 deep, angled 18° down-and-inboard so it
    // follows the paw rather than fighting it
    g.add(mesh(roundedBox(0.070, 0.160, 0.110, 0.020, 2), S.canvas, -0.040, -0.055, -0.020 * side,
      0, 0, 18 * DEG))
  }
}

// Documented capybara/bird mutualism, built as OUR OWN invented two-tone
// species: no field marks, no species-accurate plumage. It never reacts, never
// falls off, and he has never acknowledged it.
function buildBird(torso, S) {
  // ROUND 4 — IT WAS STANDING ON AIR. Raycasting straight down through the
  // footprint put the bird's lowest geometry at world y = 1.394 against a
  // shoulder surface of 1.366 at (x -0.120, z 0.240): a 0.028 float, which is
  // what "its feet do not contact the shoulder" measures as. The socket also
  // sat on the OUTBOARD face of the shoulder crest, where the surface drops
  // 0.046 over 24 mm, so half the footprint was over the cliff. Moved inboard
  // and forward onto the crest's own top (the crest is a superellipsoid at
  // torso-local (0.010, 0.425, ±0.200) with a 0.045 semi-axis, so its surface
  // at (-0.105, 0.215) is world y = 1.421) and dropped so the feet finish 0.004
  // BELOW it. Plus a contact-AO footprint, because a bird pressing into a ruff
  // has a shadow under it.
  const b = poseGroup(torso, -0.105, 0.448, 0.215)
  torso.add(mesh(lens(0.052, 0.040, 0.008, { crown: 0.0, seg: 16, faceSeg: 1, rimSeg: 1 }),
    S.furShadow, -0.105, 0.446, 0.215, -Math.PI / 2, 0, 0))
  b.name = 'prop_bird'
  b.userData.noMerge = true
  b.userData.side = 1
  b.add(mesh(superellipsoid(0.048, 0.032, 0.028, 2.5, 2.5, 14), S.birdSlate, -0.010, 0.032, 0))
  b.add(mesh(superellipsoid(0.038, 0.030, 0.026, 2.4, 2.4, 14), S.birdCream, 0.028, 0.030, 0))
  b.add(mesh(orb(0.026, 14), S.birdCream, 0.046, 0.056, 0))
  b.add(mesh(taperedCapsule(0.008, 0.002, 0.020, 2, 6), S.phoneShell, 0.076, 0.052, 0, 0, 0, -Math.PI / 2))
  b.add(mesh(orb(0.005, 8), S.pupil, 0.058, 0.062, 0.019))
  b.add(mesh(orb(0.005, 8), S.pupil, 0.058, 0.062, -0.019))
  for (const s of [1, -1]) {
    b.add(mesh(plate(superellipsePoints(0.070, 0.026, 2.2, 10), 0.010, 0.004, { crown: 0.005, faceSeg: 1, rimSeg: 1 }),
      S.birdSlate, -0.014, 0.036, 0.026 * s, Math.PI / 2, 0, -0.12))
    b.add(mesh(taperedCapsule(0.005, 0.004, 0.014, 1, 5), S.nail, 0.010, 0.006, 0.012 * s))
  }
  // tail
  b.add(mesh(plate(superellipsePoints(0.048, 0.020, 2.2, 8), 0.008, 0.003, { rimSeg: 1 }), S.birdSlate,
    -0.062, 0.034, 0, Math.PI / 2, 0, 0.25))
}

// ---------------------------------------------------------------------------
// arms — short and soft. Upper 0.260 + forearm 0.240 + paw 0.130 = 0.630 m, so
// arm length / height = 0.35 (a human is ~0.44). That ratio is the third
// strongest proportion cue after the head brick and the 40% legs.
// Shoulder ball world (0, 1.350, ±0.300); with the idle clip's shoulder 0.12 rad
// and elbow 0.15 rad the wrist lands at (+0.095, 0.861) — 0.498 m from the
// shoulder ball, inside the 0.500 m reach budget, and on the pocket mouth.
// ---------------------------------------------------------------------------
function buildArm(arm, fore, S, side) {
  // shoulder: a ball at the pivot. A sphere has no orientation, so rotation can
  // never open a gap here (contract §9).
  // HE IS SOFT AND UNMUSCLED. Round 1 built a 0.090 shoulder ball over a
  // 0.0775 -> 0.090 upper arm, i.e. a visible deltoid cap and a bicep bulge,
  // and it measured 0.782 across the shoulder line against 0.763 at the belly —
  // the arms were the widest thing on the model, which is the gorilla read the
  // brief explicitly forbids. The cap is now 0.068 and the upper arm is a
  // near-parallel 0.070 -> 0.074 tube with no swell anywhere, so the whole limb
  // lives inside the barrel's outline from every angle.
  arm.add(mesh(jointBall(0.068, 15), S.furLimb))
  arm.add(mesh(taperedCapsule(0.0685, 0.0740, 0.170, 3, 13), S.furLimb, 0, -0.130, 0))
  arm.add(mesh(sleeve(0.0755, 0.0700, 0.070, { bulge: 0.012, radialSeg: 14 }), S.furLimb, 0, -0.055, 0, Math.PI, 0, 0))

  // ROUND 3 — THE ARM HAD NO FINDABLE SILHOUETTE IN 3/4. The review saw "a
  // vertical stripe pattern with no volume, no elbow corner, no rolled cuff
  // edge, no sleeve seam and no contact-AO crevice against the barrel", and a
  // flat dark quad with no thickness reading as a floating card. §2 of the
  // brief is explicit that the elbow CANNOT clear the belly at any flex angle,
  // so the separation has to be bought with the four tools it lists, and three
  // of them were missing. All four are here now:
  //
  //  1. the knit SLEEVE, with a 0.015-proud seam ring at the shoulder and a
  //     0.024-proud rolled cuff at the elbow — two hard cross-arm edges that
  //     read even when the arm outline is inside the barrel outline;
  //  2. a real chamfered ELBOW CORNER (0.018 chamfer, tighter than the 0.035
  //     used elsewhere so the corner survives the bevel);
  //  3. the faceDark outer-forelimb stripe, rebuilt as a feathered lens on the
  //     limb surface instead of an 0.018-thick slab floating beside it;
  //  4. a contact-AO band down the inboard face where the forearm lies on the
  //     belly — the crevice contract §0.1 asks for, and in the 3/4 camera it is
  //     the only thing that separates the arm from the barrel.
  //
  // Total added half-width at the widest ring is 0.024 over a 0.0685 limb, so
  // the sleeved arm still measures well inside the belly's 0.3875 and the
  // belly-wider-than-shoulders inversion is untouched.
  arm.add(mesh(taperedCapsule(0.0790, 0.0810, 0.148, 3, 14), S.knit, 0, -0.126, 0))
  arm.add(mesh(filletRing(0.0805, 0.0100, 7, 20), S.knitRib, 0, -0.050, 0))
  arm.add(mesh(filletRing(0.0800, 0.0120, 7, 20), S.knitRib, 0, -0.210, 0))
  arm.add(mesh(lens(0.030, 0.100, 0.014, { crown: 0.006, seg: 18, faceSeg: 2, rimSeg: 1 }),
    S.faceDark, -0.006, -0.140, 0.070 * side))
  // the tangent corner: a chamfered mass on the outboard-rear quarter of the
  // elbow, so the belly's smooth curve is interrupted by a hard edge
  arm.add(mesh(roundedBox(0.058, 0.066, 0.050, 0.018, 2), S.furLimb, -0.012, -0.264, 0.026 * side))
  arm.add(mesh(jointBall(0.068, 13), S.furLimb, 0, -0.260, 0))

  fore.add(mesh(taperedCapsule(0.060, 0.066, 0.130, 3, 13), S.furLimb, 0, -0.120, 0))
  fore.add(mesh(lens(0.088, 0.026, 0.012, { crown: 0.005, seg: 18, faceSeg: 2, rimSeg: 1 }),
    S.faceDark, -0.006, -0.120, 0.062 * side, Math.PI / 2, 0, Math.PI / 2))
  // contact-AO crevice: 0.030 wide, darkened, down the INBOARD face where the
  // forearm lies against the barrel
  fore.add(mesh(lens(0.115, 0.030, 0.010, { crown: 0.003, seg: 16, faceSeg: 2, rimSeg: 1 }),
    S.furShadow, -0.004, -0.120, -0.058 * side, Math.PI / 2, 0, Math.PI / 2))
  // forearm tops catch the warm sun-hit value
  fore.add(mesh(superellipsoid(0.020, 0.090, 0.026, 2.3, 2.3, 12), S.furWarm, 0.052, -0.110, 0))
  // wrist cuff, overlapping both sides so the forearm joint never gaps
  fore.add(mesh(sleeve(0.064, 0.070, 0.055, { bulge: 0.05, radialSeg: 16 }), S.furLimb, 0, -0.215, 0))

  buildPaw(fore, S, side)
}

// Four blunt digits with hoof-like keratin nails — capybaras have four toes on
// the front feet. No claws, no toe-bean cuteness; the nails are flat hooves.
function buildPaw(fore, S, side) {
  // The paw sits 0.03 deeper on the wrist than round 1 so that 0.105 of its
  // 0.130 length is inside the pouch, not 60% of it hanging in the open air at
  // hip height. The nails are also pulled back to the digit tips instead of
  // standing proud of them — four pale nubs bobbing at the hip was one of the
  // things that made the hands read as dangling mitts.
  const p = poseGroup(fore, 0.010, -0.286, 0, 0, 0, 0.10)
  p.add(mesh(roundedBox(0.072, 0.086, 0.108, 0.024, 2), S.furFine, 0, -0.038, 0))
  // one thick fleshy palm pad on the inner face
  p.add(mesh(superellipsoid(0.013, 0.032, 0.038, 2.3, 2.3, 12), S.hide, 0.037, -0.044, 0))
  const len = [0.055, 0.062, 0.058, 0.046]
  for (let i = 0; i < 4; i++) {
    const d = poseGroup(p, 0.006, -0.078, (i - 1.5) * 0.028, (i - 1.5) * 6 * DEG, 0, 0)
    d.add(mesh(taperedCapsule(0.018, 0.021, len[i] * 0.55, 2, 9), S.furFine, 0, -len[i] * 0.45, 0))
    d.add(mesh(lens(0.012, 0.009, 0.009, { crown: 0.003, seg: 10, faceSeg: 1, rimSeg: 1 }), S.nail, 0.012, -len[i] - 0.002, 0, 0, 0, 0.3))
  }
  // the thumb stays hooked outside the pocket welt — a visible 0.03 nub on the
  // pocket edge, which is what makes the pose read as deliberate.
  const th = poseGroup(p, 0.030, -0.026, 0.054 * side)
  th.add(mesh(taperedCapsule(0.018, 0.020, 0.026, 2, 9), S.furFine, 0.014, -0.020, 0, 0.6 * side, 0, -0.5))
  th.add(mesh(lens(0.011, 0.008, 0.008, { crown: 0.003, seg: 10, faceSeg: 1, rimSeg: 1 }), S.nail, 0.034, -0.042, 0.006 * side, 0, 0, 0.5))
}

// ---------------------------------------------------------------------------
// head — 60% of the character, and it is a BRICK, not a loaf on a ball.
// Head length L = 0.54 m = 1.50 head-heights = 0.30 x standing height: half
// again as long as it is tall. Split 61.1% rostrum / 38.9% braincase, from
// published capybara skull morphometrics. One continuous near-flat top plane
// runs from the rear crown (y=1.800) forward at -3.3° to the brow break
// (y=1.788) and then at -9.1° to the nose end (y=1.735) — a 5.8° total break,
// and that IS the entire forehead. There is no stop, no dome, no brow shelf.
// It terminates in a blunt VERTICAL nose plane, 0.235 m tall. No taper to a
// point: a muzzle that tapers is a rat, and a domed crown is a bear.
// Local frame: world minus (0.06, 1.44, 0), inside the 7°/10° tilt wrapper.
// ---------------------------------------------------------------------------
function buildHead(h, S) {
  const rr = (wz, hy) => roundedRectPoints(wz, hy, 0.035, 4)
  // Two planes and a width law, sampled explicitly. Block A's top plane must be
  // GENUINELY PLANAR — the yuzu sits on it, and a crowned or Catmull-smoothed
  // crown would make the fruit float or sink and break the one accessory that
  // names the reference. So: no spline subdivision, straight-line laws.
  const top = (x) => (x <= -0.010 ? 0.360 - (x + 0.220) * 0.0591   // braincase, -3.3°
    : 0.348 - (x + 0.010) * 0.1606)                                // rostrum,   -9.1°
  const bot = (x) => (x <= -0.010 ? 0.080 + (x + 0.220) * 0.0857
    : 0.098 - (x + 0.010) * 0.1118)                                // upper-lip plane
  const wid = (x) => (x <= -0.010 ? 0.336 - (x + 0.220) * 0.1714
    : 0.300 - (x + 0.010) * 0.1118)                                // only -13% over the muzzle
  const secs = [{ at: [-0.238, 0.222, 0], shape: rr(0.286, 0.232) }] // rear plate roll
  for (const x of [-0.220, -0.165, -0.110, -0.060, -0.010, 0.045, 0.100, 0.155, 0.210, 0.265, 0.312]) {
    secs.push({ at: [x, (top(x) + bot(x)) / 2, 0], shape: rr(wid(x), top(x) - bot(x)) })
  }
  // the terminal roll: 0.045 chamfer on the blunt vertical nose plane, tipped
  // back 8° from vertical so the nose end reads soft-but-square, never pointed
  secs.push({ at: [0.331, 0.182, 0], shape: rr(0.212, 0.186) })
  // The skull loft takes furHead: its V axis runs nose-to-tail, so the coat's
  // bristle grooves flow front-to-back along +X at ~19 mm, which is hair. Round
  // 1 ran the whole 1.8 m body on one repeat-1 fur and the head came out
  // covered in 50 mm top-to-bottom grain — varnished pine, and materially
  // indistinguishable from the wooden market stall behind it.
  h.add(mesh(loft(secs, { up: [0, 0, 1] }), S.furHead))

  // heavy cheek pads (all those ever-growing cheek teeth), 0.018 proud
  // Both of these were superellipsoid BLOBS standing 0.021 and 0.009 proud of
  // the side plane with hard closed outlines, and the review counted them among
  // the "seven glued lumps" the muzzle resolves into. A lens feathers to zero
  // thickness at its rim, so the pad grows out of the skull instead of being
  // parked on it — one volume with subordinate detail, which is what an SF6 or
  // Overwatch muzzle actually does.
  for (const side of [1, -1]) {
    h.add(mesh(lens(0.100, 0.078, 0.022, { crown: 0.011, seg: 22, faceSeg: 3, rimSeg: 1 }),
      S.furFine, -0.020, 0.140, 0.1445 * side))
    // black-on-face marking down the muzzle sides
    h.add(mesh(lens(0.085, 0.045, 0.014, { crown: 0.005, seg: 20, faceSeg: 2, rimSeg: 1 }),
      S.faceDark, 0.150, 0.115, 0.1385 * side))
  }
  // Sun-hit crown + the bald crown patch where the sparse coat gives out. Both
  // are pulled aft of head-local x = -0.075: the brief reserves the crown strip
  // x ∈ [-0.065, +0.025] for the yuzu's seat and nothing else may enter it, or
  // the fruit ends up sitting on a colour boundary instead of on flat fur.
  h.add(mesh(superellipsoid(0.074, 0.012, 0.102, 2.3, 2.3, 14), S.furWarm, -0.152, 0.3525, 0))
  h.add(mesh(superellipsoid(0.040, 0.009, 0.038, 2.2, 2.2, 10), S.skinUnder, -0.170, 0.354, 0.058))

  buildNose(h, S)
  buildMouth(h, S)
  buildYuzu(h, S)
  for (const side of [1, -1]) buildEye(h, S, side)
}

// The rhinarium and the DORSAL nostrils. Capybara nostrils sit on the TOP plane
// of the snout, not on its front — eyes, ears and nostrils are all high on the
// head so the animal can stay submerged. Putting the nose on the front face is
// what turns a capybara into a generic bear, and it is the single highest-value
// fix on this model.
function buildNose(h, S) {
  // ROUND 1 BUILT THIS AS A PROUD 0.150 x 0.120 x 0.240 BOX and it capped the
  // whole front-top of the skull as a chocolate cushion with its own rounded
  // outline and a hard silhouette seam — a brownie glued to the face. The spec
  // is 0.006 proud with a soft boundary, so it is now two LENSES: a lenticular
  // section feathers to zero thickness at its rim, which is what "hair thins
  // into skin, it does not stop" actually looks like in geometry.
  //
  // The pad group carries the -9.1° slope of the muzzle top plane, so the
  // dorsal nostrils below can be authored in the plane's own frame.
  // ROUND 3 — THE PAD WAS EATING THE CROWN. At half-extents 0.075 x 0.106 the
  // top pad was 0.150 long x 0.212 across on a muzzle 0.28 wide and 0.33 long,
  // i.e. it covered essentially the whole front-top of the skull as one flat
  // hard-edged oval and destroyed the top plane's four-events-on-a-ruler
  // rhythm (dark nose · flat fur · dark gland · flat fur · yellow fruit).
  // Back to the spec: 0.190 across (half 0.095) narrowing rearward, and only
  // 0.125 long, ending at head-local x = +0.195 (world +0.255). That leaves
  // 0.105 m of flat fur between the pad's rear edge and the morrillo, which is
  // the gap that makes the rhythm legible.
  const rn = poseGroup(h, 0.262, 0.3043, 0, 0, 0, -9.1 * DEG)
  // top pad — rides the muzzle TOP plane back to x = +0.195 local (world +0.255)
  rn.add(mesh(lens(0.0625, 0.095, 0.011, { crown: 0.005, seg: 24, faceSeg: 3, rimSeg: 1 }),
    S.rhinarium, 0, 0, 0, -Math.PI / 2, 0, 0))
  // The 0.008 FILLET the brief asks for at the pad boundary. A lens feathers to
  // zero thickness at its rim, which is the right profile, but with nothing on
  // the boundary it still terminates as a drawn line at 1 m. This ring is fur,
  // sits on the seam, and is what turns "a decal" into "skin the hair thins into".
  rn.add(mesh(filletRing(0.0905, 0.0075, 6, 26), S.furFine, 0, -0.0035, 0, 0, 0, 0))
  // front pad — the top 45% of the blunt vertical nose plane, 0.238 across the
  // 0.262 face (a 0.012 fur margin each side) and 0.105 down it
  rn.add(mesh(lens(0.119, 0.0525, 0.012, { crown: 0.006, seg: 22, faceSeg: 2, rimSeg: 1 }),
    S.rhinarium, 0.0718, -0.0501, 0, 0, Math.PI / 2, 0))

  // THE NOSTRILS ARE DORSAL. Two slits on the TOP plane, inside the pad, splayed
  // 18° outward. They were invisible in every previous shot including the
  // near-top-down head camera, which loses the brief's #1 ranked anatomical cue.
  // Three changes: the slit is widened to 0.022 (from 0.011) and lengthened to
  // 0.052 so it is ~3 px at gameplay distance instead of 1; it is genuinely
  // RECESSED now — a dark floor plate sunk 0.010 into the pad with a raised
  // rhinarium lip ringing it, rather than a dark lens laid flat on the pad,
  // which reads as a sticker at every angle; and the interior takes the matte,
  // env-0.12 `nostril` material so nothing sparkles inside the hole.
  //
  // The recess is built by RAISING A RIM rather than by sinking a floor: the
  // pad is a solid convex lens, so anything sunk into it is simply inside it
  // and invisible — which is precisely how the last two builds lost the slits.
  // A 0.0045-section rim standing 0.008 proud around a floor that sits 0.0035
  // proud gives a genuine 0.005 depression that reads from above and from 3/4.
  // ROUND 4 — THE SLITS WERE BURIED AND THEN RINGED BY A CIRCLE. Two faults,
  // both measurable by raycasting the top-down camera, which returned THREE
  // cells of `nostril` against 133 of `rhinarium`:
  //   (a) the pad is a lens with a 0.005 crown, so its surface at the slit's
  //       position stands 0.0088 above the pad group's origin — while the slit
  //       floor's own top face reached only 0.0103 with a 0.001 crown. Fifteen
  //       tenths of a millimetre of a 0.052 x 0.022 shape was outside the pad;
  //       the rest of it was literally inside the solid.
  //   (b) a CIRCULAR filletRing of inner radius 0.013 cannot frame a slit that
  //       is 0.052 long — it capped both ends and left a round dot, which is
  //       the opposite of the anatomy: the whole point of a dorsal nostril is
  //       that it is a SLIT.
  // So the floor is now flat-topped (crown 0) and seated so its top face lands
  // exactly on the pad surface — the full 0.052 x 0.022 ellipse is exposed —
  // and the rim is two stadium LIPS running along the slit's long edges, 0.0075
  // proud, which is what actually produces the groove read and can never
  // occlude the dark.
  // The pad's own surface height over the slit footprint was MEASURED off the
  // built mesh by raycasting down the pad normal: it runs y = 0.0063 .. 0.0096
  // in this group's frame. Every previous build guessed it, put the slit's top
  // face below it, and shipped a nostril that was inside the solid. The dark
  // floor is a 0.010-thick inlay whose TOP face lands at 0.0105 — 0.0009 clear
  // of the highest pad surface anywhere under it, embedded for the rest of its
  // depth, so the full 0.052 x 0.022 ellipse is exposed from every angle and
  // nothing on the pad can swallow it again.
  for (const side of [1, -1]) {
    const sl = poseGroup(rn, 0.004, 0.0055, 0.056 * side, 0, -18 * DEG * side, 0)
    // the floor of the slit: 0.052 long x 0.022 wide, the darkest value on the muzzle
    sl.add(mesh(lens(0.026, 0.011, 0.010, { crown: 0.0, seg: 18, faceSeg: 1, rimSeg: 1 }),
      S.nostril, 0, 0, 0, -Math.PI / 2, 0, 0))
    // The rim is two stadium LIPS along the slit's long edges, not a circle: a
    // circular filletRing of inner radius 0.013 physically cannot frame a
    // 0.052-long slit, and the last build's did exactly what that implies —
    // capped both ends and left a round dot, which is the opposite of the
    // anatomy. Their inner faces stand at z = ±0.011, on the slit edge, so they
    // shadow it without ever covering it.
    for (const lip of [1, -1]) {
      sl.add(mesh(splineTube([
        [-0.026, 0.0035, 0.0152 * lip], [-0.010, 0.0040, 0.0152 * lip],
        [0.010, 0.0040, 0.0152 * lip], [0.026, 0.0035, 0.0152 * lip],
      ], 0.0042, 8, (t) => 0.0042 * (1 - 0.55 * Math.abs(t * 2 - 1)), { radialSeg: 6, roundEnd: true, roundStart: true }),
      S.rhinarium))
    }
  }

  // THE MORRILLO — the male's bare oval scent gland, dead centre on the snout
  // top plane, 0.105 m aft of the rhinarium's rear boundary and 0.105 m forward
  // of the yuzu's seat, with flat fur on both sides of it. Free public-domain
  // anatomy, instantly "capybara" to anyone who knows the animal and "a weird
  // cool nose bump" to everyone else. It is the only WAXY organic surface on
  // him: under a rim light it throws one small specular pip onto the top line
  // of the head, permanently — which is the whole reason it keeps its clearcoat
  // while every other surface on the model just lost one.
  //
  // ROUND 4 — IT WAS TOUCHING THE FRUIT. Raycasting the top-down camera put the
  // morrillo's rear edge at world x = 0.0875 against the yuzu's front edge at
  // 0.0925 — a 0.005 OVERLAP in plan, so the brief's "four events on a
  // ruler-straight line" rhythm lost the flat-fur gap between events 3 and 4.
  // (The overlap is a consequence of sizing the fruit up to Ø0.105 so it
  // survives the 128 px downsample; the fruit's size is the read and does not
  // move.) The gland shifts 0.010 forward and loses 0.0055 of length: rear edge
  // now world 0.103, a 0.0105 gap to the fruit, and 0.100 back from the
  // rhinarium's rear boundary at 0.255 — the brief's 0.105, within 5 mm.
  h.add(mesh(capsuloid(0.0520, 0.030, 0.039, 2.6, 0.5, 18), S.morrillo, 0.095, 0.3289, 0))
  // 0.012 fillet where it meets the snout: it grows out of the skin.
  h.add(mesh(filletRing(0.0495, 0.010, 6, 20), S.furFine, 0.095, 0.3259, 0))
}

// Rodent mouth: SHORT, LOW, and set well back under the front of the muzzle —
// 0.135 m aft of the nose plane, 0.160 m across (0.47 x head width). A wide
// mouth reads as a frog. Corners up 6°: a resting shape, not a smile. Past ~10°
// he reads smug, and smug is the opposite of the brief.
function buildMouth(h, S) {
  // LOWER JAW UNDERSIDE. Round 2 built this as a 0.160 x 0.064 x 0.180 mass
  // centred at y = 0.038 against a muzzle bottom plane at y = 0.0712 — so 0.077
  // of it hung BELOW the head silhouette with a hard seam and its own texture
  // phase, and the review read it as a bread roll glued to the face. It pushed
  // the character toward hamster. It is now 0.144 wide, 0.048 deep, buried
  // 0.011 into block B's bottom plane and projecting only 0.037, with a fillet
  // on the seam, and it carries furWarm (0.52) rather than furBelly (0.65) so
  // it is 0.09 off the muzzle coat instead of 0.22. The blunt vertical nose
  // plane stays the terminal punctuation of the silhouette, which is the point.
  h.add(mesh(superellipsoid(0.072, 0.024, 0.072, 2.6, 2.6, 16), S.furWarm, 0.232, 0.058, 0))
  h.add(mesh(filletRing(0.066, 0.009, 6, 20), S.furFine, 0.232, 0.070, 0))
  h.add(mesh(roundedBox(0.080, 0.024, 0.126, 0.012, 1), S.mouth, 0.245, 0.058, 0))
  h.add(mesh(superellipsoid(0.030, 0.007, 0.026, 2.3, 2.3, 10), S.mouth, 0.250, 0.052, 0))

  for (const side of [1, -1]) {
    // the mouth line, corners angled up 6°
    h.add(mesh(splineTube([
      [0.295, 0.055, 0.000], [0.258, 0.058, 0.048 * side], [0.190, 0.068, 0.080 * side],
    ], 0.0055, 8, null, { radialSeg: 5, roundEnd: true, roundStart: true }), S.faceDark))
  }
  // Cleft upper lip. Round 1 built the two pads as 0.030-radius spheres
  // standing 0.026 proud of the FRONT plane at y = 0.076, and at gameplay
  // distance they read as two raisins above the lip — i.e. as the front-mounted
  // nostrils of a bear, the single failure this whole model exists to avoid.
  // They are now a shallow lenticular lip shelf that hugs the plane (0.008
  // proud, feathered rim) split by a real philtrum groove on the midline.
  for (const side of [1, -1]) {
    h.add(mesh(lens(0.030, 0.022, 0.016, { crown: 0.008, seg: 14, faceSeg: 1, rimSeg: 1 }),
      S.furBelly, 0.297, 0.080, 0.024 * side, 0, Math.PI / 2, 0))
  }
  h.add(mesh(taperedCapsule(0.0055, 0.0035, 0.020, 2, 6), S.faceDark, 0.303, 0.070, 0))

  // Incisors, built TWO-TONE and for the right reason: the iron-rich enamel is
  // WHITE and the orange-brown is a thin surface coating on the labial face
  // only (ACS/Northwestern 2024). So: orange front plate, pale core everywhere
  // else, and a wear notch on the left upper exposing the core — he is an adult
  // animal who chews. Only 0.008 shows in idle; it is a reward for the yawn.
  // Real chisel teeth, not two pasted rectangles: 0.011 thick with a visible
  // chisel bevel at the cutting edge (a second, thinner core block set back and
  // down), the pale core showing along that edge and on the lingual face, and
  // the orange coating a 0.003 plate on the labial face only. Set BEHIND the
  // lip so only 0.008 projects below the lip edge in idle.
  for (const side of [1, -1]) {
    // body: lingual face + sides, pale enamel
    h.add(mesh(taperedBox(0.033, 0.011, 0.030, 0.011, 0.030, 0.0025, { rim: 0.0015, cornerSeg: 2 }),
      S.incisorCore, 0.286, 0.070, 0.019 * side, 0, Math.PI / 2, 0))
    // the self-sharpening chisel bevel — a wedge THINNING toward the cutting edge
    h.add(mesh(taperedBox(0.033, 0.004, 0.033, 0.011, 0.008, 0.0015, { rim: 0.001, cornerSeg: 2 }),
      S.incisorCore, 0.2875, 0.0525, 0.019 * side, 0, Math.PI / 2, 0))
    // labial coating: 0.003 of orange on the FRONT face only (the iron enamel
    // underneath is white — ACS/Northwestern 2024)
    h.add(mesh(roundedBox(0.003, 0.026, 0.030, 0.001, 1), S.incisor, 0.2925, 0.072, 0.019 * side))
    // lower pair, hidden behind the lip in idle
    h.add(mesh(taperedBox(0.032, 0.010, 0.030, 0.010, 0.038, 0.0025, { rim: 0.0015, cornerSeg: 2 }),
      S.incisorCore, 0.278, 0.030, 0.019 * side, 0, Math.PI / 2, 0))
  }
  // a 0.002 wear notch on the left upper, exposing the pale core
  h.add(mesh(roundedBox(0.004, 0.004, 0.008, 0.001, 1), S.incisorCore, 0.2945, 0.056, 0.023))

  // WHISKERS — back to spec. Round 2 over-corrected an aliasing complaint by
  // taking the root radius to 0.0042, roughly 3x the brief's 0.0022, and
  // rendered four solid dark tubes per side that radiated stiffly and read as
  // insect legs at every distance; the review called them the third thing the
  // eye finds. They are 5 per side at the specified 0.0022 root now, tapering
  // to 0.0007, and they fade toward furWarm rather than terminating in the
  // darkest value on the face — a whisker catches light at its tip, it does not
  // go black. The splay is widened to 25-55° so they read as a fan, not a rake.
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const L = 0.100 + i * 0.015
      const x0 = 0.244 + i * 0.014
      const spread = 0.42 + i * 0.13
      h.add(mesh(splineTube([
        [x0, 0.100, 0.106 * side],
        [x0 + L * 0.16, 0.100 - L * 0.30 * (1.3 - spread * 0.5), (0.106 + L * spread * 0.55) * side],
        [x0 + L * 0.26, 0.094 - L * 0.82 * (1.3 - spread * 0.5), (0.106 + L * spread) * side],
      ], 0.0022, 6, (t) => 0.0022 * (1 - t) + 0.0007 * t, { radialSeg: 4, roundEnd: true }), S.furWarm))
    }
  }

  // one blade of grass at the corner of the mouth, present in EVERY clip.
  // Thickened to 0.007 at the root for the same anti-strobe reason.
  h.add(mesh(splineTube([[0.196, 0.062, 0.086], [0.150, 0.052, 0.132], [0.098, 0.028, 0.168]],
    0.007, 8, (t) => 0.007 * (1 - t * 0.75), { radialSeg: 4, aspect: 2.4, twist: 0.25, roundEnd: true }),
  S.grass))
}

// THE YUZU. A whole citrus fruit, balanced on the crown, unheld, unacknowledged.
// This is the detail that carries the reference: the picture everyone actually
// remembers is a capybara up to its chin in a winter bath with a yellow fruit
// sitting on its head. It is also the STRUCTURAL PROOF of the skull: a sphere
// resting on a plane is a visual assertion that the plane is flat. If the fruit
// looks like it would roll off, the head is wrong — not the fruit.
// It never falls off. In any clip. Ever. That is the joke.
function buildYuzu(h, S) {
  // ROUND 3 — RE-DERIVED. The fruit was silhouetted against the sky off the
  // rear corner of the skull with daylight between it and the top plane, and it
  // vanished entirely at 128 px. Two causes and both are arithmetic.
  //
  //  1. SEAT X. It sat at head-local -0.060 (world x = 0.000), 31% of the way
  //     forward from the rear plate — behind the widest part of the crown, so
  //     in the 3/4 camera the crown fell away underneath it and the horizon ran
  //     between the two. The brief's seat is world x = +0.040, i.e. head-local
  //     -0.020, just aft of the brow break: on the -3.3° braincase plane, not on
  //     the -9.1° muzzle plane, with solid skull directly beneath it.
  //  2. SEAT Y. The braincase top plane at head-local x = -0.020 is
  //     top(-0.020) = 0.360 - (0.200 * 0.0591) = 0.34818. The fruit's polar
  //     semi-axis is 0.0525 * 0.96 = 0.0504. Seating its lower pole 0.0080
  //     BELOW the plane — the brief asks for ~0.004, doubled because the plane
  //     carries a 0.035 corner roll that eats the first few mm — puts the fruit
  //     centre at 0.34818 - 0.0080 + 0.0504 = 0.39058. The old build sat at
  //     0.396 against a plane it was not even over.
  const SEAT = -0.020
  const PLANE = 0.34818
  // THE CONTACT. Not a halo: a tight, dark, feathered footprint exactly the
  // width of the fruit's contact circle plus a 0.012 penumbra, sunk INTO the
  // coat so the fur closes over the fruit's equator rather than the fruit
  // sitting on a visible disc. The old build's filletRing sat 0.047 out at the
  // dimple's rim and read as a drawn outline around a floating ball.
  const contact = Math.sqrt(Math.max(0, 0.0525 * 0.0525 - (0.0504 - 0.0080) * (0.0504 - 0.0080)))
  h.add(mesh(lens(contact + 0.014, contact + 0.014, 0.008,
    { crown: 0.0, seg: 22, faceSeg: 2, rimSeg: 1 }),
  S.furShadow, SEAT, PLANE - 0.0025, 0, -Math.PI / 2, 0, 0))

  const y = poseGroup(h, SEAT, PLANE - 0.0080 + 0.0504, 0)
  y.name = 'prop_yuzu'
  y.userData.noMerge = true
  // Ø 0.105 (up from 0.090): at 128 px that is a 6.4 px ball on a 34 px
  // straight brown line, and it is the only element on the model that is not
  // brown. One saturated ball is worth more likeness than every other detail
  // here combined, so it is sized to survive the downsample.
  const fruit = mesh(orb(0.0525, 26), S.yuzu)
  fruit.scale.set(1, 0.96, 1)
  y.add(fruit)
  // stellate stem scar with a real stem, and one leaf — the two shapes that
  // say CITRUS rather than "yellow ball". Generic fruit: no cultivar-accurate
  // knobbly rind, no photo match.
  y.add(mesh(lens(0.012, 0.012, 0.006, { crown: 0.001, seg: 10, faceSeg: 1, rimSeg: 1 }),
    S.yuzuStem, 0, 0.048, 0, -Math.PI / 2, 0, 0))
  y.add(mesh(taperedCapsule(0.0055, 0.0035, 0.014, 2, 7), S.yuzuStem, 0.004, 0.058, 0, 0, 0, -0.25))
  y.add(mesh(plate(superellipsePoints(0.034, 0.020, 2.2, 12), 0.005, 0.002,
    { crown: 0.004, faceSeg: 2, rimSeg: 1 }), S.yuzuLeaf, 0.032, 0.061, 0.006, 0.5, 0, -0.45))
  // shallow blossom dimple opposite the stem
  y.add(mesh(lens(0.008, 0.008, 0.005, { crown: 0.001, seg: 8, faceSeg: 1, rimSeg: 1 }),
    S.yuzuStem, 0, -0.049, 0, -Math.PI / 2, 0, 0))
}

// ---------------------------------------------------------------------------
// eyes — real geometry, not painted quads: sclera + iris + pupil + a corneal
// bulge + a specular pip drawn AS GEOMETRY so it tracks the light, plus a lid
// shell with a rolled rim and a fixed orbital fur mound.
//
// Small, round, set HIGH and FAR BACK and laterally: centre world (0.02, 1.675,
// ±0.115) — 0.36 m aft of the nose plane, i.e. 67% of head length back, so in
// profile the eye sits on the BRAINCASE. An eye on the muzzle is a dog.
// Three nested radii, in order, no interpenetration: ball 0.044 < lid 0.048 <
// orbital mound 0.069. The mound, not the eyeball, is what catches the rim
// light and gives the head a readable eye in pure profile.
// The unbothered read comes from the LID, not the eye size: the upper lid
// covers the top 52% of the ball and its edge runs down-and-forward at 9°
// (an up-slanting lid reads sly; down-forward reads bored, and we want bored).
// ---------------------------------------------------------------------------
function buildEye(h, S, side) {
  // local eye frame: +Z is "outward through the pupil", +Y is up
  const yaw = side === 1 ? 25 * DEG : Math.PI - 25 * DEG
  const e = poseGroup(h, -0.040, 0.235, 0.115 * side, 0, yaw, 0)

  // ROUND 3 — THE EYE STACK, DERIVED RATHER THAN DIALLED.
  //
  // Two builds in a row shipped "no findable pupil" and both times the file
  // comment claimed it was fixed, so this time every z is arithmetic against
  // the ball's own sagitta and it is written down.
  //
  //   ball radius R = 0.0440.
  //   iris rx = 0.0320 -> the ball's surface at that radius is
  //     sqrt(0.044^2 - 0.032^2) = 0.03020, sagitta to the pole = 0.01380.
  //     lens(rx, ry, t, {crown}) puts its rim at z0 + t/2 and its apex at
  //     z0 + t/2 + crown (see plate() in geometry.js: faceRows domes `crown`
  //     above the +half face). So with t = 0.0040 and z0 = 0.0297 the rim lands
  //     0.0015 proud of the ball and with crown = 0.0148 the apex lands
  //     0.0465, i.e. 0.0025 proud of the pole. Proud EVERYWHERE, by construction.
  //   pupil rx = 0.0150 -> the iris cap's own surface there is 0.04524, so
  //     t = 0.0030 at z0 = 0.0449 puts the pupil rim 0.0012 proud of the iris
  //     and crown = 0.0019 puts its apex at 0.0483, 0.0018 proud of the iris apex.
  //
  // And because 1.5 mm is inside the depth buffer's noise at match distance,
  // the iris/pupil/pip materials also carry a negative polygonOffset (see
  // buildMaterials) so the layer order is a bias decision, not a race.
  //
  // THE CORNEAL SHELL IS GONE. It was a clearcoat-1.0 cap at roughness 0.06
  // covering the whole aperture, and combined with plastic-gloss's own
  // clearcoat 0.70 it produced the single blown white blob the review measured
  // over ~25% of the eye. The bulge is now the iris cap's own crown; the gloss
  // is a small wide clearcoat on the iris and pupil; and the ONE hard highlight
  // is the 0.0038 geometry pip below.
  e.add(mesh(orb(0.044, 24), S.sclera))

  // ROUND 4 — THE IRIS AND PUPIL SAT ON THE BALL'S EQUATOR, WHICH IS BEHIND THE
  // LID. With the upper lid covering the top 52% of the ball, the equator is
  // 0.0018 ABOVE the lid margin, so a pupil centred there had its whole upper
  // half occluded and the visible remainder measured 95 mm² — a smear, not a
  // hole. The gaze group pitches the whole iris/pupil/catchlight stack down 12°
  // about the eye centre, which slides the pupil's centre to y = -0.0092: the
  // middle of the 0.030 aperture, with 74% of the pupil disc inside it. 12°
  // and not the 22° that would centre it exactly, because a pupil parked at the
  // bottom of the aperture reads as looking at the floor and he is looking at
  // the opponent.
  const gaze = poseGroup(e, 0, 0, 0, 12 * DEG, 0, 0)
  gaze.add(mesh(lens(0.0320, 0.0320, 0.0040, { crown: 0.0148, seg: 24, faceSeg: 4, rimSeg: 1 }),
    S.iris, 0, 0, 0.0297))
  gaze.add(mesh(lens(0.0150, 0.0150, 0.0030, { crown: 0.0019, seg: 18, faceSeg: 3, rimSeg: 1 }),
    S.pupil, 0, 0, 0.0449))
  // The catchlight: one discrete 0.0038 geometry dot, offset up-and-outboard and
  // half-sunk into the pupil so it reads as a highlight ON the wet surface. It
  // rides the gaze group — parked in the eye frame at y = +0.008 it sat 0.010
  // ABOVE the lid margin, i.e. buried in the lid, and the last build rendered
  // it as a white dot floating in the brow fur with no eye under it.
  gaze.add(mesh(orb(0.0038, 10), S.pip, -0.008, 0.0055, 0.0492))

  // orbital fur mound — fixed, annular, outer surface 0.077 from the eye centre
  // = 0.014 proud of the skull side plane. It is what catches a rim in pure
  // profile and gives the head a readable eye when the aperture is edge-on.
  e.add(mesh(filletRing(0.062, 0.015, 8, 20), S.furFine, 0, 0, 0.012, Math.PI / 2, 0, 0))

  // ROUND 4 — THE UPPER LID WAS NOT COVERING THE EYEBALL. It was `skirt(0.016,
  // 0.060, 0.056, { curve: 1.0 })`, and a skirt with curve 1.0 is a CONCAVE
  // flare: measured off the built geometry its radius runs 0.016 / 0.0177 /
  // 0.027 / 0.0438 / 0.060 down its five rings, so between eye-local y = 0.044
  // and y = 0.018 the lid's radius is SMALLER than the ball's own projected
  // half-width. The eye therefore rendered as two separate iris bands — one
  // crescent above the lid, the real aperture below it — with a strip of lid
  // across the middle. That is the "no findable pupil / chrome ball bearing
  // with a black stick lying across it" the review measured, and no amount of
  // material tuning was ever going to fix it because it is a hole in the mesh.
  //
  // A cone cannot cover a sphere. The lid is now a genuine SPHERICAL CAP,
  // lathed from an arc of radius R_OUT about the eye centre, with a rolled
  // 0.003 rim at the margin and a real fan cap at the pole (profileLathe closes
  // any profile that reaches x = 0, so there is no hole left at the top).
  //
  //   R_IN  0.0465  clears the ball (0.0440) and the iris cap's proudest point
  //                 (0.0465 at its rim, 0.0483 at its apex — and the apex is
  //                 pitched 12° down, i.e. out from under the lid).
  //   R_OUT 0.0525  a 0.006 lid thickness; blends into the orbital mound, whose
  //                 inner radius is 0.047, so the two overlap and cannot gap.
  //   Y_M  -0.0018  the margin: the top 52% of D = 0.088 measured down from the
  //                 pole, which is the brief's idle lidCoverage exactly.
  //
  // The 9° down-and-forward margin slant is a rotation about the eye's own +Z
  // (the view axis), NOT about +X. About X it was a tilt in DEPTH — invisible,
  // and it dragged the front of the margin 0.008 down, closing the aperture to
  // 0.015 m, half the brief's number. About Z it is what the brief describes:
  // the outer/rear corner of the lid line sits higher than the inner/front one.
  const R_IN = 0.0465, R_OUT = 0.0525, Y_M = -0.0018
  const lidProfile = []
  for (let i = 0; i <= 4; i++) {          // rolled rim, inner margin round to outer
    const a = Math.PI + (i / 4) * Math.PI
    lidProfile.push((R_IN + R_OUT) / 2 + Math.cos(a) * 0.003, Y_M + Math.sin(a) * 0.003)
  }
  const aM = Math.asin(Y_M / R_OUT)
  for (let i = 1; i <= 10; i++) {         // outer surface, margin up over the pole
    const a = aM + (i / 10) * (Math.PI / 2 - aM)
    lidProfile.push(Math.cos(a) * R_OUT, Math.sin(a) * R_OUT)
  }
  const lid = poseGroup(e, 0, 0, 0, 0, 0, -9 * DEG * side)
  lid.add(mesh(profileLathe(lidProfile, 22, { creaseAngle: 42 }), S.fur))
  // the lash line: a hard dark edge sitting exactly on the lid's own margin, so
  // the aperture has a bottom-to-the-lid boundary that does not smear at range.
  lid.add(mesh(filletRing(R_OUT - 0.0008, 0.0032, 6, 22), S.faceDark, 0, Y_M, 0))
  // Lower lid: a fixed fleshy shelf with a fur-free rim, its top edge on the
  // brief's bottom-14%-of-D line at y = -0.0317. Aperture = -0.0018 - (-0.0317)
  // = 0.0299 m = 34% of D, which is the half-shut read, and the 0.030-diameter
  // pupil now fills it top to bottom.
  e.add(mesh(filletRing(0.0480, 0.0065, 6, 18), S.furShadow, 0, -0.0382, 0.004))
  e.add(mesh(filletRing(0.0455, 0.0035, 5, 16), S.hide, 0, -0.0352, 0.010))

  // brow: a soft fur MOUND, not a ridge — capybaras have no brow ridge. It
  // exists only to catch a sliver of key light and bound the lid.
  h.add(mesh(superellipsoid(0.0475, 0.011, 0.026, 2.4, 2.4, 12), S.fur, -0.025, 0.276, 0.113 * side))
}

// ---------------------------------------------------------------------------
// ears — small, round, dark, thin DISCS at the REAR-TOP corners of the skull,
// behind the eyes. Base world (-0.120, 1.775, ±0.125): 93% of the way aft along
// the head, sitting 0.14 m behind the eye. Ears in the middle of the skull is a
// bear. Oversized ~40% over anatomical (0.075 vs ~0.054) because at 128 px an
// anatomical pinna is 3 px and the head reads as a featureless brick.
// ---------------------------------------------------------------------------
function buildEar(ear, S, side) {
  // ROUND 1 SANK THE WHOLE PINNA INSIDE THE SKULL. The base sat at z = ±0.125
  // with a 0.020-thick disc, i.e. an outer face at ±0.135 against a skull half
  // width of 0.165 at that x — so all that showed was the sliver above the
  // crown, reading as a flat brown oval lying on the side plane. The disc is
  // now carried OUTBOARD and UP off the base: outer face at z ≈ ±0.196, clear
  // of the skull, and the tip clears the crown line by 0.045 so two bumps
  // break the flat top at its REAR end at 128 px.
  const g = poseGroup(ear, -0.004, 0.050, 0.046 * side, 26 * DEG * side, 22 * DEG * side, 0)
  // the pinna: a real disc with 0.020 of thickness and a rolled rim
  g.add(mesh(plate(superellipsePoints(0.062, 0.075, 2.2, 18), 0.020, 0.009,
    { crown: 0.005, faceSeg: 2, rimSeg: 2 }), S.faceDark))
  // shallow hairless concha bowl, 0.010 deep on the FORWARD face — a small dark
  // negative shape that sells thickness at mid distance
  g.add(mesh(lens(0.024, 0.030, 0.011, { crown: 0.005, seg: 14, faceSeg: 1, rimSeg: 1 }),
    S.hide, 0, 0.004, 0.011 * side))
  // dense short fur wrapping the edge, so it never reads as a cut-out card
  g.add(mesh(filletRing(0.033, 0.006, 5, 20), S.furFine, 0, 0.002, 0, Math.PI / 2, 0, 0))
  // base: a fur cone from the skull out to the disc — this is the piece that
  // gives the ear a visible neck instead of a pasted-on silhouette, and it
  // sleeves the joint shut at every head yaw.
  // ROUND 4 — IT ONLY REACHED HALFWAY UP. Walking a horizontal ray through the
  // ear at four heights, the base bridged skull-to-disc at y <= 1.755 and left
  // 0.093 m of clear air at y = 1.780 and 0.20 m at 1.800 — exactly the "visible
  // background between the ear disc and the skull" the review found, and it was
  // at the TOP of the ear, where what is behind it is the sky. The cone is 40%
  // taller and 30% wider at its mouth, and a fillet closes the seam where it
  // lands on the skull's side plane.
  ear.add(mesh(skirt(0.030, 0.070, 0.078, { curve: 0.35, radialSeg: 18 }), S.furFine,
    -0.002, 0.048, 0.020 * side, 38 * DEG * side, 0, 0))
  ear.add(mesh(filletRing(0.036, 0.011, 6, 20), S.furFine,
    -0.002, 0.008, 0.004 * side, 38 * DEG * side, 0, 0))
}

// ---------------------------------------------------------------------------
// headphones — the `phones` bone is a WEAPON (headphone-swing is a launcher),
// so this has to be a rigid chunky swingable mass with real thickness, not a
// decal. Worn SLUNG round the shoulders, not on the head: see buildModel.
// pw-local = world minus (-0.02, 1.40, 0).
// ---------------------------------------------------------------------------
function buildPhones(pw, S) {
  for (const side of [1, -1]) {
    const phi = side === 1 ? 36.87 * DEG : Math.PI - 36.87 * DEG
    const g = poseGroup(pw, 0.244, -0.100, 0.269 * side, 0, phi, 0)
    const c = poseGroup(g, 0, 0, 0, Math.PI / 2, 0, 0) // cup axis = disc normal

    c.add(mesh(roundedCylinder(0.095, 0.072, 0.020, 18, 2), S.phoneShell, 0, 0.010, 0))
    c.add(mesh(filletRing(0.086, 0.010, 7, 24), S.phoneAccent, 0, 0.040, 0))
    // memory-foam cushion, pressing 0.012 into the chest fur
    c.add(mesh(filletRing(0.072, 0.028, 8, 22), S.cushion, 0, -0.032, 0))
    // flat outer face for the motion-trail VFX to key off
    c.add(mesh(plate(circlePoints(0.080, 16), 0.010, 0.004, { crown: 0.003, faceSeg: 1, rimSeg: 1 }), S.phoneShell,
      0, 0.049, 0, -Math.PI / 2, 0, 0))
    // slider arm + 4 visible detent notches
    c.add(mesh(roundedBox(0.014, 0.070, 0.006, 0.002, 1), S.metal, 0, 0.020, 0.088))
    for (let i = 0; i < 4; i++) {
      c.add(mesh(roundedBox(0.016, 0.004, 0.008, 0.001, 1), S.metal, 0, -0.008 + i * 0.016, 0.088))
    }
    c.add(mesh(roundedBox(0.030, 0.026, 0.020, 0.007, 2), S.phoneShell, 0, 0.052, 0.086))
  }

  // Band: a CLOSED RIGID LOOP with real thickness (0.100 wide x 0.026 thick),
  // running from the cup yokes up over the shoulder mass to an apex in the
  // hollow directly behind the skull's rear plate. Nothing goes above y = 1.400.
  pw.add(mesh(splineTube([
    [0.220, -0.010, 0.280], [0.100, 0.006, 0.258], [-0.060, 0.004, 0.170],
    [-0.150, 0.000, 0.000],
    [-0.060, 0.004, -0.170], [0.100, 0.006, -0.258], [0.220, -0.010, -0.280],
  ], 0.013, 24, null, { radialSeg: 7, aspect: 3.8, roundEnd: true, roundStart: true }), S.phoneShell))

  // coiled cable running from the left cup down toward a pocket, clamped well
  // inside 0.35 m of its cup so it can never tangle in the hurtbox
  const coil = []
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    coil.push([0.230 - t * 0.050 + Math.sin(t * 11) * 0.014,
      -0.150 - t * 0.230,
      0.265 - t * 0.055 + Math.cos(t * 11) * 0.014])
  }
  pw.add(mesh(splineTube(coil, 0.008, 18, null, { radialSeg: 5, roundEnd: true }), S.phoneShell))
}

// ---------------------------------------------------------------------------
// surfacing — GRAPHICS_CONTRACT §4. Every region gets a real SURFACE preset;
// nothing is left on 'default'. `roughness` in the overrides is a MULTIPLIER
// against the preset's authored value (src/render/README.md §2).
//
// The factory is created PER MODEL so each fighter instance owns its materials:
// Fighter.flash() and this file's desaturate() both mutate them, and two Cool
// Pals in a mirror match must not share one set.
// ---------------------------------------------------------------------------
function buildMaterials(costume) {
  const M = makeMaterialFactory({ scope: `cool-pal/${costume}` })
  const c1 = costume === 1
  const P = (col, preset, ov) => M.pbr(col, preset, ov)

  // ONE map-opts object per texture KIND, and the flow field comes from
  // `repeat`, not from `scale`. `surfaceMaps()` keys the GPU UPLOAD on the
  // field and the map SET on the repeat, so a repeat variant is a `.clone()`
  // sharing one `source`: zero extra VRAM, one extra uniform. A `scale` tweak
  // is a whole extra 512 px map set at ~2.3 MB against an 80 MB budget shared
  // with the arena — so per-region detail is bought with repeat, always.
  //
  // fur-coarse builds its bristle grooves with 60 cycles across U and 10 along
  // V, i.e. the streaks run ALONG V. Every fur surface here therefore declares
  // a repeat whose V component sets the streak LENGTH in metres and whose U
  // component sets the hair SPACING:
  //   barrel loft   V = up the body   -> [4, 2]  ~30 mm streaks,  9 mm spacing
  //   head loft     V = nose-to-tail  -> [3, 3]  ~19 mm streaks,  5 mm spacing
  //   limb capsules V = down the limb -> [3, 3]
  //   small parts (paws, ears, brows, muzzle pads) -> [6, 6], a fine nap
  // Round 1 shipped ONE fur material at repeat 1 for the whole 1.8 m body:
  // 50 mm grooves at 37 mm spacing, which reads as varnished pine, not hair.
  // ROUND 3 — ONE COAT SCALE FOR THE WHOLE ANIMAL. The last build ran three
  // unrelated procedural fields at three unrelated world scales on one body
  // (head at repeat [3,3], barrel at [4,2], small parts at [6,6]) and the review
  // named them individually: "wood veneer, cooked oatmeal, wicker basket". Every
  // furred region now shares ONE mapOpts object and ONE repeat, so there is a
  // single hair scale from crown to ankle. `wear` — which is what drives the
  // ALBEDO mottle in fur-coarse — is cut from 0.35 to 0.10, because the measured
  // albedo standard deviation (39.9) was nearly as loud as the whole form
  // gradient (86 luma of lighting range), which is why the barrel went flat.
  // The detail moves into normal + roughness instead: normalScale is pushed to
  // 1.45 and the roughness multiplier is spread per region so the top planes
  // get a broken, gritty highlight instead of a uniform Lambert.
  const FUR = { scale: 3.2, seed: 311, wear: 0.10, repeat: [4, 4] }  // fur-coarse
  const SKIN = { scale: 1.6, seed: 5, wear: 0.15 }     // skin-elephant
  const LTH = { scale: 3.2, seed: 21, wear: 0.30 }     // leather
  const KNT = { scale: 2.0, seed: 12 }                 // cloth-knit
  // Trousers: the weave was rendering at ~8 mm thread, i.e. rattan, not canvas.
  // Tripling the repeat takes the thread to ~2.7 mm — loose cotton duck.
  const CVS = { scale: 5.0, seed: 44, repeat: [3, 3] } // cloth-weave
  const rep = (u, v) => ({ ...FUR, repeat: [u, v] })

  // The coat: coarse, sparse, bristly — 30-120 mm hair with no underhair, so
  // the skin shows through it. Every other furred fighter is soft; he is rough.
  //
  // *** THE PINK. *** SURFACE.fur-coarse ships sheen 0.35 / sheenTint 0.25 and
  // SURFACE.fur-dark ships sheen 0.40 / sheenTint 0.20, and applySurface()
  // computes sheenColor as `albedo.lerp(WHITE, 1 - sheenTint)` — i.e. an 80%
  // WHITE retro-reflective lobe. On small rounded geometry (filletRing rims,
  // plate rims, skirt rims, the cheek shells) that lobe is a grazing-angle
  // Fresnel term that saturates: the review sampled RGB(255,214,220) — a
  // channel-clipped white with the arena's cool bounce in the blue — on the
  // cheek plates, the eyelid rims, the toes and the sandal strap edges. It was
  // never an albedo; it was a blown sheen/clearcoat highlight, and the same
  // mechanism (SURFACE.plastic-gloss clearcoat 0.70 @ clearcoatRoughness 0.08)
  // is what blew out the eye. Every material in this file now declares its own
  // sheen, sheenColor, clearcoat and envMapIntensity explicitly. Nothing is
  // left on a preset's default grazing lobe.
  //
  // The sheen colour is also doing the RIM's job. Sampling the left body edge
  // gave background (255,249,224) straight into (199,147,89) — R:B = 2.2, no
  // blue lift anywhere, so a 150-luma brown figure sat on a 210-luma cream
  // arena and sank. A desaturated COOL sheen puts a cyan-side lift on exactly
  // the grazing pixels that form the silhouette, which is the separation the
  // brief asks the #7FD8FF rim for, generated from the surface instead of from
  // a light we do not own.
  const RIM = 0x93aec2
  const coat = { mapOpts: FUR, envMapIntensity: 0.50, normalScale: 1.45,
    sheen: 0.16, sheenRoughness: 0.62, sheenColor: RIM, roughness: 0.98 }
  const coatHead = { ...coat }
  const coatFine = { ...coat, mapOpts: rep(7, 7), sheen: 0.10, normalScale: 1.2 }

  return {
    M,
    fur: P(C.furBase, 'fur-coarse', coat),
    // head and limbs take the SAME field at the SAME repeat as the barrel — one
    // animal, one hair scale. Identical keys, so the factory hands back one
    // material instance and this costs nothing in draw calls or VRAM.
    furHead: P(C.furBase, 'fur-coarse', coatHead),
    furLimb: P(C.furBase, 'fur-coarse', coatHead),
    // the only exception: parts under ~60 mm (paw digits, ear rims, brow mounds,
    // muzzle pads), where the body repeat would put one hair across the whole part
    furFine: P(C.furBase, 'fur-coarse', coatFine),
    // the barrel carries its ventral field as a VERTEX-COLOUR blend rather than
    // as a proud pasted plate: albedo is furBelly and the dorsal vertices
    // multiply it down to furBase across a 0.05 m noisy transition.
    furGraded: P(C.furBelly, 'fur-coarse', { ...coat, vertexColors: true }),
    // sun-hit upper planes: skull top, shoulders, rump crest, forearm tops.
    // THE ROUGHNESS BREAK the brief asks for (0.78 in the bristle tips, 0.94 in
    // the troughs) is bought here: the top planes run one notch glossier than
    // the body so a raking key leaves a broken gritty band along them instead
    // of the uniform Lambert the review measured.
    furWarm: P(C.furWarm, 'fur-coarse', { ...coat, roughness: 0.88, sheen: 0.20 }),
    // ventral coat is longer and laxer, so it reads slightly matter
    furBelly: P(C.furBelly, 'fur-coarse', { ...coat, roughness: 1.0 }),
    furShadow: P(C.furShadow, 'fur-coarse', { ...coatFine, sheen: 0.06 }),
    // Face + ear exterior: shorter, denser, darker. fur-dark's own sheen is 0.40
    // at tint 0.20 — an 80%-white grazing lobe, and this material is on the cheek
    // shells, the eyelid rims and the outer-limb stripes, which is exactly where
    // the review found the pink plates. Sheen down to 0.08 with the cool rim tint.
    faceDark: P(C.faceDark, 'fur-dark', { mapOpts: rep(7, 7), envMapIntensity: 0.35,
      sheen: 0.08, sheenRoughness: 0.7, sheenColor: RIM, normalScale: 1.2 }),
    // the grey-brown skin seen between the hairs — bald patches on rump/crown/forelimb
    skinUnder: P(C.skinUnder, 'hide', { mapOpts: SKIN, roughness: 0.95,
      sheen: 0.05, sheenColor: RIM, envMapIntensity: 0.45 }),
    // hairless mammalian nose pad: matte-damp, never waxy. The crackle cell
    // size is set by repeat, not by scale — at repeat 1 the crepe read as tree
    // bark at 1 m, so it runs 3x finer here and the normal is pulled back.
    rhinarium: P(C.rhinarium, 'hide', { mapOpts: { ...SKIN, repeat: [4, 4] }, roughness: 0.82,
      normalScale: 0.75, sheen: 0.04, sheenColor: RIM, envMapIntensity: 0.40 }),
    // the nostril slits: the darkest legal value on the face, matte, no
    // specular sparkle inside the slit.
    nostril: P(C.nostrilDark, 'hide', { mapOpts: { ...SKIN, repeat: [5, 5] }, roughness: 1.1,
      envMapIntensity: 0.12, sheen: 0.0 }),
    // the scent gland: the only glossy organic surface on the animal, and the
    // one place a small clearcoat is DELIBERATE — it is what puts the single
    // specular pip on the top line of the head under a rim.
    morrillo: P(C.morrillo, 'rubber', { roughness: 0.43, clearcoat: 0.22, clearcoatRoughness: 0.30,
      envMapIntensity: 0.75 }),
    hide: P(C.faceDark, 'hide', { mapOpts: SKIN, roughness: 0.88,
      sheen: 0.05, sheenColor: RIM, envMapIntensity: 0.45 }),
    mouth: P(C.mouthDark, 'hide', { mapOpts: SKIN, roughness: 1.0,
      sheen: 0.0, envMapIntensity: 0.25 }),
    // eye stack — plastic-gloss, NOT glass: a transmissive sclera renders the
    // arena through his head.
    //
    // *** THE BLOWN EYE. *** SURFACE['plastic-gloss'] ships clearcoat 0.70 at
    // clearcoatRoughness 0.08 and envMapIntensity 1.25. A clearcoat lobe that
    // tight on a 0.044 ball is a mirror, and its Fresnel goes to 1.0 at the rim
    // of the aperture, so the whole eye rendered as one blown white blob with no
    // findable iris and no findable pupil. The corneal shell on top of it
    // (clearcoat 1.0 @ 0.06) doubled it. That shell is DELETED — the bulge is now
    // the iris cap's own geometry — and the three eye materials each carry a
    // small, explicit, wide clearcoat instead of the preset's mirror.
    //
    // They also carry polygonOffset. The iris and pupil caps are only ~0.0015 m
    // proud of the shell beneath them (any more and the bulge pokes through the
    // lid at the aperture margin), and 1.5 mm of separation at 12 m of camera
    // distance is inside the depth buffer's noise. A negative polygon offset
    // makes the layering a DEPTH-BIAS decision rather than a geometry race, so
    // the pupil cannot lose to the iris and the iris cannot lose to the sclera —
    // which is what the last two builds kept doing.
    sclera: P(C.sclera, 'plastic-gloss', { roughness: 1.6, clearcoat: 0.10,
      clearcoatRoughness: 0.55, envMapIntensity: 0.35 }),
    iris: P(C.iris, 'plastic-gloss', { roughness: 1.35, clearcoat: 0.18,
      clearcoatRoughness: 0.40, envMapIntensity: 0.30,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    pupil: P(C.pupil, 'plastic-gloss', { roughness: 1.1, clearcoat: 0.30,
      clearcoatRoughness: 0.12, envMapIntensity: 0.45,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    // ONE discrete geometry catchlight, and it is now the ONLY blown value on
    // the eye. A hard bright dot against a dark iris ring is the first thing
    // that resolves on any AAA face at any distance; a 25%-of-aperture clearcoat
    // wash is the first thing that marks one as amateur. It renders last, in
    // front of everything, at 0.004 m — roughly 1/8 of the visible aperture.
    pip: P(C.incisorCore, 'plastic-gloss', { roughness: 0.30, clearcoat: 0.4,
      clearcoatRoughness: 0.10, envMapIntensity: 0.6,
      emissive: 0x241f1b, emissiveIntensity: 1,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
    incisor: P(C.incisor, 'bone', { roughness: 0.46, envMapIntensity: 0.7 }),
    incisorCore: P(C.incisorCore, 'bone', { roughness: 0.58, envMapIntensity: 0.7 }),
    // horn ships clearcoat 0.35 @ 0.30 with envMapIntensity 1.0. On a 0.012 m
    // nail cap that is a grazing-angle white ring, and the review found exactly
    // that as "pink around every toe".
    nail: P(C.nail, 'horn', { roughness: 1.27, clearcoat: 0.10, clearcoatRoughness: 0.55,
      envMapIntensity: 0.5 }),
    // wardrobe — chunky knit cardigan (NOT a crew-neck sweater), canvas trousers
    // (a canvas weave, never a jeans twill — that preset is never asked for here),
    // and worn tan leather sandals over three bare hoofed toes.
    // the knit separates from the coat by SATURATION, not value (0.77 vs 0.53),
    // so its sheen stays warm and modest — a cool sheen here would grey it out
    // and the whole wardrobe read goes with it.
    knit: P(c1 ? C.knit1 : C.knit0, 'knit', { mapOpts: KNT, sheen: 0.22,
      sheenRoughness: 0.8, sheenColor: 0xb9a483, envMapIntensity: 0.45 }),
    knitRib: P(c1 ? C.knitRib1 : C.knitRib0, 'knit', { mapOpts: KNT, sheen: 0.20,
      sheenRoughness: 0.8, sheenColor: 0xb9a483, normalScale: 1.5, envMapIntensity: 0.45 }),
    canvas: P(c1 ? C.canvas1 : C.canvas0, 'cloth', { mapOpts: CVS, roughness: 1.1,
      sheen: 0.10, sheenRoughness: 0.85, sheenColor: RIM, envMapIntensity: 0.45 }),
    canvasCuff: P(c1 ? C.canvasCuff1 : C.canvasCuff0, 'cloth', { mapOpts: CVS, roughness: 1.1,
      sheen: 0.08, sheenRoughness: 0.85, sheenColor: RIM, envMapIntensity: 0.4 }),
    // leather ships clearcoat 0.30 @ 0.45 and env 0.95 — the blown white edge
    // the review found along the top of both sandal straps.
    leather: P(C.leatherTan, 'leather', { mapOpts: LTH, roughness: 1.13,
      clearcoat: 0.08, clearcoatRoughness: 0.65, envMapIntensity: 0.45 }),
    sole: P(C.soleRubber, 'rubber', { roughness: 1.0, normalScale: 1.2, envMapIntensity: 0.35 }),
    // hardware — soleRubber .21 at the feet and phoneShell .18 at the shoulders
    // bracket the figure top and bottom on purpose.
    phoneShell: P(C.phoneShell, 'plastic', { envMapIntensity: 0.7, roughness: 1.05 }),
    // The cups carried the highest chroma on the whole model and out-shouted the
    // yuzu, which breaks the brief's own hardware chroma budget: nothing may
    // out-value or out-saturate the fruit. The ring is desaturated ~35% toward
    // the shell and its mirror clearcoat is pulled back to a broad sheen.
    phoneAccent: P(c1 ? C.phoneAccent1 : C.phoneAccent0, 'plastic-gloss',
      { clearcoat: 0.2, clearcoatRoughness: 0.35, roughness: 1.9, envMapIntensity: 0.55 }),
    cushion: P(0x3a3d47, 'leather', { mapOpts: LTH, roughness: 1.27, normalScale: 1.4,
      clearcoat: 0.05, clearcoatRoughness: 0.7, envMapIntensity: 0.35 }),
    metal: P(C.metalTrim, 'metal', { roughness: 1.4, envMapIntensity: 0.85 }),
    // props
    // the tumbler read as a lit candle in round 1 — clearcoat 1.0 at
    // envMapIntensity 1.5 is a mirror, and it bloomed. Pulled back to a plain
    // thin dielectric shell.
    glass: P(C.drinkGlass, 'glass', { transmission: 0.0, transparent: true, opacity: 0.34,
      depthWrite: false, clearcoat: 0.35, clearcoatRoughness: 0.18, envMapIntensity: 0.45 }),
    liquid: P(C.citrus, 'glass', { transmission: 0.0, transparent: true, opacity: 0.85,
      depthWrite: false, roughness: 2.5, envMapIntensity: 0.5 }),
    // the citrus wheel has to let light through when it is backlit
    citrus: P(C.citrus, 'foliage', { transparent: true, opacity: 0.9, alphaTest: 0, roughness: 0.7 }),
    // Citrus peel is a pitted, faintly waxy dielectric: the leather generator's
    // micro-pebble at a fine repeat IS peel — no bespoke kind needed. The
    // dimple has to be FINE (repeat 4) or the fruit reads as a lump of cheese,
    // and the clearcoat is what makes it catch a hard highlight and separate
    // from a matte brown crown at 128 px.
    yuzu: P(c1 ? C.yuzu1 : C.yuzu0, 'leather', { mapOpts: { ...LTH, repeat: [5, 5] },
      roughness: 0.82, normalScale: 1.1, clearcoat: 0.28, clearcoatRoughness: 0.30,
      envMapIntensity: 0.8 }),
    yuzuStem: P(0x6d5a32, 'wood', { envMapIntensity: 0.5 }),
    yuzuLeaf: P(0x5f8f3e, 'foliage', { roughness: 0.85, envMapIntensity: 0.5 }),
    // feather ships iridescence 0.15 — a hue-shifting grazing film. On a 0.13 m
    // bird sitting next to the head that is another out-of-palette edge, so it
    // is zeroed and the sheen pulled to the model's cool rim value.
    birdSlate: P(C.birdSlate, 'feather', { iridescence: 0, sheen: 0.18,
      sheenRoughness: 0.6, sheenColor: RIM, envMapIntensity: 0.55 }),
    birdCream: P(c1 ? C.birdCream1 : C.birdCream0, 'feather', { iridescence: 0, sheen: 0.14,
      sheenRoughness: 0.6, sheenColor: RIM, envMapIntensity: 0.5 }),
    grass: P(C.grass, 'foliage', { envMapIntensity: 0.6 }),
  }
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, 1.80 m tall (skull crown = 1.800).
//
// Bone map is UNCHANGED from the previous build, exactly and by name:
//   hips torso head armL armR forearmL forearmR legL legR earL earR phones
// No bone is added, renamed, removed or re-parented. Every extra structure
// below (jaw plate, lids, props, pose groups) is a plain static THREE.Group.
//
// World-space landmark stack (metres above the floor):
//   0.040 sandal footbed · 0.300 rolled cuff · 0.720 hip crease (legs = 40% of
//   height) · 0.850 hips bone · 0.878 pocket mouth · 0.970 torso bone / knit hem
//   · 1.060 belly widest 0.76 across · 1.240 chest widest 0.66 · 1.300 slung
//   headphone cups · 1.350 shoulder balls z=±0.30 · 1.400 top of shoulder mass
//   (there is no neck) · 1.440 head bone / chin · 1.675 eye centres · 1.775 ear
//   bases · 1.800 skull crown · 1.845 ear tips · 1.873 top of the yuzu.
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}
  const S = buildMaterials(costume)

  const hips = pivot(group, 0, 0.85, 0)
  bones.hips = hips
  buildHips(hips, S)

  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.02, 0.17 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    buildLeg(leg, S, side)
  }

  const torso = pivot(hips, 0, 0.12, 0)
  bones.torso = torso
  buildTorso(torso, S)

  for (const side of [1, -1]) {
    const arm = pivot(torso, 0, 0.38, 0.30 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    const fore = pivot(arm, 0, -0.26, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    buildArm(arm, fore, S, side)
  }

  const head = pivot(torso, 0.06, 0.47, 0)
  bones.head = head
  // The unbothered tilt, baked as a static wrapper so every animated bone still
  // starts at rotation (0,0,0) = bind pose.
  //
  // ROUND 4 — THE TILT WAS ON THE WRONG AXIS AND IT WAS A PITCH. The model
  // faces +X and +Z is the character's LEFT, so on this rig a rotation about Z
  // is PITCH and a rotation about X is ROLL. The build was passing the 7° as
  // `rz`, i.e. 7° of NOSE-UP PITCH — which the brief forbids outright ("never
  // pitch the head up; positive pitch reads as alert or eager") and which broke
  // the one geometric promise the whole head makes: it rotated block A's top
  // plane from -3.3° to +3.7° (positive, so the yuzu reads as about to roll off
  // the BACK) and it dropped the crown from y = 1.800 to 1.770, so
  // CharacterDef.height = 1.8 stopped being the crown at all. Pitch is 0 now
  // and the 7° is a roll about X — a tilt toward the camera, which is what §3.8
  // actually asks for.
  const hw = bent(head, 0, 7 * DEG, 10 * DEG)
  buildHead(hw, S)

  // ears ride the tilted skull so the base never opens a gap; they are still
  // descendants of `head`, so the rig hierarchy contract is untouched.
  for (const side of [1, -1]) {
    const ear = pivot(hw, -0.180, 0.335, 0.125 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    buildEar(ear, S, side)
  }

  // Headphones: worn SLUNG round the shoulders, never on the head — a 0.19 m
  // over-ear cup centred on a rear-set capybara pinna swallows the two ear nubs
  // that carry the 128 px silhouette. The `phones` bone keeps its parent (head)
  // and its zero-rotation bind pose; only the rest OFFSET moved, down onto the
  // shoulder mass at world (-0.02, 1.40, 0). That also puts the swung mass at
  // y≈1.30, which agrees with the existing headphone-swing hitbox up:1.2 far
  // better than a head-mounted y=1.79 ever did.
  const phones = pivot(head, -0.08, -0.04, 0)
  bones.phones = phones
  buildPhones(bent(phones), S)

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  mergeBoneStatics(group, bones)
  group.traverse((o) => {
    // The geometry cache hands the same BufferGeometry to every instance;
    // Fighter.dispose() honours `userData.__shared` and will not free it.
    if (o.isMesh && isSharedGeometry(o.geometry)) o.geometry.userData.__shared = true
  })

  return { group, bones }
}

/**
 * Draw-call collapse. Everything that rides ONE bone and shares ONE material is
 * one draw call: ~300 primitives becomes ~50. Merging never crosses a joint —
 * the filter keeps each mesh with its nearest bone ancestor — and the three
 * props that get toggled, reparented or severed at runtime carry
 * `userData.noMerge` so they survive as addressable objects.
 */
function mergeBoneStatics(group, bones) {
  const boneSet = new Set(Object.values(bones))
  const nearest = (o) => { let p = o.parent; while (p) { if (boneSet.has(p)) return p; p = p.parent } return null }
  group.updateMatrixWorld(true)
  for (const bone of boneSet) {
    try { mergeParts(bone, { inPlace: true, filter: (m) => nearest(m) === bone }) }
    catch (e) { console.warn('[cool-pal] draw-call merge skipped for a bone', e) }
  }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.85,0]
// Cool Pal's whole deal: small motions, long holds, huge results.
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.85, 0]
const SIT = [0, 0.34, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.2, [0, 0, 0.015], [0, 0.835, 0]), K(2.4, Z, HIP)],
      torso: [K(0, [0, 0, 0.1]), K(1.2, [0.01, -0.02, 0.13]), K(2.4, [0, 0, 0.1])],
      // vibing to the headphones: slow steady nod
      head: [K(0, [0, 0, -0.06]), K(0.6, [0, 0, 0.05]), K(1.2, [0, 0, -0.06]), K(1.8, [0, 0, 0.05]), K(2.4, [0, 0, -0.06])],
      phones: [K(0, Z), K(0.6, [0, 0, 0.06]), K(1.2, Z), K(1.8, [0, 0, 0.06]), K(2.4, Z)],
      earL: [K(0, Z), K(1.1, [0, 0.15, 0.1]), K(1.3, Z), K(2.4, Z)],
      earR: [K(0, Z), K(1.7, [0, -0.15, 0.1]), K(1.9, Z), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.12]), K(1.2, [0.03, 0, 0.16]), K(2.4, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(1.2, [-0.03, 0, 0.17]), K(2.4, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15])],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  walk: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0.03, -0.02], [0, 0.83, 0]), K(0.2, Z, [0, 0.81, 0]), K(0.4, [0, -0.03, -0.02], [0, 0.835, 0]), K(0.6, Z, [0, 0.81, 0]), K(0.8, [0, 0.03, -0.02], [0, 0.83, 0])],
      legL: [K(0, [0, 0, 0.38]), K(0.4, [0, 0, -0.38]), K(0.8, [0, 0, 0.38])],
      legR: [K(0, [0, 0, -0.38]), K(0.4, [0, 0, 0.38]), K(0.8, [0, 0, -0.38])],
      torso: [K(0, [0, -0.03, 0.1]), K(0.4, [0, 0.03, 0.1]), K(0.8, [0, -0.03, 0.1])],
      head: [K(0, [0, 0, -0.03]), K(0.2, [0, 0, 0.05]), K(0.4, [0, 0, -0.03]), K(0.6, [0, 0, 0.05]), K(0.8, [0, 0, -0.03])],
      phones: [K(0, Z), K(0.2, [0, 0, 0.05]), K(0.4, Z), K(0.6, [0, 0, 0.05]), K(0.8, Z)],
      armL: [K(0, [0, 0, -0.15]), K(0.4, [0, 0, 0.22]), K(0.8, [0, 0, -0.15])],
      armR: [K(0, [0, 0, 0.22]), K(0.4, [0, 0, -0.15]), K(0.8, [0, 0, 0.22])],
      forearmL: [K(0, [0, 0, 0.2])], forearmR: [K(0, [0, 0, 0.2])],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, 0.05], [0, 0.9, 0]), K(0.5, [0, 0, 0.05], [0, 0.9, 0])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.6]), K(0.5, [0, 0, 0.5])],
      legR: [K(0, Z), K(0.12, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      // arms stay down. jumping is not worth raising your arms for.
      armL: [K(0, [0, 0, 0.12]), K(0.12, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      armR: [K(0, [0, 0, 0.13]), K(0.12, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      torso: [K(0, [0, 0, 0.1]), K(0.12, [0, 0, 0.16])],
      head: [K(0, Z), K(0.12, [0, 0, -0.08])],
      phones: [K(0, Z), K(0.12, [0, 0, -0.12]), K(0.35, [0, 0, 0.05]), K(0.5, Z)],
      earL: [K(0, Z), K(0.12, [-0.2, 0, 0])], earR: [K(0, Z), K(0.12, [-0.2, 0, 0])],
    },
  },

  fall: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.06], HIP)],
      torso: [K(0, [0, 0, 0.14])],
      head: [K(0, [0, 0, -0.04])],
      armL: [K(0, [-0.2, 0, 0.7]), K(0.3, [-0.3, 0, 0.9]), K(0.6, [-0.2, 0, 0.7])],
      armR: [K(0, [0.3, 0, 0.9]), K(0.3, [0.2, 0, 0.7]), K(0.6, [0.3, 0, 0.9])],
      legL: [K(0, [-0.2, 0, 0.3]), K(0.3, [-0.2, 0, 0.15]), K(0.6, [-0.2, 0, 0.3])],
      legR: [K(0, [0.2, 0, 0.15]), K(0.3, [0.2, 0, 0.3]), K(0.6, [0.2, 0, 0.15])],
      phones: [K(0, [0, 0, -0.18]), K(0.3, [0, 0, -0.1]), K(0.6, [0, 0, -0.18])],
      earL: [K(0, [-0.3, 0, 0])], earR: [K(0, [-0.3, 0, 0])],
    },
  },

  crouch: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.56, 0]), K(0.4, [0, 0, -0.08], [0, 0.545, 0]), K(0.8, [0, 0, -0.08], [0, 0.56, 0])],
      legL: [K(0, [-0.45, 0, 0.75])], legR: [K(0, [0.45, 0, 0.75])],
      torso: [K(0, [0, 0, -0.15])],
      head: [K(0, [0, 0, 0.14])],
      armL: [K(0, [0.25, 0, 0.4])], armR: [K(0, [-0.25, 0, 0.4])],
      forearmL: [K(0, [0, 0, 0.9])], forearmR: [K(0, [0, 0, 0.9])],
      phones: [K(0, Z), K(0.4, [0, 0, 0.04]), K(0.8, Z)],
    },
  },

  block: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.04, 0.82, 0])],
      torso: [K(0, [0, 0, 0.2]), K(0.4, [0.02, 0, 0.22]), K(0.8, [0, 0, 0.2])],
      head: [K(0, [0, 0, -0.14])],
      // one lazy forearm. it is enough.
      armL: [K(0, [0.3, 0, 0.8])], armR: [K(0, [-0.25, 0, 1.0])],
      forearmL: [K(0, [0, 0, 1.4])], forearmR: [K(0, [0, 0, 1.7])],
      phones: [K(0, [0, 0, 0.1])],
      legL: [K(0, [-0.12, 0, 0.08])], legR: [K(0, [0.12, 0, 0.08])],
    },
  },

  hitLight: {
    duration: 0.28, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.08], [-0.06, 0.83, 0]), K(0.28, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.08, 0.28]), K(0.28, [0, 0, 0.1])],
      // mildly inconvenienced
      head: [K(0, Z), K(0.05, [0, 0.08, 0.4]), K(0.18, [0, -0.1, 0.1]), K(0.28, Z)],
      phones: [K(0, Z), K(0.06, [0, 0, -0.35]), K(0.16, [0, 0, 0.15]), K(0.28, Z)],
      armL: [K(0, Z), K(0.05, [0.25, 0, -0.4]), K(0.28, [0, 0, 0.12])],
      armR: [K(0, Z), K(0.05, [-0.25, 0, -0.35]), K(0.28, [0, 0, 0.13])],
      earL: [K(0, Z), K(0.06, [0.3, 0.3, 0]), K(0.28, Z)],
      earR: [K(0, Z), K(0.06, [-0.3, -0.3, 0]), K(0.28, Z)],
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.2], [-0.18, 0.8, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.12, 0.5]), K(0.42, [0, 0, 0.1])],
      head: [K(0, Z), K(0.06, [0, 0.12, 0.65]), K(0.42, Z)],
      phones: [K(0, Z), K(0.07, [0, 0, -0.6]), K(0.2, [0, 0, 0.25]), K(0.42, Z)],
      armL: [K(0, Z), K(0.06, [0.45, 0, -1.0]), K(0.42, [0, 0, 0.12])],
      armR: [K(0, Z), K(0.06, [-0.45, 0, -0.9]), K(0.42, [0, 0, 0.13])],
      legL: [K(0, Z), K(0.07, [0, 0, 0.4]), K(0.42, Z)],
      earL: [K(0, Z), K(0.07, [0.45, 0.4, 0]), K(0.42, Z)],
      earR: [K(0, Z), K(0.07, [-0.45, -0.4, 0]), K(0.42, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.25], HIP)],
      torso: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.45]), K(0.5, [0, 0, 0.55])],
      head: [K(0, [0, 0, 0.4])],
      armL: [K(0, [-0.3, 0, 1.9]), K(0.25, [-0.15, 0, 2.1]), K(0.5, [-0.3, 0, 1.9])],
      armR: [K(0, [0.15, 0, 2.1]), K(0.25, [0.3, 0, 1.9]), K(0.5, [0.15, 0, 2.1])],
      legL: [K(0, [0, 0, 0.75]), K(0.25, [0, 0, 0.55]), K(0.5, [0, 0, 0.75])],
      legR: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 0.65]), K(0.5, [0, 0, 0.5])],
      phones: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, -0.3]), K(0.5, [0, 0, -0.5])],
      earL: [K(0, [-0.5, 0.2, 0])], earR: [K(0, [-0.5, -0.2, 0])],
    },
  },

  // knocked down = accidentally napping. hands behind head, one leg crossed.
  knockdown: {
    duration: 1.2, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.6, [0, 0, 1.35], [0, 0.335, 0]), K(1.2, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])],
      legR: [K(0, [0.35, 0, 0.75])],
      torso: [K(0, [0, 0, 0.08]), K(0.6, [0, 0, 0.12]), K(1.2, [0, 0, 0.08])],
      head: [K(0, [0, 0, -0.2])],
      armL: [K(0, [1.5, 0, 0.5])], armR: [K(0, [-1.5, 0, 0.5])],
      forearmL: [K(0, [0, 0, 1.6])], forearmR: [K(0, [0, 0, 1.6])],
      phones: [K(0, [0, 0, 0.12])],
      earL: [K(0, [0.5, 0, 0])], earR: [K(0, [-0.5, 0, 0])],
    },
  },

  getup: {
    duration: 0.8, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.3, [0, 0, 0.5], [0, 0.5, 0]), K(0.6, [0, 0, 0.05], [0, 0.7, 0]), K(0.8, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.4, [0, 0, 0.55]), K(0.8, Z)],
      legR: [K(0, [0.35, 0, 0.75]), K(0.4, [0, 0, 0.3]), K(0.8, Z)],
      torso: [K(0, [0, 0, 0.08]), K(0.35, [0, 0, -0.3]), K(0.8, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.2]), K(0.55, [0, 0, 0.1]), K(0.8, Z)],
      armL: [K(0, [1.5, 0, 0.5]), K(0.35, [0.3, 0, -0.45]), K(0.8, [0, 0, 0.12])],
      armR: [K(0, [-1.5, 0, 0.5]), K(0.35, [-0.3, 0, -0.45]), K(0.8, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 1.6]), K(0.4, [0, 0, 0.2]), K(0.8, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 1.6]), K(0.4, [0, 0, 0.2]), K(0.8, [0, 0, 0.15])],
      phones: [K(0, [0, 0, 0.12]), K(0.6, [0, 0, -0.15]), K(0.72, [0, 0, 0.08]), K(0.8, Z)],
    },
  },

  // ambles to his mark, seats the headphones properly, gives ONE approving nod
  entrance: {
    duration: 3.0, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.83, 0]), K(0.8, Z, HIP), K(3.0, Z, HIP)],
      legL: [K(0, [0, 0, 0.35]), K(0.25, [0, 0, -0.35]), K(0.5, [0, 0, 0.35]), K(0.8, Z), K(3.0, Z)],
      legR: [K(0, [0, 0, -0.35]), K(0.25, [0, 0, 0.35]), K(0.5, [0, 0, -0.35]), K(0.8, Z), K(3.0, Z)],
      armL: [K(0, [0, 0, 0.12]), K(1.0, [0, 0, 2.1]), K(1.9, [0, 0, 2.1]), K(2.3, [0, 0, 0.12]), K(3.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(1.0, [0, 0, 2.1]), K(1.9, [0, 0, 2.1]), K(2.3, [0, 0, 0.13]), K(3.0, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(1.0, [0, 0, -2.1]), K(1.9, [0, 0, -2.1]), K(2.3, [0, 0, 0.15]), K(3.0, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(1.0, [0, 0, -2.15]), K(1.9, [0, 0, -2.15]), K(2.3, [0, 0, 0.15]), K(3.0, [0, 0, 0.15])],
      phones: [K(0, Z), K(1.1, [0, 0, -0.12]), K(1.35, [0, 0, 0.1]), K(1.6, [0, 0, -0.06]), K(1.9, Z), K(3.0, Z)],
      head: [K(0, [0, 0, -0.03]), K(1.0, [0, 0, 0.1]), K(1.9, [0, 0, 0.1]), K(2.5, [0, 0, -0.22]), K(2.8, [0, 0, 0.05]), K(3.0, Z)],
      torso: [K(0, [0, 0, 0.1]), K(1.0, [0, 0, 0.05]), K(2.5, [0, 0, 0.12]), K(3.0, [0, 0, 0.1])],
      earL: [K(0, Z), K(2.5, [0.3, 0.3, 0]), K(2.7, Z), K(3.0, Z)],
      earR: [K(0, Z), K(2.5, [-0.3, -0.3, 0]), K(2.7, Z), K(3.0, Z)],
    },
  },

  // sits down right there and bobs to the beat. winning changes nothing.
  win: {
    duration: 3.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.5, [0, 0, -0.15], SIT), K(3.0, [0, 0, -0.15], SIT)],
      legL: [K(0, Z), K(0.5, [-0.15, 0, 1.25]), K(3.0, [-0.15, 0, 1.25])],
      legR: [K(0, Z), K(0.5, [0.15, 0, 1.15]), K(3.0, [0.15, 0, 1.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.5, [0, 0, 0.22]), K(3.0, [0, 0, 0.22])],
      head: [K(0, Z), K(0.7, [0, 0, -0.08]), K(1.1, [0, 0, 0.12]), K(1.5, [0, 0, -0.08]), K(1.9, [0, 0, 0.12]), K(2.3, [0, 0, -0.08]), K(2.7, [0, 0, 0.12]), K(3.0, [0, 0, -0.08])],
      phones: [K(0, Z), K(0.7, [0, 0, 0.08]), K(1.1, [0, 0, -0.05]), K(1.5, [0, 0, 0.08]), K(1.9, [0, 0, -0.05]), K(2.3, [0, 0, 0.08]), K(2.7, [0, 0, -0.05]), K(3.0, [0, 0, 0.08])],
      armL: [K(0, [0, 0, 0.12]), K(0.5, [0.25, 0, 0.55]), K(3.0, [0.25, 0, 0.55])],
      armR: [K(0, [0, 0, 0.13]), K(0.5, [-0.25, 0, 0.5]), K(3.0, [-0.25, 0, 0.5])],
      // one paw taps the knee on the beat
      forearmL: [K(0, [0, 0, 0.15]), K(0.5, [0, 0, 0.7]), K(3.0, [0, 0, 0.7])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.7, [0, 0, 0.9]), K(1.1, [0, 0, 0.55]), K(1.5, [0, 0, 0.9]), K(1.9, [0, 0, 0.55]), K(2.3, [0, 0, 0.9]), K(2.7, [0, 0, 0.55]), K(3.0, [0, 0, 0.9])],
      earL: [K(0, Z), K(1.1, [0, 0.2, 0]), K(1.3, Z), K(3.0, Z)],
      earR: [K(0, Z), K(1.9, [0, -0.2, 0]), K(2.1, Z), K(3.0, Z)],
    },
  },

  // reclines flat and naps. losing also changes nothing.
  lose: {
    duration: 2.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.25], [0, 0.33, 0]), K(1.3, [0, 0, 1.25], [0, 0.345, 0]), K(2.6, [0, 0, 1.25], [0, 0.33, 0])],
      legL: [K(0, [0, 0, 0.25])],
      legR: [K(0, [0.4, 0, 0.8])],
      torso: [K(0, [0, 0, 0.1]), K(1.3, [0, 0, 0.15]), K(2.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.15]), K(1.3, [0, 0.05, -0.12]), K(2.6, [0, 0, -0.15])],
      armL: [K(0, [1.5, 0, 0.5])], armR: [K(0, [-1.5, 0, 0.5])],
      forearmL: [K(0, [0, 0, 1.6])], forearmR: [K(0, [0, 0, 1.6])],
      phones: [K(0, [0, 0, 0.12])],
      earL: [K(0, [0.4, 0, 0]), K(1.3, [0.5, 0, 0]), K(2.6, [0.4, 0, 0])],
      earR: [K(0, [-0.4, 0, 0])],
    },
  },

  // lifts one cup off the ear: "...you say something?"
  taunt: {
    duration: 1.6, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.3, [0, 0, 2.3]), K(1.2, [0, 0, 2.3]), K(1.6, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.3, [0, 0, -2.3]), K(1.2, [0, 0, -2.3]), K(1.6, [0, 0, 0.15])],
      phones: [K(0, Z), K(0.35, [0.28, 0, -0.1]), K(1.15, [0.28, 0, -0.1]), K(1.5, Z), K(1.6, Z)],
      head: [K(0, Z), K(0.4, [0, -0.35, 0.05]), K(1.1, [0, -0.35, 0.05]), K(1.4, [0, 0.1, 0]), K(1.6, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.4, [0, -0.15, 0.12]), K(1.1, [0, -0.15, 0.12]), K(1.6, [0, 0, 0.1])],
      earR: [K(0, Z), K(0.4, [0, -0.3, 0.2]), K(1.2, [0, -0.3, 0.2]), K(1.6, Z)],
      armL: [K(0, [0, 0, 0.12])],
      hips: [K(0, Z, HIP)],
    },
  },

  // ----------------------------------------------------------- move clips --
  // one slow palm. huge pushback. minimum effort, maximum message.
  lazyPalm: {
    duration: 0.4, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.13, [0, 0, 0.45]), K(0.2, [0, 0, 1.35]), K(0.3, [0, 0, 1.2]), K(0.4, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.13, [0, 0, -0.6]), K(0.2, [0, 0, -0.1]), K(0.4, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.13, [0, -0.18, 0.1]), K(0.2, [0, 0.22, 0.02]), K(0.4, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.2, [0, 0.12, 0], [0.04, 0.84, 0]), K(0.4, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, 0.08, 0.03]), K(0.4, Z)],
      phones: [K(0, Z), K(0.22, [0, 0, 0.1]), K(0.4, Z)],
      armL: [K(0, [0, 0, 0.12])],
    },
  },

  // legendary slow kick: long lift, tiny pause, deceptively violent extension
  slowKick: {
    duration: 0.55, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.16, [0, 0, 0.9]), K(0.21, [0, 0, 0.85]), K(0.27, [0, 0, 1.7]), K(0.38, [0, 0, 1.4]), K(0.55, Z)],
      hips: [K(0, Z, HIP), K(0.16, [0, 0, -0.06], [-0.04, 0.84, 0]), K(0.27, [0, 0, 0.12], [0.08, 0.88, 0]), K(0.55, Z, HIP)],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, 0, 0.02]), K(0.27, [0, 0, 0.25]), K(0.55, [0, 0, 0.1])],
      head: [K(0, Z), K(0.27, [0, 0, 0.12]), K(0.55, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.27, [0.2, 0, 0.5]), K(0.55, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.27, [-0.2, 0, -0.4]), K(0.55, [0, 0, 0.13])],
      phones: [K(0, Z), K(0.29, [0, 0, -0.25]), K(0.42, [0, 0, 0.1]), K(0.55, Z)],
      legL: [K(0, Z)],
    },
  },

  // rotates the shoulder in, leans. the foe bounces off. that is the move.
  shoulderLean: {
    duration: 0.5, loop: false,
    tracks: {
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, 0.45, 0.05]), K(0.2, [0, 0.5, -0.4]), K(0.34, [0, 0.45, -0.32]), K(0.5, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.14, [0, 0.25, 0], HIP), K(0.2, [0, 0.3, -0.08], [0.16, 0.82, 0]), K(0.5, Z, HIP)],
      head: [K(0, Z), K(0.14, [0, -0.2, 0]), K(0.2, [0, -0.3, -0.1]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.2, [0.3, 0, 0.6]), K(0.5, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.2, [-0.4, 0, -0.5]), K(0.5, [0, 0, 0.13])],
      legL: [K(0, Z), K(0.2, [0, 0, 0.35]), K(0.5, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.5, Z)],
      phones: [K(0, Z), K(0.22, [0, 0, -0.3]), K(0.36, [0, 0, 0.12]), K(0.5, Z)],
      earL: [K(0, Z), K(0.22, [0.3, 0.3, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.22, [-0.3, -0.3, 0]), K(0.5, Z)],
    },
  },

  // unhooks the cans and swings them overhead like a flail. launcher.
  phoneSwing: {
    duration: 0.5, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.1, [0, 0, 2.2]), K(0.16, [0, 0, 2.4]), K(0.24, [0, 0, 0.6]), K(0.36, [0, 0, 1.0]), K(0.5, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.1, [0, 0, -2.2]), K(0.16, [0, 0, -0.4]), K(0.24, [0, 0, -0.2]), K(0.5, [0, 0, 0.15])],
      // the headphones do the actual work — a huge arc off the head
      phones: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.16, [0, 0, -2.2]), K(0.24, [0, 0, 1.6]), K(0.34, [0, 0, 0.8]), K(0.44, [0, 0, -0.15]), K(0.5, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, -0.2, -0.1]), K(0.24, [0, 0.25, 0.18]), K(0.5, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.24, [0, 0.1, 0], [0.05, 0.88, 0]), K(0.5, Z, HIP)],
      head: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.24, [0, 0, 0.3]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.24, [0.25, 0, -0.5]), K(0.5, [0, 0, 0.12])],
      earL: [K(0, Z), K(0.25, [-0.4, 0.3, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.25, [0.4, -0.3, 0]), K(0.5, Z)],
    },
  },

  // simply sits down. attacks sail overhead. genius-level defense.
  sitDodge: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.12], SIT), K(0.38, [0, 0, -0.12], SIT), K(0.5, Z, HIP)],
      legL: [K(0, Z), K(0.08, [-0.1, 0, 1.3]), K(0.38, [-0.1, 0, 1.3]), K(0.5, Z)],
      legR: [K(0, Z), K(0.08, [0.1, 0, 1.2]), K(0.38, [0.1, 0, 1.2]), K(0.5, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.08, [0, 0, 0.28]), K(0.38, [0, 0, 0.28]), K(0.5, [0, 0, 0.1])],
      // arms prop him up behind. totally at ease.
      armL: [K(0, [0, 0, 0.12]), K(0.08, [0.3, 0, -0.7]), K(0.38, [0.3, 0, -0.7]), K(0.5, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.08, [-0.3, 0, -0.7]), K(0.38, [-0.3, 0, -0.7]), K(0.5, [0, 0, 0.13])],
      head: [K(0, Z), K(0.12, [0, 0, 0.08]), K(0.38, [0, 0, 0.08]), K(0.5, Z)],
      phones: [K(0, Z), K(0.1, [0, 0, 0.18]), K(0.2, [0, 0, -0.06]), K(0.38, Z), K(0.5, Z)],
    },
  },

  // half-hearted raised paw. holds. if you hit it, that is on you.
  calmCounter: {
    duration: 0.75, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.12]), K(0.07, [0.15, 0, 0.95]), K(0.5, [0.15, 0, 1.0]), K(0.62, [0.2, 0, -0.9]), K(0.75, [0, 0, 0.12])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.07, [0, 0, 0.9]), K(0.5, [0, 0, 0.95]), K(0.62, [0, 0, 0.1]), K(0.75, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.07, [0, 0.1, 0.16]), K(0.5, [0, 0.1, 0.18]), K(0.62, [0, -0.2, -0.15]), K(0.75, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.07, Z, [-0.03, 0.83, 0]), K(0.5, Z, [-0.03, 0.83, 0]), K(0.62, Z, [0.08, 0.86, 0]), K(0.75, Z, HIP)],
      head: [K(0, Z), K(0.07, [0, 0, -0.08]), K(0.5, [0, 0, -0.08]), K(0.62, [0, 0, 0.1]), K(0.75, Z)],
      phones: [K(0, Z), K(0.1, [0, 0, 0.06]), K(0.55, [0, 0, 0.06]), K(0.64, [0, 0, -0.2]), K(0.75, Z)],
      armR: [K(0, [0, 0, 0.13])],
      legL: [K(0, [-0.1, 0, 0.1])], legR: [K(0, [0.1, 0, 0.1])],
    },
  },

  // an enormous yawn. the air pressure alone moves people.
  yawnPush: {
    duration: 0.55, loop: false,
    tracks: {
      head: [K(0, Z), K(0.14, [0, 0, 0.15]), K(0.24, [0, 0, 0.55]), K(0.4, [0, 0, 0.35]), K(0.55, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, 0, 0.05]), K(0.24, [0, 0, -0.2]), K(0.55, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.24, [0, 0, 0.05], [0, 0.88, 0]), K(0.55, Z, HIP)],
      armL: [K(0, [0, 0, 0.12]), K(0.14, [0.4, 0, 1.4]), K(0.24, [0.7, 0, 2.3]), K(0.42, [0.4, 0, 1.2]), K(0.55, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.14, [-0.4, 0, 1.4]), K(0.24, [-0.7, 0, 2.3]), K(0.42, [-0.4, 0, 1.2]), K(0.55, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.24, [0, 0, -0.5]), K(0.55, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.24, [0, 0, -0.5]), K(0.55, [0, 0, 0.15])],
      phones: [K(0, Z), K(0.24, [0, 0, 0.3]), K(0.4, [0, 0, -0.1]), K(0.55, Z)],
      earL: [K(0, Z), K(0.24, [0.35, 0.3, 0]), K(0.55, Z)],
      earR: [K(0, Z), K(0.24, [-0.35, -0.3, 0]), K(0.55, Z)],
    },
  },

  // lean back, flick a sandal with the foot. disrespectful. effective.
  sandalSlap: {
    duration: 0.32, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, 0.1], [-0.06, 0.84, 0]), K(0.32, Z, HIP)],
      legR: [K(0, Z), K(0.08, [0, 0, 0.3]), K(0.14, [0, 0, 1.35]), K(0.22, [0, 0, 1.0]), K(0.32, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.08, [0, 0, 0.22]), K(0.32, [0, 0, 0.1])],
      head: [K(0, Z), K(0.14, [0, 0, 0.1]), K(0.32, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.14, [0.2, 0, -0.3]), K(0.32, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.14, [-0.2, 0, -0.3]), K(0.32, [0, 0, 0.13])],
      phones: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.32, Z)],
      legL: [K(0, Z)],
    },
  },

  // one paw. slow reach. firm redirect. the floor handles the rest.
  guide: {
    duration: 0.9, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.16, [0, 0, 1.3]), K(0.42, [0, 0, 1.3]), K(0.55, [0, 0, -0.8]), K(0.7, [0, 0, -0.6]), K(0.9, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.16, [0, 0, 0.2]), K(0.55, [0, 0, 0.4]), K(0.9, [0, 0, 0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.3, [0.3, 0, 0.5]), K(0.55, [0.2, 0, -0.4]), K(0.9, [0, 0, 0.12])],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, -0.1, 0.05]), K(0.42, [0, -0.1, 0.05]), K(0.55, [0, 0.15, -0.5]), K(0.7, [0, 0.1, -0.4]), K(0.9, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.42, Z, HIP), K(0.55, [0, 0, -0.1], [0.06, 0.76, 0]), K(0.75, Z, [0, 0.82, 0]), K(0.9, Z, HIP)],
      head: [K(0, Z), K(0.42, [0, 0, -0.06]), K(0.55, [0, 0, -0.35]), K(0.9, Z)],
      phones: [K(0, Z), K(0.57, [0, 0, -0.35]), K(0.72, [0, 0, 0.12]), K(0.9, Z)],
      legL: [K(0, Z), K(0.55, [-0.2, 0, 0.3]), K(0.9, Z)],
      legR: [K(0, Z), K(0.55, [0.2, 0, 0.3]), K(0.9, Z)],
    },
  },

  // tucks the foe in with two gentle pats, then rolls them away like laundry
  napTime: {
    duration: 0.85, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.12]), K(0.14, [0, 0, 1.05]), K(0.3, [0, 0, 0.85]), K(0.4, [0, 0, 1.05]), K(0.55, [0.4, 0, 0.6]), K(0.68, [0.6, 0, -0.3]), K(0.85, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.14, [0, 0, 1.05]), K(0.32, [0, 0, 0.85]), K(0.42, [0, 0, 1.05]), K(0.55, [-0.4, 0, 0.6]), K(0.68, [-0.6, 0, -0.3]), K(0.85, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.14, [0, 0, 0.3]), K(0.85, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.14, [0, 0, 0.3]), K(0.85, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, 0, -0.15]), K(0.5, [0, 0, -0.18]), K(0.68, [0, 0.3, 0.15]), K(0.85, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.14, Z, [0.03, 0.8, 0]), K(0.55, Z, [0.03, 0.8, 0]), K(0.68, [0, 0.2, 0], [0, 0.86, 0]), K(0.85, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, 0, -0.18]), K(0.55, [0, 0, -0.18]), K(0.68, [0, 0.1, 0.1]), K(0.85, Z)],
      phones: [K(0, Z), K(0.3, [0, 0, 0.06]), K(0.7, [0, 0, -0.2]), K(0.85, Z)],
      legL: [K(0, Z), K(0.14, [-0.15, 0, 0.25]), K(0.85, Z)],
      legR: [K(0, Z), K(0.14, [0.15, 0, 0.25]), K(0.85, Z)],
    },
  },

  // stands COMPLETELY still, arms crossed. one glacial nod at the end.
  stillCool: {
    duration: 2.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.15, Z, [0, 0.84, 0]), K(2.6, Z, [0, 0.84, 0]), K(2.9, Z, HIP)],
      armL: [K(0, [0, 0, 0.12]), K(0.15, [0.5, 0, 0.55]), K(2.6, [0.5, 0, 0.55]), K(2.9, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.15, [-0.5, 0, 0.65]), K(2.6, [-0.5, 0, 0.65]), K(2.9, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.15, [0.6, 0, 1.85]), K(2.6, [0.6, 0, 1.85]), K(2.9, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.15, [-0.6, 0, 1.9]), K(2.6, [-0.6, 0, 1.9]), K(2.9, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.15, [0, 0, 0.06]), K(2.6, [0, 0, 0.06]), K(2.9, [0, 0, 0.1])],
      head: [K(0, Z), K(0.15, [0, 0, -0.05]), K(2.1, [0, 0, -0.05]), K(2.35, [0, 0, 0.12]), K(2.6, [0, 0, -0.05]), K(2.9, Z)],
      phones: [K(0, Z), K(2.35, [0, 0, 0.08]), K(2.6, Z), K(2.9, Z)],
      legL: [K(0, Z), K(0.15, [-0.08, 0, 0.05]), K(2.9, Z)],
      legR: [K(0, Z), K(0.15, [0.08, 0, 0.05]), K(2.9, Z)],
    },
  },

  // kneels, touches the floor with one reverent paw. nature responds.
  touchGrass: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.16, [0, 0, -0.15], [0.05, 0.6, 0]), K(0.55, [0, 0, -0.15], [0.05, 0.6, 0]), K(0.8, Z, [0, 0.8, 0]), K(1.0, Z, HIP)],
      legL: [K(0, Z), K(0.16, [-0.5, 0, 0.85]), K(0.55, [-0.5, 0, 0.85]), K(1.0, Z)],
      legR: [K(0, Z), K(0.16, [0.5, 0, 0.85]), K(0.55, [0.5, 0, 0.85]), K(1.0, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, 0, -0.55]), K(0.55, [0, 0, -0.55]), K(0.8, [0, 0, 0.15]), K(1.0, [0, 0, 0.1])],
      armR: [K(0, [0, 0, 0.13]), K(0.16, [0, 0, -1.15]), K(0.4, [0, 0, -1.25]), K(0.55, [0, 0, -1.15]), K(0.8, [0, 0, 1.3]), K(1.0, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.16, [0, 0, 0.3]), K(0.8, [0, 0, -0.3]), K(1.0, [0, 0, 0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.16, [0.3, 0, 0.4]), K(0.55, [0.3, 0, 0.4]), K(1.0, [0, 0, 0.12])],
      head: [K(0, Z), K(0.16, [0, 0, -0.35]), K(0.55, [0, 0, -0.35]), K(0.8, [0, 0, 0.2]), K(1.0, Z)],
      phones: [K(0, Z), K(0.18, [0, 0, 0.15]), K(0.6, [0, 0, 0.15]), K(0.82, [0, 0, -0.2]), K(1.0, Z)],
      earL: [K(0, Z), K(0.8, [0.3, 0.3, 0]), K(1.0, Z)],
      earR: [K(0, Z), K(0.8, [-0.3, -0.3, 0]), K(1.0, Z)],
    },
  },

  // watches the giant button descend, checks an imaginary watch, presses it. calmly.
  logOff: {
    duration: 3.85, loop: false,
    tracks: {
      head: [K(0, Z), K(0.3, [0, 0, 0.35]), K(0.9, [0, 0, 0.3]), K(1.1, [0, 0, -0.15]), K(1.5, [0, 0, 0.05]), K(2.6, [0, 0, 0.05]), K(2.9, [0, 0, 0.15]), K(3.4, [0, -0.25, 0]), K(3.6, [0, 0.1, 0]), K(3.85, Z)],
      // checks the watch while the world ends
      armL: [K(0, [0, 0, 0.12]), K(1.0, [0, 0, 1.5]), K(1.5, [0, 0, 1.5]), K(1.7, [0, 0, 0.12]), K(3.85, [0, 0, 0.12])],
      forearmL: [K(0, [0, 0, 0.15]), K(1.0, [0, 0, -2.2]), K(1.5, [0, 0, -2.2]), K(1.7, [0, 0, 0.15]), K(3.85, [0, 0, 0.15])],
      // THE PRESS. one finger. zero drama.
      armR: [K(0, [0, 0, 0.13]), K(1.8, [0, 0, 1.55]), K(2.05, [0, 0, 1.35]), K(2.4, [0, 0, 1.45]), K(2.8, [0, 0, 0.5]), K(3.85, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(1.8, [0, 0, -0.3]), K(2.05, [0, 0, -0.05]), K(2.8, [0, 0, 0.2]), K(3.85, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, 0.18]), K(1.8, [0, -0.1, 0.05]), K(2.05, [0, -0.1, -0.08]), K(2.8, [0, 0, 0.1]), K(3.85, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(2.05, Z, [0.05, 0.83, 0]), K(2.8, Z, HIP), K(3.85, Z, HIP)],
      phones: [K(0, Z), K(0.35, [0, 0, 0.12]), K(2.05, [0, 0, 0.06]), K(2.1, [0, 0, -0.1]), K(2.4, Z), K(3.85, Z)],
      // small shrug at the reboot. what did they expect.
      earL: [K(0, Z), K(3.4, [0.3, 0.3, 0]), K(3.6, Z), K(3.85, Z)],
      earR: [K(0, Z), K(3.4, [-0.3, -0.3, 0]), K(3.6, Z), K(3.85, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // sits, sips something warm, radiates zero stress in every direction
  zeroStress: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.18, [0, 0, -0.12], SIT), K(0.8, [0, 0, -0.12], SIT), K(1.0, Z, HIP)],
      legL: [K(0, Z), K(0.18, [-0.12, 0, 1.25]), K(0.8, [-0.12, 0, 1.25]), K(1.0, Z)],
      legR: [K(0, Z), K(0.18, [0.12, 0, 1.15]), K(0.8, [0.12, 0, 1.15]), K(1.0, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.18, [0, 0, 0.24]), K(0.8, [0, 0, 0.24]), K(1.0, [0, 0, 0.1])],
      armR: [K(0, [0, 0, 0.13]), K(0.28, [0, 0, 1.6]), K(0.75, [0, 0, 1.6]), K(1.0, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.28, [0, 0, -2.25]), K(0.75, [0, 0, -2.25]), K(1.0, [0, 0, 0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.18, [0.25, 0, 0.5]), K(0.8, [0.25, 0, 0.5]), K(1.0, [0, 0, 0.12])],
      head: [K(0, Z), K(0.35, [0, 0, 0.22]), K(0.65, [0, 0, 0.18]), K(1.0, Z)],
      phones: [K(0, Z), K(0.38, [0, 0, 0.12]), K(0.8, [0, 0, 0.12]), K(1.0, Z)],
      earL: [K(0, Z), K(0.5, [0, 0.2, 0.1]), K(0.7, Z), K(1.0, Z)],
      earR: [K(0, Z), K(0.5, [0, -0.2, 0.1]), K(0.7, Z), K(1.0, Z)],
    },
  },

  // produces a sign from the vest, presents it, looks away. conversation over.
  dnd: {
    duration: 0.85, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.14, [0.8, 0, 0.7]), K(0.28, [0, 0, 1.4]), K(0.62, [0, 0, 1.4]), K(0.85, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.14, [0, 0, 1.2]), K(0.28, [0, 0, -0.2]), K(0.62, [0, 0, -0.2]), K(0.85, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, -0.15, 0.1]), K(0.28, [0, 0.1, 0.05]), K(0.62, [0, 0.1, 0.05]), K(0.85, [0, 0, 0.1])],
      head: [K(0, Z), K(0.3, [0, 0, -0.05]), K(0.45, [0, 0.45, 0]), K(0.65, [0, 0.45, 0]), K(0.85, Z)],
      phones: [K(0, Z), K(0.3, [0, 0, 0.06]), K(0.5, [0, 0.1, 0]), K(0.85, Z)],
      armL: [K(0, [0, 0, 0.12])],
      hips: [K(0, Z, HIP)],
    },
  },

  // two gentle paws, a step back, a little wave. bon voyage.
  vacation: {
    duration: 4.0, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.12]), K(0.25, [0, 0, 1.1]), K(0.7, [0, 0, 1.15]), K(0.85, [0, 0, 0.5]), K(1.3, [0, 0, 0.12]), K(4.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.25, [0, 0, 1.1]), K(0.7, [0, 0, 1.15]), K(0.85, [0, 0, 0.5]), K(1.4, [0, 0, 2.5]), K(2.6, [0, 0, 2.5]), K(2.9, [0, 0, 0.13]), K(4.0, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.25, [0, 0, 0.3]), K(1.3, [0, 0, 0.15]), K(4.0, [0, 0, 0.15])],
      // the wave: a tiny metronome of goodbye
      forearmR: [K(0, [0, 0, 0.15]), K(0.25, [0, 0, 0.3]), K(1.4, [0, 0, -0.5]), K(1.65, [0, 0, 0.15]), K(1.9, [0, 0, -0.5]), K(2.15, [0, 0, 0.15]), K(2.4, [0, 0, -0.5]), K(2.9, [0, 0, 0.15]), K(4.0, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.25, [0, 0, -0.12]), K(0.7, [0, 0, -0.15]), K(1.0, [0, 0, 0.12]), K(4.0, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.7, Z, [0.05, 0.83, 0]), K(1.0, Z, [-0.1, 0.85, 0]), K(1.6, Z, HIP), K(4.0, Z, HIP)],
      // watches the flight with polite interest, checks watch, nods at splashdown
      head: [K(0, Z), K(0.7, [0, 0, -0.1]), K(1.4, [0, 0, 0.4]), K(2.6, [0, 0, 0.35]), K(2.9, [0, 0, 0.1]), K(3.2, [0, 0, -0.15]), K(3.5, [0, 0, 0.1]), K(4.0, Z)],
      phones: [K(0, Z), K(1.45, [0, 0, 0.15]), K(2.6, [0, 0, 0.15]), K(2.95, [0, 0, -0.1]), K(4.0, Z)],
      earL: [K(0, Z), K(3.2, [0.3, 0.3, 0]), K(3.5, Z), K(4.0, Z)],
      earR: [K(0, Z), K(3.2, [-0.3, -0.3, 0]), K(3.5, Z), K(4.0, Z)],
      legL: [K(0, Z), K(0.85, [0, 0, -0.3]), K(1.3, Z), K(4.0, Z)],
      legR: [K(0, Z)],
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

// direction that pushes the foe AWAY from Cool Pal, pre-multiplied so that
// applyScriptHit's `kb.x * self.facing` resolves to the away direction.
function awayX(fx, mag) {
  const away = fx.foe.pos.x >= fx.self.pos.x ? 1 : -1
  return mag * away * fx.self.facing
}

// --- decor: cosmetic meshes added to the arena (buttons, grass, vignettes) --
// (decorMat lives at the top of the file — one unique pbr() material per prop,
//  because these are disposed individually when a move script tears them down.)

function addDecor(fx, mesh, list) {
  try {
    const parent = fx.arena()?.group || fx.self?.root?.parent
    if (!parent) return null
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
    parent.add(mesh)
    list.push({ mesh, parent })
    return mesh
  } catch (e) { console.warn('[cool-pal] addDecor failed', e); return null }
}

function removeDecorItem(list, mesh) {
  const i = list.findIndex((d) => d.mesh === mesh)
  if (i === -1) return
  const [d] = list.splice(i, 1)
  try {
    d.parent.remove(d.mesh)
    d.mesh.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.() }
    })
  } catch { /* already gone */ }
}

function clearDecor(list) {
  while (list.length) removeDecorItem(list, list[list.length - 1].mesh)
}

// failsafe: if the round ends mid-script, fx timers are dropped by the engine —
// hook cleanup to round/match end so nothing ever leaks into the next round.
// (fx.match is the MatchScreen; internals-guarded, purely a safety net.)
function hookRoundEnd(fx, cb) {
  try {
    fx.match?.game?.events?.once?.('round:end', cb)
    fx.match?.game?.events?.once?.('match:end', cb)
  } catch { /* events unavailable — timers still cover the normal path */ }
}

// grayscale the foe (Log Off). Saves original colors; restore is idempotent.
function desaturate(fighter) {
  const saved = []
  try {
    fighter.root.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || !m.color || m.userData.__cpGray) continue
        m.userData.__cpGray = true
        saved.push({ m, hex: m.color.getHex() })
        const c = m.color
        const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b
        // desaturate toward a warm ash (#6E5F52), not toward neutral grey —
        // neutral grey against the arena's cool rim reads as a broken material.
        c.setRGB(Math.min(1, l * 1.123), Math.min(1, l * 0.971), Math.min(1, l * 0.839))
      }
    })
  } catch (e) { console.warn('[cool-pal] desaturate failed', e) }
  return saved
}

function restoreColors(saved) {
  while (saved.length) {
    const s = saved.pop()
    try { s.m.color.setHex(s.hex); delete s.m.userData.__cpGray } catch { /* disposed */ }
  }
}

// vignette prop builders (Forced Vacation) — cheap, chunky, disposable.
// Bevelled geometry + real surface presets here too: these land in frame right
// next to the fighters and a raw flat-shaded box next to a PBR one is the tell.
function palmTreeMesh() {
  const g = new THREE.Group()
  g.add(box(0.2, 1.5, 0.2, decorMat(0x8a6238, 'leather'), 0, 0.75, 0, 0, 0, 0.08))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    g.add(box(0.85, 0.07, 0.26, decorMat(C.grass, 'foliage'), Math.cos(a) * 0.42, 1.55, Math.sin(a) * 0.42, 0, -a, 0.35))
  }
  g.add(sph(0.12, decorMat(0x8a6238, 'leather'), 0.15, 1.42, 0.1)) // coconut
  return g
}

function snowmanMesh() {
  const g = new THREE.Group()
  const snow = decorMat(0xe6ebef, 'plastic-gloss')
  const coal = decorMat(0x22242c, 'rubber')
  g.add(sph(0.5, snow, 0, 0.45, 0))
  g.add(sph(0.36, snow, 0, 1.12, 0))
  g.add(sph(0.26, snow, 0, 1.6, 0))
  const carrot = new THREE.Mesh(roundedCone(0.06, 0.008, 0.3, 0.01, 12, 2), decorMat(0xf0873f, 'foliage'))
  carrot.position.set(0.32, 1.62, 0)
  carrot.rotation.z = -Math.PI / 2
  g.add(carrot)
  g.add(box(0.3, 0.06, 0.3, coal, 0, 1.74, 0))
  g.add(box(0.2, 0.18, 0.2, coal, 0, 1.84, 0))
  return g
}

function moonFlagMesh() {
  const g = new THREE.Group()
  g.add(cyl(0.95, 1.1, 0.16, decorMat(0x8f97a6, 'concrete'), 0, 0.08, 0))
  g.add(sph(0.12, decorMat(0x737b8a, 'concrete'), 0.4, 0.17, 0.3, 1, 0.4, 1)) // craters
  g.add(sph(0.09, decorMat(0x737b8a, 'concrete'), -0.35, 0.17, -0.25, 1, 0.4, 1))
  g.add(box(0.05, 1.3, 0.05, decorMat(0xd8dde4, 'metal'), 0, 0.8, 0))
  g.add(box(0.5, 0.3, 0.03, decorMat(C.red, 'cloth'), 0.28, 1.28, 0))
  return g
}

function grassTuftMesh(scale = 1) {
  const g = new THREE.Group()
  const m1 = decorMat(C.grass, 'foliage')
  const m2 = decorMat(C.grassDark, 'foliage')
  g.add(box(0.05, 0.34, 0.05, m1, 0, 0.17, 0, 0, 0, 0.18))
  g.add(box(0.05, 0.28, 0.05, m2, 0.06, 0.14, 0.04, 0, 0, -0.25))
  g.add(box(0.05, 0.24, 0.05, m1, -0.05, 0.12, -0.05, 0.2, 0, 0.3))
  g.scale.setScalar(scale)
  return g
}

function powerButtonMesh() {
  const g = new THREE.Group()
  const glyph = decorMat(C.white, 'plastic-gloss')
  g.add(cyl(0.78, 0.86, 0.22, decorMat(0x3d4250, 'plastic'), 0, 0, 0))
  g.add(cyl(0.62, 0.62, 0.18, decorMat(C.red, 'plastic-gloss'), 0, 0.14, 0))
  // the universal power glyph: a ring with a gap and a tick
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 20, Math.PI * 1.6), glyph)
  ring.rotation.x = -Math.PI / 2
  ring.rotation.z = Math.PI / 2 + 0.4
  ring.position.y = 0.24
  g.add(ring)
  g.add(box(0.08, 0.03, 0.3, glyph, 0, 0.24, 0.16))
  return g
}

function dndSignMesh() {
  const g = new THREE.Group()
  const red = decorMat(C.red, 'plastic-gloss')
  g.add(box(0.5, 0.68, 0.05, decorMat(C.white, 'plastic'), 0, 0, 0))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 10, 20), red)
  ring.position.set(0, 0.08, 0.035)
  g.add(ring)
  g.add(box(0.3, 0.06, 0.03, red, 0, 0.08, 0.045, 0, 0, 0.6))
  g.add(box(0.34, 0.05, 0.03, decorMat(0x22242c, 'rubber'), 0, -0.2, 0.035))
  return g
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------

// Sitting Dodge — sits down; attacks whiff over him (i-frames)
function sitDodgeScript(fx) {
  const end = onceEnd(fx)
  try { fx.self.invuln = Math.max(fx.self.invuln || 0, 26) } catch { /* engine field */ }
  fx.sfx('slide', { pitch: 0.8, vol: 0.5 })
  fx.particles('smoke', v3(fx.self.pos.x, 0.25, 0), { n: 4 })
  fx.after(10, () => { if (Math.random() < 0.3) fx.caption('NICE TRY') })
  fx.after(30, end)
}

// Calm Counter — a raised paw. if the foe swings during the window, they get shoved.
function calmCounterScript(fx) {
  const end = onceEnd(fx)
  let fired = false
  fx.sfx('whoosh', { pitch: 0.6, vol: 0.5 })
  fx.frame((age) => {
    if (fired || age < 4 || age > 28) return
    const foe = fx.foe
    if (!foe || foe.state !== 'attack' || !inRange(fx, 2.5)) return
    fired = true
    try {
      fx.sfx('thud', { pitch: 1.2 })
      fx.shake(0.6)
      fx.slowmo(0.4, 0.3)
      fx.caption('NOPE.')
      fx.particles('sparks', v3(foe.pos.x, 1.2, 0), { n: 10 })
      fx.hit({ damage: 12, knockback: { x: awayX(fx, 13), y: 3.5, spin: 1 }, hitStun: 26, ragdoll: 1 })
    } catch (e) { console.warn('[cool-pal] counter failed', e) }
  })
  fx.after(44, end)
}

// Yawn Push — a yawn so large it displaces people on BOTH sides
function yawnPushScript(fx) {
  const end = onceEnd(fx)
  fx.after(4, () => fx.sfx('whoosh', { pitch: 0.5, vol: 0.7 }))
  fx.after(14, () => {
    try {
      if (!inRange(fx, 2.8)) { fx.caption('BIG YAWN'); return }
      fx.sfx('boing', { pitch: 0.7 })
      fx.shake(0.35)
      const away = fx.foe.pos.x >= fx.self.pos.x ? 1 : -1
      fx.particles('smoke', v3(fx.self.pos.x + away * 0.9, 1.4, 0), { n: 8 })
      fx.hit({ damage: 6, knockback: { x: awayX(fx, 12), y: 3 }, hitStun: 20 })
    } catch (e) { console.warn('[cool-pal] yawn failed', e) }
  })
  fx.after(32, end)
}

// SPECIAL 1: Still Cool — stands completely still; incoming attacks rebound
function vibeCheckScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(10, () => {
    // a single finger-snap of pure, weaponized serenity
    fx.sfx('menu_confirm', { pitch: 1.4 })
    fx.particles('spark', v3(fx.self.pos.x + F * 0.9, 1.4, 0), { n: 8 })
    if (inRange(fx, 2.8)) {
      fx.sfx('punch_heavy')
      fx.shake(0.5)
      fx.slowmo(0.5, 0.3)
      fx.hit({ damage: 12, knockback: { x: 11, y: 5, spin: 1.6 }, hitStun: 26, ragdoll: 1 })
      fx.caption('VIBE CHECK: FAILED')
    } else {
      fx.caption('VIBES: IMMACULATE')
    }
  })
  fx.after(38, end)
}

function stillCoolScript(fx) {
  const end = onceEnd(fx)
  fx.announcer('STILL COOL')
  fx.sfx('bell', { pitch: 1.4, vol: 0.4 })
  fx.particles('stars', v3(fx.self.pos.x, 2.0, 0), { n: 5 })
  let cd = 0
  fx.frame((age) => {
    if (cd > 0) { cd--; return }
    if (age < 6 || age > 156) return
    const foe = fx.foe
    if (!foe || foe.state !== 'attack' || !foe.currentMove) return
    const m = foe.currentMove
    const su = m.startup || 0
    if (foe.moveFrame < su || foe.moveFrame > su + (m.active || 3) + 2) return
    if (!inRange(fx, 2.6)) return
    cd = 30
    try {
      fx.caption('STILL COOL')
      fx.sfx('block')
      fx.sfx('boing', { pitch: 1.2 })
      fx.shake(0.5)
      fx.slowmo(0.5, 0.25)
      const away = foe.pos.x >= fx.self.pos.x ? 1 : -1
      fx.particles('stars', v3(fx.self.pos.x + away * 0.9, 1.4, 0), { n: 8 })
      fx.hit({ damage: 7, knockback: { x: awayX(fx, 14), y: 5, spin: 1.5 }, hitStun: 24, ragdoll: 1 })
    } catch (e) { console.warn('[cool-pal] rebound failed', e) }
  })
  fx.after(176, end)
}

// SPECIAL 2: Touch Grass — grass erupts across the floor; the foe gets tangled
function touchGrassScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const decor = []
  const cleanup = () => clearDecor(decor)
  hookRoundEnd(fx, cleanup)
  fx.after(6, () => fx.sfx('whoosh', { pitch: 0.7, vol: 0.5 }))
  fx.after(14, () => {
    try {
      fx.sfx('break', { pitch: 1.4, vol: 0.5 })
      fx.shake(0.4)
      // a lawn erupts along the fight axis
      for (let i = 0; i < 8; i++) {
        const tuft = grassTuftMesh(0.9 + Math.random() * 0.8)
        tuft.position.set(
          clampToArena(fx, fx.self.pos.x + F * (0.7 + i * 0.5)),
          0,
          (i % 2 ? 0.45 : -0.45) * (0.5 + Math.random() * 0.8),
        )
        addDecor(fx, tuft, decor)
      }
      fx.particles('smoke', v3(fx.self.pos.x + F * 1.6, 0.3, 0), { n: 8 })
      if (inRange(fx, 3.6)) {
        fx.caption('TOUCH GRASS')
        fx.announcer('TOUCH GRASS')
        fx.sfx('grab')
        // tangle ring around the foe's feet
        for (let i = 0; i < 4; i++) {
          const tuft = grassTuftMesh(1.3)
          const a = (i / 4) * Math.PI * 2
          tuft.position.set(clampToArena(fx, fx.foe.pos.x + Math.cos(a) * 0.4), 0, Math.sin(a) * 0.35)
          tuft.rotation.y = a
          addDecor(fx, tuft, decor)
        }
        fx.hit({ damage: 8, knockback: { x: 0, y: 0 }, hitStun: 120 })
      } else {
        fx.caption('GRASS TOUCHED. NO ONE CARED.')
      }
    } catch (e) { console.warn('[cool-pal] touch grass failed', e) }
  })
  fx.after(150, cleanup) // the lawn politely excuses itself
  fx.after(58, end)
}

// SUPER: Log Off — a giant power button descends; he presses it; the foe reboots
function logOffScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const decor = []
  const saved = []
  let restored = false
  const restore = () => { if (!restored) { restored = true; restoreColors(saved) } }
  const cleanup = () => { restore(); clearDecor(decor) }
  hookRoundEnd(fx, cleanup)

  fx.zoom(fx.self, 0.6)
  fx.slowmo(0.6, 0.5)
  fx.announcer('LOG OFF')
  fx.sfx('bell', { pitch: 0.6 })

  fx.after(18, () => {
    if (!inRange(fx, 3.4)) {
      fx.caption('ALREADY OFFLINE')
      fx.after(36, end)
      return
    }
    // the button descends from the heavens, unhurried, like its owner
    let btn = null
    try {
      btn = powerButtonMesh()
      btn.position.set(clampToArena(fx, fx.self.pos.x + F * 1.1), 5.4, 0)
      addDecor(fx, btn, decor)
      fx.sfx('whoosh', { pitch: 0.5 })
    } catch (e) { console.warn('[cool-pal] button failed', e) }
    fx.frame((age) => {
      if (!btn || age < 20 || age > 46) return
      try { btn.position.y = 5.4 - Math.min(1, (age - 20) / 26) * 3.9 } catch { /* removed */ }
    })

    fx.after(32, () => { // THE PRESS
      try {
        fx.sfx('menu_confirm', { pitch: 0.5 })
        fx.shake(0.3)
        if (btn) btn.scale.y = 0.7
        fx.particles('sparks', v3(fx.self.pos.x + F * 1.1, 1.6, 0), { n: 6 })
      } catch { /* cosmetic */ }
    })

    fx.after(38, () => { // shutdown: grayscale + limp
      try {
        fx.sfx('thud', { pitch: 0.4 })
        fx.caption('SHUTTING DOWN...')
        saved.push(...desaturate(fx.foe))
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 135, ragdoll: 1 })
        fx.particles('smoke', v3(fx.foe.pos.x, 1.6, 0), { n: 10 })
        fx.slowmo(0.5, 0.4)
      } catch (e) { console.warn('[cool-pal] shutdown failed', e) }
    })

    // sad little OS noises while the foe is off
    for (let i = 0; i < 3; i++) {
      fx.after(64 + i * 26, () => {
        fx.sfx('menu_back', { pitch: 0.7 + i * 0.2, vol: 0.5 })
        fx.particles('smoke', v3(fx.foe.pos.x, 1.8, 0), { n: 3 })
      })
    }

    fx.after(158, () => { // REBOOT
      try {
        restore()
        fx.caption('REBOOTED. IT DID NOT HELP.')
        fx.announcer('UPDATE COMPLETE')
        fx.sfx('explosion')
        fx.shake(1)
        fx.slowmo(0.35, 0.5)
        fx.zoom(fx.foe, 0.8)
        fx.particles('sparks', v3(fx.foe.pos.x, 1.3, 0), { n: 20 })
        fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 16 })
        fx.hit({ damage: 32, knockback: { x: 14, y: 9, spin: 2.5 }, hitStun: 40, ragdoll: 2 })
      } catch (e) { console.warn('[cool-pal] reboot failed', e) }
    })

    fx.after(172, () => { // the button clocks out too
      try { if (btn) { fx.particles('smoke', v3(btn.position.x, btn.position.y, 0), { n: 6 }) } } catch { /* gone */ }
      removeDecorItem(decor, btn)
    })
  })

  fx.after(215, cleanup) // failsafe: colors and props always come back
  fx.after(228, end)
}

// SPECIAL 4: Zero Stress — sits, sips; for 4s the foe's damage partially reflects
function zeroStressScript(fx) {
  const end = onceEnd(fx)
  const decor = []
  const cleanup = () => clearDecor(decor)
  hookRoundEnd(fx, cleanup)
  fx.announcer('ZERO STRESS')
  fx.sfx('slide', { pitch: 0.6, vol: 0.4 })

  // a tiny mug appears in his paw. contents: not your business.
  fx.after(14, () => {
    try {
      const paw = fx.self.bones?.forearmR
      if (paw) {
        const mug = new THREE.Group()
        mug.add(cyl(0.09, 0.08, 0.14, decorMat(C.white, 'plastic-gloss'), 0, 0, 0))
        mug.add(box(0.03, 0.08, 0.03, decorMat(C.white, 'plastic-gloss'), 0, 0, 0.11))
        mug.position.set(0.02, -0.3, 0)
        paw.add(mug)
        decor.push({ mesh: mug, parent: paw })
      }
    } catch { /* cosmetic */ }
  })
  fx.after(55, cleanup) // mug away before recovery ends

  // the 4-second grudge ledger: 30% of everything he takes goes right back
  let last = fx.self.hp
  let active = true
  for (let i = 6; i <= 240; i += 3) {
    fx.after(i, () => {
      if (!active) return
      try {
        const s = fx.self, f = fx.foe
        if (!s || !f || s.hp <= 0 || f.hp <= 0) { active = false; return }
        if (f.state === 'ko' || f.state === 'win' || f.state === 'lose') { active = false; return }
        if (s.hp < last) {
          const diff = last - s.hp
          last = s.hp
          const back = Math.max(1, Math.round(diff * 0.3))
          fx.hit({ damage: back })
          fx.particles('smoke', v3(f.pos.x, f.pos.y + 1.8, 0), { n: 5 }) // steam of frustration
          fx.sfx('thud', { pitch: 1.6, vol: 0.45 })
          fx.caption('STRESS: REFLECTED')
        } else {
          last = s.hp
        }
      } catch { active = false }
    })
  }
  // ambient calm
  for (const t of [20, 90, 160, 230]) {
    fx.after(t, () => { try { fx.particles('stars', v3(fx.self.pos.x, 2.1, 0), { n: 4 }) } catch { /* fine */ } })
  }
  fx.after(60, end)
}

// JOKE: Do Not Disturb — flips a sign; deals 1 point of emotional damage
function dndScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const decor = []
  const cleanup = () => clearDecor(decor)
  hookRoundEnd(fx, cleanup)
  fx.after(10, () => {
    try {
      const sign = dndSignMesh()
      sign.position.set(clampToArena(fx, fx.self.pos.x + F * 0.95), 1.35, 0)
      sign.rotation.y = F > 0 ? -Math.PI / 2 : Math.PI / 2
      addDecor(fx, sign, decor)
      fx.sfx('menu_back', { pitch: 0.8 })
    } catch (e) { console.warn('[cool-pal] sign failed', e) }
  })
  fx.after(16, () => {
    fx.caption('DO NOT DISTURB')
    try {
      if (inRange(fx, 2.6)) {
        fx.sfx('menu_confirm', { pitch: 0.6 })
        fx.hit({ damage: 1, knockback: { x: 3, y: 1 }, hitStun: 18 })
        fx.caption('EMOTIONAL DAMAGE: 1')
        fx.announcer('READ THE SIGN')
        // the controls feel heavier now (engine multiplier if supported;
        // a harmless field otherwise)
        const foe = fx.foe
        const prev = foe.speedMult
        foe.speedMult = 0.65
        const lift = () => { try { if (foe.speedMult === 0.65) foe.speedMult = prev ?? 1 } catch { /* fine */ } }
        fx.after(180, lift)
        hookRoundEnd(fx, lift)
      } else {
        fx.caption('NO ONE WAS DISTURBED')
      }
    } catch (e) { console.warn('[cool-pal] dnd failed', e) }
  })
  fx.after(46, cleanup)
  fx.after(50, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const CoolPalDef = {
  id: 'cool-pal',
  name: 'COOL PAL',
  title: 'The Unbothered One',
  bio: 'A capybara who wandered into a crypto conference for the free water and accidentally became its most respected figure. Holds nothing, sells nothing, checks nothing. His portfolio is a warm rock in the sun. Fights only because leaving would require getting up.',
  style: 'Counter specialist. The slowest buttons in the game attached to the rudest results. Let them tire themselves out, then apply one (1) palm. Wins most rounds while technically resting.',
  stats: { power: 7, speed: 4, defense: 8, chaos: 5 },
  height: 1.8,
  weight: 1.25,
  walkSpeed: 3.2,
  dashSpeed: 7,
  jumpVel: 7.5,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'lazy-palm', name: 'Lazy Palm', kind: 'light',
      input: ['light'],
      damage: 7, startup: 8, active: 4, recovery: 12,
      hitbox: { w: 1.0, h: 0.8, d: 0.9, forward: 1.0, up: 1.1 },
      knockback: { x: 10, y: 1, spin: 0.2 }, // one palm, big pushback
      hitStun: 16, blockStun: 9, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'lazyPalm', sfx: 'punch_light', script: null,
    },
    {
      id: 'slow-kick', name: 'Slow Kick', kind: 'kick',
      input: ['kick'],
      damage: 12, startup: 14, active: 4, recovery: 15,
      hitbox: { w: 1.1, h: 1.0, d: 0.9, forward: 1.0, up: 0.9 },
      knockback: { x: 4, y: 8.5, spin: 0.8 }, // deceptively strong — pops them up
      hitStun: 24, blockStun: 12, hitStop: 6,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'slowKick', sfx: 'kick', script: null,
    },
    {
      id: 'shoulder-lean', name: 'Shoulder Lean', kind: 'heavy',
      input: ['heavy'],
      damage: 13, startup: 11, active: 5, recovery: 14,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 0.8, up: 1.0 },
      knockback: { x: 12.5, y: 2.5, spin: 0.6 }, // the foe bounces off
      hitStun: 20, blockStun: 13, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 8, // you cannot interrupt a lean
      clip: 'shoulderLean', sfx: 'thud', script: null,
    },
    {
      id: 'headphone-swing', name: 'Headphone Swing', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 9, startup: 9, active: 5, recovery: 16,
      hitbox: { w: 1.0, h: 1.5, d: 0.9, forward: 0.9, up: 1.2 },
      knockback: { x: 2.5, y: 9.5, spin: 1.4 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'phoneSwing', sfx: 'whoosh', script: null,
    },
    {
      id: 'sitting-dodge', name: 'Sitting Dodge', kind: 'kick',
      input: ['down', 'kick'],
      damage: 0, startup: 3, active: 2, recovery: 25,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 0.4 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'sitDodge', sfx: 'slide',
      script: sitDodgeScript,
    },
    {
      id: 'calm-counter', name: 'Calm Counter', kind: 'heavy',
      input: ['back', 'heavy'],
      damage: 12, startup: 4, active: 24, recovery: 16,
      hitbox: { w: 0.9, h: 1.2, d: 0.9, forward: 0.8, up: 1.1 },
      knockback: { x: 13, y: 3.5, spin: 1 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 6, meterCost: 0,
      armor: 28, // the whole point: he does not care that you hit him
      clip: 'calmCounter', sfx: 'whoosh',
      script: calmCounterScript,
    },
    {
      id: 'yawn-push', name: 'Yawn Push', kind: 'heavy',
      input: ['down', 'heavy'],
      damage: 6, startup: 13, active: 4, recovery: 15,
      hitbox: { w: 2.4, h: 1.4, d: 1.6, forward: 0.6, up: 1.1 },
      knockback: { x: 12, y: 3, spin: 0.4 },
      hitStun: 20, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'yawnPush', sfx: 'boing',
      script: yawnPushScript,
    },
    {
      id: 'sandal-slap', name: 'Sandal Slap', kind: 'light',
      // NOTE: 'back'+light rather than crouch-light — down+light is reserved by
      // the mandated joke input [down,down,light], which would always outrank it.
      input: ['back', 'light'],
      damage: 5, startup: 6, active: 3, recovery: 10,
      hitbox: { w: 1.0, h: 0.7, d: 0.9, forward: 0.9, up: 0.6 },
      knockback: { x: 6, y: 2, spin: 0.5 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'sandalSlap', sfx: 'punch_light', script: null,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'gentle-guidance', name: 'Gentle Guidance', kind: 'grab',
      input: ['grab'],
      damage: 13, startup: 8, active: 4, recovery: 40,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.1 },
      // softly redirected... into the mantle. huge slam.
      knockback: { x: 2.5, y: 7.5, spin: 2 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'guide', sfx: 'grab', script: null,
    },
    {
      id: 'nap-time', name: 'Nap Time', kind: 'grab',
      input: ['down', 'grab'],
      damage: 10, startup: 10, active: 3, recovery: 34,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 0.9 },
      // tucked in, patted twice, rolled away like a burrito
      knockback: { x: 11, y: 3, spin: 3.5 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'napTime', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'vibe-check', name: 'Vibe Check', kind: 'special',
      input: ['special'],
      damage: 12, startup: 10, active: 4, recovery: 24,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.2, up: 1.2 },
      knockback: { x: 11, y: 5, spin: 1.6 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'stillCool', sfx: 'menu_confirm',
      script: vibeCheckScript,
    },
    {
      id: 'still-cool', name: 'Still Cool', kind: 'special',
      input: ['down', 'special'],
      damage: 7, startup: 6, active: 150, recovery: 20,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 14, y: 5, spin: 1.5 },
      hitStun: 24, blockStun: 0, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25,
      armor: 156, // stands completely still through everything
      clip: 'stillCool', sfx: 'bell',
      script: stillCoolScript,
    },
    {
      id: 'touch-grass', name: 'Touch Grass', kind: 'special',
      input: ['forward', 'special'],
      damage: 8, startup: 14, active: 6, recovery: 38,
      hitbox: { w: 3.2, h: 0.8, d: 1.6, forward: 1.6, up: 0.4 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 120, blockStun: 12, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'touchGrass', sfx: 'break',
      script: touchGrassScript,
    },
    {
      id: 'log-off', name: 'Log Off', kind: 'super',
      input: ['super'],
      damage: 34, startup: 18, active: 140, recovery: 70,
      hitbox: { w: 1.2, h: 1.6, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 14, y: 9, spin: 2.5 },
      hitStun: 40, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 12,
      clip: 'logOff', sfx: 'bell',
      script: logOffScript,
    },
    {
      id: 'zero-stress', name: 'Zero Stress', kind: 'special',
      input: ['back', 'special'],
      damage: 0, startup: 10, active: 8, recovery: 42,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'zeroStress', sfx: 'slide',
      script: zeroStressScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'do-not-disturb', name: 'Do Not Disturb', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 12, active: 4, recovery: 34,
      hitbox: { w: 1.0, h: 1.2, d: 0.9, forward: 0.9, up: 1.1 },
      knockback: { x: 3, y: 1, spin: 0.3 },
      hitStun: 18, blockStun: 6, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 10, meterCost: 0, armor: 0,
      clip: 'dnd', sfx: 'menu_back',
      script: dndScript,
    },
  ],

  finisher: {
    id: 'forced-vacation',
    name: 'Forced Vacation',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const decor = []
      const cleanup = () => clearDecor(decor)
      hookRoundEnd(fx, cleanup)

      fx.slowmo(0.5, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption('FORCED VACATION')
      fx.announcer('FORCED VACATION')
      fx.sfx('bell')
      fx.self.playClip?.('vacation')

      // the beach chair is provided. attendance is not optional.
      let chair = null
      fx.after(12, () => {
        chair = fx.spawnProp('chair', v3(clampToArena(fx, fx.foe.pos.x + F * 0.4), 0.6, 0))
        fx.sfx('thud', { vol: 0.5 })
      })

      fx.after(20, () => { // the gentle push
        fx.sfx('grab')
        fx.caption('SIT. RELAX.')
        fx.hit({ damage: 2, knockback: { x: 1, y: 0 }, hitStun: 150 })
      })

      fx.after(46, () => { // CATAPULT
        fx.sfx('launch')
        fx.shake(1)
        fx.slowmo(0.35, 0.7)
        fx.zoom(fx.foe, 1.0)
        fx.hit({ damage: 8, knockback: { x: 7, y: 13, spin: 2.5 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 7, 15, 0])
        if (chair) { try { fx.impulse(chair, [F * 5, 10, 0], 3) } catch { /* prop gone */ } }
        fx.particles('smoke', v3(fx.foe.pos.x, 0.5, 0), { n: 10 })
      })

      // the itinerary: three destinations, zero say in the matter
      const stops = [
        { at: 70, cap: 'DAY 1: THE TROPICS', build: palmTreeMesh },
        { at: 100, cap: 'DAY 2: THE ALPS', build: snowmanMesh },
        { at: 130, cap: 'DAY 3: THE MOON', build: moonFlagMesh },
      ]
      for (const stop of stops) {
        fx.after(stop.at, () => {
          try {
            const scene = stop.build()
            scene.position.set(clampToArena(fx, fx.foe.pos.x), 0, -2.6)
            addDecor(fx, scene, decor)
            fx.sfx('whoosh', { pitch: 1.2 })
            fx.caption(stop.cap)
            fx.shake(0.25)
            fx.impulse(fx.foe, [F * 1.5, 9, 0]) // connecting flight
            fx.after(26, () => removeDecorItem(decor, scene))
          } catch (e) { console.warn('[cool-pal] vignette failed', e) }
        })
      }

      fx.after(160, () => {
        fx.sfx('whoosh', { pitch: 0.6 })
        fx.caption('RETURN FLIGHT: ECONOMY')
      })

      fx.after(172, () => { // CRASH LANDING
        fx.shake(1.3)
        fx.sfx('break')
        fx.slowmo(0.3, 0.6)
        fx.hit({ damage: 20, knockback: { x: 4, y: 6, spin: 2 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [-F * 3, 7, 0])
        fx.particles('impact', v3(fx.foe.pos.x, 0.8, 0), { n: 24 })
        fx.particles('smoke', v3(fx.foe.pos.x, 0.6, 0), { n: 12 })
      })

      fx.after(186, () => { // the suitcase arrives late, raining clothes
        const sx = clampToArena(fx, fx.foe.pos.x)
        const suitcase = fx.spawnProp('crate', v3(sx, 5.5, 0))
        if (suitcase) { try { fx.impulse(suitcase, [0, -6, 0], 2) } catch { /* prop gone */ } }
        fx.caption('BAGGAGE: LOST')
        fx.particles('confetti', v3(sx, 4.8, 0), { n: 26 })
        for (let i = 0; i < 8; i++) {
          fx.after(6 + i * 3, () => {
            const b = fx.spawnProp('box',
              v3(clampToArena(fx, sx + (Math.random() - 0.5) * 1.5), 4.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2),
              { mass: 0.3 })
            if (b) { try { fx.impulse(b, [(Math.random() - 0.5) * 5, -2, (Math.random() - 0.5) * 3], 4) } catch { /* prop gone */ } }
            if (i % 2 === 0) fx.sfx('thud', { pitch: 1.3 + i * 0.08, vol: 0.5 })
          })
        }
      })

      fx.after(212, () => fx.announcer('WISH YOU WERE HERE'))
      fx.after(232, cleanup)
      fx.after(236, end)
    },
  },

  voice: { pitch: 0.5, rate: 0.65 },
}
