// ============================================================================
// WALLY: CRYPTO SMACKDOWN — opening cinematic ('intro' screen)
// ----------------------------------------------------------------------------
// A ~36 second in-engine attract-mode movie: the Permanent Reserve is unstable,
// the onchain world is collapsing, and all ten idiots enter the Smackdown.
// Eleven hard-cut shots (prologue + one per fighter), each built lazily from a
// tiny reusable scene shell (sky dome + ground disc + lights + 1-2 real fighter
// models + a couple of props + one camera move) and fully disposed at the cut,
// so memory stays flat across the whole reel.
//
//   - SKIPPABLE from frame 1: any key / click / gamepad button -> title.
//   - SUBTITLED: chunky retro captions bottom-center, letterboxed.
//   - HYPED (v2.1, §22): dedicated 'intro_hype' music track (the router keeps
//     whatever was playing if the track isn't installed yet), and the announcer
//     calls each fighter's NAME as their shot cuts in — once, at shot start.
//   - REPLAYABLE: enter()/exit() are idempotent; the menu's "Replay Intro"
//     and the first-boot flow both just goto('intro').
//   - Ends with goto('title') — the title screen supplies the logo slam.
//
// Read-only imports: characters registry (actors), combat Animator (clip
// sampling), ArenaBase helpers (signs/coins/dispose), uiKit (el/music).
//
// ---------------------------------------------------------------------------
// v3.6 — THE RENDER-LAYER PASS (GRAPHICS_CONTRACT §0, §4, §12).
//
// What this file used to be: `renderScene()` and nothing else out of the render
// layer. Three hand-rolled lights per shot (one hemi + one directional), ten
// raw `MeshStandardMaterial`/`MeshBasicMaterial` constructions, a 3-stop painted
// canvas sky dome with a cartoon sun, no environment map, no shadows, no depth
// of field and one global exposure for eleven wildly different moods. The
// arenas got the whole overhaul; the movie that introduces them got none of it,
// so the first thirty-six seconds a player ever sees were the worst-looking
// thirty-six seconds in the build.
//
// What it is now, per shot:
//
//   * A MOOD. Every shot names one of env.js's calibrated moods and carries a
//     per-shot override bag for its own art direction, so the sky, the IBL, the
//     rig preset, the exposure, the bloom threshold and the AO kernel all come
//     from one source of truth instead of from four unrelated magic numbers.
//   * A REAL SKY. `applyEnvironment(..., { background: true })` puts the HDR
//     analytic sky (gradient + sun disc at a real angular size + horizon haze +
//     cloud bands) on screen AND in `scene.environment`. That is the same
//     texture the metal reflects, so the sun in the sky and the glint on the
//     coin are the same object. The painted dome — a banded gradient with a
//     cartoon sun, both on the contract's KILL list — is gone.
//   * A COMPOSED RIG. `makeCinematicRig()` per shot: key aimed from the mood's
//     own sun direction, fill, camera-relative fresnel rim, floor bounce, a
//     non-zero ambient floor, a fitted shadow frustum and contact shadows under
//     the actors.
//   * A LENS. Each shot has a focal length, and the dolly is re-projected so
//     the subject keeps its authored size while the background compresses or
//     spreads — a real lens change, not a crop. Plus a hand-held float and a
//     per-shot easing curve, so nothing moves linearly (contract §0.5).
//   * DEPTH. Fog tuned per shot, and the pipeline's bokeh DoF focused on the
//     shot's hero via `setCinematic()` / `autoFocus()`.
//
// WHAT IS DELIBERATELY UNTOUCHED: the shot list, every `dur`, every caption
// time and string, every sound cue, the announcer beats, the skip handling and
// the total running time. This is a visual pass on existing shots.
//
// WALLY: the intro never sculpted its own — `cx.actor('wally')` calls the real
// `WallyDef.buildModel()`, so the art-toy elephant of wally-v2-reference.md is
// what walks through the gates. There is no second, divergent, suited Wally in
// here to delete.
// ============================================================================
import * as THREE from 'three'
import { Characters } from '../characters/index.js'
import { Animator } from '../combat/Animator.js'
import {
  makeRng, flatMat, disposeObject, makeSign, makeLightShaft,
  makeCandlestickChart, makeCoinMesh, CROWD_PALETTE,
} from '../arenas/ArenaBase.js'
import { el, ensureMusic, touchUI } from '../ui/uiKit.js'
import {
  renderScene, pbr, emissive, upgradeMaterials,
  applyEnvironment, makeCinematicRig,
  roundedBox, capsule, profileLathe, superellipsoid, smoothNormals,
} from '../render/index.js'

// ---------------------------------------------------------------------------
// Injected caption / letterbox styles (self-contained — ui.css is not ours).
// Uses the :root CSS vars ui.css defines (--wcs-font etc).
// ---------------------------------------------------------------------------
let _styleInstalled = false
function ensureIntroStyle() {
  if (_styleInstalled) return
  _styleInstalled = true
  const style = document.createElement('style')
  style.id = 'wcs-intro-style'
  style.textContent = `
.wcs-intro { position:absolute; inset:0; z-index:5; pointer-events:none; overflow:hidden; }
.wcs-intro-bar { position:absolute; left:0; right:0; height:9.5%; background:#000; z-index:2; }
.wcs-intro-bar.top { top:0; } .wcs-intro-bar.bot { bottom:0; }
.wcs-intro-cap {
  position:absolute; left:50%; bottom:12.5%; transform:translateX(-50%);
  max-width:82%; text-align:center; z-index:3;
  font-family:var(--wcs-font); font-size:clamp(17px, 3.1vh, 30px);
  letter-spacing:1.5px; line-height:1.25; color:#fff;
  padding:5px 20px 7px; background:rgba(6,4,15,0.55);
  border:2px solid rgba(255,217,74,0.28);
  /* deep extrude kept to 3px — at 5px it collided with the second line's
     ascenders on two-line captions (line-height 1.25) and read as double-print;
     the 2px outline above already carries the retro look */
  text-shadow:2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 3px 3px 0 rgba(0,0,0,0.55);
}
.wcs-intro-cap.gold { color:var(--wcs-gold); }
.wcs-intro-cap.pop { animation:wcs-intro-cap-pop 0.22s cubic-bezier(0.2,1.7,0.4,1); }
@keyframes wcs-intro-cap-pop {
  0% { transform:translateX(-50%) scale(0.86); opacity:0; }
  100% { transform:translateX(-50%) scale(1); opacity:1; }
}
.wcs-intro-skip {
  position:absolute; right:2.4%; bottom:2.6%; z-index:4;
  font-family:var(--wcs-mono); font-size:12px; letter-spacing:2px;
  color:rgba(255,255,255,0.62); animation:wcs-intro-skip-throb 1.4s ease-in-out infinite;
}
@keyframes wcs-intro-skip-throb { 0%,100% { opacity:0.45; } 50% { opacity:0.95; } }
`
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Tiny math + build helpers
// ---------------------------------------------------------------------------
const clamp01 = (t) => Math.min(1, Math.max(0, t))
const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x) }
const lerp = (a, b, f) => a + (b - a) * f

// ---------------------------------------------------------------------------
// EASING (contract §0.5 — "nothing moves linearly").
//
// `smoothstep` is the old behaviour and stays the default, but a 3-second shot
// that eases in AND out spends most of its length nearly still, which reads as
// a locked-off camera with a lurch in the middle. The named curves below are
// what the individual shots actually want:
//
//   inout   symmetric ease (the default) — a considered, settling move
//   out     starts at full speed and decelerates — a whip-in on the cut
//   in      accelerates away — a push that is still gaining at the hard cut
//   drift   a long, almost-constant creep with just enough ease at both ends
//           to kill the start/stop tick. This is the one most shots use: a
//           dolly should feel mechanical, not elastic.
// ---------------------------------------------------------------------------
const EASE = {
  linear: (t) => clamp01(t),
  inout: smooth,
  out: (t) => { const x = clamp01(t); return 1 - Math.pow(1 - x, 2.4) },
  in: (t) => { const x = clamp01(t); return Math.pow(x, 2.0) },
  drift: (t) => { const x = clamp01(t); return x * x * (3 - 2 * x) * 0.34 + x * 0.66 },
}
const easeFn = (name) => EASE[name] || EASE.inout

// ---------------------------------------------------------------------------
// Geometry toolkit, always UNIQUE.
//
// geometry.js hands back entries from a shared, process-wide geometry cache by
// default, and this screen's teardown (`disposeObject`) frees every geometry it
// walks. Those two facts together would tear a cached buffer out from under the
// next arena that asks for the same shape, so every toolkit call in this file
// opts out of the cache. Eleven shots' worth of props is a rounding error
// against the cache's job (a 40-fighter roster), and it makes the teardown
// honest — which matters more here than anywhere, because the reel builds and
// destroys eleven complete scenes back to back and memory has to stay flat.
// ---------------------------------------------------------------------------
const rbox = (w, h, d, r = 0.02, s = 2) => roundedBox(w, h, d, r, s, { unique: true })
const lathe = (pts, seg = 20, o = {}) => profileLathe(pts, seg, { ...o, unique: true })
// `pill`, not `caps`: update() has a local `const caps = shot.captions`.
const pill = (r, len, capSeg = 4, radSeg = 12) => capsule(r, len, capSeg, radSeg, { unique: true })
const sellip = (rx, ry, rz, e = 2.6, eZ = e, seg = 18) =>
  superellipsoid(rx, ry, rz, e, eZ, seg, { unique: true })

// The reference focal length every shot's framing was authored against. A shot
// asking for a different `fov` gets its dolly re-projected about the look
// target so the SUBJECT keeps its authored size and only the background
// compresses or spreads — see _updateCamera().
const BASE_FOV = 45

// Frame aspect, in order of trustworthiness: the live drawing buffer, the
// window, then 16:9. Never returns 0, Infinity or NaN — an unlaid-out or
// backgrounded tab reports innerWidth/innerHeight 0, and 0/0 propagates
// straight into the projection matrix as NaN, which draws nothing at all.
function _frameAspect(game) {
  const r = (game && (game.isWebGLRenderer ? game : game.renderer)) || null
  let w = 0
  let h = 0
  if (r && typeof r.getSize === 'function') { const v = r.getSize(new THREE.Vector2()); w = v.x; h = v.y }
  if (!(w > 0 && h > 0) && r && r.domElement) { w = r.domElement.width; h = r.domElement.height }
  if (!(w > 0 && h > 0)) { w = (typeof innerWidth === 'number' ? innerWidth : 0); h = (typeof innerHeight === 'number' ? innerHeight : 0) }
  const a = (w > 0 && h > 0) ? (w / h) : (16 / 9)
  return Number.isFinite(a) && a > 0 ? a : (16 / 9)
}

// Extra hints for the end-of-build material sweep. materials.js already ships
// ~230 defaults (coin/bullion -> gold, sign/neon -> neon-panel, ticker/monitor
// -> screen), so these are only the nouns this reel uses that the generic table
// would get wrong, plus the ones worth pinning so a rename cannot silently
// change a surface.
const INTRO_HINTS = {
  introGround: 'concrete',
  vaultShell: 'metal-rough', vaultDoor: 'metal', galleryWall: 'concrete',
  gatePillar: 'stone', gateBeam: 'stone', nodeObelisk: 'stone',
  candleBody: 'stone', rail: 'metal', boiler: 'metal-rough',
  deskTop: 'wood', monitorShell: 'plastic', monitorScreen: 'screen',
  tickerFace: 'screen', headlamp: 'emissive', liquidityPool: 'water',
  rocketHull: 'metal-painted', bigRedButton: 'plastic',
}

// Which meshes the end-of-build sweep is allowed to touch. Mirrors ArenaBase's
// `upgradeFilter`, and for the same hard-won reason: `upgradeMaterials()` will
// happily rebuild a ShaderMaterial as a MeshStandardMaterial, which would turn
// every volumetric light shaft in the reel into an opaque grey cone. Points
// (the snowfall) and sprites go the same way.
function introUpgradeFilter(mesh) {
  const u = mesh.userData
  if (u && (u.__introActor || u.noUpgrade)) return false
  if (mesh.isPoints || mesh.isSprite || mesh.isLine) return false
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const m of mats) {
    if (!m) return false
    if (m.isShaderMaterial || m.isRawShaderMaterial) return false
    if (m.isPointsMaterial || m.isSpriteMaterial || m.isLineBasicMaterial) return false
  }
  return true
}

// Last announcer NAME call (performance.now() ms) — module-level because the
// speech queue it throttles is global, surviving exit()/enter() replays.
let _lastNameCall = -Infinity

// Per-frame scratch for the rig focus. Never reallocated: this runs 60 times a
// second for 36 seconds and a fresh Vector3 per frame is 2000 dead objects.
const _tmpFocus = new THREE.Vector3()

