// Pattern-sequenced chiptune engine: oscillator leads/bass/pads + noise drums,
// scheduled on a lookahead timer. Cheap FM-era console energy, mixed with plenty
// of headroom under the sfx. Tracks loop seamlessly; stopMusic() actually stops.
import { S, ensureSetup, midi2freq } from './synth.js'
import { STATION_IDS, buildRadioTracks } from './stations.js'

// -- tiny pattern DSL --------------------------------------------------------
// Note lines: array (length bars*16) of null | { n: midi, l: lengthInSteps }.
// Drum lines: 16-char strings ('x' hits) — a single string repeats every bar,
// an array of strings cycles per bar.

function notes(totalSteps, list) {
  const arr = new Array(totalSteps).fill(null)
  for (const [bar, st, n, l = 1] of list) arr[bar * 16 + st] = { n, l }
  return arr
}

function bassFromRoots(roots, patt) {
  const arr = new Array(roots.length * 16).fill(null)
  roots.forEach((r, b) => {
    for (const [st, off = 0, l = 1] of patt) arr[b * 16 + st] = { n: r + off, l }
  })
  return arr
}

function padWholeBars(roots, chordMap) {
  return roots.map((r, b) => ({ step: b * 16, ns: chordMap[r], l: 16 }))
}

// -- track library -----------------------------------------------------------
let TRACKS = null

