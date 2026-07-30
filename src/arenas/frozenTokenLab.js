// ============================================================================
// FROZEN TOKEN LABORATORY — Fatty Pingo's arctic research station (story R3).
// Cold storage, taken literally: an ice-checker fight floor ringed by glowing
// token vats, tesla-coil mining rigs arcing electricity across the back wall,
// penguin scientists in lab coats, and a malfunctioning freeze-ray turret that
// sweeps the floor on a rail every ~9 seconds. Aurora overhead. -40° and
// still HODLING.
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, makeLightRig, makeSign,
  makeCoinMesh,
} from './ArenaBase.js'

// ---------------------------------------------------------------------------
// palette (flat, bright, arctic)
// ---------------------------------------------------------------------------
const ICE_DEEP = '#0a1a38'
const ICE_MID = '#16457a'
const ICE_GLOW = 0x7adcf0
const STEEL = 0x51626f
const STEEL_DARK = 0x323e48

// ---------------------------------------------------------------------------
// module-private texture / mesh factories
// ---------------------------------------------------------------------------

function makeIceFloorTexture(rng) {
  // 8x8 checker of pale blues with frost blotches and hairline cracks —
  // reads slippery from orbit. Big fat texels, obviously.
  const TILES = 8, TP = 64
  return canvasTexture(TILES * TP, TILES * TP, (c, W, H) => {
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        const even = (tx + ty) % 2 === 0
        const j = (rng() - 0.5) * 12
        const base = even ? [168 + j, 214 + j, 236 + j] : [214 + j, 238 + j, 250 + j]
        c.fillStyle = `rgb(${base.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`
        c.fillRect(tx * TP, ty * TP, TP, TP)
        c.strokeStyle = 'rgba(90,130,170,0.4)'
        c.lineWidth = 3
        c.strokeRect(tx * TP + 1.5, ty * TP + 1.5, TP - 3, TP - 3)
        // frost patch — a soft white blob squatting on the tile
        if (rng() < 0.3) {
          const cx = tx * TP + TP * (0.3 + rng() * 0.4)
          const cy = ty * TP + TP * (0.3 + rng() * 0.4)
          const r = TP * (0.2 + rng() * 0.26)
          const g = c.createRadialGradient(cx, cy, 2, cx, cy, r)
          g.addColorStop(0, 'rgba(255,255,255,0.85)')
          g.addColorStop(1, 'rgba(255,255,255,0)')
          c.fillStyle = g
          c.fillRect(cx - r, cy - r, r * 2, r * 2)
        }
        // the occasional frozen snowflake tile (this lab's dollar sign)
        if (rng() < 0.06) {
          c.strokeStyle = 'rgba(90,170,220,0.9)'
          c.lineWidth = 4
          const cx = tx * TP + TP / 2, cy = ty * TP + TP / 2, r = TP * 0.3
          for (let a = 0; a < 6; a++) {
            const th = (a / 6) * Math.PI * 2
            c.beginPath()
            c.moveTo(cx, cy)
            c.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r)
            c.stroke()
            // little barbs
            c.beginPath()
            c.moveTo(cx + Math.cos(th) * r * 0.6, cy + Math.sin(th) * r * 0.6)
            c.lineTo(cx + Math.cos(th + 0.5) * r * 0.85, cy + Math.sin(th + 0.5) * r * 0.85)
            c.stroke()
          }
        }
      }
    }
    // long hairline cracks wandering the whole slab
    for (let i = 0; i < 7; i++) {
      let x = rng() * W, y = rng() * H
      c.strokeStyle = i % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(60,110,160,0.45)'
      c.lineWidth = 2
      c.beginPath()
      c.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        x += (rng() - 0.5) * 140
        y += (rng() - 0.5) * 140
        c.lineTo(x, y)
      }
      c.stroke()
    }
  }, { repeat: [2.75, 1.625] })
}

function makeFrostDecalTexture(rng) {
  // radial frost splat with crystalline spokes, alpha fading out
  return canvasTexture(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    const cx = W / 2, cy = H / 2
    const g = c.createRadialGradient(cx, cy, 4, cx, cy, W * 0.48)
    g.addColorStop(0, 'rgba(255,255,255,0.8)')
    g.addColorStop(0.55, 'rgba(220,242,255,0.4)')
    g.addColorStop(1, 'rgba(220,242,255,0)')
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(255,255,255,0.7)'
    c.lineWidth = 3
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.4
      const r = W * (0.28 + rng() * 0.2)
      c.beginPath()
      c.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6)
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      c.stroke()
    }
  }, { nearest: false })
}

// Aurora sky dome: polar night gradient, seamless wavy green/purple curtains,
// stars, a pale moon and a painted ridge of ice mountains at the horizon.
// Returns { mesh, update } — update() drifts the aurora around the dome.
function makeAuroraSky(rng) {
  const tex = canvasTexture(512, 256, (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, 0, h * 0.62)
    grad.addColorStop(0, '#050a1e')
    grad.addColorStop(0.45, ICE_DEEP)
    grad.addColorStop(0.85, ICE_MID)
    grad.addColorStop(1, '#2c6f96')
    c.fillStyle = grad
    c.fillRect(0, 0, w, h * 0.62)
    c.fillStyle = '#2c6f96'
    c.fillRect(0, h * 0.6, w, h * 0.4)
    // stars (kept off the wrap seam so the dome tiles cleanly)
    c.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 90; i++) {
      const x = 10 + rng() * (w - 20)
      const y = rng() * h * 0.45
      const s = rng() < 0.12 ? 2 : 1
      c.fillRect(x, y, s, s)
    }
    // pale moon with lazy craters
    const mx = w * 0.22, my = h * 0.14, mr = 14
    c.fillStyle = '#dfe9f2'
    c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(150,170,190,0.55)'
    c.beginPath(); c.arc(mx - 4, my - 3, 3, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.arc(mx + 5, my + 4, 2.2, 0, Math.PI * 2); c.fill()
    // aurora curtains — integer wave counts so the seam is invisible
    c.globalCompositeOperation = 'lighter'
    const bands = [
      { base: h * 0.2, amp: h * 0.06, k: 3, phase: rng() * 6, len: h * 0.2, col: '57,224,120' },
      { base: h * 0.3, amp: h * 0.08, k: 2, phase: rng() * 6, len: h * 0.26, col: '150,110,240' },
      { base: h * 0.14, amp: h * 0.05, k: 4, phase: rng() * 6, len: h * 0.15, col: '110,240,210' },
    ]
    for (const b of bands) {
      for (let x = 0; x < w; x += 4) { // chunky 4px columns, very 2002
        const cy = b.base + Math.sin((x / w) * Math.PI * 2 * b.k + b.phase) * b.amp
        const g = c.createLinearGradient(0, cy - b.len * 0.3, 0, cy + b.len)
        g.addColorStop(0, `rgba(${b.col},0)`)
        g.addColorStop(0.35, `rgba(${b.col},0.5)`)
        g.addColorStop(1, `rgba(${b.col},0)`)
        c.fillStyle = g
        c.fillRect(x, cy - b.len * 0.3, 4, b.len * 1.3)
      }
    }
    c.globalCompositeOperation = 'source-over'
    // ice mountain ridges above the horizon — two parallax silhouettes
    const ridge = (yBase, amp, col, k) => {
      c.fillStyle = col
      c.beginPath()
      c.moveTo(0, h * 0.62)
      for (let x = 0; x <= w; x += 8) {
        const y = yBase - Math.abs(Math.sin((x / w) * Math.PI * 2 * k + 1.3)) * amp - Math.sin((x / w) * Math.PI * 2 * (k * 3)) * amp * 0.25
        c.lineTo(x, y)
      }
      c.lineTo(w, h * 0.62)
      c.closePath()
      c.fill()
    }
    ridge(h * 0.6, h * 0.1, '#123457', 2)
    ridge(h * 0.61, h * 0.06, '#1d4a74', 5)
  }, { nearest: false })
  tex.wrapS = THREE.RepeatWrapping
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(85, 24, 14),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  )
  mesh.name = 'auroraDome'
  mesh.renderOrder = -10
  const update = (dt) => { tex.offset.x = (tex.offset.x + dt * 0.006) % 1 }
  return { mesh, update }
}

