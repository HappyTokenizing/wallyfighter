// ============================================================================
// MEME MARKET — the tutorial arena. A blindingly optimistic early-2000s
// trading plaza: checkerboard floor, pastel buildings, GIANT candlestick
// billboards, a rocket statue frozen mid-launch, and a crowd of traders who
// have never once considered selling.
//
// v2.0 free-roam: the fight floor is the open XZ plaza (|X| <= 9, |Z| <= 5.5)
// with physics walls on all four sides. Decorative dressing stays outside the
// playfield; breakables + corner bell hazards live on it. See CONTRACTS §9/§17.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, makeCandlestickChart, makeCoinMesh, makeCrateMesh, buildCrowd,
  CROWD_PALETTE,
} from './ArenaBase.js'

// ---------------------------------------------------------------------------
// module-private mesh factories
// ---------------------------------------------------------------------------

function makePlazaTexture(rng) {
  // 8x8 tiles per canvas, repeated across the plaza. Big fat texels.
  const TILES = 8, TP = 64
  return canvasTexture(TILES * TP, TILES * TP, (c, W, H) => {
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        const even = (tx + ty) % 2 === 0
        const jitter = (rng() - 0.5) * 14
        // darkened + cooled ~15% so brown/tan fighters pop off the floor
        const base = even ? [158 + jitter, 197 + jitter, 180 + jitter] : [199 + jitter, 203 + jitter, 197 + jitter]
        c.fillStyle = `rgb(${base.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`
        c.fillRect(tx * TP, ty * TP, TP, TP)
        // grout
        c.strokeStyle = 'rgba(48,74,66,0.42)'
        c.lineWidth = 3
        c.strokeRect(tx * TP + 1.5, ty * TP + 1.5, TP - 3, TP - 3)
        // the occasional aspirational dollar tile
        if (rng() < 0.07) {
          c.fillStyle = 'rgba(188,144,40,0.8)'
          c.fillRect(tx * TP + 6, ty * TP + 6, TP - 12, TP - 12)
          c.font = `900 ${TP * 0.55}px "Arial Black", Arial, sans-serif`
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.fillStyle = 'rgba(120,80,10,0.9)'
          c.fillText('$', tx * TP + TP / 2, ty * TP + TP / 2 + 2)
        }
      }
    }
  }, { repeat: [2.75, 1.625] })
}

function makeBuildingTexture(rng, baseColor, litColor = '#ffe98a') {
  return canvasTexture(96, 192, (c, W, H) => {
    c.fillStyle = baseColor
    c.fillRect(0, 0, W, H)
    // storefront band
    c.fillStyle = 'rgba(20,30,55,0.55)'
    c.fillRect(0, H - 34, W, 34)
    c.fillStyle = 'rgba(255,240,190,0.75)'
    c.fillRect(8, H - 28, 26, 22) // glowing shop window
    c.fillStyle = 'rgba(30,40,70,0.9)'
    c.fillRect(W - 30, H - 26, 18, 26) // door
    // window grid
    const cols = 4, rows = 6
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const wx = 8 + x * ((W - 16) / cols) + 2
        const wy = 10 + y * ((H - 52) / rows) + 2
        c.fillStyle = rng() < 0.55 ? litColor : 'rgba(35,48,84,0.95)'
        c.fillRect(wx, wy, (W - 16) / cols - 8, (H - 52) / rows - 10)
      }
    }
    // roof trim
    c.fillStyle = 'rgba(255,255,255,0.28)'
    c.fillRect(0, 0, W, 6)
  })
}

function makeBuilding(rng, { w, h, d, color }) {
  const tex = makeBuildingTexture(rng, color)
  const side = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  const roof = flatMat(new THREE.Color(color).offsetHSL(0, -0.08, -0.22))
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side])
  mesh.position.y = h / 2
  const g = new THREE.Group()
  g.add(mesh)
  if (rng() < 0.6) { // rooftop antenna, for broadcasting hopium
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 5), flatMat(0x8a939e))
    pole.position.set((rng() - 0.5) * w * 0.5, h + 1.1, 0)
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), flatMat(0xff4d5e))
    blob.position.set(pole.position.x, h + 2.25, 0)
    g.add(pole, blob)
  }
  return g
}

function makeAwningTexture(colA, colB) {
  return canvasTexture(128, 64, (c, W, H) => {
    const n = 8
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 === 0 ? colA : colB
      c.fillRect((W / n) * i, 0, W / n + 1, H)
    }
    c.fillStyle = 'rgba(0,0,0,0.12)'
    c.fillRect(0, H - 10, W, 10)
  })
}

