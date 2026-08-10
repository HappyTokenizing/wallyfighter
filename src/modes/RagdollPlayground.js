// RagdollPlayground — the physics toybox. Pick a puppet (plus an optional
// second), drop into a random arena with no opponent AI and no round flow, and
// abuse every public physics/ragdoll API for fun: launches, prop rain, prop
// towers, explosions, a gravity slider, knockback preset cycling and slow-mo.
// Wraps MatchScreen for its scene/physics/ragdoll/prop plumbing, then strips
// the match flow (no timers, no HUD mount, no pause) and drives it directly.
import * as THREE from 'three'
import { MatchScreen } from '../combat/MatchScreen.js'
import { RosterOrder } from '../characters/index.js'
import { Arenas } from '../arenas/index.js'
import { GameConfig } from '../config/GameConfig.js'
import { el, ensureMusic, resetMusicTracker, drawPortrait, charName, charTitle, touchUI, hintHTML } from '../ui/uiKit.js'
import { getBackdrop } from '../ui/MenuBackdrop.js'

class InertControl {
  axis() { return 0 }
  isDown() { return false }
  pressed() { return false }
  buffer() { return [] }
  frameNum() { return 0 }
  wantsDash() { return 0 }
  updateAI() {}
}

const PROP_KINDS = ['coin', 'crate', 'vaultDoor', 'rocket', 'candle', 'chair', 'monitor', 'box']
const PRESET_ORDER = ['standard', 'silly', 'unhinged']
const SLOWMO_SCALE = 0.3

const STYLE = `
  .pg-pick .pg-head { position:absolute; top:7%; left:0; right:0; text-align:center;
    font-size:min(6vw,44px); color:var(--wcs-gold,#ffd94a); letter-spacing:3px;
    text-shadow:3px 3px 0 #06040f, 0 0 22px rgba(255,217,74,.35); }
  .pg-pick .pg-sub { position:absolute; top:calc(7% + min(7vw,54px)); left:0; right:0;
    text-align:center; font-size:14px; letter-spacing:2px; color:#8f97c4; z-index:3; }
  .pg-pick .pg-rows { position:absolute; left:50%; transform:translate(-50%,-50%);
    /* centered, but the block's top edge always clears the header + subtitle */
    top:max(50%, calc(7% + min(7vw,54px) + 24px + 122px));
    display:flex; flex-direction:column; gap:14px; min-width:min(520px,90vw); }
  @media (max-height:700px) {
    .pg-pick .pg-rows { gap:8px; }
    .pg-pickrow { padding:5px 12px; }
    .pg-pickrow canvas { width:44px; height:44px; }
    .pg-pickrow .who b { font-size:16px; }
  }
  .pg-pickrow { display:flex; align-items:center; gap:14px; padding:8px 14px;
    background:rgba(10,8,26,.72); border:2px solid #2a2f55; }
  .pg-pickrow.sel { border-color:var(--wcs-gold,#ffd94a); background:rgba(28,20,52,.85);
    box-shadow:0 0 18px rgba(255,217,74,.22); }
  .pg-pickrow .tag { width:110px; font-size:13px; letter-spacing:2px; color:#8f97c4; }
  .pg-pickrow.sel .tag { color:var(--wcs-gold,#ffd94a); }
  .pg-pickrow canvas { width:52px; height:52px; image-rendering:pixelated; }
  .pg-pickrow .who { flex:1; }
  .pg-pickrow .who b { display:block; font-size:19px; letter-spacing:1px; color:#fff; }
  .pg-pickrow .who i { display:block; font-style:normal; font-size:11px; letter-spacing:1px; color:#8f97c4; }
  .pg-pickrow .arr { cursor:pointer; font-size:22px; color:#5a628f; user-select:none; padding:0 4px; }
  .pg-pickrow .arr:hover, .pg-pickrow.sel .arr { color:var(--wcs-gold,#ffd94a); }
  .pg-legend { position:absolute; right:10px; top:64px; width:250px; z-index:5;
    background:rgba(8,6,20,.8); border:2px solid #2a2f55; padding:8px 10px;
    font-size:11px; color:#c7cdf1; letter-spacing:1px; pointer-events:auto;
    /* never runs under the bottom CLICK/DROP hint bar: clamp + scroll */
    max-height:calc(100vh - 64px - 58px); overflow-y:auto; scrollbar-width:thin;
    box-sizing:border-box; }
  .pg-legend h3 { margin:0 0 6px; font-size:13px; letter-spacing:2px;
    color:var(--wcs-gold,#ffd94a); border-bottom:1px solid #2a2f55; padding-bottom:4px; }
  .pg-legend .row { display:flex; gap:6px; align-items:center; padding:3px 2px; cursor:pointer; }
  .pg-legend .row:hover { background:rgba(255,217,74,.1); }
  .pg-legend .row .k { color:#06040f; background:var(--wcs-gold,#ffd94a); padding:0 4px;
    font-weight:bold; min-width:20px; text-align:center; }
  .pg-legend .row .l { flex:1; }
  .pg-legend .row b { color:#37e07a; font-style:normal; }
  .pg-legend .grav { padding:5px 2px 2px; }
  .pg-legend .grav .gl { display:flex; justify-content:space-between; margin-bottom:2px; }
  .pg-legend .grav .gl b { color:#7ecbff; }
  .pg-legend .set-slider { width:100%; }
  .pg-hint { position:absolute; left:50%; bottom:12px; transform:translateX(-50%);
    z-index:5; background:rgba(8,6,20,.8); border:2px solid #2a2f55; padding:5px 14px;
    font-size:11px; letter-spacing:2px; color:#8f97c4; pointer-events:none; white-space:nowrap; }
  .pg-hint b { color:var(--wcs-gold,#ffd94a); }
`

