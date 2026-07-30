// CRYPTO PUNK'D — The Glitched Detective.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// Original block-built humanoid: perfectly square head with an animated digital
// face (procedural canvas texture — blinking cyan pixel eyes that glitch),
// rectangular limbs, boxy dark trench coat, small geometric hat, purple + cyan
// glitch accents, magnifying lens in hand. Technical trickster: teleports,
// clones, detachable body pieces. All geometry, textures, animation and move
// scripts are procedural — no assets, no extra deps.
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// palette (costume 0: noir cyan / costume 1: vaporwave gold)
// ---------------------------------------------------------------------------
const PAL = [
  {
    coat: 0x23262f, coatDark: 0x171921, trim: 0x2ee6ff, accent: 0x8b5cf6,
    skin: 0x4a5266, hand: 0x59637d, shirt: 0x2a1e45, hat: 0x14161d,
    hatBand: 0x2ee6ff, shoe: 0x101219, sole: 0x2ee6ff, lensRing: 0xd7b45a,
    glass: 0x9fe8ff, eye: '#2ee6ff', glitchA: '#ff3df0', glitchB: '#2ee6ff',
  },
  {
    coat: 0x3a2160, coatDark: 0x241240, trim: 0xffcf3d, accent: 0x2ee6ff,
    skin: 0x50485e, hand: 0x645a75, shirt: 0x141d3a, hat: 0x2a1747,
    hatBand: 0xffcf3d, shoe: 0x161020, sole: 0xffcf3d, lensRing: 0x2ee6ff,
    glass: 0xffd9fb, eye: '#ff3df0', glitchA: '#2ee6ff', glitchB: '#ffcf3d',
  },
]

// ---------------------------------------------------------------------------
// tiny procedural-model helpers (inline — character files are self-contained)
// ---------------------------------------------------------------------------
function lamb(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts })
}

function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 10, 1), material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

// static wrapper: bakes a base rotation between an animated bone and its meshes,
// so every animated bone starts at rotation (0,0,0) = bind pose.
function bent(parent, rz = 0, rx = 0, ry = 0) {
  const g = new THREE.Group()
  g.rotation.set(rx, ry, rz)
  parent.add(g)
  return g
}

