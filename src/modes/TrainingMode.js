// TrainingMode — the paper-trading room. A small inline fighter picker, then an
// instrumented MatchScreen (mode 'training') against an inert dummy: infinite
// health, auto-full meter, hitbox/hurtbox wireframes, input history, frame-data
// readout, a move-list side panel and one-key resets. Wraps the combat module's
// MatchScreen rather than reimplementing the fight — all instrumentation goes
// through public Fighter/MatchScreen/RagdollManager surfaces.
import * as THREE from 'three'
import { MatchScreen } from '../combat/MatchScreen.js'
import { RosterOrder } from '../characters/index.js'
import { el, ensureMusic, resetMusicTracker, drawPortrait, charName, charTitle, hintHTML } from '../ui/uiKit.js'
import { getBackdrop } from '../ui/MenuBackdrop.js'

// The dummy: a ControlSource that wants absolutely nothing. AIControl clamps
// aiLevel to >=1 (it can't stand still), so the dummy is control 'p2' swapped
// for this inert source right after the match spawns it.
class InertControl {
  axis() { return 0 }
  isDown() { return false }
  pressed() { return false }
  buffer() { return [] }
  frameNum() { return 0 }
  wantsDash() { return 0 }
  updateAI() {}
}

const DIR_GLYPH = { forward: '→', back: '←', down: '↓', up: '↑', left: '←', right: '→' }
const BTN_GLYPH = { light: 'L', heavy: 'H', kick: 'K', grab: 'G', special: 'SP', super: 'SUP', block: 'BLK', jump: '↑', crouch: '↓' }
const INPUT_GLYPH = { left: '←', right: '→', jump: '↑', crouch: '↓', light: 'L', heavy: 'H', kick: 'K', grab: 'G', special: 'SP', super: 'SUP', block: 'BLK' }
const DIR_ACTIONS = new Set(['left', 'right', 'jump', 'crouch'])

// Auto-refill: instantly below this HP (so no single hit ever KOs), otherwise
// after a short breather so damage numbers stay readable mid-combo.
const REFILL_FLOOR = 60
const REFILL_DELAY = 45 // frames without taking a hit

function moveInputGlyph(move) {
  const seq = move.input || []
  return seq.map((s, i) => (i < seq.length - 1 ? DIR_GLYPH[s] || s : BTN_GLYPH[s] || s)).join('+') || '—'
}

