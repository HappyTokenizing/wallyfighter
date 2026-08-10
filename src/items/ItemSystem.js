// ItemSystem — v2.1 item delivery (CONTRACTS.md §25, supersedes §14 random
// spawn-ins; caps / pickup / use flow / events unchanged from §14).
//
//   new ItemSystem({ game, scene, physics, arena, arenaId, fighters, events, fx? })
//   items.update(dt)          // delivery cadence, despawns, held-item logic (fixed 60 Hz)
//   items.tryPickup(fighter)  // manual hook; walk-over pickup is automatic
//   items.use(fighter)        // consume held item, run its effect
//   items.held(slot)          // -> itemDef | null
//   items.dispose()
//
// DELIVERY (v2.1): no random spawn-ins.
//  1) AUTHORED PLACEMENTS — every arena has 2 fixed item spots (authored
//     per-arena below); both are populated at round start from the arena's
//     tier roster via a persistent rotation cursor (cycle, not pure random).
//  2) AUDIENCE THROWS — every 20-30 s while fewer than 2 items are down, an
//     item is hurled in from a stand-side origin just outside the bounds
//     (crowd height ~2.5): ~1.2 s spinning parabolic arc, landing-spot
//     telegraph ring + tracking blob shadow from launch, whoosh at launch,
//     thud on landing. Emits 'item:thrown' {kind, from, to} at launch so the
//     crowd renderer can wind up a nearby instance (contract only — degrades
//     fine when unconsumed).
//  HEART DROPS — on 'physics:break', 30% chance (>=12 s cooldown, max 1 live)
//     a glowing heart ejects from the break point with a big horizontal
//     impulse, skitters/bounces 5-9 m (wall-reflected, always in bounds),
//     then sits pulsing. First fighter (either slot, AI included) below max
//     HP to walk over it heals +12. Never despawns before 20 s; blinks after
//     30 s. Hearts are instant pickups — they never occupy a hand and don't
//     count against the 2-ground cap.
//
// Rules kept: max 2 items on the ground, max 1 held per fighter, ground items
// despawn after ~15 s (blink warning first), walk-over auto-pickup, bob+spin+
// ground-ring visuals. Events: 'item:spawned' {kind,pos}, 'item:pickup'
// {slot,kind}, 'item:used' {slot,kind}, 'item:despawn' {kind}, plus
// 'item:thrown' {kind,from,to}.
//
// All match plumbing (props/particles/captions/slowmo) is reached through the
// match handle hanging off the fighters — never imported — so the system runs
// headless against stubs and never couples to combat internals. Every effect is
// restore-safe: timed reverts are ALSO registered as cleanups with a once-guard,
// and cleanups are flushed on round end, finisher start, match end and dispose.
import * as THREE from 'three'
import { rosterForArena, itemDefByKind } from './roster.js'

const DROP_FRAMES = 40        // telegraphed fall duration (authored placements)
const DROP_HEIGHT = 8
const DESPAWN_FRAMES = 15 * 60
const BLINK_FRAMES = 3 * 60   // blink warning window before despawn
const PICKUP_RADIUS = 0.85
const EFFECT_MAX_AGE = 900    // absolute safety net per effect
const PICK_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'jump'])
const USE_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'jump', 'block'])

// audience throws (§25)
const THROW_FRAMES = 72       // ~1.2 s flight
const THROW_ARC = 3.1         // extra parabolic apex height (m)
const THROW_ORIGIN_Y = 2.5    // crowd/stand height
const THROW_ORIGIN_OUT = 1.5  // how far outside the bounds the origin sits

// heart drops (§25)
const HEART_HEAL = 12
const HEART_CHANCE = 0.3
const HEART_CD_FRAMES = 12 * 60
const HEART_MIN_LIFE = 20 * 60   // untouchable-by-despawn window
const HEART_BLINK_AT = 30 * 60   // starts blinking
const HEART_GONE_AT = 33 * 60    // removed
const HEART_RADIUS = 0.9
const HEART_GRAV = -22
const HEART_REST_Y = 0.42        // hover height while sitting
// AI starts chasing a heart below this hp fraction ("hurt")
const HEART_CHASE_HP = 0.85

const RING_GEO = new THREE.RingGeometry(0.42, 0.58, 20)
const RING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffcf3f, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
})
const SHADOW_GEO = new THREE.CircleGeometry(0.32, 12)
const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false,
})

// ------------------------------------------------------- authored placements
// §25.1: two fixed item spots per arena, authored against each arena's real
// bounds (all are x ±9; z ±5.5 except settlement-express z ±3.2 — a train
// roof, keep z tight — and bull-market-colosseum z ±7 — a wide bowl, spread
// out). Off-center on purpose: items should pull fighters around the floor,
// not decorate the spawn line. Coordinates stay >=1.2 m inside the walls.
export const ARENA_ITEM_SPOTS = {
  'meme-market':                 [{ x: -5.5, z: 3.2 },  { x: 5.5, z: -3.2 }],
  'liquidity-swamp':             [{ x: -6.0, z: -3.0 }, { x: 4.8, z: 3.4 }],
  'frozen-token-lab':            [{ x: -4.8, z: 3.4 },  { x: 6.0, z: -3.0 }],
  'settlement-express':          [{ x: -6.0, z: 1.5 },  { x: 6.0, z: -1.5 }], // narrow z
  'mountain-node-village':       [{ x: -5.5, z: -3.2 }, { x: 4.6, z: 3.4 }],
  'lost-block-museum':           [{ x: -6.0, z: 3.0 },  { x: 5.5, z: -3.4 }],
  'institutional-capital-tower': [{ x: -4.6, z: -3.4 }, { x: 6.0, z: 3.0 }],
  'calm-before-liquidation':     [{ x: -5.6, z: 3.3 },  { x: 5.6, z: -3.3 }],
  'bull-market-colosseum':       [{ x: -6.2, z: 4.6 },  { x: 6.2, z: -4.6 }], // wide bowl
  'permanent-reserve-core':      [{ x: -5.4, z: -3.2 }, { x: 5.2, z: 3.2 }],
}