function buildTracks() {
  if (TRACKS) return TRACKS

  // TITLE — heroic dumb 90bpm anthem. C G Am F, chest out, brain off.
  const titleRoots = [36, 43, 45, 41, 36, 43, 45, 41] // C2 G2 A2 F2
  const titleChords = { 36: [60, 64, 67], 43: [59, 62, 67], 45: [57, 60, 64], 41: [57, 60, 65] }
  const title = {
    bpm: 90, bars: 8, gain: 0.42, leadWave: 'square', bassWave: 'sawtooth',
    drums: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    bass: bassFromRoots(titleRoots, [[0, 0, 4], [8, 0, 3], [12, 12, 2], [14, 7, 2]]),
    pad: padWholeBars(titleRoots, titleChords),
    lead: notes(8 * 16, [
      [0, 0, 67, 6], [0, 6, 64, 2], [0, 8, 72, 8],
      [1, 0, 71, 6], [1, 6, 67, 2], [1, 8, 74, 8],
      [2, 0, 76, 6], [2, 6, 72, 2], [2, 8, 69, 8],
      [3, 0, 65, 4], [3, 4, 67, 4], [3, 8, 69, 4], [3, 12, 71, 4],
      [4, 0, 67, 6], [4, 6, 64, 2], [4, 8, 72, 8],
      [5, 0, 74, 6], [5, 6, 71, 2], [5, 8, 67, 8],
      [6, 0, 76, 4], [6, 4, 74, 2], [6, 6, 72, 2], [6, 8, 76, 8],
      [7, 0, 77, 4], [7, 4, 76, 2], [7, 6, 74, 2], [7, 8, 72, 8],
    ]),
  }

  // MENU — funky bass groove, sparse stabs. Number go up, vibes stay smooth.
  const menuRoots = [40, 40, 43, 45, 40, 40, 43, 38] // E2 E2 G2 A2 ... D2
  const menuChordMap = { 40: [64, 67, 71], 43: [67, 71, 74], 45: [69, 72, 76], 38: [62, 66, 69] }
  const menu = {
    bpm: 104, bars: 8, gain: 0.36, leadWave: 'square', bassWave: 'sawtooth',
    drums: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' },
    bass: bassFromRoots(menuRoots, [[0, 0], [3, 0], [6, 3], [8, 0], [10, 12], [11, 10], [14, 7]]),
    pad: menuRoots.flatMap((r, b) => (b % 2 === 1 ? [{ step: b * 16 + 4, ns: menuChordMap[r], l: 2 }] : [])),
    lead: notes(8 * 16, [
      [3, 12, 71, 1], [3, 13, 74, 1], [3, 14, 76, 2],
      [7, 8, 76, 1], [7, 10, 74, 1], [7, 12, 71, 2], [7, 14, 67, 2],
    ]),
  }

  // SELECT — upbeat bouncing arps. Pick your fighter, ape responsibly.
  const selRoots = [36, 45, 41, 43, 36, 45, 41, 43] // C2 A2 F2 G2
  const selChordTones = { 36: [60, 64, 67, 72], 45: [57, 60, 64, 69], 41: [57, 60, 65, 69], 43: [55, 59, 62, 67] }
  const selLead = new Array(8 * 16).fill(null)
  const arpIdx = [0, 1, 2, 3, 2, 1, 3, 2]
  selRoots.forEach((r, b) => {
    const tones = selChordTones[r]
    for (let i = 0; i < 8; i++) selLead[b * 16 + i * 2] = { n: tones[arpIdx[i]], l: 1 }
  })
  const select = {
    bpm: 128, bars: 8, gain: 0.36, leadWave: 'square', bassWave: 'square',
    drums: { kick: 'x...x...x...x...', snare: '....x.......x..x', hat: '..x...x...x...x.' },
    bass: bassFromRoots(selRoots, [[0, 0], [2, 12], [4, 0], [6, 12], [8, 0], [10, 12], [12, 0], [14, 12]]),
    pad: [],
    lead: selLead,
  }

  // BATTLE (Meme Market) — 150bpm driving square-lead banger. Am F C G / Am F E E.
  const btRoots = [45, 41, 36, 43, 45, 41, 40, 40, 45, 41, 36, 43, 45, 41, 40, 40]
  const btChordMap = { 45: [64, 69, 72], 41: [65, 69, 72], 36: [64, 67, 72], 43: [62, 67, 71], 40: [64, 68, 71] }
  const phraseA = (o) => [
    [o + 0, 0, 69, 2], [o + 0, 2, 72, 1], [o + 0, 4, 76, 2], [o + 0, 8, 74, 2], [o + 0, 10, 72, 1], [o + 0, 12, 71, 2], [o + 0, 14, 72, 1],
    [o + 1, 0, 69, 2], [o + 1, 4, 65, 2], [o + 1, 6, 69, 1], [o + 1, 8, 72, 2], [o + 1, 12, 74, 2],
    [o + 2, 0, 76, 2], [o + 2, 4, 72, 2], [o + 2, 8, 67, 2], [o + 2, 12, 72, 2], [o + 2, 14, 74, 1],
    [o + 3, 0, 71, 2], [o + 3, 4, 67, 2], [o + 3, 8, 74, 3], [o + 3, 12, 71, 2], [o + 3, 14, 69, 1],
  ]
  const battle = {
    bpm: 150, bars: 16, gain: 0.4, leadWave: 'square', bassWave: 'sawtooth',
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' },
    bass: bassFromRoots(btRoots, [[0, 0], [2, 0], [4, 0], [6, 0], [7, 12], [8, 0], [10, 0], [12, 0], [14, 0], [15, 12]]),
    pad: btRoots.flatMap((r, b) => [
      { step: b * 16 + 2, ns: btChordMap[r], l: 1 },
      { step: b * 16 + 10, ns: btChordMap[r], l: 1 },
    ]),
    lead: notes(16 * 16, [
      ...phraseA(0),
      // phrase B (Am F E E)
      [4, 0, 76, 2], [4, 2, 77, 1], [4, 4, 76, 2], [4, 8, 72, 2], [4, 12, 69, 2],
      [5, 0, 77, 2], [5, 4, 72, 2], [5, 8, 69, 2], [5, 12, 65, 2],
      [6, 0, 68, 2], [6, 4, 71, 2], [6, 8, 76, 2], [6, 12, 71, 2],
      [7, 0, 68, 4], [7, 8, 64, 4], [7, 12, 64, 1], [7, 13, 68, 1], [7, 14, 71, 1], [7, 15, 74, 1],
      ...phraseA(8),
      // phrase C — big finish + 16th run back to the top
      [12, 0, 81, 2], [12, 4, 76, 2], [12, 8, 77, 2], [12, 12, 74, 2],
      [13, 0, 76, 2], [13, 4, 72, 2], [13, 8, 74, 2], [13, 12, 71, 2],
      [14, 0, 72, 1], [14, 2, 74, 1], [14, 4, 76, 1], [14, 6, 77, 1], [14, 8, 79, 2], [14, 12, 76, 2],
      [15, 0, 81, 1], [15, 1, 79, 1], [15, 2, 77, 1], [15, 3, 76, 1], [15, 4, 74, 1], [15, 5, 72, 1],
      [15, 6, 71, 1], [15, 7, 69, 1], [15, 8, 68, 2], [15, 12, 64, 1], [15, 14, 68, 1], [15, 15, 71, 1],
    ]),
  }

  // RESULTS — triumphant fanfare loop. You did it. Screenshot it before it dumps.
  const resRoots = [36, 36, 41, 36, 43, 43, 36, 36]
  const resChordMap = { 36: [60, 64, 67], 41: [60, 65, 69], 43: [59, 62, 67] }
  const results = {
    bpm: 112, bars: 8, gain: 0.4, leadWave: 'square', bassWave: 'sawtooth',
    drums: {
      kick: 'x.......x.......', snare: '....x.......x...', hat: 'x...x...x...x...',
      crash: ['x...............', '................', '................', '................',
              'x...............', '................', '................', '................'],
    },
    bass: bassFromRoots(resRoots, [[0, 0, 2], [4, 0, 2], [8, 0, 2], [12, 0, 1], [14, 7, 1]]),
    pad: padWholeBars(resRoots, resChordMap),
    lead: notes(8 * 16, [
      [0, 0, 72, 1], [0, 2, 72, 1], [0, 4, 72, 2], [0, 6, 76, 2], [0, 8, 79, 8],
      [1, 0, 79, 4], [1, 8, 76, 2], [1, 10, 74, 2], [1, 12, 76, 4],
      [2, 0, 77, 2], [2, 4, 74, 2], [2, 8, 72, 2], [2, 12, 74, 2],
      [3, 0, 76, 2], [3, 4, 72, 2], [3, 8, 67, 4], [3, 12, 72, 2], [3, 14, 74, 1],
      [4, 0, 74, 2], [4, 2, 74, 1], [4, 4, 74, 2], [4, 6, 79, 2], [4, 8, 83, 6],
      [5, 0, 83, 2], [5, 4, 81, 2], [5, 8, 79, 2], [5, 12, 77, 2],
      [6, 0, 76, 1], [6, 2, 77, 1], [6, 4, 79, 2], [6, 8, 84, 6],
      [7, 0, 84, 4], [7, 8, 79, 2], [7, 10, 76, 2], [7, 12, 72, 4],
    ]),
  }

  // ── ARENA EXPANSION TRACKS ─────────────────────────────────────────────────
  const EMPTY = '................'
  const rep = (str, n) => new Array(n).fill(str)

  // BATTLE: LIQUIDITY SWAMP — sleazy swamp-funk. Wah licks over a boogie bass,
  // froggy E-minor pentatonic. Smells like algae and 20x leverage.
  const swRoots = [40, 40, 40, 40, 45, 45, 40, 47] // E E E E A A E B
  const swChordMap = { 40: [68, 71, 74], 45: [67, 73, 76], 47: [66, 69, 75] } // E7 A7 B7 clav stabs
  const swamp = {
    bpm: 101, bars: 8, gain: 0.38, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadStyle: 'wah', swing: 0.16, padWave: 'square', padVol: 0.1,
    drums: { kick: 'x..x..x...x.....', snare: '....x.......x..x', hat: 'xx.xxx.xxx.xx.xx' },
    bass: bassFromRoots(swRoots, [[0, 0, 1], [3, 0, 1], [6, 10, 1], [8, 12, 1], [10, 10, 1], [12, 0, 2], [15, 3, 1]]),
    pad: swRoots.flatMap((r, b) => [
      { step: b * 16 + 3, ns: swChordMap[r], l: 1 },
      { step: b * 16 + 11, ns: swChordMap[r], l: 1 },
    ]),
    lead: notes(8 * 16, [
      [0, 0, 64, 2], [0, 4, 67, 1], [0, 6, 69, 2], [0, 10, 71, 2], [0, 14, 67, 1],
      [1, 2, 74, 2], [1, 6, 71, 1], [1, 8, 69, 2], [1, 12, 64, 3],
      [2, 4, 67, 1], [2, 6, 69, 1], [2, 8, 71, 3], [2, 14, 74, 1],
      [3, 0, 76, 2], [3, 4, 74, 1], [3, 6, 71, 2], [3, 10, 69, 1], [3, 12, 67, 2],
      [4, 0, 69, 2], [4, 4, 72, 1], [4, 6, 74, 2], [4, 10, 76, 2],
      [5, 2, 74, 1], [5, 4, 72, 1], [5, 6, 69, 2], [5, 10, 67, 1], [5, 12, 64, 2],
      [6, 0, 64, 1], [6, 2, 67, 1], [6, 4, 64, 1], [6, 6, 62, 2], [6, 10, 64, 3],
      [7, 0, 66, 2], [7, 4, 69, 2], [7, 8, 71, 2], [7, 12, 74, 1], [7, 14, 75, 1],
    ]),
  }

  // BATTLE: FROZEN LAB — tight electro under glassy FM-bell arpeggios.
  // Everything in here is stored at -196°C, including your collateral.
  const flRoots = [45, 40, 41, 43, 45, 41, 43, 40] // Am Em F G Am F G Em
  const flTones = { 45: [81, 84, 88], 40: [79, 83, 88], 41: [81, 84, 89], 43: [79, 83, 86] }
  const flChordMap = { 45: [69, 72, 76], 40: [67, 71, 76], 41: [69, 72, 77], 43: [67, 71, 74] }
  const flLead = new Array(8 * 16).fill(null)
  const flArp = [0, 1, 2, 1, 0, 2, 1, 2]
  flRoots.forEach((r, b) => {
    const tn = flTones[r]
    for (let i = 0; i < 8; i++) flLead[b * 16 + i * 2] = { n: tn[flArp[i]], l: 1 }
  })
  flLead[7 * 16 + 15] = { n: 91, l: 1 } // grace sparkle into the loop point
  const frozen = {
    bpm: 138, bars: 8, gain: 0.38, leadWave: 'sine', bassWave: 'sawtooth',
    leadStyle: 'bell', leadVol: 0.19, padVol: 0.07,
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'x.x.x.x.x.x.x.x.' },
    bass: bassFromRoots(flRoots, [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 0, 1], [14, 12, 1]]),
    pad: padWholeBars(flRoots, flChordMap),
    lead: flLead,
  }

  // BATTLE: SETTLEMENT EXPRESS — shuffling train-rhythm blues in G. Boogie
  // bass chugs, horn-section stabs. This settlement layer runs on coal.
  const seRoots = [43, 43, 36, 36, 43, 43, 38, 36] // G G C C G G D C
  const seChordMap = { 43: [71, 74, 77], 36: [70, 76, 79], 38: [72, 78, 81] } // G7 C7 D7 horns
  const sePad = []
  seRoots.forEach((r, b) => {
    sePad.push({ step: b * 16, ns: seChordMap[r], l: 3 })
    if (b % 2 === 1) sePad.push({ step: b * 16 + 10, ns: seChordMap[r], l: 2 })
  })
  const express = {
    bpm: 126, bars: 8, gain: 0.38, leadWave: 'square', bassWave: 'sawtooth',
    swing: 0.3, padWave: 'sawtooth', padVol: 0.12,
    drums: { kick: 'x.......x.....x.', snare: '....x.......x...', shaker: 'xxxxxxxxxxxxxxxx' },
    bass: bassFromRoots(seRoots, [[0, 0], [2, 4], [4, 7], [6, 9], [8, 10], [10, 9], [12, 7], [14, 4]]),
    pad: sePad,
    lead: notes(8 * 16, [
      [0, 0, 74, 2], [0, 4, 71, 1], [0, 6, 74, 1], [0, 8, 79, 4], [0, 14, 77, 1],
      [1, 0, 74, 2], [1, 4, 74, 1], [1, 6, 71, 1], [1, 8, 67, 4],
      [2, 0, 76, 2], [2, 4, 72, 1], [2, 6, 76, 1], [2, 8, 79, 3], [2, 12, 82, 2],
      [3, 0, 79, 1], [3, 2, 77, 1], [3, 4, 76, 1], [3, 6, 74, 1], [3, 8, 72, 2], [3, 12, 70, 2],
      [4, 0, 71, 1], [4, 2, 74, 1], [4, 4, 79, 2], [4, 8, 77, 1], [4, 10, 79, 1], [4, 12, 81, 2],
      [5, 0, 79, 4], [5, 6, 77, 1], [5, 8, 74, 2], [5, 12, 71, 2],
      [6, 0, 78, 2], [6, 4, 74, 1], [6, 6, 72, 1], [6, 8, 69, 2], [6, 12, 74, 2],
      [7, 0, 76, 2], [7, 4, 72, 1], [7, 6, 70, 1], [7, 8, 67, 2], [7, 12, 66, 1], [7, 14, 67, 1],
    ]),
  }

  // BATTLE: MOUNTAIN NODE — taiko drums and a noble D-pentatonic lead.
  // Eight bars of misty calm, then the whole dojo starts validating blocks.
  const mnRoots = [38, 38, 47, 43, 38, 45, 47, 43] // D D Bm G D A Bm G
  const mnChordMap = { 38: [62, 66, 69], 47: [62, 66, 71], 43: [62, 67, 71], 45: [64, 69, 73] }
  const mnPad = [
    ...mnRoots.map((r, b) => ({ step: b * 16, ns: mnChordMap[r], l: 16 })),
    ...mnRoots.flatMap((r, b) => [
      { step: 128 + b * 16, ns: mnChordMap[r], l: 6 },
      { step: 128 + b * 16 + 8, ns: mnChordMap[r], l: 6 },
    ]),
  ]
  const mountain = {
    bpm: 100, bars: 16, gain: 0.4, leadWave: 'triangle', bassWave: 'triangle',
    leadVol: 0.27, bassVol: 0.5, tomF: 78, padVol: 0.075,
    drums: {
      kick: [...rep(EMPTY, 8), ...rep('x.......x.......', 8)],
      tom: [...rep('x...............', 4), ...rep('x.......x.......', 4), ...rep('x..x....x..x....', 8)],
      tomHi: [...rep('............x...', 4), ...rep('....x.......x...', 4), ...rep('....x..x....x.x.', 8)],
      rim: [...rep('......x.......x.', 8), ...rep(EMPTY, 8)],
      shaker: [...rep(EMPTY, 8), ...rep('x.x.x.x.x.x.x.x.', 8)],
      crash: [...rep(EMPTY, 8), 'x...............', ...rep(EMPTY, 7)],
    },
    bass: [
      ...bassFromRoots(mnRoots, [[0, 0, 8], [8, 0, 6], [14, 0, 2]]),
      ...bassFromRoots(mnRoots, [[0, 0, 2], [4, 0, 2], [8, 0, 2], [12, 0, 2], [14, 7, 1]]),
    ],
    pad: mnPad,
    lead: notes(16 * 16, [
      // calm — long noble phrases
      [0, 0, 69, 6], [0, 8, 71, 4], [0, 12, 74, 4],
      [1, 0, 74, 8], [1, 8, 71, 4], [1, 12, 69, 4],
      [2, 0, 71, 6], [2, 8, 74, 4], [2, 12, 78, 4],
      [3, 0, 74, 10], [3, 12, 71, 2], [3, 14, 69, 2],
      [4, 0, 66, 4], [4, 4, 69, 4], [4, 8, 71, 8],
      [5, 0, 73, 6], [5, 8, 69, 6],
      [6, 0, 74, 6], [6, 8, 78, 4], [6, 12, 76, 2], [6, 14, 74, 2],
      [7, 0, 71, 8], [7, 8, 69, 4], [7, 12, 66, 4],
      // driving — octave up, taiko at full tilt
      [8, 0, 81, 2], [8, 4, 78, 2], [8, 6, 81, 1], [8, 8, 83, 4], [8, 14, 81, 1],
      [9, 0, 86, 2], [9, 4, 83, 2], [9, 8, 81, 2], [9, 10, 78, 1], [9, 12, 81, 2],
      [10, 0, 83, 2], [10, 2, 81, 1], [10, 4, 78, 2], [10, 8, 74, 2], [10, 12, 78, 2],
      [11, 0, 81, 2], [11, 4, 79, 2], [11, 8, 74, 2], [11, 12, 71, 2],
      [12, 0, 78, 1], [12, 2, 81, 1], [12, 4, 83, 2], [12, 8, 86, 4], [12, 14, 83, 1],
      [13, 0, 85, 2], [13, 4, 81, 2], [13, 8, 76, 2], [13, 12, 73, 2],
      [14, 0, 74, 1], [14, 2, 78, 1], [14, 4, 81, 2], [14, 8, 83, 2], [14, 12, 86, 2],
      [15, 0, 83, 2], [15, 4, 81, 1], [15, 6, 78, 1], [15, 8, 76, 2], [15, 12, 74, 2], [15, 14, 71, 1],
    ]),
  }

  // BATTLE: LOST BLOCK — glitch-hop. Stutter-gated detuned lead through a
  // bitcrush shaper, broken beat. This block fell out of consensus in 2013.
  const lbRoots = [36, 36, 44, 43, 36, 36, 38, 43] // C C Ab G C C D° G
  const lbChordMap = { 36: [72, 75, 79], 44: [68, 72, 75], 38: [68, 74, 77], 43: [67, 71, 74] }
  const lost = {
    bpm: 92, bars: 8, gain: 0.38, leadWave: 'square', bassWave: 'square',
    leadStyle: 'glitch', leadFx: 'crush', leadDetune: 22, leadStutter: 12, leadVol: 0.2,
    padVol: 0.06,
    drums: {
      kick: 'x..x......x.x...', snare: '....x..x....x...',
      hat: ['x.xx..x.xxx.x.xx', 'xx..x.xxxx..x.x.'],
      rim: '..x.......x....x',
    },
    bass: bassFromRoots(lbRoots, [[0, 0, 2], [5, 0, 1], [8, 12, 1], [10, 0, 1], [14, 1, 1]]),
    pad: lbRoots.flatMap((r, b) => (b % 2 === 1 ? [{ step: b * 16 + 8, ns: lbChordMap[r], l: 1 }] : [])),
    lead: notes(8 * 16, [
      [0, 0, 72, 2], [0, 4, 75, 1], [0, 6, 77, 2], [0, 10, 78, 1], [0, 12, 79, 2],
      [1, 0, 79, 1], [1, 2, 78, 1], [1, 4, 75, 2], [1, 8, 72, 3], [1, 14, 70, 1],
      [2, 0, 80, 2], [2, 4, 79, 1], [2, 6, 75, 2], [2, 10, 72, 2],
      [3, 0, 79, 2], [3, 4, 74, 1], [3, 6, 75, 1], [3, 8, 71, 3], [3, 12, 79, 1], [3, 14, 78, 1],
      [4, 0, 72, 2], [4, 4, 75, 1], [4, 6, 77, 2], [4, 10, 79, 1], [4, 12, 82, 2],
      [5, 0, 84, 1], [5, 2, 82, 1], [5, 4, 79, 2], [5, 8, 78, 2], [5, 12, 75, 2],
      [6, 0, 74, 2], [6, 4, 77, 1], [6, 6, 74, 1], [6, 8, 71, 2], [6, 12, 68, 2],
      [7, 0, 79, 2], [7, 4, 78, 1], [7, 6, 79, 1], [7, 8, 74, 2], [7, 12, 71, 1], [7, 14, 67, 1],
    ]),
  }

  // BATTLE: CAPITAL TOWER — corporate smooth-jazz 2-5-1s and a walking upright
  // bass... over battle drums. The elevator is going DOWN. (Comedy is intended.)
  const ctRoots = [36, 45, 38, 43, 36, 45, 38, 43] // Cmaj7 Am7 Dm7 G7 x2
  const ctChordMap = { 36: [64, 67, 71], 45: [64, 67, 72], 38: [65, 69, 72], 43: [65, 71, 74] }
  const ctWalk = { 36: [0, 4, 7, 9], 45: [0, 3, 7, 10], 38: [0, 3, 7, 10], 43: [0, 4, 7, 10] }
  const ctBass = new Array(8 * 16).fill(null)
  ctRoots.forEach((r, b) => ctWalk[r].forEach((off, i) => { ctBass[b * 16 + i * 4] = { n: r + off, l: 4 } }))
  const tower = {
    bpm: 116, bars: 8, gain: 0.4, leadWave: 'triangle', bassWave: 'triangle',
    leadVol: 0.28, bassVol: 0.52, swing: 0.12, padVol: 0.075,
    drums: {
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
      crash: ['x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
    },
    bass: ctBass,
    pad: padWholeBars(ctRoots, ctChordMap),
    lead: notes(8 * 16, [
      [0, 0, 76, 3], [0, 4, 79, 3], [0, 8, 83, 4], [0, 14, 81, 1],
      [1, 0, 81, 2], [1, 4, 79, 2], [1, 8, 76, 4], [1, 12, 74, 2],
      [2, 0, 77, 3], [2, 4, 81, 2], [2, 8, 84, 4], [2, 14, 83, 1],
      [3, 0, 83, 2], [3, 2, 81, 1], [3, 4, 79, 2], [3, 8, 77, 3], [3, 12, 74, 2],
      [4, 0, 72, 2], [4, 4, 76, 2], [4, 8, 79, 3], [4, 12, 83, 3],
      [5, 0, 84, 3], [5, 4, 81, 2], [5, 8, 79, 4], [5, 14, 76, 1],
      [6, 0, 77, 2], [6, 2, 79, 1], [6, 4, 81, 2], [6, 8, 84, 2], [6, 12, 86, 2],
      [7, 0, 83, 3], [7, 4, 81, 2], [7, 8, 79, 2], [7, 12, 74, 2], [7, 14, 71, 1],
    ]),
  }

  // BATTLE: CALM LIQUIDATION — starts as lo-fi beats to get margin-called to,
  // escalates hard at bar 8 as the arena comes apart. D dorian, deceptively chill.
  const clRoots4 = [38, 43, 46, 45] // Dm7 G7 Bbmaj7 A7
  const clRoots16 = [...clRoots4, ...clRoots4, ...clRoots4, ...clRoots4]
  const clChordMap = { 38: [65, 69, 72], 43: [65, 71, 74], 46: [65, 70, 74], 45: [67, 73, 76] }
  const clPad = [
    ...clRoots16.slice(0, 8).map((r, b) => ({ step: b * 16, ns: clChordMap[r], l: 16 })),
    ...clRoots16.slice(8).flatMap((r, i) => [
      { step: (8 + i) * 16 + 2, ns: clChordMap[r], l: 1 },
      { step: (8 + i) * 16 + 10, ns: clChordMap[r], l: 1 },
    ]),
  ]
  const liquidation = {
    bpm: 88, bars: 16, gain: 0.38, leadWave: 'triangle', bassWave: 'sawtooth',
    swing: 0.14, leadVol: 0.24, bassVol: 0.38, bassCutoff: 750, padVol: 0.07,
    drums: {
      kick: [...rep('x.....x...x.....', 8), ...rep('x...x...x..xx...', 8)],
      snare: [...rep(EMPTY, 8), ...rep('....x.......x...', 8)],
      rim: [...rep('....x.......x...', 8), ...rep(EMPTY, 8)],
      hat: [...rep('..x...x...x...x.', 8), ...rep('x.xxx.xxx.xxx.xx', 8)],
      shaker: [...rep(EMPTY, 8), ...rep('x.x.x.x.x.x.x.x.', 8)],
      crash: [...rep(EMPTY, 8), 'x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
    },
    bass: [
      ...bassFromRoots(clRoots16.slice(0, 8), [[0, 0, 6], [8, 0, 4], [14, 0, 2]]),
      ...bassFromRoots(clRoots16.slice(8), [[0, 0, 2], [2, 0, 1], [4, 0, 2], [8, 0, 2], [10, 12, 1], [12, 0, 2], [14, 12, 1]]),
    ],
    pad: clPad,
    lead: notes(16 * 16, [
      // lo-fi head — sparse, mellow
      [0, 2, 69, 3], [0, 8, 72, 4],
      [1, 0, 71, 2], [1, 4, 67, 4], [1, 10, 65, 2],
      [2, 2, 70, 3], [2, 8, 74, 4],
      [3, 0, 73, 2], [3, 4, 69, 4], [3, 12, 64, 3],
      [4, 0, 69, 2], [4, 4, 72, 2], [4, 8, 74, 4], [4, 14, 72, 1],
      [5, 0, 71, 4], [5, 8, 67, 3], [5, 12, 65, 2],
      [6, 0, 70, 3], [6, 6, 72, 1], [6, 8, 74, 2], [6, 12, 77, 3],
      [7, 0, 76, 2], [7, 4, 73, 2], [7, 8, 69, 4], [7, 12, 73, 2],
      // liquidation engaged — octave up, busier
      [8, 0, 81, 2], [8, 2, 84, 1], [8, 4, 81, 1], [8, 6, 79, 1], [8, 8, 84, 4], [8, 14, 86, 1],
      [9, 0, 83, 2], [9, 4, 79, 2], [9, 8, 77, 2], [9, 10, 79, 1], [9, 12, 74, 2],
      [10, 0, 82, 1], [10, 2, 84, 1], [10, 4, 86, 2], [10, 8, 82, 2], [10, 12, 81, 1], [10, 14, 79, 1],
      [11, 0, 81, 2], [11, 4, 79, 1], [11, 6, 76, 1], [11, 8, 73, 2], [11, 12, 69, 2],
      [12, 0, 74, 1], [12, 2, 77, 1], [12, 4, 79, 1], [12, 6, 81, 1], [12, 8, 84, 3], [12, 12, 81, 2],
      [13, 0, 83, 2], [13, 4, 79, 2], [13, 8, 77, 1], [13, 10, 79, 1], [13, 12, 83, 2],
      [14, 0, 82, 2], [14, 4, 84, 1], [14, 6, 86, 2], [14, 10, 84, 1], [14, 12, 82, 2],
      [15, 0, 81, 1], [15, 2, 79, 1], [15, 4, 77, 1], [15, 6, 76, 1], [15, 8, 73, 2], [15, 12, 74, 1], [15, 14, 76, 1],
    ]),
  }

  // BATTLE: COLOSSEUM — epic saw-brass fanfares in D minor, war toms, and the
  // stomp-stomp-CLAP of ten thousand gladiatorial bagholders.
  const coRoots = [38, 38, 46, 36, 38, 43, 45, 45] // Dm Dm Bb C Dm Gm A A
  const coChordMap = { 38: [65, 69, 74], 46: [65, 70, 74], 36: [67, 72, 76], 43: [67, 70, 74], 45: [69, 73, 76] }
  const colosseum = {
    bpm: 118, bars: 8, gain: 0.4, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadVol: 0.2, tomF: 95, padWave: 'sawtooth', padVol: 0.09,
    drums: {
      kick: 'x.x.....x.x.....', clap: '....x.......x...',
      tom: ['x..x..x.x..x..x.', 'x..x..x.x..xxxx.'],
      ride: 'x...x...x...x...',
      crash: ['x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
    },
    bass: bassFromRoots(coRoots, [[0, 0, 2], [3, 0, 1], [4, 0, 2], [8, 0, 2], [11, 0, 1], [12, 0, 2], [14, 12, 1]]),
    pad: coRoots.flatMap((r, b) => [
      { step: b * 16, ns: coChordMap[r], l: 7 },
      { step: b * 16 + 8, ns: coChordMap[r], l: 7 },
    ]),
    lead: notes(8 * 16, [
      [0, 0, 74, 3], [0, 4, 74, 1], [0, 6, 77, 2], [0, 8, 81, 4], [0, 14, 79, 1],
      [1, 0, 77, 2], [1, 4, 74, 2], [1, 8, 69, 4], [1, 12, 74, 2],
      [2, 0, 77, 3], [2, 4, 77, 1], [2, 6, 79, 2], [2, 8, 82, 4], [2, 14, 81, 1],
      [3, 0, 79, 2], [3, 4, 76, 2], [3, 8, 72, 3], [3, 12, 76, 2],
      [4, 0, 81, 3], [4, 4, 81, 1], [4, 6, 84, 2], [4, 8, 86, 4],
      [5, 0, 86, 2], [5, 4, 82, 2], [5, 8, 79, 3], [5, 12, 74, 2],
      [6, 0, 76, 2], [6, 4, 73, 2], [6, 8, 69, 3], [6, 12, 73, 2],
      [7, 0, 74, 1], [7, 2, 76, 1], [7, 4, 77, 2], [7, 8, 73, 4], [7, 12, 69, 1], [7, 14, 73, 1],
    ]),
  }

  // BATTLE: RESERVE CORE — final boss. Dark 8th-note ostinato with a tritone
  // sting, dissonant saw stabs, sine sub pulses, half-time drop at bar 8.
  const rcRoots = [36, 36, 36, 36, 44, 44, 42, 43, 36, 36, 44, 42, 36, 36, 42, 43]
  const rcChordMap = { 36: [72, 75, 78], 44: [68, 72, 75], 42: [66, 70, 73], 43: [67, 71, 77] }
  const rcOst = [[0, 0, 1], [2, 0, 1], [4, 3, 1], [6, 0, 1], [8, 0, 1], [10, 6, 1], [12, 3, 1], [14, 0, 1]]
  const rcPad = []
  rcRoots.forEach((r, b) => {
    if (b >= 8 && b < 12) rcPad.push({ step: b * 16, ns: rcChordMap[r], l: 8 })
    else rcPad.push({ step: b * 16 + 2, ns: rcChordMap[r], l: 1 }, { step: b * 16 + 10, ns: rcChordMap[r], l: 1 })
  })
  const reserve = {
    bpm: 148, bars: 16, gain: 0.4, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadVol: 0.18, bassCutoff: 760, padWave: 'sawtooth', padVol: 0.1,
    drums: {
      kick: [...rep('x...x...x...x...', 8), ...rep('x.....x.........', 4), ...rep('x...x...x...x...', 3), 'x...x...x..xx.xx'],
      snare: [...rep('....x.......x...', 8), ...rep('........x.......', 4), ...rep('....x.......x...', 4)],
      hat: [...rep('x.xxx.xxx.xxx.xx', 8), ...rep('x...x...x...x...', 4), ...rep('x.xxx.xxx.xxx.xx', 4)],
      crash: ['x...............', ...rep(EMPTY, 7), 'x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
    },
    bass: [
      ...bassFromRoots(rcRoots.slice(0, 8), rcOst),
      ...bassFromRoots(rcRoots.slice(8, 12), [[0, 0, 3], [8, 0, 3], [12, 3, 2]]),
      ...bassFromRoots(rcRoots.slice(12), rcOst),
    ],
    sub: bassFromRoots(rcRoots, [[0, -12, 4], [8, -12, 4]]),
    pad: rcPad,
    lead: notes(16 * 16, [
      [0, 0, 72, 1], [0, 2, 72, 1], [0, 4, 75, 2], [0, 8, 78, 2], [0, 12, 72, 2],
      [1, 0, 79, 2], [1, 4, 78, 2], [1, 8, 75, 2], [1, 12, 72, 2],
      [2, 0, 72, 1], [2, 2, 72, 1], [2, 4, 75, 2], [2, 8, 78, 2], [2, 12, 79, 2],
      [3, 0, 82, 2], [3, 4, 79, 2], [3, 8, 78, 2], [3, 12, 75, 2],
      [4, 0, 80, 2], [4, 4, 75, 2], [4, 8, 72, 2], [4, 12, 68, 2],
      [5, 0, 80, 1], [5, 2, 79, 1], [5, 4, 80, 2], [5, 8, 84, 3], [5, 14, 82, 1],
      [6, 0, 78, 2], [6, 4, 73, 2], [6, 8, 70, 2], [6, 12, 66, 2],
      [7, 0, 79, 1], [7, 2, 78, 1], [7, 4, 79, 2], [7, 8, 74, 2], [7, 12, 71, 1], [7, 14, 74, 1],
      // half-time drop — long dread
      [8, 0, 72, 6], [8, 8, 75, 8],
      [9, 0, 78, 6], [9, 8, 79, 4], [9, 12, 78, 2],
      [10, 0, 80, 8], [10, 8, 79, 4], [10, 12, 75, 4],
      [11, 0, 78, 8], [11, 8, 73, 8],
      // back at full boil
      [12, 0, 84, 1], [12, 2, 84, 1], [12, 4, 84, 2], [12, 8, 87, 2], [12, 12, 84, 2],
      [13, 0, 82, 2], [13, 4, 84, 1], [13, 6, 82, 1], [13, 8, 79, 2], [13, 12, 78, 2],
      [14, 0, 78, 1], [14, 2, 78, 1], [14, 4, 82, 2], [14, 8, 85, 2], [14, 12, 82, 2],
      [15, 0, 79, 1], [15, 2, 78, 1], [15, 4, 79, 1], [15, 6, 82, 1], [15, 8, 83, 2], [15, 12, 86, 2],
    ]),
  }

  TRACKS = {
    ...buildRadioTracks(), // §22 intro_hype + §26 radio station tracks
    title, menu, select, battle_meme_market: battle, results,
    battle_liquidity_swamp: swamp,
    battle_frozen_lab: frozen,
    battle_settlement_express: express,
    battle_mountain_node: mountain,
    battle_lost_block: lost,
    battle_capital_tower: tower,
    battle_calm_liquidation: liquidation,
    battle_colosseum: colosseum,
    battle_reserve_core: reserve,
  }
  return TRACKS
}

// -- voices ------------------------------------------------------------------

// Parametric kick: default = the classic v1 thump; specs may override via
// kickOpts (boom-bap 808-ish, EDM punch, tight metal double-kick, soft lofi).
function drumKick(ctx, out, t, o = {}) {
  const { f0 = 150, f1 = 46, dur = 0.11, vol = 0.8 } = o
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(f0, t)
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03)
  osc.connect(g); g.connect(out)
  osc.start(t); osc.stop(t + dur + 0.05)
}

function drumNoise(ctx, out, t, buf, { dur, vol, type, freq, Q = 1 }) {
  const src = ctx.createBufferSource()
  src.buffer = buf; src.loop = true
  const filt = ctx.createBiquadFilter()
  filt.type = type; filt.frequency.value = freq; filt.Q.value = Q
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filt); filt.connect(g); g.connect(out)
  src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.03)
}