const STYLE = `
  .tp-pick .tp-head { position:absolute; top:7%; left:0; right:0; text-align:center;
    font-size:min(6vw,44px); color:var(--wcs-gold,#ffd94a); letter-spacing:3px;
    text-shadow:3px 3px 0 #06040f, 0 0 22px rgba(255,217,74,.35); }
  .tp-pick .tp-sub { position:absolute; top:calc(7% + min(7vw,54px)); left:0; right:0;
    text-align:center; font-size:14px; letter-spacing:2px; color:#8f97c4; z-index:3; }
  .tp-pick .tp-rows { position:absolute; left:50%; transform:translate(-50%,-50%);
    /* centered, but the block's top edge always clears the header + subtitle */
    top:max(50%, calc(7% + min(7vw,54px) + 24px + 122px));
    display:flex; flex-direction:column; gap:14px; align-items:stretch; min-width:min(520px,90vw); }
  @media (max-height:700px) {
    .tp-pick .tp-rows { gap:8px; }
    .tp-pickrow { padding:5px 12px; }
    .tp-pickrow canvas { width:44px; height:44px; }
    .tp-pickrow .who b { font-size:16px; }
  }
  .tp-pickrow { display:flex; align-items:center; gap:14px; padding:8px 14px;
    background:rgba(10,8,26,.72); border:2px solid #2a2f55; }
  .tp-pickrow.sel { border-color:var(--wcs-gold,#ffd94a); background:rgba(28,20,52,.85);
    box-shadow:0 0 18px rgba(255,217,74,.22); }
  .tp-pickrow .tag { width:86px; font-size:13px; letter-spacing:2px; color:#8f97c4; }
  .tp-pickrow.sel .tag { color:var(--wcs-gold,#ffd94a); }
  .tp-pickrow canvas { width:52px; height:52px; image-rendering:pixelated; }
  .tp-pickrow .who { flex:1; }
  .tp-pickrow .who b { display:block; font-size:19px; letter-spacing:1px; color:#fff; }
  .tp-pickrow .who i { display:block; font-style:normal; font-size:11px; letter-spacing:1px; color:#8f97c4; }
  .tp-pickrow .arr { cursor:pointer; font-size:22px; color:#5a628f; user-select:none; padding:0 4px; }
  .tp-pickrow .arr:hover, .tp-pickrow.sel .arr { color:var(--wcs-gold,#ffd94a); }
  .tp-overlay { position:absolute; inset:0; pointer-events:none; z-index:5; }
  .tp-panel { position:absolute; pointer-events:auto; background:rgba(8,6,20,.78);
    border:2px solid #2a2f55; padding:8px 10px; font-size:11px; color:#c7cdf1;
    letter-spacing:1px; }
  .tp-panel h3 { margin:0 0 6px; font-size:12px; letter-spacing:2px;
    color:var(--wcs-gold,#ffd94a); border-bottom:1px solid #2a2f55; padding-bottom:4px; }
  .tp-moves { left:10px; top:120px; width:238px; max-height:52vh; overflow-y:auto; }
  .tp-moves .mv { display:flex; gap:6px; align-items:baseline; padding:2px 0;
    border-bottom:1px dashed rgba(42,47,85,.6); }
  .tp-moves .mv .n { flex:1; color:#fff; }
  .tp-moves .mv .in { color:var(--wcs-gold,#ffd94a); white-space:nowrap; }
  .tp-moves .mv .d { color:#ff8a94; width:26px; text-align:right; }
  .tp-moves .mv .kind { display:block; font-size:9px; color:#5a628f; }
  .tp-tools { right:10px; top:120px; width:212px; }
  .tp-tools .row { display:flex; gap:6px; padding:3px 2px; cursor:pointer; }
  .tp-tools .row:hover { background:rgba(255,217,74,.1); }
  .tp-tools .row .k { color:#5a628f; width:36px; }
  .tp-tools .row .l { flex:1; }
  .tp-tools .row b { color:#37e07a; }
  .tp-tools .row b.off { color:#ff4d5e; }
  .tp-fdata { right:10px; top:calc(120px + 218px); width:212px; }
  .tp-fdata table { width:100%; border-collapse:collapse; }
  .tp-fdata td { padding:1px 2px; }
  .tp-fdata td:first-child { color:#5a628f; }
  .tp-fdata td:last-child { text-align:right; color:#fff; }
  .tp-fdata .mvname { color:var(--wcs-gold,#ffd94a); font-size:12px; }
  .tp-inputs { position:absolute; left:50%; bottom:118px; transform:translateX(-50%);
    display:flex; gap:3px; pointer-events:none; }
  .tp-inputs i { display:block; min-width:18px; padding:2px 4px; text-align:center;
    font-style:normal; font-size:11px; color:#fff; background:rgba(8,6,20,.8);
    border:1px solid #2a2f55; }
  .tp-inputs i.dir { color:#7ecbff; }
  .tp-inputs i.btn { color:var(--wcs-gold,#ffd94a); border-color:#4a4468; }
`

const TOGGLES = [
  { key: 'hp', code: 'F1', label: 'INFINITE HP' },
  { key: 'meter', code: 'F2', label: 'FULL METER (P1)' },
  { key: 'boxes', code: 'F4', label: 'SHOW HIT/HURTBOXES' },
  { key: 'inputs', code: 'F5', label: 'INPUT HISTORY' },
  { key: 'fdata', code: 'F6', label: 'FRAME DATA' },
  { key: 'moves', code: 'F7', label: 'MOVE LIST' },
]