// The floor. A 140 m disc under an HDR sky: it has to be a real surface, not a
// flat fill, because it is the largest single thing in most of these frames and
// it is what the bounce light picks its colour up from. `repeat` is in tiles
// across the whole disc, so a shot can ask for gravel-scale or field-scale
// detail out of the same cached texture kind.
function groundDisc(color, surface = 'concrete', opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(70, 72),
    flatMat(color, {
      surface,
      roughness: opts.roughness,
      mapOpts: { repeat: opts.repeat || [26, 26], scale: opts.scale ?? 3, wear: opts.wear ?? 0.35 },
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.name = 'introGround'
  mesh.receiveShadow = true
  mesh.castShadow = false
  // `noShadow` is upgradeMaterials()'s opt-out for the cast flag. Without it
  // the end-of-build sweep would set castShadow on a 140 m disc, which puts
  // the whole world inside its own shadow.
  mesh.userData.noShadow = true
  return mesh
}

// Emergency stand-in if a character def is missing/broken — the reel must
// never crash because of somebody else's fighter file.
function fallbackFigure() {
  const g = new THREE.Group()
  const m = flatMat(0x3a4160, { surface: 'plastic', mapOpts: { scale: 2 } })
  const body = new THREE.Mesh(rbox(0.7, 1.1, 0.5, 0.09, 2), m)
  body.position.y = 0.95
  g.add(body)
  const head = new THREE.Mesh(rbox(0.5, 0.5, 0.45, 0.09, 2), m)
  head.position.y = 1.8
  g.add(head)
  return { group: g, bones: {} }
}

// Falling confetti / paper — n small boxes recycled top-to-bottom.
function confetti(cx, opts = {}) {
  const {
    n = 46, area = 4.6, ymax = 7, colors = CROWD_PALETTE,
    size = 0.09, fall = [1.1, 2.3],
  } = opts
  // Lit paper, not unlit quads: a confetti bit that catches the key on one
  // face and the bounce on the other is the difference between glitter and a
  // screensaver. DoubleSide because they tumble.
  const geo = rbox(size, size * 0.24, size * 0.62, size * 0.05, 1)
  const mats = colors.slice(0, 6).map((c) => pbr(c, 'paper', {
    side: THREE.DoubleSide, noMaps: true, roughness: 0.9,
  }))
  const bits = []
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(geo, mats[i % mats.length])
    mesh.position.set(
      (cx.rng() * 2 - 1) * area,
      0.2 + cx.rng() * ymax,
      -2.2 + cx.rng() * 3
    )
    mesh.rotation.set(cx.rng() * 3, cx.rng() * 3, cx.rng() * 3)
    mesh.userData.noShadow = true   // 46 unreadable casters is not a feature
    cx.add(mesh)
    bits.push({
      mesh,
      fall: fall[0] + cx.rng() * (fall[1] - fall[0]),
      spin: 2 + cx.rng() * 5,
      sway: cx.rng() * Math.PI * 2,
    })
  }
  cx.onUpdate((dt, t) => {
    for (const b of bits) {
      b.mesh.position.y -= b.fall * dt
      b.mesh.position.x += Math.sin(t * 2.2 + b.sway) * dt * 0.5
      b.mesh.rotation.x += b.spin * dt
      b.mesh.rotation.z += b.spin * 0.6 * dt
      if (b.mesh.position.y < 0.04) b.mesh.position.y += ymax
    }
  })
  // NB: the materials come out of the global pbr() cache and are shared with
  // every other caller — dispose the geometry only (README §5).
  cx.onDispose(() => { geo.dispose() })
}

// Gentle snowfall as a Points cloud.
function snowfall(cx, { n = 170, area = 9, height = 8 } = {}) {
  const pos = new Float32Array(n * 3)
  const speed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (cx.rng() * 2 - 1) * area
    pos[i * 3 + 1] = cx.rng() * height
    pos[i * 3 + 2] = -6 + cx.rng() * 8
    speed[i] = 0.7 + cx.rng() * 0.9
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  // Soft, slightly translucent and depth-write-free so flakes crossing the
  // obelisk edge dissolve into it instead of punching a hole in it.
  const mat = new THREE.PointsMaterial({
    color: 0xeaf2ff, size: 0.055, sizeAttenuation: true,
    transparent: true, opacity: 0.78, depthWrite: false, fog: true,
  })
  const points = new THREE.Points(geo, mat)
  points.renderOrder = 4
  cx.add(points)
  cx.onUpdate((dt, t) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] -= speed[i] * dt
      pos[i * 3] += Math.sin(t * 0.8 + i) * dt * 0.18
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] += height
    }
    geo.attributes.position.needsUpdate = true
  })
  cx.onDispose(() => { geo.dispose(); mat.dispose() })
}

// Expanding/fading smoke-or-fire puffs. Returns spawn(pos, opts).
//
// Unlit is the right call for a puff (contract §4 leaves particle sprites
// alone), but a perfect sphere fading uniformly is a bubble, not smoke. Three
// changes: the ball is a lumpy superellipsoid so its silhouette is irregular,
// each puff tumbles and stretches as it rises, and the colour ramps from its
// hot spawn tint toward a cool ash as it dies — which is what stops a smoke
// column reading as one flat grey value.
//
// The materials are per-puff (opacity and colour are animated), which is
// exactly the case README §5 says must never touch a shared cache. They are
// pooled instead of allocated: a 36-second reel spawning one every 0.11 s
// would otherwise churn ~300 materials.
function puffSpawner(cx, { colors = [0xffa447, 0xff5a2a], ash = 0x6a6e78 } = {}) {
  const geo = smoothNormals(sellip(1, 0.94, 1, 2.35, 2.6, 12), 90)
  const pool = []
  const live = []
  const ashCol = new THREE.Color(ash)
  const takeMat = (hex) => {
    const mat = pool.pop() || new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, fog: true,
    })
    mat.color.setHex(hex)
    mat.opacity = 0.86
    return mat
  }
  cx.onUpdate((dt) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]
      p.life += dt
      const f = p.life / p.dur
      if (f >= 1) {
        cx.g.remove(p.mesh)
        pool.push(p.mesh.material)
        live.splice(i, 1)
        continue
      }
      // Ease-out growth: a puff expands fastest the instant it is born.
      const g = 1 - Math.pow(1 - f, 2.2)
      p.mesh.scale.set(
        p.size * (0.34 + g * 1.75),
        p.size * (0.34 + g * 1.75) * (1 + f * 0.35),
        p.size * (0.34 + g * 1.75),
      )
      p.mesh.position.y += p.rise * dt * (1 - f * 0.45)
      p.mesh.rotation.y += p.spin * dt
      p.mesh.rotation.x += p.spin * 0.4 * dt
      p.mesh.material.color.copy(p.hot).lerp(ashCol, Math.min(1, f * 1.25))
      p.mesh.material.opacity = 0.86 * Math.pow(1 - f, 1.35)
    }
  })
  cx.onDispose(() => {
    geo.dispose()
    for (const m of pool) m.dispose()
    for (const p of live) p.mesh.material.dispose()
  })
  return (pos, { size = 0.5, dur = 0.7, rise = 0.9, tint } = {}) => {
    const color = tint ?? colors[Math.floor(cx.rng() * colors.length)]
    const mesh = new THREE.Mesh(geo, takeMat(color))
    mesh.position.copy(pos)
    mesh.rotation.set(cx.rng() * 3, cx.rng() * 3, cx.rng() * 3)
    mesh.scale.setScalar(size * 0.34)
    mesh.renderOrder = 3
    cx.add(mesh)
    live.push({
      mesh, size, dur, rise, life: 0,
      spin: (cx.rng() - 0.5) * 2.2,
      hot: new THREE.Color(color),
    })
  }
}

// A chunky wooden office desk with a monitor on top (for the Tired Ape shot).
function makeDesk() {
  const g = new THREE.Group()
  g.name = 'desk'
  const wood = flatMat(0x8a5a33, { surface: 'wood', mapOpts: { scale: 2.2, repeat: [2, 1] } })
  const top = new THREE.Mesh(rbox(1.5, 0.1, 0.78, 0.018, 2), wood)
  top.position.y = 0.78
  top.name = 'deskTop'
  g.add(top)
  const legGeo = rbox(0.09, 0.75, 0.09, 0.012, 1)
  for (const sx of [-0.65, 0.65]) for (const sz of [-0.3, 0.3]) {
    const leg = new THREE.Mesh(legGeo, wood)
    leg.position.set(sx, 0.375, sz)
    g.add(leg)
  }
  const mon = new THREE.Group()
  // A beige CRT: chamfered shell, a recessed bezel and a screen that is an
  // actual emitter, so the dead startup's monitors light their own desks.
  const shell = new THREE.Mesh(
    rbox(0.55, 0.42, 0.4, 0.045, 2),
    flatMat(0xd8d2c2, { surface: 'plastic', mapOpts: { scale: 1.6 } }),
  )
  shell.name = 'monitorShell'
  mon.add(shell)
  const bezel = new THREE.Mesh(
    rbox(0.46, 0.35, 0.03, 0.02, 1),
    flatMat(0x2a2a2e, { surface: 'plastic' }),
  )
  bezel.position.z = 0.198
  mon.add(bezel)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.3),
    emissive(0x2f6bd8, 1.5, 'screen'),
  )
  screen.name = 'monitorScreen'
  screen.position.z = 0.216
  mon.add(screen)
  const stand = new THREE.Mesh(
    lathe([[0.05, 0], [0.09, 0.01], [0.06, 0.05], [0.055, 0.1]], 14),
    flatMat(0xc8c2b2, { surface: 'plastic' }),
  )
  stand.position.y = -0.24
  mon.add(stand)
  mon.position.set(0, 1.07, 0)
  g.add(mon)
  g.userData.contactShadow = true
  return g
}

// A stubby low-poly steam locomotive (the Settlement Train).
function makeTrain() {
  const g = new THREE.Group()
  g.name = 'train'
  const iron = flatMat(0x23262e, { surface: 'metal-rough', mapOpts: { scale: 2.4, wear: 0.55 } })
  // Boiler: a lathe, so the barrel has a rolled front ring and a smokebox
  // shoulder instead of a cylinder with two flat cuts. x is along the track,
  // so the whole thing is built up the Y axis and laid down once.
  const boiler = new THREE.Mesh(lathe([
    [0.00, 0.00], [0.62, 0.00], [0.70, 0.06], [0.72, 0.16],
    [0.72, 2.28], [0.74, 2.36], [0.66, 2.46], [0.00, 2.52],
  ], 18), iron)
  boiler.rotation.z = Math.PI / 2
  boiler.position.set(-1.6, 1.05, 0)
  boiler.name = 'boiler'
  g.add(boiler)
  // Boiler bands — three brass hoops. Cheap, and they are what makes a smooth
  // barrel read as a machine at 4 m.
  // `roughness` is a MULTIPLIER on the preset's roughness map, not an absolute
  // (README §2), and the map already ships the physically correct value — so
  // anything above 1 just clamps and does nothing. 0.55 is what actually buys
  // the brass a specular streak along the boiler.
  const bandMat = flatMat(0x9a7a34, { surface: 'gold', roughness: 0.55 })
  for (const bx of [-0.55, 0.15, 0.75]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.735, 0.035, 6, 20), bandMat)
    band.rotation.y = Math.PI / 2
    band.position.set(bx, 1.05, 0)
    g.add(band)
  }
  const cab = new THREE.Mesh(rbox(1.1, 1.5, 1.3, 0.06, 2), flatMat(0x5a2530, { surface: 'metal-painted' }))
  cab.position.set(-1.9, 1.1, 0)
  cab.name = 'cab'
  g.add(cab)
  const roof = new THREE.Mesh(rbox(1.32, 0.1, 1.46, 0.04, 1), iron)
  roof.position.set(-1.9, 1.9, 0)
  g.add(roof)
  const chimney = new THREE.Mesh(lathe([
    [0.00, 0.00], [0.24, 0.00], [0.20, 0.16], [0.17, 0.52],
    [0.23, 0.66], [0.24, 0.72], [0.00, 0.74],
  ], 14), iron)
  chimney.position.set(0.55, 1.62, 0)
  g.add(chimney)
  // cowcatcher
  const plow = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 4), flatMat(0x9c2c35, { surface: 'metal-painted', mapOpts: { wear: 0.6 } }))
  plow.rotation.z = -Math.PI / 2
  plow.rotation.y = Math.PI / 4
  plow.position.set(1.4, 0.5, 0)
  g.add(plow)
  // Headlight: a real emitter in a brass housing, plus a short-throw point
  // light so the sleepers ahead of the loco actually catch it.
  const lampHousing = new THREE.Mesh(lathe([
    [0.00, 0.00], [0.22, 0.00], [0.24, 0.16], [0.20, 0.26], [0.00, 0.26],
  ], 14), bandMat)
  lampHousing.rotation.z = -Math.PI / 2
  lampHousing.position.set(0.86, 1.05, 0)
  g.add(lampHousing)
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.19, 14), emissive(0xffe9a8, 5.5, 'emissive'))
  lamp.position.set(1.13, 1.05, 0)
  lamp.rotation.y = Math.PI / 2
  lamp.name = 'headlamp'
  lamp.userData.noShadow = true
  g.add(lamp)
  const beam = new THREE.PointLight(0xffdd9a, 9, 7, 2)
  beam.position.set(1.6, 1.05, 0)
  g.add(beam)
  const wheels = []
  const wheelMat = flatMat(0x14161d, { surface: 'metal-rough', mapOpts: { wear: 0.7 } })
  const tyreMat = flatMat(0x8a7038, { surface: 'metal', roughness: 0.7 })
  for (const wx of [-1.9, -0.9, 0.1, 1.0]) for (const wz of [-0.58, 0.58]) {
    const w = new THREE.Group()
    const hub = new THREE.Mesh(lathe([
      [0.00, 0.00], [0.30, 0.00], [0.32, 0.03], [0.34, 0.06],
      [0.32, 0.09], [0.30, 0.12], [0.00, 0.12],
    ], 14), wheelMat)
    hub.position.y = -0.06
    w.add(hub)
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.035, 6, 18), tyreMat)
    tyre.rotation.x = Math.PI / 2
    w.add(tyre)
    w.rotation.x = Math.PI / 2
    w.position.set(wx, 0.34, wz)
    g.add(w)
    wheels.push(w)
  }
  g.userData.wheels = wheels
  g.userData.stackTip = new THREE.Vector3(0.55, 2.4, 0)
  g.userData.contactShadow = true
  return g
}

// A dangerous, government-surplus-looking rocket on a launch pad.
function makeRocket() {
  const g = new THREE.Group()
  g.name = 'rocket'
  // One lathe from skirt to nose tip: the body, the shoulder and the ogive are
  // a single tangent-continuous silhouette, so there is no cone-meets-cylinder
  // slope break — the tell that reads as "two primitives stacked".
  const hull = new THREE.Mesh(lathe([
    [0.00, 0.30], [0.40, 0.30], [0.42, 0.36], [0.40, 0.86],
    [0.36, 1.48], [0.35, 1.84], [0.33, 2.04], [0.27, 2.30],
    [0.17, 2.55], [0.07, 2.70], [0.00, 2.76],
  ], 22, { creaseAngle: 30 }), flatMat(0xe8e4da, { surface: 'metal-painted', mapOpts: { scale: 2.0, wear: 0.4 } }))
  hull.name = 'rocketHull'
  g.add(hull)
  // Red nose band + a warning stripe, painted as geometry rings (no decals in
  // this file — everything has to be procedural and lit).
  const redMat = flatMat(0xd23b3b, { surface: 'metal-painted', mapOpts: { wear: 0.5 } })
  const capBand = new THREE.Mesh(lathe([
    [0.00, 2.04], [0.33, 2.04], [0.27, 2.30], [0.17, 2.55], [0.07, 2.70], [0.00, 2.76],
  ], 22, { creaseAngle: 30 }), redMat)
  capBand.scale.setScalar(1.012)
  g.add(capBand)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.026, 6, 22), redMat)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.90
  g.add(collar)
  for (let i = 0; i < 3; i++) {
    // Swept delta fins — a chamfered wedge, not a box.
    const fin = new THREE.Mesh(rbox(0.07, 0.62, 0.46, 0.022, 1), redMat)
    const a = (i / 3) * Math.PI * 2
    fin.position.set(Math.cos(a) * 0.42, 0.58, Math.sin(a) * 0.42)
    fin.rotation.y = -a
    fin.rotation.x = 0.12
    g.add(fin)
  }
  // The bell, and a two-part flame: a hot white core inside a soft orange
  // envelope, both additive, so the exhaust has a value range instead of one
  // flat orange cone.
  const bell = new THREE.Mesh(lathe([
    [0.00, 0.00], [0.30, 0.00], [0.34, 0.10], [0.38, 0.24], [0.40, 0.30], [0.00, 0.30],
  ], 16), flatMat(0x5a5f68, { surface: 'metal', roughness: 0.8 }))
  g.add(bell)
  const flame = new THREE.Group()
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1.05, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff8a2a, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }),
  )
  outer.rotation.x = Math.PI
  outer.position.y = -0.52
  flame.add(outer)
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.62, 10),
    new THREE.MeshBasicMaterial({
      color: 0xfff0c0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }),
  )
  core.rotation.x = Math.PI
  core.position.y = -0.3
  flame.add(core)
  // Additive VFX must never cast: a rocket exhaust that throws a shadow is the
  // single most obvious "somebody enabled a checkbox" tell there is.
  outer.userData.noShadow = true
  core.userData.noShadow = true
  flame.position.y = 0.02
  flame.visible = false
  flame.renderOrder = 5
  g.add(flame)
  // The exhaust has to LIGHT something or it is a sticker. Short range so it
  // scorches the pad and Pingo and nothing else.
  const glow = new THREE.PointLight(0xff9a3a, 0, 6, 2)
  glow.position.y = -0.35
  g.add(glow)
  g.userData.flame = flame
  g.userData.glow = glow
  g.userData.contactShadow = true
  return g
}

