// Headless camera validation harness — dev tool, never imported by the game.
// Mirrors src/ai/harness.js's pattern: node-only, seeded RNG, console spy,
// hard assertions, exit code 1 on any failure.
//
//   node src/camera/harness.js
//
// v2.0 coverage (CONTRACTS §18 — free-roam tracking third person):
//   - boom settles behind the tracked character's movement (all 4 headings +
//     diagonal), dist inside the 5.2-8 band, height ~2.4, pitch ~-12°
//   - getYaw() matches the rendered view heading (camera-relative input)
//   - yaw-follow stability: circle-strafing obeys the 3 rad/s hard cap;
//     rapid strafe reversals / backpedal never spin the view (deadzone)
//   - lock-on framing across separations 1..16 m on BOTH axes (±X and ±Z):
//     foe composed with headroom, player lower-third, player never blocks
//     the foe; juggle heights stay framed; >lock range still follows sanely
//   - 4-wall clamps (all walls + corners + custom bounds), floor clamp
//   - shake/kick/punchIn comfort caps in the tracked view, clean decay
//   - KO cinematic handoff/return (3D flight), round-1 entrance, replay orbit
//   - NO NaN under hostile inputs, ever

import * as THREE from 'three'
import { CameraController } from './CameraController.js'
import { EventBus } from '../core/EventBus.js'
import { buildCrowd } from '../arenas/ArenaBase.js' // §27 crowd/occlusion checks (DOM-free import)

// ---------------------------------------------------------------- seeded RNG
const seedArg = process.argv.indexOf('--seed')
let seed = (seedArg >= 0 ? Number(process.argv[seedArg + 1]) : 0xc0ffee) >>> 0
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

// ------------------------------------------------------------ console spy
const errors = []
const warns = []
console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 160)) }
console.warn = (...a) => { warns.push(a.map(String).join(' ').slice(0, 160)) }
console.debug = () => {}

// --------------------------------------------------------------- assert kit
let failures = 0
let checks = 0
function assert(cond, label) {
  checks++
  if (!cond) {
    failures++
    process.stdout.write(`  FAIL  ${label}\n`)
  }
  return cond
}

// ------------------------------------------------------------------- stubs
function makeGame() {
  return {
    events: new EventBus(),
    save: { get: (k, d) => d, set: () => {} },
    screens: { name: 'match' },
  }
}

function makeFighter(x, z = 0, height = 2.0) {
  return { pos: new THREE.Vector3(x, 0, z), facing: 0, facingSign: 1, def: { height } }
}

function makeRig(aspect = 16 / 9, bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5 }) {
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 400)
  const game = makeGame()
  const ctrl = new CameraController(camera, game)
  const p1 = makeFighter(-2.5, 0)
  const p2 = makeFighter(2.5, 0)
  ctrl.setFighters(p1, p2)
  ctrl.setBounds({ ...bounds, wallBounce: 0.55 })
  ctrl.setMode('match')
  return { camera, game, ctrl, p1, p2 }
}

function step(ctrl, frames) {
  for (let i = 0; i < frames; i++) ctrl.update(1 / 60)
}

function poseFinite(camera) {
  const p = camera.position
  const q = camera.quaternion
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) &&
    Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) &&
    Number.isFinite(q.w) && Number.isFinite(camera.fov)
}

const _m = new THREE.Matrix4()
const _frustum = new THREE.Frustum()
function frustumOf(camera) {
  camera.updateMatrixWorld(true)
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  camera.updateProjectionMatrix()
  _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  return _frustum.setFromProjectionMatrix(_m)
}

const _v = new THREE.Vector3()
function contains(camera, x, y, z = 0) {
  return frustumOf(camera).containsPoint(_v.set(x, y, z))
}

