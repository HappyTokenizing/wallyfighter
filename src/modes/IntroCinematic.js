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
// sampling), ArenaBase helpers (sky/signs/coins/dispose), uiKit (el/music).
// ============================================================================
import * as THREE from 'three'
import { Characters } from '../characters/index.js'
import { Animator } from '../combat/Animator.js'
import {
  makeRng, flatMat, disposeObject, buildSkyDome, makeSign,
  makeCandlestickChart, makeCoinMesh, CROWD_PALETTE,
} from '../arenas/ArenaBase.js'
import { el, ensureMusic } from '../ui/uiKit.js'

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
const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }
const lerp = (a, b, f) => a + (b - a) * f

// Last announcer NAME call (performance.now() ms) — module-level because the
// speech queue it throttles is global, surviving exit()/enter() replays.
let _lastNameCall = -Infinity

function groundDisc(color) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(70, 28), flatMat(color))
  mesh.rotation.x = -Math.PI / 2
  mesh.name = 'introGround'
  return mesh
}

// Emergency stand-in if a character def is missing/broken — the reel must
// never crash because of somebody else's fighter file.
function fallbackFigure() {
  const g = new THREE.Group()
  const m = flatMat(0x2e3450)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.5), m)
  body.position.y = 0.95
  g.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), m)
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
  const geo = new THREE.BoxGeometry(size, size * 0.28, size * 0.62)
  const mats = colors.slice(0, 6).map((c) => new THREE.MeshBasicMaterial({ color: c }))
  const bits = []
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(geo, mats[i % mats.length])
    mesh.position.set(
      (cx.rng() * 2 - 1) * area,
      0.2 + cx.rng() * ymax,
      -2.2 + cx.rng() * 3
    )
    mesh.rotation.set(cx.rng() * 3, cx.rng() * 3, cx.rng() * 3)
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
  cx.onDispose(() => { geo.dispose(); for (const m of mats) m.dispose() })
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
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, sizeAttenuation: true })
  const points = new THREE.Points(geo, mat)
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
function puffSpawner(cx, { colors = [0xffa447, 0xff5a2a] } = {}) {
  const geo = new THREE.SphereGeometry(1, 8, 6)
  const live = []
  cx.onUpdate((dt) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]
      p.life += dt
      const f = p.life / p.dur
      if (f >= 1) {
        cx.g.remove(p.mesh)
        p.mesh.material.dispose()
        live.splice(i, 1)
        continue
      }
      p.mesh.scale.setScalar(p.size * (0.35 + f * 1.8))
      p.mesh.position.y += p.rise * dt
      p.mesh.material.opacity = 0.88 * (1 - f)
    }
  })
  cx.onDispose(() => geo.dispose())
  return (pos, { size = 0.5, dur = 0.7, rise = 0.9, tint } = {}) => {
    const color = tint ?? colors[Math.floor(cx.rng() * colors.length)]
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(pos)
    mesh.scale.setScalar(size * 0.35)
    cx.add(mesh)
    live.push({ mesh, size, dur, rise, life: 0 })
  }
}

// A chunky wooden office desk with a monitor on top (for the Tired Ape shot).
function makeDesk() {
  const g = new THREE.Group()
  const wood = flatMat(0x8a5a33)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.78), wood)
  top.position.y = 0.78
  g.add(top)
  for (const sx of [-0.65, 0.65]) for (const sz of [-0.3, 0.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.75, 0.09), wood)
    leg.position.set(sx, 0.375, sz)
    g.add(leg)
  }
  const mon = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.4), flatMat(0xd8d2c2))
  mon.add(shell)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x16306b })
  )
  screen.position.z = 0.205
  mon.add(screen)
  mon.position.set(0, 1.05, 0)
  g.add(mon)
  return g
}

// A stubby low-poly steam locomotive (the Settlement Train).
function makeTrain() {
  const g = new THREE.Group()
  const iron = flatMat(0x23262e)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.6, 10), iron)
  body.rotation.z = Math.PI / 2
  body.position.set(-0.3, 1.05, 0)
  g.add(body)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 1.3), flatMat(0x37202a))
  cab.position.set(-1.9, 1.1, 0)
  g.add(cab)
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.7, 8), iron)
  chimney.position.set(0.55, 1.95, 0)
  g.add(chimney)
  // cowcatcher
  const plow = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 4), flatMat(0x9c2c35))
  plow.rotation.z = -Math.PI / 2
  plow.rotation.y = Math.PI / 4
  plow.position.set(1.4, 0.5, 0)
  g.add(plow)
  // headlight
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), new THREE.MeshBasicMaterial({ color: 0xffe07a }))
  lamp.position.set(1.02, 1.05, 0)
  lamp.rotation.y = Math.PI / 2
  g.add(lamp)
  const wheels = []
  const wheelMat = flatMat(0x11131a)
  for (const wx of [-1.9, -0.9, 0.1, 1.0]) for (const wz of [-0.55, 0.55]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 9), wheelMat)
    w.rotation.x = Math.PI / 2
    w.position.set(wx, 0.34, wz)
    g.add(w)
    wheels.push(w)
  }
  g.userData.wheels = wheels
  g.userData.stackTip = new THREE.Vector3(0.55, 2.35, 0)
  return g
}

