// PhysicsManager — cannon-es world for WALLY: CRYPTO SMACKDOWN.
// Handles arena statics, dynamic props, breakable debris, comedy presets and the
// "physics must NEVER explode" guarantees (NaN guards, velocity clamps, floor
// tunneling rescue). See CONTRACTS.md §7.
import * as CANNON from 'cannon-es'
import * as THREE from 'three'

// Collision groups. Ragdolls get a per-fighter group above these bits so a
// fighter's own limbs never fight each other (unlike crypto twitter).
export const GROUP_STATIC = 1
export const GROUP_PROP = 2
export const GROUP_DEBRIS = 4
export const FIRST_RAGDOLL_GROUP = 8

const IMPACT_THRESHOLD = 2.4 // m/s along contact normal before we bother anyone
const IMPACT_COOLDOWN = 0.09 // seconds per body between impact events
const MAX_VEL = 80
const DEBRIS_LIFE = 4.0 // seconds before a fragment rugs itself
const DEBRIS_FADE = 0.45 // shrink-out portion of the lifetime

const _v3 = new THREE.Vector3()
const _v3b = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _m4 = new THREE.Matrix4()
const _fragGeo = new THREE.BoxGeometry(1, 1, 1)

function toVec3(v, out) {
  out = out || new CANNON.Vec3()
  if (!v) return out.set(0, 0, 0)
  if (Array.isArray(v)) return out.set(v[0] || 0, v[1] || 0, v[2] || 0)
  return out.set(v.x || 0, v.y || 0, v.z || 0)
}

function finite(n) { return typeof n === 'number' && isFinite(n) }

function vecOk(v) { return finite(v.x) && finite(v.y) && finite(v.z) }

/** Find the first material on a mesh/group so debris matches its parent prop. */
function firstMaterial(obj) {
  let mat = null
  obj.traverse?.((c) => { if (!mat && c.isMesh && c.material) mat = Array.isArray(c.material) ? c.material[0] : c.material })
  if (!mat && obj.isMesh && obj.material) mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
  return mat
}

export class PhysicsManager {
  constructor(game, presetName = 'standard') {
    this.game = game
    this.fixedStep = game?.config?.fixedStep || 1 / 60
    this.floorY = 0
    this.arenaBounds = null // set via setArenaBounds; ragdolls read this
    this.time = 0

    this.world = new CANNON.World()
    this.world.gravity.set(0, game?.config?.gravity ?? -22, 0)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    this.world.solver.iterations = 10
    this.world.defaultContactMaterial.friction = 0.4
    this.world.defaultContactMaterial.restitution = 0.2

    // Materials — restitution/friction rescaled every setPreset().
    this.materials = {
      ground: new CANNON.Material('smack-ground'),
      prop: new CANNON.Material('smack-prop'),
      ragdoll: new CANNON.Material('smack-ragdoll'),
    }
    const { ground, prop, ragdoll } = this.materials
    this._contacts = {
      propGround: new CANNON.ContactMaterial(prop, ground, { friction: 0.45, restitution: 0.3 }),
      propProp: new CANNON.ContactMaterial(prop, prop, { friction: 0.4, restitution: 0.25 }),
      ragGround: new CANNON.ContactMaterial(ragdoll, ground, { friction: 0.55, restitution: 0.2 }),
      ragProp: new CANNON.ContactMaterial(ragdoll, prop, { friction: 0.35, restitution: 0.25 }),
      ragRag: new CANNON.ContactMaterial(ragdoll, ragdoll, { friction: 0.3, restitution: 0.3 }),
    }
    for (const cm of Object.values(this._contacts)) this.world.addContactMaterial(cm)

    this.presets = game?.config?.physicsPresets || {
      standard: { name: 'Standard', knockback: 1, bounce: 0.3, spin: 1, debris: 1 },
    }
    this.preset = this.presets[presetName] || this.presets.standard
    this.presetName = this.preset === this.presets[presetName] ? presetName : 'standard'
    this._applyPresetToMaterials()

    this.maxProps = game?.quality?.propLimit ?? 24
    this.maxDebris = game?.quality?.maxDebris ?? 45
    // Keep the unsubscribe: one PhysicsManager is built per match, and a
    // dangling handler would pin the dead manager (CANNON world + arrays)
    // on the EventBus for the whole session.
    this._offQuality = game?.events?.on?.('quality:changed', () => {
      this.maxProps = game.quality?.propLimit ?? this.maxProps
      this.maxDebris = game.quality?.maxDebris ?? this.maxDebris
    })

    this.statics = []
    this.props = [] // live prop handles (oldest first)
    this.debris = [] // live fragment handles (oldest first)
    this._fragPool = [] // recycled { mesh, body } pairs
    this._impactQueue = [] // collide events are dispatched mid-step; we emit after
    this._breakQueue = [] // never remove bodies during world.step — defer breaks
    this._stepping = false
    this._disposed = false

    this._onCollide = this._onCollide.bind(this)
  }