const ACTIONS = [
  { code: 'KeyQ', key: 'Q', label: 'LAUNCH LEFT', fn: (s) => s._launch([-13 - Math.random() * 4, 9, 0], 2.5) },
  { code: 'KeyW', key: 'W', label: 'LAUNCH UP', fn: (s) => s._launch([(Math.random() - 0.5) * 5, 15 + Math.random() * 4, 0], 3) },
  { code: 'KeyE', key: 'E', label: 'LAUNCH RIGHT', fn: (s) => s._launch([13 + Math.random() * 4, 9, 0], 2.5) },
  { code: 'KeyL', key: 'L', label: 'LAUNCH RANDOM', fn: (s) => s._launchRandom() },
  { code: 'KeyP', key: 'P', label: 'SPAWN PROP', fn: (s) => s._spawnProp(), valId: 'kind' },
  { code: 'KeyO', key: 'O', label: 'CYCLE PROP KIND', fn: (s) => s._cycleKind() },
  { code: 'KeyX', key: 'X', label: 'EXPLOSION AT CURSOR', fn: (s) => s._explode() },
  { code: 'KeyD', key: 'D', label: 'AIRDROP 10 PROPS', fn: (s) => s._rain() },
  { code: 'KeyC', key: 'C', label: 'BUILD PROP TOWER', fn: (s) => s._tower() },
  { code: 'KeyB', key: 'B', label: 'PHYSICS PRESET', fn: (s) => s._cyclePreset(), valId: 'preset' },
  { code: 'KeyT', key: 'T', label: 'SLOW-MO', fn: (s) => s._toggleSlowmo(), valId: 'slowmo' },
  { code: 'KeyR', key: 'R', label: 'RESET SANDBOX', fn: (s) => s._reset() },
]

export class PlaygroundScreen {
  constructor(game) { if (game) this.game = game }

  // ------------------------------------------------------------------ screen

  enter() {
    this.phase = 'pick'
    this.match = null
    this.legend = null
    this.hint = null
    this.pickRoot = null
    this.ring = null
    this._onKey = null
    this._onMove = null
    this._onDown = null
    this._offPause = null
    this.backdrop = getBackdrop(this.game)
    this.row = 0
    this.sel = 0        // puppet index in RosterOrder
    this.sel2 = -1      // second puppet; -1 = none
    this.kindIdx = 1    // start on 'crate' — the crowd-pleaser
    this.slowmo = false
    this._buildPicker()
  }

  exit() {
    if (this._onKey) { removeEventListener('keydown', this._onKey); this._onKey = null }
    if (this._onMove) { removeEventListener('mousemove', this._onMove); this._onMove = null }
    if (this._onDown) { removeEventListener('mousedown', this._onDown); this._onDown = null }
    this._offPause?.()
    this._offPause = null
    this.pickRoot?.remove()
    this.pickRoot = null
    this.legend?.remove()
    this.legend = null
    this.hint?.remove()
    this.hint = null
    if (this.ring) {
      this.ring.parent?.remove(this.ring)
      this.ring.geometry?.dispose?.()
      this.ring.material?.dispose?.()
      this.ring = null
    }
    try { this.match?.exit() } catch (e) { console.warn('[playground] match exit threw', e) }
    this.match = null
    this.backdrop = null // shared singleton — never disposed here
    this.phase = 'idle'
  }

