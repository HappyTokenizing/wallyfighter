// SpecialContext — the `fx` object handed to MoveDef.script and finisher scripts.
// Implements CONTRACTS.md §6 exactly. Runs on the match's fixed clock via step().
//
// v2.0 (§17): the engine's `fighter.facing` is now a yaw angle in radians, but
// the 40+ existing character scripts were written against the v1 contract where
// `.facing` is ±1. fx.self / fx.foe are therefore LEGACY VIEWS: thin proxies
// that pass every field/method through to the real Fighter except `.facing`,
// which reads as the fighter's `facingSign` (±1 toward the foe, projected on
// world X). Scripts keep working unchanged; the engine (MatchScreen, camera,
// AI) always sees the raw fighter with yaw facing.
const RAW = Symbol('rawFighter')
const _views = new WeakMap()

function legacySign(f) {
  return f.facingSign ?? (Math.cos(Number(f.facing) || 0) >= 0 ? 1 : -1)
}

function view(f) {
  if (!f || typeof f !== 'object') return f
  if (f[RAW]) return f // already a view
  let v = _views.get(f)
  if (v) return v
  v = new Proxy(f, {
    get(t, k) {
      if (k === RAW) return t
      if (k === 'facing') return legacySign(t)
      if (k === 'foe') return t.foe ? view(t.foe) : t.foe
      const val = Reflect.get(t, k)
      return typeof val === 'function' ? val.bind(t) : val
    },
    set(t, k, val) {
      if (k === 'facing' && (val === 1 || val === -1)) {
        // a script writing legacy ±1 facing maps through the compat setter
        try { t.setFacing(val) } catch { Reflect.set(t, k, val) }
        return true
      }
      Reflect.set(t, k, val)
      return true
    },
  })
  _views.set(f, v)
  return v
}

// unwrap a possibly-proxied fighter back to the raw instance
function raw(f) {
  return (f && typeof f === 'object' && f[RAW]) || f
}

export class SpecialContext {
  constructor(match, self, foe, onEnd) {
    this.match = match
    this._self = raw(self)
    this._foe = raw(foe)
    this.self = view(this._self)
    this.foe = view(this._foe)
    this._onEnd = onEnd || null
    this._frameCbs = []
    this._timers = []
    this._ended = false
    this._age = 0
  }

  // --- scheduling ---
  frame(cb) { if (typeof cb === 'function') this._frameCbs.push(cb) }
  after(nFrames, cb) {
    if (typeof cb !== 'function') return
    this._timers.push({ n: Math.max(1, Math.round(nFrames) || 1), cb })
  }

  step() {
    this._age++
    // fx.after timers keep ticking even after end() so scripts can schedule
    // delayed cleanup (e.g. buff reverts) that outlives the scripted move.
    for (const t of this._timers) {
      if (t.done) continue
      t.n--
      if (t.n <= 0) {
        t.done = true
        try { t.cb() } catch (e) { console.error('[combat] fx.after cb threw', e) }
      }
    }
    this._timers = this._timers.filter((t) => !t.done)
    if (this._ended) return
    for (const cb of [...this._frameCbs]) {
      try { cb(this._age) } catch (e) { console.error('[combat] fx.frame cb threw', e) }
      if (this._ended) return
    }
  }

  get done() { return this._ended && this._timers.length === 0 }
  get age() { return this._age }

  // Invoke every pending after() callback NOW (in remaining-time order), then end.
  // Called by MatchScreen on round reset / match end / finisher start so delayed
  // cleanup (buff reverts, material restores) always runs instead of being dropped.
  flush() {
    const timers = this._timers.slice().sort((a, b) => a.n - b.n)
    this._timers = []
    for (const t of timers) {
      if (t.done) continue
      t.done = true
      try { t.cb() } catch (e) { console.error('[combat] fx flush cb threw', e) }
    }
    this._timers.length = 0 // drop anything re-scheduled during the flush
    this.end()
  }

  // --- combat verbs ---
  // fx.hit knockback keeps its v1 {x, y} shape: x = horizontal magnitude along
  // the ATTACKER'S FACING, y = up. MatchScreen resolves it to 3D internally.
  hit(spec = {}) { this.match.applyScriptHit(this._self, this._foe, spec) }

  impulse(target, vec, spin = 0) { this.match.applyImpulse(raw(target), vec, spin) }

  ragdoll(target, impulse) {
    const t = raw(target)
    const f = t === this._foe || t === this._self ? t : this._foe
    let imp = impulse
    if (!imp) {
      // default: knock the target backwards along its own facing
      imp = typeof f.dirX === 'function'
        ? [-f.dirX() * 6, 6, -f.dirZ() * 6]
        : [-legacySign(f) * 6, 6, 0]
    }
    this.match.forceRagdoll(f, imp, 1.5)
  }

  // --- toys ---
  spawnProp(kind, pos, opts) { return this.match.props.spawn(kind, pos, opts) }

  coins(pos, n = 12) {
    this.match.particles.burst('coins', pos, { n })
    this.match.game.audio.sfx('coins_burst')
  }

  particles(name, pos, opts) { this.match.particles.burst(name, pos, opts) }

  // --- presentation ---
  shake(mag) { this.match.game.events.emit('camera:shake', { mag: mag ?? 0.5 }) }
  slowmo(scale, seconds) { this.match.setSlowmo(scale, seconds) }
  caption(text) { this.match.cap(text) }
  announcer(line) { this.match.say(line) }
  sfx(name, opts) { this.match.game.audio.sfx(name, opts) }
  zoom(target, seconds = 0.5) { try { this.match.cam.punchIn(seconds) } catch { /* stub */ } }

  // Scripted cinematic camera beat (v2.0 §21 executions polish — additive to
  // the §6 surface). name: 'push' | 'orbit' | 'hold'; target defaults to the
  // foe. No-op when the camera is a stub (headless harnesses).
  cam(name, target) {
    try { this.match.cam.cineBeat?.(name, raw(target) || this._foe) } catch { /* stub */ }
  }

  // --- world access ---
  arena() { return this.match.arena }
  physics() { return this.match.physics }

  end() {
    if (this._ended) return
    this._ended = true
    this._frameCbs.length = 0
    // NOTE: _timers intentionally survive end() — see step().
    try { this._onEnd?.() } catch (e) { console.error('[combat] fx onEnd threw', e) }
  }
}