// A dangerous, government-surplus-looking rocket on a launch pad.
function makeRocket() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.7, 10), flatMat(0xe8e4da))
  body.position.y = 1.15
  g.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.75, 10), flatMat(0xd23b3b))
  nose.position.y = 2.35
  g.add(nose)
  const finMat = flatMat(0xd23b3b)
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.42), finMat)
    const a = (i / 3) * Math.PI * 2
    fin.position.set(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42)
    fin.rotation.y = -a
    g.add(fin)
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.9, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.9 })
  )
  flame.rotation.x = Math.PI
  flame.position.y = -0.2
  flame.visible = false
  g.add(flame)
  g.userData.flame = flame
  return g
}

// ---------------------------------------------------------------------------
// THE SHOT LIST — dur (s), scene shell config, timeline, camera move, build().
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
    sky: ['#0a0616', '#2a0a2e', '#571326'], skyOpts: { sun: false, clouds: false },
    bg: '#0a0616', ground: 0x1a1026,
    fog: { color: 0x1a0a1e, near: 12, far: 60 },
    lights: { hemi: [0x8877aa, 0x221133, 0.5], sun: { pos: [6, 9, 8], color: 0xffccaa, int: 0.7 } },
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
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 2), flatMat(0x3a4152))
      box.position.y = 1.3
      vault.add(box)
      const coin = makeCoinMesh(1.0, 0.22, { text: '₩' })
      coin.position.set(0, 1.3, 1.12)
      vault.add(coin)
      const sign = makeSign('PERMANENT RESERVE', { w: 4.6, h: 1.0, bg: '#241028', fg: '#ffd94a', sub: 'DO NOT DESTABILIZE' })
      sign.position.set(0, 3.4, 0.4)
      vault.add(sign)
      cx.add(vault)
      // loose coins on the floor — someone has been skimming
      for (const [x, z] of [[-2.4, 1.2], [2.6, 0.8], [1.8, 2.1]]) {
        const c = makeCoinMesh(0.34, 0.09)
        c.rotation.x = Math.PI / 2
        c.position.set(x, 0.06, z)
        cx.add(c)
      }
      const warn = new THREE.PointLight(0xff2233, 0, 16)
      warn.position.set(0, 3.1, 2.4)
      cx.add(warn)
      cx.onUpdate((dt, t) => {
        warn.intensity = Math.max(0, Math.sin(t * 8)) * 30
        const j = Math.max(0, t - 1.4) * 0.02
        vault.position.set((cx.rng() - 0.5) * j, (cx.rng() - 0.5) * j, 0)
        coin.rotation.z = Math.sin(t * 5) * 0.08 * (1 + t * 0.4)
      })
    },
  },

  // -- 1. DOGEY — up 0.01%, ecstatic ---------------------------------------
  {
    dur: 3.2, seed: 21, fighter: 'dogey',
    sky: ['#3fa9f5', '#9fd8ff', '#fff3c2'],
    bg: '#3fa9f5', ground: 0x46b060,
    lights: { hemi: [0xcfeeff, 0x86b978, 1.05], sun: { pos: [8, 12, 9], color: 0xfff2d0, int: 1.6 } },
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
      const chart = makeCandlestickChart(256, 128, { header: '$DOGEY / USD', rng: cx.rng })
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.25),
        new THREE.MeshBasicMaterial({ map: chart.texture })
      )
      plane.position.set(-2.2, 1.7, -1.4)
      plane.rotation.y = 0.4
      cx.add(plane)
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
    sky: ['#183b1f', '#3f7a38', '#8db44e'], skyOpts: { sun: false, cloudColor: 'rgba(190,220,150,0.8)' },
    bg: '#183b1f', ground: 0x2c5230,
    fog: { color: 0x2c4a2c, near: 16, far: 60 },
    lights: { hemi: [0xbfe8a8, 0x1d3a1f, 0.95], sun: { pos: [-6, 10, 8], color: 0xdfffc0, int: 1.1 } },
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
      const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 2.1, 0.14, 20),
        flatMat(0x2fd657, { emissive: 0x0a4a1c })
      )
      pool.position.set(-1.0, 0.07, 0)
      cx.add(pool)
      const sign = makeSign('TOTALLY SAFE POOL*', { w: 2.6, h: 0.8, sub: '1,000,000% APY*', bg: '#123a18', fg: '#9fff6a' })
      sign.position.set(-3.2, 1.5, -0.8)
      sign.rotation.y = 0.45
      cx.add(sign)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), flatMat(0x5a4326))
      post.position.set(-3.2, 0.55, -0.8)
      cx.add(post)
      // bubbles — the pool is definitely fine
      const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x8fff9f, transparent: true, opacity: 0.6 })
      const bubbleGeo = new THREE.SphereGeometry(0.07, 6, 5)
      const bubbles = []
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(bubbleGeo, bubbleMat)
        b.position.set(-1.0 + (cx.rng() - 0.5) * 2.6, cx.rng() * 0.8, (cx.rng() - 0.5) * 1.6)
        cx.add(b)
        bubbles.push(b)
      }
      cx.onDispose(() => { bubbleGeo.dispose(); bubbleMat.dispose() })
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
    sky: ['#04060f', '#0b1230', '#27406b'], skyOpts: { sun: false, clouds: false },
    bg: '#04060f', ground: 0xdfe8f2,
    fog: { color: 0x131c33, near: 14, far: 55 },
    lights: { hemi: [0x9fb8e8, 0x36415e, 0.75], sun: { pos: [-7, 9, 6], color: 0xaac8ff, int: 0.8 } },
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
      // the node: an obelisk with one blinking light and heavy chains
      const node = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.5, 0.95), flatMat(0x1b2030))
      node.position.set(-1.4, 1.25, -0.4)
      cx.add(node)
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x2bff6a })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), lampMat)
      lamp.position.set(-1.4, 2.1, 0.11) // just proud of the obelisk face
      cx.add(lamp)
      const glow = new THREE.PointLight(0x2bff6a, 8, 7)
      glow.position.set(-1.4, 2.1, 0.4)
      cx.add(glow)
      const linkGeo = new THREE.TorusGeometry(0.17, 0.05, 6, 10)
      const linkMat = flatMat(0x555f70)
      for (let i = 0; i < 6; i++) {
        const link = new THREE.Mesh(linkGeo, linkMat)
        link.position.set(-1.4 + 0.34 + i * 0.3, 2.3 - i * 0.4, 0.15)
        link.rotation.y = i % 2 ? Math.PI / 2 : 0.1
        link.rotation.z = 0.5
        cx.add(link)
      }
      cx.onDispose(() => { linkGeo.dispose(); linkMat.dispose(); lampMat.dispose() })
      cx.onUpdate((dt, t) => {
        const on = Math.sin(t * 6) > 0
        lampMat.color.setHex(on ? 0x2bff6a : 0x0d3a1c)
        glow.intensity = on ? 8 : 1
      })
      snowfall(cx)
    },
  },

  // -- 4. TIRED APE — the office collapses, he does not --------------------
  {
    dur: 3.2, seed: 51, fighter: 'tired-ape',
    sky: ['#5a6470', '#8b95a0', '#c7ccd2'], skyOpts: { sun: false },
    bg: '#5a6470', ground: 0x707a86,
    lights: { hemi: [0xdde4ec, 0x59616c, 0.95], sun: { pos: [5, 10, 8], color: 0xf2f4f8, int: 0.9 } },
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
    sky: ['#8fd4ff', '#c8ecff', '#ffffff'],
    bg: '#8fd4ff', ground: 0xeaf6ff,
    lights: { hemi: [0xffffff, 0xaad4e8, 1.1], sun: { pos: [7, 12, 8], color: 0xfff8e0, int: 1.5 } },
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
      // the big red button he definitely pressed
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 10), flatMat(0x4a5568))
      pedestal.position.set(0.35, 0.45, 0.3)
      cx.add(pedestal)
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(0xff2b3d))
      button.position.set(0.35, 0.9, 0.3)
      cx.add(button)
      const rocket = makeRocket()
      rocket.position.set(-1.5, 0, -0.5)
      cx.add(rocket)
      const smoke = puffSpawner(cx, { colors: [0xdfe4ea, 0xb8c0cc, 0xffa447] })
      const flame = rocket.userData.flame
      let puffTimer = 0
      cx.onUpdate((dt, t) => {
        if (t < 0.8) return
        flame.visible = true
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
    sky: ['#2b1743', '#a83a4e', '#ff9d47'], skyOpts: { clouds: false },
    bg: '#2b1743', ground: 0xa9773f,
    lights: { hemi: [0xffd2a8, 0x6b4a2a, 0.95], sun: { pos: [-9, 7, 7], color: 0xffb060, int: 1.4 } },
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
      // rails + scrolling ties sell the speed
      const railMat = flatMat(0x3a3f4a)
      for (const z of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(26, 0.07, 0.12), railMat)
        rail.position.set(0, 0.05, z)
        cx.add(rail)
      }
      const tieGeo = new THREE.BoxGeometry(0.42, 0.07, 1.5)
      const tieMat = flatMat(0x5a4326)
      const ties = []
      for (let i = 0; i < 12; i++) {
        const tie = new THREE.Mesh(tieGeo, tieMat)
        tie.position.set(-7 + i * 1.25, 0.03, 0)
        cx.add(tie)
        ties.push(tie)
      }
      cx.onDispose(() => { tieGeo.dispose(); tieMat.dispose() })
      const train = makeTrain()
      train.position.set(-5.6, 0, 0)
      cx.add(train)
      const chuff = puffSpawner(cx, { colors: [0xcfd4dc, 0x9aa2ae] })
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
    sky: ['#1d2233', '#2c3352', '#4a5578'], skyOpts: { sun: false, clouds: false },
    bg: '#1d2233', ground: 0xcfd6e4,
    lights: { hemi: [0xdfe6ff, 0x5a6480, 1.0], sun: { pos: [6, 10, 9], color: 0xeef2ff, int: 1.0 } },
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
      // gallery wall perpendicular to X — the punk phases through it
      const wallMat = flatMat(0xb8bfd0)
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.4, 3.6), wallMat)
      wall.position.set(-0.6, 1.7, -0.6)
      cx.add(wall)
      const halves = []
      for (const s of [1, -1]) {
        const half = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.4, 1.8), wallMat)
        half.position.set(-0.6, 1.7, -0.6 + s * 0.9)
        half.visible = false
        cx.add(half)
        halves.push({ mesh: half, s })
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
    sky: ['#1a1030', '#7a1fa2', '#ff8d3a'], skyOpts: { clouds: false },
    bg: '#1a1030', ground: 0x3a2a4d,
    lights: { hemi: [0xffb890, 0x3a2050, 0.9], sun: { pos: [-8, 6, 8], color: 0xff9a50, int: 1.2 } },
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
      const boom = puffSpawner(cx, { colors: [0xffa447, 0xff5a2a, 0xffe07a] })
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
    sky: ['#050308', '#12060f', '#33101c'], skyOpts: { sun: false, clouds: false },
    bg: '#050308', ground: 0x201018,
    fog: { color: 0x0d0510, near: 8, far: 40 },
    lights: { hemi: [0x33244a, 0x0a0510, 0.22], sun: false },
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
      // candlestick columns — this arena charts blood
      const wickMat = new THREE.MeshBasicMaterial({ color: 0x3a4a3a })
      const geoCache = []
      for (let i = 0; i < 6; i++) {
        const s = i % 2 ? 1 : -1
        const up = cx.rng() > 0.45
        const h = 3 + cx.rng() * 2.2
        const bodyGeo = new THREE.BoxGeometry(0.85, h, 0.85)
        const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: up ? 0x0d5a2a : 0x7a1420 }))
        body.position.set(s * (2.4 + i * 0.7), h / 2, -1.5 - i * 0.9)
        cx.add(body)
        const wickGeo = new THREE.BoxGeometry(0.14, h * 1.5, 0.14)
        const wick = new THREE.Mesh(wickGeo, wickMat)
        wick.position.copy(body.position)
        wick.position.y = h * 0.75
        cx.add(wick)
        geoCache.push(bodyGeo, wickGeo, body.material)
      }
      cx.onDispose(() => { for (const r of geoCache) r.dispose(); wickMat.dispose() })
      // red rim light from behind — silhouette with burning edges
      const rim = new THREE.PointLight(0xff1a2e, 90, 22)
      rim.position.set(0, 2.6, -5.5)
      cx.add(rim)
      const under = new THREE.PointLight(0x801020, 12, 8)
      under.position.set(0, 0.3, -1)
      cx.add(under)
      const bull = cx.actor('blackish-bull', { x: 0, z: -4.4, rotY: -Math.PI / 2, clip: ['walk', 'idle'], speed: 0.65 })
      cx.onUpdate((dt, t) => {
        bull.group.position.z = -4.4 + smooth(t / 3.2) * 3.0
        rim.intensity = 80 + Math.sin(t * 7) * 18
      })
    },
  },

  // -- 10. WALLY — hero shot, walking to the gates -------------------------
  {
    dur: 3.8, seed: 111, fighter: 'wally',
    sky: ['#2b1a4d', '#c9541f', '#ffd94a'], skyOpts: { clouds: false },
    bg: '#2b1a4d', ground: 0x8a6a3a,
    lights: { hemi: [0xffe0a0, 0x6a4a28, 1.0], sun: { pos: [0, 8, -12], color: 0xffc050, int: 1.6 } },
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
      // tournament gates
      const stone = flatMat(0x6a5a7a)
      const pillarGeo = new THREE.BoxGeometry(1.1, 5.2, 1.1)
      for (const s of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, stone)
        pillar.position.set(s * 2.8, 2.6, -6)
        cx.add(pillar)
        const coin = makeCoinMesh(0.5, 0.14)
        coin.position.set(s * 2.8, 4.4, -5.35)
        cx.add(coin)
      }
      cx.onDispose(() => pillarGeo.dispose())
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.9, 1.2), stone)
      beam.position.set(0, 5.35, -6)
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

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 240)

    // letterbox + captions + skip hint
    this.root = el('div', 'wcs-intro')
    this.root.appendChild(el('div', 'wcs-intro-bar top'))
    this.root.appendChild(el('div', 'wcs-intro-bar bot'))
    this.caption = el('div', 'wcs-intro-cap')
    this.caption.style.display = 'none'
    this.root.appendChild(this.caption)
    this.root.appendChild(el('div', 'wcs-intro-skip', 'ANY BUTTON ▸ SKIP'))
    this.game.ui.appendChild(this.root)

    // skippable from frame 1
    this._onKey = () => this._skip()
    this._onPointer = () => this._skip()
    addEventListener('keydown', this._onKey)
    addEventListener('pointerdown', this._onPointer)
    this._onResize = () => {
      this.camera.aspect = innerWidth / innerHeight
      this.camera.updateProjectionMatrix()
    }
    addEventListener('resize', this._onResize)

    this._next() // build shot 0
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    removeEventListener('pointerdown', this._onPointer)
    removeEventListener('resize', this._onResize)
    this._clearShot()
    this.root?.remove()
    this.root = null
    this.caption = null
    this.scene = null
    this.camera = null
    this.done = true
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
    if (this._shotGroup && this.scene) {
      this.scene.remove(this._shotGroup)
      disposeObject(this._shotGroup)
    }
    this._shotGroup = null
    if (this.scene) this.scene.fog = null
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

    this.scene.background = new THREE.Color(shot.bg || '#000000')
    if (shot.fog) this.scene.fog = new THREE.Fog(shot.fog.color, shot.fog.near, shot.fog.far)

    const rng = makeRng(shot.seed || 1)
    group.add(buildSkyDome(shot.sky, { rng, ...(shot.skyOpts || {}) }))
    if (shot.ground != null) group.add(groundDisc(shot.ground))

    const L = shot.lights || {}
    const [hs, hg, hi] = L.hemi || [0xcfeeff, 0x86b978, 1.0]
    group.add(new THREE.HemisphereLight(hs, hg, hi))
    if (L.sun !== false) {
      const s = L.sun || {}
      const sun = new THREE.DirectionalLight(s.color ?? 0xfff2d0, s.int ?? 1.4)
      const p = s.pos || [8, 12, 9]
      sun.position.set(p[0], p[1], p[2])
      group.add(sun)
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

    // announcer calls the fighter's name as the shot cuts in (§22)
    this._announceFighter(shot)

    // snap the camera to the shot's opening framing immediately (hard cut)
    this._updateCamera(shot)
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
    group.add(model.group)

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

  _updateCamera(shot) {
    const cam = shot.cam || { from: [0, 1.6, 7], to: [0, 1.6, 6], look: [0, 1.4, 0] }
    const f = smooth(this.t / shot.dur)
    const from = cam.from, to = cam.to || cam.from
    const look = cam.look, lookTo = cam.lookTo || cam.look
    const jx = (Math.random() - 0.5) * this._shake * 0.3
    const jy = (Math.random() - 0.5) * this._shake * 0.3
    this.camera.position.set(
      lerp(from[0], to[0], f) + jx,
      lerp(from[1], to[1], f) + jy,
      lerp(from[2], to[2], f)
    )
    this.camera.lookAt(
      lerp(look[0], lookTo[0], f),
      lerp(look[1], lookTo[1], f),
      lerp(look[2], lookTo[2], f)
    )
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

    if (this.t >= shot.dur) this._next()
  }

  render(renderer) {
    if (this.scene && this.camera) renderer.render(this.scene, this.camera)
  }
}
