// FATTY PINGO — The Frozen Inventor.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// Round arctic seabird gadgeteer: huge white belly, stubby wings, mechanical
// goggles, a springy gadget backpack. His roundness is his POWER — high defense,
// fast recovery, bounces upright, flattens fools. All geometry, animation and
// move scripts are procedural — no assets, no extra deps.
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
const C = {
  back: 0x252c3a,        // deep blue-black plumage
  backDark: 0x1a2029,
  belly: 0xf2f6fa,       // the famous belly
  orange: 0xff9d2e,      // beak + feet
  orangeDark: 0xe0801c,
  brass: 0xc79a3b,       // goggle cans, pack tanks
  lens: 0x7de8ff,        // goggle glass
  pack: 0x8f4a3b,        // rusty inventor red
  steel: 0xb8c2cf,
  ice: 0x9fd8ff,
  iceDeep: 0x1a4d8f,
  // costume 1 — "Midnight Prototype"
  backAlt: 0x3b2a5e,
  backDarkAlt: 0x2a1d45,
  brassAlt: 0xffd24a,
  packAlt: 0x226e63,
}

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

function sph(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}

function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 10, 1), material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  return m
}

function cone(r, h, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), material)
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
// model — faces +X, feet at y=0, ~1.6 m tall (round is a SHAPE and a THREAT)
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}

  const backM = lamb(costume === 1 ? C.backAlt : C.back)
  const backDarkM = lamb(costume === 1 ? C.backDarkAlt : C.backDark)
  const bellyM = lamb(C.belly)
  const orangeM = lamb(C.orange)
  const orangeDarkM = lamb(C.orangeDark)
  const brassM = lamb(costume === 1 ? C.brassAlt : C.brass)
  const packM = lamb(costume === 1 ? C.packAlt : C.pack)
  const steelM = lamb(C.steel)
  const lensM = lamb(C.lens)
  lensM.emissive = new THREE.Color(0x114455)

  // --- hips — low center of gravity, physically unbailoutable ---------------
  const hips = pivot(group, 0, 0.52, 0)
  bones.hips = hips
  hips.add(sph(0.3, backM, -0.03, 0.02, 0, 1.0, 0.8, 1.05))
  hips.add(sph(0.27, bellyM, 0.12, 0.0, 0, 0.9, 0.68, 0.95))

  // tail — stubby wedge (extra bone, spring-follow secondary motion)
  const tail = pivot(hips, -0.24, 0.0, 0)
  bones.tail = tail
  const tailW = bent(tail, 0.55)
  tailW.add(box(0.3, 0.07, 0.26, backDarkM, -0.13, 0.02, 0))

  // --- legs — short, orange, mighty -----------------------------------------
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0.02, -0.14, 0.14 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    leg.add(cyl(0.07, 0.08, 0.26, orangeM, 0, -0.16, 0))
    leg.add(box(0.34, 0.09, 0.2, orangeM, 0.1, -0.335, 0)) // webbed foot, forward
    leg.add(box(0.1, 0.07, 0.06, orangeDarkM, 0.26, -0.335, 0.05 * side)) // toe notch
    leg.add(box(0.1, 0.07, 0.06, orangeDarkM, 0.26, -0.335, -0.05 * side))
  }

  // --- torso — the belly of the exchange ------------------------------------
  const torso = pivot(hips, 0, 0.14, 0)
  bones.torso = torso
  torso.add(sph(0.42, backM, -0.05, 0.22, 0, 1.0, 1.05, 0.95))
  torso.add(sph(0.38, bellyM, 0.13, 0.18, 0, 0.8, 0.97, 0.82)) // big white front
  // brass belly gauge — pressure reads "FULL"
  torso.add(cyl(0.07, 0.07, 0.04, brassM, 0.44, 0.3, 0, 0, 0, Math.PI / 2))
  torso.add(cyl(0.05, 0.05, 0.02, lensM, 0.465, 0.3, 0, 0, 0, Math.PI / 2))

  // costume 1: red inventor scarf
  if (costume === 1) {
    const scarfM = lamb(0xd8384a)
    torso.add(cyl(0.24, 0.26, 0.12, scarfM, 0.01, 0.52, 0))
    torso.add(box(0.1, 0.3, 0.14, scarfM, -0.18, 0.34, 0.1, 0, 0, 0.25)) // trailing end
  }

  // --- wings — flippers out for balance, in for VIOLENCE ---------------------
  for (const side of [1, -1]) {
    const arm = pivot(torso, -0.02, 0.44, 0.34 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    const w = bent(arm, 0, -0.14 * side, 0)
    w.add(sph(0.1, backM))
    w.add(sph(0.16, backM, 0.01, -0.26, 0.03 * side, 0.45, 1.5, 0.75))
    w.add(sph(0.13, bellyM, 0.05, -0.26, 0, 0.28, 1.3, 0.6)) // white underside
  }

  // BIG WRENCH — hidden in the right flipper until Wrench Strike needs it
  {
    const wrench = new THREE.Group()
    wrench.position.set(0.05, -0.5, 0)
    wrench.rotation.set(0, 0, 0.35)
    wrench.add(box(0.08, 0.62, 0.08, steelM, 0, -0.1, 0))
    wrench.add(box(0.2, 0.12, 0.09, steelM, -0.04, 0.26, 0))
    wrench.add(box(0.2, 0.12, 0.09, steelM, 0.1, 0.38, 0, 0, 0, 0.5))
    wrench.add(box(0.09, 0.09, 0.1, brassM, 0, -0.38, 0)) // brass butt cap
    wrench.visible = false
    bones.armR.add(wrench)
    bones.armR.userData.wrench = wrench
  }

  // --- head ------------------------------------------------------------------
  const head = pivot(torso, 0.02, 0.62, 0)
  bones.head = head
  head.add(sph(0.26, backM, -0.01, 0.08, 0, 1.0, 0.95, 1.0))
  head.add(sph(0.22, bellyM, 0.11, 0.03, 0, 0.72, 0.72, 0.85)) // face patch
  // eyes — earnest engineer eyes under the goggles
  for (const side of [1, -1]) {
    head.add(sph(0.06, bellyM, 0.2, 0.12, 0.1 * side))
    head.add(sph(0.032, lamb(0x14161a), 0.245, 0.12, 0.105 * side))
  }
  // beak — chunky orange cone + lower mandible
  head.add(cone(0.085, 0.26, orangeM, 0.33, 0.03, 0, 0, 0, -Math.PI / 2))
  head.add(box(0.14, 0.045, 0.1, orangeDarkM, 0.29, -0.045, 0))

  // --- GOGGLES — mechanical, brass, resting on the forehead (extra bone) -----
  const goggles = pivot(head, 0.06, 0.28, 0)
  bones.goggles = goggles
  goggles.add(box(0.06, 0.06, 0.44, backDarkM, -0.02, 0, 0)) // strap front
  goggles.add(box(0.05, 0.05, 0.4, backDarkM, -0.22, -0.02, 0)) // strap back
  for (const side of [1, -1]) {
    goggles.add(cyl(0.095, 0.095, 0.09, brassM, 0.1, 0.01, 0.11 * side, 0, 0, Math.PI / 2))
    goggles.add(cyl(0.075, 0.075, 0.025, lensM, 0.15, 0.01, 0.11 * side, 0, 0, Math.PI / 2))
    goggles.add(box(0.04, 0.03, 0.03, steelM, 0.1, 0.075, 0.11 * side)) // focus knob
  }
  goggles.add(box(0.06, 0.04, 0.08, steelM, 0.1, 0.01, 0)) // bridge

  // --- GADGET BACKPACK — springy extra bone, full of bad ideas ---------------
  const pack = pivot(torso, -0.36, 0.26, 0)
  bones.pack = pack
  pack.add(box(0.24, 0.5, 0.42, packM, -0.12, -0.04, 0))
  pack.add(box(0.26, 0.1, 0.44, backDarkM, -0.12, 0.2, 0)) // lid
  for (const side of [1, -1]) {
    pack.add(cyl(0.075, 0.075, 0.38, brassM, -0.28, -0.02, 0.12 * side))
    pack.add(cone(0.055, 0.09, steelM, -0.28, -0.26, 0.12 * side, Math.PI)) // nozzles
  }
  // strapped-on mini wrench + blinky diagnostics light + antenna
  pack.add(box(0.05, 0.22, 0.05, steelM, -0.02, 0.02, 0.24, 0, 0, 0.5))
  const blinkM = lamb(0xff4d5e)
  blinkM.emissive = new THREE.Color(0x661111)
  pack.add(sph(0.035, blinkM, -0.12, 0.26, 0.14))
  pack.add(cyl(0.012, 0.012, 0.3, steelM, -0.2, 0.38, -0.12))
  pack.add(sph(0.03, brassM, -0.2, 0.54, -0.12))

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.52,0]
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.52, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.0, [0.02, 0, 0.015], [0, 0.505, 0]), K(2.0, Z, HIP)],
      torso: [K(0, [0, 0, 0.02]), K(1.0, [0.02, 0, -0.03]), K(2.0, [0, 0, 0.02])],
      head: [K(0, [0, 0, -0.02]), K(0.7, [0, 0.08, 0.02]), K(1.4, [0, -0.06, 0.03]), K(2.0, [0, 0, -0.02])],
      armL: [K(0, [0, 0, 0.14]), K(1.0, [0.06, 0, 0.24]), K(2.0, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(1.0, [-0.06, 0, 0.26]), K(2.0, [0, 0, 0.16])],
      tail: [K(0, Z), K(0.5, [0.25, 0, 0]), K(1.0, Z), K(1.5, [-0.25, 0, 0]), K(2.0, Z)],
      goggles: [K(0, Z), K(1.0, [0, 0, 0.06]), K(2.0, Z)],
      pack: [K(0, Z), K(1.0, [0, 0, -0.05]), K(2.0, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // THE WADDLE — side-to-side roll, wings out, pure momentum
  walk: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0.2, 0, -0.02], [0, 0.53, 0]), K(0.125, [0, 0, -0.02], [0, 0.5, 0]), K(0.25, [-0.2, 0, -0.02], [0, 0.53, 0]), K(0.375, [0, 0, -0.02], [0, 0.5, 0]), K(0.5, [0.2, 0, -0.02], [0, 0.53, 0])],
      legL: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, -0.5]), K(0.5, [0, 0, 0.5])],
      legR: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, -0.5])],
      torso: [K(0, [-0.14, 0, -0.05]), K(0.25, [0.14, 0, -0.05]), K(0.5, [-0.14, 0, -0.05])],
      head: [K(0, [0.1, 0, 0.04]), K(0.25, [-0.1, 0, 0.04]), K(0.5, [0.1, 0, 0.04])],
      armL: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.3]), K(0.5, [0, 0, 0.55])],
      armR: [K(0, [0, 0, 0.3]), K(0.25, [0, 0, 0.55]), K(0.5, [0, 0, 0.3])],
      tail: [K(0, [0.4, 0, 0]), K(0.25, [-0.4, 0, 0]), K(0.5, [0.4, 0, 0])],
      goggles: [K(0, [0.06, 0, 0]), K(0.25, [-0.06, 0, 0]), K(0.5, [0.06, 0, 0])],
      pack: [K(0, [-0.08, 0, 0.04]), K(0.25, [0.08, 0, 0.04]), K(0.5, [-0.08, 0, 0.04])],
    },
  },

  jump: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.08], [0, 0.56, 0]), K(0.45, [0, 0, 0.08], [0, 0.56, 0])],
      legL: [K(0, Z), K(0.1, [0, 0, 0.7]), K(0.45, [0, 0, 0.6])],
      legR: [K(0, Z), K(0.1, [0, 0, 0.5]), K(0.45, [0, 0, 0.4])],
      armL: [K(0, [0, 0, 0.14]), K(0.1, [-0.3, 0, 1.4]), K(0.45, [-0.3, 0, 1.3])],
      armR: [K(0, [0, 0, 0.16]), K(0.1, [0.3, 0, 1.4]), K(0.45, [0.3, 0, 1.3])],
      torso: [K(0, Z), K(0.1, [0, 0, 0.1])],
      head: [K(0, Z), K(0.1, [0, 0, -0.12])],
      tail: [K(0, Z), K(0.1, [0, 0, -0.3])],
      goggles: [K(0, Z), K(0.1, [0, 0, -0.15])],
      pack: [K(0, Z), K(0.1, [0, 0, 0.12])],
    },
  },

  // frantic little flipper flaps — aerodynamically hopeless, spiritually aloft
  fall: {
    duration: 0.35, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.1], HIP)],
      torso: [K(0, [0, 0, 0.14])],
      head: [K(0, [0, 0, -0.08])],
      armL: [K(0, [0, 0, 1.9]), K(0.17, [0, 0, 0.9]), K(0.35, [0, 0, 1.9])],
      armR: [K(0, [0, 0, 0.9]), K(0.17, [0, 0, 1.9]), K(0.35, [0, 0, 0.9])],
      legL: [K(0, [-0.2, 0, 0.3]), K(0.17, [-0.2, 0, 0.1]), K(0.35, [-0.2, 0, 0.3])],
      legR: [K(0, [0.2, 0, 0.1]), K(0.17, [0.2, 0, 0.3]), K(0.35, [0.2, 0, 0.1])],
      tail: [K(0, [0, 0, 0.4]), K(0.17, [0, 0, 0.2]), K(0.35, [0, 0, 0.4])],
      goggles: [K(0, [0, 0, 0.2])],
      pack: [K(0, [0, 0, -0.15])],
    },
  },

  crouch: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.36, 0]), K(0.3, [0, 0, -0.08], [0, 0.35, 0]), K(0.6, [0, 0, -0.08], [0, 0.36, 0])],
      legL: [K(0, [-0.35, 0, 0.5])], legR: [K(0, [0.35, 0, 0.5])],
      torso: [K(0, [0, 0, -0.18])],
      head: [K(0, [0, 0, 0.14])],
      armL: [K(0, [0.25, 0, 0.4])], armR: [K(0, [-0.25, 0, 0.4])],
      tail: [K(0, [0, 0, 0.3])],
      goggles: [K(0, [0, 0, 0.1])],
      pack: [K(0, [0, 0, 0.1])],
    },
  },

  // wings crossed, goggles snapped DOWN over the eyes — safety first
  block: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.03, 0.49, 0])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0.02, 0, 0.12]), K(0.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.16])],
      goggles: [K(0, [0, 0, 0.85])], // visor down
      armL: [K(0, [0.5, 0, 1.1])], armR: [K(0, [-0.5, 0, 1.15])],
      legL: [K(0, [-0.12, 0, 0.08])], legR: [K(0, [0.12, 0, 0.08])],
      tail: [K(0, [0, 0, 0.2])],
      pack: [K(0, [0, 0, 0.08])],
    },
  },

  hitLight: {
    duration: 0.24, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.12], [-0.06, 0.5, 0]), K(0.24, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.08, 0.3]), K(0.24, Z)],
      head: [K(0, Z), K(0.05, [0, 0.1, 0.45]), K(0.24, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.05, [0.3, 0, -0.5]), K(0.24, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.05, [-0.3, 0, -0.4]), K(0.24, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.06, [0, 0, 0.35]), K(0.24, Z)],
      pack: [K(0, Z), K(0.06, [0, 0, -0.3]), K(0.24, Z)],
      tail: [K(0, Z), K(0.06, [0, 0, -0.3]), K(0.24, Z)],
    },
  },

  // belly absorbs most of it — he wobbles like a bath toy but does NOT go down
  hitHeavy: {
    duration: 0.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.28], [-0.16, 0.47, 0]), K(0.2, [0, 0, -0.14], [0.05, 0.53, 0]), K(0.3, [0, 0, 0.08], [-0.02, 0.51, 0]), K(0.4, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.12, 0.5]), K(0.2, [0, 0.08, -0.25]), K(0.4, Z)],
      head: [K(0, Z), K(0.06, [0, 0.12, 0.65]), K(0.2, [0, -0.08, -0.2]), K(0.4, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.06, [0.5, 0, -1.1]), K(0.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.06, [-0.5, 0, -1.0]), K(0.4, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.07, [0, 0, 0.4]), K(0.4, Z)],
      goggles: [K(0, Z), K(0.07, [0, 0, 0.6]), K(0.25, [0, 0, -0.2]), K(0.4, Z)],
      pack: [K(0, Z), K(0.07, [0, 0, -0.45]), K(0.25, [0, 0, 0.2]), K(0.4, Z)],
      tail: [K(0, Z), K(0.07, [0, 0, -0.5]), K(0.4, Z)],
    },
  },

  launched: {
    duration: 0.45, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.35], HIP)],
      torso: [K(0, [0, 0, 0.55]), K(0.22, [0, 0, 0.45]), K(0.45, [0, 0, 0.55])],
      head: [K(0, [0, 0, 0.45])],
      armL: [K(0, [-0.4, 0, 2.1]), K(0.22, [-0.2, 0, 2.4]), K(0.45, [-0.4, 0, 2.1])],
      armR: [K(0, [0.2, 0, 2.4]), K(0.22, [0.4, 0, 2.1]), K(0.45, [0.2, 0, 2.4])],
      legL: [K(0, [0, 0, 0.8]), K(0.22, [0, 0, 0.6]), K(0.45, [0, 0, 0.8])],
      legR: [K(0, [0, 0, 0.5]), K(0.22, [0, 0, 0.7]), K(0.45, [0, 0, 0.5])],
      goggles: [K(0, [0, 0, -0.35])],
      pack: [K(0, [0, 0, 0.3])],
      tail: [K(0, [0, 0, 0.5])],
    },
  },

  // on his back like an upended kettle — feet paddling, fully operational
  knockdown: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.3, 0]), K(0.4, [0, 0, 1.4], [0, 0.315, 0]), K(0.8, [0, 0, 1.4], [0, 0.3, 0])],
      legL: [K(0, [0, 0, 0.3]), K(0.2, [0, 0, 0.6]), K(0.4, [0, 0, 0.3]), K(0.6, [0, 0, 0.6]), K(0.8, [0, 0, 0.3])],
      legR: [K(0, [0, 0, 0.6]), K(0.2, [0, 0, 0.3]), K(0.4, [0, 0, 0.6]), K(0.6, [0, 0, 0.3]), K(0.8, [0, 0, 0.6])],
      torso: [K(0, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.3])],
      armL: [K(0, [0.9, 0, 0.3])], armR: [K(0, [-0.9, 0, 0.3])],
      goggles: [K(0, [0, 0, -0.4])],
      pack: [K(0, [0, 0, 0.2])],
      tail: [K(0, [0.4, 0, 0])],
    },
  },

  // the signature: rocks on the belly and POPS upright — a weeble, not a victim
  getup: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.4], [0, 0.3, 0]), K(0.14, [0, 0, 1.1], [0.04, 0.34, 0]), K(0.26, [0, 0, 0.3], [0, 0.44, 0]), K(0.36, [0, 0, -0.12], [0, 0.58, 0]), K(0.5, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.26, [0, 0, 0.6]), K(0.5, Z)],
      legR: [K(0, [0, 0, 0.6]), K(0.26, [0, 0, 0.3]), K(0.5, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.26, [0, 0, -0.3]), K(0.36, [0, 0, 0.12]), K(0.5, Z)],
      head: [K(0, [0, 0, -0.3]), K(0.36, [0, 0, 0.15]), K(0.5, Z)],
      armL: [K(0, [0.9, 0, 0.3]), K(0.26, [0.2, 0, 1.3]), K(0.5, [0, 0, 0.14])],
      armR: [K(0, [-0.9, 0, 0.3]), K(0.26, [-0.2, 0, 1.3]), K(0.5, [0, 0, 0.16])],
      goggles: [K(0, [0, 0, -0.4]), K(0.36, [0, 0, 0.3]), K(0.5, Z)],
      pack: [K(0, [0, 0, 0.2]), K(0.36, [0, 0, -0.2]), K(0.5, Z)],
      tail: [K(0, [0.4, 0, 0]), K(0.5, Z)],
    },
  },

  // waddles in, taps the belly gauge, snaps the goggles up: ready to invent
  entrance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, [0.18, 0, 0], [0, 0.53, 0]), K(0.25, [-0.18, 0, 0], [0, 0.5, 0]), K(0.5, [0.18, 0, 0], [0, 0.53, 0]), K(0.75, [-0.18, 0, 0], [0, 0.5, 0]), K(1.0, Z, HIP), K(2.4, Z, HIP)],
      legL: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, -0.5]), K(0.5, [0, 0, 0.5]), K(0.75, [0, 0, -0.5]), K(1.0, Z), K(2.4, Z)],
      legR: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, 0.5]), K(0.5, [0, 0, -0.5]), K(0.75, [0, 0, 0.5]), K(1.0, Z), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.55]), K(1.0, [0, 0, 0.14]), K(1.2, [0.35, 0, 0.9]), K(1.45, [0.35, 0, 0.75]), K(1.6, [0.35, 0, 0.9]), K(1.8, [0, 0, 0.14]), K(2.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.3]), K(1.0, [0, 0, 0.16]), K(1.8, [0, 0, 0.16]), K(1.95, [0, 0, 2.6]), K(2.15, [0, 0, 2.4]), K(2.4, [0, 0, 0.16])],
      head: [K(0, [0.1, 0, 0.04]), K(1.0, Z), K(1.2, [0, 0, 0.25]), K(1.8, [0, 0, 0.2]), K(1.95, [0, 0, -0.15]), K(2.2, [0, 0.1, 0]), K(2.4, Z)],
      goggles: [K(0, [0, 0, 0.85]), K(1.8, [0, 0, 0.85]), K(2.0, [0, 0, -0.15]), K(2.1, [0, 0, 0.08]), K(2.4, Z)], // goggles UP
      torso: [K(0, [-0.14, 0, -0.05]), K(1.0, Z), K(1.2, [0, 0, 0.12]), K(1.8, [0, 0, 0.1]), K(2.0, [0, 0, -0.08]), K(2.4, Z)],
      pack: [K(0, [-0.08, 0, 0.04]), K(1.0, Z), K(2.0, [0, 0, -0.15]), K(2.15, [0, 0, 0.1]), K(2.4, Z)],
      tail: [K(0, [0.4, 0, 0]), K(0.25, [-0.4, 0, 0]), K(0.5, [0.4, 0, 0]), K(0.75, [-0.4, 0, 0]), K(1.0, Z), K(2.4, Z)],
    },
  },

  // happy little hop-flaps — the roundest possible celebration
  win: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, Z, [0, 0.42, 0]), K(0.5, Z, [0, 0.72, 0]), K(0.7, Z, [0, 0.5, 0]), K(0.9, Z, [0, 0.42, 0]), K(1.1, Z, [0, 0.72, 0]), K(1.3, Z, [0, 0.5, 0]), K(1.6, Z, HIP), K(2.4, Z, HIP)],
      armL: [K(0, [0, 0, 0.14]), K(0.3, [0, 0, 0.5]), K(0.5, [-0.5, 0, 2.6]), K(0.7, [0, 0, 0.5]), K(0.9, [0, 0, 0.5]), K(1.1, [-0.5, 0, 2.6]), K(1.3, [0, 0, 0.5]), K(1.6, [0, 0, 0.14]), K(2.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.3, [0, 0, 0.5]), K(0.5, [0.5, 0, 2.6]), K(0.7, [0, 0, 0.5]), K(0.9, [0, 0, 0.5]), K(1.1, [0.5, 0, 2.6]), K(1.3, [0, 0, 0.5]), K(1.6, [0, 0, 0.16]), K(2.4, [0, 0, 0.16])],
      head: [K(0, Z), K(0.5, [0, 0, -0.25]), K(1.1, [0, 0, -0.25]), K(1.6, Z), K(1.9, [0, 0.3, 0]), K(2.1, [0, -0.3, 0]), K(2.4, Z)],
      torso: [K(0, Z), K(0.5, [0, 0, -0.12]), K(1.1, [0, 0, -0.12]), K(1.6, Z), K(2.4, Z)],
      legL: [K(0, Z), K(0.5, [0, 0, 0.5]), K(1.1, [0, 0, 0.5]), K(1.6, Z), K(2.4, Z)],
      legR: [K(0, Z), K(0.5, [0, 0, 0.5]), K(1.1, [0, 0, 0.5]), K(1.6, Z), K(2.4, Z)],
      goggles: [K(0, Z), K(0.5, [0, 0, -0.3]), K(1.1, [0, 0, -0.3]), K(1.6, Z), K(2.4, Z)],
      pack: [K(0, Z), K(0.5, [0, 0, 0.25]), K(1.1, [0, 0, 0.25]), K(1.6, Z), K(2.4, Z)],
      tail: [K(0, Z), K(0.3, [0.5, 0, 0]), K(0.7, [-0.5, 0, 0]), K(1.1, [0.5, 0, 0]), K(1.6, Z), K(2.4, Z)],
    },
  },

  // sits down with dignity, checks the pack — the prototype needed one more pass
  lose: {
    duration: 2.0, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.15], [0, 0.34, 0]), K(1.0, [0, 0, 0.15], [0, 0.33, 0]), K(2.0, [0, 0, 0.15], [0, 0.34, 0])],
      legL: [K(0, [-0.2, 0, -0.9])], legR: [K(0, [0.2, 0, -0.9])],
      torso: [K(0, [0, 0, -0.3]), K(1.0, [0, 0, -0.34]), K(2.0, [0, 0, -0.3])],
      head: [K(0, [0, 0, -0.4]), K(0.8, [0, 0.3, -0.35]), K(1.4, [0, -0.2, -0.4]), K(2.0, [0, 0, -0.4])],
      armL: [K(0, [0, 0, 0.3])],
      armR: [K(0, [0, 0, 0.3]), K(0.8, [-0.6, 0, 0.8]), K(1.4, [-0.6, 0, 0.7]), K(2.0, [0, 0, 0.3])],
      goggles: [K(0, [0, 0, 0.6])], // slid down over the eyes, hiding the sniffle
      pack: [K(0, [0, 0, 0.15])],
      tail: [K(0, [0, 0, -0.2])],
    },
  },

  // pats the mighty belly twice: THIS is the engine of the operation
  taunt: {
    duration: 1.2, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, [0, 0, -0.06], [0, 0.54, 0]), K(0.9, [0, 0, -0.06], [0, 0.54, 0]), K(1.2, Z, HIP)],
      torso: [K(0, Z), K(0.3, [0, 0, -0.15]), K(0.9, [0, 0, -0.15]), K(1.2, Z)],
      head: [K(0, Z), K(0.3, [0, 0, -0.2]), K(0.6, [0, 0.2, -0.15]), K(0.9, [0, -0.2, -0.15]), K(1.2, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.35, [0.5, 0, 0.7]), K(0.45, [0.5, 0, 0.5]), K(0.55, [0.5, 0, 0.7]), K(0.65, [0.5, 0, 0.5]), K(0.8, [0.5, 0, 0.7]), K(1.2, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.35, [-0.5, 0, 0.7]), K(0.5, [-0.5, 0, 0.5]), K(0.65, [-0.5, 0, 0.7]), K(0.8, [-0.5, 0, 0.5]), K(1.2, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.3, [0, 0, -0.2]), K(0.9, [0, 0, -0.2]), K(1.2, Z)],
      pack: [K(0, Z), K(0.35, [0, 0, 0.12]), K(0.55, [0, 0, -0.08]), K(0.75, [0, 0, 0.12]), K(1.2, Z)],
      tail: [K(0, Z), K(0.4, [0.4, 0, 0]), K(0.7, [-0.4, 0, 0]), K(1.2, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  wingSlap: {
    duration: 0.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.16]), K(0.08, [0.4, -0.5, -0.6]), K(0.14, [-0.3, 0.6, 1.5]), K(0.22, [-0.2, 0.4, 1.2]), K(0.3, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.08, [0, -0.3, 0]), K(0.14, [0, 0.35, -0.1]), K(0.3, Z)],
      hips: [K(0, Z, HIP), K(0.14, [0, 0.25, 0], [0.04, 0.51, 0]), K(0.3, Z, HIP)],
      head: [K(0, Z), K(0.14, [0, -0.15, -0.1]), K(0.3, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.14, [0.2, 0, 0.5]), K(0.3, [0, 0, 0.14])],
      goggles: [K(0, Z), K(0.16, [0, 0, 0.2]), K(0.3, Z)],
      pack: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.3, Z)],
    },
  },

  beakJab: {
    duration: 0.25, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.07, [0, 0, -0.05], [0.09, 0.5, 0]), K(0.13, [0, 0, -0.02], [0.11, 0.5, 0]), K(0.25, Z, HIP)],
      torso: [K(0, Z), K(0.07, [0, 0, -0.35]), K(0.25, Z)],
      head: [K(0, Z), K(0.07, [0, 0, -0.35]), K(0.11, [0, 0, -0.15]), K(0.15, [0, 0, -0.35]), K(0.25, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.07, [0.3, 0, -0.5]), K(0.25, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.07, [-0.3, 0, -0.5]), K(0.25, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.09, [0, 0, -0.2]), K(0.25, Z)],
      tail: [K(0, Z), K(0.09, [0, 0, 0.3]), K(0.25, Z)],
    },
  },

  // rear back, then the belly arrives like a margin call
  bellyBounce: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, 0.2], [-0.12, 0.5, 0]), K(0.17, [0, 0, -0.15], [0.22, 0.48, 0]), K(0.28, [0, 0, 0.05], [0.08, 0.53, 0]), K(0.45, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, 0.4]), K(0.17, [0, 0, -0.3]), K(0.28, [0, 0, 0.1]), K(0.45, Z)],
      head: [K(0, Z), K(0.1, [0, 0, 0.4]), K(0.17, [0, 0, -0.1]), K(0.45, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.1, [0.3, 0, -0.8]), K(0.17, [0.5, 0, 1.2]), K(0.45, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.1, [-0.3, 0, -0.8]), K(0.17, [-0.5, 0, 1.2]), K(0.45, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.17, [0, 0, -0.3]), K(0.45, Z)],
      legR: [K(0, Z), K(0.1, [0, 0, 0.3]), K(0.45, Z)],
      goggles: [K(0, Z), K(0.18, [0, 0, 0.4]), K(0.45, Z)],
      pack: [K(0, Z), K(0.1, [0, 0, 0.2]), K(0.18, [0, 0, -0.35]), K(0.45, Z)],
      tail: [K(0, Z), K(0.17, [0, 0, 0.5]), K(0.45, Z)],
    },
  },

  // drops onto the belly and toboggans in — feet-first finish
  iceSlide: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, 0.45], [0.05, 0.3, 0]), K(0.34, [0, 0, 0.45], [0.05, 0.28, 0]), K(0.42, [0, 0, 0.1], [0, 0.44, 0]), K(0.5, Z, HIP)],
      legL: [K(0, Z), K(0.08, [-0.15, 0, -0.9]), K(0.34, [-0.15, 0, -0.9]), K(0.5, Z)],
      legR: [K(0, Z), K(0.08, [0.15, 0, -0.9]), K(0.34, [0.15, 0, -0.9]), K(0.5, Z)],
      torso: [K(0, Z), K(0.08, [0, 0, 0.3]), K(0.34, [0, 0, 0.3]), K(0.5, Z)],
      head: [K(0, Z), K(0.08, [0, 0, -0.4]), K(0.34, [0, 0, -0.4]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.08, [0.4, 0, 1.6]), K(0.34, [0.4, 0, 1.6]), K(0.5, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.08, [-0.4, 0, 1.6]), K(0.34, [-0.4, 0, 1.6]), K(0.5, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.08, [0, 0, 0.85]), K(0.42, [0, 0, 0.85]), K(0.5, Z)],
      pack: [K(0, Z), K(0.08, [0, 0, -0.25]), K(0.34, [0, 0, -0.25]), K(0.5, Z)],
      tail: [K(0, Z), K(0.08, [0, 0, 0.5]), K(0.34, [0, 0, 0.5]), K(0.5, Z)],
    },
  },

  // brace, vent the tanks, ride the recoil half a step
  backpackBurst: {
    duration: 0.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.12], [-0.05, 0.48, 0]), K(0.14, [0, 0, 0.05], [0.12, 0.52, 0]), K(0.4, Z, HIP)],
      torso: [K(0, Z), K(0.08, [0, 0, -0.35]), K(0.14, [0, 0, 0.15]), K(0.4, Z)],
      head: [K(0, Z), K(0.08, [0, 0, -0.2]), K(0.14, [0, 0, 0.25]), K(0.4, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.08, [0.4, 0, 1.0]), K(0.14, [0.3, 0, -0.6]), K(0.4, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.08, [-0.4, 0, 1.0]), K(0.14, [-0.3, 0, -0.6]), K(0.4, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.08, [-0.2, 0, 0.4]), K(0.4, Z)],
      legR: [K(0, Z), K(0.08, [0.2, 0, 0.4]), K(0.4, Z)],
      goggles: [K(0, Z), K(0.14, [0, 0, -0.3]), K(0.4, Z)],
      pack: [K(0, Z), K(0.1, [0, 0, 0.35]), K(0.16, [0, 0, -0.5]), K(0.26, [0, 0, 0.2]), K(0.4, Z)],
      tail: [K(0, Z), K(0.14, [0, 0, -0.4]), K(0.4, Z)],
    },
  },

  // golf-swing uppercut with a wrench the size of policy failure
  wrenchStrike: {
    duration: 0.5, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.16]), K(0.14, [0.2, 0, -1.4]), K(0.19, [0, 0, -1.6]), K(0.26, [-0.2, 0, 2.3]), K(0.36, [-0.2, 0, 2.1]), K(0.5, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.14, [0, -0.45, 0.1]), K(0.26, [0, 0.5, -0.25]), K(0.5, Z)],
      hips: [K(0, Z, HIP), K(0.14, [0, -0.3, 0], [0, 0.45, 0]), K(0.26, [0, 0.35, 0.05], [0.08, 0.58, 0]), K(0.38, Z, [0.03, 0.53, 0]), K(0.5, Z, HIP)],
      head: [K(0, Z), K(0.14, [0, -0.3, 0.1]), K(0.26, [0, 0.2, -0.3]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.14, [0.3, 0, 0.6]), K(0.26, [0.3, 0, -0.9]), K(0.5, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.26, [0, 0, -0.5]), K(0.5, Z)],
      legR: [K(0, Z), K(0.14, [0, 0, 0.3]), K(0.5, Z)],
      goggles: [K(0, Z), K(0.27, [0, 0, -0.35]), K(0.5, Z)],
      pack: [K(0, Z), K(0.27, [0, 0, 0.3]), K(0.5, Z)],
      tail: [K(0, Z), K(0.27, [0, 0, 0.4]), K(0.5, Z)],
    },
  },

  // scoop, pack it square (efficiency), deliver
  snowballToss: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.1, [0, 0, -0.1], [0, 0.4, 0]), K(0.24, [0, 0, 0.05], [0.04, 0.54, 0]), K(0.5, Z, HIP)],
      torso: [K(0, Z), K(0.1, [0, 0, -0.3]), K(0.24, [0, -0.3, 0.15]), K(0.32, [0, 0.35, -0.15]), K(0.5, Z)],
      armR: [K(0, [0, 0, 0.16]), K(0.1, [0, 0, -0.7]), K(0.2, [0.2, 0, -0.9]), K(0.3, [-0.2, 0, 1.9]), K(0.4, [-0.1, 0, 1.5]), K(0.5, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.1, [0, 0, -0.5]), K(0.3, [0.3, 0, 0.7]), K(0.5, [0, 0, 0.14])],
      head: [K(0, Z), K(0.1, [0, 0, 0.2]), K(0.3, [0, 0, -0.25]), K(0.5, Z)],
      legL: [K(0, Z), K(0.1, [-0.3, 0, 0.5]), K(0.3, Z)],
      legR: [K(0, Z), K(0.1, [0.3, 0, 0.5]), K(0.3, Z)],
      goggles: [K(0, Z), K(0.32, [0, 0, -0.25]), K(0.5, Z)],
      pack: [K(0, Z), K(0.32, [0, 0, 0.2]), K(0.5, Z)],
    },
  },

  // squat, ignite, rise like a small orange-footed rocket, wing-hammer on top
  rocketHop: {
    duration: 0.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.1], [0, 0.36, 0]), K(0.18, [0, 0, 0.15], [0, 0.6, 0]), K(0.3, [0, 0, 0.1], [0, 0.58, 0]), K(0.45, Z, [0, 0.54, 0]), K(0.6, Z, HIP)],
      legL: [K(0, Z), K(0.08, [-0.35, 0, 0.5]), K(0.18, [0, 0, 0.8]), K(0.45, [0, 0, 0.3]), K(0.6, Z)],
      legR: [K(0, Z), K(0.08, [0.35, 0, 0.5]), K(0.18, [0, 0, 0.6]), K(0.45, [0, 0, 0.2]), K(0.6, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.08, [0.25, 0, 0.4]), K(0.18, [-0.4, 0, 2.5]), K(0.26, [-0.3, 0, 1.0]), K(0.6, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.08, [-0.25, 0, 0.4]), K(0.18, [0.4, 0, 2.5]), K(0.26, [0.3, 0, 1.0]), K(0.6, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.08, [0, 0, -0.2]), K(0.18, [0, 0, 0.15]), K(0.26, [0, 0, -0.25]), K(0.6, Z)],
      head: [K(0, Z), K(0.18, [0, 0, -0.2]), K(0.26, [0, 0, 0.2]), K(0.6, Z)],
      goggles: [K(0, Z), K(0.18, [0, 0, -0.3]), K(0.6, Z)],
      pack: [K(0, Z), K(0.12, [0, 0, 0.4]), K(0.2, [0, 0, -0.3]), K(0.32, [0, 0, 0.15]), K(0.6, Z)],
      tail: [K(0, Z), K(0.18, [0, 0, 0.5]), K(0.6, Z)],
    },
  },

  // turns his back on them (rude), shivers up a chill, pack-checks them away
  coldShoulder: {
    duration: 0.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 1.6, 0], [0, 0.5, 0]), K(0.24, [0, 3.14, 0], [0, 0.52, 0]), K(0.52, [0, 3.14, 0], [0, 0.52, 0]), K(0.6, [0, 3.14, 0], [-0.16, 0.52, 0]), K(0.72, [0, 4.7, 0], [0, 0.52, 0]), K(0.9, [0, 6.28, 0], HIP)],
      torso: [K(0, Z), K(0.24, [0, 0, 0.08]), K(0.34, [0.1, 0, 0.1]), K(0.42, [-0.1, 0, 0.1]), K(0.5, [0.1, 0, 0.1]), K(0.6, [0, 0, -0.3]), K(0.9, Z)],
      head: [K(0, Z), K(0.24, [0, 0.4, -0.1]), K(0.52, [0, 0.4, -0.1]), K(0.6, [0, 0, 0.2]), K(0.9, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.24, [0.6, 0, 0.9]), K(0.52, [0.6, 0, 0.9]), K(0.9, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.24, [-0.6, 0, 0.9]), K(0.52, [-0.6, 0, 0.9]), K(0.9, [0, 0, 0.16])],
      pack: [K(0, Z), K(0.34, [0, 0, 0.15]), K(0.42, [0, 0, -0.15]), K(0.5, [0, 0, 0.15]), K(0.62, [0, 0, -0.4]), K(0.9, Z)],
      goggles: [K(0, Z), K(0.34, [0, 0, 0.15]), K(0.42, [0, 0, -0.1]), K(0.5, [0, 0, 0.15]), K(0.9, Z)],
      tail: [K(0, Z), K(0.34, [0.3, 0, 0]), K(0.42, [-0.3, 0, 0]), K(0.5, [0.3, 0, 0]), K(0.9, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // hoists them, leaps, and delivers the belly like a court summons
  piledriver: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, -0.15], [0.06, 0.42, 0]), K(0.3, [0, 0, 0.3], [0, 0.95, 0]), K(0.44, [0, 0, 1.2], [0, 1.0, 0]), K(0.56, [0, 0, 1.5], [0.1, 0.34, 0]), K(0.68, [0, 0, 0.8], [0, 0.48, 0]), K(0.82, [0, 0, 0.1], [0, 0.54, 0]), K(1.0, Z, HIP)],
      torso: [K(0, Z), K(0.14, [0, 0, -0.4]), K(0.3, [0, 0, 0.2]), K(0.44, [0, 0, 0.4]), K(0.56, [0, 0, 0.3]), K(1.0, Z)],
      head: [K(0, Z), K(0.14, [0, 0, -0.3]), K(0.44, [0, 0, 0.3]), K(0.56, [0, 0, -0.4]), K(1.0, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.14, [0.3, 0, 1.5]), K(0.3, [0.4, 0, 2.3]), K(0.56, [0.6, 0, 0.6]), K(1.0, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.14, [-0.3, 0, 1.5]), K(0.3, [-0.4, 0, 2.3]), K(0.56, [-0.6, 0, 0.6]), K(1.0, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.3, [0, 0, 0.7]), K(0.56, [0, 0, 0.9]), K(0.82, Z)],
      legR: [K(0, Z), K(0.3, [0, 0, 0.5]), K(0.56, [0, 0, 0.7]), K(0.82, Z)],
      goggles: [K(0, Z), K(0.44, [0, 0, -0.4]), K(0.6, [0, 0, 0.3]), K(1.0, Z)],
      pack: [K(0, Z), K(0.44, [0, 0, 0.35]), K(0.6, [0, 0, -0.3]), K(1.0, Z)],
      tail: [K(0, Z), K(0.44, [0, 0, 0.5]), K(1.0, Z)],
    },
  },

  // double wing-push: the vault door swings shut
  coldStorage: {
    duration: 0.77, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, -0.1], [-0.06, 0.48, 0]), K(0.22, [0, 0, 0.06], [0.1, 0.52, 0]), K(0.5, [0, 0, 0.04], [0.06, 0.52, 0]), K(0.77, Z, HIP)],
      torso: [K(0, Z), K(0.12, [0, 0, -0.3]), K(0.22, [0, 0, 0.1]), K(0.77, Z)],
      head: [K(0, Z), K(0.12, [0, 0, -0.2]), K(0.22, [0, 0, 0.1]), K(0.77, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.12, [0.5, 0, -0.6]), K(0.22, [0.35, 0, 1.5]), K(0.5, [0.35, 0, 1.45]), K(0.77, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.12, [-0.5, 0, -0.6]), K(0.22, [-0.35, 0, 1.5]), K(0.5, [-0.35, 0, 1.45]), K(0.77, [0, 0, 0.16])],
      goggles: [K(0, Z), K(0.14, [0, 0, 0.85]), K(0.6, [0, 0, 0.85]), K(0.77, Z)],
      pack: [K(0, Z), K(0.22, [0, 0, -0.2]), K(0.77, Z)],
      legL: [K(0, Z), K(0.12, [-0.15, 0, 0.2]), K(0.77, Z)],
      legR: [K(0, Z), K(0.12, [0.15, 0, 0.2]), K(0.77, Z)],
    },
  },

  // tuck into the roundest object in finance and ROLL — hips spin like a wheel
  bellyExchange: {
    duration: 3.1, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.6], [0, 0.42, 0]), K(0.5, [0, 0, -7], [0, 0.44, 0]), K(1.0, [0, 0, -14], [0, 0.44, 0]), K(1.5, [0, 0, -21], [0, 0.44, 0]), K(2.0, [0, 0, -28], [0, 0.44, 0]), K(2.5, [0, 0, -34.5], [0, 0.44, 0]), K(2.75, [0, 0, -37.1], [0, 0.5, 0]), K(3.1, [0, 0, -37.7], HIP)],
      torso: [K(0, Z), K(0.2, [0, 0, -0.85]), K(2.6, [0, 0, -0.85]), K(3.1, Z)],
      head: [K(0, Z), K(0.2, [0, 0, -0.8]), K(2.6, [0, 0, -0.8]), K(3.1, Z)],
      armL: [K(0, [0, 0, 0.14]), K(0.2, [0.9, 0, 1.1]), K(2.6, [0.9, 0, 1.1]), K(3.1, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [-0.9, 0, 1.1]), K(2.6, [-0.9, 0, 1.1]), K(3.1, [0, 0, 0.16])],
      legL: [K(0, Z), K(0.2, [-0.2, 0, 1.0]), K(2.6, [-0.2, 0, 1.0]), K(3.1, Z)],
      legR: [K(0, Z), K(0.2, [0.2, 0, 1.0]), K(2.6, [0.2, 0, 1.0]), K(3.1, Z)],
      goggles: [K(0, Z), K(0.2, [0, 0, 0.85]), K(2.75, [0, 0, 0.85]), K(3.1, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, 0.3]), K(2.6, [0, 0, 0.3]), K(3.1, Z)],
      tail: [K(0, Z), K(0.2, [0, 0, 0.6]), K(2.6, [0, 0, 0.6]), K(3.1, Z)],
    },
  },

  // reach into the pack, deploy machine, crank it twice, step back. pray.
  prototype: {
    duration: 1.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, -0.5, 0], [0, 0.5, 0]), K(0.45, [0, 0.2, -0.15], [0.08, 0.42, 0]), K(0.75, [0, 0.2, -0.1], [0.08, 0.44, 0]), K(1.05, [0, 0, 0], [-0.12, 0.5, 0]), K(1.5, Z, HIP)],
      torso: [K(0, Z), K(0.2, [0, -0.4, 0.1]), K(0.45, [0, 0.2, -0.45]), K(0.75, [0, 0.2, -0.4]), K(1.05, [0, 0, 0.15]), K(1.5, Z)],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [-0.9, 0, 0.9]), K(0.45, [0, 0, -1.0]), K(0.55, [0, 0, -0.6]), K(0.65, [0, 0, -1.0]), K(0.75, [0, 0, -0.6]), K(1.05, [0, 0, 0.6]), K(1.5, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.45, [0.3, 0, -0.7]), K(0.75, [0.3, 0, -0.7]), K(1.05, [0.3, 0, 0.8]), K(1.5, [0, 0, 0.14])],
      head: [K(0, Z), K(0.2, [0, -0.4, 0]), K(0.45, [0, 0, -0.35]), K(0.75, [0, 0, -0.35]), K(1.05, [0, 0, 0.1]), K(1.2, [0.15, 0, 0]), K(1.35, [-0.15, 0, 0]), K(1.5, Z)],
      goggles: [K(0, Z), K(0.4, [0, 0, 0.85]), K(1.0, [0, 0, 0.85]), K(1.15, Z), K(1.5, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, 0.4]), K(0.35, [0, 0, -0.2]), K(1.5, Z)],
      legL: [K(0, Z), K(0.45, [-0.3, 0, 0.4]), K(1.05, Z)],
      legR: [K(0, Z), K(0.45, [0.3, 0, 0.4]), K(1.05, Z)],
      tail: [K(0, Z), K(0.45, [0, 0, 0.4]), K(1.05, Z)],
    },
  },

  // points a flipper at the sky and lets logistics handle the rest
  airdrop: {
    duration: 1.6, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.05], [0, 0.5, 0]), K(1.4, [0, 0, -0.05], [0, 0.5, 0]), K(1.6, Z, HIP)],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [0, 0, 2.9]), K(1.1, [0, 0, 2.9]), K(1.3, [0, 0, 0.8]), K(1.6, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.2, [0.4, 0, 0.5]), K(1.1, [0.4, 0, 0.5]), K(1.6, [0, 0, 0.14])],
      head: [K(0, Z), K(0.2, [0, 0, 0.5]), K(0.8, [0, 0.2, 0.5]), K(1.1, [0, -0.2, 0.5]), K(1.3, [0, 0, -0.1]), K(1.6, Z)],
      torso: [K(0, Z), K(0.2, [0, 0, 0.15]), K(1.1, [0, 0, 0.15]), K(1.6, Z)],
      goggles: [K(0, Z), K(0.25, [0, 0, -0.4]), K(1.2, [0, 0, -0.4]), K(1.6, Z)],
      pack: [K(0, Z), K(0.3, [0, 0, 0.15]), K(0.5, [0, 0, -0.1]), K(0.7, [0, 0, 0.15]), K(1.6, Z)],
      tail: [K(0, Z), K(0.4, [0.3, 0, 0]), K(0.8, [-0.3, 0, 0]), K(1.2, [0.3, 0, 0]), K(1.6, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // rummage... produce tiny frozen USB... stare... stare more... shrug... poke
  coldWallet: {
    duration: 1.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0.6, 0], [0, 0.5, 0]), K(0.4, [0, 0, 0], HIP), K(1.4, Z, HIP)],
      armR: [K(0, [0, 0, 0.16]), K(0.2, [-1.2, 0, 0.8]), K(0.4, [0, 0, 1.2]), K(0.85, [0, 0, 1.2]), K(1.0, [0.4, 0, 0.9]), K(1.1, [0, 0, 1.4]), K(1.25, [0, 0, 1.1]), K(1.4, [0, 0, 0.16])],
      armL: [K(0, [0, 0, 0.14]), K(0.4, [0.2, 0, 0.4]), K(1.0, [0.6, 0, 0.9]), K(1.15, [0.2, 0, 0.4]), K(1.4, [0, 0, 0.14])],
      head: [K(0, Z), K(0.2, [0, 0.5, 0]), K(0.4, [0, 0, 0.45]), K(0.7, [0.1, 0, 0.45]), K(0.85, [-0.1, 0, 0.45]), K(1.0, [0, 0.3, 0.1]), K(1.15, [0, 0, 0.2]), K(1.4, Z)],
      torso: [K(0, Z), K(0.2, [0, 0.3, 0]), K(0.4, [0, 0, 0.1]), K(1.0, [0, 0, 0.15]), K(1.4, Z)],
      goggles: [K(0, Z), K(0.45, [0, 0, 0.3]), K(0.95, [0, 0, 0.3]), K(1.4, Z)],
      pack: [K(0, Z), K(0.2, [0, 0, 0.3]), K(0.35, [0, 0, -0.15]), K(1.4, Z)],
      tail: [K(0, Z), K(1.0, [0.3, 0, 0]), K(1.15, [-0.3, 0, 0]), K(1.4, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // finisher: grand frost conductor — wings spread, channel, point, DECREE
  frozenAssets: {
    duration: 2.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.2, [0, 0, -0.1], [0, 0.46, 0]), K(0.4, [0, 0, 0.1], [0, 0.58, 0]), K(1.6, [0, 0, 0.1], [0, 0.56, 0]), K(1.9, [0, 0, -0.05], [0, 0.5, 0]), K(2.4, Z, HIP), K(2.9, Z, HIP)],
      armL: [K(0, [0, 0, 0.14]), K(0.3, [-0.9, 0, 2.4]), K(1.5, [-0.9, 0, 2.4]), K(1.9, [0.4, 0, 0.9]), K(2.3, [0.4, 0, 0.9]), K(2.9, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.16]), K(0.3, [0.9, 0, 2.4]), K(1.5, [0.9, 0, 2.4]), K(1.9, [-0.3, 0, 1.6]), K(2.3, [-0.3, 0, 1.6]), K(2.9, [0, 0, 0.16])],
      torso: [K(0, Z), K(0.3, [0, 0, 0.2]), K(1.5, [0, 0, 0.2]), K(1.9, [0, 0, -0.25]), K(2.4, Z), K(2.9, Z)],
      head: [K(0, Z), K(0.3, [0, 0, 0.35]), K(1.5, [0, 0, 0.35]), K(1.9, [0, 0, -0.3]), K(2.4, Z), K(2.9, Z)],
      goggles: [K(0, Z), K(0.25, [0, 0, 0.85]), K(2.2, [0, 0, 0.85]), K(2.5, [0, 0, -0.15]), K(2.7, Z), K(2.9, Z)],
      pack: [K(0, Z), K(0.35, [0, 0, 0.3]), K(0.55, [0, 0, -0.2]), K(0.75, [0, 0, 0.3]), K(0.95, [0, 0, -0.2]), K(1.15, [0, 0, 0.3]), K(1.5, Z), K(2.9, Z)],
      tail: [K(0, Z), K(0.4, [0.4, 0, 0]), K(0.8, [-0.4, 0, 0]), K(1.2, [0.4, 0, 0]), K(1.6, Z), K(2.9, Z)],
      legL: [K(0, Z), K(0.3, [-0.15, 0, 0.15]), K(1.9, Z)],
      legR: [K(0, Z), K(0.3, [0.15, 0, 0.15]), K(1.9, Z)],
    },
  },
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

