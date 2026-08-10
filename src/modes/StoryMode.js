// Story Mode — Wally's ten-chapter campaign against the entire crypto market.
// Chapter cards -> matches (MatchScreen round-trips back here via onEnd) ->
// round-10 boss transformation beat -> FINAL CHOICE -> two DOM-cinematic
// endings -> scrolling credits. Progress persists in game.save under 'story.*'.
// Exported as StoryScreen; registered under the name 'story' by the UI module.
import { Characters, UnchainedBull } from '../characters/index.js'
import { ArenaOrder, Arenas } from '../arenas/index.js'
import { el, MenuList, ensureMusic, drawPortrait, charName, charTitle, hintHTML } from '../ui/uiKit.js'
import { getBackdrop } from '../ui/MenuBackdrop.js'
import { TutorialDirector } from './Tutorial.js'

const BOSS_ID = UnchainedBull?.id || 'blackish-bull-unchained'

// Rounds 1..10 — opponents in narrative order, venues follow ArenaOrder 1:1.
const CAMPAIGN = [
  { charId: 'dogey', chapter: 'FIRST BLOOD, FIRST PROFIT', flavor: 'Dogey turned the Meme Market into his personal food bowl. Repossess it.' },
  { charId: 'peepee', chapter: 'KNEE-DEEP IN LIQUIDITY', flavor: "PeePee provides 90% of this swamp's liquidity. Do not ask how." },
  { charId: 'fatty-pingo', chapter: 'COLD STORAGE', flavor: "Pingo froze everyone's tokens 'for safety'. Cold storage was never meant to be a lifestyle." },
  { charId: 'bonko', chapter: 'PENDING SETTLEMENT', flavor: 'Bonko says your victory will settle in 3 to 5 business punches.' },
  { charId: 'shibro', chapter: 'RUN YOUR OWN NODE', flavor: 'Shibro runs a full node on a mountain and will absolutely tell you about it.' },
  { charId: 'crypto-punkd', chapter: 'RIGHT CLICK, SAVE AS', flavor: 'He right-clicked your future and set it as his profile picture.' },
  { charId: 'tired-ape', chapter: 'GOING INSTITUTIONAL', flavor: 'The Ape went institutional. He now yawns in nine figures.' },
  { charId: 'cool-pal', chapter: 'THE CALM', flavor: "He's calm. Too calm. Pre-liquidation calm. Wake him up." },
  { charId: 'blackish-bull', chapter: 'THE BULL RUN', flavor: 'The Colosseum champion accepts tribute in portfolios. Bring yours empty.' },
  { charId: BOSS_ID, chapter: 'THE PERMANENT RESERVE', flavor: 'Something inside the Reserve core is off the chain. Literally.' },
]

const LOSS_CAPTIONS = [
  'MARGIN CALLED', 'THE MARKET DID NOT CARE', 'RUGGED MID-COMBO',
  'YOUR STOP LOSS FAILED YOU', 'BEARS ATE YOUR LUNCH',
]

const ENDINGS = {
  seize: [
    { h: 'SEIZE', s: 'Wally wraps his trunk around the Permanent Reserve and simply... keeps it.' },
    { h: 'NUMBER GOES UP', s: 'Forever. For everyone named Wally.' },
    { h: 'ABSOLUTE CENTRALIZATION', s: 'The market now has one (1) participant. Attendance is mandatory.' },
    { h: 'CFO OF EVERYTHING', s: 'His first executive order: a 2% fee on gravity.' },
    { h: 'THE END?', s: 'The candle is green. The candle is eternal. The candle is watching.' },
  ],
  stabilize: [
    { h: 'STABILIZE', s: 'Wally gently sets the Reserve down. Volatility files for unemployment.' },
    { h: 'NUMBER GOES SIDEWAYS', s: 'Peacefully. Beautifully. Boringly.' },
    { h: 'EVERYONE TOOK PROFIT', s: 'For the first time in recorded history. Three economists fainted.' },
    { h: 'THE HERD RECOVERS', s: 'Even the Bull sends a fruit basket. It is 100% collateralized.' },
    { h: 'THE END', s: 'Wally retires to a modest 51% of the jungle.' },
  ],
}

