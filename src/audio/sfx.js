// The one-shot sfx bank. Deliberately goofy early-2000s arcade flavor:
// compressed punchy impacts, cartoon boings, coin jingles, elephant trumpets.
// Each recipe is { d: durationSeconds, v: bank gain trim, f(ctx, out, t0, state, pitchMult) }.
import { oneShot, tone, noise, fmPing, clamp } from './synth.js'

const rand = (a, b) => a + Math.random() * (b - a)

const RECIPES = {
  // -- impacts ---------------------------------------------------------------
  punch_light: {
    d: 0.16, v: 0.9,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.07, vol: 0.5, type: 'bandpass', f0: 1900 * p, f1: 700, Q: 0.8 })
      tone(c, o, t, { type: 'sine', f0: 155 * p, f1: 85, dur: 0.1, vol: 0.65 })
    },
  },
  punch_heavy: {
    d: 0.34, v: 1,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.12, vol: 0.6, type: 'lowpass', f0: 1100 * p, f1: 250, Q: 0.7 })
      tone(c, o, t, { type: 'sine', f0: 130 * p, f1: 42, dur: 0.28, vol: 0.9 }) // sub drop
      tone(c, o, t, { type: 'square', f0: 300 * p, f1: 120, dur: 0.05, vol: 0.15 })
    },
  },
  kick: {
    d: 0.18, v: 0.95,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'sine', f0: 220 * p, f1: 62, dur: 0.13, vol: 0.75 })
      noise(c, o, t, s.noise, { dur: 0.06, vol: 0.35, type: 'highpass', f0: 1100, Q: 0.6 })
    },
  },
  thud: {
    d: 0.22, v: 0.9,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'sine', f0: 110 * p, f1: 44, dur: 0.18, vol: 0.75 })
      noise(c, o, t, s.noiseSoft, { dur: 0.06, vol: 0.35, type: 'lowpass', f0: 520 * p, Q: 0.5 })
    },
  },
  whoosh: {
    d: 0.26, v: 0.75,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.24, vol: 0.55, a: 0.08, type: 'bandpass', f0: 380 * p, f1: 2600 * p, Q: 1.3 })
    },
  },
  block: {
    d: 0.2, v: 0.85,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'square', f0: 620 * p, dur: 0.07, vol: 0.3 })
      tone(c, o, t, { type: 'square', f0: 620 * p * 1.06, dur: 0.07, vol: 0.3 })
      tone(c, o, t, { type: 'triangle', f0: 1975 * p, dur: 0.18, vol: 0.12 }) // metallic ring
      noise(c, o, t, s.noise, { dur: 0.03, vol: 0.25, type: 'highpass', f0: 2500, Q: 0.5 })
    },
  },
  grab: {
    d: 0.14, v: 0.8,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.06, vol: 0.4, type: 'bandpass', f0: 1500 * p, f1: 800, Q: 1 })
      tone(c, o, t + 0.01, { type: 'square', f0: 185 * p, f1: 140, dur: 0.09, vol: 0.28 })
    },
  },
  throw: {
    d: 0.32, v: 0.85,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.26, vol: 0.45, a: 0.03, type: 'bandpass', f0: 2300 * p, f1: 320, Q: 1.1 })
      tone(c, o, t + 0.14, { type: 'sine', f0: 125 * p, f1: 55, dur: 0.16, vol: 0.6 })
    },
  },
  launch: {
    d: 0.42, v: 0.85,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'sawtooth', f0: 170 * p, f1: 760 * p, dur: 0.34, vol: 0.28, a: 0.02 })
      noise(c, o, t, s.noise, { dur: 0.36, vol: 0.4, a: 0.04, type: 'bandpass', f0: 420, f1: 3200, Q: 1 })
    },
  },
  explosion: {
    d: 1.0, v: 1,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noiseSoft, { dur: 0.85, vol: 0.95, type: 'lowpass', f0: 2400 * p, f1: 110, Q: 0.6 })
      tone(c, o, t, { type: 'sine', f0: 58 * p, f1: 28, dur: 0.55, vol: 0.85 })
      for (let i = 0; i < 3; i++) {
        noise(c, o, t + 0.06 + i * 0.09, s.noise, { dur: 0.05, vol: 0.3 - i * 0.07, type: 'bandpass', f0: rand(900, 2200), Q: 2 })
      }
    },
  },
  break: {
    d: 0.4, v: 0.9,
    f(c, o, t, s, p) {
      for (let i = 0; i < 5; i++) {
        noise(c, o, t + i * 0.045 + rand(0, 0.015), s.noise, {
          dur: 0.05, vol: 0.5 - i * 0.07, type: 'bandpass', f0: rand(800, 2600) * p, Q: 2.5,
        })
      }
      tone(c, o, t + 0.02, { type: 'square', f0: rand(220, 380) * p, dur: 0.04, vol: 0.2 })
      tone(c, o, t + 0.11, { type: 'square', f0: rand(160, 300) * p, dur: 0.04, vol: 0.16 })
    },
  },
  slide: {
    d: 0.32, v: 0.7,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.3, vol: 0.35, a: 0.04, type: 'bandpass', f0: 760 * p, f1: 380, Q: 1.2 })
    },
  },

  // -- toys & tokens ---------------------------------------------------------
  coin: {
    d: 0.45, v: 0.85,
    f(c, o, t, s, p) {
      fmPing(c, o, t, 988 * p, { ratio: 2.01, index: 700, dur: 0.07, vol: 0.3 })
      fmPing(c, o, t + 0.07, 1319 * p, { ratio: 2.01, index: 500, dur: 0.36, vol: 0.32 })
      fmPing(c, o, t + 0.13, 1976 * p, { ratio: 3.02, index: 300, dur: 0.2, vol: 0.08 })
    },
  },
  coins_burst: {
    d: 0.95, v: 0.8,
    f(c, o, t, s, p) {
      const notes = [988, 1175, 1319, 1568, 1760]
      for (let i = 0; i < 9; i++) {
        const f = notes[Math.floor(Math.random() * notes.length)] * p * rand(0.97, 1.03)
        fmPing(c, o, t + i * 0.055 + rand(0, 0.02), f, {
          ratio: 2.01, index: 500, dur: 0.22, vol: 0.24 * (1 - i * 0.06),
        })
      }
    },
  },
  boing: {
    d: 0.55, v: 0.9,
    f(c, o, t, s, p) {
      tone(c, o, t, {
        type: 'triangle', f0: 520 * p, f1: 130 * p, fT: 0.42, dur: 0.5, vol: 0.5,
        vibFreq: 13, vibDepth: 55, vibDelay: 0,
      })
      tone(c, o, t, { type: 'square', f0: 1040 * p, f1: 260 * p, fT: 0.42, dur: 0.3, vol: 0.08 })
    },
  },
  bell: {
    d: 1.5, v: 0.9,
    f(c, o, t, s, p) {
      fmPing(c, o, t, 587 * p, { ratio: 1.47, index: 900, indexDecay: 0.9, dur: 1.4, vol: 0.5 })
      fmPing(c, o, t, 587 * p * 2.09, { ratio: 1.32, index: 300, indexDecay: 0.4, dur: 0.7, vol: 0.14 })
      noise(c, o, t, s.noise, { dur: 0.02, vol: 0.3, type: 'highpass', f0: 3000, Q: 0.5 })
    },
  },

  // -- menus -----------------------------------------------------------------
  menu_move: {
    d: 0.08, v: 0.6,
    f(c, o, t, s, p) { tone(c, o, t, { type: 'sine', f0: 660 * p, f1: 740 * p, dur: 0.06, vol: 0.3 }) },
  },
  menu_confirm: {
    d: 0.26, v: 0.7,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'square', f0: 523 * p, dur: 0.07, vol: 0.22 })
      tone(c, o, t + 0.08, { type: 'square', f0: 784 * p, dur: 0.14, vol: 0.26 })
    },
  },
  menu_back: {
    d: 0.26, v: 0.7,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'square', f0: 659 * p, dur: 0.07, vol: 0.22 })
      tone(c, o, t + 0.08, { type: 'square', f0: 440 * p, dur: 0.14, vol: 0.24 })
    },
  },

  // -- drama -----------------------------------------------------------------
  ko: {
    d: 1.4, v: 1,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'sine', f0: 70 * p, f1: 27, dur: 0.6, vol: 0.9 })
      noise(c, o, t, s.noiseSoft, { dur: 0.95, vol: 0.85, type: 'lowpass', f0: 900 * p, f1: 70, Q: 0.6 })
      tone(c, o, t + 0.05, {
        type: 'sawtooth', f0: 320 * p, f1: 48, fT: 0.85, dur: 0.95, vol: 0.22,
        vibFreq: 7, vibDepth: 14, vibDelay: 0.2,
      })
    },
  },
  trumpet: { // Wally's elephant blast — brassy swell, wobble, comedic pitch fall
    d: 1.0, v: 0.95,
    f(c, o, t, s, p) {
      const f = 466 * p
      for (const det of [0, 9]) {
        const osc = c.createOscillator()
        osc.type = 'sawtooth'
        osc.detune.value = det
        osc.frequency.setValueAtTime(f * 0.9, t)
        osc.frequency.linearRampToValueAtTime(f, t + 0.1)
        osc.frequency.setValueAtTime(f, t + 0.5)
        osc.frequency.exponentialRampToValueAtTime(f * 0.52, t + 0.82)
        const lfo = c.createOscillator()
        lfo.frequency.value = 6.5
        const lg = c.createGain()
        lg.gain.setValueAtTime(0.5, t)
        lg.gain.linearRampToValueAtTime(20, t + 0.45)
        lfo.connect(lg); lg.connect(osc.frequency)
        const filt = c.createBiquadFilter()
        filt.type = 'lowpass'; filt.Q.value = 2
        filt.frequency.setValueAtTime(900, t)
        filt.frequency.linearRampToValueAtTime(2800, t + 0.3)
        filt.frequency.exponentialRampToValueAtTime(500, t + 0.9)
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.3, t + 0.12)
        g.gain.setValueAtTime(0.3, t + 0.55)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95)
        osc.connect(filt); filt.connect(g); g.connect(o)
        osc.start(t); osc.stop(t + 1)
        lfo.start(t); lfo.stop(t + 1)
      }
      noise(c, o, t, s.noise, { dur: 0.5, vol: 0.1, a: 0.1, type: 'bandpass', f0: 1800, Q: 0.7 })
    },
  },
  bark: { // Dogey: two formant-ish square yips
    d: 0.32, v: 0.85,
    f(c, o, t, s, p) {
      const yip = (t0, pm) => {
        const osc = c.createOscillator()
        osc.type = 'square'
        osc.frequency.setValueAtTime(340 * pm, t0)
        osc.frequency.exponentialRampToValueAtTime(880 * pm, t0 + 0.035)
        osc.frequency.exponentialRampToValueAtTime(240 * pm, t0 + 0.095)
        const filt = c.createBiquadFilter()
        filt.type = 'bandpass'; filt.Q.value = 1.8
        filt.frequency.value = 1150 * pm
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.5, t0 + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
        osc.connect(filt); filt.connect(g); g.connect(o)
        osc.start(t0); osc.stop(t0 + 0.12)
      }
      yip(t, p)
      yip(t + 0.16, p * 1.12)
    },
  },
  croak: {
    d: 0.4, v: 0.8,
    f(c, o, t, s, p) {
      const osc = c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(96 * p, t)
      osc.frequency.exponentialRampToValueAtTime(72 * p, t + 0.32)
      const filt = c.createBiquadFilter()
      filt.type = 'lowpass'; filt.frequency.value = 520; filt.Q.value = 3
      const am = c.createGain()
      am.gain.value = 0.5
      const lfo = c.createOscillator()
      lfo.type = 'square'; lfo.frequency.value = 24
      const lg = c.createGain(); lg.gain.value = 0.42
      lfo.connect(lg); lg.connect(am.gain)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.55, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
      osc.connect(filt); filt.connect(am); am.connect(g); g.connect(o)
      osc.start(t); osc.stop(t + 0.4)
      lfo.start(t); lfo.stop(t + 0.4)
    },
  },
  moo: {
    d: 0.8, v: 0.85,
    f(c, o, t, s, p) {
      const osc = c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(178 * p, t)
      osc.frequency.exponentialRampToValueAtTime(126 * p, t + 0.6)
      const lfo = c.createOscillator()
      lfo.frequency.value = 5.5
      const lg = c.createGain(); lg.gain.value = 6
      lfo.connect(lg); lg.connect(osc.frequency)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.42, t + 0.09)
      g.gain.setValueAtTime(0.42, t + 0.45)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72)
      for (const [ff, q, v] of [[480, 4, 0.9], [900, 5, 0.5]]) { // vowel-ish formants
        const filt = c.createBiquadFilter()
        filt.type = 'bandpass'; filt.frequency.value = ff * p; filt.Q.value = q
        const fg = c.createGain(); fg.gain.value = v
        osc.connect(filt); filt.connect(fg); fg.connect(g)
      }
      g.connect(o)
      osc.start(t); osc.stop(t + 0.8)
      lfo.start(t); lfo.stop(t + 0.8)
    },
  },

  // -- arena hazards & flavor ------------------------------------------------
  geyser: { // swamp vent blows its top: rising rush + rumble + gloopy bubbles
    d: 1.3, v: 0.85,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noiseSoft, { dur: 1.15, vol: 0.5, a: 0.14, type: 'lowpass', f0: 260 * p, f1: 1500 * p, fT: 0.55, Q: 0.7 })
      noise(c, o, t + 0.1, s.noise, { dur: 0.9, vol: 0.22, a: 0.25, type: 'highpass', f0: 2600, Q: 0.6 })
      tone(c, o, t, { type: 'sine', f0: 60 * p, f1: 38, dur: 0.9, vol: 0.5 })
      for (let i = 0; i < 6; i++) {
        fmPing(c, o, t + 0.1 + i * 0.16 + rand(0, 0.06), rand(90, 240) * p, { ratio: 1.5, index: 160, dur: 0.09, vol: 0.16 })
      }
    },
  },
  train_horn: { // two-note diesel blast, detuned saw stack + air
    d: 1.15, v: 0.9,
    f(c, o, t, s, p) {
      for (const [f, v] of [[233 * p, 0.2], [311 * p, 0.18], [466 * p, 0.06]]) {
        for (const det of [0, 8]) {
          const osc = c.createOscillator()
          osc.type = 'sawtooth'; osc.detune.value = det
          osc.frequency.setValueAtTime(f * 0.97, t)
          osc.frequency.linearRampToValueAtTime(f, t + 0.06)
          osc.frequency.setValueAtTime(f, t + 0.75)
          osc.frequency.exponentialRampToValueAtTime(f * 0.93, t + 1.0)
          const filt = c.createBiquadFilter()
          filt.type = 'lowpass'; filt.frequency.value = 1350; filt.Q.value = 1.2
          const g = c.createGain()
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(v, t + 0.05)
          g.gain.setValueAtTime(v, t + 0.8)
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05)
          osc.connect(filt); filt.connect(g); g.connect(o)
          osc.start(t); osc.stop(t + 1.1)
        }
      }
      noise(c, o, t, s.noise, { dur: 1.0, vol: 0.08, a: 0.08, type: 'bandpass', f0: 950, Q: 0.6 })
    },
  },
  gong: { // temple bronze: deep inharmonic FM bloom, long shimmer tail
    d: 2.8, v: 0.9,
    f(c, o, t, s, p) {
      fmPing(c, o, t, 82 * p, { ratio: 1.41, index: 850, indexDecay: 1.9, dur: 2.6, vol: 0.55 })
      fmPing(c, o, t, 82 * p * 2.67, { ratio: 2.39, index: 260, indexDecay: 1.1, dur: 1.6, vol: 0.16 })
      fmPing(c, o, t + 0.02, 82 * p * 4.21, { ratio: 1.19, index: 120, indexDecay: 0.5, dur: 0.8, vol: 0.08 })
      noise(c, o, t, s.noiseSoft, { dur: 0.14, vol: 0.4, type: 'lowpass', f0: 500, Q: 0.6 })
      noise(c, o, t, s.noise, { dur: 1.3, vol: 0.07, a: 0.25, type: 'highpass', f0: 3600, Q: 0.5 })
    },
  },
  glitch: { // corrupted packet: random square blips, static ticks, zipper down
    d: 0.38, v: 0.8,
    f(c, o, t, s, p) {
      for (let i = 0; i < 7; i++) {
        const tt = t + i * 0.045 + rand(0, 0.012)
        tone(c, o, tt, { type: 'square', f0: rand(180, 3400) * p, dur: 0.028, vol: 0.16 })
        if (Math.random() < 0.5) noise(c, o, tt, s.noise, { dur: 0.015, vol: 0.14, type: 'highpass', f0: rand(3000, 8000), Q: 1.5 })
      }
      tone(c, o, t + 0.12, { type: 'square', f0: 1500 * p, f1: 70, dur: 0.14, vol: 0.12 })
    },
  },
  freeze: { // assets crystallize: ascending glass pings + frost hiss + lock-up
    d: 0.95, v: 0.85,
    f(c, o, t, s, p) {
      const steps = [1568, 1976, 2637, 3136]
      steps.forEach((f, i) => {
        fmPing(c, o, t + i * 0.09, f * p, { ratio: 3.53, index: 260, indexDecay: 0.2, dur: 0.5, vol: 0.17 - i * 0.02 })
      })
      noise(c, o, t, s.noise, { dur: 0.7, vol: 0.14, a: 0.06, type: 'highpass', f0: 5200, Q: 0.7 })
      tone(c, o, t + 0.3, { type: 'sine', f0: 210 * p, f1: 160, dur: 0.45, vol: 0.22 })
    },
  },
  klaxon: { // margin-call alarm: two-tone square through a honky bandpass
    d: 1.0, v: 0.85,
    f(c, o, t, s, p) {
      const osc = c.createOscillator()
      osc.type = 'square'
      for (let i = 0; i < 4; i++) osc.frequency.setValueAtTime((i % 2 === 0 ? 540 : 405) * p, t + i * 0.22)
      const filt = c.createBiquadFilter()
      filt.type = 'bandpass'; filt.frequency.value = 1000 * p; filt.Q.value = 1.1
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.3, t + 0.02)
      for (let i = 1; i < 4; i++) { // dip between blasts so it reads as pulses
        g.gain.setValueAtTime(0.06, t + i * 0.22 - 0.03)
        g.gain.setValueAtTime(0.3, t + i * 0.22)
      }
      g.gain.setValueAtTime(0.3, t + 0.82)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95)
      osc.connect(filt); filt.connect(g); g.connect(o)
      osc.start(t); osc.stop(t + 1.0)
      noise(c, o, t, s.noise, { dur: 0.9, vol: 0.05, a: 0.05, type: 'bandpass', f0: 1800, Q: 1 })
    },
  },
  crack: { // structural snap: sharp transient, low thump, splinter ticks
    d: 0.32, v: 0.9,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.045, vol: 0.6, type: 'highpass', f0: 1700 * p, Q: 0.7 })
      tone(c, o, t, { type: 'sine', f0: 250 * p, f1: 85, dur: 0.13, vol: 0.5 })
      for (let i = 0; i < 3; i++) {
        noise(c, o, t + 0.03 + i * 0.035 + rand(0, 0.01), s.noise, { dur: 0.02, vol: 0.22 - i * 0.05, type: 'bandpass', f0: rand(1600, 3600) * p, Q: 2.2 })
      }
    },
  },
  fanfare: { // quick brass arpeggio up to a held top note + cymbal wash
    d: 1.15, v: 0.9,
    f(c, o, t, s, p) {
      const seq = [[523, 0, 0.12], [659, 0.13, 0.12], [784, 0.26, 0.12], [1047, 0.4, 0.55]]
      for (const [f, dt, dur] of seq) {
        for (const det of [0, 9]) {
          const osc = c.createOscillator()
          osc.type = 'sawtooth'; osc.detune.value = det
          osc.frequency.value = f * p
          const filt = c.createBiquadFilter()
          filt.type = 'lowpass'; filt.Q.value = 1
          filt.frequency.setValueAtTime(2600, t + dt)
          filt.frequency.exponentialRampToValueAtTime(900, t + dt + dur)
          const g = c.createGain()
          g.gain.setValueAtTime(0.0001, t + dt)
          g.gain.linearRampToValueAtTime(0.16, t + dt + 0.015)
          g.gain.setValueAtTime(0.16, t + dt + dur * 0.7)
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + dur)
          osc.connect(filt); filt.connect(g); g.connect(o)
          osc.start(t + dt); osc.stop(t + dt + dur + 0.05)
        }
      }
      noise(c, o, t + 0.4, s.noise, { dur: 0.5, vol: 0.12, type: 'highpass', f0: 4200, Q: 0.5 })
    },
  },
  drone_hum: { // ominous machine-room drone: detuned saws, slow filter breathe
    d: 2.4, v: 0.8,
    f(c, o, t, s, p) {
      for (const [f, det, v] of [[55 * p, 0, 0.26], [55 * p, 7, 0.26], [82.5 * p, -5, 0.12]]) {
        const osc = c.createOscillator()
        osc.type = 'sawtooth'; osc.detune.value = det
        osc.frequency.value = f
        const filt = c.createBiquadFilter()
        filt.type = 'lowpass'; filt.frequency.value = 240; filt.Q.value = 1.4
        const lfo = c.createOscillator()
        lfo.frequency.value = 0.5
        const lg = c.createGain(); lg.gain.value = 90
        lfo.connect(lg); lg.connect(filt.frequency)
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(v, t + 0.5)
        g.gain.setValueAtTime(v, t + 1.7)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3)
        osc.connect(filt); filt.connect(g); g.connect(o)
        osc.start(t); osc.stop(t + 2.35)
        lfo.start(t); lfo.stop(t + 2.35)
      }
      tone(c, o, t, { type: 'sine', f0: 27.5 * p, dur: 2.2, vol: 0.22, a: 0.4 })
    },
  },
  surge: { // power-up swell: pitch + filter sweep ending on a sparkle
    d: 0.9, v: 0.85,
    f(c, o, t, s, p) {
      tone(c, o, t, { type: 'sawtooth', f0: 130 * p, f1: 950 * p, fT: 0.6, dur: 0.68, vol: 0.2, a: 0.03 })
      tone(c, o, t, { type: 'square', f0: 260 * p, f1: 1900 * p, fT: 0.6, dur: 0.6, vol: 0.08, a: 0.03 })
      noise(c, o, t, s.noise, { dur: 0.7, vol: 0.3, a: 0.06, type: 'bandpass', f0: 420, f1: 4800, fT: 0.6, Q: 1 })
      fmPing(c, o, t + 0.58, 1976 * p, { ratio: 2.01, index: 500, dur: 0.28, vol: 0.24 })
    },
  },
  boss_sting: { // HE APPROACHES: noise riser into a minor-second saw slam
    d: 1.8, v: 1,
    f(c, o, t, s, p) {
      noise(c, o, t, s.noise, { dur: 0.72, vol: 0.3, a: 0.55, type: 'bandpass', f0: 320, f1: 3600, fT: 0.68, Q: 1.2 })
      for (const det of [0, 12]) {
        const osc = c.createOscillator()
        osc.type = 'sawtooth'; osc.detune.value = det
        osc.frequency.setValueAtTime(110 * p, t)
        osc.frequency.exponentialRampToValueAtTime(233 * p, t + 0.7)
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.12, t + 0.55)
        g.gain.linearRampToValueAtTime(0.0001, t + 0.72)
        osc.connect(g); g.connect(o)
        osc.start(t); osc.stop(t + 0.75)
      }
      const th = t + 0.72 // ...the hit
      for (const [f, det, v] of [[58.3, 0, 0.3], [55, 8, 0.3], [110, -6, 0.2], [116.5, 5, 0.14]]) {
        const osc = c.createOscillator()
        osc.type = 'sawtooth'; osc.detune.value = det
        osc.frequency.setValueAtTime(f * p, th)
        osc.frequency.exponentialRampToValueAtTime(f * p * 0.86, th + 0.85)
        const filt = c.createBiquadFilter()
        filt.type = 'lowpass'; filt.Q.value = 1.2
        filt.frequency.setValueAtTime(3200, th)
        filt.frequency.exponentialRampToValueAtTime(160, th + 0.95)
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, th)
        g.gain.linearRampToValueAtTime(v, th + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, th + 1.0)
        osc.connect(filt); filt.connect(g); g.connect(o)
        osc.start(th); osc.stop(th + 1.05)
      }
      tone(c, o, th, { type: 'sine', f0: 64 * p, f1: 25, dur: 0.8, vol: 0.9 })
      noise(c, o, th, s.noiseSoft, { dur: 0.9, vol: 0.5, type: 'lowpass', f0: 1600, f1: 90, Q: 0.6 })
      noise(c, o, th, s.noise, { dur: 0.8, vol: 0.18, type: 'highpass', f0: 3400, Q: 0.5 })
    },
  },
}

export function playSfx(engine, name, opts = {}) {
  const r = RECIPES[name]
  if (!r) { console.debug('[audio] unknown sfx id:', name); return }
  const p = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * 0.08) // ±8% humanize
  const vol = (opts.vol ?? 1) * (r.v ?? 1)
  const pan = opts.pos ? clamp((opts.pos.x ?? 0) / 12, -0.7, 0.7) : 0
  oneShot(engine, r.d, (c, o, t, s) => r.f(c, o, t, s, p), { vol, pan })
}
