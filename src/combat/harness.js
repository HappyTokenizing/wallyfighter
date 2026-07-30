// Headless free-roam combat harness (v2.0 §17) — dev tool, never imported by
// the game. Runs AI-vs-AI matches through the REAL Fighter state machine with
// the v2 hit model (distance + facing cone + height overlap) mirrored from
// MatchScreen, on the full XZ plane, and asserts:
//   - matches complete (KO or health decision) with zero hard errors
//   - fighters actually USE the z axis (strafing wander is injected)
//   - positions stay finite and inside the 4-wall bounds
//   - facing stays a finite yaw and facingSign stays ±1
//
//   node src/combat/harness.js            # 3 matches, seeded RNG
//   node src/combat/harness.js --level 5
import * as THREE from 'three'
import { Fighter } from './Fighter.js'
import { AIControl } from './AIControl.js'
import { SpecialContext } from './SpecialContext.js'
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
const realWarn = console.warn.bind(console)
console.error = (...args) => { scriptErrors.push(args.map(String).join(' ').slice(0, 160)) }
console.warn = (...args) => {
  const s = args.map(String).join(' ')
  // the model-desync tripwire firing in a kinematic-only harness is a REAL bug
  if (s.includes('model desynced')) hardErrors.push(s.slice(0, 160))
}
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

// AI control with injected world-Z wander so the sweep proves fighters roam
// the plane (the AI module's own 2D navigation is a parallel build).
class StrafeAI extends AIControl {
  axisY() {
    if (this.level === 0) return 0
    return Math.sin(this.frame / 47 + this._zPhase) * 0.7
  }
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

const COS_HALF_CONE = Math.cos((70 * Math.PI / 180) / 2)

class HarnessMatch {
  constructor() {
    this.game = {
      events: new EventBus(),
      audio: { sfx() {}, music() {}, stopMusic() {}, announcer() {}, crowd() {} },
      frame: 0,
      quality: { propLimit: 0, crowd: 0 },
    }
    // v2 bounds: 4 walls, default z lane per §17
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5, wallBounce: 0.55 }
    this.presetCfg = { bounce: 0.3, knockback: 1, spin: 1 }
    this.particles = { burst() {} }
    this.props = { spawn: () => propStub() }
    this.physics = { addProp: () => propStub(), addStaticBox() {}, impulse() {}, step() {}, setPreset() {} }
    this.arena = { group: null, bounds: this.bounds, floorY: 0, spawnPoints: [-3, 3], update() {}, dispose() {} }
    this.cam = { punchIn() {}, shake() {}, kick() {} }
    this.ragdolls = { partial() {}, full() {}, recover() {}, isSettled: () => true }
    this.finisherReady = [false, false]
    this.active = true
    this.worldFrame = 0
    this.fxList = []
    this.fighters = []
  }

  cap() {}
  say() {}
  setSlowmo() {}
  hitStop() {}
  superFlash() {}
  tryFinisherChord() { return false }

  makeFx(self, onEnd) {
    const fx = new SpecialContext(this, self, self.foe, onEnd)
    this.fxList.push(fx)
    return fx
  }

  // fx.hit mirror — knockback.x resolves along the attacker's facing (§17)
  applyScriptHit(self, foe, spec = {}) {
    if (self) self._scriptDealt = true
    if (!foe || foe.isInvulnerable()) return
    const dmg = (spec.damage ?? 6) * (self?.damageMult ?? 1)
    foe.setHp(foe.hp - dmg)
    const kb = spec.knockback || { x: 5, y: 2 }
    const fdx = typeof self?.dirX === 'function' ? self.dirX() : 1
    const fdz = typeof self?.dirZ === 'function' ? self.dirZ() : 0
    if ((spec.ragdoll || 0) >= 1 || (kb.y || 0) > 3.5) {
      foe.enterLaunched(fdx * (kb.x || 5), Math.max(4, kb.y || 4), kb.spin || 1, fdz * (kb.x || 5))
    } else {
      foe.enterHitstun(spec.hitStun || 14, true, fdx * (kb.x || 5) * 0.5, fdz * (kb.x || 5) * 0.5)
    }
    if (self) { self.comboHits++; self.comboLastFrame = this.worldFrame }
  }

  applyImpulse(target, vec) {
    if (target?.vel && Array.isArray(vec)) {
      target.vel.x += vec[0] || 0
      target.vel.y += vec[1] || 0
      target.vel.z += vec[2] || 0
    }
  }

  forceRagdoll(f, impulse) {
    const v = Array.isArray(impulse) ? impulse : [-(typeof f.dirX === 'function' ? f.dirX() : 1) * 6, 6, 0]
    f.enterLaunched(v[0] || 0, Math.max(4, v[1] || 6), 1, v[2] || 0)
  }

