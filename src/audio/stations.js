// §26 radio stations + the §22 intro hype track — pure pattern data in the
// music.js DSL (bpm/bars/gain/drums/bass/pad/lead + voice options). No audio
// code lives here: music.js's sequencer schedules these exactly like the
// arena themes. Four stations, >=3 tracks each, plus 'intro_hype'.
//
// DSL refresher (see music.js):
//   lead/bass: array (bars*16) of null | { n: midi, l: steps }
//   pad:       [{ step, ns: [midi...], l }]
//   drums:     lane -> 16-char string ('x' hits) or array of strings (per bar)
//   lanes:     kick snare hat crash tom tomHi clap ride shaker rim ohat
//              scratch pop riser

// -- helpers (mirrors of music.js's private ones — this module is data-only
//    and must not import from music.js: music.js imports US) ----------------

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

const EMPTY = '................'
const rep = (str, n) => new Array(n).fill(str)

// ---------------------------------------------------------------------------
// station registry — the router (music.js) rotates through these per match
// ---------------------------------------------------------------------------
export const STATION_IDS = {
  hiphop: ['radio_hiphop_boombap', 'radio_hiphop_lowend', 'radio_hiphop_backpack'],
  edm: ['radio_edm_pump', 'radio_edm_drop', 'radio_edm_rave'],
  lofi: ['radio_lofi_dust', 'radio_lofi_tape', 'radio_lofi_rain'],
  rockmetal: ['radio_rock_anthem', 'radio_rock_thrash', 'radio_rock_groove'],
}

let RADIO = null

