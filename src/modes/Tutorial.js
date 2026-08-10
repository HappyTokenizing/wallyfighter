// Tutorial (v2.0 §20) — TutorialDirector turns STORY chapter 1's first round
// into a guided controls tutorial: eleven sequential objectives with chunky
// retro prompt cards, a docile Dogey (aiLevel 0 dummy), a scripted poke to
// block, granted meter for the super, a forced item airdrop and a granted
// finisher setup. Skippable ANYTIME (Esc / on-screen button, touch included);
// completion or skip flips save 'story.tutorialDone' and hands the match to a
// live aiLevel-1 opponent.
//
// Contract: `new TutorialDirector(match, game)` — MatchScreen drives it via
// update(dt)/dispose() when rules.tutorial (§20). Parallel-build safety: the
// director also SELF-DRIVES on requestAnimationFrame until the first external
// update() call, refuses to double-attach (match.tutorial guard), watches
// match.active + 'screen:changed' so quitting mid-tutorial never leaks, and
// every DOM touch is guarded so the objective state machine runs headless in
// plain node (no three.js import, no window requirement).
//
// Dependencies: none. Plain ES module per CONTRACTS.md.

const MOVE_TARGET = 6 // meters of XZ roaming for objective 1
const ADVANCE_TICKS = 52 // celebration beat between objectives (~0.87 s)
const ITEM_KIND = 'foam-finger' // tier-0 roster item — harmless, on brand
const HEAVY_KINDS = new Set(['heavy', 'launcher'])

const CODE_GLYPHS = {
  Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'R-ALT',
  Enter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP', Tab: 'TAB',
  ArrowLeft: '◀', ArrowRight: '▶', ArrowUp: '▲', ArrowDown: '▼',
}
// Glyphs match the v2.1 touch overlay: ATTACK is the light button, BLOCK is a
// hold button in the right cluster, SUPER is a long-press on SPEC (full meter),
// and the GRAB button reads USE while an item is held.
const TOUCH_GLYPHS = {
  jump: 'JUMP', light: 'ATTACK', heavy: 'HEAVY', kick: 'KICK', block: 'BLOCK',
  grab: 'GRAB', special: 'SPEC', super: 'HOLD SPEC', item: 'USE', crouch: 'CROUCH',
}

function codeGlyph(code) {
  if (!code) return '?'
  if (CODE_GLYPHS[code]) return CODE_GLYPHS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6)
  return String(code).toUpperCase()
}

