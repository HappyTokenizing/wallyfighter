// ============================================================================
// PERMANENT RESERVE CORE — the final stage (story round 10). The unstable
// heart of the Permanent Reserve: a cavernous vault interior where the gold
// is airborne, the candlesticks are load-bearing, and the reserve itself is
// held together by vibes and a 3% stability reading.
//
// Set dressing: a COLOSSAL vault door looming at -Z (handle wheel slowly
// turning — nobody knows toward locked or unlocked), rings of gold bars and
// coin stacks orbiting the core, pillars of pure candlestick energy stacking
// and collapsing, red/green arcs crackling between conduits, a glowing
// reserve sigil in the floor, and edge plates that crack and drop into the
// void as the match wears the place down (visual only — bounds unchanged).
//
// NO crowd down here — just security drones with searchlights, sweeping for
// unauthorized withdrawals.
//
// Hazard: CORE SURGE every ~12 s. The sigil charges (rising whine + glow),
// then detonates a ring shockwave from center. Airborne fighters are safe;
// grounded ones get launched. Caption: 'RESERVE UNSTABLE'.
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign,
} from './ArenaBase.js'

// ---------------------------------------------------------------------------
// tuning
// ---------------------------------------------------------------------------
const SURGE_INTERVAL = 12      // seconds between surges (± jitter)
const SURGE_CHARGE = 1.8       // charge-up duration
const SURGE_WAVE_SPEED = 13    // shockwave expansion m/s
const SURGE_SAFE_HEIGHT = 0.6  // fighters above this when the wave passes = safe
const SURGE_MAX_R = 13.5
const SIGIL_Z = -0.4           // sigil / surge epicenter (slightly behind fight axis)
const PLATE_STEP = 6.5         // instability points between edge-plate failures
const SKIP_STATES = new Set(['ragdoll', 'ko', 'grabbed', 'finisher', 'win', 'lose'])

const GOLD = 0xf5c33b
const GOLD_DARK = 0xc8921d
const GREEN = 0x37e05f
const RED = 0xff4d5e
const STEEL = 0x232a33
const STEEL_DARK = 0x151b24

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }

// ---------------------------------------------------------------------------
// module-private canvas painters
// ---------------------------------------------------------------------------

function glowTexture(px = 64, inner = '#ffffff', outer = 'rgba(255,255,255,0)') {
  return canvasTexture(px, px, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W / 2)
    g.addColorStop(0, inner)
    g.addColorStop(1, outer)
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
  }, { nearest: false })
}

function makeVaultFloorTexture(rng) {
  // dark steel plating with rivets and faint green energy veins radiating
  // from the middle. Big texels, deliberate 2002 tiling energy.
  return canvasTexture(640, 384, (c, W, H) => {
    c.fillStyle = '#20262f'
    c.fillRect(0, 0, W, H)
    // plate grid (2 m plates on a 44x26 slab)
    const px = W / 22, pz = H / 13
    for (let iy = 0; iy < 13; iy++) {
      for (let ix = 0; ix < 22; ix++) {
        const jitter = (rng() - 0.5) * 10
        c.fillStyle = `rgb(${34 + jitter | 0},${40 + jitter | 0},${49 + jitter | 0})`
        c.fillRect(ix * px + 1, iy * pz + 1, px - 2, pz - 2)
        // corner rivets
        c.fillStyle = 'rgba(10,12,16,0.9)'
        for (const [ox, oy] of [[4, 4], [px - 6, 4], [4, pz - 6], [px - 6, pz - 6]]) {
          c.beginPath(); c.arc(ix * px + ox, iy * pz + oy, 1.8, 0, Math.PI * 2); c.fill()
        }
        // the occasional scuff — someone dragged a pallet of bags
        if (rng() < 0.1) {
          c.strokeStyle = 'rgba(8,10,14,0.5)'
          c.lineWidth = 2
          c.beginPath()
          c.moveTo(ix * px + rng() * px, iy * pz + rng() * pz)
          c.lineTo(ix * px + rng() * px, iy * pz + rng() * pz)
          c.stroke()
        }
      }
    }
    // seams
    c.strokeStyle = 'rgba(6,8,12,0.85)'
    c.lineWidth = 3
    for (let ix = 0; ix <= 22; ix++) { c.beginPath(); c.moveTo(ix * px, 0); c.lineTo(ix * px, H); c.stroke() }
    for (let iy = 0; iy <= 13; iy++) { c.beginPath(); c.moveTo(0, iy * pz); c.lineTo(W, iy * pz); c.stroke() }
    // energy veins crawling out from the center — the core leaking through
    const cx = W / 2, cy = H / 2
    for (let v = 0; v < 14; v++) {
      const ang = (v / 14) * Math.PI * 2 + (rng() - 0.5) * 0.5
      let x = cx, y = cy, a = ang
      c.lineWidth = 5
      c.strokeStyle = 'rgba(23,84,56,0.55)'
      c.beginPath(); c.moveTo(x, y)
      const steps = 4 + Math.floor(rng() * 4)
      for (let s = 0; s < steps; s++) {
        a += (rng() - 0.5) * 1.1
        x += Math.cos(a) * (18 + rng() * 30)
        y += Math.sin(a) * (12 + rng() * 20)
        c.lineTo(x, y)
      }
      c.stroke()
      c.lineWidth = 2
      c.strokeStyle = 'rgba(55,224,95,0.5)'
      c.stroke()
    }
    // hazard dashes ringing the core zone
    c.save()
    c.translate(cx, cy)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      c.fillStyle = i % 2 === 0 ? 'rgba(232,177,60,0.7)' : 'rgba(16,18,24,0.85)'
      c.save()
      c.rotate(a)
      c.fillRect(96, -5, 22, 10)
      c.restore()
    }
    c.restore()
  })
}

function makeSigilTexture() {
  // The reserve sigil: circular seal, candlestick-arrow emblem, circular text.
  return canvasTexture(256, 256, (c, W, H) => {
    const cx = W / 2, cy = H / 2
    c.clearRect(0, 0, W, H)
    // seal disc
    const g = c.createRadialGradient(cx, cy, 8, cx, cy, W * 0.48)
    g.addColorStop(0, 'rgba(120,255,180,0.9)')
    g.addColorStop(0.35, 'rgba(55,224,95,0.5)')
    g.addColorStop(1, 'rgba(55,224,95,0.06)')
    c.fillStyle = g
    c.beginPath(); c.arc(cx, cy, W * 0.48, 0, Math.PI * 2); c.fill()
    // rings
    c.strokeStyle = 'rgba(150,255,190,0.95)'
    c.lineWidth = 5
    c.beginPath(); c.arc(cx, cy, W * 0.46, 0, Math.PI * 2); c.stroke()
    c.lineWidth = 3
    c.beginPath(); c.arc(cx, cy, W * 0.30, 0, Math.PI * 2); c.stroke()
    // circular text — the founding lie
    const msg = 'PERMANENT RESERVE • EST. NEVER • FULLY BACKED • '
    c.font = '900 15px "Arial Black", Arial, sans-serif'
    c.fillStyle = 'rgba(200,255,220,0.95)'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let i = 0; i < msg.length; i++) {
      const a = (i / msg.length) * Math.PI * 2 - Math.PI / 2
      c.save()
      c.translate(cx + Math.cos(a) * W * 0.38, cy + Math.sin(a) * W * 0.38)
      c.rotate(a + Math.PI / 2)
      c.fillText(msg[i], 0, 0)
      c.restore()
    }
    // emblem: one heroic green candle going UP, forever
    c.fillStyle = 'rgba(220,255,230,0.95)'
    c.fillRect(cx - 3, cy - 58, 6, 30)   // upper wick
    c.fillRect(cx - 14, cy - 30, 28, 52) // body
    c.fillRect(cx - 3, cy + 20, 6, 22)   // lower wick
    // arrowhead
    c.beginPath()
    c.moveTo(cx, cy - 74); c.lineTo(cx - 14, cy - 52); c.lineTo(cx + 14, cy - 52)
    c.closePath(); c.fill()
  }, { nearest: false })
}

