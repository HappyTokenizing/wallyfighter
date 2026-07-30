// COOL PAL — The Unbothered One.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// Original low-poly capybara in a knitted vest, loose green pants, comfy sandals
// and ENORMOUS headphones. Counter fighter: the animations are tiny, the results
// are not. All geometry, animation and move scripts are procedural — no assets,
// no extra deps. Engineering discipline copied from wally.js.
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
const C = {
  fur: 0xb08a5f,
  furDark: 0x8f6d49,
  belly: 0xcbaa7e,
  snout: 0xa17d52,
  nose: 0x3a2c1e,
  eye: 0x241a10,
  vest0: 0xd9a531,
  vestTrim0: 0xb3831f,
  vest1: 0x4fc9a4,
  vestTrim1: 0x2f9c7c,
  pants0: 0x5a8f4a,
  pantsCuff0: 0x47713a,
  pants1: 0x4a7a8f,
  pantsCuff1: 0x3a606f,
  band: 0x2a2e38,
  cushion: 0x1c1f26,
  cup0: 0xff7a3c,
  cup1: 0x3ca8ff,
  sandal: 0x8a6f4d,
  strap: 0x5d4a33,
  grass: 0x3fae4e,
  grassDark: 0x2f8f3e,
  white: 0xf2f3f5,
  red: 0xe23b47,
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
// model — faces +X, feet at y=0, ~1.8 m tall
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}

  const furM = lamb(C.fur)
  const furDarkM = lamb(C.furDark)
  const bellyM = lamb(C.belly)
  const snoutM = lamb(C.snout)
  const noseM = lamb(C.nose)
  const eyeM = lamb(C.eye)
  const vestM = lamb(costume === 1 ? C.vest1 : C.vest0)
  const vestTrimM = lamb(costume === 1 ? C.vestTrim1 : C.vestTrim0)
  const pantsM = lamb(costume === 1 ? C.pants1 : C.pants0)
  const cuffM = lamb(costume === 1 ? C.pantsCuff1 : C.pantsCuff0)
  const bandM = lamb(C.band)
  const cushionM = lamb(C.cushion)
  const cupM = lamb(costume === 1 ? C.cup1 : C.cup0)
  const sandalM = lamb(C.sandal)
  const strapM = lamb(C.strap)

  // --- hips -----------------------------------------------------------------
  const hips = pivot(group, 0, 0.85, 0)
  bones.hips = hips
  hips.add(sph(0.34, furM, 0, 0.02, 0, 1.05, 0.8, 1.0))
  hips.add(cyl(0.34, 0.365, 0.24, pantsM, 0, -0.06, 0)) // waistband of the loose pants

  // --- legs — stumpy, baggy pants, comfy sandals ---------------------------
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.02, 0.17 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    leg.add(cyl(0.19, 0.155, 0.42, pantsM, 0, -0.22, 0)) // baggy pant leg
    leg.add(cyl(0.165, 0.17, 0.08, cuffM, 0, -0.46, 0)) // rolled cuff
    leg.add(cyl(0.115, 0.10, 0.30, furM, 0, -0.63, 0)) // furry ankle
    // sandal: sole + strap + two chill toes
    leg.add(box(0.34, 0.05, 0.20, sandalM, 0.05, -0.805, 0))
    leg.add(box(0.20, 0.045, 0.21, strapM, 0.07, -0.765, 0))
    leg.add(box(0.05, 0.045, 0.05, furDarkM, 0.19, -0.77, 0.055))
    leg.add(box(0.05, 0.045, 0.05, furDarkM, 0.19, -0.77, -0.055))
  }

  // --- torso — big rounded barrel with a knitted vest ----------------------
  const torso = pivot(hips, 0, 0.12, 0)
  bones.torso = torso
  torso.add(sph(0.46, furM, 0.02, 0.24, 0, 1.0, 1.05, 0.9))
  torso.add(sph(0.38, bellyM, 0.24, 0.14, 0, 0.6, 0.85, 0.68)) // lighter chest/belly

  // knitted vest: back panel + open front panels + ribbed stripes
  torso.add(box(0.20, 0.58, 0.64, vestM, -0.36, 0.24, 0))
  for (const side of [1, -1]) {
    torso.add(box(0.17, 0.54, 0.22, vestM, 0.335, 0.22, 0.245 * side, 0, -0.42 * side))
    // knit ribbing: thin darker stripes on each front panel
    for (let i = 0; i < 3; i++) {
      torso.add(box(0.035, 0.045, 0.21, vestTrimM, 0.415, 0.08 + i * 0.14, 0.28 * side, 0, -0.42 * side))
    }
    torso.add(box(0.24, 0.09, 0.20, vestM, 0.10, 0.585, 0.30 * side, 0, 0, -0.12)) // shoulder
    torso.add(box(0.175, 0.07, 0.23, vestTrimM, 0.335, -0.055, 0.245 * side, 0, -0.42 * side)) // hem
  }
  torso.add(box(0.20, 0.07, 0.66, vestTrimM, -0.36, -0.06, 0)) // back hem

  // --- arms — short, relaxed, mitten paws ----------------------------------
  for (const side of [1, -1]) {
    const arm = pivot(torso, 0.02, 0.38, 0.42 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    arm.add(sph(0.12, furM))
    arm.add(cyl(0.095, 0.085, 0.26, furM, 0, -0.15, 0))
    const fore = pivot(arm, 0, -0.30, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    fore.add(cyl(0.085, 0.075, 0.24, furM, 0, -0.12, 0))
    fore.add(sph(0.115, furDarkM, 0.02, -0.27, 0, 1.1, 0.85, 1.0)) // paw
  }

  // --- head — boxy capybara loaf with a blunt snout ------------------------
  const head = pivot(torso, 0.08, 0.44, 0)
  bones.head = head
  head.add(sph(0.27, furM, 0.10, 0.10, 0, 1.25, 0.9, 0.95))
  head.add(box(0.30, 0.24, 0.28, snoutM, 0.34, 0.04, 0)) // the loaf snout
  head.add(box(0.10, 0.08, 0.15, noseM, 0.475, 0.13, 0)) // big flat nose
  head.add(box(0.08, 0.045, 0.04, furDarkM, 0.44, -0.075, 0.09)) // faint mouth corners
  head.add(box(0.08, 0.045, 0.04, furDarkM, 0.44, -0.075, -0.09))

  // half-closed eyes: dark slits with heavy fur lids. maximum unbothered.
  for (const side of [1, -1]) {
    head.add(box(0.05, 0.055, 0.11, eyeM, 0.275, 0.195, 0.20 * side))
    head.add(box(0.06, 0.05, 0.125, furM, 0.28, 0.235, 0.20 * side)) // droopy upper lid
  }

  // tiny ears (extras — spring-follow secondary motion)
  for (const side of [1, -1]) {
    const ear = pivot(head, 0.02, 0.32, 0.20 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    ear.add(box(0.07, 0.10, 0.08, furDarkM, 0, 0.03, 0.02 * side))
  }

  // --- LARGE headphones (extra bone 'phones', spring-follow) ---------------
  const phones = pivot(head, 0.06, 0.30, 0)
  bones.phones = phones
  const pw = bent(phones) // static wrapper: bone starts at zero rotation
  pw.add(box(0.11, 0.06, 0.40, bandM, 0, 0.10, 0)) // band top
  for (const side of [1, -1]) {
    pw.add(box(0.11, 0.30, 0.07, bandM, 0, -0.06, 0.255 * side, -0.22 * side))
    const cup = cyl(0.17, 0.17, 0.11, cupM, 0.05, -0.21, 0.315 * side, Math.PI / 2)
    pw.add(cup)
    pw.add(cyl(0.175, 0.175, 0.045, cushionM, 0.05, -0.21, 0.265 * side, Math.PI / 2))
    pw.add(sph(0.045, bandM, 0.05, -0.21, 0.375 * side)) // outer dot
  }

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.85,0]
// Cool Pal's whole deal: small motions, long holds, huge results.
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.85, 0]
const SIT = [0, 0.34, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  idle: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.2, [0, 0, 0.015], [0, 0.835, 0]), K(2.4, Z, HIP)],
      torso: [K(0, [0, 0, 0.1]), K(1.2, [0.01, -0.02, 0.13]), K(2.4, [0, 0, 0.1])],
      // vibing to the headphones: slow steady nod
      head: [K(0, [0, 0, -0.06]), K(0.6, [0, 0, 0.05]), K(1.2, [0, 0, -0.06]), K(1.8, [0, 0, 0.05]), K(2.4, [0, 0, -0.06])],
      phones: [K(0, Z), K(0.6, [0, 0, 0.06]), K(1.2, Z), K(1.8, [0, 0, 0.06]), K(2.4, Z)],
      earL: [K(0, Z), K(1.1, [0, 0.15, 0.1]), K(1.3, Z), K(2.4, Z)],
      earR: [K(0, Z), K(1.7, [0, -0.15, 0.1]), K(1.9, Z), K(2.4, Z)],
      armL: [K(0, [0, 0, 0.12]), K(1.2, [0.03, 0, 0.16]), K(2.4, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(1.2, [-0.03, 0, 0.17]), K(2.4, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15])],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  walk: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0.03, -0.02], [0, 0.83, 0]), K(0.2, Z, [0, 0.81, 0]), K(0.4, [0, -0.03, -0.02], [0, 0.835, 0]), K(0.6, Z, [0, 0.81, 0]), K(0.8, [0, 0.03, -0.02], [0, 0.83, 0])],
      legL: [K(0, [0, 0, 0.38]), K(0.4, [0, 0, -0.38]), K(0.8, [0, 0, 0.38])],
      legR: [K(0, [0, 0, -0.38]), K(0.4, [0, 0, 0.38]), K(0.8, [0, 0, -0.38])],
      torso: [K(0, [0, -0.03, 0.1]), K(0.4, [0, 0.03, 0.1]), K(0.8, [0, -0.03, 0.1])],
      head: [K(0, [0, 0, -0.03]), K(0.2, [0, 0, 0.05]), K(0.4, [0, 0, -0.03]), K(0.6, [0, 0, 0.05]), K(0.8, [0, 0, -0.03])],
      phones: [K(0, Z), K(0.2, [0, 0, 0.05]), K(0.4, Z), K(0.6, [0, 0, 0.05]), K(0.8, Z)],
      armL: [K(0, [0, 0, -0.15]), K(0.4, [0, 0, 0.22]), K(0.8, [0, 0, -0.15])],
      armR: [K(0, [0, 0, 0.22]), K(0.4, [0, 0, -0.15]), K(0.8, [0, 0, 0.22])],
      forearmL: [K(0, [0, 0, 0.2])], forearmR: [K(0, [0, 0, 0.2])],
    },
  },

  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.12, [0, 0, 0.05], [0, 0.9, 0]), K(0.5, [0, 0, 0.05], [0, 0.9, 0])],
      legL: [K(0, Z), K(0.12, [0, 0, 0.6]), K(0.5, [0, 0, 0.5])],
      legR: [K(0, Z), K(0.12, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      // arms stay down. jumping is not worth raising your arms for.
      armL: [K(0, [0, 0, 0.12]), K(0.12, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      armR: [K(0, [0, 0, 0.13]), K(0.12, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      torso: [K(0, [0, 0, 0.1]), K(0.12, [0, 0, 0.16])],
      head: [K(0, Z), K(0.12, [0, 0, -0.08])],
      phones: [K(0, Z), K(0.12, [0, 0, -0.12]), K(0.35, [0, 0, 0.05]), K(0.5, Z)],
      earL: [K(0, Z), K(0.12, [-0.2, 0, 0])], earR: [K(0, Z), K(0.12, [-0.2, 0, 0])],
    },
  },

  fall: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.06], HIP)],
      torso: [K(0, [0, 0, 0.14])],
      head: [K(0, [0, 0, -0.04])],
      armL: [K(0, [-0.2, 0, 0.7]), K(0.3, [-0.3, 0, 0.9]), K(0.6, [-0.2, 0, 0.7])],
      armR: [K(0, [0.3, 0, 0.9]), K(0.3, [0.2, 0, 0.7]), K(0.6, [0.3, 0, 0.9])],
      legL: [K(0, [-0.2, 0, 0.3]), K(0.3, [-0.2, 0, 0.15]), K(0.6, [-0.2, 0, 0.3])],
      legR: [K(0, [0.2, 0, 0.15]), K(0.3, [0.2, 0, 0.3]), K(0.6, [0.2, 0, 0.15])],
      phones: [K(0, [0, 0, -0.18]), K(0.3, [0, 0, -0.1]), K(0.6, [0, 0, -0.18])],
      earL: [K(0, [-0.3, 0, 0])], earR: [K(0, [-0.3, 0, 0])],
    },
  },

  crouch: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.56, 0]), K(0.4, [0, 0, -0.08], [0, 0.545, 0]), K(0.8, [0, 0, -0.08], [0, 0.56, 0])],
      legL: [K(0, [-0.45, 0, 0.75])], legR: [K(0, [0.45, 0, 0.75])],
      torso: [K(0, [0, 0, -0.15])],
      head: [K(0, [0, 0, 0.14])],
      armL: [K(0, [0.25, 0, 0.4])], armR: [K(0, [-0.25, 0, 0.4])],
      forearmL: [K(0, [0, 0, 0.9])], forearmR: [K(0, [0, 0, 0.9])],
      phones: [K(0, Z), K(0.4, [0, 0, 0.04]), K(0.8, Z)],
    },
  },

  block: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.04, 0.82, 0])],
      torso: [K(0, [0, 0, 0.2]), K(0.4, [0.02, 0, 0.22]), K(0.8, [0, 0, 0.2])],
      head: [K(0, [0, 0, -0.14])],
      // one lazy forearm. it is enough.
      armL: [K(0, [0.3, 0, 0.8])], armR: [K(0, [-0.25, 0, 1.0])],
      forearmL: [K(0, [0, 0, 1.4])], forearmR: [K(0, [0, 0, 1.7])],
      phones: [K(0, [0, 0, 0.1])],
      legL: [K(0, [-0.12, 0, 0.08])], legR: [K(0, [0.12, 0, 0.08])],
    },
  },

  hitLight: {
    duration: 0.28, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.05, [0, 0, 0.08], [-0.06, 0.83, 0]), K(0.28, Z, HIP)],
      torso: [K(0, Z), K(0.05, [0, -0.08, 0.28]), K(0.28, [0, 0, 0.1])],
      // mildly inconvenienced
      head: [K(0, Z), K(0.05, [0, 0.08, 0.4]), K(0.18, [0, -0.1, 0.1]), K(0.28, Z)],
      phones: [K(0, Z), K(0.06, [0, 0, -0.35]), K(0.16, [0, 0, 0.15]), K(0.28, Z)],
      armL: [K(0, Z), K(0.05, [0.25, 0, -0.4]), K(0.28, [0, 0, 0.12])],
      armR: [K(0, Z), K(0.05, [-0.25, 0, -0.35]), K(0.28, [0, 0, 0.13])],
      earL: [K(0, Z), K(0.06, [0.3, 0.3, 0]), K(0.28, Z)],
      earR: [K(0, Z), K(0.06, [-0.3, -0.3, 0]), K(0.28, Z)],
    },
  },

  hitHeavy: {
    duration: 0.42, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.2], [-0.18, 0.8, 0]), K(0.42, Z, HIP)],
      torso: [K(0, Z), K(0.06, [0, -0.12, 0.5]), K(0.42, [0, 0, 0.1])],
      head: [K(0, Z), K(0.06, [0, 0.12, 0.65]), K(0.42, Z)],
      phones: [K(0, Z), K(0.07, [0, 0, -0.6]), K(0.2, [0, 0, 0.25]), K(0.42, Z)],
      armL: [K(0, Z), K(0.06, [0.45, 0, -1.0]), K(0.42, [0, 0, 0.12])],
      armR: [K(0, Z), K(0.06, [-0.45, 0, -0.9]), K(0.42, [0, 0, 0.13])],
      legL: [K(0, Z), K(0.07, [0, 0, 0.4]), K(0.42, Z)],
      earL: [K(0, Z), K(0.07, [0.45, 0.4, 0]), K(0.42, Z)],
      earR: [K(0, Z), K(0.07, [-0.45, -0.4, 0]), K(0.42, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.25], HIP)],
      torso: [K(0, [0, 0, 0.55]), K(0.25, [0, 0, 0.45]), K(0.5, [0, 0, 0.55])],
      head: [K(0, [0, 0, 0.4])],
      armL: [K(0, [-0.3, 0, 1.9]), K(0.25, [-0.15, 0, 2.1]), K(0.5, [-0.3, 0, 1.9])],
      armR: [K(0, [0.15, 0, 2.1]), K(0.25, [0.3, 0, 1.9]), K(0.5, [0.15, 0, 2.1])],
      legL: [K(0, [0, 0, 0.75]), K(0.25, [0, 0, 0.55]), K(0.5, [0, 0, 0.75])],
      legR: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 0.65]), K(0.5, [0, 0, 0.5])],
      phones: [K(0, [0, 0, -0.5]), K(0.25, [0, 0, -0.3]), K(0.5, [0, 0, -0.5])],
      earL: [K(0, [-0.5, 0.2, 0])], earR: [K(0, [-0.5, -0.2, 0])],
    },
  },

  // knocked down = accidentally napping. hands behind head, one leg crossed.
  knockdown: {
    duration: 1.2, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.6, [0, 0, 1.35], [0, 0.335, 0]), K(1.2, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])],
      legR: [K(0, [0.35, 0, 0.75])],
      torso: [K(0, [0, 0, 0.08]), K(0.6, [0, 0, 0.12]), K(1.2, [0, 0, 0.08])],
      head: [K(0, [0, 0, -0.2])],
      armL: [K(0, [1.5, 0, 0.5])], armR: [K(0, [-1.5, 0, 0.5])],
      forearmL: [K(0, [0, 0, 1.6])], forearmR: [K(0, [0, 0, 1.6])],
      phones: [K(0, [0, 0, 0.12])],
      earL: [K(0, [0.5, 0, 0])], earR: [K(0, [-0.5, 0, 0])],
    },
  },

  getup: {
    duration: 0.8, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.3, [0, 0, 0.5], [0, 0.5, 0]), K(0.6, [0, 0, 0.05], [0, 0.7, 0]), K(0.8, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.4, [0, 0, 0.55]), K(0.8, Z)],
      legR: [K(0, [0.35, 0, 0.75]), K(0.4, [0, 0, 0.3]), K(0.8, Z)],
      torso: [K(0, [0, 0, 0.08]), K(0.35, [0, 0, -0.3]), K(0.8, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.2]), K(0.55, [0, 0, 0.1]), K(0.8, Z)],
      armL: [K(0, [1.5, 0, 0.5]), K(0.35, [0.3, 0, -0.45]), K(0.8, [0, 0, 0.12])],
      armR: [K(0, [-1.5, 0, 0.5]), K(0.35, [-0.3, 0, -0.45]), K(0.8, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 1.6]), K(0.4, [0, 0, 0.2]), K(0.8, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 1.6]), K(0.4, [0, 0, 0.2]), K(0.8, [0, 0, 0.15])],
      phones: [K(0, [0, 0, 0.12]), K(0.6, [0, 0, -0.15]), K(0.72, [0, 0, 0.08]), K(0.8, Z)],
    },
  },

  // ambles to his mark, seats the headphones properly, gives ONE approving nod
  entrance: {
    duration: 3.0, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.83, 0]), K(0.8, Z, HIP), K(3.0, Z, HIP)],
      legL: [K(0, [0, 0, 0.35]), K(0.25, [0, 0, -0.35]), K(0.5, [0, 0, 0.35]), K(0.8, Z), K(3.0, Z)],
      legR: [K(0, [0, 0, -0.35]), K(0.25, [0, 0, 0.35]), K(0.5, [0, 0, -0.35]), K(0.8, Z), K(3.0, Z)],
      armL: [K(0, [0, 0, 0.12]), K(1.0, [0, 0, 2.1]), K(1.9, [0, 0, 2.1]), K(2.3, [0, 0, 0.12]), K(3.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(1.0, [0, 0, 2.1]), K(1.9, [0, 0, 2.1]), K(2.3, [0, 0, 0.13]), K(3.0, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(1.0, [0, 0, -2.1]), K(1.9, [0, 0, -2.1]), K(2.3, [0, 0, 0.15]), K(3.0, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(1.0, [0, 0, -2.15]), K(1.9, [0, 0, -2.15]), K(2.3, [0, 0, 0.15]), K(3.0, [0, 0, 0.15])],
      phones: [K(0, Z), K(1.1, [0, 0, -0.12]), K(1.35, [0, 0, 0.1]), K(1.6, [0, 0, -0.06]), K(1.9, Z), K(3.0, Z)],
      head: [K(0, [0, 0, -0.03]), K(1.0, [0, 0, 0.1]), K(1.9, [0, 0, 0.1]), K(2.5, [0, 0, -0.22]), K(2.8, [0, 0, 0.05]), K(3.0, Z)],
      torso: [K(0, [0, 0, 0.1]), K(1.0, [0, 0, 0.05]), K(2.5, [0, 0, 0.12]), K(3.0, [0, 0, 0.1])],
      earL: [K(0, Z), K(2.5, [0.3, 0.3, 0]), K(2.7, Z), K(3.0, Z)],
      earR: [K(0, Z), K(2.5, [-0.3, -0.3, 0]), K(2.7, Z), K(3.0, Z)],
    },
  },

  // sits down right there and bobs to the beat. winning changes nothing.
  win: {
    duration: 3.0, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(0.5, [0, 0, -0.15], SIT), K(3.0, [0, 0, -0.15], SIT)],
      legL: [K(0, Z), K(0.5, [-0.15, 0, 1.25]), K(3.0, [-0.15, 0, 1.25])],
      legR: [K(0, Z), K(0.5, [0.15, 0, 1.15]), K(3.0, [0.15, 0, 1.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.5, [0, 0, 0.22]), K(3.0, [0, 0, 0.22])],
      head: [K(0, Z), K(0.7, [0, 0, -0.08]), K(1.1, [0, 0, 0.12]), K(1.5, [0, 0, -0.08]), K(1.9, [0, 0, 0.12]), K(2.3, [0, 0, -0.08]), K(2.7, [0, 0, 0.12]), K(3.0, [0, 0, -0.08])],
      phones: [K(0, Z), K(0.7, [0, 0, 0.08]), K(1.1, [0, 0, -0.05]), K(1.5, [0, 0, 0.08]), K(1.9, [0, 0, -0.05]), K(2.3, [0, 0, 0.08]), K(2.7, [0, 0, -0.05]), K(3.0, [0, 0, 0.08])],
      armL: [K(0, [0, 0, 0.12]), K(0.5, [0.25, 0, 0.55]), K(3.0, [0.25, 0, 0.55])],
      armR: [K(0, [0, 0, 0.13]), K(0.5, [-0.25, 0, 0.5]), K(3.0, [-0.25, 0, 0.5])],
      // one paw taps the knee on the beat
      forearmL: [K(0, [0, 0, 0.15]), K(0.5, [0, 0, 0.7]), K(3.0, [0, 0, 0.7])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.7, [0, 0, 0.9]), K(1.1, [0, 0, 0.55]), K(1.5, [0, 0, 0.9]), K(1.9, [0, 0, 0.55]), K(2.3, [0, 0, 0.9]), K(2.7, [0, 0, 0.55]), K(3.0, [0, 0, 0.9])],
      earL: [K(0, Z), K(1.1, [0, 0.2, 0]), K(1.3, Z), K(3.0, Z)],
      earR: [K(0, Z), K(1.9, [0, -0.2, 0]), K(2.1, Z), K(3.0, Z)],
    },
  },

  // reclines flat and naps. losing also changes nothing.
  lose: {
    duration: 2.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.25], [0, 0.33, 0]), K(1.3, [0, 0, 1.25], [0, 0.345, 0]), K(2.6, [0, 0, 1.25], [0, 0.33, 0])],
      legL: [K(0, [0, 0, 0.25])],
      legR: [K(0, [0.4, 0, 0.8])],
      torso: [K(0, [0, 0, 0.1]), K(1.3, [0, 0, 0.15]), K(2.6, [0, 0, 0.1])],
      head: [K(0, [0, 0, -0.15]), K(1.3, [0, 0.05, -0.12]), K(2.6, [0, 0, -0.15])],
      armL: [K(0, [1.5, 0, 0.5])], armR: [K(0, [-1.5, 0, 0.5])],
      forearmL: [K(0, [0, 0, 1.6])], forearmR: [K(0, [0, 0, 1.6])],
      phones: [K(0, [0, 0, 0.12])],
      earL: [K(0, [0.4, 0, 0]), K(1.3, [0.5, 0, 0]), K(2.6, [0.4, 0, 0])],
      earR: [K(0, [-0.4, 0, 0])],
    },
  },

  // lifts one cup off the ear: "...you say something?"
  taunt: {
    duration: 1.6, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.3, [0, 0, 2.3]), K(1.2, [0, 0, 2.3]), K(1.6, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.3, [0, 0, -2.3]), K(1.2, [0, 0, -2.3]), K(1.6, [0, 0, 0.15])],
      phones: [K(0, Z), K(0.35, [0.28, 0, -0.1]), K(1.15, [0.28, 0, -0.1]), K(1.5, Z), K(1.6, Z)],
      head: [K(0, Z), K(0.4, [0, -0.35, 0.05]), K(1.1, [0, -0.35, 0.05]), K(1.4, [0, 0.1, 0]), K(1.6, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.4, [0, -0.15, 0.12]), K(1.1, [0, -0.15, 0.12]), K(1.6, [0, 0, 0.1])],
      earR: [K(0, Z), K(0.4, [0, -0.3, 0.2]), K(1.2, [0, -0.3, 0.2]), K(1.6, Z)],
      armL: [K(0, [0, 0, 0.12])],
      hips: [K(0, Z, HIP)],
    },
  },

  // ----------------------------------------------------------- move clips --
  // one slow palm. huge pushback. minimum effort, maximum message.
  lazyPalm: {
    duration: 0.4, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.13, [0, 0, 0.45]), K(0.2, [0, 0, 1.35]), K(0.3, [0, 0, 1.2]), K(0.4, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.13, [0, 0, -0.6]), K(0.2, [0, 0, -0.1]), K(0.4, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.13, [0, -0.18, 0.1]), K(0.2, [0, 0.22, 0.02]), K(0.4, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.2, [0, 0.12, 0], [0.04, 0.84, 0]), K(0.4, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, 0.08, 0.03]), K(0.4, Z)],
      phones: [K(0, Z), K(0.22, [0, 0, 0.1]), K(0.4, Z)],
      armL: [K(0, [0, 0, 0.12])],
    },
  },

  // legendary slow kick: long lift, tiny pause, deceptively violent extension
  slowKick: {
    duration: 0.55, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.16, [0, 0, 0.9]), K(0.21, [0, 0, 0.85]), K(0.27, [0, 0, 1.7]), K(0.38, [0, 0, 1.4]), K(0.55, Z)],
      hips: [K(0, Z, HIP), K(0.16, [0, 0, -0.06], [-0.04, 0.84, 0]), K(0.27, [0, 0, 0.12], [0.08, 0.88, 0]), K(0.55, Z, HIP)],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, 0, 0.02]), K(0.27, [0, 0, 0.25]), K(0.55, [0, 0, 0.1])],
      head: [K(0, Z), K(0.27, [0, 0, 0.12]), K(0.55, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.27, [0.2, 0, 0.5]), K(0.55, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.27, [-0.2, 0, -0.4]), K(0.55, [0, 0, 0.13])],
      phones: [K(0, Z), K(0.29, [0, 0, -0.25]), K(0.42, [0, 0, 0.1]), K(0.55, Z)],
      legL: [K(0, Z)],
    },
  },

  // rotates the shoulder in, leans. the foe bounces off. that is the move.
  shoulderLean: {
    duration: 0.5, loop: false,
    tracks: {
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, 0.45, 0.05]), K(0.2, [0, 0.5, -0.4]), K(0.34, [0, 0.45, -0.32]), K(0.5, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.14, [0, 0.25, 0], HIP), K(0.2, [0, 0.3, -0.08], [0.16, 0.82, 0]), K(0.5, Z, HIP)],
      head: [K(0, Z), K(0.14, [0, -0.2, 0]), K(0.2, [0, -0.3, -0.1]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.2, [0.3, 0, 0.6]), K(0.5, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.2, [-0.4, 0, -0.5]), K(0.5, [0, 0, 0.13])],
      legL: [K(0, Z), K(0.2, [0, 0, 0.35]), K(0.5, Z)],
      legR: [K(0, Z), K(0.2, [0, 0, -0.3]), K(0.5, Z)],
      phones: [K(0, Z), K(0.22, [0, 0, -0.3]), K(0.36, [0, 0, 0.12]), K(0.5, Z)],
      earL: [K(0, Z), K(0.22, [0.3, 0.3, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.22, [-0.3, -0.3, 0]), K(0.5, Z)],
    },
  },

  // unhooks the cans and swings them overhead like a flail. launcher.
  phoneSwing: {
    duration: 0.5, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.1, [0, 0, 2.2]), K(0.16, [0, 0, 2.4]), K(0.24, [0, 0, 0.6]), K(0.36, [0, 0, 1.0]), K(0.5, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.1, [0, 0, -2.2]), K(0.16, [0, 0, -0.4]), K(0.24, [0, 0, -0.2]), K(0.5, [0, 0, 0.15])],
      // the headphones do the actual work — a huge arc off the head
      phones: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.16, [0, 0, -2.2]), K(0.24, [0, 0, 1.6]), K(0.34, [0, 0, 0.8]), K(0.44, [0, 0, -0.15]), K(0.5, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, -0.2, -0.1]), K(0.24, [0, 0.25, 0.18]), K(0.5, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.24, [0, 0.1, 0], [0.05, 0.88, 0]), K(0.5, Z, HIP)],
      head: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.24, [0, 0, 0.3]), K(0.5, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.24, [0.25, 0, -0.5]), K(0.5, [0, 0, 0.12])],
      earL: [K(0, Z), K(0.25, [-0.4, 0.3, 0]), K(0.5, Z)],
      earR: [K(0, Z), K(0.25, [0.4, -0.3, 0]), K(0.5, Z)],
    },
  },

  // simply sits down. attacks sail overhead. genius-level defense.
  sitDodge: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, -0.12], SIT), K(0.38, [0, 0, -0.12], SIT), K(0.5, Z, HIP)],
      legL: [K(0, Z), K(0.08, [-0.1, 0, 1.3]), K(0.38, [-0.1, 0, 1.3]), K(0.5, Z)],
      legR: [K(0, Z), K(0.08, [0.1, 0, 1.2]), K(0.38, [0.1, 0, 1.2]), K(0.5, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.08, [0, 0, 0.28]), K(0.38, [0, 0, 0.28]), K(0.5, [0, 0, 0.1])],
      // arms prop him up behind. totally at ease.
      armL: [K(0, [0, 0, 0.12]), K(0.08, [0.3, 0, -0.7]), K(0.38, [0.3, 0, -0.7]), K(0.5, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.08, [-0.3, 0, -0.7]), K(0.38, [-0.3, 0, -0.7]), K(0.5, [0, 0, 0.13])],
      head: [K(0, Z), K(0.12, [0, 0, 0.08]), K(0.38, [0, 0, 0.08]), K(0.5, Z)],
      phones: [K(0, Z), K(0.1, [0, 0, 0.18]), K(0.2, [0, 0, -0.06]), K(0.38, Z), K(0.5, Z)],
    },
  },

  // half-hearted raised paw. holds. if you hit it, that is on you.
  calmCounter: {
    duration: 0.75, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.12]), K(0.07, [0.15, 0, 0.95]), K(0.5, [0.15, 0, 1.0]), K(0.62, [0.2, 0, -0.9]), K(0.75, [0, 0, 0.12])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.07, [0, 0, 0.9]), K(0.5, [0, 0, 0.95]), K(0.62, [0, 0, 0.1]), K(0.75, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.07, [0, 0.1, 0.16]), K(0.5, [0, 0.1, 0.18]), K(0.62, [0, -0.2, -0.15]), K(0.75, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.07, Z, [-0.03, 0.83, 0]), K(0.5, Z, [-0.03, 0.83, 0]), K(0.62, Z, [0.08, 0.86, 0]), K(0.75, Z, HIP)],
      head: [K(0, Z), K(0.07, [0, 0, -0.08]), K(0.5, [0, 0, -0.08]), K(0.62, [0, 0, 0.1]), K(0.75, Z)],
      phones: [K(0, Z), K(0.1, [0, 0, 0.06]), K(0.55, [0, 0, 0.06]), K(0.64, [0, 0, -0.2]), K(0.75, Z)],
      armR: [K(0, [0, 0, 0.13])],
      legL: [K(0, [-0.1, 0, 0.1])], legR: [K(0, [0.1, 0, 0.1])],
    },
  },

  // an enormous yawn. the air pressure alone moves people.
  yawnPush: {
    duration: 0.55, loop: false,
    tracks: {
      head: [K(0, Z), K(0.14, [0, 0, 0.15]), K(0.24, [0, 0, 0.55]), K(0.4, [0, 0, 0.35]), K(0.55, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, 0, 0.05]), K(0.24, [0, 0, -0.2]), K(0.55, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.24, [0, 0, 0.05], [0, 0.88, 0]), K(0.55, Z, HIP)],
      armL: [K(0, [0, 0, 0.12]), K(0.14, [0.4, 0, 1.4]), K(0.24, [0.7, 0, 2.3]), K(0.42, [0.4, 0, 1.2]), K(0.55, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.14, [-0.4, 0, 1.4]), K(0.24, [-0.7, 0, 2.3]), K(0.42, [-0.4, 0, 1.2]), K(0.55, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.24, [0, 0, -0.5]), K(0.55, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.24, [0, 0, -0.5]), K(0.55, [0, 0, 0.15])],
      phones: [K(0, Z), K(0.24, [0, 0, 0.3]), K(0.4, [0, 0, -0.1]), K(0.55, Z)],
      earL: [K(0, Z), K(0.24, [0.35, 0.3, 0]), K(0.55, Z)],
      earR: [K(0, Z), K(0.24, [-0.35, -0.3, 0]), K(0.55, Z)],
    },
  },

  // lean back, flick a sandal with the foot. disrespectful. effective.
  sandalSlap: {
    duration: 0.32, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.08, [0, 0, 0.1], [-0.06, 0.84, 0]), K(0.32, Z, HIP)],
      legR: [K(0, Z), K(0.08, [0, 0, 0.3]), K(0.14, [0, 0, 1.35]), K(0.22, [0, 0, 1.0]), K(0.32, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.08, [0, 0, 0.22]), K(0.32, [0, 0, 0.1])],
      head: [K(0, Z), K(0.14, [0, 0, 0.1]), K(0.32, Z)],
      armL: [K(0, [0, 0, 0.12]), K(0.14, [0.2, 0, -0.3]), K(0.32, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.14, [-0.2, 0, -0.3]), K(0.32, [0, 0, 0.13])],
      phones: [K(0, Z), K(0.16, [0, 0, -0.15]), K(0.32, Z)],
      legL: [K(0, Z)],
    },
  },

  // one paw. slow reach. firm redirect. the floor handles the rest.
  guide: {
    duration: 0.9, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.16, [0, 0, 1.3]), K(0.42, [0, 0, 1.3]), K(0.55, [0, 0, -0.8]), K(0.7, [0, 0, -0.6]), K(0.9, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.16, [0, 0, 0.2]), K(0.55, [0, 0, 0.4]), K(0.9, [0, 0, 0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.3, [0.3, 0, 0.5]), K(0.55, [0.2, 0, -0.4]), K(0.9, [0, 0, 0.12])],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, -0.1, 0.05]), K(0.42, [0, -0.1, 0.05]), K(0.55, [0, 0.15, -0.5]), K(0.7, [0, 0.1, -0.4]), K(0.9, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.42, Z, HIP), K(0.55, [0, 0, -0.1], [0.06, 0.76, 0]), K(0.75, Z, [0, 0.82, 0]), K(0.9, Z, HIP)],
      head: [K(0, Z), K(0.42, [0, 0, -0.06]), K(0.55, [0, 0, -0.35]), K(0.9, Z)],
      phones: [K(0, Z), K(0.57, [0, 0, -0.35]), K(0.72, [0, 0, 0.12]), K(0.9, Z)],
      legL: [K(0, Z), K(0.55, [-0.2, 0, 0.3]), K(0.9, Z)],
      legR: [K(0, Z), K(0.55, [0.2, 0, 0.3]), K(0.9, Z)],
    },
  },

  // tucks the foe in with two gentle pats, then rolls them away like laundry
  napTime: {
    duration: 0.85, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.12]), K(0.14, [0, 0, 1.05]), K(0.3, [0, 0, 0.85]), K(0.4, [0, 0, 1.05]), K(0.55, [0.4, 0, 0.6]), K(0.68, [0.6, 0, -0.3]), K(0.85, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.14, [0, 0, 1.05]), K(0.32, [0, 0, 0.85]), K(0.42, [0, 0, 1.05]), K(0.55, [-0.4, 0, 0.6]), K(0.68, [-0.6, 0, -0.3]), K(0.85, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.14, [0, 0, 0.3]), K(0.85, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.14, [0, 0, 0.3]), K(0.85, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, 0, -0.15]), K(0.5, [0, 0, -0.18]), K(0.68, [0, 0.3, 0.15]), K(0.85, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.14, Z, [0.03, 0.8, 0]), K(0.55, Z, [0.03, 0.8, 0]), K(0.68, [0, 0.2, 0], [0, 0.86, 0]), K(0.85, Z, HIP)],
      head: [K(0, Z), K(0.2, [0, 0, -0.18]), K(0.55, [0, 0, -0.18]), K(0.68, [0, 0.1, 0.1]), K(0.85, Z)],
      phones: [K(0, Z), K(0.3, [0, 0, 0.06]), K(0.7, [0, 0, -0.2]), K(0.85, Z)],
      legL: [K(0, Z), K(0.14, [-0.15, 0, 0.25]), K(0.85, Z)],
      legR: [K(0, Z), K(0.14, [0.15, 0, 0.25]), K(0.85, Z)],
    },
  },

  // stands COMPLETELY still, arms crossed. one glacial nod at the end.
  stillCool: {
    duration: 2.9, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.15, Z, [0, 0.84, 0]), K(2.6, Z, [0, 0.84, 0]), K(2.9, Z, HIP)],
      armL: [K(0, [0, 0, 0.12]), K(0.15, [0.5, 0, 0.55]), K(2.6, [0.5, 0, 0.55]), K(2.9, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.15, [-0.5, 0, 0.65]), K(2.6, [-0.5, 0, 0.65]), K(2.9, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.15, [0.6, 0, 1.85]), K(2.6, [0.6, 0, 1.85]), K(2.9, [0, 0, 0.15])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.15, [-0.6, 0, 1.9]), K(2.6, [-0.6, 0, 1.9]), K(2.9, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.15, [0, 0, 0.06]), K(2.6, [0, 0, 0.06]), K(2.9, [0, 0, 0.1])],
      head: [K(0, Z), K(0.15, [0, 0, -0.05]), K(2.1, [0, 0, -0.05]), K(2.35, [0, 0, 0.12]), K(2.6, [0, 0, -0.05]), K(2.9, Z)],
      phones: [K(0, Z), K(2.35, [0, 0, 0.08]), K(2.6, Z), K(2.9, Z)],
      legL: [K(0, Z), K(0.15, [-0.08, 0, 0.05]), K(2.9, Z)],
      legR: [K(0, Z), K(0.15, [0.08, 0, 0.05]), K(2.9, Z)],
    },
  },

  // kneels, touches the floor with one reverent paw. nature responds.
  touchGrass: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.16, [0, 0, -0.15], [0.05, 0.6, 0]), K(0.55, [0, 0, -0.15], [0.05, 0.6, 0]), K(0.8, Z, [0, 0.8, 0]), K(1.0, Z, HIP)],
      legL: [K(0, Z), K(0.16, [-0.5, 0, 0.85]), K(0.55, [-0.5, 0, 0.85]), K(1.0, Z)],
      legR: [K(0, Z), K(0.16, [0.5, 0, 0.85]), K(0.55, [0.5, 0, 0.85]), K(1.0, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.16, [0, 0, -0.55]), K(0.55, [0, 0, -0.55]), K(0.8, [0, 0, 0.15]), K(1.0, [0, 0, 0.1])],
      armR: [K(0, [0, 0, 0.13]), K(0.16, [0, 0, -1.15]), K(0.4, [0, 0, -1.25]), K(0.55, [0, 0, -1.15]), K(0.8, [0, 0, 1.3]), K(1.0, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.16, [0, 0, 0.3]), K(0.8, [0, 0, -0.3]), K(1.0, [0, 0, 0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.16, [0.3, 0, 0.4]), K(0.55, [0.3, 0, 0.4]), K(1.0, [0, 0, 0.12])],
      head: [K(0, Z), K(0.16, [0, 0, -0.35]), K(0.55, [0, 0, -0.35]), K(0.8, [0, 0, 0.2]), K(1.0, Z)],
      phones: [K(0, Z), K(0.18, [0, 0, 0.15]), K(0.6, [0, 0, 0.15]), K(0.82, [0, 0, -0.2]), K(1.0, Z)],
      earL: [K(0, Z), K(0.8, [0.3, 0.3, 0]), K(1.0, Z)],
      earR: [K(0, Z), K(0.8, [-0.3, -0.3, 0]), K(1.0, Z)],
    },
  },

  // watches the giant button descend, checks an imaginary watch, presses it. calmly.
  logOff: {
    duration: 3.85, loop: false,
    tracks: {
      head: [K(0, Z), K(0.3, [0, 0, 0.35]), K(0.9, [0, 0, 0.3]), K(1.1, [0, 0, -0.15]), K(1.5, [0, 0, 0.05]), K(2.6, [0, 0, 0.05]), K(2.9, [0, 0, 0.15]), K(3.4, [0, -0.25, 0]), K(3.6, [0, 0.1, 0]), K(3.85, Z)],
      // checks the watch while the world ends
      armL: [K(0, [0, 0, 0.12]), K(1.0, [0, 0, 1.5]), K(1.5, [0, 0, 1.5]), K(1.7, [0, 0, 0.12]), K(3.85, [0, 0, 0.12])],
      forearmL: [K(0, [0, 0, 0.15]), K(1.0, [0, 0, -2.2]), K(1.5, [0, 0, -2.2]), K(1.7, [0, 0, 0.15]), K(3.85, [0, 0, 0.15])],
      // THE PRESS. one finger. zero drama.
      armR: [K(0, [0, 0, 0.13]), K(1.8, [0, 0, 1.55]), K(2.05, [0, 0, 1.35]), K(2.4, [0, 0, 1.45]), K(2.8, [0, 0, 0.5]), K(3.85, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(1.8, [0, 0, -0.3]), K(2.05, [0, 0, -0.05]), K(2.8, [0, 0, 0.2]), K(3.85, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.3, [0, 0, 0.18]), K(1.8, [0, -0.1, 0.05]), K(2.05, [0, -0.1, -0.08]), K(2.8, [0, 0, 0.1]), K(3.85, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(2.05, Z, [0.05, 0.83, 0]), K(2.8, Z, HIP), K(3.85, Z, HIP)],
      phones: [K(0, Z), K(0.35, [0, 0, 0.12]), K(2.05, [0, 0, 0.06]), K(2.1, [0, 0, -0.1]), K(2.4, Z), K(3.85, Z)],
      // small shrug at the reboot. what did they expect.
      earL: [K(0, Z), K(3.4, [0.3, 0.3, 0]), K(3.6, Z), K(3.85, Z)],
      earR: [K(0, Z), K(3.4, [-0.3, -0.3, 0]), K(3.6, Z), K(3.85, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // sits, sips something warm, radiates zero stress in every direction
  zeroStress: {
    duration: 1.0, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.18, [0, 0, -0.12], SIT), K(0.8, [0, 0, -0.12], SIT), K(1.0, Z, HIP)],
      legL: [K(0, Z), K(0.18, [-0.12, 0, 1.25]), K(0.8, [-0.12, 0, 1.25]), K(1.0, Z)],
      legR: [K(0, Z), K(0.18, [0.12, 0, 1.15]), K(0.8, [0.12, 0, 1.15]), K(1.0, Z)],
      torso: [K(0, [0, 0, 0.1]), K(0.18, [0, 0, 0.24]), K(0.8, [0, 0, 0.24]), K(1.0, [0, 0, 0.1])],
      armR: [K(0, [0, 0, 0.13]), K(0.28, [0, 0, 1.6]), K(0.75, [0, 0, 1.6]), K(1.0, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.28, [0, 0, -2.25]), K(0.75, [0, 0, -2.25]), K(1.0, [0, 0, 0.15])],
      armL: [K(0, [0, 0, 0.12]), K(0.18, [0.25, 0, 0.5]), K(0.8, [0.25, 0, 0.5]), K(1.0, [0, 0, 0.12])],
      head: [K(0, Z), K(0.35, [0, 0, 0.22]), K(0.65, [0, 0, 0.18]), K(1.0, Z)],
      phones: [K(0, Z), K(0.38, [0, 0, 0.12]), K(0.8, [0, 0, 0.12]), K(1.0, Z)],
      earL: [K(0, Z), K(0.5, [0, 0.2, 0.1]), K(0.7, Z), K(1.0, Z)],
      earR: [K(0, Z), K(0.5, [0, -0.2, 0.1]), K(0.7, Z), K(1.0, Z)],
    },
  },

  // produces a sign from the vest, presents it, looks away. conversation over.
  dnd: {
    duration: 0.85, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.13]), K(0.14, [0.8, 0, 0.7]), K(0.28, [0, 0, 1.4]), K(0.62, [0, 0, 1.4]), K(0.85, [0, 0, 0.13])],
      forearmR: [K(0, [0, 0, 0.15]), K(0.14, [0, 0, 1.2]), K(0.28, [0, 0, -0.2]), K(0.62, [0, 0, -0.2]), K(0.85, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.14, [0, -0.15, 0.1]), K(0.28, [0, 0.1, 0.05]), K(0.62, [0, 0.1, 0.05]), K(0.85, [0, 0, 0.1])],
      head: [K(0, Z), K(0.3, [0, 0, -0.05]), K(0.45, [0, 0.45, 0]), K(0.65, [0, 0.45, 0]), K(0.85, Z)],
      phones: [K(0, Z), K(0.3, [0, 0, 0.06]), K(0.5, [0, 0.1, 0]), K(0.85, Z)],
      armL: [K(0, [0, 0, 0.12])],
      hips: [K(0, Z, HIP)],
    },
  },

  // two gentle paws, a step back, a little wave. bon voyage.
  vacation: {
    duration: 4.0, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.12]), K(0.25, [0, 0, 1.1]), K(0.7, [0, 0, 1.15]), K(0.85, [0, 0, 0.5]), K(1.3, [0, 0, 0.12]), K(4.0, [0, 0, 0.12])],
      armR: [K(0, [0, 0, 0.13]), K(0.25, [0, 0, 1.1]), K(0.7, [0, 0, 1.15]), K(0.85, [0, 0, 0.5]), K(1.4, [0, 0, 2.5]), K(2.6, [0, 0, 2.5]), K(2.9, [0, 0, 0.13]), K(4.0, [0, 0, 0.13])],
      forearmL: [K(0, [0, 0, 0.15]), K(0.25, [0, 0, 0.3]), K(1.3, [0, 0, 0.15]), K(4.0, [0, 0, 0.15])],
      // the wave: a tiny metronome of goodbye
      forearmR: [K(0, [0, 0, 0.15]), K(0.25, [0, 0, 0.3]), K(1.4, [0, 0, -0.5]), K(1.65, [0, 0, 0.15]), K(1.9, [0, 0, -0.5]), K(2.15, [0, 0, 0.15]), K(2.4, [0, 0, -0.5]), K(2.9, [0, 0, 0.15]), K(4.0, [0, 0, 0.15])],
      torso: [K(0, [0, 0, 0.1]), K(0.25, [0, 0, -0.12]), K(0.7, [0, 0, -0.15]), K(1.0, [0, 0, 0.12]), K(4.0, [0, 0, 0.1])],
      hips: [K(0, Z, HIP), K(0.7, Z, [0.05, 0.83, 0]), K(1.0, Z, [-0.1, 0.85, 0]), K(1.6, Z, HIP), K(4.0, Z, HIP)],
      // watches the flight with polite interest, checks watch, nods at splashdown
      head: [K(0, Z), K(0.7, [0, 0, -0.1]), K(1.4, [0, 0, 0.4]), K(2.6, [0, 0, 0.35]), K(2.9, [0, 0, 0.1]), K(3.2, [0, 0, -0.15]), K(3.5, [0, 0, 0.1]), K(4.0, Z)],
      phones: [K(0, Z), K(1.45, [0, 0, 0.15]), K(2.6, [0, 0, 0.15]), K(2.95, [0, 0, -0.1]), K(4.0, Z)],
      earL: [K(0, Z), K(3.2, [0.3, 0.3, 0]), K(3.5, Z), K(4.0, Z)],
      earR: [K(0, Z), K(3.2, [-0.3, -0.3, 0]), K(3.5, Z), K(4.0, Z)],
      legL: [K(0, Z), K(0.85, [0, 0, -0.3]), K(1.3, Z), K(4.0, Z)],
      legR: [K(0, Z)],
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

