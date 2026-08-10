// Character select — 10-slot grid (locked SOON slots for missing fighters),
// sequential P1 -> opponent picking, stat panels, costume toggle on heavy.
// WALLY is ALWAYS the default highlight on entry (hard requirement).
// v1.1: versus is VERSUS CPU — you pick BOTH corners; after choosing your CPU
// opponent an AI DIFFICULTY row (1-5, default 3) appears before the VS splash.
import { Characters, RosterOrder } from '../../characters/index.js'
import { Arenas } from '../../arenas/index.js'
import {
  el, toast, shake, ensureMusic, statBarsHTML,
  charName, charTitle, charDef, touchUI, hintHTML,
} from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'
import { heroPortrait } from './PortraitStudio.js'

const COLS = 5
const LOCKED_BIOS = [
  'This fighter is still in presale.',
  'Whitepaper pending. Violence loading.',
  'Unlocks at the next halving.',
  'Currently vesting. Do not FOMO.',
]

// CPU difficulty flavor (aiLevel 1-5, default 3)
const AI_LEVELS = [
  { level: 1, name: 'PAPER HANDS', flavor: 'Sells at the bottom. Of its own health bar.' },
  { level: 2, name: 'RETAIL', flavor: 'Buys high, blocks low, panics often.' },
  { level: 3, name: 'DAY TRADER', flavor: 'Reads one chart, throws one hand. Fair fight.' },
  { level: 4, name: 'QUANT', flavor: 'It has backtested your habits. All of them.' },
  { level: 5, name: 'MARKET MAKER', flavor: 'You are the exit liquidity.' },
]
const DEFAULT_AI_LEVEL = 3

export class SelectScreen {
  constructor(game) { this.game = game }

