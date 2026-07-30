// Central game configuration. The title/subtitle and all tunables live here so the
// whole presentation can be re-branded from one file.
export const GameConfig = {
  title: 'WALLY: CRYPTO SMACKDOWN',
  subtitle: '10 FIGHTERS. 1 RESERVE. TOTAL CHAOS.',
  version: '2.1.0', // keep in sync with package.json

  fixedStep: 1 / 60,
  gravity: -22,

  // v2.1: 5-minute round cap; a typical evenly-matched round should run 3-4 min.
  rules: { roundsToWin: 2, roundTime: 300 },

  // v2.1 global economy knobs (combat applies): more health, slightly softer hits.
  balance: { maxHpScale: 1.6, damageScale: 0.85 },

  // Comedy physics presets — scale knockback, restitution and angular chaos.
  physicsPresets: {
    standard: { name: 'Standard', knockback: 1.0, bounce: 0.3, spin: 1.0, debris: 1.0 },
    silly: { name: 'Silly', knockback: 1.6, bounce: 0.55, spin: 1.7, debris: 1.5 },
    unhinged: { name: 'Unhinged', knockback: 2.6, bounce: 0.8, spin: 2.6, debris: 2.5 },
  },

  // 'none' | 'cartoon' | 'max'  (damage visual style)
  gore: 'cartoon',

  quality: {
    low: { name: 'Low', pixelRatio: 1, shadows: false, shadowSize: 512, crowd: 24, maxDebris: 20, particleScale: 0.4, propLimit: 12, reflections: false },
    medium: { name: 'Medium', pixelRatio: 1.5, shadows: true, shadowSize: 1024, crowd: 60, maxDebris: 45, particleScale: 0.75, propLimit: 24, reflections: false },
    high: { name: 'High', pixelRatio: 2, shadows: true, shadowSize: 2048, crowd: 120, maxDebris: 90, particleScale: 1, propLimit: 40, reflections: true },
  },

  controls: {
    // v2.0 free-roam scheme: WASD moves on the arena floor (camera-relative),
    // Space jumps, Shift blocks, C crouches.
    p1: {
      left: 'KeyA', right: 'KeyD', fwd: 'KeyW', back: 'KeyS',
      jump: 'Space', crouch: 'KeyC',
      light: 'KeyJ', heavy: 'KeyK', kick: 'KeyL', grab: 'KeyU',
      special: 'KeyI', super: 'KeyO', block: 'ShiftLeft', item: 'KeyE',
    },
    // Legacy P2 bindings (training dummy / debug only — CPU controls P2 in play).
    p2: {
      left: 'ArrowLeft', right: 'ArrowRight', fwd: 'ArrowUp', back: 'ArrowDown',
      jump: 'Numpad8', crouch: 'Numpad9',
      light: 'Numpad1', heavy: 'Numpad2', kick: 'Numpad3', grab: 'Numpad4',
      special: 'Numpad5', super: 'Numpad6', block: 'Numpad0', item: 'Numpad7',
    },
  },
}
