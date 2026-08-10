// Arcade Ladder — pick a fighter, climb 6 shuffled opponents plus The Blackish
// Bull finale. Random arenas, escalating AI, win streak on a ladder side panel,
// classic CONTINUE? countdown on a loss, victory card + best-streak save.
// Exported as ArcadeScreen; registered under the name 'arcade' by the UI module.
// NOTE: SelectScreen can't serve as the arcade picker (it always picks TWO
// fighters and routes straight to the VS splash), so this screen owns a minimal
// one-fighter picker built from uiKit portraits.
import { Characters, RosterOrder } from '../characters/index.js'
import { Arenas } from '../arenas/index.js'
import { el, MenuList, ensureMusic, drawPortrait, charName, charTitle, statBarsHTML, hintHTML } from '../ui/uiKit.js'
import { getBackdrop } from '../ui/MenuBackdrop.js'

const COLS = 5
const LADDER_AI = [1, 1, 2, 2, 3, 3, 4] // escalates 1 -> 4 across the 7 rungs
// §24: opponent HP multiplier climbs 1.0 -> 1.8 up the ladder — late rungs get
// BULK, not superhuman AI (combat applies rules.p2HpMult to P2 max HP)
const LADDER_HP = [1.0, 1.15, 1.3, 1.4, 1.5, 1.65, 1.8]
const CONTINUE_SECONDS = 9

