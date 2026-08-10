// Central game configuration. The title/subtitle and all tunables live here so the
// whole presentation can be re-branded from one file.
export const GameConfig = {
  title: 'WALLY: CRYPTO SMACKDOWN',
  subtitle: '10 FIGHTERS. 1 RESERVE. TOTAL CHAOS.',
  version: '3.0.0', // keep in sync with package.json

  fixedStep: 1 / 60,
  gravity: -22,

  // v3.1: the target is a ~3:00 MATCH, not a 3:00 round. Best-of-3 resolves in
  // 2-3 rounds (2.5 average), so the round median has to sit near 1:00. The cap
  // is 2:30 — the slowest round measured across the harness sweep was 1:36, so
  // it has headroom without letting a stalled round blow the match budget.
  rules: { roundsToWin: 2, roundTime: 150 },

  // v3.1 global economy knobs (combat applies).
  // §24: tuned against the AI-vs-AI duration harness (node src/combat/harness.js
  // --duration --hp X --dmg Y). v2.1's 2.8/0.5 measured a 3:16 round median,
  // i.e. an 8-minute match. Measured sweep at level 3: 2.8/0.5 -> 3:16,
  // 1.6/0.85 -> 1:10, 1.5/0.85 -> 1:00, 1.3/1.0 -> 0:50, 1.1/1.1 -> 0:32.
  // 1.5/0.85 gives 1:00 x ~2.5 rounds plus round transitions = a ~3:00 match.
  balance: { maxHpScale: 1.5, damageScale: 0.85 },

  // Comedy physics presets — scale knockback, restitution and angular chaos.
  physicsPresets: {
    standard: { name: 'Standard', knockback: 1.0, bounce: 0.3, spin: 1.0, debris: 1.0 },
    silly: { name: 'Silly', knockback: 1.6, bounce: 0.55, spin: 1.7, debris: 1.5 },
    unhinged: { name: 'Unhinged', knockback: 2.6, bounce: 0.8, spin: 2.6, debris: 2.5 },
  },

  // 'none' | 'cartoon' | 'max'  (damage visual style)
  gore: 'cartoon',

  // -------------------------------------------------------------------------
  // Quality tiers — GRAPHICS_CONTRACT.md §8.
  //
  // Every key that existed before v3.0 keeps its exact meaning (name,
  // pixelRatio, shadows, shadowSize, crowd, maxDebris, particleScale,
  // propLimit, reflections) so gameplay/arena/VFX code that reads them is
  // untouched. The render layer adds:
  //
  //   tier            which RenderPipeline pass stack to build (Pipeline.js
  //                   also accepts `name`, but that is the display label, so
  //                   `tier` is the authoritative one).
  //   shadowType      'pcf' (PCFSoftShadowMap, the default) | 'vsm'.
  //   post            per-pass overrides handed to RenderPipeline; anything
  //                   omitted keeps the tier default.
  //   textureSize     procedural PBR map resolution (textures.js).
  //   anisotropy      aniso for those maps.
  //   textureBudgetMB soft ceiling before textures.js degrades new map sets.
  //   envResolution   PMREM cube resolution per mood (env.js).
  //   material        materials.js quality gates. `physical:false` demotes
  //                   every sheen/clearcoat/transmission preset to its flat
  //                   fallback — that is the single biggest fragment-shader
  //                   saving available, so low/medium turn it off.
  //
  // Budget note: one 512 map set is ~3.6 MB of GPU memory, so `high`'s 80 MB
  // ceiling is about 22 distinct surface kinds in a match scene.
  // -------------------------------------------------------------------------
  quality: {
    low: {
      name: 'Low', tier: 'low',
      pixelRatio: 1, shadows: false, shadowSize: 512, shadowType: 'pcf',
      crowd: 24, maxDebris: 20, particleScale: 0.4, propLimit: 12, reflections: false,
      textureSize: 256, anisotropy: 1, textureBudgetMB: 24, envResolution: 128,
      // `low` is a hard pass-through: no composer at all (Pipeline tier matrix).
      post: { ao: false, bloom: false, dof: false, motionBlur: false, aa: false, grain: 0 },
      material: { physical: false, transmission: false, maps: true, ao: false, envMapIntensity: 0.9, hero: false },
    },
    medium: {
      name: 'Medium', tier: 'medium',
      pixelRatio: 1.5, shadows: true, shadowSize: 1024, shadowType: 'pcf',
      crowd: 60, maxDebris: 45, particleScale: 0.75, propLimit: 24, reflections: false,
      textureSize: 256, anisotropy: 4, textureBudgetMB: 48, envResolution: 128,
      post: { ao: false, bloom: true, dof: false, motionBlur: false, aa: true, grain: 0.018 },
      material: { physical: false, transmission: false, maps: true, ao: true, envMapIntensity: 1, hero: false },
    },
    high: {
      name: 'High', tier: 'high',
      pixelRatio: 2, shadows: true, shadowSize: 2048, shadowType: 'pcf',
      crowd: 120, maxDebris: 90, particleScale: 1, propLimit: 40, reflections: true,
      textureSize: 512, anisotropy: 8, textureBudgetMB: 80, envResolution: 256,
      post: { ao: true, bloom: true, dof: true, motionBlur: true, aa: true, grain: 0.026 },
      material: { physical: true, transmission: true, maps: true, ao: true, envMapIntensity: 1, hero: false },
    },
    ultra: {
      name: 'Ultra', tier: 'ultra',
      pixelRatio: 2, shadows: true, shadowSize: 4096, shadowType: 'pcf',
      crowd: 160, maxDebris: 140, particleScale: 1.2, propLimit: 56, reflections: true,
      // Deliberately NOT 1024 textures: `hero` map sets are 4x the memory and
      // the 80 MB ceiling is per scene, not per surface. Ultra buys its quality
      // with full-res GTAO, 4x MSAA, idle TAA accumulation and 4k shadows.
      textureSize: 512, anisotropy: 16, textureBudgetMB: 128, envResolution: 512,
      post: { ao: true, bloom: true, dof: true, motionBlur: true, aa: true, grain: 0.026, taa: true },
      material: { physical: true, transmission: true, maps: true, ao: true, envMapIntensity: 1, hero: false },
    },
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
