// ============================================================================
// LOST BLOCK MUSEUM — Crypto Punk'd's stage (story round 6). A dark, haunted
// gallery of everything the blockchain ever misplaced: floating wireframe
// "lost blocks" on marble pedestals, pixel-art portraits that glitch and
// scramble, broken columns popping in and out of existence, two humming pixel
// portals, and a floor that occasionally forgets its own texture and yeets
// whoever was standing on it three meters into the air.
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, buildCrowd,
} from './ArenaBase.js'

// glitch-panel hazard tuning
const PANEL_W = 2.6           // world width of one glitch panel
const PANEL_D = 2.8           // world depth of one glitch panel
// v2.0 free-roam: glitch panels decompile at scattered XZ spots across the
// whole gallery floor (was a row of x slots on the old fight lane)
const PANEL_SLOTS = [
  [-6.4, -2.8], [-3.2, 2.6], [0, 0], [3.2, -2.6], [6.4, 2.8],
  [-5.2, 3.6], [5.0, 3.4], [0.4, -3.8],
]
const WARN_TIME = 1.3         // seconds of RGB flicker before it fires
const COOL_TIME = 1.6         // missing-texture checker lingers this long
const IDLE_MIN = 6.2          // idle + warn ≈ every ~8s
const IDLE_VAR = 2.6
const RGB = [0xff2244, 0x22ff88, 0x2266ff]

// shadowy museum visitors — barely people, mostly silhouette
const SHADOW_PALETTE = ['#1a1030', '#241640', '#141428', '#2a1a50', '#181330', '#301d5e', '#0f0a20', '#221a44']

// ---------------------------------------------------------------------------
// module-private mesh factories
// ---------------------------------------------------------------------------

// Purple-black marble with cyan grid seams. One glitched magenta tile per
// canvas, because somewhere in this floor a texture never loaded.
function makeMarbleFloorTexture(rng) {
  const TILES = 8, TP = 64
  return canvasTexture(TILES * TP, TILES * TP, (c, W, H) => {
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        const j = (rng() - 0.5) * 10
        c.fillStyle = `rgb(${Math.round(24 + j)},${Math.round(16 + j * 0.6)},${Math.round(42 + j)})`
        c.fillRect(tx * TP, ty * TP, TP, TP)
        // marble veins — pale ghosts of former wealth
        c.strokeStyle = 'rgba(150,130,200,0.13)'
        c.lineWidth = 2
        for (let v = 0; v < 3; v++) {
          c.beginPath()
          let vx = tx * TP + rng() * TP
          let vy = ty * TP
          c.moveTo(vx, vy)
          for (let s = 0; s < 4; s++) {
            vx += (rng() - 0.5) * 26
            vy += TP / 4
            c.lineTo(vx, vy)
          }
          c.stroke()
        }
        // the one tile that never textured in
        if (tx === 5 && ty === 2) {
          for (let cy = 0; cy < 4; cy++) {
            for (let cx = 0; cx < 4; cx++) {
              c.fillStyle = (cx + cy) % 2 === 0 ? 'rgba(214,0,214,0.28)' : 'rgba(6,2,10,0.5)'
              c.fillRect(tx * TP + cx * (TP / 4), ty * TP + cy * (TP / 4), TP / 4, TP / 4)
            }
          }
        }
        // faint 404 etched into another
        if (tx === 1 && ty === 6) {
          c.font = `900 ${TP * 0.42}px "Arial Black", Arial, sans-serif`
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.fillStyle = 'rgba(70,220,255,0.14)'
          c.fillText('404', tx * TP + TP / 2, ty * TP + TP / 2)
        }
      }
    }
    // cyan grid seams — the blockchain, but flooring
    c.strokeStyle = 'rgba(45,220,255,0.34)'
    c.lineWidth = 3
    for (let i = 0; i <= TILES; i++) {
      c.beginPath(); c.moveTo(i * TP, 0); c.lineTo(i * TP, H); c.stroke()
      c.beginPath(); c.moveTo(0, i * TP); c.lineTo(W, i * TP); c.stroke()
    }
  }, { repeat: [2.75, 1.625] })
}

// Museum wall: near-black purple, cyan seam grid, wainscot band, hex ghosts.
function makeWallTexture(rng) {
  return canvasTexture(256, 128, (c, W, H) => {
    c.fillStyle = '#150c28'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(45,220,255,0.14)'
    c.lineWidth = 2
    for (let x = 0; x <= W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke() }
    for (let y = 0; y <= H; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke() }
    // hex ghosts of transactions nobody can replay
    c.font = '700 9px monospace'
    c.fillStyle = 'rgba(120,90,200,0.16)'
    for (let i = 0; i < 14; i++) {
      let s = '0x'
      for (let k = 0; k < 6; k++) s += '0123456789abcdef'[Math.floor(rng() * 16)]
      c.fillText(s, rng() * (W - 50), 12 + rng() * (H - 40))
    }
    // wainscot band along the bottom
    c.fillStyle = '#0c0618'
    c.fillRect(0, H - 26, W, 26)
    c.fillStyle = 'rgba(166,77,255,0.5)'
    c.fillRect(0, H - 28, W, 3)
  }, { repeat: [6, 2] })
}

