// AIControl — the CPU's hands. Implements the same ControlSource interface as
// HumanControl (axis/axisY/isDown/pressed/buffer/frameNum/wantsDash) so Fighter
// and MatchScreen never know who's driving. The *decisions* live in the shared
// personality Brain (src/ai/Brain.js), created lazily on the first update so
// this constructor keeps its original one-argument signature.
//
// ── v2.0 CONTROL SURFACE (§17, free-roam) ──────────────────────────────────
// The Brain thinks in WORLD SPACE on the XZ plane. This source publishes:
//
//   ctrl.worldMove === true    marks this source as world-space: Fighter must
//                              consume the values below with NO camera-relative
//                              remapping (humans get camera-relative; AI not).
//   ctrl.moveX, ctrl.moveZ     -1..1 world-space XZ movement intent, refreshed
//                              every updateAI(). These alias axisV/axisYV, so
//                              MatchScreen glue that nudges ctrl.axisV keeps
//                              working and stays reflected in moveX.
//   ctrl.axis()  -> moveX      legacy scalar (world X)
//   ctrl.axisY() -> moveZ      legacy depth scalar (world Z)
//   ctrl.wantsDashVec()        -> {x,z} unit-ish world dash vector or null,
//                              consumed on read. Preferred by the v2 Fighter.
//   ctrl.wantsDash()           legacy ±1 (sign of the dash vector's X),
//                              consumed on read. Old Fighter compatibility.
//
// aiLevel 0 = training dummy: stands there, never blocks, never attacks.
// aiLevel 1..5 = personality AI with scaled reactions (see src/ai/Brain.js).
import { Brain } from '../ai/Brain.js'

const MOVE_HOLDS = ['left', 'right', 'fwd', 'back', 'crouch', 'jump']
const clamp1 = (v) => Math.max(-1, Math.min(1, v || 0))

export class AIControl {
  constructor(level = 2) {
    this.level = level === 0 ? 0 : Math.min(5, Math.max(1, Math.round(level) || 2))
    this.frame = 0
    this.buf = []
    this.held = {}
    this.edge = {}
    this.worldMove = true      // world-space source: Fighter must not camera-remap
    this.axisV = 0             // world X intent (-1..1) — MatchScreen may nudge
    this.axisYV = 0            // world Z intent (-1..1)
    this.desireX = 0           // raw movement desire, written by the Brain
    this.desireZ = 0
    this.plan = []             // [{ wait, press?, hold?|null, move?, dash? }]
    this.planWait = 0
    this.blockHold = 0
    this._dash = null          // pending dash: {x,z} (legacy scalar accepted)
    this.brain = null
    this.recentUse = new Map() // move.id -> frame last queued (Brain recency weighting)
  }

  // world-space movement aliases (documented surface for the v2 Fighter)
  get moveX() { return this.axisV }
  set moveX(v) { this.axisV = clamp1(v) }
  get moveZ() { return this.axisYV }
  set moveZ(v) { this.axisYV = clamp1(v) }

  // --- ControlSource interface ---
  axis() { return this.axisV }
  axisY() { return this.axisYV }
  isDown(action) { return !!this.held[action] }
  pressed(action) { return !!this.edge[action] }
  buffer() { return this.buf }
  frameNum() { return this.frame }

  // v2 Fighter: full 2D dash intent. Consumed on read.
  wantsDashVec() {
    const d = this._dash
    this._dash = null
    if (!d) return null
    if (typeof d === 'number') return d ? { x: d, z: 0 } : null
    return (d.x || d.z) ? d : null
  }

  // Legacy (v1.1 lane Fighter): scalar world-X dash sign. Consumed on read.
  wantsDash() {
    const v = this.wantsDashVec()
    if (!v) return 0
    return Math.abs(v.x) >= 0.35 ? Math.sign(v.x) : 0
  }

  press(action) {
    this.edge[action] = true
    this.buf.push({ action, frame: this.frame })
    if (this.buf.length > 60) this.buf.shift()
  }

  // --- actuator API (used by the Brain) ---
  busy() { return this.planWait > 0 || this.plan.length > 0 }
  clearPlan() { this.plan.length = 0; this.planWait = 0 }
  queue(steps) { for (const s of steps) this.plan.push(s) }
  holdBlock(frames) { this.blockHold = Math.max(this.blockHold, frames | 0) }
  clearHolds() { for (const k of MOVE_HOLDS) this.held[k] = false }
  setDesire(x, z) { this.desireX = x || 0; this.desireZ = z || 0 }
  dashVec(v) { if (v && (v.x || v.z)) this._dash = { x: v.x || 0, z: v.z || 0 } }

