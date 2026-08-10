// Match HUD — pure event listener over game.events, per CONTRACTS.md §5.
// Mounts on 'match:start', unmounts on 'match:end' (or leaving the match
// screen). Combat never touches DOM; everything here reacts to events.
// v1.1: AI slots are tagged CPU (local 2P is gone), and each meter box carries
// a HELD ITEM slot fed by the §14 item events.
import { el, UIState, drawPortrait, charName, formatKey, touchUI } from './uiKit.js'
import { GameConfig } from '../config/GameConfig.js'

const KO_FLAVOR = ['LIQUIDATED!', 'REKT!', 'RUGGED!', 'MARGIN CALLED!', 'DELISTED!']

// ---------------------------------------------------------------------------
// Tiny procedural item icons (canvas, chunky flat 2002 style). Known prop
// kinds get a bespoke glyph; anything the item module invents falls back to a
// colored chip with the kind's first letter — never blank, never wrong.
// ---------------------------------------------------------------------------

const ITEM_PAINTERS = {
  coin(g) {
    g.fillStyle = '#ffd94a'
    g.beginPath(); g.arc(14, 14, 10, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#7a5a05'
    g.font = 'bold 12px Impact, sans-serif'
    g.fillText('W', 14, 18.5)
  },
  rocket(g) {
    g.fillStyle = '#e6ecf5'
    g.beginPath(); g.moveTo(14, 3); g.quadraticCurveTo(21, 10, 19, 20); g.lineTo(9, 20); g.quadraticCurveTo(7, 10, 14, 3); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#ff6a3b'
    g.beginPath(); g.moveTo(10, 20); g.lineTo(18, 20); g.lineTo(14, 26); g.closePath(); g.fill(); g.stroke()
    g.fillStyle = '#3b9dff'
    g.beginPath(); g.arc(14, 12, 3, 0, Math.PI * 2); g.fill()
  },
  candle(g) {
    g.fillStyle = '#2bff6a'
    g.fillRect(9, 8, 10, 14); g.strokeRect(9, 8, 10, 14)
    g.beginPath(); g.moveTo(14, 3); g.lineTo(14, 8); g.moveTo(14, 22); g.lineTo(14, 26); g.stroke()
  },
  crate(g) {
    g.fillStyle = '#b5793c'
    g.fillRect(5, 7, 18, 16); g.strokeRect(5, 7, 18, 16)
    g.beginPath(); g.moveTo(5, 7); g.lineTo(23, 23); g.moveTo(23, 7); g.lineTo(5, 23); g.stroke()
  },
  monitor(g) {
    g.fillStyle = '#1b1d24'
    g.fillRect(5, 6, 18, 13); g.strokeRect(5, 6, 18, 13)
    g.strokeStyle = '#2bff6a'
    g.lineWidth = 2
    g.beginPath(); g.moveTo(8, 15); g.lineTo(12, 10); g.lineTo(15, 13); g.lineTo(20, 8); g.stroke()
    g.strokeStyle = '#06040f'
    g.lineWidth = 3
    g.fillRect(11, 19, 6, 3); g.fillRect(8, 22, 12, 3)
  },
  chair(g) {
    g.fillStyle = '#8b5cf6'
    g.fillRect(7, 4, 4, 16); g.fillRect(7, 14, 14, 4)
    g.strokeRect(7, 4, 4, 16); g.strokeRect(7, 14, 14, 4)
    g.beginPath(); g.moveTo(9, 20); g.lineTo(9, 25); g.moveTo(19, 18); g.lineTo(19, 25); g.stroke()
  },
}
ITEM_PAINTERS.box = ITEM_PAINTERS.crate
ITEM_PAINTERS.vaultDoor = ITEM_PAINTERS.crate

export function drawItemIcon(canvas, kind) {
  if (!canvas || typeof canvas.getContext !== 'function') return
  const S = 28
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, S, S)
  g.lineWidth = 3
  g.strokeStyle = '#06040f'
  g.textAlign = 'center'
  const key = String(kind || '')
  const painter = ITEM_PAINTERS[key]
  if (painter) { painter(g); return }
  // fallback: hash the kind to a hue, stamp its first letter
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360
  g.fillStyle = `hsl(${h}, 75%, 55%)`
  g.beginPath()
  g.moveTo(5, 9); g.lineTo(14, 3); g.lineTo(23, 9); g.lineTo(23, 20); g.lineTo(14, 25); g.lineTo(5, 20)
  g.closePath(); g.fill(); g.stroke()
  g.fillStyle = '#06040f'
  g.font = 'bold 13px Impact, sans-serif'
  g.fillText((key[0] || '?').toUpperCase(), 14, 19)
}

