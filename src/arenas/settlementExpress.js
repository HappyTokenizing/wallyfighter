// ============================================================================
// SETTLEMENT EXPRESS — Bonko's stage (story round 4). A fistfight on the roof
// of a low-poly settlement train barreling across a golden-hour desert. The
// train never moves; the WORLD does: ground and ballast textures scroll,
// telegraph pylons / billboards / scrub / mountains loop past on pools,
// wind streaks whip by, and the locomotive up front puffs smoke clean over
// the fighters' heads. Periodically the whole world plunges into a TUNNEL
// (lights dim, roof beams whoosh overhead — pure visual), and every ~10s a
// LOW BRIDGE gantry sweeps across at head height: horn, caption 'DUCK!',
// and anyone still standing gets bonked into next week.
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, makeCrateMesh, buildCrowd,
} from './ArenaBase.js'

// ---------------------------------------------------------------------------
// tuning constants
// ---------------------------------------------------------------------------
const SPEED = 14            // m/s — how fast the world sweeps past (+X -> -X)
const GROUND_Y = -3.3       // desert floor
const BRIDGE_CLEAR = 1.45   // underside of the low-bridge beam
const BRIDGE_TOP = 1.95     // top of the beam (jump above this = safe)
const BRIDGE_DMG = 6

// passengers dress like it's a period drama with a memecoin budget
const PASSENGER_PALETTE = ['#6b4f9e', '#a83c48', '#3c6e58', '#c2803a', '#4a5a8f', '#7a7f8a', '#b5566b', '#4f7a3c']

// fighters in these states are excused from bridge-related paperwork
const BONK_SKIP = new Set(['knockdown', 'getup', 'grabbed', 'ragdoll', 'ko', 'win', 'lose', 'finisher', 'launched'])

// ---------------------------------------------------------------------------
// module-private texture factories
// ---------------------------------------------------------------------------

function makeDesertTexture(rng) {
  return canvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = '#d8a86a'
    c.fillRect(0, 0, W, H)
    // sand mottle — big soft blotches
    for (let i = 0; i < 70; i++) {
      const t = rng()
      c.fillStyle = t < 0.5 ? 'rgba(190,140,80,0.25)' : 'rgba(240,200,140,0.22)'
      const r = 6 + rng() * 22
      c.beginPath()
      c.ellipse(rng() * W, rng() * H, r, r * (0.4 + rng() * 0.4), 0, 0, Math.PI * 2)
      c.fill()
    }
    // pebbles + dry tufts
    for (let i = 0; i < 90; i++) {
      c.fillStyle = rng() < 0.6 ? 'rgba(120,85,50,0.5)' : 'rgba(90,110,60,0.45)'
      c.fillRect(rng() * W, rng() * H, 2 + rng() * 3, 2 + rng() * 2)
    }
  }, { repeat: [26, 14] })
}

function makeBallastTexture(rng) {
  // gravel bed with dark sleepers — scrolls along u to sell the speed
  return canvasTexture(192, 64, (c, W, H) => {
    c.fillStyle = '#9a8a74'
    c.fillRect(0, 0, W, H)
    for (let i = 0; i < 160; i++) {
      const g = 110 + Math.floor(rng() * 90)
      c.fillStyle = `rgba(${g},${g - 12},${g - 28},0.55)`
      c.fillRect(rng() * W, rng() * H, 2 + rng() * 3, 2 + rng() * 3)
    }
    // sleepers every 24px
    c.fillStyle = '#5a4232'
    for (let x = 4; x < W; x += 24) {
      c.fillRect(x, 4, 11, H - 8)
      c.fillStyle = '#4a3628'
      c.fillRect(x + 8, 4, 3, H - 8)
      c.fillStyle = '#5a4232'
    }
  }, { repeat: [40, 1] })
}

function makeRoofTexture(rng) {
  // riveted metal roof panels with a lighter center walkway
  return canvasTexture(256, 128, (c, W, H) => {
    c.fillStyle = '#6d6258'
    c.fillRect(0, 0, W, H)
    // panel seams across x
    c.strokeStyle = 'rgba(30,24,20,0.55)'
    c.lineWidth = 3
    for (let x = 0; x <= W; x += 32) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke()
    }
    // center walkway planks
    c.fillStyle = '#8a7a66'
    c.fillRect(0, H * 0.34, W, H * 0.32)
    c.strokeStyle = 'rgba(60,44,30,0.5)'
    c.lineWidth = 2
    for (let x = 0; x <= W; x += 16) {
      c.beginPath(); c.moveTo(x, H * 0.34); c.lineTo(x, H * 0.66); c.stroke()
    }
    // rivets
    c.fillStyle = 'rgba(40,34,28,0.7)'
    for (let x = 8; x < W; x += 32) {
      for (let y = 8; y < H; y += 24) {
        c.beginPath(); c.arc(x + (rng() - 0.5) * 2, y + (rng() - 0.5) * 2, 2.2, 0, Math.PI * 2); c.fill()
      }
    }
    // weathering
    for (let i = 0; i < 24; i++) {
      c.fillStyle = 'rgba(120,90,60,0.16)'
      c.fillRect(rng() * W, rng() * H, 8 + rng() * 20, 3 + rng() * 6)
    }
  })
}

// Livery flank for a train car. opts: { label, windows: 'passengers'|'lit'|'none' }
function makeFlankTexture(rng, opts = {}) {
  const label = opts.label ?? 'SETTLEMENT EXPRESS'
  return canvasTexture(512, 128, (c, W, H) => {
    // maroon body with gold trim bands
    c.fillStyle = '#8f2b33'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#e8b13c'
    c.fillRect(0, 4, W, 4)
    c.fillRect(0, H - 10, W, 5)
    // cream lettering band
    c.fillStyle = '#f2e4c8'
    c.fillRect(0, 12, W, 26)
    c.font = '900 21px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#6e1f26'
    c.fillText(label, W / 2, 26)
    if (opts.windows !== 'none') {
      // windows row — warm lit, some with painted passenger silhouettes
      const n = 9
      for (let i = 0; i < n; i++) {
        const wx = 14 + i * ((W - 28) / n)
        const ww = (W - 28) / n - 12
        c.fillStyle = '#3a2c1a'
        c.fillRect(wx - 3, 48, ww + 6, 52)
        c.fillStyle = '#ffd98a'
        c.fillRect(wx, 51, ww, 46)
        if (opts.windows === 'passengers' && rng() < 0.7) {
          // painted rider: dark bust + head, occasionally waving a tiny flag
          c.fillStyle = 'rgba(50,32,24,0.92)'
          const px = wx + ww * (0.3 + rng() * 0.4)
          c.beginPath(); c.arc(px, 74, 7, 0, Math.PI * 2); c.fill()
          c.fillRect(px - 10, 80, 20, 18)
          if (rng() < 0.35) {
            c.strokeStyle = 'rgba(50,32,24,0.9)'
            c.lineWidth = 2
            c.beginPath(); c.moveTo(px + 8, 72); c.lineTo(px + 16, 60); c.stroke()
            c.fillStyle = '#e0484f'
            c.fillRect(px + 15, 56, 9, 6)
          }
        }
      }
    }
    // grime near the bottom
    for (let i = 0; i < 26; i++) {
      c.fillStyle = 'rgba(40,20,12,0.18)'
      c.fillRect(rng() * W, H - 22 + rng() * 16, 6 + rng() * 18, 3 + rng() * 4)
    }
  })
}

