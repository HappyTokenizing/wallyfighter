// Headless AI validation harness — dev tool, never imported by the game.
// Runs every roster fighter against every other (45 pairings, 2 trimmed
// rounds each) with the personality AI driving both sides, asserting that
// nothing throws and that no fighter dominates or folds across the sweep.
//
// v2.0 (§17): the AI navigates the XZ plane. The harness probes whether the
// installed Fighter consumes the world-space depth intent (ctrl.moveZ /
// axisY) itself; while the free-roam Fighter conversion is still in flight it
// falls back to a transitional shim that integrates ctrl.moveZ directly, so
// the 2D Brain is exercised either way. Hits gate on z-proximity (a crude
// stand-in for the distance+cone test) and grabs use radial distance. The
// report includes a plane-usage stat proving the AI actually leaves the lane.
//
//   node src/ai/harness.js            # level 3 vs level 3, seeded RNG
//   node src/ai/harness.js --level 5
//
// The harness swaps each character's buildModel for a tiny node-safe rig
// (character models draw procedural canvas textures, which need a browser)
// and mirrors MatchScreen's hit resolution in simplified form — real
// Fighter state machine, real move scanning, real chain cancels, real AI.
import * as THREE from 'three'
import { Fighter } from '../combat/Fighter.js'
import { AIControl } from '../combat/AIControl.js'
import { SpecialContext } from '../combat/SpecialContext.js'
import { EventBus } from '../core/EventBus.js'
import { Characters, RosterOrder } from '../characters/index.js'

// ---------------------------------------------------------------- seeded RNG
const seedArg = process.argv.indexOf('--seed')
let seed = (seedArg >= 0 ? Number(process.argv[seedArg + 1]) : 0xc0ffee) >>> 0
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

// ------------------------------------------------------------ console spy
const scriptErrors = []
const hardErrors = []
const realError = console.error.bind(console)
console.error = (...args) => { scriptErrors.push(args.map(String).join(' ').slice(0, 160)) }
console.warn = () => {}
console.debug = () => {}

// ------------------------------------------------------------- stub rig
function stubRig() {
  const group = new THREE.Group()
  const bones = {}
  const mk = (name, parent) => {
    const g = new THREE.Group()
    parent.add(g)
    bones[name] = g
    return g
  }
  const hips = mk('hips', group)
  const torso = mk('torso', hips)
  mk('head', torso)
  const armL = mk('armL', torso)
  const armR = mk('armR', torso)
  mk('forearmL', armL)
  mk('forearmR', armR)
  const legL = mk('legL', hips)
  const legR = mk('legR', hips)
  mk('shinL', legL)
  mk('shinR', legR)
  return { group, bones }
}

function headlessDef(def) {
  return { ...def, buildModel: () => stubRig() }
}

// ---------------------------------------------------------- harness match
function propStub() {
  return {
    mesh: new THREE.Group(),
    body: {
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      position: new THREE.Vector3(),
      quaternion: { set() {}, copy() {} },
      applyImpulse() {},
      applyLocalImpulse() {},
    },
    break() {},
    remove() {},
  }
}

