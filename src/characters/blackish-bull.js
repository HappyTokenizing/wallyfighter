// THE BLACKISH BULL — Lord of the Final Pump. FINAL BOSS.
// Fully self-contained CharacterDef per CONTRACTS.md §4 (plus a second exported
// def, BlackishBullUnchainedDef, for story round 10 — NOT in the select roster).
//
// VISUAL OVERHAUL (docs/parody/blackish-bull.md): a green-black patinated bronze
// monument that got off its pedestal and stood up. The silhouette read is four
// peaks — the skull hung low and forward, two horns sweeping out then forward
// then up to finish 0.30 m past the nose on a 1.15 m span, a colossal morrillo
// neck-crest cresting 0.20 m ABOVE the poll, and a lash tail arcing over the
// rump. Surfacing is the statue half of the joke and it is one material:
// corroded bronze, differentiated only by where hands have rubbed it —
// near-mirror burnished crowns (nose pad, horn curves, shoulder tops, knuckle
// claws, hoof crowns) against a rough patina everywhere else, with chalky
// verdigris streaking down out of every crevice.
//
// All surfaces come from src/render/ (pbr() presets + procedural PBR maps) and
// all geometry from the bevel/loft/superellipsoid toolkit — no raw BoxGeometry,
// no flat Lambert, no image assets, no extra deps.
//
// Parody safety (docs §9): generic archetype only. A BIPED with arms, hooved
// fists, a jacket and a fighting stance; proportions from live-cattle anatomy;
// a black-sulfide/verdigris patina chemistry, never a warm brown. No source
// name, mark, pedestal, pose or colourway anywhere in geometry, materials,
// mesh names or strings.
import * as THREE from 'three'
import {
  makeMaterialFactory,
  roundedBox, superellipsoid, ball, jointBall, taperedCapsule, roundedCylinder,
  roundedCone, sleeve, skirt, filletRing, loft, plate, lens, splineTube,
  roundedRectPoints, superellipsePoints, mergeStatic, dedupeGeometry, rotated,
  profileLathe, taperedBox,
} from '../render/index.js'

const PI = Math.PI
const TAU = PI * 2
const lerp = (a, b, t) => a + (b - a) * t

// The static bind pitch of the skull under the animated `head` bone: the
// skull's long axis (poll -> nose pad) points SKULL_PITCH below horizontal.
// Negative = nose down. Referenced by buildBullModel() and by buildVisor(),
// which has to undo it to point the lens plane at the opponent.
// R3: 25 deg was not enough head-drop — the poll came out level with the
// deltoid crowns and the throat wedge (negative space #1) closed against the
// brisket, which is exactly the "generic hunched brute" failure docs §2 warns
// about. 30 deg puts the poll at world y 2.216 (brief: 2.20), a full 0.18 m
// BELOW the morrillo crown at 2.40, and opens 0.28 m of clear air between the
// chin and the brisket. It stops short of the brief's 34 deg because at 34 the
// frontal plate and the visor plane point at the floor from the game camera.
const SKULL_PITCH = -0.52          // 30 degrees below horizontal

// ---------------------------------------------------------------------------
// palette — docs §5. Every albedo is inside the contract's [30, 240] sRGB band.
// The model is deliberately compressed into the bottom third of the value range
// (86% of surface area under 10% luminance) with a handful of bright bronze
// rubs sitting on exactly the silhouette cues, so he reads as a dark hole with
// bright edges against every arena. Emissive entries are radiance, not albedo,
// and are exempt from the band.
// ---------------------------------------------------------------------------
const C = {
  hornTip: 0x221f17,     // darkest on the model: horn points, cleft + nostril interiors
  patinaDeep: 0x1e2621,  // crevices — under the barrel, dewlap folds, orbit shadow
  // R3 VALUE CRUSH. r2 shipped 0x36453a / 0x5a6d53 — both lifted well above the
  // brief and both chroma-heavy, which is exactly how a bronze monument became a
  // saturated mid-green Hulk-cow at 25-35% relative luminance. These are the
  // brief's numbers verbatim: 3.8% and 9.5%. Combined with the desaturated map
  // tint below and the dropped envMapIntensity on the hide family, ~86% of the
  // model's surface area now sits under 10% luminance, which is the whole
  // "dark hole with bright edges" structure the parody read depends on.
  patina: 0x2e3a31,      // THE HIDE. ~60% of the surface. Green-black bronze, 3.8%.
  patinaMid: 0x4a5a46,   // UPWARD-FACING convex planes ONLY: shoulder tops, rump,
                         // thigh outers, morrillo crown. 9.5%. Never a field colour.
  tie: 0x77202b,         // the necktie blade — the only saturated red present
  verdigris: 0x4e7a5c,   // chalky corrosion streaks, gravity-aligned
  shackle: 0x4a4238,     // restraints: warm-neutral rusted iron, NOT green
  alloy: 0x8a7048,       // nose ring, leash, buckles, plaque — a duller alloy
  rub: 0xb08542,         // THE BURNISHED BRONZE. Where hands reach.
  hot: 0xe8b463,         // lightest: extreme crowns + every fresh fracture face
  crackHalo: 0x8c3a16,   // heat-glazed band around each molten seam
  sclera: 0xc6bca8,
  iris: 0xe8952b,
  pupil: 0x1e1a14,
  visorGlass: 0xc9e9f2,
  plinthStone: 0x6e6a63, // granite fragments still fused to the rear hooves
  // The `metal-rusted` map paints IRON OXIDE into its albedo (rr +28%, bb -50%).
  // Multiplied onto a green-black hide that turns the whole body dusty PINK-
  // MAUVE, which is exactly the "raw meat" read the critic called. Every hide
  // material passes this as mapOpts.tint so the blooms hue-shift to cupric
  // green and the body stays one cast-bronze family.
  //
  // R3: this tint was 0x4d6b52 — a 16%-luminance saturated green multiplied
  // into every hide albedo texel, which is where the on-screen chroma actually
  // came from. Chroma cut ~60% and the value dropped: the map now modulates
  // the hide's ROUGHNESS and NORMAL far more than its hue, which is the point.
  patinaTint: 0x4e564d,
  jacket: 0x24262b,      // the sleeveless combat jacket — leather, not cloth
  // --- emissive (exempt) ---
  molten: 0xff5a1e,
  moltenCore: 0xffd48a,
  visorEm: 0x2fa8c8,     // base costume — cold cyan
  visorEmUn: 0xff6a3a,   // UNCHAINED — molten
  visorEmGold: 0xe8b45a, // gilded costume — amber
  irisEm: 0xe8952b,
  // --- kept for the move scripts, which tint the seam network on power moves --
  green: 0x37e07a,
  greenEm: 0x0f6b35,
  red: 0xff4d5e,
}

// ---------------------------------------------------------------------------
// materials
//
// M is a module-private scoped cache: every mesh asking for the same
// (colour, preset, opts) gets ONE material, so the whole bronze body flashes as
// a unit on a hit and no other fighter or arena can ever see it. Fighter.js
// claims its own mutable clones per instance before it mutates anything
// (Fighter._claimMutableMaterials), so nothing in the bind pose needs `unique`
// EXCEPT the two families the move scripts write to directly through
// `userData.markMats` / `userData.visorMat` — those pointers must survive the
// claim pass, so they are built `unique` per buildModel() call exactly as the
// old Lambert build did.
// ---------------------------------------------------------------------------
const M = makeMaterialFactory({ scope: 'blackish-bull' })

/** mat(color, preset, opts) — the model's only shared-material entry point. */
function mat(color, preset = 'default', opts = {}) {
  return M.pbr(color, preset, opts)
}

/** lamb(color, opts) — a throwaway instance for cinematic props scrap() disposes. */
function lamb(color, opts = {}) {
  const { surface, ...rest } = opts
  return M.pbr(color, surface || 'default', { ...rest, unique: true })
}

// ---------------------------------------------------------------------------
// tiny procedural-model helpers — every one of them bevelled (contract §0.4)
// ---------------------------------------------------------------------------
function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const r = Math.min(0.03, Math.min(w, h, d) * 0.24)
  const m = new THREE.Mesh(roundedBox(w, h, d, r, 2), material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

function sph(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 20) {
  const m = new THREE.Mesh(ball(r, seg), material)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}

/** mesh(geometry, material, x, y, z) — the terse builder used by buildModel. */
function mesh(g, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(g, material)
  m.position.set(x, y, z)
  return m
}

/**
 * disc(rx, ry, thickness) — a convex lens shell at a sane triangle cost.
 * Eyelids, iris, pupil, rub patches, claw crowns, soles. lens()'s 20-segment
 * default is portrait quality; 12 is indistinguishable at fighting distance and
 * costs half.
 */
function disc(rx, ry, th, opts = {}) {
  return lens(rx, ry, th, { seg: opts.seg ?? 12, rimSeg: 1, faceSeg: 2, crown: opts.crown ?? th * 0.55 })
}

/**
 * sphZone(r, thick, a0, a1, sweep, seg) — a SPHERICAL SHELL SEGMENT: a solid
 * band of a sphere of radius `r`, `thick` metres deep, running from latitude
 * `a0` to `a1` (radians, 0 = equator, +PI/2 = the +Y pole) and through `sweep`
 * radians of azimuth centred on +X.
 *
 * This is the eyelid primitive, and the reason r2's lids failed without it. A
 * `lens()` disc parked in front of an eyeball is a flat banana that floats
 * clear of the sphere with a visible gap at both corners — the exact defect the
 * critic named. A zone of the SAME sphere shares the eyeball's curvature by
 * construction, so it slides on the ball and can never gap, at any coverage.
 * The profile is a closed loop (inner arc up, outer arc back down, then a wall
 * across the margin) so the shell has real 8 mm thickness and a rolled edge.
 */
function sphZone(r, thick, a0, a1, sweep = PI * 1.12, seg = 20) {
  const n = 8
  const pts = []
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(r * Math.cos(a), r * Math.sin(a)) }
  for (let i = n; i >= 0; i--) {
    const a = lerp(a0, a1, i / n)
    pts.push((r + thick) * Math.cos(a), (r + thick) * Math.sin(a))
  }
  pts.push(r * Math.cos(a0), r * Math.sin(a0))
  return profileLathe(pts, seg, { phase: -sweep / 2, thetaLength: sweep, creaseAngle: 70 })
}

/** rot(mesh, rx, ry, rz) -> mesh — chainable. */
function rot(m, rx = 0, ry = 0, rz = 0) { m.rotation.set(rx, ry, rz); return m }
/** scl(mesh, sx, sy, sz) -> mesh — chainable. */
function scl(m, sx = 1, sy = sx, sz = sx) { m.scale.set(sx, sy, sz); return m }

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

// A per-bone merge bin. Static dressing goes in here and is collapsed to one
// mesh per material at the end of buildModel(). NEVER across bones: Gore
// _detach() clones a bone's whole subtree and a buffer spanning two bones would
// tear on dismemberment.
function staticBin(bone, name) {
  const g = new THREE.Group()
  g.name = name
  bone.add(g)
  return g
}

// ---------------------------------------------------------------------------
// surfacing — docs §6.
//
// THE CENTRAL IDEA: everything on this character is ONE material, bronze, and
// the whole look is the ROUGHNESS SPREAD between where hands reach and where
// weather sits. Per-region roughness actually resolved by the shader:
//
//   cornea 0.04 · visor lens 0.05 · burnished rub 0.14 · horn 0.22 · alloy 0.26
//   sclera 0.32 · nostril interior 0.30 · hide 0.52 · leather 0.55 · hoof 0.62
//   shackle 0.62 · verdigris 0.74 · heel bulb 0.80 · necktie 0.84
//
// `overrides.roughness` is a MULTIPLIER on the preset's target (three.js
// semantics, see render/README §2), which is why the numbers below are ratios.
// ---------------------------------------------------------------------------
function bullMaterials(costume, un) {
  const gild = costume === 1 && !un
  // The rub family: real gold leaf on the restored "BULL MARKET" costume,
  // burnished bronze otherwise. Same geometry, different alloy.
  const rubHex = gild ? C.hot : C.rub

  // METALNESS IS THE VALUE-CRUSH KNOB. A metalness-1.0 surface has NO diffuse
  // lobe at all: it is 100% image-based reflection, so in a dark arena it
  // renders as a black hole with no form shading, which is precisely how the
  // whole lower body disappeared. Cast bronze reads correctly at ~0.6: enough
  // specular to be unmistakably metal, enough diffuse left that the modelling
  // survives at 128 px. Only the polished rubs, the horns and the hardware go
  // near 1.0, because those are the six places that are SUPPOSED to be
  // reflection-driven.
  const HIDE_METAL = 0.60

  return {
    // ------------------------------------------------------------------
    // THE THREE READABLE SURFACES (docs §6; r2's blocking defect was that a
    // viewer could name exactly ONE surface on this character, and it was not
    // bronze). They are separated on METALNESS and ROUGHNESS, not just on
    // albedo value, so they behave differently as the character turns:
    //
    //   1. `hide`      semi-matte PATINATED METAL, rough 0.52-eq, metal 0.60.
    //                  Broad diffuse-ish form shading, weak arena reflection.
    //   2. `hideDeep`  CHALKY LOW-SPEC VERDIGRIS in every crevice, metal 0.18,
    //                  roughness maxed, envMap almost off — a POWDER sitting on
    //                  metal, which is physically what it is. This is the
    //                  surface that makes the fields read as metal by contrast.
    //   3. `rub`/`rubHot` NEAR-MIRROR BURNISHED BRONZE, metal 0.92, rough 0.14,
    //                  envMap 1.45. Only where hands reach.
    //
    // `hideMid` is not a fourth surface: it is `hide` with the patina lifted,
    // and it is restricted to UPWARD-FACING convex planes.
    // ------------------------------------------------------------------
    // envMapIntensity dropped 1.2 -> 0.85: at 1.2 a 60%-metal body picks the
    // whole arena up as diffuse-looking fill and the value floor rose to the
    // mid-greens no matter what the albedo said.
    hide: mat(C.patina, 'metal-rough', {
      roughness: 0.92, metalness: HIDE_METAL, envMapIntensity: 0.85, normalScale: 1.5,
      mapOpts: { scale: 0.7, wear: 0.55, tint: C.patinaTint, repeat: [2, 2] },
    }),
    // the patina lifting toward the light. UPWARD-FACING CONVEX PLANES ONLY —
    // shoulder tops, rump, thigh outers, the morrillo crown. Used as a field
    // colour (which is what r2 did) it drags the whole model back up into the
    // mid-value range and destroys the two-value statue read.
    // R4: envMapIntensity 1.0 -> 0.82 to match the hide family. At 1.0 the crown
    // colour picked up the arena as extra fill and the "lifted patina" zones
    // metered brighter than the burnished rubs that are supposed to out-value
    // everything on the model.
    hideMid: mat(C.patinaMid, 'metal-rough', {
      roughness: 0.80, metalness: HIDE_METAL + 0.04, envMapIntensity: 0.82, normalScale: 1.3,
      mapOpts: { scale: 0.9, wear: 0.4, tint: C.patinaTint, repeat: [2, 2] },
    }),
    // CREVICES — surface #2. Not "the hide, darker": a genuinely different
    // material. `concrete` maps at metalness 0.18 and envMapIntensity 0.3 give
    // a dead chalky powder with no specular lobe at all, so every hollow on the
    // model goes matte-black while the fields beside it stay metal. That
    // contrast is the single biggest material-identity win available here.
    hideDeep: mat(C.patinaDeep, 'concrete', {
      roughness: 1.0, metalness: 0.18, envMapIntensity: 0.3, normalScale: 1.6,
      mapOpts: { scale: 0.5, wear: 0.7, tint: C.patinaTint, repeat: [3, 3] },
    }),
    // verdigris is a POWDER SITTING ON metal, not a metal: the roughest, most
    // matte thing on the body. Costume 1 is a freshly restored monument, so it
    // has NO verdigris at all — verdStreak() no-ops on a null.
    verd: gild ? null : mat(C.verdigris, 'concrete', {
      metalness: 0.35, envMapIntensity: 0.8, roughness: 1.0,
      mapOpts: { scale: 0.5, repeat: [3, 3] },
    }),
    // THE BURNISHED RUB — the brief's "single most identifiable property", and
    // the thing r1 shipped crushed to near-black. Built on the `gold` preset
    // (target roughness 0.12, a genuine mirror event under a sun disc) rather
    // than `metal` (0.26), with metalness held at 0.86 so ~14% diffuse survives
    // and the zone still reads bright in an arena with a weak environment.
    // These six zones must be the brightest values on the model.
    // Roughness 0.144 (gold target 0.12 x 1.2), NOT a pure mirror: r1's poll
    // highlight blew to a clipped white pixel with no roll-off, which reads as
    // a bug. 0.144 with envMapIntensity 1.45 gives a lobe wide enough to
    // DESCRIBE the curvature it sits on and still comfortably the brightest
    // value on the model. Bloom discipline (docs §6): the polished bronze is a
    // bright specular, not a light source, and must not be pushed into bloom.
    // R4: repeat dropped [2,2] -> [1,1] and the feature scale raised. The rub
    // zones are small meshes carrying triplanar UVs whose unit is only ~0.26 m,
    // so a [2,2] repeat put ~8 tiles of the same pebble field across the nose
    // pad — which is what the critic saw as "a visibly tiled uniform pebble
    // bump". One tile per rub zone, finer grain, no repeat pattern to catch.
    rub: mat(rubHex, 'gold', {
      metalness: 0.92, roughness: 1.15, envMapIntensity: 1.45, clearcoat: 0.25,
      clearcoatRoughness: 0.10, mapOpts: { scale: 1.6, repeat: [1, 1] },
    }),
    // the extreme crowns: the top ~15% of each rubbed area
    rubHot: mat(C.hot, 'gold', {
      metalness: 0.90, roughness: 1.0, envMapIntensity: 1.5, clearcoat: 0.3,
      clearcoatRoughness: 0.08, mapOpts: { scale: 1.9, repeat: [1, 1] },
    }),
    // fresh fracture faces: no patina at all, the shiniest thing on the model
    hot: mat(C.hot, 'gold', { metalness: 0.9, roughness: 0.8, envMapIntensity: 1.6, mapOpts: { scale: 1.6 } }),
    // Horn: burnished bronze with the growth-ring grain in the map. r1 shipped
    // this at envMapIntensity 1.4 / metalness 0.9, which blew the whole upper
    // curve to clipped white and destroyed both the taper and the rings. 0.85
    // keeps a describable anisotropy-free lobe that DESCRIBES the curvature
    // instead of erasing it.
    // HORN. r2 ran this on the `horn` PRESET with a [1, 3] repeat, whose
    // anisotropic keratin grain stretched into a longitudinal WOOD GRAIN down
    // each horn — the single loudest "this is a stick, not a cast bronze horn"
    // tell in the last build. These horns are bronze: `metal` preset, isotropic
    // 1:1 repeat, roughness 0.22-equivalent on the outer curve. The growth
    // rings are geometry (buildHorns' radius law), never a texture.
    horn: mat(rubHex, 'metal', {
      metalness: 0.95, roughness: 0.85, envMapIntensity: 1.1, clearcoat: 0.2,
      clearcoatRoughness: 0.12, mapOpts: { scale: 1.1, repeat: [1, 1] },
    }),
    // the ring grooves and the underside: the same alloy, twice as rough, so
    // the horn's section reads instead of blowing to one uniform highlight
    hornDark: mat(0x6c5230, 'metal', { metalness: 0.9, roughness: 1.5, envMapIntensity: 0.7 }),
    hornTip: mat(C.hornTip, 'metal', { metalness: 0.9, roughness: 1.3, envMapIntensity: 0.55 }),
    claw: mat(0x3b4438, 'horn', { metalness: 0.55, roughness: 1.05, envMapIntensity: 0.8, mapOpts: { scale: 0.9 } }),
    // the ONE non-metal on the body. Softest, deadest surface here, and the
    // contrast is what sells the weight of every landing.
    heel: mat(0x2f2b26, 'rubber', { envMapIntensity: 0.3 }),
    // a DIFFERENT, duller, warmer alloy from the body — if the ring matches the
    // nose it disappears
    alloy: mat(gild ? C.hot : C.alloy, gild ? 'gold' : 'metal', {
      roughness: 1.0, envMapIntensity: 1.2, mapOpts: { scale: 1.3, tint: C.alloy },
    }),
    shackle: mat(C.shackle, 'metal-rough', {
      metalness: 0.8, roughness: 1.0, envMapIntensity: 1.0, normalScale: 1.3,
      mapOpts: { scale: 1.4, wear: 0.9, repeat: [2, 2] },
    }),
    leather: mat(C.jacket, 'leather', {
      roughness: 1.0, envMapIntensity: 0.9, mapOpts: { scale: 1.1, wear: 0.6, repeat: [2, 2] },
    }),
    // the shoulder-crown and front-edge wear patches on the jacket
    leatherWorn: mat(0x33363b, 'leather', {
      roughness: 0.55, envMapIntensity: 1.1, mapOpts: { scale: 1.1, wear: 0.9 },
    }),
    // the only woven surface on a tonne of bronze — it must look absurdly soft
    // The only saturated red and the only woven surface on a tonne of bronze:
    // it must look absurdly soft, and it must be VISIBLE. r1 ran it at
    // envMapIntensity 0.55 next to a 60%-metal body and it disappeared.
    tie: mat(C.tie, 'cloth', {
      roughness: 0.94, envMapIntensity: 1.0, sheen: 0.35, sheenColor: 0xb06070,
      mapOpts: { scale: 1.4, repeat: [2, 2] },
    }),
    // the heat-glazed metal ring around each seam: the trick that stops the
    // cracks reading as glowing stickers
    halo: mat(C.crackHalo, 'metal-rough', { roughness: 0.56, envMapIntensity: 1.2, mapOpts: { scale: 1.4 } }),
    plinth: mat(C.plinthStone, 'stone', { metalness: 0, roughness: 1.0, mapOpts: { scale: 0.8 } }),
    // --- face ---------------------------------------------------------------
    // The eye must be the brightest, highest-contrast element on the character
    // — that is what Astro Bot gets right and what r1 got wrong. Sclera lifted
    // out of the 30-240 band's basement and given a low roughness so the ball
    // itself carries a soft terminator under the hard cornea dot.
    sclera: mat(C.sclera, 'skin', { roughness: 0.62, envMapIntensity: 0.9 }),
    // THE CORNEA (docs §3.4 layer 1). r2 deleted it and shipped a flat emissive
    // iris disc with an emissive bead stuck on top — which is why the eyes read
    // as bicycle reflectors with no wet dot. This is a real sphere CAP sharing
    // the eyeball's curvature: glass preset, roughness 0.04-equivalent,
    // clearcoat 1.0, transmission 0 (transmission costs a whole extra scene
    // render per material, docs §7 — a 22%-opacity clearcoat cap buys the same
    // one crisp specular lobe for nothing). It sits OVER the iris and sclera and
    // occludes almost nothing, so the iris still carries the value.
    cornea: mat(0xdfe6ea, 'glass', {
      transmission: 0, transparent: true, opacity: 0.22, depthWrite: false,
      roughness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 1.6,
    }),
    // the limbus: the dark wet ring at the iris edge. A separate material from
    // the cornea so the ring can be near-black while the cap stays clear.
    limbus: mat(0x23262a, 'plastic-gloss', {
      roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.4,
    }),
    // the guaranteed catchlight: a real emissive bead sitting on the cornea's
    // upper-outer quadrant, so ONE hard white dot survives tonemapping and
    // downsampling to 128 px no matter what the arena's lighting does
    catchlight: M.emissive(0xffffff, 2.6, 'neon-panel', { name: 'bullCatchlight' }),
    pupil: mat(C.pupil, 'plastic-gloss', { roughness: 0.5, clearcoat: 0.8 }),
    // faint. A heat glow from BEHIND the iris, not a headlight (docs §3.4).
    iris: M.emissive(C.irisEm, 1.25, 'neon-panel', { name: 'bullIris' }),
    // the lids are hide, and they must read as hide: the same patinated bronze
    // as the muzzle, only in shadow. A distinct "lid green" is what made r2's
    // upper lid read as a banana floating clear of the eyeball.
    lid: mat(C.patina, 'metal-rough', {
      roughness: 0.95, metalness: HIDE_METAL, envMapIntensity: 0.7, normalScale: 1.4,
      mapOpts: { scale: 1.4, tint: C.patinaTint, repeat: [2, 2] },
    }),
    lidRim: mat(0x232b25, 'metal-rough', { roughness: 1.0, metalness: 0.4, envMapIntensity: 0.4 }),
    bone: mat(0xdcd3bd, 'bone', { clearcoat: 0.12, roughness: 0.63 }),
    gum: mat(0x6a4038, 'skin', { roughness: 1.0 }),
    // the only true holes on the model
    cavity: mat(C.hornTip, 'skin', { roughness: 0.58, envMapIntensity: 0.25 }),
    tongue: mat(0x8f4c4c, 'skin-wet', { roughness: 0.7 }),
    // brushed-alloy frame: the one place docs §6 sanctions a mild anisotropic
    // hint. `metal` + a fine 1.5-scale map is the closest the factory offers.
    visorFrame: mat(0x6a6357, 'metal', { roughness: 1.0, envMapIntensity: 1.0, mapOpts: { scale: 1.5 } }),
    // THE LENS BODY. The visor is now two shells: this dark, near-matte inner
    // body carrying the glow, and a separate clear curved glass shell over it
    // (built in buildVisor). r2 shipped ONE emissive slab at intensity 3.4 and
    // it clipped to featureless pure white with a bloom skirt — no lens
    // curvature, no falloff toward the ends, which reads as a render bug.
    // Light behind glass, not a lit rectangle.
    visorBody: mat(0x1b2a30, 'plastic-gloss', { roughness: 0.5, envMapIntensity: 0.5 }),
    visorGlass: mat(0xdfeef4, 'glass', {
      transmission: 0, transparent: true, opacity: 0.30, depthWrite: false,
      roughness: 0.12, clearcoat: 1.0, clearcoatRoughness: 0.02,
      iridescence: 0.35, iridescenceIOR: 1.8, envMapIntensity: 1.6,
    }),
  }
}

