// Crowd audio v2 (CONTRACTS §19) — the crowd must sound like a CROWD, not static.
//
// Layers (all routed bus -> engine.channels.crowd -> master compressor):
//   1. Murmur SUB-layer: low-passed soft noise at LOW gain (texture only — the
//      LEVELS table keeps it <= 25% of the vowel cluster so it can never read
//      as static; validated headlessly).
//   2. Vowel cluster (the BODY of the crowd): 8 detuned sine/triangle voices,
//      each through two parallel band-pass "formant" filters (ah/oh/aw shapes),
//      slow random pitch drift + per-voice detune LFO (ensemble chorus) +
//      vibrato. Cheers = this cluster swelling in gain AND brightness.
//   3. Rhythm bursts: clap/stomp patterns (filtered noise ticks in bursts, never
//      continuous), whistle glissandi, and voice-ish shout blips.
//   4. Gasp: fast cut + inhale-shaped band-pass sweep, then simmer back.
//   5. NAME CHANTS (wireCrowdChants): on combo>=6 / KO / round win, cooldown
//      >= 18s, the crowd chants the relevant fighter's display name —
//      SpeechSynthesis (2-3 stacked low-volume utterances via voice.js) over a
//      synth stomp-stomp-clap bed; melodic two-note vowel-cluster chant when
//      speech is unavailable/busy.
//
// INTEGRATOR SEAM: call `wireCrowdChants(game)` ONCE from main.js (next to
// wireAudioEvents) — setCrowd only ever receives the engine, so the chant
// wiring needs the game/event bus handed to it explicitly.
import { ensureSetup, clamp } from './synth.js'
import { chantSpeech } from './voice.js'
import { Characters } from '../characters/index.js'

// Mood targets. INVARIANT (unit-checked): murmur <= 0.25 * cluster for every
// mood — noise is a sub-layer only, the vowel cluster is the crowd's body.
export const LEVELS = {
  idle:  { murmur: 0.075, cluster: 0.34, bright: 950,  energy: 0.15 },
  cheer: { murmur: 0.11,  cluster: 0.66, bright: 2700, energy: 0.7 },
  gasp:  { murmur: 0.01,  cluster: 0.04, bright: 520,  energy: 0.0 },
  wild:  { murmur: 0.13,  cluster: 0.82, bright: 3400, energy: 1.0 },
}

export const CHANT_COOLDOWN_MS = 18000
const CLUSTER_VOICES = 8
// Formant pairs (F1, F2 in Hz) for open crowd vowels.
const VOWELS = [[730, 1090], [460, 880], [590, 920]] // ah, oh, aw

