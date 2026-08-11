// Retro loading screen — and, since v3.7, the place where the game actually
// does its expensive first-time work.
//
// WHAT THIS USED TO BE. A fake timer. The bar was `Math.min(1, this.t / 1.4)`
// with random jitter and `_finish()` fired on `t >= 1.5`. It waited on nothing
// at all. So the game spent 1.5 s showing a progress bar that meant nothing and
// then paid for its geometry, its materials, its procedural surfaces and its
// shader links LATER — on the main thread, mid-cinematic. Measured on the
// production build, the intro's running frames are smooth (median 8.3 ms, p90
// 9.2 ms) but every shot boundary lands a PAIR of 200-4600 ms frames:
// ~19.9 s of frozen frame inside a ~36 s reel. renderer.info across one replay
// shows why — programs 79 -> 91, geometries 217 -> 269 — twelve shader compiles
// and three arenas' worth of geometry built while the camera was moving.
//
// WHAT IT IS NOW. The same 1.2 s of screen time, spent on the real thing:
//
//   PHASE 1  prewarmIntro(game) from IntroCinematic.js — a step queue over every
//            shot in the reel, in play order, building scenes/rigs/props and
//            enqueueing their procedural surfaces.
//   PHASE 2  createPrewarmer(renderer, …) from render/prewarm.js — drains the
//            texture queue phase 1 filled and makes the driver link the shader
//            programs for the scenes phase 1 built.
//
// Both are time-sliced: each frame gets BUDGET_MS of work and no more, so the
// bar keeps animating while this happens. The arcade feel is untouched — chunky
// random leaps, joke ticker, skip on any input — but the number under the bar
// is now real work completed, and the screen leaves when the work is done
// rather than when a stopwatch says so.
//
// WHAT IS DELIBERATELY UNCHANGED: _finish()'s first-boot logic (first boot sets
// 'introSeen' and goes to 'intro', every boot after goes to 'title'), the DOM,
// the CSS classes, the ticker lines and the skip affordance.
import { el, touchUI } from '../uiKit.js'
import { GameConfig } from '../../config/GameConfig.js'
import { createPrewarmer, canPrewarmShaders } from '../../render/prewarm.js'
import { prewarmIntro } from '../../modes/IntroCinematic.js'

// Minimum time the screen stays up, so a warm reload (module memos already
// populated, nothing left to build) does not flash a bar for two frames. It is
// also the window the bar is PACED against — see _ceiling().
const MIN_MS = 1200
// Hard ceiling. A slow machine gets into the game with some work unfinished
// rather than staring at a stuck bar forever; whatever did not get warmed
// compiles lazily at the cut exactly as it did before, and IntroPrewarm.ensure()
// fills in any shot the queue never reached. A late shader beats a dead loader.
const MAX_MS = 8000
// Work handed to the prewarmers per frame. One indivisible unit — a single
// MeshPhysicalMaterial variant link — can overrun this and no scheduler can
// subdivide it, but this stops several from bunching into one frame.
//
// Why 20 and not the prewarmers' default 10: this is a DOM screen, and the
// budget is a duty cycle. The rest of the frame costs ~8 ms here, so a 10 ms
// budget spends barely half the wall clock on work — 3 s of real work would
// take 6 s of loading screen, and MAX_MS would cut off half of it. At 20 ms the
// screen runs ~35 fps and roughly 70% of every second goes into the work, so
// substantially more of the reel is warmed before the ceiling. Nothing on
// screen suffers: the bar has `transition: width .12s steps(4)`, the ticker
// changes every 340 ms, and the logo throb is a compositor transform.
const BUDGET_MS = 20
// How the two phases split the bar. Phase 1 builds the geometry AND generates
// the procedural surfaces (concrete 346 ms, marble 232, skin-elephant 226 per
// kind), so it is the larger half; phase 2 is the twelve program links plus
// whatever is left in the texture queue. An authored estimate, not a timer —
// each phase contributes its own real completed fraction, this only decides
// how much of the bar each one owns.
const BUILD_SHARE = 0.7

const TICKER_LINES = [
  'Inflating token supply…',
  'Bribing validators…',
  'Downloading more RAM…',
  'Wash-trading the leaderboard…',
  'Minting fighters as JPEGs…',
  'Leveraging the ragdolls 125x…',
  'Shorting the loading bar…',
  'Waking up the interns…',
  'Rendering diamond hands…',
]

export class LoadingScreen {
  constructor(game) { this.game = game }

