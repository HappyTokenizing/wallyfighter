// Post-match results — winner glorification, loser humiliation, coin rain, the
// shareable polaroid MATCH CARD (DOM panel + hand-drawn PNG download), and an
// optional WATCH REPLAY entry that appears when the replay module and a capture
// are both available.
// Options: Watch Replay, Save Card, Rematch, Character Select, Main Menu.
import { el, MenuList, UIState, ensureMusic, charName, charTitle, drawPortrait, toast } from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'
import { heroPortrait, portraitMaster } from './PortraitStudio.js'
import { GameConfig } from '../../config/GameConfig.js'

// Meme caption pool — one caption stamps the card, a different one jabs the
// loser tag. The tiny disclaimer ALWAYS follows the card caption.
const CAPTIONS = [
  'ABSOLUTELY LIQUIDATED',
  'ZERO RISK MANAGEMENT',
  'HE FULL PORTED',
  'EXIT LIQUIDITY DETECTED',
  'TOUCH GRASS',
  'STILL BULLISH',
  'FUNDS ARE NOT SAFE-ISH',
  'BRO USED 100X',
  "PERMANENTLY PUNK'D",
  'THIS WAS FINANCIAL ADVICE',
]
const FINE_PRINT = 'It was not financial advice.'

// Build-safe handle on the replay viewer (built in parallel in src/replay/).
// import.meta.glob resolves to an EMPTY map while ReplayUI.js does not exist,
// so the build stays green and the button hides itself; once the file lands,
// Vite bundles it as a lazy chunk and the exact `mountReplayViewer` export is
// used — no code change needed here.
const REPLAY_UI_KEY = '../../replay/ReplayUI.js'
const ReplayUILoaders = import.meta.glob('../../replay/ReplayUI.js')

function numOrNull(v) { return typeof v === 'number' && isFinite(v) ? v : null }

// Match stats are wired by another module — probe every plausible payload shape
// (stats.maxCombo[slot], stats.p1.maxCombo, result.maxCombo, ...) and return
// null when absent so the card prints 'UNAUDITED' instead of NaN.
function slotStat(result, slot, names) {
  const pools = [result?.stats, result?.matchStats, result]
  const slotKeys = [slot, 'p' + (slot + 1)]
  for (const pool of pools) {
    if (!pool || typeof pool !== 'object') continue
    for (const name of names) {
      const v = pool[name]
      if (v == null) continue
      const direct = numOrNull(v)
      if (direct != null) return direct
      if (typeof v === 'object') {
        for (const k of slotKeys) {
          const s = numOrNull(v[k])
          if (s != null) return s
        }
      }
    }
    for (const k of slotKeys) {
      const sub = pool[k]
      if (!sub || typeof sub !== 'object') continue
      for (const name of names) {
        const s = numOrNull(sub[name])
        if (s != null) return s
      }
    }
  }
  return null
}

export class ResultsScreen {
  constructor(game) { this.game = game }