// ---------------------------------------------------------------------------
// crowd graph
// ---------------------------------------------------------------------------
function buildCrowd(engine, s) {
  const ctx = s.ctx
  const bus = ctx.createGain()
  bus.gain.value = 0.9
  bus.connect(engine.channels.crowd)

  // --- 1. murmur sub-layer: LOW-passed noise, low gain, slow breathing wobble
  const murmurSrc = ctx.createBufferSource()
  murmurSrc.buffer = s.noiseSoft
  murmurSrc.loop = true
  murmurSrc.playbackRate.value = 0.68
  const murmurF = ctx.createBiquadFilter()
  murmurF.type = 'lowpass'; murmurF.frequency.value = 430; murmurF.Q.value = 0.5
  const murmurG = ctx.createGain(); murmurG.gain.value = 0
  murmurSrc.connect(murmurF); murmurF.connect(murmurG); murmurG.connect(bus)
  murmurSrc.start()
  const mLfo = ctx.createOscillator()
  mLfo.frequency.value = 0.21
  const mLfoG = ctx.createGain(); mLfoG.gain.value = 0.016
  mLfo.connect(mLfoG); mLfoG.connect(murmurG.gain)
  mLfo.start()

  // --- 2. vowel cluster: detuned voices -> formant band-passes -> brightness
  const clusterIn = ctx.createGain(); clusterIn.gain.value = 1
  const brightF = ctx.createBiquadFilter()
  brightF.type = 'lowpass'; brightF.frequency.value = LEVELS.idle.bright; brightF.Q.value = 0.7
  const clusterG = ctx.createGain(); clusterG.gain.value = 0
  clusterIn.connect(brightF); brightF.connect(clusterG); clusterG.connect(bus)

  const voices = []
  for (let i = 0; i < CLUSTER_VOICES; i++) {
    // half low voices, half high — a whole stadium, not one droning organ
    const base = i < CLUSTER_VOICES / 2
      ? 92 + Math.random() * 68
      : 165 + Math.random() * 95
    const osc = ctx.createOscillator()
    osc.type = i % 3 === 0 ? 'sine' : 'triangle'
    osc.frequency.value = base
    osc.detune.value = (Math.random() * 2 - 1) * 18

    // ensemble chorus: slow per-voice detune wander
    const dLfo = ctx.createOscillator()
    dLfo.frequency.value = 0.07 + Math.random() * 0.22
    const dLfoG = ctx.createGain(); dLfoG.gain.value = 5 + Math.random() * 9
    dLfo.connect(dLfoG); dLfoG.connect(osc.detune)

    // gentle vocal vibrato
    const vib = ctx.createOscillator()
    vib.frequency.value = 4.2 + Math.random() * 1.8
    const vibG = ctx.createGain(); vibG.gain.value = base * 0.008
    vib.connect(vibG); vibG.connect(osc.frequency)

    // two parallel formant band-passes = "ah/oh" mouth shape
    const shape = VOWELS[i % VOWELS.length]
    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'; f1.Q.value = 4.5
    f1.frequency.value = shape[0] * (0.88 + Math.random() * 0.24)
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'; f2.Q.value = 6.5
    f2.frequency.value = shape[1] * (0.88 + Math.random() * 0.24)
    const vg = ctx.createGain()
    vg.gain.value = 0.16 + Math.random() * 0.08
    osc.connect(f1); osc.connect(f2)
    f1.connect(vg); f2.connect(vg)

    // spread the stadium across the stereo field when supported
    let tail = vg
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner()
      pan.pan.value = (Math.random() * 2 - 1) * 0.65
      vg.connect(pan)
      tail = pan
    }
    tail.connect(clusterIn)
    osc.start(); dLfo.start(); vib.start()
    voices.push({ osc, f1, f2, base })
  }

  const crowd = {
    ctx, bus, murmurG, clusterG, brightF, voices,
    mood: null, moodSetAt: 0, quietUntil: 0, burstUntil: 0, timer: 0,
  }

  // --- 3. life scheduler: pitch drift, vowel morphs, blips, whistles, bursts
  crowd.timer = setInterval(() => {
    try {
      if (!s.ctx || engine.ctx !== s.ctx || s.crowd !== crowd) {
        clearInterval(crowd.timer)
        return
      }
      const now = ctx.currentTime
      const e = energyNow(crowd, now)

      // slow random pitch drift: a couple of voices re-target each tick
      for (let k = 0; k < 2; k++) {
        const v = voices[(Math.random() * voices.length) | 0]
        const mul = 0.96 + Math.random() * 0.08 + e * 0.05 // excitement pushes pitch up
        v.osc.frequency.setTargetAtTime(v.base * mul, now, 0.9)
      }
      // occasional vowel morph (mouths drifting between "aah" and "ooh")
      if (Math.random() < 0.07) {
        const v = voices[(Math.random() * voices.length) | 0]
        const shape = VOWELS[(Math.random() * VOWELS.length) | 0]
        v.f1.frequency.setTargetAtTime(shape[0] * (0.9 + Math.random() * 0.2), now, 1.2)
        v.f2.frequency.setTargetAtTime(shape[1] * (0.9 + Math.random() * 0.2), now, 1.2)
      }
      if (now < crowd.quietUntil) return // held breath after a gasp

      // individual shout blips — density follows excitement
      if (Math.random() < 0.1 + e * 0.6) blip(ctx, bus, s, now + Math.random() * 0.12, e)
      // whistle glissandi when things get good
      if (e > 0.45 && Math.random() < 0.14) whistle(ctx, bus, now + Math.random() * 0.15)
      // clap/stomp rhythm BURSTS (patterns, never continuous)
      if (now >= crowd.burstUntil && Math.random() < (e >= 0.9 ? 0.16 : e >= 0.5 ? 0.09 : 0)) {
        crowd.burstUntil = now + rhythmBurst(ctx, bus, s, now + 0.05, e) + 1.2
      }
    } catch (err) { /* keep the crowd alive */ }
  }, 150)

  return crowd
}