function itemLabel(kind) {
  return String(kind || '???').replace(/[-_]+/g, ' ').toUpperCase()
}

// Center-text arbiter priorities: the execution stamp beats round/KO cards,
// which beat meme captions, which beat announcer banners. Only ONE of these
// is ever on screen at a time; the corner combo counters are exempt.
// (v2.1 §23: the sticky FINISHER! prompt is gone — executions auto-trigger.)
const CENTER_PRIO = { exec: 4, card: 3, caption: 1, announcer: 0 }
const CENTER_STALE_MS = 1500 // deferred captions/announcers older than this are dropped

export class Hud {
  constructor(game) {
    this.game = game
    this.mounted = false
    this._offs = []
    this._timers = []

    // lifetime listeners (never removed — the Hud lives as long as the game)
    game.events.on('match:start', (payload) => this.mount(payload))
    game.events.on('match:end', () => this.unmount())
    game.events.on('screen:changed', ({ name }) => {
      if (name !== 'match' && this.mounted) this.unmount()
    })
  }

  // ---------------------------------------------------------------- mount --

  mount(payload) {
    if (this.mounted) this.unmount()
    this.mounted = true

    // match params: prefer the event payload, fall back to the VS-screen stash
    const params = payload?.params || payload || {}
    const stash = UIState.lastMatchParams || {}
    this.p1 = params.p1 || stash.p1 || { charId: 'wally' }
    this.p2 = params.p2 || stash.p2 || { charId: 'dogey' }
    // where "quit" leads: story/arcade back to their own hub, everything else
    // (versus/training/playground/exhibition) to the main menu
    this.matchMode = params.mode || stash.mode || 'versus'
    const rules = params.rules || stash.rules || GameConfig.rules
    // v2.1 (§24): the config default is 300 (5:00) — seed the readout from the
    // same chain combat uses so a mode passing partial rules never shows 99.
    this.roundTime = rules.roundTime ?? GameConfig.rules?.roundTime ?? 300
    this.roundsToWin = rules.roundsToWin ?? 2
    this.wins = [0, 0]
    this.paused = false
    this._prevHealth = [null, null]  // per-slot last seen hp (flash only on decrease)
    this._centerActive = null        // center-text arbiter: the one live big block
    this._centerQueue = []           // deferred center-text items
    this._lastExecStamp = 0          // dedupe guard: finisher:start + execution:start
    this._heldItems = [null, null]   // held item kind per slot (HUD mirror of §14 state)
    this._itemHintShown = false      // the '[E] USE' hint fires on P1's FIRST pickup only

    this._buildDom()
    this._bind()
  }

  unmount() {
    if (!this.mounted) return
    this.mounted = false
    for (const off of this._offs) off()
    this._offs = []
    for (const t of this._timers) clearTimeout(t)
    this._timers = []
    this._centerActive = null
    this._centerQueue = []
    this._hidePause()
    this.root?.remove()
    this.root = null
  }

  _later(fn, ms) {
    const t = setTimeout(() => { fn() }, ms)
    this._timers.push(t)
    return t
  }

