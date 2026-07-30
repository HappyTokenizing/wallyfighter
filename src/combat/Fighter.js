// Fighter — kinematic free-roam fighter entity: XZ movement, state machine,
// animation, move execution, stun/launch/knockdown handling. Hit RESOLUTION
// lives in MatchScreen (it touches both fighters, events, camera, physics);
// this class owns one body and its feel. Per CONTRACTS.md §4/§5/§11/§17.
//
// v2.0 (§17): fighters roam the whole arena floor. `fighter.facing` is now a
// YAW ANGLE in radians — the facing direction on the plane is
// (cos(facing), 0, -sin(facing)), i.e. yaw 0 faces +X (the v1 "facing = +1")
// and yaw π faces -X (the v1 "facing = -1"). `fighter.facingSign` keeps the
// legacy ±1 semantics (toward the foe, projected on world X) so v1 move-input
// token resolution ('forward'/'back') and AI intents keep working. Character
// scripts still see ±1 through the SpecialContext legacy view (fx.self.facing).
import * as THREE from 'three'
import { Animator } from './Animator.js'
import { makeFallbackDef, defNeedsFallback } from './FallbackDef.js'

const GRAVITY = -22
const JUGGLE_GRAVITY = GRAVITY * 0.88 // juggled foes hang slightly — combos feel generous
const BUTTONS = new Set(['light', 'heavy', 'kick', 'grab', 'special', 'super'])
const KIND_PRIORITY = { super: 60, special: 40, grab: 30, launcher: 25, joke: 24, heavy: 20, kick: 18, light: 10 }
const AIR_KINDS = ['light', 'heavy', 'kick']
const CANCEL_TABLE = {
  light: ['light', 'heavy', 'kick', 'launcher', 'special', 'super'],
  heavy: ['special', 'super'],
  kick: ['special', 'super'],
  launcher: ['special', 'super'],
  joke: [],
  special: ['super'],
  grab: [],
  super: [],
}
const TAP_WINDOW = 20 // frames: ↓↓-style tap sequences must land inside this
const CHAIN_DRIFT_SPEED = 15   // m/s homing toward the foe during chained startup
const CHAIN_DRIFT_MAX = 3      // total meters a chained follow-up may close
const NEUTRAL_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block', 'jump'])
const HEAVY_KINDS = new Set(['heavy', 'launcher', 'super'])
// §17 soft lock-on: auto-face the foe when attacking or within this range.
const LOCK_RANGE = 6
// states where the fighter may smooth-yaw (reactions/ragdoll keep their facing)
const LOCK_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block', 'jump'])
// states exempt from the model-desync tripwire: physics/scripts own the visual
const GUARD_EXEMPT = new Set(['ragdoll', 'finisher', 'grabbed'])
const _headPos = new THREE.Vector3()
const _guardPos = new THREE.Vector3()

const TAU = Math.PI * 2
function wrapAngle(a) {
  a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI
  return a
}