  enter(params = {}) {
    this.mode = params.mode || 'versus'
    this.phase = 0                       // 0 = P1 picking, 1 = opponent picking, 2 = CPU difficulty (versus)
    this.picks = [null, null]            // { charId, costume }
    this.costumes = [0, 0]
    this.aiLevel = DEFAULT_AI_LEVEL
    this.cursor = Math.max(0, RosterOrder.indexOf('wally'))  // WALLY default, always
    this.backdrop = getBackdrop(this.game)

    this.root = el('div', 'wcs-screen wcs-select')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="sel-header">
        <div class="h1">CHOOSE YOUR FIGHTER</div>
        <div class="h2"></div>
      </div>
      <div class="sel-panel wcs-panel left">
        <canvas></canvas>
        <div class="pn"></div>
        <div class="pt"></div>
        <div class="pb"></div>
        <div class="ps"></div>
        <div class="sel-stats"></div>
        <div class="sel-costume"></div>
      </div>
      <div class="sel-grid"></div>
      <div class="sel-panel wcs-panel right">
        <canvas></canvas>
        <div class="pn"></div>
        <div class="pt"></div>
        <div class="pb"></div>
        <div class="ps"></div>
        <div class="sel-stats"></div>
        <div class="sel-costume"></div>
      </div>
      <div class="sel-diff">
        <div class="diff-title">CPU DIFFICULTY</div>
        <div class="diff-boxes"></div>
        <div class="diff-name"></div>
        <div class="diff-flavor"></div>
        <div class="diff-hint">${touchUI(this.game)
          ? 'TAP A LEVEL TO FIGHT'
          : '<b>←→</b> ADJUST &nbsp; <b>J / ENTER</b> FIGHT &nbsp; <b>ESC</b> BACK'}</div>
      </div>
      ${hintHTML(this.game,
        '<b>←→↑↓</b> MOVE &nbsp; <b>J / ENTER</b> LOCK IN &nbsp; <b>K</b> COSTUME &nbsp; <b>ESC</b> BACK',
        'TAP A FIGHTER TO LOCK IN')}
    `
    this.game.ui.appendChild(this.root)
    this.headerEl = this.root.querySelector('.sel-header .h2')
    this.panels = [this.root.querySelector('.sel-panel.left'), this.root.querySelector('.sel-panel.right')]

    this._buildGrid()
    this._buildDiff()
    this._refresh()
  }

  exit() {
    this.root?.remove()
    this.root = null
    this.slots = null
    this.diffBoxes = null
  }

  _buildGrid() {
    const grid = this.root.querySelector('.sel-grid')
    this.slots = RosterOrder.map((id, i) => {
      const def = charDef(id)
      const slot = el('div', 'sel-slot' + (def ? '' : ' locked'))
      const canvas = document.createElement('canvas')
      // Real 3D bust of the fighter, lit by the portrait rig. Falls back to the
      // flat doodle instantly and swaps the render in when the bake lands.
      heroPortrait(this.game, canvas, id, {
        framing: 'bust', pose: 'idle', look: 'neutral', locked: !def, px: 224,
      })
      slot.appendChild(canvas)
      if (!def) {
        slot.appendChild(el('div', 'qmark', '???'))
        slot.appendChild(el('div', 'soon-ribbon', 'SOON™'))
      }
      slot.appendChild(el('div', 'nm', def ? def.name : charName(id)))
      slot.addEventListener('mouseenter', () => {
        if (this.phase === 2) return // difficulty row owns focus
        if (this.cursor !== i) {
          this.cursor = i
          this.game.audio.sfx('menu_move')
          this._refresh()
        }
      })
      slot.addEventListener('click', () => {
        if (this.phase === 2) return // difficulty row owns focus
        this.cursor = i
        this._refresh()
        this._confirm()
      })
      grid.appendChild(slot)
      return slot
    })
  }

  // -------------------------------------------------- CPU difficulty phase --

  _buildDiff() {
    const boxes = this.root.querySelector('.diff-boxes')
    this.diffBoxes = AI_LEVELS.map((d, i) => {
      const box = el('div', 'diff-box', String(d.level))
      box.addEventListener('mouseenter', () => this._setDiff(i + 1))
      box.addEventListener('click', () => { this._setDiff(i + 1); this._confirm() })
      boxes.appendChild(box)
      return box
    })
  }

  _setDiff(level, silent = false) {
    const next = Math.max(1, Math.min(5, level))
    if (next !== this.aiLevel && !silent) this.game.audio.sfx('menu_move')
    this.aiLevel = next
    this._refreshDiff()
  }

  _refreshDiff() {
    const info = AI_LEVELS[this.aiLevel - 1]
    this.diffBoxes.forEach((box, i) => box.classList.toggle('sel', i === this.aiLevel - 1))
    this.root.querySelector('.diff-name').textContent = `LV ${info.level} — ${info.name}`
    this.root.querySelector('.diff-flavor').textContent = info.flavor
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
      this._refresh()
    }
  }

  _confirm() {
    if (this.phase === 2) {
      // difficulty locked in — fight
      this.game.audio.sfx('menu_confirm')
      this.game.audio.announcer(`Level ${this.aiLevel}!`)
      this._launch()
      return
    }
    const id = RosterOrder[this.cursor]
    if (!charDef(id)) {
      this.game.audio.sfx('menu_back')
      toast(this.game, 'SOON™')
      shake(this.slots[this.cursor])
      return
    }
    const p = this.phase
    this.picks[p] = { charId: id, costume: this.costumes[p] }
    this.game.audio.sfx('menu_confirm')
    this.game.audio.announcer(charDef(id).name)

    if (p === 0) {
      this.phase = 1
      this.cursor = Math.max(0, RosterOrder.indexOf('wally'))  // Wally default for the opponent too
      this.costumes[1] = 0
      this._refresh()
    } else if (this.mode === 'versus') {
      // opponent chosen — set how hard the CPU hits back
      this.phase = 2
      this._refresh()
    } else {
      this._launch()
    }
  }

  _back() {
    this.game.audio.sfx('menu_back')
    if (this.phase === 2) {
      // undo the opponent lock-in, go back to opponent picking
      const prev = this.picks[1]
      this.phase = 1
      this.picks[1] = null
      this.cursor = Math.max(0, prev ? RosterOrder.indexOf(prev.charId) : RosterOrder.indexOf('wally'))
      this._refresh()
    } else if (this.phase === 1) {
      // undo P1's lock-in, go back to P1 picking
      const prev = this.picks[0]
      this.phase = 0
      this.picks[0] = null
      this.picks[1] = null
      this.cursor = Math.max(0, prev ? RosterOrder.indexOf(prev.charId) : RosterOrder.indexOf('wally'))
      this._refresh()
    } else {
      this.game.screens.goto('menu')
    }
  }

  _toggleCostume() {
    const p = this.phase
    this.costumes[p] = this.costumes[p] ? 0 : 1
    this.game.audio.sfx('coin')
    this._refresh()
  }

  _launch() {
    // v1.1: local 2P is gone — the second corner is ALWAYS a bot now
    const exhibition = this.mode === 'exhibition'
    const params = {
      mode: this.mode,
      p1: {
        charId: this.picks[0].charId,
        control: exhibition ? 'ai' : 'p1', // exhibition: BOTH corners are bots
        costume: this.picks[0].costume,
      },
      p2: {
        charId: this.picks[1].charId,
        control: 'ai',
        costume: this.picks[1].costume,
      },
      arenaId: this._pickArena(),
    }
    if (exhibition) {
      params.p1.aiLevel = 3
      params.p2.aiLevel = 3
    } else if (this.mode === 'versus') {
      params.p2.aiLevel = this.aiLevel   // the difficulty row's pick (1-5)
    } else {
      params.p2.aiLevel = 2              // legacy 'ai' mode default
    }
    this.game.screens.goto('vs', params)
  }

  _pickArena() {
    // Versus-style matches get a random arena from the registry; story-mode
    // assignments are handled elsewhere. Fallback: meme-market.
    const ids = Object.keys(Arenas)
    if (!ids.length) return 'meme-market'
    return ids[Math.floor(Math.random() * ids.length)] || 'meme-market'
  }

  _panelData(p) {
    // what should panel p display right now?
    if (this.picks[p]) return { id: this.picks[p].charId, picked: true, live: false }
    if (this.phase === p) return { id: RosterOrder[this.cursor], picked: false, live: true }
    return null // waiting
  }

  _refresh() {
    // header
    const ex = this.mode === 'exhibition'
    this.headerEl.textContent = ex
      ? (this.phase === 0 ? 'EXHIBITION — PICK BOT 1' : 'EXHIBITION — PICK BOT 2')
      : (this.phase === 0 ? 'P1 — PICK YOUR FIGHTER'
        : this.phase === 1 ? 'CHOOSE YOUR OPPONENT (CPU)'
          : 'SET CPU DIFFICULTY')
    this.headerEl.className = 'h2 ' + (this.phase === 0 ? 'p1turn' : 'p2turn')

    // difficulty overlay only during phase 2
    this.root.querySelector('.sel-diff').classList.toggle('show', this.phase === 2)
    if (this.phase === 2) this._refreshDiff()

    // grid cursor + picked tags (no cursor while the difficulty row has focus)
    this.slots.forEach((slot, i) => {
      slot.classList.toggle('cur-p1', this.phase === 0 && i === this.cursor)
      slot.classList.toggle('cur-p2', this.phase === 1 && i === this.cursor)
      slot.querySelectorAll('.picktag').forEach((t) => t.remove())
      const id = RosterOrder[i]
      if (this.picks[0]?.charId === id) slot.appendChild(el('div', 'picktag t1', 'P1'))
      if (this.picks[1]?.charId === id && this.phase >= 1) {
        slot.appendChild(el('div', 'picktag t2', ex ? 'P2' : 'CPU'))
      }
    })

    // side panels
    for (let p = 0; p < 2; p++) this._refreshPanel(p)
  }

  _refreshPanel(p) {
    const panel = this.panels[p]
    const canvas = panel.querySelector('canvas')
    const data = this._panelData(p)
    panel.querySelector('.ready-stamp')?.remove()

    if (!data) {
      const ex = this.mode === 'exhibition'
      heroPortrait(this.game, canvas, null, { locked: true })
      canvas.classList.remove('costume-b')
      panel.querySelector('.pn').textContent = p === 1 ? (ex ? 'BOT 2' : 'CPU') : (ex ? 'BOT 1' : 'P1')
      panel.querySelector('.pt').textContent = 'WAITING…'
      panel.querySelector('.pb').textContent = p === 1
        ? (ex
          ? 'The machines fight. You spectate. Zero effort, maximum spectacle.'
          : 'You pick both corners. The CPU drives this one — choose your victim, then set how hard it hits back.')
        : ''
      panel.querySelector('.ps').textContent = ''
      panel.querySelector('.sel-stats').innerHTML = statBarsHTML(null)
      panel.querySelector('.sel-costume').textContent = ''
      return
    }

    const def = charDef(data.id)
    if (def) {
      panel.querySelector('.pn').textContent = def.name
      panel.querySelector('.pt').textContent = def.title || ''
      panel.querySelector('.pb').textContent = def.bio || ''
      panel.querySelector('.ps').textContent = def.style ? 'STYLE: ' + def.style : ''
      panel.querySelector('.sel-stats').innerHTML = statBarsHTML(def.stats)
    } else {
      panel.querySelector('.pn').textContent = charName(data.id)
      panel.querySelector('.pt').textContent = charTitle(data.id)
      panel.querySelector('.pb').textContent = LOCKED_BIOS[this.cursor % LOCKED_BIOS.length]
      panel.querySelector('.ps').textContent = 'STYLE: REDACTED'
      panel.querySelector('.sel-stats').innerHTML = statBarsHTML(null)
    }

    const costume = data.picked ? this.picks[p].costume : this.costumes[p]
    // The swap must be VISIBLE. The hue-rotate class is now only the STAND-IN:
    // it tints the flat doodle while the real costume-B model is being baked,
    // and drops off the moment the true alt-palette render lands. A palette
    // swatch strip changes either way.
    canvas.classList.toggle('costume-b', !!(def && costume))
    // Portrait: full-body hero shot in this corner's colour — red for P1, blue
    // for the CPU — so the two panels read as opposing corners, not clip art.
    heroPortrait(this.game, canvas, data.id, {
      framing: 'hero',
      pose: data.picked ? 'win' : 'ready',
      look: p === 0 ? 'p1' : 'p2',
      costume: costume ? 1 : 0,
      locked: !def,
      px: 320,
      priority: true,
      onReady: () => canvas.classList.remove('costume-b'),
    })
    const costumeEl = panel.querySelector('.sel-costume')
    if (def) {
      const chips = (costume
        ? ['#4af0ff', '#b45bff', '#ff6a3b']
        : ['#ffd94a', '#2bff6a', '#3b9dff'])
        .map((c) => `<i style="background:${c}"></i>`).join('')
      costumeEl.innerHTML =
        `COSTUME ${costume ? 'B' : 'A'}` + (data.live ? ' — [K] SWAP' : '') +
        `<span class="swatches">${chips}</span>`
    } else {
      costumeEl.textContent = ''
    }

    if (data.picked) panel.appendChild(el('div', 'ready-stamp', 'LOCKED IN'))
  }

  update(dt) {
    ensureMusic(this.game, 'select')
    this.backdrop = this.backdrop || getBackdrop(this.game)
    this.backdrop.update(dt)

    const input = this.game.input

    if (this.phase === 2) {
      // difficulty row owns the input: no grid moves, no costume toggling
      if (input.menuPressed('left')) this._setDiff(this.aiLevel - 1)
      else if (input.menuPressed('right')) this._setDiff(this.aiLevel + 1)
      if (input.menuPressed('back')) { this._back(); return }
      if (input.menuPressed('confirm')) this._confirm()
      return
    }

    if (input.menuPressed('left')) this._move(-1, 0)
    else if (input.menuPressed('right')) this._move(1, 0)
    if (input.menuPressed('up')) this._move(0, -1)
    else if (input.menuPressed('down')) this._move(0, 1)

    // Heavy toggles costume. Checked BEFORE back: P1 heavy (KeyK) also matches
    // the menu 'back' binding, and pad B is heavy — costume wins on this screen.
    if (input.pressed(0, 'heavy') || input.pressed(1, 'heavy')) {
      this._toggleCostume()
    } else if (input.menuPressed('back')) {
      this._back()
      return
    }

    if (input.menuPressed('confirm')) this._confirm()
  }

  render(renderer, dt) { this.backdrop?.render(renderer, dt) }
}
