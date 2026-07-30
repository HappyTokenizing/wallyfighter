// ============================================================================
// INSTITUTIONAL CAPITAL TOWER — Tired Ape's stage (story round 7). The
// executive top floor of a fund that is Definitely Fine, at golden hour:
// floor-to-ceiling glass over a painted sunset skyline, a marble monogram
// medallion, rows of breakable desks with monitors, executive chairs that
// ROLL, a water cooler, ficus trees nobody waters, a wall of market screens
// that only knows one direction, and cubicles full of interns typing until
// told to cheer. Signature hazard: a rail-mounted JUMBO market screen that
// periodically remembers gravity ("MARGIN CALL").
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, makeCandlestickChart, buildCrowd,
} from './ArenaBase.js'

const TAU = Math.PI * 2
const easeInOut = (t) => t * t * (3 - 2 * t)

// interns wear whatever HR tolerates
const INTERN_PALETTE = ['#f2f1ea', '#9fc3e8', '#c9d2dc', '#3f5dc9', '#8a939e', '#e8c7a0', '#b7d9b0', '#e8a0b8']

// hazard geometry constants
const HAZ_Z = -1.35        // rail depth (screen swings to ~z 0.5 as it falls flat)
const HANG_Y = 5.95        // drop-group rest height (top pivot, at the trolley)
const REST_Y = 0.7         // drop-group height when the screen lies on the floor
const DROP_ROT = -1.35     // final face-plant rotation (radians about X)

const CRASH_LINES = ['MARGIN CALL', 'STOP LOSS: YOU', 'LIQUIDATED', 'SELL PRESSURE']
const CRUSH_SKIP_STATES = new Set(['ko', 'finisher', 'grabbed', 'win', 'lose'])

// ---------------------------------------------------------------------------
// module-private texture / mesh factories
// ---------------------------------------------------------------------------

function makeMarbleTexture(rng) {
  // 4x4 big marble tiles per canvas, repeated. Veins drawn as lazy beziers.
  const TILES = 4, TP = 128
  return canvasTexture(TILES * TP, TILES * TP, (c, W, H) => {
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        const j = (rng() - 0.5) * 10
        c.fillStyle = `rgb(${Math.round(226 + j)},${Math.round(219 + j)},${Math.round(203 + j)})`
        c.fillRect(tx * TP, ty * TP, TP, TP)
        // veins
        c.strokeStyle = 'rgba(150,135,110,0.35)'
        for (let v = 0; v < 3; v++) {
          c.lineWidth = 1.5 + rng() * 2
          c.beginPath()
          const x0 = tx * TP + rng() * TP, y0 = ty * TP
          c.moveTo(x0, y0)
          c.bezierCurveTo(
            x0 + (rng() - 0.5) * 70, y0 + TP * 0.35,
            x0 + (rng() - 0.5) * 70, y0 + TP * 0.7,
            tx * TP + rng() * TP, y0 + TP
          )
          c.stroke()
        }
        // the odd gold fleck — this floor cost more than your house
        if (rng() < 0.3) {
          c.fillStyle = 'rgba(217,163,37,0.4)'
          c.fillRect(tx * TP + rng() * (TP - 6), ty * TP + rng() * (TP - 6), 4, 4)
        }
        // grout
        c.strokeStyle = 'rgba(120,110,95,0.6)'
        c.lineWidth = 3
        c.strokeRect(tx * TP + 1.5, ty * TP + 1.5, TP - 3, TP - 3)
      }
    }
  }, { repeat: [3.2, 2.1] })
}

function makeMedallionMesh() {
  const tex = canvasTexture(512, 512, (c, W, H) => {
    const cx = W / 2, cy = H / 2
    // gold outer ring with notches
    c.fillStyle = '#d9a325'
    c.beginPath(); c.arc(cx, cy, W * 0.49, 0, TAU); c.fill()
    c.strokeStyle = '#a8791a'
    c.lineWidth = 5
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU
      c.beginPath()
      c.moveTo(cx + Math.cos(a) * W * 0.455, cy + Math.sin(a) * W * 0.455)
      c.lineTo(cx + Math.cos(a) * W * 0.485, cy + Math.sin(a) * W * 0.485)
      c.stroke()
    }
    // navy field
    c.fillStyle = '#132a63'
    c.beginPath(); c.arc(cx, cy, W * 0.435, 0, TAU); c.fill()
    // circular text
    c.fillStyle = '#e8c96a'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const ringText = '· INSTITUTIONAL CAPITAL TOWER · FLOOR 88 · UP ONLY '
    c.font = `700 ${Math.round(W * 0.052)}px "Times New Roman", Georgia, serif`
    const step = TAU / ringText.length
    for (let i = 0; i < ringText.length; i++) {
      const a = i * step - Math.PI / 2
      c.save()
      c.translate(cx + Math.cos(a) * W * 0.385, cy + Math.sin(a) * W * 0.385)
      c.rotate(a + Math.PI / 2)
      c.fillText(ringText[i], 0, 0)
      c.restore()
    }
    // inner gold ring
    c.strokeStyle = '#d9a325'
    c.lineWidth = W * 0.014
    c.beginPath(); c.arc(cx, cy, W * 0.315, 0, TAU); c.stroke()
    // laurel dots (prestige, procedurally)
    c.fillStyle = '#8fae5a'
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI / 2 + side * (0.55 + i * 0.17)
        const r = W * (0.26 - i * 0.004)
        c.beginPath()
        c.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, W * 0.016, W * 0.028, a, 0, TAU)
        c.fill()
      }
    }
    // the monogram
    c.fillStyle = '#e8c96a'
    c.font = `900 ${Math.round(W * 0.24)}px "Times New Roman", Georgia, serif`
    c.fillText('IC', cx, cy - H * 0.055)
    c.font = `900 ${Math.round(W * 0.15)}px "Times New Roman", Georgia, serif`
    c.fillText('T', cx, cy + H * 0.135)
    c.font = `700 ${Math.round(W * 0.036)}px "Times New Roman", Georgia, serif`
    c.fillText('EST. 1998 · TRUST US', cx, cy + H * 0.235)
  }, { nearest: false })
  const side = flatMat(0xb08a2a)
  const top = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 0.05, 36), [side, top, side])
  mesh.name = 'medallion'
  return mesh
}

function makeCeilingTexture() {
  // acoustic tiles: the most 2002 texture in existence
  return canvasTexture(128, 128, (c, W, H) => {
    c.fillStyle = '#ded9cc'
    c.fillRect(0, 0, W, H)
    c.fillStyle = 'rgba(90,85,70,0.25)'
    for (let i = 0; i < 260; i++) c.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5)
    c.strokeStyle = 'rgba(110,105,92,0.7)'
    c.lineWidth = 4
    c.strokeRect(0, 0, W / 2, H / 2); c.strokeRect(W / 2, 0, W / 2, H / 2)
    c.strokeRect(0, H / 2, W / 2, H / 2); c.strokeRect(W / 2, H / 2, W / 2, H / 2)
  }, { repeat: [10, 7] })
}