const CREDITS = [
  ['A WALLY PICTURES PRODUCTION', ''],
  ['GAME DIRECTOR', 'WALLY'],
  ['EXECUTIVE PRODUCER', 'ALSO WALLY'],
  ['COMBAT DESIGN', 'THE INVISIBLE HAND'],
  ['PHYSICS', 'GRAVITY (UNAUDITED)'],
  ['STUNTS', 'RAGDOLLS — NO RAGDOLLS WERE PAID'],
  ['MUSIC', '100% PROCEDURAL, 0% ROYALTIES'],
  ['VOICE TALENT', 'A SPEECH SYNTHESIZER WITH DREAMS'],
  ['LEGAL', 'PENDING. EXTREMELY PENDING.'],
  ['QA', 'THE COMMUNITY (SORRY)'],
  ['MARKET RESEARCH', 'ONE (1) MAGIC 8-BALL'],
  ['SPECIAL THANKS', 'YOUR LIQUIDATED POSITIONS'],
]

const STYLE = `
  .wcs-story { background: linear-gradient(180deg, rgba(6,4,16,0.38), rgba(6,4,16,0.8)); }
  .wcs-story .sm-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .sm-solid { position: absolute; inset: 0; background: #05030d; }
  .sm-kicker { font-size: clamp(14px, 2vw, 24px); letter-spacing: 6px; color: var(--wcs-green); text-shadow: 2px 2px 0 #000; text-align: center; }
  .sm-h1 { font-size: clamp(34px, 6.4vw, 86px); line-height: 1; letter-spacing: 3px; color: var(--wcs-gold);
           -webkit-text-stroke: 2px #000; text-shadow: var(--wcs-extrude); text-align: center; }
  .sm-hub { text-align: center; width: min(92vw, 560px); }
  .sm-hub .sub { margin-top: 8px; font-family: var(--wcs-mono); font-weight: bold; letter-spacing: 1px;
                 font-size: clamp(11px, 1.4vw, 15px); color: #8f97c4; text-shadow: 1px 1px 0 #000; }
  .sm-menu { margin-top: 3vh; text-align: left;
             /* chapter select is 12 rows: scroll inside the stage, never under
                the bottom hint bar (reserve = header + hintbar height) */
             max-height: calc(100vh - 300px); overflow-y: auto; overflow-x: hidden;
             padding: 4px 28px 4px 46px; margin-left: -46px; margin-right: -28px;
             scrollbar-width: thin;
             -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%);
             mask-image: linear-gradient(180deg, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%); }
  .sm-menu .wcs-btn { text-align: center; }
  @media (max-height: 700px) {
    .wcs-story .sm-h1 { font-size: clamp(30px, 8.4vh, 64px); }
    .sm-menu { max-height: calc(100vh - 264px); }
    .sm-menu .wcs-btn { font-size: clamp(12px, 2.4vh, 20px);
                        padding: 0.18em 0.9em 0.14em 1.2em; margin: 0.18em 0; }
  }
  .sm-card { width: min(94vw, 860px); padding: clamp(14px, 2.6vw, 30px); display: flex; gap: clamp(12px, 2.4vw, 28px);
             align-items: center; animation: sm-card-in 0.3s cubic-bezier(0.2, 1.5, 0.4, 1); }
  @keyframes sm-card-in { from { transform: translateY(28px) scale(0.94); opacity: 0; } to { transform: none; opacity: 1; } }
  .sm-card .port { flex: 0 0 auto; text-align: center; }
  .sm-card .port canvas { width: clamp(120px, 17vw, 200px); height: clamp(120px, 17vw, 200px);
                          image-rendering: pixelated; border: 4px solid #000; border-radius: 8px;
                          background: #0a0618; box-shadow: 0 5px 0 rgba(0,0,0,0.5); }
  .sm-card .body { flex: 1; min-width: 0; }
  .sm-ch { font-size: clamp(12px, 1.6vw, 18px); letter-spacing: 5px; color: var(--wcs-gold); text-shadow: 2px 2px 0 #000; }
  .sm-chname { font-size: clamp(20px, 3.2vw, 40px); letter-spacing: 2px; color: #fff; -webkit-text-stroke: 1px #000;
               text-shadow: 3px 3px 0 rgba(0,0,0,0.6); margin-top: 2px; }
  .sm-foe { margin-top: 10px; font-size: clamp(15px, 2.1vw, 25px); letter-spacing: 2px; color: var(--wcs-red); text-shadow: 2px 2px 0 #000; }
  .sm-foet { font-size: clamp(11px, 1.5vw, 16px); letter-spacing: 2px; color: var(--wcs-purple); text-shadow: 1px 1px 0 #000; }
  .sm-venue { margin-top: 8px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(11px, 1.4vw, 15px);
              letter-spacing: 1px; color: #8f97c4; text-shadow: 1px 1px 0 #000; }
  .sm-venue b { color: var(--wcs-gold); }
  .sm-flavor { margin-top: 8px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(11px, 1.5vw, 16px);
               line-height: 1.45; color: #cfd6ff; text-shadow: 1px 1px 0 #000; }
  .sm-tutline { margin-top: 8px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(10px, 1.3vw, 14px);
                letter-spacing: 1px; color: var(--wcs-green); text-shadow: 1px 1px 0 #000; }
  .sm-card .menu { margin-top: 12px; max-width: 340px; }
  .sm-banner { position: absolute; left: 0; right: 0; top: 6vh; text-align: center; font-size: clamp(20px, 3.6vw, 46px);
               letter-spacing: 4px; color: var(--wcs-green); -webkit-text-stroke: 1px #000; text-shadow: 3px 3px 0 #000;
               animation: sm-card-in 0.35s cubic-bezier(0.2, 1.7, 0.4, 1); pointer-events: none; }
  .sm-banner.bad { color: var(--wcs-red); }
  .sm-boss-port { filter: brightness(0.06) drop-shadow(0 0 20px rgba(255, 40, 40, 0.95)); animation: sm-boss-pulse 0.8s ease-in-out infinite alternate; }
  @keyframes sm-boss-pulse { from { filter: brightness(0.06) drop-shadow(0 0 12px rgba(255,40,40,0.7)); }
                             to { filter: brightness(0.1) drop-shadow(0 0 26px rgba(255,40,40,1)); } }
  .sm-redflash { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(255,30,30,0.85), rgba(120,0,0,0.35));
                 pointer-events: none; animation: sm-redflash 0.9s ease-out forwards; }
  @keyframes sm-redflash { from { opacity: 1; } to { opacity: 0; } }
  .sm-unstable { animation: wcs-shake 0.5s linear; }
  .sm-choice { text-align: center; width: min(94vw, 720px); }
  .sm-choice .sub { margin-top: 10px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(11px, 1.5vw, 16px);
                    color: #cfd6ff; text-shadow: 1px 1px 0 #000; line-height: 1.5; }
  .sm-slide { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
              justify-content: center; text-align: center; padding: 0 8vw; animation: sm-slide-in 0.8s ease-out; }
  @keyframes sm-slide-in { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: scale(1); } }
  .sm-slide .h { font-size: clamp(38px, 8vw, 110px); letter-spacing: 4px; color: var(--wcs-gold);
                 -webkit-text-stroke: 3px #000; text-shadow: var(--wcs-extrude); }
  .sm-slide .s { margin-top: 3vh; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(13px, 1.9vw, 22px);
                 letter-spacing: 1px; line-height: 1.6; color: #cfd6ff; text-shadow: 1px 1px 0 #000; max-width: 800px; }
  .sm-credits { position: absolute; inset: 0; overflow: hidden; }
  .sm-croll { position: absolute; left: 0; right: 0; top: 100%; text-align: center; animation: sm-croll linear forwards; }
  @keyframes sm-croll { from { transform: translateY(0); } to { transform: translateY(calc(-100% - 100vh)); } }
  .sm-croll .crow { margin: 2.6vh 0; }
  .sm-croll .role { font-size: clamp(12px, 1.6vw, 18px); letter-spacing: 5px; color: var(--wcs-purple); text-shadow: 2px 2px 0 #000; }
  .sm-croll .who { font-size: clamp(18px, 2.8vw, 34px); letter-spacing: 2px; color: #fff; -webkit-text-stroke: 1px #000; text-shadow: 3px 3px 0 rgba(0,0,0,0.6); }
  .sm-croll .cast { font-size: clamp(15px, 2.2vw, 26px); letter-spacing: 2px; color: var(--wcs-gold); text-shadow: 2px 2px 0 #000; }
  .sm-croll .castt { font-size: clamp(10px, 1.3vw, 14px); letter-spacing: 2px; color: #8f97c4; font-family: var(--wcs-mono); font-weight: bold; }
  .sm-croll .fin { font-size: clamp(28px, 5vw, 64px); letter-spacing: 3px; color: var(--wcs-gold); -webkit-text-stroke: 2px #000; text-shadow: var(--wcs-extrude); }
`