class HarnessMatch {
  constructor() {
    this.game = {
      events: new EventBus(),
      audio: { sfx() {}, music() {}, stopMusic() {}, announcer() {}, crowd() {} },
      frame: 0,
      quality: { propLimit: 0, crowd: 0 },
    }
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.55 }
    this.presetCfg = { bounce: 0.3 }
    this.particles = { burst() {} }
    this.props = { spawn: () => propStub() }
    this.physics = { addProp: () => propStub(), addStaticBox() {}, impulse() {}, step() {}, setPreset() {} }
    this.arena = { group: null, bounds: this.bounds, floorY: 0, spawnPoints: [-3, 3], update() {}, dispose() {} }
    this.cam = { punchIn() {}, shake() {} }
    this.finisherReady = [false, false]
    this.active = true
    this.worldFrame = 0
    this.fxList = []
    this.fighters = []
  }

  cap() {}
  say() {}
  setSlowmo() {}
  tryFinisherChord() { return false }

  makeFx(self, onEnd) {
    const fx = new SpecialContext(this, self, self.foe, onEnd)
    this.fxList.push(fx)
    return fx
  }

  applyScriptHit(self, foe, spec = {}) {
    if (self) self._scriptDealt = true
    if (!foe || foe.isInvulnerable()) return
    const dmg = (spec.damage ?? 6) * (self?.damageMult ?? 1)
    foe.setHp(foe.hp - dmg)
    const kb = spec.knockback || { x: 5, y: 2 }
    const sgn = self ? fsgn(self) : 1
    if ((spec.ragdoll || 0) >= 1 || (kb.y || 0) > 3.5) {
      foe.enterLaunched(sgn * (kb.x || 5), Math.max(4, kb.y || 4), kb.spin || 1)
    } else {
      foe.enterHitstun(spec.hitStun || 14, true, sgn * (kb.x || 5) * 0.5)
    }
    if (self) { self.comboHits++; self.comboLastFrame = this.worldFrame }
  }

  applyImpulse(target, vec) {
    if (target?.vel && Array.isArray(vec)) {
      target.vel.x += vec[0] || 0
      target.vel.y += vec[1] || 0
    }
  }

  forceRagdoll(f, impulse) {
    const v = Array.isArray(impulse) ? impulse : [fsgn(f) * -6, 6, 0]
    f.enterLaunched(v[0] || 0, Math.max(4, v[1] || 6), 1)
  }

  finishThrow(self, foe, move) {
    foe.state = 'idle'
    const dmg = (move?.damage || 10) * self.damageMult
    foe.setHp(foe.hp - dmg)
    foe.enterLaunched(fsgn(self) * 6 * self.knockbackMult, 7, 1)
    self.comboHits++
    self.comboLastFrame = this.worldFrame
    self.endMove()
  }
}

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
// legacy ±1 facing OR v2 yaw+facingSign — resolve to a world-X knockback sign
const fsgn = (f) => {
  if (typeof f?.facingSign === 'number' && f.facingSign !== 0) return f.facingSign > 0 ? 1 : -1
  const v = f?.facing ?? 1
  return (Math.abs(v) <= 1.01 ? v >= 0 : Math.cos(v) >= 0) ? 1 : -1
}
// crude stand-in for §17's distance+cone hit test until/alongside the 2D
// Fighter: attacks only connect when the fighters are z-aligned
const Z_HIT_GAP = 0.9

function scanHits(match) {
  for (const f of match.fighters) {
    const foe = f.foe
    const zAligned = Math.abs((f.pos.z || 0) - (foe.pos.z || 0)) < Z_HIT_GAP
    const hb = f.activeHitbox()
    if (hb && zAligned && !foe.isInvulnerable() && overlap(hb, foe.hurtbox())) {
      const m = hb.move
      f.hitDone = true
      f.contactMade = true
      if (foe.isBlockingAgainst(f)) {
        foe.enterBlockstun(m.blockStun || 8, fsgn(f) * 3)
        f.gainMeter(2)
      } else {
        const scale = Math.max(0.3, Math.pow(0.9, f.comboHits))
        const dmg = (m.damage || 5) * f.damageMult * scale
        foe.setHp(foe.hp - dmg)
        f.gainMeter(m.meterGain ?? 5)
        foe.gainMeter(dmg * 0.4)
        const kb = m.knockback || { x: 4, y: 0 }
        if (m.launcher || (kb.y || 0) > 3.5) {
          foe.enterLaunched(fsgn(f) * (kb.x || 4) * f.knockbackMult, Math.max(5, kb.y || 5), kb.spin || 0.5)
        } else {
          foe.enterHitstun(m.hitStun || 14, m.kind === 'heavy' || m.kind === 'special', fsgn(f) * (kb.x || 4) * 0.6)
        }
        f.comboHits++
        f.comboLastFrame = match.worldFrame
      }
    }
    // Scripted moves (activeHitbox returns null for those) mostly deal damage
    // through fx.hit; scripts that rely on spawned props/projectiles can't
    // connect against this harness's prop stubs, so synthesize the MoveDef
    // hitbox late in the active window if the script hasn't dealt damage yet.
    if (f.state === 'attack' && f.scriptFx && f.currentMove && !f.hitDone) {
      const m = f.currentMove
      if (f._hMove !== m) { f._hMove = m; f._scriptDealt = false }
      const start = m.startup || 0
      const end = start + (m.active || 0)
      if ((m.damage || 0) > 0 && !f._scriptDealt && zAligned && f.moveFrame >= start && f.moveFrame <= end && !foe.isInvulnerable()) {
        const box = m.hitbox || { w: 1, h: 0.8, forward: 1, up: 1.2 }
        const cx = f.pos.x + fsgn(f) * (box.forward ?? 1)
        const cy = f.pos.y + (box.up ?? 1.2)
        const hb2 = { x0: cx - box.w / 2, x1: cx + box.w / 2, y0: cy - box.h / 2, y1: cy + box.h / 2 }
        if (overlap(hb2, foe.hurtbox())) {
          f.hitDone = true
          f.contactMade = true
          if (foe.isBlockingAgainst(f)) {
            foe.enterBlockstun(m.blockStun || 8, fsgn(f) * 3)
          } else {
            const dmg = (m.damage || 5) * f.damageMult * Math.max(0.3, Math.pow(0.9, f.comboHits))
            foe.setHp(foe.hp - dmg)
            f.gainMeter(m.meterGain ?? 5)
            const kb = m.knockback || { x: 4, y: 0 }
            if (m.launcher || (kb.y || 0) > 3.5) foe.enterLaunched(fsgn(f) * (kb.x || 4), Math.max(5, kb.y || 5), kb.spin || 0.5)
            else foe.enterHitstun(m.hitStun || 14, true, fsgn(f) * (kb.x || 4) * 0.6)
            f.comboHits++
            f.comboLastFrame = match.worldFrame
          }
        }
      }
    }
    if (f.grabActive()) {
      const dist = Math.hypot(f.pos.x - foe.pos.x, (f.pos.z || 0) - (foe.pos.z || 0))
      if (dist < 1.3 && foe.grounded() && !foe.isInvulnerable() && foe.state !== 'grabbed') {
        f.hitDone = true
        foe.currentMove = null
        foe.scriptFx = null
        foe.state = 'grabbed'
        foe.stateFrames = 0
        f.throwSeq = { foe, move: f.currentMove, t: 0 }
      }
    }
  }
  // combo drop
  for (const f of match.fighters) {
    if (f.comboHits > 0 && f.foe.isNeutral() && match.worldFrame - f.comboLastFrame > 20) f.comboHits = 0
  }
}