export function buildRadioTracks() {
  if (RADIO) return RADIO

  // ── INTRO HYPE (§22) — driving, rising energy under the fighter-roll-call.
  // E minor, 56 bars @146bpm (~92s loop): pulse → groove → anthem → breakdown →
  // anthem B → bridge climb → anthem C → snare-roll build → final anthem →
  // turnaround, noise risers ramping every seam. The crowd is about to riot.
  // Sections (bars): S1 pulse 0-3 · S2 groove 4-7 · S3 anthem 8-15 ·
  // S4 breakdown 16-19 · S5 anthem 20-27 · S6 bridge 28-31 · S7 anthem 32-39 ·
  // S8 build 40-43 · S9 anthem 44-51 · S10 turnaround 52-55.
  const ihChords = {
    40: [64, 67, 71], // Em
    36: [64, 67, 72], // C
    38: [62, 66, 69], // D
    45: [69, 73, 76], // A (dorian lift)
    47: [71, 75, 78], // B (the "here we GO" dominant)
  }
  const ihAnthem = [40, 36, 45, 47, 40, 36, 38, 47]
  const ihRoots = [
    40, 40, 36, 38,   // S1 pulse
    40, 40, 36, 38,   // S2 groove
    ...ihAnthem,      // S3 anthem A
    36, 36, 45, 47,   // S4 breakdown
    ...ihAnthem,      // S5 anthem B
    45, 47, 36, 38,   // S6 bridge
    ...ihAnthem,      // S7 anthem C
    36, 38, 45, 47,   // S8 build
    ...ihAnthem,      // S9 final anthem
    40, 36, 38, 47,   // S10 turnaround
  ]
  // the big singable motif — reused each anthem pass, drums escalate around it
  const ihAnthemLead = (o) => [
    [o + 0, 0, 76, 4], [o + 0, 4, 79, 2], [o + 0, 6, 76, 2], [o + 0, 8, 83, 6], [o + 0, 14, 81, 1],
    [o + 1, 0, 79, 4], [o + 1, 4, 76, 2], [o + 1, 8, 74, 4], [o + 1, 12, 71, 2],
    [o + 2, 0, 72, 4], [o + 2, 4, 76, 2], [o + 2, 6, 79, 2], [o + 2, 8, 84, 6],
    [o + 3, 0, 83, 2], [o + 3, 2, 81, 1], [o + 3, 4, 79, 2], [o + 3, 8, 74, 4], [o + 3, 12, 78, 2],
    [o + 4, 0, 76, 4], [o + 4, 4, 79, 2], [o + 4, 6, 81, 2], [o + 4, 8, 83, 4], [o + 4, 12, 84, 2],
    [o + 5, 0, 84, 4], [o + 5, 4, 83, 2], [o + 5, 8, 79, 4], [o + 5, 12, 76, 2],
    [o + 6, 0, 74, 2], [o + 6, 2, 76, 1], [o + 6, 4, 78, 2], [o + 6, 8, 81, 4], [o + 6, 12, 83, 2],
    [o + 7, 0, 83, 2], [o + 7, 4, 81, 2], [o + 7, 8, 78, 2], [o + 7, 10, 75, 1], [o + 7, 12, 71, 2], [o + 7, 14, 75, 1],
  ]
  // bridge climb (bars 28-31, A B C D): 8th-note chord arps stepping upward
  const ihBridgeArp = []
  ;[45, 47, 36, 38].forEach((r, i) => {
    const tn = ihChords[r]
    const ord = [0, 1, 2, 1, 0, 1, 2, 1]
    for (let s = 0; s < 8; s++) ihBridgeArp.push([28 + i, s * 2, tn[ord[s]], 1])
  })
  const IH_K4 = 'x...x...x...x...'
  const IH_SN = '....x.......x...'
  const IH_H8 = 'x.x.x.x.x.x.x.x.'
  const IH_H16 = 'x.xxx.xxx.xxx.xx'
  const IH_FILL = 'x...x...x..xx.xx'
  const IH_BAR1 = 'x...............'
  const ihCrash = rep(EMPTY, 56)
  for (const b of [8, 20, 24, 32, 36, 44, 48, 52]) ihCrash[b] = IH_BAR1
  const ihTom = rep(EMPTY, 56)
  ihTom[7] = 'x..x..x.x..x..x.'
  ihTom[19] = '............x.x.'
  for (const b of [28, 29, 30, 31]) ihTom[b] = 'x..x..x.x..x..x.'
  ihTom[43] = 'x..x..x.x..xxxx.'
  const ihRiser = rep(EMPTY, 56)
  for (const b of [2, 6, 14, 18, 30, 42, 50, 54]) ihRiser[b] = IH_BAR1
  const intro_hype = {
    bpm: 146, bars: 56, gain: 0.42, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadVol: 0.2, bassVol: 0.4, bassCutoff: 1000,
    padStyle: 'supersaw', pump: true, padVol: 0.095, padCutoff: 4200,
    riserBars: 2,
    kickOpts: { f0: 165, f1: 50, dur: 0.1, vol: 0.85 },
    drums: {
      kick: [
        ...rep('x.......x.......', 4),            // S1 pulse
        ...rep(IH_K4, 4),                          // S2
        ...rep(IH_K4, 7), IH_FILL,                 // S3
        ...rep('x.......x.......', 4),             // S4 breakdown
        ...rep(IH_K4, 8),                          // S5
        ...rep('x.......x.......', 4),             // S6 (toms carry it)
        ...rep(IH_K4, 7), IH_FILL,                 // S7
        ...rep(IH_K4, 4),                          // S8
        ...rep(IH_K4, 8),                          // S9
        ...rep(IH_K4, 3), IH_FILL,                 // S10
      ],
      snare: [
        ...rep(EMPTY, 4),                          // S1
        ...rep(IH_SN, 4),                          // S2
        ...rep(IH_SN, 8),                          // S3
        ...rep(EMPTY, 3), '............x...',      // S4
        ...rep(IH_SN, 8),                          // S5
        ...rep(IH_SN, 4),                          // S6
        ...rep(IH_SN, 8),                          // S7
        IH_K4, IH_K4, IH_H8, 'x.x.x.x.xxxxxxxx',   // S8 snare-roll build
        ...rep(IH_SN, 7), '....x.......xx.x',      // S9
        ...rep(IH_SN, 3), '....x..x....xx.x',      // S10
      ],
      hat: [
        ...rep('....x.......x...', 4),             // S1
        ...rep(IH_H8, 4),                          // S2
        ...rep(IH_H16, 8),                         // S3
        ...rep('....x.......x...', 4),             // S4
        ...rep(IH_H16, 8),                         // S5
        ...rep(IH_H8, 4),                          // S6
        ...rep(IH_H16, 8),                         // S7
        ...rep(IH_H8, 4),                          // S8
        ...rep(IH_H16, 8),                         // S9
        ...rep(IH_H16, 4),                         // S10
      ],
      ohat: [
        ...rep(EMPTY, 20), ...rep('..x...x...x...x.', 8),   // quiet until S5
        ...rep(EMPTY, 4), ...rep('..x...x...x...x.', 8),    // S6 rest, S7 on
        ...rep(EMPTY, 4), ...rep('..x...x...x...x.', 12),   // S8 rest, S9+S10 on
      ],
      crash: ihCrash,
      tom: ihTom,
      riser: ihRiser,
    },
    bass: [
      ...bassFromRoots(ihRoots.slice(0, 4), [[0, 0, 8], [8, 0, 8]]),
      ...bassFromRoots(ihRoots.slice(4, 16), [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
      ...bassFromRoots(ihRoots.slice(16, 20), [[0, 0, 8], [8, 0, 8]]),
      ...bassFromRoots(ihRoots.slice(20, 28), [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
      ...bassFromRoots(ihRoots.slice(28, 32), [[0, 0, 2], [4, 0, 2], [8, 0, 2], [12, 0, 2]]),
      ...bassFromRoots(ihRoots.slice(32, 40), [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
      ...bassFromRoots(ihRoots.slice(40, 44), [[0, 0, 2], [4, 0, 2], [8, 0, 2], [12, 0, 2]]),
      ...bassFromRoots(ihRoots.slice(44, 56), [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
    ],
    pad: padWholeBars(ihRoots, ihChords),
    lead: notes(56 * 16, [
      // S2 — short calls answering the roll-call
      [4, 8, 76, 2], [4, 12, 79, 2],
      [5, 8, 74, 2], [5, 12, 71, 2],
      [6, 8, 72, 2], [6, 12, 76, 2],
      [7, 8, 78, 2], [7, 12, 79, 2], [7, 14, 81, 2],
      // S3 — the anthem, first pass
      ...ihAnthemLead(8),
      // S4 — breakdown: long floating tones over the risers
      [16, 0, 76, 10], [16, 12, 79, 4],
      [17, 0, 79, 10], [17, 12, 76, 4],
      [18, 0, 76, 8], [18, 8, 73, 6],
      [19, 0, 75, 8], [19, 8, 78, 6],
      // S5 — anthem B
      ...ihAnthemLead(20),
      // S6 — bridge climb arps
      ...ihBridgeArp,
      // S7 — anthem C
      ...ihAnthemLead(32),
      // S8 — build stabs rising under the snare roll
      [40, 0, 76, 2], [40, 8, 79, 2],
      [41, 0, 78, 2], [41, 8, 81, 2],
      [42, 0, 81, 2], [42, 8, 85, 2],
      [43, 0, 83, 1], [43, 4, 85, 1], [43, 8, 87, 1], [43, 12, 88, 1],
      // S9 — final anthem
      ...ihAnthemLead(44),
      // S10 — turnaround, big descending lap onto the dominant
      [52, 0, 88, 4], [52, 4, 86, 2], [52, 6, 83, 2], [52, 8, 79, 4], [52, 12, 76, 2],
      [53, 0, 84, 4], [53, 4, 79, 2], [53, 8, 76, 4], [53, 12, 72, 2],
      [54, 0, 74, 2], [54, 2, 76, 1], [54, 4, 78, 2], [54, 8, 81, 4], [54, 12, 83, 2],
      [55, 0, 83, 2], [55, 4, 81, 2], [55, 8, 78, 2], [55, 10, 75, 2], [55, 12, 71, 2], [55, 14, 75, 1],
    ]),
  }

  // ══ HIPHOP — boom-bap drums, fat bass, sample-ish stabs ══════════════════

  // BOOM-BAP — 92bpm swung head-nodder in A minor. Dusty kick, cracking
  // snare, a scratch answering every fourth bar.
  const hh1Roots = [45, 45, 41, 43, 45, 45, 41, 38]
  const hh1Stabs = { 45: [69, 72, 76], 41: [69, 72, 77], 43: [71, 74, 79], 38: [69, 74, 77] }
  const radio_hiphop_boombap = {
    bpm: 92, bars: 8, gain: 0.4, leadWave: 'triangle', bassWave: 'sawtooth',
    swing: 0.14, leadVol: 0.19, bassVol: 0.42, bassCutoff: 700,
    padWave: 'sawtooth', padVol: 0.1,
    kickOpts: { f0: 130, f1: 40, dur: 0.18, vol: 0.9 },
    snareOpts: { freq: 1700, vol: 0.44, toneVol: 0.22 },
    drums: {
      kick: 'x.....x...x.....', snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.',
      scratch: [...rep(EMPTY, 3), '............x...', ...rep(EMPTY, 3), '........x...x...'],
    },
    bass: bassFromRoots(hh1Roots, [[0, 0, 2], [3, 0, 1], [6, 0, 1], [8, 0, 2], [11, 12, 1], [12, 0, 2]]),
    pad: hh1Roots.flatMap((r, b) => (b % 2 === 0
      ? [{ step: b * 16 + 6, ns: hh1Stabs[r], l: 1 }]
      : [{ step: b * 16 + 6, ns: hh1Stabs[r], l: 1 }, { step: b * 16 + 12, ns: hh1Stabs[r], l: 1 }])),
    lead: notes(8 * 16, [
      [0, 4, 76, 2], [0, 8, 74, 1], [0, 10, 72, 2],
      [1, 4, 69, 2], [1, 12, 72, 1], [1, 14, 74, 1],
      [2, 4, 76, 2], [2, 8, 79, 2], [2, 12, 76, 1],
      [3, 4, 74, 2], [3, 8, 72, 1], [3, 10, 69, 3],
      [4, 4, 76, 2], [4, 8, 74, 1], [4, 10, 72, 2],
      [5, 4, 69, 2], [5, 12, 72, 1], [5, 14, 74, 1],
      [6, 4, 81, 2], [6, 8, 79, 2], [6, 12, 76, 1],
      [7, 4, 74, 1], [7, 6, 72, 1], [7, 8, 69, 3], [7, 14, 67, 1],
    ]),
  }

  // LOW END — 88bpm sub-heavy D minor stomp. 808 boom that hangs, sparse
  // hats, rimshots ticking off the bar.
  const hh2Roots = [38, 38, 46, 45, 38, 38, 43, 45]
  const hh2Stabs = { 38: [65, 69, 74], 46: [70, 74, 77], 45: [69, 73, 76], 43: [67, 70, 74] }
  const radio_hiphop_lowend = {
    bpm: 88, bars: 8, gain: 0.4, leadWave: 'triangle', bassWave: 'sine',
    swing: 0.1, leadVol: 0.18, bassVol: 0.5,
    padWave: 'sawtooth', padVol: 0.09,
    kickOpts: { f0: 110, f1: 38, dur: 0.2, vol: 0.95 },
    snareOpts: { freq: 1500, vol: 0.4, toneVol: 0.2 },
    drums: {
      kick: 'x..x......x.....', snare: '....x.......x...',
      hat: '..x...x...x...x.', rim: '.......x.......x',
      ohat: '..........x.....',
      scratch: [...rep(EMPTY, 7), '............x...'],
    },
    bass: bassFromRoots(hh2Roots, [[0, 0, 3], [6, 0, 1], [8, 0, 3], [14, 12, 1]]),
    pad: hh2Roots.flatMap((r, b) => [{ step: b * 16 + 4, ns: hh2Stabs[r], l: 1 }]),
    lead: notes(8 * 16, [
      [0, 2, 74, 2], [0, 8, 77, 2], [0, 12, 74, 1],
      [1, 2, 72, 2], [1, 8, 69, 3],
      [2, 2, 74, 2], [2, 8, 77, 2], [2, 12, 79, 2],
      [3, 2, 81, 2], [3, 6, 79, 1], [3, 8, 77, 2], [3, 12, 74, 2],
      [4, 2, 74, 2], [4, 8, 77, 2], [4, 12, 74, 1],
      [5, 2, 72, 2], [5, 8, 69, 3],
      [6, 2, 79, 2], [6, 8, 77, 1], [6, 10, 74, 2],
      [7, 2, 76, 2], [7, 6, 74, 1], [7, 8, 72, 2], [7, 12, 69, 3],
    ]),
  }

  // BACKPACK — 95bpm jazzier E-minor cut. Loose hats, walking-ish bass,
  // seventh-chord stabs where a sampler's horn section would sit.
  const hh3Roots = [40, 40, 45, 47, 40, 40, 36, 38]
  const hh3Stabs = { 40: [67, 71, 74], 45: [69, 73, 76], 47: [71, 75, 78], 36: [72, 76, 79], 38: [74, 78, 81] }
  const radio_hiphop_backpack = {
    bpm: 95, bars: 8, gain: 0.4, leadWave: 'triangle', bassWave: 'sawtooth',
    swing: 0.16, leadVol: 0.18, bassVol: 0.4, bassCutoff: 750,
    padWave: 'sawtooth', padVol: 0.095,
    kickOpts: { f0: 125, f1: 42, dur: 0.16, vol: 0.85 },
    snareOpts: { freq: 1800, vol: 0.4, toneVol: 0.2 },
    drums: {
      kick: 'x.....x..x......', snare: '....x.......x...',
      hat: ['x.xx.x.xx.x.x.xx', 'x.x.xx.xx.xx.x..'],
      ohat: '..............x.',
      scratch: [...rep(EMPTY, 3), '............x.x.', ...rep(EMPTY, 4)],
    },
    bass: bassFromRoots(hh3Roots, [[0, 0, 2], [4, 7, 1], [6, 0, 1], [8, 0, 2], [12, 10, 1], [14, 12, 1]]),
    pad: hh3Roots.flatMap((r, b) => (b % 2 === 1
      ? [{ step: b * 16 + 2, ns: hh3Stabs[r], l: 1 }, { step: b * 16 + 10, ns: hh3Stabs[r], l: 1 }]
      : [{ step: b * 16 + 6, ns: hh3Stabs[r], l: 1 }])),
    lead: notes(8 * 16, [
      [0, 2, 79, 2], [0, 8, 76, 2], [0, 12, 74, 2],
      [1, 2, 76, 2], [1, 6, 74, 1], [1, 8, 71, 3],
      [2, 2, 81, 2], [2, 8, 79, 2], [2, 12, 76, 1],
      [3, 2, 78, 2], [3, 6, 76, 1], [3, 8, 74, 2], [3, 14, 71, 1],
      [4, 2, 79, 2], [4, 8, 76, 2], [4, 12, 74, 2],
      [5, 2, 76, 2], [5, 6, 74, 1], [5, 8, 71, 3],
      [6, 2, 84, 2], [6, 8, 83, 2], [6, 12, 79, 1],
      [7, 2, 81, 2], [7, 6, 78, 1], [7, 8, 76, 2], [7, 12, 74, 1], [7, 14, 76, 1],
    ]),
  }

  // ══ EDM — four-on-floor, supersaw builds/drops ═══════════════════════════

  // helper: 16th-note chord arp on the lead lane
  const arpLead = (roots, tones, order) => {
    const arr = new Array(roots.length * 16).fill(null)
    roots.forEach((r, b) => {
      const tn = tones[r]
      for (let i = 0; i < 8; i++) arr[b * 16 + i * 2] = { n: tn[order[i % order.length]], l: 1 }
    })
    return arr
  }

  // PUMP — 128bpm A-minor festival pump. Sidechained supersaw wall, offbeat
  // bass, riser into every loop.
  const ed1Roots = [45, 45, 41, 41, 36, 36, 43, 43]
  const ed1Chords = { 45: [69, 72, 76], 41: [69, 72, 77], 36: [67, 72, 76], 43: [67, 71, 74] }
  const radio_edm_pump = {
    bpm: 128, bars: 8, gain: 0.4, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadVol: 0.15, bassVol: 0.4, bassCutoff: 900,
    padStyle: 'supersaw', pump: true, padVol: 0.11, padCutoff: 4200,
    riserBars: 2,
    kickOpts: { f0: 170, f1: 50, dur: 0.1, vol: 0.9 },
    drums: {
      kick: 'x...x...x...x...', clap: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.',
      crash: ['x...............', ...rep(EMPTY, 7)],
      riser: [...rep(EMPTY, 6), 'x...............', EMPTY],
    },
    bass: bassFromRoots(ed1Roots, [[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 0, 2]]),
    pad: padWholeBars(ed1Roots, ed1Chords),
    lead: arpLead(ed1Roots, ed1Chords, [0, 1, 2, 1, 0, 2, 1, 2]),
  }

  // DROP — 126bpm E minor with an actual build: four floating bars, four
  // climbing bars with a snare roll, then an eight-bar supersaw drop.
  const ed2Roots4 = [40, 36, 43, 38]
  const ed2Roots = [...ed2Roots4, ...ed2Roots4, ...ed2Roots4, ...ed2Roots4]
  const ed2Chords = { 40: [67, 71, 76], 36: [67, 72, 76], 43: [67, 71, 74], 38: [66, 69, 74] }
  const ed2Pad = [
    ...ed2Roots.slice(0, 8).map((r, b) => ({ step: b * 16, ns: ed2Chords[r], l: 16 })),
    ...ed2Roots.slice(8).flatMap((r, i) => [
      { step: (8 + i) * 16 + 2, ns: ed2Chords[r], l: 2 },
      { step: (8 + i) * 16 + 6, ns: ed2Chords[r], l: 2 },
      { step: (8 + i) * 16 + 10, ns: ed2Chords[r], l: 2 },
      { step: (8 + i) * 16 + 14, ns: ed2Chords[r], l: 2 },
    ]),
  ]
  const ed2Lead = new Array(16 * 16).fill(null)
  ed2Roots.slice(8).forEach((r, i) => {
    const tn = ed2Chords[r]
    const order = [0, 2, 1, 2, 0, 2, 1, 2]
    for (let s = 0; s < 8; s++) ed2Lead[(8 + i) * 16 + s * 2] = { n: tn[order[s]] + 12, l: 1 }
  })
  // build-section plucks
  for (const [bar, st, n, l] of [[4, 0, 76, 2], [4, 8, 79, 2], [5, 0, 76, 2], [5, 8, 79, 2],
    [6, 0, 78, 2], [6, 8, 81, 2], [7, 0, 78, 1], [7, 4, 81, 1], [7, 8, 83, 1], [7, 12, 86, 1]]) {
    ed2Lead[bar * 16 + st] = { n, l }
  }
  const radio_edm_drop = {
    bpm: 126, bars: 16, gain: 0.4, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadVol: 0.15, bassVol: 0.42, bassCutoff: 950,
    padStyle: 'supersaw', pump: true, padVol: 0.11, padCutoff: 3800,
    riserBars: 2,
    kickOpts: { f0: 175, f1: 52, dur: 0.1, vol: 0.9 },
    drums: {
      kick: [...rep(EMPTY, 4), ...rep('x...x...x...x...', 3), EMPTY, ...rep('x...x...x...x...', 8)],
      clap: [...rep(EMPTY, 4), ...rep('....x.......x...', 3), EMPTY, ...rep('....x.......x...', 8)],
      snare: [...rep(EMPTY, 6), 'x...x...x...x...', 'x.x.x.x.xxxxxxxx', ...rep(EMPTY, 8)],
      hat: [...rep('....x.......x...', 4), ...rep('x.x.x.x.x.x.x.x.', 4), ...rep('x.x.x.x.x.x.x.x.', 8)],
      ohat: [...rep(EMPTY, 8), ...rep('..x...x...x...x.', 8)],
      crash: [...rep(EMPTY, 8), 'x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
      riser: [...rep(EMPTY, 6), 'x...............', EMPTY, ...rep(EMPTY, 6), 'x...............', EMPTY],
    },
    bass: [
      ...bassFromRoots(ed2Roots.slice(0, 8), [[0, 0, 8], [8, 0, 8]]),
      ...bassFromRoots(ed2Roots.slice(8), [[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 0, 2]]),
    ],
    pad: ed2Pad,
    lead: ed2Lead,
  }

  // RAVE — 132bpm F-minor warehouse strober. Shaker sixteenths, octave-jump
  // stab arps, hands unfortunately in the air.
  const ed3Roots = [41, 41, 44, 46, 41, 41, 44, 48]
  const ed3Chords = { 41: [68, 72, 77], 44: [72, 75, 80], 46: [70, 73, 77], 48: [72, 75, 79] }
  const ed3Lead = new Array(8 * 16).fill(null)
  ed3Roots.forEach((r, b) => {
    const tn = ed3Chords[r]
    const order = [0, 0, 1, 0, 2, 0, 1, 2]
    for (let i = 0; i < 8; i++) {
      const oct = (i === 4 || i === 7) ? 12 : 0
      ed3Lead[b * 16 + i * 2] = { n: tn[order[i]] + oct, l: 1 }
    }
  })
  const radio_edm_rave = {
    bpm: 132, bars: 8, gain: 0.4, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadVol: 0.14, bassVol: 0.42, bassCutoff: 900,
    padStyle: 'supersaw', pump: true, padVol: 0.1, padCutoff: 4600,
    riserBars: 2,
    kickOpts: { f0: 180, f1: 54, dur: 0.09, vol: 0.9 },
    drums: {
      kick: 'x...x...x...x...', clap: '....x.......x...',
      shaker: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.',
      crash: ['x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
      riser: [...rep(EMPTY, 6), 'x...............', EMPTY],
    },
    bass: bassFromRoots(ed3Roots, [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 0, 1], [14, 12, 1]]),
    pad: ed3Roots.flatMap((r, b) => [
      { step: b * 16 + 2, ns: ed3Chords[r], l: 2 },
      { step: b * 16 + 10, ns: ed3Chords[r], l: 2 },
    ]),
    lead: ed3Lead,
  }

  // ══ LOFI — dusty keys, vinyl crackle, laid-back drums ════════════════════

  // DUST — 76bpm descending maj7 stroll (F E D C). Soft thumpy kick, worn
  // keys with wow/flutter, crackle bed, the occasional vinyl pop.
  const lf1Roots = [41, 40, 38, 36, 41, 40, 38, 36]
  const lf1Chords = { 41: [69, 72, 76], 40: [67, 71, 74], 38: [65, 69, 72], 36: [64, 67, 71] }
  const radio_lofi_dust = {
    bpm: 76, bars: 8, gain: 0.38, leadWave: 'triangle', bassWave: 'triangle',
    leadStyle: 'lofi', crackle: 0.05, swing: 0.2,
    leadVol: 0.22, bassVol: 0.42, padWave: 'triangle', padVol: 0.07,
    kickOpts: { f0: 100, f1: 48, dur: 0.13, vol: 0.6 },
    snareOpts: { freq: 1400, vol: 0.24, toneVol: 0.1 },
    drums: {
      kick: 'x......x..x.....', snare: '....x.......x...',
      hat: '..x...x...x...x.',
      pop: ['..x.........x...', '.......x........', EMPTY, '....x......x....'],
    },
    bass: bassFromRoots(lf1Roots, [[0, 0, 6], [8, 0, 4], [12, 0, 3]]),
    pad: padWholeBars(lf1Roots, lf1Chords),
    lead: notes(8 * 16, [
      [0, 2, 81, 3], [0, 8, 79, 4],
      [1, 2, 79, 2], [1, 6, 76, 4], [1, 12, 74, 2],
      [2, 2, 77, 3], [2, 8, 76, 2], [2, 12, 72, 3],
      [3, 4, 74, 4], [3, 10, 71, 2], [3, 14, 72, 4],
      [4, 2, 81, 3], [4, 8, 84, 4],
      [5, 2, 83, 2], [5, 6, 79, 4], [5, 12, 76, 2],
      [6, 2, 77, 3], [6, 8, 76, 2], [6, 12, 74, 3],
      [7, 4, 72, 4], [7, 10, 74, 2], [7, 14, 76, 3],
    ]),
  }

  // TAPE — 80bpm A-minor turnarounds (Am F Dm E7). A little more motion,
  // same worn-cassette softness.
  const lf2Roots = [45, 41, 38, 40, 45, 41, 38, 40]
  const lf2Chords = { 45: [67, 72, 76], 41: [69, 72, 77], 38: [65, 69, 74], 40: [68, 71, 76] }
  const radio_lofi_tape = {
    bpm: 80, bars: 8, gain: 0.38, leadWave: 'triangle', bassWave: 'triangle',
    leadStyle: 'lofi', crackle: 0.04, swing: 0.14,
    leadVol: 0.22, bassVol: 0.42, padWave: 'triangle', padVol: 0.07,
    kickOpts: { f0: 105, f1: 50, dur: 0.12, vol: 0.62 },
    snareOpts: { freq: 1500, vol: 0.26, toneVol: 0.12 },
    drums: {
      kick: 'x.....x...x.....', snare: '....x.......x...',
      hat: 'x...x.x.x...x.x.', rim: '..........x.....',
      pop: [EMPTY, '.....x..........', '..x.........x...', EMPTY],
    },
    bass: bassFromRoots(lf2Roots, [[0, 0, 4], [6, 0, 1], [8, 0, 4], [14, 12, 1]]),
    pad: padWholeBars(lf2Roots, lf2Chords),
    lead: notes(8 * 16, [
      [0, 2, 76, 3], [0, 8, 72, 2], [0, 12, 74, 3],
      [1, 2, 77, 2], [1, 8, 76, 4],
      [2, 2, 74, 3], [2, 8, 69, 2], [2, 12, 72, 3],
      [3, 2, 71, 2], [3, 8, 68, 4], [3, 14, 71, 2],
      [4, 2, 76, 3], [4, 8, 79, 2], [4, 12, 81, 3],
      [5, 2, 77, 2], [5, 8, 76, 2], [5, 12, 72, 3],
      [6, 2, 74, 3], [6, 8, 77, 2], [6, 12, 74, 2],
      [7, 2, 76, 4], [7, 10, 71, 2], [7, 14, 69, 3],
    ]),
  }

  // RAIN — 70bpm D-dorian drizzle. The sparsest of the three: brushed
  // shaker, heavy swing, keys mostly staying out of the way.
  const lf3Roots = [38, 43, 38, 43, 46, 45, 38, 38]
  const lf3Chords = { 38: [65, 69, 72], 43: [65, 71, 74], 46: [65, 70, 74], 45: [67, 73, 76] }
  const radio_lofi_rain = {
    bpm: 70, bars: 8, gain: 0.38, leadWave: 'triangle', bassWave: 'triangle',
    leadStyle: 'lofi', crackle: 0.06, swing: 0.22,
    leadVol: 0.21, bassVol: 0.4, padWave: 'triangle', padVol: 0.065,
    kickOpts: { f0: 95, f1: 46, dur: 0.14, vol: 0.58 },
    snareOpts: { freq: 1300, vol: 0.22, toneVol: 0.08 },
    drums: {
      kick: 'x.........x.....', snare: '....x.......x...',
      shaker: '..x...x...x...x.',
      pop: ['....x...........', EMPTY, '..........x.....', EMPTY],
    },
    bass: bassFromRoots(lf3Roots, [[0, 0, 8], [10, 0, 4]]),
    pad: padWholeBars(lf3Roots, lf3Chords),
    lead: notes(8 * 16, [
      [0, 4, 74, 4], [0, 12, 77, 3],
      [1, 4, 76, 3], [1, 10, 72, 4],
      [2, 4, 74, 4], [2, 12, 79, 3],
      [3, 4, 77, 3], [3, 10, 74, 4],
      [4, 4, 82, 4], [4, 12, 81, 3],
      [5, 4, 79, 3], [5, 10, 76, 4],
      [6, 4, 74, 4], [6, 12, 72, 3],
      [7, 4, 69, 6], [7, 12, 74, 4],
    ]),
  }

  // ══ ROCK/METAL — distorted power chords, driving double-kick ════════════
  // The lead lane IS the riff guitar (leadStyle 'guitar' auto-stacks the
  // fifth), the bass lane palm-mute chugs under it (bassStyle 'chug').

  // helper: riff bars — per bar, the same rhythmic figure on that bar's root
  const riffLead = (bars, riffRoots, figure) => {
    const list = []
    riffRoots.forEach((r, b) => {
      for (const [st, off, l] of figure(b)) list.push([b, st, r + off, l])
    })
    return notes(bars * 16, list)
  }

  // ANTHEM — 152bpm E-minor fist-pumper. Galloping kick pairs, big open
  // chords on the turns.
  const rk1Bass = [40, 40, 36, 38, 40, 40, 36, 43]
  const rk1Riff = [52, 52, 48, 50, 52, 52, 48, 55]
  const radio_rock_anthem = {
    bpm: 152, bars: 8, gain: 0.42, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadStyle: 'guitar', leadCutoff: 2600, leadVol: 0.22,
    bassStyle: 'chug', bassVol: 0.26,
    kickOpts: { f0: 180, f1: 60, dur: 0.08, vol: 0.85 },
    drums: {
      kick: ['x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.xxxx'],
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      crash: ['x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
    },
    bass: bassFromRoots(rk1Bass, [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
    pad: [],
    lead: riffLead(8, rk1Riff, (b) => (b % 4 === 3
      ? [[0, 0, 2], [4, 0, 1], [6, 2, 1], [8, 3, 2], [12, 5, 2], [14, 7, 1]]
      : [[0, 0, 2], [4, 0, 1], [6, 0, 1], [8, 3, 2], [12, 0, 1], [14, 2, 1]])),
  }

  // THRASH — 160bpm E-phrygian sprint. Sixteenth-gallop kick, the half-step
  // F stab doing the menacing, a squealed turnaround every eighth bar.
  const rk2Bass = [40, 40, 41, 40, 40, 40, 41, 43]
  const rk2Riff = [52, 52, 53, 52, 52, 52, 53, 55]
  const radio_rock_thrash = {
    bpm: 160, bars: 8, gain: 0.42, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadStyle: 'guitar', leadCutoff: 2800, leadVol: 0.21,
    bassStyle: 'chug', bassVol: 0.26,
    kickOpts: { f0: 190, f1: 64, dur: 0.07, vol: 0.85 },
    drums: {
      kick: 'x.xxx.xxx.xxx.xx',
      snare: '....x.......x...',
      ride: 'x...x...x...x...',
      crash: ['x...............', ...rep(EMPTY, 7)],
    },
    bass: bassFromRoots(rk2Bass, [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
    pad: [],
    lead: riffLead(8, rk2Riff, (b) => (b === 7
      ? [[0, 0, 1], [2, 0, 1], [4, 3, 1], [6, 5, 1], [8, 6, 2], [12, 12, 2], [14, 13, 1]]
      : [[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 1, 1], [8, 0, 2], [12, 0, 1], [14, 1, 1]])),
  }

  // GROOVE — 142bpm half-time A-minor neck-snapper. Space between the hits,
  // the Bb half-step lean, toms answering the riff.
  const rk3Bass = [45, 45, 48, 46, 45, 45, 48, 50]
  const rk3Riff = [45, 45, 48, 46, 45, 45, 48, 50]
  const radio_rock_groove = {
    bpm: 142, bars: 8, gain: 0.42, leadWave: 'sawtooth', bassWave: 'sawtooth',
    leadStyle: 'guitar', leadCutoff: 2200, leadVol: 0.24,
    bassStyle: 'chug', bassVol: 0.28, tomF: 90,
    kickOpts: { f0: 170, f1: 56, dur: 0.09, vol: 0.9 },
    drums: {
      kick: [...rep('x..x..x...x.x...', 3), 'x..x..x..xxxxxx.'], // double-kick run on the turn
      snare: '........x.......',
      hat: 'x.x.x.x.x.x.x.x.',
      tom: [EMPTY, '............x.x.', EMPTY, '............xxx.'],
      crash: ['x...............', ...rep(EMPTY, 3), 'x...............', ...rep(EMPTY, 3)],
    },
    bass: bassFromRoots(rk3Bass, [[0, 0, 1], [3, 0, 1], [6, 0, 1], [10, 0, 1], [12, 0, 1], [14, 0, 1]]),
    pad: [],
    lead: riffLead(8, rk3Riff, (b) => (b % 4 === 3
      ? [[0, 0, 2], [3, 0, 1], [6, 3, 2], [10, 1, 2], [13, 0, 3]]
      : [[0, 0, 2], [3, 0, 1], [6, 0, 1], [8, 3, 2], [12, 0, 2]])),
  }

  RADIO = {
    intro_hype,
    radio_hiphop_boombap,
    radio_hiphop_lowend,
    radio_hiphop_backpack,
    radio_edm_pump,
    radio_edm_drop,
    radio_edm_rave,
    radio_lofi_dust,
    radio_lofi_tape,
    radio_lofi_rain,
    radio_rock_anthem,
    radio_rock_thrash,
    radio_rock_groove,
  }
  return RADIO
}