// direction that pushes the foe AWAY from Cool Pal, pre-multiplied so that
// applyScriptHit's `kb.x * self.facing` resolves to the away direction.
function awayX(fx, mag) {
  const away = fx.foe.pos.x >= fx.self.pos.x ? 1 : -1
  return mag * away * fx.self.facing
}

// --- decor: cosmetic meshes added to the arena (buttons, grass, vignettes) --
function decorMat(color) { return lamb(color) }

function addDecor(fx, mesh, list) {
  try {
    const parent = fx.arena()?.group || fx.self?.root?.parent
    if (!parent) return null
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true })
    parent.add(mesh)
    list.push({ mesh, parent })
    return mesh
  } catch (e) { console.warn('[cool-pal] addDecor failed', e); return null }
}

function removeDecorItem(list, mesh) {
  const i = list.findIndex((d) => d.mesh === mesh)
  if (i === -1) return
  const [d] = list.splice(i, 1)
  try {
    d.parent.remove(d.mesh)
    d.mesh.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.() }
    })
  } catch { /* already gone */ }
}

function clearDecor(list) {
  while (list.length) removeDecorItem(list, list[list.length - 1].mesh)
}

// failsafe: if the round ends mid-script, fx timers are dropped by the engine —
// hook cleanup to round/match end so nothing ever leaks into the next round.
// (fx.match is the MatchScreen; internals-guarded, purely a safety net.)
function hookRoundEnd(fx, cb) {
  try {
    fx.match?.game?.events?.once?.('round:end', cb)
    fx.match?.game?.events?.once?.('match:end', cb)
  } catch { /* events unavailable — timers still cover the normal path */ }
}

