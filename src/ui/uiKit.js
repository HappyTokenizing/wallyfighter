// Shared UI helpers for WALLY: CRYPTO SMACKDOWN — DOM builders, menu navigation,
// procedural canvas portraits, music tracking, toasts. UI module internal.
import { Characters, RosterNames } from '../characters/index.js'

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

export function el(tag, cls, html) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (html != null) node.innerHTML = html
  return node
}

// Cross-session UI state (rematch stash lives here).
export const UIState = {
  lastMatchParams: null,
}

// ---------------------------------------------------------------------------
// Touch-aware UI mode + hint bars (v2.1 mobile sweep)
// ---------------------------------------------------------------------------

// Is the UI running in touch mode? Mirrors TouchControls.wanted: game.isTouch,
// overridable for desktop testing via localStorage wcs-touch = '1' / '0'.
export function touchUI(game) {
  let flag = null
  try { flag = localStorage.getItem('wcs-touch') } catch { /* storage blocked */ }
  if (flag === '1') return true
  if (flag === '0') return false
  return !!game?.isTouch
}

// ONE helper for every bottom hint bar: keyboard-glyph html on desktop, plain
// touch wording on touch devices. An empty touchText hides the bar entirely —
// no keyboard glyphs ever reach a touch screen.
export function hintHTML(game, keyboardHtml, touchText = '') {
  const inner = touchUI(game) ? touchText : keyboardHtml
  return inner ? `<div class="wcs-hintbar">${inner}</div>` : ''
}

// ---------------------------------------------------------------------------
// Character info lookups (tolerant of locked / missing fighters)
// ---------------------------------------------------------------------------

export function charDef(id) { return Characters[id] || null }

export function charName(id) {
  return Characters[id]?.name || RosterNames[id] || String(id || '???').toUpperCase()
}

export function charTitle(id) {
  return Characters[id]?.title || 'COMING SOON'
}

// ---------------------------------------------------------------------------
// Music tracking — screens call ensureMusic() every update; it starts the track
// once the AudioContext exists and never restarts an already-playing track.
// ---------------------------------------------------------------------------

let _currentMusic = null

export function ensureMusic(game, id) {
  if (_currentMusic === id) return
  if (!game.audio || !game.audio.ctx) return // retried next frame after user gesture
  game.audio.music(id)
  _currentMusic = id
}

export function stopMusicNow(game) {
  if (game.audio) game.audio.stopMusic()
  _currentMusic = null
}

// Combat plays its own battle track — forget ours so menus re-trigger on return.
export function resetMusicTracker() { _currentMusic = null }

// ---------------------------------------------------------------------------
// SOON(tm) toast
// ---------------------------------------------------------------------------

export function toast(game, text = 'SOON™') {
  const node = el('div', 'wcs-toast', text)
  game.ui.appendChild(node)
  setTimeout(() => node.remove(), 960)
}

export function shake(node) {
  if (!node) return
  node.classList.remove('wcs-shake')
  void node.offsetWidth // restart animation
  node.classList.add('wcs-shake')
}

// ---------------------------------------------------------------------------
// Key label formatting for the controls table
// ---------------------------------------------------------------------------

const KEY_LABELS = {
  Space: 'SPACE', Escape: 'ESC', Enter: 'ENTER', Backspace: 'BKSP',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Tab: 'TAB', CapsLock: 'CAPS',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT',
  MetaLeft: 'L-META', MetaRight: 'R-META', ContextMenu: 'MENU',
  Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *',
  NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .', NumpadEnter: 'NUM ENTER',
}

export function formatKey(code) {
  if (!code) return '-'
  if (KEY_LABELS[code]) return KEY_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6)
  return code.toUpperCase()
}

// ---------------------------------------------------------------------------
// MenuList — vertical list with keyboard/gamepad/mouse nav + sfx.
// items: [{ label, id, hint?, dim? }]
// ---------------------------------------------------------------------------

export class MenuList {
  constructor(game, container, items, { onConfirm, onBack, onChange } = {}) {
    this.game = game
    this.items = items
    this.onConfirm = onConfirm
    this.onBack = onBack
    this.onChange = onChange
    this.index = 0
    this.nodes = items.map((item, i) => {
      const btn = el('div', 'wcs-btn' + (item.dim ? ' dim' : ''), item.label)
      btn.addEventListener('mouseenter', () => this.setIndex(i))
      btn.addEventListener('click', () => { this.setIndex(i, true); this._confirm() })
      container.appendChild(btn)
      return btn
    })
    this.setIndex(0, true)
  }