// recolor / rescale a spawned prop's meshes (visual only; physics unchanged)
function styleProp(p, hex, scale) {
  try {
    p?.mesh?.traverse?.((o) => {
      if (o.isMesh && o.material?.color) o.material.color.setHex(hex)
    })
    if (scale) p?.mesh?.scale?.set(scale[0], scale[1], scale[2])
  } catch { /* cosmetic only */ }
}

// icy emissive tint on a fighter; returns a restore fn (idempotent, guarded)
function freezeTint(fighter) {
  const touched = []
  try {
    for (const m of fighter?.mats || []) { touched.push(m); m.emissive.setHex(C.iceDeep) }
  } catch { /* cosmetic only */ }
  let restored = false
  return () => {
    if (restored) return
    restored = true
    try { for (const m of touched) m.emissive.setHex(0x000000) } catch { /* cosmetic only */ }
  }
}

// translucent ice block parented to the fighter's hips (rides along with them);
// returns a remove fn (idempotent, guarded). No physics — pure staging.
function makeIceShell(fighter, h = 1.5) {
  try {
    const hips = fighter?.bones?.hips
    if (!hips) return () => {}
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, h, 0.95),
      new THREE.MeshLambertMaterial({ color: C.ice, transparent: true, opacity: 0.45, flatShading: true })
    )
    shell.position.set(0.04, 0.28, 0)
    // frosty crack lines
    const crackM = lamb(0xd8f2ff, { transparent: true, opacity: 0.7 })
    shell.add(box(0.02, h * 0.5, 0.03, crackM, 0.53, 0.15, 0.1, 0, 0, 0.4))
    shell.add(box(0.02, h * 0.35, 0.03, crackM, 0.53, -0.2, -0.15, 0, 0, -0.5))
    hips.add(shell)
    let removed = false
    return () => {
      if (removed) return
      removed = true
      try {
        hips.remove(shell)
        shell.geometry.dispose()
        shell.material.dispose()
        shell.children.forEach((c) => { c.geometry?.dispose?.(); c.material?.dispose?.() })
      } catch { /* cosmetic only */ }
    }
  } catch { return () => {} }
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function bellyBounceScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(4, () => { try { fx.self.squash?.(0.3) } catch { /* squash optional */ } })
  fx.after(9, () => {
    fx.impulse(fx.self, [F * 3.5, 0, 0])
    fx.sfx('boing')
    if (inRange(fx, 1.8)) {
      fx.shake(0.6)
      try { fx.self.squash?.(0.5) } catch { /* squash optional */ }
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: 12 })
      fx.hit({ damage: 12, knockback: { x: 12, y: 3, spin: 0.6 }, hitStun: 20 })
      fx.impulse(fx.self, [-F * 2.5, 1.2, 0]) // bounces off his own impact
      fx.caption('BOUNCED OFF THE BALANCE SHEET')
    }
  })
  fx.after(27, end)
}

function iceSlideScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('slide')
  let landed = false
  const tryHit = () => {
    if (landed || !inRange(fx, 1.5)) return
    landed = true
    fx.sfx('kick')
    fx.shake(0.35)
    fx.particles('impact', v3(fx.foe.pos.x, 0.5, 0), { n: 8 })
    fx.hit({ damage: 8, knockback: { x: 8, y: 2.5, spin: 1 }, hitStun: 18 })
  }
  for (let i = 0; i < 5; i++) {
    fx.after(7 + i * 3, () => {
      fx.impulse(fx.self, [F * 4, 0, 0])
      fx.particles('smoke', v3(fx.self.pos.x - F * 0.3, 0.12, 0), { n: 2 })
      tryHit()
    })
  }
  fx.after(24, tryHit)
  fx.after(30, end)
}

function backpackBurstScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(8, () => {
    fx.sfx('explosion', { pitch: 1.6, vol: 0.6 })
    fx.shake(0.4)
    fx.particles('smoke', v3(fx.self.pos.x - F * 0.5, 1.0, 0), { n: 10 })
    fx.particles('sparks', v3(fx.self.pos.x - F * 0.4, 1.1, 0), { n: 6 })
    fx.impulse(fx.self, [F * 5, 0.5, 0])
    if (inRange(fx, 1.9)) {
      fx.hit({ damage: 7, knockback: { x: 13, y: 2, spin: 0.8 }, hitStun: 18 })
      fx.caption('GAS FEES')
    }
  })
  fx.after(24, end)
}