function makeWallTexture(rng) {
  // riveted steel lab panels, frosted at the base, warm porthole windows
  return canvasTexture(256, 128, (c, W, H) => {
    c.fillStyle = '#4a5a68'
    c.fillRect(0, 0, W, H)
    const cols = 4, rows = 2
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * (W / cols), py = y * (H / rows)
        const j = (rng() - 0.5) * 14
        c.fillStyle = `rgb(${74 + j | 0},${90 + j | 0},${104 + j | 0})`
        c.fillRect(px + 2, py + 2, W / cols - 4, H / rows - 4)
        c.strokeStyle = 'rgba(20,30,40,0.6)'
        c.lineWidth = 3
        c.strokeRect(px + 2, py + 2, W / cols - 4, H / rows - 4)
        // rivets
        c.fillStyle = 'rgba(200,220,235,0.55)'
        for (const [rx, ry] of [[8, 8], [W / cols - 10, 8], [8, H / rows - 10], [W / cols - 10, H / rows - 10]]) {
          c.beginPath(); c.arc(px + rx, py + ry, 2.2, 0, Math.PI * 2); c.fill()
        }
        // the odd glowing porthole
        if (rng() < 0.3) {
          c.fillStyle = '#20313f'
          c.beginPath(); c.arc(px + W / cols / 2, py + H / rows / 2, 9, 0, Math.PI * 2); c.fill()
          c.fillStyle = rng() < 0.6 ? '#9adcf0' : '#ffd98a'
          c.beginPath(); c.arc(px + W / cols / 2, py + H / rows / 2, 6, 0, Math.PI * 2); c.fill()
        }
      }
    }
    // frost creeping up from the floor
    const g = c.createLinearGradient(0, H, 0, H * 0.62)
    g.addColorStop(0, 'rgba(230,246,255,0.85)')
    g.addColorStop(1, 'rgba(230,246,255,0)')
    c.fillStyle = g
    c.fillRect(0, H * 0.62, W, H * 0.38)
    // hazard stripe skirt
    c.fillStyle = '#123'
    c.fillRect(0, H - 12, W, 12)
    c.fillStyle = '#7adcf0'
    for (let x = -12; x < W + 12; x += 24) {
      c.beginPath()
      c.moveTo(x, H); c.lineTo(x + 10, H - 12); c.lineTo(x + 18, H - 12); c.lineTo(x + 8, H)
      c.closePath(); c.fill()
    }
  }, { repeat: [4, 1] })
}

// One InstancedMesh of hanging icicles. rows: [{ y, z, x0, x1, n }...]
function makeIcicles(rng, rows) {
  let total = 0
  for (const r of rows) total += r.n
  const geo = new THREE.ConeGeometry(0.09, 1, 5)
  geo.rotateX(Math.PI)          // tip down
  geo.translate(0, -0.5, 0)     // hang from the attach point
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8f2ff, flatShading: true, transparent: true, opacity: 0.82 })
  const mesh = new THREE.InstancedMesh(geo, mat, total)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  let i = 0
  for (const r of rows) {
    for (let k = 0; k < r.n; k++) {
      const t = (k + 0.5) / r.n
      const x = r.x0 + (r.x1 - r.x0) * t + (rng() - 0.5) * 0.3
      const len = 0.35 + rng() * 0.85
      const s = 0.7 + rng() * 0.9
      e.set((rng() - 0.5) * 0.08, 0, (rng() - 0.5) * 0.08)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(x, r.y, r.z), q, new THREE.Vector3(s, len, s))
      mesh.setMatrixAt(i++, m)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = 'icicles'
  return mesh
}

// Glass token vat with a glowing frozen coin suspended inside.
// Returns { group, update }.
function makeTokenVat(rng, coinText = 'P') {
  const g = new THREE.Group()
  g.name = 'tokenVat'
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.9, 0.5, 10), flatMat(STEEL))
  base.position.y = 0.25
  g.add(base)
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 1.7, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xbfeaff, flatShading: true, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  )
  glass.position.y = 1.35
  g.add(glass)
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.68, 0.28, 10), flatMat(STEEL_DARK))
  lid.position.y = 2.32
  g.add(lid)
  // pipe elbow + valve wheel — very serious science
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 6), flatMat(STEEL_DARK))
  pipe.rotation.z = Math.PI / 2
  pipe.position.set(0.5, 2.5, 0)
  g.add(pipe)
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 5, 8), flatMat(0xd95d3f))
  valve.position.set(0.92, 2.5, 0)
  valve.rotation.y = Math.PI / 2
  g.add(valve)
  // frost collar at the glass base
  const frost = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.7 }))
  frost.position.y = 0.56
  g.add(frost)

  // the specimen: a frozen coin, glowing like it still believes
  const coin = makeCoinMesh(0.42, 0.13, { text: coinText, px: 96, faceBg: '#bfe8ff', rimColor: 0x8fd0e8 })
  coin.position.y = 1.4
  g.add(coin)
  const coinMats = Array.isArray(coin.material) ? coin.material : [coin.material]
  for (const m of coinMats) { m.emissive = new THREE.Color(0x3fb8e8); m.emissiveIntensity = 0.4 }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: ICE_GLOW, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  )
  glow.position.set(0, 1.4, -0.18)
  g.add(glow)

  // bubbles rising through the coolant
  const bubbles = []
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 + rng() * 0.035, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xe8faff, transparent: true, opacity: 0.7 })
    )
    bubbles.push({ mesh: b, t: rng(), r: 0.15 + rng() * 0.3, a: rng() * Math.PI * 2, spd: 0.35 + rng() * 0.3 })
    g.add(b)
  }
  const phase = rng() * Math.PI * 2
  let t = rng() * 10
  const update = (dt) => {
    t += dt
    const pulse = 0.35 + (Math.sin(t * 2.2 + phase) * 0.5 + 0.5) * 0.55
    for (const m of coinMats) m.emissiveIntensity = pulse
    glow.material.opacity = 0.16 + pulse * 0.3
    coin.rotation.y += dt * 0.7
    coin.position.y = 1.4 + Math.sin(t * 1.1 + phase) * 0.07
    for (const b of bubbles) {
      b.t += dt * b.spd
      if (b.t >= 1) { b.t = 0; b.a = rng() * Math.PI * 2 }
      b.mesh.position.set(Math.cos(b.a) * b.r, 0.7 + b.t * 1.35, Math.sin(b.a) * b.r)
      b.mesh.material.opacity = 0.7 * (1 - b.t * b.t)
    }
  }
  return { group: g, update }
}

function makeRigTexture(rng) {
  // GPU rack: fans, cables, a hash meter stuck on BRRR
  return canvasTexture(128, 96, (c, W, H) => {
    c.fillStyle = '#28323c'
    c.fillRect(0, 0, W, H)
    for (let r = 0; r < 3; r++) {
      const y = 8 + r * 28
      c.fillStyle = '#1a2129'
      c.fillRect(6, y, W - 12, 22)
      // fans
      for (let f = 0; f < 3; f++) {
        const fx = 20 + f * 34
        c.strokeStyle = '#5a6a78'
        c.lineWidth = 2
        c.beginPath(); c.arc(fx, y + 11, 8, 0, Math.PI * 2); c.stroke()
        c.beginPath()
        for (let b = 0; b < 3; b++) {
          const a = rng() * 0.6 + (b / 3) * Math.PI * 2
          c.moveTo(fx, y + 11)
          c.lineTo(fx + Math.cos(a) * 7, y + 11 + Math.sin(a) * 7)
        }
        c.stroke()
      }
      // blinkenlights
      for (let l = 0; l < 5; l++) {
        c.fillStyle = rng() < 0.5 ? '#37e05f' : (rng() < 0.5 ? '#7adcf0' : '#ff4d5e')
        c.fillRect(W - 16, y + 3 + l * 4, 6, 2)
      }
    }
  })
}

