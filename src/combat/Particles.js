// Pooled retro particle system — chunky low-poly puffs, sparks, coins, confetti.
// Named bursts per CONTRACTS.md §6: 'impact','sparks' (+alias 'spark'),'coins',
// 'smoke','dust','stars','confetti','explosion','peanuts' — plus 'teeth'
// (comedic white-cube dental shrapnel on heavy counter hits, gore-gated).
// v1.1 (§15) adds the blood family: 'blood' (chunky dark-red box burst with
// gravity + floor-stick), 'blood_spray' (directional cone — pass opts.dir
// {x,y,z} or opts.dirX), 'blood_fountain' (KO geyser, staged spurts). All three
// are gore-gated: 'none' converts every blood request into plain sparks (zero
// red pixels), 'max' scales counts/ttl up via the existing gm multiplier.
// Everything is pre-allocated; bursts just wake pooled meshes up. No allocation per hit.
// Delayed stages (explosion smoke/shock ring) ride the same pool via a negative life.
//
// GORE MODES (game.save 'settings.gore'): 'none' | 'cartoon' (default) | 'max'.
//   none    — impacts stay sparks/stars only; the 'teeth' burst degrades to a
//             couple of cartoon stars (no fluid-colored debris, no teeth).
//   cartoon — current behavior + teeth allowed + impact stars ride along.
//   max     — cartoon plus bigger debris counts, longer smoke, more teeth and
//             extra coin spray. Counts still respect quality.particleScale and
//             are hard-capped against the pool size (recycler never allocates),
//             so MAX is chaos, not a memory leak.
// MatchScreen constructs this pool without a game ref; Fighter attaches it at
// match start via attachGame(game) which re-reads the setting. There is no
// 'settings:changed' event today — we subscribe defensively in case one
// appears, and cheaply re-poll the (in-memory) save once a second in update().
import * as THREE from 'three'

const COLORS = {
  gold: 0xffcf3f, white: 0xffffff, orange: 0xff8c2e, yellow: 0xffe14d,
  grey: 0x9aa0ad, red: 0xff4d5e, green: 0x37e07a, blue: 0x4dc3ff,
  purple: 0xb45cff, pink: 0xff6fd8, tan: 0xc9a166, brown: 0x8a6a42,
  ember: 0xff5d2e, peanut: 0xd8b26e, shell: 0xb98c4a, blast: 0xffd9a0,
  tooth: 0xfffbe8,
  // blood family — dark, chunky, deliberately un-realistic ketchup tones
  blood: 0x8e1420, bloodDark: 0x5c0d15, bloodBright: 0xb31b28,
}

const GORE_MODES = new Set(['none', 'cartoon', 'max'])

