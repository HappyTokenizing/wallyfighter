// Settings — quality, physics preset, damage style, five live
// volume sliders, and the CONTROLS REMAP panel (P1 only since v1.1 — local 2P
// is gone; the p2 bindings stay in the engine and the save for the training
// dummy / debug, we just never touch them here). Click/enter to rebind, Esc
// cancels, conflict highlighting, RESET DEFAULTS. Rebinds apply INSTANTLY —
// game.input.bindings[0] is the plain merged object InputManager reads every
// frame, so we mutate it in place — and persist via game.save.set('controls.p1')
// for the next boot.
import { el, ensureMusic, formatKey, toast, touchUI, hintHTML } from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'
import { GameConfig } from '../../config/GameConfig.js'

// v3.0: derived from GameConfig.quality so a new tier (e.g. 'ultra') shows up
// here automatically. The explicit list is only an ordering hint — anything in
// GameConfig that is not named here is appended, so the row can never desync
// from the config again.
const QUALITY_ORDER = (() => {
  const preferred = ['low', 'medium', 'high', 'ultra']
  const all = Object.keys(GameConfig.quality || {})
  return [...preferred.filter((k) => all.includes(k)), ...all.filter((k) => !preferred.includes(k))]
})()
const PHYSICS_ORDER = ['standard', 'silly', 'unhinged']
// order puts the default ('cartoon' — matches GameConfig.gore and the §15 gore
// contract) in the middle: NO GORE ◀ CARTOON DAMAGE ▶ MAXIMUM CHAOS
const GORE_ORDER = ['none', 'cartoon', 'max']
const GORE_LABELS = { none: 'NO GORE', cartoon: 'CARTOON DAMAGE', max: 'MAXIMUM CHAOS' }
// v2.1 (§26): GTA-style radio — governs MATCH music only, applies live
const RADIO_ORDER = ['default', 'hiphop', 'edm', 'lofi', 'rockmetal']
const RADIO_LABELS = { default: 'DEFAULT', hiphop: 'HIP HOP', edm: 'EDM', lofi: 'LO-FI', rockmetal: 'ROCK METAL' }
const TOGGLE_ORDER = [true, false]
const VOLUME_CHANNELS = ['master', 'music', 'sfx', 'announcer', 'crowd']

export class SettingsScreen {
  constructor(game) {
    this.game = game
    this.actions = Object.keys(GameConfig.controls.p1) // the 12 bindable actions (incl. 'item')
  }

