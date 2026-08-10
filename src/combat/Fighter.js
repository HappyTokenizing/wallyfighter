// Fighter — kinematic free-roam fighter entity: XZ movement, state machine,
// animation, move execution, stun/launch/knockdown handling. Hit RESOLUTION
// lives in MatchScreen (it touches both fighters, events, camera, physics);
// this class owns one body and its feel. Per CONTRACTS.md §4/§5/§11/§17.
//
// v2.0 (§17): fighters roam the whole arena floor. `fighter.facing` is now a
// YAW ANGLE in radians — the facing direction on the plane is
// (cos(facing), 0, -sin(facing)), i.e. yaw 0 faces +X (the v1 "facing = +1")
// and yaw π faces -X (the v1 "facing = -1"). `fighter.facingSign` keeps the
// legacy ±1 semantics (toward the foe, projected on world X) so v1 move-input
// token resolution ('forward'/'back') and AI intents keep working. Character
// scripts still see ±1 through the SpecialContext legacy view (fx.self.facing).
import * as THREE from 'three'
import { Animator } from './Animator.js'
import { makeFallbackDef, defNeedsFallback } from './FallbackDef.js'
// Namespace import ON PURPOSE (not named): the render layer is being built out
// concurrently and the copy-on-write "claim a mutable instance" helper has not
// settled on a final name yet. A named import of a not-yet-existing export is a
// hard module-link error; a namespace import degrades to a local fallback.
// See src/render/README.md §5 and the dispose() header below.
import * as RENDER from '../render/index.js'

const GRAVITY = -22
const JUGGLE_GRAVITY = GRAVITY * 0.88 // juggled foes hang slightly — combos feel generous
const BUTTONS = new Set(['light', 'heavy', 'kick', 'grab', 'special', 'super'])
const KIND_PRIORITY = { super: 60, special: 40, grab: 30, launcher: 25, joke: 24, heavy: 20, kick: 18, light: 10 }
const AIR_KINDS = ['light', 'heavy', 'kick']
const CANCEL_TABLE = {
  light: ['light', 'heavy', 'kick', 'launcher', 'special', 'super'],
  heavy: ['special', 'super'],
  kick: ['special', 'super'],
  launcher: ['special', 'super'],
  joke: [],
  special: ['super'],
  grab: [],
  super: [],
}
const TAP_WINDOW = 20 // frames: ↓↓-style tap sequences must land inside this
// v2.1 mobile-feel recovery pass (~35-40% faster fall->standing):
// non-ragdoll trip knockdown 42 -> 26 down-beat frames, getup 22 -> 14 frames
// (the getup clip plays playFitted-style faster, readability-clamped).
const KNOCKDOWN_TRIP_FRAMES = 26
const GETUP_FRAMES = 14
const GETUP_INVULN = 24        // wake-up invulnerability window — UNCHANGED
const GETUP_MAX_CLIP_SPEED = 2.5
const CHAIN_DRIFT_SPEED = 15   // m/s homing toward the foe during chained startup
const CHAIN_DRIFT_MAX = 3      // total meters a chained follow-up may close
const NEUTRAL_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block', 'jump'])
const HEAVY_KINDS = new Set(['heavy', 'launcher', 'super'])
// §17 soft lock-on: auto-face the foe when attacking or within this range.
const LOCK_RANGE = 6
// states where the fighter may smooth-yaw (reactions/ragdoll keep their facing)
const LOCK_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block', 'jump'])
// states exempt from the model-desync tripwire: physics/scripts own the visual
const GUARD_EXEMPT = new Set(['ragdoll', 'finisher', 'grabbed'])
const _headPos = new THREE.Vector3()
const _guardPos = new THREE.Vector3()
const _flashTint = new THREE.Color()

// ===========================================================================
// IMPACT FLASH (v3.4 rewrite — the single worst artifact in the build)
//
// WHAT WAS WRONG. flash() set emissive 0xffffff at intensity 1 on EVERY claimed
// material — hide, suit, hat, mug, shoes — and `flashFrames` only decremented
// in update(), which hit-stop freezes. Measured on the victim's bounding box:
// 30.1% of pixels above luma 245, held for hitStop + 2 frames, which is 133 ms
// on a counter heavy. The opponent became a featureless white paper cut-out at
// the exact moment a fighting-game player has to read their state, and it
// pushed frame-wide clipping to 1.15% against the pipeline's own 0.8% limit.
//
// WHAT IT IS NOW. Three changes, and each one is load-bearing:
//
//  1. SILHOUETTE-PRESERVING. The added emissive is a blend of the material's
//     OWN albedo with the impact tint, scaled DOWN as that material gets
//     brighter. A black boot lifts to a dark ember, a white skull barely
//     moves. Form survives because the flash no longer swamps the shading
//     variation that describes it — which is the entire failure mode of a flat
//     white flood, and why 30% of the body clipped.
//
//  2. CAPPED. Peak added radiance is FLASH_PEAK (0.34), not 1.0.
//
//  3. WALL-CLOCK DECAY, so hit-stop cannot extend it. The fighter has no
//     render-cadence tick of its own (MatchScreen._updatePresentation does not
//     touch fighters), so the decay is driven from an onBeforeRender hook
//     installed on the fighter's own meshes, with update() as a backstop. Both
//     paths call the same idempotent tick against performance.now(), so the
//     flash is over in FLASH_MS whatever the simulation is doing.
//
// Emitters (glowing eyes, UNCHAINED cracks) keep their baseline: the flash is
// ADDED to it rather than replacing it, which also retires the old
// "force emissiveIntensity to 1 so the bloom threshold survives" hack.
// ===========================================================================
// Peak ADDED emissive radiance, linear, BEFORE the per-material albedo
// weighting. Measured over the real roster that lands between 0.14 and 0.28
// added radiance depending on the surface — against the 1.000 flat white flood
// it replaces, which is what drove 30.1% of the victim's bounding box past
// luma 245 and pushed frame clipping to 1.15% against a 0.8% limit.
const FLASH_PEAK = 0.40
const FLASH_MS_MIN = 26         // ~1.5 rendered frames
const FLASH_MS_MAX = 54         // hard ceiling: ~3 rendered frames, always
const FLASH_TINT_MIX = 0.5      // how far the added colour leans off the albedo
const _now = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now() : Date.now())

// ===========================================================================
// v3.3 ANIMATION WIRING (GRAPHICS_CONTRACT §11)
//
// The Animator ships bit-identical to v3.2 by DEFAULT — the clip-format
// compatibility guarantee is a property of the module, and ten character files
// depend on it. This object is the single place the game opts in, and setting
// it to `{}` reverts the entire roster to v3.2 playback in one edit.
//   interp:'auto'  Catmull-Rom on key gaps > 0.12 s + anticipation/overshoot
//                  shaping on non-looping clips. Splines pass exactly through
//                  every key, so no authored pose or beat moves.
//   layers         breathing / look-at / impact flinch / damage limp, additive
//                  over whatever clip is playing.
//   secondary      spring follow-through on ears, trunks, tails, cloth, bellies.
//   ik             two-bone foot planting + stance lock.
// ===========================================================================
const ANIM_OPTS = { interp: 'auto', layers: true, secondary: true, ik: true }

// Mirrors CORE_BONES in src/physics/RagdollManager.js. That manager runs an
// always-on accessory sway spring over every bone NOT in this set and layers it
// on top of the animator's output, so the animator hands it the X/Z swing on
// those bones and keeps only the channels it does not write (Y twist, soft-flesh
// jiggle). Two solvers on one axis is double amplitude, not double quality.
const RAGDOLL_CORE_BONES = new Set(['hips', 'torso', 'head', 'armL', 'armR',
  'legL', 'legR', 'forearmL', 'forearmR', 'shinL', 'shinR'])

// Foot IK only runs where the fighter is standing on the floor under its own
// power. Reactions, air, knockdown, ragdoll and scripted moves own their legs.
const IK_STATES = new Set(['idle', 'walk', 'dash', 'backdash', 'crouch', 'block', 'attack'])
// Where the head is allowed to track the opponent, and how strongly.
const LOOK_WEIGHT = {
  idle: 1, walk: 0.85, crouch: 0.9, block: 0.7, dash: 0.6, backdash: 0.75,
  jump: 0.5, attack: 0.45,
}
// Idle breathing authority per state — 0 anywhere the body is already busy.
const BREATHE_WEIGHT = { idle: 1, crouch: 0.9, block: 0.75, walk: 0.35, win: 0.8, lose: 1 }
// v3.4 idle weight shift. Only where the fighter is standing on its own two
// feet with nothing else to do; a walk cycle already carries its own transfer,
// so it gets a token amount and an attack gets none (the torque layer owns the
// pelvis for the duration of a move).
const SWAY_WEIGHT = { idle: 1, block: 0.6, crouch: 0.45, walk: 0.22, win: 0.7, lose: 0.55 }
const LOW_HP_LIMP = 0.42        // limp starts once health drops under this fraction
const ROOT_MOTION_CLAMP = 0.5   // metres per frame a root-motion clip may travel
// Body squash spring — omega ~16 rad/s, zeta ~0.65: one counter-bounce, settled
// in about 0.28 s. See _updatePresentation().
const SQUASH_K = 260
const SQUASH_C = 21
// Crossfade lengths. Neutral-to-neutral (idle <-> walk <-> crouch <-> block) can
// afford a longer blend and looks far better for it; anything that has to feel
// like a reaction keeps the animator's snappy 0.08 s default.
const NEUTRAL_FADE = 0.16
const _rootDelta = { x: 0, y: 0, z: 0 }

// ===========================================================================
// SHARED-RESOURCE SAFETY (GRAPHICS_CONTRACT §4, src/render/README.md §5)
//
// src/render/materials.js `pbr()` returns GLOBALLY CACHED materials, and those
// materials point at GLOBALLY CACHED textures from `surfaceMaps()`. Two fighters
// asking for the same grey get the SAME material object; ten fighters and every
// arena share the same `fur-short` normal map.
//
// Consequences this file must respect, forever:
//   * Mutating a cached material (emissive, color, opacity) mutates it for every
//     other mesh in every other scene. Punching one fighter would flash the
//     whole arena white.
//   * Disposing a cached material or a shared texture frees it for everyone.
//     The next scene renders black.
//
// So: claim a private, mutable instance before mutating (`claimMutableMaterial`)
// and never free anything you do not own (`safeDisposeMaterial`).
// ===========================================================================

// Resolved lazily and cached: the render layer's explicit copy-on-write helper,
// whichever name it ships under. Falls back to a local clone if none exists.
let _claimFn
function _resolveClaimFn() {
  if (_claimFn !== undefined) return _claimFn
  const names = [
    'mutableMaterial', 'claimMutableMaterial', 'claimMaterial', 'claimMutable',
    'uniqueMaterial', 'ensureUniqueMaterial', 'makeMutable', 'toUniqueMaterial',
    'unshareMaterial', 'instanceMaterial',
  ]
  _claimFn = null
  for (const n of names) {
    if (typeof RENDER[n] === 'function') { _claimFn = RENDER[n]; break }
  }
  return _claimFn
}

/** True if `mat` came out of the render layer's global cache. Never mutate one. */
function isSharedMat(mat) {
  if (!mat) return false
  if (typeof RENDER.isSharedMaterial === 'function') {
    try { if (RENDER.isSharedMaterial(mat)) return true } catch { /* fall through */ }
  }
  return !!(mat.userData && mat.userData.__wcsShared === true)
}

/** True if `tex` is a globally cached map (textures.js / env.js tag `__shared`). */
function isSharedTex(tex) {
  if (!tex || !tex.isTexture) return false
  if (typeof RENDER.isSharedTexture === 'function') {
    try { if (RENDER.isSharedTexture(tex)) return true } catch { /* fall through */ }
  }
  return !!(tex.userData && tex.userData.__shared === true)
}

// Material.copy() does JSON.parse(JSON.stringify(userData)) — a character that
// parks a non-serialisable value there would make clone() throw. Retry with a
// stripped userData rather than losing the fighter.
function _cloneMaterial(mat) {
  try { return mat.clone() } catch { /* userData is probably not JSON-safe */ }
  const saved = mat.userData
  try {
    mat.userData = {}
    const c = mat.clone()
    c.userData = {}
    return c
  } catch (e) {
    console.warn('[combat] could not clone material for mutation', mat?.name, e)
    return null
  } finally {
    mat.userData = saved
  }
}