// ---------------------------------------------------------------------------
// animated digital face — 64x64 canvas texture, redrawn via onBeforeRender.
// Blinking square cyan eyes; random RGB-split glitch bursts. Fails silently
// (returns null) when no canvas is available — a mesh fallback is used then.
// ---------------------------------------------------------------------------
function makeFace(p) {
  let tex = null, ctx = null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    ctx = canvas.getContext('2d')
    if (!ctx) return null
    tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
  } catch { return null }

  let last = -1e9
  let glitch = 0
  const draw = (now) => {
    if (now - last < 110) return
    last = now
    try {
      // dark screen + faint scanlines
      ctx.fillStyle = '#07080f'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = '#0c0e1a'
      for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 3)

      if (glitch <= 0 && Math.random() < 0.09) glitch = 2 + ((Math.random() * 2) | 0)
      const g = glitch > 0
      if (g) glitch--

      // eyes: 10x10 pixel blocks, blink to slits on a ~3.4s cycle
      const blink = (now % 3400) > 3230
      const eh = blink ? 2 : 10
      const jx = g ? ((Math.random() * 7) | 0) - 3 : 0
      const jy = g ? ((Math.random() * 5) | 0) - 2 : 0
      ctx.fillStyle = p.eye
      ctx.fillRect(13 + jx, 22 + jy + (10 - eh), 10, eh)
      ctx.fillRect(41 - jx, 22 - jy + (10 - eh), 10, eh)
      if (!blink) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(16 + jx, 25 + jy, 3, 3)
        ctx.fillRect(44 - jx, 25 - jy, 3, 3)
      }
      // flat pixel mouth (widens into a static bar mid-glitch)
      ctx.fillStyle = '#8b5cf6'
      ctx.fillRect(g ? 18 : 24, 45, g ? 28 : 16, 3)

      if (g) {
        // RGB-split bands + pixel noise
        ctx.fillStyle = p.glitchA
        ctx.globalAlpha = 0.55
        ctx.fillRect(0, 12 + ((Math.random() * 34) | 0), 64, 3)
        ctx.fillStyle = p.glitchB
        ctx.fillRect(0, 8 + ((Math.random() * 44) | 0), 64, 2)
        ctx.globalAlpha = 1
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = Math.random() < 0.5 ? p.glitchA : p.glitchB
          ctx.fillRect((Math.random() * 60) | 0, (Math.random() * 60) | 0, 3, 3)
        }
      }
      tex.needsUpdate = true
    } catch { /* never let the face crash a frame */ }
  }
  draw(0)
  return { tex, draw }
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, ~1.85 m tall
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const p = PAL[costume === 1 ? 1 : 0]
  const group = new THREE.Group()
  const bones = {}

  const coatM = lamb(p.coat)
  const coatDarkM = lamb(p.coatDark)
  const trimM = lamb(p.trim)
  trimM.emissive = new THREE.Color(0x0a3540)
  const accentM = lamb(p.accent)
  const skinM = lamb(p.skin)
  const handM = lamb(p.hand)
  const shirtM = lamb(p.shirt)
  const hatM = lamb(p.hat)
  const bandM = lamb(p.hatBand)
  const shoeM = lamb(p.shoe)
  const soleM = lamb(p.sole)
  const ringM = lamb(p.lensRing)
  const glassM = lamb(p.glass, { transparent: true, opacity: 0.45 })

  // --- hips -----------------------------------------------------------------
  const hips = pivot(group, 0, 0.86, 0)
  bones.hips = hips
  hips.add(box(0.34, 0.2, 0.42, coatDarkM, 0, 0.0, 0))
  hips.add(box(0.36, 0.07, 0.44, accentM, 0, 0.08, 0)) // belt of glitch

  // --- legs: rectangular columns, square shoes -----------------------------
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.06, 0.13 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    leg.add(box(0.17, 0.42, 0.19, coatDarkM, 0, -0.21, 0))
    const shin = pivot(leg, 0, -0.42, 0)
    bones[side === 1 ? 'shinL' : 'shinR'] = shin
    shin.add(box(0.15, 0.32, 0.17, skinM, 0, -0.17, 0))
    shin.add(box(0.32, 0.11, 0.18, shoeM, 0.07, -0.325, 0))
    shin.add(box(0.34, 0.035, 0.2, soleM, 0.07, -0.372, 0)) // glowing sole
  }

  // --- torso + trench coat shell -------------------------------------------
  const torso = pivot(hips, 0, 0.08, 0)
  bones.torso = torso
  torso.add(box(0.46, 0.48, 0.34, shirtM, 0.01, 0.26, 0))
  torso.add(box(0.5, 0.54, 0.42, coatM, -0.02, 0.27, 0)) // coat body
  torso.add(box(0.52, 0.56, 0.1, coatM, -0.02, 0.27, 0.22))
  torso.add(box(0.52, 0.56, 0.1, coatM, -0.02, 0.27, -0.22))
  // lapels — angled cyan-trimmed slabs
  torso.add(box(0.06, 0.3, 0.12, trimM, 0.24, 0.36, 0.1, 0, 0, -0.35))
  torso.add(box(0.06, 0.3, 0.12, trimM, 0.24, 0.36, -0.1, 0, 0, -0.35))
  torso.add(box(0.05, 0.18, 0.06, accentM, 0.26, 0.2, 0)) // tie of chaos

  // coat hem — extra bone, spring-follow secondary motion
  const coat = pivot(torso, -0.04, 0.02, 0)
  bones.coat = coat
  const coatW = bent(coat, 0.06)
  coatW.add(box(0.54, 0.46, 0.46, coatM, -0.04, -0.24, 0))
  coatW.add(box(0.55, 0.06, 0.47, trimM, -0.04, -0.45, 0)) // glowing hem line

  // --- arms: rectangular, boxy shoulder pads -------------------------------
  for (const side of [1, -1]) {
    const arm = pivot(torso, 0, 0.42, 0.3 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    arm.add(box(0.2, 0.14, 0.2, coatDarkM, 0, 0.02, 0.02 * side)) // pad
    arm.add(box(0.15, 0.36, 0.17, coatM, 0, -0.2, 0))
    const fore = pivot(arm, 0, -0.4, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    fore.add(box(0.13, 0.3, 0.15, coatM, 0, -0.14, 0))
    fore.add(box(0.14, 0.05, 0.16, trimM, 0, -0.29, 0)) // cuff
    const hand = box(0.17, 0.14, 0.15, handM, 0.02, -0.38, 0)
    fore.add(hand)
    fore.userData.handMesh = hand // Detached-Hand Punch borrows this
  }

  // magnifying lens — extra bone parented to the right hand
  const lens = pivot(bones.forearmR, 0.05, -0.44, 0)
  bones.lens = lens
  const lensW = bent(lens, -0.5)
  lensW.add(cyl(0.03, 0.035, 0.22, ringM, 0, 0.09, 0))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), ringM)
  ring.position.y = 0.34
  ring.rotation.y = Math.PI / 2
  lensW.add(ring)
  const glassMesh = cyl(0.145, 0.145, 0.02, glassM, 0, 0.34, 0, Math.PI / 2)
  lensW.add(glassMesh)
  lens.userData.glassMat = glassM
  lens.userData.glassBaseHex = glassM.color.getHex()

  // --- head: perfect cube with digital face screen -------------------------
  const head = pivot(torso, 0.01, 0.46, 0)
  bones.head = head
  head.add(box(0.12, 0.1, 0.14, skinM, 0, 0.02, 0)) // neck
  head.add(box(0.42, 0.42, 0.42, skinM, 0, 0.24, 0))
  head.add(box(0.43, 0.045, 0.43, accentM, 0, 0.08, 0)) // jaw seam accent
  const face = makeFace(p)
  if (face) {
    const faceMat = new THREE.MeshBasicMaterial({ map: face.tex })
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), faceMat)
    faceMesh.position.set(0.2151, 0.24, 0)
    faceMesh.rotation.y = Math.PI / 2
    head.add(faceMesh)
    faceMesh.onBeforeRender = () => {
      try { face.draw(typeof performance !== 'undefined' ? performance.now() : Date.now()) } catch { /* face stays */ }
    }
    head.userData.faceTex = face.tex
  } else {
    // node/canvas-less fallback: static pixel eyes as geometry
    head.add(box(0.02, 0.3, 0.3, lamb(0x07080f), 0.215, 0.24, 0))
    head.add(box(0.02, 0.07, 0.07, trimM, 0.226, 0.26, 0.08))
    head.add(box(0.02, 0.07, 0.07, trimM, 0.226, 0.26, -0.08))
    head.add(box(0.02, 0.03, 0.11, accentM, 0.226, 0.15, 0))
  }
  // glitch chips floating off the head corner
  head.add(box(0.05, 0.05, 0.05, trimM, -0.18, 0.46, 0.18))
  head.add(box(0.04, 0.04, 0.04, accentM, -0.25, 0.4, 0.24))

  // small geometric hat — extra bone, spring-follow
  const hat = pivot(head, -0.01, 0.44, 0)
  bones.hat = hat
  const hatW = bent(hat, 0.05)
  hatW.add(box(0.54, 0.045, 0.54, hatM, 0.01, 0.01, 0)) // brim
  hatW.add(box(0.32, 0.14, 0.32, hatM, -0.01, 0.095, 0)) // crown
  hatW.add(box(0.34, 0.05, 0.34, bandM, -0.01, 0.045, 0)) // band

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0].
// Clips are AUTHORED against a 0.98 hip height for comfortable numbers; a
// normalization pass below rescales every hips pos key to the actual 0.86 rig.
// hips position keys are ABSOLUTE local values (Animator sets, not adds).
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.98, 0]
const HIP_SCALE = 0.86 / 0.98

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.0, [0, 0.03, 0.01], [0, 0.955, 0]), K(2.0, Z, HIP)],
      torso: [K(0, [0, 0, 0.03]), K(1.0, [0.02, -0.04, 0.01]), K(2.0, [0, 0, 0.03])],
      // detective scan: head snaps left, holds, snaps right — digital, no ease feel
      head: [K(0, [0, 0.22, 0]), K(0.85, [0, 0.22, 0]), K(0.95, [0, -0.24, 0.02]), K(1.85, [0, -0.24, 0.02]), K(2.0, [0, 0.22, 0])],
      hat: [K(0, Z), K(1.0, [0.03, 0, -0.04]), K(2.0, Z)],
      coat: [K(0, Z), K(1.0, [0, 0, 0.05]), K(2.0, Z)],
      armL: [K(0, [0, 0, 0.08]), K(1.0, [0.05, 0, 0.13]), K(2.0, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(1.0, [-0.04, 0, 0.4]), K(2.0, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.25])],
      // lens hand half-raised, ready to inspect
      forearmR: [K(0, [0, 0, 1.15]), K(1.0, [0, 0, 1.25]), K(2.0, [0, 0, 1.15])],
      lens: [K(0, Z), K(1.0, [0, 0.1, 0.08]), K(2.0, Z)],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
      shinL: [K(0, Z)], shinR: [K(0, Z)],
    },
  },

  walk: {
    duration: 0.55, loop: true,
    tracks: {
      hips: [K(0, [0, 0.05, -0.02], [0, 0.96, 0]), K(0.1375, [0, 0, -0.02], [0, 0.925, 0]), K(0.275, [0, -0.05, -0.02], [0, 0.965, 0]), K(0.4125, [0, 0, -0.02], [0, 0.925, 0]), K(0.55, [0, 0.05, -0.02], [0, 0.96, 0])],
      legL: [K(0, [0, 0, 0.55]), K(0.275, [0, 0, -0.5]), K(0.55, [0, 0, 0.55])],
      legR: [K(0, [0, 0, -0.5]), K(0.275, [0, 0, 0.55]), K(0.55, [0, 0, -0.5])],
      shinL: [K(0, [0, 0, -0.25]), K(0.275, [0, 0, -0.6]), K(0.55, [0, 0, -0.25])],
      shinR: [K(0, [0, 0, -0.6]), K(0.275, [0, 0, -0.25]), K(0.55, [0, 0, -0.6])],
      torso: [K(0, [0, -0.05, -0.07]), K(0.275, [0, 0.05, -0.07]), K(0.55, [0, -0.05, -0.07])],
      head: [K(0, [0, 0.05, 0.04]), K(0.275, [0, -0.05, 0.04]), K(0.55, [0, 0.05, 0.04])],
      armL: [K(0, [0, 0, -0.4]), K(0.275, [0, 0, 0.45]), K(0.55, [0, 0, -0.4])],
      armR: [K(0, [0, 0, 0.5]), K(0.275, [0, 0, 0.05]), K(0.55, [0, 0, 0.5])],
      forearmL: [K(0, [0, 0, 0.3])],
      forearmR: [K(0, [0, 0, 1.0])],
      coat: [K(0, [0, 0, 0.14]), K(0.275, [0, 0, -0.1]), K(0.55, [0, 0, 0.14])],
      hat: [K(0, Z), K(0.1375, [0.05, 0, 0.05]), K(0.275, Z), K(0.4125, [0.05, 0, 0.05]), K(0.55, Z)],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, 0.08], [0, 1.02, 0]), K(0.5, [0, 0, 0.08], [0, 1.02, 0])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.9]), K(0.5, [0, 0, 0.8])],
      legR: [K(0, Z), K(0.12, [0, 0, 0.5]), K(0.5, [0, 0, 0.4])],
      shinL: [K(0, Z), K(0.12, [0, 0, -0.9]), K(0.5, [0, 0, -0.8])],
      shinR: [K(0, Z), K(0.12, [0, 0, -0.5]), K(0.5, [0, 0, -0.4])],
      armL: [K(0, Z), K(0.12, [-0.4, 0, 1.4]), K(0.5, [-0.4, 0, 1.3])],
      armR: [K(0, Z), K(0.12, [0.4, 0, 1.2]), K(0.5, [0.4, 0, 1.1])],
      torso: [K(0, Z), K(0.12, [0, 0, 0.14])],
      head: [K(0, Z), K(0.12, [0, 0, -0.12])],
      coat: [K(0, Z), K(0.12, [0, 0, -0.5]), K(0.5, [0, 0, -0.4])],
      hat: [K(0, Z), K(0.12, [-0.12, 0, -0.1])],
    },
  },

  fall: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.1], HIP)],
      torso: [K(0, [0, 0, 0.16])],
      head: [K(0, [0, 0, -0.08])],
      armL: [K(0, [-0.3, 0, 2.3]), K(0.25, [-0.5, 0, 2.6]), K(0.5, [-0.3, 0, 2.3])],
      armR: [K(0, [0.5, 0, 2.6]), K(0.25, [0.3, 0, 2.3]), K(0.5, [0.5, 0, 2.6])],
      legL: [K(0, [-0.25, 0, 0.4]), K(0.25, [-0.25, 0, 0.15]), K(0.5, [-0.25, 0, 0.4])],
      legR: [K(0, [0.25, 0, 0.15]), K(0.25, [0.25, 0, 0.4]), K(0.5, [0.25, 0, 0.15])],
      shinL: [K(0, [0, 0, -0.4])], shinR: [K(0, [0, 0, -0.3])],
      coat: [K(0, [0, 0, -0.7]), K(0.25, [0, 0, -0.55]), K(0.5, [0, 0, -0.7])],
      hat: [K(0, [0.15, 0, 0.12])],
    },
  },

  crouch: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.62, 0]), K(0.3, [0, 0, -0.08], [0, 0.605, 0]), K(0.6, [0, 0, -0.08], [0, 0.62, 0])],
      legL: [K(0, [-0.4, 0, 0.95])], legR: [K(0, [0.4, 0, 0.95])],
      shinL: [K(0, [0, 0, -1.3])], shinR: [K(0, [0, 0, -1.3])],
      torso: [K(0, [0, 0, -0.22])],
      head: [K(0, [0, 0.1, 0.2])],
      armL: [K(0, [0.3, 0, 0.5])], armR: [K(0, [-0.3, 0, 0.6])],
      forearmL: [K(0, [0, 0, 1.0])], forearmR: [K(0, [0, 0, 1.2])],
      coat: [K(0, [0, 0, 0.4])],
      hat: [K(0, [0, 0, 0.08])],
    },
  },

  block: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.04, 0.94, 0])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0.02, 0, 0.12]), K(0.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.15])],
      // forearms crossed, lens up like a riot shield
      armL: [K(0, [0.35, 0, 0.85])], armR: [K(0, [-0.35, 0, 1.0])],
      forearmL: [K(0, [0, 0, 1.7])], forearmR: [K(0, [0, 0, 1.9])],
      lens: [K(0, [0, 0, 0.4])],
      legL: [K(0, [-0.12, 0, 0.12])], legR: [K(0, [0.12, 0, 0.12])],
      shinL: [K(0, [0, 0, -0.15])], shinR: [K(0, [0, 0, -0.15])],
      coat: [K(0, [0, 0, 0.1])],
      hat: [K(0, [0, 0, 0.06])],
    },
  },

  hitLight: {
    duration: 0.26, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.1], [-0.07, 0.95, 0]), K(0.26, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.12, 0.3]), K(0.26, Z)],
      head: [K(0, Z), K(0.05, [0, 0.14, 0.45]), K(0.26, Z)],
      armL: [K(0, Z), K(0.05, [0.3, 0, -0.5]), K(0.26, Z)],
      armR: [K(0, Z), K(0.05, [-0.3, 0, -0.4]), K(0.26, Z)],
      hat: [K(0, Z), K(0.06, [0.3, 0, 0.25]), K(0.26, Z)],
      coat: [K(0, Z), K(0.06, [0, 0, -0.3]), K(0.26, Z)],
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.24], [-0.2, 0.9, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.18, 0.55]), K(0.42, Z)],
      head: [K(0, Z), K(0.06, [0, 0.2, 0.7]), K(0.42, Z)],
      armL: [K(0, Z), K(0.06, [0.55, 0, -1.1]), K(0.42, Z)],
      armR: [K(0, Z), K(0.06, [-0.55, 0, -1.0]), K(0.42, Z)],
      legL: [K(0, Z), K(0.07, [0, 0, 0.45]), K(0.42, Z)],
      shinL: [K(0, Z), K(0.07, [0, 0, -0.3]), K(0.42, Z)],
      hat: [K(0, Z), K(0.07, [0.55, 0, 0.5]), K(0.42, Z)],
      coat: [K(0, Z), K(0.07, [0, 0, -0.6]), K(0.42, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.35], HIP)],
      torso: [K(0, [0, 0, 0.6]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, 0.6])],
      head: [K(0, [0, 0, 0.5])],
      armL: [K(0, [-0.4, 0, 2.4]), K(0.25, [-0.2, 0, 2.6]), K(0.5, [-0.4, 0, 2.4])],
      armR: [K(0, [0.2, 0, 2.6]), K(0.25, [0.4, 0, 2.4]), K(0.5, [0.2, 0, 2.6])],
      legL: [K(0, [0, 0, 0.9]), K(0.25, [0, 0, 0.7]), K(0.5, [0, 0, 0.9])],
      legR: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.75]), K(0.5, [0, 0, 0.55])],
      shinL: [K(0, [0, 0, -0.7])], shinR: [K(0, [0, 0, -0.5])],
      coat: [K(0, [0, 0, -1.0])],
      hat: [K(0, [-0.5, 0, -0.4])],
    },
  },

  knockdown: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.45, [0, 0, 1.35], [0, 0.335, 0]), K(0.9, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])], legR: [K(0, [0, 0, 0.5])],
      shinL: [K(0, [0, 0, -0.3])], shinR: [K(0, [0, 0, -0.4])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.25])],
      armL: [K(0, [1.0, 0, 0.3])], armR: [K(0, [-1.0, 0, 0.3])],
      coat: [K(0, [0, 0, -0.4])],
      hat: [K(0, [0.4, 0, 0.5])],
    },
  },

  getup: {
    duration: 0.7, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.25, [0, 0, 0.5], [0, 0.5, 0]), K(0.5, [0, 0, 0.08], [0, 0.78, 0]), K(0.7, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.35, [0, 0, 0.7]), K(0.7, Z)],
      legR: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, 0.3]), K(0.7, Z)],
      shinL: [K(0, [0, 0, -0.3]), K(0.35, [0, 0, -0.8]), K(0.7, Z)],
      shinR: [K(0, [0, 0, -0.4]), K(0.35, [0, 0, -0.5]), K(0.7, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, -0.3]), K(0.7, Z)],
      head: [K(0, [0, 0, -0.25]), K(0.5, [0, 0, 0.1]), K(0.7, Z)],
      armL: [K(0, [1.0, 0, 0.3]), K(0.35, [0.3, 0, -0.5]), K(0.7, Z)],
      armR: [K(0, [-1.0, 0, 0.3]), K(0.35, [-0.3, 0, -0.5]), K(0.7, [0, 0, 0.35])],
      // straightens the hat on the way up. priorities.
      hat: [K(0, [0.4, 0, 0.5]), K(0.5, [0.2, 0, 0.3]), K(0.6, [-0.08, 0, -0.08]), K(0.7, Z)],
      coat: [K(0, [0, 0, -0.4]), K(0.55, [0, 0, 0.2]), K(0.7, Z)],
    },
  },

  // materializes mid-scene-load: glitch twitches, inspects the player through
  // the lens, tips the hat
  entrance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.98, 0]), K(0.1, [0, 0.5, 0], [0, 0.9, 0]), K(0.16, [0, -0.4, 0], [0, 1.04, 0]), K(0.22, [0, 0.2, 0], [0, 0.94, 0]), K(0.3, Z, HIP), K(2.4, Z, HIP)],
      torso: [K(0, [0, 0, 0.3]), K(0.3, Z), K(0.6, [0, 0.15, -0.05]), K(1.6, [0, 0.15, -0.05]), K(1.9, Z), K(2.4, Z)],
      head: [K(0, [0, 0.6, 0]), K(0.14, [0, -0.5, 0]), K(0.3, Z), K(0.6, [0, 0.12, 0.12]), K(1.6, [0, 0.12, 0.12]), K(1.9, [0, 0, -0.1]), K(2.15, Z), K(2.4, Z)],
      // lens up to the eye, long suspicious stare
      armR: [K(0, Z), K(0.6, [0, 0, 1.9]), K(1.6, [0, 0, 1.9]), K(1.9, [0, 0, 0.5]), K(2.4, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.0]), K(0.6, [0, 0, 2.1]), K(1.6, [0, 0, 2.1]), K(1.9, [0, 0, 1.2]), K(2.4, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.6, [0, 0, -0.6]), K(1.6, [0, 0, -0.6]), K(1.9, Z), K(2.4, Z)],
      // hat tip with the left hand
      armL: [K(0, Z), K(1.9, [0, 0, 0.1]), K(2.05, [-0.3, 0, 2.3]), K(2.25, [-0.3, 0, 2.3]), K(2.4, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(2.05, [0, 0, 0.9]), K(2.25, [0, 0, 0.9]), K(2.4, [0, 0, 0.25])],
      hat: [K(0, Z), K(2.05, [0, 0, 0.35]), K(2.25, [0, 0, 0.35]), K(2.4, Z)],
      legL: [K(0, [0, 0, 0.04])], legR: [K(0, [0, 0, -0.04])],
      coat: [K(0, [0, 0, -0.6]), K(0.3, [0, 0, 0.15]), K(0.6, Z), K(2.4, Z)],
    },
  },

  // case closed: lens raised to the sky, hat spin-tap, coat billowing
  win: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.5, Z, [0, 1.02, 0]), K(1.2, [0, 0.3, 0], [0, 0.98, 0]), K(1.8, [0, -0.3, 0], [0, 1.0, 0]), K(2.4, Z, HIP)],
      armR: [K(0, [0, 0, 0.35]), K(0.4, [0, 0, 2.9]), K(1.9, [0, 0, 2.9]), K(2.4, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.4, [0, 0, 0.2]), K(1.9, [0, 0, 0.2]), K(2.4, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.4, [0, 0.4, 0]), K(1.0, [0, -0.4, 0]), K(1.6, [0, 0.4, 0]), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.5, [-0.3, 0, 2.2]), K(0.9, [-0.3, 0, 2.2]), K(1.2, [0, 0, 0.08]), K(2.4, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.5, [0, 0, 1.0]), K(0.9, [0, 0, 1.0]), K(1.2, [0, 0, 0.25])],
      hat: [K(0, Z), K(0.55, [0, 0, 0.45]), K(0.85, [0, 0.6, 0.45]), K(1.1, Z), K(2.4, Z)],
      head: [K(0, Z), K(0.4, [0, 0, 0.3]), K(1.9, [0, 0, 0.28]), K(2.4, Z)],
      torso: [K(0, Z), K(0.4, [0, 0, 0.12]), K(1.9, [0, 0, 0.1]), K(2.4, Z)],
      coat: [K(0, Z), K(0.5, [0, 0, -0.35]), K(1.2, [0, 0, -0.2]), K(1.8, [0, 0, -0.35]), K(2.4, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  lose: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.8, 0]), K(1.0, [0, 0.06, 0], [0, 0.785, 0]), K(2.0, Z, [0, 0.8, 0])],
      torso: [K(0, [0, 0, -0.45]), K(1.0, [0, 0, -0.5]), K(2.0, [0, 0, -0.45])],
      // head twitches — corrupted save file
      head: [K(0, [0, 0, -0.5]), K(0.9, [0, 0, -0.52]), K(0.96, [0, 0.4, -0.4]), K(1.02, [0, -0.3, -0.55]), K(1.1, [0, 0, -0.5]), K(2.0, [0, 0, -0.5])],
      armL: [K(0, [0, 0, 0.3])], armR: [K(0, [0, 0, 0.3])],
      forearmL: [K(0, [0, 0, 0.1])], forearmR: [K(0, [0, 0, 0.15])],
      legL: [K(0, [-0.3, 0, 0.9])], legR: [K(0, [0.3, 0, 0.9])],
      shinL: [K(0, [0, 0, -1.2])], shinR: [K(0, [0, 0, -1.2])],
      hat: [K(0, [0.55, 0, 0.5]), K(1.0, [0.6, 0, 0.55]), K(2.0, [0.55, 0, 0.5])],
      coat: [K(0, [0, 0, 0.5])],
    },
  },

  // polishes the lens on the coat, checks it, unimpressed
  taunt: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 0.9]), K(0.9, [0, 0, 0.9]), K(1.05, [0, 0, 1.9]), K(1.3, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 1.5]), K(0.35, [0, 0, 1.3]), K(0.5, [0, 0, 1.5]), K(0.65, [0, 0, 1.3]), K(0.9, [0, 0, 1.5]), K(1.05, [0, 0, 2.1]), K(1.3, [0, 0, 1.15])],
      lens: [K(0, Z), K(1.05, [0, 0, -0.5]), K(1.3, Z)],
      torso: [K(0, Z), K(0.2, [0, -0.15, -0.1]), K(0.9, [0, -0.15, -0.1]), K(1.05, [0, 0.1, 0.05]), K(1.3, Z)],
      head: [K(0, Z), K(0.2, [0, -0.2, 0.25]), K(0.9, [0, -0.2, 0.25]), K(1.05, [0, 0.15, 0.1]), K(1.15, [0, -0.15, 0.1]), K(1.3, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.2, 0, 0.4]), K(1.3, [0, 0, 0.08])],
      hat: [K(0, Z), K(1.05, [0, 0, 0.15]), K(1.3, Z)],
      hips: [K(0, Z, HIP)],
      coat: [K(0, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  blockJab: {
    duration: 0.3, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.07, [0, 0, -0.3]), K(0.12, [0, 0, -1.5]), K(0.3, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.07, [0, 0, 1.2]), K(0.12, [0, 0, 0.05]), K(0.3, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.07, [0, 0.25, 0]), K(0.12, [0, -0.35, 0]), K(0.3, Z)],
      hips: [K(0, Z, HIP), K(0.12, [0, -0.2, 0], [0.05, 0.97, 0]), K(0.3, Z, HIP)],
      head: [K(0, Z), K(0.12, [0, 0.1, -0.05]), K(0.3, Z)],
      armR: [K(0, [0, 0, 0.35])], forearmR: [K(0, [0, 0, 1.15])],
      coat: [K(0, Z), K(0.12, [0, 0, -0.15]), K(0.3, Z)],
    },
  },

  pixelKick: {
    duration: 0.35, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.08, [0, 0, -0.5]), K(0.14, [0, 0, 1.7]), K(0.24, [0, 0, 1.4]), K(0.35, Z)],
      shinR: [K(0, Z), K(0.08, [0, 0, -1.4]), K(0.14, [0, 0, -0.1]), K(0.35, Z)],
      hips: [K(0, Z, HIP), K(0.14, [0, 0, 0.12], [0.04, 1.0, 0]), K(0.35, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, 0.2]), K(0.35, Z)],
      head: [K(0, Z), K(0.14, [0, 0, -0.15]), K(0.35, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.14, [0.3, 0, 0.7]), K(0.35, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.14, [-0.3, 0, 0.7]), K(0.35, [0, 0, 0.35])],
      legL: [K(0, Z), K(0.14, [0, 0, -0.15]), K(0.35, Z)],
      coat: [K(0, Z), K(0.14, [0, 0, -0.5]), K(0.35, Z)],
      hat: [K(0, Z), K(0.16, [0.15, 0, 0.12]), K(0.35, Z)],
    },
  },

  lensStrike: {
    duration: 0.55, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.12, [0, 0, 2.6]), K(0.17, [0, 0, 2.6]), K(0.2, [0, 0, -0.9]), K(0.34, [0, 0, -0.7]), K(0.55, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.12, [0, 0, 0.6]), K(0.2, [0, 0, 0.1]), K(0.55, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.12, [0, 0, -0.4]), K(0.2, [0, 0, 0.3]), K(0.55, Z)],
      torso: [K(0, Z), K(0.12, [0, -0.5, -0.1]), K(0.2, [0, 0.5, 0.15]), K(0.38, [0, 0.4, 0.1]), K(0.55, Z)],
      hips: [K(0, Z, HIP), K(0.12, [0, -0.3, 0], HIP), K(0.2, [0, 0.35, 0], [0.12, 0.94, 0]), K(0.55, Z, HIP)],
      head: [K(0, Z), K(0.12, [0, -0.3, 0]), K(0.2, [0, 0.25, -0.1]), K(0.55, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.12, [0, 0, 0.6]), K(0.2, [0.3, 0, -0.8]), K(0.55, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.55, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, 0.25]), K(0.55, Z)],
      coat: [K(0, Z), K(0.2, [0, 0, -0.35]), K(0.55, Z)],
      hat: [K(0, Z), K(0.22, [0.2, 0, 0.2]), K(0.55, Z)],
    },
  },

  coatSpin: {
    duration: 0.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.09, [0, -0.6, 0], [0, 0.9, 0]), K(0.2, [0, 1.8, 0], [0, 1.0, 0]), K(0.32, [0, 4.2, 0], [0, 0.96, 0]), K(0.42, [0, 6.28, 0], [0, 1.0, 0]), K(0.52, [0, 6.28, 0], [0, 0.95, 0]), K(0.6, [0, 6.28, 0], HIP)],
      // coat flares out hard during the spin
      coat: [K(0, Z), K(0.15, [0.5, 0, -0.9]), K(0.35, [-0.5, 0, -0.9]), K(0.48, [0, 0, -0.3]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.15, [1.3, 0, 0.4]), K(0.42, [1.3, 0, 0.4]), K(0.6, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.15, [-1.3, 0, 0.4]), K(0.42, [-1.3, 0, 0.4]), K(0.6, [0, 0, 0.35])],
      torso: [K(0, Z), K(0.15, [0, 0, -0.12]), K(0.42, [0, 0, -0.12]), K(0.6, Z)],
      head: [K(0, Z), K(0.09, [0, -0.4, 0]), K(0.32, [0, 0.4, 0]), K(0.6, Z)],
      legL: [K(0, Z), K(0.3, [0, 0, 0.2]), K(0.6, Z)],
      legR: [K(0, Z), K(0.3, [0, 0, -0.2]), K(0.6, Z)],
      hat: [K(0, Z), K(0.2, [0, 0, -0.25]), K(0.42, [0, 0, -0.25]), K(0.6, Z)],
    },
  },

  glitchDodge: {
    duration: 0.35, loop: false,
    tracks: {
      // digital stutter: pose snaps with zero easing frames between extremes
      hips: [K(0, Z, HIP), K(0.05, [0, 0.4, 0.15], [0, 0.9, 0]), K(0.1, [0, -0.5, -0.1], [0, 1.03, 0]), K(0.15, [0, 0.25, 0], [0, 0.94, 0]), K(0.24, Z, HIP), K(0.35, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, 0.4, -0.2]), K(0.1, [0, -0.4, 0.2]), K(0.18, Z), K(0.35, Z)],
      head: [K(0, Z), K(0.05, [0, -0.6, 0]), K(0.1, [0, 0.6, 0]), K(0.18, Z), K(0.35, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.05, [0.8, 0, 0.9]), K(0.1, [-0.5, 0, -0.4]), K(0.2, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.05, [-0.8, 0, 0.9]), K(0.1, [0.5, 0, -0.4]), K(0.2, [0, 0, 0.35])],
      hat: [K(0, Z), K(0.08, [0.4, 0, -0.4]), K(0.16, [-0.3, 0, 0.3]), K(0.28, Z)],
      coat: [K(0, Z), K(0.08, [0, 0, -0.8]), K(0.2, [0, 0, 0.3]), K(0.35, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  handPunch: {
    duration: 0.6, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.08, [0, 0, -0.4]), K(0.13, [0, 0, -1.55]), K(0.4, [0, 0, -1.55]), K(0.5, [0, 0, -1.2]), K(0.6, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.08, [0, 0, 0.8]), K(0.13, [0, 0, 0.05]), K(0.4, [0, 0, 0.05]), K(0.6, [0, 0, 1.15])],
      torso: [K(0, Z), K(0.08, [0, 0.3, 0]), K(0.13, [0, -0.45, 0]), K(0.4, [0, -0.45, 0]), K(0.6, Z)],
      hips: [K(0, Z, HIP), K(0.13, [0, -0.25, 0], [0.08, 0.96, 0]), K(0.4, [0, -0.25, 0], [0.08, 0.96, 0]), K(0.6, Z, HIP)],
      head: [K(0, Z), K(0.13, [0, 0.2, -0.08]), K(0.4, [0, 0.2, -0.08]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.13, [0.3, 0, 0.6]), K(0.6, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.13, [0, 0, -0.25]), K(0.6, Z)],
      legR: [K(0, Z), K(0.13, [0, 0, 0.2]), K(0.6, Z)],
      coat: [K(0, Z), K(0.13, [0, 0, -0.3]), K(0.6, Z)],
      hat: [K(0, Z), K(0.15, [0.15, 0, 0.15]), K(0.6, Z)],
    },
  },

  cloneFeint: {
    duration: 0.7, loop: false,
    tracks: {
      // snaps a finger, leans back smugly while the clone does the work
      armL: [K(0, [0, 0, 0.08]), K(0.1, [0, 0, 1.6]), K(0.16, [0, 0, 1.5]), K(0.5, [0, 0, 1.5]), K(0.7, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.1, [0, 0, 1.3]), K(0.16, [0, 0, 0.9]), K(0.5, [0, 0, 0.9]), K(0.7, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.16, [0, 0, -0.2]), K(0.5, [0, 0, -0.2]), K(0.7, Z)],
      hips: [K(0, Z, HIP), K(0.16, Z, [-0.08, 0.97, 0]), K(0.5, Z, [-0.08, 0.97, 0]), K(0.7, Z, HIP)],
      head: [K(0, Z), K(0.16, [0, 0.1, 0.1]), K(0.5, [0, 0.1, 0.1]), K(0.7, Z)],
      armR: [K(0, [0, 0, 0.35]), K(0.16, [0, 0, 0.6]), K(0.7, [0, 0, 0.35])],
      coat: [K(0, Z), K(0.16, [0, 0, 0.2]), K(0.7, Z)],
      hat: [K(0, Z), K(0.2, [0, 0, -0.1]), K(0.7, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  pixelVolley: {
    duration: 0.8, loop: false,
    tracks: {
      // underhand cube flicks, alternating hands like dealing cards
      armR: [K(0, [0, 0, 0.35]), K(0.15, [0, 0, 1.2]), K(0.22, [0, 0, -1.0]), K(0.35, [0, 0, 1.2]), K(0.42, [0, 0, -1.0]), K(0.6, [0, 0, 0.35]), K(0.8, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.15, [0, 0, 1.6]), K(0.22, [0, 0, 0.2]), K(0.35, [0, 0, 1.6]), K(0.42, [0, 0, 0.2]), K(0.8, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.25, [0, 0, 1.2]), K(0.32, [0, 0, -1.0]), K(0.45, [0, 0, 1.2]), K(0.52, [0, 0, -1.0]), K(0.7, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.25, [0, 0, 1.6]), K(0.32, [0, 0, 0.2]), K(0.45, [0, 0, 1.6]), K(0.52, [0, 0, 0.2]), K(0.8, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.2, [0, -0.15, 0.05]), K(0.5, [0, 0.15, 0.05]), K(0.8, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [0, 0.94, 0]), K(0.6, Z, [0, 0.94, 0]), K(0.8, Z, HIP)],
      legL: [K(0, Z), K(0.2, [-0.15, 0, 0.2]), K(0.6, [-0.15, 0, 0.2]), K(0.8, Z)],
      legR: [K(0, Z), K(0.2, [0.15, 0, 0.2]), K(0.6, [0.15, 0, 0.2]), K(0.8, Z)],
      shinL: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.6, [0, 0, -0.3]), K(0.8, Z)],
      shinR: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.6, [0, 0, -0.3]), K(0.8, Z)],
      head: [K(0, Z), K(0.3, [0, 0, 0.1]), K(0.8, Z)],
      coat: [K(0, Z)], hat: [K(0, Z)],
    },
  },

  chainCustody: {
    duration: 0.9, loop: false,
    tracks: {
      // lunge, cuff both wrists, overhead slam
      armL: [K(0, [0, 0, 0.08]), K(0.12, [0, 0, -1.3]), K(0.3, [0, 0, -1.3]), K(0.45, [0, 0, 2.7]), K(0.58, [0, 0, -0.9]), K(0.9, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.12, [0, 0, -1.3]), K(0.3, [0, 0, -1.3]), K(0.45, [0, 0, 2.7]), K(0.58, [0, 0, -0.9]), K(0.9, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.12, [0, 0, 0.2]), K(0.45, [0, 0, 0.3]), K(0.9, [0, 0, 0.25])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.12, [0, 0, 0.2]), K(0.45, [0, 0, 0.3]), K(0.9, [0, 0, 1.15])],
      hips: [K(0, Z, HIP), K(0.12, Z, [0.12, 0.94, 0]), K(0.45, [0, 0, 0.15], [0, 1.03, 0]), K(0.58, [0, 0, -0.15], [0.1, 0.88, 0]), K(0.75, Z, HIP), K(0.9, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.45, [0, 0, 0.3]), K(0.58, [0, 0, -0.45]), K(0.75, Z), K(0.9, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.45, [0, 0, 0.25]), K(0.58, [0, 0, -0.3]), K(0.9, Z)],
      legL: [K(0, Z), K(0.12, [0, 0, 0.4]), K(0.58, [-0.2, 0, 0.3]), K(0.9, Z)],
      legR: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.58, [0.2, 0, 0.3]), K(0.9, Z)],
      coat: [K(0, Z), K(0.45, [0, 0, -0.4]), K(0.58, [0, 0, 0.3]), K(0.9, Z)],
      hat: [K(0, Z), K(0.6, [0.3, 0, 0.3]), K(0.9, Z)],
    },
  },

  evidenceBag: {
    duration: 1.0, loop: false,
    tracks: {
      // bag the head, one full spin, toss over the shoulder
      armR: [K(0, [0, 0, 0.35]), K(0.12, [0, 0, -2.0]), K(0.22, [0, 0, -1.4]), K(0.65, [0, 0, -1.4]), K(0.78, [0, 0, 2.4]), K(1.0, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.12, [0, 0, 0.3]), K(0.65, [0, 0, 0.4]), K(0.78, [0, 0, 0.2]), K(1.0, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.22, [0.8, 0, 0.5]), K(0.65, [0.8, 0, 0.5]), K(1.0, [0, 0, 0.08])],
      hips: [K(0, Z, HIP), K(0.25, [0, 1.8, 0], [0, 0.95, 0]), K(0.42, [0, 4.2, 0], [0, 1.0, 0]), K(0.58, [0, 6.28, 0], [0, 0.95, 0]), K(0.78, [0, 6.28, 0], [-0.06, 1.02, 0]), K(1.0, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.25]), K(0.58, [0, 0, -0.15]), K(0.78, [0, 0.5, 0.3]), K(1.0, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.78, [0, 0.3, 0.2]), K(1.0, Z)],
      coat: [K(0, Z), K(0.3, [0.4, 0, -0.7]), K(0.5, [-0.4, 0, -0.7]), K(0.7, [0, 0, -0.3]), K(1.0, Z)],
      legL: [K(0, Z), K(0.42, [0, 0, 0.15]), K(1.0, Z)],
      legR: [K(0, Z), K(0.42, [0, 0, -0.15]), K(1.0, Z)],
      hat: [K(0, Z), K(0.42, [0, 0, -0.2]), K(0.8, [0.2, 0, 0.2]), K(1.0, Z)],
    },
  },

  rightClickSave: {
    duration: 1.2, loop: false,
    tracks: {
      // conjures a context menu with two crisp air-clicks
      armR: [K(0, [0, 0, 0.35]), K(0.15, [0, 0, 1.5]), K(1.0, [0, 0, 1.5]), K(1.2, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.15, [0, 0, 0.9]), K(0.24, [0, 0, 1.15]), K(0.3, [0, 0, 0.9]), K(0.38, [0, 0, 1.15]), K(1.0, [0, 0, 0.95]), K(1.2, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.15, [0, 0, 0.3]), K(1.0, [0, 0, 0.3]), K(1.2, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.4, 0, 0.9]), K(1.0, [0.4, 0, 0.9]), K(1.2, [0, 0, 0.08])],
      torso: [K(0, Z), K(0.15, [0, 0.12, -0.08]), K(1.0, [0, 0.12, -0.08]), K(1.2, Z)],
      head: [K(0, Z), K(0.15, [0, 0.15, 0.05]), K(0.5, [0, -0.2, 0.05]), K(0.8, [0, 0.15, 0.05]), K(1.2, Z)],
      hips: [K(0, Z, HIP), K(0.15, Z, [-0.04, 0.97, 0]), K(1.0, Z, [-0.04, 0.97, 0]), K(1.2, Z, HIP)],
      coat: [K(0, Z), K(0.2, [0, 0, 0.1]), K(1.2, Z)],
      hat: [K(0, Z)], legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  missingMetadata: {
    duration: 1.1, loop: false,
    tracks: {
      // slow menacing lens sweep across the foe, then a dismissive delete-swipe
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 1.8]), K(0.4, [0.35, 0, 1.8]), K(0.6, [-0.35, 0, 1.8]), K(0.75, [0, 0, 1.8]), K(0.9, [0, 0, -0.8]), K(1.1, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 1.7]), K(0.75, [0, 0, 1.7]), K(0.9, [0, 0, 0.2]), K(1.1, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.2, [0, 0, -0.5]), K(0.75, [0, 0, -0.5]), K(1.1, Z)],
      head: [K(0, Z), K(0.2, [0, 0.12, 0.08]), K(0.4, [0, -0.1, 0.08]), K(0.6, [0, 0.12, 0.08]), K(0.9, [0, 0, -0.1]), K(1.1, Z)],
      torso: [K(0, Z), K(0.2, [0, 0.1, -0.05]), K(0.75, [0, 0.1, -0.05]), K(0.9, [0, -0.2, 0.05]), K(1.1, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.2, 0, 0.5]), K(1.1, [0, 0, 0.08])],
      hips: [K(0, Z, HIP), K(0.2, Z, [-0.03, 0.97, 0]), K(0.85, Z, [-0.03, 0.97, 0]), K(1.1, Z, HIP)],
      coat: [K(0, Z)], hat: [K(0, Z)], legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  floorPrice: {
    duration: 1.6, loop: false,
    tracks: {
      // points at the sky like calling down judgment, then crosses arms
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, 3.0]), K(0.6, [0, 0, 3.0]), K(0.8, [-0.4, 0, 0.9]), K(1.4, [-0.4, 0, 0.9]), K(1.6, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.1]), K(0.6, [0, 0, 0.1]), K(0.8, [0, 0, 1.6]), K(1.4, [0, 0, 1.6]), K(1.6, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.8, [0.4, 0, 0.9]), K(1.4, [0.4, 0, 0.9]), K(1.6, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.8, [0, 0, 1.7]), K(1.4, [0, 0, 1.7]), K(1.6, [0, 0, 0.25])],
      head: [K(0, Z), K(0.2, [0, 0, 0.45]), K(0.6, [0, 0, 0.45]), K(0.8, [0, 0, -0.1]), K(1.4, [0, 0, -0.1]), K(1.6, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.2]), K(0.6, [0, 0, 0.2]), K(0.8, [0, 0, -0.08]), K(1.6, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [-0.05, 1.0, 0]), K(0.6, Z, [-0.05, 1.0, 0]), K(0.8, Z, HIP)],
      coat: [K(0, Z), K(0.2, [0, 0, -0.2]), K(0.8, Z)],
      hat: [K(0, Z), K(0.25, [-0.2, 0, -0.15]), K(0.7, [-0.2, 0, -0.15]), K(0.9, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  blockchainDetective: {
    duration: 1.7, loop: false,
    tracks: {
      // long lens-beam aim... then a two-handed downward verdict
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, -1.5]), K(1.0, [0, 0, -1.5]), K(1.15, [0, 0, 2.6]), K(1.3, [0, 0, -0.6]), K(1.7, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.1]), K(1.0, [0, 0, 0.1]), K(1.15, [0, 0, 0.3]), K(1.7, [0, 0, 1.15])],
      lens: [K(0, Z), K(0.2, [0, 0, 1.1]), K(1.0, [0, 0, 1.1]), K(1.7, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.5, 0, 0.6]), K(1.0, [0.5, 0, 0.6]), K(1.15, [0, 0, 2.6]), K(1.3, [0, 0, -0.6]), K(1.7, [0, 0, 0.08])],
      torso: [K(0, Z), K(0.2, [0, -0.25, 0]), K(1.0, [0, -0.25, 0]), K(1.15, [0, 0, 0.25]), K(1.3, [0, 0, -0.4]), K(1.7, Z)],
      hips: [K(0, Z, HIP), K(0.2, [0, -0.15, 0], [0.04, 0.96, 0]), K(1.0, [0, -0.15, 0], [0.04, 0.96, 0]), K(1.3, [0, 0, -0.1], [0.08, 0.9, 0]), K(1.7, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, -0.15, 0.1]), K(1.0, [0, -0.15, 0.1]), K(1.3, [0, 0, -0.25]), K(1.7, Z)],
      legL: [K(0, Z), K(1.3, [-0.15, 0, 0.25]), K(1.7, Z)],
      legR: [K(0, Z), K(1.3, [0.15, 0, 0.25]), K(1.7, Z)],
      coat: [K(0, Z), K(1.15, [0, 0, -0.5]), K(1.3, [0, 0, 0.3]), K(1.7, Z)],
      hat: [K(0, Z), K(1.32, [0.35, 0, 0.3]), K(1.7, Z)],
    },
  },

  notYourKeys: {
    duration: 1.4, loop: false,
    tracks: {
      // hoists an enormous key overhead... which snaps. long silence follows.
      armL: [K(0, [0, 0, 0.08]), K(0.2, [-0.2, 0, 2.9]), K(0.45, [-0.2, 0, 2.9]), K(0.55, [-0.2, 0, 2.7]), K(1.0, [-0.2, 0, 2.7]), K(1.2, [0, 0, 0.3]), K(1.4, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0.2, 0, 2.9]), K(0.45, [0.2, 0, 2.9]), K(0.55, [0.2, 0, 2.7]), K(1.0, [0.2, 0, 2.7]), K(1.2, [0, 0, 0.5]), K(1.4, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, 0.25]), K(0.2, [0, 0, 0.2]), K(1.4, [0, 0, 0.25])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.2]), K(1.2, [0, 0, 0.8]), K(1.4, [0, 0, 1.15])],
      head: [K(0, Z), K(0.2, [0, 0, 0.4]), K(0.45, [0, 0, 0.4]), K(0.6, [0, 0, 0.5]), K(0.75, [0, 0.5, 0.2]), K(1.0, [0, 0.5, 0.2]), K(1.2, [0, 0, -0.3]), K(1.4, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.15]), K(0.6, [0, 0, 0.18]), K(1.2, [0, 0, -0.15]), K(1.4, Z)],
      hips: [K(0, Z, HIP), K(0.2, Z, [0, 1.0, 0]), K(0.6, Z, [0, 1.0, 0]), K(1.2, Z, [0, 0.95, 0]), K(1.4, Z, HIP)],
      coat: [K(0, Z), K(0.2, [0, 0, -0.2]), K(0.7, Z)],
      hat: [K(0, Z), K(0.62, [0.2, 0, 0.25]), K(1.1, [0.2, 0, 0.25]), K(1.4, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // finisher: point, drag gesture, dust off the hands
  punkd: {
    duration: 2.5, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, -1.5]), K(0.5, [0, 0, -1.5]), K(0.7, [0, 0, -1.2]), K(1.2, [0, 0, -1.7]), K(1.7, [0, 0, -1.2]), K(2.0, [0, 0, 0.9]), K(2.15, [0, 0, 0.6]), K(2.3, [0, 0, 0.9]), K(2.5, [0, 0, 0.35])],
      forearmR: [K(0, [0, 0, 1.15]), K(0.2, [0, 0, 0.1]), K(1.7, [0, 0, 0.1]), K(2.0, [0, 0, 1.3]), K(2.5, [0, 0, 1.15])],
      armL: [K(0, [0, 0, 0.08]), K(0.7, [0.3, 0, 0.5]), K(1.7, [0.3, 0, 0.5]), K(2.0, [0, 0, 0.9]), K(2.15, [0, 0, 0.6]), K(2.3, [0, 0, 0.9]), K(2.5, [0, 0, 0.08])],
      forearmL: [K(0, [0, 0, 0.25]), K(2.0, [0, 0, 1.3]), K(2.5, [0, 0, 0.25])],
      torso: [K(0, Z), K(0.2, [0, -0.4, 0]), K(0.7, [0, -0.4, 0]), K(1.2, [0, -0.55, 0]), K(1.7, [0, -0.4, 0]), K(2.0, [0, 0, 0.1]), K(2.5, Z)],
      hips: [K(0, Z, HIP), K(0.2, [0, -0.25, 0], [0.05, 0.96, 0]), K(1.7, [0, -0.25, 0], [0.05, 0.96, 0]), K(2.0, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, -0.25, 0]), K(1.7, [0, -0.25, 0]), K(2.0, [0, 0, 0.1]), K(2.2, [0, 0.3, 0]), K(2.35, [0, -0.3, 0]), K(2.5, Z)],
      coat: [K(0, Z), K(0.25, [0, 0, -0.3]), K(1.8, [0, 0, -0.2]), K(2.5, Z)],
      hat: [K(0, Z), K(1.9, [0, 0, -0.1]), K(2.5, Z)],
      legL: [K(0, Z), K(0.2, [0, 0, 0.2]), K(1.9, [0, 0, 0.2]), K(2.5, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, -0.2]), K(1.9, [0, 0, -0.2]), K(2.5, Z)],
    },
  },
}

