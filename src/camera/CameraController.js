// CameraController — the invisible AAA ingredient. See CONTRACTS.md §18 (v2.0).
//
// v2.0: ONE camera style — a fixed-offset TRACKING third person on the tracked
// fighter (slot 0 by default; setTracked() for AI matches), free-roaming the
// whole stadium on the XZ plane. The v1.x classic/thirdperson style toggle and
// all settings.camera reads are GONE (setStyle remains as a harmless no-op so
// stale callers can't throw).
//
// Public API (contract):
//   new CameraController(camera, game)
//   cam.setFighters(f1, f2)      // Fighter instances (.pos Vector3 x/y/z, .def)
//                                //   kept for framing math; resets tracked -> f1
//   cam.setTracked(fighter)      // which fighter the boom follows (slot 0 default)
//   cam.getYaw()                 // world heading of the view direction on XZ, radians:
//                                //   forward = (Math.cos(yaw), Math.sin(yaw)) in (x, z).
//                                //   Camera-relative input: worldMove =
//                                //   fwdInput*(cos,sin)(yaw) + strafeInput*(cos,sin)(yaw+PI/2).
//                                //   Always finite. Combat consumes this.
//   cam.setBounds(b)             // { minX,maxX,minZ,maxZ, wallBounce?, floorY? }
//                                //   (minZ/maxZ default -5.5/5.5 per CONTRACTS §17)
//   cam.setOccluders(root)       // arena dressing root for camera->fighter fade
//   cam.update(dt)               // fixed-step 60 Hz; never NaN, never loses fighters
//   cam.shake(mag)               // trauma-based, additive, capped, decays
//   cam.kick(dirX, mag, dirZ=0)  // 2-3 frame directional shove -> decays into trauma
//   cam.punchIn(seconds)         // 3-6.5% FOV punch (amount scales with duration)
//   cam.koCinematic(target)      // slow dolly/orbit on KO/finisher, tracks ragdoll (3D)
//   cam.setMode('match'|'cinematic'|'replay'|'free')
//   cam.setOrbit(params)         // replay-mode orbit params
//   cam.setFree(params)          // free-mode manual pos/yaw/pitch
//   cam.dispose()
//
// Listens on game.events: 'camera:shake' {mag}, 'slowmo' {scale, seconds},
// 'fighter:hit' (self-wired directional kick), 'round:start' (cinematic ->
// match; round 1 runs a one-shot 2.2 s entrance dolly), 'resize'.
//
// Rig behavior (CONTRACTS §18):
// - Boom sits BEHIND the tracked character, opposite its movement direction,
//   with a soft yaw-follow: the boom azimuth is pulled toward "behind the
//   character's velocity" through a critically-damped spring PLUS a hard yaw
//   rate cap (~3 rad/s) so rapid strafing can never spin the view. Small
//   movements sit inside a deadzone (angular + speed), and a movement
//   CONSISTENCY gate (rapid strafe flip-flops cancel out in the smoothed
//   velocity vector) keeps direction flicks from steering at all — only
//   sustained motion swings the boom, always at the capped rate.
// - LOCK-ON BIAS: when the foe is within ~9 m (hysteresis ~9 in / ~10.8 out)
//   the yaw settles so the view looks over the player's shoulder AT the foe
//   (small shoulder offset, widening at point-blank range): player composed
//   lower-third foreground, foe centered with headroom. Boom length is the
//   smallest distance in the 5.2-8 band whose frustum holds that composition
//   (binary search on the exact projection math, mirroring all wall clamps).
// - Unlocked: distance ~6.2 (+ a touch with speed) inside the same band,
//   height ~2.4 above the character, pitch ~-12 degrees.
// - Free-roam anywhere: camera X and Z hard-clamp to arena bounds + slack on
//   ALL FOUR walls, camera Y never below the floor.
// - Shake / directional kick / FOV punch are projected into the CURRENT view
//   basis, comfort caps hold for the sum (offset <= ~0.28 m, roll <= 2 deg).
// - KO cinematic (full 3D orbit/dolly that tracks the ragdoll), replay orbit,
//   manual free mode and the round-1 entrance dolly are all preserved.
// - v2.1 §27: occlusion fade is sampled EVERY frame against BOTH fighters
//   with hold-timer hysteresis (no boundary strobing); crowds fade only when
//   genuinely between lens and fighter AND the camera is low, and only ever
//   to 0.25 opacity — a crowd can never vanish. settings.cameraLock=false
//   disables the lock-on framing bias (pure follow camera), live-read.
// - NaN firewall: a camera must never, ever explode.

import * as THREE from 'three'

const DEG = Math.PI / 180
const BASE_FOV = 45
const TAN_HALF_V = Math.tan((BASE_FOV / 2) * DEG)

// Critically damped spring (SmoothDamp). No overshoot, frame-rate independent.
class Spring {
  constructor(value = 0, smoothTime = 0.2) {
    this.v = value
    this.vel = 0
    this.smoothTime = smoothTime
  }

  snap(value) {
    if (Number.isFinite(value)) this.v = value
    this.vel = 0
    return this.v
  }