  // Execute a specific MoveDef: hold its direction prefix (translated through
  // current facing), press its button, release, then sit out the move.
  // Directions REPEATED in the input (↓↓+Light joke moves) are tap sequences —
  // Fighter.findMove wants distinct fresh presses in the buffer, not a hold —
  // so those are queued as press steps of the mapped direction action.
  // §17: facing may now be a yaw angle; facingSign carries the legacy ±1 used
  // for 'forward'/'back' resolution (fallback: sign toward the foe in X).
  queueMove(self, move, opts = {}) {
    const seq = move?.input || []
    if (!seq.length) return false
    const button = seq[seq.length - 1]
    const sgn = this._facingSign(self)
    const mapDir = (d) =>
      d === 'down' ? 'crouch'
        : (d === 'up' || d === 'jump') ? 'jump'
          : d === 'forward' ? (sgn > 0 ? 'right' : 'left')
            : d === 'back' ? (sgn > 0 ? 'left' : 'right') : null
    const counts = {}
    for (const d of seq.slice(0, -1)) counts[d] = (counts[d] || 0) + 1
    const holds = {}
    for (const d in counts) {
      const action = mapDir(d)
      if (!action) continue
      if (counts[d] > 1) {
        for (let i = 0; i < counts[d]; i++) this.plan.push({ press: action, wait: 3 })
      } else {
        holds[action] = true
      }
    }
    const busyFrames = opts.wait ?? Math.min(40, (move.startup || 6) + (move.active || 4) + Math.min(20, move.recovery || 8))
    if (Object.keys(holds).length) this.plan.push({ hold: holds, wait: 1 })
    this.plan.push({ press: button, wait: 2 })
    this.plan.push({ hold: null, wait: busyFrames })
    if (move.id) this.recentUse.set(move.id, this.frame)
    return true
  }

  _facingSign(self) {
    const fs = self?.facingSign
    if (typeof fs === 'number' && fs !== 0) return fs > 0 ? 1 : -1
    if (self?.foe) return self.foe.pos.x >= self.pos.x ? 1 : -1
    const f = self?.facing
    // legacy ±1 facing; a yaw angle falls back through cos
    if (typeof f === 'number') return (Math.abs(f) <= 1.01 ? f >= 0 : Math.cos(f) >= 0) ? 1 : -1
    return 1
  }

  // --- per-frame update (called by MatchScreen before Fighter.update) ---
  updateAI(self, foe, allow) {
    this.frame++
    this.edge = {}
    while (this.buf.length && this.buf[0].frame < this.frame - 90) this.buf.shift()

    // training dummy: upright, honest, extremely hittable
    if (this.level === 0) {
      this.axisV = 0
      this.axisYV = 0
      this.held = {}
      this.clearPlan()
      return
    }

    if (!allow || !foe) {
      this.axisV = 0
      this.axisYV = 0
      this.desireX = 0
      this.desireZ = 0
      this.held = {}
      this.blockHold = 0
      this.clearPlan()
      return
    }

    if (!this.brain) this.brain = new Brain(this, this.level, self)

    // FINISHER! prompt outranks all strategy — walk in and style on them
    if (self.match?.finisherReady?.[self.slot] && self.hp > 0) {
      this.clearPlan()
      this.blockHold = 0
      this.held.block = false
      const dx = foe.pos.x - self.pos.x
      const dz = (foe.pos.z || 0) - (self.pos.z || 0)
      const d = Math.hypot(dx, dz)
      if (d < 2.6) {
        this.axisV = 0
        this.axisYV = 0
        if (Math.random() < 0.05 * this.level) { this.press('special'); this.press('heavy') }
      } else {
        this.axisV = dx / (d || 1)
        this.axisYV = dz / (d || 1)
      }
      return
    }

    // panic-block hold (set by the Brain's defend reaction)
    if (this.blockHold > 0) {
      this.blockHold--
      this.held.block = true
      this.axisV = 0
      this.axisYV = 0
      this.brain.tick(self, foe) // keep perceiving while turtled up
      return
    }
    this.held.block = false

    // execute queued plan steps
    if (this.planWait > 0) {
      this.planWait--
    } else if (this.plan.length) {
      const step = this.plan.shift()
      if (step.press) this.press(step.press)
      if (step.hold === null) this.clearHolds()
      else if (step.hold) Object.assign(this.held, step.hold)
      if (step.dash) this.dashVec(typeof step.dash === 'number' ? { x: step.dash, z: 0 } : step.dash)
      if (step.move) this.setDesire(step.move.x, step.move.z)
      if (step.axis !== undefined) this.desireX = step.axis // legacy scalar step
      this.planWait = step.wait ?? 6
    }

    this.brain.tick(self, foe)

    this.axisV = clamp1(this.desireX)
    this.axisYV = clamp1(this.desireZ)
    // never camp on top of a downed opponent (radial 2D backoff)
    if (foe.state === 'knockdown') {
      const dx = foe.pos.x - self.pos.x
      const dz = (foe.pos.z || 0) - (self.pos.z || 0)
      const d = Math.hypot(dx, dz)
      if (d < 1.4) {
        const l = d || 1
        this.axisV = -(dx / l) * 0.7
        this.axisYV = -(dz / l) * 0.7
      }
    }
  }

  dispose() { this.brain?._unbindHazards?.() }
}