// §24: late-game difficulty comes from BULK, not superhuman skill — AI level
// stays easy early and caps at 4 while the opponent HP multiplier climbs.
//
// v3.1 — the opening chapters were too hard and too long. Three curves now,
// and the early easing has to come from HP and round count rather than from
// AI level, because tuningFor() in src/ai/Brain.js clamps to a floor of 1
// (`Math.max(1, ...)`): there is no level 0 to drop to.
//   AI:     1 for the first three chapters, then the old ramp, still capped at 4
//   HP:     starts at 0.7x (was 1.0x) and reaches the same 1.9x peak by ch.10
//   ROUNDS: chapters 1-3 are a SINGLE round, so an early fight is ~1:00 rather
//           than a best-of-3. From chapter 4 the campaign settles into best-of-3.
// Net effect with the v3.1 economy (1:00 round median): ch.1 ~0:45, ch.4 ~2:45,
// ch.10 ~3:30 — an escalation curve instead of ten flat 8-minute slogs.
const STORY_AI_CURVE = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4]
const STORY_HP_CURVE = [0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9]
const STORY_ROUNDS_CURVE = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2]
function curveAt(curve, round) {
  return curve[Math.max(0, Math.min(curve.length - 1, round - 1))]
}
function aiLevelFor(round) {
  return curveAt(STORY_AI_CURVE, round)
}
function hpMultFor(round) {
  return curveAt(STORY_HP_CURVE, round)
}
function roundsToWinFor(round) {
  return curveAt(STORY_ROUNDS_CURVE, round)
}
function arenaFor(round) {
  const id = ArenaOrder[round - 1]
  return Arenas[id] ? id : (ArenaOrder[0] || 'meme-market')
}

