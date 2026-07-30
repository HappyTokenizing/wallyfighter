export class ScreenManager {
  constructor(game) {
    this.game = game
    this.screens = new Map()
    this.current = null
    this.name = ''
  }

  register(name, screen) {
    screen.game = this.game
    this.screens.set(name, screen)
  }

  goto(name, params = {}) {
    const next = this.screens.get(name)
    if (!next) { console.error(`[screens] unknown screen "${name}"`); return }
    try { this.current?.exit?.() } catch (e) { console.error('[screens] exit threw', e) }
    this.name = name
    this.current = next
    // Input grace: swallow the first few frames of update so the keypress that
    // triggered this transition can't also activate something on the new screen.
    this._graceUntil = (this.game.frame || 0) + 8
    try { next.enter?.(params) } catch (e) { console.error(`[screens] enter("${name}") threw`, e) }
    this.game.events.emit('screen:changed', { name })
  }

  update(dt) {
    if (this.game.frame < this._graceUntil) return
    this.current?.update?.(dt)
  }
  render(renderer) { this.current?.render?.(renderer) }
}