  finishThrow(self, foe, move) {
    foe.state = 'idle'
    const dmg = (move?.damage || 10) * self.damageMult
    foe.setHp(foe.hp - dmg)
    const k = 6 * self.knockbackMult
    foe.enterLaunched(self.dirX() * k, 7, 1, self.dirZ() * k)
    self.comboHits++
    self.comboLastFrame = this.worldFrame
    self.endMove()
  }
}

// v2 cone-based hit scan — mirror of MatchScreen._scanHits, simplified
function scanHits(match) {
  for (const f of match.fighters) {
    const foe = f.foe
    const m = f.activeAttack()
    if (m && !foe.isInvulnerable()) {
      const hb = m.hitbox || { w: 1, h: 0.8, forward: 1, up: 1.2 }
      const dx = foe.pos.x - f.pos.x
      const dz = foe.pos.z - f.pos.z
      const dist = Math.hypot(dx, dz)
      const reach = (hb.forward ?? 1) + (hb.w ?? 1) * 0.5 + foe.radius()
      if (dist <= reach) {
        let nx, nz
        if (dist > 1e-4) { nx = dx / dist; nz = dz / dist } else { nx = f.dirX(); nz = f.dirZ() }
        const inCone = dist <= 0.6 || (nx * f.dirX() + nz * f.dirZ()) >= COS_HALF_CONE
        const up = hb.up ?? 1.2
        const hh = (hb.h ?? 0.8) / 2
        const span = foe.heightSpan()
        const heightOk = f.pos.y + up - hh < span.y1 && f.pos.y + up + hh > span.y0
        if (inCone && heightOk) {
          f.hitDone = true
          f.contactMade = true
          if (foe.isBlockingAgainst(f)) {
            foe.enterBlockstun(m.blockStun || 8, nx * 3, nz * 3)
            f.gainMeter(2)
          } else {
            const scale = Math.max(0.3, Math.pow(0.9, f.comboHits))
            const dmg = (m.damage || 5) * f.damageMult * scale
            foe.setHp(foe.hp - dmg)
            f.gainMeter(m.meterGain ?? 5)
            foe.gainMeter(dmg * 0.4)
            const kb = m.knockback || { x: 4, y: 0 }
            const k = (kb.x || 4) * f.knockbackMult
            if (m.launcher || (kb.y || 0) > 3.5) {
              foe.enterLaunched(nx * k, Math.max(5, kb.y || 5), kb.spin || 0.5, nz * k)
            } else {
              foe.enterHitstun(m.hitStun || 14, m.kind === 'heavy' || m.kind === 'special', nx * k * 0.6, nz * k * 0.6)
            }
            f.comboHits++
            f.comboLastFrame = match.worldFrame
          }
        }
      }
    }
    // Scripted moves (activeAttack returns null for those) mostly deal damage
    // through fx.hit; scripts that rely on spawned props/projectiles can't
    // connect against this harness's prop stubs, so synthesize the MoveDef
    // hit late in the active window if the script hasn't dealt damage yet.
    if (f.state === 'attack' && f.scriptFx && f.currentMove && !f.hitDone) {
      const sm = f.currentMove
      if (f._hMove !== sm) { f._hMove = sm; f._scriptDealt = false }
      const start = sm.startup || 0
      const end = start + (sm.active || 0)
      if ((sm.damage || 0) > 0 && !f._scriptDealt && f.moveFrame >= start && f.moveFrame <= end && !foe.isInvulnerable()) {
        const box = sm.hitbox || { w: 1, forward: 1 }
        const dist = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z)
        if (dist <= (box.forward ?? 1) + (box.w ?? 1) * 0.5 + foe.radius()) {
          f.hitDone = true
          f.contactMade = true
          const nx = dist > 1e-4 ? (foe.pos.x - f.pos.x) / dist : f.dirX()
          const nz = dist > 1e-4 ? (foe.pos.z - f.pos.z) / dist : f.dirZ()
          if (foe.isBlockingAgainst(f)) {
            foe.enterBlockstun(sm.blockStun || 8, nx * 3, nz * 3)
          } else {
            const dmg = (sm.damage || 5) * f.damageMult * Math.max(0.3, Math.pow(0.9, f.comboHits))
            foe.setHp(foe.hp - dmg)
            f.gainMeter(sm.meterGain ?? 5)
            const kb = sm.knockback || { x: 4, y: 0 }
            if (sm.launcher || (kb.y || 0) > 3.5) foe.enterLaunched(nx * (kb.x || 4), Math.max(5, kb.y || 5), kb.spin || 0.5, nz * (kb.x || 4))
            else foe.enterHitstun(sm.hitStun || 14, true, nx * (kb.x || 4) * 0.6, nz * (kb.x || 4) * 0.6)
            f.comboHits++
            f.comboLastFrame = match.worldFrame
          }
        }
      }
    }
    if (f.grabActive()) {
      const dist = Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z)
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

// ------------------------------------------------------------- match loop
const ROUND_FRAMES = 60 * 35 // trimmed rounds: 35 simulated seconds

function runMatch(idA, idB, level, report) {
  const match = new HarnessMatch()
  const ca = new StrafeAI(level)
  const cb = new StrafeAI(level)
  ca._zPhase = 0
  cb._zPhase = Math.PI * 0.7
  const fa = new Fighter(match, 0, headlessDef(Characters[idA]), ca)
  const fb = new Fighter(match, 1, headlessDef(Characters[idB]), cb)
  fa.foe = fb
  fb.foe = fa
  match.fighters = [fa, fb]
  const roundWins = [0, 0]
  let maxAbsZ = 0
  let completedRounds = 0

  const bZ = { min: match.bounds.minZ - 0.05, max: match.bounds.maxZ + 0.05 }
  const bX = { min: match.bounds.minX - 0.05, max: match.bounds.maxX + 0.05 }

  for (let round = 0; round < 2; round++) {
    fa.reset(-3, 0, 0)      // yaw 0 = facing +X, toward fb
    fb.reset(3, Math.PI, 0) // yaw π = facing -X, toward fa
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
        scanHits(match)
        for (const fx of [...match.fxList]) fx.step()
        match.fxList = match.fxList.filter((fx) => !fx.done)
      } catch (e) {
        hardErrors.push(`SIM ${idA}v${idB} r${round}: ${e.stack?.split('\n')[0]}`)
        break
      }
      for (const f of [fa, fb]) {
        if (!isFinite(f.pos.x) || !isFinite(f.pos.y) || !isFinite(f.pos.z)) {
          hardErrors.push(`NaN position ${idA}v${idB} r${round} fr${fr} slot${f.slot}`)
          break
        }
        if (f.pos.x < bX.min || f.pos.x > bX.max || f.pos.z < bZ.min || f.pos.z > bZ.max) {
          hardErrors.push(`OOB ${idA}v${idB} r${round} fr${fr} slot${f.slot} (${f.pos.x.toFixed(2)}, ${f.pos.z.toFixed(2)})`)
        }
        if (!Number.isFinite(f.facing) || Math.abs(f.facingSign) !== 1) {
          hardErrors.push(`bad facing ${idA}v${idB} r${round} fr${fr} slot${f.slot} facing=${f.facing} sign=${f.facingSign}`)
        }
        maxAbsZ = Math.max(maxAbsZ, Math.abs(f.pos.z))
      }
      if (hardErrors.length) break
      if (fa.hp <= 0) { winner = 1; break }
      if (fb.hp <= 0) { winner = 0; break }
    }
    if (hardErrors.length) break
    if (winner < 0) winner = fa.hp >= fb.hp ? 0 : 1 // timeout: health decides
    roundWins[winner]++
    completedRounds++
    for (const fx of match.fxList) { try { fx.flush() } catch { /* stub */ } }
    match.fxList = []
  }
  match.active = false
  ca.dispose?.()
  cb.dispose?.()
  report.push({ idA, idB, roundWins, maxAbsZ, completedRounds })
  return roundWins
}

