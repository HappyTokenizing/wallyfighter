// Brain — the shared personality-driven fighting AI. One state machine
// (neutral / approach / pressure / defend / punish / oki / fetch),
// parameterized by a personality profile (src/ai/personalities.js) and a
// difficulty tuning (1..5). The Brain never reads inputs — only public fighter
// state and positions — and reacts to opponent state changes through a
// human-ish perception delay, so low levels genuinely see the world late.
//
// v2.0 (§17): the Brain navigates the FULL XZ PLANE. Approach = steer along
// the attacker->foe vector; personalities express laterally through their
// `plane` profile (orbit/weave/evade/retreat/dashStrafe): Dogey orbits
// aggressively, Cool Pal backpedals + sidesteps, Shibro holds ground rotating
// to face, the Bull walks straight through, Punkd teleport-strafes. Spacing
// preferences are RADIAL distances, item routes are 2D (nearestGroundItem),
// hazards are avoided by 2D position, and wall awareness keeps the AI from
// grinding into corners (into-wall components are projected out, orbits flip
// off walls, corners eject toward arena center).
//
// The Brain does not touch the Fighter. It drives an actuator (AIControl),
// which publishes world-space XZ movement intent (ctrl.moveX/moveZ) — the
// ControlSource surface the Fighter polls.
import { getPersonality, DefaultPlane } from './personalities.js'

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const GROUND_ACTIONABLE = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block'])
const PRESS_WAIT = { light: 7, heavy: 13, kick: 11, grab: 12, special: 18, super: 22 }
// states in which detouring for an item is acceptable
const FETCH_SAFE_FOE = new Set(['knockdown', 'getup', 'launched', 'ragdoll'])
// arena events that expose a hazard position (subscribe defensively — an
// arena that never emits these costs us nothing)
const HAZARD_EVENTS = [
  'arena:geyser', 'arena:marginCall', 'arena:lowbridge', 'arena:platefall',
  'arena:freezeray', 'arena:surge', 'arena:hazard', 'arena:bell', 'arena:gong',
]
const DEFAULT_MINZ = -5.5
const DEFAULT_MAXZ = 5.5
const WALL_MARGIN = 1.05

// Difficulty knobs. Level 1 is a slow-blinking tourist, level 5 is a
// tournament regular. react = frames of perception latency (NO input reading
// — this is how long it takes to notice a state change).
export function tuningFor(level) {
  const L = Math.max(1, Math.min(5, Math.round(level) || 1))
  const t = (L - 1) / 4
  return {
    level: L,
    react: Math.round(14 - 8 * t),            // 14 → 6 frames
    thinkEvery: Math.round(26 - 15 * t),      // decision cadence 26 → 11
    spacingJitter: 0.9 - 0.78 * t,            // footsie sloppiness, meters (radial)
    blockSkill: 0.35 + 0.7 * t,
    punishSkill: 0.25 + 0.7 * t,
    meterSkill: 0.35 + 0.65 * t,
    comboFollow: 0.3 + 0.65 * t,
    hazardIQ: [0, 0.15, 0.45, 0.75, 1][L - 1],
  }
}

export class Brain {
  constructor(act, level, self) {
    this.act = act
    this.tune = tuningFor(level)
    this.p = getPersonality(self?.def?.id)
    this.pl = { ...DefaultPlane, ...(this.p.plane || {}) } // plane expression (§17)
    this.moveById = new Map()
    for (const m of self?.def?.moves || []) this.moveById.set(m.id, m)

    this.frame = 0
    this.state = 'neutral'
    this.stateFrames = 0
    this.thinkIn = 6

    // perception (delayed view of the foe)
    this.seenFoe = 'idle'
    this._rawFoeState = null
    this._seenQueue = []

    // 2D navigation scratch (world-space XZ)
    this._to = { x: 1, z: 0 }     // unit vector self -> foe
    this._perp = { x: 0, z: 1 }   // left-hand perpendicular of _to
    this._orbitDir = Math.random() < 0.5 ? 1 : -1
    this._wallFlipCd = 0
    this._itemGoal = null

    // memory / cooldowns
    this.hazards = []             // [{ x, z, until }]
    this.pressureHeat = 0
    this.lastHurt = -999
    this._defDone = false
    this._punDone = false
    this._aaCd = 0
    this._airCd = 0
    this._fetchCd = 0
    this._gapArmed = false
    this._wakeDone = false
    this._jitter = 0
    this._shuffle = 0
    this._moveGate = 1
    this._ddDir = 1
    this._bound = false
    this._offs = []
    this._match = null
  }

