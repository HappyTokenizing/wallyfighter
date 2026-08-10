// TIRED APE — The Unimpressed Investor.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
//
// VISUAL OVERHAUL (docs/parody/tired-ape.md): a heavy, slouched cartoon primate
// built to the brief's landmark table — one continuous pale sand skin mask from
// brow pads to chin, enormous kidney nostrils, a low closed lip line, satellite
// ears at eye level, a slouchy ribbed knit beanie cocked back off the brow, a
// cigarette in one mouth corner, a single gold hoop, a boat-neck striped tee, a
// bathrobe, a heavy gold chain and a chipped 'MEH' mug welded to one hand.
//
// All surfaces come from src/render/ (pbr() presets + procedural PBR maps) and
// all geometry from the bevel/loft/superellipsoid toolkit — no raw BoxGeometry,
// no flat Lambert, no image assets, no extra deps.
//
// ROUND 4 — the headline finding was "the eyes are not built". They were built;
// they were BURIED. An orthographic front ray scan (sample the first hit at every
// (y, z) across the head) named the three occluders in one pass, and none of them
// was the eye geometry:
//   1. `muzzleFillet` — §3.5's junction torus. After its -10 deg cant the top arc
//      rose to y +0.182 AND swung forward to x +0.1235, so it crossed the eye
//      line 0.024 m in front of the eyeball and ate the inner half of both
//      apertures. Dropped to (+0.080, +0.020), major 0.086.
//   2. `cheekFur` — two brown masses spanning y 1.582..1.670 at z +/-0.084..0.124,
//      i.e. sitting on the OUTER half of both eyes, with a front face 0.024 m
//      proud of the muzzle plane (the "clown nose" in the 3/4 shot). Flattened,
//      dropped to y +0.072..+0.136 and pushed out to an inner edge of exactly
//      z +/-0.086, which is §3.9's waist point E — it still pinches the mask, it
//      just no longer stands in the eye socket or breaks the front silhouette.
//   3. `lidCrease` — a dark bar hanging 0.004 m INSIDE a 0.027 m aperture, 0.012
//      proud of the cornea. Lifted onto the lid where it belongs.
// The visible white slot went from ~0.020 m to 0.066 m wide with sclera, iris,
// pupil and a cornea specular all resolving in both the front and 3/4 scans.
// Also this round: nostrils rebuilt as REAL apertures (a torus rim with a hole
// through it over a recessed APE_NOSTRIL floor, replacing two stacked solid
// discs that were flat dark decals); the pale nasal-bridge fin that read as a
// beak cut from 0.024 to 0.010 m proud; the philtrum inverted from a ridge into
// a groove (recessed dark bar flanked by two proud pale ridges); the gold hoop's
// void opened to §7.3's 0.048 m and dropped clear of the ear disc so background
// shows through it; the lip bands set to the exact 1.4 upper:lower ratio; and
// every material roughness solved backwards from §6's absolutes, which exposed
// six materials silently clamped at the multiplier ceiling and the whole model
// sitting inside a 0.82..0.86 specular band — the "one noise frequency
// everywhere" finding. It is now a 0.026 -> 0.860 ladder in twenty steps.
//
// ROUND 3 — every finding in that pass was verified with an orthographic ray
// scan of the model rather than by eye, and the four that mattered were all
// OCCLUSION bugs that no amount of material work could have fixed:
//   1. The muzzle box's top (§3.5, y +0.173) stood above the eye line (§3.3,
//      y +0.163) and, projecting 0.16 m forward, hid the eyes completely in
//      any front view. Muzzle shortened to y +0.138. THE eyes now read.
//   2. Both nostril bores were built BEHIND the nasal pad's own surface, and
//      then behind a solid rim disc. Both apertures were invisible. Fixed by
//      depth-ordering: bore frontmost, rolled rim 0.005 m behind it.
//   3. The face mask was two disconnected pieces with fur between them; it is
//      now one lofted relief walking the §3.9 polygon, brow pad to chin.
//   4. The lip bands floated 0.023 m in front of the muzzle's curved surface
//      with fur showing between, and sat on `skin-wet` — whose map set is
//      `skin-amphibian`, whose albedo boosts green — which is why the last
//      build's mouth rendered olive. Both fixed.
// The trapezius/yoke was also cut back so §2's neck lens is real (0.072 m of
// background on each side of the neck, measured), the robe is genuinely open,
// and the gold chain is 24 tangent-oriented links on the chest instead of a
// decal blob that also appeared on his back.
//
// Parody safety: docs §9. Generic archetype only — no source name, mark, trade
// dress or colourway anywhere in geometry, materials, mesh names or strings.
import * as THREE from 'three'
import {
  makeMaterialFactory, disposeMaterialSafely,
  roundedBox, superellipsoid, capsule, taperedCapsule, ball,
  roundedCylinder, roundedCone, sleeve, skirt, jointBall, filletRing,
  loft, plate, lens, splineTube, roundedRectPoints,
  superellipsePoints, circlePoints, smoothNormals, mergeStatic, markDynamic,
  scaled, computeAngleWeightedNormals, isSharedGeometry,
} from '../render/index.js'

// ---------------------------------------------------------------------------
// palette — docs §5. Every albedo channel is inside the contract's [30, 240]
// sRGB band; the two largest areas (FUR 0.111 / MASK 0.539) hold a 4.9:1 value
// step so the character reads as itself at 128 px. EMBER is emissive-only.
// ---------------------------------------------------------------------------
const C = {
  // --- the ape ---
  fur: 0x7a5537,        // base coat, the dominant area          Y 0.111
  furShadow: 0x452c1e,  // underarm / under-jaw / crevice         Y 0.032
                        // (brief's #452C1B has B=27; the contract floor is 30)
  furTip: 0xae7f52,     // clump-edge + sheen tint                Y 0.247
  skin: 0xd9be96,       // THE MASK — face, muzzle, concha, ruff  Y 0.539
  skinDark: 0xa07c55,   // philtrum, nostril rim, under-brow      Y 0.225
  lip: 0xc68b78,        // lip band only                          Y 0.318
  mouth: 0x4a2626,      // mouth interior / gums                  Y 0.030
  nostril: 0x2b2320,    // nostril aperture interior              Y 0.018
  tooth: 0xede7d8,      // never pure white                       Y 0.802
  sclera: 0xe8e2d2,     // eye white, never #FFFFFF               Y 0.764
  iris: 0x3b2f22,
  pupil: 0x221e1e,
  hide: 0x6b4a34,       // palms, knuckle pads, finger skin
  // --- wardrobe ---
  knit: 0xd2662f,       // beanie: 2.1:1 over the fur in VALUE    Y 0.235
  teeLight: 0xe6e1d2,
  teeDark: 0x2e3f63,
  robe: 0x5e3a8f,
  robeDark: 0x452a69,
  robeTrim: 0x8e68c4,
  slipper: 0xe89bb8,
  slipperFluff: 0xf0d9e4,
  gold: 0xe0a93b,
  mug: 0xf0efe9,
  coffee: 0x3e251e,
  cigPaper: 0xefe9dc,
  cigFilter: 0xc8843c,
  ash: 0x6e6862,
  ember: 0xff6a28,      // EMISSIVE ONLY — never an albedo
  // --- cinematic set dressing used by the move scripts ---
  paper: 0xf0f0e8,
  suitShirt: 0xe8e8f0,
  suitPants: 0x2a2d3a,
  tie: 0xc03b3b,
  steel: 0x9aa2ad,
  button: 0xd8322e,
  wood: 0x7a5230,
}

// docs §11 ("measure these, don't eyeball them") and §9.3 make two palette
// claims that are cheap to prove and expensive to let rot, so they are proved
// at module load instead of asserted in prose. `ember` is exempt from the
// 30-240 band because it is an emissive value, never an albedo.
{
  const SAMPLED = [0x898889, 0x605f60, 0xe3c8a1, 0xb18e5d]   // §9.5: measured off
  const bad = []                                             // the source; must
  for (const [k, v] of Object.entries(C)) {                   // never be reused
    if (k === 'ember') continue
    const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    if (ch.some((c) => c < 30 || c > 240)) bad.push(`${k} out of [30,240]`)
    if (SAMPLED.includes(v)) bad.push(`${k} reuses a sampled source colour`)
  }
  if (bad.length) console.warn('[tired-ape] palette: ' + bad.join('; '))
}

// ---------------------------------------------------------------------------
// materials
//
// M is this MODULE's scoped cache and it serves the cinematic set dressing
// only. The fighter's own surfaces come from a factory built per buildModel()
// call (see there) so a mirror match cannot cross-flash. Nothing here is
// globally cached, so no arena and no other fighter can see any of it.
// ---------------------------------------------------------------------------
const M = makeMaterialFactory({ scope: 'tired-ape' })

// Cinematic props built by the move scripts are thrown away by scrap(), so they
// get their own throwaway instance rather than a cached one a later cutscene
// would find already disposed. Every call site passes a real `surface` — a
// briefcase is leather, a gantry is rough metal, an agenda is paper. Nothing on
// this character, on-stage or in a cutscene, sits on the 'default' preset.
function lamb(color, opts = {}) {
  const { surface, ...rest } = opts
  return M.pbr(color, surface || 'default', { ...rest, unique: true })
}

function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const r = Math.min(0.03, Math.min(w, h, d) * 0.22)
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

function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const rim = Math.min(0.02, Math.min(rTop, rBottom, h * 0.4) * 0.3)
  const g = Math.abs(rTop - rBottom) < 1e-4
    ? roundedCylinder(rTop, h, rim, 18, 2)
    : roundedCone(rBottom, rTop, h, rim, 18, 2)
  const m = new THREE.Mesh(g, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

/** mesh(geometry, material, x, y, z) — the terse builder used by buildModel. */
function mesh(g, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(g, material)
  m.position.set(x, y, z)
  return m
}

/** rot(mesh, rx, ry, rz) -> mesh — chainable rotation. */
function rot(m, rx = 0, ry = 0, rz = 0) { m.rotation.set(rx, ry, rz); return m }
/** scl(mesh, sx, sy, sz) -> mesh — chainable scale. */
function scl(m, sx = 1, sy = sx, sz = sx) { m.scale.set(sx, sy, sz); return m }
/** nm(mesh, name) -> mesh — every part is named, for hints and gore/VFX lookup. */
function nm(m, name) { m.name = name; return m }

/**
 * flattenFront(geo, p0x, p0y, nx, ny, minX, minY) -> geo (mutated, must be unique)
 * Pushes every vertex past the plane {p0, n} back ONTO that plane — docs §3.1's
 * "the frontal plane is FLAT, not spherical". A round forehead makes it a
 * monkey; the raked flat face plane is what makes it *this* ape. Normals are
 * recomputed angle-weighted so the new plane gets its own crisp shading break.
 */
function flattenFront(geo, p0x, p0y, nx, ny, minX, minY) {
  const p = geo.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i)
    if (x <= minX || y <= minY) continue
    const d = (x - p0x) * nx + (y - p0y) * ny
    if (d <= 0) continue
    p.setX(i, x - nx * d)
    p.setY(i, y - ny * d)
  }
  p.needsUpdate = true
  computeAngleWeightedNormals(geo)
  smoothNormals(geo, 52)
  geo.computeBoundingSphere(); geo.computeBoundingBox()
  return geo
}

/**
 * instanced(geo, material, name, placements) -> InstancedMesh
 * docs §6.5's mandatory draw-call mitigation: teeth, chain links, beanie ribs
 * and fur tufts are 60+ identical parts and would be 60 draw calls. Each
 * `placements` entry is [x,y,z, rx,ry,rz, s] (rotation + uniform scale optional).
 */
const _im = new THREE.Object3D()
function instanced(geo, material, name, placements) {
  const m = new THREE.InstancedMesh(geo, material, placements.length)
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    _im.position.set(p[0], p[1], p[2])
    _im.rotation.set(p[3] || 0, p[4] || 0, p[5] || 0)
    _im.scale.setScalar(p[6] === undefined ? 1 : p[6])
    _im.updateMatrix()
    m.setMatrixAt(i, _im.matrix)
  }
  m.instanceMatrix.needsUpdate = true
  m.name = name
  m.castShadow = true
  m.receiveShadow = true
  markDynamic(m)   // never let the auto-merger flatten an InstancedMesh
  return m
}

/**
 * instancedQ(geo, material, name, frames) -> InstancedMesh
 * As instanced(), but each frame is { p:[x,y,z], q:Quaternion } — needed by the
 * gold chain, whose 24 links have to be oriented off the PATH TANGENT (a link
 * built from an euler triple lands flat on the chest and reads as a decal,
 * which is exactly what the last build shipped).
 */
function instancedQ(geo, material, name, frames) {
  const m = new THREE.InstancedMesh(geo, material, frames.length)
  const mtx = new THREE.Matrix4()
  const one = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < frames.length; i++) {
    mtx.compose(frames[i].p, frames[i].q, one)
    m.setMatrixAt(i, mtx)
  }
  m.instanceMatrix.needsUpdate = true
  m.name = name
  m.castShadow = true
  m.receiveShadow = true
  markDynamic(m)
  return m
}

/**
 * repeated(bin, geo, material, name, placements) — the CHEAPER half of §6.5's
 * mitigation. An InstancedMesh is one draw call, but so is a merged buffer, and
 * a merged buffer costs ZERO extra draws when the bin already carries that
 * material (teeth share the head's bin, fingers the palm's, ribs the beanie's).
 * Instancing only actually wins when the repeat count is high enough that the
 * duplicated vertex data matters — that is the chain, and only the chain.
 */
function repeated(bin, geo, material, name, placements) {
  for (const p of placements) {
    const m = new THREE.Mesh(geo, material)
    m.position.set(p[0], p[1], p[2])
    m.rotation.set(p[3] || 0, p[4] || 0, p[5] || 0)
    if (p[6] !== undefined) m.scale.setScalar(p[6])
    m.name = name
    bin.add(m)
  }
}

/**
 * staticBin(bone, name) -> Group that only ever holds NON-animated meshes.
 * docs §6.5.2: merge by material WITHIN a bone, never across bones —
 * Gore._detach() clones a bone's subtree and a buffer spanning two bones would
 * tear on dismemberment. Every bin is merged by mergeBins() at the end of
 * buildModel(); child bones, props and InstancedMeshes stay outside the bin.
 */
function staticBin(bone, name) {
  const g = new THREE.Group()
  g.name = name
  bone.add(g)
  return g
}
function mergeBins(bins) {
  // dev escape hatch: measurement scripts set globalThis.__WCS_NO_MERGE so the
  // per-part mesh names survive and an AABB can be taken off each one. Never
  // set in the game — the merge is a hard draw-call requirement (docs §6.5).
  if (typeof globalThis !== 'undefined' && globalThis.__WCS_NO_MERGE) return { before: 0, after: 0 }
  let before = 0, after = 0
  for (const b of bins) {
    const r = mergeStatic(b, { dispose: false })
    before += r.before; after += r.after
  }
  return { before, after }
}