const STYLE = `
  .wcs-tut { position: absolute; inset: 0; pointer-events: none; z-index: 120;
             font-family: var(--wcs-font, Impact, 'Arial Black', sans-serif); color: #fff; }
  .wcs-tut-card { position: absolute; left: 50%; bottom: 7vh; transform: translateX(-50%);
                  width: min(92vw, 560px); text-align: center; padding: 12px 20px 14px;
                  background: linear-gradient(180deg, var(--wcs-panel-hi, #2c3352), var(--wcs-panel-lo, #141829));
                  border: 4px solid #000; border-radius: 10px;
                  box-shadow: 0 6px 0 rgba(0,0,0,0.55), 0 0 26px rgba(255,217,74,0.16);
                  animation: wcs-tut-pop 0.28s cubic-bezier(0.2, 1.6, 0.4, 1); }
  .wcs-tut.touch .wcs-tut-card { bottom: auto; top: 12vh; width: min(84vw, 470px); }
  @keyframes wcs-tut-pop { from { transform: translateX(-50%) translateY(26px) scale(0.9); opacity: 0; }
                           to { transform: translateX(-50%); opacity: 1; } }
  .wcs-tut-card .tstep { font-size: clamp(10px, 1.3vw, 14px); letter-spacing: 4px;
                         color: var(--wcs-green, #2bff6a); text-shadow: 1px 1px 0 #000; }
  .wcs-tut-card .ttitle { font-size: clamp(22px, 3.4vw, 40px); letter-spacing: 2px;
                          color: var(--wcs-gold, #ffd94a); -webkit-text-stroke: 1px #000;
                          text-shadow: 3px 3px 0 rgba(0,0,0,0.6); }
  .wcs-tut-card .tbody { margin-top: 6px; font-family: var(--wcs-mono, 'Courier New', monospace);
                         font-weight: bold; font-size: clamp(11px, 1.5vw, 16px); letter-spacing: 1px;
                         color: #e8ecff; text-shadow: 1px 1px 0 #000; line-height: 2; }
  .wcs-tut-card kbd { display: inline-block; margin: 0 3px; padding: 0.12em 0.5em 0.06em;
                      font-family: var(--wcs-font, Impact); font-size: 1.08em; letter-spacing: 1px;
                      color: #1a1405; border: 3px solid #000; border-radius: 6px;
                      background: linear-gradient(180deg, #ffe98a, var(--wcs-gold, #ffd94a) 55%, var(--wcs-gold-deep, #c99a12));
                      box-shadow: 0 3px 0 #000; vertical-align: middle; }
  .wcs-tut-card .thint { display: none; margin-top: 5px; font-family: var(--wcs-mono, monospace);
                         font-weight: bold; font-size: clamp(10px, 1.3vw, 14px);
                         color: var(--wcs-red, #ff3b4d); text-shadow: 1px 1px 0 #000; }
  .wcs-tut-card .thint.show { display: block; }
  .wcs-tut-card .tprog { margin: 9px auto 0; width: 80%; height: 14px; background: #0a0d1c;
                         border: 3px solid #000; border-radius: 5px; overflow: hidden; }
  .wcs-tut-card .tprog .fill { height: 100%; width: 0%;
                               background: linear-gradient(90deg, var(--wcs-green, #2bff6a), #b6ff4a);
                               transition: width 0.12s linear; }
  .wcs-tut-card .tprogtxt { margin-top: 4px; font-family: var(--wcs-mono, monospace); font-weight: bold;
                            font-size: clamp(10px, 1.2vw, 13px); letter-spacing: 1px; color: #8f97c4;
                            text-shadow: 1px 1px 0 #000; }
  .wcs-tut-card .tcheck { position: absolute; right: -16px; top: -24px; font-size: clamp(38px, 5vw, 58px);
                          color: var(--wcs-green, #2bff6a); -webkit-text-stroke: 2px #000;
                          text-shadow: 3px 3px 0 rgba(0,0,0,0.6); opacity: 0; transform: scale(0.3); }
  .wcs-tut-card.done { border-color: var(--wcs-green, #2bff6a); }
  .wcs-tut-card.done .tcheck { opacity: 1; transform: scale(1);
                               transition: transform 0.16s cubic-bezier(0.2, 1.8, 0.4, 1), opacity 0.1s; }
  .wcs-tut-skip { position: absolute; top: calc(92px + env(safe-area-inset-top, 0px)); right: 12px;
                  pointer-events: auto; cursor: pointer;
                  font-family: var(--wcs-font, Impact); font-size: clamp(12px, 1.6vw, 17px);
                  letter-spacing: 2px; color: #fff; text-shadow: 1px 1px 0 #000;
                  background: linear-gradient(180deg, #3a4066, #191d33);
                  border: 3px solid #000; border-radius: 8px; box-shadow: 0 4px 0 rgba(0,0,0,0.6);
                  padding: 0.35em 0.8em 0.28em; }
  .wcs-tut-skip:hover { color: var(--wcs-gold, #ffd94a); transform: translateY(-1px); }
  .wcs-tut-skip:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0,0,0,0.6); }
  .wcs-tut-banner { position: absolute; left: 0; right: 0; top: 26vh; text-align: center;
                    font-size: clamp(26px, 5.6vw, 68px); letter-spacing: 4px;
                    color: var(--wcs-gold, #ffd94a); -webkit-text-stroke: 2px #000;
                    text-shadow: var(--wcs-extrude, 4px 4px 0 #000);
                    animation: wcs-tut-pop-c 0.4s cubic-bezier(0.2, 1.7, 0.4, 1); }
  @keyframes wcs-tut-pop-c { from { transform: scale(0.6); opacity: 0; } }
  @media (max-height: 500px) {
    .wcs-tut-card { bottom: 4vh; padding: 8px 14px 10px; }
    .wcs-tut-card .ttitle { font-size: 20px; }
    .wcs-tut-card .tbody { line-height: 1.6; }
    .wcs-tut-skip { top: 70px; }
  }
`