export class StoryScreen {
  constructor(game) { this.game = game }

  // ------------------------------------------------------------------ screen

  enter(params = {}) {
    // The boss def is deliberately absent from the select roster; register it in
    // the runtime Characters map (NOT the file) so MatchScreen/HUD can resolve it.
    if (UnchainedBull && !Characters[UnchainedBull.id]) Characters[UnchainedBull.id] = UnchainedBull

    this.backdrop = getBackdrop(this.game)
    this.root = el('div', 'wcs-screen wcs-story')
    const style = document.createElement('style')
    style.textContent = STYLE
    this.root.appendChild(style)
    this.root.appendChild(el('div', 'wcs-dim'))
    this.stage = el('div', 'sm-stage')
    this.root.appendChild(this.stage)
    this.game.ui.appendChild(this.root)

    this.view = ''
    this.list = null
    this.t = 0
    this.cues = []
    this.musicId = 'menu'

    this._onDown = () => this._pointerSkip()
    this.stage.addEventListener('pointerdown', this._onDown)

    if (params.result && params.round) this._afterMatch(params.result, params.round)
    else if (params.round) this._showChapter(params.round)
    else this._showHub()
  }

  exit() {
    this.stage?.removeEventListener('pointerdown', this._onDown)
    this.root?.remove()
    this.root = null
    this.stage = null
    this.list = null
    this.cues = []
  }

  render(renderer, dt) { this.backdrop?.render(renderer, dt) }

  update(dt) {
    ensureMusic(this.game, this.musicId)
    this.backdrop?.update(dt)
    this.t += dt
    while (this.cues.length && this.cues[0].t <= this.t) {
      const cue = this.cues.shift()
      try { cue.fn() } catch (e) { console.error('[story] cue threw', e) }
    }

    const input = this.game.input
    if (this.view === 'ending') {
      this.slideT += dt
      if (input.menuPressed('confirm') || this.slideT >= 3.4) this._nextSlide()
      else if (input.menuPressed('back')) this._showCredits()
      return
    }
    if (this.view === 'credits') {
      if (input.menuPressed('confirm') || input.menuPressed('back')) this._finishCredits()
      return
    }
    if (this.view === 'chapter' && this.cues.length && input.menuPressed('confirm')) {
      this._fastForward()
      return
    }
    this.list?.update()
  }