export class TrainingScreen {
  constructor(game) { if (game) this.game = game }

  // ------------------------------------------------------------------ screen

  enter() {
    this.phase = 'pick'
    this.match = null
    this.helpers = null
    this.pickRoot = null
    this.hudRoot = null
    this._onKey = null
    this.backdrop = getBackdrop(this.game)
    this.row = 0
    this.sel = [0, Math.min(1, RosterOrder.length - 1)] // you = wally, dummy = dogey
    this._buildPicker()
  }

  exit() {
    if (this._onKey) { removeEventListener('keydown', this._onKey); this._onKey = null }
    this.pickRoot?.remove()
    this.pickRoot = null
    this.hudRoot?.remove()
    this.hudRoot = null
    this._disposeHelpers()
    try { this.match?.exit() } catch (e) { console.warn('[training] match exit threw', e) }
    this.match = null
    this.backdrop = null // shared singleton — never disposed here
    this.phase = 'idle'
  }

  update(dt) {
    if (this.phase === 'pick') { this._updatePicker(dt); return }
    if (this.phase !== 'match' || !this.match) return
    this.match.update(dt)
    this._instrument()
  }

  render(renderer, dt) {
    if (this.phase === 'pick') this.backdrop?.render(renderer, dt)
    else this.match?.render(renderer, dt)
  }

  // ------------------------------------------------------------------ picker

