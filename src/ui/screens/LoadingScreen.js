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
// WHAT IT IS NOW. Real work, time-sliced, with the bar reporting it:
//
//   PHASE 1  BUILD. On the first boot that is `prewarmIntro(game)` from
//            IntroCinematic.js, bounded to the first LEAD_SHOTS of the reel.
//            On every later boot it is `getBackdrop(game)` — the menu/title set,
//            which is where that boot is actually going.
//   PHASE 2  COMPILE, THEN DRAIN. createPrewarmer(renderer, …) links the shader
//            programs for whatever phase 1 built and then drains the procedural
//            surface queue phase 1 filled.
//
// ---------------------------------------------------------------------------
// v3.8 — WHY THIS SCREEN STOPPED TRYING TO DO EVERYTHING
//
// The first cut of this warmed the WHOLE reel: all eleven shots, then their
// surfaces, then their shaders. Measured on the production build, that is ~14 s
// of work. This screen had 8 s. So it spent every one of them, hit its ceiling,
// and handed the cinematic the other ~8.4 s — which the cinematic paid for in
// the only place it could, its own opening: shot 0 at 19 fps, shot 1 at 20,
// shot 2 at 61, shot 3 onward a locked 120. 180 of the reel's 188 over-33 ms
// frames were in those first three shots.
//
// TWO THINGS WERE WRONG AND BOTH ARE FIXED HERE.
//
//   1. THE WORK WAS NOT SPLITTABLE. A boot has two budgets — a few seconds
//      before the movie and thirty-six seconds during it — and the queue was
//      being asked to fit entirely in the first. It now banks a LEAD of
//      complete, compiled shots (`IntroPrewarm.runShots`) and the reel builds
//      the rest one shot ahead of its own cuts. Loading is shorter than the
//      8 s ceiling it used to hit, and the opening is not the dumping ground.
//
//   2. THE SCREEN LEFT WITH THE SURFACE QUEUE STILL DEEP, which is what
//      actually cost the opening its frame rate: textures.js drains itself on a
//      rAF heartbeat whose budget scales with queue depth (12+ pending = 20 ms
//      of generation on EVERY presented frame). Leaving is now gated on the
//      drain finishing, and prewarm.js's phases were reordered so the compile
//      pass runs BEFORE the drain rather than behind two seconds of it — the
//      old order meant the shader phase never once executed, and 95 programs
//      were still being linked during the reel.
//
// THE BAR IS NOW COMPOSITOR-DRIVEN. Phase 1's steps are indivisible — one
// character's buildModel() is 200-400 ms and no scheduler can subdivide it — so
// this screen measured ten hitches of 100-327 ms across its own 113 frames, and
// a bar animated with `width` freezes dead in every one of them, because layout
// is main-thread. The fill is now driven by `transform: translateX()` with a
// stepped CSS transition, which Chrome interpolates on the compositor: the bar
// keeps moving through a 300 ms main-thread block. A slow sheen sweep does the
// same job for the case where there is genuinely nothing new to report.
//
// WHAT IS DELIBERATELY UNCHANGED: _finish()'s first-boot logic (first boot sets
// 'introSeen' and goes to 'intro', every boot after goes to 'title'), the DOM
// structure, the CSS classes, the ticker lines, the chunky-leap pacing and the
// skip affordance.
import { el, touchUI } from '../uiKit.js'
import { GameConfig } from '../../config/GameConfig.js'
import {
  createPrewarmer, canPrewarmShaders,
  drainSurfaces, surfacesPending, SURFACE_QUEUE_QUIET,
} from '../../render/prewarm.js'
import { prewarmIntro } from '../../modes/IntroCinematic.js'
import { getBackdrop } from '../MenuBackdrop.js'

