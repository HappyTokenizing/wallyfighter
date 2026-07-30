// Safety net: while character modules are stubs (or ship broken models), combat
// substitutes a fully playable low-poly "SUIT GUY" built from the stub's stats.
// This keeps the match screen demonstrable end-to-end at all times. Real character
// defs (CONTRACTS.md §4) completely replace this at runtime once they exist.
import * as THREE from 'three'

function hashColor(id, salt) {
  let h = salt
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = (h % 360) / 360
  const col = new THREE.Color()
  col.setHSL(hue, 0.72, 0.52)
  return col.getHex()
}

function mat(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }) }

function limb(w, h, d, color, yCenter) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  m.position.y = yCenter
  m.castShadow = true
  return m
}

function buildFallbackModel(id, height, costume) {
  const s = height / 2 // authored at 2m, scaled
  const suit = costume ? hashColor(id, 77) : hashColor(id, 7)
  const skin = 0xf0c088
  const pants = 0x2a2e3c

  const group = new THREE.Group()
  const bones = {}

  const hips = new THREE.Group(); hips.position.y = 1.05 * s
  const torso = new THREE.Group(); torso.position.y = 0.05 * s
  const head = new THREE.Group(); head.position.y = 0.75 * s
  const armL = new THREE.Group(); armL.position.set(0, 0.62 * s, 0.36 * s)
  const armR = new THREE.Group(); armR.position.set(0, 0.62 * s, -0.36 * s)
  const legL = new THREE.Group(); legL.position.set(0, -0.06 * s, 0.17 * s)
  const legR = new THREE.Group(); legR.position.set(0, -0.06 * s, -0.17 * s)

  hips.add(limb(0.5 * s, 0.28 * s, 0.56 * s, pants, -0.02 * s))
  torso.add(limb(0.56 * s, 0.72 * s, 0.62 * s, suit, 0.38 * s))
  const tie = limb(0.06 * s, 0.4 * s, 0.12 * s, 0xd8232a, 0.42 * s)
  tie.position.x = 0.3 * s
  torso.add(tie)
  const headMesh = limb(0.4 * s, 0.42 * s, 0.4 * s, skin, 0.22 * s)
  head.add(headMesh)
  const brow = limb(0.1 * s, 0.06 * s, 0.34 * s, 0x3a2b18, 0.32 * s)
  brow.position.x = 0.18 * s
  head.add(brow)
  armL.add(limb(0.17 * s, 0.62 * s, 0.17 * s, suit, -0.3 * s))
  armR.add(limb(0.17 * s, 0.62 * s, 0.17 * s, suit, -0.3 * s))
  const fistL = limb(0.2 * s, 0.18 * s, 0.2 * s, skin, -0.66 * s)
  const fistR = limb(0.2 * s, 0.18 * s, 0.2 * s, skin, -0.66 * s)
  armL.add(fistL); armR.add(fistR)
  legL.add(limb(0.2 * s, 0.92 * s, 0.2 * s, pants, -0.5 * s))
  legR.add(limb(0.2 * s, 0.92 * s, 0.2 * s, pants, -0.5 * s))
  const shoeL = limb(0.34 * s, 0.12 * s, 0.2 * s, 0x14161c, -0.95 * s)
  shoeL.position.x = 0.06 * s
  const shoeR = shoeL.clone()
  legL.add(shoeL); legR.add(shoeR)

  torso.add(head, armL, armR)
  hips.add(torso, legL, legR)
  group.add(hips)

  bones.hips = hips; bones.torso = torso; bones.head = head
  bones.armL = armL; bones.armR = armR; bones.legL = legL; bones.legR = legR
  return { group, bones }
}