// grayscale the foe (Log Off). Saves original colors; restore is idempotent.
function desaturate(fighter) {
  const saved = []
  try {
    fighter.root.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || !m.color || m.userData.__cpGray) continue
        m.userData.__cpGray = true
        saved.push({ m, hex: m.color.getHex() })
        const c = m.color
        const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b
        c.setRGB(l, l, l)
      }
    })
  } catch (e) { console.warn('[cool-pal] desaturate failed', e) }
  return saved
}

function restoreColors(saved) {
  while (saved.length) {
    const s = saved.pop()
    try { s.m.color.setHex(s.hex); delete s.m.userData.__cpGray } catch { /* disposed */ }
  }
}

// vignette prop builders (Forced Vacation) — cheap, chunky, disposable
function palmTreeMesh() {
  const g = new THREE.Group()
  g.add(box(0.2, 1.5, 0.2, decorMat(0x8a6238), 0, 0.75, 0, 0, 0, 0.08))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    g.add(box(0.85, 0.07, 0.26, decorMat(0x3fae4e), Math.cos(a) * 0.42, 1.55, Math.sin(a) * 0.42, 0, -a, 0.35))
  }
  g.add(sph(0.12, decorMat(0x8a6238), 0.15, 1.42, 0.1)) // coconut
  return g
}

