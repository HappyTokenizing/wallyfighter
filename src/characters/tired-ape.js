// TIRED APE — The Unimpressed Investor.
// Fully self-contained CharacterDef per CONTRACTS.md §4.
// Original rounded low-poly primate (no NFT lookalikes): heavy eyelids, dark
// sunglasses, purple bathrobe with a springy hem, bunny slippers, and a coffee
// mug labeled 'MEH' welded to one hand. Permanent slouch. Every attack looks
// half-asleep and hits like a margin call. All geometry, textures, animation
// and move scripts are procedural — no assets, no extra deps.
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
const C = {
  fur: 0x6b4a34,
  furDark: 0x54392a,
  skin: 0xc9a26b,
  skinDark: 0xa9834f,
  robe: 0x6a3fa0,
  robeDark: 0x53307e,
  robeTrim: 0x9a6fd0,
  slipper: 0xe89bb8,
  slipperFluff: 0xf7d9e4,
  mug: 0xf2efe9,
  coffee: 0x5a3a22,
  shades: 0x14161a,
  gold: 0xffcf3d,
  paper: 0xf5f2e8,
  suitShirt: 0xe8e8f0,
  suitPants: 0x2a2d3a,
  tie: 0xc03b3b,
  steel: 0x9aa2ad,
  button: 0xd8322e,
  wood: 0x7a5230,
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

// procedural canvas label texture — returns null (caller falls back) if the
// canvas API is unavailable for any reason.
function labelTex(text, opts = {}) {
  try {
    const c = document.createElement('canvas')
    c.width = opts.w || 256
    c.height = opts.h || 96
    const g = c.getContext('2d')
    g.fillStyle = opts.bg || '#f5f2e8'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = opts.border || '#2a2a2a'
    g.lineWidth = 8
    g.strokeRect(4, 4, c.width - 8, c.height - 8)
    g.fillStyle = opts.fg || '#222222'
    g.font = `bold ${opts.size || 52}px Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, c.width / 2, c.height / 2 + 2)
    const t = new THREE.CanvasTexture(c)
    t.anisotropy = 2
    return t
  } catch { return null }
}

// ---------------------------------------------------------------------------
// model — faces +X, feet at y=0, ~1.9 m tall (slouched, obviously)
// ---------------------------------------------------------------------------
function buildModel(costume = 0) {
  const group = new THREE.Group()
  const bones = {}

  const furM = lamb(C.fur)
  const furDarkM = lamb(C.furDark)
  const skinM = lamb(C.skin)
  const skinDarkM = lamb(C.skinDark)
  const robeM = lamb(costume === 1 ? 0x2f6f4f : C.robe) // costume 1: money-green robe
  const robeDarkM = lamb(costume === 1 ? 0x224f39 : C.robeDark)
  const robeTrimM = lamb(costume === 1 ? 0x6fbf95 : C.robeTrim)
  const slipperM = lamb(costume === 1 ? 0x9fb7e8 : C.slipper)
  const fluffM = lamb(costume === 1 ? 0xdbe6f7 : C.slipperFluff)
  const shadeM = lamb(C.shades)
  const mugM = lamb(C.mug)
  const coffeeM = lamb(C.coffee)

  // --- hips -----------------------------------------------------------------
  const hips = pivot(group, 0, 0.85, 0)
  bones.hips = hips
  hips.add(sph(0.30, furM, 0, 0.02, 0, 1.0, 0.8, 1.08))
  hips.add(box(0.5, 0.14, 0.62, robeDarkM, 0.02, 0.06, 0)) // robe sash / belt

  // robe hem (extra bone — springy secondary motion)
  const robe = pivot(hips, -0.02, -0.06, 0)
  bones.robe = robe
  const rw = bent(robe, 0)
  rw.add(box(0.6, 0.44, 0.66, robeM, 0.03, -0.24, 0))
  rw.add(box(0.63, 0.08, 0.69, robeTrimM, 0.03, -0.46, 0)) // hem trim
  rw.add(box(0.1, 0.4, 0.06, robeTrimM, 0.31, -0.24, 0.12, 0, 0, 0.08)) // front split L
  rw.add(box(0.1, 0.4, 0.06, robeTrimM, 0.31, -0.24, -0.12, 0, 0, 0.08)) // front split R

  // --- legs (short, ending in glorious bunny slippers) ----------------------
  for (const side of [1, -1]) {
    const leg = pivot(hips, 0, -0.06, 0.17 * side)
    bones[side === 1 ? 'legL' : 'legR'] = leg
    leg.add(cyl(0.10, 0.11, 0.5, furM, 0, -0.28, 0))
    const slip = new THREE.Group()
    slip.add(box(0.34, 0.12, 0.18, slipperM, 0.08, 0, 0))
    slip.add(sph(0.065, fluffM, 0.2, 0.06, 0)) // fluff pom
    slip.add(box(0.14, 0.06, 0.19, slipperM, -0.05, 0.07, 0)) // heel cuff
    slip.position.set(0, -0.73, 0)
    leg.add(slip)
    leg.userData.slipper = slip
  }

  // --- torso (baked permanent slouch) --------------------------------------
  const torso = pivot(hips, 0, 0.10, 0)
  bones.torso = torso
  const tw = bent(torso, -0.22) // the slouch: baked, non-negotiable
  tw.add(sph(0.42, furM, 0.05, 0.28, 0, 0.95, 1.05, 0.9))
  tw.add(sph(0.34, skinM, 0.24, 0.2, 0, 0.55, 0.8, 0.62)) // chest patch
  // boxy robe shell (open front — chest fur pokes out)
  tw.add(box(0.56, 0.86, 0.8, robeM, -0.1, 0.24, 0))
  tw.add(box(0.1, 0.72, 0.1, robeTrimM, 0.28, 0.22, 0.24, 0, 0, -0.18)) // lapel L
  tw.add(box(0.1, 0.72, 0.1, robeTrimM, 0.28, 0.22, -0.24, 0, 0, -0.18)) // lapel R
  tw.add(box(0.3, 0.16, 0.5, robeDarkM, -0.12, 0.68, 0)) // rolled collar

  // costume 1: 'EX-CEO' gold lanyard badge
  if (costume === 1) {
    const goldM = lamb(C.gold)
    goldM.emissive = new THREE.Color(0x332200)
    tw.add(box(0.03, 0.4, 0.05, goldM, 0.3, 0.42, 0.1, 0, 0, -0.25))
    tw.add(box(0.05, 0.16, 0.13, lamb(0xffffff), 0.34, 0.2, 0.02))
  }

  // --- arms ----------------------------------------------------------------
  for (const side of [1, -1]) {
    const arm = pivot(tw, 0.06, 0.52, 0.4 * side)
    bones[side === 1 ? 'armL' : 'armR'] = arm
    arm.add(sph(0.12, robeM))
    arm.add(cyl(0.105, 0.1, 0.26, robeM, 0, -0.15, 0)) // robe sleeve
    arm.add(cyl(0.085, 0.08, 0.18, furM, 0, -0.31, 0))
    const fore = pivot(arm, 0, -0.38, 0)
    bones[side === 1 ? 'forearmL' : 'forearmR'] = fore
    // left forearm is baked bent — that hand carries the mug at all times
    const fw = bent(fore, side === 1 ? 1.3 : 0.2)
    fw.add(cyl(0.075, 0.07, 0.28, furM, 0, -0.14, 0))
    fw.add(sph(0.105, skinDarkM, 0.01, -0.31, 0, 1.1, 0.9, 1.0)) // leathery hand

    if (side === 1) {
      // the mug (extra bone — light spring-follow slosh)
      const mug = pivot(fw, 0.02, -0.34, 0.04)
      bones.mug = mug
      mug.add(cyl(0.085, 0.075, 0.16, mugM, 0, 0.02, 0))
      mug.add(cyl(0.07, 0.07, 0.015, coffeeM, 0, 0.105, 0)) // coffee surface
      mug.add(box(0.03, 0.09, 0.03, mugM, 0, 0.01, 0.105)) // handle
      const tex = labelTex('MEH', { w: 128, h: 64, size: 40, bg: '#f2efe9' })
      if (tex) {
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(0.13, 0.08),
          new THREE.MeshBasicMaterial({ map: tex }))
        label.position.set(0.088, 0.02, 0)
        label.rotation.y = Math.PI / 2
        mug.add(label)
      } else {
        mug.add(box(0.012, 0.05, 0.09, lamb(0x333333), 0.088, 0.02, 0))
      }
    }
  }

  // --- head ----------------------------------------------------------------
  // head sits low, sunk between the shoulders — neck sold off in 2022
  const head = pivot(tw, 0.16, 0.68, 0)
  bones.head = head
  head.add(sph(0.26, furM, 0.0, 0.06, 0, 1.0, 0.95, 1.05))
  head.add(sph(0.2, furM, -0.08, 0.16, 0, 1.0, 0.72, 1.0)) // flat sleepy crown
  head.add(sph(0.2, skinM, 0.14, 0.02, 0, 0.6, 0.85, 0.85)) // face plate
  head.add(sph(0.14, skinM, 0.23, -0.06, 0, 0.8, 0.55, 0.75)) // muzzle
  head.add(box(0.03, 0.02, 0.03, skinDarkM, 0.32, -0.03, 0.035)) // nostril
  head.add(box(0.03, 0.02, 0.03, skinDarkM, 0.32, -0.03, -0.035)) // nostril
  head.add(box(0.03, 0.015, 0.1, furDarkM, 0.3, -0.12, 0.02, 0, 0, -0.06)) // unimpressed mouth

  // dark sunglasses
  head.add(box(0.05, 0.04, 0.32, shadeM, 0.24, 0.12, 0)) // top bar
  for (const side of [1, -1]) {
    head.add(box(0.05, 0.12, 0.14, shadeM, 0.25, 0.075, 0.1 * side))
    head.add(box(0.22, 0.028, 0.028, shadeM, 0.12, 0.12, 0.19 * side)) // temple arm
    // drooping eyelids — heavy skin flaps sagging OVER the sunglasses
    head.add(box(0.05, 0.055, 0.14, skinM, 0.255, 0.155, 0.1 * side, 0.3 * side, 0, -0.12))
  }

  // round sleepy ears (extras — spring-follow)
  for (const side of [1, -1]) {
    const ear = pivot(head, -0.04, 0.08, 0.25 * side)
    bones[side === 1 ? 'earL' : 'earR'] = ear
    ear.add(sph(0.09, furM, 0, 0, 0.03 * side, 0.5, 1.0, 0.9))
    ear.add(sph(0.06, skinM, 0.02, 0, 0.045 * side, 0.35, 0.8, 0.7))
  }

  group.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
  })

  return { group, bones }
}

// ---------------------------------------------------------------------------
// animation clips — keyframe shorthand
// K(t, rot, pos?) ; all bones start at rotation [0,0,0]; hips base pos [0,0.85,0]
// (hips position keys are ABSOLUTE local values — the Animator sets, not adds)
// ---------------------------------------------------------------------------
const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })
const Z = [0, 0, 0]
const HIP = [0, 0.85, 0]

const clips = {
  // ------------------------------------------------------------- standard --
  // slow sway + a micro-sleep: head slowly droops, then snaps back awake
  idle: {
    duration: 2.4, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.2, [0, 0.02, -0.02], [0, 0.83, 0]), K(2.4, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(1.2, [0.02, -0.02, -0.16]), K(2.4, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(1.5, [0, 0, -0.22]), K(1.85, [0, 0, -0.3]), K(1.95, [0, 0.1, 0.24]), K(2.4, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(1.2, [0.03, 0, 0.14]), K(2.4, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(1.2, [-0.04, 0, 0.1]), K(2.4, [0, 0, 0.06])],
      forearmL: [K(0, Z), K(1.2, [0, 0, 0.08]), K(2.4, Z)],
      forearmR: [K(0, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z), K(1.2, [0.04, 0, 0.05]), K(2.4, Z)],
      earL: [K(0, Z), K(1.85, [0.15, 0.1, 0]), K(2.4, Z)],
      earR: [K(0, Z), K(1.85, [-0.15, -0.1, 0]), K(2.4, Z)],
      mug: [K(0, Z), K(1.9, [0, 0, 0.12]), K(2.05, [0, 0, -0.08]), K(2.4, Z)],
    },
  },

  // slippered shuffle — feet barely leave the floor
  walk: {
    duration: 0.9, loop: true,
    tracks: {
      hips: [K(0, [0, 0.03, -0.02], [0, 0.83, 0]), K(0.225, Z, [0, 0.815, 0]), K(0.45, [0, -0.03, -0.02], [0, 0.83, 0]), K(0.675, Z, [0, 0.815, 0]), K(0.9, [0, 0.03, -0.02], [0, 0.83, 0])],
      legL: [K(0, [0, 0, 0.32]), K(0.45, [0, 0, -0.32]), K(0.9, [0, 0, 0.32])],
      legR: [K(0, [0, 0, -0.32]), K(0.45, [0, 0, 0.32]), K(0.9, [0, 0, -0.32])],
      torso: [K(0, [0, -0.03, -0.14]), K(0.45, [0, 0.03, -0.14]), K(0.9, [0, -0.03, -0.14])],
      head: [K(0, [0, 0.03, 0.1]), K(0.45, [0, -0.03, 0.1]), K(0.9, [0, 0.03, 0.1])],
      armL: [K(0, [0, 0, 0.1])],
      armR: [K(0, [0, 0, -0.18]), K(0.45, [0, 0, 0.22]), K(0.9, [0, 0, -0.18])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
      robe: [K(0, [0, 0, 0.1]), K(0.45, [0, 0, -0.1]), K(0.9, [0, 0, 0.1])],
      mug: [K(0, [0, 0, 0.06]), K(0.45, [0, 0, -0.06]), K(0.9, [0, 0, 0.06])],
    },
  },

  // the minimum legally required jump effort
  jump: {
    duration: 0.5, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, 0.04], [0, 0.9, 0]), K(0.5, [0, 0, 0.04], [0, 0.9, 0])],
      legL: [K(0, Z), K(0.14, [0, 0, 0.55]), K(0.5, [0, 0, 0.45])],
      legR: [K(0, Z), K(0.14, [0, 0, 0.3]), K(0.5, [0, 0, 0.25])],
      armL: [K(0, [0, 0, 0.08]), K(0.14, [0, 0, 0.35]), K(0.5, [0, 0, 0.3])],
      armR: [K(0, [0, 0, 0.06]), K(0.14, [0.3, 0, 0.8]), K(0.5, [0.3, 0, 0.7])],
      torso: [K(0, [0, 0, -0.1]), K(0.14, [0, 0, 0.02])],
      head: [K(0, [0, 0, 0.14]), K(0.14, [0, 0, 0.05])],
      robe: [K(0, Z), K(0.14, [0, 0, -0.35]), K(0.5, [0, 0, -0.3])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  fall: {
    duration: 0.6, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.06], HIP)],
      torso: [K(0, [0, 0, 0.05])],
      head: [K(0, [0, 0, 0.1])],
      armL: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 0.65]), K(0.6, [0, 0, 0.5])], // protect the coffee
      armR: [K(0, [0.4, 0, 1.8]), K(0.3, [0.2, 0, 1.5]), K(0.6, [0.4, 0, 1.8])],
      legL: [K(0, [-0.2, 0, 0.3]), K(0.3, [-0.2, 0, 0.1]), K(0.6, [-0.2, 0, 0.3])],
      legR: [K(0, [0.2, 0, 0.1]), K(0.3, [0.2, 0, 0.3]), K(0.6, [0.2, 0, 0.1])],
      robe: [K(0, [0, 0, -0.5]), K(0.3, [0, 0, -0.65]), K(0.6, [0, 0, -0.5])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  crouch: {
    duration: 0.8, loop: true,
    tracks: {
      hips: [K(0, [0, 0, -0.08], [0, 0.55, 0]), K(0.4, [0, 0, -0.08], [0, 0.54, 0]), K(0.8, [0, 0, -0.08], [0, 0.55, 0])],
      legL: [K(0, [-0.4, 0, 0.75])], legR: [K(0, [0.4, 0, 0.75])],
      torso: [K(0, [0, 0, -0.28])],
      head: [K(0, [0, 0, 0.3])],
      armL: [K(0, [0.2, 0, 0.4])], // mug held carefully level
      armR: [K(0, [-0.2, 0, 0.4])],
      forearmL: [K(0, [0, 0, 0.2])], forearmR: [K(0, [0, 0, 0.6])],
      robe: [K(0, [0, 0, 0.3])],
    },
  },

  block: {
    duration: 0.7, loop: true,
    tracks: {
      hips: [K(0, Z, [-0.03, 0.82, 0])],
      torso: [K(0, [0, 0, -0.05]), K(0.35, [0.02, 0, -0.08]), K(0.7, [0, 0, -0.05])],
      head: [K(0, [0, 0, -0.12])],
      armR: [K(0, [-0.3, 0, 1.0])],
      forearmR: [K(0, [0, 0, 1.5])],
      armL: [K(0, [0.5, 0, -0.3])], // mug tucked safely behind
      forearmL: [K(0, Z)],
      legL: [K(0, [-0.12, 0, 0.08])], legR: [K(0, [0.12, 0, 0.08])],
      robe: [K(0, [0, 0, 0.08])],
    },
  },

  hitLight: {
    duration: 0.3, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.06, [0, 0, 0.08], [-0.06, 0.83, 0]), K(0.3, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.06, [0, -0.08, 0.2]), K(0.3, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.06, [0, 0.1, 0.45]), K(0.3, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.06, [0.25, 0, 0.4]), K(0.3, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.06, [-0.3, 0, -0.5]), K(0.3, [0, 0, 0.06])],
      mug: [K(0, Z), K(0.07, [0, 0, 0.35]), K(0.16, [0, 0, -0.2]), K(0.3, Z)], // coffee slosh
      earL: [K(0, Z), K(0.07, [0.3, 0.3, 0]), K(0.3, Z)],
      earR: [K(0, Z), K(0.07, [-0.3, -0.3, 0]), K(0.3, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  hitHeavy: {
    duration: 0.45, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.07, [0, 0, 0.2], [-0.18, 0.8, 0]), K(0.45, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.07, [0, -0.12, 0.45]), K(0.45, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.07, [0, 0.12, 0.7]), K(0.45, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.07, [0.5, 0, -0.9]), K(0.45, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.07, [-0.5, 0, -1.0]), K(0.45, [0, 0, 0.06])],
      legL: [K(0, Z), K(0.08, [0, 0, 0.45]), K(0.45, Z)],
      legR: [K(0, Z)],
      robe: [K(0, Z), K(0.08, [0, 0, 0.5]), K(0.45, Z)],
      mug: [K(0, Z), K(0.08, [0, 0, 0.6]), K(0.2, [0, 0, -0.35]), K(0.45, Z)],
      earL: [K(0, Z), K(0.08, [0.5, 0.5, 0]), K(0.45, Z)],
      earR: [K(0, Z), K(0.08, [-0.5, -0.5, 0]), K(0.45, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  launched: {
    duration: 0.5, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 0.3], HIP)],
      torso: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 0.4]), K(0.5, [0, 0, 0.5])],
      head: [K(0, [0, 0, 0.45])],
      armL: [K(0, [-0.3, 0, 2.1]), K(0.25, [-0.1, 0, 2.3]), K(0.5, [-0.3, 0, 2.1])],
      armR: [K(0, [0.1, 0, 2.3]), K(0.25, [0.3, 0, 2.1]), K(0.5, [0.1, 0, 2.3])],
      legL: [K(0, [0, 0, 0.8]), K(0.25, [0, 0, 0.6]), K(0.5, [0, 0, 0.8])],
      legR: [K(0, [0, 0, 0.5]), K(0.25, [0, 0, 0.7]), K(0.5, [0, 0, 0.5])],
      robe: [K(0, [0, 0, -0.8])],
      earL: [K(0, [-0.5, 0.3, 0])], earR: [K(0, [0.5, -0.3, 0])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  // flat on his back. honestly this looks comfortable
  knockdown: {
    duration: 1.0, loop: true,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.5, [0, 0, 1.35], [0, 0.335, 0]), K(1.0, [0, 0, 1.35], [0, 0.32, 0])],
      legL: [K(0, [0, 0, 0.3])], legR: [K(0, [0, 0, 0.5])],
      torso: [K(0, [0, 0, 0.15])],
      head: [K(0, [0, 0, -0.15])],
      armL: [K(0, [0.9, 0, 0.4])], // mug held upright even in defeat
      armR: [K(0, [-1.0, 0, 0.3])],
      robe: [K(0, [0, 0, -0.4])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  getup: {
    duration: 0.8, loop: false,
    tracks: {
      hips: [K(0, [0, 0, 1.35], [0, 0.32, 0]), K(0.3, [0, 0, 0.5], [0, 0.48, 0]), K(0.6, [0, 0, 0.05], [0, 0.68, 0]), K(0.8, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.4, [0, 0, 0.55]), K(0.8, Z)],
      legR: [K(0, [0, 0, 0.5]), K(0.4, [0, 0, 0.25]), K(0.8, Z)],
      torso: [K(0, [0, 0, 0.15]), K(0.35, [0, 0, -0.3]), K(0.8, [0, 0, -0.1])],
      head: [K(0, [0, 0, -0.15]), K(0.6, [0, 0, 0.25]), K(0.8, [0, 0, 0.14])],
      armL: [K(0, [0.9, 0, 0.4]), K(0.4, [0.3, 0, 0.3]), K(0.8, [0, 0, 0.08])],
      armR: [K(0, [-1.0, 0, 0.3]), K(0.4, [-0.3, 0, -0.6]), K(0.8, [0, 0, 0.06])],
      robe: [K(0, [0, 0, -0.4]), K(0.5, [0, 0, 0.2]), K(0.8, Z)],
      mug: [K(0, Z), K(0.55, [0, 0, 0.25]), K(0.7, [0, 0, -0.15]), K(0.8, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  // shuffles in, checks an invisible watch, takes one long sip. unimpressed.
  entrance: {
    duration: 2.6, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.83, 0]), K(0.9, Z, [0, 0.83, 0]), K(1.0, Z, HIP), K(2.6, Z, HIP)],
      legL: [K(0, [0, 0, 0.3]), K(0.25, [0, 0, -0.3]), K(0.5, [0, 0, 0.3]), K(0.75, [0, 0, -0.3]), K(1.0, Z), K(2.6, Z)],
      legR: [K(0, [0, 0, -0.3]), K(0.25, [0, 0, 0.3]), K(0.5, [0, 0, -0.3]), K(0.75, [0, 0, 0.3]), K(1.0, Z), K(2.6, Z)],
      torso: [K(0, [0, 0, -0.16]), K(1.0, [0, 0, -0.1]), K(2.6, [0, 0, -0.1])],
      // checks watch (right wrist), unimpressed, then the sip
      armR: [K(0, [0, 0, 0.06]), K(1.1, [0, 0, 1.25]), K(1.7, [0, 0, 1.25]), K(1.9, [0, 0, 0.06]), K(2.6, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(1.1, [0, 0, 1.0]), K(1.7, [0, 0, 1.0]), K(1.9, Z), K(2.6, Z)],
      head: [K(0, [0, 0, 0.1]), K(1.1, [0, 0, -0.15]), K(1.7, [0, 0.2, -0.15]), K(1.95, [0, 0, 0.14]), K(2.1, [0, 0, 0.42]), K(2.45, [0, 0, 0.42]), K(2.6, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(2.0, [0, 0, 0.08]), K(2.15, [0.15, 0, 0.95]), K(2.45, [0.15, 0, 0.95]), K(2.6, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(2.15, [0, 0, 0.5]), K(2.45, [0, 0, 0.5]), K(2.6, Z)],
      mug: [K(0, Z), K(2.15, [0, 0, -0.4]), K(2.45, [0, 0, -0.4]), K(2.6, Z)],
      robe: [K(0, [0, 0, 0.1]), K(1.0, Z), K(2.6, Z)],
    },
  },

  // one (1) slow celebratory sip. maybe a nod. don't push it
  win: {
    duration: 2.6, loop: true,
    tracks: {
      hips: [K(0, Z, HIP), K(1.3, Z, [0, 0.84, 0]), K(2.6, Z, HIP)],
      armL: [K(0, [0, 0, 0.08]), K(0.4, [0.15, 0, 1.0]), K(1.6, [0.15, 0, 1.0]), K(2.0, [0, 0, 0.08]), K(2.6, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.4, [0, 0, 0.55]), K(1.6, [0, 0, 0.55]), K(2.0, Z), K(2.6, Z)],
      mug: [K(0, Z), K(0.4, [0, 0, -0.45]), K(1.6, [0, 0, -0.45]), K(2.0, Z), K(2.6, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.4, [0, 0, 0.5]), K(1.6, [0, 0, 0.5]), K(2.1, [0, 0, 0.05]), K(2.3, [0, 0, 0.2]), K(2.6, [0, 0, 0.14])],
      armR: [K(0, [0, 0, 0.06]), K(2.05, [0, 0, 0.5]), K(2.25, [0, 0, 0.5]), K(2.6, [0, 0, 0.06])], // half-hearted thumbs-up zone
      forearmR: [K(0, Z), K(2.05, [0, 0, 1.2]), K(2.25, [0, 0, 1.2]), K(2.6, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.4, [0, 0, 0.0]), K(1.6, [0, 0, 0.0]), K(2.6, [0, 0, -0.1])],
      robe: [K(0, Z), K(1.3, [0, 0, 0.06]), K(2.6, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
    },
  },

  // shrugs, gives up, sleeps standing. the market was a lie anyway
  lose: {
    duration: 2.2, loop: true,
    tracks: {
      hips: [K(0, Z, [0, 0.74, 0]), K(1.1, Z, [0, 0.725, 0]), K(2.2, Z, [0, 0.74, 0])],
      torso: [K(0, [0, 0, -0.45]), K(1.1, [0, 0, -0.5]), K(2.2, [0, 0, -0.45])],
      head: [K(0, [0, 0, -0.5]), K(1.1, [0, 0.05, -0.55]), K(2.2, [0, 0, -0.5])],
      armL: [K(0, [0, 0, 0.3])], armR: [K(0, [0, 0, 0.35])],
      forearmL: [K(0, [0, 0, -0.6])], forearmR: [K(0, [0, 0, 0.1])],
      mug: [K(0, [0, 0, 0.5])], // the coffee is gone. everything is gone
      legL: [K(0, [0, 0, 0.12])], legR: [K(0, [0, 0, 0.12])],
      earL: [K(0, [0.5, 0, 0])], earR: [K(0, [-0.5, 0, 0])],
      robe: [K(0, [0, 0, 0.15])],
    },
  },

  // the longest, loudest, rudest sip in recorded finance
  taunt: {
    duration: 1.6, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.25, [0.15, 0, 1.05]), K(1.25, [0.15, 0, 1.05]), K(1.6, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.25, [0, 0, 0.6]), K(1.25, [0, 0, 0.6]), K(1.6, Z)],
      mug: [K(0, Z), K(0.25, [0, 0, -0.5]), K(0.7, [0, 0, -0.6]), K(1.25, [0, 0, -0.5]), K(1.6, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.25, [0, 0, 0.55]), K(1.25, [0, 0, 0.6]), K(1.45, [0, -0.3, 0.1]), K(1.6, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.25, [0, 0, 0.02]), K(1.25, [0, 0, 0.02]), K(1.6, [0, 0, -0.1])],
      armR: [K(0, [0, 0, 0.06]), K(0.5, [-0.2, 0, 0.4]), K(1.25, [-0.2, 0, 0.4]), K(1.6, [0, 0, 0.06])],
      hips: [K(0, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmR: [K(0, Z)],
      earL: [K(0, Z), K(1.45, [0.3, 0.3, 0]), K(1.6, Z)],
      earR: [K(0, Z), K(1.45, [-0.3, -0.3, 0]), K(1.6, Z)],
    },
  },

  // ----------------------------------------------------------- move clips --
  // flicks the mug forward — coffee goes everywhere
  coffeeSplash: {
    duration: 0.4, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.1, [0.1, 0, 0.8]), K(0.18, [0, 0, 1.5]), K(0.4, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.1, [0, 0, 0.6]), K(0.18, [0, 0, -0.3]), K(0.4, Z)],
      mug: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.18, [0, 0, 0.9]), K(0.28, [0, 0, 0.4]), K(0.4, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.18, [0, 0.2, -0.02]), K(0.4, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.18, [0, 0, 0.05]), K(0.4, [0, 0, 0.14])],
      hips: [K(0, Z, HIP), K(0.18, [0, 0.15, 0], HIP), K(0.4, Z, HIP)],
      armR: [K(0, [0, 0, 0.06])],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmR: [K(0, Z)],
    },
  },

  // mug rockets skyward, coffee arcs, elbow follows. surprisingly explosive
  mugUppercut: {
    duration: 0.55, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.14, [0, 0, -0.12], [0, 0.6, 0]), K(0.24, [0, 0, 0.08], [0.08, 0.98, 0]), K(0.4, Z, [0.03, 0.9, 0]), K(0.55, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.14, [0, 0, -0.42]), K(0.24, [0, 0, 0.3]), K(0.55, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.14, [0, 0, -0.3]), K(0.24, [0, 0, 0.55]), K(0.55, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.14, [0.1, 0, -0.6]), K(0.24, [0.1, 0, 2.6]), K(0.4, [0.1, 0, 2.3]), K(0.55, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.14, [0, 0, 0.3]), K(0.24, [0, 0, -0.4]), K(0.55, Z)],
      mug: [K(0, Z), K(0.24, [0, 0, 0.8]), K(0.38, [0, 0, -0.3]), K(0.55, Z)],
      armR: [K(0, [0, 0, 0.06]), K(0.14, [-0.2, 0, -0.5]), K(0.24, [-0.3, 0, -1.0]), K(0.55, [0, 0, 0.06])],
      legL: [K(0, Z), K(0.24, [0, 0, -0.5]), K(0.55, Z)],
      legR: [K(0, Z), K(0.14, [0, 0, 0.25]), K(0.55, Z)],
      robe: [K(0, Z), K(0.24, [0, 0, -0.5]), K(0.55, Z)],
      forearmR: [K(0, Z)],
    },
  },

  // the arm drifts back like it's going to sleep... then SNAPS across the zip code
  lazyBackhand: {
    duration: 0.65, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.24, [0, 0.35, 1.6]), K(0.3, [0, 0.4, 1.7]), K(0.38, [0, -0.9, 1.9]), K(0.5, [0, -0.7, 1.6]), K(0.65, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.24, [0, 0, 0.7]), K(0.38, [0, 0, -0.1]), K(0.65, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.24, [0, -0.55, -0.05]), K(0.38, [0, 0.65, -0.15]), K(0.5, [0, 0.5, -0.12]), K(0.65, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.24, [0, -0.3, 0], HIP), K(0.38, [0, 0.35, 0], [0.1, 0.83, 0]), K(0.65, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.24, [0, -0.3, 0.05]), K(0.38, [0, 0.25, 0.05]), K(0.65, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.38, [0.2, 0, 0.4]), K(0.65, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.38, [0, 0, -0.3]), K(0.65, Z)],
      legR: [K(0, Z), K(0.38, [0, 0, 0.25]), K(0.65, Z)],
      robe: [K(0, Z), K(0.38, [0.3, 0, 0.2]), K(0.65, Z)],
      mug: [K(0, Z), K(0.4, [0, 0, 0.3]), K(0.65, Z)],
      forearmL: [K(0, Z)],
    },
  },

  // two-hand office-chair shove. ergonomics as a weapon
  chairShove: {
    duration: 0.65, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.16, [0, 0, -0.5]), K(0.28, [-0.15, 0, 1.5]), K(0.45, [-0.15, 0, 1.4]), K(0.65, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.16, [0, 0, 0.4]), K(0.28, [0, 0, 0.2]), K(0.65, Z)],
      armL: [K(0, [0, 0, 0.08]), K(0.16, [0, 0, -0.4]), K(0.28, [0.15, 0, 1.4]), K(0.45, [0.15, 0, 1.3]), K(0.65, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.28, [0, 0, -0.5]), K(0.65, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.16, [0, 0, -0.3]), K(0.28, [0, 0, 0.1]), K(0.65, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.16, Z, [-0.05, 0.82, 0]), K(0.28, Z, [0.12, 0.85, 0]), K(0.65, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.28, [0, 0, 0.02]), K(0.65, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.28, [0, 0, 0.4]), K(0.65, Z)],
      legR: [K(0, Z), K(0.28, [0, 0, -0.35]), K(0.65, Z)],
      robe: [K(0, Z), K(0.28, [0, 0, -0.3]), K(0.65, Z)],
      mug: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.65, Z)],
    },
  },

  // foot flick — the slipper does the actual work
  slipperKick: {
    duration: 0.5, loop: false,
    tracks: {
      legR: [K(0, Z), K(0.1, [0, 0, -0.5]), K(0.2, [0, 0, 1.5]), K(0.32, [0, 0, 1.2]), K(0.5, Z)],
      hips: [K(0, Z, HIP), K(0.2, [0, 0, 0.1], [0, 0.87, 0]), K(0.5, Z, HIP)],
      torso: [K(0, [0, 0, -0.1]), K(0.2, [0, 0, 0.12]), K(0.5, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, 0.05]), K(0.5, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.2, [0.2, 0, 0.5]), K(0.5, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.2, [-0.3, 0, -0.7]), K(0.5, [0, 0, 0.06])],
      legL: [K(0, Z)],
      robe: [K(0, Z), K(0.2, [0, 0, -0.45]), K(0.5, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
    },
  },

  // an enormous, weaponized yawn. arms stretch. jaw unhinges. crowd disgusted
  yawnStun: {
    duration: 0.55, loop: false,
    tracks: {
      head: [K(0, [0, 0, 0.14]), K(0.15, [0, 0, 0.7]), K(0.38, [0, 0, 0.75]), K(0.55, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.15, [0, 0, 0.12]), K(0.38, [0, 0, 0.12]), K(0.55, [0, 0, -0.1])],
      armL: [K(0, [0, 0, 0.08]), K(0.15, [0.5, 0, 1.8]), K(0.38, [0.5, 0, 1.9]), K(0.55, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.15, [-0.5, 0, 1.8]), K(0.38, [-0.5, 0, 1.9]), K(0.55, [0, 0, 0.06])],
      forearmL: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.55, Z)],
      forearmR: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.55, Z)],
      hips: [K(0, Z, HIP), K(0.25, Z, [0, 0.87, 0]), K(0.55, Z, HIP)],
      earL: [K(0, Z), K(0.25, [0.4, 0.3, 0]), K(0.55, Z)],
      earR: [K(0, Z), K(0.25, [-0.4, -0.3, 0]), K(0.55, Z)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z)],
    },
  },

  // low spin — the robe hem is the hitbox
  robeSpin: {
    duration: 0.65, loop: false,
    tracks: {
      hips: [K(0, Z, [0, 0.6, 0]), K(0.14, [0, 1.6, 0], [0, 0.56, 0]), K(0.28, [0, 3.6, 0], [0, 0.56, 0]), K(0.42, [0, 5.6, 0], [0, 0.58, 0]), K(0.52, [0, 6.28, 0], [0, 0.62, 0]), K(0.65, [0, 6.28, 0], HIP)],
      legL: [K(0, [-0.4, 0, 0.7]), K(0.52, [-0.4, 0, 0.7]), K(0.65, Z)],
      legR: [K(0, [0.4, 0, 0.7]), K(0.52, [0.4, 0, 0.7]), K(0.65, Z)],
      torso: [K(0, [0, 0, -0.3]), K(0.52, [0, 0, -0.3]), K(0.65, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.3]), K(0.65, [0, 0, 0.14])],
      armL: [K(0, [0.9, 0, 0.4]), K(0.52, [0.9, 0, 0.4]), K(0.65, [0, 0, 0.08])],
      armR: [K(0, [-0.9, 0, 0.4]), K(0.52, [-0.9, 0, 0.4]), K(0.65, [0, 0, 0.06])],
      robe: [K(0, [0.3, 0, 0.4]), K(0.26, [-0.3, 0, 0.4]), K(0.52, [0.3, 0, 0.4]), K(0.65, Z)],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
      mug: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.65, Z)],
    },
  },

  // eyes closed, arms out, shuffling. do not wake him mid-dodge
  sleepwalk: {
    duration: 0.5, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.1, [0, 0, 1.4]), K(0.4, [0, 0, 1.4]), K(0.5, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.1, [0, 0, 1.4]), K(0.4, [0, 0, 1.4]), K(0.5, [0, 0, 0.06])],
      forearmL: [K(0, Z)], forearmR: [K(0, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.1, [0, 0, -0.35]), K(0.4, [0, 0, -0.35]), K(0.5, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.1, [0, 0, 0.05]), K(0.5, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.15, [0, 0.05, 0], [0, 0.82, 0]), K(0.3, [0, -0.05, 0], [0, 0.82, 0]), K(0.5, Z, HIP)],
      legL: [K(0, Z), K(0.15, [0, 0, -0.3]), K(0.3, [0, 0, 0.3]), K(0.5, Z)],
      legR: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.3, [0, 0, -0.3]), K(0.5, Z)],
      robe: [K(0, Z), K(0.25, [0, 0, 0.3]), K(0.5, Z)],
      mug: [K(0, Z)],
    },
  },

  // extends a hand for the world's most sincere, most crushing handshake
  firmHandshake: {
    duration: 0.85, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.12, [0, 0, 1.35]), K(0.3, [0, 0, 1.35]), K(0.38, [0, 0, 1.15]), K(0.46, [0, 0, 1.45]), K(0.54, [0, 0, 1.15]), K(0.64, [0, 0, -0.7]), K(0.85, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.12, [0, 0, 0.3]), K(0.64, [0, 0, 0.1]), K(0.85, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.12, [0, 0, -0.2]), K(0.54, [0, 0, -0.2]), K(0.64, [0, 0, -0.55]), K(0.85, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.12, Z, [0.04, 0.83, 0]), K(0.64, [0, 0, -0.05], [0.08, 0.72, 0]), K(0.85, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.3, [0, 0, 0.05]), K(0.64, [0, 0, -0.2]), K(0.85, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.4, [0.2, 0, 0.3]), K(0.85, [0, 0, 0.08])],
      legL: [K(0, Z), K(0.64, [0, 0, 0.3]), K(0.85, Z)],
      legR: [K(0, Z), K(0.64, [0, 0, -0.25]), K(0.85, Z)],
      robe: [K(0, Z), K(0.64, [0, 0, 0.3]), K(0.85, Z)],
      forearmL: [K(0, Z)],
      mug: [K(0, Z), K(0.66, [0, 0, 0.5]), K(0.85, Z)],
    },
  },

  // lifts the foe like a bad quarterly report and files them. into the floor
  hrViolation: {
    duration: 0.85, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.15, [0, 0, 1.2]), K(0.35, [-0.3, 0, 2.6]), K(0.5, [-0.3, 0, 2.6]), K(0.6, [0, 0, -0.6]), K(0.85, [0, 0, 0.06])],
      armL: [K(0, [0, 0, 0.08]), K(0.15, [0, 0, 1.1]), K(0.35, [0.3, 0, 2.5]), K(0.5, [0.3, 0, 2.5]), K(0.6, [0, 0, -0.5]), K(0.85, [0, 0, 0.08])],
      forearmR: [K(0, Z), K(0.35, [0, 0, 0.2]), K(0.85, Z)],
      forearmL: [K(0, Z), K(0.35, [0, 0, 0.2]), K(0.85, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.35, [0, 0, 0.25]), K(0.5, [0, 0, 0.25]), K(0.6, [0, 0, -0.6]), K(0.85, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.35, Z, [0, 0.9, 0]), K(0.6, [0, 0, -0.05], [0.05, 0.62, 0]), K(0.85, Z, HIP)],
      head: [K(0, [0, 0, 0.14]), K(0.35, [0, 0, 0.4]), K(0.6, [0, 0, -0.25]), K(0.85, [0, 0, 0.14])],
      legL: [K(0, Z), K(0.6, [-0.3, 0, 0.6]), K(0.85, Z)],
      legR: [K(0, Z), K(0.6, [0.3, 0, 0.6]), K(0.85, Z)],
      robe: [K(0, Z), K(0.4, [0, 0, -0.4]), K(0.62, [0, 0, 0.5]), K(0.85, Z)],
      mug: [K(0, Z), K(0.62, [0, 0, 0.6]), K(0.85, Z)],
    },
  },

  // underhand-tosses bundles of investor cash with zero enthusiasm
  capital: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.15, [0, 0, -0.7]), K(0.3, [0, 0, 1.6]), K(0.45, [0, 0, -0.7]), K(0.6, [0, 0, 1.6]), K(0.75, [0, 0, -0.7]), K(0.9, [0, 0, 1.6]), K(1.1, [0, 0, 0.5]), K(1.3, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.3, [0, 0, 0.4]), K(0.6, [0, 0, 0.4]), K(0.9, [0, 0, 0.4]), K(1.3, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.3, [0, 0.15, 0]), K(0.6, [0, 0.15, 0]), K(0.9, [0, 0.15, 0]), K(1.3, [0, 0, -0.1])],
      head: [K(0, [0, 0, 0.14]), K(0.3, [0, 0, 0.05]), K(1.0, [0, 0, 0.05]), K(1.3, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(0.3, [0.2, 0, 0.4]), K(1.0, [0.2, 0, 0.4]), K(1.3, [0, 0, 0.08])],
      hips: [K(0, Z, HIP), K(0.3, [0, 0.1, 0], HIP), K(0.9, [0, 0.1, 0], HIP), K(1.3, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z), K(0.5, [0, 0, 0.1]), K(1.3, Z)],
      forearmL: [K(0, Z)], mug: [K(0, Z)],
    },
  },

  // snaps fingers once, points vaguely, sips. delegation complete
  delegate: {
    duration: 1.3, loop: false,
    tracks: {
      armR: [K(0, [0, 0, 0.06]), K(0.2, [0, 0, 1.5]), K(0.35, [0, 0, 1.5]), K(0.5, [0, 0.3, 1.3]), K(0.9, [0, 0.3, 1.3]), K(1.3, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.2, [0, 0, 0.9]), K(0.35, [0, 0, 0.4]), K(0.5, [0, 0, 0.1]), K(1.3, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.35, [0, 0.15, 0.05]), K(0.9, [0, 0.15, 0.05]), K(1.3, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.35, [0, 0.15, -0.05]), K(0.9, [0, 0.15, -0.05]), K(1.3, [0, 0, -0.1])],
      armL: [K(0, [0, 0, 0.08]), K(0.8, [0, 0, 0.08]), K(0.95, [0.15, 0, 0.95]), K(1.2, [0.15, 0, 0.95]), K(1.3, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.95, [0, 0, 0.5]), K(1.2, [0, 0, 0.5]), K(1.3, Z)],
      mug: [K(0, Z), K(0.95, [0, 0, -0.4]), K(1.2, [0, 0, -0.4]), K(1.3, Z)],
      hips: [K(0, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z)],
    },
  },

  // the sip of ultimate indifference. armor via apathy
  sip: {
    duration: 0.9, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.2, [0.15, 0, 1.05]), K(0.7, [0.15, 0, 1.05]), K(0.9, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(0.2, [0, 0, 0.6]), K(0.7, [0, 0, 0.6]), K(0.9, Z)],
      mug: [K(0, Z), K(0.2, [0, 0, -0.55]), K(0.7, [0, 0, -0.55]), K(0.9, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, 0.5]), K(0.7, [0, 0, 0.55]), K(0.9, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.2, [0, 0, 0.0]), K(0.7, [0, 0, 0.0]), K(0.9, [0, 0, -0.1])],
      armR: [K(0, [0, 0, 0.06]), K(0.3, [-0.15, 0, 0.3]), K(0.9, [0, 0, 0.06])],
      hips: [K(0, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      forearmR: [K(0, Z)], robe: [K(0, Z)],
    },
  },

  // both arms rise in weary summons. the furniture answers
  meeting: {
    duration: 1.3, loop: false,
    tracks: {
      armL: [K(0, [0, 0, 0.08]), K(0.35, [-0.3, 0, 2.6]), K(0.9, [-0.3, 0, 2.7]), K(1.1, [0, 0, 0.5]), K(1.3, [0, 0, 0.08])],
      armR: [K(0, [0, 0, 0.06]), K(0.35, [0.3, 0, 2.6]), K(0.9, [0.3, 0, 2.7]), K(1.1, [0, 0, 0.5]), K(1.3, [0, 0, 0.06])],
      forearmL: [K(0, Z), K(0.35, [0, 0, 0.2]), K(1.3, Z)],
      forearmR: [K(0, Z), K(0.35, [0, 0, 0.2]), K(1.3, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.35, [0, 0, 0.55]), K(0.9, [0, 0, 0.6]), K(1.05, [0, 0, -0.2]), K(1.3, [0, 0, 0.14])],
      torso: [K(0, [0, 0, -0.1]), K(0.35, [0, 0, 0.15]), K(0.9, [0, 0, 0.15]), K(1.05, [0, 0, -0.3]), K(1.3, [0, 0, -0.1])],
      hips: [K(0, Z, HIP), K(0.35, Z, [0, 0.88, 0]), K(1.05, Z, [0, 0.8, 0]), K(1.3, Z, HIP)],
      legL: [K(0, Z)], legR: [K(0, Z)],
      robe: [K(0, Z), K(0.5, [0, 0, -0.2]), K(1.1, [0, 0, 0.3]), K(1.3, Z)],
      mug: [K(0, Z), K(0.4, [0, 0, 0.5]), K(1.3, Z)],
      earL: [K(0, Z), K(0.9, [0.3, 0.2, 0]), K(1.3, Z)],
      earR: [K(0, Z), K(0.9, [-0.3, -0.2, 0]), K(1.3, Z)],
    },
  },

  // sets down a tiny sign, then powers off completely
  ooo: {
    duration: 1.1, loop: false,
    tracks: {
      torso: [K(0, [0, 0, -0.1]), K(0.2, [0, 0, -0.55]), K(0.4, [0, 0, -0.1]), K(0.7, [0, 0, -0.35]), K(1.1, [0, 0, -0.35])],
      armR: [K(0, [0, 0, 0.06]), K(0.2, [0, 0, 1.3]), K(0.35, [0, 0, 0.2]), K(1.1, [0, 0, 0.3])],
      forearmR: [K(0, Z), K(0.2, [0, 0, 0.5]), K(0.4, Z), K(1.1, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.2, [0, 0, -0.3]), K(0.5, [0, 0, 0.1]), K(0.8, [0, 0, -0.55]), K(1.1, [0, 0, -0.55])],
      hips: [K(0, Z, HIP), K(0.2, Z, [0.03, 0.72, 0]), K(0.4, Z, HIP), K(0.8, Z, [0, 0.8, 0]), K(1.1, Z, [0, 0.8, 0])],
      armL: [K(0, [0, 0, 0.08]), K(0.8, [0.3, 0, 0.4]), K(1.1, [0.3, 0, 0.4])],
      legL: [K(0, Z), K(0.8, [0, 0, 0.1]), K(1.1, [0, 0, 0.1])],
      legR: [K(0, Z), K(0.8, [0, 0, 0.1]), K(1.1, [0, 0, 0.1])],
      earL: [K(0, Z), K(0.9, [0.5, 0, 0]), K(1.1, [0.5, 0, 0])],
      earR: [K(0, Z), K(0.9, [-0.5, 0, 0]), K(1.1, [-0.5, 0, 0])],
      robe: [K(0, Z)], forearmL: [K(0, Z)], mug: [K(0, Z)],
    },
  },

  // finisher: amble to the desk, one finger, press. the machine does the rest
  rebalance: {
    duration: 2.4, loop: false,
    tracks: {
      hips: [K(0, Z, HIP), K(0.3, Z, [0, 0.83, 0]), K(0.5, Z, HIP), K(0.7, Z, [0.05, 0.7, 0]), K(1.0, Z, [0.05, 0.7, 0]), K(1.2, Z, HIP), K(2.4, Z, HIP)],
      legL: [K(0, Z), K(0.15, [0, 0, 0.3]), K(0.3, [0, 0, -0.3]), K(0.5, Z), K(0.7, [-0.3, 0, 0.5]), K(1.0, [-0.3, 0, 0.5]), K(1.2, Z), K(2.4, Z)],
      legR: [K(0, Z), K(0.15, [0, 0, -0.3]), K(0.3, [0, 0, 0.3]), K(0.5, Z), K(0.7, [0.3, 0, 0.5]), K(1.0, [0.3, 0, 0.5]), K(1.2, Z), K(2.4, Z)],
      torso: [K(0, [0, 0, -0.1]), K(0.7, [0, 0, -0.45]), K(1.0, [0, 0, -0.45]), K(1.2, [0, 0, -0.05]), K(2.4, [0, 0, -0.1])],
      armR: [K(0, [0, 0, 0.06]), K(0.6, [0, 0, 1.1]), K(0.8, [0, 0, 0.75]), K(0.9, [0, 0, 0.95]), K(1.2, [0, 0, 0.06]), K(2.4, [0, 0, 0.06])],
      forearmR: [K(0, Z), K(0.6, [0, 0, 0.6]), K(0.8, [0, 0, 0.3]), K(1.2, Z), K(2.4, Z)],
      head: [K(0, [0, 0, 0.14]), K(0.7, [0, 0, -0.25]), K(1.0, [0, 0, -0.25]), K(1.3, [0, 0.2, 0.3]), K(1.8, [0, 0.25, 0.35]), K(2.1, [0, -0.2, 0.2]), K(2.4, [0, 0, 0.14])],
      armL: [K(0, [0, 0, 0.08]), K(1.4, [0.15, 0, 1.0]), K(2.1, [0.15, 0, 1.0]), K(2.4, [0, 0, 0.08])],
      forearmL: [K(0, Z), K(1.4, [0, 0, 0.55]), K(2.1, [0, 0, 0.55]), K(2.4, Z)],
      mug: [K(0, Z), K(1.4, [0, 0, -0.45]), K(2.1, [0, 0, -0.45]), K(2.4, Z)],
      robe: [K(0, Z), K(0.4, [0, 0, 0.1]), K(1.2, Z), K(2.4, Z)],
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

function arenaBounds(fx) {
  let minX = -8.5, maxX = 8.5
  try {
    const b = fx.arena()?.bounds
    if (b) { minX = b.minX; maxX = b.maxX }
  } catch { /* arena optional */ }
  return { minX, maxX }
}

function clampToArena(fx, x) {
  const b = arenaBounds(fx)
  return Math.max(b.minX + 0.8, Math.min(b.maxX - 0.8, x))
}

// world root (the scene) via the fighter's bone chain — robust to arena layout
function worldOf(fx) {
  try {
    let o = fx.self?.bones?.hips
    while (o && o.parent) o = o.parent
    return o || null
  } catch { return null }
}

// idempotent removal + disposal of a custom cinematic group
function scrap(obj) {
  if (!obj) return
  try {
    obj.parent?.remove(obj)
    obj.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) { m?.map?.dispose?.(); m?.dispose?.() }
      }
    })
  } catch { /* already gone */ }
}

// low-poly label sign on a post; MeshBasic map = fake glow
function makeSign(text, bg, fg) {
  const g = new THREE.Group()
  const tex = labelTex(text, { w: 256, h: 96, size: text.length > 8 ? 34 : 48, bg, fg })
  const faceM = tex
    ? new THREE.MeshBasicMaterial({ map: tex })
    : new THREE.MeshBasicMaterial({ color: 0xffe28a })
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 1.9), lamb(0x2a2a33))
  board.position.y = 2.2
  g.add(board)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.62), faceM)
  face.position.set(0.065, 2.2, 0)
  face.rotation.y = Math.PI / 2
  g.add(face)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.62), faceM)
  back.position.set(-0.065, 2.2, 0)
  back.rotation.y = -Math.PI / 2
  g.add(back)
  g.add(cyl(0.05, 0.06, 1.9, lamb(C.steel), 0, 0.95, 0))
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// panicked low-poly assistant (briefcase, tie, deep regret)
function makeAssistant() {
  const g = new THREE.Group()
  const body = new THREE.Group()
  body.add(box(0.3, 0.42, 0.34, lamb(C.suitShirt), 0, 1.0, 0))
  body.add(box(0.06, 0.24, 0.1, lamb(C.tie), 0.16, 1.02, 0))
  body.add(sph(0.14, lamb(C.skin), 0.02, 1.36, 0))
  body.add(box(0.14, 0.05, 0.24, lamb(0x4a3626), -0.03, 1.47, 0)) // hair
  g.add(body)
  g.userData.body = body
  for (const side of [1, -1]) {
    const leg = pivot(g, 0, 0.78, 0.09 * side)
    leg.add(box(0.12, 0.42, 0.12, lamb(C.suitPants), 0, -0.22, 0))
    leg.add(box(0.2, 0.08, 0.12, lamb(0x1c1c22), 0.04, -0.42, 0))
    g.userData[side === 1 ? 'legA' : 'legB'] = leg
    const arm = pivot(body, 0, 1.16, 0.19 * side)
    arm.add(box(0.09, 0.34, 0.09, lamb(C.suitShirt), 0, -0.16, 0))
    g.userData[side === 1 ? 'armA' : 'armB'] = arm
    if (side === -1) arm.add(box(0.3, 0.22, 0.08, lamb(0x6b4423), 0.02, -0.4, 0)) // briefcase
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// ---------------------------------------------------------------------------
// move scripts
// ---------------------------------------------------------------------------
function coffeeSplashScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('whoosh', { pitch: 1.35 })
  fx.after(9, () => {
    const px = fx.self.pos.x + F * 0.9
    fx.particles('smoke', v3(px, 1.3, 0), { n: 7 })
    // brown droplets: two tiny short-lived boxes flung in an arc
    for (let i = 0; i < 2; i++) {
      const p = fx.spawnProp('box', v3(px, 1.35 + i * 0.12, (i - 0.5) * 0.2), { mass: 0.08 })
      if (p) {
        try {
          p.mesh?.scale?.set(0.28, 0.22, 0.28)
          p.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(C.coffee) })
          fx.impulse(p, [F * (4 + i * 2), 2.5, (i - 0.5) * 1.5], 4)
        } catch { /* prop cosmetics only */ }
        fx.after(50, () => { try { p.remove?.() } catch { /* gone */ } })
      }
    }
  })
  fx.after(11, () => {
    if (inRange(fx, 1.7)) {
      fx.sfx('punch_light', { pitch: 0.85 })
      fx.particles('impact', v3(fx.foe.pos.x, 1.3, 0), { n: 6 })
      fx.hit({ damage: 7, knockback: { x: 4.5, y: 1 }, hitStun: 16 })
    }
  })
  fx.after(24, end)
}

function mugUppercutScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.sfx('whoosh', { pitch: 0.8 })
  fx.after(10, () => {
    // the coffee arc — a lazy brown rainbow
    for (let i = 0; i < 3; i++) {
      fx.after(i * 2, () => fx.particles('smoke', v3(fx.self.pos.x + F * (0.5 + i * 0.25), 1.5 + i * 0.5, 0), { n: 3 }))
    }
    if (inRange(fx, 1.8)) {
      fx.sfx('launch')
      fx.shake(0.4)
      fx.particles('sparks', v3(fx.foe.pos.x, 1.4, 0), { n: 10 })
      fx.hit({ damage: 11, knockback: { x: 2, y: 10.5, spin: 1.5 }, hitStun: 28, ragdoll: 1 })
      fx.caption('DECAF? NEVER.')
    }
  })
  fx.after(32, end)
}

function slipperKickScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const slip = fx.self.bones?.legR?.userData?.slipper || null
  let prop = null
  const restore = () => { try { if (slip) slip.visible = true } catch { /* mesh */ } }
  fx.sfx('kick')
  fx.after(7, () => {
    try { if (slip) slip.visible = false } catch { /* mesh */ }
    prop = fx.spawnProp('box', v3(fx.self.pos.x + F * 0.7, 0.5, 0), { mass: 0.25 })
    if (prop) {
      try {
        prop.mesh?.scale?.set(0.5, 0.25, 0.35)
        prop.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(C.slipper) })
        fx.impulse(prop, [F * 10, 3.5, 0], 8)
      } catch { /* cosmetics */ }
    }
  })
  fx.after(10, () => {
    if (inRange(fx, 2.4)) {
      fx.sfx('boing')
      fx.particles('impact', v3(fx.foe.pos.x, 1.0, 0), { n: 8 })
      fx.hit({ damage: 10, knockback: { x: 8, y: 2.5, spin: 0.8 }, hitStun: 18 })
    }
  })
  fx.after(19, () => { // the slipper boomerangs home
    if (prop) { try { fx.impulse(prop, [-F * 9, 4, 0], 6) } catch { /* gone */ } }
    fx.sfx('whoosh', { pitch: 1.5 })
  })
  fx.after(29, () => {
    if (prop) { try { prop.remove?.() } catch { /* gone */ } }
    restore()
  })
  fx.after(60, restore) // failsafe: the ape never fights half-shod
  fx.after(30, end)
}

function chairShoveScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  let chair = null
  fx.after(9, () => {
    chair = fx.spawnProp('chair', v3(clampToArena(fx, fx.self.pos.x + F * 0.9), 0.5, 0))
    fx.sfx('slide')
    fx.particles('smoke', v3(fx.self.pos.x + F * 0.8, 0.3, 0), { n: 4 })
  })
  fx.after(14, () => {
    if (chair) { try { fx.impulse(chair, [F * 11, 1.5, 0], 3) } catch { /* gone */ } }
    if (inRange(fx, 2.7)) {
      fx.sfx('thud')
      fx.shake(0.4)
      fx.particles('impact', v3(fx.foe.pos.x, 0.9, 0), { n: 9 })
      fx.hit({ damage: 14, knockback: { x: 9.5, y: 3, spin: 1 }, hitStun: 24, ragdoll: 1 })
      fx.caption('PLEASE, HAVE A SEAT')
    }
  })
  fx.after(40, end)
}

function yawnStunScript(fx) {
  const end = onceEnd(fx)
  fx.sfx('whoosh', { pitch: 0.45 })
  fx.after(13, () => {
    fx.particles('smoke', v3(fx.self.pos.x + fx.self.facing * 0.6, 1.7, 0), { n: 5 })
    if (inRange(fx, 1.3)) {
      fx.sfx('menu_back', { pitch: 0.6 })
      fx.particles('stars', v3(fx.foe.pos.x, 1.9, 0), { n: 8 })
      fx.hit({ damage: 4, knockback: { x: 0.5, y: 0 }, hitStun: 55 })
      fx.caption('CONTAGIOUS YAWN')
    }
  })
  fx.after(34, end)
}

function sleepwalkScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  try { fx.self.invuln = Math.max(fx.self.invuln || 0, 22) } catch { /* engine field */ }
  fx.sfx('whoosh', { pitch: 0.6 })
  for (let i = 0; i < 3; i++) {
    fx.after(3 + i * 5, () => {
      fx.impulse(fx.self, [-F * 4.5, 0, 0])
      fx.particles('smoke', v3(fx.self.pos.x + F * 0.4, 0.4, 0), { n: 3 })
    })
  }
  fx.after(18, () => fx.particles('stars', v3(fx.self.pos.x, 2.0, 0), { n: 3 }))
  fx.after(30, end)
}

function perMyLastEmailScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  fx.after(11, () => {
    // the world-weariest backhand in finance, cc: everyone
    fx.sfx('menu_back', { pitch: 0.8 })
    fx.particles('dust', v3(fx.self.pos.x + F * 1.0, 1.3, 0), { n: 8 })
    if (inRange(fx, 2.9)) {
      fx.sfx('punch_heavy', { pitch: 0.9 })
      fx.shake(0.5)
      fx.hit({ damage: 13, knockback: { x: 11.5, y: 4, spin: 1.4 }, hitStun: 27, ragdoll: 1 })
      fx.caption('PER MY LAST EMAIL.')
    } else {
      fx.caption('MOVING THIS TO NEXT SPRINT')
    }
  })
  fx.after(40, end)
}

function capitalAllocationScript(fx) {
  const end = onceEnd(fx)
  fx.caption('CAPITAL ALLOCATION')
  fx.announcer('CAPITAL ALLOCATION')
  fx.sfx('bell')
  fx.after(8, () => {
    if (!inRange(fx, 20)) return
    fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 80 }) // pinned under due diligence
    fx.sfx('coin')
  })
  // 8 bundles of investor money, dropped directly onto the foe. buried alive. in cash
  for (let i = 0; i < 8; i++) {
    fx.after(12 + i * 4, () => {
      const bx = clampToArena(fx, fx.foe.pos.x + (Math.random() - 0.5) * 0.9)
      const p = fx.spawnProp('box', v3(bx, 3.3 + (i % 3) * 0.5, (Math.random() - 0.5) * 0.6), { mass: 0.5 })
      if (p) {
        try {
          p.mesh?.scale?.set(0.9, 0.5, 0.6)
          p.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(0x4f9e5f) })
          fx.impulse(p, [0, -7, 0], 1)
        } catch { /* cosmetics */ }
      }
      if (i % 2 === 0) fx.sfx('thud', { pitch: 1.1 + i * 0.06 })
    })
  }
  fx.after(30, () => {
    fx.shake(0.5)
    if (inRange(fx, 20)) fx.hit({ damage: 6, knockback: { x: 0, y: 0 }, hitStun: 50 })
  })
  fx.after(50, () => {
    fx.sfx('coins_burst')
    fx.shake(0.7)
    fx.coins(v3(fx.foe.pos.x, 1.6, 0), 14)
    if (inRange(fx, 20)) {
      fx.hit({ damage: 10, knockback: { x: 3, y: 5.5, spin: 1.2 }, hitStun: 30, ragdoll: 1 })
      fx.caption('FULLY DIVERSIFIED')
    }
  })
  fx.after(78, end)
}

function executiveAssistantScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const world = worldOf(fx)
  fx.caption('EXECUTIVE ASSISTANT')
  fx.announcer('SEND IN THE INTERN')
  fx.sfx('menu_confirm')
  if (!world) {
    // visuals unavailable: still delegate the damage
    fx.after(24, () => {
      if (inRange(fx, 3.2)) {
        fx.sfx('punch_heavy')
        fx.hit({ damage: 20, knockback: { x: 12, y: 6, spin: 2 }, hitStun: 40, ragdoll: 2 })
      }
    })
    fx.after(60, end)
    return
  }
  const b = arenaBounds(fx)
  const guy = makeAssistant()
  const startX = F > 0 ? b.minX - 1.2 : b.maxX + 1.2
  guy.position.set(startX, 0, 0)
  guy.rotation.y = F > 0 ? 0 : Math.PI
  let added = false
  let tackled = false
  let tumble = 0
  const cleanup = () => scrap(guy)
  fx.after(8, () => { try { world.add(guy); added = true; fx.sfx('whoosh', { pitch: 1.4 }) } catch { /* scene */ } })
  fx.frame((age) => {
    if (!added) return
    try {
      guy.position.x += F * 0.3
      guy.position.y = Math.abs(Math.sin(age * 0.55)) * 0.12
      const swing = Math.sin(age * 0.55) * 0.9
      if (guy.userData.legA) guy.userData.legA.rotation.z = swing
      if (guy.userData.legB) guy.userData.legB.rotation.z = -swing
      if (guy.userData.armA) guy.userData.armA.rotation.z = 2.6 + Math.sin(age * 0.7) * 0.3 // arms flailing overhead
      if (guy.userData.armB) guy.userData.armB.rotation.z = 2.6 - Math.sin(age * 0.7) * 0.3
      if (guy.userData.body) guy.userData.body.rotation.z = -F * 0.35
      if (age % 6 === 0) fx.particles('smoke', v3(guy.position.x - F * 0.5, 0.2, 0), { n: 2 })
      if (tackled) {
        tumble += 0.3
        guy.rotation.z = -F * tumble
      } else if (fx.foe && Math.abs(guy.position.x - fx.foe.pos.x) < 0.95) {
        tackled = true
        fx.sfx('punch_heavy')
        fx.shake(0.9)
        fx.slowmo(0.4, 0.4)
        fx.zoom(fx.foe, 0.5)
        fx.particles('confetti', v3(guy.position.x, 1.4, 0), { n: 20 }) // paperwork everywhere
        fx.hit({ damage: 20, knockback: { x: 13, y: 6, spin: 2.5 }, hitStun: 40, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 11, 7, 0])
        fx.caption('SORRY!! SO SORRY!!')
      }
      if (Math.abs(guy.position.x) > Math.max(Math.abs(b.minX), Math.abs(b.maxX)) + 2.5) cleanup()
    } catch { cleanup() }
  })
  fx.after(82, cleanup)
  fx.after(170, cleanup) // failsafe: the intern always goes home
  fx.after(84, end)
}

function marketIndifferenceScript(fx) {
  const end = onceEnd(fx)
  fx.caption('MARKET INDIFFERENCE')
  fx.sfx('slide', { pitch: 0.5 })
  fx.after(12, () => {
    try { fx.self.armorFrames = 240 } catch { /* engine field */ } // 4 seconds of apathy armor
    fx.caption('HE DOES NOT CARE')
    fx.announcer('HE DOES NOT CARE')
    fx.sfx('bell', { pitch: 0.6 })
    fx.particles('stars', v3(fx.self.pos.x, 2.1, 0), { n: 6 })
  })
  // steam curls off the mug for the duration of the buff
  for (let i = 0; i < 8; i++) {
    fx.after(20 + i * 28, () => {
      try { fx.particles('smoke', v3(fx.self.pos.x + fx.self.facing * 0.5, 1.5, 0.2), { n: 3 }) } catch { /* fighter gone */ }
    })
  }
  fx.after(54, end)
}

function meetingEmailScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const world = worldOf(fx)
  fx.slowmo(0.5, 0.6)
  fx.zoom(fx.self, 0.6)
  fx.caption('MEETING THAT SHOULD HAVE BEEN AN EMAIL')
  fx.announcer('MANDATORY ATTENDANCE')
  fx.sfx('bell')
  const tx = clampToArena(fx, fx.foe.pos.x)
  fx.after(6, () => { if (inRange(fx, 20)) fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 70 }) })
  if (!world) {
    fx.after(26, () => {
      fx.shake(1.2)
      fx.sfx('explosion')
      if (Math.abs(fx.foe.pos.x - tx) < 3.4) {
        fx.hit({ damage: 34, knockback: { x: 9, y: 7, spin: 3 }, hitStun: 50, ragdoll: 2 })
        fx.caption('THIS MEETING IS OVER')
      }
    })
    fx.after(78, end)
    return
  }
  // THE TABLE. conference-grade. load-bearing agenda included
  const table = new THREE.Group()
  table.add(box(5.6, 0.35, 2.6, lamb(C.wood), 0, 0, 0))
  table.add(box(0.6, 0.04, 0.42, lamb(C.paper), 1.2, 0.2, 0.3, 0, 0.4)) // the agenda
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    table.add(cyl(0.09, 0.11, 1.0, lamb(C.steel), sx * 2.4, -0.65, sz * 1.0))
  }
  table.traverse((o) => { if (o.isMesh) o.castShadow = true })
  table.position.set(tx, 9.5, 0)
  let falling = false
  let landed = false
  const cleanup = () => scrap(table)
  fx.after(10, () => {
    try { world.add(table); falling = true; fx.sfx('whoosh', { pitch: 0.5 }) } catch { /* scene */ }
  })
  fx.frame(() => {
    if (!falling || landed) return
    try {
      table.position.y -= 0.52
      if (table.position.y <= 1.15) {
        table.position.y = 1.15
        landed = true
        fx.sfx('explosion')
        fx.sfx('break')
        fx.shake(1.4)
        fx.slowmo(0.3, 0.7)
        fx.zoom(fx.foe, 0.8)
        fx.particles('impact', v3(tx, 1.0, 0), { n: 30 })
        fx.particles('smoke', v3(tx, 0.6, 0), { n: 12 })
        // ejected office furnishings
        const debris = ['chair', 'monitor', 'chair', 'box', 'monitor', 'box']
        for (let i = 0; i < debris.length; i++) {
          const d = fx.spawnProp(debris[i], v3(clampToArena(fx, tx + (i - 2.5) * 0.7), 1.6, (i % 2 ? 0.8 : -0.8)))
          if (d) { try { fx.impulse(d, [(i - 2.5) * 4, 7 + Math.random() * 3, (i % 2 ? 3 : -3)], 3) } catch { /* gone */ } }
        }
        if (fx.foe && Math.abs(fx.foe.pos.x - tx) < 3.4) {
          const away = Math.sign(fx.foe.pos.x - tx) || -F
          fx.hit({ damage: 34, knockback: { x: 10 * away * F, y: 7, spin: 3 }, hitStun: 50, ragdoll: 2 })
        }
        fx.caption('THIS MEETING IS OVER')
        fx.announcer('MEETING ADJOURNED')
      }
    } catch { cleanup() }
  })
  fx.after(260, cleanup) // the table is eventually returned to facilities
  fx.after(78, end)
}

function outOfOfficeScript(fx) {
  const end = onceEnd(fx)
  const F = fx.self.facing
  const world = worldOf(fx)
  fx.caption('OUT OF OFFICE')
  fx.sfx('menu_back', { pitch: 0.7 })
  let sign = null
  fx.after(10, () => {
    if (!world) return
    try {
      sign = new THREE.Group()
      const tex = labelTex('OOO', { w: 128, h: 64, size: 36 })
      sign.add(box(0.3, 0.02, 0.2, lamb(C.paper), 0, 0.2, 0))
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.18, 0.28),
        tex ? new THREE.MeshBasicMaterial({ map: tex }) : lamb(C.paper))
      plate.position.set(0.05, 0.12, 0)
      plate.rotation.z = -0.35
      sign.add(plate)
      sign.position.set(clampToArena(fx, fx.self.pos.x + F * 0.8), 0, 0)
      sign.traverse((o) => { if (o.isMesh) o.castShadow = true })
      world.add(sign)
      fx.sfx('thud', { pitch: 1.6 })
    } catch { sign = null }
  })
  fx.after(16, () => { // PTO heals. it's science
    try {
      const mh = fx.self.maxHp ?? 100
      fx.self.setHp?.(Math.min(mh, fx.self.hp + 3))
    } catch { /* engine field */ }
    fx.particles('stars', v3(fx.self.pos.x, 2.1, 0), { n: 6 })
    fx.sfx('coin', { pitch: 1.5 })
    fx.caption('+3 HP (PAID TIME OFF)')
  })
  // Zzz drift while the foe fumes
  for (let i = 0; i < 3; i++) {
    fx.after(24 + i * 12, () => fx.particles('stars', v3(fx.self.pos.x - F * 0.2, 2.2 + i * 0.15, 0), { n: 2 }))
  }
  fx.after(28, () => { // angry steam from the foe
    try {
      fx.particles('smoke', v3(fx.foe.pos.x, 2.0, 0), { n: 8 })
      fx.particles('sparks', v3(fx.foe.pos.x, 2.1, 0), { n: 4 })
    } catch { /* foe gone */ }
  })
  fx.after(300, () => scrap(sign)) // the sign expires with the vacation
  fx.after(66, end)
}

// ---------------------------------------------------------------------------
// the CharacterDef
// ---------------------------------------------------------------------------
export const TiredApeDef = {
  id: 'tired-ape',
  name: 'TIRED APE',
  title: 'The Unimpressed Investor',
  bio: 'Bought the top of every market since 2013 and has felt nothing since. Fights exclusively between sips of lukewarm coffee, files opponents under "correspondence", and has never once removed the robe. His portfolio is down 99.4%, risk-adjusted. His blood pressure is perfect.',
  style: 'Slow-motion menace. Every attack looks like a man reaching for a stapler and lands like a leveraged short. Bring a book; his startup frames have startup frames — but so does his damage.',
  stats: { power: 9, speed: 3, defense: 6, chaos: 5 },
  height: 1.9,
  weight: 1.5,
  walkSpeed: 2.9,
  dashSpeed: 6.2,
  jumpVel: 6.8,

  buildModel,
  clips,

  moves: [
    // -------------------------------------------------------------- basics --
    {
      id: 'coffee-splash', name: 'Coffee Splash', kind: 'light',
      input: ['light'],
      damage: 7, startup: 8, active: 4, recovery: 12,
      hitbox: { w: 1.1, h: 0.9, d: 1.0, forward: 1.0, up: 1.3 },
      knockback: { x: 4.5, y: 1, spin: 0.3 },
      hitStun: 16, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 5, meterCost: 0, armor: 0,
      clip: 'coffeeSplash', sfx: 'whoosh',
      script: coffeeSplashScript,
    },
    {
      id: 'mug-uppercut', name: 'Mug Uppercut', kind: 'launcher',
      input: ['forward', 'light'],
      damage: 11, startup: 10, active: 4, recovery: 18,
      hitbox: { w: 0.9, h: 1.5, d: 0.9, forward: 0.8, up: 1.2 },
      knockback: { x: 2, y: 10.5, spin: 1.5 },
      hitStun: 28, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 7, meterCost: 0, armor: 0,
      clip: 'mugUppercut', sfx: 'launch',
      script: mugUppercutScript,
    },
    {
      id: 'lazy-backhand', name: 'Lazy Backhand', kind: 'heavy',
      input: ['heavy'],
      damage: 17, startup: 16, active: 5, recovery: 18,
      // deceptive range: the arm is longer than the enthusiasm suggests
      hitbox: { w: 1.9, h: 1.0, d: 1.0, forward: 1.5, up: 1.3 },
      knockback: { x: 10.5, y: 3, spin: 1 },
      hitStun: 24, blockStun: 13, hitStop: 7,
      launcher: false, ragdollThreshold: 1,
      meterGain: 9, meterCost: 0, armor: 0,
      clip: 'lazyBackhand', sfx: 'punch_heavy', script: null,
    },
    {
      id: 'chair-shove', name: 'Chair Shove', kind: 'heavy',
      input: ['forward', 'heavy'],
      damage: 14, startup: 14, active: 6, recovery: 20,
      hitbox: { w: 1.4, h: 1.2, d: 1.0, forward: 1.2, up: 0.9 },
      knockback: { x: 9.5, y: 3, spin: 1 },
      hitStun: 24, blockStun: 13, hitStop: 6,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'chairShove', sfx: 'slide',
      script: chairShoveScript,
    },
    {
      id: 'slipper-kick', name: 'Slipper Kick', kind: 'kick',
      input: ['kick'],
      damage: 10, startup: 9, active: 6, recovery: 15,
      hitbox: { w: 1.3, h: 0.9, d: 0.9, forward: 1.2, up: 0.9 },
      knockback: { x: 8, y: 2.5, spin: 0.8 },
      hitStun: 18, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'slipperKick', sfx: 'kick',
      script: slipperKickScript,
    },
    {
      id: 'yawn-stun', name: 'Yawn Stun', kind: 'light',
      input: ['back', 'light'],
      damage: 4, startup: 12, active: 6, recovery: 16,
      // tiny range: you must be close enough to smell the coffee breath
      hitbox: { w: 0.8, h: 1.0, d: 0.9, forward: 0.6, up: 1.5 },
      knockback: { x: 0.5, y: 0, spin: 0 },
      hitStun: 55, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0,
      meterGain: 6, meterCost: 0, armor: 0,
      clip: 'yawnStun', sfx: 'whoosh',
      script: yawnStunScript,
    },
    {
      id: 'robe-spin', name: 'Robe Spin', kind: 'launcher',
      input: ['down', 'heavy'],
      damage: 13, startup: 13, active: 6, recovery: 20,
      hitbox: { w: 2.4, h: 0.7, d: 1.6, forward: 0.7, up: 0.4 },
      knockback: { x: 2.5, y: 9, spin: 1.2 },
      hitStun: 26, blockStun: 12, hitStop: 5,
      launcher: true, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'robeSpin', sfx: 'whoosh', script: null,
    },
    {
      id: 'sleepwalk-dodge', name: 'Sleepwalk Dodge', kind: 'kick',
      input: ['back', 'kick'],
      damage: 0, startup: 4, active: 2, recovery: 24,
      hitbox: { w: 0.3, h: 0.3, d: 0.3, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 4, meterCost: 0, armor: 0,
      clip: 'sleepwalk', sfx: 'whoosh',
      script: sleepwalkScript,
    },

    // --------------------------------------------------------------- grabs --
    {
      id: 'firm-handshake', name: 'Firm Handshake', kind: 'grab',
      input: ['grab'],
      damage: 15, startup: 9, active: 3, recovery: 36,
      hitbox: { w: 0.9, h: 1.1, d: 0.9, forward: 1.0, up: 1.1 },
      // pleased to meet you. pleased to METEOR you
      knockback: { x: 8.5, y: 6, spin: 2 },
      hitStun: 30, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'firmHandshake', sfx: 'grab', script: null,
    },
    {
      id: 'hr-violation', name: 'HR Violation', kind: 'grab',
      input: ['down', 'grab'],
      damage: 13, startup: 11, active: 3, recovery: 32,
      hitbox: { w: 1.0, h: 1.0, d: 0.9, forward: 0.9, up: 1.0 },
      // filed directly into the floor, under 'D' for 'Disciplinary'
      knockback: { x: 1.5, y: 7.5, spin: 2.5 },
      hitStun: 32, blockStun: 0, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'hrViolation', sfx: 'throw', script: null,
    },

    // ------------------------------------------------------------ specials --
    {
      // neutral special: zero meter so the Special button is never dead
      id: 'per-my-last-email', name: 'Per My Last Email', kind: 'special',
      input: ['special'],
      damage: 13, startup: 11, active: 4, recovery: 25,
      hitbox: { w: 1.3, h: 1.2, d: 1.0, forward: 1.3, up: 1.2 },
      knockback: { x: 11.5, y: 4, spin: 1.4 },
      hitStun: 27, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 8, meterCost: 0, armor: 0,
      clip: 'sip', sfx: 'menu_back',
      script: perMyLastEmailScript,
    },
    {
      id: 'capital-allocation', name: 'Capital Allocation', kind: 'special',
      input: ['down', 'special'],
      damage: 18, startup: 12, active: 40, recovery: 26,
      hitbox: { w: 1.4, h: 1.6, d: 1.2, forward: 1.0, up: 1.0 },
      knockback: { x: 3, y: 5.5, spin: 1.2 },
      hitStun: 30, blockStun: 12, hitStop: 5,
      launcher: false, ragdollThreshold: 1,
      meterGain: 0, meterCost: 30, armor: 0,
      clip: 'capital', sfx: 'bell',
      script: capitalAllocationScript,
    },
    {
      id: 'executive-assistant', name: 'Executive Assistant', kind: 'special',
      input: ['forward', 'special'],
      damage: 20, startup: 15, active: 40, recovery: 25,
      hitbox: { w: 1.2, h: 1.4, d: 1.0, forward: 1.0, up: 1.0 },
      knockback: { x: 13, y: 6, spin: 2.5 },
      hitStun: 40, blockStun: 14, hitStop: 6,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 35, armor: 0,
      clip: 'delegate', sfx: 'menu_confirm',
      script: executiveAssistantScript,
    },
    {
      id: 'market-indifference', name: 'Market Indifference', kind: 'special',
      input: ['back', 'special'],
      damage: 0, startup: 10, active: 4, recovery: 40,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.2, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 0, meterCost: 25, armor: 0,
      clip: 'sip', sfx: 'slide',
      script: marketIndifferenceScript,
    },
    {
      id: 'meeting-email', name: 'Meeting That Should Have Been an Email', kind: 'super',
      input: ['super'],
      damage: 34, startup: 18, active: 30, recovery: 30,
      hitbox: { w: 3.2, h: 1.8, d: 2.0, forward: 1.0, up: 1.0 },
      knockback: { x: 10, y: 7, spin: 3 },
      hitStun: 50, blockStun: 16, hitStop: 8,
      launcher: false, ragdollThreshold: 2,
      meterGain: 0, meterCost: 100, armor: 12,
      clip: 'meeting', sfx: 'bell',
      script: meetingEmailScript,
    },

    // ------------------------------------------------------- hidden / joke --
    {
      id: 'out-of-office', name: 'Out of Office', kind: 'joke',
      input: ['down', 'down', 'light'],
      damage: 0, startup: 12, active: 4, recovery: 50,
      hitbox: { w: 0.4, h: 0.4, d: 0.4, forward: 0.3, up: 1.0 },
      knockback: { x: 0, y: 0, spin: 0 },
      hitStun: 0, blockStun: 0, hitStop: 0,
      launcher: false, ragdollThreshold: 0,
      meterGain: 10, meterCost: 0, armor: 0,
      clip: 'ooo', sfx: 'menu_back',
      script: outOfOfficeScript,
    },
  ],

  finisher: {
    id: 'portfolio-rebalance',
    name: 'Portfolio Rebalance',
    script(fx) {
      const end = onceEnd(fx)
      const F = fx.self.facing
      const world = worldOf(fx)
      fx.slowmo(0.5, 1.0)
      fx.zoom(fx.self, 0.8)
      fx.caption('PORTFOLIO REBALANCE')
      fx.announcer('PORTFOLIO REBALANCE')
      fx.sfx('bell')
      try { fx.self.playClip?.('rebalance') } catch { /* animator */ }

      // desk + big red button, arms, three asset signs — all cinematic set dressing
      let desk = null
      let arms = null
      const signs = []
      const cleanup = () => {
        scrap(desk); desk = null
        scrap(arms); arms = null
        while (signs.length) scrap(signs.pop())
      }

      fx.after(6, () => {
        if (!world) return
        try {
          desk = new THREE.Group()
          desk.add(box(0.9, 0.55, 0.7, lamb(C.wood), 0, 0.28, 0))
          desk.add(cyl(0.14, 0.16, 0.1, lamb(C.button), 0, 0.6, 0))
          desk.add(cyl(0.18, 0.18, 0.04, lamb(C.steel), 0, 0.56, 0))
          desk.position.set(clampToArena(fx, fx.self.pos.x + F * 0.9), 0, 0)
          desk.traverse((o) => { o.castShadow = true })
          world.add(desk)
          fx.sfx('thud')
        } catch { desk = null }
      })

      // the press. one finger. zero urgency
      fx.after(18, () => {
        fx.sfx('menu_confirm', { pitch: 0.6 })
        fx.shake(0.25)
        if (desk) { try { fx.particles('sparks', v3(desk.position.x, 0.8, 0), { n: 6 }) } catch { /* fine */ } }
      })

      // mechanical arms descend from corporate heaven
      let armsY = 8.5
      let armsDown = false
      const armsX = clampToArena(fx, fx.foe.pos.x)
      fx.after(24, () => {
        if (!world) return
        try {
          arms = new THREE.Group()
          for (const side of [1, -1]) {
            arms.add(cyl(0.09, 0.09, 5.5, lamb(C.steel), 0, 2.75, side * 0.45))
            arms.add(box(0.34, 0.4, 0.14, lamb(C.steel), 0, 0.1, side * 0.34, 0.25 * side))
          }
          arms.add(box(0.7, 0.3, 1.2, lamb(0x3a3f4a), 0, 5.4, 0)) // gantry block
          arms.position.set(armsX, armsY, 0)
          arms.traverse((o) => { o.castShadow = true })
          world.add(arms)
          fx.sfx('whoosh', { pitch: 0.5 })
        } catch { arms = null }
      })
      fx.frame(() => {
        if (!arms) return
        try {
          if (!armsDown) {
            armsY -= 0.42
            if (armsY <= 1.1) { armsY = 1.1; armsDown = true }
            arms.position.y = armsY
          } else {
            arms.position.y = 1.1 + Math.sin(fx.age * 0.2) * 0.04 // idle servo hum
          }
        } catch { /* gone */ }
      })

      // clamp the foe
      fx.after(38, () => {
        fx.sfx('grab')
        fx.shake(0.5)
        fx.zoom(fx.foe, 0.6)
        fx.hit({ damage: 2, knockback: { x: 0, y: 0 }, hitStun: 220 })
      })

      // the three asset categories present themselves
      const signDefs = [
        { text: 'CRYPTO', bg: '#2b1b4d', fg: '#ffd34d' },
        { text: 'REAL ESTATE', bg: '#1b3d2b', fg: '#a8ffcb' },
        { text: 'BEANIE BABIES', bg: '#4d1b1b', fg: '#ffb3b3' },
      ]
      for (let i = 0; i < 3; i++) {
        fx.after(50 + i * 12, () => {
          if (!world) return
          try {
            const s = makeSign(signDefs[i].text, signDefs[i].bg, signDefs[i].fg)
            s.position.set(clampToArena(fx, fx.self.pos.x + F * (3.2 + i * 2.1)), 0, 0)
            world.add(s)
            signs.push(s)
            fx.sfx('menu_move', { pitch: 0.9 + i * 0.15 })
          } catch { /* fine */ }
        })
      }

      // deliberation: rotate past each option. pulse. judge. reject
      const consider = (i, line) => {
        fx.after(88 + i * 14, () => {
          fx.caption(line)
          fx.sfx(i === 2 ? 'menu_back' : 'menu_move', { pitch: 1 + i * 0.1 })
          const s = signs[i]
          if (s) {
            try {
              s.scale.set(1.25, 1.25, 1.25)
              fx.after(8, () => { try { s.scale.set(1, 1, 1) } catch { /* gone */ } })
            } catch { /* gone */ }
          }
        })
      }
      consider(0, 'CRYPTO?')
      consider(1, 'REAL ESTATE?')
      consider(2, 'BEANIE BABIES. FINAL ANSWER.')

      // THE HURL — into the historically worst-performing asset class
      fx.after(134, () => {
        fx.sfx('launch')
        fx.shake(1.2)
        fx.slowmo(0.3, 0.9)
        fx.zoom(fx.foe, 1.0)
        fx.hit({ damage: 30, knockback: { x: 17, y: 6, spin: 3 }, hitStun: 60, ragdoll: 2 })
        fx.ragdoll(fx.foe, [F * 16, 7, 0])
      })

      // explosion of paperwork at the beanie sign
      fx.after(146, () => {
        const s = signs[2]
        const sx = s ? s.position.x : clampToArena(fx, fx.self.pos.x + F * 7.4)
        fx.sfx('break')
        fx.sfx('explosion')
        fx.shake(1.3)
        fx.particles('confetti', v3(sx, 2.2, 0), { n: 40 })
        fx.particles('impact', v3(sx, 2.0, 0), { n: 16 })
        for (let i = 0; i < 8; i++) {
          const p = fx.spawnProp('box', v3(sx, 2.2, (Math.random() - 0.5) * 0.8), { mass: 0.12 })
          if (p) {
            try {
              p.mesh?.scale?.set(0.3, 0.05, 0.4)
              p.mesh?.traverse?.((o) => { if (o.isMesh && o.material?.color) o.material.color.setHex(C.paper) })
              fx.impulse(p, [(Math.random() - 0.5) * 8, 4 + Math.random() * 5, (Math.random() - 0.5) * 6], 6)
            } catch { /* cosmetics */ }
          }
        }
        if (s) scrap(signs.splice(2, 1)[0])
        fx.caption('PORTFOLIO REBALANCED')
        fx.announcer('ASSET CLASS: PAIN')
      })

      fx.after(170, cleanup)
      fx.after(320, cleanup) // failsafe: facilities always reclaims the set
      fx.after(178, end)
    },
  },

  voice: { pitch: 0.35, rate: 0.7 },
}