// The universal "missing texture" checker. Magenta and void.
function makeMissingTexture() {
  const N = 8
  return canvasTexture(64, 64, (c, W, H) => {
    const s = W / N
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        c.fillStyle = (x + y) % 2 === 0 ? '#ff00ff' : '#0a0410'
        c.fillRect(x * s, y * s, s, s)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Glitching pixel-art portrait. 32x32 punk-ish face painted once into a clean
// buffer; the display canvas scrambles every few seconds (row tears, RGB
// blocks, ghost offsets, occasionally a full blue "FACE NOT FOUND" screen).
// opts.inverted: the clean state IS the 404 screen and it glitches into a
// face — this museum has range.
// Returns { group, update(dt), scramble(strong) }.
// ---------------------------------------------------------------------------
function makePortrait(rng, opts = {}) {
  const S = 32
  const clean = document.createElement('canvas')
  clean.width = S; clean.height = S
  const cc = clean.getContext('2d')
  const px = (x, y, w, h, col) => { cc.fillStyle = col; cc.fillRect(x, y, w, h) }

  const drawBlueScreen = (ctx) => {
    ctx.fillStyle = '#1040c8'
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1
    ctx.strokeRect(2.5, 2.5, S - 5, S - 5)
    ctx.font = '900 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('404', S / 2, 14)
    ctx.font = '700 5px monospace'
    ctx.fillText('FACE NOT', S / 2, 22)
    ctx.fillText('FOUND', S / 2, 28)
  }

  const drawFace = () => {
    const bgs = ['#3a1f5e', '#123a4a', '#402045', '#1c2050', '#33224a']
    const skins = ['#c8996a', '#8fb56a', '#5ec8c0', '#b06ab5', '#d8c26a', '#7a8598']
    px(0, 0, S, S, bgs[Math.floor(rng() * bgs.length)])
    const skin = skins[Math.floor(rng() * skins.length)]
    px(10, 8, 12, 18, skin)                                   // head
    px(9, 12, 1, 8, skin); px(22, 12, 1, 8, skin)             // jaw sides
    px(13, 26, 6, 2, skin)                                    // neck
    // hair / cap
    const hairCol = ['#20d8ff', '#ff4de0', '#e8b13c', '#7a4fd0', '#222233'][Math.floor(rng() * 5)]
    if (rng() < 0.5) { px(9, 5, 14, 4, hairCol); px(9, 9, 3, 3, hairCol) } // mop
    else { px(9, 6, 14, 3, hairCol); px(20, 7, 8, 2, hairCol) }            // cap + brim
    // eyes or deal-with-it shades
    if (rng() < 0.45) {
      px(11, 14, 10, 3, '#101018')
      px(12, 15, 2, 1, '#20d8ff'); px(18, 15, 2, 1, '#20d8ff')
    } else {
      px(12, 14, 2, 2, '#101018'); px(18, 14, 2, 2, '#101018')
      px(12, 14, 1, 1, '#ffffff'); px(18, 14, 1, 1, '#ffffff')
    }
    px(15, 17, 2, 3, 'rgba(0,0,0,0.25)')                      // nose
    if (rng() < 0.5) px(13, 22, 6, 1, '#401818')              // flatline mouth
    else { px(13, 22, 5, 1, '#401818'); px(17, 21, 2, 1, '#401818') } // smirk
    if (rng() < 0.4) px(8, 18, 1, 2, '#ffd83d')               // earring
    if (rng() < 0.3) { px(19, 22, 6, 1, '#8a6a4a'); px(25, 21, 2, 2, '#ff8830') } // pipe
  }

  if (opts.inverted) drawBlueScreen(cc)
  else drawFace()

  const disp = document.createElement('canvas')
  disp.width = S; disp.height = S
  const dc = disp.getContext('2d')
  dc.drawImage(clean, 0, 0)
  const tex = new THREE.CanvasTexture(disp)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter

  // frame + art
  const group = new THREE.Group()
  group.name = 'portrait'
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.5, 0.16), flatMat(0x4a3a20))
  const inner = new THREE.Mesh(new THREE.BoxGeometry(1.95, 2.3, 0.17), flatMat(0x120a20))
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 1.78), new THREE.MeshBasicMaterial({ map: tex }))
  art.position.set(0, 0.1, 0.095)
  group.add(frame, inner, art)
  if (opts.plaque) {
    const p = makeSign(opts.plaque, { w: 1.5, h: 0.3, depth: 0.05, px: 64, bg: '#0d0620', fg: '#35f0ff', border: '#a64dff' })
    p.position.set(0, -1.55, 0.02)
    group.add(p)
  }

  const glitchFrame = () => {
    if (rng() < 0.1) {
      // total identity failure
      if (opts.inverted) { dc.clearRect(0, 0, S, S); drawFace() }
      else drawBlueScreen(dc)
      tex.needsUpdate = true
      return
    }
    dc.drawImage(clean, 0, 0)
    // horizontal row tears
    const tears = 3 + Math.floor(rng() * 4)
    for (let i = 0; i < tears; i++) {
      const y = Math.floor(rng() * S)
      const h = 1 + Math.floor(rng() * 3)
      const shift = Math.floor((rng() - 0.5) * 12)
      dc.drawImage(clean, 0, y, S, h, shift, y, S, h)
    }
    // hot RGB blocks
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
      dc.fillStyle = ['rgba(255,0,80,0.55)', 'rgba(0,255,200,0.55)', 'rgba(80,80,255,0.55)'][Math.floor(rng() * 3)]
      dc.fillRect(Math.floor(rng() * S), Math.floor(rng() * S), 2 + Math.floor(rng() * 8), 1 + Math.floor(rng() * 4))
    }
    // ghost offset
    dc.globalAlpha = 0.3
    dc.drawImage(clean, rng() < 0.5 ? 2 : -2, 0)
    dc.globalAlpha = 1
    tex.needsUpdate = true
  }

  let nextGlitch = 1.5 + rng() * 5
  let glitching = 0
  let frameAcc = 0

  return {
    group,
    scramble(strong = false) {
      glitching = Math.max(glitching, strong ? 0.7 : 0.3)
      frameAcc = 1 // glitch immediately
    },
    update(dt) {
      if (glitching > 0) {
        glitching -= dt
        frameAcc += dt
        if (frameAcc >= 0.07) { frameAcc = 0; glitchFrame() }
        if (glitching <= 0) {
          dc.clearRect(0, 0, S, S)
          dc.drawImage(clean, 0, 0)
          tex.needsUpdate = true
          nextGlitch = 2 + rng() * 6
        }
        return
      }
      nextGlitch -= dt
      if (nextGlitch <= 0) { glitching = 0.22 + rng() * 0.35; frameAcc = 1 }
    },
  }
}