function makeSkylineTexture(rng, opts = {}) {
  // transparent canvas, building silhouettes only — the sky dome shows through
  const W = 1024, H = 256
  const body = opts.color ?? '#2e2750'
  const lit = opts.lit ?? '#ffb35c'
  return canvasTexture(W, H, (c) => {
    let x = 0
    while (x < W) {
      const bw = 30 + rng() * 70
      const bh = 60 + rng() * 165
      c.fillStyle = body
      c.fillRect(x, H - bh, bw, bh)
      // stepped crown on some towers
      if (rng() < 0.4) c.fillRect(x + bw * 0.25, H - bh - 14, bw * 0.5, 14)
      // antenna with a red light
      if (rng() < 0.35) {
        c.fillRect(x + bw / 2 - 1.5, H - bh - 30, 3, 30)
        c.fillStyle = '#ff4d5e'
        c.fillRect(x + bw / 2 - 2.5, H - bh - 34, 5, 5)
      }
      // lit windows, golden hour edition
      if (opts.windows !== false) {
        const cols = Math.max(2, Math.floor(bw / 12))
        const rows = Math.max(3, Math.floor(bh / 16))
        for (let r = 0; r < rows; r++) {
          for (let col = 0; col < cols; col++) {
            if (rng() < 0.42) {
              c.fillStyle = rng() < 0.85 ? lit : '#ffe98a'
              c.fillRect(x + 4 + col * (bw - 8) / cols, H - bh + 6 + r * (bh - 10) / rows, 5, 6)
            }
          }
        }
      }
      x += bw + 4 + rng() * 26
    }
  }, { nearest: false })
}

function makeWindowWall(len, height, frameMat, glassMat) {
  const g = new THREE.Group()
  g.name = 'windowWall'
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, height), glassMat)
  glass.position.y = height / 2
  g.add(glass)
  const vGeo = new THREE.BoxGeometry(0.1, height, 0.16)
  const n = Math.round(len / 2.2)
  for (let i = 0; i <= n; i++) {
    const m = new THREE.Mesh(vGeo, frameMat)
    m.position.set(-len / 2 + (i / n) * len, height / 2, 0.02)
    g.add(m)
  }
  const hGeo = new THREE.BoxGeometry(len, 0.08, 0.14)
  for (const hy of [height * 0.5, height - 0.05]) {
    const m = new THREE.Mesh(hGeo, frameMat)
    m.position.set(0, hy, 0.02)
    g.add(m)
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.2), frameMat)
  base.position.set(0, 0.11, 0.03)
  g.add(base)
  return g
}

function makeLightBar(panelMat, housingMat) {
  const g = new THREE.Group()
  g.name = 'lightBar'
  const housing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.38), housingMat)
  g.add(housing)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.05, 0.28), panelMat)
  panel.position.y = -0.06
  g.add(panel)
  return g
}

function makeDesk(rng, opts = {}) {
  const g = new THREE.Group()
  g.name = 'desk'
  const wood = flatMat(opts.wood ?? 0x6b4526)
  const woodDark = flatMat(0x4e321b)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.85), wood)
  top.position.y = 0.75
  g.add(top)
  const modesty = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.52, 0.05), woodDark)
  modesty.position.set(0, 0.46, -0.32)
  g.add(modesty)
  const sideGeo = new THREE.BoxGeometry(0.07, 0.72, 0.78)
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(sideGeo, woodDark)
    leg.position.set(sx, 0.36, 0)
    g.add(leg)
  }
  // monitor: chunky CRT with a chart that is (was) doing great
  const chart = makeCandlestickChart(96, 72, { rng, candles: 9, header: opts.header ?? '$IC' })
  const shell = flatMat(0xd8d3c3)
  const face = new THREE.MeshBasicMaterial({ map: chart.texture })
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.5), [shell, shell, shell, shell, face, shell])
  mon.position.set(-0.35, 1.05, -0.1)
  mon.rotation.y = 0.25 + (rng() - 0.5) * 0.2
  g.add(mon)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), shell)
  foot.position.set(-0.35, 0.81, -0.1)
  g.add(foot)
  // keyboard, mug, paperwork
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.16), flatMat(0xb9bcc4))
  kb.position.set(-0.3, 0.8, 0.26)
  kb.rotation.y = (rng() - 0.5) * 0.3
  g.add(kb)
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 8), flatMat(rng() < 0.5 ? 0xd95d3f : 0x3f5dc9))
  mug.position.set(0.25, 0.84, 0.22)
  g.add(mug)
  const paperMat = flatMat(0xf4f2e8)
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.4), paperMat)
    p.position.set(0.5 + (rng() - 0.5) * 0.12, 0.8 + i * 0.018, -0.05 + (rng() - 0.5) * 0.15)
    p.rotation.y = (rng() - 0.5) * 0.5
    g.add(p)
  }
  return g
}

function makeExecChair(rng) {
  const g = new THREE.Group()
  g.name = 'execChair'
  const leather = flatMat(0x1e2028)
  const chrome = flatMat(0x8a939e)
  // 5-star base + casters (the wheels are the whole point)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng() * 0.3
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.07), chrome)
    spoke.position.set(Math.cos(a) * 0.17, 0.09, Math.sin(a) * 0.17)
    spoke.rotation.y = -a
    g.add(spoke)
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), flatMat(0x14161c))
    caster.position.set(Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32)
    g.add(caster)
  }
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.36, 6), chrome)
  column.position.y = 0.28
  g.add(column)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.11, 0.52), leather)
  seat.position.y = 0.5
  g.add(seat)
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.09), leather)
  back.position.set(0, 0.92, -0.26)
  back.rotation.x = 0.1
  g.add(back)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.11), leather)
  head.position.set(0, 1.34, -0.3)
  head.rotation.x = 0.1
  g.add(head)
  const armGeo = new THREE.BoxGeometry(0.06, 0.05, 0.36)
  for (const sx of [-0.29, 0.29]) {
    const arm = new THREE.Mesh(armGeo, chrome)
    arm.position.set(sx, 0.68, -0.02)
    g.add(arm)
  }
  return g
}

function makeWaterCooler() {
  const g = new THREE.Group()
  g.name = 'waterCooler'
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.05, 0.38), flatMat(0xe8eaee))
  body.position.y = 0.525
  g.add(body)
  const taps = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), flatMat(0xc0c4cc))
  taps.position.set(0, 0.82, 0.21)
  g.add(taps)
  for (const [sx, col] of [[-0.07, 0x3f8fd4], [0.07, 0xd95d3f]]) {
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.05), flatMat(col))
    tap.position.set(sx, 0.76, 0.22)
    g.add(tap)
  }
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.48, 9),
    new THREE.MeshLambertMaterial({ color: 0x7fd4f0, flatShading: true, transparent: true, opacity: 0.6 })
  )
  bottle.position.y = 1.32
  g.add(bottle)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.1, 8), flatMat(0x9fd8e8))
  neck.position.y = 1.06
  g.add(neck)
  // cup dispenser tube — cups: 0 remaining, morale: also 0
  const cups = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 7), flatMat(0xd8d3c3))
  cups.position.set(0.24, 0.75, 0.05)
  g.add(cups)
  return g
}

function makeFicus(rng) {
  const g = new THREE.Group()
  g.name = 'ficus'
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.21, 0.36, 8), flatMat(0xb5622f))
  pot.position.y = 0.18
  g.add(pot)
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 8), flatMat(0x3d2a18))
  soil.position.y = 0.36
  g.add(soil)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.95, 6), flatMat(0x7a5a32))
  trunk.position.y = 0.85
  trunk.rotation.z = (rng() - 0.5) * 0.14
  g.add(trunk)
  const greens = [0x2f7a3c, 0x3f8f4a, 0x57a85a]
  for (let i = 0; i < 4; i++) {
    const s = 0.26 + rng() * 0.16
    const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), flatMat(greens[i % greens.length]))
    blob.scale.y = 0.8
    blob.position.set((rng() - 0.5) * 0.4, 1.35 + rng() * 0.55, (rng() - 0.5) * 0.4)
    g.add(blob)
  }
  return g
}

// ---- funny wall-screen textures -------------------------------------------

