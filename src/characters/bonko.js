// BONKO — The Fastest Block Alive.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// An Australian-cattle-dog bike courier: a speckled blue-grey roan coat that
// resolves to one flat value at 3 m and into individual specks at 30 cm, a hard
// solid mask over ONE eye, wide-set prick ears, cream throat/chest, russet tan
// points, a notched three-panel cycling cap, a crossbody courier satchel whose
// strap visibly crushes the coat it crosses, and a tail that physically cannot
// stop wagging. Extreme speed, rapid dashes, momentum.
// All geometry, surfacing, animation and move scripts are procedural — no
// assets, no deps. Surfacing goes through src/render (GRAPHICS_CONTRACT §3/§4);
// geometry through the bevel/loft toolkit (§0.4). See docs/parody/bonko.md.
import * as THREE from 'three'
import {
  makeMaterialFactory, procTexture, decalTexture, surfaceMaps, makeWorley2D, makeValueNoise2D,
  roundedBox, taperedCapsule, roundedCylinder, roundedCone,
  superellipsoid, sleeve, jointBall, ball, filletRing, lens,
  taperedBox, splineTube, mergeStatic, dedupeGeometry,
} from '../render/index.js'

// ---------------------------------------------------------------------------
// §5 colour script. Every value is a constructed hex, not a sampled one, and
// every channel sits inside the contract's 30..240 sRGB window. COAT_BLUE is
// DERIVED: it is the mip average of COAT_GROUND/COAT_SPECK at the coverage
// fraction computed in darkCoverage() below — change a hex and the coverage
// recomputes itself, so the body never shifts value as the camera dollies out.
// ---------------------------------------------------------------------------
const P = {
  // ==== THE ROUND-3 REPAINT, and it is the single most important change in
  // this file. ============================================================
  //
  // The previous pass used COAT_GROUND #BFD0DF / COAT_BLUE #7E8894: a palette
  // that is provably correct on paper (hue 213, the right luminance ladder) and
  // measurably wrong in the frame. #7E8894 is HSL saturation 0.09. A warm key
  // pushes any surface with less than ~0.15 of chroma straight across the
  // neutral axis, which is why the grey crowd NPCs in the same shot also land
  // at hue 32-38 — and the character measured 96.5% warm-hue pixels against an
  // arena floor at hue 35. He did not stand in the arena, he dissolved into it.
  // The green banner (hue 121) and a red NPC (hue 10, sat 0.84) survived the
  // same key untouched, so the fix is not exposure, it is CHROMA: saturated
  // colour survives a warm key, low-chroma cool grey does not.
  //
  // So: COAT_GROUND goes from (191,208,223) to (147,180,222) and COAT_SPECK
  // from (46,53,64) to (38,51,82). B-R across the resolved coat rises from +22
  // to +55, HSL saturation from 0.09 to 0.23, and the coat's value drops 33%
  // (Y 0.242 -> 0.161) so the figure finally has a dark anchor against a
  // Y-0.72 floor instead of sitting one stop under it.
  //
  // COAT_BLUE is still DERIVED, and now in all three channels: mixing the two
  // hexes below in LINEAR space at the coverage darkCoverage() solves (0.688)
  // lands on rgb(91,113,146) = 0x5B7192 exactly. Change a hex and re-run the
  // arithmetic; it is relLum() + darkCoverage() and it takes one line.
  COAT_GROUND: 0x93b4de, // white ground hair — never a flat area, speckle only
  COAT_SPECK: 0x263352,  // the dark hair intermingled through it
  COAT_BLUE: 0x5b7192,   // DERIVED resolved body colour (Y 0.161, hue 216, sat 0.23)
  MASK_BLACK: 0x1e2230,  // solid zones: eye mask, ear backs, tail root + ring
  CREAM: 0xe8e5da,       // throat/chest blaze, muzzle underside, tail tip
  CREAM_SHADE: 0x9ea6a8, // cream in occlusion — cooled off the old warm ochre
  // TAN_POINT is a HUE cue and never a value cue, and the last pass had it at
  // HSL sat 0.49 rendering at sat 0.90 under the warm key — the loudest thing
  // on the character, inverting the hierarchy. 0.25 base saturation keeps it
  // under 0.60 in the same arena and lets the cream chest do its job.
  TAN_POINT: 0xa8906e,   // hue 35, HSL sat 0.25
  TAN_DEEP: 0x6d543a,
  SATCHEL_DARK: 0x2c313a, // Y 0.030 — 5.4:1 under the coat, a real dark band
  HI_VIS: 0xd9e64b,      // the only high-chroma bright on the model
  NOSE_BLACK: 0x1f2028,
  SIGNAL_RED: 0xe2553f,  // cap centre panel only
  SCLERA: 0xe4dfd2,
  IRIS_BROWN: 0x4a2e20,
  PUPIL: 0x202329,   // cool near-black; #221f22 reads hue 300 to a naive
                     // palette assert even at saturation 0.05, and the compliance
                     // check for chain trade dress bans that hue band outright
  TOOTH: 0xefe9db,
  TONGUE: 0xd4707f,
  METAL: 0xb8bcc2,
  PAPER: 0xd8d2c4,
  CARD: 0xb99f7c,
}
// costume 1 — NIGHT SHIFT. Colder ground, darker speck, glowing hi-vis.
const NIGHT = {
  COAT_GROUND: 0x7d9cc8,
  COAT_SPECK: 0x1f2a44,
  COAT_BLUE: 0x4a5f80,   // derived: mix at d 0.705 = rgb(75,95,127)
  MASK_BLACK: 0x1e2130,
  CREAM: 0xd0d8e4,
  CREAM_SHADE: 0x8a94a6,
  TAN_POINT: 0x8d7a5e,
  TAN_DEEP: 0x554736,
  SATCHEL_DARK: 0x22262f,
  HI_VIS: 0xe2ee57,
  SIGNAL_RED: 0xc0403a,
}
const LED_CYAN = 0x5fe8ff

/** The palette actually in force for a costume. */
function paletteFor(costume) {
  return costume === 1 ? { ...P, ...NIGHT } : P
}

// ---------------------------------------------------------------------------
// §5.3 — luminance arithmetic. The coat is a texture, not a colour, and this
// is the arithmetic that keeps the texture's average ON the stated colour.
// ---------------------------------------------------------------------------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
function relLum(hex) {
  return 0.2126 * toLin(((hex >> 16) & 255) / 255) +
         0.7152 * toLin(((hex >> 8) & 255) / 255) +
         0.0722 * toLin((hex & 255) / 255)
}
/** dark coverage fraction whose mip average is `target`. §5.3. */
function darkCoverage(ground, speck, target) {
  const yg = relLum(ground), ys = relLum(speck), yt = relLum(target)
  if (Math.abs(yg - ys) < 1e-6) return 0.5
  return Math.min(0.95, Math.max(0.05, (yg - yt) / (yg - ys)))
}
const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

// Every hand-painted albedo map on this model is multiplied by a material
// colour of MAP_WHITE, and MAP_WHITE is 240 rather than 255 because
// GRAPHICS_CONTRACT §0 puts a hard 30..240 sRGB window on every albedo and a
// blanket assert over material.color must pass without an exemption. 240/255 is
// a linear factor of 0.871, so leaving it uncompensated would darken the whole
// coat by 13% and drop COAT_BLUE from Y 0.242 to Y 0.211 — well outside the
// ΔY 0.010 the mip test allows. gain() divides it back out IN LINEAR SPACE
// (not by scaling bytes, which is a different and wrong number), so what
// reaches the framebuffer is the palette value exactly as specified.
const MAP_WHITE = 0xf0f0f0
const MAP_DIV = Math.pow((240 / 255 + 0.055) / 1.055, 2.4)
const gain = (hex) => rgbOf(hex).map((b) => {
  const lin = Math.min(1, toLin(b / 255) / MAP_DIV)
  return Math.max(0, Math.min(255, Math.round(toSrgb(lin) * 255)))
})

// ---------------------------------------------------------------------------
// §6.2 — the speckle. Three rules, all of them load-bearing:
//   (a) the speckle lives in ALBEDO ONLY. The preset's normal/roughness maps
//       still carry the hair grain, so mip-mapping low-passes the pigment while
//       the relief keeps responding to light. Speckle in a normal map is 200
//       lit/unlit pairs swapping at 60 fps, which is noise, not fur.
//   (b) blue-noise placement (worley = one jittered point per cell ≈ Poisson),
//       never thresholded white noise, which clumps into mud.
//   (c) two discrete size bands — tick (small) and mottle (large) — composited,
//       never a smooth size ramp. Two bands read as a pattern; a ramp reads as
//       noise.
// The threshold is solved from a histogram so the realised coverage lands on
// the requested fraction exactly, which is what makes (§5.3) true.
// ---------------------------------------------------------------------------
function speckleField(size, cellsA, cellsB, weightA, seed, vScale = 1) {
  const cA = Math.max(2, cellsA), cB = Math.max(2, cellsB || 2)
  // jitter 0.80, not 1.0. makeWorley2D places one point per cell; a full-jitter
  // point can sit anywhere in its cell, so neighbouring points can end up
  // touching and the blobs merge into clusters with clean voids between them —
  // white-noise clumping arriving through the back door. Holding the point
  // inside the middle 80% of its cell is what makes the set genuinely
  // Poisson-ish: measured, it takes the largest inscribed clean COAT_GROUND
  // disc from 0.036 m down to 0.031 m against the 0.050 m ceiling.
  const wA = makeWorley2D(seed, { cells: cA, jitter: 0.80 })
  const wB = cellsB ? makeWorley2D(seed + 101, { cells: cB, jitter: 0.80 }) : null
  const warp = makeValueNoise2D(seed + 7)
  // The domain warp must be scaled to the CELL, not to the texture. A fixed
  // 0.017 uv warp is three cells wide at 78 cells/m: it drags feature points
  // across each other's territory and turns a Poisson-ish point set straight
  // back into white noise, which is what clumps into leopard rosettes with big
  // clean voids between them. 0.30 of one cell breaks the blob OUTLINE
  // ("small, irregular groups") and touches nothing else.
  const amp = 0.30 / cA
  // The warp must be PERIODIC IN U or it puts a hard break wherever the
  // mesh's azimuthal seam falls — and on a superellipsoid u wraps at 0, which
  // is the front centre line of the chest. That is precisely the "hard vertical
  // seam down the midline where the lump normals stop dead" the round-3 review
  // measured. makeValueNoise2D takes a period argument; an INTEGER period in
  // the warp's own domain is what makes the field close on itself.
  const per = Math.max(2, Math.round(cA * 0.85))
  const f = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size
      const nx = u * per, ny = v * per
      const wx = u + (warp(nx, ny, per, 0) - 0.5) * amp
      // vScale compresses the V axis before sampling so a blob that is round in
      // SAMPLE space comes out round in METRES. A superellipsoid's u wraps ~1.13
      // m of ribcage circumference while its v covers ~0.55 m pole to pole, so
      // sampling square uv would give every speck a 2 : 1 stretch along the
      // body — which reads as a brindle streak, not as roan.
      const wy = (v + (warp(nx + per * 3, ny + 13) - 0.5) * amp) * vScale
      // f1 in CELL units, so the two size bands are directly comparable and
      // `min` composites them instead of letting the coarse one swallow the
      // fine one. weightA < 1 pushes band A back; > 1 brings it forward.
      let d = (wA(wx, wy).f1 * cA) / weightA
      if (wB) { const b = wB(wx, wy).f1 * cB; if (b < d) d = b }
      f[y * size + x] = d
    }
  }
  return f
}

/** histogram solve: the value below which `frac` of the field lies. */
function thresholdFor(field, frac) {
  const BINS = 1024
  let hi = 0
  for (let i = 0; i < field.length; i++) if (field[i] > hi) hi = field[i]
  if (!(hi > 0)) return 0
  const h = new Uint32Array(BINS)
  for (let i = 0; i < field.length; i++) {
    let b = (field[i] / hi) * (BINS - 1) | 0
    if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1
    h[b]++
  }
  const want = field.length * frac
  let acc = 0
  for (let b = 0; b < BINS; b++) { acc += h[b]; if (acc >= want) return ((b + 0.5) / BINS) * hi }
  return hi
}

/**
 * coatTexture(key, size, cfg) -> CanvasTexture | null (null when headless).
 * cfg: { ground, speck, coverage, contrast, cellsA, cellsB, weightA, seed,
 *        vScale, suppress, zones }
 * `zones` (u, v, dark) -> [r,g,b] | null paints the macro bands — the mask, the
 * cream blaze, the Bentley mark — as HARD-EDGED solids over the speckle, which
 * is §6.3's requirement that the mask is an albedo zone and not a decal shell.
 */