// ---- clips (authored at height 2; animator uses absolute local values) ----
function makeClips(height) {
  const s = height / 2
  const hipY = 1.05 * s
  const K = (t, rot, pos) => (pos ? { t, rot, pos } : { t, rot })

  return {
    idle: {
      duration: 1.7, loop: true,
      tracks: {
        hips: [K(0, [0, 0, 0], [0, hipY, 0]), K(0.85, [0, 0, 0.03], [0, hipY - 0.03 * s, 0]), K(1.7, [0, 0, 0], [0, hipY, 0])],
        torso: [K(0, [0, 0, 0.05]), K(0.85, [0, 0, 0.09]), K(1.7, [0, 0, 0.05])],
        head: [K(0, [0, 0, -0.05]), K(0.85, [0, 0.06, -0.02]), K(1.7, [0, 0, -0.05])],
        armL: [K(0, [0, 0, 0.5]), K(0.85, [0, 0, 0.58]), K(1.7, [0, 0, 0.5])],
        armR: [K(0, [0, 0, 0.7]), K(0.85, [0, 0, 0.62]), K(1.7, [0, 0, 0.7])],
      },
    },
    walk: {
      duration: 0.55, loop: true,
      tracks: {
        hips: [K(0, [0, 0, 0.06], [0, hipY, 0]), K(0.14, [0, 0, 0.06], [0, hipY + 0.05 * s, 0]), K(0.28, [0, 0, 0.06], [0, hipY, 0]), K(0.41, [0, 0, 0.06], [0, hipY + 0.05 * s, 0]), K(0.55, [0, 0, 0.06], [0, hipY, 0])],
        legL: [K(0, [0, 0, 0.55]), K(0.28, [0, 0, -0.55]), K(0.55, [0, 0, 0.55])],
        legR: [K(0, [0, 0, -0.55]), K(0.28, [0, 0, 0.55]), K(0.55, [0, 0, -0.55])],
        armL: [K(0, [0, 0, 0.25]), K(0.28, [0, 0, 0.85]), K(0.55, [0, 0, 0.25])],
        armR: [K(0, [0, 0, 0.85]), K(0.28, [0, 0, 0.25]), K(0.55, [0, 0, 0.85])],
        torso: [K(0, [0, 0, 0.1])],
      },
    },
    jump: {
      duration: 0.4, loop: false,
      tracks: {
        legL: [K(0, [0, 0, 0.2]), K(0.15, [0, 0, 1.4]), K(0.4, [0, 0, 0.9])],
        legR: [K(0, [0, 0, -0.2]), K(0.15, [0, 0, 1.0]), K(0.4, [0, 0, 0.5])],
        armL: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 2.6])],
        armR: [K(0, [0, 0, 0.5]), K(0.2, [0, 0, 2.2])],
        torso: [K(0, [0, 0, 0.05]), K(0.2, [0, 0, -0.15])],
      },
    },
    fall: {
      duration: 0.5, loop: true,
      tracks: {
        armL: [K(0, [0, 0, 2.6]), K(0.25, [0, 0, 2.2]), K(0.5, [0, 0, 2.6])],
        armR: [K(0, [0, 0, 2.2]), K(0.25, [0, 0, 2.7]), K(0.5, [0, 0, 2.2])],
        legL: [K(0, [0, 0, 0.7]), K(0.25, [0, 0, 0.4]), K(0.5, [0, 0, 0.7])],
        legR: [K(0, [0, 0, 0.2]), K(0.25, [0, 0, 0.6]), K(0.5, [0, 0, 0.2])],
        torso: [K(0, [0, 0, 0.25])],
      },
    },
    crouch: {
      duration: 0.6, loop: true,
      tracks: {
        hips: [K(0, [0, 0, 0.15], [0, hipY - 0.42 * s, 0])],
        legL: [K(0, [0, 0, 1.5])],
        legR: [K(0, [0, 0, -0.9])],
        torso: [K(0, [0, 0, 0.35])],
        head: [K(0, [0, 0, -0.3])],
        armL: [K(0, [0, 0, 1.1])],
        armR: [K(0, [0, 0, 1.3])],
      },
    },
    block: {
      duration: 0.6, loop: true,
      tracks: {
        torso: [K(0, [0, 0, -0.12])],
        armL: [K(0, [0.35, 0, 2.0])],
        armR: [K(0, [-0.35, 0, 2.3])],
        head: [K(0, [0, 0, 0.18])],
        hips: [K(0, [0, 0, 0], [0, hipY - 0.06 * s, 0])],
      },
    },
    hitLight: {
      duration: 0.28, loop: false,
      tracks: {
        torso: [K(0, [0, 0, -0.5]), K(0.28, [0, 0, 0])],
        head: [K(0, [0, 0, 0.6]), K(0.28, [0, 0, 0])],
        armL: [K(0, [0, 0, 1.4]), K(0.28, [0, 0, 0.5])],
        armR: [K(0, [0, 0, -0.6]), K(0.28, [0, 0, 0.6])],
      },
    },
    hitHeavy: {
      duration: 0.4, loop: false,
      tracks: {
        hips: [K(0, [0, 0, -0.25], [0, hipY - 0.1 * s, 0]), K(0.4, [0, 0, 0], [0, hipY, 0])],
        torso: [K(0, [0, 0, -0.8]), K(0.4, [0, 0, 0])],
        head: [K(0, [0, 0, 0.9]), K(0.4, [0, 0, 0])],
        armL: [K(0, [0, 0, 2.4]), K(0.4, [0, 0, 0.5])],
        armR: [K(0, [0, 0, -1.2]), K(0.4, [0, 0, 0.6])],
        legL: [K(0, [0, 0, 0.6]), K(0.4, [0, 0, 0])],
      },
    },
    launched: {
      duration: 0.7, loop: true,
      tracks: {
        hips: [K(0, [0, 0, -0.9], [0, hipY, 0]), K(0.35, [0, 0, -1.4], [0, hipY, 0]), K(0.7, [0, 0, -0.9], [0, hipY, 0])],
        torso: [K(0, [0, 0, -0.4])],
        armL: [K(0, [0, 0, 2.8]), K(0.35, [0, 0, 2.2]), K(0.7, [0, 0, 2.8])],
        armR: [K(0, [0, 0, 2.4]), K(0.35, [0, 0, 3.0]), K(0.7, [0, 0, 2.4])],
        legL: [K(0, [0, 0, 1.2]), K(0.35, [0, 0, 0.6]), K(0.7, [0, 0, 1.2])],
        legR: [K(0, [0, 0, 0.5]), K(0.35, [0, 0, 1.1]), K(0.7, [0, 0, 0.5])],
        head: [K(0, [0, 0, 0.7])],
      },
    },
    knockdown: {
      duration: 0.8, loop: true,
      tracks: {
        hips: [K(0, [0, 0, -1.5], [0, 0.28 * s, 0])],
        torso: [K(0, [0, 0, 0.1])],
        head: [K(0, [0, 0, 0.4])],
        armL: [K(0, [0, 0, 2.9])],
        armR: [K(0, [0, 0, 2.7])],
        legL: [K(0, [0, 0, 0.3])],
        legR: [K(0, [0, 0, 0.15])],
      },
    },
    getup: {
      duration: 0.38, loop: false,
      tracks: {
        hips: [K(0, [0, 0, -1.5], [0, 0.28 * s, 0]), K(0.22, [0, 0, -0.4], [0, 0.8 * s, 0]), K(0.38, [0, 0, 0], [0, hipY, 0])],
        torso: [K(0, [0, 0, 0.4]), K(0.38, [0, 0, 0.05])],
        armL: [K(0, [0, 0, 2.0]), K(0.38, [0, 0, 0.5])],
        armR: [K(0, [0, 0, 2.0]), K(0.38, [0, 0, 0.6])],
        legL: [K(0, [0, 0, 1.2]), K(0.38, [0, 0, 0])],
        legR: [K(0, [0, 0, 0.8]), K(0.38, [0, 0, 0])],
      },
    },
    entrance: {
      duration: 1.5, loop: false,
      tracks: {
        hips: [K(0, [0, 0, 0], [0, hipY, 0]), K(0.5, [0, 0, 0], [0, hipY - 0.15 * s, 0]), K(0.8, [0, 0, 0], [0, hipY + 0.1 * s, 0]), K(1.1, [0, 0, 0], [0, hipY, 0])],
        armL: [K(0, [0, 0, 0.5]), K(0.8, [0, 0, 3.0]), K(1.3, [0, 0, 2.8]), K(1.5, [0, 0, 0.5])],
        armR: [K(0, [0, 0, 0.5]), K(0.8, [0, 0, 3.0]), K(1.3, [0, 0, 2.8]), K(1.5, [0, 0, 0.5])],
        head: [K(0, [0, 0, 0]), K(0.8, [0, 0, 0.3]), K(1.5, [0, 0, -0.05])],
        torso: [K(0, [0, 0, 0.05]), K(0.8, [0, 0, -0.2]), K(1.5, [0, 0, 0.05])],
      },
    },
    win: {
      duration: 0.9, loop: true,
      tracks: {
        hips: [K(0, [0, 0, 0], [0, hipY, 0]), K(0.22, [0, 0, 0], [0, hipY + 0.16 * s, 0]), K(0.45, [0, 0, 0], [0, hipY, 0]), K(0.67, [0, 0, 0], [0, hipY + 0.16 * s, 0]), K(0.9, [0, 0, 0], [0, hipY, 0])],
        armL: [K(0, [0, 0, 3.0]), K(0.45, [0, 0, 2.5]), K(0.9, [0, 0, 3.0])],
        armR: [K(0, [0, 0, 2.5]), K(0.45, [0, 0, 3.0]), K(0.9, [0, 0, 2.5])],
        head: [K(0, [0, 0, 0.25])],
      },
    },
    lose: {
      duration: 1.2, loop: true,
      tracks: {
        hips: [K(0, [0, 0, 0.3], [0, 0.55 * s, 0])],
        legL: [K(0, [0, 0, 2.2])],
        legR: [K(0, [0, 0, 1.4])],
        torso: [K(0, [0, 0, 0.7])],
        head: [K(0, [0, 0, 0.8]), K(0.6, [0, 0.1, 0.85]), K(1.2, [0, 0, 0.8])],
        armL: [K(0, [0, 0, 0.9])],
        armR: [K(0, [0, 0, 0.9])],
      },
    },
    taunt: {
      duration: 1.0, loop: false,
      tracks: {
        armR: [K(0, [0, 0, 0.5]), K(0.3, [0, 0, 2.6]), K(0.5, [0, 0.4, 2.6]), K(0.7, [0, -0.4, 2.6]), K(1.0, [0, 0, 0.5])],
        head: [K(0, [0, 0, 0]), K(0.4, [0, 0, 0.3]), K(1.0, [0, 0, 0])],
        torso: [K(0, [0, 0, 0]), K(0.4, [0, 0, -0.15]), K(1.0, [0, 0, 0.05])],
      },
    },
    jab: {
      duration: 0.27, loop: false,
      tracks: {
        armR: [K(0, [0, 0, 0.6]), K(0.07, [0, 0, 1.62]), K(0.16, [0, 0, 1.62]), K(0.27, [0, 0, 0.6])],
        torso: [K(0, [0, 0, 0]), K(0.07, [0, -0.35, 0.05]), K(0.27, [0, 0, 0])],
      },
    },
    straight: {
      duration: 0.45, loop: false,
      tracks: {
        armL: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, -0.4]), K(0.17, [0, 0, 1.75]), K(0.28, [0, 0, 1.75]), K(0.45, [0, 0, 0.5])],
        torso: [K(0, [0, 0, 0]), K(0.1, [0, 0.4, -0.1]), K(0.17, [0, -0.55, 0.12]), K(0.45, [0, 0, 0])],
        hips: [K(0, [0, 0, 0]), K(0.17, [0, -0.25, 0]), K(0.45, [0, 0, 0])],
      },
    },
    bigKick: {
      duration: 0.42, loop: false,
      tracks: {
        legR: [K(0, [0, 0, 0]), K(0.09, [0, 0, -0.5]), K(0.16, [0, 0, 1.7]), K(0.26, [0, 0, 1.7]), K(0.42, [0, 0, 0])],
        torso: [K(0, [0, 0, 0]), K(0.16, [0, 0, -0.35]), K(0.42, [0, 0, 0])],
        armL: [K(0, [0, 0, 0.5]), K(0.16, [0, 0, 1.4]), K(0.42, [0, 0, 0.5])],
        armR: [K(0, [0, 0, 0.5]), K(0.16, [0, 0, -0.8]), K(0.42, [0, 0, 0.5])],
      },
    },
    uppercut: {
      duration: 0.5, loop: false,
      tracks: {
        armR: [K(0, [0, 0, 0.6]), K(0.12, [0, 0, -0.8]), K(0.2, [0, 0, 3.1]), K(0.32, [0, 0, 3.1]), K(0.5, [0, 0, 0.6])],
        hips: [K(0, [0, 0, 0.1], [0, hipY - 0.2 * s, 0]), K(0.2, [0, 0, -0.15], [0, hipY + 0.12 * s, 0]), K(0.5, [0, 0, 0], [0, hipY, 0])],
        torso: [K(0, [0, 0, 0.35]), K(0.2, [0, 0, -0.3]), K(0.5, [0, 0, 0.05])],
        legL: [K(0, [0, 0, 0.8]), K(0.2, [0, 0, -0.4]), K(0.5, [0, 0, 0])],
      },
    },
    grabClip: {
      duration: 0.5, loop: false,
      tracks: {
        armL: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, 1.55]), K(0.4, [0, 0, 1.55]), K(0.5, [0, 0, 0.5])],
        armR: [K(0, [0, 0, 0.5]), K(0.1, [0, 0, 1.55]), K(0.4, [0, 0, 1.55]), K(0.5, [0, 0, 0.5])],
        torso: [K(0, [0, 0, 0]), K(0.1, [0, 0, 0.25]), K(0.5, [0, 0, 0])],
      },
    },
    briefcase: {
      duration: 0.6, loop: false,
      tracks: {
        armR: [K(0, [0, 0, 0.6]), K(0.15, [0, 0, 3.2]), K(0.25, [0, 0, 1.2]), K(0.4, [0, 0, 1.2]), K(0.6, [0, 0, 0.6])],
        armL: [K(0, [0, 0, 0.6]), K(0.15, [0, 0, 2.8]), K(0.25, [0, 0, 1.0]), K(0.6, [0, 0, 0.6])],
        torso: [K(0, [0, 0, 0]), K(0.15, [0, 0, -0.5]), K(0.25, [0, 0, 0.5]), K(0.6, [0, 0, 0])],
        hips: [K(0, [0, 0, 0], [0, hipY, 0]), K(0.25, [0, 0, 0.2], [0, hipY - 0.15 * s, 0]), K(0.6, [0, 0, 0], [0, hipY, 0])],
      },
    },
  }
}