// Spots for an arena id, clamped into the live bounds as a belt-and-braces
// guard (unknown ids get a generic off-center pair).
export function itemSpotsForArena(arenaId, bounds) {
  const raw = ARENA_ITEM_SPOTS[arenaId] || [{ x: -5.2, z: 3.0 }, { x: 5.2, z: -3.0 }]
  const b = bounds || { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5 }
  const zLo = (b.minZ ?? -5.5) + 1.2, zHi = (b.maxZ ?? 5.5) - 1.2
  const xLo = b.minX + 1.2, xHi = b.maxX - 1.2
  return raw.map((s) => ({
    x: Math.max(xLo, Math.min(xHi, s.x)),
    z: Math.max(zLo, Math.min(zHi, s.z)),
  }))
}

// ------------------------------------------------------------- EffectContext
// The `ctx` handed to every ItemDef.effect. A slim cousin of SpecialContext:
// fixed-frame scheduling, guaranteed cleanup, and verbs that route through the
// match when one exists and degrade gracefully when it doesn't.
class EffectContext {
  constructor(system, self, def) {
    this.system = system
    this.game = system.game
    this.events = system.events
    this.scene = system.scene
    this.physics = system.physics
    this.arena = system.arena
    this.bounds = system.bounds
    this.floorY = system.floorY
    this.fighters = system.fighters
    this.self = self
    this.foe = self.foe || system.fighters.find((f) => f !== self) || self
    this.def = def
    // v2.0 (§17): fighter.facing is yaw RADIANS now — legacy ±1 lives in
    // facingSign. Item scripts were written against ±1, so serve that.
    this.facing = self.facingSign
      ?? (typeof self.facing === 'number' && Math.abs(self.facing) > 1.01
        ? (Math.cos(self.facing) >= 0 ? 1 : -1)
        : (self.facing || 1))
    this.dir = Math.sign((this.foe.pos?.x ?? 0) - (self.pos?.x ?? 0)) || this.facing
    // planar unit vector from self toward foe at effect start — projectiles and
    // cone checks aim along this so thrown items work off the world-X lane
    {
      const dx = (this.foe.pos?.x ?? 0) - (self.pos?.x ?? 0)
      const dz = (this.foe.pos?.z ?? 0) - (self.pos?.z ?? 0)
      const d = Math.hypot(dx, dz)
      this._aim = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: this.dir, z: 0 }
    }
    this.frameAge = 0
    this._frames = []
    this._timers = []
    this._cleanups = []
    this._meshes = new Set()
    this._ended = false
    this._finished = false
  }

  // --- scheduling (fixed 60 Hz frames) ---
  frame(cb) { if (typeof cb === 'function') this._frames.push(cb) }
  after(n, cb) { if (typeof cb === 'function') this._timers.push({ n: Math.max(1, Math.round(n) || 1), cb }) }

  // Guaranteed restore: runs after n frames OR at flush/cleanup, whichever comes
  // first, exactly once. Use for every stat/ctrl/gravity revert.
  revert(n, fn) {
    let done = false
    const run = () => { if (done) return; done = true; try { fn() } catch (e) { console.warn('[items] revert threw', e) } }
    this.after(n, run)
    this._cleanups.push(run)
  }

  cleanup(fn) { if (typeof fn === 'function') this._cleanups.push(fn) }
  end() { this._ended = true }

  // --- meshes (auto-removed at cleanup; geometry disposed, materials shared) ---
  addMesh(mesh, pos) {
    if (pos) mesh.position.set(pos.x || 0, pos.y || 0, pos.z || 0)
    this.scene?.add(mesh)
    this._meshes.add(mesh)
    return mesh
  }

  removeMesh(mesh) {
    if (!mesh || !this._meshes.has(mesh)) return
    this._meshes.delete(mesh)
    this.scene?.remove(mesh)
    mesh.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose?.() })
  }

  // --- combat verbs ---
  // Scripted hit on the foe. Routes through MatchScreen.applyScriptHit (combo
  // scaling, KO handling, events); headless fallback keeps tests honest.
  hit(spec = {}) {
    const m = this.system.match
    if (m?.applyScriptHit) { try { m.applyScriptHit(this.self, this.foe, spec); return } catch (e) { console.warn('[items] applyScriptHit threw', e) } }
    const foe = this.foe
    const dmg = Math.max(0, Math.round(spec.damage || 0))
    if (dmg > 0) {
      foe.setHp?.(Math.max(1, (foe.hp ?? 1) - dmg)) // fallback never KOs — no match to referee it
      this.events?.emit?.('fighter:hit', { slot: foe.slot, damage: dmg, move: 'item', counter: false, combo: 0 })
    }
    const kb = spec.knockback || {}
    if (foe.state === 'ragdoll') return // §17 ownership: never state-flip a full-ragdolled fighter
    if ((kb.y ?? 0) > 3) foe.enterLaunched?.((kb.x ?? 4) * this.facing, kb.y, kb.spin ?? 1)
    else if (spec.hitStun) foe.enterHitstun?.(spec.hitStun, dmg >= 10, (kb.x ?? 2) * this.facing * 0.5)
  }

  // Direct chip damage on any fighter (self-damage gags). Floors at 1 hp — an
  // item may never deliver the KO outside the referee'd hit path.
  hurt(f, dmg) {
    f.setHp?.(Math.max(1, (f.hp ?? 1) - Math.max(0, Math.round(dmg))))
    f.flash?.()
    this.events?.emit?.('fighter:hit', { slot: f.slot, damage: Math.round(dmg), move: 'item', counter: false, combo: 0 })
  }

  heal(f, n) {
    f.setHp?.(Math.min(f.maxHp ?? 100, (f.hp ?? 0) + n))
    this.burst('stars', { x: f.pos.x, y: f.pos.y + 1.4, z: 0 }, { n: 5 })
  }

  // §17 ownership (v2.0 P0): route through MatchScreen's single-owner helpers
  // so a full-ragdolled fighter is shoved (additive impulse), never
  // state-flipped out from under the ragdoll driver. Headless fallback keeps
  // the same guard inline.
  launch(f, vx, vy, spin = 1) {
    const m = this.system.match
    if (m?.launchFighter) { try { m.launchFighter(f, vx, vy, spin); return } catch { /* fall through */ } }
    if (f.state !== 'ragdoll') f.enterLaunched?.(vx, vy, spin)
  }

  hitstun(f, frames, heavy = false) {
    const m = this.system.match
    if (m?.stunFighter) { try { m.stunFighter(f, frames, heavy, 0); return } catch { /* fall through */ } }
    if (f.state !== 'ragdoll') f.enterHitstun?.(frames, heavy, 0)
  }

  ragdoll(f, impulse, spin = 1.5) {
    const m = this.system.match
    if (m?.forceRagdoll) { try { m.forceRagdoll(f, impulse, spin); return } catch { /* fall through */ } }
    if (f.state !== 'ragdoll') f.enterLaunched?.(impulse?.[0] ?? 0, impulse?.[1] ?? 6, spin)
  }

  // --- presentation ---
  caption(text) {
    const m = this.system.match
    if (m?.cap) { try { m.cap(text); return } catch { /* fall through */ } }
    this.events?.emit?.('caption', { text })
  }

  shake(mag = 0.5) { this.events?.emit?.('camera:shake', { mag }) }

  slowmo(scale, seconds) {
    const m = this.system.match
    if (m?.setSlowmo) { try { m.setSlowmo(scale, seconds); return } catch { /* fall through */ } }
    this.events?.emit?.('slowmo', { scale, seconds })
  }

  sfx(name, opts) { try { this.game?.audio?.sfx?.(name, opts) } catch { /* headless */ } }
  burst(name, pos, opts) { try { this.system.match?.particles?.burst?.(name, pos, opts) } catch { /* headless */ } }
  prop(kind, pos, opts) { try { return this.system.match?.props?.spawn?.(kind, pos, opts) ?? null } catch { return null } }

  // --- spatial helpers ---
  clampX(x) { return Math.max(this.bounds.minX + 0.8, Math.min(this.bounds.maxX - 0.8, x)) }
  selfChest() { return { x: this.self.pos.x, y: this.self.pos.y + 1.2, z: this.self.pos.z ?? 0 } }
  foeChest() { return { x: this.foe.pos.x, y: this.foe.pos.y + 1.2, z: this.foe.pos.z ?? 0 } }
  // §17: proximity is PLANAR (XZ) — an x-only check would land hits on a foe
  // standing far away in z
  foeNear(range) {
    const dx = this.foe.pos.x - this.self.pos.x
    const dz = (this.foe.pos.z ?? 0) - (this.self.pos.z ?? 0)
    return Math.hypot(dx, dz) <= range && !this.foe.isInvulnerable?.()
  }
  foeInFront(range) {
    const dx = this.foe.pos.x - this.self.pos.x
    const dz = (this.foe.pos.z ?? 0) - (this.self.pos.z ?? 0)
    // project on the attacker's facing when the fighter exposes it (v2 Fighter),
    // else fall back to the legacy x-lane test
    let along, perp
    if (typeof this.self.dirX === 'function') {
      const fx = this.self.dirX(), fz = this.self.dirZ?.() ?? 0
      along = dx * fx + dz * fz
      perp = Math.abs(dz * fx - dx * fz)
    } else {
      along = dx * this.facing
      perp = Math.abs(dz)
    }
    return along > -0.4 && along <= range && perp < 1.3 && this.foe.pos.y < 2.4 && !this.foe.isInvulnerable?.()
  }

  // --- projectiles ---
  // { mesh, x?, y, vx, vy?, grav?, spin?, radius?, ttl?, keepMesh?, update?,
  //   onHit(f)?, onLand(x)?, onExpire(x, y)? }
  // Handlers returning truthy keep the mesh alive (it stays registered with the
  // effect either way, so cleanup still sweeps it).
  projectile(cfg) {
    const mesh = cfg.mesh
    // §17 free-roam: cfg.vx is the item defs' legacy "ctx.dir * speed" world-X
    // velocity. Recover the signed along-track speed (positive = toward the
    // foe) and fly along the launch aim vector so throws work off the X lane.
    const aim = this._aim
    const along = (cfg.vx ?? this.dir * 10) * this.dir
    const p = {
      x: cfg.x ?? this.self.pos.x + aim.x * 0.7,
      z: cfg.z ?? (this.self.pos.z ?? 0) + aim.z * 0.7,
      y: cfg.y ?? 1.2,
      vx: along * aim.x,
      vz: along * aim.z,
      vy: cfg.vy ?? 0,
      grav: cfg.grav ?? 0,
      spin: cfg.spin ?? 8,
      radius: cfg.radius ?? 0.8,
      ttl: cfg.ttl ?? 240,
      age: 0,
      done: false,
    }
    mesh.position.set(p.x, p.y, p.z)
    mesh.rotation.y = Math.atan2(-aim.z, aim.x) // face the flight direction
    this.addMesh(mesh)
    const stop = (keep) => { p.done = true; if (!keep && !cfg.keepMesh) this.removeMesh(mesh) }
    this.frame(() => {
      if (p.done) return
      p.age++
      const dt = 1 / 60
      p.vy += p.grav * dt
      p.x += p.vx * dt
      p.z += p.vz * dt
      p.y += p.vy * dt
      mesh.position.set(p.x, p.y, p.z)
      mesh.rotation.z -= p.spin * dt * Math.sign(along || 1)
      cfg.update?.(mesh)
      // foe contact — planar (§17)
      const foe = this.foe
      if (!foe.isInvulnerable?.() &&
        Math.hypot(p.x - foe.pos.x, p.z - (foe.pos.z ?? 0)) < p.radius + 0.45 &&
        p.y > foe.pos.y - 0.2 && p.y < foe.pos.y + (foe.def?.height ?? 1.8) + 0.3) {
        stop(cfg.onHit?.(foe))
        return
      }
      // floor
      if (p.grav !== 0 && p.y <= this.floorY + 0.18 && p.vy < 0) {
        stop(cfg.onLand ? cfg.onLand(p.x, p.z) : cfg.onExpire?.(p.x, this.floorY, p.z))
        return
      }
      // walls / lifetime (4-sided, §17)
      const b = this.bounds
      const zLo = (b.minZ ?? -5.5), zHi = (b.maxZ ?? 5.5)
      if (p.x < b.minX - 0.5 || p.x > b.maxX + 0.5 || p.z < zLo - 0.5 || p.z > zHi + 0.5 || p.age > p.ttl) {
        stop(cfg.onExpire?.(Math.max(b.minX, Math.min(b.maxX, p.x)), p.y, Math.max(zLo, Math.min(zHi, p.z))))
      }
    })
    return { stop: () => stop(false) }
  }

  // --- lifecycle (driven by ItemSystem) ---
  _step() {
    if (this._finished) return true
    this.frameAge++
    for (const t of this._timers) {
      if (t.done) continue
      if (--t.n <= 0) {
        t.done = true
        try { t.cb() } catch (e) { console.error('[items] effect timer threw', e) }
      }
    }
    this._timers = this._timers.filter((t) => !t.done)
    if (!this._ended) {
      for (const cb of [...this._frames]) {
        try { cb() } catch (e) { console.error('[items] effect frame threw', e); this._ended = true }
        if (this._ended) break
      }
    }
    if (this.frameAge > EFFECT_MAX_AGE) this._ended = true
    if (this._ended) this._frames.length = 0
    if (this._frames.length === 0 && this._timers.length === 0) {
      this._finish()
      return true
    }
    return false
  }

  _finish() {
    if (this._finished) return
    this._finished = true
    this._ended = true
    this._frames.length = 0
    this._timers.length = 0
    for (const fn of this._cleanups.splice(0)) {
      try { fn() } catch (e) { console.error('[items] effect cleanup threw', e) }
    }
    for (const mesh of [...this._meshes]) this.removeMesh(mesh)
  }

  // Run pending cleanups NOW (round reset / finisher / dispose).
  flush() { this._finish() }
}

