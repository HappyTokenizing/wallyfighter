// ---------------------------------------------------------------------------
// src/ui/MenuBackdrop.js — THE PERMANENT RESERVE (v3 title/menu hero set)
//
// This is the shared 3D set behind the title screen, the main menu, select,
// settings, movelist, gallery, credits, results and the three mode shells. It
// is a lazy singleton: built once, reused by every front-end screen, never
// rebuilt.
//
// WHAT CHANGED AND WHY (GRAPHICS_CONTRACT §0, §4, §12)
//
// The arenas got the full v3 render-layer overhaul across many rounds. This
// file got none of it: it imported `renderScene` and nothing else, hand-rolled
// three lights and six flat MeshStandardMaterials, and floored the set with a
// GridHelper. The visible consequences were exactly what you would predict:
//
//   - the podium slab read as PURE BLACK. Its colour was 0x2a2f4a (mid navy) —
//     the failure was never the albedo, it was that nothing lit it and there
//     was no scene.environment for it to pick ambient specular out of.
//   - the Wally "silhouette" was 13 raw boxes wearing the retired suit design.
//   - the coin was a flat disc: metalness 0.72 with no environment renders as
//     a dark grey circle, because a metal's diffuse term is zero by definition
//     and its specular term had nothing to reflect.
//   - the candlesticks were MeshBasicMaterial, i.e. not emitters at all, so
//     bloom could not key off them.
//   - the sky was a 5-stop canvas gradient, which §0 forbids by name.
//
// Everything below is built out of the render layer instead:
//
//   applyEnvironment(scene, 'interior-vault')  PMREM IBL. The single change
//                                              that makes the gold read as gold.
//   makeCinematicRig(...)                      key / fill / camera-relative rim /
//                                              bounce / ambient floor (0.095 —
//                                              the highest in the table bar
//                                              reserve-core) / contact shadows.
//   pbr() + surface presets                    marble, granite, gold, chrome,
//                                              brushed metal, concrete, leather.
//   emissive()                                 the vault seam, the floor inlay,
//                                              the candles — real emitters, so
//                                              the bloom threshold (1.26 for
//                                              this mood) sees only them.
//   geometry toolkit                           roundedBox / taperedBox /
//                                              roundedCylinder / profileLathe /
//                                              filletRing / capsule / mergeParts.
//                                              There is not one raw BoxGeometry
//                                              left in the frame.
//   WallyDef.buildModel()                      THE SHIPPED CHARACTER. The menu
//                                              hero is now literally the same
//                                              model the fighter uses, so it can
//                                              never drift from the design again.
//
// THE SET. A vault gallery in the Permanent Reserve: polished granite floor
// with an inlaid brass tile grid and a glowing reserve seal, a 9 m circular
// vault door upstage with a hot gold seam (the hero lighting moment), receding
// pilasters both sides for depth, bullion stacks, a marble plinth carrying
// Wally, the W-coin struck in gold hanging stage right, holographic candles
// drifting up through the room, and a dust-mote volume so the shaft of light
// from the ceiling slot has something to be visible in.
//
// COMPOSITION. Every screen that uses this backdrop puts its DOM chrome down
// the LEFT and centre, so the open half of the frame is stage right and that is
// where the hero goes. Measured in NDC at all three extremes of the camera arc
// (the numbers on WALLY_AT / COIN_AT are from that projection, not from taste):
//
//   Wally        x  0.30 .. 0.59   y -0.14 .. 0.48    the subject, in focus
//   vault door   x -0.38 .. 0.48   y  0.40 .. 1.01    backdrop, two stops soft
//   W-coin       x  0.50 .. 0.86   y  0.38 .. 0.94    upper-right counterweight
//   god-ray      x -0.57 .. -0.11  y  0.33 .. off     depth behind the DOM list
//
// He is the brightest thing in frame, the only thing on the focus plane, and
// the only thing with a warm key of its own. The camera runs a slow lateral arc
// on two incommensurate harmonics with a breathing dolly — a title-screen move,
// not an orbit — and he tracks it with his head.
//
// ROUND 2 (this pass) — the four defects the verifier measured, and the fixes:
//   clipped white 1.06-1.48% vs 0.8%   every emitter re-levelled against the
//                                      1.08 bloom gate instead of over it, the
//                                      subject chain cut ~35% (Wally's albedo
//                                      tripled when TRIM went 0.25 -> 0.62 and
//                                      the rig was never re-balanced for it),
//                                      IBL raised to hold the room median.
//   brass inlay specular aliasing      it was rendering as MIRROR gold: the
//                                      `roughness: 2.2` multiplier clamps at 1
//                                      and three.js roughness is scalar*map, so
//                                      the preset's 0.12 was the final value.
//                                      Rough map kind + normalScale 0.2 +
//                                      aniso 16 + wider, lower, shorter strips.
//   hard-edged light shaft             it intersected the plinth, the statue
//                                      and the floor, and its falloff exponent
//                                      was concave. Rebuilt: convex chord,
//                                      3-octave world-space noise, fog-matched
//                                      depth fade, and it dies in mid-air.
//   composition                        coin moved out of the hero's shoulder,
//                                      god-ray moved out of the hero entirely,
//                                      an eye light added, DoF on the door.
//
// ROUND 3 (this pass) — measured off .shots/f1-title.png and f1-menu.png, which
// are the first captures taken AFTER the round-2 edits landed. Four findings,
// and three of them share one root cause.
//
//   THE ROUGHNESS MULTIPLIER CANNOT MAKE ANYTHING ROUGHER. `pbr()` roughness is
//   `scalar * map` with the scalar clamped at 1, and materials.js has already
//   spent the whole scalar getting the map to the preset's authored value. So
//   `roughness: 1.35` is a no-op and `roughness: 0.85` on `marble` still means
//   0.10. Round 2 diagnosed this correctly for the brass inlay and then left
//   FIVE more surfaces on mirror presets: the granite floor at an effective
//   0.29, the pilasters and the plinth on `marble` (0.115 under a clearcoat at
//   0.12 — they render as glass tubes and corrugated metal), the whole vault
//   door on `metal` (0.26), and eleven bullion bars on `gold` (0.12). Every one
//   of those is now on a preset whose MAP is authored rough, with the normal
//   response pulled down to match, which is the only fix that exists.
//
//   1. floor sparkle          the lower half of frame carried several hundred
//                             isolated 1-2 px specular glints. Four terms, all
//                             taken down together: roughness, normalScale,
//                             texel density and envMapIntensity. See M.floor.
//   2. the door out-acts      not the seam — the GLOSS. Three relief rings, a
//      the hero               five-spoke wheel and a mirror-gold hub, all in
//                             `metal`, lit by three 14 W practicals standing
//                             1.6 m off the face, rendered a glowing mandala
//                             that owns the centre of the frame. Satin steel,
//                             8 W practicals moved out to the seam recess, a
//                             satin hub, and a lower wash.
//   3. nothing bloomed        the only pixels over this mood's 1.26 gate were
//                             specular hits on metal, i.e. exactly backwards
//                             from §3. Round 2 cut every emitter to pay a
//                             clipped-white bill that Pipeline had already
//                             settled structurally (its highlight restore was
//                             rewritten from an unbounded multiply to a
//                             headroom form; the linear radiance that clips in
//                             this mood went 0.548 -> 6.50). Re-levelled on
//                             LUMINANCE, which is what the gate measures.
//   4. the shaft was missing  round 2 fixed its shape and then parked it over
//                             the vault door's left rim, where it was both
//                             invisible and compositionally wrong. It moves to
//                             the empty left third and descends to 1.7 m.
//
// COMPOSITION, round 3. Wally projects to NDC x 0.30-0.59 and the door's right
// rim to 0.38-0.56, so his silhouette lies ON the brightest arc of the backdrop
// and both are warm. Round 2 answered "is he the hero?" by dimming the door;
// the other half is an edge, so he now carries the only cold light in the set
// (see rimBack in _buildWally) — a hue break as well as a value break, which is
// what survives when a menu overlay drops a scrim over the frame.
//
// VALUE RANGE (§12.7). Nothing in the frame is unlit: the rig's ambient floor
// is a guaranteed non-zero term on every surface, the mood's IBL fills the
// shadow side, and the only things above the bloom threshold are the four
// emissive families (seam, seal, candles, plinth inscription). Check with
// `game.pipeline.frameReport()` / `.stats().histogram`.
//
// API IS UNCHANGED: `getBackdrop(game)` -> `{ update(dt), render(renderer, dt) }`
// and every draw still routes through `renderScene()` (§8).
// ---------------------------------------------------------------------------
import * as THREE from 'three'
import {
  renderScene, pbr, emissive, applyEnvironment, makeCinematicRig,
  roundedBox, taperedBox, roundedCylinder, filletRing,
  profileLathe, capsule, ball, mergeParts, markDynamic,
} from '../render/index.js'
import { WallyDef } from '../characters/wally.js'

// The mood drives three separate systems and they must all agree, or the
// specular highlight disagrees with the shadow direction and the frame reads as
// two suns: env.js PMREM + MOOD_EXPOSURE (via the pipeline's mood auto-detect,
// which reads the environment texture's `env:<mood>` name), and the rig preset
// in lighting.js RIG_PRESETS.
const MOOD = 'interior-vault'

// Set dimensions, metres. Kept in one block because the camera framing, the
// fog range and the shadow radius all depend on them.
const ROOM = {
  halfW: 11.5,      // side walls at ±x
  back: -13.5,      // back wall z
  front: 9.5,       // the wall behind camera (never seen, closes the IBL)
  ceil: 9.0,        // ceiling y
  doorR: 4.35,      // vault door radius
  doorY: 4.15,      // vault door centre height
}

// Stage marks.
// Wally was at x -2.55, which projects to NDC x -0.36 — dead behind the menu
// list, so the hero of the title screen was completely hidden by the buttons on
// every menu screen. He goes right of centre instead, into the open half of the
// frame; the coin moves further right and back so it stops competing with him,
// and the vault door keeps the centre as the backdrop it should be.
const WALLY_AT = { x: 2.35, z: -1.7, ry: -0.34 }
// The coin used to sit at (4.55, 2.85, -4.2), which projects to NDC x 0.50-0.83,
// y 0.03-0.62 — i.e. a spinning mirror-gold disc laid straight across the hero's
// right shoulder and ear at every point of the camera arc. Measured, not
// guessed: Wally occupies NDC x 0.30-0.59, y -0.14-0.48. The coin goes UP and
// BACK into the empty upper-right corner, where it balances him and leads the
// eye down to him instead of fighting him for the same pixels. Being 4 m behind
// the focus plane it also picks up the menu's depth of field, so it reads as
// background even where it does clip his silhouette.
const COIN_AT = { x: 4.85, y: 4.30, z: -5.9 }
// The god-ray. It used to be co-axial with the statue (x +2.59, z -2.02),
// running from y 1.0 to y 9.0 — which put a 2 m-radius cone THROUGH the plinth,
// through Wally and into the floor. A volumetric that intersects geometry draws
// a hard analytic line along the intersection, and that line is the "hard-edged
// white wedge" the verifier caught. It now lives upstage LEFT, in the one part
// of the set with nothing in it, and it dies 3.2 m above the floor.
// ROUND 3. Round 2 fixed the SHAPE of the shaft (convex falloff, three octaves
// of world-space noise, fog-matched depth fade, dies in mid-air) and it is a
// genuinely soft volume now — but it was then placed at x -3.6 / z -8.2, which
// projects to NDC x -0.59..-0.07: straight across the vault door's left rim,
// terminating in mid-air at exactly door-centre height. So the one hero
// lighting moment in the set was (a) invisible, because it was laid over the
// brightest object in frame instead of over darkness, and (b) compositionally
// wrong, because it cut the door in half. It does not appear at all in
// .shots/f1-title.png.
//
// It moves into the genuinely empty left third — NDC x -1.01..-0.42, cropped by
// the frame edge, which is how a real shaft reads — and drops its foot from
// 3.2 m to 1.7 m so it descends TOWARD the floor without touching it. Clearance
// checked against everything in that quarter of the room: the far bullion stack
// at (-6.6, -7.4) tops out at 0.6 m, 1.1 m below the foot; the cordon post at
// (-4.9, 1.7) is 4 m out of the cylinder in z; the colonnade is at x -10.75 and
// the side wall at -11.5, both clear of the 1.7 m base radius.
const SHAFT_AT = { x: -6.4, z: -6.0, top: 8.9, bottom: 1.7, tilt: 0.11 }