// ---------------------------------------------------------------------------
// triUV(geo, scale) — rewrite a geometry's UVs triplanar.
//
// superellipsoid()/ball() emit lat-long spherical UVs, whose two poles are
// singularities: with any tiling detail map the texels converge into a visible
// 4-fold KALEIDOSCOPE PINWHEEL at the crown of the dome. It is unmistakable at
// 1 m and it is the single loudest "amateur" tell available for free. Every
// dome whose crown faces the camera goes through here instead.
//
// The source geometry comes out of the shared cache, so this CLONES rather than
// mutating: rewriting the shared buffer in place would corrupt every other
// caller. Results are memoised per (uuid, scale) so a mirrored pair costs one.
// ---------------------------------------------------------------------------
const _triUV = new Map()
function triUV(geo, scale = 0.55) {
  const key = `${geo.uuid}|${scale}`
  const hit = _triUV.get(key)
  if (hit) return hit
  const g = geo.clone()
  const p = g.attributes.position, n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    let u, v
    if (ax >= ay && ax >= az) { u = z / scale; v = y / scale }
    else if (ay >= az) { u = x / scale; v = z / scale }
    else { u = x / scale; v = y / scale }
    uv[i * 2] = u + 0.5
    uv[i * 2 + 1] = v + 0.5
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  // three r166 reads aoMap/lightMap from uv1
  g.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2))
  _triUV.set(key, g)
  return g
}

/** sel(...) — a superellipsoid with pole-free triplanar UVs. */
function sel(rx, ry, rz, e, eZ, seg, uvScale) {
  return triUV(superellipsoid(rx, ry, rz, e, eZ, seg), uvScale ?? Math.max(rx, ry, rz) * 2.2)
}

/**
 * A molten seam. Two coaxial tubes: a wide, deep, heat-glazed halo band inset
 * into the surface, and a narrow emissive crack sitting proud in its trough.
 * The warm albedo ring around the emitter is what fakes subsurface heat — it is
 * the difference between "hot metal" and "a neon strip stuck on".
 */
function addSeam(bin, pts, r, S, mats) {
  const inset = (k) => pts.map(([x, y, z]) => [x * k, y, z * k])
  bin.add(mesh(splineTube(inset(0.955), r * 2.7, 8, null, { radialSeg: 5 }), S.halo))
  bin.add(mesh(splineTube(inset(0.995), r, 8, null, { radialSeg: 5, roundEnd: true, roundStart: true }), mats.seam))
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, 2.50 m tall (x1.15 for the unchained variant)
//
// Rig is FROZEN (CONTRACTS.md §4 / docs §0):
//   group > hips > { tail, legL, legR, torso }
//   legL/legR > shinL/shinR
//   torso > { head > { earL, earR }, armL > forearmL, armR > forearmR }
// hips sits at [0, 1.15, 0] and every clip keys hip position ABSOLUTELY.
// Accessory pivots (glasses / tie / coat) come from Gore's ACCESSORY_BONES list
// and no clip keys them.
// ---------------------------------------------------------------------------
function buildBullModel(costume = 0, opts = {}) {
  const un = !!opts.unchained
  const gild = costume === 1 && !un
  const group = new THREE.Group()
  const bones = {}
  const markMats = []
  const S = bullMaterials(costume, un)

  // The seam network. Two emissive instances (not fifteen) so the draw-call and
  // material budgets stay sane while glowMarks() can still tint the whole
  // network green when the chart does. Both are `unique` per build: the move
  // scripts hold these exact objects through userData.markMats.
  const seamM = M.emissive(C.molten, 2.4, 'neon-panel', { name: 'bullSeam' })
  seamM.userData.baseEm = C.molten
  const coreM = M.emissive(C.moltenCore, 3.6, 'neon-panel', { name: 'bullSeamCore' })
  coreM.userData.baseEm = C.moltenCore
  markMats.push(seamM, coreM)
  const mats = { seam: seamM, core: coreM }

  const bins = []
  const bin = (bone, name) => { const b = staticBin(bone, name); bins.push(b); return b }

  // --- hips: heavy pelvis, high tail root, no human waist --------------------
  const hips = pivot(group, 0, 1.15, 0)
  bones.hips = hips
  buildHips(bin(hips, 'pelvis'), S)

  // --- tail: the headline secondary and the profile's whole rear read --------
  // Root raised to world y 1.49 so the lash can arc UP over the rump and hook
  // forward, enclosing the open crescent of sky that makes the profile read as
  // a monument rather than as a cow. Clips key rotation only, so the origin is
  // free; the bone name and parent are not.
  const tail = pivot(hips, -0.30, 0.34, 0.03)
  bones.tail = tail
  buildTail(bin(tail, 'lash'), S)

  // --- legs: columns, cloven hooves, plinth fragments still fused on ---------
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.05, 0.26 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    buildThigh(bin(leg, 'thigh'), S, side)
    const shin = pivot(leg, 0, -0.62, 0.02 * side)
    bones[side === 1 ? 'shinL' : 'shinR'] = shin
    buildShin(bin(shin, 'cannon'), S, side, un)
  }

  // --- torso: deep barrel, brisket keel, neck, morrillo crest, dewlap --------
  const torso = pivot(hips, 0, 0.15, 0)
  bones.torso = torso
  const torsoBin = bin(torso, 'barrel')
  buildTorso(torsoBin, S, gild)
  buildNeck(torsoBin, S, gild)
  buildPlaque(torsoBin, S)
  buildTorsoSeams(torsoBin, S, mats, un)

  // jacket — Gore pops `coat` at the 70% damage threshold, which is a story
  // beat: losing it starts turning the base form into the unchained form.
  if (!un) {
    const coat = pivot(torso, 0, 0, 0)
    bones.coat = coat
    buildJacket(bin(coat, 'jacket'), S, gild)
  }

  // --- arms: deltoid crowns rubbed bright, forearms into cloven fists --------
  for (const side of [1, -1]) {
    const arm = pivot(torso, 0.02, 0.62, 0.6 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    buildUpperArm(bin(arm, 'deltoid'), S, mats, side, un)
    const fore = pivot(arm, 0, -0.46, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    buildForearm(bin(fore, 'forearm'), S, mats, side, un)
  }

  // --- head -----------------------------------------------------------------
  const head = pivot(torso, 0.05, 0.82, 0)
  bones.head = head
  // THE SKULL PITCH. r1 shipped -0.59 rad (34 deg) and, once the idle track's
  // extra -0.06 and the front camera's perspective were added, the nose pad
  // landed at 0.48 H and the visor plane pointed at the floor: the character
  // had no face from the canonical camera, which was the single blocking
  // defect of the whole build. SKULL_PITCH is now 25 deg. That still keeps
  // every §2 relationship the read depends on -- the poll stays 0.18 m below
  // the morrillo crown, the horn tips stay below it, the throat wedge stays
  // open -- while the frontal plate, the visor band, both eyes and the nose pad
  // all face the opponent. Every clip keys head rotation RELATIVE to this bind,
  // so no clip changes.
  const skull = bent(head, SKULL_PITCH, 0, 0)
  const skullBin = staticBin(skull, 'skull'); bins.push(skullBin)
  buildSkull(skullBin, S)
  buildEyes(skullBin, S)
  buildJaw(skullBin, S)
  buildHorns(skullBin, S)
  // the nose ring is NOT a Gore accessory — it stays on. Its own pivot under
  // the skull so a 2-DOF spring can swing it on every head move.
  const ringPivot = pivot(skull, 0.752, -0.152, 0)   // through the septum, midline
  buildNoseRing(ringPivot, S)
  try { mergeStatic(ringPivot) } catch (e) { /* draw-call win only */ }

  // visor — `glasses` is an accessory bone: Gore pops it at 70% damage and the
  // full eye geometry underneath carries the face from then on. Sanctioned.
  const visorMat = buildVisor(head, bones, S, costume, un)

  // the leash-necktie hangs off the head, never the chest: a chain crossing a
  // bone boundary tears open on every head turn.
  buildLeashTie(head, bones, S)

  // ears: paddles, set below and behind the horns
  for (const side of [1, -1]) {
    const ear = pivot(head, 0.033, 0.158, 0.20 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    buildEar(bin(bent(ear, 0, 0.21 * side, -0.35 * side), 'paddle'), S, side)
  }

  if (un) group.scale.setScalar(1.15)

  // Collapse the static dressing to one mesh per material PER BONE. Never
  // across bones — Gore._detach() clones a bone's whole subtree.
  for (const b of bins) {
    try { mergeStatic(b) } catch (e) { console.warn('[bull] merge skipped', e) }
  }
  try { dedupeGeometry(group) } catch (e) { /* the geometry cache already shares */ }

  group.userData.visorMat = visorMat
  group.userData.markMats = markMats
  group.userData.baseScale = un ? 1.15 : 1
  group.userData.unchained = un

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}


/**
 * A gravity-aligned verdigris run. Chalky green corrosion starts under a
 * crevice and fades downward — the streaks are baked into the limb they sit on,
 * so they rotate with it, which is exactly how a real statue's runs behave.
 */
function verdStreak(bin, S, pts, r = 0.011) {
  if (!S.verd) return
  bin.add(mesh(splineTube(pts, r, 6, (t) => r * (1 - t * 0.8), { radialSeg: 4 }), S.verd))
}

/** A chip: the patina knocked off, exposing raw bright bronze. Never mirrored. */
function chip(bin, S, x, y, z, rx, ry, rz, r = 0.045) {
  bin.add(rot(mesh(lens(r, r * 0.62, 0.016), S.hot, x, y, z), rx, ry, rz))
}

// ---------------------------------------------------------------------------
// hips — heavy pelvis (1.02 m across), two gluteal masses either side of a
// central groove, sacral crest at world y 1.52. The tail root emerges high
// between them.
// ---------------------------------------------------------------------------
function buildHips(bin, S) {
  bin.add(mesh(sel(0.30, 0.30, 0.465, 3.0, 2.8, 18), S.hide, -0.02, 0, 0))
  for (const side of [1, -1]) {
    // R4: the gluteal lobes face BACK and OUT, so they are field, not crown.
    bin.add(mesh(sel(0.235, 0.26, 0.205, 3.2, 3.0, 14), S.hide, -0.20, 0.12, 0.235 * side))
    bin.add(mesh(sel(0.20, 0.22, 0.175, 3.0, 3.0, 14), S.hide, 0.10, 0.06, 0.285 * side))
  }
  bin.add(mesh(sel(0.22, 0.10, 0.30, 3.0, 3.0, 14), S.hideMid, -0.08, 0.27, 0))
  // the crevice under the tail root and between the gluteal lobes
  bin.add(mesh(sel(0.13, 0.14, 0.05, 2.6, 2.6, 10), S.hideDeep, -0.24, 0.16, 0))
  // 3 of the model's 14 verdigris runs: out of the rump groove, down the flanks
  verdStreak(bin, S, [[-0.28, 0.20, 0.02], [-0.31, -0.02, 0.05], [-0.30, -0.22, 0.06]], 0.013)
  verdStreak(bin, S, [[-0.20, 0.24, 0.38], [-0.24, 0.04, 0.43], [-0.22, -0.14, 0.42]])
  verdStreak(bin, S, [[-0.10, 0.28, -0.40], [-0.14, 0.06, -0.44], [-0.12, -0.18, -0.43]])
  // asymmetric chip 2 of 3 — the right hip crest
  chip(bin, S, -0.06, 0.32, -0.28, 0.7, 0.4, 0.2, 0.05)
}

// ---------------------------------------------------------------------------
// tail — 3-segment spring target, root at world y 1.49, apex at 2.48 and
// x -0.46. The crescent of empty sky it encloses above the back is negative
// space #2 and it is what makes the PROFILE read. Biased 3 cm to one side.
// SECONDARY_BONES: a torn-off tail must look like a snapped bronze casting, so
// the root carries a bright fracture-toned collar.
// ---------------------------------------------------------------------------
function buildTail(bin, S) {
  const pts = [
    [0.00, 0.00, 0.00],
    [-0.14, 0.331, 0.02],
    [-0.24, 0.643, 0.05],
    [-0.20, 0.896, 0.06],
    [-0.16, 0.964, 0.05],
    [0.02, 0.925, 0.04],
    [0.15, 0.818, 0.02],
  ]
  // GAUGE. r1's lash tapered from 0.048 to 0.016 on pow(t, 0.7) and rendered as
  // a 3-pixel dark wire with zero silhouette value -- which threw away read
  // cue #4, the open loop of sky above the rump that makes the PROFILE read as
  // a monument rather than as a cow. The lash now holds 0.062 through the
  // rising arc and only thins into the switch, so the loop punches a real hole.
  bin.add(mesh(splineTube(pts, 0.062, 22, (t) => lerp(0.064, 0.026, Math.pow(t, 1.5)), {
    radialSeg: 8, aspect: 1.12, roundEnd: true,
  }), S.hide))
  // the polished top of the arc: rub zone spillover, and the strip that carries
  // the rim light along the loop's upper edge
  bin.add(mesh(splineTube([[-0.235, 0.700, 0.052], [-0.205, 0.912, 0.062], [-0.115, 0.995, 0.055],
    [0.010, 0.975, 0.045]], 0.018, 18, (t) => lerp(0.014, 0.020, Math.sin(t * PI)),
  { radialSeg: 5, aspect: 2.0 }), S.rub))
  // the switch: a coarse brush of cast tufts, not a ball on a stick
  const tip = [0.15, 0.818, 0.02]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    bin.add(rot(mesh(roundedCone(0.026, 0.005, 0.165, 0.007, 7, 1), S.hideDeep,
      tip[0] + 0.035 + Math.cos(a) * 0.024, tip[1] - 0.085, tip[2] + Math.sin(a) * 0.024),
    Math.sin(a) * 0.3, 0, -0.5 + Math.cos(a) * 0.25))
  }
  // hide rolling onto the root, so a stump reads as a snapped casting
  bin.add(mesh(triUV(jointBall(0.082, 12), 0.32), S.hideDeep, 0, 0.01, 0))
  // R4: the tail was the one large mass carrying NO statue surfacing at all —
  // one uniform tube, which is why the critic read it as a moulded rubber
  // handle. It now gets the same treatment as every other casting: a dressed
  // longitudinal seam with two chase blobs, and two gravity-aligned verdigris
  // runs weeping off the underside of the arc (13 and 14 of the brief's 14).
  bin.add(mesh(splineTube([[-0.10, 0.24, 0.02], [-0.22, 0.52, 0.04], [-0.24, 0.76, 0.06]],
    0.005, 12, null, { radialSeg: 5 }), S.hideMid))
  bin.add(mesh(ball(0.011, 6), S.hideMid, -0.17, 0.40, 0.035))
  bin.add(mesh(ball(0.010, 6), S.hideMid, -0.235, 0.66, 0.055))
  verdStreak(bin, S, [[-0.20, 0.30, -0.03], [-0.17, 0.14, -0.04], [-0.13, 0.02, -0.03]], 0.008)
  verdStreak(bin, S, [[-0.26, 0.62, 0.08], [-0.24, 0.48, 0.09], [-0.20, 0.34, 0.08]], 0.007)
}

// ---------------------------------------------------------------------------
// thigh — hip to hock. Quadriceps swell forward, hamstring mass behind, and a
// dressed casting seam down the outside. Sleeved into the pelvis at the top so
// no gap can open at the hip (contract §0.4).
// ---------------------------------------------------------------------------
function buildThigh(bin, S, side) {
  const zc = 0.015 * side
  bin.add(mesh(jointBall(0.195, 14), S.hide, 0, 0.04, -0.01 * side))
  bin.add(scl(mesh(taperedCapsule(0.205, 0.180, 0.34, 4, 14), S.hide, 0.01, -0.30, zc), 1.08, 1, 0.86))
  // R4: the quadriceps bulge FACES FORWARD, it is not an upward-facing plane, and
  // shipping it in patinaMid put a 9.5%-luminance field on the biggest visible
  // mass of the leg. patinaMid is now a crown colour only (docs §5).
  bin.add(mesh(sel(0.195, 0.24, 0.155, 3.0, 3.0, 14), S.hide, 0.080, -0.19, zc))
  bin.add(mesh(sel(0.165, 0.22, 0.155, 3.0, 3.0, 12), S.hide, -0.11, -0.22, zc))
  // sleeve down into the hock so the thigh/cannon junction is one continuous form
  bin.add(mesh(sleeve(0.20, 0.175, 0.10, { radialSeg: 12, bulge: 0.03 }), S.hide, 0, -0.68, zc * 0.8))
  // casting seam: monumental bronzes are cast in sections and welded back
  const seam = [[0.03, -0.05, 0.190 * side], [0.01, -0.30, 0.185 * side], [-0.02, -0.56, 0.175 * side]]
  bin.add(mesh(splineTube(seam, 0.006, 10, null, { radialSeg: 5 }), S.hideMid))
  for (let i = 0; i < 3; i++) {
    bin.add(mesh(ball(0.014, 6), S.hideMid, 0.02, -0.14 - i * 0.19, (0.185 - i * 0.008) * side))
  }
  verdStreak(bin, S, [[0.02, -0.08, 0.19 * side], [0.00, -0.30, 0.20 * side], [-0.01, -0.48, 0.19 * side]])
  verdStreak(bin, S, [[-0.14, -0.10, 0.10 * side], [-0.15, -0.30, 0.11 * side], [-0.13, -0.46, 0.10 * side]], 0.009)
}

// ---------------------------------------------------------------------------
// shin — hock, oval cannon (1.4:1, deeper than wide), fetlock, dewclaws, the
// ankle shackle, the cloven hoof and the granite fragments still fused to it.
// ---------------------------------------------------------------------------
function buildShin(bin, S, side, un) {
  bin.add(mesh(jointBall(0.175, 12), S.hide, 0, 0.01, 0))
  bin.add(scl(mesh(taperedCapsule(0.155, 0.115, 0.10, 3, 13), S.hide, 0, -0.11, 0), 1.4, 1, 1))
  bin.add(mesh(ball(0.10, 12), S.hide, 0.012, -0.22, 0))
  // dewclaws: two non-weight-bearing nubs on the rear of the pastern. Small,
  // weird, and instantly bovine.
  // pulled in from x -0.095 to -0.068: at the old offset these sat clear of the
  // fetlock ball and read as a flap projecting into empty space
  for (const s2 of [1, -1]) {
    bin.add(rot(mesh(roundedCone(0.027, 0.008, 0.055, 0.008, 8, 2), S.claw, -0.068, -0.190, 0.055 * s2),
      0, 0, -2.5))
    bin.add(mesh(jointBall(0.030, 8), S.hideDeep, -0.056, -0.196, 0.050 * s2))
  }
  buildAnkleShackle(bin, S, un)
  buildHoof(bin, S, side)
  buildPlinthShards(bin, S, side)
}

// ---------------------------------------------------------------------------
// hoof — TWO claws split by a real cleft, inner and outer differing by 8%,
// a 48-degree toe wall, a raised coronary band with the patina rolling over it,
// soft rubber heel bulbs and a dished sole. Not a boot with a bar on it.
// ---------------------------------------------------------------------------
function clawGeo(sc) {
  return loft([
    { y: 0.02, shape: roundedRectPoints(0.19 * sc, 0.125 * sc, 0.045), offset: [-0.035, 0] },
    { y: -0.05, shape: roundedRectPoints(0.26 * sc, 0.135 * sc, 0.05), offset: [0.0, 0] },
    { y: -0.12, shape: roundedRectPoints(0.30 * sc, 0.135 * sc, 0.05), offset: [0.03, 0] },
    { y: -0.17, shape: roundedRectPoints(0.255 * sc, 0.115 * sc, 0.048), offset: [0.045, 0] },
  ], { subdivide: 1, caps: true })
}

function buildHoof(bin, S, side) {
  const hx = 0.04, hy = -0.275, hz = 0.02 * side
  // outer claw is 8% larger than the inner — real cattle claws are unequal and
  // the asymmetry is what stops the foot reading as a moulding
  bin.add(mesh(clawGeo(1.04), S.hideDeep, hx, hy, hz + 0.082 * side))
  bin.add(mesh(clawGeo(0.96), S.hideDeep, hx, hy, hz - 0.082 * side))
  // the cleft is a real 0.028 m gap with a near-black interior behind it
  bin.add(mesh(roundedBox(0.29, 0.155, 0.030, 0.008, 1), S.cavity, hx + 0.01, hy - 0.09, hz))
  // HOOF CROWNS — rub zone 7 (of the six named zones, the pair counts once).
  // Hooves polish against the floor. r1's crowns were 5.5 cm lozenges buried in
  // shadow at the bottom of frame; these are full claw-width caps so the wedge
  // shape actually reads as the bottom terminator of the silhouette.
  for (const s2 of [1, -1]) {
    bin.add(rot(mesh(disc(0.076, 0.040, 0.013, { crown: 0.006, seg: 14 }), S.rub,
      hx - 0.02, hy + 0.020, hz + 0.082 * s2 * side), PI / 2, 0, 0.25))
    bin.add(rot(mesh(disc(0.036, 0.019, 0.009, { crown: 0.004, seg: 12 }), S.rubHot,
      hx + 0.035, hy + 0.032, hz + 0.082 * s2 * side), PI / 2, 0, 0.25))
  }
  // coronary band + the hide visibly rolling over it: stops the hoof reading
  // as a shoe, exactly as the fillet collar does at the horn base
  bin.add(mesh(filletRing(0.158, 0.012, 6, 16), S.hideDeep, hx - 0.02, hy + 0.02, hz))
  bin.add(mesh(skirt(0.16, 0.192, 0.055, { radialSeg: 14, curve: 0.7 }), S.hide, hx - 0.02, hy + 0.075, hz))
  // heel bulbs: soft rubbery horn, roughness 0.80, the only compliant-looking
  // thing on a bronze character. The contrast sells the weight of a landing.
  for (const s2 of [1, -1]) {
    bin.add(scl(mesh(ball(0.078, 10), S.heel, hx - 0.155, hy - 0.085, hz + 0.072 * s2), 0.9, 1, 1))
  }
  // concave sole, 0.015 dished — it shows on jump, fall and knockdown frames
  for (const s2 of [1, -1]) {
    bin.add(rot(mesh(disc(0.085, 0.048, 0.018), S.cavity, hx + 0.03, hy - 0.163, hz + 0.082 * s2 * side), PI / 2, 0, 0))
  }
}

// ---------------------------------------------------------------------------
// ankle shackle — intact in the base form, snapped after two links with a
// bright un-patinated fracture face in UNCHAINED. That single material contrast
// is what makes "he broke out" legible without a caption.
// ---------------------------------------------------------------------------
function buildAnkleShackle(bin, S, un) {
  // JOINT REPAIR. r1 set the band at y -0.12 with a 0.16 major radius, which is
  // exactly where the cannon has already tapered to ~0.115 and the fetlock ball
  // (r 0.10, y -0.22) has not yet begun -- so the band floated off the leg on
  // one side and punched a hard seam through the shin on the other, with the
  // pastern flap projecting laterally into empty space. The band is pulled up
  // to the widest part of the cannon and given a sleeve collar under it, so it
  // sits ON the leg the way an iron band actually would.
  bin.add(mesh(sleeve(0.132, 0.146, 0.075, { radialSeg: 14, bulge: 0.035 }), S.hide, 0.005, -0.115, 0))
  bin.add(mesh(filletRing(0.148, 0.030, 7, 18), S.shackle, 0.005, -0.082, 0))
  bin.add(mesh(filletRing(0.152, 0.010, 5, 16), S.hideDeep, 0.005, -0.052, 0))
  const n = un ? 2 : 3
  for (let i = 0; i < n; i++) {
    const y = -0.03 + i * 0.075
    const m = mesh(filletRing(0.045, 0.012, 5, 10), S.shackle, -0.085, y, 0)
    if (i % 2) rot(m, PI / 2, 0, 0)
    bin.add(m)
  }
  if (un) {
    // the torn terminal link: a C-shape whose break is the shiniest thing here
    bin.add(rot(mesh(splineTube([[-0.10, 0.09, -0.035], [-0.13, 0.125, 0], [-0.10, 0.09, 0.035]],
      0.012, 10, null, { radialSeg: 6, roundEnd: true, roundStart: true }), S.shackle), 0, 0, 0))
    bin.add(mesh(ball(0.014, 8), S.hot, -0.098, 0.086, 0.038))
    bin.add(mesh(ball(0.013, 8), S.hot, -0.098, 0.086, -0.038))
  }
}

/**
 * Three chunks of granite still fused into the bronze on the outer edge of each
 * hoof. Six primitives that say "he tore himself off his pedestal" with no
 * dialogue, no VFX and no cost. Deliberately faceted (e = 2.0, 8 segments) so
 * they read as fractured stone next to the smooth cast metal.
 */
function buildPlinthShards(bin, S, side) {
  const at = [[0.10, -0.40, 0.155], [-0.05, -0.44, 0.145], [0.16, -0.33, 0.125]]
  const sz = [[0.048, 0.040, 0.034], [0.036, 0.050, 0.030], [0.030, 0.028, 0.042]]
  for (let i = 0; i < 3; i++) {
    bin.add(rot(mesh(superellipsoid(sz[i][0], sz[i][1], sz[i][2], 2.0, 2.0, 6), S.plinth,
      at[i][0], at[i][1], at[i][2] * side), i * 0.7, i * 1.1, 0.3 + i * 0.4))
  }
}

// ---------------------------------------------------------------------------
// torso — an UPRIGHT OVAL barrel, 0.86 m deep against 0.78 m wide. Deep, not
// broad: that cross-section is the difference between "bull" and "gorilla".
// Built as one continuous loft so there is no seam and no interpenetration
// anywhere from the belly to the withers.
// ---------------------------------------------------------------------------
function barrelSection(y, depth, width, e, ox) {
  return { y, shape: superellipsePoints(depth, width, e, 16), offset: [ox, 0] }
}

function buildTorso(bin, S, gild) {
  bin.add(mesh(loft([
    barrelSection(0.04, 0.40, 0.44, 3.0, -0.02),   // tucked up inside the pelvis
    barrelSection(0.12, 0.58, 0.62, 3.0, -0.06),   // belly, world y 1.42
    barrelSection(0.28, 0.62, 0.66, 3.0, -0.03),   // flank / waist: a 30% taper
    barrelSection(0.46, 0.78, 0.75, 3.0, 0.00),
    barrelSection(0.58, 0.86, 0.78, 3.0, 0.01),    // deepest section, world 1.88
    barrelSection(0.74, 0.78, 0.72, 3.0, 0.00),
    barrelSection(0.88, 0.60, 0.62, 3.2, -0.02),   // withers
  ], { subdivide: 1, caps: true }), S.hide))

  // brisket: a distinct forward keel below the neck, 0.10 m past the shoulder
  // front, with a ridge down its centre. This is the anchor the throat wedge is
  // measured against — negative space #1 dies if it goes.
  bin.add(mesh(sel(0.13, 0.21, 0.19, 2.6, 2.6, 14), S.hide, 0.36, 0.54, 0))
  bin.add(mesh(splineTube([[0.46, 0.70, 0], [0.50, 0.55, 0], [0.44, 0.36, 0]], 0.018, 10, null,
    { radialSeg: 6 }), S.hideMid))

  // R4: the rib flanks are LATERAL planes, not upward-facing ones. In patinaMid
  // they put a 9.5%-luminance field across the widest silhouette mass on the
  // model, which is a large part of why the body metered at 25-35% on screen
  // instead of the brief's sub-10%. They go back to the hide value; only the
  // shoulder-top rub above them lifts.
  for (const side of [1, -1]) {
    bin.add(scl(mesh(sel(0.30, 0.24, 0.09, 3.0, 3.0, 14), S.hide, 0.06, 0.56, 0.34 * side), 1, 1, 1))
    // shoulder-top rub: tourists reach the crowns, and the crowns are exactly
    // the silhouette cues, so the eye is dragged straight to the read
    bin.add(rot(mesh(disc(0.14, 0.075, 0.018), S.rub, 0.02, 0.86, 0.24 * side), PI / 2, 0, 0.1))
  }

  // deep crevice value under the barrel + the ventral casting seam
  bin.add(mesh(sel(0.26, 0.06, 0.24, 3.0, 3.0, 12), S.hideDeep, -0.02, 0.09, 0))
  bin.add(mesh(splineTube([[0.30, 0.16, 0], [0.10, 0.07, 0], [-0.16, 0.11, 0]], 0.006, 12, null,
    { radialSeg: 5 }), S.hideMid))

  if (!gild) {
    verdStreak(bin, S, [[0.20, 0.52, 0.36], [0.16, 0.32, 0.34], [0.12, 0.16, 0.30]], 0.014)
    verdStreak(bin, S, [[-0.22, 0.60, 0.30], [-0.24, 0.40, 0.32], [-0.22, 0.20, 0.29]])
    verdStreak(bin, S, [[-0.20, 0.58, -0.32], [-0.23, 0.36, -0.33], [-0.20, 0.18, -0.30]], 0.013)
    verdStreak(bin, S, [[0.34, 0.44, -0.20], [0.30, 0.26, -0.22], [0.26, 0.12, -0.18]], 0.009)
  }
}

// ---------------------------------------------------------------------------
// neck, morrillo and dewlap — TORSO meshes, and the reason the head reads as
// lowered. The morrillo crown sits at world y 2.40, a full 0.20 m ABOVE the top
// of the skull. Break that one relationship and this is a generic buff minotaur.
// ---------------------------------------------------------------------------
function buildNeck(bin, S, gild) {
  // short and thick: 0.88 head-heights, leaving the torso 34 degrees forward
  bin.add(mesh(loft([
    barrelSection(0.44, 0.66, 0.54, 3.0, -0.20),
    barrelSection(0.56, 0.60, 0.50, 3.0, -0.12),
    barrelSection(0.68, 0.54, 0.44, 3.0, -0.03),
    barrelSection(0.78, 0.48, 0.38, 3.0, 0.04),
    barrelSection(0.86, 0.42, 0.34, 3.0, 0.09),
  ], { subdivide: 1, caps: true }), S.hide))

  // 4 transverse ventral folds — a thick-necked bull has rolls.
  // R4: these were in patinaMid, i.e. three LIGHT horizontal bands wrapped round
  // a dark neck, which is precisely the "grey ribbed neck column that reads as
  // corduroy or a vacuum hose" the critic found sitting in the throat wedge.
  // They are creases, so by the curvature rule they take the crevice value and
  // the neck goes back to being one continuous dark mass with shadow lines in it.
  const folds = [[0.17, 0.57], [0.23, 0.67], [0.27, 0.78]]
  for (const [fx, fy] of folds) {
    bin.add(mesh(splineTube([[fx - 0.03, fy, -0.15], [fx, fy - 0.01, 0], [fx - 0.03, fy, 0.15]],
      0.020, 10, null, { radialSeg: 6 }), S.hideDeep))
  }

  // MORRILLO — the crest hump. Two lobes either side of a shallow dorsal
  // midline groove, steep on the front face (which is what makes the skull look
  // driven down beneath it) and shallow on the back.
  // sel() not superellipsoid(): these two lobes are the crown of the character
  // and they carried r1's visible 4-fold spherical-UV kaleidoscope pinwheel.
  for (const side of [1, -1]) {
    bin.add(mesh(sel(0.23, 0.16, 0.152, 3.2, 3.0, 18), S.hideMid, -0.02, 0.94, 0.135 * side))
    // the polished crest strip: rub zone 4 of 6, and the surface the cyan rim
    // light is specified to trace along the morrillo crown
    bin.add(mesh(splineTube([[-0.20, 1.055, 0.118 * side], [-0.02, 1.088, 0.132 * side],
      [0.14, 1.040, 0.120 * side]], 0.030, 14, (t) => lerp(0.020, 0.014, Math.abs(t - 0.5) * 2),
    { radialSeg: 6, aspect: 2.2 }), S.rub))
  }
  bin.add(mesh(sel(0.20, 0.13, 0.25, 3.0, 2.8, 16), S.hideMid, -0.22, 0.80, 0))
  bin.add(mesh(sel(0.26, 0.14, 0.34, 3.0, 3.0, 16), S.hide, 0.04, 0.80, 0))  // trapezius fill
  // FILLET COLLAR at the neck/skull junction. r1 met the collar plate to the
  // cranial masses along a hard z-seam with a razor material change and no
  // blend; this is the same trick buildHorns() already uses at the horn base.
  bin.add(mesh(sel(0.21, 0.19, 0.17, 3.0, 3.0, 16), S.hide, 0.075, 0.865, 0))
  bin.add(mesh(filletRing(0.185, 0.026, 6, 18), S.hideDeep, 0.075, 0.845, 0))
  if (!gild) {
    verdStreak(bin, S, [[-0.14, 0.94, 0.20], [-0.18, 0.78, 0.26], [-0.20, 0.62, 0.28]], 0.010)
  }

  // DEWLAP — the throat-line breaker and the slowest-settling secondary on the
  // model. Built as a vertical blade with a rolled bottom edge, hanging from the
  // neck's underside. It forms the TOP boundary of the throat wedge; the open
  // triangle below it must survive in every idle, walk, block and crouch pose.
  const dew = [
    0.365, 0.585, 0.250, 0.550, 0.130, 0.515, 0.010, 0.500,
    0.030, 0.420, 0.110, 0.360, 0.230, 0.338, 0.340, 0.442,
  ]
  bin.add(mesh(plate(dew, 0.115, 0.030, { crown: 0.022, faceSeg: 2, rimSeg: 2 }), S.hide))
  // 3 major transverse folds across the keel
  for (let i = 0; i < 3; i++) {
    const t = 0.22 + i * 0.28
    const x = lerp(0.33, 0.06, t), y = lerp(0.50, 0.44, t)
    // R4: hide, not patinaMid — three pale bands across a hanging keel read as
    // ribbed hose, exactly like the neck folds did.
    bin.add(mesh(splineTube([[x + 0.03, y + 0.055, -0.05], [x, y + 0.04, 0], [x + 0.03, y + 0.055, 0.05]],
      0.016, 8, null, { radialSeg: 5 }), S.hide))
  }
  bin.add(mesh(sel(0.16, 0.03, 0.07, 2.6, 2.6, 10), S.hideDeep, 0.16, 0.352, 0))
}

// ---------------------------------------------------------------------------
// the dedication plaque — bolted to the LEFT trapezius (asymmetry on purpose).
// A recessed dull-alloy field with raised letter forms whose tops have been
// rubbed bright: exactly how a real plaque ages, and the most "monument" thing
// on the model. The text is our own invention and carries no name, date, city
// or maker's mark (docs §9).
// ---------------------------------------------------------------------------
function buildPlaque(bin, S) {
  const g = new THREE.Group()
  g.position.set(0.00, 0.855, 0.305)
  g.rotation.set(0.12, 0, 0.18)
  g.add(mesh(plate(roundedRectPoints(0.16, 0.09, 0.012), 0.011, 0.004), S.alloy))
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) g.add(mesh(ball(0.006, 6), S.alloy, 0.066 * sx, 0.031 * sy, 0.007))
  }
  // two short rows of raised bar-forms — legible as lettering, readable as none
  const rows = [[0.020, [0.030, 0.018, 0.026, 0.014, 0.022]], [-0.014, [0.024, 0.030, 0.016, 0.028]]]
  for (const [ry, ws] of rows) {
    let x = -0.055
    for (const w of ws) {
      g.add(mesh(roundedBox(w, 0.014, 0.003, 0.0012, 1), S.rub, x + w / 2, ry, 0.0075))
      x += w + 0.008
    }
  }
  bin.add(g)
}

