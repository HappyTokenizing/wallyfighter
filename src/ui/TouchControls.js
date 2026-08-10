// v2.1 SIMPLIFIED mobile touch controls (CONTRACTS.md §20 base, reduced per
// the v2.1 UI spec — the old 9-button wall was too much). What ships now:
//
//   LEFT  — drag-anywhere virtual stick (left/right/fwd/back), plus a crouch
//           TAP when the stick is flicked straight down to full deflection
//           (that keeps the hidden joke move — down, down, light — reachable).
//   RIGHT — exactly 5 buttons:
//           ATTACK  (light — chains cover the old kick's role; no kick button)
//           HEAVY
//           SPECIAL (long-press 600ms fires SUPER when meter is full — a gold
//                    ring fills around the button while charging; a plain tap
//                    or a hold without meter is a normal special)
//           GRAB/ITEM (contextual: shows the held item's icon and acts as USE
//                    while holding one, plain GRAB otherwise)
//           BLOCK   (hold-to-block; replaces the old hold-left-half block
//                    zone. A one-time "HOLD TO BLOCK" hint pulses the button
//                    on the player's first match, persisted in the save.)
//           + a small JUMP button, present ONLY while settings.jumpEnabled
//           (§27 — toggled live from Settings), and the little PAUSE chip.
//
// Integration is unchanged from v2.0: the overlay NEVER dispatches
// KeyboardEvents and never patches InputManager. It pushes the key codes
// bound in `input.bindings[0]` into `input.codesDown` (held state) and
// `input._keyPressQueue` (edge queue), which beginFrame() consumes on the
// next fixed tick. Remaps done in Settings are honored automatically because
// codes are resolved from the live bindings at press time (and the pressed
// code is remembered per action so release always deletes what it added).
// Taps (super, special-tap, crouch flick) push the edge and clear the held
// code a few frames later — the edge lives in the queue, so it always lands.
//
// Visibility: shown only while fighting — the 'match' screen (all modes that
// route through it) and the ragdoll 'playground'. The 'training' screen shows
// it once its embedded match starts ('match:start'). Menus stay tap-driven.
// A chunky ROTATE DEVICE overlay covers portrait orientation (.wcs-rotate).
//
// Enabled when `game.isTouch`, or forced for desktop testing via
// localStorage: wcs-touch = '1' forces ON, '0' forces OFF.
import { el, touchUI } from './uiKit.js'
import { drawItemIcon } from './Hud.js'

const STICK_ACTIONS = ['left', 'right', 'fwd', 'back']
const STICK_RADIUS = 52 // px of full deflection
const STICK_DEAD = 0.32 // normalized threshold before a direction registers
const CROUCH_DEEP = 0.85 // straight-down deflection that registers a crouch tap
const SUPER_HOLD_MS = 600 // long-press on SPECIAL -> SUPER (meter full only)
const TAP_RELEASE_MS = 90 // synthetic tap: press edge now, code released after

export class TouchControls {
  // Should the overlay exist at all this session? (shared logic in uiKit —
  // the hint bars key off the same touchUI() check)
  static wanted(game) {
    return touchUI(game)
  }

  constructor(game) {
    this.game = game
    this.input = game.input
    this._heldCodes = new Map() // action -> key code we injected (release-safe across remaps)
    this._btnPointers = new Map() // pointerId -> { action, node, release? }
    this._stickId = null
    this._stickBaseX = 0
    this._stickBaseY = 0
    this._crouchDeep = false // stick currently in the deep-down crouch band
    this._visible = false
    this._meterFull = false // P1 meter mirror ('meter' events) for the super hold
    this._heldItem = null // P1 held item kind ('item:*' events) for GRAB/ITEM
    this._sp = null // live SPECIAL long-press state

    this._buildDom()
    this._applyJumpSetting()

    game.events.on('screen:changed', ({ name }) => this._onScreen(name))
    // training embeds its own MatchScreen without a screen change — show once
    // the actual fight exists (the picker stays uncovered)
    game.events.on('match:start', () => {
      if (this.game.screens.name === 'training') this._show(true)
    })
    // §27: the JUMP button follows settings.jumpEnabled LIVE
    game.events.on('settings:changed', ({ key } = {}) => {
      if (key === 'settings.jumpEnabled') this._applyJumpSetting()
    })
    // fuel for the contextual buttons
    game.events.on('meter', ({ slot, value } = {}) => {
      if (slot === 0) this._meterFull = (value ?? 0) >= 100
    })
    game.events.on('item:pickup', (p) => { if (p?.slot === 0) this._setHeldItem(p.kind) })
    game.events.on('item:used', (p) => { if (p?.slot === 0) this._setHeldItem(null) })
    game.events.on('item:despawn', (p) => { if (p?.slot === 0) this._setHeldItem(null) })
    game.events.on('match:end', () => { this._setHeldItem(null); this._meterFull = false })
    // mirror InputManager's blur behavior: it clears codesDown wholesale, so
    // drop our bookkeeping too or a later release would delete a fresh press
    addEventListener('blur', () => this._releaseAll())
  }