// ------------------------------------------------------------------ sweep
const level = (() => {
  const i = process.argv.indexOf('--level')
  return i >= 0 ? Number(process.argv[i + 1]) || 3 : 3
})()

const roster = RosterOrder.filter((id) => Characters[id])
const pairs = []
for (let i = 0; i + 1 < roster.length && pairs.length < 3; i += 2) pairs.push([roster[i], roster[i + 1]])
while (pairs.length < 3 && roster.length >= 2) pairs.push([roster[0], roster[roster.length - 1]])

const report = []
for (const [a, b] of pairs) runMatch(a, b, level, report)

console.error = realError
console.warn = realWarn
console.log(`\n=== 2D combat harness: ${report.length} matches, both sides level ${level} ===`)
let zOk = true
let completeOk = true
for (const r of report) {
  if (r.completedRounds < 2) completeOk = false
  if (r.maxAbsZ < 0.2) zOk = false
  console.log(`  ${r.idA} ${r.roundWins[0]}-${r.roundWins[1]} ${r.idB}  rounds=${r.completedRounds}/2  max|z|=${r.maxAbsZ.toFixed(2)}m`)
}
console.log(`\nHard errors: ${hardErrors.length}`)
for (const e of hardErrors.slice(0, 10)) console.log('  ' + e)
console.log(`Caught script-stub warnings (non-fatal, headless-only): ${scriptErrors.length}`)
const uniq = [...new Set(scriptErrors.map((s) => s.slice(0, 90)))]
for (const e of uniq.slice(0, 8)) console.log('  ' + e)
console.log(`All matches completed: ${completeOk ? 'YES' : 'NO'}`)
console.log(`Fighters use the z axis: ${zOk ? 'YES' : 'NO'}`)

if (hardErrors.length || !zOk || !completeOk) {
  console.log('\nHARNESS: FAIL')
  process.exit(1)
}
console.log('\nHARNESS: PASS')
