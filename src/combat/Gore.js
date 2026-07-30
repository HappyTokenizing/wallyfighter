// GoreSystem — progressive comedy dismemberment + blood for v1.1 (CONTRACTS §15).
//
// Damage accumulates per fighter; hp-fraction thresholds each fire ONCE per
// round: <=70% an accessory pops off (hat/glasses/tie/... becomes a physics
// prop), <=50% a secondary part tears (ear/tail/trunk), <=25% a forearm+hand
// detaches (meshes hidden, dark stump cap at the elbow, prop bleeds briefly).
// Parts NEVER detach from hips/torso/head/upper-arms/legs — fighters stay
// playable; a fighter with no candidate at a threshold skips it gracefully.
//
// Blood rides the pooled ParticleSystem ('blood' / 'blood_spray' /
// 'blood_fountain'); floor splatter is a pool of flat dark-red quads that fade
// after ~10s ('max': 25s). Everything restores on onRoundReset().
//
// settings.gore is read LIVE every call: 'none' = zero blood, zero decals,
// zero detachments (the particle pool independently converts any stray blood
// request to sparks); 'cartoon' (default) = the above; 'max' = bigger bursts,
// lingering decals, one extra limb on KO, and the detached hand pops a
// thumbs-up moment. Still a low-poly COMEDY: blood is chunky retro cubes.
//
// Ragdoll safety: RagdollManager builds bodies from bone boxes at match start
// and never consults mesh visibility afterwards, so hidden bones keep
// ragdolling correctly (verified headless); detached-part props are plain
// physics.addProp bodies, culled/capped by PhysicsManager like any debris.
import * as THREE from 'three'

// Candidate bones per threshold, in the order we prefer to rip them.
// Named extras seen across the roster: hat, goggles, lens, mug, phones, tie,
// sash, pack, coat, robe, earL/R, tail, trunk(2,3), tongue, eyeL/R.
const ACCESSORY_BONES = ['glasses', 'goggles', 'lens', 'hat', 'mug', 'phones', 'tie', 'sash', 'pack', 'pouch', 'monocle', 'coat', 'robe']
const SECONDARY_BONES = ['earL', 'earR', 'tail', 'trunk', 'tongue']
const FOREARM_BONES = ['forearmR', 'forearmL']
// Never detach: hips, torso, head, armL/R, legL/R, shinL/R (locomotion + core).

const THRESHOLDS = [
  { key: 'accessory', frac: 0.70 },
  { key: 'secondary', frac: 0.50 },
  { key: 'forearm', frac: 0.25 },
]

const HAND_CAPTIONS = ['DIAMOND HANDS... GONE', 'PAPER HANDS NOW', 'HODL? CAN\'T. NO HAND.']

const DECAL_TTL = 10
const DECAL_TTL_MAX = 25
const _v1 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