  // ---------------------------------------------------------------- vectors

  // toward-foe dash intent
  _vecTo(scale = 1) { return { x: this._to.x * scale, z: this._to.z * scale } }
  // lateral (orbit) intent; sign follows the current orbit direction
  _vecSide(scale = 1) {
    const s = scale * this._orbitDir
    return { x: this._perp.x * s, z: this._perp.z * s }
  }

  _boundsOf(self) {
    const b = self.match?.bounds || {}
    return {
      minX: b.minX ?? -9, maxX: b.maxX ?? 9,
      minZ: b.minZ ?? DEFAULT_MINZ, maxZ: b.maxZ ?? DEFAULT_MAXZ,
    }
  }

  // ------------------------------------------------------------------ tick

  tick(self, foe) {
    this.frame++
    this.stateFrames++
    this._bindHazards(self)
    this._perceive(foe)

    // 2D geometry: everything downstream works from radial distance + the
    // self->foe unit vector (and its perpendicular for lateral expression)
    const dx = foe.pos.x - self.pos.x
    const dz = (foe.pos.z || 0) - (self.pos.z || 0)
    const dist = Math.hypot(dx, dz)
    if (dist > 1e-4) {
      this._to.x = dx / dist
      this._to.z = dz / dist
    }
    this._perp.x = -this._to.z
    this._perp.z = this._to.x
    this._track(self, foe)

    const act = this.act
    const grounded = self.pos.y <= 0.001
    const actionable = grounded && GROUND_ACTIONABLE.has(self.state)

    // buffered wake-up poke (Fighter supports buffering during knockdown tail)
    if (self.state === 'knockdown') {
      if (!this._wakeDone && self.knockdownFrames < 14 && Math.random() < 0.2 * this.p.aggression + 0.05) {
        this._wakeDone = true
        act.press(Math.random() < 0.4 ? 'special' : 'light')
      }
      act.setDesire(0, 0)
      return
    }
    this._wakeDone = false

    if (actionable && act.blockHold <= 0 && !act.busy()) {
      this._reactions(self, foe, dist)
      if (--this.thinkIn <= 0) {
        this.thinkIn = this.tune.thinkEvery + ((Math.random() * 8) | 0)
        this._think(self, foe, dist)
      }
    } else if (!actionable) {
      // got hit / launched / thrown: whatever we were doing is over
      if (self.state === 'hitstun' || self.state === 'launched' || self.state === 'grabbed') {
        act.clearPlan()
        if (this.state === 'pressure' || this.state === 'punish' || this.state === 'fetch') this._setState('neutral')
      }
    }

    this._movement(self, foe, dist, actionable)
  }

  // ------------------------------------------------------------- perception

  _perceive(foe) {
    if (foe.state !== this._rawFoeState) {
      this._rawFoeState = foe.state
      this._seenQueue.push({ state: foe.state, in: this.tune.react + ((Math.random() * 4) | 0) })
      if (this._seenQueue.length > 8) this._seenQueue.shift()
    }
    for (const q of this._seenQueue) q.in--
    while (this._seenQueue.length && this._seenQueue[0].in <= 0) {
      this.seenFoe = this._seenQueue.shift().state
    }
    // re-arm one-shot reactions once the foe is visibly out of attack
    if (this._rawFoeState !== 'attack' && this.seenFoe !== 'attack') {
      this._defDone = false
      this._punDone = false
    }
  }

  _track(self, foe) {
    if (self.state === 'hitstun' || self.state === 'launched' || self.state === 'knockdown' || self.state === 'ragdoll') {
      this.lastHurt = this.frame
    }
    if (self.state === 'blockstun' || self.state === 'hitstun') this.pressureHeat += 1
    this.pressureHeat *= 0.985
  }