  _buildPicker() {
    this.pickRoot = el('div', 'wcs-screen tp-pick')
    this.pickRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wcs-dim"></div>
      <div class="tp-head">TRAINING ROOM</div>
      <div class="tp-sub">PAPER TRADING — UNLIMITED BAGS, ZERO CONSEQUENCES</div>
      <div class="tp-rows">
        <div class="tp-pickrow" data-row="0"><span class="tag">YOU</span>
          <span class="arr" data-d="-1">◀</span><canvas></canvas>
          <div class="who"><b></b><i></i></div><span class="arr" data-d="1">▶</span></div>
        <div class="tp-pickrow" data-row="1"><span class="tag">DUMMY</span>
          <span class="arr" data-d="-1">◀</span><canvas></canvas>
          <div class="who"><b></b><i></i></div><span class="arr" data-d="1">▶</span></div>
        <div class="wcs-btn tp-start">ENTER THE SIM</div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> ROW &nbsp; <b>←→</b> FIGHTER &nbsp; <b>ENTER</b> NEXT/START &nbsp; <b>ESC</b> BACK', 'TAP THE ARROWS ▸ ENTER THE SIM')}
    `
    this.game.ui.appendChild(this.pickRoot)
    this.pickRows = [...this.pickRoot.querySelectorAll('.tp-pickrow')]
    this.startBtn = this.pickRoot.querySelector('.tp-start')
    this.pickRows.forEach((node, i) => {
      node.addEventListener('mouseenter', () => { this.row = i; this._refreshPicker() })
      node.querySelectorAll('.arr').forEach((arr) => {
        arr.addEventListener('click', (e) => {
          e.stopPropagation()
          this.row = i
          this._cycle(parseInt(arr.dataset.d, 10))
        })
      })
    })
    this.startBtn.addEventListener('mouseenter', () => { this.row = 2; this._refreshPicker() })
    this.startBtn.addEventListener('click', () => this._startMatch())
    this._refreshPicker()
  }

  _cycle(dir) {
    const n = RosterOrder.length
    this.sel[this.row] = ((this.sel[this.row] + dir) % n + n) % n
    this.game.audio.sfx('menu_move')
    this._refreshPicker()
  }

  _refreshPicker() {
    this.pickRows.forEach((node, i) => {
      node.classList.toggle('sel', this.row === i)
      const id = RosterOrder[this.sel[i]]
      drawPortrait(node.querySelector('canvas'), id)
      node.querySelector('.who b').textContent = charName(id)
      node.querySelector('.who i').textContent = charTitle(id)
    })
    this.startBtn.classList.toggle('sel', this.row === 2)
  }

  _updatePicker(dt) {
    ensureMusic(this.game, 'select')
    this.backdrop.update(dt)
    const input = this.game.input
    if (input.menuPressed('up')) { this.row = (this.row + 2) % 3; this.game.audio.sfx('menu_move'); this._refreshPicker() }
    else if (input.menuPressed('down')) { this.row = (this.row + 1) % 3; this.game.audio.sfx('menu_move'); this._refreshPicker() }
    if (this.row < 2) {
      if (input.menuPressed('left')) this._cycle(-1)
      else if (input.menuPressed('right')) this._cycle(1)
    }
    if (input.menuPressed('confirm')) {
      if (this.row === 2) this._startMatch()
      else { this.row++; this.game.audio.sfx('menu_confirm'); this._refreshPicker() }
      return
    }
    if (input.menuPressed('back')) {
      this.game.audio.sfx('menu_back')
      this.game.screens.goto('menu')
    }
  }

  // ------------------------------------------------------------------- match

  _startMatch() {
    const youId = RosterOrder[this.sel[0]]
    const dummyId = RosterOrder[this.sel[1]]
    this.game.audio.sfx('menu_confirm')
    this.pickRoot?.remove()
    this.pickRoot = null
    resetMusicTracker() // combat owns the speakers now; menus re-trigger on return

    const match = new MatchScreen()
    match.game = this.game
    this.match = match
    this.phase = 'match'
    match.enter({
      mode: 'training',
      p1: { charId: youId, control: 'p1' },
      p2: { charId: dummyId, control: 'p2' },
      arenaId: 'meme-market',
      rules: { roundsToWin: 2, roundTime: 999 }, // effectively endless sparring
      onEnd: () => this.game.screens.goto('menu'), // unreachable with hp-lock, but safe
    })
    // The dummy holds its position: swap the p2 human control for silence.
    if (match.fighters?.[1]) match.fighters[1].ctrl = new InertControl()

    this.opt = { hp: true, meter: true, boxes: false, inputs: true, fdata: true, moves: true }
    this._prevHp = match.fighters.map((f) => f.hp)
    this._lastHitFrame = [-9999, -9999]
    this._lastMove = null
    this._lastBufKey = ''
    this._buildOverlay(youId)
    this._buildHelpers()
    this._onKey = (e) => this._key(e)
    addEventListener('keydown', this._onKey)
  }

  _key(e) {
    if (this.phase !== 'match' || !this.match) return
    const t = TOGGLES.find((tg) => tg.code === e.code)
    if (t) {
      e.preventDefault()
      this._toggle(t.key)
      return
    }
    if (e.code === 'KeyR') this._reset()
  }

  _toggle(key) {
    this.opt[key] = !this.opt[key]
    this.game.audio.sfx('menu_move')
    this._syncToggleUI()
  }

  _reset() {
    const m = this.match
    if (!m || m.phase !== 'fight') return
    try { m._flushFx() } catch { /* pending buff reverts flushed best-effort */ }
    m.timeScale = 1
    m.slowmoFrames = 0
    m.hitStopFrames = 0
    m.timeLeft = m.rules.roundTime * 60
    const spawns = m.arena?.spawnPoints || [-3, 3]
    m.fighters.forEach((f, i) => {
      try { m.ragdolls.recover(f, 1) } catch { /* stub-safe */ }
      f.reset(spawns[i], i === 0 ? 1 : -1)
    })
    try { m.props.dispose() } catch { /* clean slate */ }
    this._lastMove = null
    this._fillFrameData(null)
    this.game.audio.sfx('menu_confirm')
    m.cap('RESET!')
  }

  // ------------------------------------------------------------ overlay DOM

  _buildOverlay(youId) {
    const def = this.match.fighters[0].def
    const moveRows = (def.moves || []).map((mv) => `
      <div class="mv"><span class="n">${mv.name || mv.id}<span class="kind">${(mv.kind || '').toUpperCase()}${mv.meterCost ? ` · ${mv.meterCost} METER` : ''}</span></span>
        <span class="in">${moveInputGlyph(mv)}</span><span class="d">${mv.damage ?? '—'}</span></div>`).join('')
    const toggleRows = TOGGLES.map((t) => `
      <div class="row" data-k="${t.key}"><span class="k">[${t.code}]</span><span class="l">${t.label}</span><b class="v">ON</b></div>`).join('')

    this.hudRoot = el('div', 'tp-overlay')
    this.hudRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="tp-panel tp-moves"><h3>MOVE LIST — ${charName(youId)}</h3>${moveRows || '<div class="mv"><span class="n">NO MOVES FILED</span></div>'}</div>
      <div class="tp-panel tp-tools"><h3>TRAINING TOOLS</h3>${toggleRows}
        <div class="row" data-k="reset"><span class="k">[R]</span><span class="l">RESET POSITIONS</span><b class="v">GO</b></div>
      </div>
      <div class="tp-panel tp-fdata"><h3>LAST MOVE</h3>
        <div class="mvname">—</div>
        <table>
          <tr><td>KIND</td><td class="fd-kind">—</td></tr>
          <tr><td>DAMAGE</td><td class="fd-dmg">—</td></tr>
          <tr><td>STARTUP</td><td class="fd-su">—</td></tr>
          <tr><td>ACTIVE</td><td class="fd-ac">—</td></tr>
          <tr><td>RECOVERY</td><td class="fd-rc">—</td></tr>
          <tr><td>TOTAL</td><td class="fd-tt">—</td></tr>
        </table>
      </div>
      <div class="tp-inputs"></div>
    `
    this.game.ui.appendChild(this.hudRoot)
    this.movesEl = this.hudRoot.querySelector('.tp-moves')
    this.fdataEl = this.hudRoot.querySelector('.tp-fdata')
    this.inputsEl = this.hudRoot.querySelector('.tp-inputs')
    this.hudRoot.querySelectorAll('.tp-tools .row').forEach((node) => {
      node.addEventListener('click', () => {
        const k = node.dataset.k
        if (k === 'reset') this._reset()
        else this._toggle(k)
      })
    })
    this._syncToggleUI()
  }