  enter() {
    this.backdrop = getBackdrop(this.game)
    this.index = 0
    this.tab = 0 // v1.1: P1 only — the remap panel never shows P2
    this.capture = null
    this.rows = []

    this.root = el('div', 'wcs-screen wcs-settings')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="set-header">TOKENOMICS &amp; TUNING</div>
      <div class="set-cols">
        <div class="set-rows wcs-panel"></div>
        <div class="set-controls wcs-panel">
          <h3>CONTROLS — REMAP (P1)</h3>
          <div class="ctl-rows"></div>
          <div class="ctl-status"></div>
          <div class="pad-note">GAMEPADS: PLUG IN &amp; GO — STANDARD MAPPING, START = PAUSE</div>
        </div>
      </div>
      ${hintHTML(this.game,
        '<b>↑↓</b> ROW &nbsp; <b>←→</b> ADJUST / PLAYER &nbsp; <b>ENTER</b> SELECT / REBIND &nbsp; <b>ESC</b> BACK',
        'TAP A ROW TO ADJUST')}
    `
    this.game.ui.appendChild(this.root)

    this._buildLeftRows(this.root.querySelector('.set-rows'))
    this._buildControlRows(this.root.querySelector('.ctl-rows'))
    this._buildBackRow(this.root.querySelector('.set-rows'))
    this._refreshControls()
    this._highlight()
  }

  exit() {
    this._cancelCapture(true)
    this.root?.remove()
    this.root = null
    this.rows = null
    this.ctlRows = null
  }

  // ------------------------------------------------------------------ rows --

  _addRow(container, row) {
    row.node.addEventListener('mouseenter', () => { this.index = this.rows.indexOf(row); this._highlight() })
    container.appendChild(row.node)
    this.rows.push(row)
  }

  _buildLeftRows(container) {
    const game = this.game

    // -- cycle rows
    const makeCycle = (label, order, getVal, setVal, displayFn) => {
      const node = el('div', 'set-row')
      node.innerHTML = `<span class="lbl">${label}</span><span class="arr">◀</span><span class="val"></span><span class="arr">▶</span>`
      const valEl = node.querySelector('.val')
      const arrows = node.querySelectorAll('.arr')
      const row = {
        node,
        refresh: () => { valEl.textContent = displayFn(getVal()) },
        adjust: (dir) => {
          const cur = order.indexOf(getVal())
          const next = order[(cur + dir + order.length) % order.length]
          setVal(next)
          row.refresh()
          game.audio.sfx('menu_move')
        },
        activate: () => row.adjust(1),
      }
      arrows[0].addEventListener('click', (e) => { e.stopPropagation(); row.adjust(-1) })
      arrows[1].addEventListener('click', (e) => { e.stopPropagation(); row.adjust(1) })
      row.refresh()
      this._addRow(container, row)
    }

    makeCycle('GRAPHICS QUALITY', QUALITY_ORDER,
      () => game.qualityName,
      (v) => game.setQuality(v),
      (v) => GameConfig.quality[v]?.name?.toUpperCase() || v)

    // v2.0 (§18): the camera style row is GONE — one tracking third-person rig.

    makeCycle('PHYSICS PRESET', PHYSICS_ORDER,
      () => game.save.get('settings.physicsPreset', 'standard'),
      (v) => game.save.set('settings.physicsPreset', v),
      (v) => GameConfig.physicsPresets[v]?.name?.toUpperCase() || v)

    makeCycle('DAMAGE STYLE', GORE_ORDER,
      () => game.save.get('settings.gore', GameConfig.gore),
      (v) => {
        game.save.set('settings.gore', v)
        // Particles subscribes to this (plus a 1s re-poll fallback) so gore
        // switches apply instantly, even mid-match
        try { game.events?.emit?.('settings:changed', { key: 'settings.gore', value: v }) } catch { /* no bus */ }
      },
      (v) => GORE_LABELS[v] || v)

    // -- v2.1 rows: persisted + broadcast so the owning systems apply them
    //    LIVE (radio mid-match, camera framing, jump gating). Same payload
    //    shape as the gore row: { key: 'settings.<name>', value }.
    const emitSetting = (key, v) => {
      try { game.events?.emit?.('settings:changed', { key, value: v }) } catch { /* no bus */ }
    }

    makeCycle('RADIO STATION', RADIO_ORDER,
      () => game.save.get('settings.radio', 'default'),
      (v) => {
        game.save.set('settings.radio', v)
        emitSetting('settings.radio', v)
      },
      (v) => RADIO_LABELS[v] || v)

    makeCycle('OPPONENT CAMERA LOCK', TOGGLE_ORDER,
      () => game.save.get('settings.cameraLock', true) !== false,
      (v) => {
        game.save.set('settings.cameraLock', v)
        emitSetting('settings.cameraLock', v)
      },
      (v) => (v ? 'ON' : 'OFF'))

    makeCycle('JUMPING', TOGGLE_ORDER,
      () => game.save.get('settings.jumpEnabled', true) !== false,
      (v) => {
        game.save.set('settings.jumpEnabled', v)
        emitSetting('settings.jumpEnabled', v)
      },
      (v) => (v ? 'ON' : 'OFF'))

    // -- volume sliders
    for (const ch of VOLUME_CHANNELS) {
      const node = el('div', 'set-row')
      node.innerHTML = `<span class="lbl">${ch.toUpperCase()} VOLUME</span>`
      const slider = document.createElement('input')
      slider.type = 'range'
      slider.className = 'set-slider'
      slider.min = '0'
      slider.max = '1'
      slider.step = '0.05'
      slider.value = String(game.audio.getVolume(ch))
      node.appendChild(slider)
      // track fill stops at the knob (ui.css --fill) so 0% never reads as 100%
      const paint = () => slider.style.setProperty('--fill', (parseFloat(slider.value) * 100).toFixed(0) + '%')
      paint()
      const apply = (v) => {
        game.audio.setVolume(ch, v)
        if (ch === 'sfx' || ch === 'master') game.audio.sfx('menu_move') // audible feedback
      }
      slider.addEventListener('input', () => { paint(); apply(parseFloat(slider.value)) })
      const row = {
        node,
        refresh: () => { slider.value = String(game.audio.getVolume(ch)); paint() },
        adjust: (dir) => {
          const v = Math.max(0, Math.min(1, game.audio.getVolume(ch) + dir * 0.05))
          slider.value = String(v)
          paint()
          apply(v)
        },
        activate: () => {},
      }
      this._addRow(container, row)
    }
  }

  _buildControlRows(container) {
    this.ctlRows = []
    // (v1.1: the P1/P2 tab row is gone — local 2P was removed, so the panel
    // rebinds P1 only. controls.p2 save data is left exactly as it was.)

    // -- one row per action: confirm/click arms capture of the next keydown
    for (const action of this.actions) {
      const node = el('div', 'set-row ctl-row')
      node.innerHTML = `<span class="lbl">${action.toUpperCase()}</span><span class="key"></span>`
      const row = {
        node,
        action,
        keyEl: node.querySelector('.key'),
        refresh: () => {},
        adjust: () => {},
        activate: () => this._startCapture(row),
      }
      node.addEventListener('click', () => { this.index = this.rows.indexOf(row); this._highlight(); row.activate() })
      this._addRow(container, row)
      this.ctlRows.push(row)
    }

    // -- P1 reset
    const resetNode = el('div', 'set-row ctl-reset')
    resetNode.innerHTML = `<span class="lbl">RESET DEFAULTS</span><span class="val">FOR P1</span>`
    this.resetRow = {
      node: resetNode,
      valEl: resetNode.querySelector('.val'),
      refresh: () => {},
      adjust: () => {},
      activate: () => this._resetDefaults(),
    }
    resetNode.addEventListener('click', () => this.resetRow.activate())
    this._addRow(container, this.resetRow)
  }

  _buildBackRow(container) {
    const game = this.game

    // v2.1 (§22): the intro cinematic replays from here now, not the main menu
    const introNode = el('div', 'set-row')
    introNode.innerHTML = `<span class="lbl">REPLAY INTRO</span><span class="val">▶ WATCH</span>`
    const introRow = {
      node: introNode,
      refresh: () => {},
      adjust: () => {},
      activate: () => { game.audio.sfx('menu_confirm'); game.screens.goto('intro') },
    }
    introNode.addEventListener('click', () => introRow.activate())
    this._addRow(container, introRow)

    const backNode = el('div', 'set-row')
    backNode.innerHTML = `<span class="lbl">BACK TO MENU</span><span class="val">◀ RETURN</span>`
    const backRow = {
      node: backNode,
      refresh: () => {},
      adjust: () => {},
      activate: () => { game.audio.sfx('menu_back'); game.screens.goto('menu') },
    }
    backNode.addEventListener('click', () => backRow.activate())
    this._addRow(container, backRow)
  }

  // ----------------------------------------------------------------- remap --

  _refreshControls() {
    const p = this.tab // always 0 — P1 only since v1.1
    const bind = this.game.input.bindings[p]
    const counts = {}
    for (const a of this.actions) {
      const code = bind[a]
      counts[code] = (counts[code] || 0) + 1
    }
    this.hasConflict = false
    for (const row of this.ctlRows) {
      const code = bind[row.action]
      row.keyEl.textContent = formatKey(code)
      const dup = code != null && counts[code] > 1
      row.node.classList.toggle('conflict', dup)
      if (dup) this.hasConflict = true
    }
    this._updateStatus()
  }

  _updateStatus() {
    const status = this.root?.querySelector('.ctl-status')
    if (!status) return
    status.classList.remove('warn', 'live')
    if (this.capture) {
      status.classList.add('live')
      status.textContent = `PRESS A KEY FOR P${this.capture.p + 1} ${this.capture.action.toUpperCase()} — ESC CANCELS`
    } else if (this.hasConflict) {
      status.classList.add('warn')
      status.textContent = '! DUPLICATE KEYS HIGHLIGHTED — ONE KEY, TWO JOBS'
    } else {
      status.textContent = touchUI(this.game)
        ? 'KEY REBINDS NEED A PHYSICAL KEYBOARD'
        : 'CLICK OR PRESS ENTER ON A ROW TO REBIND'
    }
  }

  _startCapture(row) {
    this._cancelCapture()
    this.capture = { row, p: this.tab, action: row.action }
    row.node.classList.add('listening')
    row.keyEl.textContent = 'PRESS KEY'
    this.game.audio.sfx('menu_confirm')
    // capture-phase window listener: runs BEFORE InputManager's bubble-phase
    // handler, and stopPropagation keeps the pressed key from leaking into
    // menu navigation / the input buffers while we are rebinding
    this._capHandler = (e) => this._onCaptureKey(e)
    window.addEventListener('keydown', this._capHandler, true)
    this._updateStatus()
  }

  _onCaptureKey(e) {
    e.preventDefault()
    e.stopPropagation()
    const cap = this.capture
    if (!cap) return
    if (e.code === 'Escape') {
      this.game.audio.sfx('menu_back')
      this._cancelCapture()
      return
    }
    // instant, in-memory: InputManager re-reads this object every fixed frame
    this.game.input.bindings[cap.p][cap.action] = e.code
    // persistent: merged over GameConfig defaults at next construction
    this.game.save.set('controls.' + (cap.p === 0 ? 'p1' : 'p2'), { ...this.game.input.bindings[cap.p] })
    this.game.audio.sfx('menu_confirm')
    this._cancelCapture()
  }

  _cancelCapture(silent = false) {
    if (this._capHandler) {
      window.removeEventListener('keydown', this._capHandler, true)
      this._capHandler = null
    }
    if (this.capture) {
      this.capture.row.node.classList.remove('listening')
      this.capture = null
    }
    if (!silent && this.root) this._refreshControls()
  }

  _resetDefaults() {
    const p = this.tab
    const pKey = p === 0 ? 'p1' : 'p2'
    this._cancelCapture()
    Object.assign(this.game.input.bindings[p], GameConfig.controls[pKey])
    this.game.save.set('controls.' + pKey, {})
    this.game.audio.sfx('menu_back')
    toast(this.game, `P${p + 1} CONTROLS RESET`)
    this._refreshControls()
  }

  // ------------------------------------------------------------------ loop --

  _highlight() {
    this.rows.forEach((row, i) => row.node.classList.toggle('sel', i === this.index))
    // v1.1.1 (P1): keep the selected row visible — at short viewports the
    // panel scrolls, and without this the top rows (e.g. Graphics Quality)
    // could be selected while clipped above the panel's visible area.
    try { this.rows[this.index]?.node.scrollIntoView({ block: 'nearest' }) } catch { /* older engines */ }
  }

  update(dt) {
    ensureMusic(this.game, 'menu')
    this.backdrop.update(dt)
    if (this.capture) return // the capture listener owns the keyboard right now

    const input = this.game.input
    if (input.menuPressed('up')) {
      this.index = (this.index - 1 + this.rows.length) % this.rows.length
      this.game.audio.sfx('menu_move')
      this._highlight()
    } else if (input.menuPressed('down')) {
      this.index = (this.index + 1) % this.rows.length
      this.game.audio.sfx('menu_move')
      this._highlight()
    }
    const row = this.rows[this.index]
    if (input.menuPressed('left')) row.adjust(-1)
    else if (input.menuPressed('right')) row.adjust(1)
    if (input.menuPressed('confirm')) { row.activate(); return }
    if (input.menuPressed('back')) {
      this.game.audio.sfx('menu_back')
      this.game.screens.goto('menu')
    }
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