  _tags(self, foe, dist) {
    const tags = new Set()
    if (dist > 4) tags.add('far')
    else if (dist > 1.9) tags.add('mid')
    else tags.add('close')
    if (foe.pos.y > 0.7 && dist < 3) tags.add('antiair')
    if (this.seenFoe === 'knockdown' || this.seenFoe === 'getup') tags.add('oki')
    if (self.meter >= 100) tags.add('meterFull')
    if (self.hp <= 28) tags.add('desperate')
    if ((foe.comboHits >= 3) || this.pressureHeat > 5) tags.add('pressured')
    if (this.frame - this.lastHurt < 50 && dist > 3.2) tags.add('knockedAway')
    return tags
  }

  // ------------------------------------------------------------- reactions
  // Per-frame layer: one-shot rolls against things the AI has *perceived*.

  _reactions(self, foe, dist) {
    const act = this.act
    const p = this.p
    const tune = this.tune

    // --- defend: foe is (visibly) swinging near us --------------------------
    if (!this._defDone && this.seenFoe === 'attack' && foe.state === 'attack' && dist < 3) {
      this._defDone = true
      const counter = p.counterness > 0 ? this._pickFavorite(self, new Set(['counter'])) : null
      if (counter && Math.random() < p.counterness) {
        act.queueMove(self, counter)
        this._setState('defend')
        return
      }
      // §17 lateral defense: sidestep the swing instead of eating/blocking it
      // (Cool Pal slips, Punkd blinks sideways, the Bull just doesn't)
      if (Math.random() < this.pl.evade * (0.35 + 0.65 * tune.blockSkill)) {
        this._orbitDir = Math.random() < 0.5 ? 1 : -1
        act.dashVec(this._vecSide(1))
        this._setState('defend')
        return
      }
      if (Math.random() < clamp01(p.blockChance * tune.blockSkill)) {
        act.holdBlock(16 + ((p.patience * 26) | 0) + ((Math.random() * 10) | 0))
        this._setState('defend')
        return
      }
    }

    // --- whiff punish: foe stuck in recovery -------------------------------
    if (!this._punDone && this.seenFoe === 'attack' && foe.state === 'attack' && foe.currentMove) {
      const m = foe.currentMove
      const past = foe.moveFrame - ((m.startup || 0) + (m.active || 0))
      const left = (m.recovery || 0) - past
      if (past >= 0 && left >= 9 && dist < 3.4) {
        this._punDone = true
        if (Math.random() < tune.punishSkill * (0.45 + p.aggression * 0.55)) {
          act.clearPlan()
          this._setState('punish')
          if (dist > 1.9) act.dashVec(this._vecTo(1))
          const fav = this._pickFavorite(self, new Set(['punish', 'close']))
          act.queue([{ wait: dist > 1.9 ? 7 : 2 }])
          if (fav) act.queueMove(self, fav)
          else act.queue([{ press: 'heavy', wait: 14 }])
          return
        }
      }
    }

    // --- abare: contest the gap between string hits ------------------------
    // (rushdown tax — a fast jab or grab the moment their move visibly ends)
    if (this._gapArmed && foe.state !== 'attack' && this._rawFoeState !== 'attack' && dist < 1.8) {
      this._gapArmed = false
      if (Math.random() < 0.18 + 0.32 * tune.punishSkill) {
        act.queue([{ press: Math.random() < 0.25 ? 'grab' : 'light', wait: 8 }])
        return
      }
    }
    if (foe.state === 'attack' && dist < 2.2) this._gapArmed = true

    // --- anti-air ----------------------------------------------------------
    if (foe.pos.y > 0.8 && dist < 2.6 && this.frame > this._aaCd) {
      this._aaCd = this.frame + 40
      if (Math.random() < 0.2 + 0.5 * tune.punishSkill) {
        const fav = this._pickFavorite(self, new Set(['antiair']))
        if (fav) act.queueMove(self, fav)
        else act.queue([
          { hold: { crouch: true }, wait: 1 },
          { press: 'heavy', wait: 10 },
          { hold: null, wait: 2 },
        ])
        return
      }
    }

    // --- juggle followup on a foe we launched ------------------------------
    if (foe.state === 'launched' && foe.pos.y > 0.5 && dist < 2.1 &&
        this.frame > this._airCd && Math.random() < this.tune.comboFollow * 0.45) {
      this._airCd = this.frame + 70
      act.queue([
        { press: 'jump', wait: 7 },
        { press: 'light', wait: 9 },
        { press: 'kick', wait: 10 },
      ])
    }
  }