// ---------------------------------------------------------------------------
// THE SHOT LIST — dur (s), scene shell config, timeline, camera move, build().
//
// v3.6 fields (the render-layer pass). Everything else in a shot — dur,
// captions, sounds, the camera's from/to/look — is exactly what it was.
//
//   mood      env.js mood name. Drives FOUR things at once and that is the
//             point: the IBL + sky (env.js MOODS), the light rig preset
//             (lighting.js RIG_PRESETS), the exposure / grade / bloom / AO
//             calibration (env.js MOOD_EXPOSURE) and the fog default.
//   env       per-shot override bag merged over the mood (getMood(name, ov)).
//             This is where each shot's own art direction lives — the authored
//             sky/horizon/ground colours that used to be a painted canvas dome
//             are now the analytic sky's actual gradient stops, so the sky the
//             player sees and the sky the coins reflect are one texture.
//   envInt    scene.environmentIntensity (default 1).
//   skyBlur   background blurriness. 0.04-0.10 for a sky with structure worth
//             seeing, higher for the dark interiors where it is just a wash.
//   exposure  per-shot trim on the mood's calibrated exposure. 1 = the mood as
//             calibrated; this is the knob for "this one shot sits a third of a
//             stop hot against the rest of the reel".
//   rig       makeCinematicRig() overrides — rim colour/intensity, fill, the
//             ambient floor. Composed per shot, never defaulted.
//   ground    { color, surface, repeat?, scale?, wear? } for the floor disc,
//             or null for the shots with no visible floor.
//   fov       the LENS, in degrees. The dolly is re-projected about the look
//             target so the subject keeps its authored size at any focal
//             length — see _updateCamera(). 34 = a long lens that compresses
//             and isolates; 52 = a wide that gives the frame speed and air.
//   ease      'inout' | 'out' | 'in' | 'drift' | 'linear' — the dolly curve.
//   float     hand-held amplitude in metres (0 = locked off).
//   roll      camera roll in radians at the end of the move (dutch).
//   dof       0-1 cinematic depth-of-field amount; dofRange is the half-width
//             in metres of the sharp band.
//
// cam: { from, to, look, lookTo? } — eased position dolly + eased look target.
// sounds: [{ t, sfx?, opts?, announcer?, shake? }], captions: [{ t, text, gold? }]
// fighter: character id — the announcer shouts Characters[id].name at shot start
// (§22). One call per shot only: announce() cancels in-flight speech, so extra
// mid-shot name calls would cancel-restart and stutter. Scripted announcer
// beats (prologue, Wally's tag) stay >=2.9s clear of any name call.
// ---------------------------------------------------------------------------
const SHOTS = [

  // -- PROLOGUE — the Permanent Reserve, wobbling ---------------------------
  {
    dur: 4.6, seed: 11,
    bg: '#0a0616',
    // The vault mood, pushed from its stock cyan into the reel's opening
    // magenta: a low sodium-red emergency wash off the far wall, a cold violet
    // ceiling bounce, and enough cloud in the sky to keep the top of frame from
    // being a dead gradient. reserve-core's exposure calibration (1.18, black
    // 0.032, ambient floor 0.130) is exactly right for a near-black interior —
    // it is the mood that exists because "unplayably dark" was a bug report.
    mood: 'reserve-core',
    env: {
      sky: 0x0a0616, horizon: 0x2c0a30, ground: 0x160a1e,
      haze: 0x4a1030, hazeStrength: 0.60, hazeFalloff: 4.4, gradPow: 0.66,
      sun: 0xff8a5a, sunSize: 2.4, sunE: 0.20, sunDir: [0.18, 0.44, 0.88],
      clouds: { coverage: 0.5, sharpness: 0.3, scale: 2.1, band: 0.5, lit: 0x6a2444, shade: 0x180a1e, sunGlow: 0.7 },
      contrast: 1.24, saturation: 1.08, gain: 0.98,
      panels: [
        { dir: [0.0, 0.30, 0.95], size: 24, color: 0xff2a44, intensity: 0.34 },
        { dir: [0.0, 0.96, 0.20], size: 48, color: 0x3c2a60, intensity: 0.22 },
      ],
    },
    skyBlur: 0.10, exposure: 1.0,
    rig: {
      rimColor: 0xff4a66, rimIntensity: 3.4,
      fillColor: 0x7a5aa8, fillIntensity: 0.7,
      sunColor: 0xffb28a, bounceColor: 0x3a1a2e,
      ambientLift: 0.9,
    },
    ground: { color: 0x1a1026, surface: 'concrete', repeat: [30, 30], wear: 0.55 },
    fog: { color: 0x1a0a1e, near: 10, far: 52 },
    fov: 42, ease: 'drift', float: 0.028, roll: -0.012, dof: 0.85, dofRange: 2.2,
    cam: { from: [0, 2.3, 10.5], to: [0, 1.8, 6.3], look: [0, 1.5, 0] },
    captions: [
      { t: 0.15, text: 'THE ONCHAIN WORLD IS COLLAPSING.' },
      { t: 2.35, text: 'THE PERMANENT RESERVE… IS UNSTABLE.', gold: true },
    ],
    sounds: [
      { t: 0.25, sfx: 'thud', opts: { vol: 0.7, pitch: 0.6 } },
      { t: 1.0, announcer: 'THE RESERVE IS UNSTABLE!' },
      { t: 2.5, sfx: 'coins_burst', opts: { vol: 0.5 } },
      { t: 3.6, sfx: 'explosion', opts: { vol: 0.4, pitch: 0.6 }, shake: 0.5 },
    ],
    build(cx) {
      const vault = new THREE.Group()
      vault.name = 'vault'
      // The strongbox: a chamfered brushed-steel shell with a recessed door
      // panel and a raised frame, so the front face has three depths in it
      // instead of being one 3.6 m slab of flat colour.
      const steel = flatMat(0x424a5c, { surface: 'metal-rough', mapOpts: { scale: 2.4, repeat: [3, 2], wear: 0.4 } })
      const box = new THREE.Mesh(rbox(3.6, 2.6, 2, 0.07, 2), steel)
      box.position.y = 1.3
      box.name = 'vaultShell'
      vault.add(box)
      const frame = new THREE.Mesh(rbox(2.9, 2.1, 0.14, 0.04, 1), flatMat(0x2a3040, { surface: 'metal-rough' }))
      frame.position.set(0, 1.3, 1.0)
      vault.add(frame)
      const door = new THREE.Mesh(lathe([
        [0.00, 0.00], [0.92, 0.00], [0.96, 0.05], [0.94, 0.13], [0.00, 0.15],
      ], 28), flatMat(0x50596d, { surface: 'metal', roughness: 0.85 }))
      door.rotation.x = Math.PI / 2      // +Y (lathe axis) -> +Z, i.e. out of the face
      door.position.set(0, 1.3, 1.02)
      door.name = 'vaultDoor'
      vault.add(door)
      // Eight bolts around the door ring — the medium read at 1 m.
      const boltMat = flatMat(0x9aa2b4, { surface: 'metal', roughness: 0.6 })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const bolt = new THREE.Mesh(pill(0.055, 0.06, 3, 8), boltMat)
        bolt.rotation.x = Math.PI / 2
        bolt.position.set(Math.cos(a) * 0.82, 1.3 + Math.sin(a) * 0.82, 1.14)
        vault.add(bolt)
      }
      const coin = makeCoinMesh(1.0, 0.22, { text: '₩' })
      coin.position.set(0, 1.3, 1.2)
      vault.add(coin)
      const sign = makeSign('PERMANENT RESERVE', { w: 4.6, h: 1.0, bg: '#241028', fg: '#ffd94a', sub: 'DO NOT DESTABILIZE' })
      sign.position.set(0, 3.4, 0.4)
      vault.add(sign)
      vault.userData.contactShadow = true
      cx.add(vault)
      // loose coins on the floor — someone has been skimming
      for (const [x, z] of [[-2.4, 1.2], [2.6, 0.8], [1.8, 2.1]]) {
        const c = makeCoinMesh(0.34, 0.09)
        c.rotation.x = Math.PI / 2
        c.position.set(x, 0.06, z)
        cx.add(c)
      }
      // Two emergency strobes in housings, so the red pulse has a visible
      // source in frame instead of arriving from nowhere.
      const strobeMat = emissive(0xff2233, 6, 'emissive', { unique: true })
      cx.onDispose(() => strobeMat.dispose())
      for (const sx of [-1.55, 1.55]) {
        const lens = new THREE.Mesh(sellip(0.13, 0.1, 0.09, 2.4, 2.4, 12), strobeMat)
        lens.position.set(sx, 2.72, 0.9)
        cx.add(lens)
      }
      const warn = new THREE.PointLight(0xff2233, 0, 16)
      warn.position.set(0, 3.1, 2.4)
      cx.add(warn)
      // Two shafts of dusty red off the strobes. makeLightShaft dissolves
      // analytically at the floor and fades at its own silhouette, so it reads
      // as volume instead of as the hard translucent cone every arena used to
      // hand-roll — and it is what gives the vault its air.
      const shafts = []
      for (const sx of [-1.55, 1.55]) {
        const shaft = makeLightShaft({
          radius: 1.15, length: 3.0, color: 0xff3a48, opacity: 0.10,
          groundY: 0, groundFade: 1.0, taper: 0.8, nearFade: 2.2,
        })
        shaft.position.set(sx * 1.25, 2.9, 1.4)
        shaft.rotation.z = sx > 0 ? -0.22 : 0.22
        cx.add(shaft)
        shafts.push(shaft)
      }
      cx.onUpdate((dt, t) => {
        const pulse = Math.max(0, Math.sin(t * 8))
        warn.intensity = pulse * 30
        strobeMat.emissiveIntensity = 0.7 + pulse * 7
        for (const s of shafts) s.userData.setOpacity?.(0.02 + pulse * 0.11)
        const j = Math.max(0, t - 1.4) * 0.02
        vault.position.set((cx.rng() - 0.5) * j, (cx.rng() - 0.5) * j, 0)
        coin.rotation.z = Math.sin(t * 5) * 0.08 * (1 + t * 0.4)
      })
    },
  },

  // -- 1. DOGEY — up 0.01%, ecstatic ---------------------------------------
  {
    dur: 3.2, seed: 21, fighter: 'dogey',
    bg: '#3fa9f5',
    // Hard overhead sun, high key, short shadows — and noon-stadium's 0.90
    // exposure is what keeps a bright blue sky over a bright green field from
    // clipping, which is exactly what the old single-exposure pass did here.
    mood: 'noon-stadium',
    env: {
      sky: 0x2f8fe4, horizon: 0xb8e2ff, ground: 0x3f8a48,
      haze: 0xdff0ff, hazeStrength: 0.40, gradPow: 0.78,
      sunDir: [0.52, 0.78, 0.35],
      clouds: { coverage: 0.36, sharpness: 0.12, scale: 3.0, band: 0.5, lit: 0xffffff, shade: 0xa8bccf, sunGlow: 0.5 },
      saturation: 1.06,
    },
    skyBlur: 0.05, exposure: 1.0,
    rig: { rimColor: 0xfff0c0, rimIntensity: 2.8, bounceColor: 0x4f9a52, bounceIntensity: 0.34 },
    ground: { color: 0x46b060, surface: 'foliage', repeat: [40, 40], scale: 2.4, wear: 0.25 },
    fog: { color: 0xbfe0f2, near: 20, far: 62 },
    fov: 46, ease: 'out', float: 0.02, roll: 0.02, dof: 0.6, dofRange: 2.4,
    cam: { from: [0.6, 1.5, 6.6], to: [0.2, 1.4, 4.7], look: [0.2, 1.25, 0] },
    captions: [
      { t: 0.2, text: "DOGEY'S TOKEN WAS UP 0.01%." },
      { t: 1.8, text: '"WE ARE SO BACK," HE WHISPERED.' },
    ],
    sounds: [
      { t: 0.25, sfx: 'coins_burst', opts: { vol: 0.8 } },
      { t: 1.3, sfx: 'bark' },
      { t: 2.3, sfx: 'coin', opts: { vol: 0.7 } },
    ],
    build(cx) {
      cx.actor('dogey', { x: 0.5, rotY: -0.85, clip: ['win', 'taunt', 'idle'] })
      // The ticker board is a real object now: a bezelled housing on a post,
      // with the chart as a self-lit screen inside it rather than a floating
      // unlit quad. `emissive(..., 'screen')` is what makes it bloom and what
      // makes it throw green onto Dogey's face.
      const board = new THREE.Group()
      board.position.set(-2.2, 0, -1.4)
      board.rotation.y = 0.4
      cx.add(board)
      const housing = new THREE.Mesh(rbox(2.76, 1.5, 0.16, 0.05, 2), flatMat(0x1b2030, { surface: 'metal-painted' }))
      housing.position.y = 1.7
      board.add(housing)
      const chart = makeCandlestickChart(256, 128, { header: '$DOGEY / USD', rng: cx.rng })
      // White emissive + the chart as the EMISSIVE map, not a green tint over
      // it: the candles then glow in their own red/green and the panel's dark
      // background stays dark, which is what a real display does.
      //
      // Base colour is WHITE on purpose. A lit material multiplies albedo by
      // the map, so authoring a display panel as "dark navy + painted map" is
      // how you get an opaque black slab — materials.js detects that exact
      // mistake, repairs it and logs. `pbr(0xffffff, 'screen', { map })` is the
      // shape it asks for, so that is the shape used here.
      const chartMat = emissive(0xffffff, 1.15, 'screen', {
        unique: true, noMaps: true, color: 0xffffff,
        map: chart.texture, emissiveMap: chart.texture,
      })
      cx.onDispose(() => chartMat.dispose())
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), chartMat)
      plane.name = 'tickerFace'
      plane.position.set(0, 1.7, 0.09)
      board.add(plane)
      const postMat = flatMat(0x39404f, { surface: 'metal-rough' })
      for (const px of [-1.1, 1.1]) {
        const post = new THREE.Mesh(pill(0.07, 0.95, 3, 10), postMat)
        post.position.set(px, 0.52, -0.02)
        board.add(post)
      }
      const glow = new THREE.PointLight(0x3fff88, 4.5, 5.5, 2)
      glow.position.set(0, 1.7, 0.6)
      board.add(glow)
      const sign = makeSign('+0.01%!!!', { w: 2.2, h: 0.7, bg: '#07300f', fg: '#2bff6a', border: '#2bff6a' })
      sign.position.set(-2.2, 2.75, -1.4)
      sign.rotation.y = 0.4
      cx.add(sign)
      let tick = 0
      cx.onUpdate((dt) => {
        tick += dt
        if (tick > 0.45) { tick = 0; chart.tick() }
      })
      confetti(cx)
    },
  },

  // -- 2. PEEPEE — exits the liquidity pool --------------------------------
  {
    dur: 3.0, seed: 31, fighter: 'peepee',
    bg: '#183b1f',
    // overcast-swamp is the mood that was rebuilt specifically so a flat green
    // dome stops delivering isotropic light: a tight 3.4-degree break in the
    // cloud, a dark tree-line panel behind and a green underlight from the
    // pool. All three are what give this shot form instead of one value.
    mood: 'overcast-swamp',
    env: {
      sky: 0x2e5a30, horizon: 0x6f9a48, ground: 0x22381f,
      haze: 0x5f8442, hazeStrength: 0.58, gradPow: 0.8,
      sunDir: [-0.42, 0.72, 0.55], saturation: 0.98,
      clouds: { coverage: 0.78, sharpness: 0.24, scale: 1.9, band: 0.52, lit: 0xa8c47a, shade: 0x33502c, sunGlow: 0.4 },
      panels: [
        { dir: [-0.36, 0.82, 0.45], size: 24, color: 0xd8e8a8, intensity: 0.34 },
        { dir: [0.58, 0.20, -0.79], size: 44, color: 0x203218, intensity: 0.16 },
        { dir: [-0.18, -0.60, 0.78], size: 44, color: 0x2fd657, intensity: 0.26 },
      ],
    },
    skyBlur: 0.09, exposure: 1.0,
    rig: { rimColor: 0xd8ffb0, rimIntensity: 2.9, bounceColor: 0x2f6a30, bounceIntensity: 0.34 },
    ground: { color: 0x2c5230, surface: 'mud', repeat: [26, 26], wear: 0.5 },
    fog: { color: 0x2c4a2c, near: 13, far: 54 },
    fov: 48, ease: 'drift', float: 0.034, roll: -0.03, dof: 0.7, dofRange: 2.2,
    cam: { from: [0.2, 1.7, 7], to: [0.6, 1.5, 5.7], look: [0.5, 1.1, 0] },
    captions: [
      { t: 0.25, text: 'PEEPEE LEFT THE LIQUIDITY POOL.' },
      { t: 1.7, text: 'THE LIQUIDITY HAD ALREADY LEFT.' },
    ],
    sounds: [
      { t: 0.15, sfx: 'boing' },
      { t: 0.2, sfx: 'slide', opts: { vol: 0.6 } },
      { t: 2.35, sfx: 'croak' },
      { t: 2.4, sfx: 'thud', opts: { vol: 0.6 } },
    ],
    build(cx) {
      // A sunken basin with a bioluminescent surface: a lip ring the light can
      // catch, then a rough-metalness water plane that both reflects the sky
      // (via the IBL) and emits its own sick green. A flat cylinder with a
      // hand-set emissive was the single flattest object in the old reel.
      const basin = new THREE.Mesh(lathe([
        [0.00, 0.00], [2.02, 0.00], [2.14, 0.05], [2.20, 0.16], [2.10, 0.20], [2.04, 0.10],
      ], 30), flatMat(0x3d4a2c, { surface: 'stone', mapOpts: { scale: 3, wear: 0.6 } }))
      basin.position.set(-1.0, 0, 0)
      cx.add(basin)
      const poolMat = flatMat(0x2fae6a, {
        surface: 'water', unique: true, transparent: true, opacity: 0.92,
        emissive: 0x0d5a24, emissiveIntensity: 0.85, roughness: 0.55,
        mapOpts: { scale: 4, repeat: [3, 3] },
      })
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.02, 40), poolMat)
      pool.name = 'liquidityPool'
      pool.rotation.x = -Math.PI / 2
      pool.position.set(-1.0, 0.11, 0)
      pool.receiveShadow = true
      pool.userData.noShadow = true
      cx.add(pool)
      const poolGlow = new THREE.PointLight(0x3fe888, 5, 6, 2)
      poolGlow.position.set(-1.0, 0.5, 0)
      cx.add(poolGlow)
      const sign = makeSign('TOTALLY SAFE POOL*', { w: 2.6, h: 0.8, sub: '1,000,000% APY*', bg: '#123a18', fg: '#9fff6a' })
      sign.position.set(-3.2, 1.5, -0.8)
      sign.rotation.y = 0.45
      cx.add(sign)
      const post = new THREE.Mesh(
        lathe([[0.00, 0], [0.075, 0], [0.085, 0.06], [0.07, 1.14], [0.055, 1.2], [0.00, 1.2]], 12),
        flatMat(0x5a4326, { surface: 'wood', roughness: 1.15, mapOpts: { scale: 1.4 } }),
      )
      post.position.set(-3.2, 0, -0.8)
      cx.add(post)
      // bubbles — the pool is definitely fine
      // 'plastic', not 'glass': glass carries `transmission`, which costs a
      // whole extra scene render per material (README §7). Seven bubbles are
      // not worth a second render pass. The roughness multiplier does the
      // glossiness without pulling a second procedural field into the reel's
      // resident set.
      const bubbleMat = pbr(0x8fff9f, 'plastic', {
        transparent: true, opacity: 0.42, roughness: 0.25, noMaps: true,
      })
      const bubbleGeo = new THREE.SphereGeometry(0.07, 10, 8)
      const bubbles = []
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(bubbleGeo, bubbleMat)
        b.scale.setScalar(0.6 + cx.rng() * 0.9)
        b.position.set(-1.0 + (cx.rng() - 0.5) * 2.6, cx.rng() * 0.8, (cx.rng() - 0.5) * 1.6)
        cx.add(b)
        bubbles.push(b)
      }
      // bubbleMat is a shared cache entry — geometry only (README §5).
      cx.onDispose(() => { bubbleGeo.dispose() })
      const frog = cx.actor('peepee', { x: -1.0, clip: ['jump', 'idle'] })
      cx.onUpdate((dt, t) => {
        for (const b of bubbles) {
          b.position.y += dt * 0.55
          if (b.position.y > 1.1) b.position.y = 0.1
        }
        // the arc: pool -> dry land, one graceful panicked leap
        const T = Math.min(t, 2.4)
        frog.group.position.x = -1.0 + T * 1.35
        frog.group.position.y = Math.max(0, 2.25 * (1 - Math.pow((T - 1.2) / 1.2, 2)))
        frog.group.rotation.z = -Math.min(T, 2.2) * 0.14
        if (t > 1.25 && t < 2.35) frog.play('fall')
        else if (t >= 2.4) { frog.group.rotation.z = 0; frog.play('taunt') }
      })
    },
  },

  // -- 3. SHIBRO — silent mountain node guardian ---------------------------
  {
    dur: 3.0, seed: 41, fighter: 'shibro',
    bg: '#04060f',
    // mountain-dawn's calibration (exposure 0.98, contrast 0.17, a real black
    // at 0.032) driven to a moonlit night: a small hard moon at -0.6 azimuth,
    // a deep blue sky and a bright SNOW ground half, which is what makes an
    // arctic night read cold-clean rather than merely dark.
    mood: 'mountain-dawn',
    env: {
      sky: 0x040814, horizon: 0x14233f, ground: 0x8fa8c4,
      haze: 0x1b2c4c, hazeStrength: 0.55, hazeFalloff: 4.8, gradPow: 0.62, groundPow: 1.3,
      sun: 0xcfe0ff, sunSize: 1.6, sunE: 0.20, sunDir: [-0.62, 0.58, 0.53],
      clouds: { coverage: 0.42, sharpness: 0.22, scale: 2.2, band: 0.38, lit: 0x35486e, shade: 0x0a1024, sunGlow: 0.5 },
      contrast: 1.18, saturation: 0.94,
      panels: [{ dir: [0.35, 0.12, -0.93], size: 34, color: 0x16233f, intensity: 0.16 }],
    },
    skyBlur: 0.06, exposure: 1.02,
    rig: {
      rimColor: 0xbcd8ff, rimIntensity: 3.2,
      fillColor: 0x4a6a9c, fillIntensity: 0.5,
      sunColor: 0xc8dcff, bounceColor: 0x8fa8c4, bounceIntensity: 0.38,
    },
    ground: { color: 0xdfe8f2, surface: 'snow', repeat: [22, 22], scale: 3.2, wear: 0.2 },
    fog: { color: 0x131c33, near: 12, far: 48 },
    // The long lens. He does not move and he does not speak; compressing the
    // node, the guardian and the snow into one plane is what says "still".
    fov: 36, ease: 'inout', float: 0.014, roll: 0.008, dof: 0.9, dofRange: 1.8,
    cam: { from: [3.6, 1.2, 6.2], to: [1.5, 1.5, 5.0], look: [0, 1.4, 0] },
    captions: [
      { t: 0.25, text: 'FAR NORTH, SHIBRO GUARDS THE MOUNTAIN NODE.' },
      { t: 1.75, text: 'HE HAS NEVER MISSED A BLOCK. OR SAID A WORD.' },
    ],
    sounds: [
      { t: 0.3, sfx: 'whoosh', opts: { vol: 0.45, pitch: 0.6 } },
      { t: 2.1, sfx: 'thud', opts: { vol: 0.4, pitch: 0.7 } },
    ],
    build(cx) {
      cx.actor('shibro', { x: 0.6, rotY: -0.6, clip: ['block', 'idle'], speed: 0.55 })
      // The node: a chamfered granite obelisk with a capstone and a snow shelf,
      // not a 0.95 m box. Three silhouette events up its height is what makes a
      // vertical prop read at distance.
      const nodeStone = flatMat(0x232a38, { surface: 'stone', mapOpts: { scale: 2.6, repeat: [1, 3], wear: 0.5 } })
      const node = new THREE.Mesh(rbox(0.95, 2.5, 0.95, 0.035, 2), nodeStone)
      node.position.set(-1.4, 1.25, -0.4)
      node.name = 'nodeObelisk'
      node.userData.contactShadow = true
      cx.add(node)
      const cap = new THREE.Mesh(rbox(1.12, 0.16, 1.12, 0.03, 1), nodeStone)
      cap.position.set(-1.4, 2.56, -0.4)
      cx.add(cap)
      const plinth = new THREE.Mesh(rbox(1.24, 0.18, 1.24, 0.03, 1), nodeStone)
      plinth.position.set(-1.4, 0.09, -0.4)
      cx.add(plinth)
      // Snow settled on the capstone — the one detail that says "nobody has
      // touched this in a very long time".
      const snowCap = new THREE.Mesh(
        sellip(0.58, 0.07, 0.58, 3.4, 3.4, 16),
        flatMat(0xe8f0fa, { surface: 'snow', mapOpts: { scale: 4 } }),
      )
      snowCap.position.set(-1.4, 2.68, -0.4)
      cx.add(snowCap)
      const lampMat = emissive(0x2bff6a, 6, 'emissive', { unique: true })
      const lamp = new THREE.Mesh(sellip(0.09, 0.09, 0.05, 2.2, 2.2, 12), lampMat)
      lamp.position.set(-1.4, 2.1, 0.13) // just proud of the obelisk face
      cx.add(lamp)
      const glow = new THREE.PointLight(0x2bff6a, 8, 7)
      glow.position.set(-1.4, 2.1, 0.4)
      cx.add(glow)
      const linkGeo = new THREE.TorusGeometry(0.17, 0.05, 8, 16)
      const linkMat = flatMat(0x5b6576, { surface: 'metal-rough', mapOpts: { wear: 0.7 } })
      for (let i = 0; i < 6; i++) {
        const link = new THREE.Mesh(linkGeo, linkMat)
        link.position.set(-1.4 + 0.34 + i * 0.3, 2.3 - i * 0.4, 0.15)
        link.rotation.y = i % 2 ? Math.PI / 2 : 0.1
        link.rotation.z = 0.5
        cx.add(link)
      }
      cx.onDispose(() => { linkGeo.dispose(); lampMat.dispose() })
      cx.onUpdate((dt, t) => {
        // Ease the blink instead of hard-switching a colour: a status LED has a
        // phosphor decay, and a stepped one reads as a texture swap.
        const on = 0.5 + 0.5 * Math.tanh(Math.sin(t * 6) * 3.2)
        lampMat.emissiveIntensity = 0.5 + on * 6.5
        glow.intensity = 1 + on * 7
      })
      snowfall(cx)
    },
  },

  // -- 4. TIRED APE — the office collapses, he does not --------------------
  {
    dur: 3.2, seed: 51, fighter: 'tired-ape',
    bg: '#5a6470',
    // liquidation-storm's grade — exposure 1.06, contrast 0.19, saturation 0.92
    // — is the bleak one, and bleak is the joke. Its sky is retuned to a flat
    // grey overcast day and its LIGHTNING IS SWITCHED OFF (`flicker: false`):
    // the mood ships a strike train, and a thunderstorm going off behind a
    // collapsing open-plan office is a different film.
    mood: 'liquidation-storm',
    env: {
      sky: 0x556070, horizon: 0x9aa4ae, ground: 0x6a737e,
      haze: 0xa8b0b8, hazeStrength: 0.52, hazeFalloff: 5.5, gradPow: 0.88,
      sun: 0xf4f6fa, sunSize: 2.8, sunE: 0.29, sunDir: [0.44, 0.74, 0.51],
      clouds: { coverage: 0.86, sharpness: 0.2, scale: 2.0, band: 0.55, lit: 0xc4ccd4, shade: 0x6a737e, sunGlow: 0.3 },
      contrast: 1.08, saturation: 0.82,
      panels: [{ dir: [-0.5, 0.3, -0.81], size: 40, color: 0x39414a, intensity: 0.14 }],
    },
    skyBlur: 0.12, exposure: 0.98,
    rig: {
      flicker: false,
      rimColor: 0xdfe8f4, rimIntensity: 2.6,
      fillColor: 0x8a94a4, fillIntensity: 0.5,
      bounceColor: 0x6a737e, bounceIntensity: 0.3,
    },
    ground: { color: 0x707a86, surface: 'concrete', repeat: [34, 34], wear: 0.55 },
    fog: { color: 0x8b95a0, near: 15, far: 58 },
    fov: 44, ease: 'drift', float: 0.03, roll: 0.018, dof: 0.7, dofRange: 2.6,
    cam: { from: [1.6, 1.7, 6.4], to: [0.9, 1.4, 5.2], look: [0.7, 1.15, 0] },
    captions: [
      { t: 0.25, text: "TIRED APE'S STARTUP COLLAPSED THAT MORNING." },
      { t: 1.85, text: 'HE FINISHED HIS COFFEE FIRST.' },
    ],
    sounds: [
      { t: 0.75, sfx: 'thud', opts: { vol: 0.85 } },
      { t: 1.65, sfx: 'thud', opts: { vol: 0.9, pitch: 0.85 }, shake: 0.25 },
      { t: 2.5, sfx: 'break', opts: { vol: 0.8 }, shake: 0.35 },
    ],
    build(cx) {
      cx.actor('tired-ape', { x: 1.7, rotY: -1.0, clip: ['taunt', 'idle'], speed: 0.5 })
      const desks = []
      for (const [x, z, at] of [[-2.4, -0.6, 0.55], [-0.6, -1.4, 1.45], [-1.6, 0.6, 2.3]]) {
        const d = makeDesk()
        d.position.set(x, 0, z)
        d.rotation.y = cx.rng() * 0.8 - 0.4
        cx.add(d)
        desks.push({ d, at, done: false })
      }
      cx.onUpdate((dt, t) => {
        for (const item of desks) {
          if (t < item.at) continue
          const f = Math.min(1, (t - item.at) / 0.45)
          const e = 1 - Math.pow(1 - f, 3) // ease-out topple
          item.d.rotation.z = -1.35 * e
          item.d.position.y = -0.25 * e
        }
      })
      // drifting memos of a dead company
      confetti(cx, { n: 22, colors: ['#f4f4f4', '#e8e8ea', '#d8dce2'], size: 0.16, fall: [0.5, 1.0] })
    },
  },

  // -- 5. FATTY PINGO — launches the dangerous machine ---------------------
  {
    dur: 3.2, seed: 61, fighter: 'fatty-pingo',
    bg: '#8fd4ff',
    // The brightest shot in the reel, so it takes the most disciplined
    // exposure: arctic-day is calibrated at 0.86 precisely because a snow
    // ground is a mirror that outshines the sky. This is the shot that used to
    // blow out.
    mood: 'arctic-day',
    env: {
      sky: 0x59a0e0, horizon: 0xdcf0ff, ground: 0xd8ecfa,
      haze: 0xe8f6ff, hazeStrength: 0.5, groundPow: 1.35,
      sunDir: [0.48, 0.62, 0.62],
      clouds: { coverage: 0.44, sharpness: 0.2, scale: 2.9, band: 0.46, lit: 0xffffff, shade: 0xc0d8ea, sunGlow: 0.5 },
    },
    skyBlur: 0.05, exposure: 0.96,
    rig: { rimColor: 0xffd9a8, rimIntensity: 2.8, bounceColor: 0xcfe4f5, bounceIntensity: 0.4 },
    ground: { color: 0xeaf6ff, surface: 'snow', repeat: [24, 24], scale: 3.4, wear: 0.18 },
    fog: { color: 0xd8ecfa, near: 22, far: 64 },
    // Wide: the machine is going up and the frame has to have somewhere for it
    // to go. The camera rises with it, so the lens gives the climb its scale.
    fov: 54, ease: 'in', float: 0.04, roll: -0.025, dof: 0.5, dofRange: 3.4,
    cam: { from: [0, 1.7, 7.4], to: [0, 2.7, 7.9], look: [0, 1.4, 0], lookTo: [-0.6, 3.2, 0] },
    captions: [
      { t: 0.25, text: 'FATTY PINGO WAS TOLD NOT TO TOUCH THE MACHINE.' },
      { t: 1.8, text: 'THE MACHINE IS NOW AIRBORNE. AND DANGEROUS.' },
    ],
    sounds: [
      { t: 0.7, sfx: 'explosion', opts: { vol: 0.55, pitch: 1.3 }, shake: 0.45 },
      { t: 1.0, sfx: 'whoosh', opts: { vol: 0.8, pitch: 0.7 } },
      { t: 2.4, sfx: 'explosion', opts: { vol: 0.4, pitch: 1.6 } },
    ],
    build(cx) {
      cx.actor('fatty-pingo', { x: 1.2, rotY: -0.9, clip: ['taunt', 'idle'], speed: 2.1 })
      // The big red button he definitely pressed: a lathed pedestal with a
      // chamfered collar, a brushed guard ring and a glossy domed actuator.
      const pedestal = new THREE.Mesh(lathe([
        [0.00, 0.00], [0.36, 0.00], [0.34, 0.06], [0.29, 0.14],
        [0.28, 0.78], [0.33, 0.86], [0.34, 0.90], [0.00, 0.90],
      ], 18), flatMat(0x4a5568, { surface: 'metal-painted', mapOpts: { scale: 2 } }))
      pedestal.position.set(0.35, 0, 0.3)
      pedestal.name = 'buttonPedestal'
      pedestal.userData.contactShadow = true
      cx.add(pedestal)
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.028, 8, 22),
        flatMat(0x9aa4b4, { surface: 'metal', roughness: 0.7 }))
      guard.rotation.x = Math.PI / 2
      guard.position.set(0.35, 0.9, 0.3)
      cx.add(guard)
      const button = new THREE.Mesh(
        sellip(0.19, 0.13, 0.19, 3.0, 3.0, 18),
        flatMat(0xff2b3d, { surface: 'plastic', roughness: 0.35, mapOpts: { scale: 1.2 } }),
      )
      button.position.set(0.35, 0.9, 0.3)
      button.name = 'bigRedButton'
      cx.add(button)
      const rocket = makeRocket()
      rocket.position.set(-1.5, 0, -0.5)
      cx.add(rocket)
      const smoke = puffSpawner(cx, { colors: [0xdfe4ea, 0xb8c0cc, 0xffa447], ash: 0xc4ccd6 })
      const flame = rocket.userData.flame
      const exhaust = rocket.userData.glow
      let puffTimer = 0
      cx.onUpdate((dt, t) => {
        if (t < 0.8) { button.position.y = 0.9; return }
        button.position.y = 0.855   // he pressed it, and it stayed pressed
        flame.visible = true
        exhaust.intensity = 9 + Math.abs(Math.sin(t * 26)) * 6
        flame.scale.setScalar(0.7 + Math.abs(Math.sin(t * 26)) * 0.6)
        const T = t - 0.8
        // climb, then hover dangerously — capped so the machine (and Pingo,
        // under the rising camera) stay inside the letterboxed frame all shot
        rocket.position.y = Math.min(T * T * 2.1, 3.0 + Math.sin(t * 5) * 0.12)
        rocket.position.x = -1.5 + Math.sin(t * 15) * 0.12 * Math.min(1, T)
        rocket.rotation.z = Math.sin(t * 8.5) * 0.16
        puffTimer += dt
        if (puffTimer > 0.11 && rocket.position.y < 9) {
          puffTimer = 0
          smoke(new THREE.Vector3(rocket.position.x, Math.max(0.2, rocket.position.y - 0.3), -0.5), { size: 0.45, dur: 0.9, rise: 0.3 })
        }
      })
    },
  },

  // -- 6. BONKO — outrunning the settlement train --------------------------
  {
    dur: 3.0, seed: 71, fighter: 'bonko',
    bg: '#2b1743',
    // sunset-stadium: the mood rebuilt to stop being "orange mid-tone soup" —
    // contrast 0.22 and a black at 0.040 for the anchor, a 1.8-degree sun for
    // the highlight, and shadows pushed blue so the frame is not one hue. A
    // desert chase at last light is exactly what that calibration is for.
    mood: 'sunset-stadium',
    env: {
      sky: 0x2b1743, horizon: 0xff8a3a, ground: 0x5a3a20,
      haze: 0xff9d47, hazeStrength: 0.66, hazeFalloff: 5.5, gradPow: 0.55,
      sun: 0xffa860, sunSize: 1.8, sunE: 0.30, sunDir: [-0.86, 0.10, 0.50],
      clouds: { coverage: 0.4, sharpness: 0.16, scale: 2.8, band: 0.4, lit: 0xffc48a, shade: 0x6a3350, sunGlow: 1.0 },
      saturation: 1.1,
    },
    skyBlur: 0.05, exposure: 1.0,
    rig: { rimColor: 0x8fd0ff, rimIntensity: 3.4, bounceColor: 0x8a5a34, bounceIntensity: 0.32 },
    ground: { color: 0xa9773f, surface: 'sand', repeat: [30, 30], scale: 2.6, wear: 0.4 },
    fog: { color: 0xb85a3a, near: 15, far: 60 },
    // The widest lens in the reel. Wide plus a low camera plus scrolling
    // sleepers is the whole grammar of "he is not going to make it".
    fov: 56, ease: 'drift', float: 0.05, roll: 0.045, dof: 0.45, dofRange: 3.0,
    cam: { from: [0.4, 1.5, 7.0], to: [0.6, 1.4, 6.6], look: [-0.4, 1.1, 0] },
    captions: [
      { t: 0.25, text: 'BONKO OWED THE SETTLEMENT TRAIN ONE (1) PAYMENT.' },
      { t: 1.75, text: 'THE TRAIN DOES NOT FORGET.' },
    ],
    sounds: [
      { t: 0.2, sfx: 'slide', opts: { vol: 0.7 } },
      { t: 1.2, sfx: 'bell' },
      { t: 2.4, sfx: 'whoosh', opts: { vol: 0.7 } },
    ],
    build(cx) {
      const bonko = cx.actor('bonko', { x: 0.4, clip: ['walk', 'idle'], speed: 2.6 })
      // Rails + scrolling ties sell the speed. Polished steel on the railhead
      // is the point of the whole prop: it is the one surface in the shot that
      // takes a hard specular streak off the low sun, and a streak that runs
      // out to the horizon is what makes a track look fast standing still.
      const railMat = flatMat(0x7a8290, { surface: 'metal', roughness: 0.45, mapOpts: { scale: 1.2, repeat: [40, 1] } })
      const railGeo = rbox(26, 0.09, 0.12, 0.022, 1)
      for (const z of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(railGeo, railMat)
        rail.position.set(0, 0.07, z)
        rail.name = 'rail'
        cx.add(rail)
      }
      cx.onDispose(() => railGeo.dispose())
      const tieGeo = rbox(0.42, 0.09, 1.5, 0.018, 1)
      const tieMat = flatMat(0x5a4326, { surface: 'wood', roughness: 1.15, mapOpts: { scale: 1.8, wear: 0.7 } })
      const ties = []
      for (let i = 0; i < 12; i++) {
        const tie = new THREE.Mesh(tieGeo, tieMat)
        tie.position.set(-7 + i * 1.25, 0.045, 0)
        cx.add(tie)
        ties.push(tie)
      }
      // tieMat comes from the shared pbr() cache — geometry only.
      cx.onDispose(() => { tieGeo.dispose() })
      const train = makeTrain()
      train.position.set(-5.6, 0, 0)
      cx.add(train)
      const chuff = puffSpawner(cx, { colors: [0xe4e8ee, 0xb0b8c4], ash: 0x8a7a70 })
      let chuffTimer = 0
      const tip = train.userData.stackTip
      cx.onUpdate((dt, t) => {
        for (const tie of ties) {
          tie.position.x -= 6.5 * dt
          if (tie.position.x < -8) tie.position.x += 15
        }
        // the train lurches — and slowly gains
        train.position.x = -5.6 + Math.sin(t * 2.4) * 0.22 + t * 0.42
        for (const w of train.userData.wheels) w.rotation.y += 9 * dt
        bonko.group.position.y = Math.abs(Math.sin(t * 9)) * 0.1
        bonko.group.rotation.z = -0.14
        chuffTimer += dt
        if (chuffTimer > 0.22) {
          chuffTimer = 0
          chuff(new THREE.Vector3(train.position.x + tip.x, tip.y, 0), { size: 0.4, dur: 0.8, rise: 1.4 })
        }
      })
    },
  },

  // -- 7. CRYPTO PUNK'D — glitches through the museum wall -----------------
  {
    dur: 3.0, seed: 81, fighter: 'crypto-punkd',
    bg: '#1d2233',
    // A gallery, so: museum-gallery. Two 12-degree spot panels over a broad
    // skylight wash, marble bouncing back up, exposure 0.88 and the highest AO
    // multiplier in the table (1.35) — which is what puts a dark line where the
    // wall meets the floor instead of leaving them the same value.
    mood: 'museum-gallery',
    env: {
      sky: 0x9aa4bc, horizon: 0xc8d0e0, ground: 0xb0b8c8,
      haze: 0xc0c8d8, hazeStrength: 0.4, groundPow: 1.25,
      sun: 0xeef4ff, sunDir: [0.28, 0.90, 0.34], saturation: 0.9,
      panels: [
        { dir: [-0.52, 0.80, 0.30], size: 11, color: 0xfff4e2, intensity: 1.0 },
        { dir: [0.60, 0.76, -0.24], size: 11, color: 0xeaf0ff, intensity: 0.7 },
        { dir: [0.0, 0.30, 0.95], size: 40, color: 0x9aa4bc, intensity: 0.2 },
      ],
    },
    skyBlur: 0.18, exposure: 1.0,
    rig: { rimColor: 0xcfe2ff, rimIntensity: 3.0, bounceColor: 0xc8ccd8, bounceIntensity: 0.36 },
    ground: { color: 0xcfd6e4, surface: 'marble', repeat: [18, 18], scale: 3.6, wear: 0.15 },
    fog: { color: 0xa8b2c6, near: 16, far: 56 },
    fov: 40, ease: 'out', float: 0.022, roll: -0.02, dof: 0.8, dofRange: 2.0,
    cam: { from: [1.4, 1.6, 6.5], to: [0.6, 1.4, 5.2], look: [-0.2, 1.3, 0] },
    captions: [
      { t: 0.25, text: "CRYPTO PUNK'D WAS STOLEN FROM A MUSEUM." },
      { t: 1.8, text: 'TECHNICALLY, HE STOLE HIMSELF.' },
    ],
    sounds: [
      { t: 0.4, sfx: 'menu_move', opts: { pitch: 0.5, vol: 0.7 } },
      { t: 1.25, sfx: 'break', opts: { vol: 0.9 }, shake: 0.4 },
      { t: 2.0, sfx: 'menu_move', opts: { pitch: 0.4, vol: 0.7 } },
    ],
    build(cx) {
      // Gallery wall perpendicular to X — the punk phases through it. Plaster
      // over a stone skirting with a chamfered arris: the wall/floor junction
      // is the exact corner museum-gallery's AO kernel was widened to darken,
      // and a raw box has no arris for it to bite on.
      const wallMat = flatMat(0xc4cad8, { surface: 'concrete', mapOpts: { scale: 3.4, repeat: [3, 3], wear: 0.22 } })
      const wall = new THREE.Mesh(rbox(0.26, 3.4, 3.6, 0.03, 2), wallMat)
      wall.position.set(-0.6, 1.7, -0.6)
      wall.name = 'galleryWall'
      cx.add(wall)
      const skirt = new THREE.Mesh(rbox(0.32, 0.16, 3.62, 0.02, 1),
        flatMat(0x8e93a4, { surface: 'marble', mapOpts: { scale: 3 } }))
      skirt.position.set(-0.6, 0.08, -0.6)
      cx.add(skirt)
      const halves = []
      const halfGeo = rbox(0.26, 3.4, 1.8, 0.03, 2)
      cx.onDispose(() => halfGeo.dispose())
      for (const s of [1, -1]) {
        const half = new THREE.Mesh(halfGeo, wallMat)
        half.position.set(-0.6, 1.7, -0.6 + s * 0.9)
        half.visible = false
        cx.add(half)
        halves.push({ mesh: half, s })
      }
      // Two gallery spots, as actual visible cones. museum-gallery's env
      // carries the 12-degree spot PANELS that light the room; these are the
      // beams themselves, so the light in the frame has a source the eye can
      // find. Faint (0.055) on purpose — a gallery is dusty, not foggy.
      for (const [sx, sz] of [[-1.9, -1.5], [-1.9, 0.7]]) {
        const spot = makeLightShaft({
          radius: 0.95, length: 3.6, color: 0xfff2dc, opacity: 0.055,
          groundY: 0, groundFade: 1.3, taper: 0.7, nearFade: 2.4,
        })
        spot.position.set(sx, 3.7, sz)
        spot.rotation.z = -0.16
        cx.add(spot)
      }
      for (const [z, label] of [[-1.7, 'NFT #4021'], [0.6, 'SOLD']]) {
        const frame = makeSign(label, { w: 0.9, h: 0.65, bg: '#3a2a1a', fg: '#ffd94a', px: 128 })
        frame.rotation.y = Math.PI / 2
        frame.position.set(-0.44, 1.9, -0.6 + z)
        cx.add(frame)
      }
      const punk = cx.actor('crypto-punkd', { x: -2.6, rotY: -0.35, clip: ['walk', 'idle'], speed: 1.3 })
      let broken = false
      let posed = false
      let glitchT = 0
      cx.onUpdate((dt, t) => {
        const T = Math.min(t, 2.55) // stop short of the frame edge, hold a pose
        punk.group.position.x = -2.6 + T * 1.55
        if (!posed && t >= 2.55) { posed = true; punk.play('taunt') }
        // digital jitter: position pops + blip dropouts. Dropouts are capped at
        // ~4 frames, never chain, and never fire in the opening beat — the star
        // must actually be on screen, not a rumor.
        glitchT -= dt
        if (glitchT <= 0) {
          if (!punk.group.visible) {
            punk.group.visible = true // a dropout always ends after one blip
            glitchT = 0.1 + cx.rng() * 0.12
          } else {
            punk.group.position.z = (cx.rng() - 0.5) * 0.26
            punk.group.position.y = cx.rng() < 0.2 ? 0.12 : 0
            if (t > 0.6 && cx.rng() < 0.14) {
              punk.group.visible = false
              glitchT = 0.04 + cx.rng() * 0.03
            } else {
              glitchT = 0.09 + cx.rng() * 0.12
            }
          }
        }
        if (!broken && t >= 1.25) {
          broken = true
          wall.visible = false
          for (const h of halves) h.mesh.visible = true
        }
        if (broken) {
          for (const h of halves) {
            h.mesh.rotation.x += h.s * dt * 2.4
            h.mesh.position.z += h.s * dt * 1.6
            h.mesh.position.y = Math.max(0.4, h.mesh.position.y - dt * 1.4)
          }
        }
      })
    },
  },

  // -- 8. COOL PAL — meditates through the apocalypse ----------------------
  {
    dur: 3.2, seed: 91, fighter: 'cool-pal',
    bg: '#1a1030',
    // tower-dusk: warm city floor, cold sky, a 1.6-degree low sun. The frame is
    // a silhouette shot — everything he owns is exploding BEHIND him — so the
    // rim does the separating and the key is kept honest at one side.
    mood: 'tower-dusk',
    env: {
      sky: 0x1a1030, horizon: 0xff7a3a, ground: 0x2c1d3c,
      haze: 0xb03a6a, hazeStrength: 0.62, hazeFalloff: 6.0, gradPow: 0.5,
      sun: 0xff9a50, sunSize: 1.6, sunE: 0.26, sunDir: [-0.80, 0.20, 0.57],
      clouds: { coverage: 0.34, sharpness: 0.16, scale: 3.2, band: 0.34, lit: 0xffb07a, shade: 0x4a2a5a, sunGlow: 0.9 },
      saturation: 1.12,
      panels: [{ dir: [0.1, 0.16, -0.98], size: 34, color: 0xff5a2a, intensity: 0.26 }],
    },
    skyBlur: 0.07, exposure: 1.0,
    rig: {
      rimColor: 0xff9a50, rimIntensity: 3.6,
      fillColor: 0x6a5aa0, fillIntensity: 0.55,
      bounceColor: 0x4a2a48, bounceIntensity: 0.3,
    },
    ground: { color: 0x3a2a4d, surface: 'concrete', repeat: [28, 28], wear: 0.6 },
    fog: { color: 0x3a1a40, near: 12, far: 46 },
    // The longest lens in the reel. He is not moving; the world is. Compressing
    // the fireballs onto his shoulders is the joke, and a 34 mm equivalent
    // would spread them out into separate, harmless events.
    fov: 34, ease: 'inout', float: 0.016, roll: 0, dof: 0.95, dofRange: 1.6,
    cam: { from: [0, 1.35, 5.8], to: [0, 1.2, 4.8], look: [0, 1.15, 0] },
    captions: [
      { t: 0.25, text: 'EVERYTHING COOL PAL OWNED EXPLODED.' },
      { t: 1.8, text: 'HE CHOSE INNER PEACE. AND, LATER, VIOLENCE.' },
    ],
    sounds: [
      { t: 0.45, sfx: 'explosion', opts: { vol: 0.6 }, shake: 0.4 },
      { t: 1.55, sfx: 'explosion', opts: { vol: 0.7, pitch: 0.85 }, shake: 0.55 },
      { t: 2.5, sfx: 'explosion', opts: { vol: 0.5, pitch: 1.2 }, shake: 0.35 },
    ],
    build(cx) {
      const pal = cx.actor('cool-pal', { x: 0, rotY: -Math.PI / 2, clip: ['crouch', 'idle'], speed: 0.4 })
      const boom = puffSpawner(cx, { colors: [0xffb85a, 0xff5a2a, 0xffe07a], ash: 0x3a2c34 })
      const flash = new THREE.PointLight(0xffa447, 0, 30)
      flash.position.set(0, 2.5, -4)
      cx.add(flash)
      const times = [0.45, 1.0, 1.55, 2.1, 2.5]
      let fired = 0
      cx.onUpdate((dt, t) => {
        // serene hover — untouched by market conditions
        pal.group.position.y = 0.18 + Math.sin(t * 2.2) * 0.07
        flash.intensity = Math.max(0, flash.intensity - dt * 140)
        while (fired < times.length && times[fired] <= t) {
          const x = (cx.rng() * 2 - 1) * 3.4
          const z = -3.2 - cx.rng() * 2.5
          for (let i = 0; i < 4; i++) {
            boom(new THREE.Vector3(x + (cx.rng() - 0.5), 0.6 + cx.rng() * 1.6, z), { size: 0.9, dur: 0.75, rise: 1.6 })
          }
          flash.position.set(x, 2.2, z + 1)
          flash.intensity = 60
          fired++
        }
      })
    },
  },

  // -- 9. THE BLACKISH BULL — enters the colosseum -------------------------
  {
    dur: 3.2, seed: 101, fighter: 'blackish-bull',
    bg: '#050308',
    // The darkest shot in the reel, which is exactly why it uses reserve-core:
    // that mood exists because "near-black sky means the IBL gives literally
    // nothing and every surface facing away from the key crushes to #050505"
    // was a filed bug. It carries the table's highest ambient floor (0.130) and
    // an exposure of 1.18, so the bull is a SILHOUETTE — readable black against
    // a red bloom — instead of an absence.
    mood: 'reserve-core',
    env: {
      sky: 0x060309, horizon: 0x1c0710, ground: 0x120609,
      haze: 0x3a0a14, hazeStrength: 0.5, hazeFalloff: 5.0, gradPow: 0.8,
      sun: 0xff2436, sunSize: 3.0, sunE: 0.19, sunDir: [0.0, 0.30, -0.95],
      contrast: 1.3, saturation: 1.14,
      panels: [
        { dir: [0.0, 0.24, -0.97], size: 26, color: 0xff1a2e, intensity: 0.42 },
        { dir: [0.0, 0.98, 0.2], size: 44, color: 0x2a1018, intensity: 0.12 },
      ],
    },
    skyBlur: 0.22, exposure: 1.0,
    rig: {
      rimColor: 0xff2436, rimIntensity: 4.0,
      fillColor: 0x8a2030, fillIntensity: 0.5,
      sunColor: 0xff6a52, sunIntensity: 1.1,
      bounceColor: 0x3a0e16, bounceIntensity: 0.28,
      ambientLift: 1.1,
    },
    ground: { color: 0x201018, surface: 'stone', repeat: [22, 22], wear: 0.7 },
    fog: { color: 0x0d0510, near: 8, far: 40 },
    // Long lens, low camera, almost no move. Everything is doing one job:
    // making a thing that walks toward you look inevitable.
    fov: 35, ease: 'inout', float: 0.012, roll: 0.01, dof: 0.9, dofRange: 2.0,
    cam: { from: [0, 0.9, 5.6], to: [0, 1.15, 4.6], look: [0, 1.6, -1.5] },
    captions: [
      { t: 0.25, text: 'AND IN THE OLD COLOSSEUM, SOMETHING WOKE UP.' },
      { t: 1.8, text: 'THE BLACKISH BULL. HE REMEMBERS EVERY DIP.', gold: true },
    ],
    sounds: [
      { t: 0.45, sfx: 'moo', opts: { pitch: 0.6, vol: 1.0 } },
      { t: 1.6, sfx: 'bell', opts: { vol: 0.6, pitch: 0.7 } },
      { t: 2.6, sfx: 'thud', opts: { vol: 0.9, pitch: 0.6 }, shake: 0.3 },
    ],
    build(cx) {
      // Candlestick columns — this arena charts blood. They used to be unlit
      // MeshBasicMaterial boxes, i.e. six flat rectangles of pure colour with
      // no response to anything, in the one shot whose entire idea is
      // silhouette and rim. Now they are chamfered stone monoliths with a
      // faint emissive core, so the red key rakes down their front edges and
      // the wicks read as steel against the bloom rather than as green paint.
      const wickMat = flatMat(0x5a6a5e, { surface: 'metal-rough', mapOpts: { wear: 0.8 } })
      const upMat = flatMat(0x1a6a38, { surface: 'stone', emissive: 0x082a14, emissiveIntensity: 0.5, mapOpts: { scale: 2.4, wear: 0.6 } })
      const downMat = flatMat(0x7a1420, { surface: 'stone', emissive: 0x3a0810, emissiveIntensity: 0.6, mapOpts: { scale: 2.4, wear: 0.6 } })
      const geoCache = []
      for (let i = 0; i < 6; i++) {
        const s = i % 2 ? 1 : -1
        const up = cx.rng() > 0.45
        const h = 3 + cx.rng() * 2.2
        const bodyGeo = rbox(0.85, h, 0.85, 0.045, 2)
        const body = new THREE.Mesh(bodyGeo, up ? upMat : downMat)
        body.position.set(s * (2.4 + i * 0.7), h / 2, -1.5 - i * 0.9)
        body.name = 'candleBody'
        cx.add(body)
        const wickGeo = pill(0.06, h * 1.5, 3, 8)
        const wick = new THREE.Mesh(wickGeo, wickMat)
        wick.position.copy(body.position)
        wick.position.y = h * 0.75
        cx.add(wick)
        geoCache.push(bodyGeo, wickGeo)
      }
      // The materials are shared pbr() cache entries; only the per-column
      // geometry is ours to free.
      cx.onDispose(() => { for (const r of geoCache) r.dispose() })
      // red rim light from behind — silhouette with burning edges
      const rim = new THREE.PointLight(0xff1a2e, 90, 22)
      rim.position.set(0, 2.6, -5.5)
      cx.add(rim)
      const under = new THREE.PointLight(0x801020, 12, 8)
      under.position.set(0, 0.3, -1)
      cx.add(under)
      // The red haze he walks out of. Wide, shallow, and pointed down the same
      // axis as the rim so the silhouette is cut out of a glowing volume
      // rather than pasted onto a dark plane.
      const haze = makeLightShaft({
        radius: 3.2, length: 4.4, color: 0xff2436, opacity: 0.085,
        groundY: 0, groundFade: 1.6, taper: 0.55, edge: 1.2, nearFade: 3.0,
      })
      haze.position.set(0, 4.4, -5.0)
      cx.add(haze)
      const bull = cx.actor('blackish-bull', { x: 0, z: -4.4, rotY: -Math.PI / 2, clip: ['walk', 'idle'], speed: 0.65 })
      cx.onUpdate((dt, t) => {
        bull.group.position.z = -4.4 + smooth(t / 3.2) * 3.0
        rim.intensity = 80 + Math.sin(t * 7) * 18
        haze.userData.setOpacity?.(0.07 + Math.sin(t * 3.1) * 0.02)
      })
    },
  },

  // -- 10. WALLY — hero shot, walking to the gates -------------------------
  {
    dur: 3.8, seed: 111, fighter: 'wally',
    bg: '#2b1a4d',
    // The hero shot, and the one the whole reel is walking toward. The sun is
    // BEHIND the gates and low, so Wally is backlit: the key rakes his ear rims
    // and the top of the sunglasses (per wally-v2-reference §5, the brow rail
    // is the only specular event on the character), the fill keeps his front
    // readable, and the gold on the pillars has an actual environment to
    // reflect for the first time.
    mood: 'sunset-stadium',
    env: {
      sky: 0x2b1a4d, horizon: 0xff9a3a, ground: 0x4a3520,
      haze: 0xffb060, hazeStrength: 0.64, hazeFalloff: 6.0, gradPow: 0.58,
      // THE ONE SUN THAT IS ACTUALLY IN FRAME (sunDir.z is negative, i.e. on
      // the far side of the gates). Sized and energised deliberately: at 1.7
      // deg / E 0.31 the disc solves to ~450 linear radiance, which is a
      // 30-pixel hole punched through the tonemap and a bloom flare that eats
      // the hero. 2.6 deg / 0.26 solves to ~160 — still a specular peak of
      // ~9.6 at roughness 0.3, so the gold and the sunglasses' brow rail keep
      // their glint, but the flare stays a flare instead of a white-out.
      sun: 0xffd070, sunSize: 2.6, sunE: 0.26, sunDir: [0.0, 0.18, -0.98],
      clouds: { coverage: 0.42, sharpness: 0.15, scale: 2.6, band: 0.44, lit: 0xffd6a0, shade: 0x6a4478, sunGlow: 1.0 },
      contrast: 1.2, saturation: 1.08,
    },
    skyBlur: 0.05, exposure: 1.0,
    rig: {
      rimColor: 0xffd070, rimIntensity: 3.8,
      fillColor: 0x7f9ed4, fillIntensity: 0.62,
      sunColor: 0xffc878, bounceColor: 0x8a6a3a, bounceIntensity: 0.34,
      subjectIntensity: 0.85,
    },
    ground: { color: 0x8a6a3a, surface: 'sand', repeat: [26, 26], scale: 2.8, wear: 0.35 },
    fog: { color: 0x6a3a3a, near: 14, far: 58 },
    // A steady push that is still accelerating when the shot hard-cuts to the
    // title. 46 mm keeps the gates monumental without bending them.
    fov: 46, ease: 'in', float: 0.026, roll: 0, dof: 0.75, dofRange: 2.8,
    cam: { from: [0, 1.5, 6.4], to: [0, 2.1, 2.7], look: [0, 1.5, 0], lookTo: [0, 2.6, -6] },
    captions: [
      { t: 0.25, text: 'AND WALLY? WALLY SAW AN OPPORTUNITY.' },
      { t: 2.0, text: 'WINNER TAKES THE RESERVE.', gold: true },
    ],
    sounds: [
      { t: 0.5, sfx: 'trumpet' },
      { t: 2.4, sfx: 'whoosh', opts: { vol: 0.7 } },
      { t: 2.9, announcer: 'CRYPTO SMACKDOWN!' },
    ],
    build(cx) {
      // Tournament gates. Cut stone with a plinth, a shaft and a cornice —
      // three silhouette events, which is the minimum for something this size
      // to read as architecture rather than as two rectangles.
      const stone = flatMat(0x6a5a7a, { surface: 'stone', mapOpts: { scale: 2.6, repeat: [1, 4], wear: 0.45 } })
      const pillarGeo = rbox(1.1, 4.6, 1.1, 0.05, 2)
      const plinthGeo = rbox(1.44, 0.36, 1.44, 0.035, 1)
      const corniceGeo = rbox(1.36, 0.3, 1.36, 0.035, 1)
      for (const s of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, stone)
        pillar.position.set(s * 2.8, 2.62, -6)
        pillar.name = 'gatePillar'
        pillar.userData.contactShadow = true
        cx.add(pillar)
        const plinth = new THREE.Mesh(plinthGeo, stone)
        plinth.position.set(s * 2.8, 0.18, -6)
        cx.add(plinth)
        const cornice = new THREE.Mesh(corniceGeo, stone)
        cornice.position.set(s * 2.8, 5.07, -6)
        cx.add(cornice)
        const coin = makeCoinMesh(0.5, 0.14)
        coin.position.set(s * 2.8, 4.4, -5.35)
        cx.add(coin)
        // A warm brazier at the foot of each gate: the practical that motivates
        // the fill, and the only thing lighting Wally's front as he arrives.
        const bowl = new THREE.Mesh(
          lathe([[0.00, 0], [0.26, 0], [0.30, 0.1], [0.34, 0.24], [0.30, 0.28], [0.24, 0.16], [0.00, 0.12]], 16),
          flatMat(0x4a3a2a, { surface: 'metal-rough', mapOpts: { wear: 0.7 } }),
        )
        bowl.position.set(s * 1.9, 0.5, -5.1)
        cx.add(bowl)
        const stem = new THREE.Mesh(pill(0.06, 0.5, 3, 8), flatMat(0x3a2e22, { surface: 'metal-rough' }))
        stem.position.set(s * 1.9, 0.28, -5.1)
        cx.add(stem)
        const fire = new THREE.PointLight(0xffa440, 14, 6.5, 2)
        fire.position.set(s * 1.9, 0.9, -5.1)
        cx.add(fire)
        const ember = new THREE.Mesh(sellip(0.2, 0.16, 0.2, 2.6, 2.6, 12), emissive(0xffb055, 4.5, 'emissive'))
        ember.position.set(s * 1.9, 0.72, -5.1)
        cx.add(ember)
      }
      cx.onDispose(() => { pillarGeo.dispose(); plinthGeo.dispose(); corniceGeo.dispose() })
      const beam = new THREE.Mesh(rbox(6.9, 0.9, 1.2, 0.05, 2), stone)
      beam.position.set(0, 5.35, -6)
      beam.name = 'gateBeam'
      cx.add(beam)
      const sign = makeSign('CRYPTO SMACKDOWN', { w: 5.6, h: 1.1, bg: '#140a26', fg: '#ffd94a', sub: 'WINNER TAKES THE RESERVE' })
      sign.position.set(0, 3.7, -5.9)
      cx.add(sign)
      const wally = cx.actor('wally', { x: 0, z: 2.4, rotY: Math.PI / 2, clip: ['walk', 'idle'] })
      let posed = false
      cx.onUpdate((dt, t) => {
        const T = Math.min(t, 2.5)
        wally.group.position.z = 2.4 - (T / 2.5) * 4.5
        if (t > 2.5 && !posed) {
          posed = true
          wally.play('taunt') // one last sunglasses adjustment for the haters
        }
      })
    },
  },
]

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
export class IntroScreen {
  constructor(game) { if (game) this.game = game }

