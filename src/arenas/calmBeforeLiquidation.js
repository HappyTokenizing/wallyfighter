// ============================================================================
// CALM BEFORE LIQUIDATION — Cool Pal's stage (story round 8). A serene floating
// zen park drifting above a painted cloud sea: koi liquidity pond, cherry
// blossoms, park benches, picnicking capybaras. Then the margin call arrives.
//
// Three stages, tracked by elapsed match time:
//   1) 0-40s   — pastel serenity. Petals drift. Koi circle. Nothing is wrong.
//   2) 40-80s  — the sky tints orange, distant rumbles, chunks crumble off the
//                island edges, petals bleed red. Something is wrong.
//   3) 80s+    — deep red sky, klaxon pulses, continuous edge collapse,
//                vibrating benches, panicking capybaras, and flaming chart
//                fragments falling on telegraphed spots. Everything is wrong.
//
// Camera looks down -Z; fight axis is X. Decorative content lives at -Z or
// |x| > 9 per CONTRACTS.md §9. Dispose discipline copied from memeMarket.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, makeCandlestickChart, buildCrowd,
} from './ArenaBase.js'

// ---------------------------------------------------------------------------
// timing / tuning
// ---------------------------------------------------------------------------
const STAGE2_AT = 40      // seconds — turbulence
const STAGE3_AT = 80      // seconds — cascade
const METEOR_DMG = 12
const METEOR_RADIUS = 1.8
const TELEGRAPH_SECS = 1.25
const FALL_SECS = 0.55
const BURN_SECS = 2.4

const CAPY_PALETTE = ['#a87448', '#8f5f3a', '#b98a5c', '#7a4f30', '#c49a6c', '#9a6b42', '#84573a', '#ad7d50']

// three-stop color mix: t in [0..2] walks a -> b -> c
function mix3(out, a, b, c, t) {
  if (t <= 1) out.copy(a).lerp(b, Math.max(0, Math.min(1, t)))
  else out.copy(b).lerp(c, Math.max(0, Math.min(1, t - 1)))
  return out
}

// ---------------------------------------------------------------------------
// module-private mesh factories
// ---------------------------------------------------------------------------

function makeLawnTexture(rng) {
  // mowed pastel lawn: alternating stripes, clover freckles, a stone path hint
  const TP = 64, TILES = 8
  return canvasTexture(TILES * TP, TILES * TP, (c, W, H) => {
    for (let row = 0; row < TILES; row++) {
      const even = row % 2 === 0
      c.fillStyle = even ? '#8ecf7f' : '#7dc06f'
      c.fillRect(0, row * TP, W, TP)
      // blade specks
      for (let i = 0; i < 40; i++) {
        const x = rng() * W, y = row * TP + rng() * TP
        c.fillStyle = rng() < 0.5 ? 'rgba(110,170,95,0.6)' : 'rgba(160,215,140,0.6)'
        c.fillRect(x, y, 3, 6)
      }
      // tiny flowers — this park is doing GREAT
      for (let i = 0; i < 6; i++) {
        if (rng() < 0.55) continue
        const x = rng() * W, y = row * TP + rng() * TP
        c.fillStyle = ['#fff6fa', '#ffd7e8', '#fff3b0'][Math.floor(rng() * 3)]
        c.fillRect(x - 2, y - 2, 5, 5)
        c.fillStyle = '#e8a63c'
        c.fillRect(x - 1, y - 1, 2, 2)
      }
    }
  }, { repeat: [3, 2] })
}

function makeSandTexture(rng) {
  // raked zen sand: concentric arcs around two rock spots
  return canvasTexture(256, 180, (c, W, H) => {
    c.fillStyle = '#e8dcb8'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(150,130,80,0.5)'
    c.lineWidth = 3
    const spots = [[W * 0.32, H * 0.45], [W * 0.72, H * 0.6]]
    for (const [sx, sy] of spots) {
      for (let r = 14; r < 90; r += 12) {
        c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.stroke()
      }
    }
    for (let y = 10; y < H; y += 12) {
      c.beginPath(); c.moveTo(0, y + (rng() - 0.5) * 4); c.lineTo(W, y + (rng() - 0.5) * 4)
      c.globalAlpha = 0.25; c.stroke(); c.globalAlpha = 1
    }
  })
}

function makeCheckerTexture(colA, colB) {
  return canvasTexture(64, 64, (c, W, H) => {
    const n = 8
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        c.fillStyle = (x + y) % 2 === 0 ? colA : colB
        c.fillRect((W / n) * x, (H / n) * y, W / n, H / n)
      }
    }
  })
}

function makeBench() {
  const g = new THREE.Group()
  g.name = 'bench'
  const wood = flatMat(0x7fc7b2)      // weathered pastel teal — very municipal
  const frame = flatMat(0x4d8a7a)
  for (const sx of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.44), frame)
    leg.position.set(sx, 0.25, 0)
    g.add(leg)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.09), frame)
    post.position.set(sx, 0.78, -0.19)
    post.rotation.x = 0.16
    g.add(post)
  }
  for (const sz of [-0.14, 0.02, 0.18]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.07, 0.13), wood)
    slat.position.set(0, 0.5, sz)
    g.add(slat)
  }
  for (const sy of [0.74, 0.94]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 0.06), wood)
    slat.position.set(0, sy, -0.235 - (sy - 0.74) * 0.16)
    slat.rotation.x = 0.16
    g.add(slat)
  }
  return g
}

function makePicnicBasket(rng) {
  const g = new THREE.Group()
  g.name = 'picnicBasket'
  const weave = canvasTexture(64, 64, (c, W, H) => {
    c.fillStyle = '#c9984f'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(120,80,25,0.55)'
    c.lineWidth = 3
    for (let y = 0; y < H; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke() }
    for (let x = 0; x < W; x += 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke() }
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.38), new THREE.MeshLambertMaterial({ map: weave, flatShading: true }))
  body.position.y = 0.17
  g.add(body)
  const cloth = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.05, 0.42),
    new THREE.MeshLambertMaterial({ map: makeCheckerTexture('#e05555', '#f6efe2'), flatShading: true })
  )
  cloth.position.y = 0.365
  cloth.rotation.y = (rng() - 0.5) * 0.2
  g.add(cloth)
  const handleMat = flatMat(0x8a6430)
  for (const sx of [-0.16, 0.16]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), handleMat)
    side.position.set(sx, 0.5, 0)
    g.add(side)
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), handleMat)
  grip.position.y = 0.63
  g.add(grip)
  return g
}

