// WALLY: CRYPTO SMACKDOWN — procedural audio library (CONTRACTS.md §8).
// 100% synthesized Web Audio: no samples, no fetches. Early-2000s arcade energy —
// punchy compressed impacts, cartoon boings, coin jingles, cheap FM chiptunes,
// an announcer who has clearly had too much caffeine, and a crowd of bagholders.
//
// main.js: audio.installLibrary(AudioLibrary), and ALSO call wireAudioEvents(game)
// once (see below) to hook automatic event-driven flavor.
import { ensureSetup } from './synth.js'
import { playSfx } from './sfx.js'
import { startMusic, stopMusic as haltMusic, setRadioStation } from './music.js'
import { announce } from './voice.js'
import { setCrowd } from './crowd.js'

export const AudioLibrary = {
  // Called once by AudioEngine after the first user gesture (ctx running).
  // All entry points also lazily self-initialize, so early calls are safe.
  init(engine) {
    ensureSetup(engine) // noise buffers, master compressor + soft clip, voice pool
    try { window.speechSynthesis?.getVoices() } catch (e) { /* warm the voice list */ }
  },

  sfx(engine, name, opts = {}) {
    playSfx(engine, name, opts)
  },

  music(engine, trackId) {
    startMusic(engine, trackId)
  },

  stopMusic(engine) {
    haltMusic(engine)
  },

  announcer(engine, line) {
    announce(engine, line)
  },

  crowd(engine, mood) {
    setCrowd(engine, mood)
  },
}

// ---------------------------------------------------------------------------
// Automatic event-driven flavor. AudioEngine has no reference to `game`, so the
// integrator must call this ONCE from main.js after constructing the game:
//
//   import { AudioLibrary, wireAudioEvents } from './audio/library.js'
//   game.audio.installLibrary(AudioLibrary)
//   wireAudioEvents(game)
//
// NOTE: combat triggers hit/block/etc. sfx explicitly through fx.sfx — this
// wiring deliberately does NOT double-fire those. Returns an unwire function.
export function wireAudioEvents(game) {
  const audio = game.audio
  const offs = []
  let lastThud = 0

  // physics debris/body impacts → thud scaled by speed, throttled
  offs.push(game.events.on('physics:impact', (e) => {
    const speed = e?.speed ?? 0
    const now = performance.now()
    if (speed < 3.5 || now - lastThud < 90) return
    lastThud = now
    const k = Math.min(1, speed / 22)
    audio.sfx('thud', {
      vol: 0.25 + k * 0.75,
      pitch: 1.15 - k * 0.45, // big hits ring lower
      pos: e?.pos,
    })
  }))

  offs.push(game.events.on('arena:bell', () => audio.sfx('bell')))

  offs.push(game.events.on('combo', (e) => {
    const hits = e?.hits ?? 0
    if (hits >= 10) { if (hits % 5 === 0) audio.crowd('wild') }
    else if (hits === 4 || hits === 7) audio.crowd('cheer')
  }))

  offs.push(game.events.on('fighter:ko', () => {
    audio.sfx('ko')
    audio.crowd('wild')
  }))

  offs.push(game.events.on('match:start', () => audio.crowd('idle')))

  // §26 v2.1.1: radio station applies LIVE on ANY screen — SettingsScreen
  // persists settings.radio and broadcasts it; the router swaps whatever is
  // playing (menu, title, intro, results or match) to the new station within
  // ~1 bar, and back to the context theme when set to 'default'.
  offs.push(game.events.on('settings:changed', ({ key } = {}) => {
    if (key === 'settings.radio') setRadioStation(audio)
  }))

  return () => { for (const off of offs) { try { off() } catch (e) { /* noop */ } } }
}