/**
 * claimMutableMaterial(mat) -> a material this fighter may safely mutate.
 *
 * Already-unique materials (scoped factories, `{ unique: true }`, plain
 * hand-built Lambert/Standard) are returned untouched — no extra draw-call cost
 * and existing sharing INSIDE one fighter is preserved by the caller's dedupe
 * map, so WALLY's 40 grey parts still flash as one.
 * Returns null only if the material could not be claimed; callers must then
 * leave the material alone rather than mutate a shared one.
 */
function claimMutableMaterial(mat) {
  if (!mat) return null
  if (!isSharedMat(mat)) return mat
  const claim = _resolveClaimFn()
  if (claim) {
    try {
      const m = claim(mat)
      if (m && m.isMaterial && !isSharedMat(m)) return m
    } catch (e) { console.warn('[combat] render claim helper threw', e) }
  }
  const c = _cloneMaterial(mat)
  if (!c) return null
  // Textures are copied BY REFERENCE — correct, they stay shared and are never
  // ours to dispose. Only the material parameters become private.
  c.userData = c.userData || {}
  c.userData.__wcsShared = false
  delete c.userData.__wcsKey
  c.userData.__wcsClaimedFrom = mat.userData?.__wcsKey || mat.name || ''
  c.name = `${mat.name || 'mat'}#fighter`
  return c
}

/**
 * safeDisposeMaterial(mat) -> true if we actually freed it.
 * Refuses shared materials and never frees a shared texture. Prefers the render
 * layer's own walker when it is available.
 */
function safeDisposeMaterial(mat) {
  if (!mat) return false
  if (typeof RENDER.disposeMaterialSafely === 'function') {
    try { return !!RENDER.disposeMaterialSafely(mat) } catch { /* local path */ }
  }
  if (isSharedMat(mat)) return false
  for (const k of Object.keys(mat)) {
    const t = mat[k]
    if (t && t.isTexture && !isSharedTex(t)) { try { t.dispose() } catch { /* fine */ } }
  }
  try { mat.dispose() } catch { /* fine */ }
  return true
}

// ===========================================================================
// FIGHTER MATERIAL UPGRADE (GRAPHICS_CONTRACT §0.1 + §4, src/render/README §4)
//
// Nine of the ten character modules still build raw MeshLambertMaterial: no
// normal / roughness / AO map, no envMapIntensity, no IBL participation at all.
// Lambert cannot be lit the way the render layer lights everything else, so
// those nine read as flat 2002 plastic standing next to a converted fighter —
// and the roster is not even internally consistent, which is its own tell.
//
// The sanctioned bulk path is `upgradeMaterials()` (contract §4). Running it
// HERE — once, per fighter, at build time — converts the whole roster without
// editing ten files that ten other agents own, and it is IDEMPOTENT: as each
// character module adopts `pbr()` / `makeMaterialFactory()` with explicit
// `surface:` presets, this call quietly degrades to "enrich + verify" and then
// to a no-op for that fighter. It is a floor, not a substitute for per-character
// art direction: `mesh.userData.surface = 'fur-coarse'` in a character file
// beats every heuristic below (presetForMesh step 1).
//
// Opt out for one character with `def.skipMaterialUpgrade = true` (or
// `built.group.userData.skipMaterialUpgrade`) once that file's own conversion is
// complete and you want nothing second-guessing it.
// ===========================================================================

// Overrides on top of the ~230-entry DEFAULT_HINTS table, applied to fighters
// only. Most of these exist because of TRANSMISSION: 'shade' / 'lens' / 'visor'
// resolve to `glass` by default, and a transmissive material costs a whole extra
// scene render each (README §7). Ten pairs of sunglasses would end the frame
// budget on their own. A character agent who genuinely wants glass can still ask
// for it with `mesh.userData.surface = 'glass'`, which outranks every hint.
const FIGHTER_HINTS = {
  shade: 'plastic-gloss', shades: 'plastic-gloss', lens: 'plastic-gloss',
  visor: 'plastic-gloss', goggle: 'plastic-gloss', cornea: 'plastic-gloss',
  sunglass: 'plastic-gloss', window: 'plastic-gloss', bubble: 'plastic-gloss',
  // Vocabulary the roster actually uses for soft goods and bling.
  slipper: 'knit', fluffy: 'fur-long', hoodie: 'knit', beanie: 'knit',
  chain: 'gold', medallion: 'gold', bling: 'gold', mug: 'plastic-gloss',
}

// Per-character priors. A colour classifier cannot tell a pelt from a coat, but
// it does not have to: it only has to be right about the DOMINANT mass, which is
// species knowledge, not pixel knowledge. `pelt` is what a big neutral/brown
// surface is on this fighter, `green` is what green means on him (only ONE of
// them is an amphibian — COOL PAL's teal vest is a vest), `skin` is bare skin.
// A character file that disagrees overrides any of this with
// `mesh.userData.surface`, which outranks every heuristic.
const SPECIES = {
  'peepee':        { pelt: 'skin-wet', peltDark: 'skin-reptile', green: 'skin-wet', skin: 'skin-wet' },
  'fatty-pingo':   { pelt: 'feather', peltDark: 'feather' },
  'shibro':        { pelt: 'fur', peltDark: 'fur-dark' },
  'dogey':         { pelt: 'fur', peltDark: 'fur-dark' },
  'bonko':         { pelt: 'fur', peltDark: 'fur-dark' },
  'cool-pal':      { pelt: 'fur-coarse', peltDark: 'fur-dark' },
  'tired-ape':     { pelt: 'fur-coarse', peltDark: 'fur-dark' },
  'blackish-bull': { pelt: 'hide', peltDark: 'hide' },
  'crypto-punkd':  { pelt: 'cloth', peltDark: 'cloth' },
  'wally':         { pelt: 'hide', peltDark: 'hide' },
}
const SPECIES_FALLBACK = { pelt: 'hide', peltDark: 'hide', green: 'cloth', skin: 'skin' }

const _frgb = { r: 0, g: 0, b: 0 }
const _fbox = new THREE.Vector3()

// Rough world-ish size of a mesh, used only to separate "eye / button / tooth"
// from "torso". Cheap: bounding boxes are computed once, at build time.
function _meshSpan(mesh) {
  const g = mesh.geometry
  if (!g) return 1
  if (!g.boundingBox) { try { g.computeBoundingBox() } catch { return 1 } }
  if (!g.boundingBox) return 1
  g.boundingBox.getSize(_fbox)
  const s = mesh.scale
  return Math.max(_fbox.x * Math.abs(s.x), _fbox.y * Math.abs(s.y), _fbox.z * Math.abs(s.z))
}

/**
 * Colour -> surface preset, biased for CHARACTERS.
 *
 * materials.js ships `presetForColor()`, but it is tuned for arenas: it reads a
 * dark neutral as `rubber` and a mid grey as `concrete`, which is exactly wrong
 * on a bull's pelt. This is the same idea with an organic prior, and it is
 * consulted at presetForMesh step 5 — i.e. only after userData.surface, the
 * material name, the mesh name and the ancestor group names have all missed,
 * which is what happens today because character meshes are unnamed.
 *
 * Rules of the road (same as presetForColor): opaque, single-sided, no
 * transmission (`glass`/`ice`/`water`), no `foliage`, nothing emissive — those
 * must be opted into by name or userData, or half the roster starts blooming.
 */
function makeFighterSurfaceClassifier(id) {
  const p = { ...SPECIES_FALLBACK, ...(SPECIES[id] || {}) }
  return (color, mesh, mat) => fighterSurfaceForColor(color, mesh, mat, p)
}

function fighterSurfaceForColor(color, mesh, mat, p = SPECIES_FALLBACK) {
  if (!color || !color.getHSL) return null
  // Already glowing: the author built a visor, a ticker, a HUD panel or a rune.
  // Give it a smooth synthetic surface and leave the emission alone. NOT the
  // `emissive`/`neon-panel`/`screen` presets — those carry an `albedoScale` that
  // would re-darken an albedo their author already chose.
  if (mat && mat.emissive && mat.emissive.getHex() !== 0x000000) return 'plastic-gloss'
  // Classify in sRGB: the author picked 0x6b4a34 thinking in sRGB, and linear
  // components would drop every mid-tone into the "dark" bucket.
  try { color.getRGB(_frgb, THREE.SRGBColorSpace) } catch { _frgb.r = color.r; _frgb.g = color.g; _frgb.b = color.b }
  const r = _frgb.r, g = _frgb.g, b = _frgb.b
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) * 0.5
  // CHROMA, not HSL saturation, decides "is this a neutral". HSL saturation
  // explodes at the dark end — a penguin's 0x252c3a plumage scores s = 0.22 and
  // would be classified as denim, which is how you end up with a penguin in
  // jeans. Chroma 0.08 says what it is: a near-black with a blue cast.
  const chroma = max - min
  const s = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * l - 1) || 1)
  let h = 0
  if (chroma > 1e-6) {
    if (max === r) h = ((g - b) / chroma + (g < b ? 6 : 0))
    else if (max === g) h = (b - r) / chroma + 2
    else h = (r - g) / chroma + 4
    h *= 60
  }
  const span = _meshSpan(mesh)
  const tiny = span <= 0.12          // eyes, pupils, buttons, teeth, rivets

  // --- neutrals: greys are pelt and garment on a fighter, not concrete ------
  if (chroma < 0.10) {
    if (tiny) return 'plastic-gloss'   // pupil, sclera, rivet, button, lens
    // The black bull loses to this bucket or wins with it: a `hide`/`fur-dark`
    // normal + AO map is the only thing that gives a 0x101116 mass any form.
    if (l < 0.34) return p.peltDark
    // A light neutral with a COOL cast is brushed metal — armour plate, steel,
    // silver bling. A warm one is cream fur or bone. The ceiling matters: a
    // penguin belly (0xf2f6fa) is cooler than steel and much brighter than any
    // plate anyone paints.
    if (l >= 0.55 && l < 0.88 && h >= 170 && h <= 280) return 'metal'
    if (l < 0.88) return p.pelt
    // near-white: a small one is an eye or a tooth, a big one is belly or shirt
    return span < 0.25 ? 'bone' : p.pelt
  }

  // --- warm hues -----------------------------------------------------------
  if (h < 16 || h >= 345) return l < 0.34 ? 'leather' : 'cloth'   // reds: ties, tongues, trim
  if (h < 46) {                                                   // brown / tan / orange
    if (tiny) return 'horn'                                       // claws, beak tips, nails
    if (l < 0.30) return p.peltDark
    if (l < 0.58) return p.pelt                                   // ape pelt, shiba coat
    return p.skin                                                 // muzzle, palms, tan hide
  }
  if (h < 66) {                                                   // yellow -> gold
    if (s > 0.45 && l > 0.30 && l < 0.84) return 'gold'           // chains, grills, coins
    return l > 0.72 ? 'bone' : p.pelt
  }

  // --- cool hues -----------------------------------------------------------
  if (h < 170) return p.green                                     // frog, or a green vest
  if (h < 200) return 'plastic-gloss'                             // cyan / teal accents
  if (h < 255) {                                                  // blue
    if (l < 0.32) return 'denim'
    return l < 0.64 ? 'cloth' : 'plastic-gloss'
  }
  return l < 0.30 ? 'suit' : 'cloth'                              // violet / magenta / pink
}

const TAU = Math.PI * 2
function wrapAngle(a) {
  a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI
  return a
}