// ---------------------------------------------------------------------------
// molten seam network — an irregular branching crack system, inset into the
// surface so each crack has depth, NOT a row of glowing candlestick bars. The
// existing power-move scripts tint the whole network green through
// glowMarks(), which now means something: the boss runs orange-hot and turns
// green when the chart does.
// ---------------------------------------------------------------------------
function buildTorsoSeams(bin, S, mats, un) {
  const base = [
    [[0.42, 0.66, 0.02], [0.44, 0.56, -0.02], [0.42, 0.46, 0.03], [0.38, 0.36, 0.00]],
    [[0.40, 0.62, 0.09], [0.36, 0.52, 0.06], [0.34, 0.42, 0.10]],
    [[0.40, 0.60, -0.07], [0.37, 0.50, -0.05], [0.33, 0.40, -0.09]],
    [[0.36, 0.36, 0.02], [0.33, 0.26, 0.05], [0.29, 0.18, 0.02]],
  ]
  const wide = [
    [[0.30, 0.72, 0.28], [0.22, 0.58, 0.34], [0.12, 0.44, 0.33], [0.04, 0.30, 0.30]],
    [[0.28, 0.70, -0.30], [0.18, 0.56, -0.35], [0.08, 0.42, -0.33]],
    [[-0.12, 0.78, 0.22], [-0.20, 0.62, 0.28], [-0.24, 0.44, 0.26]],
    [[-0.10, 0.76, -0.24], [-0.18, 0.60, -0.29], [-0.22, 0.42, -0.27]],
    [[0.14, 0.86, 0.06], [0.20, 0.76, 0.10], [0.24, 0.66, 0.06]],
  ]
  const list = un ? base.concat(wide) : base
  list.forEach((pts, i) => addSeam(bin, pts, i === 0 ? 0.013 : 0.009, S,
    { seam: i === 0 ? mats.core : mats.seam }))
}

// ---------------------------------------------------------------------------
// the jacket — bone `coat`, which Gore pops at 70% damage. Leather, not cloth:
// it takes the rim light differently from the body and reads better over metal.
// Open front so the molten chest seams show through the gap, a rolled hem that
// is never a cut plane, a collar the morrillo goes OVER, and 5 modelled buckles
// with real strap tails.
// ---------------------------------------------------------------------------
function shellRing(rx, rz, thick, gap, seg = 16) {
  const pts = []
  const a0 = gap, a1 = TAU - gap
  for (let i = 0; i <= seg; i++) { const a = lerp(a0, a1, i / seg); pts.push(Math.cos(a) * rx, Math.sin(a) * rz) }
  for (let i = seg; i >= 0; i--) { const a = lerp(a0, a1, i / seg); pts.push(Math.cos(a) * (rx - thick), Math.sin(a) * (rz - thick)) }
  return pts
}

function buildJacket(bin, S, gild) {
  bin.add(mesh(loft([
    { y: 0.10, shape: shellRing(0.40, 0.42, 0.035, 0.30), offset: [-0.04, 0] },
    { y: 0.30, shape: shellRing(0.37, 0.40, 0.035, 0.26), offset: [-0.02, 0] },
    { y: 0.50, shape: shellRing(0.44, 0.425, 0.035, 0.23), offset: [0.00, 0] },
    { y: 0.64, shape: shellRing(0.47, 0.43, 0.035, 0.21), offset: [0.01, 0] },
    { y: 0.80, shape: shellRing(0.44, 0.41, 0.035, 0.22), offset: [0.00, 0] },
    { y: 0.90, shape: shellRing(0.35, 0.365, 0.035, 0.24), offset: [-0.02, 0] },
  ], { subdivide: 1, caps: true }), S.leather))

  // rolled hem, all round — 0.014 m of real edge
  const hem = []
  for (let i = 0; i <= 14; i++) {
    const a = lerp(0.30, TAU - 0.30, i / 14)
    hem.push([Math.cos(a) * 0.40 - 0.04, 0.10, Math.sin(a) * 0.42])
  }
  bin.add(mesh(splineTube(hem, 0.014, 20, null, { radialSeg: 6, roundEnd: true, roundStart: true }), S.leather))

  // collar: stands 0.10 proud at the back, folds down at the front
  bin.add(mesh(loft([
    { y: 0.845, shape: shellRing(0.34, 0.355, 0.030, 0.46), offset: [-0.02, 0] },
    { y: 0.905, shape: shellRing(0.36, 0.345, 0.030, 0.50), offset: [-0.05, 0] },
    { y: 0.945, shape: shellRing(0.33, 0.31, 0.030, 0.54), offset: [-0.07, 0] },
  ], { subdivide: 1, caps: true }), gild ? S.alloy : S.leatherWorn))

  // shoulder yoke + the 0.30-roughness wear patch on each crown
  for (const side of [1, -1]) {
    bin.add(rot(mesh(disc(0.17, 0.10, 0.030), S.leatherWorn, 0.00, 0.855, 0.30 * side), PI / 2, 0, 0.08))
  }

  // 5 buckles down the left front edge, each with a tongue and a strap tail
  for (let i = 0; i < 5; i++) {
    const y = 0.20 + i * 0.135
    const a = lerp(0.29, 0.22, i / 4)
    const x = Math.cos(a) * lerp(0.385, 0.455, i / 4) - 0.02
    const z = Math.sin(a) * lerp(0.41, 0.428, i / 4)
    bin.add(rot(mesh(roundedBox(0.018, 0.032, 0.050, 0.006, 2), S.alloy, x + 0.012, y, z), 0, 0, 0))
    bin.add(rot(mesh(roundedBox(0.014, 0.016, 0.070, 0.004, 2), S.leatherWorn, x - 0.004, y, z + 0.045), 0, 0, 0))
  }

  // 3 skirt panels — 2 front, 1 back. Spring chains with a +X wind bias, so
  // they flare on the charge and settle after.
  const panel = plate(roundedRectPoints(0.21, 0.24, 0.035), 0.026, 0.011, { taper: 0.25, rimSeg: 2 })
  for (const side of [1, -1]) {
    bin.add(rot(mesh(panel, S.leather, 0.30, -0.02, 0.24 * side), 0, PI / 2 + 0.35 * side, 0.12 * side))
  }
  bin.add(rot(mesh(panel, S.leather, -0.36, -0.02, 0), 0, PI / 2, 0))
}

// ---------------------------------------------------------------------------
// upper arm — a deltoid ball sleeved into the torso so no gap can open, a
// modelled triceps mass on the caudal side, and the rubbed deltoid crown that
// is one of the six places a public bronze goes bright.
// ---------------------------------------------------------------------------
function buildUpperArm(bin, S, mats, side, un) {
  const zi = -0.12 * side
  // R4: the deltoid BALL is a field, not a crown — the crown is the rubbed cap
  // 0.21 m above it. In patinaMid the whole shoulder mass, which is the widest
  // thing on the model, sat at 9.5% luminance.
  bin.add(mesh(sel(0.205, 0.250, 0.205, 2.9, 2.9, 18), S.hide, 0.00, 0.02, zi))
  // the sleeve back into the barrel: the shoulder joint can never show a seam
  bin.add(mesh(sel(0.185, 0.185, 0.15, 2.8, 2.8, 16), S.hide, 0.00, -0.02, -0.30 * side))
  // DELTOID CROWN — rub zone 5 of 6. r1 put a 0.115 x 0.07 lozenge here and it
  // crushed to black in every shot. It is now a domed cap covering most of the
  // deltoid's upper surface, in the hot rub family, because the shoulder block
  // is silhouette element #5 and the eye is supposed to stop here.
  bin.add(mesh(sel(0.150, 0.036, 0.150, 3.0, 3.0, 16), S.rub, 0.015, 0.232, zi))
  bin.add(mesh(sel(0.088, 0.020, 0.092, 3.0, 3.0, 14), S.rubHot, 0.020, 0.256, zi))
  bin.add(scl(mesh(taperedCapsule(0.185, 0.155, 0.20, 4, 13), S.hide, 0.01, -0.24, zi * 0.5), 1.05, 1, 1))
  bin.add(mesh(sel(0.125, 0.155, 0.125, 3.0, 3.0, 14), S.hide, -0.105, -0.27, zi * 0.5))
  // casting seam up the back of the arm
  bin.add(mesh(splineTube([[-0.15, -0.06, zi * 0.4], [-0.155, -0.24, zi * 0.5], [-0.13, -0.42, zi * 0.4]],
    0.006, 10, null, { radialSeg: 5 }), S.hideMid))
  bin.add(mesh(sleeve(0.16, 0.165, 0.08, { radialSeg: 12, bulge: 0.04 }), S.hide, 0.01, -0.50, zi * 0.4))
  addSeam(bin, [[0.15, -0.10, zi * 0.5], [0.17, -0.24, zi * 0.6], [0.14, -0.38, zi * 0.5]], 0.009, S, mats)
  addSeam(bin, [[-0.02, -0.14, 0.14 * side], [-0.05, -0.28, 0.15 * side], [-0.03, -0.40, 0.13 * side]], 0.008, S, mats)
}

// ---------------------------------------------------------------------------
// forearm and the cloven-hoof fist.
//
// THE BOSS DOES NOT HAVE FISTS. He has cloven hooves that close into fists: a
// heavy rounded mass with no readable knuckles, split by a vertical cleft, with
// two unequal claw plates flanking it as the contact surfaces and two dewclaw
// nubs on the ulnar side. Wrist sleeved with a collar so Gore._detachForearm
// leaves a clean bronze stump.
// ---------------------------------------------------------------------------
function buildForearm(bin, S, mats, side, un) {
  bin.add(mesh(jointBall(0.168, 12), S.hide, 0, 0.01, 0.038 * side))
  bin.add(scl(mesh(taperedCapsule(0.155, 0.128, 0.16, 4, 13), S.hide, 0.01, -0.16, 0.120 * side), 1.3, 1, 1))
  addSeam(bin, [[0.13, -0.08, 0.03], [0.15, -0.18, 0.02], [0.12, -0.28, 0.05]], 0.008, S, mats)

  // wrist: collar, then the shackle band 0.06 above the fist
  bin.add(mesh(sleeve(0.135, 0.148, 0.06, { radialSeg: 12, bulge: 0.05 }), S.hide, 0.01, -0.33, 0.132 * side))
  bin.add(mesh(filletRing(0.145, 0.030, 6, 16), S.shackle, 0.01, -0.30, 0.128 * side))
  const links = un ? 2 : 3
  for (let i = 0; i < links; i++) {
    const m = mesh(filletRing(0.042, 0.011, 5, 10), S.shackle, -0.10, -0.24 + i * 0.070, 0.100 * side)
    if (i % 2) rot(m, PI / 2, 0, 0)
    bin.add(m)
  }
  if (un) {
    bin.add(mesh(splineTube([[-0.10, -0.075, -0.032], [-0.128, -0.045, 0], [-0.10, -0.075, 0.032]],
      0.011, 10, null, { radialSeg: 6, roundEnd: true, roundStart: true }), S.shackle))
    for (const s2 of [1, -1]) bin.add(mesh(ball(0.013, 8), S.hot, -0.098, -0.072, 0.035 * s2))
  }

  // the fist mass
  const fy = -0.44, fz = 0.140 * side
  bin.add(mesh(roundedBox(0.30, 0.26, 0.30, 0.05, 4), S.hide, 0.03, fy, fz))
  // vertical cleft, 0.024 wide x 0.10 deep, running the full height of the face
  bin.add(mesh(roundedBox(0.10, 0.27, 0.024, 0.006, 1), S.cavity, 0.145, fy, fz))
  // two claw plates, the outer 8% larger, projecting 0.03 proud. Contact
  // surfaces, so they take the impact scuffing and they carry the knuckle rub.
  // KNUCKLES — rub zone 6 of 6. The claw plates are the contact surfaces, so
  // the polish sits on their whole striking face, not on a 5 cm token lozenge.
  for (const s2 of [1, -1]) {
    const sc = s2 === side ? 1.04 : 0.96
    bin.add(mesh(roundedBox(0.14 * sc, 0.20 * sc, 0.13 * sc, 0.028, 3), S.claw, 0.135, fy, fz + 0.075 * s2))
    bin.add(rot(mesh(disc(0.070 * sc, 0.044 * sc, 0.014, { crown: 0.006, seg: 14 }), S.rub,
      0.200, fy + 0.005, fz + 0.075 * s2), 0, PI / 2, 0))
    bin.add(rot(mesh(disc(0.034 * sc, 0.019 * sc, 0.009, { crown: 0.004, seg: 12 }), S.rubHot,
      0.207, fy + 0.038, fz + 0.075 * s2), 0, PI / 2, 0))
  }
  // dewclaw nubs on the ulnar side, set back from the striking face
  for (const s2 of [1, -1]) {
    bin.add(rot(mesh(roundedCone(0.024, 0.007, 0.05, 0.007, 8, 2), S.claw,
      -0.035, fy + 0.055 * s2, fz + 0.148 * side), 0, 0, PI / 2 * side))
  }
  bin.add(mesh(filletRing(0.135, 0.010, 5, 14), S.hideDeep, 0.02, fy + 0.135, fz * 0.8))
}

// ===========================================================================
// THE HEAD
//
// All of §3 is built in SKULL-LOCAL space: the frame of the static
// bent(head, -0.59) wrapper, origin at the poll/atlas joint (world 0.05, 2.12),
// +X forward along the skull's long axis, +Y dorsal, +Z lateral. The wrapper is
// what makes the animated `head` bone's bind pose (0,0,0) while the skull hangs
// 34 degrees below horizontal.
// ===========================================================================

/**
 * The skull: NOT a box. Two planes meeting at a break — a quadrangular cranium
 * carrying the horn cores at its caudo-lateral corners, and a facial wedge
 * tapering from 0.36 m wide at the eye line to 0.245 at the nose, whose dorsal
 * line makes a 13-degree downward BREAK with the cranium at the stop. That
 * break is the difference between a bull and a deer.
 *
 * Built as one loft stacked along its own +Y and then rotated a quarter turn,
 * so section coordinate 1 is dorsoventral depth and coordinate 2 is lateral
 * width — one continuous surface from occiput to nose, no seam, no gap.
 */
function skullSection(x, depth, width, e, drop) {
  return { y: x, shape: superellipsePoints(depth, width, e, 14), offset: [drop, 0] }
}