  // ------------------------------------------------------------------ think
  // Cadenced layer: state transitions + committing to actions.

  _think(self, foe, dist) {
    const act = this.act
    const p = this.p
    const pl = this.pl
    // refresh per-decision noise
    this._jitter = (Math.random() - 0.5) * 2 * this.tune.spacingJitter
    this._moveGate = Math.random() < 0.15 + p.mobility * 0.85 ? 1 : 0
    this._shuffle = 0
    // lateral identity: occasionally reverse the circling direction
    if (Math.random() < pl.flip) this._orbitDir = -this._orbitDir

    const tags = this._tags(self, foe, dist)

    // item run in progress: keep going or bail (2D route, §17)
    if (this.state === 'fetch') {
      if (this._fetchStillValid(self, foe, dist)) return
      this._itemGoal = null
      this._setState('neutral')
    }

    // escape valve when getting bullied (Still Cool / Market Indifference...)
    if (tags.has('pressured')) {
      const fav = this._pickFavorite(self, new Set(['pressured']))
      if (fav && Math.random() < 0.35 + p.patience * 0.25) {
        act.queueMove(self, fav)
        this._setState('neutral')
        return
      }
      // no signature escape available: create space the honest way —
      // straight back out, or diagonally out for the slippery types
      if (Math.random() < 0.35) {
        const back = this._vecTo(-1)
        if (Math.random() < pl.evade) {
          const side = this._vecSide(0.9)
          back.x = (back.x + side.x) * 0.72
          back.z = (back.z + side.z) * 0.72
        }
        act.dashVec(back)
        this._setState('neutral')
        return
      }
    }

    // knocked away → signature comeback tool (Buy the Dip et al.)
    if (tags.has('knockedAway')) {
      const fav = this._pickFavorite(self, new Set(['knockedAway']))
      if (fav && Math.random() < 0.5 + p.aggression * 0.3) {
        act.queueMove(self, fav)
        return
      }
    }

    // downed foe → okizeme
    if (tags.has('oki') && foe.hp > 0) {
      this._setState('oki')
      this._oki(self, foe, dist, tags)
      return
    }

    // safe moment + free hands → go shopping (2D item route)
    if (this._maybeStartFetch(self, foe, dist)) return

    switch (this.state) {
      case 'punish':
        if (!act.busy() || this.stateFrames > 45) this._setState('neutral')
        break

      case 'defend':
        if (act.blockHold <= 0) {
          this._setState(Math.random() < p.aggression ? 'approach' : 'neutral')
          if (this.state === 'neutral' && Math.random() < p.feintiness * 0.5) act.dashVec(this._vecTo(-1)) // create space
        }
        break

      case 'oki': // foe is back up
        this._setState(Math.random() < p.aggression ? 'approach' : 'neutral')
        break

      case 'approach':
        this._approach(self, foe, dist, tags)
        break

      case 'pressure':
        this._pressure(self, foe, dist, tags)
        break

      default:
        this._neutral(self, foe, dist, tags)
    }
  }