const RUNG_QUIPS = [
  'THEY SAID IT WAS EASY MONEY.', 'THE LADDER ONLY GOES UP. LIKE THE CHART. USUALLY.',
  'NO FEES ON FISTS.', 'PAST PERFORMANCE GUARANTEES NOTHING.',
  'THIS RUNG IS SOLD SEPARATELY.', 'LIQUIDITY THINS NEAR THE TOP.',
]

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const STYLE = `
  .wcs-arcade { background: linear-gradient(180deg, rgba(6,4,16,0.38), rgba(6,4,16,0.8)); }
  .wcs-arcade .arc-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .arc-kicker { font-size: clamp(14px, 2vw, 24px); letter-spacing: 6px; color: var(--wcs-green); text-shadow: 2px 2px 0 #000; text-align: center; }
  .arc-h1 { font-size: clamp(30px, 5.6vw, 76px); line-height: 1; letter-spacing: 3px; color: var(--wcs-gold);
            -webkit-text-stroke: 2px #000; text-shadow: var(--wcs-extrude); text-align: center; }
  .arc-center { text-align: center; width: min(94vw, 640px); }
  .arc-center .sub { margin-top: 8px; font-family: var(--wcs-mono); font-weight: bold; letter-spacing: 1px;
                     font-size: clamp(11px, 1.4vw, 15px); color: #8f97c4; text-shadow: 1px 1px 0 #000; }
  .arc-menu { margin-top: 2.6vh; text-align: left; }
  .arc-menu .wcs-btn { text-align: center; }
  /* picker */
  .arc-pick { display: flex; flex-direction: column; align-items: center; gap: 1.4vh; }
  .arc-grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr); gap: clamp(6px, 0.9vw, 12px); }
  .arc-slot { position: relative; width: clamp(64px, 9vw, 110px); border: 3px solid #000; border-radius: 6px;
              background: linear-gradient(180deg, var(--wcs-panel-hi), var(--wcs-panel-lo));
              box-shadow: 0 4px 0 rgba(0,0,0,0.5); cursor: pointer; overflow: hidden; }
  .arc-slot canvas { display: block; width: 100%; aspect-ratio: 1; image-rendering: pixelated; }
  .arc-slot .nm { font-size: clamp(8px, 1vw, 11px); letter-spacing: 1px; text-align: center; padding: 3px 1px;
                  color: #cfd6ff; text-shadow: 1px 1px 0 #000; background: rgba(0,0,0,0.45); white-space: nowrap;
                  overflow: hidden; text-overflow: ellipsis; }
  .arc-slot.cur { border-color: var(--wcs-gold); box-shadow: 0 0 14px rgba(255,217,74,0.6), 0 4px 0 rgba(0,0,0,0.5);
                  transform: scale(1.06); z-index: 2; }
  .arc-pickpanel { width: min(92vw, 460px); padding: 10px 16px 12px; text-align: center; }
  .arc-pickpanel .pn { font-size: clamp(16px, 2.4vw, 28px); letter-spacing: 2px; color: var(--wcs-gold); text-shadow: 2px 2px 0 #000; }
  .arc-pickpanel .pt { font-size: clamp(10px, 1.4vw, 15px); letter-spacing: 2px; color: var(--wcs-purple); text-shadow: 1px 1px 0 #000; }
  .arc-pickpanel .pc { margin-top: 4px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(10px, 1.3vw, 13px);
                       letter-spacing: 1px; color: #8f97c4; text-shadow: 1px 1px 0 #000; }
  /* ladder card + side panel */
  .arc-card { width: min(94vw, 700px); padding: clamp(14px, 2.4vw, 28px); display: flex; gap: clamp(12px, 2.2vw, 26px);
              align-items: center; animation: arc-card-in 0.3s cubic-bezier(0.2, 1.5, 0.4, 1); }
  @keyframes arc-card-in { from { transform: translateY(28px) scale(0.94); opacity: 0; } to { transform: none; opacity: 1; } }
  .arc-card .port canvas { width: clamp(110px, 15vw, 180px); height: clamp(110px, 15vw, 180px); image-rendering: pixelated;
                           border: 4px solid #000; border-radius: 8px; background: #0a0618; box-shadow: 0 5px 0 rgba(0,0,0,0.5); }
  .arc-card .body { flex: 1; min-width: 0; }
  .arc-fight { font-size: clamp(12px, 1.6vw, 18px); letter-spacing: 5px; color: var(--wcs-gold); text-shadow: 2px 2px 0 #000; }
  .arc-foe { margin-top: 4px; font-size: clamp(20px, 3.2vw, 40px); letter-spacing: 2px; color: var(--wcs-red);
             -webkit-text-stroke: 1px #000; text-shadow: 3px 3px 0 rgba(0,0,0,0.6); }
  .arc-foet { font-size: clamp(11px, 1.5vw, 16px); letter-spacing: 2px; color: var(--wcs-purple); text-shadow: 1px 1px 0 #000; }
  .arc-venue { margin-top: 8px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(11px, 1.4vw, 15px);
               letter-spacing: 1px; color: #8f97c4; text-shadow: 1px 1px 0 #000; }
  .arc-venue b { color: var(--wcs-gold); }
  .arc-streak { margin-top: 6px; font-size: clamp(13px, 1.8vw, 21px); letter-spacing: 2px; color: var(--wcs-green); text-shadow: 2px 2px 0 #000; }
  .arc-quip { margin-top: 6px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(10px, 1.3vw, 14px);
              color: #cfd6ff; text-shadow: 1px 1px 0 #000; }
  .arc-card .menu { margin-top: 12px; max-width: 320px; }
  .arc-side { position: absolute; right: 1.6vw; top: 50%; transform: translateY(-50%); width: clamp(150px, 16vw, 240px);
              padding: 10px 12px; }
  .arc-side .hd { font-size: clamp(11px, 1.4vw, 15px); letter-spacing: 3px; color: var(--wcs-gold); text-shadow: 1px 1px 0 #000;
                  text-align: center; margin-bottom: 6px; }
  .arc-rung { display: flex; align-items: center; gap: 7px; padding: 3px 5px; margin: 2px 0; border-radius: 4px;
              border: 2px solid transparent; }
  .arc-rung canvas { width: 26px; height: 26px; image-rendering: pixelated; border: 2px solid #000; border-radius: 4px; flex: 0 0 auto; }
  .arc-rung .rn { flex: 1; min-width: 0; font-size: clamp(9px, 1.05vw, 12px); letter-spacing: 1px; color: #cfd6ff;
                  text-shadow: 1px 1px 0 #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .arc-rung .rw { font-family: var(--wcs-mono); font-weight: bold; font-size: 11px; }
  .arc-rung.done { opacity: 0.55; }
  .arc-rung.done .rw { color: var(--wcs-green); }
  .arc-rung.cur { border-color: var(--wcs-gold); background: rgba(255,217,74,0.12);
                  box-shadow: 0 0 10px rgba(255,217,74,0.35); }
  .arc-rung.next { filter: saturate(0.4) brightness(0.75); }
  .arc-side .streak { margin-top: 8px; text-align: center; font-size: clamp(11px, 1.4vw, 15px); letter-spacing: 2px;
                      color: var(--wcs-green); text-shadow: 1px 1px 0 #000; }
  /* continue */
  .arc-count { font-size: clamp(80px, 18vw, 220px); line-height: 1; letter-spacing: 4px; color: var(--wcs-red);
               -webkit-text-stroke: 4px #000; text-shadow: var(--wcs-extrude); }
  .arc-count.tick { animation: arc-count-pop 0.28s cubic-bezier(0.2, 1.6, 0.4, 1); }
  @keyframes arc-count-pop { from { transform: scale(1.6); } to { transform: scale(1); } }
  .arc-coinline { margin-top: 4px; font-family: var(--wcs-mono); font-weight: bold; font-size: clamp(12px, 1.6vw, 18px);
                  letter-spacing: 2px; color: var(--wcs-gold); text-shadow: 1px 1px 0 #000;
                  animation: wcs-press-pulse 0.8s ease-in-out infinite; }
  .arc-over { font-size: clamp(40px, 9vw, 120px); letter-spacing: 4px; color: var(--wcs-red); -webkit-text-stroke: 3px #000;
              text-shadow: var(--wcs-extrude); }
`