function playNote(ctx, out, t, freq, gate, { wave, vol, cutoff = 0, echoSend = null }) {
  const osc = ctx.createOscillator()
  osc.type = wave
  osc.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.006)
  g.gain.setValueAtTime(vol, t + Math.max(0.01, gate - 0.03))
  g.gain.exponentialRampToValueAtTime(0.0001, t + gate)
  let head = osc
  if (cutoff) {
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'; filt.frequency.value = cutoff; filt.Q.value = 0.7
    osc.connect(filt); head = filt
  }
  head.connect(g)
  g.connect(out)
  if (echoSend) g.connect(echoSend)
  osc.start(t); osc.stop(t + gate + 0.05)
}

function drumTom(ctx, out, t, buf, f) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f, t)
  osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.2)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.7, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
  osc.connect(g); g.connect(out)
  osc.start(t); osc.stop(t + 0.3)
  drumNoise(ctx, out, t, buf, { dur: 0.03, vol: 0.16, type: 'lowpass', freq: 900 })
}

function drumClap(ctx, out, t, buf) {
  for (let i = 0; i < 3; i++) {
    drumNoise(ctx, out, t + i * 0.012, buf, { dur: 0.02, vol: 0.22, type: 'bandpass', freq: 1500, Q: 1.1 })
  }
  drumNoise(ctx, out, t + 0.032, buf, { dur: 0.13, vol: 0.3, type: 'bandpass', freq: 1250, Q: 0.9 })
}

