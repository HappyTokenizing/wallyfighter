// FightRecorder — full-fight video capture (CONTRACTS §28).
//
// Records the shared game canvas (game.renderer.domElement) for the WHOLE
// match: starts on 'match:start', stops on 'match:end', via
// MediaRecorder(canvas.captureStream(30)) at ~2.5 Mbps. VIDEO ONLY — no audio
// track: capturing game sound would mean splicing a MediaStreamAudioDestination
// into AudioEngine's channel graph (the audio module's turf) and syncing two
// stream clocks; deliberately skipped.
//
// Keeps ONLY the last fight: when a new recording starts, the previous blob is
// dropped and its object URL revoked. The result is published as
//
//   game.fightRecording = {
//     available,                       // bool — a finished recording exists
//     blob, url,                       // WebM Blob + object URL (null until then)
//     durationSec, truncated,          // wall-clock length; hit the 6-min cap?
//     mimeType,
//     download(filename = 'wally-fight.webm'),   // anchor-click save; -> bool
//   }
//
// ONE stable object, mutated in place — UI code may capture the reference once
// (results screen + ReplayUI both read it).
//
// Edge handling:
// - unsupported browser (no MediaRecorder / captureStream): wiring is inert,
//   `available` stays false forever, UI hides its buttons.
// - hidden tab / pause: the recorder keeps running; canvas frames simply stop
//   arriving while rAF is throttled and resume with the game. Fine.
// - mid-match quit (no 'match:end' ever fires): ReplayManager's teardown hooks
//   call onMatchTeardown() → stop + keep the partial recording.
// - runaway matches: past MAX_SECONDS (6 min ≈ 110 MB at this bitrate) the
//   recording stops gracefully and the result is marked `truncated`.
//
// Wiring: ReplayManager.start() calls wireFightRecorder(game) (idempotent), so
// any match that builds the replay recorder also records video. main.js MAY
// also call wireFightRecorder(game) once at boot — same singleton either way.

const VIDEO_BPS = 2.5e6
const CAPTURE_FPS = 30
const MAX_SECONDS = 360           // 6 min hard cap → stop + mark truncated
const CHUNK_MS = 1000             // timeslice: steady dataavailable cadence
const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

export function recorderSupported() {
  return typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

// vp9 -> vp8 -> container default ('' lets the browser pick).
export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return ''
  for (const m of MIME_CANDIDATES) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* jsdom etc. */ }
  }
  return ''
}

export class FightRecorder {
  constructor(game) {
    this.game = game
    this.supported = recorderSupported()
    this._rec = null              // active MediaRecorder (null between fights)
    this._stream = null
    this._chunks = null           // array shared with the active rec's handlers
    this._mime = ''
    this._startedAt = 0
    this._truncated = false
    this._capTimer = 0
    this._offs = []
    this._disposed = false

    const self = this
    this.recording = {
      available: false,
      blob: null,
      url: null,
      durationSec: 0,
      truncated: false,
      mimeType: '',
      download(filename = 'wally-fight.webm') { return self.download(filename) },
    }
    game.fightRecording = this.recording

    const ev = game?.events
    if (this.supported && ev?.on) {
      this._offs.push(ev.on('match:start', () => {
        try { this._begin() } catch (e) { console.warn('[replay] fight recorder start threw', e) }
      }))
      this._offs.push(ev.on('match:end', () => {
        try { this._finalize() } catch (e) { console.warn('[replay] fight recorder stop threw', e) }
      }))
    }
  }

  isRecording() { return !!this._rec }

  // ---------------------------------------------------------------- capture

  _begin() {
    if (this._disposed || !this.supported) return
    // Defensive: a match:start with a recorder still live (teardown hook was
    // missed somehow) — that footage belongs to a dead fight; drop it.
    if (this._rec) this._abort()
    const canvas = this.game?.renderer?.domElement
    if (!canvas || typeof canvas.captureStream !== 'function') return
    const mime = pickMimeType()
    let stream, rec
    try {
      stream = canvas.captureStream(CAPTURE_FPS)
      rec = new MediaRecorder(stream, mime
        ? { mimeType: mime, videoBitsPerSecond: VIDEO_BPS }
        : { videoBitsPerSecond: VIDEO_BPS })
    } catch (e) {
      console.warn('[replay] fight recorder init failed', e)
      try { stream?.getTracks?.().forEach((t) => t.stop()) } catch { /* fine */ }
      return
    }
    // Local chunk array captured by the handlers: late dataavailable events
    // (between stop() and onstop) keep landing in THIS fight's chunks even
    // after the instance fields move on.
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
    // A recorder error mid-fight: salvage what's buffered as a partial.
    rec.onerror = (e) => { console.warn('[replay] fight recorder error', e); this._finalize() }
    try { rec.start(CHUNK_MS) } catch (e) {
      console.warn('[replay] fight recorder start failed', e)
      try { stream.getTracks().forEach((t) => t.stop()) } catch { /* fine */ }
      return
    }
    // Recording is live — NOW the previous fight gives up its seat (§28: keep
    // only the last fight; also frees ~tens of MB before the new one grows).
    this._discard()
    this._rec = rec
    this._stream = stream
    this._chunks = chunks
    this._mime = mime
    this._truncated = false
    this._startedAt = performance.now()
    clearTimeout(this._capTimer)
    this._capTimer = setTimeout(() => {
      this._truncated = true
      try { this._finalize() } catch { /* recorder already gone */ }
    }, MAX_SECONDS * 1000)
  }