  setIndex(i, silent = false) {
    const n = this.items.length
    const next = ((i % n) + n) % n
    if (next === this.index && this.nodes[next].classList.contains('sel')) {
      if (!silent) return
    }
    if (next !== this.index && !silent) this.game.audio.sfx('menu_move')
    this.index = next
    this.nodes.forEach((node, j) => node.classList.toggle('sel', j === next))
    // keep the selection visible when the list scrolls (short viewports)
    try { this.nodes[next]?.scrollIntoView?.({ block: 'nearest' }) } catch { /* older engines */ }
    this.onChange?.(this.items[next], next)
  }

  _confirm() {
    this.game.audio.sfx('menu_confirm')
    this.onConfirm?.(this.items[this.index], this.index)
  }

  // Poll once per fixed frame from the owning screen's update().
  update() {
    const input = this.game.input
    if (input.menuPressed('up')) this.setIndex(this.index - 1)
    else if (input.menuPressed('down')) this.setIndex(this.index + 1)
    if (input.menuPressed('confirm')) { this._confirm(); return }
    if (input.menuPressed('back') && this.onBack) {
      this.game.audio.sfx('menu_back')
      this.onBack()
    }
  }
}

// ---------------------------------------------------------------------------
// PortraitRail — horizontal strip of fighter thumbnails with a gold cursor.
// Shared by the gallery and move-list screens. Mouse hover/click + setIndex
// from the owning screen's keyboard handling.
// ---------------------------------------------------------------------------

export class PortraitRail {
  constructor(game, container, ids, { onChange } = {}) {
    this.game = game
    this.ids = ids
    this.onChange = onChange
    this.index = 0
    this.nodes = ids.map((id, i) => {
      const node = el('div', 'wcs-railslot')
      const canvas = document.createElement('canvas')
      drawPortrait(canvas, id)
      node.appendChild(canvas)
      node.appendChild(el('div', 'rn', charName(id)))
      node.addEventListener('mouseenter', () => this.setIndex(i))
      node.addEventListener('click', () => this.setIndex(i))
      container.appendChild(node)
      return node
    })
    this.setIndex(0, true)
  }

  setIndex(i, force = false) {
    const n = this.ids.length
    const next = ((i % n) + n) % n
    if (next === this.index && !force) return
    if (next !== this.index) this.game.audio.sfx('menu_move')
    this.index = next
    this.nodes.forEach((node, j) => node.classList.toggle('sel', j === next))
    this.onChange?.(this.ids[next], next)
  }

  move(dir) { this.setIndex(this.index + dir) }
}

// ---------------------------------------------------------------------------
// Procedural canvas portraits — chunky flat-color head icons, 2002 style.
// ---------------------------------------------------------------------------

const PORTRAIT_COLORS = {
  peepee: '#4caf50', shibro: '#e2a24b', 'tired-ape': '#8d6e63',
  'fatty-pingo': '#546e7a', bonko: '#ff7043', 'crypto-punkd': '#7e57c2',
  'cool-pal': '#26c6da', 'blackish-bull': '#37474f',
}