function makeMoves() {
  return [
    {
      id: 'fb-jab', name: 'Ledger Jab', kind: 'light', input: ['light'],
      damage: 6, startup: 4, active: 3, recovery: 9,
      hitbox: { w: 0.9, h: 0.6, d: 1.0, forward: 0.9, up: 1.35 },
      knockback: { x: 4, y: 0, spin: 0 }, hitStun: 14, blockStun: 8, hitStop: 3,
      launcher: false, ragdollThreshold: 0, meterGain: 5, meterCost: 0, armor: 0,
      clip: 'jab', sfx: 'punch_light', script: null,
    },
    {
      id: 'fb-straight', name: 'Hostile Takeover', kind: 'heavy', input: ['heavy'],
      damage: 12, startup: 9, active: 4, recovery: 15,
      hitbox: { w: 1.1, h: 0.7, d: 1.0, forward: 1.0, up: 1.3 },
      knockback: { x: 8, y: 1.5, spin: 0.4 }, hitStun: 20, blockStun: 11, hitStop: 6,
      launcher: false, ragdollThreshold: 0, meterGain: 9, meterCost: 0, armor: 0,
      clip: 'straight', sfx: 'punch_heavy', script: null,
    },
    {
      id: 'fb-kick', name: 'Margin Kick', kind: 'kick', input: ['kick'],
      damage: 9, startup: 7, active: 4, recovery: 13,
      hitbox: { w: 1.2, h: 0.6, d: 1.0, forward: 1.1, up: 1.0 },
      knockback: { x: 7, y: 1, spin: 0.3 }, hitStun: 17, blockStun: 10, hitStop: 4,
      launcher: false, ragdollThreshold: 0, meterGain: 7, meterCost: 0, armor: 0,
      clip: 'bigKick', sfx: 'kick', script: null,
    },
    {
      id: 'fb-uppercut', name: 'Pump It', kind: 'launcher', input: ['down', 'heavy'],
      damage: 10, startup: 8, active: 5, recovery: 18,
      hitbox: { w: 0.9, h: 1.3, d: 1.0, forward: 0.7, up: 1.3 },
      knockback: { x: 3, y: 10, spin: 1.2 }, hitStun: 30, blockStun: 12, hitStop: 6,
      launcher: true, ragdollThreshold: 1, meterGain: 8, meterCost: 0, armor: 0,
      clip: 'uppercut', sfx: 'launch', script: null,
    },
    {
      id: 'fb-boot', name: 'Delisting Boot', kind: 'launcher', input: ['down', 'kick'],
      damage: 8, startup: 9, active: 4, recovery: 16,
      hitbox: { w: 1.1, h: 0.8, d: 1.0, forward: 1.0, up: 0.7 },
      knockback: { x: 6, y: 8, spin: 1 }, hitStun: 26, blockStun: 10, hitStop: 5,
      launcher: true, ragdollThreshold: 1, meterGain: 7, meterCost: 0, armor: 0,
      clip: 'bigKick', sfx: 'kick', script: null,
    },
    {
      id: 'fb-grab', name: 'Rug Pull', kind: 'grab', input: ['grab'],
      damage: 11, startup: 6, active: 4, recovery: 20,
      hitbox: { w: 0.9, h: 1.2, d: 1.0, forward: 0.8, up: 1.1 },
      knockback: { x: 9, y: 6, spin: 2 }, hitStun: 20, blockStun: 0, hitStop: 4,
      launcher: false, ragdollThreshold: 2, meterGain: 8, meterCost: 0, armor: 0,
      clip: 'grabClip', sfx: 'grab', script: null,
    },
    {
      id: 'fb-toss', name: 'Exit Liquidity', kind: 'grab', input: ['back', 'grab'],
      damage: 13, startup: 7, active: 4, recovery: 22,
      hitbox: { w: 0.9, h: 1.2, d: 1.0, forward: 0.8, up: 1.1 },
      knockback: { x: -10, y: 7, spin: 2.5 }, hitStun: 20, blockStun: 0, hitStop: 4,
      launcher: false, ragdollThreshold: 2, meterGain: 9, meterCost: 0, armor: 0,
      clip: 'grabClip', sfx: 'grab', script: null,
    },
    {
      id: 'fb-briefcase', name: 'Briefcase Slam', kind: 'special', input: ['special'],
      damage: 15, startup: 12, active: 5, recovery: 20,
      hitbox: { w: 1.3, h: 1.0, d: 1.1, forward: 1.0, up: 1.1 },
      knockback: { x: 11, y: 4, spin: 1.5 }, hitStun: 24, blockStun: 14, hitStop: 8,
      launcher: false, ragdollThreshold: 2, meterGain: 10, meterCost: 0, armor: 2,
      clip: 'briefcase', sfx: 'thud', script: null,
    },
    {
      id: 'fb-audit', name: 'Surprise Audit', kind: 'special', input: ['down', 'special'],
      damage: 12, startup: 10, active: 6, recovery: 22,
      hitbox: { w: 1.6, h: 0.7, d: 1.1, forward: 1.2, up: 0.6 },
      knockback: { x: 8, y: 7, spin: 2 }, hitStun: 24, blockStun: 12, hitStop: 6,
      launcher: true, ragdollThreshold: 1, meterGain: 9, meterCost: 0, armor: 0,
      clip: 'bigKick', sfx: 'whoosh', script: null,
    },
    {
      id: 'fb-super', name: 'QUARTERLY EARNINGS CALL', kind: 'super', input: ['super'],
      damage: 30, startup: 10, active: 8, recovery: 28,
      hitbox: { w: 1.8, h: 1.6, d: 1.2, forward: 1.1, up: 1.2 },
      knockback: { x: 16, y: 9, spin: 3 }, hitStun: 40, blockStun: 20, hitStop: 12,
      launcher: false, ragdollThreshold: 2, meterGain: 0, meterCost: 100, armor: 6,
      clip: 'briefcase', sfx: 'explosion',
      script: (fx) => {
        fx.caption('QUARTERLY EARNINGS!')
        fx.sfx('whoosh')
        fx.self.playClip('briefcase')
        fx.after(10, () => {
          const p = fx.foe.pos
          if (Math.abs(p.x - fx.self.pos.x) < 2.4) {
            fx.hit({ damage: 30, knockback: { x: 15, y: 9, spin: 3 }, hitStun: 40, ragdoll: 2 })
            fx.shake(1.2)
            fx.coins({ x: p.x, y: p.y + 1.2, z: 0 }, 24)
            fx.slowmo(0.35, 0.7)
            fx.sfx('explosion')
          } else {
            fx.sfx('whoosh')
          }
        })
        fx.after(46, () => fx.end())
      },
    },
    {
      id: 'fb-joke', name: 'Motivational LinkedIn Post', kind: 'joke', input: ['down', 'light'],
      damage: 2, startup: 14, active: 4, recovery: 26,
      hitbox: { w: 1.0, h: 0.8, d: 1.0, forward: 0.9, up: 1.2 },
      knockback: { x: 2, y: 0.5, spin: 4 }, hitStun: 24, blockStun: 6, hitStop: 3,
      launcher: false, ragdollThreshold: 0, meterGain: 12, meterCost: 0, armor: 0,
      clip: 'taunt', sfx: 'boing', script: null,
    },
  ]
}