function buildSkull(bin, S) {
  // THE 13-DEGREE STOP BREAK — r2 shipped it as a 0.026 m total drop across the
  // whole wedge, i.e. 3.7 degrees, which is why the profile read as ONE STRAIGHT
  // BOX from poll to nose. Plane A (occiput -> the stop at 0.30) is dead flat;
  // Plane B descends 0.090 m over the following 0.40 m, which is exactly 13
  // degrees. The break itself gets a 0.008 m filleted crease below, so it is a
  // hard-ISH edge and not a smooth blend. That break is the difference between
  // a bull and a deer.
  bin.add(mesh(rotated(loft([
    skullSection(-0.09, 0.200, 0.300, 3.4, 0.000),   // occiput
    skullSection(0.02, 0.245, 0.380, 3.4, 0.000),   // poll / cranium
    skullSection(0.16, 0.270, 0.420, 3.4, 0.000),   // widest: cheeks 0.42
    skullSection(0.30, 0.260, 0.360, 3.2, 0.004),   // the stop / eye line
    skullSection(0.38, 0.250, 0.330, 3.0, 0.022),   // ---- 13 deg break ----
    skullSection(0.54, 0.230, 0.280, 3.0, 0.058),   // nasal
    skullSection(0.70, 0.200, 0.245, 3.0, 0.094),   // nose
  ], { subdivide: 1, caps: true }), 0, 0, -PI / 2), S.hide))
  // the crease at the stop: a 0.008 m fillet running across the wedge, with the
  // patina going chalky-dark in it. Every edge on the wedge is a real fillet —
  // docs §3.1 forbids a raw polygon boundary anywhere on this head.
  bin.add(mesh(splineTube([[0.335, 0.108, -0.150], [0.342, 0.124, -0.070], [0.344, 0.128, 0],
    [0.342, 0.124, 0.070], [0.335, 0.108, 0.150]], 0.008, 14, null, { radialSeg: 6 }), S.hideDeep))
  // and the two long vertical fillets down the wedge's lateral corners, which
  // r2 left as raw unbevelled polygon boundaries visible at 30 cm
  for (const side of [1, -1]) {
    bin.add(mesh(splineTube([[0.360, 0.020, 0.163 * side], [0.500, -0.030, 0.146 * side],
      [0.640, -0.086, 0.128 * side], [0.720, -0.120, 0.112 * side]],
    0.011, 16, (t) => lerp(0.012, 0.008, t), { radialSeg: 6 }), S.hide))
  }

  // THE FRONTAL PLATE — a slightly convex quadrangular shield, tilted so that
  // once the bind pitch is applied it faces the opponent. This is the plate a
  // hit lands on and it is the front half of the 2-second read. -1.03 puts its
  // normal 31 deg above the skull's forward axis, which nets to ~6 deg above
  // world horizontal at the new 25-deg pitch.
  bin.add(rot(mesh(sel(0.140, 0.032, 0.176, 4.0, 4.5, 18), S.hide, 0.258, 0.048, 0),
    0, 0, -1.03))
  // the intercornual protuberance: highest bone landmark on the skull, and the
  // ridge the polished rub mask keys off. R4: it was IN raw hide, which broke the
  // rub chain across the top of the head -- the crown was bright, the horn bases
  // were bright (now), and the swell between them was dark, so the three read as
  // three unrelated patches instead of one continuous burnished band.
  bin.add(mesh(sel(0.062, 0.046, 0.136, 3.0, 2.6, 14), S.hide, 0.06, 0.104, 0))
  bin.add(mesh(sel(0.048, 0.020, 0.118, 3.0, 2.6, 14), S.rub, 0.062, 0.132, 0))
  bin.add(mesh(sel(0.030, 0.012, 0.070, 3.0, 2.6, 12), S.rubHot, 0.062, 0.144, 0))
  // FOREHEAD CROWN — rub zone 3 of 6. Doubled in area over r1 and pushed to the
  // hot end of the rub family: this is the second-brightest thing on the head
  // and it has to be visible in a 128 px silhouette read.
  bin.add(rot(mesh(sel(0.104, 0.017, 0.132, 3.0, 3.0, 16), S.rubHot, 0.286, 0.099, 0),
    0, 0, -1.03))
  bin.add(rot(mesh(sel(0.058, 0.013, 0.150, 3.4, 3.0, 14), S.rub, 0.156, 0.118, 0),
    0, 0, -0.78))

  // the two frontal furrows: vertical grooves converging downward at 14 deg.
  // Cattle have no mobile brow — this and the orbital-rim tilt ARE the scowl.
  for (const side of [1, -1]) {
    bin.add(mesh(splineTube([[0.296, 0.130, 0.048 * side], [0.328, 0.122, 0.038 * side],
      [0.360, 0.106, 0.028 * side]], 0.008, 8, null, { radialSeg: 5 }), S.hideDeep))
    // supraorbital groove: a real skull feature that does the heavy-brow work
    bin.add(mesh(splineTube([[0.335, 0.114, 0.150 * side], [0.240, 0.128, 0.160 * side],
      [0.125, 0.128, 0.158 * side]], 0.008, 8, null, { radialSeg: 5 }), S.hideDeep))
    // masseter: the cheek mass, 0.05 proud. Soft-body jiggle target. R4: hide,
    // not patinaMid — a cheek is a lateral plane and the critic read it as the
    // same mid-green as the pauldron, forearm, thigh and ear.
    bin.add(mesh(sel(0.104, 0.092, 0.052, 3.0, 3.0, 14), S.hide, 0.225, -0.050, 0.185 * side))
  }

  // the nasal dorsum: straight lengthwise, strongly curved side to side, so the
  // top of the wedge is a gentle barrel and never a flat. Now follows the 13 deg
  // break down, which is what makes the break visible in profile.
  bin.add(mesh(splineTube([[0.395, 0.100, 0], [0.550, 0.054, 0], [0.700, 0.006, 0]],
    0.013, 12, null, { radialSeg: 7 }), S.hideMid))

  // NOSE PAD — rub zone 1 of 6, and the single brightest element on the head.
  // A flattened cushion bulging proud of the wedge's front face, with a hot
  // crown cap on the top 15% of its area. On a real rubbed public bronze this
  // is the first thing a hand touches and the first thing an eye finds.
  bin.add(mesh(sel(0.062, 0.092, 0.120, 2.6, 3.2, 20), S.rub, 0.742, -0.080, 0))
  bin.add(rot(mesh(sel(0.030, 0.016, 0.080, 2.8, 3.0, 14), S.rubHot, 0.766, -0.030, 0), 0, 0, -0.55))
  // the rolled edge where the pad meets the wedge — the pad is a cushion set
  // INTO the muzzle, not a lozenge glued on
  bin.add(rot(mesh(filletRing(0.098, 0.009, 5, 20), S.hideDeep, 0.706, -0.078, 0), 0, 0, PI / 2))
  // NOSTRILS — real cavities, not decals. r2 built two convex superellipsoid
  // BLOBS sitting proud of the gold pad, which is why they read as two flat
  // black stickers and the muzzle did not read as a face at 1 m. Each nostril
  // is now three parts:
  //   (a) a raised alar rim torus, so the opening has a lip that catches light;
  //   (b) a CONCAVE dish (negative crown -> plate() dishes both faces inward)
  //       flush with the pad, canted 35 deg from vertical, kidney-outlined;
  //   (c) a 0.030 m deep cone running back INTO the head behind the dish, so
  //       the hole has real parallax depth as the camera moves rather than
  //       going flat the instant you are off-axis.
  // Interior is BULL_HORN_TIP at roughness 0.30 — the darkest albedo on the
  // model, and the only true holes on it.
  for (const side of [1, -1]) {
    const nz = 0.062 * side, ny = -0.093, nx = 0.788
    const cant = 0.61 * side                    // 35 deg from vertical
    bin.add(rot(mesh(filletRing(0.030, 0.0075, 5, 16), S.rub, nx - 0.004, ny, nz), 0, 0, PI / 2 + cant * 0.35))
    bin.add(rot(mesh(disc(0.030, 0.020, 0.010, { crown: -0.011, seg: 14 }), S.cavity, nx, ny, nz),
      cant, PI / 2, 0))
    bin.add(rot(mesh(roundedCone(0.026, 0.006, 0.030, 0.005, 10, 1), S.cavity, nx - 0.020, ny - 0.004, nz),
      cant, 0, PI / 2))
  }
  // philtrum: 0.014 wide x 0.010 deep, nostril gap straight down to the lip
  bin.add(mesh(splineTube([[0.788, -0.123, 0], [0.776, -0.149, 0], [0.758, -0.171, 0]],
    0.007, 6, null, { radialSeg: 5 }), S.cavity))
  // asymmetric chip 3 of 3 — the LEFT side of the muzzle. Never mirrored.
  chip(bin, S, 0.600, -0.104, 0.130, 0.3, 0.9, 0.4, 0.032)
}

/**
 * Eyes — there were none at all before this, only a visor bar.
 *
 * Bovine eyes sit laterally and high, at the caudo-lateral corner of the
 * frontal plate, ringed by a bony orbit that stands PROUD of the skull. At
 * 128 px the eyeball is 3 px and the proud rim is 5 px, so the rim is what
 * actually reads — it is built first and lit hardest.
 *
 * Optical axis diverges 38 degrees off the midline. Anatomically it would be
 * ~58, but at 58 the game camera never sees both eyes and he cannot look at his
 * opponent. Documented deliberate cheat (docs §9 D10); never go below 32.
 */
function buildEyes(bin, S) {
  // R2 SCALE-UP. r1 built an anatomically correct 7.2 cm eyeball on a 2.50 m
  // figure and it vanished at every distance: a black almond hole with no
  // sclera, no iris glow and no catchlight. The eyeball is now 0.144 m across
  // (2x), the lids are opened from 32%/15% to 15%/8%, and the iris/cornea/
  // catchlight stack is sized so the eye is the brightest, highest-contrast
  // element on the whole character. That is deliberately NOT anatomical -- it
  // is the same trade every readable game face makes.
  const R = 0.062                             // eyeball radius
  for (const side of [1, -1]) {
    const e = pivot(bin, 0.352, 0.018, 0.176 * side)
    e.rotation.y = -0.663 * side              // 38 deg divergence (docs §9 D10)
    e.rotation.z = 0.10                       // lift the optical axis to camera height
    e.add(mesh(triUV(ball(R, 18), 0.24), S.sclera))
    // THE IRIS CARRIES THE EYE, NOT THE SCLERA. An opaque cornea cap over a
    // small iris is what turns a game eye into a white ping-pong ball -- the
    // sclera wins the value fight and the character reads googly. So there is
    // no cornea CAP here: the iris is 0.104 m across (72% of the eyeball),
    // emissive amber, sitting proud, with a horizontal-slit pupil on it and a
    // thin glass limbus ring for the wet edge. Sclera survives only as the
    // crescent around it, which is exactly the bovine stress signal §3.4 wants.
    // IRIS — docs §3.4 layer 2, at the brief's faint 1.25 intensity, not r2's
    // 1.9 headlight. 40 radial fibre spokes are real geometry here (a normal
    // map cannot be authored per-mesh from a character file), each a 0.0008 m
    // sliver, so the iris breaks up under a moving light instead of reading as
    // one flat pale-yellow disc.
    const irisR = R * 0.62
    e.add(rot(mesh(disc(irisR, irisR, 0.010, { crown: 0.007, seg: 20 }), S.iris, R * 0.845, 0, 0), 0, PI / 2, 0))
    // R4: 22 spokes, not 40. The visor now covers the upper 80% of each orbit,
    // so half of the striation was 1,760 triangles of geometry nobody can see;
    // 22 still breaks the iris up under a moving light in the visible crescent.
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU
      e.add(rot(mesh(roundedBox(0.0018, irisR * 0.74, 0.0028, 0.0006, 1), S.limbus,
        R * 0.862, Math.sin(a) * irisR * 0.50, Math.cos(a) * irisR * 0.50), a, PI / 2, 0))
    }
    // PUPIL — the 3:1 horizontal slit with rounded ends. 0.030 x 0.010 at the
    // brief's eyeball; scaled with R.
    e.add(rot(mesh(disc(irisR * 0.67, irisR * 0.22, 0.008, { crown: 0.004, seg: 16 }), S.pupil,
      R * 0.905, 0, 0), 0, PI / 2, 0))
    // LIMBUS: the dark wet ring at the iris edge.
    e.add(rot(mesh(filletRing(irisR * 1.02, 0.005, 5, 20), S.limbus, R * 0.855, 0, 0), 0, 0, -PI / 2))
    // CORNEA — docs §3.4 layer 1, and the layer r2 deleted. A real 130-degree
    // cap of a sphere 4% larger than the eyeball, clearcoat 1.0 at roughness
    // 0.04-equivalent: THIS is the one crisp specular dot the critic could not
    // find anywhere on either eye. It is 22% opaque, so it reads as wet glass
    // over the iris rather than as a grey film on it.
    e.add(rot(mesh(sphZone(R * 1.04, 0.004, -1.13, 1.13, TAU * 0.62, 18), S.cornea), 0, 0, -PI / 2))
    // and the belt-and-braces catchlight: a real emissive bead on the cornea's
    // upper-outer quadrant. The clearcoat lobe depends on where the arena's key
    // light happens to be; this does not, so exactly one hard white dot per eye
    // survives tonemapping, bloom and downsampling to 128 px.
    // R4: the primary bead moves to the LOWER-outer quadrant. The visor now sits
    // over the upper 80% of each orbit (docs §1 — it is a visor, not a headband),
    // so a catchlight on the upper-outer quadrant is a catchlight nobody can see.
    // The one guaranteed hard dot per eye has to live in the crescent that reads
    // out under the visor's lower lip.
    e.add(mesh(ball(0.0090, 10), S.catchlight, R * 0.99, -R * 0.34, R * 0.30))
    e.add(mesh(ball(0.0042, 8), S.catchlight, R * 1.00, -R * 0.18, -R * 0.30))
    // the orbital rim — proud bony ring, 1.6x the eyeball, with a fillet where
    // it meets the plate. THIS is the shape that holds the read at distance.
    e.add(rot(mesh(filletRing(0.094, 0.019, 6, 20), S.hide, 0.010, 0, 0), 0, 0, -PI / 2))
    e.add(rot(mesh(filletRing(0.106, 0.012, 5, 16), S.hideDeep, -0.012, 0, 0), 0, 0, -PI / 2))
    // the polished upper-outer arc of the rim: the 5 px that actually reads at
    // gameplay distance, and one of the burnished rub zones
    e.add(rot(mesh(splineTube([[0.026, 0.050, -0.066], [0.038, 0.082, 0.004], [0.028, 0.048, 0.068]],
      0.010, 12, null, { radialSeg: 5 }), S.rub), 0, 0, 0))

    // LIDS — spherical zones of the SAME ball, so they slide on the eye and
    // cannot gap (see sphZone). Idle coverage 32% upper / 15% lower (docs
    // §3.4), which puts the upper margin at latitude asin(1 - 2*0.32) = 21 deg
    // and the lower at -44 deg. Each carries a 0.004 m rolled margin torus.
    const marg = (cov) => Math.asin(Math.max(-0.95, Math.min(0.95, 1 - 2 * cov)))
    const upA = marg(0.32), loA = -marg(0.15)
    e.add(rot(mesh(sphZone(R * 1.045, 0.008, upA, PI / 2 - 0.02, PI * 1.16, 20), S.lid), 0, 0, -PI / 2))
    e.add(rot(mesh(sphZone(R * 1.045, 0.008, -PI / 2 + 0.02, loA, PI * 1.16, 20), S.lid), 0, 0, -PI / 2))
    // the rolled lid margins: 0.004 m beads on the exact latitude circles above
    e.add(rot(mesh(filletRing(R * 1.05 * Math.cos(upA), 0.0042, 5, 18), S.lidRim,
      R * 1.05 * Math.sin(upA), 0, 0), 0, 0, -PI / 2))
    e.add(rot(mesh(filletRing(R * 1.05 * Math.cos(loA), 0.0038, 5, 18), S.lidRim,
      R * 1.05 * Math.sin(loA), 0, 0), 0, 0, -PI / 2))
    // 7 tapered lashes standing 25 deg off the upper margin — a real and very
    // visible bovine trait that costs nothing at 30 cm
    for (let i = 0; i < 7; i++) {
      const t = (i / 6 - 0.5) * 2
      const az = t * 0.85
      const cy = R * 1.05 * Math.sin(upA), cr = R * 1.05 * Math.cos(upA)
      e.add(rot(mesh(roundedCone(0.0044, 0.0009, 0.024, 0.0011, 5, 1), S.lidRim,
        cr * Math.cos(az) + 0.004, cy + 0.010, cr * Math.sin(az)), 0, 0, -0.40 - az * 0.12))
    }
  }
}

/**
 * Jaw and mouth. Closed mouth 0.20 wide, corners DOWN-TURNED 8 degrees (a set
 * line, not a frown), with a 6 mm crease continuing back under each eye. Real
 * mandible under a gum shell on its own pivot — no clip keys it, so it hinges
 * from the head mesh subtree.
 *
 * Cattle have NO upper incisors: six lower incisors and a dental pad where the
 * uppers would be. Cheap, high-specificity, and almost nobody gets it right.
 */
function buildJaw(bin, S) {
  // R3: r2's mandible sat at pivot y -0.060 with 0.010-0.028 drops, which put
  // the WHOLE jaw solid INSIDE the facial wedge — every part of it, including
  // the mouth line, the incisors and the dental pad, was buried under the
  // muzzle geometry. That is why the critic reported "the head goes straight
  // from nose pad to nose ring": there was no mouth on screen because the mouth
  // was inside the skull. The pivot drops to -0.160 and the section drops now
  // track the wedge's own 13-degree descent, so the jaw hangs BELOW the wedge
  // and the two meet along a visible lip line.
  const jaw = pivot(bin, -0.10, -0.160, 0)
  jaw.name = 'mandible'
  jaw.add(mesh(rotated(loft([
    skullSection(0.24, 0.120, 0.300, 3.0, 0.026),
    skullSection(0.48, 0.110, 0.250, 3.0, 0.044),
    skullSection(0.66, 0.100, 0.215, 3.0, 0.066),
    skullSection(0.80, 0.084, 0.178, 3.0, 0.072),
  ], { subdivide: 1, caps: true }), 0, 0, -PI / 2), S.hide))

  // THE MOUTH SLOT — docs §3.3. 0.20 m of visible slot (corners at z = ±0.10),
  // corners DOWN-TURNED 8 degrees off the centre, plus the 6 mm crease
  // continuing 0.09 m back on each side toward a point below the eye. It is a
  // real recessed dark tube, so it reads as a shut mouth and not as a scratch.
  for (const side of [1, -1]) {
    jaw.add(mesh(splineTube([[0.800, -0.026, 0], [0.782, -0.030, 0.052 * side],
      [0.734, -0.040, 0.100 * side]], 0.011, 12, null, { radialSeg: 6 }), S.cavity))
    jaw.add(mesh(splineTube([[0.734, -0.040, 0.100 * side], [0.660, -0.032, 0.112 * side],
      [0.578, -0.018, 0.116 * side]], 0.006, 10, (t) => lerp(0.007, 0.003, t),
    { radialSeg: 5 }), S.hideDeep))
  }
  // lower lip projecting 0.03 proud of the upper, which overhangs it by 0.008
  // at the centre — that overhang is the shadow line under the nose pad
  jaw.add(mesh(sel(0.036, 0.030, 0.086, 2.6, 2.6, 14), S.hide, 0.806, -0.052, 0))
  jaw.add(rot(mesh(filletRing(0.070, 0.008, 5, 16), S.hideDeep, 0.792, -0.054, 0), 0, 0, PI / 2))
  // CHIN / MANDIBLE DEPTH: 0.14 m from the mouth line to the bottom of the jaw,
  // square and deep, with the two masseter tails running back under the cheeks
  jaw.add(mesh(sel(0.086, 0.062, 0.088, 3.2, 3.0, 16), S.hide, 0.746, -0.106, 0))
  for (const side of [1, -1]) {
    jaw.add(mesh(sel(0.110, 0.068, 0.052, 3.0, 3.0, 14), S.hide, 0.470, -0.052, 0.104 * side))
  }
  // dental pad (cattle have NO upper incisors) + the six lower incisors
  jaw.add(mesh(superellipsoid(0.020, 0.012, 0.070, 2.6, 2.6, 12), S.gum, 0.796, -0.014, 0))
  for (let i = 0; i < 6; i++) {
    const z = (i - 2.5) * 0.023
    jaw.add(mesh(roundedBox(0.014, 0.020, 0.020, 0.004, 2), S.bone, 0.792, -0.030, z))
  }
  jaw.add(mesh(superellipsoid(0.070, 0.014, 0.045, 2.6, 2.6, 10), S.tongue, 0.724, -0.032, 0))
}

/**
 * HORNS — the single most important geometry on the model, and previously one
 * cylinder plus a 5-sided cone per side.
 *
 * Typology (Spanish fighting-bull breeding vocabulary, docs §3.7): a CORNIGORDO
 * base — thick, 0.085 m across — reducing gradually through the pala to an
 * ASTIFINO tip at 0.010 m, on a wide, well-separated VELETO-leaning span. Never
 * GACHO (drooping).
 *
 * Three segments: out almost purely laterally, then a forward sweep with lift,
 * then a tip that continues forward, rises and converges 12 degrees inward —
 * goring geometry. Tips finish at world (0.92, 2.26, +-0.575): a 1.15 m span,
 * 2.7x the head width, 0.23 m AHEAD of the nose. That forward reach is the
 * geometric reason the horns clear the body outline at every camera angle
 * except dead-on rear, and it is not optional.
 *
 * Cross-section is a 1.25:1 oval twisting 90 degrees along the length, which is
 * what makes a horn look grown rather than turned; 5 growth rings on the basal
 * third come free out of the radius law.
 */
function hornPath(side) {
  return [
    [0.040, 0.118, 0.150 * side],   // base, caudo-lateral corner of the plate
    [0.020, 0.104, 0.410 * side],   // mazorca: 82 deg lateral, barely any lift
    [0.200, 0.252, 0.586 * side],   // pala: the sweep starts
    [0.462, 0.402, 0.606 * side],
    [0.685, 0.554, 0.575 * side],   // piton: converging inward 12 deg
  ]
}

// R4 ENDPOINT SNAP. r3's tip sat at skull-local (0.715, 0.612), which the -0.52
// bind bend maps to world (0.975, 2.296, +-0.592): 5.5 cm too far forward, 3.6 cm
// too high and a 1.184 m span. The brief's endpoint is exact and load-bearing --
// world (0.92, 2.26, +-0.575), a 1.15 m span, 0.27 m AHEAD of the nose pad and
// 0.03 m above the poll -- because that forward reach is the geometric reason
// the crossbar clears the body outline at every camera angle. Inverting the bind
// rotation gives skull-local (0.685, 0.554); p[3] was pulled back proportionally
// so the pala keeps its curvature instead of kinking at the last control point.

// HORN GAUGE. r1 used a 0.0425 m base radius -- an 8.5 cm DIAMETER horn against
// a 1.18 m tip-to-tip span. At that gauge they read as gold cables or insect
// antennae, and the single highest-value silhouette cue on the character (read
// cue #1, the horn crossbar) collapsed at 128 px. 0.085 m base radius is a
// 17 cm diameter cornigordo base -- roughly the mass a real fighting bull's
// horn carries at the skull -- tapering on pow(t, 0.85) to an astifino point.
const HORN_R0 = 0.085
const HORN_R1 = 0.008

function buildHorns(bin, S) {
  for (const side of [1, -1]) {
    const p = hornPath(side)
    bin.add(mesh(splineTube(p, HORN_R0, 38, (t) => {
      const base = lerp(HORN_R0, HORN_R1, Math.pow(t, 0.85))
      // 7 shallow toroidal growth rings on the basal third, spacing tightening
      // toward the pala. Real horn has annual rings and they read at 30 cm.
      const ring = t < 0.34 ? 0.0042 * Math.pow(Math.sin(t * 62), 2) * (1 - t / 0.34) : 0
      return base + ring
    }, { radialSeg: 10, aspect: 1.25, twist: PI / 2, roundEnd: true }), S.horn))

    // the last 0.06 m goes near-black. A dark point on a polished bronze horn
    // is what makes the point LOOK sharp at distance.
    const a = p[3], b = p[4]
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const tipStart = [b[0] - d[0] * 0.30, b[1] - d[1] * 0.30, b[2] - d[2] * 0.30]
    bin.add(mesh(splineTube([tipStart, b, [b[0] + d[0] * 0.02, b[1] + d[1] * 0.02, b[2] + d[2] * 0.02]],
      0.016, 8, (t) => lerp(0.017, 0.005, t), { radialSeg: 7, aspect: 1.15, roundEnd: true }), S.hornTip))

    // THE POLISHED UPPER CURVE — rub zone 2, and the R4 fix for the critic's
    // "rub mask exists in exactly one place, the nose pad". r3 started this strip
    // at p[1], i.e. 0.26 m out along the horn, so the whole BASE of the horn --
    // the part a hand actually reaches on a public bronze, and the part that
    // touches the frontal crown -- stayed unrubbed patina and the two brightest
    // zones on the head never joined up. It now starts ON the base and runs the
    // full arc, widest over the mazorca where the hands are.
    bin.add(mesh(splineTube([
      [p[0][0] + 0.014, p[0][1] + 0.052, p[0][2] * 0.94],
      [p[1][0] + 0.030, p[1][1] + 0.058, p[1][2]],
      [p[2][0] + 0.020, p[2][1] + 0.050, p[2][2]],
      [p[3][0] - 0.010, p[3][1] + 0.034, p[3][2]],
      [p[4][0] - 0.030, p[4][1] + 0.018, p[4][2]],
    ], 0.016, 20, (t) => lerp(0.026, 0.005, Math.pow(t, 0.8)), { radialSeg: 5, aspect: 1.6 }), S.rub))
    // and the hot crown on the top ~15% of the rub, over the mazorca only
    bin.add(mesh(splineTube([
      [p[0][0] + 0.020, p[0][1] + 0.070, p[0][2] * 0.96],
      [p[1][0] + 0.034, p[1][1] + 0.076, p[1][2] * 0.99],
      [p[1][0] + 0.090, p[1][1] + 0.098, p[1][2] * 1.05],
    ], 0.010, 12, (t) => lerp(0.013, 0.006, t), { radialSeg: 5, aspect: 1.8 }), S.rubHot))
    // BURNISHED BASE COLLAR. The horn base is one of the six named rub zones and
    // r3 had it in raw hide, which is also where the critic found "a hard black
    // gap where they enter the skull".
    bin.add(rot(mesh(filletRing(0.098, 0.014, 6, 18), S.rub, p[0][0], p[0][1] + 0.004, p[0][2] * 0.95),
      PI / 2, 0, 0.30 * side))

    // fillet collar: the hide visibly rolling 0.015 up onto the horn base, plus a
    // 0.010 m fillet ring UNDER it closing the socket. A horn that just pokes out
    // of a hole reads as glued on, and an open socket reads as a modelling bug.
    bin.add(mesh(triUV(jointBall(0.086, 12), 0.34), S.hide, p[0][0] - 0.004, p[0][1] - 0.014, p[0][2] * 0.92))
    bin.add(rot(mesh(filletRing(0.088, 0.010, 5, 16), S.hideDeep, p[0][0] - 0.010, p[0][1] - 0.026, p[0][2] * 0.90),
      PI / 2, 0, 0.30 * side))
    // asymmetric chip 1 of 3 — the LEFT horn's mid-curve only
    if (side === 1) chip(bin, S, 0.215, 0.262, 0.585, 0.4, 0.2, 1.1, 0.038)
  }
}

/**
 * The nose ring. Real bull rings are 8-13 cm across, made as a pair of hinged
 * semicircles held shut by a small brass bolt, set through the nasal septum.
 * Ours is 110 mm — the top of the real range, scaled for a boss.
 *
 * It hangs in the XY plane so the game's 3/4 camera always sees a full circle;
 * a ring seen edge-on is invisible. The BOLT is the detail that makes it read
 * as cattle husbandry hardware rather than as jewellery, and the alloy is
 * deliberately a different, duller, warmer metal from the hide — matched to the
 * nose it would simply disappear.
 */
