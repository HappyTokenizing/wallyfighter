// ReplayManager — rolling instant-replay recorder + kinematic scrub playback.
//
// Records the whole visual state of a match on the fixed clock into a
// preallocated Float32Array ring (~6 s at 30 Hz), then plays it back at 60 fps
// with interpolation by DRIVING transforms directly (bones, holders, props,
// camera) while the sim is frozen — ragdoll bodies never fight the playback
// because physics.step / ragdolls.update simply don't run during it, and the
// live state is snapshotted on entry and restored exactly on exit.
//
// Public API (consumed by MatchScreen and src/replay/ReplayUI.js):
//   new ReplayManager(game)
//   start(match)                     // bind + allocate; recording begins
//   stop()                           // stop recording (buffer kept)
//   resetBuffer()                    // clear samples/stamps (round boundary)
//   captureFrame(phase)              // call once per fixed world step
//   captureAvailable()               // >= ~1 s of samples
//   enterPlayback({ slowmo, angle, seconds })
//   updatePlayback(dt)               // advance + apply + camera (60 Hz or rAF)
//   scrub(t01), setAngle(a), playPause(), setSpeed(s), progress01(), duration()
//   exitPlayback()                   // restore live state exactly
//   playInstantReplay({ seconds, slowmo, onDone })  // one-shot, skippable
//   skipInstant()
//   exportSupported()
//   startExport({ canvas, onDone, onError }) / stopExport()
//   preserve(onDisposeVisuals)       // keep scene alive past MatchScreen.exit
//   dispose()                        // full teardown (runs preserved sweep)
//
// Angles: 'broadcast' (recorded camera track) | 'orbit' (CameraController
// replay-mode orbit) | 'closeup' | 'free' (ReplayUI drag/wheel orbit).
//
// Camera focus: orbit/closeup (and the free-cam's orbit center) target the
// RECORDED fighters' hips midpoint at the current playback time — read from
// the driven scene graph, which playback has already posed from the tape —
// biased toward the KO victim over the final second. The focus point and fit
// distance chase their targets exponentially so scrubbing glides instead of
// teleporting. Broadcast needs no focus math: it replays the live camera
// track, which was framing these same fighters when it was recorded.

import * as THREE from 'three'
import { wireFightRecorder } from './FightRecorder.js'

export const SAMPLE_HZ = 30
export const BUFFER_SECONDS = 6
const DECIMATE = 2            // 60 Hz world steps -> 30 Hz samples
const MAX_PROPS = 16
const PROP_STRIDE = 9         // id, pos xyz, quat xyzw, visible
const CAM_FLOATS = 8          // pos xyz, quat xyzw, fov
const MIN_SAMPLES = SAMPLE_HZ // ~1 s before a replay is worth showing
const MAX_STAMPS = 96
const REC_PHASES = new Set(['fight', 'finisher', 'ko'])
const ANGLES = ['broadcast', 'orbit', 'closeup', 'free']

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// Orbit yaw stays inside a front arc (radians either side of the Z+ axis) so
// the cam never swings backstage to face jumbotron backsides / the void.
// Arenas may override via arena.replayYaw (a number, radians, symmetric).
const ORBIT_YAW_LIMIT = 1.05
const OCCLUSION_PAD = 0.4     // stop this far in front of whatever the ray hit
const MIN_OCCLUDED_DIST = 2.6 // never jam the lens right into the ragdoll

const FOCUS_SMOOTH = 6                                  // 1/s exponential focus chase
const TAN_HALF_V = Math.tan((45 / 2) * Math.PI / 180)   // camera FOV 45 (CONTRACTS §11)

// ---------------------------------------------------------------------------
// RingBuffer — preallocated circular sample store. Pure math, node-testable.
// ---------------------------------------------------------------------------

export class RingBuffer {
  constructor(stride, capacity) {
    this.stride = Math.max(1, stride | 0)
    this.capacity = Math.max(2, capacity | 0)
    this.data = new Float32Array(this.stride * this.capacity)
    this.head = 0 // next physical slot to write
    this.count = 0
  }

  reset() {
    this.head = 0
    this.count = 0
  }

  // Claim the next slot; returns the base offset into `data` to fill.
  beginWrite() {
    const off = this.head * this.stride
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
    return off
  }

  // Base offset of logical sample i (0 = oldest kept, count-1 = newest).
  offsetOf(i) {
    const idx = clamp(i | 0, 0, this.count - 1)
    const start = (this.head - this.count + 2 * this.capacity) % this.capacity
    return ((start + idx) % this.capacity) * this.stride
  }
}

// Map t (seconds from oldest sample) onto an interpolation pair.
// Returns { i0, i1, alpha } in logical indices. Pure, node-testable.
export function samplePair(count, hz, tSec) {
  if (count <= 0) return { i0: 0, i1: 0, alpha: 0 }
  const dur = (count - 1) / hz
  const f = clamp(tSec, 0, dur) * hz
  let i0 = Math.floor(f)
  let alpha = f - i0
  if (i0 >= count - 1) { i0 = count - 1; alpha = 0 }
  return { i0, i1: Math.min(i0 + 1, count - 1), alpha }
}