// One bespoke painter per fighter — chunky flat shapes with heavy #06040f
// outlines over the shared rim-burst backdrop. Palettes are lifted straight
// from each character's model file (src/characters/<id>.js) so the icons match
// the in-arena fighters. Painters are called with lineWidth=4, black stroke,
// textAlign 'center' already set. Must read at 52px.
const PORTRAIT_PAINTERS = {
  wally(g) {
    // gray-blue elephant: dome head, big ears, trunk
    g.fillStyle = '#8fa3bd'
    // ears
    g.beginPath(); g.ellipse(18, 46, 14, 20, -0.2, 0, Math.PI * 2); g.fill(); g.stroke()
    g.beginPath(); g.ellipse(78, 46, 14, 20, 0.2, 0, Math.PI * 2); g.fill(); g.stroke()
    // head
    g.beginPath(); g.ellipse(48, 44, 26, 24, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // trunk
    g.beginPath()
    g.moveTo(41, 56); g.quadraticCurveTo(48, 84, 62, 84)
    g.quadraticCurveTo(50, 88, 40, 78); g.quadraticCurveTo(33, 66, 34, 56)
    g.closePath(); g.fill(); g.stroke()
    // signature black rectangular sunglasses (the model has no eyes — the
    // shades ARE the face): arms, bridge, then two chunky lenses
    g.fillStyle = '#06040f'
    g.fillRect(22, 34, 8, 4)
    g.fillRect(66, 34, 8, 4)
    g.fillRect(43, 35, 10, 4)
    g.fillRect(29, 31, 16, 12)
    g.fillRect(51, 31, 16, 12)
    // a small white rising-chart zigzag in each lens (number go up)
    g.strokeStyle = '#fff'
    g.lineWidth = 2
    for (const ox of [29, 51]) {
      g.beginPath()
      g.moveTo(ox + 2, 40.5)
      g.lineTo(ox + 6, 36.5)
      g.lineTo(ox + 9, 38.5)
      g.lineTo(ox + 14, 33.5)
      g.stroke()
    }
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
    // gold coin held at trunk tip
    g.fillStyle = '#ffd94a'
    g.beginPath(); g.arc(66, 82, 8, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#7a5a05'
    g.font = 'bold 11px Impact, sans-serif'
    g.fillText('W', 66, 86)
  },

  dogey(g) {
    // brown mutt: one ear up + one floppy, tongue out, orange hoodie collar
    g.fillStyle = '#b5793c'
    // up ear (right)
    g.beginPath(); g.moveTo(74, 34); g.lineTo(66, 8); g.lineTo(54, 28); g.closePath(); g.fill(); g.stroke()
    // floppy ear (left) — folds down over the side of the head
    g.beginPath()
    g.moveTo(38, 26)
    g.quadraticCurveTo(20, 10, 14, 30)
    g.quadraticCurveTo(11, 44, 21, 52)
    g.quadraticCurveTo(27, 42, 31, 35)
    g.closePath(); g.fill(); g.stroke()
    // head
    g.beginPath(); g.ellipse(48, 48, 28, 25, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // snout
    g.fillStyle = '#e9c894'
    g.beginPath(); g.ellipse(48, 60, 15, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // nose + open happy mouth
    g.fillStyle = '#06040f'
    g.beginPath(); g.arc(48, 55, 4, 0, Math.PI * 2); g.fill()
    g.lineWidth = 3
    g.beginPath(); g.moveTo(37, 59); g.quadraticCurveTo(48, 69, 59, 59); g.stroke()
    // happy closed-arc eyes
    g.beginPath(); g.arc(35, 43, 5, Math.PI * 1.15, Math.PI * 1.85); g.stroke()
    g.beginPath(); g.arc(61, 43, 5, Math.PI * 1.15, Math.PI * 1.85); g.stroke()
    g.lineWidth = 4
    // orange hoodie collar arc across the bottom, over the chin
    g.fillStyle = '#f28c1b'
    g.beginPath(); g.ellipse(48, 100, 42, 26, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill(); g.stroke()
    // tongue out, draped over the collar
    g.fillStyle = '#ff6b8a'
    g.beginPath()
    g.moveTo(43, 62); g.lineTo(53, 62); g.lineTo(53, 76)
    g.quadraticCurveTo(53, 81, 48, 81)
    g.quadraticCurveTo(43, 81, 43, 76)
    g.closePath(); g.fill(); g.stroke()
    g.lineWidth = 2
    g.beginPath(); g.moveTo(48, 66); g.lineTo(48, 77); g.stroke()
    g.lineWidth = 4
  },

  peepee(g) {
    // chunky green frog: wide squat head, huge top-mounted eyes with heavy
    // lids, smug wide mouth, black jacket + oversized gold tie
    g.fillStyle = '#55a34e'
    g.beginPath(); g.ellipse(48, 52, 30, 23, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // pale chin/throat
    g.fillStyle = '#d3e8b4'
    g.beginPath(); g.ellipse(48, 63, 19, 11, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // huge eyes perched on top, lids half down
    for (const sx of [-1, 1]) {
      const ex = 48 + 16 * sx
      g.fillStyle = '#f4f6ea'
      g.beginPath(); g.arc(ex, 28, 12, 0, Math.PI * 2); g.fill(); g.stroke()
      g.fillStyle = '#14161a'
      g.beginPath(); g.arc(ex + 2 * sx, 31, 4.5, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#3d7d3a' // heavy lid
      g.beginPath(); g.arc(ex, 28, 12, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill(); g.stroke()
    }
    // wide smug mouth
    g.strokeStyle = '#2c5a2a'
    g.beginPath(); g.moveTo(24, 56); g.quadraticCurveTo(48, 65, 72, 56); g.stroke()
    g.strokeStyle = '#06040f'
    // black jacket shoulders
    g.fillStyle = '#1b1d24'
    g.beginPath(); g.ellipse(48, 102, 42, 26, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill(); g.stroke()
    // oversized gold tie: blade peeking below a chunky knot
    g.fillStyle = '#c79a1e'
    g.beginPath(); g.moveTo(44, 84); g.lineTo(52, 84); g.lineTo(54, 96); g.lineTo(42, 96); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#ffcf3d'
    g.beginPath(); g.moveTo(41, 76); g.lineTo(55, 76); g.lineTo(57, 87); g.lineTo(39, 87); g.closePath(); g.fill(); g.stroke()
  },

  shibro(g) {
    // noble white mountain dog: tall pointed ears, calm level eyes, silver
    // shoulder armor, blue sash hint + geometric gold medallion
    g.fillStyle = '#f4f1e8'
    // tall pointed ears
    g.beginPath(); g.moveTo(28, 34); g.lineTo(20, 4); g.lineTo(42, 22); g.closePath(); g.fill(); g.stroke()
    g.beginPath(); g.moveTo(68, 34); g.lineTo(76, 4); g.lineTo(54, 22); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#e6a7b0' // pink inner ear
    g.beginPath(); g.moveTo(28, 26); g.lineTo(24, 12); g.lineTo(35, 21); g.closePath(); g.fill()
    g.beginPath(); g.moveTo(68, 26); g.lineTo(72, 12); g.lineTo(61, 21); g.closePath(); g.fill()
    // head
    g.fillStyle = '#f4f1e8'
    g.beginPath(); g.ellipse(48, 47, 26, 24, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // cream muzzle + nose + gentle mouth
    g.fillStyle = '#fff7e2'
    g.beginPath(); g.ellipse(48, 58, 14, 11, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#23252c'
    g.beginPath(); g.arc(48, 54, 4, 0, Math.PI * 2); g.fill()
    g.lineWidth = 3
    g.beginPath(); g.moveTo(41, 61); g.quadraticCurveTo(48, 65, 55, 61); g.stroke()
    // calm level eyes + noble brows
    g.fillStyle = '#23252c'
    g.beginPath(); g.ellipse(36, 42, 4.5, 2.6, 0, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(60, 42, 4.5, 2.6, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#dcd6c6'
    g.beginPath(); g.moveTo(30, 35); g.lineTo(41, 34); g.stroke()
    g.beginPath(); g.moveTo(55, 34); g.lineTo(66, 35); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
    // silver shoulder armor + blue sash + gold medallion
    g.fillStyle = '#b9c3d2'
    g.beginPath(); g.ellipse(48, 103, 42, 26, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#2b5fe0'
    g.beginPath(); g.moveTo(18, 100); g.lineTo(62, 80); g.lineTo(70, 91); g.lineTo(26, 111); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#ffcf3d'
    g.beginPath(); g.moveTo(48, 80); g.lineTo(54, 87); g.lineTo(48, 94); g.lineTo(42, 87); g.closePath(); g.fill(); g.stroke()
  },

  'tired-ape'(g) {
    // exhausted brown ape: tan face, dark shades with eyelids drooping OVER
    // them, purple robe collar, MEH coffee mug in the corner
    // round sleepy ears
    g.fillStyle = '#6b4a34'
    g.beginPath(); g.arc(21, 44, 8, 0, Math.PI * 2); g.fill(); g.stroke()
    g.beginPath(); g.arc(75, 44, 8, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#c9a26b'
    g.beginPath(); g.arc(21, 44, 3.5, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.arc(75, 44, 3.5, 0, Math.PI * 2); g.fill()
    // fur dome
    g.fillStyle = '#6b4a34'
    g.beginPath(); g.ellipse(48, 46, 27, 24, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // tan face plate
    g.fillStyle = '#c9a26b'
    g.beginPath(); g.ellipse(48, 52, 20, 17, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // nostrils + unimpressed mouth
    g.fillStyle = '#a9834f'
    g.beginPath(); g.arc(44, 60, 1.8, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.arc(52, 60, 1.8, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#54392a'
    g.lineWidth = 3
    g.beginPath(); g.moveTo(40, 67); g.lineTo(58, 68); g.stroke()
    g.strokeStyle = '#06040f'
    // dark shades: temple arms, bridge, lenses
    g.fillStyle = '#14161a'
    g.fillRect(24, 44, 6, 3)
    g.fillRect(66, 44, 6, 3)
    g.fillRect(43, 45, 10, 3)
    g.fillRect(29, 41, 15, 10)
    g.fillRect(52, 41, 15, 10)
    // droopy eyelids sagging over the shade tops
    g.fillStyle = '#c9a26b'
    g.beginPath(); g.ellipse(36.5, 41, 8.5, 4.5, 0.12, 0, Math.PI * 2); g.fill(); g.stroke()
    g.beginPath(); g.ellipse(59.5, 41, 8.5, 4.5, -0.12, 0, Math.PI * 2); g.fill(); g.stroke()
    g.lineWidth = 4
    // purple robe collar with light trim
    g.fillStyle = '#6a3fa0'
    g.beginPath(); g.ellipse(48, 103, 42, 26, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill(); g.stroke()
    g.strokeStyle = '#9a6fd0'
    g.lineWidth = 3
    g.beginPath(); g.ellipse(48, 105, 35, 21, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke()
    g.strokeStyle = '#06040f'
    // MEH mug, bottom-right corner
    g.beginPath(); g.arc(88, 81, 6, -Math.PI / 2, Math.PI / 2); g.stroke() // handle
    g.fillStyle = '#f2efe9'
    g.fillRect(70, 71, 18, 21); g.strokeRect(70, 71, 18, 21)
    g.fillStyle = '#5a3a22'
    g.fillRect(72, 73, 14, 4) // coffee
    g.fillStyle = '#2a2a2a'
    g.font = 'bold 8px Impact, sans-serif'
    g.fillText('MEH', 79, 88)
    g.lineWidth = 4
  },

  'fatty-pingo'(g) {
    // round arctic seabird: blue-black head, famous white face, chunky orange
    // beak, brass inventor goggles pushed up on the forehead
    g.fillStyle = '#252c3a'
    g.beginPath(); g.ellipse(48, 52, 27, 26, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // white face patch
    g.fillStyle = '#f2f6fa'
    g.beginPath(); g.ellipse(48, 61, 19, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // earnest engineer eyes
    g.lineWidth = 3
    g.fillStyle = '#f2f6fa'
    g.beginPath(); g.arc(38, 45, 5.5, 0, Math.PI * 2); g.fill(); g.stroke()
    g.beginPath(); g.arc(58, 45, 5.5, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#14161a'
    g.beginPath(); g.arc(39, 46, 2.4, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.arc(57, 46, 2.4, 0, Math.PI * 2); g.fill()
    g.lineWidth = 4
    // chunky orange beak
    g.fillStyle = '#ff9d2e'
    g.beginPath()
    g.moveTo(37, 53); g.lineTo(59, 53)
    g.quadraticCurveTo(57, 63, 48, 65)
    g.quadraticCurveTo(39, 63, 37, 53)
    g.closePath(); g.fill(); g.stroke()
    g.strokeStyle = '#e0801c'
    g.lineWidth = 2
    g.beginPath(); g.moveTo(42, 58); g.lineTo(54, 58); g.stroke()
    // goggle strap across the crown
    g.strokeStyle = '#8f4a3b'
    g.lineWidth = 6
    g.beginPath(); g.arc(48, 52, 26, Math.PI * 1.12, Math.PI * 1.88); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 3
    // brass goggle cans with cyan lenses, up on the forehead
    for (const ex of [37, 59]) {
      g.fillStyle = '#c79a3b'
      g.beginPath(); g.arc(ex, 27, 8.5, 0, Math.PI * 2); g.fill(); g.stroke()
      g.fillStyle = '#7de8ff'
      g.beginPath(); g.arc(ex, 27, 4.5, 0, Math.PI * 2); g.fill(); g.stroke()
      g.fillStyle = '#e6feff'
      g.beginPath(); g.arc(ex - 1.5, 25.5, 1.4, 0, Math.PI * 2); g.fill()
    }
    g.lineWidth = 4
  },

  bonko(g) {
    // grey heeler courier: one radar ear up, one flopped forward, orange
    // markings, cream muzzle, tongue out, orange courier strap
    // upright ear (left) + lighter inner
    g.fillStyle = '#4a4f58'
    g.beginPath(); g.moveTo(27, 32); g.lineTo(21, 4); g.lineTo(43, 22); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#5d636e'
    g.beginPath(); g.moveTo(28, 25); g.lineTo(25, 11); g.lineTo(36, 20); g.closePath(); g.fill()
    // head
    g.fillStyle = '#4a4f58'
    g.beginPath(); g.ellipse(48, 48, 26, 24, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    // flopped ear (right) — folded forward over the brow
    g.beginPath()
    g.moveTo(56, 22)
    g.quadraticCurveTo(74, 8, 80, 24)
    g.quadraticCurveTo(83, 36, 70, 42)
    g.quadraticCurveTo(64, 30, 56, 22)
    g.closePath(); g.fill(); g.stroke()
    // orange heeler markings: brow dots + cheek patches
    g.fillStyle = '#e08a3c'
    g.beginPath(); g.arc(35, 36, 3.4, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.arc(59, 38, 3.4, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(27, 54, 5.5, 8, 0.2, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(69, 54, 5.5, 8, -0.2, 0, Math.PI * 2); g.fill()
    // keen eyes
    g.fillStyle = '#14161a'
    g.beginPath(); g.arc(36, 44, 3.2, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.arc(58, 45, 3.2, 0, Math.PI * 2); g.fill()
    // cream muzzle + nose + open happy jaw
    g.fillStyle = '#f1e5cf'
    g.beginPath(); g.ellipse(48, 60, 15, 11, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#1a1c20'
    g.beginPath(); g.arc(48, 55, 4, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(48, 62, 7, 5.5, 0, 0, Math.PI); g.closePath(); g.fill()
    // tongue!
    g.fillStyle = '#e0708a'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(44, 63); g.lineTo(52, 63); g.lineTo(52, 74)
    g.quadraticCurveTo(52, 78, 48, 78)
    g.quadraticCurveTo(44, 78, 44, 74)
    g.closePath(); g.fill(); g.stroke()
    g.lineWidth = 2
    g.beginPath(); g.moveTo(48, 66); g.lineTo(48, 74); g.stroke()
    g.lineWidth = 4
    // orange courier strap + dark buckle
    g.fillStyle = '#ff8c1a'
    g.beginPath(); g.moveTo(12, 101); g.lineTo(60, 76); g.lineTo(67, 88); g.lineTo(19, 113); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#2b2e35'
    g.lineWidth = 3
    g.beginPath(); g.moveTo(37, 86); g.lineTo(48, 81); g.lineTo(52, 88); g.lineTo(41, 93); g.closePath(); g.fill(); g.stroke()
    g.lineWidth = 4
  },

  'crypto-punkd'(g) {
    // block-built sleuth: perfectly square head, pixel cyan eyes, geometric
    // hat, purple/cyan glitch bars, magnifying lens in the corner
    g.fillStyle = '#4a5266'
    g.beginPath(); g.rect(27, 30, 42, 42); g.fill(); g.stroke()
    // geometric hat: crown + brim + cyan band
    g.fillStyle = '#14161d'
    g.beginPath(); g.moveTo(31, 27); g.lineTo(34, 9); g.lineTo(62, 9); g.lineTo(65, 27); g.closePath(); g.fill(); g.stroke()
    g.beginPath(); g.rect(21, 26, 54, 6); g.fill(); g.stroke()
    g.fillStyle = '#2ee6ff'
    g.fillRect(33, 19, 30, 6)
    // pixel eyes: 10x10 blocks with a bright corner pixel
    g.fillStyle = '#2ee6ff'
    g.fillRect(34, 42, 10, 10)
    g.fillRect(53, 42, 10, 10)
    g.fillStyle = '#c8f9ff'
    g.fillRect(34, 42, 4, 4)
    g.fillRect(53, 42, 4, 4)
    // flat pixel mouth
    g.fillStyle = '#2ee6ff'
    g.fillRect(41, 62, 15, 4)
    // glitch displacement bars — purple + cyan slices shifted off the head
    g.fillStyle = '#8b5cf6'
    g.fillRect(22, 36, 51, 3)
    g.fillStyle = '#2ee6ff'
    g.fillRect(30, 56, 46, 3)
    // magnifying lens edge, bottom-right
    g.fillStyle = 'rgba(159,232,255,0.55)'
    g.beginPath(); g.arc(76, 76, 12, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#d7b45a'
    g.beginPath(); g.arc(76, 76, 12, 0, Math.PI * 2); g.stroke()
    g.lineWidth = 5
    g.beginPath(); g.moveTo(84, 85); g.lineTo(92, 93); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
  },

  'cool-pal'(g) {
    // unbothered capybara: boxy loaf head, blunt snout, half-closed eyes,
    // ENORMOUS headphones
    g.fillStyle = '#b08a5f'
    g.beginPath()
    g.moveTo(26, 44); g.quadraticCurveTo(26, 26, 48, 26); g.quadraticCurveTo(70, 26, 70, 44)
    g.lineTo(70, 62); g.quadraticCurveTo(70, 70, 62, 70)
    g.lineTo(34, 70); g.quadraticCurveTo(26, 70, 26, 62)
    g.closePath(); g.fill(); g.stroke()
    // tiny ears
    g.fillStyle = '#8f6d49'
    g.lineWidth = 3
    g.beginPath(); g.arc(34, 27, 5, 0, Math.PI * 2); g.fill(); g.stroke()
    g.beginPath(); g.arc(62, 27, 5, 0, Math.PI * 2); g.fill(); g.stroke()
    g.lineWidth = 4
    // blunt snout
    g.fillStyle = '#a17d52'
    g.beginPath()
    g.moveTo(30, 50); g.lineTo(66, 50); g.quadraticCurveTo(70, 50, 70, 56)
    g.lineTo(70, 63); g.quadraticCurveTo(70, 70, 62, 70)
    g.lineTo(34, 70); g.quadraticCurveTo(26, 70, 26, 63)
    g.lineTo(26, 56); g.quadraticCurveTo(26, 50, 30, 50)
    g.closePath(); g.fill(); g.stroke()
    // wide flat nose + tiny unbothered mouth
    g.fillStyle = '#3a2c1e'
    g.beginPath(); g.ellipse(48, 56, 7, 3.5, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#3a2c1e'
    g.lineWidth = 2
    g.beginPath(); g.moveTo(45, 64); g.lineTo(51, 64); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
    // half-closed eyes: dark slits under heavy fur lids. maximum unbothered.
    g.fillStyle = '#241a10'
    g.fillRect(33, 43, 9, 3.5)
    g.fillRect(54, 43, 9, 3.5)
    g.fillStyle = '#8f6d49'
    g.fillRect(32, 39.5, 11, 4)
    g.fillRect(53, 39.5, 11, 4)
    // ENORMOUS headphones: band over the top + big cushions
    g.strokeStyle = '#2a2e38'
    g.lineWidth = 7
    g.beginPath(); g.arc(48, 46, 33, Math.PI * 1.08, Math.PI * 1.92); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
    g.fillStyle = '#1c1f26'
    g.beginPath(); g.ellipse(19, 50, 9, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    g.beginPath(); g.ellipse(77, 50, 9, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    g.strokeStyle = '#454b58'
    g.lineWidth = 2
    g.beginPath(); g.ellipse(19, 50, 4.5, 9.5, 0, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.ellipse(77, 50, 4.5, 9.5, 0, 0, Math.PI * 2); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
  },

  'blackish-bull'(g) {
    // dark-charcoal bull: silver geometric horns, blocky skull, heavy grey
    // muzzle, mirrored visor with a green ticker glint
    // geometric silver horns (behind the head)
    g.fillStyle = '#c9ced8'
    g.beginPath(); g.moveTo(30, 40); g.lineTo(10, 28); g.lineTo(16, 12); g.lineTo(34, 28); g.closePath(); g.fill(); g.stroke()
    g.beginPath(); g.moveTo(66, 40); g.lineTo(86, 28); g.lineTo(80, 12); g.lineTo(62, 28); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#9aa1ad'
    g.beginPath(); g.moveTo(30, 40); g.lineTo(20, 34); g.lineTo(34, 28); g.closePath(); g.fill()
    g.beginPath(); g.moveTo(66, 40); g.lineTo(76, 34); g.lineTo(62, 28); g.closePath(); g.fill()
    // blocky charcoal skull
    g.fillStyle = '#33363d'
    g.beginPath()
    g.moveTo(32, 24); g.lineTo(64, 24); g.quadraticCurveTo(74, 24, 74, 34)
    g.lineTo(74, 58); g.quadraticCurveTo(74, 66, 66, 68)
    g.lineTo(30, 68); g.quadraticCurveTo(22, 66, 22, 58)
    g.lineTo(22, 34); g.quadraticCurveTo(22, 24, 32, 24)
    g.closePath(); g.fill(); g.stroke()
    // heavy grey muzzle
    g.fillStyle = '#4a4e57'
    g.beginPath()
    g.moveTo(34, 55); g.lineTo(62, 55); g.quadraticCurveTo(70, 55, 70, 64)
    g.lineTo(70, 70); g.quadraticCurveTo(70, 78, 61, 78)
    g.lineTo(35, 78); g.quadraticCurveTo(26, 78, 26, 70)
    g.lineTo(26, 64); g.quadraticCurveTo(26, 55, 34, 55)
    g.closePath(); g.fill(); g.stroke()
    // flared nostrils
    g.fillStyle = '#17181c'
    g.beginPath(); g.ellipse(38, 67, 3.4, 4.6, 0.35, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(58, 67, 3.4, 4.6, -0.35, 0, Math.PI * 2); g.fill()
    // mirrored visor with green ticker glint
    g.fillStyle = '#aef7cf'
    g.fillRect(28, 37, 40, 12); g.strokeRect(28, 37, 40, 12)
    g.strokeStyle = '#37e07a'
    g.lineWidth = 3
    g.beginPath(); g.moveTo(34, 47); g.lineTo(42, 39); g.stroke()
    g.beginPath(); g.moveTo(46, 47); g.lineTo(52, 41); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 4
    // black combat-jacket shoulders
    g.fillStyle = '#101116'
    g.beginPath(); g.ellipse(48, 106, 42, 26, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill(); g.stroke()
  },
}

export function drawPortrait(canvas, charId, { locked = false } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return
  const S = 96
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')
  if (!g) return // canvas-free environment — degrade silently
  g.clearRect(0, 0, S, S)

  if (locked || (!Characters[charId] && !PORTRAIT_COLORS[charId])) {
    // unknown mystery fighter
    g.fillStyle = '#141829'
    g.fillRect(0, 0, S, S)
    g.fillStyle = '#232946'
    g.beginPath(); g.arc(S / 2, S / 2 + 4, 30, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#3d4468'
    g.font = 'bold 52px Impact, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('?', S / 2, S / 2 + 6)
    return
  }

  // backdrop burst
  const bg = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S * 0.7)
  bg.addColorStop(0, '#3d1160')
  bg.addColorStop(1, '#140a26')
  g.fillStyle = bg
  g.fillRect(0, 0, S, S)
  g.strokeStyle = 'rgba(255,217,74,0.18)'
  g.lineWidth = 3
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.beginPath()
    g.moveTo(S / 2 + Math.cos(a) * 18, S / 2 + Math.sin(a) * 18)
    g.lineTo(S / 2 + Math.cos(a) * 70, S / 2 + Math.sin(a) * 70)
    g.stroke()
  }

  g.lineWidth = 4
  g.strokeStyle = '#06040f'
  g.textAlign = 'center'

  const painter = PORTRAIT_PAINTERS[charId]
  if (painter) {
    painter(g)
  } else {
    // generic roster head: colored dome + pixel shades
    g.fillStyle = PORTRAIT_COLORS[charId] || '#5c6bc0'
    g.beginPath(); g.ellipse(48, 48, 26, 27, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#06040f'
    g.fillRect(28, 40, 17, 9)
    g.fillRect(51, 40, 17, 9)
    g.fillRect(44, 43, 8, 4)
    g.lineWidth = 3
    g.beginPath(); g.moveTo(38, 64); g.lineTo(58, 64); g.stroke()
  }
}

// ---------------------------------------------------------------------------
// Stat bars HTML (1..10 cells per stat)
// ---------------------------------------------------------------------------

const STAT_KEYS = ['power', 'speed', 'defense', 'chaos']

export function statBarsHTML(stats) {
  return STAT_KEYS.map((key) => {
    const v = Math.max(0, Math.min(10, Math.round(stats?.[key] || 0)))
    let cells = ''
    for (let i = 0; i < 10; i++) cells += `<i class="${i < v ? `on c-${key}` : ''}"></i>`
    return `<div class="stat-row"><span class="sl">${key.toUpperCase()}</span><span class="stat-cells">${cells}</span></div>`
  }).join('')
}

// ---------------------------------------------------------------------------
// Decorative candlestick strip (random green/red bars)
// ---------------------------------------------------------------------------

export function candlesHTML(n = 12) {
  let out = ''
  for (let i = 0; i < n; i++) {
    const up = Math.random() > 0.42
    const h = 12 + Math.floor(Math.random() * 30)
    out += `<i class="${up ? 'up' : 'dn'}" style="height:${h}px"></i>`
  }
  return `<div class="wcs-candles">${out}</div>`
}