  _syncToggleUI() {
    if (!this.hudRoot) return
    this.hudRoot.querySelectorAll('.tp-tools .row').forEach((node) => {
      const k = node.dataset.k
      if (k === 'reset') return
      const on = !!this.opt[k]
      const v = node.querySelector('.v')
      v.textContent = on ? 'ON' : 'OFF'
      v.classList.toggle('off', !on)
    })
    this.movesEl.style.display = this.opt.moves ? '' : 'none'
    this.fdataEl.style.display = this.opt.fdata ? '' : 'none'
    this.inputsEl.style.display = this.opt.inputs ? '' : 'none'
    if (this.helpers && !this.opt.boxes) for (const seg of this.helpers.all) seg.visible = false
  }

  // ------------------------------------------------------- instrumentation

  _instrument() {
    const m = this.match
    if (!m.active || !m.fighters?.length) return

    // infinite health: instant refill near the floor, delayed refill otherwise
    if (this.opt.hp) {
      m.fighters.forEach((f, i) => {
        if (f.hp < this._prevHp[i]) this._lastHitFrame[i] = m.worldFrame
        if (f.hp < f.maxHp && m.phase === 'fight' &&
          (f.hp < REFILL_FLOOR || m.worldFrame - this._lastHitFrame[i] > REFILL_DELAY)) {
          f.setHp(f.maxHp)
        }
        this._prevHp[i] = f.hp
      })
    } else {
      m.fighters.forEach((f, i) => { this._prevHp[i] = f.hp })
    }

    // meter always full (P1 — the dummy has no ambitions)
    if (this.opt.meter && m.phase === 'fight') {
      const p1 = m.fighters[0]
      if (p1.meter < 100) p1.gainMeter(100)
    }

    if (this.opt.boxes) this._updateHelpers()
    if (this.opt.inputs) this._updateInputStrip()
    if (this.opt.fdata) this._updateFrameData()
  }

