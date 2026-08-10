// VS splash — red corner vs blue corner, giant slamming VS, arena name.
// Auto-advances to the match in ~2.1s; any input skips. Stashes the match
// params so the results screen can offer a rematch.
import { Arenas } from '../../arenas/index.js'
import { el, UIState, charName, charTitle, stopMusicNow } from '../uiKit.js'
import { heroPortrait } from './PortraitStudio.js'

export class VsScreen {
  constructor(game) { this.game = game }

  enter(params = {}) {
    this.params = params
    UIState.lastMatchParams = params
    this.t = 0
    this.done = false

    const p1 = params.p1 || {}
    const p2 = params.p2 || {}
    const arenaName = Arenas[params.arenaId]?.name || 'MEME MARKET'

    this.root = el('div', 'wcs-screen wcs-vs')
    this.root.innerHTML = `
      <div class="vs-side p1">
        <canvas></canvas>
        <div class="vn">${charName(p1.charId)}</div>
        <div class="vt">${charTitle(p1.charId)}</div>
      </div>
      <div class="vs-side p2">
        <canvas></canvas>
        <div class="vn">${charName(p2.charId)}</div>
        <div class="vt">${charTitle(p2.charId)}</div>
      </div>
      <div class="vs-big">VS</div>
      <div class="vs-arena"><small>TONIGHT'S VENUE</small>${arenaName}</div>
      <div class="vs-flash"></div>
    `
    this.game.ui.appendChild(this.root)
    // The two corners are lit as opposing corners: full-body hero shots, red key
    // and rim on the left, cold cyan on the right, each on its own plinth with
    // its own contact shadow. Same canvases, same boxes, same animation — the
    // only thing that changed is what is inside them.
    const canvases = this.root.querySelectorAll('canvas')
    heroPortrait(this.game, canvases[0], p1.charId, {
      framing: 'hero', pose: 'entrance', look: 'p1',
      costume: p1.costume ? 1 : 0, px: 512, priority: true,
    })
    heroPortrait(this.game, canvases[1], p2.charId, {
      framing: 'hero', pose: 'entrance', look: 'p2',
      costume: p2.costume ? 1 : 0, px: 512, priority: true,
    })

    stopMusicNow(this.game)
    this.game.audio.sfx('bell')
    this.game.audio.announcer(`${charName(p1.charId)} versus ${charName(p2.charId)}!`)

    this._onKey = () => this._go()
    this._onClick = () => this._go()
    addEventListener('keydown', this._onKey)
    this.root.addEventListener('pointerdown', this._onClick)
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    this.root?.remove()
    this.root = null
  }

  _go() {
    if (this.done) return
    this.done = true
    this.game.screens.goto('match', this.params)
  }

  update(dt) {
    if (this.done) return
    this.t += dt
    if (this.t >= 2.1) { this._go(); return }
    // let gamepad users skip too
    const input = this.game.input
    if (this.t > 0.35 && (input.menuPressed('confirm') || input.menuPressed('back'))) this._go()
  }
}