export class TutorialDirector {
  constructor(match, game) {
    this.match = match
    this.game = game
    this.disposed = false
    this.done = false
    this.started = false
    this.step = -1
    this._offs = []
    this._raf = null
    this._extDriven = false
    this._advanceIn = null
    this._disposeIn = null
    this._forcedFinisher = false
    this._finisherAnnounced = false
    this._escAt = 0
    this._hintT = 0

    // Double-attach guard: MatchScreen (§20) and the StoryMode safety net may
    // both try to construct one — whoever got there first wins, the second
    // instance is born inert.
    const existing = match ? match.tutorial : null
    if (!match || (existing && existing !== this && !existing.disposed)) {
      this.disposed = true
      return
    }
    match.tutorial = this

    this.player = match.fighters?.[0] || null
    this.dummy = match.fighters?.[1] || null

    // Dogey stands down until the live fight (aiLevel 0 = training dummy).
    this._setAiLevel(0)

    this.steps = this._buildSteps()
    this._buildDom()

    // ---- events ----
    const ev = game?.events
    if (ev?.on) {
      this._offs.push(ev.on('round:start', (e) => this._onRoundStart(e)))
      this._offs.push(ev.on('fighter:hit', (e) => this._onHit(e)))
      this._offs.push(ev.on('fighter:blocked', (e) => this._onBlocked(e)))
      this._offs.push(ev.on('fighter:ko', (e) => this._onKo(e)))
      this._offs.push(ev.on('finisher:start', (e) => this._onFinisherStart(e)))
      this._offs.push(ev.on('item:used', (e) => this._onItemUsed(e)))
      this._offs.push(ev.on('input:pause', () => this._onPauseEvent()))
      // any screen change away from the match = the match is gone — never leak
      this._offs.push(ev.on('screen:changed', (e) => { if (e && e.name !== 'match') this.dispose() }))
    }
    // Esc-origin detection for the pause event (gamepad Start keeps pausing)
    if (typeof addEventListener === 'function') {
      this._keyHandler = (e) => { if (e && e.code === 'Escape') this._escAt = Date.now() }
      addEventListener('keydown', this._keyHandler, true)
    }

    // Self-driving fallback: ticks on rAF until MatchScreen calls update(dt).
    if (typeof requestAnimationFrame === 'function') {
      const loop = () => {
        this._raf = null
        if (this.disposed || this._extDriven) return
        this._tick(1 / 60)
        if (!this.disposed && !this._extDriven) this._raf = requestAnimationFrame(loop)
      }
      this._raf = requestAnimationFrame(loop)
    }
  }

  get active() { return !this.disposed && !this.done }

  // ------------------------------------------------------------- public API

  // External driver (MatchScreen, or the headless harness). First call takes
  // over from the internal rAF loop.
  update(dt = 1 / 60) {
    if (this.disposed) return
    if (!this._extDriven) {
      this._extDriven = true
      if (this._raf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf)
      this._raf = null
    }
    this._tick(Number.isFinite(dt) && dt > 0 ? dt : 1 / 60)
  }