function makeZenStack(rng) {
  // the classic balanced rock stack. deeply calming. deeply breakable.
  const g = new THREE.Group()
  g.name = 'zenStack'
  const greys = [0x8f949c, 0x7a7f88, 0x9ba1a8, 0x6d727b]
  let y = 0
  const radii = [0.42, 0.33, 0.25, 0.17]
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i]
    const rock = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), flatMat(greys[i % greys.length]))
    rock.scale.set(1 + (rng() - 0.5) * 0.15, 0.58, 1 + (rng() - 0.5) * 0.15)
    y += r * 0.58
    rock.position.set((rng() - 0.5) * 0.08, y, (rng() - 0.5) * 0.08)
    rock.rotation.y = rng() * Math.PI
    y += r * 0.5
    g.add(rock)
  }
  return g
}

function makeDoNotSellSign() {
  const g = new THREE.Group()
  g.name = 'doNotSellSign'
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), flatMat(0x8a6430))
  post.position.y = 0.575
  g.add(post)
  const board = makeSign('DO NOT SELL', {
    w: 1.6, h: 0.55, depth: 0.08, px: 80,
    bg: '#f6efe2', fg: '#d13b47', stroke: '#5a1015', border: '#d13b47',
    sub: 'THIS MEANS YOU', subColor: '#8a5560',
  })
  board.position.y = 1.42
  board.rotation.x = -0.05
  g.add(board)
  return g
}

function makeStoneLantern() {
  const g = new THREE.Group()
  g.name = 'stoneLantern'
  const stone = flatMat(0x9aa0a6)
  const stoneDark = flatMat(0x7c828a)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.62), stoneDark)
  base.position.y = 0.09
  g.add(base)
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.72, 6), stone)
  pillar.position.y = 0.54
  g.add(pillar)
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.44), [glow, glow, stoneDark, stoneDark, glow, glow])
  housing.position.y = 1.08
  g.add(housing)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.3, 4), stone)
  roof.position.y = 1.42
  roof.rotation.y = Math.PI / 4
  g.add(roof)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), stoneDark)
  knob.position.y = 1.6
  g.add(knob)
  return { group: g, glowMat: glow }
}

function makeCherryTree(rng, scale = 1) {
  const g = new THREE.Group()
  g.name = 'cherryTree'
  const bark = flatMat(0x6e4a30)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 1.7, 6), bark)
  trunk.position.y = 0.85
  trunk.rotation.z = (rng() - 0.5) * 0.16
  g.add(trunk)
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 5), bark)
  branch.position.set(0.34, 1.65, 0.1)
  branch.rotation.z = -0.8
  g.add(branch)
  const canopy = new THREE.Group()
  canopy.position.y = 2.05
  const pinks = [0xf7b8d0, 0xf2a3c4, 0xfbd0e0, 0xefaccd]
  const puffs = [
    [0, 0, 0, 0.9], [0.62, 0.24, 0.2, 0.62], [-0.58, 0.18, -0.16, 0.66],
    [0.08, 0.56, -0.22, 0.56], [-0.2, 0.3, 0.4, 0.5],
  ]
  for (let i = 0; i < puffs.length; i++) {
    const [x, y, z, r] = puffs[i]
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), flatMat(pinks[i % pinks.length]))
    puff.position.set(x, y, z)
    canopy.add(puff)
  }
  g.add(canopy)
  g.scale.setScalar(scale)
  return { group: g, canopy, phase: rng() * Math.PI * 2 }
}

function makeCapybara() {
  // a loaf. serene beyond mortal comprehension. until stage 3.
  const g = new THREE.Group()
  g.name = 'capybara'
  const fur = flatMat(0xa87448)
  const furDark = flatMat(0x8a5c36)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.44), fur)
  body.position.y = 0.28
  g.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), fur)
  head.position.set(0.44, 0.5, 0)
  g.add(head)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.26), furDark)
  snout.position.set(0.62, 0.44, 0)
  g.add(snout)
  const earMat = furDark
  for (const sz of [-0.11, 0.11]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.07), earMat)
    ear.position.set(0.38, 0.68, sz)
    g.add(ear)
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x201510 })
  for (const sz of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), eyeMat)
    eye.position.set(0.55, 0.56, sz)
    g.add(eye)
  }
  // a tangerine on the head. non-negotiable.
  const tang = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), flatMat(0xf59a2e))
  tang.position.set(0.42, 0.71, 0)
  g.add(tang)
  return g
}

function makePond(rng) {
  const g = new THREE.Group()
  g.name = 'liquidityPond'
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 6, 14), flatMat(0x8f949c))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.16
  g.add(rim)
  const waterMat = flatMat(0x63c7dd)
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.28, 2.28, 0.2, 16), waterMat)
  water.position.y = 0.1
  g.add(water)
  // lily pads
  const pads = []
  const padMat = flatMat(0x4da05a)
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.26 + rng() * 0.12, 0.26 + rng() * 0.12, 0.04, 7), padMat)
    const a = rng() * Math.PI * 2, r = 0.6 + rng() * 1.3
    pad.position.set(Math.cos(a) * r, 0.22, Math.sin(a) * r)
    pads.push({ mesh: pad, phase: rng() * Math.PI * 2 })
    g.add(pad)
  }
  // koi carousel — the last liquidity in the market, circling forever
  const carousel = new THREE.Group()
  carousel.position.y = 0.19
  const koiCols = [0xf07030, 0xf6f0e4, 0xf0a040, 0xe85a28]
  const kois = []
  for (let i = 0; i < 4; i++) {
    const koi = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), flatMat(koiCols[i % koiCols.length]))
    body.scale.set(1.9, 0.55, 0.7)
    koi.add(body)
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 5), flatMat(0xf6f0e4))
    tail.rotation.z = Math.PI / 2
    tail.position.x = -0.38
    koi.add(tail)
    const a = (i / 4) * Math.PI * 2
    const r = 1.1 + (i % 2) * 0.55
    koi.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    koi.rotation.y = -a + Math.PI / 2
    kois.push({ group: koi, a, r, phase: rng() * Math.PI * 2 })
    carousel.add(koi)
  }
  g.add(carousel)
  let t = rng() * 10
  const update = (dt, heat) => {
    // koi panic-swim faster as liquidation nears. relatable.
    t += dt
    const speed = 0.35 + heat * 0.9
    for (const k of kois) {
      k.a += dt * speed
      k.group.position.set(Math.cos(k.a) * k.r, Math.sin(t * 2.2 + k.phase) * 0.02, Math.sin(k.a) * k.r)
      k.group.rotation.y = -k.a + Math.PI / 2
    }
    for (const p of pads) p.mesh.position.y = 0.22 + Math.sin(t * 1.4 + p.phase) * 0.012
  }
  return { group: g, update, waterMat }
}

