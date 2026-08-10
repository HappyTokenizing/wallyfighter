// Title screen — big animated split-color logo over the 3D backdrop,
// PRESS ANY BUTTON pulse, title music. Any input advances to the menu.
import { el, ensureMusic, touchUI } from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'
import { GameConfig } from '../../config/GameConfig.js'

export class TitleScreen {
  constructor(game) { this.game = game }

  enter() {
    this.done = false
    this.backdrop = getBackdrop(this.game)

    // "WALLY: CRYPTO SMACKDOWN" -> WALLY / CRYPTO + SMACKDOWN split-color
    const [head, tail] = GameConfig.title.split(':')
    const tailWords = (tail || 'CRYPTO SMACKDOWN').trim().split(/\s+/)
    const w2 = tailWords[0] || 'CRYPTO'
    const w3 = tailWords.slice(1).join(' ') || 'SMACKDOWN'

    this.root = el('div', 'wcs-screen wcs-title')
    this.root.innerHTML = `
      <div class="title-stack">
        <div class="title-word-wally">${head}</div>
        <div>
          <span class="title-word-crypto">${w2}</span>
          <span class="title-word-smack">${w3}</span>
        </div>
        <div class="title-sub">${GameConfig.subtitle}</div>
      </div>
      <div class="title-press">${touchUI(this.game) ? '- TAP TO START -' : '- PRESS ANY BUTTON -'}</div>
      <div class="title-footer">v${GameConfig.version} · © 2009 SATOSHI NAKAMOTO · NO REFUNDS · NOT FINANCIAL ADVICE</div>
    `
    this.game.ui.appendChild(this.root)

    this._onKey = () => this._advance()
    this._onClick = () => this._advance()
    addEventListener('keydown', this._onKey)
    this.root.addEventListener('pointerdown', this._onClick)
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    this.root?.remove()
    this.root = null
  }

  _advance() {
    if (this.done) return
    this.done = true
    this.game.audio.sfx('menu_confirm')
    this.game.screens.goto('menu')
  }

  update(dt) {
    ensureMusic(this.game, 'title')
    this.backdrop.update(dt)
    if (this.done) return
    // also catch gamepad buttons (no DOM events for those)
    const input = this.game.input
    for (const name of ['confirm', 'back', 'up', 'down', 'left', 'right']) {
      if (input.menuPressed(name)) { this._advance(); return }
    }
    for (let p = 0; p < 2; p++) {
      for (const a of ['light', 'heavy', 'kick', 'grab', 'special', 'super', 'jump', 'block']) {
        if (input.pressed(p, a)) { this._advance(); return }
      }
    }
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