  enter(result = {}) {
    this.result = result
    this.backdrop = getBackdrop(this.game)
    this._viewerOpen = false

    const winnerSlot = result.winnerSlot === 1 ? 1 : 0
    const winner = winnerSlot === 0 ? result.p1 : result.p2
    const loser = winnerSlot === 0 ? result.p2 : result.p1
    this.winnerSlot = winnerSlot
    this.winnerId = winner?.charId
    this.loserId = loser?.charId

    // two DISTINCT captions so the screen never repeats itself
    const i = Math.floor(Math.random() * CAPTIONS.length)
    const j = (i + 1 + Math.floor(Math.random() * (CAPTIONS.length - 1))) % CAPTIONS.length
    this.caption = CAPTIONS[i]
    const tagCaption = CAPTIONS[j]

    const d = new Date()
    this.dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.${d.getFullYear()}`
    this.stats = this._buildStats()

    // v1.1 (§16): AI-driven slots are announced as CPU, never "PLAYER 2"
    const winnerLabel = winner?.control === 'ai' ? 'CPU' : (winnerSlot === 0 ? 'PLAYER 1' : 'PLAYER 2')

    this.root = el('div', 'wcs-screen wcs-results')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="res-stack">
        <div class="res-kicker">WINNER — ${winnerLabel}</div>
        <div class="res-winner">${charName(this.winnerId)}</div>
        <div class="res-title">${charTitle(this.winnerId)}</div>
        <div class="res-wins">${result.finisherUsed ? 'FINISHER LANDED — SHAREHOLDERS THRILLED' : 'NUMBER WENT UP'}</div>
        <div class="res-loser">${charName(this.loserId)}: ${tagCaption}</div>
      </div>
      <div class="res-menu"></div>
    `
    this.game.ui.appendChild(this.root)
    this._buildCard()

    // coin rain (after the card so coins fall OVER the polaroid)
    for (let i = 0; i < 14; i++) {
      const coin = el('div', 'res-coin')
      coin.style.left = Math.random() * 100 + 'vw'
      coin.style.animationDuration = 2 + Math.random() * 2.2 + 's'
      coin.style.animationDelay = Math.random() * 2.5 + 's'
      this.root.appendChild(coin)
    }

    this.game.audio.announcer(`${charName(this.winnerId)} wins!`)
    this.game.audio.sfx('coins_burst')

    const items = []
    if (this._replayAvailable()) items.push({ label: 'Watch Replay', id: 'replay' })
    // v2.1 (§28): full-match WebM download — hidden when MediaRecorder is
    // unsupported or nothing was captured
    if (this._fightRecordingAvailable()) items.push({ label: 'Download Fight', id: 'download' })
    items.push(
      { label: 'Save Card', id: 'save' },
      { label: 'Rematch', id: 'rematch' },
      { label: 'Character Select', id: 'select' },
      { label: 'Main Menu', id: 'menu' },
    )
    this.list = new MenuList(this.game, this.root.querySelector('.res-menu'), items, {
      onConfirm: (item) => this._select(item),
      onBack: () => this.game.screens.goto('menu'),
    })

    // the replay viewer (whatever its shape) can tell us it closed via events
    this._onReplayClosed = () => { this._viewerOpen = false }
    this.game.events.on('replay:closed', this._onReplayClosed)
    this.game.events.on('replay:close', this._onReplayClosed)
  }

  exit() {
    this.game.events.off('replay:closed', this._onReplayClosed)
    this.game.events.off('replay:close', this._onReplayClosed)
    try { this._viewerHandle?.close?.() } catch { /* already gone */ }
    this._viewerHandle = null
    this._viewerReplay = null
    this.root?.remove()
    this.root = null
    this.list = null
  }

  // ------------------------------------------------------------- match card --

  _buildStats() {
    const r = this.result
    const rounds = Array.isArray(r.rounds) ? r.rounds : null
    const w = rounds ? rounds.filter((x) => x?.winnerSlot === this.winnerSlot).length : 0
    const roundsStr = rounds && rounds.length ? `${w} - ${rounds.length - w}` : 'UNRECORDED'
    const combo = slotStat(r, this.winnerSlot, ['maxCombo', 'bestCombo', 'biggestCombo', 'longestCombo'])
    const dmg = slotStat(r, this.winnerSlot, ['damageDealt', 'damage', 'totalDamage', 'dmg'])
    const venue = String(r.arenaId || 'meme-market').replace(/-/g, ' ').toUpperCase()
    return [
      { k: 'ROUNDS', v: roundsStr },
      { k: 'MAX COMBO', v: combo != null ? `${Math.round(combo)} HITS` : 'UNAUDITED' },
      { k: 'DMG DEALT', v: dmg != null ? String(Math.round(dmg)) : 'UNAUDITED' },
      { k: 'FINISHER', v: r.finisherUsed ? 'YES. BRUTAL.' : 'MERCY SHOWN' },
      { k: 'VENUE', v: venue },
    ]
  }

  // Which costume that corner fought in — the card should show the fighter the
  // player just watched, not the floor model.
  _costumeOf(slot) {
    const side = slot === 1 ? this.result.p2 : this.result.p1
    return side?.costume ? 1 : 0
  }