function makeIslet(rng, r) {
  const g = new THREE.Group()
  g.name = 'islet'
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, 0.34, 8), flatMat(0x86c877))
  g.add(grass)
  const rock = new THREE.Mesh(new THREE.ConeGeometry(r * 0.84, r * 1.7, 7), flatMat(0x8a6a4e))
  rock.rotation.x = Math.PI
  rock.position.y = -r * 0.85 - 0.15
  g.add(rock)
  if (rng() < 0.7) {
    const tree = makeCherryTree(rng, 0.55)
    tree.group.position.y = 0.15
    g.add(tree.group)
  } else {
    const stone = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 6, 5), flatMat(0x9aa0a6))
    stone.scale.y = 0.6
    stone.position.y = 0.2
    g.add(stone)
  }
  return g
}

function makeCloud(rng, mat, scale = 1) {
  const g = new THREE.Group()
  g.name = 'cloud'
  const n = 3 + Math.floor(rng() * 2)
  for (let i = 0; i < n; i++) {
    const s = (0.9 + rng() * 1.3) * scale
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), mat)
    puff.scale.y = 0.55
    puff.position.set((i - (n - 1) / 2) * s * 1.1, (rng() - 0.5) * 0.4 * scale, (rng() - 0.5) * s)
    g.add(puff)
  }
  return g
}

function makeKlaxon() {
  const g = new THREE.Group()
  g.name = 'klaxon'
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 6), flatMat(0x5a5f68))
  pole.position.y = 1.3
  g.add(pole)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.34), flatMat(0x3a3f48))
  box.position.y = 2.7
  g.add(box)
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x551512 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), lampMat)
  lamp.scale.y = 0.8
  lamp.position.y = 2.92
  g.add(lamp)
  // a tiny plaque nobody read
  const plaque = makeSign('IN CASE OF DIP', { w: 0.85, h: 0.28, depth: 0.05, px: 64, bg: '#3a3f48', fg: '#ffd83d', border: '#ffd83d' })
  plaque.position.y = 1.7
  g.add(plaque)
  return { group: g, lampMat }
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

class CalmBeforeLiquidationArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.5 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0x5e8e17)
    this._time = 0          // elapsed match seconds — drives the collapse
    this._heat = 0          // smoothed stage blend: 0 serene, 1 orange, 2 red
    this._stage2Announced = false
    this._stage3Announced = false
    this._capCool = 0
    this._rumbleTimer = 9 + this._rng() * 4
    this._crumbleTimer = 0
    this._benchBuzzTimer = 0
    this._impactCool = 0
    this._meteorTimer = 3
    this._fighters = new Set()
    this._crowds = []
    this._benchHandles = []

    // color stops (a: serene, b: turbulence, c: cascade)
    this._cols = {
      sky: [new THREE.Color(0xffffff), new THREE.Color(0xffbe8c), new THREE.Color(0xff5a4a)],
      fog: [new THREE.Color(0xcfeaf7), new THREE.Color(0xf2b26e), new THREE.Color(0x8a2420)],
      hemiSky: [new THREE.Color(0xd8f2ff), new THREE.Color(0xffcf9e), new THREE.Color(0xff8a70)],
      hemiGround: [new THREE.Color(0x9fd39a), new THREE.Color(0xcf9a62), new THREE.Color(0x8a4034)],
      sun: [new THREE.Color(0xfff3d8), new THREE.Color(0xffb066), new THREE.Color(0xff6a4a)],
      cloud: [new THREE.Color(0xffffff), new THREE.Color(0xffc9a0), new THREE.Color(0x8f3a34)],
      petal: [new THREE.Color(0xffc6da), new THREE.Color(0xff9aa8), new THREE.Color(0xff3b30)],
      water: [new THREE.Color(0x63c7dd), new THREE.Color(0xd88f5a), new THREE.Color(0xc03a30)],
      lantern: [new THREE.Color(0xffe9a8), new THREE.Color(0xffc470), new THREE.Color(0xff3a28)],
    }
    this._tmpColor = new THREE.Color()

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildIsland()
    this._buildParkDecor()
    this._buildCrowds()
    this._buildPetals()
    this._buildDebris()
    this._buildMeteors()
    this._buildProps()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction ---------------------------------------------------------

  _buildPhysics() {
    // island slab + invisible bouncy walls on all four sides, inner faces
    // exactly at the bounds
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    const sky = buildSkyDome(['#3f8fe0', '#79c4f2', '#c8ecf8', '#fdf2d8'], { rng: this._rng, cloudColor: 'rgba(255,255,255,0.95)' })
    this._skyMat = sky.material
    this.group.add(sky)
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xd8f2ff, hemiGround: 0x9fd39a, hemiIntensity: 1.08,
      sunColor: 0xfff3d8, sunIntensity: 1.65, sunPos: [9, 17, 10],
      fillColor: 0xd0e6ff, fillIntensity: 0.35,
      fog: { color: 0xcfeaf7, near: 32, far: 85 },
      shadowArea: 15,
    })
    this._rig = rig
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())

    // klaxon flood light — dead until stage 3, then it pulses the whole park red
    this._klaxonLight = new THREE.PointLight(0xff2a1e, 0, 34)
    this._klaxonLight.position.set(0, 6.5, -3)
    this.group.add(this._klaxonLight)
  }

  _buildIsland() {
    const rng = this._rng
    // grass top slab — the fight lawn (top face at y=0)
    const lawnTex = makeLawnTexture(rng)
    const dirt = flatMat(0x8a6a4e)
    const lawnMat = new THREE.MeshLambertMaterial({ map: lawnTex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 22), [dirt, dirt, lawnMat, dirt, dirt, dirt])
    slab.position.set(0, -0.3, -2.5)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)

    // rocky underside — inverted cone with dangling root-rocks
    const under = new THREE.Mesh(new THREE.ConeGeometry(15.5, 8.5, 9), flatMat(0x7a5a40))
    under.rotation.x = Math.PI
    under.position.set(0, -4.85, -2.5)
    this.group.add(under)
    const rootMat = flatMat(0x6b4d35)
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2
      const r = 4 + rng() * 8
      const rock = new THREE.Mesh(new THREE.SphereGeometry(0.5 + rng() * 0.7, 6, 5), rootMat)
      rock.scale.y = 1.3 + rng() * 0.8
      rock.position.set(Math.cos(a) * r, -1.6 - rng() * 5, Math.sin(a) * r * 0.65 - 2.5)
      this.group.add(rock)
    }

    // satellite islets bobbing in the distance
    this._islets = []
    const isletDefs = [
      { x: -19, y: 2.6, z: -14, r: 2.2 },
      { x: 18, y: 4.4, z: -17, r: 1.7 },
      { x: 24, y: 0.8, z: -7, r: 1.4 },
      { x: -25, y: 5.2, z: -9, r: 1.9 },
    ]
    for (const d of isletDefs) {
      const islet = makeIslet(rng, d.r)
      islet.position.set(d.x, d.y, d.z)
      this.group.add(islet)
      this._islets.push({ mesh: islet, baseY: d.y, phase: rng() * Math.PI * 2, speed: 0.25 + rng() * 0.2 })
    }

    // the cloud sea below the island edge
    this._cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.96 })
    this._clouds = []
    for (let i = 0; i < 9; i++) {
      const cloud = makeCloud(rng, this._cloudMat, 1.2 + rng() * 1.4)
      const ang = (i / 9) * Math.PI * 2 + rng() * 0.5
      const r = 17 + rng() * 9
      const y = -6 + rng() * 3.4
      cloud.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r - 2.5)
      this.group.add(cloud)
      this._clouds.push({ mesh: cloud, ang, r, y, speed: 0.008 + rng() * 0.014 })
    }
  }

  _buildParkDecor() {
    const rng = this._rng

    // koi liquidity pond (decor, back-right)
    const pond = makePond(rng)
    pond.group.position.set(6.8, 0, -9.4)
    this.group.add(pond.group)
    this._pond = pond
    this.addUpdater((dt) => pond.update(dt, this._heat))
    const pondSign = makeSign('LIQUIDITY POND', {
      w: 2.3, h: 0.6, depth: 0.08, px: 72, bg: '#2a5a4a', fg: '#bef2d8', border: '#bef2d8',
      sub: 'KOI ARE NOT FINANCIAL ADVISORS', subColor: '#8fd2b2',
    })
    const pondPost = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.2, 0.09), flatMat(0x8a6430))
    pondPost.position.set(3.9, 0.6, -8.2)
    pondSign.position.set(3.9, 1.5, -8.2)
    pondSign.rotation.y = 0.28
    this.group.add(pondPost, pondSign)

    // cherry trees — sides and back
    this._trees = []
    const treeDefs = [
      { x: -12.5, z: -5, s: 1.25 }, { x: 13.2, z: -6, s: 1.1 },
      { x: -15.5, z: 1.2, s: 0.95 }, { x: -6.5, z: -10.8, s: 1.5 }, { x: 11.8, z: 1.8, s: 0.9 },
    ]
    for (const d of treeDefs) {
      const tree = makeCherryTree(rng, d.s)
      tree.group.position.set(d.x, 0, d.z)
      tree.group.rotation.y = rng() * Math.PI * 2
      this.group.add(tree.group)
      this._trees.push(tree)
    }
    this.addUpdater((dt) => {
      for (const tr of this._trees) {
        tr.canopy.rotation.z = Math.sin(this._time * 0.6 + tr.phase) * 0.035 * (1 + this._heat * 1.6)
        tr.canopy.rotation.x = Math.sin(this._time * 0.45 + tr.phase * 2) * 0.025 * (1 + this._heat)
      }
    })
    // petal spawn points hover in each canopy
    this._petalSpawns = treeDefs.map((d) => new THREE.Vector3(d.x, 2.0 * d.s + 0.6, d.z))

    // zen sand garden (decor, left of the lawn)
    const sand = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.1, 2.6),
      new THREE.MeshLambertMaterial({ map: makeSandTexture(rng), flatShading: true })
    )
    sand.position.set(-12.2, 0.05, -2.8)
    sand.rotation.y = 0.12
    this.group.add(sand)
    for (const [ox, oz, r] of [[-0.7, -0.3, 0.34], [0.8, 0.5, 0.26]]) {
      const rock = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), flatMat(0x7a7f88))
      rock.scale.y = 0.62
      rock.position.set(-12.2 + ox, 0.16, -2.8 + oz)
      this.group.add(rock)
    }

    // stone lanterns flanking the lawn
    this._lanternGlows = []
    for (const [x, z] of [[-9.8, -6.6], [10.4, -7], [-10.6, 2.2]]) {
      const lantern = makeStoneLantern()
      lantern.group.position.set(x, 0, z)
      lantern.group.rotation.y = rng() * Math.PI
      this.group.add(lantern.group)
      this._lanternGlows.push(lantern.glowMat)
    }

    // klaxons bolted into a zen garden. someone knew. someone always knew.
    this._klaxonMats = []
    for (const [x, z, ry] of [[-13.4, -1.2, 0.4], [12.6, -3.8, -0.5]]) {
      const k = makeKlaxon()
      k.group.position.set(x, 0, z)
      k.group.rotation.y = ry
      this.group.add(k.group)
      this._klaxonMats.push(k.lampMat)
    }

    // serenity arch + sign at the back of the park
    const archMat = flatMat(0x8a4a3a)
    for (const sx of [-3.4, 3.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.2, 0.28), archMat)
      post.position.set(sx, 2.6, -11.4)
      this.group.add(post)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.34, 0.42), archMat)
    beam.position.set(0, 5.1, -11.4)
    beam.rotation.z = 0.015
    this.group.add(beam)
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.24, 0.34), archMat)
    beam2.position.set(0, 4.55, -11.4)
    this.group.add(beam2)
    const archSign = makeSign('INNER PEACE', {
      w: 3.6, h: 1.0, depth: 0.14, px: 84, bg: '#f6efe2', fg: '#2a5a4a', stroke: '#183a2e', border: '#2a5a4a',
      sub: 'OUTER GAINS', subColor: '#8a6430',
    })
    archSign.position.set(0, 3.7, -11.3)
    this.group.add(archSign)
    this._archSign = archSign
    this.addUpdater(() => {
      archSign.rotation.z = Math.sin(this._time * (1.1 + this._heat * 2.4)) * (0.02 + this._heat * 0.055)
    })

    // hero capybaras on picnic blankets (the instanced crowd handles the masses)
    const blanketMat = new THREE.MeshLambertMaterial({ map: makeCheckerTexture('#e05555', '#f6efe2'), flatShading: true })
    this._capys = []
    const capyDefs = [
      { x: -4.2, z: -7.4, ry: 0.5 }, { x: 5.2, z: -7.9, ry: -0.7 }, { x: 10.8, z: 0.4, ry: -1.4 },
    ]
    for (const d of capyDefs) {
      const blanket = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.4), blanketMat)
      blanket.rotation.x = -Math.PI / 2
      blanket.rotation.z = rng() * Math.PI
      blanket.position.set(d.x, 0.02, d.z)
      this.group.add(blanket)
      const capy = makeCapybara()
      capy.position.set(d.x, 0, d.z)
      capy.rotation.y = d.ry
      this.group.add(capy)
      this._capys.push({ mesh: capy, baseRy: d.ry, phase: rng() * Math.PI * 2 })
    }
  }

  _buildCrowds() {
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const rng = this._rng
    const back = Math.round(total * 0.6)
    const strips = [Math.round(back * 0.4), Math.round(back * 0.33), Math.max(3, back - Math.round(back * 0.4) - Math.round(back * 0.33))]
    const side = Math.max(4, Math.floor((total - back) / 2))

    // grass amphitheater terraces — capybaras picnic in rows on a gentle knoll
    const terraceMat = flatMat(0x79b96b)
    for (let r = 0; r < 3; r++) {
      const h = 0.45 * (r + 1)
      const step = new THREE.Mesh(new THREE.BoxGeometry(24, h, 1.7), terraceMat)
      step.position.set(0, h / 2, -8.3 - r * 1.6)
      this.group.add(step)
      const strip = buildCrowd({
        count: strips[r], area: { w: 22, d: 1 }, palette: CAPY_PALETTE, rng,
        risers: false, bounce: 0.14,
      })
      strip.group.position.set(0, h, -8.3 - r * 1.6)
      this.group.add(strip.group)
      this._crowds.push(strip)
    }
    // side picnic rows on the lawn itself (|x| > 9)
    for (const s of [-1, 1]) {
      const row = buildCrowd({
        count: side, area: { w: 9, d: 1 }, palette: CAPY_PALETTE, rng,
        risers: false, bounce: 0.14,
      })
      row.group.position.set(s * 12.2, 0, -0.8)
      row.group.rotation.y = s * Math.PI / 2 // face the fight
      this.group.add(row.group)
      this._crowds.push(row)
    }
    for (const c of this._crowds) this.addUpdater((dt) => c.update(dt))
  }

  _buildPetals() {
    const n = Math.max(10, Math.round(42 * (this.quality.particleScale ?? 0.75)))
    const geo = new THREE.BoxGeometry(0.11, 0.02, 0.08)
    this._petalMat = new THREE.MeshLambertMaterial({ color: 0xffc6da, flatShading: true })
    const mesh = new THREE.InstancedMesh(geo, this._petalMat, n)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    this.group.add(mesh)
    const rng = this._rng
    const P = { n, mesh, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), phase: new Float32Array(n), fall: new Float32Array(n), spin: new Float32Array(n) }
    const respawn = (i) => {
      const s = this._petalSpawns[Math.floor(rng() * this._petalSpawns.length)]
      P.x[i] = s.x + (rng() - 0.5) * 2.6
      P.y[i] = s.y + (rng() - 0.5) * 1.2
      P.z[i] = s.z + (rng() - 0.5) * 2.2
      P.phase[i] = rng() * Math.PI * 2
      P.fall[i] = 0.42 + rng() * 0.5
      P.spin[i] = 2 + rng() * 4
    }
    for (let i = 0; i < n; i++) { respawn(i); P.y[i] = rng() * 4 + 0.2 } // pre-scatter
    this._petals = P
    this._petalRespawn = respawn

    const _m = new THREE.Matrix4()
    const _q = new THREE.Quaternion()
    const _e = new THREE.Euler()
    const _p = new THREE.Vector3()
    const _s = new THREE.Vector3(1, 1, 1)
    this.addUpdater((dt) => {
      const heat = this._heat
      const wind = 1 + heat * 2.2
      for (let i = 0; i < P.n; i++) {
        P.y[i] -= P.fall[i] * dt * (1 + heat * 1.4)
        P.x[i] += Math.sin(this._time * 1.6 + P.phase[i]) * dt * 0.7 * wind
        P.z[i] += Math.cos(this._time * 1.2 + P.phase[i] * 1.7) * dt * 0.4 * wind
        if (P.y[i] < 0.02) respawn(i)
        _p.set(P.x[i], P.y[i], P.z[i])
        _e.set(this._time * P.spin[i] + P.phase[i], P.phase[i], this._time * P.spin[i] * 0.6)
        _q.setFromEuler(_e)
        _m.compose(_p, _q, _s)
        P.mesh.setMatrixAt(i, _m)
      }
      P.mesh.instanceMatrix.needsUpdate = true
    })
  }

  _buildDebris() {
    // pooled island-edge chunks that shear off and tumble into the cloud sea
    const rng = this._rng
    const n = Math.max(6, Math.round(14 * (this.quality.particleScale ?? 0.75)))
    this._debrisMat = flatMat(0x7a5a40)
    this._debris = []
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + rng() * 0.35, 0), this._debrisMat)
      mesh.visible = false
      this.group.add(mesh)
      this._debris.push({ mesh, active: false, vel: new THREE.Vector3(), rot: new THREE.Vector3() })
    }
    // rim spawn points along the island edges (side + back, never at camera)
    this._rimPoints = []
    for (let i = 0; i < 12; i++) {
      if (i < 4) this._rimPoints.push(new THREE.Vector3(-16.6, -0.2, -12 + i * 4.6))
      else if (i < 8) this._rimPoints.push(new THREE.Vector3(16.6, -0.2, -12 + (i - 4) * 4.6))
      else this._rimPoints.push(new THREE.Vector3(-14 + (i - 8) * 9.3, -0.2, -13.2))
    }
  }

  _spawnDebris(count, origin = null) {
    const rng = this._rng
    let spawned = 0
    for (const d of this._debris) {
      if (spawned >= count) break
      if (d.active) continue
      d.active = true
      d.mesh.visible = true
      if (origin) {
        d.mesh.position.set(origin.x + (rng() - 0.5) * 0.8, origin.y + 0.4, (origin.z ?? 0) + (rng() - 0.5) * 0.8)
        d.vel.set((rng() - 0.5) * 5, 3 + rng() * 3.5, (rng() - 0.5) * 4)
      } else {
        const p = this._rimPoints[Math.floor(rng() * this._rimPoints.length)]
        d.mesh.position.set(p.x + (rng() - 0.5) * 1.4, p.y, p.z + (rng() - 0.5) * 1.4)
        // shear outward, away from the island center
        const away = Math.sign(p.x) || (rng() < 0.5 ? -1 : 1)
        d.vel.set(Math.abs(p.x) > 15 ? away * (1 + rng() * 2) : (rng() - 0.5) * 1.4, -0.5, p.z < -12 ? -(1 + rng() * 2) : (rng() - 0.5))
      }
      d.rot.set((rng() - 0.5) * 6, (rng() - 0.5) * 6, (rng() - 0.5) * 6)
      const s = 0.7 + rng() * 1
      d.mesh.scale.setScalar(s)
      spawned++
    }
    return spawned
  }

  _updateDebris(dt) {
    for (const d of this._debris) {
      if (!d.active) continue
      d.vel.y -= 13 * dt
      d.mesh.position.addScaledVector(d.vel, dt)
      d.mesh.rotation.x += d.rot.x * dt
      d.mesh.rotation.y += d.rot.y * dt
      d.mesh.rotation.z += d.rot.z * dt
      if (d.mesh.position.y < -24) { d.active = false; d.mesh.visible = false }
    }
  }

  _buildMeteors() {
    // pooled flaming chart fragments + telegraph rings + scorch marks
    const rng = this._rng
    this._meteors = []
    const charDark = flatMat(0x2a1512)
    for (let i = 0; i < 3; i++) {
      const chart = makeCandlestickChart(128, 160, {
        rng, candles: 10, header: ['$PORTFOLIO', '$MARGIN', '$REKT'][i],
        up: '#ff8899', down: '#ff2233', bg: '#1a0508',
      })
      const screen = new THREE.MeshBasicMaterial({ map: chart.texture })
      const shard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.14), [charDark, charDark, charDark, charDark, screen, charDark])
      const root = new THREE.Group()
      root.name = 'chartMeteor'
      root.add(shard)
      const flame = new THREE.Group()
      const fOuter = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.85 }))
      fOuter.position.y = 1.2
      const fInner = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.75, 5), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 }))
      fInner.position.y = 1.05
      flame.add(fOuter, fInner)
      root.add(flame)
      root.visible = false
      this.group.add(root)

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.98, 22),
        new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.045
      ring.visible = false
      this.group.add(ring)

      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(1.15, 14),
        new THREE.MeshBasicMaterial({ color: 0x1a0c08, transparent: true, opacity: 0, depthWrite: false })
      )
      scorch.rotation.x = -Math.PI / 2
      scorch.position.y = 0.035
      scorch.visible = false
      this.group.add(scorch)

      this._meteors.push({ root, shard, flame, ring, scorch, state: 'idle', t: 0, x: 0, z: 0, tumble: rng() * 6 })
    }
  }

  _launchMeteor() {
    const m = this._meteors.find((mm) => mm.state === 'idle')
    if (!m) return
    m.state = 'telegraph'
    m.t = 0
    // v2.0 free-roam: impact points land anywhere on the XZ lawn
    m.x = -7.5 + this._rng() * 15
    m.z = -4 + this._rng() * 8
    m.ring.position.x = m.x
    m.ring.position.z = m.z
    m.ring.visible = true
    m.tumble = 2 + this._rng() * 5
    this.sfx('whoosh', { vol: 0.7, pitch: 0.7 })
  }

  _updateMeteors(dt) {
    for (const m of this._meteors) {
      if (m.state === 'idle') continue
      m.t += dt
      if (m.state === 'telegraph') {
        const pulse = 0.3 + 0.5 * Math.abs(Math.sin(m.t * 11))
        m.ring.material.opacity = pulse
        const s = 1 + 0.2 * Math.sin(m.t * 11)
        m.ring.scale.set(s, s, s)
        if (m.t >= TELEGRAPH_SECS) {
          m.state = 'fall'
          m.t = 0
          m.root.visible = true
          m.flame.visible = true
          m.root.position.set(m.x, 16, m.z)
          this.sfx('launch', { vol: 0.6, pitch: 0.8 })
        }
      } else if (m.state === 'fall') {
        const k = Math.min(1, m.t / FALL_SECS)
        m.root.position.set(m.x, 16 * (1 - k * k), m.z)
        m.root.rotation.x = m.t * m.tumble
        m.root.rotation.z = m.t * m.tumble * 0.6
        const fl = 0.9 + Math.sin(this._time * 40) * 0.25
        m.flame.scale.set(fl, 1.1 + Math.sin(this._time * 31) * 0.2, fl)
        if (k >= 1) this._meteorImpact(m)
      } else if (m.state === 'burn') {
        const k = Math.min(1, m.t / BURN_SECS)
        // fire gutters out; the shard settles into its crater
        const fl = Math.max(0, (1 - k)) * (0.9 + Math.sin(this._time * 34) * 0.3)
        m.flame.scale.set(fl, fl, fl)
        m.root.position.y = 0.55 - k * 0.3
        m.scorch.material.opacity = 0.55 * (1 - k * 0.8)
        if (k >= 1) {
          m.state = 'idle'
          m.root.visible = false
          m.ring.visible = false
          m.scorch.visible = false
          m.scorch.material.opacity = 0
        }
      }
    }
  }

  _meteorImpact(m) {
    m.state = 'burn'
    m.t = 0
    m.root.position.y = 0.55
    m.root.rotation.set((this._rng() - 0.5) * 0.7, this._rng() * Math.PI, (this._rng() - 0.5) * 0.7)
    m.ring.visible = false
    m.ring.material.opacity = 0
    m.scorch.visible = true
    m.scorch.position.x = m.x
    m.scorch.position.z = m.z
    m.scorch.material.opacity = 0.55
    m.flame.visible = true

    this.emit('camera:shake', { mag: 0.55 })
    this.sfx('explosion', { vol: 0.9 })
    try { this.audio?.crowd?.('gasp') } catch (e) { /* the capybaras saw it */ }
    this._spawnDebris(4, { x: m.x, y: 0.3, z: m.z })
    if (this._capCool <= 0) {
      this._capCool = 2.5
      this.emit('caption', { text: 'LIQUIDATION CASCADE' })
    }
    this.emit('arena:hazard', {
      kind: 'chart-meteor', pos: { x: m.x, y: 0, z: m.z },
      damage: METEOR_DMG, radius: METEOR_RADIUS,
    })

    // shove nearby physics props (XZ radial from the crater)
    for (const h of this.props) {
      try {
        const p = h?.mesh?.position
        if (!p) continue
        const dx = p.x - m.x
        const dz = p.z - m.z
        const d = Math.hypot(dx, dz)
        if (d < 3) {
          this.physics?.impulse?.(h, [(dx / (d || 1)) * 3.5, 4.5, (dz / (d || 1)) * 3.5])
        }
      } catch (e) { /* prop already gone */ }
    }

    // damage + launch fighters caught in the blast disc (defensive: combat
    // internals may shift — every touch is optional-chained and try/caught)
    for (const f of this._fighters) {
      try {
        if (!f?.pos || !(f.hp > 0)) continue
        const match = f.match
        if (match && match.phase !== 'fight') continue
        if (f.isInvulnerable?.()) continue
        const dx = f.pos.x - m.x
        const dz = (f.pos.z ?? 0) - m.z
        const d = Math.hypot(dx, dz)
        if (d > METEOR_RADIUS || f.pos.y > 2.6) continue
        const nx = d > 0.01 ? dx / d : (this._rng() < 0.5 ? -1 : 1)
        const nz = d > 0.01 ? dz / d : 0
        const dmg = METEOR_DMG
        f.setHp?.(f.hp - dmg)
        if (typeof f.damageTakenThisRound === 'number') f.damageTakenThisRound += dmg
        this.emit('fighter:hit', { slot: f.slot, damage: dmg, move: 'liquidation-cascade', counter: false, combo: 0 })
        const imp = [nx * 9.5, 8.5, nz * 9.5]
        if (f.hp <= 0 && match?.onKO) {
          match.forceRagdoll?.(f, imp, 2.5)
          match.onKO(f)
        } else {
          match?.forceRagdoll?.(f, imp, 2.2)
        }
      } catch (e) { console.warn('[arena] meteor hit failed', e) }
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

    // v2.0 free-roam: picnic clutter scatters across the open lawn (center
    // lane kept mostly clear).

    // 2 park benches (they vibrate at stage 3)
    this._benchHandles = []
    const b1 = place(makeBench(), -6.2, -3.6, 0.35, { shape: 'box', mass: 6, health: 22 })
    const b2 = place(makeBench(), 6.4, 3.4, -0.4 + Math.PI, { shape: 'box', mass: 6, health: 22 })
    if (b1) this._benchHandles.push(b1)
    if (b2) this._benchHandles.push(b2)

    // 2 picnic baskets
    place(makePicnicBasket(rng), -3.8, 3.8, rng() * Math.PI, { shape: 'box', mass: 2, health: 8 })
    place(makePicnicBasket(rng), 4.6, -3.9, rng() * Math.PI, { shape: 'box', mass: 2, health: 8 })

    // the sacred zen rock stack
    place(makeZenStack(rng), 7.9, -2.6, rng() * Math.PI, { shape: 'box', mass: 7, health: 24 })

    // the sign that held the whole economy together
    place(makeDoNotSellSign(), -7.8, 2.9, 0.3, { shape: 'box', mass: 4, health: 16 })
  }

  _wireEvents() {
    // capybaras are polite spectators (stage 1) / doom prophets (stage 3)
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.2 + Math.min(0.7, combo * 0.06) + (e?.counter ? 0.35 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.1) })
    this.listen('fighter:ko', () => { for (const c of this._crowds) c.cheer(2.6) })
    this.listen('round:end', () => { for (const c of this._crowds) c.cheer(1.8) })
    this.listen('physics:impact', (e) => {
      if (!e) return
      // ragdoll limb impacts carry fighter refs in their metadata — collect
      // them early so stage-3 meteors know exactly who to liquidate
      this._captureFighter(e.a?.fighter)
      this._captureFighter(e.b?.fighter)
      // hard landings crack the crumbling island once the turbulence starts
      if (!(e.speed > 7) || this._heat < 0.5 || this._impactCool > 0) return
      this._impactCool = 0.5
      this._spawnDebris(1 + Math.floor(this._rng() * 2))
    })
  }

  // pull every fighter reachable from one ref into the meteor targeting set
  _captureFighter(f) {
    if (!f || !f.pos || this._fighters.has(f)) return
    this._fighters.add(f)
    if (f.foe?.pos) this._fighters.add(f.foe)
    const all = f.match?.fighters
    if (Array.isArray(all)) for (const other of all) if (other?.pos) this._fighters.add(other)
  }

  // -- stage machine --------------------------------------------------------

  _updateStages(dt) {
    const t = this._time
    const target = t < STAGE2_AT ? 0 : t < STAGE3_AT ? 1 : 2
    const d = target - this._heat
    this._heat += Math.sign(d) * Math.min(Math.abs(d), dt * 0.25) // ~4s ramps
    const heat = this._heat

    if (!this._stage2Announced && t >= STAGE2_AT) {
      this._stage2Announced = true
      this.emit('caption', { text: 'MARKET TURBULENCE DETECTED' })
      this.emit('camera:shake', { mag: 0.28 })
      this.emit('arena:stage', { stage: 2 })
      this.sfx('thud', { vol: 0.6, pitch: 0.6 })
      try { this.audio?.crowd?.('gasp') } catch (e) { /* uneasy silence */ }
    }
    if (!this._stage3Announced && t >= STAGE3_AT) {
      this._stage3Announced = true
      this.emit('caption', { text: 'LIQUIDATION IMMINENT' })
      this.emit('announcer', { line: 'THE CASCADE IS COMING! ABANDON THE PARK!' })
      this.emit('camera:shake', { mag: 0.5 })
      this.emit('arena:stage', { stage: 3 })
      this.sfx('explosion', { vol: 0.5, pitch: 0.6 })
      try { this.audio?.crowd?.('wild') } catch (e) { /* screaming, probably */ }
    }

    // -- global tinting driven by heat
    const C = this._cols
    const tc = this._tmpColor
    if (this._skyMat) this._skyMat.color.copy(mix3(tc, C.sky[0], C.sky[1], C.sky[2], heat))
    if (this.scene?.fog) {
      this.scene.fog.color.copy(mix3(tc, C.fog[0], C.fog[1], C.fog[2], heat))
      this.scene.fog.near = 32 - heat * 5
      this.scene.fog.far = 85 - heat * 11
    }
    const rig = this._rig
    if (rig) {
      rig.hemi.color.copy(mix3(tc, C.hemiSky[0], C.hemiSky[1], C.hemiSky[2], heat))
      rig.hemi.groundColor.copy(mix3(tc, C.hemiGround[0], C.hemiGround[1], C.hemiGround[2], heat))
      rig.sun.color.copy(mix3(tc, C.sun[0], C.sun[1], C.sun[2], heat))
      rig.sun.intensity = 1.65 - heat * 0.18
    }
    this._cloudMat.color.copy(mix3(tc, C.cloud[0], C.cloud[1], C.cloud[2], heat))
    this._petalMat.color.copy(mix3(tc, C.petal[0], C.petal[1], C.petal[2], heat))
    this._pond.waterMat.color.copy(mix3(tc, C.water[0], C.water[1], C.water[2], heat))

    // -- klaxon pulses (stage 3)
    const alarm = Math.max(0, (heat - 1.5) * 2) // 0..1
    const pulse = alarm * Math.pow(Math.max(0, Math.sin(this._time * 7)), 2)
    this._klaxonLight.intensity = pulse * 2.6
    for (const lamp of this._klaxonMats) lamp.color.setRGB(0.33 + pulse * 0.67, 0.08 + pulse * 0.08, 0.07)
    for (const glow of this._lanternGlows) {
      // lantern light goes from warm tea-light to emergency red
      glow.color.copy(mix3(tc, C.lantern[0], C.lantern[1], C.lantern[2], heat))
    }

    // -- rumbles + crumbling edges
    if (heat > 0.5) {
      this._rumbleTimer -= dt
      if (this._rumbleTimer <= 0) {
        this._rumbleTimer = heat > 1.5 ? 3 + this._rng() * 2.5 : 5.5 + this._rng() * 3.5
        this.emit('camera:shake', { mag: 0.1 + 0.14 * Math.min(1, heat - 0.5) })
        this.sfx('thud', { vol: 0.45, pitch: 0.55 })
        this._spawnDebris(1 + Math.floor(this._rng() * 3))
      }
    }
    if (heat > 1.5) {
      // continuous edge collapse
      this._crumbleTimer -= dt
      if (this._crumbleTimer <= 0) {
        this._crumbleTimer = 0.55 + this._rng() * 0.4
        this._spawnDebris(1)
      }
      // benches rattle right off their bolts
      this._benchBuzzTimer -= dt
      if (this._benchBuzzTimer <= 0) {
        this._benchBuzzTimer = 0.35
        for (const h of this._benchHandles) {
          if (h?.alive === false) continue // already rattled itself to pieces
          try {
            this.physics?.impulse?.(h, [(this._rng() - 0.5) * 1.6, this._rng() * 2, (this._rng() - 0.5) * 1.2])
          } catch (e) { /* bench achieved freedom */ }
        }
      }
      // sustained capybara panic — held against cheer decay
      for (const c of this._crowds) c.cheer(2.4 * dt)
      // meteors
      this._meteorTimer -= dt
      if (this._meteorTimer <= 0) {
        this._meteorTimer = 6.5 + this._rng() * 4
        this._launchMeteor()
      }
    }
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    this._capCool = Math.max(0, this._capCool - dt)
    this._impactCool = Math.max(0, this._impactCool - dt)

    this._updateStages(dt)
    this._updateDebris(dt)
    this._updateMeteors(dt)

    // drifting cloud sea + bobbing islets
    for (const c of this._clouds) {
      c.ang += c.speed * dt
      c.mesh.position.set(Math.cos(c.ang) * c.r, c.y + Math.sin(this._time * 0.3 + c.ang * 3) * 0.3, Math.sin(c.ang) * c.r - 2.5)
    }
    for (const isl of this._islets) {
      isl.mesh.position.y = isl.baseY + Math.sin(this._time * isl.speed + isl.phase) * 0.35
      isl.mesh.rotation.y += dt * 0.02
      // stage 3: even the islets tremble
      if (this._heat > 1.5) isl.mesh.position.y += Math.sin(this._time * 22 + isl.phase) * 0.02
    }

    // hero capybaras: zen loafing -> running in place, screaming internally
    const panicking = this._heat > 1.5
    for (const cp of this._capys) {
      if (panicking) {
        cp.mesh.position.y = Math.abs(Math.sin(this._time * 13 + cp.phase)) * 0.2
        cp.mesh.rotation.y = cp.baseRy + Math.sin(this._time * 9 + cp.phase) * 0.35
        cp.mesh.rotation.z = Math.sin(this._time * 17 + cp.phase) * 0.06
      } else {
        cp.mesh.position.y = 0
        cp.mesh.rotation.z = 0
        cp.mesh.rotation.y = cp.baseRy + Math.sin(this._time * 0.4 + cp.phase) * 0.05
        cp.mesh.scale.y = 1 + Math.sin(this._time * 1.1 + cp.phase) * 0.02 // breathing. calm. fine.
      }
    }

    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    // capture fighter refs for the meteor hazard (combat hands them to us here)
    this._captureFighter(fighter)
    try { this.audio?.crowd?.(this._heat > 1 ? 'wild' : 'cheer') } catch (e) { /* polite gasps */ }
    for (const c of this._crowds) c.cheer(2)
    // a launch mid-collapse shakes more rock loose
    if (this._heat > 0.5) this._spawnDebris(2 + Math.floor(this._rng() * 3))
    if (this.physics?.presetName === 'unhinged') {
      for (const c of this._crowds) c.knockOverRandom(2 + Math.floor(this._rng() * 3))
      this.sfx('boing', { vol: 0.5 })
    }
  }
}

export const CalmBeforeLiquidation = {
  id: 'calm-before-liquidation',
  name: 'CALM BEFORE LIQUIDATION',
  music: 'battle_calm_liquidation',
  build(ctx) { return new CalmBeforeLiquidationArena(ctx) },
}