  enter() {
    ensureIntroStyle()
    this.done = false
    this.idx = -1
    this.t = 0
    this._shake = 0
    this._shotGroup = null
    this._updaters = []
    this._disposers = []
    this._soundIdx = 0
    this._capIdx = -1
    this._rig = null
    this._env = null
    this._focus = new THREE.Vector3(0, 1.3, 0)
    this._hero = null

    this.scene = new THREE.Scene()
    // BASE_FOV is the reference focal length every shot's framing was authored
    // against. _updateCamera() re-projects the dolly about the look target for
    // any other `fov`, so a shot can change lens without changing composition.
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, _frameAspect(this.game), 0.1, 240)

    // -- claim the post stack for the duration of the reel -------------------
    // The pipeline is shared with every other screen, so everything touched
    // here is snapshotted and handed back in exit(). A player who skips at
    // 0.4 s must not land on a title screen wearing the intro's grade.
    this._post = null
    const pipeline = this.game?.pipeline
    if (pipeline) {
      this._post = {
        mood: pipeline.mood,
        moodAuto: pipeline.moodAuto,
        vignette: pipeline._vignette,
        grain: pipeline._grain,
        cinematic: pipeline._cinematic,
        dof: pipeline._dofBase ? { ...pipeline._dofBase } : null,
      }
      try {
        // A touch more vignette and grain than gameplay: this is a movie, and
        // the letterbox bars are already telling the player so.
        pipeline.setVignette(0.32)
        pipeline.setGrain(0.034)
      } catch (e) { console.warn('[intro] pipeline setup failed', e) }
    }