export class ArcadeScreen {
  constructor(game) {
    this.game = game
    this.run = null // survives match round-trips; instance persists for the session
  }

  // ------------------------------------------------------------------ screen

  enter(params = {}) {
    this.backdrop = getBackdrop(this.game)
    this.root = el('div', 'wcs-screen wcs-arcade')
    const style = document.createElement('style')
    style.textContent = STYLE
    this.root.appendChild(style)
    this.root.appendChild(el('div', 'wcs-dim'))
    this.stage = el('div', 'arc-stage')
    this.root.appendChild(this.stage)
    this.game.ui.appendChild(this.root)

    this.view = ''
    this.list = null
    this.t = 0
    this.cues = []
    this.musicId = 'select'

    if (params.result && this.run) this._afterMatch(params.result)
    else { this.run = null; this._showPicker() }
  }

  exit() {
    this.root?.remove()
    this.root = null
    this.stage = null
    this.list = null
    this.slots = null
    this.cues = []
  }

  render(renderer, dt) { this.backdrop?.render(renderer, dt) }

  update(dt) {
    ensureMusic(this.game, this.musicId)
    this.backdrop?.update(dt)
    this.t += dt
    while (this.cues.length && this.cues[0].t <= this.t) {
      const cue = this.cues.shift()
      try { cue.fn() } catch (e) { console.error('[arcade] cue threw', e) }
    }

    const input = this.game.input
    if (this.view === 'picker') {
      if (input.menuPressed('left')) this._move(-1, 0)
      else if (input.menuPressed('right')) this._move(1, 0)
      if (input.menuPressed('up')) this._move(0, -1)
      else if (input.menuPressed('down')) this._move(0, 1)
      // heavy toggles costume, checked BEFORE back (same rule as SelectScreen)
      if (input.pressed(0, 'heavy') || input.pressed(1, 'heavy')) this._toggleCostume()
      else if (input.menuPressed('back')) { this.game.audio.sfx('menu_back'); this.game.screens.goto('menu'); return }
      if (input.menuPressed('confirm')) this._confirmPick()
      return
    }
    if (this.view === 'continue') {
      this.countT += dt
      if (this.countT >= 1 && this.count > 0) {
        this.countT -= 1
        this.count--
        this._paintCount()
        if (this.count <= 0) { this._showGameOver(); return }
      }
    }
    if (this.view === 'gameover') {
      if (input.menuPressed('confirm') || input.menuPressed('back')) this._toMenu()
      return
    }
    this.list?.update()
  }

  // ------------------------------------------------------------------ helpers