// normalization pass: rescale authored hips heights to the real rig (fresh
// arrays — the authored literals above are never mutated twice)
for (const clip of Object.values(clips)) {
  const track = clip.tracks?.hips
  if (!track) continue
  for (const k of track) {
    if (k.pos) k.pos = [k.pos[0], k.pos[1] * HIP_SCALE, k.pos[2]]
  }
}

// ---------------------------------------------------------------------------
// script helpers
// ---------------------------------------------------------------------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)

function inRange(fx, r) {
  if (!fx.foe || !fx.self) return false
  return Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) <= r && Math.abs(fx.foe.pos.y - fx.self.pos.y) < 1.8
}

// end() guard so parallel timelines can never call fx.end() twice
function onceEnd(fx) {
  let done = false
  return () => { if (!done) { done = true; fx.end() } }
}

function clampToArena(fx, x) {
  let minX = -8.5, maxX = 8.5
  try {
    const b = fx.arena()?.bounds
    if (b) { minX = b.minX + 0.8; maxX = b.maxX - 0.8 }
  } catch { /* arena optional */ }
  return Math.max(minX, Math.min(maxX, x))
}

// somewhere to park script-owned effect meshes: arena group, else scene root
function stage(fx) {
  try { const g = fx.arena()?.group; if (g) return g } catch { /* arena optional */ }
  try { if (fx.self?.root?.parent) return fx.self.root.parent } catch { /* no scene */ }
  return null
}