function makeVaultDoorFaceTexture() {
  return canvasTexture(512, 512, (c, W, H) => {
    const cx = W / 2, cy = H / 2
    // brushed steel disc
    c.fillStyle = '#2b333f'
    c.beginPath(); c.arc(cx, cy, W / 2, 0, Math.PI * 2); c.fill()
    for (let r = 40; r < W / 2; r += 14) {
      c.strokeStyle = r % 28 === 12 ? 'rgba(12,16,22,0.6)' : 'rgba(70,82,98,0.35)'
      c.lineWidth = 3
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
    }
    // heavy inner ring + bolts
    c.strokeStyle = '#10151d'
    c.lineWidth = 16
    c.beginPath(); c.arc(cx, cy, W * 0.36, 0, Math.PI * 2); c.stroke()
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      c.fillStyle = '#4a5666'
      c.beginPath(); c.arc(cx + Math.cos(a) * W * 0.43, cy + Math.sin(a) * W * 0.43, 9, 0, Math.PI * 2); c.fill()
      c.fillStyle = 'rgba(10,13,18,0.8)'
      c.beginPath(); c.arc(cx + Math.cos(a) * W * 0.43 + 2, cy + Math.sin(a) * W * 0.43 + 2, 4, 0, Math.PI * 2); c.fill()
    }
    // circular lettering
    const msg = '· PERMANENT RESERVE · TOTAL ASSETS: YES ·'
    c.font = '900 26px "Arial Black", Arial, sans-serif'
    c.fillStyle = '#ffd83d'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let i = 0; i < msg.length; i++) {
      const a = (i / msg.length) * Math.PI * 2 - Math.PI / 2
      c.save()
      c.translate(cx + Math.cos(a) * W * 0.30, cy + Math.sin(a) * W * 0.30)
      c.rotate(a + Math.PI / 2)
      c.fillText(msg[i], 0, 0)
      c.restore()
    }
    // stenciled warning across the lower face
    c.save()
    c.translate(cx, cy + W * 0.16)
    c.rotate(-0.06)
    c.font = '900 34px "Arial Black", Arial, sans-serif'
    c.fillStyle = 'rgba(255,77,94,0.85)'
    c.fillText('DO NOT AUDIT', 0, 0)
    c.restore()
  }, { nearest: false })
}

function makeConduitBoxTexture() {
  return canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#39424f'
    c.fillRect(0, 0, W, H)
    // vents
    c.fillStyle = 'rgba(12,16,22,0.85)'
    for (let i = 0; i < 5; i++) c.fillRect(10, 10 + i * 8, W - 20, 4)
    // warning label
    c.fillStyle = '#e8b13c'
    c.fillRect(8, 56, W - 16, 22)
    c.font = '900 11px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#20242c'
    c.fillText('HIGH YIELD', W / 2, 63)
    c.fillText('VOLTAGE', W / 2, 74)
    // glow strip
    c.fillStyle = '#37e05f'
    c.fillRect(8, H - 10, W - 16, 5)
  })
}

function makeConsoleScreenTexture() {
  return canvasTexture(160, 120, (c, W, H) => {
    c.fillStyle = '#0a1420'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(55,224,95,0.35)'
    c.lineWidth = 2
    c.strokeRect(3, 3, W - 6, H - 6)
    c.font = '900 15px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.fillStyle = '#9fe8b0'
    c.fillText('RESERVE', W / 2, 22)
    c.fillText('STABILITY:', W / 2, 40)
    c.font = '900 34px "Arial Black", Arial, sans-serif'
    c.fillStyle = '#ff4d5e'
    c.fillText('3%', W / 2, 74)
    // an empty progress bar, mostly a formality
    c.strokeStyle = '#9fe8b0'
    c.lineWidth = 2
    c.strokeRect(14, 90, W - 28, 14)
    c.fillStyle = '#ff4d5e'
    c.fillRect(16, 92, (W - 32) * 0.03, 10)
    c.font = '700 9px monospace'
    c.fillStyle = 'rgba(159,232,176,0.8)'
    c.fillText('DO NOT TURN OFF', W / 2, 114)
  })
}

function makeCoinStackSideTexture(nCoins) {
  // horizontal coin-edge stripes so one cylinder reads as a stack of coins
  return canvasTexture(64, 16 * nCoins, (c, W, H) => {
    for (let i = 0; i < nCoins; i++) {
      c.fillStyle = i % 2 === 0 ? '#f5c33b' : '#e3b02e'
      c.fillRect(0, i * 16, W, 16)
      c.fillStyle = 'rgba(140,94,13,0.8)'
      c.fillRect(0, i * 16 + 13, W, 3)
      // rim notches
      c.fillStyle = 'rgba(200,146,29,0.7)'
      for (let x = 2; x < W; x += 8) c.fillRect(x, i * 16 + 3, 3, 8)
    }
  })
}

