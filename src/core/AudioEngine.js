// Web Audio shell: channel gains + delegation to the procedural AudioLibrary.
// The AudioContext is created/resumed only after a user gesture (autoplay policy).
export class AudioEngine {
  constructor(save) {
    this.save = save
    this.ctx = null
    this.channels = {}
    this.library = null
    this._inited = false
    this.volumes = save.get('settings.volumes', { master: 0.8, music: 0.55, sfx: 0.9, announcer: 0.9, crowd: 0.5 })
    const unlock = () => this.ensure()
    addEventListener('pointerdown', unlock, { passive: true })
    addEventListener('keydown', unlock)
    this._warnIfMutedBoot()
  }

  // v2.0 P2: a save persisted with the whole mix at 0 boots the game fully
  // silent with no in-game hint — indistinguishable from broken audio. Surface
  // a one-time toast so the player knows it's a settings state, not a bug.
  _warnIfMutedBoot() {
    const v = this.volumes || {}
    const silent = !(v.master > 0) ||
      ['music', 'sfx', 'announcer', 'crowd'].every((ch) => !((v[ch] ?? 1) > 0))
    if (!silent || typeof document === 'undefined') return
    console.warn('[audio] saved mix is fully muted — game boots silent (settings.volumes); showing AUDIO MUTED toast')
    const show = () => {
      try {
        const host = document.getElementById('ui-root') || document.body
        if (!host) return
        const el = document.createElement('div')
        el.textContent = 'AUDIO MUTED — CHECK SETTINGS ▸ AUDIO'
        el.style.cssText =
          'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;' +
          'background:rgba(16,16,26,0.92);color:#ffd94a;border:2px solid #ffd94a;' +
          'border-radius:6px;padding:9px 20px;letter-spacing:1.5px;pointer-events:none;' +
          "font:700 15px/1.2 Impact,'Arial Black',Haettenschweiler,'Franklin Gothic Bold',sans-serif;" +
          'opacity:0;transition:opacity .4s'
        host.appendChild(el)
        requestAnimationFrame(() => { el.style.opacity = '1' })
        setTimeout(() => {
          el.style.opacity = '0'
          setTimeout(() => el.remove(), 600)
        }, 6500)
      } catch { /* toast is best-effort — never break boot */ }
    }
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', show, { once: true })
    else show()
  }

  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        const master = this.ctx.createGain()
        master.connect(this.ctx.destination)
        this.channels = { master }
        for (const ch of ['music', 'sfx', 'announcer', 'crowd']) {
          const g = this.ctx.createGain()
          g.connect(master)
          this.channels[ch] = g
        }
        this._applyVolumes()
      }
      // resume() is async — on mobile the FIRST gesture often finds the context
      // still 'suspended' synchronously, so finish init when the promise lands.
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => this._finishInit()).catch(() => {})
      }
      this._finishInit()
    } catch (e) { console.warn('[audio] ensure failed', e) }
  }

  _finishInit() {
    if (this._inited || !this.ctx || this.ctx.state === 'suspended') return
    this._inited = true
    try { this.library?.init?.(this) } catch (e) { console.warn('[audio] library init failed', e) }
    // Replay the last music request that arrived before the context unlocked —
    // without this, mobile's intro (requested pre-gesture) plays silence.
    if (this._lastMusicReq) this._call('music', this._lastMusicReq)
  }

  installLibrary(lib) { this.library = lib }

  sfx(name, opts) { this._call('sfx', name, opts) }
  music(trackId) { this._lastMusicReq = trackId; this._call('music', trackId) }
  stopMusic() { this._lastMusicReq = null; this._call('stopMusic') }
  announcer(line) { this._call('announcer', line) }
  crowd(mood) { this._call('crowd', mood) }

  _call(fn, ...args) {
    if (!this.ctx || !this.library) return
    try { this.library[fn]?.(this, ...args) } catch (e) { console.warn(`[audio] ${fn} failed`, e) }
  }

  setVolume(channel, v) {
    this.volumes[channel] = v
    this.save.set('settings.volumes', this.volumes)
    this._applyVolumes()
  }

  getVolume(channel) { return this.volumes[channel] ?? 1 }

  _applyVolumes() {
    if (!this.ctx) return
    for (const [ch, gain] of Object.entries(this.channels)) {
      gain.gain.value = this.volumes[ch] ?? 1
    }
  }
}