  get visible() { return this._visible }

  // ------------------------------------------------------------------- DOM --

  _buildDom() {
    const root = el('div', 'wcs-touch')
    this.root = root

    // left: drag-anywhere virtual stick
    const zone = el('div', 'wcs-touch-stickzone')
    const base = el('div', 'wcs-touch-stickbase')
    const nub = el('div', 'nub')
    base.appendChild(nub)
    zone.appendChild(base)
    root.appendChild(zone)
    this._base = base
    this._nub = nub

    zone.addEventListener('pointerdown', (e) => {
      if (this._stickId != null) return
      e.preventDefault()
      this._stickId = e.pointerId
      try { zone.setPointerCapture(e.pointerId) } catch { /* stale pointer */ }
      const rect = zone.getBoundingClientRect()
      const half = base.offsetWidth / 2 || 55
      this._stickBaseX = Math.min(Math.max(e.clientX - rect.left, half), rect.width - half)
      this._stickBaseY = Math.min(Math.max(e.clientY - rect.top, half), rect.height - half)
      base.style.left = `${this._stickBaseX - half}px`
      base.style.top = `${this._stickBaseY - half}px`
      base.classList.add('live')
      this._stickMove(e, rect)
    })
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return
      e.preventDefault()
      this._stickMove(e, zone.getBoundingClientRect())
    })
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      zone.addEventListener(ev, (e) => {
        if (e.pointerId !== this._stickId) return
        this._stickEnd()
      })
    }

    // right: the simplified 5-button cluster (+ small jump). BLOCK is a plain
    // hold button — press to guard, release to drop it (the old hold-left-half
    // block zone is gone; this is clearer and frees the left half for the
    // stick).
    const cluster = el('div', 'wcs-touch-cluster')
    cluster.appendChild(this._buildHoldButton({ action: 'light', label: 'ATTACK', cls: 'tb-attack primary big' }))
    cluster.appendChild(this._buildHoldButton({ action: 'heavy', label: 'HEAVY', cls: 'tb-heavy primary' }))
    cluster.appendChild(this._buildSpecialButton())
    cluster.appendChild(this._buildGrabItemButton())
    this._blockBtn = this._buildHoldButton({ action: 'block', label: 'BLOCK', cls: 'tb-block primary' })
    cluster.appendChild(this._blockBtn)
    this._jumpBtn = this._buildHoldButton({ action: 'jump', label: 'JUMP', cls: 'tb-jump small' })
    cluster.appendChild(this._jumpBtn)
    root.appendChild(cluster)

    // pause chip (synthesizes Escape — InputManager emits 'input:pause')
    root.appendChild(this._buildHoldButton({ action: 'pause', label: 'll', cls: 'tb-pause' }))

    this.game.ui.appendChild(root)

    // portrait blocker — pure CSS shows it under (orientation: portrait);
    // it only exists at all when touch controls are enabled
    this.rotate = el('div', 'wcs-rotate',
      '<div class="rot-phone"></div>' +
      '<div class="rot-title">ROTATE DEVICE</div>' +
      '<div class="rot-sub">THIS MARKET ONLY GOES SIDEWAYS</div>')
    this.game.ui.appendChild(this.rotate)
  }

  // Plain held button: press = action down, release = action up.
  _buildHoldButton(def) {
    const node = el('div', `wcs-touch-btn ${def.cls}`, `<span>${def.label}</span>`)
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (this._btnPointers.has(e.pointerId)) return
      try { node.setPointerCapture(e.pointerId) } catch { /* stale pointer */ }
      this._btnPointers.set(e.pointerId, { action: def.action, node })
      node.classList.add('active')
      this._setAction(def.action, true)
    })
    const release = (e) => {
      const held = this._btnPointers.get(e.pointerId)
      if (!held || held.node !== node) return
      this._btnPointers.delete(e.pointerId)
      node.classList.remove('active')
      this._setAction(held.action, false)
    }
    node.addEventListener('pointerup', release)
    node.addEventListener('pointercancel', release)
    node.addEventListener('lostpointercapture', release)
    return node
  }

  // GRAB/ITEM — the action resolves at PRESS time: holding an item makes this
  // the USE button (icon shown), otherwise it grabs. Release always ends the
  // action that was actually pressed (stored per pointer).
  _buildGrabItemButton() {
    const node = el('div', 'wcs-touch-btn tb-grab primary',
      '<span class="gi-label">GRAB</span><canvas class="gi-icon" width="28" height="28"></canvas>')
    this._grabNode = node
    this._grabIcon = node.querySelector('.gi-icon')
    this._grabLabel = node.querySelector('.gi-label')
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (this._btnPointers.has(e.pointerId)) return
      try { node.setPointerCapture(e.pointerId) } catch { /* stale pointer */ }
      const action = this._heldItem != null ? 'item' : 'grab'
      this._btnPointers.set(e.pointerId, { action, node })
      node.classList.add('active')
      this._setAction(action, true)
    })
    const release = (e) => {
      const held = this._btnPointers.get(e.pointerId)
      if (!held || held.node !== node) return
      this._btnPointers.delete(e.pointerId)
      node.classList.remove('active')
      this._setAction(held.action, false)
    }
    node.addEventListener('pointerup', release)
    node.addEventListener('pointercancel', release)
    node.addEventListener('lostpointercapture', release)
    return node
  }

  _setHeldItem(kind) {
    this._heldItem = kind ?? null
    const node = this._grabNode
    if (!node) return
    node.classList.toggle('has-item', this._heldItem != null)
    if (this._heldItem != null) {
      drawItemIcon(this._grabIcon, this._heldItem)
      this._grabLabel.textContent = 'USE'
    } else {
      this._grabLabel.textContent = 'GRAB'
    }
  }

  // SPECIAL — tap or plain hold = special. With FULL METER, keeping it pressed
  // charges a gold ring; at 600ms the SUPER fires. Released early, it falls
  // back to a normal special tap so no input is ever eaten.
  _buildSpecialButton() {
    const node = el('div', 'wcs-touch-btn tb-special primary',
      '<div class="sp-ring"></div><span>SPEC</span>')
    const ring = node.querySelector('.sp-ring')
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (this._sp || this._btnPointers.has(e.pointerId)) return
      try { node.setPointerCapture(e.pointerId) } catch { /* stale pointer */ }
      node.classList.add('active')
      if (!this._meterFull) {
        // no super available: behave exactly like a plain held SPECIAL button
        this._btnPointers.set(e.pointerId, { action: 'special', node })
        this._setAction('special', true)
        return
      }
      // meter full: arm the long-press. The special edge is DEFERRED to the
      // release so a completed hold fires ONLY the super.
      const sp = this._sp = { id: e.pointerId, t0: performance.now(), fired: false, raf: 0 }
      const step = () => {
        if (this._sp !== sp) return
        const k = Math.min(1, (performance.now() - sp.t0) / SUPER_HOLD_MS)
        ring.style.background = `conic-gradient(var(--wcs-gold) ${(k * 360).toFixed(0)}deg, transparent 0)`
        ring.classList.add('charging')
        if (k >= 1) {
          sp.fired = true
          node.classList.add('super-pop')
          this._tapAction('super')
          this._spReset(node, ring)
          return
        }
        sp.raf = requestAnimationFrame(step)
      }
      sp.raf = requestAnimationFrame(step)
    })
    const release = (e) => {
      // plain-special path (no meter at press time)
      const held = this._btnPointers.get(e.pointerId)
      if (held?.node === node) {
        this._btnPointers.delete(e.pointerId)
        node.classList.remove('active')
        this._setAction('special', false)
        return
      }
      // long-press path
      const sp = this._sp
      if (!sp || sp.id !== e.pointerId) return
      if (!sp.fired) this._tapAction('special') // released early -> normal special
      this._spReset(node, ring)
    }
    node.addEventListener('pointerup', release)
    node.addEventListener('pointercancel', release)
    node.addEventListener('lostpointercapture', release)
    return node
  }

  _spReset(node, ring) {
    if (this._sp?.raf) cancelAnimationFrame(this._sp.raf)
    this._sp = null
    ring.classList.remove('charging')
    ring.style.background = ''
    node.classList.remove('active')
    setTimeout(() => node.classList.remove('super-pop'), 260)
  }

  // §27: jump hidden entirely (not just disabled) when jumping is off
  _applyJumpSetting() {
    const on = this.game.save?.get?.('settings.jumpEnabled', true) !== false
    if (this._jumpBtn) this._jumpBtn.style.display = on ? '' : 'none'
  }

  // ----------------------------------------------------------------- stick --

  _stickMove(e, rect) {
    const dx = (e.clientX - rect.left - this._stickBaseX) / STICK_RADIUS
    const dy = (e.clientY - rect.top - this._stickBaseY) / STICK_RADIUS
    // nub follows the finger, clamped to the base ring
    const len = Math.hypot(dx, dy) || 1
    const cl = Math.min(len, 1)
    this._nub.style.transform =
      `translate(${((dx / len) * cl * STICK_RADIUS).toFixed(1)}px, ${((dy / len) * cl * STICK_RADIUS).toFixed(1)}px)`
    // 8-way digital output — exactly what held keyboard keys look like
    this._setAction('left', dx < -STICK_DEAD)
    this._setAction('right', dx > STICK_DEAD)
    this._setAction('fwd', dy < -STICK_DEAD) // push up = into the arena
    this._setAction('back', dy > STICK_DEAD)
    // crouch flick: a hard straight-down deflection registers ONE crouch tap
    // per entry into the band (the code auto-releases, so holding the stick
    // down keeps normal retreat movement). Two flicks + ATTACK = joke move.
    const deep = dy > CROUCH_DEEP && dy > Math.abs(dx) * 1.2
    if (deep && !this._crouchDeep) this._tapAction('crouch', 160)
    this._crouchDeep = deep
  }

  _stickEnd() {
    this._stickId = null
    this._crouchDeep = false
    for (const a of STICK_ACTIONS) this._setAction(a, false)
    this._nub.style.transform = ''
    this._base.classList.remove('live')
    this._base.style.left = ''
    this._base.style.top = ''
  }

  // ------------------------------------------------------- synthetic input --

  _setAction(action, down) {
    if (down) {
      if (this._heldCodes.has(action)) return
      const code = action === 'pause' ? 'Escape' : this.input.bindings[0][action]
      if (!code) return
      this._heldCodes.set(action, code)
      if (!this.input.codesDown.has(code)) {
        this.input.codesDown.add(code)
        this.input._keyPressQueue.push(code)
      }
      this.game.events.emit('input:any')
    } else {
      const code = this._heldCodes.get(action)
      if (!code) return
      this._heldCodes.delete(action)
      this.input.codesDown.delete(code)
    }
  }

  // One-shot press: queues the edge immediately, drops the held code shortly
  // after. beginFrame() reads edges from the queue, so the press always
  // registers even if the release lands before the next fixed tick.
  _tapAction(action, holdMs = TAP_RELEASE_MS) {
    const code = this.input.bindings[0][action]
    if (!code) return
    if (!this.input.codesDown.has(code)) {
      this.input.codesDown.add(code)
      this.input._keyPressQueue.push(code)
    }
    setTimeout(() => {
      // only release what still belongs to this tap — a real held press of the
      // same action (via _heldCodes) owns the code and releases it itself
      if (this._heldCodes.get(action) !== code) this.input.codesDown.delete(code)
    }, holdMs)
    this.game.events.emit('input:any')
  }

  _releaseAll() {
    for (const code of this._heldCodes.values()) this.input.codesDown.delete(code)
    this._heldCodes.clear()
    for (const { node } of this._btnPointers.values()) node.classList.remove('active')
    this._btnPointers.clear()
    if (this._sp) { cancelAnimationFrame(this._sp.raf); this._sp = null }
    this.root.querySelector('.sp-ring')?.classList.remove('charging')
    if (this._stickId != null) this._stickEnd()
  }

  // ------------------------------------------------------------ visibility --

  _onScreen(name) {
    // 'training' intentionally not here — it shows on its 'match:start'
    this._show(name === 'match' || name === 'playground')
  }

  _show(on) {
    if (on === this._visible) return
    this._visible = on
    this.root.classList.toggle('show', on)
    if (on) this._maybeBlockHint()
    if (!on) this._releaseAll()
  }

  // One-time BLOCK-button tutorial hint (first match only, persisted). Fresh
  // save key: players who saw the old block-ZONE hint still get shown the new
  // button once.
  _maybeBlockHint() {
    const save = this.game.save
    if (!save || save.get('ui.touchBlockBtnHintSeen', false)) return
    save.set('ui.touchBlockBtnHintSeen', true)
    this._blockBtn?.classList.add('hint')
    setTimeout(() => this._blockBtn?.classList.remove('hint'), 5200)
  }
}