  skip() {
    if (this.disposed || this.done) return
    if (this.match?.paused) { try { this.game.events.emit('match:resume') } catch { /* best effort */ } }
    this._goLive(true, 'TUTORIAL SKIPPED')
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this._raf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf)
    this._raf = null
    for (const off of this._offs) { try { off?.() } catch { /* gone */ } }
    this._offs = []
    if (this._keyHandler && typeof removeEventListener === 'function') {
      removeEventListener('keydown', this._keyHandler, true)
    }
    this._keyHandler = null
    try { this.dom?.remove() } catch { /* headless */ }
    this.dom = this.card = this.skipBtn = null
    if (this.match && this.match.tutorial === this) this.match.tutorial = null
  }

  // ---------------------------------------------------------------- ticking

  _tick(dt) {
    if (this.disposed) return
    const m = this.match
    if (!m || m.active === false) { this.dispose(); return }
    if (m.paused) return
    if (this._disposeIn != null) { if (--this._disposeIn <= 0) this.dispose(); return }
    if (this.done) return
    if (this._hintT > 0 && --this._hintT === 0) this._hint(null)
    if (!this.started) { if (m.phase === 'fight') this._start(); return }
    // safety: the round moved on without us (unexpected KO / hazard) — go live
    if ((m.round || 1) > 1) { this._goLive(false, null); return }
    if (m.phase === 'fight') {
      // the lesson has no clock: pin the round timer at full
      m.timeLeft = (m.rules?.roundTime ?? 99) * 60
      this._topOffHp()
    }
    if (this._advanceIn != null) {
      if (--this._advanceIn <= 0) { this._advanceIn = null; this._nextStep() }
      return
    }
    this._tickObjective(dt)
  }

  _start() {
    if (this.started || this.done || this.disposed) return
    this.started = true
    this.step = 0
    try { this.match.cap('TUTORIAL!') } catch { /* HUD optional */ }
    this._enterStep(0)
  }

  _nextStep() {
    this.step++
    if (this.step >= this.steps.length) this._goLive(false, 'TUTORIAL COMPLETE!')
    else this._enterStep(this.step)
  }

  _stepId() { return this.steps?.[this.step]?.id || null }

  _topOffHp() {
    const id = this._stepId()
    const p = this.player, d = this.dummy
    try {
      if (p && p.hp > 0 && p.hp < 70) p.setHp(p.maxHp)
      // never during the finisher setup — Dogey stays down bad at 10%
      if (id !== 'finish' && d && d.hp > 0 && d.hp < 70) d.setHp(d.maxHp)
    } catch { /* fighters optional in stubs */ }
  }

  // ------------------------------------------------------------- objectives

  _buildSteps() {
    const k = (a) => this._kbd(a)
    const move = this._moveKbd()
    return [
      { id: 'move', title: 'TAKE A WALK', body: `ROAM THE FLOOR WITH ${move}<br>THE WHOLE STADIUM IS YOURS`, progress: true },
      { id: 'jump', title: 'GET SOME AIR', body: `PRESS ${k('jump')} TO JUMP` },
      { id: 'block', title: 'HODL THE LINE', body: `HOLD ${k('block')} TO BLOCK<br>DOGEY POKES ON THE CUE` },
      { id: 'chain', title: 'CHAIN REACTION', body: `LAND A 3-HIT LIGHT CHAIN<br>TAP ${k('light')} ${k('light')} ${k('light')} UP CLOSE`, progress: true },
      { id: 'heavy', title: 'HEAVY BAGS', body: `LAND A HEAVY HIT — ${k('heavy')}` },
      { id: 'kick', title: 'LEG DAY', body: `LAND A KICK — ${k('kick')}` },
      { id: 'grab', title: 'MARGIN CALL', body: `WALK UP CLOSE AND THROW — ${k('grab')}<br>THROWS BEAT BLOCK` },
      { id: 'special', title: 'SPECIAL DELIVERY', body: `UNLEASH A SPECIAL — ${k('special')}` },
      { id: 'super', title: 'FULL SEND', body: `METER'S ON THE HOUSE<br>HIT ${k('super')} FOR YOUR SUPER` },
      { id: 'item', title: 'FREE AIRDROP', body: `AN ITEM LANDED IN YOUR HANDS<br>PRESS ${k('item')} TO USE IT` },
      { id: 'finish', title: 'CLOSE THE POSITION', body: `DOGEY IS DOWN BAD<br>PRESS ${k('special')} + ${k('heavy')} TOGETHER!` },
    ]
  }

  _enterStep(i) {
    const s = this.steps[i]
    if (!s) return
    this._showCard(i)
    this._hint(null)
    try { this.game.audio.sfx('menu_move', { vol: 0.5 }) } catch { /* audio optional */ }
    const p = this.player
    switch (s.id) {
      case 'move':
        this._dist = 0
        this._lastX = p ? p.pos.x : 0
        this._lastZ = p ? (p.pos.z || 0) : 0
        this._setProgress(0, `0.0 / ${MOVE_TARGET.toFixed(1)} M`)
        break
      case 'block':
        this._poke = { state: 'wait', t: 70, walkT: 0 }
        break
      case 'chain':
        this._setProgress(0, '0 / 3 HITS')
        break
      case 'special':
        try { p?.gainMeter(100) } catch { /* stub */ }
        break
      case 'super':
        try { p?.gainMeter(100) } catch { /* stub */ }
        try { this.match.cap('METER GRANTED!') } catch { /* HUD optional */ }
        break
      case 'item':
        this._itemT = 1
        if (!this.match.items) { this._completeStep(); break } // items disarmed — don't wall the lesson
        break
      case 'finish': {
        const d = this.dummy
        try { if (d && d.hp > 0) d.setHp(Math.max(1, Math.round(d.maxHp * 0.1))) } catch { /* stub */ }
        this._forcedFinisher = true
        if (!this._finisherAnnounced) {
          this._finisherAnnounced = true
          // v2.1 (§23): finisher:ready prompt removed — KO auto-plays the execution
          try { this.match.say('FINISH THE POSITION!', 0) } catch { /* announcer optional */ }
        }
        break
      }
    }
  }

  _tickObjective(dt) {
    const m = this.match
    const p = this.player
    switch (this._stepId()) {
      case 'move': {
        if (!p) { this._completeStep(); break }
        const dx = p.pos.x - this._lastX
        const dz = (p.pos.z || 0) - this._lastZ
        this._lastX = p.pos.x
        this._lastZ = p.pos.z || 0
        const d = Math.hypot(dx, dz)
        if (d > 0.0005 && d < 0.5) this._dist += d // ignore teleports/resets
        this._setProgress(this._dist / MOVE_TARGET, `${this._dist.toFixed(1)} / ${MOVE_TARGET.toFixed(1)} M`)
        if (this._dist >= MOVE_TARGET) this._completeStep()
        break
      }
      case 'jump':
        if (p && p.state === 'jump' && p.pos.y > 0.2) this._completeStep()
        break
      case 'block':
        this._tickPoke(dt)
        break
      case 'special':
        try { if (p && p.meter < 60) p.gainMeter(100) } catch { /* stub */ }
        if (p?.currentMove?.kind === 'special' && p.state === 'attack') this._completeStep()
        break
      case 'super':
        try { if (p && p.meter < 100) p.gainMeter(100) } catch { /* stub */ }
        if (p?.currentMove?.kind === 'super' && p.state === 'attack') this._completeStep()
        break
      case 'item': {
        const items = m.items
        if (!items) { this._completeStep(); break }
        if (--this._itemT <= 0) {
          this._itemT = 30
          let ok = false
          try { ok = !!items.held(0) || !!items.give(p, ITEM_KIND) } catch { /* items disarmed mid-step */ }
          // roster stub / repeated give failures must never wall the lesson
          this._itemTries = (this._itemTries || 0) + 1
          if (!ok && this._itemTries >= 5) this._completeStep()
          if (ok) this._itemTries = 0
        }
        break
      }
      case 'finish':
        // grant the chord: MatchScreen only arms finisherReady in the final
        // round, so the director pins it armed itself (and cleans it on skip)
        try { if (m.phase === 'fight' && m.finisherReady) m.finisherReady[0] = true } catch { /* stub */ }
        break
    }
  }

  // Scripted poke for the block lesson: Dogey walks into range once cued and
  // throws his most honest jab, driven through the direct Fighter API. Loops
  // with a hint until the player blocks one.
  _tickPoke(dt) {
    const pk = this._poke
    const d = this.dummy, p = this.player
    if (!pk || !d || !p) { this._completeStep(); return }
    if (this.match.phase !== 'fight') return
    switch (pk.state) {
      case 'wait':
        if (--pk.t <= 0) {
          pk.state = 'approach'
          try { this.match.cap('INCOMING POKE!') } catch { /* HUD optional */ }
        }
        break
      case 'approach': {
        if (d.state !== 'idle' && d.state !== 'walk') break // launched/thrown — wait it out
        const dx = p.pos.x - d.pos.x
        const dz = (p.pos.z || 0) - (d.pos.z || 0)
        const dist = Math.hypot(dx, dz) || 0.001
        if (dist > 1.4) {
          const step = Math.min(4.6 * dt, dist - 1.25)
          d.pos.x += (dx / dist) * step
          if (typeof d.pos.z === 'number') d.pos.z += (dz / dist) * step
          if (++pk.walkT % 24 === 1) { try { d.animator.play('walk') } catch { /* clip optional */ } }
        } else {
          const move = this._pokeMove()
          if (!move) { this._completeStep(); break } // stub roster — never wall the tutorial
          // v2.0 free-roam: aim the poke at the player's real XZ position —
          // a ±1 X-sign here whiffs forever when the player stands off-axis.
          try { d.setFacing(Math.atan2(-dz, dx)) } catch { /* stub */ }
          try { d.startMove(move) } catch { this._completeStep(); break }
          pk.state = 'cooldown'
          pk.t = 120
        }
        break
      }
      case 'cooldown':
        pk.t--
        if (d.state === 'attack' && pk.t > -120) break
        pk.state = 'wait'
        pk.t = 80
        break
    }
  }

  _pokeMove() {
    if (this._pokeMoveDef !== undefined) return this._pokeMoveDef
    const moves = this.dummy?.def?.moves || []
    let best = null
    for (const mv of moves) {
      if ((mv.meterCost || 0) > 0 || typeof mv.script === 'function') continue
      if (mv.kind !== 'light' && mv.kind !== 'kick') continue
      const better = !best ||
        (mv.kind === 'light' && best.kind !== 'light') ||
        (mv.kind === best.kind && (mv.startup ?? 9) < (best.startup ?? 9))
      if (better) best = mv
    }
    this._pokeMoveDef = best || moves.find((mv) => mv.kind === 'light') || null
    return this._pokeMoveDef
  }

  // ------------------------------------------------------------ event ears

  _onRoundStart(e) {
    if (this.disposed || this.done) return
    const round = e?.round ?? 1
    if (!this.started && round === 1) this._start()
    else if (this.started && round > 1) this._goLive(false, null)
  }

  _onBlocked(e) {
    if (!this._live() || !e) return
    if (this._stepId() === 'block' && e.slot === 0) {
      try { this.match.cap('DIAMOND HANDS!') } catch { /* HUD optional */ }
      this._completeStep()
    }
  }

  _onHit(e) {
    if (!this._live() || !e) return
    const id = this._stepId()
    if (e.slot === 0) {
      if (id === 'block' && this._advanceIn == null) {
        this._hint(`OOF! HOLD ${this._kbd('block')} BEFORE THE POKE LANDS`, 240)
      }
      return
    }
    if (e.slot !== 1) return
    const kind = this._playerMoveKind(e.move)
    switch (id) {
      case 'chain': {
        const c = Math.min(3, e.combo || 0)
        if (c > 0 && this._advanceIn == null) this._setProgress(c / 3, `${c} / 3 HITS`)
        if ((e.combo || 0) >= 3) this._completeStep()
        break
      }
      case 'heavy': if (kind && HEAVY_KINDS.has(kind)) this._completeStep(); break
      case 'kick': if (kind === 'kick') this._completeStep(); break
      case 'grab': if (kind === 'grab') this._completeStep(); break
      case 'special': if (kind === 'special' || e.move === 'script') this._completeStep(); break
      case 'super': if (kind === 'super') this._completeStep(); break
    }
  }

  _onKo(e) {
    if (!this._live() || !e) return
    if (e.slot === 1) {
      // Dogey down: the finisher lesson is complete either way; any earlier
      // KO means the student needs no teacher — end the lesson gracefully.
      if (this._stepId() === 'finish') this._completeStep()
      else this._goLive(false, 'FAST LEARNER!')
    } else if (e.slot === 0) {
      this._goLive(false, null)
    }
  }

  _onFinisherStart(e) {
    if (!this._live()) return
    if (this._stepId() === 'finish' && (e?.slot ?? 0) === 0) this._completeStep()
  }

  _onItemUsed(e) {
    if (!this._live() || !e) return
    if (this._stepId() === 'item' && e.slot === 0) this._completeStep()
  }

  // Esc skips the tutorial (spec §20). The InputManager emits 'input:pause'
  // for BOTH Esc and gamepad Start and MatchScreen has already toggled pause
  // by the time we hear it — so: Esc-origin while now-paused = skip + resume;
  // Esc while now-unpaused meant "close the pause menu" (leave it be); pad
  // Start keeps its normal pause behavior.
  _onPauseEvent() {
    if (this.disposed || this.done) return
    if (Date.now() - this._escAt > 250) return
    if (this.match?.paused) this.skip()
  }

  _live() { return !this.disposed && !this.done && this.started }

  _playerMoveKind(id) {
    if (!id) return null
    if (id === 'script') return this.player?.currentMove?.kind || null
    const mv = this.player?.def?.moves?.find?.((m) => m.id === id)
    return mv?.kind || null
  }

  // ------------------------------------------------------------- completion

  _completeStep() {
    if (this.done || this.disposed || this._advanceIn != null) return
    this._advanceIn = ADVANCE_TICKS
    this._hint(null)
    if (this.card) {
      this.card.classList.add('done')
      const chk = this.card.querySelector('.tcheck')
      if (chk) chk.textContent = '✔'
    }
    if (this.steps[this.step]?.progress) this._setProgress(1, null)
    try {
      this.game.audio.sfx('coin', { pitch: 1.5 })
      this.game.audio.sfx('menu_confirm')
      this.game.audio.crowd('cheer')
    } catch { /* audio optional */ }
  }

  // The tutorial ends here — completed, skipped, or overtaken by events.
  // Marks the save flag, wakes Dogey up to aiLevel 1 and hands back the clock.
  _goLive(skipped, bannerText) {
    if (this.done || this.disposed) return
    this.done = true
    this._advanceIn = null
    try { this.game.save.set('story.tutorialDone', true) } catch { /* save optional */ }
    this._setAiLevel(1)
    const m = this.match
    if (m.phase === 'fight') {
      try { m.timeLeft = (m.rules?.roundTime ?? 99) * 60 } catch { /* stub */ }
      try { if (this.player && this.player.hp > 0) this.player.setHp(this.player.maxHp) } catch { /* stub */ }
      try { if (skipped && this.dummy && this.dummy.hp > 0) this.dummy.setHp(this.dummy.maxHp) } catch { /* stub */ }
      if (this._forcedFinisher) { try { m.finisherReady[0] = false } catch { /* stub */ } }
    }
    this._poke = null
    this._clearCard()
    if (this.skipBtn) { try { this.skipBtn.remove() } catch { /* gone */ } this.skipBtn = null }
    if (bannerText) {
      this._banner(bannerText)
      try {
        this.game.audio.sfx(skipped ? 'bell' : 'coins_burst')
        this.match.cap(skipped ? 'LIVE TRADING!' : 'NOW FIGHT FOR REAL!')
        if (!skipped) this.match.say('WELCOME TO THE MARKET!', 0)
      } catch { /* presentation optional */ }
      this._disposeIn = 210
    } else {
      this._disposeIn = 30
    }
  }

  // ------------------------------------------------------------------- misc

  _setAiLevel(level) {
    const ctrl = this.dummy?.ctrl
    if (!ctrl || typeof ctrl.updateAI !== 'function') return
    try {
      ctrl.level = level
      ctrl.brain = null // lazily rebuilt at the new level
      ctrl.clearPlan?.()
      ctrl.axisV = 0
      ctrl.blockHold = 0
    } catch { /* duck-typed ctrl */ }
  }

  // ---------------------------------------------------------------- DOM/UI

  _buildDom() {
    if (typeof document === 'undefined' || !this.game?.ui) return
    this.dom = document.createElement('div')
    this.dom.className = 'wcs-tut' + (this.game.isTouch ? ' touch' : '')
    const style = document.createElement('style')
    style.textContent = STYLE
    this.dom.appendChild(style)
    this.skipBtn = document.createElement('div')
    this.skipBtn.className = 'wcs-tut-skip'
    this.skipBtn.textContent = this.game.isTouch ? 'SKIP TUTORIAL ▶▶' : 'SKIP TUTORIAL (ESC)'
    this.skipBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.skip() })
    this.dom.appendChild(this.skipBtn)
    this.card = null
    this.game.ui.appendChild(this.dom)
  }

  _showCard(i) {
    if (!this.dom || typeof document === 'undefined') return
    this._clearCard()
    const s = this.steps[i]
    const card = document.createElement('div')
    card.className = 'wcs-tut-card'
    card.innerHTML = `
      <div class="tstep">STEP ${i + 1} / ${this.steps.length}</div>
      <div class="ttitle">${s.title}</div>
      <div class="tbody">${s.body}</div>
      ${s.progress ? '<div class="tprog"><div class="fill"></div></div><div class="tprogtxt"></div>' : ''}
      <div class="thint"></div>
      <div class="tcheck"></div>`
    this.dom.appendChild(card)
    this.card = card
  }

  _clearCard() {
    if (this.card) { try { this.card.remove() } catch { /* gone */ } }
    this.card = null
  }

  _setProgress(frac, txt) {
    if (!this.card) return
    const fill = this.card.querySelector('.tprog .fill')
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`
    if (txt != null) {
      const t = this.card.querySelector('.tprogtxt')
      if (t) t.textContent = txt
    }
  }

  _hint(html, ticks = 0) {
    this._hintT = html ? ticks : 0
    if (!this.card) return
    const h = this.card.querySelector('.thint')
    if (!h) return
    if (html) { h.innerHTML = html; h.classList.add('show') }
    else { h.textContent = ''; h.classList.remove('show') }
  }

  _banner(text) {
    if (!this.dom || typeof document === 'undefined') return
    const b = document.createElement('div')
    b.className = 'wcs-tut-banner'
    b.textContent = text
    this.dom.appendChild(b)
  }

  _kbd(action) {
    if (this.game?.isTouch) return `<kbd>${TOUCH_GLYPHS[action] || String(action).toUpperCase()}</kbd>`
    const code = this.game?.input?.bindings?.[0]?.[action]
    return `<kbd>${codeGlyph(code)}</kbd>`
  }

  _moveKbd() {
    if (this.game?.isTouch) return '<kbd>LEFT STICK</kbd>'
    return ['fwd', 'left', 'back', 'right'].map((a) => this._kbd(a)).join('')
  }
}