// ---------------------------------------------------------------------------
// Pedestal displaying a LOST BLOCK: marble plinth, plaque, and a floating
// wireframe cube that flickers like it isn't sure it was ever mined.
// Returns { group, update(dt), burst() }.
// ---------------------------------------------------------------------------
function makeLostBlockPedestal(rng, label, opts = {}) {
  const g = new THREE.Group()
  g.name = 'lostBlockPedestal'
  const marble = flatMat(0x352a52)
  const trim = flatMat(0x201640)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.95), trim)
  base.position.y = 0.08
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.86, 0.7), marble)
  shaft.position.y = 0.59
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.1, 0.88), trim)
  top.position.y = 1.07
  g.add(base, shaft, top)

  const glow = opts.color ?? 0x35f0ff
  const wireMat = new THREE.MeshBasicMaterial({ color: glow, wireframe: true, transparent: true, opacity: 0.95 })
  const coreMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.12, depthWrite: false })
  const cube = new THREE.Group()
  const wire = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), wireMat)
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), coreMat)
  cube.add(wire, core)
  const baseY = 1.65
  cube.position.y = baseY
  g.add(cube)

  if (label) {
    const plaque = makeSign(label, { w: 1.0, h: 0.26, depth: 0.05, px: 64, bg: '#0d0620', fg: '#c9bfff', border: '#35f0ff' })
    plaque.position.set(0, 0.62, 0.38)
    plaque.rotation.x = -0.18
    g.add(plaque)
  }

  let t = rng() * 10
  let burst = 0
  let nextBurst = 1.5 + rng() * 4.5
  const phase = rng() * Math.PI * 2

  return {
    group: g,
    burst() { burst = Math.max(burst, 0.25 + rng() * 0.3) },
    update(dt) {
      t += dt
      cube.position.y = baseY + Math.sin(t * 1.3 + phase) * 0.12
      cube.rotation.y += dt * 0.6
      cube.rotation.x += dt * 0.23
      if (burst > 0) {
        burst -= dt
        const on = Math.floor(t * 30) % 2 === 0
        cube.visible = on
        if (burst <= 0) { cube.visible = true; nextBurst = 1.5 + rng() * 4.5 }
      } else {
        nextBurst -= dt
        if (nextBurst <= 0) burst = 0.18 + rng() * 0.3
        wireMat.opacity = 0.75 + Math.sin(t * 5 + phase) * 0.2
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Neon rope barrier: dark posts, glowing orbs, sagging light-tube spans.
// Returns { group, update(dt) } — the whole fence breathes.
// ---------------------------------------------------------------------------
function makeNeonRopeFence(length, color, rng) {
  const g = new THREE.Group()
  g.name = 'neonRopeFence'
  const postMat = flatMat(0x1b1430)
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  const nSpans = Math.max(1, Math.round(length / 2.6))
  const span = length / nSpans
  for (let i = 0; i <= nSpans; i++) {
    const x = -length / 2 + i * span
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.95, 6), postMat)
    post.position.set(x, 0.475, 0)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), glowMat)
    orb.position.set(x, 0.99, 0)
    g.add(post, orb)
  }
  for (let i = 0; i < nSpans; i++) {
    const x0 = -length / 2 + i * span
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x0, 0.9, 0),
      new THREE.Vector3(x0 + span / 2, 0.68, 0),
      new THREE.Vector3(x0 + span, 0.9, 0)
    )
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 7, 0.045, 6), glowMat))
  }
  const phase = rng() * Math.PI * 2
  let t = 0
  return {
    group: g,
    update(dt) {
      t += dt
      glowMat.opacity = 0.65 + Math.sin(t * 2.4 + phase) * 0.22
    },
  }
}

// Single breakable velvet-rope post — pole, glow orb, coiled neon rope.
function makeVelvetPost(color) {
  const g = new THREE.Group()
  g.name = 'velvetPost'
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 8), flatMat(0x1b1430))
  base.position.y = 0.05
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), flatMat(0x2a2044))
  pole.position.y = 0.55
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color }))
  orb.position.y = 1.07
  const coil = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.045, 6, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  )
  coil.rotation.x = Math.PI / 2
  coil.position.y = 0.9
  g.add(base, pole, orb, coil)
  return g
}

// ---------------------------------------------------------------------------
// Gift-shop kiosk. Exit through it. Everyone does, eventually, at speed.
// ---------------------------------------------------------------------------
function makeGiftKiosk(rng) {
  const g = new THREE.Group()
  g.name = 'giftKiosk'
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 0.95), flatMat(0x2a1a50))
  counter.position.y = 0.475
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 1.06), flatMat(0x35f0ff))
  top.position.y = 0.99
  g.add(counter, top)
  // back board with a merch grid of NFT postcards nobody can own
  const merchTex = canvasTexture(96, 64, (c, W, H) => {
    c.fillStyle = '#160c2c'
    c.fillRect(0, 0, W, H)
    const cols = ['#ff4de0', '#35f0ff', '#ffd83d', '#a64dff', '#37e05f', '#ff4d5e']
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = cols[(r * 4 + i) % cols.length]
        c.fillRect(6 + i * 23, 6 + r * 30, 17, 20)
        c.fillStyle = 'rgba(0,0,0,0.55)'
        c.fillRect(6 + i * 23, 20 + r * 30, 17, 6)
        c.fillStyle = '#ffffff'
        c.font = '700 5px monospace'
        c.textAlign = 'center'
        c.fillText('SOLD', 14 + i * 23, 25 + r * 30)
      }
    }
  })
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.1, 0.12),
    new THREE.MeshLambertMaterial({ map: merchTex, flatShading: true })
  )
  board.position.set(0, 1.6, -0.4)
  g.add(board)
  const sign = makeSign('GIFT SHOPPE', { w: 1.6, h: 0.42, depth: 0.07, px: 72, bg: '#0d0620', fg: '#ff4de0', border: '#35f0ff', sub: 'RIGHT-CLICK FREE ZONE' })
  sign.position.set(0, 2.4, -0.34)
  g.add(sign)
  // mugs of coping
  for (let i = 0; i < 3; i++) {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 7), flatMat([0xff4de0, 0x35f0ff, 0xffd83d][i]))
    mug.position.set(-0.5 + i * 0.5 + (rng() - 0.5) * 0.1, 1.09, (rng() - 0.5) * 0.4)
    g.add(mug)
  }
  return g
}

// ---------------------------------------------------------------------------
// Pixel portal: standing ring, additive spiral disc, orbiting dashes, and a
// point light. Returns { group, update(dt) }.
// ---------------------------------------------------------------------------
function makeSpiralTexture(colA, colB) {
  return canvasTexture(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    const cx = W / 2, cy = H / 2
    for (let arm = 0; arm < 3; arm++) {
      c.fillStyle = arm % 2 === 0 ? colA : colB
      for (let s = 0; s < 46; s++) {
        const k = s / 46
        const a = arm * (Math.PI * 2 / 3) + k * Math.PI * 3.2
        const r = 4 + k * 56
        const dot = 2 + (1 - k) * 4
        c.globalAlpha = 0.85 * (1 - k * 0.6)
        c.fillRect(cx + Math.cos(a) * r - dot / 2, cy + Math.sin(a) * r - dot / 2, dot, dot)
      }
    }
    c.globalAlpha = 1
  })
}