  _neutral(self, foe, dist, tags) {
    const act = this.act
    const p = this.p
    const pl = this.pl

    // cash in a full bar when the moment is right
    if (tags.has('meterFull') && Math.random() < p.meterGreed * this.tune.meterSkill * 0.5) {
      const fav = this._pickFavorite(self, new Set(['meterFull']))
      if (fav) { act.queueMove(self, fav); return }
    }

    // zoners and trappers work their gadgets from neutral
    const isZoner = p.spacing.preferred > 2.6
    if (Math.random() < 0.22 + p.feintiness * 0.15 + (isZoner ? 0.28 : 0)) {
      const fav = this._pickFavorite(self, tags)
      if (fav) { act.queueMove(self, fav); return }
    }

    if (Math.random() < p.aggression * 0.75 + (tags.has('desperate') ? 0.15 : 0)) {
      this._setState('approach')
      return
    }

    // teleport-strafe: blink to a new attack angle instead of walking there
    if (pl.dashStrafe > 0 && dist < p.spacing.preferred + 2.2 && Math.random() < pl.dashStrafe * 0.45) {
      this._orbitDir = Math.random() < 0.5 ? 1 : -1
      act.dashVec(this._vecSide(1))
      return
    }

    // feints: empty dash-in-dash-out, or a max-range whiffed poke
    if (Math.random() < p.feintiness * 0.45) {
      if (Math.random() < 0.6) {
        act.dashVec(this._vecTo(1))
        act.queue([{ wait: 9 }, { dash: this._vecTo(-1), wait: 8 }])
      } else if (dist > 1.6 && dist < 3) {
        act.queue([{ press: 'light', wait: 8 }])
      }
      return
    }

    // footsie flavor: hyperactive types dash-dance/orbit, the rest sway
    if (p.dashiness > 0.7 && dist < p.spacing.preferred + 1.2 && Math.random() < p.mobility * 0.4) {
      this._ddDir = -this._ddDir
      this._shuffle = this._ddDir
    } else if (p.mobility > 0.4) {
      this._shuffle = Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : -1
    }
  }

  _approach(self, foe, dist, tags) {
    const act = this.act
    const p = this.p
    if (dist <= p.spacing.preferred + p.spacing.tolerance) {
      this._setState('pressure')
      this._openPressure(self, tags)
      return
    }
    if (Math.random() < p.dashiness * 0.6) {
      // straight-line types dash the beeline; weavers dash in at an angle
      const v = this._vecTo(1)
      if (Math.random() < this.pl.weave * 0.6) {
        const side = this._vecSide(0.5)
        v.x += side.x
        v.z += side.z
        const l = Math.hypot(v.x, v.z) || 1
        v.x /= l
        v.z /= l
      }
      act.dashVec(v)
    } else if (Math.random() < p.jumpiness * 0.35 && dist < 4.2) {
      act.queue([{ press: 'jump', wait: 12 }, { press: 'heavy', wait: 10 }])
    }
    // long-range favorite on the way in (projectiles, charges)
    if (Math.random() < 0.18) {
      const fav = this._pickFavorite(self, tags)
      if (fav) act.queueMove(self, fav)
    }
  }

  _pressure(self, foe, dist, tags) {
    const act = this.act
    const p = this.p
    if (dist > p.spacing.preferred + p.spacing.tolerance + 0.7) {
      this._setState('approach')
      return
    }
    // they're (visibly) blocking: throws beat block
    if (this.seenFoe === 'block' && dist < 1.7 && Math.random() < 0.5) {
      const grabFav = this._pickFavorite(self, new Set(['close']))
      if (grabFav && grabFav.kind === 'grab') act.queueMove(self, grabFav)
      else act.queue([{ press: 'grab', wait: 12 }])
      return
    }
    // hit-and-run types bail after a connect — out, or out-and-around
    if (p.hitAndRun && Math.random() < 0.5) {
      const out = this._vecTo(-1)
      if (Math.random() < this.pl.orbit * 0.7) {
        const side = this._vecSide(0.8)
        out.x = (out.x + side.x) * 0.72
        out.z = (out.z + side.z) * 0.72
      }
      act.dashVec(out)
      this._setState('neutral')
      return
    }
    // mixup artists reposition mid-pressure (teleport-strafe to the other side)
    if (this.pl.dashStrafe > 0 && Math.random() < this.pl.dashStrafe * 0.3) {
      act.dashVec(this._vecSide(1))
    }
    this._openPressure(self, tags)
  }

  _oki(self, foe, dist, tags) {
    const act = this.act
    const p = this.p
    // meaty as they rise (getup i-frames make this a timing gamble — fine)
    if (foe.state === 'getup' && foe.getupFrames < 14 && Math.random() < p.okiRush) {
      const fav = this._pickFavorite(self, new Set(['oki', 'close']))
      if (fav) act.queueMove(self, fav)
      else act.queue([{ press: 'heavy', wait: 14 }])
    }
  }