function wrenchStrikeScript(fx) {
  const end = onceEnd(fx)
  const wrench = fx.self.bones?.armR?.userData?.wrench
  const showWrench = (v) => { try { if (wrench) wrench.visible = v } catch { /* cosmetic */ } }
  showWrench(true)
  fx.sfx('whoosh', { pitch: 0.8 })
  fx.after(12, () => {
    if (inRange(fx, 1.9)) {
      fx.sfx('punch_heavy')
      fx.shake(0.5)
      fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 10 })
      fx.particles('sparks', v3(fx.foe.pos.x, 1.1, 0), { n: 8 })
      fx.hit({ damage: 10, knockback: { x: 2, y: 10, spin: 1.4 }, hitStun: 26, ragdoll: 1 })
      fx.caption('PERCUSSIVE MAINTENANCE')
    }
  })
  fx.after(26, () => showWrench(false)) // holstered before recovery ends
  fx.after(30, () => { showWrench(false); end() }) // failsafe + end
}

function snowballScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let ball = null
  fx.after(8, () => {
    ball = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.5, 1.1, 0), { mass: 0.5 })
    styleProp(ball, 0xf2f7ff, [0.5, 0.5, 0.5]) // he packs them square. efficiency.
  })
  fx.after(12, () => {
    fx.sfx('whoosh', { pitch: 1.4 })
    if (ball) { try { fx.impulse(ball, [F * 11, 3.5, 0], 4) } catch { /* prop gone */ } }
  })
  fx.after(19, () => {
    // the hit lands when the snowball reaches them (short-range projectile)
    if (Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) < 4.2) {
      fx.sfx('thud', { pitch: 1.5 })
      fx.particles('smoke', v3(fx.foe.pos.x, 1.0, 0), { n: 6 })
      fx.hit({ damage: 6, knockback: { x: 6, y: 2, spin: 0.5 }, hitStun: 16, pos: v3(fx.foe.pos.x, 1.1, 0) })
    }
  })
  fx.after(30, end)
}

function rocketHopScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(6, () => {
    fx.sfx('launch', { pitch: 1.4 })
    fx.impulse(fx.self, [F * 3, 8.5, 0])
    fx.particles('smoke', v3(fx.self.pos.x, 0.3, 0), { n: 8 })
    fx.particles('sparks', v3(fx.self.pos.x, 0.25, 0), { n: 6 })
  })
  fx.after(11, () => fx.particles('smoke', v3(fx.self.pos.x, Math.max(0.2, fx.self.pos.y), 0), { n: 4 }))
  fx.after(15, () => {
    fx.particles('smoke', v3(fx.self.pos.x, Math.max(0.2, fx.self.pos.y), 0), { n: 4 })
    if (inRange(fx, 1.8)) {
      fx.sfx('punch_heavy', { pitch: 1.1 })
      fx.shake(0.45)
      fx.hit({ damage: 11, knockback: { x: 3, y: 11, spin: 1.5 }, hitStun: 26, ragdoll: 1 })
      fx.caption('VERTICAL INTEGRATION')
    }
  })
  fx.after(36, end)
}

// SPECIAL 1 — Cold Storage: vault the foe in ice, walk away smug
function frozenAssetsScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(10, () => {
    // slaps you with a fish that has been in cold storage since 2019
    fx.sfx('slide', { pitch: 1.3 })
    fx.particles('spark', v3(fx.self.pos.x + F * 1.0, 1.2, 0), { n: 8 })
    if (inRange(fx, 2.9)) {
      fx.sfx('thud')
      fx.shake(0.5)
      // long hitStun: assets are FROZEN
      fx.hit({ damage: 12, knockback: { x: 8, y: 3, spin: 1.0 }, hitStun: 36, ragdoll: 1 })
      fx.caption('ASSETS FROZEN')
    } else {
      fx.caption('FISH DEEMED ILLIQUID')
    }
  })
  fx.after(38, end)
}

function coldStorageScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('whoosh', { pitch: 1.7 })
  if (!inRange(fx, 3.2)) {
    fx.caption('CUSTODY DECLINED')
    fx.after(36, end)
    return
  }
  fx.caption('COLD STORAGE!')
  fx.announcer('ASSETS FROZEN')
  fx.sfx('block', { pitch: 1.5 })
  fx.shake(0.4)
  fx.particles('sparks', v3(fx.foe.pos.x, 1.0, 0), { n: 12 })
  fx.hit({ damage: 6, knockback: { x: 0, y: 0 }, hitStun: 128 }) // ~2s in the vault
  const unfreeze = freezeTint(fx.foe)
  const removeIce = makeIceShell(fx.foe)
  let thawed = false
  const thaw = () => {
    if (thawed) return
    thawed = true
    try { removeIce() } catch { /* cosmetic */ }
    try { unfreeze() } catch { /* cosmetic */ }
  }
  fx.after(118, () => { // the vault cracks open — shatter payoff
    fx.sfx('break')
    fx.shake(0.8)
    fx.slowmo(0.4, 0.35)
    fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 22 })
    fx.hit({ damage: 10, knockback: { x: 9, y: 5, spin: 1.5 }, hitStun: 30, ragdoll: 1 })
    fx.caption('EARLY WITHDRAWAL PENALTY')
    thaw()
  })
  fx.after(134, thaw) // failsafe: the ice ALWAYS melts, the tint ALWAYS restores
  fx.after(46, end) // Pingo is free while the foe stays vaulted — smack the block
}

// SPECIAL 2 (SUPER) — Belly of the Exchange: 3-pass pinball of pure liquidity
function bellyExchangeScript(fx) {
  const end = onceEnd(fx)
  fx.caption('BELLY OF THE EXCHANGE!')
  fx.announcer('THE BELLY OF THE EXCHANGE')
  fx.sfx('boing')
  fx.zoom(fx.self, 0.6)
  fx.slowmo(0.55, 0.5)
  fx.shake(0.4)
  let dir = fx.self.facing
  let passes = 0
  let cooldown = 0
  let rolling = false
  let bounds = { min: -8.2, max: 8.2 }
  try {
    const b = fx.arena()?.bounds
    if (b) bounds = { min: b.minX + 0.9, max: b.maxX - 0.9 }
  } catch { /* arena optional */ }
  fx.after(12, () => { rolling = true; fx.sfx('slide') })
  fx.frame((age) => {
    if (!rolling || passes >= 3) return
    if (age % 2 === 0) {
      fx.impulse(fx.self, [dir * 3.2, 0, 0])
      if (age % 6 === 0) fx.particles('smoke', v3(fx.self.pos.x - dir * 0.5, 0.3, 0), { n: 3 })
    }
    if (cooldown > 0) cooldown--
    // run the foe over — once per pass
    if (cooldown === 0 && inRange(fx, 1.3)) {
      passes++
      cooldown = 26
      const last = passes >= 3
      fx.sfx(last ? 'explosion' : 'punch_heavy', { pitch: 1 - passes * 0.08 })
      fx.shake(last ? 1 : 0.6)
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: last ? 24 : 10 })
      if (last) {
        fx.slowmo(0.3, 0.6)
        fx.hit({ damage: 14, knockback: { x: 13, y: 7, spin: 3 }, hitStun: 40, ragdoll: 2 })
        fx.coins(v3(fx.foe.pos.x, 1.2, 0), 16)
        fx.caption('MARKET FLATTENED')
        rolling = false
      } else {
        fx.hit({ damage: 8, knockback: { x: 4, y: 5, spin: 1.5 }, hitStun: 30, ragdoll: 1 })
      }
    }
    // wall bounce — the exchange has no exit
    if (fx.self.pos.x <= bounds.min && dir < 0) {
      dir = 1
      fx.sfx('boing')
      fx.shake(0.5)
      fx.particles('impact', v3(bounds.min, 0.8, 0), { n: 6 })
    } else if (fx.self.pos.x >= bounds.max && dir > 0) {
      dir = -1
      fx.sfx('boing')
      fx.shake(0.5)
      fx.particles('impact', v3(bounds.max, 0.8, 0), { n: 6 })
    }
  })
  fx.after(160, () => { rolling = false })
  fx.after(186, end)
}