// Glassy 2-op FM bell lead (frozen_lab). Rings past its gate like an icicle.
function bellNote(ctx, out, t, f, gate, vol, echoSend) {
  const dur = Math.max(0.28, gate * 1.3)
  const car = ctx.createOscillator()
  car.type = 'sine'; car.frequency.value = f
  const mod = ctx.createOscillator()
  mod.type = 'sine'; mod.frequency.value = f * 3.5307 // inharmonic = glass
  const mg = ctx.createGain()
  mg.gain.setValueAtTime(f * 0.9, t)
  mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.5)
  mod.connect(mg); mg.connect(car.frequency)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  car.connect(g); g.connect(out)
  if (echoSend) g.connect(echoSend)
  car.start(t); car.stop(t + dur + 0.05)
  mod.start(t); mod.stop(t + dur + 0.05)
}

// Auto-wah lead (liquidity_swamp): bandpass sweep bwaow per note.
function wahNote(ctx, out, t, f, gate, vol, wave, echoSend) {
  const osc = ctx.createOscillator()
  osc.type = wave
  osc.frequency.value = f
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'; filt.Q.value = 4
  filt.frequency.setValueAtTime(360, t)
  filt.frequency.exponentialRampToValueAtTime(2300, t + Math.min(0.14, gate * 0.5))
  filt.frequency.exponentialRampToValueAtTime(480, t + gate)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol * 1.7, t + 0.008) // bandpass eats level — make it back
  g.gain.setValueAtTime(vol * 1.7, t + Math.max(0.01, gate - 0.04))
  g.gain.exponentialRampToValueAtTime(0.0001, t + gate)
  osc.connect(filt); filt.connect(g); g.connect(out)
  if (echoSend) g.connect(echoSend)
  osc.start(t); osc.stop(t + gate + 0.05)
}