function snowmanMesh() {
  const g = new THREE.Group()
  const snow = decorMat(0xeef2f6)
  g.add(sph(0.5, snow, 0, 0.45, 0))
  g.add(sph(0.36, snow, 0, 1.12, 0))
  g.add(sph(0.26, snow, 0, 1.6, 0))
  const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), decorMat(0xff8c42))
  carrot.position.set(0.32, 1.62, 0)
  carrot.rotation.z = -Math.PI / 2
  g.add(carrot)
  g.add(box(0.3, 0.06, 0.3, decorMat(0x22242c), 0, 1.74, 0))
  g.add(box(0.2, 0.18, 0.2, decorMat(0x22242c), 0, 1.84, 0))
  return g
}

function moonFlagMesh() {
  const g = new THREE.Group()
  g.add(cyl(0.95, 1.1, 0.16, decorMat(0x8f97a6), 0, 0.08, 0))
  g.add(sph(0.12, decorMat(0x737b8a), 0.4, 0.17, 0.3, 1, 0.4, 1)) // craters
  g.add(sph(0.09, decorMat(0x737b8a), -0.35, 0.17, -0.25, 1, 0.4, 1))
  g.add(box(0.05, 1.3, 0.05, decorMat(0xd8dde4), 0, 0.8, 0))
  g.add(box(0.5, 0.3, 0.03, decorMat(0xe23b47), 0.28, 1.28, 0))
  return g
}

