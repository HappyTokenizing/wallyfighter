// Pooled impact-FX system — the shared VFX vocabulary for every hit in the game.
//
// ---------------------------------------------------------------------------
// v3.4 CHANGE LOG (round-2 critic findings, all measured):
//
//  * BLOOD DROPLETS NO LONGER READ AS JELLY BEANS. The `gib` family was
//    `skin-wet` + noMaps + roughness 0.28 — a physical preset carrying
//    clearcoat 0.85 / clearcoatRoughness 0.14, i.e. a mirror varnish, over one
//    flat colour and one flat roughness. Every droplet caught the same clean
//    specular hit at the same size in the same uniform red. It is now the
//    `skin` preset with its real map set (effective roughness 0.52, clearcoat
//    0.16), a dark-weighted six-entry palette, a 5x per-instance size spread,
//    +/-20% per-instance non-uniform scale, and VELOCITY ALIGNMENT — a droplet
//    in flight is now a lozenge stretched down its own travel vector.
//  * THE THROWN-SPLAT FEATURE WAS DEAD. update() zeroed p.vel on the line
//    ABOVE the splatSink call, so every landing droplet handed GoreSystem
//    {dx:0, dz:0} and the decal fell through to "dropped straight down". The
//    ground velocity is captured before the stop now.
//  * NO MORE STRAIGHT ROW OF SPECKS. Landed droplets used a single shared rest
//    height, so a fountain's worth of them lined up on one screen row. Rest
//    height, lie angle and flattening are per-particle now.
//  * THE IMPACT CHAIN SURVIVES HIT-STOP. Quads used to spawn at HIDDEN/alpha 0
//    and only become visible on their first update() tick — which never comes
//    during a 50-133 ms freeze, so the contact frame showed one soft bloom and
//    no ring, no sparks, no smear. _primeQuad() writes the birth pose
//    immediately, and the impact ring's 0.02 s delay is gone.
//  * HEAVY HITS ARE STRUCTURALLY DIFFERENT, not just louder: a second wider
//    ring at a different speed, and emissive embers with a tail.
//  * Near-camera soft fade in the quad shader, so a sprite passing the lens
//    dissolves instead of slicing the frame.
// ---------------------------------------------------------------------------
//
// v3.3 (GRAPHICS_CONTRACT §11 "VFX"). Five deliberately separated layers, ALL
// of them instanced — the whole FX budget is 8 draw calls no matter how busy
// the screen gets (v3.0 shipped 106 individual THREE.Sprite objects, i.e. up to
// 106 draw calls and 106 SpriteMaterials during an exchange):
//
//   SOLID    — THREE.InstancedMesh families (chunk / gib / coin / tooth /
//              ember). Real bevelled geometry, real pbr() materials, so debris
//              takes the key light, shows a specular lobe and casts a shadow.
//              Opaque: no alpha edges, no sorting artifacts. They fade by
//              SHRINKING, and they SETTLE — low-speed ground contact kills the
//              bounce, applies skid friction and damps the spin to rest instead
//              of buzzing on the floor (contract §11 "debris that settles").
//              `ember` is the one emissive family: it uses emissive() so hot
//              debris keys off the pipeline's bloom threshold rather than
//              cheating with a bright albedo.
//   BILLBOARD/ADDITIVE — ONE InstancedMesh of camera-facing quads,
//              AdditiveBlending, unlit ON PURPOSE: hit sparks, flash cores,
//              shock rings, radial smears, cartoon stars. These are emitters;
//              they must not be lit twice.
//   BILLBOARD/ALPHA    — ONE InstancedMesh, NormalBlending, also unlit on
//              purpose: smoke, dust, blood mist. The puff texture bakes a
//              directional light gradient so a puff still reads as a lit volume.
//   GROUND     — ONE InstancedMesh of floor-parallel quads: the shockwave ring
//              that spreads out from a heavy connect or a landing. Billboards
//              cannot do this — a ring that always faces the camera reads as a
//              halo, not as a wave travelling across the floor.
//
// All three quad pools share one 4x4 procedural ATLAS and one patched
// MeshBasicMaterial program, which is what collapses them to a draw call each.
// The patch is three small onBeforeCompile string replacements over stock
// chunks (`begin_vertex`, `project_vertex`, `alphamap_fragment`); if a chunk
// name ever moves the replace no-ops and the pool degrades to a non-billboarded
// or un-tiled quad rather than failing to compile.
//
// Soft particles: every quad is soft-edged (procedural radial-falloff alpha,
// never a hard quad) and is additionally ground-faded — its opacity ramps to
// zero as it sinks into the floor plane, which is where the hard intersection
// line was most visible. We do not have a scene depth pre-pass exposed to
// gameplay code (the post stack's depth belongs to the frame being composited),
// so this is a floor-plane approximation of a true depth fade; see the report.
//
// IMPACT WEIGHT: hitPower(p) is the one-shot channel GoreSystem uses to tell the
// pool how hard the hit that is about to burst actually was. A 3-damage jab and
// a 22-damage super used to fire the IDENTICAL 'impact'; now the jab gets a
// small flash and four sparks, and the super gets the full vocabulary — flash,
// expanding ring, sixteen stretched sparks, two long smears along the hit
// vector, dust and a ground shockwave. Different at a glance, not just louder.
//
// Named bursts (CONTRACTS.md §6, unchanged API): 'impact','sparks' (+alias
// 'spark'),'coins','smoke','dust','stars','confetti','explosion','peanuts',
// 'teeth', plus the §15 blood family 'blood' / 'blood_spray' /
// 'blood_fountain'. burst(name, pos, opts) and update(dt) are the only entry
// points MatchScreen uses; opts.n / opts.dirX / opts.dir keep their meaning.
//
// GORE MODES (game.save 'settings.gore'): 'none' | 'cartoon' | 'max'.
//   none    — impacts stay sparks/dust only; 'teeth' degrades to cartoon
//             stars; every blood request converts to sparks (zero red pixels).
//   cartoon — the above plus teeth, gibs, blood mist and floor droplets.
//   max     — bigger counts, longer-lived smoke, more gibs. Counts still
//             respect quality.particleScale / quality.maxDebris and are
//             hard-capped against the pool size (the recycler never allocates).
//
// MatchScreen constructs this pool without a game ref; Fighter attaches it at
// match start via attachGame(game) which re-reads the setting. There is no
// 'settings:changed' event today — we subscribe defensively in case one
// appears, and cheaply re-poll the (in-memory) save once a second in update().
//
// NO WHITE CUBES. The unknown-burst fallback routes to 'impact'.
import * as THREE from 'three'
import { pbr, emissive, decalTexture, roundedBox, chamferedCylinder, superellipsoid } from '../render/index.js'

const TAU = Math.PI * 2

const COLORS = {
  gold: 0xffcf3f, white: 0xf4f4f4, orange: 0xff8c2e, yellow: 0xffe14d,
  grey: 0x9aa0ad, red: 0xff4d5e, green: 0x37e07a, blue: 0x4dc3ff,
  purple: 0xb45cff, pink: 0xff6fd8, tan: 0xc9a166, brown: 0x8a6a42,
  ember: 0xff5d2e, peanut: 0xd8b26e, shell: 0xb98c4a, blast: 0xffd9a0,
  tooth: 0xf0ead6, smoke: 0x6d707a, smokeLit: 0xa8adb8, dustLit: 0xd8c39a,
  sparkHot: 0xfff0c4,
  // Blood family. v3.4: the round-2 critic measured the airborne cluster at
  // mean RGB (161,67,62) — uniformly saturated, uniformly BRIGHT, which is why
  // it read as jelly beans. Real spatter is nearly black in the fat drops and
  // only lifts toward red where a droplet is thin. The palette is now weighted
  // dark (four of six entries below 0x70) and `bloodBright` is a rim accent
  // used on roughly one droplet in six, not every third one.
  blood: 0x6d0f19, bloodDark: 0x400910, bloodDeep: 0x2a060b,
  bloodBright: 0x9c1622, bloodMist: 0x630e15,
}

// Airborne droplet tints, ordered so a modulo walk lands mostly on the dark
// entries. Index 3 is the only lifted one.
const BLOOD_TINTS = [
  COLORS.bloodDark, COLORS.blood, COLORS.bloodDeep, COLORS.bloodBright,
  COLORS.bloodDeep, COLORS.bloodDark,
]

const GORE_MODES = new Set(['none', 'cartoon', 'max'])

// ---------------------------------------------------------------------------
// Procedural FX textures. All of them are alpha-faded to nothing well inside
// the bitmap border, so no sprite and no decal can ever read as a rectangle.
// decalTexture() is cached by key, so a second ParticleSystem (rematch, replay)
// pays nothing. In a canvas-less environment (node harness) it returns null and
// every caller degrades to an untextured — but also invisible — pool.
// ---------------------------------------------------------------------------