// cheer excitement decays back toward idle on its own; other moods hold
function energyNow(crowd, now) {
  const lv = LEVELS[crowd.mood] || LEVELS.idle
  if (crowd.mood === 'cheer') {
    const age = now - crowd.moodSetAt
    const t = clamp((age - 1.0) / 3.0, 0, 1)
    return lv.energy + (LEVELS.idle.energy - lv.energy) * t
  }
  if (crowd.mood === 'gasp') return now < crowd.quietUntil ? 0 : LEVELS.idle.energy
  return lv.energy
}

// ---------------------------------------------------------------------------
// one-shot crowd flavor (all routed through the crowd bus)
// ---------------------------------------------------------------------------
function blip(ctx, out, s, t, energy) {
  // one person yelling something about candles: short formant-ish noise burst
  const src = ctx.createBufferSource()
  src.buffer = s.noise
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 450 + Math.random() * (500 + energy * 900)
  f.Q.value = 2.5
  const g = ctx.createGain()
  const vol = (0.03 + energy * 0.07) * (0.6 + Math.random() * 0.8)
  const dur = 0.05 + Math.random() * 0.13
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f); f.connect(g); g.connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.03)
}

function whistle(ctx, out, t) {
  const osc = ctx.createOscillator()
  const f0 = 1500 + Math.random() * 700
  osc.frequency.setValueAtTime(f0, t)
  osc.frequency.linearRampToValueAtTime(f0 * 1.45, t + 0.09)
  osc.frequency.linearRampToValueAtTime(f0 * 0.85, t + 0.24)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.045, t + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
  osc.connect(g); g.connect(out)
  osc.start(t); osc.stop(t + 0.3)
}

function intake(ctx, out, s, t) {
  // the whole arena inhales at once: rising band-pass sweep, inhale envelope
  const src = ctx.createBufferSource()
  src.buffer = s.noise
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'; f.Q.value = 1.4
  f.frequency.setValueAtTime(420, t)
  f.frequency.exponentialRampToValueAtTime(1900, t + 0.32)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.22, t + 0.28)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
  src.connect(f); f.connect(g); g.connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + 0.5)
}

function clapTick(ctx, out, s, t, vol) {
  // a smear of hands, not one snare: 3 tight ticks + a few ragged neighbors
  const offs = [0, 0.013, 0.029, -0.03 - Math.random() * 0.03, 0.05 + Math.random() * 0.04]
  for (let i = 0; i < offs.length; i++) {
    const tt = t + Math.max(0, offs[i])
    const src = ctx.createBufferSource()
    src.buffer = s.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1900 + Math.random() * 1300
    f.Q.value = 1.4
    const g = ctx.createGain()
    const v = vol * (i < 3 ? 1 : 0.45)
    g.gain.setValueAtTime(0.0001, tt)
    g.gain.linearRampToValueAtTime(v, tt + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.055)
    src.connect(f); f.connect(g); g.connect(out)
    src.start(tt, Math.random() * 0.5)
    src.stop(tt + 0.09)
  }
}

function stompTick(ctx, out, s, t, vol) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(82, t)
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.15)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  osc.connect(g); g.connect(out)
  osc.start(t); osc.stop(t + 0.24)
  const src = ctx.createBufferSource()
  src.buffer = s.noiseSoft
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'; f.frequency.value = 160; f.Q.value = 0.6
  const g2 = ctx.createGain()
  g2.gain.setValueAtTime(0.0001, t)
  g2.gain.linearRampToValueAtTime(vol * 0.6, t + 0.006)
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  src.connect(f); f.connect(g2); g2.connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + 0.16)
}

// clap (+stomp when wild) pattern burst; returns its duration in seconds
function rhythmBurst(ctx, out, s, t0, energy) {
  const beats = 5 + ((Math.random() * 4) | 0)
  const step = 0.24 + Math.random() * 0.05
  for (let b = 0; b < beats; b++) {
    const t = t0 + b * step + (Math.random() - 0.5) * 0.02
    clapTick(ctx, out, s, t, 0.1 + energy * 0.1)
    if (energy >= 0.9 && b % 2 === 0) stompTick(ctx, out, s, t + 0.02, 0.22)
  }
  return beats * step
}