  // ---- hitbox / hurtbox wireframes (world-space XY boxes from Fighter data)

  _buildHelpers() {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
    const mk = (color) => {
      const seg = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color, depthTest: false, transparent: true, opacity: 0.95,
      }))
      seg.renderOrder = 999
      seg.visible = false
      this.match.scene.add(seg)
      return seg
    }
    const hurt = [mk(0x35ff7e), mk(0x35ff7e)]
    const hit = [mk(0xff3b4d), mk(0xff3b4d)]
    this.helpers = { edges, hurt, hit, all: [...hurt, ...hit] }
  }

  _fitBox(seg, b) {
    if (!b || !isFinite(b.x0) || !isFinite(b.y0)) { seg.visible = false; return }
    seg.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0)
    seg.scale.set(Math.max(0.01, b.x1 - b.x0), Math.max(0.01, b.y1 - b.y0), 0.7)
    seg.visible = true
  }

  _updateHelpers() {
    const m = this.match
    m.fighters.forEach((f, i) => {
      let hu = null, hb = null
      try {
        if (f.state !== 'ragdoll') hu = f.hurtbox()
        hb = f.activeHitbox()
      } catch { /* render defensively — a bad frame just hides the boxes */ }
      this._fitBox(this.helpers.hurt[i], hu)
      this._fitBox(this.helpers.hit[i], hb)
    })
  }

  _disposeHelpers() {
    if (!this.helpers) return
    for (const seg of this.helpers.all) {
      seg.parent?.remove(seg)
      seg.material?.dispose?.()
    }
    this.helpers.edges?.dispose?.()
    this.helpers = null
  }

  // ---- input history (last ~20 presses of P1, newest on the right)

  _updateInputStrip() {
    const buf = this.game.input.buffer(0)
    const last = buf[buf.length - 1]
    const key = buf.length + '|' + (last ? last.frame + last.action : '')
    if (key === this._lastBufKey) return
    this._lastBufKey = key
    this.inputsEl.innerHTML = buf.slice(-20).map((e) =>
      `<i class="${DIR_ACTIONS.has(e.action) ? 'dir' : 'btn'}">${INPUT_GLYPH[e.action] || e.action}</i>`).join('')
  }

  // ---- frame data of the last move started by P1

  _updateFrameData() {
    const mv = this.match.fighters[0].currentMove
    if (mv && mv !== this._lastMove) {
      this._lastMove = mv
      this._fillFrameData(mv)
    }
  }

  _fillFrameData(mv) {
    if (!this.fdataEl) return
    const q = (sel) => this.fdataEl.querySelector(sel)
    q('.mvname').textContent = mv ? (mv.name || mv.id || '???').toUpperCase() : '—'
    q('.fd-kind').textContent = mv ? (mv.kind || '—').toUpperCase() : '—'
    q('.fd-dmg').textContent = mv ? String(mv.damage ?? '—') : '—'
    q('.fd-su').textContent = mv ? `${mv.startup ?? 0}F` : '—'
    q('.fd-ac').textContent = mv ? `${mv.active ?? 0}F` : '—'
    q('.fd-rc').textContent = mv ? `${mv.recovery ?? 0}F` : '—'
    q('.fd-tt').textContent = mv ? `${(mv.startup || 0) + (mv.active || 0) + (mv.recovery || 0)}F` : '—'
  }
}