  _buildCard() {
    const card = el('div', 'res-card')
    card.innerHTML = `
      <div class="res-card-tape"></div>
      <div class="res-card-head">&#9733; OFFICIAL MATCH CARD &#9733;</div>
      <div class="res-card-photo">
        <canvas class="cw"></canvas>
        <canvas class="cl"></canvas>
        <div class="res-card-defeated">DEFEATED</div>
        <div class="res-card-winname">${charName(this.winnerId)}</div>
      </div>
      <div class="res-card-caption">${this.caption}</div>
      <div class="res-card-fine">${FINE_PRINT}</div>
      <div class="res-card-stats">${this.stats.map((s) => `<div class="row"><span>${s.k}</span><b>${s.v}</b></div>`).join('')}</div>
      <div class="res-card-foot"><span>${this.dateStr}</span><span>${GameConfig.title}</span></div>
      <div class="res-card-save">SAVE CARD</div>
    `
    // The photo on the polaroid is a real photograph now: the winner in their
    // victory pose under a gold hero key, the loser in their loss pose under a
    // dead, desaturated one. Two different lighting designs on the same card is
    // the whole gag, and it only costs two cached bakes.
    heroPortrait(this.game, card.querySelector('.cw'), this.winnerId, {
      framing: 'hero', pose: 'win', look: 'gold',
      costume: this._costumeOf(this.winnerSlot), px: 448, priority: true,
    })
    heroPortrait(this.game, card.querySelector('.cl'), this.loserId, {
      framing: 'hero', pose: 'lose', look: 'defeat',
      costume: this._costumeOf(this.winnerSlot === 0 ? 1 : 0), px: 256, priority: true,
    })
    card.querySelector('.res-card-save').addEventListener('click', () => this._saveCard())
    this.root.appendChild(card)
  }

  _saveCard() {
    try {
      const canvas = this._drawCardPNG()
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `wcs-match-card-${this.winnerId || 'winner'}-vs-${this.loserId || 'loser'}.png`
      a.click()
      this.game.audio.sfx('coins_burst')
      toast(this.game, 'CARD SAVED')
    } catch (e) {
      console.warn('[results] card save failed', e)
      toast(this.game, 'SAVE FAILED')
    }
  }

  // The saved PNG must be the same photo the player is looking at. Prefer the
  // baked 3D render; fall back to the flat doodle if the bake never landed
  // (no WebGL2, a build that threw, a save fired within the first frames).
  // `__hero` tells the caller whether to smooth on downscale — a 512px render
  // must, a 96px doodle must not.
  _photo(id, pose, look, slot) {
    const master = portraitMaster(id, {
      framing: 'hero', pose, look, costume: this._costumeOf(slot),
    })
    if (master) {
      master.__hero = true
      return master
    }
    const c = document.createElement('canvas')
    drawPortrait(c, id)
    c.__hero = false
    return c
  }

