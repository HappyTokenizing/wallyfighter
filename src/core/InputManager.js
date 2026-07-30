// Keyboard + gamepad input for two players, with per-fixed-frame edge detection and
// a rolling press buffer for combo detection. See CONTRACTS.md §3.
const ACTIONS = ['left', 'right', 'fwd', 'back', 'jump', 'crouch', 'light', 'heavy', 'kick', 'grab', 'special', 'super', 'block', 'item']
const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'KeyJ', 'Space'], back: ['Escape', 'KeyK', 'Backspace'],
}
// v2.0 brawler pad map: stick/dpad=move A(0)=jump X(2)=light Y(3)=heavy B(1)=kick
// LB(4)=block LT(6)=grab RB(5)=special RT(7)=super Select(8)=item
const PAD_BUTTONS = { jump: [0], light: [2], heavy: [3], kick: [1], block: [4], grab: [6], special: [5], super: [7], item: [8] }
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'])

export class InputManager {
  constructor(config, save, events) {
    this.events = events
    this.bindings = [
      { ...config.controls.p1, ...save.get('controls.p1', {}) },
      { ...config.controls.p2, ...save.get('controls.p2', {}) },
    ]
    this.frame = 0
    this.codesDown = new Set()
    this._keyPressQueue = []
    this.down = [{}, {}]
    this.edge = [{}, {}]
    this.buffers = [[], []]
    this.pads = [-1, -1]            // gamepad indices assigned to players
    this._menuEdge = {}
    this._padPrev = [{}, {}]
    this._pausePrev = false

    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault()
      if (!e.repeat) { this._keyPressQueue.push(e.code); this.codesDown.add(e.code) }
      this.events.emit('input:any')
    })
    addEventListener('keyup', (e) => this.codesDown.delete(e.code))
    addEventListener('blur', () => this.codesDown.clear())
    addEventListener('gamepadconnected', (e) => {
      if (this.pads[0] === -1) this.pads[0] = e.gamepad.index
      else if (this.pads[1] === -1 && this.pads[0] !== e.gamepad.index) this.pads[1] = e.gamepad.index
      console.info('[input] gamepad assigned', e.gamepad.id)
    })
    addEventListener('gamepaddisconnected', (e) => {
      this.pads = this.pads.map((i) => (i === e.gamepad.index ? -1 : i))
    })
  }

  // Called once per fixed frame by Game — computes edges, polls pads, fills buffers.
  beginFrame() {
    this.frame++
    const pressQueue = this._keyPressQueue
    this._keyPressQueue = []
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    let pause = this.codesDown.has('Escape')

    for (let p = 0; p < 2; p++) {
      const bind = this.bindings[p]
      const pad = this.pads[p] >= 0 ? pads[this.pads[p]] : null
      const down = {}
      const edge = {}
      for (const action of ACTIONS) {
        let d = this.codesDown.has(bind[action])
        let e = pressQueue.includes(bind[action])
        if (pad) {
          if (action === 'left') d = d || pad.axes[0] < -0.4 || pad.buttons[14]?.pressed
          else if (action === 'right') d = d || pad.axes[0] > 0.4 || pad.buttons[15]?.pressed
          else if (action === 'fwd') d = d || pad.axes[1] < -0.4 || pad.buttons[12]?.pressed
          else if (action === 'back') d = d || pad.axes[1] > 0.4 || pad.buttons[13]?.pressed
          else for (const b of PAD_BUTTONS[action] || []) d = d || !!pad.buttons[b]?.pressed
          if (d && !this._padPrev[p][action]) e = true
          this._padPrev[p][action] = d
        }
        down[action] = d
        edge[action] = e
        if (e) {
          this.buffers[p].push({ action, frame: this.frame })
          if (this.buffers[p].length > 120) this.buffers[p].shift()
        }
      }
      this.down[p] = down
      this.edge[p] = edge
      if (pad?.buttons[9]?.pressed) pause = true
      while (this.buffers[p].length && this.buffers[p][0].frame < this.frame - 90) this.buffers[p].shift()
    }

    // Menu navigation edges (any player, any device)
    this._menuEdge = {}
    for (const [name, codes] of Object.entries(MENU_KEYS)) {
      this._menuEdge[name] = codes.some((c) => pressQueue.includes(c))
    }
    for (let p = 0; p < 2; p++) {
      if (this.edge[p].left) this._menuEdge.left = true
      if (this.edge[p].right) this._menuEdge.right = true
      if (this.edge[p].jump) this._menuEdge.up = true
      if (this.edge[p].crouch) this._menuEdge.down = true
      // v2.0: pad stick/dpad vertical (fwd/back) navigates menus — crouch has
      // no pad button, so without this a gamepad cannot move down in menus
      if (this.edge[p].fwd) this._menuEdge.up = true
      if (this.edge[p].back) this._menuEdge.down = true
      if (this.edge[p].light) this._menuEdge.confirm = true
      if (this.edge[p].heavy && this.pads[p] >= 0) this._menuEdge.back = true
    }

    if (pause && !this._pausePrev) this.events.emit('input:pause')
    this._pausePrev = pause
  }

  isDown(p, action) { return !!this.down[p]?.[action] }
  pressed(p, action) { return !!this.edge[p]?.[action] }
  buffer(p) { return this.buffers[p] }
  menuPressed(name) { return !!this._menuEdge[name] }
  padConnected(p) { return this.pads[p] >= 0 }

  axis(p) {
    let a = 0
    if (this.isDown(p, 'left')) a -= 1
    if (this.isDown(p, 'right')) a += 1
    return a
  }

  // Depth axis for free-roam movement: -1 = away from camera (back), +1 = fwd.
  axisY(p) {
    let a = 0
    if (this.isDown(p, 'fwd')) a += 1
    if (this.isDown(p, 'back')) a -= 1
    return a
  }
}