function grassTuftMesh(scale = 1) {
  const g = new THREE.Group()
  const m1 = decorMat(C.grass)
  const m2 = decorMat(C.grassDark)
  g.add(box(0.05, 0.34, 0.05, m1, 0, 0.17, 0, 0, 0, 0.18))
  g.add(box(0.05, 0.28, 0.05, m2, 0.06, 0.14, 0.04, 0, 0, -0.25))
  g.add(box(0.05, 0.24, 0.05, m1, -0.05, 0.12, -0.05, 0.2, 0, 0.3))
  g.scale.setScalar(scale)
  return g
}

function powerButtonMesh() {
  const g = new THREE.Group()
  g.add(cyl(0.78, 0.86, 0.22, decorMat(0x3d4250), 0, 0, 0))
  g.add(cyl(0.62, 0.62, 0.18, decorMat(0xe23b47), 0, 0.14, 0))
  // the universal power glyph: a ring with a gap and a tick
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12, Math.PI * 1.6), decorMat(0xf2f3f5))
  ring.rotation.x = -Math.PI / 2
  ring.rotation.z = Math.PI / 2 + 0.4
  ring.position.y = 0.24
  g.add(ring)
  g.add(box(0.08, 0.03, 0.3, decorMat(0xf2f3f5), 0, 0.24, 0.16))
  return g
}