// ---------------------------------------------------- 2D capability probe
// Does the installed Fighter consume the world-space depth intent itself?
// (The free-roam Fighter conversion lands separately — until it does, the
// harness integrates ctrl.moveZ with a transitional shim so the 2D Brain is
// exercised either way.)
function probeFighterConsumesZ() {
  const match = new HarnessMatch()
  const mkCtrl = (z) => ({
    worldMove: true, moveX: 0, moveZ: z,
    axis: () => 0, axisY: () => z,
    isDown: () => false, pressed: () => false, buffer: () => [],
    frameNum: () => 0, wantsDash: () => 0, wantsDashVec: () => null, updateAI() {},
  })
  try {
    const fa = new Fighter(match, 0, headlessDef(Characters[RosterOrder[0]]), mkCtrl(1))
    const fb = new Fighter(match, 1, headlessDef(Characters[RosterOrder[0]]), mkCtrl(0))
    fa.foe = fb
    fb.foe = fa
    match.fighters = [fa, fb]
    fa.reset(-3, 1)
    fb.reset(3, -1)
    for (let i = 0; i < 30; i++) fa.update(1 / 60, true)
    return Math.abs(fa.pos.z || 0) > 0.05
  } catch {
    return false
  }
}
const FIGHTER_2D = probeFighterConsumesZ()
const SHIM_STATES = new Set(['idle', 'walk'])
const zPad = 0.35

// ------------------------------------------------------------- match loop
const ROUND_FRAMES = 60 * 35 // trimmed rounds: 35 simulated seconds
const planeStats = { peakSum: 0, matches: 0, peakMax: 0 }