// Shortest-path normalized quaternion lerp on raw float arrays. Node-testable.
export function nlerpQuat(out, oOut, a, oA, b, oB, alpha) {
  const ax = a[oA], ay = a[oA + 1], az = a[oA + 2], aw = a[oA + 3]
  let bx = b[oB], by = b[oB + 1], bz = b[oB + 2], bw = b[oB + 3]
  if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw }
  let x = ax + (bx - ax) * alpha
  let y = ay + (by - ay) * alpha
  let z = az + (bz - az) * alpha
  let w = aw + (bw - aw) * alpha
  const len = Math.sqrt(x * x + y * y + z * z + w * w)
  if (len > 1e-8) { x /= len; y /= len; z /= len; w /= len }
  else { x = 0; y = 0; z = 0; w = 1 }
  out[oOut] = x; out[oOut + 1] = y; out[oOut + 2] = z; out[oOut + 3] = w
}

// Camera focus target from the two fighters' hip world positions ({x,y,z} or
// null). `victim` (KO victim hips) pulls the focus in over `koW` 0..1 — full
// bias still keeps 35% of the midpoint so the winner stays in the shot. The
// look target is floor-clamped: never below y = 0.5. Pure, node-testable.
export function focusTarget(a, b, victim = null, koW = 0) {
  let x = 0, y = 1.2, z = 0
  const p = a || b
  if (a && b) {
    x = (a.x + b.x) / 2
    y = (a.y + b.y) / 2
    z = (a.z + b.z) / 2
  } else if (p) {
    x = p.x; y = p.y; z = p.z
  }
  if (victim && koW > 0) {
    const w = clamp(koW, 0, 1) * 0.65
    x += (victim.x - x) * w
    y += (victim.y - y) * w
    z += (victim.z - z) * w
  }
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? clamp(y, 0.5, 12) : 1.2,
    z: Number.isFinite(z) ? clamp(z, -6, 6) : 0,
  }
}

// Distance that fits both fighters (+margin) inside the FOV-45 frustum at the
// given aspect — CameraController's frustum-fit idea reduced to two points.
// Conservative: uses the full horizontal separation, so any orbit yaw fits.
// Pure, node-testable.
export function fitDistance(a, b, aspect, { margin = 1.7, minDist = 4.5, maxDist = 40 } = {}) {
  const p = a || b
  const q = b || a
  if (!p) return 8.5
  const asp = Number.isFinite(aspect) && aspect > 0.1 ? aspect : 16 / 9
  const dH = (Math.hypot(p.x - q.x, p.z - q.z) / 2 + margin) / (TAN_HALF_V * asp)
  const dV = (Math.abs(p.y - q.y) / 2 + margin) / TAN_HALF_V
  const d = Math.max(minDist, dH, dV)
  return Number.isFinite(d) ? clamp(d, minDist, maxDist) : minDist
}

// ---------------------------------------------------------------------------
// ReplayManager
// ---------------------------------------------------------------------------

export class ReplayManager {
  constructor(game) {
    this.game = game
    this.match = null
    this.scene = null
    this.camera = null
    this.cam = null           // CameraController (optional)
    this.fighters = []
    this.props = null         // PropManager (records array)

    this._chans = []          // world channels: { kind: 'v3'|'q'|'vis', v|o, off }
    this._stride = 0
    this._camOff = 0
    this._propOff = 0
    this._ring = null
    this._snap = null         // one-sample live snapshot for exact restore
    this._decim = 0
    this._total = 0           // monotonic sample counter (stamp anchoring)
    this._recording = false
    this._recordingBefore = false
    this._preserved = false
    this._disposeVisuals = null
    this._disposed = false

    // props bookkeeping
    this._propIds = new WeakMap() // mesh -> id
    this._propMeshes = new Map()  // id -> mesh (strong: keeps late meshes alive)
    this._nextPropId = 1
    this._presence = new Map()    // reused per applied frame
    this._propSnap = null
    this._readded = new Set()

    // event stamps for overlay flair
    this._stamps = []             // { s: totalSampleIndex, kind, text }
    this._offs = []
    this._koSlot = null

    // playback state
    this.inPlayback = false
    this.playing = false
    this.speed = 1
    this.angle = 'orbit'
    this._t = 0
    this._lastT = -1
    this._winStart = 0
    this._winDur = 0.1
    this._instant = null
    this.onStamp = null           // set by ReplayUI
    this._camSnap = null
    this._camModeSnap = null
    this._orbit = { ang: 0.35, dir: 1, dist: 8.5, height: 2.6, speed: 0.45 }
    this.freeCam = { yaw: 0.5, pitch: 0.32, dist: 7.5 }
    this._yawLimit = ORBIT_YAW_LIMIT

    // occlusion + lens-fade state (built on enterPlayback, cleared on exit)
    this._occluders = null        // opaque scene meshes big enough to block the shot
    this._fades = null            // { mesh, mat, base, near } from userData.cameraFade
    this._ray = null              // lazy THREE.Raycaster
    this._rayO = new THREE.Vector3()
    this._rayD = new THREE.Vector3()
    this._fadeV = new THREE.Vector3()
    this._focusS = null           // smoothed { x, y, z, fit }; null = snap on next drive
    this._hw = [{ x: 0, y: 1.2, z: 0 }, { x: 0, y: 1.2, z: 0 }] // hips world scratch

    // export state
    this._rec = null
    this._chunks = []
    this._exporting = false
    this._exportUrl = null
    this._speedBefore = 1
    this._tBefore = 0
  }

  // ---------------------------------------------------------------- recording

