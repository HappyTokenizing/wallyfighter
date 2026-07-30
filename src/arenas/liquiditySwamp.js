// ============================================================================
// LIQUIDITY SWAMP — PeePee's home turf (story round 2). A murky green trading
// swamp: a creaky wooden dock over dark teal water, giant lily pads, drooping
// low-poly trees dangling 'APY %' vine-signs, bubbling suspicious pools, a
// half-sunken vault safe, and a crowd of frogs who croak at every candle.
//
// Signature hazard: slime geysers at x = ±6 erupt every ~7 seconds. Stand on
// one when it pops and you eat a small upward launch + the caption 'SLIPPAGE'.
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, makeCrateMesh,
} from './ArenaBase.js'

const WATER_Y = -0.55
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
const easeInOut = (t) => t * t * (3 - 2 * t)

// ---------------------------------------------------------------------------
// module-private helpers
// ---------------------------------------------------------------------------

// Merge position+normal-only geometries into one (for the instanced frogs).
function mergeSimple(geoms) {
  const flat = geoms.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    if (n !== g) g.dispose()
    return n
  })
  let total = 0
  for (const g of flat) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  let off = 0
  for (const g of flat) {
    pos.set(g.attributes.position.array, off * 3)
    nor.set(g.attributes.normal.array, off * 3)
    off += g.attributes.position.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return out
}

// Big-texel weathered dock planks (planks run along X on the box top face).
function makePlankTexture(rng) {
  return canvasTexture(512, 256, (c, W, H) => {
    const rows = 8
    const rh = H / rows
    for (let r = 0; r < rows; r++) {
      const j = (rng() - 0.5) * 26
      const g = 12 + rng() * 20
      c.fillStyle = `rgb(${Math.round(104 + j)},${Math.round(82 + j * 0.7 + g * 0.4)},${Math.round(48 + j * 0.4)})`
      c.fillRect(0, r * rh, W, rh)
      // plank end seams (staggered)
      c.fillStyle = 'rgba(24,16,8,0.85)'
      const seam = ((r * 0.37 + rng() * 0.2) % 1) * W
      c.fillRect(seam, r * rh, 5, rh)
      // grain streaks
      c.strokeStyle = 'rgba(40,28,12,0.35)'
      c.lineWidth = 2
      for (let s = 0; s < 5; s++) {
        const y = r * rh + 4 + rng() * (rh - 8)
        c.beginPath()
        c.moveTo(rng() * W * 0.4, y)
        c.lineTo(W * (0.5 + rng() * 0.5), y + (rng() - 0.5) * 4)
        c.stroke()
      }
      // the odd knot
      if (rng() < 0.6) {
        c.fillStyle = 'rgba(42,28,12,0.7)'
        c.beginPath()
        c.ellipse(rng() * W, r * rh + rh * 0.5, 5 + rng() * 4, 3 + rng() * 3, 0, 0, Math.PI * 2)
        c.fill()
      }
      // nails
      c.fillStyle = 'rgba(180,180,170,0.8)'
      for (let n = 0; n < 6; n++) c.fillRect(20 + n * (W / 6) + (rng() - 0.5) * 10, r * rh + rh * 0.28, 4, 4)
      // gap between planks
      c.fillStyle = 'rgba(16,12,6,0.95)'
      c.fillRect(0, r * rh + rh - 4, W, 4)
    }
    // moss creeping in from the edges
    for (let i = 0; i < 26; i++) {
      const edge = rng() < 0.5
      const x = rng() * W
      const y = edge ? rng() * H * 0.14 : H - rng() * H * 0.14
      c.fillStyle = `rgba(${70 + rng() * 30},${120 + rng() * 40},${50 + rng() * 20},0.35)`
      c.beginPath()
      c.ellipse(x, y, 8 + rng() * 16, 4 + rng() * 8, 0, 0, Math.PI * 2)
      c.fill()
    }
  }, { repeat: [2.2, 1.5] })
}