function makePortal(rng, opts = {}) {
  const glow = opts.glow ?? 0xa64dff
  const g = new THREE.Group()
  g.name = 'portal'
  // stepped base
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 10), flatMat(0x201640))
  s1.position.y = 0.15
  const s2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.25, 10), flatMat(0x2a2044))
  s2.position.y = 0.42
  g.add(s1, s2)
  // standing ring
  const ringMat = new THREE.MeshLambertMaterial({ color: opts.ring ?? 0x352a52, flatShading: true, emissive: glow, emissiveIntensity: 0.55 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.24, 8, 18), ringMat)
  ring.position.y = 2.35
  g.add(ring)
  // swirling disc
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.62, 24),
    new THREE.MeshBasicMaterial({
      map: makeSpiralTexture(opts.colA ?? '#a64dff', opts.colB ?? '#35f0ff'),
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  )
  disc.position.set(0, 2.35, 0.04)
  g.add(disc)
  // orbiting pixel dashes
  const spinner = new THREE.Group()
  spinner.position.y = 2.35
  const dashMat = new THREE.MeshBasicMaterial({ color: glow })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), dashMat)
    dash.position.set(Math.cos(a) * 2.25, Math.sin(a) * 2.25, 0)
    dash.rotation.z = a
    spinner.add(dash)
  }
  g.add(spinner)
  const light = new THREE.PointLight(glow, 1.3, 12, 1.8)
  light.position.set(0, 2.4, 0.8)
  g.add(light)

  const dir = opts.spin ?? 1
  const phase = rng() * Math.PI * 2
  let t = rng() * 10
  return {
    group: g,
    update(dt) {
      t += dt
      disc.rotation.z += dt * dir * 1.4
      spinner.rotation.z -= dt * dir * 0.7
      light.intensity = 1.1 + Math.sin(t * 3 + phase) * 0.3
      const s = 1 + Math.sin(t * 2.2 + phase) * 0.03
      disc.scale.set(s, s, 1)
    },
  }
}

// ---------------------------------------------------------------------------
// Broken column + floating chunks that pop in and out of existence. When a
// chunk re-materializes it does so somewhere slightly different, because
// object permanence is a premium feature.
// Returns { group, update(dt) }.
// ---------------------------------------------------------------------------
function makeColumn(rng, height, broken) {
  const g = new THREE.Group()
  g.name = 'column'
  const stone = flatMat(0x50467a)
  const trim = flatMat(0x3a2f60)
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), trim)
  base.position.y = 0.2
  g.add(base)
  const h = broken ? height * (0.35 + rng() * 0.25) : height
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, h, 9), stone)
  shaft.position.y = 0.4 + h / 2
  g.add(shaft)
  if (broken) {
    // jagged rubble crown
    for (let i = 0; i < 4; i++) {
      const rock = new THREE.Mesh(new THREE.BoxGeometry(0.28 + rng() * 0.2, 0.2 + rng() * 0.25, 0.28 + rng() * 0.2), stone)
      const a = rng() * Math.PI * 2
      rock.position.set(Math.cos(a) * 0.25, 0.4 + h + 0.08, Math.sin(a) * 0.25)
      rock.rotation.set(rng() * 0.8, rng() * Math.PI, rng() * 0.8)
      g.add(rock)
    }
  } else {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 1.35), trim)
    cap.position.y = 0.4 + h + 0.175
    g.add(cap)
  }
  return g
}