  get propCount() { return this.props.length + this.debris.length }

  setPreset(name) {
    const p = this.presets[name]
    if (!p) return
    this.preset = p
    this.presetName = name
    this._applyPresetToMaterials()
    // Nudge sleepers awake so the new chaos level is immediately visible.
    for (const h of this.props) h.body.wakeUp()
  }

  _applyPresetToMaterials() {
    const b = this.preset.bounce ?? 0.3
    const spin = this.preset.spin ?? 1
    const c = this._contacts
    c.propGround.restitution = Math.min(0.92, 0.12 + b * 0.85)
    c.propProp.restitution = Math.min(0.9, 0.1 + b * 0.7)
    c.ragGround.restitution = Math.min(0.85, 0.08 + b * 0.65)
    c.ragProp.restitution = Math.min(0.85, 0.1 + b * 0.6)
    c.ragRag.restitution = Math.min(0.9, 0.15 + b * 0.6)
    // Higher chaos → slipperier world → more sliding comedy.
    const fr = Math.max(0.12, 0.5 / (0.6 + spin * 0.4))
    c.propGround.friction = fr
    c.ragGround.friction = fr + 0.1
  }

  setArenaBounds(bounds) { this.arenaBounds = bounds || null }

  // ---------------------------------------------------------------- statics

