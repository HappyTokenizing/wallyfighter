// RagdollManager — comedy ragdolls for WALLY: CRYPTO SMACKDOWN.
// Builds a loose-jointed cannon-es skeleton from a fighter's bone rig (§4),
// drives full/partial ragdoll + recovery blending, and gives accessory bones
// (trunk/ears/tail) always-on spring-follow secondary motion. CONTRACTS.md §7.
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { FIRST_RAGDOLL_GROUP } from './PhysicsManager.js'

const CORE_BONES = new Set(['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR',
  'forearmL', 'forearmR', 'shinL', 'shinR'])

// Relative mass distribution — normalized to 8 * def.weight at build time.
const MASS_TABLE = {
  hips: 2.6, torso: 2.6, head: 1.1,
  armL: 0.7, armR: 0.7, forearmL: 0.4, forearmR: 0.4,
  legL: 1.2, legR: 1.2, shinL: 0.7, shinR: 0.7,
}
const EXTRA_MASS = 0.2

// Loose "human-ish" joint limits. Loose because a tight ragdoll is a sad ragdoll.
function jointLimits(name) {
  if (name === 'head') return { angle: 0.95, twist: 0.7 }
  if (name === 'torso') return { angle: 0.7, twist: 0.6 }
  if (name.startsWith('forearm') || name.startsWith('shin')) return { angle: 1.5, twist: 0.4 }
  if (name.startsWith('arm')) return { angle: 1.55, twist: 0.9 }
  if (name.startsWith('leg')) return { angle: 1.2, twist: 0.7 }
  return { angle: 1.6, twist: 1.2 } // extras: trunk/ears/tail flop freely
}

const SETTLE_LIN = 0.9
const SETTLE_ANG = 1.4
// v2.1 mobile-feel pass: fighters get back up faster — settle confirmation
// window 20 -> 12 calm frames, force-settle timeout 6s -> 4s.
const SETTLE_FRAMES = 12
const FORCE_SETTLE_TIME = 4.0
// Ground-calm assist (see _updateFull): a downed pile keeps ~8-12 rad/s of
// pure constraint micro-jitter (near-zero displacement), which stalls the
// settle detector until the force-settle timeout — piles must be dampable
// once they lie LOW and translationally slow, or "calm frames" never happen.
const CALM_MAX_Y = 0.8
const CALM_LIN = SETTLE_LIN * 1.5
const PARTIAL_TIME = 0.45

const REGION_BONES = {
  head: ['head'],
  armL: ['armL', 'forearmL'],
  armR: ['armR', 'forearmR'],
  legs: ['legL', 'legR', 'shinL', 'shinR'],
  upper: ['torso', 'head', 'armL', 'armR'],
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _q3 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _e1 = new THREE.Euler()
const ONE = new THREE.Vector3(1, 1, 1)

function toV3(v, fallbackX = 0) {
  if (typeof v === 'number') return new THREE.Vector3(v, Math.abs(v) * 0.4, 0)
  if (!v) return new THREE.Vector3(fallbackX, 0, 0)
  if (Array.isArray(v)) return new THREE.Vector3(v[0] || 0, v[1] || 0, v[2] || 0)
  return new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0)
}

/** Bounding box of a bone's own meshes in bone-local space, excluding sub-bone subtrees. */
function boneLocalBox(bone, boneSet) {
  const box = new THREE.Box3()
  const walk = (obj, mat) => {
    for (const child of obj.children) {
      if (boneSet.has(child)) continue
      const local = new THREE.Matrix4().compose(child.position, child.quaternion, child.scale)
      const acc = new THREE.Matrix4().multiplyMatrices(mat, local)
      if (child.isMesh && child.geometry) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
        box.union(child.geometry.boundingBox.clone().applyMatrix4(acc))
      }
      walk(child, acc)
    }
  }
  walk(bone, new THREE.Matrix4())
  return box
}

export class RagdollManager {
  constructor(physics, game) {
    this.physics = physics
    this.game = game
    this._rags = new Map() // fighter -> record
    this._nextGroupShift = 0
  }

  _preset() { return this.physics?.preset || { knockback: 1, bounce: 0.3, spin: 1 } }
  _rec(fighter) { return this._rags.get(fighter) }

  // ----------------------------------------------------------------- build

