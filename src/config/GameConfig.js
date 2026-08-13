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
  //
  // -------------------------------------------------------------------------
  // WHAT `pixelRatio` ACTUALLY BUYS — ROUND 13, read before raising it again.
  //
  // `pixelRatio` here feeds ONE line: Game.js does
  //     renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.pixelRatio))
  // so it sizes the CANVAS drawbuffer. It does NOT size the render. On every
  // tier above `low` the composer is live and Pipeline._postPixelRatio() runs
  // the whole chain at
  //     min(renderer.getPixelRatio(), TIERS[tier].renderScale)
  // — and TIERS.medium.renderScale and TIERS.high.renderScale are both 1.0
  // (round 12 dropped high from 1.25). min(2, 1.0) === min(1, 1.0) === 1.0.
  //
  // Consequence, and it is exact rather than a guess: at a 1920x1080 CSS
  // viewport, `high` renders the scene, GTAO, bloom, bokeh, SMAA and the grade
  // at 1920x1080 whether pixelRatio is 1 or 2. The ONLY thing pixelRatio 2
  // changed was the final OutputPass blit — it upsampled that same 1920x1080
  // image into a 3840x2160 default framebuffer (8.3 Mpx, and multisampled,
  // because Game.js asks for `antialias: true`). Four times the present-path
  // fill and an MSAA resolve, to display pixels that carry no extra detail:
  // the source image is 1080p either way, and dropping to pixelRatio 1 simply
  // moves the same upscale from a fragment shader to the window compositor,
  // which does it for free. The HUD is DOM + 2D canvases, so it stays crisp
  // regardless. Nothing in the frame is softer.
  //
  // COUPLING — the trap. pixelRatio is now the CEILING on renderScale. If a
  // later round restores TIERS.high.renderScale to 1.25 or 1.5 for edge
  // quality, this MUST go back up to at least that value or the supersample
  // silently will not happen (min() takes the smaller). `ultra` keeps
  // pixelRatio 2 for exactly that reason: its renderScale is 1.5, so it needs
  // a 2x canvas to reach 2880x1620. Ultra is the tier that supersamples.
  //
  // WHAT THE TIER CLAIMS. `high` targets 60 fps at a 1920x1080 CSS viewport on
  // an M-series laptop, and the budget is spent on pipeline.stats().postPixels
  // (2.07 Mpx), not on canvasPixels. Quote postPixels when you measure it —
  // a 1080p-CSS/pr2 measurement and a 1080p-CSS/pr1 measurement were both
  // called "1080p high" by different verifiers and they are not the same
  // configuration on the present path. See BACKLOG.md "ROUND 13 — the disputed
  // 1080p number" for the full reconciliation.
  //
  // -------------------------------------------------------------------------
  // ROUND 15 — WHAT THE FRAME IS ACTUALLY BOUND BY. Read this before spending
  // another round on either fill or draw calls; it retires two earlier
  // conclusions and it retires them for a reason that is now removed.
  //
  // ROUND 14 CONCLUDED: "performance is CPU/draw-submission bound, not
  // fill-bound", from a resolution sweep on one scene —
  //     1.44 Mpx -> 41.4 ms | 1.56 Mpx -> 44.6 ms | 2.07 Mpx -> 35.7 ms
  // — where cutting 30% of the pixels did not help. That measurement was
  // correct and its conclusion was correct FOR THAT BUILD. The reason it did
  // not scale with pixels is that the frame was spending most of its CPU on
  // work that has nothing to do with pixels: the shadow map was being
  // rasterised TWICE per displayed frame, because GTAOPass's normal prepass
  // calls renderer.render() on the same scene and three rebuilds the shadow
  // map on every renderer.render(). Pipeline.js `_suppressShadowsIn()` removes
  // the duplicate. See its header for the mechanism.
  //
  // MEASURED AFTER THAT FIX. permanent-reserve-core, tier `high`, real Chrome
  // (?prof=1, never ?cap=1), CSS viewport = drawbuffer, renderScale 1.0,
  // composer render+gtao+bloom+grade+smaa+output, steady-state match frames:
  //
  //   postPixels           frame median      CPU in pipeline.render()
  //   0.92 Mpx (1280x720)      9.0 ms                7.4 ms
  //   2.07 Mpx (1920x1080)    12.6 ms                4.3 ms
  //   3.69 Mpx (2560x1440)    20.3 ms                4.5 ms
  //
  // Frame time is now LINEAR IN PIXELS — about 5.2 ms fixed plus 4.1 ms per
  // megapixel (the fit predicts 13.7 ms at 2.07 Mpx against 12.6 measured) —
  // while CPU submission stays flat across a 4x pixel range. So the frame is
  // fill-bound again, the round-14 finding no longer describes this build, and
  // renderScale/aoScale ARE valid levers once more. They are simply not needed
  // yet, which is why nothing in the tiers below moved this round.
  //
  // THE 60 FPS CLAIM (GRAPHICS_CONTRACT.md §0) IS NOW TRUE AS WRITTEN, on
  // median, on an M-series laptop: 1920x1080 tier `high` measures 12.1-14.6 ms
  // (68-83 fps) on permanent-reserve-core and 8.4-8.6 ms (>100 fps) on
  // bull-market-colosseum and meme-market. Do not weaken the claim. What it
  // does NOT yet cover is the tail: p90 sits at 25-30 ms with ~3% of frames
  // over 33 ms, and that is not shader compilation (one program compiled
  // across a 6 s sample), so it is the next thing to chase — as a hitch
  // problem, not a throughput one.
  //
  // DRAW CALLS. Same scene and configuration, per-pass attribution from
  // Pipeline.profileDraws()/drawProfile(): 1113-1227 total before, 758-957
  // after. The GRAPHICS_CONTRACT "~900 in a match" budget is met on median but
  // has no headroom, and the split says where the rest is:
  // shadow ~355 > beauty ~225 > GTAO normal prepass ~190 > post quads 18.
  // The shadow map is still the largest single block in the frame.
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
      // 1.5 -> 1: composer runs at renderScale 1.0, so 1.5 only enlarged the
      // present blit by 2.25x. Same image, less fill. See the note above.
      pixelRatio: 1, shadows: true, shadowSize: 1024, shadowType: 'pcf',
      crowd: 60, maxDebris: 45, particleScale: 0.75, propLimit: 24, reflections: false,
      textureSize: 256, anisotropy: 4, textureBudgetMB: 48, envResolution: 128,
      post: { ao: false, bloom: true, dof: false, motionBlur: false, aa: true, grain: 0.018 },
      material: { physical: false, transmission: false, maps: true, ao: true, envMapIntensity: 1, hero: false },
    },
    high: {
      name: 'High', tier: 'high',
      // 2 -> 1. NOT a quality cut: renderScale 1.0 already caps the whole post
      // chain at CSS resolution, so this only stops OutputPass upsampling a
      // 1080p image into a 4x-larger multisampled default framebuffer every
      // frame. Raise it again ONLY together with TIERS.high.renderScale.
      pixelRatio: 1, shadows: true, shadowSize: 2048, shadowType: 'pcf',
      crowd: 120, maxDebris: 90, particleScale: 1, propLimit: 40, reflections: true,
      textureSize: 512, anisotropy: 8, textureBudgetMB: 80, envResolution: 256,
      post: { ao: true, bloom: true, dof: true, motionBlur: true, aa: true, grain: 0.026 },
      material: { physical: true, transmission: true, maps: true, ao: true, envMapIntensity: 1, hero: false },
    },
    ultra: {
      name: 'Ultra', tier: 'ultra',
      // STAYS 2 — and it is the only tier for which 2 does anything. Ultra's
      // renderScale is 1.5, and min(devicePixelRatio, 1.5) needs a 2x canvas
      // to reach 2880x1620. Drop this to 1 and ultra stops supersampling.
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
    //
    // NOTE — there is deliberately NO 'finisher' binding. v2.1 (§23) replaced
    // the manual finisher with automatic KO executions: MatchScreen.onKO runs
    // the cutscene itself and nothing in the engine reads a finisher input.
    // Every key listed here must also appear in InputManager's ACTIONS list
    // (it polls that list, not this object) AND have a consumer — otherwise
    // it is a dead key that still shows up as a rebindable row in Settings.
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