  // ------------------------------------------------------------------ helpers

  _setView(name, html, musicId = 'menu') {
    this.view = name
    this.musicId = musicId
    this.t = 0
    this.cues = []
    this.list = null
    if (this.stage) this.stage.innerHTML = html
  }

  _cue(t, fn) {
    this.cues.push({ t, fn })
    this.cues.sort((a, b) => a.t - b.t)
  }

  _fastForward() {
    const pending = this.cues
    this.cues = []
    for (const cue of pending) {
      try { cue.fn() } catch (e) { console.error('[story] cue threw', e) }
    }
  }

  _pointerSkip() {
    if (this.view === 'ending') this._nextSlide()
    else if (this.view === 'credits') this._finishCredits()
    else if (this.view === 'chapter' && this.cues.length) this._fastForward()
  }

  _progress() { return this.game.save.get('story.progress', 0) }

  // ------------------------------------------------------------------ hub

  _showHub() {
    const progress = this._progress()
    const complete = this.game.save.get('story.complete', false)
    const ending = this.game.save.get('story.ending', null)
    const status = complete
      ? `MARKET STATUS: ${ending === 'seize' ? 'SEIZED BY WALLY' : 'STABILIZED'} — CAMPAIGN COMPLETE`
      : `PROGRESS: ${progress} / 10 CHAPTERS CLEARED`

    this._setView('hub', `
      <div class="sm-hub">
        <div class="sm-kicker">STORY MODE</div>
        <div class="sm-h1">WALLY VS THE MARKET</div>
        <div class="sub">TEN CHAPTERS. ONE ELEPHANT. ZERO RISK MANAGEMENT.</div>
        <div class="sub">${status}</div>
        <div class="sm-menu"></div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> MOVE &nbsp; <b>J / ENTER</b> CONFIRM &nbsp; <b>ESC</b> BACK', 'TAP TO SELECT')}
    `)

    const items = []
    if (progress > 0 && progress < 10) items.push({ label: `Continue — Chapter ${progress + 1}`, id: 'continue' })
    items.push({ label: progress > 0 ? 'New Campaign' : 'Begin Campaign', id: 'new' })
    if (progress > 0) items.push({ label: 'Chapter Select', id: 'chapters' })
    if (complete) items.push({ label: 'Replay Ending', id: 'ending' })
    items.push({ label: 'Back', id: 'back' })

    this.list = new MenuList(this.game, this.stage.querySelector('.sm-menu'), items, {
      onConfirm: (item) => {
        if (item.id === 'continue') this._showChapter(progress + 1)
        else if (item.id === 'new') {
          // 'New Campaign' promises a reset — confirm, then actually deliver one
          if (progress > 0) this._confirmNewCampaign()
          else this._showChapter(1)
        } else if (item.id === 'chapters') this._showChapterSelect()
        else if (item.id === 'ending') this._showChoice(true)
        else this.game.screens.goto('menu')
      },
      onBack: () => this.game.screens.goto('menu'),
    })
  }

  _confirmNewCampaign() {
    this._setView('confirm-new', `
      <div class="sm-hub">
        <div class="sm-kicker" style="color: var(--wcs-red)">NEW CAMPAIGN</div>
        <div class="sm-h1">WIPE THE PORTFOLIO?</div>
        <div class="sub">STARTING OVER SELLS ALL STORY PROGRESS AT A TOTAL LOSS.</div>
        <div class="sub">CHAPTERS CLEARED, ENDINGS, EVERYTHING. NO TAX BENEFITS.</div>
        <div class="sm-menu"></div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> MOVE &nbsp; <b>J / ENTER</b> CONFIRM &nbsp; <b>ESC</b> BACK', 'TAP TO SELECT')}
    `)
    this.list = new MenuList(this.game, this.stage.querySelector('.sm-menu'), [
      { label: 'Sell Everything — Start Over', id: 'wipe' },
      { label: 'Keep My Progress', id: 'back' },
    ], {
      onConfirm: (item) => {
        if (item.id === 'wipe') {
          this.game.save.set('story.progress', 0)
          this.game.save.set('story.complete', false)
          this.game.save.set('story.ending', null)
          this.game.audio.sfx('menu_confirm')
          this._showChapter(1)
        } else {
          this._showHub()
        }
      },
      onBack: () => this._showHub(),
    })
  }