function dndSignMesh() {
  const g = new THREE.Group()
  g.add(box(0.5, 0.68, 0.05, decorMat(C.white), 0, 0, 0))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 12), decorMat(C.red))
  ring.position.set(0, 0.08, 0.035)
  g.add(ring)
  g.add(box(0.3, 0.06, 0.03, decorMat(C.red), 0, 0.08, 0.045, 0, 0, 0.6))
  g.add(box(0.34, 0.05, 0.03, decorMat(0x22242c), 0, -0.2, 0.035))
  return g
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------

// Sitting Dodge — sits down; attacks whiff over him (i-frames)
function sitDodgeScript(fx) {
  const end = onceEnd(fx)
  try { fx.self.invuln = Math.max(fx.self.invuln || 0, 26) } catch { /* engine field */ }
  fx.sfx('slide', { pitch: 0.8, vol: 0.5 })
  fx.particles('smoke', v3(fx.self.pos.x, 0.25, 0), { n: 4 })
  fx.after(10, () => { if (Math.random() < 0.3) fx.caption('NICE TRY') })
  fx.after(30, end)
}

// Calm Counter — a raised paw. if the foe swings during the window, they get shoved.
function calmCounterScript(fx) {
  const end = onceEnd(fx)
  let fired = false
  fx.sfx('whoosh', { pitch: 0.6, vol: 0.5 })
  fx.frame((age) => {
    if (fired || age < 4 || age > 28) return
    const foe = fx.foe
    if (!foe || foe.state !== 'attack' || !inRange(fx, 2.5)) return
    fired = true
    try {
      fx.sfx('thud', { pitch: 1.2 })
      fx.shake(0.6)
      fx.slowmo(0.4, 0.3)
      fx.caption('NOPE.')
      fx.particles('sparks', v3(foe.pos.x, 1.2, 0), { n: 10 })
      fx.hit({ damage: 12, knockback: { x: awayX(fx, 13), y: 3.5, spin: 1 }, hitStun: 26, ragdoll: 1 })
    } catch (e) { console.warn('[cool-pal] counter failed', e) }
  })
  fx.after(44, end)
}

// Yawn Push — a yawn so large it displaces people on BOTH sides
function yawnPushScript(fx) {
  const end = onceEnd(fx)
  fx.after(4, () => fx.sfx('whoosh', { pitch: 0.5, vol: 0.7 }))
  fx.after(14, () => {
    try {
      if (!inRange(fx, 2.8)) { fx.caption('BIG YAWN'); return }
      fx.sfx('boing', { pitch: 0.7 })
      fx.shake(0.35)
      const away = fx.foe.pos.x >= fx.self.pos.x ? 1 : -1
      fx.particles('smoke', v3(fx.self.pos.x + away * 0.9, 1.4, 0), { n: 8 })
      fx.hit({ damage: 6, knockback: { x: awayX(fx, 12), y: 3 }, hitStun: 20 })
    } catch (e) { console.warn('[cool-pal] yawn failed', e) }
  })
  fx.after(32, end)
}

// SPECIAL 1: Still Cool — stands completely still; incoming attacks rebound
function vibeCheckScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(10, () => {
    // a single finger-snap of pure, weaponized serenity
    fx.sfx('menu_confirm', { pitch: 1.4 })
    fx.particles('spark', v3(fx.self.pos.x + F * 0.9, 1.4, 0), { n: 8 })
    if (inRange(fx, 2.8)) {
      fx.sfx('punch_heavy')
      fx.shake(0.5)
      fx.slowmo(0.5, 0.3)
      fx.hit({ damage: 12, knockback: { x: 11, y: 5, spin: 1.6 }, hitStun: 26, ragdoll: 1 })
      fx.caption('VIBE CHECK: FAILED')
    } else {
      fx.caption('VIBES: IMMACULATE')
    }
  })
  fx.after(38, end)
}

function stillCoolScript(fx) {
  const end = onceEnd(fx)
  fx.announcer('STILL COOL')
  fx.sfx('bell', { pitch: 1.4, vol: 0.4 })
  fx.particles('stars', v3(fx.self.pos.x, 2.0, 0), { n: 5 })
  let cd = 0
  fx.frame((age) => {
    if (cd > 0) { cd--; return }
    if (age < 6 || age > 156) return
    const foe = fx.foe
    if (!foe || foe.state !== 'attack' || !foe.currentMove) return
    const m = foe.currentMove
    const su = m.startup || 0
    if (foe.moveFrame < su || foe.moveFrame > su + (m.active || 3) + 2) return
    if (!inRange(fx, 2.6)) return
    cd = 30
    try {
      fx.caption('STILL COOL')
      fx.sfx('block')
      fx.sfx('boing', { pitch: 1.2 })
      fx.shake(0.5)
      fx.slowmo(0.5, 0.25)
      const away = foe.pos.x >= fx.self.pos.x ? 1 : -1
      fx.particles('stars', v3(fx.self.pos.x + away * 0.9, 1.4, 0), { n: 8 })
      fx.hit({ damage: 7, knockback: { x: awayX(fx, 14), y: 5, spin: 1.5 }, hitStun: 24, ragdoll: 1 })
    } catch (e) { console.warn('[cool-pal] rebound failed', e) }
  })
  fx.after(176, end)
}