  _buildDom() {
    this.root = el('div', 'wcs-hud')
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-col p1">
          <div class="hud-topline">
            <canvas class="hud-portrait"></canvas>
            <div class="hud-health"><div class="chase" style="width:100%"></div><div class="fill" style="width:100%"></div></div>
          </div>
          <div class="hud-under">
            <div class="hud-name"></div>
            <div class="hud-pips"></div>
          </div>
        </div>
        <div class="hud-timer">${Hud._fmtTime(this.roundTime)}</div>
        <div class="hud-col p2">
          <div class="hud-topline">
            <canvas class="hud-portrait"></canvas>
            <div class="hud-health"><div class="chase" style="width:100%"></div><div class="fill" style="width:100%"></div></div>
          </div>
          <div class="hud-under">
            <div class="hud-name"></div>
            <div class="hud-pips"></div>
          </div>
        </div>
      </div>
      <div class="hud-announcer"></div>
      <div class="hud-combo p1"></div>
      <div class="hud-combo p2"></div>
      <div class="hud-meters">
        <div class="hud-meterbox p1">
          <div class="hud-itemrow">
            <div class="hud-item empty"><canvas class="icanvas"></canvas><span class="iname">NO ITEM</span></div>
            <div class="hud-itemhint"></div>
          </div>
          <div class="hud-meter"><div class="mfill"></div>${Hud._notchesHtml()}</div>
          <div class="hud-mlabel"><span>SPECIAL</span><span class="sup">SUPER</span></div>
        </div>
        <div class="hud-meterbox p2">
          <div class="hud-itemrow">
            <div class="hud-item empty"><canvas class="icanvas"></canvas><span class="iname">NO ITEM</span></div>
          </div>
          <div class="hud-meter"><div class="mfill"></div>${Hud._notchesHtml()}</div>
          <div class="hud-mlabel"><span>SPECIAL</span><span class="sup">SUPER</span></div>
        </div>
      </div>
    `
    this.game.ui.appendChild(this.root)

    const cols = [this.root.querySelector('.hud-col.p1'), this.root.querySelector('.hud-col.p2')]
    this.healthEls = cols.map((c) => c.querySelector('.hud-health'))
    this.fillEls = cols.map((c) => c.querySelector('.fill'))
    this.chaseEls = cols.map((c) => c.querySelector('.chase'))
    this.pipEls = cols.map((c) => c.querySelector('.hud-pips'))
    this.meterEls = [this.root.querySelector('.hud-meterbox.p1 .hud-meter'), this.root.querySelector('.hud-meterbox.p2 .hud-meter')]
    this.meterFillEls = this.meterEls.map((m) => m.querySelector('.mfill'))
    this.comboEls = [this.root.querySelector('.hud-combo.p1'), this.root.querySelector('.hud-combo.p2')]
    this.timerEl = this.root.querySelector('.hud-timer')
    this.announcerEl = this.root.querySelector('.hud-announcer')

    this.itemEls = [
      this.root.querySelector('.hud-meterbox.p1 .hud-item'),
      this.root.querySelector('.hud-meterbox.p2 .hud-item'),
    ]
    this.itemHintEl = this.root.querySelector('.hud-itemhint')

    const slots = [this.p1, this.p2]
    cols.forEach((c, i) => {
      drawPortrait(c.querySelector('.hud-portrait'), slots[i].charId)
      c.querySelector('.hud-name').textContent = charName(slots[i].charId)
      // v1.1 (§16): AI-driven corners are CPUs, not "PLAYER 2"
      const spec = slots[i]
      const tagText = spec.control === 'ai'
        ? 'CPU' + (spec.aiLevel ? ` LV${spec.aiLevel}` : '')
        : `P${i + 1}`
      const tag = el('span', 'hud-tag' + (spec.control === 'ai' ? ' cpu' : ''), tagText)
      c.querySelector('.hud-name').after(tag)
    })
    this._renderPips()
  }

  // Notches at the real meter breakpoints (25/50/75 — move meterCosts land on
  // quarters, super = 100 which is the bar's far edge / .full gold state).
  // Positions are symmetric, so plain left:% reads correctly on the mirrored
  // p2 bar too. Inline styles override the class's decorative left:50%.
  static _notchesHtml() {
    return [25, 50, 75]
      .map((p) => `<div class="notch" style="left:${p}%"></div>`)
      .join('')
  }

  _renderPips() {
    this.pipEls.forEach((box, slot) => {
      box.innerHTML = ''
      for (let i = 0; i < this.roundsToWin; i++) {
        box.appendChild(el('i', 'pip' + (i < this.wins[slot] ? ' on' : '')))
      }
    })
  }

  // ----------------------------------------------------------------- bind --

  _on(name, fn) { this._offs.push(this.game.events.on(name, fn)) }

  _bind() {
    this._on('health', ({ slot, value, max }) => this._health(slot, value, max))
    this._on('meter', ({ slot, value }) => this._meter(slot, value))
    this._on('combo', ({ slot, hits }) => this._combo(slot, hits))
    this._on('caption', ({ text }) => this._caption(text))
    this._on('announcer', ({ line }) => this._announce(line))
    this._on('fighter:ko', ({ slot }) => this._ko(slot))
    this._on('superflash', () => this._superFlash())
    // v2.1 (§23): no finisher:ready prompt — every round-ending KO auto-plays
    // an execution. Stamp the moment it starts; combat may signal it as either
    // 'finisher:start' (contract §5) or 'execution:start', so listen to both
    // and dedupe.
    this._on('finisher:start', () => this._execStart())
    this._on('execution:start', () => this._execStart())
    this._on('round:start', (p) => this._roundStart(p?.round ?? 1))
    this._on('round:end', (p) => this._roundEnd(p))
    this._on('timer', (p) => this._setTimer(p?.value ?? p))
    this._on('match:paused', (p) => {
      if (p && p.paused === false) this._resume(false)
      else this._showPause()
    })
    this._on('match:resumed', () => this._resume(false))
    // v1.1 item system (§14)
    this._on('item:pickup', (p) => this._itemPickup(p))
    this._on('item:used', (p) => this._itemUsed(p))
    this._on('item:despawn', (p) => this._itemDespawn(p))
  }

  // ---------------------------------------------------------- held items --

  _itemRender(slot) {
    const node = this.itemEls?.[slot]
    if (!node) return
    const kind = this._heldItems[slot]
    node.classList.toggle('empty', kind == null)
    node.querySelector('.iname').textContent = kind == null ? 'NO ITEM' : itemLabel(kind)
    drawItemIcon(node.querySelector('.icanvas'), kind == null ? null : kind)
  }

  _itemPickup(p) {
    const slot = p?.slot
    if (slot !== 0 && slot !== 1) return
    this._heldItems[slot] = p.kind
    this._itemRender(slot)
    const node = this.itemEls[slot]
    node.classList.remove('blink', 'pop')
    void node.offsetWidth
    node.classList.add('blink')
    // first P1 pickup of the match: point at the USE button, once, human only.
    // v2.1 touch: the GRAB button turns contextual (shows the item), so point
    // there instead of at a keyboard key.
    if (slot === 0 && !this._itemHintShown && this.p1?.control !== 'ai' && this.itemHintEl) {
      this._itemHintShown = true
      if (this.game.touchControls?.visible) {
        this.itemHintEl.textContent = 'TAP THE ITEM BUTTON TO USE'
      } else {
        const key = formatKey(this.game.input?.bindings?.[0]?.item || 'KeyE')
        this.itemHintEl.textContent = `[${key}] USE ITEM`
      }
      this.itemHintEl.classList.add('show')
      this._later(() => this.itemHintEl?.classList.remove('show'), 3200)
    }
  }

  _itemUsed(p) {
    const slot = p?.slot
    if (slot !== 0 && slot !== 1) return
    this._heldItems[slot] = null
    const node = this.itemEls?.[slot]
    if (!node) return
    node.classList.remove('blink', 'pop')
    void node.offsetWidth
    node.classList.add('pop')
    // let the pop play on the item art, then fall back to the empty state
    // (unless something new was picked up in the meantime)
    this._later(() => {
      if (this._heldItems[slot] == null) this._itemRender(slot)
      node.classList.remove('pop')
    }, 420)
  }

  // Ground despawns arrive as {kind} and are none of our business; if the item
  // module ever voids a HELD item (round reset etc.) it includes the slot.
  _itemDespawn(p) {
    const slot = p?.slot
    if (slot !== 0 && slot !== 1) return
    if (this._heldItems[slot] == null) return
    this._heldItems[slot] = null
    this._itemRender(slot)
  }

  // --------------------------------------------------------------- pieces --

  _health(slot, value, max = 100) {
    const pct = Math.max(0, Math.min(100, (value / (max || 100)) * 100))
    const fill = this.fillEls[slot]
    if (!fill) return
    const prev = this._prevHealth[slot]
    this._prevHealth[slot] = value
    fill.style.width = pct + '%'
    this.chaseEls[slot].style.width = pct + '%'
    fill.classList.toggle('low', pct <= 40 && pct > 15)
    fill.classList.toggle('crit', pct <= 15)
    const bar = this.healthEls[slot]
    if (prev == null) return // first event of the round is a baseline, not a hit
    if (value < prev) {
      // damage: white hit flash
      bar.classList.remove('hitflash')
      void bar.offsetWidth
      bar.classList.add('hitflash')
    } else if (value > prev) {
      // heal (e.g. Good Boy +5): soft green pulse, never the hit flash
      bar.animate?.(
        [
          { filter: 'brightness(1.5) drop-shadow(0 0 9px rgba(88, 255, 140, 0.85))' },
          { filter: 'brightness(1)' },
        ],
        { duration: 420, easing: 'ease-out' },
      )
    }
  }

  // Fullscreen white/desaturate pulse on super activation. The sim is frozen
  // (MatchScreen.superFlash hit-stops it), so this wall-clock CSS animation is
  // the whole beat; the move-name caption arrives via the normal caption event.
  _superFlash() {
    if (!this.root) return
    const flash = el('div', 'hud-superflash')
    this.root.appendChild(flash)
    this._later(() => flash.remove(), 650)
  }

  _meter(slot, value) {
    const pct = Math.max(0, Math.min(100, value))
    this.meterFillEls[slot].style.width = pct + '%'
    this.meterEls[slot].classList.toggle('full', pct >= 100)
  }

  _combo(slot, hits) {
    if (hits < 2) return
    const node = this.comboEls[slot]
    const mult = Math.max(0.3, Math.pow(0.9, hits - 1))
    node.innerHTML = `${hits} HITS!<small>x${mult.toFixed(2)} DMG</small>`
    node.classList.remove('pop')
    void node.offsetWidth
    node.classList.add('pop')
    clearTimeout(node._hideT)
    node._hideT = this._later(() => node.classList.remove('pop'), 950)
  }

  _caption(text) {
    if (!text) return
    const item = {
      kind: 'caption',
      dur: 1250,
      show: () => {
        item.el = el('div', 'hud-caption', text)
        this.root.appendChild(item.el)
      },
      hide: () => { item.el?.remove(); item.el = null },
    }
    this._centerRequest(item)
  }

  _announce(line) {
    if (!line) return
    const item = {
      kind: 'announcer',
      dur: 1700,
      show: () => {
        this.announcerEl.textContent = String(line).toUpperCase()
        this.announcerEl.classList.remove('show')
        void this.announcerEl.offsetWidth
        this.announcerEl.classList.add('show')
      },
      hide: () => this.announcerEl.classList.remove('show'),
    }
    this._centerRequest(item)
  }

  _card(html, cls = '', ms = 1000) {
    const item = {
      kind: 'card',
      dur: ms + 220, // hold + 'out' animation
      show: () => {
        item.el = el('div', 'hud-card ' + cls, html)
        this.root.appendChild(item.el)
        item.outT = this._later(() => item.el?.classList.add('out'), ms)
      },
      hide: () => {
        clearTimeout(item.outT)
        item.el?.remove()
        item.el = null
      },
    }
    this._centerRequest(item)
  }

  // ------------------------------------------------- center-text arbiter --
  // One queue for the execution stamp, round/KO cards, meme captions and
  // announcer banners; never more than one big center block on screen.
  // Higher priority preempts lower; deferred captions/announcers are dropped
  // once stale, cards always show. (Sticky items — dur == null — would resume
  // after being preempted; nothing uses that since the v2.1 §23 removal of
  // the FINISHER! prompt, but the mechanism is kept for future use.)

  _centerRequest(item) {
    item.prio = CENTER_PRIO[item.kind] ?? 0
    item.at = performance.now()
    const act = this._centerActive
    if (!act) {
      this._centerShow(item)
    } else if (item.prio > act.prio) {
      // preempt: sticky items (dur == null) go back in the queue,
      // timed captions/announcers are simply cut short
      this._centerStop(act)
      if (act.dur == null) this._centerQueue.push(act)
      this._centerShow(item)
    } else {
      this._centerPurgeStale()
      this._centerQueue.push(item)
    }
  }

  _centerShow(item) {
    this._centerActive = item
    item.show()
    if (item.dur != null) item.doneT = this._later(() => this._centerDone(item), item.dur)
  }

  _centerStop(item) {
    clearTimeout(item.doneT)
    item.hide()
    if (this._centerActive === item) this._centerActive = null
  }

  _centerDone(item) {
    this._centerStop(item)
    this._centerNext()
  }

  _centerNext() {
    if (this._centerActive) return
    this._centerPurgeStale()
    if (!this._centerQueue.length) return
    this._centerQueue.sort((a, b) => b.prio - a.prio || a.at - b.at)
    this._centerShow(this._centerQueue.shift())
  }

  _centerPurgeStale() {
    const now = performance.now()
    this._centerQueue = this._centerQueue.filter(
      (q) => q.prio > CENTER_PRIO.caption || now - q.at <= CENTER_STALE_MS,
    )
  }

  _roundStart(round) {
    this._setTimer(this.roundTime) // sane default until combat's 'timer' feed kicks in
    this._prevHealth = [null, null]
    this._card(`ROUND ${round}<small>MARKET OPEN</small>`, '', 900)
    this._later(() => this._card('FIGHT!', 'fight', 620), 1000)
  }

  _roundEnd(p) {
    const slot = p?.winnerSlot
    if (slot === 0 || slot === 1) {
      this.wins[slot] = Math.min(this.roundsToWin, this.wins[slot] + 1)
      this._renderPips()
    }
  }

  _ko(slot) {
    const flavor = KO_FLAVOR[Math.floor(Math.random() * KO_FLAVOR.length)]
    this._card(`K.O.!<small>${charName((slot === 0 ? this.p1 : this.p2).charId)} ${flavor}</small>`, '', 1400)
  }

  // v2.1 (§23): brief 'FINISH HIM'-style stamp the moment an execution
  // cutscene starts (auto-triggered by combat — no input prompt), with the
  // skip hint tucked underneath. Top priority in the center arbiter, short
  // lived, and deduped because combat may emit both start events.
  _execStart() {
    const now = performance.now()
    if (now - this._lastExecStamp < 1500) return
    this._lastExecStamp = now
    const item = {
      kind: 'exec',
      dur: 1900,
      show: () => {
        item.el = el('div', 'hud-execstamp',
          `FINISH THE POSITION!<small>${touchUI(this.game) ? 'TAP TO SKIP' : 'ANY BUTTON TO SKIP'}</small>`)
        this.root.appendChild(item.el)
        item.outT = this._later(() => item.el?.classList.add('out'), 1650)
      },
      hide: () => {
        clearTimeout(item.outT)
        item.el?.remove()
        item.el = null
      },
    }
    this._centerRequest(item)
  }

  // ---------------------------------------------------------------- clock --
  // Display only — MatchScreen emits per-second 'timer' {value} events and
  // owns the real timeout; _roundStart seeds a default until the feed arrives.
  // v2.1 (§24): rounds run 300s, so the readout is M:SS.

  static _fmtTime(value) {
    const v = Math.max(0, Math.ceil(Number(value) || 0))
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
  }

  _setTimer(value) {
    const v = Math.max(0, Math.ceil(Number(value) || 0))
    this.timerEl.textContent = Hud._fmtTime(v)
    this.timerEl.classList.toggle('urgent', v <= 10)
  }

  // ---------------------------------------------------------------- pause --

  // Quit destination per mode: story/arcade return to their own hub screen so
  // campaign/ladder progress is never stranded; training, playground, versus
  // and exhibition fall back to the main menu.
  _quitTarget() {
    const hub = { story: 'story', arcade: 'arcade' }[this.matchMode]
    return hub && this.game.screens.screens.has(hub) ? hub : 'menu'
  }

  _showPause() {
    if (this.pauseEl) return
    this.paused = true
    const quitLabel = { story: 'Quit to Story', arcade: 'Quit to Arcade' }[this._quitTarget()] || 'Quit to Menu'
    this.pauseEl = el('div', 'hud-pause')
    this.pauseEl.innerHTML = `
      <div class="pz-title">MARKET HALTED</div>
      <div class="pz-sub">TRADING SUSPENDED PENDING FISTICUFFS</div>
      <div class="pz-menu">
        <div class="wcs-btn sel" data-act="resume">Resume</div>
        <div class="wcs-btn" data-act="quit">${quitLabel}</div>
      </div>
    `
    this.root.appendChild(this.pauseEl)
    this._pauseIndex = 0
    this._pauseBtns = [...this.pauseEl.querySelectorAll('.wcs-btn')]
    this._pauseBtns.forEach((btn, i) => {
      btn.addEventListener('mouseenter', () => this._pauseSet(i))
      btn.addEventListener('click', () => this._pauseActivate(i))
    })
    this._onPauseKey = (e) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this._pauseSet(this._pauseIndex - 1)
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this._pauseSet(this._pauseIndex + 1)
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') this._pauseActivate(this._pauseIndex)
      // Escape resumes via the game's own 'input:pause' toggle — no double handling
    }
    addEventListener('keydown', this._onPauseKey)
  }

  _pauseSet(i) {
    const n = this._pauseBtns.length
    const next = ((i % n) + n) % n
    if (next !== this._pauseIndex) this.game.audio.sfx('menu_move')
    this._pauseIndex = next
    this._pauseBtns.forEach((b, j) => b.classList.toggle('sel', j === next))
  }

  _pauseActivate(i) {
    const act = this._pauseBtns[i]?.dataset.act
    if (act === 'resume') this._resume(true)
    else if (act === 'quit') {
      this.game.audio.sfx('menu_back')
      this._hidePause()
      this.game.screens.goto(this._quitTarget())
    }
  }

  _resume(emit) {
    if (!this.pauseEl) return
    this.game.audio.sfx('menu_confirm')
    this._hidePause()
    if (emit) this.game.events.emit('match:resume')
  }

  _hidePause() {
    this.paused = false
    if (this._onPauseKey) { removeEventListener('keydown', this._onPauseKey); this._onPauseKey = null }
    this.pauseEl?.remove()
    this.pauseEl = null
  }
}