function makeCoinFaceTexture() {
  return canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#f5c33b'
    c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#c8921d'
    c.lineWidth = W * 0.06
    c.beginPath(); c.arc(W / 2, H / 2, W * 0.38, 0, Math.PI * 2); c.stroke()
    c.font = `900 ${W * 0.42}px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#8a5e0d'
    c.fillText('R', W / 2, H / 2 + 2)
  })
}

function makeCrackTexture() {
  return canvasTexture(96, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    const rng = makeRng(0xcac)
    c.strokeStyle = 'rgba(5,7,10,0.95)'
    for (let k = 0; k < 5; k++) {
      let x = W / 2 + (rng() - 0.5) * 20, y = H / 2 + (rng() - 0.5) * 20
      let a = rng() * Math.PI * 2
      c.lineWidth = 4 - k * 0.5
      c.beginPath(); c.moveTo(x, y)
      for (let s = 0; s < 5; s++) {
        a += (rng() - 0.5) * 1.4
        x += Math.cos(a) * (10 + rng() * 14)
        y += Math.sin(a) * (10 + rng() * 14)
        c.lineTo(x, y)
      }
      c.stroke()
    }
    // faint red heat bleeding through the cracks
    c.strokeStyle = 'rgba(255,77,94,0.35)'
    c.lineWidth = 7
    c.beginPath(); c.moveTo(W * 0.2, H * 0.7); c.lineTo(W * 0.55, H * 0.45); c.lineTo(W * 0.85, H * 0.6)
    c.stroke()
  })
}

function makeHoleTexture() {
  // what's under the floor: nothing good
  return canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#03040a'
    c.fillRect(0, 0, W, H)
    const g = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.6)
    g.addColorStop(0, 'rgba(255,90,60,0.5)')
    g.addColorStop(0.6, 'rgba(255,60,40,0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
    // jagged rim
    c.strokeStyle = 'rgba(232,177,60,0.5)'
    c.lineWidth = 3
    c.strokeRect(2, 2, W - 4, H - 4)
  })
}

// ---------------------------------------------------------------------------
// module-private mesh factories
// ---------------------------------------------------------------------------

// A proper ingot: 4-sided frustum, rotated flat and stretched. Gold. Heavy.
function ingotGeometry() {
  const g = new THREE.CylinderGeometry(0.30, 0.42, 0.26, 4, 1)
  g.rotateY(Math.PI / 4)
  g.scale(1.65, 1, 0.95)
  return g
}

function makeIngot(geo, mat) {
  const m = new THREE.Mesh(geo, mat)
  m.name = 'goldBar'
  return m
}

// Pallet of gold bars — the breakable version sits on a wooden skid.
function makeGoldStack(rng, geo, opts = {}) {
  const g = new THREE.Group()
  g.name = 'goldStack'
  const mat = flatMat(GOLD)
  const matDark = flatMat(GOLD_DARK)
  if (opts.pallet !== false) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.1), flatMat(0x6e4a26))
    skid.position.y = 0.06
    g.add(skid)
  }
  const layers = opts.layers ?? 3
  for (let ly = 0; ly < layers; ly++) {
    const n = Math.max(1, 3 - ly)
    for (let i = 0; i < n; i++) {
      const bar = makeIngot(geo, ly % 2 === 0 ? mat : matDark)
      const across = ly % 2 === 1
      bar.rotation.y = (across ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.14
      bar.position.set(
        across ? (rng() - 0.5) * 0.2 : (i - (n - 1) / 2) * 0.55,
        0.25 + ly * 0.26,
        across ? (i - (n - 1) / 2) * 0.55 : (rng() - 0.5) * 0.2
      )
      g.add(bar)
    }
  }
  return g
}

// One cylinder per coin stack — striped side texture sells the stack.
function makeCoinStack(nCoins, radius = 0.26) {
  const h = nCoins * 0.07
  const side = new THREE.MeshLambertMaterial({ map: makeCoinStackSideTexture(nCoins), flatShading: true })
  const cap = new THREE.MeshLambertMaterial({ map: makeCoinFaceTexture(), flatShading: true })
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 12), [side, cap, cap])
  m.position.y = h / 2
  m.name = 'coinStack'
  return m
}

function makeCoinPallet(rng) {
  const g = new THREE.Group()
  g.name = 'coinPallet'
  const skid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.0), flatMat(0x6e4a26))
  skid.position.y = 0.06
  g.add(skid)
  for (let i = 0; i < 5; i++) {
    const n = 4 + Math.floor(rng() * 5)
    const s = makeCoinStack(n, 0.2)
    s.position.set((rng() - 0.5) * 0.8, 0.12 + s.position.y, (rng() - 0.5) * 0.6)
    s.rotation.y = rng() * Math.PI
    g.add(s)
  }
  return g
}

function makeConduitBox() {
  const tex = makeConduitBoxTexture()
  const skin = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  const g = new THREE.Group()
  g.name = 'conduitBox'
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.6), skin)
  box.position.y = 0.425
  g.add(box)
  // stubby insulators on top
  for (const ox of [-0.18, 0.18]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.28, 6), flatMat(0x1a2028))
    post.position.set(ox, 0.98, 0)
    g.add(post)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: GREEN }))
    tip.position.set(ox, 1.14, 0)
    g.add(tip)
  }
  return g
}

function makeStabilityConsole() {
  const g = new THREE.Group()
  g.name = 'stabilityConsole'
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.8, 0.7), flatMat(0x39424f))
  desk.position.y = 0.4
  g.add(desk)
  const shell = flatMat(0x1a2028)
  const screenMat = new THREE.MeshBasicMaterial({ map: makeConsoleScreenTexture() })
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.66, 0.5), [shell, shell, shell, shell, screenMat, shell])
  monitor.position.set(0, 1.15, 0.02)
  monitor.rotation.x = -0.12
  g.add(monitor)
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.3), flatMat(0x4a5666))
  keys.position.set(0, 0.83, 0.28)
  keys.rotation.x = 0.12
  g.add(keys)
  // blinking alarm overlay on the screen — child, so it rides along when punted
  const blink = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.58),
    new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.28, depthWrite: false })
  )
  blink.position.set(0, 1.15, 0.28)
  blink.rotation.x = -0.12
  g.add(blink)
  return { group: g, blink }
}

// The star of the show. Returns { group, wheel, seamMat } — wheel turns, seam glows.
function makeVaultDoor() {
  const g = new THREE.Group()
  g.name = 'vaultDoor'
  const R = 6.8

  // recessed frame ring in the wall
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.9, R + 0.9, 0.9, 28), flatMat(0x10151d))
  frame.geometry.rotateX(Math.PI / 2)
  frame.position.z = -0.75
  g.add(frame)

  // unstable green light leaking around the door seam
  const seamMat = new THREE.MeshBasicMaterial({
    color: GREEN, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  })
  const seam = new THREE.Mesh(new THREE.RingGeometry(R - 0.05, R + 0.55, 40), seamMat)
  seam.position.z = -0.28
  g.add(seam)

  // the door disc itself
  const faceTex = makeVaultDoorFaceTexture()
  const rim = flatMat(0x1c232d)
  const face = new THREE.MeshLambertMaterial({ map: faceTex, flatShading: true })
  const doorGeo = new THREE.CylinderGeometry(R, R, 1.3, 28)
  doorGeo.rotateX(Math.PI / 2)
  const door = new THREE.Mesh(doorGeo, [rim, face, rim])
  g.add(door)

  // rim bolts
  const boltGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.5, 8)
  boltGeo.rotateX(Math.PI / 2)
  const boltMat = flatMat(0x4a5666)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const bolt = new THREE.Mesh(boltGeo, boltMat)
    bolt.position.set(Math.cos(a) * (R - 0.7), Math.sin(a) * (R - 0.7), 0.75)
    g.add(bolt)
  }

  // colossal hinges, stage left of the door
  const hingeMat = flatMat(0x10151d)
  for (const hy of [-3.2, 3.2]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 2.0), hingeMat)
    hinge.position.set(-(R + 1.1), hy, 0.2)
    g.add(hinge)
  }

  // the handle wheel — still turning, on its own schedule
  const wheel = new THREE.Group()
  wheel.position.z = 1.35
  const wheelMat = flatMat(0xd8d3c3)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.26, 8, 18), wheelMat)
  wheel.add(ring)
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.4, 0.3), wheelMat)
    spoke.rotation.z = (i / 3) * Math.PI
    wheel.add(spoke)
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), flatMat(GOLD))
  wheel.add(hub)
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), hingeMat)
  axle.geometry.rotateX(Math.PI / 2)
  axle.position.z = -0.45
  wheel.add(axle)
  g.add(wheel)

  return { group: g, wheel, seamMat }
}

// Conduit pylon — arc endpoints live at the tip.
function makeConduitPylon(height, tint) {
  const g = new THREE.Group()
  g.name = 'pylon'
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.55, height, 0.55), flatMat(0x2b333f))
  col.position.y = height / 2
  g.add(col)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 6, 10), new THREE.MeshBasicMaterial({ color: tint }))
  collar.rotation.x = Math.PI / 2
  collar.position.y = height - 0.3
  g.add(collar)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), new THREE.MeshBasicMaterial({ color: 0xdfffe8 }))
  tip.position.y = height + 0.12
  g.add(tip)
  // warning plate at the base
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.08), flatMat(0xe8b13c))
  plate.position.set(0, 0.5, 0.32)
  g.add(plate)
  return { group: g, tipY: height + 0.12 }
}

// A pillar of pure candlestick energy: glowing candles stack up, then the
// whole position gets liquidated and it starts over. Market physics.
function makeCandlePillar(rng, phase0) {
  const g = new THREE.Group()
  g.name = 'candlePillar'
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8), flatMat(0x10151d))
  base.position.y = 0.25
  g.add(base)
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.65, 0.16, 8),
    new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  glow.position.y = 0.54
  g.add(glow)

  const MAX = 8
  const segs = []
  for (let i = 0; i < MAX; i++) {
    const green = rng() < 0.68 // the reserve runs on optimism
    const mat = new THREE.MeshBasicMaterial({ color: green ? GREEN : RED, transparent: true, opacity: 0.92, depthWrite: false })
    const seg = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.56), mat)
    seg.add(body)
    const wick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), mat)
    seg.add(wick)
    seg.visible = false
    g.add(seg)
    segs.push({ seg, mat, vy: 0, spin: 0 })
  }

  const st = { mode: 'grow', n: 0, t: phase0, hold: 0 }
  const update = (dt) => {
    glow.material.opacity = 0.4 + 0.25 * Math.abs(Math.sin(st.t * 3))
    st.t += dt
    if (st.mode === 'grow') {
      if (st.t >= 0.5 && st.n < MAX) {
        st.t = 0
        const s = segs[st.n]
        s.seg.visible = true
        s.seg.position.set(0, 0.85 + st.n * 0.62, 0)
        s.seg.scale.setScalar(0.01)
        s.pop = 0
        s.mat.opacity = 0.92
        st.n++
        if (st.n >= MAX) { st.mode = 'hold'; st.hold = 1.1 + rng() * 0.9 }
      }
      for (const s of segs) {
        if (!s.seg.visible || s.pop === undefined || s.pop >= 1) continue
        s.pop = Math.min(1, s.pop + dt / 0.2)
        s.seg.scale.setScalar(Math.max(0.01, easeOutBack(s.pop)))
      }
    } else if (st.mode === 'hold') {
      st.hold -= dt
      // nervous flicker right before the dump
      if (st.hold < 0.4) for (const s of segs) s.mat.opacity = 0.5 + (rng() < 0.5 ? 0.4 : 0)
      if (st.hold <= 0) {
        st.mode = 'collapse'
        for (const s of segs) { s.vy = 1 + rng() * 2; s.spin = (rng() - 0.5) * 8 }
      }
    } else {
      let alive = false
      for (const s of segs) {
        if (!s.seg.visible) continue
        s.vy -= 30 * dt
        s.seg.position.y += s.vy * dt
        s.seg.rotation.z += s.spin * dt
        s.mat.opacity = Math.max(0, s.mat.opacity - dt * 1.6)
        if (s.seg.position.y < 0.4 || s.mat.opacity <= 0) {
          s.seg.visible = false
          s.seg.rotation.z = 0
        } else alive = true
      }
      if (!alive) { st.mode = 'grow'; st.n = 0; st.t = -0.4 - rng() * 0.8 }
    }
  }
  // pre-warm a few candles so round one doesn't open on bare pedestals
  const pre = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < pre; i++) {
    const s = segs[i]
    s.seg.visible = true
    s.seg.position.set(0, 0.85 + i * 0.62, 0)
    s.seg.scale.setScalar(1)
    s.pop = 1
  }
  st.n = pre

  const forceCollapse = () => {
    if (st.mode !== 'collapse') {
      st.mode = 'collapse'
      for (const s of segs) { s.vy = 2 + rng() * 3; s.spin = (rng() - 0.5) * 10 }
    }
  }
  return { group: g, update, forceCollapse }
}

// Security drone: gunmetal blob, spinning rotor, cyclops eye, searchlight cone.
function makeDrone(glowTex) {
  const g = new THREE.Group()
  g.name = 'drone'
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), flatMat(0x2b333f))
  body.scale.set(1.25, 0.8, 1.05)
  g.add(body)
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.18, 8), flatMat(0x10151d))
  belly.position.y = -0.3
  g.add(belly)
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 10), flatMat(0x4a5666))
  rotor.position.y = 0.32
  g.add(rotor)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 5), flatMat(0x10151d))
  mast.position.y = 0.22
  g.add(mast)
  const eyeMat = new THREE.MeshBasicMaterial({ color: GREEN })
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), eyeMat)
  eye.position.set(0, -0.02, 0.36)
  g.add(eye)

  // searchlight: additive cone hanging off the belly + a glow sprite at source
  const beamGroup = new THREE.Group()
  beamGroup.position.y = -0.34
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xbfffd9, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  })
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4.6, 9, 1, true), beamMat)
  cone.position.y = -2.3
  // fade out when the camera gets close (replay orbit reads it via userData;
  // live play does the same in _updateDrones) — a beam crossing the lens
  // otherwise renders as a giant flat red wedge
  cone.userData.cameraFade = 2.6
  beamGroup.add(cone)
  const src = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  src.position.y = -0.05
  beamGroup.add(src)
  g.add(beamGroup)

  return { group: g, rotor, eyeMat, beamMat, beamGroup, beamCone: cone }
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

class PermanentReserveCoreArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.6 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]
    // near-black vault: ask MatchScreen for a per-fighter fill/rim rig so dark
    // fighters keep their silhouettes against the black-and-gold walls
    this.fighterFill = { color: 0xffe2ad, intensity: 3.0, rimColor: 0x66ffb0, rimIntensity: 2.6 }

    this._rng = makeRng(0x907d)
    this._time = 0
    this._pulseBoost = 0        // spikes on impacts/KOs, decays
    this._instability = 0       // drives edge-plate failures
    this._plateThreshold = PLATE_STEP
    this._plates = []
    this._plateOrder = []
    this._drones = []
    this._camera = null         // set via setCamera (additive MatchScreen hook)
    this._beamV = new THREE.Vector3()
    this._pillars = []
    this._bolts = []
    this._conduitHandles = new Set()
    this._surge = {
      phase: 'idle',
      t: 8 + this._rng() * 3,   // first surge lands a touch early — set the tone
      chargeT: 0, waveR: 0, whineAcc: 0,
      fHit: [false, false], propHit: new Set(), victims: 0,
    }
    this._announcedSurge = false
    this._announcedVictim = false

    this._glowTex = glowTexture(64, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)')
    this._ingotGeo = ingotGeometry()

    this._buildPhysics()
    this._buildCavernAndLights()
    this._buildFloorAndSigil()
    this._buildEdgePlates()
    this._buildVaultDoor()
    this._buildOrbits()
    this._buildPillars()
    this._buildArcs()
    this._buildDrones()
    this._buildEmbers()
    this._buildSurgeMeshes()
    this._buildProps()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction ---------------------------------------------------------

  _buildPhysics() {
    // floor slab + invisible bouncy walls on all four sides, inner faces
    // exactly at the bounds
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildCavernAndLights() {
    // cavern void — the "sky" is darkness with a sickly green horizon glow
    const sky = buildSkyDome(['#020308', '#060d18', '#0a1e22', '#10312a'], {
      rng: this._rng, sun: false, clouds: false,
    })
    this.group.add(sky)

    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0x35525e, hemiGround: 0x241a12, hemiIntensity: 0.6,
      sunColor: 0xcfe8dd, sunIntensity: 1.0, sunPos: [7, 18, 11],
      fillColor: 0xff5a44, fillIntensity: 0.3, fillPos: [-11, 6, -9],
      fog: { color: 0x07090e, near: 26, far: 64 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this._rig = rig
    this.onDispose(() => rig.dispose())

    // the core-pulse light — the whole scene breathes with it
    this._coreLight = new THREE.PointLight(0x66ffb0, 1.0, 30, 2)
    this._coreLight.position.set(0, 3.4, -3)
    this.group.add(this._coreLight)

    // cavern walls boxing in the void
    const wallMat = flatMat(0x11151d)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(48, 22, 1.2), wallMat)
    backWall.position.set(0, 10, -15.6)
    this.group.add(backWall)
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 34), wallMat)
      wall.position.set(side * 20, 10, -4)
      this.group.add(wall)
    }
    // overhead girders with hazard-striped undersides
    const girderMat = flatMat(STEEL_DARK)
    const stripeMat = flatMat(0xe8b13c)
    for (const gz of [-5.5, -10]) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(40, 0.9, 1.3), girderMat)
      girder.position.set(0, 13.5, gz)
      this.group.add(girder)
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(40.2, 0.16, 0.5), stripeMat)
      stripe.position.set(0, 13.0, gz)
      this.group.add(stripe)
    }
  }

  _buildFloorAndSigil() {
    const tex = makeVaultFloorTexture(this._rng)
    const sideMat = flatMat(0x0d1117)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 26), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -3)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)
    // the abyss beyond the slab
    const abyss = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ color: 0x030408 }))
    abyss.rotation.x = -Math.PI / 2
    abyss.position.y = -0.34
    this.group.add(abyss)

    // -- the reserve sigil: emblem disc + two counter-rotating glow rings
    const sigil = new THREE.Group()
    sigil.name = 'reserveSigil'
    sigil.position.set(0, 0.03, SIGIL_Z)

    this._sigilEmblemMat = new THREE.MeshBasicMaterial({
      map: makeSigilTexture(), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const emblem = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), this._sigilEmblemMat)
    emblem.rotation.x = -Math.PI / 2
    sigil.add(emblem)

    this._sigilRingMatA = new THREE.MeshBasicMaterial({
      color: GREEN, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    this._sigilRingA = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.3, 40), this._sigilRingMatA)
    this._sigilRingA.rotation.x = -Math.PI / 2
    this._sigilRingA.position.y = 0.01
    sigil.add(this._sigilRingA)

    this._sigilRingMatB = new THREE.MeshBasicMaterial({
      color: RED, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    this._sigilRingB = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.75, 40), this._sigilRingMatB)
    this._sigilRingB.rotation.x = -Math.PI / 2
    this._sigilRingB.position.y = 0.01
    sigil.add(this._sigilRingB)

    this.group.add(sigil)
    this._sigil = sigil
  }

  _buildEdgePlates() {
    // Perimeter plates that fail as the match progresses. Pure theater:
    // the physics bounds never change, only the scenery's confidence does.
    const plateTex = canvasTexture(96, 96, (c, W, H) => {
      c.fillStyle = '#2b333f'
      c.fillRect(0, 0, W, H)
      c.strokeStyle = 'rgba(8,10,14,0.9)'
      c.lineWidth = 5
      c.strokeRect(3, 3, W - 6, H - 6)
      c.fillStyle = 'rgba(232,177,60,0.65)'
      c.fillRect(8, 8, W - 16, 7)
      c.fillStyle = 'rgba(10,12,16,0.9)'
      for (const [x, y] of [[12, 24], [W - 14, 24], [12, H - 14], [W - 14, H - 14]]) {
        c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill()
      }
    })
    this._crackTex = makeCrackTexture()
    this._holeTex = makeHoleTexture()
    const crackGeo = new THREE.PlaneGeometry(1.72, 1.16)
    const plateGeo = new THREE.BoxGeometry(1.9, 0.22, 1.3)

    const spots = []
    // front apron — pushed past the free-roam z bound so the walkable floor
    // stays clear of solid plate lips
    for (let i = 0; i < 7; i++) spots.push([-6.42 + i * 2.14, 5.9, 0])
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) spots.push([side * 10.3, -2.2 + i * 2.2, side * Math.PI / 2])

    for (const [x, z, ry] of spots) {
      const mat = new THREE.MeshLambertMaterial({ map: plateTex, flatShading: true, transparent: true })
      const mesh = new THREE.Mesh(plateGeo, mat)
      mesh.position.set(x, 0.11, z)
      mesh.rotation.y = ry + (this._rng() - 0.5) * 0.04
      if (this.quality.shadows) mesh.castShadow = true
      this.group.add(mesh)
      const crack = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({
        map: this._crackTex, transparent: true, opacity: 0, depthWrite: false,
      }))
      crack.rotation.x = -Math.PI / 2
      crack.position.y = 0.115
      mesh.add(crack)
      this._plates.push({
        mesh, mat, crack, state: 'intact', t: 0, vy: 0,
        spin: (this._rng() - 0.5) * 5,
        baseX: x, baseZ: z, baseRy: mesh.rotation.y,
      })
    }
    // deterministic failure order
    this._plateOrder = this._plates.map((_, i) => i)
    for (let i = this._plateOrder.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1))
      ;[this._plateOrder[i], this._plateOrder[j]] = [this._plateOrder[j], this._plateOrder[i]]
    }
  }

  _buildVaultDoor() {
    const { group, wheel, seamMat } = makeVaultDoor()
    group.position.set(0, 6.3, -13.9)
    this.group.add(group)
    this._vaultWheel = wheel
    this._seamMat = seamMat
    this.addUpdater((dt) => {
      // slow, ominous, direction never confirmed
      this._vaultWheel.rotation.z += dt * 0.22
    })

    // the branding, and the disclaimer
    const marquee = makeSign('PERMANENT RESERVE', {
      w: 9.5, h: 1.9, depth: 0.3, px: 76,
      bg: '#0c141f', fg: '#ffd83d', border: '#ffd83d',
      sub: 'ASSETS 100% BACKED (SOURCE: TRUST US)', subColor: '#9fe8b0',
    })
    marquee.position.set(0, 15.0, -14.6)
    marquee.rotation.x = -0.08
    this.group.add(marquee)

    const warn = makeSign('AUDITORS KEEP OUT', {
      w: 3.3, h: 0.85, depth: 0.12, px: 72,
      bg: '#3a1015', fg: '#ff4d5e', border: '#ff4d5e', sub: 'YEAR 47 OF AUDIT',
    })
    warn.position.set(-13.6, 2.6, -12.9)
    warn.rotation.y = 0.35
    warn.rotation.z = -0.05
    this.group.add(warn)
  }

  _buildOrbits() {
    const rng = this._rng
    const gold = flatMat(GOLD)
    const goldDark = flatMat(GOLD_DARK)

    // ring A: gold bars, low and wide, clockwise
    // ring B: coin stacks, higher and tighter, counter-clockwise
    // both centered behind the fight floor so nothing crosses the camera line
    this._orbits = []
    const mkOrbit = (cy, cz, radius, speed, items) => {
      const pivot = new THREE.Group()
      pivot.position.set(0, cy, cz)
      this.group.add(pivot)
      const entries = []
      for (let i = 0; i < items.length; i++) {
        const holder = new THREE.Group()
        const a = (i / items.length) * Math.PI * 2
        holder.position.set(Math.cos(a) * radius, (rng() - 0.5) * 0.8, Math.sin(a) * radius)
        holder.add(items[i])
        pivot.add(holder)
        entries.push({
          holder, mesh: items[i],
          bobPhase: rng() * Math.PI * 2, bobSpeed: 0.5 + rng() * 0.5,
          tumble: (rng() - 0.5) * 0.5, baseY: holder.position.y,
        })
      }
      this._orbits.push({ pivot, speed, entries })
    }

    const bars = []
    for (let i = 0; i < 8; i++) {
      const bar = makeIngot(this._ingotGeo, i % 3 === 2 ? goldDark : gold)
      bar.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.5)
      bar.scale.setScalar(1.3 + rng() * 0.6)
      bars.push(bar)
    }
    mkOrbit(3.6, -10.5, 5.4, 0.16, bars)

    const stacks = []
    for (let i = 0; i < 5; i++) {
      const s = makeCoinStack(4 + Math.floor(rng() * 4), 0.3)
      s.position.y = 0 // orbiting stacks float centered
      s.rotation.z = (rng() - 0.5) * 0.4
      stacks.push(s)
    }
    mkOrbit(6.8, -10.5, 4.0, -0.11, stacks)

    this.addUpdater((dt) => {
      for (const o of this._orbits) {
        o.pivot.rotation.y += dt * o.speed
        for (const e of o.entries) {
          e.holder.position.y = e.baseY + Math.sin(this._time * e.bobSpeed + e.bobPhase) * 0.45
          e.mesh.rotation.y += dt * e.tumble
          // counter-rotate holders so pieces drift rather than carousel
          e.holder.rotation.y -= dt * o.speed
        }
      }
    })

    // grounded treasure out on the flanks, gently levitating — the reserve
    // can't even keep its inventory on the shelves anymore
    for (const side of [-1, 1]) {
      const heap = new THREE.Group()
      const stack = makeGoldStack(rng, this._ingotGeo, { pallet: false, layers: 3 })
      stack.scale.setScalar(1.7)
      heap.add(stack)
      const cs = makeCoinStack(7, 0.42)
      cs.position.set(side * 1.6, 0, 0.6)
      heap.add(cs)
      heap.position.set(side * 13.2, 0.4, -3.5)
      heap.rotation.y = -side * 0.4
      this.group.add(heap)
      const baseY = heap.position.y
      const ph = rng() * Math.PI * 2
      this.addUpdater(() => {
        heap.position.y = baseY + Math.sin(this._time * 0.7 + ph) * 0.3
        heap.rotation.y += 0.0008
      })
    }
  }

  _buildPillars() {
    const defs = [
      { x: -11.6, z: -4.5 }, { x: 11.6, z: -4.5 },
      { x: -6.8, z: -8.8 }, { x: 6.8, z: -8.8 },
    ]
    for (const d of defs) {
      const p = makeCandlePillar(this._rng, this._rng() * 0.5)
      p.group.position.set(d.x, 0, d.z)
      this.group.add(p.group)
      this._pillars.push(p)
      this.addUpdater(p.update)
    }
  }

  _buildArcs() {
    const rng = this._rng
    // conduit pylons the arcs jump between
    const pylonDefs = [
      { x: -8.6, z: -6.4, h: 3.6, tint: GREEN },
      { x: 8.6, z: -6.4, h: 3.6, tint: RED },
      { x: -3.9, z: -8.8, h: 4.2, tint: RED },
      { x: 3.9, z: -8.8, h: 4.2, tint: GREEN },
    ]
    const tips = []
    for (const pd of pylonDefs) {
      const { group, tipY } = makeConduitPylon(pd.h, pd.tint)
      group.position.set(pd.x, 0, pd.z)
      this.group.add(group)
      tips.push(new THREE.Vector3(pd.x, tipY, pd.z))
    }
    // the vault wheel hub is also live. Of course it is.
    tips.push(new THREE.Vector3(0, 6.3, -12.5))
    this._arcTips = tips

    // pairs the bolts may strike between (neighbors + anything -> hub)
    this._arcPairs = [[0, 2], [1, 3], [2, 3], [0, 4], [1, 4], [2, 4], [3, 4]]

    const N_PTS = 12
    for (let b = 0; b < 3; b++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PTS * 3), 3))
      const mat = new THREE.LineBasicMaterial({
        color: GREEN, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const line = new THREE.Line(geo, mat)
      line.visible = false
      line.frustumCulled = false
      this.group.add(line)
      const glows = []
      for (let e = 0; e < 2; e++) {
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 0.8),
          new THREE.MeshBasicMaterial({ map: this._glowTex, color: GREEN, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
        )
        glow.visible = false
        this.group.add(glow)
        glows.push(glow)
      }
      this._bolts.push({ line, mat, glows, nPts: N_PTS, life: 0, next: 0.3 + rng() * b })
    }

    this.addUpdater((dt) => {
      for (const bolt of this._bolts) {
        if (bolt.life > 0) {
          bolt.life -= dt
          if (bolt.life <= 0) {
            bolt.line.visible = false
            for (const gl of bolt.glows) gl.visible = false
          }
        } else {
          bolt.next -= dt
          if (bolt.next <= 0) {
            this._strikeBolt(bolt)
            const chargeBias = this._surge.phase === 'charge' ? 0.35 : 1
            bolt.next = (0.35 + rng() * 1.2) * chargeBias
          }
        }
      }
    })
  }

  _strikeBolt(bolt) {
    const rng = this._rng
    const pair = this._arcPairs[Math.floor(rng() * this._arcPairs.length)]
    const a = this._arcTips[pair[0]], b = this._arcTips[pair[1]]
    const pos = bolt.line.geometry.attributes.position
    const dir = new THREE.Vector3().subVectors(b, a)
    const perp = new THREE.Vector3(-dir.z, 0.6, dir.x).normalize()
    for (let i = 0; i < bolt.nPts; i++) {
      const t = i / (bolt.nPts - 1)
      const wob = (i === 0 || i === bolt.nPts - 1) ? 0 : (rng() - 0.5) * 0.9
      const sag = Math.sin(t * Math.PI) * (rng() - 0.3) * 0.4
      pos.setXYZ(i,
        a.x + dir.x * t + perp.x * wob,
        a.y + dir.y * t + perp.y * wob + sag,
        a.z + dir.z * t + perp.z * wob)
    }
    pos.needsUpdate = true
    const col = rng() < 0.55 ? GREEN : RED
    bolt.mat.color.setHex(col)
    bolt.line.visible = true
    bolt.life = 0.07 + rng() * 0.08
    for (let e = 0; e < 2; e++) {
      const p = e === 0 ? a : b
      const gl = bolt.glows[e]
      gl.material.color.setHex(col)
      gl.position.copy(p)
      gl.position.z += 0.05
      gl.scale.setScalar(0.7 + rng() * 0.7)
      gl.visible = true
    }
    if (rng() < 0.3) this.sfx('slide', { vol: 0.1, pitch: 1.7 + rng() * 0.5 })
  }

  _buildDrones() {
    // No crowd in the vault — quality.crowd scales the security detail instead.
    const crowdBudget = Math.max(0, Math.floor(this.quality.crowd ?? 60))
    const n = Math.min(6, Math.max(3, 3 + Math.floor(crowdBudget / 40)))
    const rng = this._rng
    for (let i = 0; i < n; i++) {
      const d = makeDrone(this._glowTex)
      const patrol = {
        cx: -8 + (i / Math.max(1, n - 1)) * 16,
        cz: -6.5 + (rng() - 0.5) * 2,
        rx: 1.6 + rng() * 1.6,
        rz: 0.8 + rng() * 0.8,
        y: 4.6 + rng() * 1.8,
        speed: 0.35 + rng() * 0.3,
        phase: rng() * Math.PI * 2,
      }
      d.group.position.set(patrol.cx, patrol.y, patrol.cz)
      this.group.add(d.group)
      this._drones.push({ ...d, patrol, alert: 0, alertX: 0, px: patrol.cx })
    }
    this.addUpdater((dt) => this._updateDrones(dt))
  }

  _updateDrones(dt) {
    const t = this._time
    for (const d of this._drones) {
      const p = d.patrol
      d.rotor.rotation.y += dt * 28
      d.alert = Math.max(0, d.alert - dt)
      const alerted = d.alert > 0

      const u = t * p.speed + p.phase
      let x = p.cx + Math.cos(u) * p.rx
      const z = p.cz + Math.sin(u * 2) * p.rz
      const y = p.y + Math.sin(t * 0.9 + p.phase) * 0.35
      if (alerted) {
        // converge on the incident, with panicked jitter
        x = THREE.MathUtils.lerp(x, THREE.MathUtils.clamp(d.alertX, -8, 8), 0.55)
        d.group.position.set(
          x + (this._rng() - 0.5) * 0.12,
          y - 0.6 + (this._rng() - 0.5) * 0.1,
          z + (this._rng() - 0.5) * 0.12
        )
      } else {
        d.group.position.set(x, y, z)
      }
      // bank into the direction of travel
      const vx = x - d.px
      d.px = x
      d.group.rotation.z = THREE.MathUtils.clamp(-vx * 6, -0.35, 0.35)

      // eye + searchlight mood
      const blink = alerted ? Math.sin(t * 22) > 0 : Math.sin(t * 5 + p.phase) > -0.3
      d.eyeMat.color.setHex(alerted ? (blink ? 0xff3344 : 0x550c14) : (blink ? GREEN : 0x0e4a24))
      d.beamMat.color.setHex(alerted ? 0xff6655 : 0xbfffd9)
      let beamOp = alerted ? 0.2 : 0.12
      // fade the searchlight cone as the camera nears it (KO cinematic dips
      // low) so the beam never slices the lens as a flat wedge
      const cam = this._camera
      if (cam?.position && d.beamCone) {
        d.beamCone.getWorldPosition(this._beamV)
        const near = d.beamCone.userData.cameraFade || 2.6
        const dist = this._beamV.distanceTo(cam.position)
        beamOp *= THREE.MathUtils.clamp((dist - near * 0.5) / near, 0, 1)
      }
      d.beamMat.opacity = beamOp
      // beam sweep — during a surge charge every light snaps to the sigil
      if (this._surge.phase === 'charge') {
        const dx = SIGIL_Z // aim roughly at center
        d.beamGroup.rotation.x = THREE.MathUtils.lerp(d.beamGroup.rotation.x, (d.group.position.z - dx) * 0.06, 0.2)
        d.beamGroup.rotation.z = THREE.MathUtils.lerp(d.beamGroup.rotation.z, d.group.position.x * 0.05, 0.2)
      } else {
        d.beamGroup.rotation.x = Math.sin(t * 0.7 + p.phase) * 0.3
        d.beamGroup.rotation.z = Math.cos(t * 0.55 + p.phase * 2) * 0.3
      }
    }
  }

  _alertDrones(seconds, x) {
    for (const d of this._drones) {
      d.alert = Math.max(d.alert, seconds * (0.75 + this._rng() * 0.5))
      d.alertX = x + (this._rng() - 0.5) * 3
    }
  }

  _buildEmbers() {
    const n = Math.max(8, Math.round(26 * (this.quality.particleScale ?? 0.75)))
    const geo = new THREE.PlaneGeometry(0.11, 0.11)
    const mats = [
      new THREE.MeshBasicMaterial({ map: this._glowTex, color: 0xffa044, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      new THREE.MeshBasicMaterial({ map: this._glowTex, color: 0xff5540, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      new THREE.MeshBasicMaterial({ map: this._glowTex, color: 0x6cff9e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    ]
    const rng = this._rng
    this._embers = []
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mats[Math.floor(rng() * mats.length)])
      m.frustumCulled = false
      this.group.add(m)
      this._embers.push({
        mesh: m,
        t: rng(),
        dur: 2.2 + rng() * 2.2,
        ang: rng() * Math.PI * 2,
        rad: 0.5 + rng() * 4.5,
        wob: rng() * Math.PI * 2,
        rise: 2.6 + rng() * 1.6,
        size: 0.7 + rng() * 1.1,
      })
    }
    this.addUpdater((dt) => {
      const boost = this._surge.phase === 'charge' ? 2.6 : 1 + this._pulseBoost * 0.5
      for (const e of this._embers) {
        e.t += (dt / e.dur) * boost
        if (e.t >= 1) {
          e.t = 0
          e.ang = rng() * Math.PI * 2
          e.rad = 0.5 + rng() * 4.5
        }
        const k = e.t
        e.mesh.position.set(
          Math.cos(e.ang) * e.rad + Math.sin(k * 9 + e.wob) * 0.25,
          0.15 + k * e.rise,
          SIGIL_Z + Math.sin(e.ang) * e.rad * 0.8
        )
        e.mesh.scale.setScalar(Math.max(0.01, Math.sin(k * Math.PI) * e.size))
      }
    })
  }

  _buildSurgeMeshes() {
    // expanding floor ring
    this._waveMat = new THREE.MeshBasicMaterial({
      color: 0xaaffcc, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    this._waveMesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 48), this._waveMat)
    this._waveMesh.rotation.x = -Math.PI / 2
    this._waveMesh.position.set(0, 0.07, SIGIL_Z)
    this._waveMesh.visible = false
    this._waveMesh.frustumCulled = false
    this.group.add(this._waveMesh)

    // vertical column flash at detonation
    this._columnMat = new THREE.MeshBasicMaterial({
      color: 0xccffdd, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    this._columnMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 9, 12, 1, true), this._columnMat)
    this._columnMesh.position.set(0, 4.5, SIGIL_Z)
    this._columnMesh.visible = false
    this.group.add(this._columnMesh)
    this._columnLife = 0
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

    // v2.0 free-roam: the inventory scatters across the open vault floor
    // (center lane kept mostly clear).

    // gold bar pallets — extremely stealable
    place(makeGoldStack(rng, this._ingotGeo), -6.8, -3.9, 0.3, { shape: 'box', mass: 8, health: 28 })
    place(makeGoldStack(rng, this._ingotGeo, { layers: 2 }), 6.9, 3.6, -0.45, { shape: 'box', mass: 7, health: 24 })

    // coin pallet
    place(makeCoinPallet(rng), -4.4, 4.0, 0.6, { shape: 'box', mass: 6, health: 20 })

    // conduit boxes — these spark when they die
    const cA = place(makeConduitBox(), 4.9, -4.1, 0.5, { shape: 'box', mass: 5, health: 18 })
    const cB = place(makeConduitBox(), -7.7, 3.2, -0.35, { shape: 'box', mass: 5, health: 18 })
    if (cA) this._conduitHandles.add(cA)
    if (cB) this._conduitHandles.add(cB)

    // the stability console. 3% and holding. Probably fine.
    const con = makeStabilityConsole()
    place(con.group, 8.0, -2.8, -0.7, { shape: 'box', mass: 9, health: 32 })
    this.addUpdater(() => {
      con.blink.material.opacity = Math.sin(this._time * 7) > 0.2 ? 0.3 : 0.02
    })

    // -- spark burst pool for conduit deaths
    const sparkGeo = new THREE.PlaneGeometry(0.14, 0.14)
    const sparkMat = new THREE.MeshBasicMaterial({
      map: this._glowTex, color: 0xffe89a, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    this._sparks = []
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat)
      m.visible = false
      m.frustumCulled = false
      this.group.add(m)
      this._sparks.push({ mesh: m, vel: new THREE.Vector3() })
    }
    this._sparkLife = 0
    this.addUpdater((dt) => {
      if (this._sparkLife <= 0) return
      this._sparkLife -= dt
      const done = this._sparkLife <= 0
      for (const s of this._sparks) {
        if (done) { s.mesh.visible = false; continue }
        s.vel.y -= 18 * dt
        s.mesh.position.addScaledVector(s.vel, dt)
        s.mesh.scale.setScalar(Math.max(0.01, this._sparkLife * 2.4))
      }
    })
  }

  _sparkBurst(pos) {
    this._sparkLife = 0.45
    for (const s of this._sparks) {
      s.mesh.visible = true
      s.mesh.position.set(pos.x, pos.y + 0.4, pos.z)
      s.vel.set((this._rng() - 0.5) * 7, 2.5 + this._rng() * 5, (this._rng() - 0.5) * 7)
      s.mesh.scale.setScalar(1)
    }
    this.sfx('explosion', { vol: 0.45, pitch: 1.6 })
    this.emit('camera:shake', { mag: 0.25 })
    // nearest bolt celebrates
    if (this._bolts.length) this._strikeBolt(this._bolts[0])
  }

  _wireEvents() {
    // conduit boxes go out with a bang
    this.listen('physics:break', (e) => {
      if (!e) return
      if (e.handle && this._conduitHandles.has(e.handle)) {
        this._sparkBurst(e.pos || { x: 0, y: 0, z: 0 })
        this._conduitHandles.delete(e.handle)
      }
      this._instability += 1.2
      this._pulseBoost = Math.min(2, this._pulseBoost + 0.5)
    })
    // the core feeds on violence
    this.listen('fighter:hit', (e) => {
      this._instability += (e?.damage || 0) * 0.045
      this._pulseBoost = Math.min(2, this._pulseBoost + 0.12 + (e?.counter ? 0.3 : 0))
    })
    this.listen('combo', (e) => {
      if ((e?.hits || 0) >= 5) for (const bolt of this._bolts) this._strikeBolt(bolt)
    })
    this.listen('fighter:ko', () => {
      this._instability += 5
      this._pulseBoost = 2
      this._alertDrones(3, 0)
      for (const p of this._pillars) p.forceCollapse()
    })
    this.listen('round:end', () => {
      this._instability += 4
      this._alertDrones(2, 0)
    })
  }

  // -- edge plate failure ---------------------------------------------------

  _updatePlates(dt) {
    // passive decay: the reserve destabilizes just by existing
    this._instability += dt * 0.22

    if (this._instability >= this._plateThreshold) {
      this._plateThreshold += PLATE_STEP
      const idx = this._plateOrder.find((i) => this._plates[i].state === 'intact')
      if (idx !== undefined) this._crackPlate(this._plates[idx])
    }

    for (const p of this._plates) {
      if (p.state === 'intact' || p.state === 'gone') continue
      if (p.state === 'cracking') {
        p.t -= dt
        // structural denial phase: rattle in place
        p.mesh.position.x = p.baseX + (this._rng() - 0.5) * 0.04
        p.mesh.position.z = p.baseZ + (this._rng() - 0.5) * 0.04
        p.mesh.rotation.y = p.baseRy + (this._rng() - 0.5) * 0.03
        p.crack.material.opacity = Math.min(1, p.crack.material.opacity + dt * 2.2)
        if (p.t <= 0) {
          p.state = 'falling'
          p.vy = 0.5
          // reveal the hole the plate was politely covering
          const hole = new THREE.Mesh(
            new THREE.PlaneGeometry(1.86, 1.26),
            new THREE.MeshBasicMaterial({ map: this._holeTex, depthWrite: false })
          )
          hole.rotation.x = -Math.PI / 2
          hole.rotation.z = -p.baseRy
          hole.position.set(p.baseX, 0.02, p.baseZ)
          this.group.add(hole)
          this.sfx('break', { vol: 0.55, pitch: 0.8 })
          this.emit('camera:shake', { mag: 0.3 })
          this.emit('arena:platefall', { x: p.baseX, z: p.baseZ, remaining: this._plates.filter((q) => q.state === 'intact').length })
        }
      } else if (p.state === 'falling') {
        p.vy -= 22 * dt
        p.mesh.position.y += p.vy * dt
        p.mesh.rotation.x += p.spin * dt
        if (p.mesh.position.y < -1.2) {
          p.mat.opacity = Math.max(0, p.mat.opacity - dt * 2.5)
          p.crack.material.opacity = p.mat.opacity
        }
        if (p.mesh.position.y < -7) {
          p.state = 'gone'
          p.mesh.visible = false
        }
      }
    }
  }

  _crackPlate(p) {
    if (!p || p.state !== 'intact') return
    p.state = 'cracking'
    p.t = 0.9
    p.mat.color.setHex(0x8a7f70)
    this.sfx('thud', { vol: 0.35, pitch: 1.3 })
  }

  // -- hazard: CORE SURGE ---------------------------------------------------

  _updateSurge(dt) {
    const s = this._surge
    if (s.phase === 'idle') {
      s.t -= dt
      if (s.t <= 0) {
        s.phase = 'charge'
        s.chargeT = 0
        s.whineAcc = 0
        this.sfx('slide', { vol: 0.35, pitch: 0.55 })
        this.emit('arena:surge', { phase: 'charge', pos: { x: 0, y: 0, z: SIGIL_Z } })
        this._alertDrones(SURGE_CHARGE + 1.5, 0)
      }
    } else if (s.phase === 'charge') {
      s.chargeT += dt
      const k = Math.min(1, s.chargeT / SURGE_CHARGE)
      // rising whine — pitch tracks the charge
      s.whineAcc += dt
      if (s.whineAcc >= 0.22) {
        s.whineAcc = 0
        this.sfx('slide', { vol: 0.3 + k * 0.2, pitch: 0.6 + k * 1.5 })
      }
      if (k > 0.72 && !s.preShook) {
        s.preShook = true
        this.emit('camera:shake', { mag: 0.2 })
      }
      if (s.chargeT >= SURGE_CHARGE) this._detonate()
    } else if (s.phase === 'wave') {
      s.waveR += dt * SURGE_WAVE_SPEED
      this._waveMesh.scale.setScalar(Math.max(0.01, s.waveR))
      this._waveMat.opacity = Math.max(0, 1.15 - s.waveR / SURGE_MAX_R)

      // fighters: the wave catches you where you stand — unless you don't.
      // The surge ring is radial (XZ) from the sigil, matching the visual.
      const fighters = this._getFighters()
      for (let slot = 0; slot < fighters.length; slot++) {
        const f = fighters[slot]
        const p = f?.pos
        if (!p || s.fHit[slot]) continue
        const d = Math.hypot(p.x, (p.z ?? 0) - SIGIL_Z)
        if (s.waveR >= d) {
          s.fHit[slot] = true
          if (p.y < SURGE_SAFE_HEIGHT && !SKIP_STATES.has(f.state)) this._surgeLaunch(f)
        }
      }
      // props ride the wave too
      try {
        for (const h of this.props) {
          const m = h?.mesh
          if (!m || !h.body || s.propHit.has(h)) continue
          const d = Math.hypot(m.position.x, m.position.z - SIGIL_Z)
          if (s.waveR >= d && m.position.y < 1.6) {
            s.propHit.add(h)
            const dir = Math.atan2(m.position.z - SIGIL_Z, m.position.x || 0.01)
            this.physics?.impulse?.(h, [Math.cos(dir) * 3.5, 7 + this._rng() * 6, Math.sin(dir) * 2.5])
          }
        }
      } catch (e) { /* props are optional casualties */ }

      if (s.waveR >= SURGE_MAX_R) {
        s.phase = 'idle'
        s.t = SURGE_INTERVAL - 1 + this._rng() * 3
        this._waveMesh.visible = false
        this._waveMat.opacity = 0
        if (s.victims > 0 && !this._announcedVictim) {
          this._announcedVictim = true
          this.emit('announcer', { line: 'PERMANENTLY LIQUIDATED!' })
        }
      }
    }

    // column flash decay
    if (this._columnLife > 0) {
      this._columnLife -= dt
      this._columnMat.opacity = Math.max(0, this._columnLife * 2.8)
      this._columnMesh.scale.x = this._columnMesh.scale.z = 1 + (0.35 - this._columnLife) * 2
      if (this._columnLife <= 0) this._columnMesh.visible = false
    }
  }

  _detonate() {
    const s = this._surge
    s.phase = 'wave'
    s.waveR = 0.6
    s.fHit = [false, false]
    s.propHit = new Set()
    s.victims = 0
    s.preShook = false

    this._waveMesh.visible = true
    this._waveMesh.scale.setScalar(0.6)
    this._waveMat.opacity = 1.15
    this._columnMesh.visible = true
    this._columnMesh.scale.set(1, 1, 1)
    this._columnLife = 0.35
    this._pulseBoost = 2

    this.sfx('explosion', { vol: 0.9, pitch: 0.85 })
    this.sfx('coins_burst', { vol: 0.5 })
    this.emit('camera:shake', { mag: 0.85 })
    this.emit('caption', { text: 'RESERVE UNSTABLE' })
    this.emit('arena:surge', { phase: 'detonate', pos: { x: 0, y: 0, z: SIGIL_Z } })
    if (!this._announcedSurge) {
      this._announcedSurge = true
      this.emit('announcer', { line: 'THE RESERVE IS UNSTABLE!' })
    }
    this._instability += 2
    for (const bolt of this._bolts) this._strikeBolt(bolt)
  }

  _surgeLaunch(f) {
    try {
      // radial (XZ) shove away from the sigil, matching the expanding ring
      const dx = f.pos.x || (this._rng() - 0.5)
      const dz = (f.pos.z ?? 0) - SIGIL_Z
      const d = Math.hypot(dx, dz) || 1
      const dir = dx >= 0 ? 1 : -1
      f.vel.y = Math.max(f.vel.y ?? 0, 10)
      f.vel.x = (f.vel.x ?? 0) + (dx / d) * (1.8 + this._rng() * 1.6)
      if (typeof f.vel.z === 'number') f.vel.z += (dz / d) * (1.8 + this._rng() * 1.6)
      f.squash?.(-0.35)
      if (f.state !== 'attack' && typeof f.setState === 'function') {
        f.tumbleRate = dir * (5 + this._rng() * 4)
        f.setState('launched')
      }
      this._surge.victims++
      this.sfx('launch', { vol: 0.7, pitch: 1.1 })
    } catch (e) { /* fighter internals unavailable — the wave stays visual */ }
  }

  // Best-effort access to the live fighters (combat owns them; stay defensive).
  _getFighters() {
    try {
      const scr = this.physics?.game?.screens?.current
      const fs = scr?.fighters
      if (Array.isArray(fs) && fs.length && fs[0]?.pos) return fs
    } catch (e) { /* combat internals unavailable */ }
    return []
  }

  // -- core pulse -----------------------------------------------------------

  _updatePulse(dt) {
    this._pulseBoost = Math.max(0, this._pulseBoost - dt * 1.1)
    const s = this._surge
    const chargeK = s.phase === 'charge' ? Math.min(1, s.chargeT / SURGE_CHARGE) : 0
    const freq = 2.1 + chargeK * 9
    const pulse = 0.5 + 0.5 * Math.sin(this._time * freq)
    const amp = 1 + this._pulseBoost * 0.5 + chargeK * 1.4

    // one throb, everywhere at once: light, sigil, seam, hemisphere
    this._coreLight.intensity = (0.7 + pulse * 0.8) * amp
    this._coreLight.color.setHex(chargeK > 0.55 ? 0xd4ffe4 : 0x66ffb0)
    if (this._rig?.hemi) this._rig.hemi.intensity = 0.55 + pulse * 0.14 * amp
    this._sigilEmblemMat.opacity = 0.55 + pulse * 0.3 + chargeK * 0.5
    this._sigilRingMatA.opacity = 0.3 + pulse * 0.25 + chargeK * 0.6
    this._sigilRingMatB.opacity = 0.2 + (1 - pulse) * 0.2 + chargeK * 0.4
    this._seamMat.opacity = 0.35 + pulse * 0.3 + chargeK * 0.4
    this._sigilRingA.rotation.z += dt * (0.3 + chargeK * 4)
    this._sigilRingB.rotation.z -= dt * (0.45 + chargeK * 5)
    const sigScale = 1 + chargeK * 0.2 + pulse * 0.015
    this._sigil.scale.setScalar(sigScale)
  }

  // -- ArenaInstance hooks --------------------------------------------------

  // Additive hook (MatchScreen calls it defensively): the camera lets the
  // drone searchlight cones fade out before they cross the lens.
  setCamera(camera) { this._camera = camera || null }

  update(dt) {
    this._time += dt
    this._updatePulse(dt)
    this._updateSurge(dt)
    this._updatePlates(dt)
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    // unauthorized airborne asset detected
    this._alertDrones(2.6, fighter?.pos?.x ?? 0)
    this._pulseBoost = Math.min(2, this._pulseBoost + 0.8)
    for (const bolt of this._bolts) if (bolt.life <= 0) this._strikeBolt(bolt)
    this.sfx('thud', { vol: 0.25, pitch: 0.7 })
    if (this.physics?.presetName === 'unhinged') {
      // the vault takes structural offense
      const next = this._plateOrder.find((i) => this._plates[i].state === 'intact')
      if (next !== undefined) this._crackPlate(this._plates[next])
      for (const p of this._pillars) if (this._rng() < 0.5) p.forceCollapse()
      this.sfx('boing', { vol: 0.5 })
    }
  }
}

export const PermanentReserveCore = {
  id: 'permanent-reserve-core',
  name: 'PERMANENT RESERVE CORE',
  music: 'battle_reserve_core',
  build(ctx) { return new PermanentReserveCoreArena(ctx) },
}