  _showChapterSelect() {
    const progress = this._progress()
    const reach = Math.min(10, progress + 1) // beaten chapters + the next one
    this._setView('chapters', `
      <div class="sm-hub">
        <div class="sm-kicker">CHAPTER SELECT</div>
        <div class="sm-h1">PICK YOUR FIGHT</div>
        <div class="sm-menu"></div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> MOVE &nbsp; <b>J / ENTER</b> FIGHT &nbsp; <b>ESC</b> BACK', 'TAP A CHAPTER TO FIGHT')}
    `)
    const items = []
    for (let r = 1; r <= reach; r++) {
      const roundDef = CAMPAIGN[r - 1]
      // ch 10 is the UNCHAINED remix — without the title suffix it lists
      // identically to ch 9's base bull
      const name = r === 10
        ? (progress < 10 ? '???' : `${charName(BOSS_ID)} ${charTitle(BOSS_ID)}`)
        : charName(roundDef.charId)
      items.push({ label: `Ch ${r} — ${name}`, id: r })
    }
    items.push({ label: 'Back', id: 'back' })
    this.list = new MenuList(this.game, this.stage.querySelector('.sm-menu'), items, {
      onConfirm: (item) => {
        if (item.id === 'back') this._showHub()
        else this._showChapter(item.id)
      },
      onBack: () => this._showHub(),
    })
  }

  // ------------------------------------------------------------------ chapter card

  _showChapter(round, { victory = false } = {}) {
    round = Math.max(1, Math.min(10, round | 0))
    const info = CAMPAIGN[round - 1]
    const boss = round === 10
    const arenaId = arenaFor(round)
    const arenaName = Arenas[arenaId]?.name || arenaId.toUpperCase()

    // §20: chapter 1 doubles as the guided controls tutorial. First play it is
    // always on; once 'story.tutorialDone' is set, replays get an ON/OFF row.
    const tutorialDone = this.game.save.get('story.tutorialDone', false)
    if (round === 1) this._tutorialOpt = !tutorialDone
    const tutLine = round !== 1 ? '' : (tutorialDone
      ? '<div class="sm-tutline">GUIDED TUTORIAL AVAILABLE — TOGGLE IT BELOW.</div>'
      : '<div class="sm-tutline">DOUBLES AS BASIC TRAINING: A GUIDED TUTORIAL OPENS THE FIGHT. SKIP ANYTIME.</div>')

    this._setView('chapter', `
      ${victory ? `<div class="sm-banner">CHAPTER ${round - 1} CLEARED — MARKET SECURED</div>` : ''}
      <div class="wcs-panel sm-card">
        <div class="port"><canvas></canvas></div>
        <div class="body">
          <div class="sm-ch">CHAPTER ${round} OF 10</div>
          <div class="sm-chname">${info.chapter}</div>
          <div class="sm-foe"></div>
          <div class="sm-foet"></div>
          <div class="sm-venue">VENUE: <b>${arenaName}</b></div>
          <div class="sm-flavor">${info.flavor}</div>
          ${tutLine}
          <div class="menu"></div>
        </div>
      </div>
      ${hintHTML(this.game, '<b>J / ENTER</b> CONFIRM &nbsp; <b>ESC</b> BACK', 'TAP TO SELECT')}
    `, 'menu')

    const card = this.stage.querySelector('.sm-card')
    const canvas = this.stage.querySelector('canvas')
    const foeEl = this.stage.querySelector('.sm-foe')
    const foetEl = this.stage.querySelector('.sm-foet')
    const mountMenu = () => {
      const holder = this.stage?.querySelector('.menu')
      if (!holder) return
      holder.innerHTML = ''
      const items = [{ label: boss ? 'Enter The Core' : 'Fight!', id: 'fight' }]
      if (round === 1 && tutorialDone) {
        items.push({ label: `Play Tutorial: ${this._tutorialOpt ? 'ON' : 'OFF'}`, id: 'tut' })
      }
      items.push({ label: 'Retreat', id: 'back' })
      const keep = this.list ? this.list.index : 0
      this.list = new MenuList(this.game, holder, items, {
        onConfirm: (item) => {
          if (item.id === 'fight') this._launchRound(round, { tutorial: round === 1 && !!this._tutorialOpt })
          else if (item.id === 'tut') { this._tutorialOpt = !this._tutorialOpt; mountMenu() }
          else this._showHub()
        },
        onBack: () => this._showHub(),
      })
      this.list.setIndex(Math.min(keep, items.length - 1), true)
    }

    if (!boss) {
      drawPortrait(canvas, info.charId)
      foeEl.textContent = `VS ${charName(info.charId)}`
      foetEl.textContent = charTitle(info.charId)
      mountMenu()
      if (victory) this.game.audio.sfx('coins_burst')
      return
    }

    // --- round 10: the transformation beat -------------------------------
    drawPortrait(canvas, 'blackish-bull')
    foeEl.textContent = 'VS ???'
    foetEl.textContent = 'SIGNAL LOST'
    this._cue(0.8, () => {
      this.stage.appendChild(el('div', 'sm-redflash'))
      card.classList.remove('sm-unstable')
      void card.offsetWidth
      card.classList.add('sm-unstable')
      canvas.classList.add('sm-boss-port')
      this.game.audio.sfx('boss_sting')
      this.game.audio.sfx('explosion', { pitch: 0.55, vol: 0.7 })
      this.game.audio.announcer('THE RESERVE IS UNSTABLE!')
    })
    this._cue(2.3, () => {
      drawPortrait(canvas, BOSS_ID)
      foeEl.textContent = `VS ${charName(BOSS_ID)}`
      foetEl.textContent = charTitle(BOSS_ID)
      this.game.audio.sfx('bell', { pitch: 0.6 })
    })
    this._cue(2.9, mountMenu)
  }