// ---------------------------------------------------------------------------
// mood control (library.js entry point — signature unchanged)
// ---------------------------------------------------------------------------
function getCrowd(engine, s) {
  if (!s.crowd || s.crowd.ctx !== s.ctx) s.crowd = buildCrowd(engine, s)
  return s.crowd
}

export function setCrowd(engine, mood) {
  const s = ensureSetup(engine)
  if (!s) return
  if (!LEVELS[mood]) { console.debug('[audio] unknown crowd mood:', mood); return }
  const crowd = getCrowd(engine, s)
  if (crowd.mood === mood && mood !== 'cheer' && mood !== 'gasp') return // re-triggerable moods only
  const ctx = s.ctx
  const now = ctx.currentTime
  crowd.mood = mood
  crowd.moodSetAt = now

  const target = LEVELS[mood]
  const m = crowd.murmurG.gain
  const c = crowd.clusterG.gain
  const b = crowd.brightF.frequency
  m.cancelScheduledValues(now); m.setValueAtTime(m.value, now)
  c.cancelScheduledValues(now); c.setValueAtTime(c.value, now)
  b.cancelScheduledValues(now); b.setValueAtTime(Math.max(60, b.value), now)

  if (mood === 'gasp') {
    // hard cut, collective inhale, then simmer back to a murmur
    crowd.quietUntil = now + 1.15
    m.linearRampToValueAtTime(target.murmur, now + 0.055)
    c.linearRampToValueAtTime(target.cluster, now + 0.055)
    b.setTargetAtTime(target.bright, now, 0.08)
    intake(ctx, crowd.bus, s, now + 0.05)
    m.setTargetAtTime(LEVELS.idle.murmur, now + 0.75, 1.1)
    c.setTargetAtTime(LEVELS.idle.cluster, now + 0.75, 1.1)
    b.setTargetAtTime(LEVELS.idle.bright, now + 0.75, 1.1)
  } else if (mood === 'cheer') {
    // swell up fast + brighten, kick a clap burst, settle back on its own
    m.linearRampToValueAtTime(target.murmur, now + 0.13)
    c.linearRampToValueAtTime(target.cluster, now + 0.13)
    b.setTargetAtTime(target.bright, now, 0.1)
    // cheers can re-trigger every hit of a combo — never stack rhythm bursts
    if (now >= crowd.burstUntil) {
      crowd.burstUntil = now + rhythmBurst(ctx, crowd.bus, s, now + 0.08, target.energy) + 0.8
      if (Math.random() < 0.6) whistle(ctx, crowd.bus, now + 0.15 + Math.random() * 0.2)
    }
    m.setTargetAtTime(LEVELS.idle.murmur, now + 1.0, 1.5)
    c.setTargetAtTime(LEVELS.idle.cluster, now + 1.0, 1.5)
    b.setTargetAtTime(LEVELS.idle.bright, now + 1.0, 1.5)
  } else {
    // idle / wild: sustained smooth crossfade
    const rise = mood === 'wild' ? 0.35 : 0.5
    m.linearRampToValueAtTime(target.murmur, now + rise)
    c.linearRampToValueAtTime(target.cluster, now + rise)
    b.setTargetAtTime(target.bright, now, rise * 0.6)
  }
}

// ---------------------------------------------------------------------------
// NAME CHANTS (§19)
// ---------------------------------------------------------------------------
function displayName(charId) {
  if (!charId) return ''
  const def = Characters[charId]
  return (def && def.name) || String(charId).toUpperCase()
}