  start(match) {
    // Full-fight video capture (§28): this is the replay module's MatchScreen
    // integration point and it runs BEFORE 'match:start' is emitted, so the
    // (idempotent, game-lifetime) recorder is always listening in time.
    try { wireFightRecorder(this.game) } catch (e) { console.warn('[replay] fight recorder wiring failed', e) }
    this.match = match
    this.scene = match.scene
    this.camera = match.camera
    this.cam = match.cam || null
    this.fighters = (match.fighters || []).slice(0, 2)
    this.props = match.props || null
    const ry = match.arena?.replayYaw
    this._yawLimit = Number.isFinite(ry) ? clamp(Math.abs(ry), 0.3, Math.PI) : ORBIT_YAW_LIMIT
    this._buildLayout()
    this._ring = new RingBuffer(this._stride, Math.round(SAMPLE_HZ * BUFFER_SECONDS))
    this._snap = new Float32Array(this._stride)
    this._recording = true
    this._decim = 0
    this._total = 0

    const ev = this.game?.events
    if (ev?.on) {
      this._offs.push(ev.on('fighter:hit', (p) => this._stamp('hit',
        Number.isFinite(p?.damage) ? `${p.damage} DMG` : 'HIT!')))
      this._offs.push(ev.on('fighter:ko', (p) => {
        this._koSlot = p?.slot === 0 || p?.slot === 1 ? p.slot : null
        this._stamp('ko', 'K.O.!')
      }))
      this._offs.push(ev.on('fighter:blocked', () => this._stamp('block', 'BLOCKED')))
    }
  }

  _buildLayout() {
    const chans = []
    let off = 0
    const v3 = (v) => { chans.push({ kind: 'v3', v, off }); off += 3 }
    const q = (v) => { chans.push({ kind: 'q', v, off }); off += 4 }
    const vis = (o) => { chans.push({ kind: 'vis', o, off }); off += 1 }
    for (const f of this.fighters) {
      if (!f?.root || !f?.holder) continue
      vis(f.root)
      v3(f.root.position)
      v3(f.holder.position)
      q(f.holder.quaternion)   // three keeps rotation<->quaternion in sync
      v3(f.holder.scale)
      for (const name of Object.keys(f.bones || {}).sort()) {
        const b = f.bones[name]
        if (!b?.isObject3D) continue
        v3(b.position)
        q(b.quaternion)
      }
    }
    this._chans = chans
    this._camOff = off
    off += CAM_FLOATS
    this._propOff = off
    off += MAX_PROPS * PROP_STRIDE
    this._stride = off
  }

  stop() { this._recording = false; this._recordingBefore = false }

  resetBuffer() {
    this._ring?.reset()
    this._stamps.length = 0
    this._koSlot = null
    this._decim = 0
    // The tape is empty, so no sample can reference an old prop id — drop the
    // strong id->mesh refs NOW. Left alone they accumulate every round (culled
    // props never free) and _snapshotLive/_applyProps iterate ever-growing
    // stale sets. Live props re-register on the next captureFrame.
    this._propMeshes.clear()
    this._presence.clear()
  }

  captureAvailable() { return (this._ring?.count || 0) >= MIN_SAMPLES }

  // Called once per fixed world step by MatchScreen. Records only fight-flow
  // phases ('ko' included so the money-shot ragdoll flight is on tape).
  captureFrame(phase) {
    if (!this._recording || this._disposed || !REC_PHASES.has(phase)) return
    this._decim = (this._decim + 1) % DECIMATE
    if (this._decim !== 0) return
    const d = this._ring.data
    const base = this._ring.beginWrite()
    this._writeSample(d, base)
    this._total++
  }

  _writeSample(d, base) {
    for (const c of this._chans) {
      const o = base + c.off
      if (c.kind === 'v3') { d[o] = c.v.x; d[o + 1] = c.v.y; d[o + 2] = c.v.z }
      else if (c.kind === 'q') { d[o] = c.v.x; d[o + 1] = c.v.y; d[o + 2] = c.v.z; d[o + 3] = c.v.w }
      else d[o] = c.o.visible ? 1 : 0
    }
    // camera
    const co = base + this._camOff
    const cp = this.camera.position, cq = this.camera.quaternion
    d[co] = cp.x; d[co + 1] = cp.y; d[co + 2] = cp.z
    d[co + 3] = cq.x; d[co + 4] = cq.y; d[co + 5] = cq.z; d[co + 6] = cq.w
    d[co + 7] = this.camera.fov || 45
    // props (first MAX_PROPS live handles)
    let slot = 0
    const po = base + this._propOff
    const records = this.props?.records || []
    for (let i = 0; i < records.length && slot < MAX_PROPS; i++) {
      const m = records[i]?.mesh
      if (!m) continue
      let id = this._propIds.get(m)
      if (id == null) { id = this._nextPropId++; this._propIds.set(m, id) }
      this._propMeshes.set(id, m)
      const o = po + slot * PROP_STRIDE
      d[o] = id
      d[o + 1] = m.position.x; d[o + 2] = m.position.y; d[o + 3] = m.position.z
      d[o + 4] = m.quaternion.x; d[o + 5] = m.quaternion.y; d[o + 6] = m.quaternion.z; d[o + 7] = m.quaternion.w
      d[o + 8] = m.visible ? 1 : 0
      slot++
    }
    for (; slot < MAX_PROPS; slot++) d[po + slot * PROP_STRIDE] = -1
  }

  _stamp(kind, text) {
    if (!this._recording) return
    if (this._stamps.length >= MAX_STAMPS) this._stamps.shift()
    this._stamps.push({ s: this._total, kind, text })
  }