// SPECIAL 3 — Unstable Prototype: deploys a machine. Rolls the dice. Literally.
function prototypeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const mx = clampToArena(fx, fx.self.pos.x + F * 1.6)
  fx.caption('UNSTABLE PROTOTYPE')
  fx.sfx('menu_confirm')
  const roll = Math.floor(Math.random() * 4)
  let machine = null
  fx.after(12, () => {
    machine = fx.spawnProp('crate', v3(mx, 0.5, 0))
    styleProp(machine, 0x2e6f6a)
    fx.particles('smoke', v3(mx, 0.6, 0), { n: 6 })
    fx.sfx('thud')
  })
  fx.after(36, () => {
    switch (roll) {
      case 0: { // FREEZE BEAM
        fx.caption('OUTCOME: FREEZE BEAM')
        fx.sfx('whoosh', { pitch: 1.7 })
        for (let i = 0; i < 6; i++) {
          fx.particles('sparks', v3(clampToArena(fx, mx + F * (0.6 + i * 0.7)), 1.0, 0), { n: 4 })
        }
        if (Math.abs(fx.foe.pos.x - mx) < 5.5) {
          const unfreeze = freezeTint(fx.foe)
          fx.hit({ damage: 8, knockback: { x: 2, y: 0 }, hitStun: 70 })
          fx.caption('FLASH FROZEN')
          fx.after(72, unfreeze) // failsafe: always restores
        }
        break
      }
      case 1: { // MINI ROCKET
        fx.caption('OUTCOME: MINI ROCKET')
        const r = fx.spawnProp('rocket', v3(mx, 1.2, 0))
        if (r) { try { fx.impulse(r, [F * 12, 6, 0], 2) } catch { /* prop gone */ } }
        fx.sfx('launch')
        fx.after(14, () => {
          if (Math.abs(fx.foe.pos.x - mx) < 8) {
            fx.sfx('explosion')
            fx.shake(0.9)
            fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 20 })
            fx.hit({ damage: 14, knockback: { x: 11, y: 6, spin: 2 }, hitStun: 32, ragdoll: 1 })
          } else {
            fx.caption('ROCKET MISSED. FILING A BUG.')
          }
        })
        break
      }
      case 2: { // GIANT SPRING LAUNCHER
        fx.caption('OUTCOME: GIANT SPRING')
        fx.sfx('boing')
        const spring = fx.spawnProp('box', v3(clampToArena(fx, fx.foe.pos.x), 0.3, 0.7))
        styleProp(spring, 0xd8dee8, [0.8, 0.5, 0.8])
        if (spring) { try { fx.impulse(spring, [0, 6, 0]) } catch { /* prop gone */ } }
        if (Math.hypot(fx.foe.pos.x - fx.self.pos.x, (fx.foe.pos.z ?? 0) - (fx.self.pos.z ?? 0)) < 7) {
          fx.shake(0.6)
          fx.hit({ damage: 10, knockback: { x: 2, y: 14, spin: 2.5 }, hitStun: 40, ragdoll: 1 })
          fx.caption('TO THE MOON. LITERALLY.')
        }
        break
      }
      default: { // COMEDIC EXPLOSION — launches BOTH fighters
        fx.caption('OUTCOME: CATASTROPHIC SUCCESS')
        fx.sfx('explosion')
        fx.shake(1.2)
        fx.slowmo(0.35, 0.6)
        fx.particles('impact', v3(mx, 1.0, 0), { n: 30 })
        fx.coins(v3(mx, 1.2, 0), 10)
        if (machine) { try { machine.break?.() } catch { /* already broken */ } }
        if (Math.abs(fx.foe.pos.x - mx) < 6) {
          fx.hit({ damage: 10, knockback: { x: 12, y: 8, spin: 2.5 }, hitStun: 36, ragdoll: 2 })
        }
        try { fx.ragdoll(fx.self, [-F * 9, 8, 0]) } catch { /* ragdoll optional */ }
        fx.announcer('IT WORKED. TECHNICALLY.')
        break
      }
    }
  })
  fx.after(72, () => {
    if (machine && roll !== 3) { try { fx.impulse(machine, [-F * 3, 5, 1], 2) } catch { /* prop gone */ } }
  })
  fx.after(90, end)
}

// SPECIAL 4 — Penguin Airdrop: 5 drones, oversized coins, zero liability
function airdropScript(fx) {
  const end = onceEnd(fx)
  const tx = clampToArena(fx, fx.foe.pos.x)
  fx.caption('PENGUIN AIRDROP INBOUND')
  fx.announcer('AIRDROP CONFIRMED')
  fx.sfx('menu_confirm')
  let hits = 0
  for (let i = 0; i < 5; i++) {
    fx.after(16 + i * 12, () => {
      const dx = clampToArena(fx, tx + (i - 2) * 0.7)
      // tiny penguin drone (the parachute is implied and underfunded)
      const drone = fx.spawnProp('box', v3(dx, 5.6, (i % 2 ? 0.4 : -0.4)))
      styleProp(drone, 0x252c3a, [0.45, 0.5, 0.45])
      fx.sfx('whoosh', { pitch: 1.5 + i * 0.08 })
      // ...dropping an oversized coin directly on the target zone
      const coin = fx.spawnProp('coin', v3(dx, 4.6, 0))
      if (coin) {
        try { coin.mesh?.scale?.setScalar?.(2.3); fx.impulse(coin, [0, -6, 0]) } catch { /* prop gone */ }
      }
      fx.after(16, () => { // the coin arrives
        fx.particles('coins', v3(dx, 0.6, 0), { n: 5 })
        fx.sfx('coin', { pitch: 0.7 + i * 0.1 })
        if (Math.abs(fx.foe.pos.x - dx) < 1.2) {
          hits++
          const last = i === 4
          fx.shake(last ? 0.8 : 0.4)
          fx.hit(last || hits >= 3
            ? { damage: 6, knockback: { x: 4, y: 6, spin: 1.5 }, hitStun: 28, ragdoll: 1 }
            : { damage: 4, knockback: { x: 2, y: 3, spin: 0.6 }, hitStun: 20 })
          fx.caption(last ? 'FULLY VESTED' : 'AIRDROP RECEIVED')
        }
      })
    })
  }
  fx.after(96, end)
}