// Minimum time the screen stays up, so a warm reload (module memos already
// populated, nothing left to build) does not flash a bar for two frames. It is
// also the window the bar is PACED against — see _ceiling().
const MIN_MS = 1200
// Hard ceiling. A slow machine gets into the game with some work unfinished
// rather than staring at a stuck bar forever; whatever did not get warmed
// compiles lazily at the cut exactly as it did before, and IntroPrewarm.ensure()
// fills in any shot the queue never reached. A late shader beats a dead loader.
const MAX_MS = 9000
// Work handed to the prewarmers per frame. One indivisible unit — a single
// MeshPhysicalMaterial variant link, one character's buildModel() — can overrun
// this and no scheduler can subdivide it, but this stops several from bunching
// into one frame.
//
// Why 40 and not the prewarmers' default 10: this is a DOM screen with nothing
// on the main thread to animate, and the budget is a duty cycle. At 10 ms,
// barely half the wall clock goes into the work; at the previous 20 ms it was
// ~70%, and the measured consequence was that 8 s of screen time bought 5.6 s
// of work while the remaining 8.4 s leaked into the cinematic. At 40 ms it is
// ~87% and the screen finishes its (now narrowed) list well inside MAX_MS.
// Nothing on screen suffers, because nothing on screen depends on the main
// thread any more: the fill is a compositor transform, the sheen is a
// compositor keyframe animation, and the logo throb always was one. Only the
// percentage text and the ticker stall in a long frame, and neither is what the
// eye tracks.
const BUDGET_MS = 40
// How many shots of the reel are banked before it starts. NOT all eleven: see
// the v3.8 note at the top. Three covers ~9.6 s of playback, and the reel needs
// roughly 1.3 s of work to bank each further shot, so shot 3 is comfortably
// ready long before its cut and every shot after it has three seconds of slack.
const LEAD_SHOTS = 3
// How the two phases split the bar. Phase 1 builds geometry and enqueues the
// procedural surfaces; phase 2 links the programs and then generates those
// surfaces (concrete 346 ms, marble 232, skin-elephant 226 per kind), which is
// the bigger half of the wall clock now that it is allowed to finish. An
// authored estimate, not a timer — each phase contributes its own real
// completed fraction, this only decides how much of the bar each one owns.
const BUILD_SHARE = 0.45
// Bar animation. `steps(5)` keeps the arcade chunkiness; running it on
// `transform` instead of `width` is what keeps it moving through a 300 ms
// main-thread block.
const BAR_TRANSITION = 'transform 0.3s steps(5)'

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