function addFxMesh(fx, mesh) {
  const s = stage(fx)
  if (!s) return false
  try { s.add(mesh); return true } catch { return false }
}

function dropMesh(mesh) {
  try { mesh?.parent?.remove(mesh) } catch { /* already gone */ }
}

function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts })
}

// pixel-font canvas label texture; returns null when canvas is unavailable
function labelTex(lines, opts = {}) {
  try {
    const w = opts.w || 256, h = opts.h || 128
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    if (!x) return null
    x.fillStyle = opts.bg || '#f2f0e6'
    x.fillRect(0, 0, w, h)
    if (opts.border) {
      x.strokeStyle = opts.border
      x.lineWidth = 8
      x.strokeRect(4, 4, w - 8, h - 8)
    }
    x.fillStyle = opts.fg || '#14161a'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    const size = opts.size || 30
    x.font = `bold ${size}px monospace`
    lines.forEach((ln, i) => x.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (size + 8)))
    const t = new THREE.CanvasTexture(c)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
    return t
  } catch { return null }
}

// flat panel with a text label on both faces (plain color if canvas missing)
function labelPanel(w, h, lines, opts = {}) {
  const tex = labelTex(lines, opts)
  const face = tex
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 })
    : basic(opts.fallback ?? 0xf2f0e6, { transparent: !!opts.transparent, opacity: opts.opacity ?? 1 })
  const side = basic(opts.sideColor ?? 0xd9d6c6)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, opts.depth ?? 0.12),
    [side, side, side, side, face, face.clone ? face.clone() : face])
  return mesh
}