function makeStall(rng, opts = {}) {
  const g = new THREE.Group()
  g.name = 'stall'
  // grey-brown lumber — warm enough to read as wood, cool enough that the
  // brown fighters (Dogey, Cool Pal, Tired Ape) separate from the set
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 1.0), flatMat(opts.base ?? 0x8f7355))
  counter.position.y = 0.475
  g.add(counter)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 1.12), flatMat(0xd8d1bd))
  top.position.y = 0.99
  g.add(top)
  const postMat = flatMat(0x5b4a33)
  for (const sx of [-0.78, 0.78]) {
    for (const sz of [-0.44, 0.44]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.9, 0.09), postMat)
      post.position.set(sx, 0.95, sz)
      g.add(post)
    }
  }
  const awnTex = makeAwningTexture(opts.awnA ?? '#e0484f', opts.awnB ?? '#f4f0e3')
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.35), new THREE.MeshLambertMaterial({ map: awnTex, flatShading: true }))
  awning.position.set(0, 1.98, 0.1)
  awning.rotation.x = -0.24
  g.add(awning)
  if (opts.sign) {
    const s = makeSign(opts.sign, {
      w: 1.5, h: 0.45, depth: 0.08, px: 72, bg: '#20315e', fg: '#ffe14d',
      ...(opts.signOpts || {}),
    })
    s.position.set(0, 1.42, 0.56)
    g.add(s)
    g.userData.sign = s
  }
  // merch: a couple of tiny coins on the counter
  for (let i = 0; i < 2; i++) {
    const coin = makeCoinMesh(0.14, 0.05, { px: 48 })
    coin.rotation.x = -Math.PI / 2
    coin.position.set(-0.4 + i * 0.7 + (rng() - 0.5) * 0.2, 1.06, (rng() - 0.5) * 0.4)
    g.add(coin)
  }
  return g
}