    // letterbox + captions + skip hint
    this.root = el('div', 'wcs-intro')
    this.root.appendChild(el('div', 'wcs-intro-bar top'))
    this.root.appendChild(el('div', 'wcs-intro-bar bot'))
    this.caption = el('div', 'wcs-intro-cap')
    this.caption.style.display = 'none'
    this.root.appendChild(this.caption)
    this.root.appendChild(el('div', 'wcs-intro-skip', touchUI(this.game) ? 'TAP ▸ SKIP' : 'ANY BUTTON ▸ SKIP'))
    this.game.ui.appendChild(this.root)

    // skippable from frame 1
    this._onKey = () => this._skip()
    this._onPointer = () => this._skip()
    addEventListener('keydown', this._onKey)
    addEventListener('pointerdown', this._onPointer)
    this._onResize = () => {
      this.camera.aspect = _frameAspect(this.game)
      this.camera.updateProjectionMatrix()
    }
    addEventListener('resize', this._onResize)
    // The integrator, not the window, is the authority on frame size — a
    // backgrounded tab reports innerWidth/innerHeight 0, which makes the
    // projection matrix NaN and renders an entirely black reel.
    this._offResize = this.game?.events?.on?.('resize', ({ w, h }) => {
      this.camera.aspect = (w > 0 && h > 0) ? (w / h) : _frameAspect(this.game)
      this.camera.updateProjectionMatrix()
    }) || null

