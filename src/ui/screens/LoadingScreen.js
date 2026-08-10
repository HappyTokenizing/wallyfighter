// Fake retro loading screen — everything is procedural so this is pure vibes.
// Auto-advances to 'title' in ~1.5s; any key/click skips immediately.
import { el, touchUI } from '../uiKit.js'
import { GameConfig } from '../../config/GameConfig.js'

const TICKER_LINES = [
  'Inflating token supply…',
  'Bribing validators…',
  'Downloading more RAM…',
  'Wash-trading the leaderboard…',
  'Minting fighters as JPEGs…',
  'Leveraging the ragdolls 125x…',
  'Shorting the loading bar…',
  'Waking up the interns…',
  'Rendering diamond hands…',
]

export class LoadingScreen {
  constructor(game) { this.game = game }

  enter() {
    this.t = 0
    this.done = false
    this.progress = 0
    this.tickerIndex = Math.floor(Math.random() * TICKER_LINES.length)
    this.nextTickerAt = 0

    this.root = el('div', 'wcs-screen wcs-loading')
    this.root.innerHTML = `
      <div class="load-logo">${GameConfig.title}</div>
      <div class="load-sub">${GameConfig.subtitle}</div>
      <div class="load-bar"><div class="load-bar-fill"></div></div>
      <div class="load-pct">0%</div>
      <div class="load-ticker"></div>
      <div class="load-hint">${touchUI(this.game) ? 'TAP TO SKIP (NOBODY EVER WAITS)' : 'PRESS ANY KEY TO SKIP (NOBODY EVER WAITS)'}</div>
    `
    this.game.ui.appendChild(this.root)
    this.fillEl = this.root.querySelector('.load-bar-fill')
    this.pctEl = this.root.querySelector('.load-pct')
    this.tickerEl = this.root.querySelector('.load-ticker')

    this._onKey = () => this._finish()
    this._onClick = () => this._finish()
    addEventListener('keydown', this._onKey)
    this.root.addEventListener('pointerdown', this._onClick)
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    this.root?.remove()
    this.root = null
  }

  _finish() {
    if (this.done) return
    this.done = true
    // first boot plays the intro cinematic once; every boot after that goes
    // straight to the title. The flag is set NOW so a mid-intro refresh never
    // loops the player back into it. Settings → REPLAY INTRO re-enters it (v2.1).
    if (!this.game.save.get('introSeen', false) && this.game.screens.screens.has('intro')) {
      this.game.save.set('introSeen', true)
      this.game.screens.goto('intro')
    } else {
      this.game.screens.goto('title')
    }
  }

  update(dt) {
    if (this.done) return
    this.t += dt

    // chunky fake progress: leaps forward in random steps, always done by 1.4s
    const target = Math.min(1, this.t / 1.4)
    if (target > this.progress) {
      this.progress = Math.min(1, this.progress + (Math.random() < 0.35 ? 0.13 : 0.02) + dt)
      if (this.progress > target + 0.15) this.progress = target + 0.15
    }
    const pct = Math.floor(Math.min(1, Math.max(this.progress, target)) * 100)
    this.fillEl.style.width = pct + '%'
    this.pctEl.textContent = pct + '%'

    if (this.t >= this.nextTickerAt) {
      this.nextTickerAt = this.t + 0.34
      this.tickerIndex = (this.tickerIndex + 1) % TICKER_LINES.length
      this.tickerEl.textContent = TICKER_LINES[this.tickerIndex]
    }

    if (this.t >= 1.5) this._finish()
  }
}
