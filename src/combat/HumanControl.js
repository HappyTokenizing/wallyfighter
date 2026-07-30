// Thin adapter: Fighter reads all control through this interface so human input
// (InputManager, CONTRACTS.md §3) and AI are interchangeable.
export class HumanControl {
  constructor(input, playerIndex) {
    this.input = input
    this.p = playerIndex
  }
  axis() { return this.input.axis(this.p) }
  // v2.0 (§17): depth axis for free-roam movement (+1 = fwd/W, -1 = back/S)
  axisY() { return this.input.axisY ? this.input.axisY(this.p) : 0 }
  isDown(action) { return this.input.isDown(this.p, action) }
  pressed(action) { return this.input.pressed(this.p, action) }
  buffer() { return this.input.buffer(this.p) }
  frameNum() { return this.input.frame }
  wantsDash() { return 0 }
  updateAI() {}
}
