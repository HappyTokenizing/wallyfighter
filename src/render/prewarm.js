// ---------------------------------------------------------------------------
// src/render/prewarm.js — DO THE EXPENSIVE WORK WHILE THE BAR IS ON SCREEN.
//
// THE DEFECT THIS EXISTS FOR. Measured on the production build: the intro
// cinematic is smooth (median frame 8.3 ms, p90 9.2 ms) except at SHOT
// BOUNDARIES, where frames come in pairs of 200-4600 ms. Roughly 19.9 s of a
// ~36 s cinematic is a frozen frame. renderer.info across one replay:
//
//     programs   79 -> 83 -> 83 -> 90 -> 91      (12 shader compiles mid-play)
//     geometries 217 -> 239 -> 265 -> 269
//     textures   ~333 -> ~347
//
// So every shot builds geometry, instantiates materials and makes the driver
// link new programs ON THE MAIN THREAD WHILE THE SHOT IS PLAYING. A single
// MeshPhysicalMaterial variant is routinely hundreds of ms; procedural surface
// generation is the other half (concrete 346 ms, marble 232, skin-elephant 226,
// fur-short 182 per kind).
//
// Meanwhile src/ui/screens/LoadingScreen.js spends 1.5 s animating a bar driven
// by `Math.min(1, this.t / 1.4)` — a fake timer that waits on NOTHING. The game
// already pays for a loading screen and then does the loading later, visibly.
// This module is the thing that moves the work into the wait, and makes that
// bar mean something for the first time.
//
// WHAT IT DOES, all of it incremental and none of it blocking for long:
//
//   1. SHADERS. three r0.166 has BOTH `renderer.compile(scene, camera,
//      targetScene)` (three.module.js:29421) and `renderer.compileAsync(scene,
//      camera, targetScene)` (:29511) — verified in node_modules, not assumed.
//      We chunk the synchronous program creation object-by-object inside a time
//      budget, then use compileAsync once per scene to WAIT for the driver to
//      report the programs linked (that half is genuinely off-thread when
//      KHR_parallel_shader_compile is present).
//
//   2. TEXTURES. textures.js already has a time-sliced generator with a cache
//      (`surfaceMaps` enqueues, `pumpTextureQueue(budgetMs)` drains). We DRIVE
//      it, we do not reimplement it.
//
//   3. HONEST PROGRESS. `status()` returns { done, progress, label, unitsDone,
//      unitsTotal }. progress is monotonic and weighted by real work, and the
//      label is a short human string ("Compiling shaders 24/91").
//
//   4. YIELDING. Every `step()` takes a time budget (default 10 ms) and checks
//      the deadline between units AND inside the chunked loops. `run()` yields
//      through requestIdleCallback where available, racing a rAF/setTimeout
//      fallback so a hidden tab (DRIVER.md's capture rig) still drains.
//
//   5. CANCELLABLE + IDEMPOTENT. Module-level memos (a WeakSet of materials, a
//      Set of surface-ask keys, a Set of task keys) make warming the same thing
//      twice free, across prewarmer instances. `cancel()` abandons cleanly and
//      resolves `run()` with `{ cancelled: true }` — a player mashing a key to
//      skip must never wait for us.
//
// DEPENDENCIES: `./textures.js` and nothing else. NOT three (we only duck-type
// against the renderer), NOT the intro, NOT the loading screen — they import
// THIS. Importing either of them from here would be a cycle.
//
// USAGE
//
//   import { createPrewarmer } from '../render/index.js'
//
//   const pw = createPrewarmer(renderer, {
//     camera,
//     tasks: [                                  // arbitrary build work
//       { key: 'intro:shot3', label: 'Building shot 3', weight: 4,
//         run: () => cinematic.prebuildShot(3) },   // may return a scene/object
//     ],
//     scenes: [scene, () => cinematic.scene],   // thunks are resolved lazily
//     kinds: ['concrete', { kind: 'marble', opts: { scale: 1.4 } }],
//     sceneNames: ['settlementExpress'],        // textures.js SESSION_SCENES
//     budgetMs: 10,
//   })
//
//   // drive it from a screen's update(), one slice per frame:
//   const s = pw.step()
//   bar.style.width = (s.progress * 100).toFixed(0) + '%'
//   ticker.textContent = s.label
//   if (s.done) goto('intro')
//
//   // ...or await it, and bail the moment the player presses a key:
//   pw.run().then((s) => { if (!s.cancelled) goto('intro') })
//   onKey(() => pw.cancel())
// ---------------------------------------------------------------------------

import {
  surfaceMaps,
  pumpTextureQueue,
  textureQueueStats,
  sessionAsks,
  sceneAsks,
  surfaceKinds,
} from './textures.js'

// ---------------------------------------------------------------------------
// §0 Small helpers
// ---------------------------------------------------------------------------

const DEFAULT_BUDGET_MS = 10
const MIN_BUDGET_MS = 2
const MAX_BUDGET_MS = 40