  enter() {
    this.done = false
    this.progress = 0        // what the bar shows (chunky follower)
    this.real = 0            // what the prewarmers have actually finished
    this.leapIn = 0
    this.startedAt = performance.now()
    this.warmDone = false
    this.warmStarted = false
    this.introPre = null
    this.shaderPre = null
    this.shaderProgress = 0
    this.canCompile = false
    this.tickerIndex = Math.floor(Math.random() * TICKER_LINES.length)
    this.nextTickerAt = 0

    // Only warm the intro when the intro is where we are actually going. The
    // condition is character-for-character the one _finish() uses, and nothing
    // between here and there can flip it. On every later boot this screen goes
    // to the title, and building all eleven cinematic shots (76 queue steps) for
    // a reel nobody is about to watch would turn a 1.2 s boot into an
    // eight-second one, and hold the whole reel in VRAM, for nothing.
    this.wantIntro = !this.game.save.get('introSeen', false) && this.game.screens.screens.has('intro')
    if (!this.wantIntro) {
      // Nothing to wait on, so "all the work" is done before we start. real = 1
      // hands the bar to the MIN_MS pacing term in _ceiling(), which fills it
      // chunkily over 1.2 s instead of leaving it at 0% and then snapping.
      this.warmDone = true
      this.real = 1
    }

    this.root = el('div', 'wcs-screen wcs-loading')
    this.root.innerHTML = `
      <div class="load-logo">${GameConfig.title}</div>
      <div class="load-sub">${GameConfig.subtitle}</div>
      <div class="load-bar"><div class="load-bar-fill"></div></div>
      <div class="load-pct">0%</div>
      <div class="load-ticker"></div>
      <div class="load-hint">${touchUI(this.game) ? 'TAP TO SKIP (NOBODY EVER WAITS)' : 'PRESS ANY KEY TO SKIP (NOBODY EVER WAITS)'}</div>
    `
    this.game.ui.appendChild(this.root)
    this.fillEl = this.root.querySelector('.load-bar-fill')
    this.pctEl = this.root.querySelector('.load-pct')
    this.tickerEl = this.root.querySelector('.load-ticker')

    this._onKey = () => this._finish()
    this._onClick = () => this._finish()
    addEventListener('keydown', this._onKey)
    this.root.addEventListener('pointerdown', this._onClick)
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    // A player mashing a key to skip must never wait for us. The intro queue is
    // module-level and idempotent, so its partial progress is deliberately KEPT
    // — IntroScreen picks the same queue back up and only pays for what we did
    // not reach. Only the shader pass, which owns nothing, is abandoned.
    try { this.shaderPre?.cancel() } catch (err) { /* nothing to salvage */ }
    this.shaderPre = null
    this.root?.remove()
    this.root = null
  }

  _finish() {
    if (this.done) return
    this.done = true
    // first boot plays the intro cinematic once; every boot after that goes
    // straight to the title. The flag is set NOW so a mid-intro refresh never
    // loops the player back into it. Settings → REPLAY INTRO re-enters it (v2.1).
    if (!this.game.save.get('introSeen', false) && this.game.screens.screens.has('intro')) {
      this.game.save.set('introSeen', true)
      this.game.screens.goto('intro')
    } else {
      this.game.screens.goto('title')
    }
  }

  // ---------------------------------------------------------------- prewarm --

  // Deferred to the first render() because that is where the renderer is handed
  // to us, and a shader prewarmer without a renderer cannot link anything.
  _startWarm(renderer) {
    this.warmStarted = true
    // Cached once, so the two phases and the progress split can never disagree
    // about whether phase 2 is going to happen.
    this.canCompile = canPrewarmShaders(renderer)
    try {
      this.introPre = prewarmIntro(this.game)
    } catch (err) {
      console.warn('[loading] intro prewarm unavailable — the cinematic will build at its cuts', err)
      this.introPre = null
      this.warmDone = true
    }
  }

  // One slice of real work. Never allowed to throw into the frame loop: a
  // prewarmer that dies is a missed optimisation, not a broken boot.
  _stepWarm(renderer) {
    // PHASE 1 — build the shots. IntroPrewarm.run(ms) spends up to `ms` on its
    // own queue and reports whether work remains.
    if (this.introPre && !this.introPre.done) {
      try {
        this.introPre.run(BUDGET_MS)
      } catch (err) {
        console.warn('[loading] intro prewarm step threw — skipping the rest of the build', err)
        this.introPre = null
      }
      this._publish()
      return
    }

    // PHASE 2 — drain the surfaces phase 1 queued and link the programs for the
    // scenes it built. Constructed only now: the scenes did not exist before.
    if (!this.shaderPre) {
      if (!this.canCompile || !this.introPre) { this.warmDone = true; this._publish(); return }
      try {
        this.shaderPre = createPrewarmer(renderer, {
          camera: this.introPre.camera,
          scenes: this.introPre.scenes,
          budgetMs: BUDGET_MS,
        })
      } catch (err) {
        console.warn('[loading] shader prewarm unavailable — programs will link at the cuts', err)
        this.warmDone = true
        this._publish()
        return
      }
    }
    try {
      const s = this.shaderPre.step(BUDGET_MS)
      this.shaderProgress = s.progress
      if (s.done) this.warmDone = true
    } catch (err) {
      console.warn('[loading] shader prewarm step threw — entering anyway', err)
      this.warmDone = true
    }
    this._publish()
  }