export class GoreSystem {
  constructor(match) {
    this.match = match
    this.game = match?.game || null
    this.scene = match?.scene || null
    this.physics = match?.physics || null
    this.particles = match?.particles || null
    this._disposed = false
    // per-fighter gore state: fired thresholds, hidden bones, stumps, part props
    this._recs = new Map()
    // make sure the particle pool reads settings.gore live (idempotent)
    try { this.particles?.attachGame?.(this.game) } catch { /* pool optional */ }

    // ---- floor splatter decal pool (flat quads, oldest-recycled, hard cap) --
    const scale = this.game?.quality?.particleScale ?? match?.game?.quality?.particleScale ?? 1
    const count = Math.min(24, Math.max(8, Math.round(24 * scale)))
    this._decalGeo = new THREE.PlaneGeometry(1, 1)
    this._decals = []
    this._decalCursor = 0
    const floorY = match?.arena?.floorY ?? 0
    const tones = [0x6e1019, 0x5c0d15, 0x7d1420]
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: tones[i % tones.length], transparent: true, opacity: 0,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(this._decalGeo, mat)
      mesh.rotation.set(-Math.PI / 2, 0, 0)
      // tiny per-slot y stagger kills z-fighting between overlapping splats
      mesh.position.y = floorY + 0.015 + i * 0.0006
      mesh.renderOrder = 1
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.userData.d = { active: false, life: 0, ttl: DECAL_TTL, baseOpacity: 0.8 }
      if (this.scene) this.scene.add(mesh)
      this._decals.push(mesh)
    }
  }

  // ------------------------------------------------------------------ state

  _mode() {
    const g = this.game?.save?.get?.('settings.gore', 'cartoon')
    return g === 'none' || g === 'max' ? g : 'cartoon'
  }

  _rec(fighter) {
    let r = this._recs.get(fighter)
    if (!r) {
      r = { fighter, fired: new Set(), hidden: [], stumps: [], props: [] }
      this._recs.set(fighter, r)
    }
    return r
  }

  /** Single-owner visibility bookkeeping (shared with ragdoll/replay via the
   *  fighter): every bone THIS system hides is registered on
   *  `fighter.visibilityLedger` (bone -> 'gore') so other systems — and the
   *  headless harnesses — can tell "hidden on purpose" from "lost". */
  _ledger(fighter) {
    if (!fighter.visibilityLedger) fighter.visibilityLedger = new Map()
    return fighter.visibilityLedger
  }

  _chestPos(fighter) {
    const h = fighter?.def?.height || 1.8
    return { x: fighter?.pos?.x || 0, y: (fighter?.pos?.y || 0) + h * 0.6, z: fighter?.pos?.z || 0 }
  }

  _burst(name, pos, opts) {
    try { this.particles?.burst?.(name, pos, opts) } catch { /* pool optional */ }
  }

  // --------------------------------------------------------------- onDamage

  /** Called by MatchScreen on every landed hit.
   *  info: { attacker, damage, pos, dir, hp? } — hp, when present, is the
   *  POST-hit value (MatchScreen calls in before applying the subtraction, so
   *  reading fighter.hp here would evaluate thresholds one hit late). */
  onDamage(fighter, info = {}) {
    if (this._disposed || !fighter) return
    const mode = this._mode()
    const damage = Number.isFinite(info.damage) ? info.damage : 5
    const pos = info.pos || this._chestPos(fighter)
    const dirX = typeof info.dir === 'number' ? Math.sign(info.dir)
      : Math.sign(info.dir?.x ?? (info.attacker ? Math.sign((fighter.pos?.x ?? 0) - (info.attacker.pos?.x ?? 0)) : 0)) || 1

    if (mode === 'none') {
      // sparks only — zero blood, zero decals, zero parts
      this._burst('sparks', pos, { dirX, n: Math.min(14, 5 + Math.round(damage * 0.5)) })
      return
    }

    // blood on every hit, scaled by damage
    this._burst('blood', pos, { dirX, n: Math.min(24, 4 + Math.round(damage)) })
    if (damage >= 12) this._burst('blood_spray', pos, { dir: { x: dirX, y: 0.5, z: 0 } })

    // floor splatter under the impact (v2.0 free-roam: true z, not lane-halved)
    if (damage >= 3) {
      this._splat(pos.x + (Math.random() - 0.5) * 0.5, (pos.z || 0) + (Math.random() - 0.5) * 0.5,
        0.32 + damage * 0.04 + Math.random() * 0.15, mode)
    }

    // progressive dismemberment thresholds (each fires once per round) —
    // evaluated on the post-hit hp so the payoff lands on the crossing hit
    const hpNow = Number.isFinite(info.hp) ? info.hp : (fighter.hp ?? 100)
    const frac = hpNow / (fighter.maxHp || 100)
    const rec = this._rec(fighter)
    for (const t of THRESHOLDS) {
      if (frac > t.frac || rec.fired.has(t.key)) continue
      rec.fired.add(t.key) // even a candidate-less fighter consumes the slot (graceful skip)
      if (t.key === 'accessory') this._popAccessory(fighter, rec, dirX, mode)
      else if (t.key === 'secondary') this._tearSecondary(fighter, rec, dirX, mode)
      else this._detachForearm(fighter, rec, dirX, mode)
    }
  }

  // -------------------------------------------------------------------- KO

  onKO(fighter) {
    if (this._disposed || !fighter) return
    const mode = this._mode()
    if (mode === 'none') {
      this._burst('sparks', this._chestPos(fighter), { n: 12 })
      return
    }
    const pos = this._chestPos(fighter)
    const kz = fighter.pos?.z || 0 // v2.0 free-roam: KO pools form under the body
    this._burst('blood_fountain', pos)
    this._splat(fighter.pos?.x || 0, kz, 1.1 + Math.random() * 0.4, mode)
    this._splat((fighter.pos?.x || 0) + (Math.random() - 0.5), kz + (Math.random() - 0.5) * 0.8, 0.6, mode)
    if (mode === 'max') {
      // MAX only: the KO shakes one more limb loose
      const rec = this._rec(fighter)
      if (!rec.fired.has('koExtra')) {
        rec.fired.add('koExtra')
        this._detachForearm(fighter, rec, Math.random() < 0.5 ? 1 : -1, mode, true) ||
          this._tearSecondary(fighter, rec, 1, mode) ||
          this._popAccessory(fighter, rec, 1, mode)
      }
    }
  }

  // -------------------------------------------------- detachment internals

  _firstCandidate(fighter, names) {
    const present = names.filter((n) => {
      const b = fighter.bones?.[n]
      return b && b.isObject3D && b.visible
    })
    if (!present.length) return null
    return present[Math.floor(Math.random() * present.length)]
  }

  _popAccessory(fighter, rec, dirX, mode) {
    const name = this._firstCandidate(fighter, ACCESSORY_BONES)
    if (!name) return false
    const world = this._detach(fighter, rec, name, { mass: 0.35, dirX, popY: 4.5, bleed: 0.4 })
    if (!world) return false
    this._burst('blood', world, { n: mode === 'max' ? 8 : 5, dirX })
    try { this.game?.audio?.sfx?.('break', { pitch: 1.35, vol: 0.6 }) } catch { /* audio optional */ }
    return true
  }

  _tearSecondary(fighter, rec, dirX, mode) {
    const name = this._firstCandidate(fighter, SECONDARY_BONES)
    if (!name) return false
    const world = this._detach(fighter, rec, name, { mass: 0.5, dirX, popY: 5, bleed: 1.2 })
    if (!world) return false
    this._burst('blood', world, { n: mode === 'max' ? 14 : 9, dirX })
    this._burst('blood_spray', world, { dir: { x: dirX, y: 0.7, z: 0 } })
    this._splat(world.x, world.z || 0, 0.45, mode)
    try { this.game?.audio?.sfx?.('break', { pitch: 0.9 }) } catch { /* audio optional */ }
    return true
  }

  _detachForearm(fighter, rec, dirX, mode, silent = false) {
    const name = this._firstCandidate(fighter, FOREARM_BONES)
    if (!name) return false
    const bone = fighter.bones[name]
    const parent = bone.parent // the upper-arm pivot — stump lives here
    const world = this._detach(fighter, rec, name, {
      mass: 0.6, dirX, popY: mode === 'max' ? 6.5 : 5, bleed: mode === 'max' ? 2.2 : 1.5,
      thumbsUp: mode === 'max',
    })
    if (!world) return false
    // dark stump cap at the elbow so the arm doesn't just end in nothing
    if (parent) {
      const stump = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, 0.16),
        new THREE.MeshLambertMaterial({ color: 0x4a0c12, flatShading: true })
      )
      stump.position.copy(bone.position)
      parent.add(stump)
      rec.stumps.push({ parent, mesh: stump })
    }
    this._burst('blood_spray', world, { dir: { x: dirX, y: 0.8, z: 0 } })
    this._burst('blood', world, { n: mode === 'max' ? 16 : 10, dirX })
    this._splat(world.x, world.z || 0, 0.5, mode)
    try { this.game?.audio?.sfx?.('break', { pitch: 0.7 }) } catch { /* audio optional */ }
    if (!silent) {
      const line = HAND_CAPTIONS[Math.floor(Math.random() * HAND_CAPTIONS.length)]
      try { this.match?.cap?.(line) } catch { this.game?.events?.emit?.('caption', { text: line }) }
      if (mode === 'max') { try { this.match?.cap?.('STILL BULLISH.') } catch { /* caption optional */ } }
    }
    return true
  }

  /**
   * Hide a bone's mesh subtree and spawn a matching physics prop clone with
   * inherited velocity. Returns the detach world position, or null.
   * The clone SHARES geometry/materials with the fighter — cleanup must never
   * dispose them (Fighter.dispose owns that).
   */
  _detach(fighter, rec, name, opts = {}) {
    const bone = fighter.bones?.[name]
    if (!bone || !bone.visible) return null
    try { bone.updateWorldMatrix?.(true, true) } catch { /* detached test rigs */ }
    bone.getWorldPosition(_v1)
    bone.getWorldQuaternion(_q1)

    const clone = bone.clone(true)
    clone.position.set(0, 0, 0)
    clone.quaternion.identity()
    clone.scale.set(1, 1, 1)
    clone.visible = true
    if (opts.thumbsUp) {
      // MAX flourish: the severed hand flips a thumbs-up nub on its way out
      const thumb = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.16, 0.07),
        new THREE.MeshLambertMaterial({ color: 0xffcf3f, flatShading: true })
      )
      thumb.position.set(0.06, 0.1, 0)
      thumb.userData.goreOwned = true // our geometry/material — disposed on reset
      clone.add(thumb)
    }
    const wrap = new THREE.Group()
    wrap.position.copy(_v1)
    wrap.quaternion.copy(_q1)
    wrap.add(clone)
    this.scene?.add(wrap)

    // inherited velocity: fighter momentum + a comedic outward pop
    const dirX = opts.dirX || 1
    const vel = {
      x: (fighter.vel?.x || 0) * 0.6 + dirX * (2.5 + Math.random() * 2),
      y: (opts.popY ?? 4.5) + Math.random() * 2,
      z: (Math.random() - 0.5) * 1.5,
    }
    let handle = null
    try {
      handle = this.physics?.addProp?.(wrap, { shape: 'box', mass: opts.mass ?? 0.5, kind: 'gorePart', velocity: vel })
      if (handle?.body) {
        handle.body.angularVelocity.set(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          opts.thumbsUp ? 2 : (Math.random() - 0.5) * 10
        )
      }
    } catch { /* physics optional in headless harness */ }

    bone.visible = false
    rec.hidden.push(bone)
    this._ledger(fighter).set(bone, 'gore')
    rec.props.push({ handle, mesh: wrap, bleed: opts.bleed ?? 1, dripT: 0 })
    return { x: _v1.x, y: _v1.y, z: _v1.z }
  }

  // ----------------------------------------------------------------- decals

  _splat(x, z, size, mode) {
    if (!this._decals.length) return
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(size)) return
    this._decalCursor = (this._decalCursor + 1) % this._decals.length
    const m = this._decals[this._decalCursor]
    const d = m.userData.d
    d.active = true
    d.life = 0
    d.ttl = mode === 'max' ? DECAL_TTL_MAX : DECAL_TTL
    d.baseOpacity = mode === 'max' ? 0.9 : 0.8
    m.position.x = x
    m.position.z = z
    m.rotation.z = Math.random() * Math.PI * 2
    const s = size * (mode === 'max' ? 1.3 : 1)
    m.scale.set(s * (0.8 + Math.random() * 0.5), s * (0.8 + Math.random() * 0.5), 1)
    m.material.opacity = d.baseOpacity
    m.visible = true
  }

  _clearDecals() {
    for (const m of this._decals) {
      m.userData.d.active = false
      m.visible = false
      m.material.opacity = 0
    }
  }

  // ----------------------------------------------------------------- update

  update(dt) {
    if (this._disposed) return
    if (!(dt > 0)) dt = 1 / 60
    const mode = this._mode()
    if (mode === 'none') {
      // live switch to 'none' scrubs the crime scene immediately: decals AND
      // already-detached parts/stumps (v1.1.2 — parts used to linger until the
      // next round reset). rec.fired stays intact so thresholds don't re-fire
      // if the user flips back mid-round.
      let any = false
      for (const m of this._decals) if (m.userData.d.active) { any = true; break }
      if (any) this._clearDecals()
      for (const rec of this._recs.values()) {
        if (rec.hidden.length || rec.stumps.length || rec.props.length) this._restoreParts(rec)
      }
    } else {
      for (const m of this._decals) {
        const d = m.userData.d
        if (!d.active) continue
        d.life += dt
        if (d.life >= d.ttl) { d.active = false; m.visible = false; m.material.opacity = 0; continue }
        const r = d.life / d.ttl
        m.material.opacity = d.baseOpacity * (r > 0.6 ? Math.max(0, 1 - (r - 0.6) / 0.4) : 1)
      }
    }
    // detached parts bleed briefly (dripping)
    for (const rec of this._recs.values()) {
      for (const p of rec.props) {
        if (p.bleed <= 0 || mode === 'none') continue
        p.bleed -= dt
        p.dripT += dt
        if (p.dripT >= 0.16 && p.mesh?.parent) {
          p.dripT = 0
          this._burst('blood', { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z }, { n: 3 })
        }
      }
    }
  }

  // ------------------------------------------------------------- restore

  /** Restore one fighter record's parts: hidden bones visible, stumps and
   *  part-props removed. Does NOT touch rec.fired — callers decide whether
   *  thresholds re-arm (round reset) or stay consumed (live 'none' scrub). */
  _restoreParts(rec) {
    const ledger = rec.fighter?.visibilityLedger
    for (const bone of rec.hidden) {
      bone.visible = true
      if (ledger?.get(bone) === 'gore') ledger.delete(bone)
    }
    rec.hidden.length = 0
    for (const s of rec.stumps) {
      try { s.parent?.remove?.(s.mesh) } catch { /* already gone */ }
      s.mesh.geometry?.dispose?.()
      s.mesh.material?.dispose?.()
    }
    rec.stumps.length = 0
    for (const p of rec.props) {
      try { p.handle?.remove?.() } catch { /* physics may have culled it */ }
      try { p.mesh?.parent?.remove?.(p.mesh) } catch { /* already gone */ }
      // Cloned part geometry/materials are SHARED with the fighter — never
      // disposed here. Only meshes we authored (thumbs-up nub) are ours.
      p.mesh?.traverse?.((o) => {
        if (o.isMesh && o.userData.goreOwned) { o.geometry?.dispose?.(); o.material?.dispose?.() }
      })
    }
    rec.props.length = 0
  }

  /** Restore EVERY hidden mesh, remove stumps/part-props/decals, re-arm thresholds. */
  onRoundReset() {
    for (const rec of this._recs.values()) {
      this._restoreParts(rec)
      rec.fired.clear()
    }
    this._clearDecals()
  }

  // -------------------------------------------------------------- dispose

  dispose() {
    if (this._disposed) return
    this.onRoundReset()
    this._disposed = true
    for (const m of this._decals) {
      try { this.scene?.remove?.(m) } catch { /* scene gone */ }
      m.material?.dispose?.()
    }
    this._decals.length = 0
    this._decalGeo?.dispose?.()
    this._recs.clear()
  }
}