let _instance = null

export function getBackdrop(game) {
  if (!_instance) _instance = new MenuBackdrop(game)
  return _instance
}

// --- small helpers ---------------------------------------------------------

/** mesh(geo, mat, x, y, z) — one line per part, matches the character files. */
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

/**
 * A capsule spanning two 3D points. The coin's raised "W" is four of these, so
 * the glyph is struck relief with rounded joins rather than a canvas decal —
 * which is the difference between a coin that catches the key light along the
 * letterform and a coin with a picture of a letter on it.
 */
const _cA = new THREE.Vector3()
const _cB = new THREE.Vector3()
const _cD = new THREE.Vector3()
const _cQ = new THREE.Quaternion()
const _cUp = new THREE.Vector3(0, 1, 0)
function strut(a, b, r, mat, radialSeg = 10) {
  _cA.set(a[0], a[1], a[2])
  _cB.set(b[0], b[1], b[2])
  _cD.subVectors(_cB, _cA)
  const L = Math.max(1e-4, _cD.length())
  const m = new THREE.Mesh(capsule(r, L, 3, radialSeg), mat)
  m.position.copy(_cA).addScaledVector(_cD, 0.5)
  _cQ.setFromUnitVectors(_cUp, _cD.normalize())
  m.quaternion.copy(_cQ)
  return m
}