  // Fold both phases into one monotonic 0..1. Monotonic matters: a bar that
  // goes backwards reads as a bug even when the number is more truthful.
  _publish() {
    const build = this.introPre ? (this.introPre.progress || 0) : 1
    const share = this.canCompile ? BUILD_SHARE : 1
    const next = this.warmDone ? 1 : Math.min(1, build * share + this.shaderProgress * (1 - share))
    if (next > this.real) this.real = next
  }

  // -------------------------------------------------------------- rendering --
  // ScreenManager.render() runs exactly once per rAF frame, whereas update()
  // runs once per FIXED step and can be called up to five times in one frame
  // while the accumulator catches up. The work has to be stepped per FRAME or a
  // catch-up burst would spend 5x the budget in a single frame — which is the
  // stutter this whole change exists to remove. So the slices run here, and the
  // bar is drawn from update().
  //
  // Nothing is drawn to the canvas: .wcs-loading is a full-bleed opaque DOM
  // screen, so anything the prewarmers render while compiling stays hidden.
  render(renderer, dt) {
    if (this.done) return
    if (!this.warmStarted) this._startWarm(renderer)
    if (!this.warmDone) this._stepWarm(renderer)
  }

  update(dt) {
    if (this.done) return

    // Everything here is timed off the WALL CLOCK, not off accumulated dt. `dt`
    // is the fixed step and update() can be called five times for one frame
    // while the accumulator catches up, so a dt total drifts a long way behind
    // real time exactly when the work is heaviest. `dt` is still used for the
    // bar's leap cadence, where relative pacing is all that matters.
    const elapsed = performance.now() - this.startedAt

    // Chunky arcade follower. What it chases is real work completed — the bar
    // can never claim more than the prewarmers have actually finished — but it
    // gets there in random leaps rather than a smooth slide, which is what made
    // the old fake bar feel like a coin-op instead of a download.
    const ceiling = this._ceiling(elapsed)
    const gap = ceiling - this.progress
    if (gap > 0) {
      this.leapIn -= dt
      if (this.leapIn <= 0) {
        this.leapIn = 0.05 + Math.random() * 0.13
        this.progress += Math.min(gap, (Math.random() < 0.35 ? 0.13 : 0.03) + gap * 0.4)
      }
    }
    const pct = Math.floor(Math.min(1, Math.max(0, this.progress)) * 100)
    this.fillEl.style.width = pct + '%'
    this.pctEl.textContent = pct + '%'

    // The ticker runs on wall-clock time. Fixed-step dt drifts a long way
    // behind whenever a single unsplittable shader link eats a frame, and a
    // ticker that stalls with it would advertise the hitch.
    if (elapsed / 1000 >= this.nextTickerAt) {
      this.nextTickerAt = elapsed / 1000 + 0.34
      this.tickerIndex = (this.tickerIndex + 1) % TICKER_LINES.length
      this.tickerEl.textContent = TICKER_LINES[this.tickerIndex]
    }

    if (!this.warmDone && elapsed >= MAX_MS) {
      const shots = this.introPre ? `${this.introPre.shotsReady}/${this.introPre.shotCount} shots` : 'no intro queue'
      console.warn(`[loading] prewarm ceiling hit at ${MAX_MS} ms (${Math.round(this.real * 100)}%, ${shots}) — entering anyway`)
      this.warmDone = true
    }
    if (this.warmDone && elapsed >= MIN_MS) {
      this.fillEl.style.width = '100%'
      this.pctEl.textContent = '100%'
      this._finish()
    }
  }

  // The bar's ceiling. Normally just the real fraction. The elapsed/MIN_MS term
  // only bites on a warm reload where there is nothing left to do: without it
  // the bar would snap to 100% and then sit there for a second waiting out the
  // minimum display time. It can only ever hold the bar BACK — never push it
  // past work that has not actually happened.
  _ceiling(elapsed) {
    return Math.min(this.real, elapsed / MIN_MS)
  }
}
