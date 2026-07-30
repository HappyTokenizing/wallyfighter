// Shared Web Audio plumbing for WALLY: CRYPTO SMACKDOWN.
// Per-engine state (WeakMap), master safety chain (compressor + soft clip),
// shared noise buffers, a pooled one-shot voice allocator, and tiny synth helpers
// used by the sfx bank, the music sequencer, the announcer and the crowd.
// 100% procedural — no samples, no fetches.

const STATES = new WeakMap()

export function S(engine) {
  let s = STATES.get(engine)
  if (!s) { s = {}; STATES.set(engine, s) }
  return s
}

// Idempotent setup. Safe to call from every entry point — the engine may invoke
// library functions before init() has fired (resume() is async).
export function ensureSetup(engine) {
  const ctx = engine?.ctx
  if (!ctx) return null
  const s = S(engine)
  if (s.ready && s.ctx === ctx) return s
  s.ctx = ctx

  // Loudness safety: reroute channels.master through a compressor + gentle
  // soft-clip waveshaper before the destination. Funny, never painful.
  if (!s.mastered) {
    try {
      const master = engine.channels.master
      master.disconnect()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.knee.value = 18
      comp.ratio.value = 6
      comp.attack.value = 0.003
      comp.release.value = 0.22
      const shaper = ctx.createWaveShaper()
      shaper.curve = softClipCurve(1024, 1.4)
      shaper.oversample = '2x'
      master.connect(comp)
      comp.connect(shaper)
      shaper.connect(ctx.destination)
      s.compressor = comp
      s.mastered = true
    } catch (e) { console.debug('[audio] master chain setup failed', e) }
  }

  if (!s.noise) s.noise = makeNoiseBuffer(ctx, 1.4)
  if (!s.noiseSoft) s.noiseSoft = makeNoiseBuffer(ctx, 2.2, 0.55) // darker, for crowd/booms
  if (!s.voices) s.voices = []
  s.ready = true
  return s
}

function softClipCurve(n, drive) {
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive)
  }
  return curve
}

export function makeNoiseBuffer(ctx, seconds = 1, smooth = 0) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    last = smooth ? last * smooth + w * (1 - smooth) : w
    d[i] = smooth ? last * 3 : w // rough level makeup for the lowpassed variant
  }
  return buf
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const midi2freq = (m) => 440 * Math.pow(2, (m - 69) / 12)

// ---------------------------------------------------------------------------
// Pooled one-shots: max ~12 concurrent, oldest gets choked when the pool is full.
const MAX_VOICES = 12

export function oneShot(engine, dur, build, { vol = 1, pan = 0, channel = 'sfx' } = {}) {
  const s = ensureSetup(engine)
  if (!s) return
  const ctx = s.ctx
  const now = ctx.currentTime
  s.voices = s.voices.filter((v) => v.end > now)
  if (s.voices.length >= MAX_VOICES) {
    const oldest = s.voices.shift()
    try {
      oldest.gain.gain.cancelScheduledValues(now)
      oldest.gain.gain.setTargetAtTime(0.0001, now, 0.008)
    } catch (e) { /* already gone */ }
  }

  const out = ctx.createGain()
  out.gain.value = vol
  let head = out
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    out.connect(p)
    head = p
  }
  head.connect(engine.channels[channel] || engine.channels.sfx)

  const t0 = now + 0.004
  try { build(ctx, out, t0, s) } catch (e) { console.debug('[audio] one-shot build failed', e) }
  s.voices.push({ gain: out, end: t0 + dur })
  setTimeout(() => { try { out.disconnect() } catch (e) { /* noop */ } }, (dur + 0.4) * 1000)
}

// ---------------------------------------------------------------------------
// Micro synth vocabulary. Everything takes (ctx, out, t0, spec) and self-stops.

// A single enveloped oscillator with optional pitch glide + vibrato.
export function tone(ctx, out, t0, o = {}) {
  const {
    type = 'sine', f0 = 440, f1 = null, fT = null, dur = 0.2, vol = 0.4,
    a = 0.002, detune = 0, vibFreq = 0, vibDepth = 0, vibDelay = 0,
  } = o
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(1, f0), t0)
  if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + (fT ?? dur))
  if (detune) osc.detune.value = detune
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(out)
  if (vibFreq > 0) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = vibFreq
    const lg = ctx.createGain()
    lg.gain.setValueAtTime(0.001, t0)
    lg.gain.linearRampToValueAtTime(vibDepth, t0 + vibDelay + 0.05)
    lfo.connect(lg)
    lg.connect(osc.frequency)
    lfo.start(t0)
    lfo.stop(t0 + dur + 0.05)
  }
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
  return osc
}

// Filtered noise burst / sweep from the shared buffer.
export function noise(ctx, out, t0, buf, o = {}) {
  const {
    dur = 0.15, vol = 0.4, a = 0.001, type = 'bandpass',
    f0 = 1000, f1 = null, fT = null, Q = 1, rate = 1,
  } = o
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.playbackRate.value = rate
  const filt = ctx.createBiquadFilter()
  filt.type = type
  filt.Q.value = Q
  filt.frequency.setValueAtTime(Math.max(20, f0), t0)
  if (f1 != null) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + (fT ?? dur))
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filt)
  filt.connect(g)
  g.connect(out)
  src.start(t0, Math.random() * 0.4)
  src.stop(t0 + dur + 0.05)
  return src
}

// 2-op FM ping — coins, bells, sparkles. `index` is peak deviation in Hz.
export function fmPing(ctx, out, t0, f, o = {}) {
  const { ratio = 2.0, index = 300, dur = 0.3, vol = 0.3, a = 0.002, indexDecay = null } = o
  const car = ctx.createOscillator()
  car.type = 'sine'
  car.frequency.value = Math.max(1, f)
  const mod = ctx.createOscillator()
  mod.type = 'sine'
  mod.frequency.value = Math.max(1, f * ratio)
  const mg = ctx.createGain()
  mg.gain.setValueAtTime(index, t0)
  mg.gain.exponentialRampToValueAtTime(0.01, t0 + (indexDecay ?? dur * 0.7))
  mod.connect(mg)
  mg.connect(car.frequency)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  car.connect(g)
  g.connect(out)
  car.start(t0); car.stop(t0 + dur + 0.05)
  mod.start(t0); mod.stop(t0 + dur + 0.05)
}