// Stutter-gated detuned pair (lost_block): square-LFO chops the note open/shut.
function glitchNote(ctx, out, t, f, gate, vol, wave, detune, stutterHz, echoSend) {
  for (const d of [-detune, detune]) {
    const osc = ctx.createOscillator()
    osc.type = wave; osc.frequency.value = f; osc.detune.value = d
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol * 0.62, t + 0.005)
    g.gain.setValueAtTime(vol * 0.62, t + Math.max(0.01, gate - 0.03))
    g.gain.exponentialRampToValueAtTime(0.0001, t + gate)
    const chop = ctx.createGain()
    chop.gain.value = 0.55
    const lfo = ctx.createOscillator()
    lfo.type = 'square'; lfo.frequency.value = stutterHz
    const lg = ctx.createGain(); lg.gain.value = 0.45
    lfo.connect(lg); lg.connect(chop.gain)
    osc.connect(g); g.connect(chop); chop.connect(out)
    if (echoSend) chop.connect(echoSend)
    osc.start(t); osc.stop(t + gate + 0.05)
    lfo.start(t); lfo.stop(t + gate + 0.05)
  }
}

// ── v2.1 station voices (§26) ────────────────────────────────────────────────

// Sidechain-pumped supersaw chord (EDM pads). Three detuned saws per chord
// tone into one lowpass + a gain envelope that ducks hard on every beat.
function superSawChord(ctx, out, t, freqs, dur, vol, beatDur, pump, cutoff = 3600) {
  const norm = ctx.createGain()
  norm.gain.value = 1 / Math.max(1, freqs.length * 3)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'; filt.frequency.value = cutoff; filt.Q.value = 0.5
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.03)
  if (pump && beatDur > 0.05) {
    for (let bt = t + beatDur; bt < t + dur - 0.08; bt += beatDur) {
      g.gain.setValueAtTime(vol * 0.24, bt)
      g.gain.linearRampToValueAtTime(vol, Math.min(bt + beatDur * 0.55, t + dur - 0.06))
    }
  }
  g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.05))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04)
  norm.connect(filt); filt.connect(g); g.connect(out)
  for (const f of freqs) {
    for (const det of [-11, 0, 11]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'; osc.frequency.value = f; osc.detune.value = det
      osc.connect(norm)
      osc.start(t); osc.stop(t + dur + 0.08)
    }
  }
}