function rng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// Soft radial deposit. `hard` is where the plateau ends (0 = pure falloff).
function blob(ctx, x, y, r, alpha = 1, hard = 0.35, tint = '255,255,255') {
  if (!(r > 0.25)) return
  const g = ctx.createRadialGradient(x, y, r * hard, x, y, r)
  g.addColorStop(0, `rgba(${tint},${alpha})`)
  g.addColorStop(0.42, `rgba(${tint},${alpha * 0.86})`)
  g.addColorStop(0.76, `rgba(${tint},${alpha * 0.34})`)
  g.addColorStop(0.92, `rgba(${tint},${alpha * 0.08})`)
  g.addColorStop(1, `rgba(${tint},0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

// Kill the bitmap border: everything past `keep` of the half-size ramps to
// alpha 0. This is the single line that makes "rotated rectangle" impossible.
function featherEdge(ctx, n, keep = 0.80) {
  const c = n / 2
  const g = ctx.createRadialGradient(c, c, c * keep, c, c, c * 0.995)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, n, n)
  ctx.globalCompositeOperation = 'source-over'
}

// Paint value variation INTO the existing alpha shape (alpha survives, RGB is
// replaced). Liquid stains are darkest at the rim — the coffee-ring effect —
// and that gradient is most of why a splat reads as fluid and not as paint.
function tintAtop(ctx, n, centreV, rimV) {
  const c = n / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, `rgb(${centreV},${centreV},${centreV})`)
  g.addColorStop(0.55, `rgb(${Math.round((centreV + rimV) * 0.5)},${Math.round((centreV + rimV) * 0.5)},${Math.round((centreV + rimV) * 0.5)})`)
  g.addColorStop(1, `rgb(${rimV},${rimV},${rimV})`)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, n, n)
  ctx.globalCompositeOperation = 'source-over'
}

/** Irregular blood splatter alpha, `variant` of SPLAT_VARIANTS. Lobed pool +
 *  satellite droplets + directional throw-off streaks + rim darkening. */
export function splatterTexture(variant = 0) {
  return decalTexture(`wcs-splat-v2-${variant}`, 256, (ctx, n) => {
    const R = rng(0x5f3a + variant * 7919)
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    // 1. main pool — a hard-cored, soft-rimmed mass of off-centre lobes. The
    //    plateau (`hard`) is what stops it reading as an airbrush circle: fluid
    //    has a defined edge with a thin wet rim, not a 40% gradient.
    const lobes = 4 + Math.floor(R() * 3)
    for (let i = 0; i < lobes; i++) {
      const a = R() * TAU
      const d = R() * n * 0.13
      blob(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, n * (0.085 + R() * 0.105), 1, 0.66)
    }
    // 2. secondary lobes bitten out of the perimeter — kills radial symmetry
    for (let i = 0; i < 4 + Math.floor(R() * 4); i++) {
      const a = R() * TAU
      const d = n * (0.10 + R() * 0.13)
      blob(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, n * (0.035 + R() * 0.075), 0.96, 0.55)
    }
    // 3. throw-off tails — fat where they leave the pool, breaking into
    //    droplets as they go. Built as chains so no rotate() is needed.
    const streaks = 3 + Math.floor(R() * 3)
    for (let s = 0; s < streaks; s++) {
      const a = R() * TAU
      const steps = 4 + Math.floor(R() * 4)
      const reach = n * (0.17 + R() * 0.19)
      for (let k = 1; k <= steps; k++) {
        const t = k / steps
        blob(ctx, c + Math.cos(a) * reach * t + (R() - 0.5) * n * 0.022,
          c + Math.sin(a) * reach * t + (R() - 0.5) * n * 0.022,
          n * (0.062 * (1 - t * 0.82) + 0.005), 0.92, 0.5)
      }
    }
    // 3. satellite droplets flung clear of the pool
    const drops = 10 + Math.floor(R() * 12)
    for (let i = 0; i < drops; i++) {
      const a = R() * TAU
      const d = n * (0.16 + R() * 0.19)
      blob(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, n * (0.006 + R() * 0.026), 0.6 + R() * 0.4, 0.5)
    }
    // v3.4 VALUE INVERSION. The old call was tintAtop(255, 108): bright core,
    // dark rim — the coffee-ring profile of a drying COFFEE stain, which is a
    // thin translucent film. Blood is not that. A fat pool is optically thick
    // and reads nearly black in the middle; only the feathered rim, where the
    // film is one drop deep, lifts toward red. Painting it the other way round
    // was a large part of why the shipped splat measured a 14/255 red delta on
    // marble — the brightest pixels sat exactly where the alpha was highest, so
    // the two cancelled.
    //
    // Centre 132 / rim 236: multiplied by the dark crimson instance colour this
    // gives an almost-black core with a visibly redder wet halo, which is what
    // blood on a light floor actually looks like.
    tintAtop(ctx, n, 132, 236)
    featherEdge(ctx, n, 0.86)
  })
}

/** Soft smoke/dust puff with a baked directional light gradient (upper-left
 *  key) so an unlit sprite still reads as a lit volume. */
export function puffTexture(variant = 0) {
  return decalTexture(`wcs-puff-${variant}`, 128, (ctx, n) => {
    const R = rng(0x9e11 + variant * 2657)
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    for (let i = 0; i < 9; i++) {
      const a = R() * TAU
      const d = R() * n * 0.19
      blob(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, n * (0.12 + R() * 0.17), 0.58, 0.24)
    }
    // baked key light: bright toward upper-left, shadowed lower-right. Without
    // this an unlit billboard is a flat disc, which is the classic tell.
    const g = ctx.createLinearGradient(n * 0.16, n * 0.10, n * 0.88, n * 0.96)
    g.addColorStop(0, 'rgb(255,255,255)')
    g.addColorStop(0.42, 'rgb(172,172,172)')
    g.addColorStop(1, 'rgb(62,62,62)')
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = g
    ctx.fillRect(0, 0, n, n)
    ctx.globalCompositeOperation = 'source-over'
    featherEdge(ctx, n, 0.78)
  })
}

/** Hot spark: tiny white core inside a warm glow. Additive. */
export function sparkTexture() {
  return decalTexture('wcs-spark', 64, (ctx, n) => {
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    blob(ctx, c, c, n * 0.46, 0.55, 0.0, '255,168,72')
    blob(ctx, c, c, n * 0.22, 0.95, 0.15, '255,226,170')
    blob(ctx, c, c, n * 0.09, 1, 0.4, '255,255,255')
    featherEdge(ctx, n, 0.7)
  })
}

/** Impact flash: hot core plus soft spikes. Additive. */
export function flashTexture() {
  return decalTexture('wcs-flash', 128, (ctx, n) => {
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    const spikes = 6
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * TAU + 0.2
      for (let k = 1; k <= 6; k++) {
        const t = k / 6
        blob(ctx, c + Math.cos(a) * n * 0.46 * t, c + Math.sin(a) * n * 0.46 * t,
          n * 0.09 * (1 - t * 0.75) + 1, 0.5 * (1 - t * 0.8), 0.1, '255,236,196')
      }
    }
    blob(ctx, c, c, n * 0.30, 0.85, 0.05, '255,214,142')
    blob(ctx, c, c, n * 0.13, 1, 0.35, '255,255,255')
    featherEdge(ctx, n, 0.82)
  })
}

/** Expanding shock ring — a soft annulus, sharp on the outside, smeared in. */
export function ringTexture() {
  return decalTexture('wcs-ring', 128, (ctx, n) => {
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.94)
    g.addColorStop(0.00, 'rgba(255,255,255,0)')
    g.addColorStop(0.55, 'rgba(255,236,200,0.05)')
    g.addColorStop(0.80, 'rgba(255,246,226,0.55)')
    g.addColorStop(0.90, 'rgba(255,255,255,1)')
    g.addColorStop(0.96, 'rgba(255,226,170,0.30)')
    g.addColorStop(1.00, 'rgba(255,200,120,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, n, n)
    featherEdge(ctx, n, 0.9)
  })
}

/** Radial smear — the stretched motion wedge that sells a heavy connect. */
export function smearTexture() {
  return decalTexture('wcs-smear', 128, (ctx, n) => {
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    ctx.save()
    ctx.translate(c, c)
    ctx.scale(1, 0.26)
    blob(ctx, 0, 0, n * 0.47, 0.85, 0.0)
    ctx.scale(1, 1.9)
    blob(ctx, 0, 0, n * 0.30, 0.5, 0.0)
    ctx.restore()
    tintAtop(ctx, n, 255, 176)
    featherEdge(ctx, n, 0.86)
  })
}

/** Cartoon impact star — soft-edged, five-pointed, never a quad. */
export function starTexture() {
  return decalTexture('wcs-star', 96, (ctx, n) => {
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    // Concentric fills give the star a soft gradient rim instead of one hard
    // polygon edge — it still reads as a cartoon star, just not as a decal.
    for (let pass = 0; pass < 6; pass++) {
      const k = 1 - pass * 0.085
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2
        const r = (i % 2 ? n * 0.17 : n * 0.44) * k
        const x = c + Math.cos(a) * r
        const y = c + Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = `rgba(255,255,255,${0.16 + pass * 0.14})`
      ctx.fill()
    }
    blob(ctx, c, c, n * 0.2, 0.6, 0.2)
    featherEdge(ctx, n, 0.9)
  })
}

/** Ground shockwave — a dusty annulus with radial filaments, seen from above.
 *  Deliberately NOT the same art as `ring`: a floor wave is dust being shoved
 *  outward, so it wants a broken, streaky leading edge, not a clean neon hoop. */
export function shockTexture() {
  return decalTexture('wcs-shock', 128, (ctx, n) => {
    const R = rng(0x2b71)
    const c = n / 2
    ctx.clearRect(0, 0, n, n)
    // filaments first, so the ring core sits on top of them
    for (let i = 0; i < 34; i++) {
      const a = R() * TAU
      const inner = n * (0.24 + R() * 0.12)
      const reach = n * (0.13 + R() * 0.20)
      const steps = 4
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const d = inner + reach * t
        blob(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d,
          n * (0.030 * (1 - t * 0.55) + 0.004), 0.30 * (1 - t * 0.8) + 0.04, 0.2)
      }
    }
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.92)
    g.addColorStop(0.00, 'rgba(255,255,255,0)')
    g.addColorStop(0.42, 'rgba(255,255,255,0.02)')
    g.addColorStop(0.66, 'rgba(255,255,255,0.26)')
    g.addColorStop(0.80, 'rgba(255,255,255,0.62)')
    g.addColorStop(0.88, 'rgba(255,255,255,0.34)')
    g.addColorStop(1.00, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(c, c, c * 0.92, 0, TAU)
    ctx.fill()
    featherEdge(ctx, n, 0.9)
  })
}

export const SPLAT_VARIANTS = 6

// ---------------------------------------------------------------------------
// The FX atlas. Every quad pool samples ONE texture, which is the whole reason
// the additive pass, the alpha pass and the ground pass are one draw call each
// instead of one per particle.
//
// Built by drawImage-ing the individual (already cached) FX canvases into a 4x4
// grid. It has to be done that way round: featherEdge() finishes with a
// `destination-in` composite, and destination-in is a WHOLE-CANVAS operation —
// running the painters directly into atlas sub-rects would erase every tile
// drawn before them.
//
// Tiles are feathered to alpha 0 at ~14% of their own cell, which is the mip
// gutter: cross-tile bleed only appears past mip 5, by which point a particle
// is a couple of pixels wide and its opacity is in the noise.
// ---------------------------------------------------------------------------
const ATLAS_GRID = 4
const FX_TILES = ['spark', 'flash', 'ring', 'smear', 'star', 'shock', 'puff0', 'puff1', 'puff2']
// canvas row r (0 = top) -> V offset, accounting for CanvasTexture flipY.
const TILE_UV = {}
for (let i = 0; i < FX_TILES.length; i++) {
  const cx = i % ATLAS_GRID
  const cy = (i / ATLAS_GRID) | 0
  TILE_UV[FX_TILES[i]] = [cx / ATLAS_GRID, 1 - (cy + 1) / ATLAS_GRID]
}
const TILE_STEP = 1 / ATLAS_GRID
const PUFFS = ['puff0', 'puff1', 'puff2']

/** UV origin of cell `i` of a 4x4 atlas, accounting for CanvasTexture flipY.
 *  Exported because GoreSystem's decal pool packs its six splatter alphas the
 *  same way for the same reason: one texture, one draw call. */
export function atlasTileUV(i) {
  const cx = i % ATLAS_GRID
  const cy = (i / ATLAS_GRID) | 0
  return [cx / ATLAS_GRID, 1 - (cy + 1) / ATLAS_GRID]
}
export const ATLAS_TILE_STEP = TILE_STEP

/** The six blood-splatter alphas packed into one atlas. Same construction as
 *  fxAtlas(): draw the individual (cached) canvases in, never run the painters
 *  into sub-rects — featherEdge()'s destination-in composite is whole-canvas
 *  and would erase every tile drawn before it. */
export function splatAtlas() {
  const src = []
  for (let i = 0; i < SPLAT_VARIANTS; i++) src.push(splatterTexture(i))
  return decalTexture('wcs-splat-atlas-v2', 1024, (ctx, n) => {
    const cell = n / ATLAS_GRID
    ctx.clearRect(0, 0, n, n)
    for (let i = 0; i < src.length; i++) {
      const img = src[i]?.image
      if (!img) continue
      try {
        ctx.drawImage(img, (i % ATLAS_GRID) * cell, ((i / ATLAS_GRID) | 0) * cell, cell, cell)
      } catch { /* unsupported image source */ }
    }
  })
}

export function fxAtlas() {
  const src = {
    spark: sparkTexture(), flash: flashTexture(), ring: ringTexture(),
    smear: smearTexture(), star: starTexture(), shock: shockTexture(),
    puff0: puffTexture(0), puff1: puffTexture(1), puff2: puffTexture(2),
  }
  // v1 in the key: bump it if a tile's art or the grid layout changes, or a
  // warm cache from a previous match hands back the old atlas.
  // 1024 = 4x4 cells of 256 px. decalTexture() clamps and power-of-twos this,
  // and silently drops to 256 if the texture budget is already spent — the UVs
  // are normalised, so a degraded atlas is softer but never wrong.
  return decalTexture('wcs-fx-atlas-v1', 1024, (ctx, n) => {
    const cell = n / ATLAS_GRID
    ctx.clearRect(0, 0, n, n)
    for (let i = 0; i < FX_TILES.length; i++) {
      const img = src[FX_TILES[i]]?.image
      if (!img) continue
      const x = (i % ATLAS_GRID) * cell
      const y = ((i / ATLAS_GRID) | 0) * cell
      try { ctx.drawImage(img, x, y, cell, cell) } catch { /* unsupported image source */ }
    }
  })
}

// ---------------------------------------------------------------------------
// Shader patch shared by all three quad pools.
//
// Stock MeshBasicMaterial gives us fog, tone mapping, output colour space,
// per-instance colour (instanceColor) and the transparent-pass state machine
// for free. We add exactly three things: a per-instance atlas tile, a
// per-instance opacity, and — for the two billboard pools — camera-facing
// orientation with a per-instance roll.
// ---------------------------------------------------------------------------
const FX_VERT_DECL = [
  'attribute float fxRot;',
  'attribute float fxOpacity;',
  'attribute vec2 fxTile;',
  'uniform vec2 fxTileScale;',
  'varying vec2 vFxUv;',
  'varying float vFxOpacity;',
  'varying float vFxDepth;',
  '',
].join('\n')

const FX_FRAG_DECL = [
  'uniform sampler2D fxAtlas;',
  'varying vec2 vFxUv;',
  'varying float vFxOpacity;',
  'varying float vFxDepth;',
  '',
].join('\n')

// Replaces <project_vertex>. instanceMatrix carries translation + a pure
// positive scale (we never put rotation in it), so column lengths ARE the quad
// size and the roll rides on the fxRot attribute instead.
const FX_BILLBOARD = [
  '  vec3 fxCenter = instanceMatrix[3].xyz;',
  '  vec2 fxSize = vec2( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ) );',
  '  vec2 fxQ = position.xy * fxSize;',
  '  float fxC = cos( fxRot );',
  '  float fxS = sin( fxRot );',
  '  vec4 mvPosition = modelViewMatrix * vec4( fxCenter, 1.0 );',
  '  mvPosition.xy += vec2( fxQ.x * fxC - fxQ.y * fxS, fxQ.x * fxS + fxQ.y * fxC );',
  '  vFxDepth = -mvPosition.z;',
  '  gl_Position = projectionMatrix * mvPosition;',
].join('\n')

// vFxDepth defaults to "far away" so the ground pool — which keeps the stock
// project_vertex and therefore never runs FX_BILLBOARD — is not near-faded.
const FX_UV_PASS = [
  '  vFxUv = fxTile + uv * fxTileScale;',
  '  vFxOpacity = fxOpacity;',
  '  vFxDepth = 999.0;',
  '  #include <begin_vertex>',
].join('\n')

// Replaces <alphamap_fragment>, i.e. AFTER <color_fragment>, so the atlas texel
// modulates a diffuseColor that already carries the per-instance tint.
// Camera-proximity soft fade. We do not have a scene depth pre-pass exposed to
// gameplay code, so a true soft-particle depth fade against arbitrary geometry
// is out of reach (the floor case is handled analytically in _updateQuads).
// This covers the other hard-edge case that actually shows: a spark or a puff
// passing within arm's reach of the lens, where a camera-facing quad clips the
// near plane and cuts a razor-straight line across the frame.
const FX_SAMPLE = [
  '  vec4 fxTexel = texture2D( fxAtlas, vFxUv );',
  '  diffuseColor *= fxTexel;',
  '  diffuseColor.a *= vFxOpacity * smoothstep( 0.16, 0.85, vFxDepth );',
].join('\n')

// Used when the vertex-side patch did NOT land. vFxUv / vFxOpacity / vFxDepth
// were declared but never written, and reading an unwritten varying is
// undefined behaviour — the pool would render garbage, and without the atlas
// lookup it would render garbage as full-white QUADS, which this file's header
// promises never to ship ("NO WHITE CUBES"). Dropping the alpha to zero is the
// honest degrade: the console.warn fires, and the failure is invisible rather
// than being the worst-looking thing on screen.
const FX_SAMPLE_BARE = '  diffuseColor.a = 0.0;'

let _warnedPatch = false

// ---------------------------------------------------------------------------
// Scratch objects. Nothing in the update loop allocates.
// ---------------------------------------------------------------------------
const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s3 = new THREE.Vector3()
const _v0 = new THREE.Vector3()
// Scratch for the camera-ward contact bias and the ribbon frame. _vBias and
// _vCam are written by both _camward() (called from burst()) and
// SwingRibbon.build() (called from update()) — never on the same stack. _vHit
// holds the biased contact point for the whole of one 'impact' burst, so it
// has to be a vector nothing else in that call chain touches.
const _vBias = new THREE.Vector3()
const _vCam = new THREE.Vector3()
const _vHit = new THREE.Vector3()
const _col = new THREE.Color()
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)
const _e = new THREE.Euler()
const UP_Y = new THREE.Vector3(0, 1, 0)
// Seconds of pool time a hitPower() weight stays fresh. One 60 Hz frame is
// 0.0167 s; every burst belonging to a hit is fired inside the same tick, so
// this only has to survive rounding.
const HIT_POWER_TTL = 0.05
// Ground contact below this speed stops the bounce and starts the settle.
const SETTLE_SPEED = 1.45

/** Tri-modal droplet size multiplier — see the sizeVar block in _solid().
 *  62% fine mist (0.28-0.66), 28% mid droplets (0.82-1.48), 10% fat gibs
 *  (1.85-2.95). Ratio 10.5:1, with real gaps between the populations. */
function sizeBand() {
  const r = Math.random()
  if (r < 0.62) return 0.28 + Math.random() * 0.38
  if (r < 0.90) return 0.82 + Math.random() * 0.66
  return 1.85 + Math.random() * 1.10
}
// Fraction of its target opacity a quad is born at. See _primeQuad().
const BIRTH_ALPHA = 0.42

// ---------------------------------------------------------------------------
// SWING RIBBON (feel-critic #1, part 3: "add a swing ribbon on the striking
// limb across the 3-4 startup frames so the approach is visible at all").
//
// One triangle strip per fighter, built from a short ring of limb-tip samples.
// Camera-facing: each rib is laid perpendicular to BOTH the local travel
// direction and the view vector, which is the only construction that keeps a
// trail readable from an arbitrary camera without it flipping inside out.
//
// Additive + vertex colours, so the taper is a BRIGHTNESS ramp to black rather
// than an alpha ramp: under AdditiveBlending black contributes nothing, which
// means the tail dissolves with no sorting and no depth write. depthWrite is
// off and the mesh is hidden (visible=false, i.e. zero draw calls) whenever no
// swing is live, so the whole feature costs nothing outside an attack window.
// ---------------------------------------------------------------------------
const RIBBON_RIBS = 14        // samples kept; 14 ribs = 13 quads = 26 triangles
const RIBBON_FADE = 0.13      // seconds from "stopped feeding" to invisible
const RIBBON_MIN_STEP = 0.012 // metres — a repeated sample (hit-stop) is dropped

class SwingRibbon {
  constructor(scene, renderOrder = 6) {
    this.scene = scene || null
    this.n = RIBBON_RIBS
    // 2 verts per rib, 6 indices per quad.
    const verts = this.n * 2
    this.posArr = new Float32Array(verts * 3)
    this.colArr = new Float32Array(verts * 3)
    const idx = new Uint16Array((this.n - 1) * 6)
    for (let i = 0, o = 0; i < this.n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3
      idx[o++] = a; idx[o++] = b; idx[o++] = c
      idx[o++] = b; idx[o++] = d; idx[o++] = c
    }
    this.geo = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.posArr, 3)
    this.aCol = new THREE.BufferAttribute(this.colArr, 3)
    this.aPos.setUsage(THREE.DynamicDrawUsage)
    this.aCol.setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('position', this.aPos)
    this.geo.setAttribute('color', this.aCol)
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1))
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      toneMapped: true, name: 'fxSwingRibbon',
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.name = 'fx:swingRibbon'
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.mesh.renderOrder = renderOrder
    this.mesh.visible = false
    this.scene?.add?.(this.mesh)

    // Sample ring: pts[i] = {x,y,z}. `count` samples written, newest last.
    this.pts = []
    for (let i = 0; i < this.n; i++) this.pts.push({ x: 0, y: 0, z: 0 })
    this.count = 0
    this.idle = 999      // seconds since the last push
    this.fresh = false   // fed since the last update() — see update()
    this.width = 0.16
    this.r = 1; this.g = 0.92; this.b = 0.74
    this.gain = 1
  }

  reset() {
    this.count = 0
    this.idle = 999
    this.fresh = false
    this.mesh.visible = false
  }

  /** Feed one limb-tip sample. Returns false when the sample was a duplicate
   *  (which is what a frozen frame produces, and a zero-length rib is a NaN
   *  normal waiting to happen). */
  push(x, y, z, opts) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
    if (opts) {
      if (Number.isFinite(opts.width)) this.width = opts.width
      if (Number.isFinite(opts.gain)) this.gain = opts.gain
      if (Number.isFinite(opts.color)) {
        _col.setHex(opts.color)
        this.r = _col.r; this.g = _col.g; this.b = _col.b
      }
    }
    if (this.count > 0) {
      const last = this.pts[this.count - 1]
      const dx = x - last.x, dy = y - last.y, dz = z - last.z
      if (dx * dx + dy * dy + dz * dz < RIBBON_MIN_STEP * RIBBON_MIN_STEP) {
        this.fresh = true // still swinging, just not moving — keep it alive
        return false
      }
    }
    if (this.count >= this.n) {
      // shift the ring down by one (14 entries — memmove is not worth it)
      for (let i = 1; i < this.n; i++) {
        const a = this.pts[i - 1], b = this.pts[i]
        a.x = b.x; a.y = b.y; a.z = b.z
      }
      this.count = this.n - 1
    }
    const p = this.pts[this.count++]
    p.x = x; p.y = y; p.z = z
    this.fresh = true
    return true
  }

  /** Rebuild the strip. `camPos` may be null (falls back to a world-up rib). */
  build(camPos) {
    const n = this.count
    if (n < 2) { this.mesh.visible = false; return }
    // Head-to-tail brightness taper, multiplied by the post-swing fade.
    const fade = this.idle <= 0 ? 1 : Math.max(0, 1 - this.idle / RIBBON_FADE)
    if (fade <= 0.001) { this.mesh.visible = false; return }
    const pos = this.posArr
    const col = this.colArr
    for (let i = 0; i < n; i++) {
      const p = this.pts[i]
      // travel direction at this rib (central difference where possible)
      const a = this.pts[i > 0 ? i - 1 : i]
      const b = this.pts[i < n - 1 ? i + 1 : i]
      _v0.set(b.x - a.x, b.y - a.y, b.z - a.z)
      if (_v0.lengthSq() < 1e-8) _v0.set(0, 1, 0)
      _v0.normalize()
      if (camPos) _vCam.set(camPos.x - p.x, camPos.y - p.y, camPos.z - p.z)
      else _vCam.set(0, 0, 1)
      if (_vCam.lengthSq() < 1e-8) _vCam.set(0, 0, 1)
      _vCam.normalize()
      _vBias.crossVectors(_v0, _vCam)
      if (_vBias.lengthSq() < 1e-8) _vBias.set(0, 1, 0)
      _vBias.normalize()
      // u = 0 at the oldest sample (tail), 1 at the newest (the limb tip).
      const u = n > 1 ? i / (n - 1) : 1
      // Width tapers to a point at the tail and eases in at the very head, so
      // the ribbon is a blade, not a stripe.
      const w = this.width * 0.5 * Math.pow(u, 0.72) * (1 - 0.35 * Math.pow(u, 6))
      const o = i * 6
      pos[o] = p.x + _vBias.x * w; pos[o + 1] = p.y + _vBias.y * w; pos[o + 2] = p.z + _vBias.z * w
      pos[o + 3] = p.x - _vBias.x * w; pos[o + 4] = p.y - _vBias.y * w; pos[o + 5] = p.z - _vBias.z * w
      // Brightness: cubic ramp so the tail is genuinely gone, not a grey band.
      const k = fade * this.gain * u * u * (0.35 + 0.65 * u)
      const cr = this.r * k, cg = this.g * k, cb = this.b * k
      col[o] = cr; col[o + 1] = cg; col[o + 2] = cb
      col[o + 3] = cr; col[o + 4] = cg; col[o + 5] = cb
    }
    // Collapse the unused tail of the buffer onto the oldest live rib so the
    // stale triangles are degenerate rather than pointing at the origin.
    if (n < this.n) {
      const src = (n - 1) * 6
      for (let i = n; i < this.n; i++) {
        const o = i * 6
        for (let k = 0; k < 6; k++) { pos[o + k] = pos[src + k]; col[o + k] = 0 }
      }
    }
    this.aPos.needsUpdate = true
    this.aCol.needsUpdate = true
    this.mesh.visible = true
  }

  update(dt, camPos) {
    if (this.count < 2) { this.mesh.visible = false; return }
    // A ribbon fed this frame is at full strength — the fade clock only starts
    // once the limb stops being handed to us (move over, cancelled, ragdolled).
    if (this.fresh) { this.idle = 0; this.fresh = false } else this.idle += dt
    if (this.idle > RIBBON_FADE) { this.reset(); return }
    this.build(camPos)
  }

  dispose() {
    try { this.scene?.remove?.(this.mesh) } catch { /* scene gone */ }
    try { this.geo.dispose() } catch { /* already gone */ }
    try { this.mat.dispose() } catch { /* already gone */ }
    this.scene = null
  }
}

export class ParticleSystem {
  constructor(scene, quality, game = null) {
    this.scene = scene
    this.scale = quality?.particleScale ?? 1
    this.maxDebris = quality?.maxDebris ?? Math.round(90 * this.scale)
    this.game = null
    this.gore = 'cartoon'
    this.groundY = 0
    // Set by MatchScreen. Used for exactly two things, both presentation:
    // biasing the contact cluster toward the lens (so it lands in front of the
    // victim rather than inside him) and orienting the swing ribbons.
    this.camera = null
    this._camPos = new THREE.Vector3()
    this._ribbons = new Map()
    this.splatSink = null       // GoreSystem plugs its decal pool in here
    this._splatBudget = 0
    this._goreTimer = 0
    this._offSettings = null
    this._disposed = false
    this._t = 0
    // Impact weight channel (see hitPower()). Neutral default so a caller that
    // never sets it gets exactly the old mid-weight 'impact'.
    this._hitPow = 0.45
    this._hitPowAt = -99
    if (game) this.attachGame(game)

    // ---- textures (cached module-wide; a rematch pays nothing) ------------
    // One atlas for every quad pool. Null in a canvas-less harness, in which
    // case the pools still allocate and tick — they just draw nothing.
    this.atlas = fxAtlas()
    this._tileScale = new THREE.Vector2(TILE_STEP, TILE_STEP)

    // ---- LAYER 1: instanced solid debris ---------------------------------
    // Real geometry, real pbr() materials, opaque, shadow-casting. They fade by
    // shrinking, so there is no alpha edge to go wrong and no sort order to get
    // right. Materials are unique:true because we never mutate them but we also
    // never want a global cache entry that an arena could pick up by accident.
    const md = Math.max(12, this.maxDebris)
    this.fam = {}
    this._mkFamily('chunk',
      superellipsoid(0.5, 0.42, 0.46, 3.1, 2.4, 10),
      pbr(0xffffff, 'plastic', { unique: true, guardAlbedo: false, noMaps: true, roughness: 0.62, metalness: 0.04 }),
      Math.max(14, Math.round(md * 0.5)))
    // BLOOD DROPLETS (round-2 P1 "glossy candy"). The shipped version was
    // `skin-wet` + noMaps + roughness 0.28. Three separate things made that
    // read as jelly beans, and all three had to go:
    //   1. `skin-wet` is a PHYSICAL preset carrying clearcoat 0.85 /
    //      clearcoatRoughness 0.14 — a near-mirror varnish. Every droplet
    //      caught the same clean specular hit, which is the candy tell.
    //   2. noMaps:true meant one flat colour and one flat roughness across the
    //      whole surface (contract §0.1), so nothing broke the highlight up.
    //   3. roughness 0.28 absolute is glass, not viscera.
    // Now: the `skin` preset (authored roughness 0.52, clearcoat 0.16) with its
    // real map set attached, a mild wet coat, and the environment turned most
    // of the way down so a bright gallery IBL cannot re-mirror them. Effective
    // roughness lands ~0.55, inside the 0.45–0.6 the critic asked for.
    //
    // mapOpts.size 256 keeps the extra map set to ~0.9 MB against the 80 MB
    // texture budget (README §7); scale 5 puts the grain at droplet scale
    // rather than character scale.
    this._mkFamily('gib',
      // Asymmetric exponents (2.2 lat / 3.4 lon) already give a lumpy, non-
      // ellipsoidal blob; per-instance non-uniform scale in _solid() finishes
      // the silhouette job so no two droplets share an outline.
      superellipsoid(0.5, 0.34, 0.44, 2.2, 3.4, 10),
      // No `roughness` override on purpose: the preset table is authoritative
      // (materials.js resolves `skin` to an effective 0.52) and passing a
      // multiplier > 1 is what trips the roughmul warnOnce. No `clearcoat`
      // override either — naming it would force MeshPhysicalMaterial even on
      // the `low` tier, defeating setMaterialQuality({ physical: false }). The
      // preset's own 0.16 / 0.55 is already a damp sheen, not a varnish.
      pbr(0xffffff, 'skin', {
        unique: true, guardAlbedo: false,
        mapOpts: { scale: 5, size: 256, wear: 0.55 },
        metalness: 0.0, envMapIntensity: 0.42,
        name: 'fxGib',
      }),
      Math.max(14, Math.round(md * 0.55)))
    this._mkFamily('coin',
      chamferedCylinder(0.5, 0.14, 0.035, 14),
      // metalness 0.92 (not 1) plus a faint emissive floor: a full metal with
      // no scene.environment renders BLACK, and ArenaBase's applyEnvironment()
      // is inside a try/catch. Coins must never be black holes.
      pbr(0xffffff, 'gold', {
        unique: true, guardAlbedo: false, noMaps: true, roughness: 0.19,
        metalness: 0.92, envMapIntensity: 1.4, emissive: 0x241800, emissiveIntensity: 0.5,
      }),
      Math.max(10, Math.round(md * 0.32)))
    this._mkFamily('tooth',
      roundedBox(0.62, 1, 0.5, 0.16, 2),
      pbr(0xffffff, 'bone', { unique: true, guardAlbedo: false, noMaps: true, roughness: 0.36, metalness: 0 }),
      Math.max(6, Math.round(md * 0.16)))
    // The one emissive family. emissive() puts the energy in the EMISSIVE
    // channel with a dark albedo, which is what the pipeline's bloom threshold
    // is tuned against — a white albedo lit hot enough to bloom would also blow
    // out the arena's exposure probe. Embers do not cast shadows (a glowing
    // fleck that casts a hard shadow is an instant tell) and they do not take a
    // per-instance tint, because every ember is the same temperature.
    this._mkFamily('ember',
      superellipsoid(0.5, 0.44, 0.5, 2.6, 2.6, 8),
      emissive(0xff6a24, 1.9, 'emissive', {
        unique: true, noMaps: true, guardAlbedo: false, roughness: 0.72, metalness: 0,
        name: 'fxEmber',
      }),
      Math.max(8, Math.round(md * 0.22)), { castShadow: false, tinted: false })

    // ---- LAYER 2/3/4: instanced quads, additive / alpha / ground ----------
    // Draw-call budget for the whole soft-FX vocabulary: three.
    this.add = this._mkQuads(Math.max(24, Math.round(64 * this.scale)), THREE.AdditiveBlending, 5, false, true)
    this.alpha = this._mkQuads(Math.max(20, Math.round(56 * this.scale)), THREE.NormalBlending, 4, true, true)
    this.ground = this._mkQuads(Math.max(6, Math.round(12 * this.scale)), THREE.NormalBlending, 3, true, false)

    // ---- LAYER 5: swing ribbons, one per fighter slot ---------------------
    // Allocated up front rather than on the first swing. A ribbon is two tiny
    // buffers and a material, but building one mid-match means a THREE uuid
    // draw off Math.random and a GC-visible allocation on the exact frame the
    // player threw a punch. Both meshes start visible:false, which in three
    // means they cost literally nothing until a swing feeds them.
    for (const slot of [0, 1]) this._ribbons.set(slot, new SwingRibbon(this.scene))
  }

  _mkFamily(name, geo, mat, count, opts = {}) {
    const n = Math.max(1, count | 0)
    const im = new THREE.InstancedMesh(geo, mat, n)
    im.name = `fx:${name}`
    im.frustumCulled = false
    im.castShadow = opts.castShadow !== false
    im.receiveShadow = false
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const slots = []
    for (let i = 0; i < n; i++) {
      im.setMatrixAt(i, HIDDEN)
      if (opts.tinted !== false) im.setColorAt(i, _col.setRGB(1, 1, 1))
      slots.push({
        active: false, life: 0, ttl: 1, size: 0.1, grav: 0, bounce: 0, grow: 0,
        sx: 1, sy: 1, sz: 1, stick: false, stuck: false, drag: 0, splat: 0,
        settled: false, rest: 0, align: 0, yLift: 0,
        vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(),
        pos: new THREE.Vector3(),
      })
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    this.scene?.add?.(im)
    this.fam[name] = { im, slots, cursor: 0, tinted: opts.tinted !== false }
    return this.fam[name]
  }

  /** Give a stock MeshBasicMaterial an atlas tile, a per-instance opacity and
   *  (optionally) camera-facing orientation. Three replacements over chunks
   *  that have been stable since r15x; each one is checked first, so a chunk
   *  rename degrades the look instead of breaking the program. */
  _patchQuadMaterial(mat, billboard) {
    const atlas = this.atlas
    const tileScale = this._tileScale
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.fxAtlas = { value: atlas }
      shader.uniforms.fxTileScale = { value: tileScale }
      let v = FX_VERT_DECL + shader.vertexShader
      let ok = true
      // The fragment side READS varyings the vertex side writes, so the
      // fragment patch is only safe once the vertex patch has landed.
      const vertOk = v.includes('#include <begin_vertex>')
      if (vertOk) v = v.replace('#include <begin_vertex>', FX_UV_PASS)
      else ok = false
      if (billboard) {
        // If project_vertex is missing, vFxDepth is never written even though
        // begin_vertex set it to 999 — that default is exactly why this is not
        // a fatal path, and why FX_UV_PASS writes it rather than FX_BILLBOARD
        // alone.
        if (v.includes('#include <project_vertex>')) v = v.replace('#include <project_vertex>', FX_BILLBOARD)
        else ok = false
      }
      let f = FX_FRAG_DECL + shader.fragmentShader
      if (f.includes('#include <alphamap_fragment>')) {
        f = f.replace('#include <alphamap_fragment>', vertOk ? FX_SAMPLE : FX_SAMPLE_BARE)
      } else ok = false
      shader.vertexShader = v
      shader.fragmentShader = f
      if (!ok && !_warnedPatch) {
        _warnedPatch = true
        console.warn('[combat] FX quad shader patch missed a chunk — particles will look wrong, not crash')
      }
    }
    // Two program variants only: billboarded and floor-parallel. Without this
    // three would hand the ground pool the billboard program (identical stock
    // parameters, different injected source).
    mat.customProgramCacheKey = () => (billboard ? 'wcsFxQuadBillboard' : 'wcsFxQuadGround')
  }

  /**
   * One instanced quad pool. `billboard` false = the quad keeps whatever
   * orientation the instance matrix gives it (the ground shockwave lies flat).
   *
   * UNLIT ON PURPOSE (contract §11): additive quads are emitters, alpha quads
   * bake their key light into the texture. Fog is OFF for the additive pass —
   * additive + fog BRIGHTENS distant emitters instead of burying them.
   */
  _mkQuads(count, blending, renderOrder, fogged, billboard) {
    const n = Math.max(4, count | 0)
    // Our own geometry (we hang instance attributes off it), so ours to dispose.
    const geo = new THREE.PlaneGeometry(1, 1)
    const aRot = new THREE.InstancedBufferAttribute(new Float32Array(n), 1)
    const aOpacity = new THREE.InstancedBufferAttribute(new Float32Array(n), 1)
    const aTile = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2)
    aRot.setUsage(THREE.DynamicDrawUsage)
    aOpacity.setUsage(THREE.DynamicDrawUsage)
    aTile.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('fxRot', aRot)
    geo.setAttribute('fxOpacity', aOpacity)
    geo.setAttribute('fxTile', aTile)

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      depthWrite: false, depthTest: true, blending, fog: !!fogged,
      // The billboard math can end up with either winding depending on the
      // roll; a two-sided unlit quad costs nothing and cannot vanish.
      side: THREE.DoubleSide,
      name: billboard ? (fogged ? 'fxAlpha' : 'fxAdditive') : 'fxGround',
    })
    this._patchQuadMaterial(mat, billboard)

    const im = new THREE.InstancedMesh(geo, mat, n)
    im.name = `fx:${mat.name}`
    im.frustumCulled = false
    im.castShadow = false
    im.receiveShadow = false
    im.renderOrder = renderOrder
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const slots = []
    for (let i = 0; i < n; i++) {
      im.setMatrixAt(i, HIDDEN)
      im.setColorAt(i, _col.setRGB(1, 1, 1))
      slots.push({
        active: false, life: 0, ttl: 1, size: 0.1, grav: 0, grow: 0, drag: 0,
        aspect: 1, opacity: 1, spin: 0, swirl: 0, fadeIn: 0.12, stretch: 0,
        rot: 0, flat: !billboard, groundFade: billboard,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), seed: Math.random() * 100,
      })
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    this.scene?.add?.(im)
    return { im, geo, slots, cursor: 0, aRot, aOpacity, aTile, billboard }
  }

  // --------------------------------------------------------------- plumbing

  /** Floor height, for the ground fade that keeps soft sprites from cutting a
   *  hard line into the floor. GoreSystem sets this from arena.floorY. */
  setGroundY(y) { if (Number.isFinite(y)) this.groundY = y }

  /**
   * Hand the pool the live match camera.
   *
   * THE CONTACT CLUSTER USED TO READ AS "A HAZE BEHIND HIS TORSO" and this is
   * the mechanism. MatchScreen's contact point sits on the attacker->victim
   * ray at the fist's reach, i.e. at roughly the victim's own depth. The
   * fighting camera looks across that axis, so a camera-facing quad centred
   * there is HALF INSIDE the victim's chest: depthWrite is off, but depthTest
   * is on, so the near half is culled by his own geometry and what survives is
   * the outer, dimmest ring — a haze with the bright core missing.
   *
   * Biasing the cluster a few tens of centimetres toward the lens puts the
   * whole quad in front of the body. Nothing about the hit moves: `pt` itself
   * is untouched, the ground wave still uses the true x/z, and gameplay never
   * sees this.
   */
  setCamera(cam) { this.camera = (cam && cam.isCamera) ? cam : null }

  /** Contact point pushed `amount` metres toward the camera. Never travels
   *  more than 40% of the way there, so a lens inside the action cannot fling
   *  the FX behind the near plane. Writes and returns a shared scratch vector:
   *  consume it before the next call. */
  _camward(pos, amount) {
    _vBias.set(pos.x || 0, pos.y || 0, pos.z || 0)
    const cam = this.camera
    if (!cam || !(amount > 0)) return _vBias
    const m = cam.matrixWorld && cam.matrixWorld.elements
    if (!m) return _vBias
    _vCam.set(m[12] - _vBias.x, m[13] - _vBias.y, m[14] - _vBias.z)
    const len = _vCam.length()
    if (!(len > 1e-3)) return _vBias
    _vBias.addScaledVector(_vCam, Math.min(amount, len * 0.4) / len)
    return _vBias
  }

  // ------------------------------------------------------------- swing ribbons

  /**
   * Feed one limb-tip sample to the ribbon named `key` (MatchScreen uses the
   * fighter slot). Called once per fixed step across the startup + active
   * window of an attack; the pool builds the strip in update().
   *
   * opts: { width, color, gain }. Duplicate samples are dropped, which is what
   * makes this hit-stop safe — a frozen frame feeds the same point and the
   * ribbon holds its shape instead of collapsing to a zero-length rib.
   */
  swing(key, x, y, z, opts) {
    if (this._disposed || !this.scene) return
    let r = this._ribbons.get(key)
    if (!r) {
      r = new SwingRibbon(this.scene)
      this._ribbons.set(key, r)
    }
    // A chain-cancelled follow-up can start swinging while the previous trail
    // is still fading. Appending to it would bridge two unrelated arcs with
    // one enormous stretched rib, so a new swing always starts empty.
    if (opts && opts.restart) r.reset()
    r.push(x, y, z, opts)
  }

  /** Stop feeding ribbon `key`; it fades out over RIBBON_FADE. */
  endSwing(key) {
    const r = this._ribbons.get(key)
    if (r) r.fresh = false
  }

  /** Hard-clear every ribbon. Called on any cut (round change, replay, KO
   *  cinematic) — a trail that survives a camera teleport is a smear. */
  clearSwings() {
    for (const r of this._ribbons.values()) r.reset()
  }

  /** GoreSystem registers its decal pool here; landing blood droplets then
   *  leave a real soft splat instead of freezing as a floating chunk.
   *  fn(x, z, size) — called at most a few times a second. */
  setSplatSink(fn) { this.splatSink = typeof fn === 'function' ? fn : null }

  /**
   * Declare how heavy the hit that is about to burst was, 0..1.
   *
   * GoreSystem.onDamage() is the caller: MatchScreen hands it the real damage
   * number and it runs immediately before every `burst('impact'|'sparks')` on
   * the same hit, so the weight and the burst are always the same event. The
   * value expires after HIT_POWER_TTL of pool time, which is a fraction of a
   * frame at any playable rate — a burst that arrives without a fresh weight
   * (arena scripts, specials, the KO cascade) falls back to the neutral 0.45
   * the v3.0 'impact' was tuned at, so nothing regresses.
   */
  hitPower(p) {
    if (!Number.isFinite(p)) return
    this._hitPow = p < 0 ? 0 : p > 1 ? 1 : p
    this._hitPowAt = this._t
  }

  _power() {
    return (this._t - this._hitPowAt) <= HIT_POWER_TTL ? this._hitPow : 0.45
  }

  // Hand the pool a game ref (Fighter does this at match start — MatchScreen
  // builds the pool before it has fighters). Idempotent; re-reads gore live.
  attachGame(game) {
    if (!game) return
    if (this.game !== game) {
      this._offSettings?.()
      this._offSettings = null
      this.game = game
      try {
        const off = game.events?.on?.('settings:changed', () => this._refreshGore())
        if (typeof off === 'function') this._offSettings = off
      } catch { /* event bus optional */ }
    }
    this._refreshGore()
  }

  _refreshGore() {
    const g = this.game?.save?.get?.('settings.gore', 'cartoon')
    this.gore = GORE_MODES.has(g) ? g : 'cartoon'
  }

  // ---------------------------------------------------------------- spawners

  // Shared launch vector: isotropic fan, dirX bias, or an explicit cone.
  _launch(out, cfg) {
    const sp = cfg.speed * (0.5 + Math.random() * 0.8)
    if (cfg.dir) {
      const spread = cfg.spread ?? 0.3
      out.set(
        (cfg.dir.x || 0) + (Math.random() - 0.5) * spread * 2,
        (cfg.dir.y || 0) + (Math.random() - 0.5) * spread * 2,
        (cfg.dir.z || 0) + (Math.random() - 0.5) * spread * 2
      )
      if (out.lengthSq() < 1e-6) out.set(0, 1, 0)
      out.normalize().multiplyScalar(sp)
      return sp
    }
    const a = Math.random() * TAU
    const upBias = cfg.upBias ?? 0.3
    out.set(Math.cos(a) * sp, Math.abs(Math.sin(a) * sp) * upBias + sp * (cfg.up ?? 0.4), Math.sin(a) * sp * 0.5)
    if (cfg.dirX) out.x = out.x * 0.4 + cfg.dirX * sp
    return sp
  }

  _jitter(out, pos, j) {
    const k = j ?? 0.2
    out.set(
      pos.x + (Math.random() - 0.5) * k,
      pos.y + (Math.random() - 0.5) * k,
      (pos.z || 0) + (Math.random() - 0.5) * k
    )
  }

  /** Spawn one opaque instanced debris particle. */
  _solid(famName, pos, cfg) {
    const f = this.fam[famName]
    if (!f) return
    let idx = -1
    for (let i = 0; i < f.slots.length; i++) {
      f.cursor = (f.cursor + 1) % f.slots.length
      if (!f.slots[f.cursor].active) { idx = f.cursor; break }
    }
    if (idx < 0) { f.cursor = (f.cursor + 1) % f.slots.length; idx = f.cursor } // recycle oldest
    const p = f.slots[idx]
    p.active = true
    this._jitter(p.pos, pos, cfg.jitter)
    this._launch(p.vel, cfg)
    p.spin.set((Math.random() - 0.5) * cfg.spin, (Math.random() - 0.5) * cfg.spin, (Math.random() - 0.5) * cfg.spin)
    p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
    p.life = -(cfg.delay ?? 0)
    p.ttl = cfg.ttl * (cfg.exactTtl ? 1 : 0.7 + Math.random() * 0.6)
    p.grav = cfg.grav
    // SIZE SPREAD. The stock jitter is 0.7..1.4 — a 2x range, which on a
    // spatter reads as "one droplet size, slightly wobbled".
    //
    // v3.5. `sizeVar` used to be `0.4 + pow(rand, 1.8) * 1.7`: a 5x range on
    // paper, but a CONTINUOUS one, and a continuous ramp is exactly what the
    // eye integrates back into "they are all about the same". The critic
    // measured it as "large and near-uniform; the claimed 5x spread does not
    // read at gameplay scale", and the second half of that is the real tell —
    // at 0.4x of a 10 cm base a droplet is 4 cm and simply below the threshold
    // where the eye can judge its size, so the only ones that registered were
    // the fat ones, all clustered near the top of the ramp.
    //
    // Three DISCRETE bands fix both halves. Discrete because separation is
    // what reads: fine mist, mid droplets and a couple of fat gibs, with
    // visible gaps between the populations rather than a smooth continuum.
    // 11x end to end, and the bases that feed it came down ~35% so the mid
    // band lands where a droplet is legible instead of chunky.
    p.size = cfg.size * (cfg.exactSize ? 1
      : cfg.sizeVar ? sizeBand()
        : 0.7 + Math.random() * 0.7)
    p.bounce = cfg.bounce ?? 0
    p.grow = cfg.grow ?? 0
    p.drag = cfg.drag ?? 0
    p.stick = !!cfg.stick
    p.stuck = false
    p.settled = false
    // >0 = orient this instance's local +Y down its own velocity and stretch it
    // by speed * align. A droplet in flight is a lozenge pointing where it is
    // going; a tumbling sphere is a pellet. See the align block in update().
    p.align = cfg.align ?? 0
    p.yLift = 0
    // Resting height = roughly half the debris, so it sits ON the floor rather
    // than at a constant 6 cm regardless of how big it is.
    p.rest = Math.max(0.012, p.size * 0.42)
    p.splat = cfg.splat ?? 0
    // Per-instance shape jitter. Same geometry for every instance is the price
    // of instancing; a +/-20% non-uniform scale buys back a genuinely different
    // silhouette per particle for one multiply each.
    const jx = 0.8 + Math.random() * 0.4
    const jy = 0.8 + Math.random() * 0.4
    const jz = 0.8 + Math.random() * 0.4
    p.sx = (cfg.sx ?? 1) * jx; p.sy = (cfg.sy ?? 1) * jy; p.sz = (cfg.sz ?? 1) * jz
    if (f.tinted && f.im.instanceColor) {
      f.im.setColorAt(idx, _col.setHex(cfg.color ?? 0xffffff))
      f.im.instanceColor.needsUpdate = true
    }
  }

  /** Claim a quad slot: first free one, else recycle the cursor's. */
  _claim(P) {
    for (let i = 0; i < P.slots.length; i++) {
      P.cursor = (P.cursor + 1) % P.slots.length
      if (!P.slots[P.cursor].active) return P.cursor
    }
    P.cursor = (P.cursor + 1) % P.slots.length
    return P.cursor
  }

  _tile(P, idx, name) {
    const uv = TILE_UV[name] || TILE_UV.puff0 || [0, 0]
    P.aTile.array[idx * 2] = uv[0]
    P.aTile.array[idx * 2 + 1] = uv[1]
    P.aTile.needsUpdate = true
  }

  /** Spawn one soft quad. `pool` is 'add' (emitters) or 'alpha' (volumes).
   *  `cfg.tile` names an atlas tile; there is no per-particle texture any more,
   *  which is exactly why the pool is one draw call. */
  _soft(pool, pos, cfg) {
    const P = pool === 'add' ? this.add : this.alpha
    if (!P || !P.slots.length) return
    const idx = this._claim(P)
    const p = P.slots[idx]
    p.active = true
    this._jitter(p.pos, pos, cfg.jitter)
    this._launch(p.vel, cfg)
    p.life = -(cfg.delay ?? 0)
    p.ttl = cfg.ttl * (cfg.exactTtl ? 1 : 0.75 + Math.random() * 0.5)
    p.size = cfg.size * (cfg.exactSize ? 1 : 0.7 + Math.random() * 0.7)
    p.grav = cfg.grav ?? 0
    p.grow = cfg.grow ?? 0
    p.drag = cfg.drag ?? 0
    p.swirl = cfg.swirl ?? 0
    p.aspect = cfg.aspect ?? 1
    p.stretch = cfg.stretch ?? 0
    p.opacity = cfg.opacity ?? 1
    p.fadeIn = cfg.fadeIn ?? 0.14
    p.spin = cfg.spin === undefined ? (Math.random() - 0.5) * 1.4 : cfg.spin
    p.seed = Math.random() * 100
    p.rot = cfg.angle ?? Math.random() * TAU
    this._tile(P, idx, cfg.tile || (pool === 'add' ? 'spark' : PUFFS[(Math.random() * PUFFS.length) | 0]))
    if (P.im.instanceColor) {
      P.im.setColorAt(idx, _col.setHex(cfg.color ?? 0xffffff))
      P.im.instanceColor.needsUpdate = true
    }
    this._primeQuad(P, idx, p)
  }

  /**
   * Write a newly-spawned quad's BIRTH transform and a partial opacity, right
   * now, instead of leaving it at HIDDEN until the first update() tick.
   *
   * WHY (round-2 P0, the "impact is a single soft orange bloom" finding): the
   * game's hit-stop freezes the whole fixed tick, particles included. A quad
   * that spawns at scale 0 / alpha 0 and only becomes visible on its first
   * update therefore renders as NOTHING for the entire 50–133 ms freeze — which
   * is exactly the window the player is staring at the contact. The authored
   * flash -> ring -> spark -> smear chain was being spawned and then held at
   * zero. MatchScreen owns the real fix (keep stepping the FX clock during
   * hit-stop); this makes the pool correct on its own regardless, because a
   * frozen frame now shows the vocabulary at its birth pose rather than
   * showing nothing.
   *
   * Birth alpha is 42% of target, not 100%: the no-pop-on property that the
   * old HIDDEN write was protecting still matters, it just did not need to be
   * bought with total invisibility.
   */
  _primeQuad(P, idx, p) {
    if (p.life < 0) {
      // Delayed stage — genuinely not born yet, stays hidden.
      P.aOpacity.array[idx] = 0
      P.im.setMatrixAt(idx, HIDDEN)
    } else {
      const s = p.size
      let aspect = p.aspect
      if (p.stretch > 0) {
        aspect = p.aspect * (1 + Math.min(3.2, p.vel.length() * p.stretch))
        p.rot = Math.atan2(p.vel.y, p.vel.x)
      }
      let a = p.opacity * BIRTH_ALPHA
      if (p.groundFade) {
        const half = s * 0.5
        const gf = half > 1e-4
          ? Math.min(1, Math.max(0, (p.pos.y - this.groundY) / (half * 1.15))) : 1
        a *= gf * gf * (3 - 2 * gf)
      }
      P.aOpacity.array[idx] = a > 0.004 ? a : 0
      _s3.set(s * aspect, s, 1)
      if (p.flat) {
        _e.set(-Math.PI / 2, p.rot, 0, 'YXZ')
        _q.setFromEuler(_e)
      } else {
        _q.identity()
        P.aRot.array[idx] = p.rot
      }
      _m4.compose(p.pos, _q, _s3)
      P.im.setMatrixAt(idx, _m4)
    }
    P.aOpacity.needsUpdate = true
    P.aRot.needsUpdate = true
    P.im.instanceMatrix.needsUpdate = true
  }

  /**
   * Floor-parallel shockwave. Not a billboard: this is dust being shoved out
   * across the ground, and it has to read as a ring travelling away from the
   * feet, which a camera-facing quad physically cannot do.
   */
  _ground(x, z, cfg) {
    const P = this.ground
    if (!P || !P.slots.length) return
    if (!Number.isFinite(x) || !Number.isFinite(z)) return
    const idx = this._claim(P)
    const p = P.slots[idx]
    p.active = true
    p.pos.set(x, this.groundY + 0.02 + (idx % 4) * 0.004, z)
    p.vel.set(0, 0, 0)
    p.life = -(cfg.delay ?? 0)
    p.ttl = cfg.ttl ?? 0.4
    p.size = cfg.size ?? 0.6
    p.grow = cfg.grow ?? 5
    p.grav = 0; p.drag = 0; p.swirl = 0; p.stretch = 0
    p.aspect = 1
    p.opacity = cfg.opacity ?? 0.4
    p.fadeIn = cfg.fadeIn ?? 0.06
    p.spin = 0
    p.rot = cfg.angle ?? Math.random() * TAU
    this._tile(P, idx, cfg.tile || 'shock')
    if (P.im.instanceColor) {
      P.im.setColorAt(idx, _col.setHex(cfg.color ?? 0xffffff))
      P.im.instanceColor.needsUpdate = true
    }
    this._primeQuad(P, idx, p)
  }

  // ------------------------------------------------------------------ bursts

  // The "no gore" substitute used by every blood entry point: hot sparks and a
  // scuff of dust. Zero red pixels, same weight and timing.
  _dryHit(pos, dirX, count) {
    for (let i = 0; i < count; i++) {
      this._soft('add', pos, {
        tile: 'spark', color: i % 3 ? COLORS.orange : COLORS.sparkHot,
        speed: 7, ttl: 0.3, grav: -18, size: 0.11, opacity: 0.95,
        stretch: 0.09, dirX, up: 0.4, jitter: 0.14, drag: 1.2,
      })
    }
    this._soft('alpha', pos, {
      tile: 'puff0', color: COLORS.smokeLit, speed: 0.7, ttl: 0.4,
      grav: 0.6, size: 0.4, grow: 1.6, opacity: 0.3, swirl: 0.5, drag: 2, up: 0.5,
    })
  }

  burst(name, pos, opts = {}) {
    if (this._disposed || !pos) return
    // NaN origin guard: one poisoned burst would strand pool slots at NaN
    // positions (never visible, never recycled until the cursor laps them).
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z ?? 0)) return
    // gm = gore debris multiplier (MAX only). Every count is capped to a slice
    // of the pool so one burst can never strobe-recycle the whole scene.
    const gm = this.gore === 'max' ? 1.5 : 1
    const cap = Math.max(8, Math.round(this.maxDebris * 0.45))
    const n = (base, goreScaled = false) =>
      Math.min(cap, Math.max(2, Math.round((opts.n ?? base) * this.scale * (goreScaled ? gm : 1))))
    // SECONDARY-EMITTER COUNT. `n()` lets opts.n override the base, which is
    // right for the headline emitter of a burst and WRONG for everything else
    // in it: GoreSystem asks for up to 24 blood droplets on a heavy hit, and
    // because the mist/ember/dust loops also went through n(), they were
    // silently promoted from 3 to 24 as well. Twenty-four overlapping
    // NormalBlending puffs at the contact point IS the "haze behind his torso"
    // the feel critic measured — the flash was never the problem, the fog in
    // front of it was. ns() honours quality scale and gore mode and ignores
    // opts.n entirely.
    const ns = (base, goreScaled = false) =>
      Math.min(cap, Math.max(1, Math.round(base * this.scale * (goreScaled ? gm : 1))))
    const dirX = opts.dirX ?? 0
    const smokeTtl = this.gore === 'max' ? 1.3 : 0.9 // MAX: smoke hangs longer
    // 0..1 weight of the hit this burst belongs to. See hitPower().
    const pw = Number.isFinite(opts.power) ? Math.min(1, Math.max(0, opts.power)) : this._power()

    switch (name) {
      case 'impact': {
        // THE CORE HIT LANGUAGE, scaled end to end by weight so a jab and a
        // super are different EVENTS, not the same event at two volumes:
        //   flash -> ring -> stretched sparks -> smear -> dust -> ground wave.
        // Only the flash and the sparks fire on the lightest pokes; the ring,
        // the second smear and the floor wave are earned.
        const heavy = pw >= 0.5
        // ---- THE CONTACT POINT, MOVED IN FRONT OF THE VICTIM --------------
        // See setCamera(). Everything camera-facing in this burst spawns at
        // `cp`, a copy of the contact point biased toward the lens; the ground
        // wave below deliberately still uses the TRUE pos.x/pos.z, because a
        // floor decal that slides toward the camera reads as a bug. The bias
        // grows with weight: a super's cluster is bigger and needs more room
        // to clear the torso than a jab's does.
        const cp = _vHit.copy(this._camward(pos, 0.34 + 0.24 * pw))
        // The wide, tinted flash. Peak opacity is deliberately held under 1:
        // an ADDITIVE soft disc that saturates loses its falloff — the visible
        // boundary becomes the radius where the sum clips, which is a hard
        // circle. That is what put "a hard-edged bright cyan/white disc on
        // marble" in the gore shot. The core below supplies the punch instead.
        this._soft('add', cp, {
          tile: 'flash', color: pw > 0.7 ? COLORS.white : COLORS.sparkHot,
          speed: 0.4, ttl: 0.07 + 0.06 * pw, size: 0.42 + 0.72 * pw,
          grow: 1.2 + 0.8 * pw, opacity: 0.40 + 0.32 * pw,
          exactTtl: true, exactSize: true, jitter: 0.05, fadeIn: 0.02, spin: 0,
        })
        // ---- HOT WHITE CORE ------------------------------------------------
        // Small, near-opaque, pure white, no jitter, dead on the contact point
        // and gone in three frames. This is the thing the eye actually fixes
        // on, and it is the half of the contact read that got lost when the
        // victim's own white flash was pulled back to 0.49% of his bbox. A
        // tight core costs no silhouette — unlike lighting the victim up, it
        // cannot turn him into a cutout, because it is 20 cm across.
        this._soft('add', cp, {
          tile: 'spark', color: 0xffffff, speed: 0,
          ttl: 0.045 + 0.035 * pw, size: 0.10 + 0.13 * pw,
          grow: 1.5 + 1.4 * pw, opacity: 0.85 + 0.15 * pw,
          exactTtl: true, exactSize: true, jitter: 0, fadeIn: 0.01, spin: 0,
        })
        if (pw > 0.24) {
          // delay was 0.02 s. That is ~1.2 frames of pool time, which is
          // nothing at 60 fps and EVERYTHING inside a hit-stop freeze: the ring
          // never got born, which is why the round-2 contact frame showed a
          // bloom and no ring. It is born on the contact frame now, and
          // _primeQuad() gives it a visible birth pose immediately.
          this._soft('add', cp, {
            tile: 'ring', color: COLORS.blast, speed: 0, ttl: 0.16 + 0.12 * pw,
            size: 0.22 + 0.16 * pw, grow: 3.4 + 4.4 * pw, opacity: 0.34 + 0.42 * pw,
            exactTtl: true, exactSize: true, jitter: 0.02, fadeIn: 0.02, spin: 0,
          })
        }
        // HEAVY-ONLY: a second, wider, later ring. One ring is a pop; two rings
        // travelling at different speeds is a shockwave, and it is the cheapest
        // read there is for "that one hurt". Light hits never get it, so the
        // difference between a jab and a launcher is structural, not volume.
        if (pw >= 0.62) {
          this._soft('add', cp, {
            tile: 'ring', color: COLORS.white, speed: 0, ttl: 0.3,
            size: 0.16, grow: 11 + 6 * pw, opacity: 0.16 + 0.16 * pw,
            exactTtl: true, exactSize: true, jitter: 0.01, fadeIn: 0.05,
            spin: 0, delay: 0.045,
          })
        }
        const sparks = Math.round(3 + 13 * pw)
        for (let i = 0; i < n(sparks, true); i++) {
          this._soft('add', cp, {
            tile: 'spark', color: i % 3 ? COLORS.yellow : COLORS.sparkHot,
            speed: 4.2 + 4.4 * pw, ttl: 0.22 + 0.16 * pw, grav: -16,
            size: 0.075 + 0.045 * pw, opacity: 1,
            stretch: 0.085, dirX, up: 0.5, jitter: 0.14 + 0.1 * pw, drag: 1.4,
          })
        }
        // Radial smear ALONG the hit vector: the wedge is what reads as "the
        // fist went that way", so it is oriented, not randomly rolled.
        for (let i = 0, sm = heavy ? 2 : 1; i < sm; i++) {
          this._soft('add', cp, {
            tile: 'smear', color: COLORS.blast, speed: 1.2, ttl: 0.1 + 0.08 * pw,
            size: 0.34 + 0.62 * pw, grow: 1.6 + 1.3 * pw, opacity: 0.24 + 0.34 * pw,
            aspect: 1 + 0.9 * pw, dirX, up: 0.2, jitter: 0.1, fadeIn: 0.02,
            angle: (dirX ? 0 : Math.random() * TAU) + (Math.random() - 0.5) * 0.4, spin: 0,
          })
        }
        for (let i = 0, du = heavy ? 2 : 1; i < du; i++) {
          this._soft('alpha', cp, {
            tile: PUFFS[i % PUFFS.length], color: COLORS.smokeLit, speed: 1.1,
            ttl: 0.34 + 0.18 * pw, grav: 0.7, size: 0.24 + 0.18 * pw,
            grow: 1.6 + 0.9 * pw, opacity: 0.18 + 0.12 * pw,
            swirl: 0.9, drag: 2.4, dirX, up: 0.5, jitter: 0.25,
          })
        }
        // HEAVY-ONLY: real emissive embers thrown down the hit vector. These go
        // through the `ember` family, i.e. emissive() — dark albedo, energy in
        // the emissive channel — so they key off the pipeline's bloom threshold
        // as EMITTERS instead of cheating with a bright albedo that would also
        // shove the arena's exposure probe (contract §11 / brief item 4). They
        // also outlive the flash by half a second, which gives the eye
        // something to follow after the pop and is what makes a heavy connect
        // read as an event with a tail rather than a single frame.
        if (pw >= 0.55) {
          for (let i = 0, em = Math.max(2, Math.round(2 + 4 * pw)); i < em; i++) {
            this._solid('ember', cp, {
              speed: 4.5 + 4 * pw, ttl: 0.5 + 0.4 * pw, grav: -19, size: 0.032 + 0.022 * pw,
              spin: 13, bounce: 0.36, drag: 0.7, dirX, up: 0.55, jitter: 0.16,
              align: 0.09,
            })
          }
        }
        // Only real connects push the floor — and only connects that are near
        // enough to it. A dust wave blooming under an air combo is the kind of
        // detail that reads as a bug even when nobody can say why.
        if (pw >= 0.55 && (pos.y - this.groundY) < 2.1) {
          this._ground(pos.x, pos.z ?? 0, {
            tile: 'shock', color: COLORS.dustLit, ttl: 0.3 + 0.14 * pw,
            size: 0.34 + 0.3 * pw, grow: 4 + 4 * pw, opacity: 0.14 + 0.2 * pw,
            delay: 0.02,
          })
        }
        break
      }

      case 'spark': // alias
      case 'sparks': {
        for (let i = 0; i < n(Math.round(7 + 10 * pw), true); i++) {
          this._soft('add', pos, {
            tile: 'spark', color: i % 3 ? COLORS.orange : COLORS.yellow,
            speed: 6.5 + 3.5 * pw, ttl: 0.34, grav: -20, size: 0.085, opacity: 1,
            stretch: 0.1, dirX, up: 0.4, jitter: 0.16, drag: 1.1,
          })
        }
        // Real embers: emissive, so the pipeline's bloom threshold catches them
        // as EMITTERS. They arc, bounce, skid and come to rest on the floor.
        for (let i = 0; i < ns(4); i++) {
          this._solid('ember', pos, {
            speed: 5.5, ttl: 0.85, grav: -20, size: 0.05,
            spin: 14, bounce: 0.42, drag: 0.6, dirX, up: 0.6, jitter: 0.14,
          })
        }
        break
      }

      case 'coins': {
        for (let i = 0; i < n(12, true); i++) {
          this._solid('coin', pos, {
            color: COLORS.gold, speed: this.gore === 'max' ? 5.2 : 4.5, ttl: 1.5,
            grav: -22, size: 0.17, spin: 10, bounce: 0.5, up: 1.1, upBias: 1,
            sy: 1, drag: 0.15,
          })
        }
        for (let i = 0; i < 3; i++) {
          this._soft('add', pos, {
            tile: 'spark', color: COLORS.gold, speed: 2.5, ttl: 0.5, grav: -8,
            size: 0.13, opacity: 0.8, up: 1, jitter: 0.3,
          })
        }
        break
      }

      case 'smoke': {
        for (let i = 0; i < n(7, true); i++) {
          this._soft('alpha', pos, {
            tile: PUFFS[i % PUFFS.length], color: i % 2 ? COLORS.smoke : COLORS.smokeLit,
            speed: 1.1, ttl: smokeTtl, grav: 1.9, size: 0.5, grow: 2.4,
            opacity: 0.34, swirl: 1.3, drag: 1.1, up: 0.9, jitter: 0.28,
          })
        }
        break
      }

      case 'dust': {
        // ground scuffs — turbulent, drag-heavy, hugging the floor
        for (let i = 0; i < n(8); i++) {
          this._soft('alpha', pos, {
            tile: PUFFS[i % PUFFS.length], color: i % 2 ? COLORS.dustLit : COLORS.tan,
            speed: 2.1, ttl: 0.75, grav: 0.9, size: 0.42, grow: 2.6,
            opacity: 0.3, swirl: 1.6, drag: 3.2, up: 0.28, dirX, jitter: 0.32,
          })
        }
        // The scuff used to be a camera-facing smear, which floated when the
        // camera dropped low. It is a floor decal now, so it stays on the floor.
        this._ground(pos.x, pos.z ?? 0, {
          tile: 'shock', color: COLORS.tan, ttl: 0.42, size: 0.38,
          grow: 3.4, opacity: 0.2,
        })
        break
      }

      case 'explosion': {
        const chunks = n(16, true)
        // opacity was 1 on a 1.7 m disc that grows to 3.7 m. An additive quad
        // at alpha 1 clips its whole plateau AND most of its falloff, so the
        // only visible boundary is the radius where the sum drops back under
        // white — a razor-sharp circle several metres across, which on a pale
        // marble floor reads as a hard-edged bright cyan/white disc. 0.62 keeps
        // the falloff inside the displayable range; the small core below is
        // what actually clips, and a 40 cm clipped core is a highlight.
        this._soft('add', pos, {
          tile: 'flash', color: 0xfff3d6, speed: 0.4, ttl: 0.15, size: 1.7,
          grow: 2.2, opacity: 0.62, exactTtl: true, exactSize: true, jitter: 0.05,
          fadeIn: 0.02, spin: 0,
        })
        this._soft('add', pos, {
          tile: 'spark', color: 0xffffff, speed: 0, ttl: 0.09, size: 0.34,
          grow: 2.6, opacity: 1, exactTtl: true, exactSize: true, jitter: 0,
          fadeIn: 0.01, spin: 0,
        })
        // a real wave across the floor, not just a halo around the camera axis
        if ((pos.y - this.groundY) < 3.2) {
          this._ground(pos.x, pos.z ?? 0, {
            tile: 'shock', color: COLORS.blast, ttl: 0.55, size: 0.8,
            grow: 9, opacity: 0.38, delay: 0.03,
          })
        }
        // fireball puffs are the expensive half (big, additive, overlapping) —
        // capped independently of the debris count so a n:30 execution call
        // cannot turn the screen into one white overdraw sheet.
        for (let i = 0, fb = Math.min(14, chunks); i < fb; i++) {
          const fire = [COLORS.orange, COLORS.ember, COLORS.yellow, COLORS.blast]
          this._soft('add', pos, {
            tile: PUFFS[i % PUFFS.length], color: fire[i % fire.length],
            speed: 6.5, ttl: 0.45, grav: -3, size: i % 3 ? 0.35 : 0.75,
            grow: 1.5, opacity: 0.75, swirl: 1.4, drag: 3.4, dirX, up: 0.55, jitter: 0.3,
          })
        }
        this._soft('add', pos, {
          tile: 'ring', color: COLORS.blast, speed: 0, ttl: 0.42, size: 0.5,
          grow: 13, opacity: 0.75, exactTtl: true, exactSize: true, delay: 0.05,
          jitter: 0.02, fadeIn: 0.02, spin: 0,
        })
        for (let i = 0; i < Math.max(3, Math.round(chunks / 3)); i++) {
          this._soft('alpha', pos, {
            tile: PUFFS[i % PUFFS.length], color: COLORS.smoke, speed: 1.6,
            ttl: 0.95, grav: 2.4, size: 0.7, grow: 2.3, opacity: 0.42,
            swirl: 1.5, drag: 1.4, up: 1, delay: 0.12, jitter: 0.4,
          })
        }
        for (let i = 0; i < Math.max(3, Math.round(chunks / 2)); i++) {
          this._solid('chunk', pos, {
            color: 0x4a4a52, speed: 8, ttl: 1.1,
            grav: -22, size: 0.12, spin: 15, bounce: 0.35, drag: 0.3,
            dirX, up: 0.7, jitter: 0.3,
          })
        }
        for (let i = 0; i < Math.max(2, Math.round(chunks / 4)); i++) {
          this._solid('ember', pos, {
            speed: 9, ttl: 1.2, grav: -22, size: 0.085, spin: 16,
            bounce: 0.4, drag: 0.35, dirX, up: 0.8, jitter: 0.3,
          })
        }
        break
      }

      case 'peanuts': {
        for (let i = 0; i < n(12); i++) {
          this._solid('chunk', pos, {
            color: i % 2 ? COLORS.peanut : COLORS.shell, speed: 4, ttl: 1.4,
            grav: -22, size: 0.12, spin: 10, bounce: 0.45, sx: 1.5, sz: 0.8,
            up: 1, upBias: 1, dirX, drag: 0.2,
          })
        }
        break
      }

      case 'stars': {
        for (let i = 0; i < n(6); i++) {
          this._soft('add', pos, {
            tile: 'star', color: COLORS.yellow, speed: 2.2, ttl: 0.9, grav: 1,
            size: 0.3, opacity: 0.95, up: 0.8, jitter: 0.22, spin: (Math.random() - 0.5) * 6,
          })
        }
        break
      }

      case 'confetti': {
        const cols = [COLORS.red, COLORS.green, COLORS.blue, COLORS.purple, COLORS.pink, COLORS.gold]
        for (let i = 0; i < n(24); i++) {
          this._solid('chunk', pos, {
            color: cols[i % cols.length], speed: 4, ttl: 1.7, grav: -5,
            size: 0.13, spin: 14, sy: 0.16, sx: 1.2, up: 1.2, upBias: 1, drag: 0.9,
          })
        }
        break
      }

      case 'teeth': {
        if (this.gore === 'none') { this.burst('stars', pos, { n: 3 }); break }
        const teeth = Math.min(this.gore === 'max' ? 11 : 6, n(this.gore === 'max' ? 8 : 5))
        for (let i = 0; i < teeth; i++) {
          this._solid('tooth', pos, {
            color: i % 4 === 3 ? 0xfffaf0 : COLORS.tooth,
            speed: this.gore === 'max' ? 4.2 : 3.2,
            ttl: this.gore === 'max' ? 1.7 : 1.2, grav: -22, size: 0.09,
            spin: 11, bounce: 0.42, sx: 0.85, sy: 1.15, sz: 0.6,
            up: 1, upBias: 1, dirX, jitter: 0.16,
          })
        }
        this.burst('stars', pos, { n: 4 })
        break
      }

      case 'blood': {
        if (this.gore === 'none') { this._dryHit(pos, dirX, n(8)); break }
        for (let i = 0; i < n(10, true); i++) {
          this._solid('gib', pos, {
            color: BLOOD_TINTS[i % BLOOD_TINTS.length], speed: 3.6,
            ttl: this.gore === 'max' ? 1.5 : 1.1, grav: -22, size: 0.068,
            sizeVar: true, align: 0.17,
            spin: 8, stick: true, splat: 0.55, drag: 0.35, dirX, up: 0.7, jitter: 0.25,
          })
        }
        // ns(), not n(): opts.n is the DROPLET count GoreSystem scales with
        // damage, and letting it drive the mist too is what fogged the contact
        // point on every heavy hit. `mist` (0..1, from GoreSystem) trims it
        // further on light pokes. Opacity 0.5 -> 0.34 for the same reason: the
        // mist is a hint of atomised blood, not a smoke screen in front of the
        // thing the player is trying to read.
        const mist = Number.isFinite(opts.mist) ? Math.max(0, Math.min(1, opts.mist)) : 1
        for (let i = 0, mn = Math.round(ns(3) * mist); i < mn; i++) {
          this._soft('alpha', pos, {
            tile: PUFFS[i % PUFFS.length], color: COLORS.bloodMist, speed: 2.4,
            ttl: 0.34, grav: -4, size: 0.26, grow: 1.5, opacity: 0.34,
            drag: 4, dirX, up: 0.4, jitter: 0.18,
          })
        }
        break
      }

      case 'blood_spray': {
        if (this.gore === 'none') { this._dryHit(pos, dirX, n(8)); break }
        const dir = opts.dir || { x: dirX || 1, y: 0.55, z: 0 }
        for (let i = 0; i < n(12, true); i++) {
          this._solid('gib', pos, {
            // stride 5, coprime with the 6-entry palette, so the walk visits
            // every tint. (i*3 % 6 only ever lands on two of them.)
            color: BLOOD_TINTS[(i * 5) % BLOOD_TINTS.length], speed: 6.5 + Math.random() * 2.5,
            ttl: this.gore === 'max' ? 1.4 : 1, grav: -18, size: 0.055, spin: 10,
            sizeVar: true, align: 0.2,
            stick: true, splat: 0.65, drag: 0.3, dir, spread: 0.32, jitter: 0.12,
          })
        }
        for (let i = 0; i < ns(4); i++) {
          this._soft('alpha', pos, {
            tile: PUFFS[i % PUFFS.length], color: COLORS.bloodMist, speed: 4.5,
            ttl: 0.4, grav: -3, size: 0.24, grow: 2, opacity: 0.32, drag: 4.5,
            dir, spread: 0.4, jitter: 0.1,
          })
        }
        break
      }

      case 'blood_fountain': {
        if (this.gore === 'none') { this._dryHit(pos, dirX, n(12)); break }
        const stages = this.gore === 'max' ? 5 : 3
        const per = n(this.gore === 'max' ? 10 : 8, true)
        for (let s = 0; s < stages; s++) {
          for (let i = 0; i < per; i++) {
            this._solid('gib', pos, {
              color: BLOOD_TINTS[(s * 2 + i) % BLOOD_TINTS.length], speed: 7 + Math.random() * 3.5,
              ttl: this.gore === 'max' ? 1.9 : 1.5, grav: -22, size: 0.078,
              sizeVar: true, align: 0.15,
              spin: 9, stick: true, splat: 0.75, drag: 0.25,
              dir: { x: 0, y: 1, z: 0 }, spread: 0.24, delay: s * 0.12, jitter: 0.14,
            })
          }
          this._soft('alpha', pos, {
            tile: PUFFS[s % PUFFS.length], color: COLORS.bloodMist, speed: 3,
            ttl: 0.5, grav: -2, size: 0.42, grow: 1.8, opacity: 0.4, drag: 3,
            dir: { x: 0, y: 1, z: 0 }, spread: 0.3, delay: s * 0.12, jitter: 0.12,
          })
        }
        break
      }

      default:
        // NEVER a white cube. Unknown names get the standard hit language.
        console.debug('[combat] unknown particle burst:', name)
        this.burst('impact', pos, opts)
    }
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    if (this._disposed) return
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60
    this._t += dt
    // gore re-poll: SaveManager.get is an in-memory walk — once a second is free
    if (this.game && ++this._goreTimer >= 60) {
      this._goreTimer = 0
      this._refreshGore()
    }
    // Floor-splat budget refills continuously; a KO geyser cannot flood the
    // decal pool and evict the pools that matter. 2.2/s, not the old 6/s: the
    // decal pool is ~28 slots and a droplet splat lives 5.5 s, so 6/s asked for
    // 33 simultaneous slots and the pool spent the whole round evicting itself.
    // At 2.2/s the floor holds ~12 droplet marks and they live out their fade.
    this._splatBudget = Math.min(2, this._splatBudget + dt * 2.2)

    // Swing ribbons. Rebuilt against the current lens so the blade stays
    // broadside to the camera through the whole arc; an unfed ribbon fades and
    // then hides itself, which is also how it stops costing a draw call.
    if (this._ribbons.size) {
      let camPos = null
      const cam = this.camera
      const m = cam && cam.matrixWorld && cam.matrixWorld.elements
      if (m) { this._camPos.set(m[12], m[13], m[14]); camPos = this._camPos }
      for (const r of this._ribbons.values()) r.update(dt, camPos)
    }

    const gY = this.groundY
    for (const key in this.fam) {
      const f = this.fam[key]
      const slots = f.slots
      let dirty = false
      for (let i = 0; i < slots.length; i++) {
        const p = slots[i]
        if (!p.active) continue
        p.life += dt
        if (p.life < 0) continue                       // delayed stage not born yet
        if (p.life >= p.ttl) {
          p.active = false
          f.im.setMatrixAt(i, HIDDEN)
          dirty = true
          continue
        }
        if (p.settled) {
          // AT REST. Contract §11 asks for "debris that settles rather than
          // vibrates", and the vibration was structural: a fixed restitution
          // with no sleep threshold turns the last few centimetres of a bounce
          // into a sub-frame buzz that never terminates. Settled debris skids
          // to a stop with ground friction and its spin is damped out, so a
          // coin lands, slides, wobbles and stays put.
          const fr = Math.min(1, 7 * dt)
          p.vel.x -= p.vel.x * fr
          p.vel.z -= p.vel.z * fr
          p.pos.x += p.vel.x * dt
          p.pos.z += p.vel.z * dt
          p.pos.y = gY + p.rest
          const sd = Math.max(0, 1 - 8 * dt)
          p.spin.multiplyScalar(sd)
          p.rot.x += p.spin.x * dt
          p.rot.y += p.spin.y * dt
          p.rot.z += p.spin.z * dt
        } else if (!p.stuck) {
          p.vel.y += p.grav * dt
          if (p.drag > 0) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
          p.pos.addScaledVector(p.vel, dt)
          p.rot.x += p.spin.x * dt
          p.rot.y += p.spin.y * dt
          p.rot.z += p.spin.z * dt
          if (p.stick && p.pos.y <= gY + 0.05 && p.vel.y < 0) {
            // Landing gore does NOT freeze as a floating chunk any more: it
            // flattens, hands a soft splat to the decal pool and fades out fast.
            //
            // BUG (v3.3, fixed here): p.vel was zeroed on the line ABOVE the
            // splatSink call, so every landing droplet handed the decal pool
            // {dx:0, dz:0}. GoreSystem._splat() reads mag <= 0.05 as "dropped
            // straight down" and falls through to a random roll with no
            // elongation — which is why the whole thrown-droplet feature was
            // invisible in the shipped build. Capture the ground velocity
            // first, then stop the particle.
            const gvx = p.vel.x
            const gvz = p.vel.z
            p.stuck = true
            // Per-particle rest height, not a shared constant. A KO fountain
            // lands a dozen droplets from one origin; at an identical Y they
            // line up on one screen row from a low camera and read as a
            // procedural artifact (the round-2 "perfectly straight row of tiny
            // dark specks"). 3 mm of stagger breaks the row and is invisible.
            p.yLift = 0.012 + (i % 9) * 0.0026
            p.pos.y = gY + p.yLift
            p.vel.set(0, 0, 0)
            p.spin.set(0, 0, 0)
            // Not a perfect face-down disc either: a splashed droplet lies at
            // whatever angle it hit at.
            p.rot.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.34, Math.random() * Math.PI,
              (Math.random() - 0.5) * 0.3)
            p.align = 0
            p.sy = 0.09 + Math.random() * 0.1
            p.sx *= 1.1 + Math.random() * 0.5
            p.sz *= 1.1 + Math.random() * 0.5
            if (this.splatSink && this._splatBudget >= 1 && Math.random() < p.splat) {
              this._splatBudget -= 1
              try {
                this.splatSink(p.pos.x, p.pos.z, p.size * (1.7 + Math.random() * 1.1),
                  { dx: gvx, dz: gvz })
              } catch { /* sink optional */ }
            }
            // Shorter hold than v3.3's 0.22 s: the decal is the mark that is
            // meant to persist, the flattened solid is only the handover frame.
            p.ttl = Math.min(p.ttl, p.life + 0.15)
          } else if (p.bounce > 0 && p.pos.y < gY + p.rest && p.vel.y < 0) {
            p.pos.y = gY + p.rest
            if (-p.vel.y > SETTLE_SPEED) {
              p.vel.y *= -p.bounce
              p.vel.x *= 0.8
              p.vel.z *= 0.8
              p.spin.multiplyScalar(0.7)
            } else {
              p.settled = true
              p.vel.y = 0
              p.vel.x *= 0.55
              p.vel.z *= 0.55
              p.spin.multiplyScalar(0.45)
            }
          }
        }
        const r = p.life / p.ttl
        // Opaque debris fades by SHRINKING — no alpha edge, no sort order.
        const fade = r > 0.72 ? Math.max(0.0015, 1 - (r - 0.72) / 0.28) : 1
        const s = p.size * fade * (1 + p.grow * r)
        // Settled debris rides the floor DOWN as it shrinks; holding a fixed
        // rest height would leave the last frames hovering.
        if (p.settled) p.pos.y = gY + p.rest * fade
        // VELOCITY ALIGNMENT (contract §11 "stretch droplets along their
        // velocity vector so they read as motion"). Local +Y is rotated onto
        // the travel direction and the body is stretched along it, with the
        // cross-section squeezed by 1/sqrt(stretch) so volume roughly holds and
        // a fast droplet thins into a streak instead of ballooning.
        if (p.align > 0 && !p.stuck && !p.settled) {
          const sp = p.vel.length()
          if (sp > 0.4) {
            _v0.copy(p.vel).divideScalar(sp)
            _q.setFromUnitVectors(UP_Y, _v0)
            const st = 1 + Math.min(2.6, sp * p.align)
            const cr = 1 / Math.sqrt(st)
            _s3.set(s * p.sx * cr, s * p.sy * st, s * p.sz * cr)
          } else {
            _q.setFromEuler(p.rot)
            _s3.set(s * p.sx, s * p.sy, s * p.sz)
          }
        } else {
          _q.setFromEuler(p.rot)
          _s3.set(s * p.sx, s * p.sy, s * p.sz)
        }
        _m4.compose(p.pos, _q, _s3)
        f.im.setMatrixAt(i, _m4)
        dirty = true
      }
      if (dirty) f.im.instanceMatrix.needsUpdate = true
    }

    this._updateQuads(this.add, dt, gY)
    this._updateQuads(this.alpha, dt, gY)
    this._updateQuads(this.ground, dt, gY)
  }

  /**
   * One pass over an instanced quad pool. Writes the instance matrix
   * (translation + pure positive scale — the roll lives in fxRot so the shader
   * can billboard without decomposing anything) plus the two per-instance
   * floats. No allocation, no per-particle object churn.
   */
  _updateQuads(P, dt, gY) {
    if (!P) return
    const slots = P.slots
    const opa = P.aOpacity.array
    const rots = P.aRot.array
    let dirty = false
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i]
      if (!p.active) continue
      p.life += dt
      if (p.life < 0) continue
      if (p.life >= p.ttl) {
        p.active = false
        opa[i] = 0
        P.im.setMatrixAt(i, HIDDEN)
        dirty = true
        continue
      }
      if (!p.flat) {
        p.vel.y += p.grav * dt
        if (p.swirl > 0) {
          // Turbulence: three decorrelated sine bands per axis. Cheap, and it
          // is the difference between "puff" and "billiard ball".
          const t = this._t
          p.vel.x += Math.sin(t * 2.1 + p.seed) * p.swirl * dt
          p.vel.z += Math.cos(t * 1.7 + p.seed * 1.31) * p.swirl * dt
          p.vel.y += Math.sin(t * 1.3 + p.seed * 0.67) * p.swirl * 0.45 * dt
        }
        if (p.drag > 0) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
        p.pos.addScaledVector(p.vel, dt)
      }

      const r = p.life / p.ttl
      // fadeIn is a FRACTION OF LIFE, not seconds — a 0.3 s spark and a 1.3 s
      // smoke puff both want their ramp to be a small share of their own life.
      const fi = p.fadeIn > 0 ? Math.min(1, r / p.fadeIn) : 1
      const tail = r > 0.45 ? Math.max(0, 1 - (r - 0.45) / 0.55) : 1
      const s = p.size * (1 + p.grow * r)
      let aspect = p.aspect
      if (p.stretch > 0) {
        // Motion-stretched spark: long along its own velocity, and rolled to
        // point down it. This is what stops fast sparks reading as confetti.
        aspect = p.aspect * (1 + Math.min(3.2, p.vel.length() * p.stretch))
        p.rot = Math.atan2(p.vel.y, p.vel.x)
      } else if (p.spin) {
        p.rot += p.spin * dt
      }

      let a = p.opacity * fi * tail * tail
      if (p.groundFade) {
        // Soft-particle approximation: the billboard dissolves as it sinks into
        // the floor plane instead of slicing it. Without a scene depth pre-pass
        // this is the floor-plane case only — the one that shows.
        const half = s * 0.5
        const gf = half > 1e-4 ? Math.min(1, Math.max(0, (p.pos.y - gY) / (half * 1.15))) : 1
        a *= gf * gf * (3 - 2 * gf)
      }
      opa[i] = a > 0.004 ? a : 0

      _s3.set(s * aspect, s, 1)
      if (p.flat) {
        // Floor-parallel: lay the quad down (-90 about X) then yaw it about
        // world Y. Order 'YXZ' composes as Ry * Rx, which is that exactly; the
        // ground pool runs the stock project_vertex, so the matrix is the only
        // place its orientation can live.
        _e.set(-Math.PI / 2, p.rot, 0, 'YXZ')
        _q.setFromEuler(_e)
      } else {
        // Billboard pools keep the matrix rotation-free on purpose: the vertex
        // patch reads the column lengths as the quad size and applies the roll
        // from fxRot, which is why one shader serves both passes.
        _q.identity()
        rots[i] = p.rot
      }
      _m4.compose(p.pos, _q, _s3)
      P.im.setMatrixAt(i, _m4)
      dirty = true
    }
    if (dirty) {
      P.im.instanceMatrix.needsUpdate = true
      P.aOpacity.needsUpdate = true
      P.aRot.needsUpdate = true
    }
  }

  // ----------------------------------------------------------------- dispose

  dispose() {
    if (this._disposed) return
    this._disposed = true
    this._offSettings?.()
    this._offSettings = null
    this.game = null
    this.camera = null
    this.splatSink = null
    // Ribbons own their geometry AND their material outright (neither comes
    // from the render layer's shared caches), so both are ours to free.
    for (const r of this._ribbons.values()) {
      try { r.dispose() } catch { /* already gone */ }
    }
    this._ribbons.clear()
    for (const key in this.fam) {
      const f = this.fam[key]
      try { this.scene?.remove?.(f.im) } catch { /* scene gone */ }
      // Materials are unique:true — ours to dispose. Geometry comes from the
      // render layer's shared cache and must NEVER be disposed here (another
      // arena or a rematch is still using it). Same for the FX textures.
      try { f.im.material?.dispose?.() } catch { /* already gone */ }
      try { f.im.dispose?.() } catch { /* r166 InstancedMesh.dispose */ }
      f.slots.length = 0
    }
    this.fam = {}
    for (const P of [this.add, this.alpha, this.ground]) {
      if (!P) continue
      try { this.scene?.remove?.(P.im) } catch { /* scene gone */ }
      // The quad geometry is a PlaneGeometry WE allocated (it carries our
      // instance attributes), so unlike the debris families it is ours to free.
      // The atlas is not: it lives in the render layer's tracked texture cache
      // and a rematch will ask for it again by key.
      try { P.im.material?.dispose?.() } catch { /* already gone */ }
      try { P.im.dispose?.() } catch { /* r166 InstancedMesh.dispose */ }
      try { P.geo?.dispose?.() } catch { /* already gone */ }
      P.slots.length = 0
    }
    this.add = this.alpha = this.ground = null
    this.atlas = null
  }
}
