// Procedural keyframe clip player with crossfade, per CONTRACTS.md §4.
// Clip = { duration, loop, ease?, tracks: { boneName: [{ t, rot:[x,y,z], pos?:[x,y,z], scl?:[x,y,z], ease?:name }] } }
// Rotations/positions are absolute local-space values; untracked bones fall back to
// the rest pose captured at construction. Transitions crossfade over FADE seconds
// from a snapshot of the pose at the moment of the switch — zero pops, zero jank.
//
// Easing — a key may carry ease:'linear'|'smooth'|'in'|'out'|'overshoot'; the ease
// on a key shapes the segment ARRIVING at that key. Resolution order:
//   1. key.ease (always honored, on any clip),
//   2. clip.ease === true → 'smooth' when the gap to the previous key > 0.15s
//      (idle/walk-grade motion), else 'linear' (snappy attack-grade timing kept),
//   3. otherwise 'linear' — every legacy clip plays bit-identically unless it opts in.
//
// Scale — keys may carry scl:[x,y,z] tracks for squash/stretch/smears. The animator
// only ever writes .scale on bones that appear with scl keys in a clip it has played
// (tracked per bone), so script-driven bone scaling elsewhere is never clobbered.

const FADE = 0.08
const AUTO_EASE_GAP = 0.15

const EASE = {
  linear: (f) => f,
  smooth: (f) => f * f * (3 - 2 * f),
  in: (f) => f * f,
  out: (f) => 1 - (1 - f) * (1 - f),
  overshoot: (f) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    const g = f - 1
    return 1 + c3 * g * g * g + c1 * g * g
  },
}

function lerp(a, b, f) { return a + (b - a) * f }

function lerp3(a, b, f, out) {
  out[0] = lerp(a[0], b[0], f)
  out[1] = lerp(a[1], b[1], f)
  out[2] = lerp(a[2], b[2], f)
  return out
}

// Sample a track (sorted keys) at time t → fills rot/pos/scl arrays.
// Returns bitmask: 1 = pos was written, 2 = scl was written.
function sampleTrack(track, t, rest, autoEase, outRot, outPos, outScl) {
  let i = 0
  while (i < track.length - 1 && track[i + 1].t <= t) i++
  const a = track[i]
  const b = track[Math.min(i + 1, track.length - 1)]
  const span = b.t - a.t
  let f = span > 1e-6 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0
  const easeName = b.ease || (autoEase && span > AUTO_EASE_GAP ? 'smooth' : 'linear')
  const easeFn = EASE[easeName]
  if (easeFn && easeName !== 'linear') f = easeFn(f)
  const ar = a.rot || rest.rot
  const br = b.rot || ar
  lerp3(ar, br, f, outRot)
  let flags = 0
  const ap = a.pos
  const bp = b.pos
  if (ap || bp) {
    lerp3(ap || rest.pos, bp || ap || rest.pos, f, outPos)
    flags |= 1
  }
  const as = a.scl
  const bs = b.scl
  if (as || bs) {
    lerp3(as || rest.scl, bs || as || rest.scl, f, outScl)
    flags |= 2
  }
  return flags
}

// Which bones in a clip carry scl keys (cached on the clip object).
function clipSclBones(clip) {
  if (!clip || !clip.tracks) return null
  if (clip._sclBones === undefined) {
    let found = null
    for (const [name, track] of Object.entries(clip.tracks)) {
      for (const k of track) {
        if (k.scl) { (found || (found = [])).push(name); break }
      }
    }
    clip._sclBones = found
  }
  return clip._sclBones
}

export class Animator {
  constructor(bones, clips) {
    this.bones = {}
    for (const [name, b] of Object.entries(bones || {})) if (b) this.bones[name] = b
    this.clips = clips || {}
    this.rest = {}
    for (const [name, b] of Object.entries(this.bones)) {
      this.rest[name] = {
        rot: [b.rotation.x, b.rotation.y, b.rotation.z],
        pos: [b.position.x, b.position.y, b.position.z],
        scl: [b.scale.x, b.scale.y, b.scale.z],
      }
    }
    this.clip = null
    this.clipName = ''
    this.time = 0
    this.speed = 1
    this.fadeFrom = null
    this.fadeTime = 0
    // Bones this animator has ever animated scale on — the only bones whose
    // .scale it will write (never clobbers script-driven scaling elsewhere).
    this._sclBones = null
    // scratch
    this._rot = [0, 0, 0]
    this._pos = [0, 0, 0]
    this._scl = [1, 1, 1]
  }

