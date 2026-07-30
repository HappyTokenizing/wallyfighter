// The overdramatic announcer. SpeechSynthesis (deep-ish en voice, slowed, pitched
// down) layered over a punchy synth sting on the announcer channel. If speech is
// unavailable, the sting alone still sells the drama. Never throws, never queues up.
// Also exports chantSpeech() — low-volume stacked crowd-chant utterances used by
// crowd.js for fighter-name chants (§19).
import { oneShot, tone, noise } from './synth.js'

let cachedVoice
let voiceListenerArmed = false

function pickVoice(synth) {
  if (cachedVoice !== undefined) return cachedVoice
  try {
    const voices = synth.getVoices() || []
    if (!voices.length) {
      if (!voiceListenerArmed) {
        voiceListenerArmed = true
        try { synth.addEventListener?.('voiceschanged', () => { cachedVoice = undefined }) } catch (e) { /* noop */ }
      }
      return null // don't cache yet — voices may arrive async
    }
    const en = voices.filter((v) => /^en/i.test(v.lang))
    const deep = /daniel|alex|fred|george|david|mark|guy|james|male/i
    cachedVoice = en.find((v) => deep.test(v.name)) || en.find((v) => v.default) || en[0] || voices[0] || null
  } catch (e) { cachedVoice = null }
  return cachedVoice
}

function sting(engine) {
  // Orchestra-hit energy on a Radio Shack budget: detuned saw stack + slam + air.
  oneShot(engine, 0.55, (c, o, t, s) => {
    for (const [f, det, v] of [[110, 0, 0.3], [110, 11, 0.3], [55, 0, 0.35], [220, -7, 0.14]]) {
      const osc = c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(f, t)
      osc.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.4)
      osc.detune.value = det
      const filt = c.createBiquadFilter()
      filt.type = 'lowpass'; filt.Q.value = 1.1
      filt.frequency.setValueAtTime(2600, t)
      filt.frequency.exponentialRampToValueAtTime(240, t + 0.45)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(v, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.connect(filt); filt.connect(g); g.connect(o)
      osc.start(t); osc.stop(t + 0.55)
    }
    tone(c, o, t, { type: 'sine', f0: 95, f1: 34, dur: 0.3, vol: 0.5 })
    noise(c, o, t, s.noise, { dur: 0.1, vol: 0.3, type: 'highpass', f0: 2000, Q: 0.6 })
  }, { vol: 0.85, channel: 'announcer' })
}

export function announce(engine, line) {
  try { sting(engine) } catch (e) { console.debug('[audio] announcer sting failed', e) }
  try {
    const synth = window.speechSynthesis
    if (!synth || !window.SpeechSynthesisUtterance) return
    if (synth.speaking || synth.pending) synth.cancel() // no pileup — new hype wins
    const u = new SpeechSynthesisUtterance(String(line ?? ''))
    u.rate = 0.95
    u.pitch = 0.6
    u.volume = Math.min(1, (engine?.volumes?.announcer ?? 0.9) * 1.15) // slight boost
    const v = pickVoice(synth)
    if (v) u.voice = v
    synth.speak(u)
  } catch (e) { console.debug('[audio] announcer speech failed', e) }
}

// ---------------------------------------------------------------------------
// Crowd name chants (§19). SpeechSynthesis cannot be routed into WebAudio, so
// chant utterances play at LOW system volume scaled by the crowd channel's user
// gain (times master) — the synth stomp/clap bed under them lives in crowd.js.
// 2-3 "stacked" utterances: the global speech queue plays them back to back at
// varied pitch, which reads as successive waves of the chant. Returns true only
// when utterances were actually queued (crowd.js falls back to a melodic synth
// chant otherwise). Never interrupts the announcer: if speech is busy, bail.
export function chantSpeech(engine, beats, reps) {
  try {
    if (typeof window === 'undefined') return false
    const synth = window.speechSynthesis
    if (!synth || !window.SpeechSynthesisUtterance) return false
    if (synth.speaking || synth.pending) return false // announcer owns the mic
    const [a, b] = [beats?.[0] || 'OI', beats?.[1] || beats?.[0] || 'OI']
    const text = `${a}! ${b}! ${a}! ${b}!`
    const vols = engine?.volumes || {}
    const vol = Math.min(0.7, Math.max(0, (vols.crowd ?? 0.5) * (vols.master ?? 0.8) * 0.9))
    if (vol <= 0.01) return true // crowd muted: chant "happens", silently
    const n = reps ?? (2 + (Math.random() < 0.5 ? 1 : 0)) // 2-3 stacked waves
    const v = pickVoice(synth)
    for (let i = 0; i < n; i++) {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.8 + i * 0.04                   // low rate: crowd cadence
      u.pitch = 0.7 + i * 0.18                  // each wave slightly higher
      u.volume = vol * (1 - i * 0.18)           // trailing waves recede
      if (v) u.voice = v
      synth.speak(u)
    }
    return true
  } catch (e) {
    console.debug('[audio] chant speech failed', e)
    return false
  }
}