  _showRetry(round) {
    const caption = LOSS_CAPTIONS[Math.floor(Math.random() * LOSS_CAPTIONS.length)]
    this._setView('retry', `
      <div class="sm-banner bad">${caption}</div>
      <div class="sm-hub">
        <div class="sm-kicker" style="color: var(--wcs-red)">CHAPTER ${round} — DEFEAT</div>
        <div class="sm-h1">DOWN BAD</div>
        <div class="sub">THE MARKET REMAINS IRRATIONAL LONGER THAN YOU REMAIN CONSCIOUS.</div>
        <div class="sm-menu"></div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> MOVE &nbsp; <b>J / ENTER</b> CONFIRM &nbsp; <b>ESC</b> QUIT', 'TAP TO SELECT')}
    `)
    this.game.audio.announcer('REKT!')
    this.list = new MenuList(this.game, this.stage.querySelector('.sm-menu'), [
      { label: 'Retry — Buy The Dip', id: 'retry' },
      { label: 'Quit To Menu', id: 'quit' },
    ], {
      onConfirm: (item) => {
        if (item.id === 'retry') this._showChapter(round)
        else this.game.screens.goto('menu')
      },
      onBack: () => this.game.screens.goto('menu'),
    })
  }

  // ------------------------------------------------------------------ match plumbing

  _launchRound(round, { tutorial = false } = {}) {
    const info = CAMPAIGN[round - 1]
    const params = {
      mode: 'story',
      p1: { charId: 'wally', control: 'p1' },
      p2: { charId: info.charId, control: 'ai', aiLevel: aiLevelFor(round) },
      arenaId: arenaFor(round),
      onEnd: (result) => this.game.screens.goto('story', { result, round }),
      // §24: opponent bulk curve — combat multiplies P2 max HP by this.
      // v3.1: roundsToWin rides the same curve so the opening chapters are a
      // single quick round rather than a best-of-3.
      rules: { p2HpMult: hpMultFor(round), roundsToWin: roundsToWinFor(round) },
    }
    if (round === 10) params.rules.boss = true
    if (round === 1 && tutorial) params.rules.tutorial = true
    this.game.screens.goto('match', params)
    if (params.rules?.tutorial) this._ensureTutorialDirector()
  }

  // §20: MatchScreen drives the TutorialDirector when rules.tutorial. Parallel-
  // build safety net: if the combat module hasn't wired that up (yet), attach a
  // self-driving director one beat after the match enters. The director itself
  // refuses to double-attach (match.tutorial guard), so this is idempotent.
  _ensureTutorialDirector() {
    setTimeout(() => {
      const scr = this.game.screens
      if (scr?.name !== 'match') return
      const match = scr.current
      if (!match || match.active === false || match.tutorial) return
      try { match.tutorial = new TutorialDirector(match, this.game) } catch (e) {
        console.error('[story] tutorial director attach failed', e)
      }
    }, 150)
  }