function makeHazardStripeTexture() {
  return canvasTexture(128, 32, (c, W, H) => {
    c.fillStyle = '#e8b13c'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#20242c'
    for (let x = -H; x < W + H; x += 28) {
      c.beginPath()
      c.moveTo(x, H); c.lineTo(x + 14, 0); c.lineTo(x + 26, 0); c.lineTo(x + 12, H)
      c.closePath(); c.fill()
    }
  }, { repeat: [4, 1] })
}

// ---------------------------------------------------------------------------
// module-private mesh factories
// ---------------------------------------------------------------------------

function makeWheel(r = 0.5, thick = 0.12) {
  const geo = new THREE.CylinderGeometry(r, r, thick, 8)
  geo.rotateX(Math.PI / 2) // axle along Z
  const wheel = new THREE.Mesh(geo, flatMat(0x2c2f38))
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, thick + 0.04, 6).rotateX(Math.PI / 2), flatMat(0x8f2b33))
  wheel.add(hub)
  wheel.name = 'wheel'
  return wheel
}

function makeCoupler() {
  const g = new THREE.Group()
  g.name = 'coupler'
  const dark = flatMat(0x2c2f38)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.34), dark)
  g.add(bar)
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.5), dark)
  g.add(knuckle)
  for (const dz of [-0.28, 0.28]) { // dangling safety chains (retro: two boxes)
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.06), flatMat(0x5a5f6b))
    chain.position.set(0, -0.28, dz)
    g.add(chain)
  }
  return g
}

function makePylon() {
  // telegraph-style power pole: post + two crossarms + insulator knobs
  const g = new THREE.Group()
  g.name = 'pylon'
  const wood = flatMat(0x5a4232)
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.6, 0.22), wood)
  post.position.y = GROUND_Y + 3.8
  g.add(post)
  for (const [ay, aw] of [[GROUND_Y + 7.2, 2.2], [GROUND_Y + 6.5, 1.7]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, aw), wood)
    arm.position.y = ay
    g.add(arm)
    for (const dz of [-aw / 2 + 0.12, aw / 2 - 0.12]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), flatMat(0x3fbcd4))
      knob.position.set(0, ay + 0.14, dz)
      g.add(knob)
    }
  }
  return g
}

function makeBillboard(text, sub, opts = {}) {
  const g = new THREE.Group()
  g.name = 'billboard'
  const sign = makeSign(text, {
    w: 6.4, h: 2.1, depth: 0.24, px: 72,
    bg: opts.bg ?? '#3a2c14', fg: opts.fg ?? '#ffd83d',
    border: opts.fg ?? '#ffd83d', sub, subColor: opts.subColor ?? '#e8d5a8',
  })
  sign.position.y = GROUND_Y + 4.6
  g.add(sign)
  const wood = flatMat(0x4a3628)
  for (const dx of [-2.3, 2.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.7, 0.24), wood)
    leg.position.set(dx, GROUND_Y + 1.85, 0)
    g.add(leg)
  }
  return g
}

function makeMountain(rng) {
  // dusky low-poly peak or mesa
  const g = new THREE.Group()
  g.name = 'mountain'
  if (rng() < 0.7) {
    const h = 9 + rng() * 13
    const r = 9 + rng() * 12
    const hue = 0.06 + rng() * 0.06
    const col = new THREE.Color().setHSL(hue, 0.28 + rng() * 0.14, 0.3 + rng() * 0.1)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), flatMat(col))
    cone.position.y = GROUND_Y + h / 2
    cone.rotation.y = rng() * Math.PI
    g.add(cone)
    if (rng() < 0.5) { // snow cap
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.3, 6), flatMat(0xf5ecd8))
      cap.position.y = GROUND_Y + h - h * 0.15 + 0.01
      cap.rotation.y = cone.rotation.y
      g.add(cap)
    }
  } else {
    // flat-top mesa
    const h = 5 + rng() * 6
    const r = 7 + rng() * 8
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 7), flatMat(new THREE.Color().setHSL(0.05, 0.4, 0.34)))
    mesa.position.y = GROUND_Y + h / 2
    mesa.rotation.y = rng() * Math.PI
    g.add(mesa)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.8, 0.5, 7), flatMat(0xc2803a))
    top.position.y = GROUND_Y + h + 0.2
    top.rotation.y = mesa.rotation.y
    g.add(top)
  }
  return g
}

function makeScrub(rng) {
  const g = new THREE.Group()
  g.name = 'scrub'
  if (rng() < 0.45) {
    // saguaro cactus: trunk + two arms
    const green = flatMat(0x4f7a3c)
    const h = 1.6 + rng() * 1.4
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 6), green)
    trunk.position.y = GROUND_Y + h / 2
    g.add(trunk)
    for (const side of [-1, 1]) {
      if (rng() < 0.85) {
        const ah = 0.5 + rng() * 0.5
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, ah, 5), green)
        arm.position.set(side * 0.34, GROUND_Y + h * (0.45 + rng() * 0.25) + ah / 2, 0)
        g.add(arm)
        const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 5), green)
        joint.rotation.z = Math.PI / 2
        joint.position.set(side * 0.24, GROUND_Y + h * (0.45 + rng() * 0.2), 0)
        g.add(joint)
      }
    }
  } else {
    // dry tumble-bush
    const s = 0.35 + rng() * 0.5
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), flatMat(rng() < 0.5 ? 0x7a6a3c : 0x5f6e3c))
    bush.position.y = GROUND_Y + s * 0.8
    bush.rotation.set(rng() * 2, rng() * 2, rng() * 2)
    g.add(bush)
  }
  return g
}

function makeMailSack(rng, label = 'MAIL') {
  const g = new THREE.Group()
  g.name = 'mailSack'
  const tex = canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#b8a06a'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(90,66,50,0.5)'
    c.lineWidth = 2
    for (let y = 10; y < H; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + 4); c.stroke() }
    c.font = '900 26px "Arial Black", Arial, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = 'rgba(70,44,20,0.9)'
    c.fillText(label, W / 2, H / 2 + 4)
  })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 8, 6), new THREE.MeshLambertMaterial({ map: tex, flatShading: true }))
  body.scale.set(0.9, 1.05, 0.9)
  body.position.y = 0.44
  g.add(body)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.28, 6), flatMat(0xa08a56))
  neck.position.y = 0.9
  neck.rotation.z = (rng() - 0.5) * 0.5
  g.add(neck)
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 5, 8), flatMat(0x6e4a26))
  tie.position.y = 0.82
  tie.rotation.x = Math.PI / 2
  g.add(tie)
  return g
}