  addStaticBox(center, size) {
    const c = toVec3(center)
    const s = toVec3(size)
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: this.materials.ground,
      shape: new CANNON.Box(new CANNON.Vec3(Math.max(0.01, s.x / 2), Math.max(0.01, s.y / 2), Math.max(0.01, s.z / 2))),
      collisionFilterGroup: GROUP_STATIC,
      collisionFilterMask: -1,
    })
    body.position.copy(c)
    this.world.addBody(body)
    this.statics.push(body)
    return body
  }

  // ------------------------------------------------------------------ props

  addProp(mesh, opts = {}) {
    if (this._disposed || !mesh) return null
    this._makeRoom(1)

    mesh.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(mesh)
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.2, -0.2, -0.2), new THREE.Vector3(0.2, 0.2, 0.2))
    const dim = box.getSize(new THREE.Vector3())
    dim.x = Math.max(0.06, dim.x); dim.y = Math.max(0.06, dim.y); dim.z = Math.max(0.06, dim.z)

    let shape
    const kind = opts.shape || 'box'
    if (kind === 'sphere') {
      shape = new CANNON.Sphere(Math.max(dim.x, dim.y, dim.z) / 2)
    } else if (kind === 'cylinder') {
      const r = Math.max(dim.x, dim.z) / 2
      shape = new CANNON.Cylinder(r, r, dim.y, 10)
    } else {
      shape = new CANNON.Box(new CANNON.Vec3(dim.x / 2, dim.y / 2, dim.z / 2))
    }

    const body = new CANNON.Body({
      mass: Math.max(0.05, opts.mass ?? 1),
      material: this.materials.prop,
      shape,
      collisionFilterGroup: GROUP_PROP,
      collisionFilterMask: -1,
      linearDamping: 0.06,
      angularDamping: 0.12,
    })
    // Body center = bbox center in world (mesh pivot may be at its base).
    const center = box.getCenter(new THREE.Vector3())
    body.position.set(center.x, center.y, center.z)
    mesh.getWorldQuaternion(_q1)
    body.quaternion.set(_q1.x, _q1.y, _q1.z, _q1.w)
    body.sleepSpeedLimit = 0.5
    body.sleepTimeLimit = 0.8
    if (opts.velocity) body.velocity.copy(toVec3(opts.velocity))

    // Pivot offset so a base-pivoted mesh still renders where physics says.
    mesh.getWorldPosition(_v3)
    const pivotOffset = new THREE.Vector3().copy(_v3).sub(center)
    _q1.invert()
    pivotOffset.applyQuaternion(_q1) // into body-local frame

    const self = this
    const handle = {
      mesh,
      body,
      kind: opts.kind || kind,
      breakable: !!opts.breakable,
      health: opts.health ?? 25,
      alive: true,
      isDebris: false,
      born: this.time,
      _pivotOffset: pivotOffset,
      break(impactVel) { self._breakProp(handle, impactVel) },
      remove() { self._removeProp(handle) },
    }
    body._smack = { kind: 'prop', handle }
    body.addEventListener('collide', this._onCollide)
    this.world.addBody(body)
    this.props.push(handle)
    this._syncHandle(handle)
    return handle
  }

  _removeProp(handle) {
    if (!handle || !handle.alive) return
    handle.alive = false
    handle.body.removeEventListener('collide', this._onCollide)
    this.world.removeBody(handle.body)
    const arr = handle.isDebris ? this.debris : this.props
    const i = arr.indexOf(handle)
    if (i >= 0) arr.splice(i, 1)
    if (handle.isDebris) {
      handle.mesh.parent?.remove(handle.mesh)
      handle.mesh.scale.setScalar(1)
      this._fragPool.push({ mesh: handle.mesh, body: handle.body })
    } else {
      handle.mesh.parent?.remove(handle.mesh)
    }
  }

  /** Swap a prop for 4-8 exploding fragments that inherit its velocity. */
  _breakProp(handle, impactVel = 4) {
    if (!handle || !handle.alive || handle._broken) return
    if (this._stepping) { // never mutate the world mid-solve
      if (!this._breakQueue.some((e) => e.handle === handle)) this._breakQueue.push({ handle, speed: impactVel })
      return
    }
    handle._broken = true
    const body = handle.body
    const pos = body.position
    const vel = body.velocity
    const mat = firstMaterial(handle.mesh) || new THREE.MeshLambertMaterial({ color: 0x9e9e9e })
    const parent = handle.mesh.parent
    const box = new THREE.Box3().setFromObject(handle.mesh)
    const dim = box.isEmpty() ? new THREE.Vector3(0.4, 0.4, 0.4) : box.getSize(new THREE.Vector3())
    const debrisScale = this.preset.debris ?? 1

    const wanted = Math.min(8, 4 + Math.floor(Math.random() * 3) + (debrisScale > 1.4 ? 2 : 0))
    while (this.debris.length + wanted > this.maxDebris && this.debris.length) this._removeProp(this.debris[0])
    const n = Math.min(wanted, Math.max(0, this.maxDebris - this.debris.length))

    for (let i = 0; i < n; i++) {
      const frag = this._acquireFragment(mat, parent || null)
      if (!frag) break
      const sx = Math.max(0.05, dim.x * (0.2 + Math.random() * 0.25))
      const sy = Math.max(0.05, dim.y * (0.2 + Math.random() * 0.25))
      const sz = Math.max(0.05, dim.z * (0.2 + Math.random() * 0.25))
      frag.mesh.scale.set(sx, sy, sz)
      frag.mesh.material = mat
      const fb = frag.body
      // Rebuild the (pooled) body's shape at the new size.
      while (fb.shapes.length) fb.removeShape(fb.shapes[0])
      fb.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)))
      fb.mass = 0.25
      fb.updateMassProperties()
      const ox = (Math.random() - 0.5) * dim.x * 0.5
      const oy = (Math.random() - 0.5) * dim.y * 0.5
      const oz = (Math.random() - 0.5) * dim.z * 0.5
      fb.position.set(pos.x + ox, pos.y + oy, pos.z + oz)
      fb.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6)
      // Inherit velocity + explode outward. Number-go-up technology.
      const boom = (2.2 + Math.random() * 3.5 + Math.min(10, impactVel) * 0.3) * debrisScale
      const len = Math.max(0.15, Math.hypot(ox, oy, oz))
      fb.velocity.set(
        vel.x + (ox / len) * boom,
        vel.y + Math.abs(oy / len) * boom + 1.5 * debrisScale,
        vel.z + (oz / len) * boom
      )
      const spin = (this.preset.spin ?? 1) * 6
      fb.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin)
      fb.wakeUp()
    }

    this.game?.events?.emit('physics:break', { pos: { x: pos.x, y: pos.y, z: pos.z }, kind: handle.kind, handle })
    this._removeProp(handle)
  }

  _acquireFragment(material, parent) {
    let frag = this._fragPool.pop()
    if (!frag) {
      const mesh = new THREE.Mesh(_fragGeo, material)
      mesh.castShadow = true
      const body = new CANNON.Body({
        mass: 0.25,
        material: this.materials.prop,
        collisionFilterGroup: GROUP_DEBRIS,
        // Debris ignores other debris — cheaper, calmer piles, still bounces off world.
        collisionFilterMask: -1 & ~GROUP_DEBRIS,
        linearDamping: 0.12,
        angularDamping: 0.25,
      })
      body.sleepSpeedLimit = 0.6
      body.sleepTimeLimit = 0.5
      frag = { mesh, body }
    }
    if (parent) parent.add(frag.mesh)
    frag.mesh.visible = true
    this.world.addBody(frag.body)
    const handle = {
      mesh: frag.mesh,
      body: frag.body,
      kind: 'debris',
      breakable: false,
      alive: true,
      isDebris: true,
      born: this.time,
      _pivotOffset: null,
      break() {},
      remove: () => this._removeProp(handle),
    }
    frag.body._smack = { kind: 'debris', handle }
    this.debris.push(handle)
    return handle
  }

  /** Free budget for `n` incoming props: oldest sleeping debris first, then oldest debris, then oldest sleeping prop, then oldest prop. */
  _makeRoom(n) {
    const over = () => this.props.length + n > this.maxProps
    let guard = 64
    while (over() && guard-- > 0) {
      let victim = this.debris.find((d) => d.body.sleepState === CANNON.Body.SLEEPING)
        || this.debris[0]
        || this.props.find((p) => p.body.sleepState === CANNON.Body.SLEEPING)
        || this.props[0]
      if (!victim) break
      this._removeProp(victim)
    }
  }

  // -------------------------------------------------------------- dynamics

  impulse(target, vec, point) {
    const body = target?.body || (target instanceof CANNON.Body ? target : target)
    if (!body || !body.applyImpulse) return
    const imp = toVec3(vec)
    body.wakeUp()
    if (point) {
      const p = toVec3(point)
      body.applyImpulse(imp, new CANNON.Vec3(p.x - body.position.x, p.y - body.position.y, p.z - body.position.z))
    } else {
      body.applyImpulse(imp)
    }
  }

  /** Register an externally-owned body (ragdoll limbs) for impact events. */
  watchBody(body, meta) {
    body._smack = meta || { kind: 'body' }
    body.addEventListener('collide', this._onCollide)
  }

  unwatchBody(body) {
    body.removeEventListener('collide', this._onCollide)
  }

  _onCollide(e) {
    const body = e.target
    const other = e.body
    if (!body || (body._impactCd || 0) > this.time) return
    let speed = 0
    try { speed = Math.abs(e.contact.getImpactVelocityAlongNormal()) } catch { return }
    if (!finite(speed) || speed < IMPACT_THRESHOLD) return
    body._impactCd = this.time + IMPACT_COOLDOWN
    const cp = body.position
    const pos = {
      x: cp.x + (e.contact?.ri?.x || 0),
      y: cp.y + (e.contact?.ri?.y || 0),
      z: cp.z + (e.contact?.ri?.z || 0),
    }
    const a = body._smack?.handle || body._smack || body
    const b = other?._smack?.handle || other?._smack || other
    // Collide events fire inside world.step — mutating the world (or running
    // arbitrary game listeners) mid-step corrupts the solver. Queue everything.
    this._impactQueue.push({ a, b, speed, pos })

    // Breakables take structural damage from big hits. Not financial advice.
    const h = body._smack?.handle
    if (h && h.breakable && h.alive && !h.isDebris && speed > 3) {
      h.health -= speed * 1.6
      if (h.health <= 0 && !this._breakQueue.some((e) => e.handle === h)) this._breakQueue.push({ handle: h, speed })
    }
  }

  _flushQueues() {
    if (this._breakQueue.length) {
      const q = this._breakQueue
      this._breakQueue = []
      for (const { handle, speed } of q) this._breakProp(handle, speed)
    }
    if (this._impactQueue.length) {
      const q = this._impactQueue
      this._impactQueue = []
      for (const ev of q) this.game?.events?.emit('physics:impact', ev)
    }
  }

  // ------------------------------------------------------------------ step

  step(dt) {
    if (this._disposed) return
    const h = finite(dt) && dt > 0 ? Math.min(dt, 1 / 30) : this.fixedStep
    this.time += h
    this._stepping = true
    try { this.world.step(h) } finally { this._stepping = false }
    this._flushQueues()
    this._sanitizeAll()
    for (const p of this.props) this._syncHandle(p)
    this._updateDebris()
  }

  _sanitizeAll() {
    const floorRescue = this.floorY - 1.2
    const bodies = this.world.bodies
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]
      if (b.mass <= 0 || b.type === CANNON.Body.STATIC) continue
      const p = b.position, v = b.velocity, w = b.angularVelocity
      // NaN guard: reset the offending body instead of infecting the solver.
      if (!vecOk(p) || !vecOk(v) || !vecOk(w) || !finite(b.quaternion.x) || !finite(b.quaternion.w)) {
        const g = b._lastGood
        if (g) p.set(g.x, g.y, g.z)
        else p.set(0, this.floorY + 1, 0)
        v.set(0, 0, 0)
        w.set(0, 0, 0)
        b.quaternion.set(0, 0, 0, 1)
        b.force.set(0, 0, 0)
        b.torque.set(0, 0, 0)
        continue
      }
      // Velocity clamp ±80 on every axis.
      if (v.x > MAX_VEL) v.x = MAX_VEL; else if (v.x < -MAX_VEL) v.x = -MAX_VEL
      if (v.y > MAX_VEL) v.y = MAX_VEL; else if (v.y < -MAX_VEL) v.y = -MAX_VEL
      if (v.z > MAX_VEL) v.z = MAX_VEL; else if (v.z < -MAX_VEL) v.z = -MAX_VEL
      const wMax = MAX_VEL
      if (w.x > wMax) w.x = wMax; else if (w.x < -wMax) w.x = -wMax
      if (w.y > wMax) w.y = wMax; else if (w.y < -wMax) w.y = -wMax
      if (w.z > wMax) w.z = wMax; else if (w.z < -wMax) w.z = -wMax
      // Tunneling rescue: nobody clips through the floor of the economy.
      if (p.y < floorRescue) {
        p.y = this.floorY + 0.4
        if (v.y < 0) v.y = Math.abs(v.y) * 0.25
      }
      // Generous world bounds so nothing orbits off to the moon for real.
      if (p.x > 60) { p.x = 60; v.x = -Math.abs(v.x) * 0.4 }
      else if (p.x < -60) { p.x = -60; v.x = Math.abs(v.x) * 0.4 }
      if (p.z > 40) { p.z = 40; v.z = -Math.abs(v.z) * 0.4 }
      else if (p.z < -40) { p.z = -40; v.z = Math.abs(v.z) * 0.4 }
      if (p.y > 120) { p.y = 120; v.y = Math.min(v.y, 0) }
      if (!b._lastGood) b._lastGood = { x: p.x, y: p.y, z: p.z }
      else { b._lastGood.x = p.x; b._lastGood.y = p.y; b._lastGood.z = p.z }
    }
  }

  _syncHandle(h) {
    if (!h.alive) return
    const b = h.body
    const mesh = h.mesh
    // World-space transform of the mesh pivot.
    _q1.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
    _v3.set(b.position.x, b.position.y, b.position.z)
    if (h._pivotOffset) _v3.add(_v3b.copy(h._pivotOffset).applyQuaternion(_q1))
    const parent = mesh.parent
    if (parent) {
      parent.updateWorldMatrix(true, false)
      _m4.copy(parent.matrixWorld).invert()
      mesh.position.copy(_v3).applyMatrix4(_m4)
      parent.getWorldQuaternion(_q2)
      mesh.quaternion.copy(_q2.invert().multiply(_q1))
    } else {
      mesh.position.copy(_v3)
      mesh.quaternion.copy(_q1)
    }
  }

  _updateDebris() {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]
      const age = this.time - d.born
      if (age > DEBRIS_LIFE) { this._removeProp(d); continue }
      // Sync body → mesh (debris meshes are pooled, pivot at center).
      const b = d.body
      const mesh = d.mesh
      const parent = mesh.parent
      _q1.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
      _v3.set(b.position.x, b.position.y, b.position.z)
      if (parent) {
        parent.updateWorldMatrix(true, false)
        _m4.copy(parent.matrixWorld).invert()
        mesh.position.copy(_v3).applyMatrix4(_m4)
        parent.getWorldQuaternion(_q2)
        mesh.quaternion.copy(_q2.invert().multiply(_q1))
      } else {
        mesh.position.copy(_v3)
        mesh.quaternion.copy(_q1)
      }
      // Shrink out at end of life — the exit liquidity animation.
      const fadeT = (age - (DEBRIS_LIFE - DEBRIS_FADE)) / DEBRIS_FADE
      if (fadeT > 0) {
        const s = Math.max(0.001, 1 - fadeT)
        if (!d._baseScale) d._baseScale = mesh.scale.clone()
        mesh.scale.set(d._baseScale.x * s, d._baseScale.y * s, d._baseScale.z * s)
      }
    }
  }

  dispose() {
    this._disposed = true
    try { this._offQuality?.() } catch { /* bus gone — fine */ }
    this._offQuality = null
    for (const h of [...this.props]) this._removeProp(h)
    for (const d of [...this.debris]) this._removeProp(d)
    for (const s of this.statics) this.world.removeBody(s)
    this.statics.length = 0
    for (const f of this._fragPool) f.mesh.parent?.remove(f.mesh)
    this._fragPool.length = 0
    // Drop anything a ragdoll left behind.
    for (const b of [...this.world.bodies]) this.world.removeBody(b)
  }
}