  to(target, dt, smoothTime) {
    if (!Number.isFinite(target)) return this.v
    const st = Math.max(1e-4, smoothTime ?? this.smoothTime)
    const omega = 2 / st
    const x = omega * dt
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    const orig = this.v
    const change = orig - target
    const temp = (this.vel + omega * change) * dt
    this.vel = (this.vel - omega * temp) * exp
    let out = target + (change + temp) * exp
    // Overshoot guard (keeps "critically damped" an actual promise).
    if ((target - orig > 0) === (out > target)) {
      out = target
      this.vel = 0
    }
    this.v = out
    return out
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Occlusion raycast target heights (fractions of fighter height):
// shins + chest + thighs + head, so tall multi-material props can't thread a
// torso-covering plinth between two rays.
const OCC_SAMPLE_FRACS = [0.25, 0.55, 0.75, 0.95]

export class CameraController {
  constructor(camera, game) {
    this.camera = camera
    this.game = game
    this.mode = 'match'

    this.fighters = [null, null]
    this._tracked = null // resolved against fighters each frame; null -> slot 0
    this.bounds = { minX: -9, maxX: 9, minZ: -5.5, maxZ: 5.5 }
    this.floorY = 0

    // Rig tunables (meters / seconds / radians). CONTRACTS §18 numbers.
    this.tune = {
      minDist: 5.2,         // boom band (auto)
      maxDist: 8,
      baseDist: 6.2,        // unlocked resting distance
      height: 2.4,          // boom height above the tracked character
      maxHeight: 3.6,       // ceiling for juggle/close lifts
      pitch: 12 * DEG,      // unlocked downward pitch (~-12 deg)
      lookAhead: 1.8,       // unlocked look point sits this far ahead
      chestK: 0.52,         // look targets sit at chest height
      headroom: 0.6,        // composed space above the foe's head
      foeBias: 0.62,        // lock-on look-at weight toward the foe
      foeHalfW: 0.6,        // lateral slack kept around the foe
      lockEnter: 9.2,       // lock-on bias engages inside this range (~9 m)
      lockExit: 10.8,       // ... and releases past this (hysteresis)
      shoulder: 0.21,       // over-the-shoulder yaw offset (rad, ~12 deg)
      shoulderClose: 0.5,   // extra shoulder at point-blank (foe clears the player)
      closeSepFar: 3.2,     // close-range blend starts here ...
      closeSepNear: 0.8,    // ... and saturates here
      yawRate: 3.0,         // HARD yaw rate cap (rad/s) — never spins wildly
      yawFollowGain: 2.6,   // soft pull of the yaw target toward "behind movement"
      yawDeadzone: 0.12,    // angular deadzone — micro strafes don't steer
      moveSpeedMin: 0.7,    // m/s below which movement never steers the yaw
      moveSpeedFull: 2.2,   // m/s at which the follow pull reaches full strength
      wallSlack: 2.2,       // boom may sit this far outside arena bounds, no more
      camFloor: 0.7,        // camera never below floorY + this
    }

    // Smoothed rig state. Pivot = tracked character (vertical slower — jumps
    // must not bob the horizon). Yaw values are CONTINUOUS (unwrapped);
    // wrapping happens on deltas only.
    this.px = new Spring(0, 0.13)
    this.py = new Spring(0, 0.26)
    this.pz = new Spring(0, 0.13)
    this.syaw = new Spring(Math.PI / 2, 0.22)   // boom azimuth A: cam = pivot + d*(cosA, ., sinA)
    this.sd = new Spring(6.2, 0.3)              // boom length
    this.sh = new Spring(2.4, 0.3)              // boom height
    this.slx = new Spring(0, 0.16)              // look-at point
    this.sly = new Spring(1.2, 0.24)
    this.slz = new Spring(0, 0.16)
    this.slock = new Spring(0, 0.3)             // lock-on blend 0..1
    this.sbias = new Spring(this.tune.foeBias, 0.4) // look bias (relaxes when unfittable)

    this._yawTarget = Math.PI / 2   // soft-followed target azimuth (continuous)
    this._yawApplied = Math.PI / 2  // rate-capped azimuth actually rendered
    this._locked = false
    this._shoulderSide = 1          // held while locked; re-picked on lock entry
    this._viewYaw = -Math.PI / 2    // getYaw() — heading of the rendered view dir
    this._vel = { x: 0, z: 0 }      // smoothed tracked-fighter velocity
    this._speedAvg = 0              // smoothed |instantaneous velocity| (consistency gate)
    this._prevTracked = null
    this._look = { x: 0, y: 1.2, z: 0 } // last applied look target (handoffs)

    // Trauma shake pool.
    this.trauma = 0
    this._shakeClock = 0

    // Directional hit-kick (2-3 frame shove along the hit dir, then trauma noise).
    this._kick = { left: 0, dur: 3 / 60, x: 0, y: 0, z: 0, mag: 0 }
    this._kickP = 0
    this._kickStamp = -1
    this._frame = 0

    // FOV punch (amount scales with requested duration; hard-capped).
    this._punchLeft = 0
    this._punchDur = 0.18
    this._punchAmt = 0.05

    // Round-1 entrance dolly (one-shot authored ease; null when inactive).
    this._entrance = null

    // Slow-mo awareness (shake keeps its real-time crunch during slowmo).
    this._slowmo = { comp: 1, left: 0 }

    // KO cinematic state (+ its own camera springs — it may chase past walls).
    this._cine = null
    this.cx = new Spring(0, 0.5)
    this.cy = new Spring(3, 0.45)
    this.cz = new Spring(9, 0.5)

    // Last-known-good fighter positions (never lose a fighter, never NaN).
    this._lastPos = [
      { x: -2.5, y: 0, z: 0 },
      { x: 2.5, y: 0, z: 0 },
    ]

    // Replay / free stubs (surface defined, minimal behavior).
    this.orbit = { center: { x: 0, y: 1.3, z: 0 }, angle: 0.6, height: 3.4, dist: 9, speed: 0.35 }
    this.free = { x: 0, y: 3, z: 11, yaw: 0, pitch: -0.12 }

    this._lastFov = 0
    this._lastAspect = 0
    this._warned = false

    // Occlusion fade: arena dressing root + faded-material cache.
    this._occRoot = null
    this._occRay = null
    this._occFaded = new Map() // material -> fade record (see _updateOcclusion)
    this._occV = new THREE.Vector3()
    this._occT = new THREE.Vector3()
    // Perf (§27 audit): cached occluder candidates + persistent scratch
    // buffers — the per-frame path allocates nothing in steady state.
    this._occCache = null
    this._occHitGroups = new Set()
    this._occHitMats = new Set()
    this._occHits = [] // reusable intersectObjects target array
    this._occBoxPt = new THREE.Vector3()

    this._offs = []
    const ev = game?.events
    if (ev?.on) {
      this._offs.push(ev.on('camera:shake', (p) => this.shake(p?.mag ?? 0.5)))
      this._offs.push(ev.on('slowmo', (p) => this._onSlowmo(p)))
      this._offs.push(ev.on('fighter:hit', (p) => this._onFighterHit(p)))
      this._offs.push(ev.on('round:start', (p) => this._onRoundStart(p)))
      this._offs.push(ev.on('resize', (p) => this._onResize(p)))
    }
  }

  // ---------------------------------------------------------------- public API

  setFighters(f1, f2) {
    this.fighters = [f1 || null, f2 || null]
    this._tracked = this.fighters[0] // default tracked = slot 0 (the player)
    this._prevTracked = null
    this._vel.x = 0
    this._vel.z = 0
    this._speedAvg = 0
    this._cine = null
    this.mode = 'match'
    this.trauma = 0
    this._punchLeft = 0
    this._kick.left = 0
    this._kick.mag = 0
    this._kickP = 0
    this._kickStamp = -1
    // Snap straight to correct framing — a match must open composed, not flying in.
    this._snapComposed()
  }

  // Which fighter the boom follows. Pass a Fighter already given to
  // setFighters (slot 0 or 1); anything else falls back to slot 0.
  setTracked(fighter) {
    const next = fighter === this.fighters[1] ? this.fighters[1]
      : (fighter === this.fighters[0] ? this.fighters[0] : this.fighters[0])
    if (next === this._tracked) return
    this._tracked = next
    this._prevTracked = null
    this._vel.x = 0
    this._vel.z = 0
    this._speedAvg = 0
    if (this.mode === 'match') this._seedFromCamera() // ease over, never cut
  }

  // World heading of the rendered view direction projected on XZ (radians).
  // forward = (cos(yaw), sin(yaw)) in world (x, z). Always finite.
  getYaw() {
    return Number.isFinite(this._viewYaw) ? this._viewYaw : -Math.PI / 2
  }

  setBounds(b) {
    if (!b) return
    const src = b.bounds && typeof b.bounds === 'object' ? b.bounds : b
    if (Number.isFinite(src.minX)) this.bounds.minX = src.minX
    if (Number.isFinite(src.maxX)) this.bounds.maxX = src.maxX
    if (Number.isFinite(src.minZ)) this.bounds.minZ = src.minZ
    if (Number.isFinite(src.maxZ)) this.bounds.maxZ = src.maxZ
    if (Number.isFinite(b.floorY)) this.floorY = b.floorY
    else if (Number.isFinite(src.floorY)) this.floorY = src.floorY
    if (this.bounds.minX > this.bounds.maxX) {
      const m = (this.bounds.minX + this.bounds.maxX) / 2
      this.bounds.minX = m - 1
      this.bounds.maxX = m + 1
    }
    if (this.bounds.minZ > this.bounds.maxZ) {
      const m = (this.bounds.minZ + this.bounds.maxZ) / 2
      this.bounds.minZ = m - 1
      this.bounds.maxZ = m + 1
    }
  }

  // Register the arena dressing root for camera->fighter occlusion fades.
  // Pass null to disarm (all faded materials restore immediately).
  setOccluders(root) {
    if (root === this._occRoot) return
    this._occRoot = root && root.isObject3D ? root : null
    this._occCache = null // rebuilt lazily on the next occlusion pass
    if (!this._occRoot) this._restoreOccluded()
  }

  setMode(mode) {
    if (mode !== 'match' && mode !== 'cinematic' && mode !== 'replay' && mode !== 'free') return
    if (mode !== 'cinematic') this._cine = null
    if (mode !== 'match') this._entrance = null // entrance never fights other modes
    const was = this.mode
    this.mode = mode
    // Returning to a match (post-cinematic/replay): seed the rig from wherever
    // the camera is right now so it eases home instead of snapping.
    if (mode === 'match' && was !== 'match') this._seedFromCamera()
  }

  // v2.0: single camera style. Kept as a no-op so any stale caller
  // (old settings plumbing) can't throw. Does nothing, reads nothing.
  setStyle() {}

  // Trauma-based shake: additive pool, hard cap, decays. mag ~0.2 (tap) .. ~1.5 (super).
  shake(mag) {
    if (!Number.isFinite(mag) || mag <= 0) return
    this.trauma = Math.min(1, this.trauma + Math.min(mag, 2) * 0.35)
  }

  // Directional hit-kick: a 2-3 frame camera shove ALONG the world hit
  // direction (XZ), projected onto the camera's right axis at render time so
  // the shove reads the same on screen whatever the boom azimuth is.
  // dirX/dirZ: any numbers — only the direction matters (dirZ optional).
  // mag: 0..1 (jab ~0.15-0.25, heavy ~0.5-0.6, super 1; hard-capped).
  // Idempotent per fixed frame — the strongest kick wins, magnitudes never
  // stack — so the self-wired 'fighter:hit' listener and a direct combat-side
  // call can coexist safely.
  kick(dirX, mag, dirZ = 0) {
    if (!Number.isFinite(mag) || mag <= 0) return
    const m = Math.min(mag, 1)
    const prev = this._kickStamp === this._frame ? this._kick.mag : 0
    if (m <= prev) return
    this._kickStamp = this._frame
    const k = this._kick
    k.mag = m
    k.dur = 3 / 60                       // 3 fixed frames of shove
    k.left = k.dur
    let dx = Number.isFinite(dirX) ? dirX : 1
    let dz = Number.isFinite(dirZ) ? dirZ : 0
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) { dx = 1; dz = 0 } else { dx /= len; dz /= len }
    k.x = dx * m * 0.26                  // stays inside the 0.28 m comfort cap
    k.z = dz * m * 0.26
    k.y = -m * 0.07                      // slight downward crunch
    this.shake((m - prev) * 0.55)        // hand the tail off to the trauma pool
  }

  // Hit-stop micro zoom: instant FOV punch, eased recovery over `seconds`.
  punchIn(seconds) {
    const s = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 1.5) : 0.18
    this._punchDur = s
    this._punchLeft = s
    this._punchAmt = clamp(0.03 + (s - 0.12) * 0.07, 0.03, 0.065)
  }