  // ---------------------------------------------------------------- playback

  enterPlayback({ slowmo = 1, angle = 'orbit', seconds = null } = {}) {
    if (this._disposed || this.inPlayback || !this.captureAvailable()) return false
    this._recordingBefore = this._recording // resume after exitPlayback
    this._recording = false
    this._snapshotLive()
    const dur = (this._ring.count - 1) / SAMPLE_HZ
    const win = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, dur) : dur
    this._winStart = dur - win
    this._winDur = Math.max(win, 0.1)
    this._t = 0
    this._lastT = -1
    this.speed = clamp(Number.isFinite(slowmo) ? slowmo : 1, 0.05, 2)
    this.playing = true
    this.inPlayback = true
    this._orbit.ang = (Math.random() * 2 - 1) * Math.min(0.5, this._yawLimit * 0.6)
    this._orbit.dir = Math.random() < 0.5 ? -1 : 1
    this._focusS = null // first camera drive snaps to the recorded fighters
    this._collectOccluders()
    this.setAngle(angle)
    this._applyAt(this._winStart)
    return true
  }

  exitPlayback() {
    if (!this.inPlayback) return
    if (this._exporting) this.stopExport(true)
    this.inPlayback = false
    this.playing = false
    this._instant = null
    this._focusS = null
    if (this._fades) {
      for (const f of this._fades) { try { f.mat.opacity = f.base } catch { /* gone */ } }
    }
    this._fades = null
    this._occluders = null
    this._restoreLive()
    // A replay session must not permanently kill recording: an instant replay
    // that runs mid-match (executions, future modes) would otherwise leave the
    // rest of the match untaped. Preserved/disposed managers stay stopped.
    if (this._recordingBefore && !this._preserved && !this._disposed) this._recording = true
    this._recordingBefore = false
  }

  // One-shot KO instant replay (MatchScreen). Skippable via skipInstant().
  playInstantReplay({ seconds = 5, slowmo = 0.4, onDone = null } = {}) {
    if (!this.enterPlayback({ slowmo, angle: 'orbit', seconds })) {
      onDone?.()
      return false
    }
    this._instant = { onDone }
    return true
  }

  skipInstant() {
    if (!this._instant) return
    const cb = this._instant.onDone
    this._instant = null
    this.exitPlayback()
    try { cb?.() } catch (e) { console.error('[replay] instant onDone threw', e) }
  }

  isInstant() { return !!this._instant }

  // Advance + apply + drive the camera. dt is real seconds (fixed 60 Hz tick
  // from MatchScreen, or rAF delta from the ReplayUI viewer).
  updatePlayback(dt) {
    if (!this.inPlayback || this._disposed) return
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60
    dt = Math.min(dt, 0.1)
    let ended = false
    if (this.playing) {
      this._t += dt * this.speed
      if (this._t >= this._winDur) { this._t = this._winDur; ended = true }
    }
    this._applyAt(this._winStart + this._t)
    this._emitStamps()
    this._driveCamera(dt)
    if (ended) {
      if (this._exporting) this.stopExport()
      if (this._instant) this.skipInstant()
      else this.playing = false
    }
  }

  scrub(t01) {
    if (!this.inPlayback) return
    this._t = clamp(Number(t01) || 0, 0, 1) * this._winDur
    this._lastT = this._t // scrubbing doesn't replay stamps
    this._applyAt(this._winStart + this._t)
    this._driveCamera(0)
  }

  setAngle(a) {
    if (!ANGLES.includes(a)) return
    this.angle = a
    if (a === 'orbit' && this.cam) {
      try { this.cam.setMode('replay') } catch { /* stub */ }
    }
  }

  cycleAngle() {
    const i = ANGLES.indexOf(this.angle)
    this.setAngle(ANGLES[(i + 1) % ANGLES.length])
    return this.angle
  }

  playPause() { this.playing = !this.playing; if (this.playing && this._t >= this._winDur) this._t = 0; return this.playing }
  setSpeed(s) { if (Number.isFinite(s) && s > 0) this.speed = clamp(s, 0.05, 2) }
  progress01() { return this._winDur > 0 ? this._t / this._winDur : 0 }
  duration() { return this._winDur }

  // ------------------------------------------------------------ frame apply

  _applyAt(tSec) {
    const ring = this._ring
    if (!ring || ring.count === 0) return
    const { i0, i1, alpha } = samplePair(ring.count, SAMPLE_HZ, tSec)
    const a = ring.offsetOf(i0)
    const b = alpha > 0 ? ring.offsetOf(i1) : a
    const d = ring.data
    this._applySample(d, a, d, b, alpha)
  }

  _applySample(da, a, db, b, alpha) {
    for (const c of this._chans) {
      const oa = a + c.off, ob = b + c.off
      if (c.kind === 'v3') {
        c.v.set(
          da[oa] + (db[ob] - da[oa]) * alpha,
          da[oa + 1] + (db[ob + 1] - da[oa + 1]) * alpha,
          da[oa + 2] + (db[ob + 2] - da[oa + 2]) * alpha,
        )
      } else if (c.kind === 'q') {
        nlerpQuat(this._qtmp, 0, da, oa, db, ob, alpha)
        c.v.set(this._qtmp[0], this._qtmp[1], this._qtmp[2], this._qtmp[3])
      } else {
        c.o.visible = da[oa] > 0.5
      }
    }
    if (this.angle === 'broadcast') this._applyCamSample(da, a, db, b, alpha)
    this._applyProps(da, a, db, b, alpha)
  }

  _qtmp = new Float32Array(4)

  _applyCamSample(da, a, db, b, alpha) {
    const oa = a + this._camOff, ob = b + this._camOff
    const cam = this.camera
    cam.position.set(
      da[oa] + (db[ob] - da[oa]) * alpha,
      da[oa + 1] + (db[ob + 1] - da[oa + 1]) * alpha,
      da[oa + 2] + (db[ob + 2] - da[oa + 2]) * alpha,
    )
    nlerpQuat(this._qtmp, 0, da, oa + 3, db, ob + 3, alpha)
    cam.quaternion.set(this._qtmp[0], this._qtmp[1], this._qtmp[2], this._qtmp[3])
    const fov = da[oa + 7] + (db[ob + 7] - da[oa + 7]) * alpha
    if (cam.isPerspectiveCamera && Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }

  _applyProps(da, a, db, b, alpha) {
    const pres = this._presence
    pres.clear()
    for (let s = 0; s < MAX_PROPS; s++) {
      const oa = a + this._propOff + s * PROP_STRIDE
      const id = da[oa]
      if (id >= 0) pres.set(id, { a: oa, b: -1 })
    }
    if (b !== a) {
      for (let s = 0; s < MAX_PROPS; s++) {
        const ob = b + this._propOff + s * PROP_STRIDE
        const id = db[ob]
        if (id < 0) continue
        const e = pres.get(id)
        if (e) e.b = ob
        else pres.set(id, { a: -1, b: ob })
      }
    }
    for (const [id, mesh] of this._propMeshes) {
      const e = pres.get(id)
      if (!e) { mesh.visible = false; continue }
      // A prop culled from the scene mid-buffer gets re-added for the show.
      if (!mesh.parent && this.scene) { this.scene.add(mesh); this._readded.add(mesh) }
      if (e.a >= 0 && e.b >= 0) {
        const oa = e.a, ob = e.b
        mesh.position.set(
          da[oa + 1] + (db[ob + 1] - da[oa + 1]) * alpha,
          da[oa + 2] + (db[ob + 2] - da[oa + 2]) * alpha,
          da[oa + 3] + (db[ob + 3] - da[oa + 3]) * alpha,
        )
        nlerpQuat(this._qtmp, 0, da, oa + 4, db, ob + 4, alpha)
        mesh.quaternion.set(this._qtmp[0], this._qtmp[1], this._qtmp[2], this._qtmp[3])
        mesh.visible = da[oa + 8] > 0.5
      } else {
        const src = e.a >= 0 ? da : db
        const o = e.a >= 0 ? e.a : e.b
        mesh.position.set(src[o + 1], src[o + 2], src[o + 3])
        mesh.quaternion.set(src[o + 4], src[o + 5], src[o + 6], src[o + 7])
        mesh.visible = src[o + 8] > 0.5
      }
    }
  }

  _emitStamps() {
    if (!this.onStamp || this._lastT === this._t) { this._lastT = this._t; return }
    const lo = this._winStart + Math.max(this._lastT, -0.001)
    const hi = this._winStart + this._t
    const oldestTotal = this._total - this._ring.count
    for (const st of this._stamps) {
      const t = (st.s - oldestTotal) / SAMPLE_HZ
      if (t > lo && t <= hi) {
        try { this.onStamp(st) } catch { /* UI's problem */ }
      }
    }
    this._lastT = this._t
  }

  // ------------------------------------------------------------- camera drive

  // Hip world position of the fighter in `slot`, read from the driven scene
  // graph. Playback applies the recorded sample BEFORE the camera drive, so
  // this IS the recorded position at the current playback time — including
  // ragdoll KO flight, which lives in the bone transforms while the gameplay
  // root stays behind. Falls back to the root (+chest lift) on rigless fakes.
  _hipsWorld(slot) {
    const f = this.fighters[slot]
    if (!f) return null
    const out = this._hw[slot]
    const hips = f.bones?.hips
    if (hips?.updateWorldMatrix && hips.matrixWorld) {
      hips.updateWorldMatrix(true, false)
      const e = hips.matrixWorld.elements
      if (Number.isFinite(e[12]) && Number.isFinite(e[13]) && Number.isFinite(e[14])) {
        out.x = e[12]; out.y = e[13]; out.z = e[14]
        return out
      }
    }
    const p = f.root?.position
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out.x = p.x; out.y = p.y + 1.0; out.z = Number.isFinite(p.z) ? p.z : 0
      return out
    }
    return null
  }

  // Smoothed focus + fit distance for the current playback time. Exponential
  // chase (FOCUS_SMOOTH) so scrub jumps glide instead of teleporting; the
  // first drive of a playback session snaps ( _focusS is nulled on enter).
  _focus(dt) {
    const a = this._hipsWorld(0)
    const b = this._hipsWorld(1)
    let victim = null
    let koW = 0
    if (this._koSlot === 0 || this._koSlot === 1) {
      victim = this._koSlot === 0 ? a : b
      koW = clamp(this._t - (this._winDur - 1), 0, 1) // ramp over the final second
    }
    const t = focusTarget(a, b, victim, koW)
    t.fit = fitDistance(a, b, this.camera?.aspect)
    let s = this._focusS
    if (!s) {
      s = this._focusS = { x: t.x, y: t.y, z: t.z, fit: t.fit }
      return s
    }
    const k = 1 - Math.exp(-dt * FOCUS_SMOOTH)
    s.x += (t.x - s.x) * k
    s.y += (t.y - s.y) * k
    s.z += (t.z - s.z) * k
    s.fit += (t.fit - s.fit) * k
    s.y = Math.max(s.y, 0.5) // floor clamp survives the smoothing
    return s
  }

  // Bounded ping-pong sweep: yaw stays inside +-_yawLimit of the front (Z+)
  // axis, reversing at the edges, so the shot never faces backstage.
  _advanceYaw(dt, rate) {
    const o = this._orbit
    const lim = this._yawLimit
    if (!Number.isFinite(o.ang)) o.ang = 0
    o.ang = clamp(o.ang, -lim, lim)
    if (dt > 0) {
      o.ang += (o.dir || 1) * rate * dt
      if (o.ang >= lim) { o.ang = lim; o.dir = -1 }
      else if (o.ang <= -lim) { o.ang = -lim; o.dir = 1 }
    }
    return o.ang
  }

  // Build the occlusion + lens-fade working sets for this playback session.
  // Occluders: opaque, front-facing, reasonably large scene meshes — with the
  // fighters and every recorded prop whitelisted so the ray can't be blocked
  // by the very subjects the camera is framing. Instanced meshes (crowds) and
  // transparent stuff (light cones, glows, particles) never block the shot.
  _collectOccluders() {
    const list = []
    const fades = []
    const skipRoots = new Set()
    for (const f of this.fighters) { if (f?.root) skipRoots.add(f.root) }
    // Props: SMALL ones (coins, crates, chairs — flying debris) stay
    // whitelisted so junk crossing the lens never yanks the boom, but TALL
    // ones (vault doors, pedestals, statues spawned as props) can wall off
    // the money shot, so they stay in the occlusion set like scenery does.
    const propRoots = new Set()
    for (const [, mesh] of this._propMeshes) propRoots.add(mesh)
    for (const r of this.props?.records || []) { if (r?.mesh) propRoots.add(r.mesh) }
    const box = new THREE.Box3()
    for (const root of propRoots) {
      let tall = false
      try {
        box.setFromObject(root)
        const h = box.max.y - box.min.y
        tall = Number.isFinite(h) && h >= 1.5
      } catch { /* unmeasurable — treat as small */ }
      if (!tall) skipRoots.add(root)
    }
    try {
      this.scene?.traverse((o) => {
        const fadeNear = o.userData?.cameraFade
        if (Number.isFinite(fadeNear) && fadeNear > 0 && o.material && !Array.isArray(o.material) &&
            Number.isFinite(o.material.opacity)) {
          fades.push({ mesh: o, mat: o.material, base: o.material.opacity, near: fadeNear })
        }
        if (!o.isMesh || o.isInstancedMesh) return
        for (let p = o; p; p = p.parent) { if (skipRoots.has(p)) return }
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        let opaque = false
        for (const m of mats) {
          if (m && !m.transparent && m.side !== THREE.BackSide) { opaque = true; break }
        }
        if (!opaque) return
        const g = o.geometry
        if (!g) return
        if (!g.boundingSphere) { try { g.computeBoundingSphere() } catch { return } }
        const r = g.boundingSphere?.radius
        if (!Number.isFinite(r) || r < 0.7) return // pebbles can't fill the frame
        list.push(o)
      })
    } catch (e) { console.warn('[replay] occluder scan failed', e) }
    this._occluders = list
    this._fades = fades.length ? fades : null
  }

  // Raycast focus -> desired camera position against the occluder set.
  // Returns a scale factor (<= 1) to apply to the camera boom so the lens
  // lands OCCLUSION_PAD in front of the first blocker, or 1 when clear.
  _occlusionScale(fp, px, py, pz) {
    const occ = this._occluders
    if (!occ || !occ.length) return 1
    const dx = px - fp.x, dy = py - fp.y, dz = pz - fp.z
    const len = Math.hypot(dx, dy, dz)
    if (!(len > 1e-3) || !Number.isFinite(len)) return 1
    const ray = this._ray || (this._ray = new THREE.Raycaster())
    this._rayO.set(fp.x, fp.y, fp.z)
    this._rayD.set(dx / len, dy / len, dz / len)
    ray.set(this._rayO, this._rayD)
    ray.near = 0.5
    ray.far = len
    let hits
    try { hits = ray.intersectObjects(occ, false) } catch { return 1 }
    for (const h of hits) {
      if (!(h.distance > 0)) continue
      let vis = true
      for (let p = h.object; p; p = p.parent) { if (p.visible === false) { vis = false; break } }
      if (!vis) continue
      return clamp((h.distance - OCCLUSION_PAD) / len, 0.12, 1)
    }
    return 1
  }

  // Fade volumetric meshes (arena light cones etc. tagged userData.cameraFade)
  // as the lens approaches — a beam crossing the camera reads as a giant flat
  // wedge otherwise. Base opacities are restored on exitPlayback.
  _applyCameraFades() {
    const fades = this._fades
    const cp = this.camera?.position
    if (!fades || !cp) return
    for (const f of fades) {
      try {
        f.mesh.getWorldPosition(this._fadeV)
        const d = this._fadeV.distanceTo(cp)
        f.mat.opacity = f.base * clamp((d - f.near * 0.5) / f.near, 0, 1)
      } catch { /* mesh gone mid-playback */ }
    }
  }

  _driveCamera(dt) {
    const cam = this.camera
    if (!cam) return
    // Focus always advances (even under broadcast) so an angle switch glides
    // from a current point. Scrub passes dt=0: chase with a nominal frame.
    const fp = this._focus(dt > 0 ? Math.min(dt, 0.1) : 1 / 60)
    if (this.angle === 'broadcast') { this._applyCameraFades(); return } // pose comes straight off the tape
    if (this.angle === 'orbit' && this.cam) {
      try {
        this.cam.setMode('replay')
        const yaw = this._advanceYaw(dt, this._orbit.speed)
        let dist = Math.max(this._orbit.dist, fp.fit)
        let height = this._orbit.height
        // occlusion: pull the whole boom toward the focus until the shot clears
        const px = fp.x + Math.sin(yaw) * dist
        const pz = fp.z + Math.cos(yaw) * dist
        const py = Math.max(fp.y + height, 0.9)
        const k = this._occlusionScale(fp, px, py, pz)
        if (k < 1) {
          const d2 = Math.max(dist * k, MIN_OCCLUDED_DIST)
          height *= d2 / dist
          dist = d2
        }
        this.cam.setOrbit({
          center: { x: fp.x, y: fp.y, z: fp.z },
          angle: yaw, dist, height,
          speed: 0, // yaw is driven (and clamped) here, not by the controller
        })
        this.cam.update(dt)
        this._applyCameraFades()
        return
      } catch { /* fall through to manual orbit */ }
    }
    let yaw, pitch, dist
    if (this.angle === 'closeup') {
      yaw = this._advanceYaw(dt, 0.18)
      // Play the money shot to the camera: bias the sweep toward the
      // SURVIVOR's facing side so the closeup never studies the winner's
      // back (or the back of the prop the loser is draped over).
      const surv = (this._koSlot === 0 || this._koSlot === 1)
        ? this.fighters[1 - this._koSlot] : null
      const face = Math.sign(Number(surv?.facing) || 0)
      if (face !== 0) yaw = clamp(face * 0.55 + yaw * 0.4, -this._yawLimit, this._yawLimit)
      pitch = 0.16
      dist = Math.max(3.4, fp.fit * 0.7) // close, but never loses the pair
    } else if (this.angle === 'free') {
      yaw = this.freeCam.yaw
      pitch = clamp(this.freeCam.pitch, -0.2, 1.25)
      dist = clamp(this.freeCam.dist, 2.2, 30) // manual — the user owns the framing
    } else { // manual orbit fallback (no CameraController bound)
      yaw = this._advanceYaw(dt, this._orbit.speed)
      pitch = 0.28
      dist = Math.max(this._orbit.dist, fp.fit)
    }
    const cy = Math.cos(pitch), sy = Math.sin(pitch)
    let px = fp.x + Math.sin(yaw) * cy * dist
    let pz = fp.z + Math.cos(yaw) * cy * dist
    let py = Math.max(fp.y + sy * dist, 0.4)
    if (this.angle !== 'free') { // free cam: the user owns the framing, clipping included
      let k = this._occlusionScale(fp, px, py, pz)
      if (this.angle === 'closeup' && (this._koSlot === 0 || this._koSlot === 1)) {
        // the closeup must also clear the SURVIVOR's sightline — a KO next to
        // a tall prop otherwise leaves the winner hidden behind it while the
        // focus ray (victim-biased) stays clear
        const sv = this._hipsWorld(1 - this._koSlot)
        if (sv) k = Math.min(k, this._occlusionScale(sv, px, py, pz))
      }
      if (k < 1) {
        const d2 = Math.max(dist * k, MIN_OCCLUDED_DIST)
        px = fp.x + Math.sin(yaw) * cy * d2
        pz = fp.z + Math.cos(yaw) * cy * d2
        py = Math.max(fp.y + sy * d2, 0.4)
      }
    }
    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
      cam.position.set(px, py, pz)
      cam.lookAt(fp.x, fp.y, fp.z)
    }
    this._applyCameraFades()
  }

  // ---------------------------------------------------------- snapshot/restore

  _snapshotLive() {
    this._writeSample(this._snap, 0)
    const propSnap = []
    for (const [, mesh] of this._propMeshes) {
      propSnap.push({
        mesh,
        parent: mesh.parent || null,
        visible: mesh.visible,
        px: mesh.position.x, py: mesh.position.y, pz: mesh.position.z,
        qx: mesh.quaternion.x, qy: mesh.quaternion.y, qz: mesh.quaternion.z, qw: mesh.quaternion.w,
      })
    }
    this._propSnap = propSnap
    this._readded.clear()
    const cam = this.camera
    this._camSnap = {
      px: cam.position.x, py: cam.position.y, pz: cam.position.z,
      qx: cam.quaternion.x, qy: cam.quaternion.y, qz: cam.quaternion.z, qw: cam.quaternion.w,
      fov: cam.fov,
    }
    this._camModeSnap = this.cam?.mode || null
  }

  _restoreLive() {
    const s = this._snap
    for (const c of this._chans) {
      const o = c.off
      if (c.kind === 'v3') c.v.set(s[o], s[o + 1], s[o + 2])
      else if (c.kind === 'q') c.v.set(s[o], s[o + 1], s[o + 2], s[o + 3])
      else c.o.visible = s[o] > 0.5
    }
    for (const mesh of this._readded) { try { mesh.parent?.remove(mesh) } catch { /* gone */ } }
    this._readded.clear()
    for (const p of this._propSnap || []) {
      const m = p.mesh
      m.visible = p.visible
      m.position.set(p.px, p.py, p.pz)
      m.quaternion.set(p.qx, p.qy, p.qz, p.qw)
      if (p.parent && m.parent !== p.parent) { try { p.parent.add(m) } catch { /* gone */ } }
      else if (!p.parent && m.parent) { try { m.parent.remove(m) } catch { /* gone */ } }
    }
    this._propSnap = null
    const cs = this._camSnap
    if (cs) {
      const cam = this.camera
      cam.position.set(cs.px, cs.py, cs.pz)
      cam.quaternion.set(cs.qx, cs.qy, cs.qz, cs.qw)
      if (cam.isPerspectiveCamera && Math.abs(cam.fov - cs.fov) > 1e-3) {
        cam.fov = cs.fov
        cam.updateProjectionMatrix()
      }
    }
    if (this._camModeSnap && this.cam) { try { this.cam.setMode(this._camModeSnap) } catch { /* stub */ } }
  }

  // --------------------------------------------------------------- export

  exportSupported() {
    return typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
  }

  // Replays the current window once from the top in real canvas time while
  // MediaRecorder captures the canvas. Produces a WebM Blob + object URL.
  startExport({ canvas = null, onDone = null, onError = null } = {}) {
    if (!this.exportSupported() || this._exporting || !this.inPlayback) return false
    const el = canvas || this.game?.renderer?.domElement
    if (!el) return false
    let mime = ''
    for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
      if (MediaRecorder.isTypeSupported?.(m)) { mime = m; break }
    }
    let rec
    try {
      const stream = el.captureStream(60)
      rec = new MediaRecorder(stream, mime
        ? { mimeType: mime, videoBitsPerSecond: 9e6 }
        : { videoBitsPerSecond: 9e6 })
    } catch (e) {
      console.warn('[replay] MediaRecorder init failed', e)
      onError?.(e)
      return false
    }
    this._chunks = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size) this._chunks.push(e.data) }
    rec.onerror = (e) => { console.warn('[replay] recorder error', e); this.stopExport(true); onError?.(e) }
    rec.onstop = () => {
      const chunks = this._chunks
      this._chunks = []
      if (!chunks.length) { onDone?.(null); return }
      const blob = new Blob(chunks, { type: mime || 'video/webm' })
      if (this._exportUrl) { try { URL.revokeObjectURL(this._exportUrl) } catch { /* fine */ } }
      this._exportUrl = URL.createObjectURL(blob)
      onDone?.({ blob, url: this._exportUrl, filename: `wally-smackdown-clip-${Date.now()}.webm` })
    }
    this._rec = rec
    this._exporting = true
    this._speedBefore = this.speed
    this._tBefore = this._t
    this.speed = 1
    this._t = 0
    this._lastT = -1
    this.playing = true
    try { rec.start() } catch (e) {
      console.warn('[replay] recorder start failed', e)
      this._exporting = false
      this._rec = null
      onError?.(e)
      return false
    }
    return true
  }

  stopExport(abort = false) {
    if (!this._exporting) return
    this._exporting = false
    const rec = this._rec
    this._rec = null
    if (abort && rec) rec.onstop = null
    try { if (rec && rec.state !== 'inactive') rec.stop() } catch { /* fine */ }
    this.speed = this._speedBefore
    this._t = Math.min(this._tBefore, this._winDur)
    this._lastT = this._t
    this.playing = false
  }

  isExporting() { return this._exporting }

  // --------------------------------------------------------------- lifecycle

  // Keep the match visuals alive past MatchScreen.exit so the results-screen
  // clip viewer can re-render them. onDisposeVisuals is MatchScreen's deferred
  // teardown closure; dispose() runs it.
  preserve(onDisposeVisuals) {
    this._preserved = true
    this._disposeVisuals = onDisposeVisuals || null
    this._recording = false
    this._recordingBefore = false
    this._unhookEvents()
    // Match teardown: after a normal match this is a no-op ('match:end'
    // already stopped the video capture); pure belt-and-braces here.
    try { this.game?.__fightRecorder?.onMatchTeardown?.() } catch { /* fine */ }
  }

  _unhookEvents() {
    for (const off of this._offs) { try { off() } catch { /* fine */ } }
    this._offs = []
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    // Match teardown (§28): the MID-MATCH QUIT path — MatchScreen.exit without
    // a 'match:end' disposes us here; stop the video capture, KEEP the partial.
    // (The stale-dispose at the NEXT match's enter finds the recorder idle.)
    try { this.game?.__fightRecorder?.onMatchTeardown?.() } catch { /* fine */ }
    if (this._exporting) this.stopExport(true)
    if (this.inPlayback) { this.inPlayback = false; this.playing = false; this._instant = null }
    this._unhookEvents()
    if (this._exportUrl) { try { URL.revokeObjectURL(this._exportUrl) } catch { /* fine */ } this._exportUrl = null }
    if (this._preserved && this._disposeVisuals) {
      try { this._disposeVisuals() } catch (e) { console.warn('[replay] preserved teardown threw', e) }
    }
    this._disposeVisuals = null
    this._propMeshes.clear()
    this._presence.clear()
    this._readded.clear()
    this._stamps.length = 0
    this._chans = []
    this._ring = null
    this._snap = null
    this._focusS = null
    this._occluders = null
    this._fades = null
    this._ray = null
    this.match = null
    this.scene = null
    this.camera = null
    this.cam = null
    this.fighters = []
    this.props = null
    this.onStamp = null
  }
}