function texPie() {
  return canvasTexture(192, 144, (c, W, H) => {
    c.fillStyle = '#10141f'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#e8efff'
    c.font = '900 15px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.fillText('ASSETS UNDER MGMT', W / 2, 20)
    const cx = W / 2 - 20, cy = H / 2 + 12, r = 42
    c.fillStyle = '#ff4d5e'
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, 0, TAU * 0.97); c.closePath(); c.fill()
    c.fillStyle = '#37e05f'
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, TAU * 0.97, TAU); c.closePath(); c.fill()
    c.textAlign = 'left'
    c.font = '900 12px Arial, sans-serif'
    c.fillStyle = '#ff4d5e'; c.fillText('GONE 97%', cx + r + 8, cy - 4)
    c.fillStyle = '#37e05f'; c.fillText('LEFT 3%', cx + r + 8, cy + 14)
  })
}

function texBluescreen() {
  return canvasTexture(192, 144, (c, W, H) => {
    c.fillStyle = '#1040c8'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#ffffff'
    c.font = '700 11px monospace'
    c.textAlign = 'center'
    const lines = ['A FATAL EXCEPTION 0x1C7', 'HAS OCCURRED AT FUND 0088.', 'YOUR BONUS HAS BEEN', 'LIQUIDATED.', '', 'PRESS ANY KEY TO CRY _']
    lines.forEach((l, i) => c.fillText(l, W / 2, 34 + i * 16))
  })
}

function texSynergy() {
  return canvasTexture(192, 144, (c, W, H) => {
    c.fillStyle = '#0e2a1c'; c.fillRect(0, 0, W, H)
    c.textAlign = 'center'
    c.font = '900 26px "Arial Black", Arial, sans-serif'
    c.fillStyle = '#ffd83d'
    c.fillText('SYNERGY', W / 2, 56)
    c.fillStyle = '#37e05f'
    for (let i = 0; i < 3; i++) {
      const x = 40 + i * 56
      c.beginPath()
      c.moveTo(x, 84); c.lineTo(x - 12, 102); c.lineTo(x + 12, 102)
      c.closePath(); c.fill()
    }
    c.font = '900 13px Arial, sans-serif'
    c.fillStyle = '#c9f0d0'
    c.fillText('Q3 GOAL: MORE', W / 2, 128)
  })
}

function texDownbar() {
  return canvasTexture(192, 144, (c, W, H) => {
    c.fillStyle = '#101828'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#ff4d5e'
    for (let i = 0; i < 6; i++) {
      const h = 88 - i * 14
      c.fillRect(16 + i * 28, H - 14 - h, 20, h)
    }
    c.save()
    c.translate(W / 2 + 12, 46)
    c.rotate(-0.16)
    c.fillStyle = '#37e05f'
    c.fillRect(-52, -15, 104, 28)
    c.fillStyle = '#08240f'
    c.font = '900 17px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.fillText("IT'S FINE", 0, 6)
    c.restore()
  })
}

function texHodlSell() {
  return canvasTexture(192, 144, (c, W, H) => {
    c.fillStyle = '#0b3d22'; c.fillRect(0, 0, W / 2, H)
    c.fillStyle = '#4a1016'; c.fillRect(W / 2, 0, W / 2, H)
    c.textAlign = 'center'
    c.font = '900 22px "Arial Black", Arial, sans-serif'
    c.fillStyle = '#37e05f'; c.fillText('HODL', W / 4, H / 2 + 8)
    c.fillStyle = '#ff4d5e'; c.fillText('SELL', (W * 3) / 4, H / 2 + 8)
    c.fillStyle = '#ffd83d'
    c.font = '900 40px "Arial Black", Arial, sans-serif'
    c.fillText('?', W / 2, H / 2 + 14)
  })
}

function texLogoScreen() {
  return canvasTexture(192, 144, (c, W, H) => {
    c.fillStyle = '#132a63'; c.fillRect(0, 0, W, H)
    c.strokeStyle = '#d9a325'
    c.lineWidth = 5
    c.beginPath(); c.arc(W / 2, H / 2 - 6, 42, 0, TAU); c.stroke()
    c.textAlign = 'center'
    c.fillStyle = '#e8c96a'
    c.font = '900 30px "Times New Roman", Georgia, serif'
    c.fillText('IC T', W / 2, H / 2 + 4)
    c.font = '700 11px "Times New Roman", Georgia, serif'
    c.fillText('INSTITUTIONAL CAPITAL', W / 2, H - 14)
  })
}

// jumbo hazard faces
function texMarginWarn(invert) {
  return canvasTexture(384, 256, (c, W, H) => {
    const bg = invert ? '#ffd83d' : '#7a0c14'
    const fg = invert ? '#7a0c14' : '#ffd83d'
    c.fillStyle = bg; c.fillRect(0, 0, W, H)
    // hazard stripes top + bottom
    c.fillStyle = fg
    for (let x = -40; x < W + 40; x += 40) {
      for (const y of [0, H - 26]) {
        c.beginPath()
        c.moveTo(x, y + 26); c.lineTo(x + 20, y); c.lineTo(x + 38, y); c.lineTo(x + 18, y + 26)
        c.closePath(); c.fill()
      }
    }
    c.textAlign = 'center'
    c.font = '900 52px "Arial Black", Arial, sans-serif'
    c.fillStyle = fg
    c.fillText('MARGIN', W / 2, H / 2 - 12)
    c.fillText('CALL', W / 2, H / 2 + 44)
    // warning triangle
    c.beginPath()
    c.moveTo(W / 2, 34); c.lineTo(W / 2 - 22, 68); c.lineTo(W / 2 + 22, 68)
    c.closePath(); c.fill()
    c.fillStyle = bg
    c.font = '900 26px Arial, sans-serif'
    c.fillText('!', W / 2, 64)
  }, { nearest: false })
}

function texCracked(rng) {
  return canvasTexture(384, 256, (c, W, H) => {
    c.fillStyle = '#0c0e14'; c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(230,240,255,0.85)'
    // spider cracks from two impact points
    for (const [ix, iy] of [[W * 0.36, H * 0.42], [W * 0.68, H * 0.6]]) {
      for (let i = 0; i < 9; i++) {
        const a = rng() * TAU
        let x = ix, y = iy
        c.lineWidth = 2.5
        c.beginPath(); c.moveTo(x, y)
        for (let s = 0; s < 4; s++) {
          x += Math.cos(a + (rng() - 0.5) * 0.9) * (14 + rng() * 26)
          y += Math.sin(a + (rng() - 0.5) * 0.9) * (10 + rng() * 20)
          c.lineTo(x, y)
        }
        c.stroke()
      }
      c.fillStyle = 'rgba(230,240,255,0.9)'
      c.beginPath(); c.arc(ix, iy, 5, 0, TAU); c.fill()
    }
    c.fillStyle = '#5a6470'
    c.font = '900 24px monospace'
    c.textAlign = 'center'
    c.fillText('NO SIGNAL', W / 2, H - 22)
  }, { nearest: false })
}

// tiny shared intern-monitor screen (redrawn every few ticks = frantic typing)
function makeSpreadsheet(rng) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 72
  const c = canvas.getContext('2d')
  let cursor = 0
  const draw = () => {
    c.fillStyle = '#08140c'
    c.fillRect(0, 0, 96, 72)
    c.fillStyle = '#123420'
    c.fillRect(0, 0, 96, 12)
    c.fillStyle = '#37e05f'
    c.font = '700 8px monospace'
    c.textAlign = 'left'
    c.fillText('Q3_FINAL_v37.xls', 3, 9)
    for (let r = 0; r < 6; r++) {
      for (let col = 0; col < 4; col++) {
        const red = rng() < 0.2
        c.fillStyle = red ? 'rgba(255,77,94,0.8)' : 'rgba(55,224,95,0.55)'
        c.fillRect(3 + col * 24, 16 + r * 9, 4 + rng() * 15, 5)
      }
    }
    cursor = (cursor + 1) % 2
    if (cursor) { c.fillStyle = '#c9f0d0'; c.fillRect(3 + Math.floor(rng() * 3) * 24, 16 + Math.floor(rng() * 6) * 9, 6, 6) }
  }
  draw()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  return { texture, tick() { draw(); texture.needsUpdate = true } }
}