function buildNoseRing(p, S) {
  // "The joke in one object." r1 built it correctly and it was invisible in
  // every shot, because the muzzle was pointing at the floor and the ring is
  // 0.011 m of dull alloy against a 60%-metal black head. It is now 0.070 m
  // major radius (140 mm -- above the real 8-13 cm husbandry range, which is a
  // deliberate boss-scale exaggeration) at 0.016 minor, with the top arc in the
  // burnished rub family so it separates from the hide instead of matching it.
  p.add(rot(mesh(filletRing(0.070, 0.016, 8, 22), S.alloy, 0, -0.070, 0), PI / 2, 0, 0))
  p.add(mesh(splineTube([[-0.048, -0.038, 0], [0, -0.014, 0], [0.048, -0.038, 0]],
    0.010, 14, null, { radialSeg: 5 }), S.rub))
  // hex bolt boss at 6 o'clock — the detail that makes it read as cattle
  // husbandry hardware rather than as jewellery
  p.add(rot(mesh(roundedCylinder(0.014, 0.020, 0.004, 6, 1), S.alloy, 0, -0.142, 0), PI / 2, 0, 0))
  p.add(mesh(triUV(ball(0.017, 10), 0.08), S.rub, 0, -0.140, 0))
  // hinge line at 12 o'clock
  p.add(rot(mesh(roundedBox(0.005, 0.007, 0.034, 0.0015, 1), S.hornTip, 0, 0.001, 0), 0, 0, 0))
}

/**
 * The visor — bone `glasses`, which Gore pops at the 70% accessory threshold,
 * revealing the eyes early. That is sanctioned: it is a feature.
 *
 * A wraparound band across the frontal plate at the eye line: an outer brushed
 * frame shell with a rolled top and bottom lip, and an inset lens carrying an
 * 11-segment jagged RISING CHART LINE. A chart, never a logo, never lettering,
 * never a ticker symbol that exists (docs §9).
 *
 * The lens takes iridescence 0.35 at IOR 1.8 — a thin-film oil-slick shift as
 * the camera moves, and the single highest-value-per-line AAA tell available on
 * this character.
 */
function arcBand(rOuter, rInner, half, seg = 11) {
  const pts = []
  for (let i = 0; i <= seg; i++) { const a = lerp(-half, half, i / seg); pts.push(Math.cos(a) * rOuter, Math.sin(a) * rOuter) }
  for (let i = seg; i >= 0; i--) { const a = lerp(-half, half, i / seg); pts.push(Math.cos(a) * rInner, Math.sin(a) * rInner) }
  return pts
}

function buildVisor(head, bones, S, costume, un) {
  const glasses = pivot(head, 0, 0, 0)
  glasses.name = 'glasses'
  bones.glasses = glasses
  const gw = bent(glasses, SKULL_PITCH, 0, 0)    // work in skull-local space

  // ==== R4 REBUILD ====================================================
  // Two blocking defects, both named by the critic, both fixed here.
  //
  // (A) IT WAS A HEADBAND, NOT A VISOR. r3's arc centre sat at skull-local
  //     (0.100, 0.115) with a 0.250 outer radius, which the +0.58 rad tilt lifts
  //     to a lens front at skull-local (0.309, 0.252) -- 0.23 m ABOVE the eye
  //     centres, with both eyes fully visible underneath. Docs §1 puts the visor
  //     WHERE THE EYES ARE.
  //
  //     Why it could not simply be lowered: the eyes sit at skull-local
  //     (0.352, 0.018, +-0.176) with a 0.062 m ball, i.e. widely splayed AND
  //     forward. Solving "a circular band through a front point at x = 0.44 that
  //     passes outside both eyeballs" gives arc centre x <= -0.231, i.e. a
  //     radius of about 0.67. A tight wrap CANNOT clear laterally-set eyes; the
  //     lens has to be a BROAD, SHALLOW shield, which is also what real
  //     wraparound eyewear is on a wide face. Hence radius 0.66 over a 0.40 rad
  //     half-arc, and the arc centre is carried on its own child group so the
  //     tilt pivot is the lens FRONT and can be positioned exactly.
  //
  //     Result: the lens covers the upper ~60% of both orbits, the burning iris
  //     and the lower catchlight read out underneath its bottom lip, and the
  //     silhouette gains a wide horizontal bar exactly at the eye line.
  //
  // (B) IT CLIPPED TO FEATURELESS WHITE. One emissive slab at intensity 3.4 with
  //     nothing behind it -- no lens body, no glass, no falloff, a hard dark
  //     rectangle around it. It is now FOUR shells: brushed frame with rolled
  //     lips, a dark near-matte lens body, a NARROWER emissive band inset into
  //     that body (so there is unlit lens above and below the glow and it can
  //     never read as a lit rectangle), and a clear curved glass shell over the
  //     lot at clearcoat 1.0 / roughness 0.12 with the iridescent thin-film.
  //     Emissive drops 3.4 -> 1.4, a 2.4x cut, so it is light behind glass.
  //     SOLVED IN WORLD SPACE, NOT SKULL SPACE. This is the trap: the skull is
  //     pitched 30 deg nose-down, so a point 0.12 m further forward along the
  //     skull is 0.06 m LOWER in world. Placing the lens "level with the eyes"
  //     in skull-local coordinates puts it over the MUZZLE on screen. The pivot
  //     below is solved so the lens front lands at world y 2.00 with the eye
  //     centres at 1.961 -- the lens covers the eyes from world y 1.936 up, and
  //     the bottom of each orbit reads out underneath the rolled lower lip.
  const tilt = pivot(gw, 0.475, 0.133, 0)
  tilt.rotation.z = -SKULL_PITCH + 0.06     // lens normal +0.06 rad above world horizontal
  const bin = staticBin(tilt, 'visor')
  const R = 0.66                            // arc mid-radius; centre is behind the skull
  const band = pivot(bin, -R, 0, 0)         // so tilt's origin IS the lens front
  const HALF = 0.40                         // +-0.257 m of lateral wrap

  const emHex = un ? C.visorEmUn : costume === 1 ? C.visorEmGold : C.visorEm
  // emissive() gives the emitter a DARK albedo derived from its own radiance, so
  // the parts of the band the key light misses stay dark instead of reading as
  // white plastic. glowMarks()/visorGlint write .emissive and restore baseEm.
  const lensM = M.emissive(emHex, 1.4, 'neon-panel', { name: 'bullVisorLens' })
  lensM.userData.baseEm = emHex

  // 1. brushed frame shell — the bezel, standing proud of the lens all round
  band.add(rot(mesh(plate(arcBand(0.700, 0.626, HALF), 0.132, 0.017, { rimSeg: 3 }), S.visorFrame,
    0, 0, 0), -PI / 2, 0, 0))
  // 2. the rolled top and bottom lips — the 0.006 m fillet that stops the bezel
  //    reading as a cut rectangular boundary
  for (const dy of [0.070, -0.070]) {
    band.add(rot(mesh(plate(arcBand(0.7045, 0.640, HALF), 0.022, 0.010, { rimSeg: 3 }), S.visorFrame,
      0, dy, 0), -PI / 2, 0, 0))
  }
  // 3. the LENS BODY: dark, near-matte, recessed into the frame. This is what
  //    the glow sits inside, and it is why the lens has ends that fall off.
  band.add(rot(mesh(plate(arcBand(0.6945, 0.638, HALF - 0.015), 0.100, 0.015, { rimSeg: 3 }), S.visorBody,
    0, 0, 0), -PI / 2, 0, 0))
  // 4. the emissive band, NARROWER than the body in both axes and inset 0.002,
  //    so unlit lens surrounds it on every side
  band.add(rot(mesh(plate(arcBand(0.6965, 0.664, HALF - 0.030), 0.046, 0.012, { rimSeg: 2 }), lensM,
    0, 0.006, 0), -PI / 2, 0, 0))

  // the rising chart line, sitting 0.002 proud of the lens body just BELOW the
  // glow band so the two read as separate elements. A CHART -- never a logo,
  // never lettering, never a ticker symbol that exists (docs §9 prohibition 9).
  const chart = []
  const steps = [0, -0.008, 0.004, -0.003, 0.012, 0.006, 0.018, 0.011, 0.026, 0.020, 0.034, 0.030]
  for (let i = 0; i < steps.length; i++) {
    const a = lerp(-(HALF - 0.045), HALF - 0.045, i / (steps.length - 1))
    chart.push([Math.cos(a) * 0.6975, -0.030 + steps[i], -Math.sin(a) * 0.6975])
  }
  band.add(mesh(splineTube(chart, 0.0055, 26, null, { radialSeg: 4 }), lensM))

  // 5. THE GLASS SHELL. A separate curved cover over the whole lens stack:
  //    clearcoat 1.0, roughness 0.12, iridescence 0.35 at IOR 1.8. This is what
  //    turns "a flat lit rectangle" into "light behind glass" -- it carries its
  //    own moving specular streak and a thin-film hue shift as the camera
  //    orbits, and it is the single highest-value-per-line AAA tell available on
  //    this character (docs §6).
  band.add(rot(mesh(plate(arcBand(0.7145, 0.7025, HALF + 0.006), 0.140, 0.006, { rimSeg: 3 }), S.visorGlass,
    0, 0, 0), -PI / 2, 0, 0))

  // TEMPLE STRUTS, in the TILT frame (the band group's origin is 0.66 m behind
  // the face, so struts belong on the parent). They run from the shield's arc
  // ends back and inboard onto the cheek/orbit corner, so the assembly reads as
  // worn hardware bolted to a skull rather than a decal hovering in air.
  for (const side of [1, -1]) {
    // Routed OUTBOARD of the orbit, not through it: a first pass ran the arm at
    // skull-local z +-0.20, which is 0.059 from the eye centre against a 0.062 m
    // ball — the strut went straight through both eyeballs. It now stands off at
    // z +-0.235 (clear air beside the cheek, which is what a temple arm does)
    // and only lands on the skull at x 0.17 where the cranium is 0.42 m wide.
    bin.add(mesh(splineTube([
      [-0.020, 0.000, 0.270 * side],
      [-0.230, -0.032, 0.258 * side],
      [-0.317, 0.073, 0.205 * side],
    ], 0.017, 12, (t) => lerp(0.019, 0.011, t), { radialSeg: 5, aspect: 1.5 }), S.visorFrame))
    // two short brow posts up onto the frontal shield
    bin.add(mesh(splineTube([
      [0.020, 0.066, 0.060 * side],
      [-0.146, 0.116, 0.060 * side],
    ], 0.013, 6, null, { radialSeg: 5, roundEnd: true, roundStart: true }), S.visorFrame))
  }

  try { mergeStatic(bin) } catch (e) { /* draw-call win only */ }
  return lensM
}

/**
 * The leash-necktie — bone `tie`, child of `head`. The joke in one object: the
 * thing on the end of a bull's nose-ring lead is a corporate necktie.
 *
 * The whole assembly hangs off the HEAD, never the chest. Running the chain
 * from the nose to the sternum crosses a bone boundary and tears open on every
 * head turn. Gore pops it at the 70% accessory threshold, which is a good beat:
 * he gets MORE animal as he takes damage.
 */
function buildLeashTie(head, bones, S) {
  // R4, THREE FIXES, all from the same critic finding ("a strand of red onion
  // rings hanging from the mouth to the crotch, cutting across the muzzle"):
  //
  // (1) ANCHOR. r3's pivot was head-local (0.605, -0.465), but the ring's
  //     6-o'clock bolt is at skull-local (0.752, -0.292), which the -0.52 bind
  //     bend maps to head-local (0.508, -0.627). The chain's top link therefore
  //     started 0.19 m away from the ring it is supposed to hang off, in clear
  //     air, which is what made it read as one rope coming out of the mouth
  //     rather than as a lead clipped to a nose ring.
  // (2) LENGTH. 9 links at 0.056 plus a knot plus a 0.28 m blade reached world
  //     y 0.77 -- the crotch. Four links and a 0.22 m blade stop at y ~1.15,
  //     level with the hips, which is where a lead actually hangs.
  // (3) OFF THE MIDLINE. Everything drifts to +Z as it descends, so the chain
  //     never crosses the muzzle, the nostrils or the mouth in the front view.
  const tie = pivot(head, 0.508, -0.627, 0.028)
  tie.name = 'tie'
  bones.tie = tie
  const bin = staticBin(tie, 'leash')

  // 4 real toroid links, alternating 90 degrees in plane. BULL_RING_ALLOY, a
  // different, duller, warmer metal from both the hide and the oxblood tie --
  // r3's chain metered as the same red as the blade at gameplay distance.
  for (let i = 0; i < 4; i++) {
    const t = i / 3
    const m = mesh(filletRing(0.042, 0.014, 5, 10), S.alloy, -0.008 * t, -0.014 - i * 0.054, 0.030 * t)
    if (i % 2) rot(m, PI / 2, 0, 0)
    bin.add(m)
  }
  // a proper four-in-hand knot: a bevelled wedge with a real dimple and a
  // 0.012 m fold rolling over the top, not a flat 2D lozenge
  const kz = 0.036
  bin.add(mesh(sel(0.058, 0.066, 0.048, 3.2, 3.0, 16), S.tie, -0.004, -0.252, kz))
  bin.add(rot(mesh(filletRing(0.054, 0.014, 6, 16), S.tie, -0.004, -0.204, kz), 0, 0, 0))
  bin.add(mesh(sel(0.016, 0.020, 0.014, 2.2, 2.2, 10), S.hideDeep, 0.050, -0.258, kz))
  // the fold: a second, smaller wedge lapping over the knot's shoulder so the
  // knot has thickness and a light/shadow break instead of one flat facet
  bin.add(rot(mesh(sel(0.030, 0.024, 0.050, 2.8, 2.8, 12), S.tie, 0.012, -0.226, kz + 0.012), 0, 0, 0.42))
  // blade: tapered trapezoid with a pointed 45-degree tip and a rolled edge,
  // twisted 6 degrees along its length so it never reads as a flat card
  bin.add(rot(mesh(plate([
    -0.026, 0.000, 0.026, 0.000, 0.046, -0.150, 0.000, -0.220, -0.046, -0.150,
  ], 0.020, 0.009, { crown: 0.005, rimSeg: 2, faceSeg: 2 }), S.tie, 0.002, -0.292, kz), 0, 0.10, 0.02))
  try { mergeStatic(bin) } catch (e) { /* draw-call win only */ }
}

/**
 * Ears — paddles, not blobs. 0.20 long, 0.11 at the widest (which sits at 40%
 * of the length), tapering to a rounded point, with a rolled edge all round, a
 * hollowed concha cup and a fringe of cast tufts at its rim.
 *
 * Set BELOW and BEHIND the horns, bound 78 deg lateral / 12 deg down /
 * 20 deg caudal: horizontal paddles sticking out sideways, never vertical
 * rabbit ears. earL/earR are SECONDARY_BONES, so they are dismemberment targets
 * — the base is modelled so a torn stump reads as a snapped bronze casting.
 */
function earOutline() {
  const pts = []
  const N = 12
  const w = (t) => 0.053 * Math.sin(Math.pow(t, 0.55) * PI) + 0.026 * (1 - t) + 0.004
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(t * 0.20, w(t)) }
  for (let i = N; i >= 0; i--) { const t = i / N; pts.push(t * 0.20, -w(t)) }
  return pts
}