// cheap transparent block-humanoid ghost (for clones and right-click copies)
function ghostDummy(height, colorHex, opacity) {
  const g = new THREE.Group()
  const mat = basic(colorHex, { transparent: true, opacity, depthWrite: false })
  const s = height / 1.85
  const add = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), mat)
    m.position.set(x * s, y * s, z * s)
    g.add(m)
  }
  add(0.34, 0.2, 0.42, 0, 0.86, 0)           // pelvis
  add(0.5, 0.54, 0.42, -0.02, 1.21, 0)       // torso
  add(0.42, 0.42, 0.42, 0, 1.64, 0)          // cube head
  add(0.16, 0.76, 0.18, 0, 0.42, 0.13)       // legs
  add(0.16, 0.76, 0.18, 0, 0.42, -0.13)
  add(0.14, 0.7, 0.16, 0, 1.12, 0.3)         // arms
  add(0.14, 0.7, 0.16, 0, 1.12, -0.3)
  return { g, mat }
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------

// Magnifying-Glass Strike — heavy bonk with a lens flash on impact
function lensStrikeScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('whoosh')
  const lens = fx.self.bones?.lens
  const glass = lens?.userData?.glassMat || null
  const baseHex = lens?.userData?.glassBaseHex ?? 0x9fe8ff
  const restore = () => {
    if (!glass) return
    try { glass.color.setHex(baseHex); glass.opacity = 0.45 } catch { /* material */ }
  }
  fx.after(11, () => {
    try { if (glass) { glass.color.setHex(0xffffff); glass.opacity = 0.95 } } catch { /* material */ }
    fx.particles('sparks', v3(fx.self.pos.x + fx.self.facing * 1.0, 1.4, 0), { n: 12 })
    fx.sfx('menu_confirm', { pitch: 2.0 })
    if (inRange(fx, 1.9)) {
      fx.sfx('punch_heavy')
      fx.shake(0.45)
      fx.particles('impact', v3(fx.foe.pos.x, 1.4, 0), { n: 12 })
      fx.hit({ damage: 13, knockback: { x: 8.5, y: 3, spin: 0.8 }, hitStun: 20, ragdoll: 1 })
      fx.caption('OBJECTION SUSTAINED')
    }
  })
  fx.after(20, restore)
  fx.after(45, restore) // failsafe: never leave the lens blown out
  fx.after(32, end)
}

// Glitch Dodge — 1m displacement with RGB-split afterimages + brief invuln
function glitchDodgeScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('menu_back', { pitch: 2.2 })
  const ghosts = []
  const cleanup = () => { for (const m of ghosts) dropMesh(m.g); ghosts.length = 0 }
  fx.after(2, () => {
    const F = fx.self.facing
    const x0 = fx.self.pos.x, y0 = fx.self.pos.y
    // RGB-split afterimages left at the vacated position
    for (const [hex, dz] of [[0xff3df0, 0.06], [0x2ee6ff, -0.06]]) {
      const d = ghostDummy(1.85, hex, 0.4)
      d.g.position.set(x0, y0, dz)
      d.g.rotation.y = F === 1 ? 0 : Math.PI
      if (addFxMesh(fx, d.g)) ghosts.push(d)
    }
    // the teleport itself — 1m away from trouble, clamped in-bounds
    try { fx.self.pos.x = clampToArena(fx, x0 - F * 1.0) } catch { /* stay put */ }
    try { fx.self.invuln = Math.max(fx.self.invuln || 0, 10) } catch { /* engine-owned */ }
    fx.particles('smoke', v3(x0, 1.0, 0), { n: 6 })
    fx.sfx('menu_back', { pitch: 1.4 })
  })
  for (let i = 1; i <= 5; i++) {
    fx.after(2 + i * 2, () => {
      for (const d of ghosts) { try { d.mat.opacity = Math.max(0, 0.4 - i * 0.09) } catch { /* mat */ } }
    })
  }
  fx.after(14, cleanup)
  fx.after(40, cleanup) // failsafe
  fx.after(21, end)
}