function runMatch(idA, idB, level) {
  const match = new HarnessMatch()
  const ca = new AIControl(level)
  const cb = new AIControl(level)
  const fa = new Fighter(match, 0, headlessDef(Characters[idA]), ca)
  const fb = new Fighter(match, 1, headlessDef(Characters[idB]), cb)
  fa.foe = fb
  fb.foe = fa
  match.fighters = [fa, fb]
  const roundWins = [0, 0]
  let peakZ = 0

  for (let round = 0; round < 2; round++) {
    fa.reset(-3, 1)
    fb.reset(3, -1)
    ca.clearPlan()
    cb.clearPlan()
    let winner = -1
    for (let fr = 0; fr < ROUND_FRAMES; fr++) {
      match.worldFrame++
      match.game.frame++
      try {
        ca.updateAI(fa, fb, true)
        cb.updateAI(fb, fa, true)
      } catch (e) {
        hardErrors.push(`AI ${idA}v${idB} r${round}: ${e.stack?.split('\n')[0]}`)
        break
      }
      try {
        fa.update(1 / 60, true)
        fb.update(1 / 60, true)
        // transitional depth shim (see probeFighterConsumesZ) + z bounds clamp
        for (const f of match.fighters) {
          if (!FIGHTER_2D && SHIM_STATES.has(f.state) && f.grounded()) {
            f.pos.z = (f.pos.z || 0) + (f.ctrl.moveZ || 0) * (f.def.walkSpeed || 4) * (1 / 60)
          }
          const bz = match.bounds
          f.pos.z = Math.max(bz.minZ + zPad, Math.min(bz.maxZ - zPad, f.pos.z || 0))
          const az = Math.abs(f.pos.z)
          if (az > peakZ) peakZ = az
        }
        scanHits(match)
        for (const fx of [...match.fxList]) fx.step()
        match.fxList = match.fxList.filter((fx) => !fx.done)
      } catch (e) {
        hardErrors.push(`SIM ${idA}v${idB} r${round}: ${e.stack?.split('\n')[0]}`)
        break
      }
      if (!isFinite(fa.pos.x) || !isFinite(fb.pos.x) || !isFinite(fa.pos.y) || !isFinite(fb.pos.y)) {
        hardErrors.push(`NaN position ${idA}v${idB} r${round} fr${fr}`)
        break
      }
      if (fa.hp <= 0) { winner = 1; break }
      if (fb.hp <= 0) { winner = 0; break }
    }
    if (winner < 0) winner = fa.hp >= fb.hp ? 0 : 1 // timeout: health decides
    roundWins[winner]++
    for (const fx of match.fxList) { try { fx.flush() } catch { /* stub */ } }
    match.fxList = []
  }
  match.active = false
  ca.dispose?.()
  cb.dispose?.()
  planeStats.matches++
  planeStats.peakSum += peakZ
  if (peakZ > planeStats.peakMax) planeStats.peakMax = peakZ
  return roundWins
}

// ------------------------------------------------------------------ sweep
const level = (() => {
  const i = process.argv.indexOf('--level')
  return i >= 0 ? Number(process.argv[i + 1]) || 3 : 3
})()

const roster = RosterOrder
const wins = Object.fromEntries(roster.map((id) => [id, 0]))
const rounds = Object.fromEntries(roster.map((id) => [id, 0]))
const matrix = []
let matches = 0

for (let i = 0; i < roster.length; i++) {
  for (let j = i + 1; j < roster.length; j++) {
    const [a, b] = [roster[i], roster[j]]
    const [ra, rb] = runMatch(a, b, level)
    matches++
    wins[a] += ra
    wins[b] += rb
    rounds[a] += ra + rb
    rounds[b] += ra + rb
    matrix.push(`${a} ${ra}-${rb} ${b}`)
  }
}

console.error = realError
console.log(`\n=== AI harness: ${matches} matches (${matches * 2} rounds), both sides level ${level} ===`)
console.log(`2D mode: ${FIGHTER_2D ? 'Fighter consumes moveZ natively' : 'transitional harness z-shim (free-roam Fighter not landed yet)'}`)
for (const line of matrix) console.log('  ' + line)
console.log('\nRound win rates:')
let spreadOk = true
for (const id of roster) {
  const rate = wins[id] / rounds[id]
  const bar = '#'.repeat(Math.round(rate * 20)).padEnd(20, '.')
  console.log(`  ${id.padEnd(14)} ${bar} ${(rate * 100).toFixed(0).padStart(3)}% (${wins[id]}/${rounds[id]})`)
  if (wins[id] === 0 || wins[id] === rounds[id]) spreadOk = false
}
const avgPeakZ = planeStats.matches ? planeStats.peakSum / planeStats.matches : 0
console.log(`\nPlane usage: avg per-match peak |z| ${avgPeakZ.toFixed(2)}m, max ${planeStats.peakMax.toFixed(2)}m (bounds z ±5.5)`)
const planeOk = avgPeakZ > 0.5
console.log(`Plane usage sane (AI actually leaves the lane): ${planeOk ? 'YES' : 'NO'}`)
console.log(`\nHard errors: ${hardErrors.length}`)
for (const e of hardErrors.slice(0, 10)) console.log('  ' + e)
console.log(`Caught script-stub warnings (non-fatal, headless-only): ${scriptErrors.length}`)
const uniq = [...new Set(scriptErrors.map((s) => s.slice(0, 90)))]
for (const e of uniq.slice(0, 8)) console.log('  ' + e)
console.log(`Win-rate spread sane (nobody 0% or 100%): ${spreadOk ? 'YES' : 'NO'}`)

if (hardErrors.length || !spreadOk || !planeOk) {
  console.log('\nHARNESS: FAIL')
  process.exit(1)
}
console.log('\nHARNESS: PASS')