function buildEar(bin, S, side) {
  const p = pivot(bin, 0, 0, 0)
  p.rotation.y = -PI / 2 * side
  p.add(mesh(plate(earOutline(), 0.017, 0.006, { crown: 0.005, taper: 0.35, rimSeg: 2 }), S.hide))
  // concha: an oval cup hollowed 0.020 deep over the basal 60%
  p.add(mesh(disc(0.055, 0.034, 0.014), S.hideDeep, 0.062, 0, 0.009))
  // the 0.006 m rolled edge all round the paddle — the plate()'s own rim is the
  // fillet, and this bead sits in the concha's mouth so the cup has a lip
  p.add(rot(mesh(filletRing(0.050, 0.005, 5, 16), S.hide, 0.062, 0, 0.014), PI / 2, 0, 0))
  // 9 cast tufts at the cup's rim (docs §3.6). r3 shipped 4 and they vanished.
  for (let i = 0; i < 9; i++) {
    const t = (i / 8 - 0.5) * 2
    p.add(rot(mesh(roundedCone(0.0055, 0.001, 0.016, 0.0015, 5, 1), S.hideDeep,
      0.028 + Math.abs(t) * 0.030, t * 0.044, 0.014), 0, 0, t * 0.55))
  }
  p.add(mesh(jointBall(0.030, 10), S.hide, 0.004, 0, 0))
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,1.15,0]
// (hips position keys are ABSOLUTE local values — the Animator sets, not adds)
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 1.15, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.0, [0, 0.02, 0.015], [0, 1.115, 0]), K(2.0, Z, HIP)],
      torso: [K(0, [0, 0, 0.06]), K(1.0, [0.02, -0.03, 0.02]), K(2.0, [0, 0, 0.06])],
      // He does not bob and the head does NOT drop. r1's idle added another
      // -0.06 of nose-down on top of the bind and buried the face; the idle now
      // lifts +0.03 so the visor plane is level with the camera, and the head
      // barely moves at all -- a motionless skull over a shifting body is the
      // strongest "this thing is enormous" cue available (docs §8).
      head: [K(0, [0, 0, 0.03]), K(1.0, [0.02, 0.05, 0.045]), K(2.0, [0, 0, 0.03])],
      armL: [K(0, [0.1, 0, 0.28]), K(1.0, [0.14, 0, 0.34]), K(2.0, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(1.0, [-0.14, 0, 0.36]), K(2.0, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(1.0, [0, 0, 0.55]), K(2.0, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(1.0, [0, 0, 0.6]), K(2.0, [0, 0, 0.55])],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
      shinL: [K(0, Z)], shinR: [K(0, Z)],
      earL: [K(0, Z), K(0.5, [0.15, 0.2, 0]), K(0.7, Z), K(2.0, Z)],
      earR: [K(0, Z), K(1.4, [-0.15, -0.2, 0]), K(1.6, Z), K(2.0, Z)],
      tail: [K(0, Z), K(1.0, [0.35, 0, 0.1]), K(2.0, Z)],
    },
  },

  walk: {
    duration: 0.7, loop: true,
    tracks: {
      hips: [K(0, [0, 0.04, -0.02], [0, 1.12, 0]), K(0.175, [0, 0, -0.02], [0, 1.08, 0]), K(0.35, [0, -0.04, -0.02], [0, 1.125, 0]), K(0.525, [0, 0, -0.02], [0, 1.08, 0]), K(0.7, [0, 0.04, -0.02], [0, 1.12, 0])],
      legL: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, -0.5]), K(0.7, [0, 0, 0.5])],
      legR: [K(0, [0, 0, -0.5]), K(0.35, [0, 0, 0.5]), K(0.7, [0, 0, -0.5])],
      shinL: [K(0, [0, 0, -0.25]), K(0.35, [0, 0, 0.35]), K(0.7, [0, 0, -0.25])],
      shinR: [K(0, [0, 0, 0.35]), K(0.35, [0, 0, -0.25]), K(0.7, [0, 0, 0.35])],
      torso: [K(0, [0, -0.06, -0.1]), K(0.35, [0, 0.06, -0.1]), K(0.7, [0, -0.06, -0.1])],
      head: [K(0, [0, 0.05, 0.04]), K(0.35, [0, -0.05, 0.04]), K(0.7, [0, 0.05, 0.04])],
      armL: [K(0, [0.1, 0, -0.25]), K(0.35, [0.1, 0, 0.55]), K(0.7, [0.1, 0, -0.25])],
      armR: [K(0, [-0.1, 0, 0.55]), K(0.35, [-0.1, 0, -0.25]), K(0.7, [-0.1, 0, 0.55])],
      forearmL: [K(0, [0, 0, 0.6])], forearmR: [K(0, [0, 0, 0.6])],
      earL: [K(0, Z), K(0.175, [0.2, 0.15, 0]), K(0.35, Z), K(0.525, [0.2, 0.15, 0]), K(0.7, Z)],
      earR: [K(0, Z), K(0.175, [-0.2, -0.15, 0]), K(0.35, Z), K(0.525, [-0.2, -0.15, 0]), K(0.7, Z)],
      tail: [K(0, [0.3, 0, 0]), K(0.35, [-0.3, 0, 0]), K(0.7, [0.3, 0, 0])],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, 0.08], [0, 1.2, 0]), K(0.5, [0, 0, 0.08], [0, 1.2, 0])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.8]), K(0.5, [0, 0, 0.7])],
      legR: [K(0, Z), K(0.12, [0, 0, 0.5]), K(0.5, [0, 0, 0.4])],
      shinL: [K(0, Z), K(0.12, [0, 0, -0.6]), K(0.5, [0, 0, -0.5])],
      shinR: [K(0, Z), K(0.12, [0, 0, -0.4]), K(0.5, [0, 0, -0.35])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.12, [-0.3, 0, 1.1]), K(0.5, [-0.3, 0, 1.0])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.12, [0.3, 0, 1.1]), K(0.5, [0.3, 0, 1.0])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.12, [0, 0, 0.9])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.12, [0, 0, 0.9])],
      torso: [K(0, Z), K(0.12, [0, 0, 0.14])],
      head: [K(0, Z), K(0.12, [0, 0, -0.12])],
      earL: [K(0, Z), K(0.12, [-0.3, 0.1, 0])], earR: [K(0, Z), K(0.12, [0.3, -0.1, 0])],
      tail: [K(0, Z), K(0.12, [-0.6, 0, 0])],
    },
  },

  fall: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.1], HIP)],
      torso: [K(0, [0, 0, 0.16])],
      head: [K(0, [0, 0, -0.08])],
      armL: [K(0, [-0.3, 0, 1.9]), K(0.25, [-0.45, 0, 2.2]), K(0.5, [-0.3, 0, 1.9])],
      armR: [K(0, [0.45, 0, 2.2]), K(0.25, [0.3, 0, 1.9]), K(0.5, [0.45, 0, 2.2])],
      forearmL: [K(0, [0, 0, 0.4])], forearmR: [K(0, [0, 0, 0.4])],
      legL: [K(0, [-0.25, 0, 0.3]), K(0.25, [-0.25, 0, 0.1]), K(0.5, [-0.25, 0, 0.3])],
      legR: [K(0, [0.25, 0, 0.1]), K(0.25, [0.25, 0, 0.3]), K(0.5, [0.25, 0, 0.1])],
      shinL: [K(0, [0, 0, -0.4])], shinR: [K(0, [0, 0, -0.4])],
      earL: [K(0, [-0.4, 0.1, 0])], earR: [K(0, [0.4, -0.1, 0])],
      tail: [K(0, [-0.8, 0, 0]), K(0.25, [-1.0, 0, 0]), K(0.5, [-0.8, 0, 0])],
    },
  },

  crouch: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.12], [0, 0.76, 0]), K(0.3, [0, 0, -0.12], [0, 0.745, 0]), K(0.6, [0, 0, -0.12], [0, 0.76, 0])],
      legL: [K(0, [-0.45, 0, 0.85])], legR: [K(0, [0.45, 0, 0.85])],
      shinL: [K(0, [0, 0, -0.95])], shinR: [K(0, [0, 0, -0.95])],
      torso: [K(0, [0, 0, -0.22])],
      head: [K(0, [0, 0, 0.14])],
      armL: [K(0, [0.3, 0, 0.55])], armR: [K(0, [-0.3, 0, 0.55])],
      forearmL: [K(0, [0, 0, 1.1])], forearmR: [K(0, [0, 0, 1.1])],
      earL: [K(0, [0, -0.2, 0])], earR: [K(0, [0, 0.2, 0])],
      tail: [K(0, [0.5, 0, 0])],
    },
  },

  block: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.05, 1.1, 0])],
      torso: [K(0, [0, 0, 0.14]), K(0.3, [0.02, 0, 0.16]), K(0.6, [0, 0, 0.14])],
      head: [K(0, [0, 0, -0.24])],
      armL: [K(0, [0.3, 0, 0.95])], armR: [K(0, [-0.3, 0, 1.0])],
      forearmL: [K(0, [0, 0, 1.7])], forearmR: [K(0, [0, 0, 1.8])],
      legL: [K(0, [-0.12, 0, 0.1])], legR: [K(0, [0.12, 0, 0.1])],
      shinL: [K(0, [0, 0, -0.1])], shinR: [K(0, [0, 0, -0.1])],
      earL: [K(0, [0, -0.4, 0])], earR: [K(0, [0, 0.4, 0])],
      tail: [K(0, [0.4, 0, 0])],
    },
  },

  hitLight: {
    duration: 0.28, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.08], [-0.07, 1.12, 0]), K(0.28, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.08, 0.26]), K(0.28, Z)],
      head: [K(0, Z), K(0.05, [0, 0.1, 0.42]), K(0.28, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.05, [0.35, 0, -0.4]), K(0.28, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.05, [-0.35, 0, -0.35]), K(0.28, [-0.1, 0, 0.3])],
      earL: [K(0, Z), K(0.06, [0.35, 0.4, 0]), K(0.28, Z)],
      earR: [K(0, Z), K(0.06, [-0.35, -0.4, 0]), K(0.28, Z)],
      tail: [K(0, Z), K(0.06, [0.6, 0, 0]), K(0.28, Z)],
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.2], [-0.2, 1.08, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.12, 0.5]), K(0.42, Z)],
      head: [K(0, Z), K(0.06, [0, 0.15, 0.65]), K(0.42, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.06, [0.55, 0, -1.0]), K(0.42, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.06, [-0.55, 0, -0.9]), K(0.42, [-0.1, 0, 0.3])],
      legL: [K(0, Z), K(0.07, [0, 0, 0.45]), K(0.42, Z)],
      shinL: [K(0, Z), K(0.07, [0, 0, -0.3]), K(0.42, Z)],
      earL: [K(0, Z), K(0.07, [0.5, 0.5, 0]), K(0.42, Z)],
      earR: [K(0, Z), K(0.07, [-0.5, -0.5, 0]), K(0.42, Z)],
      tail: [K(0, Z), K(0.07, [0.9, 0, 0]), K(0.42, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.32], HIP)],
      torso: [K(0, [0, 0, 0.6]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, 0.6])],
      head: [K(0, [0, 0, 0.45])],
      armL: [K(0, [-0.4, 0, 2.1]), K(0.25, [-0.2, 0, 2.35]), K(0.5, [-0.4, 0, 2.1])],
      armR: [K(0, [0.2, 0, 2.35]), K(0.25, [0.4, 0, 2.1]), K(0.5, [0.2, 0, 2.35])],
      forearmL: [K(0, [0, 0, 0.3])], forearmR: [K(0, [0, 0, 0.3])],
      legL: [K(0, [0, 0, 0.85]), K(0.25, [0, 0, 0.65]), K(0.5, [0, 0, 0.85])],
      legR: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.75]), K(0.5, [0, 0, 0.55])],
      shinL: [K(0, [0, 0, -0.7])], shinR: [K(0, [0, 0, -0.7])],
      earL: [K(0, [-0.6, 0.3, 0])], earR: [K(0, [0.6, -0.3, 0])],
      tail: [K(0, [-1.2, 0, 0])],
    },
  },

  knockdown: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.42, 0]), K(0.45, [0, 0, 1.35], [0, 0.435, 0]), K(0.9, [0, 0, 1.35], [0, 0.42, 0])],
      legL: [K(0, [0, 0, 0.3])], legR: [K(0, [0, 0, 0.5])],
      shinL: [K(0, [0, 0, -0.3])], shinR: [K(0, [0, 0, -0.2])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.28])],
      armL: [K(0, [1.0, 0, 0.3])], armR: [K(0, [-1.0, 0, 0.3])],
      earL: [K(0, [0.6, 0, 0])], earR: [K(0, [-0.6, 0, 0])],
      tail: [K(0, [1.0, 0, 0])],
    },
  },

  getup: {
    duration: 0.7, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.42, 0]), K(0.25, [0, 0, 0.5], [0, 0.62, 0]), K(0.5, [0, 0, 0.05], [0, 0.94, 0]), K(0.7, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.35, [0, 0, 0.6]), K(0.7, Z)],
      legR: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, 0.3]), K(0.7, Z)],
      shinL: [K(0, [0, 0, -0.3]), K(0.35, [0, 0, -0.5]), K(0.7, Z)],
      shinR: [K(0, [0, 0, -0.2]), K(0.35, [0, 0, -0.4]), K(0.7, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, -0.35]), K(0.7, [0, 0, 0.06])],
      head: [K(0, [0, 0, -0.28]), K(0.5, [0, 0, 0.12]), K(0.7, [0, 0, -0.06])],
      armL: [K(0, [1.0, 0, 0.3]), K(0.3, [0.3, 0, -0.6]), K(0.7, [0.1, 0, 0.28])],
      armR: [K(0, [-1.0, 0, 0.3]), K(0.3, [-0.3, 0, -0.6]), K(0.7, [-0.1, 0, 0.3])],
      earL: [K(0, [0.6, 0, 0]), K(0.55, [0.2, 0.3, 0]), K(0.7, Z)],
      earR: [K(0, [-0.6, 0, 0]), K(0.55, [-0.2, -0.3, 0]), K(0.7, Z)],
      tail: [K(0, [1.0, 0, 0]), K(0.55, [0.4, 0, 0]), K(0.7, Z)],
    },
  },

  // paws the ground like an actual bull, snorts, rises, cracks his neck
  entrance: {
    duration: 2.6, loop: false,
    tracks: {
      hips: [K(0, [0, 0, -0.15], [0.05, 1.05, 0]), K(1.4, [0, 0, -0.15], [0.05, 1.05, 0]), K(1.8, Z, [0, 1.2, 0]), K(2.0, Z, HIP), K(2.6, Z, HIP)],
      torso: [K(0, [0, 0, -0.45]), K(1.4, [0, 0, -0.45]), K(1.8, [0, 0, 0.14]), K(2.6, [0, 0, 0.06])],
      head: [K(0, [0, 0, -0.5]), K(0.4, [0, 0.12, -0.55]), K(0.8, [0, -0.12, -0.55]), K(1.4, [0, 0, -0.5]), K(1.8, [0, 0, 0.25]), K(2.05, [0.35, 0, 0.1]), K(2.3, [-0.35, 0, 0.1]), K(2.6, [0, 0, -0.06])],
      legR: [K(0, Z), K(0.3, [0, 0, 0.9]), K(0.5, [0, 0, -0.3]), K(0.7, [0, 0, 0.9]), K(0.9, [0, 0, -0.3]), K(1.1, [0, 0, 0.9]), K(1.3, Z), K(2.6, [0, 0, -0.04])],
      shinR: [K(0, Z), K(0.3, [0, 0, -1.1]), K(0.5, Z), K(0.7, [0, 0, -1.1]), K(0.9, Z), K(1.1, [0, 0, -1.1]), K(1.3, Z), K(2.6, Z)],
      legL: [K(0, [-0.1, 0, 0.2]), K(1.4, [-0.1, 0, 0.2]), K(1.8, Z), K(2.6, [0, 0, 0.04])],
      armL: [K(0, [0.2, 0, 0.5]), K(1.4, [0.2, 0, 0.5]), K(1.9, [0.3, 0, 1.1]), K(2.6, [0.1, 0, 0.28])],
      armR: [K(0, [-0.2, 0, 0.5]), K(1.4, [-0.2, 0, 0.5]), K(1.9, [-0.3, 0, 1.1]), K(2.6, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.7]), K(1.9, [0, 0, 1.5]), K(2.6, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.7]), K(1.9, [0, 0, 1.5]), K(2.6, [0, 0, 0.55])],
      earL: [K(0, [0, -0.3, 0]), K(1.4, [0, -0.3, 0]), K(1.8, Z), K(2.6, Z)],
      earR: [K(0, [0, 0.3, 0]), K(1.4, [0, 0.3, 0]), K(1.8, Z), K(2.6, Z)],
      tail: [K(0, [0.4, 0, 0]), K(0.5, [-0.5, 0, 0]), K(1.0, [0.4, 0, 0]), K(1.4, [-0.5, 0, 0]), K(2.0, Z), K(2.6, Z)],
    },
  },

  // double bicep flex + slow horn toss. the market fears him
  win: {
    duration: 2.6, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.4, Z, [0, 1.1, 0]), K(0.7, Z, [0, 1.18, 0]), K(2.2, Z, [0, 1.16, 0]), K(2.6, Z, HIP)],
      torso: [K(0, [0, 0, 0.06]), K(0.7, [0, 0, 0.2]), K(2.2, [0, 0, 0.18]), K(2.6, [0, 0, 0.06])],
      head: [K(0, Z), K(0.7, [0, 0, 0.3]), K(1.1, [0.4, 0, 0.2]), K(1.5, [-0.4, 0, 0.2]), K(1.9, [0, 0, 0.3]), K(2.6, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.7, [0.9, 0, 2.2]), K(2.2, [0.9, 0, 2.25]), K(2.6, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.7, [-0.9, 0, 2.2]), K(2.2, [-0.9, 0, 2.25]), K(2.6, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.7, [0, 0, -1.9]), K(2.2, [0, 0, -1.95]), K(2.6, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.7, [0, 0, -1.9]), K(2.2, [0, 0, -1.95]), K(2.6, [0, 0, 0.55])],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
      earL: [K(0, Z), K(0.7, [0.3, 0.3, 0]), K(2.2, [0.3, 0.3, 0]), K(2.6, Z)],
      earR: [K(0, Z), K(0.7, [-0.3, -0.3, 0]), K(2.2, [-0.3, -0.3, 0]), K(2.6, Z)],
      tail: [K(0, Z), K(0.6, [0.6, 0, 0]), K(1.2, [-0.6, 0, 0]), K(1.8, [0.6, 0, 0]), K(2.6, Z)],
    },
  },

  lose: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.15], [0, 0.68, 0]), K(1.0, [0, 0, -0.15], [0, 0.665, 0]), K(2.0, [0, 0, -0.15], [0, 0.68, 0])],
      legL: [K(0, [-0.9, 0, 1.2])], shinL: [K(0, [0, 0, -1.6])],
      legR: [K(0, [0.6, 0, 0.4])], shinR: [K(0, [0, 0, -0.5])],
      torso: [K(0, [0, 0, -0.42]), K(1.0, [0, 0, -0.46]), K(2.0, [0, 0, -0.42])],
      head: [K(0, [0, 0, -0.55]), K(1.0, [0, 0.12, -0.58]), K(2.0, [0, 0, -0.55])],
      armR: [K(0, [-0.1, 0, 0.9])], forearmR: [K(0, [0, 0, 0.3])],
      armL: [K(0, [0.1, 0, 0.35])], forearmL: [K(0, [0, 0, 0.2])],
      earL: [K(0, [0.6, 0, 0])], earR: [K(0, [-0.6, 0, 0])],
      tail: [K(0, [1.1, 0, 0])],
    },
  },

  taunt: {
    duration: 1.2, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.08], [0.03, 1.1, 0]), K(0.9, [0, 0, -0.08], [0.03, 1.1, 0]), K(1.2, Z, HIP)],
      torso: [K(0, [0, 0, 0.06]), K(0.2, [0, 0, -0.25]), K(0.9, [0, 0, -0.25]), K(1.2, [0, 0, 0.06])],
      head: [K(0, Z), K(0.2, [0, 0, -0.4]), K(0.4, [0.35, 0, -0.4]), K(0.6, [-0.35, 0, -0.4]), K(0.8, [0.35, 0, -0.4]), K(1.0, [0, 0, -0.2]), K(1.2, Z)],
      legR: [K(0, Z), K(0.25, [0, 0, 0.8]), K(0.45, [0, 0, -0.2]), K(0.65, [0, 0, 0.8]), K(0.85, Z), K(1.2, Z)],
      shinR: [K(0, Z), K(0.25, [0, 0, -1.0]), K(0.45, Z), K(0.65, [0, 0, -1.0]), K(0.85, Z), K(1.2, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.2, [0.2, 0, 0.6]), K(1.2, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.2, [-0.2, 0, 0.6]), K(1.2, [-0.1, 0, 0.3])],
      earL: [K(0, Z), K(0.4, [0.3, 0.3, 0]), K(0.6, Z), K(1.2, Z)],
      earR: [K(0, Z), K(0.6, [-0.3, -0.3, 0]), K(0.8, Z), K(1.2, Z)],
      tail: [K(0, Z), K(0.3, [-0.6, 0, 0]), K(0.7, [0.6, 0, 0]), K(1.2, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  hornJab: {
    duration: 0.28, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.09, [0, 0.15, 0.05], [0.08, 1.1, 0]), K(0.28, Z, HIP)],
      torso: [K(0, Z), K(0.09, [0, -0.2, -0.25]), K(0.28, Z)],
      head: [K(0, Z), K(0.05, [0, 0, 0.3]), K(0.09, [0, 0, -0.7]), K(0.18, [0, 0, -0.4]), K(0.28, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.09, [0.3, 0, 0.6]), K(0.28, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.09, [-0.3, 0, -0.4]), K(0.28, [-0.1, 0, 0.3])],
      earL: [K(0, Z), K(0.09, [0, -0.4, 0]), K(0.28, Z)],
      earR: [K(0, Z), K(0.09, [0, 0.4, 0]), K(0.28, Z)],
      tail: [K(0, Z), K(0.09, [0.5, 0, 0]), K(0.28, Z)],
    },
  },

  visorGlint: {
    duration: 0.23, loop: false,
    tracks: {
      head: [K(0, Z), K(0.06, [0, 0, 0.35]), K(0.11, [0, 0.3, -0.2]), K(0.23, Z)],
      torso: [K(0, Z), K(0.08, [0, -0.15, 0.05]), K(0.23, Z)],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.06, [-0.1, 0, -0.3]), K(0.11, [0, 0, 1.3]), K(0.23, [-0.1, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.11, [0, 0, 0.1]), K(0.23, [0, 0, 0.55])],
      hips: [K(0, Z, HIP), K(0.11, Z, [0.05, 1.13, 0]), K(0.23, Z, HIP)],
      earL: [K(0, Z), K(0.11, [0.2, 0.2, 0]), K(0.23, Z)],
      earR: [K(0, Z), K(0.11, [-0.2, -0.2, 0]), K(0.23, Z)],
    },
  },

  heavyHook: {
    duration: 0.53, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.16, [0, -0.5, 0], [-0.04, 1.1, 0]), K(0.24, [0, 0.55, 0], [0.14, 1.08, 0]), K(0.53, Z, HIP)],
      torso: [K(0, Z), K(0.16, [0, -0.6, 0.1]), K(0.24, [0, 0.6, -0.2]), K(0.38, [0, 0.4, -0.1]), K(0.53, [0, 0, 0.06])],
      head: [K(0, Z), K(0.16, [0, -0.35, 0]), K(0.24, [0, 0.25, -0.1]), K(0.53, Z)],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.16, [-0.5, 0, 1.4]), K(0.24, [0.2, -0.9, -0.3]), K(0.36, [0.1, -0.7, -0.1]), K(0.53, [-0.1, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.16, [0, 0, 1.9]), K(0.24, [0, 0, 0.7]), K(0.53, [0, 0, 0.55])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.16, [0.2, 0, 0.7]), K(0.24, [0.3, 0, -0.6]), K(0.53, [0.1, 0, 0.28])],
      legL: [K(0, Z), K(0.24, [0, 0, -0.3]), K(0.53, Z)],
      legR: [K(0, Z), K(0.24, [0, 0, 0.25]), K(0.53, Z)],
      earL: [K(0, Z), K(0.24, [0.3, 0.35, 0]), K(0.53, Z)],
      earR: [K(0, Z), K(0.24, [-0.3, -0.35, 0]), K(0.53, Z)],
      tail: [K(0, Z), K(0.24, [0.8, 0, 0]), K(0.53, Z)],
    },
  },

  groundPunch: {
    duration: 0.63, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, 0.12], [0, 1.28, 0]), K(0.3, [0, 0, -0.2], [0.06, 0.78, 0]), K(0.45, [0, 0, -0.15], [0.03, 0.85, 0]), K(0.63, Z, HIP)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.35]), K(0.3, [0, 0, -0.6]), K(0.63, [0, 0, 0.06])],
      head: [K(0, Z), K(0.2, [0, 0, 0.3]), K(0.3, [0, 0, -0.4]), K(0.63, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.2, [-0.2, 0, 2.6]), K(0.3, [0.2, 0, -0.9]), K(0.45, [0.2, 0, -0.7]), K(0.63, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.2, [0.2, 0, 2.6]), K(0.3, [-0.2, 0, -0.9]), K(0.45, [-0.2, 0, -0.7]), K(0.63, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 0.3]), K(0.3, [0, 0, 0.2]), K(0.63, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.2, [0, 0, 0.3]), K(0.3, [0, 0, 0.2]), K(0.63, [0, 0, 0.55])],
      legL: [K(0, Z), K(0.3, [-0.4, 0, 0.9]), K(0.5, Z)],
      legR: [K(0, Z), K(0.3, [0.4, 0, 0.9]), K(0.5, Z)],
      shinL: [K(0, Z), K(0.3, [0, 0, -1.0]), K(0.5, Z)],
      shinR: [K(0, Z), K(0.3, [0, 0, -1.0]), K(0.5, Z)],
      earL: [K(0, Z), K(0.31, [0.5, 0.5, 0]), K(0.45, Z)],
      earR: [K(0, Z), K(0.31, [-0.5, -0.5, 0]), K(0.45, Z)],
      tail: [K(0, Z), K(0.2, [-0.7, 0, 0]), K(0.32, [0.9, 0, 0]), K(0.63, Z)],
    },
  },

  shoulderCharge: {
    duration: 0.62, loop: false,
    tracks: {
      torso: [K(0, Z), K(0.12, [0, 0.35, -0.6]), K(0.44, [0, 0.35, -0.6]), K(0.54, [0, 0, -0.1]), K(0.62, [0, 0, 0.06])],
      head: [K(0, Z), K(0.12, [0, -0.2, -0.4]), K(0.44, [0, -0.2, -0.4]), K(0.62, Z)],
      hips: [K(0, Z, HIP), K(0.12, [0, 0.2, -0.1], [-0.04, 1.06, 0]), K(0.44, [0, 0.2, -0.1], [0.05, 1.06, 0]), K(0.62, Z, HIP)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.12, [0.5, 0, 0.9]), K(0.44, [0.5, 0, 0.9]), K(0.62, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.12, [-0.3, 0, -0.8]), K(0.44, [-0.3, 0, -0.8]), K(0.62, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.12, [0, 0, 1.4]), K(0.44, [0, 0, 1.4]), K(0.62, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.6]), K(0.2, [0, 0, -0.6]), K(0.28, [0, 0, 0.6]), K(0.36, [0, 0, -0.6]), K(0.44, [0, 0, 0.4]), K(0.62, Z)],
      legR: [K(0, Z), K(0.12, [0, 0, -0.6]), K(0.2, [0, 0, 0.6]), K(0.28, [0, 0, -0.6]), K(0.36, [0, 0, 0.6]), K(0.44, [0, 0, -0.3]), K(0.62, Z)],
      earL: [K(0, Z), K(0.12, [0, -0.5, 0]), K(0.44, [0, -0.5, 0]), K(0.62, Z)],
      earR: [K(0, Z), K(0.12, [0, 0.5, 0]), K(0.44, [0, 0.5, 0]), K(0.62, Z)],
      tail: [K(0, Z), K(0.12, [-0.9, 0, 0]), K(0.44, [-0.9, 0, 0]), K(0.62, Z)],
    },
  },

  bootStomp: {
    duration: 0.47, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.15, [0, 0, 1.5]), K(0.22, [0, 0, 0.05]), K(0.47, Z)],
      shinR: [K(0, Z), K(0.15, [0, 0, -1.3]), K(0.22, Z), K(0.47, Z)],
      hips: [K(0, Z, HIP), K(0.15, [0, 0, 0.1], [-0.03, 1.18, 0]), K(0.22, [0, 0, -0.08], [0.02, 1.04, 0]), K(0.34, Z, [0, 1.1, 0]), K(0.47, Z, HIP)],
      torso: [K(0, Z), K(0.15, [0, 0, 0.16]), K(0.22, [0, 0, -0.28]), K(0.47, [0, 0, 0.06])],
      head: [K(0, Z), K(0.22, [0, 0, -0.22]), K(0.47, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.15, [-0.2, 0, 0.9]), K(0.22, [0.2, 0, -0.5]), K(0.47, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.15, [0.2, 0, 0.9]), K(0.22, [-0.2, 0, -0.5]), K(0.47, [-0.1, 0, 0.3])],
      earL: [K(0, Z), K(0.23, [0.5, 0.4, 0]), K(0.36, Z)],
      earR: [K(0, Z), K(0.23, [-0.5, -0.4, 0]), K(0.36, Z)],
      tail: [K(0, Z), K(0.22, [0.8, 0, 0]), K(0.47, Z)],
    },
  },

  bullRush: {
    duration: 0.57, loop: false,
    tracks: {
      torso: [K(0, Z), K(0.13, [0, 0, -0.7]), K(0.4, [0, 0, -0.7]), K(0.48, [0, 0, 0.2]), K(0.57, [0, 0, 0.06])],
      head: [K(0, Z), K(0.13, [0, 0, -0.55]), K(0.4, [0, 0, -0.55]), K(0.48, [0, 0, 0.3]), K(0.57, Z)],
      hips: [K(0, Z, HIP), K(0.13, [0, 0, -0.12], [-0.05, 1.02, 0]), K(0.4, [0, 0, -0.12], [0.06, 1.02, 0]), K(0.48, [0, 0, 0.08], [0.04, 1.2, 0]), K(0.57, Z, HIP)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.13, [0.3, 0, -1.1]), K(0.4, [0.3, 0, -1.1]), K(0.48, [-0.3, 0, 1.0]), K(0.57, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.13, [-0.3, 0, -1.1]), K(0.4, [-0.3, 0, -1.1]), K(0.48, [0.3, 0, 1.0]), K(0.57, [-0.1, 0, 0.3])],
      legL: [K(0, Z), K(0.13, [0, 0, 0.7]), K(0.2, [0, 0, -0.7]), K(0.27, [0, 0, 0.7]), K(0.34, [0, 0, -0.7]), K(0.4, [0, 0, 0.4]), K(0.57, Z)],
      legR: [K(0, Z), K(0.13, [0, 0, -0.7]), K(0.2, [0, 0, 0.7]), K(0.27, [0, 0, -0.7]), K(0.34, [0, 0, 0.7]), K(0.4, [0, 0, -0.3]), K(0.57, Z)],
      earL: [K(0, Z), K(0.13, [0, -0.6, 0]), K(0.4, [0, -0.6, 0]), K(0.57, Z)],
      earR: [K(0, Z), K(0.13, [0, 0.6, 0]), K(0.4, [0, 0.6, 0]), K(0.57, Z)],
      tail: [K(0, Z), K(0.13, [-1.0, 0, 0]), K(0.4, [-1.0, 0, 0]), K(0.57, Z)],
    },
  },

  armorStance: {
    duration: 0.8, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.06], [0, 1.05, 0]), K(0.62, [0, 0, -0.06], [0, 1.05, 0]), K(0.7, Z, [0.08, 1.12, 0]), K(0.8, Z, HIP)],
      legL: [K(0, [0, 0, 0.04]), K(0.1, [-0.3, 0, 0.35]), K(0.62, [-0.3, 0, 0.35]), K(0.8, [0, 0, 0.04])],
      legR: [K(0, [0, 0, -0.04]), K(0.1, [0.3, 0, 0.35]), K(0.62, [0.3, 0, 0.35]), K(0.8, [0, 0, -0.04])],
      shinL: [K(0, Z), K(0.1, [0, 0, -0.35]), K(0.62, [0, 0, -0.35]), K(0.8, Z)],
      shinR: [K(0, Z), K(0.1, [0, 0, -0.35]), K(0.62, [0, 0, -0.35]), K(0.8, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.1, [0.5, 0, 0.8]), K(0.62, [0.5, 0, 0.85]), K(0.7, [0.6, 0, 0.2]), K(0.8, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.1, [-0.5, 0, 0.85]), K(0.62, [-0.5, 0, 0.9]), K(0.7, [-0.6, 0, 0.2]), K(0.8, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, 1.9]), K(0.62, [0, 0, 1.9]), K(0.8, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.1, [0, 0, 1.9]), K(0.62, [0, 0, 1.9]), K(0.8, [0, 0, 0.55])],
      torso: [K(0, Z), K(0.1, [0, 0, 0.1]), K(0.3, [0.03, 0, 0.12]), K(0.5, [-0.03, 0, 0.12]), K(0.7, [0, 0, -0.15]), K(0.8, [0, 0, 0.06])],
      head: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.62, [0, 0, -0.3]), K(0.8, Z)],
      earL: [K(0, Z), K(0.1, [0, -0.4, 0]), K(0.62, [0, -0.4, 0]), K(0.8, Z)],
      earR: [K(0, Z), K(0.1, [0, 0.4, 0]), K(0.62, [0, 0.4, 0]), K(0.8, Z)],
      tail: [K(0, Z), K(0.3, [0.5, 0, 0]), K(0.62, [0.5, 0, 0]), K(0.8, Z)],
    },
  },

  grappleToss: {
    duration: 0.83, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, Z, [0.06, 1.1, 0]), K(0.3, [0, -0.5, 0], [0, 1.12, 0]), K(0.42, [0, 0.7, 0], [0.1, 1.1, 0]), K(0.6, [0, 0.2, 0], HIP), K(0.83, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, -0.2]), K(0.3, [0, -0.5, 0.1]), K(0.42, [0, 0.65, -0.3]), K(0.6, [0, 0.2, 0]), K(0.83, [0, 0, 0.06])],
      head: [K(0, Z), K(0.14, [0, 0, -0.15]), K(0.42, [0, 0.3, 0.1]), K(0.83, Z)],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.14, [0, 0, 1.3]), K(0.3, [0, -0.6, 1.2]), K(0.42, [0.3, 0.8, -0.6]), K(0.6, [0.1, 0.3, -0.3]), K(0.83, [-0.1, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.14, [0, 0, 0.2]), K(0.42, [0, 0, 0.1]), K(0.83, [0, 0, 0.55])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.14, [0.3, 0, 0.7]), K(0.42, [0.5, 0, -0.8]), K(0.83, [0.1, 0, 0.28])],
      legL: [K(0, Z), K(0.42, [0, 0, -0.35]), K(0.6, Z)],
      legR: [K(0, Z), K(0.42, [0, 0, 0.3]), K(0.6, Z)],
      earL: [K(0, Z), K(0.42, [0.4, 0.35, 0]), K(0.65, Z)],
      earR: [K(0, Z), K(0.42, [-0.4, -0.35, 0]), K(0.65, Z)],
      tail: [K(0, Z), K(0.3, [-0.6, 0, 0]), K(0.44, [0.9, 0, 0]), K(0.83, Z)],
    },
  },

  marketCorrection: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.16, Z, [0.05, 1.05, 0]), K(0.35, [0, 0, 0.1], [0, 1.25, 0]), K(0.55, [0, 0, -0.1], [0.05, 0.95, 0]), K(0.75, Z, [0, 1.05, 0]), K(1.0, Z, HIP)],
      torso: [K(0, Z), K(0.16, [0, 0, -0.25]), K(0.35, [0, 0, 0.4]), K(0.55, [0, 0, -0.5]), K(1.0, [0, 0, 0.06])],
      head: [K(0, Z), K(0.35, [0, 0, 0.4]), K(0.55, [0, 0, -0.3]), K(1.0, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.16, [0.3, 0, 0.9]), K(0.35, [-0.2, 0, 2.7]), K(0.55, [0.2, 0, 0.4]), K(1.0, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.16, [-0.3, 0, 0.9]), K(0.35, [0.2, 0, 2.7]), K(0.55, [-0.2, 0, 0.4]), K(1.0, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, 0.2]), K(0.55, [0, 0, 0.9]), K(1.0, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.35, [0, 0, 0.2]), K(0.55, [0, 0, 0.9]), K(1.0, [0, 0, 0.55])],
      // the folding knee
      legR: [K(0, Z), K(0.4, [0, 0, 1.3]), K(0.62, [0, 0, 1.3]), K(0.75, Z), K(1.0, Z)],
      shinR: [K(0, Z), K(0.4, [0, 0, -1.5]), K(0.62, [0, 0, -1.5]), K(0.75, Z), K(1.0, Z)],
      legL: [K(0, Z), K(0.4, [-0.3, 0, 0.3]), K(0.75, Z)],
      earL: [K(0, Z), K(0.56, [0.5, 0.45, 0]), K(0.75, Z)],
      earR: [K(0, Z), K(0.56, [-0.5, -0.45, 0]), K(0.75, Z)],
      tail: [K(0, Z), K(0.35, [-0.7, 0, 0]), K(0.56, [0.9, 0, 0]), K(1.0, Z)],
    },
  },

  fullPort: {
    duration: 1.3, loop: false,
    tracks: {
      torso: [K(0, Z), K(0.1, [0, 0, -0.35]), K(0.18, [0, 0, -0.75]), K(1.0, [0, 0, -0.75]), K(1.12, [0, 0, 0.1]), K(1.3, [0, 0, 0.06])],
      head: [K(0, Z), K(0.18, [0, 0, -0.55]), K(1.0, [0, 0, -0.55]), K(1.3, Z)],
      hips: [K(0, Z, HIP), K(0.18, [0, 0, -0.14], [-0.06, 1.0, 0]), K(1.0, [0, 0, -0.14], [0.06, 1.0, 0]), K(1.3, Z, HIP)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.18, [0.35, 0, -1.2]), K(1.0, [0.35, 0, -1.2]), K(1.3, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.18, [-0.35, 0, -1.2]), K(1.0, [-0.35, 0, -1.2]), K(1.3, [-0.1, 0, 0.3])],
      legL: [K(0, Z), K(0.18, [0, 0, 0.75]), K(0.31, [0, 0, -0.75]), K(0.44, [0, 0, 0.75]), K(0.57, [0, 0, -0.75]), K(0.7, [0, 0, 0.75]), K(0.83, [0, 0, -0.75]), K(1.0, [0, 0, 0.4]), K(1.3, Z)],
      legR: [K(0, Z), K(0.18, [0, 0, -0.75]), K(0.31, [0, 0, 0.75]), K(0.44, [0, 0, -0.75]), K(0.57, [0, 0, 0.75]), K(0.7, [0, 0, -0.75]), K(0.83, [0, 0, 0.75]), K(1.0, [0, 0, -0.3]), K(1.3, Z)],
      earL: [K(0, Z), K(0.18, [0, -0.6, 0]), K(1.0, [0, -0.6, 0]), K(1.3, Z)],
      earR: [K(0, Z), K(0.18, [0, 0.6, 0]), K(1.0, [0, 0.6, 0]), K(1.3, Z)],
      tail: [K(0, Z), K(0.18, [-1.1, 0, 0]), K(1.0, [-1.1, 0, 0]), K(1.3, Z)],
    },
  },

  maxLeverage: {
    duration: 0.73, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.15, [0, 0, -0.08], [0, 1.02, 0]), K(0.3, [0, 0, 0.06], [0, 1.24, 0]), K(0.73, Z, HIP)],
      torso: [K(0, Z), K(0.15, [0, 0, -0.3]), K(0.3, [0, 0, 0.3]), K(0.6, [0, 0, 0.25]), K(0.73, [0, 0, 0.06])],
      head: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.6, [0, 0, 0.35]), K(0.73, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.15, [0.3, 0, 0.4]), K(0.3, [0.9, 0, 2.1]), K(0.6, [0.9, 0, 2.15]), K(0.73, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.15, [-0.3, 0, 0.4]), K(0.3, [-0.9, 0, 2.1]), K(0.6, [-0.9, 0, 2.15]), K(0.73, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, -1.9]), K(0.6, [0, 0, -1.95]), K(0.73, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.3, [0, 0, -1.9]), K(0.6, [0, 0, -1.95]), K(0.73, [0, 0, 0.55])],
      legL: [K(0, Z), K(0.3, [-0.15, 0, 0.15]), K(0.73, Z)],
      legR: [K(0, Z), K(0.3, [0.15, 0, 0.15]), K(0.73, Z)],
      earL: [K(0, Z), K(0.3, [0.3, 0.3, 0]), K(0.6, [0.3, 0.3, 0]), K(0.73, Z)],
      earR: [K(0, Z), K(0.3, [-0.3, -0.3, 0]), K(0.6, [-0.3, -0.3, 0]), K(0.73, Z)],
      tail: [K(0, Z), K(0.3, [0.9, 0, 0]), K(0.6, [0.9, 0, 0]), K(0.73, Z)],
    },
  },

  conviction: {
    duration: 0.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, -0.06], [0, 1.06, 0]), K(0.48, [0, 0, -0.06], [0, 1.06, 0]), K(0.6, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.48, [0, 0, -0.2]), K(0.6, [0, 0, 0.06])],
      head: [K(0, Z), K(0.12, [0, 0, -0.45]), K(0.48, [0, 0, -0.45]), K(0.6, [0, 0, -0.06])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.12, [0.4, 0, 0.5]), K(0.48, [0.4, 0, 0.5]), K(0.6, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.12, [-0.4, 0, 0.5]), K(0.48, [-0.4, 0, 0.5]), K(0.6, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.12, [0, 0, 0.9]), K(0.48, [0, 0, 0.9]), K(0.6, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.12, [0, 0, 0.9]), K(0.48, [0, 0, 0.9]), K(0.6, [0, 0, 0.55])],
      legL: [K(0, [0, 0, 0.04]), K(0.12, [-0.2, 0, 0.2]), K(0.48, [-0.2, 0, 0.2]), K(0.6, [0, 0, 0.04])],
      legR: [K(0, [0, 0, -0.04]), K(0.12, [0.2, 0, 0.2]), K(0.48, [0.2, 0, 0.2]), K(0.6, [0, 0, -0.04])],
      earL: [K(0, Z), K(0.12, [0, -0.5, 0]), K(0.48, [0, -0.5, 0]), K(0.6, Z)],
      earR: [K(0, Z), K(0.12, [0, 0.5, 0]), K(0.48, [0, 0.5, 0]), K(0.6, Z)],
      tail: [K(0, Z), K(0.25, [0.6, 0, 0]), K(0.48, [0.6, 0, 0]), K(0.6, Z)],
    },
  },

  godCandle: {
    duration: 1.83, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.25, [0, 0, -0.1], [-0.05, 1.02, 0]), K(0.5, [0, 0, 0.08], [0, 1.22, 0]), K(0.75, [0, 0, -0.12], [0.04, 0.92, 0]), K(1.1, Z, [0, 1.1, 0]), K(1.83, Z, HIP)],
      torso: [K(0, Z), K(0.25, [0, 0, -0.35]), K(0.5, [0, 0, 0.35]), K(0.75, [0, 0, -0.55]), K(1.1, [0, 0, 0.25]), K(1.83, [0, 0, 0.06])],
      head: [K(0, Z), K(0.5, [0, 0, 0.35]), K(0.75, [0, 0, -0.35]), K(1.1, [0, 0, 0.55]), K(1.5, [0, 0, 0.5]), K(1.83, Z)],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.25, [-0.3, 0, 0.6]), K(0.5, [0, 0, 2.9]), K(0.75, [0, 0, -0.9]), K(1.1, [0, 0, 2.6]), K(1.5, [0, 0, 2.6]), K(1.83, [-0.1, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.5, [0, 0, 0.1]), K(0.75, [0, 0, 0.2]), K(1.1, [0, 0, 0.1]), K(1.83, [0, 0, 0.55])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.5, [0.3, 0, 0.7]), K(0.75, [0.4, 0, -0.7]), K(1.1, [0.3, 0, 0.9]), K(1.83, [0.1, 0, 0.28])],
      legL: [K(0, Z), K(0.75, [-0.35, 0, 0.7]), K(1.0, Z)],
      legR: [K(0, Z), K(0.75, [0.35, 0, 0.7]), K(1.0, Z)],
      shinL: [K(0, Z), K(0.75, [0, 0, -0.8]), K(1.0, Z)],
      shinR: [K(0, Z), K(0.75, [0, 0, -0.8]), K(1.0, Z)],
      earL: [K(0, Z), K(0.76, [0.5, 0.5, 0]), K(1.0, Z), K(1.83, Z)],
      earR: [K(0, Z), K(0.76, [-0.5, -0.5, 0]), K(1.0, Z), K(1.83, Z)],
      tail: [K(0, Z), K(0.5, [-0.8, 0, 0]), K(0.78, [0.9, 0, 0]), K(1.2, Z), K(1.83, Z)],
    },
  },

  bearCostume: {
    duration: 1.17, loop: false,
    tracks: {
      hips: [K(0, Z, HIP)],
      // reaches behind his head, dons the tiny sad mask, points at it, shakes head
      armR: [K(0, [-0.1, 0, 0.3]), K(0.14, [0, 1.2, 2.4]), K(0.26, [0, 0.4, 2.6]), K(0.4, [0, 0, 1.5]), K(0.55, [0, 0, 1.6]), K(0.85, [0, 0, 1.6]), K(1.17, [-0.1, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.14, [0, 0, -1.7]), K(0.26, [0, 0, -1.9]), K(0.4, [0, 0, -0.3]), K(0.55, [0, 0, -0.2]), K(1.17, [0, 0, 0.55])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.4, [0.2, 0, 0.5]), K(1.17, [0.1, 0, 0.28])],
      head: [K(0, Z), K(0.26, [0, 0, 0.15]), K(0.55, [0, 0, -0.1]), K(0.68, [0.35, 0, -0.1]), K(0.82, [-0.35, 0, -0.1]), K(0.96, [0.35, 0, -0.1]), K(1.1, Z), K(1.17, Z)],
      torso: [K(0, Z), K(0.26, [0, 0.1, -0.1]), K(0.55, [0, 0, -0.15]), K(1.17, [0, 0, 0.06])],
      earL: [K(0, Z), K(0.55, [0.5, 0, 0]), K(1.0, [0.5, 0, 0]), K(1.17, Z)],
      earR: [K(0, Z), K(0.55, [-0.5, 0, 0]), K(1.0, [-0.5, 0, 0]), K(1.17, Z)],
      tail: [K(0, Z), K(0.55, [1.0, 0, 0]), K(1.0, [1.0, 0, 0]), K(1.17, Z)],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
    },
  },

  // finisher: three escalating ground-slams pumping candles, then arms crossed
  finalPump: {
    duration: 3.8, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, [0, 0, -0.15], [0, 0.9, 0]), K(0.4, Z, [0, 1.12, 0]), K(0.75, [0, 0, -0.18], [0.02, 0.85, 0]), K(0.87, Z, [0, 1.15, 0]), K(1.25, [0, 0, -0.22], [0.04, 0.8, 0]), K(1.4, [0, 0, 0.1], [0, 1.3, 0]), K(1.6, Z, HIP), K(3.8, Z, HIP)],
      torso: [K(0, Z), K(0.3, [0, 0, -0.5]), K(0.75, [0, 0, -0.55]), K(1.25, [0, 0, -0.65]), K(1.4, [0, 0, 0.3]), K(1.8, [0, 0, 0.15]), K(3.8, [0, 0, 0.06])],
      head: [K(0, Z), K(0.3, [0, 0, -0.35]), K(1.25, [0, 0, -0.4]), K(1.4, [0, 0, 0.5]), K(1.8, [0, 0, 0.45]), K(2.6, [0, 0, 0.4]), K(3.3, [0, 0, 0.1]), K(3.8, Z)],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.2, [0, 0, 2.4]), K(0.3, [0, 0, -0.8]), K(0.65, [0, 0, 2.5]), K(0.75, [0, 0, -0.9]), K(1.1, [0, 0, 2.7]), K(1.25, [0, 0, -1.0]), K(1.5, [0, 0, 2.5]), K(2.4, [0, 0, 2.5]), K(2.9, [0.45, 0, 0.9]), K(3.8, [0.45, 0, 0.9])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.2, [0, 0, 0.2]), K(1.5, [0, 0, 0.1]), K(2.9, [0, 0, 1.6]), K(3.8, [0, 0, 1.6])],
      armL: [K(0, [0.1, 0, 0.28]), K(0.3, [0.3, 0, -0.7]), K(0.75, [0.3, 0, -0.8]), K(1.25, [0.3, 0, -0.9]), K(1.5, [0.2, 0, 0.6]), K(2.9, [-0.45, 0, 0.95]), K(3.8, [-0.45, 0, 0.95])],
      forearmL: [K(0, [0, 0, 0.5]), K(2.9, [0, 0, 1.7]), K(3.8, [0, 0, 1.7])],
      legL: [K(0, Z), K(0.3, [-0.35, 0, 0.7]), K(0.4, Z), K(0.75, [-0.35, 0, 0.75]), K(0.87, Z), K(1.25, [-0.4, 0, 0.85]), K(1.4, Z), K(3.8, [0, 0, 0.04])],
      legR: [K(0, Z), K(0.3, [0.35, 0, 0.7]), K(0.4, Z), K(0.75, [0.35, 0, 0.75]), K(0.87, Z), K(1.25, [0.4, 0, 0.85]), K(1.4, Z), K(3.8, [0, 0, -0.04])],
      shinL: [K(0, Z), K(0.3, [0, 0, -0.8]), K(0.4, Z), K(0.75, [0, 0, -0.85]), K(0.87, Z), K(1.25, [0, 0, -0.95]), K(1.4, Z), K(3.8, Z)],
      shinR: [K(0, Z), K(0.3, [0, 0, -0.8]), K(0.4, Z), K(0.75, [0, 0, -0.85]), K(0.87, Z), K(1.25, [0, 0, -0.95]), K(1.4, Z), K(3.8, Z)],
      earL: [K(0, Z), K(0.32, [0.4, 0.4, 0]), K(0.5, Z), K(0.77, [0.4, 0.4, 0]), K(0.95, Z), K(1.27, [0.5, 0.5, 0]), K(1.5, Z), K(3.8, Z)],
      earR: [K(0, Z), K(0.32, [-0.4, -0.4, 0]), K(0.5, Z), K(0.77, [-0.4, -0.4, 0]), K(0.95, Z), K(1.27, [-0.5, -0.5, 0]), K(1.5, Z), K(3.8, Z)],
      tail: [K(0, Z), K(0.3, [0.8, 0, 0]), K(0.75, [0.9, 0, 0]), K(1.25, [1.0, 0, 0]), K(1.6, Z), K(3.8, Z)],
    },
  },

  reserveCollapse: {
    duration: 0.8, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.13, [0, 0, -0.1], [0, 0.95, 0]), K(0.3, [0, 0, 0.15], [0, 1.5, 0]), K(0.4, [0, 0, -0.25], [0.05, 0.72, 0]), K(0.6, [0, 0, -0.1], [0, 0.9, 0]), K(0.8, Z, HIP)],
      torso: [K(0, Z), K(0.13, [0, 0, -0.3]), K(0.3, [0, 0, 0.35]), K(0.4, [0, 0, -0.7]), K(0.8, [0, 0, 0.06])],
      head: [K(0, Z), K(0.3, [0, 0, 0.35]), K(0.4, [0, 0, -0.4]), K(0.8, Z)],
      armL: [K(0, [0.1, 0, 0.28]), K(0.3, [-0.2, 0, 2.7]), K(0.4, [0.2, 0, -0.9]), K(0.6, [0.2, 0, -0.6]), K(0.8, [0.1, 0, 0.28])],
      armR: [K(0, [-0.1, 0, 0.3]), K(0.3, [0.2, 0, 2.7]), K(0.4, [-0.2, 0, -0.9]), K(0.6, [-0.2, 0, -0.6]), K(0.8, [-0.1, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 0.2]), K(0.4, [0, 0, 0.2]), K(0.8, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.55]), K(0.3, [0, 0, 0.2]), K(0.4, [0, 0, 0.2]), K(0.8, [0, 0, 0.55])],
      legL: [K(0, Z), K(0.3, [0, 0, 0.9]), K(0.4, [-0.4, 0, 0.9]), K(0.6, Z)],
      legR: [K(0, Z), K(0.3, [0, 0, 0.7]), K(0.4, [0.4, 0, 0.9]), K(0.6, Z)],
      shinL: [K(0, Z), K(0.3, [0, 0, -1.0]), K(0.4, [0, 0, -1.0]), K(0.6, Z)],
      shinR: [K(0, Z), K(0.3, [0, 0, -0.8]), K(0.4, [0, 0, -1.0]), K(0.6, Z)],
      earL: [K(0, Z), K(0.41, [0.6, 0.5, 0]), K(0.6, Z)],
      earR: [K(0, Z), K(0.41, [-0.6, -0.5, 0]), K(0.6, Z)],
      tail: [K(0, Z), K(0.3, [-1.0, 0, 0]), K(0.42, [1.0, 0, 0]), K(0.8, Z)],
    },
  },
}