// Tesla-coil mining rig. Returns { group, tip (Object3D at the top sphere),
// sphereMat } — the arena wires the arcs + emissive pulsing.
function makeMiningRig(rng) {
  const g = new THREE.Group()
  g.name = 'miningRig'
  const rackTex = makeRigTexture(rng)
  const rackMat = new THREE.MeshLambertMaterial({ map: rackTex, flatShading: true })
  const shell = flatMat(STEEL_DARK)
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.25, 1.4), [shell, shell, shell, shell, rackMat, shell])
  rack.position.y = 0.625
  g.add(rack)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 1.55), flatMat(STEEL))
  cap.position.y = 1.31
  g.add(cap)
  // coil column: core + fat rings
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.7, 7), flatMat(0x8a5c2e))
  core.position.y = 2.25
  g.add(core)
  const ringMat = flatMat(0xc98f3a)
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4 - i * 0.055, 0.075, 6, 10), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 1.55 + i * 0.42
    g.add(ring)
  }
  const sphereMat = new THREE.MeshLambertMaterial({ color: 0xd8f2ff, flatShading: true, emissive: new THREE.Color(ICE_GLOW), emissiveIntensity: 0.35 })
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), sphereMat)
  orb.position.y = 3.35
  g.add(orb)
  const tip = new THREE.Object3D()
  tip.position.y = 3.35
  g.add(tip)
  return { group: g, tip, sphereMat }
}

// Jagged electric arc built from thin additive box segments.
// Returns { group, layout(a, b, jag), setVisible(v) }.
function makeArc(nSeg, rng, thickness = 0.055) {
  const group = new THREE.Group()
  group.name = 'arc'
  const mat = new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  const segs = []
  for (let i = 0; i < nSeg; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
    segs.push(m)
    group.add(m)
  }
  group.visible = false
  const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3()
  const pts = []
  for (let i = 0; i <= nSeg; i++) pts.push(new THREE.Vector3())
  return {
    group,
    layout(a, b, jag = 0.5) {
      _d.copy(b).sub(a).normalize()
      _u.set(0, 1, 0)
      if (Math.abs(_d.y) > 0.9) _u.set(1, 0, 0)
      _u.cross(_d).normalize()
      _v.copy(_d).cross(_u).normalize()
      for (let i = 0; i <= nSeg; i++) {
        const t = i / nSeg
        pts[i].copy(a).lerp(b, t)
        if (i > 0 && i < nSeg) {
          const k = Math.sin(Math.PI * t) * jag
          pts[i].addScaledVector(_u, (rng() - 0.5) * 2 * k).addScaledVector(_v, (rng() - 0.5) * 2 * k)
        }
      }
      for (let i = 0; i < nSeg; i++) {
        const p0 = pts[i], p1 = pts[i + 1]
        const seg = segs[i]
        seg.position.copy(p0).lerp(p1, 0.5)
        seg.scale.set(thickness, thickness, Math.max(0.02, p0.distanceTo(p1)))
        seg.lookAt(p1)
      }
    },
    setVisible(v) { group.visible = v },
  }
}

function makeSnowDrift(rng, s = 1) {
  const drift = new THREE.Mesh(
    new THREE.SphereGeometry(1, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0xf2f9ff, flatShading: true })
  )
  drift.scale.set(s * (1.3 + rng() * 0.8), s * (0.42 + rng() * 0.2), s * (1 + rng() * 0.6))
  drift.rotation.y = rng() * Math.PI
  drift.name = 'snowDrift'
  return drift
}

function makeSnowman() {
  const g = new THREE.Group()
  g.name = 'snowman'
  const snow = flatMat(0xf4fafc)
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), snow); bot.position.y = 0.32
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 5), snow); mid.position.y = 0.78
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), snow); head.position.y = 1.14
  g.add(bot, mid, head)
  const coal = flatMat(0x20242c)
  for (const sx of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 4, 3), coal)
    eye.position.set(sx, 1.19, 0.17)
    g.add(eye)
  }
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.026, 4, 3), coal)
    btn.position.set(0, 0.68 + i * 0.12, 0.24 - i * 0.02)
    g.add(btn)
  }
  const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 5), flatMat(0xf5892e))
  carrot.geometry.rotateX(Math.PI / 2)
  carrot.position.set(0, 1.13, 0.28)
  g.add(carrot)
  const stick = flatMat(0x6e4a26)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.045), stick)
    arm.position.set(side * 0.42, 0.88, 0)
    arm.rotation.z = side * 0.5
    g.add(arm)
  }
  // OSHA-compliant hard hat: this snowman is ON SHIFT
  const hatMat = flatMat(0xf5a53b)
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.12, 8), hatMat)
  dome.position.y = 1.32
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.03, 8), hatMat)
  brim.position.y = 1.27
  g.add(dome, brim)
  // a tiny red scarf, for morale
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 5, 8), flatMat(0xd93b47))
  scarf.rotation.x = Math.PI / 2
  scarf.position.y = 0.99
  g.add(scarf)
  return g
}

function makeGasCanister(label, bodyCss, bandCss) {
  const tex = canvasTexture(96, 128, (c, W, H) => {
    c.fillStyle = bodyCss
    c.fillRect(0, 0, W, H)
    c.fillStyle = bandCss
    c.fillRect(0, 12, W, 18)
    // vertical stencil label
    c.save()
    c.translate(W / 2, H * 0.62)
    c.rotate(-Math.PI / 2)
    c.font = '900 17px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = 'rgba(255,255,255,0.92)'
    c.fillText(label, 0, 0)
    c.restore()
    // hazard diamond
    c.save()
    c.translate(W / 2, H - 22)
    c.rotate(Math.PI / 4)
    c.fillStyle = '#ffd83d'
    c.fillRect(-9, -9, 18, 18)
    c.strokeStyle = '#20242c'
    c.lineWidth = 2
    c.strokeRect(-9, -9, 18, 18)
    c.restore()
    c.fillStyle = '#20242c'
    c.font = '900 12px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.fillText('!', W / 2, H - 17)
  })
  const g = new THREE.Group()
  g.name = 'gasCanister'
  const cap = flatMat(STEEL_DARK)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 1.05, 9),
    [new THREE.MeshLambertMaterial({ map: tex, flatShading: true }), cap, cap]
  )
  body.position.y = 0.525
  g.add(body)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(new THREE.Color(bodyCss).getHex()))
  dome.position.y = 1.05
  g.add(dome)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 6), cap)
  neck.position.y = 1.3
  g.add(neck)
  const valve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.08), flatMat(0xd93b47))
  valve.position.y = 1.38
  g.add(valve)
  return g
}

function makeServerCrate(label, ledSeed = 1) {
  const rng = makeRng(0x5eed + ledSeed)
  const tex = canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#242e3d'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(122,220,240,0.5)'
    c.lineWidth = 5
    c.strokeRect(4, 4, W - 8, H - 8)
    // rack vents
    c.fillStyle = '#151b26'
    for (let i = 0; i < 4; i++) c.fillRect(12, 12 + i * 13, W - 24, 7)
    // LEDs
    for (let i = 0; i < 8; i++) {
      c.fillStyle = rng() < 0.6 ? '#37e05f' : '#7adcf0'
      c.fillRect(14 + i * 9, 66, 4, 4)
    }
    c.font = '900 13px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.fillStyle = '#9adcf0'
    c.fillText(label, W / 2, 86)
  })
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.74, 0.74),
    new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  )
  mesh.name = 'serverCrate'
  return mesh
}

function makeIceBlock(rng, size, withCoin) {
  const tex = canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#bfe6f5'
    c.fillRect(0, 0, W, H)
    c.fillStyle = 'rgba(255,255,255,0.5)'
    c.fillRect(0, 0, W, H * 0.22)
    // internal cracks
    c.strokeStyle = 'rgba(255,255,255,0.7)'
    c.lineWidth = 3
    for (let i = 0; i < 4; i++) {
      let x = rng() * W, y = rng() * H
      c.beginPath()
      c.moveTo(x, y)
      for (let s = 0; s < 3; s++) { x += (rng() - 0.5) * 50; y += (rng() - 0.5) * 50; c.lineTo(x, y) }
      c.stroke()
    }
    c.strokeStyle = 'rgba(90,150,190,0.8)'
    c.lineWidth = 5
    c.strokeRect(2.5, 2.5, W - 5, H - 5)
  })
  const g = new THREE.Group()
  g.name = 'iceBlock'
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshLambertMaterial({ map: tex, flatShading: true, transparent: true, opacity: 0.88 })
  )
  block.position.y = size / 2
  block.rotation.y = (rng() - 0.5) * 0.3
  g.add(block)
  if (withCoin) {
    // an asset frozen mid-pump — the literal cold wallet
    const coin = makeCoinMesh(size * 0.32, size * 0.1, { text: 'P', px: 64, faceBg: '#dff2fa', rimColor: 0x9fc8dc })
    coin.position.y = size / 2
    coin.rotation.set(0.3, 0.5, 0.2)
    g.add(coin)
  }
  return g
}