  _setView(name, html, musicId = 'select') {
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

  _toMenu() {
    this.run = null
    this.game.screens.goto('menu')
  }

  _best() { return this.game.save.get('arcade.bestStreak', 0) }

  // ------------------------------------------------------------------ picker

  _showPicker() {
    this._setView('picker', `
      <div class="arc-pick">
        <div>
          <div class="arc-kicker">ARCADE LADDER</div>
          <div class="arc-h1">CHOOSE YOUR CLIMBER</div>
        </div>
        <div class="arc-grid"></div>
        <div class="wcs-panel arc-pickpanel">
          <div class="pn"></div>
          <div class="pt"></div>
          <div class="stats"></div>
          <div class="pc"></div>
        </div>
      </div>
      ${hintHTML(this.game, '<b>←→↑↓</b> MOVE &nbsp; <b>J / ENTER</b> LOCK IN &nbsp; <b>K</b> COSTUME &nbsp; <b>ESC</b> BACK', 'TAP A FIGHTER TO LOCK IN')}
    `, 'select')

    this.cursor = Math.max(0, RosterOrder.indexOf('wally'))
    this.costume = 0
    const grid = this.stage.querySelector('.arc-grid')
    this.slots = RosterOrder.map((id, i) => {
      const slot = el('div', 'arc-slot')
      const canvas = document.createElement('canvas')
      drawPortrait(canvas, id, { locked: !Characters[id] })
      slot.appendChild(canvas)
      slot.appendChild(el('div', 'nm', charName(id)))
      slot.addEventListener('mouseenter', () => {
        if (this.cursor !== i) {
          this.cursor = i
          this.game.audio.sfx('menu_move')
          this._refreshPicker()
        }
      })
      slot.addEventListener('click', () => {
        this.cursor = i
        this._refreshPicker()
        this._confirmPick()
      })
      grid.appendChild(slot)
      return slot
    })
    this._refreshPicker()
  }

  _move(dx, dy) {
    const n = RosterOrder.length
    const rows = Math.ceil(n / COLS)
    let col = this.cursor % COLS
    let row = Math.floor(this.cursor / COLS)
    col = (col + dx + COLS) % COLS
    row = (row + dy + rows) % rows
    const next = Math.min(row * COLS + col, n - 1)
    if (next !== this.cursor) {
      this.cursor = next
      this.game.audio.sfx('menu_move')
      this._refreshPicker()
    }
  }

  _toggleCostume() {
    this.costume = this.costume ? 0 : 1
    this.game.audio.sfx('coin')
    this._refreshPicker()
  }

  _refreshPicker() {
    if (!this.slots) return
    this.slots.forEach((slot, i) => slot.classList.toggle('cur', i === this.cursor))
    const id = RosterOrder[this.cursor]
    const def = Characters[id]
    const panel = this.stage.querySelector('.arc-pickpanel')
    panel.querySelector('.pn').textContent = charName(id)
    panel.querySelector('.pt').textContent = charTitle(id)
    panel.querySelector('.stats').innerHTML = statBarsHTML(def?.stats)
    panel.querySelector('.pc').textContent = `COSTUME ${this.costume ? 'B' : 'A'} — [K] SWAP`
  }

  _confirmPick() {
    const charId = RosterOrder[this.cursor]
    if (!Characters[charId]) { this.game.audio.sfx('menu_back'); return }
    this.game.audio.sfx('menu_confirm')
    this.game.audio.announcer(charName(charId))
    this._buildRun(charId, this.costume)
    this._showLadder()
  }

  // ------------------------------------------------------------------ run state

  _buildRun(charId, costume) {
    const pool = shuffle(RosterOrder.filter((id) => id !== charId && id !== 'blackish-bull' && Characters[id]))
    const opponents = pool.slice(0, 6)
    opponents.push('blackish-bull') // the finale — always the Bull at the top
    const arenaIds = shuffle(Object.keys(Arenas))
    this.run = {
      charId, costume,
      rung: 0, streak: 0,
      ladder: opponents.map((id, i) => ({
        charId: id,
        arenaId: arenaIds.length ? arenaIds[i % arenaIds.length] : 'meme-market',
        aiLevel: LADDER_AI[i] || 4,
        hpMult: LADDER_HP[i] || LADDER_HP[LADDER_HP.length - 1],
      })),
    }
  }

  _afterMatch(result) {
    const run = this.run
    if (result.winnerSlot === 0) {
      run.streak++
      if (run.streak > this._best()) this.game.save.set('arcade.bestStreak', run.streak)
      run.rung++
      if (run.rung >= run.ladder.length) this._showVictory()
      else this._showLadder({ victory: true })
    } else {
      this._showContinue()
    }
  }

  // ------------------------------------------------------------------ ladder card

  _showLadder({ victory = false } = {}) {
    const run = this.run
    const rung = run.ladder[run.rung]
    const finale = run.rung === run.ladder.length - 1
    const arenaName = Arenas[rung.arenaId]?.name || rung.arenaId.toUpperCase()
    const quip = RUNG_QUIPS[Math.floor(Math.random() * RUNG_QUIPS.length)]

    this._setView('ladder', `
      ${victory ? '<div class="arc-kicker" style="position:absolute;left:0;right:0;top:6vh;font-size:clamp(20px,3.4vw,44px);letter-spacing:4px;">RUNG CLEARED — NUMBER WENT UP</div>' : ''}
      <div class="wcs-panel arc-card">
        <div class="port"><canvas></canvas></div>
        <div class="body">
          <div class="arc-fight">${finale ? 'FINAL FIGHT' : `FIGHT ${run.rung + 1} OF ${run.ladder.length}`}</div>
          <div class="arc-foe">VS ${charName(rung.charId)}</div>
          <div class="arc-foet">${charTitle(rung.charId)}</div>
          <div class="arc-venue">VENUE: <b>${arenaName}</b> &nbsp;·&nbsp; AI THREAT: <b>${'▮'.repeat(rung.aiLevel)}${'▯'.repeat(4 - Math.min(4, rung.aiLevel))}</b></div>
          <div class="arc-streak">WIN STREAK: ${run.streak} &nbsp;·&nbsp; BEST: ${this._best()}</div>
          <div class="arc-quip">${finale ? 'THE TOP RUNG SNORTS. IT KNOWS YOU ARE COMING.' : quip}</div>
          <div class="menu"></div>
        </div>
      </div>
      <div class="wcs-panel arc-side">
        <div class="hd">THE LADDER</div>
        <div class="rungs"></div>
        <div class="streak">STREAK: ${run.streak}</div>
      </div>
      ${hintHTML(this.game, '<b>J / ENTER</b> FIGHT &nbsp; <b>ESC</b> ABANDON RUN', 'TAP TO SELECT')}
    `, 'menu')

    drawPortrait(this.stage.querySelector('.arc-card canvas'), rung.charId)
    this._buildSidePanel()
    if (victory) this.game.audio.sfx('coins_burst')
    if (finale) this.game.audio.announcer('THE FINAL RUNG!')

    this.list = new MenuList(this.game, this.stage.querySelector('.arc-card .menu'), [
      { label: finale ? 'Fight The Bull' : 'Fight!', id: 'fight' },
      { label: 'Abandon Run', id: 'quit' },
    ], {
      onConfirm: (item) => {
        if (item.id === 'fight') this._fight()
        else this._toMenu()
      },
      onBack: () => this._toMenu(),
    })
  }

  _buildSidePanel() {
    const run = this.run
    const holder = this.stage.querySelector('.arc-side .rungs')
    if (!holder) return
    // top of the ladder rendered first — the finale looms above everything
    for (let i = run.ladder.length - 1; i >= 0; i--) {
      const entry = run.ladder[i]
      const cls = i < run.rung ? 'done' : i === run.rung ? 'cur' : 'next'
      const row = el('div', `arc-rung ${cls}`)
      const canvas = document.createElement('canvas')
      drawPortrait(canvas, entry.charId)
      row.appendChild(canvas)
      row.appendChild(el('div', 'rn', charName(entry.charId)))
      row.appendChild(el('div', 'rw', i < run.rung ? '✓' : i === run.rung ? '◀' : ''))
      holder.appendChild(row)
    }
  }

  _fight() {
    const run = this.run
    const rung = run.ladder[run.rung]
    this.game.screens.goto('match', {
      mode: 'arcade',
      p1: { charId: run.charId, control: 'p1', costume: run.costume },
      p2: { charId: rung.charId, control: 'ai', aiLevel: rung.aiLevel },
      rules: { p2HpMult: rung.hpMult || 1 }, // §24 bulk curve
      arenaId: rung.arenaId,
      onEnd: (result) => this.game.screens.goto('arcade', { result }),
    })
  }

  // ------------------------------------------------------------------ continue / game over

  _showContinue() {
    this.count = CONTINUE_SECONDS
    this.countT = 0
    this._setView('continue', `
      <div class="arc-center">
        <div class="arc-h1">CONTINUE?</div>
        <div class="arc-count">${this.count}</div>
        <div class="arc-coinline">INSERT COIN — WE ACCEPT GAS FEES</div>
        <div class="sub">STREAK LOST. RUNG ${this.run.rung + 1} STILL STANDS. THE BULL IS LAUGHING.</div>
        <div class="arc-menu"></div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> MOVE &nbsp; <b>J / ENTER</b> CONFIRM', 'TAP TO SELECT')}
    `, 'menu')
    this.game.audio.announcer('CONTINUE?')
    this.list = new MenuList(this.game, this.stage.querySelector('.arc-menu'), [
      { label: 'Continue — Free, We Printed More', id: 'yes' },
      { label: 'Give Up', id: 'no' },
    ], {
      onConfirm: (item) => {
        if (item.id === 'yes') {
          this.run.streak = 0 // a WIN streak does not survive a loss
          this.game.audio.sfx('coin')
          this._showLadder()
        } else this._showGameOver()
      },
      onBack: () => this._showGameOver(),
    })
  }

  _paintCount() {
    const node = this.stage?.querySelector('.arc-count')
    if (!node) return
    node.textContent = this.count
    node.classList.remove('tick')
    void node.offsetWidth
    node.classList.add('tick')
    this.game.audio.sfx('coin', { pitch: 0.8 + (CONTINUE_SECONDS - this.count) * 0.04 })
  }

  _showGameOver() {
    this._setView('gameover', `
      <div class="arc-center">
        <div class="arc-over">GAME OVER</div>
        <div class="sub">ABSOLUTELY REKT AT RUNG ${this.run ? this.run.rung + 1 : 1}. BEST STREAK: ${this._best()}.</div>
        <div class="sub">THE LADDER REMAINS. YOUR DIGNITY DOES NOT.</div>
      </div>
      ${hintHTML(this.game, '<b>J / ENTER</b> MENU')}
    `, 'results')
    this.game.audio.sfx('ko')
    this.game.audio.announcer('GAME OVER!')
    this._cue(3.2, () => this._toMenu())
  }

  // ------------------------------------------------------------------ victory

  _showVictory() {
    const run = this.run
    this._setView('victory', `
      <div class="arc-center">
        <div class="arc-kicker">LADDER CLEARED</div>
        <div class="arc-h1">${charName(run.charId)}</div>
        <div class="sub" style="color: var(--wcs-green); font-size: clamp(13px, 1.8vw, 20px);">
          WIN STREAK: ${run.streak} &nbsp;·&nbsp; BEST EVER: ${this._best()}</div>
        <div class="sub">THE LEADERBOARD IS YOURS. IT WAS A WHITEBOARD THE WHOLE TIME.</div>
        <div class="arc-menu"></div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> MOVE &nbsp; <b>J / ENTER</b> CONFIRM &nbsp; <b>ESC</b> MENU', 'TAP TO SELECT')}
    `, 'results')
    this.game.audio.announcer(`${charName(run.charId)} clears the ladder!`)
    this.game.audio.sfx('coins_burst')
    this.list = new MenuList(this.game, this.stage.querySelector('.arc-menu'), [
      { label: 'Run It Back — Same Fighter', id: 'again' },
      { label: 'New Fighter', id: 'pick' },
      { label: 'Main Menu', id: 'menu' },
    ], {
      onConfirm: (item) => {
        if (item.id === 'again') {
          this._buildRun(run.charId, run.costume)
          this._showLadder()
        } else if (item.id === 'pick') {
          this.run = null
          this._showPicker()
        } else this._toMenu()
      },
      onBack: () => this._toMenu(),
    })
  }
}
