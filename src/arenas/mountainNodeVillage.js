// ============================================================================
// MOUNTAIN NODE VILLAGE — Shibro's stage (story round 5). A serene snowy
// plateau high above the FUD line: a stone fight circle painted with a
// chain-link motif, a village of dog huts with glowing windows, colossal
// CHAIN PYLONS carrying glowing chain links across an alpenglow sky, a rope
// bridge swaying in the back, pennant strings of tiny candlestick flags,
// falling snow, and a crowd of village dogs bowing in perfect consensus.
//
// Hazard: THE GONG at x≈8 — ragdoll impacts ring it. Deep gong tone, snow
// shockwave that knocks nearby standing fighters back, caption
// 'CONSENSUS REACHED'.
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
// small local helpers
// ---------------------------------------------------------------------------

// merge simple geometries (position+normal) — local copy of the ArenaBase
// private helper, used for the instanced dog geometry.
function mergeGeoms(geoms) {
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

// point on a sagging rope between a and b (quadratic catenary-ish dip)
function sagPoint(a, b, sag, t, out = new THREE.Vector3()) {
  out.set(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
    a.z + (b.z - a.z) * t
  )
  return out
}

const easeInOut = (t) => t * t * (3 - 2 * t)

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------

function makeSnowTexture(rng) {
  // trampled plateau snow: blue-white patches, speckle, the odd paw print
  return canvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = '#edf3fb'
    c.fillRect(0, 0, W, H)
    for (let i = 0; i < 42; i++) {
      c.fillStyle = `rgba(${180 + rng() * 30 | 0},${200 + rng() * 25 | 0},${235 + rng() * 20 | 0},${0.25 + rng() * 0.3})`
      c.beginPath()
      c.ellipse(rng() * W, rng() * H, 8 + rng() * 26, 5 + rng() * 16, rng() * Math.PI, 0, Math.PI * 2)
      c.fill()
    }
    // sparkle speckle
    c.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 90; i++) c.fillRect(rng() * W, rng() * H, 2, 2)
    // paw prints wandering through
    c.fillStyle = 'rgba(165,182,214,0.55)'
    for (let p = 0; p < 5; p++) {
      const px = rng() * W, py = rng() * H, a = rng() * Math.PI * 2
      for (let s = 0; s < 4; s++) {
        const x = px + Math.cos(a) * s * 14 + (s % 2 ? 6 : -6) * Math.sin(a)
        const y = py + Math.sin(a) * s * 14 + (s % 2 ? -6 : 6) * Math.cos(a)
        c.beginPath(); c.ellipse(x, y, 3.4, 4.2, a, 0, Math.PI * 2); c.fill()
        for (let t = 0; t < 3; t++) {
          c.beginPath(); c.arc(x + (t - 1) * 3.4, y - 5, 1.5, 0, Math.PI * 2); c.fill()
        }
      }
    }
  }, { repeat: [4, 3] })
}

