// ============================================================================
// BULL MARKET COLOSSEUM — Bull's stage (story round 9). An epic golden-hour
// amphitheater where the architecture itself is bullish: the columns are
// giant GREEN CANDLESTICKS, the stands are packed with toga'd bagholders
// doing the wave, and two colossal golden bull statues glare across the sand
// with glowing eyes. Torch braziers, dust motes in god-light, long dramatic
// shadows. One column is structurally unsound; the crowd knows it, the
// masonry knows it, and a hard enough wall slam proves it.
//
// Camera looks down -Z; the fight axis is X. Everything decorative lives
// behind (-Z) or beside (|X| > 9) the fight floor. See CONTRACTS.md §9.
// ============================================================================
import * as THREE from 'three'
import {
  ArenaBase, makeRng, flatMat, canvasTexture, buildSkyDome, makeLightRig,
  makeSign, buildCrowd,
} from './ArenaBase.js'

// ---------------------------------------------------------------------------
// palette — golden hour over old money
// ---------------------------------------------------------------------------
const SAND = '#d9ae66'
const STONE = '#c9a26b'
const STONE_DARK = 0x9a7a4e
const GOLD = 0xe8b13c
const GOLD_PALE = 0xf7e3a1
const CANDLE_GREEN = 0x2fd45f
const CANDLE_GREEN_DARK = 0x1da344

const TOGA_PALETTE = ['#efe6cf', '#e8ddc4', '#d95d3f', '#b03a2e', '#c9a227', '#f0e6d0', '#8a5a3c', '#e0d8c0']
const CONFETTI_RED = ['#e03131', '#ff5252', '#b3161f', '#ff8787', '#ffd83d'] // mostly red, a little gold
const EMBERS = ['#ffb054', '#ff7b2e', '#ffe14d', '#ff9d3c']
const SAND_POOF = ['#d9ae66', '#c99a52', '#e8c88a']

// ---------------------------------------------------------------------------
// module-private texture / mesh factories
// ---------------------------------------------------------------------------

// Sand with hoof-mark trails — the bulls pace at night, presumably.
function makeSandTexture(rng) {
  return canvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = SAND
    c.fillRect(0, 0, W, H)
    // speckle
    for (let i = 0; i < 420; i++) {
      const l = rng()
      c.fillStyle = l < 0.5 ? 'rgba(120,84,40,0.18)' : 'rgba(255,236,190,0.20)'
      c.fillRect(rng() * W, rng() * H, 1 + rng() * 3, 1 + rng() * 3)
    }
    // wind streaks
    c.strokeStyle = 'rgba(255,232,180,0.15)'
    c.lineWidth = 3
    for (let i = 0; i < 7; i++) {
      const y = rng() * H
      c.beginPath()
      c.moveTo(0, y)
      c.quadraticCurveTo(W * 0.5, y + (rng() - 0.5) * 26, W, y + (rng() - 0.5) * 12)
      c.stroke()
    }
    // hoof trails: cloven prints marching in wobbly lines
    const print = (x, y, a) => {
      c.save()
      c.translate(x, y)
      c.rotate(a)
      c.fillStyle = 'rgba(110,74,32,0.42)'
      for (const s of [-1, 1]) {
        c.beginPath()
        c.ellipse(s * 4.2, 0, 3.4, 5.6, s * 0.22, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }
    for (let t = 0; t < 4; t++) {
      let x = rng() * W, y = rng() * H
      let a = rng() * Math.PI * 2
      for (let i = 0; i < 8; i++) {
        print(x, y, a)
        a += (rng() - 0.5) * 0.7
        x = (x + Math.cos(a) * 30 + W) % W
        y = (y + Math.sin(a) * 30 + H) % H
      }
    }
  }, { repeat: [3, 2] })
}

// Colosseum wall: big sandstone blocks with a band of dark arch niches.
function makeWallTexture(rng) {
  return canvasTexture(512, 256, (c, W, H) => {
    c.fillStyle = STONE
    c.fillRect(0, 0, W, H)
    // block courses
    const rows = 8, bh = H / rows
    c.strokeStyle = 'rgba(96,64,28,0.38)'
    c.lineWidth = 3
    for (let r = 0; r <= rows; r++) {
      c.beginPath(); c.moveTo(0, r * bh); c.lineTo(W, r * bh); c.stroke()
      const off = (r % 2) * 32
      for (let x = off; x < W; x += 64) {
        c.beginPath(); c.moveTo(x, r * bh); c.lineTo(x, (r + 1) * bh); c.stroke()
      }
    }
    // weathering
    for (let i = 0; i < 90; i++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(90,60,26,0.10)' : 'rgba(255,238,200,0.10)'
      c.fillRect(rng() * W, rng() * H, 6 + rng() * 22, 4 + rng() * 12)
    }
    // arch niche band across the middle — very amphitheater
    const ay = H * 0.34, ah = H * 0.34
    for (let i = 0; i < 6; i++) {
      const ax = W * (i + 0.5) / 6, aw = W * 0.09
      c.fillStyle = '#6b4a2a'
      c.beginPath()
      c.moveTo(ax - aw, ay + ah)
      c.lineTo(ax - aw, ay + aw)
      c.arc(ax, ay + aw, aw, Math.PI, 0)
      c.lineTo(ax + aw, ay + ah)
      c.closePath()
      c.fill()
      c.fillStyle = 'rgba(0,0,0,0.35)' // inner shadow, left side
      c.fillRect(ax - aw, ay + aw, aw * 0.5, ah - aw)
    }
    // cornice
    c.fillStyle = 'rgba(90,60,26,0.5)'
    c.fillRect(0, 0, W, 10)
    c.fillStyle = 'rgba(255,238,200,0.35)'
    c.fillRect(0, 10, W, 5)
  }, { repeat: [4, 1] })
}

// Fluted column-drum texture; cracks=true for structurally dubious masonry.
function makeDrumTexture(rng, cracks = false) {
  return canvasTexture(128, 128, (c, W, H) => {
    for (let i = 0; i < 10; i++) {
      const even = i % 2 === 0
      c.fillStyle = even ? STONE : '#b8905a'
      c.fillRect((W / 10) * i, 0, W / 10 + 1, H)
    }
    c.fillStyle = 'rgba(255,238,200,0.18)'
    c.fillRect(0, 0, W, 8)
    c.fillStyle = 'rgba(90,60,26,0.3)'
    c.fillRect(0, H - 8, W, 8)
    if (cracks) {
      c.strokeStyle = 'rgba(60,38,14,0.85)'
      c.lineWidth = 3
      for (let k = 0; k < 3; k++) {
        let x = rng() * W, y = 0
        c.beginPath()
        c.moveTo(x, y)
        while (y < H) {
          x += (rng() - 0.5) * 26
          y += 12 + rng() * 18
          c.lineTo(x, y)
        }
        c.stroke()
      }
    }
  })
}