// SPECIAL 2: Touch Grass — grass erupts across the floor; the foe gets tangled
function touchGrassScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const decor = []
  const cleanup = () => clearDecor(decor)
  hookRoundEnd(fx, cleanup)
  fx.after(6, () => fx.sfx('whoosh', { pitch: 0.7, vol: 0.5 }))
  fx.after(14, () => {
    try {
      fx.sfx('break', { pitch: 1.4, vol: 0.5 })
      fx.shake(0.4)
      // a lawn erupts along the fight axis
      for (let i = 0; i < 8; i++) {
        const tuft = grassTuftMesh(0.9 + Math.random() * 0.8)
        tuft.position.set(
          clampToArena(fx, fx.self.pos.x + F * (0.7 + i * 0.5)),
          0,
          (i % 2 ? 0.45 : -0.45) * (0.5 + Math.random() * 0.8),
        )
        addDecor(fx, tuft, decor)
      }
      fx.particles('smoke', v3(fx.self.pos.x + F * 1.6, 0.3, 0), { n: 8 })
      if (inRange(fx, 3.6)) {
        fx.caption('TOUCH GRASS')
        fx.announcer('TOUCH GRASS')
        fx.sfx('grab')
        // tangle ring around the foe's feet
        for (let i = 0; i < 4; i++) {
          const tuft = grassTuftMesh(1.3)
          const a = (i / 4) * Math.PI * 2
          tuft.position.set(clampToArena(fx, fx.foe.pos.x + Math.cos(a) * 0.4), 0, Math.sin(a) * 0.35)
          tuft.rotation.y = a
          addDecor(fx, tuft, decor)
        }
        fx.hit({ damage: 8, knockback: { x: 0, y: 0 }, hitStun: 120 })
      } else {
        fx.caption('GRASS TOUCHED. NO ONE CARED.')
      }
    } catch (e) { console.warn('[cool-pal] touch grass failed', e) }
  })
  fx.after(150, cleanup) // the lawn politely excuses itself
  fx.after(58, end)
}

// SUPER: Log Off — a giant power button descends; he presses it; the foe reboots
function logOffScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const decor = []
  const saved = []
  let restored = false
  const restore = () => { if (!restored) { restored = true; restoreColors(saved) } }
  const cleanup = () => { restore(); clearDecor(decor) }
  hookRoundEnd(fx, cleanup)

  fx.zoom(fx.self, 0.6)
  fx.slowmo(0.6, 0.5)
  fx.announcer('LOG OFF')
  fx.sfx('bell', { pitch: 0.6 })

  fx.after(18, () => {
    if (!inRange(fx, 3.4)) {
      fx.caption('ALREADY OFFLINE')
      fx.after(36, end)
      return
    }
    // the button descends from the heavens, unhurried, like its owner
    let btn = null
    try {
      btn = powerButtonMesh()
      btn.position.set(clampToArena(fx, fx.self.pos.x + F * 1.1), 5.4, 0)
      addDecor(fx, btn, decor)
      fx.sfx('whoosh', { pitch: 0.5 })
    } catch (e) { console.warn('[cool-pal] button failed', e) }
    fx.frame((age) => {
      if (!btn || age < 20 || age > 46) return
      try { btn.position.y = 5.4 - Math.min(1, (age - 20) / 26) * 3.9 } catch { /* removed */ }
    })

    fx.after(32, () => { // THE PRESS
      try {
        fx.sfx('menu_confirm', { pitch: 0.5 })
        fx.shake(0.3)
        if (btn) btn.scale.y = 0.7
        fx.particles('sparks', v3(fx.self.pos.x + F * 1.1, 1.6, 0), { n: 6 })
      } catch { /* cosmetic */ }
    })

    fx.after(38, () => { // shutdown: grayscale + limp
      try {
        fx.sfx('thud', { pitch: 0.4 })
        fx.caption('SHUTTING DOWN...')
        saved.push(...desaturate(fx.foe))
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 135, ragdoll: 1 })
        fx.particles('smoke', v3(fx.foe.pos.x, 1.6, 0), { n: 10 })
        fx.slowmo(0.5, 0.4)
      } catch (e) { console.warn('[cool-pal] shutdown failed', e) }
    })

    // sad little OS noises while the foe is off
    for (let i = 0; i < 3; i++) {
      fx.after(64 + i * 26, () => {
        fx.sfx('menu_back', { pitch: 0.7 + i * 0.2, vol: 0.5 })
        fx.particles('smoke', v3(fx.foe.pos.x, 1.8, 0), { n: 3 })
      })
    }

    fx.after(158, () => { // REBOOT
      try {
        restore()
        fx.caption('REBOOTED. IT DID NOT HELP.')
        fx.announcer('UPDATE COMPLETE')
        fx.sfx('explosion')
        fx.shake(1)
        fx.slowmo(0.35, 0.5)
        fx.zoom(fx.foe, 0.8)
        fx.particles('sparks', v3(fx.foe.pos.x, 1.3, 0), { n: 20 })
        fx.particles('impact', v3(fx.foe.pos.x, 1.2, 0), { n: 16 })
        fx.hit({ damage: 32, knockback: { x: 14, y: 9, spin: 2.5 }, hitStun: 40, ragdoll: 2 })
      } catch (e) { console.warn('[cool-pal] reboot failed', e) }
    })

    fx.after(172, () => { // the button clocks out too
      try { if (btn) { fx.particles('smoke', v3(btn.position.x, btn.position.y, 0), { n: 6 }) } } catch { /* gone */ }
      removeDecorItem(decor, btn)
    })
  })

  fx.after(215, cleanup) // failsafe: colors and props always come back
  fx.after(228, end)
}

// SPECIAL 4: Zero Stress — sits, sips; for 4s the foe's damage partially reflects
function zeroStressScript(fx) {
  const end = onceEnd(fx)
  const decor = []
  const cleanup = () => clearDecor(decor)
  hookRoundEnd(fx, cleanup)
  fx.announcer('ZERO STRESS')
  fx.sfx('slide', { pitch: 0.6, vol: 0.4 })

  // a tiny mug appears in his paw. contents: not your business.
  fx.after(14, () => {
    try {
      const paw = fx.self.bones?.forearmR
      if (paw) {
        const mug = new THREE.Group()
        mug.add(cyl(0.09, 0.08, 0.14, decorMat(0xf2f3f5), 0, 0, 0))
        mug.add(box(0.03, 0.08, 0.03, decorMat(0xf2f3f5), 0, 0, 0.11))
        mug.position.set(0.02, -0.3, 0)
        paw.add(mug)
        decor.push({ mesh: mug, parent: paw })
      }
    } catch { /* cosmetic */ }
  })
  fx.after(55, cleanup) // mug away before recovery ends

  // the 4-second grudge ledger: 30% of everything he takes goes right back
  let last = fx.self.hp
  let active = true
  for (let i = 6; i <= 240; i += 3) {
    fx.after(i, () => {
      if (!active) return
      try {
        const s = fx.self, f = fx.foe
        if (!s || !f || s.hp <= 0 || f.hp <= 0) { active = false; return }
        if (f.state === 'ko' || f.state === 'win' || f.state === 'lose') { active = false; return }
        if (s.hp < last) {
          const diff = last - s.hp
          last = s.hp
          const back = Math.max(1, Math.round(diff * 0.3))
          fx.hit({ damage: back })
          fx.particles('smoke', v3(f.pos.x, f.pos.y + 1.8, 0), { n: 5 }) // steam of frustration
          fx.sfx('thud', { pitch: 1.6, vol: 0.45 })
          fx.caption('STRESS: REFLECTED')
        } else {
          last = s.hp
        }
      } catch { active = false }
    })
  }
  // ambient chill
  for (const t of [20, 90, 160, 230]) {
    fx.after(t, () => { try { fx.particles('stars', v3(fx.self.pos.x, 2.1, 0), { n: 4 }) } catch { /* fine */ } })
  }
  fx.after(60, end)
}