/** Deterministic PRNG. No Math.random() anywhere in the set dressing. */
function rng(seed) {
  let s = (seed | 0) || 1
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** A soft round dust sprite. Procedural canvas — no image assets (§3). */
function moteTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,244,224,0.55)')
  grad.addColorStop(1.0, 'rgba(255,240,210,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------------------
// MenuBackdrop
// ---------------------------------------------------------------------------
class MenuBackdrop {
  constructor(game) {
    this.game = game
    this.t = 0
    this.candles = []
    this.rig = null
    this.envHandle = null
    this._renderer = (game && (game.isWebGLRenderer ? game : game.renderer)) || null

    this.scene = new THREE.Scene()
    // Self-describing for Pipeline._detectMood(): the post stack picks up
    // MOOD_EXPOSURE['interior-vault'] (exposure 1.12, black 0.028, bloom
    // threshold 1.08) without the integrator having to know menus exist. Set
    // here as well as via the env texture name so it is right on frame one even
    // if the renderer is not available yet.
    this.scene.userData.mood = MOOD
    // Interior haze. Short enough to separate the plinth from the vault door,
    // long enough that the door is still legible. Colour matches the mood's
    // horizon so the far wall dissolves into the room rather than into a band.
    this.scene.fog = new THREE.Fog(0x0d1319, 13, 52)

    this.camera = new THREE.PerspectiveCamera(38, this._aspect(), 0.1, 160)
    this.camera.position.set(0, 1.95, 7.9)
    this._look = new THREE.Vector3(-0.25, 1.62, -1.4)
    // The lens focus plane: Wally's chest, on the plinth.
    this._focusPoint = new THREE.Vector3(WALLY_AT.x, 2.25, WALLY_AT.z)
    this.camera.lookAt(this._look)

    this.root = new THREE.Group()
    this.root.name = 'menuSet'
    this.scene.add(this.root)

    this._materials()
    this._tryEnvironment()
    this._buildRig()

    // Build order is composition order: floor, room shell, upstage vault door,
    // mid-ground dressing, then the two hero props.
    this._safe('floor', () => this._buildFloor())
    this._safe('room', () => this._buildRoom())
    this._safe('vaultDoor', () => this._buildVaultDoor())
    this._safe('dressing', () => this._buildDressing())
    this._safe('plinth', () => this._buildPlinth())
    this._safe('wally', () => this._buildWally())
    this._safe('coin', () => this._buildCoin())
    this._safe('candles', () => this._buildCandles())
    this._safe('atmos', () => this._buildAtmosphere())
    // Declarative prop pools last, once everything that opts in exists.
    this._safe('propShadows', () => this.rig && this.rig.addPropShadows(this.root))

    this._onResize = () => {
      this.camera.aspect = this._aspect()
      this.camera.updateProjectionMatrix()
    }
    addEventListener('resize', this._onResize)
    // The window is NOT the authority on the frame size. A backgrounded or
    // never-laid-out tab reports innerWidth/innerHeight 0, so innerWidth/
    // innerHeight is NaN, the projection matrix is NaN and the whole backdrop
    // renders nothing at all — a pure black menu. The renderer's own drawing
    // buffer is the truth, and the integrator announces every size change on
    // game.events('resize') (that is what __viewport() emits and what
    // MatchScreen listens to), so listen there too.
    this._offResize = (game && game.events && typeof game.events.on === 'function')
      ? game.events.on('resize', ({ w, h }) => {
        this.camera.aspect = (w > 0 && h > 0) ? (w / h) : this._aspect()
        this.camera.updateProjectionMatrix()
      })
      : null

    // The menu asks the shared pipeline for a shallower depth of field than
    // gameplay wants (see _applyDoF). render() already hands it back in a
    // `finally`, so the borrow never outlives one draw call; this is the
    // belt-and-braces for the path where render() is never reached again
    // (a screen change during a thrown frame). A fighting game with a soft
    // background is a fighting game with a bug.
    this._dofSaved = null
    this._offScreen = (game && game.events && typeof game.events.on === 'function')
      ? game.events.on('screen:changed', ({ name }) => {
        if (name === 'match') this._restoreDoF()
      })
      : null
  }

  // Frame aspect, in order of trustworthiness: the live drawing buffer, the
  // window, then 16:9. Never returns 0, Infinity or NaN.
  _aspect() {
    const r = this._renderer || (this.game && this.game.renderer) || null
    let w = 0
    let h = 0
    if (r && typeof r.getSize === 'function') {
      const v = r.getSize(new THREE.Vector2())
      w = v.x; h = v.y
    }
    if (!(w > 0 && h > 0) && r && r.domElement) { w = r.domElement.width; h = r.domElement.height }
    if (!(w > 0 && h > 0)) { w = (typeof innerWidth === 'number' ? innerWidth : 0); h = (typeof innerHeight === 'number' ? innerHeight : 0) }
    const a = (w > 0 && h > 0) ? (w / h) : (16 / 9)
    return Number.isFinite(a) && a > 0 ? a : (16 / 9)
  }

  // -------------------------------------------------------------------------
  // COMPOSITION — depth of field.
  //
  // The brief: "he should be the brightest, sharpest, best-composed thing in
  // frame, with the vault door as backdrop rather than competitor." Brightness
  // and composition are handled by the rig and by WALLY_AT/COIN_AT. SHARPNESS
  // is the one that needs the lens, because everything in this set is equally
  // sharp and equal sharpness is exactly what makes a backdrop compete: the
  // door's 28 bolt heads, the machined relief rings and the handwheel are all
  // resolving at full detail 21 m behind the subject.
  //
  // Wally is at ~9.7 m, the coin at ~13.6 m, the door at ~21.6 m. A focus plane
  // locked to him with a 3.2 m in-focus band puts the coin one step soft and
  // the door two, which is a real lens and reads as one.
  //
  // Aperture must clear DOF_VISIBLE_APERTURE (0.0015) or the pipeline correctly
  // refuses to run the pass at all; 0.0026 is just over it. maxblur is kept
  // small — this is separation, not a bokeh party.
  // -------------------------------------------------------------------------
  _pipeline() {
    const g = this.game
    if (g && !g.isWebGLRenderer && (g.pipeline || g.renderPipeline)) return g.pipeline || g.renderPipeline
    const r = this._renderer
    return (r && r.__wcsPipeline) || null
  }

  _applyDoF() {
    const p = this._pipeline()
    if (!p || typeof p.setDoF !== 'function' || typeof p.autoFocus !== 'function') return
    if (!this._dofSaved) {
      this._dofSaved = {
        aperture: p._dofBase ? p._dofBase.aperture : undefined,
        maxblur: p._dofBase ? p._dofBase.maxblur : undefined,
        range: p._dofBase ? p._dofBase.range : undefined,
        enabled: p._dof ? p._dof.enabled : undefined,
      }
    }
    try {
      // Re-asserted every frame rather than once: the same singleton is drawn
      // before and after matches, cinematics and quality rebuilds, all of which
      // rewrite these. Every call here is a handful of float stores.
      // Not `this.wally` — his group origin is at his FEET, and focusing a
      // 3.2 m band on the feet of a 2 m subject puts his head at the edge of
      // it. The plane sits on his chest.
      p.autoFocus(this._focusPoint)
      p.setDoF({ range: 3.2, aperture: 0.0026, maxblur: 0.0062, enabled: true })
    } catch (e) { /* a menu never dies for a lens */ }
  }

  _restoreDoF() {
    const s = this._dofSaved
    if (!s) return
    this._dofSaved = null
    const p = this._pipeline()
    if (!p || typeof p.setDoF !== 'function') return
    try {
      p.autoFocus(null)
      p.setDoF({
        aperture: s.aperture ?? 0.0006,
        maxblur: s.maxblur ?? 0.0022,
        range: s.range ?? 3,
        enabled: s.enabled !== false,
      })
    } catch (e) { /* nothing to restore to */ }
  }

  // A menu that throws on construction takes every front-end screen with it, so
  // each subsystem is individually survivable. A missing bullion stack is a
  // worse frame; a missing menu is a dead game.
  _safe(what, fn) {
    try { fn() } catch (e) { console.warn(`[menuBackdrop] ${what} failed to build`, e) }
  }

  // -------------------------------------------------------------------------
  // Materials. Every one comes from pbr()/emissive() with a real surface kind,
  // so every one has albedo variation, a normal response, spatially varying
  // roughness and AO — §0.1. `mapOpts.repeat` is free (one extra upload of the
  // same field); `mapOpts.seed` is not, so nothing here asks for a seed.
  //
  // FIVE texture kinds in the whole set after round 3 (granite, metal-rusted,
  // gold, concrete, leather) plus Wally's own map-free vinyl — well inside the
  // ~20-kind budget, and the menu never coexists with an arena's set.
  //
  // `chrome` went in round 2 and `marble` and `metal-brushed` go in round 3,
  // all three for the same reason and it is worth stating once at the top
  // because it is THE lesson of this file: three.js roughness is
  // `scalar * map`, the scalar clamps at 1, and materials.js already spends the
  // whole scalar getting the map to the preset's authored value. So a preset
  // can only ever be made SHINIER, never rougher. If a surface aliases, the
  // fix is a preset whose MAP is authored rough — never a multiplier over 1,
  // which silently does nothing. `marble` is the worst offender in the table
  // (0.115 under a clearcoat at 0.12) and had been applied to the two largest
  // stone objects in the set.
  // -------------------------------------------------------------------------
  _materials() {
    const M = {}

    // FLOOR. Honed dark granite; `roughness` is a MULTIPLIER over the preset's
    // authored value (stone = 0.56).
    //
    // ROUND 3 — THE FLOOR WAS STILL THE SPARKLE, AND IT WAS FOUR THINGS AT ONCE.
    // Round 2 took the roughness multiplier 0.34 -> 0.52 and called it done, but
    // `stone` authors 0.56 in the MAP so 0.52 lands at ~0.29: still a wet mirror
    // by the standards of a 70 m plane under nine point lights. Measured off
    // .shots/f1-title.png the lower half of frame is carrying several hundred
    // isolated 1-2 px white glints, which is the single most recognisable
    // amateur tell in the build.
    //
    // Sub-pixel specular is a product of four terms and you have to take all
    // four down or the remainder puts it straight back:
    //   1. roughness 0.52 -> 0.88 (effective ~0.49). Honed granite, not wet.
    //      The lobe is now wide enough that a point source lands as a soft
    //      patch spanning many pixels instead of a sample-rate-limited spike.
    //   2. normalScale 1.2 (the preset's) -> 0.34. The GRAIN was the carrier:
    //      every normal-map texel is a micro-facet aiming a highlight somewhere,
    //      and at 20 m of recession those texels are far below one pixel. This
    //      is the same lesson the brass inlay taught one round earlier.
    //   3. repeat [14,14] -> [9,9] on a 70 m plane: a 7.8 m world tile instead
    //      of a 5 m one, so the map is minified a third less at every depth.
    //   4. envMapIntensity 1.30 -> 0.82. The IBL was the thing being resolved
    //      into pin-sharp points; the floor still returns a legible reflection
    //      of the door, it just returns it as a gradient.
    // The albedo comes up 0x2a3038 -> 0x333b45 to pay back the value the lost
    // reflection was carrying, so the lower frame does not go muddy.
    //
    // ROUND 11 — THE ROOM IS TWO STOPS UNDER ITS OWN BAND, AND ALBEDO IS THE
    // ONE LEVER THAT FIXES IT WITHOUT BRINGING THE SPARKLE BACK. Measured menu
    // median 32 against the interior-vault band of 60-124; clipped 0.0000 %,
    // below-8 8.50 %, pureBlack 0. A previous round tried to buy the two stops
    // from the LIGHTS (practicals x4.5 / emissive x2.5 / rig x2.2), landed
    // median 78-81, and was rejected on sight as "an over-lit gold showroom
    // with the brass floor sparkle back" — which is exactly what that mix buys,
    // because practicals and IBL are the two terms the METALS in this set read
    // by, and rounds 2-3 spent four material changes taking them down.
    //
    // Albedo is the opposite trade. These four surfaces (floor, wall, ceiling,
    // pilaster) are DIELECTRICS at effective roughness 0.49-0.92: they have no
    // specular character to amplify, they are ~80 % of the frame's area, and
    // multiplying their diffuse return multiplies the median and nothing else.
    // The metals — steel, brass, gold, chrome, the coin — are left exactly where
    // round 3 put them, so the gold gets RELATIVELY dimmer against the room,
    // which is the correction the frame actually needs.
    //
    // Sized for the BOTTOM of the band, not the middle: the frame response
    // measured across the rejected experiment is close to linear in this range
    // (a ~2.8x light chain returned a 2.45x median), so architecture albedo
    // x1.65-1.95 plus the measured x1.18 diffuse lift in _buildRig and the
    // x1.25 in _tryEnvironment land ~2.2x on the room = a predicted median of
    // 58-66 against the measured 32, i.e. the BOTTOM
    // of the band, which is where the brief asks this to land. 0x333b45 ->
    // 0x546172 is the floor's share; it is still dark granite, it is still well
    // under the plinth's pale stone, and the reflection round 3 tuned is
    // untouched because envMapIntensity/roughness/normalScale do not move.
    M.floor = pbr(0x546172, 'stone', {
      mapOpts: { scale: 4.2, repeat: [9, 9], wear: 0.35, aniso: 16 },
      roughness: 0.88, envMapIntensity: 0.82, normalScale: 0.34, aoIntensity: 1.15,
    })
    // ------------------------------------------------------------------------
    // THE BRASS INLAY — the specular-aliasing fix, and it was a material bug.
    //
    // This asked for the `gold` preset, whose authored roughness is 0.12 with
    // envMapIntensity 1.5: a MIRROR. The `roughness: 2.2` multiplier looked like
    // "make it 2.2x rougher" but three.js roughness is `scalar * map`, the
    // scalar clamps at 1, and materials.js already spends the whole scalar
    // getting the map to the preset's 0.12 — so 2.2 clamped to 1 and the inlay
    // rendered at exactly mirror gold. 5.5 cm strips of mirror metal running
    // 30 m into the distance across the bottom half of frame is the textbook
    // recipe for specular aliasing, and no amount of SMAA touches it, because
    // SMAA is a morphological edge filter and this is a shading frequency.
    //
    // Four fixes, all of which are needed:
    //   1. a preset whose MAP is authored rough (metal-rough, 0.62) — the only
    //      way to get a rougher metal, since the scalar cannot exceed 1;
    //   2. metalness 0.72, so there is a real diffuse term holding the value up
    //      between highlights instead of pure specular flicker;
    //   3. normalScale 0.2 — micro-normal detail on a surface 2 px wide IS the
    //      aliasing, so the bump response is dialled almost out and the strips
    //      get their read from albedo and geometry;
    //   4. anisotropy 16 + a coarse map scale, so what is left mips cleanly.
    // Plus the geometry change in _buildFloor(): wider, lower, and stopped at
    // the walls instead of running to 30 m.
    // ------------------------------------------------------------------------
    // ROUND 3: the hue was reading orange-red rather than brass against the
    // warm door wash (measured on f1-title: the convergence lines are the most
    // saturated thing in the lower frame). Pulled toward olive-brass and the
    // last of the bump response taken out — at 9 cm across, 20 m deep, the
    // strips have no business carrying a normal map at all.
    M.brass = pbr(0x9a8248, 'metal-rough', {
      mapOpts: { scale: 2.8, repeat: [5, 1], wear: 0.12, aniso: 16 },
      metalness: 0.68, envMapIntensity: 0.44, normalScale: 0.12, aoIntensity: 1.0,
    })
    // 1.65 put a hard clipped ring across the bottom-right of frame, 3 m from
    // the lens, competing with the subject standing inside it. It is a floor
    // inlay: it should read as lit brass with a glow in it, not as a light.
    M.sealGlow = emissive(0xffb648, 0.86, 'emissive')

    // ARCHITECTURE.
    // Round 11: the other three dielectrics of the shell, same trade as the
    // floor above — x1.95 on the wall and ceiling (the two surfaces carrying most
    // of the below-8 mass, since they are the ones no practical reaches), x1.4
    // on the pilasters, which already sit a stop above them and would start
    // competing with the plinth if they took the full lift.
    M.wall = pbr(0x758190, 'concrete', { mapOpts: { scale: 4.5, repeat: [8, 4], wear: 0.5 }, roughness: 0.92 })
    M.ceiling = pbr(0x5a6573, 'concrete', { mapOpts: { scale: 3.0, repeat: [6, 6], wear: 0.3 } })
    // ROUND 3 — THE `marble` PRESET IS A CLEARCOATED MIRROR AND IT DOES NOT
    // BELONG ON ANYTHING BIG OR FAR. It authors roughness 0.115 with
    // clearcoat 0.5 / clearcoatRoughness 0.12 and physical:true, so a 0.7
    // multiplier lands at ~0.08 — under a second, even tighter specular lobe.
    // On f1-title the two visible pilasters read as GLASS TUBES with glitter on
    // them, not as stone columns, and the same preset was doing the same thing
    // to the plinth (M.marble below). Granite maps at 0.56 give an honed-stone
    // lobe that survives 20 m of recession, and drop two MeshPhysicalMaterials
    // out of the set as a bonus.
    M.pilaster = pbr(0x8a96a5, 'stone', {
      mapOpts: { scale: 2.4, repeat: [1, 3], wear: 0.2, aniso: 16 },
      roughness: 0.92, envMapIntensity: 0.7, normalScale: 0.6,
    })
    // Same trap as the inlay, one scale down: ten 4.5 cm mirror-gold tori at
    // 12-20 m are ~2 px of pure specular each. Satin brass instead.
    M.trim = pbr(0xb08a3e, 'metal-rough', {
      mapOpts: { scale: 1.9, wear: 0.1, aniso: 16 },
      metalness: 0.8, envMapIntensity: 0.7, normalScale: 0.3,
    })

    // VAULT DOOR.
    // ROUND 3 — THE DOOR WAS OUT-ACTING THE HERO AND THE CAUSE WAS GLOSS, NOT
    // EMISSION. Round 2 spent its whole budget on the emissive seam (2.35 ->
    // 1.06) and the door still renders on f1-title as a glowing mandala that
    // owns the centre of frame: three concentric relief rings, five spokes and
    // a hub, all in `metal` (map roughness 0.26, envMapIntensity 1.25), lit by
    // three 14 W practicals sitting 1.6 m off the face. Every ring returns a
    // full-width specular sheet, and a hundred square metres of that is what
    // the eye is actually reading — the seam is a bystander.
    //
    // `metal` -> `metal-rough` across the whole door. Brushed/blasted steel at
    // an effective 0.5-0.6 is what a real vault slab is, it holds its machined
    // form through shading gradient rather than through highlight, and it lets
    // the ONE emissive line be the brightest thing on the door. The practicals
    // come down and move onto the face in _buildVaultDoor().
    M.steel = pbr(0x7f868e, 'metal-rough', {
      mapOpts: { scale: 2.4, repeat: [3, 3], wear: 0.15, aniso: 16 },
      metalness: 0.9, roughness: 0.9, envMapIntensity: 0.85, normalScale: 0.55,
    })
    M.steelDark = pbr(0x4b525b, 'metal-rough', {
      mapOpts: { scale: 2.0, repeat: [2, 2], wear: 0.22, aniso: 16 },
      metalness: 0.88, envMapIntensity: 0.6, normalScale: 0.6,
    })
    // The handwheel is 0.17 m spokes and a 9 cm ring at 21 m — 8-10 px of true
    // chrome (roughness 0.055, envMapIntensity 1.7), which crawls as the wheel
    // rocks. Round 2 moved it to `metal`, which is still 0.26 and still the
    // brightest set of lines on the door. Real satin nickel this time.
    M.chrome = pbr(0xbcc4cc, 'metal-rough', {
      mapOpts: { scale: 1.2, wear: 0.08, aniso: 16 },
      metalness: 0.85, roughness: 0.95, envMapIntensity: 0.68, normalScale: 0.5,
    })
    M.bolt = pbr(0x99a1aa, 'metal-rough', {
      mapOpts: { scale: 0.8, wear: 0.18, aniso: 16 },
      metalness: 0.85, roughness: 0.85, envMapIntensity: 0.6, normalScale: 0.55,
    })
    // 2.35 made the vault seam the brightest thing in frame by a wide margin and
    // it pulled the eye straight off the character — the backdrop was out-acting
    // the hero. 1.45 fixed the competition but the frame still clipped 1.06-1.48%
    // to pure white against the pipeline's 0.8% limit, and the seam is the single
    // largest contributor: a 28 m circumference ring is ~1700 px of continuous
    // emitter, and bloom then adds its own strength back on top of that core.
    //
    // ROUND 3 — THE SEAM WAS NOT BLOOMING AT ALL, AND NEITHER WAS ANYTHING ELSE
    // IN THE SET. Two numbers moved under round 2's feet while it was tuning:
    //
    //   * Pipeline's highlight restore was rewritten from a MULTIPLY (no
    //     ceiling — every pixel past ~0.83 display was pushed over 1.0 and hard
    //     clamped) to a HEADROOM form that is strictly below 1.0 for every
    //     input below 1.0. The scene-linear radiance that now lands on 255
    //     counts in this mood went 0.548 -> 6.50. That single change is what
    //     the menu's 1.06-1.48% clipped white actually was: it was never the
    //     emitters, it was mid-grey vault WALLS being clamped.
    //   * env.js raised interior-vault's bloomThreshold to 1.26 (it was 1.08,
    //     which is the number every comment in this file was written against).
    //
    // So round 2's cuts were paying a bill that had already been settled
    // elsewhere, twice, and the result is a set where the only things above the
    // bloom gate are SPECULAR HITS ON METAL — precisely backwards from §3's
    // "bloom that only blooms real emitters". Re-levelled against the real
    // gate, with the two-decade-old safety margin doing the work instead:
    // 1.26 to bloom, 6.50 to clip, so the whole band 1.4-3.0 is free.
    //
    // Threshold is on LUMINANCE, not on nominal intensity, and that is the trap
    // in a set made of saturated warm emitters: 0xffc24a is only 0.603 relative
    // luma, so 1.06 nominal is 0.64 measured and misses the gate by half. The
    // core ring goes to a HOTTER, PALER gold — which is also what an emitter
    // core physically does — at 0.722 luma x 2.1 = 1.52, comfortably over 1.26
    // and comfortably under 6.50. Peak channel 2.1 linear resolves to ~0.97
    // display: a hot line, not a clipped one, and below round 1's 2.35.
    M.seam = emissive(0xffd88a, 2.1, 'emissive')
    // The saturated gold lives in the SKIRT instead, deliberately below the
    // gate. Hot pale core inside a dim saturated halo is the gradient that
    // makes an emitter read as an emitter rather than as a bright decal, and it
    // stops the bloom kernel reading the pair as one 10 cm bar.
    M.seamHalo = emissive(0xffab3c, 0.78, 'emissive')

    // PLINTH + PROPS.
    // ROUND 3: same `marble` clearcoat trap as the pilasters. On f1-title the
    // plinth reads as CORRUGATED METAL — the marble map's veining at repeat
    // [2,2] over a 2.3 m box becomes a set of fine horizontal lines, and at an
    // effective roughness of 0.10 under a clearcoat each line gets its own
    // specular. Honed pale stone instead: the four rolled horizontal rims still
    // give the four highlight lines that make stone read as stone at 8 m, and
    // they now come from GEOMETRY, which is where the contract wants them.
    M.marble = pbr(0xbcc0c6, 'stone', {
      mapOpts: { scale: 3.4, repeat: [2, 2], wear: 0.18, aniso: 16 },
      roughness: 0.9, envMapIntensity: 0.72, normalScale: 0.7,
    })
    // Round 11: x1.35 with the shell (see the floor note). The plinth's dark
    // course is a shadow-side surface directly under the hero, so it takes less
    // than the walls do — the plinth must keep a lit face and a shaded face.
    M.marbleDark = pbr(0x68717f, 'stone', {
      mapOpts: { scale: 2.8, repeat: [2, 2], wear: 0.25, aniso: 16 },
      roughness: 0.95, envMapIntensity: 0.62, normalScale: 0.7,
    })
    // TRUE mirror gold survives in exactly one place: the coin. It is the
    // nearest, largest and most deliberately hero-lit gold in the frame, it is
    // 1.1 m across at 14 m so its highlights are tens of pixels wide, and a
    // struck coin that is not a mirror is a plastic token.
    M.gold = pbr(0xd8ac4e, 'gold', { mapOpts: { scale: 1.6, repeat: [2, 2], aniso: 16 } })
    // Everything else gold is small, far, or both — plinth reveals, the door
    // hub, eleven 52 cm ingots at 8-11 m. `gold` (0.12 / envMapIntensity 1.5)
    // on those is a field of sub-pixel mirrors. Satin cast gold: which is also
    // simply what a bullion bar looks like. Nobody polishes them.
    M.goldSatin = pbr(0xcfa64e, 'metal-rough', {
      mapOpts: { scale: 1.5, repeat: [2, 2], wear: 0.14, aniso: 16 },
      metalness: 1.0, roughness: 0.82, envMapIntensity: 0.9, normalScale: 0.45,
    })
    M.goldBar = pbr(0xc99c48, 'metal-rough', {
      mapOpts: { scale: 1.0, repeat: [2, 1], wear: 0.3, aniso: 16 },
      metalness: 1.0, roughness: 0.88, envMapIntensity: 0.8, normalScale: 0.5,
    })
    M.rope = pbr(0x8c2f45, 'leather', { mapOpts: { scale: 1.2 } })
    // The dedication plate on the plinth. 0xffd27a is 0.688 luma, so 1.02 was
    // 0.70 measured and nowhere near the 1.26 gate. 1.95 puts it at 1.34 — a
    // small bloom bead at the foot of the hero, which is exactly where a menu
    // wants a secondary accent. It is 11 cm of screen; it cannot cost a budget.
    M.inscription = emissive(0xffd27a, 1.95, 'emissive')
    // AREA emitters — the eight 2.3 m wall strips and the ceiling slot face.
    // These are square metres, not lines, and they were carrying the same 1.35
    // as the 11 cm plaque. Deliberately UNDER the bloom threshold: a practical
    // that big should light the wall, not glow. Splitting them off is what lets
    // the plaque and the seam stay bloomers while the clipped budget comes down.
    M.sconce = emissive(0xffc98a, 0.7, 'emissive')

    // MARKET CANDLES — genuine emitters so bloom keys off them (§4).
    // Sixteen of these at 2.1 were, by area, the biggest block of clipped white
    // in the frame: each is ~1000 px of saturated emitter and most of them are
    // on screen. 1.35 still clears the gate and still blooms green/red.
    // The two are split because they were NEVER MATCHED IN BRIGHTNESS, only in
    // nominal intensity: 0x2bff8a is 0.739 relative luma and 0xff3b5c is 0.252,
    // so at a shared 1.35 the green ticks rendered nearly three times as bright
    // as the red ones and the tape read as green with occasional dark specks.
    // Levelled by luma instead, both deliberately just under the 1.26 gate —
    // eleven blooming ticks scattered round the walls is confetti, and the
    // bloom budget belongs to the seam.
    // Measured radiance (luma x intensity): green 0.92, red 0.72. Not equal on
    // purpose — matching a saturated red to a saturated green by luminance
    // means pushing the red channel past 3 linear, which turns it pink-white
    // and reads as a bug. Every trading terminal ever built has a darker red
    // than green and nobody has ever called it broken.
    M.candleUp = emissive(0x2bff8a, 1.25, 'emissive')
    M.candleDown = emissive(0xff4a62, 2.65, 'emissive')

    this.M = M
  }

  // -------------------------------------------------------------------------
  // Environment (IBL). THE fix for "the coin is a flat disc" and for half of
  // "the podium is black": a metal has no diffuse term at all, so with no
  // scene.environment its only light is the specular lobe of the punctual
  // lights, and a dielectric's ambient specular is gone too.
  //
  // The backdrop is a lazy singleton that some screens build before Game has a
  // renderer, so this is retried on the first render() that brings one.
  // -------------------------------------------------------------------------
  _tryEnvironment() {
    if (this.envHandle) return true
    const g = this.game
    const renderer = this._renderer || (g && (g.isWebGLRenderer ? g : g.renderer)) || null
    if (!renderer) return false
    try {
      this.envHandle = applyEnvironment(this.scene, MOOD, renderer, {
        resolution: 256,
        // 1.0 -> 1.12. The punctual chain came down a third to stop the subject
        // clipping (see _buildRig); IBL is the right place to put the midtones
        // back, because ambient specular lifts the shadow side and the room
        // median WITHOUT adding a single new hot highlight — which is the exact
        // trade the clipped-white budget wants.
        // 1.12 -> 1.24 in round 3, same reasoning one step further. Round 3
        // takes real radiance out of the room: the door wash 28 -> 21, its
        // three practicals 14 -> 8, the coin backlight 9 -> 6.5, and the floor
        // loses most of its mirror return (envMapIntensity 1.30 -> 0.82). Every
        // one of those was a legitimate cut — they were making highlights, not
        // exposure — but together they would drop the room median ~12 counts
        // out of the verifier's measured 76-90. IBL is where you put it back:
        // ambient specular lifts the shadow side and the median without adding
        // a single new hot highlight, which is the exact trade this frame wants.
        // ROUND 11: 1.24 -> 1.55, and this is the SMALLEST of the round's three
        // lifts on purpose. IBL is the term the metals in this set read by —
        // the door steel at 0.85, the coin's mirror gold at the `gold` preset's
        // 1.5, the trim at 0.7 — so every count of it is also a count on the
        // gold, and "over-lit gold showroom" is the failure mode this round is
        // explicitly avoiding. x1.25 here against x1.5-1.6 on the architecture
        // albedo means the ROOM gains two thirds of a stop on the METAL, which
        // is the direction the frame needs. It buys the shadow side of the
        // dielectrics (ambient specular + the diffuse irradiance) without a
        // single new punctual highlight anywhere.
        intensity: 1.55,
        // The room is closed on five sides, so the background is only ever
        // glimpsed past the door frame — but a blurred PMREM there is still a
        // real room rather than the banded canvas gradient §0 forbids, and it
        // guarantees no pure-black pixels leak through a seam.
        background: true,
        backgroundBlurriness: 0.6,
      })
      if (this.scene.background) this.scene.backgroundIntensity = 0.45
      return true
    } catch (e) {
      console.warn('[menuBackdrop] applyEnvironment failed', e)
      return false
    }
  }

  // -------------------------------------------------------------------------
  // Lighting. makeCinematicRig replaces the three hand-rolled lights with the
  // composed key / fill / camera-relative rim / floor bounce / subject fill /
  // solved ambient floor that every arena runs.
  //
  // 'interior-vault' ships ambFloor 0.095 — the second highest in the table —
  // which is the guaranteed non-zero term that makes a pure-black podium
  // impossible by construction rather than by tuning.
  // -------------------------------------------------------------------------
  _buildRig() {
    const quality = (this.game && this.game.quality) || { shadows: true, shadowSize: 1024 }
    try {
      this.rig = makeCinematicRig(this.scene, quality, {
        mood: MOOD,
        camera: this.camera,
        // Focus on Wally's chest, not the room centre: the shadow box, the rim
        // azimuth and the subject fill all key off this.
        focus: [WALLY_AT.x, 2.15, WALLY_AT.z],
        groundY: 0,
        // The key comes over the camera's left shoulder and slightly behind, so
        // the plinth gets a lit face and a shaded face and the statue reads as
        // a form instead of a value.
        sunPos: [-6.5, 12.0, 7.0],
        // WALLY'S TRIM WENT 0.25 -> 0.62 IN wally.js, AND THAT IS AN EXPOSURE
        // CHANGE ON THE SUBJECT, NOT A COLOUR ONE. His body albedo is now ~0.49
        // linear. Against the old rig — key 1.85 + a 55 W statue spot landing
        // ~2.25 + subject fill 1.15 + IBL — his lit planes resolved to ~2.0
        // linear before the mood's 1.12 exposure, which is inside the ACES
        // shoulder's last stop: a hero rendered as a white cutout with the form
        // information tonemapped off it. The brief's instruction was explicit —
        // fix it in MY lighting, not by asking for another albedo change — so
        // the whole subject chain comes down about a third and the FILL comes up
        // to hold the room's median where the verifier measured it (76-90).
        // Net effect on him: still the brightest thing in frame, but his lit
        // side now lands in the 215-235 band where a shoulder still has a
        // gradient across it.
        sunIntensity: 1.5,
        keyDistance: 18,
        // Cool fill from the far corner keeps the shadow side from going warm-
        // grey, which is what makes the warm vault seam read as the one warm
        // thing in the frame.
        // Fill 0.86 -> 0.96 and bounce 0.42 -> 0.52, the other half of the
        // median-holding trade above. Both are broad, low-frequency terms with
        // no specular character of their own, so they buy midtone without
        // buying back any of the sparkle round 3 just spent four material
        // changes removing.
        // ROUND 11 — WHERE THE REST OF THE TWO STOPS COMES FROM, AND WHY THE
        // SUBJECT CHAIN BELOW DOES NOT MOVE. Fill and bounce are the only two
        // terms in this rig with no specular character of their own (broad,
        // low-frequency, aimed away from the camera's reflection vector), so
        // they are the safe place to buy midtone: x1.46 on the fill and x1.88
        // on the floor bounce. Measured on the built rig rather than assumed —
        // the broad-term sum (key 1.5 + fill + rim 2.4 + bounce + hemi 0.86 +
        // solved ambient) goes 6.92 -> 8.14, i.e. x1.18, and x1.19 on top of
        // x1.65-1.95 of architecture albedo is the ~2.2x that puts the room at
        // the bottom of its band. The KEY, the SUBJECT fill, the statue spot and
        // specIntensity all stay exactly where they are — the verifier's report
        // is that Wally on the plinth is well lit and legible and that the door
        // and coin have good specular, and none of those three terms is the
        // reason the ROOM measures 32. Net on the hero: his shadow side comes
        // up ~30 %, his lit side ~5 %, which is inside the headroom the round-3
        // note establishes (this mood clips at 6.50 scene-linear, not 0.548) —
        // and it is the right direction anyway, because a room that is finally
        // lit should be bouncing light back onto the thing standing in it.
        // The ambient floor goes 0.095 (the mood's) -> 0.14 for the below-8
        // mass in the corners no practical reaches (solved AmbientLight
        // intensity 0.679 -> 1.000, measured on the built rig). It is the one term here that is genuinely
        // flat — it costs form on everything it touches, Wally included — so it
        // is deliberately the last one raised and the smallest lift of the
        // three that is not albedo.
        fillColor: 0x6f93b6, fillIntensity: 1.40, fillPos: [9, 6.5, -6],
        rimColor: 0xffcf8a, rimIntensity: 2.4,
        bounceColor: 0x343b44, bounceIntensity: 0.98,
        ambientFloor: 0.14,
        // The statue is the only subject, and it is 1 m off the ground on a
        // plinth, so the subject fill is lifted to match and its throw is kept
        // short enough not to wash the floor.
        subjectColor: 0xffe0b4, subjectIntensity: 0.8, subjectHeight: 1.7,
        subjectRange: 5.2,
        specIntensity: 1.9, specColor: 0xffe6c0,
        rimShaderStrength: 0.75, rimShaderPower: 5.0,
        shadowRadius: 6.5,
        contactShadows: true, contactOpacity: 0.5,
        // A menu is a still life; there is nothing to flicker.
        flicker: false,
        fog: false,
      })
      this.rig.group.name = 'menuRig'
      this.scene.add(this.rig.group)
    } catch (e) {
      console.warn('[menuBackdrop] makeCinematicRig failed — falling back to a plain rig', e)
      this.rig = null
      const hemi = new THREE.HemisphereLight(0x46525f, 0x2a3038, 0.9)
      const key = new THREE.DirectionalLight(0xffd9a0, 1.9)
      key.position.set(-6.5, 12, 7)
      this.scene.add(hemi, key, new THREE.AmbientLight(0x5e6a76, 0.35))
    }
  }

  // -------------------------------------------------------------------------
  // THE FLOOR. §4 of the brief: the green wireframe GridHelper was the single
  // most dated thing in the frame. It is replaced by a physical floor —
  // polished granite at an effective roughness near 0.19, which returns a real
  // environment reflection of the vault door and the gold — and the grid motif
  // survives as INLAY: brass tile seams cut into the stone, plus a glowing
  // reserve seal of concentric rings under the plinth.
  //
  // The seams are 26 strips merged into one draw call. mergeParts keys by
  // material, so the whole grid is a single buffer.
  // -------------------------------------------------------------------------
  _buildFloor() {
    const M = this.M
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70, 1, 1), M.floor)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.castShadow = false
    floor.name = 'vaultFloor'
    this.root.add(floor)

    // --- inlaid tile seams --------------------------------------------------
    // GEOMETRY HALF OF THE ALIASING FIX (the material half is in _materials).
    //
    // Was: 5.5 cm wide, 1.8 cm proud, spanning 30 m — so the far end of every
    // strip was under a pixel wide while still carrying a full specular lobe,
    // and the 1.8 cm shoulder gave the key a second, brighter edge highlight on
    // top. Sub-pixel geometry cannot be anti-aliased by any amount of filtering;
    // it has to stop existing.
    //
    // Now: 8.5 cm wide (never under ~2 px anywhere it is visible), 1.1 cm proud
    // (a flush inlay, which is what an inlay is), and the grid ends AT THE WALLS
    // instead of tunnelling 7 m through them. Seven lines a side instead of
    // nine, same 3.75 m module, so the motif is unchanged and the count of
    // vanishing-point convergence lines in the lower frame drops by a third.
    const seams = new THREE.Group()
    const span = 22.6
    const step = 3.75
    const w = 0.085, h = 0.011
    for (let i = -3; i <= 3; i++) {
      const p = i * step
      seams.add(mesh(roundedBox(w, h, span, 0.004, 1), M.brass, p, 0.0055, -3))
      seams.add(mesh(roundedBox(span, h, w, 0.004, 1), M.brass, 0, 0.0055, p - 3))
    }
    const seamMerged = mergeParts(seams)
    for (const m of seamMerged.children) { m.receiveShadow = true; m.castShadow = false }
    seamMerged.name = 'floorInlay'
    this.root.add(seamMerged)

    // --- the reserve seal ---------------------------------------------------
    // Three concentric rings under the plinth: two brass, one a real emitter.
    // This is the "emissive inlay in a physical floor" the brief asks for — it
    // is geometry sunk into the stone, not a line grid floating in a void.
    const seal = new THREE.Group()
    seal.position.set(WALLY_AT.x, 0.012, WALLY_AT.z)
    seal.add(mesh(filletRing(2.62, 0.045, 6, 72), M.brass))
    seal.add(mesh(filletRing(3.05, 0.028, 6, 72), M.brass))
    const glowRing = mesh(filletRing(2.84, 0.024, 6, 72), M.sealGlow)
    seal.add(glowRing)
    // Twelve radial ticks between the rings, merged.
    const ticks = new THREE.Group()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const t = mesh(roundedBox(0.42, 0.016, 0.05, 0.006, 1), M.brass,
        Math.cos(a) * 2.84, 0, Math.sin(a) * 2.84)
      t.rotation.y = -a
      ticks.add(t)
    }
    seal.add(mergeParts(ticks))
    seal.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false } })
    this.root.add(seal)
    this.sealGlowRing = glowRing
  }

  // -------------------------------------------------------------------------
  // THE ROOM. Depth is the thing a menu backdrop usually has none of, so the
  // set is built as three planes of interest: a foreground (stanchions and the
  // near bullion, built in _buildDressing), a mid-ground (plinth, statue, coin)
  // and a background (the pilaster colonnade receding to the vault door). Fog
  // and the wall sconces separate them.
  //
  // Every shell surface is castShadow:false / receiveShadow:true — a ceiling
  // that casts would eat the key light, and a wall that casts would put a hard
  // edge across the floor from outside the frame.
  // -------------------------------------------------------------------------
  _buildRoom() {
    const M = this.M
    const shell = new THREE.Group()
    shell.name = 'vaultShell'

    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM.halfW + 6, ROOM.ceil + 4), M.wall)
    back.position.set(0, (ROOM.ceil + 4) / 2 - 1, ROOM.back)
    shell.add(back)

    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(30, ROOM.ceil + 4), M.wall)
      side.position.set(s * ROOM.halfW, (ROOM.ceil + 4) / 2 - 1, -2.5)
      side.rotation.y = -s * Math.PI / 2
      shell.add(side)
    }

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM.halfW, 34), M.ceiling)
    ceil.position.set(0, ROOM.ceil, -2.5)
    ceil.rotation.x = Math.PI / 2
    shell.add(ceil)

    shell.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false } })
    this.root.add(shell)

    // --- colonnade ----------------------------------------------------------
    // Five pilasters a side, receding upstage. profileLathe gives each one a
    // base flare, a slight entasis and a filleted capital in a single buffer
    // with analytic normals and crease splitting, so the capital stays crisp
    // while the shaft stays smooth. All ten merge to one draw call.
    const colProfile = [
      0.00, 0.00, 0.62, 0.00, 0.62, 0.14, 0.50, 0.26, 0.46, 0.45,
      0.42, 2.60, 0.44, 4.30, 0.50, 4.52, 0.60, 4.70, 0.60, 4.92, 0.00, 4.92,
    ]
    const colGeo = profileLathe(colProfile, 20, { creaseAngle: 42 })
    const cols = new THREE.Group()
    const bands = new THREE.Group()
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = -0.6 - i * 2.75
        const x = s * (ROOM.halfW - 0.75)
        cols.add(mesh(colGeo, M.pilaster, x, 0, z))
        bands.add(mesh(filletRing(0.5, 0.045, 6, 20), M.trim, x, 4.4, z))
      }
    }
    const colMerged = mergeParts(cols)
    const bandMerged = mergeParts(bands)
    for (const g of [colMerged, bandMerged]) {
      for (const m of g.children) { m.castShadow = true; m.receiveShadow = true }
      this.root.add(g)
    }

    // --- wall sconces -------------------------------------------------------
    // Real emitters recessed between the pilasters. Two point lights carry the
    // actual spill (one a side); the other strips are lit by the same lights
    // plus their own emission, which is how a practical is normally faked
    // without paying for eight shadowless point lights.
    const strips = new THREE.Group()
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = -1.95 - i * 2.75
        strips.add(mesh(roundedBox(0.06, 2.3, 0.14, 0.02, 1), M.sconce,
          s * (ROOM.halfW - 0.08), 3.15, z))
      }
    }
    const stripMerged = mergeParts(strips)
    for (const m of stripMerged.children) { m.castShadow = false; m.receiveShadow = false }
    this.root.add(stripMerged)

    for (const s of [-1, 1]) {
      const spill = new THREE.PointLight(0xffc48c, 12.5, 13, 2)
      spill.position.set(s * (ROOM.halfW - 1.1), 3.4, -5.2)
      this.root.add(spill)
    }

    // --- ceiling slot -------------------------------------------------------
    // The motivating source for the god-ray, moved with it to SHAFT_AT and
    // offset by the shaft's lean so the two agree. The ceiling is never in
    // frame at this focal length (it leaves the top of the picture at NDC y
    // 1.46 by z -7.4), so this is pure motivation for the volume below it — but
    // it stays, because the day someone widens the lens it must already be
    // right, and a warm slot is what makes the shaft's colour legible.
    const slot = new THREE.Group()
    // Derived from the shaft's own half-height rather than a hardcoded 2.9, so
    // moving SHAFT_AT.bottom (round 3 took it 3.2 -> 1.7) cannot silently walk
    // the motivating source off the top of the beam.
    slot.position.set(
      SHAFT_AT.x - Math.sin(SHAFT_AT.tilt) * ((SHAFT_AT.top - SHAFT_AT.bottom) / 2),
      ROOM.ceil - 0.02, SHAFT_AT.z)
    slot.add(mesh(roundedBox(1.5, 0.24, 3.4, 0.05, 1), M.steelDark, 0, 0.1, 0))
    slot.add(mesh(roundedBox(1.02, 0.06, 2.95, 0.02, 1), M.sconce, 0, -0.04, 0))
    slot.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
    this.root.add(slot)
  }

  // -------------------------------------------------------------------------
  // THE VAULT DOOR — the hero lighting moment (§3 of the brief).
  //
  // A 10 m circular door upstage centre with a HOT GOLD SEAM around its edge.
  // The glow is built the honest way: an emissive ring (so bloom, whose
  // threshold for this mood is 1.08, keys off it and nothing else) plus three
  // real point lights sitting in the recess. There is no additive cone
  // anywhere in the frame — the visible shaft in _buildAtmosphere is a
  // chord-length falloff on a real spot light's cone, not a hard-edged decal.
  //
  // Every part is +Y-axis toolkit geometry rotated a quarter turn about X so it
  // faces the camera; filletRing already lies in XZ, so the same rotation
  // stands it up in XY.
  // -------------------------------------------------------------------------
  _buildVaultDoor() {
    const M = this.M
    const door = new THREE.Group()
    door.name = 'vaultDoor'
    door.position.set(0, ROOM.doorY, ROOM.back + 0.1)

    const faceZ = (m) => { m.rotation.x = Math.PI / 2; return m }

    // Frame plate sunk into the wall, then the rolled architrave around it.
    door.add(faceZ(mesh(roundedCylinder(5.45, 0.55, 0.09, 64, 2), M.steelDark, 0, 0, -0.28)))
    door.add(faceZ(mesh(filletRing(5.05, 0.3, 10, 64), M.steel, 0, 0, -0.05)))

    // The slab itself.
    const slab = faceZ(mesh(roundedCylinder(ROOM.doorR, 0.8, 0.22, 64, 3), M.steel, 0, 0, 0.42))
    slab.castShadow = false
    slab.receiveShadow = true
    door.add(slab)

    // Concentric relief. Three rolled rings turn a disc into a machined face.
    const relief = new THREE.Group()
    for (const [r, t] of [[3.42, 0.085], [2.55, 0.07], [1.72, 0.055]]) {
      relief.add(faceZ(mesh(filletRing(r, t, 8, 56), M.steelDark, 0, 0, 0.83)))
    }
    door.add(mergeParts(relief))

    // Bolt heads around the architrave, merged to one call.
    const bolts = new THREE.Group()
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      bolts.add(faceZ(mesh(roundedCylinder(0.13, 0.2, 0.035, 12, 1), M.bolt,
        Math.cos(a) * 4.78, Math.sin(a) * 4.78, 0.18)))
    }
    door.add(mergeParts(bolts))

    // Hub and handwheel.
    // The hub was `gold` (mirror) 20 m away pointing straight down the lens
    // with three practicals on it: on f1-title it is a 40 px clipped orange
    // core dead centre of frame, and bloom then draws a star on top of it. It
    // is a machined boss on a door. Satin.
    door.add(faceZ(mesh(roundedCylinder(1.02, 0.62, 0.14, 36, 2), M.chrome, 0, 0, 0.98)))
    door.add(faceZ(mesh(roundedCylinder(0.42, 0.34, 0.08, 24, 2), M.goldSatin, 0, 0, 1.32)))
    const wheel = new THREE.Group()
    wheel.add(faceZ(mesh(filletRing(1.62, 0.09, 8, 40), M.chrome, 0, 0, 1.24)))
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const spoke = mesh(roundedBox(0.17, 3.1, 0.17, 0.05, 2), M.chrome, 0, 0, 1.24)
      spoke.rotation.z = a
      wheel.add(spoke)
    }
    this.doorWheel = wheel
    markDynamic(wheel)
    door.add(wheel)

    // THE SEAM. Two emissive rings — a hot inner line and a wider, dimmer
    // halo — plus the practicals that make the surrounding steel actually
    // brighten. Bloom does the rest.
    // Hot line 0.05 -> 0.036 (see M.seam); the outer halo widens 0.022 -> 0.032
    // and drops to the sub-bloom sconce level, so the glow now has a GRADIENT
    // across it — a bright core inside a dimmer skirt — instead of two clipped
    // concentric lines. That is also what stops the bloom kernel from reading
    // the pair as one 10 cm bar and doubling its contribution.
    door.add(faceZ(mesh(filletRing(4.52, 0.036, 6, 72), M.seam, 0, 0, 0.52)))
    door.add(faceZ(mesh(filletRing(4.66, 0.052, 6, 72), M.seamHalo, 0, 0, 0.3)))

    for (let i = 0; i < 3; i++) {
      const a = (-0.55 + i * 0.55) * Math.PI
      // 22 -> 14 -> 8, and they move OUT and BACK: radius 4.2 -> 4.62 (onto the
      // seam recess rather than the open slab) and z 1.6 -> 0.85. At 1.6 m of
      // standoff a point light sees the whole 9 m face at a shallow angle and
      // lights the relief rings and the wheel as hard as the seam; at 0.85 m,
      // out at the rim, its falloff has done most of the work by the time it
      // reaches the hub, so the glow is a rim glow. That is the difference
      // between a door with a lit seam and a glowing mandala.
      const l = new THREE.PointLight(0xffbe62, 8, 13, 2)
      l.position.set(Math.cos(a) * 4.62, Math.sin(a) * 4.62, 0.85)
      door.add(l)
    }
    // A broad warm wash from the door back into the room. This is what puts a
    // gold gradient across the granite between the colonnade and the plinth.
    // 38 -> 28: the gradient is the point, the blown floor in front of the door
    // was not, and the door is backdrop — it must not out-light the subject.
    // It is not cut further because this light and the two wall spills are what
    // carry the room MEDIAN (verifier: 76-90, inside the interior-vault band).
    // The clipped-white budget is paid by the emitters and the subject chain;
    // taking it out of the general room illumination instead would trade one
    // failed measurement for another.
    // ROUND 3: 28 -> 21 and it drops to door-local y -1.6 (world y 2.55). At
    // door-centre height it was throwing its brightest lobe at the floor
    // directly under the door, and the near-mirror granite returned that as the
    // vertical white smear visible on f1-title between the door and the
    // cordon. Lower and weaker, with a rougher floor to land on, the same light
    // now reads as the warm gradient across the granite that it was always
    // meant to be.
    const wash = new THREE.PointLight(0xffb877, 21, 24, 2)
    wash.position.set(0, -1.6, 3.4)
    door.add(wash)

    door.traverse((o) => {
      if (!o.isMesh) return
      o.receiveShadow = true
      if (o.castShadow === undefined) o.castShadow = false
    })
    this.root.add(door)
  }

  // -------------------------------------------------------------------------
  // SET DRESSING — the depth cues. Bullion stacks upstage of the plinth,
  // museum stanchions with a rope downstage, and two near-camera stanchions
  // that sit inside the pipeline's depth-of-field near field so the frame has
  // a soft foreground layer instead of starting at the subject.
  //
  // Everything here is static and merged: eleven bars, six stanchions and four
  // rope spans cost four draw calls between them.
  // -------------------------------------------------------------------------
  _buildDressing() {
    const M = this.M
    const r = rng(1701)

    // --- bullion ------------------------------------------------------------
    // A gold bar is a taper, never a box: the draft angle is most of what makes
    // a cast ingot read as one, and it gives the key light a facet to run along.
    const barGeo = taperedBox(0.52, 0.28, 0.42, 0.2, 0.17, 0.022, { rim: 0.014 })
    const bullion = new THREE.Group()
    const stack = (x, z, ry, rows) => {
      for (let i = 0; i < rows; i++) {
        const n = rows - i
        for (let j = 0; j < n; j++) {
          const b = mesh(barGeo, M.goldBar,
            x + (j - (n - 1) / 2) * 0.58 + (r() - 0.5) * 0.02,
            0.088 + i * 0.175,
            z + (r() - 0.5) * 0.03)
          b.rotation.y = ry + (r() - 0.5) * 0.06
          bullion.add(b)
        }
      }
    }
    stack(-6.6, -7.4, 0.24, 3)
    stack(6.1, -6.2, -0.34, 2)
    stack(4.9, -9.1, 0.12, 3)
    const bullionMerged = mergeParts(bullion)
    for (const m of bullionMerged.children) { m.castShadow = true; m.receiveShadow = true }
    bullionMerged.name = 'bullion'
    this.root.add(bullionMerged)

    // --- stanchions + rope --------------------------------------------------
    const postProfile = [
      0.00, 0.00, 0.19, 0.00, 0.19, 0.035, 0.15, 0.06, 0.055, 0.10,
      0.048, 0.86, 0.062, 0.90, 0.075, 0.95, 0.055, 1.00, 0.00, 1.02,
    ]
    const postGeo = profileLathe(postProfile, 18, { creaseAngle: 45 })
    const posts = []
    // The near pair sits 3.6 m from the lens, inside the pipeline's DOF near
    // field, so the bottom corners of the frame carry a soft out-of-focus layer
    // instead of starting sharp at the subject.
    const marks = [
      [-4.9, 1.7], [-0.35, 1.15], [4.25, 1.5],       // the cordon across the set
      [-2.30, 4.30], [2.30, 4.30],                    // near-camera foreground
    ]
    const postGrp = new THREE.Group()
    for (const [x, z] of marks) {
      const p = mesh(postGeo, M.steelDark, x, 0, z)
      postGrp.add(p)
      posts.push(new THREE.Vector3(x, 0.9, z))
    }
    const postMerged = mergeParts(postGrp)
    for (const m of postMerged.children) { m.castShadow = true; m.receiveShadow = true }
    this.root.add(postMerged)

    // Catenary rope spans, as splines rather than straight cylinders — a taut
    // horizontal line between two posts is the tell that nobody modelled it.
    const ropes = new THREE.Group()
    const spanPairs = [[0, 1], [1, 2]]
    for (const [a, b] of spanPairs) {
      const A = posts[a], B = posts[b]
      const steps = 10
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps
        const p0 = A.clone().lerp(B, t0)
        const p1 = A.clone().lerp(B, t1)
        p0.y -= Math.sin(t0 * Math.PI) * 0.22
        p1.y -= Math.sin(t1 * Math.PI) * 0.22
        ropes.add(strut([p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], 0.035, M.rope, 8))
      }
    }
    const ropeMerged = mergeParts(ropes)
    for (const m of ropeMerged.children) { m.castShadow = true; m.receiveShadow = true }
    this.root.add(ropeMerged)
  }

  // -------------------------------------------------------------------------
  // THE PLINTH — the black slab, fixed.
  //
  // Root cause of the black podium was never `color: 0x2a2f4a`; it was that a
  // MeshStandardMaterial with no environment, lit by one directional light
  // aimed past it, resolves to almost nothing. So the fix is threefold and only
  // one third of it is here: the mood's IBL (above), the cinematic rig's key +
  // solved ambient floor (above), and a real surface (here).
  //
  // Marble, stepped: base slab, gold reveal, tapered dado, cornice, cap. Every
  // step is a taperedBox or roundedBox with a rolled rim, so the plinth has
  // four separate horizontal highlight lines running across it — which is what
  // makes stone read as stone at 8 m.
  // -------------------------------------------------------------------------
  _buildPlinth() {
    const M = this.M
    const g = new THREE.Group()
    g.name = 'plinth'
    g.position.set(WALLY_AT.x, 0, WALLY_AT.z)
    g.rotation.y = WALLY_AT.ry

    g.add(mesh(taperedBox(2.54, 2.54, 2.40, 2.40, 0.20, 0.045, { rim: 0.03 }), M.marbleDark, 0, 0.10, 0))
    g.add(mesh(roundedBox(2.22, 0.04, 2.22, 0.014, 1), M.goldSatin, 0, 0.215, 0))
    g.add(mesh(taperedBox(2.08, 2.08, 1.92, 1.92, 0.70, 0.055, { rim: 0.035 }), M.marble, 0, 0.585, 0))
    g.add(mesh(taperedBox(1.96, 1.96, 2.24, 2.24, 0.15, 0.04, { rim: 0.028 }), M.marbleDark, 0, 1.010, 0))
    g.add(mesh(roundedBox(2.30, 0.06, 2.30, 0.022, 2), M.marble, 0, 1.115, 0))
    g.add(mesh(roundedBox(2.34, 0.028, 2.34, 0.010, 1), M.goldSatin, 0, 1.152, 0))

    // The dedication plate. A real emitter at a modest 1.35 so it reads as
    // backlit brass rather than as a light source.
    g.add(mesh(roundedBox(1.10, 0.11, 0.035, 0.014, 1), M.inscription, 0, 0.62, 0.965))
    g.add(mesh(roundedBox(1.22, 0.19, 0.03, 0.012, 1), M.goldSatin, 0, 0.62, 0.945))

    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    // The plinth is the one thing in the frame that MUST sit on the floor
    // rather than hover over it, so it gets its own fitted occlusion pool.
    g.userData.contactShadow = { spread: 1.1, opacity: 0.55 }
    this.root.add(g)
    this.plinth = g
    this.plinthTop = 1.166
  }

  // -------------------------------------------------------------------------
  // WALLY. Built from the SHIPPED character (WallyDef.buildModel), not sculpted
  // a second time — the old menu silhouette was 13 boxes still wearing the
  // retired suit, and any hand-built copy drifts again the next time the
  // character changes. buildModel() makes its own scoped material cache
  // (`wally#N`), so this instance shares nothing with an in-match fighter and
  // no flash/tint can reach across.
  //
  // Surface: the matte vinyl of the art toy itself. Committed to deliberately —
  // this is the Permanent Reserve's display piece, not a bronze of him, and the
  // moment we re-surface it we are back to a second divergent Wally.
  // Separation from the dark set comes from the rig's fresnel rim + specular
  // key, which is what those exist for.
  // -------------------------------------------------------------------------
  _buildWally() {
    const built = WallyDef.buildModel(0)
    const model = built && built.group
    if (!model) return
    this.wallyBones = built.bones || {}

    model.position.set(WALLY_AT.x, this.plinthTop || 1.166, WALLY_AT.z)
    model.rotation.y = WALLY_AT.ry - 0.55     // three-quarter view to camera
    model.name = 'menuWally'
    markDynamic(model)                        // never absorb him into a merge
    this.root.add(model)
    this.wally = model

    // A hero stance rather than the rest pose: weight settled, arms a touch
    // off the body so the silhouette has daylight in it, head turned to camera.
    const B = this.wallyBones
    if (B.armL) B.armL.rotation.z = -0.16
    if (B.armR) B.armR.rotation.z = 0.16
    if (B.forearmL) B.forearmL.rotation.x = -0.18
    if (B.forearmR) B.forearmR.rotation.x = -0.12
    if (B.torso) B.torso.rotation.y = 0.12
    if (B.head) { B.head.rotation.y = 0.16; B.head.rotation.x = -0.04 }
    if (B.trunk) B.trunk.rotation.x = -0.10

    // Rest heights for the idle, captured after the stance is applied.
    this._rest = {
      hipsY: B.hips ? B.hips.position.y : 0.92,
      hipsX: B.hips ? B.hips.position.x : 0,
      hipsRZ: B.hips ? B.hips.rotation.z : 0,
      torsoRX: B.torso ? B.torso.rotation.x : 0,
      torsoRY: B.torso ? B.torso.rotation.y : 0,
      headRX: B.head ? B.head.rotation.x : 0,
      headRY: B.head ? B.head.rotation.y : 0,
      trunkRX: B.trunk ? B.trunk.rotation.x : 0,
      trunk2RX: B.trunk2 ? B.trunk2.rotation.x : 0,
      trunk3RX: B.trunk3 ? B.trunk3.rotation.x : 0,
      earLRZ: B.earL ? B.earL.rotation.z : 0,
      earRRZ: B.earR ? B.earR.rotation.z : 0,
    }

    // Register him as the rig's subject: fresnel separation rim on his own
    // materials, castShadow on every mesh, and the contact pool. His feet are
    // 1.17 m up on the plinth, so the pool is suppressed and the plinth's own
    // prop disc does the grounding instead.
    if (this.rig) {
      try {
        if (this.rig.rimShader) this.rig.rimShader.apply(model)
        model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.castShadow = true })
      } catch (e) { console.warn('[menuBackdrop] rig subject registration failed', e) }
    }

    // -----------------------------------------------------------------------
    // THE HERO KEY. Two lights, because one light from above is a museum
    // display and a hero needs a face.
    //
    // 1. The top spot, 55 -> 30 W. At 7.3 m with decay 1.6 the old value put
    //    ~2.25 of irradiance on a 0.49-albedo subject; on its own that is over
    //    the ACES shoulder before the key, the subject fill and the IBL are
    //    added. Widened (0.30 -> 0.345) and softened (penumbra 0.72 -> 0.82) so
    //    the pool falls across the whole plinth instead of ending in a rim.
    // 2. A short-throw warm EYE LIGHT from camera left, at chest height. This
    //    is the light that actually makes him read as the hero: the top spot
    //    describes his mass, this one puts a value into the trunk, the tusks
    //    and the underside of the brow that the ceiling light cannot reach, and
    //    it gives the shades their specular. Range 6.4 m with decay 2 means it
    //    has fallen to nothing before it reaches the floor inlay or the door,
    //    so it costs nothing in the clipped-white budget it is not spending on
    //    him.
    // -----------------------------------------------------------------------
    // ROUND 3: 30 -> 26.5, and this is a NEUTRAL edit, not a further cut. Round
    // 3 raises the IBL 1.12 -> 1.24, the fill 0.86 -> 0.96 and the bounce 0.42
    // -> 0.52 to hold the room median while the door comes down, and all three
    // land on him too. Taking the same amount back off his own key keeps his
    // lit side inside the 215-235 band round 2 measured — the band where a
    // shoulder still has a gradient across it rather than a plateau — while
    // everything he is standing in front of gets darker. Relative contrast is
    // what makes a hero, and it is now bought entirely from the backdrop.
    const spot = new THREE.SpotLight(0xffe0b0, 26.5, 16, 0.345, 0.82, 1.6)
    spot.position.set(WALLY_AT.x + 0.30, ROOM.ceil - 0.35, WALLY_AT.z - 0.40)
    spot.target.position.set(WALLY_AT.x, 1.6, WALLY_AT.z)
    spot.castShadow = false
    this.root.add(spot, spot.target)
    this.statueSpot = spot

    const eye = new THREE.PointLight(0xffdcb0, 6.0, 6.4, 2)
    eye.position.set(WALLY_AT.x - 1.55, 2.45, WALLY_AT.z + 2.35)
    this.root.add(eye)
    this.eyeLight = eye

    // -----------------------------------------------------------------------
    // 3. THE SEPARATION RIM — round 3, and it is a composition fix, not a
    //    lighting one.
    //
    // Wally projects to NDC x 0.30..0.59 and the vault door's right rim to
    // x 0.38..0.56. His silhouette is therefore laid ON the door's brightest
    // arc at every point of the camera arc, and both are warm: a cream subject
    // against a gold rim at a similar value, which is the definition of a
    // subject that does not separate. Round 2 answered "is he the hero?" by
    // making the door dimmer; the other half of the answer is an edge.
    //
    // Cold, from behind and camera-right, at head-and-shoulder height. Range
    // 5.8 m with decay 2 means it is gone before the plinth's far corner, so it
    // cannot spill onto the floor inlay or the door and cost anything in the
    // clipped-white budget. It is the ONLY cold light on him, so the edge it
    // draws is a hue break as well as a value break — that is what survives
    // when a menu overlay drops a dark scrim over the frame.
    const rimBack = new THREE.PointLight(0x9ec6ff, 7.5, 5.8, 2)
    rimBack.position.set(WALLY_AT.x + 2.05, 3.35, WALLY_AT.z - 2.05)
    this.root.add(rimBack)
    this.rimBackLight = rimBack
  }

  // -------------------------------------------------------------------------
  // THE COIN. Struck metal, not a printed disc. The old one was a cylinder plus
  // two circles carrying a canvas "W" at metalness 0.5 — with no environment,
  // that is a flat khaki circle.
  //
  // Now: gold preset (roughness 0.12 absolute, metalness 1.0, envMapIntensity
  // 1.5) over a filleted cylinder, with a reeded edge, a raised rim on both
  // faces, and the W as four capsule struts in RELIEF, so the key light runs
  // along the letterform and the IBL fills the flanks. The whole reeded edge is
  // one merged buffer.
  // -------------------------------------------------------------------------
  _buildCoin() {
    const M = this.M
    const coin = new THREE.Group()
    coin.name = 'wCoin'
    const faceZ = (m) => { m.rotation.x = Math.PI / 2; return m }

    coin.add(faceZ(mesh(roundedCylinder(1.14, 0.19, 0.05, 56, 3), M.gold)))

    // Reeding: 52 milled flutes around the edge, merged to one call.
    const reed = new THREE.Group()
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * Math.PI * 2
      const f = mesh(roundedBox(0.03, 0.03, 0.16, 0.009, 1), M.goldSatin,
        Math.cos(a) * 1.145, Math.sin(a) * 1.145, 0)
      f.rotation.z = a
      reed.add(f)
    }
    coin.add(mergeParts(reed))

    // Raised rim + a beaded ring on both faces.
    for (const s of [1, -1]) {
      coin.add(faceZ(mesh(filletRing(0.99, 0.052, 8, 56), M.gold, 0, 0, s * 0.082)))
      const beads = new THREE.Group()
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2
        beads.add(mesh(ball(0.028, 8), M.goldSatin, Math.cos(a) * 0.87, Math.sin(a) * 0.87, s * 0.092))
      }
      coin.add(mergeParts(beads))

      // THE W, in relief. Four capsules with rounded joins.
      const z = s * 0.10
      const pts = [[-0.50, 0.40], [-0.26, -0.40], [0.00, 0.22], [0.26, -0.40], [0.50, 0.40]]
      const glyph = new THREE.Group()
      for (let i = 0; i < pts.length - 1; i++) {
        glyph.add(strut([pts[i][0], pts[i][1], z], [pts[i + 1][0], pts[i + 1][1], z], 0.075, M.gold, 10))
      }
      coin.add(mergeParts(glyph))
    }

    coin.position.set(COIN_AT.x, COIN_AT.y, COIN_AT.z)
    coin.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    markDynamic(coin)
    this.root.add(coin)
    this.coin = coin

    // One cool practical behind the coin so its silhouette separates from the
    // warm vault door: the coin is the only cold-rimmed object in the frame.
    // 9 -> 6.5. Against a mirror-gold disc a backlight at 9 was returning a
    // clipped crescent along the whole upper rim (visible on f1-title-relit as
    // a white blob rather than a coin), which is the second-largest block of
    // clipped white after the door hub and buys nothing: the separation comes
    // from the HUE difference, not from the level.
    const back = new THREE.PointLight(0x9fd8ff, 6.5, 9, 2)
    back.position.set(COIN_AT.x + 1.1, COIN_AT.y + 0.9, COIN_AT.z - 1.5)
    this.root.add(back)
  }

  // -------------------------------------------------------------------------
  // MARKET CANDLES. Was: MeshBasicMaterial, i.e. unlit flat quads that bloom
  // could not see. Now: emissive() at 2.1, which is above this mood's 1.08
  // bloom threshold, so the green and red ticks are the things that glow — and
  // the only things, because everything else in the frame is a real surface.
  //
  // They drift up through the vault as a holographic tape, kept out to the
  // sides and upstage so they never cross the title text.
  // -------------------------------------------------------------------------
  _buildCandles() {
    const M = this.M
    const r = rng(90210)
    const bodyGeo = new Map()
    // ROUND 3 — 16 -> 11, and pushed out and back.
    //
    // On f1-title they read as floating confetti: |x| started at 4.4 m and z at
    // -4.0, which projects a red tick to NDC (0.05, 0.9) — dead centre-top,
    // directly over the vault door and directly under where the title lockup
    // sits — and puts several of them within a coin's width of the hero's head.
    // Sixteen saturated primaries scattered across every third of the frame is
    // noise, not set dressing. Eleven, out at |x| 6.2-11.4 and back at z -6 to
    // -13.5, read as a distant ticker running along the walls behind the
    // colonnade, which is what they are supposed to be. They also stop
    // competing with the shaft, which now owns the left third.
    for (let i = 0; i < 11; i++) {
      const up = r() > 0.44
      const h = 0.30 + r() * 0.62
      const key = h.toFixed(2)
      if (!bodyGeo.has(key)) bodyGeo.set(key, roundedBox(0.14, h, 0.14, 0.03, 1))
      const grp = new THREE.Group()
      const mat = up ? M.candleUp : M.candleDown
      grp.add(new THREE.Mesh(bodyGeo.get(key), mat))
      grp.add(mesh(roundedBox(0.032, h * 1.85, 0.032, 0.012, 1), mat))
      // Sides and upstage only: the middle third of the frame belongs to the UI.
      const side = r() > 0.5 ? 1 : -1
      grp.position.set(side * (6.2 + r() * 5.2), r() * 8.2, -6.0 - r() * 7.5)
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
      markDynamic(grp)
      this.root.add(grp)
      this.candles.push({ grp, speed: 0.34 + r() * 0.62, sway: r() * Math.PI * 2, spin: (r() - 0.5) * 0.5 })
    }
  }

  // -------------------------------------------------------------------------
  // ATMOSPHERE. Two elements, both of which exist so the frame has air in it.
  //
  // 1. DUST. ~280 motes drifting through the room on a soft procedural sprite.
  //    This is what makes the shaft visible; without particulate there is
  //    physically nothing for a light shaft to scatter off.
  //
  // 2. THE SHAFT — rebuilt. It was still reading as a hard-edged white wedge,
  //    and there were four separate reasons, all of which had to go:
  //
  //    a. IT INTERSECTED GEOMETRY. The cone ran from y 1.0 to y 9.0 with a
  //       2.05 m base, co-axial with the statue — so it passed THROUGH the
  //       plinth, through Wally and into the floor. Wherever an additive shell
  //       is clipped by a depth buffer it terminates on an analytic curve with
  //       no gradient across it, and that curve is a hard edge no shader can
  //       soften from inside. Volumetrics must die in mid-air. This one now
  //       lives upstage-left over an empty part of the floor, and fades out
  //       3.2 m above it.
  //    b. THE FALLOFF WAS BACKWARDS. |dot(N,V)| raised to 0.65 is a CONCAVE
  //       curve: it lifts the silhouette rather than dropping it, so the one
  //       term that was supposed to soften the rim was sharpening it. The
  //       exponent is now 2.1 — convex, zero-slope at the silhouette.
  //    c. NO NOISE. A perfectly smooth cone is the giveaway. Three octaves of
  //       value noise in world space, drifting downward at 5.5 cm/s, break the
  //       body into strands and — crucially — modulate the EDGE, which is what
  //       real particulate does.
  //    d. NO DEPTH FADE. It now dissolves into the room's own fog curve, using
  //       the same near/far as scene.fog, so it recedes exactly as the walls do
  //       instead of being equally bright at every depth.
  //
  //    The light it depicts is still real: the ceiling slot sits on its axis,
  //    and its own colour is the slot's.
  // -------------------------------------------------------------------------
  _buildAtmosphere() {
    const r = rng(4242)

    const N = 280
    const pos = new Float32Array(N * 3)
    this._motePhase = new Float32Array(N)
    this._moteSpeed = new Float32Array(N)
    // Which motes belong to the beam. Without this the recycler in update()
    // sends them to y -0.2 the first time they reach the ceiling and the beam
    // is empty inside a minute — the classic "looked right in the first
    // screenshot" bug.
    this._moteBeam = new Uint8Array(N)
    // 40 % of the motes are seeded INSIDE the shaft's cone. A light shaft is
    // only visible because of what is in it, and a uniform room-wide scatter
    // leaves the volume looking like a decal with dust in front of it. These
    // ones are also the only place in the frame where a mote is lit from
    // directly above, which is what sells the shaft as a beam.
    for (let i = 0; i < N; i++) {
      const inBeam = i % 5 < 2
      this._moteBeam[i] = inBeam ? 1 : 0
      if (inBeam) {
        const a = r() * Math.PI * 2
        const y = SHAFT_AT.bottom + r() * (SHAFT_AT.top - SHAFT_AT.bottom - 0.6)
        // Radius tracks the cone's own taper, plus a little spill outside it.
        const k = (y - SHAFT_AT.bottom) / (SHAFT_AT.top - SHAFT_AT.bottom)
        const rad = (1.70 - k * 1.08) * (0.25 + r() * 1.05)
        // rotation.z = +tilt maps local (0, dy, 0) to (-sin(tilt)*dy, …), so the
        // beam's axis leans -x with height. Match it or the motes drift out of
        // their own shaft.
        const axisX = SHAFT_AT.x - Math.sin(SHAFT_AT.tilt) * (y - (SHAFT_AT.bottom + (SHAFT_AT.top - SHAFT_AT.bottom) / 2))
        pos[i * 3 + 0] = axisX + Math.cos(a) * rad
        pos[i * 3 + 1] = y
        pos[i * 3 + 2] = SHAFT_AT.z + Math.sin(a) * rad
      } else {
        pos[i * 3 + 0] = (r() * 2 - 1) * 10.5
        pos[i * 3 + 1] = r() * 8.4
        pos[i * 3 + 2] = 4.0 - r() * 16.0
      }
      this._motePhase[i] = r() * Math.PI * 2
      this._moteSpeed[i] = 0.05 + r() * 0.14
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const moteMat = new THREE.PointsMaterial({
      map: moteTexture(),
      color: 0xffe6c4,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const motes = new THREE.Points(geo, moteMat)
    motes.name = 'dust'
    motes.frustumCulled = false
    markDynamic(motes)
    this.root.add(motes)
    this.motes = motes

    // --- the shaft ----------------------------------------------------------
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffdcae) },
        // 0.135 -> 0.22. Peak radiance is uIntensity x turbulence (<=1.34) x 2
        // for the double-sided chord, so 0.22 tops out near 0.56 linear: half
        // the value of the wall it stands against, well under this mood's 1.26
        // bloom gate, and nowhere near the 6.5 linear that clips. Visible as
        // light, never as a surface.
        uIntensity: { value: 0.22 },
        uTime: { value: 0 },
        uFogNear: { value: 11.0 },
        uFogFar: { value: 46.0 },
      },
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vW;
        varying float vH;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          vN = normalize(normalMatrix * normal);
          vV = -mv.xyz;
          vW = wp.xyz;
          vH = uv.y;              // 1 at the ceiling, 0 at the open bottom
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vW;
        varying float vH;

        float h31(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        }
        // Trilinear value noise. Cheap, C1-smooth, and deterministic — no
        // texture, no Math.random(), nothing to load.
        float vnoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = mix(mix(h31(i + vec3(0.0, 0.0, 0.0)), h31(i + vec3(1.0, 0.0, 0.0)), f.x),
                        mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
          float b = mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x),
                        mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
          return mix(a, b, f.z);
        }
        float fbm(vec3 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
          return s;
        }

        void main() {
          float dist = length(vV);
          // Analytic chord through the cone. CONVEX now (2.1, was 0.65): the
          // silhouette leaves with zero slope, so there is no rim to see.
          float f = abs(dot(normalize(vN), normalize(vV)));
          float body = pow(clamp(f, 0.0, 1.0), 2.1);
          // Dies in mid-air. Squared so the last two metres are a long tail
          // rather than a visible end.
          float bottom = smoothstep(0.0, 0.58, vH);
          bottom *= bottom;
          // Feathers into the slot instead of starting on a hard disc.
          float top = 1.0 - smoothstep(0.90, 1.0, vH);
          // Particulate. Drifts DOWN with the room's convection, at a different
          // rate from the dust motes so the two never lock into one motion.
          vec3 q = vW * vec3(0.55, 0.30, 0.55) + vec3(0.0, -uTime * 0.055, 0.0);
          float n1 = fbm(q);
          float n2 = fbm(q * 2.7 + 11.3);
          float turb = mix(0.40, 1.20, n1) * mix(0.76, 1.12, n2);
          // Depth fade on the room's own fog curve.
          float fog = 1.0 - smoothstep(uFogNear, uFogFar, dist);
          // Additive blending is src*srcAlpha + dst, so everything has to live
          // in rgb and alpha stays at 1 — otherwise the falloff is applied
          // twice and the shaft has a squared, harder edge.
          gl_FragColor = vec4(uColor * (uIntensity * body * bottom * top * turb * fog), 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    if (this.scene.fog) {
      shaftMat.uniforms.uFogNear.value = this.scene.fog.near
      shaftMat.uniforms.uFogFar.value = this.scene.fog.far
    }
    const h = SHAFT_AT.top - SHAFT_AT.bottom
    // Base radius 1.95 -> 1.7 so the cone's right edge stops at NDC -0.46, on
    // the door's left rim rather than over it.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 1.70, h, 34, 1, true), shaftMat)
    shaft.position.set(SHAFT_AT.x, SHAFT_AT.bottom + h / 2, SHAFT_AT.z)
    // A perfectly plumb shaft reads as a modelled cone; a leaning one reads as
    // light arriving from somewhere. The ceiling slot is offset to match.
    shaft.rotation.z = SHAFT_AT.tilt
    shaft.userData.noBevel = true
    shaft.renderOrder = 3
    shaft.frustumCulled = false
    markDynamic(shaft)
    this.root.add(shaft)
    this.shaft = shaft
    this.shaftMat = shaftMat
  }

  // -------------------------------------------------------------------------
  // update — §0.5. Nothing moves linearly: the camera arc, the coin spin, the
  // handwheel and the statue's breath all run on offset sines so no two beats
  // land together and the shot never reads as looping.
  // -------------------------------------------------------------------------
  update(dt) {
    const d = Math.min(Math.max(dt || 0, 0), 0.1)
    this.t += d
    const t = this.t

    // --- camera: a slow lateral arc with a breathing dolly -------------------
    // Two incommensurate harmonics, so the arc never repeats inside a session
    // and the eye cannot find the loop point. Amplitudes sum to ~1.05, which is
    // the number the composition was projected against.
    const arc = Math.sin(t * 0.115) * 0.86 + Math.sin(t * 0.047 + 2.1) * 0.19
    this.camera.position.x = arc * 0.95
    this.camera.position.y = 1.95 + Math.sin(t * 0.19 + 1.1) * 0.11
    this.camera.position.z = 7.9 + Math.cos(t * 0.083) * 0.42
    this.camera.lookAt(this._look.x + arc * 0.10, this._look.y, this._look.z)

    // --- coin ----------------------------------------------------------------
    if (this.coin) {
      this.coin.rotation.y = t * 0.62
      this.coin.rotation.z = Math.sin(t * 0.47) * 0.06
      this.coin.position.y = COIN_AT.y + Math.sin(t * 1.05) * 0.16
    }
    if (this.doorWheel) this.doorWheel.rotation.z = Math.sin(t * 0.11) * 0.30

    // --- Wally's idle --------------------------------------------------------
    const B = this.wallyBones
    const R = this._rest
    if (B && R) {
      const breath = Math.sin(t * 1.15)
      // A WEIGHT SHIFT under the breath, on a much slower and prime-ratio clock
      // (0.137 Hz against 1.15) so the two never phase-lock into one bob. This
      // is the difference between a statue with a sine on it and a heavy animal
      // standing still: the mass moves side to side, the hips tilt into the
      // loaded leg, and the torso counter-rotates a fraction behind.
      const shift = Math.sin(t * 0.137)
      const shiftLag = Math.sin(t * 0.137 - 0.42)
      if (B.hips) {
        B.hips.position.y = R.hipsY + breath * 0.014 - Math.abs(shift) * 0.008
        B.hips.position.x = R.hipsX + shift * 0.026
        B.hips.rotation.z = R.hipsRZ - shift * 0.026
      }
      if (B.torso) {
        B.torso.rotation.x = R.torsoRX + breath * 0.022
        B.torso.rotation.y = R.torsoRY - shiftLag * 0.030
      }
      // He tracks the camera as it arcs. Head leads, torso follows — the whole
      // reason to keep a real rig behind the menu instead of a baked pose.
      if (B.head) {
        B.head.rotation.x = R.headRX - breath * 0.018
        B.head.rotation.y = R.headRY + arc * 0.075 + shiftLag * 0.022
      }
      const curl = Math.sin(t * 0.62)
      if (B.trunk) B.trunk.rotation.x = R.trunkRX + curl * 0.05
      if (B.trunk2) B.trunk2.rotation.x = R.trunk2RX + Math.sin(t * 0.62 - 0.5) * 0.07
      if (B.trunk3) B.trunk3.rotation.x = R.trunk3RX + Math.sin(t * 0.62 - 1.0) * 0.09
      const flap = Math.sin(t * 0.83)
      if (B.earL) B.earL.rotation.z = R.earLRZ + flap * 0.045
      if (B.earR) B.earR.rotation.z = R.earRRZ - flap * 0.045
    }

    // --- candles -------------------------------------------------------------
    for (const c of this.candles) {
      const p = c.grp.position
      p.y += c.speed * d
      p.x += Math.sin(t * 0.7 + c.sway) * d * 0.22
      c.grp.rotation.y += c.spin * d
      if (p.y > 9.2) {
        p.y = -0.8
        c.sway = (c.sway + 1.7) % (Math.PI * 2)
      }
    }

    // --- dust ----------------------------------------------------------------
    if (this.motes) {
      const a = this.motes.geometry.getAttribute('position')
      const arr = a.array
      const beam = this._moteBeam
      for (let i = 0; i < a.count; i++) {
        const k = i * 3
        arr[k + 1] += this._moteSpeed[i] * d
        arr[k] += Math.sin(t * 0.31 + this._motePhase[i]) * d * 0.09
        if (beam && beam[i]) {
          // Beam motes recycle inside the beam, not into the room.
          if (arr[k + 1] > SHAFT_AT.top - 0.6) arr[k + 1] = SHAFT_AT.bottom + 0.1
        } else if (arr[k + 1] > 8.6) {
          arr[k + 1] = -0.2
        }
      }
      a.needsUpdate = true
    }

    // --- lighting ------------------------------------------------------------
    // The shaft breathes a few percent so it does not read as a static decal,
    // and its turbulence field drifts on its own clock.
    if (this.shaftMat) {
      const u = this.shaftMat.uniforms
      u.uIntensity.value = 0.22 + Math.sin(t * 0.27) * 0.032
      u.uTime.value = t
    }
    if (this.rig) {
      try { this.rig.update(d, null, this.camera) } catch { /* never break a menu frame */ }
    }
  }

  // GRAPHICS_CONTRACT §8: every draw goes through the shared post stack.
  // `this.game || renderer` — the backdrop is a lazy singleton built before
  // some screens exist, and renderScene accepts a bare renderer (it reaches the
  // pipeline through renderer.__wcsPipeline) so a missing game can never cost
  // us the frame.
  //
  // The environment retry lives here because the same singleton can be built
  // before Game owns a renderer, and a menu with no IBL is exactly the failure
  // this rewrite exists to remove.
  render(renderer, dt = 1 / 60) {
    if (renderer && renderer.isWebGLRenderer) this._renderer = renderer
    if (!this.envHandle && this._renderer) this._tryEnvironment()
    // Cheap per-frame guard: the singleton can outlive several resizes and can
    // be constructed before the canvas has ever been laid out. A stale or NaN
    // aspect is a silently black screen, so re-solve it whenever it disagrees.
    const a = this._aspect()
    if (!(Math.abs(a - this.camera.aspect) < 1e-4)) {
      this.camera.aspect = a
      this.camera.updateProjectionMatrix()
    }
    // The lens is scoped to THIS draw call and handed straight back. The
    // pipeline is global and several front-end screens draw the backdrop and
    // then draw a second scene (the lit character bakes on select / gallery /
    // VS / results) through the same pipeline with a different camera — a focus
    // target left pointing at a plinth in the vault would defocus those by
    // whatever the two cameras happen to disagree by. Apply, draw, restore.
    this._applyDoF()
    try {
      renderScene(this.game || renderer, this.scene, this.camera, dt)
    } finally {
      this._restoreDoF()
    }
  }

  /** Not used today — the singleton lives for the session — but symmetrical. */
  dispose() {
    removeEventListener('resize', this._onResize)
    try { this._offResize?.() } catch { /* already gone */ }
    try { this._offScreen?.() } catch { /* already gone */ }
    this._restoreDoF()
    try { this.envHandle?.dispose() } catch { /* already gone */ }
    try { this.rig?.dispose() } catch { /* already gone */ }
    this.shaftMat?.dispose()
    if (this.motes) { this.motes.geometry.dispose(); this.motes.material.map?.dispose(); this.motes.material.dispose() }
    _instance = null
  }
}