// ---------------------------------------------------------------- ItemSystem
export class ItemSystem {
  constructor({ game, scene, physics, arena, arenaId, fighters, events, fx, match } = {}) {
    this.game = game
    this.scene = scene
    this.physics = physics
    this.arena = arena
    this.arenaId = arenaId || arena?.id || 'meme-market'
    this.fighters = fighters || []
    this.events = events || game?.events
    // Match handle (props/particles/captions/slowmo/hit referee) — reached via
    // the fighters or the fx context, never imported.
    this.match = match || fx?.match || this.fighters[0]?.match || null
    this.bounds = arena?.bounds || this.match?.bounds || { minX: -9, maxX: 9, wallBounce: 0.55 }
    this.floorY = arena?.floorY ?? 0
    this.roster = rosterForArena(this.arenaId)

    this.groundItems = []                 // { def, mesh, ring, x, z, age, state:'drop'|'ground', baseY }
    this.heldBySlot = [null, null]        // { def, mesh, bone }
    this.effects = []
    this._pool = new Map()                // kind -> mesh[]
    this._rings = []
    this._shadows = []
    this._throws = []                     // in-flight audience throws
    this._throwT = this._rollThrowDelay()
    this._throwSide = (Math.random() * 4) | 0
    this._rosterCursor = 0                // §25 rotation — persists across rounds
    this._heart = null                    // max 1 live heart
    this._heartCd = 0
    this._disposed = false
    this._offs = []

    const on = (name, fn) => { const off = this.events?.on?.(name, fn); if (off) this._offs.push(off) }
    on('round:end', () => this._flushEffects())
    on('finisher:start', () => this._flushEffects())
    on('match:end', () => { this._flushEffects(); this._clearGround(); this._clearThrows(); this._removeHeart() })
    on('round:start', () => {
      this._flushEffects()
      this._clearGround()
      this._clearThrows()
      this._removeHeart()
      this._placeAuthored()               // §25.1: both authored spots refill
      this._throwT = this._rollThrowDelay()
    })
    on('physics:break', (e) => this._onBreak(e))

    // Populate immediately too — headless harnesses (and any flow that builds
    // the system after 'round:start' already fired) still get their items.
    // A real 'round:start' clears and re-places, so this never doubles up.
    this._placeAuthored()
  }