// How long we are willing to WAIT for the driver to report programs linked
// before shrugging and moving on. Never let a loading screen hang on a vendor
// bug: compileAsync polls with setTimeout and, on a material whose program was
// dropped, can throw inside that timer and never resolve at all.
const AWAIT_LINK_MS = 4000

function now() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now()
}

function clampBudget(ms) {
  const v = Number.isFinite(ms) ? ms : DEFAULT_BUDGET_MS
  return Math.max(MIN_BUDGET_MS, Math.min(MAX_BUDGET_MS, v))
}

/** True when this renderer can create programs ahead of time. */
export function canPrewarmShaders(renderer) {
  return !!(renderer && typeof renderer.compile === 'function')
}

/** True when this renderer can also WAIT for the driver to finish linking. */
export function canPrewarmShadersAsync(renderer) {
  return !!(renderer && typeof renderer.compileAsync === 'function')
}

/**
 * prewarmSupport(renderer) -> what is actually available here.
 * Callers use this to decide whether a real progress bar is worth showing.
 */
export function prewarmSupport(renderer) {
  return {
    compile: canPrewarmShaders(renderer),
    compileAsync: canPrewarmShadersAsync(renderer),
    idle: typeof requestIdleCallback === 'function',
    raf: typeof requestAnimationFrame === 'function',
  }
}

// ---------------------------------------------------------------------------
// §1 The module-level memo — this is what makes warming twice free
// ---------------------------------------------------------------------------
//
// Deliberately module scope, not instance scope. The loading screen warms a set
// of scenes; the intro later constructs a prewarmer for the NEXT shot; the
// select screen warms fighters. None of them should redo each other's work, and
// none of them holds a reference to the others.

const _warmMaterials = typeof WeakSet === 'function' ? new WeakSet() : null
const _warmAsks = new Set()
const _warmTasks = new Set()

const _totals = { tasks: 0, asks: 0, materials: 0, compileCalls: 0, awaits: 0, ms: 0 }

/** Cumulative bookkeeping for the perf overlay / definition-of-done checks. */
export function prewarmStats() {
  return { ..._totals, asks: _warmAsks.size, tasks: _warmTasks.size }
}

/**
 * Forget everything that was warmed. Tests and the capture rig only — in a real
 * session the memo is the whole point.
 */
export function resetPrewarmMemo() {
  _warmAsks.clear()
  _warmTasks.clear()
  _totals.tasks = 0
  _totals.asks = 0
  _totals.materials = 0
  _totals.compileCalls = 0
  _totals.awaits = 0
  _totals.ms = 0
  return true
}

function materialIsWarm(mat) {
  if (!mat) return true
  if (_warmMaterials) return _warmMaterials.has(mat)
  return mat.__wcsPrewarmed === true
}

function markMaterialWarm(mat) {
  if (!mat) return
  if (_warmMaterials) _warmMaterials.add(mat)
  else mat.__wcsPrewarmed = true
  _totals.materials++
}

// ---------------------------------------------------------------------------
// §2 Surface asks — normalising what the caller wants generated
// ---------------------------------------------------------------------------

function askKey(a) {
  const o = a.opts || {}
  return [
    a.kind, o.scale ?? 1, o.wear ?? 0, o.seed ?? 0,
    o.size ?? 0, o.hero ? 1 : 0, o.joints === undefined ? 1 : o.joints,
    o.tint ?? '',
  ].join('|')
}

/**
 * normalizeAsks(spec) -> [{ kind, opts }]
 *
 * Accepts, in order of how often it gets used:
 *   'concrete'                       one kind
 *   ['concrete', 'marble']           several kinds
 *   [{ kind, opts }]                 kinds with surfaceMaps() options
 *   'session'                        textures.js SESSION_DEMAND (every dressing
 *                                    a six-arena session ever asks for)
 *   'all'                            every kind in the table, default opts
 * Unknown shapes are skipped rather than thrown — a typo in a warm list must
 * never cost a boot.
 */
export function normalizeAsks(spec) {
  if (!spec) return []
  if (spec === 'session') return sessionAsks()
  if (spec === 'all') return surfaceKinds().map((k) => ({ kind: k, opts: {} }))
  const list = Array.isArray(spec) ? spec : [spec]
  const out = []
  for (const s of list) {
    if (!s) continue
    if (typeof s === 'string') out.push({ kind: s, opts: {} })
    else if (typeof s.kind === 'string') out.push({ kind: s.kind, opts: s.opts || {} })
  }
  return out
}