// Distorted power chord (rock/metal riffs + palm-mute chugs): detuned saws at
// root+fifth summed into a tanh waveshaper — the intermodulation IS the grind.
let GUITAR_CURVE = null
function guitarCurve() {
  if (!GUITAR_CURVE) {
    const n = 1024
    GUITAR_CURVE = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      GUITAR_CURVE[i] = Math.tanh(x * 3.4)
    }
  }
  return GUITAR_CURVE
}

function guitarNote(ctx, out, t, f, gate, vol, { cutoff = 2400, chug = false } = {}) {
  const dur = chug ? Math.min(gate, 0.1) : Math.max(gate, 0.09)
  const norm = ctx.createGain()
  norm.gain.value = 0.55
  const sh = ctx.createWaveShaper()
  sh.curve = guitarCurve()
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'; filt.frequency.value = chug ? 820 : cutoff; filt.Q.value = 0.6
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.005)
  g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.03))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03)
  norm.connect(sh); sh.connect(filt); filt.connect(g); g.connect(out)
  for (const [mult, det] of [[1, -6], [1.003, 6], [1.4983, 0]]) { // root x2 + fifth
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'; osc.frequency.value = f * mult; osc.detune.value = det
    osc.connect(norm)
    osc.start(t); osc.stop(t + dur + 0.06)
  }
}

// Dusty lofi keys: triangle + hazy octave sine, wow/flutter via a slow detune
// LFO, dark lowpass, lazy attack. Rings slightly past its gate like worn tape.
function lofiNote(ctx, out, t, f, gate, vol, echoSend) {
  const dur = Math.max(0.26, gate * 1.05)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'; filt.frequency.value = 1900; filt.Q.value = 0.4
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.025)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  filt.connect(g); g.connect(out)
  if (echoSend) g.connect(echoSend)
  const osc = ctx.createOscillator()
  osc.type = 'triangle'; osc.frequency.value = f
  osc.connect(filt)
  const oct = ctx.createOscillator()
  oct.type = 'sine'; oct.frequency.value = f * 2.0015
  const og = ctx.createGain(); og.gain.value = 0.22
  oct.connect(og); og.connect(filt)
  const lfo = ctx.createOscillator() // wow/flutter
  lfo.type = 'sine'; lfo.frequency.value = 0.9
  const lg = ctx.createGain(); lg.gain.value = 7 // cents
  lfo.connect(lg); lg.connect(osc.detune); lg.connect(oct.detune)
  osc.start(t); osc.stop(t + dur + 0.05)
  oct.start(t); oct.stop(t + dur + 0.05)
  lfo.start(t); lfo.stop(t + dur + 0.05)
}

// Scratch-ish noise gesture (hiphop): fast bandpass zip up then back down.
function drumScratch(ctx, out, t, buf) {
  const src = ctx.createBufferSource()
  src.buffer = buf; src.loop = true; src.playbackRate.value = 1.7
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'; filt.Q.value = 3
  filt.frequency.setValueAtTime(620, t)
  filt.frequency.exponentialRampToValueAtTime(2700, t + 0.06)
  filt.frequency.exponentialRampToValueAtTime(520, t + 0.16)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.15, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  src.connect(filt); filt.connect(g); g.connect(out)
  src.start(t, Math.random() * 0.4); src.stop(t + 0.2)
}

