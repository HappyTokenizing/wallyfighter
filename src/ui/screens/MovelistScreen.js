// Move List — the whitepaper. Fighter picker rail on top, a clean frame-data
// table below: every move's name, kind, input glyphs, damage and S·A·R frames,
// specials + super + finisher included. Hidden joke moves print as '???'.
import { RosterOrder } from '../../characters/index.js'
import { el, ensureMusic, charDef, PortraitRail, hintHTML } from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'

const GLYPHS = {
  forward: '→', back: '←', up: '↑', down: '↓',
  left: '←', right: '→', jump: '↑',
  light: 'L', heavy: 'H', kick: 'K', grab: 'G', special: 'SP', super: '★', block: 'B',
}
const DIRS = new Set(['forward', 'back', 'up', 'down', 'left', 'right', 'jump'])
const SCROLL_SPEED = 520 // px/s while jump/crouch held

function inputChips(seq) {
  if (!Array.isArray(seq) || !seq.length) return '<i class="mk dir">·</i>'
  return seq
    .map((tok) => `<i class="mk${DIRS.has(tok) ? ' dir' : ''}">${GLYPHS[tok] || String(tok).toUpperCase()}</i>`)
    .join('<i class="mk plus">+</i>')
}

export class MovelistScreen {
  constructor(game) { this.game = game }

  enter(params = {}) {
    this.backdrop = getBackdrop(this.game)

    this.root = el('div', 'wcs-screen wcs-movelist')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="wcs-pagehead">
        <div class="h1">MOVE LIST</div>
        <div class="h2">READ THE WHITEPAPER. IT PUNCHES BACK.</div>
      </div>
      <div class="wcs-rail mv-rail"></div>
      <div class="mv-tablewrap wcs-panel"></div>
      <div class="mv-legend">L LIGHT &middot; H HEAVY &middot; K KICK &middot; G GRAB &middot; SP SPECIAL &middot; ★ SUPER &middot; B BLOCK &middot; ARROWS ARE FACING-RELATIVE &middot; S&middot;A&middot;R = STARTUP&middot;ACTIVE&middot;RECOVERY FRAMES @60</div>
      ${hintHTML(this.game,
        '<b>&larr;&rarr;</b> FIGHTER &nbsp; <b>&uarr;&darr;</b> SCROLL &nbsp; <b>ESC</b> BACK',
        'TAP A FIGHTER TO BROWSE')}
    `
    this.game.ui.appendChild(this.root)
    this.wrap = this.root.querySelector('.mv-tablewrap')

    const start = Math.max(0, RosterOrder.indexOf(params.charId ?? 'wally'))
    this.rail = new PortraitRail(this.game, this.root.querySelector('.mv-rail'), RosterOrder, {
      onChange: (id) => this._show(id),
    })
    if (start > 0) this.rail.setIndex(start)
  }

  exit() {
    this.root?.remove()
    this.root = null
    this.rail = null
    this.wrap = null
  }

  _show(id) {
    const def = charDef(id)
    this.wrap.innerHTML = def
      ? this._tableHTML(def)
      : '<div class="mv-empty">DATA REDACTED BY LEGAL</div>'
    this.wrap.scrollTop = 0
  }

  _tableHTML(def) {
    const rows = (def.moves || []).map((m) => {
      if (m.kind === 'joke') {
        // hidden tech stays hidden — find it the honest way (mash buttons)
        return `<tr class="joke"><td class="mn">???</td><td class="k-joke">???</td><td>???</td><td>???</td><td>???</td></tr>`
      }
      const meterTag = m.meterCost ? ` <small>${m.meterCost}M</small>` : ''
      return `<tr>
        <td class="mn">${m.name || m.id || '—'}</td>
        <td class="k-${m.kind}">${String(m.kind || '—').toUpperCase()}</td>
        <td class="mi">${inputChips(m.input)}</td>
        <td>${m.damage ?? '—'}${meterTag}</td>
        <td>${m.startup ?? '—'}&middot;${m.active ?? '—'}&middot;${m.recovery ?? '—'}</td>
      </tr>`
    })
    if (def.finisher) {
      // v2.1 (§23): executions auto-trigger on the round-ending KO — there is
      // no input chord anymore, so the INPUT column says so instead of lying
      rows.push(`<tr class="finisher">
        <td class="mn">${def.finisher.name || 'FINISHER'}</td>
        <td class="k-finisher">FINISHER</td>
        <td class="mi"><i class="mk dir">AUTO ON K.O.</i></td>
        <td>K.O.</td>
        <td>CINEMA</td>
      </tr>`)
    }
    return `<table>
      <thead><tr><th>MOVE</th><th>KIND</th><th>INPUT</th><th>DMG</th><th>S&middot;A&middot;R</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
  }

  update(dt) {
    ensureMusic(this.game, 'menu')
    this.backdrop.update(dt)

    const input = this.game.input
    if (input.menuPressed('left')) this.rail.move(-1)
    else if (input.menuPressed('right')) this.rail.move(1)

    // held scroll: jump/crouch cover W/S and the arrow keys for both players
    if (input.isDown(0, 'jump') || input.isDown(1, 'jump')) this.wrap.scrollTop -= SCROLL_SPEED * dt
    if (input.isDown(0, 'crouch') || input.isDown(1, 'crouch')) this.wrap.scrollTop += SCROLL_SPEED * dt

    if (input.menuPressed('back')) {
      this.game.audio.sfx('menu_back')
      this.game.screens.goto('menu')
    }
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