function makeLabBarrier(length) {
  const tex = canvasTexture(256, 48, (c, W, H) => {
    c.fillStyle = '#7adcf0'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#16324a'
    for (let x = -H; x < W + H; x += 36) {
      c.beginPath()
      c.moveTo(x, H); c.lineTo(x + 18, 0); c.lineTo(x + 34, 0); c.lineTo(x + 16, H)
      c.closePath(); c.fill()
    }
    c.font = '900 20px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.strokeStyle = '#7adcf0'
    c.lineWidth = 5
    c.strokeText('THIN ICE', W / 2, H / 2)
    c.fillStyle = '#16324a'
    c.fillText('THIN ICE', W / 2, H / 2)
  }, { repeat: [Math.max(1, Math.round(length / 4)), 1] })
  const g = new THREE.Group()
  g.name = 'labBarrier'
  const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, 0.1), new THREE.MeshLambertMaterial({ map: tex, flatShading: true }))
  rail.position.y = 0.55
  g.add(rail)
  const footMat = flatMat(STEEL_DARK)
  const nFeet = Math.max(2, Math.round(length / 4))
  for (let i = 0; i < nFeet; i++) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.4), footMat)
    foot.position.set(-length / 2 + (i + 0.5) * (length / nFeet), 0.31, 0)
    g.add(foot)
  }
  return g
}

// ---------------------------------------------------------------------------
// Penguin crowd — instanced lab-coat penguins with the same bounce/cheer/
// knockOver API shape as ArenaBase.buildCrowd, but a real penguin silhouette
// via baked vertex colors (black back, white coat, orange beak, tiny goggles).
// ---------------------------------------------------------------------------

function coloredGeo(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  const c = new THREE.Color(hex)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function mergeColored(geoms) {
  let total = 0
  for (const g of geoms) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  let off = 0
  for (const g of geoms) {
    pos.set(g.attributes.position.array, off * 3)
    nor.set(g.attributes.normal.array, off * 3)
    col.set(g.attributes.color.array, off * 3)
    off += g.attributes.position.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

function penguinGeometry() {
  const BLACK = 0x23262e, COAT = 0xf2f5f7, ORANGE = 0xf5a53b, GOGGLE = 0x7adcf0
  const parts = []
  const body = new THREE.SphereGeometry(0.3, 7, 5)
  body.scale(1, 1.25, 0.92); body.translate(0, 0.4, 0)
  parts.push(coloredGeo(body, BLACK))
  const coat = new THREE.SphereGeometry(0.27, 7, 5)
  coat.scale(0.92, 1.1, 0.62); coat.translate(0, 0.38, 0.13)
  parts.push(coloredGeo(coat, COAT))
  const head = new THREE.SphereGeometry(0.16, 6, 5)
  head.translate(0, 0.86, 0)
  parts.push(coloredGeo(head, BLACK))
  const face = new THREE.SphereGeometry(0.12, 6, 5)
  face.scale(1, 0.9, 0.55); face.translate(0, 0.86, 0.09)
  parts.push(coloredGeo(face, COAT))
  const beak = new THREE.ConeGeometry(0.055, 0.16, 5)
  beak.rotateX(Math.PI / 2); beak.translate(0, 0.84, 0.23)
  parts.push(coloredGeo(beak, ORANGE))
  const goggles = new THREE.BoxGeometry(0.24, 0.055, 0.06)
  goggles.translate(0, 0.93, 0.15)
  parts.push(coloredGeo(goggles, GOGGLE))
  for (const side of [-1, 1]) {
    const flip = new THREE.SphereGeometry(0.09, 5, 4)
    flip.scale(0.5, 1.5, 0.8); flip.translate(side * 0.3, 0.44, 0.04)
    parts.push(coloredGeo(flip, COAT)) // coat sleeves
    const foot = new THREE.BoxGeometry(0.12, 0.05, 0.18)
    foot.translate(side * 0.09, 0.025, 0.07)
    parts.push(coloredGeo(foot, ORANGE))
  }
  return mergeColored(parts)
}

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
const easeInOut = (t) => t * t * (3 - 2 * t)

function buildPenguinCrowd(opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 20))
  const areaW = opts.area?.w ?? 10
  const areaD = opts.area?.d ?? 2.2
  const rng = opts.rng || makeRng(0xf1a9)
  const bounceH = opts.bounce ?? 0.2

  const group = new THREE.Group()
  group.name = 'penguinCrowd'
  const geo = penguinGeometry()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(mesh)

  const rows = Math.max(1, Math.round(areaD / 0.85))
  const perRow = Math.ceil(count / rows)
  const baseX = new Float32Array(count)
  const baseY = new Float32Array(count)
  const baseZ = new Float32Array(count)
  const phase = new Float32Array(count)
  const speed = new Float32Array(count)
  const amp = new Float32Array(count)
  const size = new Float32Array(count)
  const color = new THREE.Color()
  const tints = [0xffffff, 0xe8f2ff, 0xfff2e4, 0xe0f6ff, 0xf0e8ff]

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const n = Math.min(perRow, count - row * perRow)
    baseX[i] = ((col + 0.5) / n) * areaW - areaW / 2 + (rng() - 0.5) * 0.3
    baseZ[i] = -row * 0.85 + (rng() - 0.5) * 0.2
    baseY[i] = row * 0.42
    phase[i] = rng() * Math.PI * 2
    speed[i] = 5 + rng() * 5
    amp[i] = 0.3 + rng() * 0.85
    size[i] = 0.85 + rng() * 0.4
    color.set(tints[Math.floor(rng() * tints.length)])
    color.offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.06)
    mesh.setColorAt(i, color)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

  // icy bleacher risers
  if (opts.risers !== false) {
    const riserMat = flatMat(0x8fa8bf)
    for (let r = 1; r < rows; r++) {
      const hgt = r * 0.42
      const riser = new THREE.Mesh(new THREE.BoxGeometry(areaW + 0.7, hgt, 0.85), riserMat)
      riser.position.set(0, hgt / 2, -r * 0.85)
      group.add(riser)
    }
  }

  const tipped = new Map()
  let time = rng() * 10
  let hypeExtra = 0
  const _pos = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _eul = new THREE.Euler()
  const _scl = new THREE.Vector3()
  const _m = new THREE.Matrix4()

  function composeUpright(i, hype) {
    const s = Math.sin(time * speed[i] + phase[i])
    const a = Math.abs(s) * amp[i] * hype
    const stretch = 0.8 + 0.42 * Math.abs(s) * (0.6 + 0.4 * hype)
    _pos.set(baseX[i], baseY[i] + a * bounceH, baseZ[i])
    // the famous scientific waddle
    _eul.set(0, Math.sin(time * speed[i] * 0.5 + phase[i]) * 0.22, Math.sin(time * speed[i] * 0.5 + phase[i]) * 0.08)
    _quat.setFromEuler(_eul)
    _scl.set(size[i] / Math.sqrt(stretch), size[i] * stretch, size[i] / Math.sqrt(stretch))
    _m.compose(_pos, _quat, _scl)
    mesh.setMatrixAt(i, _m)
  }

  function composeTipped(i, st) {
    let ang
    if (st.phase === 'fall') ang = -1.7 * easeOutBack(st.t)
    else if (st.phase === 'down') ang = -1.7 + Math.sin(time * 7 + phase[i]) * 0.03 // flipper-flapping, helpless
    else ang = -1.7 * (1 - easeInOut(st.t))
    _pos.set(baseX[i], baseY[i], baseZ[i])
    _eul.set(ang, 0, st.ztilt)
    _quat.setFromEuler(_eul)
    _scl.set(size[i], size[i], size[i])
    _m.compose(_pos, _quat, _scl)
    mesh.setMatrixAt(i, _m)
  }

  return {
    group,
    mesh,
    count,
    update(dt) {
      time += dt
      hypeExtra = Math.max(0, hypeExtra - dt * 1.4)
      const hype = 1 + hypeExtra
      for (let i = 0; i < count; i++) {
        const st = tipped.get(i)
        if (!st) { composeUpright(i, hype); continue }
        if (st.phase === 'fall') {
          st.t = Math.min(1, st.t + dt / 0.3)
          if (st.t >= 1) { st.phase = 'down'; st.timer = 2 + rng() * 2.5 }
        } else if (st.phase === 'down') {
          st.timer -= dt
          if (st.timer <= 0) { st.phase = 'rise'; st.t = 0 }
        } else {
          st.t = Math.min(1, st.t + dt / 0.5)
          if (st.t >= 1) { tipped.delete(i); composeUpright(i, hype); continue }
        }
        composeTipped(i, st)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
    cheer(strength = 1) { hypeExtra = Math.min(3, hypeExtra + strength) },
    knockOver(i) {
      if (i < 0 || i >= count || tipped.has(i)) return false
      tipped.set(i, { phase: 'fall', t: 0, timer: 0, ztilt: (rng() - 0.5) * 0.5 })
      return true
    },
    knockOverRandom(n = 3) {
      let done = 0
      for (let tries = 0; tries < n * 6 && done < n; tries++) {
        if (this.knockOver(Math.floor(rng() * count))) done++
      }
      return done
    },
    dispose() {
      geo.dispose()
      mat.dispose()
      if (mesh.dispose) mesh.dispose()
    },
  }
}

// ---------------------------------------------------------------------------
// Freeze-ray gantry hardware
// ---------------------------------------------------------------------------

function makeGantry() {
  const g = new THREE.Group()
  g.name = 'freezeGantry'
  const steel = flatMat(STEEL)
  const dark = flatMat(STEEL_DARK)
  // support columns just outside the walls
  for (const side of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.6, 0.7), steel)
    col.position.set(side * 9.6, 3.3, -0.6)
    g.add(col)
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), dark)
    brace.position.set(side * 9.15, 5.4, -0.6)
    brace.rotation.z = side * 0.5
    g.add(brace)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.2), dark)
    foot.position.set(side * 9.6, 0.15, -0.6)
    g.add(foot)
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(19.7, 0.3, 0.5), steel)
  rail.position.set(0, 6.55, -0.6)
  g.add(rail)
  const railTrim = new THREE.Mesh(new THREE.BoxGeometry(19.7, 0.1, 0.56), dark)
  railTrim.position.set(0, 6.36, -0.6)
  g.add(railTrim)

  // the trolley + turret
  const trolley = new THREE.Group()
  trolley.name = 'freezeTurret'
  trolley.position.set(-8.6, 6.2, -0.6)
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 0.75), dark)
  trolley.add(carriage)
  for (const wx of [-0.3, 0.3]) {
    for (const wz of [-0.3, 0.3]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 7), steel)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(wx, 0.26, wz)
      trolley.add(wheel)
    }
  }
  // coolant tanks — one has clearly been leaking
  for (const side of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 7), flatMat(0x9adcf0))
    tank.rotation.x = Math.PI / 2
    tank.position.set(side * 0.36, 0.05, -0.46)
    trolley.add(tank)
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffb063, flatShading: true, emissive: new THREE.Color(0xff8a2e), emissiveIntensity: 0.2 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), lampMat)
  lamp.position.set(0, 0.32, 0)
  trolley.add(lamp)
  // barrel assembly swings from a yoke — the malfunction is visible
  const barrelPivot = new THREE.Group()
  barrelPivot.position.set(0, -0.2, 0)
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), steel)
  yoke.position.y = -0.1
  barrelPivot.add(yoke)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), flatMat(0x6a7c8c))
  ball.position.y = -0.42
  barrelPivot.add(ball)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.15, 8), dark)
  barrel.position.y = -1.05
  barrelPivot.add(barrel)
  const muzzleMat = new THREE.MeshLambertMaterial({ color: 0x9adcf0, flatShading: true, emissive: new THREE.Color(ICE_GLOW), emissiveIntensity: 0.3 })
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 8), muzzleMat)
  muzzle.rotation.x = Math.PI / 2
  muzzle.position.y = -1.62
  barrelPivot.add(muzzle)
  // frost dripping off the carriage
  for (const ix of [-0.35, 0.2]) {
    const ice = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), flatMat(0xd8f2ff))
    ice.rotation.x = Math.PI
    ice.position.set(ix, -0.32, 0.3)
    trolley.add(ice)
  }
  trolley.add(barrelPivot)
  g.add(trolley)
  return { group: g, trolley, barrelPivot, lampMat, muzzleMat }
}