export function makeFallbackDef(base = {}) {
  const id = base.id || 'suit'
  const height = base.height || 1.95
  const def = {
    id,
    name: base.name || 'SUIT GUY',
    title: base.title || 'Placeholder Executive',
    bio: base.bio || 'Filed as a temporary employee. Fights like middle management.',
    style: base.style || 'Corporate brawling',
    stats: base.stats || { power: 5, speed: 5, defense: 5, chaos: 5 },
    height,
    weight: base.weight || 1.0,
    walkSpeed: base.walkSpeed || 4.0,
    dashSpeed: base.dashSpeed || 8.5,
    jumpVel: base.jumpVel || 8.2,
    voice: base.voice || { pitch: 0.5, rate: 1.0 },
    buildModel: (costume = 0) => buildFallbackModel(id, height, costume),
    clips: makeClips(height),
    moves: makeMoves(),
    finisher: {
      id: 'fb-finisher', name: 'MARGIN CALL',
      script: (fx) => {
        fx.announcer('MARGIN CALL!')
        fx.caption('MARGIN CALL!')
        fx.zoom(fx.foe, 1.4)
        fx.self.playClip('briefcase')
        fx.after(20, () => {
          fx.sfx('punch_heavy')
          fx.particles('impact', { x: fx.foe.pos.x, y: fx.foe.pos.y + 1.2, z: 0 })
          fx.hit({ damage: 10, knockback: { x: 4, y: 2 }, hitStun: 40, ragdoll: 0 })
        })
        fx.after(45, () => {
          fx.sfx('explosion')
          fx.shake(1.6)
          fx.coins({ x: fx.foe.pos.x, y: fx.foe.pos.y + 1.4, z: 0 }, 36)
          fx.particles('confetti', { x: fx.foe.pos.x, y: fx.foe.pos.y + 1.8, z: 0 })
          fx.hit({ damage: 25, knockback: { x: 18, y: 12, spin: 4 }, hitStun: 60, ragdoll: 2 })
          fx.slowmo(0.22, 1.4)
        })
        fx.after(110, () => fx.end())
      },
    },
  }
  return def
}

// A def is usable when it can actually build a model and has clips + moves.
export function defNeedsFallback(def) {
  if (!def || def.stub) return true
  if (typeof def.buildModel !== 'function') return true
  if (!def.clips || !Object.keys(def.clips).length) return true
  if (!Array.isArray(def.moves) || !def.moves.length) return true
  return false
}