export class Fighter {
  constructor(match, slot, def, ctrl, costume = 0) {
    this.match = match
    this.game = match.game
    this.slot = slot
    this.ctrl = ctrl
    this.foe = null
    // §17: humans move CAMERA-RELATIVE (stick/WASD resolved through the camera
    // yaw). AI controls write WORLD-space intents (axis = world X desire,
    // axisY = world Z desire) and are never remapped. HumanControl is
    // duck-typed by its .input field so this file stays harness-safe.
    this.isHuman = !!(ctrl && ctrl.input)

    // Build model — fall back to the placeholder rig if the character module is
    // still a stub or its model fails to build.
    let useDef = def
    let built = null
    if (!defNeedsFallback(useDef)) {
      try { built = useDef.buildModel(costume) } catch (e) { console.warn(`[combat] buildModel(${def?.id}) threw`, e) }
    }
    if (!built?.group || !built?.bones?.hips) {
      useDef = makeFallbackDef(def || {})
      built = useDef.buildModel(costume)
    }
    this.def = useDef

    this.root = new THREE.Group()
    this.holder = new THREE.Group()
    this.holder.add(built.group)
    this.root.add(this.holder)
    this.bones = built.bones
    // invisible-body tripwire (v2.0): remember the visual root + the hips bind
    // pose so a desynced model can be snapped back onto the logical fighter.
    this._modelGroup = built.group
    this._modelBind = built.group.position.clone()
    this._hipsBind = built.bones.hips.position.clone()
    this._desyncWarned = false
    // Materials this fighter is allowed to mutate (flash / tint), their baseline
    // emissive, and the subset we created and therefore own at teardown.
    this.mats = []
    this._flashBase = []
    this._ownedMats = []
    // Impact flash, wall-clock driven (see the IMPACT FLASH block above).
    // -1 = no flash running; the renderer hook tests this and nothing else.
    this._flashT0 = -1
    this._flashMs = FLASH_MS_MIN
    this._flashHook = null
    // Order matters: upgrade first (it may REPLACE material objects), then claim
    // the mutable instances off the final ones. See _upgradeModelMaterials().
    this._upgradeModelMaterials()
    this._claimMutableMaterials()

    this.animator = new Animator(this.bones, this.def.clips, ANIM_OPTS)
    // animation-drive bookkeeping (see _updateAnimationDrive)
    this._animFrame = 0
    this._flinchFrame = -99
    this._secSynced = false
    this._ragdollWasActive = false
    this.pos = this.root.position
    this.vel = new THREE.Vector3()

    // §24 economy chokepoint (MAX HP): base 100 × GameConfig.balance.maxHpScale
    // × this slot's rules HP multiplier (story/arcade bulk curves send
    // rules.p2HpMult / rules.p1HpMult). Harness/stub matches without config or
    // rules fall back to plain 100.
    const bal = this.game?.config?.balance || {}
    const rules = match?.rules || {}
    const slotMult = slot === 1 ? rules.p2HpMult : rules.p1HpMult
    this.maxHp = Math.max(1, Math.round(100
      * (Number.isFinite(bal.maxHpScale) && bal.maxHpScale > 0 ? bal.maxHpScale : 1)
      * (Number.isFinite(slotMult) && slotMult > 0 ? slotMult : 1)))
    this.hp = this.maxHp
    this.meter = 0
    this.facing = 0        // yaw radians, 0 = +X (see header)
    this.facingSign = 1    // legacy ±1: toward the foe projected on world X
    this.state = 'idle'
    this.stateFrames = 0

    // combat bookkeeping
    this.currentMove = null
    this.moveFrame = 0
    this.hitDone = false
    this.contactMade = false
    this.chainDepth = 0
    this.scriptFx = null
    this.hitstunFrames = 0
    this.blockstunFrames = 0
    this.knockdownFrames = 0
    this.getupFrames = 0
    this.invuln = 0
    this.armorFrames = 0
    // Buff API (contract for character scripts): movement multiplies by speedMult,
    // outgoing damage by damageMult, outgoing knockback by knockbackMult.
    // All reset to 1 on round start and on full ragdoll / KO.
    this.speedMult = 1
    this.damageMult = 1
    this.knockbackMult = 1
    this.flashFrames = 0
    this.bounces = 0
    this.wallBounces = 0
    this.tumble = 0
    this.tumbleRate = 0
    this.dashDir = { x: 0, z: 0 }
    this.dashFrames = 0
    this._chainDrift = null
    this.lastTap = { left: -99, right: -99, fwd: -99, back: -99 }
    this.throwSeq = null
    this.wakeupMove = null
    this.ragdollFrames = 0
    // OTG (on-the-ground) bookkeeping: fallFrames counts fixed frames spent
    // down (ragdoll/knockdown) since the CURRENT fall started; otgHit latches
    // after the first OTG hit of a fall (hard anti-loop guard). Both reset at
    // every new fall start (forceRagdoll / trip landing), never mid-fall.
    this.fallFrames = 0
    this.otgHit = false
    this._consumed = new WeakSet()
    this._squash = 0
    this._squashVel = 0
    this._lean = 0
    this._mi = { mx: 0, mz: 0, len: 0 } // cached per-frame move intent (world XZ)

    // combo bookkeeping (this fighter as ATTACKER)
    this.comboHits = 0
    this.comboLastFrame = -999
    this.damageTakenThisRound = 0

    // -- comedic gore hooks (gore-gated in _onHitFx) --
    // MatchScreen builds the particle pool before any fighter exists, so it
    // can't hand it a game ref; we attach it here — which also makes the pool
    // re-read 'settings.gore' at every match start.
    try { match.particles?.attachGame?.(this.game) } catch { /* pool optional */ }
    this._headPulseFrames = 0
    this._headPulseSaved = null
    this._offHitFx = this.game.events?.on?.('fighter:hit', (e) => this._onHitFx(e)) || null
  }

  // ------------------------------------------------------------------ helpers

  grounded() { return this.pos.y <= 0.001 }
  isNeutral() { return NEUTRAL_STATES.has(this.state) }

  // §27: jump toggle — read LIVE from settings so flipping it mid-match works.
  // Applies to both humans and AI (a global rules toggle, not a handicap).
  _jumpEnabled() {
    try { return this.game.save?.get?.('settings.jumpEnabled', true) !== false } catch { return true }
  }

  // facing direction on the plane (yaw 0 = +X, see header)
  dirX() { return Math.cos(this.facing) }
  dirZ() { return -Math.sin(this.facing) }
  yawTo(x, z) { return Math.atan2(-(z - this.pos.z), x - this.pos.x) }
  // horizontal radius of the body for distance-based hit detection
  radius() { return Math.max(0.3, (this.def.height || 1.8) * 0.25) }

  // vertical extent (crouch/knockdown shrink it) for height-overlap tests
  heightSpan() {
    let h = this.def.height
    if (this.state === 'crouch' || (this.ctrl.isDown('crouch') && this.grounded() && this.state !== 'attack')) h *= 0.65
    if (this.state === 'knockdown') h *= 0.35
    return { y0: this.pos.y, y1: this.pos.y + h }
  }

  isInvulnerable() {
    if (this.invuln > 0) return true
    return this.state === 'knockdown' || this.state === 'getup' || this.state === 'grabbed' ||
      this.state === 'ragdoll' || this.state === 'ko' || this.state === 'win' ||
      this.state === 'lose' || this.state === 'finisher'
  }