  has(name) { return !!this.clips[name] }

  play(name, opts = {}) {
    const { restart = false, speed = 1, snap = false } = opts
    if (name === this.clipName && !restart) { this.speed = speed; return }
    // snap: hard-cut, no crossfade. For handoffs where the current bone pose
    // is KNOWN-stale relative to a freshly teleported root (ragdoll recovery
    // across the arena) — crossfading from that snapshot would re-express it
    // flight-distance away for the fade frames (the model-desync tripwire).
    this.fadeFrom = snap ? null : this._snapshot()
    this.fadeTime = 0
    this.clipName = name
    this.clip = this.clips[name] || null
    this.time = 0
    this.speed = speed
    const scl = clipSclBones(this.clip)
    if (scl) {
      if (!this._sclBones) this._sclBones = new Set()
      for (const n of scl) if (this.bones[n]) this._sclBones.add(n)
    }
  }

  // Force clip time to fit `seconds` total (used to sync attack clips to frame data).
  playFitted(name, seconds) {
    const clip = this.clips[name]
    let speed = 1
    if (clip && clip.duration > 0 && seconds > 0) {
      speed = clip.duration / seconds
      speed = Math.min(4, Math.max(0.2, speed))
    }
    this.play(name, { restart: true, speed })
  }

  done() {
    if (!this.clip) return true
    return !this.clip.loop && this.time >= (this.clip.duration || 0)
  }

  _snapshot() {
    const s = {}
    for (const [name, b] of Object.entries(this.bones)) {
      s[name] = {
        rot: [b.rotation.x, b.rotation.y, b.rotation.z],
        pos: [b.position.x, b.position.y, b.position.z],
        scl: [b.scale.x, b.scale.y, b.scale.z],
      }
    }
    return s
  }

  _clipTime() {
    const clip = this.clip
    const d = clip.duration || 1
    if (clip.loop) return ((this.time % d) + d) % d
    return Math.min(this.time, d)
  }

  update(dt) {
    this.time += dt * this.speed
    if (this.fadeFrom) {
      this.fadeTime += dt
      if (this.fadeTime >= FADE) this.fadeFrom = null
    }
    const alpha = this.fadeFrom ? Math.min(1, this.fadeTime / FADE) : 1
    const clip = this.clip
    const t = clip ? this._clipTime() : 0
    const autoEase = !!clip?.ease

    for (const [name, b] of Object.entries(this.bones)) {
      const rest = this.rest[name]
      let rx = rest.rot[0], ry = rest.rot[1], rz = rest.rot[2]
      let px = rest.pos[0], py = rest.pos[1], pz = rest.pos[2]
      const writeScl = this._sclBones?.has(name) || false
      let sx = rest.scl[0], sy = rest.scl[1], sz = rest.scl[2]
      const track = clip?.tracks?.[name]
      if (track && track.length) {
        const flags = sampleTrack(track, t, rest, autoEase, this._rot, this._pos, this._scl)
        rx = this._rot[0]; ry = this._rot[1]; rz = this._rot[2]
        if (flags & 1) { px = this._pos[0]; py = this._pos[1]; pz = this._pos[2] }
        if (flags & 2) { sx = this._scl[0]; sy = this._scl[1]; sz = this._scl[2] }
      }
      const from = this.fadeFrom?.[name]
      if (from && alpha < 1) {
        rx = lerp(from.rot[0], rx, alpha); ry = lerp(from.rot[1], ry, alpha); rz = lerp(from.rot[2], rz, alpha)
        px = lerp(from.pos[0], px, alpha); py = lerp(from.pos[1], py, alpha); pz = lerp(from.pos[2], pz, alpha)
        if (writeScl) { sx = lerp(from.scl[0], sx, alpha); sy = lerp(from.scl[1], sy, alpha); sz = lerp(from.scl[2], sz, alpha) }
      }
      b.rotation.set(rx, ry, rz)
      b.position.set(px, py, pz)
      if (writeScl) b.scale.set(sx, sy, sz)
    }
  }
}