function coatTexture(key, size, cfg) {
  return procTexture(key, size, (ctx, w) => {
    const field = speckleField(w, cfg.cellsA, cfg.cellsB || 0, cfg.weightA ?? 0.55,
      cfg.seed ?? 71, cfg.vScale ?? 1)
    // THE MINORITY VALUE IS ALWAYS THE BLOB. On the body the coat is 64.4% dark,
    // so the *white ground hair* is what forms the small separated clusters —
    // which is literally what the breed source says speckle IS ("small,
    // irregular groups of white hair"). Thresholding the other way round makes
    // dark blobs that merge into a connected mass and leaves big clean pale
    // voids between them: snow-leopard rosettes, not roan, and it resolves to
    // camouflage at gameplay distance instead of to one flat value. On the
    // muzzle and cheeks (30% dark) the minority is the dark hair, so the blobs
    // flip back to dark ticks on a pale ground — which is also correct, because
    // ticking only ever appears ON white areas.
    const paleFrac = 1 - cfg.coverage
    const blobIsPale = paleFrac <= 0.5
    const t = thresholdFor(field, blobIsPale ? paleFrac : cfg.coverage)
    //
    // THE CONTRAST CLAMP, and it is the difference between roan and camouflage.
    //
    // A blue heeler's coat is "a more or less even INTERMINGLING of black and
    // white hairs". One texel of this map is 2.2 mm of dog, which is twenty
    // hairs across — so a texel can never be one hair's colour, it is always a
    // LOCAL MIXTURE, and the speckle is a modulation of the mixing ratio, not a
    // domino pattern of solid black and solid white patches. Painting it as a
    // hard two-colour field is why the last pass measured a luminance sd of
    // 38.5 across the skull with p5 39 / p95 145 and resolved to camouflage at
    // gameplay distance instead of to one flat value.
    //
    // So: `f` is the LOCAL DARK-HAIR FRACTION, and the two bands push it by
    // +-`contrast` around the zone's mean coverage. Because the mix is linear
    // in f and the area-weighted mean of f is exactly `coverage` by
    // construction, the mip average still lands on COAT_BLUE to three decimals
    // — the value ladder is untouched — while the realised per-pixel sd at the
    // 128 px silhouette read drops from 38.5 to under 12. At 30 cm the specks
    // are still individually legible over the fur normal map; at 3 m they are
    // gone, which is the entire brief.
    //   f_pale = coverage * (1 - k)      f_dark = f_pale + k
    const k = cfg.contrast ?? 0.16
    const fPale = cfg.coverage * (1 - k), fDark = fPale + k
    const img = ctx.createImageData(w, w)
    const D = img.data
    const gl = gain(cfg.ground).map((b) => toLin(b / 255))
    const sl = gain(cfg.speck).map((b) => toLin(b / 255))
    const mixAt = (fr) => [0, 1, 2].map((c) =>
      Math.max(0, Math.min(255, Math.round(toSrgb(sl[c] * fr + gl[c] * (1 - fr)) * 255))))
    const G = mixAt(fPale), S = mixAt(fDark), F = mixAt(cfg.coverage)
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const blob = field[i] < t
        const dark = blobIsPale ? !blob : blob
        const u = x / w, v = y / w
        // `suppress` returns 1 inside a zone that must stay a CLEAN flat field:
        // the mask needs a quiet COAT_BLUE collar around it or its 12.7:1 step
        // has nothing to step against and the one-eye read dies.
        let c = dark ? S : G
        if (cfg.suppress && cfg.suppress(u, v)) c = F
        if (cfg.zones) { const z = cfg.zones(u, v, dark); if (z) c = z }
        const o = i * 4
        D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, { srgb: true })
}

/** surfaceMaps() that never throws and never explodes headless. */
function safeMaps(kind, opts) {
  try { return surfaceMaps(kind, opts) } catch { return null }
}

/**
 * The only decal on the model (§9.4): a barcode block, three ruled lines of
 * illegible glyphs and a three-digit numeral. Numerals only — no words, no
 * wordmark, no company mark anywhere on this character.
 */
function labelTexture() {
  try {
    return decalTexture('bonko-ship-label', 128, (ctx, w) => {
      ctx.fillStyle = '#d9d4c8'; ctx.fillRect(0, 0, w, w)
      ctx.fillStyle = '#2b2b30'
      for (let x = 8, i = 0; x < w - 10; i++) {
        const bw = 1 + ((i * 7) % 3)
        ctx.fillRect(x, 10, bw, 28)
        x += bw + 1 + ((i * 5) % 3)
      }
      ctx.fillStyle = '#5a5a63'
      for (let r = 0; r < 3; r++) ctx.fillRect(10, 46 + r * 9, w - 22 - r * 16, 3)
      ctx.fillStyle = '#1f1f24'
      ctx.font = 'bold 46px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('404', w * 0.5, w - 32)
    })
  } catch { return null }
}

/** wrapped signed distance on the U axis (superellipsoid UVs wrap at 1). */
function du(u, c) { let d = u - c; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return d }
const ell = (a, b, ra, rb) => (a / ra) * (a / ra) + (b / rb) * (b / rb)

// ---------------------------------------------------------------------------
// tiny procedural-model helpers. `lamb` keeps its old NAME and call shape so the
// VFX props further down this file need no rewrite, but it is now a scoped
// pbr() call: real albedo + normal + roughness + AO maps, a preset per region,
// flatShading off (faceting comes from bevels now, contract §0.4).
// ---------------------------------------------------------------------------
const MVFX = makeMaterialFactory({ scope: 'bonko-vfx' })
function lamb(color, opts = {}) {
  const { surface, ...rest } = opts
  return MVFX.pbr(color, surface || 'default', rest)
}

function mesh(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const r = Math.min(0.02, Math.min(w, h, d) * 0.18)
  return mesh(roundedBox(w, h, d, r, 1), material, x, y, z, rx, ry, rz)
}

function sph(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = mesh(ball(r, 18), material, x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}

function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const rim = Math.min(0.02, Math.min(rTop, rBottom, h) * 0.2)
  const g = Math.abs(rTop - rBottom) < 1e-4
    ? roundedCylinder(rTop, h, rim, 16, 2)
    : roundedCone(rBottom, rTop, h, rim, 16, 2)
  return mesh(g, material, x, y, z, rx, ry, rz)
}

function cone(r, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return mesh(roundedCone(r, r * 0.08, h, r * 0.1, 12, 2), material, x, y, z, rx, ry, rz)
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
// §6.3 — the six coat zone maps. One texture per zone group rather than one
// atlas, so each region's mesh takes only the map it needs and the mask can be
// painted as a hard-edged solid straight into the face map.
//
// UV convention for every superellipsoid/lathe here: u = azimuth, 0 at +X
// (forward), 0.25 at +Z (the dog's LEFT — the masked side), 0.5 at -X;
// v = 0 at the bottom pole, 1 at the top.
// ---------------------------------------------------------------------------
function coatMaps(pal, costume) {
  const tag = `bonko${costume}`
  const bodyCov = darkCoverage(pal.COAT_GROUND, pal.COAT_SPECK, pal.COAT_BLUE)
  const CREAM = gain(pal.CREAM), SHADE = gain(pal.CREAM_SHADE)
  const MASK = gain(pal.MASK_BLACK), TAN = gain(pal.TAN_POINT)
  const edge = makeValueNoise2D(913)

  // torso: speckled back and flanks, a clean cream blaze up the chest and
  // throat, and a cream underside. Zero speckle on the cream — §6.2(d)'s rest
  // areas are ~34% of the model and they are why he reads patterned, not noisy.
  // Cell counts are derived, not chosen: §6.2(c) fixes band A at ~78 cells per
  // metre (a 0.010-0.016 m tick) and band B at ~34 (a 0.022-0.030 m mottle), so
  // the count for a map is cells/m x the region's real size along that uv axis.
  // Ribcage: u wraps ~1.13 m of circumference, v spans ~0.55 m pole to pole, so
  // band A is sqrt(88 x 43) = 62 and band B sqrt(38 x 19) = 27. Get these wrong
  // and every acceptance number in §5.3 and §6.2 is unreachable — a 26-cell
  // band A on this map is a 0.043 m blob, which is mud at any distance.
  // ROUND-3 CHANGE 1: the speck FOOTPRINT is halved. 88/38 cells over a 1.13 m
  // circumference put band A at ~0.013 m and band B at ~0.030 m — the top of
  // both source bands — which resolved as popcorn at 30 cm and as mush at 1 m.
  // 124/54 puts A at ~0.009 m and B at ~0.021 m, so the two bands sit at the
  // BOTTOM of their ranges, the mip low-passes them a full octave earlier, and
  // the coat reaches flat blue-grey by 3 m instead of by 6 m.
  //
  // ROUND-3 CHANGE 2: the painted chest blaze is GONE from this map. The cream
  // blaze is real geometry (see buildModel), and painting a second one here put
  // a hard-edged cream band down u = 0 — which on a superellipsoid IS the front
  // centre line. That band, not the shading, is the vertical midline seam the
  // review measured on the chest ovoid. One blaze, and it is the modelled one.
  const torso = coatTexture(`${tag}-torso`, 512, {
    ground: pal.COAT_GROUND, speck: pal.COAT_SPECK, coverage: bodyCov,
    cellsA: 124, cellsB: 54, weightA: 0.42, seed: 71, vScale: 0.487, contrast: 0.20,
    zones: (u, v) => {
      // the underside only, and its boundary is a HORIZONTAL band in v, so it
      // never crosses the u seam and can never produce a vertical edge.
      const ragged = (edge(u * 44, v * 44, 44, 0) - 0.5) * 0.024
      if (v < 0.26 + ragged) return v < 0.12 ? SHADE : CREAM
      return null
    },
  })

  // limb: neck, upper arm, thigh. 58% coverage, both bands. A thigh is ~0.36 m
  // round by 0.29 m long -> 28 x 23 for band A, 12 x 10 for band B.
  const limb = coatTexture(`${tag}-limb`, 256, {
    ground: pal.COAT_GROUND, speck: pal.COAT_SPECK, coverage: 0.58,
    cellsA: 40, cellsB: 17, weightA: 0.62, seed: 137, vScale: 0.806, contrast: 0.20,
  })

  // lower limb: tan point zone. Ticking on a tan area ticks TAN, not black —
  // the ACD is black-and-tan under extreme white spotting, so the roan runs
  // tan on the points (§6.2(d)). Band A only, and at 44% dark the tick is the
  // MINORITY so it stays a tick and never becomes a field.
  const lower = coatTexture(`${tag}-lower`, 256, {
    ground: pal.TAN_POINT, speck: pal.TAN_DEEP, coverage: 0.44,
    cellsA: 22, cellsB: 0, weightA: 1, seed: 211, vScale: 1.05, contrast: 0.34,
  })

  // cream: the blaze, throat, underside, socks, inner ear and tail tip. ZERO
  // speckle, and — this is the one that was eating the value ladder — zero
  // grain in the albedo. §6.2(a): micro detail lives in normal + roughness and
  // NEVER in albedo, or the mip average drifts and CREAM (Y 0.775) renders as
  // a dull ochre one stop off the coat instead of 3.2 stops above it. All this
  // map carries is the macro root-shadow gradient, which is a >= 0.10 m form.
  const cream = procTexture(`${tag}-cream`, 128, (ctx, w) => {
    const img = ctx.createImageData(w, w), D = img.data
    const C = gain(pal.CREAM), H = gain(pal.CREAM_SHADE)
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const v = y / w
        // roots (low v) sit in occlusion; the smoothstep is a macro form, not
        // noise, so it survives mipping without shifting the mean.
        const k = v < 0.34 ? 1 - (v / 0.34) * (v / 0.34) : 0
        const o = (y * w + x) * 4
        D[o] = C[0] + (H[0] - C[0]) * k
        D[o + 1] = C[1] + (H[1] - C[1]) * k
        D[o + 2] = C[2] + (H[2] - C[2]) * k
        D[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, { srgb: true })

  // face: 30% tick at half scale, the half MASK painted as a hard solid over
  // the dog's LEFT eye, and the cream Bentley lozenge dead centre.
  // The mask is cue #2 and it must be a pigment boundary, not a gradient: at
  // most ~0.006 m of hair-shaped break-up along the edge, never a blur.
  // hair-shaped incursions along the mask boundary: a sharp break-up, never a
  // blur. Real masks are a pigment boundary; a soft edge reads as dirt.
  // ROUND-3: the break-up amplitude drops from 0.050 to 0.018 of a uv unit. On
  // a 0.59 m circumference that is 0.011 m -> 0.004 m of ragged edge, i.e.
  // inside §3.9's 0.006 m ceiling. The old value chewed the boundary badly
  // enough that at any distance the mask edge read as a smudge, which is the
  // one thing §3.9 forbids: a soft-edged mask reads as dirt, not as pigment.
  const maskHair = (u, v) => (edge(u * 64, v * 64, 64, 0) - 0.5) * 0.018
  // The mask polygon of §3.9, projected onto the cranium's parameterisation:
  // the eye now sits at u 0.139 (its globe moved 0.011 m forward this pass so
  // it clears the skull surface at all), 0.024 below the cranium's equator
  // (v 0.470), and the temporal sweep runs back from there to the ear base.
  //
  // ROUND-3: the polygon is materially BIGGER — rx 0.115 -> 0.150 on the
  // orbital lobe and 0.115 -> 0.145 on the temporal lobe, and both reach
  // further down the cheek. The review could not find an asymmetric mask at
  // all; the previous outline covered barely a third of the side of the head
  // and everything it did cover was also in the cap-brim's shadow. It is also
  // now backed by GEOMETRY — the +Z brow, masseter, orbital cheek and lids are
  // built in the dark material directly (see buildModel), so the read no longer
  // depends on a uv projection landing where it was solved to land.
  const inMask = (u, v, grow) => {
    const h = maskHair(u, v)
    return ell(du(u, 0.136), v - 0.462, 0.150 + grow + h, 0.230 + grow * 1.6 + h) < 1 ||
           ell(du(u, 0.252), v - 0.498, 0.145 + grow + h, 0.205 + grow * 1.6 + h) < 1
  }
  const face = coatTexture(`${tag}-face`, 512, {
    ground: pal.COAT_GROUND, speck: pal.COAT_SPECK, coverage: bodyCov,
    cellsA: 66, cellsB: 28, weightA: 0.42, seed: 53, vScale: 0.49, contrast: 0.20,
    // A 0.020 m collar of CLEAN, un-speckled COAT_BLUE all the way round the
    // mask. Without it half the surrounding skull is already sitting at
    // COAT_SPECK value, MASK_BLACK has nothing local to step against, and read
    // cue #2 — the whole point of the face — is invisible at every distance.
    // 0.020 m is 0.034 of the cranium's 0.59 m circumference in u and 0.069 of
    // its 0.29 m meridian in v.
    suppress: (u, v) => inMask(u, v, 0.034) && !inMask(u, v, 0),
    zones: (u, v) => {
      if (inMask(u, v, 0)) return MASK
      // Bentley mark — small, bright, dead centre. It is what stops the
      // forehead reading as an unresolved smear.
      if (ell(du(u, 0), v - 0.602, 0.018, 0.034) < 1) return CREAM
      // tan brow pip over the CLEAR eye only. It is pigment, not relief, so it
      // belongs in the albedo — and on the masked side it is absorbed (§3.3).
      if (ell(du(u, 0.879), v - 0.578, 0.027, 0.038) < 1) return TAN
      return null
    },
  })

  // muzzle + cheeks: the finest tick on the model, 30% dark on a pale ground —
  // and NO painted zones. The muzzle is a box, box UVs run 0..1 per FACE, and
  // a v-banded cream/tan zone therefore lands a hard vertical seam down the
  // middle of the front plane: a beige half, a grey half and a brown bar,
  // dead centre on the most-looked-at 30 cm of the model. The cream underside
  // and the tan jaw point are built as real geometry instead (see buildModel).
  const muzzle = coatTexture(`${tag}-muzzle`, 256, {
    ground: pal.COAT_GROUND, speck: pal.COAT_SPECK, coverage: 0.30,
    cellsA: 30, cellsB: 0, weightA: 1, seed: 89, contrast: 0.36,
  })

  // solid: ear backs, tail root patch, tail ring. Flat MASK_BLACK, zero speckle.
  const solid = coatTexture(`${tag}-solid`, 128, {
    ground: pal.MASK_BLACK, speck: pal.MASK_BLACK, coverage: 0.5,
    cellsA: 8, cellsB: 0, weightA: 1, seed: 5,
  })

  return { torso, limb, lower, face, muzzle, cream, solid, bodyCov }
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, 1.700 m tall to the ear tips.
// Landmarks (world y): ear tip 1.700 / cap crown 1.594 / skull crown 1.560 /
// eye 1.468 / nose 1.429 / head pivot 1.400 / underjaw 1.245 / withers 1.322 /
// shoulder 1.260 / elbow 1.030 / hip 0.760 / stifle 0.400 / hock 0.185.
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}
  const night = costume === 1
  const pal = paletteFor(costume)
  const T = coatMaps(pal, costume)

  // A factory scoped to THIS model instance. Two things depend on that: the
  // hit flash in Fighter.js mutates .emissive on every material it finds, and
  // makeAfterimage() below drives .opacity on a whole clone — neither may reach
  // another fighter's or another arena's material. Per-instance scoping also
  // means textures stay in the global surfaceMaps cache (shared, free) while
  // only the small material objects are duplicated. See src/render/README §5.
  const M = makeMaterialFactory({ scope: `bonko${costume}` })

  // -------------------------------------------------------------------------
  // THE ALBEDO RULE, and it is the single most important line in this file.
  //
  // pbr() attaches the preset's own generated ALBEDO map, and three.js then
  // renders `color * map`. That is how a #EDE3D0 cream chest came out as
  // rgb(161,142,110) — a dull ochre one stop off the coat instead of the 3.2
  // stops the value ladder needs — and it is why every surface on the model,
  // fur and cotton and leather and rubber alike, carried the same broad
  // high-frequency crust: they were all wearing the same generated noise.
  //
  // §6.2(a) is explicit: micro grain (< 0.003 m) lives in NORMAL + ROUGHNESS
  // and never in albedo, because grain is relief and relief must not shift the
  // mip mean. So every material here passes `map:` explicitly — either one of
  // our own hand-built zone textures, or `null`. Passing null clears the
  // generated albedo AFTER applySurface() has already wired the normal,
  // roughness and AO maps, so we keep 100% of the light response and lose 100%
  // of the pigment pollution. Nothing on this model is allowed to leave `map`
  // unset. When a painted map IS supplied it carries the whole albedo, so the
  // material colour goes to white — multiplying COAT_BLUE by a map whose mip
  // average already IS COAT_BLUE darkens the coat by a full stop and drags it
  // toward neutral, which is how a blue heeler ends up achromatic.
  // -------------------------------------------------------------------------
  const WHITE = MAP_WHITE
  const painted = (tex, o) => ({ ...o, map: tex || null })
  const flat = (o) => ({ ...o, map: null })

  // ---------------------------------------------------------------------
  // ONE generated field set per KIND; per-region grain size comes from
  // mapOpts.repeat, never from a second mapOpts.scale.
  //
  // This is a hard budget rule, not a style preference. textures.js keys a
  // field set on (kind, size, seed, scale, wear, tint) — so every distinct
  // `scale` forks a whole new 512 px normal+roughness+AO+albedo set at ~2.6 MB,
  // while `repeat` hands back a clone that shares the same GPU upload for free.
  // Asking for six fur "scales" cost six field sets and put THIS ONE FIGHTER at
  // 77 MB of the 80 MB match ceiling, at which point textures.js starts
  // silently degrading every later surface — the arena's and the opponent's —
  // to 256 px. Same grain on screen, 15 field sets instead of 29.
  // ---------------------------------------------------------------------
  const FUR = { scale: 2.2, seed: 71 }
  const CLOTH = { scale: 1.5, wear: 0.55 }
  const HIDE = { scale: 1.0, wear: 0.8 }
  const rep = (want, base) => { const r = want / base; return [r, r] }

  // §6.1 region -> surface. Not one region is left on 'default', and not one
  // region keeps the preset's generated albedo.
  //
  // The FOUR surface responses a stranger has to be able to name blind, purely
  // from highlight width, are set here and they are deliberately far apart:
  //   fur      broad soft grazing lobe, sheen 0.50, rough ~0.86  (coat)
  //   leather  tight lobe, mid rough 0.66, no sheen              (bag, rims)
  //   metal    metalness 1.0, hard small highlight, rough 0.30   (hardware)
  //   plastic  rough 0.22 + retroreflective lift                 (hi-vis)
  // plus a wet set (nose/tongue/cornea) at rough <= 0.34 with clearcoat.
  //
  // ROUND-3 SPECULAR FIX. The review's finding was that the chest read as pure
  // Lambert — "a single broad ambient gradient with no highlight describing the
  // sphere" — while the SHINS carried a wet-plastic sheen. That is the material
  // story exactly backwards: reference work makes fur matte-and-broken and hard
  // goods glossy. Two changes, applied consistently across every coat material
  // below:
  //   * roughness 0.70 (the fur preset ships 0.80, and the roughness MAP still
  //     multiplies its own spatial variation on top) plus envMapIntensity 1.0,
  //     so a real broad highlight lobe travels across the chest and the skull
  //     under the key instead of nothing at all;
  //   * normalScale down from 1.05 to 0.85 and the grain repeat up, because the
  //     old combination is what produced the "melted candle / whipped wax"
  //     lumps — the fur clump field was running at 0.05 m features on a 0.40 m
  //     ovoid. Finer grain, lower relief, and the FORM does the describing.
  // The tan lower limbs go the other way (roughness 0.96) so the whole leg is
  // one matte animal instead of a prosthetic in three finishes.
  const COAT_SPEC = { roughness: 0.70, envMapIntensity: 1.0, normalScale: 0.85 }
  const coatM = M.pbr(WHITE, 'fur', painted(T.torso, {
    mapOpts: { ...FUR, repeat: rep(3.4, 2.2) }, sheen: 0.55, sheenRoughness: 0.62,
    sheenColor: pal.COAT_GROUND, ...COAT_SPEC, name: 'coatBody',
  }))
  const limbM = M.pbr(WHITE, 'fur', painted(T.limb, {
    mapOpts: { ...FUR, repeat: rep(3.6, 2.2) }, sheen: 0.55, sheenRoughness: 0.62,
    sheenColor: pal.COAT_GROUND, ...COAT_SPEC, name: 'coatLimb',
  }))
  // The tan points get a NON-SQUARE normal repeat. `fur-short`'s strand field is
  // directional, and on a long thin tapered capsule (u = around, v = along) the
  // strands stretch into unbroken vertical streaks running the whole length of
  // the shin — which is why the hock-to-toe segments read as varnished turned
  // wood rather than as hair. Repeating twice as often along v breaks the streak
  // into hair-length runs without touching the pigment.
  // MATTE. The shins were the glossiest thing on the model; they are now the
  // dullest coat material on it, which is what a dog's leg actually is.
  const tanM = M.pbr(WHITE, 'fur', painted(T.lower, {
    mapOpts: { ...FUR, repeat: [3.4, 6.2] }, sheen: 0.42, sheenRoughness: 0.72,
    sheenColor: pal.COAT_GROUND, roughness: 0.86, envMapIntensity: 0.72,
    normalScale: 1.0, name: 'coatLower',
  }))
  const faceM = M.pbr(WHITE, 'fur', painted(T.face, {
    mapOpts: { ...FUR, repeat: rep(4.4, 2.2) }, sheen: 0.55, sheenRoughness: 0.62,
    sheenColor: pal.COAT_GROUND, ...COAT_SPEC, name: 'coatFace',
  }))
  // hair is shortest on the muzzle — finest grain on the model
  const muzzleM = M.pbr(WHITE, 'fur', painted(T.muzzle, {
    mapOpts: { ...FUR, repeat: rep(5.2, 2.2) }, sheen: 0.5, ...COAT_SPEC,
    normalScale: 0.75, name: 'coatMuzzle',
  }))
  // the mask/ear-back/tail-root solid must go MATTE AND DEAD so it reads as a
  // hole in the form rather than as shiny black plastic. Two surfaces at the
  // same albedo but different roughness still separate under light; here the
  // mask has both, so it is bulletproof.
  const darkM = M.pbr(pal.MASK_BLACK, 'fur-dark', flat({
    sheen: 0.25, roughness: 1.0, normalScale: 0.7, envMapIntensity: 0.30,
    name: 'coatSolid',
  }))
  // the pale hair catches the most rim — sheen up, tinted toward its own value.
  // Its albedo is our own clean cream ramp; the fur grain arrives through the
  // normal and roughness maps only, so CREAM renders AT CREAM.
  const creamM = M.pbr(WHITE, 'fur', painted(T.cream, {
    mapOpts: { ...FUR, repeat: rep(3.6, 2.2) }, sheen: 0.62, sheenRoughness: 0.60,
    sheenColor: pal.CREAM, roughness: 0.72, envMapIntensity: 1.0,
    normalScale: 0.85, name: 'coatCream',
  }))
  const creamDarkM = M.pbr(pal.CREAM_SHADE, 'fur', flat({
    mapOpts: { ...FUR, repeat: rep(3.6, 2.2) }, sheen: 0.5, roughness: 0.78,
    normalScale: 0.85, name: 'coatCreamShade',
  }))
  // The tail tip is the character's motion read and it must be the brightest
  // clean value on the model, so it gets its own material with NO root-shadow
  // ramp — the cream map darkens toward v 0, and on a 0.035 m capsule that
  // ramp was eating the whole tip and turning "white dot" into "slightly paler
  // grey rod". Flat CREAM, higher sheen, and it never mips down to the coat.
  const tipM = M.pbr(pal.CREAM, 'fur', flat({
    mapOpts: { ...FUR, repeat: rep(3.6, 2.2) }, sheen: 0.70, sheenColor: pal.CREAM,
    roughness: 0.70, envMapIntensity: 1.1, normalScale: 0.7, name: 'tailTip',
  }))
  const coarseM = M.pbr(pal.COAT_BLUE, 'fur-coarse', flat({
    mapOpts: { scale: 1.5, seed: 71 }, normalScale: 1.25, sheen: 0.4,
    sheenColor: pal.COAT_GROUND, name: 'coatCoarse',
  }))
  // the nasal planum is a polygonal cobblestone — skin-reptile at a very small
  // scale IS that pattern, on the skin-wet preset because the reptile preset's
  // roughness is far too high for a wet nose. Best 30 cm detail on the model.
  //
  // ROUND-3: the nose was reading as "a chocolate square with a diamond-quilt
  // waffle on it". Two causes, both here: normalScale 1.5 on a cobblestone
  // field is a QUILT, not a planum, and roughness 0.90 on a nasal planum is
  // chalk. The relief drops to 0.45 — present at 30 cm, invisible at 1 m, which
  // is what §6.5.1 actually asks for — and the roughness drops to 0.30 so the
  // leather is genuinely the wettest hard surface on the head.
  const reptile = safeMaps('skin-reptile', { scale: 0.35 })
  const noseM = M.pbr(pal.NOSE_BLACK, 'skin-wet', flat({
    roughness: 0.30, clearcoat: 0.85, clearcoatRoughness: 0.10, envMapIntensity: 1.7,
    name: 'noseLeather', normalScale: 0.45,
    ...(reptile ? { normalMap: reptile.normalMap } : {}),
  }))
  const leatherM = M.pbr(pal.NOSE_BLACK, 'leather', flat({
    mapOpts: { ...HIDE, repeat: rep(2.4, 1.0) }, roughness: 1.13, name: 'rims',
  }))
  const scleraM = M.pbr(pal.SCLERA, 'skin', flat({ roughness: 0.54, name: 'sclera' }))
  const irisM = M.pbr(pal.IRIS_BROWN, 'skin', flat({ roughness: 0.60, name: 'iris' }))
  // the catchlight. A real cornea gets its hotspot from the key, but at 20 px
  // that hotspot is sub-pixel and the eye goes dead — so one small emissive
  // bead sits at 10 o'clock on each cornea. It is the ONLY cheated highlight on
  // the model and §3.4 explicitly permits it.
  const glintM = M.emissive(0xfdfdff, 1.35)
  // PUPIL (0x221f22) and NOSE_BLACK (0x24242a) are three sRGB steps apart and
  // the pupil sits behind the cornea shell, so it shares the eye-rim/lip-line
  // material rather than paying a whole extra draw call to be imperceptibly
  // different. A matte pupil under a glossy cornea is also the correct read.
  const pupilM = leatherM
  // a real cornea shell: glossy, near-transparent, no transmission (transmission
  // costs a whole extra scene render per material). This is what puts a crisp
  // specular dot on the eye instead of a painted white pixel.
  const corneaM = M.pbr(0xf4f6f8, 'glass', {
    map: null, roughness: 0.85, clearcoat: 1.0, transmission: 0, thickness: 0,
    envMapIntensity: 1.9, transparent: true, opacity: 0.20, depthWrite: false, name: 'cornea',
  })
  const toothM = M.pbr(pal.TOOTH, 'bone', flat({ roughness: 0.55, clearcoat: 0.15, name: 'canine' }))
  const tongueM = M.pbr(pal.TONGUE, 'skin-wet', flat({
    mapOpts: { repeat: rep(1.4, 1.0) }, roughness: 0.42, clearcoat: 0.55,
    clearcoatRoughness: 0.12, envMapIntensity: 1.3, name: 'tongue',
  }))
  const gumM = M.pbr(0x9c6a70, 'skin', flat({ roughness: 0.81, name: 'gum' }))
  const padM = M.pbr(pal.NOSE_BLACK, 'rubber', flat({
    mapOpts: { repeat: rep(1.2, 1.0) }, roughness: 0.90, normalScale: 1.3, name: 'pawPad',
  }))
  const clawM = M.pbr(0xb9b2a4, 'horn', flat({ roughness: 1.0, clearcoat: 0.25, name: 'claw' }))
  // waxed cordura: the only *slightly* shiny cloth on the model. The weave is
  // in the NORMAL map only — visible relief, uniform pigment.
  // ROUND-3 blind material test: the coat, the cap, the pelvis and the bag all
  // used one lumpy shader with a hue swap, so a stranger could name two
  // materials and not four. The bag now separates by RESPONSE, not tint — a
  // genuinely tighter, glossier waxed-canvas lobe (roughness 0.66, clearcoat
  // 0.40) sitting on a value five stops under the coat.
  const bagM = M.pbr(pal.SATCHEL_DARK, 'cloth', flat({
    mapOpts: { ...CLOTH }, roughness: 0.66, normalScale: 1.15,
    clearcoat: 0.40, clearcoatRoughness: 0.34, envMapIntensity: 1.2, name: 'satchel',
  }))
  // scuffed leather: a genuinely TIGHTER lobe than the cordura next to it, so
  // the base panel and the corner caps separate from the bag body under light
  // even though they are within a stop of the same value.
  const bagLeatherM = M.pbr(0x35302b, 'leather', flat({
    mapOpts: { ...HIDE }, roughness: 0.74, clearcoat: 0.46, clearcoatRoughness: 0.28,
    normalScale: 1.1, envMapIntensity: 1.25, name: 'bagCorner',
  }))
  // tight flat weave — normalScale 1.5 so the diagonal rib still reads at 1 m
  const webM = M.pbr(pal.SATCHEL_DARK, 'cloth', flat({
    mapOpts: { ...CLOTH, repeat: rep(0.55, 1.5) }, sheen: 0.22, roughness: 1.0,
    normalScale: 1.5, name: 'webbing',
  }))
  const metalM = M.pbr(pal.METAL, 'metal', flat({
    roughness: 1.0, envMapIntensity: 1.5, name: 'hardware',
  }))
  // §6.4 retroreflective approximation: hi-vis piping is glossy plastic PLUS a
  // constant emissive lift, so it blazes toward the camera and stays a value
  // event at distance. Modest in costume 0; in NIGHT SHIFT it does the work.
  const hiVisM = M.pbr(pal.HI_VIS, 'plastic-gloss', flat({
    roughness: 1.0, envMapIntensity: 1.4,
    emissive: pal.HI_VIS, emissiveIntensity: night ? 0.9 : 0.32, name: 'hiVis',
  }))
  const CAP = { ...CLOTH, repeat: rep(2.4, 1.5) }
  const SHOE = { ...CLOTH, repeat: rep(3.0, 1.5) }
  // the cap is the model's THIRD nameable response: smooth technical cotton
  // with a clean narrow specular edge along every seam welt. Low roughness, low
  // relief, a touch of clearcoat — the opposite end of the scale from the coat.
  const capRedM = M.pbr(pal.SIGNAL_RED, 'cloth', flat({
    mapOpts: CAP, sheen: 0.24, roughness: 0.54, clearcoat: 0.22,
    clearcoatRoughness: 0.30, normalScale: 0.7, envMapIntensity: 1.1, name: 'capPanel',
  }))
  const capCreamM = M.pbr(pal.CREAM, 'cloth', flat({
    mapOpts: CAP, sheen: 0.24, roughness: 0.54, clearcoat: 0.22,
    clearcoatRoughness: 0.30, normalScale: 0.7, envMapIntensity: 1.1, name: 'capSide',
  }))
  // a stiffened brim has LESS surface break-up than the crown — that difference
  // is the whole reason it reads as stiffened rather than as more hat.
  const brimM = M.pbr(pal.SATCHEL_DARK, 'cloth', flat({
    mapOpts: CAP, normalScale: 0.35, roughness: 0.46, clearcoat: 0.30,
    clearcoatRoughness: 0.24, envMapIntensity: 1.2, name: 'brim',
  }))
  const shoeM = M.pbr(pal.CREAM, 'cloth', flat({ mapOpts: SHOE, roughness: 1.0, name: 'shoeUpper' }))
  const soleM = M.pbr(0x33363d, 'rubber', flat({
    mapOpts: { repeat: rep(0.9, 1.0) }, roughness: 0.85, normalScale: 1.2, name: 'sole',
  }))
  const paperM = M.pbr(pal.PAPER, 'paper', flat({ mapOpts: { repeat: rep(1.2, 1.0) }, name: 'parcel' }))
  const bandM = M.pbr(pal.SATCHEL_DARK, 'rubber', flat({ roughness: 0.88, name: 'wristband' }))
  const labelM = M.pbr(WHITE, 'paper', painted(labelTexture(), { name: 'shipLabel' }))
  const ledM = night ? M.emissive(LED_CYAN, 2.4) : null

  // Tessellation dial. He is the lightest fighter and he should also be the
  // cheapest: <= 26k triangles for the whole model, props and costume included.
  // One place to turn it rather than sixty literals scattered through the build.
  const SE = (rx, ry, rz, e, eZ, seg) =>
    superellipsoid(rx, ry, rz, e, eZ, Math.max(8, Math.round(seg * 0.56)))
  const JB = (r, seg) => jointBall(r, Math.max(8, Math.round(seg * 0.58)))
  const LENS = (rx, ry, t, o = {}) =>
    lens(rx, ry, t, { ...o, faceSeg: 1, rimSeg: 1, seg: Math.max(6, Math.round((o.seg || 12) * 0.58)) })
  // eyeballs: two nested spheres per eye is 4 spheres, and at 18 segments that
  // was 1.8k triangles for something 20 px across. 12 is still perfectly round
  // at the size it is ever seen.
  const EYE = (r) => ball(r, 12)

  // a static container per bone: everything rigid under one bone is merged by
  // material at the end of the build, which is where the draw-call budget comes
  // from. Nested bones and toggled props never go inside one.
  const statics = []
  const stat = (boneNode) => {
    const g = new THREE.Group()
    g.name = 'static'
    boneNode.add(g)
    statics.push(g)
    return g
  }

  // --- hips — croup + loin, the mass anchor of the whole character ----------
  // Local y = world y - 0.780. Croup top 0.858, hip width across the croup
  // 0.290, waist 0.235 (0.73 x the chest). The loin block deliberately
  // overlaps BOTH the croup and the ribcage so the underline is one unbroken
  // concave sweep instead of two spheres meeting at a visible seam.
  const hips = pivot(group, 0, 0.78, 0)
  bones.hips = hips
  const hipS = stat(hips)
  hipS.add(mesh(SE(0.150, 0.106, 0.145, 3.0, 3.0, 20), coatM, -0.080, -0.028, 0))
  // THE TUCK-UP, and it is a §2.2 number, not a taste call: waist width 0.235
  // against a 0.320 chest is 0.73x, and the round-3 review measured the waist
  // as WIDE AS THE CHEST with the belt region bulging — a pear, not a sprinter.
  // 0.104 half-width = 0.208 of actual coat, and the two masses either side of
  // it (croup 0.290, ribcage 0.320) then read as a genuine concave bite.
  hipS.add(mesh(SE(0.132, 0.080, 0.104, 3.0, 3.0, 20), coatM, -0.015, 0.098, 0))
  // A LOIN BRIDGE, because the alternative is what was here before: a croup
  // block, a loin block and a ribcage stacked with hard horizontal seams
  // between them, reading as three boxes. This one overlaps both neighbours by
  // more than a bevel width, so the whole underline from brisket to croup is a
  // single unbroken concave sweep.
  hipS.add(mesh(SE(0.116, 0.090, 0.098, 3.0, 3.0, 18), coatM, 0.040, 0.132, 0))
  // The cream underside is the VALUE cue that backs up the tuck-up notch — the
  // notch itself is only a 3-6 px concavity at 128 px and cannot carry itself.
  // It used to be a bright CREAM box sitting between the thighs, which reads as
  // a nappy from every angle: too wide, too light, and squared off. It is now a
  // narrow CREAM_SHADE underline riding the belly, i.e. cream IN OCCLUSION,
  // which is what the underside of a dog actually is.
  // narrowed from 0.136 m wide to 0.096 and dropped onto the ventral line: at
  // its old size, in CREAM_SHADE, between two thighs, it read as a nappy from
  // every angle. It is the value backup for the tuck-up notch, so it has to be
  // a thin ventral strip and nothing more.
  hipS.add(mesh(SE(0.100, 0.026, 0.048, 3.0, 3.0, 16), creamDarkM, 0.068, 0.070, 0))
  // hip joint balls, on the PARENT bone: a sphere has no orientation, so the
  // thigh can never open a gap at the pivot however far the clip swings it.
  // 0.064 at z +-0.130 made the pelvis 0.388 m wide — wider than the CHEST, and
  // the single biggest contributor to the pear read. 0.052 at +-0.124 keeps the
  // gap closed and keeps the widest point of the figure at the shoulders.
  for (const s of [1, -1]) hipS.add(mesh(JB(0.056, 14), coatM, 0, -0.020, 0.128 * s))

  // --- tail — the character's motion read -----------------------------------
  // Bright white tip, dark ring, dark brush: a 2.6 px moving dot at 128 px, and
  // the only thing on the model that is never still. Carriage sits +18 deg off
  // the 26 deg croup line; the base rotation is baked into a bent() wrapper so
  // the `tail` BONE stays at (0,0,0) and all 31 clips' rotation tracks are
  // unaffected.
  const tail = pivot(hips, -0.22, 0.08, 0)
  bones.tail = tail
  const tailW = bent(tail, 1.75)
  const tailS = stat(tailW)
  // Thickness: 0.048 m across at the root (0.024 radius was a licorice whip
  // against a 0.290 m croup) tapering to 0.026 at the tip, PLUS 0.030 m of
  // brush on the underside only. "Carrying a good brush" is a silhouette
  // statement, and a thin tail on a heavy croup reads as a rat's.
  const tailPath = [[0, 0, 0], [0.014, 0.12, 0], [-0.010, 0.27, 0], [0.006, 0.40, 0]]
  tailS.add(mesh(splineTube(tailPath, 0.036, 14, (t) => 0.036 - 0.012 * t,
    { radialSeg: 9, roundEnd: true }), limbM))
  // the brush: 0.030 m of extra hair on the UNDERSIDE only, so the tail's
  // silhouette is asymmetric and heavier below — that is what "a good brush"
  // looks like and it costs almost nothing.
  tailS.add(mesh(splineTube(tailPath.map((p) => [p[0] - 0.019, p[1], p[2]]), 0.026, 14,
    (t) => 0.026 - 0.013 * t, { radialSeg: 7, roundEnd: true }), coarseM))
  // the root patch is one of the model's dark anchors — 0.075 m of solid
  // MASK_BLACK where the tail leaves the croup, which is also what stops the
  // tail reading as a rod stuck onto a pale rump.
  tailS.add(mesh(taperedCapsule(0.044, 0.038, 0.075, 3, 12), darkM, 0.002, 0.044, 0)) // root patch
  tailS.add(mesh(taperedCapsule(0.028, 0.027, 0.016, 2, 12), darkM, 0.004, 0.360, 0)) // dark ring
  // THE MOTION READ, rebuilt. The terminal 0.040 m is clean unspeckled CREAM on
  // its OWN material (tipM), because the shared cream map carries a root-shadow
  // ramp that was eating the whole tip and turning the brief's white dot into a
  // faintly-paler-grey rod. It is now 0.056 m across against a 0.052 m tail, so
  // it is a genuine BULB on a dark collar on a dark tail: a solid 2.7 px bright
  // blob at 128 px tracing a 0.6 rad arc in all 31 clips, and the only cue on
  // the model that does not exist in a still frame.
  tailS.add(mesh(taperedCapsule(0.028, 0.020, 0.040, 3, 12), tipM, 0.005, 0.396, 0))

  // --- legs — the digitigrade zigzag ---------------------------------------
  // hip 0.760 -> stifle 0.400 -> hock 0.185 -> ball 0.030 -> ground, with the
  // stifle 0.055 FORWARD of the hip and the hock 0.070 BACK of the stifle. The
  // two background voids that zigzag opens are the second-strongest silhouette
  // cue on the body; a straight cylinder leg loses both.
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.02, 0.13 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    const S = stat(leg)
    // femur: broad at the top, tapering to the stifle, leaning forward 8.7 deg
    S.add(mesh(taperedCapsule(0.0575, 0.042, 0.290, 3, 12), limbM, 0.020, -0.175, 0, 0, 0, 0.150))
    S.add(mesh(SE(0.042, 0.100, 0.046, 3.0, 3.0, 14), limbM, 0.055, -0.130, 0)) // quadriceps
    // breeching — longer hair on the caudal thigh. A real breed trait, and one
    // of only four pieces of fur GEOMETRY on the whole model (§6.2 g).
    S.add(mesh(taperedBox(0.072, 0.118, 0.040, 0.090, 0.170, 0.026, { rim: 0.018, cornerSeg: 2 }),
      coarseM, -0.050, -0.118, 0, 0, 0, -0.10))
    // THE STIFLE. What was here was a thigh capsule whose flat end cut a hard
    // curved line straight across the front of the shin at mid-shin — two
    // primitives passing through each other with no knee form and no overlap
    // collar. Three things fix it and all three are cheap:
    //   1. a MODELLED patella/stifle mass on the thigh, in the same TAN as the
    //      gaskin below it, so there is no material boundary at the joint line;
    //   2. a joint ball big enough (0.050) to swallow both capsule ends at any
    //      clip angle, also in tan;
    //   3. a sleeve() collar on the SHIN side that overlaps back up past the
    //      ball, so the two bones share surface instead of abutting.
    S.add(mesh(SE(0.034, 0.056, 0.046, 3.0, 3.0, 14), tanM, 0.052, -0.316, 0))
    S.add(mesh(JB(0.050, 16), tanM, 0.050, -0.358, 0)) // stifle, closes leg->shin

    const shin = pivot(leg, 0, -0.36, 0)
    bones[side === 1 ? 'shinL' : 'shinR'] = shin
    const H = stat(shin)
    H.add(mesh(sleeve(0.050, 0.044, 0.040, { radialSeg: 12, lengthSeg: 2, bulge: 0.14 }), tanM, 0.044, 0.006, 0, 0, 0, -0.303))
    // tibia / gaskin: stifle (x +0.052) back and down to the hock (x -0.015)
    H.add(mesh(taperedCapsule(0.045, 0.023, 0.172, 3, 12), tanM, 0.019, -0.108, 0, 0, 0, -0.303))
    H.add(mesh(JB(0.028, 14), tanM, -0.015, -0.215, 0)) // hock, well let down
    // hock collar — kills the bare circular socket seam where the gaskin used
    // to plug straight into the metatarsus.
    H.add(mesh(sleeve(0.029, 0.026, 0.030, { radialSeg: 10, lengthSeg: 2, bulge: 0.16 }), tanM,
      -0.010, -0.238, 0, 0, 0, 0.501))
    // metatarsus: hock forward and down to the ball of the foot
    H.add(mesh(taperedCapsule(0.025, 0.028, 0.128, 3, 10), tanM, 0.028, -0.292, 0, 0, 0, 0.501))
    // cream sock over the ankle, sleeving the metatarsus into the shoe
    H.add(mesh(sleeve(0.032, 0.038, 0.048, { radialSeg: 10, lengthSeg: 2, bulge: 0.10 }), creamM,
      0.030, -0.330, 0, 0, 0, 0.501))
    // courier sneaker: sole 0.185 x 0.082, 12 deg toe spring, a SHORT rear cuff
    // and no heel counter — the dog's heel is the hock, 0.185 m up. A full human
    // shoe here is what makes anthro dogs read as people in costume.
    H.add(mesh(taperedBox(0.185, 0.082, 0.176, 0.076, 0.026, 0.010, { rim: 0.008, cornerSeg: 2 }),
      soleM, 0.060, -0.3825, 0))
    H.add(mesh(roundedBox(0.176, 0.010, 0.086, 0.004, 1), hiVisM, 0.060, -0.3665, 0)) // midsole stripe
    H.add(mesh(taperedBox(0.150, 0.078, 0.098, 0.060, 0.068, 0.016, { rim: 0.012, cornerSeg: 2 }),
      shoeM, 0.048, -0.336, 0))
    H.add(mesh(SE(0.036, 0.026, 0.038, 3.2, 3.2, 12), soleM, 0.120, -0.352, 0)) // rubber toe cap
    // §6.1 puts the toe cap on rubber with the sole and the cuff on stiffened
    // cloth with the cap's brim — which is both correct and one material and two
    // draw calls cheaper than the dedicated shoe-dark it used to have.
    H.add(mesh(SE(0.024, 0.030, 0.040, 3.2, 3.2, 12), brimM, -0.022, -0.330, 0)) // short rear cuff
    H.add(mesh(roundedBox(0.070, 0.008, 0.012, 0.003, 1), hiVisM, 0.058, -0.302, 0)) // the single lace
    for (let l = 0; l < 6; l++) { // modelled lugs, forefoot worn flatter
      const lx = 0.000 + (l % 3) * 0.058, lz = (Math.floor(l / 3) - 0.5) * 0.044
      H.add(mesh(roundedBox(0.038, l % 3 === 2 ? 0.004 : 0.006, 0.030, 0.002, 1),
        soleM, lx, -0.3975, lz))
    }
    if (side === -1) { // hi-vis ankle band: ONE leg, the chain side, like a rider
      H.add(mesh(filletRing(0.030, 0.006, 5, 12), hiVisM, 0.006, -0.286, 0, 0, 0, 0.501))
      H.add(mesh(roundedBox(0.034, 0.005, 0.018, 0.002, 1), hiVisM, 0.030, -0.276, 0.026, 0, 0.38, 0.20))
    }
  }

  // --- torso ---------------------------------------------------------------
  // Local y = world y - 0.880. ONE bevelled ellipsoid for the ribcage
  // (0.400 X x 0.340 Y x 0.320 Z at world (0.010, 1.090, 0)) instead of the two
  // intersecting spheres this file used to have — that seam was visible from
  // every angle. Rib section 1.25:1 depth:width — well sprung, not barrel.
  const torso = pivot(hips, 0, 0.1, 0)
  bones.torso = torso
  const torS = stat(torso)
  torS.add(mesh(SE(0.200, 0.168, 0.160, 2.8, 2.6, 24), coatM, 0.010, 0.212, 0))
  // withers + trapezius: the top of the scapula at world 1.322
  torS.add(mesh(SE(0.128, 0.074, 0.124, 3.0, 3.0, 18), coatM, -0.030, 0.388, 0))
  // neck: a frustum running forward-DOWN at 38 deg, thick but free from
  // throatiness — the taut underline is what preserves the jaw-chest wedge.
  torS.add(mesh(roundedCone(0.0925, 0.076, 0.150, 0.020, 18, 2), coatM,
    0.068, 0.423, 0, 0, 0, -0.581))
  torS.add(mesh(JB(0.082, 14), coatM, 0.020, 0.352, 0)) // neck root, closes the seam
  // neck crest — 0.010 m of longer hair along the top line (fur geometry #4)
  torS.add(mesh(taperedBox(0.026, 0.060, 0.018, 0.044, 0.150, 0.010, { rim: 0.008, cornerSeg: 2 }),
    coarseM, 0.038, 0.470, 0, 0, 0, -0.581))
  // scapular spine: a 0.010 m ridge from the withers down-forward at 52 deg.
  // It is what makes the shoulder read as a shoulder when the arm lifts, and it
  // is the landmark the satchel strap crosses.
  for (const s of [1, -1]) {
    torS.add(mesh(taperedBox(0.020, 0.130, 0.014, 0.090, 0.020, 0.007, { rim: 0.006, cornerSeg: 2 }),
      limbM, 0.010, 0.372, 0.112 * s, 0, 0, 0.90))
    torS.add(mesh(JB(0.052, 14), limbM, 0.02, 0.38, 0.155 * s)) // shoulder
    // THE ARM-TO-CHEST FILLET. Round 3: "the shoulder capsules plunge into the
    // chest ovoid along hard boolean intersection lines with no fillet." A ball
    // on the pivot closes the GAP but it does nothing about the intersection
    // CURVE, which is a hard crease wherever two convex primitives meet. So:
    //   * a deltoid-root mass that spans from the ribcage surface out past the
    //     shoulder ball, giving the two forms a shared surface to sit in;
    //   * a real fillet torus on the joint circle itself, axis along Z, whose
    //     tube radius (0.014) is larger than any crease the intersection can
    //     produce — the crease is inside the fillet and never reaches daylight.
    torS.add(mesh(SE(0.072, 0.088, 0.070, 3.0, 3.0, 11), limbM, 0.012, 0.362, 0.126 * s))
    torS.add(mesh(filletRing(0.052, 0.015, 5, 12), limbM, 0.020, 0.380, 0.148 * s, 1.5708, 0, 0))
  }
  // cream blaze: throat to chest. CREAM (Y 0.775) against COAT_BLUE (Y 0.242)
  // is 3.2:1 between the two largest areas on the model — that step is what
  // carries the body at 128 px.
  torS.add(mesh(SE(0.078, 0.150, 0.112, 2.8, 2.8, 18), creamM, 0.140, 0.222, 0))
  torS.add(mesh(SE(0.056, 0.076, 0.070, 3.0, 3.0, 14), creamM, 0.112, 0.342, 0))
  torS.add(mesh(SE(0.150, 0.062, 0.108, 3.0, 3.0, 16), creamDarkM, 0.030, 0.062, 0)) // brisket

  // --- the crossbody satchel's strap ---------------------------------------
  // Parented to TORSO, not to `pack`: the strap is a constraint on the bag, not
  // a child of it — on `pack` it swings off the shoulder the first time the bag
  // bounces. Swept as a 0.055 x 0.010 ribbon along a 7-point spline whose BOTH
  // endpoints land on the bag, with ~35 deg of twist baked into the frames.
  const strapPts = [
    [-0.185, 0.408, 0.150], [-0.020, 0.455, -0.110], [0.110, 0.390, -0.130],
    [0.185, 0.235, -0.010], [0.120, 0.165, 0.115], [-0.020, 0.140, 0.150],
    [-0.185, 0.160, 0.150],
  ]
  //
  // THE COMPRESSION. A strap that crosses a chest as a floating dark line is
  // the tell that the bag is a sticker. Real webbing under load does two
  // things, and both are modelled here:
  //   (a) it SINKS. Every spline point is pulled 0.009 m in along the torso's
  //       own surface normal (0.013 at the shoulder crest, where the load
  //       actually bears across the first rib and the acromion), so the ribbon
  //       runs in a groove instead of on top of the coat.
  //   (b) the coat PUFFS along both margins. Two coarse-fur rolls run the whole
  //       path at +-0.034 m across the strap and 0.006 m proud, so the groove
  //       has two lit edges and reads as a channel from any angle.
  const rib = [0.010, 0.212, 0]
  const nrm = (p) => {
    const n = [p[0] - rib[0], p[1] - rib[1], p[2] - rib[2]]
    const L = Math.hypot(n[0], n[1], n[2]) || 1
    return [n[0] / L, n[1] / L, n[2] / L]
  }
  // across-the-strap direction: tangent x normal, in the surface plane
  const across = (pts, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const n = nrm(pts[i])
    const s = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]
    const L = Math.hypot(s[0], s[1], s[2]) || 1
    return [s[0] / L, s[1] / L, s[2] / L]
  }
  const shifted = (pts, side, lift) => pts.map((p, i) => {
    const s = across(pts, i), n = nrm(p)
    // deepen the groove over the shoulder crest (the two rear-most points)
    const d = i <= 1 ? 0.013 : 0.009
    return [p[0] + s[0] * side + n[0] * (lift - d), p[1] + s[1] * side + n[1] * (lift - d),
      p[2] + s[2] * side + n[2] * (lift - d)]
  })
  torS.add(mesh(splineTube(shifted(strapPts, 0, 0), 0.006, 26, null,
    { radialSeg: 7, aspect: 4.6, twist: 0.61, roundStart: true, roundEnd: true }), webM))
  //   (c) THE CONTACT SHADOW, and this is what the round-3 review was actually
  //       missing when it called the strap "a grey ribbed tube sitting on top of
  //       the surface". A modelled groove is invisible under a broad key unless
  //       something dark occupies its floor: real ambient occlusion in a trench
  //       0.008 m deep on a 0.055 m span is worth about one stop, and nothing in
  //       our lighting path bakes that. So two near-black cords run the entire
  //       strap path at +-0.027 (i.e. just inboard of the webbing's own edge),
  //       sunk 0.014 m — deeper than the strap itself — so from every angle the
  //       webbing has a dark line on BOTH sides of it and reads as a channel cut
  //       into the coat rather than a ribbon laid on it.
  for (const s of [1, -1]) {
    torS.add(mesh(splineTube(shifted(strapPts, 0.027 * s, -0.005), 0.0042, 18,
      (t) => 0.0042 * (0.75 + 0.45 * Math.sin(t * 3.14159)), { radialSeg: 4, aspect: 1.5 }), darkM))
  }
  for (const s of [1, -1]) {
    torS.add(mesh(splineTube(shifted(strapPts, 0.036 * s, 0.016), 0.0065, 26,
      (t) => 0.0065 * (0.7 + 0.5 * Math.sin(t * 3.14159)), { radialSeg: 5, aspect: 1.7 }), coarseM))
  }
  // four tension folds in the cream chest fur, radiating from the sternum
  // crossing at 20 / 55 / -25 / -60 deg. This is what a LOADED strap does to a
  // chest, and it is what tells the eye the bag has weight in it.
  for (const ang of [0.35, 0.96, -0.44, -1.05]) {
    const o = [0.185, 0.235, -0.010]
    const L = 0.030 + Math.abs(ang) * 0.026
    torS.add(mesh(splineTube([[o[0] - 0.004, o[1], o[2]],
      [o[0] - 0.010, o[1] + Math.sin(ang) * L * 0.6, o[2] + Math.cos(ang) * L * 0.6],
      [o[0] - 0.020, o[1] + Math.sin(ang) * L, o[2] + Math.cos(ang) * L]],
    0.0032, 5, (t) => 0.0032 * (1 - t * 0.8), { radialSeg: 4, aspect: 1.5 }), creamDarkM))
  }
  // shoulder pad over the RIGHT trapezius (opposite the bag) — this is where the
  // load actually bears, bridging the first rib and the acromion, and it is the
  // anti-clipping insurance when armR lifts.
  torS.add(mesh(taperedBox(0.170, 0.078, 0.150, 0.066, 0.014, 0.006, { rim: 0.005, cornerSeg: 2 }),
    webM, 0.040, 0.436, -0.118, 0, 0, 0.10))
  for (const s of [1, -1]) {
    torS.add(mesh(roundedBox(0.150, 0.012, 0.010, 0.003, 1), hiVisM, 0.040, 0.444, -0.118 + 0.032 * s))
  }
  // a keeper on the main strap where the stabiliser branches off it — proof
  // that the two webbings are separate objects rather than one painted line
  torS.add(mesh(roundedBox(0.014, 0.030, 0.062, 0.004, 1), webM, 0.176, 0.212, 0.012, 0, 0, 0.42))
  // cam-lock buckle at the right pectoral, with a modelled lever
  torS.add(mesh(roundedBox(0.048, 0.030, 0.014, 0.004, 2), metalM, 0.192, 0.235, -0.010, 0, 0, 0.5))
  torS.add(mesh(roundedBox(0.030, 0.008, 0.010, 0.003, 1), metalM, 0.200, 0.252, -0.010, 0, 0, 0.5))
  // stabiliser strap — the detail that says "this person actually rides": it
  // runs under the left armpit and leaves a 0.020 m slot of clean background.
  torS.add(mesh(splineTube([[0.170, 0.222, 0.024], [0.132, 0.178, 0.132],
    [0.020, 0.148, 0.184], [-0.176, 0.152, 0.172]], 0.005, 20, null,
  { radialSeg: 6, aspect: 3.4, roundStart: true, roundEnd: true }), webM))
  torS.add(mesh(roundedBox(0.020, 0.026, 0.012, 0.003, 1), metalM, 0.164, 0.212, 0.052))
  // whistle + carabiner, moved OFF the sternum midline. Sitting dead centre on
  // the chest ovoid at 0.024 m long, the whistle was the "small brown nub near
  // the centre that reads as a wart" the review found; hung off the cam lock's
  // outboard face it reads as what it is — a thing clipped to a strap.
  torS.add(mesh(taperedCapsule(0.010, 0.008, 0.024, 3, 10), metalM, 0.196, 0.188, -0.052, 0, 0, 0.32))
  torS.add(mesh(filletRing(0.013, 0.0035, 5, 10), metalM, 0.194, 0.208, -0.052, 1.4, 0, 0))

  // --- the satchel (bone `pack`) -------------------------------------------
  // pack-local = world - (-0.26, 1.220, 0). The bag body's inner face sits
  // 0.006 m INSIDE the ribcage's rear surface (x -0.172 at this height) so it
  // wraps the back instead of floating off it, and its flat top edge is the
  // hard manufactured straight line that breaks the rear silhouette by 10 px.
  const pack = pivot(torso, -0.26, 0.34, 0)
  bones.pack = pack
  const packS = stat(pack)
  packS.add(mesh(roundedBox(0.130, 0.260, 0.300, 0.014, 2), bagM, 0.017, -0.060, 0.055))
  packS.add(mesh(roundedBox(0.130, 0.022, 0.300, 0.010, 1), bagLeatherM, 0.017, -0.182, 0.055))
  for (const sx of [1, -1]) for (const sz of [1, -1]) { // scuffed corner caps
    packS.add(mesh(roundedBox(0.040, 0.040, 0.040, 0.012, 1), bagLeatherM,
      0.017 + 0.048 * sx, -0.176, 0.055 + 0.132 * sz))
  }
  //
  // THE CONTACT FACE. A satchel that hangs clear of the back is THE failure
  // mode for this prop, and a flat inner face on a curved ribcage gaps by ~0.02
  // m at the bag's Z edges however carefully its centre is placed. So the inner
  // shell is built by OFFSETTING THE TORSO SURFACE: for each Z station the
  // ribcage ellipsoid (rx 0.200, rz 0.160, centred torso-local (0.010, 0.212))
  // is solved at the bag's centre height and the slat runs from the bag body
  // out to 0.006 m INSIDE that surface. The bag now wraps the flank instead of
  // sitting on a tangent plane touching it at one point.
  for (const bz of [-0.075, -0.015, 0.045, 0.105]) {
    // bag centre (torso-local y 0.280) against the ribcage centre (0.212)
    const dy = 0.068
    const k = 1 - (bz / 0.160) ** 2 - (dy / 0.168) ** 2
    if (k <= 0.02) break
    const surfX = 0.010 - 0.200 * Math.sqrt(k) + 0.26   // pack-local
    const depth = Math.max(0.014, surfX - 0.082 + 0.014)
    packS.add(mesh(roundedBox(depth, 0.244, 0.064, 0.010, 1), bagM,
      0.082 + depth * 0.5 - 0.008, -0.060, bz))
  }
  //
  // THE FLAP is one unbroken shell, not a lid resting on an open crate: a top
  // panel, a real 0.016 m rolled corner tube running the full 0.312 m of Z, and
  // a face panel hanging 0.150 m down the outer side with its hem corners cut
  // at 28 deg so the sweep is hexagonal rather than a rectangle. Its top edge
  // is the hard straight MANUFACTURED line that breaks the rear silhouette by
  // 0.136 m — a straight line on an all-organic body is the cheapest "this
  // creature has a job" cue there is, so it stays dead straight and horizontal.
  packS.add(mesh(roundedBox(0.150, 0.016, 0.312, 0.006, 2), bagM, 0.019, 0.078, 0.055))
  packS.add(mesh(splineTube([[-0.050, 0.070, -0.101], [-0.050, 0.070, 0.211]], 0.016, 2, null,
    { radialSeg: 10 }), bagM)) // the rolled top-outer corner
  packS.add(mesh(roundedBox(0.014, 0.104, 0.312, 0.006, 2), bagM, -0.056, 0.014, 0.055))
  packS.add(mesh(taperedBox(0.014, 0.312, 0.014, 0.232, 0.052, 0.006, { rim: 0.005, cornerSeg: 2 }),
    bagM, -0.056, -0.064, 0.055, 0, 0, 3.1416)) // hem, corners cut at 28 deg
  packS.add(mesh(roundedBox(0.016, 0.014, 0.240, 0.005, 1), hiVisM, -0.058, -0.090, 0.055)) // hem piping
  for (const sz of [1, -1]) { // the piping turns the 28 deg corner with the hem
    packS.add(mesh(roundedBox(0.016, 0.013, 0.062, 0.005, 1), hiVisM,
      -0.058, -0.076, 0.055 + 0.144 * sz, 0.50 * sz, 0, 0))
  }
  packS.add(mesh(roundedBox(0.004, 0.055, 0.055, 0.001, 1), labelM, -0.065, 0.008, 0.055)) // the 404
  for (const sz of [1, -1]) { // flap cam locks on webbing tails, one a notch tighter
    packS.add(mesh(roundedBox(0.008, 0.030, 0.024, 0.003, 1), webM, -0.060, -0.056, 0.055 + 0.086 * sz))
    packS.add(mesh(roundedBox(0.011, 0.022, 0.028, 0.003, 1), metalM,
      -0.065, -0.076 + (sz > 0 ? 0.004 : 0), 0.055 + 0.086 * sz))
    packS.add(mesh(filletRing(0.015, 0.005, 5, 10), metalM, 0.074, sz > 0 ? 0.062 : -0.176, 0.150, 0, 0, 1.57))
  }
  // contents: the bag is not empty, so the flap is not a plane. The box corner
  // pushing the flap out is the PARCEL — the one he throws — riding where a
  // courier actually keeps it, rather than welded to a paw it is not in for 29
  // of the 31 clips (§7.7).
  packS.add(mesh(roundedBox(0.070, 0.090, 0.090, 0.008, 1), paperM, 0.030, 0.020, 0.115))
  packS.add(mesh(taperedCapsule(0.030, 0.030, 0.040, 3, 10), bagLeatherM, 0.030, 0.030, -0.030, 1.57, 0, 0))

  // --- arms ----------------------------------------------------------------
  // Shoulder pivots move from z +-0.28 to +-0.155. A 0.56 m shoulder span on a
  // 1.70 m body was 0.33 H — wider than a heavyweight's, on the lightest
  // fighter in the roster. 0.396 m outside-deltoid to outside-deltoid = 0.233 H.
  // Arm:leg = 0.68 (the ape is > 1.0). He is a runner, not a knuckle-walker.
  for (const side of [1, -1]) {
    const arm = pivot(torso, 0.02, 0.38, 0.155 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    const A = stat(arm)
    A.add(mesh(SE(0.046, 0.058, 0.044, 3.0, 3.0, 14), limbM, 0, -0.012, 0)) // deltoid
    A.add(mesh(taperedCapsule(0.043, 0.033, 0.158, 3, 10), limbM, 0, -0.115, 0))
    A.add(mesh(JB(0.035, 12), limbM, 0, -0.230, 0)) // elbow, with an ulnar flare

    const fore = pivot(arm, 0, -0.23, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    const F = stat(fore)
    // upper forearm is speckled coat; from mid-forearm down (world y < 0.930)
    // the front and inner surfaces carry the tan point, on a hard ragged line.
    F.add(mesh(taperedCapsule(0.031, 0.029, 0.062, 3, 10), limbM, 0, -0.050, 0))
    F.add(mesh(taperedCapsule(0.029, 0.026, 0.078, 3, 10), tanM, 0, -0.152, 0))
    // wristband, which also sleeves the forearm->paw joint and kills the gap
    F.add(mesh(roundedCylinder(0.031, 0.046, 0.006, 14, 2), bandM, 0, -0.172, 0))
    F.add(mesh(roundedCylinder(0.032, 0.008, 0.003, 14, 1), hiVisM, 0, -0.194, 0))
    F.add(mesh(sleeve(0.030, 0.034, 0.028, { radialSeg: 10, lengthSeg: 2, bulge: 0.08 }), tanM, 0, -0.214, 0))
    // paw: a slightly wedge-shaped mitten with a flat striking front. FOUR toes,
    // not five — it is a dog — plus a dewclaw thumb so it is not an oven mitt.
    F.add(mesh(roundedBox(0.072, 0.062, 0.058, 0.010, 2), tanM, 0.008, -0.234, 0))
    for (let t = 0; t < 4; t++) {
      const tz = (t - 1.5) * 0.0145
      F.add(mesh(SE(0.011, 0.012, 0.006, 3.0, 3.0, 8), tanM, 0.044, -0.244, tz))
      F.add(mesh(LENS(0.006, 0.004, 0.005, { seg: 8 }), clawM, 0.052, -0.252, tz, 0, 1.35, 0))
      F.add(mesh(LENS(0.0085, 0.0085, 0.005, { seg: 10 }), padM, -0.026, -0.244, tz, 0, -1.57, 0))
    }
    F.add(mesh(SE(0.013, 0.014, 0.010, 3.0, 3.0, 10), tanM, 0.006, -0.216, -0.032 * side))
    F.add(mesh(LENS(0.005, 0.003, 0.004, { seg: 8 }), clawM, 0.014, -0.226, -0.038 * side, 0, 1.35, 0))
    F.add(mesh(LENS(0.018, 0.015, 0.006, { seg: 12 }), padM, -0.028, -0.230, 0, 0, -1.57, 0))
  }

  // --- head ----------------------------------------------------------------
  // head.x moves 0.04 -> 0.10: forward head carriage. The pivot lands at world
  // (0.10, 1.400, 0) and every number below is head-LOCAL (world y - 1.400).
  // Master pitch: the skull's top plane runs 16 deg nose-down, and the muzzle
  // bridge is PARALLEL to it 0.025 m below — "skull and muzzle on parallel
  // planes" is the one clause every dog head misses. Cranium:muzzle = 57:43,
  // which is simultaneously the anti-wolf and the anti-fox-muzzle check —
  // it is also what keeps this fighter from colliding with the roster's other dog.
  const head = pivot(torso, 0.10, 0.52, 0)
  bones.head = head
  const hd = stat(head)
  hd.add(mesh(SE(0.095, 0.0825, 0.093, 2.9, 2.9, 24), faceM, -0.010, 0.078, 0))
  hd.add(mesh(taperedBox(0.026, 0.108, 0.018, 0.084, 0.016, 0.006, { rim: 0.005, cornerSeg: 2 }),
    limbM, -0.070, 0.148, 0)) // occipital crest, 0.008 proud, catches the rim
  // Only the cranium carries the face map: the mask polygon's u/v were solved
  // against ITS parameterisation, and any other mesh taking the same texture
  // would land a random slice of the mask on itself. Everything else on the
  // skull takes plain speckled coat, or MASK_BLACK where the mask engulfs it.
  //
  // THE MASK IS NOW GEOMETRY AS WELL AS PIGMENT, and that is the round-3 fix.
  // §3.9 puts the mask in the coat map so it cannot slide when the face
  // deforms, and that is still where its OUTLINE lives — but the review could
  // not find an asymmetric mask in any of three shots, because a painted zone
  // solved against the cranium's uv only ever lands on the cranium, while the
  // masseter, the orbital cheek, the brow ridge and both lids are separate
  // meshes carrying their own maps. Half the masked side of the head was
  // therefore rendering speckled grey right through the middle of the mask.
  // `sideM` routes every one of those meshes on the +Z side to the flat matte
  // MASK_BLACK material, so the mask is a solid region of the model however the
  // uvs fall, and the -Z side stays genuinely clear — speckle right up to the
  // eye rim, tan pip intact. Do not "balance" it.
  for (const s of [1, -1]) {
    const masked = s === 1
    const sideM = masked ? darkM : limbM
    const sideFaceM = masked ? darkM : faceM
    // masseter lens: W_s reaches 0.205 at (+0.020, +0.008), no hamster cheek
    hd.add(mesh(SE(0.0375, 0.030, 0.0145, 3.0, 3.0, 12), sideM, 0.020, 0.008, 0.088 * s))
    // ORBITAL CHEEK. This exists so there is 0.036 m of skull OUTBOARD of the
    // eye's aperture centre (z 0.066 against W_s/2 = 0.1025). Without it the
    // apertures sit on the extreme lateral silhouette edge, which is
    // prey-animal placement: the eye reads as startled and glued on rather
    // than forward-set and alert. It also gives the lower lid something to sit
    // against instead of open air.
    hd.add(mesh(SE(0.042, 0.038, 0.022, 3.0, 3.0, 12), sideFaceM, 0.040, 0.046, 0.084 * s))
    // TEMPORAL SWEEP — the mask's rear extension, §3.9's last four vertices. On
    // the masked side it is a real dark plate riding the temporal hollow back
    // to the ear-base collar, so the mask does not stop at the orbit and read as
    // a spot; on the clear side the same mesh is speckled coat and just fills
    // the hollow. This is the shape that makes the head asymmetric at 64 px.
    hd.add(mesh(SE(0.052, 0.044, 0.016, 3.0, 3.0, 9), masked ? darkM : faceM,
      -0.024, 0.070, 0.082 * s))
  }
  // muzzle: a rounded RECTANGLE, not a cone — 0.098 wide at the base tapering
  // only 29% to 0.070, and "well filled in under the eyes". A muzzle that
  // pinches below the eye is the classic amateur dog head.
  //
  // The muzzle's zones are BUILT, not painted. Box UVs run 0..1 per face, so a
  // v-banded cream/tan zone in the muzzle texture lands a hard vertical seam
  // straight down the middle of the front plane — a pale fibrous half, a grey
  // half and a bar between them, dead centre on the most-looked-at 30 cm of the
  // whole character. The texture is now an unzoned fine tick and the cream
  // underside and tan jaw ride on their own geometry.
  // Length 0.115 along the axis, not 0.128: §3.5's 0.128 is stop (x +0.077) to
  // LEATHER TIP (x +0.205), and the last 0.013 of that is the nose planum
  // capping the end. Building the box to the full 0.128 pushed its front-top
  // corner to x +0.212 — 0.007 m THROUGH the nose leather — which is what made
  // the nose look like a badge lying on the muzzle's top face instead of a cap
  // on its front. Base centre solved from the bridge (+0.074) and ventral
  // (-0.022) heights at x +0.077, so the 16 deg pitch is inherited, not eyeballed.
  hd.add(mesh(taperedBox(0.096, 0.098, 0.072, 0.070, 0.115, 0.018, { rim: 0.014, cornerSeg: 3 }),
    muzzleM, 0.1323, 0.0102, 0, 0, 0, -1.850))
  // central bridge ridge, 0.003 proud: enough to split the highlight along the
  // muzzle, nowhere near enough to read as a keel.
  hd.add(mesh(taperedBox(0.006, 0.020, 0.005, 0.014, 0.096, 0.002, { rim: 0.002, cornerSeg: 2 }),
    muzzleM, 0.1385, 0.0605, 0, 0, 0, -1.850))
  // cream muzzle underside — a real slab hugging the ventral plane, offset
  // 0.040 perpendicular to the muzzle axis so it wraps the lower third.
  hd.add(mesh(taperedBox(0.026, 0.088, 0.022, 0.062, 0.108, 0.010, { rim: 0.008, cornerSeg: 2 }),
    creamM, 0.1213, -0.0283, 0, 0, 0, -1.850))
  hd.add(mesh(SE(0.032, 0.042, 0.052, 3.0, 3.0, 14), muzzleM, 0.068, 0.030, 0)) // fill-in
  // mandible: deliberately deep, and it thickens toward the BACK — 0.135 m at
  // the jaw angle vs 0.000 at the chin point. A jaw that tapers rearward is the
  // second classic dog-head error. This band is 38% of the head silhouette.
  // The box's axis is the mandible's VENTRAL border — the line from the jaw
  // angle (+0.010, -0.155) to the chin point — and its mass is offset 0.050
  // perpendicular so the lowest silhouette point lands exactly on -0.155 and
  // not 0.05 m below it. That landmark, not the chin, is the bottom of the head.
  hd.add(mesh(taperedBox(0.100, 0.100, 0.030, 0.062, 0.216, 0.022, { rim: 0.016, cornerSeg: 3 }),
    muzzleM, 0.072, -0.053, 0, 0, 0, -0.983))
  //
  // THE CHEEK PADS, cut down by two thirds. What was here measured 0.104 (X) x
  // 0.088 (Y) x 0.092 (Z) — the size of the whole muzzle — sat proud of the jaw
  // with a hard unblended boundary, and at the old TAN_POINT saturation it was
  // the loudest thing on the character. The review read them as chipmunk
  // pouches or earmuffs, and it inverted the hierarchy: tan points are a 1 m
  // hue cue, never an identity cue. §3.1's masseter lens is 0.075 x 0.060 x
  // 0.010, so this is a LENS lying on the mandible surface at 0.072 x 0.048 x
  // 0.032, tucked inside the jaw's own Z half-width so it blends instead of
  // butting, and on the new desaturated TAN_POINT.
  for (const s of [1, -1]) { // tan jaw point — a HUE cue, not a value one
    hd.add(mesh(SE(0.036, 0.024, 0.016, 3.0, 3.0, 12), tanM, 0.052, -0.040, 0.050 * s))
    // whisker bed: the follicle dimples are a normal-map job (§6.5.2), but the
    // pad they sit on is a real 0.004 m swell — it is what catches the grazing
    // light and tells you the muzzle has a surface at 30 cm.
    hd.add(mesh(SE(0.030, 0.016, 0.010, 3.0, 3.0, 10), muzzleM, 0.148, 0.006, 0.032 * s))
  }
  hd.add(mesh(SE(0.062, 0.048, 0.068, 3.0, 3.0, 14), creamM, -0.020, -0.062, 0)) // throat
  hd.add(mesh(SE(0.058, 0.030, 0.050, 3.0, 3.0, 12), creamM, 0.062, -0.088, 0))  // cream underjaw
  //
  // NOSE LEATHER. Rebuilt from §3.6 as an assembly, because a single blob is
  // what makes a nose read as a plastic badge glued to the top of a cube:
  //   - a planum 0.048 (Z) x 0.032 (Y) whose FRONT face is near vertical and
  //     projects 0.013 m past the muzzle's front plane, ending at head-local
  //     x +0.205 = the character's forward-most point;
  //   - a distinct TOP plane at 32 deg below horizontal, a separate solid, so
  //     the edge between the two planes is a real 0.004 m bevel — that hard
  //     little bevel is the entire difference between "leather" and "sphere";
  //   - comma nostrils with 0.008 m of real depth opening LATERALLY, each with
  //     an alar groove running down and back to the lip;
  //   - a philtrum groove 0.004 x 0.006 x 0.022;
  //   - one small wet glint, which is the only specular event on the front of
  //     the head and the thing that makes the whole muzzle read as alive.
  // ROUND 3: "a dark-brown RECTANGLE with a diamond-quilt texture and two
  // dead-straight vertical black lines under it — a chocolate square glued to a
  // paper bag." Four separate causes, all fixed here and in noseM above:
  //   * the quilt was normalScale 1.5 on the cobblestone field -> 0.45;
  //   * a 0.005 m bevel on a 0.048 m block is 10% and reads as a hard rectangle
  //     -> 0.010 m, and the top corners get their own chamfer solid;
  //   * the two "straight vertical lines" were the alar grooves, which ran
  //     0.031 m straight DOWN at a constant z. Real alar grooves sweep
  //     laterally-and-back away from the nostril; they are now 0.020 m long and
  //     move 0.013 m outboard over that run, so they read as a curve;
  //   * the philtrum was 0.022 m long and joined them into a third vertical
  //     bar -> 0.013 m, and it stops at the lip notch.
  hd.add(mesh(roundedBox(0.024, 0.030, 0.048, 0.010, 2), noseM, 0.1932, 0.028, 0))
  hd.add(mesh(taperedBox(0.010, 0.046, 0.008, 0.034, 0.026, 0.004, { rim: 0.0035, cornerSeg: 2 }),
    noseM, 0.1885, 0.0435, 0, 0, 0, -1.012)) // the 32 deg top plane
  for (const s of [1, -1]) {
    // nostril: a recessed COMMA — a lens for the aperture plus a tail that
    // sweeps outward and back, which is the shape §3.6 asks for and the thing
    // that separates a dog's nose from two drilled holes. The dark interior is
    // a separate solid sunk into the planum, so it is a hole, not a crescent.
    hd.add(mesh(LENS(0.0095, 0.0040, 0.008, { seg: 10 }), leatherM,
      0.1972, 0.0245, 0.0135 * s, 0, 1.22 * s, 0.62 * s))
    hd.add(mesh(splineTube([[0.1968, 0.0225, 0.0175 * s], [0.1930, 0.0195, 0.0235 * s]],
      0.0022, 4, (t) => 0.0022 * (1 - 0.45 * t), { radialSeg: 4, roundEnd: true }), leatherM))
    // alar groove: 0.006 m wide, sweeping down-and-OUTBOARD to the lip corner
    hd.add(mesh(splineTube([[0.1972, 0.0150, 0.0195 * s], [0.1936, 0.0058, 0.0262 * s],
      [0.1888, -0.0025, 0.0305 * s]], 0.0026, 6, null, { radialSeg: 4 }), leatherM))
  }
  hd.add(mesh(roundedBox(0.006, 0.013, 0.004, 0.0015, 1), leatherM, 0.1975, 0.0105, 0)) // philtrum
  // one small wet glint on the leather — the only specular event on the front
  // of the head, and the thing that says "this is wet skin, not moulded plastic"
  hd.add(mesh(LENS(0.0052, 0.0036, 0.0025, { seg: 8 }), glintM, 0.2030, 0.0348, -0.011, 0, 1.5708, 0.35))
  // mouth: open and panting. A dark bag, two gum ridges and FOUR canines only —
  // a dog showing a full set of incisors reads as a skull.
  hd.add(mesh(SE(0.058, 0.019, 0.044, 3.0, 3.0, 12), leatherM, 0.126, -0.031, 0))
  hd.add(mesh(SE(0.052, 0.007, 0.040, 3.0, 3.0, 12), gumM, 0.130, -0.022, 0))
  hd.add(mesh(SE(0.050, 0.006, 0.038, 3.0, 3.0, 12), gumM, 0.130, -0.042, 0))
  for (const s of [1, -1]) {
    hd.add(mesh(roundedCone(0.005, 0.0012, 0.014, 0.002, 8, 1), toothM, 0.168, -0.030, 0.030 * s, Math.PI, 0, 0))
    hd.add(mesh(roundedCone(0.0042, 0.001, 0.011, 0.002, 8, 1), toothM, 0.166, -0.047, 0.028 * s))
    // lip line: a modelled dark band, corners +6 deg UP at idle. A down-turned
    // mouth reads as a guard dog; up-turned reads as a dog enjoying the fight.
    hd.add(mesh(splineTube([[0.196, -0.034, 0.004 * s], [0.150, -0.030, 0.040 * s],
      [0.092, -0.022, 0.052 * s], [0.045, -0.017, 0.052 * s]], 0.003, 8, null,
    { radialSeg: 4 }), leatherM))
  }
  // the tongue hangs out of the LEFT commissure — the same side as the mask, so
  // every piece of facial asymmetry stacks and reads as one decision.
  hd.add(mesh(roundedBox(0.062, 0.012, 0.030, 0.005, 2), tongueM, 0.104, -0.062, 0.044, 0, 0, -0.663))

  // --- eyes: real geometry, never a painted quad ---------------------------
  // globe + iris + pupil + a cornea shell for the specular dot + lid solids with
  // thickness + a caruncle. Upper lid sits on the top 20% of the iris (alert),
  // nowhere near the ape's half-lidded 40%. No scleral show below the iris.
  //
  // THE FAILURE THIS REPLACES: two flat cream annuli with a brown disc in the
  // middle, sitting proud of the skull, full scleral show all the way round,
  // no lid geometry and no catchlight. That is a googly eye, and it reads as
  // startled rather than alert. Three things fix it and all three are here:
  //
  //  1. The GLOBE IS RECESSED. Its centre sits 0.008 m behind the orbital rim
  //     and its radius drops to 0.033 so it protrudes 0.006 m ("neither
  //     prominent nor sunken"), against a cheek mass that is now outboard of
  //     it. The globe is a substrate for the aperture, not a bead on a face.
  //  2. The LIDS ARE SOLID SHELLS with real thickness (0.006 upper, 0.004
  //     lower) whose x half-axis reaches FORWARD PAST the globe's front pole.
  //     The old lids stopped 0.004 short of it, which is exactly why the whole
  //     sclera ring stayed visible round the outside. Their inner margins now
  //     leave a lens-shaped aperture ~0.070 wide x 0.045 tall, the upper lid
  //     resting on the top 20% of the iris and the lower tangent to its
  //     bottom — no scleral show below the iris at all.
  //  3. A CATCHLIGHT. One hard bright bead at 10 o'clock on the cornea, plus a
  //     second dimmer bounce at 7 o'clock on the masked side so that eye does
  //     not vanish into the black patch. This is the only cheated highlight on
  //     the model and §3.4 permits it by name.
  //
  //
  // ROUND 3 FOUND NO EYES AT ALL, and the cause was not the lighting — it was
  // arithmetic. The cranium is a superellipsoid rx 0.095, e 2.9, centred at
  // head-local x -0.010; solve its surface at the eye's own station (y +0.068,
  // z +-0.066) and it sits at x +0.0705. The globe was centred at x +0.034 with
  // R 0.033, i.e. its FRONT POLE was at +0.067 — 0.0035 m INSIDE the skull.
  // The entire eye assembly, iris, cornea, catchlight and all, was buried in
  // the head, and every "the brim shadows the orbit" theory was downstream of
  // that. Moving the globe centre to +0.045 (which is exactly §3.4's aperture
  // centre x) puts the front pole at +0.078, i.e. 0.0075 m proud of the local
  // surface — §3.4's "0.006 m protrusion past the orbital rim", now measured
  // rather than asserted. The lids, rims, caruncle, brow and both catchlights
  // all ride the same gx so they travel with it.
  for (const s of [1, -1]) {
    const dir = [0.970, 0, 0.242 * s]
    // aperture centre z +-0.066 per §3.4, against a W_s half-width of 0.1025 —
    // 0.036 m of cheek outboard of the centre, which is the whole point.
    const gx = 0.045, gy = 0.068, gz = 0.066 * s
    const ry = 1.5708 - 0.244 * s
    const R = 0.033
    // ORBITAL SOCKET: a dark recessed ring the globe sits in. Two jobs. It
    // guarantees a hard dark boundary all the way round the eye even in flat
    // light — which is what makes an eye findable at 64 px — and it gives the
    // lid shells something to seat against instead of open coat.
    hd.add(mesh(SE(0.020, 0.040, 0.040, 2.4, 2.4, 10), leatherM, gx - 0.026, gy, gz))
    // the mask engulfs the eye COMPLETELY — rims, lids and brow — on the dog's
    // left. The clear side is genuinely clear, speckled right up to the rim.
    // Do not "balance" it: the asymmetry is the most memorable thing here.
    const lidM = s === 1 ? darkM : faceM
    hd.add(mesh(EYE(R), scleraM, gx, gy, gz))
    hd.add(mesh(LENS(0.0155, 0.0155, 0.004, { seg: 14 }), irisM,
      gx + dir[0] * (R - 0.002), gy, gz + dir[2] * (R - 0.002), 0, ry, 0))
    hd.add(mesh(LENS(0.0065, 0.0065, 0.003, { seg: 10 }), pupilM,
      gx + dir[0] * (R + 0.0005), gy, gz + dir[2] * (R + 0.0005), 0, ry, 0))
    hd.add(mesh(ball(R + 0.0015, 10), corneaM, gx, gy, gz))
    // lids: rx 0.042 > globe R + 0.008, so they close over the front pole and
    // the aperture is cut by their margins instead of by the globe's outline.
    // The old margins left a 0.015 m aperture — a squint, and at 20 px on
    // screen a closed eye. Solved from the iris instead of by eye: iris Ø 0.031
    // centred at gy, upper lid on its top 20% -> free margin at gy + 0.0093,
    // lower lid tangent to its bottom -> gy - 0.0155. That is a 0.025 m
    // aperture with the iris filling it, which is §3.4's alert eye.
    hd.add(mesh(SE(0.042, 0.024, 0.042, 3.4, 2.4, 16), lidM, gx - 0.010, gy + 0.0335, gz))
    hd.add(mesh(SE(0.040, 0.020, 0.040, 3.4, 2.4, 16), lidM, gx - 0.010, gy - 0.0355, gz))
    // lid margins: a 0.004 m rounded roll on each free edge, in NOSE_BLACK.
    // Real eye rims are dark on BOTH sides — that is anatomically true and it
    // is what stops the unmasked eye vanishing into the pale cheek.
    hd.add(mesh(splineTube([[gx + 0.019, gy + 0.023, gz - 0.026 * s],
      [gx + 0.030, gy + 0.011, gz + 0.002 * s], [gx + 0.019, gy + 0.024, gz + 0.028 * s]],
    0.0028, 6, null, { radialSeg: 4 }), leatherM))
    hd.add(mesh(splineTube([[gx + 0.019, gy - 0.024, gz - 0.024 * s],
      [gx + 0.029, gy - 0.017, gz + 0.002 * s], [gx + 0.019, gy - 0.025, gz + 0.026 * s]],
    0.0023, 6, null, { radialSeg: 4 }), leatherM))
    hd.add(mesh(ball(0.0032, 6), gumM, gx + 0.026, gy - 0.004, gz - 0.026 * s)) // caruncle
    // the catchlight — hard, small, at 10 o'clock, and a dim 7-o'clock bounce
    // on the masked side only.
    hd.add(mesh(LENS(0.0052, 0.0042, 0.0022, { seg: 8 }), glintM,
      gx + dir[0] * (R + 0.005) - 0.002, gy + 0.008, gz + dir[2] * (R + 0.005) - 0.008 * s, 0, ry, 0.4))
    // the 7-o'clock bounce dot on the MASKED side, §3.4 by name: without it the
    // eye inside the black patch has no second value and disappears.
    if (s === 1) {
      hd.add(mesh(LENS(0.0032, 0.0027, 0.0018, { seg: 8 }), glintM,
        gx + dir[0] * (R + 0.004), gy - 0.011, gz + dir[2] * (R + 0.004) + 0.009, 0, ry, 0))
    }
    // supraorbital ridge, rising OUTWARD — that is what gives a cattle dog its
    // wide, level, sceptical brow instead of a terrier's peaked one — with a
    // 0.006 m sulcus under it so it casts a line onto the lid in flat light.
    hd.add(mesh(splineTube([[0.078, 0.106, 0.026 * s], [0.048, 0.116, 0.058 * s],
      [0.010, 0.118, 0.084 * s]], 0.007, 10, null, { radialSeg: 6 }), lidM))
  }
  // The tan brow pip is painted into the face map over the CLEAR eye (§6.2 a:
  // pigment lives in albedo, never in relief). It rides the corrugator ridge,
  // so a raised brow translates it — an expression amplifier, not decoration.

  // --- cycling cap: a SADDLE with two ear notches, never a dome ------------
  // The ears must pass through it and the 0.250 x 0.140 m V of clean background
  // between them must survive. A domed cap eats that V and the character becomes
  // a bear. Cap crown is capped at world 1.594 so it never competes with the
  // ear tips for the top of the silhouette.
  //
  // THE FAILURE THIS REPLACES: a flat dark rectangle across the brow plus a
  // thin coloured bar on the crown, with no crown SURFACE joining them — a van
  // sun-visor bolted to a dog. There was no shell because the panels were three
  // disconnected slabs, so nothing between them caught light and the whole prop
  // read as two decals.
  //
  // Now it is what a three-panel cycling cap actually is: an unbroken curved
  // shell swept front-to-back over the skull in 7 chordwise stations, split
  // laterally into ONE centre panel (SIGNAL_RED, 0.072 m wide, which is exactly
  // the 0.074 m gap between the ears' inner base edges with 1 mm a side) and
  // TWO side panels (CREAM), with 0.004 m raised seam welts down both joins —
  // and with the side panels genuinely ABSENT across the ear stations, which is
  // what makes the notches real holes rather than painted ones.
  //
  // TWO ROUND-3 CORRECTIONS TO THE CAP, and they pull in opposite directions.
  //
  // (1) THE FRONT GOES UP. capY[0] was 0.108 — BELOW the brow ridge's top edge
  //     at +0.118 — so the cap's front line sat across the orbital band and its
  //     brim shadowed the entire eye region. The review's crop of the eye band
  //     found "a dark visor bar, a row of five grey pads and a red strip, and
  //     underneath, pure occlusion shadow". Solved against the cranium's own
  //     surface (superellipsoid rx 0.095 ry 0.0825 e 2.9 at (-0.010, 0.078)):
  //     the skull is at y 0.125 at x 0.078 and 0.154 at x 0.045, so 0.132 and
  //     0.158 seat the cap 0.006 m proud of it and clear of the brow entirely.
  //
  // (2) THE CROWN COMES DOWN. The old peak of 0.192 put the cap at world 1.592,
  //     cutting the ear V (§2.4.1) to 0.108 m — 8.1 px, right on the acceptance
  //     floor. A 0.172 peak is world 1.5725, so the V is 0.1275 m = 9.6 px deep
  //     with the cap ON, which is the number §11.1 wants measured. It also
  //     stops the cap floating: at x -0.025 the skull is at 0.1605 and the cap's
  //     underside now lands 0.005 above it instead of 0.023.
  const capX = [0.078, 0.045, 0.010, -0.025, -0.058, -0.085, -0.104]
  const capY = [0.132, 0.158, 0.168, 0.172, 0.168, 0.156, 0.132]
  const capW = [0.052, 0.078, 0.094, 0.100, 0.100, 0.092, 0.070]
  for (let i = 0; i < capX.length; i++) {
    const a = Math.max(0, i - 1), b = Math.min(capX.length - 1, i + 1)
    const pitch = Math.atan2(capY[b] - capY[a], capX[b] - capX[a])
    const len = Math.abs(capX[b] - capX[a]) / (b - a) * 1.32
    // ear notch: 0.098 m of Z centred on the ear bases (z +-0.078) and 0.060 m
    // of X centred on x -0.052, so the side panels stop dead here and the cap's
    // rear panel picks up again behind the ears, sitting on the occiput.
    const inNotch = capX[i] < -0.020 && capX[i] > -0.084
    // (3) THE CENTRE PANEL PINCHES BETWEEN THE EARS. Measured on the built
    //     mesh, the ears' inner base edges are 0.028 m apart (the base collar
    //     is what sets that, not the leather), so a 0.072 m panel ran 0.022 m
    //     INTO each ear base and was, together with the notch hems, the "red
    //     band and white crossbar filling the V" the review found. Across the
    //     two ear stations the panel narrows to 0.026 m — inside the gap with a
    //     1 mm margin per side — and opens back out fore and aft.
    hd.add(mesh(roundedBox(len, 0.013, inNotch ? 0.026 : 0.072, 0.005, 1), capRedM,
      capX[i], capY[i] - 0.006, 0, 0, 0, pitch))
    const sw = capW[i] - 0.036
    if (!inNotch && sw > 0.006) {
      for (const s of [1, -1]) {
        hd.add(mesh(roundedBox(len, 0.012, sw, 0.005, 1), capCreamM,
          capX[i], capY[i] - 0.007 - sw * 0.20, s * (0.036 + sw * 0.5), 0.42 * s, 0, pitch))
      }
    }
    // 0.004 m raised seam welt down each panel join — three-panel caps have
    // visible seams and the seams are half of what says "cycling cap" instead
    // of "beanie".
    if (!inNotch) {
      for (const s of [1, -1]) {
        hd.add(mesh(roundedBox(len, 0.006, 0.007, 0.002, 1), capCreamM,
          capX[i], capY[i] - 0.001, 0.0365 * s, 0, 0, pitch))
      }
    }
    // Rolled 0.008 m hem around each notch mouth. It moves outboard from
    // z +-0.072 to +-0.090 and takes the BRIM's dark material rather than the
    // cream side-panel one: at 0.062 m wide in CREAM it was a bright bar lying
    // straight across the ear V, which is a value event in exactly the wrong
    // place. Outboard and dark it reads as the notch's own binding.
    if (Math.abs(capX[i] + 0.020) < 0.012 || Math.abs(capX[i] + 0.084) < 0.014) {
      for (const s of [1, -1]) {
        hd.add(mesh(roundedBox(0.010, 0.010, 0.044, 0.004, 1), brimM,
          capX[i], capY[i] - 0.020, 0.090 * s, 0.42 * s, 0, pitch))
      }
    }
  }
  for (const s of [1, -1]) { // four vent eyelets — real 0.006 m holes, dark inside
    for (const e of [0, 1]) {
      hd.add(mesh(roundedCylinder(0.0045, 0.010, 0.0012, 10, 1), leatherM,
        0.034 - e * 0.040, 0.140 + e * 0.014, (0.074 - e * 0.004) * s, 0.42 * s, 0, 1.5708))
    }
  }
  //
  // BRIM. Chord 0.115 (Z), projecting 0.052 forward at a -18 deg droop, 0.014
  // thick with a rolled 0.005 edge, and — the part that stops it reading as a
  // flat visor slab — a real LATERAL CURVE of 0.010 m sagitta, built as five
  // chordwise slabs whose outer pair sit 0.010 lower than the centre. Underside
  // in SATCHEL_DARK so the brim casts its own value onto the brow.
  //
  // THE BRIM, re-aimed. §11's blocker was that the brim "casts a hard shadow
  // across the whole orbital band", and the review's own fix list gives two
  // acceptable remedies: droop no steeper than -8 deg, OR lift the lower edge
  // clear of head-local y +0.100. This does BOTH, because either alone leaves
  // the geometry marginal:
  //   * droop -0.314 rad (-18 deg) -> -0.140 rad (-8 deg);
  //   * base y 0.108 -> 0.130, so the brim's lowest point is +0.121, comfortably
  //     over the +0.118 brow and 0.053 above the eye centre;
  //   * forward projection trimmed from 0.052 m to 0.042 m (front edge x 0.120,
  //     was 0.130), which is what actually sets the shadow angle — the brim now
  //     only shades the eye if the key drops below 33 deg of elevation, against
  //     49 deg before.
  // It stays laterally curved (0.010 m sagitta over five chordwise slabs) so it
  // is a formed brim and not a visor slab.
  for (let j = -2; j <= 2; j++) {
    const z = j * 0.0245, sag = 0.010 * (j * j) / 4
    hd.add(mesh(roundedBox(0.046, 0.013, 0.026, 0.004, 1), brimM,
      0.096 - Math.abs(j) * 0.004, 0.130 - sag, z, 0, 0, -0.140))
    hd.add(mesh(roundedBox(0.042, 0.005, 0.024, 0.002, 1), brimM,
      0.096 - Math.abs(j) * 0.004, 0.122 - sag, z, 0, 0, -0.140))
  }
  hd.add(mesh(splineTube([[0.114, 0.118, -0.052], [0.121, 0.123, 0], [0.114, 0.118, 0.052]],
    0.0035, 8, null, { radialSeg: 5, roundStart: true, roundEnd: true }), brimM)) // rolled edge
  hd.add(mesh(roundedBox(0.012, 0.020, 0.030, 0.004, 1), hiVisM, -0.108, 0.118, 0)) // rear tab
  if (ledM) hd.add(mesh(ball(0.006, 10), ledM, -0.116, 0.122, 0)) // the ONE bloom source
  // the head->neck sleeve. No gap, ever.
  hd.add(mesh(SE(0.070, 0.052, 0.072, 3.0, 3.0, 14), limbM, -0.030, -0.052, 0))

  // --- ears — the single highest-value shape on the model ------------------
  // Base 0.086 wide, 0.182 along the axis, tips at world 1.700 (the silhouette
  // top) and 0.290 m apart. 18.5 deg outward cant, 10 deg forward pitch, 26 deg
  // concha turn — ALL baked into a bent() wrapper so the earL/earR bones stay at
  // rotation (0,0,0) and every one of the 31 clips' rotation tracks is
  // unaffected. Blunted to a 0.010 m tip radius: needle-sharp is a shepherd,
  // set close on the crown is a corgi.
  for (const side of [1, -1]) {
    const ear = pivot(head, -0.052, 0.130, 0.078 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    const w = bent(ear, -0.1745, 0.323 * side, -0.454 * side)
    const E = stat(w)
    // Base 0.090 (Z) to 0.026 at the blunted tip over 0.182 = a 2.0 : 1 wedge.
    // Two failure modes to check for: a tip sharper than a 0.010 m radius is a
    // shepherd, and base centres closer than z +-0.070 are a corgi.
    // ROUND-3: the tip goes from a 0.016 x 0.026 point with an 0.008 m corner
    // radius to 0.022 x 0.040 with a full 0.010 m radius. §3.8 names a tip
    // sharper than 0.010 m as an instant loss of the read — that is a german
    // shepherd, not a cattle dog — and the review measured ours as needle-sharp.
    E.add(mesh(taperedBox(0.032, 0.092, 0.022, 0.040, 0.158, 0.012, { rim: 0.010, cornerSeg: 3 }),
      limbM, 0, 0.079, 0))
    // THE DARK EAR BACK, enlarged from a 0.042 m strip to a 0.066 m plate
    // covering two thirds of the leather's back face and running 0.170 m up it.
    // Breed-typical, and — the actual reason — the ears were reading as "pale
    // cream over pale grey" against a bright arena and carrying no shape at all
    // at distance. A dark back is what makes a prick ear a hard silhouette
    // against the sky, and it is one of the model's four dark anchors.
    E.add(mesh(taperedBox(0.014, 0.066, 0.011, 0.032, 0.172, 0.008, { rim: 0.006, cornerSeg: 2 }),
      darkM, -0.018, 0.086, 0.016 * side))
    // The concha is a CLEAN DISH, not a textured surface: the ticking must not
    // run inside it (§3.8.2). CREAM_SHADE for the dish floor, CREAM for the
    // sunlit inner wall, and a 0.005 m antihelix ridge proud of the outer
    // margin so the dish has a real lip to catch light on.
    E.add(mesh(SE(0.009, 0.066, 0.031, 3.0, 3.0, 14), creamDarkM, 0.012, 0.078, 0))
    E.add(mesh(SE(0.006, 0.048, 0.021, 3.0, 3.0, 12), creamM, 0.016, 0.086, 0))
    E.add(mesh(taperedBox(0.010, 0.009, 0.006, 0.006, 0.112, 0.003, { rim: 0.002, cornerSeg: 2 }),
      creamM, 0.015, 0.062, 0.029 * side))
    // "fairly well furnished with hair": 5 bevelled wedges on the front-lower
    // margin. GEOMETRY, not alpha cards — cards fringe against the rim light.
    for (let k = 0; k < 5; k++) {
      E.add(mesh(taperedBox(0.006, 0.010, 0.003, 0.005, 0.018, 0.002, { rim: 0.002, cornerSeg: 1 }),
        creamM, 0.018, 0.028 + k * 0.019, (0.030 - k * 0.004) * side, 0, 0, -0.5 * side))
    }
    // the muscular base collar: no gap, no seam where the leather meets the skull
    E.add(mesh(sleeve(0.049, 0.041, 0.026, { radialSeg: 12, lengthSeg: 2, bulge: 0.12 }), limbM, 0, -0.008, 0))
  }

  // --- budget: merge every rigid part per bone by material -----------------
  // Nothing here moves relative to its bone, so one merged mesh per (bone,
  // material) is exactly as correct as 40 meshes and costs a fraction of the
  // draw calls. Toggled props and nested bones are never inside a static group.
  for (const g of statics) { try { mergeStatic(g) } catch { /* keep the parts */ } }
  try { dedupeGeometry(group) } catch { /* cosmetic */ }

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.78,0]
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.78, 0]

// the tail NEVER stops wagging — generates a fast metronome wag for any clip
function wag(dur, amp = 0.55, period = 0.22) {
  const keys = []
  const half = period / 2
  let s = 1
  for (let t = 0; t < dur - 1e-4; t += half) {
    keys.push(K(Math.round(t * 1000) / 1000, [amp * s, 0.12, 0]))
    s = -s
  }
  keys.push(K(dur, [amp * s, 0.12, 0]))
  return keys
}

const clips = {
  // ------------------------------------------------------------- standard --
  // THE COILED IDLE. Round 3: "a stiff symmetric biped A-pose", "the chin does
  // not drop below the withers", "no tuck-up". The bind pose has the chin at
  // 1.252 against a 1.342 withers, so the geometry was right — the CLIP was
  // undoing it. torso rz was +0.06, and in this file's convention (verified
  // against `crouch` -0.30 and `walk` -0.18) NEGATIVE rz is a forward lean, so
  // he was standing at attention leaning three degrees BACKWARD with both knees
  // locked. §4.6 asks for the opposite of all of it: hips tipped forward, torso
  // pitched 14, neck running forward-down so the muzzle spears past the chest,
  // stifles bent, feet staggered, rear foot on the ball.
  //   hips  rz -0.06 (3.4 forward) and 0.010 m lower to pay for the knee bend
  //   torso rz -0.16 (9.2 forward, matching walk's own lean)
  //   head  rz +0.20 -> net +0.04 in world, i.e. the muzzle hunting slightly
  //         down while the whole head is carried forward of the shoulders
  //   legs  lead thigh +0.22 abs / rear -0.16 abs = a real stagger
  //   shins both bent; the rear one at -0.38 abs drops the toe 0.015 m and
  //         lifts the heel, which IS "on the ball of the rear foot"
  //   arms  a boxer's guard with the elbows flared off the ribcage (rx +-0.10)
  // Nothing here is frame data: no move script and no hitbox reads `idle`.
  idle: {
    duration: 1.2, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.06], [0, 0.794, 0]), K(0.3, [0, 0, -0.06], [0, 0.806, 0]),
        K(0.6, [0, 0, -0.06], [0, 0.794, 0]), K(0.9, [0, 0, -0.05], [0, 0.806, 0]),
        K(1.2, [0, 0, -0.06], [0, 0.794, 0])],
      torso: [K(0, [0, 0, -0.16]), K(0.6, [0.02, 0.03, -0.20]), K(1.2, [0, 0, -0.16])],
      head: [K(0, [0, 0, 0.20]), K(0.3, [0, 0.12, 0.16]), K(0.6, [0.06, -0.1, 0.20]),
        K(0.9, [0, 0.08, 0.20]), K(1.2, [0, 0, 0.20])],
      earL: [K(0, Z), K(0.28, [0.14, 0.1, 0]), K(0.42, Z), K(0.86, [-0.1, -0.14, 0]), K(1.2, Z)],
      earR: [K(0, Z), K(0.34, [-0.14, -0.1, 0]), K(0.5, Z), K(0.92, [0.1, 0.14, 0]), K(1.2, Z)],
      armL: [K(0, [0.10, 0, 0.30]), K(0.6, [0.14, 0, 0.36]), K(1.2, [0.10, 0, 0.30])],
      armR: [K(0, [-0.10, 0, 0.32]), K(0.6, [-0.14, 0, 0.38]), K(1.2, [-0.10, 0, 0.32])],
      forearmL: [K(0, [0, 0, 0.5])], forearmR: [K(0, [0, 0, 0.5])],
      // solved, not eyeballed: with these four the lead sole lands at world y
      // +0.007 and the rear at -0.003 (a 10 mm split, under a pixel at 128 px),
      // the feet stagger 0.128 m fore-aft and the silhouette height drops from
      // the 1.703 bind to 1.684 — a sprinter who has been told to wait.
      legL: [K(0, [0, 0, 0.22])], legR: [K(0, [0, 0, -0.08])],
      shinL: [K(0, [0, 0, -0.24])], shinR: [K(0, [0, 0, -0.02])],
      pack: [K(0, Z), K(0.3, [0, 0, 0.05]), K(0.6, Z), K(0.9, [0, 0, 0.05]), K(1.2, Z)],
      tail: wag(1.2, 0.6, 0.2),
    },
  },

  // fast bouncy sprint — Bonko never merely walks
  walk: {
    duration: 0.36, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.8, 0]), K(0.09, [0, 0, -0.08], [0, 0.755, 0]), K(0.18, [0, 0, -0.08], [0, 0.805, 0]), K(0.27, [0, 0, -0.08], [0, 0.755, 0]), K(0.36, [0, 0, -0.08], [0, 0.8, 0])],
      legL: [K(0, [0, 0, 0.9]), K(0.18, [0, 0, -0.9]), K(0.36, [0, 0, 0.9])],
      legR: [K(0, [0, 0, -0.9]), K(0.18, [0, 0, 0.9]), K(0.36, [0, 0, -0.9])],
      shinL: [K(0, [0, 0, -0.2]), K(0.09, [0, 0, -1.1]), K(0.18, [0, 0, -0.1]), K(0.36, [0, 0, -0.2])],
      shinR: [K(0, [0, 0, -0.1]), K(0.18, [0, 0, -0.2]), K(0.27, [0, 0, -1.1]), K(0.36, [0, 0, -0.1])],
      torso: [K(0, [0, -0.08, -0.18]), K(0.18, [0, 0.08, -0.18]), K(0.36, [0, -0.08, -0.18])],
      head: [K(0, [0, 0.06, 0.12]), K(0.18, [0, -0.06, 0.12]), K(0.36, [0, 0.06, 0.12])],
      armL: [K(0, [0, 0, -0.8]), K(0.18, [0, 0, 0.7]), K(0.36, [0, 0, -0.8])],
      armR: [K(0, [0, 0, 0.7]), K(0.18, [0, 0, -0.8]), K(0.36, [0, 0, 0.7])],
      forearmL: [K(0, [0, 0, 0.9])], forearmR: [K(0, [0, 0, 0.9])],
      earL: [K(0, [-0.25, 0.1, 0]), K(0.18, [-0.15, 0.05, 0]), K(0.36, [-0.25, 0.1, 0])],
      earR: [K(0, [0.15, -0.05, 0]), K(0.18, [0.25, -0.1, 0]), K(0.36, [0.15, -0.05, 0])],
      pack: [K(0, [0, 0, 0.08]), K(0.09, [0, 0, -0.05]), K(0.18, [0, 0, 0.08]), K(0.27, [0, 0, -0.05]), K(0.36, [0, 0, 0.08])],
      tail: wag(0.36, 0.65, 0.18),
    },
  },

  jump: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.1], [0, 0.83, 0]), K(0.45, [0, 0, 0.1], [0, 0.83, 0])],
      legL: [K(0, Z), K(0.1, [0, 0, 1.2]), K(0.45, [0, 0, 1.0])],
      legR: [K(0, Z), K(0.1, [0, 0, 0.5]), K(0.45, [0, 0, 0.4])],
      shinL: [K(0, Z), K(0.1, [0, 0, -1.3]), K(0.45, [0, 0, -1.1])],
      shinR: [K(0, Z), K(0.1, [0, 0, -0.4]), K(0.45, [0, 0, -0.3])],
      armL: [K(0, Z), K(0.1, [-0.4, 0, 1.6]), K(0.45, [-0.4, 0, 1.5])],
      armR: [K(0, Z), K(0.1, [0.4, 0, 1.6]), K(0.45, [0.4, 0, 1.5])],
      torso: [K(0, Z), K(0.1, [0, 0, 0.16])],
      head: [K(0, Z), K(0.1, [0, 0, -0.12])],
      earL: [K(0, Z), K(0.1, [-0.4, 0.1, 0])],
      earR: [K(0, Z), K(0.1, [0.4, -0.1, 0])],
      pack: [K(0, Z), K(0.1, [0, 0, -0.15]), K(0.45, [0, 0, -0.1])],
      tail: wag(0.45, 0.5, 0.16),
    },
  },

  fall: {
    duration: 0.4, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.12], HIP)],
      torso: [K(0, [0, 0, 0.18])],
      head: [K(0, [0, 0, -0.1])],
      armL: [K(0, [-0.3, 0, 2.3]), K(0.2, [-0.5, 0, 2.5]), K(0.4, [-0.3, 0, 2.3])],
      armR: [K(0, [0.5, 0, 2.5]), K(0.2, [0.3, 0, 2.3]), K(0.4, [0.5, 0, 2.5])],
      legL: [K(0, [-0.2, 0, 0.5]), K(0.2, [-0.2, 0, 0.2]), K(0.4, [-0.2, 0, 0.5])],
      legR: [K(0, [0.2, 0, 0.2]), K(0.2, [0.2, 0, 0.5]), K(0.4, [0.2, 0, 0.2])],
      shinL: [K(0, [0, 0, -0.5])], shinR: [K(0, [0, 0, -0.3])],
      earL: [K(0, [-0.55, 0.15, 0])], earR: [K(0, [0.55, -0.15, 0])],
      pack: [K(0, [0, 0, -0.2])],
      tail: wag(0.4, 0.5, 0.16),
    },
  },

  crouch: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.15], [0, 0.5, 0]), K(0.25, [0, 0, -0.15], [0, 0.49, 0]), K(0.5, [0, 0, -0.15], [0, 0.5, 0])],
      legL: [K(0, [-0.4, 0, 1.1])], legR: [K(0, [0.4, 0, 1.1])],
      shinL: [K(0, [0, 0, -1.5])], shinR: [K(0, [0, 0, -1.5])],
      torso: [K(0, [0, 0, -0.3])],
      head: [K(0, [0, 0, 0.28])],
      armL: [K(0, [0.25, 0, 0.6])], armR: [K(0, [-0.25, 0, 0.6])],
      forearmL: [K(0, [0, 0, 1.1])], forearmR: [K(0, [0, 0, 1.1])],
      earL: [K(0, [0, 0.15, -0.1])], earR: [K(0, [0, -0.15, -0.1])],
      pack: [K(0, [0, 0, 0.2])],
      tail: wag(0.5, 0.55, 0.2),
    },
  },

  block: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.03, 0.75, 0])],
      torso: [K(0, [0, 0, 0.14]), K(0.25, [0.03, 0, 0.16]), K(0.5, [0, 0, 0.14])],
      head: [K(0, [0, 0, -0.22])],
      armL: [K(0, [0.3, 0, 1.0])], armR: [K(0, [-0.3, 0, 1.05])],
      forearmL: [K(0, [0, 0, 1.9])], forearmR: [K(0, [0, 0, 2.0])],
      legL: [K(0, [-0.12, 0, 0.15])], legR: [K(0, [0.12, 0, 0.15])],
      shinL: [K(0, [0, 0, -0.15])], shinR: [K(0, [0, 0, -0.15])],
      earL: [K(0, [-0.45, 0.1, 0])], earR: [K(0, [0.45, -0.1, 0])], // ears pinned back
      pack: [K(0, [0, 0, 0.1])],
      tail: wag(0.5, 0.35, 0.24), // still wagging. nervous wag.
    },
  },

  hitLight: {
    duration: 0.24, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.12], [-0.06, 0.76, 0]), K(0.24, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.12, 0.35]), K(0.24, Z)],
      head: [K(0, Z), K(0.05, [0, 0.12, 0.5]), K(0.24, Z)],
      armL: [K(0, Z), K(0.05, [0.3, 0, -0.6]), K(0.24, Z)],
      armR: [K(0, Z), K(0.05, [-0.3, 0, -0.5]), K(0.24, Z)],
      earL: [K(0, Z), K(0.06, [0.5, 0.4, 0]), K(0.24, Z)],
      earR: [K(0, Z), K(0.06, [-0.5, -0.4, 0]), K(0.24, Z)],
      pack: [K(0, Z), K(0.06, [0, 0, 0.3]), K(0.24, Z)],
      tail: wag(0.24, 0.5, 0.16),
    },
  },

  hitHeavy: {
    duration: 0.38, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.25], [-0.18, 0.72, 0]), K(0.38, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.15, 0.6]), K(0.38, Z)],
      head: [K(0, Z), K(0.06, [0, 0.15, 0.75]), K(0.38, Z)],
      armL: [K(0, Z), K(0.06, [0.5, 0, -1.3]), K(0.38, Z)],
      armR: [K(0, Z), K(0.06, [-0.5, 0, -1.2]), K(0.38, Z)],
      legL: [K(0, Z), K(0.07, [0, 0, 0.6]), K(0.38, Z)],
      shinL: [K(0, Z), K(0.07, [0, 0, -0.5]), K(0.38, Z)],
      earL: [K(0, Z), K(0.07, [0.7, 0.5, 0]), K(0.38, Z)],
      earR: [K(0, Z), K(0.07, [-0.7, -0.5, 0]), K(0.38, Z)],
      pack: [K(0, Z), K(0.07, [0, 0, 0.5]), K(0.38, Z)],
      tail: wag(0.38, 0.45, 0.16),
    },
  },

  launched: {
    duration: 0.45, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.35], HIP)],
      torso: [K(0, [0, 0, 0.7]), K(0.22, [0, 0, 0.55]), K(0.45, [0, 0, 0.7])],
      head: [K(0, [0, 0, 0.5])],
      armL: [K(0, [-0.4, 0, 2.4]), K(0.22, [-0.2, 0, 2.6]), K(0.45, [-0.4, 0, 2.4])],
      armR: [K(0, [0.2, 0, 2.6]), K(0.22, [0.4, 0, 2.4]), K(0.45, [0.2, 0, 2.6])],
      legL: [K(0, [0, 0, 1.0]), K(0.22, [0, 0, 0.8]), K(0.45, [0, 0, 1.0])],
      legR: [K(0, [0, 0, 0.6]), K(0.22, [0, 0, 0.9]), K(0.45, [0, 0, 0.6])],
      shinL: [K(0, [0, 0, -1.0])], shinR: [K(0, [0, 0, -0.7])],
      earL: [K(0, [-0.7, 0.35, 0])], earR: [K(0, [0.7, -0.35, 0])],
      pack: [K(0, [0, 0, -0.4])],
      tail: wag(0.45, 0.7, 0.14), // panic wag
    },
  },

  knockdown: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.28, 0]), K(0.4, [0, 0, 1.4], [0, 0.29, 0]), K(0.8, [0, 0, 1.4], [0, 0.28, 0])],
      legL: [K(0, [0, 0, 0.4])], legR: [K(0, [0, 0, 0.6])],
      shinL: [K(0, [0, 0, -0.4])], shinR: [K(0, [0, 0, -0.5])],
      torso: [K(0, [0, 0, 0.12])],
      head: [K(0, [0, 0, -0.3])],
      armL: [K(0, [1.0, 0, 0.35])], armR: [K(0, [-1.0, 0, 0.35])],
      earL: [K(0, [0.7, 0, 0])], earR: [K(0, [-0.7, 0, 0])],
      pack: [K(0, [0, 0, 0.3])],
      tail: wag(0.8, 0.3, 0.3), // dazed... but still wagging
    },
  },

  getup: {
    duration: 0.55, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.28, 0]), K(0.2, [0, 0, 0.5], [0, 0.45, 0]), K(0.4, [0, 0, 0.02], [0, 0.68, 0]), K(0.55, Z, HIP)],
      legL: [K(0, [0, 0, 0.4]), K(0.28, [0, 0, 0.8]), K(0.55, Z)],
      legR: [K(0, [0, 0, 0.6]), K(0.28, [0, 0, 0.4]), K(0.55, Z)],
      shinL: [K(0, [0, 0, -0.4]), K(0.28, [0, 0, -0.9]), K(0.55, Z)],
      shinR: [K(0, [0, 0, -0.5]), K(0.28, [0, 0, -0.4]), K(0.55, Z)],
      torso: [K(0, [0, 0, 0.12]), K(0.25, [0, 0, -0.4]), K(0.55, Z)],
      head: [K(0, [0, 0, -0.3]), K(0.4, [0, 0, 0.12]), K(0.55, Z)],
      armL: [K(0, [1.0, 0, 0.35]), K(0.28, [0.3, 0, -0.6]), K(0.55, Z)],
      armR: [K(0, [-1.0, 0, 0.35]), K(0.28, [-0.3, 0, -0.6]), K(0.55, Z)],
      earL: [K(0, [0.7, 0, 0]), K(0.42, [-0.2, 0.2, 0]), K(0.55, Z)],
      earR: [K(0, [-0.7, 0, 0]), K(0.42, [0.2, -0.2, 0]), K(0.55, Z)],
      pack: [K(0, [0, 0, 0.3]), K(0.42, [0, 0, -0.1]), K(0.55, Z)],
      tail: wag(0.55, 0.55, 0.18), // shake it off, back to work
    },
  },

  // skids in at full sprint, screeches to a stop, checks a delivery slip
  entrance: {
    duration: 2.2, loop: false,
    tracks: {
      hips: [K(0, [0, 0, -0.1], [0, 0.8, 0]), K(0.35, [0, 0, -0.1], [0, 0.76, 0]), K(0.55, [0, 0, 0.25], [0, 0.68, 0]), K(0.8, Z, HIP), K(2.2, Z, HIP)],
      legL: [K(0, [0, 0, 0.9]), K(0.18, [0, 0, -0.9]), K(0.35, [0, 0, 0.9]), K(0.55, [0, 0, 1.0]), K(0.8, Z), K(2.2, Z)],
      legR: [K(0, [0, 0, -0.9]), K(0.18, [0, 0, 0.9]), K(0.35, [0, 0, -0.9]), K(0.55, [0.1, 0, 0.2]), K(0.8, Z), K(2.2, Z)],
      shinL: [K(0, [0, 0, -0.8]), K(0.55, [0, 0, -1.2]), K(0.8, Z), K(2.2, Z)],
      shinR: [K(0, [0, 0, -0.4]), K(0.55, [0, 0, -0.2]), K(0.8, Z), K(2.2, Z)],
      torso: [K(0, [0, -0.08, -0.2]), K(0.55, [0, 0, 0.3]), K(0.8, Z), K(1.0, [0, 0, -0.05]), K(1.9, [0, 0, -0.05]), K(2.2, Z)],
      head: [K(0, [0, 0, 0.15]), K(0.55, [0, 0, -0.2]), K(0.8, Z), K(1.0, [0, 0, 0.35]), K(1.5, [0, 0.2, 0.35]), K(1.8, [0, -0.2, 0.35]), K(2.0, Z), K(2.2, Z)],
      armL: [K(0, [0, 0, -0.8]), K(0.35, [0, 0, 0.7]), K(0.55, [-0.3, 0, 1.2]), K(0.8, [0, 0, 0.28]), K(1.0, [0, 0, 1.3]), K(1.9, [0, 0, 1.3]), K(2.2, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.9]), K(1.0, [0, 0, 1.4]), K(1.9, [0, 0, 1.4]), K(2.2, [0, 0, 0.5])],
      armR: [K(0, [0, 0, 0.7]), K(0.35, [0, 0, -0.8]), K(0.55, [0.3, 0, 1.2]), K(0.8, [0, 0, 0.3]), K(2.2, [0, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.9]), K(0.8, [0, 0, 0.5]), K(2.2, [0, 0, 0.5])],
      earL: [K(0, [-0.3, 0.1, 0]), K(0.55, [0.3, 0.3, 0]), K(0.9, Z), K(1.95, [0.2, 0.25, 0]), K(2.1, Z), K(2.2, Z)],
      earR: [K(0, [0.3, -0.1, 0]), K(0.55, [-0.3, -0.3, 0]), K(0.9, Z), K(1.95, [-0.2, -0.25, 0]), K(2.1, Z), K(2.2, Z)],
      pack: [K(0, [0, 0, 0.1]), K(0.55, [0, 0, -0.35]), K(0.75, [0, 0, 0.15]), K(0.9, Z), K(2.2, Z)],
      tail: wag(2.2, 0.65, 0.18),
    },
  },

  // victory zoomies — tight spin, play-bow, tail achieving liftoff speeds
  win: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.25, [0, 2.1, 0], [0, 0.74, 0]), K(0.5, [0, 4.2, 0], [0, 0.8, 0]), K(0.75, [0, 6.28, 0], [0, 0.74, 0]), K(1.0, [0, 6.28, 0], [0, 0.62, 0]), K(1.6, [0, 6.28, 0], [0, 0.62, 0]), K(2.0, [0, 6.28, 0], HIP)],
      legL: [K(0, Z), K(0.25, [0, 0, 0.8]), K(0.5, [0, 0, -0.6]), K(0.75, Z), K(1.0, [-0.3, 0, 0.5]), K(1.6, [-0.3, 0, 0.5]), K(2.0, Z)],
      legR: [K(0, Z), K(0.25, [0, 0, -0.6]), K(0.5, [0, 0, 0.8]), K(0.75, Z), K(1.0, [0.3, 0, 0.5]), K(1.6, [0.3, 0, 0.5]), K(2.0, Z)],
      shinL: [K(0, Z), K(1.0, [0, 0, -0.6]), K(1.6, [0, 0, -0.6]), K(2.0, Z)],
      shinR: [K(0, Z), K(1.0, [0, 0, -0.6]), K(1.6, [0, 0, -0.6]), K(2.0, Z)],
      torso: [K(0, Z), K(1.0, [0, 0, -0.55]), K(1.6, [0, 0, -0.55]), K(2.0, Z)], // play-bow
      head: [K(0, Z), K(1.0, [0, 0, 0.5]), K(1.2, [0.15, 0.3, 0.5]), K(1.4, [-0.15, -0.3, 0.5]), K(1.6, [0, 0, 0.5]), K(2.0, Z)],
      armL: [K(0, [0, 0, 0.28]), K(1.0, [0, 0, -0.9]), K(1.6, [0, 0, -0.9]), K(2.0, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(1.0, [0, 0, -0.9]), K(1.6, [0, 0, -0.9]), K(2.0, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(1.0, [0, 0, 0.2]), K(2.0, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.5]), K(1.0, [0, 0, 0.2]), K(2.0, [0, 0, 0.5])],
      earL: [K(0, Z), K(0.5, [-0.4, 0.2, 0]), K(1.0, [0.3, 0.35, 0]), K(1.6, [0.3, 0.35, 0]), K(2.0, Z)],
      earR: [K(0, Z), K(0.5, [0.4, -0.2, 0]), K(1.0, [-0.3, -0.35, 0]), K(1.6, [-0.3, -0.35, 0]), K(2.0, Z)],
      pack: [K(0, Z), K(0.25, [0, 0, -0.2]), K(0.5, [0, 0, 0.2]), K(0.75, [0, 0, -0.2]), K(1.0, [0, 0, 0.25]), K(2.0, Z)],
      tail: wag(2.0, 0.85, 0.1), // MAXIMUM WAG
    },
  },

  lose: {
    duration: 1.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.5], [0, 0.42, 0]), K(0.9, [0, 0, 0.5], [0, 0.41, 0]), K(1.8, [0, 0, 0.5], [0, 0.42, 0])], // sits
      legL: [K(0, [-0.5, 0, 1.3])], legR: [K(0, [0.5, 0, 1.3])],
      shinL: [K(0, [0, 0, -0.5])], shinR: [K(0, [0, 0, -0.5])],
      torso: [K(0, [0, 0, -0.35]), K(0.9, [0, 0, -0.38]), K(1.8, [0, 0, -0.35])],
      head: [K(0, [0, 0, -0.45]), K(0.9, [0.1, 0.15, -0.5]), K(1.8, [0, 0, -0.45])],
      armL: [K(0, [0.15, 0, 0.45])], armR: [K(0, [-0.15, 0, 0.45])],
      forearmL: [K(0, [0, 0, 0.15])], forearmR: [K(0, [0, 0, 0.15])],
      earL: [K(0, [0.9, 0.2, 0])], earR: [K(0, [-0.9, -0.2, 0])], // ears fully down
      pack: [K(0, [0, 0, 0.25])],
      tail: [K(0, [0.1, 0.12, 0]), K(0.9, [-0.1, 0.12, 0]), K(1.8, [0.1, 0.12, 0])], // the slowest, saddest wag
    },
  },

  // play-bow + beckoning paw: "catch me if you can"
  taunt: {
    duration: 1.1, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.2], [0, 0.62, 0]), K(0.85, [0, 0, -0.2], [0, 0.62, 0]), K(1.1, Z, HIP)],
      torso: [K(0, Z), K(0.2, [0, 0, -0.45]), K(0.85, [0, 0, -0.45]), K(1.1, Z)],
      head: [K(0, Z), K(0.2, [0, 0, 0.5]), K(0.45, [0.2, 0.25, 0.5]), K(0.65, [-0.2, -0.25, 0.5]), K(0.85, [0, 0, 0.5]), K(1.1, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.25, [0.2, 0, 1.4]), K(0.85, [0.2, 0, 1.4]), K(1.1, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 1.4]), K(0.45, [0, 0, 0.7]), K(0.6, [0, 0, 1.4]), K(0.75, [0, 0, 0.7]), K(1.1, [0, 0, 0.5])],
      armR: [K(0, [0, 0, 0.3]), K(0.2, [0, 0, -0.7]), K(0.85, [0, 0, -0.7]), K(1.1, [0, 0, 0.3])],
      legL: [K(0, Z), K(0.2, [-0.3, 0, 0.6]), K(0.85, [-0.3, 0, 0.6]), K(1.1, Z)],
      legR: [K(0, Z), K(0.2, [0.3, 0, 0.6]), K(0.85, [0.3, 0, 0.6]), K(1.1, Z)],
      shinL: [K(0, Z), K(0.2, [0, 0, -0.7]), K(0.85, [0, 0, -0.7]), K(1.1, Z)],
      shinR: [K(0, Z), K(0.2, [0, 0, -0.7]), K(0.85, [0, 0, -0.7]), K(1.1, Z)],
      earL: [K(0, Z), K(0.3, [0.2, 0.3, 0]), K(0.5, Z), K(0.7, [0.2, 0.3, 0]), K(0.9, Z), K(1.1, Z)],
      earR: [K(0, Z), K(0.3, [-0.2, -0.3, 0]), K(0.5, Z), K(0.7, [-0.2, -0.3, 0]), K(0.9, Z), K(1.1, Z)],
      pack: [K(0, Z), K(0.25, [0, 0, -0.3]), K(0.85, [0, 0, -0.3]), K(1.1, Z)],
      tail: wag(1.1, 0.8, 0.12),
    },
  },

  // ----------------------------------------------------------- move clips --
  parcelJab: {
    duration: 0.24, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.28]), K(0.07, [0, 0, -0.2]), K(0.11, [0, 0, 1.5]), K(0.24, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.07, [0, 0, 1.2]), K(0.11, [0, 0, 0.05]), K(0.24, [0, 0, 0.5])],
      torso: [K(0, Z), K(0.07, [0, -0.3, 0]), K(0.11, [0, 0.4, -0.08]), K(0.24, Z)],
      hips: [K(0, Z, HIP), K(0.11, [0, 0.25, 0], [0.04, 0.79, 0]), K(0.24, Z, HIP)],
      head: [K(0, Z), K(0.11, [0, -0.15, 0]), K(0.24, Z)],
      armR: [K(0, [0, 0, 0.3]), K(0.11, [0, 0, 0.6]), K(0.24, [0, 0, 0.3])],
      earL: [K(0, Z), K(0.11, [0.2, 0.25, 0]), K(0.24, Z)],
      earR: [K(0, Z), K(0.11, [-0.2, -0.25, 0]), K(0.24, Z)],
      pack: [K(0, Z), K(0.11, [0, 0, 0.2]), K(0.24, Z)],
      tail: wag(0.24, 0.55, 0.16),
    },
  },

  dashPunch: {
    duration: 0.36, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.15], [0, 0.72, 0]), K(0.16, [0, 0, 0.05], [0.12, 0.76, 0]), K(0.36, Z, HIP)],
      torso: [K(0, Z), K(0.08, [0, -0.2, -0.25]), K(0.16, [0, 0.3, -0.15]), K(0.36, Z)],
      armR: [K(0, [0, 0, 0.3]), K(0.08, [0, 0, -0.6]), K(0.16, [0, 0, 1.6]), K(0.28, [0, 0, 1.4]), K(0.36, [0, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.08, [0, 0, 1.4]), K(0.16, [0, 0, 0.05]), K(0.36, [0, 0, 0.5])],
      armL: [K(0, [0, 0, 0.28]), K(0.16, [0, 0, -0.9]), K(0.36, [0, 0, 0.28])],
      head: [K(0, Z), K(0.08, [0, 0, 0.1]), K(0.16, [0, 0, -0.12]), K(0.36, Z)],
      legL: [K(0, Z), K(0.12, [0, 0, 0.8]), K(0.2, [0, 0, -0.6]), K(0.36, Z)],
      legR: [K(0, Z), K(0.12, [0, 0, -0.5]), K(0.2, [0, 0, 0.5]), K(0.36, Z)],
      earL: [K(0, Z), K(0.16, [-0.35, 0.15, 0]), K(0.36, Z)],
      earR: [K(0, Z), K(0.16, [0.35, -0.15, 0]), K(0.36, Z)],
      pack: [K(0, Z), K(0.1, [0, 0, 0.25]), K(0.2, [0, 0, -0.15]), K(0.36, Z)],
      tail: wag(0.36, 0.6, 0.14),
    },
  },

  tailStrike: {
    duration: 0.3, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, -1.4, 0], [0, 0.76, 0]), K(0.15, [0, -3.1, 0], [0, 0.79, 0]), K(0.24, [0, -5.2, 0], [0, 0.77, 0]), K(0.3, [0, -6.28, 0], HIP)],
      tail: [K(0, [0.5, 0.12, 0]), K(0.08, [0, 0.9, 0]), K(0.15, [0, 1.2, 0]), K(0.24, [0, 0.6, 0]), K(0.3, [-0.5, 0.12, 0])], // tail whips out
      torso: [K(0, Z), K(0.1, [0, -0.3, -0.1]), K(0.2, [0, 0.2, -0.05]), K(0.3, Z)],
      head: [K(0, Z), K(0.1, [0, -0.4, 0]), K(0.3, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.12, [0.5, 0, 0.9]), K(0.3, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.12, [-0.5, 0, 0.9]), K(0.3, [0, 0, 0.3])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.3]), K(0.3, Z)],
      earL: [K(0, Z), K(0.12, [0, 0.4, 0]), K(0.3, Z)],
      earR: [K(0, Z), K(0.12, [0, -0.4, 0]), K(0.3, Z)],
      pack: [K(0, Z), K(0.12, [0, 0.3, 0.2]), K(0.3, Z)],
    },
  },

  slidingKick: {
    duration: 0.56, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.4], [0, 0.42, 0]), K(0.34, [0, 0, 0.5], [0, 0.36, 0]), K(0.44, [0, 0, 0.1], [0, 0.6, 0]), K(0.56, Z, HIP)],
      legL: [K(0, Z), K(0.1, [0, 0, 1.5]), K(0.34, [0, 0, 1.4]), K(0.56, Z)], // lead leg out
      shinL: [K(0, Z), K(0.1, [0, 0, 0.05]), K(0.56, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, -1.0]), K(0.34, [0, 0, -0.9]), K(0.56, Z)], // trail leg tucked
      shinR: [K(0, Z), K(0.1, [0, 0, -1.4]), K(0.34, [0, 0, -1.3]), K(0.56, Z)],
      torso: [K(0, Z), K(0.1, [0, 0, 0.35]), K(0.34, [0, 0, 0.4]), K(0.56, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.34, [0, 0, -0.3]), K(0.56, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0.4, 0, -1.1]), K(0.34, [0.4, 0, -1.0]), K(0.56, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.1, [-0.5, 0, 1.4]), K(0.34, [-0.5, 0, 1.5]), K(0.56, [0, 0, 0.3])],
      earL: [K(0, Z), K(0.12, [-0.5, 0.2, 0]), K(0.44, Z), K(0.56, Z)],
      earR: [K(0, Z), K(0.12, [0.5, -0.2, 0]), K(0.44, Z), K(0.56, Z)],
      pack: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.4, [0, 0, 0.2]), K(0.56, Z)],
      tail: wag(0.56, 0.6, 0.14),
    },
  },

  backpackBash: {
    duration: 0.55, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 1.2, 0], [0, 0.74, 0]), K(0.24, [0, 3.5, 0], [0, 0.8, 0]), K(0.34, [0, 5.6, 0], [0, 0.76, 0]), K(0.42, [0, 6.28, 0], [0.08, 0.78, 0]), K(0.55, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.12, [0, -0.3, 0.05]), K(0.3, [0, 0.4, -0.12]), K(0.42, [0.2, 0.2, -0.05]), K(0.55, Z)],
      head: [K(0, Z), K(0.12, [0, -0.4, 0]), K(0.34, [0, 0.3, 0]), K(0.55, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.2, [1.1, 0, 0.5]), K(0.42, [0.6, 0, 0.4]), K(0.55, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.2, [-1.1, 0, 0.5]), K(0.42, [-0.6, 0, 0.4]), K(0.55, [0, 0, 0.3])],
      legL: [K(0, Z), K(0.24, [0, 0, 0.35]), K(0.55, Z)],
      legR: [K(0, Z), K(0.24, [0, 0, -0.3]), K(0.55, Z)],
      earL: [K(0, Z), K(0.24, [-0.4, 0.35, 0]), K(0.55, Z)],
      earR: [K(0, Z), K(0.24, [0.4, -0.35, 0]), K(0.55, Z)],
      pack: [K(0, Z), K(0.2, [0, -0.4, 0.4]), K(0.36, [0, 0.5, -0.3]), K(0.55, Z)], // the pack does the damage
      tail: wag(0.55, 0.7, 0.14),
    },
  },

  sprintTackle: {
    duration: 0.56, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.2], [0, 0.7, 0]), K(0.3, [0, 0, -0.3], [0, 0.74, 0]), K(0.42, [0, 0, 0.15], [0, 0.82, 0]), K(0.56, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.3, [0, 0, -0.6]), K(0.42, [0, 0, 0.2]), K(0.56, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.35]), K(0.3, [0, 0, -0.4]), K(0.42, [0, 0, 0.3]), K(0.56, Z)],
      legL: [K(0, Z), K(0.1, [0, 0, 0.9]), K(0.17, [0, 0, -0.9]), K(0.24, [0, 0, 0.9]), K(0.31, [0, 0, -0.9]), K(0.42, [0, 0, 0.5]), K(0.56, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, -0.9]), K(0.17, [0, 0, 0.9]), K(0.24, [0, 0, -0.9]), K(0.31, [0, 0, 0.9]), K(0.42, [0, 0, -0.4]), K(0.56, Z)],
      shinL: [K(0, Z), K(0.14, [0, 0, -1.0]), K(0.42, [0, 0, -0.3]), K(0.56, Z)],
      shinR: [K(0, Z), K(0.2, [0, 0, -1.0]), K(0.42, [0, 0, -0.2]), K(0.56, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0.3, 0, -1.2]), K(0.42, [0.4, 0, 1.7]), K(0.56, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.1, [-0.3, 0, -1.2]), K(0.42, [-0.4, 0, 1.7]), K(0.56, [0, 0, 0.3])],
      earL: [K(0, Z), K(0.1, [-0.5, 0.1, 0]), K(0.42, [0.3, 0.3, 0]), K(0.56, Z)],
      earR: [K(0, Z), K(0.1, [0.5, -0.1, 0]), K(0.42, [-0.3, -0.3, 0]), K(0.56, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.42, [0, 0, 0.35]), K(0.56, Z)],
      tail: wag(0.56, 0.6, 0.12),
    },
  },

  wallJump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.2], [0, 0.62, 0]), K(0.2, [0, 0, 2.4], [0, 0.95, 0]), K(0.34, [0, 0, 5.2], [0, 0.9, 0]), K(0.42, [0, 0, 6.28], [0, 0.82, 0]), K(0.5, [0, 0, 6.28], HIP)],
      legL: [K(0, Z), K(0.08, [0, 0, 1.0]), K(0.2, [0, 0, 1.3]), K(0.42, [0, 0, 0.3]), K(0.5, Z)],
      legR: [K(0, Z), K(0.08, [0, 0, 0.8]), K(0.2, [0, 0, 0.9]), K(0.42, [0, 0, 0.2]), K(0.5, Z)],
      shinL: [K(0, Z), K(0.2, [0, 0, -1.4]), K(0.42, [0, 0, -0.3]), K(0.5, Z)],
      shinR: [K(0, Z), K(0.2, [0, 0, -1.1]), K(0.42, [0, 0, -0.2]), K(0.5, Z)],
      torso: [K(0, Z), K(0.08, [0, 0, -0.3]), K(0.2, [0, 0, 0.3]), K(0.5, Z)],
      head: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.2, [-0.4, 0, 2.2]), K(0.42, [0, 0, 0.6]), K(0.5, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.2, [0.4, 0, 2.2]), K(0.42, [0, 0, 0.6]), K(0.5, [0, 0, 0.3])],
      earL: [K(0, Z), K(0.2, [-0.6, 0.2, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.2, [0.6, -0.2, 0]), K(0.5, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, -0.4]), K(0.42, [0, 0, 0.2]), K(0.5, Z)],
      tail: wag(0.5, 0.7, 0.12),
    },
  },

  rapidPaw: {
    duration: 0.7, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.1], [0.04, 0.76, 0]), K(0.5, [0, 0, -0.1], [0.06, 0.76, 0]), K(0.7, Z, HIP)],
      // alternating paw flurry — too fast to be legal
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0, 0, 1.5]), K(0.17, [0, 0, -0.3]), K(0.24, [0, 0, 1.5]), K(0.31, [0, 0, -0.3]), K(0.38, [0, 0, 1.5]), K(0.45, [0, 0, -0.3]), K(0.55, [0, 0, 1.6]), K(0.7, [0, 0, 0.28])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, 0.05]), K(0.17, [0, 0, 1.1]), K(0.24, [0, 0, 0.05]), K(0.31, [0, 0, 1.1]), K(0.38, [0, 0, 0.05]), K(0.55, [0, 0, 0.05]), K(0.7, [0, 0, 0.5])],
      armR: [K(0, [0, 0, 0.3]), K(0.13, [0, 0, 1.5]), K(0.2, [0, 0, -0.3]), K(0.27, [0, 0, 1.5]), K(0.34, [0, 0, -0.3]), K(0.41, [0, 0, 1.5]), K(0.55, [0, 0, 1.6]), K(0.7, [0, 0, 0.3])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.13, [0, 0, 0.05]), K(0.2, [0, 0, 1.1]), K(0.27, [0, 0, 0.05]), K(0.34, [0, 0, 1.1]), K(0.55, [0, 0, 0.05]), K(0.7, [0, 0, 0.5])],
      torso: [K(0, Z), K(0.1, [0, -0.15, -0.15]), K(0.24, [0, 0.15, -0.15]), K(0.38, [0, -0.15, -0.15]), K(0.55, [0, 0.2, -0.2]), K(0.7, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.15]), K(0.55, [0, 0, -0.2]), K(0.7, Z)],
      legL: [K(0, Z), K(0.1, [0, 0, 0.3]), K(0.55, [0, 0, 0.3]), K(0.7, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, -0.25]), K(0.55, [0, 0, -0.25]), K(0.7, Z)],
      earL: [K(0, Z), K(0.1, [-0.35, 0.15, 0]), K(0.55, [-0.35, 0.15, 0]), K(0.7, Z)],
      earR: [K(0, Z), K(0.1, [0.35, -0.15, 0]), K(0.55, [0.35, -0.15, 0]), K(0.7, Z)],
      pack: [K(0, Z), K(0.15, [0, 0, 0.15]), K(0.3, [0, 0, -0.15]), K(0.45, [0, 0, 0.15]), K(0.7, Z)],
      tail: wag(0.7, 0.7, 0.1),
    },
  },

  deliveryToss: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, -0.15], [0.06, 0.72, 0]), K(0.4, [0, 0, -0.1], [0, 0.75, 0]), K(0.55, [0, 0, 0.25], [-0.03, 0.85, 0]), K(0.7, Z, HIP), K(1.0, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, -0.35]), K(0.4, [0, -0.3, -0.2]), K(0.55, [0, 0.5, 0.3]), K(0.75, Z), K(1.0, Z)],
      head: [K(0, Z), K(0.14, [0, 0, -0.25]), K(0.55, [0, 0, 0.35]), K(0.75, Z), K(1.0, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.14, [0.4, 0, 1.3]), K(0.4, [0.5, 0, 1.1]), K(0.55, [-0.3, 0, 2.4]), K(0.75, [0, 0, 0.28]), K(1.0, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.14, [-0.4, 0, 1.3]), K(0.4, [-0.5, 0, 1.1]), K(0.55, [0.3, 0, 2.4]), K(0.75, [0, 0, 0.3]), K(1.0, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.14, [0, 0, 1.0]), K(0.55, [0, 0, 0.1]), K(1.0, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.14, [0, 0, 1.0]), K(0.55, [0, 0, 0.1]), K(1.0, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.14, [-0.2, 0, 0.4]), K(0.55, [0, 0, -0.3]), K(0.75, Z)],
      legR: [K(0, Z), K(0.14, [0.2, 0, 0.4]), K(0.55, [0, 0, 0.3]), K(0.75, Z)],
      earL: [K(0, Z), K(0.4, [0.25, 0.3, 0]), K(0.55, [-0.4, 0.2, 0]), K(0.75, Z)],
      earR: [K(0, Z), K(0.4, [-0.25, -0.3, 0]), K(0.55, [0.4, -0.2, 0]), K(0.75, Z)],
      pack: [K(0, Z), K(0.4, [0, 0, 0.2]), K(0.55, [0, 0, -0.35]), K(0.75, Z)],
      tail: wag(1.0, 0.6, 0.14),
    },
  },

  signatureSlam: {
    duration: 0.85, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, -0.1], [0.05, 0.72, 0]), K(0.28, [0, 2.6, 0], [0, 0.82, 0]), K(0.44, [0, 5.4, 0], [0, 0.86, 0]), K(0.55, [0, 6.28, 0.15], [0, 0.7, 0]), K(0.7, [0, 6.28, 0], HIP), K(0.85, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.44, [0, 0, 0.2]), K(0.55, [0, 0, 0.5]), K(0.7, Z), K(0.85, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.55, [0, 0, 0.4]), K(0.85, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.12, [0.5, 0, 1.2]), K(0.44, [0.9, 0, 0.8]), K(0.55, [0.3, 0, -0.8]), K(0.7, [0, 0, 0.28]), K(0.85, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.12, [-0.5, 0, 1.2]), K(0.44, [-0.9, 0, 0.8]), K(0.55, [-0.3, 0, -0.8]), K(0.7, [0, 0, 0.3]), K(0.85, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.12, [0, 0, 1.1]), K(0.55, [0, 0, 0.1]), K(0.85, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.12, [0, 0, 1.1]), K(0.55, [0, 0, 0.1]), K(0.85, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.28, [0, 0, 0.4]), K(0.55, [-0.3, 0, 0.6]), K(0.7, Z)],
      legR: [K(0, Z), K(0.28, [0, 0, -0.35]), K(0.55, [0.3, 0, 0.6]), K(0.7, Z)],
      earL: [K(0, Z), K(0.3, [-0.4, 0.3, 0]), K(0.55, [0.5, 0.3, 0]), K(0.7, Z)],
      earR: [K(0, Z), K(0.3, [0.4, -0.3, 0]), K(0.55, [-0.5, -0.3, 0]), K(0.7, Z)],
      pack: [K(0, Z), K(0.28, [0, 0, -0.3]), K(0.55, [0, 0, 0.4]), K(0.7, Z)],
      tail: wag(0.85, 0.65, 0.12),
    },
  },

  sameBlock: {
    duration: 1.1, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.3], [0, 0.6, 0]), K(0.16, [0, 0, -0.3], [0, 0.6, 0]), K(0.3, [0, 0, 0.3], [0, 0.9, 0]), K(0.6, [0, 0, 0.2], [0, 0.85, 0]), K(0.8, Z, [0, 0.7, 0]), K(1.1, Z, HIP)],
      legL: [K(0, Z), K(0.1, [-0.4, 0, 1.0]), K(0.3, [0, 0, 1.2]), K(0.8, [-0.3, 0, 0.8]), K(1.1, Z)],
      legR: [K(0, Z), K(0.1, [0.4, 0, 1.0]), K(0.3, [0, 0, 0.8]), K(0.8, [0.3, 0, 0.8]), K(1.1, Z)],
      shinL: [K(0, Z), K(0.1, [0, 0, -1.3]), K(0.3, [0, 0, -1.2]), K(0.8, [0, 0, -1.0]), K(1.1, Z)],
      shinR: [K(0, Z), K(0.1, [0, 0, -1.3]), K(0.3, [0, 0, -0.9]), K(0.8, [0, 0, -1.0]), K(1.1, Z)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.4]), K(0.3, [0, 0, 0.25]), K(0.6, [0, 0, 0.3]), K(1.1, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.2]), K(0.3, [0, 0, -0.35]), K(1.1, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.3, [-0.4, 0, 2.5]), K(0.6, [-0.4, 0, 2.6]), K(0.8, [0.3, 0, -0.5]), K(1.1, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.3, [0.4, 0, 2.5]), K(0.6, [0.4, 0, 2.6]), K(0.8, [-0.3, 0, -0.5]), K(1.1, [0, 0, 0.3])],
      earL: [K(0, Z), K(0.3, [-0.6, 0.2, 0]), K(0.8, [0.3, 0.3, 0]), K(1.1, Z)],
      earR: [K(0, Z), K(0.3, [0.6, -0.2, 0]), K(0.8, [-0.3, -0.3, 0]), K(1.1, Z)],
      pack: [K(0, Z), K(0.3, [0, 0, -0.4]), K(0.8, [0, 0, 0.3]), K(1.1, Z)],
      tail: wag(1.1, 0.7, 0.12),
    },
  },

  // conductor pose: whistle up, arm out — the train does the rest
  finality: {
    duration: 1.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, Z, [-0.05, 0.75, 0]), K(1.2, Z, [-0.05, 0.75, 0]), K(1.5, Z, HIP)],
      armR: [K(0, [0, 0, 0.3]), K(0.2, [0, 0, 2.6]), K(1.2, [0, 0, 2.6]), K(1.5, [0, 0, 0.3])], // paw to the sky
      forearmR: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 0.1]), K(1.2, [0, 0, 0.1]), K(1.5, [0, 0, 0.5])],
      armL: [K(0, [0, 0, 0.28]), K(0.3, [0, 0, 1.5]), K(1.2, [0, 0, 1.5]), K(1.5, [0, 0, 0.28])], // points down the track
      forearmL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 0.05]), K(1.2, [0, 0, 0.05]), K(1.5, [0, 0, 0.5])],
      torso: [K(0, Z), K(0.2, [0, 0.15, 0.1]), K(0.5, [0.05, 0.15, 0.1]), K(0.8, [-0.05, 0.15, 0.1]), K(1.2, [0, 0.15, 0.1]), K(1.5, Z)],
      head: [K(0, Z), K(0.2, [0, 0.25, 0.2]), K(0.55, [0, -0.3, 0]), K(0.8, [0, 0.25, 0]), K(1.2, [0, 0, 0.1]), K(1.5, Z)],
      legL: [K(0, Z), K(0.2, [-0.2, 0, 0.3]), K(1.2, [-0.2, 0, 0.3]), K(1.5, Z)],
      legR: [K(0, Z), K(0.2, [0.2, 0, 0.3]), K(1.2, [0.2, 0, 0.3]), K(1.5, Z)],
      earL: [K(0, Z), K(0.2, [0.2, 0.3, 0]), K(0.6, [-0.3, 0.1, 0]), K(1.2, [0.2, 0.3, 0]), K(1.5, Z)],
      earR: [K(0, Z), K(0.2, [-0.2, -0.3, 0]), K(0.6, [0.3, -0.1, 0]), K(1.2, [-0.2, -0.3, 0]), K(1.5, Z)],
      pack: [K(0, Z), K(0.25, [0, 0, 0.15]), K(0.6, [0, 0, -0.1]), K(1.2, [0, 0, 0.1]), K(1.5, Z)],
      tail: wag(1.5, 0.8, 0.1),
    },
  },

  gasFree: {
    duration: 1.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.25], [0, 0.66, 0]), K(0.3, [0, 0, -0.3], [0, 0.72, 0]), K(0.5, [0, 0, -0.3], [0, 0.72, 0]), K(0.7, [0, 0, -0.3], [0, 0.72, 0]), K(0.9, [0, 0, -0.3], [0, 0.72, 0]), K(1.1, [0, 0, 0.1], [0, 0.82, 0]), K(1.4, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.5]), K(1.0, [0, 0, -0.55]), K(1.1, [0, 0, 0.2]), K(1.4, Z)],
      head: [K(0, Z), K(0.1, [0, 0, -0.3]), K(1.0, [0, 0, -0.35]), K(1.4, Z)],
      legL: [K(0, Z), K(0.1, [0, 0, 1.0]), K(0.18, [0, 0, -1.0]), K(0.26, [0, 0, 1.0]), K(0.34, [0, 0, -1.0]), K(0.42, [0, 0, 1.0]), K(0.5, [0, 0, -1.0]), K(0.58, [0, 0, 1.0]), K(0.66, [0, 0, -1.0]), K(0.74, [0, 0, 1.0]), K(0.82, [0, 0, -1.0]), K(0.9, [0, 0, 1.0]), K(1.1, [0, 0, 0.4]), K(1.4, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, -1.0]), K(0.18, [0, 0, 1.0]), K(0.26, [0, 0, -1.0]), K(0.34, [0, 0, 1.0]), K(0.42, [0, 0, -1.0]), K(0.5, [0, 0, 1.0]), K(0.58, [0, 0, -1.0]), K(0.66, [0, 0, 1.0]), K(0.74, [0, 0, -1.0]), K(0.82, [0, 0, 1.0]), K(0.9, [0, 0, -1.0]), K(1.1, [0, 0, -0.3]), K(1.4, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0, 0, -1.1]), K(1.0, [0, 0, -1.2]), K(1.1, [0, 0, 0.8]), K(1.4, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.1, [0, 0, -1.1]), K(1.0, [0, 0, -1.2]), K(1.1, [0, 0, 0.8]), K(1.4, [0, 0, 0.3])],
      earL: [K(0, Z), K(0.1, [-0.6, 0.15, 0]), K(1.0, [-0.6, 0.15, 0]), K(1.4, Z)],
      earR: [K(0, Z), K(0.1, [0.6, -0.15, 0]), K(1.0, [0.6, -0.15, 0]), K(1.4, Z)],
      pack: [K(0, Z), K(0.15, [0, 0, -0.35]), K(1.0, [0, 0, -0.35]), K(1.15, [0, 0, 0.25]), K(1.4, Z)],
      tail: wag(1.4, 0.75, 0.1),
    },
  },

  infiniteTps: {
    duration: 1.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.15, [0, 0, -0.2], [0, 0.68, 0]), K(0.3, [0, 1.6, 0], [0, 0.74, 0]), K(0.5, [0, 3.1, 0], [0, 0.7, 0]), K(0.7, [0, 4.7, 0], [0, 0.74, 0]), K(0.9, [0, 6.28, 0], [0, 0.7, 0]), K(1.2, [0, 6.28, 0], [0, 0.76, 0]), K(1.6, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.15, [0, 0, -0.35]), K(1.2, [0, 0, -0.3]), K(1.6, Z)],
      head: [K(0, Z), K(0.15, [0, 0, -0.2]), K(0.4, [0, 0.3, -0.2]), K(0.7, [0, -0.3, -0.2]), K(1.0, [0, 0.3, -0.2]), K(1.6, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.2, [0.9, 0, 0.6]), K(1.2, [0.9, 0, 0.6]), K(1.6, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.2, [-0.9, 0, 0.6]), K(1.2, [-0.9, 0, 0.6]), K(1.6, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 1.0]), K(1.6, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 1.0]), K(1.6, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.2, [0, 0, 0.5]), K(1.2, [0, 0, 0.5]), K(1.6, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, -0.4]), K(1.2, [0, 0, -0.4]), K(1.6, Z)],
      earL: [K(0, Z), K(0.2, [-0.4, 0.2, 0]), K(1.2, [-0.4, 0.2, 0]), K(1.6, Z)],
      earR: [K(0, Z), K(0.2, [0.4, -0.2, 0]), K(1.2, [0.4, -0.2, 0]), K(1.6, Z)],
      pack: [K(0, Z), K(0.3, [0, 0, -0.25]), K(0.6, [0, 0, 0.2]), K(0.9, [0, 0, -0.25]), K(1.6, Z)],
      tail: wag(1.6, 0.8, 0.1),
    },
  },

  // frantic digging, triumphant unearthing, crushing disappointment
  lostPackage: {
    duration: 1.15, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.25], [0.05, 0.56, 0]), K(0.55, [0, 0, -0.25], [0.05, 0.56, 0]), K(0.7, [0, 0, 0.2], [0, 0.85, 0]), K(0.9, Z, HIP), K(1.15, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.6]), K(0.55, [0, 0, -0.6]), K(0.7, [0, 0, 0.35]), K(0.95, [0, 0, -0.2]), K(1.15, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.35]), K(0.55, [0, 0, 0.4]), K(0.7, [0, 0, -0.3]), K(0.95, [0, 0, 0.3]), K(1.15, Z)],
      // dig dig dig dig dig
      armL: [K(0, [0, 0, 0.28]), K(0.1, [0, 0, 1.4]), K(0.16, [0, 0, 0.4]), K(0.22, [0, 0, 1.4]), K(0.28, [0, 0, 0.4]), K(0.34, [0, 0, 1.4]), K(0.4, [0, 0, 0.4]), K(0.46, [0, 0, 1.4]), K(0.55, [0, 0, 0.4]), K(0.7, [-0.3, 0, 2.3]), K(0.95, [0.2, 0, 0.6]), K(1.15, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.13, [0, 0, 1.4]), K(0.19, [0, 0, 0.4]), K(0.25, [0, 0, 1.4]), K(0.31, [0, 0, 0.4]), K(0.37, [0, 0, 1.4]), K(0.43, [0, 0, 0.4]), K(0.49, [0, 0, 1.4]), K(0.55, [0, 0, 0.4]), K(0.7, [0.3, 0, 2.3]), K(0.95, [-0.2, 0, 0.6]), K(1.15, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, 0.9]), K(0.55, [0, 0, 0.9]), K(0.7, [0, 0, 0.1]), K(1.15, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.13, [0, 0, 0.9]), K(0.55, [0, 0, 0.9]), K(0.7, [0, 0, 0.1]), K(1.15, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.1, [-0.4, 0, 1.0]), K(0.55, [-0.4, 0, 1.0]), K(0.75, Z)],
      legR: [K(0, Z), K(0.1, [0.4, 0, 1.0]), K(0.55, [0.4, 0, 1.0]), K(0.75, Z)],
      shinL: [K(0, Z), K(0.1, [0, 0, -1.4]), K(0.55, [0, 0, -1.4]), K(0.75, Z)],
      shinR: [K(0, Z), K(0.1, [0, 0, -1.4]), K(0.55, [0, 0, -1.4]), K(0.75, Z)],
      earL: [K(0, Z), K(0.1, [-0.4, 0.15, 0]), K(0.7, [0.3, 0.4, 0]), K(0.95, [0.8, 0.1, 0]), K(1.15, Z)], // ears fall with the dust
      earR: [K(0, Z), K(0.1, [0.4, -0.15, 0]), K(0.7, [-0.3, -0.4, 0]), K(0.95, [-0.8, -0.1, 0]), K(1.15, Z)],
      pack: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.4, [0, 0, 0.3]), K(0.7, [0, 0, -0.3]), K(1.15, Z)],
      tail: wag(1.15, 0.8, 0.1),
    },
  },

  // finisher: box the foe, punt onto the train, salute the departure
  expressLiquidation: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.25, [0, 0, -0.15], [0.08, 0.66, 0]), K(0.5, Z, HIP), K(0.62, [0, 0, 0.25], [0, 0.92, 0]), K(0.75, Z, HIP), K(1.5, Z, HIP), K(2.4, Z, HIP)],
      torso: [K(0, Z), K(0.25, [0, 0, -0.4]), K(0.5, [0, 0, -0.1]), K(0.62, [0, 0, 0.3]), K(0.9, Z), K(1.5, [0, 0.1, 0.05]), K(2.4, Z)],
      head: [K(0, Z), K(0.25, [0, 0, -0.25]), K(0.62, [0, 0, 0.3]), K(0.9, Z), K(1.4, [0, 0.35, 0.1]), K(2.0, [0, 0.3, 0.1]), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.28]), K(0.25, [0.4, 0, 1.3]), K(0.45, [0.5, 0, 1.1]), K(0.62, [0.2, 0, -0.6]), K(0.9, [0, 0, 0.28]), K(1.3, [0, 0, 0.28]), K(2.4, [0, 0, 0.28])],
      armR: [K(0, [0, 0, 0.3]), K(0.25, [-0.4, 0, 1.3]), K(0.45, [-0.5, 0, 1.1]), K(0.62, [-0.2, 0, -0.6]), K(0.9, [0, 0, 0.3]), K(1.3, [0, 0, 2.7]), K(2.0, [0, 0, 2.7]), K(2.4, [0, 0, 0.3])], // salute
      forearmL: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 1.0]), K(0.62, [0, 0, 0.1]), K(1.0, [0, 0, 0.5]), K(2.4, [0, 0, 0.5])],
      forearmR: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 1.0]), K(0.62, [0, 0, 0.1]), K(1.3, [0, 0, -1.6]), K(2.0, [0, 0, -1.6]), K(2.4, [0, 0, 0.5])],
      legL: [K(0, Z), K(0.5, [0, 0, -0.4]), K(0.62, [0, 0, 1.7]), K(0.8, Z), K(2.4, Z)], // THE PUNT
      shinL: [K(0, Z), K(0.5, [0, 0, -1.2]), K(0.62, [0, 0, 0.05]), K(0.8, Z), K(2.4, Z)],
      legR: [K(0, Z), K(0.62, [0, 0, -0.3]), K(0.8, Z), K(2.4, Z)],
      earL: [K(0, Z), K(0.25, [-0.4, 0.15, 0]), K(0.62, [0.4, 0.3, 0]), K(0.9, Z), K(1.4, [0.15, 0.25, 0]), K(2.2, Z), K(2.4, Z)],
      earR: [K(0, Z), K(0.25, [0.4, -0.15, 0]), K(0.62, [-0.4, -0.3, 0]), K(0.9, Z), K(1.4, [-0.15, -0.25, 0]), K(2.2, Z), K(2.4, Z)],
      pack: [K(0, Z), K(0.3, [0, 0, 0.25]), K(0.62, [0, 0, -0.4]), K(0.9, Z), K(2.4, Z)],
      tail: wag(2.4, 0.8, 0.1),
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