function ndc(camera, x, y, z = 0) {
  frustumOf(camera) // refresh matrices
  const out = _v.set(x, y, z).project(camera)
  return { x: out.x, y: out.y, z: out.z }
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// Rendered view heading on XZ straight from the camera matrices (radians,
// forward = (cos yaw, sin yaw)) — cross-checks getYaw().
function viewHeading(camera) {
  camera.updateMatrixWorld(true)
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  return Math.atan2(dir.z, dir.x)
}

// ================================================= 1. follow behind movement
process.stdout.write('[1] boom settles behind movement; dist band, height, pitch, getYaw\n')
{
  // Big-stadium bounds: this test is about pure follow behavior (wall behavior
  // is test [4]'s). +Z starts walking TOWARD the camera — the sustained 180°
  // turn must swing the boom behind at the capped rate.
  const headings = [
    { name: '+X', dx: 0.06, dz: 0 },
    { name: '-X', dx: -0.06, dz: 0 },
    { name: '+Z', dx: 0, dz: 0.06 },
    { name: '-Z', dx: 0, dz: -0.06 },
    { name: 'diag', dx: 0.045, dz: 0.045 },
  ]
  for (const hd of headings) {
    const { camera, ctrl, p1, p2 } = makeRig(16 / 9, { minX: -30, maxX: 30, minZ: -30, maxZ: 30 })
    p2.pos.set(40, 0, 40) // far away: pure free-roam follow, no lock
    p1.pos.set(-hd.dx * 100, 0, -hd.dz * 100) // start so the walk ends near center
    ctrl.setFighters(p1, p2)
    for (let i = 0; i < 200; i++) {
      p1.pos.x += hd.dx
      p1.pos.z += hd.dz
      ctrl.update(1 / 60)
    }
    // hold still a moment (velocity smoothing settles, yaw target freezes)
    step(ctrl, 90)
    const tag = `follow ${hd.name}`
    assert(poseFinite(camera), `${tag}: pose finite`)
    const moveYaw = Math.atan2(hd.dz, hd.dx)
    const yaw = ctrl.getYaw()
    assert(Number.isFinite(yaw), `${tag}: getYaw finite`)
    assert(Math.abs(wrapPi(yaw - moveYaw)) < 0.4,
      `${tag}: view heading ~= movement heading (err ${(wrapPi(yaw - moveYaw) * 57.3).toFixed(1)}°)`)
    assert(Math.abs(wrapPi(yaw - viewHeading(camera))) < 0.05,
      `${tag}: getYaw matches the rendered view`)
    // camera behind the character
    const bx = camera.position.x - p1.pos.x
    const bz = camera.position.z - p1.pos.z
    const behindYaw = Math.atan2(bz, bx)
    assert(Math.abs(wrapPi(behindYaw - (moveYaw + Math.PI))) < 0.45, `${tag}: boom is behind`)
    // dist band 5.2-8 (horizontal), height ~2.4 above character, pitch ~-12°
    const horiz = Math.hypot(bx, bz)
    assert(horiz > 4.9 && horiz < 8.5, `${tag}: dist in band (${horiz.toFixed(2)})`)
    const relH = camera.position.y - p1.pos.y
    assert(relH > 1.9 && relH < 3.1, `${tag}: height ~2.4 (${relH.toFixed(2)})`)
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const pitchDeg = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 57.3
    assert(pitchDeg < -4 && pitchDeg > -22, `${tag}: pitch ~-12° (${pitchDeg.toFixed(1)}°)`)
    // character composed (head framed), never blocked by the near plane
    assert(contains(camera, p1.pos.x, p1.pos.y + 2, p1.pos.z), `${tag}: character framed`)
    ctrl.dispose()
  }
}

// ==================================== 2. yaw-follow stability under strafing
process.stdout.write('[2] yaw stability: 3 rad/s cap, circle-strafe, reversal deadzone\n')
{
  // circle-strafe around a locked foe: yaw rate never exceeds the hard cap
  const { camera, ctrl, p1, p2 } = makeRig()
  p2.pos.set(0, 0, 0)
  p1.pos.set(4, 0, 0)
  ctrl.setFighters(p1, p2)
  step(ctrl, 120)
  let prevYaw = ctrl.getYaw()
  let maxRate = 0
  const omega = 2.2 // rad/s player orbit — under the cap, camera must keep up
  for (let i = 0; i < 480; i++) {
    const ang = (i / 60) * omega
    p1.pos.set(Math.cos(ang) * 4, 0, Math.sin(ang) * 4)
    ctrl.update(1 / 60)
    const y = ctrl.getYaw()
    maxRate = Math.max(maxRate, Math.abs(wrapPi(y - prevYaw)) * 60)
    prevYaw = y
    assert(poseFinite(camera), 'circle: pose finite')
    if (!Number.isFinite(y)) { assert(false, 'circle: getYaw finite'); break }
  }
  assert(maxRate <= 3.0 + 0.15, `circle-strafe yaw rate capped (max ${maxRate.toFixed(2)} rad/s)`)
  // after the orbit stops, the foe must be composed again (lock-on framing)
  step(ctrl, 300)
  assert(contains(camera, p2.pos.x, p2.pos.y + 2, p2.pos.z), 'circle: foe re-framed after strafe')
  ctrl.dispose()

  // rapid strafe reversals with NO lock: deadzone + backpedal guard hold the
  // view steady — no spinning, no oscillation
  const rig2 = makeRig(16 / 9, { minX: -30, maxX: 30, minZ: -30, maxZ: 30 })
  rig2.p2.pos.set(60, 0, 60) // far, far away
  rig2.p1.pos.set(0, 0, 0)
  rig2.ctrl.setFighters(rig2.p1, rig2.p2)
  step(rig2.ctrl, 60)
  const yaw0 = rig2.ctrl.getYaw()
  let maxDev = 0
  let maxRate2 = 0
  let prev2 = yaw0
  let dir = 1
  for (let i = 0; i < 360; i++) {
    if (i % 6 === 0) dir = -dir // violent strafe flip every 6 frames
    rig2.p1.pos.x += dir * 0.09
    rig2.ctrl.update(1 / 60)
    const y = rig2.ctrl.getYaw()
    maxDev = Math.max(maxDev, Math.abs(wrapPi(y - yaw0)))
    maxRate2 = Math.max(maxRate2, Math.abs(wrapPi(y - prev2)) * 60)
    prev2 = y
    assert(poseFinite(rig2.camera), 'reversal: pose finite')
  }
  assert(maxDev < 0.9, `strafe reversals never spin the view (max dev ${(maxDev * 57.3).toFixed(1)}°)`)
  assert(maxRate2 <= 3.0 + 0.15, `reversal yaw rate capped (${maxRate2.toFixed(2)} rad/s)`)
  // sustained 180° turn (walking toward the camera): the boom swings behind
  // the NEW direction — smoothly, rate-capped, converging — never a snap
  const yawB = rig2.ctrl.getYaw()
  let prevB = yawB
  let maxRateB = 0
  for (let i = 0; i < 300; i++) {
    rig2.p1.pos.x -= Math.cos(yawB) * 0.055
    rig2.p1.pos.z -= Math.sin(yawB) * 0.055
    rig2.ctrl.update(1 / 60)
    const y = rig2.ctrl.getYaw()
    maxRateB = Math.max(maxRateB, Math.abs(wrapPi(y - prevB)) * 60)
    prevB = y
    assert(poseFinite(rig2.camera), '180 turn: pose finite')
  }
  assert(maxRateB <= 3.0 + 0.15, `180 turn is rate-capped (${maxRateB.toFixed(2)} rad/s)`)
  assert(Math.abs(wrapPi(rig2.ctrl.getYaw() - (yawB + Math.PI))) < 0.6,
    '180 turn converges behind the new direction')
  rig2.ctrl.dispose()
}

// ================================ 3. lock-on framing, both axes, sep 1..16 m
process.stdout.write('[3] lock-on framing sweep: sep 1..16 m on ±X and ±Z (+ juggle, 4:3)\n')
{
  const axes = [
    { name: '+X', ux: 1, uz: 0 },
    { name: '-X', ux: -1, uz: 0 },
    { name: '+Z', ux: 0, uz: 1 },
    { name: '-Z', ux: 0, uz: -1 },
  ]
  const aspects = [16 / 9, 4 / 3]
  for (const aspect of aspects) {
    for (const ax of axes) {
      for (let sep = 1; sep <= 16; sep++) {
        if (aspect !== 16 / 9 && sep % 3 !== 1) continue // 4:3 spot-checks
        const { camera, ctrl, p1, p2 } = makeRig(aspect)
        p1.pos.set(0, 0, 0)
        p2.pos.set(ax.ux * sep, 0, ax.uz * sep)
        ctrl.setFighters(p1, p2)
        step(ctrl, 360)
        const tag = `sep=${sep} ${ax.name} ar=${aspect.toFixed(2)}`
        const h1 = p1.def.height
        const h2 = p2.def.height
        assert(poseFinite(camera), `${tag}: pose finite`)
        assert(Number.isFinite(ctrl.getYaw()), `${tag}: getYaw finite`)
        // tracked character always composed
        assert(contains(camera, p1.pos.x, p1.pos.y + h1, p1.pos.z), `${tag}: p1 head framed`)
        assert(contains(camera, p1.pos.x, p1.pos.y + h1 * 0.5, p1.pos.z), `${tag}: p1 chest framed`)
        // 4-wall + floor clamps always hold
        assert(camera.position.y > 0.55, `${tag}: camera above floor`)
        assert(camera.position.x > -9 - 2.6 && camera.position.x < 9 + 2.6, `${tag}: camera inside X bounds+slack`)
        assert(camera.position.z > -5.5 - 2.6 && camera.position.z < 5.5 + 2.6, `${tag}: camera inside Z bounds+slack`)
        if (sep <= 9) {
          // LOCKED: over-the-shoulder at the foe — foe composed with headroom
          assert(contains(camera, p2.pos.x, p2.pos.y + h2 + 0.3, p2.pos.z), `${tag}: foe head+headroom framed`)
          assert(contains(camera, p2.pos.x, p2.pos.y + 0.05, p2.pos.z), `${tag}: foe feet framed`)
          const nFoe = ndc(camera, p2.pos.x, p2.pos.y + h2 * 0.5, p2.pos.z)
          assert(Math.abs(nFoe.x) < 0.7, `${tag}: foe composed near center (x=${nFoe.x.toFixed(2)})`)
          const nP1 = ndc(camera, p1.pos.x, p1.pos.y + h1 * 0.5, p1.pos.z)
          assert(nP1.y < 0.2, `${tag}: p1 reads lower-third (y=${nP1.y.toFixed(2)})`)
          assert(nFoe.y > nP1.y + 0.03 || Math.abs(nFoe.x - nP1.x) > 0.06,
            `${tag}: p1 does not block the foe`)
          // view looks from behind p1 toward the foe
          const yaw = ctrl.getYaw()
          const toFoe = Math.atan2(p2.pos.z - p1.pos.z, p2.pos.x - p1.pos.x)
          assert(Math.abs(wrapPi(yaw - toFoe)) < 0.9, `${tag}: view looks toward the foe`)
          // boom stays in the auto band (walls may shorten it, never stretch it)
          const horiz = Math.hypot(camera.position.x - p1.pos.x, camera.position.z - p1.pos.z)
          assert(horiz < 8.6, `${tag}: boom <= band max (${horiz.toFixed(2)})`)
        }
        ctrl.dispose()
      }
    }
  }
  // juggled foe stays framed while locked
  for (const sep of [2, 5, 8]) {
    const { camera, ctrl, p1, p2 } = makeRig()
    p1.pos.set(0, 0, 0)
    p2.pos.set(sep, 3.2, 0)
    ctrl.setFighters(p1, p2)
    step(ctrl, 360)
    const tag = `juggle sep=${sep}`
    assert(poseFinite(camera), `${tag}: pose finite`)
    assert(contains(camera, p2.pos.x, p2.pos.y + 2, p2.pos.z), `${tag}: airborne foe framed`)
    assert(contains(camera, p1.pos.x, p1.pos.y + 2, p1.pos.z), `${tag}: p1 still framed`)
    ctrl.dispose()
  }
}

// ============================================= 4. free-roam 4-wall clamps
process.stdout.write('[4] free-roam wall clamps: all walls, corners, custom bounds\n')
{
  const spots = [
    [-8.7, 0], [8.7, 0], [0, -5.2], [0, 5.2],       // each wall
    [-8.7, -5.2], [8.7, -5.2], [-8.7, 5.2], [8.7, 5.2], // corners
  ]
  for (const [x, z] of spots) {
    const { camera, ctrl, p1, p2 } = makeRig()
    p1.pos.set(x, 0, z)
    p2.pos.set(x * 0.3, 0, z * 0.3) // foe inward -> boom pushed toward the wall
    ctrl.setFighters(p1, p2)
    step(ctrl, 360)
    const tag = `wall (${x},${z})`
    assert(poseFinite(camera), `${tag}: pose finite`)
    assert(camera.position.x >= -9 - 2.6 && camera.position.x <= 9 + 2.6, `${tag}: X clamp`)
    assert(camera.position.z >= -5.5 - 2.6 && camera.position.z <= 5.5 + 2.6, `${tag}: Z clamp`)
    assert(camera.position.y > 0.55, `${tag}: floor clamp`)
    assert(contains(camera, p1.pos.x, p1.pos.y + 2, p1.pos.z), `${tag}: p1 framed at the wall`)
    ctrl.dispose()
  }
  // roam the full perimeter — camera never leaves bounds+slack at any point
  {
    const { camera, ctrl, p1, p2 } = makeRig()
    p2.pos.set(0, 0, 0)
    ctrl.setFighters(p1, p2)
    let ok = true
    for (let i = 0; i < 720; i++) {
      const tAng = i / 720 * Math.PI * 2
      p1.pos.set(Math.cos(tAng) * 8.6, 0, Math.sin(tAng) * 5.1)
      ctrl.update(1 / 60)
      if (!(camera.position.x >= -11.7 && camera.position.x <= 11.7 &&
            camera.position.z >= -8.2 && camera.position.z <= 8.2 &&
            camera.position.y > 0.55 && poseFinite(camera))) { ok = false; break }
    }
    assert(ok, 'perimeter roam: camera stays clamped and finite throughout')
    ctrl.dispose()
  }
  // custom bounds (bigger stadium) are respected, minZ/maxZ defaults applied
  {
    const rig = makeRig(16 / 9, { minX: -20, maxX: 20, minZ: -12, maxZ: 12 })
    rig.p1.pos.set(-19.5, 0, -11.5)
    rig.p2.pos.set(-15, 0, -8)
    rig.ctrl.setFighters(rig.p1, rig.p2)
    step(rig.ctrl, 300)
    assert(rig.camera.position.x >= -20 - 2.6 && rig.camera.position.z >= -12 - 2.6,
      'custom bounds clamp')
    assert(poseFinite(rig.camera), 'custom bounds: pose finite')
    rig.ctrl.dispose()
  }
}

// ================================================ 5. shake/kick/punch caps
process.stdout.write('[5] shake/kick/punchIn: comfort caps hold, decays clean\n')
{
  const { camera, ctrl, game } = makeRig()
  step(ctrl, 240)
  const base = camera.position.clone()
  const baseFov = camera.fov
  ctrl.shake(1.5)
  ctrl.kick(1, 1, 0.4)
  ctrl.punchIn(0.3)
  game.events.emit('camera:shake', { mag: 2 })
  let maxOff = 0
  let minFov = Infinity
  for (let i = 0; i < 120; i++) {
    ctrl.update(1 / 60)
    assert(poseFinite(camera), 'shake: pose finite')
    maxOff = Math.max(maxOff, camera.position.distanceTo(base))
    minFov = Math.min(minFov, camera.fov)
  }
  assert(maxOff > 0.01, 'shake/kick actually moves the camera')
  assert(maxOff < 0.75, `shake offset comfort-capped (max ${maxOff.toFixed(2)} m)`)
  assert(minFov > 45 * 0.9 && minFov < 45, `punchIn dips FOV sanely (${minFov.toFixed(2)})`)
  step(ctrl, 240)
  assert(camera.position.distanceTo(base) < 0.05, 'shake fully decays back to the rig pose')
  assert(Math.abs(camera.fov - baseFov) < 1e-3, 'FOV recovers')
  // fighter:hit event self-wires a kick without exploding
  game.events.emit('fighter:hit', { slot: 1, damage: 14 })
  step(ctrl, 30)
  assert(poseFinite(camera), 'fighter:hit kick: pose finite')
  ctrl.dispose()
}

// ================================ 6. KO cinematic, entrance, replay, tracked
process.stdout.write('[6] KO cinematic (3D flight), entrance, replay orbit, setTracked\n')
{
  const { camera, ctrl, game, p1, p2 } = makeRig()
  step(ctrl, 240)
  const before = camera.position.clone()
  ctrl.koCinematic(p2)
  ctrl.update(1 / 60)
  assert(camera.position.distanceTo(before) < 1.2, 'KO cinematic hands off without a cut')
  p2.pos.set(6, 2, 3) // ragdoll flying in full 3D
  for (let i = 0; i < 180; i++) {
    p2.pos.x += 0.05
    p2.pos.z += 0.03
    ctrl.update(1 / 60)
    assert(poseFinite(camera), 'cinematic: pose finite')
  }
  assert(ctrl.mode === 'cinematic', 'koCinematic engaged')
  // round restart returns to a composed tracking view, yaw rate-capped
  p1.pos.set(-2.5, 0, 0)
  p2.pos.set(2.5, 0, 0)
  game.events.emit('round:start', { round: 2 })
  assert(ctrl.mode === 'match', 'round:start returns to match')
  ctrl.update(1 / 60) // one frame of grace at the mode boundary (wall clamp re-entry)
  // The 3 rad/s HARD cap is a boom-azimuth promise; the rendered view may
  // additionally rotate while the look point eases home — that stays inside
  // the 6°/frame comfort budget.
  let prevBoom = ctrl._yawApplied
  let prevYaw = ctrl.getYaw()
  let maxBoomRate = 0
  let maxViewRate = 0
  for (let i = 0; i < 300; i++) {
    ctrl.update(1 / 60)
    maxBoomRate = Math.max(maxBoomRate, Math.abs(wrapPi(ctrl._yawApplied - prevBoom)) * 60)
    prevBoom = ctrl._yawApplied
    const y = ctrl.getYaw()
    maxViewRate = Math.max(maxViewRate, Math.abs(wrapPi(y - prevYaw)) * 60)
    prevYaw = y
  }
  assert(maxBoomRate <= 3.0 + 0.15, `post-cinematic boom yaw rate capped (${maxBoomRate.toFixed(2)} rad/s)`)
  assert(maxViewRate <= 6.3, `post-cinematic view swing inside 6°/frame comfort (${maxViewRate.toFixed(2)} rad/s)`)
  assert(contains(camera, p2.pos.x, p2.pos.y + 2, p2.pos.z), 'post-cinematic frames the foe')
  // round-1 entrance: wide open, eases home, stays finite and framed
  game.events.emit('round:start', { round: 1 })
  const d0 = ctrl.sd.v
  for (let i = 0; i < 160; i++) {
    ctrl.update(1 / 60)
    assert(poseFinite(camera), 'entrance: pose finite')
  }
  assert(ctrl.sd.v < d0 + 0.01, `entrance eases in from wide (d0 ${d0.toFixed(1)} -> ${ctrl.sd.v.toFixed(1)})`)
  assert(contains(camera, p2.pos.x, p2.pos.y + 2, p2.pos.z), 'entrance keeps the foe framed')
  // replay orbit still works
  ctrl.setMode('replay')
  ctrl.setOrbit({ center: { x: 1, y: 1.2, z: 0 }, dist: 7, speed: 0.5 })
  step(ctrl, 120)
  assert(poseFinite(camera), 'replay orbit: pose finite')
  const rd = Math.hypot(camera.position.x - 1, camera.position.z - 0)
  assert(Math.abs(rd - 7) < 0.2, `replay orbit radius (${rd.toFixed(2)})`)
  ctrl.setMode('match')
  step(ctrl, 240)
  assert(poseFinite(camera), 'replay -> match: pose finite')
  // setTracked: follow slot 1 instead — no cut, then composed on the new pivot
  const preSwitch = camera.position.clone()
  ctrl.setTracked(p2)
  ctrl.update(1 / 60)
  assert(camera.position.distanceTo(preSwitch) < 1.2, 'setTracked eases over, never cuts')
  step(ctrl, 360)
  assert(contains(camera, p2.pos.x, p2.pos.y + 2, p2.pos.z), 'setTracked: new pivot framed')
  const horiz = Math.hypot(camera.position.x - p2.pos.x, camera.position.z - p2.pos.z)
  assert(horiz < 8.6, `setTracked: boom on the new pivot (${horiz.toFixed(2)})`)
  ctrl.dispose()
}

// ================================================== 7. hostile inputs / NaN
process.stdout.write('[7] hostile inputs: NO NaN, ever\n')
{
  const { camera, ctrl, game, p1, p2 } = makeRig()
  const hostile = [
    () => { p1.pos.set(NaN, NaN, NaN) },
    () => { p2.pos.set(Infinity, -Infinity, NaN) },
    () => { p1.facing = NaN; p2.facing = 'left'; p1.facingSign = undefined },
    () => { ctrl.setBounds({ minX: NaN, maxX: 'wide', minZ: 4, maxZ: -4, floorY: Infinity }) },
    () => { ctrl.shake(NaN); ctrl.shake(1e9); ctrl.kick(NaN, Infinity, NaN); ctrl.punchIn(NaN) },
    () => { game.events.emit('slowmo', { scale: 0, seconds: NaN }) },
    () => { game.events.emit('fighter:hit', { slot: 7, damage: NaN }) },
    () => { ctrl.koCinematic({}) },
    () => { game.events.emit('round:start', { round: 1 }) },
    () => { ctrl.setFighters(null, null) },
    () => { ctrl.setTracked(null); ctrl.setTracked({ pos: new THREE.Vector3(NaN, 0, 0) }) },
    () => { ctrl.update(NaN); ctrl.update(-3); ctrl.update(0); ctrl.update(1e9) },
    () => { ctrl.setStyle('classic'); ctrl.setStyle(undefined) }, // deprecated no-op
    () => { ctrl.setMode('garbage'); ctrl.setOrbit({ dist: NaN }); ctrl.setFree({ x: NaN }) },
  ]
  for (const abuse of hostile) {
    try { abuse() } catch (e) { assert(false, `hostile op threw: ${e.message}`) }
    for (let i = 0; i < 30; i++) {
      ctrl.update(1 / 60)
      if (!assert(poseFinite(camera), 'hostile: pose finite')) break
      if (!assert(Number.isFinite(ctrl.getYaw()), 'hostile: getYaw finite')) break
    }
  }
  // recovery: sane fighters again -> composed framing returns
  const f1 = makeFighter(-2, 0)
  const f2 = makeFighter(2, 1)
  ctrl.setFighters(f1, f2)
  ctrl.setBounds({ minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5 })
  step(ctrl, 300)
  assert(poseFinite(camera), 'recovery: pose finite')
  assert(contains(camera, f1.pos.x, f1.pos.y + 2, f1.pos.z) &&
    contains(camera, f2.pos.x, f2.pos.y + 2, f2.pos.z),
  'recovery: both framed again')
  ctrl.dispose()
}

// ==================== 8. occlusion fade: hysteresis, restore, crowd no-vanish
process.stdout.write('[8] occlusion: continuous fade + hysteresis, crowd never vanishes, team tints\n')
{
  // --- a) prop fade: fades while occluding, holds through boundary chatter,
  //        restores exactly after release -----------------------------------
  {
    const { camera, ctrl, p1, p2 } = makeRig()
    p1.pos.set(-2.5, 0, 0)
    p2.pos.set(2.5, 0, 0)
    ctrl.setFighters(p1, p2)
    const root = new THREE.Group()
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x8888ff })
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 4), wallMat)
    wall.position.set(0.5, 2, 0) // between the boom (behind p1) and the foe
    root.add(wall)
    root.updateMatrixWorld(true)
    ctrl.setOccluders(root)
    step(ctrl, 120)
    assert(wallMat.transparent === true, 'occlusion: wall marked transparent while occluding')
    assert(wallMat.opacity < 0.35, `occlusion: wall faded (${wallMat.opacity.toFixed(2)})`)
    assert(wallMat.depthWrite === false, 'occlusion: faded wall stops depth-writing')
    // boundary chatter: occluding/clear every other frame — hysteresis keeps
    // it faded, opacity never strobes back toward opaque
    let maxOp = 0
    for (let i = 0; i < 60; i++) {
      wall.position.z = (i % 2) ? 0 : 60
      root.updateMatrixWorld(true)
      ctrl.update(1 / 60)
      maxOp = Math.max(maxOp, wallMat.opacity)
    }
    assert(maxOp < 0.5, `occlusion: no flicker at the boundary (max opacity ${maxOp.toFixed(2)})`)
    // clear for good: restores fully AND exactly (props + map entry dropped)
    wall.position.set(60, 2, 60)
    root.updateMatrixWorld(true)
    step(ctrl, 90)
    assert(Math.abs(wallMat.opacity - 1) < 1e-6, `occlusion: opacity restored exactly (${wallMat.opacity})`)
    assert(wallMat.transparent === false && wallMat.depthWrite === true, 'occlusion: material props restored')
    assert(ctrl._occFaded.size === 0, 'occlusion: fade cache empty after restore')
    ctrl.dispose()
  }

  // --- b) crowd reliability: frustumCulled off, correct initial matrices,
  //        never fades from a normal-height camera, never vanishes ----------
  {
    const crowd = buildCrowd({ count: 40, area: { w: 12, d: 2.4 } })
    assert(crowd.mesh.frustumCulled === false, 'crowd: frustumCulled is OFF (vanish bug fix)')
    assert(crowd.mesh.userData.isCrowd === true && crowd.group.userData.isCrowd === true,
      'crowd: tagged isCrowd for the camera')
    // instance matrices are composed at build (not identity), all finite
    const m0 = new THREE.Matrix4()
    crowd.mesh.getMatrixAt(0, m0)
    assert(m0.elements.every(Number.isFinite), 'crowd: instance matrix finite at build')
    const ident = new THREE.Matrix4()
    let anyPlaced = false
    for (let i = 0; i < crowd.count; i++) {
      crowd.mesh.getMatrixAt(i, m0)
      if (!m0.equals(ident)) { anyPlaced = true; break }
    }
    assert(anyPlaced, 'crowd: instances placed at build time (no stale identity matrices)')

    const { camera, ctrl, p1, p2 } = makeRig()
    const root = new THREE.Group()
    crowd.group.position.set(0, 0, 7) // ringside, just past the +Z wall
    crowd.group.rotation.y = Math.PI
    root.add(crowd.group)
    root.updateMatrixWorld(true)
    ctrl.setOccluders(root)
    const crowdMat = crowd.mesh.material
    // 500 random camera/fighter configurations — the no-vanish invariant:
    // visible flag stays true, culling stays off, opacity never below ~0.25;
    // and with the camera at normal boom height the crowd NEVER fades at all.
    let visOk = true
    let fadeFloorOk = true
    let highFadeOk = true
    for (let cfg = 0; cfg < 500; cfg++) {
      const high = cfg < 300 // first 300: normal-height camera, no fade allowed
      p1.pos.set((Math.random() - 0.5) * 17, 0, (Math.random() - 0.5) * 10)
      p2.pos.set((Math.random() - 0.5) * 17, Math.random() * 3, (Math.random() - 0.5) * 10)
      camera.position.set(
        (Math.random() - 0.5) * 22,
        high ? 2.2 + Math.random() * 3.5 : 0.8 + Math.random() * 5,
        (Math.random() - 0.5) * 16,
      )
      camera.lookAt(p2.pos.x, p2.pos.y + 1, p2.pos.z)
      crowd.update(1 / 60)
      ctrl.update(1 / 60) // occlusion samples OUR camera pose (pre-rig, 1-frame lag)
      if (!crowd.mesh.visible || crowd.mesh.frustumCulled) visOk = false
      if (!(crowdMat.opacity > 0.24)) fadeFloorOk = false
      if (high && crowdMat.opacity !== 1) highFadeOk = false
    }
    assert(visOk, 'crowd: visible flag + culling-off held over 500 random configs')
    assert(fadeFloorOk, 'crowd: opacity never below the 0.25 fade floor')
    assert(highFadeOk, 'crowd: never faded by a normal-height camera')
    // knocked-over spectators always restore (audit: no stuck states)
    crowd.knockOverRandom(6)
    for (let i = 0; i < 60 * 8; i++) crowd.update(1 / 60)
    let allUpright = true
    const mA = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pv = new THREE.Vector3()
    const sv = new THREE.Vector3()
    for (let i = 0; i < crowd.count; i++) {
      crowd.mesh.getMatrixAt(i, mA)
      mA.decompose(pv, q, sv)
      if (!mA.elements.every(Number.isFinite) || sv.x <= 0) allUpright = false
    }
    assert(allUpright, 'crowd: knockOver states all restore, matrices finite')
    ctrl.dispose()
    crowd.dispose()
  }

  // --- c) team shirts: ~12% per fighter color, rest palette, opt-in only ---
  {
    const crowd = buildCrowd({ count: 64, area: { w: 14, d: 2.4 }, teamColors: ['#ff0000', '#0000ff'] })
    const c = new THREE.Color()
    let reds = 0
    let blues = 0
    for (let i = 0; i < crowd.count; i++) {
      crowd.mesh.getColorAt(i, c)
      // team seats are every 8th instance (offset 0 = P1, offset 4 = P2);
      // shirt jitter is small, so the fighter color must clearly dominate
      if (i % 8 === 0 && c.r > 0.8 && c.g < 0.2 && c.b < 0.2) reds++
      if (i % 8 === 4 && c.b > 0.8 && c.r < 0.2 && c.g < 0.2) blues++
    }
    assert(reds === 8, `team shirts: 12.5% wear P1's color (${reds}/8 seats)`)
    assert(blues === 8, `team shirts: 12.5% wear P2's color (${blues}/8 seats)`)
    crowd.dispose()
    // no teamColors -> per-instance colors identical to the untinted build
    const plain1 = buildCrowd({ count: 16 })
    const plain2 = buildCrowd({ count: 16 })
    const cA = new THREE.Color()
    const cB = new THREE.Color()
    let identical = true
    for (let i = 0; i < 16; i++) {
      plain1.mesh.getColorAt(i, cA)
      plain2.mesh.getColorAt(i, cB)
      if (Math.abs(cA.r - cB.r) + Math.abs(cA.g - cB.g) + Math.abs(cA.b - cB.b) > 1e-6) identical = false
    }
    assert(identical, 'team shirts: untinted crowds still deterministic (rng stream unchanged)')
    plain1.dispose()
    plain2.dispose()
  }
}

// ------------------------------------------------------------------ summary
const errLines = errors.filter((e) => !e.includes('[events] handler')) // bus wraps throws
if (errLines.length) {
  failures++
  process.stdout.write(`  FAIL  console.error during run:\n    ${errLines.slice(0, 5).join('\n    ')}\n`)
}
process.stdout.write(`\n${checks} checks, ${failures} failures` +
  (warns.length ? ` (${warns.length} warns, firewall warns are OK under hostile input)` : '') + '\n')
process.exit(failures ? 1 : 0)