function makeCubicleRow(rng, { width, cells, screenTex }) {
  // one row of cubicles: tall back panel, side fins, desk strip, monitors
  // facing the camera (screens toward the player: comedy > ergonomics).
  const g = new THREE.Group()
  g.name = 'cubicleRow'
  const fabric = flatMat(0x7d8793)
  const trim = flatMat(0x9aa4b0)
  const deskMat = flatMat(0xc9c2ae)
  const shellMat = flatMat(0xd8d3c3)
  const faceMat = new THREE.MeshBasicMaterial({ map: screenTex })

  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 1.18, 0.07), fabric)
  panel.position.set(0, 0.59, -0.65)
  g.add(panel)
  const panelTrim = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.1), trim)
  panelTrim.position.set(0, 1.2, -0.65)
  g.add(panelTrim)

  const finGeo = new THREE.BoxGeometry(0.06, 1.1, 0.72)
  const cellW = width / cells
  for (let i = 0; i <= cells; i++) {
    const fin = new THREE.Mesh(finGeo, fabric)
    fin.position.set(-width / 2 + i * cellW, 0.55, -0.3)
    g.add(fin)
  }
  const desk = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.5), deskMat)
  desk.position.set(0, 0.74, 0.02)
  g.add(desk)

  const monGeo = new THREE.BoxGeometry(0.34, 0.27, 0.28)
  const paperMat = flatMat(0xf4f2e8)
  for (let i = 0; i < cells; i++) {
    const x = -width / 2 + (i + 0.5) * cellW
    const mon = new THREE.Mesh(monGeo, [shellMat, shellMat, shellMat, shellMat, faceMat, shellMat])
    mon.position.set(x + (rng() - 0.5) * 0.2, 0.91, 0.02)
    mon.rotation.y = (rng() - 0.5) * 0.5
    g.add(mon)
    if (rng() < 0.45) { // unfiled paperwork, load-bearing
      const stack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02 + rng() * 0.07, 0.26), paperMat)
      stack.position.set(x + 0.3, 0.79, -0.02)
      stack.rotation.y = (rng() - 0.5) * 0.6
      g.add(stack)
    }
  }
  return g
}

function makePlanter(len) {
  const g = new THREE.Group()
  g.name = 'planter'
  const box = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.55), flatMat(0xd9d2c2))
  box.position.y = 0.25
  g.add(box)
  const hedge = new THREE.Mesh(new THREE.BoxGeometry(len - 0.15, 0.42, 0.44), flatMat(0x3f8f4a))
  hedge.position.y = 0.66
  g.add(hedge)
  return g
}

function makeElevatorBank() {
  const g = new THREE.Group()
  g.name = 'elevatorBank'
  const marble = flatMat(0xd9d2c2)
  const core = new THREE.Mesh(new THREE.BoxGeometry(4.2, 6.6, 1.2), marble)
  core.position.y = 3.3
  g.add(core)
  const gold = flatMat(0xd9a325)
  const goldDark = flatMat(0xa8791a)
  for (const sx of [-1.05, 1.05]) {
    for (const off of [-0.42, 0.42]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.4, 0.08), off < 0 ? gold : goldDark)
      door.position.set(sx + off, 1.2, 0.62)
      g.add(door)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.12), goldDark)
    lintel.position.set(sx, 2.5, 0.62)
    g.add(lintel)
  }
  const sign = makeSign('FLOOR 88', { w: 1.7, h: 0.5, depth: 0.08, px: 72, bg: '#132a63', fg: '#e8c96a', sub: 'PENTHOUSE-ISH' })
  sign.position.set(0, 3.2, 0.68)
  g.add(sign)
  return g
}

function makeCoffeeBar(rng) {
  const g = new THREE.Group()
  g.name = 'coffeeBar'
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.9), flatMat(0x5a3d22))
  counter.position.y = 0.5
  g.add(counter)
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.07, 1.0), flatMat(0xd9d2c2))
  top.position.y = 1.03
  g.add(top)
  const machine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.45), flatMat(0x20242c))
  machine.position.set(-0.6, 1.32, 0)
  g.add(machine)
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), flatMat(0x8a939e))
  spout.position.set(-0.6, 1.12, 0.22)
  g.add(spout)
  // mug pyramid — the true corporate ladder
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i <= 2 - r; i++) {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 7), flatMat([0xd95d3f, 0x3f5dc9, 0xe8b13c][Math.floor(rng() * 3)]))
      mug.position.set(0.35 + i * 0.16 + r * 0.08, 1.13 + r * 0.13, (rng() - 0.5) * 0.1)
      g.add(mug)
    }
  }
  const sign = makeSign('ESPRESSO & COPE', { w: 2.2, h: 0.55, depth: 0.08, px: 72, bg: '#20315e', fg: '#ffe14d' })
  sign.position.set(0, 2.1, 0.2)
  g.add(sign)
  const poleMat = flatMat(0x8a939e)
  for (const sx of [-0.9, 0.9]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), poleMat)
    pole.position.set(sx, 1.48, 0.2)
    g.add(pole)
  }
  return g
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

class InstitutionalCapitalTowerArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.5 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0x1c7088)
    this._time = 0
    this._crowds = []
    this._crashLine = 0
    this._marginAnnounced = false

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildRoom()
    this._buildCeilingLights()
    this._buildBackdrop()
    this._buildCubicles()
    this._buildProps()
    this._buildPapers()
    this._buildHazard()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction ---------------------------------------------------------

  _buildPhysics() {
    // floor slab + invisible bouncy walls on all four sides at the bounds +
    // a ceiling so unhinged launches thud into the acoustic tiles instead of
    // escaping.
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls({ height: 7 })
    this.addStaticBox(new THREE.Vector3(0, 7.05, -2), new THREE.Vector3(44, 1.1, 30))
  }

  _buildSkyAndLights() {
    // golden hour: the one moment the fund's chart matches the sky
    const sky = buildSkyDome(['#2a3f6e', '#7a5fae', '#e07a4f', '#ffbe6b', '#ffe6a8'], {
      rng: this._rng, cloudColor: 'rgba(255,214,170,0.9)',
    })
    this.group.add(sky)

    // painted skyline in two parallax layers behind the glass
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 20),
      new THREE.MeshBasicMaterial({ map: makeSkylineTexture(this._rng, { color: '#6b5a8e', lit: '#d99a6c', windows: false }), transparent: true, depthWrite: false })
    )
    far.position.set(6, 8.4, -42)
    this.group.add(far)
    const near = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 17),
      new THREE.MeshBasicMaterial({ map: makeSkylineTexture(this._rng, { color: '#2e2750', lit: '#ffb35c' }), transparent: true, depthWrite: false })
    )
    near.position.set(-4, 6.8, -31)
    this.group.add(near)

    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xffe0b8, hemiGround: 0x8a7458, hemiIntensity: 0.95,
      sunColor: 0xffb066, sunIntensity: 1.75, sunPos: [-7, 8, -13],
      fillColor: 0xffd9a8, fillIntensity: 0.5, fillPos: [4, 6, 14],
      fog: { color: 0xf0cba0, near: 42, far: 100 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildRoom() {
    // marble floor
    const tex = makeMarbleTexture(this._rng)
    const sideMat = flatMat(0x8a8272)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 30), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -3.5)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)

    // giant 'IC T' logo medallion at center ring
    const medallion = makeMedallionMesh()
    medallion.position.set(0, 0.028, -0.5)
    medallion.receiveShadow = !!this.quality.shadows
    this.group.add(medallion)

    // ceiling of acoustic tiles
    const ceilTex = makeCeilingTexture()
    const ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex, flatShading: true })
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(46, 0.25, 31), ceilMat)
    ceiling.position.set(0, 6.75, -3.5)
    this.group.add(ceiling)

    // floor-to-ceiling windows: back wall + both sides
    const frameMat = flatMat(0x2b2f3a)
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0xffd9a8, flatShading: true, transparent: true, opacity: 0.13, depthWrite: false,
    })
    const backWall = makeWindowWall(40, 6.6, frameMat, glassMat)
    backWall.position.set(0, 0, -11)
    this.group.add(backWall)
    for (const side of [-1, 1]) {
      const wall = makeWindowWall(15, 6.6, frameMat, glassMat)
      wall.position.set(side * 19.2, 0, -3.5)
      wall.rotation.y = -side * Math.PI / 2
      this.group.add(wall)
    }
    // chunky corner columns
    const colGeo = new THREE.BoxGeometry(0.7, 6.7, 0.7)
    const colMat = flatMat(0x3a4252)
    for (const cx of [-19.2, 19.2]) {
      const col = new THREE.Mesh(colGeo, colMat)
      col.position.set(cx, 3.35, -11)
      this.group.add(col)
    }
  }

  _buildCeilingLights() {
    const housingMat = flatMat(0xb8bcc4)
    const litMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
    const flickerMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
    const defs = []
    for (const z of [-0.8, -4.6]) for (const x of [-7.5, -2.5, 2.5, 7.5]) defs.push([x, z])
    for (const x of [-5, 0, 5]) defs.push([x, -7.8])
    defs.forEach(([x, z], i) => {
      const bar = makeLightBar(i === 2 ? flickerMat : litMat, housingMat)
      bar.position.set(x, 6.55, z)
      this.group.add(bar)
    })
    // one fixture is on a zero-hour maintenance contract
    const fl = { t: 3 + this._rng() * 4, burst: 0 }
    this.addUpdater((dt) => {
      fl.t -= dt
      if (fl.t <= 0 && fl.burst <= 0) { fl.burst = 0.3 + this._rng() * 0.35; fl.t = 3.5 + this._rng() * 5.5 }
      if (fl.burst > 0) {
        fl.burst -= dt
        flickerMat.color.setHex(this._rng() < 0.45 ? 0x6b675a : 0xfff4d6)
        if (fl.burst <= 0) flickerMat.color.setHex(0xfff4d6)
      }
    })
  }

  _buildBackdrop() {
    const rng = this._rng

    // -- the WALL OF MARKET SCREENS on a truss above the cubicle farm
    const charts = [
      makeCandlestickChart(224, 160, { rng, header: '$APE / USD' }),
      makeCandlestickChart(224, 160, { rng, header: '$BAGS' }),
      makeCandlestickChart(224, 160, { rng, header: '$YIELD' }),
      makeCandlestickChart(224, 160, { rng, header: '$ZZZ', up: '#3fbcd4' }),
    ]
    this._wallCharts = charts
    const statics = [texPie(), texBluescreen(), texSynergy(), texDownbar(), texHodlSell(), texLogoScreen()]
    const c = charts.map((ch) => ch.texture)
    const s = statics
    const layout = [
      c[0], s[0], c[1], s[2], c[2],
      s[1], c[3], s[3], c[0], s[4],
      c[1], s[5], c[3], s[2], c[2],
    ]
    const bezel = flatMat(0x14161c)
    const tileGeo = new THREE.BoxGeometry(1.62, 1.06, 0.16)
    const cols = 5, tileW = 1.74, tileH = 1.18
    layout.forEach((map, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const face = new THREE.MeshBasicMaterial({ map })
      const tile = new THREE.Mesh(tileGeo, [bezel, bezel, bezel, bezel, face, bezel])
      tile.position.set((col - (cols - 1) / 2) * tileW, 5.0 - row * tileH, -9.9)
      this.group.add(tile)
    })
    // truss
    const trussMat = flatMat(0x3a4252)
    for (const sx of [-4.5, 4.5]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.7, 0.16), trussMat)
      pole.position.set(sx, 2.85, -10.05)
      this.group.add(pole)
    }
    for (const sy of [2.1, 5.6]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.12, 0.12), trussMat)
      beam.position.set(0, sy, -10.05)
      this.group.add(beam)
    }
    // charts tick, staggered, always up (this is a professional institution)
    this._chartAcc = charts.map((_, i) => i * 0.21)
    this.addUpdater((dt) => {
      for (let i = 0; i < charts.length; i++) {
        this._chartAcc[i] += dt
        if (this._chartAcc[i] >= 0.85) { this._chartAcc[i] = 0; charts[i].tick() }
      }
    })

    // -- marquee above the screen wall
    const marquee = makeSign('INSTITUTIONAL CAPITAL', {
      w: 8.6, h: 1.5, depth: 0.26, px: 76,
      bg: '#132a63', fg: '#e8c96a', border: '#d9a325', sub: 'A TIRED APE COMPANY · FIDUCIARY-ISH',
    })
    marquee.position.set(0, 6.05, -9.7)
    marquee.rotation.x = -0.05
    this.group.add(marquee)

    // -- elevator bank (left, beyond the wall) + coffee bar (right)
    const elevators = makeElevatorBank()
    elevators.position.set(-14.6, 0, -10.3)
    this.group.add(elevators)
    const coffee = makeCoffeeBar(rng)
    coffee.position.set(14.2, 0, -9.2)
    coffee.rotation.y = -0.25
    this.group.add(coffee)

    // -- decorative corner ficuses (non-breakable set dressing, |x| > 9)
    for (const [x, z] of [[-12.6, -8.8], [12, -7.6], [-17.6, -2], [17.8, -4.5]]) {
      const f = makeFicus(rng)
      f.position.set(x, 0, z)
      f.rotation.y = rng() * TAU
      this.group.add(f)
    }

    // -- executive motivation, framed
    const motto = makeSign('NUMBER MUST GO UP', { w: 3.6, h: 0.9, depth: 0.12, px: 72, bg: '#0b3d22', fg: '#37e05f', border: '#37e05f' })
    motto.position.set(-14.6, 4.9, -9.6)
    motto.rotation.y = 0.14
    this.group.add(motto)

    // -- hedge planters between the fight floor and the intern farm (pushed
    // just past the free-roam z bound so nothing solid intrudes on the floor)
    for (const sx of [-5.2, 5.2]) {
      const p = makePlanter(6.6)
      p.position.set(sx, 0, -5.95)
      this.group.add(p)
    }
    for (const side of [-1, 1]) {
      const p = makePlanter(7)
      p.position.set(side * 10.6, 0, -1.4)
      p.rotation.y = Math.PI / 2
      this.group.add(p)
    }
  }

  _buildCubicles() {
    const rng = this._rng
    const sheet = makeSpreadsheet(rng)
    this._sheet = sheet
    let sheetAcc = 0
    this.addUpdater((dt) => {
      sheetAcc += dt
      if (sheetAcc >= 0.4) { sheetAcc = 0; sheet.tick() } // typing. frantically.
    })

    // row A on the floor, row B on a shallow dais behind it
    const rowA = makeCubicleRow(rng, { width: 21, cells: 13, screenTex: sheet.texture })
    rowA.position.set(0, 0, -6.55)
    this.group.add(rowA)

    const daisB = new THREE.Group()
    const dais = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 2.4), flatMat(0x6b6456))
    dais.position.set(0, 0.175, -8.55)
    this.group.add(dais)
    const rowB = makeCubicleRow(rng, { width: 21, cells: 13, screenTex: sheet.texture })
    daisB.add(rowB)
    daisB.position.set(0, 0.35, -8.55)
    this.group.add(daisB)

    // the interns themselves — bounce = typing, cheer = standing ovation
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const nA = Math.ceil(total * 0.55)
    const nB = Math.max(4, total - nA)
    const crowdA = buildCrowd({ count: nA, area: { w: 20, d: 0.8 }, palette: INTERN_PALETTE, rng, risers: false, bounce: 0.12 })
    crowdA.group.position.set(0, 0, -6.85)
    this.group.add(crowdA.group)
    const crowdB = buildCrowd({ count: nB, area: { w: 20, d: 0.8 }, palette: INTERN_PALETTE, rng, risers: false, bounce: 0.12 })
    crowdB.group.position.set(0, 0.35, -8.85)
    this.group.add(crowdB.group)
    this._crowds = [crowdA, crowdB]
    for (const cr of this._crowds) this.addUpdater((dt) => cr.update(dt))
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

    // v2.0 free-roam: office furniture scatters across the open marble floor
    // (center lane kept mostly clear).

    // desks — quarterly reports, meet ragdoll
    place(makeDesk(rng, { header: '$IC' }), -6.4, -3.5, 0.42, { shape: 'box', mass: 8, health: 24, kind: 'desk' })
    place(makeDesk(rng, { header: '$APE', wood: 0x5a3d22 }), 6.6, 3.4, -0.35 + Math.PI, { shape: 'box', mass: 8, health: 24, kind: 'desk' })

    // executive chairs: sphere bodies so one slap sends them ROLLING
    place(makeExecChair(rng), -5.2, -2.7, rng() * TAU, { shape: 'sphere', mass: 3, health: 14, kind: 'chair' })
    place(makeExecChair(rng), 5.6, 2.5, rng() * TAU, { shape: 'sphere', mass: 3, health: 14, kind: 'chair' })

    // hydration station (mandatory fun adjacent)
    place(makeWaterCooler(), -3.6, 3.9, 0.3, { shape: 'box', mass: 5, health: 18, kind: 'cooler' })

    // ficus trees on the open floor — HR insists they stay
    place(makeFicus(rng), -7.9, 3.1, 0, { shape: 'cylinder', mass: 4, health: 14, kind: 'ficus' })
    place(makeFicus(rng), 7.8, -3.4, 0, { shape: 'cylinder', mass: 4, health: 14, kind: 'ficus' })
  }

  // -- paperwork ------------------------------------------------------------

  _buildPapers() {
    const rng = this._rng
    const pScale = this.quality.particleScale ?? 1
    const geo = new THREE.PlaneGeometry(0.24, 0.32)
    const mats = [
      new THREE.MeshLambertMaterial({ color: 0xf4f2e8, flatShading: true, side: THREE.DoubleSide }),
      new THREE.MeshLambertMaterial({ color: 0xe8dcae, flatShading: true, side: THREE.DoubleSide }),
    ]

    // burst pool — activated whenever something "goes on break"
    const n = Math.max(8, Math.round(26 * pScale))
    this._papers = []
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, mats[i % 2])
      mesh.visible = false
      this.group.add(mesh)
      this._papers.push({
        mesh, active: false, vel: new THREE.Vector3(),
        spin: new THREE.Vector3(), phase: rng() * TAU, rest: 0, life: 0,
      })
    }

    // ambient drifters over the cubicle farm: the printer never stops
    this._drifters = []
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(geo, mats[i % 2])
      const d = {
        mesh, x: (rng() - 0.5) * 18, z: -6.5 - rng() * 2.6,
        y: 1.5 + rng() * 4, speed: 0.5 + rng() * 0.35, phase: rng() * TAU,
      }
      mesh.position.set(d.x, d.y, d.z)
      this.group.add(mesh)
      this._drifters.push(d)
    }

    this.addUpdater((dt) => this._updatePapers(dt))
  }

  _paperBurst(x, y, z, count = 8) {
    const rng = this._rng
    let launched = 0
    for (const p of this._papers) {
      if (launched >= count) break
      if (p.active) continue
      p.active = true
      launched++
      p.mesh.visible = true
      p.mesh.scale.setScalar(1)
      p.mesh.position.set(x + (rng() - 0.5) * 0.7, Math.max(0.3, y) + rng() * 0.5, z + (rng() - 0.5) * 0.6)
      p.mesh.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU)
      p.vel.set((rng() - 0.5) * 5, 2.5 + rng() * 3.5, (rng() - 0.5) * 4)
      p.spin.set((rng() - 0.5) * 12, (rng() - 0.5) * 12, (rng() - 0.5) * 12)
      p.rest = 0
      p.life = 0
    }
  }

  _updatePapers(dt) {
    // burst papers: flutter up, drift down, rest, then shuffle themselves away
    for (const p of this._papers) {
      if (!p.active) continue
      p.life += dt
      if (p.rest > 0) {
        p.rest -= dt
        if (p.rest <= 1.0 && p.rest > 0) p.mesh.scale.setScalar(Math.max(0.001, p.rest / 1.0))
        if (p.rest <= 0) { p.active = false; p.mesh.visible = false }
        continue
      }
      p.vel.y = Math.max(p.vel.y - 7 * dt, -1.5) // paper terminal velocity
      p.vel.x *= 1 - 1.3 * dt
      p.vel.z *= 1 - 1.3 * dt
      const sway = Math.sin(p.life * 6 + p.phase) * 0.45
      p.mesh.position.x += (p.vel.x + sway) * dt
      p.mesh.position.y += p.vel.y * dt
      p.mesh.position.z += p.vel.z * dt
      p.mesh.rotation.x += p.spin.x * dt
      p.mesh.rotation.y += p.spin.y * dt
      p.mesh.rotation.z += p.spin.z * dt
      if (p.mesh.position.y <= 0.02) {
        p.mesh.position.y = 0.02
        p.mesh.rotation.set(-Math.PI / 2 + (this._rng() - 0.5) * 0.2, 0, this._rng() * TAU)
        p.rest = 2.6 // lie there, like the interns wish they could
      }
    }
    // ambient drifters
    for (const d of this._drifters) {
      d.y -= d.speed * dt
      d.phase += dt
      d.mesh.position.set(d.x + Math.sin(d.phase * 2.1) * 0.5, d.y, d.z)
      d.mesh.rotation.x += dt * 1.4
      d.mesh.rotation.z = Math.sin(d.phase * 2.6) * 0.6
      if (d.y < 0.25) {
        d.y = 4.2 + this._rng() * 2
        d.x = (this._rng() - 0.5) * 18
        d.z = -6.5 - this._rng() * 2.6
      }
    }
  }

  // -- hazard: the falling market screen ------------------------------------

  _buildHazard() {
    const rng = this._rng
    const hazG = new THREE.Group()
    hazG.name = 'marginCallRig'
    hazG.position.set(0, 0, HAZ_Z)
    this.group.add(hazG)
    this._hazG = hazG // v2.0: the whole ceiling gantry also glides in z

    const steel = flatMat(0x3a4252)
    const steelDark = flatMat(0x252b36)

    // ceiling rail spanning the arena
    const railGeo = new THREE.BoxGeometry(17.4, 0.14, 0.14)
    for (const rz of [-0.24, 0.24]) {
      const rail = new THREE.Mesh(railGeo, steel)
      rail.position.set(0, 6.28, rz)
      hazG.add(rail)
    }
    const strutGeo = new THREE.BoxGeometry(0.1, 0.34, 0.62)
    for (const sx of [-8, -4, 0, 4, 8]) {
      const strut = new THREE.Mesh(strutGeo, steelDark)
      strut.position.set(sx, 6.47, 0)
      hazG.add(strut)
    }

    // trolley riding the rail
    const trolley = new THREE.Group()
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.6), steelDark)
    trolley.add(block)
    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8)
    wheelGeo.rotateX(Math.PI / 2)
    for (const wx of [-0.24, 0.24]) {
      for (const wz of [-0.24, 0.24]) {
        const wheel = new THREE.Mesh(wheelGeo, flatMat(0x14161c))
        wheel.position.set(wx, 0.18, wz)
        trolley.add(wheel)
      }
    }
    trolley.position.set(0, 6.02, 0)
    hazG.add(trolley)

    // winch cable (visible while the screen is down / being hauled back up)
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), steelDark)
    cable.visible = false
    hazG.add(cable)

    // the JUMBO screen itself, hanging from shear-away arms
    const dropG = new THREE.Group()
    dropG.position.set(0, HANG_Y, 0.45)
    hazG.add(dropG)
    const armGeo = new THREE.BoxGeometry(0.09, 0.55, 0.09)
    for (const ax of [-0.9, 0.9]) {
      const arm = new THREE.Mesh(armGeo, steel)
      arm.position.set(ax, -0.28, 0)
      dropG.add(arm)
    }
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.1), steel)
    crossbar.position.set(0, -0.52, 0)
    dropG.add(crossbar)

    const jumboChart = makeCandlestickChart(384, 224, { rng, candles: 18, header: '$APE / USD' })
    this._jumboChart = jumboChart
    const warnA = texMarginWarn(false)
    const warnB = texMarginWarn(true)
    const cracked = texCracked(rng)
    const bezel = flatMat(0x14161c)
    const faceMat = new THREE.MeshBasicMaterial({ map: jumboChart.texture })
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.8, 0.26), [bezel, bezel, bezel, bezel, faceMat, bezel])
    screen.position.set(0, -1.45, 0)
    dropG.add(screen)
    const logoPlate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.02), flatMat(0xd9a325))
    logoPlate.position.set(0, -2.44, 0.13)
    dropG.add(logoPlate)

    // sparks (warning) + shards (impact) pools
    const pScale = this.quality.particleScale ?? 1
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe14d })
    const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.02)
    this._sparks = []
    for (let i = 0; i < Math.max(4, Math.round(10 * pScale)); i++) {
      const mesh = new THREE.Mesh(sparkGeo, sparkMat)
      mesh.visible = false
      this.group.add(mesh)
      this._sparks.push({ mesh, vel: new THREE.Vector3(), ttl: 0 })
    }
    const shardGeo = new THREE.BoxGeometry(0.14, 0.14, 0.03)
    const shardMats = [new THREE.MeshBasicMaterial({ color: 0x3fd4c0 }), flatMat(0x20242c)]
    this._shards = []
    for (let i = 0; i < Math.max(6, Math.round(14 * pScale)); i++) {
      const mesh = new THREE.Mesh(shardGeo, shardMats[i % 2])
      mesh.visible = false
      this.group.add(mesh)
      this._shards.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), ttl: 0 })
    }

    this._haz = {
      trolley, dropG, cable, faceMat,
      chartTex: jumboChart.texture, warnA, warnB, cracked,
      state: 'idle', timer: 7, // first drop comes early so players learn the rules
      x: 0, targetX: 0, wanderT: 2.5, dropX: 0,
      z: HAZ_Z, targetZ: HAZ_Z, dropZ: HAZ_Z, // v2.0: drops land at random XZ
      y: HANG_Y, vy: 0, warnT: 0, flashT: 0, sparkT: 0, downT: 0, riseT: 0,
      chartAcc: 0,
    }
    this.addUpdater((dt) => this._updateHazard(dt))
  }

  _updateHazard(dt) {
    const hz = this._haz
    const rng = this._rng

    // idle chart keeps ticking (the number is fine, everything is fine)
    if (hz.state === 'idle' || hz.state === 'aim') {
      hz.chartAcc += dt
      if (hz.chartAcc >= 0.9) { hz.chartAcc = 0; this._jumboChart.tick() }
    }

    switch (hz.state) {
      case 'idle': {
        hz.timer -= dt
        hz.wanderT -= dt
        if (hz.wanderT <= 0) {
          hz.wanderT = 2.5 + rng() * 2
          hz.targetX = (rng() - 0.5) * 13
          hz.targetZ = -5.2 + rng() * 7.6
        }
        const dx = hz.targetX - hz.x
        hz.x += THREE.MathUtils.clamp(dx, -1.3 * dt, 1.3 * dt)
        const dz = hz.targetZ - hz.z
        hz.z += THREE.MathUtils.clamp(dz, -0.9 * dt, 0.9 * dt)
        if (hz.timer <= 0) {
          hz.state = 'aim'
          hz.dropX = -7 + rng() * 14
          hz.dropZ = -5.2 + rng() * 7.6 // face slaps down ~1.85m past this
          this.sfx('slide', { vol: 0.35, pitch: 0.7 })
        }
        break
      }
      case 'aim': { // slide fast over the drop point (both axes)
        const dx = hz.dropX - hz.x
        hz.x += THREE.MathUtils.clamp(dx, -9 * dt, 9 * dt)
        const dz = hz.dropZ - hz.z
        hz.z += THREE.MathUtils.clamp(dz, -7 * dt, 7 * dt)
        if (Math.abs(dx) < 0.06 && Math.abs(dz) < 0.06) {
          hz.state = 'warn'
          hz.warnT = 1.15
          hz.flashT = 0
          hz.sparkT = 0
          this.sfx('block', { vol: 0.35, pitch: 0.5 })
        }
        break
      }
      case 'warn': { // shake + sparks + flashing MARGIN CALL — last chance to move
        hz.warnT -= dt
        hz.flashT -= dt
        hz.sparkT -= dt
        if (hz.flashT <= 0) {
          hz.flashT = 0.11
          hz.faceMat.map = hz.faceMat.map === hz.warnA ? hz.warnB : hz.warnA
        }
        if (hz.sparkT <= 0) {
          hz.sparkT = 0.16
          this._spawnSparks(hz.x)
          this.sfx('block', { vol: 0.14, pitch: 1.7 + rng() * 0.5 })
        }
        if (hz.warnT <= 0) {
          hz.state = 'drop'
          hz.vy = 2
          this.sfx('whoosh', { vol: 0.8, pitch: 0.7 })
        }
        break
      }
      case 'drop': {
        hz.vy += 30 * dt
        hz.y -= hz.vy * dt
        if (hz.y <= REST_Y) {
          hz.y = REST_Y
          this._screenImpact()
        }
        break
      }
      case 'down': {
        hz.downT -= dt
        if (hz.downT <= 0) {
          hz.state = 'rise'
          hz.riseT = 0
          hz.faceMat.map = hz.chartTex // facilities rebooted it. it shows a chart. the chart is up.
          this.sfx('slide', { vol: 0.3, pitch: 1.3 })
        }
        break
      }
      case 'rise': {
        hz.riseT += dt / 1.5
        const k = easeInOut(Math.min(1, hz.riseT))
        hz.y = THREE.MathUtils.lerp(REST_Y, HANG_Y, k)
        if (hz.riseT >= 1) {
          hz.state = 'idle'
          hz.timer = 9.5 + rng() * 3 // ~11 s cycle, give or take a quarter
          this.sfx('coin', { vol: 0.3, pitch: 1.2 })
        }
        break
      }
    }

    // pose the rig (the whole ceiling gantry carries the z glide)
    const jitter = hz.state === 'warn' ? (rng() - 0.5) * 0.09 : 0
    this._hazG.position.z = hz.z
    hz.trolley.position.x = hz.x
    hz.dropG.position.x = hz.x + jitter
    hz.dropG.position.y = hz.y + (hz.state === 'warn' ? (rng() - 0.5) * 0.05 : 0)
    const fallK = THREE.MathUtils.clamp((HANG_Y - hz.y) / (HANG_Y - REST_Y), 0, 1)
    hz.dropG.rotation.x = DROP_ROT * easeInOut(fallK)

    // winch cable between trolley and the runaway asset
    const gap = 5.9 - hz.y
    if (gap > 0.1) {
      hz.cable.visible = true
      hz.cable.scale.y = gap
      hz.cable.position.set(hz.x, 5.9 - gap / 2, 0.45)
    } else {
      hz.cable.visible = false
    }

    // sparks + shards simulation
    for (const sp of this._sparks) {
      if (sp.ttl <= 0) continue
      sp.ttl -= dt
      sp.vel.y -= 20 * dt
      sp.mesh.position.addScaledVector(sp.vel, dt)
      if (sp.ttl <= 0) sp.mesh.visible = false
    }
    for (const sh of this._shards) {
      if (sh.ttl <= 0) continue
      sh.ttl -= dt
      sh.vel.y -= 22 * dt
      sh.mesh.position.addScaledVector(sh.vel, dt)
      sh.mesh.rotation.x += sh.spin.x * dt
      sh.mesh.rotation.z += sh.spin.z * dt
      if (sh.mesh.position.y < 0.03) { sh.mesh.position.y = 0.03; sh.vel.set(0, 0, 0); sh.spin.set(0, 0, 0) }
      if (sh.ttl <= 0) sh.mesh.visible = false
    }
  }

  _spawnSparks(x) {
    const rng = this._rng
    let n = 2
    for (const sp of this._sparks) {
      if (n <= 0) break
      if (sp.ttl > 0) continue
      n--
      sp.ttl = 0.35 + rng() * 0.2
      sp.mesh.visible = true
      sp.mesh.position.set(x + (rng() - 0.5) * 0.6, 5.55, this._haz.z + 0.4)
      sp.vel.set((rng() - 0.5) * 3, -1 - rng() * 2, (rng() - 0.5) * 1.5 + 0.8)
    }
  }

  _screenImpact() {
    const hz = this._haz
    const rng = this._rng
    hz.state = 'down'
    hz.downT = 1.7
    hz.faceMat.map = hz.cracked
    const hx = hz.x
    const impactZ = hz.z + 0.45 + 1.4 // where the face actually slaps down

    // presentation
    this.emit('camera:shake', { mag: 0.75 })
    this.emit('caption', { text: CRASH_LINES[this._crashLine++ % CRASH_LINES.length] })
    this.sfx('break', { vol: 0.9, pitch: 0.85 })
    this.sfx('thud', { vol: 0.85, pitch: 0.7 })
    try { this.audio?.crowd?.('gasp') } catch (e) { /* the interns saw nothing */ }
    for (const c of this._crowds) c.cheer(1.6)
    this._paperBurst(hx, 0.6, impactZ, 9)
    for (const sh of this._shards) {
      sh.ttl = 0.8 + rng() * 0.5
      sh.mesh.visible = true
      sh.mesh.position.set(hx + (rng() - 0.5) * 2.4, 0.35 + rng() * 0.4, impactZ + (rng() - 0.5) * 0.8)
      sh.vel.set((rng() - 0.5) * 7, 3 + rng() * 4, (rng() - 0.5) * 5)
      sh.spin.set((rng() - 0.5) * 16, 0, (rng() - 0.5) * 16)
    }

    // shove nearby office furniture (2D zone around the slap-down point)
    try {
      for (const h of this.props) {
        const m = h?.mesh
        if (!m || !h.body) continue
        const dx = m.position.x - hx
        if (Math.abs(dx) < 2.3 && m.position.y < 2 && Math.abs(m.position.z - impactZ) < 2.2) {
          this.physics?.impulse?.(h, [Math.sign(dx || 1) * (2.5 + rng() * 2.5), 6 + rng() * 5, (rng() - 0.5) * 3])
        }
      }
    } catch (e) { /* furniture files a complaint */ }

    // crush anyone reading the fine print underneath (2D trigger zone)
    let victims = 0
    const scr = this._matchScreen()
    for (const f of this._getFighters()) {
      const p = f?.pos
      if (!p || Math.abs(p.x - hx) > 1.8 || Math.abs((p.z ?? 0) - impactZ) > 1.7 || p.y > 2.3) continue
      if (CRUSH_SKIP_STATES.has(f.state)) continue
      victims++
      try {
        f.setHp?.(Math.max(1, f.hp - 16)) // heavy, but the hazard never gets the KO credit
        f.flash?.()
        const dir = p.x >= hx ? 1 : -1
        const dirZ = (p.z ?? 0) >= impactZ ? 1 : -1
        if (scr && typeof scr.forceRagdoll === 'function') {
          scr.forceRagdoll(f, [dir * (3 + rng() * 2), 7 + rng() * 2, dirZ * (1 + rng() * 1.5)], 1.4 + rng())
        } else if (typeof f.setState === 'function' && f.state !== 'ragdoll') {
          // §17 ownership: fallback only — never state-flip a ragdolled fighter
          f.vel && (f.vel.y = Math.max(f.vel.y ?? 0, 7), f.vel.x = (f.vel.x ?? 0) + dir * 2)
          f.setState('launched')
        }
      } catch (e) { /* fighter declined the margin call */ }
    }
    if (victims > 0) {
      try { this.audio?.crowd?.('wild') } catch (e) { /* HR will hear about this */ }
      for (const c of this._crowds) c.cheer(2.8)
      if (!this._marginAnnounced) {
        this._marginAnnounced = true
        this.emit('announcer', { line: 'MARGIN CALL!' })
      }
    }
    this.emit('arena:marginCall', { x: hx, victims, pos: { x: hx, y: 0, z: impactZ } })
  }

  // Best-effort access to the live fighters (combat owns them; stay defensive).
  _matchScreen() {
    try {
      const scr = this.physics?.game?.screens?.current
      if (scr && Array.isArray(scr.fighters)) {
        if (scr.phase && scr.phase !== 'fight') return null // no crushing during ceremonies
        return scr
      }
    } catch (e) { /* combat internals unavailable */ }
    return null
  }

  _getFighters() {
    const scr = this._matchScreen()
    return scr && Array.isArray(scr.fighters) ? scr.fighters : []
  }

  // -- events ---------------------------------------------------------------

  _wireEvents() {
    // interns are contractually obligated to be invested
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.22 + Math.min(0.8, combo * 0.07) + (e?.counter ? 0.4 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.2) })
    this.listen('fighter:ko', () => {
      for (const c of this._crowds) c.cheer(3)
      // someone yells "TAKE THE REST OF THE DAY" — paperwork everywhere
      this._paperBurst(-3 + this._rng() * 2, 2.2, -5.5, 6)
      this._paperBurst(3 - this._rng() * 2, 2.2, -5.5, 6)
    })
    this.listen('round:end', () => {
      for (const c of this._crowds) c.cheer(2)
      this._paperBurst((this._rng() - 0.5) * 8, 2.5, -5.8, 8) // break time
    })
    // any office furniture exploding sheds its filing
    this.listen('physics:break', (e) => {
      const p = e?.pos
      if (!p || Math.abs(p.x) > 12 || Math.abs(p.z) > 6) return
      this._paperBurst(p.x, Math.max(0.5, p.y), p.z, 7)
      for (const c of this._crowds) c.cheer(0.8)
    })
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    try { this.audio?.crowd?.('wild') } catch (e) { /* muted enthusiasm */ }
    for (const c of this._crowds) c.cheer(2.2)
    const p = fighter?.pos
    if (p) this._paperBurst(THREE.MathUtils.clamp(p.x, -9, 9), Math.max(0.8, p.y), 0, 5)
    if (this.physics?.presetName === 'unhinged') {
      // interns diving for cover counts as cardio
      for (const c of this._crowds) c.knockOverRandom(2 + Math.floor(this._rng() * 3))
      this.sfx('boing', { vol: 0.45 })
    }
  }
}

export const InstitutionalCapitalTower = {
  id: 'institutional-capital-tower',
  name: 'INSTITUTIONAL CAPITAL TOWER',
  music: 'battle_capital_tower',
  build(ctx) { return new InstitutionalCapitalTowerArena(ctx) },
}