  build(fighter) {
    if (!fighter || !fighter.bones) return null
    const existing = this._rags.get(fighter)
    if (existing) return existing

    const bones = fighter.bones
    const boneSet = new Set(Object.values(bones))
    const names = Object.keys(bones)
    const weight = fighter.def?.weight || 1
    const group = FIRST_RAGDOLL_GROUP << (this._nextGroupShift++ % 8)

    // Normalize masses to a stable total so knockback tuning survives any rig.
    let massSum = 0
    for (const n of names) massSum += MASS_TABLE[n] ?? EXTRA_MASS
    const massScale = (8 * weight) / Math.max(0.001, massSum)

    // Rest-pose world transforms for constraint pivots.
    const root = bones.hips?.parent && !boneSet.has(bones.hips.parent) ? bones.hips.parent : bones.hips
    root?.updateWorldMatrix?.(true, true)

    const parts = {} // name -> part record
    for (const name of names) {
      const bone = bones[name]
      if (!bone || !bone.isObject3D) continue
      let box = boneLocalBox(bone, boneSet)
      if (box.isEmpty()) box.set(new THREE.Vector3(-0.07, -0.07, -0.07), new THREE.Vector3(0.07, 0.07, 0.07))
      const size = box.getSize(new THREE.Vector3())
      const half = new CANNON.Vec3(
        THREE.MathUtils.clamp(size.x / 2, 0.05, 1.4),
        THREE.MathUtils.clamp(size.y / 2, 0.05, 1.4),
        THREE.MathUtils.clamp(size.z / 2, 0.05, 1.4)
      )
      const offset = box.getCenter(new THREE.Vector3()) // bone-space joint→body-center
      const isExtra = !CORE_BONES.has(name)
      const body = new CANNON.Body({
        mass: (MASS_TABLE[name] ?? EXTRA_MASS) * massScale,
        material: this.physics.materials?.ragdoll,
        shape: new CANNON.Box(half),
        collisionFilterGroup: group,
        collisionFilterMask: -1 & ~group, // never wrestle your own limbs
        linearDamping: 0.08,
        angularDamping: isExtra ? 0.35 : 0.22,
      })
      body.sleepSpeedLimit = 0.4
      body.sleepTimeLimit = 1.0
      body.allowSleep = true
      this.physics.watchBody?.(body, { kind: 'ragdoll', fighter, bone: name })

      bone.getWorldPosition(_v1)
      bone.getWorldQuaternion(_q1)
      parts[name] = {
        name, bone, body, offset, isExtra,
        lastWorldPos: _v1.clone(),
        worldVel: new THREE.Vector3(),
      }
    }

    // Constraints: parent bone found by walking up the THREE hierarchy — this
    // handles forearms, shins and arbitrary extras (trunk under head, tail
    // under hips) without a hard-coded skeleton.
    const partByBone = new Map(Object.values(parts).map((p) => [p.bone, p]))
    const constraints = []
    for (const p of Object.values(parts)) {
      if (p.name === 'hips') continue
      let anc = p.bone.parent
      let parentPart = null
      while (anc) {
        parentPart = partByBone.get(anc)
        if (parentPart) break
        anc = anc.parent
      }
      if (!parentPart) continue
      // Joint pivot = child bone origin, expressed in each body's frame (rest pose).
      p.bone.getWorldPosition(_v1) // joint world pos
      parentPart.bone.getWorldQuaternion(_q1)
      parentPart.bone.getWorldPosition(_v2)
      const pivotA = _v1.clone().sub(_v2).applyQuaternion(_q1.clone().invert())
      // parent body center sits at parentOffset in parent-bone space:
      pivotA.sub(parentPart.offset)
      const pivotB = p.offset.clone().negate()
      const axis = p.offset.lengthSq() > 1e-6 ? p.offset.clone().normalize() : new THREE.Vector3(0, 1, 0)
      const lim = jointLimits(p.name)
      const c = new CANNON.ConeTwistConstraint(parentPart.body, p.body, {
        pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z),
        pivotB: new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z),
        axisA: new CANNON.Vec3(axis.x, axis.y, axis.z),
        axisB: new CANNON.Vec3(axis.x, axis.y, axis.z),
        angle: lim.angle,
        twistAngle: lim.twist,
        maxForce: 1e5,
        collideConnected: false,
      })
      constraints.push(c)
      p.parent = parentPart
    }

    // Accessory spring state (always-on secondary motion for extras).
    const springs = {}
    for (const p of Object.values(parts)) {
      if (!p.isExtra) continue
      springs[p.name] = this._makeSpring(p.bone)
    }
    // Optional forearms/shins also get a faint follow-through spring — cheap juice.
    for (const n of ['forearmL', 'forearmR']) {
      if (bones[n] && !springs[n]) springs[n] = this._makeSpring(bones[n], 0.35)
    }

    const rec = {
      fighter, parts, constraints, springs, group,
      state: 'none', inWorld: false,
      settleFrames: 0, settled: false, fullTime: 0, staleFrames: 0,
      partials: new Map(), // boneName -> partial spring record
      recover: null, // { t, dur, snap: Map }
    }
    this._rags.set(fighter, rec)
    return rec
  }

  _makeSpring(bone, gain = 1) {
    return {
      bone, gain,
      offX: 0, offZ: 0, velX: 0, velZ: 0,
      lastParentPos: null, lastParentVel: new THREE.Vector3(),
      lastWritten: null, storedBase: new THREE.Quaternion(),
    }
  }

  // ------------------------------------------------------------------ full

  full(fighter, impulse, spin = 1) {
    const rec = this.build(fighter)
    if (!rec) return
    const world = this.physics?.world
    if (!world) return
    const preset = this._preset()
    const imp = toV3(impulse).multiplyScalar(preset.knockback ?? 1)
    const spinScale = (spin || 1) * (preset.spin ?? 1)

    // Already full-ragdolling (KO landing during a finisher, stacked
    // launches): NEVER re-capture — a second snapshot would orphan the first
    // visual state. Instead the new impulse re-launches the existing bodies,
    // so repeat full() calls are additive rather than silently dropped.
    if (rec.state === 'full') {
      if (rec.inWorld) {
        this._impulseBodies(rec, imp, spinScale)
        rec.settleFrames = 0
        rec.settled = false
        rec.fullTime = 0
        rec.staleFrames = 0
      }
      return
    }

    // Clear any partial flinches — full ragdoll owns the whole body now.
    this._clearPartials(rec)
    rec.recover = null

    fighter.bones.hips?.updateWorldMatrix?.(true, true)
    for (const p of Object.values(rec.parts)) {
      const bone = p.bone
      bone.updateWorldMatrix(true, false)
      bone.getWorldPosition(_v1)
      bone.getWorldQuaternion(_q1)
      _v2.copy(p.offset).applyQuaternion(_q1)
      const b = p.body
      b.position.set(_v1.x + _v2.x, _v1.y + _v2.y, _v1.z + _v2.z)
      b.quaternion.set(_q1.x, _q1.y, _q1.z, _q1.w)
      // Seed with the animation's own momentum (tracked every frame in update).
      b.velocity.set(p.worldVel.x, p.worldVel.y, p.worldVel.z)
      b.linearDamping = 0.08
      b.angularDamping = p.isExtra ? 0.35 : 0.22
      b.force.set(0, 0, 0)
      b.torque.set(0, 0, 0)
      if (!rec.inWorld) world.addBody(b)
    }
    this._impulseBodies(rec, imp, spinScale)
    if (!rec.inWorld) for (const c of rec.constraints) world.addConstraint(c)
    rec.inWorld = true
    rec.state = 'full'
    rec.settleFrames = 0
    rec.settled = false
    rec.fullTime = 0
    rec.staleFrames = 0
  }

  /** Distribute a launch impulse + comedy angular chaos over the rec's bodies.
   *  Shared by the initial full() capture and additive repeat full() calls. */
  _impulseBodies(rec, imp, spinScale) {
    const totalMass = Object.values(rec.parts).reduce((s, p) => s + p.body.mass, 0)
    for (const p of Object.values(rec.parts)) {
      const b = p.body
      // Launch impulse distributed body-wide, extra oomph through the torso.
      const share = p.name === 'torso' || p.name === 'hips' ? 1.35 : 1
      b.velocity.x += (imp.x / Math.max(1, totalMass * 0.12)) * share * 0.12
      b.velocity.y += (imp.y / Math.max(1, totalMass * 0.12)) * share * 0.12
      b.velocity.z += (imp.z / Math.max(1, totalMass * 0.12)) * share * 0.12
      // Comedy angular chaos — every limb picks its own narrative.
      const chaos = (p.name === 'hips' || p.name === 'torso' ? 5 : 3.2) * spinScale
      b.angularVelocity.set(
        (Math.random() - 0.5) * chaos,
        (Math.random() - 0.5) * chaos,
        (Math.random() - 0.5) * chaos * 1.6 // z-spin still reads best on camera
      )
      b.wakeUp()
    }
  }

  // --------------------------------------------------------------- partial

  partial(fighter, region, impulse) {
    const rec = this.build(fighter)
    if (!rec || rec.state === 'full') return
    const imp = toV3(impulse, 4)
    const mag = THREE.MathUtils.clamp(imp.length(), 1.5, 14)
    const dirX = Math.sign(imp.x || 1)
    const spinScale = this._preset().spin ?? 1
    const boneNames = REGION_BONES[region] || REGION_BONES.upper

    for (const name of boneNames) {
      const bone = fighter.bones[name]
      if (!bone) continue
      let ps = rec.partials.get(name)
      if (!ps) {
        ps = { bone, t: 0, offX: 0, offZ: 0, velX: 0, velZ: 0, lastWritten: null, storedBase: new THREE.Quaternion(), weight: 0 }
        rec.partials.set(name, ps)
      }
      ps.t = 0
      // Kick: head snaps back around Z, arms/legs flail with spice.
      const kick = mag * (0.55 + Math.random() * 0.35) * (0.7 + spinScale * 0.3)
      if (name === 'head') {
        ps.velZ += -dirX * kick * 1.5
        ps.velX += (Math.random() - 0.5) * kick * 0.5
      } else if (name.startsWith('leg') || name.startsWith('shin')) {
        ps.velZ += dirX * kick * (0.8 + Math.random() * 0.6)
        ps.velX += (Math.random() - 0.5) * kick
      } else {
        ps.velZ += -dirX * kick * (0.9 + Math.random() * 0.8)
        ps.velX += (Math.random() - 0.5) * kick * 1.2
      }
    }
    // Whiplash the accessories too — trunk flop sells every jab.
    this._kickSprings(rec, mag * 0.6 * dirX)
    if (rec.state === 'none') rec.state = 'partial'
  }

  _kickSprings(rec, power) {
    for (const s of Object.values(rec.springs)) {
      s.velZ += -power * (0.8 + Math.random() * 0.6) * s.gain
      s.velX += (Math.random() - 0.5) * Math.abs(power) * s.gain
    }
  }

  _clearPartials(rec) {
    rec.partials.clear()
    if (rec.state === 'partial') rec.state = 'none'
  }

  // --------------------------------------------------------------- recover

  recover(fighter, ms = 500) {
    const rec = this._rec(fighter)
    if (!rec) return
    // Idempotent from ANY state. In particular 'full' hands off even if the
    // bodies somehow already left the world (partial add failure, external
    // teardown) — a 'full' rec that recover() refuses to release keeps
    // _updateFull pinning the bones to stale bodies forever, which is exactly
    // the "body stuck in the arena, invisible fighter playing" bug.
    // Sub-frame ms = INSTANT handoff (round reset / spawn teleport). Blending
    // would pin the bones to a snapshot taken at the ragdoll's settle point
    // while the caller teleports the root to a new spawn — parking the visible
    // pose meters from the logical fighter for the blend frames, which is
    // exactly the round-start "model desynced" tripwire. The Animator rewrites
    // every bone's absolute local pos+rot on the next update, so releasing
    // without a blend is pop-free there.
    const instant = (ms || 0) <= 16
    if (rec.state === 'full') {
      this._removeFromWorld(rec)
      if (instant) {
        rec.recover = null
        rec.state = rec.partials.size ? 'partial' : 'none'
      } else {
        // Bones currently match the ragdoll pose — snapshot local transforms.
        const snap = new Map()
        for (const p of Object.values(rec.parts)) {
          snap.set(p.bone, { pos: p.bone.position.clone(), quat: p.bone.quaternion.clone() })
        }
        rec.recover = { t: 0, dur: Math.max(0.05, (ms || 500) / 1000), snap }
        rec.state = 'recovering'
      }
    } else if (rec.state === 'recovering' && instant) {
      // teleport during an in-flight blend: the snapshot is stale the moment
      // the root moves — drop it now instead of blending across the arena
      rec.recover = null
      rec.state = rec.partials.size ? 'partial' : 'none'
    } else if (rec.state === 'partial') {
      this._clearPartials(rec)
    }
    rec.staleFrames = 0
    rec.settled = false
    rec.settleFrames = 0
  }

  _removeFromWorld(rec) {
    if (!rec.inWorld) return
    const world = this.physics.world
    for (const c of rec.constraints) world.removeConstraint(c)
    for (const p of Object.values(rec.parts)) world.removeBody(p.body)
    rec.inWorld = false
  }

  // ----------------------------------------------------------------- query

  isSettled(fighter) {
    const rec = this._rec(fighter)
    if (!rec) return true
    if (rec.state !== 'full') return true
    return rec.settled
  }

  state(fighter) {
    const rec = this._rec(fighter)
    if (!rec) return 'none'
    if (rec.state === 'partial' && rec.partials.size === 0) rec.state = 'none'
    return rec.state
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    if (!(dt > 0)) dt = 1 / 60
    for (const rec of this._rags.values()) {
      if (rec.state === 'full') {
        this._updateFull(rec, dt)
      } else {
        // Track bone world velocity so full() launches inherit animation momentum.
        this._trackVelocities(rec, dt)
        if (rec.recover) this._updateRecover(rec, dt)
        if (rec.partials.size) this._updatePartials(rec, dt)
        this._updateSprings(rec, dt) // accessory wobble: always on, always funny
      }
    }
  }

  _trackVelocities(rec, dt) {
    for (const p of Object.values(rec.parts)) {
      p.bone.getWorldPosition(_v1)
      _v2.copy(_v1).sub(p.lastWorldPos).divideScalar(dt)
      // Clamp: teleports (round reset, facing flips) must not become momentum.
      if (_v2.lengthSq() > 900) _v2.setScalar(0)
      p.worldVel.lerp(_v2, 0.5)
      p.lastWorldPos.copy(_v1)
    }
  }

  // ---- full ragdoll: bodies drive bones

  _updateFull(rec, dt) {
    // WATCHDOG — single-owner handoff enforcement. If something kinematically
    // resumed the fighter (script setState, state-machine edge) WITHOUT calling
    // recover(), this driver would keep pinning every bone to the settled
    // bodies while the invisible fighter walks away — the reported
    // "body stuck in the arena" bug. After ~10 stale frames we hand back.
    const fstate = rec.fighter?.state
    if (typeof fstate === 'string' && fstate !== 'ragdoll') {
      if (++rec.staleFrames >= 10) {
        console.warn(`[ragdoll] full ragdoll driving '${rec.fighter?.def?.id || '?'}' while fighter.state='${fstate}' — auto-recovering stale driver`)
        this.recover(rec.fighter, 300)
        return
      }
    } else {
      rec.staleFrames = 0
    }

    const bounds = this.physics.arenaBounds || { minX: -9, maxX: 9, wallBounce: 0.55 }
    const floorY = this.physics.floorY ?? 0
    const bounce = THREE.MathUtils.clamp((bounds.wallBounce ?? 0.55) + (this._preset().bounce ?? 0.3) * 0.3, 0.1, 0.95)
    // v2.0 free-roam (§17): walls on all four sides; z is a real fight axis
    // now, so no more spring pulling the pile back to the old 2.5D lane.
    const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ : -5.5
    const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ : 5.5
    rec.fullTime += dt

    let lin = 0, ang = 0, maxY = -Infinity
    for (const p of Object.values(rec.parts)) {
      const b = p.body
      // NaN rescue — a poisoned body must never write NaN into the bone graph
      // (a NaN matrixWorld makes the whole fighter subtree vanish).
      if (!Number.isFinite(b.position.x + b.position.y + b.position.z) ||
          !Number.isFinite(b.quaternion.x + b.quaternion.w)) {
        const fp = rec.fighter?.pos
        b.position.set(fp?.x ?? 0, floorY + 1, fp?.z ?? 0)
        b.quaternion.set(0, 0, 0, 1)
        b.velocity.set(0, 0, 0)
        b.angularVelocity.set(0, 0, 0)
        b.force.set(0, 0, 0)
        b.torque.set(0, 0, 0)
      }
      // Keep the show on stage: reflect off all four arena walls mid-ragdoll.
      if (b.position.x < bounds.minX + 0.25) {
        b.position.x = bounds.minX + 0.25
        if (b.velocity.x < 0) b.velocity.x = -b.velocity.x * bounce
      } else if (b.position.x > bounds.maxX - 0.25) {
        b.position.x = bounds.maxX - 0.25
        if (b.velocity.x > 0) b.velocity.x = -b.velocity.x * bounce
      }
      if (b.position.z < minZ + 0.25) {
        b.position.z = minZ + 0.25
        if (b.velocity.z < 0) b.velocity.z = -b.velocity.z * bounce
      } else if (b.position.z > maxZ - 0.25) {
        b.position.z = maxZ - 0.25
        if (b.velocity.z > 0) b.velocity.z = -b.velocity.z * bounce
      }
      if (b.position.y < floorY - 0.4) { // belt-and-suspenders under the walls
        b.position.y = floorY + 0.3
        if (b.velocity.y < 0) b.velocity.y = Math.abs(b.velocity.y) * 0.25
      }

      // Force-settle: after 6s the market closes, no more price discovery.
      if (rec.fullTime > FORCE_SETTLE_TIME) {
        b.velocity.scale(0.75, b.velocity)
        b.angularVelocity.scale(0.7, b.angularVelocity)
      }

      lin += b.velocity.length()
      ang += b.angularVelocity.length()
      if (b.position.y > maxY) maxY = b.position.y

      // Body → bone (world → local via parent inverse; handles mirrored roots).
      const bone = p.bone
      const parent = bone.parent
      _q1.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
      _v2.copy(p.offset).applyQuaternion(_q1)
      _v1.set(b.position.x - _v2.x, b.position.y - _v2.y, b.position.z - _v2.z)
      if (parent) {
        parent.updateWorldMatrix(true, false)
        _m1.copy(parent.matrixWorld).invert()
        _m2.compose(_v1, _q1, ONE)
        _m2.premultiply(_m1)
        _m2.decompose(bone.position, bone.quaternion, _v2)
      } else {
        bone.position.copy(_v1)
        bone.quaternion.copy(_q1)
      }
      p.lastWorldPos.copy(_v1)
      p.worldVel.set(b.velocity.x, b.velocity.y, b.velocity.z)
    }

    const n = Math.max(1, Object.keys(rec.parts).length)
    // Settled = slow AND calm — except a pile that lies LOW is judged on
    // linear velocity alone: the constraint solver sustains ~3-10 rad/s of
    // in-place angular micro-jitter forever on a downed pile (near-zero
    // displacement), which otherwise stalls the detector until the
    // force-settle timeout on EVERY knockdown. A low pile that has stopped
    // translating is visibly "down"; airborne tumbles keep the strict test.
    const low = maxY < floorY + CALM_MAX_Y
    const settledNow = low
      ? lin / n < CALM_LIN // in-place jitter tolerance, see above
      : lin / n < SETTLE_LIN && ang / n < SETTLE_ANG
    // Ground-calm assist: damp the low pile's jitter so the recovery blend
    // starts from a genuinely still pose.
    if (!rec.settled && low && lin / n < CALM_LIN) {
      for (const p of Object.values(rec.parts)) {
        p.body.velocity.scale(0.86, p.body.velocity)
        p.body.angularVelocity.scale(0.72, p.body.angularVelocity)
      }
    }
    rec.settleFrames = settledNow ? rec.settleFrames + 1 : 0
    if (rec.settleFrames >= SETTLE_FRAMES || rec.fullTime > FORCE_SETTLE_TIME + 0.5) {
      rec.settled = true
    }
  }

  // ---- recovering: blend snapshot → whatever the animator wrote this frame

  _updateRecover(rec, dt) {
    const r = rec.recover
    r.t += dt / r.dur
    const t = THREE.MathUtils.clamp(r.t, 0, 1)
    const ease = t * t * (3 - 2 * t) // smoothstep — no pops on either end
    for (const [bone, snap] of r.snap) {
      // Animator has (re)written the target pose; blend from the ragdoll snapshot.
      _q2.copy(snap.quat)
      bone.quaternion.copy(_q2.slerp(bone.quaternion, ease))
      bone.position.lerpVectors(snap.pos, bone.position, ease)
    }
    if (t >= 1) {
      rec.recover = null
      rec.state = rec.partials.size ? 'partial' : 'none'
    }
  }

  // ---- partial flinches: spring offsets layered over the playing animation

  _updatePartials(rec, dt) {
    for (const [name, ps] of rec.partials) {
      ps.t += dt
      if (ps.t > PARTIAL_TIME + 0.1) { rec.partials.delete(name); continue }
      // Damped rotational spring pulling the offset back to zero.
      const k = 62, c = 8.5
      ps.velX += (-k * ps.offX - c * ps.velX) * dt
      ps.velZ += (-k * ps.offZ - c * ps.velZ) * dt
      ps.offX = THREE.MathUtils.clamp(ps.offX + ps.velX * dt, -0.9, 0.9)
      ps.offZ = THREE.MathUtils.clamp(ps.offZ + ps.velZ * dt, -0.9, 0.9)
      // Blend envelope: snap in to ~0.65, hold, fade out (contract: 0.3–0.7, ~0.4s).
      let w
      if (ps.t < 0.06) w = (ps.t / 0.06) * 0.65
      else if (ps.t < 0.26) w = 0.65
      else w = 0.65 * Math.max(0, 1 - (ps.t - 0.26) / (PARTIAL_TIME - 0.26))
      ps.weight = w
      this._applyAdditive(ps, ps.offX * w, ps.offZ * w)
    }
    if (rec.partials.size === 0 && rec.state === 'partial') rec.state = 'none'
  }

  // ---- accessory springs: trunk/ears/tail wobble driven by parent motion

  _updateSprings(rec, dt) {
    const drive = 0.045 * (0.7 + (this._preset().spin ?? 1) * 0.3)
    for (const s of Object.values(rec.springs)) {
      const bone = s.bone
      const parent = bone.parent
      if (!parent) continue
      parent.getWorldPosition(_v1)
      if (!s.lastParentPos) { s.lastParentPos = _v1.clone(); continue }
      _v2.copy(_v1).sub(s.lastParentPos).divideScalar(dt)
      if (_v2.lengthSq() > 900) _v2.setScalar(0) // teleport guard
      // Acceleration of the parent, expressed in parent-local space.
      const ax = (_v2.x - s.lastParentVel.x) / dt
      const ay = (_v2.y - s.lastParentVel.y) / dt
      const az = (_v2.z - s.lastParentVel.z) / dt
      s.lastParentVel.copy(_v2)
      s.lastParentPos.copy(_v1)
      parent.getWorldQuaternion(_q1)
      _v2.set(THREE.MathUtils.clamp(ax, -60, 60), THREE.MathUtils.clamp(ay, -60, 60), THREE.MathUtils.clamp(az, -60, 60))
      _v2.applyQuaternion(_q1.invert())
      // Spring: sway against acceleration, always settling back to the pose.
      const k = 42, c = 6.5, g = s.gain * drive
      s.velZ += (-k * s.offZ - c * s.velZ - _v2.x * g * 10) * dt
      s.velX += (-k * s.offX - c * s.velX + _v2.z * g * 10) * dt
      s.offZ = THREE.MathUtils.clamp(s.offZ + s.velZ * dt, -0.75, 0.75)
      s.offX = THREE.MathUtils.clamp(s.offX + s.velX * dt, -0.75, 0.75)
      this._applyAdditive(s, s.offX, s.offZ)
    }
  }

  /**
   * Layer an (x,z) euler offset over whatever rotation the bone currently has.
   * If the animator rewrote the bone since our last write we treat the current
   * value as the new base; if not, we reuse the stored base (no accumulation).
   */
  _applyAdditive(s, ox, oz) {
    const bone = s.bone
    if (s.lastWritten && Math.abs(bone.quaternion.dot(s.lastWritten)) > 0.99999) {
      _q2.copy(s.storedBase)
    } else {
      _q2.copy(bone.quaternion)
    }
    s.storedBase.copy(_q2)
    _e1.set(ox, 0, oz)
    _q3.setFromEuler(_e1)
    bone.quaternion.copy(_q2).multiply(_q3)
    if (!s.lastWritten) s.lastWritten = new THREE.Quaternion()
    s.lastWritten.copy(bone.quaternion)
  }

  // --------------------------------------------------------------- cleanup

  dispose(fighter) {
    if (fighter) {
      const rec = this._rec(fighter)
      if (!rec) return
      this._removeFromWorld(rec)
      for (const p of Object.values(rec.parts)) this.physics.unwatchBody?.(p.body)
      this._rags.delete(fighter)
      return
    }
    for (const f of [...this._rags.keys()]) this.dispose(f)
  }
}