  _rollThrowDelay() { return Math.round((20 + Math.random() * 10) * 60) }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (this._disposed) return

    // §25.2 audience-throw cadence: every 20-30 s while fewer than 2 items are
    // down (in-flight throws count so the cap can't be overshot mid-arc)
    if (--this._throwT <= 0) {
      const room = this.groundItems.length + this._throws.length < 2
      this._throwT = room && this._throwOne() ? this._rollThrowDelay() : 240 // crowded — retry in 4 s
    }

    this._updateThrows(dt)
    this._updateHeart(dt)

    // ground item lifecycle
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const g = this.groundItems[i]
      g.age++
      if (g.state === 'drop') {
        const t = Math.min(1, g.age / DROP_FRAMES)
        g.mesh.position.y = g.baseY + DROP_HEIGHT * (1 - t) * (1 - t)
        g.mesh.rotation.y += dt * 6
        const pulse = 1 + Math.sin(g.age * 0.4) * 0.15
        g.ring.scale.set(pulse, pulse, 1)
        if (t >= 1) {
          g.state = 'ground'
          g.age = 0
          try { this.match?.particles?.burst?.('dust', { x: g.x, y: this.floorY + 0.1, z: g.z ?? 0 }, { n: 6 }) } catch { /* headless */ }
          try { this.game?.audio?.sfx?.('thud', { vol: 0.4, pitch: 1.3 }) } catch { /* headless */ }
          this.events?.emit?.('item:spawned', { kind: g.def.kind, name: g.def.name, pos: { x: g.x, y: this.floorY, z: g.z ?? 0 } })
        }
        continue
      }
      // grounded: bob + spin + ring pulse
      g.mesh.position.y = g.baseY + Math.sin(g.age * 0.05) * 0.1
      g.mesh.rotation.y += dt * 1.6
      const rp = 1 + Math.sin(g.age * 0.08) * 0.08
      g.ring.scale.set(rp, rp, 1)
      // blink warning, then despawn
      const left = DESPAWN_FRAMES - g.age
      if (left <= 0) {
        this.events?.emit?.('item:despawn', { kind: g.def.kind })
        this._removeGround(i)
        continue
      }
      g.mesh.visible = left > BLINK_FRAMES || (g.age >> 3) % 2 === 0
      g.ring.visible = g.mesh.visible
      // walk-over auto-pickup — planar (§17)
      for (const f of this.fighters) {
        if (this._canPickup(f) && Math.hypot(f.pos.x - g.x, (f.pos.z ?? 0) - (g.z ?? 0)) < PICKUP_RADIUS) {
          this._pickup(f, i)
          break
        }
      }
    }

    // scripted effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i]._step()) this.effects.splice(i, 1)
    }
  }

  // ------------------------------------------------------- delivery (§25)
  // Rotation over the arena's tier roster: deterministic cycle via a cursor
  // that persists across rounds, skipping kinds already down or held.
  _nextFromRoster() {
    const n = this.roster.length
    if (!n) return null
    const taken = new Set()
    for (const g of this.groundItems) if (g?.def) taken.add(g.def.kind)
    for (const t of this._throws) if (t?.def) taken.add(t.def.kind)
    for (const h of this.heldBySlot) if (h?.def) taken.add(h.def.kind)
    for (let i = 0; i < n; i++) {
      const def = this.roster[this._rosterCursor++ % n]
      if (def && !taken.has(def.kind)) return def
    }
    return this.roster[this._rosterCursor++ % n] || null
  }

  // §25.1: populate both authored spots (telegraphed drop-in, same visual
  // language as the old spawn so nothing downstream notices the difference).
  _placeAuthored() {
    if (this._disposed) return
    for (const spot of itemSpotsForArena(this.arenaId, this.bounds)) {
      if (this.groundItems.length >= 2) break
      const def = this._nextFromRoster()
      if (!def) break
      this._dropAt(def, spot.x, spot.z)
    }
  }

  _dropAt(def, x, z) {
    const mesh = this._takeMesh(def)
    const baseY = this.floorY + (def.groundY ?? 0.55)
    mesh.position.set(x, baseY + DROP_HEIGHT, z)
    mesh.rotation.set(0, Math.random() * Math.PI, 0)
    mesh.visible = true
    this.scene?.add(mesh)
    const ring = this._takeRing()
    ring.position.set(x, this.floorY + 0.03, z)
    ring.visible = true
    this.scene?.add(ring)
    this.groundItems.push({ def, mesh, ring, x, z, age: 0, state: 'drop', baseY })
    try { this.game?.audio?.sfx?.('whoosh', { vol: 0.35, pitch: 0.7 }) } catch { /* headless */ }
  }

  // §25.2: hurl an item in from the stands. `sideOverride` (0..3 =
  // -x / +x / -z / +z) is for tests; live play rotates sides with jitter so
  // throws feel like they come from all around the venue.
  _throwOne(sideOverride) {
    if (this.groundItems.length + this._throws.length >= 2) return false
    const def = this._nextFromRoster()
    if (!def) return false
    const b = this.bounds
    const zLo = b.minZ ?? -5.5, zHi = b.maxZ ?? 5.5
    const side = sideOverride ?? (this._throwSide = (this._throwSide + 1 + ((Math.random() * 2) | 0)) % 4)
    const lerp = (a, c, t) => a + (c - a) * t
    const from = { x: 0, y: THROW_ORIGIN_Y, z: 0 }
    if (side === 0) { from.x = b.minX - THROW_ORIGIN_OUT; from.z = lerp(zLo + 1, zHi - 1, Math.random()) }
    else if (side === 1) { from.x = b.maxX + THROW_ORIGIN_OUT; from.z = lerp(zLo + 1, zHi - 1, Math.random()) }
    else if (side === 2) { from.z = zLo - THROW_ORIGIN_OUT; from.x = lerp(b.minX + 1, b.maxX - 1, Math.random()) }
    else { from.z = zHi + THROW_ORIGIN_OUT; from.x = lerp(b.minX + 1, b.maxX - 1, Math.random()) }
    const spot = this._findClearSpot() // always inside the walkable rectangle
    const baseY = this.floorY + (def.groundY ?? 0.55)
    const to = { x: spot.x, y: baseY, z: spot.z }

    const mesh = this._takeMesh(def)
    mesh.position.set(from.x, from.y, from.z)
    this.scene?.add(mesh)
    const ring = this._takeRing()        // landing telegraph, live from launch
    ring.position.set(to.x, this.floorY + 0.03, to.z)
    ring.visible = true
    this.scene?.add(ring)
    const shadow = this._takeShadow()    // blob shadow tracks under the arc
    shadow.position.set(from.x, this.floorY + 0.02, from.z)
    shadow.visible = true
    this.scene?.add(shadow)

    this._throws.push({ def, mesh, ring, shadow, from, to, baseY, age: 0 })
    this.events?.emit?.('item:thrown', { kind: def.kind, from: { ...from }, to: { ...to } })
    try { this.game?.audio?.sfx?.('whoosh', { vol: 0.5, pitch: 0.9 }) } catch { /* headless */ }
    if (Math.random() < 0.3) this._caption('THE CROWD PROVIDES')
    return true
  }

  _updateThrows(dt) {
    for (let i = this._throws.length - 1; i >= 0; i--) {
      const t = this._throws[i]
      t.age++
      const k = Math.min(1, t.age / THROW_FRAMES)
      const x = t.from.x + (t.to.x - t.from.x) * k
      const z = t.from.z + (t.to.z - t.from.z) * k
      const y = t.from.y + (t.to.y - t.from.y) * k + Math.sin(Math.PI * k) * THROW_ARC
      t.mesh.position.set(x, y, z)
      t.mesh.rotation.x += dt * 7
      t.mesh.rotation.y += dt * 4.5
      t.shadow.position.set(x, this.floorY + 0.02, z)
      const s = Math.max(0.4, 1.15 - (y - this.floorY) * 0.16)
      t.shadow.scale.set(s, s, 1)
      const pulse = 1 + Math.sin(t.age * 0.35) * 0.18
      t.ring.scale.set(pulse, pulse, 1)
      if (k < 1) continue
      // touchdown: becomes a regular ground item (ring stays, shadow returns)
      this._throws.splice(i, 1)
      this._returnShadow(t.shadow)
      t.mesh.position.set(t.to.x, t.baseY, t.to.z)
      t.mesh.rotation.x = 0
      this.groundItems.push({ def: t.def, mesh: t.mesh, ring: t.ring, x: t.to.x, z: t.to.z, age: 0, state: 'ground', baseY: t.baseY })
      try { this.match?.particles?.burst?.('dust', { x: t.to.x, y: this.floorY + 0.1, z: t.to.z }, { n: 6 }) } catch { /* headless */ }
      try { this.game?.audio?.sfx?.('thud', { vol: 0.45, pitch: 1.2 }) } catch { /* headless */ }
      this.events?.emit?.('item:spawned', { kind: t.def.kind, name: t.def.name, pos: { x: t.to.x, y: this.floorY, z: t.to.z } })
    }
  }

  _caption(text) {
    const m = this.match
    if (m?.cap) { try { m.cap(text); return } catch { /* fall through */ } }
    this.events?.emit?.('caption', { text })
  }

  // Random clear floor spot in the XZ playfield (§17), biased toward the line
  // between the two fighters: the first 4 candidates are drawn along the
  // between-fighters segment itself (with a little lateral jitter), the rest
  // uniform over the walkable rectangle, and of all clear candidates the one
  // closest to the midpoint wins — the tracking camera (§18) composes both
  // fighters, so that's exactly the ground the player is looking at.
  _findClearSpot() {
    const b = this.bounds
    const loX = b.minX + 1.2, hiX = b.maxX - 1.2
    const loZ = (b.minZ ?? -5.5) + 1.2, hiZ = (b.maxZ ?? 5.5) - 1.2
    const a = this.fighters[0]?.pos, c = this.fighters[1]?.pos
    const ax = a?.x ?? (loX + hiX) / 2, az = a?.z ?? 0
    const bx = c?.x ?? ax, bz = c?.z ?? az
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2
    const clampX = (v) => Math.max(loX, Math.min(hiX, v))
    const clampZ = (v) => Math.max(loZ, Math.min(hiZ, v))
    let best = { x: clampX(loX + Math.random() * (hiX - loX)), z: clampZ(loZ + Math.random() * (hiZ - loZ)) }
    let bestScore = Infinity
    for (let tries = 0; tries < 12; tries++) {
      let x, z
      if (tries < 4) {
        const t = Math.random()
        x = clampX(ax + (bx - ax) * t + (Math.random() - 0.5) * 1.6)
        z = clampZ(az + (bz - az) * t + (Math.random() - 0.5) * 1.6)
      } else {
        x = loX + Math.random() * (hiX - loX)
        z = loZ + Math.random() * (hiZ - loZ)
      }
      let clear = true
      for (const f of this.fighters) {
        if (Math.hypot((f.pos?.x ?? 0) - x, (f.pos?.z ?? 0) - z) < 1.6) clear = false
      }
      for (const g of this.groundItems) {
        if (Math.hypot(g.x - x, (g.z ?? 0) - z) < 1.8) clear = false
      }
      if (!clear) { if (bestScore === Infinity) best = { x, z }; continue }
      const score = Math.hypot(x - midX, z - midZ)
      if (score < bestScore) { bestScore = score; best = { x, z } }
    }
    return best
  }

  // ------------------------------------------------------- heart drops (§25)
  _onBreak(e) {
    if (this._disposed || this._heart || this._heartCd > 0) return
    if (Math.random() >= HEART_CHANCE) return
    const p = e?.pos
    if (!p || !Number.isFinite(p.x)) return
    this._heartCd = HEART_CD_FRAMES
    const mesh = this._buildHeartMesh()
    const b = this.bounds
    const zLo = (b.minZ ?? -5.5), zHi = (b.maxZ ?? 5.5)
    const x = Math.max(b.minX + 0.7, Math.min(b.maxX - 0.7, p.x))
    const z = Math.max(zLo + 0.7, Math.min(zHi - 0.7, p.z ?? 0))
    // Ejection direction: random, but scored by wall clearance so the skitter
    // genuinely LANDS 5-9 m out instead of folding back off a nearby wall
    // (walls still reflect as a safety net). 8 random candidates plus the
    // toward-arena-center direction (guaranteed roomy even for corner breaks,
    // where 8 random draws can all face walls); roomiest wins.
    const centerDir = Math.atan2((zLo + zHi) / 2 - z, (b.minX + b.maxX) / 2 - x)
    let dir = centerDir, bestRoom = -1
    for (let i = 0; i < 9; i++) {
      const a = i === 0 ? centerDir : Math.random() * Math.PI * 2
      const cx = Math.cos(a), cz = Math.sin(a)
      const roomX = cx > 1e-4 ? (b.maxX - 0.7 - x) / cx : cx < -1e-4 ? (b.minX + 0.7 - x) / cx : 99
      const roomZ = cz > 1e-4 ? (zHi - 0.7 - z) / cz : cz < -1e-4 ? (zLo + 0.7 - z) / cz : 99
      const room = Math.min(roomX, roomZ, 9.5) + Math.random() * 0.8 // jitter breaks ties
      if (room > bestRoom) { bestRoom = room; dir = a }
    }
    // horizontal speed tuned so total skitter (launch + bounces at 0.72
    // horizontal restitution) covers roughly 5-9 m before it settles
    // (headless-measured displacement over 60 breaks: ~5-9 m, median ~7.5)
    const speed = 6.6 + Math.random() * 2.6
    const y = Math.max(this.floorY + 0.5, Math.min(this.floorY + 3, p.y ?? this.floorY + 0.5))
    mesh.position.set(x, y, z)
    this.scene?.add(mesh)
    this._heart = {
      mesh, x, y, z,
      vx: Math.cos(dir) * speed,
      vz: Math.sin(dir) * speed,
      vy: 4.5 + Math.random() * 1.5,
      state: 'skitter', age: 0,
    }
    try { this.game?.audio?.sfx?.('boing', { vol: 0.4, pitch: 1.4 }) } catch { /* headless */ }
  }

  _buildHeartMesh() {
    const g = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color: 0xff2e55, emissive: 0xb01030 })
    const lobeL = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), mat)
    lobeL.position.set(-0.11, 0.1, 0)
    const lobeR = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), mat)
    lobeR.position.set(0.11, 0.1, 0)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 6), mat)
    tip.rotation.z = Math.PI
    tip.position.set(0, -0.13, 0)
    const light = new THREE.PointLight(0xff4466, 1.1, 5)
    light.position.set(0, 0.2, 0)
    g.add(lobeL, lobeR, tip, light)
    g.userData.light = light
    return g
  }

  _updateHeart(dt) {
    if (this._heartCd > 0) this._heartCd--
    const h = this._heart
    if (!h) return
    h.age++
    const b = this.bounds
    const zLo = (b.minZ ?? -5.5) + 0.7, zHi = (b.maxZ ?? 5.5) - 0.7
    const xLo = b.minX + 0.7, xHi = b.maxX - 0.7
    if (h.state === 'skitter') {
      h.vy += HEART_GRAV * dt
      h.x += h.vx * dt
      h.z += h.vz * dt
      h.y += h.vy * dt
      // wall reflections keep the skitter inside the arena from any break point
      if (h.x < xLo) { h.x = xLo; h.vx = Math.abs(h.vx) * 0.8 }
      else if (h.x > xHi) { h.x = xHi; h.vx = -Math.abs(h.vx) * 0.8 }
      if (h.z < zLo) { h.z = zLo; h.vz = Math.abs(h.vz) * 0.8 }
      else if (h.z > zHi) { h.z = zHi; h.vz = -Math.abs(h.vz) * 0.8 }
      const rest = this.floorY + HEART_REST_Y
      if (h.y <= rest && h.vy < 0) {
        h.y = rest
        h.vy = -h.vy * 0.5
        h.vx *= 0.72
        h.vz *= 0.72
        try { this.game?.audio?.sfx?.('boing', { vol: 0.2, pitch: 1.8 }) } catch { /* headless */ }
        if (h.vy < 1.1 && Math.hypot(h.vx, h.vz) < 1.1) h.state = 'idle'
      }
      if (h.age > 240) { h.state = 'idle'; h.y = rest } // safety: settle by 4 s
      h.mesh.position.set(h.x, h.y, h.z)
      h.mesh.rotation.y += dt * 9
    } else {
      // sitting: pulse (scale + light throb), slow spin, soft bob
      const throb = 1 + Math.sin(h.age * 0.12) * 0.12
      h.mesh.scale.setScalar(throb)
      h.mesh.rotation.y += dt * 1.8
      h.mesh.position.set(h.x, this.floorY + HEART_REST_Y + Math.sin(h.age * 0.045) * 0.07, h.z)
      const light = h.mesh.userData.light
      if (light) light.intensity = 0.85 + Math.sin(h.age * 0.12) * 0.45
    }
    // lifecycle: untouchable before 20 s, blink after 30 s, gone at ~33 s
    if (h.age >= HEART_GONE_AT) {
      this.events?.emit?.('item:despawn', { kind: 'heart' })
      this._removeHeart()
      return
    }
    h.mesh.visible = h.age < HEART_BLINK_AT || (h.age >> 3) % 2 === 0
    // first-come pickup: either slot, AI included; full-HP fighters walk over
    // it harmlessly so the heal is never wasted
    for (const f of this.fighters) {
      if (!f || (f.hp ?? 0) <= 0) continue
      if ((f.hp ?? 100) >= (f.maxHp ?? 100)) continue
      if (!PICK_STATES.has(f.state)) continue
      if (Math.hypot((f.pos?.x ?? 0) - h.x, (f.pos?.z ?? 0) - h.z) < HEART_RADIUS) {
        this._consumeHeart(f)
        break
      }
    }
  }

  _consumeHeart(f) {
    const h = this._heart
    if (!h) return
    this._removeHeart()
    // sanctioned heal path: Fighter.setHp clamps to maxHp and emits 'health'
    // (same route EffectContext.heal and the roster's healing items use)
    f.setHp?.(Math.min(f.maxHp ?? 100, (f.hp ?? 0) + HEART_HEAL))
    try { this.match?.particles?.burst?.('stars', { x: h.x, y: this.floorY + 1.0, z: h.z }, { n: 10 }) } catch { /* headless */ }
    try { this.game?.audio?.sfx?.('coin', { vol: 0.55, pitch: 1.1 }) } catch { /* headless */ }
    this._caption('HODL YOUR HEART')
  }

  _removeHeart() {
    const h = this._heart
    if (!h) return
    this._heart = null
    this.scene?.remove(h.mesh)
    h.mesh.traverse?.((o) => {
      if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.() }
    })
  }

  // ------------------------------------------------------------------ pickup
  _canPickup(f) {
    if (!f || this.heldBySlot[f.slot]) return false
    return PICK_STATES.has(f.state) && (f.grounded?.() ?? true)
  }

  tryPickup(fighter) {
    if (this._disposed || !this._canPickup(fighter)) return false
    for (let i = 0; i < this.groundItems.length; i++) {
      const g = this.groundItems[i]
      if (g.state === 'ground' && Math.hypot(fighter.pos.x - g.x, (fighter.pos.z ?? 0) - (g.z ?? 0)) < PICKUP_RADIUS * 1.3) {
        this._pickup(fighter, i)
        return true
      }
    }
    return false
  }

  _pickup(fighter, idx) {
    const g = this.groundItems[idx]
    this.groundItems.splice(idx, 1)
    this._returnRing(g.ring)
    // corruption tripwire (v1.1.2): a held record must NEVER carry a falsy def
    if (!g.def) {
      console.error(`[items] _pickup: ground item at x=${g.x} has no def — record dropped`)
      this.scene?.remove(g.mesh)
      return
    }
    // the ground mesh IS the held mesh — re-parented near the hand (pooled)
    const mesh = g.mesh
    this.scene?.remove(mesh)
    this._attachHeld(fighter, g.def, mesh)
    this.heldBySlot[fighter.slot] = { def: g.def, mesh }
    this.events?.emit?.('item:pickup', { slot: fighter.slot, kind: g.def.kind, name: g.def.name })
    try { this.game?.audio?.sfx?.('coin', { vol: 0.5, pitch: 1.25 }) } catch { /* headless */ }
  }

  _attachHeld(fighter, def, mesh) {
    const bone = fighter.bones?.forearmR || fighter.bones?.armR || fighter.bones?.torso || fighter.holder || fighter.root
    if (!bone?.add) return
    mesh.position.set(0.05, -0.32, 0.16)
    mesh.rotation.set(0, 0, 0)
    mesh.scale.setScalar(def.heldScale ?? 0.6)
    mesh.visible = true
    bone.add(mesh)
  }

  // ------------------------------------------------------------------ use
  held(slot) { return this.heldBySlot[slot]?.def ?? null }

  use(fighter) {
    if (this._disposed || !fighter) return false
    const rec = this.heldBySlot[fighter.slot]
    if (!rec || !rec.def) {
      // Corrupted record (def missing) — drop it instead of throwing and
      // taking the whole item system down for the match (v1.1.2 robustness).
      if (rec) {
        console.warn(`[items] use(): held record for slot ${fighter.slot} missing def — dropped`)
        rec.mesh?.parent?.remove?.(rec.mesh)
      }
      this.heldBySlot[fighter.slot] = null
      return false
    }
    if (!USE_STATES.has(fighter.state)) return false // can't quaff mid-ragdoll
    this.heldBySlot[fighter.slot] = null
    this._returnMesh(rec.def, rec.mesh)
    this.events?.emit?.('item:used', { slot: fighter.slot, kind: rec.def.kind, name: rec.def.name })
    const ctx = new EffectContext(this, fighter, rec.def)
    try {
      rec.def.effect(ctx)
      this.effects.push(ctx)
    } catch (e) {
      console.error('[items] item effect threw', rec.def.kind, e)
      ctx.flush()
    }
    return true
  }

  // Debug / playground / test helper: hand a fighter an item directly.
  give(fighter, kind) {
    if (this._disposed || !fighter || this.heldBySlot[fighter.slot]) return false
    const def = itemDefByKind(kind)
    if (!def) { console.warn('[items] give(): unknown kind', kind); return false }
    const mesh = this._takeMesh(def)
    this._attachHeld(fighter, def, mesh)
    this.heldBySlot[fighter.slot] = { def, mesh }
    this.events?.emit?.('item:pickup', { slot: fighter.slot, kind: def.kind, name: def.name })
    return true
  }

  // ------------------------------------------------------------------ AI glue
  // Nearest pickupable ground item to a position, planar XZ (§17).
  // pos: Vector3 or {x, z?}. §25: a live heart is offered too — but only when
  // the asking fighter is hurt (the Brain passes fighter.pos by reference, so
  // identity-matching it against the fighters recovers who is asking), and
  // with its distance discounted so a hurt AI prefers the heal over a toy.
  nearestGroundItem(pos) {
    const px = pos?.x ?? 0
    const pz = pos?.z ?? 0
    let best = null, bestD = Infinity, bestScore = Infinity
    for (const g of this.groundItems) {
      if (g.state !== 'ground') continue
      const d = Math.hypot(g.x - px, (g.z ?? 0) - pz)
      if (d < bestScore) { bestScore = d; bestD = d; best = g }
    }
    let out = best ? { kind: best.def.kind, def: best.def, pos: { x: best.x, y: this.floorY, z: best.z ?? 0 }, dist: bestD } : null
    const h = this._heart
    if (h) {
      const asker = this.fighters.find((f) => f && (f.pos === pos ||
        ((f.pos?.x ?? NaN) === px && (f.pos?.z ?? 0) === pz)))
      const hurt = asker
        ? (asker.hp ?? 100) < (asker.maxHp ?? 100) * HEART_CHASE_HP
        : this.fighters.some((f) => f && (f.hp ?? 100) < (f.maxHp ?? 100) * HEART_CHASE_HP)
      if (hurt) {
        const d = Math.hypot(h.x - px, h.z - pz)
        if (d * 0.45 < bestScore) {
          out = { kind: 'heart', def: { kind: 'heart', name: 'HEART' }, pos: { x: h.x, y: this.floorY, z: h.z }, dist: d }
        }
      }
    }
    return out
  }

  // Simple use-now heuristic for AI (aiLevel gating happens in the combat glue).
  aiShouldUse(fighter) {
    const def = this.held(fighter?.slot ?? -1)
    if (!def || !USE_STATES.has(fighter.state)) return false
    const foe = fighter.foe
    const dist = foe ? Math.hypot(foe.pos.x - fighter.pos.x, (foe.pos.z ?? 0) - (fighter.pos.z ?? 0)) : 99
    const ai = def.ai || { type: 'any' }
    switch (ai.type) {
      case 'self': return (fighter.hp ?? 100) < (fighter.maxHp ?? 100) * 0.6 || def.tier >= 9
      case 'melee': return dist <= (ai.range ?? 3)
      case 'ranged': return dist >= 2.5 && dist <= (ai.range ?? 8)
      case 'trap': return dist >= 3 && dist <= (ai.range ?? 6)
      default: return dist <= (ai.range ?? 9)
    }
  }

  groundItemCount() { return this.groundItems.length }
  activeEffectCount() { return this.effects.length }

  // ------------------------------------------------------------------ pooling
  _takeMesh(def) {
    const pool = this._pool.get(def.kind)
    let mesh = pool?.pop()
    if (!mesh) {
      try { mesh = def.build() } catch (e) {
        console.warn('[items] build failed', def.kind, e)
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xff6fd8 }))
      }
    }
    mesh.scale.setScalar(1)
    mesh.rotation.set(0, 0, 0)
    mesh.visible = true
    return mesh
  }

  _returnMesh(def, mesh) {
    if (!mesh) return
    mesh.parent?.remove(mesh)
    mesh.scale.setScalar(1)
    mesh.rotation.set(0, 0, 0)
    if (!def || !def.kind) { // def-null guard: no pool key — dispose instead
      mesh.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose?.() })
      return
    }
    if (!this._pool.has(def.kind)) this._pool.set(def.kind, [])
    const pool = this._pool.get(def.kind)
    if (pool.length < 3) pool.push(mesh)
    else mesh.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose?.() })
  }

  _takeRing() {
    let ring = this._rings.pop()
    if (!ring) {
      ring = new THREE.Mesh(RING_GEO, RING_MAT)
      ring.rotation.x = -Math.PI / 2
    }
    ring.scale.set(1, 1, 1)
    return ring
  }

  _returnRing(ring) {
    if (!ring) return
    ring.parent?.remove(ring)
    if (this._rings.length < 4) this._rings.push(ring)
  }

  _takeShadow() {
    let s = this._shadows.pop()
    if (!s) {
      s = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT)
      s.rotation.x = -Math.PI / 2
    }
    s.scale.set(1, 1, 1)
    return s
  }

  _returnShadow(s) {
    if (!s) return
    s.parent?.remove(s)
    if (this._shadows.length < 3) this._shadows.push(s)
  }

  // ------------------------------------------------------------------ teardown
  _removeGround(idx) {
    const g = this.groundItems[idx]
    this.groundItems.splice(idx, 1)
    this.scene?.remove(g.mesh)
    this._returnMesh(g.def, g.mesh)
    this._returnRing(g.ring)
  }

  _clearGround() {
    for (let i = this.groundItems.length - 1; i >= 0; i--) this._removeGround(i)
  }

  _clearThrows() {
    for (const t of this._throws.splice(0)) {
      this.scene?.remove(t.mesh)
      this._returnMesh(t.def, t.mesh)
      this._returnRing(t.ring)
      this._returnShadow(t.shadow)
    }
  }

  _flushEffects() {
    const list = this.effects.splice(0)
    for (const fx of list) {
      try { fx.flush() } catch (e) { console.error('[items] effect flush threw', e) }
    }
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    for (const off of this._offs.splice(0)) { try { off() } catch { /* ignore */ } }
    this._flushEffects()
    this._clearGround()
    this._clearThrows()
    this._removeHeart()
    for (let slot = 0; slot < this.heldBySlot.length; slot++) {
      const rec = this.heldBySlot[slot]
      if (rec) { this._returnMesh(rec.def, rec.mesh); this.heldBySlot[slot] = null }
    }
    // drain pools (geometry only — materials are a shared module-level cache)
    for (const pool of this._pool.values()) {
      for (const mesh of pool.splice(0)) mesh.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose?.() })
    }
    this._pool.clear()
    this._rings.length = 0
    this._shadows.length = 0
  }
}