function arenaBounds(fx) {
  let minX = -9, maxX = 9
  try {
    const b = fx.arena()?.bounds
    if (b) { minX = b.minX; maxX = b.maxX }
  } catch { /* arena optional */ }
  return { minX, maxX }
}

// scene lookup: walk up from a bone to the root ancestor; fall back to arena group
function sceneOf(fx) {
  try {
    let o = fx.self?.bones?.hips
    while (o && o.parent) o = o.parent
    if (o && (o.isScene || o.isObject3D)) return o
  } catch { /* keep looking */ }
  try { return fx.arena()?.group || null } catch { return null }
}

// model root (the group returned by buildModel) — for visibility tricks
function rootOf(fighter) {
  try {
    let o = fighter?.bones?.hips?.parent
    return o || null
  } catch { return null }
}

// low-poly settlement train — engine + n freight cars, built from primitives
function makeTrain(nCars = 4) {
  const g = new THREE.Group()
  // The source archetype's brand colour is amber/orange; ours is not, and this
  // engine used to be a 2.2 m slab of it filling the frame during the finisher.
  // It now wears OUR livery: near-black courier bodywork with a chartreuse
  // hi-vis band, which is also what he is wearing. (§9.4)
  const bodyM = lamb(P.SATCHEL_DARK, { surface: 'metal-painted' })
  const darkM = lamb(0x3a3f4a, { surface: 'metal-rough' })
  const cabM = lamb(0x4a4f58, { surface: 'metal-painted' })
  const wheelM = lamb(0x2a2a32, { surface: 'metal-rough' })
  const bandM = lamb(P.HI_VIS, { surface: 'plastic-gloss', emissive: P.HI_VIS, emissiveIntensity: 0.3 })
  const lightM = lamb(0xfff3b0, { surface: 'plastic-gloss', emissive: 0x665c20 })
  // engine
  const engine = new THREE.Group()
  engine.add(box(2.2, 1.1, 1.3, bodyM, 0, 1.0, 0))
  engine.add(box(0.9, 0.8, 1.1, cabM, -0.6, 1.9, 0))
  engine.add(cyl(0.22, 0.3, 0.5, darkM, 0.7, 1.8, 0)) // smokestack
  engine.add(box(0.35, 0.35, 0.9, lightM, 1.12, 0.85, 0)) // headlight
  engine.add(box(0.7, 0.7, 0.1, darkM, 1.05, 0.55, 0, 0, 0, Math.PI / 4)) // cowcatcher
  for (const zz of [0.55, -0.55]) for (const xx of [-0.7, 0, 0.7]) {
    const w = cyl(0.28, 0.28, 0.12, wheelM, xx, 0.3, zz, Math.PI / 2)
    engine.add(w)
  }
  g.add(engine)
  // freight cars — blocky settlement containers
  for (let i = 0; i < nCars; i++) {
    const car = new THREE.Group()
    car.position.x = -(i + 1) * 2.6
    const hue = i % 2 ? cabM : darkM
    car.add(box(2.3, 1.2, 1.25, hue, 0, 1.05, 0))
    car.add(box(1.5, 0.5, 1.28, bandM, 0, 1.05, 0)) // hi-vis band
    car.add(box(0.9, 0.5, 0.05, lamb(P.PAPER, { surface: 'paper' }), 0, 1.1, 0.66)) // shipping label
    for (const zz of [0.55, -0.55]) for (const xx of [-0.8, 0.8]) {
      car.add(cyl(0.26, 0.26, 0.12, wheelM, xx, 0.28, zz, Math.PI / 2))
    }
    g.add(car)
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// transparent afterimage clone of Bonko in a running pose
function makeAfterimage(opacity = 0.35) {
  const { group, bones } = buildModel(0)
  group.traverse((o) => {
    if (o.isMesh) {
      const list = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of list) {
        if (m) { m.transparent = true; m.opacity = opacity; m.depthWrite = false }
      }
      o.castShadow = false
      o.receiveShadow = false
    }
  })
  // frozen full-sprint pose
  try {
    bones.torso.rotation.z = -0.4
    bones.head.rotation.z = 0.15
    bones.armL.rotation.z = -1.1
    bones.armR.rotation.z = 0.9
    bones.forearmL.rotation.z = 0.9
    bones.forearmR.rotation.z = 0.9
    bones.legL.rotation.z = 1.0
    bones.legR.rotation.z = -1.0
    bones.shinL.rotation.z = -1.1
    bones.tail.rotation.x = 0.6
  } catch { /* pose is decorative */ }
  return group
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function dashPunchScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('whoosh', { pitch: 1.4 })
  const tryHit = () => {
    if (landed || !inRange(fx, 1.4)) return
    landed = true
    fx.sfx('punch_light', { pitch: 1.2 })
    fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 7 })
    fx.hit({ damage: 6, knockback: { x: 6.5, y: 1.5, spin: 0.5 }, hitStun: 15 })
  }
  // the punch travels — forward drift through startup+active
  for (let i = 0; i < 3; i++) {
    fx.after(4 + i * 3, () => {
      fx.impulse(fx.self, [F * 4.2, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.3, 0.12, 0), { n: 2 })
      tryHit()
    })
  }
  fx.after(13, tryHit)
  fx.after(22, end)
}

function slidingKickScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('slide')
  fx.sfx('bark', { pitch: 1.3 })
  const tryHit = () => {
    if (landed || !inRange(fx, 1.5)) return
    landed = true
    fx.sfx('kick')
    fx.shake(0.3)
    fx.particles('impact', v3(fx.foe.pos.x, 0.5, 0), { n: 8 })
    // sweep launcher: scoops them up off the floor
    fx.hit({ damage: 9, knockback: { x: 3, y: 9, spin: 1.4 }, hitStun: 26, ragdoll: 1 })
  }
  // loooong low slide
  for (let i = 0; i < 5; i++) {
    fx.after(6 + i * 3, () => {
      fx.impulse(fx.self, [F * 4.8, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.5, 0.1, 0), { n: 4 })
      tryHit()
    })
  }
  fx.after(20, tryHit)
  fx.after(34, end)
}

function sprintTackleScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let landed = false
  fx.sfx('bark')
  fx.sfx('whoosh', { pitch: 1.2 })
  const tryHit = () => {
    if (landed || !inRange(fx, 1.6)) return
    landed = true
    fx.sfx('punch_heavy')
    fx.shake(0.5)
    fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 12 })
    fx.hit({ damage: 11, knockback: { x: 5, y: 9.5, spin: 1.6 }, hitStun: 28, ragdoll: 1 })
  }
  // full-commitment sprint — fastest tackle in the mempool
  for (let i = 0; i < 5; i++) {
    fx.after(6 + i * 3, () => {
      fx.impulse(fx.self, [F * 5.5, 0, 0])
      fx.particles('dust', v3(fx.self.pos.x - F * 0.4, 0.12, 0), { n: 3 })
      tryHit()
    })
  }
  fx.after(21, tryHit)
  fx.after(34, end)
}

function wallJumpScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('boing')
  fx.after(4, () => {
    // kicks off a wall that does not exist. courier physics.
    try { fx.self.invuln = Math.max(fx.self.invuln || 0, 14) } catch { /* engine detail */ }
    fx.impulse(fx.self, [-F * 6.5, 8.5, 0])
    fx.particles('dust', v3(fx.self.pos.x + F * 0.4, 0.9, 0), { n: 6 })
    fx.sfx('whoosh', { pitch: 1.5 })
    fx.sfx('bark', { pitch: 1.6 })
  })
  fx.after(30, end)
}

function rapidPawScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let hits = 0
  fx.sfx('bark', { pitch: 1.4 })
  // 4 lightning paws, each nudging the foe just enough to eat the next one
  for (let i = 0; i < 4; i++) {
    fx.after(7 + i * 6, () => {
      if (!inRange(fx, 1.6)) return
      hits++
      const last = i === 3
      fx.sfx(last ? 'punch_heavy' : 'punch_light', { pitch: 1.2 + i * 0.15 })
      fx.particles('impact', v3(fx.foe.pos.x, 0.9 + (i % 2) * 0.4, 0), { n: last ? 12 : 5 })
      if (last) {
        fx.shake(0.45)
        fx.hit({ damage: 5, knockback: { x: 9, y: 3.5, spin: 1 }, hitStun: 22, ragdoll: 1 })
        if (hits === 4) fx.caption('4 TPS!')
      } else {
        fx.impulse(fx.self, [F * 1.2, 0, 0]) // creep forward with the flurry
        fx.hit({ damage: 3, knockback: { x: 1.2, y: 0.5 }, hitStun: 16 })
      }
    })
  }
  fx.after(42, end)
}

function deliveryTossScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  // this script drives the whole throw — mark the grab as spent so the engine's
  // generic throw sequence (_scanGrabs) never double-fires on top of it
  try { fx.self.hitDone = true } catch { /* engine detail */ }
  fx.sfx('grab')
  fx.after(8, () => {
    if (!inRange(fx, 1.5)) {
      fx.caption('ADDRESSEE UNKNOWN')
      fx.after(16, end)
      return
    }
    // stuff them in a box
    fx.sfx('bark')
    fx.hit({ damage: 3, knockback: { x: 0, y: 0 }, hitStun: 50 })
    let parcel = null
    fx.after(8, () => {
      parcel = fx.spawnProp('box', v3(clampToArena(fx, fx.foe.pos.x), fx.foe.pos.y + 0.9, 0))
      fx.particles('dust', v3(fx.foe.pos.x, 1.0, 0), { n: 6 })
      fx.sfx('thud', { pitch: 1.3 })
      fx.caption('PACKAGED!')
    })
    // ...and throw the box. with them in it.
    fx.after(24, () => {
      fx.sfx('throw')
      fx.shake(0.6)
      fx.slowmo(0.5, 0.3)
      fx.hit({ damage: 9, knockback: { x: 12, y: 6, spin: 2.5 }, hitStun: 34, ragdoll: 2 })
      if (parcel) { try { fx.impulse(parcel, [F * 11, 6, 0], 4) } catch { /* prop gone */ } }
      fx.particles('stars', v3(fx.foe.pos.x, 1.4, 0), { n: 6 })
      fx.caption('OUT FOR DELIVERY')
    })
  })
  fx.after(58, end)
}

function spamMintScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  // mints five worthless tokens per second and throws them at your face.
  // throughput IS the product.
  for (let i = 0; i < 5; i++) {
    fx.after(7 + i * 4, () => {
      fx.sfx('coin', { pitch: 1.2 + i * 0.1 })
      const p = fx.spawnProp('coin', v3(fx.self.pos.x + F * 0.7, 1.3 + (i % 2) * 0.3, 0))
      if (p) fx.impulse(p, [F * (8 + i * 1.2), 2.5, (Math.random() - 0.5) * 1.2], 2)
      if (inRange(fx, 3.4)) {
        fx.hit({ damage: 2, knockback: { x: 1.6, y: 0.6, spin: 0.3 }, hitStun: 14 })
        if (i === 4) {
          fx.shake(0.4)
          fx.hit({ damage: 3, knockback: { x: 9, y: 4, spin: 1.3 }, hitStun: 24, ragdoll: 1 })
          fx.caption('SUPPLY: UNLIMITED')
        }
      }
    })
  }
  fx.after(40, end)
}

function sameBlockScript(fx) {
  const end = onceEnd(fx)
  const root = rootOf(fx.self)
  let hidden = false
  const show = () => { if (hidden && root) { root.visible = true; hidden = false } }
  fx.caption('SAME-BLOCK DELIVERY')
  fx.sfx('bark', { pitch: 1.5 })
  // vanish in a speed blur
  fx.after(8, () => {
    try {
      if (root) { root.visible = false; hidden = true }
    } catch { /* visibility is cosmetic */ }
    fx.sfx('whoosh', { pitch: 1.7 })
    fx.particles('dust', v3(fx.self.pos.x, 0.9, 0), { n: 10 })
    fx.particles('sparks', v3(fx.self.pos.x, 1.0, 0), { n: 6 })
  })
  // reappear directly above the foe — zero confirmations required
  fx.after(16, () => {
    try {
      const fdir = fx.foe.pos.x >= fx.self.pos.x ? 1 : -1
      fx.self.pos.x = clampToArena(fx, fx.foe.pos.x - fdir * 0.7)
      fx.self.pos.y = 2.4
      if (fx.self.vel) { fx.self.vel.x = 0; fx.self.vel.y = 0 }
    } catch { /* teleport is best-effort */ }
    show()
    fx.sfx('whoosh', { pitch: 0.8 })
    fx.particles('dust', v3(fx.self.pos.x, 2.2, 0), { n: 8 })
    fx.zoom(fx.self, 0.4)
  })
  // the GIANT package arrives
  let pkg = null
  fx.after(22, () => {
    const px = clampToArena(fx, fx.foe.pos.x)
    pkg = fx.spawnProp('crate', v3(px, 3.6, 0), { mass: 10, breakable: true, health: 4 })
    if (pkg) {
      try {
        // dress the crate up as a comically overloaded parcel
        pkg.mesh?.add(box(0.78, 0.16, 0.78, lamb(0xa8834e, { surface: 'paper' }), 0, 0, 0))
        pkg.mesh?.add(box(0.2, 0.74, 0.74, lamb(0xe4e0d6, { surface: 'plastic-gloss' }), 0, 0, 0)) // packing tape
        pkg.mesh?.add(box(0.4, 0.22, 0.05, lamb(0xdcd6c8, { surface: 'paper' }), 0, 0.1, 0.37)) // FRAGILE label
        fx.impulse(pkg, [0, -16, 0])
      } catch { /* decoration only */ }
    }
    fx.sfx('whoosh', { pitch: 0.6 })
  })
  // impact: signature required, none obtained
  fx.after(30, () => {
    if (inRange(fx, 1.8) || Math.abs((fx.foe?.pos.x ?? 99) - fx.self.pos.x) < 2.2) {
      fx.sfx('thud')
      fx.sfx('break')
      fx.shake(0.9)
      fx.slowmo(0.4, 0.4)
      fx.hit({ damage: 17, knockback: { x: 3, y: -2, spin: 1.5 }, hitStun: 36, ragdoll: 2 })
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 16 })
      fx.particles('smoke', v3(fx.foe.pos.x, 0.6, 0), { n: 8 })
      fx.caption('DELIVERED IN 1 BLOCK')
    } else {
      fx.caption('WRONG ADDRESS!')
    }
    if (pkg) { try { pkg.break?.() } catch { /* already burst */ } }
  })
  // failsafe: NEVER stay invisible
  fx.after(60, show)
  fx.after(66, end)
}

function finalityScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const scene = sceneOf(fx)
  const { minX, maxX } = arenaBounds(fx)
  let train = null
  let trainX = F === 1 ? minX - 9 : maxX + 9
  const speed = 0.95 // meters per frame. absurd. as ordered.
  let hitDone = false
  let rolling = false

  fx.caption('FINALITY EXPRESS')
  fx.announcer('FINALITY')
  fx.sfx('bark', { pitch: 1.6 })
  fx.zoom(fx.self, 0.6)

  // train horn — two blasts, doppler-adjacent
  fx.after(6, () => { fx.sfx('trumpet', { pitch: 0.5 }); fx.sfx('thud', { vol: 0.4 }) })
  fx.after(14, () => { fx.sfx('trumpet', { pitch: 0.45 }); fx.shake(0.3) })

  fx.after(18, () => {
    try {
      train = makeTrain(4)
      train.position.set(trainX, 0, 0)
      if (F === -1) train.rotation.y = Math.PI
      if (scene) scene.add(train)
    } catch { train = null }
    fx.slowmo(0.6, 0.3)
  })

  fx.frame((age) => {
    if (age < 20 || !rolling) return
    trainX += F * speed
    try { if (train) train.position.x = trainX } catch { /* train derailed */ }
    // smoke + track rumble
    if (age % 3 === 0) {
      fx.particles('smoke', v3(Math.max(minX, Math.min(maxX, trainX + F * 0.6)), 2.4, 0), { n: 2 })
      fx.particles('dust', v3(Math.max(minX, Math.min(maxX, trainX)), 0.15, 0), { n: 2 })
    }
    if (age % 5 === 0) fx.shake(0.25)
    // the moment of settlement
    if (!hitDone && fx.foe && F * (trainX - fx.foe.pos.x) > -0.8) {
      hitDone = true
      fx.sfx('explosion')
      fx.sfx('thud')
      fx.shake(1.4)
      fx.slowmo(0.3, 0.7)
      fx.zoom(fx.foe, 0.8)
      fx.hit({ damage: 32, knockback: { x: F * 22, y: 10, spin: 4 }, hitStun: 60, ragdoll: 2 })
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 26 })
      fx.particles('sparks', v3(fx.foe.pos.x, 0.8, 0), { n: 16 })
      fx.caption('FINALITY')
      fx.announcer('SETTLED. NO REFUNDS')
    }
  })
  fx.after(20, () => { rolling = true })

  // train exits, cleanup — plus an unconditional failsafe removal
  const cleanup = () => {
    try { if (train && train.parent) train.parent.remove(train) } catch { /* gone */ }
    train = null
  }
  fx.after(72, () => { rolling = false; cleanup() })
  fx.after(120, cleanup) // failsafe (timers survive end())
  fx.after(88, end)
}

function gasFreeScript(fx) {
  const end = onceEnd(fx)
  if (!inRange(fx, 3.8)) {
    fx.caption('NO FEES. ALSO NO TARGET.')
    fx.sfx('bark', { pitch: 1.2 })
    fx.after(28, end)
    return
  }
  fx.caption('GAS-FREE COMBO')
  fx.sfx('bark', { pitch: 1.5 })
  // 8 dashes straight through the foe, alternating sides — zero fees paid
  for (let i = 0; i < 8; i++) {
    fx.after(10 + i * 6, () => {
      if (!fx.foe) return
      const side = i % 2 === 0 ? 1 : -1
      try {
        const fromX = fx.self.pos.x
        fx.self.pos.x = clampToArena(fx, fx.foe.pos.x + side * 1.1)
        fx.self.pos.y = 0
        if (fx.self.vel) { fx.self.vel.x = 0; fx.self.vel.y = 0 }
        // speed streak between the two points
        fx.particles('dust', v3((fromX + fx.self.pos.x) / 2, 0.7, 0), { n: 3 })
      } catch { /* teleport best-effort */ }
      fx.sfx('whoosh', { pitch: 1.3 + i * 0.06 })
      if (i % 3 === 0) fx.sfx('bark', { pitch: 1.4 + i * 0.05 })
      if (!inRange(fx, 1.8)) return
      const last = i === 7
      fx.particles('impact', v3(fx.foe.pos.x, 0.9 + (i % 3) * 0.3, 0), { n: last ? 14 : 4 })
      if (last) {
        fx.sfx('launch')
        fx.shake(0.8)
        fx.slowmo(0.35, 0.4)
        fx.hit({ damage: 4, knockback: { x: -side * 11, y: 7, spin: 2.5 }, hitStun: 34, ragdoll: 2 })
        fx.caption('TOTAL FEES: $0.00')
      } else {
        fx.sfx('punch_light', { pitch: 1.3 + i * 0.08 })
        fx.hit({ damage: 2, knockback: { x: -side * 1.5, y: 0.5 }, hitStun: 18 })
      }
    })
  }
  fx.after(84, end)
}

function infiniteTpsScript(fx) {
  const end = onceEnd(fx)
  const scene = sceneOf(fx)
  const { minX, maxX } = arenaBounds(fx)
  const clones = []
  const cleanup = () => {
    for (const c of clones) {
      try { if (c.g && c.g.parent) c.g.parent.remove(c.g) } catch { /* gone */ }
    }
    clones.length = 0
  }
  if (!fx.foe) { fx.after(20, end); return }

  fx.caption('INFINITE TPS')
  fx.announcer('UNLIMITED THROUGHPUT')
  fx.sfx('bark', { pitch: 1.6 })
  fx.shake(0.3)

  // 5 afterimages queue up offscreen, alternating sides
  fx.after(10, () => {
    try {
      for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? 1 : -1
        const g = makeAfterimage(0.28 + (i % 3) * 0.06)
        g.position.set(side === 1 ? maxX + 1.5 : minX - 1.5, 0, 0)
        g.rotation.y = side === 1 ? Math.PI : 0 // face travel direction
        if (scene) scene.add(g)
        clones.push({ g, side, start: 14 + i * 9, done: false })
      }
    } catch { /* clones are decorative; hits still land below */ }
  })

  fx.frame((age) => {
    for (const c of clones) {
      if (!c.done && age >= c.start) {
      try {
        c.g.position.x -= c.side * 1.1 // blistering rush speed
        if (age % 2 === 0) fx.particles('dust', v3(Math.max(minX, Math.min(maxX, c.g.position.x)), 0.5, 0), { n: 1 })
        // crossing the foe = one settled transaction
        if (fx.foe && c.side * (c.g.position.x - fx.foe.pos.x) < 0.3) {
          c.done = true
          fx.sfx('whoosh', { pitch: 1.5 })
          fx.sfx('punch_light', { pitch: 1.4 })
          fx.particles('impact', v3(fx.foe.pos.x, 1.1, 0), { n: 6 })
          // juggle: keep them airborne, alternating push
          fx.hit({ damage: 3, knockback: { x: -c.side * 2.5, y: 7.5, spin: 0.8 }, hitStun: 24 })
          fx.after(10, () => { try { if (c.g && c.g.parent) c.g.parent.remove(c.g) } catch { /* gone */ } })
        } else if (c.side === 1 ? c.g.position.x < minX - 2 : c.g.position.x > maxX + 2) {
          c.done = true // whiffed clean through
        }
      } catch { c.done = true }
      }
    }
  })

  fx.after(78, () => {
    fx.sfx('bark', { pitch: 1.3 })
    fx.caption('5 TX. 0 CONFIRMATION TIME.')
  })
  fx.after(96, end)
  fx.after(140, cleanup) // failsafe (timers survive end())
}

function lostPackageScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const digX = clampToArena(fx, fx.self.pos.x + F * 0.9)
  let relic = null
  fx.sfx('bark', { pitch: 1.7 })
  // frantic digging
  for (let i = 0; i < 5; i++) {
    fx.after(6 + i * 6, () => {
      fx.particles('dust', v3(digX, 0.25, 0), { n: 5 })
      fx.sfx('slide', { pitch: 1.2 + i * 0.1, vol: 0.5 })
    })
  }
  // unearths... THE GENESIS BLOCK?!
  fx.after(40, () => {
    relic = fx.spawnProp('crate', v3(digX, 0.6, 0), { mass: 2, breakable: true, health: 2 })
    if (relic) {
      try {
        relic.mesh?.add(box(0.5, 0.2, 0.05, lamb(0xdcd6c8, { surface: 'paper' }), 0, 0.06, 0.37)) // 'GENESIS BLOCK' label
        relic.mesh?.add(box(0.76, 0.08, 0.76, lamb(0x6b5230, { surface: 'wood-rough' }), 0, 0.3, 0))   // ancient dust cap
      } catch { /* decoration only */ }
    }
    fx.particles('dust', v3(digX, 0.7, 0), { n: 8 })
    fx.sfx('coin')
    fx.caption('THE GENESIS BLOCK?!')
    fx.zoom(fx.self, 0.5)
    fx.slowmo(0.5, 0.4)
  })
  // ...it poofs into dust
  fx.after(58, () => {
    if (relic) { try { relic.break?.() } catch { /* already dust */ } }
    fx.particles('smoke', v3(digX, 0.7, 0), { n: 14 })
    fx.particles('dust', v3(digX, 0.5, 0), { n: 10 })
    fx.sfx('break', { vol: 0.5 })
    fx.caption('IT WAS DUST ALL ALONG')
    fx.announcer('CRUSHING DISAPPOINTMENT')
    // the foe takes 1 damage from disappointment and simply sits down
    if (inRange(fx, 3.5)) {
      fx.hit({ damage: 1, knockback: { x: 1.5, y: 6, spin: 0.4 }, hitStun: 40, ragdoll: 1 })
      fx.sfx('boing', { pitch: 0.7 })
    }
  })
  fx.after(70, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const BonkoDef = {
  id: 'bonko',
  name: 'BONKO',
  title: 'The Fastest Block Alive',
  bio: 'A cattle-dog courier who guarantees same-block delivery or your gas back — trivially easy, since he never charges gas. Bonko herds slow transactions, barks at pending states, and has personally out-run three network congestions. His tail wags at 400,000 TPS and has never once stopped.',
  style: 'Extreme speed rushdown. Rapid dashes, momentum attacks, and hit-and-run flurries. Fragile if you can catch him. You cannot catch him.',
  stats: { power: 5, speed: 10, defense: 4, chaos: 6 },
  height: 1.7,
  weight: 0.95,
  walkSpeed: 6.4,   // fastest walk in the game
  dashSpeed: 13.5,  // fastest dash in the game
  jumpVel: 9,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'parcel-jab', name: 'Parcel Jab', kind: 'light',
      input: ['light'],
      damage: 5, startup: 4, active: 3, recovery: 7,
      hitbox: { w: 0.9, h: 0.7, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 4, y: 1, spin: 0.3 },
      hitStun: 13, blockStun: 7, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'parcelJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'dash-punch', name: 'Dash Punch', kind: 'light',
      input: ['forward', 'light'],
      damage: 6, startup: 6, active: 6, recovery: 10,
      hitbox: { w: 1.0, h: 0.8, d: 0.9, forward: 1.0, up: 1.0 },
      knockback: { x: 6.5, y: 1.5, spin: 0.5 },
      hitStun: 15, blockStun: 9, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'dashPunch', sfx: 'punch_light',
      script: dashPunchScript,
    },
    {
      id: 'tail-strike', name: 'Tail Strike', kind: 'kick',
      input: ['back', 'kick'],
      damage: 7, startup: 5, active: 4, recovery: 9,
      hitbox: { w: 1.1, h: 0.8, d: 1.1, forward: 0.7, up: 0.9 },
      knockback: { x: 7.5, y: 2.5, spin: 1.2 },
      hitStun: 17, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'tailStrike', sfx: 'whoosh', script: null,
    },
    {
      id: 'sliding-kick', name: 'Sliding Kick', kind: 'launcher',
      input: ['down', 'kick'],
      damage: 9, startup: 8, active: 10, recovery: 16,
      hitbox: { w: 1.4, h: 0.6, d: 1.0, forward: 1.1, up: 0.3 },
      knockback: { x: 3, y: 9, spin: 1.4 },
      hitStun: 26, blockStun: 11, hitStop: 4,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'slidingKick', sfx: 'slide',
      script: slidingKickScript,
    },
    {
      id: 'backpack-bash', name: 'Backpack Bash', kind: 'heavy',
      input: ['heavy'],
      damage: 11, startup: 10, active: 5, recovery: 17,
      hitbox: { w: 1.2, h: 1.0, d: 1.1, forward: 0.9, up: 1.1 },
      knockback: { x: 9, y: 3, spin: 1.5 },
      hitStun: 20, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'backpackBash', sfx: 'punch_heavy', script: null,
    },
    {
      id: 'sprint-tackle', name: 'Sprint Tackle', kind: 'launcher',
      input: ['forward', 'heavy'],
      damage: 11, startup: 9, active: 10, recovery: 15,
      hitbox: { w: 1.1, h: 1.2, d: 1.0, forward: 1.0, up: 0.9 },
      knockback: { x: 5, y: 9.5, spin: 1.6 },
      hitStun: 28, blockStun: 13, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'sprintTackle', sfx: 'whoosh',
      script: sprintTackleScript,
    },
    {
      id: 'wall-jump', name: 'Wall Jump', kind: 'light',
      input: ['back', 'light'],
      damage: 0, startup: 4, active: 6, recovery: 20,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 3, meterCost: 0, armor: 0,
      clip: 'wallJump', sfx: 'boing',
      script: wallJumpScript,
    },
    {
      id: 'rapid-paw-combo', name: 'Rapid Paw Combo', kind: 'kick',
      input: ['forward', 'kick'],
      damage: 14, startup: 6, active: 20, recovery: 16,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 9, y: 3.5, spin: 1 },
      hitStun: 22, blockStun: 12, hitStop: 3,
      launcher: false, ragdollThreshold: 1,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'rapidPaw', sfx: 'kick',
      script: rapidPawScript,
    },
    {
      id: 'delivery-toss', name: 'Delivery Toss', kind: 'grab',
      input: ['grab'],
      damage: 12, startup: 8, active: 4, recovery: 48,
      hitbox: { w: 0.9, h: 1.0, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 12, y: 6, spin: 2.5 },
      hitStun: 34, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'deliveryToss', sfx: 'grab',
      script: deliveryTossScript,
    },
    {
      id: 'signature-required', name: 'Signature Required', kind: 'grab',
      input: ['forward', 'grab'],
      damage: 11, startup: 9, active: 3, recovery: 38,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.0 },
      // spin-slam: full rotation, then planted signature-first
      knockback: { x: 4, y: 8.5, spin: 3 },
      hitStun: 32, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'signatureSlam', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'spam-mint', name: 'Spam Mint', kind: 'special',
      input: ['special'],
      damage: 13, startup: 7, active: 20, recovery: 15,
      hitbox: { w: 0.9, h: 1.0, d: 0.8, forward: 1.8, up: 1.2 },
      knockback: { x: 9, y: 4, spin: 1.3 },
      hitStun: 24, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'gasFree', sfx: 'coin',
      script: spamMintScript,
    },
    {
      id: 'same-block-delivery', name: 'Same-Block Delivery', kind: 'special',
      input: ['down', 'special'],
      damage: 17, startup: 10, active: 30, recovery: 26,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 0.8, up: 1.0 },
      knockback: { x: 3, y: -2, spin: 1.5 },
      hitStun: 36, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'sameBlock', sfx: 'whoosh',
      script: sameBlockScript,
    },
    {
      id: 'gas-free-combo', name: 'Gas-Free Combo', kind: 'special',
      input: ['forward', 'special'],
      damage: 18, startup: 8, active: 56, recovery: 20,
      hitbox: { w: 1.1, h: 1.2, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 11, y: 7, spin: 2.5 },
      hitStun: 34, blockStun: 12, hitStop: 4,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 0, armor: 0, // gas-free means FREE
      clip: 'gasFree', sfx: 'whoosh',
      script: gasFreeScript,
    },
    {
      id: 'infinite-tps', name: 'Infinite TPS', kind: 'special',
      input: ['back', 'special'],
      damage: 15, startup: 10, active: 60, recovery: 26,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 0.9, up: 1.0 },
      knockback: { x: 2.5, y: 7.5, spin: 0.8 },
      hitStun: 24, blockStun: 10, hitStop: 3,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 35, armor: 0,
      clip: 'infiniteTps', sfx: 'whoosh',
      script: infiniteTpsScript,
    },
    {
      id: 'finality-express', name: 'Finality Express', kind: 'super',
      input: ['super'],
      damage: 32, startup: 14, active: 50, recovery: 26,
      hitbox: { w: 1.4, h: 1.6, d: 1.2, forward: 1.0, up: 1.0 },
      knockback: { x: 22, y: 10, spin: 4 },
      hitStun: 60, blockStun: 18, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 8,
      clip: 'finality', sfx: 'trumpet',
      script: finalityScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'lost-package', name: 'Lost Package', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 16, active: 4, recovery: 50,
      hitbox: { w: 1.2, h: 1.0, d: 1.0, forward: 0.9, up: 0.8 },
      knockback: { x: 1.5, y: 6, spin: 0.4 },
      hitStun: 40, blockStun: 6, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'lostPackage', sfx: 'slide',
      script: lostPackageScript,
    },
  ],

  finisher: {
    id: 'express-liquidation',
    name: 'Express Liquidation',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const scene = sceneOf(fx)
      const { minX, maxX } = arenaBounds(fx)
      let train = null
      let trainX = F === 1 ? minX - 10 : maxX + 10
      const trainSpeed = 0.34 // slower freight — long enough to pinball on
      let parcel = null
      let rolling = false

      const cleanup = () => {
        try { if (train && train.parent) train.parent.remove(train) } catch { /* gone */ }
        train = null
      }

      fx.slowmo(0.45, 1.2)
      fx.zoom(fx.self, 0.8)
      fx.caption('EXPRESS LIQUIDATION')
      fx.announcer('EXPRESS LIQUIDATION')
      fx.sfx('bark', { pitch: 1.5 })
      fx.shake(0.4)
      try { fx.self.playClip?.('expressLiquidation') } catch { /* clip optional */ }

      // grab + box the foe
      fx.after(14, () => {
        fx.sfx('grab')
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 120 })
      })
      fx.after(24, () => {
        parcel = fx.spawnProp('box', v3(clampToArena(fx, fx.foe.pos.x), fx.foe.pos.y + 0.8, 0))
        if (parcel) {
          try {
            parcel.mesh?.add(box(0.15, 0.62, 0.62, lamb(0xe4e0d6, { surface: 'plastic-gloss' }), 0.24, 0, 0)) // tape
            parcel.mesh?.add(box(0.3, 0.16, 0.05, lamb(0xdcd6c8, { surface: 'paper' }), 0, 0.1, 0.31)) // label
          } catch { /* decoration only */ }
        }
        fx.particles('dust', v3(fx.foe.pos.x, 1.0, 0), { n: 8 })
        fx.sfx('thud', { pitch: 1.3 })
        fx.caption('PACKAGED FOR EXPORT')
      })

      // the freight train rolls in
      fx.after(30, () => {
        try {
          train = makeTrain(5)
          train.position.set(trainX, 0, -1.1) // on the back rail
          if (F === -1) train.rotation.y = Math.PI
          if (scene) scene.add(train)
        } catch { train = null }
        fx.sfx('trumpet', { pitch: 0.5 })
        fx.shake(0.4)
      })
      fx.after(30, () => { rolling = true })
      fx.frame(() => {
        if (!rolling) return
        trainX += F * trainSpeed
        try { if (train) train.position.x = trainX } catch { /* derailed */ }
        fx.particles('smoke', v3(Math.max(minX, Math.min(maxX, trainX + F * 0.6)), 2.4, -1.1), { n: 1 })
      })

      // THE PUNT — box + foe onto the passing cars
      fx.after(40, () => {
        fx.sfx('kick')
        fx.sfx('bark')
        fx.shake(0.8)
        fx.slowmo(0.4, 0.5)
        fx.hit({ damage: 8, knockback: { x: F * 9, y: 7, spin: 2 }, hitStun: 90, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 9, 8, -1])
        if (parcel) { try { fx.impulse(parcel, [F * 10, 8, -1], 4) } catch { /* prop gone */ } }
        fx.caption('LOADED!')
      })

      // pinballing between cars — impact stars every bounce
      const bounces = [56, 70, 84]
      bounces.forEach((f, i) => {
        fx.after(f, () => {
          const side = i % 2 === 0 ? 1 : -1
          fx.sfx(i % 2 === 0 ? 'thud' : 'boing', { pitch: 1 + i * 0.15 })
          fx.shake(0.6)
          try {
            const px = clampToArena(fx, fx.foe?.pos.x ?? fx.self.pos.x)
            const py = Math.max(1.0, fx.foe?.pos.y ?? 1.2)
            fx.particles('stars', v3(px, py, 0), { n: 7 })
            fx.particles('impact', v3(px, py, 0), { n: 6 })
          } catch { /* stars optional */ }
          fx.impulse(fx.foe, [side * 7, 9, 0], 2)
          if (parcel) { try { fx.impulse(parcel, [side * 6, 8, 0], 3) } catch { /* prop gone */ } }
        })
      })
      fx.after(72, () => fx.caption('HANDLE WITH CARE'))

      // final bounce: through the station roof
      fx.after(98, () => {
        fx.sfx('launch')
        fx.shake(1.1)
        fx.slowmo(0.3, 0.8)
        fx.zoom(fx.foe, 1.0)
        fx.impulse(fx.foe, [F * 4, 26, 1], 4)
        if (parcel) { try { fx.impulse(parcel, [F * 3, 22, 1], 5) } catch { /* prop gone */ } }
        fx.particles('sparks', v3(clampToArena(fx, fx.foe?.pos.x ?? 0), 2.4, 0), { n: 12 })
        fx.caption('RETURN TO SENDER')
        // roof debris rains down
        for (let i = 0; i < 3; i++) {
          fx.after(6 + i * 4, () => {
            const d = fx.spawnProp('box', v3(clampToArena(fx, (fx.foe?.pos.x ?? 0) + (i - 1) * 1.2), 4.5, (i - 1) * 0.5), { mass: 0.8 })
            if (d) { try { fx.impulse(d, [(Math.random() - 0.5) * 4, -2, 0], 3) } catch { /* prop gone */ } }
          })
        }
      })

      // re-entry: crash + PACKING PEANUTS EVERYWHERE
      fx.after(126, () => {
        fx.sfx('explosion')
        fx.sfx('thud')
        fx.shake(1.4)
        fx.hit({ damage: 18, knockback: { x: F * 5, y: 3, spin: 2 }, hitStun: 60, ragdoll: 2 })
        const px = clampToArena(fx, fx.foe?.pos.x ?? 0)
        fx.particles('impact', v3(px, 1.0, 0), { n: 20 })
        // packing peanuts: floaty white bits, wave after wave
        for (let i = 0; i < 4; i++) {
          fx.after(i * 4, () => {
            fx.particles('peanuts', v3(px + (Math.random() - 0.5), 1.4, 0), { n: 14 })
            fx.particles('confetti', v3(px, 1.8, 0), { n: 8 })
          })
        }
        if (parcel) { try { parcel.break?.() } catch { /* already burst */ } }
        fx.caption('DELIVERED.')
        fx.announcer('SIGNED, SEALED, LIQUIDATED')
        fx.sfx('bark', { pitch: 1.8 })
      })

      fx.after(112, () => { rolling = false; cleanup() })
      fx.after(200, cleanup) // failsafe (timers survive end())
      fx.after(150, end)
    },
  },

  voice: { pitch: 1.5, rate: 1.4 },
}