  // Hand-drawn <canvas> twin of the DOM card — intentionally simpler, but same
  // polaroid bones: cream stock, photo window, caption, stats, branding.
  _drawCardPNG() {
    const W = 640, H = 840
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')
    const impact = 'Impact, "Arial Black", sans-serif'

    // cream polaroid stock + edge shading
    g.fillStyle = '#f2eddd'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(0,0,0,0.3)'
    g.lineWidth = 8
    g.strokeRect(4, 4, W - 8, H - 8)

    g.textAlign = 'center'
    g.fillStyle = '#8a7f5c'
    g.font = 'bold 20px "Courier New", monospace'
    g.fillText('* OFFICIAL MATCH CARD *', W / 2, 44)

    // photo window
    const px = 36, py = 60, pw = W - 72, ph = 430
    const bg = g.createLinearGradient(0, py, 0, py + ph)
    bg.addColorStop(0, '#3d1160')
    bg.addColorStop(1, '#140a26')
    g.fillStyle = bg
    g.fillRect(px, py, pw, ph)

    g.save()
    g.beginPath()
    g.rect(px, py, pw, ph)
    g.clip()
    // gold burst
    g.strokeStyle = 'rgba(255,217,74,0.16)'
    g.lineWidth = 5
    const cx = px + pw * 0.42, cy = py + ph * 0.4
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30)
      g.lineTo(cx + Math.cos(a) * 460, cy + Math.sin(a) * 460)
      g.stroke()
    }
    // winner portrait, big and proud
    const winP = this._photo(this.winnerId, 'win', 'gold', this.winnerSlot)
    g.imageSmoothingEnabled = winP.__hero === true
    g.imageSmoothingQuality = 'high'
    g.drawImage(winP, px + 44, py + 30, 300, 300)
    g.strokeStyle = '#000'
    g.lineWidth = 6
    g.strokeRect(px + 44, py + 30, 300, 300)
    // loser portrait, tipped over in the corner
    const loseP = this._photo(this.loserId, 'lose', 'defeat', this.winnerSlot === 0 ? 1 : 0)
    g.imageSmoothingEnabled = loseP.__hero === true
    g.save()
    g.translate(px + pw - 100, py + ph - 110)
    g.rotate(1.78)
    g.globalAlpha = 0.92
    g.filter = 'grayscale(60%) brightness(0.8)'
    g.drawImage(loseP, -70, -70, 140, 140)
    g.filter = 'none'
    g.globalAlpha = 1
    g.strokeRect(-70, -70, 140, 140)
    g.restore()
    // DEFEATED stamp under the tipped loser
    g.save()
    g.translate(px + pw - 100, py + ph - 22)
    g.rotate(-0.14)
    g.font = `bold 22px ${impact}`
    g.fillStyle = '#ff3b4d'
    g.fillText('DEFEATED', 0, 0)
    g.restore()
    // winner name plate under the big portrait
    const name = charName(this.winnerId)
    let nameSize = 46
    g.font = `${nameSize}px ${impact}`
    while (nameSize > 22 && g.measureText(name).width > pw - 200) {
      nameSize -= 2
      g.font = `${nameSize}px ${impact}`
    }
    g.lineWidth = 6
    g.strokeStyle = '#000'
    g.strokeText(name, px + 194, py + ph - 26)
    g.fillStyle = '#ffd94a'
    g.fillText(name, px + 194, py + ph - 26)
    g.restore() // un-clip

    // huge meme caption (shrink-to-fit)
    let capSize = 52
    g.font = `${capSize}px ${impact}`
    while (capSize > 22 && g.measureText(this.caption).width > W - 90) {
      capSize -= 2
      g.font = `${capSize}px ${impact}`
    }
    g.save()
    g.translate(W / 2, py + ph + 62)
    g.rotate(-0.03)
    g.lineWidth = 7
    g.strokeStyle = 'rgba(20,4,8,0.85)'
    g.strokeText(this.caption, 0, 0)
    g.fillStyle = '#e01326'
    g.fillText(this.caption, 0, 0)
    g.restore()

    // the legally-required fine print
    g.font = 'italic bold 17px Georgia, "Times New Roman", serif'
    g.fillStyle = '#7d7460'
    g.fillText(FINE_PRINT, W / 2, py + ph + 92)

    // stats block
    g.strokeStyle = 'rgba(0,0,0,0.3)'
    g.lineWidth = 2
    g.setLineDash([7, 7])
    g.beginPath()
    g.moveTo(48, 606)
    g.lineTo(W - 48, 606)
    g.stroke()
    g.setLineDash([])
    let y = 640
    for (const s of this.stats) {
      // label and value share one baseline per row; the value shrinks to fit
      // the space the label leaves and ellipsizes as a last resort, so it can
      // never intrude on a neighboring row
      g.font = 'bold 21px "Courier New", monospace'
      g.textAlign = 'left'
      g.fillStyle = '#5a5348'
      g.fillText(s.k, 60, y)
      const avail = (W - 60) - (60 + g.measureText(s.k).width + 24)
      let vSize = 21
      let value = String(s.v)
      g.font = `bold ${vSize}px "Courier New", monospace`
      while (vSize > 13 && g.measureText(value).width > avail) {
        vSize -= 1
        g.font = `bold ${vSize}px "Courier New", monospace`
      }
      if (g.measureText(value).width > avail) {
        while (value.length > 1 && g.measureText(value + '…').width > avail) value = value.slice(0, -1)
        value += '…'
      }
      g.textAlign = 'right'
      g.fillStyle = '#0d6e33'
      g.fillText(value, W - 60, y)
      y += 31
    }

    // footer: date + branding
    g.font = `19px ${impact}`
    g.fillStyle = '#8a7f5c'
    g.textAlign = 'left'
    g.fillText(this.dateStr, 48, H - 26)
    g.textAlign = 'right'
    g.fillText(GameConfig.title.toUpperCase(), W - 48, H - 26)
    return c
  }

  // ---------------------------------------------------------------- replay --

  // The capture lives on game.replay (contract) or game.__lastReplay (what the
  // replay module actually wires via MatchScreen) — probe both, all optional.
  _replayCapture() {
    const g = this.game
    if (g.replay?.captureAvailable?.()) return g.replay
    if (g.__lastReplay?.captureAvailable?.()) return g.__lastReplay
    return null
  }

  _replayAvailable() {
    return !!ReplayUILoaders[REPLAY_UI_KEY] && !!this._replayCapture()
  }

  _watchReplay() {
    const loader = ReplayUILoaders[REPLAY_UI_KEY]
    if (!loader || !this._replayCapture()) {
      toast(this.game, 'NO CLIP CAPTURED')
      return
    }
    this._viewerOpen = true
    loader()
      .then((mod) => {
        const mount = mod?.mountReplayViewer
        if (typeof mount !== 'function') throw new Error('mountReplayViewer export missing')
        this._viewerHandle = mount(this.game) // overlays itself on game.ui
        // the viewer signals closure by leaving playback mode (its close()
        // calls replay.exitPlayback()); update() polls for that
        this._viewerReplay = this._replayCapture() || this.game.__lastReplay || null
        if (!this._viewerReplay) this._viewerOpen = false
      })
      .catch((e) => {
        console.warn('[results] replay viewer failed', e)
        this._viewerOpen = false
        toast(this.game, 'REPLAY UNAVAILABLE')
      })
  }

  // --------------------------------------------------------- fight download --

  // §28 contract: game.fightRecording = { available, blob, download(filename) }.
  // The blob is finalized asynchronously right after match:end, so the button
  // shows on `available` and the click double-checks the blob.
  _fightRecordingAvailable() {
    return !!this.game.fightRecording?.available
  }

  _downloadFight() {
    const rec = this.game.fightRecording
    if (!rec?.available) {
      toast(this.game, 'NO RECORDING')
      return
    }
    if (!rec.blob) {
      toast(this.game, 'STILL ENCODING — TRY AGAIN')
      return
    }
    try {
      rec.download(`wcs-fight-${this.winnerId || 'winner'}-vs-${this.loserId || 'loser'}.webm`)
      this.game.audio.sfx('coins_burst')
      toast(this.game, 'FIGHT DOWNLOADED')
    } catch (e) {
      console.warn('[results] fight download failed', e)
      toast(this.game, 'DOWNLOAD FAILED')
    }
  }

  // ------------------------------------------------------------------ menu --

  _select(item) {
    const screens = this.game.screens
    if (item.id === 'replay') {
      this._watchReplay()
    } else if (item.id === 'download') {
      this._downloadFight()
    } else if (item.id === 'save') {
      this._saveCard()
    } else if (item.id === 'rematch') {
      const params = UIState.lastMatchParams || this._rebuildParams()
      screens.goto('vs', params)
    } else if (item.id === 'select') {
      screens.goto('select', { mode: this.result.mode || 'versus' })
    } else {
      screens.goto('menu')
    }
  }

  _rebuildParams() {
    // fallback if the stash was lost — reconstruct from the result payload
    // (v1.1: the second corner defaults to a CPU — local 2P no longer exists)
    return {
      mode: this.result.mode || 'versus',
      p1: this.result.p1 || { charId: 'wally', control: 'p1' },
      p2: this.result.p2 || { charId: 'dogey', control: 'ai', aiLevel: 3 },
      arenaId: this.result.arenaId || 'meme-market',
    }
  }

  update(dt) {
    ensureMusic(this.game, 'results')
    this.backdrop.update(dt)
    if (this._viewerOpen) {
      // resume our menu once the viewer has left playback mode (its CLOSE path
      // calls exitPlayback), or if an event told us it closed
      if (this._viewerReplay && !this._viewerReplay.inPlayback) {
        this._viewerOpen = false
        this._viewerHandle = null
        this._viewerReplay = null
      }
      return // the clip viewer owns input while open
    }
    this.list?.update()
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