  // KO / finisher: slow 3D dolly + gentle orbit toward the flying ragdoll.
  // Keeps both fighters framed while it can; extreme launches zoom out
  // dramatically (distance driven by separation + flight speed). Returns to
  // match framing on 'round:start' (event handler in constructor).
  koCinematic(target) {
    this.mode = 'cinematic'
    this._entrance = null // the KO cinematic always wins over the entrance dolly
    const tgt = target || this.fighters[0] || null
    const tp = this._targetPos(tgt)
    // Start the orbit from wherever the camera already is (no cut) and drift.
    const cp = this.camera?.position
    let az0 = this._yawApplied
    if (cp && Number.isFinite(cp.x) && Number.isFinite(cp.z)) {
      const a = Math.atan2(cp.z - tp.z, cp.x - tp.x)
      if (Number.isFinite(a)) az0 = a
    }
    this._cine = {
      t: 0,
      target: tgt,
      dir: Math.random() < 0.5 ? -1 : 1,
      az0,
      prev: null,
      speed: 0,
    }
    // Seed the cinematic camera springs from the current pose.
    if (cp && Number.isFinite(cp.x) && Number.isFinite(cp.y) && Number.isFinite(cp.z)) {
      this.cx.snap(cp.x)
      this.cy.snap(cp.y)
      this.cz.snap(cp.z)
    } else {
      this.cx.snap(tp.x + 6)
      this.cy.snap(tp.y + 3)
      this.cz.snap(tp.z + 6)
    }
    this.punchIn(0.35)
  }

  // Scripted camera beat for finisher/execution scripts (v2.0 §21 polish).
  // name: 'push'  — low-angle push-in on the target (grabs/wind-ups),
  //       'orbit' — fast whip-orbit around the payoff hit,
  //       'hold'  — settle wide on the aftermath (drift freezes).
  // Retargets the running KO cinematic; starts one if a script fires a beat
  // before any cinematic is live. Unknown names are ignored.
  cineBeat(name, target) {
    if (name !== 'push' && name !== 'orbit' && name !== 'hold') return
    if (this.mode !== 'cinematic' || !this._cine) this.koCinematic(target)
    const c = this._cine
    if (!c) return
    if (target) {
      c.target = target
      c.prev = null // don't let the retarget delta read as flight speed
    }
    c.beat = { name, t0: c.t, dur: name === 'orbit' ? 1.0 : 1.2 }
    if (name === 'orbit') this.punchIn(0.3)
  }

  // Replay stub surface: merge orbit params ({center:{x,y,z}, angle, height, dist, speed}).
  setOrbit(params) {
    if (!params) return
    if (params.center) Object.assign(this.orbit.center, params.center)
    for (const k of ['angle', 'height', 'dist', 'speed']) {
      if (Number.isFinite(params[k])) this.orbit[k] = params[k]
    }
  }

  // Free stub surface: manual position + yaw/pitch (radians).
  setFree(params) {
    if (!params) return
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) {
      if (Number.isFinite(params[k])) this.free[k] = params[k]
    }
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60
    dt = Math.min(dt, 0.1)
    this._frame++

    // Shake clock compensates during slow-mo so impacts still *crunch* in real time.
    let shakeDt = dt
    if (this._slowmo.left > 0) {
      shakeDt = dt * this._slowmo.comp
      this._slowmo.left -= shakeDt
    }
    this._shakeClock += shakeDt
    this.trauma = Math.max(0, this.trauma - shakeDt * (1.15 + this.trauma * 0.9))
    if (this._punchLeft > 0) this._punchLeft = Math.max(0, this._punchLeft - shakeDt)
    // Kick strength is sampled BEFORE this frame's decay so the first rendered
    // frame carries the full shove (frames render at 1, 2/3, 1/3 of duration).
    this._kickP = this._kick.dur > 0 ? this._kick.left / this._kick.dur : 0
    if (this._kick.left > 0) this._kick.left = Math.max(0, this._kick.left - shakeDt)

    // Occlusion fade runs on last frame's pose (1-frame lag is invisible at
    // 60 Hz, and it keeps the raycast independent of the rig math below).
    this._updateOcclusion(dt)

    if (this.mode === 'free') { this._updateFree(); return }
    if (this.mode === 'replay') { this._updateReplay(dt); return }
    if (this.mode === 'cinematic' && this._cine) { this._updateCinematic(dt); return }