// "WALLY" -> ["WAL","LY"]; "TIRED APE" -> ["TIRED","APE"]; long multiword
// names chant the last word ("THE BLACKISH BULL" -> ["BULL","BULL"]).
export function chantBeats(name) {
  let n = String(name || '').toUpperCase().replace(/[^A-Z' ]/g, ' ').trim()
  n = n.replace(/^THE\s+/, '')
  const words = n.split(/\s+/).map((w) => w.replace(/[^A-Z]/g, '')).filter(Boolean)
  if (!words.length) return ['OI', 'OI']
  if (words.length >= 2) {
    if (words.join('').length <= 9) return [words[0], words.slice(1).join(' ')]
    const last = words[words.length - 1]
    return last.length <= 5 ? [last, last] : splitWord(last)
  }
  return splitWord(words[0])
}

function splitWord(w) {
  if (w.length <= 3) return [w, w]
  const V = 'AEIOUY'
  let i = 0
  while (i < w.length && !V.includes(w[i])) i++      // to first vowel
  while (i < w.length && V.includes(w[i])) i++       // past the vowel group
  let j = i
  while (j < w.length && !V.includes(w[j])) j++      // consonant run
  let cut = j >= w.length ? Math.ceil(w.length / 2) : (j - i >= 2 ? i + 1 : i)
  cut = clamp(cut, 1, w.length - 1)
  return [w.slice(0, cut), w.slice(cut)]
}

// stomp-stomp-CLAP bed synced to the chant cycle (~1.05s per "X-Y!")
const CHANT_CYCLE = 1.05
const CHANT_REPS = 4

function chantBed(ctx, out, s, t0) {
  for (let r = 0; r < CHANT_REPS; r++) {
    const t = t0 + r * CHANT_CYCLE
    stompTick(ctx, out, s, t, 0.26)
    stompTick(ctx, out, s, t + 0.35, 0.26)
    clapTick(ctx, out, s, t + 0.7, 0.16)
  }
}

// melodic fallback: the vowel cluster sings the two beats hi-lo (sol-mi feel)
function chantNote(ctx, out, t, freq, dur) {
  for (const det of [-11, 0, 12]) {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.detune.value = det
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = 820; f.Q.value = 2.2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.14, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(f); f.connect(g); g.connect(out)
    osc.start(t); osc.stop(t + dur + 0.05)
  }
}

function melodicChant(ctx, out, t0) {
  const hi = 233, lo = 233 * 0.775
  for (let r = 0; r < CHANT_REPS; r++) {
    const t = t0 + r * CHANT_CYCLE
    chantNote(ctx, out, t, hi, 0.3)
    chantNote(ctx, out, t + 0.35, lo, 0.34)
  }
}

// Fire one chant now (no cooldown logic here). Returns true if audible.
export function chantName(engine, name) {
  const s = ensureSetup(engine)
  if (!s) return false
  const crowd = getCrowd(engine, s)
  const ctx = s.ctx
  const t0 = ctx.currentTime + 0.06
  const beats = chantBeats(name)
  chantBed(ctx, crowd.bus, s, t0)
  let spoke = false
  try { spoke = chantSpeech(engine, beats) } catch (e) { /* fall through to synth */ }
  if (!spoke) melodicChant(ctx, crowd.bus, t0 + 0.02)
  return true
}

// INTEGRATOR SEAM: main.js must call this once, alongside wireAudioEvents(game):
//   import { wireCrowdChants } from './audio/crowd.js'
//   wireCrowdChants(game)
// Returns an unwire function. Listens: 'match:start' (fighter names from the
// p1/p2 charIds), 'combo' (hits >= 6), 'fighter:ko' (chants the winner),
// 'round:end' (chants the round winner). Global cooldown >= 18s.
export function wireCrowdChants(game) {
  const engine = game.audio
  const names = ['', '']
  let lastChant = -Infinity
  const offs = []

  const tryChant = (slot) => {
    const name = names[slot === 1 ? 1 : 0]
    if (!name) return
    const now = performance.now()
    if (now - lastChant < CHANT_COOLDOWN_MS) return
    if (chantName(engine, name)) lastChant = now
  }

  offs.push(game.events.on('match:start', (e) => {
    names[0] = displayName(e?.p1?.charId)
    names[1] = displayName(e?.p2?.charId)
  }))
  offs.push(game.events.on('combo', (e) => { if ((e?.hits ?? 0) >= 6) tryChant(e.slot) }))
  offs.push(game.events.on('fighter:ko', (e) => tryChant(e?.slot === 0 ? 1 : 0)))
  offs.push(game.events.on('round:end', (e) => tryChant(e?.winnerSlot)))

  return () => { for (const off of offs) { try { off() } catch (e) { /* noop */ } } }
}