// White-noise riser (EDM builds / intro hype): rising highpass sweep over
// `bars` bars, swelling from a whisper. Cuts itself clean at the top.
function noiseRiser(ctx, out, t, buf, barDur, bars) {
  const dur = Math.max(0.4, bars * barDur)
  const src = ctx.createBufferSource()
  src.buffer = buf; src.loop = true
  const filt = ctx.createBiquadFilter()
  filt.type = 'highpass'; filt.Q.value = 0.7
  filt.frequency.setValueAtTime(480, t)
  filt.frequency.exponentialRampToValueAtTime(6200, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.012, t)
  g.gain.linearRampToValueAtTime(0.12, t + dur - 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
  src.connect(filt); filt.connect(g); g.connect(out)
  src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.08)
}

function drumHit(lane, pattern, bar, stepInBar) {
  if (!pattern) return false
  const str = Array.isArray(pattern) ? pattern[bar % pattern.length] : pattern
  return str.charAt(stepInBar) === 'x'
}

// -- sequencer ---------------------------------------------------------------
const LOOKAHEAD = 0.18   // seconds of audio scheduled ahead
const TICK_MS = 40

function scheduleStep(ctx, st, s, t) {
  const spec = st.spec
  const bar = Math.floor(st.step / 16)
  const sib = st.step % 16
  const stepDur = 60 / spec.bpm / 4

  if (drumHit('kick', spec.drums.kick, bar, sib)) drumKick(ctx, st.bus, t, spec.kickOpts)
  if (drumHit('snare', spec.drums.snare, bar, sib)) {
    const so = spec.snareOpts || {}
    drumNoise(ctx, st.bus, t, s.noise, { dur: so.dur ?? 0.11, vol: so.vol ?? 0.4, type: 'bandpass', freq: so.freq ?? 1900, Q: 0.8 })
    playNote(ctx, st.bus, t, 190, 0.06, { wave: 'triangle', vol: so.toneVol ?? 0.25 })
  }
  if (drumHit('hat', spec.drums.hat, bar, sib)) {
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.03, vol: 0.15, type: 'highpass', freq: 6500 })
  }
  if (drumHit('crash', spec.drums.crash, bar, sib)) {
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.7, vol: 0.3, type: 'highpass', freq: 4200 })
  }
  if (drumHit('tom', spec.drums.tom, bar, sib)) drumTom(ctx, st.bus, t, s.noiseSoft, spec.tomF ?? 88)
  if (drumHit('tomHi', spec.drums.tomHi, bar, sib)) drumTom(ctx, st.bus, t, s.noiseSoft, (spec.tomF ?? 88) * 1.55)
  if (drumHit('clap', spec.drums.clap, bar, sib)) drumClap(ctx, st.bus, t, s.noise)
  if (drumHit('ride', spec.drums.ride, bar, sib)) {
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.26, vol: 0.08, type: 'highpass', freq: 7200 })
    playNote(ctx, st.bus, t, 5100, 0.2, { wave: 'triangle', vol: 0.03 })
  }
  if (drumHit('shaker', spec.drums.shaker, bar, sib)) {
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.05, vol: 0.07, type: 'highpass', freq: 8400 })
  }
  if (drumHit('rim', spec.drums.rim, bar, sib)) {
    playNote(ctx, st.bus, t, 1120, 0.03, { wave: 'square', vol: 0.1 })
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.02, vol: 0.1, type: 'bandpass', freq: 3300, Q: 2 })
  }
  if (drumHit('ohat', spec.drums.ohat, bar, sib)) {
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.14, vol: 0.11, type: 'highpass', freq: 5600 })
  }
  if (drumHit('scratch', spec.drums.scratch, bar, sib)) drumScratch(ctx, st.bus, t, s.noise)
  if (drumHit('pop', spec.drums.pop, bar, sib)) { // vinyl pop — subtle!
    drumNoise(ctx, st.bus, t, s.noise, { dur: 0.016, vol: 0.05, type: 'bandpass', freq: 3600, Q: 2 })
  }
  if (drumHit('riser', spec.drums.riser, bar, sib)) {
    noiseRiser(ctx, st.bus, t, s.noise, stepDur * 16, spec.riserBars ?? 2)
  }

  const b = spec.bass[st.step]
  if (b) {
    const bGate = b.l * stepDur * 0.85
    if (spec.bassStyle === 'chug') {
      guitarNote(ctx, st.bus, t, midi2freq(b.n), bGate, spec.bassVol ?? 0.2, { chug: true })
    } else {
      playNote(ctx, st.bus, t, midi2freq(b.n), bGate, {
        wave: spec.bassWave, vol: spec.bassVol ?? 0.4, cutoff: spec.bassCutoff ?? 950,
      })
    }
  }

  const sb = spec.sub ? spec.sub[st.step] : null
  if (sb) playNote(ctx, st.bus, t, midi2freq(sb.n), sb.l * stepDur * 0.9, { wave: 'sine', vol: 0.42 })

  const l = spec.lead[st.step]
  if (l) {
    const gate = l.l * stepDur * 0.9
    const f = midi2freq(l.n)
    const lv = spec.leadVol ?? 0.22
    const out = st.leadOut || st.bus
    if (spec.leadStyle === 'bell') {
      bellNote(ctx, out, t, f, gate, lv, st.echoSend)
    } else if (spec.leadStyle === 'guitar') {
      guitarNote(ctx, out, t, f, gate, lv, { cutoff: spec.leadCutoff ?? 2400 })
    } else if (spec.leadStyle === 'lofi') {
      lofiNote(ctx, out, t, f, gate, lv, st.echoSend)
    } else if (spec.leadStyle === 'wah') {
      wahNote(ctx, out, t, f, gate, lv, spec.leadWave, st.echoSend)
    } else if (spec.leadStyle === 'glitch') {
      glitchNote(ctx, out, t, f, gate, lv, spec.leadWave, spec.leadDetune ?? 18, spec.leadStutter ?? 11, st.echoSend)
    } else {
      playNote(ctx, out, t, f, gate, { wave: spec.leadWave, vol: lv, echoSend: st.echoSend })
      playNote(ctx, out, t, f * 1.004, gate, { wave: spec.leadWave, vol: lv * 0.45 }) // cheap chorus
    }
  }

  for (const ch of st.padAt[st.step] || []) {
    const dur = ch.l * stepDur * 0.95
    if (spec.padStyle === 'supersaw') {
      superSawChord(ctx, st.bus, t, ch.ns.map(midi2freq), dur, spec.padVol ?? 0.085,
        stepDur * 4, !!spec.pump, spec.padCutoff ?? 3600)
    } else {
      for (const n of ch.ns) {
        playNote(ctx, st.bus, t, midi2freq(n), dur, {
          wave: spec.padWave || 'triangle', vol: spec.padVol ?? 0.085, cutoff: spec.padCutoff ?? 0,
        })
      }
    }
  }
}

function pump(engine, st) {
  const s = S(engine)
  const ctx = s.ctx
  if (!ctx || s.music !== st) return
  const stepDur = 60 / st.spec.bpm / 4
  const total = st.spec.bars * 16
  const swing = st.spec.swing || 0 // odd 16ths land late → shuffle
  while (st.nextTime < ctx.currentTime + LOOKAHEAD) {
    const off = swing && st.step % 2 === 1 ? swing * stepDur : 0
    scheduleStep(ctx, st, s, st.nextTime + off)
    st.step = (st.step + 1) % total
    st.nextTime += stepDur
  }
}

// ── §26 radio router (v2.1.1: the station governs ALL music) ────────────────
// When settings.radio !== 'default', EVERY music request — title, menu, select,
// results, intro_hype AND battle_* — resolves to one of the active station's
// tracks ('default' keeps the per-context themes). Each playing track remembers
// its requested CONTEXT id in `sourceId`, so a live station change (including
// back to 'default') can restore the right theme even though uiKit's
// ensureMusic tracker never re-requests a context it already asked for.