/** Asks for named SESSION_SCENES entries (arena + fighter working sets). */
export function sceneNameAsks(names, withBase = true) {
  if (!names) return []
  const list = Array.isArray(names) ? names : [names]
  if (!list.length) return []
  try {
    return sceneAsks(list, withBase)
  } catch (err) {
    console.warn('[prewarm] sceneAsks() failed — skipping scene texture warm', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// §3 Scene resolution — scenes may be values, { scene, camera } or thunks
// ---------------------------------------------------------------------------

function resolveSceneEntry(entry) {
  let v = entry
  if (typeof v === 'function') v = v()
  if (!v) return null
  if (v.isObject3D || typeof v.traverse === 'function') return { root: v, camera: null, lightsFrom: null }
  if (v.scene) {
    return {
      root: v.scene,
      camera: v.camera || null,
      lightsFrom: v.lightsFrom || v.scene,
      label: v.label,
    }
  }
  return null
}

// Duck-typed stand-in for a Scene, handed to renderer.compile() as its first
// argument so we can compile a HANDFUL of objects per slice instead of a whole
// scene at once.
//
// three's compile() touches exactly four things on that argument: traverse()
// (to collect materials), traverseVisible() (only to gather lights, and only
// when scene !== targetScene), and nothing else — everything material-relevant
// (fog, environment, background) is read off `targetScene`, which we always
// pass as the REAL scene. So a batch that yields our objects from traverse()
// and no lights from traverseVisible() compiles exactly the programs the real
// scene will use. Verified against three.module.js:29421-29509.
function compileBatch(objects) {
  return {
    isObject3D: true,
    traverse(fn) { for (let i = 0; i < objects.length; i++) fn(objects[i]) },
    traverseVisible() { /* lights come from targetScene */ },
  }
}

function collectCompileTargets(root) {
  const out = []
  if (!root || typeof root.traverse !== 'function') return out
  root.traverse((obj) => {
    const m = obj && obj.material
    if (!m) return
    if (Array.isArray(m)) {
      for (let i = 0; i < m.length; i++) if (!materialIsWarm(m[i])) { out.push(obj); return }
    } else if (!materialIsWarm(m)) {
      out.push(obj)
    }
  })
  return out
}

function markObjectWarm(obj) {
  const m = obj && obj.material
  if (!m) return
  if (Array.isArray(m)) for (let i = 0; i < m.length; i++) markMaterialWarm(m[i])
  else markMaterialWarm(m)
}

// ---------------------------------------------------------------------------
// §4 Units of work
// ---------------------------------------------------------------------------
//
// A unit is `{ type, label, weight, done, frac(), run(deadline) }`.
//
//   run(deadline) does as much as it can before `now() >= deadline` and returns
//   nothing; it sets `unit.done` when finished and may set `unit.pending` to
//   mean "I am waiting on a promise, come back later but do not busy-loop".
//   frac() is 0..1 progress WITHIN the unit, so a long compile still moves the
//   bar.
//
// WEIGHTS ARE MEASURED, NOT GUESSED, because a bar whose segments do not match
// their real cost is the fake bar again with extra steps. Driving a 140-mesh
// scene plus two SESSION_SCENES working sets (≈100 surfaces) through here, the
// wall-clock split is roughly: enqueueing a surface ~0.25 units, GENERATING one
// ~3 units, compiling one material ~0.6 units. Those are the ratios below. The
// first cut had W_DRAIN as a flat 6 and the bar sat at 74-80 % for two thirds of
// the run.
//
// Order is deliberate: TASKS first (they create the objects), then texture ASKS
// (they enqueue generation for those objects' materials), then the texture
// DRAIN, then SHADER COMPILE last — compile has to see the final materials, and
// a material whose maps are still placeholders compiles the same program, so
// draining first costs nothing and keeps the compile pass honest.

const W_TASK = 4
const W_ASK = 0.25         // per ask: allocate placeholders + enqueue
const W_DRAIN = 3          // per ask: actually generate the surface
const W_COMPILE = 0.6      // per material: create the program
const W_COMPILE_MIN = 8    // a compile unit before it knows how big it is

function makeTaskUnit(pw, spec, i) {
  const key = spec.key || null
  const unit = {
    type: 'task',
    label: spec.label || `Preparing ${i + 1}`,
    weight: Number.isFinite(spec.weight) ? spec.weight : W_TASK,
    done: false,
    frac() { return this.done ? 1 : 0 },
    run() {
      if (key && _warmTasks.has(key)) { this.done = true; return }
      let out = null
      try {
        out = typeof spec.run === 'function' ? spec.run() : null
      } catch (err) {
        console.warn(`[prewarm] task "${this.label}" threw — continuing`, err)
        this.done = true
        if (key) _warmTasks.add(key)
        return
      }
      // A task may hand back a scene/object it just built, or a { scene,
      // camera } pair, or a promise for either. Anything it returns gets a
      // shader-compile unit appended, which is the whole point of letting a
      // shot pre-build itself in here.
      if (out && typeof out.then === 'function') {
        this.pending = true
        const self = this
        const settle = () => {
          self.pending = false
          self.done = true
          if (key) _warmTasks.add(key)
          _totals.tasks++
        }
        out.then((v) => { pw._adoptTaskResult(v, self.label); settle() },
          (err) => {
            console.warn(`[prewarm] task "${self.label}" rejected — continuing`, err)
            settle()
          })
        return
      }
      pw._adoptTaskResult(out, this.label)
      this.done = true
      if (key) _warmTasks.add(key)
      _totals.tasks++
    },
  }
  return unit
}

// One unit per BATCH of surface asks, not per ask: in the browser
// `surfaceMaps()` only allocates the placeholder arrays and enqueues the job
// (the expensive part is the drain), so a per-ask unit would be 140 units of
// near-zero work and a bar that sprints to 40 % and stops.
//
// IT DOES PUMP, THOUGH. Asking for all 140 dressings before draining any of
// them would allocate every placeholder field at once — a 512 px field is ~1 MB
// of albedo alone — and hand textures.js's resident LRU a peak it never has to
// carry in a real scene. So once the queue is more than QUEUE_HIGH_WATER deep
// we spend the rest of the slice draining instead of asking. Ask, drain, ask.
//
// HEADLESS CAVEAT: textures.js turns its time-slicing OFF when there is no
// requestAnimationFrame (`textureAsync()` is false in node and in the capture
// rig's stepped-time mode). There, `surfaceMaps()` generates the whole surface
// inline and one ask can cost 100-350 ms no matter what budget we hand it —
// that is the deliberate behaviour DRIVER.md wants for screenshots, not a
// regression here. In a browser the ask is ~1.5 ms and the cost lands in the
// drain unit where it can be sliced.
const QUEUE_HIGH_WATER = 8

function makeAskUnit(pw, asks) {
  return {
    type: 'ask',
    label: 'Preparing surfaces',
    weight: Math.max(1, asks.length * W_ASK),
    done: false,
    _i: 0,
    frac() { return asks.length ? this._i / asks.length : 1 },
    run(deadline) {
      while (this._i < asks.length) {
        const a = asks[this._i++]
        const k = askKey(a)
        if (!_warmAsks.has(k)) {
          _warmAsks.add(k)
          try {
            surfaceMaps(a.kind, a.opts || {})
            _totals.asks++
          } catch (err) {
            console.warn(`[prewarm] surfaceMaps("${a.kind}") failed — skipping`, err)
          }
        }
        this.label = `Generating ${a.kind}`
        if (now() >= deadline) break
        let pending = 0
        try { pending = textureQueueStats().pending } catch (e) { pending = 0 }
        if (pending > QUEUE_HIGH_WATER) {
          try { pumpTextureQueue(Math.max(1, Math.min(pw.textureBudgetMs, deadline - now()))) } catch (e) { /* drain unit will retry */ }
          break
        }
      }
      if (this._i >= asks.length) this.done = true
    },
  }
}

// Drives textures.js's own time-sliced queue. Progress is measured against the
// deepest the queue has ever been during this warm, so it only ever moves
// forward even though asks keep adding to it.
function makeDrainUnit(pw, expected = 0) {
  return {
    type: 'drain',
    label: 'Generating surfaces',
    weight: Math.max(W_DRAIN, expected * W_DRAIN),
    done: false,
    _peak: 0,
    frac() {
      if (this.done) return 1
      if (!this._peak) return 0
      const left = textureQueueStats().pending
      return Math.max(0, Math.min(1, 1 - left / this._peak))
    },
    run(deadline) {
      // A generation step is one 32-row band of a field and is INDIVISIBLE:
      // textures.js runs at least one per call and only then looks at the
      // clock, so the floor on a pump call is the cost of one band, not the
      // budget. Measured here, node, ten kinds drained end to end:
      //
      //   budget 1 ms: 238 calls, median  7.5, p90 22.2, max 43.8, total 2486
      //   budget 3 ms: 209 calls, median  8.7, p90 22.6, max 26.7, total 2373
      //   budget 5 ms: 180 calls, median 10.2, p90 23.4, max 26.4, total 2421
      //   budget 10 ms:139 calls, median 19.3, p90 24.8, max 32.0, total 2447
      //
      // Total throughput is flat across all four — the budget buys nothing but
      // the shape of the hitch — so we sit at 5, which has the best max without
      // the pointless call overhead of 1. The residual ~25 ms p90 is textures.js
      // band granularity and cannot be subdivided from out here. A caller whose
      // loading bar must stay perfectly smooth should CSS-transition its width
      // rather than expect every slice under 16 ms.
      const budget = Math.max(1, Math.min(pw ? pw.textureBudgetMs : 5, deadline - now()))
      let pending = 0
      try {
        pending = pumpTextureQueue(budget)
      } catch (err) {
        console.warn('[prewarm] pumpTextureQueue() failed — surfaces will finish on their own', err)
        this.done = true
        return
      }
      if (pending > this._peak) this._peak = pending
      if (pending <= 0) this.done = true
      else this.label = `Generating surfaces (${pending} left)`
    },
  }
}

// ---------------------------------------------------------------------------
// §5 The shader-compile unit
// ---------------------------------------------------------------------------
//
// THREE PHASES, and the split matters:
//
//   phase 1  CREATE THE PROGRAMS, a few objects at a time, through
//            `renderer.compile(batch, camera, realScene)`. This is the part
//            that must respect the budget, and the group size adapts: it
//            doubles while a group costs less than a quarter of the budget and
//            halves when one overruns, so a scene of cheap Lambert props runs
//            32 at a time and a scene of MeshPhysicalMaterial variants drops to
//            1 and overshoots by at most a single material.
//
//   phase 2  WAIT FOR THE DRIVER, through `renderer.compileAsync(scene,
//            camera)`. With KHR_parallel_shader_compile that wait is genuinely
//            off the main thread, which is the whole reason to prefer the async
//            form. Everything it re-traverses is already cached from phase 1,
//            so its own internal compile() pass is near-free.
//
//   skipped  If phase 1 found NOTHING new, we do not await at all — a re-warm
//            of an already-warm scene has to cost nothing (rule 5).
//
// LIGHTS. `renderer.compile(scene, camera, targetScene)` gathers lights from
// `targetScene` and materials from `scene`. Program variants depend on the
// light set, so compiling a detached group against no lights would build the
// WRONG programs and leave the real ones to compile mid-play — exactly the
// defect we are here to fix. Every call therefore passes the real, lit scene as
// targetScene. If you want a group warmed before it is parented, pass
// `{ scene: group, lightsFrom: realScene, camera }`.
let _warnedNoCamera = false

function makeCompileUnit(pw, entry, labelHint) {
  return {
    type: 'compile',
    label: labelHint || 'Compiling shaders',
    weight: W_COMPILE_MIN,
    done: false,
    pending: false,
    _res: null,
    _objs: null,
    _i: 0,
    _grp: 4,
    _phase: 0,
    frac() {
      if (this.done) return 1
      if (this._phase === 0 || !this._objs) return 0
      if (this._phase >= 2) return 0.95
      return this._objs.length ? (this._i / this._objs.length) * 0.95 : 0.95
    },
    run(deadline) {
      const renderer = pw.renderer
      if (!canPrewarmShaders(renderer)) { this.done = true; return }

      if (this._phase === 0) {
        let res = null
        try {
          res = resolveSceneEntry(entry)
        } catch (err) {
          console.warn('[prewarm] scene thunk threw — skipping its shader warm', err)
        }
        if (!res || !res.root) { this.done = true; return }
        this._res = res
        if (res.label) this.label = res.label
        this._objs = collectCompileTargets(res.root)
        // Now that we know how much there is, re-weight. `status()` clamps
        // progress monotonically, so a total that grows never rewinds the bar.
        this.weight = Math.max(W_COMPILE_MIN, this._objs.length * W_COMPILE)
        pw._totalsDirty = true
        this._phase = 1
        if (this._objs.length === 0) { this.done = true; return }
      }

      const cam = (this._res && this._res.camera) || pw.camera
      if (!cam) {
        if (!_warnedNoCamera) {
          _warnedNoCamera = true
          console.warn('[prewarm] no camera given — shaders cannot be pre-compiled, skipping')
        }
        this.done = true
        return
      }
      const root = this._res.root
      const lightsFrom = this._res.lightsFrom || root

      if (this._phase === 1) {
        const objs = this._objs
        while (this._i < objs.length) {
          const end = Math.min(objs.length, this._i + this._grp)
          const batch = objs.slice(this._i, end)
          const t0 = now()
          try {
            renderer.compile(compileBatch(batch), cam, lightsFrom)
            _totals.compileCalls++
          } catch (err) {
            console.warn('[prewarm] renderer.compile() failed — leaving these shaders to compile on demand', err)
            this.done = true
            return
          }
          for (let i = 0; i < batch.length; i++) markObjectWarm(batch[i])
          this._i = end
          const took = now() - t0
          if (took < pw.budgetMs * 0.25) this._grp = Math.min(32, this._grp * 2)
          else if (took > pw.budgetMs) this._grp = Math.max(1, this._grp >> 1)
          this.label = `Compiling shaders ${this._i}/${objs.length}`
          if (now() >= deadline) return
        }
        this._phase = 2
      }

      if (this._phase === 2) {
        if (this.pending) return
        if (!pw.awaitLink || !canPrewarmShadersAsync(renderer)) { this.done = true; return }
        this.label = 'Linking shaders'
        this.pending = true
        const self = this
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          self.pending = false
          self._phase = 3
          self.done = true
        }
        try {
          const p = lightsFrom && lightsFrom !== root
            ? renderer.compileAsync(root, cam, lightsFrom)
            : renderer.compileAsync(root, cam)
          _totals.awaits++
          Promise.resolve(p).then(finish, (err) => {
            console.warn('[prewarm] compileAsync() rejected — continuing', err)
            finish()
          })
        } catch (err) {
          console.warn('[prewarm] compileAsync() threw — continuing', err)
          finish()
          return
        }
        // compileAsync polls with setTimeout and can, on a material whose
        // program went away, throw INSIDE that timer — a rejection nobody can
        // catch and a promise that never settles. A loading screen may not hang
        // on that, so the wait is always bounded.
        if (typeof setTimeout === 'function') {
          const t = setTimeout(() => {
            if (!settled) console.warn('[prewarm] shader link wait timed out — continuing')
            finish()
          }, AWAIT_LINK_MS)
          if (t && typeof t.unref === 'function') t.unref()
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// §6 Yielding
// ---------------------------------------------------------------------------
//
// requestIdleCallback when it exists (and we take its `timeRemaining()` as a
// budget hint, so an idle browser gets bigger slices for free), otherwise rAF,
// and ALWAYS a setTimeout racing alongside. rAF alone is wrong for the same
// reason textures.js says it is wrong: DRIVER.md's capture rig runs with the
// tab hidden and rAF frozen, and a warm-up that only advances in rAF would
// never finish there. First one to fire wins; the loser is a no-op.

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : (v || 0) }

function scheduleSlice(cb) {
  let fired = false
  const once = (hint) => {
    if (fired) return
    fired = true
    cb(hint)
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback((d) => {
      let hint = NaN
      try { hint = d && typeof d.timeRemaining === 'function' ? d.timeRemaining() : NaN } catch (e) { hint = NaN }
      once(hint)
    }, { timeout: 32 })
  } else if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => once(NaN))
  }
  // Deliberately NOT unref'd (textures.js unrefs its own ticker, and is right
  // to — it is fire-and-forget). This timer is the only scheduler that exists
  // in node, where there is no rIC and no rAF, and an awaited `run()` that let
  // the process exit under it would resolve never.
  if (typeof setTimeout === 'function') setTimeout(() => once(NaN), 16)
}

// ---------------------------------------------------------------------------
// §7 Prewarmer
// ---------------------------------------------------------------------------

class Prewarmer {
  constructor(renderer, opts = {}) {
    this.renderer = renderer || null
    this.camera = opts.camera || null
    this.budgetMs = clampBudget(opts.budgetMs)
    // Surface generation gets a tighter sub-budget than the slice: see the note
    // in makeDrainUnit. Overridable for a harness that wants it all at once.
    this.textureBudgetMs = Math.max(1, Math.min(
      this.budgetMs,
      Number.isFinite(opts.textureBudgetMs) ? opts.textureBudgetMs : 5))
    this.awaitLink = opts.awaitLink !== false
    this.maxMs = Number.isFinite(opts.maxMs) ? opts.maxMs : Infinity
    this.onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null

    this.cancelled = false
    this.elapsedMs = 0
    this.startedAt = 0

    this._units = []
    this._cursor = 0
    this._total = 0
    this._totalsDirty = true
    this._progress = 0
    this._label = opts.label || 'Preparing…'
    this._running = null
    this._runStop = null

    // ORDER: build the objects, ask for their surfaces, drain the surface
    // queue, compile the shaders. See §4.
    const tasks = Array.isArray(opts.tasks) ? opts.tasks : (opts.tasks ? [opts.tasks] : [])
    tasks.forEach((t, i) => { if (t) this._units.push(makeTaskUnit(this, t, i)) })

    const asks = normalizeAsks(opts.kinds).concat(sceneNameAsks(opts.sceneNames, opts.withArenaBase !== false))
    if (asks.length) this._units.push(makeAskUnit(this, asks))
    if (asks.length || opts.drainTextures !== false) this._units.push(makeDrainUnit(this, asks.length))

    const scenes = Array.isArray(opts.scenes) ? opts.scenes : (opts.scenes ? [opts.scenes] : [])
    scenes.forEach((s, i) => {
      if (s) this._units.push(makeCompileUnit(this, s, scenes.length > 1 ? `Compiling shaders (${i + 1}/${scenes.length})` : null))
    })
  }

  // ---- adding work after construction -------------------------------------

  /** Append a `{ key, label, weight, run }` task. Runs before the compile pass. */
  addTask(spec) {
    if (!spec) return this
    this._units.splice(this._insertPoint('task'), 0, makeTaskUnit(this, spec, this._units.length))
    this._totalsDirty = true
    return this
  }

  /** Append surface asks (same shapes as `normalizeAsks`). */
  addKinds(spec) {
    const asks = normalizeAsks(spec)
    if (!asks.length) return this
    this._units.splice(this._insertPoint('ask'), 0, makeAskUnit(this, asks))
    if (!this._units.some((u) => u.type === 'drain' && !u.done)) {
      this._units.splice(this._insertPoint('drain'), 0, makeDrainUnit(this, asks.length))
    }
    this._totalsDirty = true
    return this
  }

  /** Append a scene / object / `{ scene, camera, lightsFrom }` / thunk to compile. */
  addScene(entry, label) {
    if (!entry) return this
    this._units.push(makeCompileUnit(this, entry, label))
    this._totalsDirty = true
    return this
  }

  // Keep the phase ordering when work arrives late: a task added during the
  // compile pass still has to run before the compile units that follow it.
  _insertPoint(type) {
    const rank = { task: 0, ask: 1, drain: 2, compile: 3 }
    const r = rank[type]
    for (let i = Math.max(0, this._cursor); i < this._units.length; i++) {
      if ((rank[this._units[i].type] ?? 3) > r) return i
    }
    return this._units.length
  }

  // A task may hand back the thing it just built; warm its shaders too.
  _adoptTaskResult(v, label) {
    if (!v) return
    const list = Array.isArray(v) ? v : [v]
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      if (item.isObject3D || item.scene) this.addScene(item, label ? `Compiling ${label}` : null)
    }
  }

  // ---- driving -------------------------------------------------------------

  /**
   * Advance one time slice. Never blocks for materially longer than `budgetMs`
   * (worst case: one extra shader variant, which no scheduler can subdivide).
   * Returns the same shape as `status()`.
   */
  step(budgetMs) {
    if (this.cancelled) return this.status()
    const budget = clampBudget(budgetMs === undefined ? this.budgetMs : budgetMs)
    const t0 = now()
    if (!this.startedAt) this.startedAt = t0
    const deadline = t0 + budget
    let guard = 0

    while (this._cursor < this._units.length) {
      if (this.cancelled) break
      const u = this._units[this._cursor]
      if (u.done) { this._cursor++; continue }
      if (u.pending) break            // waiting on a promise: yield, never spin
      try {
        u.run(deadline)
      } catch (err) {
        console.warn(`[prewarm] unit "${u.label}" threw — skipping it`, err)
        u.done = true
      }
      if (u.done) this._cursor++
      if (now() >= deadline) break
      if (++guard > 8192) break
    }

    const dt = now() - t0
    this.elapsedMs += dt
    _totals.ms += dt

    if (this.maxMs !== Infinity && this.elapsedMs >= this.maxMs && !this.isDone()) {
      console.warn(`[prewarm] hit maxMs (${this.maxMs} ms) with work left — giving up the rest`)
      this.cancelled = true
    }
    return this.status()
  }

  /**
   * Run to completion, yielding between slices. Resolves with the final
   * status; `cancelled: true` means somebody skipped. Calling it twice returns
   * the same promise.
   */
  run(opts = {}) {
    if (this._running) return this._running
    if (this.isDone() || this.cancelled) return Promise.resolve(this.status())
    const maxMs = Number.isFinite(opts.maxMs) ? opts.maxMs : this.maxMs
    const started = now()

    this._running = new Promise((resolve) => {
      let stopped = false
      const finish = () => {
        if (stopped) return
        stopped = true
        this._runStop = null
        this._running = null
        resolve(this.status())
      }
      this._runStop = finish
      const tick = (hint) => {
        if (stopped || this.cancelled) { finish(); return }
        const budget = Number.isFinite(hint) && hint > this.budgetMs
          ? clampBudget(hint)
          : this.budgetMs
        const s = this.step(budget)
        if (this.onProgress) {
          try { this.onProgress(s) } catch (err) { /* a bad listener is not our problem */ }
        }
        if (s.done || this.cancelled || (now() - started) >= maxMs) { finish(); return }
        scheduleSlice(tick)
      }
      scheduleSlice(tick)
    })
    return this._running
  }

  /** Abandon the rest. Cheap, safe to call twice, safe to call mid-slice. */
  cancel() {
    if (!this.cancelled) {
      this.cancelled = true
      this._label = 'Skipped'
    }
    if (this._runStop) this._runStop()
    return this.status()
  }

  isDone() {
    if (this._cursor >= this._units.length) return true
    for (let i = this._cursor; i < this._units.length; i++) if (!this._units[i].done) return false
    return true
  }

  _recomputeTotals() {
    if (!this._totalsDirty) return
    let t = 0
    for (const u of this._units) t += u.weight || 0
    this._total = t
    this._totalsDirty = false
  }

  /**
   * status() -> { done, progress, label, unitsDone, unitsTotal, cancelled,
   *               elapsedMs }
   *
   * `progress` is 0..1, weighted by real work and MONOTONIC — appending units
   * grows the denominator, and a bar that goes backwards reads as a bug even
   * when the number is more truthful. `label` is a short human string for the
   * ticker line.
   */
  status() {
    this._recomputeTotals()
    let doneW = 0
    let unitsDone = 0
    let current = null
    for (const u of this._units) {
      const f = u.done ? 1 : clamp01(typeof u.frac === 'function' ? u.frac() : 0)
      doneW += (u.weight || 0) * f
      if (u.done) unitsDone++
      else if (!current) current = u
    }
    const raw = this._total > 0 ? doneW / this._total : 1
    this._progress = Math.max(this._progress, clamp01(raw))
    const done = this.cancelled || !current
    if (done && !this.cancelled) this._progress = 1
    this._label = this.cancelled ? 'Skipped' : (current ? current.label : 'Ready')
    return {
      done,
      progress: this._progress,
      label: this._label,
      unitsDone,
      unitsTotal: this._units.length,
      cancelled: this.cancelled,
      // `waiting` means the head unit is parked on a promise (a driver link, an
      // async task) and step() has nothing to do until it settles. A caller
      // driving step() from a frame loop can ignore it; a caller spinning on
      // `while (!s.done) s = pw.step()` MUST yield on it or it will busy-wait.
      waiting: !!(current && current.pending),
      elapsedMs: +this.elapsedMs.toFixed(1),
    }
  }
}

// ---------------------------------------------------------------------------
// §8 Front door
// ---------------------------------------------------------------------------

/**
 * createPrewarmer(renderer, opts) -> Prewarmer
 *
 * opts:
 *   camera        THREE.Camera used for compilation (required for shaders)
 *   scenes        Scene | Object3D | { scene, camera, lightsFrom, label } |
 *                 () => any of those — or an array of them
 *   kinds         surface kinds: 'concrete' | ['concrete', {kind, opts}] |
 *                 'session' | 'all'
 *   sceneNames    names from textures.js SESSION_SCENES ('settlementExpress',
 *                 'tired-ape', …); ArenaBase is included unless
 *                 withArenaBase: false
 *   tasks         [{ key, label, weight, run() }] arbitrary build work; a task
 *                 may return the object/scene it built (or a promise for it)
 *                 and it will be shader-warmed automatically
 *   budgetMs      per-slice budget, default 10, clamped to 2..40
 *   maxMs         give up after this much accumulated work time (default none)
 *   awaitLink     false to skip the compileAsync readiness wait
 *   onProgress    called with status() after each slice of run()
 */
export function createPrewarmer(renderer, opts = {}) {
  return new Prewarmer(renderer, opts)
}

/** One-liner: warm a scene's shaders and resolve. */
export function prewarmScene(renderer, scene, camera, opts = {}) {
  return createPrewarmer(renderer, { ...opts, camera, scenes: [scene] }).run()
}

/** One-liner: warm a list of surface kinds and resolve. */
export function prewarmSurfaces(kinds, opts = {}) {
  return createPrewarmer(null, { ...opts, kinds }).run()
}

export { Prewarmer }

// ---------------------------------------------------------------------------
// §9 Self-test — node-runnable, no DOM, no renderer
//   node -e "import('./src/render/prewarm.js').then(m=>m.__selfTest({quiet:false}))"
// ---------------------------------------------------------------------------

export async function __selfTest(opts = {}) {
  const fails = []
  const check = (name, ok) => { if (!ok) fails.push(name) }

  check('normalizeAsks string', normalizeAsks('concrete').length === 1)
  check('normalizeAsks array', normalizeAsks(['concrete', { kind: 'marble', opts: { scale: 2 } }]).length === 2)
  check('normalizeAsks junk', normalizeAsks([null, 3, {}]).length === 0)
  check('normalizeAsks session', normalizeAsks('session').length > 50)
  check('sceneNameAsks', sceneNameAsks(['settlementExpress']).length > 10)
  check('support on null renderer', prewarmSupport(null).compile === false)

  // A prewarmer with no renderer must still run tasks and surfaces, and finish.
  let ran = 0
  const pw = createPrewarmer(null, {
    tasks: [{ key: 'selftest:a', label: 'Task A', run: () => { ran++ } }],
    kinds: ['paper'],
    budgetMs: 8,
  })
  const s0 = pw.status()
  check('starts at zero', s0.progress === 0 && s0.done === false)
  const s1 = await pw.run({ maxMs: 20000 })
  check('finishes', s1.done === true && s1.progress === 1)
  check('task ran', ran === 1)
  check('label reads Ready', s1.label === 'Ready')

  // Idempotent: the same task key and the same surface must not run again.
  const pw2 = createPrewarmer(null, {
    tasks: [{ key: 'selftest:a', label: 'Task A', run: () => { ran++ } }],
    kinds: ['paper'],
    budgetMs: 8,
  })
  await pw2.run({ maxMs: 20000 })
  check('task memoised', ran === 1)

  // Cancel is immediate and sticky.
  const pw3 = createPrewarmer(null, { kinds: 'all', budgetMs: 4 })
  const p3 = pw3.run()
  const c = pw3.cancel()
  check('cancel reports cancelled', c.cancelled === true && c.done === true)
  const s3 = await p3
  check('cancelled run resolves', s3.cancelled === true)

  const out = { ok: fails.length === 0, fails, stats: prewarmStats() }
  if (opts.quiet === false) console.log(out)
  return out
}