// JOKE — Cold Wallet: a comically tiny frozen USB stick. He forgot the passphrase.
function coldWalletScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.caption('COLD WALLET.')
  fx.sfx('menu_move')
  let usb = null
  fx.after(20, () => {
    usb = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.55, 1.05, 0.15), { mass: 0.2 })
    styleProp(usb, C.ice, [0.16, 0.1, 0.3]) // tiny. frozen. worth 9 figures. allegedly.
    fx.sfx('coin', { pitch: 2 })
  })
  fx.after(46, () => fx.caption('...THE SEED PHRASE IS INSIDE THE ICE'))
  fx.after(64, () => {
    if (inRange(fx, 1.6)) {
      fx.sfx('punch_light', { pitch: 1.9 })
      fx.shake(0.5)
      fx.slowmo(0.35, 0.5)
      fx.hit({ damage: 1, knockback: { x: 3, y: 4, spin: 2.5 }, hitStun: 26, ragdoll: 1 })
      fx.caption('SLIPPED ON THE ICE! 1 DAMAGE!')
      fx.announcer('NOT YOUR KEYS')
    } else {
      fx.caption('SHRUG.')
    }
    if (usb) { try { fx.impulse(usb, [F * 3, 4, 1], 3) } catch { /* prop gone */ } }
  })
  fx.after(84, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const FattyPingoDef = {
  id: 'fatty-pingo',
  name: 'FATTY PINGO',
  title: 'The Frozen Inventor',
  bio: 'Carved the first hardware wallet out of an actual glacier and has been "one prototype away" from fixing finance ever since. The belly is not a weakness — it is a load-bearing innovation: shock absorber, battering ram, and cold-storage facility in one. He has never once stayed knocked down.',
  style: 'Round powerhouse gadgeteer. Nearly impossible to knock over, back up faster than any fighter alive, and every pocket of the backpack is a lawsuit waiting to happen. Traps with ice, closes with the belly.',
  stats: { power: 6, speed: 5, defense: 8, chaos: 7 },
  height: 1.6,
  weight: 1.3,
  walkSpeed: 4.4,
  dashSpeed: 9.5,
  jumpVel: 8.0,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'wing-slap', name: 'Wing Slap', kind: 'light',
      input: ['light'],
      damage: 6, startup: 5, active: 4, recovery: 9,
      hitbox: { w: 1.1, h: 0.7, d: 0.9, forward: 0.9, up: 0.9 },
      knockback: { x: 5, y: 1.5, spin: 0.4 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'wingSlap', sfx: 'punch_light', script: null,
    },
    {
      id: 'beak-jab', name: 'Beak Jab', kind: 'light',
      input: ['forward', 'light'],
      damage: 5, startup: 4, active: 3, recovery: 8,
      hitbox: { w: 0.9, h: 0.6, d: 0.8, forward: 1.0, up: 1.0 },
      knockback: { x: 3.5, y: 1, spin: 0.2 },
      hitStun: 12, blockStun: 7, hitStop: 2,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'beakJab', sfx: 'punch_light', script: null,
    },
    {
      id: 'belly-bounce', name: 'Belly Bounce', kind: 'heavy',
      input: ['heavy'],
      damage: 12, startup: 9, active: 5, recovery: 13,
      hitbox: { w: 1.2, h: 1.0, d: 1.0, forward: 0.8, up: 0.8 },
      knockback: { x: 12, y: 3, spin: 0.6 },
      hitStun: 20, blockStun: 12, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 4, // the belly absorbs monetary policy
      clip: 'bellyBounce', sfx: 'boing',
      script: bellyBounceScript,
    },
    {
      id: 'ice-slide', name: 'Ice Slide', kind: 'kick',
      input: ['kick'],
      damage: 8, startup: 7, active: 10, recovery: 13,
      hitbox: { w: 1.1, h: 0.7, d: 0.9, forward: 0.9, up: 0.4 },
      knockback: { x: 8, y: 2.5, spin: 1 },
      hitStun: 18, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'iceSlide', sfx: 'slide',
      script: iceSlideScript,
    },
    {
      id: 'backpack-burst', name: 'Backpack Burst', kind: 'heavy',
      input: ['back', 'heavy'],
      damage: 7, startup: 8, active: 4, recovery: 12,
      hitbox: { w: 1.1, h: 1.1, d: 1.0, forward: 0.8, up: 0.9 },
      knockback: { x: 13, y: 2, spin: 0.8 },
      hitStun: 18, blockStun: 14, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'backpackBurst', sfx: 'explosion',
      script: backpackBurstScript,
    },
    {
      id: 'wrench-strike', name: 'Wrench Strike', kind: 'launcher',
      input: ['forward', 'heavy'],
      damage: 10, startup: 11, active: 4, recovery: 15,
      hitbox: { w: 1.0, h: 1.5, d: 0.9, forward: 0.9, up: 1.0 },
      knockback: { x: 2, y: 10, spin: 1.4 },
      hitStun: 26, blockStun: 12, hitStop: 6,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'wrenchStrike', sfx: 'punch_heavy',
      script: wrenchStrikeScript,
    },
    {
      id: 'snowball-toss', name: 'Snowball Toss', kind: 'light',
      input: ['down', 'light'],
      damage: 6, startup: 10, active: 6, recovery: 14,
      hitbox: { w: 1.0, h: 0.8, d: 0.8, forward: 1.4, up: 1.0 },
      knockback: { x: 6, y: 2, spin: 0.5 },
      hitStun: 16, blockStun: 9, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'snowballToss', sfx: 'whoosh',
      script: snowballScript,
    },
    {
      id: 'rocket-hop', name: 'Rocket Hop', kind: 'launcher',
      input: ['down', 'kick'],
      damage: 11, startup: 10, active: 8, recovery: 18,
      hitbox: { w: 1.0, h: 1.4, d: 0.9, forward: 0.7, up: 1.2 },
      knockback: { x: 3, y: 11, spin: 1.5 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'rocketHop', sfx: 'launch',
      script: rocketHopScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'cold-shoulder', name: 'Cold Shoulder', kind: 'grab',
      input: ['grab'],
      damage: 11, startup: 8, active: 4, recovery: 42,
      hitbox: { w: 0.9, h: 1.0, d: 0.9, forward: 0.9, up: 0.8 },
      // brief freeze-up, then a full-body pack-check across the arena
      knockback: { x: 11, y: 2.5, spin: 1 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'coldShoulder', sfx: 'grab', script: null,
    },
    {
      id: 'penguin-piledriver', name: 'Penguin Piledriver', kind: 'grab',
      input: ['down', 'grab'],
      damage: 14, startup: 9, active: 3, recovery: 48,
      hitbox: { w: 0.9, h: 1.0, d: 0.9, forward: 0.9, up: 0.8 },
      // hoist, flip, belly-first delivery — signed, sealed, flattened
      knockback: { x: 2, y: 7, spin: 2.5 },
      hitStun: 34, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'piledriver', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'frozen-assets', name: 'Frozen Assets', kind: 'special',
      input: ['special'],
      damage: 12, startup: 10, active: 4, recovery: 25,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 1.3, up: 1.1 },
      knockback: { x: 8, y: 3, spin: 1.0 },
      hitStun: 36, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'coldStorage', sfx: 'slide',
      script: frozenAssetsScript,
    },
    {
      id: 'cold-storage', name: 'Cold Storage', kind: 'special',
      input: ['down', 'special'],
      damage: 16, startup: 10, active: 8, recovery: 28,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 0.9 },
      knockback: { x: 9, y: 5, spin: 1.5 },
      hitStun: 40, blockStun: 14, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'coldStorage', sfx: 'block',
      script: coldStorageScript,
    },
    {
      id: 'unstable-prototype', name: 'Unstable Prototype', kind: 'special',
      input: ['forward', 'special'],
      damage: 14, startup: 12, active: 60, recovery: 18,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.2, up: 1.0 },
      knockback: { x: 11, y: 6, spin: 2 },
      hitStun: 32, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'prototype', sfx: 'menu_confirm',
      script: prototypeScript,
    },
    {
      id: 'penguin-airdrop', name: 'Penguin Airdrop', kind: 'special',
      input: ['back', 'special'],
      damage: 15, startup: 12, active: 66, recovery: 18,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 4, y: 6, spin: 1.5 },
      hitStun: 28, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'airdrop', sfx: 'menu_confirm',
      script: airdropScript,
    },
    {
      id: 'belly-of-the-exchange', name: 'Belly of the Exchange', kind: 'super',
      input: ['super'],
      damage: 30, startup: 12, active: 150, recovery: 26,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 0.8, up: 0.8 },
      knockback: { x: 13, y: 7, spin: 3 },
      hitStun: 40, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100,
      armor: 20, // a rolling penguin cannot be margin-called
      clip: 'bellyExchange', sfx: 'boing',
      script: bellyExchangeScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'cold-wallet', name: 'Cold Wallet', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 30, active: 6, recovery: 48,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 0.9 },
      knockback: { x: 3, y: 4, spin: 2.5 },
      hitStun: 26, blockStun: 8, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 12, meterCost: 0, armor: 0,
      clip: 'coldWallet', sfx: 'menu_move',
      script: coldWalletScript,
    },
  ],

  finisher: {
    id: 'frozen-assets',
    name: 'Frozen Assets',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      fx.slowmo(0.45, 1.2)
      fx.zoom(fx.foe, 0.8)
      fx.caption('FROZEN ASSETS')
      fx.announcer('FROZEN ASSETS')
      fx.sfx('bell')
      fx.shake(0.4)
      fx.self.playClip?.('frozenAssets')

      // deep-freeze the foe SOLID
      const unfreeze = freezeTint(fx.foe)
      const removeIce = makeIceShell(fx.foe, 1.6)
      let thawed = false
      const thaw = () => {
        if (thawed) return
        thawed = true
        try { removeIce() } catch { /* cosmetic */ }
        try { unfreeze() } catch { /* cosmetic */ }
      }
      fx.hit({ damage: 4, knockback: { x: 0, y: 0 }, hitStun: 180 })
      fx.particles('sparks', v3(fx.foe.pos.x, 1.0, 0), { n: 16 })
      fx.sfx('block', { pitch: 1.6 })

      // obstacles downrange — the pinball table assembles itself
      const x0 = fx.foe.pos.x
      const obstacles = []
      fx.after(14, () => {
        const kinds = ['crate', 'chair', 'monitor']
        for (let i = 0; i < 3; i++) {
          const o = fx.spawnProp(kinds[i], v3(clampToArena(fx, x0 + F * (2.2 + i * 1.8)), 0.6, (i - 1) * 0.35))
          if (o) obstacles.push(o)
        }
      })

      // THE SLIDE — ice block scrapes across the whole arena
      fx.after(22, () => fx.sfx('slide'))
      for (let i = 0; i < 8; i++) {
        fx.after(24 + i * 3, () => {
          fx.impulse(fx.foe, [F * 4.5, 0, 0])
          fx.particles('smoke', v3(fx.foe.pos.x, 0.15, 0), { n: 2 })
        })
      }
      // pinball impacts through each obstacle
      for (let i = 0; i < 3; i++) {
        fx.after(32 + i * 8, () => {
          const o = obstacles[i]
          if (o) { try { fx.impulse(o, [F * 7, 7, (i - 1) * 3], 3) } catch { /* prop gone */ } }
          fx.sfx('break')
          fx.shake(0.7)
          fx.particles('impact', v3(fx.foe.pos.x + F * 0.6, 0.9, 0), { n: 10 })
        })
      }
      // wall — DING — reverse
      fx.after(58, () => {
        fx.sfx('boing')
        fx.shake(1)
        fx.particles('sparks', v3(fx.foe.pos.x, 0.9, 0), { n: 12 })
        fx.caption('INSUFFICIENT WALL')
      })
      for (let i = 0; i < 7; i++) {
        fx.after(60 + i * 3, () => {
          fx.impulse(fx.foe, [-F * 4.5, 0, 0])
          fx.particles('smoke', v3(fx.foe.pos.x, 0.15, 0), { n: 2 })
        })
      }
      fx.after(74, () => { // back through the wreckage
        fx.sfx('thud')
        fx.shake(0.7)
        for (const o of obstacles) {
          try { fx.impulse(o, [-F * 5, 5, (Math.random() - 0.5) * 4], 2) } catch { /* prop gone */ }
        }
      })
      fx.after(88, () => { // other wall — DING
        fx.sfx('boing')
        fx.shake(0.9)
        fx.particles('sparks', v3(fx.foe.pos.x, 0.9, 0), { n: 10 })
      })

      // SHATTER — into blocky, harmless, fully-audited ice pieces
      const pieces = []
      fx.after(102, () => {
        thaw()
        fx.sfx('break')
        fx.shake(1.2)
        fx.slowmo(0.3, 0.8)
        fx.zoom(fx.foe, 0.9)
        fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 30 })
        fx.caption('POSITION SHATTERED')
        for (let i = 0; i < 6; i++) {
          const p = fx.spawnProp('box', v3(clampToArena(fx, fx.foe.pos.x + (Math.random() - 0.5) * 1.2), 0.8 + (i % 3) * 0.4, (Math.random() - 0.5) * 0.8), { mass: 0.4 })
          styleProp(p, C.ice, [0.4, 0.4, 0.4])
          if (p) {
            pieces.push(p)
            try { fx.impulse(p, [(Math.random() - 0.5) * 8, 5 + Math.random() * 4, (Math.random() - 0.5) * 5], 3) } catch { /* prop gone */ }
          }
        }
      })

      // ...and the pieces comically REASSEMBLE. Accounting demands it.
      fx.after(132, () => {
        fx.caption('REASSEMBLING ASSETS...')
        fx.sfx('coin', { pitch: 1.6 })
        for (let i = 0; i < pieces.length; i++) {
          fx.after(2 + i * 2, () => {
            const p = pieces[i]
            fx.particles('smoke', v3(fx.foe.pos.x, 0.8, 0), { n: 2 })
            if (p) { try { p.remove?.() } catch { /* already gone */ } }
          })
        }
      })

      // the KO — reassembled, re-audited, ragdolled
      fx.after(152, () => {
        fx.sfx('ko')
        fx.shake(1)
        fx.slowmo(0.35, 0.7)
        fx.hit({ damage: 20, knockback: { x: 12, y: 8, spin: 3 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 11, 9, 0])
        fx.coins(v3(fx.foe.pos.x, 1.4, 0), 20)
        fx.announcer('ASSETS PERMANENTLY FROZEN')
      })

      fx.after(176, thaw) // ultimate failsafe: tint + shell can never leak
      fx.after(178, end)
    },
  },

  voice: { pitch: 1.3, rate: 1.05 },
}