// Detached-Hand Punch — the hand leaves, launches somebody, and comes home
function handPunchScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const handMesh = fx.self.bones?.forearmR?.userData?.handMesh || null
  const restore = () => { try { if (handMesh) handMesh.visible = true } catch { /* mesh */ } }
  let fist = null
  let landed = false
  fx.sfx('whoosh')
  fx.after(8, () => {
    try { if (handMesh) handMesh.visible = false } catch { /* mesh */ }
    fist = new THREE.Group()
    const fm = basic(0x59637d)
    fist.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.22), fm))
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.26), basic(0x2ee6ff))
    cuff.position.x = -0.16
    fist.add(cuff)
    fist.position.set(fx.self.pos.x + F * 0.6, fx.self.pos.y + 1.25, 0)
    if (!addFxMesh(fx, fist)) fist = null
    fx.sfx('launch', { pitch: 1.5 })
  })
  fx.frame((age) => {
    try {
      if (!fist) return
      if (age >= 8 && age < 19) {
        fist.position.x += F * 0.25 // out: 2.5m over 10 frames
        fist.rotation.x += 0.5
        if (!landed && Math.abs(fist.position.x - fx.foe.pos.x) < 0.7 && Math.abs(fx.foe.pos.y - fx.self.pos.y) < 1.8) {
          landed = true
          fx.sfx('punch_heavy')
          fx.shake(0.5)
          fx.particles('impact', v3(fx.foe.pos.x, 1.4, 0), { n: 12 })
          fx.hit({ damage: 9, knockback: { x: 2.5, y: 9.5, spin: 1.2 }, hitStun: 26, ragdoll: 1 })
        }
      } else if (age >= 19 && age < 30) {
        fist.position.x -= F * 0.25 // the return trip
        fist.rotation.x -= 0.5
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(30, () => { dropMesh(fist); fist = null; restore(); fx.sfx('menu_confirm', { pitch: 1.6 }) })
  fx.after(60, () => { dropMesh(fist); restore() }) // failsafe
  fx.after(36, end)
}

// Clone Feint — a transparent duplicate lunges; the original never moved
function cloneFeintScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let clone = null
  fx.sfx('menu_back', { pitch: 1.8 })
  fx.after(6, () => {
    const d = ghostDummy(1.85, 0x8b5cf6, 0.45)
    d.g.position.set(fx.self.pos.x, fx.self.pos.y, 0)
    d.g.rotation.y = F === 1 ? 0 : Math.PI
    if (addFxMesh(fx, d.g)) clone = d
    fx.particles('smoke', v3(fx.self.pos.x, 1.0, 0), { n: 4 })
  })
  fx.frame((age) => {
    try {
      if (!clone) return
      if (age >= 6 && age < 20) {
        clone.g.position.x += F * 0.13 // lunge ~1.8m
        clone.g.rotation.z = -F * 0.25
      } else if (age >= 20) {
        clone.mat.opacity = Math.max(0, clone.mat.opacity - 0.06)
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(16, () => {
    if (inRange(fx, 2.4)) {
      fx.sfx('punch_light', { pitch: 1.4 })
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 6 })
      fx.hit({ damage: 4, knockback: { x: 3.5, y: 1 }, hitStun: 16 })
      fx.caption('FEINT.EXE')
    }
  })
  fx.after(32, () => { if (clone) { dropMesh(clone.g); clone = null } })
  fx.after(70, () => { if (clone) dropMesh(clone.g) }) // failsafe
  fx.after(42, end)
}

// Pixel Projectile — a volley of small kinematic cyan cubes
function pixelVolleyScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const cubes = []
  const cleanup = () => { for (const c of cubes) dropMesh(c.m); cubes.length = 0 }
  for (let i = 0; i < 4; i++) {
    fx.after(12 + i * 6, () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22),
        basic(i % 2 ? 0x2ee6ff : 0x8b5cf6))
      m.position.set(fx.self.pos.x + F * 0.7, fx.self.pos.y + 1.15 + (i % 2) * 0.25, 0)
      if (addFxMesh(fx, m)) cubes.push({ m, live: true })
      fx.sfx('menu_confirm', { pitch: 1.4 + i * 0.15 })
    })
  }
  fx.frame(() => {
    try {
      for (const c of cubes) {
        if (!c.live) continue
        c.m.position.x += F * 0.24
        c.m.rotation.x += 0.4
        c.m.rotation.y += 0.3
        const dx = Math.abs(c.m.position.x - fx.foe.pos.x)
        if (dx < 0.55 && Math.abs(fx.foe.pos.y + 1.1 - c.m.position.y) < 1.4) {
          c.live = false
          dropMesh(c.m)
          fx.sfx('punch_light', { pitch: 1.7 })
          fx.particles('sparks', v3(fx.foe.pos.x, 1.2, 0), { n: 5 })
          fx.hit({ damage: 3, knockback: { x: 2, y: 0.8 }, hitStun: 10 })
        } else if (Math.abs(c.m.position.x - fx.self.pos.x) > 7.5) {
          c.live = false
          dropMesh(c.m)
        }
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(52, cleanup)
  fx.after(90, cleanup) // failsafe
  fx.after(48, end)
}

// SPECIAL 1: Right-Click Save — three bootleg copies of the FOE attack the original
function gasFeeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(9, () => {
    // hands you an invoice for looking at him. network congestion surcharge included.
    fx.sfx('menu_confirm', { pitch: 0.8 })
    const bill = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.8, 1.4, 0), { size: [0.05, 0.5, 0.38], mass: 0.2 })
    if (bill) { try { fx.impulse(bill, [F * 9, 3, 0.5], 4) } catch { /* prop gone */ } }
    if (inRange(fx, 3.0)) {
      fx.sfx('punch_heavy')
      fx.shake(0.45)
      fx.hit({ damage: 12, knockback: { x: 11, y: 4.5, spin: 1.5 }, hitStun: 26, ragdoll: 1 })
      fx.coins(v3(fx.foe.pos.x, 1.4, 0), 6)
      fx.caption('GAS FEE: YOUR FACE')
    } else {
      fx.caption('TRANSACTION PENDING...')
    }
  })
  fx.after(38, end)
}

function rightClickSaveScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('RIGHT CLICK... SAVE AS...')
  fx.sfx('menu_confirm', { pitch: 1.2 })
  fx.after(4, () => fx.sfx('menu_confirm', { pitch: 1.5 })) // the double click
  const copies = []
  const cleanup = () => { for (const c of copies) dropMesh(c.g); copies.length = 0 }
  fx.after(10, () => {
    const h = Math.max(1.2, fx.foe?.def?.height || 1.8) * 0.92
    const spots = [
      [fx.foe.pos.x - F * 1.5, 0, 0.25],
      [fx.foe.pos.x + F * 1.5, 0, -0.25],
      [fx.foe.pos.x - F * 1.1, 0, 0.9],
    ]
    for (let i = 0; i < 3; i++) {
      const d = ghostDummy(h, i === 1 ? 0x8b5cf6 : 0x9fb6c9, 0.42)
      d.g.position.set(clampToArena(fx, spots[i][0]), 0, spots[i][2])
      d.g.rotation.y = fx.foe.pos.x >= d.g.position.x ? 0 : Math.PI
      d.home = d.g.position.x
      if (addFxMesh(fx, d.g)) copies.push(d)
    }
    fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 8 })
    fx.sfx('menu_back', { pitch: 2.0 })
  })
  // each copy lunges in sequence — low-res on low-res violence
  const lunge = (idx, atFrame, dmg) => {
    fx.after(atFrame, () => {
      const c = copies[idx]
      if (!c) return
      try { c.g.position.x = fx.foe.pos.x + (c.home < fx.foe.pos.x ? -0.55 : 0.55) } catch { /* gone */ }
      fx.sfx('punch_light', { pitch: 0.9 + idx * 0.25 })
      fx.shake(0.3)
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 8 })
      fx.hit({ damage: dmg, knockback: { x: idx === 2 ? 6 : 1.5, y: idx === 2 ? 3 : 0.8, spin: 0.5 }, hitStun: 18, ragdoll: idx === 2 ? 1 : 0 })
    })
    fx.after(atFrame + 6, () => {
      const c = copies[idx]
      if (!c) return
      try { c.g.position.x = c.home } catch { /* gone */ }
    })
  }
  lunge(0, 22, 6)
  lunge(1, 34, 6)
  lunge(2, 46, 7)
  fx.after(52, () => { fx.caption('RIGHT-CLICK SAVED'); fx.announcer('SAVED WITHOUT PERMISSION') })
  for (let i = 0; i < 5; i++) {
    fx.after(56 + i * 3, () => {
      for (const c of copies) { try { c.mat.opacity = Math.max(0, c.mat.opacity - 0.09) } catch { /* mat */ } }
    })
  }
  fx.after(70, cleanup)
  fx.after(110, cleanup) // failsafe
  fx.after(72, end)
}

// SPECIAL 2: Missing Metadata — the foe's limbs 404 for a couple of seconds
function missingMetadataScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('menu_back', { pitch: 1.6 })
  const hidden = []
  const restore = () => {
    for (const b of hidden) { try { b.visible = true } catch { /* bone */ } }
    hidden.length = 0
  }
  fx.after(14, () => {
    if (!inRange(fx, 3.4)) {
      fx.caption('TARGET OUT OF SCOPE')
      fx.after(20, end)
      return
    }
    try {
      const parts = ['armL', 'armR', 'legL', 'legR'].filter((n) => fx.foe.bones?.[n])
      // shuffle, take 2-3
      for (let i = parts.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        ;[parts[i], parts[j]] = [parts[j], parts[i]]
      }
      const take = parts.slice(0, 2 + (Math.random() < 0.5 ? 1 : 0))
      for (const n of take) {
        const b = fx.foe.bones[n]
        if (b && b.visible !== false) { b.visible = false; hidden.push(b) }
      }
    } catch { /* foe rig is foe's problem */ }
    fx.sfx('break', { pitch: 1.8 })
    fx.shake(0.35)
    fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 10 })
    fx.caption('ERROR 404: LIMBS NOT FOUND')
    fx.announcer('METADATA MISSING')
    // damage over time while the foe wobbles around incomplete
    for (let i = 0; i < 3; i++) {
      fx.after(18 + i * 30, () => {
        if (hidden.length === 0) return
        fx.sfx('menu_back', { pitch: 0.8 + Math.random() * 1.2 })
        fx.particles('sparks', v3(fx.foe.pos.x, 1.1, 0), { n: 4 })
        fx.hit({ damage: 3, knockback: { x: 0.6, y: 0.3 }, hitStun: 8 })
        try { fx.impulse(fx.foe, [(Math.random() - 0.5) * 2, 0.5, 0]) } catch { /* engine */ }
      })
    }
    fx.after(150, restore) // ~2.5s outage
  })
  fx.after(220, restore) // failsafe: limbs ALWAYS come back
  fx.after(66, end)
}

