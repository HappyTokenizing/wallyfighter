import * as THREE from 'three'
import { GameConfig } from '../config/GameConfig.js'
import { EventBus } from './EventBus.js'
import { SaveManager } from './SaveManager.js'
import { InputManager } from './InputManager.js'
import { AudioEngine } from './AudioEngine.js'
import { ScreenManager } from './ScreenManager.js'
import { registerScreens } from '../ui/registerScreens.js'

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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.shadowMap.enabled = this.quality.shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(this.renderer.domElement)

    this.input = new InputManager(this.config, this.save, this.events)
    this.audio = new AudioEngine(this.save)
    this.screens = new ScreenManager(this)

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight)
      this.events.emit('resize', { w: innerWidth, h: innerHeight })
    })

    this._installErrorOverlay()
    this._installDebugMeter()
  }

  setQuality(name) {
    if (!GameConfig.quality[name]) return
    this.qualityName = name
    this.quality = GameConfig.quality[name]
    this.save.set('settings.quality', name)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio))
    this.renderer.shadowMap.enabled = this.quality.shadows
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
      try { this.screens.render(this.renderer) } catch (e) { console.error('[game] render threw', e) }
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
      div.textContent = `${this._fpsFrames * 2} fps | ${this.screens.name} | q:${this.qualityName}`
      this._fpsFrames = 0
    }, 500)
  }
}
