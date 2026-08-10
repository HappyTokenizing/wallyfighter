// Main menu — chunky beveled list, hover taglines, fake price ticker tape.
// Items whose screens are not registered yet show a SOON(tm) toast.
import { el, MenuList, toast, ensureMusic, candlesHTML } from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'

const ITEMS = [
  { label: 'Story Mode', target: 'story', hint: 'RISE FROM INTERN TO CFO OF VIOLENCE' },
  { label: 'Arcade Ladder', target: 'arcade', hint: 'CLIMB THE LEADERBOARD. GET REKT.' },
  { label: 'Versus CPU', target: 'select', params: { mode: 'versus' }, hint: 'PICK YOUR OPPONENT. THE MACHINE SWINGS BACK.' },
  { label: 'Training', target: 'training', hint: 'PRACTICE YOUR EXIT STRATEGY' },
  { label: 'Ragdoll Playground', target: 'playground', hint: 'PHYSICS CRIMES. NO WITNESSES.' },
  // exhibition is a select-screen mode, not its own screen — route straight there
  { label: 'AI Exhibition', target: 'select', params: { mode: 'exhibition' }, hint: 'LET THE BOTS TRADE BLOWS' },
  { label: 'Character Gallery', target: 'gallery', hint: 'ADMIRE THE PORTFOLIO' },
  { label: 'Move List', target: 'movelist', hint: 'READ THE WHITEPAPER' },
  { label: 'Settings', target: 'settings', hint: 'ADJUST THE TOKENOMICS' },
  // v2.1 (§22): 'Replay Intro' left the menu — it lives in Settings now
  { label: 'Credits', target: 'credits', hint: 'WHO RUGGED THIS TOGETHER' },
]

const TICKER = [
  ['$WALLY', '+420.69%', true], ['$DOGEY', '+12.34%', true], ['$PEEPEE', '-69.42%', false],
  ['$SHIBRO', '+7.77%', true], ['$APE', '-33.30%', false], ['$PINGO', '+0.01%', true],
  ['$BONKO', '-99.98%', false], ['$PUNKD', '+1337.00%', true], ['$PAL', '-4.20%', false],
  ['$BULL', '+88.88%', true], ['$RUG', '-100.00%', false],
]

export class MenuScreen {
  constructor(game) { this.game = game }

  enter() {
    this.backdrop = getBackdrop(this.game)

    const tape = TICKER
      .map(([sym, chg, up]) => `<span class="sym">${sym}</span> <span class="${up ? 'up' : 'dn'}">${chg} ${up ? '▲' : '▼'}</span>`)
      .join(' &nbsp;·&nbsp; ')

    this.root = el('div', 'wcs-screen wcs-menu')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="menu-logo">
        <div class="l1">WALLY</div>
        <div class="l2">CRYPTO SMACKDOWN</div>
      </div>
      <div class="menu-deco">${candlesHTML(14)}</div>
      <div class="menu-list"></div>
      <div class="menu-hint"></div>
      <div class="menu-ticker"><div class="tape">${tape} &nbsp;·&nbsp; ${tape} &nbsp;·&nbsp;</div></div>
    `
    this.game.ui.appendChild(this.root)
    this.hintEl = this.root.querySelector('.menu-hint')

    this.list = new MenuList(this.game, this.root.querySelector('.menu-list'), ITEMS, {
      onConfirm: (item) => this._select(item),
      onBack: () => this.game.screens.goto('title'),
      onChange: (item) => { this.hintEl.textContent = item.hint || '' },
    })
  }

  exit() {
    this.root?.remove()
    this.root = null
    this.list = null
  }

  _select(item) {
    const screens = this.game.screens
    if (screens.screens.has(item.target)) {
      screens.goto(item.target, item.params || {})
    } else {
      toast(this.game, 'SOON™')
      this.game.audio.sfx('menu_back')
    }
  }

  update(dt) {
    ensureMusic(this.game, 'menu')
    this.backdrop.update(dt)
    this.list?.update()
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