const STATION_NAMES = ['hiphop', 'edm', 'lofi', 'rockmetal']

export function radioStation(engine) {
  try {
    const v = engine?.save?.get?.('settings.radio', 'default')
    return STATION_NAMES.includes(v) ? v : 'default'
  } catch (e) { return 'default' }
}

// Round-robin per station (random entry point): every fresh pick rotates to the
// next of the >=3 station tracks — never the same track twice in a row, and
// consecutive contexts (e.g. menu → battle) land on DIFFERENT tracks.
function nextStationTrack(engine, station) {
  const ids = STATION_IDS[station]
  if (!ids || !ids.length) return null
  const s = S(engine)
  const idx = s.radioIdx || (s.radioIdx = {})
  const i = idx[station] == null ? Math.floor(Math.random() * ids.length) : (idx[station] + 1) % ids.length
  idx[station] = i
  return ids[i]
}

// Live station change (save already written; called on 'settings:changed').
// Swaps the CURRENTLY PLAYING track at the next bar boundary (<= ~1 bar away)
// on ANY screen — menus, title, mid-intro, results, matches. Switching back to
// 'default' restores the context-appropriate theme via the remembered sourceId.
export function setRadioStation(engine) {
  const s = S(engine)
  if (!s || !s.ctx) return
  if (s.radioSwitchTimer) { clearTimeout(s.radioSwitchTimer); s.radioSwitchTimer = 0; s.radioSwitchFire = null }
  const st = s.music
  if (!st) return // nothing playing — the next request routes through the new station
  const station = radioStation(engine)
  const src = st.sourceId || st.id // requested CONTEXT id, not the resolved station id
  if (station === 'default') { if (st.id === src) return } // already on its theme
  else if (st.station === station && (STATION_IDS[station] || []).includes(st.id)) return // already on-station
  const stepDur = 60 / st.spec.bpm / 4
  const barDur = stepDur * 16
  // Slow (e.g. lofi ~70-82bpm) bars run ~2.9-3.4s — switch on the HALF-bar
  // there so a station change always lands within the spec's ~2s, while fast
  // tracks keep the full bar boundary. Hard cap at min(barDur, 2.0).
  const grid = barDur > 2.0 ? 8 : 16
  let delay = st.nextTime - s.ctx.currentTime + (grid - (st.step % grid)) * stepDur
  if (!(delay > 0.05)) delay = 0.05
  const cap = Math.min(barDur, 2.0)
  if (delay > cap) delay = cap
  const fire = () => {
    s.radioSwitchTimer = 0; s.radioSwitchFire = null
    if (S(engine).music !== st) return // something else took over — stand down
    startMusic(engine, src) // re-routes through the (new) station
  }
  s.radioSwitchFire = fire // exposed for tests / immediate flush
  s.radioSwitchTimer = setTimeout(fire, delay * 1000)
}

export function startMusic(engine, trackId) {
  const s = ensureSetup(engine)
  if (!s) return
  const tracks = buildTracks()
  let id = trackId
  let spec = tracks[trackId]
  if (!spec && typeof trackId === 'string' && trackId.startsWith('battle_')) {
    // unknown arena? every arena deserves a banger — borrow the meme market's
    console.debug('[audio] unknown battle track:', trackId, '— falling back to battle_meme_market')
    id = 'battle_meme_market'
    spec = tracks[id]
  }
  if (!spec) {
    console.debug('[audio] unknown music track:', trackId)
    // Boot-silence hardening: a bad id must never leave the game silent. If
    // something is already playing, keep it; otherwise fall back to the title.
    if (s.music) return
    id = 'title'
    spec = tracks.title
  }
  // §26 v2.1.1: EVERY request may reroute to the active radio station.
  // sourceId keeps the requested CONTEXT id (title/menu/select/results/
  // intro_hype/battle_*) so a station change can route back to the theme.
  const sourceId = id
  const station = radioStation(engine)
  if (station !== 'default') {
    // Stable per-context pick: re-requesting the context that's already
    // playing on this station keeps its current track (no restart, no re-roll).
    if (s.music && s.music.station === station && s.music.sourceId === sourceId) return
    const rid = nextStationTrack(engine, station)
    if (rid && tracks[rid]) { id = rid; spec = tracks[rid] }
  }
  if (s.music?.id === id) {
    s.music.sourceId = sourceId
    s.music.station = station
    return // already grooving
  }
  stopMusic(engine)

  const ctx = s.ctx
  const bus = ctx.createGain()
  bus.gain.setValueAtTime(0.0001, ctx.currentTime)
  bus.gain.linearRampToValueAtTime(spec.gain, ctx.currentTime + 0.4) // fade in
  bus.connect(engine.channels.music)

  // retro tape-ish echo for the lead line
  const echoSend = ctx.createGain(); echoSend.gain.value = 0.5
  const delay = ctx.createDelay(1.0); delay.delayTime.value = (60 / spec.bpm) * 0.75
  const fb = ctx.createGain(); fb.gain.value = 0.25
  const dampen = ctx.createBiquadFilter(); dampen.type = 'lowpass'; dampen.frequency.value = 2200
  echoSend.connect(delay); delay.connect(dampen); dampen.connect(fb); fb.connect(delay); dampen.connect(bus)

  // optional lead bus fx: 'crush' = stair-step waveshaper (bitcrush-y, lost_block)
  let leadOut = bus
  if (spec.leadFx === 'crush') {
    const sh = ctx.createWaveShaper()
    const n = 256, steps = 6, curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = Math.round(x * steps) / steps
    }
    sh.curve = curve
    leadOut = ctx.createGain()
    leadOut.gain.value = 1
    leadOut.connect(sh); sh.connect(bus)
  }

  // vinyl crackle bed (lofi station): looping slowed noise, barely there
  let crackleSrc = null
  if (spec.crackle) {
    try {
      crackleSrc = ctx.createBufferSource()
      crackleSrc.buffer = s.noise; crackleSrc.loop = true
      crackleSrc.playbackRate.value = 0.31
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = 2800; hp.Q.value = 0.5
      const cg = ctx.createGain(); cg.gain.value = spec.crackle
      crackleSrc.connect(hp); hp.connect(cg); cg.connect(bus)
      crackleSrc.start(ctx.currentTime, Math.random() * 0.7)
    } catch (e) { crackleSrc = null }
  }

  // pre-index pad chords by step for O(1) lookup
  const padAt = {}
  for (const ch of spec.pad || []) (padAt[ch.step] = padAt[ch.step] || []).push(ch)

  const st = {
    id, sourceId, station, spec, bus, echoSend, leadOut, padAt, crackleSrc,
    step: 0, nextTime: ctx.currentTime + 0.08, timer: 0,
  }
  st.timer = setInterval(() => {
    try { pump(engine, st) } catch (e) { console.debug('[audio] music pump failed', e); clearInterval(st.timer) }
  }, TICK_MS)
  s.music = st
  pump(engine, st)
}

export function stopMusic(engine) {
  const s = S(engine)
  if (s.radioSwitchTimer) { clearTimeout(s.radioSwitchTimer); s.radioSwitchTimer = 0; s.radioSwitchFire = null }
  const st = s.music
  if (!st) return
  s.music = null
  clearInterval(st.timer)
  try {
    const now = s.ctx.currentTime
    st.bus.gain.cancelScheduledValues(now)
    st.bus.gain.setValueAtTime(st.bus.gain.value, now)
    st.bus.gain.linearRampToValueAtTime(0.0001, now + 0.18)
  } catch (e) { /* context gone */ }
  setTimeout(() => {
    try { st.bus.disconnect() } catch (e) { /* noop */ }
    try { st.echoSend.disconnect() } catch (e) { /* noop */ }
    try { if (st.leadOut && st.leadOut !== st.bus) st.leadOut.disconnect() } catch (e) { /* noop */ }
    try { st.crackleSrc?.stop() } catch (e) { /* noop */ }
  }, 400)
}

// Test seam: the full track catalog (specs are data — safe to inspect).
export { buildTracks }