    this._updateMatch(dt)
  }

  dispose() {
    for (const off of this._offs) { try { off() } catch (_) { /* noop */ } }
    this._offs = []
    this._restoreOccluded()
    this._occRoot = null
    this._occCache = null
    this.fighters = [null, null]
    this._tracked = null
  }

  // ------------------------------------------------------------------ internals

  _onRoundStart(p) {
    if (this.mode === 'cinematic') this.setMode('match')
    if ((Number.isFinite(p?.round) ? p.round : 0) === 1) this._startEntrance()
    else this._entrance = null // rounds > 1 open straight on match framing
  }

  // Round-1 entrance: one-shot 2.2 s dolly from a wider (dist +45%), slightly
  // lower framing, easing into normal match framing through the existing
  // springs. The FIRST frame snaps to the wide pose so the round opens
  // composed, never flying in from nowhere.
  _startEntrance() {
    if (this.mode !== 'match') return // never fight the KO cinematic / dev modes
    this._entrance = { t: 0, dur: 2.2 }
    this._snapComposed()
  }

  _easeInOut(t) {
    t = clamp(t, 0, 1)
    return t * t * (3 - 2 * t)
  }

  // Self-wired directional kick: shove direction comes from the fighters'
  // relative positions (a hit pushes the victim away from the attacker) in
  // full XZ, magnitude scales with damage. A later combat pass may call
  // kick() directly with better data; kick() is idempotent per fixed frame,
  // so the double wiring is safe.
  _onFighterHit(p) {
    const dmg = Number.isFinite(p?.damage) ? p.damage : 5
    const mag = clamp(dmg * 0.042, 0.08, 1) // ~0.2 jab, ~0.55 heavy, 1 at 24+ dmg
    let dx = Number.isFinite(p?.dirX) ? p.dirX : 0
    let dz = Number.isFinite(p?.dirZ) ? p.dirZ : 0
    if (!dx && !dz) {
      let victim = p?.slot === 0 || p?.slot === 1 ? p.slot : -1
      if (victim === -1) {
        const ref = p?.target ?? p?.victim ?? p?.defender ?? null
        if (ref !== null && ref === this.fighters[0]) victim = 0
        else if (ref !== null && ref === this.fighters[1]) victim = 1
      }
      if (victim !== -1) {
        const v = this._fpos(victim)
        const a = this._fpos(victim === 0 ? 1 : 0)
        dx = v.x - a.x
        dz = v.z - a.z
      }
    }
    if (!dx && !dz) dx = 1
    this.kick(dx, mag, dz)
  }

  _onSlowmo(p) {
    const scale = Number.isFinite(p?.scale) ? Math.max(p.scale, 0.05) : 0.3
    const seconds = Number.isFinite(p?.seconds) ? p.seconds : 0.6
    this._slowmo.comp = clamp(1 / scale, 1, 2.5)
    this._slowmo.left = clamp(seconds, 0, 4)
  }

  _onResize(p) {
    const w = p?.w || innerWidth || 16
    const h = p?.h || innerHeight || 9
    if (this.camera?.isPerspectiveCamera && h > 0) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this._lastAspect = this.camera.aspect
    }
  }

  _aspect() {
    const a = this.camera?.aspect
    return Number.isFinite(a) && a > 0.1 ? a : 16 / 9
  }

  _trackedSlot() {
    return this._tracked && this._tracked === this.fighters[1] ? 1 : 0
  }

  // Robust fighter position read — never loses a fighter, never returns NaN.
  _fpos(slot) {
    const f = this.fighters[slot]
    const p = f?.pos || f?.position || f?.group?.position || null
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      this._lastPos[slot].x = p.x
      this._lastPos[slot].y = p.y
      this._lastPos[slot].z = Number.isFinite(p.z) ? p.z : 0
    }
    return this._lastPos[slot]
  }

  _fheight(slot) {
    const h = this.fighters[slot]?.def?.height
    return Number.isFinite(h) ? h : 2.1
  }

  _targetPos(target) {
    const p = target?.pos || target?.position || target?.mesh?.position ||
      target?.group?.position || (Number.isFinite(target?.x) ? target : null)
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return { x: p.x, y: p.y, z: Number.isFinite(p.z) ? p.z : 0 }
    }
    return this._fpos(0)
  }

  // ------------------------------------------------------------ match tracking

  _updateMatch(dt) {
    const t = this.tune
    const slot = this._trackedSlot()
    const foeSlot = slot === 0 ? 1 : 0
    const a = this._fpos(slot)
    const b = this._fpos(foeSlot)
    const h1 = this._fheight(slot)
    const h2 = this._fheight(foeSlot)
    const haveFoe = !!this.fighters[foeSlot]

    // Tracked-fighter velocity (smoothed fixed-frame deltas) for yaw-follow.
    // _speedAvg smooths the |instantaneous| speed; the ratio of |smoothed
    // vector| to it is a CONSISTENCY gate — rapid strafe reversals cancel in
    // the vector average (ratio -> 0, no steering) while a sustained turn
    // keeps ratio ~1 and swings the boom at the capped rate.
    if (this._prevTracked && dt > 0) {
      const vx = (a.x - this._prevTracked.x) / dt
      const vz = (a.z - this._prevTracked.z) / dt
      if (Number.isFinite(vx) && Number.isFinite(vz)) {
        const cvx = clamp(vx, -40, 40)
        const cvz = clamp(vz, -40, 40)
        this._vel.x = lerp(this._vel.x, cvx, 0.18)
        this._vel.z = lerp(this._vel.z, cvz, 0.18)
        this._speedAvg = lerp(this._speedAvg, Math.hypot(cvx, cvz), 0.18)
      }
    }
    this._prevTracked = { x: a.x, z: a.z }
    const speed = Math.hypot(this._vel.x, this._vel.z)
    const steadyK = this._speedAvg > 0.3 ? sstep(0.55, 0.85, speed / this._speedAvg) : 0

    // Lock-on hysteresis (~9 m in / ~10.8 m out). §27: settings.cameraLock
    // false = pure follow camera, no lock-on framing bias (live-read so the
    // Settings toggle applies mid-match; default true).
    let lockAllowed = true
    try { lockAllowed = this.game?.save?.get?.('settings.cameraLock', true) !== false } catch (e) { /* default on */ }
    const foeDX = b.x - a.x
    const foeDZ = b.z - a.z
    const foeDist = Math.hypot(foeDX, foeDZ)
    if (!lockAllowed) {
      this._locked = false
    } else if (haveFoe) {
      if (!this._locked && foeDist < t.lockEnter) {
        this._locked = true
        // Pick the shoulder side that needs the smaller swing from here.
        const behindFoe = Math.atan2(foeDZ, foeDX) + Math.PI
        const off = wrapPi(this._yawApplied - behindFoe)
        this._shoulderSide = off >= 0 ? 1 : -1
      } else if (this._locked && foeDist > t.lockExit) {
        this._locked = false
      }
    } else {
      this._locked = false
    }
    const lockW = this.slock.to(this._locked ? 1 : 0, dt)

    // Close-range blend widens the shoulder so the foe clears the player.
    const closeK = sstep(t.closeSepFar, t.closeSepNear, foeDist) // 0 far -> 1 point-blank
    const shoulder = (t.shoulder + t.shoulderClose * closeK) * this._shoulderSide

    // --- Yaw target -----------------------------------------------------------
    // Soft follow: pull the target toward "behind the movement direction".
    // Deadzones: below moveSpeedMin nothing steers; tiny angular deltas are
    // ignored; inconsistent movement (rapid strafe flip-flops) is gated out
    // by steadyK. All gains are smooth so the pull can't chatter, and the
    // rate cap below bounds the swing whatever the gains say.
    if (speed > t.moveSpeedMin && steadyK > 0) {
      const wantA = Math.atan2(this._vel.z, this._vel.x) + Math.PI // behind movement
      const d = wrapPi(wantA - this._yawTarget)
      const deadK = sstep(t.yawDeadzone, t.yawDeadzone * 3, Math.abs(d))
      const speedK = sstep(t.moveSpeedMin, t.moveSpeedFull, speed)
      const g = Math.min(1, t.yawFollowGain * dt) * deadK * speedK * steadyK * (1 - lockW * 0.85)
      this._yawTarget += d * g
    }
    // Lock-on bias: settle behind the player, looking at the foe over the shoulder.
    if (lockW > 0.001 && foeDist > 0.05) {
      const lockA = Math.atan2(foeDZ, foeDX) + Math.PI + shoulder
      const d = wrapPi(lockA - this._yawTarget)
      this._yawTarget += d * Math.min(1, 6 * dt) * lockW
    }
    this._yawTarget = wrapPi(this._yawTarget)

    // Spring toward the target (shortest path), then HARD rate cap.
    this.syaw.to(this.syaw.v + wrapPi(this._yawTarget - this.syaw.v), dt)
    let yaw = this.syaw.v
    const maxStep = t.yawRate * dt
    const step = wrapPi(yaw - this._yawApplied)
    if (step > maxStep) yaw = this._yawApplied + maxStep
    else if (step < -maxStep) yaw = this._yawApplied - maxStep
    yaw = wrapPi(yaw)
    this._yawApplied = yaw
    this.syaw.v = yaw // keep the spring honest about what actually rendered

    // --- Pivot ---------------------------------------------------------------
    this.px.to(a.x, dt)
    this.pz.to(a.z, dt)
    this.py.to(Math.max(a.y, this.floorY), dt)

    // --- Height --------------------------------------------------------------
    // ~2.4 above the character; lifts a touch at point-blank (drops the player
    // lower in frame) and with an airborne foe (juggles stay framed).
    const juggleLift = haveFoe ? clamp(b.y - a.y, 0, 3) * 0.28 * lockW : 0
    let hTarget = clamp(t.height + closeK * 0.3 * lockW + juggleLift, t.height, t.maxHeight)

    // --- Look target ---------------------------------------------------------
    // Unlocked: a point ahead of the character along the view direction, set so
    // the pitch lands near -12°. Locked: player/foe blend, foe-weighted (player
    // lower-third, foe composed) at chest heights. Blend by lockW.
    const vyaw = yaw + Math.PI // view heading
    const fdx = Math.cos(vyaw)
    const fdz = Math.sin(vyaw)
    const freeLX = a.x + fdx * t.lookAhead
    const freeLZ = a.z + fdz * t.lookAhead
    const freeLY = Math.max(
      (this.py.v + hTarget) - Math.tan(t.pitch) * (this.sd.v + t.lookAhead),
      this.floorY + 0.4,
    )
    // Look-bias relax: if even the max boom can't hold the foe-starred look,
    // relax toward the true midpoint — centering costs less than cropping.
    const bias = this.sbias.v
    const lockLX = a.x * (1 - bias) + b.x * bias
    const lockLZ = a.z * (1 - bias) + b.z * bias
    const lockLY = Math.max(
      (a.y + h1 * t.chestK) * (1 - bias) + (b.y + h2 * t.chestK) * bias,
      this.floorY + 0.5,
    )
    const lookX = lerp(freeLX, lockLX, lockW)
    const lookY = lerp(freeLY, lockLY, lockW)
    const lookZ = lerp(freeLZ, lockLZ, lockW)
    this.slx.to(lookX, dt)
    this.sly.to(lookY, dt)
    this.slz.to(lookZ, dt)

    // --- Boom length ---------------------------------------------------------
    let dTarget
    if (lockW > 0.5 && haveFoe) {
      const probe = {
        x: a.x * (1 - t.foeBias) + b.x * t.foeBias,
        y: Math.max((a.y + h1 * t.chestK) * (1 - t.foeBias) + (b.y + h2 * t.chestK) * t.foeBias, this.floorY + 0.5),
        z: a.z * (1 - t.foeBias) + b.z * t.foeBias,
      }
      const wide = this._fits(t.maxDist, yaw, this.sh.v, a, b, h1, h2, probe.x, probe.y, probe.z)
      this.sbias.to(wide ? t.foeBias : 0.5, dt)
      dTarget = this._fitDistance(yaw, this.sh.v, a, b, h1, h2)
    } else {
      this.sbias.to(t.foeBias, dt)
      dTarget = clamp(t.baseDist + speed * 0.12, t.minDist, t.maxDist)
    }

    // Round-1 entrance: wide-and-low ease into the home pose.
    let distCeil = t.maxDist
    const e = this._entrance
    if (e) {
      e.t += dt
      if (e.t >= e.dur) this._entrance = null
      else {
        const k = 1 - this._easeInOut(e.t / e.dur)
        dTarget *= 1 + 0.5 * k
        distCeil = t.maxDist * (1 + 0.55 * k)
        hTarget = Math.max(hTarget - 0.3 * k, 1.7)
      }
    }
    this.sh.to(hTarget, dt)
    this.sd.to(clamp(dTarget, t.minDist, distCeil), dt)

    // --- Place, clamp, decorate ---------------------------------------------
    const camX = this.px.v + Math.cos(yaw) * this.sd.v
    const camZ = this.pz.v + Math.sin(yaw) * this.sd.v
    const camY = this.py.v + this.sh.v
    this._applyPose(camX, camY, camZ, this.slx.v, this.sly.v, this.slz.v, true)
  }

  // Smallest boom length in [minDist, maxDist] whose frustum holds the lock-on
  // composition (foe fully composed + headroom, player head/chest framed).
  // Fit improves monotonically with distance, so a short binary search is
  // exact. Mirrors every hard clamp _applyPose will impose.
  _fitDistance(yaw, h, a, b, h1, h2) {
    const t = this.tune
    const lx = this.slx.v
    const ly = this.sly.v
    const lz = this.slz.v
    if (this._fits(t.minDist, yaw, h, a, b, h1, h2, lx, ly, lz)) return t.minDist
    if (!this._fits(t.maxDist, yaw, h, a, b, h1, h2, lx, ly, lz)) return t.maxDist
    let lo = t.minDist
    let hi = t.maxDist
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2
      if (this._fits(mid, yaw, h, a, b, h1, h2, lx, ly, lz)) hi = mid
      else lo = mid
    }
    return hi
  }

  _fits(d, yaw, h, a, b, h1, h2, lx, ly, lz) {
    const t = this.tune
    const bd = this.bounds
    // Mirror _applyPose's hard clamps EXACTLY — the fit must judge the pose
    // that will actually render (a wall-clamped boom frames very differently).
    const cx = clamp(this.px.v + Math.cos(yaw) * d, bd.minX - t.wallSlack, bd.maxX + t.wallSlack)
    const cz = clamp(this.pz.v + Math.sin(yaw) * d, bd.minZ - t.wallSlack, bd.maxZ + t.wallSlack)
    const cy = Math.max(this.py.v + h, this.floorY + t.camFloor)

    // View basis (up = world Y; the rig never rolls outside shake garnish).
    let fx = lx - cx
    let fy = ly - cy
    let fz = lz - cz
    const fl = Math.hypot(fx, fy, fz) || 1
    fx /= fl; fy /= fl; fz /= fl
    let rx = -fz
    let rz = fx
    const rl = Math.hypot(rx, rz) || 1
    rx /= rl; rz /= rl
    const ux = -rz * fy
    const uy = rz * fx - rx * fz
    const uz = rx * fy

    const tanH = TAN_HALF_V * this._aspect()
    const inView = (X, Y, Z, mH, mV) => {
      const vx = X - cx
      const vy = Y - cy
      const vz = Z - cz
      const z = vx * fx + vy * fy + vz * fz
      if (z < 0.5) return false
      const x = vx * rx + vz * rz
      const y = vx * ux + vy * uy + vz * uz
      return Math.abs(x) <= z * tanH * (1 - mH) && Math.abs(y) <= z * TAN_HALF_V * (1 - mV)
    }

    // Foe: head + headroom, feet, and lateral chest extents (perpendicular to
    // the view) — composed, centered.
    const midY = b.y + h2 * 0.5
    const w = t.foeHalfW
    if (!inView(b.x, b.y + h2 + t.headroom, b.z, 0.12, 0.10)) return false
    if (!inView(b.x, Math.max(b.y, this.floorY) + 0.05, b.z, 0.12, 0.06)) return false
    if (!inView(b.x - rx * w, midY, b.z - rz * w, 0.10, 0.05)) return false
    if (!inView(b.x + rx * w, midY, b.z + rz * w, 0.10, 0.05)) return false
    // Player: head and chest always framed (foreground may hug the frame edges).
    if (!inView(a.x, a.y + h1 + 0.1, a.z, 0.02, 0.02)) return false
    if (!inView(a.x, a.y + h1 * 0.5, a.z, 0.02, 0.02)) return false
    return true
  }

  // ------------------------------------------------------------- KO cinematic

  _updateCinematic(dt) {
    const c = this._cine
    c.t += dt

    const tp = this._targetPos(c.target)
    const otherSlot = c.target === this.fighters[1] ? 0 : 1
    const op = this._fpos(otherSlot)

    // Flight speed (smoothed, 3D) for dramatic zoom-out on extreme launches.
    if (c.prev && dt > 0) {
      const s = Math.hypot(
        (tp.x - c.prev.x) / dt,
        (tp.y - c.prev.y) / dt,
        (tp.z - c.prev.z) / dt,
      )
      if (Number.isFinite(s)) c.speed = lerp(c.speed, Math.min(s, 90), 0.25)
    }
    c.prev = { x: tp.x, y: tp.y, z: tp.z }

    const sep = Math.hypot(tp.x - op.x, tp.y - op.y, tp.z - op.z)
    // Keep both framed while separation is sane; drift onto the flyer when it explodes.
    const w = clamp((sep - 14) / 18, 0, 0.35)
    const bias = 0.62 + w
    const lx = tp.x * bias + op.x * (1 - bias)
    const lz = tp.z * bias + op.z * (1 - bias)
    const ly = Math.max(tp.y * 0.65 + op.y * 0.35 + 0.7, this.floorY + 0.9)

    // Scripted beat modifiers (cineBeat): eased 0..1 over the beat's duration.
    // 'push' pulls the boom in and drops it low, 'orbit' adds a decaying whip
    // of extra azimuth, 'hold' freezes the drift and settles slightly wide.
    let distMul = 1
    let lowK = 0
    let driftK = 1
    if (c.beat) {
      const b = c.beat
      const k = clamp((c.t - b.t0) / b.dur, 0, 1)
      const e = k * k * (3 - 2 * k)
      if (b.name === 'push') { distMul = 1 - 0.42 * e; lowK = e; driftK = 1 - 0.6 * e }
      else if (b.name === 'orbit') { c.azX = (c.azX || 0) + c.dir * dt * 1.7 * (1 - e) }
      else if (b.name === 'hold') { distMul = 1 + 0.16 * e; driftK = 1 - e }
    }

    // Distance: fit-ish base from separation, dolly curve, speed zoom, caps.
    const tanHalfH = TAN_HALF_V * this._aspect()
    const fit = Math.max(
      6.8,
      (sep / 2 + 1.3) / tanHalfH,
      (Math.max(tp.y, op.y) + 2.8 - ly) / TAN_HALF_V,
    )
    const dolly = 0.9 - 0.14 * Math.sin(Math.min(c.t / 1.4, 1) * Math.PI)
      + 0.06 * clamp((c.t - 1.4) / 1.5, 0, 1)
    const sepK = clamp(sep / 9, 0.25, 1)
    const speedZoom = clamp((c.speed - 8) * 0.35, 0, 26) * sepK
    const maxDist = clamp(10 + sep * 2.2, 10, 48)
    const dist = clamp((fit * dolly + speedZoom) * distMul, this.tune.minDist, maxDist)

    // Gentle orbit drift around the look point, from where the camera started
    // (accumulated so beats can freeze it without yawing back), plus any whip.
    c.drift = Math.min((c.drift ?? 0) + 0.22 * dt * driftK, 0.5)
    const az = c.az0 + c.dir * c.drift + (c.azX || 0)

    const dx = lx + Math.cos(az) * dist
    const dyv = Math.max(ly + dist * (0.2 - 0.16 * lowK) - 0.55 * lowK, this.floorY + 0.8)
    const dz = lz + Math.sin(az) * dist

    // Smooth through the cinematic springs (no wall clamps — launches may be
    // chased past the arena), then the shared garnish/firewall.
    this.cx.to(dx, dt)
    this.cy.to(dyv, dt)
    this.cz.to(dz, dt)
    this.slx.to(lx, dt, 0.35)
    this.sly.to(ly, dt, 0.35)
    this.slz.to(lz, dt, 0.35)
    this._applyPose(this.cx.v, this.cy.v, this.cz.v, this.slx.v, this.sly.v, this.slz.v, false)
  }

  // -------------------------------------------------------- pose + garnish

  // Place + orient the camera, clamp (match mode), decorate with trauma shake,
  // directional kick and FOV punch — all projected into the CURRENT view
  // basis, comfort caps holding for the SUM — then the NaN firewall.
  _applyPose(camX, camY, camZ, lookX, lookY, lookZ, clampWalls) {
    const cam = this.camera
    if (!cam) return
    const t = this.tune
    const bd = this.bounds

    if (clampWalls) {
      camX = clamp(camX, bd.minX - t.wallSlack, bd.maxX + t.wallSlack)
      camZ = clamp(camZ, bd.minZ - t.wallSlack, bd.maxZ + t.wallSlack)
    }
    camY = Math.max(camY, this.floorY + t.camFloor)

    // View basis (up = world Y).
    let fx = lookX - camX
    let fy = lookY - camY
    let fz = lookZ - camZ
    const fl = Math.hypot(fx, fy, fz) || 1
    fx /= fl; fy /= fl; fz /= fl
    let rx = -fz
    let rz = fx
    const rl = Math.hypot(rx, rz) || 1
    rx /= rl; rz /= rl
    let ux = -rz * fy
    let uy = rz * fx - rx * fz
    let uz = rx * fy

    // Trauma shake: perlin-ish layered sines, scaled by trauma², comfort-capped.
    const tr2 = this.trauma * this.trauma
    let so = 0 // along camera right
    let su = 0 // along camera up
    let roll = 0
    if (tr2 > 0.0001) {
      const ck = this._shakeClock
      so = this._noise(ck, 0.0) * tr2 * 0.28
      su = this._noise(ck, 7.31) * tr2 * 0.22
      roll = this._noise(ck, 13.7) * tr2 * (2 * DEG) // hard cap: 2 degrees
    }
    // Directional hit-kick: world XZ shove projected onto the camera's right
    // axis so it reads along the same screen direction whatever the yaw is.
    const kp = this._kickP || 0
    if (kp > 0) {
      so += (this._kick.x * rx + this._kick.z * rz) * kp * kp
      su += this._kick.y * kp * kp
    }
    so = clamp(so, -0.28, 0.28) // comfort caps hold for the SUM
    su = clamp(su, -0.24, 0.24)

    // FOV punch (hit stop): instant dip, eased recovery. Framing math uses the
    // base FOV, so the punch is pure garnish and can never destabilize the fit.
    let fov = BASE_FOV
    if (this._punchLeft > 0 && this._punchDur > 0) {
      const p = this._punchLeft / this._punchDur
      fov = BASE_FOV * (1 - this._punchAmt * Math.pow(p, 1.5))
    }

    // NaN firewall — a camera must never, ever explode.
    if (!Number.isFinite(camX) || !Number.isFinite(camY) || !Number.isFinite(camZ) ||
        !Number.isFinite(lookX) || !Number.isFinite(lookY) || !Number.isFinite(lookZ) ||
        !Number.isFinite(fov) || !Number.isFinite(so) || !Number.isFinite(su)) {
      if (!this._warned) { this._warned = true; console.warn('[camera] non-finite pose, resetting') }
      this._reset()
      camX = this.px.v + Math.cos(this._yawApplied) * this.sd.v
      camZ = this.pz.v + Math.sin(this._yawApplied) * this.sd.v
      camY = Math.max(this.py.v + this.sh.v, this.floorY + t.camFloor)
      lookX = this.slx.v
      lookY = this.sly.v
      lookZ = this.slz.v
      fov = BASE_FOV
      so = 0; su = 0; roll = 0
      rx = 1; rz = 0; ux = 0; uy = 1; uz = 0
      fx = lookX - camX; fz = lookZ - camZ
    }

    this._look.x = lookX
    this._look.y = lookY
    this._look.z = lookZ
    // getYaw(): heading of the rendered view direction on XZ.
    if (Math.hypot(fx, fz) > 1e-4) {
      const vy = Math.atan2(fz, fx)
      if (Number.isFinite(vy)) this._viewYaw = vy
    }

    cam.position.set(camX + rx * so + ux * su, camY + uy * su, camZ + rz * so + uz * su)
    cam.lookAt(
      lookX + (rx * so + ux * su) * 1.35,
      lookY + uy * su * 1.35,
      lookZ + (rz * so + uz * su) * 1.35,
    )
    if (roll) cam.rotateZ(roll)

    if (cam.isPerspectiveCamera) {
      const aspect = this._aspect()
      if (Math.abs(fov - this._lastFov) > 1e-4 || Math.abs(aspect - this._lastAspect) > 1e-4) {
        cam.fov = fov
        cam.aspect = aspect
        cam.updateProjectionMatrix()
        this._lastFov = fov
        this._lastAspect = aspect
      }
    }
  }

  // Snap the rig straight onto its composed steady-state pose (match open /
  // entrance arm) and render one frame of it.
  _snapComposed() {
    const t = this.tune
    const slot = this._trackedSlot()
    const foeSlot = slot === 0 ? 1 : 0
    const a = this._fpos(slot)
    const b = this._fpos(foeSlot)
    const h1 = this._fheight(slot)
    const h2 = this._fheight(foeSlot)
    const haveFoe = !!this.fighters[foeSlot]

    this.px.snap(a.x)
    this.pz.snap(a.z)
    this.py.snap(Math.max(a.y, this.floorY))

    const foeDX = b.x - a.x
    const foeDZ = b.z - a.z
    const foeDist = Math.hypot(foeDX, foeDZ)
    this._locked = haveFoe && foeDist < t.lockEnter
    this.slock.snap(this._locked ? 1 : 0)
    this._shoulderSide = 1
    this.sbias.snap(t.foeBias)

    let yaw
    if (this._locked && foeDist > 0.05) {
      const closeK = sstep(t.closeSepFar, t.closeSepNear, foeDist)
      yaw = wrapPi(Math.atan2(foeDZ, foeDX) + Math.PI + (t.shoulder + t.shoulderClose * closeK))
    } else {
      yaw = Math.PI / 2 // default: camera on +Z, looking -Z (the classic vista)
    }
    this.syaw.snap(yaw)
    this._yawTarget = yaw
    this._yawApplied = yaw

    const closeK = this._locked ? sstep(t.closeSepFar, t.closeSepNear, foeDist) : 0
    const juggleLift = this._locked ? clamp(b.y - a.y, 0, 3) * 0.28 : 0
    const h = clamp(t.height + closeK * 0.3 + juggleLift, t.height, t.maxHeight)
    this.sh.snap(h)

    if (this._locked) {
      this.slx.snap(a.x * (1 - t.foeBias) + b.x * t.foeBias)
      this.slz.snap(a.z * (1 - t.foeBias) + b.z * t.foeBias)
      this.sly.snap(Math.max(
        (a.y + h1 * t.chestK) * (1 - t.foeBias) + (b.y + h2 * t.chestK) * t.foeBias,
        this.floorY + 0.5,
      ))
      let d = this._fitDistance(yaw, h, a, b, h1, h2)
      if (this._entrance) d = Math.min(d * 1.5, t.maxDist * 1.55)
      this.sd.snap(d)
    } else {
      const vyaw = yaw + Math.PI
      let d = t.baseDist
      if (this._entrance) d = Math.min(d * 1.5, t.maxDist * 1.55)
      this.sd.snap(d)
      this.slx.snap(a.x + Math.cos(vyaw) * t.lookAhead)
      this.slz.snap(a.z + Math.sin(vyaw) * t.lookAhead)
      this.sly.snap(Math.max(
        (this.py.v + h) - Math.tan(t.pitch) * (d + t.lookAhead),
        this.floorY + 0.4,
      ))
    }
    this._applyPose(
      this.px.v + Math.cos(yaw) * this.sd.v,
      this.py.v + this.sh.v,
      this.pz.v + Math.sin(yaw) * this.sd.v,
      this.slx.v, this.sly.v, this.slz.v,
      true,
    )
  }

  // Seed the match rig from the camera's current pose (cinematic/replay return,
  // tracked-fighter switch) so the springs — yaw rate cap included — ease home
  // from here instead of cutting.
  _seedFromCamera() {
    const t = this.tune
    const slot = this._trackedSlot()
    const a = this._fpos(slot)
    this.px.snap(a.x)
    this.pz.snap(a.z)
    this.py.snap(Math.max(a.y, this.floorY))
    const p = this.camera?.position
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      const dx = p.x - a.x
      const dz = p.z - a.z
      const horiz = Math.hypot(dx, dz)
      const yaw = horiz > 0.2 ? Math.atan2(dz, dx) : Math.PI / 2
      this.syaw.snap(yaw)
      this._yawTarget = yaw
      this._yawApplied = yaw
      this.sd.snap(clamp(horiz, t.minDist, t.maxDist + 10))
      this.sh.snap(clamp(p.y - this.py.v, 1.2, 6))
    } else {
      this.syaw.snap(Math.PI / 2)
      this._yawTarget = Math.PI / 2
      this._yawApplied = Math.PI / 2
      this.sd.snap(t.baseDist)
      this.sh.snap(t.height)
    }
    this.slx.snap(Number.isFinite(this._look.x) ? this._look.x : a.x)
    this.sly.snap(Math.max(Number.isFinite(this._look.y) ? this._look.y : 1.2, this.floorY + 0.4))
    this.slz.snap(Number.isFinite(this._look.z) ? this._look.z : a.z)
  }

  // NaN-firewall reset: rebuild the whole rig on last-known-good positions.
  _reset() {
    const t = this.tune
    const slot = this._trackedSlot()
    const a = this._lastPos[slot]
    const ax = Number.isFinite(a?.x) ? a.x : 0
    const az = Number.isFinite(a?.z) ? a.z : 0
    this.px.snap(ax)
    this.pz.snap(az)
    this.py.snap(this.floorY)
    this.syaw.snap(Math.PI / 2)
    this._yawTarget = Math.PI / 2
    this._yawApplied = Math.PI / 2
    this.sd.snap(t.baseDist)
    this.sh.snap(t.height)
    this.slock.snap(0)
    this._locked = false
    this.sbias.snap(t.foeBias)
    this.slx.snap(ax)
    this.sly.snap(this.floorY + 1.2)
    this.slz.snap(az - t.lookAhead)
    this.cx.snap(ax)
    this.cy.snap(this.floorY + 3)
    this.cz.snap(az + t.baseDist)
    this._vel.x = 0
    this._vel.z = 0
    this._prevTracked = null
    this._speedAvg = 0
    this._viewYaw = -Math.PI / 2
  }

  // ------------------------------------------------- occlusion fade

  // v2.1 §27: sampled EVERY frame, camera -> BOTH fighters (4 heights each —
  // shins/chest/thighs/head). Any dressing a ray genuinely passes through
  // fades smoothly to ~0.25 opacity; when it stops occluding it restores
  // through a short HOLD (hysteresis, ~0.22 s) plus an eased ramp, so a prop
  // sitting right on the boundary can never strobe. Materials are cached with
  // their original opacity/transparent/depthWrite and restored EXACTLY once
  // the ramp lands — shared materials restore once.
  //
  // Crowds (userData.isCrowd, set by ArenaBase's builders + auto-tag pass)
  // are special: per-instance fading is impractical, and a whole vanishing
  // crowd is the exact bug §27 bans. A crowd fades ONLY when a ray genuinely
  // passes through its instances AND the camera sits low (below floorY +
  // 2.1 m — the normal boom rides at +2.4 and never threads the stands), and
  // even then only to 0.25 opacity, never invisible. The fade unit is the
  // crowd group itself, never a parent stands/dressing group.
  //
  // Perf (§27 audit): the naive version fired 8 recursive raycasts per frame
  // against the ENTIRE dressing graph — crowd InstancedMesh included — and
  // allocated Sets/arrays every pass. The occluder set is now CACHED per
  // root: one entry per top-level prop group holding a flat non-crowd mesh
  // list plus a padded world AABB used as a ray-segment prefilter, with
  // topmost crowd groups kept in a separate list that is raycast ONLY when
  // the camera is genuinely low (the camLow gate — the normal boom never
  // threads the stands, so the crowd costs nothing in the common case).
  // Entries refresh round-robin (one per frame) so movers/breakables stay
  // honest without re-traversing the graph; scratch Sets/arrays persist
  // across frames — the steady-state path allocates nothing.

  _occIsCrowdNode(node) {
    return !!(node.userData?.isCrowd || /crowd/i.test(node.name || ''))
  }

  // Rebuild a prop entry's flat mesh list (crowd subtrees excluded) and its
  // padded world AABB. An entry whose box can't be computed keeps empty=true
  // and skips the prefilter (always raycast — correctness over thrift).
  _occRefreshEntry(entry) {
    entry.meshes.length = 0
    const scan = (node, inCrowd) => {
      const crowd = inCrowd || this._occIsCrowdNode(node)
      if (!crowd && (node.isMesh || node.isInstancedMesh)) entry.meshes.push(node)
      for (const c of node.children) scan(c, crowd)
    }
    scan(entry.obj, false)
    try {
      entry.box.setFromObject(entry.obj)
      entry.box.expandByScalar(0.5) // slack for drift between refreshes
      entry.empty = entry.box.isEmpty()
    } catch { entry.empty = true }
  }

  _occCandidates() {
    const root = this._occRoot
    let cache = this._occCache
    // Rebuild on root swap or top-level add/remove (breaks, hazard spawns).
    if (!cache || cache.root !== root || cache.childCount !== root.children.length) {
      cache = this._occCache = { root, childCount: root.children.length, props: [], crowds: [], cursor: 0 }
      for (const child of root.children) {
        const entry = { obj: child, meshes: [], box: new THREE.Box3(), empty: true }
        this._occRefreshEntry(entry)
        if (entry.meshes.length) cache.props.push(entry)
        // Topmost crowd groups anywhere under this child fade as THEMSELVES
        // (§27: never a parent stands/dressing group).
        const scanCrowd = (node, inCrowd) => {
          const crowd = this._occIsCrowdNode(node)
          if (crowd && !inCrowd) {
            const ce = { node, meshes: [] }
            node.traverse((o) => { if (o.isMesh || o.isInstancedMesh) ce.meshes.push(o) })
            if (ce.meshes.length) cache.crowds.push(ce)
          }
          for (const c of node.children) scanCrowd(c, inCrowd || crowd)
        }
        scanCrowd(child, false)
      }
    } else if (cache.props.length) {
      cache.cursor = (cache.cursor + 1) % cache.props.length
      this._occRefreshEntry(cache.props[cache.cursor])
    }
    return cache
  }

  _updateOcclusion(dt) {
    const root = this._occRoot
    const cam = this.camera
    if (!root || !cam) return
    if (this.mode === 'free') { this._restoreOccluded(); return }
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60
    if (!this._occRay) this._occRay = new THREE.Raycaster()
    const ray = this._occRay
    const cache = this._occCandidates()
    const camLow = Number.isFinite(cam.position.y) && cam.position.y < this.floorY + 2.1
    const hitGroups = this._occHitGroups
    hitGroups.clear()
    const inters = this._occHits
    for (let slot = 0; slot < 2; slot++) {
      if (!this.fighters[slot]) continue
      const p = this._fpos(slot)
      const h = this._fheight(slot)
      for (const frac of OCC_SAMPLE_FRACS) {
        this._occT.set(p.x, p.y + h * frac, p.z)
        this._occV.copy(this._occT).sub(cam.position)
        const dist = this._occV.length()
        if (dist < 0.75) continue
        this._occV.multiplyScalar(1 / dist)
        ray.set(cam.position, this._occV)
        ray.near = 0.01
        ray.far = dist - 0.55 // stop short of the fighter — never fade past it
        for (const entry of cache.props) {
          if (!entry.meshes.length) continue
          if (!entry.empty) {
            // segment prefilter: the padded AABB must sit on this ray within range
            const pt = ray.ray.intersectBox(entry.box, this._occBoxPt)
            if (!pt || pt.distanceTo(cam.position) > ray.far) continue
          }
          inters.length = 0
          try { ray.intersectObjects(entry.meshes, false, inters) } catch { continue }
          if (inters.length) hitGroups.add(entry.obj)
        }
        // Crowd: per-instance raycast is the expensive bit — pay it only when
        // the camera is low enough that a crowd fade is even legal (§27).
        if (camLow) {
          for (const ce of cache.crowds) {
            inters.length = 0
            try { ray.intersectObjects(ce.meshes, false, inters) } catch { continue }
            if (inters.length) hitGroups.add(ce.node)
          }
        }
      }
    }
    const hits = this._occHitMats
    hits.clear()
    for (const g of hitGroups) {
      g.traverse((o) => {
        const m = o.material
        if (!m) return
        if (Array.isArray(m)) { for (const mm of m) hits.add(mm) } else hits.add(m)
      })
    }
    // Fade records: { opacity/transparent/depthWrite: originals, cur, hold }.
    for (const m of hits) {
      if (this._occFaded.has(m)) continue
      this._occFaded.set(m, {
        opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
        transparent: m.transparent,
        depthWrite: m.depthWrite,
        cur: Number.isFinite(m.opacity) ? m.opacity : 1,
        hold: 0,
      })
      m.transparent = true
      m.depthWrite = false
    }
    for (const [m, rec] of this._occFaded) {
      if (hits.has(m)) rec.hold = 0.22 // hysteresis: stay faded this long past the last hit
      else rec.hold -= dt
      const fading = rec.hold > 0
      const target = fading ? Math.min(rec.opacity, 0.25) : rec.opacity
      const rate = fading ? 16 : 6 // fast fade-out, gentler restore
      rec.cur = lerp(rec.cur, target, Math.min(1, rate * dt))
      try {
        if (!fading && Math.abs(rec.cur - rec.opacity) < 0.01) {
          m.opacity = rec.opacity
          m.transparent = rec.transparent
          m.depthWrite = rec.depthWrite
          this._occFaded.delete(m)
        } else {
          m.opacity = rec.cur
        }
      } catch { this._occFaded.delete(m) } // material disposed mid-fade
    }
  }

  _restoreOccluded() {
    for (const [m, rec] of this._occFaded) {
      try {
        m.opacity = rec.opacity
        m.transparent = rec.transparent
        m.depthWrite = rec.depthWrite
      } catch { /* material disposed */ }
    }
    this._occFaded.clear()
  }

  // --------------------------------------------------------- replay / free

  _updateReplay(dt) {
    const o = this.orbit
    o.angle += (Number.isFinite(o.speed) ? o.speed : 0) * dt
    const cam = this.camera
    const cx = o.center.x || 0
    const cy = o.center.y || 0
    const cz = o.center.z || 0
    const y = Math.max(cy + o.height, this.floorY + 0.5)
    const px = cx + Math.sin(o.angle) * o.dist
    const pz = cz + Math.cos(o.angle) * o.dist
    if (Number.isFinite(px) && Number.isFinite(y) && Number.isFinite(pz)) {
      cam.position.set(px, y, pz)
      cam.lookAt(cx, cy, cz)
    }
    this._setBaseFov()
  }

  _updateFree() {
    const f = this.free
    const cam = this.camera
    if (Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.z)) {
      cam.position.set(f.x, f.y, f.z)
      cam.rotation.set(f.pitch || 0, f.yaw || 0, 0, 'YXZ')
    }
    this._setBaseFov()
  }

  _setBaseFov() {
    const cam = this.camera
    if (cam?.isPerspectiveCamera && Math.abs(cam.fov - BASE_FOV) > 1e-4) {
      cam.fov = BASE_FOV
      cam.updateProjectionMatrix()
      this._lastFov = BASE_FOV
    }
  }

  // Smooth pseudo-perlin: three incommensurate sine octaves, range ~[-1, 1].
  _noise(t, seed) {
    return Math.sin(t * 71 + seed * 12.9898) * 0.5 +
      Math.sin(t * 137 + seed * 78.233) * 0.32 +
      Math.sin(t * 31 + seed * 37.719) * 0.18
  }
}