function makeFloatingChunks(rng, center, n) {
  const g = new THREE.Group()
  g.name = 'floatingChunks'
  const stone = flatMat(0x5a5088)
  const chunks = []
  for (let i = 0; i < n; i++) {
    const geo = rng() < 0.5
      ? new THREE.CylinderGeometry(0.32 + rng() * 0.2, 0.36 + rng() * 0.2, 0.4 + rng() * 0.5, 8)
      : new THREE.BoxGeometry(0.5 + rng() * 0.5, 0.4 + rng() * 0.4, 0.5 + rng() * 0.5)
    const m = new THREE.Mesh(geo, stone)
    const home = () => new THREE.Vector3(
      center.x + (rng() - 0.5) * 3.2,
      center.y + (rng() - 0.5) * 2.6,
      center.z + (rng() - 0.5) * 1.8
    )
    const p = home()
    m.position.copy(p)
    m.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
    g.add(m)
    chunks.push({
      mesh: m, home, base: p,
      state: 'on', timer: 2 + rng() * 5, flick: 0,
      spin: (rng() - 0.5) * 0.8, phase: rng() * Math.PI * 2,
    })
  }
  let t = rng() * 10
  return {
    group: g,
    update(dt) {
      t += dt
      for (const ch of chunks) {
        ch.mesh.rotation.y += dt * ch.spin
        ch.mesh.position.y = ch.base.y + Math.sin(t * 0.9 + ch.phase) * 0.16
        if (ch.flick > 0) {
          ch.flick -= dt
          ch.mesh.visible = Math.floor(t * 26) % 2 === 0
          if (ch.flick <= 0) {
            if (ch.state === 'on') { ch.state = 'off'; ch.mesh.visible = false; ch.timer = 0.8 + Math.abs(Math.sin(ch.phase)) * 1.6 }
            else {
              ch.state = 'on'
              ch.base = ch.home() // reappears... elsewhere
              ch.mesh.position.copy(ch.base)
              ch.mesh.visible = true
              ch.timer = 3 + Math.abs(Math.cos(ch.phase * 3)) * 4
            }
          }
        } else {
          ch.timer -= dt
          if (ch.timer <= 0) ch.flick = 0.22
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Scanline veil — big translucent additive planes of horizontal cyan lines,
// slowly scrolling. The "scanline fog" of a museum rendered on a dying CRT.
// Returns { meshes, update(dt), surge() }.
// ---------------------------------------------------------------------------
function makeScanlineVeil() {
  const tex = canvasTexture(4, 64, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    for (let y = 0; y < H; y += 4) {
      c.fillStyle = 'rgba(53,240,255,0.8)'
      c.fillRect(0, y, W, 1)
    }
  }, { repeat: [1, 6] })
  tex.wrapT = THREE.RepeatWrapping
  const meshes = []
  const mats = []
  const defs = [
    { y: 4.5, z: -11.6, w: 36, h: 9.5, op: 0.05, speed: 0.02 },
    { y: 4.0, z: -10.7, w: 34, h: 8.5, op: 0.035, speed: -0.033 },
  ]
  for (const d of defs) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: d.op, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat)
    m.position.set(0, d.y, d.z)
    m.renderOrder = 4
    meshes.push(m)
    mats.push({ mat, base: d.op, speed: d.speed })
  }
  let surge = 0
  return {
    meshes,
    surge(k = 1) { surge = Math.min(2.5, surge + k) },
    update(dt) {
      surge = Math.max(0, surge - dt * 1.6)
      for (const e of mats) {
        e.mat.map.offset.y = (e.mat.map.offset.y + dt * e.speed) % 1
        e.mat.opacity = e.base * (1 + surge * 2.2)
      }
    },
  }
}

// Drifting data motes — dead transactions looking for a block to live in.
function makeDataMotes(count, rng) {
  const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07)
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  const cols = [0x35f0ff, 0xff4de0, 0xa64dff, 0xd8d8ff]
  const color = new THREE.Color()
  const motes = []
  for (let i = 0; i < count; i++) {
    motes.push({
      x: (rng() - 0.5) * 32, y: 0.4 + rng() * 8.6, z: -13 + rng() * 14,
      vy: 0.15 + rng() * 0.3, phase: rng() * Math.PI * 2, speed: 1 + rng() * 3,
    })
    color.set(cols[Math.floor(rng() * cols.length)])
    mesh.setColorAt(i, color)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  const _m = new THREE.Matrix4()
  const _p = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _s = new THREE.Vector3()
  let t = 0
  return {
    mesh,
    update(dt) {
      t += dt
      for (let i = 0; i < count; i++) {
        const mo = motes[i]
        mo.y += mo.vy * dt
        if (mo.y > 9.4) { mo.y = 0.3; mo.x = (rng() - 0.5) * 32; mo.z = -13 + rng() * 14 }
        const tw = 0.6 + Math.abs(Math.sin(t * mo.speed + mo.phase)) * 0.9
        _p.set(mo.x + Math.sin(t * 0.7 + mo.phase) * 0.3, mo.y, mo.z)
        _s.setScalar(tw)
        _m.compose(_p, _q, _s)
        mesh.setMatrixAt(i, _m)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

// "404" head sign for the crowd — parented to a crowd group in local coords.
function make404Sign() {
  const tex = canvasTexture(64, 40, (c, W, H) => {
    c.fillStyle = '#0a0410'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ff2244'
    c.lineWidth = 3
    c.strokeRect(2, 2, W - 4, H - 4)
    c.font = '900 22px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#ff2244'
    c.fillText('404', W / 2, H / 2 + 1)
  })
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.34),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  )
  mesh.visible = false
  return mesh
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

const PLAQUES = [
  'BLOCK #000000', '4096 COINS · SEED: password1', 'GENESIS (REPLICA)',
  'BLOCK 404 — NOT FOUND', 'THE FORGOTTEN WALLET', 'HDD, LANDFILL, WALES',
]
const PORTRAIT_PLAQUES = [
  'PUNK #0000 · MINT UNKNOWN', 'THE HODLER · OIL ON CHAIN', 'GONE.JPG',
  'THE FOUNDER??? · ARTIST UNKNOWN', 'RIGHT-CLICK SAVE, 2021',
]

class LostBlockMuseumArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.6 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]
    // near-black venue: ask MatchScreen for a per-fighter fill/rim rig so dark
    // fighters (Blackish Bull, Crypto Punk'd, Bonko) keep their silhouettes
    this.fighterFill = { color: 0xb9a6ff, intensity: 3.2, rimColor: 0x1fd8e8, rimIntensity: 2.8 }

    this._rng = makeRng(0x0404b1)
    this._time = 0
    this._portraits = []
    this._blocks = []        // lost-block pedestal handles (decor + breakable)
    this._crowds = []
    this._crowdGags = []     // 404-head state per crowd
    this._fighterRefs = []   // { root, fighter|null } — see _glitchFire
    this._scanCooldown = 0

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildFloor()
    this._buildGallery()
    this._buildCrowds()
    this._buildProps()
    this._buildGlitchZone()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction --------------------------------------------------------

  _buildPhysics() {
    // floor slab + invisible bouncy walls on all four sides (§9/§17)
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    // a sky with no sun, no clouds, and frankly no future
    const sky = buildSkyDome(['#03010a', '#140630', '#2a1052', '#0a0416'], { rng: this._rng, sun: false, clouds: false })
    this.group.add(sky)
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0x3a2a6a, hemiGround: 0x0c0618, hemiIntensity: 0.6,
      sunColor: 0x9f8fff, sunIntensity: 0.95, sunPos: [8, 15, 9],
      fillColor: 0x1fd8e8, fillIntensity: 0.32, fillPos: [-9, 6, 12],
      fog: { color: 0x140a26, near: 24, far: 62 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildFloor() {
    const tex = makeMarbleFloorTexture(this._rng)
    const sideMat = flatMat(0x100a20)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 26), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -3)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)
    // the void beyond the museum. do not deposit funds into the void
    const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), flatMat(0x060312))
    voidPlane.rotation.x = -Math.PI / 2
    voidPlane.position.y = -0.32
    this.group.add(voidPlane)
  }

  _buildGallery() {
    const rng = this._rng
    const wallTex = makeWallTexture(rng)
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, flatShading: true })

    // back + side walls
    const back = new THREE.Mesh(new THREE.BoxGeometry(40, 11, 0.6), wallMat)
    back.position.set(0, 5.5, -13.9)
    this.group.add(back)
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 11, 24), wallMat)
      wall.position.set(side * 17.5, 5.5, -4.5)
      this.group.add(wall)
    }

    // marquee
    const marquee = makeSign('LOST BLOCK MUSEUM', {
      w: 8.4, h: 1.9, depth: 0.3, px: 80,
      bg: '#0d0620', fg: '#35f0ff', border: '#a64dff', stroke: '#050210',
      sub: 'HOME OF THE UNRECOVERABLE', subColor: '#c9bfff',
    })
    marquee.position.set(0, 8.7, -13.4)
    marquee.rotation.x = -0.05
    this.group.add(marquee)

    // side-wall house rules
    const rules = makeSign('PLS DO NOT RIGHT-CLICK THE ART', { w: 5.4, h: 0.85, depth: 0.14, px: 72, bg: '#0d0620', fg: '#ff4de0', border: '#ff4de0' })
    rules.position.set(-17.1, 4.6, -4)
    rules.rotation.y = Math.PI / 2
    this.group.add(rules)
    const rules2 = makeSign('DO NOT TOUCH (YOU CANNOT)', { w: 5.0, h: 0.85, depth: 0.14, px: 72, bg: '#0d0620', fg: '#35f0ff', border: '#35f0ff' })
    rules2.position.set(17.1, 4.6, -4)
    rules2.rotation.y = -Math.PI / 2
    this.group.add(rules2)

    // colonnade along the back wall — two of them gave up structurally
    const colDefs = [
      { x: -15, broken: false }, { x: -10, broken: true }, { x: -5, broken: false },
      { x: 5, broken: false }, { x: 10, broken: true }, { x: 15, broken: false },
    ]
    for (const cd of colDefs) {
      const col = makeColumn(rng, 8.2, cd.broken)
      col.position.set(cd.x, 0, -12.6)
      this.group.add(col)
    }

    // floating rubble above the broken columns + deep-gallery drifts
    for (const center of [
      new THREE.Vector3(-10, 5.4, -11.8), new THREE.Vector3(10, 6.0, -11.8),
      new THREE.Vector3(-3.5, 6.6, -12.4), new THREE.Vector3(13.5, 3.4, -8.8),
    ]) {
      const chunks = makeFloatingChunks(rng, center, 3)
      this.group.add(chunks.group)
      this.addUpdater(chunks.update)
    }

    // glitching portraits along the back wall
    for (let i = 0; i < 5; i++) {
      const portrait = makePortrait(rng, { plaque: PORTRAIT_PLAQUES[i], inverted: i === 2 })
      portrait.group.position.set(-10 + i * 5, 5.3, -13.35)
      portrait.group.rotation.x = -0.03
      this.group.add(portrait.group)
      this._portraits.push(portrait)
      this.addUpdater(portrait.update)
    }

    // decor pedestal row (outside the fight floor) with LOST BLOCK exhibits
    const pedDefs = [
      { x: -13.2, z: -6.6, color: 0x35f0ff }, { x: -10.6, z: -7.8, color: 0xa64dff },
      { x: 10.6, z: -7.8, color: 0xff4de0 }, { x: 13.2, z: -6.6, color: 0x35f0ff },
      { x: -4.4, z: -8.8, color: 0xa64dff }, { x: 4.4, z: -8.8, color: 0x35f0ff },
    ]
    pedDefs.forEach((pd, i) => {
      const ped = makeLostBlockPedestal(rng, PLAQUES[i % PLAQUES.length], { color: pd.color })
      ped.group.position.set(pd.x, 0, pd.z)
      ped.group.rotation.y = (rng() - 0.5) * 0.6
      this.group.add(ped.group)
      this._blocks.push(ped)
      this.addUpdater(ped.update)
    })

    // the two pixel portals, humming in the back corners
    const portalL = makePortal(rng, { glow: 0xa64dff, colA: '#a64dff', colB: '#35f0ff', spin: 1 })
    portalL.group.position.set(-12.8, 0, -7.4)
    portalL.group.rotation.y = 0.55
    this.group.add(portalL.group)
    this.addUpdater(portalL.update)
    const portalR = makePortal(rng, { glow: 0x35f0ff, colA: '#35f0ff', colB: '#ff4de0', spin: -1 })
    portalR.group.position.set(12.8, 0, -7.4)
    portalR.group.rotation.y = -0.55
    this.group.add(portalR.group)
    this.addUpdater(portalR.update)

    // scanline veil + drifting data motes
    const veil = makeScanlineVeil()
    for (const m of veil.meshes) this.group.add(m)
    this.addUpdater(veil.update)
    this._veil = veil

    const nMotes = Math.max(10, Math.round(40 * (this.quality.particleScale ?? 1)))
    const motes = makeDataMotes(nMotes, rng)
    this.group.add(motes.mesh)
    this.addUpdater(motes.update)
  }

  _buildCrowds() {
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const nBack = Math.round(total * 0.42)
    const nSide = Math.max(4, Math.floor((total - nBack) / 2))
    const rng = this._rng

    const defs = [
      { count: nBack, area: { w: 24, d: 2.6 }, pos: [0, 0, -7.6], ry: 0 },
      { count: nSide, area: { w: 13, d: 2.2 }, pos: [-12.6, 0, -0.5], ry: Math.PI / 2 },
      { count: nSide, area: { w: 13, d: 2.2 }, pos: [12.6, 0, -0.5], ry: -Math.PI / 2 },
    ]
    for (const d of defs) {
      const crowd = buildCrowd({
        count: d.count, area: d.area, palette: SHADOW_PALETTE, rng,
        bounce: 0.14, riserColor: 0x120a22,
      })
      crowd.group.position.set(d.pos[0], d.pos[1], d.pos[2])
      crowd.group.rotation.y = d.ry
      this.group.add(crowd.group)
      this._crowds.push(crowd)
      this.addUpdater((dt) => crowd.update(dt))
      // one 404 sign per crowd — a visitor's head fails to load
      const sign = make404Sign()
      crowd.group.add(sign)
      this._crowdGags.push({
        sign, area: d.area,
        timer: 1.5 + rng() * 4, showT: 0,
      })
    }
    this._crowdBack = this._crowds[0]
    this._crowdLeft = this._crowds[1]
    this._crowdRight = this._crowds[2]

    this.addUpdater((dt) => this._updateCrowdGags(dt))

    // neon rope barriers between the shadows and the exhibits
    const fenceDefs = [
      { len: 26, pos: [0, 0, -5.9], ry: 0, color: 0x35f0ff },
      { len: 13, pos: [-10.7, 0, -0.5], ry: Math.PI / 2, color: 0xff4de0 },
      { len: 13, pos: [10.7, 0, -0.5], ry: -Math.PI / 2, color: 0xa64dff },
    ]
    for (const fd of fenceDefs) {
      const fence = makeNeonRopeFence(fd.len, fd.color, rng)
      fence.group.position.set(fd.pos[0], fd.pos[1], fd.pos[2])
      fence.group.rotation.y = fd.ry
      this.group.add(fence.group)
      this.addUpdater(fence.update)
    }
  }

  _updateCrowdGags(dt) {
    const rng = this._rng
    for (const gag of this._crowdGags) {
      if (gag.showT > 0) {
        gag.showT -= dt
        gag.sign.visible = Math.floor(this._time * 24) % 3 !== 0 // nervous flicker
        if (gag.showT <= 0) {
          gag.sign.visible = false
          gag.timer = 2.5 + rng() * 5
        }
      } else {
        gag.timer -= dt
        if (gag.timer <= 0) {
          const rows = Math.max(1, Math.round(gag.area.d / 0.85))
          const row = Math.floor(rng() * rows)
          gag.sign.position.set(
            (rng() - 0.5) * gag.area.w * 0.9,
            row * 0.42 + 1.02,           // right where a head should be
            -row * 0.85 + 0.02
          )
          gag.showT = 0.55 + rng() * 0.4
          gag.sign.visible = true
        }
      }
    }
  }

  _buildProps() {
    const rng = this._rng
    const shadows = !!this.quality.shadows
    const place = (mesh, x, z, ry, opts) => {
      mesh.position.set(x, mesh.position.y, z)
      mesh.rotation.y = ry
      if (shadows) mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(mesh)
      return this.addBreakable(mesh, opts)
    }

    // v2.0 free-roam: exhibits scatter across the open gallery floor (center
    // lane kept mostly clear; nothing parks on a glitch-panel slot for long).

    // 2 breakable exhibit pedestals — priceless, briefly
    const pedL = makeLostBlockPedestal(rng, 'PRICELESS', { color: 0x35f0ff })
    const hL = place(pedL.group, -6.6, -4.2, 0.3, { shape: 'box', mass: 6, health: 22 })
    this._blocks.push(pedL)
    this.addUpdater((dt) => { if (hL?.alive !== false) pedL.update(dt) })

    const pedR = makeLostBlockPedestal(rng, 'NO REFUNDS', { color: 0xff4de0 })
    const hR = place(pedR.group, 6.7, 4.3, -0.35, { shape: 'box', mass: 6, health: 22 })
    this._blocks.push(pedR)
    this.addUpdater((dt) => { if (hR?.alive !== false) pedR.update(dt) })

    // 3 breakable velvet-rope posts guarding nothing in particular
    place(makeVelvetPost(0xff4de0), -3.9, 4.1, 0, { shape: 'box', mass: 2.5, health: 9 })
    place(makeVelvetPost(0x35f0ff), -2.4, -4.3, 0, { shape: 'box', mass: 2.5, health: 9 })
    place(makeVelvetPost(0xa64dff), 3.1, 4.4, 0, { shape: 'box', mass: 2.5, health: 9 })

    // the gift-shop kiosk. exit through it, or get exited through it
    place(makeGiftKiosk(rng), 8.0, -3.8, -0.5, { shape: 'box', mass: 9, health: 30 })
  }

  // -- GLITCH ZONE hazard ---------------------------------------------------

  _buildGlitchZone() {
    // warn panel — flat additive quad that RGB-flickers
    this._warnMat = new THREE.MeshBasicMaterial({
      color: RGB[0], transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this._warnMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_D), this._warnMat)
    this._warnMesh.rotation.x = -Math.PI / 2
    this._warnMesh.position.y = 0.03
    this._warnMesh.renderOrder = 2
    this._warnMesh.visible = false

    // fired panel — the missing-texture checker, lingering in shame
    this._fireMat = new THREE.MeshBasicMaterial({
      map: makeMissingTexture(), transparent: true, opacity: 0.9, depthWrite: false,
    })
    this._fireMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_D), this._fireMat)
    this._fireMesh.rotation.x = -Math.PI / 2
    this._fireMesh.position.y = 0.032
    this._fireMesh.renderOrder = 3
    this._fireMesh.visible = false

    // teleport pillar flash
    this._pillarMat = new THREE.MeshBasicMaterial({
      color: 0xb04dff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this._pillar = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 3.4, PANEL_D), this._pillarMat)
    this._pillar.position.y = 1.7
    this._pillar.visible = false

    this.group.add(this._warnMesh, this._fireMesh, this._pillar)

    this._panel = { state: 'idle', timer: 4 + this._rng() * 2, x: 0, z: 0, slot: -1, tick: 0 }
    this.addUpdater((dt) => this._updateGlitchZone(dt))
  }

  _updateGlitchZone(dt) {
    const p = this._panel
    p.timer -= dt

    if (p.state === 'idle') {
      if (p.timer <= 0) {
        let slot = Math.floor(this._rng() * PANEL_SLOTS.length)
        if (slot === p.slot) slot = (slot + 1 + Math.floor(this._rng() * (PANEL_SLOTS.length - 1))) % PANEL_SLOTS.length
        p.slot = slot
        p.x = PANEL_SLOTS[slot][0]
        p.z = PANEL_SLOTS[slot][1]
        p.state = 'warn'
        p.timer = WARN_TIME
        p.tick = 0
        this._warnMesh.position.set(p.x, this._warnMesh.position.y, p.z)
        this._fireMesh.position.set(p.x, this._fireMesh.position.y, p.z)
        this._pillar.position.set(p.x, this._pillar.position.y, p.z)
        this._warnMesh.visible = true
        this.emit('arena:glitch', { phase: 'warn', x: p.x, z: p.z, slot })
      }
      return
    }

    if (p.state === 'warn') {
      // RGB channel roulette + positional jitter — the panel is DECOMPILING
      this._warnMat.color.setHex(RGB[Math.floor(this._time * 18) % 3])
      this._warnMat.opacity = 0.28 + this._rng() * 0.3
      this._warnMesh.position.x = p.x + (this._rng() - 0.5) * 0.08
      this._warnMesh.position.z = p.z + (this._rng() - 0.5) * 0.08
      this._warnMesh.visible = Math.floor(this._time * 30) % 5 !== 0
      p.tick -= dt
      if (p.tick <= 0) {
        p.tick = 0.28
        this.sfx('menu_move', { pitch: 0.5 + (WARN_TIME - p.timer) * 0.35, vol: 0.5 })
      }
      if (p.timer <= 0) this._glitchFire(p)
      return
    }

    if (p.state === 'cooldown') {
      const k = Math.max(0, p.timer / COOL_TIME)
      this._fireMat.opacity = 0.9 * k
      this._pillarMat.opacity = Math.max(0, (k - 0.55) / 0.45) * 0.5
      this._pillar.scale.y = 1 + (1 - k) * 0.35
      if (p.timer <= 0) {
        this._fireMesh.visible = false
        this._pillar.visible = false
        p.state = 'idle'
        p.timer = IDLE_MIN + this._rng() * IDLE_VAR
      }
    }
  }

  _glitchFire(p) {
    p.state = 'cooldown'
    p.timer = COOL_TIME
    this._warnMesh.visible = false
    this._fireMesh.visible = true
    this._fireMat.opacity = 0.9
    this._pillar.visible = true
    this._pillarMat.opacity = 0.5
    this._pillar.scale.y = 1

    const caught = this._teleportOccupants(p.x, p.z)

    this.emit('arena:glitch', { phase: 'fire', x: p.x, z: p.z, slot: p.slot, caught })
    this.emit('camera:shake', { mag: caught > 0 ? 0.45 : 0.3 })
    this.emit('caption', { text: 'MISSING TEXTURE' })
    this.sfx('boing', { pitch: 1.5, vol: 0.7 })
    this.sfx('launch', { pitch: 1.3, vol: 0.4 })
    for (const c of this._crowds) c.cheer(caught > 0 ? 1.8 : 0.8)
    // nearby art panics in sympathy
    if (this._portraits.length) this._portraits[Math.floor(this._rng() * this._portraits.length)].scramble(true)
    for (const b of this._blocks) if (this._rng() < 0.5) b.burst()
    this._veil?.surge(0.8)
  }

  // Anyone (fighters, ragdolls, props, debris) standing on the panel goes 3m
  // up. Fighters are kinematic, so we move their roots directly; everything
  // that lives in the physics world gets an upward impulse instead.
  _teleportOccupants(x, z = 0) {
    const halfW = PANEL_W / 2 + 0.15
    const halfD = PANEL_D / 2 + 0.2
    let caught = 0

    // kinematic fighters (root.position IS fighter.pos — see Fighter.js)
    for (const ref of this._fighterRefs) {
      const pos = ref.root?.position
      if (!pos) continue
      if (Math.abs(pos.x - x) > halfW || pos.y > 0.4 || Math.abs(pos.z - z) > halfD) continue
      const f = ref.fighter
      if (f && f.state === 'ragdoll') continue // the body sweep below handles ragdolls
      pos.y += 3
      if (f?.vel) f.vel.y = Math.max(f.vel.y, 0.5) // a beat of hang-time, then the drop
      caught++
    }

    // every dynamic body in the world: props, debris, ragdoll limbs
    const bodies = this.physics?.world?.bodies
    if (bodies) {
      for (const b of bodies) {
        if (!b || !(b.mass > 0) || !b.position) continue
        const bp = b.position
        if (Math.abs(bp.x - x) > halfW || bp.y > 1.5 || Math.abs(bp.z - z) > halfD + 0.5) continue
        try {
          this.physics.impulse(b, [(this._rng() - 0.5) * 2, 4 + b.mass * 8, (this._rng() - 0.5) * 2])
          caught++
        } catch (e) { /* the void rejects this body */ }
      }
    }
    return caught
  }

  // The engine only hands arenas fighter objects via onRagdollLaunch, so we
  // also scan the scene for fighter roots (Group > holder Group > model
  // Group, meshy, near the floor) to make the hazard live from round one.
  // Purely best-effort and capped; wrong guesses would merely get a free
  // 3-meter museum tour.
  _scanForFighters() {
    const scene = this.scene
    if (!scene?.children || this._fighterRefs.length >= 2) return
    for (const child of scene.children) {
      if (this._fighterRefs.length >= 2) break
      if (!child.isGroup || child === this.group) continue
      if (child.position.y > 2.5) continue
      if (child.children.length !== 1) continue
      if (this._fighterRefs.some((r) => r.root === child)) continue
      const holder = child.children[0]
      if (!holder?.isGroup || holder.children.length !== 1) continue
      const model = holder.children[0]
      if (!model?.isGroup || model.children.length < 1) continue
      let meshes = 0
      model.traverse((o) => { if (o.isMesh) meshes++ })
      if (meshes < 3) continue
      this._fighterRefs.push({ root: child, fighter: null })
    }
  }

  _captureFighter(f) {
    if (!f?.root) return
    const existing = this._fighterRefs.find((r) => r.root === f.root)
    if (existing) { existing.fighter = f; return }
    this._fighterRefs.push({ root: f.root, fighter: f })
  }

  // -- events ---------------------------------------------------------------

  _wireEvents() {
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.2 + Math.min(0.7, combo * 0.06) + (e?.counter ? 0.35 : 0))
      // big hits corrupt the nearest art
      if ((e?.damage || 0) >= 10 && this._portraits.length) {
        this._portraits[Math.floor(this._rng() * this._portraits.length)].scramble(false)
      }
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.2) })
    this.listen('fighter:ko', () => { for (const c of this._crowds) c.cheer(3); this._glitchStorm() })
    this.listen('round:end', () => { for (const c of this._crowds) c.cheer(2) })
    this.listen('physics:impact', (e) => {
      if (e?.speed > 9 && this._portraits.length) {
        this._portraits[Math.floor(this._rng() * this._portraits.length)].scramble(false)
      }
    })
  }

  // Every screen in the museum has a very bad frame — KO celebration.
  _glitchStorm() {
    for (const portrait of this._portraits) portrait.scramble(true)
    for (const b of this._blocks) b.burst()
    this._veil?.surge(2)
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    // lazy fighter discovery until we know both roots
    this._scanCooldown -= dt
    if (this._scanCooldown <= 0 && this._fighterRefs.length < 2) {
      this._scanCooldown = 1.2
      try { this._scanForFighters() } catch (e) { /* scan is best-effort */ }
    }
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    this._captureFighter(fighter)
    this._captureFighter(fighter?.foe)
    try { this.audio?.crowd?.('wild') } catch (e) { /* the shadows are speechless */ }
    for (const c of this._crowds) c.cheer(2)
    // a launch this good deserves corrupted media coverage
    if (this._portraits.length) this._portraits[Math.floor(this._rng() * this._portraits.length)].scramble(true)
    for (const b of this._blocks) if (this._rng() < 0.4) b.burst()
    this._veil?.surge(0.6)
    if (this.physics?.presetName === 'unhinged') {
      const side = (fighter?.pos?.x ?? 0) >= 0 ? this._crowdRight : this._crowdLeft
      side?.knockOverRandom(3 + Math.floor(this._rng() * 4))
      this._crowdBack?.knockOverRandom(1 + Math.floor(this._rng() * 3))
      this.sfx('boing', { vol: 0.5 })
    }
  }
}

export const LostBlockMuseum = {
  id: 'lost-block-museum',
  name: 'LOST BLOCK MUSEUM',
  music: 'battle_lost_block',
  build(ctx) { return new LostBlockMuseumArena(ctx) },
}