  _openPressure(self, tags) {
    const act = this.act
    const p = this.p
    const fav = this._pickFavorite(self, tags)
    if (fav && Math.random() < 0.5) {
      act.queueMove(self, fav)
      return
    }
    // run a pressure string through the chain-cancel system, trimmed by skill
    const s = p.strings[(Math.random() * p.strings.length) | 0] || ['light']
    const steps = []
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && Math.random() > this.tune.comboFollow) break
      steps.push({ press: s[i], wait: PRESS_WAIT[s[i]] || 9 })
    }
    act.queue(steps)
  }

  // ------------------------------------------------------------ item routes
  // §17: item routes are 2D. When the moment is safe (foe floored or far) and
  // our hands are empty, commit to walking to the nearest ground item. The
  // walk itself happens in _movement; MatchScreen's walk-over auto-pickup
  // (and its aiShouldUse glue) does the rest.

  _maybeStartFetch(self, foe, dist) {
    if (this.tune.level < 2 || this.frame < this._fetchCd) return false
    const items = self.match?.items
    if (!items?.nearestGroundItem) return false
    let held = null
    try { held = items.held?.(self.slot) } catch { return false }
    if (held) return false
    const safe = FETCH_SAFE_FOE.has(foe.state) || dist > 4.2
    if (!safe || Math.random() > 0.3 + this.p.patience * 0.3 + this.tune.level * 0.06) {
      this._fetchCd = this.frame + 40
      return false
    }
    let g = null
    try { g = items.nearestGroundItem(self.pos) } catch { return false }
    if (!g?.pos) return false
    const gx = g.pos.x
    const gz = g.pos.z ?? 0
    const gd = Math.hypot(gx - self.pos.x, gz - (self.pos.z || 0))
    // worth the detour only when it's closer to us than the fight is hot
    if (gd > 7 || (gd > 2.2 && dist < 3.4 && !FETCH_SAFE_FOE.has(foe.state))) {
      this._fetchCd = this.frame + 60
      return false
    }
    this._itemGoal = { x: gx, z: gz, kind: g.kind, until: this.frame + 170 }
    this._setState('fetch')
    return true
  }

  _fetchStillValid(self, foe, dist) {
    const g = this._itemGoal
    if (!g || this.frame > g.until) return false
    const items = self.match?.items
    if (!items?.nearestGroundItem) return false
    let held = null
    try { held = items.held?.(self.slot) } catch { return false }
    if (held) return false // picked it up — mission accomplished
    // abort the errand if the fight comes to us
    if (dist < 2.4 && !FETCH_SAFE_FOE.has(foe.state)) return false
    let cur = null
    try { cur = items.nearestGroundItem(self.pos) } catch { return false }
    if (!cur?.pos) return false // despawned / grabbed by the foe
    // retarget (items can be nudged by physics; nearest may have changed)
    g.x = cur.pos.x
    g.z = cur.pos.z ?? 0
    g.kind = cur.kind
    return true
  }

  // ------------------------------------------------------------- movement
  // Runs every frame; produces the world-space XZ movement intent by
  // composing a RADIAL component (spacing along the self->foe vector) with a
  // TANGENTIAL component (the personality's lateral expression), then bending
  // the result around hazards and off walls.

  _movement(self, foe, dist, actionable) {
    const act = this.act
    const p = this.p
    const pl = this.pl
    if (!actionable || act.blockHold > 0) {
      if (act.blockHold > 0) act.setDesire(0, 0)
      return
    }

    let radial = 0   // + = toward foe, - = away
    let tangent = 0  // magnitude of lateral orbit (sign applied via _orbitDir)
    const preferred = p.spacing.preferred + this._jitter
    const err = dist - preferred

    switch (this.state) {
      case 'approach':
      case 'punish':
        radial = 1
        tangent = pl.weave * 0.55
        break
      case 'pressure':
        radial = err > 0.4 ? 1 : (p.cornerCarry ? 0.5 : 0)
        tangent = pl.orbit * 0.5
        break
      case 'defend':
        radial = -pl.retreat * 0.8
        tangent = pl.evade * 0.4
        break
      case 'oki': {
        const want = 1.7
        radial = dist > want + 0.35 ? 1 : dist < want - 0.35 ? -0.8 : 0
        tangent = pl.orbit * 0.35 // circle the body, don't stand on it
        break
      }
      case 'fetch': {
        // steer to the item, not the foe
        const g = this._itemGoal
        if (!g) { this._setState('neutral'); break }
        const gx = g.x - self.pos.x
        const gz = g.z - (self.pos.z || 0)
        const gd = Math.hypot(gx, gz)
        if (gd > 0.22) {
          const mv = { x: gx / gd, z: gz / gd }
          this._bendAroundHazards(self, mv)
          this._slideOffWalls(self, mv)
          act.setDesire(mv.x, mv.z)
        } else {
          act.setDesire(0, 0) // standing on it; auto-pickup fires
        }
        return
      }
      default: // neutral footsies at radial preferred distance
        if (err > p.spacing.tolerance) radial = 1
        else if (err < -p.spacing.tolerance) radial = -1
        else {
          radial = 0
          // in-range sway: orbiters circle, others shuffle in and out a touch
          tangent = pl.orbit * (0.4 + 0.6 * p.mobility)
          if (this._shuffle !== 0 && pl.orbit < 0.3) radial = this._shuffle * 0.4
        }
    }

    // statues stay statues
    if (this._moveGate === 0 && this.state !== 'punish' && this.state !== 'approach') {
      radial = 0
      tangent *= 0.25
    }

    // compose world-space intent: radial along self->foe + tangential orbit
    const t = tangent * this._orbitDir
    const mv = {
      x: this._to.x * radial + this._perp.x * t,
      z: this._to.z * radial + this._perp.z * t,
    }

    this._bendAroundHazards(self, mv)
    this._slideOffWalls(self, mv)

    // clamp to the unit disc
    const len = Math.hypot(mv.x, mv.z)
    if (len > 1) { mv.x /= len; mv.z /= len }
    act.setDesire(mv.x, mv.z)
  }

  // hazard awareness (learned from arena events; scaled by difficulty).
  // 2D: flee radially when standing in one, refuse to walk into one.
  _bendAroundHazards(self, mv) {
    const iq = this.tune.hazardIQ
    if (iq <= 0 || !this.hazards.length) return
    const px = self.pos.x
    const pz = self.pos.z || 0
    for (const h of this.hazards) {
      if (this.frame > h.until) continue
      const ax = px - h.x
      const az = pz - h.z
      const d = Math.hypot(ax, az)
      if (d < 1.5 && Math.random() < iq) {
        // inside the blast radius: run straight out
        const l = d || 1
        mv.x = ax / l
        mv.z = az / l
        break
      }
      // and don't stroll INTO one either: kill the into-hazard component
      if (d < 2.2 && Math.random() < iq * 0.7) {
        const l = d || 1
        const toward = -(mv.x * (ax / l) + mv.z * (az / l)) // >0 = heading in
        if (toward > 0.3) {
          mv.x += (ax / l) * toward
          mv.z += (az / l) * toward
        }
      }
    }
    while (this.hazards.length && this.frame > this.hazards[0].until) this.hazards.shift()
  }

  // Wall awareness (§17): never grind into walls or hump corners. Into-wall
  // movement components are removed, orbits flip when the circle meets a
  // wall, and a true corner ejects the intent toward arena center — the
  // approach ROTATES around the obstruction instead of pushing through it.
  _slideOffWalls(self, mv) {
    const b = this._boundsOf(self)
    const px = self.pos.x
    const pz = self.pos.z || 0
    const nearX = px < b.minX + WALL_MARGIN ? -1 : px > b.maxX - WALL_MARGIN ? 1 : 0
    const nearZ = pz < b.minZ + WALL_MARGIN ? -1 : pz > b.maxZ - WALL_MARGIN ? 1 : 0
    if (!nearX && !nearZ) return

    // project out the into-wall component (slide along the wall)
    if (nearX === -1 && mv.x < 0) mv.x = 0
    if (nearX === 1 && mv.x > 0) mv.x = 0
    if (nearZ === -1 && mv.z < 0) mv.z = 0
    if (nearZ === 1 && mv.z > 0) mv.z = 0

    // orbit meeting a wall: reverse the circle instead of sanding the paint
    if (this.frame > this._wallFlipCd) {
      const tx = this._perp.x * this._orbitDir
      const tz = this._perp.z * this._orbitDir
      if ((nearX === -1 && tx < -0.35) || (nearX === 1 && tx > 0.35) ||
          (nearZ === -1 && tz < -0.35) || (nearZ === 1 && tz > 0.35)) {
        this._orbitDir = -this._orbitDir
        this._wallFlipCd = this.frame + 45
      }
    }

    // cornered: strong bias toward center so the AI walks OUT of the pocket
    if (nearX && nearZ) {
      const cx = (b.minX + b.maxX) / 2 - px
      const cz = (b.minZ + b.maxZ) / 2 - pz
      const l = Math.hypot(cx, cz) || 1
      mv.x += (cx / l) * 0.85
      mv.z += (cz / l) * 0.85
    }
  }

  // ------------------------------------------------------------- helpers

  _setState(s) {
    if (this.state === s) return
    this.state = s
    this.stateFrames = 0
  }

  // Recency decay: a move just used keeps only ~12% of its selection weight
  // and linearly recovers over ~3 seconds. The multiplier both scales the
  // weighted roll AND gates candidacy, so even a character whose only favorite
  // fits the moment falls back to pressure strings instead of spamming it —
  // mid-level AI rotates lights/heavies/kicks/specials rather than repeating
  // its single highest-scoring option until KO.
  _recencyMult(id) {
    const used = this.act.recentUse?.get?.(id)
    if (used == null) return 1
    const dt = this.act.frameNum() - used
    if (dt >= 180) return 1
    return 0.12 + 0.88 * (dt / 180)
  }

  _pickFavorite(self, tags) {
    const p = this.p
    let total = 0
    const cands = []
    for (const f of p.favorites) {
      const mv = this.moveById.get(f.id)
      if (!mv) continue
      if ((mv.meterCost || 0) > self.meter) continue
      if (!f.when.some((t) => tags.has(t))) continue
      if ((mv.meterCost || 0) > 0 && Math.random() > p.meterGreed * this.tune.meterSkill + 0.15) continue
      const rec = this._recencyMult(f.id)
      if (rec < 1 && Math.random() > rec) continue // just used: usually sit it out
      const w = f.w * rec
      cands.push([mv, w])
      total += w
    }
    if (!cands.length) return null
    let r = Math.random() * total
    for (const [mv, w] of cands) {
      r -= w
      if (r <= 0) return mv
    }
    return cands[cands.length - 1][0]
  }

  // Subscribe to arena hazard broadcasts. Defensive: unknown payloads are
  // ignored, and the subscription tears itself down once the match is gone
  // (MatchScreen never disposes control sources).
  _bindHazards(self) {
    if (this._bound) return
    this._bound = true
    this._match = self.match || null
    const ev = self.game?.events
    if (!ev || typeof ev.on !== 'function') return
    for (const name of HAZARD_EVENTS) {
      try {
        const off = ev.on(name, (payload) => this._onHazard(payload))
        if (typeof off === 'function') this._offs.push(off)
      } catch { /* arena events are optional */ }
    }
  }

  _onHazard(payload) {
    if (this._match && this._match.active === false) { this._unbindHazards(); return }
    const x = typeof payload?.x === 'number' ? payload.x
      : typeof payload?.pos?.x === 'number' ? payload.pos.x : null
    if (x === null || !isFinite(x)) return
    const z = typeof payload?.z === 'number' ? payload.z
      : typeof payload?.pos?.z === 'number' ? payload.pos.z : 0
    this.hazards.push({ x, z: isFinite(z) ? z : 0, until: this.frame + 160 })
    if (this.hazards.length > 8) this.hazards.shift()
  }

  _unbindHazards() {
    for (const off of this._offs) { try { off() } catch { /* already gone */ } }
    this._offs = []
  }
}