  // Stop the active recording and publish it (match:end, mid-match teardown,
  // the 6-min cap, and recorder errors all funnel here). No-op when idle.
  _finalize() {
    const rec = this._rec
    if (!rec) return
    this._rec = null
    this._stream = null
    clearTimeout(this._capTimer)
    this._capTimer = 0
    const chunks = this._chunks
    this._chunks = null
    const mime = this._mime
    const durationSec = (performance.now() - this._startedAt) / 1000
    const truncated = this._truncated
    const stream = rec.stream
    rec.onerror = null
    rec.onstop = () => {
      try { stream?.getTracks?.().forEach((t) => t.stop()) } catch { /* fine */ }
      this._publish(chunks, mime, durationSec, truncated)
    }
    let stopped = false
    try {
      if (rec.state !== 'inactive') { rec.stop(); stopped = true }
    } catch { /* already dead */ }
    if (!stopped) {
      // stop() refused (already inactive — error path): publish what we have.
      rec.onstop = null
      try { stream?.getTracks?.().forEach((t) => t.stop()) } catch { /* fine */ }
      this._publish(chunks, mime, durationSec, truncated)
    }
  }

  // Drop the active recording without publishing (defensive re-entry, dispose).
  _abort() {
    const rec = this._rec
    this._rec = null
    this._chunks = null
    clearTimeout(this._capTimer)
    this._capTimer = 0
    const stream = this._stream
    this._stream = null
    if (rec) {
      rec.ondataavailable = null
      rec.onerror = null
      rec.onstop = null
      try { if (rec.state !== 'inactive') rec.stop() } catch { /* fine */ }
    }
    try { stream?.getTracks?.().forEach((t) => t.stop()) } catch { /* fine */ }
  }

  // ---------------------------------------------------------------- results

  _discard() {
    const r = this.recording
    if (r.url) { try { URL.revokeObjectURL(r.url) } catch { /* fine */ } }
    r.available = false
    r.blob = null
    r.url = null
    r.durationSec = 0
    r.truncated = false
    r.mimeType = ''
  }

  _publish(chunks, mime, durationSec, truncated) {
    if (this._disposed) return
    this._discard() // revoke whatever a previous fight left behind
    if (!chunks || !chunks.length) return
    let blob
    try { blob = new Blob(chunks, { type: mime || 'video/webm' }) } catch { return }
    if (!blob.size) return
    const r = this.recording
    r.blob = blob
    try { r.url = URL.createObjectURL(blob) } catch { r.url = null }
    r.durationSec = Math.max(0, Math.round(durationSec * 10) / 10)
    r.truncated = !!truncated
    r.mimeType = blob.type || mime || 'video/webm'
    r.available = true
  }

  download(filename = 'wally-fight.webm') {
    const r = this.recording
    if (!r.available || !r.url) return false
    try {
      const a = document.createElement('a')
      a.href = r.url
      a.download = typeof filename === 'string' && filename ? filename : 'wally-fight.webm'
      document.body.appendChild(a)
      a.click()
      a.remove()
      return true
    } catch (e) {
      console.warn('[replay] fight download failed', e)
      return false
    }
  }

  // -------------------------------------------------------------- lifecycle

  // Match visuals are going away (MatchScreen exit). After a normal match this
  // is a no-op ('match:end' already stopped us); on a mid-match quit it stops
  // the recorder and KEEPS the partial fight.
  onMatchTeardown() {
    if (this._rec) this._finalize()
  }

  dispose() {
    if (this._disposed) return
    this._abort()
    this._disposed = true // after abort; before URL cleanup
    for (const off of this._offs) { try { off() } catch { /* fine */ } }
    this._offs = []
    this._discard()
    if (this.game?.fightRecording === this.recording) this.game.fightRecording = null
    if (this.game?.__fightRecorder === this) this.game.__fightRecorder = null
    this.game = null
  }
}

// Idempotent game-lifetime singleton. Called by ReplayManager.start() every
// match (cheap after the first) — and safe for main.js to call once at boot.
export function wireFightRecorder(game) {
  if (!game) return null
  if (game.__fightRecorder && !game.__fightRecorder._disposed) return game.__fightRecorder
  const rec = new FightRecorder(game)
  game.__fightRecorder = rec
  return rec
}