function makeVendingMachine() {
  const face = canvasTexture(96, 192, (c, W, H) => {
    c.fillStyle = '#d13b47'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#8f1f2a'
    c.fillRect(0, 0, W, 6)
    c.font = `900 17px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'
    c.fillStyle = '#ffe14d'
    c.fillText('BUY HIGH', W / 2, 24)
    // glowing product window
    c.fillStyle = '#1b2743'
    c.fillRect(8, 34, W - 16, 86)
    const colors = ['#37e05f', '#ffb63c', '#3fbcd4', '#e05e9e', '#ff4d5e', '#b9a6e0']
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = colors[(r * 4 + i) % colors.length]
        c.fillRect(13 + i * 19, 40 + r * 27, 13, 20)
      }
    }
    c.fillStyle = '#ffe14d'
    c.fillText('SELL LOW', W / 2, 140)
    // coin slot + dispenser
    c.fillStyle = '#2b2b2b'
    c.fillRect(W - 26, 150, 14, 20)
    c.fillStyle = '#f5c33b'
    c.fillRect(W - 23, 156, 8, 3)
    c.fillStyle = '#101010'
    c.fillRect(10, 158, 44, 22)
  })
  const body = flatMat(0xa02833)
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.9, 0.7),
    [body, body, body, body, new THREE.MeshLambertMaterial({ map: face, flatShading: true }), body]
  )
  mesh.position.y = 0.95
  const g = new THREE.Group()
  g.name = 'vendingMachine'
  g.add(mesh)
  return g
}

function makeMonitorStack(rng) {
  const g = new THREE.Group()
  g.name = 'monitorStack'
  const screens = [
    makeCandlestickChart(128, 96, { rng, candles: 12, header: '$HOPE' }).texture,
    canvasTexture(128, 96, (c, W, H) => {
      c.fillStyle = '#1040c8'
      c.fillRect(0, 0, W, H)
      c.fillStyle = '#ffffff'
      c.font = '700 13px monospace'
      c.textAlign = 'center'
      c.fillText('ERROR 404', W / 2, 34)
      c.fillText('GAINS NOT', W / 2, 52)
      c.fillText('FOUND', W / 2, 68)
    }),
    makeCandlestickChart(128, 96, { rng, candles: 10, header: '$COPE' }).texture,
  ]
  for (let i = 0; i < 3; i++) {
    const shell = flatMat(0xd8d3c3)
    const screen = new THREE.MeshBasicMaterial({ map: screens[i] })
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.56), [shell, shell, shell, shell, screen, shell])
    m.position.set((rng() - 0.5) * 0.16, 0.25 + i * 0.5, (rng() - 0.5) * 0.1)
    m.rotation.y = (rng() - 0.5) * 0.5
    g.add(m)
  }
  return g
}

function makeBellPost(side) {
  // side: -1 (left wall) or +1 (right wall). Post sits just behind the fight
  // plane; the bell hangs off an arm poking toward it.
  const g = new THREE.Group()
  g.name = 'bellPost'
  const postMat = flatMat(0x5b4a33)
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.1, 0.18), postMat)
  post.position.y = 1.55
  g.add(post)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.95), postMat)
  arm.position.set(0, 3.0, 0.42)
  g.add(arm)
  const plaque = makeSign('RING 4 GAINS', { w: 0.95, h: 0.3, depth: 0.06, px: 72, bg: '#5a3413', fg: '#ffe14d', border: '#ffe14d' })
  plaque.position.set(0, 1.35, 0.14)
  g.add(plaque)
  // bell pivot hangs from the arm tip
  const pivot = new THREE.Group()
  pivot.position.set(0, 2.94, 0.82)
  const gold = flatMat(0xf5c33b)
  const goldDark = flatMat(0xd9a325)
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.34, 0.42, 8), gold)
  cup.position.y = -0.26
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.1, 8), goldDark)
  lip.position.y = -0.5
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), goldDark)
  knob.position.y = -0.02
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), flatMat(0x5a5a66))
  clapper.position.y = -0.62
  pivot.add(cup, lip, knob, clapper)
  g.add(pivot)
  return { group: g, pivot }
}

function makeRocket(rng, particleScale) {
  const g = new THREE.Group()
  g.name = 'rocketStatue'
  // launch pad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.9, 0.6, 10), flatMat(0x7a8291))
  pad.position.y = 0.3
  g.add(pad)
  // the rocket itself, frozen mid-launch (i.e. permanently "about to moon")
  const rocket = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.5, 10), flatMat(0xf2f0e8))
  body.position.y = 2.75
  rocket.add(body)
  const bandTex = canvasTexture(512, 64, (c, W, H) => {
    c.fillStyle = '#f5c33b'
    c.fillRect(0, 0, W, H)
    c.font = `900 34px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#132a63'
    c.fillText('WALLYX  ·  WEN MOON  ·  WALLYX', W / 2, H / 2 + 2)
  })
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.7, 10, 1, true), new THREE.MeshLambertMaterial({ map: bandTex, flatShading: true }))
  band.position.y = 3.1
  rocket.add(band)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.12, 2.2, 10), flatMat(0xe0484f))
  nose.position.y = 6.6
  rocket.add(nose)
  const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 8), flatMat(0x3fbcd4))
  window_.rotation.x = Math.PI / 2
  window_.position.set(0, 4.4, 1.06)
  rocket.add(window_)
  const finMat = flatMat(0xe0484f)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.1), finMat)
    fin.position.set(Math.cos(a) * 1.25, 0.6, Math.sin(a) * 1.25)
    fin.rotation.y = -a
    fin.rotation.z = 0.18
    rocket.add(fin)
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 0.6, 8), flatMat(0x5a5a66))
  nozzle.position.y = -0.3
  rocket.add(nozzle)
  rocket.position.y = 2.6
  rocket.rotation.z = -0.1 // a confident lean
  g.add(rocket)

  // smoke puffs looping out of the nozzle
  const puffs = []
  const nPuffs = Math.max(3, Math.round(8 * (particleScale ?? 1)))
  for (let i = 0; i < nPuffs; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xe8e6df, flatShading: true, transparent: true, opacity: 0.9 })
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 5), mat)
    const angle = rng() * Math.PI * 2
    puffs.push({
      mesh: puff, mat,
      t: rng(),
      dur: 1.3 + rng() * 1.1,
      angle,
      drift: 0.9 + rng() * 1.4,
    })
    g.add(puff)
  }
  let t = rng() * 10
  const update = (dt) => {
    t += dt
    rocket.position.y = 2.6 + Math.sin(t * 0.9) * 0.16
    rocket.rotation.z = -0.1 + Math.sin(t * 0.6) * 0.015
    for (const p of puffs) {
      p.t += dt / p.dur
      if (p.t >= 1) {
        p.t = 0
        p.angle = rng() * Math.PI * 2
        p.drift = 0.9 + rng() * 1.4
      }
      const k = p.t
      const spread = 0.5 + k * p.drift
      p.mesh.position.set(Math.cos(p.angle) * spread, Math.max(0.45, 2.1 - k * 1.7), Math.sin(p.angle) * spread * 0.7)
      const s = 0.5 + k * 1.6
      p.mesh.scale.setScalar(s)
      p.mat.opacity = 0.85 * (1 - k * k)
    }
  }
  return { group: g, update }
}