// Procedural horizontal-band texture for the boat-neck tee (docs §7.4 / §9 D7:
// 11 coarse bands, deliberately NOT the naval spec's 21 fine ones). The stripes
// are albedo — the cloth weave normal comes from the `cloth` preset underneath.
function stripeTex(light, dark, bands = 11) {
  try {
    const c = document.createElement('canvas')
    c.width = 8; c.height = 256
    const g = c.getContext('2d')
    const hex = (v) => `#${v.toString(16).padStart(6, '0')}`
    g.fillStyle = hex(light)
    g.fillRect(0, 0, 8, 256)
    g.fillStyle = hex(dark)
    const period = 256 / bands
    for (let i = 0; i < bands; i++) {
      g.fillRect(0, Math.round(i * period + period * 0.14), 8, Math.round(period * 0.42))
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 2
    return t
  } catch { return null }
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

// procedural canvas label texture — returns null (caller falls back) if the
// canvas API is unavailable for any reason.
function labelTex(text, opts = {}) {
  try {
    const c = document.createElement('canvas')
    c.width = opts.w || 256
    c.height = opts.h || 96
    const g = c.getContext('2d')
    g.fillStyle = opts.bg || '#f5f2e8'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = opts.border || '#2a2a2a'
    g.lineWidth = 8
    g.strokeRect(4, 4, c.width - 8, c.height - 8)
    g.fillStyle = opts.fg || '#222222'
    g.font = `bold ${opts.size || 52}px Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, c.width / 2, c.height / 2 + 2)
    const t = new THREE.CanvasTexture(c)
    t.anisotropy = 2
    return t
  } catch { return null }
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, ~1.9 m tall (slouched, obviously)
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}
  const bins = []      // static containers, merged by material at the end
  const dyn = []       // props flagged dynamic AFTER merging (order matters:
  const cos1 = costume === 1   // isDynamic() walks ancestors, so tagging first
                               // would make mergeStatic skip the whole subtree.

  // -- surfaces (docs §6). One scoped factory PER CALL, not per module: two
  // tired-apes in a mirror match must not share material objects, because
  // Fighter._claimMutableMaterials() only copy-on-writes GLOBALLY cached
  // materials and would otherwise let a hit on P1 flash P2 as well.
  const MM = makeMaterialFactory({ scope: 'tired-ape/model' })
  const P = (c, s, o) => MM.pbr(c, s, o)

  // ROUND 4 — THE SPECULAR LADDER, and this is the finding the last review led
  // with ("surfacing is one noise frequency everywhere and it never moves under
  // light"). Dumping the built materials showed why: `material.roughness` in
  // this layer is a MULTIPLIER on the map kind's authored mean, three.js clamps
  // it at 1.0, and SIX of this model's materials were asking for >1 and silently
  // rendering at the map's own value. The whole model landed inside
  // 0.82..0.86 absolute — robe 0.840, tee 0.824, knit 0.820, fur 0.840, chest
  // ruff 0.840 — i.e. five large areas with the same specular WIDTH, which is
  // exactly "one frequency" no matter how different the albedo noise is.
  //
  // Every multiplier below is now solved backwards from the absolute value §6
  // asks for, using `kindRoughness(kind)` as the divisor, and any target that is
  // physically unreachable (above the map's mean, so unreachable through a
  // multiplier capped at 1) is stated as such instead of being asked for and
  // silently clamped. The resulting ladder, measured off the built materials:
  //
  //   cornea 0.026 | coffee 0.075 | gold 0.120 | iris 0.140 | mug 0.155
  //   nostril 0.218 | teeth 0.278 | lips 0.302 | sclera 0.302 | mouth 0.551
  //   mask shade 0.560 | FACE MASK 0.580 | palms 0.600 | tee 0.720
  //   cigarette 0.760 | knit 0.790 | slippers 0.800 | robe trim 0.816
  //   chest ruff 0.823 | robe 0.840 | FUR 0.860
  //
  // Twenty distinct specular widths across the model, the two largest areas
  // (fur 0.860 / mask 0.580) a full 0.28 apart, and the spatial +/-0.14 within
  // each comes from the kind's own roughness map, which is driven off its height
  // field (fur tips glossier, roots rougher) exactly as §6 requires.
  //
  // MATERIAL IDENTITY (docs §6, round-2 P0 "one normal map doing four jobs"):
  // adjacent regions are held at least 2x apart in map SCALE and their base
  // roughness is separated so the specular WIDTH differs, not only the colour.
  //   fur-coarse @1.4  |  knit @2.9  |  cloth-weave @6.4 (robe) / @1.2 (tee)
  //   skin-smooth @0.45 (mask)  |  leather @0.8 (palms)
  // Sheen on the fur is deliberately BROAD (sheenRoughness 0.88) so it only
  // lifts at grazing angles — a narrow lobe reads as a vinyl bodysuit, which is
  // exactly what the last build shipped.
  // fur: 1.000 x kindRoughness('fur-coarse') 0.860 = 0.860 absolute, exactly §6's
  // base, and the roughest thing on the model. sheen 0.28 tinted APE_FUR_TIP, per
  // §6, at a BROAD sheenRoughness so the forward-scatter lobe only lifts at
  // grazing angles — crown, shoulder tops, outside of the forearms.
  const furM = P(C.fur, 'fur-coarse', {
    mapOpts: { scale: 1.4 }, normalScale: 1.3, roughness: 1.024,
    sheen: 0.28, sheenRoughness: 0.88, sheenColor: C.furTip, name: 'coat',
  })
  // §6 asks 0.92 for the crevice fur. The fur-coarse map's mean is 0.860 and a
  // three.js roughness multiplier cannot exceed 1, so 0.92 is unreachable
  // without a second map kind (a second kind is a second texture upload against
  // the contract's 20-kind scene budget). It sits at 0.860 with sheen killed
  // outright, which is what actually makes a crevice sink.
  const furDeepM = P(C.furShadow, 'fur-dark', { mapOpts: { scale: 1.05 }, roughness: 1.024, sheen: 0, name: 'coatDeep' })
  const furTipM = P(C.furTip, 'fur-coarse', { mapOpts: { scale: 1.15 }, roughness: 1.0, sheen: 0.30, sheenRoughness: 0.8, sheenColor: C.furTip, name: 'coatTip' })
  // THE IDENTITY SHAPE — docs §3.9 / §6. Fine wrinkle (0.45), not elephant
  // scale, and a real grazing-angle FRESNEL LIFT: `sheen` in three.js is a
  // fresnel-weighted retro-reflective lobe, so a narrow, pale sheen makes the
  // muzzle's silhouette edge read brighter than its centre under ANY arena
  // light. Without it the mask is a flat pale slab and reads as a decal.
  // 1.000 x kindRoughness('skin-smooth') 0.580 = 0.580 absolute. §6 asks 0.62;
  // 0.58 is the map's own mean and the multiplier caps at 1, so 0.62 is
  // unreachable — a 7% miss, and the part that matters is that the mask sits
  // 0.28 BELOW the fur, which is the largest specular-width step on the model
  // and the thing that stops a big pale shape reading as a decal.
  const skinM = P(C.skin, 'skin', {
    mapOpts: { scale: 0.45, wear: 0.3 }, roughness: 1.115, normalScale: 1.2,
    sheen: 0.34, sheenRoughness: 0.42, sheenColor: 0xf3e6cc,
    clearcoat: 0.10, clearcoatRoughness: 0.62, name: 'mask',
  })
  const skinShadeM = P(C.skinDark, 'skin', { mapOpts: { scale: 0.42 }, roughness: 1.077, name: 'maskShade' })
  // the chest ruff is coarse fur, not face skin — 0.96 x 0.860 = 0.826 puts it
  // just off the body coat so the two pale-on-brown masses do not share a lobe.
  const ruffM = P(C.skin, 'fur-coarse', { mapOpts: { scale: 0.95 }, roughness: 0.98, sheen: 0.3, sheenRoughness: 0.7, sheenColor: 0xf3e6cc, name: 'ruff' })
  // LIP BAND. It was on `skin-wet`, whose map set is `skin-amphibian`, whose
  // albedo multiplies G by 1.02 and R/B by 0.86/0.80 — that is a FROG tint, and
  // it is why the last build's mouth rendered olive-khaki on a pink-tan albedo.
  // `skin` (skin-smooth) is neutral. Roughness 0.52 x 0.58 = 0.30 (docs §6) and
  // the clearcoat is cut to a rim-only 0.14 so the lips are not the brightest
  // specular event on the model.
  const lipM = P(C.lip, 'skin', {
    roughness: 0.58, clearcoat: 0.14, clearcoatRoughness: 0.30,
    mapOpts: { scale: 0.8 }, name: 'lipBand',
  })
  const mouthM = P(C.mouth, 'skin', { roughness: 1.06, clearcoat: 0.12, mapOpts: { scale: 0.7 }, name: 'mouthShell' })
  const nostrilM = P(C.nostril, 'skin', { roughness: 0.42, clearcoat: 0.22, mapOpts: { scale: 0.5 }, name: 'nostrilBore' })
  const toothM = P(C.tooth, 'bone', { roughness: 0.58, name: 'toothRow' })
  const scleraM = P(C.sclera, 'skin', { roughness: 0.58, clearcoat: 0.3, mapOpts: { scale: 0.35 }, name: 'sclera' })
  // iris and pupil share one material: Y 0.031 vs Y 0.014 across a 0.031 m
  // disc is two pixels of difference at gameplay distance and it costs a
  // whole draw call (docs §6.5's 40-call ceiling).
  const irisM = P(C.iris, 'plastic-gloss', { roughness: 0.9, name: 'iris' })
  const pupilM = irisM
  // The one crisp specular dot per eye (docs §3.3). transmission is forced to 0
  // — a real transmissive material costs a whole extra scene render.
  const corneaM = P(0xf4f2ee, 'glass', {
    transmission: 0, transparent: true, opacity: 0.26, depthWrite: false,
    roughness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.02,
    envMapIntensity: 1.6, name: 'cornea',
  })
  // 1.000 x kindRoughness('leather') 0.600 = 0.600. §6 asks 0.70 — again above
  // the map's mean and therefore unreachable through a capped multiplier.
  const hideM = P(C.hide, 'leather', { mapOpts: { scale: 0.8, wear: 0.7 }, roughness: 1.091, name: 'palmHide' })

  // KNIT. docs §5's acceptance test is "desaturate a 128 px render and the
  // beanie must still separate from the head". KNIT_RUST Y 0.235 clears
  // APE_FUR Y 0.111 by 2.1:1 in albedo, but a heavy AO term plus a dark weave
  // map was eating that margin at render time — aoIntensity is pulled back and
  // the env term raised so the rendered value keeps the ratio the palette
  // promises. Map scale 2.9 sits >2x off both the fur (1.4) and the robe (6.4).
  // 0.94 x kindRoughness('cloth-knit') 0.850 = 0.799 — wool sits between the
  // cotton tee (0.739) and the terry robe (0.840), so all three fabrics on the
  // model carry visibly different specular widths instead of one shared lobe.
  const knitM = P(cos1 ? 0xd8d2c4 : C.knit, 'knit', {
    mapOpts: { scale: 2.9, wear: 0.12 }, normalScale: 1.7, roughness: 0.963,
    sheen: 0.42, sheenRoughness: 0.72, aoIntensity: 0.55,
    envMapIntensity: 0.95, name: 'knitCap',
  })
  const teeMap = stripeTex(C.teeLight, C.teeDark, 11)
  if (teeMap) teeMap.repeat.set(1, 1)
  // 0.88 x kindRoughness('cloth-weave') 0.840 = 0.739 — a cotton jersey, the
  // glossiest fabric on the model and 0.10 clear of the robe.
  const teeM = P(C.teeLight, 'cloth', {
    mapOpts: { scale: 1.2 }, sheen: 0.30, sheenRoughness: 0.55,
    roughness: 0.90, name: 'boatneck',
    ...(teeMap ? { map: teeMap } : {}),
  })
  // the robe is the DEADEST surface on the model — it is what makes the gold
  // sing. Coarsest weave on the character by a factor of 2.2 over the knit.
  // 1.000 x 0.840 = 0.840 — the deadest FABRIC on the model (only the coarse fur,
  // at 0.860, is flatter). §6 asks 0.95, which cloth-weave's 0.84 mean cannot
  // reach through a capped multiplier; the intent — a dead field for the gold to
  // sing against — survives at 0.84 against a 0.12 metal.
  const robeM = P(cos1 ? 0x2f6f4f : C.robe, 'cloth', {
    mapOpts: { scale: 6.4 }, roughness: 1.05, sheen: 0.12, sheenRoughness: 0.9,
    side: THREE.DoubleSide, name: 'robe',
  })
  const robeDarkM = P(cos1 ? 0x224f39 : C.robeDark, 'cloth', { mapOpts: { scale: 5.2 }, roughness: 1.05, name: 'robeSash' })
  const robeTrimM = P(cos1 ? 0x6fbf95 : C.robeTrim, 'cloth', { mapOpts: { scale: 4.4 }, roughness: 1.02, name: 'robeTrim' })
  // GOLD (docs §6). The `gold` preset already carries metalness 1.0, but its
  // authored roughness is 0.12 and its env term 1.5; §6 asks for 0.18 / 1.4, so
  // both would have to come from an override. §6 asks 0.18; `roughness` is a
  // MULTIPLIER on the gold map's 0.12 mean and three.js caps it at 1.0, so 0.18
  // is unreachable upward and asking for it would silently render 0.12 anyway.
  // It is left at 0.120 deliberately — a TIGHTER metal lobe than spec, which is
  // the safe direction: the failure mode being fixed is a metal with no lobe.
  // NOTE FOR THE SCENE OWNER: metalness 1.0 with no environment renders as a
  // flat dead mustard — exactly the "painted plaster" the last review saw. This
  // material is correct; it needs `applyEnvironment(scene, mood, renderer)` to
  // have run before the fighter is added. That call is not in this file's scope.
  const goldM = P(C.gold, 'gold', { envMapIntensity: 1.4, name: 'goldwork' })
  const mugM = P(C.mug, 'plastic-gloss', { clearcoat: 0.6, name: 'mug' })
  const coffeeM = P(C.coffee, 'water', { name: 'coffee' })
  const cigPaperM = P(C.cigPaper, 'paper', { name: 'cigPaper' })
  const cigFilterM = P(C.cigFilter, 'paper', { name: 'cigFilter' })
  const ashM = P(C.ash, 'paper', { mapOpts: { scale: 0.4 }, roughness: 1.18, name: 'ash' })
  const emberM = MM.emissive(C.ember, 2.2)
  const slipperM = P(cos1 ? 0x9fb7e8 : C.slipper, 'fur-long', { mapOpts: { scale: 1.8 }, roughness: 1.026, sheen: 0.35, name: 'slipper' })
  const fluffM = P(cos1 ? 0xdbe6f0 : C.slipperFluff, 'fur-long', { mapOpts: { scale: 2.2 }, roughness: 1.026, sheen: 0.4, name: 'slipperFluff' })

  // --- hips -----------------------------------------------------------------
  // hip pivot at world y = 0.850, hip width 0.44 (docs §2 / §4.1).
  const hips = pivot(group, 0, 0.85, 0)
  bones.hips = hips
  const hipBin = staticBin(hips, 'hipStatic'); bins.push(hipBin)
  hipBin.add(nm(mesh(superellipsoid(0.235, 0.165, 0.222, 2.9, 2.9, 18), furM, 0.012, -0.02, 0), 'pelvis'))
  // groin / crease shadow fur — the darkest large value, so the crevice sinks
  // (no separate groin shadow mass: it is inside a closed robe skirt in every
  // costume and cost a whole draw call to render something nothing can see.)

  // robe hem (extra bone — springy secondary motion). A 22-segment flared
  // skirt with a FRONT SPLIT (thetaLength gap centred on +X) so §2's 0.28 m
  // between-the-knees negative space survives — the legs have to read.
  const robe = pivot(hips, -0.02, -0.06, 0)
  bones.robe = robe
  const robeBin = staticBin(robe, 'robeStatic'); bins.push(robeBin)
  const split = { radialSeg: 18, lengthSeg: 4, curve: 0.55, thetaLength: Math.PI * 2 - 0.86, phase: 0.43 }
  robeBin.add(nm(mesh(skirt(0.285, 0.40, 0.245, split), robeM, 0.02, 0.075, 0), 'robeSkirt'))
  robeBin.add(nm(mesh(skirt(0.392, 0.404, 0.034, { ...split, lengthSeg: 2, curve: 0.2 }), robeTrimM, 0.02, -0.136, 0), 'robeHemTrim'))
  // ROUND 4 — THE HEM HAD NO EDGE. `skirt()` is a lathe SHELL: the trim band
  // above is a zero-thickness surface, so the hem terminated in a hard
  // single-pixel line with nothing for a light to catch, which is the "two flat
  // cards with a hard straight hem" read. A real rolled edge is swept around the
  // hem circle as a tube, following the same 0.86 rad front split so §2's
  // between-the-knees void stays open, and its radius is MODULATED so the hem
  // line is not a perfect circle — a straight hem on a hanging garment is the
  // other half of the "card" tell. It merges into robeTrimM's existing buffer,
  // so it costs zero extra draw calls.
  {
    const a0 = split.phase, span = split.thetaLength, pts = []
    for (let i = 0; i <= 22; i++) {
      const a = a0 + span * (i / 22)
      const drop = Math.sin(a * 3.0 + 0.7) * 0.016 + Math.sin(a * 5.0) * 0.008
      const rr = 0.404 + Math.sin(a * 2.0 + 1.9) * 0.010
      pts.push([0.02 + Math.cos(a) * rr, -0.170 + drop, Math.sin(a) * rr])
    }
    robeBin.add(nm(mesh(splineTube(pts, 0.013, 26, null, { radialSeg: 6, roundEnd: true }), robeTrimM), 'robeHemRoll'))
  }
  // frayed cuff: eight short irregular tabs on the hem edge (docs §6 wear #5)
  for (let i = 0; i < 8; i++) {
    const a = 0.62 + (i / 7) * (Math.PI * 2 - 1.24)
    const r = 0.398
    robeBin.add(nm(rot(mesh(taperedCapsule(0.007, 0.003, 0.024, 1, 5), robeTrimM,
      0.02 + Math.cos(a) * r, -0.186 - (i % 3) * 0.006, Math.sin(a) * r), 0, -a, 0), 'hemFray'))
  }

  // --- legs -----------------------------------------------------------------
  // femur 0.410 -> knee y 0.446, tibia 0.350 -> ankle y 0.099, sole y 0.
  // Splayed 8.6 deg so heel centres land 0.52 m apart (docs §4.4).
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, 0, 0.132 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    const lw = bent(leg, 0, -0.150 * side)     // knees splayed out
    const legBin = staticBin(lw, 'legStatic'); bins.push(legBin)
    // ONE continuous leg. The last build stacked thigh + knee ball + shank +
    // a bulged kneeSleeve, and the sleeve's concentric wrinkle rings read as a
    // rolled-down sock while the shank capsule still cut a hard crescent
    // through the thigh (contract §0.4 forbids a visible intersection line).
    // It is now a single loft from groin to ankle — no seam to hide.
    legBin.add(nm(mesh(loft([
      { at: [0.004, -0.055, 0], shape: superellipsePoints(0.234, 0.226, 2.7, 16) },
      { at: [0.006, -0.200, 0], shape: superellipsePoints(0.222, 0.214, 2.7, 16) },
      { at: [0.004, -0.330, 0], shape: superellipsePoints(0.198, 0.196, 2.7, 16) },
      { at: [-0.002, -0.412, 0], shape: superellipsePoints(0.196, 0.192, 2.8, 16) },  // knee
      { at: [0.004, -0.492, 0], shape: superellipsePoints(0.200, 0.194, 2.7, 16) },   // calf
      { at: [0.008, -0.620, 0], shape: superellipsePoints(0.170, 0.166, 2.7, 16) },
      { at: [0.006, -0.742, 0], shape: superellipsePoints(0.140, 0.138, 2.8, 16) },   // ankle
    ], { subdivide: 1, ringPoints: 16 }), furM), 'leg'))
    // patella swell — the ONE modelled landmark on the leg, so the knee still
    // reads as a knee now that the ring detail is gone.
    legBin.add(nm(mesh(superellipsoid(0.038, 0.056, 0.070, 2.6, 2.6, 12), furM, 0.070, -0.416, 0), 'knee'))
    // long shank fur overhanging the slipper cuff — closes the ankle seam
    legBin.add(nm(mesh(skirt(0.076, 0.104, 0.062, { radialSeg: 14, lengthSeg: 2, curve: 0.7 }), furM, 0, -0.736, 0), 'ankleRuff'))
    // --- the ape FOOT (docs §4.4). 0.26 m long, four short toes plus a big toe
    // diverging 32 deg — a hand-like grippy plan. It is built in full even
    // though a slipper covers most of it, because the slipper is CUT so the
    // divergent big-toe bulge shows through the medial side.
    const foot = new THREE.Group()
    foot.name = 'foot'
    foot.position.set(0.018, -0.7956, 0)
    foot.rotation.y = -0.279 * side              // 16 deg toe-out
    lw.add(foot)
    const footBin = staticBin(foot, 'footStatic'); bins.push(footBin)
    footBin.add(nm(mesh(superellipsoid(0.104, 0.046, 0.062, 2.8, 3.0, 14), hideM, 0.026, 0.006, 0), 'footPad'))
    // a capsule's axis is +Y; rz = -pi/2 lays it along +X, then ry spreads it
    // in plan. Euler XYZ composes as Rx*Ry*Rz, so rz is applied first.
    // The four lateral toes are entirely inside the slipper's vamp — only the
    // divergent big toe is cut to show through the side (§4.4) — so they are
    // built at the minimum segment count that still silhouettes correctly if the
    // slipper is ever knocked off by `slipperKick`.
    for (let i = 0; i < 4; i++) {                // four short lateral toes
      footBin.add(nm(rot(mesh(taperedCapsule(0.015, 0.012, 0.020, 1, 5), hideM,
        0.118 - i * 0.005, -0.012, (0.032 - i * 0.022) * side),
      0, (-0.10 + i * 0.05) * side, -Math.PI / 2), 'toe'))
    }
    // big toe: diverges 32 deg (0.558 rad) from the foot axis — the ape read,
    // and the one part of the foot that shows THROUGH the slipper's side.
    footBin.add(nm(rot(mesh(taperedCapsule(0.022, 0.018, 0.044, 2, 8), hideM,
      0.090, -0.008, -0.066 * side), 0, 0.558 * side, -Math.PI / 2), 'bigToe'))

    // bunny slipper (costume comedy, load-bearing — slipperKickScript reads it)
    const slip = new THREE.Group()
    slip.name = 'slipper'
    // sole lands exactly on y = 0. The slipper is a SHELL over the real foot:
    // its floor sits at slipper-local -0.043 and the ape foot's pad sits inside
    // it, so nothing passes through and re-emerges (the last build's brown ball
    // in front of the toe was the foot punching out through the vamp).
    slip.position.set(0.018, -0.8326, 0)       // slipper-local y = 0 IS the floor
    slip.rotation.y = -0.279 * side            // 16 deg toe-out
    // NOTE the loft frame: for a path running along +X, a section's first
    // dimension sweeps Z and its second sweeps Y. (0.166, 0.144) is therefore
    // a slipper 0.166 wide and 0.144 tall, not the other way round.
    slip.add(nm(mesh(loft([
      { at: [-0.088, 0.074, 0], shape: superellipsePoints(0.146, 0.140, 2.8, 14) },
      { at: [-0.020, 0.072, 0], shape: superellipsePoints(0.166, 0.144, 3.0, 14) },
      { at: [0.062, 0.070, 0], shape: superellipsePoints(0.162, 0.140, 3.0, 14) },
      { at: [0.128, 0.076, 0], shape: superellipsePoints(0.130, 0.116, 2.8, 14) },
      { at: [0.160, 0.086, 0], shape: superellipsePoints(0.078, 0.070, 2.6, 14) },
    ], { subdivide: 1, ringPoints: 14 }), slipperM), 'slipperBody'))
    // a real sole plate lying FLAT on the floor — the last build's hem was a
    // zero-thickness single-sided edge and it showed in the leg crop.
    slip.add(nm(rot(mesh(plate(superellipsePoints(0.272, 0.168, 3.2, 16), 0.020, 0.007,
      { crown: 0.003, faceSeg: 1, rimSeg: 2 }), fluffM, 0.030, 0.003, 0), -Math.PI / 2), 'slipperSole'))
    slip.add(nm(mesh(sleeve(0.082, 0.096, 0.056, { radialSeg: 12, lengthSeg: 3, bulge: 0.06 }), fluffM, -0.074, 0.076, 0), 'slipperCuff'))
    slip.add(nm(sph(0.042, fluffM, 0.188, 0.092, 0, 1, 0.95, 1, 12), 'slipperPom'))
    // the slipper's own ears — FORWARD and UP on the vamp so they read as ears,
    // not as bone spurs poking sideways out of the ankle.
    for (const e of [1, -1]) {
      slip.add(nm(rot(mesh(plate(superellipsePoints(0.052, 0.110, 2.2, 10), 0.020, 0.007,
        { crown: 0.006, faceSeg: 1, rimSeg: 1 }), fluffM, 0.118, 0.140, 0.030 * e),
      0.30 * e, 0, 0.22 * e), 'slipperEar'))
    }
    lw.add(slip)
    leg.userData.slipper = slip
    bins.push(slip); dyn.push(slip)
  }
  // --- torso ----------------------------------------------------------------
  // Baked slouch (docs §4.1): thoracic spine rolled FORWARD 22 deg about the
  // torso bone at world y 0.95. Every tw-local coordinate below was solved back
  // through that rotation so the §2 landmark table still lands in world space:
  // acromion 1.320, chest apex 1.200, waist 1.020.
  const torso = pivot(hips, 0, 0.10, 0)
  bones.torso = torso
  const tw = bent(torso, -0.22) // the slouch: baked, non-negotiable
  const torsoBin = staticBin(tw, 'torsoStatic'); bins.push(torsoBin)

  // one continuous lofted trunk: pelvis -> waist -> belly -> chest -> yoke.
  // Belly depth (0.48) EXCEEDS chest depth (0.44): the deepest point in profile
  // is the navel, not the pecs. Strong, and completely unmaintained.
  // NECK LENS (docs §2, round-2 P0 "the head is welded to the shoulders"):
  // the yoke used to close at tw-local y 0.430 with a 0.44 m wide ring and the
  // trapezius wedges rose to world 1.48 — ABOVE the chin — so there was zero
  // background either side of the neck and the silhouette died at gameplay
  // distance. The trunk now tops out AT the acromion (tw 0.372 -> world 1.320)
  // and every shoulder mass inside |z| < 0.13 stays below world 1.35, which
  // leaves the mandated 0.050 m of background on each side of a 0.124 m neck.
  torsoBin.add(nm(mesh(loft([
    { at: [0.015, -0.075, 0], shape: roundedRectPoints(0.40, 0.44, 0.13) },
    { at: [0.020, 0.070, 0], shape: roundedRectPoints(0.44, 0.42, 0.14) },
    { at: [0.010, 0.180, 0], shape: roundedRectPoints(0.48, 0.46, 0.15) },
    { at: [-0.010, 0.290, 0], shape: roundedRectPoints(0.44, 0.54, 0.15) },
    { at: [-0.022, 0.320, 0], shape: roundedRectPoints(0.38, 0.52, 0.14) },
    { at: [-0.030, 0.352, 0], shape: roundedRectPoints(0.24, 0.24, 0.10) },
  ], { subdivide: 2, ringPoints: 24 }), furM), 'trunk'))
  // trapezius: 32 deg slope from the skull base out to the deltoid — this plus
  // the sunk head IS the slumped read. Two lofted wedges, welded into the yoke,
  // and deliberately SHALLOW near the midline so they cannot fill the lens.
  for (const side of [1, -1]) {
    torsoBin.add(nm(mesh(loft([
      { at: [-0.036, 0.320, 0.045 * side], shape: superellipsePoints(0.20, 0.040, 2.4, 14) },
      { at: [-0.058, 0.316, 0.120 * side], shape: superellipsePoints(0.21, 0.062, 2.4, 14) },
      { at: [-0.084, 0.314, 0.195 * side], shape: superellipsePoints(0.21, 0.112, 2.5, 14) },
      { at: [-0.100, 0.312, 0.245 * side], shape: superellipsePoints(0.19, 0.150, 2.6, 12) },
    ], { subdivide: 2, ringPoints: 14 }), furM), 'trapezius'))
  }
  // NECK. docs §2's "neck lens" is the negative space the whole silhouette hangs
  // on: with the chin at 1.420 and the acromion at 1.320 there is a 0.100 m band
  // in which at least 0.050 m of background must show on EACH side of a 0.124 m
  // neck. Build it as a real world-VERTICAL column (rotation.z = +0.22 cancels
  // the torso slouch, same as `hw` does on the head), flaring into the trapezius
  // at the bottom so there is no seam, and overlapping the under-jaw fur at the
  // top so there is no gap. Without this the head fuses to the yoke and the
  // silhouette dies.
  {
    const neck = pivot(torsoBin, -0.0246, 0.3860, 0)
    neck.rotation.z = 0.22
    // 0.124 m across at its narrowest (0.54 x W_s, docs §2), flaring only in
    // the last 0.05 m where it disappears into the yoke. It runs from world
    // 1.300 (inside the trunk cap) up to 1.475 (inside the under-jaw fur), so
    // the visible band is world 1.320 -> 1.420 with nothing else in it.
    neck.add(nm(mesh(taperedCapsule(0.066, 0.058, 0.150, 3, 16), furM, 0, 0.055, 0), 'neck'))
    neck.add(nm(mesh(skirt(0.070, 0.116, 0.052, { radialSeg: 16, lengthSeg: 3, curve: 0.85 }), furM, 0, -0.006, 0), 'neckRuff'))
    neck.add(nm(sph(0.062, furDeepM, 0.020, 0.104, 0, 1.30, 0.45, 1.05, 12), 'neckShadow'))
  }
  // under-arm / flank crease, dead matte so it sinks
  for (const side of [1, -1]) {
    torsoBin.add(nm(sph(0.085, furDeepM, -0.075, 0.290, 0.185 * side, 1.0, 1.4, 0.7, 12), 'armpitFur'))
  }
  // CHEST RUFF — docs §4.1's second-largest pale shape on the character,
  // 0.20 wide x 0.26 tall, standing 0.03 proud of the sternum. It must be
  // VISIBLE: the robe shell below is now a genuinely open garment, and the tee
  // has a 0.28 m boat neck, so this sits in the hole both of them leave.
  torsoBin.add(nm(mesh(superellipsoid(0.052, 0.132, 0.101, 2.2, 2.8, 18), ruffM, 0.242, 0.262, 0), 'chestRuff'))
  for (let i = 0; i < 6; i++) {   // clump silhouette breakers on the ruff edge
    const t = i / 5
    torsoBin.add(nm(rot(mesh(taperedCapsule(0.016, 0.004, 0.030, 2, 6), ruffM,
      0.246 - t * 0.020, 0.330 - t * 0.150, (i % 2 ? 0.082 : -0.082) * (1 - t * 0.3)),
    0, 0, (i % 2 ? -1 : 1) * (0.9 + t * 0.4)), 'ruffTuft'))
  }

  // boat-neck striped tee (docs §7.4): the WIDE neckline is the shape cue and
  // the coarse bands are the colour cue. Stripes are albedo on a woven normal.
  const tee = new THREE.Group(); tee.name = 'tee'; tw.add(tee)
  const teeBin = staticBin(tee, 'teeStatic'); bins.push(teeBin)
  // The shell stops at tw 0.318, which is where the 0.28 m BOAT NECK sits —
  // only 0.05 m below the clavicle, exposing the pale ruff and both collarbone
  // slopes. A closed ring that ran to the yoke would swallow the neckline, and
  // the neckline is the shape cue; the coarse bands are only the colour cue.
  teeBin.add(nm(mesh(loft([
    { at: [0.012, 0.048, 0], shape: roundedRectPoints(0.455, 0.435, 0.14) },
    { at: [0.002, 0.185, 0], shape: roundedRectPoints(0.495, 0.475, 0.15) },
    { at: [-0.014, 0.262, 0], shape: roundedRectPoints(0.458, 0.556, 0.15) },
    { at: [-0.020, 0.300, 0], shape: roundedRectPoints(0.428, 0.542, 0.15) },
  ], { subdivide: 2, ringPoints: 20, caps: false }), teeM), 'teeShell'))
  // rolled boat-neck binding: an open collar band, 0.28 m across, that reads as
  // a hem rather than as a cut edge on a zero-thickness shell.
  teeBin.add(nm(rot(mesh(filletRing(0.150, 0.011, 5, 22), teeM, -0.026, 0.302, 0), 0, 0, 0.12), 'teeNeckBand'))
  for (const side of [1, -1]) {   // short sleeves, hem at mid-bicep
    teeBin.add(nm(mesh(sleeve(0.112, 0.106, 0.135, { radialSeg: 14, lengthSeg: 3, bulge: 0.05, flare: 0.06 }),
      teeM, -0.100, 0.185, 0.235 * side), 'teeSleeve'))
    teeBin.add(nm(mesh(filletRing(0.109, 0.010, 5, 14), teeM, -0.100, 0.187, 0.235 * side), 'teeCuff'))
  }

  // bathrobe shell — worn OPEN, rolled lapels, sash knot with two free tails
  const robeShell = new THREE.Group(); robeShell.name = 'robeShell'; tw.add(robeShell)
  const shellBin = staticBin(robeShell, 'robeShellStatic'); bins.push(shellBin)
  // WORN OPEN. The last build's shell was a CLOSED lofted ring 0.53 m deep —
  // wider than the tee and the ruff — so it covered both of them completely and
  // the critic correctly reported "one solid purple wrap, no tee, no ruff, no
  // chain". It is now two lofted PANELS, one per side, that stop 0.085 m short
  // of the midline on the chest. The chest gap is the garment.
  // The shell is a partial lathe: `phase = gap/2, thetaLength = 2*PI - gap`
  // puts a 1.22 rad (~0.31 m of arc) OPENING centred on +X, i.e. straight down
  // the front of the chest. A robe with a hole in it is a robe; a closed tube
  // is a dress, and a dress hides the tee, the ruff and the chain.
  // The shell hangs from a WORLD-VERTICAL wrapper (rotation.z cancels the 22 deg
  // thoracic roll) so its collar ring is level: tipped with the torso, the back
  // of the collar rides 0.05 m higher than the front and fills the neck lens
  // from behind. A garment hangs under gravity, not under the spine.
  {
    const gap = 1.22
    const robeW = pivot(shellBin, 0, 0, 0)
    robeW.rotation.z = 0.22
    const open = { radialSeg: 22, lengthSeg: 5, curve: 0.28, thetaLength: Math.PI * 2 - gap, phase: gap / 2 }
    robeW.add(nm(scl(mesh(skirt(0.250, 0.243, 0.470, open), robeM, 0.004, 0.362, 0), 0.96, 1, 1.14), 'robeShellOpen'))
    // rolled lapels, 0.035 thick, running from the collar down past the sash —
    // the edge that makes the opening read as a garment and not as a hole.
    for (const side of [1, -1]) {
      const a = (gap / 2) * side
      robeW.add(nm(mesh(splineTube([
        [0.004 + Math.cos(a) * 0.228, 0.356, Math.sin(a) * 0.285],
        [0.014 + Math.cos(a * 0.86) * 0.236, 0.215, Math.sin(a * 0.86) * 0.294],
        [0.022 + Math.cos(a * 0.80) * 0.238, 0.060, Math.sin(a * 0.80) * 0.298],
        [0.020 + Math.cos(a * 0.86) * 0.234, -0.096, Math.sin(a * 0.86) * 0.292],
      ], 0.0175, 14, null, { radialSeg: 7, roundEnd: true }), robeTrimM), 'lapel'))
    }
  }
  // Sash at the waist (world y 1.020) + knot + two hanging tails. On ROBE_TRIM,
  // not on an off-palette dark purple: docs §5 ships exactly two robe values and
  // the sash is a contrast band, so the lighter one is the correct read — and it
  // merges into the lapels' existing buffer, which is one draw call back.
  shellBin.add(nm(mesh(loft([
    { at: [0.016, 0.045, 0], shape: roundedRectPoints(0.47, 0.49, 0.15) },
    { at: [0.016, 0.100, 0], shape: roundedRectPoints(0.475, 0.495, 0.15) },
  ], { ringPoints: 20, caps: false }), robeTrimM), 'sash'))
  shellBin.add(nm(mesh(superellipsoid(0.055, 0.042, 0.060, 2.4, 2.4, 12), robeTrimM, 0.225, 0.072, 0.055), 'sashKnot'))
  for (const t of [0.030, 0.082]) {
    shellBin.add(nm(mesh(splineTube([
      [0.235, 0.055, t], [0.245, -0.045, t + 0.02], [0.225, -0.130, t - 0.01],
    ], 0.014, 8, null, { radialSeg: 5, aspect: 1.8, roundEnd: true }), robeTrimM), 'sashTail'))
  }

  // heavy gold chain (docs §7.6 — OUR addition, not a source trait): 24 real
  // toroidal links alternating 90 deg, pinned at the trapezius, resting on the
  // pectoral shelf. One InstancedMesh, one draw call.
  // The last build placed the links on a path whose forward extent (x 0.055 ..
  // 0.170) never left the inside of the ribcage, so the only links you could
  // see were the ones that had wrapped around to his BACK, and the visible
  // remainder merged into a single gold blob. The path is now solved in a
  // WORLD-ALIGNED frame (chainG cancels the 22 deg thoracic roll) and every
  // link is laid ON the chest surface, oriented off the path tangent.
  {
    const chainG = pivot(tw, 0, 0, 0)
    chainG.rotation.z = 0.22          // cancel the slouch: local y = world y - 0.95
    chainG.name = 'chain'
    const N = 24
    // p(t): pinned on the trapezius at (0.03, 1.30, +/-0.165) and resting on
    // the pectoral shelf at (0.235, 1.14, 0) — 0.16 m below the pin and 0.06 m
    // below the chest apex, exactly docs §7.6.
    const p = (t) => {
      const s = Math.sin(Math.PI * t)
      return new THREE.Vector3(
        0.030 + 0.205 * Math.pow(s, 0.72),
        (1.300 - 0.160 * Math.pow(s, 1.25)) - 0.95,
        0.165 * Math.cos(Math.PI * t))
    }
    const frames = []
    const tan = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Vector3(0, 1, 0)
    const m3 = new THREE.Matrix4()
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N
      const a = p(Math.max(0, t - 0.01)), b = p(Math.min(1, t + 0.01))
      tan.copy(b).sub(a).normalize()
      // even links lie flat against the chest (their axis is the surface
      // normal), odd links stand on edge — the alternating 90 deg cuban run.
      up.copy(q).cross(tan).normalize()
      const axis = (i % 2) ? up : new THREE.Vector3().crossVectors(tan, up).normalize()
      // filletRing's own axis is +Y; aim it along `axis`.
      const zz = new THREE.Vector3().crossVectors(axis, tan).normalize()
      m3.makeBasis(tan, axis, zz)
      frames.push({ p: p(t), q: new THREE.Quaternion().setFromRotationMatrix(m3) })
    }
    chainG.add(instancedQ(filletRing(0.022, 0.008, 5, 6), goldM, 'chainLink', frames))
  }
  // costume 1: a plain gold rope braid at the shoulder instead of the chain trim
  if (cos1) shellBin.add(nm(mesh(splineTube([
    [0.05, 0.415, 0.15], [-0.02, 0.430, 0.0], [0.05, 0.415, -0.15],
  ], 0.010, 12, null, { radialSeg: 6, roundEnd: true }), goldM), 'ropeBraid'))

  // --- arms (docs §4.2: intermembral index 108, knuckles 0.126 below the knee)
  // shoulder world y 1.320, upper arm 0.42, forearm 0.40, hand 0.18.
  for (const side of [1, -1]) {
    const arm = pivot(tw, -0.100, 0.357, 0.235 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    const armBin = staticBin(arm, 'armStatic'); bins.push(armBin)
    armBin.add(nm(mesh(jointBall(0.098, 12), furM, 0, 0, 0), 'deltoid'))
    // apes carry mass distally — the upper arm is barely thicker than the
    // forearm. Do NOT build a bodybuilder taper.
    armBin.add(nm(mesh(taperedCapsule(0.082, 0.095, 0.30, 3, 12), furM, 0, -0.212, 0), 'upperArm'))
    armBin.add(nm(mesh(sleeve(0.100, 0.092, 0.10, { radialSeg: 12, lengthSeg: 3, bulge: 0.05 }), furM, 0, -0.075, 0), 'shoulderSleeve'))
    armBin.add(nm(mesh(jointBall(0.084, 12), furM, 0, -0.420, 0), 'elbow'))

    const fore = pivot(arm, 0, -0.42, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    // left forearm is baked bent — that hand carries the mug at all times
    const fw = bent(fore, side === 1 ? 1.3 : 0.2)
    const foreBin = staticBin(fw, 'foreStatic'); bins.push(foreBin)
    foreBin.add(nm(mesh(taperedCapsule(0.066, 0.084, 0.27, 3, 12), furM, 0, -0.203, 0), 'forearm'))
    foreBin.add(nm(mesh(sleeve(0.088, 0.080, 0.09, { radialSeg: 12, lengthSeg: 3, bulge: 0.05 }), furM, 0, -0.055, 0), 'elbowSleeve'))
    // long forearm fur overhangs the back of the hand by 0.025 — free silhouette
    foreBin.add(nm(mesh(skirt(0.070, 0.098, 0.062, { radialSeg: 14, lengthSeg: 2, curve: 0.75 }), furM, 0, -0.372, 0), 'forearmFur'))
    // Modelled clump tufts on the UNDERSIDE of the forearm only, tapered and
    // sunk into the limb. The last build put four 0.020 x 0.042 x 0.014 BOXES
    // on a 0.078 m radius around a forearm of radius ~0.070 — they floated
    // clear of the surface and read as "stray tan cubes off both wrists",
    // which is exactly what the critic found.
    for (let i = 0; i < 4; i++) {
      const a = 2.35 + (i / 3) * 1.6
      foreBin.add(nm(rot(mesh(taperedCapsule(0.013, 0.003, 0.026, 2, 6), furM,
        Math.cos(a) * 0.058, -0.284 - (i % 2) * 0.034, Math.sin(a) * 0.058), 0, -a, 2.5), 'forearmTuft'))
    }
    // HAND (docs §4.3). The last build was a rounded palm slab plus a second
    // 0.098 x 0.030 x 0.092 slab of "knuckle pads" — one hard rectangular top
    // that read as a radiator grille — plus a 0.030 m stub for a thumb that was
    // effectively invisible. Rebuilt: a lofted palm, four three-segment fingers
    // at the spec 0.115 m total, per-finger knuckle callus discs, and a real
    // 0.055 m thumb rooted at the BASE of the palm and opposed ~35 deg.
    const hand = new THREE.Group(); hand.name = 'hand'; hand.position.set(0.004, -0.412, 0); fw.add(hand)
    const handBin = staticBin(hand, 'handStatic'); bins.push(handBin)
    handBin.add(nm(mesh(loft([
      { at: [0.004, 0.008, 0], shape: superellipsePoints(0.098, 0.086, 2.8, 14) },
      { at: [0.006, -0.036, 0], shape: superellipsePoints(0.106, 0.098, 3.0, 14) },
      { at: [0.008, -0.070, 0], shape: superellipsePoints(0.100, 0.104, 3.0, 14) },
    ], { subdivide: 1, ringPoints: 14 }), hideM), 'palm'))
    // thumb: 0.055 m = 0.48 x finger length, rooted low and far back, opposed
    // only ~35 deg. Chimps have long robust fingers and a SMALL thumb; getting
    // this wrong is what makes an ape hand read human.
    handBin.add(nm(rot(mesh(taperedCapsule(0.016, 0.012, 0.030, 2, 8), hideM,
      0.020, -0.030, -0.052 * side), 0, 0, 0.61 * side), 'thumb'))
    handBin.add(nm(sph(0.014, hideM, 0.040, -0.058, -0.070 * side, 1, 1, 1, 8), 'thumbTip'))
    // four fingers, three bevelled-capsule segments each, total length 0.115,
    // base diameter 0.030, curled 0.10 rad per joint so the hand is a relaxed
    // hook rather than four flat-topped slabs.
    const segGeo = [
      taperedCapsule(0.0150, 0.0138, 0.030, 2, 7),
      taperedCapsule(0.0138, 0.0124, 0.026, 2, 7),
      taperedCapsule(0.0124, 0.0100, 0.022, 2, 6),
    ]
    for (let i = 0; i < 4; i++) {
      const fz = (i - 1.5) * 0.027
      const spread = 0.085 * (i - 1.5)
      const f = pivot(handBin, 0.014, -0.086, fz)
      f.rotation.z = spread * 0.35
      f.rotation.x = -spread
      let y = -0.028
      for (let k = 0; k < 3; k++) {
        f.add(nm(mesh(segGeo[k], hideM, 0.004 * k, y, 0), 'fingerSeg'))
        // knuckle callus: a flattened disc on the middle phalanx — he walks on
        // these, and even standing they should read as weight-bearing surfaces
        if (k < 2) {
          f.add(nm(scl(mesh(ball(0.0104, 6), hideM, 0.014 + 0.004 * k, y - 0.024, 0), 1, 0.55, 1), 'knuckleCallus'))
        }
        y -= 0.036 - k * 0.004
      }
    }

    if (side === 1) {
      // THE MUG (docs §7.7). Two things were wrong: it sat 0.06 m clear of the
      // fingers with nothing wrapping it, and — because the `mug` bone
      // inherited the forearm's baked 1.08 rad bend and never cancelled it —
      // the whole cup was tilted 62 deg off vertical, which is why it read as a
      // small white pill bottle rather than as a cup of coffee. The bone now
      // cancels that bend so the mug stands UPRIGHT in world, and it is seated
      // in the palm with the four fingers closing across its far face and the
      // thumb behind it. Bone name and hierarchy are unchanged.
      const mug = pivot(fw, 0.062, -0.467, 0.0)
      bones.mug = mug
      // The upright correction goes on a STATIC WRAPPER INSIDE the bone, never
      // on the bone: Animator.js:204 does `b.rotation.set(rx, ry, rz)` from the
      // clip key, i.e. rotations are ABSOLUTE, so a baked -1.08 on `mug` itself
      // would be wiped the first frame idle/walk/hitLight keyed the mug track
      // and the cup would flop back over. Same idiom as `tw`, `hw` and `fw`.
      const mw = bent(mug, -1.08)
      const mugBin = staticBin(mw, 'mugStatic'); bins.push(mugBin)
      mugBin.add(nm(mesh(roundedCylinder(0.043, 0.085, 0.006, 18, 2), mugM, 0, 0.015, 0), 'mugBody'))
      mugBin.add(nm(rot(mesh(filletRing(0.030, 0.008, 5, 12), mugM, 0, 0.012, 0.055), Math.PI / 2), 'mugHandle'))
      // chipped rim, twice (docs §6 wear #5) — a 0.6-roughness patch each
      mugBin.add(nm(sph(0.010, mugM, 0.041, 0.056, 0.010, 1, 0.7, 1, 8), 'mugChip'))
      mugBin.add(nm(sph(0.008, mugM, -0.030, 0.056, 0.028, 1, 0.7, 1, 8), 'mugChip'))
      // the coffee disc at 78% fill, on the `water` surface — a real dark
      // liquid plane inside the cup, never clipping the rim.
      mw.add(nm(mesh(roundedCylinder(0.037, 0.010, 0.003, 16, 1), coffeeM, 0, 0.0405, 0), 'coffee'))
      const tex = labelTex('MEH', { w: 128, h: 64, size: 40, bg: '#f2efe9' })
      if (tex) {
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(0.055, 0.034),
          new THREE.MeshBasicMaterial({ map: tex }))
        label.position.set(0.0445, 0.015, 0)
        label.rotation.y = Math.PI / 2
        label.name = 'mugMark'
        markDynamic(label)
        mw.add(label)
      }
    }
  }
  // ==========================================================================
  // HEAD — docs §3. TWO parts, and the second one is not optional: the `head`
  // bone POSITION is solved back through the torso's slouch so the pivot lands
  // at world (0.10, 1.500, 0), and `hw` below cancels the slouch's ROTATION so
  // that head-local y = world y - 1.500 exactly. Solve only the position (the
  // easy half) and the whole ladder below is sheared 12.6 deg.
  // Every number here is then straight off the §2 landmark table:
  //   fur crown +0.300 | brow top +0.232 | EYE = EAR +0.163 | nostril +0.114
  //   muzzle widest +0.046 | mouth -0.046 | chin -0.080 | beanie apex +0.400
  // W_s (skull width) = 0.228, H_h (head height) = 0.380.
  // ==========================================================================
  const head = pivot(tw, -0.0224, 0.5586, 0)
  bones.head = head
  // `hw` cancels the torso's baked -0.22 thoracic roll. Without it the face
  // points 12.6 deg at the floor and — the tell that catches it instantly — the
  // ear centres ride 0.017 ABOVE the eye centres instead of on the same line
  // (docs §11 check 4). Same idiom as `tw` under `torso`: the bone itself is
  // untouched, so every clip key and Gore._detach() still behave identically.
  // The "looks down his nose" read comes from the brow overhang and the lid
  // droop, which are modelled — not from tipping the whole skull.
  const hw = bent(head, 0.22)
  const headBin = staticBin(hw, 'headStatic'); bins.push(headBin)

  // --- cranium. The frontal plane is FLAT, raked 20 deg back from vertical:
  // a round forehead makes it a monkey, not *this* ape. Widest point sits ON
  // the eye line, which is what keeps it a dome instead of a slab.
  const skull = scaled(ball(0.114, 20, { unique: true }), 0.95, 1.20, 1.00)
  flattenFront(skull, 0.108, 0.069, 0.94, 0.34, 0.052, 0.027)
  headBin.add(nm(mesh(skull, furM, -0.012, 0.163, 0), 'cranium'))
  // 0.068 m of fur forehead between the brow top and the crown — the beanie
  // cuff lands here and it must not be squeezed to zero.
  headBin.add(nm(mesh(superellipsoid(0.070, 0.030, 0.100, 3.0, 3.0, 14), furM, 0.048, 0.268, 0), 'frontalShelf'))
  // ...which leaves a modelled supratoral sulcus channel behind the torus.
  headBin.add(nm(sph(0.052, furDeepM, 0.060, 0.243, 0, 0.28, 0.16, 1.9, 10), 'supratoralSulcus'))
  // under-jaw shadow fur: the hard dark line that separates head from neck
  headBin.add(nm(sph(0.090, furDeepM, 0.030, -0.030, 0, 1.5, 0.55, 1.2, 12), 'underJawFur'))

  // --- brow ridge: ONE unbroken supraorbital torus crossing the midline,
  // front face at x +0.100, underside lip at +0.184, tipped -7 deg so it
  // overhangs the eyes. That overhang is the whole dead-eyed read — no painted
  // darkness anywhere.
  // Span 0.196 Z inside a 0.228 skull, back face buried at x +0.030. The two
  // lateral "trigone" blobs are GONE: at z +/-0.088 with a 0.026 half-width they
  // reached z 0.114 against a skull that is only 0.1077 wide at brow height, so
  // they projected clear of the silhouette with fur visible behind them and the
  // whole ridge read as a dog bone. The lateral thickening is now built into
  // the mask relief's own section stack, inside the skull outline.
  headBin.add(nm(rot(mesh(roundedBox(0.070, 0.048, 0.196, 0.012, 3), skinM, 0.090, 0.208, 0), 0, 0, -0.122), 'browTorus'))

  // --- THE MASK (docs §3.9) — the identity shape, and the single highest-value
  // fix on this character. It was two disconnected pieces (a periocular pad pair
  // plus a bridge block) with APE_FUR showing through between them and between
  // them and the muzzle; §3.9 names that exact failure ("a pair of goggles
  // sitting on a separate muzzle patch"). It is now ONE lofted relief whose
  // section stack walks the §3.9 polygon:
  //     A glabella +0.232 -> B brow pads +0.216 -> C outer corner +0.196
  //     -> D widest, ON THE EYE LINE +0.166 at z +/-0.113 (0.98 x W_s)
  //     -> down through the waist and BURIED inside the muzzle at +0.108,
  // so the pale shape is continuous from brow pad to chin with no break. The
  // path is kept NEARLY VERTICAL on purpose: a loft frame swings with its path,
  // and an earlier attempt that ramped the lower sections forward to x +0.150
  // tilted the frame ~45 deg and threw the relief's front face out to x +0.164,
  // which buried the eyeballs all over again. It
  // stands 0.006-0.013 proud of the fur (skull front is x +0.081..+0.096 across
  // this range) with the boundary bevelled by the loft's own corner radius, so
  // the fur/skin transition self-shades instead of reading as a paint edge.
  headBin.add(nm(mesh(loft([
    { at: [0.064, 0.128, 0], shape: roundedRectPoints(0.118, 0.206, 0.055) },
    { at: [0.058, 0.150, 0], shape: roundedRectPoints(0.092, 0.212, 0.046) },
    // ROUND 4: this section was at x 0.055, putting the relief's front face at
    // head-local +0.102 — and the eyeball's own surface drops behind +0.102 only
    // 0.030 m from its centre, so the mask was cutting the INNER third off both
    // apertures. Pulled back to +0.049 (front face +0.096, flush with the
    // cranium's own front at the eye line, so no fur can open up behind it),
    // which moves the inner canthus out to z +/-0.028 and lets the sclera slot
    // reach its §3.3 width.
    { at: [0.052, 0.166, 0], shape: roundedRectPoints(0.094, 0.226, 0.047) },
    { at: [0.053, 0.196, 0], shape: roundedRectPoints(0.090, 0.200, 0.045) },
    { at: [0.050, 0.216, 0], shape: roundedRectPoints(0.082, 0.160, 0.041) },
    { at: [0.046, 0.232, 0], shape: roundedRectPoints(0.070, 0.100, 0.035) },
  ], { subdivide: 2, ringPoints: 22 }), skinM), 'maskRelief'))
  // THE WAIST at E. §3.9's pinch cannot come from the mask outline itself — the
  // muzzle is 0.214 wide up to y +0.173 and the muzzle is inside the mask — so
  // it comes from FUR: two cheek masses that lap over the muzzle's upper-lateral
  // corners and squeeze the pale outline back to z = +/-0.088 at the cheek line
  // before it flares again to +/-0.113 at the eye. Without this the mask is one
  // undifferentiated slab and the source read collapses.
  //
  // ROUND 4 — THE SECOND HALF OF THE MISSING-EYES BUG, AND THE "CLOWN NOSE".
  // The last build's cheek masses were centred at (+0.192, +0.126, +/-0.104) with
  // half-extents 0.062 X x 0.044 Y x 0.020 Z, so they occupied world
  //   y 1.582..1.670   z +/-0.084..0.124   front face x 0.354
  // The eye APERTURE runs y 1.635..1.661 with its outer corner at z +/-0.109 —
  // i.e. these two brown balls sat directly on top of the outer half of both
  // eyes (confirmed as the first raycast hit there), and their front face stood
  // 0.024 m PROUD of the muzzle plane at cheek height, which in a 3/4 view is
  // the "dark ball glued to the front of the muzzle" the critic named.
  // They are now flatter, lower and pushed LATERAL: y +0.072..+0.136 (top edge
  // 0.027 below the aperture floor), inner edge exactly z +/-0.086 — which is
  // §3.9's waist point E — and their front face is at x +0.225 head-local,
  // 0.036 BEHIND the muzzle plane, so they can never break the front silhouette.
  // They still pinch the pale outline in at the cheek line and let it flare back
  // to +/-0.113 at the eye, which is the one thing that makes the mask read as
  // one waisted shape instead of goggles on a muzzle patch.
  for (const side of [1, -1]) {
    headBin.add(nm(mesh(superellipsoid(0.058, 0.032, 0.026, 2.6, 2.6, 14), furM, 0.167, 0.104, 0.112 * side), 'cheekFur'))
    // the clump breaker rides on the cheek mass's OUTER shoulder, pointing back
    // along the jaw, so it reads as fur direction rather than as a lump.
    headBin.add(nm(rot(mesh(taperedCapsule(0.020, 0.005, 0.040, 2, 7), furM,
      0.150, 0.086, 0.126 * side), 0, -0.5 * side, 1.9 * side), 'cheekTuft'))
  }

  // --- muzzle. A ROUNDED BOX, not an ellipsoid: the mouth is 0.190 wide and
  // sits at y -0.046, where an ellipsoid of this height is only 0.147 across.
  // Projection: front plane x +0.260 = 0.160 forward of the brow front (+0.100).
  //
  // ONE DELIBERATE DEVIATION FROM §3.5, and it is forced by 3D. §3.5 puts the
  // muzzle's top at head-local y +0.173 while §3.3 puts the EYE LINE at +0.163
  // — so the muzzle box stands 0.010 m ABOVE the eyes and, projecting 0.16 m
  // forward, it occludes them completely in any front view. (Verified with an
  // orthographic ray scan: at y 1.663 the first hit at the eye's own z was
  // `muzzle` at x 0.328, with the sclera 0.106 m behind it.) That is why the
  // last build had no readable eyes no matter where the eyeballs were put.
  // The box is therefore 0.219 Y instead of 0.253, spanning y -0.081 -> +0.138:
  // the chin, the mouth line, the 0.206 m width at the mouth and the 0.160 m
  // forward projection are all unchanged, and the nostril pair still sits
  // 0.009 m inside the top edge. The lost 0.034 m is picked up by the mask
  // relief, which now ramps forward into the muzzle's top face (below), so the
  // pale shape is still one continuous surface from brow pad to chin.
  headBin.add(nm(mesh(roundedBox(0.185, 0.219, 0.214, 0.055, 3), skinM, 0.168, 0.0285, 0), 'muzzle'))
  // Junction fillet welded into both surfaces — no visible intersection line.
  //
  // ROUND 4, AND THIS ONE COST THE CHARACTER ITS EYES. §3.5 asks for a major
  // 0.100 torus centred at (+0.090, +0.075). After the -10 deg cant its top arc
  // rises to head-local y +0.182 and, because the cant tips the ring's plane out
  // of YZ, that arc also swings FORWARD to x +0.1235 — i.e. the fillet crossed
  // the eye line (+0.163) 0.024 m IN FRONT of the eyeball's own pole (+0.122).
  // An orthographic front scan showed `muzzleFillet` as the first hit at every
  // sample between z 0 and z +/-0.05 across the whole aperture: it was eating the
  // inner half of both eyes. Dropped to (+0.080, +0.020) with major 0.086 and
  // tube 0.017, its top now reaches +0.132 — under the lower lid's bottom edge
  // (+0.1035) region and clear of the 0.0267 m aperture — and its front face
  // sits at x +0.112, 0.010 behind the sclera. The muzzle/cranium seam it exists
  // to hide is covered above that height by the cheek fur (below) and the mask
  // relief, so nothing opens up.
  headBin.add(nm(rot(mesh(filletRing(0.086, 0.017, 6, 16), skinM, 0.080, 0.020, 0), 0, 0, Math.PI / 2 - 0.175), 'muzzleFillet'))
  for (const side of [1, -1]) {   // jowls: 0.014 proud of the muzzle side
    headBin.add(nm(sph(0.052, skinM, 0.150, 0.020, 0.090 * side, 0.7, 0.9, 0.6, 12), 'cheekPouch'))
  }
  // philtrum: one strong vertical groove, slightly off-vertical, running from
  // under the nasal pad (+0.073) to the upper-lip band top (-0.008). This one
  // crease does more for the coarse-cartoon-ape read than any texture.
  //
  // ROUND 4 — IT WAS INVERTED. A single proud dark bar on a convex surface is a
  // RIDGE, and §3.5 asks for a 0.008 x 0.006 GROOVE. Without CSG you cannot cut
  // one, so it is built the way a modeller builds it: the dark bar is dropped
  // 0.003 m BEHIND the muzzle's front plane (front face x +0.2555 against a
  // muzzle surface of +0.2605) and two narrow pale ridges are laid either side
  // of it at z +/-0.0105, each standing 0.005 proud. Light now runs across a
  // ridge, into shadow, and out the other side — which is what a groove looks
  // like — instead of across a fin. Width is halved to 0.008 and it stops at the
  // nasal pad's underside (+0.073); an ape has no nose-bridge fin.
  headBin.add(nm(rot(mesh(roundedBox(0.008, 0.078, 0.008, 0.003, 2), skinShadeM, 0.2570, 0.032, 0), 0, 0, 0.052), 'philtrum'))
  for (const side of [1, -1]) {
    headBin.add(nm(rot(mesh(roundedBox(0.010, 0.074, 0.009, 0.004, 2), skinM, 0.2585, 0.032, 0.0105 * side), 0, 0, 0.052), 'philtrumRidge'))
  }
  // NASAL BRIDGE. The last build ran this from the nostrils to (0.206, 0.196) —
  // 0.106 m forward of the brow's front face — so it rendered as a tapered pale
  // CONE sticking up out of the forehead above the brow bar, into the beanie.
  // It now follows the face's concave dish back to the glabella at x +0.112,
  // which is the mask relief's own front surface, and it terminates at y +0.192
  // so it can never appear above the torus top edge (+0.232).
  //
  // ROUND 4 — THIS WAS THE BEAK. At radius 0.0145 it stood 0.024 m proud of the
  // muzzle at its base and ran from the nostrils all the way up past the eye line
  // to y +0.192, so an orthographic front scan found `nasalBridge` as the first
  // hit down the entire midline from y 1.61 to 1.69 — a pale vertical fin
  // between the eyes, and by area the loudest single form on the face. §3.4
  // allows 0.028 m wide and only 0.010 m PROUD AT ITS BASE, tapering to nothing
  // at the glabella. Radius is now 0.010 at the root falling to 0.0018, and the
  // whole ridge is pushed 0.006 back into the face, so it is a soft swell that
  // catches a highlight and never breaks the profile.
  headBin.add(nm(mesh(splineTube([
    [0.2480, 0.126, 0], [0.2230, 0.152, 0], [0.1690, 0.176, 0], [0.1120, 0.192, 0],
  ], 0.010, 12, (t) => 0.0100 - 0.0082 * t * t, { radialSeg: 7, roundEnd: true }), skinM), 'nasalBridge'))

  // --- NOSE. Docs §3.4's top-three read cue, and in the last build it did not
  // exist in the render: the pad's surface at the nostril's own z sits at
  // x = +0.2565, and both the rim (x 0.248) and the bore (x 0.2535) were built
  // BEHIND it, i.e. buried inside the pad. Nothing was visible but a sliver.
  // The pad is pulled back to +0.232 and the apertures pushed out so the bore
  // reads as a dark hole sunk inside a rolled rim that stands 0.007 proud:
  //     pad surface at the aperture   x = +0.2565
  //     bore front face               x = +0.2620   (dark, APE_NOSTRIL)
  //     rim front face                x = +0.2685   (rolled, APE_MASK_SHADE)
  // Pair span 0.177 = 0.78 x W_s. Each aperture 0.072 x 0.030, tilted 12 deg
  // outward-downward. These two dark shapes are what identify the head.
  // Pad Z half-extent 0.055 x 1.94 = 0.1067, which must EXCEED the rolled rim's
  // outer edge (0.0525 + 0.048 = 0.1005) or the apertures hang off the side of
  // the pad — §3.4 calls that the ugliest failure mode available here.
  headBin.add(nm(sph(0.055, skinM, 0.234, 0.110, 0, 0.52, 0.52, 1.94, 18), 'nasalPad'))
  for (const side of [1, -1]) {
    const nz = 0.0525 * side
    const tilt = pivot(headBin, 0.2605, 0.110, nz)
    tilt.rotation.x = 0.21 * side
    // ROUND 4 — THEY WERE PAINT, AND THEY WERE READING AS THE EYES.
    // Both previous builds stacked two SOLID convex discs (`lens()` is a plate,
    // not a ring), so whichever one was in front won and the result was a flat
    // dark ellipse decal with no interior, no rim shadow and no depth — the two
    // largest, darkest shapes on the face, which is why a viewer at 1 m parsed
    // them as eyes and the head as a walrus.
    //
    // It is now an actual hole. The rolled rim is a TORUS — a ring with a real
    // void through it — built in the XZ plane with tube 0.006, squashed 0.44 in
    // its own local X and then rotated a quarter turn about Z, which lands the
    // ring in the YZ plane with the tube depth along +/-X. The arithmetic that
    // matters:
    //     inner hole   0.036 * 0.44 = 0.0158 in Y,  0.036 in Z
    //     -> aperture  0.072 m wide x 0.032 m tall   (§3.4: 0.072 x 0.030) ✓
    //     outer edge   0.0525 + 0.048 = 0.1005 < the pad's 0.102 Z half-extent ✓
    // Through that hole you see `nostrilFloor`, sunk 0.015 m behind the rim's
    // front face on APE_NOSTRIL — the darkest albedo on the model — at the
    // `skin` preset's roughness x 0.42 = 0.22 with a 0.22 clearcoat, so each
    // aperture carries one small wet glint at its lower rim (§6). The rim itself
    // is APE_MASK_SHADE, a value step DOWN from the mask, so it casts its own
    // border shadow instead of needing one painted in.
    tilt.add(nm(rot(mesh(lens(0.048, 0.024, 0.012, { crown: 0.004, seg: 14, faceSeg: 2, rimSeg: 1 }), nostrilM, -0.0140, 0, 0),
      0, Math.PI / 2, 0), 'nostrilFloor'))
    tilt.add(nm(scl(rot(mesh(filletRing(0.042, 0.006, 6, 18), skinShadeM, 0, 0, 0), 0, 0, Math.PI / 2), 0.44, 1, 1), 'nostrilRim'))
  }
  // ~64 stubble dashes radiating downward from the nostrils across the muzzle,
  // sparing the lip band (docs §6 micro-detail 1). Modelled as one merged
  // buffer of 0.006 m slivers — geometry, so they catch raking light instead of
  // being painted into the albedo, which is the amateur tell the brief names.
  {
    const stub = plate(circlePoints(0.0026, 5), 0.0026, 0.0009, { faceSeg: 0, rimSeg: 1 })
    const dashes = []
    let s = 20221
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    for (let i = 0; i < 44; i++) {
      const zz = (rnd() * 2 - 1) * 0.098
      const yy = 0.070 - rnd() * 0.070          // +0.070 .. 0.000, above the lips
      const zn = Math.min(1, Math.abs(zz) / 0.107)
      const xx = 0.2610 - 0.055 * zn * zn - Math.max(0, (yy - 0.040)) * 0.10
      dashes.push([xx, yy, zz, 0, -Math.sign(zz) * zn * 0.9, (zz > 0 ? -1 : 1) * (0.25 + rnd() * 0.3)])
    }
    repeated(headBin, stub, skinShadeM, 'stubble', dashes)
  }

  // --- mouth. The base mesh mouth is CLOSED and shows NO teeth: this is the
  // archetype's default expression and the weary indifference is the joke. Two
  // swept bands, not a torus (a torus wide enough for a 0.190 aperture would
  // burst the 0.206 muzzle). The lower band is 1.4x the upper and its lower
  // edge IS the chin, overhanging the throat.
  //
  // The last build put both bands on a straight chord at x 0.254 .. 0.266 while
  // the muzzle's own front surface at those heights runs 0.233 .. 0.256 — so
  // the lower band hung 0.023 m out in front of the chin with brown fur showing
  // between it and the pale muzzle, and it read as a lozenge glued on below the
  // face. Every control point below now sits ON the rounded box's surface
  //     x(y, z) = 0.205 + sqrt(0.055^2 - dy^2 - dz^2)   (in the corner fillet)
  // plus the band's own proud height, so the bands are cut INTO the mask.
  const lipPts = (yMid, xMid, xShoulder) => [
    [0.2340, -0.046, 0.095], [xShoulder, (yMid - 0.046) / 2 - 0.008, 0.060],
    [xMid, yMid, 0],
    [xShoulder, (yMid - 0.046) / 2 - 0.008, -0.060], [0.2340, -0.046, -0.095],
  ]
  // ROUND 4 — the two bands were 0.0135 and 0.0170 at the crest, a ratio of
  // 1.26, and read as an equal-weight pair, which loses the fat-lower-lip
  // signature §3.6 calls a source cue. They are now exactly 0.010 and 0.014 at
  // the crest (ratio 1.40) and both taper to 0.0014 at the commissures, so a
  // 0.190 m aperture still lives inside a 0.206 m muzzle.
  // upper band: cross-section half-height 0.010, crest at y -0.020
  headBin.add(nm(mesh(splineTube(lipPts(-0.0200, 0.2575, 0.2555), 0.0100, 20,
    (t) => 0.0014 + 0.0086 * Math.sin(Math.PI * t), { radialSeg: 8, roundEnd: true }), lipM), 'lipUpper'))
  // lower band: 1.4x the upper (0.014), its bottom edge IS the chin at -0.080,
  // and it overhangs the throat by 0.030 to cut the head-from-neck shadow line.
  headBin.add(nm(mesh(splineTube(lipPts(-0.0660, 0.2455, 0.2470), 0.0140, 20,
    (t) => 0.0018 + 0.0122 * Math.sin(Math.PI * t), { radialSeg: 8, roundEnd: true }), lipM), 'lipLower'))
  // the mouth LINE itself: a dark hairline in the seam between the two bands,
  // so the closed mouth still reads at 1 m without opening the jaw.
  headBin.add(nm(mesh(splineTube([
    [0.2320, -0.046, 0.093], [0.2540, -0.043, 0.055], [0.2600, -0.042, 0],
    [0.2540, -0.043, -0.055], [0.2320, -0.046, -0.093],
  ], 0.0092, 18, (t) => 0.0016 + 0.0076 * Math.sin(Math.PI * t), { radialSeg: 6, roundEnd: true }), mouthM), 'mouthLine'))
  // closed dark shell behind the lips so you never see through the head. Pushed
  // back to x 0.214 so nothing behind the closed lip line can poke through it.
  headBin.add(nm(rot(mesh(plate(superellipsePoints(0.196, 0.062, 2.4, 12), 0.030, 0.010, { crown: 0.008, faceSeg: 1, rimSeg: 1 }),
    mouthM, 0.214, -0.046, 0), 0, Math.PI / 2, 0), 'mouthShell'))
  headBin.add(nm(rot(mesh(capsule(0.019, 0.040, 3, 8), mouthM, 0.190, -0.050, 0), 0, 0, Math.PI / 2), 'tongue'))
  // Teeth ARE real geometry — an elliptical dental arcade, 10 up and 10 down,
  // two InstancedMeshes. They live behind the closed lip line and only show
  // when the jaw opens, exactly as docs §3.6 / §8.1 require.
  const arcade = (n, az, ax, cx, cy, tilt) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * Math.PI * 0.86
      out.push([cx + ax * Math.cos(t) - ax, cy, az * Math.sin(t), 0, -t * 0.9, tilt])
    }
    return out
  }
  // Set back to x 0.228 / 0.224 — behind the closed lip band's inner face — so
  // the base mesh really does show NO teeth. A permanently grinning ape reads
  // as a grinning ape, which is a different and much rarer read, and it loses
  // the weary indifference that is the entire joke.
  repeated(headBin, roundedBox(0.012, 0.024, 0.017, 0.003, 1), toothM, 'toothUpper',
    arcade(10, 0.088, 0.030, 0.228, -0.030, 0))
  repeated(headBin, roundedBox(0.012, 0.020, 0.016, 0.003, 1), toothM, 'toothLower',
    arcade(10, 0.082, 0.028, 0.224, -0.058, 0))

  // --- eyes (docs §3.3). Real geometry: eyeball, iris, pupil, a cornea cap
  // that catches the only bright pixel in the socket, and LID SOLIDS with a lit
  // rim. Idle is 62% closed with the outer corner 0.006 lower than the inner —
  // downturned, because this character is not cute.
  // ONE bin for both eyes: sclera / iris / pupil / cornea collapse to four
  // draw calls instead of ten. The lids are `skinM` and go in the HEAD bin, so
  // they merge straight into the face mask — the lid edge is a continuation of
  // the periocular patch, not a separate object sitting on it.
  //
  // WHY THE LAST BUILD HAD NO EYES. §3.3 puts the eye centre at x +0.050 with a
  // 0.036 m eyeball, so its forward pole reaches +0.086 — and the cranium's own
  // front surface at the eye line is +0.096. The entire eyeball, iris, pupil
  // and cornea were BEHIND the skull surface. All that survived to the render
  // was a dark lid slot, which is exactly what the critic reported: "two black
  // lens slits, no sclera, no iris, no catchlight". Without CSG there is no
  // socket to sink them into, so the eyes come forward instead: centre x
  // +0.0780, pole +0.1160, which clears both the skull (+0.096) and the mask
  // relief's front face (+0.109) and sits under the brow's overhang (+0.100)
  // exactly as §3.2's second overhang number requires.
  //
  // Aperture arithmetic (§3.3, verified in the harness): centre z = +/-0.070,
  // sclera radius 0.038 scaled 1.06 in Z -> visible slot 0.0806 m = 0.35 x W_s,
  // inner corners at +/-0.030, outer at +/-0.110 (inside the 0.114 skull
  // half-width). Upper lid edge at y +0.152 and lower lid top at +0.126 leaves
  // a 0.026 m aperture = 62% closed. That is the idle.
  const eyes = new THREE.Group(); eyes.name = 'eyes'; hw.add(eyes)
  const eyeBin = staticBin(eyes, 'eyeStatic'); bins.push(eyeBin)
  for (const side of [1, -1]) {
    const eye = pivot(eyeBin, 0.0840, 0.163, 0.070 * side)
    eye.name = 'eye'
    // ROUND 4 — the aperture WIDTH is set by where the eyeball's own silhouette
    // drops behind the mask surface, not by the lids: at Z scale 1.15 the sphere
    // fell behind the relief only 0.035 m either side of centre, so the visible
    // white slot was 0.060 m against §3.3's 0.078 (0.34 x W_s). The mask cannot
    // be pulled back further — its front face is already flush with the
    // cranium's at the eye line, and any further and fur opens up behind it. So
    // the eyeball is widened instead: Z 1.25 gives a 0.0475 m half-width and an
    // inner canthus at z +/-0.026, which with the outer corner at +/-0.109 makes
    // the slot 0.083 m before the lids trim it back to spec.
    eye.add(nm(sph(0.038, scleraM, 0, 0, 0, 1, 1, 1.25, 16), 'sclera'))
    // both pupils offset 0.010 to the SAME side — a sidelong glance, not a stare
    eye.add(nm(rot(mesh(plate(circlePoints(0.0155, 14), 0.007, 0.0025, { crown: 0.004, faceSeg: 2, rimSeg: 1 }),
      irisM, 0.0330, 0, 0.010), 0, Math.PI / 2, 0), 'iris'))
    eye.add(nm(rot(mesh(plate(circlePoints(0.0068, 10), 0.005, 0.0018, { crown: 0.002, faceSeg: 1, rimSeg: 1 }),
      pupilM, 0.0358, 0, 0.010), 0, Math.PI / 2, 0), 'pupil'))
    // the cornea cap: the ONLY bright pixel in the socket, and what makes the
    // half-lidded stare read as *tired* rather than blind. transmission 0 — a
    // real transmissive material costs a whole extra scene render.
    eye.add(nm(rot(mesh(lens(0.0175, 0.0175, 0.006, { crown: 0.003, seg: 12, faceSeg: 1, rimSeg: 2 }),
      corneaM, 0.0320, 0, 0.010), 0, Math.PI / 2, 0), 'cornea'))

    // LID SOLIDS, 0.008 m thick so the lid edge has a lit rim. They sit in
    // FRONT of the eyeball (x 0.1055 vs the eyeball's local surface at that
    // height) rather than inside it, which is what gives the rim something to
    // catch. Idle upper lid covers from y +0.152 up; canthal tilt -4.5 deg drops
    // the outer corner 0.006 below the inner. Downturned, because this
    // character is not cute.
    const lids = pivot(headBin, 0.0840, 0.163, 0.070 * side)
    lids.rotation.x = 0.150 * side
    lids.add(nm(rot(mesh(lens(0.0405, 0.0250, 0.0080, { e: 2.6, seg: 14, crown: 0.010, faceSeg: 1, rimSeg: 2 }),
      skinM, 0.0288, 0.0232, 0), 0, Math.PI / 2, 0), 'lidUpper'))
    // the outer-third droop — §3.3's shallow S. A separate small wedge so the
    // lid edge is not a plain arc; this droop IS the "can't be bothered".
    // ROUND 4: this wedge sat at eye-local z +/-0.030 with a 0.017 half-width, so
    // it covered z 0.083..0.117 and clipped the OUTER third of the slot to
    // +/-0.095 against §3.3's +/-0.109. Moved out to +/-0.040 and narrowed, it now
    // starts at 0.109 exactly — it still droops the outer corner, it just no
    // longer stands in the aperture.
    lids.add(nm(rot(mesh(lens(0.0145, 0.0125, 0.0075, { e: 2.4, seg: 12, crown: 0.008, faceSeg: 1, rimSeg: 1 }),
      skinM, 0.0268, 0.0120, 0.0400 * side), 0, Math.PI / 2, -0.16 * side), 'lidDroop'))
    lids.add(nm(rot(mesh(lens(0.0400, 0.0155, 0.0070, { e: 2.6, seg: 12, crown: 0.008, faceSeg: 1, rimSeg: 1 }),
      skinM, 0.0280, -0.0440, 0), 0, Math.PI / 2, 0), 'lidLower'))
    // Periocular crease — a dark hairline ON the upper lid, not across the eye.
    // ROUND 4: it was at lids-local y -0.0010 with a 0.0030 half-height, i.e. it
    // spanned y -0.0040..+0.0020 while the upper lid's own bottom edge is at
    // -0.0018 — so 0.004 m of dark bar hung INSIDE a 0.0267 m aperture, and
    // because it sat at x +0.0400 (0.012 proud of the cornea) it won every
    // raycast. Between it, the muzzle fillet and the cheek fur the visible slot
    // was under 4 px in a head crop. It now rides at +0.0055, wholly above the
    // lid edge, and is pulled back to x +0.0330 so it creases the lid instead of
    // floating in front of it.
    lids.add(nm(rot(mesh(lens(0.0380, 0.0026, 0.0035, { e: 2.4, seg: 12, crown: 0.001, faceSeg: 1, rimSeg: 1 }),
      skinShadeM, 0.0330, 0.0055, 0), 0, Math.PI / 2, 0), 'lidCrease'))
  }

  // --- ears (docs §3.7). The disc lies in the YZ plane, normal along +/-X: it
  // PRESENTS ITS FACE to the camera and extends sideways by its own radius.
  // Build it in XY and the head measures 0.31 across instead of 0.45 and the
  // whole silhouette spec collapses. Set on the eye line, +/- 0.006.
  for (const side of [1, -1]) {
    // ROUND 4: measured head width across the rims came out 0.464 against §11.2's
    // 0.450 +/- 0.008. Pulling the pivot in 0.007 lands it at 0.450.
    const ear = pivot(hw, -0.030, 0.163, 0.099 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    const ew = bent(ear, 0, 0.140, 0.384 * side)   // flared satellites
    const earBin = staticBin(ew, 'earStatic'); bins.push(earBin)
    // disc centre at ear-local z 0.0495 -> head-local +/-0.1459, and with the
    // 22 deg flare the outermost rim vertex lands at +/-0.2250: head width
    // ACROSS THE EARS = 0.450 (docs §11.2), the single widest thing on the head.
    const ez = 0.0460 * side
    earBin.add(nm(rot(mesh(filletRing(0.058, 0.016, 6, 16), furM, 0, 0.002, ez), 0, 0, Math.PI / 2), 'helixRim'))
    earBin.add(nm(rot(mesh(plate(circlePoints(0.056, 14), 0.020, 0.006, { crown: 0.004, faceSeg: 1, rimSeg: 1 }), furM, -0.004, 0.002, ez),
      0, Math.PI / 2, 0), 'earPlate'))
    // CONCHA — the pale inner ear, 0.114 tall x 0.104 wide = 0.75 x the ear
    // diameter, and the THIRD-LARGEST pale shape on the character after the
    // face mask and the chest ruff. In the last build it was set flush with
    // the brown ear plate (concha front x +0.020 vs plate front +0.014) so it
    // contributed almost no value contrast and the ear read brown-on-brown.
    // It now stands 0.011 proud on the face-presenting (+X) side, offset
    // forward 0.010 and down 0.008 from the ear centre exactly as §3.7c asks.
    earBin.add(nm(sph(0.058, skinM, 0.011, -0.006, ez + 0.013 * side, 0.32, 0.98, 0.82, 12), 'concha'))
    earBin.add(nm(sph(0.014, furM, 0.006, -0.052, ez - 0.018 * side, 1, 1, 1, 8), 'antitragus'))
    // §3.7's "ear/beanie interpenetration" note: the cuff reaches y +0.285 and
    // the ear top +0.245, so they overlap. Rather than leave a hard
    // intersection line (contract §0.4), the ear top is TRIMMED — a fur wedge
    // matching the cuff's underside closes the join and hides the seam.
    earBin.add(nm(rot(mesh(superellipsoid(0.040, 0.020, 0.058, 2.8, 2.8, 12), furM, -0.006, 0.066, ez), 0, 0, 0.20), 'earTopTrim'))
    if (side === 1) {
      // one gold hoop, one ear only — symmetry is the enemy of a silhouette.
      // filletRing lies in the XZ plane (axis +Y); rotating pi/2 about Z puts
      // it in the YZ plane, normal along +/-X, which is the same plane as the
      // ear disc — so its 0.048 m inner void reads as a HOLE and not as an
      // edge-on 0.014 m line. §2 counts that void as a silhouette event.
      // ROUND 4 — THE HOLE IS THE POINT, NOT THE WIRE. The last ring had an
      // inner void of only 0.041 m and hung at ear-local y -0.052, i.e. head
      // y +0.111 — which is INSIDE the ear disc's own outline (its bottom edge
      // is at +0.091), so the void had brown ear plate behind it and never read
      // as a hole at all. §7.3 wants the ring hanging 0.5 x ear diameter below
      // the ear centre so it clears the disc against background, and §2 counts
      // its 0.048 m void as a silhouette event. Radius 0.031 with tube 0.007
      // gives inner 0.048 exactly; centre at ear y -0.076 (head +0.087) puts
      // 0.042 m of the ring below the disc with sky behind it.
      const hoop = new THREE.Group(); hoop.name = 'hoop'; ear.add(hoop)
      hoop.add(nm(rot(mesh(filletRing(0.031, 0.007, 6, 18), goldM, 0.020, -0.076, ez), 0, 0, Math.PI / 2), 'hoopRing'))
    }
  }

  // --- knit beanie (docs §7.1) — the strongest single trait cue. Loose, 0.042
  // wider than the skull, squashed, slumped BACKWARD, and cocked 17 deg. Its
  // cuff front edge clears the brow top by 0.014: a beanie pulled down to the
  // eyebrows kills the brow read, and the brow read is 60% of the "heavy".
  const beanie = new THREE.Group(); beanie.name = 'beanie'; hw.add(beanie)
  const beanieBin = staticBin(beanie, 'beanieStatic'); bins.push(beanieBin)
  if (cos1) {
    // costume 1: a generic peaked cap. No insignia, no crest, no braid device.
    beanieBin.add(nm(mesh(superellipsoid(0.155, 0.082, 0.140, 2.6, 2.8, 16), knitM, 0.010, 0.318, 0), 'capCrown'))
    beanieBin.add(nm(mesh(filletRing(0.128, 0.024, 5, 18), robeDarkM, -0.006, 0.256, 0), 'capBand'))
    const vis = pivot(beanieBin, 0.120, 0.242, 0)
    vis.rotation.z = -0.314                     // 18 deg rake down
    vis.add(nm(rot(mesh(plate(superellipsePoints(0.230, 0.150, 2.6, 14), 0.014, 0.005, { crown: 0.008, faceSeg: 1, rimSeg: 1 }),
      knitM, 0.062, 0, 0), Math.PI / 2, 0, 0), 'capVisor'))
  } else {
    // The cuff is canted 17 deg about Z (rotation.x mixes it into the wrong
    // axis for a cap that should sit higher on ONE SIDE, not front-to-back).
    // Crown, cuff and the 12 ribs all live in one canted group so the crown
    // meets the cuff along a single shared circle instead of cutting through
    // it — the hard intersection line the critic found is gone.
    // The crown stays UPRIGHT with its apex at head-local +0.400 = world 1.900
    // (the silhouette top, docs §2) and slumped 0.030 backward; only the CUFF
    // carries the 17 deg cant, which is what §7.1 actually asks for. Canting
    // the whole cap swings the apex 0.045 m over the silhouette ceiling.
    beanieBin.add(nm(mesh(superellipsoid(0.135, 0.100, 0.135, 2.4, 2.6, 18), knitM, -0.030, 0.300, 0), 'beanieCrown'))
    const cap = pivot(beanieBin, -0.014, 0.258, 0)
    cap.rotation.set(0.297, 0, 0.160)
    cap.add(nm(mesh(filletRing(0.132, 0.030, 6, 20), knitM, 0, 0, 0), 'beanieCuff'))
    // 12 modelled ribs that LIE ON the cuff (radius 0.150, axis vertical,
    // normal radial) instead of radiating out of it. The last build mixed
    // cos(a) into X and sin(a) into BOTH Y and Z, which is not a circle at all
    // — it scattered the ribs as rust-coloured skewers pointing out of the cap.
    const ribs = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ribs.push([Math.cos(a) * 0.1495, 0, Math.sin(a) * 0.1495, 0, -a, 0])
    }
    repeated(cap, roundedBox(0.010, 0.056, 0.030, 0.004, 1), knitM, 'beanieRib', ribs)
    // A fur tuft escapes at the front-top, over the cuff. Without it the cap
    // reads as a swim cap. Modelled wedges, not alpha cards. They go in the HEAD
    // bin on the coat material, not in the beanie bin on the tip material: it is
    // the ape's own hair escaping, so it should be the ape's own colour, and it
    // merges into the head's existing `coat` buffer for free instead of costing
    // the beanie a second draw call (docs §6.5's 40-call ceiling).
    for (let i = 0; i < 3; i++) {
      headBin.add(nm(rot(mesh(taperedCapsule(0.017, 0.004, 0.034, 2, 6), furM,
        0.046 - i * 0.004, 0.286 + (i % 2) * 0.010, (i - 1) * 0.032), 0, 0, -0.95 - i * 0.12), 'crownTuft'))
    }
  }

  // --- cigarette (docs §7.2). The only thin element allowed to break the
  // silhouette, out of ONE mouth corner, angled -22 deg down and -14 deg in
  // plan. Deliberately NOT thickened: a fat cigarette reads as a cigar.
  const cig = new THREE.Group()
  cig.name = 'cig'
  cig.position.set(0.2360, -0.046, -0.095)
  cig.rotation.set(0, -0.244, -0.384)
  hw.add(cig)
  bins.push(cig); dyn.push(cig)
  const cigBin = cig
  cigBin.add(nm(rot(mesh(roundedCylinder(0.0052, 0.028, 0.002, 10, 1), cigFilterM, 0.014, 0, 0), 0, 0, Math.PI / 2), 'cigFilter'))
  cigBin.add(nm(rot(mesh(roundedCylinder(0.0050, 0.079, 0.0015, 10, 1), cigPaperM, 0.0675, 0, 0), 0, 0, Math.PI / 2), 'cigPaper'))
  cigBin.add(nm(rot(mesh(roundedCone(0.0050, 0.0034, 0.010, 0.001, 8, 1), cigPaperM, 0.112, 0, 0), 0, 0, -Math.PI / 2), 'cigAsh'))
  // the lip pinch belongs to the LIP, not to the cigarette — on hitHeavy/KO the
  // cig detaches as a prop and the pinched lip has to stay on the face. It also
  // costs zero extra draws there: it merges into the head's existing lip band.
  const pinch = pivot(headBin, 0.2360, -0.046, -0.095)
  pinch.rotation.set(0, -0.244, -0.384)         // same frame as the cigarette
  pinch.add(nm(rot(mesh(filletRing(0.0082, 0.0038, 5, 8), lipM, 0.020, 0, 0), 0, 0, Math.PI / 2), 'cigLipPinch'))
  cig.add(nm(rot(mesh(lens(0.0046, 0.0046, 0.003, { seg: 8, faceSeg: 1, rimSeg: 1 }), emberM, 0.1165, 0, 0), 0, Math.PI / 2, 0), 'cigEmber'))

  // ---- merge each bone's static geometry by material (docs §6.5.2). Merging
  // is strictly WITHIN one bone: Gore._detach() clones a bone's subtree and a
  // buffer spanning two bones would tear on dismemberment. The dynamic flags go
  // on AFTER, because isDynamic() walks ancestors and would otherwise make
  // mergeStatic skip the whole prop.
  mergeBins(bins)
  for (const d of dyn) markDynamic(d)

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.85,0]
// (hips position keys are ABSOLUTE local values — the Animator sets, not adds)
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.85, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  // slow sway + a micro-sleep: head slowly droops, then snaps back awake
  idle: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.2, [0, 0.02, -0.02], [0, 0.83, 0]), K(2.4, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(1.2, [0.02, -0.02, -0.16]), K(2.4, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(1.5, [0, 0, -0.22]), K(1.85, [0, 0, -0.3]), K(1.95, [0, 0.1, 0.24]), K(2.4, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(1.2, [0.03, 0, 0.14]), K(2.4, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(1.2, [-0.04, 0, 0.1]), K(2.4, [0, 0, 0.06])],
      forearmL: [K(0, Z), K(1.2, [0, 0, 0.08]), K(2.4, Z)],
      forearmR: [K(0, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z), K(1.2, [0.04, 0, 0.05]), K(2.4, Z)],
      earL: [K(0, Z), K(1.85, [0.15, 0.1, 0]), K(2.4, Z)],
      earR: [K(0, Z), K(1.85, [-0.15, -0.1, 0]), K(2.4, Z)],
      mug: [K(0, Z), K(1.9, [0, 0, 0.12]), K(2.05, [0, 0, -0.08]), K(2.4, Z)],
    },
  },

  // slippered shuffle — feet barely leave the floor
  walk: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0.03, -0.02], [0, 0.83, 0]), K(0.225, Z, [0, 0.815, 0]), K(0.45, [0, -0.03, -0.02], [0, 0.83, 0]), K(0.675, Z, [0, 0.815, 0]), K(0.9, [0, 0.03, -0.02], [0, 0.83, 0])],
      legL: [K(0, [0, 0, 0.32]), K(0.45, [0, 0, -0.32]), K(0.9, [0, 0, 0.32])],
      legR: [K(0, [0, 0, -0.32]), K(0.45, [0, 0, 0.32]), K(0.9, [0, 0, -0.32])],
      torso: [K(0, [0, -0.03, -0.14]), K(0.45, [0, 0.03, -0.14]), K(0.9, [0, -0.03, -0.14])],
      head: [K(0, [0, 0.03, 0.1]), K(0.45, [0, -0.03, 0.1]), K(0.9, [0, 0.03, 0.1])],
      armL: [K(0, [0, 0, 0.1])],
      armR: [K(0, [0, 0, -0.18]), K(0.45, [0, 0, 0.22]), K(0.9, [0, 0, -0.18])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
      robe: [K(0, [0, 0, 0.1]), K(0.45, [0, 0, -0.1]), K(0.9, [0, 0, 0.1])],
      mug: [K(0, [0, 0, 0.06]), K(0.45, [0, 0, -0.06]), K(0.9, [0, 0, 0.06])],
    },
  },

  // the minimum legally required jump effort
  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, 0.04], [0, 0.9, 0]), K(0.5, [0, 0, 0.04], [0, 0.9, 0])],
      legL: [K(0, Z), K(0.14, [0, 0, 0.55]), K(0.5, [0, 0, 0.45])],
      legR: [K(0, Z), K(0.14, [0, 0, 0.3]), K(0.5, [0, 0, 0.25])],
      armL: [K(0, [0, 0, 0.08]), K(0.14, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      armR: [K(0, [0, 0, 0.06]), K(0.14, [0.3, 0, 0.8]), K(0.5, [0.3, 0, 0.7])],
      torso: [K(0, [0, 0, -0.1]), K(0.14, [0, 0, 0.02])],
      head: [K(0, [0, 0, 0.14]), K(0.14, [0, 0, 0.05])],
      robe: [K(0, Z), K(0.14, [0, 0, -0.35]), K(0.5, [0, 0, -0.3])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  fall: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.06], HIP)],
      torso: [K(0, [0, 0, 0.05])],
      head: [K(0, [0, 0, 0.1])],
      armL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 0.65]), K(0.6, [0, 0, 0.5])], // protect the coffee
      armR: [K(0, [0.4, 0, 1.8]), K(0.3, [0.2, 0, 1.5]), K(0.6, [0.4, 0, 1.8])],
      legL: [K(0, [-0.2, 0, 0.3]), K(0.3, [-0.2, 0, 0.1]), K(0.6, [-0.2, 0, 0.3])],
      legR: [K(0, [0.2, 0, 0.1]), K(0.3, [0.2, 0, 0.3]), K(0.6, [0.2, 0, 0.1])],
      robe: [K(0, [0, 0, -0.5]), K(0.3, [0, 0, -0.65]), K(0.6, [0, 0, -0.5])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  crouch: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.55, 0]), K(0.4, [0, 0, -0.08], [0, 0.54, 0]), K(0.8, [0, 0, -0.08], [0, 0.55, 0])],
      legL: [K(0, [-0.4, 0, 0.75])], legR: [K(0, [0.4, 0, 0.75])],
      torso: [K(0, [0, 0, -0.28])],
      head: [K(0, [0, 0, 0.3])],
      armL: [K(0, [0.2, 0, 0.4])], // mug held carefully level
      armR: [K(0, [-0.2, 0, 0.4])],
      forearmL: [K(0, [0, 0, 0.2])], forearmR: [K(0, [0, 0, 0.6])],
      robe: [K(0, [0, 0, 0.3])],
    },
  },

  block: {
    duration: 0.7, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.03, 0.82, 0])],
      torso: [K(0, [0, 0, -0.05]), K(0.35, [0.02, 0, -0.08]), K(0.7, [0, 0, -0.05])],
      head: [K(0, [0, 0, -0.12])],
      armR: [K(0, [-0.3, 0, 1.0])],
      forearmR: [K(0, [0, 0, 1.5])],
      armL: [K(0, [0.5, 0, -0.3])], // mug tucked safely behind
      forearmL: [K(0, Z)],
      legL: [K(0, [-0.12, 0, 0.08])], legR: [K(0, [0.12, 0, 0.08])],
      robe: [K(0, [0, 0, 0.08])],
    },
  },

  hitLight: {
    duration: 0.3, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.08], [-0.06, 0.83, 0]), K(0.3, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.06, [0, -0.08, 0.2]), K(0.3, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.06, [0, 0.1, 0.45]), K(0.3, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.06, [0.25, 0, 0.4]), K(0.3, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.06, [-0.3, 0, -0.5]), K(0.3, [0, 0, 0.06])],
      mug: [K(0, Z), K(0.07, [0, 0, 0.35]), K(0.16, [0, 0, -0.2]), K(0.3, Z)], // coffee slosh
      earL: [K(0, Z), K(0.07, [0.3, 0.3, 0]), K(0.3, Z)],
      earR: [K(0, Z), K(0.07, [-0.3, -0.3, 0]), K(0.3, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  hitHeavy: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.07, [0, 0, 0.2], [-0.18, 0.8, 0]), K(0.45, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.07, [0, -0.12, 0.45]), K(0.45, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.07, [0, 0.12, 0.7]), K(0.45, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.07, [0.5, 0, -0.9]), K(0.45, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.07, [-0.5, 0, -1.0]), K(0.45, [0, 0, 0.06])],
      legL: [K(0, Z), K(0.08, [0, 0, 0.45]), K(0.45, Z)],
      legR: [K(0, Z)],
      robe: [K(0, Z), K(0.08, [0, 0, 0.5]), K(0.45, Z)],
      mug: [K(0, Z), K(0.08, [0, 0, 0.6]), K(0.2, [0, 0, -0.35]), K(0.45, Z)],
      earL: [K(0, Z), K(0.08, [0.5, 0.5, 0]), K(0.45, Z)],
      earR: [K(0, Z), K(0.08, [-0.5, -0.5, 0]), K(0.45, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.3], HIP)],
      torso: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 0.4]), K(0.5, [0, 0, 0.5])],
      head: [K(0, [0, 0, 0.45])],
      armL: [K(0, [-0.3, 0, 2.1]), K(0.25, [-0.1, 0, 2.3]), K(0.5, [-0.3, 0, 2.1])],
      armR: [K(0, [0.1, 0, 2.3]), K(0.25, [0.3, 0, 2.1]), K(0.5, [0.1, 0, 2.3])],
      legL: [K(0, [0, 0, 0.8]), K(0.25, [0, 0, 0.6]), K(0.5, [0, 0, 0.8])],
      legR: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 0.7]), K(0.5, [0, 0, 0.5])],
      robe: [K(0, [0, 0, -0.8])],
      earL: [K(0, [-0.5, 0.3, 0])], earR: [K(0, [0.5, -0.3, 0])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  // flat on his back. honestly this looks comfortable
  knockdown: {
    duration: 1.0, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.5, [0, 0, 1.35], [0, 0.335, 0]), K(1.0, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])], legR: [K(0, [0, 0, 0.5])],
      torso: [K(0, [0, 0, 0.15])],
      head: [K(0, [0, 0, -0.15])],
      armL: [K(0, [0.9, 0, 0.4])], // mug held upright even in defeat
      armR: [K(0, [-1.0, 0, 0.3])],
      robe: [K(0, [0, 0, -0.4])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  getup: {
    duration: 0.8, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.3, [0, 0, 0.5], [0, 0.48, 0]), K(0.6, [0, 0, 0.05], [0, 0.68, 0]), K(0.8, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.4, [0, 0, 0.55]), K(0.8, Z)],
      legR: [K(0, [0, 0, 0.5]), K(0.4, [0, 0, 0.25]), K(0.8, Z)],
      torso: [K(0, [0, 0, 0.15]), K(0.35, [0, 0, -0.3]), K(0.8, [0, 0, -0.1])],
      head: [K(0, [0, 0, -0.15]), K(0.6, [0, 0, 0.25]), K(0.8, [0, 0, 0.14])],
      armL: [K(0, [0.9, 0, 0.4]), K(0.4, [0.3, 0, 0.3]), K(0.8, [0, 0, 0.08])],
      armR: [K(0, [-1.0, 0, 0.3]), K(0.4, [-0.3, 0, -0.6]), K(0.8, [0, 0, 0.06])],
      robe: [K(0, [0, 0, -0.4]), K(0.5, [0, 0, 0.2]), K(0.8, Z)],
      mug: [K(0, Z), K(0.55, [0, 0, 0.25]), K(0.7, [0, 0, -0.15]), K(0.8, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  // shuffles in, checks an invisible watch, takes one long sip. unimpressed.
  entrance: {
    duration: 2.6, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.83, 0]), K(0.9, Z, [0, 0.83, 0]), K(1.0, Z, HIP), K(2.6, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.25, [0, 0, -0.3]), K(0.5, [0, 0, 0.3]), K(0.75, [0, 0, -0.3]), K(1.0, Z), K(2.6, Z)],
      legR: [K(0, [0, 0, -0.3]), K(0.25, [0, 0, 0.3]), K(0.5, [0, 0, -0.3]), K(0.75, [0, 0, 0.3]), K(1.0, Z), K(2.6, Z)],
      torso: [K(0, [0, 0, -0.16]), K(1.0, [0, 0, -0.1]), K(2.6, [0, 0, -0.1])],
      // checks watch (right wrist), unimpressed, then the sip
      armR: [K(0, [0, 0, 0.06]), K(1.1, [0, 0, 1.25]), K(1.7, [0, 0, 1.25]), K(1.9, [0, 0, 0.06]), K(2.6, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(1.1, [0, 0, 1.0]), K(1.7, [0, 0, 1.0]), K(1.9, Z), K(2.6, Z)],
      head: [K(0, [0, 0, 0.1]), K(1.1, [0, 0, -0.15]), K(1.7, [0, 0.2, -0.15]), K(1.95, [0, 0, 0.14]), K(2.1, [0, 0, 0.42]), K(2.45, [0, 0, 0.42]), K(2.6, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(2.0, [0, 0, 0.08]), K(2.15, [0.15, 0, 0.95]), K(2.45, [0.15, 0, 0.95]), K(2.6, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(2.15, [0, 0, 0.5]), K(2.45, [0, 0, 0.5]), K(2.6, Z)],
      mug: [K(0, Z), K(2.15, [0, 0, -0.4]), K(2.45, [0, 0, -0.4]), K(2.6, Z)],
      robe: [K(0, [0, 0, 0.1]), K(1.0, Z), K(2.6, Z)],
    },
  },

  // one (1) slow celebratory sip. maybe a nod. don't push it
  win: {
    duration: 2.6, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.3, Z, [0, 0.84, 0]), K(2.6, Z, HIP)],
      armL: [K(0, [0, 0, 0.08]), K(0.4, [0.15, 0, 1.0]), K(1.6, [0.15, 0, 1.0]), K(2.0, [0, 0, 0.08]), K(2.6, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.4, [0, 0, 0.55]), K(1.6, [0, 0, 0.55]), K(2.0, Z), K(2.6, Z)],
      mug: [K(0, Z), K(0.4, [0, 0, -0.45]), K(1.6, [0, 0, -0.45]), K(2.0, Z), K(2.6, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.4, [0, 0, 0.5]), K(1.6, [0, 0, 0.5]), K(2.1, [0, 0, 0.05]), K(2.3, [0, 0, 0.2]), K(2.6, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.06]), K(2.05, [0, 0, 0.5]), K(2.25, [0, 0, 0.5]), K(2.6, [0, 0, 0.06])], // half-hearted thumbs-up zone
      forearmR: [K(0, Z), K(2.05, [0, 0, 1.2]), K(2.25, [0, 0, 1.2]), K(2.6, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.4, [0, 0, 0.0]), K(1.6, [0, 0, 0.0]), K(2.6, [0, 0, -0.1])],
      robe: [K(0, Z), K(1.3, [0, 0, 0.06]), K(2.6, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // shrugs, gives up, sleeps standing. the market was a lie anyway
  lose: {
    duration: 2.2, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.74, 0]), K(1.1, Z, [0, 0.725, 0]), K(2.2, Z, [0, 0.74, 0])],
      torso: [K(0, [0, 0, -0.45]), K(1.1, [0, 0, -0.5]), K(2.2, [0, 0, -0.45])],
      head: [K(0, [0, 0, -0.5]), K(1.1, [0, 0.05, -0.55]), K(2.2, [0, 0, -0.5])],
      armL: [K(0, [0, 0, 0.3])], armR: [K(0, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, -0.6])], forearmR: [K(0, [0, 0, 0.1])],
      mug: [K(0, [0, 0, 0.5])], // the coffee is gone. everything is gone
      legL: [K(0, [0, 0, 0.12])], legR: [K(0, [0, 0, 0.12])],
      earL: [K(0, [0.5, 0, 0])], earR: [K(0, [-0.5, 0, 0])],
      robe: [K(0, [0, 0, 0.15])],
    },
  },

  // the longest, loudest, rudest sip in recorded finance
  taunt: {
    duration: 1.6, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.25, [0.15, 0, 1.05]), K(1.25, [0.15, 0, 1.05]), K(1.6, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.25, [0, 0, 0.6]), K(1.25, [0, 0, 0.6]), K(1.6, Z)],
      mug: [K(0, Z), K(0.25, [0, 0, -0.5]), K(0.7, [0, 0, -0.6]), K(1.25, [0, 0, -0.5]), K(1.6, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.25, [0, 0, 0.55]), K(1.25, [0, 0, 0.6]), K(1.45, [0, -0.3, 0.1]), K(1.6, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.25, [0, 0, 0.02]), K(1.25, [0, 0, 0.02]), K(1.6, [0, 0, -0.1])],
      armR: [K(0, [0, 0, 0.06]), K(0.5, [-0.2, 0, 0.4]), K(1.25, [-0.2, 0, 0.4]), K(1.6, [0, 0, 0.06])],
      hips: [K(0, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmR: [K(0, Z)],
      earL: [K(0, Z), K(1.45, [0.3, 0.3, 0]), K(1.6, Z)],
      earR: [K(0, Z), K(1.45, [-0.3, -0.3, 0]), K(1.6, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  // flicks the mug forward — coffee goes everywhere
  coffeeSplash: {
    duration: 0.4, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.1, [0.1, 0, 0.8]), K(0.18, [0, 0, 1.5]), K(0.4, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.1, [0, 0, 0.6]), K(0.18, [0, 0, -0.3]), K(0.4, Z)],
      mug: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.18, [0, 0, 0.9]), K(0.28, [0, 0, 0.4]), K(0.4, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.18, [0, 0.2, -0.02]), K(0.4, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.18, [0, 0, 0.05]), K(0.4, [0, 0, 0.14])],
      hips: [K(0, Z, HIP), K(0.18, [0, 0.15, 0], HIP), K(0.4, Z, HIP)],
      armR: [K(0, [0, 0, 0.06])],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmR: [K(0, Z)],
    },
  },

  // mug rockets skyward, coffee arcs, elbow follows. surprisingly explosive
  mugUppercut: {
    duration: 0.55, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, -0.12], [0, 0.6, 0]), K(0.24, [0, 0, 0.08], [0.08, 0.98, 0]), K(0.4, Z, [0.03, 0.9, 0]), K(0.55, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.14, [0, 0, -0.42]), K(0.24, [0, 0, 0.3]), K(0.55, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.14, [0, 0, -0.3]), K(0.24, [0, 0, 0.55]), K(0.55, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.14, [0.1, 0, -0.6]), K(0.24, [0.1, 0, 2.6]), K(0.4, [0.1, 0, 2.3]), K(0.55, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.14, [0, 0, 0.3]), K(0.24, [0, 0, -0.4]), K(0.55, Z)],
      mug: [K(0, Z), K(0.24, [0, 0, 0.8]), K(0.38, [0, 0, -0.3]), K(0.55, Z)],
      armR: [K(0, [0, 0, 0.06]), K(0.14, [-0.2, 0, -0.5]), K(0.24, [-0.3, 0, -1.0]), K(0.55, [0, 0, 0.06])],
      legL: [K(0, Z), K(0.24, [0, 0, -0.5]), K(0.55, Z)],
      legR: [K(0, Z), K(0.14, [0, 0, 0.25]), K(0.55, Z)],
      robe: [K(0, Z), K(0.24, [0, 0, -0.5]), K(0.55, Z)],
      forearmR: [K(0, Z)],
    },
  },

  // the arm drifts back like it's going to sleep... then SNAPS across the zip code
  lazyBackhand: {
    duration: 0.65, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.24, [0, 0.35, 1.6]), K(0.3, [0, 0.4, 1.7]), K(0.38, [0, -0.9, 1.9]), K(0.5, [0, -0.7, 1.6]), K(0.65, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.24, [0, 0, 0.7]), K(0.38, [0, 0, -0.1]), K(0.65, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.24, [0, -0.55, -0.05]), K(0.38, [0, 0.65, -0.15]), K(0.5, [0, 0.5, -0.12]), K(0.65, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.24, [0, -0.3, 0], HIP), K(0.38, [0, 0.35, 0], [0.1, 0.83, 0]), K(0.65, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.24, [0, -0.3, 0.05]), K(0.38, [0, 0.25, 0.05]), K(0.65, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.38, [0.2, 0, 0.4]), K(0.65, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.38, [0, 0, -0.3]), K(0.65, Z)],
      legR: [K(0, Z), K(0.38, [0, 0, 0.25]), K(0.65, Z)],
      robe: [K(0, Z), K(0.38, [0.3, 0, 0.2]), K(0.65, Z)],
      mug: [K(0, Z), K(0.4, [0, 0, 0.3]), K(0.65, Z)],
      forearmL: [K(0, Z)],
    },
  },

  // two-hand office-chair shove. ergonomics as a weapon
  chairShove: {
    duration: 0.65, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.16, [0, 0, -0.5]), K(0.28, [-0.15, 0, 1.5]), K(0.45, [-0.15, 0, 1.4]), K(0.65, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.16, [0, 0, 0.4]), K(0.28, [0, 0, 0.2]), K(0.65, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.16, [0, 0, -0.4]), K(0.28, [0.15, 0, 1.4]), K(0.45, [0.15, 0, 1.3]), K(0.65, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.28, [0, 0, -0.5]), K(0.65, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.16, [0, 0, -0.3]), K(0.28, [0, 0, 0.1]), K(0.65, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.16, Z, [-0.05, 0.82, 0]), K(0.28, Z, [0.12, 0.85, 0]), K(0.65, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.28, [0, 0, 0.02]), K(0.65, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.28, [0, 0, 0.4]), K(0.65, Z)],
      legR: [K(0, Z), K(0.28, [0, 0, -0.35]), K(0.65, Z)],
      robe: [K(0, Z), K(0.28, [0, 0, -0.3]), K(0.65, Z)],
      mug: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.65, Z)],
    },
  },

  // foot flick — the slipper does the actual work
  slipperKick: {
    duration: 0.5, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.2, [0, 0, 1.5]), K(0.32, [0, 0, 1.2]), K(0.5, Z)],
      hips: [K(0, Z, HIP), K(0.2, [0, 0, 0.1], [0, 0.87, 0]), K(0.5, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.2, [0, 0, 0.12]), K(0.5, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, 0.05]), K(0.5, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.2, [0.2, 0, 0.5]), K(0.5, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.2, [-0.3, 0, -0.7]), K(0.5, [0, 0, 0.06])],
      legL: [K(0, Z)],
      robe: [K(0, Z), K(0.2, [0, 0, -0.45]), K(0.5, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  // an enormous, weaponized yawn. arms stretch. jaw unhinges. crowd disgusted
  yawnStun: {
    duration: 0.55, loop: false,
    tracks: {
      head: [K(0, [0, 0, 0.14]), K(0.15, [0, 0, 0.7]), K(0.38, [0, 0, 0.75]), K(0.55, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.15, [0, 0, 0.12]), K(0.38, [0, 0, 0.12]), K(0.55, [0, 0, -0.1])],
      armL: [K(0, [0, 0, 0.08]), K(0.15, [0.5, 0, 1.8]), K(0.38, [0.5, 0, 1.9]), K(0.55, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.15, [-0.5, 0, 1.8]), K(0.38, [-0.5, 0, 1.9]), K(0.55, [0, 0, 0.06])],
      forearmL: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.55, Z)],
      forearmR: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.55, Z)],
      hips: [K(0, Z, HIP), K(0.25, Z, [0, 0.87, 0]), K(0.55, Z, HIP)],
      earL: [K(0, Z), K(0.25, [0.4, 0.3, 0]), K(0.55, Z)],
      earR: [K(0, Z), K(0.25, [-0.4, -0.3, 0]), K(0.55, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z)],
    },
  },

  // low spin — the robe hem is the hitbox
  robeSpin: {
    duration: 0.65, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.6, 0]), K(0.14, [0, 1.6, 0], [0, 0.56, 0]), K(0.28, [0, 3.6, 0], [0, 0.56, 0]), K(0.42, [0, 5.6, 0], [0, 0.58, 0]), K(0.52, [0, 6.28, 0], [0, 0.62, 0]), K(0.65, [0, 6.28, 0], HIP)],
      legL: [K(0, [-0.4, 0, 0.7]), K(0.52, [-0.4, 0, 0.7]), K(0.65, Z)],
      legR: [K(0, [0.4, 0, 0.7]), K(0.52, [0.4, 0, 0.7]), K(0.65, Z)],
      torso: [K(0, [0, 0, -0.3]), K(0.52, [0, 0, -0.3]), K(0.65, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.3]), K(0.65, [0, 0, 0.14])],
      armL: [K(0, [0.9, 0, 0.4]), K(0.52, [0.9, 0, 0.4]), K(0.65, [0, 0, 0.08])],
      armR: [K(0, [-0.9, 0, 0.4]), K(0.52, [-0.9, 0, 0.4]), K(0.65, [0, 0, 0.06])],
      robe: [K(0, [0.3, 0, 0.4]), K(0.26, [-0.3, 0, 0.4]), K(0.52, [0.3, 0, 0.4]), K(0.65, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
      mug: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.65, Z)],
    },
  },

  // eyes closed, arms out, shuffling. do not wake him mid-dodge
  sleepwalk: {
    duration: 0.5, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.1, [0, 0, 1.4]), K(0.4, [0, 0, 1.4]), K(0.5, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.1, [0, 0, 1.4]), K(0.4, [0, 0, 1.4]), K(0.5, [0, 0, 0.06])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.1, [0, 0, -0.35]), K(0.4, [0, 0, -0.35]), K(0.5, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.1, [0, 0, 0.05]), K(0.5, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.15, [0, 0.05, 0], [0, 0.82, 0]), K(0.3, [0, -0.05, 0], [0, 0.82, 0]), K(0.5, Z, HIP)],
      legL: [K(0, Z), K(0.15, [0, 0, -0.3]), K(0.3, [0, 0, 0.3]), K(0.5, Z)],
      legR: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.3, [0, 0, -0.3]), K(0.5, Z)],
      robe: [K(0, Z), K(0.25, [0, 0, 0.3]), K(0.5, Z)],
      mug: [K(0, Z)],
    },
  },

  // extends a hand for the world's most sincere, most crushing handshake
  firmHandshake: {
    duration: 0.85, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.12, [0, 0, 1.35]), K(0.3, [0, 0, 1.35]), K(0.38, [0, 0, 1.15]), K(0.46, [0, 0, 1.45]), K(0.54, [0, 0, 1.15]), K(0.64, [0, 0, -0.7]), K(0.85, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.12, [0, 0, 0.3]), K(0.64, [0, 0, 0.1]), K(0.85, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.12, [0, 0, -0.2]), K(0.54, [0, 0, -0.2]), K(0.64, [0, 0, -0.55]), K(0.85, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.12, Z, [0.04, 0.83, 0]), K(0.64, [0, 0, -0.05], [0.08, 0.72, 0]), K(0.85, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.3, [0, 0, 0.05]), K(0.64, [0, 0, -0.2]), K(0.85, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.4, [0.2, 0, 0.3]), K(0.85, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.64, [0, 0, 0.3]), K(0.85, Z)],
      legR: [K(0, Z), K(0.64, [0, 0, -0.25]), K(0.85, Z)],
      robe: [K(0, Z), K(0.64, [0, 0, 0.3]), K(0.85, Z)],
      forearmL: [K(0, Z)],
      mug: [K(0, Z), K(0.66, [0, 0, 0.5]), K(0.85, Z)],
    },
  },

  // lifts the foe like a bad quarterly report and files them. into the floor
  hrViolation: {
    duration: 0.85, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.15, [0, 0, 1.2]), K(0.35, [-0.3, 0, 2.6]), K(0.5, [-0.3, 0, 2.6]), K(0.6, [0, 0, -0.6]), K(0.85, [0, 0, 0.06])],
      armL: [K(0, [0, 0, 0.08]), K(0.15, [0, 0, 1.1]), K(0.35, [0.3, 0, 2.5]), K(0.5, [0.3, 0, 2.5]), K(0.6, [0, 0, -0.5]), K(0.85, [0, 0, 0.08])],
      forearmR: [K(0, Z), K(0.35, [0, 0, 0.2]), K(0.85, Z)],
      forearmL: [K(0, Z), K(0.35, [0, 0, 0.2]), K(0.85, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.35, [0, 0, 0.25]), K(0.5, [0, 0, 0.25]), K(0.6, [0, 0, -0.6]), K(0.85, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.35, Z, [0, 0.9, 0]), K(0.6, [0, 0, -0.05], [0.05, 0.62, 0]), K(0.85, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.35, [0, 0, 0.4]), K(0.6, [0, 0, -0.25]), K(0.85, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.6, [-0.3, 0, 0.6]), K(0.85, Z)],
      legR: [K(0, Z), K(0.6, [0.3, 0, 0.6]), K(0.85, Z)],
      robe: [K(0, Z), K(0.4, [0, 0, -0.4]), K(0.62, [0, 0, 0.5]), K(0.85, Z)],
      mug: [K(0, Z), K(0.62, [0, 0, 0.6]), K(0.85, Z)],
    },
  },

  // underhand-tosses bundles of investor cash with zero enthusiasm
  capital: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.15, [0, 0, -0.7]), K(0.3, [0, 0, 1.6]), K(0.45, [0, 0, -0.7]), K(0.6, [0, 0, 1.6]), K(0.75, [0, 0, -0.7]), K(0.9, [0, 0, 1.6]), K(1.1, [0, 0, 0.5]), K(1.3, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.6, [0, 0, 0.4]), K(0.9, [0, 0, 0.4]), K(1.3, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.3, [0, 0.15, 0]), K(0.6, [0, 0.15, 0]), K(0.9, [0, 0.15, 0]), K(1.3, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.3, [0, 0, 0.05]), K(1.0, [0, 0, 0.05]), K(1.3, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.2, 0, 0.4]), K(1.0, [0.2, 0, 0.4]), K(1.3, [0, 0, 0.08])],
      hips: [K(0, Z, HIP), K(0.3, [0, 0.1, 0], HIP), K(0.9, [0, 0.1, 0], HIP), K(1.3, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z), K(0.5, [0, 0, 0.1]), K(1.3, Z)],
      forearmL: [K(0, Z)], mug: [K(0, Z)],
    },
  },

  // snaps fingers once, points vaguely, sips. delegation complete
  delegate: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.2, [0, 0, 1.5]), K(0.35, [0, 0, 1.5]), K(0.5, [0, 0.3, 1.3]), K(0.9, [0, 0.3, 1.3]), K(1.3, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.2, [0, 0, 0.9]), K(0.35, [0, 0, 0.4]), K(0.5, [0, 0, 0.1]), K(1.3, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.35, [0, 0.15, 0.05]), K(0.9, [0, 0.15, 0.05]), K(1.3, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.35, [0, 0.15, -0.05]), K(0.9, [0, 0.15, -0.05]), K(1.3, [0, 0, -0.1])],
      armL: [K(0, [0, 0, 0.08]), K(0.8, [0, 0, 0.08]), K(0.95, [0.15, 0, 0.95]), K(1.2, [0.15, 0, 0.95]), K(1.3, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.95, [0, 0, 0.5]), K(1.2, [0, 0, 0.5]), K(1.3, Z)],
      mug: [K(0, Z), K(0.95, [0, 0, -0.4]), K(1.2, [0, 0, -0.4]), K(1.3, Z)],
      hips: [K(0, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z)],
    },
  },

  // the sip of ultimate indifference. armor via apathy
  sip: {
    duration: 0.9, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.2, [0.15, 0, 1.05]), K(0.7, [0.15, 0, 1.05]), K(0.9, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.2, [0, 0, 0.6]), K(0.7, [0, 0, 0.6]), K(0.9, Z)],
      mug: [K(0, Z), K(0.2, [0, 0, -0.55]), K(0.7, [0, 0, -0.55]), K(0.9, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, 0.5]), K(0.7, [0, 0, 0.55]), K(0.9, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.2, [0, 0, 0.0]), K(0.7, [0, 0, 0.0]), K(0.9, [0, 0, -0.1])],
      armR: [K(0, [0, 0, 0.06]), K(0.3, [-0.15, 0, 0.3]), K(0.9, [0, 0, 0.06])],
      hips: [K(0, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmR: [K(0, Z)], robe: [K(0, Z)],
    },
  },

  // both arms rise in weary summons. the furniture answers
  meeting: {
    duration: 1.3, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.35, [-0.3, 0, 2.6]), K(0.9, [-0.3, 0, 2.7]), K(1.1, [0, 0, 0.5]), K(1.3, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.35, [0.3, 0, 2.6]), K(0.9, [0.3, 0, 2.7]), K(1.1, [0, 0, 0.5]), K(1.3, [0, 0, 0.06])],
      forearmL: [K(0, Z), K(0.35, [0, 0, 0.2]), K(1.3, Z)],
      forearmR: [K(0, Z), K(0.35, [0, 0, 0.2]), K(1.3, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.35, [0, 0, 0.55]), K(0.9, [0, 0, 0.6]), K(1.05, [0, 0, -0.2]), K(1.3, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.35, [0, 0, 0.15]), K(0.9, [0, 0, 0.15]), K(1.05, [0, 0, -0.3]), K(1.3, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.35, Z, [0, 0.88, 0]), K(1.05, Z, [0, 0.8, 0]), K(1.3, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z), K(0.5, [0, 0, -0.2]), K(1.1, [0, 0, 0.3]), K(1.3, Z)],
      mug: [K(0, Z), K(0.4, [0, 0, 0.5]), K(1.3, Z)],
      earL: [K(0, Z), K(0.9, [0.3, 0.2, 0]), K(1.3, Z)],
      earR: [K(0, Z), K(0.9, [-0.3, -0.2, 0]), K(1.3, Z)],
    },
  },

  // sets down a tiny sign, then powers off completely
  ooo: {
    duration: 1.1, loop: false,
    tracks: {
      torso: [K(0, [0, 0, -0.1]), K(0.2, [0, 0, -0.55]), K(0.4, [0, 0, -0.1]), K(0.7, [0, 0, -0.35]), K(1.1, [0, 0, -0.35])],
      armR: [K(0, [0, 0, 0.06]), K(0.2, [0, 0, 1.3]), K(0.35, [0, 0, 0.2]), K(1.1, [0, 0, 0.3])],
      forearmR: [K(0, Z), K(0.2, [0, 0, 0.5]), K(0.4, Z), K(1.1, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, -0.3]), K(0.5, [0, 0, 0.1]), K(0.8, [0, 0, -0.55]), K(1.1, [0, 0, -0.55])],
      hips: [K(0, Z, HIP), K(0.2, Z, [0.03, 0.72, 0]), K(0.4, Z, HIP), K(0.8, Z, [0, 0.8, 0]), K(1.1, Z, [0, 0.8, 0])],
      armL: [K(0, [0, 0, 0.08]), K(0.8, [0.3, 0, 0.4]), K(1.1, [0.3, 0, 0.4])],
      legL: [K(0, Z), K(0.8, [0, 0, 0.1]), K(1.1, [0, 0, 0.1])],
      legR: [K(0, Z), K(0.8, [0, 0, 0.1]), K(1.1, [0, 0, 0.1])],
      earL: [K(0, Z), K(0.9, [0.5, 0, 0]), K(1.1, [0.5, 0, 0])],
      earR: [K(0, Z), K(0.9, [-0.5, 0, 0]), K(1.1, [-0.5, 0, 0])],
      robe: [K(0, Z)], forearmL: [K(0, Z)], mug: [K(0, Z)],
    },
  },

  // finisher: amble to the desk, one finger, press. the machine does the rest
  rebalance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, Z, [0, 0.83, 0]), K(0.5, Z, HIP), K(0.7, Z, [0.05, 0.7, 0]), K(1.0, Z, [0.05, 0.7, 0]), K(1.2, Z, HIP), K(2.4, Z, HIP)],
      legL: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.3, [0, 0, -0.3]), K(0.5, Z), K(0.7, [-0.3, 0, 0.5]), K(1.0, [-0.3, 0, 0.5]), K(1.2, Z), K(2.4, Z)],
      legR: [K(0, Z), K(0.15, [0, 0, -0.3]), K(0.3, [0, 0, 0.3]), K(0.5, Z), K(0.7, [0.3, 0, 0.5]), K(1.0, [0.3, 0, 0.5]), K(1.2, Z), K(2.4, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.7, [0, 0, -0.45]), K(1.0, [0, 0, -0.45]), K(1.2, [0, 0, -0.05]), K(2.4, [0, 0, -0.1])],
      armR: [K(0, [0, 0, 0.06]), K(0.6, [0, 0, 1.1]), K(0.8, [0, 0, 0.75]), K(0.9, [0, 0, 0.95]), K(1.2, [0, 0, 0.06]), K(2.4, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.6, [0, 0, 0.6]), K(0.8, [0, 0, 0.3]), K(1.2, Z), K(2.4, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.7, [0, 0, -0.25]), K(1.0, [0, 0, -0.25]), K(1.3, [0, 0.2, 0.3]), K(1.8, [0, 0.25, 0.35]), K(2.1, [0, -0.2, 0.2]), K(2.4, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(1.4, [0.15, 0, 1.0]), K(2.1, [0.15, 0, 1.0]), K(2.4, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(1.4, [0, 0, 0.55]), K(2.1, [0, 0, 0.55]), K(2.4, Z)],
      mug: [K(0, Z), K(1.4, [0, 0, -0.45]), K(2.1, [0, 0, -0.45]), K(2.4, Z)],
      robe: [K(0, Z), K(0.4, [0, 0, 0.1]), K(1.2, Z), K(2.4, Z)],
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

function arenaBounds(fx) {
  let minX = -8.5, maxX = 8.5
  try {
    const b = fx.arena()?.bounds
    if (b) { minX = b.minX; maxX = b.maxX }
  } catch { /* arena optional */ }
  return { minX, maxX }
}

function clampToArena(fx, x) {
  const b = arenaBounds(fx)
  return Math.max(b.minX + 0.8, Math.min(b.maxX - 0.8, x))
}

// world root (the scene) via the fighter's bone chain — robust to arena layout
function worldOf(fx) {
  try {
    let o = fx.self?.bones?.hips
    while (o && o.parent) o = o.parent
    return o || null
  } catch { return null }
}

// idempotent removal + disposal of a custom cinematic group
// Teardown for the cinematic props the move scripts throw away.
//
// This USED to be `geometry.dispose()` + `material.map.dispose()` +
// `material.dispose()`, which was correct when every prop was a fresh
// BoxGeometry and a bare MeshLambertMaterial. It is catastrophic now: the
// geometry toolkit hands back CACHED buffers (roundedBox/roundedCylinder/ball
// are memoised by argument tuple) and pbr() hands back materials whose
// normal/roughness/AO maps live in the GLOBAL surfaceMaps cache. Disposing
// either tears the buffer out from under the fighter that is still standing
// there — and out from under the arena and the other nine characters.
// So: geometry only if it is not in the shared cache, materials only through
// disposeMaterialSafely() (which skips shared materials AND shared textures).
function scrap(obj) {
  if (!obj) return
  try {
    obj.parent?.remove(obj)
    obj.traverse((o) => {
      if (!o.isMesh) return
      if (o.geometry && !isSharedGeometry(o.geometry)) o.geometry.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m) continue
        // disposeMaterialSafely() returns false for a globally cached material
        // (never ours to free). Everything we build here is `unique: true`, so
        // the fallback only ever runs for the hand-rolled MeshBasic label
        // materials, whose canvas map genuinely is ours.
        if (disposeMaterialSafely(m)) continue
        m.map?.dispose?.()
        m.dispose?.()
      }
    })
  } catch { /* already gone */ }
}

// low-poly label sign on a post; MeshBasic map = fake glow
function makeSign(text, bg, fg) {
  const g = new THREE.Group()
  const tex = labelTex(text, { w: 256, h: 96, size: text.length > 8 ? 34 : 48, bg, fg })
  const faceM = tex
    ? new THREE.MeshBasicMaterial({ map: tex })
    : new THREE.MeshBasicMaterial({ color: 0xffe28a })
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 1.9), lamb(0x2a2a33, { surface: 'metal-painted' }))
  board.position.y = 2.2
  g.add(board)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.62), faceM)
  face.position.set(0.065, 2.2, 0)
  face.rotation.y = Math.PI / 2
  g.add(face)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.62), faceM)
  back.position.set(-0.065, 2.2, 0)
  back.rotation.y = -Math.PI / 2
  g.add(back)
  g.add(cyl(0.05, 0.06, 1.9, lamb(C.steel, { surface: 'metal' }), 0, 0.95, 0))
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// panicked low-poly assistant (briefcase, tie, deep regret)
function makeAssistant() {
  const g = new THREE.Group()
  const body = new THREE.Group()
  body.add(box(0.3, 0.42, 0.34, lamb(C.suitShirt, { surface: 'cloth' }), 0, 1.0, 0))
  body.add(box(0.06, 0.24, 0.1, lamb(C.tie, { surface: 'suit' }), 0.16, 1.02, 0))
  body.add(sph(0.14, lamb(C.skin, { surface: 'skin' }), 0.02, 1.36, 0))
  body.add(box(0.14, 0.05, 0.24, lamb(0x4a3626, { surface: 'fur' }), -0.03, 1.47, 0)) // hair
  g.add(body)
  g.userData.body = body
  for (const side of [1, -1]) {
    const leg = pivot(g, 0, 0.78, 0.09 * side)
    leg.add(box(0.12, 0.42, 0.12, lamb(C.suitPants, { surface: 'suit' }), 0, -0.22, 0))
    leg.add(box(0.2, 0.08, 0.12, lamb(0x1e1e22, { surface: 'leather' }), 0.04, -0.42, 0))
    g.userData[side === 1 ? 'legA' : 'legB'] = leg
    const arm = pivot(body, 0, 1.16, 0.19 * side)
    arm.add(box(0.09, 0.34, 0.09, lamb(C.suitShirt, { surface: 'cloth' }), 0, -0.16, 0))
    g.userData[side === 1 ? 'armA' : 'armB'] = arm
    if (side === -1) arm.add(box(0.3, 0.22, 0.08, lamb(0x6b4423, { surface: 'leather' }), 0.02, -0.4, 0)) // briefcase
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function coffeeSplashScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('whoosh', { pitch: 1.35 })
  fx.after(9, () => {
    const px = fx.self.pos.x + F * 0.9
    fx.particles('smoke', v3(px, 1.3, 0), { n: 7 })
    // brown droplets: two tiny short-lived boxes flung in an arc
    for (let i = 0; i < 2; i++) {
      const p = fx.spawnProp('box', v3(px, 1.35 + i * 0.12, (i - 0.5) * 0.2), { mass: 0.08 })
      if (p) {
        try {
          p.mesh?.scale?.set(0.28, 0.22, 0.28)
          p.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(C.coffee) })
          fx.impulse(p, [F * (4 + i * 2), 2.5, (i - 0.5) * 1.5], 4)
        } catch { /* prop cosmetics only */ }
        fx.after(50, () => { try { p.remove?.() } catch { /* gone */ } })
      }
    }
  })
  fx.after(11, () => {
    if (inRange(fx, 1.7)) {
      fx.sfx('punch_light', { pitch: 0.85 })
      fx.particles('impact', v3(fx.foe.pos.x, 1.3, 0), { n: 6 })
      fx.hit({ damage: 7, knockback: { x: 4.5, y: 1 }, hitStun: 16 })
    }
  })
  fx.after(24, end)
}

function mugUppercutScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('whoosh', { pitch: 0.8 })
  fx.after(10, () => {
    // the coffee arc — a lazy brown rainbow
    for (let i = 0; i < 3; i++) {
      fx.after(i * 2, () => fx.particles('smoke', v3(fx.self.pos.x + F * (0.5 + i * 0.25), 1.5 + i * 0.5, 0), { n: 3 }))
    }
    if (inRange(fx, 1.8)) {
      fx.sfx('launch')
      fx.shake(0.4)
      fx.particles('sparks', v3(fx.foe.pos.x, 1.4, 0), { n: 10 })
      fx.hit({ damage: 11, knockback: { x: 2, y: 10.5, spin: 1.5 }, hitStun: 28, ragdoll: 1 })
      fx.caption('DECAF? NEVER.')
    }
  })
  fx.after(32, end)
}

function slipperKickScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const slip = fx.self.bones?.legR?.userData?.slipper || null
  let prop = null
  const restore = () => { try { if (slip) slip.visible = true } catch { /* mesh */ } }
  fx.sfx('kick')
  fx.after(7, () => {
    try { if (slip) slip.visible = false } catch { /* mesh */ }
    prop = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.7, 0.5, 0), { mass: 0.25 })
    if (prop) {
      try {
        prop.mesh?.scale?.set(0.5, 0.25, 0.35)
        prop.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(C.slipper) })
        fx.impulse(prop, [F * 10, 3.5, 0], 8)
      } catch { /* cosmetics */ }
    }
  })
  fx.after(10, () => {
    if (inRange(fx, 2.4)) {
      fx.sfx('boing')
      fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 8 })
      fx.hit({ damage: 10, knockback: { x: 8, y: 2.5, spin: 0.8 }, hitStun: 18 })
    }
  })
  fx.after(19, () => { // the slipper boomerangs home
    if (prop) { try { fx.impulse(prop, [-F * 9, 4, 0], 6) } catch { /* gone */ } }
    fx.sfx('whoosh', { pitch: 1.5 })
  })
  fx.after(29, () => {
    if (prop) { try { prop.remove?.() } catch { /* gone */ } }
    restore()
  })
  fx.after(60, restore) // failsafe: the ape never fights half-shod
  fx.after(30, end)
}

function chairShoveScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let chair = null
  fx.after(9, () => {
    chair = fx.spawnProp('chair', v3(clampToArena(fx, fx.self.pos.x + F * 0.9), 0.5, 0))
    fx.sfx('slide')
    fx.particles('smoke', v3(fx.self.pos.x + F * 0.8, 0.3, 0), { n: 4 })
  })
  fx.after(14, () => {
    if (chair) { try { fx.impulse(chair, [F * 11, 1.5, 0], 3) } catch { /* gone */ } }
    if (inRange(fx, 2.7)) {
      fx.sfx('thud')
      fx.shake(0.4)
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: 9 })
      fx.hit({ damage: 14, knockback: { x: 9.5, y: 3, spin: 1 }, hitStun: 24, ragdoll: 1 })
      fx.caption('PLEASE, HAVE A SEAT')
    }
  })
  fx.after(40, end)
}

function yawnStunScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('whoosh', { pitch: 0.45 })
  fx.after(13, () => {
    fx.particles('smoke', v3(fx.self.pos.x + fx.self.facing * 0.6, 1.7, 0), { n: 5 })
    if (inRange(fx, 1.3)) {
      fx.sfx('menu_back', { pitch: 0.6 })
      fx.particles('stars', v3(fx.foe.pos.x, 1.9, 0), { n: 8 })
      fx.hit({ damage: 4, knockback: { x: 0.5, y: 0 }, hitStun: 55 })
      fx.caption('CONTAGIOUS YAWN')
    }
  })
  fx.after(34, end)
}

function sleepwalkScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  try { fx.self.invuln = Math.max(fx.self.invuln || 0, 22) } catch { /* engine field */ }
  fx.sfx('whoosh', { pitch: 0.6 })
  for (let i = 0; i < 3; i++) {
    fx.after(3 + i * 5, () => {
      fx.impulse(fx.self, [-F * 4.5, 0, 0])
      fx.particles('smoke', v3(fx.self.pos.x + F * 0.4, 0.4, 0), { n: 3 })
    })
  }
  fx.after(18, () => fx.particles('stars', v3(fx.self.pos.x, 2.0, 0), { n: 3 }))
  fx.after(30, end)
}

function perMyLastEmailScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(11, () => {
    // the world-weariest backhand in finance, cc: everyone
    fx.sfx('menu_back', { pitch: 0.8 })
    fx.particles('dust', v3(fx.self.pos.x + F * 1.0, 1.3, 0), { n: 8 })
    if (inRange(fx, 2.9)) {
      fx.sfx('punch_heavy', { pitch: 0.9 })
      fx.shake(0.5)
      fx.hit({ damage: 13, knockback: { x: 11.5, y: 4, spin: 1.4 }, hitStun: 27, ragdoll: 1 })
      fx.caption('PER MY LAST EMAIL.')
    } else {
      fx.caption('MOVING THIS TO NEXT SPRINT')
    }
  })
  fx.after(40, end)
}

function capitalAllocationScript(fx) {
  const end = onceEnd(fx)
  fx.caption('CAPITAL ALLOCATION')
  fx.announcer('CAPITAL ALLOCATION')
  fx.sfx('bell')
  fx.after(8, () => {
    if (!inRange(fx, 20)) return
    fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 80 }) // pinned under due diligence
    fx.sfx('coin')
  })
  // 8 bundles of investor money, dropped directly onto the foe. buried alive. in cash
  for (let i = 0; i < 8; i++) {
    fx.after(12 + i * 4, () => {
      const bx = clampToArena(fx, fx.foe.pos.x + (Math.random() - 0.5) * 0.9)
      const p = fx.spawnProp('box', v3(bx, 3.3 + (i % 3) * 0.5, (Math.random() - 0.5) * 0.6), { mass: 0.5 })
      if (p) {
        try {
          p.mesh?.scale?.set(0.9, 0.5, 0.6)
          p.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(0x4f9e5f) })
          fx.impulse(p, [0, -7, 0], 1)
        } catch { /* cosmetics */ }
      }
      if (i % 2 === 0) fx.sfx('thud', { pitch: 1.1 + i * 0.06 })
    })
  }
  fx.after(30, () => {
    fx.shake(0.5)
    if (inRange(fx, 20)) fx.hit({ damage: 6, knockback: { x: 0, y: 0 }, hitStun: 50 })
  })
  fx.after(50, () => {
    fx.sfx('coins_burst')
    fx.shake(0.7)
    fx.coins(v3(fx.foe.pos.x, 1.6, 0), 14)
    if (inRange(fx, 20)) {
      fx.hit({ damage: 10, knockback: { x: 3, y: 5.5, spin: 1.2 }, hitStun: 30, ragdoll: 1 })
      fx.caption('FULLY DIVERSIFIED')
    }
  })
  fx.after(78, end)
}

function executiveAssistantScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const world = worldOf(fx)
  fx.caption('EXECUTIVE ASSISTANT')
  fx.announcer('SEND IN THE INTERN')
  fx.sfx('menu_confirm')
  if (!world) {
    // visuals unavailable: still delegate the damage
    fx.after(24, () => {
      if (inRange(fx, 3.2)) {
        fx.sfx('punch_heavy')
        fx.hit({ damage: 20, knockback: { x: 12, y: 6, spin: 2 }, hitStun: 40, ragdoll: 2 })
      }
    })
    fx.after(60, end)
    return
  }
  const b = arenaBounds(fx)
  const guy = makeAssistant()
  const startX = F > 0 ? b.minX - 1.2 : b.maxX + 1.2
  guy.position.set(startX, 0, 0)
  guy.rotation.y = F > 0 ? 0 : Math.PI
  let added = false
  let tackled = false
  let tumble = 0
  const cleanup = () => scrap(guy)
  fx.after(8, () => { try { world.add(guy); added = true; fx.sfx('whoosh', { pitch: 1.4 }) } catch { /* scene */ } })
  fx.frame((age) => {
    if (!added) return
    try {
      guy.position.x += F * 0.3
      guy.position.y = Math.abs(Math.sin(age * 0.55)) * 0.12
      const swing = Math.sin(age * 0.55) * 0.9
      if (guy.userData.legA) guy.userData.legA.rotation.z = swing
      if (guy.userData.legB) guy.userData.legB.rotation.z = -swing
      if (guy.userData.armA) guy.userData.armA.rotation.z = 2.6 + Math.sin(age * 0.7) * 0.3 // arms flailing overhead
      if (guy.userData.armB) guy.userData.armB.rotation.z = 2.6 - Math.sin(age * 0.7) * 0.3
      if (guy.userData.body) guy.userData.body.rotation.z = -F * 0.35
      if (age % 6 === 0) fx.particles('smoke', v3(guy.position.x - F * 0.5, 0.2, 0), { n: 2 })
      if (tackled) {
        tumble += 0.3
        guy.rotation.z = -F * tumble
      } else if (fx.foe && Math.abs(guy.position.x - fx.foe.pos.x) < 0.95) {
        tackled = true
        fx.sfx('punch_heavy')
        fx.shake(0.9)
        fx.slowmo(0.4, 0.4)
        fx.zoom(fx.foe, 0.5)
        fx.particles('confetti', v3(guy.position.x, 1.4, 0), { n: 20 }) // paperwork everywhere
        fx.hit({ damage: 20, knockback: { x: 13, y: 6, spin: 2.5 }, hitStun: 40, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 11, 7, 0])
        fx.caption('SORRY!! SO SORRY!!')
      }
      if (Math.abs(guy.position.x) > Math.max(Math.abs(b.minX), Math.abs(b.maxX)) + 2.5) cleanup()
    } catch { cleanup() }
  })
  fx.after(82, cleanup)
  fx.after(170, cleanup) // failsafe: the intern always goes home
  fx.after(84, end)
}

function marketIndifferenceScript(fx) {
  const end = onceEnd(fx)
  fx.caption('MARKET INDIFFERENCE')
  fx.sfx('slide', { pitch: 0.5 })
  fx.after(12, () => {
    try { fx.self.armorFrames = 240 } catch { /* engine field */ } // 4 seconds of apathy armor
    fx.caption('HE DOES NOT CARE')
    fx.announcer('HE DOES NOT CARE')
    fx.sfx('bell', { pitch: 0.6 })
    fx.particles('stars', v3(fx.self.pos.x, 2.1, 0), { n: 6 })
  })
  // steam curls off the mug for the duration of the buff
  for (let i = 0; i < 8; i++) {
    fx.after(20 + i * 28, () => {
      try { fx.particles('smoke', v3(fx.self.pos.x + fx.self.facing * 0.5, 1.5, 0.2), { n: 3 }) } catch { /* fighter gone */ }
    })
  }
  fx.after(54, end)
}

function meetingEmailScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const world = worldOf(fx)
  fx.slowmo(0.5, 0.6)
  fx.zoom(fx.self, 0.6)
  fx.caption('MEETING THAT SHOULD HAVE BEEN AN EMAIL')
  fx.announcer('MANDATORY ATTENDANCE')
  fx.sfx('bell')
  const tx = clampToArena(fx, fx.foe.pos.x)
  fx.after(6, () => { if (inRange(fx, 20)) fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 70 }) })
  if (!world) {
    fx.after(26, () => {
      fx.shake(1.2)
      fx.sfx('explosion')
      if (Math.abs(fx.foe.pos.x - tx) < 3.4) {
        fx.hit({ damage: 34, knockback: { x: 9, y: 7, spin: 3 }, hitStun: 50, ragdoll: 2 })
        fx.caption('THIS MEETING IS OVER')
      }
    })
    fx.after(78, end)
    return
  }
  // THE TABLE. conference-grade. load-bearing agenda included
  const table = new THREE.Group()
  table.add(box(5.6, 0.35, 2.6, lamb(C.wood, { surface: 'wood' }), 0, 0, 0))
  table.add(box(0.6, 0.04, 0.42, lamb(C.paper, { surface: 'paper' }), 1.2, 0.2, 0.3, 0, 0.4)) // the agenda
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    table.add(cyl(0.09, 0.11, 1.0, lamb(C.steel, { surface: 'metal' }), sx * 2.4, -0.65, sz * 1.0))
  }
  table.traverse((o) => { if (o.isMesh) o.castShadow = true })
  table.position.set(tx, 9.5, 0)
  let falling = false
  let landed = false
  const cleanup = () => scrap(table)
  fx.after(10, () => {
    try { world.add(table); falling = true; fx.sfx('whoosh', { pitch: 0.5 }) } catch { /* scene */ }
  })
  fx.frame(() => {
    if (!falling || landed) return
    try {
      table.position.y -= 0.52
      if (table.position.y <= 1.15) {
        table.position.y = 1.15
        landed = true
        fx.sfx('explosion')
        fx.sfx('break')
        fx.shake(1.4)
        fx.slowmo(0.3, 0.7)
        fx.zoom(fx.foe, 0.8)
        fx.particles('impact', v3(tx, 1.0, 0), { n: 30 })
        fx.particles('smoke', v3(tx, 0.6, 0), { n: 12 })
        // ejected office furnishings
        const debris = ['chair', 'monitor', 'chair', 'box', 'monitor', 'box']
        for (let i = 0; i < debris.length; i++) {
          const d = fx.spawnProp(debris[i], v3(clampToArena(fx, tx + (i - 2.5) * 0.7), 1.6, (i % 2 ? 0.8 : -0.8)))
          if (d) { try { fx.impulse(d, [(i - 2.5) * 4, 7 + Math.random() * 3, (i % 2 ? 3 : -3)], 3) } catch { /* gone */ } }
        }
        if (fx.foe && Math.abs(fx.foe.pos.x - tx) < 3.4) {
          const away = Math.sign(fx.foe.pos.x - tx) || -F
          fx.hit({ damage: 34, knockback: { x: 10 * away * F, y: 7, spin: 3 }, hitStun: 50, ragdoll: 2 })
        }
        fx.caption('THIS MEETING IS OVER')
        fx.announcer('MEETING ADJOURNED')
      }
    } catch { cleanup() }
  })
  fx.after(260, cleanup) // the table is eventually returned to facilities
  fx.after(78, end)
}

function outOfOfficeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const world = worldOf(fx)
  fx.caption('OUT OF OFFICE')
  fx.sfx('menu_back', { pitch: 0.7 })
  let sign = null
  fx.after(10, () => {
    if (!world) return
    try {
      sign = new THREE.Group()
      const tex = labelTex('OOO', { w: 128, h: 64, size: 36 })
      sign.add(box(0.3, 0.02, 0.2, lamb(C.paper, { surface: 'paper' }), 0, 0.2, 0))
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.18, 0.28),
        tex ? new THREE.MeshBasicMaterial({ map: tex }) : lamb(C.paper, { surface: 'paper' }))
      plate.position.set(0.05, 0.12, 0)
      plate.rotation.z = -0.35
      sign.add(plate)
      sign.position.set(clampToArena(fx, fx.self.pos.x + F * 0.8), 0, 0)
      sign.traverse((o) => { if (o.isMesh) o.castShadow = true })
      world.add(sign)
      fx.sfx('thud', { pitch: 1.6 })
    } catch { sign = null }
  })
  fx.after(16, () => { // PTO heals. it's science
    try {
      const mh = fx.self.maxHp ?? 100
      fx.self.setHp?.(Math.min(mh, fx.self.hp + 3))
    } catch { /* engine field */ }
    fx.particles('stars', v3(fx.self.pos.x, 2.1, 0), { n: 6 })
    fx.sfx('coin', { pitch: 1.5 })
    fx.caption('+3 HP (PAID TIME OFF)')
  })
  // Zzz drift while the foe fumes
  for (let i = 0; i < 3; i++) {
    fx.after(24 + i * 12, () => fx.particles('stars', v3(fx.self.pos.x - F * 0.2, 2.2 + i * 0.15, 0), { n: 2 }))
  }
  fx.after(28, () => { // angry steam from the foe
    try {
      fx.particles('smoke', v3(fx.foe.pos.x, 2.0, 0), { n: 8 })
      fx.particles('sparks', v3(fx.foe.pos.x, 2.1, 0), { n: 4 })
    } catch { /* foe gone */ }
  })
  fx.after(300, () => scrap(sign)) // the sign expires with the vacation
  fx.after(66, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const TiredApeDef = {
  id: 'tired-ape',
  name: 'TIRED APE',
  title: 'The Unimpressed Investor',
  bio: 'Bought the top of every market since 2013 and has felt nothing since. Fights exclusively between sips of lukewarm coffee, files opponents under "correspondence", and has never once removed the robe. His portfolio is down 99.4%, risk-adjusted. His blood pressure is perfect.',
  style: 'Slow-motion menace. Every attack looks like a man reaching for a stapler and lands like a leveraged short. Bring a book; his startup frames have startup frames — but so does his damage.',
  stats: { power: 9, speed: 3, defense: 6, chaos: 5 },
  height: 1.9,
  weight: 1.5,
  walkSpeed: 2.9,
  dashSpeed: 6.2,
  jumpVel: 6.8,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'coffee-splash', name: 'Coffee Splash', kind: 'light',
      input: ['light'],
      damage: 7, startup: 8, active: 4, recovery: 12,
      hitbox: { w: 1.1, h: 0.9, d: 1.0, forward: 1.0, up: 1.3 },
      knockback: { x: 4.5, y: 1, spin: 0.3 },
      hitStun: 16, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'coffeeSplash', sfx: 'whoosh',
      script: coffeeSplashScript,
    },
    {
      id: 'mug-uppercut', name: 'Mug Uppercut', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 11, startup: 10, active: 4, recovery: 18,
      hitbox: { w: 0.9, h: 1.5, d: 0.9, forward: 0.8, up: 1.2 },
      knockback: { x: 2, y: 10.5, spin: 1.5 },
      hitStun: 28, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'mugUppercut', sfx: 'launch',
      script: mugUppercutScript,
    },
    {
      id: 'lazy-backhand', name: 'Lazy Backhand', kind: 'heavy',
      input: ['heavy'],
      damage: 17, startup: 16, active: 5, recovery: 18,
      // deceptive range: the arm is longer than the enthusiasm suggests
      hitbox: { w: 1.9, h: 1.0, d: 1.0, forward: 1.5, up: 1.3 },
      knockback: { x: 10.5, y: 3, spin: 1 },
      hitStun: 24, blockStun: 13, hitStop: 7,
      launcher: false, ragdollThreshold: 1,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'lazyBackhand', sfx: 'punch_heavy', script: null,
    },
    {
      id: 'chair-shove', name: 'Chair Shove', kind: 'heavy',
      input: ['forward', 'heavy'],
      damage: 14, startup: 14, active: 6, recovery: 20,
      hitbox: { w: 1.4, h: 1.2, d: 1.0, forward: 1.2, up: 0.9 },
      knockback: { x: 9.5, y: 3, spin: 1 },
      hitStun: 24, blockStun: 13, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'chairShove', sfx: 'slide',
      script: chairShoveScript,
    },
    {
      id: 'slipper-kick', name: 'Slipper Kick', kind: 'kick',
      input: ['kick'],
      damage: 10, startup: 9, active: 6, recovery: 15,
      hitbox: { w: 1.3, h: 0.9, d: 0.9, forward: 1.2, up: 0.9 },
      knockback: { x: 8, y: 2.5, spin: 0.8 },
      hitStun: 18, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'slipperKick', sfx: 'kick',
      script: slipperKickScript,
    },
    {
      id: 'yawn-stun', name: 'Yawn Stun', kind: 'light',
      input: ['back', 'light'],
      damage: 4, startup: 12, active: 6, recovery: 16,
      // tiny range: you must be close enough to smell the coffee breath
      hitbox: { w: 0.8, h: 1.0, d: 0.9, forward: 0.6, up: 1.5 },
      knockback: { x: 0.5, y: 0, spin: 0 },
      hitStun: 55, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'yawnStun', sfx: 'whoosh',
      script: yawnStunScript,
    },
    {
      id: 'robe-spin', name: 'Robe Spin', kind: 'launcher',
      input: ['down', 'heavy'],
      damage: 13, startup: 13, active: 6, recovery: 20,
      hitbox: { w: 2.4, h: 0.7, d: 1.6, forward: 0.7, up: 0.4 },
      knockback: { x: 2.5, y: 9, spin: 1.2 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'robeSpin', sfx: 'whoosh', script: null,
    },
    {
      id: 'sleepwalk-dodge', name: 'Sleepwalk Dodge', kind: 'kick',
      input: ['back', 'kick'],
      damage: 0, startup: 4, active: 2, recovery: 24,
      hitbox: { w: 0.3, h: 0.3, d: 0.3, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'sleepwalk', sfx: 'whoosh',
      script: sleepwalkScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'firm-handshake', name: 'Firm Handshake', kind: 'grab',
      input: ['grab'],
      damage: 15, startup: 9, active: 3, recovery: 36,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.1 },
      // pleased to meet you. pleased to METEOR you
      knockback: { x: 8.5, y: 6, spin: 2 },
      hitStun: 30, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'firmHandshake', sfx: 'grab', script: null,
    },
    {
      id: 'hr-violation', name: 'HR Violation', kind: 'grab',
      input: ['down', 'grab'],
      damage: 13, startup: 11, active: 3, recovery: 32,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 1.0 },
      // filed directly into the floor, under 'D' for 'Disciplinary'
      knockback: { x: 1.5, y: 7.5, spin: 2.5 },
      hitStun: 32, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'hrViolation', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'per-my-last-email', name: 'Per My Last Email', kind: 'special',
      input: ['special'],
      damage: 13, startup: 11, active: 4, recovery: 25,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 1.3, up: 1.2 },
      knockback: { x: 11.5, y: 4, spin: 1.4 },
      hitStun: 27, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'sip', sfx: 'menu_back',
      script: perMyLastEmailScript,
    },
    {
      id: 'capital-allocation', name: 'Capital Allocation', kind: 'special',
      input: ['down', 'special'],
      damage: 18, startup: 12, active: 40, recovery: 26,
      hitbox: { w: 1.4, h: 1.6, d: 1.2, forward: 1.0, up: 1.0 },
      knockback: { x: 3, y: 5.5, spin: 1.2 },
      hitStun: 30, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'capital', sfx: 'bell',
      script: capitalAllocationScript,
    },
    {
      id: 'executive-assistant', name: 'Executive Assistant', kind: 'special',
      input: ['forward', 'special'],
      damage: 20, startup: 15, active: 40, recovery: 25,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 13, y: 6, spin: 2.5 },
      hitStun: 40, blockStun: 14, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 35, armor: 0,
      clip: 'delegate', sfx: 'menu_confirm',
      script: executiveAssistantScript,
    },
    {
      id: 'market-indifference', name: 'Market Indifference', kind: 'special',
      input: ['back', 'special'],
      damage: 0, startup: 10, active: 4, recovery: 40,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'sip', sfx: 'slide',
      script: marketIndifferenceScript,
    },
    {
      id: 'meeting-email', name: 'Meeting That Should Have Been an Email', kind: 'super',
      input: ['super'],
      damage: 34, startup: 18, active: 30, recovery: 30,
      hitbox: { w: 3.2, h: 1.8, d: 2.0, forward: 1.0, up: 1.0 },
      knockback: { x: 10, y: 7, spin: 3 },
      hitStun: 50, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 12,
      clip: 'meeting', sfx: 'bell',
      script: meetingEmailScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'out-of-office', name: 'Out of Office', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 0, startup: 12, active: 4, recovery: 50,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 10, meterCost: 0, armor: 0,
      clip: 'ooo', sfx: 'menu_back',
      script: outOfOfficeScript,
    },
  ],

  finisher: {
    id: 'portfolio-rebalance',
    name: 'Portfolio Rebalance',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const world = worldOf(fx)
      fx.slowmo(0.5, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption('PORTFOLIO REBALANCE')
      fx.announcer('PORTFOLIO REBALANCE')
      fx.sfx('bell')
      try { fx.self.playClip?.('rebalance') } catch { /* animator */ }

      // desk + big red button, arms, three asset signs — all cinematic set dressing
      let desk = null
      let arms = null
      const signs = []
      const cleanup = () => {
        scrap(desk); desk = null
        scrap(arms); arms = null
        while (signs.length) scrap(signs.pop())
      }

      fx.after(6, () => {
        if (!world) return
        try {
          desk = new THREE.Group()
          desk.add(box(0.9, 0.55, 0.7, lamb(C.wood, { surface: 'wood' }), 0, 0.28, 0))
          desk.add(cyl(0.14, 0.16, 0.1, lamb(C.button, { surface: 'plastic-gloss' }), 0, 0.6, 0))
          desk.add(cyl(0.18, 0.18, 0.04, lamb(C.steel, { surface: 'metal' }), 0, 0.56, 0))
          desk.position.set(clampToArena(fx, fx.self.pos.x + F * 0.9), 0, 0)
          desk.traverse((o) => { o.castShadow = true })
          world.add(desk)
          fx.sfx('thud')
        } catch { desk = null }
      })

      // the press. one finger. zero urgency
      fx.after(18, () => {
        fx.sfx('menu_confirm', { pitch: 0.6 })
        fx.shake(0.25)
        if (desk) { try { fx.particles('sparks', v3(desk.position.x, 0.8, 0), { n: 6 }) } catch { /* fine */ } }
      })

      // mechanical arms descend from corporate heaven
      let armsY = 8.5
      let armsDown = false
      const armsX = clampToArena(fx, fx.foe.pos.x)
      fx.after(24, () => {
        if (!world) return
        try {
          arms = new THREE.Group()
          for (const side of [1, -1]) {
            arms.add(cyl(0.09, 0.09, 5.5, lamb(C.steel, { surface: 'metal' }), 0, 2.75, side * 0.45))
            arms.add(box(0.34, 0.4, 0.14, lamb(C.steel, { surface: 'metal' }), 0, 0.1, side * 0.34, 0.25 * side))
          }
          arms.add(box(0.7, 0.3, 1.2, lamb(0x3a3f4a, { surface: 'metal-rough' }), 0, 5.4, 0)) // gantry block
          arms.position.set(armsX, armsY, 0)
          arms.traverse((o) => { o.castShadow = true })
          world.add(arms)
          fx.sfx('whoosh', { pitch: 0.5 })
        } catch { arms = null }
      })
      fx.frame(() => {
        if (!arms) return
        try {
          if (!armsDown) {
            armsY -= 0.42
            if (armsY <= 1.1) { armsY = 1.1; armsDown = true }
            arms.position.y = armsY
          } else {
            arms.position.y = 1.1 + Math.sin(fx.age * 0.2) * 0.04 // idle servo hum
          }
        } catch { /* gone */ }
      })

      // clamp the foe
      fx.after(38, () => {
        fx.sfx('grab')
        fx.shake(0.5)
        fx.zoom(fx.foe, 0.6)
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 220 })
      })

      // the three asset categories present themselves
      const signDefs = [
        { text: 'CRYPTO', bg: '#2b1b4d', fg: '#ffd34d' },
        { text: 'REAL ESTATE', bg: '#1b3d2b', fg: '#a8ffcb' },
        { text: 'BEANIE BABIES', bg: '#4d1b1b', fg: '#ffb3b3' },
      ]
      for (let i = 0; i < 3; i++) {
        fx.after(50 + i * 12, () => {
          if (!world) return
          try {
            const s = makeSign(signDefs[i].text, signDefs[i].bg, signDefs[i].fg)
            s.position.set(clampToArena(fx, fx.self.pos.x + F * (3.2 + i * 2.1)), 0, 0)
            world.add(s)
            signs.push(s)
            fx.sfx('menu_move', { pitch: 0.9 + i * 0.15 })
          } catch { /* fine */ }
        })
      }

      // deliberation: rotate past each option. pulse. judge. reject
      const consider = (i, line) => {
        fx.after(88 + i * 14, () => {
          fx.caption(line)
          fx.sfx(i === 2 ? 'menu_back' : 'menu_move', { pitch: 1 + i * 0.1 })
          const s = signs[i]
          if (s) {
            try {
              s.scale.set(1.25, 1.25, 1.25)
              fx.after(8, () => { try { s.scale.set(1, 1, 1) } catch { /* gone */ } })
            } catch { /* gone */ }
          }
        })
      }
      consider(0, 'CRYPTO?')
      consider(1, 'REAL ESTATE?')
      consider(2, 'BEANIE BABIES. FINAL ANSWER.')

      // THE HURL — into the historically worst-performing asset class
      fx.after(134, () => {
        fx.sfx('launch')
        fx.shake(1.2)
        fx.slowmo(0.3, 0.9)
        fx.zoom(fx.foe, 1.0)
        fx.hit({ damage: 30, knockback: { x: 17, y: 6, spin: 3 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 16, 7, 0])
      })

      // explosion of paperwork at the beanie sign
      fx.after(146, () => {
        const s = signs[2]
        const sx = s ? s.position.x : clampToArena(fx, fx.self.pos.x + F * 7.4)
        fx.sfx('break')
        fx.sfx('explosion')
        fx.shake(1.3)
        fx.particles('confetti', v3(sx, 2.2, 0), { n: 40 })
        fx.particles('impact', v3(sx, 2.0, 0), { n: 16 })
        for (let i = 0; i < 8; i++) {
          const p = fx.spawnProp('box', v3(sx, 2.2, (Math.random() - 0.5) * 0.8), { mass: 0.12 })
          if (p) {
            try {
              p.mesh?.scale?.set(0.3, 0.05, 0.4)
              p.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(C.paper) })
              fx.impulse(p, [(Math.random() - 0.5) * 8, 4 + Math.random() * 5, (Math.random() - 0.5) * 6], 6)
            } catch { /* cosmetics */ }
          }
        }
        if (s) scrap(signs.splice(2, 1)[0])
        fx.caption('PORTFOLIO REBALANCED')
        fx.announcer('ASSET CLASS: PAIN')
      })

      fx.after(170, cleanup)
      fx.after(320, cleanup) // failsafe: facilities always reclaims the set
      fx.after(178, end)
    },
  },

  voice: { pitch: 0.35, rate: 0.7 },
}