// SPECIAL 3 (SUPER): Floor Price — a giant price tag falls from the sky
function floorPriceScript(fx) {
  const end = onceEnd(fx)
  fx.caption('CHECKING THE FLOOR...')
  fx.announcer('FLOOR PRICE')
  fx.sfx('bell')
  fx.slowmo(0.5, 0.5)
  fx.zoom(fx.foe, 0.6)
  let tag = null
  let crushed = false
  const cleanup = () => { dropMesh(tag); tag = null }
  fx.after(10, () => {
    tag = new THREE.Group()
    const panel = labelPanel(2.7, 1.7, ['FLOOR:', '0.0001'],
      { w: 256, h: 160, size: 44, bg: '#f6f2e2', fg: '#14161a', border: '#8b5cf6', depth: 0.2, sideColor: 0xd9d6c6 })
    tag.add(panel)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), basic(0xd7b45a))
    ring.position.set(-1.5, 0.95, 0)
    tag.add(ring)
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), basic(0xd7b45a))
    rope.position.set(-1.5, 1.9, 0)
    rope.rotation.z = 0.2
    tag.add(rope)
    tag.position.set(clampToArena(fx, fx.foe.pos.x), 8.5, 0)
    if (!addFxMesh(fx, tag)) tag = null
    fx.sfx('whoosh', { pitch: 0.7 })
  })
  fx.frame((age) => {
    try {
      if (!tag) return
      if (age > 10 && age <= 30) {
        // homing drift while it looms overhead
        tag.position.x += Math.max(-0.12, Math.min(0.12, clampToArena(fx, fx.foe.pos.x) - tag.position.x))
        tag.rotation.z = Math.sin(age * 0.3) * 0.08
      } else if (age > 30 && age <= 37) {
        tag.position.y = Math.max(1.0, tag.position.y - 1.25) // THE DROP
      } else if (crushed && age > 37 && age <= 86) {
        tag.position.y = 1.0 + Math.abs(Math.sin(age * 0.5)) * 0.05 // pinning bounce
      } else if (age > 86 && age <= 96) {
        tag.position.y += 0.35 // pops back off
        tag.rotation.z += 0.06
      }
    } catch { /* never crash the clock */ }
  })
  fx.after(36, () => {
    const tx = tag ? tag.position.x : fx.foe.pos.x
    fx.sfx('thud')
    fx.sfx('explosion')
    fx.shake(1.3)
    fx.slowmo(0.3, 0.7)
    fx.particles('impact', v3(tx, 1.0, 0), { n: 24 })
    fx.particles('smoke', v3(tx, 0.4, 0), { n: 12 })
    if (Math.abs(tx - fx.foe.pos.x) < 1.9 && fx.foe.pos.y < 2.2) {
      crushed = true
      fx.hit({ damage: 30, knockback: { x: 0.5, y: -3, spin: 0.4 }, hitStun: 70, ragdoll: 2 })
      fx.caption('FLOOR: 0.0001 — NON-NEGOTIABLE')
    } else {
      // near miss still hurts the portfolio
      fx.hit({ damage: 10, knockback: { x: 7, y: 3, spin: 1 }, hitStun: 24, ragdoll: 1 })
      fx.caption('MARKET CORRECTION')
    }
    fx.coins(v3(tx, 1.6, 0), 10)
  })
  fx.after(60, () => { if (crushed) { fx.sfx('menu_back', { pitch: 0.6 }); fx.shake(0.3) } })
  fx.after(98, cleanup)
  fx.after(140, cleanup) // failsafe
  fx.after(96, end)
}

// SPECIAL 4: Blockchain Detective — scan, publish the receipts, slam with them
function blockchainDetectiveScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('RUNNING TRACE...')
  fx.sfx('menu_move')
  let beam = null
  let scroll = null
  let scrollFace = null
  const cleanup = () => { dropMesh(beam); beam = null; dropMesh(scroll); scroll = null }
  fx.after(8, () => {
    beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 0.14),
      basic(0x2ee6ff, { transparent: true, opacity: 0.55, depthWrite: false }))
    if (!addFxMesh(fx, beam)) beam = null
    fx.sfx('menu_back', { pitch: 2.4 })
  })
  fx.frame((age) => {
    try {
      if (!beam) return
      const x0 = fx.self.pos.x + F * 0.6
      const x1 = fx.foe.pos.x
      beam.position.set((x0 + x1) / 2, 1.45, 0)
      beam.scale.x = Math.max(0.3, Math.abs(x1 - x0))
      beam.material.opacity = 0.3 + Math.abs(Math.sin(age * 0.8)) * 0.35
    } catch { /* never crash the clock */ }
  })
  fx.after(14, () => {
    if (!inRange(fx, 4.6)) {
      fx.caption('NO TRANSACTIONS FOUND')
      cleanup()
      fx.after(24, end)
      return
    }
    fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 85 })
    fx.sfx('menu_confirm', { pitch: 0.8 })
    // the receipts materialize
    fx.after(4, () => {
      scroll = new THREE.Group()
      const body = labelPanel(1.9, 2.5, ['TRANSACTION', 'HISTORY', '----------', 'BOUGHT TOP x47', 'SOLD BOTTOM x83', 'MINT: RUGGED', 'GAS: $12,403'],
        { w: 256, h: 320, size: 24, bg: '#efe9d2', fg: '#2a1e45', border: '#2ee6ff', depth: 0.08, transparent: true, opacity: 0.55, sideColor: 0xd9d6c6 })
      scrollFace = body
      scroll.add(body)
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), basic(0xd7b45a))
      roller.rotation.x = Math.PI / 2
      roller.position.y = 1.32
      scroll.add(roller)
      scroll.position.set(clampToArena(fx, fx.foe.pos.x), 1.35, 0.35)
      scroll.scale.y = 0.05
      if (!addFxMesh(fx, scroll)) scroll = null
      fx.sfx('slide')
    })
    // unroll
    for (let i = 1; i <= 10; i++) {
      fx.after(4 + i * 2, () => { try { if (scroll) scroll.scale.y = Math.min(1, 0.05 + i * 0.1) } catch { /* gone */ } })
    }
    fx.after(28, () => { fx.caption('BOUGHT TOP x47'); fx.sfx('menu_back', { pitch: 0.7 }) })
    fx.after(40, () => { fx.caption('SOLD BOTTOM x83'); fx.sfx('menu_back', { pitch: 0.55 }); fx.announcer('THE RECEIPTS') })
    // SOLIDIFY
    fx.after(50, () => {
      try {
        const mats = Array.isArray(scrollFace?.material) ? scrollFace.material : [scrollFace?.material]
        for (const m of mats) { if (m) { m.opacity = 1; m.transparent = false } }
      } catch { /* material */ }
      fx.sfx('thud')
      fx.shake(0.4)
      fx.particles('sparks', v3(fx.foe.pos.x, 1.6, 0), { n: 8 })
      fx.caption('HISTORY IS IMMUTABLE')
    })
    // SLAM — the ledger comes down on their head
    fx.after(58, () => {
      fx.sfx('punch_heavy')
      fx.sfx('break')
      fx.shake(1)
      fx.slowmo(0.35, 0.5)
      fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 18 })
      fx.hit({ damage: 16, knockback: { x: 6.5, y: 5, spin: 2 }, hitStun: 30, ragdoll: 2 })
      fx.coins(v3(fx.foe.pos.x, 1.4, 0), 8)
    })
    for (let i = 1; i <= 6; i++) {
      fx.after(58 + i, () => { try { if (scroll) { scroll.rotation.z += F * 0.22; scroll.position.y -= 0.08 } } catch { /* gone */ } })
    }
    fx.after(78, cleanup)
  })
  fx.after(150, cleanup) // failsafe
  fx.after(102, end)
}