// Flat heraldic bull head, drawn straight onto a canvas ctx.
function drawBullGlyph(c, cx, cy, s, color) {
  c.fillStyle = color
  c.strokeStyle = color
  // horns — proud arcs
  c.lineWidth = s * 0.16
  c.lineCap = 'round'
  for (const m of [-1, 1]) {
    c.beginPath()
    c.arc(cx + m * s * 0.52, cy - s * 0.28, s * 0.42, m > 0 ? Math.PI * 1.05 : Math.PI * 1.55, m > 0 ? Math.PI * 1.75 : Math.PI * 0.05)
    c.stroke()
  }
  // head
  c.beginPath()
  c.ellipse(cx, cy, s * 0.42, s * 0.5, 0, 0, Math.PI * 2)
  c.fill()
  // ears
  for (const m of [-1, 1]) {
    c.beginPath()
    c.ellipse(cx + m * s * 0.48, cy - s * 0.1, s * 0.14, s * 0.09, m * 0.5, 0, Math.PI * 2)
    c.fill()
  }
  // snout
  c.beginPath()
  c.ellipse(cx, cy + s * 0.34, s * 0.3, s * 0.22, 0, 0, Math.PI * 2)
  c.fill()
  // cutout details in background color would need compositing — punch with dark
  c.fillStyle = 'rgba(0,0,0,0.55)'
  for (const m of [-1, 1]) {
    c.beginPath(); c.arc(cx + m * s * 0.12, cy + s * 0.36, s * 0.05, 0, Math.PI * 2); c.fill() // nostrils
    c.beginPath(); c.arc(cx + m * s * 0.18, cy - s * 0.08, s * 0.06, 0, Math.PI * 2); c.fill() // eyes
  }
}