  _afterMatch(result, round) {
    const won = result.winnerSlot === 0
    if (!won) { this._showRetry(round); return }
    const progress = Math.max(this._progress(), round)
    this.game.save.set('story.progress', progress)
    if (round >= 10) this._showChoice()
    else this._showChapter(round + 1, { victory: true })
  }

  // ------------------------------------------------------------------ final choice + endings

  _showChoice(replay = false) {
    this._setView('choice', `
      <div class="sm-choice">
        <div class="sm-kicker">THE UNCHAINED BULL FALLS</div>
        <div class="sm-h1">FINAL CHOICE</div>
        <div class="sub">The Permanent Reserve hums in Wally's trunk. Every chart on Earth is flat,
        waiting for his next move. What does an elephant do with infinite money?</div>
        <div class="sm-menu"></div>
      </div>
      ${hintHTML(this.game, `<b>↑↓</b> CHOOSE &nbsp; <b>J / ENTER</b> DECIDE THE MARKET'S FATE`, `TAP TO DECIDE THE MARKET'S FATE`)}
    `, 'results')
    if (!replay) {
      this.game.audio.sfx('coins_burst')
      this.game.audio.announcer('THE FINAL CHOICE!')
    }
    this.list = new MenuList(this.game, this.stage.querySelector('.sm-menu'), [
      { label: 'Seize The Reserve', id: 'seize' },
      { label: 'Stabilize The Market', id: 'stabilize' },
    ], {
      onConfirm: (item) => {
        this.game.save.set('story.complete', true)
        this.game.save.set('story.ending', item.id)
        this.game.save.set('story.progress', 10)
        this._showEnding(item.id)
      },
    })
  }

  _showEnding(key) {
    this.slides = ENDINGS[key] || ENDINGS.stabilize
    this.slideIdx = -1
    this._setView('ending', `<div class="sm-solid"></div><div class="sm-holder" style="position:absolute;inset:0"></div>
      ${hintHTML(this.game, '<b>J / ENTER</b> NEXT &nbsp; <b>ESC</b> SKIP', 'TAP ▸ NEXT')}`, 'results')
    this._nextSlide()
  }

  _nextSlide() {
    this.slideIdx++
    this.slideT = 0
    if (this.slideIdx >= this.slides.length) { this._showCredits(); return }
    const slide = this.slides[this.slideIdx]
    const holder = this.stage.querySelector('.sm-holder')
    if (!holder) return
    holder.innerHTML = `<div class="sm-slide"><div class="h">${slide.h}</div><div class="s">${slide.s}</div></div>`
    this.game.audio.sfx(this.slideIdx === 0 ? 'bell' : 'coin')
  }

  // ------------------------------------------------------------------ credits

  _showCredits() {
    const rows = CREDITS.map(([role, who]) =>
      `<div class="crow">${role ? `<div class="role">${role}</div>` : ''}${who ? `<div class="who">${who}</div>` : ''}</div>`
    ).join('')
    const cast = CAMPAIGN.map((info) =>
      `<div class="crow"><div class="cast">${charName(info.charId)}</div><div class="castt">${charTitle(info.charId)}</div></div>`
    ).join('')
    const dur = 34
    this._setView('credits', `
      <div class="sm-solid"></div>
      <div class="sm-credits">
        <div class="sm-croll" style="animation-duration: ${dur}s">
          <div class="crow"><div class="fin">WALLY</div><div class="who">CRYPTO SMACKDOWN</div></div>
          ${rows}
          <div class="crow"><div class="role">STARRING</div></div>
          ${cast}
          <div class="crow"><div class="fin">THANKS FOR HODLING</div></div>
        </div>
      </div>
      ${hintHTML(this.game, '<b>J / ENTER</b> SKIP', 'TAP ▸ SKIP')}
    `, 'results')
    this._cue(dur + 1, () => this._finishCredits())
  }

  _finishCredits() {
    if (this.view !== 'credits') return
    this.view = ''
    this.game.audio.sfx('menu_confirm')
    this.game.screens.goto('menu')
  }
}