    this._next() // build shot 0
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    removeEventListener('pointerdown', this._onPointer)
    removeEventListener('resize', this._onResize)
    try { this._offResize?.() } catch { /* already gone */ }
    this._clearShot()
    this._restorePost()
    this.root?.remove()
    this.root = null
    this.caption = null
    this.scene = null
    this.camera = null
    this.done = true
  }

  // Hand the shared post stack back exactly as we found it. Called from exit(),
  // which the screen manager runs on a skip as well as on a natural end.
  _restorePost() {
    const pipeline = this.game?.pipeline
    const s = this._post
    this._post = null
    if (!pipeline || !s) return
    try {
      pipeline.setCinematic(s.cinematic ?? 0)
      if (s.dof) pipeline.setDoF(s.dof)
      pipeline.autoFocus(null)
      pipeline.setVignette(s.vignette ?? 0.18)
      pipeline.setGrain(s.grain ?? 0.026)
      // Put mood autodetection back the way it was. The next screen's scene
      // has no `userData.mood` and no `env:` texture, so auto resolves to the
      // pipeline's base mood on its very first frame.
      pipeline.moodAuto = s.moodAuto !== false
      if (!pipeline.moodAuto && s.mood) pipeline.setMood(s.mood)
      pipeline.resetHistory?.()
    } catch (e) { console.warn('[intro] pipeline restore failed', e) }
  }

  // -- flow ----------------------------------------------------------------

  _skip() {
    if (this.done) return
    this.done = true
    this.game.audio.sfx('menu_confirm')
    this.game.screens.goto('title')
  }

  _next() {
    this.idx++
    if (this.idx >= SHOTS.length) {
      if (this.done) return
      this.done = true
      this.game.screens.goto('title')
      return
    }
    this._buildShot(SHOTS[this.idx])
  }

  // -- shot shell: dispose previous, assemble sky/ground/lights, build -----

  _clearShot() {
    for (const fn of this._disposers) { try { fn() } catch (e) { /* fine */ } }
    this._disposers = []
    this._updaters = []
    this._hero = null
    // The rig owns the scene's fog and a chained scene.onBeforeRender probe;
    // its dispose() puts both back. Do it BEFORE the group teardown so the
    // walk cannot free a light the rig is still holding.
    if (this._rig) {
      try { this._rig.dispose() } catch (e) { console.warn('[intro] rig dispose failed', e) }
      this._rig = null
    }
    // Restores scene.environment / background. Never frees the PMREM — that is
    // shared and cached per mood, which is what makes an intro REPLAY free.
    if (this._env) {
      try { this._env.dispose() } catch (e) { /* fine */ }
      this._env = null
    }
    if (this._shotGroup && this.scene) {
      this.scene.remove(this._shotGroup)
      disposeObject(this._shotGroup)
    }
    this._shotGroup = null
    if (this.scene) {
      this.scene.fog = null
      this.scene.environment = null
      this.scene.background = null
    }
  }

  _buildShot(shot) {
    this._clearShot()
    this.t = 0
    this._soundIdx = 0
    this._capIdx = -1
    if (this.caption) this.caption.style.display = 'none'

    const group = new THREE.Group()
    group.name = `introShot${this.idx}`
    this.scene.add(group)
    this._shotGroup = group

    const mood = shot.mood || 'studio'
    const rng = makeRng(shot.seed || 1)

    // Fallback background: if the environment fails to build (no renderer, a
    // PMREM that would not compile) the frame must still be the shot's colour
    // and not a black void.
    this.scene.background = new THREE.Color(shot.bg || '#000000')

    // 1. THE ENVIRONMENT. One HDR analytic sky, used as BOTH the image-based
    //    light and the visible backdrop, so the sun in the sky, the glint on
    //    the coin and the direction of the key are the same fact stated once.
    //    `scene.userData.mood` also makes the scene self-describing to the
    //    pipeline's mood autodetection.
    this.scene.userData.mood = mood
    const renderer = this.game?.renderer || null
    if (renderer) {
      try {
        this._env = applyEnvironment(this.scene, mood, renderer, {
          resolution: this.game?.quality?.envResolution ?? 256,
          overrides: shot.env || null,
          intensity: shot.envInt ?? 1,
          background: true,
          backgroundBlurriness: shot.skyBlur ?? 0.08,
        })
      } catch (e) { console.warn('[intro] applyEnvironment failed', e) }
    }

    // 2. THE GRADE. Per-shot exposure on top of the mood's calibration, plus
    //    its bloom threshold and AO kernel. This is what stops one global
    //    exposure having to serve a near-black colosseum and a snowfield.
    const pipeline = this.game?.pipeline
    if (pipeline) {
      try {
        pipeline.setMood(mood, { auto: true, exposureScale: shot.exposure ?? 1 })
        pipeline.setCinematic(shot.dof ?? 0.7)
        // Snap the focus plane onto the new framing (setDoF clears the tracked
        // target), THEN re-arm tracking. Without the snap the bokeh would ease
        // across the hard cut from the previous shot's focus distance.
        const cam = shot.cam || {}
        const from = cam.from || [0, 1.6, 7]
        const look = cam.look || [0, 1.4, 0]
        const d = Math.hypot(from[0] - look[0], from[1] - look[1], from[2] - look[2])
        pipeline.setDoF({ focus: Math.max(1.2, d), range: shot.dofRange ?? 2.6, enabled: true })
        // Every shot is a HARD CUT: drop the temporal history so the previous
        // shot does not smear into this one.
        pipeline.resetHistory()
      } catch (e) { console.warn('[intro] pipeline shot setup failed', e) }
    }

    if (shot.ground) {
      const g = shot.ground
      group.add(groundDisc(g.color, g.surface, g))
    }

    // 3. THE RIG. Key aimed off the mood's own sun direction, fill, a
    //    camera-relative fresnel rim (the thing that separates a fighter from
    //    a dark background in every frame), floor bounce, a guaranteed
    //    non-zero ambient floor, a fitted shadow frustum and contact shadows.
    //    Replaces the two hand-rolled lights this file used to ship with.
    try {
      const rig = makeCinematicRig(this.scene, this.game?.quality || {}, {
        mood,
        camera: this.camera,
        focus: shot.focus || [0, 1.2, 0],
        groundY: 0,
        contactShadows: true,
        fog: shot.fog || false,
        ...(shot.rig || {}),
      })
      rig.group.name = 'introRig'
      group.add(rig.group)
      this._rig = rig
    } catch (e) {
      console.warn('[intro] makeCinematicRig failed — falling back to a flat wrap', e)
      group.add(new THREE.HemisphereLight(0xcfeeff, 0x86b978, 1.0))
      if (shot.fog) this.scene.fog = new THREE.Fog(shot.fog.color, shot.fog.near, shot.fog.far)
    }

    // per-shot context passed to build()
    const cx = {
      g: group,
      rng,
      add: (obj) => group.add(obj),
      onUpdate: (fn) => this._updaters.push(fn),
      onDispose: (fn) => this._disposers.push(fn),
      actor: (id, opts) => this._actor(group, id, opts),
    }
    try { shot.build(cx) } catch (e) { console.warn('[intro] shot build failed', e) }

    // 4. SURFACE SWEEP. Everything built by hand above already asks for a real
    //    preset, but the shared ArenaBase helpers still hand back a Lambert
    //    here and there (makeCoinMesh's face is the notable one — the reason
    //    every coin in the old reel was a flat disc). `enrichStandard: false`
    //    means anything that already came from pbr() is left strictly alone,
    //    so this cannot copy-on-write a cached material for no reason, and
    //    actors are excluded outright: a fighter's materials are its own file's
    //    business. The black-floor sweep runs over the whole group regardless,
    //    which is what guarantees no pure-zero surface reaches the frame.
    try {
      upgradeMaterials(group, {
        enrichStandard: false,
        upgradeBasic: false,
        hints: INTRO_HINTS,
        filter: introUpgradeFilter,
        env: this.scene.environment || null,
      })
    } catch (e) { console.warn('[intro] material sweep failed', e) }

    // 5. SHADOWS. Contact discs under the actors and any prop that asked for
    //    one (desks, the loco, the vault, the gate pillars), so nothing in the
    //    frame is floating.
    if (this._rig) {
      try {
        const subjects = []
        group.traverse((o) => { if (o.userData.__introActorRoot) subjects.push(o) })
        if (subjects.length) this._rig.setSubjects(subjects)
        this._rig.addPropShadows?.(group)
      } catch (e) { console.warn('[intro] contact shadows failed', e) }
    }

    // announcer calls the fighter's name as the shot cuts in (§22)
    this._announceFighter(shot)

    // snap the camera to the shot's opening framing immediately (hard cut)
    this._updateCamera(shot)
    if (pipeline) {
      // TWO focus targets, not one. Several shots deliberately look somewhere
      // other than at the hero — Wally's camera racks onto the gates while he
      // walks under them, Pingo's tilts up to follow the rocket — and a
      // single-target focus would make the fighter the soft one at the exact
      // moment the announcer says his name. Given two, the pipeline fits the
      // sharp band to span both.
      try { pipeline.autoFocus(this._hero || this._focus, this._hero ? this._focus : null) } catch (e) { /* optional */ }
    }
  }

  // One name call per fighter shot, at shot start only. announce() cancels any
  // in-flight speech ("new hype wins"), so a minimum gap guards against
  // cancel-restart stutter on abnormal double-builds / instant replays —
  // normal playback spaces the calls >=3s apart (every shot's dur) on its own.
  _announceFighter(shot) {
    if (!shot.fighter) return
    let name
    try { name = Characters[shot.fighter]?.name } catch (e) { /* no def, no shout */ }
    if (!name) return
    const now = performance.now()
    if (now - _lastNameCall < 1200) return
    _lastNameCall = now
    try { this.game.audio.announcer(name) } catch (e) { /* silent movie, then */ }
  }

  // Build a real fighter model + clip sampler. Never throws.
  _actor(group, id, opts = {}) {
    const { x = 0, y = 0, z = 0, rotY = 0, scale = 1, clip = ['idle'], speed = 1 } = opts
    let model
    try {
      const def = Characters[id]
      model = def?.buildModel ? def.buildModel(0) : fallbackFigure()
      if (!model?.group) model = fallbackFigure()
    } catch (e) {
      console.warn(`[intro] buildModel(${id}) failed`, e)
      model = fallbackFigure()
    }
    model.group.position.set(x, y, z)
    model.group.rotation.y = rotY
    model.group.scale.setScalar(scale)
    // Tag the whole subtree so the end-of-build material sweep steps around it
    // — a fighter's surfaces are its own file's business, and re-presetting
    // WALLY's flocked-vinyl body from a generic hint table would undo a whole
    // character round. The root tag is what the rig's contact shadows track.
    model.group.userData.__introActorRoot = true
    model.group.traverse((o) => {
      o.userData.__introActor = true
      // Exactly what Fighter.js:735 does when a fighter enters a match, so the
      // reel's shadows match the game's. `receiveShadow` is deliberately left
      // alone: WALLY opts out of receiving on purpose (wally.js round 7) and
      // that decision belongs to the character file.
      if (o.isMesh || o.isSkinnedMesh) o.castShadow = true
    })
    group.add(model.group)
    // First actor in a shot is the hero: the DoF focus target and the point the
    // rig fits its shadow frustum and swings its rim around.
    if (!this._hero) this._hero = model.group

    const anim = new Animator(model.bones || {}, Characters[id]?.clips || {})
    const wanted = Array.isArray(clip) ? clip : [clip]
    const first = wanted.find((c) => anim.has(c))
    if (first) anim.play(first, { restart: true, speed })
    this._updaters.push((dt) => anim.update(dt))

    return {
      group: model.group,
      anim,
      play: (name, o = {}) => { if (anim.has(name)) anim.play(name, o) },
    }
  }

  // -- per-frame -----------------------------------------------------------

  // ---------------------------------------------------------------------------
  // THE CAMERA.
  //
  // Three things happen here that did not before.
  //
  // 1. THE LENS. `shot.fov` is a real focal-length change, not a crop. The
  //    dolly positions in the shot table were all authored at BASE_FOV, so
  //    changing the field of view alone would re-frame every shot and, in at
  //    least two of them (the rocket climb, the gates), push the subject out of
  //    the letterbox. Instead the camera's offset FROM THE LOOK TARGET is
  //    scaled by tan(BASE/2) / tan(fov/2): anything at the look plane keeps
  //    exactly the size it was authored at, and only the relationship between
  //    foreground and background changes. That is what a lens does.
  //
  // 2. THE CURVE. Per-shot easing (see EASE). smoothstep on everything meant a
  //    three-second dolly spent its first and last second nearly stationary.
  //
  // 3. THE HAND. A small deterministic float driven off wall-clock `this.t`
  //    (never a frame counter — the reel runs on real time, see DRIVER.md) plus
  //    an optional dutch roll. Two incommensurate frequencies per axis so it
  //    never reads as a sine wave, and amplitudes in centimetres so it reads as
  //    an operator rather than as a wobble.
  // ---------------------------------------------------------------------------
  _updateCamera(shot) {
    const cam = shot.cam || { from: [0, 1.6, 7], to: [0, 1.6, 6], look: [0, 1.4, 0] }
    const raw = this.t / shot.dur
    const f = easeFn(shot.ease)(raw)
    const from = cam.from, to = cam.to || cam.from
    const look = cam.look, lookTo = cam.lookTo || cam.look

    const lx = lerp(look[0], lookTo[0], f)
    const ly = lerp(look[1], lookTo[1], f)
    const lz = lerp(look[2], lookTo[2], f)

    // --- lens ---------------------------------------------------------------
    const fov = shot.fov || BASE_FOV
    if (Math.abs(this.camera.fov - fov) > 1e-4) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    const k = Math.tan((BASE_FOV * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360)

    let px = lx + (lerp(from[0], to[0], f) - lx) * k
    let py = ly + (lerp(from[1], to[1], f) - ly) * k
    let pz = lz + (lerp(from[2], to[2], f) - lz) * k

    // --- hand-held float ----------------------------------------------------
    const amp = shot.float ?? 0.024
    if (amp > 0) {
      const t = this.t
      px += (Math.sin(t * 1.31) * 0.6 + Math.sin(t * 2.87 + 1.7) * 0.4) * amp
      py += (Math.sin(t * 1.07 + 2.3) * 0.6 + Math.sin(t * 3.41) * 0.4) * amp * 0.8
      pz += Math.sin(t * 0.83 + 0.9) * amp * 0.5
    }

    // --- impact shake (unchanged: still driven by the sound timeline) -------
    px += (Math.random() - 0.5) * this._shake * 0.3
    py += (Math.random() - 0.5) * this._shake * 0.3

    this.camera.position.set(px, py, pz)
    this.camera.lookAt(lx, ly, lz)

    // --- dutch ---------------------------------------------------------------
    // Applied after lookAt, which zeroes roll. Eased in over the shot so the
    // tilt arrives rather than being there from the cut, plus a hair of the
    // float so the horizon breathes.
    const roll = shot.roll || 0
    if (roll || amp > 0) {
      this.camera.rotateZ(roll * f + Math.sin(this.t * 0.71 + 0.4) * amp * 0.22)
    }

    // The rig's shadow frustum, its camera-relative rim and the DoF all want
    // the same point: where the shot is actually looking.
    this._focus.set(lx, ly + 0.1, lz)
  }

  _setCaption(cap) {
    if (!this.caption) return
    if (!cap) { this.caption.style.display = 'none'; return }
    this.caption.textContent = cap.text
    this.caption.classList.toggle('gold', !!cap.gold)
    this.caption.style.display = ''
    this.caption.classList.remove('pop')
    void this.caption.offsetWidth // restart the pop animation
    this.caption.classList.add('pop')
  }

  update(dt) {
    if (this.done) return
    // dedicated hype track (§22). If the audio library doesn't know the id yet,
    // startMusic() debug-logs and leaves the current track playing — and on
    // exit the title screen's own ensureMusic(game, 'title') switches back
    // either way, since the tracker now holds 'intro_hype'.
    ensureMusic(this.game, 'intro_hype')

    // gamepad / mapped-action skips (DOM listeners can't see pads)
    const input = this.game.input
    for (const name of ['confirm', 'back', 'up', 'down', 'left', 'right']) {
      if (input.menuPressed(name)) { this._skip(); return }
    }
    for (let p = 0; p < 2; p++) {
      for (const a of ['light', 'heavy', 'kick', 'grab', 'special', 'super', 'jump', 'block']) {
        if (input.pressed(p, a)) { this._skip(); return }
      }
    }

    this.t += dt
    const shot = SHOTS[this.idx]
    if (!shot) return

    // timeline: sounds / announcer / shake beats
    const sounds = shot.sounds || []
    while (this._soundIdx < sounds.length && sounds[this._soundIdx].t <= this.t) {
      const s = sounds[this._soundIdx++]
      try {
        if (s.sfx) this.game.audio.sfx(s.sfx, s.opts)
        if (s.announcer) this.game.audio.announcer(s.announcer)
      } catch (e) { /* silent movie, then */ }
      if (s.shake) this._shake = Math.max(this._shake, s.shake)
    }

    // timeline: captions
    const caps = shot.captions || []
    let ci = this._capIdx
    while (ci + 1 < caps.length && caps[ci + 1].t <= this.t) ci++
    if (ci !== this._capIdx) {
      this._capIdx = ci
      this._setCaption(caps[ci])
    }

    this._shake = Math.max(0, this._shake - dt * 1.6)
    this._updateCamera(shot)
    for (const fn of this._updaters) {
      try { fn(dt, this.t) } catch (e) { console.warn('[intro] updater failed', e) }
    }

    // The rig has to be driven every frame or the shadow frustum never fits,
    // the camera-relative rim never swings onto the subject and the contact
    // discs never re-place under a moving actor. Track the hero when there is
    // one (the frog's leap, the punk's walk, Wally's approach), otherwise the
    // shot's own look target.
    if (this._rig) {
      try {
        if (this._hero) {
          this._hero.getWorldPosition(_tmpFocus)
          _tmpFocus.y += 1.0
          this._rig.setFocus(_tmpFocus, 5.0)
          this._rig.update(dt, null, this.camera)
        } else {
          this._rig.update(dt, this._focus, this.camera)
        }
      } catch (e) {
        console.warn('[intro] rig update threw — dropping the rig for this shot', e)
        this._rig = null
      }
    }

    if (this.t >= shot.dur) this._next()
  }

  render(renderer, dt = 1 / 60) {
    // §8: through the shared post stack. The intro runs on wall-clock time, so
    // the dt it hands the pipeline is the real frame delta from Game's loop.
    if (this.scene && this.camera) renderScene(this.game || renderer, this.scene, this.camera, dt)
  }
}