// JOKE: Do Not Disturb — flips a sign; deals 1 point of emotional damage
function dndScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const decor = []
  const cleanup = () => clearDecor(decor)
  hookRoundEnd(fx, cleanup)
  fx.after(10, () => {
    try {
      const sign = dndSignMesh()
      sign.position.set(clampToArena(fx, fx.self.pos.x + F * 0.95), 1.35, 0)
      sign.rotation.y = F > 0 ? -Math.PI / 2 : Math.PI / 2
      addDecor(fx, sign, decor)
      fx.sfx('menu_back', { pitch: 0.8 })
    } catch (e) { console.warn('[cool-pal] sign failed', e) }
  })
  fx.after(16, () => {
    fx.caption('DO NOT DISTURB')
    try {
      if (inRange(fx, 2.6)) {
        fx.sfx('menu_confirm', { pitch: 0.6 })
        fx.hit({ damage: 1, knockback: { x: 3, y: 1 }, hitStun: 18 })
        fx.caption('EMOTIONAL DAMAGE: 1')
        fx.announcer('READ THE SIGN')
        // the controls feel heavier now (engine multiplier if supported;
        // a harmless field otherwise)
        const foe = fx.foe
        const prev = foe.speedMult
        foe.speedMult = 0.65
        const lift = () => { try { if (foe.speedMult === 0.65) foe.speedMult = prev ?? 1 } catch { /* fine */ } }
        fx.after(180, lift)
        hookRoundEnd(fx, lift)
      } else {
        fx.caption('NO ONE WAS DISTURBED')
      }
    } catch (e) { console.warn('[cool-pal] dnd failed', e) }
  })
  fx.after(46, cleanup)
  fx.after(50, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const CoolPalDef = {
  id: 'cool-pal',
  name: 'COOL PAL',
  title: 'The Unbothered One',
  bio: 'A capybara who wandered into a crypto conference for the free water and accidentally became its most respected figure. Holds nothing, sells nothing, checks nothing. His portfolio is a warm rock in the sun. Fights only because leaving would require getting up.',
  style: 'Counter specialist. The slowest buttons in the game attached to the rudest results. Let them tire themselves out, then apply one (1) palm. Wins most rounds while technically resting.',
  stats: { power: 7, speed: 4, defense: 8, chaos: 5 },
  height: 1.8,
  weight: 1.25,
  walkSpeed: 3.2,
  dashSpeed: 7,
  jumpVel: 7.5,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'lazy-palm', name: 'Lazy Palm', kind: 'light',
      input: ['light'],
      damage: 7, startup: 8, active: 4, recovery: 12,
      hitbox: { w: 1.0, h: 0.8, d: 0.9, forward: 1.0, up: 1.1 },
      knockback: { x: 10, y: 1, spin: 0.2 }, // one palm, big pushback
      hitStun: 16, blockStun: 9, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'lazyPalm', sfx: 'punch_light', script: null,
    },
    {
      id: 'slow-kick', name: 'Slow Kick', kind: 'kick',
      input: ['kick'],
      damage: 12, startup: 14, active: 4, recovery: 15,
      hitbox: { w: 1.1, h: 1.0, d: 0.9, forward: 1.0, up: 0.9 },
      knockback: { x: 4, y: 8.5, spin: 0.8 }, // deceptively strong — pops them up
      hitStun: 24, blockStun: 12, hitStop: 6,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'slowKick', sfx: 'kick', script: null,
    },
    {
      id: 'shoulder-lean', name: 'Shoulder Lean', kind: 'heavy',
      input: ['heavy'],
      damage: 13, startup: 11, active: 5, recovery: 14,
      hitbox: { w: 1.0, h: 1.2, d: 1.0, forward: 0.8, up: 1.0 },
      knockback: { x: 12.5, y: 2.5, spin: 0.6 }, // the foe bounces off
      hitStun: 20, blockStun: 13, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0,
      armor: 8, // you cannot interrupt a lean
      clip: 'shoulderLean', sfx: 'thud', script: null,
    },
    {
      id: 'headphone-swing', name: 'Headphone Swing', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 9, startup: 9, active: 5, recovery: 16,
      hitbox: { w: 1.0, h: 1.5, d: 0.9, forward: 0.9, up: 1.2 },
      knockback: { x: 2.5, y: 9.5, spin: 1.4 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'phoneSwing', sfx: 'whoosh', script: null,
    },
    {
      id: 'sitting-dodge', name: 'Sitting Dodge', kind: 'kick',
      input: ['down', 'kick'],
      damage: 0, startup: 3, active: 2, recovery: 25,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 0.4 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'sitDodge', sfx: 'slide',
      script: sitDodgeScript,
    },
    {
      id: 'calm-counter', name: 'Calm Counter', kind: 'heavy',
      input: ['back', 'heavy'],
      damage: 12, startup: 4, active: 24, recovery: 16,
      hitbox: { w: 0.9, h: 1.2, d: 0.9, forward: 0.8, up: 1.1 },
      knockback: { x: 13, y: 3.5, spin: 1 },
      hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 6, meterCost: 0,
      armor: 28, // the whole point: he does not care that you hit him
      clip: 'calmCounter', sfx: 'whoosh',
      script: calmCounterScript,
    },
    {
      id: 'yawn-push', name: 'Yawn Push', kind: 'heavy',
      input: ['down', 'heavy'],
      damage: 6, startup: 13, active: 4, recovery: 15,
      hitbox: { w: 2.4, h: 1.4, d: 1.6, forward: 0.6, up: 1.1 },
      knockback: { x: 12, y: 3, spin: 0.4 },
      hitStun: 20, blockStun: 11, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'yawnPush', sfx: 'boing',
      script: yawnPushScript,
    },
    {
      id: 'sandal-slap', name: 'Sandal Slap', kind: 'light',
      // NOTE: 'back'+light rather than crouch-light — down+light is reserved by
      // the mandated joke input [down,down,light], which would always outrank it.
      input: ['back', 'light'],
      damage: 5, startup: 6, active: 3, recovery: 10,
      hitbox: { w: 1.0, h: 0.7, d: 0.9, forward: 0.9, up: 0.6 },
      knockback: { x: 6, y: 2, spin: 0.5 },
      hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'sandalSlap', sfx: 'punch_light', script: null,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'gentle-guidance', name: 'Gentle Guidance', kind: 'grab',
      input: ['grab'],
      damage: 13, startup: 8, active: 4, recovery: 40,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.1 },
      // softly redirected... into the mantle. huge slam.
      knockback: { x: 2.5, y: 7.5, spin: 2 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'guide', sfx: 'grab', script: null,
    },
    {
      id: 'nap-time', name: 'Nap Time', kind: 'grab',
      input: ['down', 'grab'],
      damage: 10, startup: 10, active: 3, recovery: 34,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 0.9 },
      // tucked in, patted twice, rolled away like a burrito
      knockback: { x: 11, y: 3, spin: 3.5 },
      hitStun: 30, blockStun: 0, hitStop: 5,
      launcher: false, ragdollThreshold: 2,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'napTime', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'vibe-check', name: 'Vibe Check', kind: 'special',
      input: ['special'],
      damage: 12, startup: 10, active: 4, recovery: 24,
      hitbox: { w: 1.2, h: 1.2, d: 1.0, forward: 1.2, up: 1.2 },
      knockback: { x: 11, y: 5, spin: 1.6 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'stillCool', sfx: 'menu_confirm',
      script: vibeCheckScript,
    },
    {
      id: 'still-cool', name: 'Still Cool', kind: 'special',
      input: ['down', 'special'],
      damage: 7, startup: 6, active: 150, recovery: 20,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 14, y: 5, spin: 1.5 },
      hitStun: 24, blockStun: 0, hitStop: 4,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 25,
      armor: 156, // stands completely still through everything
      clip: 'stillCool', sfx: 'bell',
      script: stillCoolScript,
    },
    {
      id: 'touch-grass', name: 'Touch Grass', kind: 'special',
      input: ['forward', 'special'],
      damage: 8, startup: 14, active: 6, recovery: 38,
      hitbox: { w: 3.2, h: 0.8, d: 1.6, forward: 1.6, up: 0.4 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 120, blockStun: 12, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'touchGrass', sfx: 'break',
      script: touchGrassScript,
    },
    {
      id: 'log-off', name: 'Log Off', kind: 'super',
      input: ['super'],
      damage: 34, startup: 18, active: 140, recovery: 70,
      hitbox: { w: 1.2, h: 1.6, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 14, y: 9, spin: 2.5 },
      hitStun: 40, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 12,
      clip: 'logOff', sfx: 'bell',
      script: logOffScript,
    },
    {
      id: 'zero-stress', name: 'Zero Stress', kind: 'special',
      input: ['back', 'special'],
      damage: 0, startup: 10, active: 8, recovery: 42,
      hitbox: { w: 0.5, h: 0.5, d: 0.5, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'zeroStress', sfx: 'slide',
      script: zeroStressScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'do-not-disturb', name: 'Do Not Disturb', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 1, startup: 12, active: 4, recovery: 34,
      hitbox: { w: 1.0, h: 1.2, d: 0.9, forward: 0.9, up: 1.1 },
      knockback: { x: 3, y: 1, spin: 0.3 },
      hitStun: 18, blockStun: 6, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 10, meterCost: 0, armor: 0,
      clip: 'dnd', sfx: 'menu_back',
      script: dndScript,
    },
  ],

  finisher: {
    id: 'forced-vacation',
    name: 'Forced Vacation',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const decor = []
      const cleanup = () => clearDecor(decor)
      hookRoundEnd(fx, cleanup)

      fx.slowmo(0.5, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption('FORCED VACATION')
      fx.announcer('FORCED VACATION')
      fx.sfx('bell')
      fx.self.playClip?.('vacation')

      // the beach chair is provided. attendance is not optional.
      let chair = null
      fx.after(12, () => {
        chair = fx.spawnProp('chair', v3(clampToArena(fx, fx.foe.pos.x + F * 0.4), 0.6, 0))
        fx.sfx('thud', { vol: 0.5 })
      })

      fx.after(20, () => { // the gentle push
        fx.sfx('grab')
        fx.caption('SIT. RELAX.')
        fx.hit({ damage: 2, knockback: { x: 1, y: 0 }, hitStun: 150 })
      })

      fx.after(46, () => { // CATAPULT
        fx.sfx('launch')
        fx.shake(1)
        fx.slowmo(0.35, 0.7)
        fx.zoom(fx.foe, 1.0)
        fx.hit({ damage: 8, knockback: { x: 7, y: 13, spin: 2.5 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 7, 15, 0])
        if (chair) { try { fx.impulse(chair, [F * 5, 10, 0], 3) } catch { /* prop gone */ } }
        fx.particles('smoke', v3(fx.foe.pos.x, 0.5, 0), { n: 10 })
      })

      // the itinerary: three destinations, zero say in the matter
      const stops = [
        { at: 70, cap: 'DAY 1: THE TROPICS', build: palmTreeMesh },
        { at: 100, cap: 'DAY 2: THE ALPS', build: snowmanMesh },
        { at: 130, cap: 'DAY 3: THE MOON', build: moonFlagMesh },
      ]
      for (const stop of stops) {
        fx.after(stop.at, () => {
          try {
            const scene = stop.build()
            scene.position.set(clampToArena(fx, fx.foe.pos.x), 0, -2.6)
            addDecor(fx, scene, decor)
            fx.sfx('whoosh', { pitch: 1.2 })
            fx.caption(stop.cap)
            fx.shake(0.25)
            fx.impulse(fx.foe, [F * 1.5, 9, 0]) // connecting flight
            fx.after(26, () => removeDecorItem(decor, scene))
          } catch (e) { console.warn('[cool-pal] vignette failed', e) }
        })
      }

      fx.after(160, () => {
        fx.sfx('whoosh', { pitch: 0.6 })
        fx.caption('RETURN FLIGHT: ECONOMY')
      })

      fx.after(172, () => { // CRASH LANDING
        fx.shake(1.3)
        fx.sfx('break')
        fx.slowmo(0.3, 0.6)
        fx.hit({ damage: 20, knockback: { x: 4, y: 6, spin: 2 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [-F * 3, 7, 0])
        fx.particles('impact', v3(fx.foe.pos.x, 0.8, 0), { n: 24 })
        fx.particles('smoke', v3(fx.foe.pos.x, 0.6, 0), { n: 12 })
      })

      fx.after(186, () => { // the suitcase arrives late, raining clothes
        const sx = clampToArena(fx, fx.foe.pos.x)
        const suitcase = fx.spawnProp('crate', v3(sx, 5.5, 0))
        if (suitcase) { try { fx.impulse(suitcase, [0, -6, 0], 2) } catch { /* prop gone */ } }
        fx.caption('BAGGAGE: LOST')
        fx.particles('confetti', v3(sx, 4.8, 0), { n: 26 })
        for (let i = 0; i < 8; i++) {
          fx.after(6 + i * 3, () => {
            const b = fx.spawnProp('box',
              v3(clampToArena(fx, sx + (Math.random() - 0.5) * 1.5), 4.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2),
              { mass: 0.3 })
            if (b) { try { fx.impulse(b, [(Math.random() - 0.5) * 5, -2, (Math.random() - 0.5) * 3], 4) } catch { /* prop gone */ } }
            if (i % 2 === 0) fx.sfx('thud', { pitch: 1.3 + i * 0.08, vol: 0.5 })
          })
        }
      })

      fx.after(212, () => fx.announcer('WISH YOU WERE HERE'))
      fx.after(232, cleanup)
      fx.after(236, end)
    },
  },

  voice: { pitch: 0.5, rate: 0.65 },
}