export class ParticleSystem {
  constructor(scene, quality, game = null) {
    this.scene = scene
    this.scale = quality?.particleScale ?? 1
    this.pool = []
    this.cursor = 0
    this.game = null
    this.gore = 'cartoon'
    this._goreTimer = 0
    this._offSettings = null
    this._disposed = false
    if (game) this.attachGame(game)
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1)
    this._coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.16, 8)
    this._ringGeo = new THREE.TorusGeometry(0.5, 0.07, 6, 18)
    const count = Math.max(60, Math.round(220 * this.scale))
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const mesh = new THREE.Mesh(this._boxGeo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.userData.p = {
        active: false, vel: new THREE.Vector3(), spin: new THREE.Vector3(),
        life: 0, ttl: 1, grav: 0, size: 0.1, bounce: 0, grow: 0, sx: 1, sy: 1, sz: 1,
      }
      scene.add(mesh)
      this.pool.push(mesh)
    }
  }

  // Hand the pool a game ref (Fighter does this at match start — MatchScreen
  // builds the pool before it has fighters). Idempotent; re-reads gore live.
  attachGame(game) {
    if (!game) return
    if (this.game !== game) {
      this._offSettings?.()
      this._offSettings = null
      this.game = game
      try {
        const off = game.events?.on?.('settings:changed', () => this._refreshGore())
        if (typeof off === 'function') this._offSettings = off
      } catch { /* event bus optional */ }
    }
    this._refreshGore()
  }

  _refreshGore() {
    const g = this.game?.save?.get?.('settings.gore', 'cartoon')
    this.gore = GORE_MODES.has(g) ? g : 'cartoon'
  }

  _take() {
    for (let i = 0; i < this.pool.length; i++) {
      this.cursor = (this.cursor + 1) % this.pool.length
      const m = this.pool[this.cursor]
      if (!m.userData.p.active) return m
    }
    // pool exhausted: recycle oldest slot anyway (never fail, never allocate)
    this.cursor = (this.cursor + 1) % this.pool.length
    return this.pool[this.cursor]
  }

  _spawn(pos, cfg) {
    const m = this._take()
    const p = m.userData.p
    p.active = true
    m.visible = !(cfg.delay > 0)
    m.geometry = cfg.ring ? this._ringGeo : cfg.coin ? this._coinGeo : this._boxGeo
    m.material.color.setHex(cfg.color)
    m.position.set(
      pos.x + (Math.random() - 0.5) * (cfg.jitter ?? 0.2),
      pos.y + (Math.random() - 0.5) * (cfg.jitter ?? 0.2),
      (pos.z || 0) + (Math.random() - 0.5) * (cfg.jitter ?? 0.2)
    )
    const sp = cfg.speed * (0.5 + Math.random() * 0.8)
    const a = Math.random() * Math.PI * 2
    const upBias = cfg.upBias ?? 0.3
    p.vel.set(Math.cos(a) * sp, Math.abs(Math.sin(a) * sp) * upBias + sp * (cfg.up ?? 0.4), Math.sin(a) * sp * 0.5)
    if (cfg.dirX) p.vel.x = p.vel.x * 0.4 + cfg.dirX * sp
    if (cfg.dir) {
      // directional cone: unit-ish dir + jitter, renormalized to the same speed
      const spread = cfg.spread ?? 0.3
      p.vel.set(
        (cfg.dir.x || 0) + (Math.random() - 0.5) * spread * 2,
        (cfg.dir.y || 0) + (Math.random() - 0.5) * spread * 2,
        (cfg.dir.z || 0) + (Math.random() - 0.5) * spread * 2
      )
      if (p.vel.lengthSq() < 1e-6) p.vel.set(0, 1, 0)
      p.vel.normalize().multiplyScalar(sp)
    }
    p.spin.set((Math.random() - 0.5) * cfg.spin, (Math.random() - 0.5) * cfg.spin, (Math.random() - 0.5) * cfg.spin)
    p.life = -(cfg.delay ?? 0)
    p.ttl = cfg.ttl * (cfg.exactTtl ? 1 : 0.7 + Math.random() * 0.6)
    p.grav = cfg.grav
    p.size = cfg.size * (cfg.exactSize ? 1 : 0.7 + Math.random() * 0.7)
    p.bounce = cfg.bounce ?? 0
    p.grow = cfg.grow ?? 0
    p.stick = !!cfg.stick
    p.stuck = false
    p.sx = cfg.sx ?? 1; p.sy = cfg.sy ?? 1; p.sz = cfg.sz ?? 1
    if (cfg.flat) {
      m.rotation.set(Math.PI / 2, 0, 0) // torus lies flat in XZ
      p.spin.set(0, 0, 0)
    } else {
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
    }
    m.scale.setScalar(p.size)
  }

  burst(name, pos, opts = {}) {
    if (this._disposed || !pos) return
    // NaN origin guard: one poisoned burst would strand pool slots at NaN
    // positions (never visible, never recycled until the cursor laps them).
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z ?? 0)) return
    // gm = gore debris multiplier (MAX only). Every count is capped to a slice
    // of the pool so one burst can never strobe-recycle the whole scene.
    const gm = this.gore === 'max' ? 1.5 : 1
    const cap = Math.max(12, this.pool.length >> 2)
    const n = (base, goreScaled = false) =>
      Math.min(cap, Math.max(2, Math.round((opts.n ?? base) * this.scale * (goreScaled ? gm : 1))))
    const dirX = opts.dirX ?? 0
    const smokeTtl = this.gore === 'max' ? 1.3 : 0.9 // MAX: smoke hangs longer
    switch (name) {
      case 'impact':
        for (let i = 0; i < n(9, true); i++) this._spawn(pos, { color: i % 2 ? COLORS.white : COLORS.yellow, speed: 5, ttl: 0.28, grav: -14, size: 0.13, spin: 12, dirX, up: 0.5 })
        break
      case 'spark': // alias
      case 'sparks':
        for (let i = 0; i < n(13, true); i++) this._spawn(pos, { color: i % 3 ? COLORS.orange : COLORS.yellow, speed: 8, ttl: 0.34, grav: -20, size: 0.07, spin: 16, sx: 2.6, dirX, up: 0.4 })
        break
      case 'coins':
        // MAX: finishers/KOs rain noticeably harder (coin sprays route here)
        for (let i = 0; i < n(12, true); i++) this._spawn(pos, { color: COLORS.gold, speed: this.gore === 'max' ? 5.2 : 4.5, ttl: 1.5, grav: -22, size: 0.16, spin: 10, bounce: 0.5, coin: true, up: 1.1, upBias: 1 })
        break
      case 'smoke':
        for (let i = 0; i < n(7, true); i++) this._spawn(pos, { color: COLORS.grey, speed: 1.1, ttl: smokeTtl, grav: 2.5, size: 0.2, spin: 2, grow: 1.6, up: 0.9 })
        break
      case 'teeth': {
        // Comedic dental shrapnel — tiny ivory cubes with gravity + floor
        // bounce. Gore-gated: 'none' degrades to a couple of cartoon stars.
        if (this.gore === 'none') {
          for (let i = 0; i < n(3); i++) this._spawn(pos, { color: COLORS.yellow, speed: 2.2, ttl: 0.8, grav: 1, size: 0.13, spin: 9, up: 0.8, sx: 1.4, sz: 0.3 })
          break
        }
        const teeth = Math.min(this.gore === 'max' ? 11 : 6, n(this.gore === 'max' ? 8 : 5))
        for (let i = 0; i < teeth; i++) {
          this._spawn(pos, {
            color: i % 4 === 3 ? COLORS.white : COLORS.tooth,
            speed: this.gore === 'max' ? 4.2 : 3.2, ttl: this.gore === 'max' ? 1.7 : 1.2,
            grav: -22, size: 0.075, spin: 11, bounce: 0.42,
            sx: 0.85, sy: 1.15, sz: 0.6, up: 1, upBias: 1, dirX, jitter: 0.16,
          })
        }
        // cartoon impact stars ride along with the dental event
        for (let i = 0; i < n(4); i++) this._spawn(pos, { color: COLORS.yellow, speed: 2.2, ttl: 0.9, grav: 1, size: 0.14, spin: 9, up: 0.8, sx: 1.4, sz: 0.3 })
        break
      }
      case 'blood': {
        // Chunky retro gore: dark-red cubes that arc out, splat, and stick to
        // the floor. 'none' = the whole request degrades to plain sparks.
        if (this.gore === 'none') {
          for (let i = 0; i < n(8); i++) this._spawn(pos, { color: i % 3 ? COLORS.orange : COLORS.yellow, speed: 6, ttl: 0.3, grav: -20, size: 0.07, spin: 14, sx: 2.2, dirX, up: 0.4 })
          break
        }
        const cols = [COLORS.blood, COLORS.bloodDark, COLORS.blood, COLORS.bloodBright]
        for (let i = 0; i < n(10, true); i++) {
          this._spawn(pos, {
            color: cols[i % cols.length], speed: 3.4, ttl: this.gore === 'max' ? 1.5 : 1.1,
            grav: -22, size: 0.12, spin: 8, stick: true, dirX, up: 0.7, jitter: 0.25,
          })
        }
        break
      }
      case 'blood_spray': {
        // Directional cone (severed-limb spurt). opts.dir = {x,y,z} preferred;
        // falls back to a dirX-driven forward fan.
        if (this.gore === 'none') {
          for (let i = 0; i < n(8); i++) this._spawn(pos, { color: i % 3 ? COLORS.orange : COLORS.yellow, speed: 7, ttl: 0.3, grav: -20, size: 0.07, spin: 14, sx: 2.2, dirX, up: 0.4 })
          break
        }
        const dir = opts.dir || { x: dirX || 1, y: 0.55, z: 0 }
        const cols = [COLORS.blood, COLORS.bloodBright, COLORS.bloodDark]
        for (let i = 0; i < n(12, true); i++) {
          this._spawn(pos, {
            color: cols[i % cols.length], speed: 6.5 + Math.random() * 2.5,
            ttl: this.gore === 'max' ? 1.4 : 1, grav: -18, size: 0.09, spin: 10,
            stick: true, dir, spread: 0.32, jitter: 0.12,
          })
        }
        break
      }
      case 'blood_fountain': {
        // KO geyser — staged upward spurts so it visibly pumps for a beat.
        if (this.gore === 'none') {
          for (let i = 0; i < n(12); i++) this._spawn(pos, { color: i % 3 ? COLORS.orange : COLORS.yellow, speed: 8, ttl: 0.4, grav: -20, size: 0.08, spin: 14, sx: 2.2, up: 0.8 })
          break
        }
        const cols = [COLORS.blood, COLORS.bloodBright, COLORS.bloodDark, COLORS.blood]
        const stages = this.gore === 'max' ? 5 : 3
        const per = n(this.gore === 'max' ? 10 : 8, true)
        for (let s = 0; s < stages; s++) {
          for (let i = 0; i < per; i++) {
            this._spawn(pos, {
              color: cols[(s + i) % cols.length], speed: 7 + Math.random() * 3.5,
              ttl: this.gore === 'max' ? 1.9 : 1.5, grav: -22, size: 0.13, spin: 9,
              stick: true, dir: { x: 0, y: 1, z: 0 }, spread: 0.24,
              delay: s * 0.12, jitter: 0.14,
            })
          }
        }
        break
      }
      case 'dust':
        // ground scuffs — soft brown/tan puffs billowing out and up, growing as they fade
        for (let i = 0; i < n(8); i++) this._spawn(pos, { color: i % 2 ? COLORS.tan : COLORS.brown, speed: 1.7, ttl: 0.7, grav: 1.6, size: 0.16, spin: 2.5, grow: 2.2, up: 0.5, dirX, jitter: 0.3 })
        break
      case 'explosion': {
        // stage 1: white-hot core flash + multi-size orange/red fireball chunks
        const chunks = n(16, true)
        this._spawn(pos, { color: COLORS.white, speed: 0.5, ttl: 0.13, grav: 0, size: 0.55, spin: 3, grow: 2.4, exactTtl: true, jitter: 0.05 })
        for (let i = 0; i < chunks; i++) {
          const fire = [COLORS.orange, COLORS.ember, COLORS.yellow, COLORS.red]
          this._spawn(pos, { color: fire[i % fire.length], speed: 7.5, ttl: 0.5, grav: -9, size: i % 3 ? 0.13 : 0.3, spin: 11, grow: 0.4, dirX, up: 0.6, jitter: 0.35 })
        }
        // stage 2: expanding flat shock ring, then dark smoke rolling up out of the fire
        this._spawn(pos, { color: COLORS.blast, speed: 0, ttl: 0.42, grav: 0, size: 0.34, spin: 0, grow: 9, ring: true, flat: true, delay: 0.06, exactTtl: true, exactSize: true, jitter: 0.02, sz: 0.45 })
        for (let i = 0; i < Math.max(2, Math.round(chunks / 3)); i++) {
          this._spawn(pos, { color: COLORS.grey, speed: 1.4, ttl: 0.85, grav: 2.6, size: 0.24, spin: 2, grow: 2, up: 1, delay: 0.12, jitter: 0.4 })
        }
        break
      }
      case 'peanuts':
        // chunky little shells that rain down and bounce — Bonko-brand shrapnel
        for (let i = 0; i < n(12); i++) this._spawn(pos, { color: i % 2 ? COLORS.peanut : COLORS.shell, speed: 4, ttl: 1.4, grav: -22, size: 0.1, spin: 10, bounce: 0.45, sx: 1.5, up: 1, upBias: 1, dirX })
        break
      case 'stars':
        for (let i = 0; i < n(6); i++) this._spawn(pos, { color: COLORS.yellow, speed: 2.2, ttl: 0.9, grav: 1, size: 0.14, spin: 9, up: 0.8, sx: 1.4, sz: 0.3 })
        break
      case 'confetti': {
        const cols = [COLORS.red, COLORS.green, COLORS.blue, COLORS.purple, COLORS.pink, COLORS.gold]
        for (let i = 0; i < n(24); i++) this._spawn(pos, { color: cols[i % cols.length], speed: 4, ttl: 1.7, grav: -5, size: 0.11, spin: 14, sy: 0.25, up: 1.2, upBias: 1 })
        break
      }
      default:
        console.debug('[combat] unknown particle burst:', name)
        for (let i = 0; i < n(6); i++) this._spawn(pos, { color: COLORS.white, speed: 4, ttl: 0.3, grav: -12, size: 0.1, spin: 8 })
    }
  }

  update(dt) {
    if (this._disposed) return
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60
    // gore re-poll: SaveManager.get is an in-memory walk — once a second is free
    if (this.game && ++this._goreTimer >= 60) {
      this._goreTimer = 0
      this._refreshGore()
    }
    for (const m of this.pool) {
      const p = m.userData.p
      if (!p.active) continue
      p.life += dt
      if (p.life < 0) continue // delayed stage not born yet
      if (p.life >= p.ttl) { p.active = false; m.visible = false; continue }
      m.visible = true
      p.vel.y += p.grav * dt
      m.position.addScaledVector(p.vel, dt)
      if (p.stick && !p.stuck && m.position.y <= 0.05 && p.vel.y < 0) {
        // floor splat: freeze in place as a flat chunk and let the fade finish
        p.stuck = true
        m.position.y = 0.025 + Math.random() * 0.02
        p.vel.set(0, 0, 0)
        p.spin.set(0, 0, 0)
        p.grav = 0
        p.bounce = 0
        p.sy = 0.18
        m.rotation.set(0, Math.random() * Math.PI, 0)
      }
      if (p.bounce > 0 && m.position.y < 0.08 && p.vel.y < 0) {
        m.position.y = 0.08
        p.vel.y *= -p.bounce
        p.vel.x *= 0.8
      }
      m.rotation.x += p.spin.x * dt
      m.rotation.y += p.spin.y * dt
      m.rotation.z += p.spin.z * dt
      const r = p.life / p.ttl
      const fade = r > 0.65 ? Math.max(0.001, 1 - (r - 0.65) / 0.35) : 1
      const s = p.size * fade * (1 + p.grow * r)
      m.scale.set(s * p.sx, s * p.sy, s * p.sz)
    }
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    this._offSettings?.()
    this._offSettings = null
    this.game = null
    for (const m of this.pool) {
      this.scene?.remove?.(m)
      m.material.dispose()
    }
    this._boxGeo.dispose()
    this._coinGeo.dispose()
    this._ringGeo.dispose()
    this.pool.length = 0
  }
}