function makeFightCircleTexture(rng) {
  // stone disc with a painted gold chain-link motif ring + center emblem
  const S = 512
  return canvasTexture(S, S, (c, W, H) => {
    const cx = W / 2, cy = H / 2
    // stone base
    c.fillStyle = '#6d7d96'
    c.beginPath(); c.arc(cx, cy, W / 2, 0, Math.PI * 2); c.fill()
    // radial stone tiles
    c.strokeStyle = 'rgba(38,48,66,0.5)'
    c.lineWidth = 4
    for (let ring = 0; ring < 3; ring++) {
      const r = W * (0.18 + ring * 0.145)
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
      const n = 10 + ring * 6
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3
        c.beginPath()
        c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        c.lineTo(cx + Math.cos(a) * (r + W * 0.145), cy + Math.sin(a) * (r + W * 0.145))
        c.stroke()
      }
    }
    // patches of drifted snow on the stone
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(238,244,252,${0.25 + rng() * 0.35})`
      const a = rng() * Math.PI * 2, r = W * (0.1 + rng() * 0.36)
      c.beginPath()
      c.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 10 + rng() * 30, 6 + rng() * 14, rng() * Math.PI, 0, Math.PI * 2)
      c.fill()
    }
    // painted chain-link motif ring (interlocked ovals)
    const mR = W * 0.415
    const links = 26
    for (let i = 0; i < links; i++) {
      const a = (i / links) * Math.PI * 2
      c.save()
      c.translate(cx + Math.cos(a) * mR, cy + Math.sin(a) * mR)
      c.rotate(a + (i % 2 ? Math.PI / 2 : 0))
      c.strokeStyle = i % 2 ? 'rgba(232,177,60,0.95)' : 'rgba(255,216,61,0.95)'
      c.lineWidth = 7
      c.beginPath(); c.ellipse(0, 0, 26, 14, 0, 0, Math.PI * 2); c.stroke()
      c.restore()
    }
    // center emblem: one BIG gold link + a paw stamp
    c.strokeStyle = '#ffd83d'
    c.lineWidth = 14
    c.beginPath(); c.ellipse(cx, cy, 74, 44, 0.5, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = 'rgba(122,84,10,0.8)'
    c.lineWidth = 4
    c.beginPath(); c.ellipse(cx, cy, 74, 44, 0.5, 0, Math.PI * 2); c.stroke()
    c.fillStyle = 'rgba(122,84,10,0.85)'
    c.beginPath(); c.ellipse(cx, cy + 4, 15, 18, 0, 0, Math.PI * 2); c.fill()
    for (let t = 0; t < 3; t++) {
      c.beginPath(); c.arc(cx + (t - 1) * 15, cy - 18, 6.5, 0, Math.PI * 2); c.fill()
    }
  }, { nearest: false })
}

function makeRuneBandTexture(rng) {
  // angular gold "node runes" on dark slate — for pylon bands & barrels
  return canvasTexture(192, 48, (c, W, H) => {
    c.fillStyle = '#2b3550'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#ffd83d'
    c.lineWidth = 3.5
    c.lineCap = 'square'
    const n = 7
    for (let g = 0; g < n; g++) {
      const gx = (g + 0.5) * (W / n), gy = H / 2
      c.beginPath()
      let x = gx - 8, y = gy - 12
      c.moveTo(x, y)
      const steps = 3 + Math.floor(rng() * 2)
      for (let s = 0; s < steps; s++) {
        x += (rng() - 0.35) * 16
        y += (rng() * 10 + 4) * (s % 2 ? 1 : 0.6)
        c.lineTo(Math.max(gx - 11, Math.min(gx + 11, x)), Math.min(gy + 13, y))
      }
      c.stroke()
    }
    c.fillStyle = 'rgba(255,216,61,0.75)'
    c.fillRect(0, 0, W, 4)
    c.fillRect(0, H - 4, W, 4)
  }, { repeat: [3, 1] })
}

function makeHutFrontTexture(rng, wallCol) {
  return canvasTexture(96, 72, (c, W, H) => {
    c.fillStyle = wallCol
    c.fillRect(0, 0, W, H)
    // plank lines
    c.strokeStyle = 'rgba(45,25,10,0.4)'
    c.lineWidth = 2
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(0, (H / 5) * i); c.lineTo(W, (H / 5) * i); c.stroke() }
    // arched dog door
    c.fillStyle = '#241610'
    c.beginPath()
    c.moveTo(W / 2 - 15, H)
    c.lineTo(W / 2 - 15, H - 26)
    c.arc(W / 2, H - 26, 15, Math.PI, 0)
    c.lineTo(W / 2 + 15, H)
    c.closePath(); c.fill()
    // door trim
    c.strokeStyle = 'rgba(255,216,61,0.7)'
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(W / 2 - 15, H)
    c.lineTo(W / 2 - 15, H - 26)
    c.arc(W / 2, H - 26, 15, Math.PI, 0)
    c.lineTo(W / 2 + 15, H)
    c.stroke()
    // tiny bone plaque over the door
    c.fillStyle = '#f4ead2'
    c.fillRect(W / 2 - 10, H - 52, 20, 7)
    c.beginPath(); c.arc(W / 2 - 10, H - 50, 3.4, 0, Math.PI * 2); c.arc(W / 2 - 10, H - 46, 3.4, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.arc(W / 2 + 10, H - 50, 3.4, 0, Math.PI * 2); c.arc(W / 2 + 10, H - 46, 3.4, 0, Math.PI * 2); c.fill()
  })
}

function makeCandleFlagTexture(up) {
  // triangular pennant with a single fat candlestick painted on it
  return canvasTexture(48, 64, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    // pennant triangle, point down
    c.fillStyle = '#f4ead2'
    c.beginPath()
    c.moveTo(2, 2); c.lineTo(W - 2, 2); c.lineTo(W / 2, H - 3)
    c.closePath(); c.fill()
    c.strokeStyle = up ? '#2c7a46' : '#93353c'
    c.lineWidth = 3
    c.stroke()
    // candle: wick + body
    const col = up ? '#37a85f' : '#d9534f'
    c.strokeStyle = col
    c.lineWidth = 3
    c.beginPath(); c.moveTo(W / 2, 8); c.lineTo(W / 2, 40); c.stroke()
    c.fillStyle = col
    if (up) c.fillRect(W / 2 - 6, 16, 12, 16)
    else c.fillRect(W / 2 - 6, 12, 12, 16)
  })
}

// ---------------------------------------------------------------------------
// mesh factories
// ---------------------------------------------------------------------------

function makeMountainRange(rng) {
  const g = new THREE.Group()
  g.name = 'mountainRange'
  const rockMats = [flatMat(0x59688a), flatMat(0x67779b), flatMat(0x4e5d7e)]
  const snowMat = flatMat(0xf3f0f7)
  const peak = (x, z, r, h, seg) => {
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), rockMats[Math.floor(rng() * rockMats.length)])
    rock.position.set(x, h / 2 - 0.4, z)
    rock.rotation.y = rng() * Math.PI
    g.add(rock)
    // snow cap: smaller cone nested over the summit
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, h * 0.38, seg), snowMat)
    cap.position.set(x, h - h * 0.19 - 0.4, z)
    cap.rotation.y = rock.rotation.y + 0.3
    g.add(cap)
  }
  // grand back range
  const defs = [
    [-38, -46, 14, 22, 6], [-24, -40, 10, 15, 5], [-12, -47, 13, 26, 6],
    [0, -42, 9, 14, 5], [10, -48, 15, 24, 7], [24, -41, 10, 17, 5],
    [38, -46, 13, 20, 6],
  ]
  for (const [x, z, r, h, s] of defs) peak(x, z, r, h, s)
  // side sentinels so the horizon never leaks
  peak(-34, -18, 11, 18, 6)
  peak(34, -20, 12, 19, 6)
  // mid-ground foothill mounds (buried snow domes)
  for (let i = 0; i < 7; i++) {
    const r = 3 + rng() * 5
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), snowMat)
    m.position.set(-30 + i * 10 + (rng() - 0.5) * 5, -r * 0.55, -22 - rng() * 6)
    g.add(m)
  }
  return g
}

function makeHut(rng, opts = {}) {
  const g = new THREE.Group()
  g.name = 'dogHut'
  const wallCols = ['#8a5a34', '#7a4e2c', '#96653c', '#6e452a']
  const roofCols = [0xa63d38, 0x3d5a8a, 0x8a6a2e, 0x5a7a4a]
  const wallCol = opts.wall ?? wallCols[Math.floor(rng() * wallCols.length)]
  const w = 1.7, h = 1.15, d = 1.5
  const front = new THREE.MeshLambertMaterial({ map: makeHutFrontTexture(rng, wallCol), flatShading: true })
  const side = flatMat(new THREE.Color(wallCol).offsetHSL(0, -0.04, -0.05))
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, front, side])
  base.position.y = h / 2
  g.add(base)
  // pyramid roof + snow frosting
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.95, 4), flatMat(opts.roof ?? roofCols[Math.floor(rng() * roofCols.length)]))
  roof.rotation.y = Math.PI / 4
  roof.position.y = h + 0.47
  g.add(roof)
  const snow = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.52, 4), flatMat(0xf3f0f7))
  snow.rotation.y = Math.PI / 4
  snow.position.y = h + 0.78
  g.add(snow)
  // glowing round windows (pulsed by the arena)
  const windowMats = []
  for (const wx of [-0.5, 0.5]) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd98a })
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), mat)
    win.position.set(wx, 0.74, d / 2 + 0.012)
    g.add(win)
    windowMats.push(mat)
  }
  return { group: g, windowMats }
}

function makePylon(rng, runeTex) {
  const g = new THREE.Group()
  g.name = 'chainPylon'
  const stone = flatMat(0x5d6c88)
  const stoneDark = flatMat(0x495772)
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), stoneDark)
  base.position.y = 0.6
  g.add(base)
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.35, 8.4, 1.35), stone)
  shaft.position.y = 5.3
  g.add(shaft)
  // rune band near the top
  const bandMat = new THREE.MeshLambertMaterial({ map: runeTex, flatShading: true })
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.5), bandMat)
  band.position.y = 8.7
  g.add(band)
  // cap beam + spire
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 1.6), stoneDark)
  beam.position.y = 9.9
  g.add(beam)
  const spire = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), stone)
  spire.position.y = 10.9
  g.add(spire)
  // snow ledges
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.16, 1.7), flatMat(0xf3f0f7))
  ledge.position.y = 10.3
  g.add(ledge)
  // the NODE — glowing orb the sky-chain hangs from
  const orbMat = new THREE.MeshLambertMaterial({
    color: 0x8ff2ff, emissive: 0x3fd8f0, emissiveIntensity: 0.8, flatShading: true,
  })
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), orbMat)
  orb.position.y = 11.85
  g.add(orb)
  return { group: g, orbMat, orb }
}

// giant glowing chain slung between two points; group origin sits on the
// anchor line so a tiny rotation.x is a proper pendulum sway.
function makeSkyChain(a, b, sag, linkR, mat) {
  const group = new THREE.Group()
  group.name = 'skyChain'
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  group.position.copy(mid)
  const la = new THREE.Vector3().subVectors(a, mid)
  const lb = new THREE.Vector3().subVectors(b, mid)
  const span = a.distanceTo(b)
  const n = Math.max(5, Math.round(span / (linkR * 2.1)))
  const geo = new THREE.TorusGeometry(linkR, linkR * 0.24, 6, 10)
  const p = new THREE.Vector3()
  const p2 = new THREE.Vector3()
  for (let i = 0; i <= n; i++) {
    const t = i / n
    sagPoint(la, lb, sag, t, p)
    sagPoint(la, lb, sag, Math.min(1, t + 0.02), p2)
    const link = new THREE.Mesh(geo, mat)
    link.position.copy(p)
    link.rotation.z = Math.atan2(p2.y - p.y, p2.x - p.x)
    link.rotation.x = (i % 2) * Math.PI / 2 // alternate link planes
    group.add(link)
  }
  return group
}

function makeRopeBridge(rng) {
  // two rock towers + a sagging plank deck with rope rails, far background
  const g = new THREE.Group()
  g.name = 'ropeBridge'
  const rock = flatMat(0x59688a)
  const snowMat = flatMat(0xf3f0f7)
  const tower = (x, hgt) => {
    let y = 0
    for (let i = 0; i < 3; i++) {
      const s = 2.6 - i * 0.55
      const seg = new THREE.Mesh(new THREE.BoxGeometry(s + rng() * 0.5, hgt / 3, s + rng() * 0.5), rock)
      seg.position.set(x + (rng() - 0.5) * 0.35, y + hgt / 6, (rng() - 0.5) * 0.4)
      seg.rotation.y = rng() * 0.5
      g.add(seg)
      y += hgt / 3
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.2), snowMat)
    cap.position.set(x, hgt + 0.12, 0)
    g.add(cap)
    return hgt
  }
  const ax = -5.6, bx = 5.6
  tower(ax, 6.2)
  tower(bx, 5.8)

  // deck pivots at the anchor line so it can swing
  const deck = new THREE.Group()
  const a = new THREE.Vector3(ax, 6.35, 0)
  const b = new THREE.Vector3(bx, 5.95, 0)
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  deck.position.copy(mid)
  const la = new THREE.Vector3().subVectors(a, mid)
  const lb = new THREE.Vector3().subVectors(b, mid)
  const plankMat = flatMat(0x7a5230)
  const ropeMat = flatMat(0xc9b896)
  const nPlank = 13
  const p = new THREE.Vector3()
  const prevTop = [new THREE.Vector3(), new THREE.Vector3()]
  for (let i = 0; i < nPlank; i++) {
    const t = (i + 0.5) / nPlank
    sagPoint(la, lb, 1.0, t, p)
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 1.05), plankMat)
    plank.position.copy(p)
    plank.rotation.y = (rng() - 0.5) * 0.14
    plank.rotation.z = (rng() - 0.5) * 0.1
    deck.add(plank)
    // rope rail segments on both sides
    for (let s = 0; s < 2; s++) {
      const z = s === 0 ? -0.5 : 0.5
      const top = new THREE.Vector3(p.x, p.y + 0.78, z)
      if (i > 0) {
        const seg = new THREE.Vector3().subVectors(top, prevTop[s])
        const len = seg.length()
        const rope = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), ropeMat)
        rope.position.copy(prevTop[s]).addScaledVector(seg, 0.5)
        rope.rotation.z = Math.atan2(seg.y, seg.x)
        deck.add(rope)
      }
      prevTop[s].copy(top)
      if (i % 3 === 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.07), ropeMat)
        post.position.set(p.x, p.y + 0.4, z)
        deck.add(post)
      }
    }
  }
  g.add(deck)
  return { group: g, deck }
}

function makePennantString(a, b, sag, texUp, texDown, rng) {
  const g = new THREE.Group()
  g.name = 'pennants'
  // the string itself
  const pts = []
  for (let i = 0; i <= 16; i++) pts.push(sagPoint(a, b, sag, i / 16))
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8dbc8 }))
  g.add(line)
  // flags
  const flags = []
  const matUp = new THREE.MeshLambertMaterial({ map: texUp, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
  const matDown = new THREE.MeshLambertMaterial({ map: texDown, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
  const geo = new THREE.PlaneGeometry(0.34, 0.5)
  const n = 11
  const p = new THREE.Vector3()
  for (let i = 1; i < n; i++) {
    const t = i / n
    sagPoint(a, b, sag, t, p)
    // green candles outnumber red — this village believes
    const flag = new THREE.Mesh(geo, rng() < 0.68 ? matUp : matDown)
    flag.position.set(p.x, p.y - 0.28, p.z)
    flag.rotation.y = (rng() - 0.5) * 0.5
    g.add(flag)
    flags.push({ mesh: flag, phase: rng() * Math.PI * 2, baseRy: flag.rotation.y })
  }
  return { group: g, flags }
}

function makeSnowWall(length) {
  // low stone barrier with a snow cap, keeps dogs off the consensus floor
  const g = new THREE.Group()
  g.name = 'snowWall'
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 0.55, 0.35), flatMat(0x5d6c88))
  wall.position.y = 0.275
  g.add(wall)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(length + 0.12, 0.16, 0.46), flatMat(0xf3f0f7))
  cap.position.y = 0.6
  g.add(cap)
  return g
}

function makeStoneLantern() {
  const g = new THREE.Group()
  g.name = 'stoneLantern'
  const stone = flatMat(0x6d7d96)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), stone)
  base.position.y = 0.15
  g.add(base)
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.26), stone)
  post.position.y = 0.75
  g.add(post)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd98a })
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), glowMat)
  box.position.y = 1.4
  g.add(box)
  const frame = flatMat(0x495772)
  for (const [ox, oz] of [[-0.26, -0.26], [-0.26, 0.26], [0.26, -0.26], [0.26, 0.26]]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.09), frame)
    corner.position.set(ox, 1.4, oz)
    g.add(corner)
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.34, 4), stone)
  roof.rotation.y = Math.PI / 4
  roof.position.y = 1.78
  g.add(roof)
  const snow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.2, 4), flatMat(0xf3f0f7))
  snow.rotation.y = Math.PI / 4
  snow.position.y = 1.92
  g.add(snow)
  return { group: g, glowMat }
}

// -- breakables --------------------------------------------------------------

function makeChainSegmentProp(yaw, withSnow) {
  // a fallen link off the great sky-chain, half sunk in the snow
  const g = new THREE.Group()
  g.name = 'chainSegment'
  const mat = new THREE.MeshLambertMaterial({
    color: 0xd9b25a, emissive: 0x8a5e14, emissiveIntensity: 0.25, flatShading: true,
  })
  const link = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 6, 10), mat)
  link.rotation.x = Math.PI / 2 - 0.16
  link.rotation.z = yaw
  link.position.y = 0.22
  g.add(link)
  if (withSnow) {
    const drift = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), flatMat(0xf3f0f7))
    drift.scale.set(1.4, 0.5, 1.1)
    drift.position.set(0.3, 0.1, -0.2)
    g.add(drift)
  }
  return g
}

function makeNodeBarrel(runeTex) {
  // prayer-wheel node: wooden barrel, spinning rune band, blinking uptime LED
  const g = new THREE.Group()
  g.name = 'nodeBarrel'
  const wood = flatMat(0x5e3d22)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.95, 9), wood)
  body.position.y = 0.475
  g.add(body)
  const gold = flatMat(0xd9a325)
  for (const y of [0.12, 0.85]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.465, 0.465, 0.07, 9), gold)
    hoop.position.y = y
    g.add(hoop)
  }
  const bandMat = new THREE.MeshLambertMaterial({ map: runeTex, flatShading: true })
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.42, 9, 1, true), bandMat)
  band.position.y = 0.48
  g.add(band)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.18, 9), gold)
  cap.position.y = 1.03
  g.add(cap)
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x53ff86 })
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), ledMat)
  led.position.y = 1.16
  g.add(led)
  return { group: g, band, ledMat }
}

function makeFirewoodStack(rng, big) {
  const g = new THREE.Group()
  g.name = 'firewood'
  const side = flatMat(0x6a4a2e)
  const capMat = flatMat(0xc9a06a)
  const rows = big ? [3, 2, 1] : [2, 1]
  const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.92, 7)
  geo.rotateX(Math.PI / 2) // logs lie along Z
  let y = 0.14
  for (let r = 0; r < rows.length; r++) {
    const n = rows[r]
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(geo, [side, capMat, capMat])
      log.position.set((i - (n - 1) / 2) * 0.3, y, (rng() - 0.5) * 0.12)
      log.rotation.y = (rng() - 0.5) * 0.12
      g.add(log)
    }
    y += 0.26
  }
  const snow = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.9 : 0.6, 0.09, 0.8), flatMat(0xf3f0f7))
  snow.position.y = y - 0.1
  g.add(snow)
  return g
}

function makeGong() {
  // red-lacquered frame, fat gold disc facing the fight (normal along X)
  const g = new THREE.Group()
  g.name = 'gong'
  const lacquer = flatMat(0x8a2b28)
  const lacquerDark = flatMat(0x5e1c1a)
  for (const z of [-0.95, 0.95]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.5), lacquerDark)
    foot.position.set(0, 0.13, z)
    g.add(foot)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.0, 0.2), lacquer)
    post.position.set(0, 1.5, z)
    g.add(post)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 2.3), lacquer)
  beam.position.set(0, 3.02, 0)
  g.add(beam)
  // gold finials + snow on the beam
  const gold = flatMat(0xd9a325)
  for (const z of [-1.12, 1.12]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), gold)
    finial.position.set(0, 3.16, z)
    g.add(finial)
  }
  const beamSnow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 2.0), flatMat(0xf3f0f7))
  beamSnow.position.set(0, 3.18, 0)
  g.add(beamSnow)

  // disc face: hammered gold rings + center boss
  const faceTex = canvasTexture(128, 128, (c, W, H) => {
    c.fillStyle = '#e8b13c'
    c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); c.fill()
    for (let r = 0; r < 4; r++) {
      c.strokeStyle = r % 2 ? 'rgba(140,90,15,0.8)' : 'rgba(255,230,150,0.8)'
      c.lineWidth = 4
      c.beginPath(); c.arc(W / 2, H / 2, W * (0.14 + r * 0.09), 0, Math.PI * 2); c.stroke()
    }
    c.fillStyle = '#8a5e0d'
    c.beginPath(); c.arc(W / 2, H / 2, W * 0.1, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#ffe9a8'
    c.beginPath(); c.arc(W / 2 - 4, H / 2 - 4, W * 0.045, 0, Math.PI * 2); c.fill()
    // dimples
    c.fillStyle = 'rgba(140,90,15,0.5)'
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      c.beginPath(); c.arc(W / 2 + Math.cos(a) * W * 0.42, H / 2 + Math.sin(a) * W * 0.42, 2.6, 0, Math.PI * 2); c.fill()
    }
  })
  const discPivot = new THREE.Group()
  discPivot.position.set(0, 2.9, 0)
  const discGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.12, 16)
  discGeo.rotateZ(Math.PI / 2) // caps face +/-X
  const rim = flatMat(0xb8871c)
  const capMat = new THREE.MeshLambertMaterial({ map: faceTex, flatShading: true })
  const disc = new THREE.Mesh(discGeo, [rim, capMat, capMat])
  disc.position.y = -1.35
  discPivot.add(disc)
  // hanging ropes
  const ropeMat = flatMat(0xc9b896)
  for (const z of [-0.3, 0.3]) {
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), ropeMat)
    rope.position.set(0, -0.2, z)
    discPivot.add(rope)
  }
  g.add(discPivot)
  // plaque on the near post
  const plaque = makeSign('GONG = CONSENSUS', { w: 1.15, h: 0.3, depth: 0.06, px: 72, bg: '#4a2313', fg: '#ffd83d', border: '#e8b13c' })
  plaque.position.set(-0.14, 0.9, 0.95)
  plaque.rotation.y = -Math.PI / 2
  g.add(plaque)
  return { group: g, discPivot }
}

// ---------------------------------------------------------------------------
// bowing village-dog crowd (instanced, rhythm-synced, tip-over capable)
// ---------------------------------------------------------------------------

const DOG_PALETTE = ['#e8a15a', '#d98b3f', '#f0c48a', '#c9773a', '#f4e3c8', '#8a6a4a', '#e0b06a']

function dogGeometry() {
  const body = new THREE.SphereGeometry(0.32, 7, 5)
  body.scale(1, 0.95, 1.2)
  body.translate(0, 0.38, -0.04)
  const chest = new THREE.SphereGeometry(0.2, 6, 5)
  chest.translate(0, 0.52, 0.16)
  const head = new THREE.SphereGeometry(0.22, 6, 5)
  head.translate(0, 0.84, 0.1)
  const snout = new THREE.SphereGeometry(0.11, 5, 4)
  snout.scale(1, 0.8, 1.35)
  snout.translate(0, 0.78, 0.3)
  const earL = new THREE.ConeGeometry(0.09, 0.26, 4)
  earL.rotateZ(0.3)
  earL.translate(-0.14, 1.06, 0.05)
  const earR = new THREE.ConeGeometry(0.09, 0.26, 4)
  earR.rotateZ(-0.3)
  earR.translate(0.14, 1.06, 0.05)
  const tail = new THREE.SphereGeometry(0.11, 5, 4)
  tail.translate(0, 0.46, -0.36)
  const pawL = new THREE.SphereGeometry(0.07, 5, 4)
  pawL.translate(-0.13, 0.07, 0.26)
  const pawR = new THREE.SphereGeometry(0.07, 5, 4)
  pawR.translate(0.13, 0.07, 0.26)
  return mergeGeoms([body, chest, head, snout, earL, earR, tail, pawL, pawR])
}

// Same public surface as ArenaBase.buildCrowd, but the spectators are shibas
// who bow toward the fight in a slow synchronized wave (+Z is "toward").
function buildDogCrowd(opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 20))
  const areaW = opts.area?.w ?? 10
  const areaD = opts.area?.d ?? 2.2
  const rng = opts.rng || makeRng(0xd06)

  const group = new THREE.Group()
  group.name = 'dogCrowd'
  const geo = dogGeometry()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(mesh)

  const rows = Math.max(1, Math.round(areaD / 0.85))
  const perRow = Math.ceil(count / rows)
  const baseX = new Float32Array(count)
  const baseY = new Float32Array(count)
  const baseZ = new Float32Array(count)
  const phase = new Float32Array(count)
  const size = new Float32Array(count)
  const yaw = new Float32Array(count)
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const n = Math.min(perRow, count - row * perRow)
    baseX[i] = ((col + 0.5) / n) * areaW - areaW / 2 + (rng() - 0.5) * 0.3
    baseZ[i] = -row * 0.85 + (rng() - 0.5) * 0.2
    baseY[i] = row * 0.42
    // bow wave rolls across the row — devotion, sequenced like a blockchain
    phase[i] = (baseX[i] + areaW / 2) * 0.35 + rng() * 0.25
    size[i] = 0.85 + rng() * 0.35
    yaw[i] = (rng() - 0.5) * 0.3
    color.set(DOG_PALETTE[Math.floor(rng() * DOG_PALETTE.length)])
    color.offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.12)
    mesh.setColorAt(i, color)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

  // snowy risers
  if (opts.risers !== false) {
    const riserMat = flatMat(0xdde7f2)
    for (let r = 1; r < rows; r++) {
      const hgt = r * 0.42
      const riser = new THREE.Mesh(new THREE.BoxGeometry(areaW + 0.7, hgt, 0.85), riserMat)
      riser.position.set(0, hgt / 2, -r * 0.85)
      group.add(riser)
    }
  }

  const tipped = new Map() // i -> { phase, t, timer, ztilt }
  let time = rng() * 10
  let hype = 0

  const _pos = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _eul = new THREE.Euler()
  const _scl = new THREE.Vector3()
  const _m = new THREE.Matrix4()

  function composeBowing(i) {
    const raw = Math.sin(time * (1.5 + hype * 0.9) + phase[i])
    const bow = easeInOut(Math.max(0, raw)) * (0.6 + hype * 0.18)
    const hop = hype > 0.05 ? Math.abs(Math.sin(time * 7 + phase[i] * 3)) * 0.1 * Math.min(1.6, hype) : 0
    _pos.set(baseX[i], baseY[i] + hop, baseZ[i])
    _eul.set(bow, yaw[i], 0)
    _quat.setFromEuler(_eul)
    const sy = 1 - bow * 0.1
    _scl.set(size[i] / Math.sqrt(sy), size[i] * sy, size[i] / Math.sqrt(sy))
    _m.compose(_pos, _quat, _scl)
    mesh.setMatrixAt(i, _m)
  }

  function composeTipped(i, st) {
    let ang
    if (st.phase === 'fall') ang = -1.65 * easeInOut(st.t)
    else if (st.phase === 'down') ang = -1.65 + Math.sin(time * 6 + phase[i]) * 0.03 // legs paddling in the air
    else ang = -1.65 * (1 - easeInOut(st.t))
    _pos.set(baseX[i], baseY[i], baseZ[i])
    _eul.set(ang, yaw[i], st.ztilt)
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
      hype = Math.max(0, hype - dt * 1.2)
      for (let i = 0; i < count; i++) {
        const st = tipped.get(i)
        if (!st) { composeBowing(i); continue }
        if (st.phase === 'fall') {
          st.t = Math.min(1, st.t + dt / 0.3)
          if (st.t >= 1) { st.phase = 'down'; st.timer = 2.0 + rng() * 2.4 }
        } else if (st.phase === 'down') {
          st.timer -= dt
          if (st.timer <= 0) { st.phase = 'rise'; st.t = 0 }
        } else {
          st.t = Math.min(1, st.t + dt / 0.5)
          if (st.t >= 1) { tipped.delete(i); composeBowing(i); continue }
        }
        composeTipped(i, st)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
    cheer(strength = 1) { hype = Math.min(3, hype + strength) },
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
// falling snow (light) — CPU-updated points with a soft round sprite
// ---------------------------------------------------------------------------

function makeSnowfall(count, rng) {
  const sprite = canvasTexture(32, 32, (c, W, H) => {
    const grad = c.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.8)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = grad
    c.fillRect(0, 0, W, H)
  }, { nearest: false })
  const AREA = { x: 17, yTop: 13.5, z0: -12, z1: 3.5 }
  const pos = new Float32Array(count * 3)
  const fall = new Float32Array(count)
  const drift = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() * 2 - 1) * AREA.x
    pos[i * 3 + 1] = rng() * AREA.yTop
    pos[i * 3 + 2] = AREA.z0 + rng() * (AREA.z1 - AREA.z0)
    fall[i] = 0.55 + rng() * 0.8
    drift[i] = 0.25 + rng() * 0.5
    phase[i] = rng() * Math.PI * 2
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.14, map: sprite, transparent: true, opacity: 0.85,
    depthWrite: false, sizeAttenuation: true, color: 0xffffff,
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'snowfall'
  points.frustumCulled = false
  let t = 0
  return {
    points,
    update(dt) {
      t += dt
      for (let i = 0; i < count; i++) {
        let y = pos[i * 3 + 1] - fall[i] * dt
        if (y < 0.02) {
          y = AREA.yTop
          pos[i * 3] = (rng() * 2 - 1) * AREA.x
          pos[i * 3 + 2] = AREA.z0 + rng() * (AREA.z1 - AREA.z0)
        }
        pos[i * 3 + 1] = y
        pos[i * 3] += Math.sin(t * 0.8 + phase[i]) * drift[i] * dt
      }
      geo.attributes.position.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

class MountainNodeVillageArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.5 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0x5411b0)
    this._time = 0
    this._launched = []          // { f, ttl } recent ragdolls — gong candidates
    this._fighters = new Set()   // every fighter we have ever seen (for shockwave)
    this._crowds = []
    this._windowMats = []        // hut/lantern glow materials, pulsed
    this._flags = []             // pennant flags, fluttered
    this._gongCool = 0
    this._gongSwing = { ang: 0, vel: 0 }
    this._shock = null           // expanding snow shockwave ring
    this._chunks = []            // snow burst debris pool
    this._barkT = 5 + this._rng() * 6
    this._windT = 8 + this._rng() * 8

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildFloor()
    this._buildBackdrop()
    this._buildCrowds()
    this._buildGong()
    this._buildProps()
    this._buildSnow()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction ---------------------------------------------------------

  _buildPhysics() {
    // plateau slab + invisible bouncy walls on all four sides at the bounds
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    // alpenglow: indigo zenith melting through violet and pink into gold
    const sky = buildSkyDome(['#3d4a94', '#7a6fc0', '#d98ab8', '#ffb08a', '#ffe1ae'], {
      rng: this._rng, cloudColor: 'rgba(255,222,232,0.9)',
    })
    this.group.add(sky)
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xffd9e8, hemiGround: 0xcdd8ec, hemiIntensity: 1.0,
      sunColor: 0xffcf9a, sunIntensity: 1.6, sunPos: [14, 12, 10],
      fillColor: 0x9ab4e8, fillIntensity: 0.42,
      fog: { color: 0xe8cdda, near: 40, far: 105 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildFloor() {
    const tex = makeSnowTexture(this._rng)
    const sideMat = flatMat(0x8b98ad)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 26), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -3)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)
    // the stone fight circle, painted with the chain-link motif
    const circle = new THREE.Mesh(
      new THREE.CircleGeometry(9.6, 36),
      new THREE.MeshLambertMaterial({ map: makeFightCircleTexture(this._rng), flatShading: true })
    )
    circle.rotation.x = -Math.PI / 2
    circle.position.set(0, 0.012, 0)
    circle.receiveShadow = !!this.quality.shadows
    this.group.add(circle)
    // endless snowfield beyond the plateau
    const field = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), flatMat(0xe6eef8))
    field.rotation.x = -Math.PI / 2
    field.position.y = -0.32
    this.group.add(field)
  }

  _buildBackdrop() {
    const rng = this._rng
    const runeTex = makeRuneBandTexture(rng)

    // -- snow peaks all around
    this.group.add(makeMountainRange(rng))

    // -- the village: dog huts with glowing windows
    const hutDefs = [
      { x: -6.6, z: -11.6, ry: 0.16, s: 1.05 },
      { x: -2.9, z: -10.1, ry: -0.1, s: 0.9 },
      { x: 0.7, z: -12.4, ry: 0.05, s: 1.25 },
      { x: 4.3, z: -10.3, ry: -0.22, s: 0.95 },
      { x: 7.8, z: -11.9, ry: 0.12, s: 1.1 },
      { x: -10.9, z: -8.4, ry: 0.4, s: 0.85 },
      { x: 11.3, z: -8.7, ry: -0.35, s: 0.9 },
      { x: -13.2, z: -2.4, ry: 1.15, s: 1.0 },
      { x: 13.4, z: -2.0, ry: -1.15, s: 0.95 },
    ]
    for (const hd of hutDefs) {
      const hut = makeHut(rng)
      hut.group.position.set(hd.x, 0, hd.z)
      hut.group.rotation.y = hd.ry
      hut.group.scale.setScalar(hd.s)
      this.group.add(hut.group)
      for (const m of hut.windowMats) this._windowMats.push({ mat: m, phase: rng() * Math.PI * 2 })
    }
    // one hut gets a shingle — the village economy
    const barkery = makeSign('BARKERY', { w: 1.3, h: 0.4, depth: 0.07, px: 72, bg: '#4a2313', fg: '#ffd83d', border: '#e8b13c' })
    barkery.position.set(-2.9, 1.75, -9.2)
    barkery.rotation.y = -0.1
    this.group.add(barkery)

    // -- village marquee on chunky posts
    const marquee = makeSign('MOUNTAIN NODE VILLAGE', {
      w: 7.2, h: 1.7, depth: 0.28, px: 80,
      bg: '#4a2313', fg: '#ffd83d', border: '#e8b13c',
      sub: 'FINALITY GUARANTEED · ALT 42,069 M', subColor: '#9fe8b0',
    })
    marquee.position.set(0, 6.1, -10.4)
    marquee.rotation.x = -0.05
    this.group.add(marquee)
    const postMat = flatMat(0x5e3d22)
    for (const px of [-3.2, 3.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 6.1, 0.24), postMat)
      post.position.set(px, 3.05, -10.4)
      this.group.add(post)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), flatMat(0xf3f0f7))
      cap.position.set(px, 6.15 + 0.85, -10.4)
      cap.position.y = 6.98
      this.group.add(cap)
    }

    // -- trail sign, because even enlightenment needs wayfinding
    const trail = makeSign('← MOON · VALLEY →', { w: 2.1, h: 0.55, depth: 0.09, px: 72, bg: '#4a2313', fg: '#ffe14d', border: '#e8b13c' })
    const trailPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), postMat)
    trailPole.position.set(-10.8, 1.2, 0.9)
    trail.position.set(-10.8, 2.15, 0.9)
    trail.rotation.y = 0.35
    trail.rotation.z = 0.04
    this.group.add(trailPole, trail)

    // -- CHAIN PYLONS + the great glowing sky-chain
    this._chainMat = new THREE.MeshLambertMaterial({
      color: 0xffd27a, emissive: 0xff9d2e, emissiveIntensity: 0.55, flatShading: true,
    })
    this._orbMats = []
    for (const side of [-1, 1]) {
      const pylon = makePylon(rng, runeTex)
      pylon.group.position.set(side * 13.4, 0, -6.5)
      this.group.add(pylon.group)
      this._orbMats.push(pylon.orbMat)
    }
    this._skyChains = []
    const chainA = makeSkyChain(
      new THREE.Vector3(-13.4, 11.6, -6.5), new THREE.Vector3(13.4, 11.6, -6.5),
      2.7, 0.8, this._chainMat
    )
    this.group.add(chainA)
    this._skyChains.push({ group: chainA, phase: 0, rate: 0.32, amp: 0.055 })
    // a second, farther span for depth
    const chainB = makeSkyChain(
      new THREE.Vector3(-22, 14.6, -18), new THREE.Vector3(22, 13.9, -18),
      3.6, 1.05, this._chainMat
    )
    this.group.add(chainB)
    this._skyChains.push({ group: chainB, phase: 1.7, rate: 0.24, amp: 0.045 })

    // -- rope bridge swinging in the background
    const bridge = makeRopeBridge(rng)
    bridge.group.position.set(-11, 0, -19.5)
    this.group.add(bridge.group)
    this._bridgeDeck = bridge.deck

    // -- pennant strings of tiny candlestick flags
    const texUp = makeCandleFlagTexture(true)
    const texDown = makeCandleFlagTexture(false)
    const strings = [
      [new THREE.Vector3(-13.4, 9.6, -6.5), new THREE.Vector3(-0.6, 7.0, -10.2), 1.3],
      [new THREE.Vector3(13.4, 9.6, -6.5), new THREE.Vector3(0.6, 7.0, -10.2), 1.3],
      [new THREE.Vector3(-10.9, 6.2, -8.4), new THREE.Vector3(-13.2, 4.4, -2.6), 0.8],
    ]
    for (const [a, b, sag] of strings) {
      const pen = makePennantString(a, b, sag, texUp, texDown, rng)
      this.group.add(pen.group)
      for (const f of pen.flags) this._flags.push(f)
    }

    // -- stone lanterns framing the circle
    for (const side of [-1, 1]) {
      const lantern = makeStoneLantern()
      lantern.group.position.set(side * 10.4, 0, 0.6)
      lantern.group.rotation.y = side * -0.3
      this.group.add(lantern.group)
      this._windowMats.push({ mat: lantern.glowMat, phase: rng() * Math.PI * 2 })
    }

    // ambient animation: chain sway + glow pulses + flag flutter + bridge swing
    this.addUpdater((dt) => {
      const t = this._time
      for (const ch of this._skyChains) {
        ch.group.rotation.x = Math.sin(t * ch.rate + ch.phase) * ch.amp
      }
      this._chainMat.emissiveIntensity = 0.48 + Math.sin(t * 0.9) * 0.16
      for (const om of this._orbMats) om.emissiveIntensity = 0.65 + Math.sin(t * 1.6) * 0.25
      if (this._bridgeDeck) this._bridgeDeck.rotation.x = Math.sin(t * 0.5 + 1.2) * 0.045
      for (let i = 0; i < this._flags.length; i++) {
        const f = this._flags[i]
        f.mesh.rotation.y = f.baseRy + Math.sin(t * 2.6 + f.phase) * 0.22
        f.mesh.rotation.z = Math.sin(t * 3.1 + f.phase * 1.3) * 0.1
      }
      for (const w of this._windowMats) {
        const l = 0.62 + Math.sin(t * 1.7 + w.phase) * 0.07
        w.mat.color.setHSL(0.1, 0.85, l)
      }
    })
  }

  _buildCrowds() {
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const nBack = Math.round(total * 0.42)
    const nSide = Math.max(4, Math.floor((total - nBack) / 2))
    const rng = this._rng

    const back = buildDogCrowd({ count: nBack, area: { w: 22, d: 2.6 }, rng })
    back.group.position.set(0, 0, -7.4)
    this.group.add(back.group)

    const left = buildDogCrowd({ count: nSide, area: { w: 12, d: 2.2 }, rng })
    left.group.position.set(-12.4, 0, -0.6)
    left.group.rotation.y = Math.PI / 2 // bow toward +X, the fight
    this.group.add(left.group)

    const right = buildDogCrowd({ count: nSide, area: { w: 12, d: 2.2 }, rng })
    right.group.position.set(12.4, 0, -0.6)
    right.group.rotation.y = -Math.PI / 2
    this.group.add(right.group)

    this._crowdBack = back
    this._crowdLeft = left
    this._crowdRight = right
    this._crowds = [back, left, right]
    for (const c of this._crowds) {
      this.addUpdater((dt) => c.update(dt))
      this.onDispose(() => c.dispose())
    }

    // low snow walls between the faithful and the fisticuffs
    const backWall = makeSnowWall(24)
    backWall.position.set(0, 0, -6.0)
    this.group.add(backWall)
    for (const side of [-1, 1]) {
      const wall = makeSnowWall(12.5)
      wall.position.set(side * 10.6, 0, -0.6)
      wall.rotation.y = side * Math.PI / 2
      this.group.add(wall)
    }
  }

  _buildGong() {
    // v2.0 free-roam: the gong keeps its right-edge post but slides toward
    // the back corner, off the (now much wider) center lane
    const gong = makeGong()
    gong.group.position.set(8.1, 0, -3.6)
    gong.group.rotation.y = 0.0
    if (this.quality.shadows) gong.group.traverse((o) => { if (o.isMesh) o.castShadow = true })
    this.group.add(gong.group)
    this._gongGroup = gong.group
    this._gongPivot = gong.discPivot

    // snow shockwave ring (hidden until the gong speaks)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    })
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.12, 24), ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(8.1, 0.06, -3.6)
    ring.visible = false
    this.group.add(ring)
    this._shock = { mesh: ring, mat: ringMat, t: 1 }

    // pooled snow chunks for the burst
    const chunkGeo = new THREE.IcosahedronGeometry(0.11, 0)
    const chunkMat = flatMat(0xf3f0f7)
    const nChunks = Math.max(6, Math.round(12 * (this.quality.particleScale ?? 0.75)))
    for (let i = 0; i < nChunks; i++) {
      const m = new THREE.Mesh(chunkGeo, chunkMat)
      m.visible = false
      this.group.add(m)
      this._chunks.push({ mesh: m, vel: new THREE.Vector3(), t: 1, dur: 1 })
    }

    // hazard update: pendulum swing, ragdoll detection, shock/burst animation
    this.addUpdater((dt) => {
      this._gongCool = Math.max(0, this._gongCool - dt)
      // damped disc pendulum
      const sw = this._gongSwing
      sw.vel += (-30 * sw.ang - 2.2 * sw.vel) * dt
      sw.ang += sw.vel * dt
      this._gongPivot.rotation.z = THREE.MathUtils.clamp(sw.ang, -1.0, 1.0)

      // recently-launched fighters vs the gong (2D XZ disc + height window)
      const g = this._gongGroup.position
      for (let i = this._launched.length - 1; i >= 0; i--) {
        const entry = this._launched[i]
        entry.ttl -= dt
        const p = entry.f?.pos
        if (entry.ttl <= 0 || !p) { this._launched.splice(i, 1); continue }
        if (Math.hypot(p.x - g.x, (p.z ?? 0) - g.z) < 2.2 && p.y > 0.35 && p.y < 3.1) {
          this._ringGong(p.x >= g.x ? 1 : -1)
        }
      }

      // shockwave ring
      const s = this._shock
      if (s.t < 1) {
        s.t = Math.min(1, s.t + dt / 0.65)
        const r = 1 + s.t * 8.5
        s.mesh.scale.set(r, r, 1)
        s.mat.opacity = 0.75 * (1 - s.t)
        s.mesh.visible = s.t < 1
      }
      // snow chunks
      for (const ch of this._chunks) {
        if (ch.t >= 1) continue
        ch.t = Math.min(1, ch.t + dt / ch.dur)
        ch.vel.y -= 22 * dt
        ch.mesh.position.addScaledVector(ch.vel, dt)
        if (ch.mesh.position.y < 0.05) { ch.mesh.position.y = 0.05; ch.vel.y = Math.abs(ch.vel.y) * 0.3; ch.vel.x *= 0.7; ch.vel.z *= 0.7 }
        ch.mesh.scale.setScalar(Math.max(0.01, 1 - ch.t))
        if (ch.t >= 1) ch.mesh.visible = false
      }
    })
  }

  _buildProps() {
    const rng = this._rng
    const runeTex = makeRuneBandTexture(rng)
    const shadows = !!this.quality.shadows
    const place = (mesh, x, z, ry, opts) => {
      mesh.position.set(x, mesh.position.y, z)
      mesh.rotation.y = ry
      if (shadows) mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(mesh)
      return this.addBreakable(mesh, opts)
    }

    // v2.0 free-roam: village clutter scatters across the snow circle
    // (center lane kept mostly clear).

    // fallen chain-link segments
    place(makeChainSegmentProp(0.4, true), -6.9, 3.3, 0.3, { shape: 'box', mass: 6, health: 22 })
    place(makeChainSegmentProp(1.9, false), -7.6, -3.8, -0.7, { shape: 'box', mass: 6, health: 22 })

    // prayer-wheel node barrels — bands spin until physics says otherwise
    const barrels = [
      { x: 5.8, z: 3.9, ry: 0.2 },
      { x: -4.6, z: -4.1, ry: -0.5 },
    ]
    this._barrels = []
    for (const bd of barrels) {
      const nb = makeNodeBarrel(runeTex)
      const handle = place(nb.group, bd.x, bd.z, bd.ry, { shape: 'cylinder', mass: 8, health: 28 })
      this._barrels.push({ band: nb.band, ledMat: nb.ledMat, handle, phase: rng() * Math.PI * 2 })
    }
    this.addUpdater((dt) => {
      for (const b of this._barrels) {
        if (b.handle && !b.handle.alive) continue // node offline
        b.band.rotation.y += dt * 0.7
        const on = Math.sin(this._time * 3 + b.phase) > -0.2
        b.ledMat.color.setHex(on ? 0x53ff86 : 0x1d5a34)
      }
    })

    // firewood stacks
    place(makeFirewoodStack(rng, true), 4.4, -4.2, 0.4, { shape: 'box', mass: 5, health: 18 })
    place(makeFirewoodStack(rng, false), -3.3, 4.3, -0.2, { shape: 'box', mass: 4, health: 15 })

    // THE GONG — breakable (barely: it is mostly commitment)
    this._gongHandle = this.addBreakable(this._gongGroup, { shape: 'box', mass: 26, health: 70 })
  }

  _buildSnow() {
    const count = Math.max(40, Math.round(200 * (this.quality.particleScale ?? 0.75)))
    const snow = makeSnowfall(count, this._rng)
    this.group.add(snow.points)
    this.addUpdater(snow.update)
  }

  _wireEvents() {
    // hard prop/ragdoll impacts near the gong also ring it
    this.listen('physics:impact', (e) => {
      if (!e || !e.pos || !(e.speed > 6)) return
      const g = this._gongGroup.position
      if (Math.hypot(e.pos.x - g.x, (e.pos.z ?? 0) - g.z) < 1.8 && e.pos.y > 0.3 && e.pos.y < 3.2) {
        this._ringGong(e.pos.x >= g.x ? 1 : -1)
      }
    })
    // the congregation is extremely moved by violence
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.22 + Math.min(0.7, combo * 0.06) + (e?.counter ? 0.4 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.1) })
    this.listen('fighter:ko', () => { for (const c of this._crowds) c.cheer(3) })
    this.listen('round:end', () => { for (const c of this._crowds) c.cheer(2) })

    // ambient flavor: distant barks and mountain wind
    this.addUpdater((dt) => {
      this._barkT -= dt
      if (this._barkT <= 0) {
        this._barkT = 6 + this._rng() * 9
        this.sfx('bark', { vol: 0.2, pitch: 0.75 + this._rng() * 0.55 })
      }
      this._windT -= dt
      if (this._windT <= 0) {
        this._windT = 10 + this._rng() * 10
        this.sfx('whoosh', { vol: 0.12, pitch: 0.55 })
      }
    })
  }

  // -- hazard: THE GONG -----------------------------------------------------

  _gongAlive() {
    const h = this._gongHandle
    return h ? (h.alive && !h._broken) : true
  }

  _ringGong(dir = 1) {
    if (this._gongCool > 0 || !this._gongAlive()) return
    this._gongCool = 1.5
    this._gongSwing.vel += dir * 8

    // deep gong voice: no 'gong' id in the library, so we forge one from a
    // pitched-down bell over a fat thud. Fails silently if audio is missing.
    this.sfx('bell', { pitch: 0.32, vol: 1.0 })
    this.sfx('thud', { pitch: 0.42, vol: 0.9 })
    const g = this._gongGroup.position
    this.emit('arena:gong', { pos: { x: g.x, y: 1.6, z: g.z } })
    this.emit('camera:shake', { mag: 0.55 })
    this.emit('caption', { text: 'CONSENSUS REACHED' })
    try { this.audio?.crowd?.('wild') } catch (e) { /* the dogs bow harder */ }
    for (const c of this._crowds) c.cheer(2.6)

    // snow shockwave visual
    const s = this._shock
    s.mesh.position.set(g.x, 0.06, g.z)
    s.mesh.scale.set(1, 1, 1)
    s.t = 0
    s.mat.opacity = 0.75
    s.mesh.visible = true
    for (const ch of this._chunks) {
      const a = this._rng() * Math.PI * 2
      const sp = 2 + this._rng() * 4
      ch.mesh.position.set(g.x + (this._rng() - 0.5) * 0.8, 0.4 + this._rng() * 1.2, g.z + (this._rng() - 0.5) * 0.8)
      ch.vel.set(Math.cos(a) * sp - 2.5, 3 + this._rng() * 4, Math.sin(a) * sp * 0.6)
      ch.t = 0
      ch.dur = 0.7 + this._rng() * 0.5
      ch.mesh.visible = true
      ch.mesh.scale.setScalar(1)
    }
    // snow sloughs off the roofs too — shake the pennants
    for (const f of this._flags) f.phase += this._rng() * 2

    // the shockwave shoves nearby STANDING fighters back — radially in XZ,
    // away from the gong
    for (const f of this._fighters) {
      try {
        if (!f || !f.pos || !f.vel) continue
        if (f.state === 'ragdoll' || f.state === 'ko' || f.state === 'knockdown' || f.state === 'grabbed') continue
        const dx = f.pos.x - g.x
        const dz = (f.pos.z ?? 0) - g.z
        const d = Math.hypot(dx, dz)
        if (d > 5.5) continue
        const k = 1 - d / 5.5
        const nx = d > 0.01 ? dx / d : -1
        const nz = d > 0.01 ? dz / d : 0
        f.vel.x = nx * (4 + 9 * k)
        if (typeof f.vel.z === 'number') f.vel.z = nz * (4 + 9 * k)
        f.vel.y = Math.max(f.vel.y, 2.2 + 2.6 * k)
        f.squash?.(0.15)
      } catch (e) { /* fighters are optional victims */ }
    }
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    try { this.audio?.crowd?.('wild') } catch (e) { /* reverent silence */ }
    this.sfx('bark', { vol: 0.45, pitch: 0.9 + this._rng() * 0.3 })
    for (const c of this._crowds) c.cheer(2.2)
    if (fighter) {
      this._launched.push({ f: fighter, ttl: 3.5 })
      this._fighters.add(fighter)
      if (fighter.foe) this._fighters.add(fighter.foe)
    }
    if (this.physics?.presetName === 'unhinged') {
      // the faithful get bowled over mid-bow
      const side = (fighter?.pos?.x ?? 0) >= 0 ? this._crowdRight : this._crowdLeft
      side?.knockOverRandom(3 + Math.floor(this._rng() * 4))
      this._crowdBack?.knockOverRandom(1 + Math.floor(this._rng() * 3))
      this.sfx('boing', { vol: 0.5 })
    }
  }

  dispose() {
    this._fighters.clear()
    this._launched.length = 0
    super.dispose()
  }
}

export const MountainNodeVillage = {
  id: 'mountain-node-village',
  name: 'MOUNTAIN NODE VILLAGE',
  music: 'battle_mountain_node',
  build(ctx) { return new MountainNodeVillageArena(ctx) },
}
