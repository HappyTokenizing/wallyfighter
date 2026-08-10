import * as THREE from 'three'
import { GameConfig } from '../config/GameConfig.js'
import { EventBus } from './EventBus.js'
import { SaveManager } from './SaveManager.js'
import { InputManager } from './InputManager.js'
import { AudioEngine } from './AudioEngine.js'
import { ScreenManager } from './ScreenManager.js'
import { registerScreens } from '../ui/registerScreens.js'
import {
  RenderPipeline, applyShadowSettings, setTextureQuality, setMaterialQuality,
  resetRenderFallback, renderStats,
} from '../render/index.js'

export class Game {
  constructor(mount, uiRoot) {
    this.config = GameConfig
    this.events = new EventBus()
    this.save = new SaveManager('wally-crypto-smackdown')
    // Mobile: touch devices default to low quality (user choice always wins).
    this.isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0
    this.qualityName = this.save.get('settings.quality', this.isTouch ? 'low' : 'high')
    this.quality = GameConfig.quality[this.qualityName] || GameConfig.quality.high
    this.ui = uiRoot
    this.frame = 0

    // ?cap=1 — visual-QA capture mode (see tools/shot-sink.js + DRIVER.md).
    // Keeps the drawing buffer alive so window.__shot() can read the framebuffer
    // back as a PNG. Off by default: it costs a little bandwidth every frame.
    this.captureMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('cap')

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.captureMode,
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio))
    this.renderer.setSize(innerWidth, innerHeight)
    // TONE MAPPING IS THE PIPELINE'S. Pipeline.js tonemaps inside its GRADE pass
    // when the composer is live (and forces NoToneMapping on the renderer), and
    // switches the renderer to ACESFilmic when it is not. Setting
    // renderer.toneMapping here would double-tonemap the frame. Only the output
    // colour space and the shadow map are ours.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    applyShadowSettings(this.renderer, this.quality)
    mount.appendChild(this.renderer.domElement)

    // Texture/material budgets must be set BEFORE anything builds a scene —
    // they are read at generation time and do not retro-fit live materials.
    this._applyRenderQuality()

    // GRAPHICS_CONTRACT §8: the one post-processing stack, owned here and
    // reached by every screen through renderScene(). Defensive: a pipeline that
    // fails to construct leaves this.pipeline null and renderScene() falls back
    // to a plain renderer.render(), so the game still draws.
    this.pipeline = null
    try {
      this.pipeline = new RenderPipeline(this.renderer, this.quality)
    } catch (e) {
      console.warn('[game] RenderPipeline construction failed — running without post', e)
    }
    // Lets a bare WebGLRenderer reach the pipeline (renderScene accepts either).
    this.renderer.__wcsPipeline = this.pipeline

    this.input = new InputManager(this.config, this.save, this.events)
    this.audio = new AudioEngine(this.save)
    this.screens = new ScreenManager(this)

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight)
      try { this.pipeline?.setSize(innerWidth, innerHeight) } catch (e) { console.warn('[game] pipeline resize threw', e) }
      this.events.emit('resize', { w: innerWidth, h: innerHeight })
    })

    this._installErrorOverlay()
    this._installDebugMeter()
    if (this.captureMode) this._installCaptureRig()
  }

  // -------------------------------------------------------------------------
  // Visual-QA rig (?cap=1). Gives verification agents a stable, documented API
  // so they don't have to paste driver snippets: manual time-stepping (the tab
  // often reports visibilityState:hidden, which freezes rAF) plus framebuffer
  // capture straight to disk through the dev server's shot sink.
  // -------------------------------------------------------------------------
  _installCaptureRig() {
    const errs = []
    addEventListener('error', (e) => errs.push(`ERR ${String(e.message).slice(0, 160)}`))
    addEventListener('unhandledrejection', (e) => errs.push(`REJ ${String(e.reason?.message || e.reason).slice(0, 160)}`))
    const origError = console.error.bind(console)
    console.error = (...a) => { errs.push('CONSOLE ' + a.map(String).join(' ').slice(0, 160)); origError(...a) }

    window.__errs = errs
    window.__game = this

    // The QA tab is frequently not laid out (innerWidth 0 while hidden), which
    // leaves the canvas at 0x0 and every capture blank. Pin a deterministic
    // viewport instead of trusting the window, and keep captures at 1x so the
    // PNGs stay small enough to review quickly.
    window.__viewport = (w = 1600, h = 900, pixelRatio = 1) => {
      this.renderer.setPixelRatio(pixelRatio)
      this.renderer.setSize(w, h, false)
      this.renderer.domElement.style.width = w + 'px'
      this.renderer.domElement.style.height = h + 'px'
      // The composer's render targets are sized independently of the canvas —
      // without this every capture comes back at the previous resolution.
      try { this.pipeline?.setSize(w, h) } catch (e) { errs.push('viewport: ' + String(e?.message).slice(0, 150)) }
      this.events.emit('resize', { w, h })
      return { w: this.renderer.domElement.width, h: this.renderer.domElement.height, pixelRatio }
    }
    if (!innerWidth || !innerHeight) window.__viewport()

    // Advance the simulation by N fixed steps, then draw once.
    window.__step = (frames = 1) => {
      for (let i = 0; i < frames; i++) {
        this.frame++
        this.input.beginFrame()
        try { this.screens.update(this.config.fixedStep) } catch (e) { errs.push('update: ' + String(e?.message).slice(0, 150)) }
      }
      this._syncPipelineIdle()
      try { this.screens.render(this.renderer, this.config.fixedStep) } catch (e) { errs.push('render: ' + String(e?.message).slice(0, 150)) }
      return this.screens.name
    }

    // Draw once without advancing time (re-arm the framebuffer before a read-back).
    // dt 0 so the post stack does not decay an impact or re-roll the film grain
    // between the two draws that bracket a capture.
    window.__draw = () => {
      this._syncPipelineIdle()
      try { this.screens.render(this.renderer, 0) } catch (e) { errs.push('render: ' + String(e?.message).slice(0, 150)) }
      return this.screens.name
    }

    // Post-stack introspection for the verification agents: which passes are
    // actually live, and what the procedural caches cost.
    window.__render = () => {
      let stats = null
      try { stats = renderStats() } catch (e) { stats = { error: String(e?.message) } }
      return { pipeline: this.pipeline ? this.pipeline.stats() : null, quality: this.qualityName, caches: stats }
    }

    // Capture the current framebuffer to .shots/<name>.png. Returns a small
    // JSON-able result — never the image bytes (they must not enter an agent's
    // context; agents Read() the file instead).
    // Posting a Blob body fails with "Failed to fetch" above ~2.3 MB when driven
    // through the automation bridge, and blob.arrayBuffer() throws NotReadableError
    // there — but a 1600x900 gameplay frame is 2.4-2.6 MB, i.e. every useful shot.
    // toDataURL + base64-decode into a Uint8Array with an explicit content-type is
    // the path that survives; keep the Blob route as the fast path.
    window.__shot = async (name) => {
      window.__draw()
      const canvas = this.renderer.domElement
      const post = (body, headers) => fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body, headers })

      let bytes = 0
      let res = null
      try {
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
        if (blob && blob.size < 2_000_000) { bytes = blob.size; res = await post(blob) }
      } catch { /* fall through to the data-URL path */ }

      if (!res || !res.ok) {
        const url = canvas.toDataURL('image/png')
        const b64 = url.slice(url.indexOf(',') + 1)
        const bin = atob(b64)
        const buf = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
        bytes = buf.length
        res = await post(buf, { 'content-type': 'application/octet-stream' })
      }

      const j = await res.json().catch(() => ({}))
      return { ok: res.ok, name, w: canvas.width, h: canvas.height, bytes, ...j }
    }

    // Step then capture, in one call: window.__shotAfter('name', 120)
    window.__shotAfter = async (name, frames = 0) => {
      if (frames > 0) window.__step(frames)
      return window.__shot(name)
    }

    // Synthetic input for driving menus/fights between steps.
    window.__key = (code, ms = 60) => {
      const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code
      dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }))
      setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true })), ms)
    }

    // Jump straight into a fight. Returns the screen name.
    window.__fight = (opts = {}) => {
      const {
        p1 = 'wally', p2 = 'bonko', arena = 'bull-market-colosseum',
        aiLevel = 3, roundTime = 300, roundsToWin = 1,
      } = opts
      this.screens.goto('match', {
        mode: 'exhibition',
        p1: { charId: p1, control: 'ai', aiLevel },
        p2: { charId: p2, control: 'ai', aiLevel },
        arenaId: arena,
        rules: { roundsToWin, roundTime },
      })
      return this.screens.name
    }

    // Freeze both fighters and park the camera for a clean portrait shot.
    // `view`: 'front' | 'three-quarter' | 'side' | 'back'; dist/height in metres.
    window.__poseCam = (opts = {}) => {
      const ms = this.screens.current
      const f = ms?.fighters?.[opts.slot ?? 0]
      const cam = ms?.camera
      const obj = f?.root || f?.group || f?.model
      if (!obj || !cam) return { ok: false, error: 'not in a match (need MatchScreen with fighters)' }
      obj.updateWorldMatrix(true, false)
      const t = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld)
      // Facing: fighters always face their opponent, and that is far more reliable
      // than guessing which local axis a given rig calls "forward" (rigs disagree,
      // and the facing rotation is applied at different nodes per character).
      const fwd = new THREE.Vector3()
      const other = ms.fighters?.[(opts.slot ?? 0) === 0 ? 1 : 0]
      const otherObj = other?.root || other?.group || other?.model
      if (otherObj && !opts.useRigAxis) {
        otherObj.updateWorldMatrix(true, false)
        fwd.setFromMatrixPosition(otherObj.matrixWorld).sub(t)
      }
      if (fwd.lengthSq() < 1e-4) {
        fwd.set(1, 0, 0).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()))
      }
      fwd.y = 0
      if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0)
      fwd.normalize()
      const base = Math.atan2(fwd.z, fwd.x)
      const ang = { front: 0, 'three-quarter': Math.PI * 0.28, side: Math.PI * 0.5, back: Math.PI }[opts.view || 'three-quarter'] ?? 0
      const a = base + ang
      const dist = opts.dist ?? 4.2
      const height = opts.height ?? 1.35
      cam.position.set(t.x + Math.cos(a) * dist, t.y + height, t.z + Math.sin(a) * dist)
      cam.lookAt(t.x, t.y + (opts.lookAt ?? 1.05), t.z)
      if (opts.fov) { cam.fov = opts.fov; cam.updateProjectionMatrix() }
      // Stop the match camera controller from stealing it back next frame.
      if (ms.cam) { ms.cam.enabled = false; ms.cam.frozen = true }
      this._camLocked = true
      return { ok: true, view: opts.view || 'three-quarter', dist, target: t.toArray().map((n) => +n.toFixed(2)) }
    }

    // Freeze/unfreeze the simulation so a pose holds still across captures.
    window.__freeze = (on = true) => {
      const ms = this.screens.current
      if (ms?.fighters) for (const f of ms.fighters) { if (f) f.frozen = on }
      return { frozen: on }
    }

    console.info('[wcs] capture rig ready: __step __draw __shot __shotAfter __fight __poseCam __key __errs __render')
  }

  // The ultra tier accumulates sub-pixel-jittered frames only while the camera
  // is parked. Menus and the capture rig qualify; a live match never does.
  // (Pipeline also resets the history on any camera movement, so this is a hint,
  // not a correctness requirement.)
  _syncPipelineIdle() {
    if (!this.pipeline) return
    this.pipeline.idle = this.captureMode || this._camLocked === true || this.screens.name !== 'match'
  }

  // Push the active tier's render knobs into the foundation modules. Called at
  // construction and on every setQuality(). Textures/materials read these when
  // they GENERATE, so a tier change only affects scenes built afterwards — the
  // next match, not the one on screen. That is deliberate: rebuilding every
  // material mid-round would hitch far worse than the quality difference is
  // worth.
  _applyRenderQuality() {
    const q = this.quality || {}
    try {
      setTextureQuality({
        size: q.textureSize,
        anisotropy: q.anisotropy,
        budgetMB: q.textureBudgetMB,
      })
    } catch (e) { console.warn('[game] setTextureQuality failed', e) }
    try {
      if (q.material) setMaterialQuality(q.material)
    } catch (e) { console.warn('[game] setMaterialQuality failed', e) }
  }

  setQuality(name) {
    if (!GameConfig.quality[name]) return
    this.qualityName = name
    this.quality = GameConfig.quality[name]
    this.save.set('settings.quality', name)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio))
    applyShadowSettings(this.renderer, this.quality)
    this._applyRenderQuality()
    if (this.pipeline) {
      try {
        this.pipeline.setQuality(this.quality)
        // setQuality rebuilds the pass stack at the OLD size; re-apply the
        // current one (pixel ratio may also have just changed).
        const s = this.renderer.getSize(new THREE.Vector2())
        this.pipeline.setSize(s.x || innerWidth, s.y || innerHeight)
        // A rebuilt stack deserves a fresh chance if a previous tier's pass
        // had latched renderScene into permanent fallback.
        resetRenderFallback()
      } catch (e) { console.warn('[game] pipeline setQuality threw', e) }
    }
    this.events.emit('quality:changed', { name })
  }

  start() {
    const initial = registerScreens(this)
    this.screens.goto(initial || 'loading')

    const STEP = this.config.fixedStep
    let last = performance.now()
    let acc = 0
    const tick = (now) => {
      requestAnimationFrame(tick)
      acc += Math.min((now - last) / 1000, 0.25)
      last = now
      let steps = 0
      while (acc >= STEP && steps < 5) {
        this.frame++
        this.input.beginFrame()
        try { this.screens.update(STEP) } catch (e) { console.error('[game] update threw', e) }
        acc -= STEP
        steps++
      }
      if (steps === 5) acc = 0 // spiral-of-death guard
      // The post stack runs on the REAL frame delta, not the fixed step: grain,
      // impact decay and DoF easing are presentation, and must look identical
      // at 60, 120 and 144 Hz.
      const frameDt = Math.min(Math.max(steps, 1) * STEP, 0.1)
      this._syncPipelineIdle()
      try { this.screens.render(this.renderer, frameDt) } catch (e) { console.error('[game] render threw', e) }
      this._fpsFrames++
    }
    requestAnimationFrame(tick)
  }

  _installErrorOverlay() {
    const div = document.createElement('div')
    div.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:46vw;z-index:9999;font:11px monospace;color:#ff7b7b;background:rgba(10,0,0,.82);padding:0 6px;border-radius:4px;pointer-events:none;white-space:pre-wrap;display:none'
    document.body.appendChild(div)
    let lines = []
    const push = (msg) => {
      lines.push(String(msg).slice(0, 200))
      lines = lines.slice(-6)
      div.textContent = lines.join('\n')
      div.style.display = 'block'
    }
    addEventListener('error', (e) => push(`ERR ${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`))
    addEventListener('unhandledrejection', (e) => push(`REJ ${e.reason?.message || e.reason}`))
  }

  _installDebugMeter() {
    this._fpsFrames = 0
    const div = document.createElement('div')
    div.style.cssText = 'position:fixed;right:8px;top:8px;z-index:9999;font:12px monospace;color:#7bff9e;background:rgba(0,10,0,.7);padding:2px 6px;border-radius:4px;pointer-events:none;display:none'
    document.body.appendChild(div)
    let visible = false
    addEventListener('keydown', (e) => { if (e.code === 'F3') { visible = !visible; div.style.display = visible ? 'block' : 'none' } })
    setInterval(() => {
      if (!visible) { this._fpsFrames = 0; return }
      const post = this.pipeline ? `${this.pipeline.tier}${this.pipeline.stats().composer ? '' : '/direct'}` : 'none'
      div.textContent = `${this._fpsFrames * 2} fps | ${this.screens.name} | q:${this.qualityName} | post:${post}`
      this._fpsFrames = 0
    }, 500)
  }
}