function makeBarrier(length) {
  const tex = canvasTexture(256, 48, (c, W, H) => {
    c.fillStyle = '#e8b13c'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#20242c'
    for (let x = -H; x < W + H; x += 36) {
      c.beginPath()
      c.moveTo(x, H); c.lineTo(x + 18, 0); c.lineTo(x + 34, 0); c.lineTo(x + 16, H)
      c.closePath(); c.fill()
    }
    c.font = `900 20px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.strokeStyle = '#e8b13c'
    c.lineWidth = 5
    c.strokeText('HODL LINE', W / 2, H / 2)
    c.fillStyle = '#20242c'
    c.fillText('HODL LINE', W / 2, H / 2)
  }, { repeat: [Math.max(1, Math.round(length / 4)), 1] })
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  const g = new THREE.Group()
  g.name = 'barrier'
  const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, 0.1), mat)
  rail.position.y = 0.55
  g.add(rail)
  const footMat = flatMat(0x3a4252)
  const nFeet = Math.max(2, Math.round(length / 4))
  for (let i = 0; i < nFeet; i++) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.4), footMat)
    foot.position.set(-length / 2 + (i + 0.5) * (length / nFeet), 0.31, 0)
    g.add(foot)
  }
  return g
}

// Default crawl; the arena regenerates it from the actual matchup once
// setFighters() hands over the roster.
function tickerCrawl(a = 'WALLY', b = 'DOGEY') {
  const second = a === b ? `${b} STILL +69.42%` : `${b} +69.42%`
  return `  ${a} +420.69%   ${second}   HODL   BUY THE DIP   NGMI - WAGMI   NUMBER GO UP   THIS IS FINANCIAL ADVICE (IT IS NOT)   `
}

function makeTicker(width, height = 0.6) {
  const H = 64
  // thin housed box, not a floating plane: the scroll face is +z, the sides
  // are dark housing, and the caller swaps index 5 (-z back) for the shared
  // vented service-panel material so replay orbits never meet a void
  const housing = flatMat(0x3a414d)
  const faceMat = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.14),
    [housing, housing, housing, housing, faceMat, housing]
  )
  mesh.name = 'ticker'
  let tex = null
  const setMessage = (msg) => {
    const meas = document.createElement('canvas').getContext('2d')
    meas.font = `900 40px "Arial Black", Arial, sans-serif`
    const W = Math.max(256, Math.ceil(meas.measureText(msg).width))
    const old = tex
    tex = canvasTexture(W, H, (c) => {
      c.fillStyle = '#101826'
      c.fillRect(0, 0, W, H)
      c.font = `900 40px "Arial Black", Arial, sans-serif`
      c.textBaseline = 'middle'
      c.fillStyle = '#ffd83d'
      for (const off of [-W, 0, W]) c.fillText(msg, off, H / 2 + 2)
    }, { nearest: false })
    tex.wrapS = THREE.RepeatWrapping
    const worldPerRepeat = height * (W / H)
    tex.repeat.set(width / worldPerRepeat, 1)
    if (old) tex.offset.x = old.offset.x // keep the crawl phase across retitles
    faceMat.map = tex
    faceMat.needsUpdate = true
    old?.dispose?.()
  }
  setMessage(tickerCrawl())
  const update = (dt) => { if (tex) tex.offset.x = (tex.offset.x + dt * 0.05) % 1 }
  return { mesh, update, setMessage }
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

const BELL_LINES = ['DING DING DING!', 'MARKET OPEN!', 'MARGIN CALL!', 'CLOSING BELL! NOBODY SOLD!']

class MemeMarketArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.55 }
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0xc0ffee)
    this._time = 0
    this._launched = []   // { f, ttl } — recently ragdolled fighters, bell candidates
    this._bells = []      // { pivot, x, y, z, side, ang, vel, cool }
    this._bellLine = 0
    this._crowds = []
    this._flickerSigns = []   // 'broken'-style signs, sputtered from update()

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildFloor()
    this._buildBackdrop()
    this._buildCrowds()
    this._buildBells()
    this._buildProps()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction --------------------------------------------------------

  _buildPhysics() {
    // floor slab + invisible bouncy walls on all four sides, inner faces
    // exactly at the bounds (ragdolls and props smack into them; fighters
    // clamp via bounds).
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    // one sun position feeds both the light rig and the painted sky, so the
    // dome's cartoon sun actually sits where the shadows say it is
    const SUN_POS = [10, 17, 9]
    // absurdly optimistic: even the sky trends green
    const sky = buildSkyDome(['#2fb7e8', '#7be8a8', '#d9f7c0', '#fff7b0'], {
      rng: this._rng,
      sunAzimuth: Math.atan2(SUN_POS[2], SUN_POS[0]),
      sunHeight: Math.atan2(SUN_POS[1], Math.hypot(SUN_POS[0], SUN_POS[2])),
    })
    this.group.add(sky)
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xcfffe0, hemiGround: 0x8fbf7a, hemiIntensity: 1.1,
      sunColor: 0xfff2d0, sunIntensity: 1.7, sunPos: SUN_POS,
      fillColor: 0xcfe8ff, fillIntensity: 0.35,
      fog: { color: 0xbfe9c8, near: 34, far: 82 },
      shadowArea: 15,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildFloor() {
    const tex = makePlazaTexture(this._rng)
    const sideMat = flatMat(0x40584a)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 26), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -3)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)
    // endless park beyond the plaza
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), flatMat(0x79a86e))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.32
    this.group.add(ground)
  }

  _buildBackdrop() {
    const rng = this._rng

    // -- pastel skyline, back row
    const backRow = [
      { x: -14.5, w: 7, h: 9, d: 6, color: '#9fd8b0' },
      { x: -7.5, w: 6, h: 12, d: 6, color: '#f0a08a' },
      { x: 0, w: 8, h: 10, d: 6, color: '#8fc3ea' },
      { x: 7.5, w: 6, h: 14, d: 6, color: '#efe3b8' },
      { x: 14.5, w: 7, h: 8, d: 6, color: '#b9a6e0' },
    ]
    for (const b of backRow) {
      const g = makeBuilding(rng, b)
      g.position.set(b.x, 0, -13.5)
      this.group.add(g)
    }
    // side enclosure buildings
    for (const [x, z, ry, color] of [
      [-17.5, -4, Math.PI / 2, '#efc9a0'], [-18, 2, Math.PI / 2, '#a9d6c3'],
      [17.5, -4, -Math.PI / 2, '#e0b7cf'], [18, 2, -Math.PI / 2, '#c3cfa9'],
    ]) {
      const g = makeBuilding(rng, { w: 6, h: 8 + rng() * 5, d: 6, color })
      g.position.set(x, 0, z)
      g.rotation.y = ry
      this.group.add(g)
    }

    // shaded service-panel backside shared by every big board up here — the
    // replay orbit may glance behind them, and an unlit near-black slab reads
    // as a broken render, not a jumbotron
    const backTex = canvasTexture(256, 144, (c, W, H) => {
      c.fillStyle = '#525a68'
      c.fillRect(0, 0, W, H)
      c.strokeStyle = '#3a414d'
      c.lineWidth = 3
      for (const x of [W * 0.33, W * 0.66]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke() }
      c.strokeRect(4, 4, W - 8, H - 8)
      c.fillStyle = '#454c59'
      for (let i = 0; i < 6; i++) c.fillRect(16, 18 + i * 9, 44, 5) // vent slats
      c.fillStyle = '#6a7382'
      for (const [x, y] of [[W * 0.33 + 10, 14], [W * 0.66 + 10, 14], [W * 0.33 + 10, H - 22], [W * 0.66 + 10, H - 22]]) c.fillRect(x, y, 8, 8)
      c.font = '900 15px "Arial Black", Arial, sans-serif'
      c.fillStyle = '#8b93a3'
      c.fillText('MEMEVISION 2000', W * 0.38, H - 16)
    })
    const backMat = new THREE.MeshLambertMaterial({ map: backTex, flatShading: true })

    // -- MEME MARKET marquee on the central tower
    // (marquee + ticker ride ~1.5 units above their old spots: at the default
    // fight camera the old ticker height sat exactly behind the HUD's top
    // strip, scrolling text through the round timer — up here the HUD strip
    // sits over quiet sky instead)
    const marquee = makeSign('MEME MARKET', { w: 7.5, h: 1.9, depth: 0.3, bg: '#132a63', fg: '#ffd83d', sub: 'EST. WHENEVER · UP ONLY', px: 80 })
    marquee.material[5] = backMat // -z back face: vented panel, not a navy slab
    marquee.position.set(0, 9.7, -10.3)
    marquee.rotation.x = -0.06
    this.group.add(marquee)

    // -- LED ticker under the marquee
    const ticker = makeTicker(14, 0.62)
    ticker.mesh.material[5] = backMat // same service-panel treatment
    ticker.mesh.position.set(0, 8.1, -10.28)
    this.group.add(ticker.mesh)
    this.addUpdater(ticker.update)
    this._ticker = ticker

    // -- NUMBER GO UP — rooftop flag, pointing the only direction it knows
    const nguRig = new THREE.Group()
    nguRig.position.set(5.1, 16.15, -12.8) // pole-top pivot on the tall tower
    nguRig.rotation.y = -0.12
    const nguPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 2.9, 6), flatMat(0x8a939e))
    nguPole.position.y = -0.75 // base rests on the 14 m rooftop
    const nguFinial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), flatMat(0xf5c33b))
    nguFinial.position.y = 0.72
    const ngu = makeSign('NUMBER GO UP', { style: 'flag', w: 5.4, h: 1.3, bg: '#0b3d22', fg: '#37e05f', border: '#37e05f' })
    ngu.position.x = 2.7 // hoist at the pole, cloth streaming right
    nguRig.add(nguPole, nguFinial, ngu)
    this.group.add(nguRig)
    this.addUpdater(() => {
      ngu.userData.wave?.(this._time)
      nguRig.rotation.y = -0.12 + Math.sin(this._time * 0.5) * 0.05 // lazy wind shifts
    })

    // -- WEN LAMBO — bobbing neon pole sign, left side (dealership energy)
    const lambo = makeSign('WEN LAMBO', { style: 'neon', w: 3.4, h: 1.0, depth: 0.16, bg: '#170b20', fg: '#ffa8f2', border: '#e05ecf', px: 80 })
    const lamboPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), flatMat(0x8a939e))
    lamboPole.position.set(-11.8, 2.2, -4.6)
    lambo.position.set(-11.8, 4.7, -4.6)
    lambo.rotation.y = 0.22
    this.group.add(lamboPole, lambo)
    const lamboBaseY = lambo.position.y
    this.addUpdater((dt) => {
      lambo.position.y = lamboBaseY + Math.sin(this._time * 1.3) * 0.14
      lambo.rotation.y = 0.22 + Math.sin(this._time * 0.7) * 0.08
      lambo.rotation.z = Math.sin(this._time * 0.9 + 1) * 0.03
    })

    // -- GIANT candlestick billboards flanking the plaza
    const chartDefs = [
      { x: -6.8, ry: 0.16, header: '$WALLY / USD' },
      { x: 6.8, ry: -0.16, header: '$DOGEY / USD' },
    ]
    const charts = []
    // (backMat — the shared MEMEVISION service-panel material — is built above,
    // next to the marquee, so every big board can share it)
    for (const cd of chartDefs) {
      const chart = makeCandlestickChart(512, 288, { rng, header: cd.header })
      charts.push(chart)
      const frame = flatMat(0x20242c)
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(5, 2.8, 0.22),
        [frame, frame, frame, frame, new THREE.MeshBasicMaterial({ map: chart.texture }), backMat]
      )
      board.position.set(cd.x, 4.7, -7.2)
      board.rotation.y = cd.ry
      this.group.add(board)
      for (const off of [-1.8, 1.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), frame)
        leg.position.set(cd.x + off * Math.cos(cd.ry), 1.7, -7.2 + off * Math.sin(cd.ry))
        this.group.add(leg)
      }
    }
    this._charts = charts // left board = slot 0's token, right board = slot 1's
    let chartAcc = 0
    this.addUpdater((dt) => {
      chartAcc += dt
      if (chartAcc >= 0.7) {
        chartAcc = 0
        for (const ch of charts) ch.tick() // number, reliably, goes up
      }
    })

    // -- oversized gold everywhere
    const leaning = makeCoinMesh(2.1, 0.5, { text: 'W', px: 192 })
    leaning.position.set(-12.6, 2.0, -9.6)
    leaning.rotation.set(0.12, 0.5, 0.3)
    this.group.add(leaning)
    const stack = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const coin = makeCoinMesh(1.5 - i * 0.12, 0.36, { text: '$W', px: 160 })
      coin.rotation.x = -Math.PI / 2
      coin.rotation.z = rng() * Math.PI
      coin.position.y = 0.18 + i * 0.37
      stack.add(coin)
    }
    stack.position.set(11.4, 0, -8.4)
    this.group.add(stack)
    // ceremonial spinning coin on a plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), flatMat(0x7a8291))
    plinth.position.set(-4.2, 0.5, -9.0)
    this.group.add(plinth)
    const spinner = new THREE.Group()
    const spinCoin = makeCoinMesh(1.05, 0.24, { text: '$W', px: 160 })
    spinCoin.position.y = 1.05
    spinner.add(spinCoin)
    spinner.position.set(-4.2, 1.0, -9.0)
    this.group.add(spinner)
    this.addUpdater((dt) => { spinner.rotation.y += dt * 1.1 })

    // -- decor market stalls outside the fight floor. Every stall shingle
    // gets its own sign treatment so the strip reads like a real (deranged)
    // shopping street instead of seven copies of the same navy board.
    const stallDefs = [
      { x: -14.8, z: -6.8, ry: 0.5, sign: 'HOT MEMES', awnA: '#e0484f',
        signOpts: { style: 'neon', bg: '#1c0a10', fg: '#ff6a4d', border: '#ffb04d' } },
      { x: 14.8, z: -6.8, ry: -0.5, sign: 'GM COFFEE', awnA: '#3f5dc9',
        signOpts: { bg: '#3a2a18', fg: '#ffe9c4', border: '#c9a06a', stroke: '#241505', sideColor: 0x241505 } },
      { x: -16.2, z: -0.5, ry: Math.PI / 2 - 0.2, sign: 'RUG RUGS', awnA: '#38b26b',
        signOpts: { style: 'plywood', bg: '#8d7a5c', fg: '#f3ecd7' } },
      { x: 16.2, z: -0.8, ry: -Math.PI / 2 + 0.2, sign: 'NFT SNACKS', awnA: '#e8b13c',
        signOpts: { style: 'broken', bg: '#0c0c18', fg: '#4dff9d', border: '#4dffd9' } },
    ]
    for (const sd of stallDefs) {
      const stall = makeStall(rng, sd)
      stall.position.set(sd.x, 0, sd.z)
      stall.rotation.y = sd.ry
      this.group.add(stall)
      if (sd.signOpts?.style === 'broken' && stall.userData.sign) {
        this._flickerSigns.push(stall.userData.sign) // right-clicked one time too many
      }
    }
    this.addUpdater(() => {
      for (const s of this._flickerSigns) s.userData.flicker?.(this._time)
    })

    // -- the rocket statue, mid-launch, forever
    const rocket = makeRocket(rng, this.quality.particleScale)
    rocket.group.position.set(3.8, 0, -12.2)
    this.group.add(rocket.group)
    this.addUpdater(rocket.update)
  }

  _buildCrowds() {
    const total = Math.max(12, Math.floor(this.quality.crowd ?? 60))
    const nBack = Math.round(total * 0.42)
    const nSide = Math.max(4, Math.floor((total - nBack) / 2))
    const rng = this._rng

    const back = buildCrowd({ count: nBack, area: { w: 24, d: 2.6 }, palette: CROWD_PALETTE, rng })
    back.group.position.set(0, 0, -7.6)
    this.group.add(back.group)

    const left = buildCrowd({ count: nSide, area: { w: 13, d: 2.2 }, palette: CROWD_PALETTE, rng })
    left.group.position.set(-12.6, 0, -0.5)
    left.group.rotation.y = Math.PI / 2 // face +X, toward the carnage
    this.group.add(left.group)

    const right = buildCrowd({ count: nSide, area: { w: 13, d: 2.2 }, palette: CROWD_PALETTE, rng })
    right.group.position.set(12.6, 0, -0.5)
    right.group.rotation.y = -Math.PI / 2
    this.group.add(right.group)

    this._crowdBack = back
    this._crowdLeft = left
    this._crowdRight = right
    this._crowds = [back, left, right]
    for (const c of this._crowds) this.addUpdater((dt) => c.update(dt))

    // barriers between the mob and the money-making
    const backBar = makeBarrier(26)
    backBar.position.set(0, 0, -5.9)
    this.group.add(backBar)
    for (const side of [-1, 1]) {
      const bar = makeBarrier(13)
      bar.position.set(side * 10.7, 0, -0.5)
      bar.rotation.y = side * Math.PI / 2
      this.group.add(bar)
    }
  }

  _buildBells() {
    // v2.0 free-roam: a bell post in each corner of the fight floor, arm and
    // bell swung to point at the arena center. Trigger zones are 2D (XZ discs
    // around the hanging bell).
    for (const [cx, cz] of [[-8.35, -4.55], [8.35, -4.55], [-8.35, 4.55], [8.35, 4.55]]) {
      const side = Math.sign(cx) || 1
      const { group, pivot } = makeBellPost(side)
      group.position.set(cx, 0, cz)
      const yaw = Math.atan2(-cx, -cz) // local +Z (arm/bell) faces the center
      group.rotation.y = yaw
      this.group.add(group)
      // bell hangs at local (0, ~2.45 effective, 0.82) — rotate that offset
      const bx = cx + Math.sin(yaw) * 0.82
      const bz = cz + Math.cos(yaw) * 0.82
      this._bells.push({
        pivot,
        x: bx, y: 2.45, z: bz,
        side, ang: 0, vel: 0, cool: 0,
      })
    }
    this.addUpdater((dt) => {
      for (const b of this._bells) {
        b.cool = Math.max(0, b.cool - dt)
        // damped pendulum
        b.vel += (-34 * b.ang - 2.0 * b.vel) * dt
        b.ang += b.vel * dt
        b.pivot.rotation.z = THREE.MathUtils.clamp(b.ang, -0.95, 0.95)
      }
      // recently-launched fighters vs bells (2D disc + height window)
      for (let i = this._launched.length - 1; i >= 0; i--) {
        const entry = this._launched[i]
        entry.ttl -= dt
        const p = entry.f?.pos
        if (entry.ttl <= 0 || !p) { this._launched.splice(i, 1); continue }
        for (let bi = 0; bi < this._bells.length; bi++) {
          const b = this._bells[bi]
          if (Math.hypot(p.x - b.x, (p.z ?? 0) - b.z) < 1.35 && p.y > b.y - 1.35 && p.y < b.y + 1.0) {
            this._ringBell(bi, p.x >= b.x ? -1 : 1)
          }
        }
      }
    })
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

    // v2.0 free-roam: props scatter across the open XZ floor (center lane
    // stays mostly clear so the walk between spawns reads clean).

    // 2 breakable market stalls, kitty-corner on the open floor
    place(makeStall(rng, { sign: 'BAGS 4 SALE', awnA: '#e0484f', signOpts: { style: 'plywood', bg: '#94805f', fg: '#efe6cc' } }), -6.4, -3.4, 0.35, { shape: 'box', mass: 7, health: 26 })
    place(makeStall(rng, { sign: 'FREE ALPHA', awnA: '#3f5dc9' }), 6.6, 3.2, -0.4 + Math.PI, { shape: 'box', mass: 7, health: 26 })

    // vending machine of terrible decisions
    place(makeVendingMachine(), -3.4, 3.9, 0.5, { shape: 'box', mass: 11, health: 36 })

    // 3 crates — two on the floor, one stacked; grey-brown lumber keeps them
    // off the fighters' palette, labels tell the story
    const c1 = makeCrateMesh(0.72, { label: 'HODL', color: '#a3855c' }); c1.position.y = 0.36
    const c2 = makeCrateMesh(0.66, { label: 'FUD', color: '#8d7452' }); c2.position.y = 0.33
    const c3 = makeCrateMesh(0.6, { label: 'HOPE', color: '#b39775' }); c3.position.y = 0.72 + 0.3
    place(c1, 4.4, -3.6, 0.3, { shape: 'box', mass: 3, health: 12 })
    place(c2, 5.3, -3.2, -0.5, { shape: 'box', mass: 3, health: 12 })
    place(c3, 4.45, -3.58, 0.9, { shape: 'box', mass: 2.5, health: 10 })

    // monitor stack — somebody was day trading mid-floor
    place(makeMonitorStack(rng), -4.8, 2.2, -0.3, { shape: 'box', mass: 4, health: 15 })

    // one giant coin, standing on its rim like it owns the place
    const bigCoin = makeCoinMesh(0.85, 0.26, { text: 'W', px: 160 })
    bigCoin.position.y = 0.85
    bigCoin.rotation.z = 0.06
    place(bigCoin, 2.6, 3.6, 0.3, { shape: 'cylinder', mass: 8, health: 30 })
  }

  _wireEvents() {
    // hard prop/ragdoll impacts near a bell also ring it (chaos-friendly)
    this.listen('physics:impact', (e) => {
      if (!e || !e.pos || !(e.speed > 5)) return
      for (let bi = 0; bi < this._bells.length; bi++) {
        const b = this._bells[bi]
        if (Math.hypot(e.pos.x - b.x, (e.pos.z ?? 0) - b.z) < 1.2 && Math.abs(e.pos.y - b.y) < 1.2) {
          this._ringBell(bi, e.pos.x >= b.x ? -1 : 1)
        }
      }
    })
    // the crowd is EXTREMELY invested
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const c of this._crowds) c.cheer(0.25 + Math.min(0.8, combo * 0.07) + (e?.counter ? 0.4 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const c of this._crowds) c.cheer(1.2) })
    this.listen('fighter:ko', () => { for (const c of this._crowds) c.cheer(3) })
    this.listen('round:end', () => { for (const c of this._crowds) c.cheer(2) })
  }

  // -- hazard ---------------------------------------------------------------

  _ringBell(index, dir = 1) {
    const b = this._bells[index]
    if (!b || b.cool > 0) return
    b.cool = 1.15
    b.vel += dir * 9.5
    // sfx 'bell' is played by the audio module's 'arena:bell' subscription
    // (wireAudioEvents) — do not also play it here or it double-rings.
    this.emit('arena:bell', { index, side: b.side, pos: { x: b.x, y: b.y, z: b.z } })
    try { this.audio?.crowd?.('wild') } catch (e) { /* the crowd is busy */ }
    this.emit('camera:shake', { mag: 0.4 })
    for (const c of this._crowds) c.cheer(2.6)
    this.emit('caption', { text: BELL_LINES[this._bellLine++ % BELL_LINES.length] })
  }

  // -- ArenaInstance hooks --------------------------------------------------

  // MatchScreen hands the roster over at match start. The whole joke of this
  // venue is fighter-as-token, so the flanking chart boards retitle to the
  // actual matchup ($BONKO / USD when Bonko shows up) and the LED crawl hypes
  // the two tokens actually on the floor.
  setFighters(fighters) {
    try {
      const defs = (Array.isArray(fighters) ? fighters : []).map((f) => f?.def).filter(Boolean)
      if (!defs.length) return
      const token = (d) => String(d.id || d.name || 'wally').replace(/[^a-z0-9]/gi, '').toUpperCase() || 'WALLY'
      const a = token(defs[0])
      const b = defs[1] ? token(defs[1]) : a
      this._charts?.[0]?.setHeader?.(`$${a} / USD`)
      this._charts?.[1]?.setHeader?.(`$${b} / USD`)
      this._ticker?.setMessage?.(tickerCrawl(a, b))
    } catch (e) { console.warn('[arena] setFighters retitle failed', e) }
  }

  update(dt) {
    this._time += dt
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    try { this.audio?.crowd?.('wild') } catch (e) { /* muted hype */ }
    for (const c of this._crowds) c.cheer(2.2)
    if (fighter) this._launched.push({ f: fighter, ttl: 3.5 })
    if (this.physics?.presetName === 'unhinged') {
      // collateral damage: spectators discover gravity, AWAY from the impact
      const px = fighter?.pos?.x ?? 0
      const side = px >= 0 ? this._crowdRight : this._crowdLeft
      // side bleachers face the arena: the body arrives head-on, so victims
      // fall straight back into the stands (crowd-local -Z)
      side?.knockOverRandom(3 + Math.floor(this._rng() * 4), { x: 0, z: -1 })
      // the back row gets clipped side-on — swept along the bleacher in the
      // direction the launch was travelling, leaning back into the risers
      this._crowdBack?.knockOverRandom(1 + Math.floor(this._rng() * 3), Math.sign(px) || 1)
      this.sfx('boing', { vol: 0.5 })
    }
  }
}

export const MemeMarket = {
  id: 'meme-market',
  name: 'MEME MARKET',
  music: 'battle_meme_market',
  build(ctx) { return new MemeMarketArena(ctx) },
}