// ---------------------------------------------------------------------------
// A SECOND MOVING THING, and it is not decoration.
//
// The fill can only move when there is progress to report, and phase 1's units
// are indivisible: a character's buildModel() is one 300 ms step that reports
// nothing until it lands. A screen whose only animation is tied to progress
// therefore LOOKS hung during exactly the moments it is working hardest. This
// is a slow sheen travelling across the track on a pure compositor keyframe
// animation (transform + opacity only, no layout, no paint), so it keeps moving
// through any main-thread block of any length. ui.css is not ours, so it is
// injected here, self-contained, the way IntroCinematic.js injects its
// letterbox styles.
// ---------------------------------------------------------------------------
let _styleInstalled = false
function ensureLoadingStyle() {
  if (_styleInstalled || typeof document === 'undefined') return
  _styleInstalled = true
  const style = document.createElement('style')
  style.id = 'wcs-loading-style'
  style.textContent = `
.load-bar { position: relative; }
.load-bar-sheen {
  position: absolute; top: 0; bottom: 0; left: 0; width: 22%;
  pointer-events: none; z-index: 2; will-change: transform, opacity;
  background: linear-gradient(90deg,
    rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 100%);
  animation: wcs-load-sheen 1.9s linear infinite;
}
@keyframes wcs-load-sheen {
  0%   { transform: translateX(-120%); opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translateX(560%); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .load-bar-sheen { animation: none; opacity: 0; } }
`
  document.head.appendChild(style)
}

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
    this.buildProgress = 0
    this.canCompile = false
    this.backdrop = null
    this.backdropBuilt = false
    this.shownPct = -1
    this.tickerIndex = Math.floor(Math.random() * TICKER_LINES.length)
    this.nextTickerAt = 0

    // WHERE THIS BOOT IS GOING, decided once. The condition is
    // character-for-character the one _finish() uses, and nothing between here
    // and there can flip it.
    //
    // v3.8: the `else` branch is no longer "nothing to do". On every boot after
    // the first this screen hands off to the TITLE, and TitleScreen.enter()
    // calls getBackdrop() — a ~1.5 s build of the whole Permanent Reserve set
    // plus every program it needs, measured as the single worst frame in the
    // session at 1526 ms. That is exactly the kind of work this screen exists
    // to absorb, and it is the same trick applied to the other exit: the boot
    // that skips the reel warms the screen it is actually about to show.
    //
    // On the intro path the backdrop is deliberately NOT built here — the reel
    // has thirty-six seconds of idle time to do it in (see §THE HANDOFF in
    // IntroCinematic.js), and holding the menu set resident through the whole
    // cinematic on top of eleven shot scenes is memory nobody needs to spend.
    this.wantIntro = !this.game.save.get('introSeen', false) && this.game.screens.screens.has('intro')

    ensureLoadingStyle()
    this.root = el('div', 'wcs-screen wcs-loading')
    this.root.innerHTML = `
      <div class="load-logo">${GameConfig.title}</div>
      <div class="load-sub">${GameConfig.subtitle}</div>
      <div class="load-bar"><div class="load-bar-fill"></div><div class="load-bar-sheen"></div></div>
      <div class="load-pct">0%</div>
      <div class="load-ticker"></div>
      <div class="load-hint">${touchUI(this.game) ? 'TAP TO SKIP (NOBODY EVER WAITS)' : 'PRESS ANY KEY TO SKIP (NOBODY EVER WAITS)'}</div>
    `
    this.game.ui.appendChild(this.root)
    this.fillEl = this.root.querySelector('.load-bar-fill')
    this.pctEl = this.root.querySelector('.load-pct')
    this.tickerEl = this.root.querySelector('.load-ticker')

    // THE FILL, MOVED OFF THE MAIN THREAD. ui.css sizes this element with
    // `width` and transitions that width; width is layout, layout is main
    // thread, and this screen's whole job is to occupy the main thread with
    // 100-330 ms indivisible build steps. So the element is pinned to the full
    // width of its (overflow:hidden) track and slid into view with translateX
    // instead: `-100%` is empty, `0%` is full, every value between is exactly
    // the same fill it was before, and Chrome runs the interpolation on the
    // compositor — so the bar keeps stepping forward through a frame where
    // nothing else can. The diagonal hatching travels with the fill rather than
    // stretching, which is if anything more arcade than it was.
    if (this.fillEl) {
      this.fillEl.style.width = '100%'
      this.fillEl.style.willChange = 'transform'
      this.fillEl.style.transform = 'translateX(-100%)'
      // Applied a frame later so the initial -100% is not itself animated from
      // the CSS default of 0 — otherwise every boot opens with the bar
      // draining from full.
      requestAnimationFrame(() => {
        if (this.fillEl) this.fillEl.style.transition = BAR_TRANSITION
      })
    }

    this._onKey = () => this._finish()
    this._onClick = () => this._finish()
    addEventListener('keydown', this._onKey)
    // 'click', not 'pointerdown' — see TitleScreen. Skipping on pointerdown
    // mounted the next screen mid-gesture and handed it the click, so one tap
    // could skip the loading screen AND blow straight through the title behind
    // it. The click lands on the element that was there for the whole gesture.
    this.root.addEventListener('click', this._onClick)
  }

  exit() {
    removeEventListener('keydown', this._onKey)
    // A player mashing a key to skip must never wait for us. The intro queue is
    // module-level and idempotent, so its partial progress is deliberately KEPT
    // — IntroScreen picks the same queue back up and only pays for what we did
    // not reach. Only the shader pass, which owns nothing, is abandoned.
    try { this.shaderPre?.cancel() } catch (err) { /* nothing to salvage */ }
    this.shaderPre = null
    // The menu set is a module singleton owned by MenuBackdrop.js; we only ever
    // held a reference so phase 2 could compile it. Dropping it here is
    // bookkeeping, not a free.
    this.backdrop = null
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
    // Cached once, for the ceiling diagnostic. Phase 2 is constructed either
    // way now — a renderer that cannot compile still leaves a surface queue
    // that has to be drained before we hand over.
    this.canCompile = canPrewarmShaders(renderer)
    if (!this.wantIntro) return
    try {
      this.introPre = prewarmIntro(this.game)
    } catch (err) {
      console.warn('[loading] intro prewarm unavailable — the cinematic will build at its cuts', err)
      this.introPre = null
    }
  }

  // PHASE 1 for the intro path: bank LEAD_SHOTS complete shots and stop. Not
  // the whole reel — see the v3.8 note at the top of the file.
  _stepBuildIntro() {
    if (!this.introPre) return false
    if (this.introPre.disposed) { this.introPre = null; return false }
    if (this.introPre.shotsPending(LEAD_SHOTS) <= 0) return false
    try {
      this.introPre.runShots(LEAD_SHOTS, BUDGET_MS)
    } catch (err) {
      console.warn('[loading] intro prewarm step threw — skipping the rest of the build', err)
      this.introPre = null
      return false
    }
    return this.introPre.shotsPending(LEAD_SHOTS) > 0
  }

  // PHASE 1 for the title path: build the set the title screen is about to ask
  // for. One indivisible call into another module's constructor — there is no
  // seam inside it — but a 1.5 s block behind an animated bar is a loading
  // screen doing its job, and the same 1.5 s in TitleScreen.enter() is the
  // worst frame in the session.
  //
  // It runs on the FIRST render frame, deliberately, before this screen has
  // been painted. There is no fine-grained progress to report from inside
  // another module's constructor, so a bar that waited for it would sit at 0%
  // for the better part of a second — and the honest alternative to a stuck bar
  // is not a faked one, it is putting the block where a boot is already blank.
  // The frame after this one paints the screen with the bar already at its
  // phase-1 share, and everything from there on is reported for real.
  _stepBuildTitle() {
    if (this.backdropBuilt) return false
    this.backdropBuilt = true
    try {
      this.backdrop = getBackdrop(this.game)
    } catch (err) {
      console.warn('[loading] title backdrop prewarm failed — the title will build itself', err)
      this.backdrop = null
    }
    return true
  }

  // The scenes phase 2 should compile, whichever path we are on.
  _warmScenes() {
    if (this.wantIntro) return this.introPre ? this.introPre.scenes : []
    const bd = this.backdrop
    if (!bd || !bd.scene) return []
    return [{ scene: bd.scene, camera: bd.camera || null, label: 'Opening the vault…' }]
  }

  _warmCamera() {
    if (this.wantIntro) return this.introPre ? this.introPre.camera : null
    return this.backdrop ? (this.backdrop.camera || null) : null
  }

  // One slice of real work. Never allowed to throw into the frame loop: a
  // prewarmer that dies is a missed optimisation, not a broken boot.
  _stepWarm(renderer) {
    // PHASE 1 — build. One `return` per frame: a phase-1 step is the largest
    // indivisible unit on this screen and there is no sense stacking a compile
    // pass behind one in the same frame.
    if (this.wantIntro ? this._stepBuildIntro() : this._stepBuildTitle()) {
      this._publish()
      return
    }

    // PHASE 2 — link the programs for what phase 1 built, then drain the
    // procedural surfaces it enqueued. That order is prewarm.js's, and it was
    // the other way round until v3.8; the note in its §4 explains why a warm-up
    // that runs out of time must drop the drain and never the compile.
    //
    // Constructed only now: the scenes did not exist before. It is created even
    // when the renderer cannot compile, because the DRAIN still has to happen —
    // leaving this screen with a deep surface queue is what cost the cinematic's
    // opening its frame rate, and that is true whether or not shaders warmed.
    if (!this.shaderPre) {
      const scenes = this._warmScenes()
      try {
        this.shaderPre = createPrewarmer(renderer, {
          camera: this._warmCamera(),
          scenes,
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
      // Belt and braces on the one condition that actually mattered: never hand
      // the next screen a queue deep enough for textures.js to widen its own
      // per-frame budget (12+ pending = 20 ms of generation on every presented
      // frame, which is precisely what made shots 0-1 of the reel run at 19 fps).
      // The prewarmer's drain unit normally takes it to zero; if it gave up —
      // a pump that threw, a cancelled sub-unit — finish the job by hand rather
      // than declaring victory or sitting here until the ceiling.
      if (s.done) {
        if (surfacesPending() < SURFACE_QUEUE_QUIET) this.warmDone = true
        else drainSurfaces(BUDGET_MS)
      }
    } catch (err) {
      console.warn('[loading] shader prewarm step threw — entering anyway', err)
      this.warmDone = true
    }
    this._publish()
  }

  // Fold both phases into one monotonic 0..1. Monotonic matters: a bar that
  // goes backwards reads as a bug even when the number is more truthful.
  _publish() {
    let build = 1
    if (this.wantIntro) build = this.introPre ? this.introPre.shotsProgress(LEAD_SHOTS) : 1
    else build = this.backdropBuilt ? 1 : 0
    if (build > this.buildProgress) this.buildProgress = build
    const next = this.warmDone
      ? 1
      : Math.min(1, this.buildProgress * BUILD_SHARE + this.shaderProgress * (1 - BUILD_SHARE))
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
    if (pct !== this.shownPct) {
      this.shownPct = pct
      // translateX, not width: see the note where the element is set up. The
      // element is exactly as wide as its clipping track, so -(100-pct)% puts
      // its right edge at pct% and the compositor keeps stepping toward that
      // target even while the main thread is inside a 300 ms build.
      this.fillEl.style.transform = `translateX(${pct - 100}%)`
      this.pctEl.textContent = pct + '%'
    }

    // The ticker runs on wall-clock time. Fixed-step dt drifts a long way
    // behind whenever a single unsplittable shader link eats a frame, and a
    // ticker that stalls with it would advertise the hitch.
    if (elapsed / 1000 >= this.nextTickerAt) {
      this.nextTickerAt = elapsed / 1000 + 0.34
      this.tickerIndex = (this.tickerIndex + 1) % TICKER_LINES.length
      this.tickerEl.textContent = TICKER_LINES[this.tickerIndex]
    }

    if (!this.warmDone && elapsed >= MAX_MS) {
      const shots = this.introPre
        ? `${this.introPre.shotsReady}/${LEAD_SHOTS} lead shots`
        : (this.wantIntro ? 'no intro queue' : 'title set')
      console.warn(`[loading] prewarm ceiling hit at ${MAX_MS} ms (${Math.round(this.real * 100)}%, ${shots}, `
        + `${surfacesPending()} surfaces pending, compile ${this.canCompile ? 'on' : 'off'}) — entering anyway`)
      this.warmDone = true
    }
    if (this.warmDone && elapsed >= MIN_MS) {
      this.shownPct = 100
      this.fillEl.style.transform = 'translateX(0%)'
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