export class Fighter {
  constructor(match, slot, def, ctrl, costume = 0) {
    this.match = match
    this.game = match.game
    this.slot = slot
    this.ctrl = ctrl
    this.foe = null
    // §17: humans move CAMERA-RELATIVE (stick/WASD resolved through the camera
    // yaw). AI controls write WORLD-space intents (axis = world X desire,
    // axisY = world Z desire) and are never remapped. HumanControl is
    // duck-typed by its .input field so this file stays harness-safe.
    this.isHuman = !!(ctrl && ctrl.input)

    // Build model — fall back to the placeholder rig if the character module is
    // still a stub or its model fails to build.
    let useDef = def
    let built = null
    if (!defNeedsFallback(useDef)) {
      try { built = useDef.buildModel(costume) } catch (e) { console.warn(`[combat] buildModel(${def?.id}) threw`, e) }
    }
    if (!built?.group || !built?.bones?.hips) {
      useDef = makeFallbackDef(def || {})
      built = useDef.buildModel(costume)
    }
    this.def = useDef

    this.root = new THREE.Group()
    this.holder = new THREE.Group()
    this.holder.add(built.group)
    this.root.add(this.holder)
    this.bones = built.bones
    // invisible-body tripwire (v2.0): remember the visual root + the hips bind
    // pose so a desynced model can be snapped back onto the logical fighter.
    this._modelGroup = built.group
    this._modelBind = built.group.position.clone()
    this._hipsBind = built.bones.hips.position.clone()
    this._desyncWarned = false
    this.mats = []
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        const list = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of list) if (m && m.emissive) this.mats.push(m)
      }
    })

    this.animator = new Animator(this.bones, this.def.clips)
    this.pos = this.root.position
    this.vel = new THREE.Vector3()

    // §24 economy chokepoint (MAX HP): base 100 × GameConfig.balance.maxHpScale
    // × this slot's rules HP multiplier (story/arcade bulk curves send
    // rules.p2HpMult / rules.p1HpMult). Harness/stub matches without config or
    // rules fall back to plain 100.
    const bal = this.game?.config?.balance || {}
    const rules = match?.rules || {}
    const slotMult = slot === 1 ? rules.p2HpMult : rules.p1HpMult
    this.maxHp = Math.max(1, Math.round(100
      * (Number.isFinite(bal.maxHpScale) && bal.maxHpScale > 0 ? bal.maxHpScale : 1)
      * (Number.isFinite(slotMult) && slotMult > 0 ? slotMult : 1)))
    this.hp = this.maxHp
    this.meter = 0
    this.facing = 0        // yaw radians, 0 = +X (see header)
    this.facingSign = 1    // legacy ±1: toward the foe projected on world X
    this.state = 'idle'
    this.stateFrames = 0

    // combat bookkeeping
    this.currentMove = null
    this.moveFrame = 0
    this.hitDone = false
    this.contactMade = false
    this.chainDepth = 0
    this.scriptFx = null
    this.hitstunFrames = 0
    this.blockstunFrames = 0
    this.knockdownFrames = 0
    this.getupFrames = 0
    this.invuln = 0
    this.armorFrames = 0
    // Buff API (contract for character scripts): movement multiplies by speedMult,
    // outgoing damage by damageMult, outgoing knockback by knockbackMult.
    // All reset to 1 on round start and on full ragdoll / KO.
    this.speedMult = 1
    this.damageMult = 1
    this.knockbackMult = 1
    this.flashFrames = 0
    this.bounces = 0
    this.wallBounces = 0
    this.tumble = 0
    this.tumbleRate = 0
    this.dashDir = { x: 0, z: 0 }
    this.dashFrames = 0
    this._chainDrift = null
    this.lastTap = { left: -99, right: -99, fwd: -99, back: -99 }
    this.throwSeq = null
    this.wakeupMove = null
    this.ragdollFrames = 0
    this._consumed = new WeakSet()
    this._squash = 0
    this._mi = { mx: 0, mz: 0, len: 0 } // cached per-frame move intent (world XZ)

    // combo bookkeeping (this fighter as ATTACKER)
    this.comboHits = 0
    this.comboLastFrame = -999
    this.damageTakenThisRound = 0

    // -- comedic gore hooks (gore-gated in _onHitFx) --
    // MatchScreen builds the particle pool before any fighter exists, so it
    // can't hand it a game ref; we attach it here — which also makes the pool
    // re-read 'settings.gore' at every match start.
    try { match.particles?.attachGame?.(this.game) } catch { /* pool optional */ }
    this._headPulseFrames = 0
    this._headPulseSaved = null
    this._offHitFx = this.game.events?.on?.('fighter:hit', (e) => this._onHitFx(e)) || null
  }

  // ------------------------------------------------------------------ helpers

  grounded() { return this.pos.y <= 0.001 }
  isNeutral() { return NEUTRAL_STATES.has(this.state) }

  // §27: jump toggle — read LIVE from settings so flipping it mid-match works.
  // Applies to both humans and AI (a global rules toggle, not a handicap).
  _jumpEnabled() {
    try { return this.game.save?.get?.('settings.jumpEnabled', true) !== false } catch { return true }
  }

  // facing direction on the plane (yaw 0 = +X, see header)
  dirX() { return Math.cos(this.facing) }
  dirZ() { return -Math.sin(this.facing) }
  yawTo(x, z) { return Math.atan2(-(z - this.pos.z), x - this.pos.x) }
  // horizontal radius of the body for distance-based hit detection
  radius() { return Math.max(0.3, (this.def.height || 1.8) * 0.25) }

  // vertical extent (crouch/knockdown shrink it) for height-overlap tests
  heightSpan() {
    let h = this.def.height
    if (this.state === 'crouch' || (this.ctrl.isDown('crouch') && this.grounded() && this.state !== 'attack')) h *= 0.65
    if (this.state === 'knockdown') h *= 0.35
    return { y0: this.pos.y, y1: this.pos.y + h }
  }

  isInvulnerable() {
    if (this.invuln > 0) return true
    return this.state === 'knockdown' || this.state === 'getup' || this.state === 'grabbed' ||
      this.state === 'ragdoll' || this.state === 'ko' || this.state === 'win' ||
      this.state === 'lose' || this.state === 'finisher'
  }

  isBlockingAgainst(attacker) {
    if (this.state !== 'block' && this.state !== 'blockstun') return false
    if (!this.grounded()) return false
    // must be facing the attacker (within ~84° of the facing direction)
    const dx = attacker.pos.x - this.pos.x
    const dz = attacker.pos.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-4) return true
    return (dx * this.dirX() + dz * this.dirZ()) / d > 0.1
  }

  // Legacy entry point (TrainingMode, harnesses pass ±1; radians accepted too).
  setFacing(f) {
    if (f === 1) f = 0
    else if (f === -1) f = Math.PI
    this._setYaw(f)
    this.facingSign = Math.cos(this.facing) >= 0 ? 1 : -1
  }

  _setYaw(f) {
    this.facing = wrapAngle(Number.isFinite(f) ? f : 0)
    this.holder.rotation.y = this.facing
  }

  // shortest-arc yaw step toward a target angle
  _turnToward(target, maxStep) {
    const d = wrapAngle(target - this.facing)
    this._setYaw(this.facing + Math.max(-maxStep, Math.min(maxStep, d)))
  }

  playClip(name, opts) { this.animator.play(name, opts) }

  setState(s) {
    if (this.state === s) return
    this.state = s
    this.stateFrames = 0
    const CLIP_FOR = {
      idle: 'idle', walk: 'walk', dash: 'walk', backdash: 'walk', jump: 'jump',
      crouch: 'crouch', block: 'block', blockstun: 'block', launched: 'launched',
      knockdown: 'knockdown', getup: 'getup', grabbed: 'hitHeavy',
      win: 'win', lose: 'lose',
    }
    const clip = CLIP_FOR[s]
    if (clip && this.animator.has(clip)) this.animator.play(clip, { restart: s === 'getup' || s === 'jump' })
  }

  // Legacy x-band hurtbox — kept for the headless harnesses and any v1-shaped
  // tooling. The live match uses distance+cone+heightSpan (MatchScreen §17).
  hurtbox() {
    const w = 0.5 * (this.def.height / 2)
    let h = this.def.height
    if (this.state === 'crouch' || this.ctrl.isDown('crouch') && this.grounded() && this.state !== 'attack') h *= 0.65
    if (this.state === 'knockdown') h *= 0.35
    return { x0: this.pos.x - w, x1: this.pos.x + w, y0: this.pos.y, y1: this.pos.y + h }
  }

  // The move currently in its active window (non-grab, unscripted, unspent).
  // Geometry lives in MatchScreen's cone test — this is just the timing gate.
  activeAttack() {
    const m = this.currentMove
    if (!m || this.state !== 'attack' || this.scriptFx || this.hitDone) return null
    if (m.kind === 'grab') return null
    if (this.moveFrame < m.startup || this.moveFrame >= m.startup + m.active) return null
    return m
  }

  // Legacy AABB view of the active hitbox (x-lane projection via facingSign) —
  // kept for the headless harnesses; the live match uses activeAttack().
  activeHitbox() {
    const m = this.activeAttack()
    if (!m) return null
    const hb = m.hitbox || { w: 1, h: 0.8, d: 1, forward: 1, up: 1.2 }
    const cx = this.pos.x + this.facingSign * (hb.forward ?? 1)
    const cy = this.pos.y + (hb.up ?? 1.2)
    return { x0: cx - hb.w / 2, x1: cx + hb.w / 2, y0: cy - hb.h / 2, y1: cy + hb.h / 2, move: m }
  }

  grabActive() {
    const m = this.currentMove
    if (!m || m.kind !== 'grab' || this.state !== 'attack' || this.throwSeq || this.hitDone) return false
    return this.moveFrame >= m.startup && this.moveFrame < m.startup + m.active
  }

  setHp(v) {
    // §24 economy chokepoint (DAMAGE): every hp DROP during live play scales by
    // GameConfig.balance.damageScale. All damage funnels through setHp — clean
    // hits, chip, armor absorbs, throws, script hits, items, arena hazards —
    // so nothing bypasses the knob. Gated to the live 'fight' phase: heals
    // never scale (drop test), and intentional zeroing (onKO/executions,
    // phase 'ko'/'finisher') and round resets pass through exactly. The scaled
    // drop is rounded so integral damage keeps hp integral (min drop stays 1).
    if (v < this.hp && this.match?.phase === 'fight') {
      const ds = this.game?.config?.balance?.damageScale
      if (Number.isFinite(ds) && ds > 0 && ds !== 1) {
        const drop = this.hp - v
        const scaled = drop >= 1 ? Math.max(1, Math.round(drop * ds)) : drop * ds
        v = this.hp - scaled
      }
    }
    const nv = Math.max(0, Math.min(this.maxHp, v))
    if (nv === this.hp) return
    const drop = this.hp - nv
    this.hp = nv
    this.game.events.emit('health', { slot: this.slot, value: this.hp, max: this.maxHp })
    // §15 (v1.1): report EVERY hp loss to the match so the gore system sees
    // hazard damage too (arenas call setHp directly). Attributed hits mark the
    // frame first, so this fallback never double-fires. Optional + guarded —
    // headless harness and stub matches have no onHpLoss.
    if (drop > 0) { try { this.match.onHpLoss?.(this, drop) } catch { /* gore optional */ } }
  }

  gainMeter(v) {
    const nv = Math.max(0, Math.min(100, this.meter + v))
    if (Math.round(nv) === Math.round(this.meter)) { this.meter = nv; return }
    this.meter = nv
    this.game.events.emit('meter', { slot: this.slot, value: Math.round(this.meter) })
  }

  squash(amt) { this._squash = amt }

  clearBuffs() {
    this.speedMult = 1
    this.damageMult = 1
    this.knockbackMult = 1
  }

  // Victim impact flash. Default is pure WHITE — it reads on every fur/skin
  // tone (the old dark red vanished on dark materials). Held ~2 fixed frames;
  // flashFrames only decrement in update(), which hit-stop freezes, so the
  // flash hangs for exactly as long as the impact does. Pass a hex for
  // distinct flavors (armor absorb = amber, see MatchScreen).
  flash(hex = 0xffffff, frames = 2) {
    for (const m of this.mats) m.emissive.setHex(hex)
    this.flashFrames = frames
  }

  _unflash() { for (const m of this.mats) m.emissive.setHex(0x000000) }

  // Heavy counter hits knock teeth loose ('cartoon'/'max' gore) and squash the
  // victim's head for a beat. Fired off the 'fighter:hit' event so it sees the
  // real counter flag; the scale pulse lands during hit-stop (updates frozen,
  // renders not), so it reads clearly, then restores 2 fixed frames after.
  _onHitFx(e) {
    if (!e || e.slot !== this.slot || !e.counter) return
    const atkMove = this.foe?.def?.moves?.find?.((m) => m.id === e.move)
    const heavy = (e.damage ?? 0) >= 10 || (atkMove && HEAVY_KINDS.has(atkMove.kind))
    if (!heavy) return
    const gore = this.game.save?.get?.('settings.gore', 'cartoon') ?? 'cartoon'
    if (gore === 'none') return
    let pos
    const head = this.bones.head
    if (head) {
      head.getWorldPosition(_headPos)
      pos = { x: _headPos.x, y: _headPos.y + 0.05, z: _headPos.z }
    } else {
      pos = { x: this.pos.x, y: this.pos.y + (this.def.height || 1.8) * 0.85, z: this.pos.z }
    }
    try {
      this.match.particles?.burst?.('teeth', pos, { dirX: e.dirX || -this.facingSign, n: gore === 'max' ? 8 : 5 })
    } catch { /* particle pool optional (headless harness) */ }
    this._headPulseStart()
  }

  // One-beat comedic eye-squash on the head bone. Restore-safe: exact scale is
  // saved and put back; skipped entirely if a script owns head scale (i.e. the
  // bone is not at identity scale when we arrive).
  _headPulseStart() {
    const head = this.bones.head
    if (!head) return
    const s = head.scale
    if (this._headPulseSaved == null &&
      (Math.abs(s.x - 1) > 0.01 || Math.abs(s.y - 1) > 0.01 || Math.abs(s.z - 1) > 0.01)) return
    if (this._headPulseSaved == null) this._headPulseSaved = { x: s.x, y: s.y, z: s.z }
    const b = this._headPulseSaved
    head.scale.set(b.x * 1.32, b.y * 0.62, b.z * 1.32)
    this._headPulseFrames = 2
  }

  _headPulseRestore() {
    this._headPulseFrames = 0
    if (this._headPulseSaved) {
      const b = this._headPulseSaved
      this.bones.head?.scale.set(b.x, b.y, b.z)
      this._headPulseSaved = null
    }
  }

  // reset(x, face, z): face keeps the v1 ±1 contract (TrainingMode, harnesses),
  // any other number is a yaw in radians; z is the new spawn depth (default 0).
  reset(x, face, z = 0) {
    this.pos.set(x, 0, z)
    this.vel.set(0, 0, 0)
    this.setHp(this.maxHp)
    this.state = 'idle'
    this.stateFrames = 0
    this.currentMove = null
    this.scriptFx = null
    this.throwSeq = null
    this.wakeupMove = null
    this.hitstunFrames = this.blockstunFrames = this.knockdownFrames = this.getupFrames = 0
    this.invuln = 0
    this.armorFrames = 0
    this.clearBuffs()
    this.bounces = this.wallBounces = 0
    this.tumble = 0
    this.tumbleRate = 0
    this.dashFrames = 0
    this.comboHits = 0
    this.chainDepth = 0
    this._chainDrift = null
    this.ragdollFrames = 0
    this.damageTakenThisRound = 0
    this._squash = 0
    this._unflash()
    this.flashFrames = 0
    this._headPulseRestore()
    this.holder.position.set(0, 0, 0)
    this.holder.scale.set(1, 1, 1)
    this._modelGroup.position.copy(this._modelBind)
    this.setFacing(face)
    this.holder.rotation.set(0, this.facing, 0)
    this.animator.play('idle', { restart: true })
    this.gainMeter(0)
  }

  // ---------------------------------------------------------------- input

  // Camera yaw for camera-relative controls. Duck-typed off the match camera:
  // cam.getYaw() returns the view direction's XZ HEADING — forward =
  // (cos yaw, sin yaw) in world (x, z), per CameraController's documented
  // contract. Movement math below wants THREE rotation.y convention
  // (0 = looking down -Z, CCW positive), so convert: three = -(heading + π/2).
  // Sanity: heading -π/2 (view looks down -Z) -> three 0 -> W walks -Z. Missing
  // camera/method falls back to 0 (plain world axes: A/D = ±X, W = -Z).
  _camYaw() {
    try {
      const y = this.match.cam?.getYaw?.()
      if (Number.isFinite(y)) return -(y + Math.PI / 2)
    } catch { /* camera optional (harness) */ }
    return 0
  }

  // Per-frame movement intent in WORLD XZ. Humans: stick/WASD resolved through
  // the camera yaw (strafe = actions left/right, depth = fwd/back). AI: axis()
  // is already world X desire and axisY() world Z desire — no remap.
  _moveIntent() {
    const ax = this.ctrl.axis ? this.ctrl.axis() : 0
    const az = this.ctrl.axisY ? this.ctrl.axisY() : 0
    let mx, mz
    if (this.isHuman) {
      const cy = this._camYaw()
      const c = Math.cos(cy), s = Math.sin(cy)
      mx = ax * c - az * s
      mz = -ax * s - az * c
    } else {
      mx = ax
      mz = az
    }
    let len = Math.hypot(mx, mz)
    if (len > 1) { mx /= len; mz /= len; len = 1 }
    return { mx, mz, len }
  }

  // unit vector toward the foe expressed in the player's INPUT axes
  // (ix = strafe component, iz = depth component)
  _towardFoeInput() {
    if (!this.foe) return { ix: this.facingSign, iz: 0 }
    let dx = this.foe.pos.x - this.pos.x
    let dz = this.foe.pos.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-4) { dx /= d; dz /= d }
    const cy = this.isHuman ? this._camYaw() : 0
    const c = Math.cos(cy), s = Math.sin(cy)
    return { ix: dx * c - dz * s, iz: -dx * s - dz * c }
  }

  // Move-input direction tokens (§17): 'forward' ALWAYS means toward the foe.
  // AI keeps the v1 world-X resolution (it holds 'left'/'right' actions through
  // queueMove); humans are judged by where their resolved move vector points.
  dirHeld(d) {
    if (d === 'down') return this.ctrl.isDown('crouch')
    if (d === 'up') return this.ctrl.isDown('jump')
    if (d !== 'forward' && d !== 'back') return true
    if (!this.isHuman) {
      const towardIsRight = this.facingSign > 0
      const wantRight = (d === 'forward') === towardIsRight
      return this.ctrl.isDown(wantRight ? 'right' : 'left')
    }
    const mi = this._mi
    if (mi.len < 0.3) return false
    let tx, tz
    if (this.foe) {
      let dx = this.foe.pos.x - this.pos.x, dz = this.foe.pos.z - this.pos.z
      const dd = Math.hypot(dx, dz)
      if (dd < 1e-4) return false
      tx = dx / dd; tz = dz / dd
    } else {
      tx = this.dirX(); tz = this.dirZ()
    }
    const dot = (mi.mx * tx + mi.mz * tz) / mi.len
    return d === 'forward' ? dot > 0.45 : dot < -0.45
  }

  // Buffer action name a direction records as when freshly pressed (the input
  // buffer keeps direction edges alongside buttons — see InputManager).
  // Must stay consistent with dirHeld: for humans, 'forward' maps to whichever
  // physical direction action currently points most toward the foe.
  dirTapAction(d) {
    if (d === 'down') return 'crouch'
    if (d === 'up') return 'jump'
    if (d !== 'forward' && d !== 'back') return null
    if (!this.isHuman) {
      const towardIsRight = this.facingSign > 0
      return (d === 'forward') === towardIsRight ? 'right' : 'left'
    }
    const t = this._towardFoeInput()
    const s = d === 'forward' ? 1 : -1
    const ix = t.ix * s, iz = t.iz * s
    return Math.abs(ix) >= Math.abs(iz) ? (ix >= 0 ? 'right' : 'left') : (iz >= 0 ? 'fwd' : 'back')
  }

  // Count distinct fresh presses of a direction in the buffer within `window`
  // frames ending at `endFrame` (the button press that anchors the sequence).
  _countDirTaps(action, endFrame, window = TAP_WINDOW) {
    const buf = this.ctrl.buffer()
    let n = 0
    for (let i = buf.length - 1; i >= 0; i--) {
      const e = buf[i]
      if (e.frame > endFrame) continue
      if (e.frame < endFrame - window) break
      if (e.action === action) n++
    }
    return n
  }

  // 8-frame input buffer scan (CONTRACTS.md §5). The final (button) element must
  // be a fresh unconsumed press. A direction listed ONCE is a held command input
  // (down+heavy). A direction REPEATED (the ↓↓+Light joke moves) is a tap
  // sequence: it needs that many distinct fresh presses of the direction within
  // ~20 frames of the button press — merely holding crouch never counts, so
  // crouching jabs stay crouching jabs.
  findMove(allowedKinds = null) {
    const buf = this.ctrl.buffer()
    const now = this.ctrl.frameNum()
    let best = null, bestScore = -1, bestEntry = null
    for (const move of this.def.moves) {
      if (allowedKinds && !allowedKinds.includes(move.kind)) continue
      if ((move.meterCost || 0) > this.meter) continue
      const seq = move.input || []
      const button = seq[seq.length - 1]
      if (!button || !BUTTONS.has(button)) continue
      let entry = null
      for (let i = buf.length - 1; i >= 0; i--) {
        const e = buf[i]
        if (e.frame < now - 8) break
        if (e.action === button && !this._consumed.has(e)) { entry = e; break }
      }
      if (!entry) continue
      const dirs = seq.slice(0, -1)
      const counts = {}
      for (const d of dirs) counts[d] = (counts[d] || 0) + 1
      let dirsOk = true
      for (const d in counts) {
        if (counts[d] > 1) {
          const action = this.dirTapAction(d)
          if (!action || this._countDirTaps(action, entry.frame) < counts[d]) { dirsOk = false; break }
        } else if (!this.dirHeld(d)) { dirsOk = false; break }
      }
      if (!dirsOk) continue
      const score = (move.meterCost || 0) + dirs.length * 8 + (KIND_PRIORITY[move.kind] || 0)
      if (score > bestScore) { best = move; bestScore = score; bestEntry = entry }
    }
    if (best && bestEntry) this._consumed.add(bestEntry)
    return best
  }

  startMove(move) {
    this.currentMove = move
    this.moveFrame = 0
    this.hitDone = false
    this.contactMade = false
    this.state = 'attack'
    this.stateFrames = 0
    this.armorFrames = move.armor || 0
    this._chainDrift = null
    if (move.meterCost) {
      this.gainMeter(-move.meterCost)
      this.match.cap(move.name ? move.name.toUpperCase() + '!' : 'SUPER!')
    }
    // supers announce themselves: fullscreen flash, sim frozen like hit-stop
    if (move.kind === 'super') { try { this.match.superFlash?.(this, move) } catch { /* presentation only */ } }
    const total = Math.max(1, (move.startup || 0) + (move.active || 0) + (move.recovery || 0))
    if (move.clip && this.animator.has(move.clip)) this.animator.playFitted(move.clip, total / 60)
    else this.animator.play('idle')
    this.game.audio.sfx('whoosh', { pitch: move.kind === 'light' ? 1.3 : 0.9 })
    // little forward lunge for chunky commitment — along the facing direction
    if (this.grounded() && move.kind !== 'grab') {
      const lunge = { light: 1.2, heavy: 2.4, kick: 2.0, launcher: 1.4, special: 2.0, super: 2.4, joke: 0.5, grab: 0 }[move.kind] ?? 1
      this.vel.x = this.dirX() * lunge
      this.vel.z = this.dirZ() * lunge
      // Chain-cancelled follow-ups home during startup: pushback from the hit
      // that was cancelled must never make the advertised light→heavy string
      // whiff, so the follow-up drifts toward the foe until its hitbox reaches
      // (capped at CHAIN_DRIFT_MAX total). Scripted moves steer themselves.
      if (this.chainDepth > 0 && this.foe && typeof move.script !== 'function') {
        const hb = move.hitbox || {}
        const reach = Math.max(0.6, (hb.forward ?? 1) + (hb.w ?? 1) * 0.5)
        this._chainDrift = { reach, moved: 0 }
      }
    }
    if (typeof move.script === 'function') {
      this.scriptFx = this.match.makeFx(this, () => { if (this.state === 'attack') this.endMove() })
      try { move.script(this.scriptFx) } catch (e) {
        console.error('[combat] move script threw', e)
        this.scriptFx.end()
      }
    }
  }

  endMove() {
    this.currentMove = null
    this.scriptFx = null
    this.throwSeq = null
    this.chainDepth = 0
    this._chainDrift = null
    if (this.grounded()) this.setState('idle')
    else { this.setState('jump'); this.animator.play('fall') }
  }

  // ---------------------------------------------------------------- update

  update(dt, allowControl) {
    this.stateFrames++
    if (this.invuln > 0) this.invuln--
    if (this.armorFrames > 0) this.armorFrames--
    if (this.flashFrames > 0) { this.flashFrames--; if (this.flashFrames === 0) this._unflash() }
    if (this._headPulseFrames > 0 && --this._headPulseFrames === 0) this._headPulseRestore()

    // cache the resolved move intent once per frame (movement + dirHeld share it)
    this._mi = this._moveIntent()
    // legacy ±1 facing: toward the foe, projected on world X (hysteresis when
    // the pair is z-aligned so scripts never see it flap)
    if (this.foe) {
      const fdx = this.foe.pos.x - this.pos.x
      if (Math.abs(fdx) > 0.05) this.facingSign = fdx >= 0 ? 1 : -1
    }

    switch (this.state) {
      case 'idle': case 'walk': case 'crouch': case 'block':
        this._updateNeutral(dt, allowControl); break
      case 'dash': case 'backdash':
        this._updateDash(dt, allowControl); break
      case 'jump':
        this._updateAir(dt, allowControl); break
      case 'attack':
        this._updateAttack(dt, allowControl); break
      case 'hitstun':
        this._updateHitstun(dt); break
      case 'blockstun':
        this._updateBlockstun(dt); break
      case 'launched':
        this._updateLaunched(dt); break
      case 'knockdown':
        this._updateKnockdown(allowControl); break
      case 'getup':
        this._updateGetup(); break
      case 'grabbed':
      case 'ragdoll':
      case 'finisher':
        break
      case 'ko': case 'win': case 'lose':
        this.vel.x *= 0.8
        this.vel.z *= 0.8
        this._integrate(dt)
        break
      default:
        this._updateNeutral(dt, allowControl)
    }

    if (this.throwSeq) this._updateThrow()

    // §17 soft lock-on: smooth-yaw toward the foe when attacking or in range;
    // free movement outside lock range faces the direction of travel.
    this._updateFacing(dt)

    this._clampBounds()

    if (this.state !== 'ragdoll') this.animator.update(dt)
    this._updatePresentation(dt)
    this._integrityCheck()
  }

  _updateFacing(dt) {
    if (!this.foe) return
    let target = null
    let rate = 0
    if (this.state === 'attack' && !this.scriptFx) {
      // attacks track the foe, slower — redirects reads as commitment, not aimbot
      target = this.yawTo(this.foe.pos.x, this.foe.pos.z)
      rate = 6
    } else if (LOCK_STATES.has(this.state)) {
      const dist = Math.hypot(this.foe.pos.x - this.pos.x, this.foe.pos.z - this.pos.z)
      if (dist <= LOCK_RANGE) {
        target = this.yawTo(this.foe.pos.x, this.foe.pos.z)
        rate = 12
      } else {
        const sp = Math.hypot(this.vel.x, this.vel.z)
        if (sp > 0.8) {
          target = Math.atan2(-this.vel.z, this.vel.x)
          rate = 10
        }
      }
    }
    if (target != null) this._turnToward(target, rate * dt)
  }

  // Invisible-body tripwire + self-heal (v2.0 mandate): if the visual model
  // drifts >4m from the logical fighter outside ragdoll/finisher/grab (where
  // physics or scripts legitimately own the visual), snap it back and warn
  // once per match. Also NaN-heals the logical position itself.
  _integrityCheck() {
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) {
      this.pos.set(0, 0, 0)
      this.vel.set(0, 0, 0)
    }
    if (GUARD_EXEMPT.has(this.state)) return
    const g = this._modelGroup
    if (!g) return
    // check BOTH the model group and the hips bone: a failed ragdoll recovery
    // typically leaves the bones stranded while the group still tracks root.
    g.getWorldPosition(_guardPos)
    let d2 = _guardPos.distanceToSquared(this.pos)
    if (Number.isFinite(d2) && d2 <= 16 && this.bones.hips) {
      this.bones.hips.getWorldPosition(_guardPos)
      const hd2 = _guardPos.distanceToSquared(this.pos)
      if (!Number.isFinite(hd2) || hd2 > d2) d2 = hd2
    }
    if (Number.isFinite(d2) && d2 <= 16) return
    g.position.copy(this._modelBind)
    this.holder.position.set(0, 0, 0)
    g.visible = true
    this.root.visible = true
    if (this.bones.hips && this._hipsBind) this.bones.hips.position.copy(this._hipsBind)
    if (!this._desyncWarned) {
      this._desyncWarned = true
      console.warn(`[combat] fighter ${this.slot} model desynced from body (${Math.sqrt(Math.max(0, d2)).toFixed(1)}m) — snapped back`)
    }
  }

  _updatePresentation(dt) {
    // squash & stretch spring
    this._squash += (0 - this._squash) * Math.min(1, dt * 14)
    const s = this._squash
    this.holder.scale.set(1 + s * 0.55, 1 - s, 1 + s * 0.55)
    // tumble while launched
    if (this.state === 'launched') {
      this.tumble += this.tumbleRate * dt
      this.holder.rotation.z = this.tumble
    } else if (this.tumble !== 0 && this.state !== 'ragdoll') {
      this.tumble *= 0.75
      if (Math.abs(this.tumble) < 0.03) this.tumble = 0
      this.holder.rotation.z = this.tumble
    }
    // speed lean along the facing direction (forward speed tips the body in)
    if (this.state === 'walk' || this.state === 'dash' || this.state === 'backdash') {
      const fs = this.vel.x * this.dirX() + this.vel.z * this.dirZ()
      this.holder.rotation.z = -fs * 0.012
    }
  }

  _integrate(dt) {
    if (!this.grounded() || this.vel.y > 0) this.vel.y += GRAVITY * dt
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    this.pos.z += this.vel.z * dt
    if (this.pos.y <= 0) {
      const wasAir = this.pos.y < -0.0001 || this.vel.y < -0.01
      this.pos.y = 0
      const impact = -this.vel.y
      this.vel.y = 0
      return wasAir && impact > 1 ? impact : 0
    }
    return 0
  }

  _clampBounds() {
    const b = this.match.bounds || {}
    const pad = 0.35
    const minX = (b.minX ?? -9) + pad, maxX = (b.maxX ?? 9) - pad
    const minZ = (b.minZ ?? -5.5) + pad, maxZ = (b.maxZ ?? 5.5) - pad
    if (this.pos.x < minX) this.pos.x = minX
    else if (this.pos.x > maxX) this.pos.x = maxX
    if (this.pos.z < minZ) this.pos.z = minZ
    else if (this.pos.z > maxZ) this.pos.z = maxZ
  }

  _updateNeutral(dt, allow) {
    if (!allow) {
      this.vel.x = 0
      this.vel.z = 0
      if (this.state !== 'idle' && this.state !== 'walk') this.setState('idle')
      return
    }
    const mi = this._mi

    // attacks first (so down+button works out of crouch); blocking locks attacks out
    if (this.state !== 'block') {
      const move = this.findMove()
      if (move) { this.startMove(move); return }
    }

    // jump (§27: settings.jumpEnabled=false ignores jump input — read live)
    if (this.state !== 'block' && this.ctrl.pressed('jump') && this._jumpEnabled()) {
      const js = (this.def.walkSpeed || 4) * 1.15 * this.speedMult
      this.vel.y = this.def.jumpVel || 8
      this.vel.x = mi.mx * js
      this.vel.z = mi.mz * js
      this.setState('jump')
      this.squash(-0.22)
      this.game.audio.sfx('boing', { vol: 0.3, pitch: 1.4 })
      return
    }

    // dash detection: double-tap or AI intent
    const dashVec = this._detectDash()
    if (dashVec) {
      let toward = 1
      if (this.foe) {
        const dx = this.foe.pos.x - this.pos.x, dz = this.foe.pos.z - this.pos.z
        const dd = Math.hypot(dx, dz)
        if (dd > 1e-4) toward = (dashVec.x * dx + dashVec.z * dz) / dd
      }
      const forward = toward >= 0
      this.dashDir = dashVec
      this.dashFrames = forward ? 14 : 10
      this.setState(forward ? 'dash' : 'backdash')
      if (!forward) this.invuln = Math.max(this.invuln, 8)
      this.squash(0.12)
      this.game.audio.sfx('slide', { vol: 0.4 })
      return
    }

    // block / crouch / walk
    if (this.ctrl.isDown('block')) {
      this.vel.x = 0
      this.vel.z = 0
      this.setState('block')
      return
    }
    if (this.ctrl.isDown('crouch')) {
      this.vel.x = 0
      this.vel.z = 0
      this.setState('crouch')
      return
    }
    const ws = (this.def.walkSpeed || 4) * this.speedMult
    this.vel.x = mi.mx * ws
    this.vel.z = mi.mz * ws
    this.setState(mi.len > 0.05 ? 'walk' : 'idle')
    if (this.state === 'walk') {
      // backpedaling (moving against the facing) plays the walk in reverse
      const fdot = mi.len > 0 ? (mi.mx * this.dirX() + mi.mz * this.dirZ()) / mi.len : 1
      this.animator.play('walk', { speed: fdot < -0.2 ? -0.8 : 1 })
    }
    this._integrate(dt)
  }

  // returns a WORLD-space unit-ish dash vector, or null.
  // AI dashes: prefer the v2 full-XZ intent (wantsDashVec), falling back to
  // the v1 ±1 world-X scalar. Humans double-tap any of the four movement
  // actions and dash camera-relative in that direction.
  _detectDash() {
    const aiVec = this.ctrl.wantsDashVec?.()
    if (aiVec && (aiVec.x || aiVec.z)) {
      const n = Math.hypot(aiVec.x || 0, aiVec.z || 0) || 1
      return { x: (aiVec.x || 0) / n, z: (aiVec.z || 0) / n }
    }
    const ai = this.ctrl.wantsDash?.()
    if (ai) return { x: Math.sign(ai), z: 0 }
    const now = this.ctrl.frameNum()
    for (const a of ['left', 'right', 'fwd', 'back']) {
      if (this.ctrl.pressed(a)) {
        if (now - this.lastTap[a] <= 12) {
          this.lastTap[a] = -99
          return this._dashVec(a)
        }
        this.lastTap[a] = now
      }
    }
    return null
  }

  _dashVec(action) {
    const [ax, az] = action === 'left' ? [-1, 0] : action === 'right' ? [1, 0] : action === 'fwd' ? [0, 1] : [0, -1]
    const cy = this.isHuman ? this._camYaw() : 0
    const c = Math.cos(cy), s = Math.sin(cy)
    return { x: ax * c - az * s, z: -ax * s - az * c }
  }

  _updateDash(dt, allow) {
    this.dashFrames--
    const speed = (this.def.dashSpeed || 8) * (this.state === 'backdash' ? 0.85 : 1) * this.speedMult
    const ease = Math.min(1, this.dashFrames / 6 + 0.4)
    this.vel.x = this.dashDir.x * speed * ease
    this.vel.z = this.dashDir.z * speed * ease
    this._integrate(dt)
    if (allow) {
      const move = this.findMove()
      if (move) { this.startMove(move); return }
      if (this.ctrl.pressed('jump') && this.state === 'dash' && this._jumpEnabled()) {
        this.vel.y = this.def.jumpVel || 8
        this.setState('jump')
        this.squash(-0.2)
        return
      }
    }
    if (this.dashFrames <= 0) { this.vel.x = 0; this.vel.z = 0; this.setState('idle') }
  }

  _updateAir(dt, allow) {
    if (allow) {
      // partial air control on the plane
      const mi = this._mi
      const acc = (this.def.walkSpeed || 4) * 0.06 * this.speedMult
      this.vel.x += mi.mx * acc
      this.vel.z += mi.mz * acc
      const hs = Math.hypot(this.vel.x, this.vel.z)
      if (hs > 9) { this.vel.x *= 9 / hs; this.vel.z *= 9 / hs }
      const move = this.findMove(AIR_KINDS)
      if (move) { this.startMove(move); return }
    }
    if (this.vel.y < 0 && this.animator.clipName !== 'fall' && this.animator.has('fall')) this.animator.play('fall')
    this._integrate(dt)
    if (this.pos.y <= 0 && this.vel.y <= 0 && this.stateFrames > 2) {
      this.vel.x = 0
      this.vel.z = 0
      this.setState('idle')
      this.squash(0.18)
      this.game.audio.sfx('thud', { vol: 0.25, pitch: 1.5 })
    }
  }

  _updateAttack(dt, allow) {
    this.moveFrame++
    const m = this.currentMove
    if (!m) { this.endMove(); return }

    if (this.scriptFx) {
      // scripted special: fx drives everything; safety net at 600 frames
      if (this.moveFrame > 600 && !this.scriptFx.done) this.scriptFx.end()
      this.vel.x *= 0.86
      this.vel.z *= 0.86
      this._integrate(dt)
      return
    }

    const total = (m.startup || 0) + (m.active || 0) + (m.recovery || 0)
    this.vel.x *= 0.86
    this.vel.z *= 0.86
    // chained follow-up homing: close the gap the previous hit's pushback
    // opened, only while grounded and only until the hitbox can connect
    if (this._chainDrift && this.grounded() && this.foe &&
        this.moveFrame <= (m.startup || 0) + (m.active || 0)) {
      const cd = this._chainDrift
      const dx = this.foe.pos.x - this.pos.x
      const dz = this.foe.pos.z - this.pos.z
      const gap = Math.hypot(dx, dz)
      if (gap > cd.reach) {
        const step = Math.min(gap - cd.reach, CHAIN_DRIFT_SPEED * dt, CHAIN_DRIFT_MAX - cd.moved)
        if (step > 0 && gap > 1e-4) {
          this.pos.x += (dx / gap) * step
          this.pos.z += (dz / gap) * step
          cd.moved += step
        }
        if (cd.moved >= CHAIN_DRIFT_MAX) this._chainDrift = null
      }
    }
    const impact = this._integrate(dt)

    // air attack landing cancels into brief landing recovery
    if (impact > 0.5) { this.endMove(); this.squash(0.15); return }

    // chain / special cancels once contact was made
    if (allow && this.contactMade && this.moveFrame >= (m.startup || 0)) {
      const cancels = CANCEL_TABLE[m.kind] || []
      if (cancels.length && this.chainDepth < 4) {
        const next = this.findMove(cancels)
        // Same-move LIGHT rekka chains are legal (v2.0 P1): single-light
        // rosters (Wally, Crypto Punk'd) must be able to land the advertised
        // light-light-light string — the contactMade gate + chainDepth cap
        // still bound it. Non-light kinds keep the next !== m exclusion.
        if (next && (next !== m || next.kind === 'light')) {
          this.chainDepth++
          this.startMove(next)
          return
        }
      }
    }

    if (this.moveFrame >= total) this.endMove()
  }

  _updateHitstun(dt) {
    this.hitstunFrames--
    this.vel.x *= 0.85
    this.vel.z *= 0.85
    this._integrate(dt)
    if (this.hitstunFrames <= 0) {
      if (this.grounded()) this.setState('idle')
      else { this.setState('jump'); this.animator.play('fall') }
    }
  }

  _updateBlockstun(dt) {
    this.blockstunFrames--
    this.vel.x *= 0.8
    this.vel.z *= 0.8
    this._integrate(dt)
    if (this.blockstunFrames <= 0) {
      this.setState(this.ctrl.isDown('block') ? 'block' : 'idle')
    }
  }

  _updateLaunched(dt) {
    this.vel.y += JUGGLE_GRAVITY * dt
    this.vel.x *= 0.995
    this.vel.z *= 0.995
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    this.pos.z += this.vel.z * dt

    // wall bounce — all four walls (§17)
    const b = this.match.bounds || {}
    const pad = 0.35
    const walls = [
      { axis: 'x', min: (b.minX ?? -9) + pad, max: (b.maxX ?? 9) - pad },
      { axis: 'z', min: (b.minZ ?? -5.5) + pad, max: (b.maxZ ?? 5.5) - pad },
    ]
    for (const w of walls) {
      const p = this.pos[w.axis]
      const v = this.vel[w.axis]
      if (!((p <= w.min && v < 0) || (p >= w.max && v > 0))) continue
      this.pos[w.axis] = Math.max(w.min, Math.min(w.max, p))
      if (Math.abs(v) > 4 && this.wallBounces < 2) {
        this.vel[w.axis] = -v * (b.wallBounce ?? 0.5)
        this.vel.y = Math.max(this.vel.y, 3)
        this.wallBounces++
        this.game.events.emit('camera:shake', { mag: 0.5 })
        this.game.audio.sfx('thud')
        this.match.particles.burst('sparks', { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z })
        this.squash(0.3)
      } else {
        this.vel[w.axis] = 0
      }
    }

    // floor: ground bounce once, then knockdown
    if (this.pos.y <= 0 && this.vel.y < 0) {
      const impact = -this.vel.y
      this.pos.y = 0
      if (impact > 7.5 && this.bounces < 1) {
        this.bounces++
        this.vel.y = impact * (0.35 + (this.match.presetCfg?.bounce ?? 0.3) * 0.5)
        this.vel.x *= 0.75
        this.vel.z *= 0.75
        this.game.events.emit('camera:shake', { mag: 0.45 })
        this.game.audio.sfx('thud')
        this.match.particles.burst('impact', { x: this.pos.x, y: 0.2, z: this.pos.z })
        this.squash(0.35)
      } else {
        this.vel.set(0, 0, 0)
        this.tumbleRate = 0
        this.holder.rotation.z = 0
        this.tumble = 0
        this.knockdownFrames = 42
        this.setState('knockdown')
        this.game.audio.sfx('thud', { vol: 0.6, pitch: 0.8 })
        this.match.particles.burst('smoke', { x: this.pos.x, y: 0.25, z: this.pos.z })
        this.squash(0.3)
      }
    }
  }

  _updateKnockdown(allow) {
    this.knockdownFrames--
    this.invuln = Math.max(this.invuln, 2)
    // wake-up attack buffering during the tail of the knockdown
    if (allow && this.knockdownFrames < 15 && !this.wakeupMove) {
      const m = this.findMove(['light', 'heavy', 'kick', 'launcher', 'special'])
      if (m) this.wakeupMove = m
    }
    if (this.knockdownFrames <= 0) {
      this.getupFrames = 22
      this.invuln = 24
      this.setState('getup')
    }
  }

  _updateGetup() {
    this.getupFrames--
    if (this.getupFrames <= 0) {
      this.setState('idle')
      if (this.wakeupMove) {
        const m = this.wakeupMove
        this.wakeupMove = null
        this.invuln = 10 // wake-up attack window with brief invuln
        this.startMove(m)
      }
    }
  }

  _updateThrow() {
    const s = this.throwSeq
    if (!s) return
    s.t++
    const foe = s.foe
    if (foe.state !== 'grabbed') { this.throwSeq = null; return }
    foe.pos.x = this.pos.x + this.dirX() * 0.85
    foe.pos.z = this.pos.z + this.dirZ() * 0.85
    foe.pos.y = Math.min(1, s.t / 16) * 0.8
    if (s.t >= 22) {
      this.throwSeq = null
      this.match.finishThrow(this, foe, s.move)
    }
  }

  // ------------------------------------------------------------- reactions
  // (called by MatchScreen during hit resolution — kbx/kbz are world-space)

  enterHitstun(frames, heavy, kbx, kbz = 0) {
    this.currentMove = null
    this.scriptFx = null
    this.hitstunFrames = frames
    this.state = 'hitstun'
    this.stateFrames = 0
    this.vel.x = kbx
    this.vel.z = kbz
    this.animator.play(heavy ? 'hitHeavy' : 'hitLight', { restart: true })
    this.squash(heavy ? 0.3 : 0.18)
    this.flash()
  }

  enterBlockstun(frames, kbx, kbz = 0) {
    this.blockstunFrames = frames
    this.state = 'blockstun'
    this.stateFrames = 0
    this.vel.x = kbx
    this.vel.z = kbz
    this.animator.play('block')
    this.squash(0.08)
  }

  // If this fighter is interrupted mid-throw (script hit, hazard, ragdoll),
  // free the victim — a grabbed foe whose thrower vanished would otherwise
  // stay 'grabbed' forever (soft-lock).
  releaseGrabVictim() {
    const foe = this.throwSeq?.foe
    this.throwSeq = null
    if (foe && foe.state === 'grabbed') {
      foe.pos.y = 0
      foe.vel.set(0, 0, 0)
      foe.setState('idle')
      foe.invuln = Math.max(foe.invuln, 6)
    }
  }

  enterLaunched(vx, vy, spin, vz = 0) {
    this.currentMove = null
    this.scriptFx = null
    this.releaseGrabVictim()
    this.state = 'launched'
    this.stateFrames = 0
    this.vel.x = vx
    this.vel.y = vy
    this.vel.z = vz
    this.bounces = 0
    this.wallBounces = 0
    this.tumbleRate = -Math.sign(vx || this.facingSign) * (2 + Math.abs(spin || 0) * 3)
    this.animator.play('launched', { restart: true })
    this.squash(0.25)
    this.flash()
  }

  dispose(scene) {
    this._offHitFx?.()
    this._offHitFx = null
    this._headPulseRestore()
    scene.remove(this.root)
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.()
        const list = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of list) m?.dispose?.()
      }
    })
  }
}