// Hanging crimson banner with a gold bull glyph and a swallow-tail cut.
function makeBannerMesh(w = 1.4, h = 3.2) {
  const tex = canvasTexture(96, 192, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    // swallow-tail silhouette
    c.fillStyle = '#a5252c'
    c.beginPath()
    c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, H - 1)
    c.lineTo(W / 2, H - H * 0.14); c.lineTo(0, H - 1)
    c.closePath()
    c.fill()
    // border
    c.strokeStyle = '#e0b13c'
    c.lineWidth = 6
    c.stroke()
    // top rod band
    c.fillStyle = '#7a161c'
    c.fillRect(0, 0, W, 14)
    drawBullGlyph(c, W / 2, H * 0.4, W * 0.42, '#f2cf5b')
    // motto
    c.font = `900 13px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'
    c.fillStyle = '#f2cf5b'
    c.fillText('UP ONLY', W / 2, H * 0.74)
  })
  const geo = new THREE.PlaneGeometry(w, h)
  geo.translate(0, -h / 2, 0) // pivot at the rod so it sways from the top
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.4 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'bullBanner'
  return mesh
}

// A colosseum column that is, on inspection, a giant green candlestick:
// stone pedestal, lower wick, fat green body, gold capital, upper wick.
function makeCandleColumn(rng, height = 8) {
  const g = new THREE.Group()
  g.name = 'candleColumn'
  const stone = flatMat(0xb08d5f)
  const ped = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.0), stone)
  ped.position.y = 0.4
  g.add(ped)
  const wickMat = flatMat(0x2e2e2e)
  const wickLo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 6), wickMat)
  wickLo.position.y = 1.1
  g.add(wickLo)
  const bodyH = height - 3.2
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, bodyH, 1.35), flatMat(CANDLE_GREEN))
  body.position.y = 1.45 + bodyH / 2
  g.add(body)
  // darker top face slab — reads as the candle "close"
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.3, 1.42), flatMat(CANDLE_GREEN_DARK))
  cap.position.y = 1.45 + bodyH + 0.15
  g.add(cap)
  const capital = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 1.8), flatMat(GOLD))
  capital.position.y = 1.45 + bodyH + 0.44
  g.add(capital)
  const wickHi = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6), wickMat)
  wickHi.position.y = 1.45 + bodyH + 0.58 + 0.75
  g.add(wickHi)
  // slight settle so the row doesn't look copy-pasted
  g.rotation.y = rng() * Math.PI * 0.5
  return g
}

// Free-standing breakable column drum (fight-floor prop).
function makeColumnDrum(rng, r = 0.62, h = 0.95) {
  const tex = makeDrumTexture(rng)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.04, h, 10),
    new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
  )
  mesh.name = 'columnDrum'
  mesh.position.y = h / 2
  return mesh
}

// The hazard column: cracked stone shaft with a loose drum + capital on top,
// visibly askew. Returns { group, topY } — the loose chunk is built separately.
function makeCrackedColumn(rng, height = 5.6) {
  const g = new THREE.Group()
  g.name = 'crackedColumn'
  const stone = flatMat(0xb08d5f)
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.2), stone)
  base.position.y = 0.35
  g.add(base)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.95, height, 10),
    new THREE.MeshLambertMaterial({ map: makeDrumTexture(rng, true), flatShading: true })
  )
  shaft.position.y = 0.7 + height / 2
  g.add(shaft)
  return { group: g, topY: 0.7 + height }
}

// The loose chunk that topples: a cracked drum wearing a gold capital.
function makeLooseChunk(rng) {
  const g = new THREE.Group()
  g.name = 'looseChunk'
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 1.15, 10),
    new THREE.MeshLambertMaterial({ map: makeDrumTexture(rng, true), flatShading: true })
  )
  g.add(drum)
  const capital = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 2.0), flatMat(GOLD))
  capital.position.y = 0.72
  g.add(capital)
  return g
}

// Cartoon fire: two nested cones + orbiting ember sprites. Returns
// { group, update(dt), kill() } — kill() snuffs it (brazier got smashed).
function makeFlame(rng, scale = 1, particleScale = 1) {
  const g = new THREE.Group()
  g.name = 'flame'
  const outerMat = new THREE.MeshBasicMaterial({ color: 0xff7b2e, transparent: true, opacity: 0.85 })
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95 })
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 0.9 * scale, 7), outerMat)
  outer.position.y = 0.45 * scale
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18 * scale, 0.55 * scale, 6), innerMat)
  inner.position.y = 0.33 * scale
  g.add(outer, inner)
  const embers = []
  const n = Math.max(1, Math.round(3 * particleScale))
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb054, transparent: true, opacity: 0.9 })
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 4, 3), mat)
    embers.push({ m, mat, t: rng(), dur: 0.8 + rng() * 0.7, ang: rng() * Math.PI * 2 })
    g.add(m)
  }
  let t = rng() * 10
  let dead = false
  return {
    group: g,
    update(dt) {
      if (dead) return
      t += dt
      const fl = 1 + Math.sin(t * 21) * 0.14 + Math.sin(t * 33 + 1.7) * 0.09
      outer.scale.set(fl, 0.85 + fl * 0.3, fl)
      inner.scale.set(2 - fl, 0.6 + fl * 0.55, 2 - fl)
      outer.rotation.y += dt * 2.4
      inner.rotation.y -= dt * 3.1
      for (const e of embers) {
        e.t += dt / e.dur
        if (e.t >= 1) { e.t = 0; e.ang = t * 7 % (Math.PI * 2) }
        const k = e.t
        e.m.position.set(Math.cos(e.ang + k * 3) * 0.16 * scale, (0.5 + k * 1.1) * scale, Math.sin(e.ang + k * 3) * 0.16 * scale)
        e.mat.opacity = 0.9 * (1 - k)
      }
    },
    kill() { dead = true; g.visible = false },
  }
}

// Bronze tripod brazier. Returns { group, flame }.
function makeBrazier(rng, particleScale = 1, scale = 1) {
  const g = new THREE.Group()
  g.name = 'brazier'
  const bronze = flatMat(0x8a5a28)
  const bronzeDark = flatMat(0x5f3d18)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 1.1 * scale, 5), bronzeDark)
    leg.position.set(Math.cos(a) * 0.34 * scale, 0.55 * scale, Math.sin(a) * 0.34 * scale)
    leg.rotation.z = Math.cos(a) * 0.3
    leg.rotation.x = -Math.sin(a) * 0.3
    g.add(leg)
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52 * scale, 0.3 * scale, 0.34 * scale, 9), bronze)
  bowl.position.y = 1.15 * scale
  g.add(bowl)
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.44 * scale, 0.44 * scale, 0.1 * scale, 9), flatMat(0x3a2a1a))
  coals.position.y = 1.33 * scale
  g.add(coals)
  const flame = makeFlame(rng, 0.9 * scale, particleScale)
  flame.group.position.y = 1.34 * scale
  g.add(flame.group)
  return { group: g, flame }
}

// Colossal golden bull, mid-snort, one hoof raised. Faces +X.
// Returns { group, eyeMats } — eye materials pulse from the arena updater.
function makeBullStatue() {
  const g = new THREE.Group()
  g.name = 'bullStatue'
  const stone = flatMat(0xb08d5f)
  const gold = flatMat(GOLD)
  const goldDark = flatMat(0xc8921f)
  const horn = flatMat(GOLD_PALE)

  const ped = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 2.3), stone)
  ped.position.y = 0.5
  g.add(ped)
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 2.6), flatMat(STONE_DARK))
  trim.position.y = 1.05
  g.add(trim)

  const bull = new THREE.Group()
  bull.position.y = 1.15
  // haunches + chest — the physique of a thousand green quarters
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.3, 1.2), gold)
  rear.position.set(-0.8, 1.35, 0)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.35), gold)
  chest.position.set(0.45, 1.4, 0)
  const hump = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 1.0), goldDark)
  hump.position.set(0.75, 2.2, 0)
  bull.add(rear, chest, hump)
  // head, lowered for the charge
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.7), gold)
  head.position.set(1.5, 1.45, 0)
  head.rotation.z = -0.3
  bull.add(head)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.55), goldDark)
  snout.position.set(1.95, 1.12, 0)
  bull.add(snout)
  const eyeMats = []
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), goldDark)
    ear.position.set(1.35, 1.8, s * 0.45)
    ear.rotation.x = s * 0.4
    bull.add(ear)
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.85, 6), horn)
    h.position.set(1.55, 2.1, s * 0.42)
    h.rotation.set(s * 0.85, 0, -0.35)
    bull.add(h)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2810 })
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), eyeMat)
    eye.position.set(1.88, 1.55, s * 0.3)
    bull.add(eye)
    eyeMats.push(eyeMat)
  }
  // legs — front-left pawing the air
  const legGeo = new THREE.BoxGeometry(0.34, 1.0, 0.36)
  const legPos = [
    [0.85, 0.5, 0.4], [0.85, 0.5, -0.4],
    [-1.05, 0.5, 0.4], [-1.05, 0.5, -0.4],
  ]
  legPos.forEach((p, i) => {
    const leg = new THREE.Mesh(legGeo, goldDark)
    leg.position.set(p[0], p[1], p[2])
    if (i === 0) { // raised, pawing
      leg.position.set(1.05, 1.0, 0.4)
      leg.rotation.z = 1.15
    }
    bull.add(leg)
  })
  // tail, whipped up
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), goldDark)
  tail.position.set(-1.55, 2.15, 0)
  tail.rotation.z = 0.55
  bull.add(tail)
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4), gold)
  tuft.position.set(-1.8, 2.6, 0)
  bull.add(tuft)

  bull.scale.setScalar(1.35) // colossal
  g.add(bull)
  return { group: g, eyeMats }
}

// Trophy pedestal — a golden cup for whoever HODLs hardest.
function makeTrophyPedestal() {
  const g = new THREE.Group()
  g.name = 'trophyPedestal'
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.1, 0.95), flatMat(0xb08d5f))
  ped.position.y = 0.55
  g.add(ped)
  const plate = makeSign('HODL CHAMP', { w: 0.8, h: 0.26, depth: 0.05, px: 72, bg: '#5a3413', fg: '#ffe14d', border: '#ffe14d' })
  plate.position.set(0, 0.62, 0.5)
  g.add(plate)
  const gold = flatMat(GOLD)
  const goldDark = flatMat(0xc8921f)
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.12, 8), goldDark)
  foot.position.y = 1.16
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 6), gold)
  stem.position.y = 1.4
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.55, 9), gold)
  cup.position.y = 1.85
  g.add(foot, stem, cup)
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.09), goldDark)
    handle.position.set(s * 0.52, 1.85, 0)
    handle.rotation.z = s * 0.35
    g.add(handle)
  }
  return g
}

// Shield-and-spear rack — gladiator merch, gently pre-owned.
function makeWeaponRack(rng) {
  const g = new THREE.Group()
  g.name = 'weaponRack'
  const wood = flatMat(0x6e4a26)
  for (const s of [-0.7, 0.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), wood)
    post.position.set(s, 0.8, 0)
    g.add(post)
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), wood)
  bar.position.y = 1.5
  g.add(bar)
  // two round shields with the bull crest
  const shieldTex = canvasTexture(96, 96, (c, W, H) => {
    c.fillStyle = '#a5252c'
    c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#e0b13c'
    c.lineWidth = 7
    c.beginPath(); c.arc(W / 2, H / 2, W * 0.42, 0, Math.PI * 2); c.stroke()
    drawBullGlyph(c, W / 2, H / 2, W * 0.3, '#f2cf5b')
  })
  for (let i = 0; i < 2; i++) {
    const rim = flatMat(0x8a5a28)
    const face = new THREE.MeshLambertMaterial({ map: shieldTex, flatShading: true })
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 12), [rim, face, face])
    shield.rotation.x = Math.PI / 2
    shield.rotation.z = (rng() - 0.5) * 0.4
    shield.position.set(-0.4 + i * 0.8, 0.95, 0.12)
    g.add(shield)
  }
  // spears leaning on the bar
  const shaftMat = flatMat(0x9c6b35)
  const tipMat = flatMat(0xcfd6de)
  for (let i = 0; i < 3; i++) {
    const spear = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.0, 5), shaftMat)
    shaft.position.y = 1.0
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), tipMat)
    tip.position.y = 2.15
    spear.add(shaft, tip)
    spear.position.set(-0.5 + i * 0.5, 0, -0.14)
    spear.rotation.z = (rng() - 0.5) * 0.24
    spear.rotation.x = -0.16
    g.add(spear)
  }
  return g
}

// A slanted volumetric-ish god ray: additive gradient plane. Pure vibes.
function makeGodRay(w = 2.6, h = 13) {
  const tex = canvasTexture(64, 256, (c, W, H) => {
    const grad = c.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(255,214,150,0.55)')
    grad.addColorStop(0.75, 'rgba(255,200,130,0.14)')
    grad.addColorStop(1, 'rgba(255,200,130,0)')
    c.fillStyle = grad
    c.fillRect(0, 0, W, H)
  }, { nearest: false })
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.name = 'godRay'
  mesh.renderOrder = 5
  return mesh
}

// ---------------------------------------------------------------------------
// The arena
// ---------------------------------------------------------------------------

const ARC_CZ = 2          // arc center z for the colosseum bowl
const CHUNK_DMG = 14
const HAZARD_COOLDOWN = 9
const CHUNK_RESPAWN = 12

class BullMarketColosseumArena extends ArenaBase {
  constructor(ctx) {
    super(ctx)
    this.bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7, wallBounce: 0.6 } // wide round bowl; stone walls hit back
    this.floorY = 0
    this.spawnPoints = [-3, 3]

    this._rng = makeRng(0xb011)
    this._time = 0
    this._launched = []          // { f, ttl } — recently ragdolled fighters
    this._fighters = new Set()   // refs captured from onRagdollLaunch
    this._segments = []          // crowd segments, ordered left -> right (for the wave)
    this._flames = []            // { flame } all live fires
    this._brazierFlames = new Map() // physics handle -> flame (fire poof on break)
    this._banners = []           // { mesh, phase }
    this._motes = []             // { mesh, mat, base, phase, amp }
    this._eyeMats = []
    this._eyeFlare = 0
    this._mooCool = 14 + this._rng() * 10
    this._fallingChunks = []     // live toppled chunks dealing damage
    this._hazards = []           // per-side hazard column state
    this._wave = { timer: 5, idx: 99, delay: 0 }

    this._buildPhysics()
    this._buildSkyAndLights()
    this._buildFloor()
    this._buildColosseum()
    this._buildStands()
    this._buildStatues()
    this._buildAtmosphere()
    this._buildHazardColumns()
    this._buildProps()
    this._buildConfetti()
    this._wireEvents()

    this.scene?.add(this.group)
  }

  // -- construction --------------------------------------------------------

  _buildPhysics() {
    // sand slab + invisible stone walls on all four sides, inner faces
    // exactly at the bounds
    this.addStaticBox(new THREE.Vector3(0, -0.5, -2), new THREE.Vector3(60, 1, 40))
    this.addBoundsWalls()
  }

  _buildSkyAndLights() {
    // golden hour: indigo overhead melting into molten orange at the horizon
    const sky = buildSkyDome(['#3a4a8c', '#c96f35', '#ffb054', '#ffe1a0'], {
      rng: this._rng, cloudColor: 'rgba(255,224,180,0.85)',
    })
    this.group.add(sky)
    // low dramatic sun -> long shadows across the sand
    const rig = makeLightRig(this.scene, this.quality, {
      hemiSky: 0xffd9a8, hemiGround: 0x9a7a4e, hemiIntensity: 0.95,
      sunColor: 0xffc46b, sunIntensity: 2.0, sunPos: [16, 7, 8],
      fillColor: 0x7a86c9, fillIntensity: 0.3, fillPos: [-9, 5, 12],
      fog: { color: 0xe8b57a, near: 34, far: 88 },
      shadowArea: 17,
    })
    this.group.add(rig.group)
    this.onDispose(() => rig.dispose())
  }

  _buildFloor() {
    const tex = makeSandTexture(this._rng)
    const sideMat = flatMat(0x8a6a3c)
    const topMat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 30), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    slab.position.set(0, -0.25, -4)
    slab.receiveShadow = !!this.quality.shadows
    this.group.add(slab)
    // scorched earth beyond the walls
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), flatMat(0x9c7845))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.34
    this.group.add(ground)
  }

  _buildColosseum() {
    const rng = this._rng

    // -- curved outer wall, wrapping the back and sides
    const wallTex = makeWallTexture(rng)
    const span = Math.PI * 1.15
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(19.5, 19.5, 11, 26, 1, true, Math.PI - span / 2, span),
      new THREE.MeshLambertMaterial({ map: wallTex, flatShading: true, side: THREE.DoubleSide })
    )
    wall.position.set(0, 6.2, ARC_CZ)
    this.group.add(wall)
    // cornice ring on top
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(19.9, 19.9, 0.9, 26, 1, true, Math.PI - span / 2, span),
      new THREE.MeshLambertMaterial({ color: STONE_DARK, flatShading: true, side: THREE.DoubleSide })
    )
    rim.position.set(0, 12.1, ARC_CZ)
    this.group.add(rim)

    // -- the gate: a dark arch dead center, with imperial signage
    const gate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.8, 0.6), flatMat(0x241a10))
    gate.position.set(0, 2.4, -17.0)
    this.group.add(gate)
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 0.9), flatMat(0xb08d5f))
    lintel.position.set(0, 5.05, -17.0)
    this.group.add(lintel)
    const spq = makeSign('S.P.Q.HODL', { w: 2.6, h: 0.6, depth: 0.12, px: 80, bg: '#5a3413', fg: '#ffe14d', border: '#ffe14d' })
    spq.position.set(0, 5.9, -16.7)
    this.group.add(spq)
    const marquee = makeSign('BULL MARKET', {
      w: 8.2, h: 2.0, depth: 0.3, px: 80,
      bg: '#3a2410', fg: '#ffd83d', border: '#ffd83d',
      sub: 'THIS COLOSSEUM ONLY GOES UP',
    })
    marquee.position.set(0, 9.2, -16.4)
    marquee.rotation.x = -0.05
    this.group.add(marquee)

    // -- candlestick columns ringing the bowl
    const R = 15.8
    const nCols = 9
    for (let i = 0; i < nCols; i++) {
      const a = Math.PI * (0.12 + 0.76 * (i / (nCols - 1)))
      const x = Math.cos(a) * R
      const z = ARC_CZ - Math.sin(a) * R * 0.95
      if (Math.abs(x) < 2.6) continue // keep the gate sightline clear
      const col = makeCandleColumn(rng, 6.8 + rng() * 2.4)
      col.position.set(x, 0, z)
      this.group.add(col)
    }

    // -- banners hanging from the rim, swaying in golden-hour wind
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.2 + 0.6 * (i / 5))
      const x = Math.cos(a) * 18.9
      const z = ARC_CZ - Math.sin(a) * 18.9
      const banner = makeBannerMesh(1.5, 3.4)
      banner.position.set(x, 11.4, z)
      banner.rotation.y = Math.atan2(-x, -(z - ARC_CZ))
      this.group.add(banner)
      this._banners.push({ mesh: banner, phase: rng() * Math.PI * 2 })
    }

    // -- the one red candle, fallen and shattered. it happens.
    const redBody = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.6, 1.3), flatMat(0xe0303c))
    redBody.position.set(-14.2, 0.62, -6.6)
    redBody.rotation.set(0.12, 0.5, Math.PI / 2 - 0.14)
    this.group.add(redBody)
    const redWick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 6), flatMat(0x2e2e2e))
    redWick.position.set(-16.7, 0.55, -7.3)
    redWick.rotation.z = Math.PI / 2 - 0.5
    this.group.add(redWick)
    const oops = makeSign('IT HAPPENS', { w: 1.5, h: 0.45, depth: 0.08, px: 72, bg: '#3a2410', fg: '#ff8787', border: '#ff8787' })
    oops.position.set(-13.4, 0.9, -5.2)
    oops.rotation.y = 0.5
    oops.rotation.z = -0.08
    this.group.add(oops)

    // rubble scatter near the walls (static dressing)
    const rubbleMat = flatMat(0xb08d5f)
    for (let i = 0; i < 10; i++) {
      const s = 0.18 + rng() * 0.3
      const rock = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s * 0.9), rubbleMat)
      const side = rng() < 0.5 ? -1 : 1
      rock.position.set(side * (10.5 + rng() * 5), s * 0.3, -3 - rng() * 9)
      rock.rotation.set(rng(), rng() * 3, rng())
      this.group.add(rock)
    }
  }

  _buildStands() {
    // Seven tiered stand segments around the bowl, every seat filled.
    // This is Bull's house — quality.crowd is spent in full.
    const rng = this._rng
    const total = Math.max(14, Math.floor(this.quality.crowd ?? 60))
    const nSeg = 7
    const per = Math.max(2, Math.floor(total / nSeg))
    const stoneMat = flatMat(0xb08d5f)

    const segs = []
    for (let i = 0; i < nSeg; i++) {
      const a = Math.PI * (0.15 + 0.7 * (i / (nSeg - 1)))
      const px = Math.cos(a) * 13.4
      const pz = ARC_CZ - Math.sin(a) * 13.4 * 0.95
      const face = Math.atan2(-px, -pz) // local +Z looks at arena center

      // stone platform under the section
      const plat = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.2, 3.6), stoneMat)
      plat.position.set(px, 0.6, pz)
      plat.rotation.y = face
      this.group.add(plat)

      // give the middle segments the leftover heads
      const bonus = (i === 3) ? total - per * nSeg : 0
      const crowd = buildCrowd({
        count: per + Math.max(0, bonus),
        area: { w: 5.6, d: 2.5 },
        palette: TOGA_PALETTE,
        riserColor: 0x9a815c,
        rng,
      })
      crowd.group.position.set(px, 1.2, pz)
      crowd.group.rotation.y = face
      this.group.add(crowd.group)
      this.addUpdater((dt) => crowd.update(dt))
      segs.push({ crowd, x: px, z: pz, y: 1.2 })
    }
    // order left -> right so the wave travels around the bowl
    segs.sort((s1, s2) => s1.x - s2.x)
    this._segments = segs
  }

  _buildStatues() {
    // two colossal golden bulls flanking the sand, eyes smoldering
    for (const side of [-1, 1]) {
      const { group, eyeMats } = makeBullStatue()
      group.position.set(side * 11.7, 0, 0.2)
      // face the arena center, cheated slightly toward the camera
      group.rotation.y = side > 0 ? Math.PI + 0.25 : -0.25
      if (this.quality.shadows) group.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(group)
      this._eyeMats.push(...eyeMats)
    }
    // eye pulse + KO flare
    this.addUpdater(() => {
      this._eyeFlare = Math.max(0, this._eyeFlare - 1 / 60)
      const pulse = 0.65 + 0.35 * Math.sin(this._time * 2.3) + this._eyeFlare
      for (const m of this._eyeMats) m.color.setRGB(1, Math.min(1, 0.1 + 0.22 * pulse), 0.03)
    })
  }

  _buildAtmosphere() {
    const rng = this._rng
    const ps = this.quality.particleScale ?? 1

    // -- decorative torch braziers around the bowl edge
    const spots = [[-13.2, -3.4], [13.2, -3.4], [-7.6, -12.4], [7.6, -12.4]]
    for (const [x, z] of spots) {
      const b = makeBrazier(rng, ps, 1.15)
      b.group.position.set(x, 0, z)
      this.group.add(b.group)
      this._flames.push(b.flame)
    }
    this.addUpdater((dt) => { for (const f of this._flames) f.update(dt) })

    // -- god rays slanting in from the low sun (upper +X)
    for (const [x, y, z, w, op] of [[3.6, 6.4, -3.5, 2.4, 0.34], [6.2, 6.0, -1.8, 3.2, 0.22]]) {
      const ray = makeGodRay(w, 13)
      ray.position.set(x, y, z)
      ray.rotation.z = -0.42 // top leans toward the sun
      ray.rotation.y = 0.24
      ray.material.opacity = op
      this.group.add(ray)
    }

    // -- dust motes drifting through the light shaft
    const nMotes = Math.max(6, Math.round(16 * ps))
    for (let i = 0; i < nMotes; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.5, fog: false })
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 3), mat)
      const base = new THREE.Vector3(0.5 + rng() * 7, 1 + rng() * 6.5, -6 + rng() * 6)
      m.position.copy(base)
      this.group.add(m)
      this._motes.push({ mesh: m, mat, base, phase: rng() * Math.PI * 2, amp: 0.3 + rng() * 0.5 })
    }
    this.addUpdater(() => {
      const t = this._time
      for (const mo of this._motes) {
        mo.mesh.position.set(
          mo.base.x + Math.sin(t * 0.4 + mo.phase) * mo.amp,
          mo.base.y + Math.sin(t * 0.27 + mo.phase * 2) * mo.amp * 0.8,
          mo.base.z + Math.cos(t * 0.33 + mo.phase) * mo.amp * 0.6
        )
        mo.mat.opacity = 0.28 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7 + mo.phase * 3))
      }
    })

    // -- banner sway
    this.addUpdater(() => {
      const t = this._time
      for (const b of this._banners) {
        b.mesh.rotation.x = Math.sin(t * 0.9 + b.phase) * 0.09 + Math.sin(t * 2.3 + b.phase * 2) * 0.025
      }
    })
  }

  _buildHazardColumns() {
    // one structurally dubious column per side, loose chunk balanced on top.
    // v2.0: each side gets its own z placement so the collapses rake
    // different bands of the round floor.
    for (const [side, cz] of [[-1, -3.8], [1, 3.2]]) {
      const { group, topY } = makeCrackedColumn(this._rng, 5.4)
      group.position.set(side * 10.8, 0, cz)
      if (this.quality.shadows) group.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(group)
      const hz = { side, z: cz, column: group, topY, chunk: null, pending: false, t: 0, cool: 0, respawn: 0 }
      this._attachChunk(hz)
      this._hazards.push(hz)
    }
  }

  _attachChunk(hz) {
    const chunk = makeLooseChunk(this._rng)
    chunk.position.set(0.12 * -hz.side, hz.topY + 0.58, 0.05)
    chunk.rotation.z = 0.07 * -hz.side // visibly askew: the telegraph is permanent
    chunk.rotation.y = this._rng() * Math.PI
    if (this.quality.shadows) chunk.traverse((o) => { if (o.isMesh) o.castShadow = true })
    hz.column.add(chunk)
    hz.chunk = chunk
  }

  _buildProps() {
    const rng = this._rng
    const ps = this.quality.particleScale ?? 1
    const shadows = !!this.quality.shadows
    const place = (mesh, x, z, ry, opts) => {
      mesh.position.set(x, mesh.position.y, z)
      mesh.rotation.y = ry
      if (shadows) mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
      this.group.add(mesh)
      return this.addBreakable(mesh, opts)
    }

    // v2.0 free-roam: masonry and set dressing scatter across the round sand
    // floor (center lane kept mostly clear).

    // 2 loose column drums — the masonry budget ran out
    place(makeColumnDrum(rng, 0.62, 0.95), -6.6, -4.4, rng() * Math.PI, { shape: 'cylinder', mass: 9, health: 30 })
    place(makeColumnDrum(rng, 0.5, 0.8), 5.4, 4.8, rng() * Math.PI, { shape: 'cylinder', mass: 7, health: 24 })

    // 2 lit braziers — smashing one produces a fire poof (see physics:break)
    for (const [x, z] of [[-4.4, 4.6], [4.8, -5.0]]) {
      const b = makeBrazier(rng, ps, 1)
      const h = place(b.group, x, z, rng() * Math.PI, { shape: 'box', mass: 6, health: 20, kind: 'brazier' })
      this._flames.push(b.flame)
      if (h) this._brazierFlames.set(h, b.flame)
    }

    // trophy pedestal — winner's cup, extremely knock-overable
    place(makeTrophyPedestal(), 7.3, 2.6, -0.4, { shape: 'box', mass: 8, health: 26 })

    // shield-and-spear rack
    place(makeWeaponRack(rng), -7.3, 2.4, 0.35, { shape: 'box', mass: 5, health: 18 })
  }

  _buildConfetti() {
    // one instanced pool serves red confetti, fire embers and sand poofs
    const ps = this.quality.particleScale ?? 1
    const n = Math.max(24, Math.round(80 * ps))
    this._cfN = n
    const geo = new THREE.BoxGeometry(0.13, 0.02, 0.17)
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
    const mesh = new THREE.InstancedMesh(geo, mat, n)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.name = 'confetti'
    this.group.add(mesh)
    this._cfMesh = mesh
    this._cfPos = new Float32Array(n * 3)
    this._cfVel = new Float32Array(n * 3)
    this._cfRot = new Float32Array(n * 3)
    this._cfSpin = new Float32Array(n * 3)
    this._cfLife = new Float32Array(n)
    this._cfGrav = new Float32Array(n)
    this._cfSize = new Float32Array(n)
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const col = new THREE.Color('#ffffff')
    for (let i = 0; i < n; i++) {
      mesh.setMatrixAt(i, zero)
      mesh.setColorAt(i, col) // allocate instanceColor up front
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    this._cfCursor = 0
  }

  // Fire `count` particles from around (x,y,z). opts: { colors, speed, up, grav, life, size }
  _burst(x, y, z, count, opts = {}) {
    if (!this._cfMesh) return
    const rng = this._rng
    const colors = opts.colors || CONFETTI_RED
    const col = new THREE.Color()
    for (let k = 0; k < count; k++) {
      const i = this._cfCursor
      this._cfCursor = (this._cfCursor + 1) % this._cfN
      const a = rng() * Math.PI * 2
      const sp = (opts.speed ?? 2.2) * (0.5 + rng())
      this._cfPos[i * 3] = x + (rng() - 0.5) * 0.6
      this._cfPos[i * 3 + 1] = y + (rng() - 0.5) * 0.4
      this._cfPos[i * 3 + 2] = z + (rng() - 0.5) * 0.6
      this._cfVel[i * 3] = Math.cos(a) * sp + (opts.dirX ?? 0)
      this._cfVel[i * 3 + 1] = (opts.up ?? 2.6) * (0.6 + rng() * 0.8)
      this._cfVel[i * 3 + 2] = Math.sin(a) * sp * 0.6 + (opts.dirZ ?? 0)
      this._cfRot[i * 3] = rng() * Math.PI
      this._cfRot[i * 3 + 1] = rng() * Math.PI
      this._cfRot[i * 3 + 2] = rng() * Math.PI
      this._cfSpin[i * 3] = (rng() - 0.5) * 9
      this._cfSpin[i * 3 + 1] = (rng() - 0.5) * 9
      this._cfSpin[i * 3 + 2] = (rng() - 0.5) * 9
      this._cfLife[i] = (opts.life ?? 2.2) * (0.7 + rng() * 0.6)
      this._cfGrav[i] = opts.grav ?? 3.1
      this._cfSize[i] = (opts.size ?? 1) * (0.7 + rng() * 0.6)
      col.set(colors[Math.floor(rng() * colors.length)])
      this._cfMesh.setColorAt(i, col)
    }
    if (this._cfMesh.instanceColor) this._cfMesh.instanceColor.needsUpdate = true
  }

  _updateConfetti(dt) {
    const mesh = this._cfMesh
    if (!mesh) return
    const p = this._cfPos, v = this._cfVel, r = this._cfRot, w = this._cfSpin
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3()
    let any = false
    for (let i = 0; i < this._cfN; i++) {
      if (this._cfLife[i] <= 0) continue
      any = true
      this._cfLife[i] -= dt
      v[i * 3 + 1] -= this._cfGrav[i] * dt
      const drag = 1 - Math.min(0.9, 1.1 * dt)
      v[i * 3] *= drag
      v[i * 3 + 2] *= drag
      p[i * 3] += (v[i * 3] + Math.sin(this._time * 11 + i) * 0.35) * dt // flutter
      p[i * 3 + 1] += v[i * 3 + 1] * dt
      p[i * 3 + 2] += v[i * 3 + 2] * dt
      if (p[i * 3 + 1] < 0.03) { p[i * 3 + 1] = 0.03; v[i * 3 + 1] = 0; this._cfLife[i] = Math.min(this._cfLife[i], 0.35) }
      r[i * 3] += w[i * 3] * dt
      r[i * 3 + 1] += w[i * 3 + 1] * dt
      r[i * 3 + 2] += w[i * 3 + 2] * dt
      const k = Math.min(1, this._cfLife[i] * 3) * this._cfSize[i]
      _v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
      _e.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2])
      _q.setFromEuler(_e)
      _s.setScalar(Math.max(0, k))
      _m.compose(_v, _q, _s)
      mesh.setMatrixAt(i, _m)
    }
    if (any) mesh.instanceMatrix.needsUpdate = true
  }

  // The stands on `side` hurl red confetti toward the sand.
  _confettiRain(side) {
    const ps = this.quality.particleScale ?? 1
    for (const seg of this._segments) {
      if (side !== 0 && Math.sign(seg.x || side) !== side && Math.abs(seg.x) > 3) continue
      const n = Math.max(3, Math.round(9 * ps))
      // aim loosely at the arena center
      const d = Math.hypot(seg.x, seg.z) || 1
      this._burst(seg.x, seg.y + 2.2, seg.z, n, {
        colors: CONFETTI_RED, speed: 1.4, up: 3.2, grav: 2.6, life: 2.6,
        dirX: (-seg.x / d) * 2.4, dirZ: (-seg.z / d) * 2.4,
      })
      seg.crowd.cheer(1.6)
    }
  }

  _wireEvents() {
    // fire poof when a brazier prop shatters
    this.listen('physics:break', (e) => {
      if (!e) return
      const flame = e.handle ? this._brazierFlames.get(e.handle) : null
      if (flame || e.kind === 'brazier') {
        flame?.kill()
        if (e.handle) this._brazierFlames.delete(e.handle)
        const pos = e.pos || { x: 0, y: 1, z: 0 }
        this._burst(pos.x, pos.y + 0.4, pos.z, Math.max(6, Math.round(14 * (this.quality.particleScale ?? 1))), {
          colors: EMBERS, speed: 2.6, up: 3.4, grav: 4.5, life: 1.1, size: 0.8,
        })
        this.sfx('explosion', { vol: 0.4, pitch: 1.3 })
        this.emit('camera:shake', { mag: 0.25 })
        try { this.audio?.crowd?.('gasp') } catch (err) { /* the vestal virgins fled */ }
      }
    })

    // ragdoll wall slams arm the structural-weakness hazard
    this.listen('physics:impact', (e) => {
      if (!e || !e.pos || !(e.speed > 7.5)) return
      if (Math.abs(e.pos.x) < 7.9 || e.pos.y > 5) return
      const side = e.pos.x >= 0 ? 1 : -1
      for (const entry of this._launched) {
        const p = entry.f?.pos
        if (p && Math.abs(p.x - side * 9) < 2.3) { this._triggerHazard(side); break }
      }
    })

    // the mob is EXTREMELY invested
    this.listen('fighter:hit', (e) => {
      const combo = e?.combo || 0
      for (const s of this._segments) s.crowd.cheer(0.22 + Math.min(0.7, combo * 0.06) + (e?.counter ? 0.35 : 0))
    })
    this.listen('combo', (e) => { if ((e?.hits || 0) >= 5) for (const s of this._segments) s.crowd.cheer(1.1) })
    this.listen('round:end', () => { for (const s of this._segments) s.crowd.cheer(2) })
    this.listen('fighter:ko', () => {
      for (const s of this._segments) s.crowd.cheer(3)
      this._eyeFlare = 1.4
      this.sfx('moo', { vol: 0.85, pitch: 0.6 }) // the statues approve
      this._confettiRain(-1)
      this._confettiRain(1)
    })
  }

  // -- hazard: STRUCTURAL WEAKNESS ------------------------------------------

  _triggerHazard(side) {
    const hz = this._hazards.find((h) => h.side === side)
    if (!hz || !hz.chunk || hz.pending || hz.cool > 0) return
    hz.pending = true
    hz.t = 0
    hz.cool = HAZARD_COOLDOWN
    // telegraph: cracking masonry, rumble, red confetti from the stands
    this.sfx('break', { vol: 0.45, pitch: 0.6 })
    this.sfx('thud', { vol: 0.5, pitch: 0.7 })
    this.emit('camera:shake', { mag: 0.25 })
    try { this.audio?.crowd?.('wild') } catch (e) { /* bloodthirsty and mute */ }
    this._confettiRain(side)
  }

  _updateHazards(dt) {
    for (const hz of this._hazards) {
      hz.cool = Math.max(0, hz.cool - dt)
      // masons rebuild the chunk between collapses (scale-pop back in)
      if (!hz.chunk && hz.respawn > 0) {
        hz.respawn -= dt
        if (hz.respawn <= 0) {
          this._attachChunk(hz)
          hz.chunk.scale.setScalar(0.01)
          hz.grow = 0
        }
      }
      if (hz.chunk && hz.grow !== undefined) {
        hz.grow = Math.min(1, hz.grow + dt * 2.5)
        const s = 0.01 + 0.99 * hz.grow
        hz.chunk.scale.setScalar(s)
        if (hz.grow >= 1) delete hz.grow
      }
      if (!hz.pending) continue
      hz.t += dt
      // wobble + grinding dust while the crack propagates
      hz.column.rotation.z = Math.sin(hz.t * 38) * 0.016 * -hz.side
      if (hz.chunk) {
        hz.chunk.rotation.z = 0.07 * -hz.side + Math.sin(hz.t * 46) * 0.05 * -hz.side
        if ((hz.t * 5 | 0) !== ((hz.t - dt) * 5 | 0)) {
          this._burst(hz.column.position.x, hz.topY + 0.3, hz.column.position.z, 3, {
            colors: SAND_POOF, speed: 0.9, up: 0.6, grav: 3.5, life: 0.8, size: 0.8,
          })
        }
      }
      if (hz.t >= 0.95) this._toppleChunk(hz)
    }
  }

  _toppleChunk(hz) {
    hz.pending = false
    hz.column.rotation.z = 0
    const chunk = hz.chunk
    hz.chunk = null
    hz.respawn = CHUNK_RESPAWN
    if (!chunk) return

    // reparent at world transform, then hand it to physics
    const wp = chunk.getWorldPosition(new THREE.Vector3())
    const wq = chunk.getWorldQuaternion(new THREE.Quaternion())
    hz.column.remove(chunk)
    chunk.position.copy(wp)
    chunk.quaternion.copy(wq)
    this.group.add(chunk)

    this.emit('caption', { text: 'STRUCTURAL WEAKNESS' })
    this.sfx('break', { vol: 0.95 })
    this.emit('camera:shake', { mag: 0.5 })

    const rng = this._rng
    const MASS = 14
    // tumble inward AND toward the middle of the round floor
    const zPush = (1.4 + rng() * 1.4) * -Math.sign(hz.z || 1)
    const handle = this.addBreakable(chunk, { shape: 'cylinder', mass: MASS, health: 50, kind: 'columnChunk' })
    if (handle) {
      // shove it inward off the column, spinning — applied above center for
      // tumble. cannon impulses are raw (dv = imp/mass), so scale by mass.
      try {
        this.physics?.impulse?.(handle,
          [-hz.side * (5.2 + rng() * 2.2) * MASS, 1.4 * MASS, zPush * MASS],
          [wp.x, wp.y + 0.7, wp.z])
      } catch (e) { /* it'll fall on its own */ }
      this._fallingChunks.push({ handle, mesh: chunk, ttl: 2.8, hit: new Set(), landed: false, side: hz.side })
    } else {
      // physics unavailable: cheap scripted fall so the moment still lands
      this._fallingChunks.push({ handle: null, mesh: chunk, ttl: 2.8, hit: new Set(), landed: false, side: hz.side, vx: -hz.side * 4.5, vy: 0.5, vz: zPush })
    }
  }

  _updateFallingChunks(dt) {
    for (let i = this._fallingChunks.length - 1; i >= 0; i--) {
      const fc = this._fallingChunks[i]
      fc.ttl -= dt
      const pos = fc.handle?.mesh?.position || fc.mesh?.position
      if (fc.ttl <= 0 || !pos) { this._fallingChunks.splice(i, 1); continue }

      if (!fc.handle) { // scripted fallback fall
        fc.vy -= 22 * dt
        pos.x += fc.vx * dt
        pos.y += fc.vy * dt
        pos.z += fc.vz * dt
        fc.mesh.rotation.z += -fc.side * 3.4 * dt
        if (pos.y < 0.55) { pos.y = 0.55; fc.vx = 0; fc.vy = 0; fc.vz = 0 }
      }

      // ground slam: dust, shake, thud (once)
      if (!fc.landed && pos.y < 0.9) {
        fc.landed = true
        this.sfx('thud', { vol: 0.85, pitch: 0.75 })
        this.emit('camera:shake', { mag: 0.45 })
        this._burst(pos.x, 0.3, pos.z, Math.max(5, Math.round(10 * (this.quality.particleScale ?? 1))), {
          colors: SAND_POOF, speed: 2.4, up: 1.8, grav: 4, life: 0.9, size: 1.1,
        })
      }

      // squash anyone under the arc of history
      const vel = fc.handle?.body?.velocity
      const speed = vel ? Math.hypot(vel.x || 0, vel.y || 0, vel.z || 0) : (fc.landed ? 0 : 6)
      if (speed < 2.5) continue
      for (const f of this._fighters) {
        try {
          if (!f?.pos || fc.hit.has(f) || !(f.hp > 0)) continue
          // 2D trigger zone: XZ disc around the tumbling chunk
          const dx = f.pos.x - pos.x
          const dz = (f.pos.z ?? 0) - (pos.z ?? 0)
          if (Math.hypot(dx, dz) > 1.8) continue
          if (f.pos.y > pos.y + 2.2) continue
          fc.hit.add(f)
          const d = Math.hypot(dx, dz) || 1
          this._hurtFighter(f, CHUNK_DMG, [(dx / d) * 7.5, 7.5, (dz / d) * 7.5 + (this._rng() - 0.5) * 1.5])
        } catch (e) { /* fighter mid-teardown */ }
      }
    }
  }

  // Defensive fighter damage — combat internals may shift; never crash the arena.
  _hurtFighter(f, dmg, imp) {
    try {
      const match = f.match
      if (match && match.phase !== 'fight') return
      if (f.isInvulnerable?.()) return
      f.setHp?.(f.hp - dmg)
      if (typeof f.damageTakenThisRound === 'number') f.damageTakenThisRound += dmg
      this.emit('fighter:hit', { slot: f.slot, damage: dmg, move: 'structural-weakness', counter: false, combo: 0 })
      if (f.hp <= 0 && match?.onKO) {
        match.forceRagdoll?.(f, imp, 2.4)
        match.onKO(f)
      } else {
        match?.forceRagdoll?.(f, imp, 2.0)
      }
    } catch (e) { console.warn('[arena] column hit failed', e) }
  }

  // -- ArenaInstance hooks --------------------------------------------------

  update(dt) {
    this._time += dt

    // recently-launched fighter bookkeeping (hazard trigger candidates)
    for (let i = this._launched.length - 1; i >= 0; i--) {
      this._launched[i].ttl -= dt
      if (this._launched[i].ttl <= 0) this._launched.splice(i, 1)
    }

    // the wave — hands up, section by section, around the bowl
    const w = this._wave
    w.timer -= dt
    if (w.timer <= 0) { w.timer = 7 + this._rng() * 5; w.idx = 0; w.delay = 0 }
    if (w.idx < this._segments.length) {
      w.delay -= dt
      if (w.delay <= 0) {
        this._segments[w.idx].crowd.cheer(1.7)
        w.idx++
        w.delay = 0.16
      }
    }

    // an unexplained, distant moo. the statues? surely not.
    this._mooCool -= dt
    if (this._mooCool <= 0) {
      this._mooCool = 16 + this._rng() * 14
      this.sfx('moo', { vol: 0.2, pitch: 0.5 })
    }

    this._updateHazards(dt)
    this._updateFallingChunks(dt)
    this._updateConfetti(dt)
    super.update(dt)
  }

  onRagdollLaunch(fighter) {
    // capture fighter refs for chunk damage (combat hands them to us here)
    if (fighter) {
      this._fighters.add(fighter)
      if (fighter.foe) this._fighters.add(fighter.foe)
      const all = fighter.match?.fighters
      if (Array.isArray(all)) for (const f of all) if (f) this._fighters.add(f)
      this._launched.push({ f: fighter, ttl: 3.5 })
    }
    try { this.audio?.crowd?.('wild') } catch (e) { /* panem et circenses */ }
    for (const s of this._segments) s.crowd.cheer(2.2)
    this._eyeFlare = Math.max(this._eyeFlare, 0.8)
    if (this.physics?.presetName === 'unhinged') {
      // spectators in the splash zone discover gravity
      const near = (fighter?.pos?.x ?? 0) >= 0 ? this._segments.slice(-2) : this._segments.slice(0, 2)
      for (const s of near) s.crowd.knockOverRandom(2 + Math.floor(this._rng() * 3))
      this.sfx('boing', { vol: 0.5 })
    }
  }
}

export const BullMarketColosseum = {
  id: 'bull-market-colosseum',
  name: 'BULL MARKET COLOSSEUM',
  music: 'battle_colosseum',
  build(ctx) { return new BullMarketColosseumArena(ctx) },
}