function makeBeam() {
  const group = new THREE.Group()
  group.name = 'freezeBeam'
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.66, 6.2, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: ICE_GLOW, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  )
  outer.position.y = 3.1
  group.add(outer)
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 6.2, 6),
    new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  )
  core.position.y = 3.1
  group.add(core)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.09, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0xbff2ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06
  group.add(ring)
  const splash = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 12),
    new THREE.MeshBasicMaterial({ color: ICE_GLOW, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  )
  splash.rotation.x = -Math.PI / 2
  splash.position.y = 0.045
  group.add(splash)
  group.visible = false
  return { group, outer, core, ring }
}

function makeWarningStripe() {
  const tex = canvasTexture(512, 48, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    c.fillStyle = 'rgba(122,220,240,0.5)'
    for (let x = -H; x < W + H; x += 40) {
      c.beginPath()
      c.moveTo(x, H); c.lineTo(x + 18, 0); c.lineTo(x + 36, 0); c.lineTo(x + 18, H)
      c.closePath(); c.fill()
    }
    c.font = '900 26px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = 'rgba(232,251,255,0.95)'
    c.fillText('COLD ZONE', W * 0.25, H / 2)
    c.fillText('COLD ZONE', W * 0.75, H / 2)
  })
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(18.4, 1.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, 0.025, -0.1)
  mesh.name = 'warningStripe'
  return mesh
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

const MALFUNCTION_LINES = ['FREEZE RAY MALFUNCTION!', 'COOLANT LEAK DETECTED!', 'ICE TO MEET YOU!', 'SUB-ZERO INTEREST RATES!']
const GAS_LINES = ['GAS FEES!', 'HOPIUM LEAK!', 'PRESSURE RELEASED!']

// freeze-ray cycle timing (~9s total)
const RAY_IDLE = 5.4
const RAY_TELEGRAPH = 1.4
const RAY_SWEEP = 2.2
const RAY_MIN_X = -8.6
const RAY_MAX_X = 8.6

class FrozenTokenLabArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.55 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0x1cebe7)
    this._time = 0
    this._crowds = []
    this._fighters = []          // fighter refs learned via onRagdollLaunch
    this._freezeCool = new Map() // fighter -> cooldown seconds
    this._malfLine = 0
    this._gasLine = 0

    // freeze-ray state machine (v2.0: each sweep also picks a z track and the
    // barrel visibly tilts to rake that band of the floor)
    this._ray = { phase: 'idle', t: RAY_IDLE + 1.2, dir: 1, x: RAY_MIN_X, z: 0, blips: 0, shoved: new Set() }

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildFloor()
    this._buildBackdrop()
    this._buildVatsAndRigs()
    this._buildCrowds()
    this._buildFreezeRay()
    this._buildFxPools()
    this._buildProps()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction --------------------------------------------------------

  _buildPhysics() {
    // floor slab + invisible bouncy walls on all four sides at the bounds
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    const sky = makeAuroraSky(this._rng)
    this.group.add(sky.mesh)
    this.addUpdater(sky.update)
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xbfe4ff, hemiGround: 0x7e93aa, hemiIntensity: 1.0,
      sunColor: 0xdcecff, sunIntensity: 1.45, sunPos: [-9, 16, 10],
      fillColor: 0xb9a6e0, fillIntensity: 0.45, fillPos: [8, 6, 12],
      fog: { color: 0xa8ccdf, near: 32, far: 84 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildFloor() {
    const tex = makeIceFloorTexture(this._rng)
    const sideMat = flatMat(0x4a7a96)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 26), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -3)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)
    // endless polar shelf beyond the lab pad
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), flatMat(0xdceef8))
    shelf.rotation.x = -Math.PI / 2
    shelf.position.y = -0.32
    this.group.add(shelf)
    // glossy frost decals on the fight floor — pure slippery LOOK
    const decalTex = makeFrostDecalTexture(this._rng)
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, opacity: 0.75, depthWrite: false })
    for (const [x, z, s, r] of [[-4.2, 0.4, 3.4, 0.4], [3.6, -0.9, 2.7, 2.2], [0.6, 1.1, 2.0, 4.0]]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.8), decalMat)
      decal.rotation.set(-Math.PI / 2, 0, r)
      decal.position.set(x, 0.012, z)
      this.group.add(decal)
    }
  }

  _buildBackdrop() {
    const rng = this._rng

    // -- main lab wall
    const wallTex = makeWallTexture(rng)
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, flatShading: true })
    const wallCap = flatMat(0x3c4a58)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(46, 7, 1.2), [wallCap, wallCap, wallCap, wallCap, wallMat, wallCap])
    wall.position.set(0, 3.5, -12.3)
    this.group.add(wall)
    // side wings angled in
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 1.2), [wallCap, wallCap, wallCap, wallCap, wallMat, wallCap])
      wing.position.set(side * 17.5, 3, -6.5)
      wing.rotation.y = side * Math.PI / 2.3
      this.group.add(wing)
    }
    // roof lip + icicle fringe along the wall top
    const lip = new THREE.Mesh(new THREE.BoxGeometry(46.6, 0.4, 1.6), flatMat(0x2c3844))
    lip.position.set(0, 7.15, -12.25)
    this.group.add(lip)
    this.group.add(makeIcicles(rng, [
      { y: 7.0, z: -11.6, x0: -22, x1: 22, n: 34 },
      { y: 6.4, z: -0.34, x0: -9, x1: 9, n: 10 }, // gantry rail fringe
    ]))

    // -- marquee + flavor signs
    const marquee = makeSign('FROZEN TOKEN LAB', {
      w: 8.4, h: 2.0, depth: 0.3, px: 80,
      bg: ICE_DEEP, fg: '#9adcf0', border: '#cfeeff', stroke: '#04101f',
      sub: 'FATTY PINGO COLD STORAGE · PROOF OF FREEZE', subColor: '#b9d8ea',
    })
    marquee.position.set(0, 5.85, -11.6)
    marquee.rotation.x = -0.05
    this.group.add(marquee)
    const cw = makeSign('COLD WALLETS ONLY', { w: 3.6, h: 0.8, depth: 0.14, px: 72, bg: '#16324a', fg: '#dff2fa', border: '#7adcf0' })
    cw.position.set(-6.2, 3.6, -11.6)
    cw.rotation.z = 0.04
    this.group.add(cw)
    const brrr = makeSign('HASH RATE: BRRR', { w: 3.4, h: 0.75, depth: 0.14, px: 72, bg: '#0b3d22', fg: '#37e05f', border: '#37e05f' })
    brrr.position.set(6.4, 3.55, -11.6)
    brrr.rotation.z = -0.03
    this.group.add(brrr)
    const lick = makeSign('DO NOT LICK', { w: 2.2, h: 0.6, depth: 0.1, px: 72, bg: '#5a1626', fg: '#ffd0d8', border: '#ffd0d8' })
    lick.position.set(-11.2, 1.7, -4.3)
    lick.rotation.y = 0.55
    this.group.add(lick)

    // -- giant frozen $PENG medallion leaning on the wall
    const medallion = makeCoinMesh(1.9, 0.42, { text: 'P', px: 192, faceBg: '#a8e0f5', rimColor: 0x6fb8d8 })
    medallion.position.set(-14.6, 1.9, -9.4)
    medallion.rotation.set(0.1, 0.55, 0.24)
    this.group.add(medallion)
    // and one flash-frozen inside a display block (decor, not physics)
    const showcase = makeIceBlock(rng, 1.7, true)
    showcase.position.set(12.6, 0, -8.2)
    showcase.rotation.y = -0.4
    this.group.add(showcase)

    // -- snow drifts hugging the edges (all outside the fight floor)
    const driftSpots = [
      [-11.6, -1.8, 1.4], [-12.8, 2.2, 1.1], [11.8, -2.4, 1.5], [12.6, 1.6, 1.0],
      [-15.5, -7.5, 2.0], [15.8, -6.8, 1.8], [-6.5, -11.2, 1.6], [7.8, -11.4, 1.5],
    ]
    for (const [x, z, s] of driftSpots) {
      const d = makeSnowDrift(rng, s)
      d.position.set(x, 0, z)
      this.group.add(d)
    }

    // -- parked zamboni... no wait, a forklift-sized shovel. Keep it simple:
    // a decor snowman colony back-left, waving at the fight
    for (const [x, z, sc] of [[-13.6, -6.2, 0.9], [-14.6, -5.4, 0.7]]) {
      const sm = makeSnowman()
      sm.position.set(x, 0, z)
      sm.scale.setScalar(sc)
      sm.rotation.y = 0.9 + rng() * 0.4
      this.group.add(sm)
    }
  }

  _buildVatsAndRigs() {
    const rng = this._rng

    // -- glass token vats (glow keepers of the frozen treasury)
    const vatSpots = [
      [-12.4, -5.0, 0.5], [12.6, -5.4, -0.5], [-10.6, -8.8, 0.2], [4.6, -10.6, 0.1],
    ]
    for (const [x, z, ry] of vatSpots) {
      const vat = makeTokenVat(rng)
      vat.group.position.set(x, 0, z)
      vat.group.rotation.y = ry
      this.group.add(vat.group)
      this.addUpdater(vat.update)
    }

    // -- twin tesla-coil mining rigs + the big arc between them
    this._rigs = []
    for (const side of [-1, 1]) {
      const rig = makeMiningRig(rng)
      rig.group.position.set(side * 7.4, 0, -9.7)
      rig.group.rotation.y = side * -0.2
      this.group.add(rig.group)
      this._rigs.push(rig)
    }
    const tipA = new THREE.Vector3(), tipB = new THREE.Vector3()
    const bigArc = makeArc(9, rng, 0.06)
    this.group.add(bigArc.group)
    const miniArcs = []
    for (const side of [-1, 1]) {
      const mini = makeArc(5, rng, 0.04)
      this.group.add(mini.group)
      miniArcs.push({ arc: mini, side })
    }
    // wall lightning rods the mini arcs jump to
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 5), flatMat(STEEL_DARK))
      rod.position.set(side * 9.4, 3.0, -11.5)
      rod.rotation.z = side * -0.35
      this.group.add(rod)
    }

    // arc flicker driver
    const st = { next: 1.2 + rng() * 2, active: 0, jitter: 0 }
    this.addUpdater((dt) => {
      if (st.active > 0) {
        st.active -= dt
        st.jitter -= dt
        if (st.jitter <= 0) {
          st.jitter = 0.075
          this._rigs[0].tip.getWorldPosition(tipA)
          this._rigs[1].tip.getWorldPosition(tipB)
          bigArc.layout(tipA, tipB, 0.85)
          for (const m of miniArcs) {
            const from = m.side < 0 ? tipA : tipB
            m.arc.layout(from, new THREE.Vector3(m.side * 9.4, 3.6, -11.5), 0.4)
          }
        }
        const on = st.active > 0
        bigArc.setVisible(on)
        for (const m of miniArcs) m.arc.setVisible(on)
        for (const r of this._rigs) r.sphereMat.emissiveIntensity = on ? 1.6 : 0.35
      } else {
        st.next -= dt
        // idle simmer
        for (const r of this._rigs) r.sphereMat.emissiveIntensity = 0.3 + (Math.sin(this._time * 3.1) * 0.5 + 0.5) * 0.25
        if (st.next <= 0) {
          st.next = 1.4 + rng() * 2.2
          st.active = 0.3 + rng() * 0.35
          st.jitter = 0
          this.emit('arena:tesla', { seconds: st.active })
        }
      }
    })
  }

  _buildCrowds() {
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const nBack = Math.round(total * 0.46)
    const nSide = Math.max(4, Math.floor((total - nBack) / 2))
    const rng = this._rng

    const back = buildPenguinCrowd({ count: nBack, area: { w: 22, d: 2.6 }, rng })
    back.group.position.set(0, 0, -7.4)
    this.group.add(back.group)

    const left = buildPenguinCrowd({ count: nSide, area: { w: 12, d: 2.2 }, rng })
    left.group.position.set(-12.4, 0, -0.5)
    left.group.rotation.y = Math.PI / 2 // beaks toward the science
    this.group.add(left.group)

    const right = buildPenguinCrowd({ count: nSide, area: { w: 12, d: 2.2 }, rng })
    right.group.position.set(12.4, 0, -0.5)
    right.group.rotation.y = -Math.PI / 2
    this.group.add(right.group)

    this._crowdBack = back
    this._crowdLeft = left
    this._crowdRight = right
    this._crowds = [back, left, right]
    for (const c of this._crowds) this.addUpdater((dt) => c.update(dt))

    // THIN ICE barriers between the flock and the fisticuffs
    const backBar = makeLabBarrier(24)
    backBar.position.set(0, 0, -5.8)
    this.group.add(backBar)
    for (const side of [-1, 1]) {
      const bar = makeLabBarrier(12)
      bar.position.set(side * 10.6, 0, -0.5)
      bar.rotation.y = side * Math.PI / 2
      this.group.add(bar)
    }
  }

  _buildFreezeRay() {
    const gantry = makeGantry()
    this.group.add(gantry.group)
    this._gantry = gantry

    const beam = makeBeam()
    beam.group.position.z = -0.1
    this.group.add(beam.group)
    this._beam = beam

    this._stripe = makeWarningStripe()
    this.group.add(this._stripe)

    this.addUpdater((dt) => this._updateFreezeRay(dt))
  }

  // pooled frost puffs (beam trail, freeze hits, gas bursts) + fighter ice cubes
  _buildFxPools() {
    const cap = Math.max(6, Math.round(12 * (this.quality.particleScale ?? 0.75)))
    this._puffs = []
    for (let i = 0; i < cap; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xf0faff, flatShading: true, transparent: true, opacity: 0 })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), mat)
      mesh.visible = false
      this.group.add(mesh)
      this._puffs.push({ mesh, mat, t: 1, dur: 0.6, scale: 1, vy: 0 })
    }
    this._puffCursor = 0
    this.addUpdater((dt) => {
      for (const p of this._puffs) {
        if (p.t >= 1) { p.mesh.visible = false; continue }
        p.t = Math.min(1, p.t + dt / p.dur)
        p.mesh.position.y += p.vy * dt
        const k = p.t
        p.mesh.scale.setScalar(p.scale * (0.4 + k * 1.4))
        p.mat.opacity = 0.85 * (1 - k * k)
      }
    })

    // two ice-cube overlays (one per fighter, max)
    this._cubes = []
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: 0xaee6ff, flatShading: true, transparent: true, opacity: 0.55,
        emissive: new THREE.Color(0x2e8ab8), emissiveIntensity: 0.5,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
      mesh.visible = false
      this.group.add(mesh)
      this._cubes.push({ mesh, mat, t: 1, f: null, h: 2 })
    }
    this.addUpdater((dt) => {
      for (const cbe of this._cubes) {
        if (cbe.t >= 1) { cbe.mesh.visible = false; cbe.f = null; continue }
        cbe.t = Math.min(1, cbe.t + dt / 0.6)
        const p = cbe.f?.pos
        if (p) cbe.mesh.position.set(p.x, (p.y || 0) + cbe.h * 0.5, p.z ?? 0)
        let s = 1
        if (cbe.t < 0.18) s = easeOutBack(cbe.t / 0.18)
        else if (cbe.t > 0.78) s = Math.max(0.001, 1 - (cbe.t - 0.78) / 0.22)
        cbe.mesh.scale.set(1.35 * s, cbe.h * 1.06 * s, 1.15 * s)
        cbe.mat.opacity = 0.55 * Math.min(1, s)
      }
    })
  }

  _puff(x, y, z, scale = 1, vy = 0.8) {
    const p = this._puffs[this._puffCursor++ % this._puffs.length]
    p.t = 0
    p.dur = 0.45 + this._rng() * 0.3
    p.scale = scale
    p.vy = vy
    p.mesh.position.set(x, y, z)
    p.mesh.visible = true
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

    // v2.0 free-roam: lab clutter scatters across the open ice floor (center
    // lane kept mostly clear).

    // ice blocks — one with a coin frozen inside, one stacked on top
    place(makeIceBlock(rng, 0.82, true), -5.8, -3.6, 0.2, { shape: 'box', mass: 5, health: 18, kind: 'iceBlock' })
    const small = makeIceBlock(rng, 0.52, false)
    small.position.y = 0.82
    place(small, -5.75, -3.64, 0.7, { shape: 'box', mass: 2.5, health: 10, kind: 'iceBlock' })

    // pressurized comedy (the BIG break)
    place(makeGasCanister('HOPIUM', '#d95d3f', '#ffd83d'), -4.2, 3.7, 0.4, { shape: 'cylinder', mass: 6, health: 14, kind: 'gasCanister' })
    place(makeGasCanister('FUD GAS', '#3f5dc9', '#9adcf0'), 6.9, -3.3, -0.6, { shape: 'cylinder', mass: 6, health: 14, kind: 'gasCanister' })

    // cold wallets (server crates), stacked with zero cable management
    place(makeServerCrate('COLD WALLET', 1), 5.4, 3.8, 0.35, { shape: 'box', mass: 4, health: 16, kind: 'serverCrate' })
    const crate2 = makeServerCrate('SEED VAULT', 2)
    crate2.position.y = 0.74
    place(crate2, 5.35, 3.75, -0.3, { shape: 'box', mass: 3.5, health: 14, kind: 'serverCrate' })

    // the site foreman
    place(makeSnowman(), -7.9, 2.6, -0.3, { shape: 'box', mass: 4, health: 12, kind: 'snowman' })

    // props start centered on their pivots for physics; nudge Y so boxes sit
    // on the floor (addProp uses the mesh bbox, pivots are at the base).
  }

  _wireEvents() {
    // penguins are peer reviewing every punch
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.25 + Math.min(0.8, combo * 0.07) + (e?.counter ? 0.4 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.2) })
    this.listen('fighter:ko', () => { for (const c of this._crowds) c.cheer(3) })
    this.listen('round:end', () => { for (const c of this._crowds) c.cheer(2) })

    // breakable flavor
    this.listen('physics:break', (e) => {
      if (!e) return
      if (e.kind === 'gasCanister') this._gasBoom(e.pos)
      else if (e.kind === 'snowman') {
        this.emit('caption', { text: 'NOT THE SNOWMAN' })
        try { this.audio?.crowd?.('gasp') } catch (err) { /* stunned silence */ }
        this.emit('camera:shake', { mag: 0.25 })
      } else if (e.kind === 'iceBlock' && e.pos) {
        for (let i = 0; i < 3; i++) this._puff(e.pos.x + (this._rng() - 0.5) * 0.6, e.pos.y, e.pos.z, 0.8, 1.2)
        for (const c of this._crowds) c.cheer(0.8)
      }
    })
  }

  // -- hazard: the malfunctioning freeze ray --------------------------------

  _updateFreezeRay(dt) {
    const r = this._ray
    const g = this._gantry
    r.t -= dt

    if (r.phase === 'idle') {
      // barrel dangles, lamp pulses lazily: clearly not OK
      g.barrelPivot.rotation.z = Math.sin(this._time * 0.7) * 0.16
      g.barrelPivot.rotation.x *= Math.max(0, 1 - dt * 3)
      g.lampMat.emissiveIntensity = 0.15 + (Math.sin(this._time * 1.5) * 0.5 + 0.5) * 0.2
      g.muzzleMat.emissiveIntensity = 0.25
      this._stripe.material.opacity = Math.max(0, this._stripe.material.opacity - dt * 1.5)
      if (r.t <= 0) {
        r.phase = 'telegraph'
        r.t = RAY_TELEGRAPH
        r.dir = -r.dir
        r.x = r.dir > 0 ? RAY_MIN_X : RAY_MAX_X
        r.z = -3.6 + this._rng() * 7.2 // v2.0: pick the z band this pass rakes
        this._stripe.position.z = r.z
        this._beam.group.position.z = r.z
        r.blips = 0
        r.shoved.clear()
        this.emit('arena:freezeray', { phase: 'telegraph', dir: r.dir, z: r.z })
        this.emit('caption', { text: MALFUNCTION_LINES[this._malfLine++ % MALFUNCTION_LINES.length] })
      }
      return
    }

    if (r.phase === 'telegraph') {
      const k = 1 - r.t / RAY_TELEGRAPH
      // trolley hustles to its start mark, barrel locks onto the target band
      g.trolley.position.x += (r.x - g.trolley.position.x) * Math.min(1, dt * 6)
      g.barrelPivot.rotation.z *= Math.max(0, 1 - dt * 8)
      const aimX = Math.atan2(r.z + 0.6, 6.0) // rail rides at z=-0.6, muzzle ~6m up
      g.barrelPivot.rotation.x += (aimX - g.barrelPivot.rotation.x) * Math.min(1, dt * 8)
      // panic lamp + blinking floor stripe + klaxon blips
      const blink = Math.sin(this._time * 34) > 0
      g.lampMat.emissiveIntensity = blink ? 1.6 : 0.2
      this._stripe.material.opacity = blink ? 0.5 : 0.18
      g.muzzleMat.emissiveIntensity = 0.3 + k * 1.4
      if (k * 3 >= r.blips + 1) {
        r.blips++
        this.sfx('menu_move', { pitch: 0.55, vol: 0.55 })
      }
      if (r.t <= 0) {
        r.phase = 'sweep'
        r.t = RAY_SWEEP
        this._beam.group.visible = true
        this.emit('arena:freezeray', { phase: 'fire', dir: r.dir, z: r.z })
        this.emit('camera:shake', { mag: 0.22 })
        this.sfx('whoosh', { pitch: 0.5, vol: 0.9 })
        this.sfx('slide', { pitch: 0.8, vol: 0.35 })
      }
      return
    }

    // -- sweep
    const k = 1 - r.t / RAY_SWEEP
    const ease = k * k * (3 - 2 * k) // smoothstep: winds up, screams across, eases out
    r.x = (r.dir > 0 ? RAY_MIN_X : RAY_MAX_X) + (r.dir > 0 ? 1 : -1) * (RAY_MAX_X - RAY_MIN_X) * ease
    g.trolley.position.x = r.x
    this._beam.group.position.x = r.x
    const throb = 1 + Math.sin(this._time * 30) * 0.08
    this._beam.outer.scale.set(throb, 1, throb)
    this._beam.ring.rotation.z += dt * 4
    g.lampMat.emissiveIntensity = 1.6
    g.muzzleMat.emissiveIntensity = 1.8
    this._stripe.material.opacity = Math.max(0, 0.25 - k * 0.2)

    // frosty wake along the floor
    if (this._rng() < dt * 14) this._puff(r.x + (this._rng() - 0.5) * 0.4, 0.15, r.z + (this._rng() - 0.5) * 0.5, 0.7, 1.6)

    // shove props out of the beam's way (once per prop per sweep, 2D zone)
    for (const h of this.props) {
      if (!h || !h.alive || r.shoved.has(h)) continue
      const bp = h.body?.position
      if (!bp || Math.abs(bp.x - r.x) > 0.9 || Math.abs((bp.z ?? 0) - r.z) > 1.2) continue
      r.shoved.add(h)
      try { this.physics?.impulse?.(h, [r.dir * 2.5, 5 + this._rng() * 2, (this._rng() - 0.5) * 2]) } catch (e) { /* prop declined */ }
      this._puff(bp.x, bp.y, bp.z, 0.9, 1.4)
    }

    // fighters caught in the column (jump it — or sidestep it!) — refs learned
    // from ragdoll launches; the arena has no direct roster API (CONTRACTS §9).
    for (const f of this._fighters) {
      const p = f?.pos
      if (!p) continue
      const cool = this._freezeCool.get(f) || 0
      if (cool > 0) { this._freezeCool.set(f, cool - dt); continue }
      if (Math.abs(p.x - r.x) < 0.75 && Math.abs((p.z ?? 0) - r.z) < 0.9 && (p.y || 0) < 1.3) this._freezeFighter(f)
    }

    if (r.t <= 0) {
      r.phase = 'idle'
      r.t = RAY_IDLE
      this._beam.group.visible = false
      this.emit('arena:freezeray', { phase: 'end' })
    }
  }

  _freezeFighter(f) {
    this._freezeCool.set(f, 2.5)
    // grab a cube not already busy with this fighter
    const cube = this._cubes.find((c) => c.f === null || c.t >= 1) || this._cubes[0]
    cube.f = f
    cube.t = 0
    cube.h = Math.max(1.2, f.def?.height ?? 2)
    cube.mesh.visible = true
    const p = f.pos
    for (let i = 0; i < 4; i++) this._puff(p.x + (this._rng() - 0.5) * 0.9, (p.y || 0) + 0.4 + i * 0.4, (p.z ?? 0), 0.8, 0.9)
    this.emit('caption', { text: 'COLD STORAGE' })
    this.emit('camera:shake', { mag: 0.4 })
    this.emit('arena:freezeray', { phase: 'hit', slot: f.slot, x: p.x, z: p.z ?? 0 })
    this.sfx('coin', { pitch: 1.8, vol: 0.7 })
    this.sfx('block', { pitch: 0.55, vol: 0.85 })
    for (const c of this._crowds) c.cheer(1.4)
  }

  // -- the BIG break --------------------------------------------------------

  _gasBoom(pos) {
    const p = pos || { x: 0, y: 0.5, z: 0 }
    this.emit('caption', { text: GAS_LINES[this._gasLine++ % GAS_LINES.length] })
    this.emit('camera:shake', { mag: 0.8 })
    this.emit('arena:gasboom', { pos: { x: p.x, y: p.y, z: p.z } })
    this.sfx('explosion', { vol: 1 })
    try { this.audio?.crowd?.('wild') } catch (e) { /* deafened */ }
    // frost mushroom
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      this._puff(p.x + Math.cos(a) * 0.5, p.y + 0.3 + this._rng() * 0.6, p.z + Math.sin(a) * 0.4, 1.6 + this._rng(), 2.2)
    }
    // shove everything nearby — physics comedy is a team sport
    for (const h of this.props) {
      if (!h || !h.alive) continue
      const bp = h.body?.position
      if (!bp) continue
      const dx = bp.x - p.x, dz = bp.z - p.z
      const d = Math.hypot(dx, dz)
      if (d > 3.2) continue
      const s = 9 * (1 - d / 3.2)
      try { this.physics?.impulse?.(h, [dx / (d || 1) * s, 4 + s * 0.4, dz / (d || 1) * s]) } catch (e) { /* fine */ }
    }
    // the nearest penguin pen loses composure
    const side = p.x >= 0 ? this._crowdRight : this._crowdLeft
    side?.knockOverRandom(2 + Math.floor(this._rng() * 3))
    for (const c of this._crowds) c.cheer(2.5)
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    try { this.audio?.crowd?.('wild') } catch (e) { /* frozen mics */ }
    for (const c of this._crowds) c.cheer(2.2)
    if (fighter && !this._fighters.includes(fighter)) this._fighters.push(fighter)
    if (this.physics?.presetName === 'unhinged') {
      const side = (fighter?.pos?.x ?? 0) >= 0 ? this._crowdRight : this._crowdLeft
      side?.knockOverRandom(3 + Math.floor(this._rng() * 4))
      this._crowdBack?.knockOverRandom(1 + Math.floor(this._rng() * 3))
      this.sfx('boing', { vol: 0.5 })
    }
  }

  dispose() {
    if (this._disposed) return
    this._fighters.length = 0
    this._freezeCool.clear()
    for (const c of this._crowds) { try { c.dispose() } catch (e) { /* already thawed */ } }
    this._crowds.length = 0
    super.dispose() // listeners off, prop handles removed, fog restored, group freed
  }
}

export const FrozenTokenLab = {
  id: 'frozen-token-lab',
  name: 'FROZEN TOKEN LAB',
  music: 'battle_frozen_lab',
  build(ctx) { return new FrozenTokenLabArena(ctx) },
}
