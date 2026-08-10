// ReplayUI — DOM overlays for the replay system. Two surfaces:
//   showInstantReplay(game, { onSkip })  — the auto KO replay stamps
//     ("INSTANT REPLAY" + "K.O.!" + skip hint), any-input skippable.
//   mountReplayViewer(game, container?)  — the clip-mode viewer wired onto the
//     results screen: own canvas + renderer over the preserved match scene,
//     transport bar (play/pause, scrub, speed, angle cycle), hide-UI toggle,
//     SAVE CLIP (WebM export with graceful fallback), DOWNLOAD FIGHT (§28
//     full-match video via game.fightRecording; hidden when unavailable),
//     orbit drag + wheel zoom.
//
// Styles are self-contained (injected <style>, rp- prefix). Uses ui.css vars
// with hard fallbacks so the module never depends on load order.
import * as THREE from 'three'
import { el } from '../ui/uiKit.js'
import { RenderPipeline, renderScene, resetRenderFallback } from '../render/index.js'

const STYLE_ID = 'replay-ui-css'
const SPEEDS = [0.25, 0.5, 1]
const ANGLE_LABEL = { broadcast: 'CAM: BROADCAST', orbit: 'CAM: ORBIT', closeup: 'CAM: CLOSE-UP', free: 'CAM: FREE' }

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.rp-instant, .rp-viewer {
  font-family: var(--wcs-font, Impact, 'Arial Black', sans-serif);
  -webkit-user-select: none; user-select: none;
}
.rp-instant {
  position: absolute; inset: 0; z-index: 940; pointer-events: none; overflow: hidden;
}
.rp-scanlines {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(180deg, rgba(0,0,0,0.16) 0 2px, transparent 2px 4px);
  opacity: 0.5;
}
.rp-banner {
  position: absolute; top: 7%; left: 50%; transform: translateX(-50%) rotate(-2deg);
  font-size: clamp(28px, 6vw, 72px); letter-spacing: 0.06em; white-space: nowrap;
  color: var(--wcs-gold, #ffd94a);
  -webkit-text-stroke: 2px #000;
  text-shadow: 0 0 26px rgba(255,217,74,0.5), 4px 4px 0 #4d0f68, 8px 8px 0 rgba(0,0,0,0.7);
  background: rgba(6, 4, 15, 0.55); border-radius: 10px; padding: 0.02em 0.45em 0;
  animation: rp-flash 0.9s steps(2, jump-none) infinite;
}
.rp-rec {
  position: absolute; top: 4%; right: 4%;
  font-family: var(--wcs-mono, 'Courier New', monospace); font-weight: bold;
  font-size: clamp(12px, 1.6vw, 18px); letter-spacing: 0.2em; color: #fff;
}
.rp-rec b { color: var(--wcs-red, #ff3b4d); animation: rp-flash 1s steps(2, jump-none) infinite; }
.rp-ko {
  position: absolute; top: 20%; left: 8%; transform: rotate(-8deg);
  font-size: clamp(30px, 7vw, 88px); color: var(--wcs-red, #ff3b4d);
  text-shadow: 0 0 30px rgba(255,59,77,0.55), 5px 5px 0 #2b0510, 9px 9px 0 rgba(0,0,0,0.5);
  animation: rp-slam 0.35s cubic-bezier(0.2, 2.2, 0.4, 1) both;
}
.rp-skip {
  position: absolute; bottom: 6%; left: 50%; transform: translateX(-50%);
  font-family: var(--wcs-mono, 'Courier New', monospace); font-weight: bold;
  font-size: clamp(11px, 1.5vw, 16px); letter-spacing: 0.18em; color: #cfd6ef;
  background: rgba(6,4,15,0.6); padding: 6px 14px; border: 1px solid rgba(255,217,74,0.4);
  animation: rp-flash 1.4s steps(2, jump-none) infinite;
}
.rp-stamp {
  position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%) rotate(-4deg) scale(1);
  font-size: clamp(20px, 3.6vw, 44px); color: #fff; white-space: nowrap;
  text-shadow: 3px 3px 0 rgba(0,0,0,0.65), 0 0 18px rgba(255,255,255,0.35);
  animation: rp-stamp-pop 0.7s ease-out both; pointer-events: none;
}
.rp-stamp.rp-stamp-ko { color: var(--wcs-red, #ff3b4d); font-size: clamp(34px, 8vw, 96px); }
.rp-stamp.rp-stamp-block { color: var(--wcs-blue, #3b9dff); }
@keyframes rp-flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes rp-slam { from { transform: rotate(-8deg) scale(3); opacity: 0; } to { transform: rotate(-8deg) scale(1); opacity: 1; } }
@keyframes rp-stamp-pop {
  0% { transform: translate(-50%, -50%) rotate(-4deg) scale(2.4); opacity: 0; }
  18% { transform: translate(-50%, -50%) rotate(-4deg) scale(1); opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translate(-50%, -58%) rotate(-4deg) scale(1); opacity: 0; }
}
.rp-viewer { position: absolute; inset: 0; z-index: 960; background: #06040f; }
.rp-canvas-wrap { position: absolute; inset: 0; cursor: grab; }
.rp-canvas-wrap.rp-dragging { cursor: grabbing; }
.rp-canvas-wrap canvas { width: 100%; height: 100%; display: block; }
.rp-title {
  position: absolute; top: 12px; left: 16px; pointer-events: none;
  font-size: clamp(16px, 2.4vw, 28px); letter-spacing: 0.08em;
  color: var(--wcs-gold, #ffd94a); text-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.rp-bar {
  position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
  max-width: min(94vw, 900px); padding: 8px 12px;
  background: linear-gradient(180deg, var(--wcs-panel-hi, #2c3352), var(--wcs-panel-lo, #141829));
  border: 2px solid var(--wcs-gold-deep, #c99a12); border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.55);
}
.rp-btn {
  font-family: inherit; font-size: clamp(11px, 1.3vw, 15px); letter-spacing: 0.08em;
  color: var(--wcs-gold, #ffd94a); background: rgba(6,4,15,0.55);
  border: 1px solid var(--wcs-gold-deep, #c99a12); border-radius: 4px;
  padding: 6px 10px; cursor: pointer; white-space: nowrap;
}
.rp-btn:hover { background: rgba(255,217,74,0.18); color: #fff; }
.rp-btn.rp-on { background: var(--wcs-gold, #ffd94a); color: #06040f; }
.rp-btn:disabled { opacity: 0.45; cursor: default; }
.rp-scrub { flex: 1 1 180px; min-width: 140px; accent-color: var(--wcs-gold, #ffd94a); cursor: pointer; }
.rp-time {
  font-family: var(--wcs-mono, 'Courier New', monospace); font-weight: bold;
  font-size: 12px; color: #cfd6ef; min-width: 84px; text-align: center;
}
.rp-msg {
  position: absolute; left: 50%; bottom: 86px; transform: translateX(-50%);
  font-family: var(--wcs-mono, 'Courier New', monospace); font-weight: bold;
  font-size: clamp(11px, 1.4vw, 15px); letter-spacing: 0.1em; text-align: center;
  color: var(--wcs-gold, #ffd94a); background: rgba(6,4,15,0.8);
  border: 1px solid var(--wcs-gold-deep, #c99a12); border-radius: 4px;
  padding: 8px 14px; max-width: 88vw; pointer-events: none;
}
.rp-msg.rp-err { color: var(--wcs-red, #ff3b4d); border-color: var(--wcs-red, #ff3b4d); }
.rp-show-pip {
  position: absolute; right: 14px; bottom: 14px; z-index: 2;
}
.rp-hidden-ui .rp-bar, .rp-hidden-ui .rp-title { display: none; }
.rp-toast {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 970;
  font-family: var(--wcs-font, Impact, sans-serif); font-size: clamp(16px, 2.6vw, 26px);
  letter-spacing: 0.08em; color: var(--wcs-red, #ff3b4d); text-align: center;
  background: rgba(6,4,15,0.9); border: 2px solid var(--wcs-red, #ff3b4d);
  border-radius: 6px; padding: 16px 26px; pointer-events: none;
}
`
  document.head.appendChild(s)
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec)
  const cs = Math.floor((sec - s) * 100)
  return `0:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// Pop a short-lived stamp element ("K.O.!", "14 DMG") into `root`.
function popStamp(root, stamp) {
  const node = el('div', `rp-stamp rp-stamp-${stamp.kind || 'hit'}`, stamp.text || 'HIT!')
  // small deterministic-ish scatter so rapid stamps don't perfectly overlap
  node.style.top = `${34 + Math.random() * 14}%`
  node.style.left = `${42 + Math.random() * 16}%`
  root.appendChild(node)
  setTimeout(() => node.remove(), 750)
}

// ---------------------------------------------------------------------------
// Instant replay overlay (used by MatchScreen during the auto KO replay)
// ---------------------------------------------------------------------------

export function showInstantReplay(game, { onSkip = null } = {}) {
  ensureStyles()
  const root = el('div', 'rp-instant')
  root.appendChild(el('div', 'rp-scanlines'))
  root.appendChild(el('div', 'rp-banner', '&#9666;&#9666; INSTANT REPLAY'))
  root.appendChild(el('div', 'rp-rec', 'REPLAY <b>&#9679;</b>'))
  root.appendChild(el('div', 'rp-ko', 'K.O.!'))
  root.appendChild(el('div', 'rp-skip', 'PRESS ANY BUTTON TO SKIP'))
  ;(game.ui || document.body).appendChild(root)

  let done = false
  const skip = () => {
    if (done) return
    done = true
    cleanup()
    try { onSkip?.() } catch (e) { console.error('[replay] skip handler threw', e) }
  }
  const onKey = (e) => { if (!e.repeat) skip() }
  const onPointer = () => skip()
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', onPointer, true)

  function cleanup() {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pointerdown', onPointer, true)
    root.remove()
  }

  return {
    stamp: (st) => { if (!done) popStamp(root, st) },
    hide: () => { if (!done) { done = true; cleanup() } },
  }
}

// ---------------------------------------------------------------------------
// Clip-mode viewer — mounted on demand from the results screen.
// Exact export name consumed by the ui-viral agent: mountReplayViewer.
// ---------------------------------------------------------------------------

export function mountReplayViewer(game, container = null) {
  ensureStyles()
  const parent = container || game.ui || document.body
  const replay = game.__lastReplay

  if (!replay || replay._disposed || !replay.captureAvailable() || !replay.scene || !replay.camera) {
    const toast = el('div', 'rp-toast', 'NO REPLAY DATA<br><small>FINISH A MATCH FIRST</small>')
    parent.appendChild(toast)
    setTimeout(() => toast.remove(), 1600)
    return { close() { toast.remove() } }
  }

  const root = el('div', 'rp-viewer')
  const canvasWrap = el('div', 'rp-canvas-wrap')
  root.appendChild(canvasWrap)
  root.appendChild(el('div', 'rp-title', '&#9666;&#9666; CLIP MODE'))

  // --- own renderer: never fight the results screen over the shared canvas ---
  //
  // v3.0 (GRAPHICS_CONTRACT §8): because this is a SECOND WebGLRenderer with a
  // second GL context, it cannot borrow game.pipeline — an EffectComposer's
  // render targets belong to the context that made them. So it gets its OWN
  // RenderPipeline, disposed in close() alongside the renderer.
  //
  // It is built one tier DOWN from the game's, and with DoF and motion blur
  // off. Reasons: (a) two composers alive at once double the post-processing
  // VRAM and this one is on screen while the results screen is still holding
  // the match scene, (b) the clip viewer is scrubbable and DoF/afterimage both
  // smear when you drag the timeline, (c) an orbiting free camera makes any
  // temporal accumulation useless. Grade, bloom and AA still match the match,
  // which is what makes the clip look like the same game.
  let renderer = null
  let pipeline = null
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, game.quality?.pixelRatio || 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // shadows off in the viewer: cheap, and lights were configured for the match pass
    canvasWrap.appendChild(renderer.domElement)
    try {
      const q = { ...(game.quality || {}) }
      const DOWN = { ultra: 'high', high: 'medium', medium: 'medium', low: 'low' }
      q.tier = DOWN[q.tier || 'high'] || 'medium'
      q.post = { ...(q.post || {}), dof: false, motionBlur: false, taa: false }
      pipeline = new RenderPipeline(renderer, q)
      renderer.__wcsPipeline = pipeline
    } catch (e) {
      console.warn('[replay] viewer pipeline failed — rendering without post', e)
      pipeline = null
    }
  } catch (e) {
    console.error('[replay] viewer renderer failed', e)
    const toast = el('div', 'rp-toast', 'REPLAY VIEWER UNAVAILABLE')
    parent.appendChild(toast)
    setTimeout(() => toast.remove(), 1600)
    return { close() { toast.remove() } }
  }

  // --- transport bar ---
  const bar = el('div', 'rp-bar')
  const btnPlay = el('button', 'rp-btn', '&#10074;&#10074;')
  const scrubEl = el('input', 'rp-scrub')
  scrubEl.type = 'range'
  scrubEl.min = '0'
  scrubEl.max = '1000'
  scrubEl.value = '0'
  const timeEl = el('div', 'rp-time', '0:00.00 / 0:00.00')
  const btnSpeed = el('button', 'rp-btn', '1X')
  const btnAngle = el('button', 'rp-btn', ANGLE_LABEL.orbit)
  const btnHide = el('button', 'rp-btn', 'HIDE UI')
  const btnSave = el('button', 'rp-btn', 'SAVE CLIP')
  const btnFight = el('button', 'rp-btn', 'DOWNLOAD FIGHT')
  const btnClose = el('button', 'rp-btn', 'CLOSE &#10005;')
  bar.append(btnPlay, scrubEl, timeEl, btnSpeed, btnAngle, btnHide, btnSave, btnFight, btnClose)
  // Full-fight video (§28, FightRecorder): only offered when a finished
  // recording actually exists — unsupported browsers and empty tapes hide it.
  if (!game.fightRecording?.available) btnFight.style.display = 'none'
  root.appendChild(bar)

  const pip = el('button', 'rp-btn rp-show-pip', 'SHOW UI')
  pip.style.display = 'none'
  root.appendChild(pip)

  parent.appendChild(root)

  // --- playback session ---
  // enterPlayback can refuse (another viewer's session still open, buffer
  // gone) — driving transport calls against a session we don't own would
  // corrupt the other session's live-state snapshot on close.
  if (!replay.enterPlayback({ slowmo: 1, angle: 'orbit', seconds: null })) {
    try { renderer.dispose(); renderer.forceContextLoss?.() } catch { /* fine */ }
    root.remove()
    const toast = el('div', 'rp-toast', 'REPLAY BUSY<br><small>CLOSE THE OTHER VIEWER FIRST</small>')
    parent.appendChild(toast)
    setTimeout(() => toast.remove(), 1600)
    return { close() { toast.remove() } }
  }
  replay.playing = false // open paused on the first frame; user hits play
  replay.scrub(0)
  let speedIdx = 2
  replay.setSpeed(SPEEDS[speedIdx])
  replay.onStamp = (st) => popStamp(root, st)

  let msgEl = null
  let msgTimer = 0
  function showMsg(text, err = false, ms = 3200) {
    if (msgEl) { msgEl.remove(); clearTimeout(msgTimer) }
    msgEl = el('div', `rp-msg${err ? ' rp-err' : ''}`, text)
    root.appendChild(msgEl)
    msgTimer = setTimeout(() => { msgEl?.remove(); msgEl = null }, ms)
  }

  function syncTransport() {
    btnPlay.innerHTML = replay.playing ? '&#10074;&#10074;' : '&#9654;'
    if (!scrubbing) scrubEl.value = String(Math.round(replay.progress01() * 1000))
    timeEl.textContent = `${fmtTime(replay.progress01() * replay.duration())} / ${fmtTime(replay.duration())}`
    // The full-fight blob finalizes ASYNC shortly after match:end (MediaRecorder
    // onstop) — keep the button in step in case the viewer mounted first.
    const fightReady = !!game.fightRecording?.available
    const shown = btnFight.style.display !== 'none'
    if (fightReady !== shown) btnFight.style.display = fightReady ? '' : 'none'
  }

  // --- sizing (resize-safe) ---
  function resize() {
    const w = root.clientWidth || innerWidth
    const h = root.clientHeight || innerHeight
    renderer.setSize(w, h, false)
    try { pipeline?.setSize(w, h) } catch (e) { console.warn('[replay] viewer pipeline resize threw', e) }
    const cam = replay.camera
    if (cam?.isPerspectiveCamera && h > 0) {
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
  }
  window.addEventListener('resize', resize)
  resize()

  // --- transport wiring ---
  let scrubbing = false
  btnPlay.addEventListener('click', () => { if (!replay.isExporting()) replay.playPause() })
  scrubEl.addEventListener('pointerdown', () => { scrubbing = true })
  scrubEl.addEventListener('input', () => { if (!replay.isExporting()) replay.scrub(Number(scrubEl.value) / 1000) })
  scrubEl.addEventListener('change', () => { scrubbing = false })
  btnSpeed.addEventListener('click', () => {
    if (replay.isExporting()) return
    speedIdx = (speedIdx + 1) % SPEEDS.length
    replay.setSpeed(SPEEDS[speedIdx])
    btnSpeed.textContent = `${SPEEDS[speedIdx]}X`.replace('0.', '.')
  })
  btnAngle.addEventListener('click', () => {
    if (replay.isExporting()) return
    btnAngle.textContent = ANGLE_LABEL[replay.cycleAngle()] || 'CAM'
  })
  btnHide.addEventListener('click', () => {
    root.classList.add('rp-hidden-ui')
    pip.style.display = ''
  })
  pip.addEventListener('click', () => {
    root.classList.remove('rp-hidden-ui')
    pip.style.display = 'none'
  })
  btnClose.addEventListener('click', close)

  btnSave.addEventListener('click', () => {
    if (replay.isExporting()) { replay.stopExport(true); btnSave.textContent = 'SAVE CLIP'; showMsg('RECORDING CANCELLED'); return }
    if (!replay.exportSupported()) {
      showMsg('RECORDING NOT SUPPORTED IN THIS BROWSER &mdash; USE YOUR SCREEN RECORDER (CMD+SHIFT+5)', true, 4600)
      return
    }
    const ok = replay.startExport({
      canvas: renderer.domElement,
      onDone: (out) => {
        btnSave.textContent = 'SAVE CLIP'
        if (!out) { showMsg('RECORDING FAILED &mdash; USE YOUR SCREEN RECORDER (CMD+SHIFT+5)', true, 4600); return }
        const a = document.createElement('a')
        a.href = out.url
        a.download = out.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        showMsg(`CLIP SAVED &mdash; ${(out.blob.size / (1024 * 1024)).toFixed(1)} MB WEBM`)
      },
      onError: () => {
        btnSave.textContent = 'SAVE CLIP'
        showMsg('RECORDING FAILED &mdash; USE YOUR SCREEN RECORDER (CMD+SHIFT+5)', true, 4600)
      },
    })
    if (ok) { btnSave.textContent = 'RECORDING&hellip; &#9632;'; showMsg('RECORDING CLIP &mdash; PLAYS ONCE IN REAL TIME') }
    else showMsg('RECORDING NOT SUPPORTED &mdash; USE YOUR SCREEN RECORDER (CMD+SHIFT+5)', true, 4600)
  })

  btnFight.addEventListener('click', () => {
    const fr = game.fightRecording
    if (!fr?.available) { btnFight.style.display = 'none'; return }
    if (fr.download()) {
      const mb = fr.blob?.size ? ` &mdash; ${(fr.blob.size / (1024 * 1024)).toFixed(1)} MB WEBM` : ''
      const cut = fr.truncated ? ' (TRUNCATED AT 6:00)' : ''
      showMsg(`FULL FIGHT SAVED${mb}${cut}`)
    } else {
      showMsg('FIGHT DOWNLOAD FAILED', true)
    }
  })

  // --- free-cam orbit drag + wheel zoom (switches to CAM: FREE) ---
  let drag = null
  canvasWrap.addEventListener('pointerdown', (e) => {
    if (e.target !== renderer.domElement) return
    drag = { x: e.clientX, y: e.clientY }
    canvasWrap.classList.add('rp-dragging')
    canvasWrap.setPointerCapture?.(e.pointerId)
  })
  canvasWrap.addEventListener('pointermove', (e) => {
    if (!drag) return
    if (replay.angle !== 'free') {
      // seed free cam near the current orbit so the grab doesn't jump-cut
      replay.freeCam.yaw = replay.cam?.orbit?.angle ?? replay._orbit?.ang ?? 0.5
      replay.setAngle('free')
      btnAngle.textContent = ANGLE_LABEL.free
    }
    replay.freeCam.yaw -= (e.clientX - drag.x) * 0.006
    replay.freeCam.pitch += (e.clientY - drag.y) * 0.004
    drag = { x: e.clientX, y: e.clientY }
  })
  const endDrag = () => { drag = null; canvasWrap.classList.remove('rp-dragging') }
  canvasWrap.addEventListener('pointerup', endDrag)
  canvasWrap.addEventListener('pointercancel', endDrag)
  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (replay.angle !== 'free') { replay.setAngle('free'); btnAngle.textContent = ANGLE_LABEL.free }
    replay.freeCam.dist = Math.max(2.2, Math.min(30, replay.freeCam.dist + e.deltaY * 0.012))
  }, { passive: false })

  // --- render loop (own rAF; the shared game canvas is fully covered) ---
  let raf = 0
  let last = performance.now()
  let closed = false
  function loop(now) {
    if (closed) return
    raf = requestAnimationFrame(loop)
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    try {
      replay.updatePlayback(dt)
      // `renderer`, not `game`: renderScene reads renderer.__wcsPipeline, which
      // is the viewer's own pipeline — never the game's (wrong GL context).
      renderScene(renderer, replay.scene, replay.camera, dt)
    } catch (e) {
      console.error('[replay] viewer frame threw', e)
      close()
      return
    }
    syncTransport()
  }
  raf = requestAnimationFrame(loop)

  function close() {
    if (closed) return
    closed = true
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    clearTimeout(msgTimer)
    try {
      if (replay.isExporting()) replay.stopExport(true)
      replay.onStamp = null
      replay.exitPlayback() // restores the KO pose exactly for a future reopen
    } catch (e) { console.warn('[replay] viewer close restore threw', e) }
    try {
      pipeline?.dispose()
      pipeline = null
      renderer.__wcsPipeline = null
      renderer.dispose()
      renderer.forceContextLoss?.()
    } catch { /* context already gone */ }
    // renderScene()'s "post is broken" latch is module-global. If the viewer's
    // own pipeline tripped it, the GAME's pipeline would stay disabled for the
    // rest of the session — clear it on the way out so the next match gets a
    // fresh chance.
    try { resetRenderFallback() } catch { /* fine */ }
    root.remove()
  }

  return { close }
}