function makeDiningCart() {
  const g = new THREE.Group()
  g.name = 'diningCart'
  const clothTex = canvasTexture(64, 64, (c, W, H) => {
    c.fillStyle = '#f2ede0'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(200,60,70,0.7)'
    c.lineWidth = 4
    for (let i = -H; i < W + H; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke() }
  })
  const cloth = new THREE.MeshLambertMaterial({ map: clothTex, flatShading: true })
  const brass = flatMat(0xd9a325)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.68), cloth)
  top.position.y = 0.92
  g.add(top)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.6), flatMat(0x8a5a34))
  shelf.position.y = 0.42
  g.add(shelf)
  for (const dx of [-0.5, 0.5]) {
    for (const dz of [-0.27, 0.27]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.86, 0.07), brass)
      leg.position.set(dx, 0.46, dz)
      g.add(leg)
    }
  }
  for (const dx of [-0.42, 0.42]) {
    const wheel = makeWheel(0.13, 0.07)
    wheel.position.set(dx, 0.13, 0.3)
    g.add(wheel)
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), brass)
  handle.position.set(-0.66, 1.02, 0)
  g.add(handle)
  // tea service, pre-catastrophe
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), flatMat(0xdde3e8))
  pot.position.set(0.18, 1.06, -0.12)
  g.add(pot)
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), flatMat(0xdde3e8))
  spout.rotation.z = -1.1
  spout.position.set(0.32, 1.1, -0.12)
  g.add(spout)
  for (let i = 0; i < 2; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 6), flatMat(0xf2ede0))
    cup.position.set(-0.2 + i * 0.16, 0.99, 0.16)
    g.add(cup)
  }
  return g
}

function makeLuggageTrunk() {
  const g = new THREE.Group()
  g.name = 'luggageTrunk'
  const tex = canvasTexture(96, 64, (c, W, H) => {
    c.fillStyle = '#7a4a2a'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#e8b13c'
    for (const x of [W * 0.22, W * 0.78]) c.fillRect(x - 4, 0, 8, H)
    c.strokeStyle = 'rgba(40,20,8,0.6)'
    c.lineWidth = 3
    c.strokeRect(2, 2, W - 4, H - 4)
    c.beginPath(); c.moveTo(0, H * 0.4); c.lineTo(W, H * 0.4); c.stroke()
  })
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.6), new THREE.MeshLambertMaterial({ map: tex, flatShading: true }))
  trunk.position.y = 0.25
  g.add(trunk)
  return g
}

// The dreaded gantry. Beam spans the track in Z at head height; legs land on
// the desert floor either side. Returns { group, lampMats }.
function makeBridgeGantry() {
  const g = new THREE.Group()
  g.name = 'lowBridge'
  const steel = flatMat(0x5a5f6b)
  const stripes = new THREE.MeshLambertMaterial({ map: makeHazardStripeTexture(), flatShading: true })
  // beam: underside at BRIDGE_CLEAR, top at BRIDGE_TOP
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, BRIDGE_TOP - BRIDGE_CLEAR, 11.4), stripes)
  beam.position.y = (BRIDGE_CLEAR + BRIDGE_TOP) / 2
  g.add(beam)
  for (const dz of [-5.4, 4.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, BRIDGE_TOP - GROUND_Y, 0.26), steel)
    leg.position.set(0, (BRIDGE_TOP + GROUND_Y) / 2, dz)
    g.add(leg)
  }
  const sign = makeSign('LOW BRIDGE', {
    w: 3.2, h: 0.95, depth: 0.14, px: 80,
    bg: '#7a1f1f', fg: '#ffe14d', border: '#ffe14d', sub: 'SERIOUSLY. DUCK.',
  })
  sign.position.y = BRIDGE_TOP + 0.62
  g.add(sign)
  // warning lamps on the beam ends
  const lampMats = []
  for (const dz of [-4.6, 4.2]) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x662a10 })
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat)
    lamp.position.set(0, BRIDGE_CLEAR - 0.14, dz)
    g.add(lamp)
    lampMats.push(mat)
  }
  return { group: g, lampMats }
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

const BONK_LINES = ['BONKED!', 'FULL SETTLEMENT!', 'HEADROOM: ZERO']

class SettlementExpressArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -3.2, maxZ: 3.2, wallBounce: 0.55 } // narrow: it is a TRAIN ROOF
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0xb04c0)
    this._time = 0
    this._crowds = []
    this._scrollTextures = []   // { tex, perRepeat }
    this._bonkLine = 0
    this._bonkAnnounced = false
    this._hornT = 12 + this._rng() * 8
    this._clackT = 1.4
    this._clack2 = null

    // corner-prop occlusion fade (see _updatePropFades)
    this._camera = null          // set via setCamera (additive MatchScreen hook)
    this._fadeProps = []         // { root, mats, k }
    this._fadeV = new THREE.Vector3()
    this._fadeA = new THREE.Vector3()

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildGround()
    this._buildTrain()
    this._buildScrollers()
    this._buildCrowds()
    this._buildTunnel()
    this._buildBridge()
    this._buildProps()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction ---------------------------------------------------------

  _buildPhysics() {
    // roof deck (top face exactly at y=0) sized to the fight car, invisible
    // bouncy walls on all four sides at the bounds, and a desert catch-floor
    // so knocked-off debris tumbles into the gap between cars instead of
    // hovering.
    this.addStaticBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(21.6, 1, 9))
    this.addBoundsWalls()
    this.addStaticBox(new THREE.Vector3(0, GROUND_Y - 0.48, 0), new THREE.Vector3(140, 1, 90))
  }

  _buildSkyAndLights() {
    // golden-hour canyon sky — indigo overhead melting into hot orange
    const sky = buildSkyDome(['#35418f', '#7a6bd6', '#ff9e6b', '#ffd9a0'], {
      rng: this._rng, cloudColor: 'rgba(255,236,214,0.9)',
    })
    this.group.add(sky)
    this._skyMat = sky.material

    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xffe0c0, hemiGround: 0x9a7a5a, hemiIntensity: 1.05,
      sunColor: 0xffd9a8, sunIntensity: 1.65, sunPos: [12, 15, 8],
      fillColor: 0xa8b8ff, fillIntensity: 0.4,
      fog: { color: 0xe8b98a, near: 30, far: 76 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
    this._rig = rig
    this._lightBase = { hemi: rig.hemi.intensity, sun: rig.sun.intensity, fill: rig.fill.intensity }
    const fog = this.scene?.fog
    this._fogBase = fog ? { color: fog.color.clone(), near: fog.near, far: fog.far } : null
  }

  _buildGround() {
    const rng = this._rng

    // endless scrolling desert
    const desertTex = makeDesertTexture(rng)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 160), new THREE.MeshLambertMaterial({ map: desertTex, flatShading: true }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = GROUND_Y
    this.group.add(ground)
    this._scrollTextures.push({ tex: desertTex, perRepeat: 260 / 26 })

    // twin track embankments (ours at z=0, the party train's at z=-7.5)
    const ballastTex = makeBallastTexture(rng)
    const ballastTop = new THREE.MeshLambertMaterial({ map: ballastTex, flatShading: true })
    const ballastSide = flatMat(0x8a7a64)
    const railMat = flatMat(0x7d838f)
    for (const tz of [0, -7.5]) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(120, 0.5, 7), [ballastSide, ballastSide, ballastTop, ballastSide, ballastSide, ballastSide])
      bed.position.set(0, GROUND_Y + 0.05, tz)
      this.group.add(bed)
      for (const rz of [-1.6, 1.6]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(120, 0.18, 0.1), railMat)
        rail.position.set(0, GROUND_Y + 0.39, tz + rz)
        this.group.add(rail)
      }
    }
    this._scrollTextures.push({ tex: ballastTex, perRepeat: 120 / 40 })

    // one shared scroll updater for every ground texture
    this.addUpdater((dt) => {
      for (const s of this._scrollTextures) {
        s.tex.offset.x = (s.tex.offset.x + (dt * SPEED) / s.perRepeat) % 1
      }
    })

    // static power lines — uniform along X, so they read as infinite
    const wireMat = flatMat(0x3a3f4a)
    for (const [wy, wz] of [[GROUND_Y + 7.2, -5.9], [GROUND_Y + 7.2, -3.7], [GROUND_Y + 6.5, -5.65], [GROUND_Y + 6.5, -3.95]]) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(120, 0.05, 0.05), wireMat)
      wire.position.set(0, wy, wz)
      this.group.add(wire)
    }
  }

  _buildTrain() {
    const rng = this._rng
    const shadows = !!this.quality.shadows
    const maroon = flatMat(0x6e1f26)
    const dark = flatMat(0x2c2f38)
    this._wheels = []
    this._bobbers = []   // { group, baseY, rate, phase, roll }

    // ---- OUR CAR (the fight floor) ----
    // v2.0 free-roam: the roof overhangs the body a touch so the walkable
    // deck carries the whole ±3.2 z playfield
    const roofTex = makeRoofTexture(rng)
    const roofTop = new THREE.MeshLambertMaterial({ map: roofTex, flatShading: true })
    const roofSide = flatMat(0x554b42)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.35, 6.8), [roofSide, roofSide, roofTop, roofSide, roofSide, roofSide])
    roof.position.y = -0.175
    roof.receiveShadow = shadows
    this.group.add(roof)
    // crosswise ribs + edge boards — chunky roof furniture
    for (let x = -9.6; x <= 9.6; x += 2.4) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 6.5), flatMat(0x4a4038))
      rib.position.set(x, 0.025, 0)
      this.group.add(rib)
    }
    for (const ez of [-3.31, 3.31]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.09, 0.18), flatMat(0x8a7a66))
      edge.position.set(0, 0.045, ez)
      this.group.add(edge)
    }
    // brass end railings hint at the invisible walls
    const brass = flatMat(0xd9a325)
    for (const side of [-1, 1]) {
      for (const rz of [-2.2, 0, 2.2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), brass)
        post.position.set(side * 10.55, 0.38, rz)
        this.group.add(post)
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 5.0), brass)
      bar.position.set(side * 10.55, 0.72, 0)
      this.group.add(bar)
    }
    // body with painted-passenger flanks
    const ourFlank = new THREE.MeshLambertMaterial({ map: makeFlankTexture(rng, { label: 'SETTLEMENT EXPRESS', windows: 'passengers' }), flatShading: true })
    const body = new THREE.Mesh(new THREE.BoxGeometry(21.6, 2.1, 6), [maroon, maroon, maroon, maroon, ourFlank, ourFlank])
    body.position.y = -1.4
    this.group.add(body)
    const under = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.5, 4.6), dark)
    under.position.y = -2.7
    this.group.add(under)
    for (const bx of [-7.2, 7.2]) {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.5), dark)
      bogie.position.set(bx, -2.45, 2.45)
      this.group.add(bogie)
      for (const wx of [bx - 0.9, bx + 0.9]) {
        const w = makeWheel(0.5)
        w.position.set(wx, -2.32, 2.5)
        this.group.add(w)
        this._wheels.push({ mesh: w, r: 0.5 })
      }
    }

    // ---- BAGGAGE CAR ahead (+X), then the LOCOMOTIVE ----
    const baggage = new THREE.Group()
    const bagFlank = new THREE.MeshLambertMaterial({ map: makeFlankTexture(rng, { label: 'SETTLED CARGO', windows: 'lit' }), flatShading: true })
    const bagBody = new THREE.Mesh(new THREE.BoxGeometry(9.6, 2.1, 5.6), [maroon, maroon, maroon, maroon, bagFlank, bagFlank])
    bagBody.position.y = -1.35
    baggage.add(bagBody)
    const bagRoof = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.3, 5.8), flatMat(0x554b42))
    bagRoof.position.y = -0.2
    baggage.add(bagRoof)
    for (const wx of [-3.4, 3.4]) {
      const w = makeWheel(0.5)
      w.position.set(wx, -2.32, 2.35)
      baggage.add(w)
      this._wheels.push({ mesh: w, r: 0.5 })
    }
    baggage.position.x = 17.2
    this.group.add(baggage)
    this._bobbers.push({ group: baggage, baseY: 0, rate: 3.4, phase: 1.2, roll: 0.004 })

    const engine = new THREE.Group()
    engine.name = 'locomotive'
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 6.4, 10).rotateZ(Math.PI / 2), flatMat(0x23262e))
    boiler.position.set(0.6, -0.85, 0)
    engine.add(boiler)
    const boilerBand = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.3, 10).rotateZ(Math.PI / 2), brass)
    boilerBand.position.set(1.6, -0.85, 0)
    engine.add(boilerBand)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 3.2), flatMat(0x8f2b33))
    cab.position.set(-2.6, -1.05, 0)
    engine.add(cab)
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 3.5), flatMat(0x554b42))
    cabRoof.position.set(-2.6, 0.4, 0)
    engine.add(cabRoof)
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.34, 1.7, 8), flatMat(0x23262e))
    funnel.position.set(3.2, 1.0, 0)
    engine.add(funnel)
    const funnelLip = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.22, 8), brass)
    funnelLip.position.set(3.2, 1.85, 0)
    engine.add(funnelLip)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), brass)
    dome.position.set(1.4, 0.2, 0)
    engine.add(dome)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }))
    lamp.position.set(3.9, -0.5, 0)
    engine.add(lamp)
    const catcher = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 4), flatMat(0x8f2b33))
    catcher.rotation.set(Math.PI / 2.6, Math.PI / 4, 0)
    catcher.position.set(4.2, -2.2, 0)
    engine.add(catcher)
    for (const wx of [-1.6, 0, 1.6]) {
      const w = makeWheel(0.68)
      w.position.set(wx, -2.14, 2.0)
      engine.add(w)
      this._wheels.push({ mesh: w, r: 0.68 })
    }
    engine.position.x = 27.2
    this.group.add(engine)
    this._bobbers.push({ group: engine, baseY: 0, rate: 3.0, phase: 2.6, roll: 0.005 })
    this._funnelTip = { x: 30.4, y: 2.0 } // world-space smoke spawn

    // ---- CABOOSE behind (-X) with open observation deck ----
    const caboose = new THREE.Group()
    const cabFlank = new THREE.MeshLambertMaterial({ map: makeFlankTexture(rng, { label: 'FINALITY OR BUST', windows: 'passengers' }), flatShading: true })
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.2, 5.6), [maroon, maroon, maroon, maroon, cabFlank, cabFlank])
    cabBody.position.set(-3.35, -1.35, 0)
    caboose.add(cabBody)
    const cabRoof2 = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.28, 5.8), flatMat(0x554b42))
    cabRoof2.position.set(-3.35, -0.16, 0)
    caboose.add(cabRoof2)
    const cupola = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 3.2), flatMat(0x8f2b33))
    cupola.position.set(-3.35, 0.42, 0)
    caboose.add(cupola)
    const cupolaRoof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 3.5), flatMat(0x554b42))
    cupolaRoof.position.set(-3.35, 0.98, 0)
    caboose.add(cupolaRoof)
    // observation deck facing the action
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 5.2), dark)
    deck.position.set(0.75, -0.66, 0)
    caboose.add(deck)
    for (const dz of [-2.4, 0, 2.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), brass)
      post.position.set(1.5, -0.15, dz)
      caboose.add(post)
    }
    const railBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 5.0), brass)
    railBar.position.set(1.5, 0.26, 0)
    caboose.add(railBar)
    for (const wx of [-5.2, -1.7]) {
      const w = makeWheel(0.5)
      w.position.set(wx, -2.32, 2.35)
      caboose.add(w)
      this._wheels.push({ mesh: w, r: 0.5 })
    }
    // blinking rear marker lamp
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff4d5e })
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), markerMat)
    marker.position.set(-6.7, -1.0, 1.2)
    caboose.add(marker)
    this._markerMat = markerMat
    caboose.position.x = -13.1
    this.group.add(caboose)
    this._caboose = caboose
    this._bobbers.push({ group: caboose, baseY: 0, rate: 3.7, phase: 0.4, roll: 0.006 })

    // couplers bridging the connector gaps
    for (const cx of [11.55, -11.5]) {
      const c = makeCoupler()
      c.position.set(cx, -1.8, 0)
      this.group.add(c)
    }

    // ---- THE PARTY CAR — parallel track, windows crammed with fans ----
    const party = new THREE.Group()
    party.name = 'partyCar'
    const partyMaroon = flatMat(0x7a2732)
    const bandBottom = new THREE.Mesh(new THREE.BoxGeometry(20, 1.15, 0.18), partyMaroon)
    bandBottom.position.set(0, -1.65, 2.11)
    party.add(bandBottom)
    const bandTop = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 0.18), partyMaroon)
    bandTop.position.set(0, -0.32, 2.11)
    party.add(bandTop)
    for (let i = 0; i <= 12; i++) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.18), partyMaroon)
      mull.position.set(-9.7 + i * (19.4 / 12), -0.82, 2.11)
      party.add(mull)
    }
    // glowing interior + solid far wall — silhouettes pop at dusk and in tunnels
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 1.9), new THREE.MeshBasicMaterial({ color: 0x9c6a30 }))
    glow.position.set(0, -1.2, -1.85)
    party.add(glow)
    const farWall = new THREE.Mesh(new THREE.BoxGeometry(20, 2.3, 0.2), partyMaroon)
    farWall.position.set(0, -1.2, -2.1)
    party.add(farWall)
    for (const ex of [-10, 10]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 4.4), partyMaroon)
      cap.position.set(ex, -1.2, 0)
      party.add(cap)
    }
    const partyRoof = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.3, 4.8), flatMat(0x554b42))
    partyRoof.position.set(0, -0.08, 0)
    party.add(partyRoof)
    const partyUnder = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.5, 3.6), dark)
    partyUnder.position.set(0, -2.5, 0)
    party.add(partyUnder)
    for (const wx of [-6.8, 0, 6.8]) {
      const w = makeWheel(0.5)
      w.position.set(wx, -2.32, 1.9)
      party.add(w)
      this._wheels.push({ mesh: w, r: 0.5 })
    }
    const banner = makeSign('BONKO ULTRAS', { w: 3.2, h: 0.62, depth: 0.08, px: 72, bg: '#20315e', fg: '#ffd83d' })
    banner.position.set(3.2, -1.95, 2.22)
    banner.rotation.z = 0.045
    party.add(banner)
    party.position.set(0, 0, -7.5)
    this.group.add(party)
    this._partyCar = party
    this._bobbers.push({ group: party, baseY: 0, rate: 3.2, phase: 2.0, roll: 0.007 })

    // strapped-down luggage rides the baggage-car roof now — the fight deck
    // is free-roam and keeps its floor clear of non-breakable dressing
    const trunk = makeLuggageTrunk()
    trunk.position.set(-2.6, -0.05, -1.4)
    trunk.rotation.y = 0.2
    baggage.add(trunk)

    // train mechanics: spinning wheels, bobbing cars, blinking marker
    this.addUpdater((dt) => {
      for (const w of this._wheels) w.mesh.rotation.z -= (dt * SPEED) / w.r
      for (const b of this._bobbers) {
        b.group.position.y = b.baseY + Math.sin(this._time * b.rate + b.phase) * 0.035
        b.group.rotation.x = Math.sin(this._time * b.rate * 0.7 + b.phase) * b.roll
      }
      this._markerMat.color.setHex(this._time % 1.0 < 0.5 ? 0xff4d5e : 0x5a1218)
    })
  }

  _buildScrollers() {
    const rng = this._rng
    const ps = this.quality.particleScale ?? 0.75
    this._pools = []

    const pool = (items, speed, minX, maxX) => {
      this._pools.push({ items, speed, minX, range: maxX - minX })
    }

    // telegraph pylons hugging the far track
    const pylons = []
    for (let i = 0; i < 7; i++) {
      const p = makePylon()
      p.position.set(-56 + i * 16 + (rng() - 0.5) * 2, 0, -4.8)
      this.group.add(p)
      pylons.push(p)
    }
    pool(pylons, SPEED, -56, 56)

    // billboards — the desert is 90% ads
    const billDefs = [
      ['SETTLING BLOCKS 4EVER', 'THE SETTLEMENT EXPRESS', { bg: '#3a2c14', fg: '#ffd83d' }],
      ['NEXT STOP: FINALITY', 'ARRIVAL: EVENTUALLY', { bg: '#132a63', fg: '#9fe8b0' }],
      ['GAS STATION AHEAD', 'FEES FROM 400 GWEI', { bg: '#5a1670', fg: '#ffb0f0' }],
      ['MOONVILLE 69 MI', 'NO REFUNDS', { bg: '#0b3d22', fg: '#37e05f' }],
    ]
    const boards = []
    for (let i = 0; i < billDefs.length; i++) {
      const [text, sub, style] = billDefs[i]
      const b = makeBillboard(text, sub, style)
      b.position.set(-66 + i * 44, 0, -13 - rng() * 3)
      b.rotation.y = (rng() - 0.5) * 0.16
      this.group.add(b)
      boards.push(b)
    }
    pool(boards, SPEED, -88, 88)

    // scrub + cacti, mid ground
    const scrubs = []
    for (let i = 0; i < 12; i++) {
      const s = makeScrub(rng)
      s.position.set(-65 + i * 10.8 + (rng() - 0.5) * 5, 0, -9 - rng() * 8)
      this.group.add(s)
      scrubs.push(s)
    }
    pool(scrubs, SPEED, -65, 65)

    // distant mountains — placed near, moved slow: honest 2002 parallax
    const peaks = []
    for (let i = 0; i < 8; i++) {
      const m = makeMountain(rng)
      m.position.set(-84 + i * 21 + (rng() - 0.5) * 8, 0, -42 - rng() * 12)
      this.group.add(m)
      peaks.push(m)
    }
    pool(peaks, SPEED * 0.24, -88, 88)

    this.addUpdater((dt) => {
      for (const p of this._pools) {
        const d = p.speed * dt
        for (const it of p.items) {
          it.position.x -= d
          if (it.position.x < p.minX) it.position.x += p.range
        }
      }
    })

    // wind streaks whipping across the roof
    const nStreaks = Math.max(5, Math.round(12 * ps))
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xfff2dc, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const streakGeo = new THREE.BoxGeometry(1.8, 0.03, 0.03)
    this._streaks = []
    for (let i = 0; i < nStreaks; i++) {
      const s = new THREE.Mesh(streakGeo, streakMat)
      s.position.set((rng() - 0.5) * 32, 0.4 + rng() * 2.8, (rng() - 0.5) * 5)
      s.scale.x = 0.7 + rng() * 1.2
      this.group.add(s)
      this._streaks.push({ mesh: s, speed: SPEED * (1.6 + rng() * 0.8) })
    }
    this.addUpdater((dt) => {
      for (const s of this._streaks) {
        s.mesh.position.x -= s.speed * dt
        if (s.mesh.position.x < -16) {
          s.mesh.position.set(16 + rng() * 4, 0.4 + rng() * 2.8, (rng() - 0.5) * 5)
          s.speed = SPEED * (1.6 + rng() * 0.8)
        }
      }
    })

    // chimney smoke — puffs sail back from the funnel clean over the fight
    const nPuffs = Math.max(4, Math.round(9 * ps))
    this._puffs = []
    for (let i = 0; i < nPuffs; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xefe8dc, flatShading: true, transparent: true, opacity: 0 })
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), mat)
      this.group.add(puff)
      this._puffs.push({ mesh: puff, mat, t: (i / nPuffs), dur: 2.3, wobble: rng() * Math.PI * 2 })
    }
    this.addUpdater((dt) => {
      for (const p of this._puffs) {
        p.t += dt / p.dur
        if (p.t >= 1) { p.t = 0; p.wobble = rng() * Math.PI * 2 }
        const k = p.t
        p.mesh.position.set(
          this._funnelTip.x - k * 26,
          this._funnelTip.y + 0.4 + k * 2.8 + Math.sin(this._time * 2 + p.wobble) * 0.15,
          Math.sin(p.wobble + k * 2) * 0.8
        )
        p.mesh.scale.setScalar(0.5 + k * 2.1)
        p.mat.opacity = 0.7 * (1 - k) * Math.min(1, k * 8)
      }
    })
  }

  _buildCrowds() {
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const nDeck = Math.min(12, Math.max(4, Math.round(total * 0.3)))
    const nParty = Math.max(8, total - nDeck)
    const rng = this._rng

    // party car: one packed row of heads poking out of the window strip
    const party = buildCrowd({
      count: nParty, area: { w: 18.5, d: 0.8 }, palette: PASSENGER_PALETTE,
      rng, risers: false, bounce: 0.24,
    })
    party.group.position.set(0, -1.75, 0.9) // local to the party car
    this._partyCar.add(party.group)

    // caboose observation deck, facing the fight up ahead
    const deck = buildCrowd({
      count: nDeck, area: { w: 3.6, d: 1.0 }, palette: PASSENGER_PALETTE,
      rng, risers: false, bounce: 0.3,
    })
    deck.group.position.set(0.8, -0.55, 0)
    deck.group.rotation.y = Math.PI / 2 // local +Z -> world +X
    this._caboose.add(deck.group)

    this._crowds = [party, deck]
    for (const c of this._crowds) this.addUpdater((dt) => c.update(dt))
  }

  // -- TUNNEL (pure visual): lights dive, beams whoosh overhead -------------

  _buildTunnel() {
    // sweeping roof beams, parked invisible until the darkness hits.
    // Every beam carries a lamp + a warm light pool on the wall and a support
    // rib, so the interior has a ~0.4 s visual rhythm and reads as a tunnel
    // even in a paused frame — not a rendering dropout.
    this._tunnelBeams = []
    const beamMat = flatMat(0x1c1712)
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xd98a3c })
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xd98a3c, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const glowGeo = new THREE.PlaneGeometry(2.8, 2.4)
    for (let i = 0; i < 9; i++) {
      const bg = new THREE.Group()
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 12), beamMat)
      beam.position.y = 3.15
      bg.add(beam)
      // support rib against the back wall — structure between the lamps
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.6, 0.55), beamMat)
      rib.position.set(0, 1.4, -5.2)
      bg.add(rib)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), lampMat)
      lamp.position.y = 2.8
      bg.add(lamp)
      // lamp pool washing the tunnel wall
      const glow = new THREE.Mesh(glowGeo, glowMat)
      glow.position.set(0, 2.1, -5.25)
      bg.add(glow)
      bg.position.x = -30 + i * 6.7
      bg.visible = false
      this.group.add(bg)
      this._tunnelBeams.push(bg)
    }
    // rock wall swallowing the far side — streaked, with a rushed tag, so a
    // screenshot inside the tunnel still shows a surface
    const wallTex = canvasTexture(512, 96, (c, W, H) => {
      c.fillStyle = '#14100e'
      c.fillRect(0, 0, W, H)
      for (let i = 0; i < 46; i++) {
        const y = (i * 37) % H
        c.fillStyle = `rgba(${60 + (i * 13) % 40}, ${52 + (i * 7) % 34}, ${44 + (i * 11) % 30}, 0.22)`
        c.fillRect((i * 89) % W, y, 30 + (i * 53) % 130, 2)
      }
      c.font = '900 26px "Arial Black", Arial, sans-serif'
      c.fillStyle = 'rgba(217, 138, 60, 0.3)'
      c.fillText('WAGMI', 92, 62)
      c.fillStyle = 'rgba(120, 200, 160, 0.24)'
      c.fillText('SER?', 356, 44)
    })
    wallTex.wrapS = THREE.RepeatWrapping
    wallTex.repeat.set(6, 1)
    this._tunnelWall = new THREE.Mesh(
      new THREE.BoxGeometry(90, 8.5, 0.6),
      new THREE.MeshBasicMaterial({ map: wallTex, transparent: true, opacity: 0 })
    )
    this._tunnelWall.position.set(0, 0.6, -5.6)
    this._tunnelWall.visible = false
    this._tunnelWallTex = wallTex
    this.group.add(this._tunnelWall)

    this._tunnel = { phase: 'idle', timer: 9 + this._rng() * 5, t: 0, fade: 0 }

    this.addUpdater((dt) => this._updateTunnel(dt))
  }

  _updateTunnel(dt) {
    const tn = this._tunnel
    if (tn.phase === 'idle') {
      tn.timer -= dt
      // wait for the bridge to clear the stage before going dark
      if (tn.timer <= 0 && !this._bridge.active) {
        tn.phase = 'in'
        tn.t = 0
        this.sfx('whoosh', { vol: 0.9, pitch: 0.55 })
        this.emit('camera:shake', { mag: 0.18 })
        this.emit('arena:tunnel', { phase: 'enter' })
        for (const b of this._tunnelBeams) b.visible = true
        this._tunnelWall.visible = true
      }
    } else if (tn.phase === 'in') {
      tn.t += dt / 0.25
      tn.fade = Math.min(1, tn.t)
      if (tn.t >= 1) { tn.phase = 'hold'; tn.t = 0 }
    } else if (tn.phase === 'hold') {
      tn.t += dt
      tn.fade = 1
      if (tn.t >= 1.0) { tn.phase = 'out'; tn.t = 0 } // ~1.6s inside overall
    } else if (tn.phase === 'out') {
      tn.t += dt / 0.35
      tn.fade = Math.max(0, 1 - tn.t)
      if (tn.t >= 1) {
        tn.phase = 'idle'
        tn.timer = 19 + this._rng() * 8
        tn.fade = 0
        for (const b of this._tunnelBeams) b.visible = false
        this._tunnelWall.visible = false
        this.sfx('whoosh', { vol: 0.7, pitch: 0.7 })
        this.emit('arena:tunnel', { phase: 'exit' })
      }
    }

    // apply every frame — the final f=0 write restores the base look exactly
    const f = tn.fade
    this._rig.hemi.intensity = this._lightBase.hemi * (1 - 0.75 * f)
    this._rig.sun.intensity = this._lightBase.sun * (1 - 0.85 * f)
    this._rig.fill.intensity = this._lightBase.fill * (1 - 0.6 * f)
    this._skyMat.color.setScalar(1 - 0.82 * f)
    const fog = this.scene?.fog
    if (fog && this._fogBase) {
      fog.color.copy(this._fogBase.color).multiplyScalar(1 - 0.86 * f)
      fog.near = THREE.MathUtils.lerp(this._fogBase.near, 9, f)
      fog.far = THREE.MathUtils.lerp(this._fogBase.far, 24, f)
    }
    this._tunnelWall.material.opacity = 0.95 * f
    // beams whoosh overhead; the wall streaks slide so motion reads in stills
    if (f > 0.02) {
      for (const b of this._tunnelBeams) {
        b.position.x -= SPEED * 1.15 * dt
        if (b.position.x < -30) b.position.x += 60
      }
      this._tunnelWallTex.offset.x = (this._tunnelWallTex.offset.x + (dt * SPEED * 1.15) / 15) % 1
    }
  }

  // -- HAZARD: the LOW BRIDGE -----------------------------------------------

  _buildBridge() {
    const { group, lampMats } = makeBridgeGantry()
    group.visible = false
    this.group.add(group)
    this._bridge = {
      group, lampMats,
      active: false,
      timer: 6 + this._rng() * 2,   // first pass arrives fashionably early
      x: 46, warned: false, whooshed: false, captioned: false,
      hit: new Set(),
    }
    this.addUpdater((dt) => this._updateBridge(dt))
  }

  _updateBridge(dt) {
    const br = this._bridge

    if (!br.active) {
      br.timer -= dt
      for (const m of br.lampMats) m.color.setHex(0x662a10)
      // hold the sweep while the tunnel owns the sky
      if (br.timer <= 0 && this._tunnel.phase === 'idle') {
        br.active = true
        br.group.visible = true
        br.x = 46
        br.warned = false
        br.whooshed = false
        br.captioned = false
        br.hit.clear()
      }
      return
    }

    const prevX = br.x
    br.x -= SPEED * dt
    br.group.position.x = br.x

    // warning: horn + caption while it is still bearing down
    if (!br.warned && br.x <= 26) {
      br.warned = true
      this.sfx('trumpet', { vol: 0.85, pitch: 0.5 })
      this.emit('caption', { text: 'DUCK!' })
      this.emit('arena:lowbridge', { phase: 'warn', x: br.x })
      try { this.audio?.crowd?.('gasp') } catch (e) { /* passengers brace quietly */ }
    }
    if (br.warned) {
      // frantic lamp blink
      const on = (this._time % 0.3) < 0.15
      for (const m of br.lampMats) m.color.setHex(on ? 0xffa23c : 0x662a10)
    }

    // the beam thunders over center stage
    if (!br.whooshed && prevX > 0 && br.x <= 0) {
      br.whooshed = true
      this.sfx('whoosh', { vol: 0.6, pitch: 1.25 })
      this.emit('camera:shake', { mag: 0.12 })
    }

    // clothesline anyone who forgot to duck
    const { fighters, phase } = this._getFighters()
    if (phase === 'fight') {
      for (const f of fighters) {
        if (!f || br.hit.has(f)) continue
        const px = f.pos?.x
        if (typeof px !== 'number' || !(prevX >= px && br.x <= px)) continue
        if (BONK_SKIP.has(f.state)) continue
        const crouched = f.state === 'crouch' || (f.ctrl?.isDown?.('crouch') && f.grounded?.())
        const above = (f.pos.y ?? 0) > BRIDGE_TOP
        if (crouched || above) { // survived — the crowd approves
          for (const c of this._crowds) c.cheer(0.6)
          continue
        }
        br.hit.add(f)
        this._bonk(f)
      }
    }

    if (br.x < -46) {
      br.active = false
      br.group.visible = false
      br.timer = 3.4 + this._rng() * 1.6   // full cycle lands around ~10s
    }
  }

  _bonk(f) {
    // §17 ownership: a full-ragdolled fighter's bones belong to the ragdoll
    // driver — never state-flip it (BONK_SKIP guards the caller; this guards
    // the helper itself so no future call site can violate the contract).
    if (f?.state === 'ragdoll') return
    // small dmg + knockdown, never a KO — the bridge settles, it does not kill
    try {
      const dmg = Math.min(BRIDGE_DMG, Math.max(0, (f.hp ?? 1) - 1))
      if (dmg > 0) f.setHp?.(f.hp - dmg)
      if (typeof f.enterLaunched === 'function') {
        f.enterLaunched(-(6.5 + this._rng() * 2), 4.4, 1.4)
      } else {
        if (f.vel) { f.vel.x = -7; f.vel.y = 4.4 }
        f.tumbleRate = 5
        f.setState?.('launched')
      }
      f.squash?.(-0.35)
      f.flash?.()
    } catch (e) { /* fighter API drift — the bonk stays visual */ }
    this.sfx('thud', { vol: 1, pitch: 0.8 })
    this.sfx('boing', { vol: 0.5, pitch: 0.9 })
    this.emit('camera:shake', { mag: 0.5 })
    this.emit('arena:lowbridge', { phase: 'hit', slot: f.slot })
    for (const c of this._crowds) c.cheer(2)
    try { this.audio?.crowd?.('wild') } catch (e) { /* muffled by the wind */ }
    if (!this._bridge.captioned) {
      this._bridge.captioned = true
      this.emit('caption', { text: BONK_LINES[this._bonkLine++ % BONK_LINES.length] })
    }
    if (!this._bonkAnnounced) {
      this._bonkAnnounced = true
      this.emit('announcer', { line: 'SETTLED. PERMANENTLY.' })
    }
  }

  // Best-effort access to the live fighters (combat owns them; stay defensive).
  _getFighters() {
    try {
      const scr = this.physics?.game?.screens?.current
      if (scr && Array.isArray(scr.fighters) && scr.fighters[0]?.pos) {
        return { fighters: scr.fighters, phase: scr.phase ?? 'fight' }
      }
    } catch (e) { /* combat internals unavailable — hazard stays visual */ }
    return { fighters: [], phase: null }
  }

  // -- breakables on the roof edges -----------------------------------------

  _buildProps() {
    const rng = this._rng
    const shadows = !!this.quality.shadows
    const place = (mesh, x, z, ry, opts) => {
      mesh.position.set(x, mesh.position.y, z)
      mesh.rotation.y = ry
      if (shadows) mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(mesh)
      this.addBreakable(mesh, opts)
      this._tagCornerFade(mesh)
    }

    // v2.0 free-roam: cargo scatters across the (narrow) roof deck — center
    // lane kept mostly clear, everything within the ±3.2 z rails.

    // cargo crates — a stack and a loner, all strapped down badly
    const c1 = makeCrateMesh(0.7, { label: 'SETTLED' }); c1.position.y = 0.35
    const c2 = makeCrateMesh(0.6, { label: 'PENDING', color: '#a8763c' }); c2.position.y = 0.7 + 0.3
    const c3 = makeCrateMesh(0.66, { label: 'BONK', color: '#d49b56' }); c3.position.y = 0.33
    place(c1, 6.4, 2.1, 0.25, { shape: 'box', mass: 3.5, health: 13, kind: 'crate' })
    place(c2, 6.45, 2.08, -0.4, { shape: 'box', mass: 2.5, health: 10, kind: 'crate' })
    place(c3, -5.6, -2.2, -0.3, { shape: 'box', mass: 3, health: 12, kind: 'crate' })

    // mail sacks — federal property, extremely swattable
    place(makeMailSack(rng, 'MAIL'), -7.4, 1.9, 0.4, { shape: 'sphere', mass: 3, health: 11, kind: 'mailSack' })
    place(makeMailSack(rng, '$BONK'), 4.1, -2.4, -0.8, { shape: 'sphere', mass: 3, health: 11, kind: 'mailSack' })

    // the dining cart, en route to first class, doomed
    place(makeDiningCart(), -3.4, 2.4, 0.35, { shape: 'box', mass: 6, health: 22, kind: 'diningCart' })
  }

  // The corner dressing lives exactly where an edge-pinned clinch ends up:
  // when the camera is wall-clamped, these props can eclipse both fighters
  // for seconds at a time. Tag every mesh for the fades — userData.cameraFade
  // feeds the replay near-lens path, and _updatePropFades runs the live
  // occlusion fade (mirrors permanentReserveCore's beam fade).
  _tagCornerFade(root) {
    const mats = []
    root.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return
      o.material.transparent = true // opacity 1 until a fade actually bites
      o.userData.cameraFade = 2.4
      mats.push(o.material)
    })
    if (mats.length) this._fadeProps.push({ root, mats, k: 1 })
  }

  // Fade any tagged prop sitting on the camera->fighter sightline to ~15%
  // so an edge-pinned fight reads THROUGH the corner clutter.
  _updatePropFades(dt) {
    const cam = this._camera
    const list = this._fadeProps
    if (!cam?.position || !list.length) return
    const { fighters } = this._getFighters()
    for (const fp of list) {
      if (!fp.root.parent) continue // broken/culled — leave it be
      let occludes = false
      if (fighters.length) {
        fp.root.getWorldPosition(this._fadeV)
        for (const f of fighters) {
          if (!f?.pos) continue
          this._fadeA.set(f.pos.x, (f.pos.y || 0) + 1.0, f.pos.z ?? 0) // chest height
          if (this._segDist(this._fadeV, cam.position, this._fadeA) < 1.15) {
            occludes = true
            break
          }
        }
      }
      const target = occludes ? 0.15 : 1
      fp.k += (target - fp.k) * Math.min(1, dt * 7)
      if (Math.abs(fp.k - target) < 0.01) fp.k = target
      for (const m of fp.mats) m.opacity = fp.k
    }
  }

  // Distance from point p to the segment a-b (all THREE.Vector3-likes).
  _segDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
    const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z
    const len2 = abx * abx + aby * aby + abz * abz
    const t = len2 > 1e-8
      ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2)) : 0
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  setCamera(camera) { this._camera = camera || null }

  // -- crowd + comedy wiring ------------------------------------------------

  _wireEvents() {
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.25 + Math.min(0.8, combo * 0.07) + (e?.counter ? 0.4 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.2) })
    this.listen('fighter:ko', () => {
      for (const c of this._crowds) c.cheer(3)
      this.sfx('trumpet', { vol: 0.9, pitch: 0.35 }) // long mournful KO horn
    })
    this.listen('round:end', () => { for (const c of this._crowds) c.cheer(2) })
    this.listen('physics:break', (e) => {
      if (e?.kind === 'mailSack') this.emit('caption', { text: 'RETURN TO SENDER' })
      else if (e?.kind === 'diningCart') this.emit('caption', { text: 'TEA SERVICE CANCELLED' })
      for (const c of this._crowds) c.cheer(0.8)
    })
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt
    super.update(dt)
    this._updatePropFades(dt)

    // rhythmic rail clacks, quiet enough to live under the music
    this._clackT -= dt
    if (this._clackT <= 0) {
      this._clackT = 1.06
      this.sfx('thud', { vol: 0.09, pitch: 1.9 })
      this._clack2 = 0.09
    }
    if (this._clack2 !== null) {
      this._clack2 -= dt
      if (this._clack2 <= 0) { this._clack2 = null; this.sfx('thud', { vol: 0.07, pitch: 1.7 }) }
    }

    // the engineer toots for morale
    this._hornT -= dt
    if (this._hornT <= 0) {
      this._hornT = 16 + this._rng() * 9
      if (!this._bridge.active) this.sfx('trumpet', { vol: 0.35, pitch: 0.42 })
    }
  }

  onRagdollLaunch(fighter) {
    try { this.audio?.crowd?.('wild') } catch (e) { /* lost in the wind */ }
    for (const c of this._crowds) c.cheer(2.2)
    this.sfx('trumpet', { vol: 0.3, pitch: 0.55 }) // the horn salutes the yeet
    if (this.physics?.presetName === 'unhinged') {
      // passengers duck back inside their windows in a panic
      for (const c of this._crowds) c.knockOverRandom(2 + Math.floor(this._rng() * 4))
      this.sfx('boing', { vol: 0.45 })
    }
    void fighter
  }
}

export const SettlementExpress = {
  id: 'settlement-express',
  name: 'SETTLEMENT EXPRESS',
  music: 'battle_settlement_express',
  build(ctx) { return new SettlementExpressArena(ctx) },
}