// ---------------------------------------------------------------------------
// script helpers
// ---------------------------------------------------------------------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)

function inRange(fx, r) {
  if (!fx.foe || !fx.self) return false
  return Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) <= r && Math.abs(fx.foe.pos.y - fx.self.pos.y) < 2.2
}

// end() guard so parallel timelines can never call fx.end() twice
function onceEnd(fx) {
  let done = false
  return () => { if (!done) { done = true; fx.end() } }
}

function arenaBounds(fx) {
  try {
    const b = fx.arena()?.bounds
    if (b && Number.isFinite(b.minX) && Number.isFinite(b.maxX)) return b
  } catch { /* arena optional */ }
  return { minX: -9, maxX: 9 }
}

function clampToArena(fx, x) {
  const b = arenaBounds(fx)
  return Math.max(b.minX + 0.8, Math.min(b.maxX - 0.8, x))
}

// model group (the group returned by buildModel — hips' direct parent)
function modelGroup(fx) {
  try { return fx.self?.bones?.hips?.parent || null } catch { return null }
}

function bullData(fx) {
  return modelGroup(fx)?.userData || null
}

// hex = null restores each marking material's own base emissive
function glowMarks(fx, hex) {
  const ud = bullData(fx)
  if (!ud?.markMats) return
  for (const m of ud.markMats) {
    try { m.emissive.setHex(hex ?? (m.userData?.baseEm ?? C.greenEm)) } catch { /* material gone */ }
  }
  try {
    const v = ud.visorMat
    if (v) v.emissive.setHex(hex ?? (v.userData?.baseEm ?? C.visorEm))
  } catch { /* material gone */ }
}

// smash every physics prop within `radius` of x — the boss does not route around
function smashPropsNear(fx, x, radius, dirX) {
  try {
    const ph = fx.physics()
    const list = [...(ph?.props || [])]
    let smashed = 0
    for (const h of list) {
      const p = h?.mesh?.position
      if (!p || p.y > 3.2) continue
      if (Math.abs(p.x - x) <= radius) {
        try { fx.impulse(h, [dirX * 9, 7, (Math.random() - 0.5) * 5], 3) } catch { /* prop gone */ }
        try { h.break?.() } catch { /* not breakable */ }
        smashed++
      }
    }
    return smashed
  } catch { return 0 }
}

// spawn a (possibly giant, possibly tinted) chart candle prop
function popCandle(fx, x, scale = 1, up = true, riseVel = 9) {
  let h = null
  try {
    h = fx.spawnProp('candle', v3(clampToArena(fx, x), 0.2, 0))
    if (h?.mesh) {
      try {
        h.mesh.scale.set(scale, scale * 1.35, scale)
        const body = h.mesh.material
        if (body?.color) body.color.setHex(up ? C.green : C.red)
        const wick = h.mesh.children?.[0]
        if (wick?.material?.color) wick.material.color.setHex(up ? 0x1f9151 : 0xa62c3a)
      } catch { /* cosmetic tint only */ }
      try { fx.impulse(h, [0, riseVel, 0], 0.4) } catch { /* physics stub */ }
    }
  } catch { /* prop budget — the show goes on */ }
  return h
}

function disposeObj(o) {
  if (!o) return
  try {
    o.parent?.remove(o)
    o.traverse?.((c) => {
      if (c.isMesh) { c.geometry?.dispose?.(); c.material?.dispose?.() }
    })
  } catch { /* best-effort cleanup */ }
}

function sceneOf(fx) {
  try {
    const s = fx.arena()?.group?.parent
    if (s) return s
  } catch { /* arena optional */ }
  try { return fx.self?.root?.parent || null } catch { return null }
}

// ---------------------------------------------------------------------------
// basic-move scripts
// ---------------------------------------------------------------------------
function shoulderChargeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('whoosh', { pitch: 0.7 })
  const tryHit = (r) => {
    if (landed || !inRange(fx, r)) return
    landed = true
    fx.sfx('punch_heavy')
    fx.shake(0.6)
    fx.particles('impact', v3(fx.foe.pos.x, 1.4, 0), { n: 10 })
    fx.hit({ damage: 13, knockback: { x: 12, y: 4, spin: 1 }, hitStun: 26, ragdoll: 1 })
  }
  for (let i = 0; i < 4; i++) {
    fx.after(9 + i * 3, () => {
      fx.impulse(fx.self, [F * 4.5, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.5, 0.2, 0), { n: 3 })
      tryHit(1.7)
    })
  }
  fx.after(23, () => tryHit(2.0))
  fx.after(37, end)
}

function bullRushScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('whoosh', { pitch: 0.6 })
  fx.sfx('moo', { pitch: 0.55, vol: 0.7 })
  const tryHit = (r) => {
    if (landed || !inRange(fx, r)) return
    landed = true
    fx.sfx('launch')
    fx.shake(0.55)
    fx.particles('impact', v3(fx.foe.pos.x, 1.3, 0), { n: 12 })
    fx.hit({ damage: 11, knockback: { x: 4, y: 11, spin: 1.6 }, hitStun: 30, ragdoll: 1 })
  }
  for (let i = 0; i < 3; i++) {
    fx.after(7 + i * 4, () => {
      fx.impulse(fx.self, [F * 6, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.5, 0.2, 0), { n: 4 })
      tryHit(1.8)
    })
  }
  fx.after(20, () => tryHit(2.1))
  fx.after(34, end)
}

function armorStanceScript(fx) {
  const end = onceEnd(fx)
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    try { glowMarks(fx, null) } catch { /* cosmetic */ }
  }
  fx.sfx('block')
  fx.sfx('moo', { pitch: 0.45, vol: 0.6 })
  fx.caption('DIAMOND HOOVES')
  try { glowMarks(fx, 0x2fd070) } catch { /* cosmetic */ }
  fx.particles('sparks', v3(fx.self.pos.x, 1.6, 0), { n: 8 })
  // stance ends with a body-check shove
  fx.after(38, () => {
    if (inRange(fx, 1.9)) {
      fx.sfx('thud')
      fx.shake(0.35)
      fx.hit({ damage: 4, knockback: { x: 8, y: 1.5, spin: 0.4 }, hitStun: 14 })
    }
  })
  fx.after(44, restore)
  fx.after(70, restore) // failsafe
  fx.after(48, end)
}

// ---------------------------------------------------------------------------
// special scripts
// ---------------------------------------------------------------------------
// 1) FULL PORT — charges across the ENTIRE arena, destroying every prop in his
//    path; big ragdoll on contact.
function openingBellScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(10, () => {
    // he IS the opening bell. the market opens on your jaw.
    fx.sfx('bell', { pitch: 0.8 })
    fx.shake(0.55)
    fx.particles('dust', v3(fx.self.pos.x + F * 1.2, 1.4, 0), { n: 12 })
    if (inRange(fx, 3.2)) {
      fx.sfx('punch_heavy')
      fx.hit({ damage: 14, knockback: { x: 12, y: 5, spin: 1.6 }, hitStun: 28, ragdoll: 1 })
      fx.caption('MARKET OPEN')
    } else {
      fx.caption('TRADING HALTED')
    }
  })
  fx.after(42, end)
}

function fullPortScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.caption('FULL PORT')
  fx.announcer('FULL PORT')
  fx.sfx('moo', { pitch: 0.4 }) // the ROAR
  fx.shake(0.4)
  fx.zoom(fx.self, 0.4)
  const tryHit = (r) => {
    if (landed || !inRange(fx, r)) return
    landed = true
    fx.sfx('explosion')
    fx.shake(1.1)
    fx.slowmo(0.35, 0.5)
    fx.particles('impact', v3(fx.foe.pos.x, 1.4, 0), { n: 20 })
    fx.hit({ damage: 20, knockback: { x: 16, y: 7, spin: 2.5 }, hitStun: 42, ragdoll: 2 })
    fx.caption('HE FULL PORTED')
  }
  for (let i = 0; i < 16; i++) {
    fx.after(10 + i * 3, () => {
      if (landed) return
      const b = arenaBounds(fx)
      const nearWall = F > 0 ? fx.self.pos.x > b.maxX - 1.3 : fx.self.pos.x < b.minX + 1.3
      if (!nearWall) fx.impulse(fx.self, [F * 5.5, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.6, 0.2, 0), { n: 4 })
      if (i % 3 === 0) fx.sfx('thud', { pitch: 1.15, vol: 0.7 })
      if (smashPropsNear(fx, fx.self.pos.x + F * 0.8, 1.6, F) > 0) fx.sfx('break', { vol: 0.8 })
      tryHit(1.9)
    })
  }
  fx.after(60, () => { if (!landed) fx.caption('BOUGHT THE WALL. HIT NOTHING.') })
  fx.after(74, end)
}