  update(dt) {
    if (this.phase === 'pick') { this._updatePicker(dt); return }
    if (this.phase !== 'sandbox' || !this.match) return
    const m = this.match
    m.update(dt)
    // slow-mo toggle owns timeScale whenever no timed slowmo (e.g. explosion) runs
    if (m.slowmoFrames <= 0) m.timeScale = this.slowmo ? SLOWMO_SCALE : 1
    // hidden second puppet shadows the first so the camera frames one fighter
    if (this.sel2 < 0 && m.fighters?.[1]) {
      const [a, b] = m.fighters
      b.pos.set(a.pos.x, a.pos.y, 0)
      b.vel.set(0, 0, 0)
    }
    if (this.ring) this.ring.position.copy(this._cursor)
  }

  render(renderer, dt) {
    if (this.phase === 'pick') this.backdrop?.render(renderer, dt)
    else this.match?.render(renderer, dt)
  }

  // ------------------------------------------------------------------ picker

  _buildPicker() {
    this.pickRoot = el('div', 'wcs-screen pg-pick')
    this.pickRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wcs-dim"></div>
      <div class="pg-head">RAGDOLL PLAYGROUND</div>
      <div class="pg-sub">STRESS-TEST DEPARTMENT — NO FIGHTERS WERE PAID FOR THIS</div>
      <div class="pg-rows">
        <div class="pg-pickrow" data-row="0"><span class="tag">PUPPET</span>
          <span class="arr" data-d="-1">◀</span><canvas></canvas>
          <div class="who"><b></b><i></i></div><span class="arr" data-d="1">▶</span></div>
        <div class="pg-pickrow" data-row="1"><span class="tag">SECOND PUPPET</span>
          <span class="arr" data-d="-1">◀</span><canvas></canvas>
          <div class="who"><b></b><i></i></div><span class="arr" data-d="1">▶</span></div>
        <div class="wcs-btn pg-start">OPEN THE TOYBOX</div>
      </div>
      ${hintHTML(this.game, '<b>↑↓</b> ROW &nbsp; <b>←→</b> PICK &nbsp; <b>ENTER</b> NEXT/START &nbsp; <b>ESC</b> BACK', 'TAP THE ARROWS ▸ OPEN THE TOYBOX')}
    `
    this.game.ui.appendChild(this.pickRoot)
    this.pickRows = [...this.pickRoot.querySelectorAll('.pg-pickrow')]
    this.startBtn = this.pickRoot.querySelector('.pg-start')
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
    this.startBtn.addEventListener('click', () => this._start())
    this._refreshPicker()
  }

  _cycle(dir) {
    const n = RosterOrder.length
    if (this.row === 0) this.sel = ((this.sel + dir) % n + n) % n
    else if (this.row === 1) {
      // second puppet cycles through NONE (-1) + the whole roster
      this.sel2 = ((this.sel2 + 1 + dir) % (n + 1) + n + 1) % (n + 1) - 1
    }
    this.game.audio.sfx('menu_move')
    this._refreshPicker()
  }

  _refreshPicker() {
    this.pickRows.forEach((node, i) => {
      node.classList.toggle('sel', this.row === i)
      const idx = i === 0 ? this.sel : this.sel2
      const id = idx >= 0 ? RosterOrder[idx] : null
      drawPortrait(node.querySelector('canvas'), id, { locked: !id })
      node.querySelector('.who b').textContent = id ? charName(id) : 'NONE'
      node.querySelector('.who i').textContent = id ? charTitle(id) : 'SOLO ABUSE SESSION'
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
      if (this.row === 2) this._start()
      else { this.row++; this.game.audio.sfx('menu_confirm'); this._refreshPicker() }
      return
    }
    if (input.menuPressed('back')) {
      this.game.audio.sfx('menu_back')
      this.game.screens.goto('menu')
    }
  }

  // ----------------------------------------------------------------- sandbox

  _start() {
    const puppetId = RosterOrder[this.sel]
    const secondId = this.sel2 >= 0 ? RosterOrder[this.sel2] : puppetId
    this.game.audio.sfx('menu_confirm')
    this.pickRoot?.remove()
    this.pickRoot = null
    resetMusicTracker()

    const arenaIds = Object.keys(Arenas)
    const arenaId = arenaIds[(Math.random() * arenaIds.length) | 0] || 'meme-market'

    const m = new MatchScreen()
    m.game = this.game
    this.match = m
    this.phase = 'sandbox'
    m.enter({
      mode: 'training',
      p1: { charId: puppetId, control: 'p1' },
      p2: { charId: secondId, control: 'p2' },
      arenaId,
      rules: { roundsToWin: 2, roundTime: 9999 },
    })
    // Strip the match flow: no round intro, no match:start (so the HUD never
    // mounts), no pause menu — the sandbox owns Escape and the clock.
    m.timers = []
    m.phase = 'fight'
    m._offPause?.()
    m._offPause = null
    for (const f of m.fighters) f.ctrl = new InertControl()
    if (this.sel2 < 0 && m.fighters[1]) {
      const b = m.fighters[1]
      b.root.visible = false
      b.state = 'lose' // not pushable, not auto-facing — a silent stagehand
      b.stateFrames = 0
    }

    // cursor tracking: mouse ray onto the fight plane (z = 0)
    this._raycaster = new THREE.Raycaster()
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    this._ndc = new THREE.Vector2()
    this._cursor = new THREE.Vector3(0, 1.6, 0)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.22, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.75, depthTest: false, side: THREE.DoubleSide })
    )
    this.ring.renderOrder = 998
    this.ring.position.copy(this._cursor)
    m.scene.add(this.ring)

    this._buildLegend()
    this._onKey = (e) => this._key(e)
    this._onMove = (e) => this._mouseMove(e)
    this._onDown = (e) => this._mouseDown(e)
    addEventListener('keydown', this._onKey)
    addEventListener('mousemove', this._onMove)
    addEventListener('mousedown', this._onDown)
    this._offPause = this.game.events.on('input:pause', () => this._quit())
    this.game.audio.announcer('WELCOME TO THE STRESS TEST!')
  }

  _quit() {
    if (this.phase !== 'sandbox') return
    this.game.audio.sfx('menu_back')
    this.game.screens.goto('menu')
  }

  _key(e) {
    if (this.phase !== 'sandbox' || !this.match?.active) return
    const act = ACTIONS.find((a) => a.code === e.code)
    if (act) { e.preventDefault(); act.fn(this) }
  }

  _mouseMove(e) {
    if (this.phase !== 'sandbox' || !this.match?.camera) return
    this._ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this._raycaster.setFromCamera(this._ndc, this.match.camera)
    const hit = this._raycaster.ray.intersectPlane(this._plane, this._cursor)
    if (!hit) return
    const b = this.match.bounds
    this._cursor.x = Math.max(b.minX - 1, Math.min(b.maxX + 1, this._cursor.x))
    this._cursor.y = Math.max(0.15, Math.min(9, this._cursor.y))
    this._cursor.z = 0
  }

  _mouseDown(e) {
    if (this.phase !== 'sandbox' || e.button !== 0) return
    if (this.legend?.contains(e.target) || this.hint?.contains(e.target)) return
    this._spawnProp()
  }

  // ------------------------------------------------------------------- toys

  _puppets() { return (this.match?.fighters || []).filter((f) => f.root.visible) }

  _launch(vec, spin) {
    const list = this._puppets()
    if (!list.length) return
    this._blast(list[(Math.random() * list.length) | 0], vec, spin)
    this.game.audio.sfx('launch')
    this.game.audio.sfx('whoosh', { pitch: 0.8 })
  }

  _launchRandom() {
    const mag = 10 + Math.random() * 8
    const ang = (35 + Math.random() * 50) * (Math.PI / 180)
    const dir = Math.random() < 0.5 ? -1 : 1
    this._launch([Math.cos(ang) * mag * dir, Math.sin(ang) * mag, (Math.random() - 0.5) * 2], 2 + Math.random() * 2)
  }

  /** Launch a puppet — fresh ragdoll via MatchScreen, or re-boost live ragdoll limbs. */
  _blast(f, vec, spin = 2) {
    const m = this.match
    if (f.state === 'ragdoll') {
      // ragdolls.full() ignores an already-full ragdoll, so push the limb
      // bodies directly (they carry physics.watchBody metadata).
      for (const b of m.physics.world.bodies) {
        const meta = b._smack
        if (meta?.kind !== 'ragdoll' || meta.fighter !== f) continue
        m.physics.impulse(b, [vec[0] * b.mass * 0.6, vec[1] * b.mass * 0.6, (vec[2] || 0) * b.mass * 0.6])
        b.angularVelocity.set(
          b.angularVelocity.x + (Math.random() - 0.5) * spin * 3,
          b.angularVelocity.y + (Math.random() - 0.5) * spin * 3,
          b.angularVelocity.z + (Math.random() - 0.5) * spin * 4
        )
      }
    } else {
      m.forceRagdoll(f, vec, spin)
    }
  }

  _spawnProp() {
    const m = this.match
    if (!m?.active) return
    const kind = PROP_KINDS[this.kindIdx]
    const pos = this._cursor
      ? { x: this._cursor.x, y: Math.max(0.5, this._cursor.y), z: 0 }
      : { x: (Math.random() - 0.5) * 10, y: 3 + Math.random() * 3, z: 0 }
    m.props.spawn(kind, pos, { impulse: [(Math.random() - 0.5) * 1.5, 0, 0] })
    this.game.audio.sfx('thud', { pitch: 1.3, vol: 0.4 })
  }

  _cycleKind() {
    this.kindIdx = (this.kindIdx + 1) % PROP_KINDS.length
    this.game.audio.sfx('menu_move')
    this._syncLegend()
  }

  _explode(point) {
    const m = this.match
    if (!m?.active) return
    const p = point || { x: this._cursor.x, y: Math.max(0.5, this._cursor.y), z: 0 }
    const R = 6.5
    const POW = 9
    // radial, mass-scaled impulse to every dynamic body (props, debris, ragdolls)
    for (const b of m.physics.world.bodies) {
      if (!b || b.mass <= 0) continue
      const dx = b.position.x - p.x, dy = b.position.y - p.y, dz = b.position.z - p.z
      const d = Math.hypot(dx, dy, dz)
      if (d > R) continue
      const fall = 1 - d / R
      const n = Math.max(0.3, d)
      const j = POW * fall * b.mass
      m.physics.impulse(b, [(dx / n) * j, (dy / n) * j + j * 0.55, (dz / n) * j * 0.35])
    }
    // standing puppets in the blast radius get the full ragdoll treatment
    for (const f of this._puppets()) {
      if (f.state === 'ragdoll') continue
      const dx = f.pos.x - p.x
      const d = Math.hypot(dx, (f.pos.y + 1) - p.y)
      if (d > R * 0.85) continue
      const dir = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx)
      const fall = 1 - d / R
      m.forceRagdoll(f, [dir * (7 + fall * 9), 8 + fall * 5, (Math.random() - 0.5) * 2], 2 + Math.random() * 2)
    }
    m.particles.burst('sparks', p, { n: 18 })
    m.particles.burst('smoke', p, { n: 12 })
    m.particles.burst('stars', p, { n: 8 })
    this.game.audio.sfx('explosion')
    this.game.events.emit('camera:shake', { mag: 1.1 })
    m.setSlowmo(0.45, 0.3)
  }

  _rain() {
    const m = this.match
    if (!m?.active) return
    const b = m.bounds
    for (let i = 0; i < 10; i++) {
      const kind = PROP_KINDS[(Math.random() * PROP_KINDS.length) | 0]
      const x = b.minX + 1 + Math.random() * (b.maxX - b.minX - 2)
      m.props.spawn(kind, { x, y: 7 + i * 1.15, z: (Math.random() - 0.5) * 1.2 },
        { impulse: [(Math.random() - 0.5) * 2, 0, 0] })
    }
    this.game.audio.sfx('whoosh', { pitch: 0.6 })
    this.game.audio.announcer('AIRDROP INBOUND!')
  }

  _tower() {
    const m = this.match
    if (!m?.active) return
    const half = (m.bounds.maxX ?? 9) * 0.45
    const cx = (Math.random() < 0.5 ? -1 : 1) * half
    for (let row = 0; row < 4; row++) {
      const count = 4 - row
      for (let i = 0; i < count; i++) {
        const kind = row === 3 ? 'monitor' : (Math.random() < 0.7 ? 'crate' : 'box')
        m.props.spawn(kind, { x: cx + (i - (count - 1) / 2) * 0.78, y: 0.4 + row * 0.76, z: 0 })
      }
    }
    m.props.spawn('candle', { x: cx, y: 3.5, z: 0 })
    this.game.audio.sfx('thud', { pitch: 0.8 })
  }

  _cyclePreset() {
    const m = this.match
    if (!m?.active) return
    const cur = PRESET_ORDER.indexOf(m.physics.presetName)
    const name = PRESET_ORDER[(cur + 1) % PRESET_ORDER.length]
    m.physics.setPreset(name)
    m.presetCfg = GameConfig.physicsPresets[name] || m.presetCfg
    this.game.audio.sfx('menu_confirm')
    this._syncLegend()
  }

  _toggleSlowmo() {
    this.slowmo = !this.slowmo
    this.game.audio.sfx('menu_move')
    this._syncLegend()
  }

  _reset() {
    const m = this.match
    if (!m?.active) return
    try { m.props.dispose() } catch { /* clean slate */ }
    m.timeScale = 1
    m.slowmoFrames = 0
    m.hitStopFrames = 0
    m.timeLeft = m.rules.roundTime * 60
    this.slowmo = false
    m.physics.world.gravity.y = GameConfig.gravity
    const spawns = m.arena?.spawnPoints || [-3, 3]
    m.fighters.forEach((f, i) => {
      try { m.ragdolls.recover(f, 1) } catch { /* stub-safe */ }
      f.reset(spawns[i], i === 0 ? 1 : -1)
    })
    if (this.sel2 < 0 && m.fighters[1]) {
      const b = m.fighters[1]
      b.root.visible = false
      b.state = 'lose'
      b.stateFrames = 0
    }
    this.game.audio.sfx('menu_confirm')
    this._syncLegend()
  }

  // ------------------------------------------------------------------ legend

  _buildLegend() {
    const rows = ACTIONS.map((a) => `
      <div class="row" data-code="${a.code}"><span class="k">${a.key}</span>
        <span class="l">${a.label}</span>${a.valId ? `<b data-v="${a.valId}"></b>` : ''}</div>`).join('')
    this.legend = el('div', 'pg-legend')
    this.legend.innerHTML = `
      <style>${STYLE}</style>
      <h3>TOYBOX CONTROLS</h3>
      ${rows}
      <div class="grav">
        <div class="gl"><span>GRAVITY</span><b data-v="grav"></b></div>
        <input type="range" class="set-slider" min="-30" max="-2" step="0.5" value="${GameConfig.gravity}">
      </div>
    `
    this.game.ui.appendChild(this.legend)
    this.legend.querySelectorAll('.row').forEach((node) => {
      node.addEventListener('click', () => {
        const act = ACTIONS.find((a) => a.code === node.dataset.code)
        if (act && this.match?.active) act.fn(this)
      })
    })
    const slider = this.legend.querySelector('.set-slider')
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value)
      if (this.match?.active && isFinite(v)) this.match.physics.world.gravity.y = v
      this._syncLegend()
    })
    this.gravSlider = slider
    this.hint = el('div', 'pg-hint',
      touchUI(this.game)
        ? '<b>TAP</b> DROP PROP'
        : '<b>CLICK</b> DROP PROP AT CURSOR &nbsp; <b>ESC</b> BACK TO MENU')
    this.game.ui.appendChild(this.hint)
    this._syncLegend()
  }

  _syncLegend() {
    if (!this.legend || !this.match) return
    const q = (id) => this.legend.querySelector(`[data-v="${id}"]`)
    const kindEl = q('kind')
    if (kindEl) kindEl.textContent = PROP_KINDS[this.kindIdx].toUpperCase()
    const presetEl = q('preset')
    if (presetEl) presetEl.textContent = (this.match.physics?.presetName || 'standard').toUpperCase()
    const slowEl = q('slowmo')
    if (slowEl) slowEl.textContent = this.slowmo ? 'ON' : 'OFF'
    const gravEl = q('grav')
    if (gravEl) {
      const g = this.match.physics?.world?.gravity?.y ?? GameConfig.gravity
      gravEl.textContent = g.toFixed(1)
      if (this.gravSlider && parseFloat(this.gravSlider.value) !== g) this.gravSlider.value = String(g)
      if (this.gravSlider) {
        // track fill stops at the knob (ui.css --fill) so the value reads at a glance
        const min = parseFloat(this.gravSlider.min), max = parseFloat(this.gravSlider.max)
        const pct = Math.max(0, Math.min(100, ((parseFloat(this.gravSlider.value) - min) / (max - min)) * 100))
        this.gravSlider.style.setProperty('--fill', pct.toFixed(0) + '%')
      }
    }
  }
}
