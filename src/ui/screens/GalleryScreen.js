// Character Gallery — admire the portfolio. One big featured card (portrait,
// name, title, bio, style, stat bars, costume A/B preview note) plus a
// thumbnail rail of all ten fighters. Menu-nav + mouse, ESC back to menu.
import { RosterOrder } from '../../characters/index.js'
import {
  el, ensureMusic, statBarsHTML, charDef, charName, charTitle,
  PortraitRail, hintHTML,
} from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'
import { heroPortrait } from './PortraitStudio.js'

const COSTUMES = [
  ['A', 'FLOOR MODEL, AS SEEN IN THE WHITEPAPER'],
  ['B', 'ALT PALETTE — LIMITED MINT OF 10,000,000,000'],
]

function weightClass(w = 1) {
  if (w < 1.0) return 'PAPERWEIGHT'
  if (w < 1.3) return 'MID CAP'
  if (w < 1.7) return 'LARGE CAP'
  return 'TOO BIG TO FAIL'
}

export class GalleryScreen {
  constructor(game) { this.game = game }

  enter() {
    this.backdrop = getBackdrop(this.game)
    this.costume = 0

    this.root = el('div', 'wcs-screen wcs-gallery')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="wcs-pagehead">
        <div class="h1">CHARACTER GALLERY</div>
        <div class="h2">THE PORTFOLIO — FULLY DIVERSIFIED IN VIOLENCE</div>
      </div>
      <div class="gal-count"></div>
      <div class="gal-card wcs-panel">
        <div class="gal-left">
          <canvas class="gal-portrait"></canvas>
          <div class="gal-costume"></div>
        </div>
        <div class="gal-info">
          <div class="gn"></div>
          <div class="gt"></div>
          <div class="gb"></div>
          <div class="gs"></div>
          <div class="gal-stats"></div>
          <div class="gal-extra"></div>
        </div>
      </div>
      <div class="wcs-rail gal-rail"></div>
      ${hintHTML(this.game,
        '<b>&larr;&rarr;</b> BROWSE &nbsp; <b>K</b> COSTUME &nbsp; <b>ESC</b> BACK',
        'TAP A FIGHTER TO BROWSE')}
    `
    this.game.ui.appendChild(this.root)
    this.card = this.root.querySelector('.gal-card')
    this.portrait = this.root.querySelector('.gal-portrait')
    this.countEl = this.root.querySelector('.gal-count')

    this.rail = new PortraitRail(this.game, this.root.querySelector('.gal-rail'), RosterOrder, {
      onChange: (id, i) => this._show(id, i),
    })

    // The rail ships flat doodles from uiKit; upgrade each thumbnail in place to
    // a lit 3D bust. Purely a repaint of canvases the rail already created — no
    // node is added, removed or reordered, so the rail's hover/click/cursor
    // logic is untouched.
    this.rail.nodes.forEach((node, i) => {
      const canvas = node.querySelector('canvas')
      if (canvas) heroPortrait(this.game, canvas, RosterOrder[i], { framing: 'bust', px: 200 })
    })
  }

  exit() {
    this.root?.remove()
    this.root = null
    this.rail = null
  }

  _q(sel) { return this.root.querySelector(sel) }

  _show(id, i) {
    this.costume = 0
    this.currentId = id
    const def = charDef(id)

    this._q('.gn').textContent = charName(id)
    this._q('.gt').textContent = charTitle(id)
    this._q('.gb').textContent = def?.bio || 'Dossier sealed pending litigation.'
    this._q('.gs').textContent = def?.style ? 'STYLE: ' + def.style : ''
    this._q('.gal-stats').innerHTML = statBarsHTML(def?.stats)
    this._q('.gal-extra').textContent = def
      ? `HEIGHT ${def.height?.toFixed(1) ?? '?'}M · WEIGHT CLASS: ${weightClass(def.weight)} · ${def.moves?.length ?? 0} REGISTERED MOVES (1 UNREGISTERED)`
      : ''
    this.countEl.textContent =
      `${String(i + 1).padStart(2, '0')} / ${String(RosterOrder.length).padStart(2, '0')}`
    this._applyCostume()

    // chunky re-pop on every change
    this.card.classList.remove('pop')
    void this.card.offsetWidth
    this.card.classList.add('pop')
  }

  _toggleCostume() {
    this.costume = this.costume ? 0 : 1
    this.game.audio.sfx('coin')
    this._applyCostume()
  }

  _applyCostume() {
    const [letter, note] = COSTUMES[this.costume]
    this._q('.gal-costume').innerHTML = `COSTUME ${letter} — ${note}<br>[K] SWAP PREVIEW`
    // The hue-shift is now only the STAND-IN while the alt-palette model is
    // baking; the real costume render replaces it and the filter comes off.
    this.portrait.style.filter = this.costume ? 'hue-rotate(150deg) saturate(1.25)' : ''
    const id = this.currentId
    const def = charDef(id)
    // Gallery framing: the whole fighter on a lit plinth under a neutral studio
    // environment, which is the honest way to show off the surfacing work — no
    // corner tint editorialising the colours.
    heroPortrait(this.game, this.portrait, id, {
      framing: 'hero',
      pose: 'idle',
      look: 'neutral',
      costume: this.costume ? 1 : 0,
      locked: !def,
      px: 400,
      priority: true,
      onReady: () => { this.portrait.style.filter = '' },
    })
  }

  update(dt) {
    ensureMusic(this.game, 'menu')
    this.backdrop.update(dt)

    const input = this.game.input
    if (input.menuPressed('left')) this.rail.move(-1)
    else if (input.menuPressed('right')) this.rail.move(1)

    // Heavy toggles costume, checked BEFORE back — P1 heavy (KeyK) also matches
    // the menu 'back' binding (same convention as the select screen).
    if (input.pressed(0, 'heavy') || input.pressed(1, 'heavy')) {
      this._toggleCostume()
    } else if (input.menuPressed('back')) {
      this.game.audio.sfx('menu_back')
      this.game.screens.goto('menu')
      return
    }
    if (input.menuPressed('confirm')) this._toggleCostume()
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