// 2) MAXIMUM LEVERAGE — 1.6x scale for 5s; scaled whiffs cost 8 self-damage.
function maxLeverageScript(fx) {
  const end = onceEnd(fx)
  const grp = modelGroup(fx)
  const ud = bullData(fx)
  const baseScale = ud?.baseScale ?? 1
  if (ud?.leverageActive) { // no stacking — flex again when the position closes
    fx.caption('ALREADY MAX LEVERAGED')
    fx.after(30, end)
    return
  }
  if (ud) ud.leverageActive = true
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    if (ud) ud.leverageActive = false
    try { grp?.scale.setScalar(baseScale) } catch { /* model gone */ }
    fx.self.damageMult = 1
    try { glowMarks(fx, null) } catch { /* cosmetic */ }
  }
  fx.caption('MAXIMUM LEVERAGE')
  fx.announcer('MAXIMUM LEVERAGE')
  fx.sfx('moo', { pitch: 0.35 })
  fx.sfx('boing', { pitch: 0.5 })
  fx.shake(0.6)
  fx.particles('sparks', v3(fx.self.pos.x, 1.8, 0), { n: 14 })
  try { glowMarks(fx, 0x2fd070) } catch { /* cosmetic */ }
  fx.self.damageMult = 1.5 // engine multiplier if supported; harmless field otherwise
  // swell up over ~10 frames
  for (let i = 1; i <= 8; i++) {
    fx.after(4 + i, () => {
      if (restored) return
      try { grp?.scale.setScalar(baseScale * (1 + 0.6 * (i / 8))) } catch { /* model gone */ }
    })
  }
  // whiff monitor: any completed non-scripted attack that never touched the foe
  // liquidates 8 HP. (Timers survive fx.end() by design — see SpecialContext.)
  let watching = null
  for (let i = 1; i <= 148; i++) {
    fx.after(14 + i * 2, () => {
      if (restored) return
      const s = fx.self
      if (!s || s.hp <= 0 || s.state === 'ko') { restore(); return }
      const m = s.currentMove
      if (m && m !== watching) {
        // only plain attacks count; scripted moves manage their own drama
        watching = (!m.script && (m.damage || 0) > 0) ? m : null
      }
      if (!m && watching) {
        const whiffed = !s.contactMade
        watching = null
        if (whiffed) {
          try { s.setHp(Math.max(1, s.hp - 8)) } catch { /* engine variant */ }
          try { s.flash?.(0xff2233) } catch { /* cosmetic */ }
          // §17 ownership: skip the stagger if the ragdoll driver owns the body
          try { if (s.state !== 'ragdoll') s.enterHitstun?.(18, true, -s.facing * 1.2) } catch { /* stagger optional */ }
          fx.particles('sparks', v3(s.pos.x, 1.8, 0), { n: 12 })
          fx.sfx('thud', { pitch: 0.6 })
          fx.sfx('coin', { pitch: 0.5 })
          fx.shake(0.5)
          fx.caption('LIQUIDATED LEVERAGE')
        }
      }
    })
  }
  fx.after(314, restore)
  fx.after(360, restore) // failsafe
  fx.after(40, end)
}

// 3) INFINITE CONVICTION — 4s of pure armor; walks forward menacingly.
function convictionScript(fx) {
  const end = onceEnd(fx)
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    try { glowMarks(fx, null) } catch { /* cosmetic */ }
  }
  fx.caption('INFINITE CONVICTION')
  fx.announcer('INFINITE CONVICTION')
  fx.sfx('moo', { pitch: 0.3 })
  fx.shake(0.35)
  try { glowMarks(fx, 0x36e07a) } catch { /* cosmetic */ }
  let pulse = 0
  for (let i = 1; i <= 120; i++) {
    fx.after(10 + i * 2, () => {
      if (restored) return
      const s = fx.self
      if (!s || s.hp <= 0 || s.state === 'ko') { restore(); return }
      // hit stun simply does not apply to conviction
      try { s.armorFrames = Math.max(s.armorFrames || 0, 4) } catch { /* engine variant */ }
      // the slow, menacing walk
      if ((i % 3 === 0) && (s.state === 'idle' || s.state === 'walk')) {
        try { fx.impulse(s, [s.facing * 1.1, 0, 0]) } catch { /* physics stub */ }
      }
      if (i % 10 === 0) {
        pulse = 1 - pulse
        try { glowMarks(fx, pulse ? 0x36e07a : 0x1a8f4c) } catch { /* cosmetic */ }
        fx.particles('sparks', v3(s.pos.x, 1.2, 0), { n: 2 })
      }
    })
  }
  fx.after(252, restore)
  fx.after(300, restore) // failsafe
  fx.after(34, end)
}

// 4) GOD CANDLE (SUPER) — a gigantic green candle erupts beneath the foe and
//    rockets them into the sky; small red candles rain down after.
function godCandleScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('GOD CANDLE')
  fx.announcer('GOD CANDLE')
  fx.sfx('bell')
  fx.sfx('moo', { pitch: 0.3 })
  fx.zoom(fx.foe, 0.6)
  fx.slowmo(0.5, 0.5)
  fx.shake(0.4)
  // the floor rumbles under the foe...
  for (let i = 0; i < 3; i++) {
    fx.after(16 + i * 6, () => {
      fx.particles('dust', v3(fx.foe.pos.x, 0.15, 0), { n: 8 })
      fx.sfx('thud', { pitch: 0.7 + i * 0.15, vol: 0.7 })
      fx.shake(0.3 + i * 0.15)
    })
  }
  // ...ERUPTION
  fx.after(36, () => {
    const ex = clampToArena(fx, fx.foe.pos.x)
    popCandle(fx, ex, 3.0, true, 15)
    fx.sfx('launch')
    fx.sfx('explosion')
    fx.shake(1.4)
    fx.slowmo(0.3, 0.8)
    fx.zoom(fx.foe, 1.0)
    fx.particles('explosion', v3(ex, 1.5, 0), { n: 30 })
    fx.particles('sparks', v3(ex, 2.5, 0), { n: 16 })
    fx.hit({ damage: 34, knockback: { x: F * 2, y: 20, spin: 2 }, hitStun: 60, ragdoll: 2, pos: { x: ex, y: 1.2 } })
    fx.ragdoll(fx.foe, [F * 2, 26, 0]) // vertical ragdoll rocket
    fx.coins(v3(ex, 2.2, 0), 16)
    fx.caption('UP ONLY')
  })
  // the correction: small red candles rain down
  for (let i = 0; i < 7; i++) {
    fx.after(58 + i * 5, () => {
      const rx = fx.foe.pos.x + (Math.random() - 0.5) * 5
      const h = popCandle(fx, rx, 0.55, false, 0)
      if (h?.mesh) { try { h.mesh.position.y = 6.5 + Math.random() * 2 } catch { /* cosmetic */ } }
      try { if (h) fx.impulse(h, [(Math.random() - 0.5) * 3, -4, 0], 2) } catch { /* physics stub */ }
      fx.sfx('coin', { pitch: 0.6 + i * 0.08, vol: 0.6 })
    })
  }
  fx.after(96, () => fx.shake(0.3))
  fx.after(110, end)
}

// 5) RESERVE COLLAPSE (UNCHAINED ONLY) — arena-wide slam; ragdolls from anywhere.
function reserveCollapseScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('RESERVE COLLAPSE')
  fx.announcer('RESERVE COLLAPSE')
  fx.sfx('moo', { pitch: 0.28 })
  fx.after(8, () => {
    fx.impulse(fx.self, [0, 8, 0])
    fx.sfx('whoosh', { pitch: 0.6 })
  })
  fx.after(18, () => fx.impulse(fx.self, [0, -15, 0]))
  fx.after(24, () => {
    fx.sfx('explosion')
    fx.sfx('thud', { pitch: 0.5 })
    fx.shake(1.5)
    fx.slowmo(0.35, 0.6)
    const x0 = fx.self.pos.x
    const b = arenaBounds(fx)
    for (let i = 0; i < 7; i++) {
      const dx = x0 + (i - 3) * ((b.maxX - b.minX) / 7)
      fx.particles('dust', v3(clampToArena(fx, dx), 0.2, 0), { n: 8 })
    }
    smashPropsNear(fx, (b.minX + b.maxX) / 2, (b.maxX - b.minX), F)
    // the whole floor gives way — no range check, no mercy
    fx.hit({ damage: 22, knockback: { x: F * 8, y: 11, spin: 2.5 }, hitStun: 44, ragdoll: 2 })
    fx.caption('NOTHING IS BACKED BY ANYTHING')
  })
  fx.after(48, end)
}

// ---------------------------------------------------------------------------
// joke: BEAR COSTUME — a tiny sad bear mask, worn briefly, with contempt.
// ---------------------------------------------------------------------------
function makeBearMask() {
  const g = new THREE.Group()
  const brown = lamb(0x8a6a4a)
  g.add(sph(0.24, brown, 0, 0, 0, 1, 1.05, 0.95))
  g.add(sph(0.11, lamb(0xc9a980), 0.18, -0.07, 0))
  g.add(sph(0.05, lamb(0x2a2020), 0.28, -0.05, 0))
  g.add(sph(0.09, brown, -0.04, 0.2, 0.16))
  g.add(sph(0.09, brown, -0.04, 0.2, -0.16))
  // deeply sad downturned eyes
  g.add(box(0.03, 0.03, 0.1, lamb(0x1a1414), 0.21, 0.08, 0.1, 0.5))
  g.add(box(0.03, 0.03, 0.1, lamb(0x1a1414), 0.21, 0.08, -0.1, -0.5))
  return g
}

function bearCostumeScript(fx) {
  const end = onceEnd(fx)
  let mask = null
  let removed = false
  const removeMask = () => {
    if (removed) return
    removed = true
    disposeObj(mask)
    mask = null
  }
  fx.sfx('menu_back')
  fx.caption('...A BEAR COSTUME?')
  fx.after(10, () => {
    try {
      mask = makeBearMask()
      // Re-derived after the skull rebuild (docs §0): the old (0.30, 0.16, 0)
      // was measured against a head that was a box centred on the bone. The
      // skull now hangs SKULL_PITCH forward-and-down off the poll joint, so the
      // face it has to cover sits well below and ahead of the head bone. This
      // is the skull-local muzzle centre (0.62, -0.03) mapped back through the
      // bind pitch; re-solve it if SKULL_PITCH ever moves again.
      mask.position.set(0.520, -0.275, 0)
      mask.rotation.z = SKULL_PITCH + 0.10
      fx.self.bones?.head?.add(mask)
    } catch { mask = null }
    fx.sfx('boing', { pitch: 0.6 })
  })
  fx.after(26, () => fx.sfx('moo', { pitch: 1.1, vol: 0.5 })) // smallest, saddest moo
  fx.after(34, () => {
    if (inRange(fx, 3.0)) {
      fx.sfx('punch_light', { pitch: 1.6 })
      fx.slowmo(0.4, 0.4)
      fx.shake(0.4)
      fx.particles('stars', v3(fx.foe.pos.x, 1.8, 0), { n: 10 })
      // 1 psychological damage + knockdown
      fx.hit({ damage: 1, knockback: { x: 3, y: 5, spin: 1.2 }, hitStun: 34, ragdoll: 2 })
      fx.caption('1 PSYCHOLOGICAL DAMAGE')
      fx.announcer('BEARISH')
    } else {
      fx.caption('NOBODY EVEN SAW IT')
    }
  })
  fx.after(56, removeMask)
  fx.after(90, removeMask) // failsafe
  fx.after(70, end)
}

// ---------------------------------------------------------------------------
// finisher: THE FINAL PUMP
// ---------------------------------------------------------------------------
function makeMoonProp() {
  const g = new THREE.Group()
  const moonM = new THREE.MeshBasicMaterial({ color: 0xd8dce6 })
  g.add(sph(0.55, moonM))
  const craterM = new THREE.MeshBasicMaterial({ color: 0xb2b8c6 })
  g.add(sph(0.12, craterM, 0.28, 0.3, 0.3))
  g.add(sph(0.09, craterM, 0.4, -0.15, 0.28))
  g.add(sph(0.07, craterM, 0.15, 0.42, -0.3))
  const poleM = new THREE.MeshBasicMaterial({ color: 0x9aa1ad })
  g.add(box(0.03, 0.7, 0.03, poleM, 0, 0.8, 0))
  const flagM = new THREE.MeshBasicMaterial({ color: 0x37e07a })
  g.add(box(0.02, 0.18, 0.3, flagM, 0, 1.02, 0.16))
  g.add(box(0.022, 0.03, 0.16, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.001, 1.0, 0.14, 0.6))
  return g
}

function finalPumpScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let moon = null
  let moonGone = false
  const removeMoon = () => {
    if (moonGone) return
    moonGone = true
    disposeObj(moon)
    moon = null
  }
  fx.slowmo(0.5, 1.0)
  fx.zoom(fx.self, 0.8)
  fx.caption('THE FINAL PUMP')
  fx.announcer('THE FINAL PUMP')
  fx.sfx('moo', { pitch: 0.3 }) // the roar of a bull who has never sold
  fx.shake(0.5)
  fx.self.playClip?.('finalPump')

  // lock them in place — they are the exit liquidity now
  fx.after(10, () => {
    fx.sfx('grab')
    fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 90 })
  })

  // pop 1 — a respectable candle
  fx.after(24, () => {
    popCandle(fx, fx.foe.pos.x, 1.0, true, 9)
    fx.sfx('coin', { pitch: 1.0 })
    fx.sfx('launch', { vol: 0.6 })
    fx.shake(0.5)
    fx.particles('sparks', v3(fx.foe.pos.x, 1.2, 0), { n: 8 })
    fx.hit({ damage: 4, knockback: { x: F * 1, y: 9, spin: 1 }, ragdoll: 2 })
    fx.caption('PUMP.')
  })

  // pop 2 — a concerning candle
  fx.after(52, () => {
    popCandle(fx, fx.foe.pos.x, 1.9, true, 12)
    fx.sfx('coin', { pitch: 1.35 })
    fx.sfx('launch', { vol: 0.8 })
    fx.shake(0.8)
    fx.slowmo(0.5, 0.3)
    fx.particles('sparks', v3(fx.foe.pos.x, 2.0, 0), { n: 14 })
    fx.hit({ damage: 6, knockback: { x: F * 1.5, y: 15, spin: 1.5 }, ragdoll: 2 })
    fx.caption('PUMP HARDER.')
  })

  // pop 3 — the MONSTER candle. through the roof.
  fx.after(84, () => {
    popCandle(fx, fx.foe.pos.x, 3.6, true, 18)
    fx.sfx('explosion')
    fx.sfx('launch')
    fx.shake(1.5)
    fx.slowmo(0.3, 0.9)
    fx.zoom(fx.foe, 1.2)
    fx.particles('explosion', v3(fx.foe.pos.x, 2.0, 0), { n: 30 })
    fx.hit({ damage: 8, knockback: { x: F * 2, y: 30, spin: 2 }, ragdoll: 2 })
    fx.ragdoll(fx.foe, [F * 3, 32, 0])
    fx.coins(v3(fx.foe.pos.x, 2.5, 0), 20)
    fx.caption('THROUGH THE ROOF')
  })

  // ...a beat of silence. price discovery...

  // the tiny moon with a flag appears in the sky arc
  fx.after(130, () => {
    try {
      const scene = sceneOf(fx)
      if (scene) {
        moon = makeMoonProp()
        moon.position.set(clampToArena(fx, fx.self.pos.x + F * 3), 10.5, -4)
        moon.rotation.z = -0.2
        scene.add(moon)
        fx.particles('stars', moon.position.clone(), { n: 10 })
        fx.sfx('coin', { pitch: 2.0, vol: 0.4 })
      }
    } catch { moon = null }
  })

  // re-entry: smoking ragdoll comes home
  for (let i = 0; i < 7; i++) {
    fx.after(146 + i * 4, () => {
      try { fx.particles('smoke', v3(fx.foe.pos.x, Math.max(0.5, fx.foe.pos.y + 1), 0), { n: 4 }) } catch { /* cosmetic */ }
    })
  }
  fx.after(174, () => {
    fx.shake(1.2)
    fx.sfx('explosion')
    fx.sfx('thud', { pitch: 0.5 })
    fx.slowmo(0.4, 0.6)
    fx.particles('explosion', v3(fx.foe.pos.x, 0.8, 0), { n: 24 })
    fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 14 })
    fx.coins(v3(fx.foe.pos.x, 1.4, 0), 12)
    fx.caption('FINAL PUMP')
    fx.announcer('GG. NO RE.')
  })

  fx.after(210, removeMoon)
  fx.after(300, removeMoon) // failsafe
  fx.after(218, end)
}

// ---------------------------------------------------------------------------
// move tables
// ---------------------------------------------------------------------------
function buildMoves() {
  return [
    // -------------------------------------------------------------- basics --
    {
      id: 'horn-jab', name: 'Horn Jab', kind: 'light',
      input: ['light'],
      damage: 7, startup: 5, active: 3, recovery: 9,
      hitbox: { w: 1.0, h: 0.9, d: 1.0, forward: 1.1, up: 1.7 },
      knockback: { x: 5, y: 1.5, spin: 0.4 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'hornJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'visor-glint', name: 'Visor Glint', kind: 'light',
      input: ['forward', 'light'],
      damage: 5, startup: 4, active: 2, recovery: 8,
      hitbox: { w: 0.9, h: 0.8, d: 0.9, forward: 1.0, up: 1.6 },
      knockback: { x: 4, y: 1, spin: 0.3 },
      hitStun: 12, blockStun: 7, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'visorGlint', sfx: 'punch_light', script: null,
    },
    {
      id: 'heavy-hook', name: 'Heavy Hook', kind: 'heavy',
      input: ['heavy'],
      damage: 14, startup: 11, active: 4, recovery: 17,
      hitbox: { w: 1.1, h: 1.0, d: 1.0, forward: 1.0, up: 1.5 },
      knockback: { x: 9, y: 2.5, spin: 0.8 },
      hitStun: 22, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'heavyHook', sfx: 'punch_heavy', script: null,
    },
    {
      id: 'ground-punch', name: 'Ground Punch', kind: 'heavy',
      input: ['down', 'heavy'],
      damage: 12, startup: 13, active: 5, recovery: 20,
      // double-fist floor slam — wide, low shockwave
      hitbox: { w: 3.0, h: 0.8, d: 1.8, forward: 0.9, up: 0.4 },
      knockback: { x: 3, y: 9.5, spin: 0.8 },
      hitStun: 26, blockStun: 13, hitStop: 6,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'groundPunch', sfx: 'thud', script: null,
    },
    {
      id: 'shoulder-charge', name: 'Shoulder Charge', kind: 'heavy',
      input: ['forward', 'heavy'],
      damage: 13, startup: 9, active: 12, recovery: 16,
      hitbox: { w: 1.2, h: 1.5, d: 1.1, forward: 1.0, up: 1.2 },
      knockback: { x: 12, y: 4, spin: 1 },
      hitStun: 26, blockStun: 14, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 8, // a freight train does not flinch
      clip: 'shoulderCharge', sfx: 'whoosh',
      script: shoulderChargeScript,
    },
    {
      id: 'boot-stomp', name: 'Boot Stomp', kind: 'kick',
      input: ['kick'],
      damage: 9, startup: 9, active: 4, recovery: 15,
      // small AoE around the hoof
      hitbox: { w: 1.9, h: 0.7, d: 1.5, forward: 0.7, up: 0.3 },
      knockback: { x: 6, y: 5.5, spin: 0.6 },
      hitStun: 18, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'bootStomp', sfx: 'thud', script: null,
    },
    {
      id: 'bull-rush', name: 'Bull Rush', kind: 'launcher',
      input: ['forward', 'kick'],
      damage: 11, startup: 8, active: 10, recovery: 16,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.1 },
      knockback: { x: 4, y: 11, spin: 1.6 },
      hitStun: 30, blockStun: 13, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'bullRush', sfx: 'whoosh',
      script: bullRushScript,
    },
    {
      id: 'armor-stance', name: 'Armor Stance', kind: 'heavy',
      input: ['back', 'heavy'],
      damage: 4, startup: 6, active: 24, recovery: 18,
      hitbox: { w: 1.0, h: 1.4, d: 1.0, forward: 0.8, up: 1.2 },
      knockback: { x: 8, y: 1.5, spin: 0.4 },
      hitStun: 14, blockStun: 9, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0,
      armor: 30, // the whole point
      clip: 'armorStance', sfx: 'block',
      script: armorStanceScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'grapple-toss', name: 'Grapple Toss', kind: 'grab',
      input: ['grab'],
      damage: 13, startup: 8, active: 4, recovery: 38,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 1.0, up: 1.3 },
      // one-hand hurl across the arena
      knockback: { x: 17, y: 6, spin: 2.5 },
      hitStun: 34, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'grappleToss', sfx: 'grab', script: null,
    },
    {
      id: 'market-correction', name: 'Market Correction', kind: 'grab',
      input: ['down', 'grab'],
      damage: 15, startup: 10, active: 4, recovery: 46,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 0.9, up: 1.2 },
      // lifted overhead, folded in half onto the knee
      knockback: { x: 3, y: 10, spin: 3 },
      hitStun: 36, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'marketCorrection', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'opening-bell', name: 'Opening Bell', kind: 'special',
      input: ['special'],
      damage: 14, startup: 10, active: 4, recovery: 28,
      hitbox: { w: 1.4, h: 1.4, d: 1.1, forward: 1.4, up: 1.2 },
      knockback: { x: 12, y: 5, spin: 1.6 },
      hitStun: 28, blockStun: 13, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'fullPort', sfx: 'bell',
      script: openingBellScript,
    },
    {
      id: 'full-port', name: 'Full Port', kind: 'special',
      input: ['down', 'special'],
      damage: 20, startup: 10, active: 50, recovery: 18,
      hitbox: { w: 1.3, h: 1.6, d: 1.1, forward: 1.0, up: 1.2 },
      knockback: { x: 16, y: 7, spin: 2.5 },
      hitStun: 42, blockStun: 15, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 25,
      armor: 12,
      clip: 'fullPort', sfx: 'whoosh',
      script: fullPortScript,
    },
    {
      id: 'maximum-leverage', name: 'Maximum Leverage', kind: 'special',
      input: ['back', 'special'],
      damage: 0, startup: 8, active: 2, recovery: 34,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'maxLeverage', sfx: 'boing',
      script: maxLeverageScript,
    },
    {
      id: 'infinite-conviction', name: 'Infinite Conviction', kind: 'special',
      input: ['forward', 'special'],
      damage: 0, startup: 8, active: 2, recovery: 26,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 35, armor: 10,
      clip: 'conviction', sfx: 'block',
      script: convictionScript,
    },
    {
      id: 'god-candle', name: 'God Candle', kind: 'super',
      input: ['super'],
      damage: 34, startup: 20, active: 40, recovery: 50,
      hitbox: { w: 1.6, h: 2.2, d: 1.2, forward: 1.2, up: 1.2 },
      knockback: { x: 2, y: 20, spin: 2 },
      hitStun: 60, blockStun: 18, hitStop: 8,
      launcher: true, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 12,
      clip: 'godCandle', sfx: 'bell',
      script: godCandleScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'bear-costume', name: 'Bear Costume', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 14, active: 4, recovery: 52,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.2 },
      knockback: { x: 3, y: 5, spin: 1.2 },
      hitStun: 34, blockStun: 8, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'bearCostume', sfx: 'menu_back',
      script: bearCostumeScript,
    },
  ]
}

// UNCHAINED remix: faster startups/recovery, God Candle at half price, plus
// Reserve Collapse as an extra special on top of the base four.
function buildUnchainedMoves() {
  const moves = buildMoves().map((m) => {
    const c = { ...m }
    c.startup = Math.max(3, Math.round((m.startup || 0) * 0.72))
    c.recovery = Math.max(6, Math.round((m.recovery || 0) * 0.85))
    if (c.id === 'god-candle') c.meterCost = 50
    return c
  })
  moves.push({
    id: 'reserve-collapse', name: 'Reserve Collapse', kind: 'special',
    input: ['down', 'super'],
    damage: 22, startup: 12, active: 6, recovery: 30,
    hitbox: { w: 2.5, h: 1.2, d: 2.0, forward: 0.8, up: 0.5 },
    knockback: { x: 8, y: 11, spin: 2.5 },
    hitStun: 44, blockStun: 16, hitStop: 8,
    launcher: true, ragdollThreshold: 2,
    meterGain: 0, meterCost: 40, armor: 14,
    clip: 'reserveCollapse', sfx: 'explosion',
    script: reserveCollapseScript,
  })
  return moves
}

const finisher = {
  id: 'the-final-pump',
  name: 'The Final Pump',
  script: finalPumpScript,
}

// ---------------------------------------------------------------------------
// the CharacterDefs
// ---------------------------------------------------------------------------
export const BlackishBullDef = {
  id: 'blackish-bull',
  name: 'THE BLACKISH BULL',
  title: 'Lord of the Final Pump',
  bio: 'Nobody knows where he came from. One day the charts turned green and he was simply there, wearing a jacket with no sleeves because sleeves are for sellers. He has never taken profit, never touched grass, and never once looked behind the visor. Every candle you have ever celebrated was him, warming up.',
  style: 'Final-boss power grappler. Walks through your offense with armor, folds you in half on his knee, and settles every argument with a candle the size of a building. Slow of foot, absolute of conviction.',
  stats: { power: 10, speed: 4, defense: 9, chaos: 8 },
  height: 2.5,
  weight: 2.0,
  walkSpeed: 3.4,
  dashSpeed: 7.5,
  jumpVel: 8,

  buildModel(costume = 0) { return buildBullModel(costume, { unchained: false }) },
  clips,

  moves: buildMoves(),
  finisher,

  voice: { pitch: 0.25, rate: 0.8 },
}

// Story round 10 only — NOT registered in the select roster.
export const BlackishBullUnchainedDef = {
  id: 'blackish-bull-unchained',
  name: 'THE BLACKISH BULL',
  title: 'UNCHAINED',
  bio: 'The jacket is off. The chart is skin now. The reserve backing his conviction turned out to be more conviction, and it is compounding. This is what the top of the market looks like from underneath.',
  style: 'Everything the boss was, but faster, angrier and fully unhedged. God Candle at half price. The floor itself is no longer guaranteed.',
  stats: { power: 10, speed: 6, defense: 10, chaos: 10 },
  height: 2.9, // 2.5 x 1.15 — the leverage is showing
  weight: 2.0,
  walkSpeed: 4.4, // x1.3
  dashSpeed: 9.75, // x1.3
  jumpVel: 8.5,

  buildModel(costume = 0) { return buildBullModel(costume, { unchained: true }) },
  clips,

  moves: buildUnchainedMoves(),
  finisher,

  voice: { pitch: 0.25, rate: 0.8 },
}