// JOKE: Not Your Keys — the comically large key immediately snaps
function notYourKeysScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('NOT YOUR KEYS...')
  fx.sfx('menu_confirm')
  let key = null
  const halves = []
  const cleanup = () => { dropMesh(key); key = null; for (const h of halves) dropMesh(h.m); halves.length = 0 }
  fx.after(10, () => {
    key = new THREE.Group()
    const gold = basic(0xd7b45a)
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.14), gold)
    key.add(shaft)
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 10), gold)
    bow.position.x = -0.85
    key.add(bow)
    for (let i = 0; i < 2; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), gold)
      tooth.position.set(0.55 + i * 0.22, -0.2, 0)
      key.add(tooth)
    }
    key.position.set(fx.self.pos.x + F * 0.1, fx.self.pos.y + 2.5, 0)
    key.rotation.z = 0.25
    if (!addFxMesh(fx, key)) key = null
    fx.sfx('coin', { pitch: 0.6 })
  })
  // SNAP.
  fx.after(28, () => {
    if (key) {
      const kx = key.position.x, ky = key.position.y
      dropMesh(key)
      key = null
      const gold = basic(0xd7b45a)
      for (const dir of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.14), gold)
        m.position.set(kx + dir * 0.35, ky, 0)
        if (addFxMesh(fx, m)) halves.push({ m, vx: dir * 0.05, vy: 0.12, vr: dir * 0.2 })
      }
    }
    fx.sfx('break')
    fx.shake(0.25)
    fx.particles('sparks', v3(fx.self.pos.x, 2.4, 0), { n: 6 })
    fx.caption('...NOT YOUR COINS')
  })
  fx.frame(() => {
    try {
      for (const h of halves) {
        h.vy -= 0.012
        h.m.position.x += h.vx
        h.m.position.y = Math.max(0.08, h.m.position.y + h.vy)
        h.m.rotation.z += h.vr
      }
    } catch { /* never crash the clock */ }
  })
  // both fighters stare at the wreckage
  fx.after(36, () => { fx.zoom(fx.self, 0.6); fx.sfx('menu_back', { pitch: 0.5 }); fx.caption('...') })
  fx.after(54, () => {
    if (inRange(fx, 6)) {
      fx.hit({ damage: 1, knockback: { x: 1, y: 0.5 }, hitStun: 10 })
      fx.caption('SECONDHAND EMBARRASSMENT: 1 DMG')
      fx.sfx('menu_back', { pitch: 0.6 })
    }
  })
  fx.after(70, cleanup)
  fx.after(120, cleanup) // failsafe
  fx.after(84, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const CryptoPunkdDef = {
  id: 'crypto-punkd',
  name: "CRYPTO PUNK'D",
  title: 'The Glitched Detective',
  bio: 'A block-built gumshoe who right-click-saved himself out of a 10,000-piece collection and has been on the run from provenance ever since. Solves every crime on-chain. Commits roughly half of them. His body is non-fungible; his limbs disagree.',
  style: 'Technical trickster. Teleports, clones and detachable body pieces reward players who treat the fight like a corrupted save file. Fragile up close — keep the foe confused, indexed and pinned under paperwork.',
  stats: { power: 6, speed: 7, defense: 5, chaos: 8 },
  height: 1.85,
  weight: 1.0,
  walkSpeed: 4.6,
  dashSpeed: 9.5,
  jumpVel: 8.8,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'block-jab', name: 'Block Jab', kind: 'light',
      input: ['light'],
      damage: 5, startup: 4, active: 3, recovery: 11,
      hitbox: { w: 1.0, h: 0.7, d: 0.9, forward: 1.0, up: 1.35 },
      knockback: { x: 4.5, y: 1, spin: 0.3 },
      hitStun: 13, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'blockJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'pixel-kick', name: 'Pixel Kick', kind: 'kick',
      input: ['kick'],
      damage: 8, startup: 7, active: 4, recovery: 11,
      hitbox: { w: 1.1, h: 1.0, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 9.5, y: 2, spin: 0.4 },
      hitStun: 17, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'pixelKick', sfx: 'kick', script: null,
    },
    {
      id: 'magnifying-glass-strike', name: 'Magnifying-Glass Strike', kind: 'heavy',
      input: ['heavy'],
      damage: 13, startup: 10, active: 4, recovery: 19,
      hitbox: { w: 1.0, h: 0.9, d: 0.9, forward: 1.0, up: 1.3 },
      knockback: { x: 8.5, y: 3, spin: 0.8 },
      hitStun: 20, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'lensStrike', sfx: 'punch_heavy',
      script: lensStrikeScript,
    },
    {
      id: 'coat-spin', name: 'Coat Spin', kind: 'heavy',
      input: ['down', 'heavy'],
      damage: 10, startup: 9, active: 6, recovery: 21,
      hitbox: { w: 1.4, h: 1.2, d: 1.6, forward: 0.6, up: 1.0 },
      knockback: { x: 3, y: 9, spin: 1.4 },
      hitStun: 25, blockStun: 12, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'coatSpin', sfx: 'whoosh', script: null,
    },
    {
      id: 'glitch-dodge', name: 'Glitch Dodge', kind: 'kick',
      input: ['back', 'kick'],
      damage: 0, startup: 3, active: 6, recovery: 12,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'glitchDodge', sfx: 'menu_back',
      script: glitchDodgeScript,
    },
    {
      id: 'detached-hand-punch', name: 'Detached-Hand Punch', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 9, startup: 8, active: 12, recovery: 16,
      hitbox: { w: 0.8, h: 1.0, d: 0.8, forward: 2.0, up: 1.25 },
      knockback: { x: 2.5, y: 9.5, spin: 1.2 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'handPunch', sfx: 'whoosh',
      script: handPunchScript,
    },
    {
      id: 'clone-feint', name: 'Clone Feint', kind: 'heavy',
      input: ['forward', 'heavy'],
      damage: 4, startup: 10, active: 6, recovery: 26,
      hitbox: { w: 1.0, h: 1.2, d: 0.9, forward: 1.6, up: 1.0 },
      knockback: { x: 3.5, y: 1, spin: 0.4 },
      hitStun: 16, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'cloneFeint', sfx: 'menu_back',
      script: cloneFeintScript,
    },
    {
      id: 'pixel-projectile', name: 'Pixel Projectile', kind: 'kick',
      input: ['down', 'kick'],
      damage: 12, startup: 12, active: 20, recovery: 16,
      hitbox: { w: 0.6, h: 0.6, d: 0.6, forward: 2.5, up: 1.2 },
      knockback: { x: 2, y: 0.8, spin: 0.2 },
      hitStun: 10, blockStun: 6, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'pixelVolley', sfx: 'menu_confirm',
      script: pixelVolleyScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'chain-of-custody', name: 'Chain of Custody', kind: 'grab',
      input: ['grab'],
      damage: 12, startup: 8, active: 4, recovery: 42,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.1 },
      // cuffed, hoisted, slammed straight down
      knockback: { x: 4, y: 7, spin: 1.5 },
      hitStun: 32, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'chainCustody', sfx: 'grab', script: null,
    },
    {
      id: 'evidence-bag', name: 'Evidence Bag', kind: 'grab',
      input: ['down', 'grab'],
      damage: 10, startup: 10, active: 4, recovery: 46,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.2 },
      // head bagged, one full spin, tossed over the shoulder
      knockback: { x: 9, y: 6, spin: 3 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'evidenceBag', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'gas-fee', name: 'Gas Fee', kind: 'special',
      input: ['special'],
      damage: 12, startup: 9, active: 4, recovery: 25,
      hitbox: { w: 1.0, h: 1.1, d: 0.9, forward: 1.5, up: 1.2 },
      knockback: { x: 11, y: 4.5, spin: 1.5 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'rightClickSave', sfx: 'menu_confirm',
      script: gasFeeScript,
    },
    {
      id: 'right-click-save', name: 'Right-Click Save', kind: 'special',
      input: ['down', 'special'],
      damage: 19, startup: 10, active: 40, recovery: 22,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 1.2, up: 1.0 },
      knockback: { x: 6, y: 3, spin: 0.5 },
      hitStun: 18, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'rightClickSave', sfx: 'menu_confirm',
      script: rightClickSaveScript,
    },
    {
      id: 'missing-metadata', name: 'Missing Metadata', kind: 'special',
      input: ['forward', 'special'],
      damage: 9, startup: 12, active: 30, recovery: 24,
      hitbox: { w: 1.0, h: 1.4, d: 1.0, forward: 1.4, up: 1.0 },
      knockback: { x: 0.6, y: 0.3, spin: 0 },
      hitStun: 8, blockStun: 6, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'missingMetadata', sfx: 'menu_back',
      script: missingMetadataScript,
    },
    {
      id: 'blockchain-detective', name: 'Blockchain Detective', kind: 'special',
      input: ['back', 'special'],
      damage: 18, startup: 12, active: 60, recovery: 30,
      hitbox: { w: 1.2, h: 1.6, d: 1.0, forward: 1.5, up: 1.0 },
      knockback: { x: 6.5, y: 5, spin: 2 },
      hitStun: 30, blockStun: 14, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'blockchainDetective', sfx: 'menu_move',
      script: blockchainDetectiveScript,
    },
    {
      id: 'floor-price', name: 'Floor Price', kind: 'super',
      input: ['super'],
      damage: 30, startup: 14, active: 50, recovery: 32,
      hitbox: { w: 2.0, h: 2.0, d: 1.4, forward: 0.8, up: 1.2 },
      knockback: { x: 0.5, y: -3, spin: 0.4 },
      hitStun: 70, blockStun: 18, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 8,
      clip: 'floorPrice', sfx: 'bell',
      script: floorPriceScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'not-your-keys', name: 'Not Your Keys', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 16, active: 6, recovery: 62,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.2 },
      knockback: { x: 1, y: 0.5, spin: 0.2 },
      hitStun: 10, blockStun: 4, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'notYourKeys', sfx: 'menu_confirm',
      script: notYourKeysScript,
    },
  ],

  finisher: {
    id: 'permanently-punkd',
    name: "Permanently Punk'd",
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const foeX0 = () => (fx.foe ? fx.foe.pos.x : fx.self.pos.x + F * 2)
      fx.slowmo(0.45, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption("PERMANENTLY PUNK'D")
      fx.announcer('CASE CLOSED')
      fx.sfx('menu_back', { pitch: 0.5 })
      fx.shake(0.4)
      try { fx.self.playClip?.('punkd') } catch { /* clip optional */ }

      // everything the script must clean up, tracked for the failsafe
      const cubes = []          // pixel cluster {m, ox, oy, oz}
      const frames = []         // browser windows {g, broken}
      let bin = null
      let foeModel = null       // the hidden foe model group
      const cluster = { x: 0, y: 1.0, phase: 0 }
      const restoreFoe = () => { try { if (foeModel) { foeModel.visible = true; foeModel = null } } catch { /* mesh */ } }
      const cleanupMeshes = () => {
        for (const c of cubes) dropMesh(c.m)
        cubes.length = 0
        for (const f of frames) dropMesh(f.g)
        frames.length = 0
        dropMesh(bin)
        bin = null
      }

      // layout, clamped to the arena
      const startX = foeX0()
      const dragEnd = clampToArena(fx, startX + F * 7.4)
      const frameXs = [0.3, 0.55, 0.8].map((t) => clampToArena(fx, startX + F * 7.4 * t))
      const binX = dragEnd

      // freeze the foe in place
      fx.after(8, () => {
        fx.sfx('grab')
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 140 })
      })

      // browser-window frames + recycle bin materialize downrange
      fx.after(12, () => {
        for (const fxx of frameXs) {
          const g = new THREE.Group()
          const gray = basic(0xb8bcc8)
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 2.0), basic(0x2050c8))
          top.position.y = 2.15
          g.add(top)
          const xBtn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.2), basic(0xd23c3c))
          xBtn.position.set(0.01, 2.15, 0.82)
          g.add(xBtn)
          for (const zz of [-0.95, 0.95]) {
            const side = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), gray)
            side.position.set(0, 1.0, zz)
            g.add(side)
          }
          const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.0), gray)
          bottom.position.y = 0.07
          g.add(bottom)
          g.position.x = fxx
          if (addFxMesh(fx, g)) frames.push({ g, broken: false })
        }
        bin = new THREE.Group()
        const binM = basic(0x3b6ea5)
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 1.7, 10), binM)
        body.position.y = 0.85
        bin.add(body)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 6, 12), basic(0x2a5178))
        rim.rotation.x = Math.PI / 2
        rim.position.y = 1.7
        bin.add(rim)
        // chunky recycle arrows
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2
          const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), basic(0x2ee6ff))
          arrow.position.set(Math.cos(a) * 0.72, 0.95, Math.sin(a) * 0.72)
          arrow.rotation.y = -a + 0.7
          bin.add(arrow)
        }
        bin.position.x = binX
        if (!addFxMesh(fx, bin)) bin = null
        fx.sfx('thud')
      })

      // PIXELATION — foe model swaps for a low-res cube cluster
      fx.after(18, () => {
        fx.sfx('break')
        fx.sfx('menu_back', { pitch: 2.2 })
        fx.shake(0.6)
        cluster.x = foeX0()
        fx.particles('smoke', v3(cluster.x, 1.0, 0), { n: 12 })
        try {
          const hips = fx.foe.bones?.hips
          if (hips?.parent) { foeModel = hips.parent; foeModel.visible = false }
        } catch { /* foe stays visible; cubes still fly */ }
        const cols = [0x9fb6c9, 0x2ee6ff, 0x8b5cf6, 0x59637d, 0xd7b45a]
        for (let i = 0; i < 11; i++) {
          const s = 0.2 + Math.random() * 0.16
          const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), basic(cols[i % cols.length]))
          const ox = (Math.random() - 0.5) * 0.7
          const oy = (Math.random() * 1.5) - 0.6
          const oz = (Math.random() - 0.5) * 0.5
          m.position.set(cluster.x + ox, 1.0 + oy, oz)
          if (addFxMesh(fx, m)) cubes.push({ m, ox, oy, oz })
        }
        fx.caption('RESOLUTION: 24x24')
      })

      // the drag: cluster hauled through all three browser windows into the bin
      fx.frame((age) => {
        try {
          if (age >= 24 && age < 66) {
            const t = (age - 24) / 42
            cluster.x = startX + (dragEnd - startX) * t
            cluster.y = 1.0 + Math.sin(age * 0.6) * 0.15
            for (const f of frames) {
              if (!f.broken && Math.abs(cluster.x - f.g.position.x) < 0.35) {
                f.broken = true
                fx.sfx('break')
                fx.shake(0.5)
                fx.particles('impact', v3(f.g.position.x, 1.4, 0), { n: 10 })
              }
              if (f.broken) {
                f.g.rotation.x += 0.12
                f.g.position.y -= 0.1
              }
            }
          } else if (age >= 66 && age < 76) {
            cluster.y = Math.max(0.9, cluster.y - 0.25) // dunked into the bin
            cluster.x = dragEnd
          } else if (age >= 76 && age < 112 && bin) {
            // the bin chews. violently.
            bin.position.x = binX + (Math.random() - 0.5) * 0.16
            bin.rotation.z = (Math.random() - 0.5) * 0.14
            cluster.y = 0.6
          } else if (age >= 112 && age < 122) {
            // SPIT: cluster rockets back toward the foe's actual position
            const t = (age - 112) / 10
            cluster.x = dragEnd + (foeX0() - dragEnd) * t
            cluster.y = 0.8 + Math.sin(t * Math.PI) * 2.2
            if (bin) { bin.rotation.z = -F * 0.5 * t; bin.position.x = binX }
          }
          for (const c of cubes) {
            c.m.position.set(cluster.x + c.ox, Math.max(0.12, cluster.y + c.oy), c.oz)
            c.m.rotation.x += 0.2
            c.m.rotation.y += 0.15
          }
        } catch { /* never crash the clock */ }
      })

      fx.after(66, () => { fx.sfx('thud'); fx.shake(0.5); fx.caption('MOVING TO RECYCLE BIN...') })
      for (let i = 0; i < 5; i++) {
        fx.after(78 + i * 7, () => { fx.sfx('menu_back', { pitch: 0.6 + i * 0.3 }); fx.shake(0.25) })
      }
      fx.after(104, () => fx.caption('EMPTYING RECYCLE BIN...'))

      // THE VIOLENT EJECTION = the KO ragdoll
      fx.after(112, () => {
        fx.sfx('explosion')
        fx.shake(1.3)
        fx.slowmo(0.3, 0.9)
        fx.zoom(fx.foe, 1.0)
        fx.particles('explosion', v3(binX, 1.5, 0), { n: 30 })
      })
      fx.after(122, () => {
        for (const c of cubes) dropMesh(c.m)
        cubes.length = 0
        restoreFoe()
        fx.particles('smoke', v3(foeX0(), 1.2, 0), { n: 10 })
        fx.hit({ damage: 25, knockback: { x: 14, y: 8, spin: 3 }, hitStun: 60, ragdoll: 2 })
        try { fx.ragdoll(fx.foe, [-F * 13, 9, 0]) } catch { /* engine handles KO */ }
        fx.sfx('ko')
        fx.coins(v3(foeX0(), 1.6, 0), 16)
        fx.caption('FILE DELETED PERMANENTLY')
        fx.announcer("PERMANENTLY PUNK'D")
      })

      fx.after(136, () => { cleanupMeshes() })
      fx.after(150, end)
      // failsafes: the foe model ALWAYS comes back, meshes never linger
      fx.after(170, () => { restoreFoe(); cleanupMeshes() })
    },
  },

  voice: { pitch: 0.9, rate: 1.0 },
}