  isBlockingAgainst(attacker) {
    if (this.state !== 'block' && this.state !== 'blockstun') return false
    if (!this.grounded()) return false
    // must be facing the attacker (within ~84° of the facing direction)
    const dx = attacker.pos.x - this.pos.x
    const dz = attacker.pos.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-4) return true
    return (dx * this.dirX() + dz * this.dirZ()) / d > 0.1
  }

  // Legacy entry point (TrainingMode, harnesses pass ±1; radians accepted too).
  setFacing(f) {
    if (f === 1) f = 0
    else if (f === -1) f = Math.PI
    this._setYaw(f)
    this.facingSign = Math.cos(this.facing) >= 0 ? 1 : -1
  }

  _setYaw(f) {
    this.facing = wrapAngle(Number.isFinite(f) ? f : 0)
    this.holder.rotation.y = this.facing
  }

  // shortest-arc yaw step toward a target angle
  _turnToward(target, maxStep) {
    const d = wrapAngle(target - this.facing)
    this._setYaw(this.facing + Math.max(-maxStep, Math.min(maxStep, d)))
  }

  playClip(name, opts) { this.animator.play(name, opts) }

  /**
   * Playback rate that makes the walk cycle cover the ground the body actually
   * covers. The clips were authored so that one cycle at 1x equals one cycle at
   * `def.walkSpeed`, so the stride-matched rate is simply the speed ratio.
   * This is the cheap half of the anti-skate fix (the foot IK stance lock is
   * the other half) and it is by far the more visible of the two: legs that
   * cycle at a fixed rate while the body accelerates is THE amateur tell.
   */
  _strideScale() {
    const base = (this.def.walkSpeed || 4) || 4
    const sp = Math.hypot(this.vel.x, this.vel.z)
    // Also feeds the damage-limp cadence.
    return this.animator.setLocomotion(sp, base * (this.animator.clip?.duration || 1))
  }

  setState(s) {
    if (this.state === s) return
    const prev = this.state
    this.state = s
    this.stateFrames = 0
    const CLIP_FOR = {
      idle: 'idle', walk: 'walk', dash: 'walk', backdash: 'walk', jump: 'jump',
      crouch: 'crouch', block: 'block', blockstun: 'block', launched: 'launched',
      knockdown: 'knockdown', getup: 'getup', grabbed: 'hitHeavy',
      win: 'win', lose: 'lose',
    }
    const clip = CLIP_FOR[s]
    if (!clip || !this.animator.has(clip)) return
    // Drifting between the neutral loops gets a longer blend — 5 frames is a
    // visible cut when both poses are held, and neither pose is a reaction.
    const soft = NEUTRAL_STATES.has(prev) && NEUTRAL_STATES.has(s) &&
      s !== 'jump' && prev !== 'jump'
    this.animator.play(clip, {
      restart: s === 'getup' || s === 'jump',
      fade: soft ? NEUTRAL_FADE : undefined,
    })
  }

  // Legacy x-band hurtbox — kept for the headless harnesses and any v1-shaped
  // tooling. The live match uses distance+cone+heightSpan (MatchScreen §17).
  hurtbox() {
    const w = 0.5 * (this.def.height / 2)
    let h = this.def.height
    if (this.state === 'crouch' || this.ctrl.isDown('crouch') && this.grounded() && this.state !== 'attack') h *= 0.65
    if (this.state === 'knockdown') h *= 0.35
    return { x0: this.pos.x - w, x1: this.pos.x + w, y0: this.pos.y, y1: this.pos.y + h }
  }

  // The move currently in its active window (non-grab, unscripted, unspent).
  // Geometry lives in MatchScreen's cone test — this is just the timing gate.
  activeAttack() {
    const m = this.currentMove
    if (!m || this.state !== 'attack' || this.scriptFx || this.hitDone) return null
    if (m.kind === 'grab') return null
    if (this.moveFrame < m.startup || this.moveFrame >= m.startup + m.active) return null
    return m
  }

  // Legacy AABB view of the active hitbox (x-lane projection via facingSign) —
  // kept for the headless harnesses; the live match uses activeAttack().
  activeHitbox() {
    const m = this.activeAttack()
    if (!m) return null
    const hb = m.hitbox || { w: 1, h: 0.8, d: 1, forward: 1, up: 1.2 }
    const cx = this.pos.x + this.facingSign * (hb.forward ?? 1)
    const cy = this.pos.y + (hb.up ?? 1.2)
    return { x0: cx - hb.w / 2, x1: cx + hb.w / 2, y0: cy - hb.h / 2, y1: cy + hb.h / 2, move: m }
  }

  grabActive() {
    const m = this.currentMove
    if (!m || m.kind !== 'grab' || this.state !== 'attack' || this.throwSeq || this.hitDone) return false
    return this.moveFrame >= m.startup && this.moveFrame < m.startup + m.active
  }

  setHp(v) {
    // §24 economy chokepoint (DAMAGE): every hp DROP during live play scales by
    // GameConfig.balance.damageScale. All damage funnels through setHp — clean
    // hits, chip, armor absorbs, throws, script hits, items, arena hazards —
    // so nothing bypasses the knob. Gated to the live 'fight' phase: heals
    // never scale (drop test), and intentional zeroing (onKO/executions,
    // phase 'ko'/'finisher') and round resets pass through exactly. The scaled
    // drop is rounded so integral damage keeps hp integral (min drop stays 1).
    if (v < this.hp && this.match?.phase === 'fight') {
      const ds = this.game?.config?.balance?.damageScale
      if (Number.isFinite(ds) && ds > 0 && ds !== 1) {
        const drop = this.hp - v
        const scaled = drop >= 1 ? Math.max(1, Math.round(drop * ds)) : drop * ds
        v = this.hp - scaled
      }
    }
    const nv = Math.max(0, Math.min(this.maxHp, v))
    if (nv === this.hp) return
    const drop = this.hp - nv
    this.hp = nv
    this.game.events.emit('health', { slot: this.slot, value: this.hp, max: this.maxHp })
    // §15 (v1.1): report EVERY hp loss to the match so the gore system sees
    // hazard damage too (arenas call setHp directly). Attributed hits mark the
    // frame first, so this fallback never double-fires. Optional + guarded —
    // headless harness and stub matches have no onHpLoss.
    if (drop > 0) { try { this.match.onHpLoss?.(this, drop) } catch { /* gore optional */ } }
  }

  gainMeter(v) {
    const nv = Math.max(0, Math.min(100, this.meter + v))
    if (Math.round(nv) === Math.round(this.meter)) { this.meter = nv; return }
    this.meter = nv
    this.game.events.emit('meter', { slot: this.slot, value: Math.round(this.meter) })
  }

  // Squash is an IMPULSE: it sets the displacement and clears the spring's
  // velocity, so a second hit re-strikes the pose instead of compounding into
  // whatever the previous bounce was already doing.
  squash(amt) { this._squash = amt; this._squashVel = 0 }

  clearBuffs() {
    this.speedMult = 1
    this.damageMult = 1
    this.knockbackMult = 1
  }

  /**
   * Bulk-convert this fighter's legacy materials to the render layer.
   * See the FIGHTER MATERIAL UPGRADE block at the top of this file for why this
   * lives here. Must run BEFORE _claimMutableMaterials(): the claim pass has to
   * see the final material objects, or flash() would mutate the pre-upgrade ones
   * that nothing renders any more.
   *
   * Safety properties this relies on (materials.js §9):
   *   * sharing topology inside the model is preserved EXACTLY — meshes that
   *     shared a material still share one, so WALLY's 40 grey parts stay one
   *     material and still flash as one.
   *   * the global pbr() cache is never touched; a cached material found on a
   *     mesh is split copy-on-write instead of being restyled in place.
   *   * MeshBasicMaterial is left alone (crypto-punkd's unlit props are a
   *     deliberate look).
   *   * idempotent — a material already tagged is skipped.
   */
  _upgradeModelMaterials() {
    if (typeof RENDER.upgradeMaterials !== 'function') return null
    if (this.def?.skipMaterialUpgrade === true) return null
    if (this._modelGroup?.userData?.skipMaterialUpgrade === true) return null
    // Headless (AI harness, node tests): no renderer will ever see these meshes,
    // and surfaceMaps() would burn seconds of CPU generating noise fields for
    // textures nobody samples.
    if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null

    let stats = null
    try {
      stats = RENDER.upgradeMaterials(this.root, {
        hints: FIGHTER_HINTS,
        byColor: makeFighterSurfaceClassifier(this.def?.id),
        // castShadow/receiveShadow defaults (true) are wanted: the walk also
        // opts see-through materials out of shadow casting, which the blanket
        // `castShadow = true` in _claimMutableMaterials() never did.
        envMapIntensity: 1,
        // flatShading is deliberately NOT forced here — see the post-pass below.
      })
    } catch (e) {
      console.warn(`[combat] material upgrade failed for ${this.def?.id}`, e)
      return null
    }

    // Post-pass, two jobs:
    //  1. flatShading. render/README §6: converting a character's `lamb()` turns
    //     it OFF — faceting is supposed to come from bevelled geometry now
    //     (contract §0.4), not from flat normals on a 10-segment cylinder. Only
    //     materials this walk just built from a LEGACY material (`__wcsFrom`)
    //     are touched; anything a character agent authored through the render
    //     layer keeps whatever it asked for. Per-material escape hatch:
    //     `mat.userData.keepFlatShading = true`.
    //  2. ownership. Materials the walk created are private to this fighter, so
    //     they must be freed at teardown even if Gore.js detaches the mesh that
    //     carried them first. safeDisposeMaterial() still refuses anything that
    //     turns out to be shared.
    const seen = new Set()
    this.root.traverse((o) => {
      if (!o.isMesh) return
      const list = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of list) {
        if (!m || seen.has(m)) continue
        seen.add(m)
        const ud = m.userData || {}
        const mine = ud.__wcsFrom !== undefined || ud.__wcsSplitByUpgrade === true
        if (!mine) continue
        if (m.flatShading && ud.keepFlatShading !== true) {
          m.flatShading = false
          m.needsUpdate = true
        }
        if (!isSharedMat(m) && !this._ownedMats.includes(m)) this._ownedMats.push(m)
      }
    })
    return stats
  }

  /**
   * Walk the model once, at build time, and guarantee that every material this
   * fighter will ever mutate is PRIVATE to this fighter.
   *
   * Why here and not at flash() time: Gore.js clones bone subtrees for severed
   * limbs and those clones share material references with us (Gore.js:256-268).
   * Swapping materials after a limb has been cloned would desync the flash;
   * swapping before construction finishes means every downstream clone inherits
   * the already-claimed instance. Nothing else in the codebase holds a reference
   * to a fighter's meshes before its constructor returns.
   *
   * `seen` maps original -> claimed, so meshes that shared a material BEFORE
   * still share it AFTER: WALLY's 40 grey parts stay one material and flash as
   * one, exactly as the Lambert build did. We never inflate the material count.
   */
  _claimMutableMaterials() {
    const seen = new Map()
    const claim = (m) => {
      if (!m) return m
      if (seen.has(m)) return seen.get(m)
      const c = claimMutableMaterial(m)
      const out = c || m
      seen.set(m, out)
      if (c && c !== m) this._ownedMats.push(c)
      return out
    }
    this.root.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      if (Array.isArray(o.material)) {
        for (let i = 0; i < o.material.length; i++) {
          const m = o.material[i]
          if (!m || !m.emissive) continue          // only flashable slots are claimed
          const c = claim(m)
          if (c !== m) o.material[i] = c
        }
      } else if (o.material && o.material.emissive) {
        const c = claim(o.material)
        if (c !== o.material) o.material = c
      }
    })
    for (const m of seen.values()) {
      // A material we could not claim stays SHARED — leave it out of this.mats
      // so no mutation path can ever touch it.
      if (!m || !m.emissive || isSharedMat(m)) continue
      if (this.mats.includes(m)) continue
      this.mats.push(m)
      const ei = Number.isFinite(m.emissiveIntensity) ? m.emissiveIntensity : 1
      // Albedo luma in the working (linear) space, perceptually re-weighted.
      // This is the number that decides how much flash a surface is allowed:
      // dark hide takes almost all of it, a bright skull almost none, and the
      // form of the body survives the impact.
      const c = m.color
      const lin = c ? Math.min(1, Math.max(0,
        0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b)) : 0.35
      this._flashBase.push({
        m,
        hex: m.emissive.getHex(),
        intensity: ei,
        // Baseline emissive PRE-MULTIPLIED by its intensity, so the flash can
        // be added on top with intensity pinned at 1 without an emitter losing
        // its glow or blowing the bloom threshold.
        er: m.emissive.r * ei, eg: m.emissive.g * ei, eb: m.emissive.b * ei,
        lum: Math.sqrt(lin),
        cr: c ? c.r : 0.35, cg: c ? c.g : 0.35, cb: c ? c.b : 0.35,
        // peak flash radiance for the current flash(), filled in by flash()
        fr: 0, fg: 0, fb: 0,
      })
    }
    // Render-cadence hook: hit-stop freezes update(), so the decay cannot live
    // there. Any one flashable mesh reaching the renderer is enough, and the
    // tick is a single compare when no flash is running.
    const tick = () => { if (this._flashT0 >= 0) this._flashTick() }
    this._flashHook = tick
    this.root.traverse((o) => { if (o.isMesh) o.onBeforeRender = tick })
  }

  /**
   * Victim impact flash. Same signature as v3.3 (`hex` picks the flavour —
   * amber for an armour absorb, see MatchScreen — and `frames` is still the
   * requested hold), but see the IMPACT FLASH block at the top of this file:
   * the pop is now albedo-weighted, capped at FLASH_PEAK and decayed off the
   * wall clock so hit-stop cannot hold it.
   *
   * Every material in this.mats was claimed as a private instance in the
   * constructor, so this is a local mutation — see _claimMutableMaterials().
   */
  flash(hex = 0xffffff, frames = 2) {
    _flashTint.setHex(hex)
    const tr = _flashTint.r, tg = _flashTint.g, tb = _flashTint.b
    for (const b of this._flashBase) {
      // Bright surfaces take a THIRD of the flash a dark one does. That single
      // term is what keeps a silhouette: the pop is now proportional to how
      // much headroom the surface has, so nothing is driven to a flat ceiling.
      const amt = FLASH_PEAK * (0.34 + 0.66 * (1 - b.lum))
      const k = FLASH_TINT_MIX
      b.fr = (b.cr * (1 - k) + tr * k) * amt
      b.fg = (b.cg * (1 - k) + tg * k) * amt
      b.fb = (b.cb * (1 - k) + tb * k) * amt
    }
    const req = Math.max(1, Number.isFinite(frames) ? frames : 2) * (1000 / 60)
    this._flashMs = Math.min(FLASH_MS_MAX, Math.max(FLASH_MS_MIN, req))
    this._flashT0 = _now()
    this.flashFrames = Math.max(1, Math.round(this._flashMs / (1000 / 60)))
    this._flashTick()
  }

  /**
   * Advance the flash against the WALL CLOCK. Idempotent and allocation-free,
   * so it is safe to call from the renderer hook, from update(), or from both
   * in the same frame — which is the point: whichever clock is still running
   * during hit-stop retires the flash on schedule.
   */
  _flashTick() {
    const t0 = this._flashT0
    if (!(t0 >= 0)) return
    const u = (_now() - t0) / this._flashMs
    if (!(u < 1)) { this._unflash(); return }
    // Fast attack, long tail: the eye reads the leading edge and the tail is
    // what stops it looking like a dropped frame.
    const g = 1 - u
    const k = g * g * (0.35 + 0.65 * g)
    for (const b of this._flashBase) {
      b.m.emissive.setRGB(b.er + b.fr * k, b.eg + b.fg * k, b.eb + b.fb * k)
      b.m.emissiveIntensity = 1
    }
  }

  // Restore the ORIGINAL emissive, not black: characters legitimately ship
  // emissive materials (glowing eyes, gold marks, UNCHAINED cracks) and the old
  // `setHex(0x000000)` killed them permanently on the first hit taken.
  _unflash() {
    this._flashT0 = -1
    this.flashFrames = 0
    for (const b of this._flashBase) {
      b.m.emissive.setHex(b.hex)
      b.m.emissiveIntensity = b.intensity
    }
  }

  // Public alias for anything OUTSIDE this class that tints `fighter.mats` and
  // needs to put it back (e.g. fatty-pingo's freezeTint). Use this instead of
  // `m.emissive.setHex(0x000000)` — black is not the baseline for a fighter
  // whose character module ships emissive materials.
  restoreEmissive() { this._unflash() }

  // Heavy counter hits knock teeth loose ('cartoon'/'max' gore) and squash the
  // victim's head for a beat. Fired off the 'fighter:hit' event so it sees the
  // real counter flag; the scale pulse lands during hit-stop (updates frozen,
  // renders not), so it reads clearly, then restores 2 fixed frames after.
  _onHitFx(e) {
    if (!e || e.slot !== this.slot) return
    // Every hit flinches, including the ones that never reach enterHitstun
    // (armor absorbs, chip on block, script hits that drive the clip directly).
    // The one-per-frame latch in _flinch() keeps this from doubling up with the
    // reaction path, which fires on the same frame.
    this._flinch(e.dirX ?? -this.facingSign, e.dirZ ?? 0,
      Math.min(0.6, 0.11 + (e.damage ?? 0) * 0.028))
    if (!e.counter) return
    const atkMove = this.foe?.def?.moves?.find?.((m) => m.id === e.move)
    const heavy = (e.damage ?? 0) >= 10 || (atkMove && HEAVY_KINDS.has(atkMove.kind))
    if (!heavy) return
    const gore = this.game.save?.get?.('settings.gore', 'cartoon') ?? 'cartoon'
    if (gore === 'none') return
    let pos
    const head = this.bones.head
    if (head) {
      head.getWorldPosition(_headPos)
      pos = { x: _headPos.x, y: _headPos.y + 0.05, z: _headPos.z }
    } else {
      pos = { x: this.pos.x, y: this.pos.y + (this.def.height || 1.8) * 0.85, z: this.pos.z }
    }
    try {
      this.match.particles?.burst?.('teeth', pos, { dirX: e.dirX || -this.facingSign, n: gore === 'max' ? 8 : 5 })
    } catch { /* particle pool optional (headless harness) */ }
    this._headPulseStart()
  }

  // One-beat comedic eye-squash on the head bone. Restore-safe: exact scale is
  // saved and put back; skipped entirely if a script owns head scale (i.e. the
  // bone is not at identity scale when we arrive).
  _headPulseStart() {
    const head = this.bones.head
    if (!head) return
    const s = head.scale
    if (this._headPulseSaved == null &&
      (Math.abs(s.x - 1) > 0.01 || Math.abs(s.y - 1) > 0.01 || Math.abs(s.z - 1) > 0.01)) return
    if (this._headPulseSaved == null) this._headPulseSaved = { x: s.x, y: s.y, z: s.z }
    const b = this._headPulseSaved
    head.scale.set(b.x * 1.32, b.y * 0.62, b.z * 1.32)
    this._headPulseFrames = 2
  }

  _headPulseRestore() {
    this._headPulseFrames = 0
    if (this._headPulseSaved) {
      const b = this._headPulseSaved
      this.bones.head?.scale.set(b.x, b.y, b.z)
      this._headPulseSaved = null
    }
  }

  // reset(x, face, z): face keeps the v1 ±1 contract (TrainingMode, harnesses),
  // any other number is a yaw in radians; z is the new spawn depth (default 0).
  reset(x, face, z = 0) {
    this.pos.set(x, 0, z)
    this.vel.set(0, 0, 0)
    this.setHp(this.maxHp)
    this.state = 'idle'
    this.stateFrames = 0
    this.currentMove = null
    this.scriptFx = null
    this.throwSeq = null
    this.wakeupMove = null
    this.hitstunFrames = this.blockstunFrames = this.knockdownFrames = this.getupFrames = 0
    this.invuln = 0
    this.armorFrames = 0
    this.clearBuffs()
    this.bounces = this.wallBounces = 0
    this.tumble = 0
    this.tumbleRate = 0
    this.dashFrames = 0
    this.comboHits = 0
    this.chainDepth = 0
    this._chainDrift = null
    this.ragdollFrames = 0
    this.fallFrames = 0
    this.otgHit = false
    this.damageTakenThisRound = 0
    this._squash = 0
    this._squashVel = 0
    this._lean = 0
    this.holder.rotation.z = 0
    this._unflash()
    this.flashFrames = 0
    this._headPulseRestore()
    this.holder.position.set(0, 0, 0)
    this.holder.scale.set(1, 1, 1)
    this._modelGroup.position.copy(this._modelBind)
    this.setFacing(face)
    this.holder.rotation.set(0, this.facing, 0)
    this.animator.play('idle', { restart: true })
    // A round reset is a teleport: every spring, the flinch and the look-at
    // must start from zero or the first frame of the new round inherits the
    // last frame of the old one.
    this.animator.resetSecondary()
    this.animator.setLayerWeight('breathe', 1, true)
    this.animator.setLayerWeight('lookAt', 0, true)
    this.animator.setLayerWeight('sway', SWAY_WEIGHT.idle, true)
    this.animator.clearAttack()
    this.animator.setLimp(0)
    this._ragdollWasActive = false
    this._flinchFrame = -99
    this.gainMeter(0)
  }

  // ---------------------------------------------------------------- input

  // Camera yaw for camera-relative controls. Duck-typed off the match camera:
  // cam.getYaw() returns the view direction's XZ HEADING — forward =
  // (cos yaw, sin yaw) in world (x, z), per CameraController's documented
  // contract. Movement math below wants THREE rotation.y convention
  // (0 = looking down -Z, CCW positive), so convert: three = -(heading + π/2).
  // Sanity: heading -π/2 (view looks down -Z) -> three 0 -> W walks -Z. Missing
  // camera/method falls back to 0 (plain world axes: A/D = ±X, W = -Z).
  _camYaw() {
    try {
      const y = this.match.cam?.getYaw?.()
      if (Number.isFinite(y)) return -(y + Math.PI / 2)
    } catch { /* camera optional (harness) */ }
    return 0
  }

  // Per-frame movement intent in WORLD XZ. Humans: stick/WASD resolved through
  // the camera yaw (strafe = actions left/right, depth = fwd/back). AI: axis()
  // is already world X desire and axisY() world Z desire — no remap.
  _moveIntent() {
    const ax = this.ctrl.axis ? this.ctrl.axis() : 0
    const az = this.ctrl.axisY ? this.ctrl.axisY() : 0
    let mx, mz
    if (this.isHuman) {
      const cy = this._camYaw()
      const c = Math.cos(cy), s = Math.sin(cy)
      mx = ax * c - az * s
      mz = -ax * s - az * c
    } else {
      mx = ax
      mz = az
    }
    let len = Math.hypot(mx, mz)
    if (len > 1) { mx /= len; mz /= len; len = 1 }
    return { mx, mz, len }
  }

  // unit vector toward the foe expressed in the player's INPUT axes
  // (ix = strafe component, iz = depth component)
  _towardFoeInput() {
    if (!this.foe) return { ix: this.facingSign, iz: 0 }
    let dx = this.foe.pos.x - this.pos.x
    let dz = this.foe.pos.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-4) { dx /= d; dz /= d }
    const cy = this.isHuman ? this._camYaw() : 0
    const c = Math.cos(cy), s = Math.sin(cy)
    return { ix: dx * c - dz * s, iz: -dx * s - dz * c }
  }

  // Move-input direction tokens (§17): 'forward' ALWAYS means toward the foe.
  // AI keeps the v1 world-X resolution (it holds 'left'/'right' actions through
  // queueMove); humans are judged by where their resolved move vector points.
  dirHeld(d) {
    if (d === 'down') return this.ctrl.isDown('crouch')
    if (d === 'up') return this.ctrl.isDown('jump')
    if (d !== 'forward' && d !== 'back') return true
    if (!this.isHuman) {
      const towardIsRight = this.facingSign > 0
      const wantRight = (d === 'forward') === towardIsRight
      return this.ctrl.isDown(wantRight ? 'right' : 'left')
    }
    const mi = this._mi
    if (mi.len < 0.3) return false
    let tx, tz
    if (this.foe) {
      let dx = this.foe.pos.x - this.pos.x, dz = this.foe.pos.z - this.pos.z
      const dd = Math.hypot(dx, dz)
      if (dd < 1e-4) return false
      tx = dx / dd; tz = dz / dd
    } else {
      tx = this.dirX(); tz = this.dirZ()
    }
    const dot = (mi.mx * tx + mi.mz * tz) / mi.len
    return d === 'forward' ? dot > 0.45 : dot < -0.45
  }

  // Buffer action name a direction records as when freshly pressed (the input
  // buffer keeps direction edges alongside buttons — see InputManager).
  // Must stay consistent with dirHeld: for humans, 'forward' maps to whichever
  // physical direction action currently points most toward the foe.
  dirTapAction(d) {
    if (d === 'down') return 'crouch'
    if (d === 'up') return 'jump'
    if (d !== 'forward' && d !== 'back') return null
    if (!this.isHuman) {
      const towardIsRight = this.facingSign > 0
      return (d === 'forward') === towardIsRight ? 'right' : 'left'
    }
    const t = this._towardFoeInput()
    const s = d === 'forward' ? 1 : -1
    const ix = t.ix * s, iz = t.iz * s
    return Math.abs(ix) >= Math.abs(iz) ? (ix >= 0 ? 'right' : 'left') : (iz >= 0 ? 'fwd' : 'back')
  }

  // Count distinct fresh presses of a direction in the buffer within `window`
  // frames ending at `endFrame` (the button press that anchors the sequence).
  _countDirTaps(action, endFrame, window = TAP_WINDOW) {
    const buf = this.ctrl.buffer()
    let n = 0
    for (let i = buf.length - 1; i >= 0; i--) {
      const e = buf[i]
      if (e.frame > endFrame) continue
      if (e.frame < endFrame - window) break
      if (e.action === action) n++
    }
    return n
  }

  // 8-frame input buffer scan (CONTRACTS.md §5). The final (button) element must
  // be a fresh unconsumed press. A direction listed ONCE is a held command input
  // (down+heavy). A direction REPEATED (the ↓↓+Light joke moves) is a tap
  // sequence: it needs that many distinct fresh presses of the direction within
  // ~20 frames of the button press — merely holding crouch never counts, so
  // crouching jabs stay crouching jabs.
  findMove(allowedKinds = null) {
    const buf = this.ctrl.buffer()
    const now = this.ctrl.frameNum()
    let best = null, bestScore = -1, bestEntry = null
    for (const move of this.def.moves) {
      if (allowedKinds && !allowedKinds.includes(move.kind)) continue
      if ((move.meterCost || 0) > this.meter) continue
      const seq = move.input || []
      const button = seq[seq.length - 1]
      if (!button || !BUTTONS.has(button)) continue
      let entry = null
      for (let i = buf.length - 1; i >= 0; i--) {
        const e = buf[i]
        if (e.frame < now - 8) break
        if (e.action === button && !this._consumed.has(e)) { entry = e; break }
      }
      if (!entry) continue
      const dirs = seq.slice(0, -1)
      const counts = {}
      for (const d of dirs) counts[d] = (counts[d] || 0) + 1
      let dirsOk = true
      for (const d in counts) {
        if (counts[d] > 1) {
          const action = this.dirTapAction(d)
          if (!action || this._countDirTaps(action, entry.frame) < counts[d]) { dirsOk = false; break }
        } else if (!this.dirHeld(d)) { dirsOk = false; break }
      }
      if (!dirsOk) continue
      const score = (move.meterCost || 0) + dirs.length * 8 + (KIND_PRIORITY[move.kind] || 0)
      if (score > bestScore) { best = move; bestScore = score; bestEntry = entry }
    }
    if (best && bestEntry) this._consumed.add(bestEntry)
    return best
  }

  startMove(move) {
    this.currentMove = move
    this.moveFrame = 0
    this.hitDone = false
    this.contactMade = false
    this.state = 'attack'
    this.stateFrames = 0
    this.armorFrames = move.armor || 0
    this._chainDrift = null
    if (move.meterCost) {
      this.gainMeter(-move.meterCost)
      this.match.cap(move.name ? move.name.toUpperCase() + '!' : 'SUPER!')
    }
    // supers announce themselves: fullscreen flash, sim frozen like hit-stop
    if (move.kind === 'super') { try { this.match.superFlash?.(this, move) } catch { /* presentation only */ } }
    const total = Math.max(1, (move.startup || 0) + (move.active || 0) + (move.recovery || 0))
    if (move.clip && this.animator.has(move.clip)) this.animator.playFitted(move.clip, total / 60)
    else this.animator.play('idle')
    // ---- put a body behind the arm --------------------------------------
    // A critic caught the attacker one frame after contact with "torso
    // perfectly square to camera, hips at zero rotation, both feet flat and
    // parallel — a puppet arm swing off a static body". This is the fix, and
    // it is deliberately NOT authored per move: the torque layer coils the
    // pelvis against the swing through startup, drives it through the active
    // window, overshoots and settles, using this move's own frame data. Ten
    // character files get weight without one of them being edited, and none of
    // it can move a hitbox (hits resolve off fighter distance/facing/height).
    // `move.lead` (+1 / -1) is honoured if a character ever authors it;
    // otherwise the lead limb is read off the clip's own tracks.
    this.animator.attackDrive(
      (move.startup || 0) / 60, (move.active || 0) / 60, (move.recovery || 0) / 60,
      move.kind, move.lead, move.kind === 'super' ? 1.15 : 1)
    this.game.audio.sfx('whoosh', { pitch: move.kind === 'light' ? 1.3 : 0.9 })
    // little forward lunge for chunky commitment — along the facing direction
    if (this.grounded() && move.kind !== 'grab') {
      const lunge = { light: 1.2, heavy: 2.4, kick: 2.0, launcher: 1.4, special: 2.0, super: 2.4, joke: 0.5, grab: 0 }[move.kind] ?? 1
      this.vel.x = this.dirX() * lunge
      this.vel.z = this.dirZ() * lunge
      // Chain-cancelled follow-ups home during startup: pushback from the hit
      // that was cancelled must never make the advertised light→heavy string
      // whiff, so the follow-up drifts toward the foe until its hitbox reaches
      // (capped at CHAIN_DRIFT_MAX total). Scripted moves steer themselves.
      if (this.chainDepth > 0 && this.foe && typeof move.script !== 'function') {
        const hb = move.hitbox || {}
        const reach = Math.max(0.6, (hb.forward ?? 1) + (hb.w ?? 1) * 0.5)
        this._chainDrift = { reach, moved: 0 }
      }
    }
    if (typeof move.script === 'function') {
      this.scriptFx = this.match.makeFx(this, () => { if (this.state === 'attack') this.endMove() })
      try { move.script(this.scriptFx) } catch (e) {
        console.error('[combat] move script threw', e)
        this.scriptFx.end()
      }
    }
  }

  endMove() {
    // Relax the attack torque rather than dropping it: a cancelled or
    // interrupted move should ring down through neutral, not snap square.
    this.animator.releaseAttack()
    this.currentMove = null
    this.scriptFx = null
    this.throwSeq = null
    this.chainDepth = 0
    this._chainDrift = null
    if (this.grounded()) this.setState('idle')
    else { this.setState('jump'); this.animator.play('fall') }
  }

  // ---------------------------------------------------------------- update

  update(dt, allowControl) {
    this.stateFrames++
    // OTG clock: fixed frames spent down since the current fall started
    if (this.state === 'ragdoll' || this.state === 'knockdown') this.fallFrames++
    if (this.invuln > 0) this.invuln--
    if (this.armorFrames > 0) this.armorFrames--
    // Backstop only. The flash is retired by the wall clock in _flashTick(),
    // driven from the renderer hook so hit-stop cannot hold it; this keeps a
    // headless run (harness, no renderer) from leaving a fighter lit up.
    if (this._flashT0 >= 0) this._flashTick()
    if (this._headPulseFrames > 0 && --this._headPulseFrames === 0) this._headPulseRestore()

    // cache the resolved move intent once per frame (movement + dirHeld share it)
    this._mi = this._moveIntent()
    // legacy ±1 facing: toward the foe, projected on world X (hysteresis when
    // the pair is z-aligned so scripts never see it flap)
    if (this.foe) {
      const fdx = this.foe.pos.x - this.pos.x
      if (Math.abs(fdx) > 0.05) this.facingSign = fdx >= 0 ? 1 : -1
    }

    switch (this.state) {
      case 'idle': case 'walk': case 'crouch': case 'block':
        this._updateNeutral(dt, allowControl); break
      case 'dash': case 'backdash':
        this._updateDash(dt, allowControl); break
      case 'jump':
        this._updateAir(dt, allowControl); break
      case 'attack':
        this._updateAttack(dt, allowControl); break
      case 'hitstun':
        this._updateHitstun(dt); break
      case 'blockstun':
        this._updateBlockstun(dt); break
      case 'launched':
        this._updateLaunched(dt); break
      case 'knockdown':
        this._updateKnockdown(allowControl); break
      case 'getup':
        this._updateGetup(); break
      case 'grabbed':
      case 'ragdoll':
      case 'finisher':
        break
      case 'ko': case 'win': case 'lose':
        this.vel.x *= 0.8
        this.vel.z *= 0.8
        this._integrate(dt)
        break
      default:
        this._updateNeutral(dt, allowControl)
    }

    if (this.throwSeq) this._updateThrow()

    // §17 soft lock-on: smooth-yaw toward the foe when attacking or in range;
    // free movement outside lock range faces the direction of travel.
    this._updateFacing(dt)

    this._clampBounds()

    if (this.state !== 'ragdoll') {
      this._updateAnimationDrive(dt)
      this.animator.update(dt)
      this._applyRootMotion()
    } else {
      // RagdollManager owns every bone now. Remember it, so the spring state is
      // dumped on the way back out instead of resuming with a frame of
      // physics-scale velocity in it.
      this._ragdollWasActive = true
    }
    this._updatePresentation(dt)
    this._integrityCheck()
  }

  // ------------------------------------------------------- animation drive
  // Everything the v3.3 Animator needs from the game, pushed once per frame,
  // before the pose is evaluated. All of it is scalar — no allocation, no
  // world-matrix work on this side.

  _updateAnimationDrive(dt) {
    this._animFrame++
    const a = this.animator
    if (!this._secSynced) { this._secSynced = true; this._syncSecondaryOwnership() }
    if (this._ragdollWasActive) {
      this._ragdollWasActive = false
      a.resetSecondary()
    }

    // Spring drive: body velocity (differenced to acceleration inside) + facing.
    a.setBodyMotion(this.vel.x, this.vel.y, this.vel.z, this.facing, dt)
    // Ground plane relative to the fighter root. Arenas are flat (floorY 0), so
    // this is just the jump height; an arena that grows a heightfield only has
    // to feed a real sample in here.
    a.setGroundDelta(-this.pos.y, this.grounded())
    a.setIKEnabled(IK_STATES.has(this.state) && this.grounded() && !this.scriptFx)
    // Locomotion cadence (also drives the limp's hitch). _strideScale() feeds
    // this while walking or dashing; everywhere else the cycle has stopped.
    if (this.state !== 'walk' && this.state !== 'dash' && this.state !== 'backdash') {
      a.setLocomotion(0, 1)
    }

    // ---- look-at: head, neck and eyes track the opponent -----------------
    const lw = LOOK_WEIGHT[this.state] || 0
    const foe = this.foe
    if (lw > 0 && foe) {
      const dx = foe.pos.x - this.pos.x
      const dz = foe.pos.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > 0.25) {
        const eyeY = this.pos.y + (this.def.height || 1.8) * 0.86
        const tgtY = foe.pos.y + (foe.def?.height || 1.8) * 0.80
        // Yaw relative to our own facing — the soft lock-on already turns the
        // body, so this is only the residual the neck has to make up.
        a.setLookAt(wrapAngle(this.yawTo(foe.pos.x, foe.pos.z) - this.facing),
          Math.atan2(tgtY - eyeY, d), lw)
      } else a.setLayerWeight('lookAt', 0)
    } else a.setLayerWeight('lookAt', 0)

    // ---- breathing: deeper and faster the closer to a KO -----------------
    const hpF = this.maxHp > 0 ? this.hp / this.maxHp : 1
    const winded = 1 - Math.min(1, hpF / 0.6)
    const br = a.layer?.breathe
    if (br) {
      br.rate = 0.58 + winded * 0.62
      br.amp = 1 + winded * 1.15
    }
    a.setLayerWeight('breathe', BREATHE_WEIGHT[this.state] || 0)

    // ---- idle weight shift ----------------------------------------------
    // The most-seen animation in the product is the neutral stance, and it was
    // measured as "legs vertical and together, no knee bend, no weight-shift
    // bob". This is the shift; the foot IK converts the hip drop that comes
    // with it into knee bend, so the coil is real rather than a pose offset.
    // Suppressed on the ground only, and never while the torque layer owns the
    // pelvis for an attack.
    const swayOk = this.grounded() && !this.scriptFx
    a.setLayerWeight('sway', swayOk ? (SWAY_WEIGHT[this.state] || 0) : 0)
    const swy = a.layer?.sway
    if (swy) {
      // Winded fighters shift their weight faster and further — the same
      // health term that deepens the breathing.
      swy.rate = (Math.PI * 2 / 3.4) * (1 + winded * 0.45)
      swy.amp = 1 + winded * 0.35
    }

    // ---- damage limp: only on your own two feet, only when hurt ----------
    const hurt = hpF < LOW_HP_LIMP && this.grounded() &&
      (this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || this.state === 'block')
    a.setLimp(hurt ? Math.min(1, (LOW_HP_LIMP - hpF) / LOW_HP_LIMP) * 0.85 : 0,
      this.slot === 1 ? -1 : 1)
  }

  /**
   * Hand the accessory bones' X/Z swing to RagdollManager when one is present.
   * Duck-typed on build(): the real manager has it, the headless harness stub
   * (full/partial/recover/isSettled) does not, so the harness and any menu-side
   * consumer keep the animator's own springs at full authority.
   */
  _syncSecondaryOwnership() {
    const rag = this.match?.ragdolls
    if (typeof rag?.build !== 'function') return
    // Forward compatibility: if RagdollManager ever grows a way to stand its
    // accessory springs down, take it — the animator's per-family tuning
    // (an ear is not a cape is not a belly) beats one global k/c for every
    // non-core bone. Until then, hand it the swing and keep the rest.
    if (typeof rag.setAccessorySprings === 'function') {
      try { if (rag.setAccessorySprings(this, false) !== false) return } catch { /* fall through */ }
    }
    const excl = []
    for (const n of Object.keys(this.bones)) if (!RAGDOLL_CORE_BONES.has(n)) excl.push(n)
    if (excl.length) this.animator.setSecondaryExcluded(excl)
  }

  /**
   * Root motion (clips flagged `root:true`). The animator extracts the hips'
   * XZ travel and parks the bone back at its rest position; we turn that
   * body-local delta into world travel. Clamped, grounded-only, and re-bounded,
   * so a runaway clip can never launch a fighter through a wall or trip the
   * model-desync guard.
   */
  _applyRootMotion() {
    if (!this.animator.clip?.root) return
    this.animator.consumeRootMotion(_rootDelta)
    const lx = Math.max(-ROOT_MOTION_CLAMP, Math.min(ROOT_MOTION_CLAMP, _rootDelta.x))
    const lz = Math.max(-ROOT_MOTION_CLAMP, Math.min(ROOT_MOTION_CLAMP, _rootDelta.z))
    if (lx === 0 && lz === 0) return
    if (!this.grounded()) return
    const c = Math.cos(this.facing), s = Math.sin(this.facing)
    this.pos.x += lx * c + lz * s
    this.pos.z += -lx * s + lz * c
    this._clampBounds()
  }

  /**
   * Impact flinch. (dirX, dirZ) is the WORLD direction the force travels; the
   * additive flinch layer plays it over whatever the body is already doing, and
   * it whips the secondary-motion springs on the way through.
   * Latched to one flinch per frame so the reaction path and the 'fighter:hit'
   * event path cannot double up on the same hit.
   */
  _flinch(dirX, dirZ, power) {
    if (this._flinchFrame === this._animFrame) return
    this._flinchFrame = this._animFrame
    const c = Math.cos(this.facing), s = Math.sin(this.facing)
    let fx = dirX * c - dirZ * s
    let fz = dirX * s + dirZ * c
    const n = Math.hypot(fx, fz)
    if (n > 1e-4) { fx /= n; fz /= n } else { fx = -1; fz = 0 }
    this.animator.flinch(fx, fz, power)
  }

  _updateFacing(dt) {
    if (!this.foe) return
    let target = null
    let rate = 0
    if (this.state === 'attack' && !this.scriptFx) {
      // attacks track the foe, slower — redirects reads as commitment, not aimbot
      target = this.yawTo(this.foe.pos.x, this.foe.pos.z)
      rate = 6
    } else if (LOCK_STATES.has(this.state)) {
      const dist = Math.hypot(this.foe.pos.x - this.pos.x, this.foe.pos.z - this.pos.z)
      if (dist <= LOCK_RANGE) {
        target = this.yawTo(this.foe.pos.x, this.foe.pos.z)
        rate = 12
      } else {
        const sp = Math.hypot(this.vel.x, this.vel.z)
        if (sp > 0.8) {
          target = Math.atan2(-this.vel.z, this.vel.x)
          rate = 10
        }
      }
    }
    if (target != null) this._turnToward(target, rate * dt)
  }

  // Invisible-body tripwire + self-heal (v2.0 mandate): if the visual model
  // drifts >4m from the logical fighter outside ragdoll/finisher/grab (where
  // physics or scripts legitimately own the visual), snap it back and warn
  // once per match. Also NaN-heals the logical position itself.
  _integrityCheck() {
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) {
      this.pos.set(0, 0, 0)
      this.vel.set(0, 0, 0)
    }
    if (GUARD_EXEMPT.has(this.state)) return
    const g = this._modelGroup
    if (!g) return
    // check BOTH the model group and the hips bone: a failed ragdoll recovery
    // typically leaves the bones stranded while the group still tracks root.
    g.getWorldPosition(_guardPos)
    let d2 = _guardPos.distanceToSquared(this.pos)
    if (Number.isFinite(d2) && d2 <= 16 && this.bones.hips) {
      this.bones.hips.getWorldPosition(_guardPos)
      const hd2 = _guardPos.distanceToSquared(this.pos)
      if (!Number.isFinite(hd2) || hd2 > d2) d2 = hd2
    }
    if (Number.isFinite(d2) && d2 <= 16) return
    g.position.copy(this._modelBind)
    this.holder.position.set(0, 0, 0)
    g.visible = true
    this.root.visible = true
    if (this.bones.hips && this._hipsBind) this.bones.hips.position.copy(this._hipsBind)
    if (!this._desyncWarned) {
      this._desyncWarned = true
      console.warn(`[combat] fighter ${this.slot} model desynced from body (${Math.sqrt(Math.max(0, d2)).toFixed(1)}m) — snapped back`)
    }
  }

  _updatePresentation(dt) {
    // ---- squash & stretch: a real damped spring, not an exponential decay --
    // v3.2 pulled the squash back to zero with `+= (0 - s) * dt * 14`, which is
    // a first-order decay: it can only ever approach rest from one side. A body
    // that compresses and then simply stops compressing has no weight. This is
    // a second-order spring (omega ~16 rad/s, zeta ~0.65), so a landing squashes,
    // stretches back through neutral by about a tenth of the input, and settles
    // in ~0.28 s. Same squash() API, same input amplitudes, one counter-bounce.
    this._squashVel += (-SQUASH_K * this._squash - SQUASH_C * this._squashVel) * dt
    this._squash += this._squashVel * dt
    if (Math.abs(this._squash) < 1e-4 && Math.abs(this._squashVel) < 1e-3) {
      this._squash = 0
      this._squashVel = 0
    }
    const s = Math.max(-0.6, Math.min(0.6, this._squash))
    this.holder.scale.set(1 + s * 0.55, 1 - s, 1 + s * 0.55)

    // ---- roll: tumble while launched, speed lean while moving -------------
    // These two share holder.rotation.z, and v3.2 left it stranded: leaving a
    // walk with tumble already at 0 ran NEITHER branch, so the last frame's
    // lean (up to ~3 degrees) stayed baked into the model until the next walk
    // or knockdown. Both channels now resolve into one smoothed value that
    // always returns to zero.
    if (this.state === 'launched') {
      this.tumble += this.tumbleRate * dt
      this._lean = this.tumble
      this.holder.rotation.z = this._lean
      return
    }
    if (this.tumble !== 0 && this.state !== 'ragdoll') {
      this.tumble *= 0.75
      if (Math.abs(this.tumble) < 0.03) this.tumble = 0
      this._lean = this.tumble
      this.holder.rotation.z = this._lean
      return
    }
    let target = 0
    if (this.state === 'walk' || this.state === 'dash' || this.state === 'backdash') {
      // forward speed tips the body in — eased, so it banks rather than snaps
      target = -(this.vel.x * this.dirX() + this.vel.z * this.dirZ()) * 0.012
    }
    this._lean += (target - this._lean) * Math.min(1, dt * 11)
    if (Math.abs(this._lean) < 1e-4) this._lean = 0
    this.holder.rotation.z = this._lean
  }

  _integrate(dt) {
    if (!this.grounded() || this.vel.y > 0) this.vel.y += GRAVITY * dt
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    this.pos.z += this.vel.z * dt
    if (this.pos.y <= 0) {
      const wasAir = this.pos.y < -0.0001 || this.vel.y < -0.01
      this.pos.y = 0
      const impact = -this.vel.y
      this.vel.y = 0
      return wasAir && impact > 1 ? impact : 0
    }
    return 0
  }

  _clampBounds() {
    const b = this.match.bounds || {}
    const pad = 0.35
    const minX = (b.minX ?? -9) + pad, maxX = (b.maxX ?? 9) - pad
    const minZ = (b.minZ ?? -5.5) + pad, maxZ = (b.maxZ ?? 5.5) - pad
    if (this.pos.x < minX) this.pos.x = minX
    else if (this.pos.x > maxX) this.pos.x = maxX
    if (this.pos.z < minZ) this.pos.z = minZ
    else if (this.pos.z > maxZ) this.pos.z = maxZ
  }

  _updateNeutral(dt, allow) {
    if (!allow) {
      this.vel.x = 0
      this.vel.z = 0
      if (this.state !== 'idle' && this.state !== 'walk') this.setState('idle')
      return
    }
    const mi = this._mi

    // attacks first (so down+button works out of crouch); blocking locks attacks out
    if (this.state !== 'block') {
      const move = this.findMove()
      if (move) { this.startMove(move); return }
    }

    // jump (§27: settings.jumpEnabled=false ignores jump input — read live)
    if (this.state !== 'block' && this.ctrl.pressed('jump') && this._jumpEnabled()) {
      const js = (this.def.walkSpeed || 4) * 1.15 * this.speedMult
      this.vel.y = this.def.jumpVel || 8
      this.vel.x = mi.mx * js
      this.vel.z = mi.mz * js
      this.setState('jump')
      this.squash(-0.22)
      this.game.audio.sfx('boing', { vol: 0.3, pitch: 1.4 })
      return
    }

    // dash detection: double-tap or AI intent
    const dashVec = this._detectDash()
    if (dashVec) {
      let toward = 1
      if (this.foe) {
        const dx = this.foe.pos.x - this.pos.x, dz = this.foe.pos.z - this.pos.z
        const dd = Math.hypot(dx, dz)
        if (dd > 1e-4) toward = (dashVec.x * dx + dashVec.z * dz) / dd
      }
      const forward = toward >= 0
      this.dashDir = dashVec
      this.dashFrames = forward ? 14 : 10
      this.setState(forward ? 'dash' : 'backdash')
      if (!forward) this.invuln = Math.max(this.invuln, 8)
      this.squash(0.12)
      this.game.audio.sfx('slide', { vol: 0.4 })
      return
    }

    // block / crouch / walk
    if (this.ctrl.isDown('block')) {
      this.vel.x = 0
      this.vel.z = 0
      this.setState('block')
      return
    }
    if (this.ctrl.isDown('crouch')) {
      this.vel.x = 0
      this.vel.z = 0
      this.setState('crouch')
      return
    }
    const ws = (this.def.walkSpeed || 4) * this.speedMult
    this.vel.x = mi.mx * ws
    this.vel.z = mi.mz * ws
    this.setState(mi.len > 0.05 ? 'walk' : 'idle')
    if (this.state === 'walk') {
      // backpedaling (moving against the facing) plays the walk in reverse
      const fdot = mi.len > 0 ? (mi.mx * this.dirX() + mi.mz * this.dirZ()) / mi.len : 1
      this.animator.play('walk', { speed: (fdot < -0.2 ? -0.8 : 1) * this._strideScale() })
    }
    this._integrate(dt)
  }

  // returns a WORLD-space unit-ish dash vector, or null.
  // AI dashes: prefer the v2 full-XZ intent (wantsDashVec), falling back to
  // the v1 ±1 world-X scalar. Humans double-tap any of the four movement
  // actions and dash camera-relative in that direction.
  _detectDash() {
    const aiVec = this.ctrl.wantsDashVec?.()
    if (aiVec && (aiVec.x || aiVec.z)) {
      const n = Math.hypot(aiVec.x || 0, aiVec.z || 0) || 1
      return { x: (aiVec.x || 0) / n, z: (aiVec.z || 0) / n }
    }
    const ai = this.ctrl.wantsDash?.()
    if (ai) return { x: Math.sign(ai), z: 0 }
    const now = this.ctrl.frameNum()
    for (const a of ['left', 'right', 'fwd', 'back']) {
      if (this.ctrl.pressed(a)) {
        if (now - this.lastTap[a] <= 12) {
          this.lastTap[a] = -99
          return this._dashVec(a)
        }
        this.lastTap[a] = now
      }
    }
    return null
  }

  _dashVec(action) {
    const [ax, az] = action === 'left' ? [-1, 0] : action === 'right' ? [1, 0] : action === 'fwd' ? [0, 1] : [0, -1]
    const cy = this.isHuman ? this._camYaw() : 0
    const c = Math.cos(cy), s = Math.sin(cy)
    return { x: ax * c - az * s, z: -ax * s - az * c }
  }

  _updateDash(dt, allow) {
    this.dashFrames--
    const speed = (this.def.dashSpeed || 8) * (this.state === 'backdash' ? 0.85 : 1) * this.speedMult
    const ease = Math.min(1, this.dashFrames / 6 + 0.4)
    this.vel.x = this.dashDir.x * speed * ease
    this.vel.z = this.dashDir.z * speed * ease
    // dash reuses the walk clip (CLIP_FOR); run it at the ground speed or the
    // legs cycle at a walk while the body travels at a dash — the classic skate
    if (this.animator.clipName === 'walk') {
      this.animator.play('walk', { speed: (this.state === 'backdash' ? -1 : 1) * this._strideScale() })
    }
    this._integrate(dt)
    if (allow) {
      const move = this.findMove()
      if (move) { this.startMove(move); return }
      if (this.ctrl.pressed('jump') && this.state === 'dash' && this._jumpEnabled()) {
        this.vel.y = this.def.jumpVel || 8
        this.setState('jump')
        this.squash(-0.2)
        return
      }
    }
    if (this.dashFrames <= 0) { this.vel.x = 0; this.vel.z = 0; this.setState('idle') }
  }

  _updateAir(dt, allow) {
    if (allow) {
      // partial air control on the plane
      const mi = this._mi
      const acc = (this.def.walkSpeed || 4) * 0.06 * this.speedMult
      this.vel.x += mi.mx * acc
      this.vel.z += mi.mz * acc
      const hs = Math.hypot(this.vel.x, this.vel.z)
      if (hs > 9) { this.vel.x *= 9 / hs; this.vel.z *= 9 / hs }
      const move = this.findMove(AIR_KINDS)
      if (move) { this.startMove(move); return }
    }
    if (this.vel.y < 0 && this.animator.clipName !== 'fall' && this.animator.has('fall')) this.animator.play('fall')
    this._integrate(dt)
    if (this.pos.y <= 0 && this.vel.y <= 0 && this.stateFrames > 2) {
      this.vel.x = 0
      this.vel.z = 0
      this.setState('idle')
      this.squash(0.18)
      this.game.audio.sfx('thud', { vol: 0.25, pitch: 1.5 })
    }
  }

  _updateAttack(dt, allow) {
    this.moveFrame++
    const m = this.currentMove
    if (!m) { this.endMove(); return }

    if (this.scriptFx) {
      // scripted special: fx drives everything; safety net at 600 frames
      if (this.moveFrame > 600 && !this.scriptFx.done) this.scriptFx.end()
      this.vel.x *= 0.86
      this.vel.z *= 0.86
      this._integrate(dt)
      return
    }

    const total = (m.startup || 0) + (m.active || 0) + (m.recovery || 0)
    this.vel.x *= 0.86
    this.vel.z *= 0.86
    // chained follow-up homing: close the gap the previous hit's pushback
    // opened, only while grounded and only until the hitbox can connect
    if (this._chainDrift && this.grounded() && this.foe &&
        this.moveFrame <= (m.startup || 0) + (m.active || 0)) {
      const cd = this._chainDrift
      const dx = this.foe.pos.x - this.pos.x
      const dz = this.foe.pos.z - this.pos.z
      const gap = Math.hypot(dx, dz)
      if (gap > cd.reach) {
        const step = Math.min(gap - cd.reach, CHAIN_DRIFT_SPEED * dt, CHAIN_DRIFT_MAX - cd.moved)
        if (step > 0 && gap > 1e-4) {
          this.pos.x += (dx / gap) * step
          this.pos.z += (dz / gap) * step
          cd.moved += step
        }
        if (cd.moved >= CHAIN_DRIFT_MAX) this._chainDrift = null
      }
    }
    const impact = this._integrate(dt)

    // air attack landing cancels into brief landing recovery
    if (impact > 0.5) { this.endMove(); this.squash(0.15); return }

    // chain / special cancels once contact was made
    if (allow && this.contactMade && this.moveFrame >= (m.startup || 0)) {
      const cancels = CANCEL_TABLE[m.kind] || []
      if (cancels.length && this.chainDepth < 4) {
        const next = this.findMove(cancels)
        // Same-move LIGHT rekka chains are legal (v2.0 P1): single-light
        // rosters (Wally, Crypto Punk'd) must be able to land the advertised
        // light-light-light string — the contactMade gate + chainDepth cap
        // still bound it. Non-light kinds keep the next !== m exclusion.
        if (next && (next !== m || next.kind === 'light')) {
          this.chainDepth++
          this.startMove(next)
          return
        }
      }
    }

    if (this.moveFrame >= total) this.endMove()
  }

  _updateHitstun(dt) {
    this.hitstunFrames--
    this.vel.x *= 0.85
    this.vel.z *= 0.85
    this._integrate(dt)
    if (this.hitstunFrames <= 0) {
      if (this.grounded()) this.setState('idle')
      else { this.setState('jump'); this.animator.play('fall') }
    }
  }

  _updateBlockstun(dt) {
    this.blockstunFrames--
    this.vel.x *= 0.8
    this.vel.z *= 0.8
    this._integrate(dt)
    if (this.blockstunFrames <= 0) {
      this.setState(this.ctrl.isDown('block') ? 'block' : 'idle')
    }
  }

  _updateLaunched(dt) {
    this.vel.y += JUGGLE_GRAVITY * dt
    this.vel.x *= 0.995
    this.vel.z *= 0.995
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    this.pos.z += this.vel.z * dt

    // wall bounce — all four walls (§17)
    const b = this.match.bounds || {}
    const pad = 0.35
    const walls = [
      { axis: 'x', min: (b.minX ?? -9) + pad, max: (b.maxX ?? 9) - pad },
      { axis: 'z', min: (b.minZ ?? -5.5) + pad, max: (b.maxZ ?? 5.5) - pad },
    ]
    for (const w of walls) {
      const p = this.pos[w.axis]
      const v = this.vel[w.axis]
      if (!((p <= w.min && v < 0) || (p >= w.max && v > 0))) continue
      this.pos[w.axis] = Math.max(w.min, Math.min(w.max, p))
      if (Math.abs(v) > 4 && this.wallBounces < 2) {
        this.vel[w.axis] = -v * (b.wallBounce ?? 0.5)
        this.vel.y = Math.max(this.vel.y, 3)
        this.wallBounces++
        this.game.events.emit('camera:shake', { mag: 0.5 })
        this.game.audio.sfx('thud')
        this.match.particles.burst('sparks', { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z })
        this.squash(0.3)
      } else {
        this.vel[w.axis] = 0
      }
    }

    // floor: ground bounce once, then knockdown
    if (this.pos.y <= 0 && this.vel.y < 0) {
      const impact = -this.vel.y
      this.pos.y = 0
      if (impact > 7.5 && this.bounces < 1) {
        this.bounces++
        this.vel.y = impact * (0.35 + (this.match.presetCfg?.bounce ?? 0.3) * 0.5)
        this.vel.x *= 0.75
        this.vel.z *= 0.75
        this.game.events.emit('camera:shake', { mag: 0.45 })
        this.game.audio.sfx('thud')
        this.match.particles.burst('impact', { x: this.pos.x, y: 0.2, z: this.pos.z })
        this.squash(0.35)
      } else {
        this.vel.set(0, 0, 0)
        this.tumbleRate = 0
        this.holder.rotation.z = 0
        this.tumble = 0
        this.knockdownFrames = KNOCKDOWN_TRIP_FRAMES
        this.fallFrames = 0 // a landing knockdown is a fresh fall (OTG clock)
        this.otgHit = false
        this.setState('knockdown')
        this.game.audio.sfx('thud', { vol: 0.6, pitch: 0.8 })
        this.match.particles.burst('smoke', { x: this.pos.x, y: 0.25, z: this.pos.z })
        this.squash(0.3)
      }
    }
  }

  _updateKnockdown(allow) {
    this.knockdownFrames--
    this.invuln = Math.max(this.invuln, 2)
    // wake-up attack buffering during the tail of the knockdown
    if (allow && this.knockdownFrames < 15 && !this.wakeupMove) {
      const m = this.findMove(['light', 'heavy', 'kick', 'launcher', 'special'])
      if (m) this.wakeupMove = m
    }
    if (this.knockdownFrames <= 0) this.enterGetup()
  }

  // Getup entry — shared by the normal wake-up (invuln 24, unchanged) and the
  // OTG forced getup (45, MatchScreen). The getup clip plays FITTED to the
  // shortened state (slightly faster, readability-clamped); snap=true hard-cuts
  // the crossfade when the caller knows the current bone pose is a stale
  // ragdoll snapshot re-expressed across a root teleport.
  enterGetup(invulnFrames = GETUP_INVULN, snap = false) {
    this.knockdownFrames = 0
    this.getupFrames = GETUP_FRAMES
    this.invuln = Math.max(this.invuln, invulnFrames)
    this.state = 'getup'
    this.stateFrames = 0
    if (this.animator.has('getup')) {
      const dur = this.def.clips?.getup?.duration
      const speed = Number.isFinite(dur) && dur > 0
        ? Math.min(GETUP_MAX_CLIP_SPEED, Math.max(1, dur / (GETUP_FRAMES / 60)))
        : 1.4
      this.animator.play('getup', { restart: true, snap, speed })
    }
  }

  _updateGetup() {
    this.getupFrames--
    if (this.getupFrames <= 0) {
      this.setState('idle')
      if (this.wakeupMove) {
        const m = this.wakeupMove
        this.wakeupMove = null
        this.invuln = 10 // wake-up attack window with brief invuln
        this.startMove(m)
      }
    }
  }

  _updateThrow() {
    const s = this.throwSeq
    if (!s) return
    s.t++
    const foe = s.foe
    if (foe.state !== 'grabbed') { this.throwSeq = null; return }
    foe.pos.x = this.pos.x + this.dirX() * 0.85
    foe.pos.z = this.pos.z + this.dirZ() * 0.85
    foe.pos.y = Math.min(1, s.t / 16) * 0.8
    // A grab started at the wall would otherwise hold the victim OUTSIDE the
    // arena bounds (inside wall geometry) for the whole 22-frame sequence —
    // the grabbed state never runs its own clamp.
    foe._clampBounds()
    if (s.t >= 22) {
      this.throwSeq = null
      this.match.finishThrow(this, foe, s.move)
    }
  }

  // ------------------------------------------------------------- reactions
  // (called by MatchScreen during hit resolution — kbx/kbz are world-space)

  enterHitstun(frames, heavy, kbx, kbz = 0) {
    // Getting hit out of a swing kills the drive but not the momentum: the
    // torque rings down under the reaction instead of vanishing on the frame.
    this.animator.releaseAttack()
    this.currentMove = null
    this.scriptFx = null
    this.hitstunFrames = frames
    this.state = 'hitstun'
    this.stateFrames = 0
    this.vel.x = kbx
    this.vel.z = kbz
    this.animator.play(heavy ? 'hitHeavy' : 'hitLight', { restart: true })
    this._flinch(kbx, kbz, heavy ? 0.52 : 0.26)
    this.squash(heavy ? 0.3 : 0.18)
    this.flash()
  }

  enterBlockstun(frames, kbx, kbz = 0) {
    this.blockstunFrames = frames
    this.state = 'blockstun'
    this.stateFrames = 0
    this.vel.x = kbx
    this.vel.z = kbz
    this.animator.play('block')
    // A blocked hit still shudders the guard — smaller, and it never reads as
    // a hit reaction because the flinch mask leaves the legs and hips alone.
    this._flinch(kbx, kbz, 0.13)
    this.squash(0.08)
  }

  // If this fighter is interrupted mid-throw (script hit, hazard, ragdoll),
  // free the victim — a grabbed foe whose thrower vanished would otherwise
  // stay 'grabbed' forever (soft-lock).
  releaseGrabVictim() {
    const foe = this.throwSeq?.foe
    this.throwSeq = null
    if (foe && foe.state === 'grabbed') {
      foe.pos.y = 0
      foe.vel.set(0, 0, 0)
      foe.setState('idle')
      foe.invuln = Math.max(foe.invuln, 6)
    }
  }

  enterLaunched(vx, vy, spin, vz = 0) {
    this.currentMove = null
    this.scriptFx = null
    this.releaseGrabVictim()
    this.state = 'launched'
    this.stateFrames = 0
    this.vel.x = vx
    this.vel.y = vy
    this.vel.z = vz
    this.bounces = 0
    this.wallBounces = 0
    this.tumbleRate = -Math.sign(vx || this.facingSign) * (2 + Math.abs(spin || 0) * 3)
    this.animator.play('launched', { restart: true })
    this._flinch(vx, vz, 0.7)
    this.squash(0.25)
    this.flash()
  }

  // =========================================================================
  // READ THIS BEFORE YOU TOUCH THE DISPOSE PATH — character agents, this means
  // you.
  //
  // THE SHARED-CACHE RULE
  // `pbr()` / `makeMaterialFactory()` hand back materials from a cache, and
  // `surfaceMaps()` hands back textures from a GLOBAL cache that every fighter,
  // every arena and every menu scene shares. A `fur-short` normal map built for
  // DOGEY is the same GPU object SHIBRO, the museum arena and the roster screen
  // are using.
  //
  // Therefore, in this method:
  //   * NEVER call a bare `material.dispose()` in a loop. Use
  //     safeDisposeMaterial(), which refuses globally shared materials.
  //   * NEVER loop over map slots (`map`, `normalMap`, `roughnessMap`, `aoMap`,
  //     `envMap`, …) and dispose them. The first fighter torn down would free
  //     the shared cache and every other scene in the game turns black —
  //     including scenes that are not even loaded yet, because the cache hands
  //     out disposed textures afterwards.
  //   * A fighter only owns: its geometry, the materials its character module
  //     built privately (scoped factory / `{ unique: true }` / raw `new
  //     THREE.Mesh*Material`), and the copy-on-write instances this class
  //     claimed in _claimMutableMaterials(). Nothing else.
  //   * Character modules that use a scoped factory should ALSO be torn down by
  //     their own `M.dispose()`; a scoped material reaching us here is already
  //     `unique`, so safeDisposeMaterial() frees it and the double-dispose is a
  //     no-op in three.js.
  //
  // If you need a per-fighter mutable material, do not clone it by hand here —
  // ask for it with `{ unique: true }` at build time, or route it through
  // claimMutableMaterial() at the top of this file.
  // =========================================================================
  dispose(scene) {
    this._offHitFx?.()
    this._offHitFx = null
    this._headPulseRestore()
    this._unflash()
    // Drop the render-cadence flash hook: Gore.js keeps severed-limb clones
    // alive past our teardown and they inherit onBeforeRender from the mesh
    // they were cloned from. (_flashT0 is -1 by now so the hook is already
    // inert; this stops it retaining the fighter.)
    if (this._flashHook) {
      this.root.traverse((o) => { if (o.isMesh && o.onBeforeRender === this._flashHook) o.onBeforeRender = () => {} })
      this._flashHook = null
    }
    scene?.remove?.(this.root)
    const done = new Set()
    this.root.traverse((o) => {
      if (!o.isMesh) return
      // Geometry can be shared too (instanced props, cached limb geometry): the
      // same `__shared` tag guards it.
      const g = o.geometry
      if (g && !done.has(g) && !(g.userData && g.userData.__shared)) {
        done.add(g)
        try { g.dispose() } catch { /* fine */ }
      }
      const list = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of list) {
        if (!m || done.has(m)) continue
        done.add(m)
        safeDisposeMaterial(m)
      }
    })
    // Claimed copy-on-write instances are ours even if the mesh that carried
    // them was detached (Gore.js severed limbs) before teardown.
    for (const m of this._ownedMats) {
      if (done.has(m)) continue
      done.add(m)
      safeDisposeMaterial(m)
    }
    this._ownedMats.length = 0
    this.mats.length = 0
    this._flashBase.length = 0
  }
}