// Dark teal water with lazy painted ripples.
function makeWaterTexture(rng) {
  return canvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = '#0f3530'
    c.fillRect(0, 0, W, H)
    // murky depth blotches
    for (let i = 0; i < 22; i++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(10,42,36,0.5)' : 'rgba(22,64,50,0.45)'
      c.beginPath()
      c.ellipse(rng() * W, rng() * H, 18 + rng() * 40, 10 + rng() * 22, 0, 0, Math.PI * 2)
      c.fill()
    }
    // ripple strokes
    c.lineWidth = 3
    for (let i = 0; i < 30; i++) {
      const y = rng() * H
      const x = rng() * W
      const len = 16 + rng() * 42
      c.strokeStyle = `rgba(70,140,110,${0.18 + rng() * 0.22})`
      c.beginPath()
      c.moveTo(x, y)
      c.quadraticCurveTo(x + len * 0.5, y + (rng() - 0.5) * 5, x + len, y)
      c.stroke()
    }
    // suspicious green scum flecks
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(110,180,60,${0.12 + rng() * 0.2})`
      c.fillRect(rng() * W, rng() * H, 3 + rng() * 5, 2 + rng() * 3)
    }
  }, { repeat: [22, 22] })
}

// A vine (chunky segmented stalk) with a small APY sign swinging at the end.
// Pivot is at the hang point; rotate the returned group to sway it.
function makeVineSign(rng, text) {
  const pivot = new THREE.Group()
  pivot.name = 'vineSign'
  const len = 1.2 + rng() * 1.2
  const vineMat = flatMat(0x3f6a33)
  const segs = 3
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.055, len / segs + 0.04, 0.055), vineMat)
    seg.position.set(Math.sin(i * 1.7) * 0.04, -(i + 0.5) * (len / segs), 0)
    seg.rotation.z = Math.sin(i * 2.1) * 0.12
    pivot.add(seg)
  }
  const sign = makeSign(text, {
    w: 1.2, h: 0.44, depth: 0.06, px: 72,
    bg: '#16301f', fg: '#8aff3c', border: '#4f9b3a', stroke: '#0a1a0e', sideColor: 0x122515,
  })
  sign.position.y = -len - 0.25
  sign.rotation.z = (rng() - 0.5) * 0.2
  pivot.add(sign)
  return pivot
}

// Drooping low-poly swamp tree on a mud islet. Returns { group, vinePivots }.
function makeSwampTree(rng, opts = {}) {
  const s = opts.scale ?? 1
  const g = new THREE.Group()
  g.name = 'swampTree'
  const vinePivots = []

  // mud islet so the trunk isn't growing out of open water
  const islet = new THREE.Mesh(new THREE.CylinderGeometry(1.7 * s, 2.1 * s, 0.5, 9), flatMat(0x3a3222))
  islet.position.y = WATER_Y - 0.1
  g.add(islet)

  // bent trunk: stacked tapered segments, each leaning a bit more
  const trunkMat = flatMat(0x4a3a26)
  const segDefs = [
    { h: 1.8 * s, r0: 0.42 * s, r1: 0.3 * s },
    { h: 1.5 * s, r0: 0.3 * s, r1: 0.2 * s },
    { h: 1.2 * s, r0: 0.2 * s, r1: 0.12 * s },
  ]
  let tilt = (rng() - 0.5) * 0.36
  const base = new THREE.Vector3(0, WATER_Y + 0.1, 0)
  const up = new THREE.Vector3()
  let holder = null
  for (const sd of segDefs) {
    const seg = new THREE.Group()
    seg.position.copy(base)
    seg.rotation.z = tilt
    const m = new THREE.Mesh(new THREE.CylinderGeometry(sd.r1, sd.r0, sd.h, 7), trunkMat)
    m.position.y = sd.h / 2
    seg.add(m)
    g.add(seg)
    up.set(0, sd.h, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
    base.add(up)
    tilt += (rng() - 0.2) * 0.32 // droop bias — swamp trees have given up a little
    holder = seg
  }

  // canopy: fat dark blobs sagging at the edges
  const canopy = new THREE.Group()
  canopy.position.copy(base)
  const greens = [0x2e5d33, 0x28512c, 0x386b38, 0x224726]
  const blobs = 3 + Math.floor(rng() * 2)
  for (let i = 0; i < blobs; i++) {
    const r = (1.1 + rng() * 0.9) * s
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), flatMat(greens[Math.floor(rng() * greens.length)]))
    blob.scale.y = 0.62
    const a = rng() * Math.PI * 2
    blob.position.set(Math.cos(a) * r * 0.7, 0.2 + rng() * 0.5 - (i === 0 ? 0 : 0.35), Math.sin(a) * r * 0.55)
    canopy.add(blob)
  }
  g.add(canopy)

  // hanging moss strips
  const mossMat = flatMat(0x74a05a, { transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  for (let i = 0; i < 3; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.8 + rng() * 0.9), mossMat)
    const a = rng() * Math.PI * 2
    strip.position.set(canopy.position.x + Math.cos(a) * 1.3 * s, canopy.position.y - 0.9, canopy.position.z + Math.sin(a) * 1.1 * s)
    strip.rotation.y = rng() * Math.PI
    g.add(strip)
  }

  // APY vine-signs dangling off the canopy
  const nVines = opts.vineTexts?.length ?? 0
  for (let i = 0; i < nVines; i++) {
    const pivot = makeVineSign(rng, opts.vineTexts[i])
    const a = (i / Math.max(1, nVines)) * Math.PI * 1.4 + rng()
    pivot.position.set(canopy.position.x + Math.cos(a) * 1.5 * s, canopy.position.y - 0.15, canopy.position.z + Math.sin(a) * 1.0 * s + 0.4)
    g.add(pivot)
    vinePivots.push(pivot)
  }

  void holder
  return { group: g, vinePivots }
}

// Stone frog statue (breakable prop). Group origin at its base, ~1.15 m tall.
function makeFrogStatue(rng) {
  const g = new THREE.Group()
  g.name = 'frogStatue'
  const stone = flatMat(0x8a967c)
  const mossStone = flatMat(0x5e7a4a)

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.26, 8), flatMat(0x6f7a68))
  plinth.position.y = 0.13
  g.add(plinth)

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), stone)
  body.scale.set(1.15, 0.8, 1.05)
  body.position.y = 0.56
  g.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), stone)
  head.scale.set(1.1, 0.72, 0.9)
  head.position.set(0, 0.87, 0.12)
  g.add(head)

  for (const sx of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), stone)
    eye.position.set(sx, 1.02, 0.2)
    g.add(eye)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), flatMat(0x2b3328))
    pupil.position.set(sx, 1.03, 0.3)
    g.add(pupil)
  }
  for (const sx of [-0.36, 0.36]) {
    const leg = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), stone)
    leg.scale.set(1, 0.7, 1.35)
    leg.position.set(sx, 0.32, 0.22)
    g.add(leg)
  }
  // mossy cap — even the statues are going green
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), mossStone)
  moss.scale.set(1.4, 0.4, 1.2)
  moss.position.set(0.04, 1.1, 0.02)
  g.add(moss)
  void rng
  return g
}

// Wooden barrel of extremely suspicious yield (breakable prop).
function makeSludgeBarrel(rng, label = 'APY 6969%') {
  const tex = canvasTexture(192, 96, (c, W, H) => {
    c.fillStyle = '#6d4f2c'
    c.fillRect(0, 0, W, H)
    // staves
    c.strokeStyle = 'rgba(40,26,10,0.6)'
    c.lineWidth = 3
    for (let i = 1; i < 10; i++) {
      c.beginPath(); c.moveTo((W / 10) * i, 0); c.lineTo((W / 10) * i, H); c.stroke()
    }
    // steel bands
    c.fillStyle = '#3c4148'
    c.fillRect(0, 8, W, 9)
    c.fillRect(0, H - 17, W, 9)
    // green ooze dribbling over the rim
    for (let i = 0; i < 7; i++) {
      const x = rng() * W
      c.fillStyle = 'rgba(110,220,60,0.85)'
      c.fillRect(x, 0, 5 + rng() * 4, 12 + rng() * 26)
      c.beginPath(); c.arc(x + 4, 14 + rng() * 26, 4, 0, Math.PI * 2); c.fill()
    }
    // stencil
    c.font = '900 20px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = 'rgba(30,18,4,0.9)'
    c.fillText(label, W / 2, H * 0.58)
  })
  const side = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  const cap = flatMat(0x55401f)
  const g = new THREE.Group()
  g.name = 'sludgeBarrel'
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.95, 10), [side, cap, cap])
  body.position.y = 0.475
  g.add(body)
  const goo = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x6ee03c, emissive: 0x2f8a12, emissiveIntensity: 0.7, flatShading: true })
  )
  goo.scale.set(1, 0.35, 1)
  goo.position.y = 0.97
  g.add(goo)
  return g
}

// Tiny personal safe someone dropped on the dock (breakable prop).
function makeMiniVault() {
  const face = canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#39424e'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#222932'
    c.lineWidth = 6
    c.strokeRect(4, 4, W - 8, H - 8)
    // dial
    c.fillStyle = '#c9cfd8'
    c.beginPath(); c.arc(W * 0.38, H * 0.44, 15, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#39424e'
    c.lineWidth = 3
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      c.beginPath()
      c.moveTo(W * 0.38 + Math.cos(a) * 9, H * 0.44 + Math.sin(a) * 9)
      c.lineTo(W * 0.38 + Math.cos(a) * 14, H * 0.44 + Math.sin(a) * 14)
      c.stroke()
    }
    // handle
    c.fillStyle = '#f5c33b'
    c.fillRect(W * 0.66, H * 0.36, 10, 24)
    // sticky note with the combination, obviously
    c.save()
    c.translate(W * 0.52, H * 0.8)
    c.rotate(-0.12)
    c.fillStyle = '#fff3a0'
    c.fillRect(-26, -12, 52, 24)
    c.fillStyle = '#5a4a10'
    c.font = '700 10px monospace'
    c.textAlign = 'center'
    c.fillText('PW: hunter2', 0, 3)
    c.restore()
  })
  const steel = flatMat(0x4c5866)
  const g = new THREE.Group()
  g.name = 'miniVault'
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.74, 0.6),
    [steel, steel, steel, steel, new THREE.MeshLambertMaterial({ map: face, flatShading: true }), steel]
  )
  body.position.y = 0.37
  g.add(body)
  const feet = flatMat(0x2c333c)
  for (const [fx, fz] of [[-0.26, 0.22], [0.26, 0.22], [-0.26, -0.22], [0.26, -0.22]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 6), feet)
    foot.position.set(fx, 0.03, fz)
    g.add(foot)
  }
  return g
}

// Half-sunken bank vault out in the water (decor). Door ajar, dignity gone.
function makeSunkenVault(rng) {
  const g = new THREE.Group()
  g.name = 'sunkenVault'
  const steel = flatMat(0x4c5866)
  const face = canvasTexture(160, 160, (c, W, H) => {
    c.fillStyle = '#454f5c'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#2b323c'
    c.lineWidth = 10
    c.strokeRect(6, 6, W - 12, H - 12)
    c.fillStyle = '#c9cfd8'
    c.beginPath(); c.arc(W / 2, H / 2, 30, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#454f5c'
    c.lineWidth = 5
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      c.beginPath()
      c.moveTo(W / 2 + Math.cos(a) * 18, H / 2 + Math.sin(a) * 18)
      c.lineTo(W / 2 + Math.cos(a) * 28, H / 2 + Math.sin(a) * 28)
      c.stroke()
    }
    c.font = '900 18px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.fillStyle = '#ffd83d'
    c.fillText('SWAMP BANK', W / 2, 26)
    c.font = '700 12px Arial, sans-serif'
    c.fillStyle = '#9fe8b0'
    c.fillText('FDIC: LOL', W / 2, H - 16)
    // rust streaks
    for (let i = 0; i < 8; i++) {
      c.fillStyle = 'rgba(140,80,40,0.4)'
      c.fillRect(rng() * W, rng() * H * 0.5, 4, 20 + rng() * 40)
    }
  })
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.4, 2.2),
    [steel, steel, steel, steel, new THREE.MeshLambertMaterial({ map: face, flatShading: true }), steel]
  )
  g.add(body)
  // door swung open on its hinge
  const doorPivot = new THREE.Group()
  doorPivot.position.set(-1.15, 0, 1.12)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 0.14), flatMat(0x59646f))
  door.position.set(0.95, 0, 0.07)
  doorPivot.add(door)
  doorPivot.rotation.y = -0.85
  g.add(doorPivot)
  // moss crown
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 5), flatMat(0x5e7a4a))
  moss.scale.set(1.5, 0.35, 1.3)
  moss.position.set(0.3, 1.25, -0.2)
  g.add(moss)
  g.rotation.set(0.3, -0.55, 0.14)
  return g
}

// The giant frog idol watching over the dock. Eyes glow. It judges.
function makeFrogIdol() {
  const g = new THREE.Group()
  g.name = 'frogIdol'
  const stone = flatMat(0x6f7d63)
  const dark = flatMat(0x55614c)

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 1.0, 9), dark)
  plinth.position.y = 0.5
  g.add(plinth)

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 6), stone)
  body.scale.set(1.2, 0.85, 1.05)
  body.position.y = 2.35
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 7, 5), stone)
  head.scale.set(1.15, 0.75, 0.9)
  head.position.set(0, 3.6, 0.4)
  g.add(head)
  // wide disapproving mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.5), dark)
  mouth.position.set(0, 3.3, 1.15)
  mouth.rotation.x = 0.25
  g.add(mouth)
  const eyeMats = []
  for (const sx of [-0.62, 0.62]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), stone)
    socket.position.set(sx, 4.2, 0.72)
    g.add(socket)
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x9fff4a, emissive: 0x4fc71c, emissiveIntensity: 1, flatShading: true })
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), eyeMat)
    eye.position.set(sx, 4.24, 1.0)
    g.add(eye)
    eyeMats.push(eyeMat)
  }
  for (const sx of [-1.5, 1.5]) {
    const leg = new THREE.Mesh(new THREE.SphereGeometry(0.62, 6, 5), stone)
    leg.scale.set(1, 0.7, 1.4)
    leg.position.set(sx, 1.4, 0.7)
    g.add(leg)
  }
  const plaque = makeSign('IN POND WE TRUST', { w: 2.6, h: 0.5, depth: 0.08, px: 64, bg: '#2c3626', fg: '#c8e89a', border: '#7a9b58', sideColor: 0x222b1d })
  plaque.position.set(0, 0.62, 2.42)
  plaque.rotation.x = -0.12
  g.add(plaque)
  return { group: g, eyeMats }
}

// Instanced frog spectators, each bouncing on its own lily pad.
// Returns { group, count, update(dt), cheer(strength), diveRandom(n) }.
// Disposal is handled by the arena's recursive disposeObject pass.
function buildFrogCrowd(opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 30))
  const rng = opts.rng || makeRng(0xf706)

  const group = new THREE.Group()
  group.name = 'frogCrowd'

  // frog geometry: body + head + eye bulges + haunches, merged for instancing
  const bodyG = new THREE.SphereGeometry(0.3, 7, 5); bodyG.scale(1.2, 0.78, 1.05); bodyG.translate(0, 0.24, 0)
  const headG = new THREE.SphereGeometry(0.21, 6, 5); headG.scale(1.12, 0.75, 0.9); headG.translate(0, 0.44, 0.12)
  const eyeL = new THREE.SphereGeometry(0.085, 5, 4); eyeL.translate(-0.12, 0.56, 0.18)
  const eyeR = new THREE.SphereGeometry(0.085, 5, 4); eyeR.translate(0.12, 0.56, 0.18)
  const legL = new THREE.SphereGeometry(0.12, 5, 4); legL.scale(1, 0.7, 1.35); legL.translate(-0.31, 0.1, -0.02)
  const legR = new THREE.SphereGeometry(0.12, 5, 4); legR.scale(1, 0.7, 1.35); legR.translate(0.31, 0.1, -0.02)
  const frogGeo = mergeSimple([bodyG, headG, eyeL, eyeR, legL, legR])
  const frogMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
  const frogs = new THREE.InstancedMesh(frogGeo, frogMat, count)
  frogs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  frogs.castShadow = false
  frogs.receiveShadow = false
  group.add(frogs)

  // lily pads: unit cylinder scaled per instance
  const padGeo = new THREE.CylinderGeometry(1, 1.05, 0.07, 9)
  const padMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
  const pads = new THREE.InstancedMesh(padGeo, padMat, count)
  pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  pads.castShadow = false
  pads.receiveShadow = false
  group.add(pads)

  // scatter across the water zones (behind and beside the dock)
  const zones = [
    { x0: -15.5, x1: 15.5, z0: -15, z1: -9.2, frac: 0.5 },
    { x0: -17.5, x1: -11.2, z0: -7.5, z1: 2.5, frac: 0.25 },
    { x0: 11.2, x1: 17.5, z0: -7.5, z1: 2.5, frac: 0.25 },
  ]
  const bx = new Float32Array(count)
  const bz = new Float32Array(count)
  const yaw = new Float32Array(count)
  const phase = new Float32Array(count)
  const speed = new Float32Array(count)
  const amp = new Float32Array(count)
  const size = new Float32Array(count)
  const padR = new Float32Array(count)
  const color = new THREE.Color()
  const FROG_GREENS = ['#4f9b3a', '#3d8a4a', '#6bb03c', '#2f7a3a', '#57a352', '#7aa03a', '#3a8a68']
  let i = 0
  for (const z of zones) {
    const n = Math.max(1, Math.round(count * z.frac))
    const w = z.x1 - z.x0
    const d = z.z1 - z.z0
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (w / d))))
    const rows = Math.max(1, Math.ceil(n / cols))
    for (let k = 0; k < n && i < count; k++, i++) {
      const cx = z.x0 + ((k % cols) + 0.5) * (w / cols) + (rng() - 0.5) * (w / cols) * 0.5
      const cz = z.z0 + (Math.floor(k / cols) + 0.5) * (d / rows) + (rng() - 0.5) * (d / rows) * 0.5
      bx[i] = cx
      bz[i] = cz
      yaw[i] = Math.atan2(0 - cx, 1 - cz) // face the dock
      phase[i] = rng() * Math.PI * 2
      speed[i] = 4.5 + rng() * 4.5
      amp[i] = 0.3 + rng() * 0.9
      size[i] = 0.85 + rng() * 0.5
      padR[i] = 0.55 + size[i] * 0.3 + rng() * 0.15
      if (i === 0) color.set('#f5c33b') // the golden frog: top 1% of all frogs
      else {
        color.set(FROG_GREENS[Math.floor(rng() * FROG_GREENS.length)])
        color.offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12)
      }
      frogs.setColorAt(i, color)
      color.set('#3f7d3a').offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1)
      pads.setColorAt(i, color)
    }
  }
  const used = i // zones rounding may leave a stray slot; hide leftovers
  if (frogs.instanceColor) frogs.instanceColor.needsUpdate = true
  if (pads.instanceColor) pads.instanceColor.needsUpdate = true

  const diving = new Map() // index -> { phase: 'dive'|'under'|'rise', t, timer }
  let time = rng() * 10
  let hypeExtra = 0

  const _pos = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _eul = new THREE.Euler()
  const _scl = new THREE.Vector3()
  const _m = new THREE.Matrix4()

  const composePad = (idx) => {
    const bob = Math.sin(time * 0.8 + phase[idx]) * 0.045
    _pos.set(bx[idx], WATER_Y + 0.02 + bob, bz[idx])
    _eul.set(Math.sin(time * 0.6 + phase[idx]) * 0.04, yaw[idx], Math.cos(time * 0.7 + phase[idx]) * 0.04)
    _quat.setFromEuler(_eul)
    _scl.set(padR[idx], 1, padR[idx])
    _m.compose(_pos, _quat, _scl)
    pads.setMatrixAt(idx, _m)
    return WATER_Y + 0.055 + bob
  }

  const composeFrog = (idx, padTop, hype) => {
    const st = diving.get(idx)
    if (st) {
      let yOff = 0, tiltX = 0
      if (st.phase === 'dive') { yOff = -1.25 * st.t * st.t; tiltX = st.t * 1.1 }
      else if (st.phase === 'under') { yOff = -1.25; tiltX = 1.1 }
      else { yOff = -1.25 * (1 - easeInOut(st.t)); tiltX = (1 - st.t) * 0.4 }
      _pos.set(bx[idx], padTop + yOff, bz[idx])
      _eul.set(tiltX, yaw[idx], 0, 'YXZ')
      _quat.setFromEuler(_eul)
      _scl.set(size[idx], size[idx], size[idx])
    } else {
      const s = Math.sin(time * speed[idx] + phase[idx])
      const hop = Math.abs(s) * amp[idx] * hype * 0.3
      const stretch = 0.8 + 0.45 * Math.abs(s) * (0.6 + 0.4 * hype)
      _pos.set(bx[idx], padTop + hop, bz[idx])
      _eul.set(0, yaw[idx], Math.sin(time * speed[idx] * 0.5 + phase[idx]) * 0.05, 'YXZ')
      _quat.setFromEuler(_eul)
      _scl.set(size[idx] / Math.sqrt(stretch), size[idx] * stretch, size[idx] / Math.sqrt(stretch))
    }
    _m.compose(_pos, _quat, _scl)
    frogs.setMatrixAt(idx, _m)
  }

  // park unused slots far underwater
  for (let k = used; k < count; k++) {
    _m.compose(_pos.set(0, -50, 0), _quat.identity(), _scl.set(0.001, 0.001, 0.001))
    frogs.setMatrixAt(k, _m)
    pads.setMatrixAt(k, _m)
  }

  return {
    group,
    count: used,

    update(dt) {
      time += dt
      hypeExtra = Math.max(0, hypeExtra - dt * 1.3)
      const hype = 1 + hypeExtra
      for (let k = 0; k < used; k++) {
        const padTop = composePad(k)
        const st = diving.get(k)
        if (st) {
          if (st.phase === 'dive') {
            st.t = Math.min(1, st.t + dt / 0.32)
            if (st.t >= 1) { st.phase = 'under'; st.timer = 1.8 + rng() * 2.4 }
          } else if (st.phase === 'under') {
            st.timer -= dt
            if (st.timer <= 0) { st.phase = 'rise'; st.t = 0 }
          } else {
            st.t = Math.min(1, st.t + dt / 0.5)
            if (st.t >= 1) diving.delete(k)
          }
        }
        composeFrog(k, padTop, hype)
      }
      frogs.instanceMatrix.needsUpdate = true
      pads.instanceMatrix.needsUpdate = true
    },

    cheer(strength = 1) { hypeExtra = Math.min(3, hypeExtra + strength) },

    diveRandom(n = 3) {
      let done = 0
      for (let tries = 0; tries < n * 6 && done < n; tries++) {
        const k = Math.floor(rng() * used)
        if (!diving.has(k)) { diving.set(k, { phase: 'dive', t: 0, timer: 0 }); done++ }
      }
      return done
    },
  }
}

// Faked god rays: additive translucent shafts slanting down through the murk.
function makeGodRays(rng, n = 3) {
  const group = new THREE.Group()
  group.name = 'godRays'
  const tex = canvasTexture(64, 256, (c, W, H) => {
    const v = c.createLinearGradient(0, 0, 0, H)
    v.addColorStop(0, 'rgba(228,255,180,0.9)')
    v.addColorStop(0.75, 'rgba(190,235,140,0.25)')
    v.addColorStop(1, 'rgba(190,235,140,0)')
    c.fillStyle = v
    c.fillRect(0, 0, W, H)
    c.globalCompositeOperation = 'destination-in'
    const hgrad = c.createLinearGradient(0, 0, W, 0)
    hgrad.addColorStop(0, 'rgba(0,0,0,0)')
    hgrad.addColorStop(0.5, 'rgba(0,0,0,1)')
    hgrad.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = hgrad
    c.fillRect(0, 0, W, H)
  }, { nearest: false })
  const rays = []
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
    const w = 1.8 + rng() * 1.4
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 9.5), mat)
    mesh.position.set(-6 + i * (12 / Math.max(1, n - 1)) + (rng() - 0.5) * 2, 4.6, -7.6 - rng() * 2.2)
    mesh.rotation.z = 0.14 + rng() * 0.14
    mesh.rotation.y = (rng() - 0.5) * 0.3
    mesh.renderOrder = 5
    group.add(mesh)
    rays.push({ mat, base: 0.1 + rng() * 0.08, ph: rng() * Math.PI * 2, w: 0.25 + rng() * 0.3 })
  }
  let t = rng() * 10
  const update = (dt) => {
    t += dt
    for (const r of rays) r.mat.opacity = r.base * (0.65 + 0.35 * Math.sin(t * r.w + r.ph))
  }
  return { group, update }
}

// Drifting blinking fireflies (THREE.Points, count scales with particleScale).
function makeFireflies(rng, count) {
  const n = Math.max(10, Math.floor(count))
  const geo = new THREE.BufferGeometry()
  const posArr = new Float32Array(n * 3)
  const base = new Float32Array(n * 3)
  const ph = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    base[i * 3] = (rng() - 0.5) * 34
    base[i * 3 + 1] = 0.6 + rng() * 3.2
    base[i * 3 + 2] = -2 - rng() * 13
    posArr.set(base.subarray(i * 3, i * 3 + 3), i * 3)
    ph[i] = rng() * Math.PI * 2
  }
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xd6ff6e, size: 0.16, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'fireflies'
  points.frustumCulled = false
  let t = rng() * 10
  const update = (dt) => {
    t += dt
    const a = geo.attributes.position.array
    for (let i = 0; i < n; i++) {
      a[i * 3] = base[i * 3] + Math.sin(t * 0.5 + ph[i]) * 0.8 + Math.sin(t * 1.3 + ph[i] * 2) * 0.25
      a[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.8 + ph[i] * 1.7) * 0.4
      a[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.4 + ph[i]) * 0.7
    }
    geo.attributes.position.needsUpdate = true
    mat.opacity = 0.55 + 0.35 * Math.sin(t * 2.2)
  }
  return { points, update }
}

// A bubbling suspicious pool out in the water (decor hazard-flavored ambiance).
function makePool(rng, radius, nBubbles) {
  const group = new THREE.Group()
  group.name = 'suspiciousPool'
  const discMat = new THREE.MeshBasicMaterial({ color: 0x59d63a, transparent: true, opacity: 0.32, depthWrite: false })
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), discMat)
  disc.rotation.x = -Math.PI / 2
  disc.position.y = WATER_Y + 0.03
  group.add(disc)
  const bubbleMat = new THREE.MeshLambertMaterial({ color: 0x8aff5c, emissive: 0x3fae1f, emissiveIntensity: 0.9, flatShading: true })
  const bubbles = []
  for (let i = 0; i < nBubbles; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + rng() * 0.08, 5, 4), bubbleMat)
    bubbles.push({ mesh: b, t: rng(), dur: 1.1 + rng() * 1.2, r: rng() * radius * 0.7, a: rng() * Math.PI * 2 })
    group.add(b)
  }
  let t = rng() * 10
  const update = (dt) => {
    t += dt
    discMat.opacity = 0.24 + 0.1 * Math.sin(t * 1.7)
    for (const b of bubbles) {
      b.t += dt / b.dur
      if (b.t >= 1) { b.t = 0; b.a = rng() * Math.PI * 2; b.r = rng() * radius * 0.7 }
      const k = b.t
      b.mesh.position.set(Math.cos(b.a) * b.r, WATER_Y + 0.05 + k * 0.42, Math.sin(b.a) * b.r)
      b.mesh.scale.setScalar(0.5 + k * 1.1)
      b.mesh.visible = k < 0.92 // pop!
    }
  }
  return { group, update }
}

// Live TVL board — the number only ever goes up, because it can't leave.
function makeTvlBoard() {
  let tvl = 4206969420
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const c = canvas.getContext('2d')
  const draw = () => {
    c.fillStyle = '#0c1f14'
    c.fillRect(0, 0, 512, 112)
    c.strokeStyle = '#3fae1f'
    c.lineWidth = 6
    c.strokeRect(5, 5, 502, 102)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = '700 24px "Arial Black", Arial, sans-serif'
    c.fillStyle = '#7ab88a'
    c.fillText('TOTAL VALUE LOCKED (FOREVER)', 256, 30)
    c.font = '900 44px "Arial Black", Arial, sans-serif'
    c.fillStyle = '#8aff3c'
    c.fillText(`$${tvl.toLocaleString('en-US')}`, 256, 74)
  }
  draw()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const frame = flatMat(0x1c2b1a)
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 1.4, 0.2),
    [frame, frame, frame, frame, new THREE.MeshBasicMaterial({ map: tex }), frame]
  )
  mesh.name = 'tvlBoard'
  const tick = (rng) => {
    tvl += Math.floor(1000 + rng() * 9999999)
    draw()
    tex.needsUpdate = true
  }
  return { mesh, tick }
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

const VINE_TEXTS = ['APY 6,969%', 'APY -3%', 'APY ???', '"STABLE"', 'DYOR', 'NOT A RUG', 'APY 0.01%', 'TRUST ME']
const POP_SKIP_STATES = new Set(['ragdoll', 'ko', 'grabbed', 'finisher', 'win', 'lose'])
const GEYSER_X = 6
const GEYSER_RADIUS = 1.15

class LiquiditySwampArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.5 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0x5eaf00d)
    this._time = 0
    this._geysers = []
    this._floaties = []      // { obj, baseY, ph, w, rot }
    this._croakTimer = 4 + this._rng() * 4
    this._slippageAnnounced = false

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildWaterAndDock()
    this._buildBackdrop()
    this._buildCrowd()
    this._buildGeysers()
    this._buildProps()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction ---------------------------------------------------------

  _buildPhysics() {
    // ground slab + invisible bouncy walls on all four sides at the bounds
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    const sky = buildSkyDome(['#152e28', '#2c5a45', '#5d8a5a', '#a8c47a'], {
      rng: this._rng, sun: false, cloudColor: 'rgba(170,195,140,0.28)',
    })
    this.group.add(sky)
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0x9fc79a, hemiGround: 0x2e4633, hemiIntensity: 0.95,
      sunColor: 0xd9e8a8, sunIntensity: 1.2, sunPos: [8, 15, 10],
      fillColor: 0x6fae8f, fillIntensity: 0.35,
      fog: { color: 0x3a5c40, near: 18, far: 56 }, // thick green swamp air
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildWaterAndDock() {
    const rng = this._rng

    // dark teal water, everywhere, scrolling lazily
    const waterTex = makeWaterTexture(rng)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: waterTex, flatShading: true }))
    water.rotation.x = -Math.PI / 2
    water.position.y = WATER_Y
    water.name = 'water'
    this.group.add(water)
    this.addUpdater((dt) => {
      waterTex.offset.x = (waterTex.offset.x + dt * 0.008) % 1
      waterTex.offset.y = (waterTex.offset.y + dt * 0.005) % 1
    })

    // the fight floor: a big creaky plank dock (v2.0: deep enough to carry
    // the whole free-roam playfield, z -7.25..5.75)
    const plankTex = makePlankTexture(rng)
    const sideMat = flatMat(0x3c2c18)
    const topMat = new THREE.MeshLambertMaterial({ map: plankTex, flatShading: true })
    const dock = new THREE.Mesh(new THREE.BoxGeometry(30, 0.7, 13), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    dock.position.set(0, -0.35, -0.75)
    dock.receiveShadow = !!this.quality.shadows
    dock.name = 'dock'
    this.group.add(dock)

    // support posts poking out of the water hugging the dock edges
    const postMat = flatMat(0x2f2418)
    for (const z of [6.1, -7.6]) {
      for (let x = -14; x <= 14; x += 4.5) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.3, 6), postMat)
        post.position.set(x + (rng() - 0.5) * 0.4, -0.6, z + (rng() - 0.5) * 0.2)
        post.rotation.z = (rng() - 0.5) * 0.1
        this.group.add(post)
      }
    }

    // a few big decorative lily pads with lotus flowers, bobbing near the dock
    for (const [x, z, r] of [[-12.4, 2.2, 1.9], [12.8, 1.4, 1.5], [-11.6, -8.3, 2.2], [14.6, -8.8, 1.7]]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.08, 10), flatMat(0x3f7d3a))
      pad.position.set(x, WATER_Y + 0.03, z)
      this.group.add(pad)
      if (rng() < 0.75) {
        const flower = new THREE.Group()
        for (let p = 0; p < 5; p++) {
          const petal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 5), flatMat(0xe882b0))
          const a = (p / 5) * Math.PI * 2
          petal.position.set(Math.cos(a) * 0.12, 0.14, Math.sin(a) * 0.12)
          petal.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
          flower.add(petal)
        }
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), flatMat(0xffe14d))
        heart.position.y = 0.2
        flower.add(heart)
        flower.position.set(x + (rng() - 0.5) * r, WATER_Y + 0.07, z + (rng() - 0.5) * r)
        this.group.add(flower)
        this._floaties.push({ obj: flower, baseY: flower.position.y, ph: rng() * 6, w: 0.7 + rng() * 0.5, rot: 0 })
      }
      this._floaties.push({ obj: pad, baseY: pad.position.y, ph: rng() * 6, w: 0.6 + rng() * 0.4, rot: 0.03 })
    }
    this.addUpdater((dt) => {
      void dt
      for (const f of this._floaties) {
        f.obj.position.y = f.baseY + Math.sin(this._time * f.w + f.ph) * 0.05
        if (f.rot) f.obj.rotation.z = Math.sin(this._time * f.w * 0.8 + f.ph) * f.rot
      }
    })
  }

  _buildBackdrop() {
    const rng = this._rng
    const shadows = !!this.quality.shadows

    // -- drooping swamp trees with APY vine-signs
    this._vines = []
    const treeDefs = [
      { x: -12.6, z: -9.6, scale: 1.2, vines: [VINE_TEXTS[0], VINE_TEXTS[4]] },
      { x: -6.4, z: -13.2, scale: 1.4, vines: [VINE_TEXTS[1]] },
      { x: 0.8, z: -14.4, scale: 1.25, vines: [VINE_TEXTS[7]] },
      { x: 6.2, z: -13.4, scale: 1.35, vines: [VINE_TEXTS[2], VINE_TEXTS[5]] },
      { x: 12.8, z: -10.2, scale: 1.15, vines: [VINE_TEXTS[3]] },
      { x: 16.8, z: -3.6, scale: 0.95, vines: [VINE_TEXTS[6]] },
      { x: -16.9, z: -3.2, scale: 1.0, vines: [VINE_TEXTS[5]] },
    ]
    for (const td of treeDefs) {
      const { group, vinePivots } = makeSwampTree(rng, { scale: td.scale, vineTexts: td.vines })
      group.position.set(td.x, 0, td.z)
      group.rotation.y = rng() * Math.PI * 2
      this.group.add(group)
      for (const p of vinePivots) this._vines.push({ pivot: p, ph: rng() * 6, w: 0.6 + rng() * 0.7 })
    }
    this.addUpdater((dt) => {
      void dt
      for (const v of this._vines) {
        v.pivot.rotation.z = Math.sin(this._time * v.w + v.ph) * 0.09
        v.pivot.rotation.x = Math.cos(this._time * v.w * 0.7 + v.ph) * 0.05
      }
    })

    // -- the frog idol, centerpiece of the whole religion
    const idol = makeFrogIdol()
    idol.group.position.set(0, WATER_Y + 0.1, -10.6)
    if (shadows) idol.group.traverse((o) => { if (o.isMesh) o.castShadow = true })
    this.group.add(idol.group)
    this.addUpdater((dt) => {
      void dt
      const pulse = 0.7 + 0.5 * Math.abs(Math.sin(this._time * 1.1))
      for (const m of idol.eyeMats) m.emissiveIntensity = pulse
    })

    // -- marquee + live TVL counter
    const marquee = makeSign('LIQUIDITY SWAMP', {
      w: 8, h: 1.9, depth: 0.3, px: 80,
      bg: '#122a1c', fg: '#8aff3c', border: '#4f9b3a', stroke: '#07130a',
      sub: 'DEEP LIQUIDITY · NO EXIT', subColor: '#7ab88a', sideColor: 0x0d1c12,
    })
    marquee.position.set(0, 7.6, -12.4)
    marquee.rotation.x = -0.05
    this.group.add(marquee)
    for (const px of [-3.2, 3.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8.3, 6), flatMat(0x2f2418))
      pole.position.set(px, 3.4, -12.4)
      pole.rotation.z = (rng() - 0.5) * 0.05
      this.group.add(pole)
    }
    const tvl = makeTvlBoard()
    tvl.mesh.position.set(0, 5.9, -12.36)
    tvl.mesh.rotation.x = -0.05
    this.group.add(tvl.mesh)
    let tvlAcc = 0
    this.addUpdater((dt) => {
      tvlAcc += dt
      if (tvlAcc >= 1.4) { tvlAcc = 0; tvl.tick(rng) } // number go up, number never leave
    })

    // -- crooked YIELD FARM sign pointing straight into the water
    const yf = makeSign('YIELD FARM →', { w: 2.6, h: 0.7, depth: 0.1, px: 72, bg: '#4a3418', fg: '#ffe14d', border: '#8a6a2a', sideColor: 0x33240f })
    const yfPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), flatMat(0x4a3a26))
    yfPole.position.set(-11.4, 0.3, -5.4)
    yfPole.rotation.z = 0.24
    yf.position.set(-11.0, 1.55, -5.4)
    yf.rotation.set(0.05, 0.5, 0.16)
    this.group.add(yfPole, yf)

    // -- half-sunken vault safe, with escaped gold bars bobbing beside it
    const vault = makeSunkenVault(rng)
    vault.position.set(13.2, -0.45, -7.6)
    this.group.add(vault)
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.24), flatMat(0xf5c33b))
      bar.position.set(11.6 + rng() * 1.4, WATER_Y + 0.03, -6.2 - rng() * 1.6)
      bar.rotation.y = rng() * Math.PI
      this.group.add(bar)
      this._floaties.push({ obj: bar, baseY: bar.position.y, ph: rng() * 6, w: 0.8 + rng() * 0.5, rot: 0.06 })
    }

    // -- bubbling suspicious pools
    for (const [x, z, r] of [[-10.8, -7.8, 1.3], [9.8, -11.4, 1.6], [-14.8, 1.2, 1.1]]) {
      const pool = makePool(rng, r, Math.max(3, Math.round(6 * (this.quality.particleScale ?? 0.75))))
      pool.group.position.set(x, 0, z)
      this.group.add(pool.group)
      this.addUpdater(pool.update)
    }

    // -- god rays + fireflies
    const rays = makeGodRays(rng, 4)
    this.group.add(rays.group)
    this.addUpdater(rays.update)
    const flies = makeFireflies(rng, 42 * (this.quality.particleScale ?? 0.75))
    this.group.add(flies.points)
    this.addUpdater(flies.update)
  }

  _buildCrowd() {
    const count = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    this._frogs = buildFrogCrowd({ count, rng: this._rng })
    this.group.add(this._frogs.group)
    this.addUpdater((dt) => this._frogs.update(dt))

    // ambient croaking, on a lazy random timer
    this.addUpdater((dt) => {
      this._croakTimer -= dt
      if (this._croakTimer <= 0) {
        this._croakTimer = 3.5 + this._rng() * 5
        this.sfx('croak', { vol: 0.25, pitch: 0.75 + this._rng() * 0.6 })
      }
    })
  }

  _buildGeysers() {
    const rng = this._rng
    const ps = this.quality.particleScale ?? 0.75
    const slimeMat = new THREE.MeshLambertMaterial({
      color: 0x6ee03c, emissive: 0x2f8a12, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.92, flatShading: true,
    })
    const rimMat = flatMat(0x2f2418)
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0e1a0c })

    // v2.0 free-roam: geyser spots are XZ discs scattered on the open dock
    // (kitty-corner so they rake different quadrants; center lane stays clear)
    for (const [gx, gz] of [[-GEYSER_X, 2.6], [GEYSER_X, -2.6]]) {
      const side = Math.sign(gx) || 1
      const x = gx
      const g = {
        side, x, z: gz,
        timer: side < 0 ? 4.5 : 8.0, // staggered so they alternate
        phase: 'idle', eruptT: 0,
      }

      // busted grate in the dock planks
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.09, 12), rimMat)
      rim.position.set(x, 0.045, gz)
      this.group.add(rim)
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.74, 12), holeMat)
      hole.rotation.x = -Math.PI / 2
      hole.position.set(x, 0.095, gz)
      this.group.add(hole)
      for (const [ry, off] of [[0.5, -0.14], [-0.35, 0.18]]) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.22), flatMat(0x4a3a26))
        plank.position.set(x, 0.12, gz + off)
        plank.rotation.y = ry
        this.group.add(plank)
      }

      // warning glow
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x8aff3c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), glowMat)
      glow.rotation.x = -Math.PI / 2
      glow.position.set(x, 0.1, gz)
      glow.renderOrder = 2
      this.group.add(glow)
      g.glowMat = glowMat

      // idle bubbles seeping through the grate
      g.bubbles = []
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07 + rng() * 0.06, 5, 4), slimeMat)
        this.group.add(b)
        g.bubbles.push({ mesh: b, t: rng(), dur: 1.1 + rng() * 0.7, ox: (rng() - 0.5) * 0.7, oz: (rng() - 0.5) * 0.5 })
      }

      // the slime column itself (scaled up from 0 during eruptions)
      const columnG = new THREE.Group()
      columnG.position.set(x, 0.08, gz)
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 3.6, 10, 3), slimeMat)
      col.position.y = 1.8
      columnG.add(col)
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.66, 7, 5), slimeMat)
      cap.scale.y = 0.7
      cap.position.y = 3.6
      columnG.add(cap)
      columnG.visible = false
      columnG.scale.set(1, 0.001, 1)
      this.group.add(columnG)
      g.columnG = columnG

      // droplet spray pool
      g.drops = []
      const nDrops = Math.max(4, Math.round(10 * ps))
      for (let i = 0; i < nDrops; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.09 + rng() * 0.08, 5, 4), slimeMat)
        d.visible = false
        this.group.add(d)
        g.drops.push({ mesh: d, vel: new THREE.Vector3(), active: false })
      }

      this._geysers.push(g)
    }

    this.addUpdater((dt) => { for (const g of this._geysers) this._updateGeyser(g, dt) })
  }

  _buildProps() {
    const rng = this._rng
    const shadows = !!this.quality.shadows
    const place = (mesh, x, z, ry, opts) => {
      mesh.position.set(x, mesh.position.y, z)
      mesh.rotation.y = ry
      if (shadows) mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(mesh)
      this.addBreakable(mesh, opts)
    }

    // v2.0 free-roam: dock clutter scatters across the open planks (center
    // lane kept mostly clear).

    // twin frog statues guarding opposite dock corners
    place(makeFrogStatue(rng), -7.4, -3.8, 0.5, { shape: 'box', mass: 9, health: 30 })
    place(makeFrogStatue(rng), 7.5, 3.6, -0.6 + Math.PI, { shape: 'box', mass: 9, health: 30 })

    // barrels of farm-fresh yield (one sits inside geyser blast range — enjoy)
    place(makeSludgeBarrel(rng, 'APY 6969%'), -4.9, 2.9, 0.4, { shape: 'cylinder', mass: 5, health: 18 })
    place(makeSludgeBarrel(rng, '100% ORGANIC'), 3.9, -3.9, -0.3, { shape: 'cylinder', mass: 5, health: 18 })

    // mossy crate of LP tokens
    const crate = makeCrateMesh(0.7, { label: 'LP', color: '#8a9a5b' })
    crate.position.y = 0.35
    place(crate, 6.3, 2.1, 0.4, { shape: 'box', mass: 3, health: 12 })

    // somebody's personal cold storage
    place(makeMiniVault(), -6.9, 4.1, 0.35, { shape: 'box', mass: 7, health: 24 })
  }

  _wireEvents() {
    // frogs are extremely invested in price action
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      this._frogs?.cheer(0.25 + Math.min(0.8, combo * 0.07) + (e?.counter ? 0.4 : 0))
      if (this._rng() < 0.15) this.sfx('croak', { vol: 0.3, pitch: 1.1 + this._rng() * 0.4 })
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) this._frogs?.cheer(1.2) })
    this.listen('fighter:ko', () => {
      this._frogs?.cheer(3)
      this.sfx('croak', { vol: 0.5, pitch: 0.7 })
    })
    this.listen('round:end', () => this._frogs?.cheer(2))
  }

  // -- hazard: the slime geysers -------------------------------------------

  _updateGeyser(g, dt) {
    g.timer -= dt

    if (g.phase === 'idle' && g.timer <= 1.0) {
      g.phase = 'warn'
      this.sfx('slide', { vol: 0.3, pitch: 0.6 })
    }
    if ((g.phase === 'idle' || g.phase === 'warn') && g.timer <= 0) {
      g.phase = 'erupt'
      g.eruptT = 0
      g.timer = 6.2 + this._rng() * 1.6 // ≈7 s cycle
      this._erupt(g)
    }

    // warning glow
    if (g.phase === 'warn') g.glowMat.opacity = 0.3 + 0.3 * Math.abs(Math.sin(this._time * 16))
    else if (g.phase === 'erupt') g.glowMat.opacity = 0.55
    else g.glowMat.opacity = 0.16 + 0.06 * Math.sin(this._time * 2.4)

    // seep bubbles — frantic right before the pop
    const speedMul = g.phase === 'warn' ? 3.4 : g.phase === 'erupt' ? 0 : 1
    for (const b of g.bubbles) {
      b.mesh.visible = g.phase !== 'erupt'
      if (!speedMul) continue
      b.t += (dt / b.dur) * speedMul
      if (b.t >= 1) { b.t = 0; b.ox = (this._rng() - 0.5) * 0.7; b.oz = (this._rng() - 0.5) * 0.5 }
      const k = b.t
      b.mesh.position.set(g.x + b.ox * (1 - k * 0.4), 0.12 + k * 0.55, g.z + b.oz * (1 - k * 0.4))
      b.mesh.scale.setScalar(0.5 + k * 1.2)
      if (k > 0.9) b.mesh.visible = false
    }

    // the column
    if (g.phase === 'erupt') {
      g.eruptT += dt
      const e = g.eruptT
      let sc
      if (e < 0.14) sc = Math.max(0.001, easeOutBack(e / 0.14))
      else if (e < 0.5) sc = 1 + Math.sin((e - 0.14) * 34) * 0.05
      else if (e < 0.85) sc = Math.max(0.001, 1 - easeInOut((e - 0.5) / 0.35))
      else {
        g.phase = 'idle'
        g.columnG.visible = false
        sc = 0.001
      }
      g.columnG.visible = g.phase === 'erupt'
      g.columnG.scale.set(0.75 + sc * 0.35, sc, 0.75 + sc * 0.35)
      g.columnG.rotation.y += dt * 3
    }

    // droplets
    for (const d of g.drops) {
      if (!d.active) continue
      d.vel.y -= 22 * dt
      d.mesh.position.addScaledVector(d.vel, dt)
      d.mesh.rotation.x += dt * 7
      if (d.mesh.position.y < WATER_Y - 0.05) { d.active = false; d.mesh.visible = false }
    }
  }

  _erupt(g) {
    // spray
    for (const d of g.drops) {
      d.active = true
      d.mesh.visible = true
      d.mesh.position.set(g.x + (this._rng() - 0.5) * 0.5, 0.5, g.z + (this._rng() - 0.5) * 0.5)
      d.vel.set((this._rng() - 0.5) * 5.5, 5.5 + this._rng() * 4.5, (this._rng() - 0.5) * 5.5)
    }
    this.sfx('launch', { vol: 0.7, pitch: 1.15 })
    this.emit('camera:shake', { mag: 0.3 })

    // shove nearby physics props skyward (XZ disc around the grate)
    try {
      for (const h of this.props) {
        const m = h?.mesh
        if (!m || !h.body) continue
        const dx = m.position.x - g.x
        const dz = m.position.z - g.z
        const d = Math.hypot(dx, dz)
        if (d < 2.0 && m.position.y < 1.5) {
          this.physics?.impulse?.(h, [(dx / (d || 1)) * (2 + this._rng() * 2), 9 + this._rng() * 7, (dz / (d || 1)) * (2 + this._rng() * 2)])
        }
      }
    } catch (e) { /* props are optional casualties */ }

    // pop anyone standing on the grate
    let victims = 0
    for (const f of this._getFighters()) {
      if (this._popFighter(f, g)) victims++
    }
    if (victims > 0) {
      this.emit('caption', { text: 'SLIPPAGE' })
      this.emit('camera:shake', { mag: 0.55 })
      this.sfx('boing', { vol: 0.7, pitch: 1.35 })
      this._frogs?.cheer(2)
      try { this.audio?.crowd?.('gasp') } catch (e) { /* frogs gasp internally */ }
      if (!this._slippageAnnounced) {
        this._slippageAnnounced = true
        this.emit('announcer', { line: 'MAXIMUM SLIPPAGE!' })
      }
    }
    this.emit('arena:geyser', { x: g.x, z: g.z, side: g.side, victims, pos: { x: g.x, y: 0, z: g.z } })
  }

  // Best-effort access to the live fighters (combat owns them; stay defensive).
  _getFighters() {
    try {
      const scr = this.physics?.game?.screens?.current
      const fs = scr?.fighters
      if (Array.isArray(fs) && fs.length && fs[0]?.pos) return fs
    } catch (e) { /* combat internals unavailable — hazard stays visual */ }
    return []
  }

  _popFighter(f, g) {
    const p = f?.pos
    if (!p || p.y > 0.6) return false
    // 2D trigger zone: XZ disc around the grate
    const dx = p.x - g.x
    const dz = (p.z ?? 0) - g.z
    if (Math.hypot(dx, dz) > GEYSER_RADIUS) return false
    if (POP_SKIP_STATES.has(f.state)) return false
    try {
      const dir = dx >= 0 ? 1 : -1
      f.vel.y = Math.max(f.vel.y ?? 0, 8.4)
      f.vel.x = (f.vel.x ?? 0) + dir * (1.4 + this._rng() * 1.3)
      if (typeof f.vel.z === 'number') f.vel.z += Math.sign(dz || (this._rng() - 0.5)) * (1.0 + this._rng() * 1.2)
      f.squash?.(-0.32)
      if (f.state !== 'attack' && typeof f.setState === 'function') {
        f.tumbleRate = dir * (4 + this._rng() * 4)
        f.setState('launched')
      }
      return true
    } catch (e) {
      return false
    }
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    try { this.audio?.crowd?.('wild') } catch (e) { /* swamp stays hyped */ }
    this._frogs?.cheer(2.2)
    this.sfx('croak', { vol: 0.4, pitch: 1.2 })
    if (this.physics?.presetName === 'unhinged') {
      // panic dives — liquidity is LEAVING the pool
      this._frogs?.diveRandom(4 + Math.floor(this._rng() * 4))
      this.sfx('thud', { vol: 0.35, pitch: 1.6 })
    }
    void fighter
  }
}

export const LiquiditySwamp = {
  id: 'liquidity-swamp',
  name: 'LIQUIDITY SWAMP',
  music: 'battle_liquidity_swamp',
  build(ctx) { return new LiquiditySwampArena(ctx) },
}
